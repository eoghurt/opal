// The timer in the top bar. Two kinds:
//  • Prep: a countdown (15, 30, 60 minutes or a custom time).
//  • Pomodoro: focus, short break, focus… and a long break after a set
//    (lengths from Settings → Timer).
// When a countdown or a focus part ends there's a Mac notification and the
// session goes in the Logbook records (.opal/logbook.md), linked to the note
// that was open when it started. Stopping early records the minutes done.
// A running timer survives Opal restarting (it's remembered in this window).
//
//   const timer = new PrepTimer({ openNote(), notify(payload), record(session), openSettings() });
//   timer.el  → put it in the top bar

import { h, icon } from './ui.js';

const STORE = 'opal.prepTimer';
const PRESETS = [15, 30, 60];
const POMODORO_DEFAULTS = { focus: 25, short: 5, long: 15, rounds: 4, autoStart: true };
const PHASE_NAMES = { focus: 'Focus', short: 'Short break', long: 'Long break' };

function two(n) {
  return String(n).padStart(2, '0');
}

function dayAndTime(ms) {
  const d = new Date(ms);
  return { day: `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`, time: `${two(d.getHours())}:${two(d.getMinutes())}` };
}

function noteLabel(note) {
  return note ? note.split('/').pop().replace(/\.md$/i, '') : '';
}

export class PrepTimer {
  constructor({ openNote, notify, record, openSettings }) {
    this.io = { openNote, notify, record, openSettings: openSettings || (() => {}) };
    this.pomodoro = { ...POMODORO_DEFAULTS };
    // { mode: 'prep' | 'pomodoro', start, end, minutes, note, phase, round, waiting }
    // `waiting` (Pomodoro, when parts don't start by themselves): the next
    // phase, ready to start — no countdown running.
    this.running = null;
    this.listeners = new Set();
    this.el = h('div', { class: 'bar-cell bar-timer' });
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (saved && (saved.end || saved.waiting)) this.running = { mode: 'prep', ...saved };
    } catch {
      // Nothing remembered.
    }
    this.tick = this.tick.bind(this);
    this.render();
    if (this.running) this.tick();
  }

  // Pomodoro lengths from Settings: { focus, short, long, rounds, autoStart }.
  setPomodoro(settings) {
    this.pomodoro = { ...POMODORO_DEFAULTS, ...(settings || {}) };
    this.render();
  }

  // Something else showing the timer (the home page's widget) hears every change.
  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // What's happening now: { mode, phase, waiting, left (seconds), total, round, rounds, note } or null.
  state() {
    const run = this.running;
    if (!run) return null;
    return {
      mode: run.mode,
      phase: run.phase || null,
      waiting: run.waiting || null,
      left: run.end ? Math.max(0, Math.ceil((run.end - Date.now()) / 1000)) : 0,
      total: (run.minutes || 0) * 60,
      round: run.round || 1,
      rounds: this.pomodoro.rounds,
      note: run.note,
    };
  }

  remember() {
    try {
      if (this.running) localStorage.setItem(STORE, JSON.stringify(this.running));
      else localStorage.removeItem(STORE);
    } catch {
      // Private window or blocked storage: the timer just won't survive a restart.
    }
  }

  start(minutes) {
    const m = Math.max(1, Math.min(600, Math.round(minutes)));
    const now = Date.now();
    this.running = { mode: 'prep', start: now, end: now + m * 60000, minutes: m, note: this.io.openNote() };
    this.remember();
    this.closeMenu();
    this.tick();
  }

  startPomodoro() {
    this.closeMenu();
    this.beginPhase('focus', 1, this.io.openNote(), Date.now());
  }

  // Starts one part of a Pomodoro set, from `at` (ms).
  beginPhase(phase, round, note, at) {
    const minutes = Math.max(1, Math.round(this.pomodoro[phase] || POMODORO_DEFAULTS[phase]));
    this.running = { mode: 'pomodoro', phase, round, note, start: at, end: at + minutes * 60000, minutes };
    this.remember();
    this.tick();
  }

  // The part after `phase` in `round`.
  nextPhase(phase, round) {
    if (phase !== 'focus') return { phase: 'focus', round: phase === 'long' ? 1 : round + 1 };
    return { phase: round >= this.pomodoro.rounds ? 'long' : 'short', round };
  }

  // A Pomodoro part has run out: record a focus part, say what's next, and
  // start it (or wait for Start). `quiet` skips the notification (a part that
  // ended while Opal was closed).
  endPhase(quiet) {
    const run = this.running;
    if (run.phase === 'focus') this.recordSession(run, run.minutes);
    const next = this.nextPhase(run.phase, run.round);
    if (!quiet) {
      const title = run.phase === 'focus' ? 'Focus done' : 'Break over';
      const body = next.phase === 'focus'
        ? `Focus ${next.round} of ${this.pomodoro.rounds} — ${this.pomodoro.focus} minutes${run.note ? ` · ${noteLabel(run.note)}` : ''}`
        : `${PHASE_NAMES[next.phase]} — ${this.pomodoro[next.phase]} minutes`;
      this.io.notify({ title, body });
      this.flash();
    }
    if (this.pomodoro.autoStart) {
      this.beginPhase(next.phase, next.round, run.note, run.end);
    } else {
      this.running = { mode: 'pomodoro', waiting: next.phase, round: next.round, note: run.note };
      this.remember();
      this.render();
    }
  }

  // Waiting between Pomodoro parts: start the next one now.
  resume() {
    const run = this.running;
    if (!run || !run.waiting) return;
    this.closeMenu();
    this.beginPhase(run.waiting, run.round, run.note, Date.now());
  }

  // Skips the rest of this Pomodoro part (a skipped focus part isn't recorded).
  skip() {
    const run = this.running;
    if (!run || run.mode !== 'pomodoro') return;
    this.closeMenu();
    const next = this.nextPhase(run.waiting || run.phase, run.round);
    this.beginPhase(next.phase, next.round, run.note, Date.now());
  }

  recordSession(run, minutes) {
    if (minutes < 1) return;
    const { day, time } = dayAndTime(run.start);
    this.io.record({ day, time, minutes, note: run.note ? run.note.replace(/\.md$/i, '') : null, kind: run.mode === 'pomodoro' ? 'pomodoro' : null });
  }

  flash() {
    this.el.classList.add('is-done');
    setTimeout(() => this.el.classList.remove('is-done'), 6000);
  }

  // Ends the timer: records it (unless it was under a minute).
  finish(early) {
    const run = this.running;
    if (!run) return;
    clearTimeout(this.timer);
    this.running = null;
    this.remember();
    if (run.mode === 'pomodoro') {
      // Stopping a Pomodoro: the focus minutes so far count; breaks don't.
      if (run.phase === 'focus' && run.start) this.recordSession(run, Math.round((Date.now() - run.start) / 60000));
    } else {
      this.recordSession(run, early ? Math.round((Date.now() - run.start) / 60000) : run.minutes);
      if (!early) {
        this.io.notify({ title: 'Prep time is up', body: `${run.minutes} minutes${run.note ? ` · ${noteLabel(run.note)}` : ''}` });
        this.flash();
      }
    }
    this.render();
  }

  tick() {
    clearTimeout(this.timer);
    if (!this.running || this.running.waiting) {
      this.render();
      return;
    }
    if (this.running.end - Date.now() <= 0) {
      if (this.running.mode !== 'pomodoro') {
        this.finish(false);
        return;
      }
      // Catch up on any parts that ended while Opal was closed (quietly).
      let guard = 0;
      while (this.running && !this.running.waiting && this.running.end <= Date.now() && guard++ < 50) {
        this.endPhase(Date.now() - this.running.end > 60000);
      }
      if (!this.running || this.running.waiting) return;
    }
    const left = this.running.end - Date.now();
    this.render();
    this.timer = setTimeout(this.tick, Math.min(1000, left % 1000 || 1000));
  }

  countdownText() {
    const left = Math.max(0, Math.ceil((this.running.end - Date.now()) / 1000));
    return left >= 3600 ? `${Math.floor(left / 3600)}:${two(Math.floor((left % 3600) / 60))}:${two(left % 60)}` : `${two(Math.floor(left / 60))}:${two(left % 60)}`;
  }

  render() {
    const run = this.running;
    this.el.classList.toggle('is-break', Boolean(run && run.mode === 'pomodoro' && (run.waiting || run.phase) !== 'focus'));
    if (run && run.waiting) {
      this.el.replaceChildren(h('button', {
        class: 'bar-link timer-running timer-waiting',
        title: `Start the ${PHASE_NAMES[run.waiting].toLowerCase()}`,
        onclick: (e) => this.openMenu(e.currentTarget),
      }, icon('tomato', 15), h('span', { class: 'timer-phase' }, `${PHASE_NAMES[run.waiting]} next`)));
    } else if (run && run.mode === 'pomodoro') {
      const text = this.countdownText();
      this.el.replaceChildren(h('button', {
        class: 'bar-link timer-running timer-pomodoro',
        title: 'Pomodoro — click for options',
        'aria-label': `Pomodoro, ${PHASE_NAMES[run.phase]}, ${text} left. Click for options.`,
        onclick: (e) => this.openMenu(e.currentTarget),
      }, icon('tomato', 15), h('span', { class: 'timer-phase' }, run.phase === 'focus' ? `Focus ${run.round}/${this.pomodoro.rounds}` : 'Break'), h('span', { class: 'timer-clock' }, text)));
    } else if (run) {
      const text = this.countdownText();
      this.el.replaceChildren(h('button', {
        class: 'bar-link timer-running',
        title: 'Prep timer — click to stop',
        'aria-label': `Prep timer, ${text} left. Click to stop.`,
        onclick: (e) => this.openMenu(e.currentTarget),
      }, h('span', { class: 'timer-dot', 'aria-hidden': 'true' }), text));
    } else {
      this.el.replaceChildren(h('button', {
        class: 'bar-link timer-idle',
        'data-section': 'timer',
        title: 'Start a prep timer or a Pomodoro',
        onclick: (e) => this.openMenu(e.currentTarget),
      }, icon('timer', 15), h('span', { class: 'bar-label' }, 'Timer')));
    }
    for (const listener of this.listeners) listener(this.state());
  }

  // The choices while nothing is running — also used by the home page's widget.
  // `after` runs once a choice has started something.
  startChoices(after = () => {}) {
    const custom = h('input', { class: 'timer-custom', type: 'number', min: '1', max: '600', placeholder: 'min', 'aria-label': 'Custom minutes' });
    const startCustom = () => {
      const n = Number(custom.value);
      if (n > 0) {
        this.start(n);
        after();
      }
    };
    custom.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') startCustom();
      if (e.key === 'Escape') this.closeMenu();
    });
    const p = this.pomodoro;
    return [
      h('div', { class: 'timer-presets' },
        PRESETS.map((m) => h('button', { class: 'timer-preset', onclick: () => { this.start(m); after(); } }, `${m} min`)),
        h('span', { class: 'timer-custom-row' }, custom, h('button', { class: 'timer-preset', onclick: startCustom }, 'Start'))),
      h('button', { class: 'timer-pomodoro-start', onclick: () => { this.startPomodoro(); after(); } },
        icon('tomato', 16),
        h('span', { class: 'timer-pomodoro-text' },
          h('b', null, 'Pomodoro'),
          h('span', { class: 'timer-note' }, `${p.focus} min focus · ${p.short} min breaks · ${p.long} min after ${p.rounds}`))),
    ];
  }

  // The choices while something is running.
  runningChoices(after = () => {}) {
    const run = this.running;
    const done = (fn) => () => { this.closeMenu(); fn(); after(); };
    if (run.mode !== 'pomodoro') {
      return [h('button', { class: 'timer-stop', onclick: done(() => this.finish(true)) }, 'Stop now', h('span', { class: 'timer-note' }, 'records the minutes so far'))];
    }
    const next = run.waiting || this.nextPhase(run.phase, run.round).phase;
    return [
      run.waiting ? h('button', { class: 'timer-stop is-primary', onclick: done(() => this.resume()) }, `Start ${PHASE_NAMES[run.waiting].toLowerCase()}`, h('span', { class: 'timer-note' }, `${this.pomodoro[run.waiting]} minutes`)) : null,
      h('button', { class: 'timer-stop timer-skip', onclick: done(() => this.skip()) }, run.waiting ? `Skip the ${PHASE_NAMES[run.waiting].toLowerCase()}` : `Skip to ${PHASE_NAMES[next].toLowerCase()}`, h('span', { class: 'timer-note' }, run.phase === 'focus' ? 'this focus part isn’t saved' : 'straight on')),
      h('button', { class: 'timer-stop timer-end', onclick: done(() => this.finish(true)) }, 'Stop Pomodoro', h('span', { class: 'timer-note' }, run.phase === 'focus' ? 'records the focus minutes so far' : 'ends the set')),
    ];
  }

  openMenu(anchor) {
    if (this.menu) {
      this.closeMenu();
      return;
    }
    const run = this.running;
    const note = run ? run.note : this.io.openNote();
    const label = !run ? 'Timer' : run.mode === 'pomodoro' ? `Pomodoro · ${PHASE_NAMES[run.waiting || run.phase]}${run.waiting ? ' next' : ''}` : 'Prep timer running';
    const menu = h('div', { class: 'timer-menu', role: 'dialog', 'aria-label': 'Timer' },
      h('span', { class: 'mono-label' }, label),
      run ? this.runningChoices() : this.startChoices(),
      h('span', { class: 'timer-note' }, note ? `For ${noteLabel(note)} — saved in the Logbook` : 'Saved in the Logbook when it ends'),
      h('button', { class: 'timer-settings-link', onclick: () => { this.closeMenu(); this.io.openSettings(); } }, icon('settings', 12), 'Pomodoro lengths…'));
    document.body.append(menu);
    const box = anchor.getBoundingClientRect();
    menu.style.top = `${box.bottom + 6}px`;
    menu.style.left = `${Math.max(8, Math.min(box.left, window.innerWidth - menu.offsetWidth - 8))}px`;
    this.menu = menu;
    const away = (e) => {
      if (!menu.contains(e.target) && !anchor.contains(e.target)) this.closeMenu();
    };
    setTimeout(() => document.addEventListener('mousedown', away), 0);
    this.menuCleanup = () => document.removeEventListener('mousedown', away);
    if (!run) setTimeout(() => menu.querySelector('.timer-preset')?.focus(), 0);
  }

  closeMenu() {
    if (this.menu) this.menu.remove();
    if (this.menuCleanup) this.menuCleanup();
    this.menu = null;
    this.menuCleanup = null;
  }
}
