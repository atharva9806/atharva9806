/**
 * Tests for the strategy engine, run against the generated dataset.
 *   node --test tests/js/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const S = await import('../../web/assets/js/lib/strategy.js');
const manifest = JSON.parse(readFileSync('web/data/manifest.json', 'utf8'));

const files = readdirSync('web/data/players').filter((f) => f.endsWith('.json'));
const load = (f) => JSON.parse(readFileSync(`web/data/players/${f}`, 'utf8'));
const all = files.map((f) => {
  const d = load(f);
  return { name: d.name, slug: d.slug, meta: d.meta, data: d };
});

const withBatting = (fmt) => all.filter((p) => p.data.formats[fmt]?.batting?.overall?.balls > 900);
const withBowling = (fmt) => all.filter((p) => p.data.formats[fmt]?.bowling?.overall?.balls > 900);

test('confidence rises with sample size and stays in [0,1)', () => {
  assert.ok(S.confidence(0) === 0);
  assert.ok(S.confidence(150) > 0.49 && S.confidence(150) < 0.51);
  assert.ok(S.confidence(10000) < 1 && S.confidence(10000) > 0.98);
  assert.ok(S.confidence(600) > S.confidence(200));
  assert.equal(S.confidenceLabel(50), 'low');
  assert.equal(S.confidenceLabel(1200), 'high');
});

test('matchupEdge is positive when the split is worse than the baseline', () => {
  const baseline = { balls: 1000, outs: 20, sr: 50, avg: 40 };      // bpd 50
  const tough   = { balls: 300, outs: 15, sr: 40, avg: 20 };        // bpd 20
  const easy    = { balls: 300, outs: 3,  sr: 70, avg: 100 };       // bpd 100
  const t = S.matchupEdge(tough, baseline);
  const e = S.matchupEdge(easy, baseline);
  assert.ok(t.edge > 0, 'a suppressing matchup scores positive');
  assert.ok(e.edge < 0, 'a favourable matchup scores negative');
  assert.ok(t.edge > e.edge);
});

test('matchupEdge discounts small samples towards zero', () => {
  const baseline = { balls: 1000, outs: 20, sr: 50 };
  const shape = (balls, outs) => ({ balls, outs, sr: 40 });
  const small = S.matchupEdge(shape(60, 3), baseline);
  const large = S.matchupEdge(shape(1200, 60), baseline);
  assert.ok(Math.abs(small.edge) < Math.abs(large.edge),
    'the same per-ball shape scores lower on a small sample');
  assert.ok(Math.abs(small.rawEdge - large.rawEdge) < 1e-9,
    'the raw, undiscounted shape is identical');
});

test('matchupEdge handles a split with no dismissals', () => {
  const baseline = { balls: 1000, outs: 20, sr: 50 };
  const never = { balls: 200, outs: 0, sr: 60, avg: null };
  const e = S.matchupEdge(never, baseline);
  assert.ok(e !== null);
  assert.ok(Number.isFinite(e.edge));
  assert.equal(e.bpd, null);
  assert.ok(e.edge < 0, 'never being dismissed is a favourable matchup for the batter');
});

test('matchupEdge returns null on missing or empty input', () => {
  assert.equal(S.matchupEdge(null, { balls: 1, outs: 1, sr: 1 }), null);
  assert.equal(S.matchupEdge({ balls: 0, outs: 0, sr: 0 }, { balls: 1, outs: 1, sr: 1 }), null);
  assert.equal(S.matchupEdge({ balls: 10, outs: 1, sr: 50 }, null), null);
});

test('movementNote flips with the batter hand', () => {
  // Off break turns into a right-hander and away from a left-hander.
  assert.match(S.movementNote('ob', 'right', manifest), /turns in to/);
  assert.match(S.movementNote('ob', 'left', manifest), /turns away/);
  // Left-arm pace angles in to a right-hander, away from a left-hander.
  assert.match(S.movementNote('lfm', 'right', manifest), /angles in/);
  assert.match(S.movementNote('lfm', 'left', manifest), /shapes away/);
  // Right-arm pace is the mirror image.
  assert.match(S.movementNote('rfm', 'right', manifest), /shapes away/);
  assert.match(S.movementNote('rfm', 'left', manifest), /angles in/);
  assert.equal(S.movementNote('rfm', '', manifest), '');
  assert.equal(S.movementNote('nonsense', 'right', manifest), '');
});

test('rankMatchups orders by edge, descending', () => {
  const batter = withBatting('test')[0];
  const ranked = S.rankMatchups(batter.data.formats.test, manifest);
  assert.ok(ranked.length >= 3, 'a long career should have several qualifying matchups');
  for (let i = 1; i < ranked.length; i += 1) {
    assert.ok(ranked[i - 1].edge >= ranked[i].edge, 'sorted descending');
  }
  for (const m of ranked) {
    assert.ok(m.balls >= 60, 'below the sample gate is excluded');
    assert.ok(['pace', 'spin'].includes(m.family));
  }
});

test('planAgainstBatter produces a coherent plan', () => {
  const batter = withBatting('test')[0];
  const attack = withBowling('test').slice(0, 6);
  const plan = S.planAgainstBatter(batter, { fmt: 'test', manifest, attack });
  assert.ok(plan, 'a plan is produced');
  assert.equal(plan.batter, batter.name);
  assert.ok(plan.matchups.length > 0);
  assert.ok(plan.bowlers.length > 0, 'the supplied attack is ranked');
  for (let i = 1; i < plan.bowlers.length; i += 1) {
    assert.ok(plan.bowlers[i - 1].score >= plan.bowlers[i].score);
  }
  // Every plan states the limits of its evidence.
  assert.ok(plan.caveats.some((c) => /Length, line and speed/.test(c)));
  for (const p of plan.phases) {
    assert.ok(['attack', 'contain', 'hold'].includes(p.posture));
  }
});

test('planAgainstBatter returns null for a player with no batting record', () => {
  const bowler = all.find((p) => !p.data.formats.test?.batting
    && p.data.formats.test?.bowling);
  if (!bowler) return;   // dataset may not contain a pure bowler
  assert.equal(S.planAgainstBatter(bowler, { fmt: 'test', manifest }), null);
});

test('planAgainstBatter tolerates an empty attack', () => {
  const batter = withBatting('odi')[0];
  const plan = S.planAgainstBatter(batter, { fmt: 'odi', manifest, attack: [] });
  assert.ok(plan);
  assert.deepEqual(plan.bowlers, []);
});

test('the plan recovers the batter’s genuinely worst matchup', () => {
  // The top-ranked matchup must actually be one where the batter does worse
  // than their own baseline, not merely the first key in the object.
  let checked = 0;
  for (const batter of withBatting('test').slice(0, 12)) {
    const payload = batter.data.formats.test;
    const plan = S.planAgainstBatter(batter, { fmt: 'test', manifest });
    if (!plan?.matchups.length) continue;
    const top = plan.matchups[0];
    const base = payload.batting.overall;
    const topBpd = top.bpd;
    const baseBpd = base.balls / base.outs;
    if (top.edge > 0.08 && topBpd != null) {
      assert.ok(topBpd < baseBpd,
        `${batter.name}: top matchup ${top.label} should dismiss them faster than their norm`);
      checked += 1;
    }
  }
  assert.ok(checked > 0, 'at least one batter had a clear top matchup to verify');
});

test('dismissalPlan shares sum to about one', () => {
  for (const batter of withBatting('test').slice(0, 10)) {
    const d = S.dismissalPlan(batter.data.formats.test);
    if (!d) continue;
    const sum = d.stumps + d.caught + d.stumped + d.runOut;
    assert.ok(sum > 0.9 && sum <= 1.0001, `shares sum to ${sum}`);
    assert.ok(d.total >= 8);
  }
});

test('entryVulnerability reports batters as more fragile early', () => {
  const ratios = [];
  for (const batter of withBatting('test')) {
    const e = S.entryVulnerability(batter.data.formats.test);
    if (e) ratios.push(e.ratio);
  }
  assert.ok(ratios.length > 5);
  const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  assert.ok(mean < 1, `batters should survive longer once set (mean ratio ${mean.toFixed(2)})`);
});

test('planTeamBowling assigns bowlers to every phase', () => {
  const batting = withBatting('t20i').slice(0, 7);
  const bowling = withBowling('t20i').slice(0, 6);
  const plan = S.planTeamBowling({ battingSide: batting, bowlingSide: bowling, fmt: 't20i', manifest });
  assert.ok(plan);
  assert.equal(plan.phases.length, manifest.phases.t20i.length);
  for (const phase of plan.phases) {
    assert.ok(phase.batters.length > 0, `${phase.label} has batters in the window`);
    assert.ok(phase.bowlers.length > 0, `${phase.label} has a recommended bowler`);
    for (let i = 1; i < phase.bowlers.length; i += 1) {
      assert.ok(phase.bowlers[i - 1].mean >= phase.bowlers[i].mean);
    }
  }
  assert.ok(plan.keyMatchups.length > 0);
  assert.ok(plan.keyMatchups[0].score >= plan.dangerMatchups[0].score);
});

test('planTeamBowling returns null when a side is empty', () => {
  assert.equal(S.planTeamBowling({
    battingSide: [], bowlingSide: withBowling('odi').slice(0, 3), fmt: 'odi', manifest,
  }), null);
});

test('planForBatter separates scoring options from threats', () => {
  const batter = withBatting('odi')[0];
  const plan = S.planForBatter(batter, { fmt: 'odi', manifest });
  assert.ok(plan);
  for (const t of plan.scoreAgainst) assert.ok(t.edge < 0);
  for (const t of plan.seeOff) assert.ok(t.edge > 0);
  const overlap = plan.scoreAgainst.filter((a) => plan.seeOff.some((b) => b.type === a.type));
  assert.equal(overlap.length, 0, 'no bowling type is both a target and a threat');
});
