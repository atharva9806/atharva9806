/** The player index: filter, sort, and jump into a profile. */
import { h, clear } from '../lib/dom.js';
import { fmt } from '../lib/format.js';
import { dataTable } from '../lib/table.js';
import { card, datasetNotice, orderFormats, pageHead } from './components.js';

export async function render({ manifest, players, route }) {
  const root = h('div', { class: 'stack' });
  const notice = datasetNotice(manifest);
  if (notice) root.appendChild(notice);

  const formats = orderFormats(Object.keys(manifest.formats || {}));
  let active = formats.includes(route.query.get('format')) ? route.query.get('format') : formats[0];
  let team = route.query.get('team') || '';
  let role = '';
  let query = '';
  let discipline = 'batting';

  root.appendChild(pageHead('Players',
    'Every player with a qualifying record in the dataset. Filter by format, side or role, '
    + 'then open a profile for the full ball-by-ball breakdown.'));

  const teams = [...new Set(players.flatMap((p) => p.teams))].sort();
  const roles = [...new Set(players.map((p) => p.role).filter(Boolean))].sort();

  const controls = h('div', { class: 'row', style: 'gap:.75rem' });
  const mk = (label, options, onChange, value = '') => {
    const sel = h('select', { class: 'select' });
    for (const opt of options) {
      const o = h('option', { value: opt.value, text: opt.label });
      if (opt.value === value) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => onChange(sel.value));
    return h('div', { class: 'field' }, [h('label', { text: label }), sel]);
  };

  controls.appendChild(mk('Format',
    formats.map((f) => ({ value: f, label: manifest.formats[f].label })),
    (v) => { active = v; refresh(); }, active));
  controls.appendChild(mk('Discipline', [
    { value: 'batting', label: 'Batting' }, { value: 'bowling', label: 'Bowling' },
  ], (v) => { discipline = v; refresh(); }));
  controls.appendChild(mk('Team',
    [{ value: '', label: 'All teams' }, ...teams.map((t) => ({ value: t, label: t }))],
    (v) => { team = v; refresh(); }, team));
  controls.appendChild(mk('Role',
    [{ value: '', label: 'All roles' }, ...roles.map((r) => ({ value: r, label: r }))],
    (v) => { role = v; refresh(); }));

  const searchBox = h('input', { class: 'input', type: 'search', placeholder: 'Filter by name…' });
  searchBox.addEventListener('input', () => { query = searchBox.value.toLowerCase(); refresh(); });
  controls.appendChild(h('div', { class: 'field', style: 'flex:1 1 180px' }, [
    h('label', { text: 'Name' }), searchBox,
  ]));
  root.appendChild(controls);

  const host = card([]);
  root.appendChild(host);

  function rows() {
    return players.filter((p) => {
      const f = p.formats[active];
      if (!f) return false;
      if (discipline === 'batting' ? !f.bat : !f.bowl) return false;
      if (team && !p.teams.includes(team)) return false;
      if (role && p.role !== role) return false;
      if (query && !p.name.toLowerCase().includes(query)
        && !p.fullName.toLowerCase().includes(query)) return false;
      return true;
    }).map((p) => ({ ...p, f: p.formats[active] }));
  }

  const battingColumns = [
    { key: 'name', label: 'Player', text: true, strong: true,
      render: (r) => h('a', { href: `#/player/${r.slug}?format=${active}`, text: r.name }) },
    { key: 'teams', label: 'Team', text: true, value: (r) => r.teams[0] || '' },
    { key: 'role', label: 'Role', text: true },
    { key: 'inns', label: 'Inns', value: (r) => r.f.bat.inns },
    { key: 'runs', label: 'Runs', strong: true, value: (r) => r.f.bat.runs,
      render: (r) => fmt.int(r.f.bat.runs) },
    { key: 'avg', label: 'Avg', value: (r) => r.f.bat.avg, render: (r) => fmt.avg(r.f.bat.avg) },
    { key: 'sr', label: 'SR', value: (r) => r.f.bat.sr, render: (r) => fmt.sr(r.f.bat.sr) },
    { key: 'hs', label: 'HS', value: (r) => r.f.bat.hs },
    { key: '100s', label: '100s', value: (r) => r.f.bat['100s'] },
    { key: '50s', label: '50s', value: (r) => r.f.bat['50s'] },
    { key: 'weaknesses', label: 'Findings', value: (r) => r.f.strengths + r.f.weaknesses,
      help: 'Number of strengths and weaknesses the analysis engine found',
      render: (r) => `${r.f.strengths}▲ ${r.f.weaknesses}▼` },
  ];

  const bowlingColumns = [
    { key: 'name', label: 'Player', text: true, strong: true,
      render: (r) => h('a', { href: `#/player/${r.slug}?format=${active}`, text: r.name }) },
    { key: 'teams', label: 'Team', text: true, value: (r) => r.teams[0] || '' },
    { key: 'bowlingLabel', label: 'Style', text: true },
    { key: 'inns', label: 'Inns', value: (r) => r.f.bowl.inns },
    { key: 'wkts', label: 'Wkts', strong: true, value: (r) => r.f.bowl.wkts },
    { key: 'avg', label: 'Avg', value: (r) => r.f.bowl.avg, render: (r) => fmt.avg(r.f.bowl.avg) },
    { key: 'econ', label: 'Econ', value: (r) => r.f.bowl.econ, render: (r) => fmt.econ(r.f.bowl.econ) },
    { key: 'sr', label: 'SR', value: (r) => r.f.bowl.sr, render: (r) => fmt.num(r.f.bowl.sr, 1) },
    { key: '5w', label: '5w', value: (r) => r.f.bowl['5w'] },
  ];

  function refresh() {
    clear(host);
    const data = rows();
    host.appendChild(dataTable({
      columns: discipline === 'batting' ? battingColumns : bowlingColumns,
      rows: data,
      pageSize: 25,
      initialSort: discipline === 'batting'
        ? { key: 'runs', dir: 'desc' } : { key: 'wkts', dir: 'desc' },
      filename: `players-${active}-${discipline}.csv`,
      emptyMessage: 'No players match these filters.',
    }).node);
  }
  refresh();
  return root;
}
