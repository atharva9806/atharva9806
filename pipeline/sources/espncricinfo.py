"""ESPNcricinfo adapter - player profile metadata and career aggregates.

Why this source exists in the project
-------------------------------------
Cricsheet gives us every ball, but it does not say whether the bowler who sent
it down was a left-arm quick or a leg spinner, and that single attribute is what
turns raw deliveries into the matchup analysis this site is built on. Cricinfo
profiles carry ``bowlingStyles`` / ``battingStyles`` / ``playingRole``, and the
Cricsheet people register carries each player's Cricinfo id, so the two join
cleanly on one integer.

Terms of use
------------
ESPNcricinfo is not open data. This module therefore:

* is **opt-in** - nothing here runs unless you pass ``--enrich espncricinfo``
* checks robots.txt for every URL before requesting it and refuses to proceed
  when disallowed (see :mod:`pipeline.net`)
* requests one page per player, at a 2s floor between requests, and caches
  every response so a re-run costs zero requests
* fetches profile attributes only - not article text, not images

If robots.txt disallows the profile paths for your user-agent, the enrichment
step will report that and stop. In that case use ``--styles-file`` to supply
your own styles mapping (a licensed feed, a hand-curated CSV, or the bundled
``data/bowling_styles.csv``), and the rest of the pipeline runs unchanged.

Markup changes
--------------
Cricinfo is a Next.js app; the parse target is the ``__NEXT_DATA__`` JSON blob
rather than CSS classes, which is markedly more stable than scraping rendered
HTML. Even so, if the shape changes, :func:`parse_player_page` returns what it
can and logs the rest - enrichment degrades, it does not crash the pipeline.
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import asdict, dataclass

from .. import net
from ..config import SOURCES
from ..styles import normalise_bowling_style, normalise_batting_style

log = logging.getLogger(__name__)

BASE = SOURCES["espncricinfo"]["base"]
STATS_BASE = "https://stats.espncricinfo.com"

NEXT_DATA_RE = re.compile(
    r'<script[^>]+id="__NEXT_DATA__"[^>]*>(.*?)</script>', re.DOTALL)

# Legacy profile page fallbacks.
LEGACY_FIELD_RE = re.compile(
    r'<b>(Playing role|Batting style|Bowling style|Born|Full name)</b>\s*</p>\s*'
    r'<p[^>]*>(.*?)</p>', re.DOTALL | re.IGNORECASE)
TAG_RE = re.compile(r"<[^>]+>")


@dataclass
class Profile:
    cricinfo_id: str
    name: str = ""
    full_name: str = ""
    country: str = ""
    playing_role: str = ""
    batting_style_raw: str = ""
    bowling_style_raw: str = ""
    batting_hand: str = ""      # "right" | "left"
    bowling_type: str = ""      # key from config.BOWLING_TYPES
    born: str = ""
    image: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


def profile_url(cricinfo_id: str | int, slug: str = "player") -> str:
    return f"{BASE}/cricketers/{slug}-{cricinfo_id}"


def _strip(html: str) -> str:
    return TAG_RE.sub("", html).replace("&nbsp;", " ").strip()


def _walk(node, key: str):
    """Depth-first search for the first value stored under ``key``."""
    if isinstance(node, dict):
        if key in node:
            return node[key]
        for value in node.values():
            found = _walk(value, key)
            if found is not None:
                return found
    elif isinstance(node, list):
        for item in node:
            found = _walk(item, key)
            if found is not None:
                return found
    return None


def _first_style(value) -> str:
    """Cricinfo styles arrive as a list, a comma string, or a dict."""
    if not value:
        return ""
    if isinstance(value, str):
        return value.split(",")[0].strip()
    if isinstance(value, dict):
        return str(value.get("longLabel") or value.get("label") or "").strip()
    if isinstance(value, list) and value:
        return _first_style(value[0])
    return ""


def parse_player_page(html: str, cricinfo_id: str) -> Profile:
    """Extract profile attributes from a Cricinfo player page."""
    profile = Profile(cricinfo_id=str(cricinfo_id))

    match = NEXT_DATA_RE.search(html)
    if match:
        try:
            blob = json.loads(match.group(1))
            player = _walk(blob.get("props", {}), "player") or {}
            if isinstance(player, list):
                player = player[0] if player else {}
            if isinstance(player, dict) and player:
                profile.name = str(player.get("name") or player.get("longName") or "")
                profile.full_name = str(player.get("longName") or profile.name)
                country = player.get("country")
                if isinstance(country, dict):
                    profile.country = str(country.get("name", ""))
                elif country:
                    profile.country = str(country)
                profile.playing_role = str(player.get("playingRole") or "")
                profile.batting_style_raw = _first_style(player.get("battingStyles")
                                                         or player.get("battingStyle"))
                profile.bowling_style_raw = _first_style(player.get("bowlingStyles")
                                                         or player.get("bowlingStyle"))
                profile.born = str(player.get("dateOfBirth") or player.get("born") or "")
                image = player.get("imageUrl") or player.get("image")
                if isinstance(image, dict):
                    image = image.get("url", "")
                profile.image = str(image or "")
        except (json.JSONDecodeError, AttributeError, TypeError) as exc:
            log.debug("__NEXT_DATA__ parse failed for %s: %s", cricinfo_id, exc)

    # Legacy layout fallback, and a top-up for anything the blob did not carry.
    if not profile.bowling_style_raw or not profile.batting_style_raw:
        for label, value in LEGACY_FIELD_RE.findall(html):
            text = _strip(value)
            key = label.lower()
            if key == "bowling style" and not profile.bowling_style_raw:
                profile.bowling_style_raw = text
            elif key == "batting style" and not profile.batting_style_raw:
                profile.batting_style_raw = text
            elif key == "playing role" and not profile.playing_role:
                profile.playing_role = text
            elif key == "full name" and not profile.full_name:
                profile.full_name = text
            elif key == "born" and not profile.born:
                profile.born = text

    profile.bowling_type = normalise_bowling_style(profile.bowling_style_raw)
    profile.batting_hand = normalise_batting_style(profile.batting_style_raw)
    return profile


def fetch_profile(cricinfo_id: str | int, slug: str = "player",
                  *, use_cache: bool = True) -> Profile:
    """Fetch and parse one player profile. Raises net.Blocked if robots says no."""
    url = profile_url(cricinfo_id, slug)
    html = net.get(url, use_cache=use_cache)
    return parse_player_page(html, str(cricinfo_id))  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# Statsguru career aggregates
# ---------------------------------------------------------------------------
CLASS_IDS = {"test": 1, "odi": 2, "t20i": 3}

TABLE_RE = re.compile(r'<table[^>]*class="engineTable"[^>]*>(.*?)</table>', re.DOTALL)
ROW_RE = re.compile(r"<tr[^>]*>(.*?)</tr>", re.DOTALL)
CELL_RE = re.compile(r"<t[dh][^>]*>(.*?)</t[dh]>", re.DOTALL)


def statsguru_url(cricinfo_id: str | int, fmt: str, discipline: str = "batting") -> str:
    class_id = CLASS_IDS.get(fmt, 1)
    return (f"{STATS_BASE}/ci/engine/player/{cricinfo_id}.html"
            f"?class={class_id};template=results;type={discipline}")


def parse_statsguru(html: str) -> list[dict[str, str]]:
    """Parse the 'career averages' engineTable into a list of row dicts."""
    rows_out: list[dict[str, str]] = []
    for table_html in TABLE_RE.findall(html):
        rows = ROW_RE.findall(table_html)
        if not rows:
            continue
        header = [_strip(c) for c in CELL_RE.findall(rows[0])]
        if "Mat" not in header and "Runs" not in header:
            continue
        for row in rows[1:]:
            cells = [_strip(c) for c in CELL_RE.findall(row)]
            if len(cells) != len(header):
                continue
            rows_out.append(dict(zip(header, cells)))
        if rows_out:
            break
    return rows_out


def fetch_career(cricinfo_id: str | int, fmt: str, discipline: str = "batting",
                 *, use_cache: bool = True) -> list[dict[str, str]]:
    html = net.get(statsguru_url(cricinfo_id, fmt, discipline), use_cache=use_cache)
    return parse_statsguru(html)  # type: ignore[arg-type]
