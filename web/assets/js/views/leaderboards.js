/**
 * Leaderboards with the sample-size gates made explicit.
 *
 * A "best average" table without a qualification threshold is a list of people
 * who batted twice, so the minimum-innings control is a first-class part of the
 * interface rather than a footnote.
 */
import { h, clear } from '../lib/dom.js';
import { fmt } from '../lib/format.js';
import { dataTable } from '../lib/table.js';
import { scatterChart } from '../charts/index.js';
import { figure } from '../charts/core.js';
import { simpleTable } from '../lib/table.js';
import { card, datasetNotice, orderFormats, pageHead } from './components.js';

const BOARDS = {
  batting: [
    { key: 'runs', label: 'Most runs', metric: (b) => b.runs, format: fmt.int, dir: 'desc' },
    { key: 'avg', label: 'Best average', metric: (b) => b.avg, format: fmt.avg, dir: 'desc' },
    { key: 'sr', label: 'Highest strike rate', metric: (b) => b.sr, format: fmt.sr, dir: 'desc' },
    { key: 'hs', label: 'Highest score', metric: (b) => b.hs, format: fmt.int, dir: 'desc' },
    { key: '100s', label: 'Most hundreds', metric: (b) => b['100s'], format: fmt.int, dir: 'desc' },
  ],
  bowling: [
    { key: 'wkts', label: 'Most wickets', metric: (b) => b.wkts, format: fmt.int, dir: 'desc' },
    { key: 'avg', label: 'Best average', metric: (b) => b.avg, format: fmt.avg, dir: 'asc' },
    { key: 'econ', label: 'Best economy', metric: (b) => b.econ, format: fmt.econ, dir: 'asc' },
    { key: 'sr', label: 'Best strike rate', metric: (b) => b.sr, format: (v) => fmt.num(v, 1), dir: 'asc' },
    { key: '5w', label: 'Most five-fors', metric: (b) => b['5w'], format: fmt.int, dir: 'desc' },
  ],
};

export async function render({ manifest, players, route }) {
  const root = h('div', { class: 'stack' });
  const notice = datasetNotice(manifest);
  if (notice) root.appendChild(notice);

  const formats = orderFormats(Object.keys(manifest.formats || {}));
  let active = formats.includes(route.query.get('format')) ? route.query.get('format') : formats[0];
  let discipline = 'batting';
  let minInnings = 20;

  root.appendChild(pageHead('Leaderboards',
    'Rank the dataset on any metric. The qualification threshold is a control rather than a '
    + 'footnote, because a rate-based leaderboard means nothing without one.'));

  const controls = h('div', { class: 'row', style: 'gap:.75rem' });
  const select = (label, options, onChange, value) => {
    const sel = h('select', { class: 'select' });
    for (const o of options) {
      const opt = h('option', { value: String(o.value), text: o.label });
      if (String(o.value) === String(value)) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener('change', () => onChange(sel.value));
    return h('div', { class: 'field' }, [h('label', { text: label }), sel]);
  };
  controls.appendChild(select('Format',
    formats.map((f) => ({ value: f, label: manifest.formats[f].label })),
    (v) => { active = v; refresh(); }, active));
  controls.appendChild(select('Discipline', [
    { value: 'batting', label: 'Batting' }, { value: 'bowling', label: 'Bowling' },
  ], (v) => { discipline = v; refresh(); }, discipline));
  controls.appendChild(select('Minimum innings',
    [5, 10, 20, 40, 60, 100].map((n) => ({ value: n, label: String(n) })),
    (v) => { minInnings = Number(v); refresh(); }, minInnings));
  root.appendChild(controls);

  const host = h('div', { class: 'stack' });
  root.appendChild(host);

  function qualified() {
    return players
      .map((p) => ({ p, f: p.formats[active] }))
      .filter(({ f }) => f && (discipline === 'batting' ? f.bat : f.bowl))
      .filter(({ f }) => (discipline === 'batting' ? f.bat.inns : f.bowl.inns) >= minInnings);
  }

  function refresh() {
    clear(host);
    const rows = qualified();
    if (!rows.length) {
      host.appendChild(card([h('p', { class: 'muted',
        text: 'No players clear that qualification threshold in this format.' })]));
      return;
    }

    // The scatter is the honest view: two rate metrics at once, with the
    // trade-off between them visible instead of collapsed into one ranking.
    if (discipline === 'batting') {
      const points = rows
        .filter(({ f }) => f.bat.avg != null)
        .map(({ p, f }) => ({
          id: p.slug, label: p.name, x: f.bat.sr, y: f.bat.avg,
          detail: [['Runs', fmt.int(f.bat.runs)], ['Innings', f.bat.inns]],
        }));
      host.appendChild(card([figure({
        title: 'Average against strike rate',
        note: `Every qualifying batter (${minInnings}+ innings). Up is harder to dismiss; `
          + 'right is faster scoring. Click a point to open the profile.',
        render: (h2) => scatterChart(h2, {
          points, width: 900, height: 420,
          xLabel: 'Strike rate', yLabel: 'Batting average',
          xFormat: (v) => v.toFixed(0), yFormat: (v) => v.toFixed(0),
          onSelect: (pt) => { window.location.hash = `#/player/${pt.id}?format=${active}`; },
        }),
        table: () => simpleTable(['Player', 'Average', 'Strike rate', 'Runs'],
          points.map((pt) => [pt.label, fmt.avg(pt.y), fmt.sr(pt.x), pt.detail[0][1]])),
      })]));
    } else {
      const points = rows
        .filter(({ f }) => f.bowl.avg != null && f.bowl.econ != null)
        .map(({ p, f }) => ({
          id: p.slug, label: p.name, x: f.bowl.econ, y: f.bowl.avg,
          detail: [['Wickets', f.bowl.wkts], ['Innings', f.bowl.inns]],
        }));
      host.appendChild(card([figure({
        title: 'Average against economy',
        note: `Every qualifying bowler (${minInnings}+ innings). Bottom left is the best `
          + 'place to be: cheap wickets. Click a point to open the profile.',
        render: (h2) => scatterChart(h2, {
          points, width: 900, height: 420,
          xLabel: 'Economy rate', yLabel: 'Bowling average',
          xFormat: (v) => v.toFixed(1), yFormat: (v) => v.toFixed(0),
          onSelect: (pt) => { window.location.hash = `#/player/${pt.id}?format=${active}`; },
        }),
        table: () => simpleTable(['Player', 'Average', 'Economy', 'Wickets'],
          points.map((pt) => [pt.label, fmt.avg(pt.y), fmt.econ(pt.x), pt.detail[0][1]])),
      })]));
    }

    const grid = h('div', { class: 'grid grid--2' });
    for (const board of BOARDS[discipline]) {
      const data = rows
        .map(({ p, f }) => ({
          slug: p.slug, name: p.name, team: p.teams[0] || '',
          value: board.metric(discipline === 'batting' ? f.bat : f.bowl),
        }))
        .filter((r) => r.value != null)
        .sort((a, b) => (board.dir === 'asc' ? a.value - b.value : b.value - a.value))
        .slice(0, 15)
        .map((r, i) => ({ ...r, rank: i + 1 }));
      grid.appendChild(card([
        h('h3', { text: board.label }),
        dataTable({
          // Three of these sit side by side, so there is no room for a team
          // column as well - the value would be pushed out of the card. The
          // team is one click away on the player's profile.
          columns: [
            { key: 'rank', label: '#', sortable: false },
            { key: 'name', label: 'Player', text: true,
              title: (r) => r.team,
              render: (r) => h('a', { href: `#/player/${r.slug}?format=${active}`, text: r.name }) },
            { key: 'value', label: board.label.replace(/^(Most|Best|Highest) /, ''),
              strong: true, render: (r) => board.format(r.value),
              csv: (r) => r.value },
          ],
          rows: data, pageSize: 15,
          initialSort: { key: 'rank', dir: 'asc' },
          filename: `${active}-${board.key}.csv`,
        }).node,
      ]));
    }
    host.appendChild(grid);
  }

  refresh();
  return root;
}
