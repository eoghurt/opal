// Version history of a note: the snapshots Opal keeps in .opal/history, a
// preview of one with its differences from the note as it is now, and
// Restore (which snapshots the current version first, so it can be undone).
//   openHistory({ filePath, title, list(), read(id), current(), restore(text) })

import { h } from './ui.js';
import { diffLines } from './diff.js';

let closeOpen = null;

function when(time) {
  const d = new Date(time);
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const clock = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return `Today ${clock}`;
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${clock}`;
  return `${d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} ${clock}`;
}

export async function openHistory({ title, list, read, current, restore }) {
  if (closeOpen) closeOpen();
  const listEl = h('div', { class: 'history-list', role: 'listbox', 'aria-label': 'Snapshots' });
  const preview = h('div', { class: 'history-preview' }, h('p', { class: 'history-empty' }, 'Pick a snapshot to see how it differs from now.'));
  const summary = h('span', { class: 'history-summary' });
  const restoreBtn = h('button', { class: 'history-restore', disabled: true }, 'Restore this version');
  const box = h('div', { class: 'history', role: 'dialog', 'aria-label': `History of ${title}` },
    h('div', { class: 'history-head' },
      h('div', { class: 'history-title' }, h('span', { class: 'mono-label' }, 'Version history'), h('strong', null, title)),
      h('span', { class: 'history-legend' }, h('span', { class: 'history-key is-removed' }, 'only in that version'), h('span', { class: 'history-key is-added' }, 'only now')),
      h('button', { class: 'history-close', 'aria-label': 'Close', onclick: () => close() }, '×')),
    h('div', { class: 'history-body' }, listEl, h('div', { class: 'history-right' }, preview, h('div', { class: 'history-foot' }, summary, restoreBtn))));
  const scrim = h('div', { class: 'history-scrim', onclick: (e) => { if (e.target === scrim) close(); } }, box);
  document.body.append(scrim);

  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };
  document.addEventListener('keydown', onKey, true);
  function close() {
    document.removeEventListener('keydown', onKey, true);
    scrim.remove();
    closeOpen = null;
  }
  closeOpen = close;

  let chosen = null;
  const show = async (snap, button) => {
    listEl.querySelectorAll('.history-item').forEach((b) => b.classList.toggle('is-on', b === button));
    chosen = { snap, text: await read(snap.id) };
    const now = current();
    const lines = diffLines(chosen.text, now);
    const added = lines.filter((l) => l.kind === 'added').length;
    const removed = lines.filter((l) => l.kind === 'removed').length;
    summary.textContent = added || removed ? `${removed} line${removed === 1 ? '' : 's'} only in that version · ${added} only now` : 'Same as now';
    preview.replaceChildren(h('pre', { class: 'history-diff' },
      lines.map((l) => h('div', { class: `history-line is-${l.kind}` }, l.text || ' '))));
    const firstChange = preview.querySelector('.is-removed, .is-added');
    if (firstChange) firstChange.scrollIntoView({ block: 'center' });
    restoreBtn.disabled = !(added || removed);
  };
  restoreBtn.addEventListener('click', async () => {
    if (!chosen) return;
    restoreBtn.disabled = true;
    await restore(chosen.text);
    close();
  });

  const snaps = await list();
  if (!snaps.length) {
    listEl.append(h('p', { class: 'history-empty' }, 'No snapshots yet. Opal keeps one every 10 minutes while you edit, and one when you leave the note.'));
    return;
  }
  snaps.forEach((snap, i) => {
    const button = h('button', { class: 'history-item', role: 'option', onclick: () => show(snap, button) },
      h('span', { class: 'history-when' }, when(snap.time)),
      h('span', { class: 'history-size' }, `${Math.max(1, Math.round(snap.size / 1024))} KB${i === 0 ? ' · latest' : ''}`));
    listEl.append(button);
  });
  show(snaps[0], listEl.querySelector('.history-item'));
}
