"""Small statistical helpers.

Deliberately dependency-free: the whole pipeline runs on a stock Python install
so that anyone can clone and run it without a scientific stack.
"""
from __future__ import annotations

import math
from bisect import bisect_left, bisect_right


def median(values: list[float]) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    mid = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[mid]
    return (ordered[mid - 1] + ordered[mid]) / 2.0


def quantile(values: list[float], q: float) -> float:
    """Linear-interpolation quantile (same convention as numpy's default)."""
    if not values:
        return 0.0
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    pos = (len(ordered) - 1) * q
    low = math.floor(pos)
    high = math.ceil(pos)
    if low == high:
        return ordered[int(pos)]
    return ordered[low] + (ordered[high] - ordered[low]) * (pos - low)


def percentile_of(sorted_values: list[float], value: float,
                  higher_is_better: bool = True) -> float:
    """Where ``value`` sits in a pre-sorted distribution, as 0-100.

    Uses the midpoint of the ranks that tie with ``value`` so that a player
    sitting exactly on a crowded value is not pushed to one extreme.
    """
    n = len(sorted_values)
    if n == 0:
        return 50.0
    left = bisect_left(sorted_values, value)
    right = bisect_right(sorted_values, value)
    rank = (left + right) / 2.0
    pct = 100.0 * rank / n
    return pct if higher_is_better else 100.0 - pct


def mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def stdev(values: list[float]) -> float:
    if len(values) < 2:
        return 0.0
    mu = mean(values)
    return math.sqrt(sum((v - mu) ** 2 for v in values) / (len(values) - 1))


def rolling(values: list[float], window: int) -> list[float | None]:
    """Trailing rolling mean; None until the window is full."""
    out: list[float | None] = []
    total = 0.0
    for i, v in enumerate(values):
        total += v
        if i >= window:
            total -= values[i - window]
        out.append(total / window if i >= window - 1 else None)
    return out


def wilson_interval(successes: int, trials: int, z: float = 1.96) -> tuple[float, float]:
    """Wilson score interval for a proportion.

    Used to show how much a rate-based split (dot %, boundary %) can be trusted
    at the sample size available.
    """
    if trials == 0:
        return (0.0, 1.0)
    p = successes / trials
    denom = 1 + z * z / trials
    centre = (p + z * z / (2 * trials)) / denom
    margin = z * math.sqrt(p * (1 - p) / trials + z * z / (4 * trials * trials)) / denom
    return (max(0.0, centre - margin), min(1.0, centre + margin))


def shrink(value: float, prior: float, n: int, k: float) -> float:
    """Pull a small-sample estimate towards a prior.

    ``k`` is the number of observations at which the estimate and the prior are
    weighted equally. This is what stops a batter who was dismissed twice in 60
    balls against leg spin from showing up as having a catastrophic weakness.
    """
    if n <= 0:
        return prior
    weight = n / (n + k)
    return weight * value + (1 - weight) * prior
