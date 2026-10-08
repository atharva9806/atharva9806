"""Win probability, projected score and par score for limited-overs cricket.

Everything here is learned from Cricsheet ball-by-ball history; nothing is
hand-tuned. The model has two parts:

1. **Resources.** For a side with ``u`` legal balls left and ``w`` wickets down,
   how many more runs do they usually score? Fitted per wicket count to the
   Duckworth-Lewis-style curve ``R(u) = Z * (1 - exp(-b * u))`` from every
   completed first innings. ``R`` gives the projected score, and the spread of
   historical outcomes around it gives a confidence band.

2. **Chase model.** A logistic regression on how much of the remaining
   resources the chase still needs: ``x = log(runs_needed / R(u, w))``. A chase
   that needs exactly what an average side scores from here sits near 50%; one
   that needs twice that is close to lost.

The first-innings win probability is derived, not fitted separately: project
the final total from the resources model, then ask the chase model how often a
chase of that size fails.

Validation trains on matches before ``HOLDOUT_FROM`` and scores every
ball-state in later matches, so the reported Brier score measures matches the
model never saw. The exported model is then refitted on all the data.

Run ``python -m pipeline winprob`` after ``python -m pipeline fetch``.
"""
from __future__ import annotations

import json
import logging
import math
import zipfile
from collections import defaultdict
from collections.abc import Iterator
from dataclasses import dataclass, field
from pathlib import Path

from .config import FORMATS
from .sources.cricsheet import archive_path

log = logging.getLogger(__name__)

#: Formats the model applies to. Tests can be drawn, so a two-outcome model
#: does not fit them.
LIMITED_FORMATS = ("odi", "t20i")

#: Matches on or after this date are held out of training when validating.
HOLDOUT_FROM = "2023-01-01"

#: Dismissals that do not cost the batting side a wicket.
NOT_WICKETS = {"retired hurt", "retired not out"}

#: Ball-state rows are aggregated into bins this many balls wide before the
#: logistic fit, which keeps the fit fast without losing resolution.
BALL_BIN = 6
X_BIN = 0.05

#: Ridge penalty on the logistic weights, for numerical stability only.
RIDGE = 1e-3

#: Candidate half-lives (years) for weighting recent matches more heavily.
#: Cricket changes - modern ODI sides chase differently from 2005 sides - so
#: the half-life is chosen on a validation window, never on the test set.
HALF_LIFE_CANDIDATES: tuple[float | None, ...] = (None, 12.0, 8.0, 5.0, 3.0)


def _years_between(a: str, b: str) -> float:
    """Approximate years from ISO date ``a`` to ``b`` (both 'YYYY-MM-DD')."""
    ya, ma = int(a[:4]), int(a[5:7] or 1)
    yb, mb = int(b[:4]), int(b[5:7] or 1)
    return (yb - ya) + (mb - ma) / 12


def recency_weights(traces: list["MatchTrace"], half_life: float | None) -> list[float]:
    if not half_life or not traces:
        return [1.0] * len(traces)
    ref = max(t.date for t in traces)
    return [0.5 ** (_years_between(t.date, ref) / half_life) for t in traces]


# ---------------------------------------------------------------------------
# Reading matches into ball states
# ---------------------------------------------------------------------------
@dataclass(slots=True)
class MatchTrace:
    """One complete limited-overs match, reduced to the states that matter."""

    match_id: str
    date: str
    venue: str
    teams: list[str]
    batting_first: str
    winner: str | None          # None for a tie
    first_total: int
    first_complete: bool        # ran its full course: all out or overs used
    target: int
    # (balls_left, wickets_lost, runs) before each legal delivery
    first: list[tuple[int, int, int]] = field(default_factory=list)
    second: list[tuple[int, int, int]] = field(default_factory=list)

    @property
    def tie(self) -> bool:
        return self.winner is None

    @property
    def batting_first_won(self) -> bool:
        return self.winner == self.batting_first


def _walk_innings(innings: dict, max_balls: int) -> tuple[list[tuple[int, int, int]], int, int, int]:
    """Return (states, total, wickets, legal_balls) for one innings.

    A state is recorded before every legal delivery, so it includes any wides
    or no-balls bowled since the previous legal ball.
    """
    states: list[tuple[int, int, int]] = []
    runs = wickets = legal = 0
    for over in innings.get("overs", []):
        for d in over.get("deliveries", []):
            extras = d.get("extras") or {}
            is_legal = "wides" not in extras and "noballs" not in extras
            if is_legal:
                states.append((max_balls - legal, wickets, runs))
            runs += d.get("runs", {}).get("total", 0)
            for wk in d.get("wickets", []) or []:
                if wk.get("kind") not in NOT_WICKETS:
                    wickets += 1
            if is_legal:
                legal += 1
    return states, runs, wickets, legal


def trace_match(raw: dict, match_id: str, fmt: str) -> MatchTrace | None:
    """Reduce a Cricsheet match to ball states, or None if it can't be used.

    Matches are skipped when the scheduled overs differ from the format's
    standard, when a rain rule (DLS) decided the result, when there was no
    result, or when either innings is missing.
    """
    spec = FORMATS[fmt]
    max_balls = spec["balls_per_innings"]
    overs = max_balls // 6
    info = raw.get("info", {})
    if info.get("gender", "male") != "male":
        return None
    if info.get("overs") not in (None, overs):
        return None
    outcome = info.get("outcome") or {}
    if outcome.get("method"):
        return None
    winner = outcome.get("winner")
    if not winner and outcome.get("result") != "tie":
        return None

    innings = [i for i in raw.get("innings", []) if not i.get("super_over")]
    if len(innings) < 2:
        return None
    target_info = innings[1].get("target") or {}
    if target_info.get("overs") not in (None, overs):
        return None

    first, total1, wk1, legal1 = _walk_innings(innings[0], max_balls)
    second, _, _, _ = _walk_innings(innings[1], max_balls)
    if not first or not second:
        return None

    return MatchTrace(
        match_id=match_id,
        date=(info.get("dates") or [""])[0],
        venue=info.get("venue", ""),
        teams=list(info.get("teams", [])),
        batting_first=innings[0].get("team", ""),
        winner=winner,
        first_total=total1,
        first_complete=wk1 >= 10 or legal1 >= max_balls,
        target=target_info.get("runs") or total1 + 1,
        first=first,
        second=second,
    )


def iter_traces(fmt: str, path: Path | None = None) -> Iterator[MatchTrace]:
    archive = path or archive_path(fmt)
    if not archive.exists():
        raise FileNotFoundError(
            f"{archive} not found - run `python -m pipeline fetch --formats {fmt}` first"
        )
    with zipfile.ZipFile(archive) as zf:
        for name in sorted(zf.namelist()):
            if not name.endswith(".json") or "README" in name:
                continue
            try:
                raw = json.loads(zf.read(name))
            except (json.JSONDecodeError, KeyError):
                continue
            trace = trace_match(raw, Path(name).stem, fmt)
            if trace:
                yield trace


# ---------------------------------------------------------------------------
# Resources: expected runs from (balls left, wickets lost)
# ---------------------------------------------------------------------------
def _fit_exponential(rows: list[tuple[int, float, float]]) -> tuple[float, float]:
    """Weighted least squares fit of ``y = Z * (1 - exp(-b u))``.

    ``rows`` are (u, mean_y, count). For each candidate ``b`` on a log grid,
    ``Z`` has a closed form; keep the pair with the smallest weighted error.
    """
    best = (0.0, 0.0, math.inf)
    for i in range(400):
        b = 10 ** (-4 + 3 * i / 399)  # 1e-4 .. 1e-1 per ball
        num = den = 0.0
        for u, y, c in rows:
            g = 1 - math.exp(-b * u)
            num += c * y * g
            den += c * g * g
        if den == 0:
            continue
        z = num / den
        err = sum(c * (y - z * (1 - math.exp(-b * u))) ** 2 for u, y, c in rows)
        if err < best[2]:
            best = (z, b, err)
    return best[0], best[1]


@dataclass
class Resources:
    max_balls: int
    #: table[w][u] = expected further runs with u balls left and w down
    table: list[list[float]]
    #: variance / mean of further runs, per wickets lost
    dispersion: list[float]
    params: list[tuple[float, float]]

    def expected(self, balls_left: int, wickets: int) -> float:
        if wickets >= 10 or balls_left <= 0:
            return 0.0
        return self.table[wickets][min(balls_left, self.max_balls)]

    def variance(self, balls_left: int, wickets: int) -> float:
        if wickets >= 10 or balls_left <= 0:
            return 0.0
        return self.dispersion[wickets] * self.expected(balls_left, wickets)


def fit_resources(traces: list[MatchTrace], max_balls: int,
                  weights: list[float] | None = None) -> Resources:
    # (wickets, balls_left) -> [weight, weighted sum, weighted sum of squares]
    acc: dict[tuple[int, int], list[float]] = defaultdict(lambda: [0.0, 0.0, 0.0])
    weights = weights or [1.0] * len(traces)
    for t, wt in zip(traces, weights):
        if not t.first_complete:
            continue
        for u, w, r in t.first:
            y = t.first_total - r
            a = acc[(w, u)]
            a[0] += wt
            a[1] += wt * y
            a[2] += wt * y * y

    params: list[tuple[float, float]] = []
    table: list[list[float]] = []
    dispersion: list[float] = []
    for w in range(10):
        rows = [(u, a[1] / a[0], a[0]) for (ww, u), a in acc.items() if ww == w and a[0] > 1e-9]
        if len(rows) < 3:
            # Not enough data at this wicket count: inherit the previous curve.
            z, b = params[-1] if params else (0.0, 0.01)
        else:
            z, b = _fit_exponential(rows)
        params.append((z, b))
        curve = [z * (1 - math.exp(-b * u)) for u in range(max_balls + 1)]
        if table:
            # Losing a wicket can never add resources.
            curve = [min(c, prev) for c, prev in zip(curve, table[-1])]
        table.append(curve)

        var_num = mean_den = 0.0
        for (ww, u), (n, s, ss) in acc.items():
            if ww != w or n < 1e-9:
                continue
            mean = s / n
            var_num += ss - n * mean * mean
            mean_den += n * curve[u]
        dispersion.append(var_num / mean_den if mean_den > 0 else (dispersion[-1] if dispersion else 1.0))

    return Resources(max_balls=max_balls, table=table, dispersion=dispersion, params=params)


# ---------------------------------------------------------------------------
# Chase model: logistic regression on the share of resources still needed
# ---------------------------------------------------------------------------
def chase_features(u: int, w: int, need: int, res: Resources) -> list[float]:
    r = max(res.expected(u, w), 0.5)
    x = math.log(need / r)
    f = u / res.max_balls
    return [1.0, x, x * f, f, x * w / 10]


def _sigmoid(z: float) -> float:
    if z >= 0:
        return 1 / (1 + math.exp(-z))
    e = math.exp(z)
    return e / (1 + e)


def _solve(a: list[list[float]], b: list[float]) -> list[float]:
    """Gaussian elimination with partial pivoting (small dense systems)."""
    n = len(b)
    m = [row[:] + [b[i]] for i, row in enumerate(a)]
    for col in range(n):
        piv = max(range(col, n), key=lambda r: abs(m[r][col]))
        m[col], m[piv] = m[piv], m[col]
        p = m[col][col]
        if abs(p) < 1e-12:
            continue
        for r in range(n):
            if r != col:
                f = m[r][col] / p
                for c in range(col, n + 1):
                    m[r][c] -= f * m[col][c]
    return [m[i][n] / m[i][i] if abs(m[i][i]) > 1e-12 else 0.0 for i in range(n)]


def fit_logistic(rows: list[tuple[list[float], float, float]], iters: int = 50) -> list[float]:
    """Newton-Raphson for weighted logistic regression.

    ``rows`` are (features, wins, trials) per bin, so the data can be millions
    of ball states but the fit only sees a few thousand rows.
    """
    k = len(rows[0][0])
    theta = [0.0] * k
    for _ in range(iters):
        grad = [-RIDGE * t for t in theta]
        hess = [[(RIDGE if i == j else 0.0) for j in range(k)] for i in range(k)]
        for xs, wins, n in rows:
            p = _sigmoid(sum(t * x for t, x in zip(theta, xs)))
            g = wins - n * p
            h = n * p * (1 - p)
            for i in range(k):
                grad[i] += g * xs[i]
                for j in range(i, k):
                    hess[i][j] += h * xs[i] * xs[j]
        for i in range(k):
            for j in range(i):
                hess[i][j] = hess[j][i]
        step = _solve(hess, grad)
        theta = [t + s for t, s in zip(theta, step)]
        if max(abs(s) for s in step) < 1e-8:
            break
    return theta


@dataclass
class WinModel:
    fmt: str
    resources: Resources
    theta: list[float]
    half_life: float | None = None
    #: first_innings_win[T] = P(side batting first wins | they made T)
    first_innings_win: list[float] = field(default_factory=list)

    @property
    def max_balls(self) -> int:
        return self.resources.max_balls

    # -- chase -------------------------------------------------------------
    def chase(self, balls_left: int, wickets: int, need: int) -> float:
        """P(chasing side wins) with ``need`` runs still required."""
        if need <= 0:
            return 1.0
        if wickets >= 10 or balls_left <= 0:
            return 0.0
        xs = chase_features(balls_left, wickets, need, self.resources)
        return _sigmoid(sum(t * x for t, x in zip(self.theta, xs)))

    # -- first innings -----------------------------------------------------
    def build_first_innings_table(self, max_total: int = 600) -> None:
        self.first_innings_win = [
            1 - self.chase(self.max_balls, 0, total + 1) for total in range(max_total + 1)
        ]

    def batting_first(self, balls_left: int, wickets: int, runs: int) -> float:
        """P(side batting first wins), integrating over their final total."""
        if not self.first_innings_win:
            self.build_first_innings_table()
        table = self.first_innings_win
        top = len(table) - 1
        mean = runs + self.resources.expected(balls_left, wickets)
        var = self.resources.variance(balls_left, wickets)
        if var <= 0.25:
            return table[min(int(round(mean)), top)]
        sd = math.sqrt(var)
        lo = max(runs, int(mean - 4 * sd))
        hi = min(top, int(mean + 4 * sd) + 1)
        total_w = acc = 0.0
        for t in range(lo, hi + 1):
            wt = math.exp(-0.5 * ((t - mean) / sd) ** 2)
            total_w += wt
            acc += wt * table[t]
        return acc / total_w if total_w else table[min(int(round(mean)), top)]

    # -- projections -------------------------------------------------------
    def projected(self, balls_left: int, wickets: int, runs: int) -> tuple[float, float, float]:
        """Projected final total with an 80% band."""
        mean = runs + self.resources.expected(balls_left, wickets)
        sd = math.sqrt(self.resources.variance(balls_left, wickets))
        return mean, max(runs, mean - 1.2816 * sd), mean + 1.2816 * sd

    def par_total(self) -> int:
        """First-innings total that gives the side batting first a 50% chance."""
        if not self.first_innings_win:
            self.build_first_innings_table()
        for t, p in enumerate(self.first_innings_win):
            if p >= 0.5:
                return t
        return len(self.first_innings_win) - 1


def fit_model(fmt: str, traces: list[MatchTrace], half_life: float | None = None) -> WinModel:
    max_balls = FORMATS[fmt]["balls_per_innings"]
    weights = recency_weights(traces, half_life)
    res = fit_resources(traces, max_balls, weights)

    bins: dict[tuple[int, int, int], list[float]] = defaultdict(lambda: [0.0] * 7)
    for t, wt in zip(traces, weights):
        if t.tie:
            continue
        won = 0.0 if t.batting_first_won else 1.0
        for u, w, r in t.second:
            need = t.target - r
            if need <= 0 or w >= 10 or u <= 0:
                continue
            xs = chase_features(u, w, need, res)
            key = (u // BALL_BIN, w, round(xs[1] / X_BIN))
            b = bins[key]
            for i in range(5):
                b[i] += wt * xs[i]
            b[5] += wt * won
            b[6] += wt
    rows = [([v / b[6] for v in b[:5]], b[5], b[6]) for b in bins.values() if b[6] > 1e-9]
    theta = fit_logistic(rows)
    model = WinModel(fmt=fmt, resources=res, theta=theta, half_life=half_life)
    model.build_first_innings_table()
    return model


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------
@dataclass
class Score:
    n: int = 0
    brier: float = 0.0
    logloss: float = 0.0
    baseline_brier: float = 0.0
    calibration: list[list[float]] = field(default_factory=lambda: [[0.0, 0.0, 0.0] for _ in range(10)])

    def add(self, p: float, y: float, base: float) -> None:
        p = min(max(p, 1e-6), 1 - 1e-6)
        self.n += 1
        self.brier += (p - y) ** 2
        self.baseline_brier += (base - y) ** 2
        self.logloss += -(y * math.log(p) + (1 - y) * math.log(1 - p))
        c = self.calibration[min(int(p * 10), 9)]
        c[0] += 1
        c[1] += p
        c[2] += y

    def summary(self) -> dict:
        n = max(self.n, 1)
        return {
            "states": self.n,
            "brier": round(self.brier / n, 4),
            "baselineBrier": round(self.baseline_brier / n, 4),
            "skill": round(1 - self.brier / max(self.baseline_brier, 1e-9), 3),
            "logLoss": round(self.logloss / n, 4),
            "calibration": [
                {
                    "bin": f"{i * 10}-{i * 10 + 10}%",
                    "states": int(c[0]),
                    "predicted": round(c[1] / c[0], 3) if c[0] else None,
                    "observed": round(c[2] / c[0], 3) if c[0] else None,
                }
                for i, c in enumerate(self.calibration)
            ],
        }


def evaluate(model: WinModel, traces: list[MatchTrace], base_first: float, base_chase: float,
             first_innings_stride: int = 6) -> dict:
    """Score every chase state and every ``stride``-th first-innings state."""
    chase, first = Score(), Score()
    for t in traces:
        if t.tie:
            continue
        y1 = 1.0 if t.batting_first_won else 0.0
        for i, (u, w, r) in enumerate(t.first):
            if i % first_innings_stride == 0:
                first.add(model.batting_first(u, w, r), y1, base_first)
        for u, w, r in t.second:
            need = t.target - r
            if need <= 0 or w >= 10 or u <= 0:
                continue
            chase.add(model.chase(u, w, need), 1 - y1, base_chase)
    return {"firstInnings": first.summary(), "chase": chase.summary()}


def _add_years(date: str, years: int) -> str:
    return f"{int(date[:4]) + years:04d}{date[4:]}"


def choose_half_life(fmt: str, train: list[MatchTrace], holdout_from: str,
                     base_first: float, window_years: int = 3) -> tuple[float | None, list[dict]]:
    """Pick the recency half-life on the last ``window_years`` before the
    holdout, using only matches before that window to fit. The holdout set is
    never consulted."""
    split = _add_years(holdout_from, -window_years)
    fit_set = [t for t in train if t.date < split]
    val_set = [t for t in train if t.date >= split]
    if len(fit_set) < 50 or len(val_set) < 20:
        return None, []
    results = []
    for hl in HALF_LIFE_CANDIDATES:
        m = fit_model(fmt, fit_set, hl)
        score = evaluate(m, val_set, base_first, 1 - base_first, first_innings_stride=12)
        combined = score["chase"]["brier"] + score["firstInnings"]["brier"]
        results.append({"halfLifeYears": hl, "chaseBrier": score["chase"]["brier"],
                        "firstInningsBrier": score["firstInnings"]["brier"],
                        "combined": round(combined, 4)})
    best = min(results, key=lambda r: r["combined"])
    return best["halfLifeYears"], results


# ---------------------------------------------------------------------------
# Par scores by ground
# ---------------------------------------------------------------------------
def canonical_venue(name: str) -> str:
    """Cricsheet writes some grounds both as "Wankhede Stadium" and
    "Wankhede Stadium, Mumbai"; the part before the first comma is stable.
    The web app applies the same rule to live feed venue names."""
    return name.split(",")[0].strip()


def venue_pars(traces: list[MatchTrace], model: WinModel, min_matches: int = 5,
               prior: float = 8.0) -> dict[str, dict]:
    """Ground-adjusted par: the format par shifted by how much more or less
    sides score there, shrunk toward zero for grounds with few matches."""
    global_mean_totals = [t.first_total for t in traces if t.first_complete]
    if not global_mean_totals:
        return {}
    gmean = sum(global_mean_totals) / len(global_mean_totals)
    par = model.par_total()
    by_venue: dict[str, list[int]] = defaultdict(list)
    for t in traces:
        if t.first_complete and t.venue:
            by_venue[canonical_venue(t.venue)].append(t.first_total)
    out = {}
    for venue, totals in by_venue.items():
        n = len(totals)
        if n < min_matches:
            continue
        shift = (sum(totals) / n - gmean) * n / (n + prior)
        out[venue] = {"matches": n, "averageFirstInnings": round(sum(totals) / n, 1),
                      "par": int(round(par + shift))}
    return out


# ---------------------------------------------------------------------------
# Build and export
# ---------------------------------------------------------------------------
def model_to_json(model: WinModel) -> dict:
    res = model.resources
    return {
        "format": model.fmt,
        "maxBalls": res.max_balls,
        "theta": [round(t, 6) for t in model.theta],
        "features": ["1", "x", "x*f", "f", "x*w/10"],
        "resources": [[round(v, 3) for v in row] for row in res.table],
        "dispersion": [round(d, 4) for d in res.dispersion],
        "resourceParams": [{"z": round(z, 3), "b": round(b, 6)} for z, b in res.params],
        "firstInningsWin": [round(p, 5) for p in model.first_innings_win],
        "par": model.par_total(),
    }


def golden_states(model: WinModel, n: int = 60) -> list[dict]:
    """A spread of states with expected outputs, so the TypeScript port can be
    checked against this implementation number for number."""
    out = []
    mb = model.max_balls
    for i in range(n):
        u = int(mb * ((i * 37) % 100) / 100) + 1
        w = (i * 7) % 10
        runs = int((mb - u) * (0.9 + (i % 5) * 0.12) / 1.0 * (1.0 if mb == 120 else 0.85))
        need = 1 + (i * 13) % int(mb * 0.9)
        proj = model.projected(u, w, runs)
        out.append({
            "ballsLeft": u, "wickets": w, "runs": runs, "need": need,
            "chase": round(model.chase(u, w, need), 6),
            "battingFirst": round(model.batting_first(u, w, runs), 6),
            "projected": [round(v, 3) for v in proj],
        })
    return out


def build(formats: tuple[str, ...] = LIMITED_FORMATS, out_dir: Path | None = None,
          holdout_from: str = HOLDOUT_FROM) -> dict:
    from .config import WEB_DATA_DIR

    out_dir = out_dir or WEB_DATA_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    result: dict = {"generatedFrom": "Cricsheet ball-by-ball (CC BY 4.0)", "holdoutFrom": holdout_from,
                    "formats": {}}
    for fmt in formats:
        traces = list(iter_traces(fmt))
        train = [t for t in traces if t.date < holdout_from]
        test = [t for t in traces if t.date >= holdout_from]
        log.info("%s: %d usable matches (%d train, %d holdout)", fmt, len(traces), len(train), len(test))

        decided = [t for t in train if not t.tie]
        base_first = sum(t.batting_first_won for t in decided) / max(len(decided), 1)

        half_life, selection = choose_half_life(fmt, train, holdout_from, base_first)
        validation_model = fit_model(fmt, train, half_life)
        validation = evaluate(validation_model, test, base_first, 1 - base_first)

        model = fit_model(fmt, traces, half_life)
        payload = model_to_json(model)
        payload["matches"] = len(traces)
        payload["halfLifeYears"] = half_life
        payload["validation"] = {"trainMatches": len(train), "testMatches": len(test),
                                 "halfLifeSelection": selection, **validation}
        payload["venues"] = venue_pars(traces, model)
        payload["golden"] = golden_states(model)
        result["formats"][fmt] = payload
        log.info("%s: half-life %s, chase Brier %.4f (baseline %.4f), first-innings Brier %.4f, par %d",
                 fmt, half_life, validation["chase"]["brier"], validation["chase"]["baselineBrier"],
                 validation["firstInnings"]["brier"], payload["par"])

    path = out_dir / "winprob.json"
    path.write_text(json.dumps(result, separators=(",", ":")))
    log.info("wrote %s (%.0f KB)", path, path.stat().st_size / 1024)
    return result
