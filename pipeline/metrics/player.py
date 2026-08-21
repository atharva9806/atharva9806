"""Per-player, per-format accumulators.

One pass over the ball-by-ball stream fills every dimension we display:

batting   overall, vs bowling type, vs pace/spin, by phase, by opposition,
          by venue country, home/away, by innings number, chasing vs setting,
          by calendar year, by batting position, by dismissal kind, and a
          head-to-head record against individual bowlers
bowling   overall, vs batter hand, by phase, by opposition, by venue country,
          by calendar year, dismissal kinds induced, head-to-head vs batters

Plus an innings-by-innings log, which is what the career-progression chart and
the rolling-form line are drawn from.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field

from ..config import THRESHOLDS
from .base import BatSplit, BowlSplit, dict_of_splits

MIN_HEAD_TO_HEAD_BALLS = 24


def _bat() -> defaultdict[str, BatSplit]:
    return defaultdict(BatSplit)


def _bowl() -> defaultdict[str, BowlSplit]:
    return defaultdict(BowlSplit)


@dataclass(slots=True)
class BattingInnings:
    match_id: str
    date: str
    opposition: str
    venue: str
    country: str
    runs: int = 0
    balls: int = 0
    fours: int = 0
    sixes: int = 0
    out: bool = False
    position: int = 0
    innings_no: int = 1
    chasing: bool = False
    dismissal: str = ""
    dismissed_by: str = ""

    def to_dict(self) -> dict:
        return {
            "m": self.match_id, "d": self.date, "vs": self.opposition,
            "g": self.venue, "c": self.country, "r": self.runs, "b": self.balls,
            "f4": self.fours, "f6": self.sixes, "out": self.out,
            "pos": self.position, "inn": self.innings_no,
            "chase": self.chasing, "how": self.dismissal, "by": self.dismissed_by,
        }


@dataclass(slots=True)
class BowlingInnings:
    match_id: str
    date: str
    opposition: str
    venue: str
    country: str
    balls: int = 0
    runs: int = 0
    wickets: int = 0
    maidens: int = 0

    def to_dict(self) -> dict:
        return {
            "m": self.match_id, "d": self.date, "vs": self.opposition,
            "g": self.venue, "c": self.country, "b": self.balls,
            "r": self.runs, "w": self.wickets, "md": self.maidens,
        }


@dataclass
class PlayerFormat:
    """Everything we know about one player in one format."""
    player_id: str
    name: str
    fmt: str
    teams: set[str] = field(default_factory=set)

    # --- batting ---------------------------------------------------------
    bat_overall: BatSplit = field(default_factory=BatSplit)
    bat_by_type: defaultdict[str, BatSplit] = field(default_factory=_bat)
    bat_by_family: defaultdict[str, BatSplit] = field(default_factory=_bat)
    bat_by_phase: defaultdict[str, BatSplit] = field(default_factory=_bat)
    bat_by_opposition: defaultdict[str, BatSplit] = field(default_factory=_bat)
    bat_by_country: defaultdict[str, BatSplit] = field(default_factory=_bat)
    bat_by_venue: defaultdict[str, BatSplit] = field(default_factory=_bat)
    bat_by_home: defaultdict[str, BatSplit] = field(default_factory=_bat)
    bat_by_innings_no: defaultdict[str, BatSplit] = field(default_factory=_bat)
    bat_by_chase: defaultdict[str, BatSplit] = field(default_factory=_bat)
    bat_by_year: defaultdict[str, BatSplit] = field(default_factory=_bat)
    bat_by_position: defaultdict[str, BatSplit] = field(default_factory=_bat)
    bat_by_entry: defaultdict[str, BatSplit] = field(default_factory=_bat)
    # Keyed "<bowling type>|<phase>". This is what makes a phase plan genuinely
    # phase-specific rather than a global ranking filtered by convention.
    bat_by_type_phase: defaultdict[str, BatSplit] = field(default_factory=_bat)
    dismissals: defaultdict[str, int] = field(default_factory=lambda: defaultdict(int))
    dismissed_by_type: defaultdict[str, int] = field(default_factory=lambda: defaultdict(int))
    vs_bowler: defaultdict[str, BatSplit] = field(default_factory=_bat)
    bat_innings: list[BattingInnings] = field(default_factory=list)

    # --- bowling ---------------------------------------------------------
    bowl_overall: BowlSplit = field(default_factory=BowlSplit)
    bowl_by_hand: defaultdict[str, BowlSplit] = field(default_factory=_bowl)
    bowl_by_phase: defaultdict[str, BowlSplit] = field(default_factory=_bowl)
    bowl_by_opposition: defaultdict[str, BowlSplit] = field(default_factory=_bowl)
    bowl_by_country: defaultdict[str, BowlSplit] = field(default_factory=_bowl)
    bowl_by_home: defaultdict[str, BowlSplit] = field(default_factory=_bowl)
    bowl_by_year: defaultdict[str, BowlSplit] = field(default_factory=_bowl)
    bowl_by_innings_no: defaultdict[str, BowlSplit] = field(default_factory=_bowl)
    wicket_kinds: defaultdict[str, int] = field(default_factory=lambda: defaultdict(int))
    vs_batter: defaultdict[str, BowlSplit] = field(default_factory=_bowl)
    bowl_innings: list[BowlingInnings] = field(default_factory=list)

    # ------------------------------------------------------------------
    # Batting
    # ------------------------------------------------------------------
    def add_batting_ball(self, d, *, bowler_type: str, bowler_family: str,
                         home: str, position: int, year: str, out: bool) -> None:
        faced = d.is_batter_ball
        dot = d.is_dot
        runs = d.runs_batter
        args = (runs, faced, out, dot)

        self.bat_overall.add(*args)
        if bowler_type:
            self.bat_by_type[bowler_type].add(*args)
            self.bat_by_type_phase[f"{bowler_type}|{d.phase}"].add(*args)
        if bowler_family:
            self.bat_by_family[bowler_family].add(*args)
        self.bat_by_phase[d.phase].add(*args)
        if d.bowling_team:
            self.bat_by_opposition[d.bowling_team].add(*args)
        if d.country:
            self.bat_by_country[d.country].add(*args)
        if d.venue:
            self.bat_by_venue[d.venue].add(*args)
        if home:
            self.bat_by_home[home].add(*args)
        self.bat_by_innings_no[str(d.innings)].add(*args)
        self.bat_by_chase["chasing" if d.chasing else "setting"].add(*args)
        if year:
            self.bat_by_year[year].add(*args)
        if position:
            self.bat_by_position[str(position)].add(*args)
        # bat_by_entry is filled by add_entry_phase(), which needs the ball
        # index within the batter's own innings rather than the team's.
        if d.bowler:
            self.vs_bowler[d.bowler].add(*args)

    def add_entry_phase(self, phase_key: str, runs: int, faced: bool,
                        out: bool, dot: bool) -> None:
        """Split by how far into the batter's own innings the ball came.

        'New at the crease' vs 'set' is one of the most actionable weaknesses in
        the game - a batter who averages 45 but is dismissed disproportionately
        inside their first 15 balls has a very different plan bowled at them.
        """
        self.bat_by_entry[phase_key].add(runs, faced, out, dot)

    def add_batting_innings(self, inn: BattingInnings) -> None:
        self.bat_innings.append(inn)
        self.bat_overall.innings += 1
        if inn.dismissal:
            self.dismissals[inn.dismissal] += 1
        if inn.position:
            self.bat_by_position[str(inn.position)].innings += 1

    # ------------------------------------------------------------------
    # Bowling
    # ------------------------------------------------------------------
    def add_bowling_ball(self, d, *, batter_hand: str, home: str,
                         year: str, wicket: bool) -> None:
        # A bowler is charged with everything except byes and leg byes.
        conceded = d.runs_batter + d.wides + d.noballs
        legal = d.is_legal
        dot = legal and d.runs_total == 0
        four = d.runs_batter == 4
        six = d.runs_batter == 6
        args = (conceded, legal, wicket, dot, four, six, d.wides, d.noballs)

        self.bowl_overall.add(*args)
        if batter_hand:
            self.bowl_by_hand[batter_hand].add(*args)
        self.bowl_by_phase[d.phase].add(*args)
        if d.batting_team:
            self.bowl_by_opposition[d.batting_team].add(*args)
        if d.country:
            self.bowl_by_country[d.country].add(*args)
        if home:
            self.bowl_by_home[home].add(*args)
        if year:
            self.bowl_by_year[year].add(*args)
        self.bowl_by_innings_no[str(d.innings)].add(*args)
        if d.batter:
            self.vs_batter[d.batter].add(*args)
        if wicket and d.wicket_kind:
            self.wicket_kinds[d.wicket_kind] += 1

    def add_bowling_innings(self, inn: BowlingInnings) -> None:
        self.bowl_innings.append(inn)
        self.bowl_overall.innings += 1

    # ------------------------------------------------------------------
    def has_batting(self) -> bool:
        return self.bat_overall.balls >= 30

    def has_bowling(self) -> bool:
        return self.bowl_overall.balls >= 60

    def career_span(self) -> tuple[str, str]:
        dates = [i.date for i in self.bat_innings if i.date]
        dates += [i.date for i in self.bowl_innings if i.date]
        if not dates:
            return "", ""
        return min(dates), max(dates)
