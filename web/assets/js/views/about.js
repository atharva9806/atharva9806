/**
 * Method and limitations.
 *
 * This page exists because a statistics site that does not explain its
 * thresholds is asking to be misread. Everything here is generated from the
 * manifest the pipeline writes, so it cannot drift away from what the build
 * actually did.
 */
import { h } from '../lib/dom.js';
import { fmt } from '../lib/format.js';
import { simpleTable } from '../lib/table.js';
import { card, datasetNotice, orderFormats, pageHead } from './components.js';

export async function render({ manifest }) {
  const root = h('div', { class: 'stack' });
  const notice = datasetNotice(manifest);
  if (notice) root.appendChild(notice);

  root.appendChild(pageHead('How this is built',
    'What the data is, how a strength or weakness is decided, and what the numbers cannot tell you.'));

  const formats = orderFormats(Object.keys(manifest.formats || {}));

  // --- provenance -------------------------------------------------------
  const provenance = manifest.provenance || {};
  root.appendChild(card([
    h('h2', { text: 'Where the data comes from' }),
    provenance.dataset === 'demo'
      ? h('p', { text: provenance.notice || '' })
      : h('p', {}, [
        document.createTextNode('Ball-by-ball data comes from '),
        h('a', { href: 'https://cricsheet.org', text: 'Cricsheet', rel: 'noopener' }),
        document.createTextNode(', published under CC BY 4.0. Cricsheet records every '
          + 'delivery of a match — batter, bowler, runs, extras and dismissal — which is '
          + 'what makes splits like "against left-arm wrist spin in the middle overs" '
          + 'possible at all. Scorecard sources such as Statsguru give career totals but '
          + 'not the individual deliveries those totals are made of.'),
      ]),
    h('h3', { text: 'Sources', style: 'margin-top:1rem' }),
    simpleTable(['Source', 'What it provides', 'Licence', 'Used in this build'],
      Object.entries(manifest.sources || {}).map(([key, src]) => {
        const used = (provenance.sources || []).find((s) => s.id === key);
        return [src.name, src.role, src.licence,
          used ? (used.used ? 'yes' : 'no') : 'no'];
      })),
    h('p', { class: 'small muted', style: 'margin-top:.8rem',
      text: 'ESPNcricinfo and the ICC are consulted only for player metadata (bowling style, '
        + 'batting hand, playing role) and rankings, and only when explicitly enabled. Those '
        + 'requests check robots.txt first, run at a two-second floor between requests, and '
        + 'are cached so a rebuild costs nothing. Neither site is open data, so the pipeline '
        + 'works without them: supply styles from a CSV instead and every other number on '
        + 'this site is unchanged.' }),
  ]));

  // --- what is in the dataset ------------------------------------------
  root.appendChild(card([
    h('h2', { text: 'What is in this build' }),
    simpleTable(['Format', 'Matches', 'Deliveries', 'Players', 'Venues', 'Bowlers with no style'],
      formats.map((f) => {
        const m = manifest.formats[f];
        return [m.label, fmt.int(m.matches), fmt.int(m.deliveries), fmt.int(m.players),
          fmt.int(m.venues), fmt.int(m.bowlersMissingStyle)];
      })),
    h('p', { class: 'small muted', style: 'margin-top:.8rem',
      text: 'A bowler with no recorded style still counts in every total, but their '
        + 'deliveries cannot appear in a bowling-type split. That column is the honest '
        + 'measure of how complete the matchup analysis is.' }),
  ]));

  // --- method -----------------------------------------------------------
  const t = manifest.thresholds || {};
  root.appendChild(card([
    h('h2', { text: 'How a strength or weakness is decided' }),
    h('p', { text: 'A raw split is not a finding. "Averages 22 against left-arm orthodox" '
      + 'only means something once you know what that player averages overall, and how far '
      + 'other comparable players deviate from their own baseline against the same bowling. '
      + 'So each claim has to clear three separate bars:' }),
    h('ol', { style: 'padding-left:1.2rem' }, [
      h('li', { style: 'margin-bottom:.5rem' }, [
        h('strong', { text: 'Sample size. ' }),
        document.createTextNode(`A batting split needs at least ${t.minBallsClaim} balls to be `
          + `eligible as a claim, and ${t.minBallsSplit} to be shown at all. Bowling splits `
          + `need ${t.minBallsBowledClaim} and ${t.minBallsBowledSplit}. Below that, cricket `
          + 'splits are mostly noise.'),
      ]),
      h('li', { style: 'margin-bottom:.5rem' }, [
        h('strong', { text: 'Effect against the player’s own baseline. ' }),
        document.createTextNode('The split has to move at least 4% away from what that same '
          + 'player does overall. Small samples are shrunk towards that baseline first, so a '
          + 'batter dismissed twice in 60 balls by leg spin does not acquire a catastrophic '
          + 'weakness.'),
      ]),
      h('li', { style: 'margin-bottom:.5rem' }, [
        h('strong', { text: 'Position in the cohort — measured relatively. ' }),
        document.createTextNode(`The claim must sit above the ${t.strengthPercentile}th or `
          + `below the ${t.weaknessPercentile}th percentile. Crucially, that percentile is `
          + 'computed on the ratio of the split to the player’s own baseline, not on the raw '
          + 'number. Judged on raw numbers a moderate batter sits below the median against '
          + 'every type of bowling, and the site would announce six "weaknesses" that only '
          + 'restate that they are a moderate batter.'),
      ]),
    ]),
    h('p', {}, [
      document.createTextNode('The cohort is everyone in the same format with at least '),
      h('strong', { text: `${fmt.int(t.minBallsCohort)} balls faced` }),
      document.createTextNode(` (or ${fmt.int(t.minBallsBowledCohort)} balls bowled). Every `
        + 'claim on a player page shows its sample size, its percentile and a confidence '
        + 'label so you can discount it yourself.'),
    ]),
  ]));

  // --- limitations ------------------------------------------------------
  root.appendChild(card([
    h('h2', { text: 'What this cannot tell you' }),
    h('ul', { style: 'padding-left:1.2rem' }, [
      h('li', { style: 'margin-bottom:.45rem' }, [
        h('strong', { text: 'No ball tracking. ' }),
        document.createTextNode('Length, line, speed, swing and turn are not in any openly '
          + 'licensed ball-by-ball dataset. Nothing on this site claims a batter has a '
          + '"short ball problem" or should be bowled "full and straight", because the data '
          + 'cannot support it. Where the strategy planner mentions the stumps, that is '
          + 'inferred from the mix of dismissal modes — bowled and lbw against caught — '
          + 'which the data does record, and it says so.'),
      ]),
      h('li', { style: 'margin-bottom:.45rem' }, [
        h('strong', { text: 'No shot or field data. ' }),
        document.createTextNode('Which shot was played, where the ball went, and where the '
          + 'fielders were are all absent. Field-setting advice here is therefore general '
          + 'rather than zonal.'),
      ]),
      h('li', { style: 'margin-bottom:.45rem' }, [
        h('strong', { text: 'Conditions are not controlled for. ' }),
        document.createTextNode('A batting average in one country against another reflects '
          + 'the pitches, the attacks and the eras encountered, not a pure measure of skill. '
          + 'The venue and country splits are descriptive.'),
      ]),
      h('li', { style: 'margin-bottom:.45rem' }, [
        h('strong', { text: 'Bowling style is a single label. ' }),
        document.createTextNode('A bowler is recorded as one type for their whole career, so '
          + 'someone who changed method mid-career is flattened into whichever style their '
          + 'profile records. Cricketers who bowl two styles are counted only as one.'),
      ]),
      h('li', { style: 'margin-bottom:.45rem' }, [
        h('strong', { text: 'Correlation, not causation. ' }),
        document.createTextNode('A batter who averages less against spin may be facing spin '
          + 'mostly on turning pitches, late in innings, or against better spinners. The '
          + 'phase and country splits let you check that; the headline number does not do '
          + 'it for you.'),
      ]),
      h('li', {}, [
        h('strong', { text: 'A percentile is not a verdict. ' }),
        document.createTextNode('Being in the bottom 10% of a cohort of international '
          + 'cricketers is still a very high standard in absolute terms.'),
      ]),
    ]),
  ]));

  // --- rebuild ----------------------------------------------------------
  root.appendChild(card([
    h('h2', { text: 'Rebuilding the dataset' }),
    h('p', { text: 'Everything on this site is generated from a single command. The pipeline '
      + 'streams the archives one match at a time, so a full build runs on an ordinary '
      + 'laptop without a scientific Python stack — the standard library is the only '
      + 'dependency.' }),
    h('pre', { style: 'background:var(--surface-2);padding:.8rem;border-radius:8px;'
      + 'overflow-x:auto;font-size:.83rem' }, [
      h('code', { text: '# download the ball-by-ball archives, then aggregate and analyse\n'
        + 'python -m pipeline all --formats test odi t20i\n\n'
        + '# optionally enrich bowling styles from player profiles (opt-in, robots-gated)\n'
        + 'python -m pipeline build --enrich espncricinfo\n\n'
        + '# regenerate the simulated demo dataset instead\n'
        + 'python -m pipeline seed' }),
    ]),
    h('p', { class: 'small muted',
      text: `This build was generated ${manifest.generated || 'at an unknown time'}.` }),
  ]));

  return root;
}
