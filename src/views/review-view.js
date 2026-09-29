// Flashcard review: due cards one at a time, question first, then the answer
// and Again / Hard / Good / Easy (keys 1–4). The new schedule is written back
// into the card's line as the Spaced Repetition plugin's hidden comment.
// Each folder is a deck; a note's tags make extra decks.
//
//   new ReviewView(container, { io })
//   io: listCards(), reviewCard(path, line, raw, schedule) → new line, openFile(path),
//       onReviewed() (to update the due counts elsewhere)

import { h } from '../ui.js';
import { inlineRuns } from '../export/note-structure.js';
import { GRADES, nextSchedule, describeInterval, dueSides, todayKey } from '../flashcards/schedule.js';

const LABELS = { again: 'Again', hard: 'Hard', good: 'Good', easy: 'Easy' };

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
  startSession() {
    const today = todayKey();
    const inDeck = this.cards.filter((c) => !this.deck || c.decks.includes(this.deck));
    const items = [];
    for (const card of inDeck) for (const side of dueSides(card, today)) items.push({ card, side });
    items.sort((a, b) => (a.card.schedule[a.side] ? 0 : 1) - (b.card.schedule[b.side] ? 0 : 1));
    this.queue = items;
    this.done = 0;
    this.again = new Set();
    this.showing = false;
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
          ? `${this.queue.length} to go${this.done ? ` · ${this.done} done` : ''} · ${this.cards.length} card${this.cards.length === 1 ? '' : 's'} in your notes`
          : 'Write a line as Question::Answer in any note to make a card.')));
    this.root.replaceChildren(head, deckBar, this.cardArea());
  }

  cardArea() {
    const item = this.queue[0];
    if (!item) {
      const upcoming = this.cards.flatMap((c) => c.schedule.map((s) => s.due)).filter((d) => d > todayKey()).sort()[0];
      return h('div', { class: 'review-card is-done' },
        h('p', { class: 'review-q' }, this.done ? `All done — ${this.done} reviewed.` : 'Nothing due right now.'),
        upcoming ? h('p', { class: 'review-meta' }, `Next cards are due ${new Date(`${upcoming}T12:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}.`) : null);
    }
    const { card, side } = item;
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
    try {
      card.raw = await this.io.reviewCard(card.path, card.line, card.raw, schedule);
      card.schedule = schedule;
    } catch (err) {
      alert(`Couldn't save that review.\n\n${err.message}`);
      return;
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
    this.io.onReviewed();
    this.render();
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
