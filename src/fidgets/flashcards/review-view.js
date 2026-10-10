// Flashcard review: due cards one at a time, question first, then the answer
// and Again / Hard / Good / Easy (keys 1–4). The new schedule is written back
// into the card's line as the Spaced Repetition plugin's hidden comment.
// Each folder is a deck; a note's tags make extra decks.
//
// Quote cards (lines from a Quotes note, see main.js) are practised four
// ways, picked above the card: First letters (each word's first letter),
// Fill the gaps (more words hidden the better you know it), Type it (typed
// from memory and marked word by word) and Who said it (the quote shown,
// the speaker and text to recall). "Practise anyway" runs through a deck
// without changing any review dates.
//
// Decks: each folder, tag and quote theme is a deck. Edit decks lets you
// hide decks, rename them, put several in a folder (picking the folder
// practises them together; each deck can still be picked alone) and set how
// a deck's cards are practised — Quote (the four ways above) or Basic (front,
// then back). One card's type can be changed on the card. This is kept in the
// vault's .opal/settings.json (flashcards), never in the notes.
//
//   new ReviewView(container, { io })
//   io: listCards(), reviewCard(path, line, raw, schedule) → new line, openFile(path),
//       onReviewed() (to update the due counts elsewhere), settings() → flashcards
//       settings, saveSettings(flashcards)

import { h, icon } from '../../ui.js';
import { showMenu } from '../../context-menu.js';
import { inlineRuns } from '../../export/note-structure.js';
import { GRADES, nextSchedule, describeInterval, dueSides, todayKey } from './schedule.js';

const LABELS = { again: 'Again', hard: 'Hard', good: 'Good', easy: 'Easy' };
const QUOTE_MODES = [['letters', 'First letters'], ['gaps', 'Fill the gaps'], ['type', 'Type it'], ['who', 'Who said it']];

function loadMode() {
  try {
    return localStorage.getItem('opal.quoteMode') || 'letters';
  } catch {
    return 'letters';
  }
}

const bare = (w) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

// Typed words against the quote's, in order: [{ word, ok }] for the quote and
// the typed words that weren't in it. A longest-common-run match, so one
// missed word doesn't mark everything after it wrong.
export function markTyped(quote, typed) {
  const a = quote.split(/\s+/).filter(Boolean);
  const b = typed.split(/\s+/).filter(Boolean);
  const A = a.map(bare);
  const B = b.map(bare);
  const L = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const words = [];
  const extra = [];
  let i = 0;
  let j = 0;
  while (i < a.length) {
    if (j < b.length && A[i] === B[j]) { words.push({ word: a[i], ok: true }); i++; j++; }
    else if (j < b.length && L[i][j + 1] >= L[i + 1][j]) { extra.push(b[j]); j++; }
    else { words.push({ word: a[i], ok: false }); i++; }
  }
  while (j < b.length) extra.push(b[j++]);
  const right = words.filter((w) => w.ok).length;
  return { words, extra, score: a.length ? Math.round(((right - extra.length * 0.5) / a.length) * 100) : 0 };
}

// Card text with its **bold** / *italic* / ==highlight== shown.
function rich(text) {
  return inlineRuns(text).map((run) => {
    if (run.br) return h('br');
    const style = [run.bold ? 'font-weight:700' : '', run.italic ? 'font-style:italic' : '', run.highlight ? 'background:rgb(255 210 63 / 0.55)' : '', run.code ? 'font-family:var(--mono)' : ''].filter(Boolean).join(';');
    return style ? h('span', { style }, run.text) : run.text;
  });
}

const TYPE_NAMES = { quote: 'Quote', basic: 'Basic' };

function blankSettings(s) {
  const f = s && typeof s === 'object' ? s : {};
  return {
    hidden: Array.isArray(f.hidden) ? f.hidden : [],
    folders: Array.isArray(f.folders) ? f.folders.filter((x) => x && x.name).map((x) => ({ name: String(x.name), decks: Array.isArray(x.decks) ? x.decks : [], ...(x.keep ? { keep: true } : {}) })) : [],
    names: f.names && typeof f.names === 'object' ? f.names : {},
    types: f.types && typeof f.types === 'object' ? f.types : {},
    cardTypes: f.cardTypes && typeof f.cardTypes === 'object' ? f.cardTypes : {},
    keepOnly: Array.isArray(f.keepOnly) ? f.keepOnly : null,
  };
}

// A deck's name as shown: its own name if you gave it one, else the theme,
// tag or folder it comes from.
function derivedName(id) {
  if (id.startsWith('theme:')) return id.slice(id.indexOf('::') + 2);
  return id.split('/').pop();
}

const cardKey = (card) => `${card.path}|${card.question}`;

export class ReviewView {
  constructor(container, { io }) {
    this.io = io;
    this.deck = null; // null = every deck; a deck's id; or 'folder:<name>'
    this.flash = blankSettings(io.settings ? io.settings() : null);
    this.editing = false;
    this.mode = loadMode(); // how quote cards are practised
    this.practice = false; // running through a deck without changing review dates
    this.root = h('div', { class: 'review' });
    container.replaceChildren(this.root);
    this.onKey = (e) => this.key(e);
    document.addEventListener('keydown', this.onKey);
    this.load();
  }

  destroy() {
    document.removeEventListener('keydown', this.onKey);
  }

  async load() {
    this.root.replaceChildren(h('p', { class: 'review-empty' }, 'Finding your cards…'));
    this.cards = await this.io.listCards();
    // "Keep only these": hide every other deck, once.
    if (this.flash.keepOnly) {
      const keep = new Set(this.flash.keepOnly);
      this.flash.hidden = this.allDecks().filter((d) => !keep.has(d));
      this.flash.keepOnly = null;
      this.save();
    }
    this.startSession();
  }

  save() {
    const { keepOnly, ...rest } = this.flash;
    if (this.io.saveSettings) this.io.saveSettings(keepOnly ? { ...rest, keepOnly } : rest);
    if (this.io.onReviewed) this.io.onReviewed(); // hidden decks change the due count
  }

  deckName(id) {
    return this.flash.names[id] || derivedName(id);
  }

  allDecks() {
    return [...new Set(this.cards.flatMap((c) => c.decks))].sort((a, b) => (a.startsWith('#') - b.startsWith('#')) || this.deckName(a).localeCompare(this.deckName(b)));
  }

  // Cards in at least one deck that isn't hidden.
  visibleCards() {
    const hidden = new Set(this.flash.hidden);
    return this.cards.filter((c) => c.decks.some((d) => !hidden.has(d)));
  }

  // The cards in the deck or folder picked (every visible card for null).
  cardsIn(sel) {
    const visible = this.visibleCards();
    if (!sel) return visible;
    if (sel.startsWith('folder:')) {
      const folder = this.flash.folders.find((f) => `folder:${f.name}` === sel);
      const set = new Set(folder ? folder.decks : []);
      return visible.filter((c) => c.decks.some((d) => set.has(d)));
    }
    return visible.filter((c) => c.decks.includes(sel));
  }

  // How a card is practised: its own type, its deck's, or what it is.
  typeOf(card) {
    const own = this.flash.cardTypes[cardKey(card)];
    if (own) return own;
    for (const d of card.decks) if (this.flash.types[d]) return this.flash.types[d];
    return card.kind === 'quote' ? 'quote' : 'basic';
  }

  decks() {
    const today = todayKey();
    const counts = new Map();
    const hidden = new Set(this.flash.hidden);
    for (const card of this.cards) {
      const due = dueSides(card, today).length;
      for (const deck of card.decks) {
        if (hidden.has(deck)) continue;
        const entry = counts.get(deck) || { due: 0, total: 0 };
        entry.due += due;
        entry.total += 1;
        counts.set(deck, entry);
      }
    }
    return [...counts.entries()].sort(([a], [b]) => (a.startsWith('#') - b.startsWith('#')) || this.deckName(a).localeCompare(this.deckName(b)));
  }

  // The session's queue: every due side in the chosen deck (reviewed ones first, then new).
  startSession(practice = false) {
    const today = todayKey();
    this.practice = practice;
    const inDeck = this.cardsIn(this.deck);
    let items = [];
    for (const card of inDeck) for (const side of (practice ? (card.reversed ? [0, 1] : [0]) : dueSides(card, today))) items.push({ card, side });
    if (practice) items = items.sort(() => Math.random() - 0.5);
    else items.sort((a, b) => (a.card.schedule[a.side] ? 0 : 1) - (b.card.schedule[b.side] ? 0 : 1));
    this.queue = items;
    this.done = 0;
    this.again = new Set();
    this.showing = false;
    this.typed = null;
    this.render();
  }

  // Folders of decks: + Folder, drag a deck onto a folder (or onto another
  // deck for a new folder of both), right-click either for the rest.
  moveToFolder(id, name) {
    const folders = this.flash.folders.map((f) => ({ ...f, decks: f.decks.filter((d) => d !== id) }));
    if (name) {
      const at = folders.find((f) => f.name === name);
      if (at) at.decks.push(id);
      else folders.push({ name, decks: [id] });
    }
    this.flash.folders = folders.filter((f) => f.decks.length || f.keep);
    this.save();
    this.render();
  }

  newFolderName(base = 'New folder') {
    let name = base;
    for (let i = 2; this.flash.folders.some((f) => f.name === name); i++) name = `${base} ${i}`;
    return name;
  }

  // An inline name box in place of a chip (prompt() doesn't work in Opal).
  nameBox(value, onDone) {
    const input = h('input', { class: 'review-deck review-deck-input', value, 'aria-label': 'Folder name' });
    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      this.renaming = null;
      onDone(save ? input.value.trim() : null);
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
    setTimeout(() => { input.focus(); input.select(); }, 0);
    return input;
  }

  render() {
    const decks = this.decks();
    const due = (list) => list.reduce((n, c) => n + dueSides(c).length, 0);
    const totalDue = due(this.visibleCards());
    const inFolder = new Set(this.flash.folders.flatMap((f) => f.decks));
    const shown = (id) => decks.some(([d]) => d === id);
    const dragOver = (el, onDrop) => {
      el.addEventListener('dragover', (e) => { if (this.dragDeck) { e.preventDefault(); el.classList.add('is-drop'); } });
      el.addEventListener('dragleave', () => el.classList.remove('is-drop'));
      el.addEventListener('drop', (e) => { e.preventDefault(); el.classList.remove('is-drop'); const id = this.dragDeck; this.dragDeck = null; if (id) onDrop(id); });
      return el;
    };
    const chip = (sel, label, count, extra = '') => h('button', {
      class: `review-deck${this.deck === sel ? ' is-on' : ''}${extra}`,
      onclick: () => { this.deck = sel; this.editing = false; this.startSession(); },
    }, label, h('span', { class: 'review-deck-count' }, String(count)));
    const deckChip = (id, n) => {
      const el = chip(id, this.deckName(id), n.due);
      el.draggable = true;
      el.title = 'Drag onto a folder to put it in · right-click for more';
      el.addEventListener('dragstart', (e) => { this.dragDeck = id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); });
      el.addEventListener('dragend', () => { this.dragDeck = null; });
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const folder = this.flash.folders.find((f) => f.decks.includes(id));
        showMenu(e, {
          title: this.deckName(id),
          items: [
            ...this.flash.folders.filter((f) => f !== folder).map((f) => ({ label: `Move to ${f.name}`, onSelect: () => this.moveToFolder(id, f.name) })),
            { label: 'New folder with this deck', onSelect: () => { const name = this.newFolderName(); this.moveToFolder(id, name); this.renaming = `folder:${name}`; this.render(); } },
            folder ? { label: `Take out of ${folder.name}`, onSelect: () => this.moveToFolder(id, null) } : null,
            'separator',
            { label: 'Hide this deck', onSelect: () => { this.flash.hidden = [...this.flash.hidden, id]; if (this.deck === id) this.deck = null; this.save(); this.startSession(); }, hint: 'Edit decks shows it again' },
          ].filter(Boolean),
        });
      });
      // A deck dropped on a deck: a new folder of the two.
      return dragOver(el, (dropped) => {
        if (dropped === id) return;
        const name = this.newFolderName();
        this.flash.folders = [...this.flash.folders.map((f) => ({ ...f, decks: f.decks.filter((d) => d !== id && d !== dropped) })).filter((f) => f.decks.length || f.keep), { name, decks: [id, dropped] }];
        this.renaming = `folder:${name}`;
        this.save();
        this.render();
      });
    };
    const folderChip = (f) => {
      const sel = `folder:${f.name}`;
      if (this.renaming === sel) {
        return this.nameBox(f.name, (name) => {
          if (name && name !== f.name && !this.flash.folders.some((x) => x.name === name)) {
            f.name = name;
            if (this.deck === sel) this.deck = `folder:${name}`;
          }
          this.save();
          this.render();
        });
      }
      const el = chip(sel, h('span', null, icon('folder', 13), ` ${f.name}`), due(this.cardsIn(sel)), ' is-folder');
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showMenu(e, {
          title: f.name,
          items: [
            { label: 'Rename folder', onSelect: () => { this.renaming = sel; this.render(); } },
            { label: 'Ungroup', hint: 'the decks stay', onSelect: () => { this.flash.folders = this.flash.folders.filter((x) => x !== f); if (this.deck === sel) this.deck = null; this.save(); this.startSession(); } },
          ],
        });
      });
      return dragOver(el, (id) => this.moveToFolder(id, f.name));
    };
    const addFolder = this.renaming === '+new'
      ? this.nameBox('', (name) => {
        if (name && !this.flash.folders.some((f) => f.name === name)) this.flash.folders = [...this.flash.folders, { name, decks: [], keep: true }];
        this.save();
        this.render();
      })
      : h('button', { class: 'review-deck is-add', title: 'A folder groups decks: drag decks onto it', onclick: () => { this.renaming = '+new'; this.render(); } }, '+ Folder');
    const hasQuotes = this.cardsIn(this.deck).some((c) => this.typeOf(c) === 'quote');
    const modePick = hasQuotes ? h('select', { class: 'review-mode-pick', 'aria-label': 'How quote cards are practised', title: 'How quote cards are practised' },
      QUOTE_MODES.map(([id, label]) => h('option', { value: id, selected: this.mode === id }, label))) : null;
    if (modePick) modePick.addEventListener('change', () => this.setMode(modePick.value));
    const openFolder = this.flash.folders.find((f) => this.deck === `folder:${f.name}` || f.decks.includes(this.deck));
    const deckBar = h('div', { class: 'review-decks', role: 'group', 'aria-label': 'Decks' },
      chip(null, 'All decks', totalDue),
      this.flash.folders.filter((f) => f.keep || f.decks.some(shown)).map(folderChip),
      decks.filter(([id]) => !inFolder.has(id)).map(([id, n]) => deckChip(id, n)),
      addFolder,
      h('span', { class: 'review-decks-fill' }),
      modePick,
      h('button', { class: `review-deck is-edit${this.editing ? ' is-on' : ''}`, onclick: () => { this.editing = !this.editing; this.render(); } }, this.editing ? 'Done' : 'Edit decks'));
    // Inside a folder: its decks, to pick one (and drag out of it).
    const subBar = openFolder ? h('div', { class: 'review-decks is-sub', role: 'group', 'aria-label': `Decks in ${openFolder.name}` },
      openFolder.decks.filter(shown).map((d) => deckChip(d, (decks.find(([id]) => id === d) || [0, { due: 0 }])[1]))) : null;
    const head = h('section', { class: 'home-head review-head' },
      h('div', { class: 'home-title' },
        h('span', { class: 'mono-label' }, 'Flashcards'),
        h('h1', { class: 'display home-h1' }, 'Review.'),
        h('p', { class: 'home-desc' }, this.cards.length
          ? `${this.practice ? 'Practising · dates unchanged · ' : ''}${this.queue.length} to go${this.done ? ` · ${this.done} done` : ''} · ${this.cards.length} card${this.cards.length === 1 ? '' : 's'} in your notes`
          : 'Write a line as Question::Answer in any note to make a card, or keep quotes in a Quotes note as "quote" - who says it.')));
    this.root.replaceChildren(head, deckBar, subBar || '', this.editing ? this.deckEditor() : this.cardArea());
  }

  cardArea() {
    const item = this.queue[0];
    if (!item) {
      const upcoming = this.cards.flatMap((c) => c.schedule.map((s) => s.due)).filter((d) => d > todayKey()).sort()[0];
      const inDeck = this.cards.filter((c) => !this.deck || c.decks.includes(this.deck)).length;
      return h('div', { class: 'review-card is-done' },
        h('p', { class: 'review-q' }, this.done ? `All done — ${this.done} ${this.practice ? 'practised' : 'reviewed'}.` : 'Nothing due right now.'),
        upcoming && !this.practice ? h('p', { class: 'review-meta' }, `Next cards are due ${new Date(`${upcoming}T12:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}.`) : null,
        inDeck ? h('div', { class: 'review-done-actions' },
          h('button', { class: 'deb-btn', onclick: () => this.startSession(true) }, `Practise anyway · ${inDeck} card${inDeck === 1 ? '' : 's'}`),
          h('span', { class: 'review-meta' }, 'Goes through this deck without changing any review dates.')) : null);
    }
    const { card, side } = item;
    if (this.typeOf(card) === 'quote') return this.quoteArea(this.asQuote(card, side), card);
    // A quote practised as a plain card: who and where on the front, the quote on the back.
    const question = card.kind === 'quote' ? ([...new Set([card.speaker, card.work, card.theme].filter(Boolean))].join(' · ') || 'Which quote?') : side === 0 ? card.question : card.answer;
    const answer = card.kind === 'quote' ? `“${card.quote}”` : side === 0 ? card.answer : card.question;
    return h('div', { class: 'review-card' },
      this.cardTop(card),
      h('p', { class: 'review-q' }, ...rich(question)),
      this.showing ? h('p', { class: 'review-a' }, ...rich(answer)) : null,
      this.cardFoot(card.schedule[side] || null));
  }

  // The top of a card: Basic / Quote, and a link to its note.
  cardTop(card) {
    const type = this.typeOf(card);
    return h('div', { class: 'review-top' },
      h('div', { class: 'review-type-seg', role: 'group', 'aria-label': 'Card type' },
        Object.entries(TYPE_NAMES).map(([id, label]) => h('button', {
          class: type === id ? 'is-on' : '',
          'aria-pressed': String(type === id),
          onclick: () => {
            if (type === id) return;
            this.flash.cardTypes = { ...this.flash.cardTypes, [cardKey(card)]: id };
            this.save();
            this.showing = false;
            this.typed = null;
            this.render();
          },
        }, label))),
      h('button', { class: 'review-link', title: `Open ${card.path.replace(/\.md$/i, '')}`, 'aria-label': 'Open the note this card is in', onclick: () => this.io.openFile(card.path) }, icon('link', 15)));
  }

  // Flip, or once flipped, the grades.
  cardFoot(schedule, { suggested = null, flip = () => { this.showing = true; this.render(); } } = {}) {
    if (!this.showing) return h('button', { class: 'review-show', onclick: flip }, 'Flip');
    return h('div', { class: 'review-grades' }, GRADES.map((grade) => {
      const next = nextSchedule(schedule, grade);
      return h('button', { class: `review-grade is-${grade}${suggested === grade ? ' is-suggested' : ''}`, onclick: () => this.grade(grade) },
        h('span', { class: 'review-grade-name' }, LABELS[grade]),
        this.practice ? null : h('span', { class: 'review-grade-when' }, describeInterval(next.interval)));
    }));
  }

  async grade(grade) {
    const item = this.queue[0];
    if (!item || !this.showing) return;
    const { card, side } = item;
    const today = todayKey();
    const next = nextSchedule(card.schedule[side] || null, grade, today);
    const schedule = card.reversed ? [0, 1].map((i) => (i === side ? next : card.schedule[i] || { due: today, interval: 1, ease: 250 })) : [next];
    if (!this.practice) {
      try {
        card.raw = await this.io.reviewCard(card.path, card.line, card.raw, schedule);
        card.schedule = schedule;
      } catch (err) {
        alert(`Couldn't save that review.\n\n${err.message}`);
        return;
      }
    }
    this.queue.shift();
    // Again: once more before the session ends.
    const key = `${card.path}:${card.line}:${side}`;
    if (grade === 'again' && !this.again.has(key)) {
      this.again.add(key);
      this.queue.push(item);
    }
    this.done += 1;
    this.showing = false;
    this.typed = null;
    if (!this.practice) this.io.onReviewed();
    this.render();
  }

  // ---------- Card types ----------

  // A Question::Answer card practised as a quote: the question is the cue,
  // the answer the words to learn.
  asQuote(card, side) {
    if (card.kind === 'quote') return card;
    const cue = side === 0 ? card.question : card.answer;
    const words = side === 0 ? card.answer : card.question;
    return { ...card, kind: 'quote', quote: words.replace(/^["“‘']|["”’']$/g, ''), speaker: '', work: cue, theme: '', schedule: [card.schedule[side]].filter(Boolean), source: card };
  }

  // ---------- Editing decks ----------

  deckEditor() {
    const counts = new Map();
    for (const card of this.cards) for (const d of card.decks) counts.set(d, (counts.get(d) || 0) + 1);
    const hidden = new Set(this.flash.hidden);
    const folderOf = (id) => (this.flash.folders.find((f) => f.decks.includes(id)) || {}).name || '';
    const change = (fn) => { fn(); this.save(); this.render(); };
    const setFolder = (id, name) => change(() => {
      const folders = this.flash.folders.map((f) => ({ ...f, decks: f.decks.filter((d) => d !== id) }));
      if (name) {
        const at = folders.find((f) => f.name === name);
        if (at) at.decks.push(id);
        else folders.push({ name, decks: [id] });
      }
      this.flash.folders = folders.filter((f) => f.decks.length || f.keep);
    });
    const rows = this.allDecks().map((id) => {
      const name = h('input', { class: 'review-ed-name', value: this.deckName(id), 'aria-label': 'Deck name', title: derivedName(id) });
      name.addEventListener('change', () => change(() => {
        const v = name.value.trim();
        const names = { ...this.flash.names };
        if (!v || v === derivedName(id)) delete names[id];
        else names[id] = v;
        this.flash.names = names;
      }));
      const folder = h('select', { class: 'review-ed-select', 'aria-label': 'Folder' },
        h('option', { value: '' }, 'No folder'),
        this.flash.folders.map((f) => h('option', { value: f.name, selected: folderOf(id) === f.name }, f.name)));
      folder.addEventListener('change', () => setFolder(id, folder.value));
      const type = h('select', { class: 'review-ed-select', 'aria-label': 'Card type' },
        h('option', { value: '' }, 'Each card’s own type'),
        Object.entries(TYPE_NAMES).map(([t, label]) => h('option', { value: t, selected: this.flash.types[id] === t }, `${label} cards`)));
      type.addEventListener('change', () => change(() => {
        const types = { ...this.flash.types };
        if (type.value) types[id] = type.value;
        else delete types[id];
        this.flash.types = types;
      }));
      const show = h('input', { type: 'checkbox', checked: !hidden.has(id), 'aria-label': `Show ${this.deckName(id)}` });
      show.addEventListener('change', () => change(() => {
        this.flash.hidden = show.checked ? this.flash.hidden.filter((d) => d !== id) : [...this.flash.hidden, id];
      }));
      return h('div', { class: `review-ed-row${hidden.has(id) ? ' is-hidden' : ''}` },
        show, name, h('span', { class: 'review-ed-count' }, `${counts.get(id) || 0}`), folder, type);
    });
    return h('div', { class: 'review-card review-editor' },
      h('div', { class: 'review-ed-head' }, h('b', null, 'Decks'), h('span', { class: 'review-meta' }, 'Untick to hide a deck · make folders with + Folder, then pick one here or drag decks onto it · kept in .opal/settings.json, not your notes')),
      h('div', { class: 'review-ed-row is-labels' }, h('span'), h('span', null, 'Name'), h('span', null, 'Cards'), h('span', null, 'Folder'), h('span', null, 'Practise as')),
      rows);
  }

  // ---------- Quote cards ----------

  setMode(mode) {
    this.mode = mode;
    try {
      localStorage.setItem('opal.quoteMode', mode);
    } catch {
      // Not remembered this time.
    }
    this.showing = false;
    this.typed = null;
    this.render();
  }

  quoteArea(card, original = card) {
    const schedule = card.schedule[0] || null;
    const words = card.quote.split(/\s+/).filter(Boolean);
    const where = [...new Set([card.speaker, card.work, card.theme].filter(Boolean))].join(' · ');
    let prompt;
    let suggested = null;
    let flip;
    if (this.mode === 'letters') {
      prompt = h('p', { class: 'review-q review-quote is-letters' }, words.map((w) => {
        const m = /^([^\p{L}\p{N}]*)([\p{L}\p{N}])(.*?)([^\p{L}\p{N}]*)$/u.exec(w);
        return h('span', { class: 'rq-word' }, m ? `${m[1]}${m[2]}${m[4]}` : w);
      }));
    } else if (this.mode === 'gaps') {
      // Hide more of it the longer you've known it.
      const share = !schedule ? 0.35 : schedule.interval < 7 ? 0.55 : schedule.interval < 30 ? 0.75 : 1;
      if (!this.gaps || this.gaps.key !== `${card.path}:${card.line}`) {
        const candidates = words.map((w, i) => i).filter((i) => bare(words[i]).length > (share < 1 ? 2 : 0));
        const n = Math.max(1, Math.round(candidates.length * share));
        this.gaps = { key: `${card.path}:${card.line}`, hidden: new Set(candidates.sort(() => Math.random() - 0.5).slice(0, n)) };
      }
      prompt = h('p', { class: 'review-q review-quote' }, words.map((w, i) => (this.gaps.hidden.has(i) && !this.showing
        ? h('button', { class: 'rq-gap', style: `width: ${Math.max(2, bare(w).length) * 0.62}em`, title: 'Click to see this word', onclick: (e) => { e.currentTarget.replaceWith(h('span', { class: 'rq-word is-peeked' }, w)); } })
        : h('span', { class: `rq-word${this.gaps.hidden.has(i) ? ' is-filled' : ''}` }, w))));
    } else if (this.mode === 'type') {
      if (this.typed != null) {
        const marked = markTyped(card.quote, this.typed);
        suggested = marked.score >= 100 ? 'good' : marked.score >= 90 ? 'hard' : 'again';
        prompt = h('div', { class: 'review-typed' },
          h('p', { class: 'review-q review-quote' }, marked.words.map((w) => h('span', { class: `rq-word${w.ok ? '' : ' is-missed'}` }, w.word))),
          marked.extra.length ? h('p', { class: 'review-cue' }, 'Not in the quote: ', marked.extra.map((w) => h('s', { class: 'rq-extra' }, w))) : null,
          h('p', { class: 'review-score' }, h('b', null, `${Math.max(0, marked.score)}%`)));
      } else {
        const box = h('textarea', { class: 'review-type', rows: '3', placeholder: 'Type it from memory…', 'aria-label': 'Type the quote' });
        flip = () => { this.typed = box.value; this.showing = true; this.render(); };
        box.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            flip();
          }
        });
        setTimeout(() => box.focus(), 0);
        prompt = h('div', { class: 'review-typed' }, box);
      }
    } else {
      prompt = h('p', { class: 'review-q review-quote' }, `“${card.quote}”`);
    }
    const answer = this.mode === 'who'
      ? h('p', { class: 'review-a' }, where || 'No speaker written')
      : this.mode === 'type' ? null : h('p', { class: 'review-a review-quote-full' }, `“${card.quote}”`);
    return h('div', { class: 'review-card is-quote' },
      this.cardTop(original),
      this.mode === 'who' ? null : h('p', { class: 'review-cue' }, where),
      prompt,
      this.showing ? answer : null,
      this.cardFoot(schedule, { suggested, ...(flip ? { flip } : {}) }));
  }

  key(e) {
    if (!this.root.isConnected || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest && e.target.closest('input, textarea, [contenteditable]')) return;
    if (!this.showing && (e.key === ' ' || e.key === 'Enter') && this.queue.length) {
      e.preventDefault();
      this.showing = true;
      this.render();
    } else if (this.showing && ['1', '2', '3', '4'].includes(e.key)) {
      e.preventDefault();
      this.grade(GRADES[Number(e.key) - 1]);
    }
  }
}
