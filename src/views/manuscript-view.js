// A manuscript folder's chapter list, on its folder home: drag to reorder,
// untick to leave a chapter out, and compile everything to one Word file.
// The order and the left-out chapters are saved in the folder's .opal.md.
//
//   new ManuscriptView(container, { folderName, notes, settings, io })
//   notes: [{ name: 'Chapter one.md', path }]
//   io: save({ chapters, exclude }), compile(chapterPaths) → saved path | null,
//       openFile(path), words(path) → number

import { h } from '../ui.js';

export class ManuscriptView {
  constructor(container, { folderName, notes, settings, io }) {
    this.folderName = folderName;
    this.io = io;
    this.notes = notes;
    this.exclude = new Set(settings.exclude || []);
    // Saved order first, then any new notes by name.
    const known = new Set(notes.map((n) => n.name));
    const ordered = (settings.chapters || []).filter((name) => known.has(name));
    const rest = notes.map((n) => n.name).filter((name) => !ordered.includes(name)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    this.order = [...ordered, ...rest];
    this.words = new Map();
    this.root = h('section', { class: 'ms', 'aria-label': 'Manuscript' });
    container.replaceChildren(this.root);
    this.render();
    this.countWords();
  }

  async countWords() {
    for (const name of this.order) {
      const note = this.notes.find((n) => n.name === name);
      try {
        this.words.set(name, await this.io.words(note.path));
      } catch {
        this.words.set(name, 0);
      }
    }
    this.render();
  }

  save() {
    return this.io.save({ chapters: this.order, exclude: [...this.exclude].filter((n) => this.order.includes(n)) });
  }

  included() {
    return this.order.filter((name) => !this.exclude.has(name));
  }

  render() {
    const included = this.included();
    const total = included.reduce((n, name) => n + (this.words.get(name) || 0), 0);
    const list = h('ol', { class: 'ms-list' });
    this.order.forEach((name, index) => {
      const note = this.notes.find((n) => n.name === name);
      const out = this.exclude.has(name);
      const item = h('li', { class: `ms-item${out ? ' is-out' : ''}`, draggable: 'true', 'data-name': name },
        h('span', { class: 'ms-grip', title: 'Drag to reorder', 'aria-hidden': 'true' }, '⋮⋮'),
        h('span', { class: 'ms-num' }, out ? '–' : String(included.indexOf(name) + 1)),
        h('input', {
          type: 'checkbox',
          class: 'ms-check',
          checked: !out || null,
          'aria-label': `Include ${name.replace(/\.md$/i, '')} in the compile`,
          onchange: (e) => {
            if (e.target.checked) this.exclude.delete(name);
            else this.exclude.add(name);
            this.save();
            this.render();
          },
        }),
        h('button', { class: 'ms-title', onclick: () => this.io.openFile(note.path) }, name.replace(/\.md$/i, '')),
        h('span', { class: 'ms-words' }, this.words.has(name) ? `${this.words.get(name).toLocaleString()} words` : ''),
        h('span', { class: 'ms-move' },
          h('button', { class: 'ms-arrow', 'aria-label': `Move ${name} up`, disabled: index === 0 || null, onclick: () => this.move(index, index - 1) }, '↑'),
          h('button', { class: 'ms-arrow', 'aria-label': `Move ${name} down`, disabled: index === this.order.length - 1 || null, onclick: () => this.move(index, index + 1) }, '↓')));
      item.addEventListener('dragstart', (e) => {
        this.dragging = name;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', name);
        item.classList.add('is-dragged');
      });
      item.addEventListener('dragend', () => {
        this.dragging = null;
        item.classList.remove('is-dragged');
        list.querySelectorAll('.drop-before, .drop-after').forEach((el) => el.classList.remove('drop-before', 'drop-after'));
      });
      item.addEventListener('dragover', (e) => {
        if (!this.dragging || this.dragging === name) return;
        e.preventDefault();
        const box = item.getBoundingClientRect();
        const after = e.clientY > box.top + box.height / 2;
        item.classList.toggle('drop-after', after);
        item.classList.toggle('drop-before', !after);
      });
      item.addEventListener('dragleave', () => item.classList.remove('drop-before', 'drop-after'));
      item.addEventListener('drop', (e) => {
        e.preventDefault();
        if (!this.dragging) return;
        const after = item.classList.contains('drop-after');
        const from = this.order.indexOf(this.dragging);
        let to = this.order.indexOf(name) + (after ? 1 : 0);
        if (from < to) to--;
        this.move(from, to);
      });
      list.append(item);
    });

    this.status = this.status || h('span', { class: 'ms-status', role: 'status' });
    this.root.replaceChildren(
      h('div', { class: 'ms-head' },
        h('div', { class: 'ms-heading' },
          h('span', { class: 'mono-label' }, 'Manuscript'),
          h('strong', { class: 'ms-summary' }, `${included.length} chapter${included.length === 1 ? '' : 's'} · ${total.toLocaleString()} words`)),
        this.status,
        h('button', { class: 'ms-compile', disabled: !included.length || null, onclick: () => this.compile() }, 'Compile to Word…')),
      this.order.length ? list : h('p', { class: 'ms-empty' }, 'Add notes to this folder — each one is a chapter.'),
      h('p', { class: 'ms-hint' }, 'Drag chapters into order. Untick one to leave it out. The compile puts each note’s title as its chapter heading, with a page break between chapters, and leaves out properties, sticky notes and comments.'));
  }

  move(from, to) {
    if (from === to || from < 0 || to < 0 || to >= this.order.length) return;
    const [name] = this.order.splice(from, 1);
    this.order.splice(to, 0, name);
    this.save();
    this.render();
  }

  async compile() {
    const paths = this.included().map((name) => this.notes.find((n) => n.name === name).path);
    this.status.textContent = 'Compiling…';
    try {
      const saved = await this.io.compile(paths);
      this.status.replaceChildren(saved
        ? h('span', null, `Saved ${saved.split('/').pop()} `, h('button', { class: 'ms-reveal', onclick: () => this.io.reveal() }, 'Show in Finder'))
        : '');
    } catch (err) {
      this.status.textContent = '';
      alert(`Couldn't compile the manuscript.\n\n${err.message}`);
    }
  }
}
