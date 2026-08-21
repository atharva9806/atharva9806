/**
 * Sortable, filterable, paginated data tables with CSV export.
 *
 * Columns declare how to get a value, how to render it, and how to sort it.
 * Nulls always sort last regardless of direction, because in cricket a null
 * means "no dismissals yet", not "zero" - sorting those to the top of a
 * best-average leaderboard would be wrong.
 */
import { h, download, toCSV } from './dom.js';

export function dataTable({
  columns, rows, pageSize = 25, initialSort = null, caption = null,
  emptyMessage = 'No rows match these filters.', filename = 'table.csv',
  onRowClick = null,
}) {
  let sortKey = initialSort?.key ?? null;
  let sortDir = initialSort?.dir ?? 'desc';
  let page = 0;

  const wrap = h('div');
  const scroll = h('div', { class: 'table-wrap' });
  const table = h('table', { class: 'data' });
  const thead = h('thead');
  const tbody = h('tbody');
  const foot = h('div', { class: 'table-foot' });
  if (caption) table.appendChild(h('caption', { class: 'sr-only', text: caption }));
  table.append(thead, tbody);
  scroll.appendChild(table);
  wrap.append(scroll, foot);

  const valueOf = (col, row) => (col.value ? col.value(row) : row[col.key]);

  function sorted() {
    if (!sortKey) return rows.slice();
    const col = columns.find((c) => c.key === sortKey);
    if (!col) return rows.slice();
    const dir = sortDir === 'asc' ? 1 : -1;
    return rows.slice().sort((a, b) => {
      const av = col.sortValue ? col.sortValue(a) : valueOf(col, a);
      const bv = col.sortValue ? col.sortValue(b) : valueOf(col, b);
      // Nulls last in both directions.
      const aNull = av == null || av === '' || Number.isNaN(av);
      const bNull = bv == null || bv === '' || Number.isNaN(bv);
      if (aNull && bNull) return 0;
      if (aNull) return 1;
      if (bNull) return -1;
      if (typeof av === 'string' || typeof bv === 'string') {
        return String(av).localeCompare(String(bv)) * dir;
      }
      return (av - bv) * dir;
    });
  }

  function renderHead() {
    thead.replaceChildren();
    const tr = h('tr');
    for (const col of columns) {
      const isSorted = col.key === sortKey;
      const th = h('th', {
        class: col.text ? 'txt' : '',
        scope: 'col',
        'aria-sort': isSorted ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none',
        tabindex: '0',
        role: 'columnheader',
        title: col.help || `Sort by ${col.label}`,
      }, [
        document.createTextNode(col.label),
        isSorted ? h('span', { class: 'arrow', text: sortDir === 'asc' ? '▲' : '▼' }) : null,
      ]);
      const activate = () => {
        if (col.sortable === false) return;
        if (sortKey === col.key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        else { sortKey = col.key; sortDir = col.defaultDir || 'desc'; }
        page = 0;
        render();
      };
      th.addEventListener('click', activate);
      th.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); activate(); }
      });
      tr.appendChild(th);
    }
    thead.appendChild(tr);
  }

  function render() {
    renderHead();
    const all = sorted();
    const pages = Math.max(1, Math.ceil(all.length / pageSize));
    page = Math.min(page, pages - 1);
    const slice = all.slice(page * pageSize, (page + 1) * pageSize);

    tbody.replaceChildren();
    if (!slice.length) {
      tbody.appendChild(h('tr', {}, [
        h('td', { colspan: String(columns.length), class: 'txt muted', text: emptyMessage }),
      ]));
    }
    for (const row of slice) {
      const tr = h('tr');
      if (onRowClick) {
        tr.style.cursor = 'pointer';
        tr.tabIndex = 0;
        tr.addEventListener('click', () => onRowClick(row));
        tr.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') onRowClick(row);
        });
      }
      for (const col of columns) {
        const raw = valueOf(col, row);
        const cell = h('td', { class: `${col.text ? 'txt' : ''} ${col.strong ? 'num-strong' : ''}`.trim() });
        const rendered = col.render ? col.render(row, raw) : (raw ?? '—');
        if (rendered instanceof Node) cell.appendChild(rendered);
        else cell.textContent = String(rendered);
        if (col.title) cell.title = col.title(row, raw);
        tr.appendChild(cell);
      }
      tbody.appendChild(tr);
    }

    foot.replaceChildren();
    foot.appendChild(h('span', {
      text: all.length
        ? `${page * pageSize + 1}–${Math.min(all.length, (page + 1) * pageSize)} of ${all.length}`
        : '0 rows',
    }));
    const controls = h('div', { class: 'row' });
    if (pages > 1) {
      const prev = h('button', {
        class: 'btn btn--ghost', text: '← Prev', type: 'button',
        onclick: () => { page = Math.max(0, page - 1); render(); },
      });
      const next = h('button', {
        class: 'btn btn--ghost', text: 'Next →', type: 'button',
        onclick: () => { page = Math.min(pages - 1, page + 1); render(); },
      });
      prev.disabled = page === 0;
      next.disabled = page >= pages - 1;
      controls.append(prev, h('span', { class: 'small muted', text: `Page ${page + 1} of ${pages}` }), next);
    }
    controls.appendChild(h('button', {
      class: 'btn btn--ghost', type: 'button', text: '⭳ CSV',
      title: 'Download these rows as CSV',
      onclick: () => download(filename, toCSV(
        columns.map((c) => c.label),
        all.map((row) => columns.map((col) => {
          const raw = valueOf(col, row);
          return col.csv ? col.csv(row, raw) : raw;
        })),
      )),
    }));
    foot.appendChild(controls);
  }

  render();

  return {
    node: wrap,
    setRows(next) { rows = next; page = 0; render(); },
    getRows: () => rows,
  };
}

/**
 * A read-only table, used as the accessible alternative to a chart and as a
 * plain comparison table.
 *
 * It carries its own horizontal scroll container: these get dropped straight
 * into cards, and without one a wide table drags the whole page sideways on a
 * narrow screen.
 */
export function simpleTable(headers, rows) {
  const table = h('table', { class: 'data' });
  table.appendChild(h('thead', {}, [
    h('tr', {}, headers.map((label, i) => h('th', {
      class: i === 0 ? 'txt' : '', scope: 'col', text: label,
    }))),
  ]));
  table.appendChild(h('tbody', {}, rows.map((row) => h('tr', {}, row.map((cell, i) => h('td', {
    class: i === 0 ? 'txt' : '',
    text: cell == null ? '—' : String(cell),
  }))))));
  return h('div', { class: 'table-wrap' }, [table]);
}
