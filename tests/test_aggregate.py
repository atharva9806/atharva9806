"""Correctness checks for parsing and aggregation, verified by hand."""
from __future__ import annotations

import unittest

from pipeline.aggregate import Aggregator, entry_phase
from pipeline.sources.cricsheet import parse_match
from tests.fixtures import HANDS, STYLES, maiden_over_match, simple_t20


def build(raw, fmt="t20i"):
    match, deliveries = parse_match(raw, "m1", fmt)
    agg = Aggregator(fmt, styles=STYLES, hands=HANDS)
    agg.registry.update(match.registry)
    agg.add_match(match, deliveries)
    agg.finalise()
    return agg


class TestParsing(unittest.TestCase):
    def test_delivery_count_and_legality(self):
        _match, deliveries = parse_match(simple_t20(), "m1", "t20i")
        self.assertEqual(len(deliveries), 13)          # 7 + 6
        self.assertEqual(sum(1 for d in deliveries if d.is_legal), 12)
        wide = next(d for d in deliveries if d.wides)
        self.assertFalse(wide.is_legal)
        self.assertFalse(wide.is_batter_ball)          # a wide is not faced

    def test_ball_numbering_skips_wides(self):
        _m, deliveries = parse_match(simple_t20(), "m1", "t20i")
        legal = [d.ball_no for d in deliveries if d.is_legal]
        self.assertEqual(legal, list(range(1, 13)))

    def test_phase_assignment(self):
        _m, deliveries = parse_match(simple_t20(), "m1", "t20i")
        self.assertTrue(all(d.phase == "powerplay" for d in deliveries))

    def test_venue_country(self):
        _m, deliveries = parse_match(simple_t20(), "m1", "t20i")
        self.assertEqual(deliveries[0].country, "India")


class TestBatting(unittest.TestCase):
    def setUp(self):
        self.agg = build(simple_t20())

    def test_kohli_totals(self):
        # Kohli faced: 6, (wide not faced), 0, 0-out | 0, 4, 0, 1  = 7 balls, 11 runs
        kohli = self.agg.players["V Kohli"].bat_overall
        self.assertEqual(kohli.balls, 7)
        self.assertEqual(kohli.runs, 11)
        self.assertEqual(kohli.outs, 1)
        self.assertEqual(kohli.sixes, 1)
        self.assertEqual(kohli.fours, 1)
        self.assertEqual(kohli.dots, 4)
        self.assertAlmostEqual(kohli.average, 11.0)
        self.assertAlmostEqual(kohli.strike_rate, 100 * 11 / 7, places=4)

    def test_rohit_totals(self):
        # Rohit: 4,0,1 | 2,1 = 5 balls, 8 runs, not out
        rohit = self.agg.players["RG Sharma"].bat_overall
        self.assertEqual((rohit.balls, rohit.runs, rohit.outs), (5, 8, 0))
        self.assertEqual(rohit.average, -1.0)          # never dismissed
        self.assertIsNone(rohit.to_dict()["avg"])

    def test_split_by_bowling_type(self):
        kohli = self.agg.players["V Kohli"]
        # vs Starc (left-arm fast): 6, 0, 0-out -> 3 balls, 6 runs, 1 out
        self.assertEqual(kohli.bat_by_type["lf"].balls, 3)
        self.assertEqual(kohli.bat_by_type["lf"].runs, 6)
        self.assertEqual(kohli.bat_by_type["lf"].outs, 1)
        # vs Zampa (leg break): 0,4,0,1 -> 4 balls, 5 runs, 0 outs
        self.assertEqual(kohli.bat_by_type["lb"].balls, 4)
        self.assertEqual(kohli.bat_by_type["lb"].runs, 5)
        self.assertEqual(kohli.bat_by_family["pace"].balls, 3)
        self.assertEqual(kohli.bat_by_family["spin"].balls, 4)

    def test_batting_position_from_order_of_arrival(self):
        self.assertEqual(self.agg.players["RG Sharma"].bat_innings[0].position, 1)
        self.assertEqual(self.agg.players["V Kohli"].bat_innings[0].position, 2)

    def test_innings_log(self):
        inn = self.agg.players["V Kohli"].bat_innings[0]
        self.assertEqual((inn.runs, inn.balls, inn.out), (11, 7, True))
        self.assertEqual(inn.dismissal, "caught")
        self.assertEqual(inn.dismissed_by, "MA Starc")
        self.assertEqual(inn.opposition, "Australia")

    def test_dismissed_by_type_counter(self):
        self.assertEqual(dict(self.agg.players["V Kohli"].dismissed_by_type), {"lf": 1})


class TestBowling(unittest.TestCase):
    def setUp(self):
        self.agg = build(simple_t20())

    def test_starc_figures(self):
        # Starc: 6 legal balls + 1 wide. Runs conceded 4+0+1+6+1(wide)+0+0 = 12
        starc = self.agg.players["MA Starc"].bowl_overall
        self.assertEqual(starc.balls, 6)
        self.assertEqual(starc.runs, 12)
        self.assertEqual(starc.wickets, 1)
        self.assertEqual(starc.wides, 1)
        self.assertAlmostEqual(starc.economy, 12.0)

    def test_zampa_figures(self):
        zampa = self.agg.players["A Zampa"].bowl_overall
        self.assertEqual((zampa.balls, zampa.runs, zampa.wickets), (6, 8, 0))
        self.assertAlmostEqual(zampa.economy, 8.0)
        self.assertIsNone(zampa.to_dict()["avg"])

    def test_bowling_vs_hand_split(self):
        starc = self.agg.players["MA Starc"]
        self.assertEqual(starc.bowl_by_hand["right"].balls, 6)
        self.assertEqual(starc.bowl_by_hand["left"].balls, 0)

    def test_dot_definition_excludes_extras(self):
        # Starc's wide is not a dot even though the batter scored nothing.
        starc = self.agg.players["MA Starc"].bowl_overall
        self.assertEqual(starc.dots, 3)   # balls 2, 6, 7 of the over


class TestCreditAndMaidens(unittest.TestCase):
    def setUp(self):
        self.agg = build(maiden_over_match())

    def test_run_out_not_credited_to_bowler(self):
        starc = self.agg.players["MA Starc"].bowl_overall
        self.assertEqual(starc.wickets, 0)
        self.assertEqual(starc.runs, 0)

    def test_maiden_counted(self):
        self.assertEqual(self.agg.players["MA Starc"].bowl_innings[0].maidens, 1)

    def test_non_striker_run_out_is_recorded(self):
        # Kohli was run out at the non-striker's end: no balls faced, but the
        # dismissal still belongs on his record.
        kohli = self.agg.players["V Kohli"]
        self.assertEqual(kohli.bat_overall.balls, 0)
        self.assertEqual(kohli.bat_overall.outs, 1)
        self.assertEqual(kohli.bat_innings[0].dismissal, "run out")
        self.assertEqual(kohli.bat_innings[0].runs, 0)
        # The striker is untouched by it.
        self.assertEqual(self.agg.players["RG Sharma"].bat_overall.outs, 0)

    def test_run_out_excluded_from_bowling_type_splits(self):
        kohli = self.agg.players["V Kohli"]
        self.assertEqual(kohli.bat_by_type["lf"].outs, 0)
        self.assertEqual(dict(kohli.dismissed_by_type), {})


class TestEntryPhase(unittest.TestCase):
    def test_boundaries(self):
        self.assertEqual(entry_phase(0), "new")
        self.assertEqual(entry_phase(14), "new")
        self.assertEqual(entry_phase(15), "settling")
        self.assertEqual(entry_phase(39), "settling")
        self.assertEqual(entry_phase(40), "set")

    def test_entry_split_accumulates(self):
        agg = build(simple_t20())
        kohli = agg.players["V Kohli"]
        self.assertEqual(kohli.bat_by_entry["new"].balls, 7)


if __name__ == "__main__":
    unittest.main(verbosity=2)


class TestClaimText(unittest.TestCase):
    """The wording of a percentile must match its direction."""

    def _text(self, percentile):
        from pipeline.analyze import Dimension, _claim_text
        dim = Dimension("vs_type", "Bowling type", "bat_by_type", "batting",
                        "average", "average", True)
        return _claim_text(dim, "Leg break", 22.0, 45.0, 33.0, percentile,
                           400, "weakness", "batting")

    def test_low_percentile_reads_as_bottom(self):
        self.assertIn("bottom 5%", self._text(5.0))
        self.assertNotIn("bottom 95%", self._text(5.0))

    def test_high_percentile_reads_as_top(self):
        self.assertIn("top 8%", self._text(92.0))

    def test_includes_evidence(self):
        text = self._text(5.0)
        self.assertIn("400 balls", text)
        self.assertIn("45.0", text)     # the player's own baseline
        self.assertIn("33.0", text)     # the cohort median
