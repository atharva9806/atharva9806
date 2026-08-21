"""ICC adapter - official team and player rankings.

Rankings are context the ball-by-ball data cannot supply: they tell you how the
rest of the world rates a player right now, which is useful as a sanity check
against our own percentile work and as a sort key on the leaderboards.

Like the Cricinfo adapter this is **opt-in** (``--enrich icc``), robots-gated
and cached. The ICC site is a rendered app, so we try a JSON payload first and
fall back to table scraping. Rankings are a small number of pages (three
formats x three disciplines x two genders), so this costs well under 20
requests for a full refresh.
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass

from .. import net
from ..config import SOURCES

log = logging.getLogger(__name__)

BASE = SOURCES["icc"]["base"]

DISCIPLINES = ("batting", "bowling", "all-rounder")
FORMATS = {"test": "test", "odi": "odi", "t20i": "t20i"}

NEXT_DATA_RE = re.compile(
    r'<script[^>]+id="__NEXT_DATA__"[^>]*>(.*?)</script>', re.DOTALL)
ROW_RE = re.compile(r"<tr[^>]*>(.*?)</tr>", re.DOTALL)
CELL_RE = re.compile(r"<t[dh][^>]*>(.*?)</t[dh]>", re.DOTALL)
TAG_RE = re.compile(r"<[^>]+>")
RANK_RE = re.compile(r"^\d{1,3}$")


@dataclass
class Ranking:
    rank: int
    player: str
    team: str
    rating: int
    fmt: str
    discipline: str
    gender: str = "male"

    def to_dict(self) -> dict:
        return {
            "rank": self.rank, "player": self.player, "team": self.team,
            "rating": self.rating, "format": self.fmt,
            "discipline": self.discipline, "gender": self.gender,
        }


def rankings_url(fmt: str, discipline: str, gender: str = "mens") -> str:
    return f"{BASE}/rankings/{gender}/player-rankings/{FORMATS.get(fmt, fmt)}/{discipline}"


def _strip(html: str) -> str:
    return TAG_RE.sub(" ", html).replace("&nbsp;", " ").replace("&amp;", "&").strip()


def _from_next_data(html: str) -> list[dict]:
    match = NEXT_DATA_RE.search(html)
    if not match:
        return []
    try:
        blob = json.loads(match.group(1))
    except json.JSONDecodeError:
        return []

    found: list[dict] = []

    def walk(node):
        if isinstance(node, dict):
            keys = set(node)
            if {"rank", "name"} <= keys or {"rank", "playerName"} <= keys:
                found.append(node)
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for item in node:
                walk(item)

    walk(blob)
    return found


def parse_rankings(html: str, fmt: str, discipline: str,
                   gender: str = "male") -> list[Ranking]:
    """Parse a rankings page, preferring embedded JSON over table markup."""
    out: list[Ranking] = []

    for row in _from_next_data(html):
        try:
            out.append(Ranking(
                rank=int(row.get("rank")),
                player=str(row.get("name") or row.get("playerName") or "").strip(),
                team=str(row.get("team") or row.get("teamName")
                         or row.get("country") or "").strip(),
                rating=int(row.get("rating") or row.get("points") or 0),
                fmt=fmt, discipline=discipline, gender=gender,
            ))
        except (TypeError, ValueError):
            continue
    if out:
        return _dedupe(out)

    # Fallback: the rendered table is rank / player / team / rating.
    for row_html in ROW_RE.findall(html):
        cells = [_strip(c) for c in CELL_RE.findall(row_html)]
        cells = [c for c in cells if c]
        if len(cells) < 3 or not RANK_RE.match(cells[0]):
            continue
        rating = 0
        for cell in reversed(cells):
            digits = re.sub(r"[^\d]", "", cell)
            if digits and len(digits) <= 4:
                rating = int(digits)
                break
        out.append(Ranking(
            rank=int(cells[0]), player=cells[1],
            team=cells[2] if len(cells) > 2 else "",
            rating=rating, fmt=fmt, discipline=discipline, gender=gender,
        ))
    return _dedupe(out)


def _dedupe(rows: list[Ranking]) -> list[Ranking]:
    seen: set[int] = set()
    out: list[Ranking] = []
    for row in sorted(rows, key=lambda r: r.rank):
        if row.rank in seen or not row.player:
            continue
        seen.add(row.rank)
        out.append(row)
    return out


def fetch_rankings(fmt: str, discipline: str, gender: str = "mens",
                   *, use_cache: bool = True) -> list[Ranking]:
    url = rankings_url(fmt, discipline, gender)
    html = net.get(url, use_cache=use_cache)
    return parse_rankings(html, fmt, discipline,  # type: ignore[arg-type]
                          "male" if gender == "mens" else "female")


def fetch_all(*, use_cache: bool = True) -> list[Ranking]:
    """Every format x discipline combination we display."""
    out: list[Ranking] = []
    for fmt in FORMATS:
        for discipline in DISCIPLINES:
            try:
                out.extend(fetch_rankings(fmt, discipline, use_cache=use_cache))
            except (net.Blocked, net.FetchError) as exc:
                log.warning("skipping ICC %s/%s: %s", fmt, discipline, exc)
    return out
