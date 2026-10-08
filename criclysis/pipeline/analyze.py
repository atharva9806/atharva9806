"""Turn splits into evidenced strengths and weaknesses.

The method
----------
A raw split is not a finding. "Averages 22 against left-arm orthodox" only means
something once you know (a) what that player averages overall, and (b) what
other players of the same standing average against the same bowling. So every
claim this module emits carries three numbers:

    value          the player's figure in that split
    baseline       the same player's overall figure in that format
    cohortMedian   the median across everyone who qualifies

and a percentile against the cohort. A claim survives only if it clears a
sample-size gate, moves the needle against the player's own baseline by more
than a trivial margin, and sits in the tail of the cohort distribution.

Small samples are handled by shrinking each split towards the player's own
overall figure (see :func:`stats.shrink`). Without that, every player has a
"catastrophic weakness" against whichever bowling type happened to dismiss them
twice in a short spell.
"""
from __future__ import annotations

import logging
from dataclasses import asdict, dataclass, field

from .config import BOWLING_TYPES, PHASES, THRESHOLDS
from .metrics.base import BatSplit, BowlSplit
from .stats import median, percentile_of, quantile, shrink
from .styles import label as style_label

log = logging.getLogger(__name__)

# Balls at which a split estimate is weighted equally with the player's own
# baseline. Tuned so a ~500-ball split is mostly its own number.
SHRINK_K_BAT = 200.0
SHRINK_K_BOWL = 300.0

ENTRY_LABELS = {"new": "New at the crease (first 15 balls)",
                "settling": "Settling in (balls 16-40)",
                "set": "Once set (40+ balls)"}
HOME_LABELS = {"home": "At home", "away": "Away from home"}
CHASE_LABELS = {"chasing": "Chasing", "setting": "Batting first"}
HAND_LABELS = {"right": "Right-handed batters", "left": "Left-handed batters"}


@dataclass
class Claim:
    id: str
    kind: str                 # "strength" | "weakness"
    discipline: str           # "batting" | "bowling"
    dimension: str
    dimension_key: str
    subject: str
    subject_key: str
    metric: str
    metric_label: str
    value: float
    baseline: float | None
    cohort_median: float
    percentile: float
    balls: int
    sample_note: str
    confidence: str
    text: str
    higher_is_better: bool

    def to_dict(self) -> dict:
        d = asdict(self)
        d["cohortMedian"] = d.pop("cohort_median")
        d["dimensionKey"] = d.pop("dimension_key")
        d["subjectKey"] = d.pop("subject_key")
        d["metricLabel"] = d.pop("metric_label")
        d["sampleNote"] = d.pop("sample_note")
        d["higherIsBetter"] = d.pop("higher_is_better")
        return d


# ---------------------------------------------------------------------------
# Dimension specifications
# ---------------------------------------------------------------------------
@dataclass
class Dimension:
    key: str
    label: str
    attr: str                       # attribute on PlayerFormat
    discipline: str
    metric: str                     # attribute on the split
    metric_label: str
    higher_is_better: bool
    labeller: object = None         # callable(subject_key) -> str
    min_balls: int = 0
    min_claim_balls: int = 0
    # Only emit claims for these subjects (None = all)
    subjects: tuple[str, ...] | None = None

    def label_for(self, key: str) -> str:
        if callable(self.labeller):
            return self.labeller(key)          # type: ignore[operator]
        return key


T = THRESHOLDS


def _phase_label(fmt: str):
    lookup = {k: lbl for k, _s, _e, lbl in PHASES.get(fmt, PHASES["odi"])}
    return lambda key: lookup.get(key, key)


def batting_dimensions(fmt: str) -> list[Dimension]:
    return [
        Dimension("vs_type", "Bowling type", "bat_by_type", "batting",
                  "average", "average", True, style_label,
                  T.min_balls_split, T.min_balls_claim),
        Dimension("vs_type_sr", "Bowling type", "bat_by_type", "batting",
                  "strike_rate", "strike rate", True, style_label,
                  T.min_balls_split, T.min_balls_claim),
        Dimension("vs_family", "Pace or spin", "bat_by_family", "batting",
                  "average", "average", True,
                  lambda k: {"pace": "Pace", "spin": "Spin"}.get(k, k),
                  T.min_balls_split, T.min_balls_claim),
        Dimension("phase", "Match phase", "bat_by_phase", "batting",
                  "strike_rate", "strike rate", True, _phase_label(fmt),
                  T.min_balls_split, T.min_balls_claim),
        Dimension("phase_avg", "Match phase", "bat_by_phase", "batting",
                  "average", "average", True, _phase_label(fmt),
                  T.min_balls_split, T.min_balls_claim),
        Dimension("entry", "Stage of innings", "bat_by_entry", "batting",
                  "balls_per_dismissal", "balls per dismissal", True,
                  lambda k: ENTRY_LABELS.get(k, k),
                  T.min_balls_split, T.min_balls_claim),
        Dimension("home", "Home or away", "bat_by_home", "batting",
                  "average", "average", True, lambda k: HOME_LABELS.get(k, k),
                  T.min_balls_split, T.min_balls_claim),
        Dimension("chase", "Innings context", "bat_by_chase", "batting",
                  "average", "average", True, lambda k: CHASE_LABELS.get(k, k),
                  T.min_balls_split, T.min_balls_claim),
        Dimension("country", "Country", "bat_by_country", "batting",
                  "average", "average", True, None,
                  T.min_balls_split, T.min_balls_claim),
        Dimension("opposition", "Opposition", "bat_by_opposition", "batting",
                  "average", "average", True, None,
                  T.min_balls_split, T.min_balls_claim),
    ]


def bowling_dimensions(fmt: str) -> list[Dimension]:
    return [
        Dimension("vs_hand", "Batter hand", "bowl_by_hand", "bowling",
                  "average", "average", False, lambda k: HAND_LABELS.get(k, k),
                  T.min_balls_bowled_split, T.min_balls_bowled_claim),
        Dimension("vs_hand_econ", "Batter hand", "bowl_by_hand", "bowling",
                  "economy", "economy", False, lambda k: HAND_LABELS.get(k, k),
                  T.min_balls_bowled_split, T.min_balls_bowled_claim),
        Dimension("phase", "Match phase", "bowl_by_phase", "bowling",
                  "economy", "economy", False, _phase_label(fmt),
                  T.min_balls_bowled_split, T.min_balls_bowled_claim),
        Dimension("phase_sr", "Match phase", "bowl_by_phase", "bowling",
                  "strike_rate", "strike rate", False, _phase_label(fmt),
                  T.min_balls_bowled_split, T.min_balls_bowled_claim),
        Dimension("home", "Home or away", "bowl_by_home", "bowling",
                  "average", "average", False, lambda k: HOME_LABELS.get(k, k),
                  T.min_balls_bowled_split, T.min_balls_bowled_claim),
        Dimension("country", "Country", "bowl_by_country", "bowling",
                  "average", "average", False, None,
                  T.min_balls_bowled_split, T.min_balls_bowled_claim),
        Dimension("opposition", "Opposition", "bowl_by_opposition", "bowling",
                  "average", "average", False, None,
                  T.min_balls_bowled_split, T.min_balls_bowled_claim),
    ]


# ---------------------------------------------------------------------------
def _metric_value(split, metric: str) -> float | None:
    value = getattr(split, metric)
    # -1.0 is our sentinel for "never dismissed / no wickets", which is not a
    # number any distribution should contain.
    if value is None or value < 0:
        return None
    return float(value)


def _baseline(record, dimension: Dimension) -> float | None:
    overall = record.bat_overall if dimension.discipline == "batting" else record.bowl_overall
    return _metric_value(overall, dimension.metric)


def _confidence(balls: int, claim_gate: int) -> str:
    if balls >= claim_gate * 3:
        return "high"
    if balls >= claim_gate * 1.5:
        return "medium"
    return "low"


class Cohort:
    """The comparison group a player's splits are judged against."""

    def __init__(self, fmt: str, records: dict[str, object]):
        self.fmt = fmt
        self.records = records
        self.bat_pool = [r for r in records.values()
                         if r.bat_overall.balls >= T.min_balls_cohort]      # type: ignore[attr-defined]
        self.bowl_pool = [r for r in records.values()
                          if r.bowl_overall.balls >= T.min_balls_bowled_cohort]  # type: ignore[attr-defined]
        self._dist: dict[tuple[str, str, str], list[float]] = {}
        self._rel: dict[tuple[str, str, str], list[float]] = {}
        self._overall: dict[tuple[str, str], list[float]] = {}

    def pool(self, discipline: str) -> list:
        return self.bat_pool if discipline == "batting" else self.bowl_pool

    def _fill(self, dimension: Dimension, subject: str) -> None:
        """Compute both cohort distributions for one dimension/subject."""
        key = (dimension.attr, dimension.metric, subject)
        values: list[float] = []
        ratios: list[float] = []
        for record in self.pool(dimension.discipline):
            splits = getattr(record, dimension.attr, None)
            if not splits:
                continue
            split = splits.get(subject)
            if split is None or split.balls < dimension.min_balls:
                continue
            value = _metric_value(split, dimension.metric)
            if value is None:
                continue
            baseline = _baseline(record, dimension)
            if baseline is None or baseline <= 0:
                continue
            k = SHRINK_K_BAT if dimension.discipline == "batting" else SHRINK_K_BOWL
            shrunk = shrink(value, baseline, split.balls, k)
            values.append(shrunk)
            ratios.append(shrunk / baseline)
        values.sort()
        ratios.sort()
        self._dist[key] = values
        self._rel[key] = ratios

    def distribution(self, dimension: Dimension, subject: str) -> list[float]:
        """Sorted cohort values for one dimension/subject, cached."""
        key = (dimension.attr, dimension.metric, subject)
        if key not in self._dist:
            self._fill(dimension, subject)
        return self._dist[key]

    def relative_distribution(self, dimension: Dimension, subject: str) -> list[float]:
        """Cohort values expressed as a ratio to each player's own baseline.

        This is the distribution a claim is judged against, and it is the whole
        difference between a useful finding and a truism. Judged on absolute
        numbers, a moderate batter sits below the cohort median against every
        type of bowling, and the site would announce six "weaknesses" that only
        restate that they are a moderate batter. Judged on the ratio to their
        own baseline, the question becomes the one worth asking: relative to how
        this player normally bats, is leg spin a problem for them by more than
        it is a problem for everybody else?
        """
        key = (dimension.attr, dimension.metric, subject)
        if key not in self._rel:
            self._fill(dimension, subject)
        return self._rel[key]

    def overall_distribution(self, discipline: str, metric: str) -> list[float]:
        key = (discipline, metric)
        cached = self._overall.get(key)
        if cached is not None:
            return cached
        values = []
        for record in self.pool(discipline):
            overall = record.bat_overall if discipline == "batting" else record.bowl_overall
            value = _metric_value(overall, metric)
            if value is not None:
                values.append(value)
        values.sort()
        self._overall[key] = values
        return values


def _format_value(value: float, metric: str) -> str:
    if metric in ("strike_rate",) :
        return f"{value:.1f}"
    if metric == "economy":
        return f"{value:.2f}"
    if metric == "balls_per_dismissal":
        return f"{value:.0f}"
    return f"{value:.1f}"


def _claim_text(dimension: Dimension, subject_label: str, value: float,
                baseline: float | None, cohort_med: float, percentile: float,
                balls: int, kind: str, discipline: str) -> str:
    v = _format_value(value, dimension.metric)
    m = dimension.metric_label
    unit = "balls" if discipline == "batting" else "balls bowled"
    parts = [f"{subject_label}: {m} of {v}"]

    if baseline is not None and baseline > 0:
        diff = value - baseline
        direction = "above" if diff > 0 else "below"
        parts.append(
            f"{_format_value(abs(diff), dimension.metric)} {direction} "
            f"their overall {m} of {_format_value(baseline, dimension.metric)}")

    # A percentile of 5 means "only 5% of comparable players rate lower", so it
    # reads as bottom 5% - not bottom 95%.
    if percentile >= 50:
        rank = f"top {max(1.0, 100 - percentile):.0f}%"
    else:
        rank = f"bottom {max(1.0, percentile):.0f}%"
    parts.append(f"{rank} of comparable players "
                 f"(cohort median {_format_value(cohort_med, dimension.metric)})")
    parts.append(f"{balls} {unit}")
    return " — ".join(parts) + "."


def analyse_player(record, cohort: Cohort, fmt: str) -> dict:
    """Produce strengths, weaknesses and percentile profile for one player."""
    claims: list[Claim] = []

    dimensions = []
    if record.bat_overall.balls >= T.min_balls_claim:
        dimensions += batting_dimensions(fmt)
    if record.bowl_overall.balls >= T.min_balls_bowled_claim:
        dimensions += bowling_dimensions(fmt)

    for dimension in dimensions:
        splits = getattr(record, dimension.attr, None)
        if not splits:
            continue
        baseline = _baseline(record, dimension)
        k = SHRINK_K_BAT if dimension.discipline == "batting" else SHRINK_K_BOWL

        for subject, split in splits.items():
            if split.balls < dimension.min_claim_balls:
                continue
            raw = _metric_value(split, dimension.metric)
            if raw is None or baseline is None:
                continue
            if baseline <= 0:
                continue
            value = shrink(raw, baseline, split.balls, k)
            dist = cohort.distribution(dimension, subject)
            rel_dist = cohort.relative_distribution(dimension, subject)
            if len(rel_dist) < 8:
                # Too few comparable players for a percentile to mean anything.
                continue
            # Percentile against how far other players deviate from their own
            # baseline in this same split - not against the raw number.
            pct = percentile_of(rel_dist, value / baseline, dimension.higher_is_better)
            cohort_med = median(dist)

            # Effect size relative to the player's own baseline.
            rel = (value - baseline) / baseline
            if not dimension.higher_is_better:
                rel = -rel
            if abs(rel) < T.min_effect:
                continue

            if pct >= T.strength_pct and rel > 0:
                kind = "strength"
            elif pct <= T.weakness_pct and rel < 0:
                kind = "weakness"
            else:
                continue

            label = dimension.label_for(subject)
            claims.append(Claim(
                id=f"{dimension.discipline}.{dimension.key}.{subject}",
                kind=kind,
                discipline=dimension.discipline,
                dimension=dimension.label,
                dimension_key=dimension.key,
                subject=label,
                subject_key=subject,
                metric=dimension.metric,
                metric_label=dimension.metric_label,
                value=round(raw, 2),
                baseline=round(baseline, 2),
                cohort_median=round(cohort_med, 2),
                percentile=round(pct, 1),
                balls=split.balls,
                sample_note=f"{split.balls} balls",
                confidence=_confidence(split.balls, dimension.min_claim_balls),
                text=_claim_text(dimension, label, raw, baseline, cohort_med,
                                 pct, split.balls, kind, dimension.discipline),
                higher_is_better=dimension.higher_is_better,
            ))

    # Rank by how far into the tail they sit, weighted by confidence.
    weight = {"high": 1.0, "medium": 0.8, "low": 0.55}

    def severity(c: Claim) -> float:
        tail = c.percentile if c.kind == "strength" else 100 - c.percentile
        return tail * weight[c.confidence]

    strengths = sorted([c for c in claims if c.kind == "strength"],
                       key=severity, reverse=True)
    weaknesses = sorted([c for c in claims if c.kind == "weakness"],
                        key=severity, reverse=True)

    return {
        "strengths": [c.to_dict() for c in strengths[:12]],
        "weaknesses": [c.to_dict() for c in weaknesses[:12]],
        "profile": percentile_profile(record, cohort),
    }


# ---------------------------------------------------------------------------
# Radar profile
# ---------------------------------------------------------------------------
BAT_AXES = [
    ("runScoring", "Run scoring", "bat_overall", "average", True, None),
    ("tempo", "Scoring rate", "bat_overall", "strike_rate", True, None),
    ("vsPace", "Against pace", "bat_by_family", "average", True, "pace"),
    ("vsSpin", "Against spin", "bat_by_family", "average", True, "spin"),
    ("durability", "Time at the crease", "bat_overall", "balls_per_dismissal", True, None),
    ("boundaries", "Boundary hitting", "bat_overall", "boundary_pct", True, None),
    ("rotation", "Strike rotation", "bat_overall", "dot_pct", False, None),
]

BOWL_AXES = [
    ("wicketTaking", "Wicket taking", "bowl_overall", "strike_rate", False, None),
    ("control", "Economy", "bowl_overall", "economy", False, None),
    ("average", "Bowling average", "bowl_overall", "average", False, None),
    ("vsRight", "To right-handers", "bowl_by_hand", "average", False, "right"),
    ("vsLeft", "To left-handers", "bowl_by_hand", "average", False, "left"),
    ("dots", "Dot pressure", "bowl_overall", "dot_pct", True, None),
]


def _axis_value(record, attr: str, metric: str, subject: str | None):
    holder = getattr(record, attr, None)
    if holder is None:
        return None, 0
    split = holder if subject is None else holder.get(subject)
    if split is None:
        return None, 0
    return _metric_value(split, metric), split.balls


def percentile_profile(record, cohort: Cohort) -> dict:
    """Percentile on each radar axis - the shape of a player at a glance."""
    out: dict[str, dict] = {}

    def build(axes, discipline, gate):
        overall = record.bat_overall if discipline == "batting" else record.bowl_overall
        if overall.balls < gate:
            return
        for key, label, attr, metric, higher, subject in axes:
            value, balls = _axis_value(record, attr, metric, subject)
            if value is None or balls < gate // 4:
                continue
            if subject is None:
                dist = cohort.overall_distribution(discipline, metric)
            else:
                dim = Dimension(key, label, attr, discipline, metric, label,
                                higher, None,
                                T.min_balls_split if discipline == "batting"
                                else T.min_balls_bowled_split, 0)
                dist = cohort.distribution(dim, subject)
            if len(dist) < 8:
                continue
            out[key] = {
                "label": label,
                "value": round(value, 2),
                "percentile": round(percentile_of(dist, value, higher), 1),
                "discipline": discipline,
                "balls": balls,
            }

    build(BAT_AXES, "batting", T.min_balls_claim)
    build(BOWL_AXES, "bowling", T.min_balls_bowled_claim)
    return out


def cohort_reference(cohort: Cohort) -> dict:
    """Cohort quartiles, so the site can draw distribution context on charts."""
    out: dict[str, dict] = {}
    for discipline, metrics in (
        ("batting", ["average", "strike_rate", "dot_pct", "boundary_pct",
                     "balls_per_dismissal"]),
        ("bowling", ["average", "economy", "strike_rate", "dot_pct"]),
    ):
        for metric in metrics:
            dist = cohort.overall_distribution(discipline, metric)
            if len(dist) < 8:
                continue
            out[f"{discipline}.{metric}"] = {
                "n": len(dist),
                "p10": round(quantile(dist, 0.10), 2),
                "p25": round(quantile(dist, 0.25), 2),
                "p50": round(quantile(dist, 0.50), 2),
                "p75": round(quantile(dist, 0.75), 2),
                "p90": round(quantile(dist, 0.90), 2),
            }
    return out
