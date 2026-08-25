/**
 * The "Live AI read" panel on a player profile.
 *
 * Two deliberate choices:
 *
 * 1. It never runs on page load. Each call costs CricketData and Gemini quota,
 *    and most visits to a profile do not want an AI paragraph — so it waits to
 *    be asked.
 * 2. It is visually and textually separated from the computed statistics above
 *    it. Everything else on a player page is measured; this is a language
 *    model's reading of those measurements, and the panel says so rather than
 *    letting the two blur together.
 */
import { h, clear } from '../lib/dom.js';
import { isConfigured, playerAnalysis, apiBase, ApiError } from '../lib/liveapi.js';
import { card, chip, emptyState } from './components.js';

const CONFIDENCE_VARIANT = { high: 'high', medium: '', low: 'low' };

export function liveReadSection(playerName) {
  const section = h('section', { class: 'stack' });
  section.appendChild(h('h2', { text: 'Live AI read' }));

  if (!isConfigured()) {
    section.appendChild(card([
      h('p', { class: 'small muted', style: 'margin:0' }, [
        document.createTextNode('No analysis backend is configured, so this panel is '
          + 'inactive. Everything else on this page is computed from the ball-by-ball '
          + 'dataset and does not need one. To enable it, deploy '),
        h('code', { text: 'backend/' }),
        document.createTextNode(' and set its URL in the '),
        h('code', { text: 'criclysis-api' }),
        document.createTextNode(' meta tag in index.html.'),
      ]),
    ]));
    return section;
  }

  const body = h('div');
  let inFlight = null;

  const button = h('button', {
    class: 'btn btn--primary', type: 'button',
    text: 'Generate live read',
  });

  const panel = card([
    h('div', { class: 'card__head' }, [
      h('h3', { text: `AI analysis of ${playerName}` }),
      button,
    ]),
    h('p', { class: 'card__note' }, [
      document.createTextNode('Combines this player’s historical splits with any live '
        + 'match in progress, and asks a language model to read them. Generated text, '
        + 'not measurement — check the evidence line under each claim. '),
      h('span', { class: 'muted', text: `Backend: ${apiBase()}` }),
    ]),
    body,
  ]);
  section.appendChild(panel);

  button.addEventListener('click', async () => {
    if (inFlight) inFlight.abort();
    inFlight = new AbortController();
    button.disabled = true;
    button.textContent = 'Analysing…';
    clear(body).appendChild(loadingState());

    try {
      const data = await playerAnalysis(playerName, { signal: inFlight.signal });
      clear(body).appendChild(renderAnalysis(data));
    } catch (err) {
      clear(body).appendChild(errorState(err, () => button.click()));
    } finally {
      button.disabled = false;
      button.textContent = 'Regenerate';
      inFlight = null;
    }
  });

  return section;
}

function loadingState() {
  const box = h('div', { role: 'status', 'aria-live': 'polite' });
  box.appendChild(h('p', { class: 'small muted',
    text: 'Contacting the backend. A service on a free tier may take up to a minute '
      + 'to wake up on the first request.' }));
  for (const width of ['92%', '78%', '85%', '60%']) {
    box.appendChild(h('div', { class: 'skeleton skeleton--line', style: `width:${width}` }));
  }
  return box;
}

function errorState(err, retry) {
  const box = h('div');
  box.appendChild(h('div', { class: 'notice', style: 'border-left-color:var(--critical)' }, [
    h('span', { class: 'notice__icon', text: '⚠', 'aria-hidden': 'true' }),
    h('div', {}, [
      h('strong', { text: 'Could not generate a live read' }),
      h('p', { text: err.message }),
    ]),
  ]));
  if (err instanceof ApiError && err.retryable) {
    box.appendChild(h('button', {
      class: 'btn', type: 'button', text: 'Try again',
      style: 'margin-top:.6rem', onclick: retry,
    }));
  }
  return box;
}

function renderAnalysis(d) {
  const box = h('div', { class: 'stack' });
  const meta = d.meta || {};

  // Say plainly where this came from. "source" distinguishes an AI synthesis
  // from the pipeline's own computed splits, and conflating them would be the
  // most misleading thing this panel could do.
  const sourceLabel = {
    gemini: 'AI synthesis, grounded in the ball-by-ball splits',
    computed: 'Computed splits only — AI synthesis was unavailable',
    fallback: 'No data available',
  }[meta.source] || meta.source;

  box.appendChild(h('div', { class: 'row', style: 'gap:.4rem' }, [
    chip(sourceLabel, meta.source === 'gemini' ? 'high' : 'low'),
    meta.model ? chip(meta.model) : null,
    meta.live_data ? chip('live match data') : null,
    meta.grounded ? chip('grounded in dataset') : chip('no historical record', 'low'),
  ].filter(Boolean)));

  if (meta.degraded && meta.notes?.length) {
    box.appendChild(h('p', { class: 'small muted', text: meta.notes.join(' ') }));
  }

  const live = d.current_stats?.live_innings;
  if (live) {
    box.appendChild(h('div', { class: 'notice notice--live' }, [
      h('span', { class: 'notice__icon', text: '●', 'aria-hidden': 'true' }),
      h('div', {}, [
        h('strong', { text: 'Currently batting' }),
        h('p', { text: `${live.runs} off ${live.balls_faced} balls`
          + (live.strike_rate != null ? `, strike rate ${live.strike_rate}` : '')
          + (live.dot_ball_percentage != null
            ? `, dot-ball ${live.dot_ball_percentage}%` : '') }),
      ]),
    ]));
  }

  if (d.playstyle?.summary) {
    box.appendChild(h('div', {}, [
      h('h4', { text: 'Playing style' }),
      h('p', { text: d.playstyle.summary, style: 'margin:.3rem 0 0' }),
      d.playstyle.tempo
        ? h('p', { class: 'small muted', text: d.playstyle.tempo, style: 'margin:.2rem 0 0' })
        : null,
    ]));
  }

  if (d.weaknesses?.length) {
    const list = h('div', { class: 'stack' });
    for (const w of d.weaknesses) {
      list.appendChild(h('div', { class: 'finding finding--weakness' }, [
        h('span', { class: 'finding__icon', text: '▼', 'aria-hidden': 'true' }),
        h('div', { class: 'finding__title', text: w.title }),
        h('div', { class: 'finding__body', text: w.detail }),
        h('div', { class: 'finding__meta' }, [
          w.evidence ? chip(w.evidence) : null,
          w.confidence ? chip(`${w.confidence} confidence`,
            CONFIDENCE_VARIANT[w.confidence] ?? '') : null,
        ].filter(Boolean)),
      ]));
    }
    box.appendChild(h('div', {}, [h('h4', { text: 'Weaknesses' }), list]));
  }

  if (d.tactical_advice?.length) {
    const list = h('div', { class: 'stack' });
    for (const t of d.tactical_advice) {
      list.appendChild(h('div', { class: 'finding finding--strength' }, [
        h('span', { class: 'finding__icon', text: '▲', 'aria-hidden': 'true' }),
        h('div', { class: 'finding__title', text: t.phase }),
        h('div', { class: 'finding__body' }, [
          document.createTextNode(t.recommendation),
          t.rationale
            ? h('div', { class: 'small muted', style: 'margin-top:.25rem', text: t.rationale })
            : null,
        ].filter(Boolean)),
      ]));
    }
    box.appendChild(h('div', {}, [h('h4', { text: 'Tactical plan' }), list]));
  }

  if (meta.disclaimer) {
    box.appendChild(h('p', { class: 'small muted', text: meta.disclaimer }));
  }
  return box;
}
