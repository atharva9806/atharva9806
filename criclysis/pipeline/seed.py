"""Build the bundled demo dataset.

Simulates a fictional international cricket world, then runs it through exactly
the same aggregator, analyser and exporter that real Cricsheet data goes
through. The manifest marks the result ``dataset: "demo"``; the site shows a
standing banner while that flag is set, and ``python -m pipeline build``
replaces every file here with real data.
"""
from __future__ import annotations

import hashlib
import logging
import random
from datetime import date, timedelta
from pathlib import Path

from .aggregate import Aggregator
from .config import FORMATS, SOURCES
from .simulate import TEAMS, MatchSimulator, make_roster
from .sources.cricsheet import parse_match
from .export import export_all
from .venues import CITY_COUNTRY, TEAM_HOME, VENUE_COUNTRY

log = logging.getLogger(__name__)

SEED = 20240817
START = date(2011, 1, 12)

# How many matches to simulate per format.
#
# Two competing pressures: enough balls per player that the analysis engine's
# sample-size gates have real work to do, and a small enough committed dataset
# that cloning the repository is not a chore. These counts leave every batter
# several thousand balls per format - comfortably above the 150-ball claim gate -
# while keeping web/data around 8 MB.
MATCH_COUNT = {"test": 170, "odi": 260, "t20i": 300}
XI = 11


def _fixture_list(rng: random.Random, count: int, start: date) -> list[tuple]:
    """Round-robin fixtures with a home venue for each."""
    fixtures = []
    day = start
    for i in range(count):
        home_idx = i % len(TEAMS)
        away_idx = (i // len(TEAMS) + 1 + home_idx) % len(TEAMS)
        if away_idx == home_idx:
            away_idx = (away_idx + 1) % len(TEAMS)
        home, away = TEAMS[home_idx], TEAMS[away_idx]
        venue, city = rng.choice(home["venues"])
        day = day + timedelta(days=rng.randint(3, 14))
        fixtures.append((home["name"], away["name"], venue, city, day.isoformat()))
    return fixtures


def _pick_xi(rng: random.Random, squad: list, year: int) -> list:
    """Pick a plausible XI: top order, all-rounders, then the bowlers."""
    batters = [p for p in squad if p.order <= 7]
    bowlers = [p for p in squad if p.order > 7]
    # Weight selection by current form so careers rise and fall.
    def weight(p):
        return max(0.05, p.form(year))
    chosen = rng.sample(batters, min(7, len(batters))) if len(batters) > 7 else list(batters)
    chosen = sorted(chosen, key=lambda p: p.order)[:7]
    picks = sorted(bowlers, key=lambda p: (-weight(p) * (1 + p.bowl_threat)))[:4]
    xi = chosen + picks
    return sorted(xi, key=lambda p: p.order)[:XI]


def _register_geography() -> None:
    """Teach the venue lookup about the simulated world.

    Without this the demo silently loses the home/away and by-country splits -
    the lookup only knows real grounds - which would make those parts of the
    site look broken rather than exercised.
    """
    for team in TEAMS:
        TEAM_HOME[team["name"]] = team["home"]
        for venue, city in team["venues"]:
            VENUE_COUNTRY[venue] = team["home"]
            CITY_COUNTRY[city] = team["home"]


def build_seed(out_dir: Path, *, pretty: bool = False) -> int:
    _register_geography()
    rng = random.Random(SEED)
    roster = make_roster(rng)
    by_team: dict[str, list] = {}
    for player in roster:
        by_team.setdefault(player.team, []).append(player)

    styles = {p.name: p.bowling_type for p in roster}
    hands = {p.name: p.batting_hand for p in roster}
    metadata = {
        p.name: {
            "bowlingType": p.bowling_type,
            "battingHand": p.batting_hand,
            "role": p.role,
            "country": p.team,
            "cricinfoId": "",
            "fullName": p.name,
            "born": "",
        }
        for p in roster
    }

    aggregators: dict[str, Aggregator] = {}
    for fmt in FORMATS:
        # Same reason as stable_id(): a salted hash would reseed differently
        # on every run and the dataset would not be reproducible.
        fmt_salt = int(hashlib.sha1(fmt.encode()).hexdigest()[:6], 16)
        sim_rng = random.Random(SEED + fmt_salt)
        sim = MatchSimulator(fmt, sim_rng)
        agg = Aggregator(fmt, styles=styles, hands=hands)
        fixtures = _fixture_list(sim_rng, MATCH_COUNT[fmt], START)
        for i, (home, away, venue, city, day) in enumerate(fixtures):
            year = int(day[:4])
            raw = sim.match(_pick_xi(sim_rng, by_team[home], year),
                            _pick_xi(sim_rng, by_team[away], year),
                            day, venue, city, f"{fmt}-{i:04d}")
            match, deliveries = parse_match(raw, f"{fmt}-{i:04d}", fmt)
            agg.registry.update(match.registry)
            agg.add_match(match, deliveries)
        agg.finalise()
        aggregators[fmt] = agg
        log.info("simulated %s: %s", fmt, agg.summary())

    provenance = {
        "dataset": "demo",
        "seed": SEED,
        "notice": (
            "This is a SIMULATED dataset. Every player, team and venue in it is "
            "fictional and every number was generated by pipeline/simulate.py "
            "from a seeded random model. It exists so the site is explorable "
            "before you build the real dataset, and so the analysis engine can "
            "be checked against planted, known-correct answers. Run "
            "`python -m pipeline all` to replace it with real Cricsheet data."
        ),
        "sources": [
            {"id": "simulation", "used": True,
             "note": "pipeline/simulate.py, seeded and reproducible"},
            {"id": "cricsheet", "used": False,
             "note": "Not contacted - run `python -m pipeline all` for real data"},
            {"id": "espncricinfo", "used": False, "note": "Not contacted"},
        ],
    }

    summary = export_all(aggregators, metadata, out_dir,
                         provenance=provenance, pretty=pretty)
    log.info("demo dataset: %d players -> %s", summary["players"], out_dir)
    return 0
