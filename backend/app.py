"""
Criclysis live analysis API.

A small Flask service that answers one question: given a player (and optionally
a live match), what does their game look like right now, where are they
vulnerable, and how would you bowl at them?

It combines three things:

  1. Live match state from CricketData (cricapi.com) — what is happening now.
  2. Historical ball-by-ball splits from the Criclysis dataset — how this player
     has actually performed against each bowling type, phase and situation
     across thousands of deliveries. This is optional but it is the difference
     between analysis and guesswork: see `load_grounding`.
  3. Google Gemini, which is asked to *synthesise* those two into a read on
     playing style, weaknesses and tactics — constrained to a fixed JSON schema
     so the response shape is guaranteed rather than parsed out of prose.

Design notes that matter in production:

  * Every outbound call is cached with a TTL. The free CricketData tier is
    ~100 requests/day, so an uncached endpoint would exhaust the quota in
    minutes under any real traffic.
  * Nothing raises to the caller. Each stage degrades independently: no live
    data still gives you historical analysis, no Gemini key still gives you the
    computed splits, and a total failure returns clearly-labelled fallback data
    with `"degraded": true` rather than a 500.
  * API keys are read from the environment and never returned in a response.
"""
from __future__ import annotations

import json
import logging
import os
import re
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import requests
from flask import Flask, jsonify, request
from flask_cors import CORS

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=LOG_LEVEL,
    format="%(asctime)s %(levelname)-7s %(name)s %(message)s",
)
log = logging.getLogger("criclysis")

CRICKETDATA_API_KEY = os.environ.get("CRICKETDATA_API_KEY", "").strip()
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()

# gemini-2.5-flash is the default; gemini-1.5-flash also works. Kept in an env
# var so a model change is a Render setting, not a redeploy of source.
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash").strip()

CRICKETDATA_BASE = os.environ.get(
    "CRICKETDATA_BASE", "https://api.cricapi.com/v1").rstrip("/")

# Where the Criclysis static dataset lives, if this service is deployed
# alongside it. Unset simply disables historical grounding.
DATA_DIR = Path(os.environ.get("CRICLYSIS_DATA_DIR", "../web/data")).expanduser()

# Comma-separated list of allowed origins, or "*" for any.
ALLOWED_ORIGINS = [o.strip() for o in
                   os.environ.get("ALLOWED_ORIGINS", "*").split(",") if o.strip()]

CACHE_TTL_LIVE = int(os.environ.get("CACHE_TTL_LIVE", "60"))        # seconds
CACHE_TTL_ANALYSIS = int(os.environ.get("CACHE_TTL_ANALYSIS", "300"))
HTTP_TIMEOUT = int(os.environ.get("HTTP_TIMEOUT", "12"))
RATE_LIMIT_PER_MIN = int(os.environ.get("RATE_LIMIT_PER_MIN", "30"))

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": ALLOWED_ORIGINS}})


# ---------------------------------------------------------------------------
# A tiny TTL cache
# ---------------------------------------------------------------------------
class TTLCache:
    """Thread-safe in-memory cache.

    Deliberately in-process: this service is a single small dyno and a Redis
    dependency would be more operational weight than the problem deserves. The
    trade-off is that the cache empties on restart, which on Render's free tier
    happens whenever the instance spins down.
    """

    def __init__(self, max_entries: int = 512) -> None:
        self._data: dict[str, tuple[float, Any]] = {}
        self._lock = threading.Lock()
        self._max = max_entries

    def get(self, key: str) -> Any | None:
        with self._lock:
            row = self._data.get(key)
            if not row:
                return None
            expires, value = row
            if expires < time.time():
                self._data.pop(key, None)
                return None
            return value

    def set(self, key: str, value: Any, ttl: int) -> None:
        with self._lock:
            if len(self._data) >= self._max:
                # Cheapest sane eviction: drop whatever expires soonest.
                oldest = min(self._data, key=lambda k: self._data[k][0])
                self._data.pop(oldest, None)
            self._data[key] = (time.time() + ttl, value)

    def stats(self) -> dict:
        with self._lock:
            live = sum(1 for exp, _ in self._data.values() if exp > time.time())
            return {"entries": len(self._data), "live": live}


cache = TTLCache()


# ---------------------------------------------------------------------------
# Rate limiting
# ---------------------------------------------------------------------------
_hits: dict[str, list[float]] = {}
_hits_lock = threading.Lock()


def rate_limited(ip: str) -> bool:
    """Fixed-window limiter, per client IP.

    This exists to protect the upstream quota, not to be a security control —
    the CricketData free tier is small enough that one enthusiastic browser tab
    on a loop could burn a day's allowance.
    """
    now = time.time()
    with _hits_lock:
        window = [t for t in _hits.get(ip, []) if now - t < 60]
        window.append(now)
        _hits[ip] = window
        if len(_hits) > 2048:                      # bound the dict
            for key in [k for k, v in _hits.items() if not v or now - v[-1] > 300]:
                _hits.pop(key, None)
        return len(window) > RATE_LIMIT_PER_MIN


# ---------------------------------------------------------------------------
# CricketData client
# ---------------------------------------------------------------------------
class CricketDataError(RuntimeError):
    """Raised when CricketData cannot serve a request."""


def cricketdata_get(path: str, params: dict | None = None, ttl: int = CACHE_TTL_LIVE) -> dict:
    """One GET against CricketData, cached and defensive.

    The API returns HTTP 200 with a ``status`` of "failure" for quota and key
    errors, so the status code alone is not enough to tell success from failure.
    """
    if not CRICKETDATA_API_KEY:
        raise CricketDataError("CRICKETDATA_API_KEY is not set")

    query = {"apikey": CRICKETDATA_API_KEY, **(params or {})}
    # Key the cache on everything except the secret.
    cache_key = f"cd:{path}:{json.dumps({k: v for k, v in query.items() if k != 'apikey'}, sort_keys=True)}"
    hit = cache.get(cache_key)
    if hit is not None:
        return hit

    url = f"{CRICKETDATA_BASE}/{path.lstrip('/')}"
    try:
        resp = requests.get(url, params=query, timeout=HTTP_TIMEOUT)
    except requests.RequestException as exc:
        raise CricketDataError(f"network error calling {path}: {exc}") from exc

    if resp.status_code == 429:
        raise CricketDataError("CricketData rate limit reached")
    if resp.status_code >= 400:
        raise CricketDataError(f"{path} returned HTTP {resp.status_code}")

    try:
        payload = resp.json()
    except ValueError as exc:
        raise CricketDataError(f"{path} returned non-JSON") from exc

    if str(payload.get("status", "")).lower() == "failure":
        raise CricketDataError(payload.get("reason") or "CricketData reported failure")

    cache.set(cache_key, payload, ttl)
    return payload


def find_player(name: str) -> dict | None:
    """Look a player up by name. Returns the best match, or None."""
    payload = cricketdata_get("players", {"search": name, "offset": 0}, ttl=86400)
    results = payload.get("data") or []
    if not results:
        return None
    wanted = name.strip().lower()
    # Prefer an exact name match over the API's own ordering.
    for row in results:
        if str(row.get("name", "")).strip().lower() == wanted:
            return row
    return results[0]


def player_profile(player_id: str) -> dict:
    payload = cricketdata_get("players_info", {"id": player_id}, ttl=86400)
    return payload.get("data") or {}


def current_matches() -> list[dict]:
    payload = cricketdata_get("currentMatches", {"offset": 0}, ttl=CACHE_TTL_LIVE)
    return payload.get("data") or []


def match_scorecard(match_id: str) -> dict:
    payload = cricketdata_get("match_scorecard", {"id": match_id}, ttl=CACHE_TTL_LIVE)
    return payload.get("data") or {}


def match_ball_by_ball(match_id: str) -> list[dict]:
    """Ball-by-ball for a match.

    Note: on CricketData this endpoint is not part of every plan. A failure here
    is treated as "no live deliveries available" rather than an error, because
    the historical splits still carry the analysis.
    """
    payload = cricketdata_get("match_bbb", {"id": match_id, "offset": 0},
                              ttl=CACHE_TTL_LIVE)
    data = payload.get("data")
    if isinstance(data, dict):
        return data.get("bbb") or []
    return data or []


# ---------------------------------------------------------------------------
# Live-innings summarisation
# ---------------------------------------------------------------------------
@dataclass
class LiveSpell:
    """What a batter has done in the deliveries we can see right now."""
    balls: int = 0
    runs: int = 0
    dots: int = 0
    fours: int = 0
    sixes: int = 0
    out: bool = False
    dismissal: str = ""
    bowlers_faced: dict[str, int] = field(default_factory=dict)
    first_15_dots: int = 0
    first_15_balls: int = 0

    def to_dict(self) -> dict:
        sr = round(100 * self.runs / self.balls, 1) if self.balls else None
        return {
            "balls_faced": self.balls,
            "runs": self.runs,
            "strike_rate": sr,
            "fours": self.fours,
            "sixes": self.sixes,
            "dot_balls": self.dots,
            "dot_ball_percentage": round(100 * self.dots / self.balls, 1) if self.balls else None,
            "dot_percentage_first_15_balls": (
                round(100 * self.first_15_dots / self.first_15_balls, 1)
                if self.first_15_balls else None),
            "dismissed": self.out,
            "dismissal": self.dismissal or None,
            "bowlers_faced": self.bowlers_faced,
        }


def summarise_live(deliveries: list[dict], player_name: str) -> LiveSpell:
    """Reduce raw ball-by-ball rows to one batter's current innings.

    Feed lists vary between providers and plans, so every field is read
    defensively: a missing key costs one delivery, never the whole summary.
    """
    spell = LiveSpell()
    wanted = player_name.strip().lower()

    for ball in deliveries:
        batter = str(ball.get("batsman", {}).get("name")
                     if isinstance(ball.get("batsman"), dict)
                     else ball.get("batsman") or ball.get("batter") or "")
        if batter.strip().lower() != wanted:
            continue

        runs = ball.get("batsmanRuns")
        if runs is None:
            runs = (ball.get("runs") or {}).get("batter") if isinstance(ball.get("runs"), dict) \
                else ball.get("runs")
        try:
            runs = int(runs or 0)
        except (TypeError, ValueError):
            runs = 0

        bowler = str(ball.get("bowler", {}).get("name")
                     if isinstance(ball.get("bowler"), dict)
                     else ball.get("bowler") or "")

        spell.balls += 1
        spell.runs += runs
        if runs == 0:
            spell.dots += 1
        elif runs == 4:
            spell.fours += 1
        elif runs == 6:
            spell.sixes += 1
        if bowler:
            spell.bowlers_faced[bowler] = spell.bowlers_faced.get(bowler, 0) + 1
        # Dot-ball rate early in an innings is one of the signals the user
        # specifically wants surfaced, so it is computed rather than inferred.
        if spell.balls <= 15:
            spell.first_15_balls += 1
            if runs == 0:
                spell.first_15_dots += 1

        if ball.get("dismissal") or ball.get("wicket"):
            spell.out = True
            spell.dismissal = str(ball.get("dismissal") or ball.get("wicketType") or "out")

    return spell


# ---------------------------------------------------------------------------
# Historical grounding from the Criclysis dataset
# ---------------------------------------------------------------------------
_index_lock = threading.Lock()
_player_index: dict[str, str] | None = None


def _norm(name: str) -> str:
    """Loose name key, so "V Kohli" and "Virat Kohli" have a chance of meeting."""
    return re.sub(r"[^a-z]", "", name.lower())


def _initial_surname(name: str) -> str:
    """"Virat Kohli" -> "vkohli", matching Cricsheet's "V Kohli" form.

    Cricsheet writes players as initials plus surname; people type full names.
    Reducing both to first-initial + surname is what lets the two meet without
    needing a full-name column to exist.
    """
    parts = [p for p in re.split(r"\s+", name.strip()) if p]
    if len(parts) < 2:
        return _norm(name)
    return _norm(parts[0][0] + parts[-1])


def _build_index() -> dict[str, str]:
    """Map several normalised forms of each name onto a Criclysis slug."""
    index: dict[str, str] = {}
    path = DATA_DIR / "players.json"
    if not path.exists():
        log.warning("no grounding dataset at %s", path)
        return index
    try:
        players = json.loads(path.read_text(encoding="utf-8"))["players"]
    except (ValueError, KeyError, OSError) as exc:
        log.warning("could not read %s: %s", path, exc)
        return index

    # players.json is ordered by run volume, so when two players collapse to
    # the same key the more prolific one wins - which is the one a visitor
    # typing a bare surname almost always means.
    for row in players:
        slug = row.get("slug")
        if not slug:
            continue
        keys: set[str] = set()
        for candidate in (row.get("name"), row.get("fullName")):
            if candidate:
                keys.add(_norm(candidate))
                keys.add(_initial_surname(candidate))
        parts = str(row.get("name", "")).split()
        if len(parts) > 1:
            keys.add(_norm(parts[-1]))               # bare surname
        for key in keys:
            if key:
                index.setdefault(key, slug)
    log.info("grounding index built: %d name keys over %d players",
             len(index), len(players))
    return index


def player_index() -> dict[str, str]:
    global _player_index
    with _index_lock:
        if _player_index is None:
            _player_index = _build_index()
        return _player_index


def resolve_slug(player_name: str) -> str | None:
    """Find a player's slug from whatever form the caller typed."""
    index = player_index()
    for key in (_norm(player_name), _initial_surname(player_name)):
        if key in index:
            return index[key]
    parts = player_name.split()
    if len(parts) > 1:
        return index.get(_norm(parts[-1]))
    return None


def load_grounding(player_name: str) -> dict | None:
    """Historical splits for a player, if the Criclysis dataset is available.

    This is what stops the analysis being a language model's impression of a
    cricketer. Gemini is good at explaining and prioritising; it is not a source
    of truth for whether someone averages 21 against left-arm orthodox. That
    number comes from the ball-by-ball record, and is handed to the model as
    evidence to reason over.
    """
    slug = resolve_slug(player_name)
    if not slug:
        return None
    path = DATA_DIR / "players" / f"{slug}.json"
    if not path.exists():
        return None
    try:
        record = json.loads(path.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return None

    out: dict[str, Any] = {"name": record.get("name"), "meta": record.get("meta", {}),
                           "formats": {}}
    for fmt, payload in (record.get("formats") or {}).items():
        batting = payload.get("batting") or {}
        if not batting:
            continue
        out["formats"][fmt] = {
            "overall": batting.get("overall"),
            "vs_bowling_type": batting.get("byType"),
            "vs_pace_and_spin": batting.get("byFamily"),
            "by_phase": batting.get("byPhase"),
            "by_stage_of_own_innings": batting.get("byEntry"),
            "dismissal_modes": batting.get("dismissals"),
            "computed_strengths": payload.get("strengths", [])[:5],
            "computed_weaknesses": payload.get("weaknesses", [])[:5],
        }
    return out if out["formats"] else None


# ---------------------------------------------------------------------------
# Gemini analysis
# ---------------------------------------------------------------------------
RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "playstyle": {
            "type": "object",
            "properties": {
                "summary": {"type": "string"},
                "tempo": {"type": "string"},
                "scoring_areas": {"type": "array", "items": {"type": "string"}},
                "preferred_matchups": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["summary", "tempo"],
        },
        "weaknesses": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "detail": {"type": "string"},
                    "evidence": {"type": "string"},
                    "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
                },
                "required": ["title", "detail", "evidence", "confidence"],
            },
        },
        "tactical_advice": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "phase": {"type": "string"},
                    "recommendation": {"type": "string"},
                    "rationale": {"type": "string"},
                },
                "required": ["phase", "recommendation"],
            },
        },
    },
    "required": ["playstyle", "weaknesses", "tactical_advice"],
}

SYSTEM_INSTRUCTION = """\
You are a cricket performance analyst producing a scouting read for a coaching \
staff. You will be given a player's historical ball-by-ball splits and, when a \
match is in progress, their current innings.

Rules you must follow:

1. Ground every claim in the numbers provided. Cite the specific figure in the \
   `evidence` field — an average, a strike rate, a dot-ball percentage, a ball \
   count. If you cannot point at a number, do not make the claim.
2. Respect sample sizes. A split over fewer than about 150 balls is indicative \
   at best: mark such claims "low" confidence and say the sample is small.
3. Never invent statistics, matches, dates or dismissals. If the data does not \
   cover something, say so rather than filling the gap.
4. The data contains no ball-tracking — no length, line, speed, swing or turn. \
   Do not claim a "short ball weakness" or advise "bowl full and straight" as \
   though it were measured. You may reason about the stumps from the mix of \
   dismissal modes (bowled and lbw versus caught), and you should say that is \
   what you are doing.
5. Be specific and useful. "Bowl well at him" is not advice. Name the bowling \
   type, the phase, and what you expect it to achieve.
"""


def build_prompt(player_name: str, live: dict | None, grounding: dict | None,
                 match_context: dict | None) -> str:
    blocks = [f"PLAYER: {player_name}"]
    if match_context:
        blocks.append("CURRENT MATCH:\n" + json.dumps(match_context, indent=2)[:2500])
    if live:
        blocks.append("CURRENT INNINGS (from live ball-by-ball):\n"
                      + json.dumps(live, indent=2)[:2500])
    if grounding:
        blocks.append(
            "HISTORICAL BALL-BY-BALL SPLITS (this is the authoritative evidence; "
            "`avg` is batting average, `sr` strike rate, `balls` the sample size, "
            "`dotPct` dot-ball percentage, `bpd` balls per dismissal):\n"
            + json.dumps(grounding, indent=2)[:12000])
    else:
        blocks.append(
            "HISTORICAL SPLITS: not available for this player. Say so explicitly "
            "in your analysis and keep every confidence rating at 'low'.")
    blocks.append(
        "Produce the scouting read. Give at most four weaknesses and at most "
        "four tactical recommendations, ordered by how much they matter.")
    return "\n\n".join(blocks)


def gemini_analysis(player_name: str, live: dict | None, grounding: dict | None,
                    match_context: dict | None) -> dict:
    """Ask Gemini for the structured read. Raises on any failure."""
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not set")

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=GEMINI_API_KEY)
    config: dict[str, Any] = {
        "system_instruction": SYSTEM_INSTRUCTION,
        "response_mime_type": "application/json",
        "response_schema": RESPONSE_SCHEMA,
        "temperature": 0.3,
        "max_output_tokens": 2048,
    }
    # 2.5 models think by default. For a short structured extraction that is
    # latency and tokens spent for little gain, so it is turned down.
    if "2.5" in GEMINI_MODEL:
        config["thinking_config"] = types.ThinkingConfig(thinking_budget=0)

    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=build_prompt(player_name, live, grounding, match_context),
        config=types.GenerateContentConfig(**config),
    )
    text = (response.text or "").strip()
    if not text:
        raise RuntimeError("Gemini returned an empty response")
    return json.loads(text)


# ---------------------------------------------------------------------------
# Fallbacks
# ---------------------------------------------------------------------------
def offline_analysis(player_name: str, grounding: dict | None, reason: str) -> dict:
    """A useful answer when Gemini is unavailable.

    Where historical splits exist this is not "mock data" — the strengths and
    weaknesses were computed from the ball-by-ball record by the Criclysis
    pipeline, so the numbers are real; only the prose synthesis is missing.
    """
    if grounding:
        fmt = next(iter(grounding["formats"]))
        block = grounding["formats"][fmt]
        overall = block.get("overall") or {}
        weaknesses = [
            {
                "title": claim.get("subject", "Split"),
                "detail": claim.get("text", ""),
                "evidence": f"{claim.get('balls', 0)} balls, "
                            f"{claim.get('percentile', 0)}th percentile",
                "confidence": claim.get("confidence", "low"),
            }
            for claim in block.get("computed_weaknesses", [])[:4]
        ]
        return {
            "playstyle": {
                "summary": f"Computed from {overall.get('balls', 0)} balls of "
                           f"{fmt.upper()} ball-by-ball data. AI synthesis unavailable "
                           f"({reason}); the figures below are measured, not generated.",
                "tempo": f"Strike rate {overall.get('sr', '—')}, "
                         f"dot-ball {overall.get('dotPct', '—')}%",
                "scoring_areas": [],
                "preferred_matchups": [],
            },
            "weaknesses": weaknesses,
            "tactical_advice": [],
        }

    return {
        "playstyle": {
            "summary": f"No data available for {player_name}. This is placeholder "
                       f"content, not analysis ({reason}).",
            "tempo": "unknown",
            "scoring_areas": [],
            "preferred_matchups": [],
        },
        "weaknesses": [{
            "title": "No analysis available",
            "detail": "Neither live data nor historical splits could be loaded.",
            "evidence": reason,
            "confidence": "low",
        }],
        "tactical_advice": [],
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/")
def root():
    return jsonify({
        "service": "criclysis-api",
        "endpoints": ["/healthz", "/api/player-analysis", "/api/live-matches"],
    })


@app.get("/healthz")
def healthz():
    """Liveness probe. Also what a keep-alive pinger should hit."""
    return jsonify({
        "status": "ok",
        "cricketdata_key": bool(CRICKETDATA_API_KEY),
        "gemini_key": bool(GEMINI_API_KEY),
        "gemini_model": GEMINI_MODEL,
        "grounding_dataset": (DATA_DIR / "players.json").exists(),
        "grounded_players": len(player_index()),
        "cache": cache.stats(),
    })


@app.get("/api/live-matches")
def live_matches():
    try:
        matches = current_matches()
    except CricketDataError as exc:
        return jsonify({"matches": [], "degraded": True, "error": str(exc)}), 200
    return jsonify({"matches": [
        {"id": m.get("id"), "name": m.get("name"), "status": m.get("status"),
         "venue": m.get("venue"), "date": m.get("date"),
         "teams": m.get("teams", [])}
        for m in matches
    ]})


@app.route("/api/player-analysis", methods=["GET", "POST"])
def player_analysis():
    body = request.get_json(silent=True) or {}
    player_name = (request.args.get("player")
                   or body.get("player")
                   or body.get("player_name") or "").strip()
    match_id = (request.args.get("match_id") or body.get("match_id") or "").strip()
    fmt_hint = (request.args.get("format") or body.get("format") or "").strip().lower()

    if not player_name:
        return jsonify({"error": "Provide a 'player' name (query string or JSON body)."}), 400
    if len(player_name) > 80:
        return jsonify({"error": "Player name is too long."}), 400

    client_ip = (request.headers.get("X-Forwarded-For", request.remote_addr or "")
                 .split(",")[0].strip())
    if rate_limited(client_ip):
        return jsonify({"error": "Rate limit exceeded. Try again in a minute."}), 429

    cache_key = f"analysis:{player_name.lower()}:{match_id}:{fmt_hint}"
    cached = cache.get(cache_key)
    if cached is not None:
        return jsonify({**cached, "cached": True})

    notes: list[str] = []
    degraded = False

    # --- 1. historical splits (works with no network at all) --------------
    grounding = load_grounding(player_name)
    if grounding is None:
        notes.append("No historical ball-by-ball record found for this player.")

    # --- 2. live match state ---------------------------------------------
    live_summary = None
    match_context = None
    profile = None
    if CRICKETDATA_API_KEY:
        try:
            found = find_player(player_name)
            if found and found.get("id"):
                profile = player_profile(str(found["id"]))
        except CricketDataError as exc:
            notes.append(f"Player lookup unavailable: {exc}")
            degraded = True

        target_match = match_id
        if not target_match:
            try:
                for match in current_matches():
                    squads = " ".join(str(t) for t in (match.get("teams") or []))
                    if player_name.split()[-1].lower() in squads.lower():
                        target_match = str(match.get("id") or "")
                        break
            except CricketDataError as exc:
                notes.append(f"Live match list unavailable: {exc}")
                degraded = True

        if target_match:
            try:
                info = match_scorecard(target_match)
                match_context = {
                    "match_id": target_match,
                    "name": info.get("name"),
                    "status": info.get("status"),
                    "venue": info.get("venue"),
                    "teams": info.get("teams"),
                }
            except CricketDataError as exc:
                notes.append(f"Scorecard unavailable: {exc}")
            try:
                deliveries = match_ball_by_ball(target_match)
                if deliveries:
                    live_summary = summarise_live(deliveries, player_name).to_dict()
            except CricketDataError as exc:
                notes.append(f"Live ball-by-ball unavailable: {exc}")
    else:
        notes.append("CRICKETDATA_API_KEY not configured; live data skipped.")

    # --- 3. synthesis -----------------------------------------------------
    try:
        analysis = gemini_analysis(player_name, live_summary, grounding, match_context)
        source = "gemini"
    except Exception as exc:                       # noqa: BLE001 - never 500 on this
        log.warning("Gemini analysis failed for %r: %s", player_name, exc)
        analysis = offline_analysis(player_name, grounding, str(exc))
        source = "computed" if grounding else "fallback"
        degraded = True
        notes.append(f"AI synthesis unavailable: {exc}")

    current_stats: dict[str, Any] = {}
    if live_summary:
        current_stats["live_innings"] = live_summary
    if match_context:
        current_stats["match"] = match_context
    if grounding:
        current_stats["career"] = {
            fmt: block.get("overall") for fmt, block in grounding["formats"].items()
        }
    if profile:
        current_stats["profile"] = {
            "country": profile.get("country"),
            "batting_style": profile.get("battingStyle"),
            "bowling_style": profile.get("bowlingStyle"),
            "role": profile.get("role"),
        }

    payload = {
        "player_name": (grounding or {}).get("name") or player_name,
        "current_stats": current_stats,
        "playstyle": analysis.get("playstyle", {}),
        "weaknesses": analysis.get("weaknesses", []),
        "tactical_advice": analysis.get("tactical_advice", []),
        "meta": {
            "source": source,
            "model": GEMINI_MODEL if source == "gemini" else None,
            "grounded": grounding is not None,
            "live_data": live_summary is not None,
            "degraded": degraded,
            "notes": notes,
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "disclaimer": "Playstyle, weaknesses and tactical advice are generated "
                          "by a language model from the statistics shown. Treat them "
                          "as a reading of the numbers, not as measured fact.",
        },
        "cached": False,
    }

    # Only cache a good answer: caching a degraded one would pin the failure in
    # place for the full TTL long after the upstream recovered.
    if not degraded:
        cache.set(cache_key, payload, CACHE_TTL_ANALYSIS)
    return jsonify(payload)


@app.errorhandler(404)
def not_found(_exc):
    return jsonify({"error": "Not found"}), 404


@app.errorhandler(500)
def server_error(exc):
    log.exception("unhandled error: %s", exc)
    return jsonify({"error": "Internal server error"}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")), debug=False)
