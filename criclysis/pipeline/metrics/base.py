"""Shared split accumulators.

Everything on the site reduces to one of two counters - a batting split and a
bowling split - keyed by whichever dimension we are slicing on (bowling type,
phase, opposition, year, venue country, ...). Keeping the maths in one place
means "average" means exactly the same thing on every screen.
"""
from __future__ import annotations

from dataclasses import dataclass, field

# Runs per dismissal is undefined when a player has never been dismissed in a
# split. Cricket convention is to show the raw runs with a * ; for sorting and
# percentile work we need a number, so we use runs (i.e. treat it as at least
# that good) and flag it.
NO_DISMISSAL = -1.0


@dataclass(slots=True)
class BatSplit:
    balls: int = 0
    runs: int = 0
    outs: int = 0
    fours: int = 0
    sixes: int = 0
    dots: int = 0
    singles: int = 0
    innings: int = 0
    # Attacking / defensive shape
    scoring_balls: int = 0

    def add(self, runs_batter: int, faced: bool, out: bool, dot: bool) -> None:
        if faced:
            self.balls += 1
            if dot:
                self.dots += 1
            else:
                self.scoring_balls += 1
        self.runs += runs_batter
        if runs_batter == 4:
            self.fours += 1
        elif runs_batter == 6:
            self.sixes += 1
        elif runs_batter == 1:
            self.singles += 1
        if out:
            self.outs += 1

    # -- derived -----------------------------------------------------------
    @property
    def average(self) -> float:
        return self.runs / self.outs if self.outs else NO_DISMISSAL

    @property
    def strike_rate(self) -> float:
        return 100.0 * self.runs / self.balls if self.balls else 0.0

    @property
    def balls_per_dismissal(self) -> float:
        return self.balls / self.outs if self.outs else NO_DISMISSAL

    @property
    def dot_pct(self) -> float:
        return 100.0 * self.dots / self.balls if self.balls else 0.0

    @property
    def boundary_pct(self) -> float:
        return 100.0 * (self.fours + self.sixes) / self.balls if self.balls else 0.0

    @property
    def boundary_runs_pct(self) -> float:
        boundary_runs = self.fours * 4 + self.sixes * 6
        return 100.0 * boundary_runs / self.runs if self.runs else 0.0

    def to_dict(self) -> dict:
        return {
            "balls": self.balls, "runs": self.runs, "outs": self.outs,
            "fours": self.fours, "sixes": self.sixes, "dots": self.dots,
            "innings": self.innings,
            "avg": round(self.average, 2) if self.outs else None,
            "sr": round(self.strike_rate, 2),
            "bpd": round(self.balls_per_dismissal, 1) if self.outs else None,
            "dotPct": round(self.dot_pct, 1),
            "bdryPct": round(self.boundary_pct, 1),
            "bdryRunsPct": round(self.boundary_runs_pct, 1),
        }


@dataclass(slots=True)
class BowlSplit:
    balls: int = 0            # legal deliveries
    runs: int = 0             # runs conceded (bowler's account)
    wickets: int = 0          # credited to the bowler
    dots: int = 0
    fours: int = 0
    sixes: int = 0
    wides: int = 0
    noballs: int = 0
    innings: int = 0

    def add(self, runs_conceded: int, legal: bool, wicket: bool,
            dot: bool, four: bool, six: bool,
            wides: int = 0, noballs: int = 0) -> None:
        if legal:
            self.balls += 1
            if dot:
                self.dots += 1
        self.runs += runs_conceded
        self.wides += wides
        self.noballs += noballs
        if four:
            self.fours += 1
        if six:
            self.sixes += 1
        if wicket:
            self.wickets += 1

    # -- derived -----------------------------------------------------------
    @property
    def overs(self) -> float:
        return self.balls / 6.0

    @property
    def economy(self) -> float:
        return self.runs / self.overs if self.balls else 0.0

    @property
    def average(self) -> float:
        return self.runs / self.wickets if self.wickets else NO_DISMISSAL

    @property
    def strike_rate(self) -> float:
        return self.balls / self.wickets if self.wickets else NO_DISMISSAL

    @property
    def dot_pct(self) -> float:
        return 100.0 * self.dots / self.balls if self.balls else 0.0

    @property
    def boundary_pct(self) -> float:
        return 100.0 * (self.fours + self.sixes) / self.balls if self.balls else 0.0

    def to_dict(self) -> dict:
        return {
            "balls": self.balls, "runs": self.runs, "wickets": self.wickets,
            "dots": self.dots, "fours": self.fours, "sixes": self.sixes,
            "innings": self.innings,
            "overs": round(self.overs, 1),
            "econ": round(self.economy, 2),
            "avg": round(self.average, 2) if self.wickets else None,
            "sr": round(self.strike_rate, 1) if self.wickets else None,
            "dotPct": round(self.dot_pct, 1),
            "bdryPct": round(self.boundary_pct, 1),
        }


def dict_of_splits(splits: dict[str, BatSplit | BowlSplit], min_balls: int = 0) -> dict:
    """Serialise a dimension's splits, dropping ones below the sample gate."""
    return {
        key: split.to_dict()
        for key, split in sorted(splits.items())
        if split.balls >= min_balls
    }
