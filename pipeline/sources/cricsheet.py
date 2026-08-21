"""Cricsheet adapter.

Cricsheet publishes ball-by-ball data for essentially every men's and women's
international since the mid-2000s, plus the major franchise leagues, under
CC BY 4.0. It is the primary source for this project: aggregate scorecards
(Statsguru, ICC) can tell you a batter averages 48, but only ball-by-ball data
can tell you they average 21 against left-arm wrist spin in the middle overs,
which is the kind of statement this site exists to make.

Attribution requirement (CC BY 4.0): any deployment must credit Cricsheet. The
generated ``sources.json`` carries that credit and the About page renders it.
"""
from __future__ import annotations

import csv
import io
import json
import logging
import zipfile
from collections.abc import Iterator
from dataclasses import dataclass, field
from pathlib import Path

from ..config import ALL_FORMATS, PHASES, RAW_DIR, SOURCES
from .. import net

log = logging.getLogger(__name__)

BASE = SOURCES["cricsheet"]["base"]
REGISTER_URL = f"{BASE}/register/people.csv"


# ---------------------------------------------------------------------------
# Normalised records
# ---------------------------------------------------------------------------
@dataclass(slots=True)
class Delivery:
    """One delivery, flattened into the shape every metric module consumes."""
    match_id: str
    fmt: str
    date: str
    season: str
    venue: str
    city: str
    country: str
    gender: str
    innings: int
    batting_team: str
    bowling_team: str
    over: int
    ball_in_over: int
    ball_no: int              # legal balls bowled in this innings before + 1
    batter: str
    non_striker: str
    bowler: str
    runs_batter: int
    runs_extras: int
    runs_total: int
    wides: int
    noballs: int
    byes: int
    legbyes: int
    is_legal: bool            # counts towards the over
    is_batter_ball: bool      # counts as a ball faced by the batter
    wicket_kind: str | None
    player_out: str | None
    bowler_credited: bool     # dismissal attributed to the bowler
    phase: str
    chasing: bool
    target: int | None
    score_before: int
    wickets_before: int

    @property
    def is_boundary_four(self) -> bool:
        return self.runs_batter == 4

    @property
    def is_boundary_six(self) -> bool:
        return self.runs_batter == 6

    @property
    def is_dot(self) -> bool:
        # A dot for the batter: no run off the bat and no run taken.
        return self.is_batter_ball and self.runs_batter == 0 and self.runs_total == 0


@dataclass(slots=True)
class MatchInfo:
    match_id: str
    fmt: str
    date: str
    season: str
    venue: str
    city: str
    gender: str
    teams: list[str]
    winner: str | None
    toss_winner: str | None
    toss_decision: str | None
    players: dict[str, list[str]] = field(default_factory=dict)
    registry: dict[str, str] = field(default_factory=dict)


# Dismissals that are not credited to the bowler.
NON_BOWLER_DISMISSALS = {
    "run out", "retired hurt", "retired out", "retired not out",
    "obstructing the field", "handled the ball", "timed out",
}


def archive_path(fmt: str) -> Path:
    return RAW_DIR / "cricsheet" / ALL_FORMATS[fmt]["archive"]


def download_archive(fmt: str, *, use_cache: bool = True) -> Path:
    """Fetch the bulk JSON archive for one format."""
    spec = ALL_FORMATS[fmt]
    url = f"{BASE}/downloads/{spec['archive']}"
    dest = archive_path(fmt)
    log.info("downloading %s -> %s", url, dest)
    return net.download(url, dest, use_cache=use_cache)


def phase_for(fmt: str, over: int) -> str:
    for key, start, end, _label in PHASES.get(fmt, PHASES["odi"]):
        if start <= over < end:
            return key
    return PHASES.get(fmt, PHASES["odi"])[-1][0]


def _venue_country(venue: str, city: str) -> str:
    """Best-effort country attribution for a venue.

    Cricsheet does not carry a country field, so we fall back to a lookup keyed
    on city. ``enrich.py`` can overwrite this with a better mapping; an unknown
    country simply drops the venue out of the home/away split rather than
    guessing.
    """
    from ..venues import VENUE_COUNTRY, CITY_COUNTRY
    if venue in VENUE_COUNTRY:
        return VENUE_COUNTRY[venue]
    for name, country in VENUE_COUNTRY.items():
        if name and name in venue:
            return country
    return CITY_COUNTRY.get(city, "")


def parse_match(raw: dict, match_id: str, fmt: str) -> tuple[MatchInfo, list[Delivery]]:
    """Turn one Cricsheet match document into a MatchInfo plus flat deliveries."""
    info = raw.get("info", {})
    dates = info.get("dates") or [""]
    venue = info.get("venue", "")
    city = info.get("city", "")
    teams = info.get("teams", [])
    outcome = info.get("outcome", {})

    match = MatchInfo(
        match_id=match_id,
        fmt=fmt,
        date=dates[0],
        season=str(info.get("season", "")),
        venue=venue,
        city=city,
        gender=info.get("gender", "male"),
        teams=list(teams),
        winner=outcome.get("winner"),
        toss_winner=(info.get("toss") or {}).get("winner"),
        toss_decision=(info.get("toss") or {}).get("decision"),
        players=info.get("players", {}) or {},
        registry=((info.get("registry") or {}).get("people") or {}),
    )
    country = _venue_country(venue, city)

    deliveries: list[Delivery] = []
    for idx, inn in enumerate(raw.get("innings", [])):
        if inn.get("super_over"):
            continue
        batting_team = inn.get("team", "")
        bowling_team = next((t for t in teams if t != batting_team), "")
        target = (inn.get("target") or {}).get("runs")
        chasing = target is not None
        ball_no = 0
        score = 0
        wickets = 0

        for over_block in inn.get("overs", []):
            over = int(over_block.get("over", 0))
            for pos, d in enumerate(over_block.get("deliveries", [])):
                runs = d.get("runs", {})
                extras = d.get("extras", {}) or {}
                wides = int(extras.get("wides", 0))
                noballs = int(extras.get("noballs", 0))
                byes = int(extras.get("byes", 0))
                legbyes = int(extras.get("legbyes", 0))
                is_legal = wides == 0 and noballs == 0
                # A wide is not a ball faced; a no-ball is.
                is_batter_ball = wides == 0

                if is_legal:
                    ball_no += 1

                wicket_kind = None
                player_out = None
                credited = False
                for w in d.get("wickets", []) or []:
                    wicket_kind = w.get("kind")
                    player_out = w.get("player_out")
                    credited = wicket_kind not in NON_BOWLER_DISMISSALS
                    break  # at most one wicket matters for our metrics

                deliveries.append(Delivery(
                    match_id=match_id,
                    fmt=fmt,
                    date=match.date,
                    season=match.season,
                    venue=venue,
                    city=city,
                    country=country,
                    gender=match.gender,
                    innings=idx + 1,
                    batting_team=batting_team,
                    bowling_team=bowling_team,
                    over=over,
                    ball_in_over=pos + 1,
                    ball_no=ball_no,
                    batter=d.get("batter", ""),
                    non_striker=d.get("non_striker", ""),
                    bowler=d.get("bowler", ""),
                    runs_batter=int(runs.get("batter", 0)),
                    runs_extras=int(runs.get("extras", 0)),
                    runs_total=int(runs.get("total", 0)),
                    wides=wides,
                    noballs=noballs,
                    byes=byes,
                    legbyes=legbyes,
                    is_legal=is_legal,
                    is_batter_ball=is_batter_ball,
                    wicket_kind=wicket_kind,
                    player_out=player_out,
                    bowler_credited=credited,
                    phase=phase_for(fmt, over),
                    chasing=chasing,
                    target=target,
                    score_before=score,
                    wickets_before=wickets,
                ))
                score += int(runs.get("total", 0))
                if wicket_kind:
                    wickets += 1

    return match, deliveries


def iter_matches(fmt: str, *, limit: int | None = None,
                 gender: str | None = "male",
                 path: Path | None = None) -> Iterator[tuple[MatchInfo, list[Delivery]]]:
    """Stream every match in a format's archive.

    Yields one match at a time so that a full pass over ~20k matches never needs
    more than one match in memory.
    """
    archive = path or archive_path(fmt)
    if not archive.exists():
        raise FileNotFoundError(
            f"{archive} not found - run `python -m pipeline fetch --formats {fmt}` first"
        )
    count = 0
    with zipfile.ZipFile(archive) as zf:
        names = sorted(n for n in zf.namelist() if n.endswith(".json") and "README" not in n)
        for name in names:
            if limit is not None and count >= limit:
                return
            try:
                raw = json.loads(zf.read(name))
            except (json.JSONDecodeError, KeyError) as exc:
                log.warning("skipping unreadable %s: %s", name, exc)
                continue
            if gender and (raw.get("info", {}).get("gender") != gender):
                continue
            match_id = Path(name).stem
            try:
                yield parse_match(raw, match_id, fmt)
            except Exception as exc:  # noqa: BLE001 - one bad file must not kill a run
                log.warning("skipping %s: %s", name, exc)
                continue
            count += 1


def load_register(*, use_cache: bool = True) -> dict[str, dict[str, str]]:
    """Cricsheet's people register: person id -> identifiers on other sites.

    The ``key_cricinfo`` column is what lets us line a Cricsheet player up with
    their ESPNcricinfo profile for the metadata enrichment step.
    """
    text = net.get(REGISTER_URL, use_cache=use_cache)
    reader = csv.DictReader(io.StringIO(text))  # type: ignore[arg-type]
    out: dict[str, dict[str, str]] = {}
    for row in reader:
        ident = row.get("identifier")
        if not ident:
            continue
        out[ident] = {k: v for k, v in row.items() if v}
    return out
