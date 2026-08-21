/**
 * Application shell: theme, search, routing.
 *
 * Routes are hash-based so the whole site works from a plain static file
 * server, from GitHub Pages, and from the local filesystem behind
 * `python3 -m http.server` with no server-side rewriting.
 */
import { bootstrap, search as searchPlayers, store } from './lib/store.js';
import { clear, h, debounce } from './lib/dom.js';

const routes = {
  '': () => import('./views/home.js'),
  players: () => import('./views/players.js'),
  player: () => import('./views/player.js'),
  compare: () => import('./views/compare.js'),
  leaderboards: () => import('./views/leaderboards.js'),
  strategy: () => import('./views/strategy.js'),
  teams: () => import('./views/teams.js'),
  about: () => import('./views/about.js'),
};

const app = {
  manifest: null,
  players: [],
  index: [],
  bySlug: new Map(),
};

/* -------------------------------------------------------------------------
   Theme
   ------------------------------------------------------------------------- */
function initTheme() {
  const stored = (() => {
    try { return localStorage.getItem('theme'); } catch { return null; }
  })();
  if (stored === 'light' || stored === 'dark') {
    document.documentElement.dataset.theme = stored;
  }
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const current = document.documentElement.dataset.theme;
    const isDark = current
      ? current === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    const next = isDark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch { /* private mode */ }
    // Charts read colour tokens at draw time, so re-render the current view.
    window.dispatchEvent(new CustomEvent('themechange'));
  });
}

/* -------------------------------------------------------------------------
   Global search
   ------------------------------------------------------------------------- */
function initSearch() {
  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');
  let active = -1;
  let current = [];

  const render = () => {
    clear(results);
    current.forEach((p, i) => {
      const item = h('a', {
        class: 'search__item', href: `#/player/${p.slug}`, role: 'option',
        'aria-selected': String(i === active),
      }, [
        h('span', { text: p.name }),
        h('small', { text: [p.teams[0], p.role].filter(Boolean).join(' · ') }),
      ]);
      item.addEventListener('click', () => { input.value = ''; clear(results); });
      results.appendChild(item);
    });
    input.setAttribute('aria-expanded', String(current.length > 0));
  };

  input.addEventListener('input', debounce(() => {
    current = searchPlayers(app.index, input.value);
    active = -1;
    render();
  }, 120));

  input.addEventListener('keydown', (ev) => {
    if (!current.length) return;
    if (ev.key === 'ArrowDown') { ev.preventDefault(); active = Math.min(current.length - 1, active + 1); render(); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); active = Math.max(0, active - 1); render(); }
    else if (ev.key === 'Enter' && active >= 0) {
      ev.preventDefault();
      window.location.hash = `#/player/${current[active].slug}`;
      input.value = ''; current = []; render();
    } else if (ev.key === 'Escape') { input.value = ''; current = []; render(); }
  });

  document.addEventListener('click', (ev) => {
    if (!document.getElementById('global-search').contains(ev.target)) {
      current = []; render();
    }
  });

  // "/" focuses search from anywhere, the way every good data site behaves.
  document.addEventListener('keydown', (ev) => {
    if (ev.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
      ev.preventDefault();
      input.focus();
    }
  });
}

/* -------------------------------------------------------------------------
   Routing
   ------------------------------------------------------------------------- */
function parseHash() {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  return {
    name: parts[0] || '',
    params: parts.slice(1).map(decodeURIComponent),
    query: new URLSearchParams(query),
  };
}

function markNav(name) {
  for (const link of document.querySelectorAll('#nav a')) {
    const target = link.getAttribute('href').replace(/^#\/?/, '').split('/')[0];
    const match = target === name || (target === 'players' && name === 'player');
    if (match) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

let renderToken = 0;

async function render() {
  const route = parseHash();
  const main = document.getElementById('main');
  const token = ++renderToken;
  markNav(route.name);

  const loader = routes[route.name];
  if (!loader) {
    clear(main).appendChild(h('div', { class: 'empty' }, [
      h('h2', { text: 'Page not found' }),
      h('p', {}, [document.createTextNode('No route matches that address. '),
        h('a', { href: '#/', text: 'Go to the overview' })]),
    ]));
    return;
  }

  clear(main).appendChild(skeletonFor(route.name));
  try {
    const view = await loader();
    if (token !== renderToken) return;             // a newer navigation won
    const node = await view.render({ ...app, route, store });
    if (token !== renderToken) return;
    node.classList.add('view');
    clear(main).appendChild(node);
    main.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  } catch (err) {
    if (token !== renderToken) return;
    console.error(err);
    clear(main).appendChild(h('div', { class: 'empty' }, [
      h('h2', { text: 'Something went wrong loading this page' }),
      h('p', { class: 'small', text: String(err && err.message ? err.message : err) }),
      h('p', { class: 'small muted', text: 'If the data files have not been built yet, run: python -m pipeline seed' }),
    ]));
  }
}

/**
 * A shaped placeholder while a view loads.
 *
 * A skeleton in roughly the layout of what is coming reads as "this is
 * arriving"; a spinner in the middle of an empty page reads as "something may
 * be wrong". The shapes differ per route so the page does not visibly jump.
 */
function skeletonFor(name) {
  const box = h('div', { class: 'view' });
  box.appendChild(h('div', { class: 'skeleton skeleton--title' }));
  box.appendChild(h('div', { class: 'skeleton skeleton--line', style: 'width:62%' }));
  box.appendChild(h('div', { class: 'skeleton skeleton--line', style: 'width:44%;margin-bottom:1.4rem' }));

  if (name === '' || name === 'player') {
    const tiles = h('div', { class: 'grid grid--4', style: 'margin-bottom:1.1rem' });
    for (let i = 0; i < 4; i += 1) tiles.appendChild(h('div', { class: 'skeleton skeleton--tile' }));
    box.appendChild(tiles);
  }
  const charts = h('div', { class: 'grid grid--2' });
  for (let i = 0; i < 2; i += 1) charts.appendChild(h('div', { class: 'skeleton skeleton--chart' }));
  box.appendChild(charts);
  box.setAttribute('role', 'status');
  box.setAttribute('aria-label', 'Loading');
  return box;
}

/** Deepen the header shadow once the page scrolls under it. */
function watchScroll() {
  const header = document.querySelector('.app-header');
  if (!header) return;
  const update = () => {
    header.dataset.scrolled = String(window.scrollY > 6);
  };
  update();
  window.addEventListener('scroll', update, { passive: true });
}

function renderFooter(manifest) {
  const foot = document.getElementById('footer-sources');
  const demo = manifest.provenance?.dataset === 'demo';
  clear(foot);
  if (demo) {
    foot.appendChild(h('span', { text: 'Simulated demo dataset — no real players. ' }));
  } else {
    // CC BY 4.0 requires attribution wherever the data is shown.
    foot.appendChild(h('span', {}, [
      document.createTextNode('Ball-by-ball data from '),
      h('a', { href: 'https://cricsheet.org', text: 'Cricsheet', rel: 'noopener' }),
      document.createTextNode(', licensed CC BY 4.0. '),
    ]));
  }
  foot.appendChild(h('span', {
    class: 'muted',
    text: `Built ${manifest.generated?.slice(0, 10) || 'unknown'} · ${manifest.playerCount} players`,
  }));
}

/* -------------------------------------------------------------------------
   Boot
   ------------------------------------------------------------------------- */
(async function start() {
  initTheme();
  watchScroll();
  try {
    const data = await bootstrap();
    Object.assign(app, data);
    app.bySlug = new Map(data.players.map((p) => [p.slug, p]));
    renderFooter(data.manifest);
    initSearch();
  } catch (err) {
    console.error(err);
    clear(document.getElementById('main')).appendChild(h('div', { class: 'empty' }, [
      h('h2', { text: 'No dataset found' }),
      h('p', { text: 'The site could not load web/data/manifest.json.' }),
      h('p', { class: 'small muted' }, [
        document.createTextNode('Build the bundled demo dataset with '),
        h('code', { text: 'python -m pipeline seed' }),
        document.createTextNode(', or the real one with '),
        h('code', { text: 'python -m pipeline all' }),
        document.createTextNode('.'),
      ]),
    ]));
    return;
  }
  window.addEventListener('hashchange', render);
  window.addEventListener('themechange', render);
  await render();
})();
