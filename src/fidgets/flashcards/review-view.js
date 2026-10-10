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
//   new ReviewView(container, { io })
//   io: listCards(), reviewCard(path, line, raw, schedule) → new line, openFile(path),
//       onReviewed() (to update the due counts elsewhere)

import { h } from '../../ui.js';
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

export class ReviewView {
  constructor(container, { io }) {
    this.io = io;
    this.deck = null; // null = every deck
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
    this.startSession();
  }

  decks() {
    const today = todayKey();
    const counts = new Map();
    for (const card of this.cards) {
      const due = dueSides(card, today).length;
      for (const deck of card.decks) {
        const entry = counts.get(deck) || { due: 0, total: 0 };
        entry.due += due;
        entry.total += 1;
        counts.set(deck, entry);
      }
    }
    return [...counts.entries()].sort(([a], [b]) => (a.startsWith('#') - b.startsWith('#')) || a.localeCompare(b));
  }

  // The session's queue: every due side in the chosen deck (reviewed ones first, then new).
  startSession(practice = false) {
    const today = todayKey();
    this.practice = practice;
    const inDeck = this.cards.filter((c) => !this.deck || c.decks.includes(this.deck));
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

  render() {
    const decks = this.decks();
    const totalDue = this.cards.reduce((n, c) => n + dueSides(c).length, 0);
    const deckBar = h('div', { class: 'review-decks', role: 'group', 'aria-label': 'Decks' },
      h('button', { class: `review-deck${this.deck ? '' : ' is-on'}`, onclick: () => { this.deck = null; this.startSession(); } }, 'All decks', h('span', { class: 'review-deck-count' }, String(totalDue))),
      decks.map(([deck, n]) => h('button', {
        class: `review-deck${this.deck === deck ? ' is-on' : ''}`,
        title: `${n.total} card${n.total === 1 ? '' : 's'}`,
        onclick: () => { this.deck = deck; this.startSession(); },
      }, deck.split('/').pop(), h('span', { class: 'review-deck-count' }, String(n.due)))));
    const head = h('section', { class: 'home-head review-head' },
      h('div', { class: 'home-title' },
        h('span', { class: 'mono-label' }, 'Flashcards'),
        h('h1', { class: 'display home-h1' }, 'Review.'),
        h('p', { class: 'home-desc' }, this.cards.length
          ? `${this.practice ? 'Practising · dates unchanged · ' : ''}${this.queue.length} to go${this.done ? ` · ${this.done} done` : ''} · ${this.cards.length} card${this.cards.length === 1 ? '' : 's'} in your notes`
          : 'Write a line as Question::Answer in any note to make a card, or keep quotes in a Quotes note as "quote" - who says it.')));
    this.root.replaceChildren(head, deckBar, this.cardArea());
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
    if (card.kind === 'quote') return this.quoteArea(card);
    const question = side === 0 ? card.question : card.answer;
    const answer = side === 0 ? card.answer : card.question;
    const schedule = card.schedule[side] || null;
    const buttons = this.showing
      ? h('div', { class: 'review-grades' }, GRADES.map((grade, i) => {
        const next = nextSchedule(schedule, grade);
        return h('button', { class: `review-grade is-${grade}`, onclick: () => this.grade(grade) },
          h('span', { class: 'review-grade-name' }, `${LABELS[grade]}`),
          h('span', { class: 'review-grade-when' }, `${describeInterval(next.interval)} · ${i + 1}`));
      }))
      : h('button', { class: 'review-show', onclick: () => { this.showing = true; this.render(); } }, 'Show answer', h('span', { class: 'review-key' }, 'Space'));
    return h('div', { class: 'review-card' },
      h('div', { class: 'review-meta' },
        h('span', null, schedule ? `Seen before · every ${describeInterval(schedule.interval)}` : 'New card'),
        h('button', { class: 'review-source', onclick: () => this.io.openFile(card.path) }, card.path.replace(/\.md$/i, ''))),
      h('p', { class: 'review-q' }, ...rich(question)),
      this.showing ? h('p', { class: 'review-a' }, ...rich(answer)) : null,
      buttons);
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

  quoteArea(card) {
    const schedule = card.schedule[0] || null;
    const words = card.quote.split(/\s+/).filter(Boolean);
    const where = [...new Set([card.speaker, card.work, card.theme].filter(Boolean))].join(' · ');
    const modes = h('div', { class: 'review-modes', role: 'group', 'aria-label': 'How to practise quotes' },
      QUOTE_MODES.map(([id, label]) => h('button', {
        class: `review-mode${this.mode === id ? ' is-on' : ''}`,
        'aria-pressed': String(this.mode === id),
        onclick: () => this.setMode(id),
      }, label)));

    let prompt;
    let suggested = null;
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
      if (this.typed) {
        const marked = markTyped(card.quote, this.typed);
        suggested = marked.score >= 100 ? 'good' : marked.score >= 90 ? 'hard' : 'again';
        prompt = h('div', { class: 'review-typed' },
          h('p', { class: 'review-q review-quote' }, marked.words.map((w) => h('span', { class: `rq-word${w.ok ? '' : ' is-missed'}` }, w.word))),
          marked.extra.length ? h('p', { class: 'review-meta' }, 'Not in the quote: ', marked.extra.map((w) => h('s', { class: 'rq-extra' }, w))) : null,
          h('p', { class: 'review-score' }, h('b', null, `${Math.max(0, marked.score)}%`), marked.score >= 100 ? ' — word perfect.' : ' of the words, in order.'));
      } else {
        const box = h('textarea', { class: 'review-type', rows: '3', placeholder: 'Type the quote from memory…', 'aria-label': 'Type the quote' });
        const check = () => { this.typed = box.value; this.showing = true; this.render(); };
        box.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            check();
          }
        });
        setTimeout(() => box.focus(), 0);
        prompt = h('div', { class: 'review-typed' },
          box,
          h('div', { class: 'review-type-row' },
            h('button', { class: 'deb-btn is-primary', onclick: check }, 'Check'),
            h('span', { class: 'review-meta' }, 'Enter checks · punctuation and capitals don’t count')));
      }
    } else {
      prompt = h('p', { class: 'review-q review-quote' }, `“${card.quote}”`);
    }

    const answer = this.mode === 'who'
      ? h('p', { class: 'review-a' }, card.speaker || 'No speaker written', card.work ? h('span', { class: 'review-meta' }, ` · ${card.work}${card.theme ? ` · ${card.theme}` : ''}`) : null)
      : h('p', { class: 'review-a review-quote-full' }, `“${card.quote}”`);
    const buttons = this.showing
      ? h('div', { class: 'review-grades' }, GRADES.map((grade, i) => {
        const next = nextSchedule(schedule, grade);
        return h('button', { class: `review-grade is-${grade}${suggested === grade ? ' is-suggested' : ''}`, onclick: () => this.grade(grade) },
          h('span', { class: 'review-grade-name' }, LABELS[grade]),
          h('span', { class: 'review-grade-when' }, this.practice ? `${i + 1}` : `${describeInterval(next.interval)} · ${i + 1}`));
      }))
      : this.mode === 'type' ? null : h('button', { class: 'review-show', onclick: () => { this.showing = true; this.render(); } }, this.mode === 'who' ? 'Show who' : 'Show the quote', h('span', { class: 'review-key' }, 'Space'));
    return h('div', { class: 'review-card is-quote' },
      modes,
      h('div', { class: 'review-meta' },
        h('span', null, `Quote · ${schedule ? `seen before · every ${describeInterval(schedule.interval)}` : 'new'}`),
        h('button', { class: 'review-source', onclick: () => this.io.openFile(card.path) }, card.path.replace(/\.md$/i, ''))),
      this.mode === 'who' ? null : h('p', { class: 'review-cue' }, where || card.work || ''),
      prompt,
      this.showing && this.mode !== 'type' ? answer : null,
      buttons);
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
