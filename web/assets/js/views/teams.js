/** Team pages: the squad, its shape, and the balance of its attack. */
import { h, clear } from '../lib/dom.js';
import { fmt } from '../lib/format.js';
import { barChart, donutChart, legendFor } from '../charts/index.js';
import { figure, token } from '../charts/core.js';
import { dataTable, simpleTable } from '../lib/table.js';
import {
  card, datasetNotice, emptyState, orderFormats, pageHead,
} from './components.js';

export async function render({ manifest, players, route, store: dataStore }) {
  const root = h('div', { class: 'stack' });
  const notice = datasetNotice(manifest);
  if (notice) root.appendChild(notice);

  const teams = [...new Set(players.flatMap((p) => p.teams))].sort();
  if (!teams.length) return emptyState('No teams in this dataset');

  const formats = orderFormats(Object.keys(manifest.formats || {}));
  let team = route.params[0] && teams.includes(route.params[0]) ? route.params[0]
    : (route.query.get('team') || teams[0]);
  let fmtKey = formats.includes(route.query.get('format')) ? route.query.get('format') : formats[0];

  root.appendChild(pageHead('Teams',
    'Squad depth, batting shape and the balance of the bowling attack.'));

  const controls = h('div', { class: 'row', style: 'gap:.75rem;align-items:flex-end' });
  const sel = (label, options, value, onChange) => {
    const s = h('select', { class: 'select' });
    for (const o of options) {
      const opt = h('option', { value: o, text: o === value ? o : o });
      if (o === value) opt.selected = true;
      s.appendChild(opt);
    }
    s.addEventListener('change', () => onChange(s.value));
    return h('div', { class: 'field' }, [h('label', { text: label }), s]);
  };
  controls.appendChild(sel('Team', teams, team, (v) => { team = v; refresh(); }));
  const fmtSel = h('select', { class: 'select' });
  for (const f of formats) {
    const opt = h('option', { value: f, text: manifest.formats[f].label });
    if (f === fmtKey) opt.selected = true;
    fmtSel.appendChild(opt);
  }
  fmtSel.addEventListener('change', () => { fmtKey = fmtSel.value; refresh(); });
  controls.appendChild(h('div', { class: 'field' }, [h('label', { text: 'Format' }), fmtSel]));
  root.appendChild(controls);

  const host = h('div', { class: 'stack' });
  root.appendChild(host);

  function refresh() {
    clear(host);
    history.replaceState(null, '', `#/teams/${encodeURIComponent(team)}?format=${fmtKey}`);
    const squad = players
      .filter((p) => p.teams.includes(team) && p.formats[fmtKey])
      .map((p) => ({ ...p, f: p.formats[fmtKey] }));

    if (!squad.length) {
      host.appendChild(emptyState('No players',
        `${team} has no qualifying players in ${manifest.formats[fmtKey].label}.`));
      return;
    }

    const batters = squad.filter((p) => p.f.bat?.runs)
      .sort((a, b) => b.f.bat.runs - a.f.bat.runs);
    const bowlers = squad.filter((p) => p.f.bowl?.wkts)
      .sort((a, b) => b.f.bowl.wkts - a.f.bowl.wkts);

    // Attack composition is the most useful single picture of a side: how much
    // of the bowling load sits with pace and how much with spin, and of what kind.
    const byType = new Map();
    for (const p of bowlers) {
      const key = p.bowlingType || 'unknown';
      const prev = byType.get(key) || { balls: 0, wickets: 0, players: [] };
      prev.balls += p.f.bowl.balls;
      prev.wickets += p.f.bowl.wkts;
      prev.players.push(p.name);
      byType.set(key, prev);
    }
    const typeRows = [...byType.entries()]
      .filter(([k]) => k !== 'unknown')
      .map(([key, v]) => ({
        key,
        label: manifest.bowlingTypes?.[key]?.label || key,
        family: manifest.bowlingTypes?.[key]?.family || '',
        ...v,
      }))
      .sort((a, b) => b.balls - a.balls);

    const grid = h('div', { class: 'grid grid--2' });
    if (typeRows.length) {
      grid.appendChild(card([figure({
        title: 'Attack composition',
        note: 'Overs bowled by each type of bowling in this squad — how the side actually '
          + 'distributes its bowling load.',
        render: (h2) => barChart(h2, {
          data: typeRows.map((r) => ({
            label: r.label, value: Math.round(r.balls / 6),
            colour: r.family === 'spin' ? token('--spin') : token('--pace'),
            detail: [['Wickets', r.wickets], ['Bowlers', r.players.join(', ')]],
          })),
          horizontal: true, height: 40 + typeRows.length * 30,
          valueLabel: 'Overs', format: (v) => fmt.int(v),
        }),
        legend: legendFor([
          { label: 'Pace', colour: token('--pace') },
          { label: 'Spin', colour: token('--spin') },
        ]),
        table: () => simpleTable(['Type', 'Overs', 'Wickets', 'Bowlers'],
          typeRows.map((r) => [r.label, Math.round(r.balls / 6), r.wickets,
            r.players.join(', ')])),
      })]));

      const paceBalls = typeRows.filter((r) => r.family === 'pace')
        .reduce((s, r) => s + r.balls, 0);
      const spinBalls = typeRows.filter((r) => r.family === 'spin')
        .reduce((s, r) => s + r.balls, 0);
      if (paceBalls && spinBalls) {
        grid.appendChild(card([figure({
          title: 'Pace against spin',
          note: 'Share of the bowling load.',
          render: (h2) => donutChart(h2, {
            data: [
              { label: 'Pace', value: Math.round(paceBalls / 6), colour: token('--pace') },
              { label: 'Spin', value: Math.round(spinBalls / 6), colour: token('--spin') },
            ],
            width: 300, height: 250, centreLabel: 'overs',
          }),
          legend: legendFor([
            { label: `Pace — ${Math.round((100 * paceBalls) / (paceBalls + spinBalls))}%`,
              colour: token('--pace') },
            { label: `Spin — ${Math.round((100 * spinBalls) / (paceBalls + spinBalls))}%`,
              colour: token('--spin') },
          ]),
          table: () => simpleTable(['Family', 'Overs'], [
            ['Pace', Math.round(paceBalls / 6)], ['Spin', Math.round(spinBalls / 6)],
          ]),
        })]));
      }
    }
    if (grid.children.length) host.appendChild(grid);

    host.appendChild(card([
      h('h3', { text: `Batting — ${team}` }),
      dataTable({
        columns: [
          { key: 'name', label: 'Player', text: true,
            render: (r) => h('a', { href: `#/player/${r.slug}?format=${fmtKey}`, text: r.name }) },
          { key: 'role', label: 'Role', text: true },
          { key: 'inns', label: 'Inns', value: (r) => r.f.bat.inns },
          { key: 'runs', label: 'Runs', strong: true, value: (r) => r.f.bat.runs,
            render: (r) => fmt.int(r.f.bat.runs) },
          { key: 'avg', label: 'Avg', value: (r) => r.f.bat.avg, render: (r) => fmt.avg(r.f.bat.avg) },
          { key: 'sr', label: 'SR', value: (r) => r.f.bat.sr, render: (r) => fmt.sr(r.f.bat.sr) },
          { key: 'hs', label: 'HS', value: (r) => r.f.bat.hs },
          { key: '100s', label: '100s', value: (r) => r.f.bat['100s'] },
        ],
        rows: batters, pageSize: 12, initialSort: { key: 'runs', dir: 'desc' },
        filename: `${team}-batting-${fmtKey}.csv`,
      }).node,
    ]));

    host.appendChild(card([
      h('h3', { text: `Bowling — ${team}` }),
      dataTable({
        columns: [
          { key: 'name', label: 'Player', text: true,
            render: (r) => h('a', { href: `#/player/${r.slug}?format=${fmtKey}`, text: r.name }) },
          { key: 'bowlingLabel', label: 'Style', text: true },
          { key: 'inns', label: 'Inns', value: (r) => r.f.bowl.inns },
          { key: 'wkts', label: 'Wkts', strong: true, value: (r) => r.f.bowl.wkts },
          { key: 'avg', label: 'Avg', value: (r) => r.f.bowl.avg, render: (r) => fmt.avg(r.f.bowl.avg) },
          { key: 'econ', label: 'Econ', value: (r) => r.f.bowl.econ,
            render: (r) => fmt.econ(r.f.bowl.econ) },
          { key: 'sr', label: 'SR', value: (r) => r.f.bowl.sr,
            render: (r) => fmt.num(r.f.bowl.sr, 1) },
        ],
        rows: bowlers, pageSize: 12, initialSort: { key: 'wkts', dir: 'desc' },
        filename: `${team}-bowling-${fmtKey}.csv`,
      }).node,
    ]));

    host.appendChild(card([
      h('p', { class: 'small muted', style: 'margin:0' }, [
        document.createTextNode('Plan an innings against this side in the '),
        h('a', { href: `#/strategy?team=${encodeURIComponent(team)}&format=${fmtKey}`,
          text: 'strategy planner' }),
        document.createTextNode('.'),
      ]),
    ]));
  }

  refresh();
  return root;
}
