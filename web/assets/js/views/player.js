/**
 * The player profile.
 *
 * Reading order is deliberate: who they are, what their career says, then what
 * the ball-by-ball record says about *how* they succeed and fail, and only then
 * the raw split tables. The strengths and weaknesses sit near the top because
 * they are the reason this site exists, but every one of them carries its
 * sample size and its cohort context so the reader can discount it.
 */
import { h, clear } from '../lib/dom.js';
import {
  fmt, DISMISSAL_LABELS, ENTRY_LABELS, HOME_LABELS, CHASE_LABELS, HAND_LABELS,
  shortStyle,
} from '../lib/format.js';
import { store } from '../lib/store.js';
import {
  barChart, donutChart, groupedBar, lineChart, radarChart,
  distributionStrip, legendFor,
} from '../charts/index.js';
import { figure, token } from '../charts/core.js';
import { dataTable, simpleTable } from '../lib/table.js';
import { liveReadSection } from './liveread.js';
import {
  card, chip, coverageNotice, datasetNotice, emptyState, findingCard, formatSwitcher,
  orderFormats, statTile,
} from './components.js';

export async function render({ manifest, route, bySlug }) {
  const slug = route.params[0];
  if (!slug) return emptyState('No player selected', 'Pick a player from the index.');

  let record;
  try {
    record = await store.player(slug);
  } catch {
    return emptyState('Player not found', `No data file for “${slug}”.`);
  }
  const cohorts = await store.cohorts().catch(() => ({}));

  const formats = orderFormats(Object.keys(record.formats));
  const wanted = route.query.get('format');
  let active = formats.includes(wanted) ? wanted : bestFormat(record, formats);

  const root = h('div', { class: 'stack' });
  const notice = datasetNotice(manifest);
  if (notice) root.appendChild(notice);

  const coverage = coverageNotice(manifest);
  if (coverage) root.appendChild(coverage);
  root.appendChild(header(record, manifest, bySlug));

  const controls = h('div', { class: 'row', style: 'justify-content:space-between' });
  const switcher = formatSwitcher(formats, active, (next) => {
    active = next;
    for (const btn of switcher.querySelectorAll('button')) {
      btn.setAttribute('aria-pressed',
        String(btn.textContent === (manifest.formats[next]?.label || next.toUpperCase())));
    }
    renderBody();
    history.replaceState(null, '', `#/player/${slug}?format=${next}`);
  }, manifest);
  controls.append(switcher, h('div', { class: 'row' }, [
    h('a', { class: 'btn', href: `#/compare?a=${slug}`, text: 'Compare →',
      style: 'text-decoration:none' }),
    h('a', { class: 'btn', href: `#/strategy?batter=${slug}&format=${active}`,
      text: 'Plan against →', style: 'text-decoration:none' }),
  ]));
  root.appendChild(controls);

  const body = h('div', { class: 'stack' });
  root.appendChild(body);

  function renderBody() {
    clear(body);
    const payload = record.formats[active];
    const cohort = cohorts[active] || {};
    if (!payload) {
      body.appendChild(emptyState('No record in this format'));
      return;
    }
    if (payload.batting) body.appendChild(battingSection(record, payload, manifest, active, cohort));
    if (payload.bowling) body.appendChild(bowlingSection(record, payload, manifest, active, cohort));
    body.appendChild(findingsSection(payload));
    // The AI panel sits below the computed findings on purpose: measured first,
    // interpreted second.
    body.appendChild(liveReadSection(record.name));
    if (payload.batting) body.appendChild(inningsSection(payload, active));
  }

  renderBody();
  return root;
}

function bestFormat(record, formats) {
  let best = formats[0]; let score = -1;
  for (const f of formats) {
    const p = record.formats[f];
    const s = (p.batting?.overall.balls || 0) + (p.bowling?.overall.balls || 0) * 1.2;
    if (s > score) { score = s; best = f; }
  }
  return best;
}

/* ==========================================================================
   Header
   ========================================================================== */
function header(record, manifest) {
  const meta = record.meta || {};
  const styleLabel = manifest.bowlingTypes?.[meta.bowlingType]?.label;
  const family = manifest.bowlingTypes?.[meta.bowlingType]?.family;
  const chips = [
    meta.role ? chip(meta.role) : null,
    meta.battingHand ? chip(`${meta.battingHand === 'left' ? 'Left' : 'Right'}-hand bat`) : null,
    styleLabel ? chip(styleLabel, family === 'spin' ? 'spin' : 'pace') : null,
    ...(meta.teams || []).slice(0, 3).map((t) => chip(t)),
  ].filter(Boolean);

  return h('div', { class: 'player-head' }, [
    h('div', { class: 'player-head__id' }, [
      h('h1', { text: record.name }),
      meta.fullName && meta.fullName !== record.name
        ? h('p', { class: 'muted small', text: meta.fullName, style: 'margin:.1rem 0 0' })
        : null,
      h('p', { class: 'small muted', style: 'margin:.35rem 0 0',
        text: `${fmt.year(meta.debut)} – ${fmt.year(meta.lastPlayed)}` }),
      h('div', { class: 'player-head__meta' }, chips),
    ]),
  ]);
}

/* ==========================================================================
   Batting
   ========================================================================== */
function battingSection(record, payload, manifest, fmtKey, cohort) {
  const bat = payload.batting;
  const o = bat.overall;
  const m = bat.milestones;
  const section = h('section', { class: 'stack' });

  section.appendChild(h('h2', { text: 'Batting' }));
  section.appendChild(h('div', { class: 'grid grid--4' }, [
    statTile('Runs', fmt.int(o.runs), `${o.innings} innings`),
    statTile('Average', fmt.avg(o.avg), `${m.notOuts} not out`),
    statTile('Strike rate', fmt.sr(o.sr), `${fmt.int(o.balls)} balls faced`),
    statTile('Highest', fmt.score(m.highest, !m.highestNotOut), `${m.hundreds}×100 · ${m.fifties}×50`),
  ]));

  // --- percentile shape + cohort context -------------------------------
  const profile = payload.profile || {};
  const batAxes = Object.entries(profile)
    .filter(([, v]) => v.discipline === 'batting')
    .map(([key, v]) => ({ key, label: v.label, raw: v.value, rawLabel: 'Value' }));

  const grid = h('div', { class: 'grid grid--sidebar' });
  const left = h('div', { class: 'stack' });
  const right = h('div', { class: 'stack' });

  if (batAxes.length >= 3) {
    right.appendChild(card([figure({
      title: 'Percentile profile',
      note: 'Each axis is this player’s rank against everyone in the same format with a '
        + 'qualifying record. Further from the centre is better on every axis.',
      render: (host) => radarChart(host, {
        axes: batAxes,
        series: [{
          label: record.name, colour: token('--series-1'),
          values: Object.fromEntries(batAxes.map((a) => [a.key, profile[a.key].percentile])),
        }, {
          label: 'Cohort median', colour: token('--text-muted'), dashed: true, fill: false,
          values: Object.fromEntries(batAxes.map((a) => [a.key, 50])),
        }],
        width: 400, height: 380,
      }),
      legend: legendFor([
        { label: record.name, colour: token('--series-1') },
        { label: 'Cohort median (50th)', colour: token('--text-muted') },
      ]),
      table: () => simpleTable(['Axis', 'Value', 'Percentile'],
        batAxes.map((a) => [a.label, fmt.num(profile[a.key].value, 2),
          fmt.ordinal(profile[a.key].percentile)])),
    })]));
  }

  // Where the headline numbers sit inside the cohort spread.
  const strips = [];
  for (const [metric, label, higher] of [
    ['average', 'Batting average', true],
    ['strike_rate', 'Strike rate', true],
    ['dot_pct', 'Dot-ball percentage', false],
  ]) {
    const q = cohort[`batting.${metric}`];
    const value = metric === 'average' ? o.avg : (metric === 'strike_rate' ? o.sr : o.dotPct);
    if (!q || value == null) continue;
    strips.push(h('div', {}, [
      h('div', { class: 'small', style: 'font-weight:600;margin-bottom:.1rem', text: label }),
      figure({
        render: (host) => distributionStrip(host, {
          quartiles: q, value, label, higherIsBetter: higher,
          format: metric === 'dot_pct' ? ((v) => `${v.toFixed(1)}%`) : ((v) => v.toFixed(1)),
          width: 300, height: 62,
        }),
      }),
    ]));
  }
  if (strips.length) {
    right.appendChild(card([
      h('h3', { text: 'Against the field' }),
      h('p', { class: 'card__note',
        text: 'The bar is the middle 50% of comparable players; the line is the median.' }),
      h('div', { class: 'stack' }, strips),
    ]));
  }

  // --- matchups by bowling type ----------------------------------------
  const typeRows = Object.entries(bat.byType || {})
    .map(([key, split]) => ({
      key,
      label: manifest.bowlingTypes?.[key]?.label || key,
      short: shortStyle(key, manifest),
      family: manifest.bowlingTypes?.[key]?.family || '',
      ...split,
    }))
    .sort((a, b) => (a.family === b.family
      ? (b.balls - a.balls) : (a.family === 'pace' ? -1 : 1)));

  if (typeRows.length) {
    left.appendChild(card([figure({
      title: 'Against each bowling type',
      note: `Batting average against each type of bowling, with the career average marked. `
        + `Splits below ${manifest.thresholds.minBallsSplit} balls are not shown.`,
      render: (host) => barChart(host, {
        data: typeRows.filter((r) => r.avg != null).map((r) => ({
          label: r.short, fullLabel: r.label, value: r.avg,
          colour: r.family === 'spin' ? token('--spin') : token('--pace'),
          detail: [['Strike rate', fmt.sr(r.sr)], ['Balls', fmt.int(r.balls)],
            ['Dismissals', r.outs], ['Runs', fmt.int(r.runs)]],
        })),
        height: 300, valueLabel: 'Average', format: (v) => v.toFixed(1),
        baseline: o.avg, baselineLabel: 'Career average',
      }),
      legend: legendFor([
        { label: 'Pace', colour: token('--pace') },
        { label: 'Spin', colour: token('--spin') },
      ]),
      table: () => simpleTable(['Bowling type', 'Runs', 'Balls', 'Outs', 'Avg', 'SR', 'Dot %'],
        typeRows.map((r) => [r.label, r.runs, r.balls, r.outs, fmt.avg(r.avg),
          fmt.sr(r.sr), fmt.pct(r.dotPct)])),
    })]));

    // Strike rate against the same types: tempo and survival are different questions.
    left.appendChild(card([figure({
      title: 'Scoring rate against each bowling type',
      note: 'Average answers how often they get out; strike rate answers how fast they score. '
        + 'A batter can be slow against a type without being vulnerable to it.',
      render: (host) => barChart(host, {
        data: typeRows.map((r) => ({
          label: r.short, fullLabel: r.label, value: r.sr,
          colour: r.family === 'spin' ? token('--spin') : token('--pace'),
          detail: [['Average', fmt.avg(r.avg)], ['Boundary %', fmt.pct(r.bdryPct)],
            ['Balls', fmt.int(r.balls)]],
        })),
        height: 260, valueLabel: 'Strike rate', format: (v) => v.toFixed(0),
        baseline: o.sr, baselineLabel: 'Career SR',
      }),
      legend: legendFor([
        { label: 'Pace', colour: token('--pace') },
        { label: 'Spin', colour: token('--spin') },
      ]),
      table: () => simpleTable(['Bowling type', 'SR', 'Boundary %', 'Balls'],
        typeRows.map((r) => [r.label, fmt.sr(r.sr), fmt.pct(r.bdryPct), r.balls])),
    })]));
  }

  // --- pace vs spin summary --------------------------------------------
  const fam = bat.byFamily || {};
  if (fam.pace && fam.spin) {
    left.appendChild(card([figure({
      title: 'Pace against spin',
      render: (host) => groupedBar(host, {
        data: [
          { label: 'Average', pace: fam.pace.avg ?? 0, spin: fam.spin.avg ?? 0 },
          { label: 'Strike rate', pace: fam.pace.sr, spin: fam.spin.sr },
          { label: 'Dot %', pace: fam.pace.dotPct, spin: fam.spin.dotPct },
          { label: 'Boundary %', pace: fam.pace.bdryPct, spin: fam.spin.bdryPct },
        ],
        series: [
          { key: 'pace', label: 'Pace', colour: token('--pace') },
          { key: 'spin', label: 'Spin', colour: token('--spin') },
        ],
        height: 250, format: (v) => v.toFixed(1),
      }),
      legend: legendFor([
        { label: `Pace (${fmt.int(fam.pace.balls)} balls)`, colour: token('--pace') },
        { label: `Spin (${fmt.int(fam.spin.balls)} balls)`, colour: token('--spin') },
      ]),
      table: () => simpleTable(['Metric', 'Pace', 'Spin'], [
        ['Average', fmt.avg(fam.pace.avg), fmt.avg(fam.spin.avg)],
        ['Strike rate', fmt.sr(fam.pace.sr), fmt.sr(fam.spin.sr)],
        ['Dot %', fmt.pct(fam.pace.dotPct), fmt.pct(fam.spin.dotPct)],
        ['Boundary %', fmt.pct(fam.pace.bdryPct), fmt.pct(fam.spin.bdryPct)],
        ['Balls', fmt.int(fam.pace.balls), fmt.int(fam.spin.balls)],
      ]),
    })]));
  }

  grid.append(left, right);
  section.appendChild(grid);

  // --- career progression ----------------------------------------------
  const years = Object.entries(bat.byYear || {})
    .filter(([, s]) => s.balls >= 60)
    .sort(([a], [b]) => Number(a) - Number(b));
  if (years.length >= 3) {
    section.appendChild(card([figure({
      title: 'Career by season',
      note: 'Batting average and strike rate by calendar year. Seasons with fewer than 60 '
        + 'balls faced are omitted.',
      render: (host) => lineChart(host, {
        series: [
          { label: 'Average', colour: token('--series-1'),
            points: years.map(([y, s]) => ({ x: Number(y), y: s.avg,
              note: `${s.runs} runs, ${s.balls} balls` })) },
          { label: 'Strike rate', colour: token('--series-2'),
            points: years.map(([y, s]) => ({ x: Number(y), y: s.sr })) },
        ],
        height: 300, xFormat: (v) => String(Math.round(v)), format: (v) => v.toFixed(0),
        xTickValues: years.map(([y]) => Number(y)),
      }),
      legend: legendFor([
        { label: 'Batting average', colour: token('--series-1') },
        { label: 'Strike rate', colour: token('--series-2') },
      ]),
      table: () => simpleTable(['Year', 'Runs', 'Balls', 'Avg', 'SR'],
        years.map(([y, s]) => [y, s.runs, s.balls, fmt.avg(s.avg), fmt.sr(s.sr)])),
    })]));
  }

  // --- phase, entry, context -------------------------------------------
  const phaseLabels = new Map((manifest.phases?.[fmtKey] || []).map((p) => [p.key, p.label]));
  const contextGrid = h('div', { class: 'grid grid--2' });

  const phaseRows = Object.entries(bat.byPhase || {})
    .map(([k, s]) => ({ key: k, label: phaseLabels.get(k) || k, ...s }));
  if (phaseRows.length > 1) {
    contextGrid.appendChild(card([figure({
      title: 'By phase of the innings',
      render: (host) => groupedBar(host, {
        data: phaseRows.map((r) => ({ label: r.label, avg: r.avg ?? 0, sr: r.sr })),
        series: [
          { key: 'avg', label: 'Average', colour: token('--series-1') },
          { key: 'sr', label: 'Strike rate', colour: token('--series-2') },
        ],
        height: 250, format: (v) => v.toFixed(0),
      }),
      legend: legendFor([
        { label: 'Average', colour: token('--series-1') },
        { label: 'Strike rate', colour: token('--series-2') },
      ]),
      table: () => simpleTable(['Phase', 'Runs', 'Balls', 'Avg', 'SR'],
        phaseRows.map((r) => [r.label, r.runs, r.balls, fmt.avg(r.avg), fmt.sr(r.sr)])),
    })]));
  }

  const entryRows = Object.entries(bat.byEntry || {})
    .map(([k, s]) => ({ key: k, label: ENTRY_LABELS[k] || k, ...s }))
    .sort((a, b) => ['new', 'settling', 'set'].indexOf(a.key) - ['new', 'settling', 'set'].indexOf(b.key));
  if (entryRows.length > 1) {
    contextGrid.appendChild(card([figure({
      title: 'Getting started against being set',
      note: 'Balls survived per dismissal at each stage of their own innings. Almost every '
        + 'batter is more fragile early — the question is by how much.',
      render: (host) => barChart(host, {
        data: entryRows.filter((r) => r.bpd != null).map((r) => ({
          label: r.label, value: r.bpd,
          colour: token('--series-3'),
          detail: [['Average', fmt.avg(r.avg)], ['Strike rate', fmt.sr(r.sr)],
            ['Balls', fmt.int(r.balls)]],
        })),
        height: 250, valueLabel: 'Balls per dismissal', format: (v) => v.toFixed(0),
      }),
      table: () => simpleTable(['Stage', 'Balls', 'Outs', 'Balls per dismissal', 'SR'],
        entryRows.map((r) => [r.label, r.balls, r.outs, fmt.num(r.bpd, 0), fmt.sr(r.sr)])),
    })]));
  }

  // Dismissal mix
  const dismissals = Object.entries(bat.dismissals || {})
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a);
  if (dismissals.length) {
    const palette = ['--series-1', '--series-2', '--series-3', '--series-4', '--series-5']
      .map(token);
    contextGrid.appendChild(card([figure({
      title: 'How they get out',
      note: 'The mix of dismissal modes is the one line-and-length signal ball-by-ball data '
        + 'genuinely carries: bowled and lbw mean the ball beat the bat straight.',
      render: (host) => donutChart(host, {
        data: dismissals.map(([kind, count], i) => ({
          label: DISMISSAL_LABELS[kind] || kind, value: count,
          colour: palette[i % palette.length],
        })),
        width: 300, height: 250, centreLabel: 'dismissals',
      }),
      legend: legendFor(dismissals.map(([kind], i) => ({
        label: DISMISSAL_LABELS[kind] || kind, colour: palette[i % palette.length],
      }))),
      table: () => simpleTable(['Dismissal', 'Count'],
        dismissals.map(([k, v]) => [DISMISSAL_LABELS[k] || k, v])),
    })]));
  }

  // Home / away / chasing
  const contextRows = [
    ...Object.entries(bat.byHome || {}).map(([k, s]) => [HOME_LABELS[k] || k, s]),
    ...Object.entries(bat.byChase || {}).map(([k, s]) => [CHASE_LABELS[k] || k, s]),
  ].filter(([, s]) => s.avg != null);
  // A "split" with one side of the comparison present is not a split; drawing a
  // lone bar labelled "Batting first" tells the reader nothing.
  if (contextRows.length >= 2) {
    contextGrid.appendChild(card([figure({
      title: 'Situation splits',
      render: (host) => barChart(host, {
        data: contextRows.map(([label, s]) => ({
          label, value: s.avg, colour: token('--series-1'),
          detail: [['Strike rate', fmt.sr(s.sr)], ['Balls', fmt.int(s.balls)]],
        })),
        horizontal: true, height: 40 + contextRows.length * 32,
        valueLabel: 'Average', format: (v) => v.toFixed(1),
        baseline: o.avg, baselineLabel: 'Career',
      }),
      table: () => simpleTable(['Situation', 'Runs', 'Balls', 'Avg', 'SR'],
        contextRows.map(([label, s]) => [label, s.runs, s.balls, fmt.avg(s.avg), fmt.sr(s.sr)])),
    })]));
  }
  section.appendChild(contextGrid);

  // --- opposition and country tables ------------------------------------
  const splitTables = h('div', { class: 'grid grid--2' });
  for (const [title, splits, firstLabel] of [
    ['Against each opposition', bat.byOpposition, 'Opposition'],
    ['By country', bat.byCountry, 'Country'],
  ]) {
    const rows = Object.entries(splits || {}).map(([k, s]) => ({ name: k, ...s }));
    if (!rows.length) continue;
    splitTables.appendChild(card([
      h('h3', { text: title }),
      dataTable({
        columns: [
          { key: 'name', label: firstLabel, text: true },
          { key: 'runs', label: 'Runs', strong: true },
          { key: 'balls', label: 'Balls' },
          { key: 'outs', label: 'Outs' },
          { key: 'avg', label: 'Avg', render: (r) => fmt.avg(r.avg) },
          { key: 'sr', label: 'SR', render: (r) => fmt.sr(r.sr) },
        ],
        rows, pageSize: 8, initialSort: { key: 'runs', dir: 'desc' },
        filename: `${title.replace(/\s+/g, '-').toLowerCase()}.csv`,
      }).node,
    ]));
  }
  if (splitTables.children.length) section.appendChild(splitTables);

  // --- head to head -----------------------------------------------------
  const h2h = Object.entries(bat.vsBowler || {}).map(([k, s]) => ({ name: k, ...s }));
  if (h2h.length) {
    section.appendChild(card([
      h('h3', { text: 'Head to head with individual bowlers' }),
      h('p', { class: 'card__note',
        text: 'Bowlers this batter has faced most. A head-to-head under about 100 balls is a '
          + 'curiosity rather than evidence — the balls column is there to be read.' }),
      dataTable({
        columns: [
          { key: 'name', label: 'Bowler', text: true },
          { key: 'balls', label: 'Balls', strong: true },
          { key: 'runs', label: 'Runs' },
          { key: 'outs', label: 'Outs' },
          { key: 'avg', label: 'Avg', render: (r) => fmt.avg(r.avg) },
          { key: 'sr', label: 'SR', render: (r) => fmt.sr(r.sr) },
          { key: 'dotPct', label: 'Dot %', render: (r) => fmt.pct(r.dotPct) },
        ],
        rows: h2h, pageSize: 10, initialSort: { key: 'balls', dir: 'desc' },
        filename: 'head-to-head.csv',
      }).node,
    ]));
  }

  return section;
}

/* ==========================================================================
   Bowling
   ========================================================================== */
function bowlingSection(record, payload, manifest, fmtKey, cohort) {
  const bowl = payload.bowling;
  const o = bowl.overall;
  const best = bowl.milestones.best;   // null when they have never taken one
  const section = h('section', { class: 'stack' });

  section.appendChild(h('h2', { text: 'Bowling' }));
  section.appendChild(h('div', { class: 'grid grid--4' }, [
    statTile('Wickets', fmt.int(o.wickets), `${o.innings} innings`),
    statTile('Average', fmt.avg(o.avg), `strike rate ${fmt.num(o.sr, 1)}`),
    statTile('Economy', fmt.econ(o.econ), `${fmt.overs(o.balls)} overs`),
    statTile('Best', best ? fmt.figures(best.wickets, best.runs) : '—',
      `${bowl.milestones.fiveWickets}×5w · ${bowl.milestones.fourWickets}×4w`),
  ]));

  const grid = h('div', { class: 'grid grid--2' });

  const phaseLabels = new Map((manifest.phases?.[fmtKey] || []).map((p) => [p.key, p.label]));
  const phaseRows = Object.entries(bowl.byPhase || {})
    .map(([k, s]) => ({ key: k, label: phaseLabels.get(k) || k, ...s }));
  if (phaseRows.length > 1) {
    grid.appendChild(card([figure({
      title: 'By phase',
      note: 'Economy rate and strike rate in each phase — a bowler can be economical in a '
        + 'phase without threatening, and vice versa.',
      render: (host) => groupedBar(host, {
        data: phaseRows.map((r) => ({ label: r.label, econ: r.econ, sr: r.sr ?? 0 })),
        series: [
          { key: 'econ', label: 'Economy', colour: token('--series-1') },
          { key: 'sr', label: 'Strike rate', colour: token('--series-2') },
        ],
        height: 250, format: (v) => v.toFixed(1),
      }),
      legend: legendFor([
        { label: 'Economy (runs/over)', colour: token('--series-1') },
        { label: 'Strike rate (balls/wicket)', colour: token('--series-2') },
      ]),
      table: () => simpleTable(['Phase', 'Overs', 'Runs', 'Wkts', 'Econ', 'SR'],
        phaseRows.map((r) => [r.label, fmt.overs(r.balls), r.runs, r.wickets,
          fmt.econ(r.econ), fmt.num(r.sr, 1)])),
    })]));
  }

  const handRows = Object.entries(bowl.byHand || {})
    .map(([k, s]) => ({ key: k, label: HAND_LABELS[k] || k, ...s }));
  if (handRows.length) {
    grid.appendChild(card([figure({
      title: 'Against left and right-handers',
      note: 'Which way the stock ball moves changes completely with the batter’s hand, and '
        + 'this is where that shows up.',
      render: (host) => groupedBar(host, {
        data: handRows.map((r) => ({ label: r.label, avg: r.avg ?? 0, econ: r.econ })),
        series: [
          { key: 'avg', label: 'Average', colour: token('--series-1') },
          { key: 'econ', label: 'Economy', colour: token('--series-3') },
        ],
        height: 250, format: (v) => v.toFixed(1),
      }),
      legend: legendFor([
        { label: 'Bowling average', colour: token('--series-1') },
        { label: 'Economy', colour: token('--series-3') },
      ]),
      table: () => simpleTable(['Batter hand', 'Overs', 'Wkts', 'Avg', 'Econ', 'SR'],
        handRows.map((r) => [r.label, fmt.overs(r.balls), r.wickets, fmt.avg(r.avg),
          fmt.econ(r.econ), fmt.num(r.sr, 1)])),
    })]));
  }

  const kinds = Object.entries(bowl.wicketKinds || {}).filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a);
  if (kinds.length) {
    const palette = ['--series-1', '--series-2', '--series-3', '--series-4', '--series-5'].map(token);
    grid.appendChild(card([figure({
      title: 'How they take wickets',
      render: (host) => donutChart(host, {
        data: kinds.map(([k, v], i) => ({
          label: DISMISSAL_LABELS[k] || k, value: v, colour: palette[i % palette.length],
        })),
        width: 300, height: 250, centreLabel: 'wickets',
      }),
      legend: legendFor(kinds.map(([k], i) => ({
        label: DISMISSAL_LABELS[k] || k, colour: palette[i % palette.length],
      }))),
      table: () => simpleTable(['Mode', 'Wickets'],
        kinds.map(([k, v]) => [DISMISSAL_LABELS[k] || k, v])),
    })]));
  }

  const strips = [];
  for (const [metric, label, higher, value] of [
    ['average', 'Bowling average', false, o.avg],
    ['economy', 'Economy rate', false, o.econ],
    ['strike_rate', 'Strike rate', false, o.sr],
  ]) {
    const q = cohort[`bowling.${metric}`];
    if (!q || value == null) continue;
    strips.push(h('div', {}, [
      h('div', { class: 'small', style: 'font-weight:600;margin-bottom:.1rem', text: label }),
      figure({
        render: (host) => distributionStrip(host, {
          quartiles: q, value, label, higherIsBetter: higher,
          format: (v) => v.toFixed(2), width: 300, height: 62,
        }),
      }),
    ]));
  }
  if (strips.length) {
    grid.appendChild(card([
      h('h3', { text: 'Against the field' }),
      h('p', { class: 'card__note',
        text: 'Lower is better on all three. The bar is the middle 50% of comparable bowlers.' }),
      h('div', { class: 'stack' }, strips),
    ]));
  }

  section.appendChild(grid);

  const years = Object.entries(bowl.byYear || {})
    .filter(([, s]) => s.balls >= 120)
    .sort(([a], [b]) => Number(a) - Number(b));
  if (years.length >= 3) {
    section.appendChild(card([figure({
      title: 'Bowling by season',
      render: (host) => lineChart(host, {
        series: [
          { label: 'Average', colour: token('--series-1'),
            points: years.map(([y, s]) => ({ x: Number(y), y: s.avg,
              note: `${s.wickets} wickets` })) },
          { label: 'Economy', colour: token('--series-3'),
            points: years.map(([y, s]) => ({ x: Number(y), y: s.econ })) },
        ],
        height: 280, xFormat: (v) => String(Math.round(v)), format: (v) => v.toFixed(1),
        xTickValues: years.map(([y]) => Number(y)),
      }),
      legend: legendFor([
        { label: 'Bowling average', colour: token('--series-1') },
        { label: 'Economy', colour: token('--series-3') },
      ]),
      table: () => simpleTable(['Year', 'Overs', 'Wkts', 'Avg', 'Econ'],
        years.map(([y, s]) => [y, fmt.overs(s.balls), s.wickets, fmt.avg(s.avg),
          fmt.econ(s.econ)])),
    })]));
  }

  const h2h = Object.entries(bowl.vsBatter || {}).map(([k, s]) => ({ name: k, ...s }));
  if (h2h.length) {
    section.appendChild(card([
      h('h3', { text: 'Head to head with individual batters' }),
      dataTable({
        columns: [
          { key: 'name', label: 'Batter', text: true },
          { key: 'balls', label: 'Balls', strong: true },
          { key: 'runs', label: 'Runs' },
          { key: 'wickets', label: 'Wkts' },
          { key: 'econ', label: 'Econ', render: (r) => fmt.econ(r.econ) },
          { key: 'avg', label: 'Avg', render: (r) => fmt.avg(r.avg) },
        ],
        rows: h2h, pageSize: 10, initialSort: { key: 'balls', dir: 'desc' },
        filename: 'bowling-head-to-head.csv',
      }).node,
    ]));
  }

  return section;
}

/* ==========================================================================
   Findings
   ========================================================================== */
function findingsSection(payload) {
  const section = h('section', { class: 'stack' });
  section.appendChild(h('h2', { text: 'Strengths and weaknesses' }));
  section.appendChild(h('p', { class: 'card__note', style: 'margin-top:-.4rem',
    text: 'Each finding compares this player against their own baseline first, then against '
      + 'how far every comparable player deviates from theirs in the same split. That second '
      + 'step is what stops a modest player being labelled weak against everything.' }));

  const grid = h('div', { class: 'grid grid--2' });
  for (const [title, claims, empty] of [
    ['Strengths', payload.strengths, 'No split clears the strength threshold in this format.'],
    ['Weaknesses', payload.weaknesses, 'No split clears the weakness threshold in this format.'],
  ]) {
    const col = h('div', { class: 'stack' });
    col.appendChild(h('h3', { text: title }));
    if (!claims?.length) col.appendChild(emptyState(empty));
    else for (const claim of claims) col.appendChild(findingCard(claim));
    grid.appendChild(col);
  }
  section.appendChild(grid);
  return section;
}

/* ==========================================================================
   Innings log
   ========================================================================== */
function inningsSection(payload, fmtKey) {
  const innings = payload.batting.innings || [];
  if (!innings.length) return h('div');
  const section = h('section', { class: 'stack' });
  section.appendChild(h('h2', { text: 'Innings by innings' }));

  // A running average line makes form visible in a way a bar of scores does not.
  const running = [];
  let runs = 0; let outs = 0;
  innings.forEach((inn, i) => {
    runs += inn.r;
    if (inn.out) outs += 1;
    running.push({ x: i + 1, y: outs ? runs / outs : null, note: `${inn.r} v ${inn.vs}` });
  });
  // A rolling average over a window containing one or two dismissals is
  // arithmetically correct and analytically worthless - 285 runs for one out
  // reads as a 285 average and swamps the whole chart. Requiring a few
  // dismissals in the window is what makes the line a form signal rather than
  // a not-out artefact; windows that do not clear it are simply left blank.
  const window = 10;
  const MIN_OUTS = 3;
  const rolling = innings.map((_, i) => {
    if (i < window - 1) return { x: i + 1, y: null };
    const slice = innings.slice(i - window + 1, i + 1);
    const r = slice.reduce((s, x) => s + x.r, 0);
    const o = slice.filter((x) => x.out).length;
    return { x: i + 1, y: o >= MIN_OUTS ? r / o : null };
  });

  section.appendChild(card([figure({
    title: 'Form over a career',
    note: `Cumulative batting average against a rolling ${window}-innings average. Where the `
      + 'rolling line sits above the cumulative one, they were in form. The rolling line '
      + `breaks where a window holds fewer than ${MIN_OUTS} dismissals, because an average `
      + 'over one or two outs is not a form reading.',
    render: (host) => lineChart(host, {
      series: [
        { label: 'Career average to date', colour: token('--series-1'), points: running },
        { label: `Last ${window} innings`, colour: token('--series-2'), points: rolling },
      ],
      height: 300, markers: false,
      xFormat: (v) => `Inns ${Math.round(v)}`, format: (v) => v.toFixed(1),
      xTickValues: innings.map((_, i) => i + 1),
    }),
    legend: legendFor([
      { label: 'Career average to date', colour: token('--series-1') },
      { label: `Rolling ${window}-innings average`, colour: token('--series-2') },
    ]),
    table: () => simpleTable(['Innings', 'Score', 'Opposition', 'Career avg to date'],
      innings.map((inn, i) => [i + 1, fmt.score(inn.r, inn.out), inn.vs,
        fmt.avg(running[i].y)])),
  })]));

  section.appendChild(card([
    h('h3', { text: 'Every innings' }),
    dataTable({
      columns: [
        { key: 'd', label: 'Date', text: true, render: (r) => fmt.date(r.d),
          sortValue: (r) => r.d },
        { key: 'vs', label: 'Opposition', text: true },
        { key: 'r', label: 'Runs', strong: true, render: (r) => fmt.score(r.r, r.out) },
        { key: 'b', label: 'Balls' },
        { key: 'sr', label: 'SR', value: (r) => (r.b ? (100 * r.r) / r.b : null),
          render: (r) => (r.b ? fmt.sr((100 * r.r) / r.b) : '—') },
        { key: 'f4', label: '4s' },
        { key: 'f6', label: '6s' },
        { key: 'pos', label: 'Pos' },
        { key: 'how', label: 'Dismissal', text: true,
          render: (r) => (r.out ? (DISMISSAL_LABELS[r.how] || r.how) : 'not out') },
        { key: 'g', label: 'Ground', text: true },
      ],
      rows: innings, pageSize: 15, initialSort: { key: 'd', dir: 'desc' },
      filename: `innings-${fmtKey}.csv`,
    }).node,
  ]));
  return section;
}
