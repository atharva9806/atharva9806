/**
 * The strategy planner.
 *
 * Two modes:
 *   Player  - one batter against a chosen attack: matchup ranking, phase plan,
 *             a dismissal-mode read, and the batter's own counter-plan.
 *   Team    - a full batting side against a full bowling side: an over-by-over
 *             allocation plus the standout matchups in both directions.
 *
 * Every recommendation shows the numbers it came from. A plan you cannot audit
 * is just an opinion with a chart attached.
 */
import { h, clear } from '../lib/dom.js';
import { fmt } from '../lib/format.js';
import { store } from '../lib/store.js';
import { barChart, heatmap, legendFor } from '../charts/index.js';
import { figure, token } from '../charts/core.js';
import { simpleTable, dataTable } from '../lib/table.js';
import {
  planAgainstBatter, planForBatter, planTeamBowling, scoreBowler,
} from '../lib/strategy.js';
import {
  card, chip, datasetNotice, emptyState, orderFormats, pageHead,
} from './components.js';

export async function render({ manifest, players, route }) {
  const root = h('div', { class: 'stack' });
  const notice = datasetNotice(manifest);
  if (notice) root.appendChild(notice);
  root.appendChild(pageHead('Strategy planner',
    'Build a bowling plan against a batter or a whole side, from how they actually play '
    + 'each type of bowling, each phase of an innings, and each stage of their own innings.'));

  const formats = orderFormats(Object.keys(manifest.formats || {}));
  const teams = [...new Set(players.flatMap((p) => p.teams))].sort();

  const state = {
    mode: route.query.get('team') ? 'team' : 'player',
    fmt: formats.includes(route.query.get('format')) ? route.query.get('format') : formats[0],
    batter: route.query.get('batter') || null,
    battingTeam: route.query.get('team') || teams[0],
    bowlingTeam: route.query.get('vs') || teams[1] || teams[0],
  };

  const modeSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Planner mode' });
  for (const [key, label] of [['player', 'Against one batter'], ['team', 'Team against team']]) {
    const btn = h('button', { type: 'button', text: label,
      'aria-pressed': String(state.mode === key) });
    btn.addEventListener('click', () => {
      state.mode = key;
      for (const b of modeSeg.querySelectorAll('button')) {
        b.setAttribute('aria-pressed', String(b.textContent === label));
      }
      refresh();
    });
    modeSeg.appendChild(btn);
  }

  const controls = h('div', { class: 'row', style: 'gap:.75rem;align-items:flex-end' });
  const host = h('div', { class: 'stack' });
  root.append(modeSeg, controls, host);

  function selectField(label, options, value, onChange, width = '200px') {
    const sel = h('select', { class: 'select', style: `min-width:${width}` });
    for (const o of options) {
      const opt = h('option', { value: String(o.value), text: o.label });
      if (String(o.value) === String(value)) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener('change', () => onChange(sel.value));
    return h('div', { class: 'field' }, [h('label', { text: label }), sel]);
  }

  async function refresh() {
    clear(controls);
    clear(host);
    host.appendChild(h('div', { class: 'spinner', role: 'status' }));

    controls.appendChild(selectField('Format',
      formats.map((f) => ({ value: f, label: manifest.formats[f].label })),
      state.fmt, (v) => { state.fmt = v; refresh(); }, '120px'));

    const eligible = players.filter((p) => p.formats[state.fmt]?.bat?.balls > 400);
    if (state.mode === 'player') {
      if (!eligible.some((p) => p.slug === state.batter)) state.batter = eligible[0]?.slug;
      controls.appendChild(selectField('Batter',
        eligible.map((p) => ({ value: p.slug, label: `${p.name} · ${p.teams[0] || ''}` })),
        state.batter, (v) => { state.batter = v; refresh(); }, '230px'));
      controls.appendChild(selectField('Bowling side',
        teams.map((t) => ({ value: t, label: t })),
        state.bowlingTeam, (v) => { state.bowlingTeam = v; refresh(); }));
    } else {
      controls.appendChild(selectField('Batting side',
        teams.map((t) => ({ value: t, label: t })),
        state.battingTeam, (v) => { state.battingTeam = v; refresh(); }));
      controls.appendChild(selectField('Bowling side',
        teams.map((t) => ({ value: t, label: t })),
        state.bowlingTeam, (v) => { state.bowlingTeam = v; refresh(); }));
    }

    try {
      clear(host);
      if (state.mode === 'player') host.appendChild(await playerPlan(state, players, manifest));
      else host.appendChild(await teamPlan(state, players, manifest));
    } catch (err) {
      clear(host).appendChild(emptyState('Could not build a plan', String(err.message)));
    }
  }

  await refresh();
  return root;
}

/** Load the full records for a squad, capped so the page stays responsive. */
async function loadSquad(players, team, fmtKey, { bowlers = false, limit = 8 } = {}) {
  const candidates = players
    .filter((p) => p.teams.includes(team))
    .filter((p) => (bowlers
      ? p.formats[fmtKey]?.bowl?.balls > 600
      : p.formats[fmtKey]?.bat?.balls > 400))
    .sort((a, b) => (bowlers
      ? b.formats[fmtKey].bowl.wkts - a.formats[fmtKey].bowl.wkts
      : b.formats[fmtKey].bat.runs - a.formats[fmtKey].bat.runs))
    .slice(0, limit);
  const loaded = await Promise.all(candidates.map(async (p) => ({
    name: p.name, slug: p.slug, meta: p, data: await store.player(p.slug),
  })));
  return loaded;
}

/* ==========================================================================
   Plan against one batter
   ========================================================================== */
async function playerPlan(state, players, manifest) {
  const entry = players.find((p) => p.slug === state.batter);
  if (!entry) return emptyState('Pick a batter');
  const data = await store.player(state.batter);
  const batter = { name: entry.name, slug: entry.slug, meta: entry, data };
  const attack = await loadSquad(players, state.bowlingTeam, state.fmt,
    { bowlers: true, limit: 8 });

  const plan = planAgainstBatter(batter, { fmt: state.fmt, manifest, attack });
  if (!plan) {
    return emptyState('Not enough data',
      `${entry.name} has no qualifying batting record in ${manifest.formats[state.fmt].label}.`);
  }
  const counter = planForBatter(batter, { fmt: state.fmt, manifest, attack });

  const wrap = h('div', { class: 'stack' });

  // --- the summary ------------------------------------------------------
  wrap.appendChild(card([
    h('div', { class: 'card__head' }, [
      h('h2', { text: `Bowling to ${entry.name}` }),
      h('div', { class: 'row' }, [
        chip(manifest.formats[state.fmt].label),
        plan.hand ? chip(`${plan.hand === 'left' ? 'Left' : 'Right'}-hand bat`) : null,
        chip(`vs ${state.bowlingTeam}`),
      ].filter(Boolean)),
    ]),
    plan.headline.length
      ? h('ul', { style: 'margin:.5rem 0 0;padding-left:1.1rem' },
        plan.headline.map((line) => h('li', { text: line, style: 'margin-bottom:.3rem' })))
      : h('p', { class: 'muted', text: 'No split departs far enough from this batter’s '
        + 'baseline to support a specific plan. Bowl your best bowlers.' }),
  ]));

  // --- matchup ranking --------------------------------------------------
  const matchups = plan.matchups;
  if (matchups.length) {
    wrap.appendChild(card([figure({
      title: 'Which bowling type works best',
      note: 'A positive score means that type suppresses this batter relative to their own '
        + 'standard — combining how often it dismisses them with how much it slows them. '
        + 'Scores are discounted for small samples.',
      render: (host) => barChart(host, {
        data: matchups.map((m) => ({
          label: m.label, value: m.edge,
          colour: m.edge >= 0
            ? (m.family === 'spin' ? token('--spin') : token('--pace'))
            : token('--text-muted'),
          detail: [['Average', fmt.avg(m.avg)], ['Strike rate', fmt.sr(m.sr)],
            ['Balls', fmt.int(m.balls)], ['Confidence', m.confidence]],
        })),
        horizontal: true, height: 40 + matchups.length * 30,
        valueLabel: 'Matchup score', format: (v) => v.toFixed(2),
        width: 760,
      }),
      legend: legendFor([
        { label: 'Pace (favours the bowler)', colour: token('--pace') },
        { label: 'Spin (favours the bowler)', colour: token('--spin') },
        { label: 'Favours the batter', colour: token('--text-muted') },
      ]),
      table: () => simpleTable(
        ['Bowling type', 'Score', 'Average', 'Strike rate', 'Balls', 'Confidence'],
        matchups.map((m) => [m.label, m.edge.toFixed(3), fmt.avg(m.avg), fmt.sr(m.sr),
          m.balls, m.confidence])),
    })]));
  }

  // --- ranked bowlers from the chosen attack ----------------------------
  if (plan.bowlers.length) {
    wrap.appendChild(card([
      h('h3', { text: `Who to bowl from the ${state.bowlingTeam} attack` }),
      h('p', { class: 'card__note',
        text: 'Ranked on the batter’s record against that bowler’s type, the bowler’s own '
          + 'record against that hand, any direct head-to-head, and the bowler’s overall '
          + 'wicket-taking quality.' }),
      dataTable({
        columns: [
          { key: 'bowler', label: 'Bowler', text: true,
            render: (r) => h('a', { href: `#/player/${r.slug}?format=${state.fmt}`, text: r.bowler }) },
          { key: 'typeLabel', label: 'Type', text: true },
          { key: 'movement', label: 'Stock ball', text: true },
          { key: 'score', label: 'Plan score', strong: true,
            render: (r) => r.score.toFixed(3) },
          { key: 'batterAvg', label: 'Bat avg v type',
            value: (r) => r.typeEdge?.avg ?? null,
            render: (r) => fmt.avg(r.typeEdge?.avg) },
          { key: 'balls', label: 'Balls v type', value: (r) => r.typeEdge?.balls ?? null },
          { key: 'h2hBalls', label: 'H2H balls', value: (r) => r.h2h?.balls ?? null },
          { key: 'economy', label: 'Econ', render: (r) => fmt.econ(r.economy) },
        ],
        rows: plan.bowlers, pageSize: 8, initialSort: { key: 'score', dir: 'desc' },
        filename: `plan-${entry.slug}.csv`,
      }).node,
    ]));
  }

  // --- phase plan -------------------------------------------------------
  if (plan.phases.length) {
    const postureLabel = { attack: 'Attack', contain: 'Contain', hold: 'Hold' };
    wrap.appendChild(card([
      h('h3', { text: 'Phase by phase' }),
      h('p', { class: 'card__note',
        text: 'Where this batter is vulnerable, attack; where they dominate, contain and wait.' }),
      h('div', { class: 'grid grid--3' }, plan.phases.map((p) => card([
        h('div', { class: 'card__head' }, [
          h('h4', { text: p.label }),
          chip(postureLabel[p.posture], p.posture === 'attack' ? 'high' : ''),
        ]),
        h('p', { class: 'small muted', style: 'margin:.2rem 0 .4rem',
          text: `Average ${fmt.avg(p.avg)} · strike rate ${fmt.sr(p.sr)} · ${p.balls} balls` }),
        p.recommend.length
          ? h('div', {}, [
            h('div', { class: 'small', style: 'font-weight:600',
              text: p.recommendSource === 'phase'
                ? 'Best options in this phase' : 'Best options (career-wide)' }),
            h('ul', { class: 'small', style: 'margin:.2rem 0 .3rem;padding-left:1.1rem' },
              p.recommend.map((m) => h('li', {
                text: `${m.label} — average ${fmt.avg(m.avg)}, SR ${fmt.sr(m.sr)}`
                  + ` (${fmt.int(m.balls)} balls)`,
              }))),
            h('p', { class: 'small muted', style: 'margin:0',
              text: p.recommendSource === 'phase'
                ? 'Measured inside this phase.'
                : 'Too few balls per type in this phase — ranked on the whole career.' }),
          ])
          : h('p', { class: 'small muted', text: 'No type stands out in this phase.' }),
      ]))),
    ]));
  }

  // --- dismissal read and entry vulnerability ---------------------------
  const reads = h('div', { class: 'grid grid--2' });
  if (plan.dismissals?.notes.length) {
    reads.appendChild(card([
      h('h3', { text: 'What their dismissals suggest' }),
      h('p', { class: 'card__note',
        text: `Based on ${plan.dismissals.total} dismissals in this format.` }),
      h('div', { class: 'stack' }, plan.dismissals.notes.map((n) => h('div', {
        class: 'finding finding--weakness',
      }, [
        h('span', { class: 'finding__icon', text: '◎', 'aria-hidden': 'true' }),
        h('div', { class: 'finding__title', text: labelFor(n.kind) }),
        h('div', { class: 'finding__body', text: n.text }),
      ]))),
    ]));
  }
  if (plan.entry) {
    reads.appendChild(card([figure({
      title: 'When to attack them',
      note: 'Balls survived per dismissal at each stage of their own innings.',
      render: (host) => barChart(host, {
        data: [
          { label: 'First 15 balls', value: plan.entry.newBpd, colour: token('--series-2') },
          { label: 'Once set', value: plan.entry.setBpd, colour: token('--series-1') },
        ],
        horizontal: true, height: 120, valueLabel: 'Balls per dismissal',
        format: (v) => v.toFixed(0),
      }),
      table: () => simpleTable(['Stage', 'Balls per dismissal'], [
        ['First 15 balls', fmt.num(plan.entry.newBpd, 0)],
        ['Once set', fmt.num(plan.entry.setBpd, 0)],
      ]),
    }), h('p', { class: 'small', style: 'margin-top:.5rem',
      text: plan.entry.severe
        ? 'Markedly more vulnerable early. Your best bowler should face them on arrival, '
          + 'and holding a fresh bowler back for the new batter is worth the over.'
        : 'No unusual early vulnerability — they are about as hard to remove on arrival as '
          + 'once set, so there is no premium on attacking them immediately.' })]));
  }
  if (reads.children.length) wrap.appendChild(reads);

  // --- the batter's own plan -------------------------------------------
  if (counter?.advice.length) {
    wrap.appendChild(card([
      h('h3', { text: `The view from ${entry.name}’s end` }),
      h('p', { class: 'card__note',
        text: 'The same evidence read the other way round: where this batter should look to '
          + 'score, and what they should see off.' }),
      h('ul', { style: 'margin:.3rem 0 0;padding-left:1.1rem' },
        counter.advice.map((line) => h('li', { text: line, style: 'margin-bottom:.3rem' }))),
    ]));
  }

  wrap.appendChild(caveatCard(plan.caveats));
  return wrap;
}

function labelFor(kind) {
  return {
    'attack-stumps': 'Bowl at the stumps',
    catchers: 'Set catching fields',
    stumped: 'They come down the pitch',
    'run-out': 'Pressure in the field pays',
  }[kind] || kind;
}

/* ==========================================================================
   Team against team
   ========================================================================== */
async function teamPlan(state, players, manifest) {
  const [battingSide, bowlingSide] = await Promise.all([
    loadSquad(players, state.battingTeam, state.fmt, { limit: 7 }),
    loadSquad(players, state.bowlingTeam, state.fmt, { bowlers: true, limit: 7 }),
  ]);

  if (!battingSide.length || !bowlingSide.length) {
    return emptyState('Not enough qualifying players',
      `Need batters for ${state.battingTeam} and bowlers for ${state.bowlingTeam} with a `
      + `qualifying record in ${manifest.formats[state.fmt].label}.`);
  }

  const plan = planTeamBowling({
    battingSide, bowlingSide, fmt: state.fmt, manifest,
  });
  if (!plan) return emptyState('Could not build a team plan');

  const wrap = h('div', { class: 'stack' });
  wrap.appendChild(card([
    h('h2', { text: `${state.bowlingTeam} bowling to ${state.battingTeam}` }),
    h('p', { class: 'small muted', style: 'margin:.3rem 0 0',
      text: `Top ${battingSide.length} batters against the leading ${bowlingSide.length} `
        + `bowlers, in ${manifest.formats[state.fmt].label} cricket.` }),
  ]));

  // --- the matchup matrix ----------------------------------------------
  const rows = battingSide.map((b) => b.name);
  const cols = bowlingSide.map((b) => b.name);
  // The heatmap wants every combination, not just the standouts the plan ranked.
  const cells = [];
  for (const batter of battingSide) {
    for (const bowler of bowlingSide) {
      const s = scoreBowler(bowler, batter, manifest, state.fmt);
      cells.push({ row: batter.name, col: bowler.name, value: s ? s.score : null,
        detail: s ? [['Bowler type', s.typeLabel],
          ['Batter avg v type', fmt.avg(s.typeEdge?.avg)],
          ['Balls v type', s.typeEdge?.balls ?? '—'],
          ['Head to head', s.h2h ? `${s.h2h.balls} balls` : 'none']] : [] });
    }
  }
  wrap.appendChild(card([figure({
    title: 'Matchup matrix',
    note: 'Blue favours the bowler, red favours the batter, grey means not enough data. '
      + 'Zero is a neutral matchup.',
    render: (host) => heatmap(host, {
      rows, cols, cells, width: Math.max(700, 170 + cols.length * 96),
      cellHeight: 38, midpoint: 0, valueLabel: 'Plan score',
      format: (v) => v.toFixed(2),
    }),
    legend: legendFor([
      { label: 'Favours the bowler', colour: token('--div-pos-2') },
      { label: 'Neutral', colour: token('--div-mid') },
      { label: 'Favours the batter', colour: token('--div-neg-2') },
    ]),
    table: () => simpleTable(['Batter', ...cols],
      rows.map((r) => [r, ...cols.map((c) => {
        const cell = cells.find((x) => x.row === r && x.col === c);
        return cell && cell.value != null ? cell.value.toFixed(2) : '—';
      })])),
  })]));

  // --- phase allocation -------------------------------------------------
  wrap.appendChild(card([
    h('h3', { text: 'Bowling allocation by phase' }),
    h('p', { class: 'card__note',
      text: 'For each phase, the bowlers with the best mean matchup against the batters most '
        + 'likely to be at the crease.' }),
    h('div', { class: 'grid grid--3' }, plan.phases.map((phase) => card([
      h('h4', { text: phase.label }),
      h('p', { class: 'small muted', style: 'margin:.15rem 0 .5rem',
        text: `Overs ${phase.overs} · likely at the crease: ${phase.batters.slice(0, 3).join(', ')}` }),
      h('ol', { class: 'small', style: 'margin:0;padding-left:1.2rem' },
        phase.bowlers.map((b) => h('li', { style: 'margin-bottom:.35rem' }, [
          h('a', { href: `#/player/${b.slug}?format=${state.fmt}`, text: b.bowler }),
          h('span', { class: 'muted', text: ` — ${b.typeLabel}` }),
          h('br'),
          h('span', { class: 'muted', text: `mean matchup ${b.mean.toFixed(2)}` }),
        ]))),
    ]))),
  ]));

  // --- standout matchups ------------------------------------------------
  wrap.appendChild(h('div', { class: 'grid grid--2' }, [
    card([
      h('h3', { text: 'Matchups to engineer' }),
      h('p', { class: 'card__note', text: 'The pairings most in the bowling side’s favour.' }),
      matchupList(plan.keyMatchups, state.fmt, 'strength'),
    ]),
    card([
      h('h3', { text: 'Matchups to avoid' }),
      h('p', { class: 'card__note', text: 'Where the batter has the upper hand.' }),
      matchupList(plan.dangerMatchups, state.fmt, 'weakness'),
    ]),
  ]));

  wrap.appendChild(caveatCard([
    'Squad selection here is by career volume in this format, not by who is currently '
    + 'available or in form.',
    'Bowlers are matched to phases by convention (seam with the new ball, spin through the '
    + 'middle) as well as by matchup score.',
    'Length, line and speed are not present in openly licensed ball-by-ball data, so no '
    + 'recommendation here rests on them.',
  ]));
  return wrap;
}

function matchupList(items, fmtKey, kind) {
  return h('div', { class: 'stack' }, items.map((m) => h('div', {
    class: `finding finding--${kind}`,
  }, [
    h('span', { class: 'finding__icon', text: kind === 'strength' ? '▲' : '▼',
      'aria-hidden': 'true' }),
    h('div', { class: 'finding__title', text: `${m.bowler} to ${m.batter}` }),
    h('div', { class: 'finding__body' }, [
      document.createTextNode(`${m.typeLabel}${m.movement ? `, ${m.movement}` : ''}. `),
      document.createTextNode(m.typeEdge
        ? `The batter averages ${fmt.avg(m.typeEdge.avg)} against this type off `
          + `${m.typeEdge.balls} balls.`
        : 'No type-level record between them.'),
      // The head-to-head record is the *batter's* split, so dismissals are
      // `outs`; `wickets` only exists on a bowling split and read as undefined.
      m.h2h ? document.createTextNode(` Direct head-to-head: ${m.h2h.runs} runs off `
        + `${m.h2h.balls} balls, ${m.h2h.outs} dismissal${m.h2h.outs === 1 ? '' : 's'}.`) : null,
    ].filter(Boolean)),
    h('div', { class: 'finding__meta' }, [chip(`score ${(Math.abs(m.score) < 0.005 ? 0 : m.score).toFixed(2)}`)]),
  ])));
}

function caveatCard(caveats) {
  return card([
    h('h3', { text: 'What this plan does and does not know' }),
    h('ul', { class: 'small', style: 'margin:.3rem 0 0;padding-left:1.1rem;color:var(--text-secondary)' },
      caveats.map((c) => h('li', { text: c, style: 'margin-bottom:.25rem' }))),
  ]);
}
