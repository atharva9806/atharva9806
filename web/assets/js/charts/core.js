/**
 * Shared plumbing for every chart: an SVG scaffold, scales, axes, a hover
 * tooltip layer, and the chart/table toggle.
 *
 * Charts here are plain SVG built with the DOM API. No chart library, no build
 * step - the site is a folder of static files you can open with any web server.
 */

export const SVG_NS = 'http://www.w3.org/2000/svg';

let uid = 0;
export const nextId = (prefix = 'c') => `${prefix}-${++uid}`;

export function el(name, attrs = {}, children = []) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined) continue;
    node.setAttribute(key, String(value));
  }
  for (const child of [].concat(children)) {
    if (child == null) continue;
    node.appendChild(typeof child === 'string'
      ? document.createTextNode(child) : child);
  }
  return node;
}

export function h(name, attrs = {}, children = []) {
  const node = document.createElement(name);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else node.setAttribute(key, String(value));
  }
  for (const child of [].concat(children)) {
    if (child == null) continue;
    node.appendChild(typeof child === 'string'
      ? document.createTextNode(child) : child);
  }
  return node;
}

/** Linear scale from a data domain to a pixel range. */
export function scaleLinear(domain, range) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = (d1 - d0) || 1;
  const fn = (v) => r0 + ((v - d0) / span) * (r1 - r0);
  fn.invert = (p) => d0 + ((p - r0) / ((r1 - r0) || 1)) * span;
  fn.domain = domain;
  fn.range = range;
  return fn;
}

/** Band scale for categorical axes. */
export function scaleBand(keys, range, padding = 0.2) {
  const [r0, r1] = range;
  const n = Math.max(1, keys.length);
  const step = (r1 - r0) / n;
  const bandwidth = step * (1 - padding);
  const offset = (step - bandwidth) / 2;
  const index = new Map(keys.map((k, i) => [k, i]));
  const fn = (key) => r0 + index.get(key) * step + offset;
  fn.bandwidth = () => bandwidth;
  fn.step = () => step;
  fn.centre = (key) => fn(key) + bandwidth / 2;
  return fn;
}

/** "Nice" tick values covering a domain. */
export function ticks(min, max, count = 5) {
  if (!isFinite(min) || !isFinite(max)) return [0];
  if (min === max) return [min];
  const span = max - min;
  const rough = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  const step = (norm >= 7.5 ? 10 : norm >= 3.5 ? 5 : norm >= 1.5 ? 2 : 1) * mag;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) {
    out.push(Math.round(v / step) * step);
  }
  return out;
}

export function extent(values) {
  let lo = Infinity; let hi = -Infinity;
  for (const v of values) {
    if (v == null || !isFinite(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return lo === Infinity ? [0, 1] : [lo, hi];
}

/**
 * A rounded-end bar path: only the two corners at the data end are rounded, so
 * the bar stays visually anchored to its baseline.
 */
export function barPath(x, y, w, hgt, r = 4, direction = 'up') {
  const radius = Math.max(0, Math.min(r, w / 2, Math.abs(hgt) / 2));
  if (radius < 0.5 || Math.abs(hgt) < 1) return `M${x},${y}h${w}v${hgt}h${-w}Z`;
  const R = radius;
  switch (direction) {
    // Grows upward: rounded at the top, square on the baseline.
    case 'up':
      return `M${x},${y + hgt}L${x},${y + R}Q${x},${y} ${x + R},${y}` +
             `L${x + w - R},${y}Q${x + w},${y} ${x + w},${y + R}` +
             `L${x + w},${y + hgt}Z`;
    // Grows downward from the baseline at y: rounded at the bottom.
    case 'down':
      return `M${x},${y}L${x},${y + hgt - R}Q${x},${y + hgt} ${x + R},${y + hgt}` +
             `L${x + w - R},${y + hgt}Q${x + w},${y + hgt} ${x + w},${y + hgt - R}` +
             `L${x + w},${y}Z`;
    // Grows rightward from x: rounded at the right end.
    case 'right':
      return `M${x},${y}L${x + w - R},${y}Q${x + w},${y} ${x + w},${y + R}` +
             `L${x + w},${y + hgt - R}Q${x + w},${y + hgt} ${x + w - R},${y + hgt}` +
             `L${x},${y + hgt}Z`;
    // Grows leftward, anchored at x + w: rounded at the left end.
    default:
      return `M${x + w},${y}L${x + R},${y}Q${x},${y} ${x},${y + R}` +
             `L${x},${y + hgt - R}Q${x},${y + hgt} ${x + R},${y + hgt}` +
             `L${x + w},${y + hgt}Z`;
  }
}

/** Smooth-ish line path through points (monotone-safe: plain polyline). */
export function linePath(points) {
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(2)},${p[1].toFixed(2)}`)
    .join('');
}

/* --------------------------------------------------------------------------
   Tooltip layer
   -------------------------------------------------------------------------- */
export function createTooltip(container) {
  const tip = h('div', { class: 'tooltip', role: 'status', 'aria-live': 'polite' });
  container.appendChild(tip);
  let raf = null;

  function show(html, clientX, clientY) {
    tip.innerHTML = html;
    tip.dataset.show = 'true';
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const box = container.getBoundingClientRect();
      const w = tip.offsetWidth;
      const hgt = tip.offsetHeight;
      let x = clientX - box.left + 12;
      let y = clientY - box.top - hgt - 10;
      if (x + w > box.width) x = clientX - box.left - w - 12;
      if (x < 0) x = 4;
      if (y < 0) y = clientY - box.top + 16;
      tip.style.transform = `translate(${x}px, ${y}px)`;
    });
  }
  function hide() { tip.dataset.show = 'false'; }
  return { show, hide, node: tip };
}

export function tooltipHTML(title, rows) {
  const body = rows
    .filter(Boolean)
    .map(([k, v]) => `<div class="tooltip__row"><span>${k}</span><b>${v}</b></div>`)
    .join('');
  return `<div class="tooltip__title">${title}</div>${body}`;
}

/* --------------------------------------------------------------------------
   Figure scaffold: title, chart / table toggle, legend
   -------------------------------------------------------------------------- */

/**
 * Wrap a chart in a figure with an accessible table alternative.
 *
 * Every chart on this site ships a table view. Three of the light-mode series
 * colours sit below 3:1 contrast against the page, and the palette's relief
 * rule requires either visible direct labels or a table view - so the toggle is
 * not optional decoration, it is the accessibility contract.
 */
export function figure({ title, note, render, table, legend, id }) {
  const figureId = id || nextId('fig');
  const wrap = h('div', { class: 'chart-figure' });

  if (title) {
    const head = h('div', { class: 'card__head' }, [
      h('h3', { text: title, id: `${figureId}-title` }),
    ]);
    const toggle = h('div', { class: 'seg', role: 'group', 'aria-label': `${title} view` });
    const chartBtn = h('button', { type: 'button', text: 'Chart', 'aria-pressed': 'true' });
    const tableBtn = h('button', { type: 'button', text: 'Table', 'aria-pressed': 'false' });
    toggle.append(chartBtn, tableBtn);
    if (table) head.appendChild(toggle);
    wrap.appendChild(head);

    if (note) wrap.appendChild(h('p', { class: 'card__note', text: note }));

    const chartHost = h('div', { class: 'chart' });
    const tableHost = h('div', { class: 'table-wrap', hidden: 'hidden' });
    wrap.append(chartHost, tableHost);

    render(chartHost);
    if (legend) wrap.appendChild(legend);

    if (table) {
      let built = false;
      const swap = (showTable) => {
        chartBtn.setAttribute('aria-pressed', String(!showTable));
        tableBtn.setAttribute('aria-pressed', String(showTable));
        chartHost.hidden = showTable;
        if (legend) legend.hidden = showTable;
        tableHost.hidden = !showTable;
        if (showTable && !built) { tableHost.appendChild(table()); built = true; }
      };
      chartBtn.addEventListener('click', () => swap(false));
      tableBtn.addEventListener('click', () => swap(true));
    }
    return wrap;
  }

  const chartHost = h('div', { class: 'chart' });
  wrap.appendChild(chartHost);
  render(chartHost);
  if (legend) wrap.appendChild(legend);
  return wrap;
}

export function legendFor(items) {
  const box = h('div', { class: 'legend' });
  for (const { label, colour } of items) {
    box.appendChild(h('span', { class: 'legend__item' }, [
      h('span', { class: 'legend__swatch', style: `background:${colour}` }),
      document.createTextNode(label),
    ]));
  }
  return box;
}

/** Read a CSS custom property from the document root. */
export function token(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
