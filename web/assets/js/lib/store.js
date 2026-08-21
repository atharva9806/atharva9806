/**
 * Data access.
 *
 * The site is static: everything is a fetch of a JSON file under data/, with an
 * in-memory cache so switching between views never re-downloads. The player
 * index is small and loaded once; the detailed per-player records are fetched
 * only when a profile is opened.
 */

const cache = new Map();
const BASE = new URL('../../../data/', import.meta.url);

async function load(name) {
  if (cache.has(name)) return cache.get(name);
  const promise = fetch(new URL(name, BASE))
    .then((res) => {
      if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
      return res.json();
    })
    .catch((err) => {
      cache.delete(name);
      throw err;
    });
  cache.set(name, promise);
  return promise;
}

export const store = {
  manifest: () => load('manifest.json'),
  players: () => load('players.json').then((d) => d.players),
  player: (slug) => load(`players/${slug}.json`),
  teams: () => load('teams.json').then((d) => d.teams),
  venues: () => load('venues.json').then((d) => d.venues),
  cohorts: () => load('cohorts.json'),
  rankings: () => load('rankings.json').then((d) => d.rankings).catch(() => null),
};

/** Everything the shell needs before the first render. */
export async function bootstrap() {
  const [manifest, players] = await Promise.all([store.manifest(), store.players()]);
  return { manifest, players, index: buildIndex(players) };
}

/** A simple prefix/substring index for the search box. */
export function buildIndex(players) {
  return players.map((p) => ({
    player: p,
    haystack: `${p.name} ${p.fullName} ${p.teams.join(' ')} ${p.role}`.toLowerCase(),
    key: p.name.toLowerCase(),
  }));
}

export function search(index, query, limit = 12) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const starts = [];
  const contains = [];
  for (const entry of index) {
    if (entry.key.startsWith(q)) starts.push(entry.player);
    else if (entry.haystack.includes(q)) contains.push(entry.player);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}

/** Sum a player's career across the formats they appear in. */
export function careerTotals(player) {
  let runs = 0; let wickets = 0; let inns = 0;
  for (const f of Object.values(player.formats || {})) {
    runs += f.bat?.runs || 0;
    wickets += f.bowl?.wkts || 0;
    inns += f.bat?.inns || 0;
  }
  return { runs, wickets, inns };
}

/** Which format should a player's profile open on? The one they played most. */
export function primaryFormat(player) {
  let best = null; let bestScore = -1;
  for (const [fmt, row] of Object.entries(player.formats || {})) {
    const score = (row.bat?.balls || 0) + (row.bowl?.balls || 0) * 1.2;
    if (score > bestScore) { bestScore = score; best = fmt; }
  }
  return best;
}
