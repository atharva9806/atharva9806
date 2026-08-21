/** Overview: what the site knows, and the fastest ways into it. */
import { h } from '../lib/dom.js';
import { fmt } from '../lib/format.js';
import { barChart } from '../charts/index.js';
import { figure, token } from '../charts/core.js';
import { simpleTable } from '../lib/table.js';
import {
  card, coverageNotice, datasetNotice, hero, orderFormats, statTile,
} from './components.js';

export async function render({ manifest, players }) {
  const root = h('div', { class: 'stack' });
  const notice = datasetNotice(manifest);
  if (notice) root.appendChild(notice);

  const formats = orderFormats(Object.keys(manifest.formats || {}));
  const totalMatches = formats.reduce((s, f) => s + (manifest.formats[f].matches || 0), 0);
  const totalBalls = formats.reduce((s, f) => s + (manifest.formats[f].deliveries || 0), 0);
  const live = manifest.provenance?.dataset !== 'demo';

  const coverage = coverageNotice(manifest);
  if (coverage) root.appendChild(coverage);
  root.appendChild(hero({
    eyebrow: live
      ? `Live dataset · ${fmt.int(totalBalls)} deliveries`
      : 'Simulated demo dataset',
    live,
    title: 'Cricket analysis, built from every ball',
    body: 'Career records, strengths and weaknesses against each bowling type and phase of '
      + 'an innings, and bowling and batting plans for any player or side — all derived from '
      + 'ball-by-ball data rather than scorecard totals.',
    actions: [
      { label: 'Browse players', href: '#/players', primary: true },
      { label: 'Open the strategy planner', href: '#/strategy' },
    ],
  }));

  root.appendChild(h('div', { class: 'grid grid--4' }, [
    statTile('Players', fmt.int(manifest.playerCount), 'with a qualifying record'),
    statTile('Matches', fmt.int(totalMatches), formats.map((f) => manifest.formats[f].label).join(' · ')),
    statTile('Deliveries', fmt.int(totalBalls), 'every one carrying batter, bowler and outcome'),
    statTile('Formats', String(formats.length), 'analysed independently'),
  ]));

  // --- what you can do here --------------------------------------------
  root.appendChild(h('div', { class: 'grid grid--3' }, [
    linkCard('Player profiles', 'Career arc, matchups against all ten bowling types, phase '
      + 'splits, dismissal patterns and an automatic read on strengths and weaknesses.',
    '#/players', 'Browse players'),
    linkCard('Strategy planner', 'Pick a batter and an attack, or two full sides, and get a '
      + 'phase-by-phase bowling plan with the evidence behind each recommendation.',
    '#/strategy', 'Open the planner'),
    linkCard('Compare & leaderboards', 'Put two careers side by side across every split, or '
      + 'rank the whole dataset on any metric with the sample-size gates applied.',
    '#/compare', 'Compare players'),
  ]));

  // --- leading run scorers per format -----------------------------------
  for (const fmtKey of formats) {
    const label = manifest.formats[fmtKey].label;
    const batters = players
      .filter((p) => p.formats[fmtKey]?.bat?.runs)
      .sort((a, b) => b.formats[fmtKey].bat.runs - a.formats[fmtKey].bat.runs)
      .slice(0, 10);
    const bowlers = players
      .filter((p) => p.formats[fmtKey]?.bowl?.wkts)
      .sort((a, b) => b.formats[fmtKey].bowl.wkts - a.formats[fmtKey].bowl.wkts)
      .slice(0, 10);
    if (!batters.length && !bowlers.length) continue;

    root.appendChild(card([
      h('div', { class: 'card__head' }, [h('h2', { text: `${label} leaders` })]),
      h('div', { class: 'grid grid--2' }, [
        batters.length ? figure({
          title: 'Most runs',
          note: `Top ten run scorers in ${label} cricket in this dataset.`,
          render: (host) => barChart(host, {
            data: batters.map((p) => ({
              label: p.name,
              value: p.formats[fmtKey].bat.runs,
              detail: [['Average', fmt.avg(p.formats[fmtKey].bat.avg)],
                ['Strike rate', fmt.sr(p.formats[fmtKey].bat.sr)],
                ['Innings', p.formats[fmtKey].bat.inns]],
            })),
            horizontal: true, height: 40 + batters.length * 30,
            format: (v) => fmt.int(v), valueLabel: 'Runs',
            colour: token('--series-1'),
          }),
          table: () => simpleTable(['Player', 'Runs', 'Avg', 'SR', 'Inns'],
            batters.map((p) => [p.name, p.formats[fmtKey].bat.runs,
              fmt.avg(p.formats[fmtKey].bat.avg), fmt.sr(p.formats[fmtKey].bat.sr),
              p.formats[fmtKey].bat.inns])),
        }) : null,
        bowlers.length ? figure({
          title: 'Most wickets',
          note: `Top ten wicket takers in ${label} cricket in this dataset.`,
          render: (host) => barChart(host, {
            data: bowlers.map((p) => ({
              label: p.name,
              value: p.formats[fmtKey].bowl.wkts,
              detail: [['Average', fmt.avg(p.formats[fmtKey].bowl.avg)],
                ['Economy', fmt.econ(p.formats[fmtKey].bowl.econ)]],
            })),
            horizontal: true, height: 40 + bowlers.length * 30,
            format: (v) => fmt.int(v), valueLabel: 'Wickets',
            colour: token('--series-3'),
          }),
          table: () => simpleTable(['Player', 'Wickets', 'Avg', 'Econ'],
            bowlers.map((p) => [p.name, p.formats[fmtKey].bowl.wkts,
              fmt.avg(p.formats[fmtKey].bowl.avg), fmt.econ(p.formats[fmtKey].bowl.econ)])),
        }) : null,
      ]),
    ]));
  }

  return root;
}

function linkCard(title, body, href, cta) {
  const node = card([
    h('h3', { text: title }),
    h('p', { class: 'small', text: body, style: 'color:var(--text-secondary)' }),
    h('a', { class: 'btn btn--primary', href, text: cta,
      style: 'display:inline-block;text-decoration:none' }),
  ], 'card--interactive');
  // The whole card is the target; the button inside stays keyboard-reachable.
  node.addEventListener('click', (ev) => {
    if (ev.target.closest('a')) return;
    window.location.hash = href;
  });
  return node;
}
