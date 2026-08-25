/**
 * Client for the Criclysis analysis backend.
 *
 * The backend is optional. Criclysis is a static site that works entirely from
 * its own dataset; this adds a live, AI-written read on top when a backend is
 * configured. Everything here degrades to "not configured" rather than to an
 * error, because a missing backend is a normal state, not a fault.
 */

const STORAGE_KEY = 'criclysis.apiBase';

/**
 * Where the backend lives.
 *
 * Resolution order lets one deployment serve everybody: a value saved in the
 * browser wins (useful for pointing a local page at a staging service), then
 * whatever the page declares, then nothing.
 */
export function apiBase() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return saved.replace(/\/+$/, '');
  } catch { /* private mode: fall through */ }
  const meta = document.querySelector('meta[name="criclysis-api"]');
  const declared = meta?.content?.trim();
  return declared ? declared.replace(/\/+$/, '') : '';
}

export function setApiBase(url) {
  try {
    if (url) localStorage.setItem(STORAGE_KEY, url.replace(/\/+$/, ''));
    else localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export const isConfigured = () => Boolean(apiBase());

class ApiError extends Error {
  constructor(message, { status = 0, retryable = false } = {}) {
    super(message);
    this.status = status;
    this.retryable = retryable;
  }
}

async function call(path, { timeout = 90000, signal } = {}) {
  const base = apiBase();
  if (!base) throw new ApiError('No analysis backend is configured.');

  // Render's free tier sleeps; a cold start can take most of a minute. The
  // timeout is generous on purpose, and the caller warns the user about it.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });

  try {
    const res = await fetch(base + path, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    let body;
    try {
      body = await res.json();
    } catch {
      throw new ApiError(`Backend returned a non-JSON response (HTTP ${res.status}).`,
        { status: res.status });
    }
    if (!res.ok) {
      throw new ApiError(body.error || `Backend returned HTTP ${res.status}.`,
        { status: res.status, retryable: res.status === 429 || res.status >= 500 });
    }
    return body;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new ApiError('The backend did not respond in time. If it is hosted on a '
        + 'free tier it may still be waking up — try again in a moment.',
      { retryable: true });
    }
    if (err instanceof ApiError) throw err;
    // A network-level failure here is almost always CORS or a wrong URL, and
    // saying so saves a long detour through the browser console.
    throw new ApiError('Could not reach the analysis backend. Check the URL is '
      + 'correct and that this origin is allowed by its CORS settings.',
    { retryable: true });
  } finally {
    clearTimeout(timer);
  }
}

export function health() {
  return call('/healthz', { timeout: 20000 });
}

export function playerAnalysis(player, { matchId = null, signal } = {}) {
  const params = new URLSearchParams({ player });
  if (matchId) params.set('match_id', matchId);
  return call(`/api/player-analysis?${params}`, { signal });
}

export function liveMatches() {
  return call('/api/live-matches', { timeout: 30000 });
}

export { ApiError };
