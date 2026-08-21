/**
 * The strategy engine.
 *
 * Given a batter (or a whole batting side) and the bowling resources available,
 * this produces a plan: which bowler to use, in which phase, and why.
 *
 * What the plan is built from
 * ---------------------------
 * Everything here is derived from the ball-by-ball record:
 *   - how the batter fares against each bowling type, relative to their own
 *     overall standard rather than in absolute terms
 *   - how they fare by phase of the innings
 *   - how vulnerable they are before they are set
 *   - the mix of ways they actually get out
 *   - and, for a named bowler, that bowler's own record against that hand
 *
 * What it is NOT built from
 * -------------------------
 * Ball-tracking - length, line, speed, seam position, spin revolutions - is not
 * in any openly licensed dataset, so this engine never claims a length-based
 * plan ("short ball weakness", "full and straight"). Where it mentions the
 * stumps or the outside edge, that is inferred from the *dismissal mode mix*
 * (bowled and lbw versus caught), which the data does record, and it is labelled
 * as such. Recommendations are stated at the level the evidence supports.
 */

/** "a, b and c" - the Oxford-free list join used throughout the generated prose. */
export function joinList(items) {
  if (items.length <= 1) return items[0] || '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * Typical bowling strike rate (balls per wicket) in each format.
 *
 * A bowler's quality term is scored against the norm *for their format*. Using
 * one constant made every Test bowler score badly - a Test strike rate of 57 is
 * excellent and a T20 strike rate of 57 is unplayable-in-the-wrong-direction -
 * which dragged every matchup in the matrix negative and painted the whole grid
 * red regardless of the actual matchup.
 */
const REFERENCE_SR = { test: 57, odi: 40, t20i: 21, ipl: 21, bbl: 21, psl: 21 };

const CONFIDENCE_K = 150;      // balls at which a split is half-trusted
const MIN_PLAN_BALLS = 60;
const AVG_WEIGHT = 0.65;       // dismissing them matters more than slowing them
const SR_WEIGHT = 0.35;

/** How much to trust a split at this sample size: 0 to 1. */
export function confidence(balls, k = CONFIDENCE_K) {
  return balls / (balls + k);
}

export function confidenceLabel(balls, k = CONFIDENCE_K) {
  const c = confidence(balls, k);
  if (c >= 0.78) return 'high';
  if (c >= 0.55) return 'medium';
  return 'low';
}

/**
 * How strongly one bowling type suppresses one batter.
 *
 * Positive means the type does better than the batter's own baseline: it takes
 * their wicket more often, or slows them down, or both. The two components are
 * ratios to the batter's own numbers, so a modest batter does not register as
 * "vulnerable to everything" simply for being modest.
 */
export function matchupEdge(split, baseline) {
  if (!split || !baseline || !split.balls) return null;
  const balls = split.balls;
  // Balls per dismissal handles the "never out in this split" case cleanly,
  // where average is null.
  const bpd = split.outs > 0 ? split.balls / split.outs : null;
  const baseBpd = baseline.outs > 0 ? baseline.balls / baseline.outs : null;

  let survival = 0;
  if (bpd != null && baseBpd) survival = 1 - bpd / baseBpd;
  else if (bpd == null && baseBpd) survival = -0.35;   // survived throughout

  const tempo = baseline.sr ? 1 - (split.sr / baseline.sr) : 0;
  const raw = AVG_WEIGHT * survival + SR_WEIGHT * tempo;
  return {
    edge: raw * confidence(balls),
    rawEdge: raw,
    survival,
    tempo,
    balls,
    confidence: confidenceLabel(balls),
    avg: split.avg,
    sr: split.sr,
    bpd,
  };
}

/**
 * Rank every bowling type against one batter in one format.
 * `player` is the per-format payload from the player JSON.
 */
export function rankMatchups(player, manifest, { minBalls = MIN_PLAN_BALLS } = {}) {
  const batting = player.batting;
  if (!batting) return [];
  const baseline = batting.overall;
  const out = [];
  for (const [type, split] of Object.entries(batting.byType || {})) {
    if (split.balls < minBalls) continue;
    const edge = matchupEdge(split, baseline);
    if (!edge) continue;
    const spec = manifest.bowlingTypes?.[type] || {};
    out.push({
      type,
      label: spec.label || type,
      family: spec.family || '',
      arm: spec.arm || '',
      ...edge,
      dismissals: batting.dismissedByType?.[type] || 0,
    });
  }
  return out.sort((a, b) => b.edge - a.edge);
}

/**
 * Rank bowling types *within one phase*, from the type x phase cross-tab.
 *
 * Without this, a "phase plan" is just the global matchup ranking repeated
 * three times with a different heading — which is exactly what it looked like.
 * The cross-tab is thinner than the whole-career split, so the sample gate is
 * lower and the confidence label does more work.
 */
export function rankMatchupsInPhase(player, manifest, phase, { minBalls = 90 } = {}) {
  const batting = player.batting;
  if (!batting?.byTypePhase) return [];
  const baseline = batting.overall;
  const out = [];
  for (const [key, split] of Object.entries(batting.byTypePhase)) {
    const [type, splitPhase] = key.split('|');
    if (splitPhase !== phase || split.balls < minBalls) continue;
    const edge = matchupEdge(split, baseline);
    if (!edge) continue;
    const spec = manifest.bowlingTypes?.[type] || {};
    out.push({
      type,
      label: spec.label || type,
      family: spec.family || '',
      phase,
      ...edge,
    });
  }
  return out.sort((a, b) => b.edge - a.edge);
}

/** Where in the innings is this batter most and least vulnerable? */
export function phaseProfile(player, manifest, fmt) {
  const batting = player.batting;
  if (!batting) return [];
  const order = manifest.phases?.[fmt] || [];
  const baseline = batting.overall;
  const rows = [];
  // Phases are returned in the order they occur in an innings. Sorting them by
  // severity would make the plan unreadable: a bowling plan is a sequence.
  for (const spec of order) {
    const split = batting.byPhase?.[spec.key];
    if (!split || split.balls < MIN_PLAN_BALLS) continue;
    const edge = matchupEdge(split, baseline);
    rows.push({
      phase: spec.key,
      label: spec.label,
      from: spec.from,
      to: spec.to,
      balls: split.balls,
      avg: split.avg,
      sr: split.sr,
      edge: edge ? edge.edge : 0,
      confidence: confidenceLabel(split.balls),
    });
  }
  return rows;
}

/**
 * How this batter gets out, and what that mix implies.
 *
 * The share of bowled + lbw against the share of caught is the one line-and-
 * length signal the ball-by-ball data genuinely carries: a batter who is
 * predominantly bowled or lbw is being beaten by the ball that holds its line
 * or comes back in, and a batter who is overwhelmingly caught is edging or
 * miscuing. That distinction supports a real plan; anything finer would not.
 */
export function dismissalPlan(player) {
  const batting = player.batting;
  if (!batting) return null;
  const counts = batting.dismissals || {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total < 8) return null;

  const share = (...kinds) => kinds.reduce((s, k) => s + (counts[k] || 0), 0) / total;
  const stumps = share('bowled', 'lbw');
  const caught = share('caught', 'caught and bowled');
  const stumped = share('stumped');
  const runOut = share('run out');

  const notes = [];
  // Reference mix across international cricket: roughly 55-60% caught,
  // 30-35% bowled or lbw. Departures from that are what carry information.
  if (stumps >= 0.42) {
    notes.push({
      kind: 'attack-stumps',
      text: `${Math.round(stumps * 100)}% of dismissals are bowled or lbw, well above the ~33% norm. `
        + 'Bowling at the stumps is the productive mode against them; the wicket comes from '
        + 'beating the bat straight rather than finding an edge.',
    });
  } else if (caught >= 0.72) {
    notes.push({
      kind: 'catchers',
      text: `${Math.round(caught * 100)}% of dismissals are caught, above the ~58% norm. `
        + 'They get out by hitting the ball in the air or edging it, so the plan is catching '
        + 'fielders in position rather than a stump-to-stump line.',
    });
  }
  if (stumped >= 0.10) {
    notes.push({
      kind: 'stumped',
      text: `Stumped in ${Math.round(stumped * 100)}% of dismissals — they commit down the pitch `
        + 'to spin. Flight, and a keeper up, is a live wicket-taking option.',
    });
  }
  if (runOut >= 0.14) {
    notes.push({
      kind: 'run-out',
      text: `${Math.round(runOut * 100)}% run out — unusually high. Pressure in the field and `
        + 'direct-hit chances are worth more against them than against most.',
    });
  }
  return { total, stumps, caught, stumped, runOut, notes };
}

/** Is this batter markedly more vulnerable before they are set? */
export function entryVulnerability(player) {
  const byEntry = player.batting?.byEntry;
  if (!byEntry) return null;
  const fresh = byEntry.new;
  const set = byEntry.set;
  if (!fresh || !set || !fresh.bpd || !set.bpd) return null;
  const ratio = fresh.bpd / set.bpd;
  return {
    newBpd: fresh.bpd,
    setBpd: set.bpd,
    ratio,
    // Every batter is more vulnerable early; below ~0.45 is notably so.
    severe: ratio < 0.45,
    balls: fresh.balls,
  };
}

/**
 * Score one named bowler against one batter.
 *
 * Two ingredients: how the batter fares against that bowler's *type*, and how
 * that bowler performs against that batter's *hand*. A head-to-head record is
 * used when there is a real one, but it is weighted by its own sample size -
 * 30 balls of history is a curiosity, not evidence.
 */
export function scoreBowler(bowler, batter, manifest, fmt) {
  const bowlPayload = bowler.data?.formats?.[fmt]?.bowling;
  const batPayload = batter.data?.formats?.[fmt]?.batting;
  if (!bowlPayload || !batPayload) return null;

  const type = bowler.meta?.bowlingType || bowler.data?.meta?.bowlingType || '';
  const hand = batter.data?.meta?.battingHand || '';
  const spec = manifest.bowlingTypes?.[type] || {};

  const typeSplit = batPayload.byType?.[type];
  const typeEdge = typeSplit ? matchupEdge(typeSplit, batPayload.overall) : null;

  // The bowler's own quality against this hand, relative to their overall.
  const handSplit = hand ? bowlPayload.byHand?.[hand] : null;
  const overall = bowlPayload.overall;
  let handEdge = 0;
  if (handSplit && overall && handSplit.balls >= 90) {
    const econRatio = overall.econ ? 1 - handSplit.econ / overall.econ : 0;
    const srRatio = handSplit.sr && overall.sr ? 1 - handSplit.sr / overall.sr : 0;
    handEdge = (0.4 * econRatio + 0.6 * srRatio) * confidence(handSplit.balls, 200);
  }

  // Direct head-to-head, if any.
  const h2h = batPayload.vsBowler?.[bowler.name] || null;
  let h2hEdge = 0;
  if (h2h && h2h.balls >= 30) {
    const e = matchupEdge(h2h, batPayload.overall);
    h2hEdge = e ? e.edge : 0;
  }

  // Absolute bowler quality, so a great bowler with a neutral matchup still
  // outranks a weak bowler with a favourable one. Expressed as a proportional
  // departure from the format norm, which keeps it comparable across formats.
  const reference = REFERENCE_SR[fmt] || 40;
  const quality = overall && overall.sr
    ? Math.max(-0.5, Math.min(0.6, (reference - overall.sr) / (reference * 0.7)))
    : 0;

  const score = 0.46 * (typeEdge ? typeEdge.edge : 0)
    + 0.16 * handEdge
    + 0.14 * h2hEdge
    + 0.24 * quality;

  return {
    bowler: bowler.name,
    slug: bowler.slug,
    type,
    typeLabel: spec.label || type || 'Unknown',
    family: spec.family || '',
    score,
    typeEdge,
    handEdge,
    h2h: h2h && h2h.balls >= 30 ? h2h : null,
    quality,
    economy: overall?.econ,
    strikeRate: overall?.sr,
    movement: movementNote(type, hand, manifest),
  };
}

/**
 * Which way the stock ball moves relative to this batter.
 *
 * Right-arm over to a right-hander shapes away; the same bowler to a left-hander
 * angles in. Off spin turns into a right-hander and away from a left-hander.
 * This is the single most-used piece of matchup reasoning in the game, and it
 * follows deterministically from the bowler's type and the batter's hand.
 */
export function movementNote(type, hand, manifest) {
  const spec = manifest.bowlingTypes?.[type];
  if (!spec || (hand !== 'left' && hand !== 'right')) return '';
  const def = spec.swing || spec.turn || '';
  if (!def) return '';
  const intoRhb = def === 'into_rhb';
  const intoBatter = hand === 'right' ? intoRhb : !intoRhb;
  if (spec.family === 'pace') {
    return intoBatter
      ? 'stock ball angles in to the batter'
      : 'stock ball shapes away from the batter';
  }
  return intoBatter
    ? 'stock ball turns in to the batter'
    : 'stock ball turns away from the batter';
}

/**
 * Build a full plan against one batter.
 * `attack` is an optional list of { name, slug, meta, data } bowlers.
 */
export function planAgainstBatter(batter, { fmt, manifest, attack = [] }) {
  const payload = batter.data?.formats?.[fmt];
  if (!payload?.batting) return null;

  const matchups = rankMatchups(payload, manifest);
  const phases = phaseProfile(payload, manifest, fmt);
  const dismissals = dismissalPlan(payload);
  const entry = entryVulnerability(payload);
  const hand = batter.data.meta?.battingHand || '';

  const bowlers = attack
    .map((b) => scoreBowler(b, batter, manifest, fmt))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  const headline = [];
  const best = matchups[0];
  const worst = matchups[matchups.length - 1];
  const careerAvg = payload.batting.overall.avg;
  if (best && best.edge > 0.05) {
    headline.push(
      `${best.label} is the productive matchup: they average `
      + `${best.avg == null ? '—' : best.avg.toFixed(1)} against it, against a career `
      + `${careerAvg == null ? '—' : careerAvg.toFixed(1)}, off ${best.balls} balls.`);
  }
  if (worst && worst.edge < -0.05) {
    // Say *why* it is a bad matchup. Against most bowling the reason is that
    // they simply do not get out, which a strike rate alone does not convey.
    const reason = worst.avg == null
      ? 'they have never been dismissed by it'
      : `they average ${worst.avg.toFixed(1)} against it and score at `
        + `${worst.sr.toFixed(0)}`;
    headline.push(`Avoid ${worst.label.toLowerCase()} — ${reason}.`);
  }
  if (entry?.severe) {
    headline.push(
      `They are far more vulnerable early: a wicket every ${entry.newBpd.toFixed(0)} balls in `
      + `their first 15, against every ${entry.setBpd.toFixed(0)} once set. Attack them on arrival.`);
  }

  const phasePlan = phases.map((p) => {
    // Prefer matchups measured inside this phase; fall back to the career-wide
    // ranking only when the cross-tab is too thin, and say which was used.
    const inPhase = rankMatchupsInPhase(payload, manifest, p.phase);
    const usable = inPhase.filter((m) => phaseSuitsType(m, p.phase, fmt));
    const fallback = matchups.filter((m) => phaseSuitsType(m, p.phase, fmt));
    const source = usable.length >= 2 ? 'phase' : 'career';
    return {
      ...p,
      recommend: (source === 'phase' ? usable : fallback).slice(0, 3),
      recommendSource: source,
      posture: p.edge > 0.03 ? 'attack' : (p.edge < -0.06 ? 'contain' : 'hold'),
    };
  });

  return {
    batter: batter.name,
    hand,
    format: fmt,
    matchups,
    phases: phasePlan,
    dismissals,
    entry,
    bowlers,
    headline,
    caveats: buildCaveats(matchups, payload),
  };
}

/** Spin is a middle-overs resource; genuine pace opens and closes. */
function phaseSuitsType(matchup, phase, fmt) {
  const spin = matchup.family === 'spin';
  if (fmt === 'test') {
    if (phase === 'new_ball') return !spin;
    if (phase === 'old_ball') return true;
    return true;
  }
  if (phase === 'powerplay') return !spin || matchup.edge > 0.12;
  if (phase === 'death') return !spin || matchup.edge > 0.15;
  return true;
}

function buildCaveats(matchups, payload) {
  const out = [];
  const thin = matchups.filter((m) => m.confidence === 'low');
  if (thin.length) {
    out.push(`${thin.length} matchup${thin.length > 1 ? 's are' : ' is'} based on `
      + 'fewer than about 190 balls and should be treated as indicative only.');
  }
  const covered = matchups.reduce((s, m) => s + m.balls, 0);
  const total = payload.batting?.overall?.balls || 0;
  if (total && covered / total < 0.6) {
    out.push(`Only ${Math.round((covered / total) * 100)}% of the balls this batter has faced `
      + 'are attributed to a known bowling type; the rest are bowlers whose style is not in '
      + 'the dataset.');
  }
  out.push('Length, line and speed are not present in openly licensed ball-by-ball data, so '
    + 'no plan here rests on them.');
  return out;
}

/**
 * A bowling plan for a whole innings: assign bowlers to phases against the
 * opposition's batting order.
 */
export function planTeamBowling({ battingSide, bowlingSide, fmt, manifest }) {
  const phases = manifest.phases?.[fmt] || [];
  const batters = battingSide
    .filter((b) => b.data?.formats?.[fmt]?.batting?.overall?.balls > 200)
    .slice(0, 7);
  if (!batters.length || !bowlingSide.length) return null;

  // Score every bowler against every batter once.
  const grid = [];
  for (const batter of batters) {
    for (const bowler of bowlingSide) {
      const s = scoreBowler(bowler, batter, manifest, fmt);
      if (s) grid.push({ batter: batter.name, batterSlug: batter.slug, ...s });
    }
  }

  const byPhase = phases.map((phase) => {
    // Who is likely to be batting in this phase? Early phases mean the top
    // order; later phases the middle order.
    const window = phaseBatters(batters, phase.key, fmt);
    const scores = new Map();
    for (const cell of grid) {
      if (!window.includes(cell.batter)) continue;
      const spec = manifest.bowlingTypes?.[cell.type] || {};
      if (!phaseSuitsType({ family: spec.family, edge: cell.score }, phase.key, fmt)) continue;
      const prev = scores.get(cell.bowler) || { ...cell, total: 0, n: 0, targets: [] };
      prev.total += cell.score;
      prev.n += 1;
      prev.targets.push({ batter: cell.batter, score: cell.score });
      scores.set(cell.bowler, prev);
    }
    const ranked = [...scores.values()]
      .map((s) => ({ ...s, mean: s.total / Math.max(1, s.n) }))
      .sort((a, b) => b.mean - a.mean);
    return {
      phase: phase.key,
      label: phase.label,
      overs: `${phase.from + 1}-${Math.min(phase.to, 200)}`,
      batters: window,
      bowlers: ranked.slice(0, 3),
    };
  });

  // The standout individual matchups, in either direction.
  const edges = grid.slice().sort((a, b) => b.score - a.score);
  return {
    phases: byPhase,
    keyMatchups: edges.slice(0, 6),
    dangerMatchups: edges.slice(-4).reverse(),
    batters: batters.map((b) => b.name),
  };
}

function phaseBatters(batters, phase, fmt) {
  const names = batters.map((b) => b.name);
  if (fmt === 'test') {
    if (phase === 'new_ball') return names.slice(0, 4);
    if (phase === 'old_ball') return names.slice(2, 7);
    return names.slice(3);
  }
  if (phase === 'powerplay') return names.slice(0, 3);
  if (phase === 'middle') return names.slice(1, 6);
  return names.slice(3);
}

/**
 * A batting plan: given a batter and the attack they face, where should they
 * look to score and where should they see the bowler off?
 */
export function planForBatter(batter, { fmt, manifest, attack = [] }) {
  const plan = planAgainstBatter(batter, { fmt, manifest, attack });
  if (!plan) return null;
  const target = plan.matchups.filter((m) => m.edge < -0.04).slice(0, 3);
  const respect = plan.matchups.filter((m) => m.edge > 0.06).slice(0, 3);
  const overall = batter.data.formats[fmt].batting.overall;
  return {
    ...plan,
    scoreAgainst: target,
    seeOff: respect,
    advice: [
      target.length
        ? `Look to score against ${joinList(target.map((t) => t.label.toLowerCase()))}. `
          + `Against ${target[0].label.toLowerCase()} they average `
          + `${target[0].avg == null ? '—' : target[0].avg.toFixed(1)} at a strike rate of `
          + `${target[0].sr.toFixed(0)}, against a career `
          + `${overall.avg == null ? '—' : overall.avg.toFixed(1)} at `
          + `${overall.sr.toFixed(0)}.`
        : null,
      respect.length
        ? `See off ${joinList(respect.map((t) => t.label.toLowerCase()))} — this is where the `
          + 'wicket usually comes from.'
        : null,
      plan.entry?.severe
        ? 'Getting through the first 15 balls is worth more for this batter than for most: '
          + `their dismissal rate roughly ${(1 / plan.entry.ratio).toFixed(1)}x higher before they are set.`
        : null,
    ].filter(Boolean),
  };
}
