// Rich tables are saved in the note as a plain HTML <table> (Obsidian and
// other markdown apps show HTML tables), with every look written as inline
// styles so it survives anywhere. Opal's own settings ride along as data-*
// attributes so it can edit the table again:
//
//   <table data-opal-table data-pad="8" data-border="all" data-bw="1" data-bc="#16140F" data-header="1" style="…">
//   <colgroup><col style="width:120px"><col style="width:160px"></colgroup>
//   <tr style="height:40px"><th style="…">Name</th><th style="…">Score</th></tr>
//   <tr><td colspan="2" style="…;background:#F4E36B">Merged</td></tr>
//   </table>
//
// In memory a table is a list of cells, each with its top-left position
// (r, c) and how many rows/columns it covers (rs, cs).

export const BORDERS = ['all', 'outer', 'rows', 'none'];
export const DEFAULTS = { pad: 8, border: 'all', bw: 1, bc: '#16140F', header: true };
export const MIN_COL = 28;
export const MIN_ROW = 22;

let nextId = 1;
const newCell = (r, c, extra = {}) => ({ id: nextId++, r, c, rs: 1, cs: 1, html: '', bg: null, color: null, align: null, valign: null, ...extra });

export function blankTable(rows, cols) {
  const cells = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push(newCell(r, c));
  return { rows, cols, cells, colW: Array(cols).fill(null), rowH: Array(rows).fill(null), ...DEFAULTS };
}

// ---------- Looking things up ----------

export function cellAt(t, r, c) {
  return t.cells.find((x) => r >= x.r && r < x.r + x.rs && c >= x.c && c < x.c + x.cs) || null;
}

// A selection rectangle grown until no merged cell pokes out of it (like Word).
export function expandRect(t, rect) {
  let { r1, c1, r2, c2 } = { r1: Math.min(rect.r1, rect.r2), c1: Math.min(rect.c1, rect.c2), r2: Math.max(rect.r1, rect.r2), c2: Math.max(rect.c1, rect.c2) };
  let grew = true;
  while (grew) {
    grew = false;
    for (const x of t.cells) {
      const inside = x.r <= r2 && x.r + x.rs - 1 >= r1 && x.c <= c2 && x.c + x.cs - 1 >= c1;
      if (!inside) continue;
      if (x.r < r1) { r1 = x.r; grew = true; }
      if (x.c < c1) { c1 = x.c; grew = true; }
      if (x.r + x.rs - 1 > r2) { r2 = x.r + x.rs - 1; grew = true; }
      if (x.c + x.cs - 1 > c2) { c2 = x.c + x.cs - 1; grew = true; }
    }
  }
  return { r1, c1, r2, c2 };
}

export function cellsIn(t, rect) {
  return t.cells.filter((x) => x.r >= rect.r1 && x.r <= rect.r2 && x.c >= rect.c1 && x.c <= rect.c2);
}

// ---------- Changing the shape ----------

export function insertRow(t, at) {
  for (const x of t.cells) {
    if (x.r >= at) x.r++;
    else if (x.r + x.rs > at) x.rs++; // a merged cell spanning the gap grows
  }
  t.rows++;
  t.rowH.splice(at, 0, null);
  for (let c = 0; c < t.cols; c++) {
    if (!cellAt(t, at, c)) {
      const above = cellAt(t, at - 1, c) || cellAt(t, at + 1, c);
      t.cells.push(newCell(at, c, above ? { bg: above.bg, color: above.color, align: above.align, valign: above.valign } : {}));
    }
  }
}

export function insertCol(t, at) {
  for (const x of t.cells) {
    if (x.c >= at) x.c++;
    else if (x.c + x.cs > at) x.cs++;
  }
  t.cols++;
  // Share the width of its neighbour, so the table doesn't balloon.
  const near = t.colW[at] ?? t.colW[at - 1] ?? null;
  if (near) {
    const half = Math.max(MIN_COL, Math.round(near / 2));
    const i = t.colW[at] != null ? at : at - 1;
    t.colW[i] = half;
    t.colW.splice(at, 0, half);
  } else {
    t.colW.splice(at, 0, null);
  }
  for (let r = 0; r < t.rows; r++) {
    if (!cellAt(t, r, at)) t.cells.push(newCell(r, at));
  }
}

export function deleteRows(t, r1, r2) {
  const count = r2 - r1 + 1;
  if (count >= t.rows) return false;
  t.cells = t.cells.filter((x) => {
    const end = x.r + x.rs - 1;
    const overlap = Math.max(0, Math.min(end, r2) - Math.max(x.r, r1) + 1);
    if (overlap === x.rs) return false; // entirely inside
    x.rs -= overlap;
    if (x.r > r2) x.r -= count;
    else if (x.r >= r1) x.r = r1; // started in a deleted row: now starts where they were
    return true;
  });
  t.rows -= count;
  t.rowH.splice(r1, count);
  return true;
}

export function deleteCols(t, c1, c2) {
  const count = c2 - c1 + 1;
  if (count >= t.cols) return false;
  t.cells = t.cells.filter((x) => {
    const end = x.c + x.cs - 1;
    const overlap = Math.max(0, Math.min(end, c2) - Math.max(x.c, c1) + 1);
    if (overlap === x.cs) return false;
    x.cs -= overlap;
    if (x.c > c2) x.c -= count;
    else if (x.c >= c1) x.c = c1;
    return true;
  });
  t.cols -= count;
  t.colW.splice(c1, count);
  return true;
}

// Merges a rectangle into its top-left cell; text from the others is kept.
export function merge(t, rect) {
  const area = expandRect(t, rect);
  const inside = cellsIn(t, area).sort((a, b) => a.r - b.r || a.c - b.c);
  if (inside.length < 2) return null;
  const keep = inside[0];
  keep.html = inside.map((x) => x.html).filter((html) => html.replace(/<br>/g, '').trim()).join('<br>');
  keep.rs = area.r2 - area.r1 + 1;
  keep.cs = area.c2 - area.c1 + 1;
  const gone = new Set(inside.slice(1));
  t.cells = t.cells.filter((x) => !gone.has(x));
  return keep;
}

// Splits merged cells back into single cells.
export function split(t, rect) {
  let changed = false;
  for (const x of cellsIn(t, expandRect(t, rect))) {
    if (x.rs === 1 && x.cs === 1) continue;
    for (let r = x.r; r < x.r + x.rs; r++) {
      for (let c = x.c; c < x.c + x.cs; c++) {
        if (r !== x.r || c !== x.c) t.cells.push(newCell(r, c, { bg: x.bg, color: x.color, align: x.align, valign: x.valign }));
      }
    }
    x.rs = 1;
    x.cs = 1;
    changed = true;
  }
  return changed;
}

// ---------- Writing ----------

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function borderSides(t, x) {
  const line = `${t.bw}px solid ${t.bc}`;
  const top = x.r === 0;
  const bottom = x.r + x.rs === t.rows;
  const left = x.c === 0;
  const right = x.c + x.cs === t.cols;
  switch (t.border) {
    case 'all': return { top: line, right: line, bottom: line, left: line };
    case 'outer': return { top: top ? line : null, right: right ? line : null, bottom: bottom ? line : null, left: left ? line : null };
    case 'rows': return { top: line, right: null, bottom: line, left: null };
    default: return { top: null, right: null, bottom: null, left: null };
  }
}

// The inline style of one cell (also used to draw it in the editor).
export function cellStyle(t, x) {
  const sides = borderSides(t, x);
  const isHead = t.header && x.r === 0;
  if (isHead && t.border !== 'none' && x.r + x.rs < t.rows) sides.bottom = `${Math.max(2, t.bw + 1)}px solid ${t.bc}`;
  const parts = [];
  const all = ['top', 'right', 'bottom', 'left'];
  if (all.every((side) => sides[side] === sides.top)) {
    parts.push(`border:${sides.top || 'none'}`);
  } else {
    // One "border" for the most common side, then the ones that differ.
    const common = sides.top ?? sides.left ?? null;
    parts.push(`border:${common || 'none'}`);
    for (const side of all) if (sides[side] !== common) parts.push(`border-${side}:${sides[side] || 'none'}`);
  }
  parts.push(`padding:${t.pad}px`);
  parts.push(`vertical-align:${x.valign || 'top'}`);
  if (x.align || isHead) parts.push(`text-align:${x.align || 'left'}`);
  if (x.bg) parts.push(`background:${x.bg}`);
  if (x.color) parts.push(`color:${x.color}`);
  return parts.join(';');
}

export function tableStyle(t) {
  const fixed = t.colW.length && t.colW.every((w) => w != null);
  const width = fixed ? `width:${t.colW.reduce((a, b) => a + b, 0)}px;table-layout:fixed` : 'width:100%';
  return `border-collapse:collapse;${width}`;
}

export function serializeTable(t) {
  const lines = [];
  lines.push(`<table data-opal-table data-pad="${t.pad}" data-border="${t.border}" data-bw="${t.bw}" data-bc="${esc(t.bc)}" data-header="${t.header ? 1 : 0}" style="${tableStyle(t)}">`);
  if (t.colW.some((w) => w != null)) {
    lines.push(`<colgroup>${t.colW.map((w) => (w != null ? `<col style="width:${w}px">` : '<col>')).join('')}</colgroup>`);
  }
  for (let r = 0; r < t.rows; r++) {
    const row = t.cells.filter((x) => x.r === r).sort((a, b) => a.c - b.c);
    const tag = t.header && r === 0 ? 'th' : 'td';
    const cells = row.map((x) => {
      const spans = `${x.cs > 1 ? ` colspan="${x.cs}"` : ''}${x.rs > 1 ? ` rowspan="${x.rs}"` : ''}`;
      return `<${tag}${spans} style="${esc(cellStyle(t, x))}">${x.html.replace(/\r?\n/g, ' ')}</${tag}>`;
    }).join('');
    lines.push(`<tr${t.rowH[r] ? ` style="height:${t.rowH[r]}px"` : ''}>${cells}</tr>`);
  }
  lines.push('</table>');
  return lines.join('\n');
}

// ---------- Reading ----------

const ALLOWED = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'MARK', 'CODE', 'BR', 'SUB', 'SUP']);
const RENAME = { STRONG: 'b', EM: 'i', STRIKE: 's', DEL: 's' };

// Keeps only simple text formatting from a cell (no attributes, no scripts,
// no links to anywhere), so a table can never carry anything harmful.
export function cleanCellHtml(node) {
  let out = '';
  for (const child of node.childNodes) {
    if (child.nodeType === 3) {
      out += esc(child.nodeValue.replace(/\s*\n\s*/g, ' ')).replace(/>/g, '&gt;');
    } else if (child.nodeType === 1) {
      const tag = child.tagName;
      if (tag === 'BR') {
        out += '<br>';
      } else if (tag === 'DIV' || tag === 'P') {
        // Line breaks Chrome makes while typing.
        const inner = cleanCellHtml(child);
        out += (out && !out.endsWith('<br>') ? '<br>' : '') + inner;
      } else if (ALLOWED.has(tag)) {
        const name = (RENAME[tag] || tag).toLowerCase();
        const inner = cleanCellHtml(child);
        if (inner) out += `<${name}>${inner}</${name}>`;
      } else if (tag === 'SPAN' || tag === 'FONT' || tag === 'A') {
        out += cleanCellHtml(child);
      }
      // Anything else (images, scripts, …) is dropped.
    }
  }
  return out;
}

function toHex(value) {
  if (!value) return null;
  if (/^#[0-9a-f]{3,8}$/i.test(value)) return value.toUpperCase();
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(value);
  if (!m) return null;
  if (m[4] !== undefined && Number(m[4]) === 0) return null;
  return `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

const px = (value) => {
  const n = parseFloat(value);
  return Number.isFinite(n) && /px$/.test(String(value).trim()) ? Math.round(n) : null;
};

export function parseTable(source) {
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${source}`, 'text/html');
  const table = doc.querySelector('table');
  if (!table) return blankTable(2, 2);
  const d = table.dataset;
  const t = {
    rows: 0,
    cols: 0,
    cells: [],
    colW: [],
    rowH: [],
    pad: Number.isFinite(Number(d.pad)) && d.pad !== undefined ? Math.max(0, Math.min(40, Number(d.pad))) : DEFAULTS.pad,
    border: BORDERS.includes(d.border) ? d.border : DEFAULTS.border,
    bw: [1, 2, 3].includes(Number(d.bw)) ? Number(d.bw) : DEFAULTS.bw,
    bc: toHex(d.bc) || DEFAULTS.bc,
    header: d.header !== undefined ? d.header === '1' : Boolean(table.querySelector('tr:first-child th')),
  };

  const taken = []; // taken[r][c] → true once a cell covers it
  const rows = [...table.querySelectorAll('tr')].filter((tr) => tr.closest('table') === table);
  rows.forEach((tr, r) => {
    taken[r] = taken[r] || [];
    t.rowH[r] = px(tr.style.height);
    let c = 0;
    for (const el of tr.children) {
      if (el.tagName !== 'TD' && el.tagName !== 'TH') continue;
      while (taken[r][c]) c++;
      const rs = Math.max(1, Math.min(rows.length - r, parseInt(el.getAttribute('rowspan'), 10) || 1));
      const cs = Math.max(1, Math.min(50, parseInt(el.getAttribute('colspan'), 10) || 1));
      for (let i = 0; i < rs; i++) {
        taken[r + i] = taken[r + i] || [];
        for (let j = 0; j < cs; j++) taken[r + i][c + j] = true;
      }
      const align = ['left', 'center', 'right', 'justify'].includes(el.style.textAlign) ? el.style.textAlign : null;
      const valign = ['top', 'middle', 'bottom'].includes(el.style.verticalAlign) ? el.style.verticalAlign : null;
      t.cells.push(newCell(r, c, {
        rs,
        cs,
        html: cleanCellHtml(el),
        bg: toHex(el.style.backgroundColor || el.style.background),
        color: toHex(el.style.color),
        align: align === 'left' ? null : align,
        valign: valign === 'top' ? null : valign,
      }));
      c += cs;
    }
  });
  t.rows = Math.max(1, rows.length);
  t.cols = Math.max(1, ...taken.map((row) => (row ? row.length : 0)));
  // Fill any holes (a hand-written table with short rows).
  for (let r = 0; r < t.rows; r++) {
    for (let c = 0; c < t.cols; c++) if (!cellAt(t, r, c)) t.cells.push(newCell(r, c));
  }
  const cols = [...table.querySelectorAll('col')];
  t.colW = Array.from({ length: t.cols }, (_, i) => (cols[i] ? px(cols[i].style.width) : null));
  t.rowH = Array.from({ length: t.rows }, (_, i) => t.rowH[i] || null);
  return t;
}

// Where table blocks are in a note: [{ fromLine, toLine }] (1-based lines).
export function findTableBlocks(lines) {
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*<table[\s>]/i.test(lines[i])) continue;
    let j = i;
    while (j < lines.length && !/<\/table>/i.test(lines[j])) j++;
    if (j >= lines.length) break; // unfinished table: leave it as text
    blocks.push({ fromLine: i + 1, toLine: j + 1 });
    i = j;
  }
  return blocks;
}
