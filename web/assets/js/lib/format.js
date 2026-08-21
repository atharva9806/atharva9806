/** Formatting helpers shared across views. */

export const fmt = {
  /** Batting or bowling average - null means "never dismissed / no wickets". */
  avg: (v) => (v == null ? '—' : v.toFixed(2)),
  sr: (v) => (v == null ? '—' : v.toFixed(1)),
  econ: (v) => (v == null ? '—' : v.toFixed(2)),
  pct: (v) => (v == null ? '—' : `${v.toFixed(1)}%`),
  int: (v) => (v == null ? '—' : Math.round(v).toLocaleString()),
  num: (v, d = 1) => (v == null ? '—' : v.toFixed(d)),
  /** Bowling figures, e.g. 5/37. */
  figures: (w, r) => `${w}/${r}`,
  /** 43 balls -> "7.1" overs. */
  overs: (balls) => `${Math.floor(balls / 6)}.${balls % 6}`,
  date: (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  },
  year: (iso) => (iso ? iso.slice(0, 4) : '—'),
  ordinal: (n) => {
    const v = Math.round(n);
    const s = ['th', 'st', 'nd', 'rd'];
    const m = v % 100;
    return v + (s[(m - 20) % 10] || s[m] || s[0]);
  },
  /** A batting score with the not-out star. */
  score: (runs, out) => `${runs}${out ? '' : '*'}`,
  signed: (v, d = 1) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(d)}`),
};

export const PHASE_SHORT = {
  powerplay: 'PP', middle: 'Mid', death: 'Death',
  new_ball: 'New ball', old_ball: 'Old ball', second_new: '2nd new',
};

export const DISMISSAL_LABELS = {
  caught: 'Caught', bowled: 'Bowled', lbw: 'LBW', 'run out': 'Run out',
  stumped: 'Stumped', 'caught and bowled': 'Caught & bowled',
  'hit wicket': 'Hit wicket', 'retired hurt': 'Retired hurt',
  'retired out': 'Retired out', 'obstructing the field': 'Obstructing the field',
  'handled the ball': 'Handled the ball', 'timed out': 'Timed out',
  'hit the ball twice': 'Hit the ball twice',
};

export const ENTRY_LABELS = {
  new: 'First 15 balls',
  settling: 'Balls 16-40',
  set: 'Once set (40+)',
};

export const HOME_LABELS = { home: 'At home', away: 'Away' };
export const CHASE_LABELS = { chasing: 'Chasing', setting: 'Batting first' };
export const HAND_LABELS = { right: 'Right-handers', left: 'Left-handers' };

export function titleCase(s) {
  return String(s || '').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Turn "Slow left-arm orthodox" into "SLA" for tight axis labels. */
export function shortStyle(key, manifest) {
  const map = {
    rf: 'RF', rfm: 'RFM', rm: 'RM', lf: 'LF', lfm: 'LFM', lm: 'LM',
    ob: 'OB', lb: 'LB', sla: 'SLA', slc: 'SLC',
  };
  return map[key] || (manifest?.bowlingTypes?.[key]?.label ?? key);
}

export function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
