// The prep timer in the top bar: a countdown with 15, 30 and 60 minute
// presets or a custom time. When time is up it shows a Mac notification and
// records the session in the Logbook (.opal/logbook.md), linked to the note
// that was open when it started. Stopping early records the minutes done.
// A running timer survives Opal restarting (it's remembered in this window).
//
//   const timer = new PrepTimer({ openNote(), notify(payload), record(session) });
//   timer.el  → put it in the top bar

import { h } from './ui.js';

const STORE = 'opal.prepTimer';
const PRESETS = [15, 30, 60];

function two(n) {
  return String(n).padStart(2, '0');
}

function dayAndTime(ms) {
  const d = new Date(ms);
  return { day: `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`, time: `${two(d.getHours())}:${two(d.getMinutes())}` };
}

export class PrepTimer {
  constructor({ openNote, notify, record }) {
    this.io = { openNote, notify, record };
    this.running = null; // { start, end, minutes, note }
    this.el = h('div', { class: 'bar-cell bar-timer' });
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (saved && saved.end) this.running = saved;
    } catch {
      // Nothing remembered.
    }
    this.tick = this.tick.bind(this);
    this.render();
    if (this.running) this.tick();
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
    this.running = { start: now, end: now + m * 60000, minutes: m, note: this.io.openNote() };
    this.remember();
    this.closeMenu();
    this.tick();
  }

  // Ends the session: records it (unless it was under a minute).
  finish(early) {
    const run = this.running;
    if (!run) return;
    clearTimeout(this.timer);
    this.running = null;
    this.remember();
    const minutes = early ? Math.round((Date.now() - run.start) / 60000) : run.minutes;
    if (minutes >= 1) {
      const { day, time } = dayAndTime(run.start);
      this.io.record({ day, time, minutes, note: run.note ? run.note.replace(/\.md$/i, '') : null });
    }
    if (!early) {
      this.io.notify({ title: 'Prep time is up', body: `${run.minutes} minutes${run.note ? ` · ${run.note.split('/').pop().replace(/\.md$/i, '')}` : ''}` });
      this.el.classList.add('is-done');
      setTimeout(() => this.el.classList.remove('is-done'), 6000);
    }
    this.render();
  }

  tick() {
    clearTimeout(this.timer);
    if (!this.running) return;
    const left = this.running.end - Date.now();
    if (left <= 0) {
      this.finish(false);
      return;
    }
    this.render();
    this.timer = setTimeout(this.tick, Math.min(1000, left % 1000 || 1000));
  }

  render() {
    if (this.running) {
      const left = Math.max(0, Math.ceil((this.running.end - Date.now()) / 1000));
      const text = left >= 3600 ? `${Math.floor(left / 3600)}:${two(Math.floor((left % 3600) / 60))}:${two(left % 60)}` : `${two(Math.floor(left / 60))}:${two(left % 60)}`;
      this.el.replaceChildren(h('button', {
        class: 'bar-link timer-running',
        title: 'Prep timer — click to stop',
        'aria-label': `Prep timer, ${text} left. Click to stop.`,
        onclick: (e) => this.openMenu(e.currentTarget),
      }, h('span', { class: 'timer-dot', 'aria-hidden': 'true' }), text));
    } else {
      this.el.replaceChildren(h('button', {
        class: 'bar-link timer-idle',
        title: 'Start a prep timer',
        onclick: (e) => this.openMenu(e.currentTarget),
      }, 'Timer'));
    }
  }

  openMenu(anchor) {
    if (this.menu) {
      this.closeMenu();
      return;
    }
    const custom = h('input', { class: 'timer-custom', type: 'number', min: '1', max: '600', placeholder: 'min', 'aria-label': 'Custom minutes' });
    const startCustom = () => {
      const n = Number(custom.value);
      if (n > 0) this.start(n);
    };
    custom.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') startCustom();
      if (e.key === 'Escape') this.closeMenu();
    });
    const note = this.running ? this.running.note : this.io.openNote();
    const menu = h('div', { class: 'timer-menu', role: 'dialog', 'aria-label': 'Prep timer' },
      h('span', { class: 'mono-label' }, this.running ? 'Prep timer running' : 'Prep timer'),
      this.running
        ? h('button', { class: 'timer-stop', onclick: () => { this.closeMenu(); this.finish(true); } }, 'Stop now', h('span', { class: 'timer-note' }, 'records the minutes so far'))
        : h('div', { class: 'timer-presets' },
          PRESETS.map((m) => h('button', { class: 'timer-preset', onclick: () => this.start(m) }, `${m} min`)),
          h('span', { class: 'timer-custom-row' }, custom, h('button', { class: 'timer-preset', onclick: startCustom }, 'Start'))),
      h('span', { class: 'timer-note' }, note ? `For ${note.split('/').pop().replace(/\.md$/i, '')} — saved in the Logbook` : 'Saved in the Logbook when it ends'));
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
    if (!this.running) setTimeout(() => menu.querySelector('.timer-preset')?.focus(), 0);
  }

  closeMenu() {
    if (this.menu) this.menu.remove();
    if (this.menuCleanup) this.menuCleanup();
    this.menu = null;
    this.menuCleanup = null;
  }
}
