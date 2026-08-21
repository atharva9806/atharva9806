"""End-to-end checks on the build pipeline.

These run against a small simulated corpus rather than downloaded data, so they
work offline and finish in seconds while still exercising the real parser,
aggregator, analyser and exporter.
"""
from __future__ import annotations

import json
import random
import shutil
import tempfile
import unittest
from pathlib import Path

from pipeline.aggregate import Aggregator
from pipeline.analyze import Cohort, analyse_player
from pipeline.config import BOWLING_TYPES, PACE_TYPES, SPIN_TYPES
from pipeline.export import export_all, slugify
from pipeline.seed import SEED, START, _fixture_list, _pick_xi, _register_geography
from pipeline.simulate import MatchSimulator, TEAMS, make_roster, stable_id
from pipeline.sources.cricsheet import parse_match


def build_corpus(fmt="t20i", matches=60):
    _register_geography()
    rng = random.Random(SEED)
    roster = make_roster(rng)
    by_team = {}
    for p in roster:
        by_team.setdefault(p.team, []).append(p)
    styles = {p.name: p.bowling_type for p in roster}
    hands = {p.name: p.batting_hand for p in roster}
    sim_rng = random.Random(SEED)
    sim = MatchSimulator(fmt, sim_rng)
    agg = Aggregator(fmt, styles=styles, hands=hands)
    for i, (home, away, venue, city, day) in enumerate(
            _fixture_list(sim_rng, matches, START)):
        year = int(day[:4])
        raw = sim.match(_pick_xi(sim_rng, by_team[home], year),
                        _pick_xi(sim_rng, by_team[away], year),
                        day, venue, city, f"{fmt}-{i}")
        match, deliveries = parse_match(raw, f"{fmt}-{i}", fmt)
        agg.registry.update(match.registry)
        agg.add_match(match, deliveries)
    agg.finalise()
    return agg, roster


class TestStableIdentity(unittest.TestCase):
    def test_stable_id_is_deterministic(self):
        # Python salts str.__hash__ per process; ids must not depend on it.
        self.assertEqual(stable_id("A Player"), stable_id("A Player"))
        self.assertNotEqual(stable_id("A Player"), stable_id("B Player"))
        self.assertTrue(stable_id("A Player").startswith("sim-"))

    def test_slug_is_url_safe_and_stable(self):
        slug = slugify("R.G. O'Brien-Smith", "abc123def456")
        self.assertRegex(slug, r"^[a-z0-9-]+$")
        self.assertEqual(slug, slugify("R.G. O'Brien-Smith", "abc123def456"))


class TestAggregateInvariants(unittest.TestCase):
    """Totals that must reconcile no matter what the simulator produced."""

    @classmethod
    def setUpClass(cls):
        cls.agg, cls.roster = build_corpus()

    def test_runs_conceded_reconcile_with_runs_scored(self):
        # Every run off the bat is charged to some bowler.
        bat_runs = sum(p.bat_overall.runs for p in self.agg.players.values())
        bowl_runs = sum(p.bowl_overall.runs for p in self.agg.players.values())
        # Bowlers are additionally charged wides and no-balls, never byes.
        self.assertGreaterEqual(bowl_runs, bat_runs)

    def test_balls_faced_equals_balls_bowled(self):
        faced = sum(p.bat_overall.balls for p in self.agg.players.values())
        bowled = sum(p.bowl_overall.balls for p in self.agg.players.values())
        # Balls faced counts no-balls; balls bowled (legal deliveries) does not.
        self.assertGreaterEqual(faced, bowled)
        self.assertLess(abs(faced - bowled) / max(1, bowled), 0.05)

    def test_type_splits_sum_to_overall(self):
        for record in self.agg.players.values():
            if record.bat_overall.balls < 200:
                continue
            by_type = sum(s.balls for s in record.bat_by_type.values())
            # Every bowler in the simulated world has a known style.
            self.assertEqual(by_type, record.bat_overall.balls, record.name)

    def test_family_splits_partition_type_splits(self):
        for record in self.agg.players.values():
            pace = sum(record.bat_by_type[t].balls for t in PACE_TYPES)
            spin = sum(record.bat_by_type[t].balls for t in SPIN_TYPES)
            self.assertEqual(record.bat_by_family["pace"].balls, pace)
            self.assertEqual(record.bat_by_family["spin"].balls, spin)

    def test_type_phase_crosstab_sums_to_type(self):
        for record in self.agg.players.values():
            if record.bat_overall.balls < 200:
                continue
            for bowling_type, split in record.bat_by_type.items():
                crossed = sum(
                    s.balls for key, s in record.bat_by_type_phase.items()
                    if key.split("|")[0] == bowling_type)
                self.assertEqual(crossed, split.balls,
                                 f"{record.name} {bowling_type}")

    def test_entry_splits_sum_to_overall(self):
        for record in self.agg.players.values():
            if record.bat_overall.balls < 200:
                continue
            total = sum(s.balls for s in record.bat_by_entry.values())
            self.assertEqual(total, record.bat_overall.balls, record.name)

    def test_dismissals_do_not_exceed_innings(self):
        for record in self.agg.players.values():
            self.assertLessEqual(record.bat_overall.outs,
                                 len(record.bat_innings), record.name)

    def test_every_innings_has_a_date_and_opposition(self):
        for record in self.agg.players.values():
            for inn in record.bat_innings:
                self.assertTrue(inn.date)
                self.assertTrue(inn.opposition)
                self.assertNotEqual(inn.opposition, inn.match_id)

    def test_home_and_away_are_both_populated(self):
        # If the venue lookup does not know the simulated grounds, this split
        # silently disappears and the site looks broken.
        totals = {"home": 0, "away": 0}
        for record in self.agg.players.values():
            for key in totals:
                totals[key] += record.bat_by_home[key].balls
        self.assertGreater(totals["home"], 0)
        self.assertGreater(totals["away"], 0)


class TestAnalysis(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.agg, cls.roster = build_corpus(matches=140)
        cls.cohort = Cohort("t20i", cls.agg.players)

    def test_claims_carry_their_evidence(self):
        found = 0
        for record in self.agg.players.values():
            result = analyse_player(record, self.cohort, "t20i")
            for claim in result["strengths"] + result["weaknesses"]:
                found += 1
                self.assertGreater(claim["balls"], 0)
                self.assertIn(claim["confidence"], ("high", "medium", "low"))
                self.assertGreaterEqual(claim["percentile"], 0)
                self.assertLessEqual(claim["percentile"], 100)
                self.assertIn(claim["kind"], ("strength", "weakness"))
                self.assertTrue(claim["text"].endswith("."))
                # A weakness must sit in the low tail, a strength in the high.
                if claim["kind"] == "weakness":
                    self.assertLessEqual(claim["percentile"], 30.0)
                else:
                    self.assertGreaterEqual(claim["percentile"], 70.0)
        self.assertGreater(found, 0, "the analysis produced no claims at all")

    def test_claim_text_direction_matches_percentile(self):
        for record in self.agg.players.values():
            result = analyse_player(record, self.cohort, "t20i")
            for claim in result["strengths"] + result["weaknesses"]:
                if claim["percentile"] < 50:
                    self.assertIn("bottom", claim["text"])
                else:
                    self.assertIn("top", claim["text"])

    def test_percentile_profile_axes_are_bounded(self):
        for record in self.agg.players.values():
            profile = analyse_player(record, self.cohort, "t20i")["profile"]
            for axis in profile.values():
                self.assertGreaterEqual(axis["percentile"], 0)
                self.assertLessEqual(axis["percentile"], 100)

    def test_relative_percentiles_do_not_brand_weak_players_weak_everywhere(self):
        """The regression this method exists to prevent.

        Scored on absolute numbers, a below-average batter lands in the bottom
        tail against every bowling type at once. Scored relative to their own
        baseline, only genuinely type-specific gaps show up.
        """
        counts = []
        for record in self.agg.players.values():
            if record.bat_overall.balls < 600:
                continue
            result = analyse_player(record, self.cohort, "t20i")
            counts.append(sum(1 for c in result["weaknesses"]
                              if c["dimensionKey"] == "vs_type"))
        self.assertTrue(counts)
        mean = sum(counts) / len(counts)
        self.assertLess(mean, len(BOWLING_TYPES) / 2,
                        f"mean of {mean:.1f} type weaknesses per batter is indiscriminate")


class TestExport(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_export_writes_a_complete_dataset(self):
        agg, roster = build_corpus(matches=80)
        metadata = {p.name: {"bowlingType": p.bowling_type,
                             "battingHand": p.batting_hand,
                             "role": p.role, "country": p.team}
                    for p in roster}
        summary = export_all({"t20i": agg}, metadata, self.dir,
                             provenance={"dataset": "test"})
        self.assertGreater(summary["players"], 10)

        for name in ("manifest.json", "players.json", "teams.json",
                     "venues.json", "cohorts.json"):
            self.assertTrue((self.dir / name).exists(), name)

        index = json.loads((self.dir / "players.json").read_text())["players"]
        self.assertEqual(len(index), summary["players"])

        for row in index:
            detail = self.dir / "players" / f"{row['slug']}.json"
            self.assertTrue(detail.exists(), f"missing detail for {row['name']}")
            payload = json.loads(detail.read_text())
            self.assertEqual(payload["name"], row["name"])
            self.assertIn("t20i", payload["formats"])

    def test_manifest_records_provenance_and_thresholds(self):
        agg, roster = build_corpus(matches=60)
        export_all({"t20i": agg}, {}, self.dir,
                   provenance={"dataset": "demo", "notice": "simulated"})
        manifest = json.loads((self.dir / "manifest.json").read_text())
        self.assertEqual(manifest["provenance"]["dataset"], "demo")
        self.assertIn("minBallsClaim", manifest["thresholds"])
        self.assertIn("bowlingTypes", manifest)
        self.assertIn("phases", manifest)
        self.assertEqual(set(manifest["phases"]["t20i"][0]),
                         {"key", "from", "to", "label"})

    def test_stale_player_files_are_removed(self):
        agg, roster = build_corpus(matches=60)
        (self.dir / "players").mkdir(parents=True, exist_ok=True)
        stale = self.dir / "players" / "someone-who-left.json"
        stale.write_text("{}")
        export_all({"t20i": agg}, {}, self.dir)
        self.assertFalse(stale.exists(), "a previous build's files must not linger")


class TestSeedReproducibility(unittest.TestCase):
    def test_two_builds_are_identical(self):
        """The demo dataset must be byte-for-byte reproducible.

        Otherwise every rebuild churns every player slug, which breaks any URL
        anyone has saved and makes the git diff meaningless.
        """
        from pipeline.seed import build_seed
        outs = []
        for _ in range(2):
            d = Path(tempfile.mkdtemp())
            build_seed(d)
            payload = {
                p.relative_to(d).as_posix(): p.read_text()
                for p in sorted(d.rglob("*.json"))
                if p.name != "manifest.json"
            }
            outs.append(payload)
            shutil.rmtree(d, ignore_errors=True)
        self.assertEqual(set(outs[0]), set(outs[1]), "different files produced")
        for key in outs[0]:
            self.assertEqual(outs[0][key], outs[1][key], f"{key} differs between builds")


if __name__ == "__main__":
    unittest.main(verbosity=2)


class TestCuratedStyles(unittest.TestCase):
    """The curated CSV is the fallback when profile enrichment is unavailable."""

    def setUp(self):
        from pipeline.enrich import load_csv
        self.records = load_csv(Path("data/styles.csv"))

    def test_file_loads_despite_the_comment_header(self):
        self.assertGreater(len(self.records), 40)

    def test_every_style_normalises_to_a_known_key(self):
        for name, row in self.records.items():
            self.assertIn(row["bowlingType"], BOWLING_TYPES,
                          f"{name}: {row['bowlingType']!r} is not a known bowling type")

    def test_every_hand_is_left_or_right(self):
        for name, row in self.records.items():
            if row["battingHand"]:
                self.assertIn(row["battingHand"], ("left", "right"), name)

    def test_curated_entries_beat_scraped_ones(self):
        """A hand-checked correction must never be silently undone by a re-scrape."""
        from pipeline import enrich
        name = next(iter(self.records))
        cached = {name: {"bowlingType": "rm", "source": "espncricinfo"}}
        original = enrich.load_cache
        try:
            enrich.load_cache = lambda: cached
            resolved, _stats = enrich.resolve({name}, {}, use_cricinfo=False)
        finally:
            enrich.load_cache = original
        self.assertEqual(resolved[name]["bowlingType"],
                         self.records[name]["bowlingType"])
