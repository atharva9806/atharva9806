/**
 * The chart set.
 *
 * Form follows the data's job:
 *   barChart / groupedBar  magnitude across categories
 *   lineChart              change over time (career progression, rolling form)
 *   scatterChart           two measures against each other (average vs tempo)
 *   radarChart             one player's shape across percentile axes
 *   heatmap                magnitude or polarity across a two-way matrix
 *   donutChart             parts of one whole (how a batter gets out)
 *   distributionStrip      one value located inside its cohort's spread
 */
import {
  barPath, createTooltip, el, extent, legendFor, linePath,
  scaleBand, scaleLinear, ticks, token, tooltipHTML,
} from './core.js';

const FONT_AXIS = 11;

function svgRoot(host, width, height, title) {
  const svg = el('svg', {
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': title || 'chart',
    preserveAspectRatio: 'xMidYMid meet',
  });
  host.appendChild(svg);
  return svg;
}

function yAxis(svg, scale, area, { format = String, title = null, count = 5 } = {}) {
  const [lo, hi] = scale.domain;
  const group = el('g', { 'aria-hidden': 'true' });
  for (const t of ticks(lo, hi, count)) {
    const y = scale(t);
    if (y < area.top - 1 || y > area.bottom + 1) continue;
    group.appendChild(el('line', {
      class: 'grid-line', x1: area.left, x2: area.right, y1: y, y2: y,
    }));
    group.appendChild(el('text', {
      class: 'axis-label', x: area.left - 7, y: y + 4, 'text-anchor': 'end',
    }, format(t)));
  }
  if (title) {
    group.appendChild(el('text', {
      class: 'axis-title', x: -(area.top + area.bottom) / 2, y: 12,
      transform: 'rotate(-90)', 'text-anchor': 'middle',
    }, title));
  }
  svg.appendChild(group);
}

/** Drop every other label when they would collide. */
function thinLabels(keys, available, perLabel = 54) {
  const max = Math.max(1, Math.floor(available / perLabel));
  const stride = Math.ceil(keys.length / max);
  return new Set(keys.filter((_, i) => i % stride === 0));
}

/* ==========================================================================
   Bar chart
   ========================================================================== */
export function barChart(host, {
  data, width = 640, height = 300, valueKey = 'value', labelKey = 'label',
  colour = null, format = (v) => v.toFixed(1), valueLabel = 'Value',
  horizontal = false, showValues = true, baseline = null, baselineLabel = 'Career',
}) {
  // Horizontal bars carry their category name in the left margin, so that
  // margin has to fit the longest one. 11px system sans averages ~6.3px per
  // character; the cap stops one very long label eating the plot area.
  const longest = horizontal
    ? Math.max(0, ...data.map((d) => String(d[labelKey] ?? '').length)) : 0;
  const labelGutter = Math.min(230, Math.max(90, longest * 6.3 + 14));
  const area = horizontal
    ? { left: labelGutter, right: width - 46, top: 8, bottom: height - 26 }
    : { left: 46, right: width - 10, top: 12, bottom: height - 46 };
  const svg = svgRoot(host, width, height, valueLabel);
  const tip = createTooltip(host);
  const values = data.map((d) => d[valueKey] ?? 0);
  const minV = Math.min(0, ...values);
  const maxV = Math.max(0, ...values) * 1.08 || 1;
  // A measure that goes negative has to be drawn from a zero line, not from the
  // left edge - otherwise every negative bar silently renders as nothing.
  const diverging = minV < 0;
  const lowV = diverging ? minV * 1.08 : 0;
  const surface = token('--surface-1');

  if (horizontal) {
    const y = scaleBand(data.map((d) => d[labelKey]), [area.top, area.bottom], 0.28);
    // Reserve room at the left for value labels sitting outside a negative bar,
    // otherwise they collide with the category names.
    const gutter = diverging && showValues ? 46 : 0;
    const x = scaleLinear([lowV, maxV], [area.left + gutter, area.right]);
    const zero = x(0);
    for (const t of ticks(lowV, maxV, 4)) {
      svg.appendChild(el('line', {
        class: 'grid-line', x1: x(t), x2: x(t), y1: area.top, y2: area.bottom,
      }));
      svg.appendChild(el('text', {
        class: 'axis-label', x: x(t), y: area.bottom + 16, 'text-anchor': 'middle',
      }, format(t)));
    }
    if (diverging) {
      svg.appendChild(el('line', {
        class: 'axis-line', x1: zero, x2: zero, y1: area.top, y2: area.bottom,
        'stroke-width': 1.5,
      }));
    }
    data.forEach((d) => {
      const v = d[valueKey] ?? 0;
      const origin = diverging ? zero : area.left + gutter;
      const start = Math.min(origin, x(v));
      const w = Math.max(1, Math.abs(x(v) - origin));
      const fill = d.colour || (typeof colour === 'function' ? colour(d) : colour) || token('--series-1');
      const bar = el('path', {
        class: 'mark',
        d: barPath(start, y(d[labelKey]), w, y.bandwidth(), 4,
          diverging && v < 0 ? 'left' : 'right'),
        fill, tabindex: '0', role: 'listitem',
        'aria-label': `${d[labelKey]}: ${format(v)}`,
      });
      const showTip = (ev) => tip.show(tooltipHTML(d[labelKey],
        [[valueLabel, format(v)], ...(d.detail || [])]), ev.clientX, ev.clientY);
      bar.addEventListener('mousemove', showTip);
      bar.addEventListener('mouseleave', tip.hide);
      bar.addEventListener('focus', (ev) => {
        const r = bar.getBoundingClientRect();
        showTip({ clientX: r.right, clientY: r.top });
      });
      bar.addEventListener('blur', tip.hide);
      svg.appendChild(bar);
      svg.appendChild(el('text', {
        class: 'axis-label', x: area.left - 8, y: y.centre(d[labelKey]) + 4,
        'text-anchor': 'end',
      }, d[labelKey]));
      if (showValues) {
        // Direct-label every bar, on the outside of its own data end.
        svg.appendChild(el('text', {
          class: 'mark-label',
          x: v < 0 && diverging ? start - 6 : start + w + 6,
          y: y.centre(d[labelKey]) + 4,
          'text-anchor': v < 0 && diverging ? 'end' : 'start',
        }, format(v)));
      }
    });
    if (baseline != null) {
      const bx = x(baseline);
      svg.appendChild(el('line', {
        x1: bx, x2: bx, y1: area.top - 2, y2: area.bottom + 2,
        stroke: token('--text-muted'), 'stroke-width': 1.5, 'stroke-dasharray': '4 3',
      }));
      svg.appendChild(el('text', {
        class: 'axis-label', x: bx, y: area.top - 6, 'text-anchor': 'middle',
      }, baselineLabel));
    }
    return svg;
  }

  const x = scaleBand(data.map((d) => d[labelKey]), [area.left, area.right], 0.26);
  const y = scaleLinear([0, maxV], [area.bottom, area.top]);
  yAxis(svg, y, area, { format });
  const keep = thinLabels(data.map((d) => d[labelKey]), area.right - area.left, 62);

  data.forEach((d) => {
    const v = d[valueKey] ?? 0;
    const top = y(v);
    const fill = d.colour || (typeof colour === 'function' ? colour(d) : colour) || token('--series-1');
    const bar = el('path', {
      class: 'mark', d: barPath(x(d[labelKey]), top, x.bandwidth(), area.bottom - top, 4, 'up'),
      fill, tabindex: '0', 'aria-label': `${d[labelKey]}: ${format(v)}`,
      stroke: surface, 'stroke-width': 1,
    });
    const showTip = (ev) => tip.show(tooltipHTML(d.fullLabel || d[labelKey],
      [[valueLabel, format(v)], ...(d.detail || [])]), ev.clientX, ev.clientY);
    bar.addEventListener('mousemove', showTip);
    bar.addEventListener('mouseleave', tip.hide);
    bar.addEventListener('focus', () => {
      const r = bar.getBoundingClientRect();
      showTip({ clientX: r.left + r.width / 2, clientY: r.top });
    });
    bar.addEventListener('blur', tip.hide);
    svg.appendChild(bar);
    if (keep.has(d[labelKey])) {
      svg.appendChild(el('text', {
        class: 'axis-label', x: x.centre(d[labelKey]), y: area.bottom + 16,
        'text-anchor': 'middle',
      }, d.shortLabel || d[labelKey]));
    }
    if (showValues && x.bandwidth() > 26) {
      svg.appendChild(el('text', {
        class: 'mark-label', x: x.centre(d[labelKey]), y: top - 5, 'text-anchor': 'middle',
      }, format(v)));
    }
  });

  if (baseline != null) {
    const by = y(baseline);
    svg.appendChild(el('line', {
      x1: area.left, x2: area.right, y1: by, y2: by,
      stroke: token('--text-muted'), 'stroke-width': 1.5, 'stroke-dasharray': '4 3',
    }));
    svg.appendChild(el('text', {
      class: 'axis-label', x: area.right, y: by - 5, 'text-anchor': 'end',
    }, `${baselineLabel} ${format(baseline)}`));
  }
  return svg;
}

/* ==========================================================================
   Grouped bar chart - two series side by side
   ========================================================================== */
export function groupedBar(host, {
  data, series, width = 640, height = 300, format = (v) => v.toFixed(1),
}) {
  const area = { left: 46, right: width - 10, top: 12, bottom: height - 46 };
  const svg = svgRoot(host, width, height, series.map((s) => s.label).join(' vs '));
  const tip = createTooltip(host);
  const all = data.flatMap((d) => series.map((s) => d[s.key] ?? 0));
  const y = scaleLinear([0, Math.max(...all, 1) * 1.1], [area.bottom, area.top]);
  const x = scaleBand(data.map((d) => d.label), [area.left, area.right], 0.28);
  const inner = scaleBand(series.map((s) => s.key), [0, x.bandwidth()], 0.12);
  yAxis(svg, y, area, { format });
  const keep = thinLabels(data.map((d) => d.label), area.right - area.left, 70);
  const surface = token('--surface-1');

  data.forEach((d) => {
    series.forEach((s) => {
      const v = d[s.key] ?? 0;
      const top = y(v);
      const bx = x(d.label) + inner(s.key);
      const bar = el('path', {
        class: 'mark',
        d: barPath(bx, top, inner.bandwidth(), area.bottom - top, 3, 'up'),
        fill: s.colour, tabindex: '0',
        'aria-label': `${d.label} ${s.label}: ${format(v)}`,
        stroke: surface, 'stroke-width': 1,
      });
      const showTip = (ev) => tip.show(tooltipHTML(d.label,
        series.map((ss) => [ss.label, format(d[ss.key] ?? 0)])), ev.clientX, ev.clientY);
      bar.addEventListener('mousemove', showTip);
      bar.addEventListener('mouseleave', tip.hide);
      bar.addEventListener('focus', () => {
        const r = bar.getBoundingClientRect();
        showTip({ clientX: r.left + r.width / 2, clientY: r.top });
      });
      bar.addEventListener('blur', tip.hide);
      svg.appendChild(bar);
    });
    if (keep.has(d.label)) {
      svg.appendChild(el('text', {
        class: 'axis-label', x: x.centre(d.label), y: area.bottom + 16,
        'text-anchor': 'middle',
      }, d.shortLabel || d.label));
    }
  });
  return svg;
}

/* ==========================================================================
   Line chart - with a shared crosshair and tooltip
   ========================================================================== */
export function lineChart(host, {
  series, width = 680, height = 300, format = (v) => v.toFixed(1),
  xFormat = String, yTitle = null, area: showArea = false, markers = true,
  xTickValues = null,
}) {
  const area = { left: 48, right: width - 12, top: 14, bottom: height - 40 };
  const svg = svgRoot(host, width, height, yTitle || 'trend');
  const tip = createTooltip(host);

  const xs = series.flatMap((s) => s.points.map((p) => p.x));
  const ys = series.flatMap((s) => s.points.map((p) => p.y).filter((v) => v != null));
  const [x0, x1] = extent(xs);
  const [, y1] = extent(ys);
  const y0 = Math.min(0, extent(ys)[0]);
  const x = scaleLinear([x0, x1], [area.left, area.right]);
  const y = scaleLinear([y0, y1 * 1.08 || 1], [area.bottom, area.top]);
  yAxis(svg, y, area, { format, title: yTitle });

  // Callers with a discrete x axis (seasons, innings numbers) pass their own
  // tick values. Generated ticks land on fractional positions, and a formatter
  // that rounds them then prints "2012" at x = 2011.5 - a label that does not
  // sit above the thing it names.
  const maxTicks = Math.min(10, Math.max(2, Math.round((area.right - area.left) / 80)));
  let xTicks;
  if (xTickValues && xTickValues.length) {
    const stride = Math.ceil(xTickValues.length / maxTicks);
    xTicks = xTickValues.filter((_, i) => i % stride === 0);
  } else {
    xTicks = ticks(x0, x1, maxTicks);
  }
  for (const t of xTicks) {
    if (t < x0 || t > x1) continue;
    svg.appendChild(el('text', {
      class: 'axis-label', x: x(t), y: area.bottom + 16, 'text-anchor': 'middle',
    }, xFormat(t)));
  }
  svg.appendChild(el('line', {
    class: 'axis-line', x1: area.left, x2: area.right, y1: area.bottom, y2: area.bottom,
  }));

  const crosshair = el('line', {
    y1: area.top, y2: area.bottom, stroke: token('--axis'),
    'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: 0,
  });
  svg.appendChild(crosshair);

  series.forEach((s) => {
    const pts = s.points.filter((p) => p.y != null).map((p) => [x(p.x), y(p.y)]);
    if (!pts.length) return;
    if (showArea && series.length === 1) {
      svg.appendChild(el('path', {
        d: `${linePath(pts)}L${pts[pts.length - 1][0]},${area.bottom}L${pts[0][0]},${area.bottom}Z`,
        fill: s.colour, opacity: 0.10,
      }));
    }
    svg.appendChild(el('path', {
      class: 'series-line', d: linePath(pts), stroke: s.colour,
      'stroke-dasharray': s.dashed ? '5 4' : null,
    }));
    if (markers && pts.length <= 40) {
      pts.forEach(([px, py]) => svg.appendChild(el('circle', {
        cx: px, cy: py, r: 3.5, fill: s.colour, class: 'ring',
      })));
    }
  });

  // One crosshair for all series: hovering anywhere reads every series at that x.
  const primary = series.find((s) => s.points.length) || series[0];
  const hit = el('rect', {
    x: area.left, y: area.top, width: Math.max(1, area.right - area.left),
    height: Math.max(1, area.bottom - area.top), fill: 'transparent',
    style: 'cursor:crosshair',
  });
  hit.addEventListener('mousemove', (ev) => {
    const box = svg.getBoundingClientRect();
    const px = ((ev.clientX - box.left) / box.width) * width;
    const value = x.invert(px);
    let best = null;
    for (const p of primary.points) {
      if (best === null || Math.abs(p.x - value) < Math.abs(best.x - value)) best = p;
    }
    if (!best) return;
    crosshair.setAttribute('x1', x(best.x));
    crosshair.setAttribute('x2', x(best.x));
    crosshair.setAttribute('opacity', 1);
    const rows = series.map((s) => {
      const match = s.points.find((p) => p.x === best.x);
      return match && match.y != null ? [s.label, format(match.y)] : null;
    }).filter(Boolean);
    if (best.note) rows.push(['', best.note]);
    tip.show(tooltipHTML(xFormat(best.x), rows), ev.clientX, ev.clientY);
  });
  hit.addEventListener('mouseleave', () => {
    crosshair.setAttribute('opacity', 0);
    tip.hide();
  });
  svg.appendChild(hit);
  return svg;
}

/* ==========================================================================
   Scatter
   ========================================================================== */
export function scatterChart(host, {
  points, width = 640, height = 400, xLabel = 'x', yLabel = 'y',
  xFormat = (v) => v.toFixed(0), yFormat = (v) => v.toFixed(0),
  highlight = null, onSelect = null,
}) {
  const area = { left: 52, right: width - 14, top: 16, bottom: height - 44 };
  const svg = svgRoot(host, width, height, `${yLabel} against ${xLabel}`);
  const tip = createTooltip(host);
  const [xl, xh] = extent(points.map((p) => p.x));
  const [yl, yh] = extent(points.map((p) => p.y));
  const padX = (xh - xl) * 0.06 || 1;
  const padY = (yh - yl) * 0.08 || 1;
  const x = scaleLinear([xl - padX, xh + padX], [area.left, area.right]);
  const y = scaleLinear([yl - padY, yh + padY], [area.bottom, area.top]);
  yAxis(svg, y, area, { format: yFormat, title: yLabel });

  for (const t of ticks(xl - padX, xh + padX, 6)) {
    svg.appendChild(el('line', {
      class: 'grid-line', x1: x(t), x2: x(t), y1: area.top, y2: area.bottom,
    }));
    svg.appendChild(el('text', {
      class: 'axis-label', x: x(t), y: area.bottom + 16, 'text-anchor': 'middle',
    }, xFormat(t)));
  }
  svg.appendChild(el('text', {
    class: 'axis-title', x: (area.left + area.right) / 2, y: height - 6,
    'text-anchor': 'middle',
  }, xLabel));

  const base = token('--series-1');
  const accent = token('--series-2');
  points.forEach((p) => {
    const isHi = highlight && p.id === highlight;
    const dot = el('circle', {
      class: 'mark ring', cx: x(p.x), cy: y(p.y), r: isHi ? 8 : 5.5,
      fill: isHi ? accent : base, opacity: isHi ? 1 : 0.78,
      tabindex: '0', 'aria-label': `${p.label}: ${xLabel} ${xFormat(p.x)}, ${yLabel} ${yFormat(p.y)}`,
      style: onSelect ? 'cursor:pointer' : null,
    });
    const showTip = (ev) => tip.show(tooltipHTML(p.label,
      [[xLabel, xFormat(p.x)], [yLabel, yFormat(p.y)], ...(p.detail || [])]),
    ev.clientX, ev.clientY);
    dot.addEventListener('mousemove', showTip);
    dot.addEventListener('mouseleave', tip.hide);
    dot.addEventListener('focus', () => {
      const r = dot.getBoundingClientRect();
      showTip({ clientX: r.left + r.width / 2, clientY: r.top });
    });
    dot.addEventListener('blur', tip.hide);
    if (onSelect) {
      dot.addEventListener('click', () => onSelect(p));
      dot.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onSelect(p); }
      });
    }
    svg.appendChild(dot);
    if (isHi) {
      svg.appendChild(el('text', {
        class: 'mark-label', x: x(p.x), y: y(p.y) - 13, 'text-anchor': 'middle',
      }, p.label));
    }
  });
  return svg;
}

/* ==========================================================================
   Radar - a player's percentile shape
   ========================================================================== */
export function radarChart(host, { axes, series, width = 420, height = 380 }) {
  const cx = width / 2;
  const cy = height / 2 + 4;

  // Axis labels sit outside the outermost ring, anchored start or end, so the
  // widest *rendered line* decides how much room the polygon can have. Wrap
  // first, then measure: estimating from the raw label length assumed a wrap
  // that only happens for three-word labels, and "Boundary hitting" ran off
  // the left edge.
  const wrapped = axes.map((axis) => {
    const words = axis.label.split(' ');
    if (words.length <= 2) return [axis.label];
    const half = Math.ceil(words.length / 2);
    return [words.slice(0, half).join(' '), words.slice(half).join(' ')];
  });
  const CHAR_PX = 6.3;
  const widestLine = Math.max(0, ...wrapped.flat().map((line) => line.length));
  const labelRoom = Math.min(150, widestLine * CHAR_PX + 14);
  const radius = Math.max(60, Math.min(width / 2 - labelRoom, height / 2 - 46));
  const svg = svgRoot(host, width, height, 'percentile profile');
  const tip = createTooltip(host);
  const n = axes.length;
  if (!n) return svg;
  const angle = (i) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const at = (i, r) => [cx + Math.cos(angle(i)) * r, cy + Math.sin(angle(i)) * r];

  for (const level of [25, 50, 75, 100]) {
    const r = (level / 100) * radius;
    svg.appendChild(el('polygon', {
      points: axes.map((_, i) => at(i, r).join(',')).join(' '),
      fill: 'none', class: 'grid-line',
    }));
  }
  axes.forEach((axis, i) => {
    const [ex, ey] = at(i, radius);
    svg.appendChild(el('line', { class: 'grid-line', x1: cx, y1: cy, x2: ex, y2: ey }));
    const [lx, ly] = at(i, radius + 18);
    const anchor = Math.abs(lx - cx) < 6 ? 'middle' : (lx > cx ? 'start' : 'end');
    const lines = wrapped[i];
    lines.forEach((line, li) => {
      svg.appendChild(el('text', {
        class: 'axis-label', x: lx, y: ly + li * 12 - (lines.length - 1) * 5,
        'text-anchor': anchor,
      }, line));
    });
  });

  series.forEach((s) => {
    const pts = axes.map((axis, i) => at(i, ((s.values[axis.key] ?? 0) / 100) * radius));
    svg.appendChild(el('polygon', {
      points: pts.map((p) => p.join(',')).join(' '),
      fill: s.colour, 'fill-opacity': s.fill === false ? 0 : 0.16,
      stroke: s.colour, 'stroke-width': 2,
      'stroke-dasharray': s.dashed ? '5 4' : null,
    }));
    if (s.dashed) return;
    pts.forEach(([px, py], i) => {
      const dot = el('circle', {
        class: 'mark ring', cx: px, cy: py, r: 4.5, fill: s.colour, tabindex: '0',
        'aria-label': `${axes[i].label}: ${Math.round(s.values[axes[i].key] ?? 0)}th percentile`,
      });
      const showTip = (ev) => tip.show(tooltipHTML(axes[i].label, [
        ['Percentile', `${Math.round(s.values[axes[i].key] ?? 0)}th`],
        axes[i].raw ? [axes[i].rawLabel || 'Value', axes[i].raw] : null,
      ]), ev.clientX, ev.clientY);
      dot.addEventListener('mousemove', showTip);
      dot.addEventListener('mouseleave', tip.hide);
      dot.addEventListener('focus', () => {
        const r = dot.getBoundingClientRect();
        showTip({ clientX: r.left + r.width / 2, clientY: r.top });
      });
      dot.addEventListener('blur', tip.hide);
      svg.appendChild(dot);
    });
  });
  return svg;
}

/* ==========================================================================
   Heatmap - diverging around a midpoint, or sequential
   ========================================================================== */
export function heatmap(host, {
  rows, cols, cells, width = 700, cellHeight = 34, rowLabel = (r) => r,
  colLabel = (c) => c, format = (v) => v.toFixed(1), midpoint = null,
  valueLabel = 'Value', onSelect = null,
}) {
  const left = 150;
  const top = 40;
  const height = top + rows.length * cellHeight + 12;
  const cellWidth = Math.max(30, (width - left - 12) / Math.max(1, cols.length));
  const svg = svgRoot(host, width, height, 'matchup matrix');
  const tip = createTooltip(host);
  const surface = token('--surface-1');

  const values = cells.map((c) => c.value).filter((v) => v != null);
  const [lo, hi] = extent(values);
  const diverging = midpoint != null;
  const seq = ['--seq-100', '--seq-200', '--seq-300', '--seq-400',
    '--seq-500', '--seq-600', '--seq-700'].map(token);
  const div = ['--div-neg-3', '--div-neg-2', '--div-neg-1', '--div-mid',
    '--div-pos-1', '--div-pos-2', '--div-pos-3'].map(token);

  function colourFor(v) {
    if (v == null) return 'transparent';
    if (diverging) {
      const spread = Math.max(Math.abs(hi - midpoint), Math.abs(midpoint - lo)) || 1;
      const t = Math.max(-1, Math.min(1, (v - midpoint) / spread));
      const idx = Math.round((t + 1) / 2 * (div.length - 1));
      return div[idx];
    }
    const t = (v - lo) / ((hi - lo) || 1);
    return seq[Math.round(t * (seq.length - 1))];
  }

  cols.forEach((c, i) => {
    svg.appendChild(el('text', {
      class: 'axis-label', x: left + i * cellWidth + cellWidth / 2, y: top - 12,
      'text-anchor': 'middle',
    }, colLabel(c)));
  });

  const lookup = new Map(cells.map((c) => [`${c.row}|${c.col}`, c]));
  rows.forEach((r, ri) => {
    const y = top + ri * cellHeight;
    svg.appendChild(el('text', {
      class: 'axis-label', x: left - 8, y: y + cellHeight / 2 + 4, 'text-anchor': 'end',
    }, rowLabel(r)));
    cols.forEach((c, ci) => {
      const cell = lookup.get(`${r}|${c}`);
      const x = left + ci * cellWidth;
      const rect = el('rect', {
        class: 'mark', x: x + 1, y: y + 1,
        width: cellWidth - 2, height: cellHeight - 2, rx: 4,
        fill: cell && cell.value != null ? colourFor(cell.value) : 'transparent',
        stroke: cell && cell.value != null ? surface : token('--gridline'),
        'stroke-width': cell && cell.value != null ? 2 : 1,
        'stroke-dasharray': cell && cell.value != null ? null : '3 3',
        tabindex: cell && cell.value != null ? '0' : null,
        'aria-label': cell && cell.value != null
          ? `${rowLabel(r)} against ${colLabel(c)}: ${format(cell.value)}`
          : `${rowLabel(r)} against ${colLabel(c)}: not enough data`,
        style: onSelect && cell ? 'cursor:pointer' : null,
      });
      if (cell && cell.value != null) {
        const showTip = (ev) => tip.show(tooltipHTML(`${rowLabel(r)} v ${colLabel(c)}`,
          [[valueLabel, format(cell.value)], ...(cell.detail || [])]), ev.clientX, ev.clientY);
        rect.addEventListener('mousemove', showTip);
        rect.addEventListener('mouseleave', tip.hide);
        rect.addEventListener('focus', () => {
          const b = rect.getBoundingClientRect();
          showTip({ clientX: b.left + b.width / 2, clientY: b.top });
        });
        rect.addEventListener('blur', tip.hide);
        if (onSelect) rect.addEventListener('click', () => onSelect(cell));
      }
      svg.appendChild(rect);
      // Direct labels: the cell value is always legible without relying on hue.
      if (cell && cell.value != null && cellWidth > 42) {
        const t = diverging
          ? Math.abs(cell.value - midpoint) /
            (Math.max(Math.abs(hi - midpoint), Math.abs(midpoint - lo)) || 1)
          : (cell.value - lo) / ((hi - lo) || 1);
        svg.appendChild(el('text', {
          x: x + cellWidth / 2, y: y + cellHeight / 2 + 4, 'text-anchor': 'middle',
          'font-size': 11, 'font-weight': 600, 'pointer-events': 'none',
          fill: t > 0.55 ? '#ffffff' : token('--text-primary'),
        }, format(cell.value)));
      }
    });
  });
  return svg;
}

/* ==========================================================================
   Donut - parts of one whole
   ========================================================================== */
export function donutChart(host, { data, width = 300, height = 240, centreLabel = '' }) {
  const cx = width / 2;
  const cy = height / 2;
  const outer = Math.min(width, height) / 2 - 12;
  const inner = outer * 0.62;
  const svg = svgRoot(host, width, height, 'breakdown');
  const tip = createTooltip(host);
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const surface = token('--surface-1');
  let angle = -Math.PI / 2;

  data.forEach((d) => {
    const sweep = (d.value / total) * Math.PI * 2;
    // A 2px surface gap between segments, per the mark spec.
    const gap = Math.min(0.03, sweep * 0.08);
    const a0 = angle + gap / 2;
    const a1 = angle + sweep - gap / 2;
    const large = sweep > Math.PI ? 1 : 0;
    const p = (r, a) => `${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}`;
    const path = el('path', {
      class: 'mark',
      d: `M${p(outer, a0)}A${outer},${outer} 0 ${large} 1 ${p(outer, a1)}` +
         `L${p(inner, a1)}A${inner},${inner} 0 ${large} 0 ${p(inner, a0)}Z`,
      fill: d.colour, stroke: surface, 'stroke-width': 2, tabindex: '0',
      'aria-label': `${d.label}: ${d.value} (${((d.value / total) * 100).toFixed(0)}%)`,
    });
    const showTip = (ev) => tip.show(tooltipHTML(d.label, [
      ['Count', d.value], ['Share', `${((d.value / total) * 100).toFixed(1)}%`],
    ]), ev.clientX, ev.clientY);
    path.addEventListener('mousemove', showTip);
    path.addEventListener('mouseleave', tip.hide);
    path.addEventListener('focus', () => {
      const r = path.getBoundingClientRect();
      showTip({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
    });
    path.addEventListener('blur', tip.hide);
    svg.appendChild(path);
    angle += sweep;
  });

  if (centreLabel) {
    svg.appendChild(el('text', {
      x: cx, y: cy - 2, 'text-anchor': 'middle', 'font-size': 20,
      'font-weight': 680, fill: token('--text-primary'),
    }, String(total)));
    svg.appendChild(el('text', {
      class: 'axis-label', x: cx, y: cy + 15, 'text-anchor': 'middle',
    }, centreLabel));
  }
  return svg;
}

/* ==========================================================================
   Distribution strip - one value located inside its cohort
   ========================================================================== */
export function distributionStrip(host, {
  quartiles, value, width = 300, height = 62, format = (v) => v.toFixed(1),
  label = '', higherIsBetter = true,
}) {
  const area = { left: 8, right: width - 8, top: 18, bottom: 38 };
  const svg = svgRoot(host, width, height, `${label} against the cohort spread`);
  const tip = createTooltip(host);
  const lo = Math.min(quartiles.p10, value);
  const hi = Math.max(quartiles.p90, value);
  const pad = (hi - lo) * 0.12 || 1;
  const x = scaleLinear([lo - pad, hi + pad], [area.left, area.right]);
  const mid = (area.top + area.bottom) / 2;

  svg.appendChild(el('line', {
    x1: x(quartiles.p10), x2: x(quartiles.p90), y1: mid, y2: mid,
    stroke: token('--gridline'), 'stroke-width': 6, 'stroke-linecap': 'round',
  }));
  svg.appendChild(el('rect', {
    x: x(quartiles.p25), y: area.top + 2, width: Math.max(2, x(quartiles.p75) - x(quartiles.p25)),
    height: area.bottom - area.top - 4, rx: 4, fill: token('--axis'), opacity: 0.45,
  }));
  svg.appendChild(el('line', {
    x1: x(quartiles.p50), x2: x(quartiles.p50), y1: area.top, y2: area.bottom,
    stroke: token('--text-muted'), 'stroke-width': 2,
  }));

  const better = higherIsBetter ? value >= quartiles.p50 : value <= quartiles.p50;
  const marker = el('circle', {
    class: 'mark ring', cx: x(value), cy: mid, r: 7,
    fill: token(better ? '--series-1' : '--series-2'), tabindex: '0',
    'aria-label': `${label}: ${format(value)}, cohort median ${format(quartiles.p50)}`,
  });
  const showTip = (ev) => tip.show(tooltipHTML(label || 'This player', [
    ['This player', format(value)],
    ['Cohort median', format(quartiles.p50)],
    ['Middle 50%', `${format(quartiles.p25)} - ${format(quartiles.p75)}`],
    ['n', quartiles.n],
  ]), ev.clientX, ev.clientY);
  marker.addEventListener('mousemove', showTip);
  marker.addEventListener('mouseleave', tip.hide);
  marker.addEventListener('focus', () => {
    const r = marker.getBoundingClientRect();
    showTip({ clientX: r.left + r.width / 2, clientY: r.top });
  });
  marker.addEventListener('blur', tip.hide);
  svg.appendChild(marker);

  svg.appendChild(el('text', {
    class: 'mark-label', x: x(value), y: area.top - 5, 'text-anchor': 'middle',
  }, format(value)));
  svg.appendChild(el('text', {
    class: 'axis-label', x: x(quartiles.p50), y: area.bottom + 14, 'text-anchor': 'middle',
  }, `median ${format(quartiles.p50)}`));
  return svg;
}

export { legendFor };
