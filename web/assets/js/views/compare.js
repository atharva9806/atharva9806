/** Two careers side by side, across every split they share. */
import { h, clear } from '../lib/dom.js';
import { fmt, shortStyle, ENTRY_LABELS } from '../lib/format.js';
import { store } from '../lib/store.js';
import { groupedBar, lineChart, radarChart, legendFor } from '../charts/index.js';
import { figure, token } from '../charts/core.js';
import { simpleTable } from '../lib/table.js';
import {
  card, datasetNotice, emptyState, orderFormats, pageHead,
} from './components.js';

export async function render({ manifest, players, route }) {
  const root = h('div', { class: 'stack' });
  const notice = datasetNotice(manifest);
  if (notice) root.appendChild(notice);
  root.appendChild(pageHead('Compare players',
    'Put two careers next to each other. Every panel uses the same scale for both players, '
    + 'and splits that only one of them clears the sample gate for are left out.'));

  const formats = orderFormats(Object.keys(manifest.formats || {}));
  let fmtKey = formats.includes(route.query.get('format')) ? route.query.get('format') : formats[0];
  let slugA = route.query.get('a') || players[0]?.slug;
  let slugB = route.query.get('b') || players[1]?.slug;

  const controls = h('div', { class: 'row', style: 'gap:.75rem;align-items:flex-end' });
  const picker = (label, value, onChange) => {
    const sel = h('select', { class: 'select', style: 'min-width:200px' });
    for (const p of players) {
      const opt = h('option', { value: p.slug, text: `${p.name}${p.teams[0] ? ` · ${p.teams[0]}` : ''}` });
      if (p.slug === value) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener('change', () => onChange(sel.value));
    return h('div', { class: 'field' }, [h('label', { text: label }), sel]);
  };
  const fmtSel = h('select', { class: 'select' });
  for (const f of formats) {
    const opt = h('option', { value: f, text: manifest.formats[f].label });
    if (f === fmtKey) opt.selected = true;
    fmtSel.appendChild(opt);
  }
  fmtSel.addEventListener('change', () => { fmtKey = fmtSel.value; refresh(); });

  controls.append(
    picker('Player A', slugA, (v) => { slugA = v; refresh(); }),
    picker('Player B', slugB, (v) => { slugB = v; refresh(); }),
    h('div', { class: 'field' }, [h('label', { text: 'Format' }), fmtSel]),
    h('button', {
      class: 'btn', type: 'button', text: '⇄ Swap',
      onclick: () => {
        [slugA, slugB] = [slugB, slugA];
        const sels = controls.querySelectorAll('select');
        sels[0].value = slugA; sels[1].value = slugB;
        refresh();
      },
    }),
  );
  root.appendChild(controls);

  const host = h('div', { class: 'stack' });
  root.appendChild(host);

  async function refresh() {
    clear(host);
    host.appendChild(h('div', { class: 'spinner', role: 'status' }));
    history.replaceState(null, '', `#/compare?a=${slugA}&b=${slugB}&format=${fmtKey}`);
    let a; let b;
    try {
      [a, b] = await Promise.all([store.player(slugA), store.player(slugB)]);
    } catch (err) {
      clear(host).appendChild(emptyState('Could not load both players', String(err.message)));
      return;
    }
    clear(host);
    const pa = a.formats[fmtKey];
    const pb = b.formats[fmtKey];
    if (!pa || !pb) {
      host.appendChild(emptyState('No shared format',
        `${a.name} and ${b.name} do not both have a record in `
        + `${manifest.formats[fmtKey].label} cricket. Pick another format.`));
      return;
    }
    host.appendChild(build(a, b, pa, pb, manifest, fmtKey));
  }

  await refresh();
  return root;
}

function build(a, b, pa, pb, manifest, fmtKey) {
  const wrap = h('div', { class: 'stack' });
  const cA = token('--series-1');
  const cB = token('--series-2');
  const legend = legendFor([{ label: a.name, colour: cA }, { label: b.name, colour: cB }]);

  // --- headline table ---------------------------------------------------
  if (pa.batting && pb.batting) {
    const oa = pa.batting.overall;
    const ob = pb.batting.overall;
    wrap.appendChild(card([
      h('h3', { text: 'Batting career' }),
      simpleTable(['Metric', a.name, b.name], [
        ['Innings', oa.innings, ob.innings],
        ['Runs', fmt.int(oa.runs), fmt.int(ob.runs)],
        ['Average', fmt.avg(oa.avg), fmt.avg(ob.avg)],
        ['Strike rate', fmt.sr(oa.sr), fmt.sr(ob.sr)],
        ['Highest', fmt.score(pa.batting.milestones.highest, !pa.batting.milestones.highestNotOut),
          fmt.score(pb.batting.milestones.highest, !pb.batting.milestones.highestNotOut)],
        ['Hundreds', pa.batting.milestones.hundreds, pb.batting.milestones.hundreds],
        ['Fifties', pa.batting.milestones.fifties, pb.batting.milestones.fifties],
        ['Balls per dismissal', fmt.num(oa.bpd, 1), fmt.num(ob.bpd, 1)],
        ['Dot %', fmt.pct(oa.dotPct), fmt.pct(ob.dotPct)],
        ['Boundary %', fmt.pct(oa.bdryPct), fmt.pct(ob.bdryPct)],
      ]),
    ]));
  }
  if (pa.bowling && pb.bowling) {
    const oa = pa.bowling.overall;
    const ob = pb.bowling.overall;
    wrap.appendChild(card([
      h('h3', { text: 'Bowling career' }),
      simpleTable(['Metric', a.name, b.name], [
        ['Innings', oa.innings, ob.innings],
        ['Wickets', oa.wickets, ob.wickets],
        ['Average', fmt.avg(oa.avg), fmt.avg(ob.avg)],
        ['Economy', fmt.econ(oa.econ), fmt.econ(ob.econ)],
        ['Strike rate', fmt.num(oa.sr, 1), fmt.num(ob.sr, 1)],
        ['Dot %', fmt.pct(oa.dotPct), fmt.pct(ob.dotPct)],
        ['Five-wicket hauls', pa.bowling.milestones.fiveWickets, pb.bowling.milestones.fiveWickets],
      ]),
    ]));
  }

  // --- percentile shapes overlaid --------------------------------------
  const axes = sharedAxes(pa.profile, pb.profile);
  if (axes.length >= 3) {
    wrap.appendChild(card([figure({
      title: 'Percentile profiles overlaid',
      note: 'Both players scored against the same cohort, so the shapes are directly '
        + 'comparable. Further from the centre is better on every axis.',
      render: (host) => radarChart(host, {
        axes,
        series: [
          { label: a.name, colour: cA,
            values: Object.fromEntries(axes.map((ax) => [ax.key, pa.profile[ax.key].percentile])) },
          { label: b.name, colour: cB,
            values: Object.fromEntries(axes.map((ax) => [ax.key, pb.profile[ax.key].percentile])) },
        ],
        width: 460, height: 420,
      }),
      legend,
      table: () => simpleTable(['Axis', `${a.name} value`, `${a.name} pct`,
        `${b.name} value`, `${b.name} pct`],
      axes.map((ax) => [ax.label, fmt.num(pa.profile[ax.key].value, 2),
        fmt.ordinal(pa.profile[ax.key].percentile), fmt.num(pb.profile[ax.key].value, 2),
        fmt.ordinal(pb.profile[ax.key].percentile)])),
    })]));
  }

  // --- matchups side by side -------------------------------------------
  if (pa.batting?.byType && pb.batting?.byType) {
    const keys = Object.keys(manifest.bowlingTypes)
      .filter((k) => pa.batting.byType[k]?.avg != null && pb.batting.byType[k]?.avg != null);
    if (keys.length >= 2) {
      wrap.appendChild(card([figure({
        title: 'Batting average against each bowling type',
        note: 'Only types both players have faced enough of are shown.',
        render: (host) => groupedBar(host, {
          data: keys.map((k) => ({
            label: shortStyle(k, manifest),
            shortLabel: shortStyle(k, manifest),
            a: pa.batting.byType[k].avg, b: pb.batting.byType[k].avg,
          })),
          series: [{ key: 'a', label: a.name, colour: cA },
            { key: 'b', label: b.name, colour: cB }],
          height: 300, format: (v) => v.toFixed(1),
        }),
        legend: legendFor([{ label: a.name, colour: cA }, { label: b.name, colour: cB }]),
        table: () => simpleTable(['Bowling type', a.name, b.name],
          keys.map((k) => [manifest.bowlingTypes[k].label,
            fmt.avg(pa.batting.byType[k].avg), fmt.avg(pb.batting.byType[k].avg)])),
      })]));
    }
  }

  // --- entry-phase durability ------------------------------------------
  if (pa.batting?.byEntry && pb.batting?.byEntry) {
    const keys = ['new', 'settling', 'set']
      .filter((k) => pa.batting.byEntry[k]?.bpd != null && pb.batting.byEntry[k]?.bpd != null);
    if (keys.length) {
      wrap.appendChild(card([figure({
        title: 'Durability at each stage of an innings',
        note: 'Balls survived per dismissal. The gap between the first and last group shows '
          + 'how much each player depends on getting in.',
        render: (host) => groupedBar(host, {
          data: keys.map((k) => ({
            label: ENTRY_LABELS[k],
            a: pa.batting.byEntry[k].bpd, b: pb.batting.byEntry[k].bpd,
          })),
          series: [{ key: 'a', label: a.name, colour: cA },
            { key: 'b', label: b.name, colour: cB }],
          height: 260, format: (v) => v.toFixed(0),
        }),
        legend: legendFor([{ label: a.name, colour: cA }, { label: b.name, colour: cB }]),
        table: () => simpleTable(['Stage', a.name, b.name],
          keys.map((k) => [ENTRY_LABELS[k], fmt.num(pa.batting.byEntry[k].bpd, 0),
            fmt.num(pb.batting.byEntry[k].bpd, 0)])),
      })]));
    }
  }

  // --- career trajectories ---------------------------------------------
  if (pa.batting?.byYear && pb.batting?.byYear) {
    const pts = (payload) => Object.entries(payload.batting.byYear)
      .filter(([, s]) => s.balls >= 60)
      .sort(([x], [y]) => Number(x) - Number(y))
      .map(([y, s]) => ({ x: Number(y), y: s.avg }));
    const sa = pts(pa); const sb = pts(pb);
    if (sa.length >= 3 && sb.length >= 3) {
      wrap.appendChild(card([figure({
        title: 'Batting average by season',
        render: (host) => lineChart(host, {
          series: [{ label: a.name, colour: cA, points: sa },
            { label: b.name, colour: cB, points: sb }],
          height: 300, markers: false,
          xFormat: (v) => String(Math.round(v)), format: (v) => v.toFixed(0),
          xTickValues: [...new Set([...sa, ...sb].map((q) => q.x))].sort((m, n) => m - n),
        }),
        legend: legendFor([{ label: a.name, colour: cA }, { label: b.name, colour: cB }]),
        table: () => {
          const years = [...new Set([...sa, ...sb].map((p) => p.x))].sort();
          return simpleTable(['Year', a.name, b.name], years.map((y) => [
            y, fmt.avg(sa.find((p) => p.x === y)?.y), fmt.avg(sb.find((p) => p.x === y)?.y),
          ]));
        },
      })]));
    }
  }

  // --- findings side by side -------------------------------------------
  const findings = h('div', { class: 'grid grid--2' });
  for (const [player, payload] of [[a, pa], [b, pb]]) {
    const col = h('div', { class: 'stack' });
    col.appendChild(h('h3', { text: player.name }));
    const all = [...(payload.strengths || []).slice(0, 3),
      ...(payload.weaknesses || []).slice(0, 3)];
    if (!all.length) col.appendChild(emptyState('No findings clear the thresholds'));
    for (const claim of all) {
      col.appendChild(h('div', { class: `finding finding--${claim.kind}` }, [
        h('span', { class: 'finding__icon', text: claim.kind === 'strength' ? '▲' : '▼',
          'aria-hidden': 'true' }),
        h('div', { class: 'finding__title', text: claim.subject }),
        h('div', { class: 'finding__body', text: claim.text }),
      ]));
    }
    findings.appendChild(col);
  }
  wrap.appendChild(h('div', {}, [h('h2', { text: 'Findings' }), findings]));

  return wrap;
}

function sharedAxes(profileA, profileB) {
  if (!profileA || !profileB) return [];
  return Object.keys(profileA)
    .filter((k) => profileB[k] && profileA[k].discipline === 'batting')
    .map((k) => ({ key: k, label: profileA[k].label }));
}
