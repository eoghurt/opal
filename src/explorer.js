// The explorer (⌘O): the vault in columns or as a list, in one, two or three
// panes side by side, so files can be dragged from one folder to another.
// Typing in the box searches instead, as search always has: names first, then
// the lines inside notes. ⌘⇧F opens it ready to search.
//
//   openExplorer(io, { mode: 'open' | 'text' })
//   io: tree(), vaultName, here() → { folder, file } (where the window is),
//       search(query) → [{ path, count, matches }], openFile(path, newTab),
//       openFolder(path, newTab), openAt(path, line, column, length),
//       move(path, kind, destFolder) → new path, menu(event, node),
//       view() / setView('columns' | 'list'), toast(text, undo)
//
// Keys: ↑↓ move, → into a folder, ← out, ↵ open (⌘↵ in a new tab), ⌘\ or the
// pane buttons split, ⌘1–3 or Tab change pane, ⌘-click / ⇧-click pick several,
// esc clears the search, then closes.

import { h, icon } from './ui.js';
import { flattenFiles, findFolder } from './tree.js';
import { kindOf } from './file-types.js';

const NAME_LIMIT = 8;
const MAX_PANES = 3;

const parentOf = (path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
const nameOf = (node) => (node.type === 'folder' ? node.name : node.name.replace(/\.md$/i, ''));
const isInside = (path, folder) => path === folder || path.startsWith(`${folder}/`);
const FILTERS = [
  ['all', 'Everything'],
  ['note', 'Notes'],
  ['pdf', 'PDFs'],
  ['other', 'Other files'],
];

// ---------- Search (names and lines inside notes) ----------

function folderList(nodes, out = []) {
  for (const node of nodes) {
    if (node.type === 'folder') {
      out.push(node);
      folderList(node.children, out);
    }
  }
  return out;
}

// All words must appear; names that start with the query come first.
function nameMatches(items, query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const scored = [];
  for (const item of items) {
    const name = item.name.replace(/\.md$/i, '').toLowerCase();
    const where = item.path.toLowerCase();
    if (!words.every((w) => where.includes(w))) continue;
    const q = words.join(' ');
    const score = name === q ? 0 : name.startsWith(q) ? 1 : name.includes(q) ? 2 : words.every((w) => name.includes(w)) ? 3 : 4;
    scored.push({ item, score });
  }
  const folderFirst = (x) => (x.item.type === 'folder' ? 0 : 1);
  return scored.sort((a, b) => a.score - b.score || folderFirst(a) - folderFirst(b) || (b.item.modified || 0) - (a.item.modified || 0)).slice(0, NAME_LIMIT).map((s) => s.item);
}

// "…the empty house…" with the match wrapped in <mark> (built safely, no HTML).
function snippet(match) {
  return h('span', { class: 'xp-snippet' },
    match.text.slice(0, match.at),
    h('mark', null, match.text.slice(match.at, match.at + match.length)),
    match.text.slice(match.at + match.length));
}

// A file's kind for its icon and the filter: note, pdf or other.
function kindGroup(node) {
  if (node.type === 'folder') return 'folder';
  const kind = kindOf(node.path);
  return kind === 'note' ? 'note' : kind === 'pdf' ? 'pdf' : 'other';
}

function rowIcon(node) {
  const group = kindGroup(node);
  return h('span', { class: `xp-ico is-${group}` }, icon(group === 'folder' ? 'folder' : group === 'note' ? 'note' : 'file', 14));
}

// What stays between openings: the panes past the first, the filter.
const memory = { count: 1, panes: [], filter: 'all' };
let openBox = null;

export function isExplorerOpen() {
  return Boolean(openBox);
}

export function closeExplorer() {
  if (openBox) openBox.close();
}

// ⌘\ while the explorer is open: one more pane (back to one after three).
export function splitExplorer() {
  if (openBox) openBox.split();
}

export function openExplorer(io, { mode = 'open' } = {}) {
  if (openBox) {
    openBox.focus(mode);
    return;
  }
  let view = io.view() === 'list' ? 'list' : 'columns';
  let filter = memory.filter;
  let query = '';
  let focus = 0; // which pane the keys move in
  let results = []; // search rows: [{ el, open }]
  let active = 0;
  let seq = 0;
  let textTimer = null;
  let dragging = null; // [paths] while a drag is on

  const tree = () => io.tree();
  const folderAt = (path) => findFolder(tree(), path, io.vaultName);
  const nodeAt = (path) => {
    if (!path) return folderAt('');
    return folderList(tree()).find((f) => f.path === path) || flattenFiles(tree()).find((f) => f.path === path) || null;
  };
  const shown = (folder) => (folder ? folder.children.filter((n) => !n.quiet && (n.type === 'folder' || filter === 'all' || kindGroup(n) === filter)) : []);

  // A pane: `cursor` is the folder whose list holds the selection `sel`;
  // `picked` holds extra rows picked with ⌘ or ⇧; `open` the folders
  // expanded in list view.
  const makePane = (folder, sel = null) => {
    const f = folderAt(folder) ? folder : '';
    const first = shown(folderAt(f))[0];
    // `root`: where list view starts (the top folder the pane is in).
    const pane = { cursor: f, sel: sel || (first ? first.path : null), picked: new Set(), open: new Set(), root: f.split('/')[0] || '' };
    for (let p = f; p; p = parentOf(p)) pane.open.add(p);
    return pane;
  };
  const start = io.here();
  const panes = [makePane(start.folder, start.file)];
  for (let i = 1; i < memory.count; i++) panes.push(memory.panes[i] && folderAt(memory.panes[i].cursor) ? makePane(memory.panes[i].cursor) : makePane(start.folder));

  // The folder a pane is showing: the selected folder, or the one holding the selection.
  const shownFolder = (pane) => {
    const node = pane.sel && nodeAt(pane.sel);
    return node && node.type === 'folder' ? node.path : pane.cursor;
  };

  // ---------- The box ----------

  const input = h('input', {
    class: 'xp-input',
    placeholder: 'Search',
    spellcheck: 'false',
    'aria-label': 'Search',
    'aria-controls': 'xp-body',
  });
  const status = h('span', { class: 'xp-status', 'aria-live': 'polite' });
  const tool = (name, label, on, click, extra = '') => h('button', {
    type: 'button',
    class: `xp-tool${on ? ' is-on' : ''}${extra}`,
    title: label,
    'aria-label': label,
    'aria-pressed': on == null ? null : String(Boolean(on)),
    onmousedown: (e) => e.preventDefault(), // keep typing focus
    onclick: click,
  }, icon(name, 16));
  const tools = h('div', { class: 'xp-tools' });
  const body = h('div', { class: 'xp-body', id: 'xp-body' });
  const foot = h('div', { class: 'xp-foot' });
  const box = h('div', { class: 'xp-box', role: 'dialog', 'aria-label': 'Explorer' },
    h('div', { class: 'xp-top' },
      h('label', { class: 'xp-q' }, icon('search', 16), input),
      status,
      tools),
    body,
    foot);
  const scrim = h('div', { class: 'xp-scrim' }, box);
  document.body.append(scrim);

  const close = () => {
    clearTimeout(textTimer);
    scrim.remove();
    document.removeEventListener('keydown', onKey, true);
    memory.count = panes.length;
    memory.panes = panes.map((p) => ({ cursor: shownFolder(p) }));
    memory.filter = filter;
    openBox = null;
  };

  const drawTools = () => {
    const filterOn = filter !== 'all';
    tools.replaceChildren(
      tool('filter', `Show: ${FILTERS.find((f) => f[0] === filter)[1]}`, filterOn || null, (e) => io.menu(e, null, {
        title: 'Show',
        items: FILTERS.map(([id, label]) => ({ label, hint: id === filter ? '✓' : '', onSelect: () => { filter = id; draw(); } })),
      })),
      h('span', { class: 'xp-sep' }),
      h('span', { class: 'xp-seg', role: 'group', 'aria-label': 'View' },
        tool('columns', 'Columns', view === 'columns', () => setView('columns')),
        tool('list', 'List', view === 'list', () => setView('list'))),
      h('span', { class: 'xp-sep' }),
      h('span', { class: 'xp-seg', role: 'group', 'aria-label': 'Panes' },
        [1, 2, 3].map((n) => tool(`panes${n}`, n === 1 ? 'One pane' : `${n} panes${n === 2 ? ' (⌘\\)' : ''}`, panes.length === n, () => setPanes(n)))));
  };

  const setView = (next) => {
    if (view === next) return;
    view = next;
    io.setView(next);
    draw();
  };

  const setPanes = (n) => {
    while (panes.length < n) panes.push(makePane(shownFolder(panes[focus])));
    panes.length = n;
    focus = Math.min(focus, n - 1);
    draw();
  };

  // ---------- Panes ----------

  const crumbs = (pane, i) => {
    const folder = view === 'list' ? pane.root : shownFolder(pane);
    const parts = folder ? folder.split('/') : [];
    const go = (path) => () => {
      focus = i;
      if (view === 'list') {
        pane.root = path;
        if (pane.sel && !isInside(pane.sel, path)) pane.sel = null;
      } else {
        pane.cursor = path;
        pane.sel = null;
      }
      draw();
    };
    const trail = [h('button', { type: 'button', class: 'xp-crumb', onclick: go('') }, io.vaultName)];
    parts.forEach((part, k) => {
      const path = parts.slice(0, k + 1).join('/');
      trail.push(h('span', { class: 'xp-slash' }, '/'), h('button', { type: 'button', class: `xp-crumb${k === parts.length - 1 ? ' is-here' : ''}`, onclick: go(path) }, part));
    });
    // Keep the end of a long path in view.
    const keep = trail.length > 7 ? [trail[0], h('span', { class: 'xp-slash' }, '/ …'), ...trail.slice(-4)] : trail;
    return h('div', { class: 'xp-phead', 'data-drop': folder },
      h('span', { class: 'xp-crumbs' }, keep),
      panes.length > 1 ? h('button', {
        type: 'button', class: 'xp-close', title: 'Close this pane', 'aria-label': 'Close this pane',
        onclick: () => { panes.splice(i, 1); focus = Math.min(focus, panes.length - 1); draw(); },
      }, '×') : null);
  };

  const row = (node, pane, i, { depth = 0, path = false, chevron = null } = {}) => {
    const picked = pane.picked.has(node.path);
    const sel = pane.sel === node.path;
    const folder = node.type === 'folder';
    const count = folder ? node.children.filter((c) => !c.quiet).length : null;
    const el = h('div', {
      class: `xp-row${sel ? ' is-sel' : ''}${picked ? ' is-picked' : ''}${path && !sel ? ' is-path' : ''}${dragging && dragging.includes(node.path) ? ' is-ghost' : ''}`,
      role: 'option',
      'aria-selected': String(sel || picked),
      draggable: 'true',
      'data-path': node.path,
      'data-drop': folder ? node.path : null,
      style: depth ? `padding-left: ${8 + depth * 18}px` : null,
      title: nameOf(node),
    },
    view === 'list' ? h('span', { class: 'xp-chev' }, chevron || '') : null,
    rowIcon(node),
    h('span', { class: 'xp-name' }, nameOf(node)),
    count != null ? h('span', { class: 'xp-count' }, String(count)) : null);
    // (No preventDefault on mousedown here: it would stop drags from starting.
    // Typing focus goes back to the box after a click or a drag instead.)
    el.addEventListener('click', (e) => {
      input.focus({ preventScroll: true });
      focus = i;
      if (view === 'list' && folder && e.target.closest('.xp-chev')) {
        if (pane.open.has(node.path)) pane.open.delete(node.path); else pane.open.add(node.path);
        draw();
        return;
      }
      pick(pane, node, e);
    });
    el.addEventListener('dblclick', () => openNode(node, false));
    el.addEventListener('contextmenu', (e) => io.menu(e, node));
    el.addEventListener('dragstart', (e) => {
      const paths = pane.picked.size && (pane.picked.has(node.path) || pane.sel === node.path)
        ? [...new Set([pane.sel, ...pane.picked].filter(Boolean))]
        : [node.path];
      dragging = paths;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', paths.join('\n'));
      const ghost = h('div', { class: 'xp-dragging' }, rowIcon(node), nameOf(node), paths.length > 1 ? h('span', { class: 'xp-dragging-n' }, String(paths.length)) : null);
      document.body.append(ghost);
      e.dataTransfer.setDragImage(ghost, 12, 14);
      setTimeout(() => ghost.remove(), 0);
      requestAnimationFrame(() => paths.forEach((p) => body.querySelectorAll(`[data-path="${CSS.escape(p)}"]`).forEach((r) => r.classList.add('is-ghost'))));
    });
    el.addEventListener('dragend', () => {
      dragging = null;
      input.focus({ preventScroll: true });
      body.querySelectorAll('.is-ghost, .is-drop').forEach((r) => r.classList.remove('is-ghost', 'is-drop'));
    });
    return el;
  };

  // Click: select it (a folder shows its contents next to it). ⌘ adds or
  // removes it from the picked rows; ⇧ picks the run from the selection.
  const pick = (pane, node, e) => {
    if (e.metaKey) {
      if (pane.sel && !pane.picked.size) pane.picked.add(pane.sel);
      if (pane.picked.has(node.path)) pane.picked.delete(node.path); else pane.picked.add(node.path);
      pane.sel = node.path;
      pane.cursor = parentOf(node.path);
    } else if (e.shiftKey && pane.sel && parentOf(pane.sel) === parentOf(node.path)) {
      const list = shown(folderAt(parentOf(node.path))).map((n) => n.path);
      const [a, b] = [list.indexOf(pane.sel), list.indexOf(node.path)].sort((x, y) => x - y);
      list.slice(a, b + 1).forEach((p) => pane.picked.add(p));
    } else {
      pane.picked.clear();
      pane.sel = node.path;
      pane.cursor = parentOf(node.path);
      if (view === 'list' && node.type === 'folder' && !pane.open.has(node.path)) pane.open.add(node.path);
    }
    draw();
  };

  const columnsPane = (pane, i) => {
    const showing = shownFolder(pane);
    const chain = [''];
    if (showing) showing.split('/').forEach((_, k, parts) => chain.push(parts.slice(0, k + 1).join('/')));
    const cols = chain.map((folderPath, k) => {
      const next = chain[k + 1];
      const items = shown(folderAt(folderPath));
      return h('div', { class: 'xp-col', 'data-drop': folderPath, role: 'listbox', 'aria-label': folderPath || io.vaultName },
        items.length ? items.map((n) => row(n, pane, i, { path: n.path === next })) : h('p', { class: 'xp-empty' }, 'Empty'));
    });
    // Every column from the vault down; the row scrolls sideways (trackpad or
    // ⇧-scroll) and is kept scrolled to the newest column (see drawPanes).
    if (cols.length) cols[cols.length - 1].classList.add('is-last');
    return h('div', { class: 'xp-cols' }, cols);
  };

  const listRows = (pane) => {
    if (!folderAt(pane.root)) pane.root = '';
    const out = [];
    const walk = (folder, depth) => {
      for (const n of shown(folder)) {
        const isFolder = n.type === 'folder';
        out.push({ n, depth, chevron: isFolder ? (pane.open.has(n.path) ? '▾' : '▸') : null });
        if (isFolder && pane.open.has(n.path)) walk(n, depth + 1);
      }
    };
    walk(folderAt(pane.root), 0);
    return out;
  };

  const listPane = (pane, i) => h('div', { class: 'xp-col is-list', 'data-drop': pane.root, role: 'tree', 'aria-label': pane.root || io.vaultName },
    listRows(pane).map(({ n, depth, chevron }) => row(n, pane, i, { depth, chevron })));

  const drawPanes = () => {
    body.classList.remove('is-search');
    body.replaceChildren(h('div', { class: `xp-panes is-${panes.length}` }, panes.map((pane, i) => h('section', {
      class: `xp-pane${i === focus && panes.length > 1 ? ' is-focus' : ''}`,
      'aria-label': `Pane ${i + 1}`,
      onmousedown: () => { focus = i; },
    }, crumbs(pane, i), view === 'list' ? listPane(pane, i) : columnsPane(pane, i)))));
    body.querySelectorAll('.xp-cols').forEach((el) => { el.scrollLeft = el.scrollWidth; });
    body.querySelectorAll('.xp-row.is-sel').forEach((el) => el.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
    status.textContent = '';
    foot.replaceChildren(...[
      '↵ open', '⌘↵ new tab', panes.length > 1 ? 'drag to move' : '⌘\\ split', panes.length > 1 ? '⌘1–3 pane' : null,
    ].filter(Boolean).map((t) => h('span', null, t)), h('span', { class: 'xp-foot-end' }, 'esc close'));
  };

  // ---------- Search results ----------

  const drawResults = (names, hits, searching) => {
    body.classList.add('is-search');
    results = [];
    const sections = [];
    const addRow = (content, open, extra = '') => {
      const el = h('div', { class: `xp-hit${extra}`, role: 'option', id: `xp-hit-${results.length}`, 'aria-selected': 'false' }, content);
      const r = { el, open };
      el.addEventListener('mousedown', (e) => e.preventDefault());
      el.addEventListener('click', (e) => { close(); r.open(e.metaKey); });
      el.addEventListener('mousemove', () => { const k = results.indexOf(r); if (k !== active) setActive(k); });
      results.push(r);
      return el;
    };
    const shownNames = names.filter((n) => n.type === 'folder' || filter === 'all' || kindGroup(n) === filter);
    if (shownNames.length) {
      sections.push(h('span', { class: 'xp-section' }, 'Names'));
      for (const item of shownNames) {
        sections.push(addRow([
          rowIcon(item),
          h('b', { class: 'xp-hit-name' }, nameOf(item)),
          h('span', { class: 'xp-hit-where' }, parentOf(item.path).split('/').join(' / ')),
        ], (newTab) => (item.type === 'folder' ? io.openFolder(item.path, newTab) : io.openFile(item.path, newTab))));
      }
    }
    if (hits.length && (filter === 'all' || filter === 'note')) {
      sections.push(h('span', { class: 'xp-section' }, 'In notes'));
      for (const hit of hits) {
        sections.push(h('div', { class: 'xp-hit-file' },
          rowIcon({ type: 'file', path: hit.path }),
          h('b', null, hit.path.split('/').pop().replace(/\.md$/i, '')),
          h('span', { class: 'xp-hit-where' }, parentOf(hit.path).split('/').join(' / ')),
          h('span', { class: 'xp-count' }, `${hit.count}×`)));
        for (const m of hit.matches) {
          sections.push(addRow([h('span', { class: 'xp-line' }, String(m.line)), snippet(m)], () => io.openAt(hit.path, m.line, m.column, m.length), ' is-line'));
        }
      }
    }
    if (!sections.length) sections.push(h('p', { class: 'xp-empty is-big' }, searching ? 'Looking…' : query.length < 2 ? 'Keep typing…' : 'Nothing found'));
    body.replaceChildren(h('div', { class: 'xp-results', role: 'listbox', 'aria-label': 'Results' }, sections));
    status.textContent = [shownNames.length ? `${shownNames.length} name${shownNames.length === 1 ? '' : 's'}` : '', hits.length ? `${hits.reduce((n, x) => n + x.count, 0)} in ${hits.length} note${hits.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
    foot.replaceChildren(h('span', null, '↑↓ move'), h('span', null, '↵ open'), h('span', null, '⌘↵ new tab'), h('span', { class: 'xp-foot-end' }, 'esc clears'));
    active = 0;
    setActive(0);
  };

  const setActive = (k) => {
    if (!results.length) return;
    active = (k + results.length) % results.length;
    results.forEach((r, j) => {
      r.el.classList.toggle('is-active', j === active);
      r.el.setAttribute('aria-selected', String(j === active));
    });
    results[active].el.scrollIntoView({ block: 'nearest' });
    input.setAttribute('aria-activedescendant', results[active].el.id);
  };

  const runSearch = () => {
    const mine = ++seq;
    const items = [...folderList(tree()), ...flattenFiles(tree()).filter((f) => !f.quiet)];
    const names = nameMatches(items, query);
    clearTimeout(textTimer);
    if (query.length < 2) {
      drawResults(names, [], false);
      return;
    }
    drawResults(names, [], true);
    // Looking inside notes takes a moment; wait for a pause in typing.
    textTimer = setTimeout(async () => {
      let hits = [];
      try {
        hits = await io.search(query);
      } catch {
        hits = [];
      }
      if (mine === seq && query) drawResults(names, hits, false);
    }, 180);
  };

  function draw() {
    drawTools();
    if (query) runSearch();
    else drawPanes();
  }

  // ---------- Opening and moving ----------

  const openNode = (node, newTab) => {
    close();
    if (node.type === 'folder') io.openFolder(node.path, newTab);
    else io.openFile(node.path, newTab);
  };

  // Moves `paths` into `dest`; afterwards a message offers Undo.
  const moveInto = async (paths, dest) => {
    const moves = [];
    for (const path of paths) {
      const node = nodeAt(path);
      if (!node || parentOf(path) === dest) continue;
      if (node.type === 'folder' && isInside(dest, path)) continue; // not into itself
      const to = await io.move(path, node.type === 'folder' ? 'folder' : 'file', dest);
      if (!to) continue;
      moves.push({ from: path, to, back: parentOf(path), kind: node.type === 'folder' ? 'folder' : 'file', name: nameOf(node) });
      for (const pane of panes) {
        if (pane.sel && isInside(pane.sel, path)) pane.sel = to + pane.sel.slice(path.length);
        if (isInside(pane.cursor, path)) pane.cursor = to + pane.cursor.slice(path.length);
        pane.picked.clear();
      }
    }
    if (!openBox) return;
    draw();
    if (!moves.length) return;
    const where = dest ? dest.split('/').pop() : io.vaultName;
    io.toast(moves.length === 1 ? `Moved ${moves[0].name} to ${where}` : `Moved ${moves.length} items to ${where}`, async () => {
      for (const m of moves.reverse()) await io.move(m.to, m.kind, m.back);
      if (openBox) draw();
    });
  };

  // Drops land on folder rows, columns and pane headings (each has data-drop).
  const dropTarget = (e) => e.target.closest('[data-drop]');
  body.addEventListener('dragover', (e) => {
    const t = dropTarget(e);
    if (!t || !dragging) return;
    const dest = t.dataset.drop;
    const ok = dragging.some((p) => parentOf(p) !== dest && !isInside(dest, p));
    body.querySelectorAll('.is-drop').forEach((el) => { if (el !== t) el.classList.remove('is-drop'); });
    if (!ok) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    t.classList.add('is-drop');
  });
  body.addEventListener('dragleave', (e) => {
    const t = dropTarget(e);
    if (t && !t.contains(e.relatedTarget)) t.classList.remove('is-drop');
  });
  body.addEventListener('drop', (e) => {
    const t = dropTarget(e);
    if (!t || !dragging) return;
    e.preventDefault();
    const paths = dragging;
    dragging = null;
    moveInto(paths, t.dataset.drop);
  });

  // ---------- Keys ----------

  const moveSel = (pane, step) => {
    if (view === 'list') {
      const rows = listRows(pane).map((r) => r.n);
      const at = rows.findIndex((n) => n.path === pane.sel);
      const next = rows[Math.max(0, Math.min(rows.length - 1, at + step))];
      if (next) { pane.sel = next.path; pane.cursor = parentOf(next.path); }
    } else {
      const list = shown(folderAt(pane.cursor));
      const at = list.findIndex((n) => n.path === pane.sel);
      const next = list[Math.max(0, Math.min(list.length - 1, at + step))];
      if (next) pane.sel = next.path;
    }
    pane.picked.clear();
    draw();
  };

  const inOut = (pane, dir) => {
    const node = pane.sel && nodeAt(pane.sel);
    if (dir > 0) {
      if (!node || node.type !== 'folder') return;
      if (view === 'list' && !pane.open.has(node.path)) pane.open.add(node.path);
      else {
        const first = shown(node)[0];
        if (!first) return;
        if (view === 'list') pane.open.add(node.path);
        pane.cursor = node.path;
        pane.sel = first.path;
      }
    } else if (view === 'list' && node && node.type === 'folder' && pane.open.has(node.path)) {
      pane.open.delete(node.path);
    } else if (pane.cursor && (view !== 'list' || pane.cursor !== pane.root)) {
      pane.sel = pane.cursor;
      pane.cursor = parentOf(pane.cursor);
    }
    pane.picked.clear();
    draw();
  };

  const onKey = (e) => {
    // Typing in another box on top (renaming from the right-click menu) is left alone.
    if (e.target instanceof Element && e.target.closest('.ask, .ctx-menu')) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (query) {
        input.value = '';
        query = '';
        draw();
      } else close();
      return;
    }
    if (e.metaKey && !e.shiftKey && !e.altKey && /^[1-3]$/.test(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      if (Number(e.key) <= panes.length) { focus = Number(e.key) - 1; draw(); }
      return;
    }
    if (query) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setActive(active + (e.key === 'ArrowDown' ? 1 : -1));
      } else if (e.key === 'Enter' && results[active]) {
        e.preventDefault();
        const r = results[active];
        close();
        r.open(e.metaKey);
      }
      return;
    }
    const pane = panes[focus];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      moveSel(pane, e.key === 'ArrowDown' ? 1 : -1);
    } else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && !input.value) {
      e.preventDefault();
      inOut(pane, e.key === 'ArrowRight' ? 1 : -1);
    } else if (e.key === 'Tab' && panes.length > 1) {
      e.preventDefault();
      focus = (focus + (e.shiftKey ? panes.length - 1 : 1)) % panes.length;
      draw();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const node = pane.sel && nodeAt(pane.sel);
      if (node) openNode(node, e.metaKey);
    }
  };
  document.addEventListener('keydown', onKey, true);
  input.addEventListener('input', () => {
    query = input.value.trim();
    draw();
  });
  scrim.addEventListener('mousedown', (e) => { if (e.target === scrim) close(); });

  openBox = {
    focus: (nextMode) => {
      input.placeholder = nextMode === 'text' ? 'Search inside every note' : 'Search';
      input.focus();
      input.select();
    },
    split: () => setPanes(panes.length >= MAX_PANES ? 1 : panes.length + 1),
    close: () => close(),
    refresh: () => {
      draw();
      // Back to typing here once a box on top (a rename) has gone.
      if (!document.querySelector('.ask') && !box.contains(document.activeElement)) input.focus();
    },
  };
  input.placeholder = mode === 'text' ? 'Search inside every note' : 'Search';
  draw();
  input.focus();
}

// The tree changed (a move, a new file): redraw what's showing.
export function refreshExplorer() {
  if (openBox) openBox.refresh();
}
