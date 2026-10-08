"""Tests for the win-probability model.

They run on hand-built match documents and a small synthetic corpus, so they
need no downloads. The real-data validation numbers live in docs/ANALYSIS.md.
"""
from __future__ import annotations

import math
import random
import unittest

from pipeline import winprob
from pipeline.winprob import MatchTrace, fit_logistic, fit_model, trace_match


def _delivery(runs=0, extras=None, wicket=None):
    d = {"batter": "A", "bowler": "B", "non_striker": "C",
         "runs": {"batter": runs, "extras": sum((extras or {}).values()),
                  "total": runs + sum((extras or {}).values())}}
    if extras:
        d["extras"] = extras
    if wicket:
        d["wickets"] = [{"kind": wicket, "player_out": "A"}]
    return d


def _match(first_overs, second_overs, *, outcome, overs=20, target=None):
    innings = [
        {"team": "Home", "overs": [{"over": i, "deliveries": ds} for i, ds in enumerate(first_overs)]},
        {"team": "Away", "overs": [{"over": i, "deliveries": ds} for i, ds in enumerate(second_overs)]},
    ]
    if target is not None:
        innings[1]["target"] = target
    return {"info": {"gender": "male", "overs": overs, "dates": ["2024-01-01"],
                     "venue": "Ground", "teams": ["Home", "Away"], "outcome": outcome},
            "innings": innings}


class TraceMatchTests(unittest.TestCase):
    def test_wides_are_not_legal_balls_and_runs_carry(self):
        over = [_delivery(1), _delivery(0, {"wides": 1}), _delivery(4)]
        raw = _match([over], [[_delivery(0)]], outcome={"winner": "Home", "by": {"runs": 5}})
        t = trace_match(raw, "m1", "t20i")
        self.assertIsNotNone(t)
        # Two legal balls -> two states; the wide's run is in the second state.
        self.assertEqual(t.first, [(120, 0, 0), (119, 0, 2)])
        self.assertEqual(t.first_total, 6)

    def test_retired_hurt_is_not_a_wicket(self):
        over = [_delivery(0, wicket="retired hurt"), _delivery(0, wicket="bowled"), _delivery(0)]
        raw = _match([over], [[_delivery(0)]], outcome={"winner": "Home", "by": {"runs": 1}})
        t = trace_match(raw, "m2", "t20i")
        self.assertEqual([w for _, w, _ in t.first], [0, 0, 1])

    def test_rain_affected_and_no_result_matches_are_skipped(self):
        ok = [[_delivery(1)]]
        dls = _match(ok, ok, outcome={"winner": "Home", "method": "D/L"})
        nr = _match(ok, ok, outcome={"result": "no result"})
        reduced = _match(ok, ok, outcome={"winner": "Home"}, overs=12)
        cut_chase = _match(ok, ok, outcome={"winner": "Home"}, target={"runs": 90, "overs": 12})
        for raw in (dls, nr, reduced, cut_chase):
            self.assertIsNone(trace_match(raw, "x", "t20i"))

    def test_tie_is_kept_with_no_winner(self):
        raw = _match([[_delivery(1)]], [[_delivery(1)]], outcome={"result": "tie"})
        t = trace_match(raw, "m3", "t20i")
        self.assertIsNotNone(t)
        self.assertTrue(t.tie)
        self.assertEqual(t.target, 2)

    def test_first_innings_completion_flag(self):
        all_out = [[_delivery(0, wicket="bowled") for _ in range(6)]] + \
                  [[_delivery(0, wicket="bowled") for _ in range(4)]]
        raw = _match(all_out, [[_delivery(1)]], outcome={"winner": "Away"})
        self.assertTrue(trace_match(raw, "m4", "t20i").first_complete)
        short = _match([[_delivery(1)]], [[_delivery(1)]], outcome={"winner": "Away"})
        self.assertFalse(trace_match(short, "m5", "t20i").first_complete)


class FittingTests(unittest.TestCase):
    def test_logistic_recovers_known_coefficients(self):
        rng = random.Random(7)
        true = [0.4, -1.7]
        bins = {}
        for _ in range(40000):
            x = rng.uniform(-3, 3)
            p = 1 / (1 + math.exp(-(true[0] + true[1] * x)))
            key = round(x, 1)
            b = bins.setdefault(key, [0.0, 0.0, 0.0])
            b[0] += x
            b[1] += 1.0 if rng.random() < p else 0.0
            b[2] += 1
        rows = [([1.0, b[0] / b[2]], b[1], b[2]) for b in bins.values()]
        theta = fit_logistic(rows)
        self.assertAlmostEqual(theta[0], true[0], delta=0.1)
        self.assertAlmostEqual(theta[1], true[1], delta=0.1)

    def test_exponential_resource_fit_recovers_curve(self):
        z, b = 180.0, 0.012
        rows = [(u, z * (1 - math.exp(-b * u)), 50.0) for u in range(1, 121)]
        fz, fb = winprob._fit_exponential(rows)
        self.assertAlmostEqual(fz, z, delta=z * 0.03)
        self.assertAlmostEqual(fb, b, delta=b * 0.05)


def _synthetic_corpus(n=600, seed=3) -> list[MatchTrace]:
    """Simple T20 simulator: each legal ball scores 0-6 or takes a wicket."""
    rng = random.Random(seed)

    def bat(target=None):
        states, runs, wk = [], 0, 0
        for ball in range(120):
            if wk >= 10 or (target is not None and runs >= target):
                break
            states.append((120 - ball, wk, runs))
            if rng.random() < 0.055 + 0.004 * wk:
                wk += 1
            else:
                runs += rng.choices([0, 1, 2, 3, 4, 6], [35, 35, 8, 1, 14, 7])[0]
        return states, runs, wk

    out = []
    for i in range(n):
        first, total, wk = bat()
        target = total + 1
        second, chased, _ = bat(target)
        if chased == total:
            continue
        winner = "Away" if chased >= target else "Home"
        out.append(MatchTrace(match_id=str(i), date=f"20{10 + i % 14:02d}-06-01", venue="G" + str(i % 4),
                              teams=["Home", "Away"], batting_first="Home", winner=winner,
                              first_total=total, first_complete=True, target=target,
                              first=first, second=second))
    return out


class ModelPropertyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.model = fit_model("t20i", _synthetic_corpus())

    def test_terminal_states(self):
        m = self.model
        self.assertEqual(m.chase(10, 3, 0), 1.0)
        self.assertEqual(m.chase(0, 3, 5), 0.0)
        self.assertEqual(m.chase(30, 10, 5), 0.0)

    def test_chase_is_monotonic(self):
        m = self.model
        # More runs needed -> lower chance.
        probs = [m.chase(60, 3, need) for need in range(5, 150, 5)]
        self.assertTrue(all(a >= b for a, b in zip(probs, probs[1:])))
        # More balls left for the same requirement -> higher chance.
        probs = [m.chase(u, 3, 60) for u in range(12, 121, 12)]
        self.assertTrue(all(a <= b for a, b in zip(probs, probs[1:])))
        # More wickets down -> lower chance.
        probs = [m.chase(60, w, 60) for w in range(0, 10)]
        self.assertTrue(all(a >= b for a, b in zip(probs, probs[1:])))

    def test_resources_never_increase_with_wickets(self):
        table = self.model.resources.table
        for w in range(1, 10):
            self.assertTrue(all(a <= b + 1e-9 for a, b in zip(table[w], table[w - 1])))

    def test_first_innings_probability_rises_with_total(self):
        m = self.model
        low = m.batting_first(0, 10, 100)
        high = m.batting_first(0, 10, 220)
        self.assertLess(low, 0.5)
        self.assertGreater(high, 0.5)
        self.assertLess(m.par_total(), 220)

    def test_projection_band_contains_mean(self):
        mean, lo, hi = self.model.projected(60, 2, 80)
        self.assertGreater(mean, 80)
        self.assertLessEqual(lo, mean)
        self.assertGreaterEqual(hi, mean)

    def test_recency_weights(self):
        traces = _synthetic_corpus(20)
        ws = winprob.recency_weights(traces, 5.0)
        newest = max(range(len(traces)), key=lambda i: traces[i].date)
        self.assertAlmostEqual(ws[newest], 1.0)
        self.assertTrue(all(0 < w <= 1 for w in ws))
        self.assertEqual(winprob.recency_weights(traces, None), [1.0] * len(traces))


if __name__ == "__main__":
    unittest.main()


class ReplayTests(unittest.TestCase):
    def _raw(self):
        first = [[_delivery(4), _delivery(0, {"wides": 1}), _delivery(1, wicket=None)],
                 [_delivery(0, wicket="caught"), _delivery(6)]]
        second = [[_delivery(6), _delivery(6)]]
        raw = _match(first, second, outcome={"winner": "Away", "by": {"wickets": 10}},
                     target={"runs": 12, "overs": 20})
        raw["info"]["registry"] = {"people": {"A": "aaaa0001", "B": "bbbb0002", "C": "cccc0003"}}
        raw["info"]["players"] = {"Home": ["A", "C"], "Away": ["B"]}
        raw["info"]["event"] = {"name": "Cup", "stage": "Final"}
        return raw

    def test_build_replay_shape_and_people_ids(self):
        from pipeline.replay import build_replay
        rp = build_replay(self._raw(), "m9", "t20i")
        self.assertEqual(rp["result"], "Away won by 10 wickets")
        self.assertEqual(rp["stage"], "Final")
        ids = {p["name"]: p["id"] for p in rp["people"]}
        self.assertEqual(ids["A"], "aaaa0001")
        self.assertEqual(len(rp["innings"][0]["balls"]), 5)
        self.assertEqual(rp["innings"][0]["balls"][1][6], "wides")
        self.assertEqual(rp["innings"][1]["target"], 12)

    def test_states_count_legal_balls_and_wickets(self):
        from pipeline.replay import build_replay, replay_states
        rp = build_replay(self._raw(), "m9", "t20i")
        states = list(replay_states(rp, 120))
        first = [s for s in states if s[0] == 1]
        # Five deliveries, one wide: four legal balls, one wicket, 12 runs.
        self.assertEqual(first[-1][1:4], (116, 1, 12))
        second = [s for s in states if s[0] == 2]
        self.assertEqual(second[-1][3], 12)

    def test_win_curve_ends_with_the_actual_result(self):
        from pipeline.replay import build_replay, win_curve
        model = fit_model("t20i", _synthetic_corpus(300))
        rp = build_replay(self._raw(), "m9", "t20i")
        curve = win_curve(rp, model)
        self.assertEqual(curve[-1][2], 0.0)   # chasing side got there
        self.assertTrue(all(0.0 <= p <= 1.0 for _, _, p in curve))
