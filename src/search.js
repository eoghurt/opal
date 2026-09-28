// Search: one box for finding things. Names of pages, folders and files match
// as you type; after two letters it also looks inside every note and shows
// the matching lines. ↑/↓ to move, Enter to open, Escape to close.
// Cmd+O starts on names ("Quick Open"), Cmd+Shift+F on text ("Search Vault").

import { h } from './ui.js';
import { flattenFiles } from './tree.js';
import { kindOf } from './file-types.js';

const NAME_LIMIT = 8;

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
  const folderFirst = (x) => (x.item.type === 'folder' ? 0 : 1); // a folder's home shows its own note too
  return scored.sort((a, b) => a.score - b.score || folderFirst(a) - folderFirst(b) || (b.item.modified || 0) - (a.item.modified || 0)).slice(0, NAME_LIMIT).map((s) => s.item);
}

// "…the empty house…" with the match wrapped in <mark> (built safely, no HTML).
function snippet(match) {
  return h('span', { class: 'search-snippet' },
    match.text.slice(0, match.at),
    h('mark', null, match.text.slice(match.at, match.at + match.length)),
    match.text.slice(match.at + match.length));
}

let openSearchBox = null;

// io: tree() → folder tree, search(query) → results from main,
//     openFile(path), openFolder(path), openAt(path, line, column, length)
export function openSearch(io, { mode = 'open', initial = '' } = {}) {
  if (openSearchBox) {
    openSearchBox.focus(mode);
    return;
  }
  const input = h('input', {
    class: 'search-input',
    placeholder: mode === 'text' ? 'Search inside every note…' : 'Jump to a page, folder or file…',
    spellcheck: 'false',
    'aria-label': 'Search',
    'aria-controls': 'search-results',
    'aria-autocomplete': 'list',
  });
  const status = h('span', { class: 'mono-label search-status', 'aria-live': 'polite' });
  const list = h('div', { class: 'search-results', id: 'search-results', role: 'listbox', 'aria-label': 'Results' });
  const box = h('div', { class: 'search-box', role: 'dialog', 'aria-label': 'Search' },
    h('div', { class: 'search-top' }, h('span', { class: 'mono-label' }, 'Search'), status),
    input,
    list,
    h('div', { class: 'search-foot mono-label' }, '↑↓ move · ↵ open · esc close'));
  const scrim = h('div', { class: 'search-scrim' }, box);
  document.body.append(scrim);

  let rows = []; // [{ el, open }]
  let active = 0;
  let seq = 0;
  let textTimer = null;

  const close = () => {
    clearTimeout(textTimer);
    scrim.remove();
    document.removeEventListener('keydown', onKey, true);
    openSearchBox = null;
  };

  const setActive = (index) => {
    if (!rows.length) return;
    active = (index + rows.length) % rows.length;
    rows.forEach((r, i) => {
      r.el.classList.toggle('is-active', i === active);
      r.el.setAttribute('aria-selected', String(i === active));
    });
    rows[active].el.scrollIntoView({ block: 'nearest' });
    input.setAttribute('aria-activedescendant', rows[active].el.id);
  };

  const choose = (row) => {
    close();
    row.open();
  };

  function draw(names, hits, query, searching) {
    rows = [];
    const sections = [];
    const addRow = (content, open, extraClass = '') => {
      const el = h('div', {
        class: `search-row${extraClass ? ` ${extraClass}` : ''}`,
        role: 'option',
        id: `search-row-${rows.length}`,
        'aria-selected': 'false',
      }, content);
      const row = { el, open };
      el.addEventListener('mousedown', (e) => e.preventDefault()); // keep typing focus
      el.addEventListener('click', () => choose(row));
      el.addEventListener('mousemove', () => {
        const i = rows.indexOf(row);
        if (i !== active) setActive(i);
      });
      rows.push(row);
      return el;
    };

    if (names.length) {
      sections.push(h('span', { class: 'mono-label search-section' }, 'Pages, folders & files'));
      for (const item of names) {
        const isFolder = item.type === 'folder';
        const kind = isFolder ? 'folder' : kindOf(item.path);
        sections.push(addRow([
          h('span', { class: `search-kind is-${kind}` }, isFolder ? 'folder' : kind === 'note' ? 'page' : kind),
          h('span', { class: 'search-name' }, item.name.replace(/\.md$/i, '')),
          h('span', { class: 'search-path' }, item.path.includes('/') ? item.path.slice(0, item.path.lastIndexOf('/')) : ''),
        ], () => (isFolder ? io.openFolder(item.path) : io.openFile(item.path))));
      }
    }
    if (hits.length) {
      sections.push(h('span', { class: 'mono-label search-section' }, 'In notes'));
      for (const hit of hits) {
        const title = hit.path.split('/').pop().replace(/\.md$/i, '');
        sections.push(h('div', { class: 'search-file' },
          h('span', { class: 'search-file-name' }, title,
            h('span', { class: 'search-path' }, ` ${hit.path.includes('/') ? hit.path.slice(0, hit.path.lastIndexOf('/')) : ''}`),
            h('span', { class: 'search-count' }, `${hit.count}×`))));
        for (const m of hit.matches) {
          sections.push(addRow([
            h('span', { class: 'search-line' }, String(m.line)),
            snippet(m),
          ], () => io.openAt(hit.path, m.line, m.column, m.length), 'is-hit'));
        }
      }
    }
    if (!sections.length && query) {
      sections.push(h('p', { class: 'hand search-empty' }, searching ? 'looking…' : query.length < 2 ? 'keep typing…' : 'nothing found'));
    }
    list.replaceChildren(...sections);
    status.textContent = query ? `${names.length ? `${names.length} name${names.length === 1 ? '' : 's'}` : ''}${names.length && hits.length ? ' · ' : ''}${hits.length ? `${hits.reduce((n, x) => n + x.count, 0)} in ${hits.length} note${hits.length === 1 ? '' : 's'}` : ''}` : '';
    active = 0;
    setActive(0);
  }

  function run() {
    const query = input.value.trim();
    const mine = ++seq;
    const tree = io.tree();
    const items = [...folderList(tree), ...flattenFiles(tree).filter((f) => !f.quiet)];
    const names = nameMatches(items, query);
    clearTimeout(textTimer);
    if (query.length < 2) {
      draw(names, [], query, false);
      return;
    }
    draw(names, [], query, true);
    // Looking inside notes takes a moment; wait for a pause in typing.
    textTimer = setTimeout(async () => {
      let hits = [];
      try {
        hits = await io.search(query);
      } catch {
        hits = [];
      }
      if (mine === seq) draw(names, hits, query, false);
    }, 180);
  }

  const onKey = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(active + (event.key === 'ArrowDown' ? 1 : -1));
    } else if (event.key === 'Enter' && rows[active]) {
      event.preventDefault();
      choose(rows[active]);
    }
  };
  document.addEventListener('keydown', onKey, true);
  input.addEventListener('input', run);
  scrim.addEventListener('mousedown', (e) => {
    if (e.target === scrim) close();
  });

  openSearchBox = {
    focus: (nextMode) => {
      input.placeholder = nextMode === 'text' ? 'Search inside every note…' : 'Jump to a page, folder or file…';
      input.focus();
      input.select();
    },
  };
  input.value = initial;
  input.focus();
  run();
}
