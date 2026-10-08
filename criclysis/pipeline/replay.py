"""Ball-by-ball replays of real matches.

The live page needs something real to show when no match is being played, so
instead of inventing matches it replays historical ones from Cricsheet, ball by
ball, with the same win-probability and matchup analysis a live match gets.

Each replay is a compact JSON file:

    {
      "id": "1384439", "format": "odi", "title": "India v Australia",
      "event": "ICC Cricket World Cup", "stage": "Final", "date": "2023-11-19",
      "venue": "...", "result": "Australia won by 6 wickets",
      "teams": ["India", "Australia"],
      "people": [{"id": "ba607b88", "name": "V Kohli", "team": "India"}, ...],
      "innings": [
        {"team": "India", "target": null,
         "balls": [[over, batter, bowler, nonStriker, runsBat, extras, extraType,
                    wicketKind, playerOut], ...]}
      ]
    }

Player fields are indexes into ``people``; ``id`` is the Cricsheet person id,
which is also the player id in the analytics dataset, so a replay links
straight to player profiles.
"""
from __future__ import annotations

import json
import logging
import zipfile
from pathlib import Path

from .config import WEB_DATA_DIR
from .sources.cricsheet import archive_path

log = logging.getLogger(__name__)

#: Curated finals: (format, Cricsheet match id).
FEATURED = [
    ("odi", "1384439"),   # 2023 World Cup final, Australia v India
    ("odi", "1144530"),   # 2019 World Cup final, England v New Zealand (tied)
    ("odi", "433606"),    # 2011 World Cup final, India v Sri Lanka
    ("odi", "656495"),    # 2015 World Cup final, Australia v New Zealand
    ("t20i", "1415755"),  # 2024 T20 World Cup final, India v South Africa
    ("t20i", "1298179"),  # 2022 T20 World Cup final, England v Pakistan
    ("t20i", "1273756"),  # 2021 T20 World Cup final, Australia v New Zealand
    ("t20i", "951373"),   # 2016 World T20 final, West Indies v England
    ("t20i", "287879"),   # 2007 World T20 final, India v Pakistan
]

EXTRA_KEYS = ("wides", "noballs", "byes", "legbyes", "penalty")


def result_text(info: dict) -> str:
    out = info.get("outcome") or {}
    if out.get("result") == "tie":
        eliminator = out.get("eliminator")
        return f"Match tied ({eliminator} won the Super Over)" if eliminator else "Match tied"
    if out.get("result") == "no result":
        return "No result"
    winner = out.get("winner")
    by = out.get("by") or {}
    if winner and "runs" in by:
        return f"{winner} won by {by['runs']} runs"
    if winner and "wickets" in by:
        return f"{winner} won by {by['wickets']} wickets"
    return f"{winner} won" if winner else ""


def build_replay(raw: dict, match_id: str, fmt: str) -> dict:
    info = raw.get("info", {})
    registry = (info.get("registry") or {}).get("people") or {}
    teams = list(info.get("teams", []))

    people: list[dict] = []
    index: dict[str, int] = {}

    def person(name: str | None, team: str) -> int | None:
        if not name:
            return None
        if name not in index:
            index[name] = len(people)
            people.append({"id": registry.get(name, ""), "name": name, "team": team})
        return index[name]

    # Seed people in batting order per team so squads read naturally.
    for team, names in (info.get("players") or {}).items():
        for n in names:
            person(n, team)

    innings_out = []
    for inn in raw.get("innings", []):
        if inn.get("super_over"):
            continue
        bat_team = inn.get("team", "")
        bowl_team = next((t for t in teams if t != bat_team), "")
        balls = []
        for over in inn.get("overs", []):
            for d in over.get("deliveries", []):
                extras = d.get("extras") or {}
                extra_type = next((k for k in EXTRA_KEYS if k in extras), None)
                wk = (d.get("wickets") or [None])[0] or {}
                balls.append([
                    over.get("over", 0),
                    person(d.get("batter"), bat_team),
                    person(d.get("bowler"), bowl_team),
                    person(d.get("non_striker"), bat_team),
                    (d.get("runs") or {}).get("batter", 0),
                    (d.get("runs") or {}).get("extras", 0),
                    extra_type,
                    wk.get("kind"),
                    person(wk.get("player_out"), bat_team) if wk else None,
                ])
        target = (inn.get("target") or {}).get("runs")
        innings_out.append({"team": bat_team, "target": target, "balls": balls})

    event = info.get("event") or {}
    title = " v ".join(innings.get("team", "") for innings in innings_out[:2]) or " v ".join(teams)
    return {
        "id": match_id,
        "format": fmt,
        "title": title,
        "event": event.get("name", ""),
        "stage": event.get("stage") or (f"Match {event['match_number']}" if event.get("match_number") else ""),
        "date": (info.get("dates") or [""])[0],
        "venue": info.get("venue", ""),
        "city": info.get("city", ""),
        "teams": teams,
        "toss": (info.get("toss") or {}),
        "result": result_text(info),
        "winner": (info.get("outcome") or {}).get("winner"),
        "people": people,
        "innings": innings_out,
        "credit": "Ball-by-ball data from Cricsheet (cricsheet.org), CC BY 4.0",
    }


def export_replays(featured: list[tuple[str, str]] = FEATURED, out_dir: Path | None = None) -> list[dict]:
    out_dir = (out_dir or WEB_DATA_DIR) / "replays"
    out_dir.mkdir(parents=True, exist_ok=True)
    wanted: dict[str, set[str]] = {}
    for fmt, mid in featured:
        wanted.setdefault(fmt, set()).add(mid)

    index = []
    for fmt, ids in wanted.items():
        archive = archive_path(fmt)
        if not archive.exists():
            log.warning("%s missing - skipping %s replays", archive, fmt)
            continue
        with zipfile.ZipFile(archive) as zf:
            for mid in sorted(ids):
                name = f"{mid}.json"
                if name not in zf.namelist():
                    log.warning("match %s not in %s archive", mid, fmt)
                    continue
                replay = build_replay(json.loads(zf.read(name)), mid, fmt)
                (out_dir / name).write_text(json.dumps(replay, separators=(",", ":")))
                index.append({k: replay[k] for k in
                              ("id", "format", "title", "event", "stage", "date", "venue", "result")})
    order = {mid: i for i, (_, mid) in enumerate(featured)}
    index.sort(key=lambda r: order.get(r["id"], 999))
    (out_dir / "index.json").write_text(json.dumps(index, separators=(",", ":")))
    log.info("wrote %d replays to %s", len(index), out_dir)
    return index


def replay_states(replay: dict, max_balls: int):
    """Yield (innings_no, balls_left, wickets, runs, target, ball_index) after
    every legal delivery, mirroring what a live feed would report."""
    for n, inn in enumerate(replay["innings"][:2], start=1):
        legal = wickets = runs = 0
        target = inn.get("target")
        for i, b in enumerate(inn["balls"]):
            runs += b[4] + b[5]
            if b[7] and b[7] not in ("retired hurt", "retired not out"):
                wickets += 1
            if b[6] not in ("wides", "noballs"):
                legal += 1
            yield n, max_balls - legal, wickets, runs, target, i


def win_curve(replay: dict, model) -> list[tuple[int, int, float]]:
    """P(side batting first wins) after every delivery: (innings, index, p)."""
    out = []
    for n, u, w, r, target, i in replay_states(replay, model.max_balls):
        if n == 1:
            p = model.batting_first(u, w, r)
        else:
            p = 1 - model.chase(u, w, (target or 0) - r)
        out.append((n, i, p))
    return out
