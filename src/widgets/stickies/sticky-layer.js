// Sticky notes on top of a page (a note or a folder home). Drag one by its
// top strip, type on it, change its colour or throw it away. The layer only
// draws; where stickies are stored is up to the page (see renderer.js).

import { h } from '../../ui.js';

const WIDTH = 184;

function newId() {
  return Math.random().toString(36).slice(2, 8);
}

export class StickyLayer {
  // load(): current stickies. save(list): store them (may be async).
  constructor(container, { load, save }) {
    this.container = container;
    this.load = load;
    this.save = save;
    this.list = [];
    this.busy = false; // true while typing or dragging, so outside refreshes wait
    this.el = h('div', { class: 'sticky-layer' });
    container.append(this.el);
  }

  // Redraws from storage, unless nothing changed or a sticky is in use.
  async refresh() {
    if (this.busy) return;
    const list = await this.load();
    if (this.busy || JSON.stringify(list) === JSON.stringify(this.list)) return;
    this.list = list;
    this.render();
  }

  // A new sticky near the top of what's on screen.
  add(visibleTop) {
    const sticky = {
      id: newId(),
      x: Math.round((0.52 + Math.random() * 0.16) * 100) / 100,
      y: Math.round(Math.max(20, visibleTop + 90 + Math.random() * 60)),
      color: 1 + Math.floor(Math.random() * 5),
      tilt: Math.round((Math.random() * 6 - 3) * 10) / 10,
      size: 1,
      text: '',
    };
    this.list.push(sticky);
    this.render();
    this.commit();
    const text = this.el.querySelector(`[data-id="${sticky.id}"] .sticky-text`);
    if (text) text.focus();
  }

  commit() {
    return this.save(this.list.map((s) => ({ ...s })));
  }

  render() {
    this.el.replaceChildren(...this.list.map((s) => this.stickyEl(s)));
  }

  stickyEl(sticky) {
    const text = h('div', {
      class: 'sticky-text hand',
      contenteditable: 'plaintext-only',
      spellcheck: 'false',
      role: 'textbox',
      'aria-multiline': 'true',
      'aria-label': 'Sticky note',
      'data-placeholder': 'write something…',
    });
    text.textContent = sticky.text;
    text.addEventListener('focus', () => { this.busy = true; });
    text.addEventListener('blur', () => { this.busy = false; });
    text.addEventListener('input', () => {
      sticky.text = text.innerText.replace(/\n$/, '');
      this.commit();
    });
    // Keep typing inside the sticky from reaching the page's shortcuts.
    text.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') text.blur();
      event.stopPropagation();
    });

    const grip = h('button', { class: 'sticky-grip', 'aria-label': 'Move sticky (drag, or use arrow keys)', title: 'Drag to move' });
    const color = h('button', {
      class: 'sticky-button',
      'aria-label': 'Change colour',
      title: 'Change colour',
      onclick: () => {
        sticky.color = (sticky.color % 5) + 1;
        el.style.background = `var(--c${sticky.color})`;
        this.commit();
      },
    }, h('span', { class: 'sticky-swatch' }));
    const remove = h('button', {
      class: 'sticky-button',
      'aria-label': 'Delete sticky',
      title: 'Delete',
      onclick: () => {
        this.list = this.list.filter((s) => s !== sticky);
        el.remove();
        this.commit();
      },
    }, '×');

    const resize = h('button', {
      class: 'sticky-resize',
      'aria-label': 'Resize sticky (drag, or arrow keys)',
      title: 'Drag to resize',
    });

    const el = h('div', {
      class: 'sticky',
      'data-id': sticky.id,
      style: `left: ${sticky.x * 100}%; top: ${sticky.y}px; background: var(--c${sticky.color}); --tilt: ${sticky.tilt}deg`,
    },
    h('span', { class: 'tape sticky-tape', 'aria-hidden': 'true' }),
    h('div', { class: 'sticky-bar' }, grip, h('span', { class: 'grow' }), color, remove),
    text,
    resize);
    this.applySize(el, sticky.size || 1);

    this.makeDraggable(el, grip, sticky);
    this.makeResizable(el, resize, sticky);
    return el;
  }

  // Size 1 = normal; everything (width, height, writing) scales together.
  applySize(el, size) {
    el.style.width = `${Math.round(WIDTH * size)}px`;
    el.style.setProperty('--sticky-scale', String(size));
    el.classList.toggle('is-tiny', size < 0.6);
  }

  makeResizable(el, handle, sticky) {
    const setSize = (size) => {
      sticky.size = Math.round(Math.min(2, Math.max(0.25, size)) * 100) / 100;
      this.applySize(el, sticky.size);
    };
    handle.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      handle.setPointerCapture(event.pointerId);
      this.busy = true;
      el.classList.add('is-dragging');
      const startX = event.clientX;
      const startSize = sticky.size || 1;
      const move = (e) => setSize(startSize * ((WIDTH * startSize + (e.clientX - startX)) / (WIDTH * startSize)));
      const up = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
        el.classList.remove('is-dragging');
        this.busy = false;
        this.commit();
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    });
    handle.addEventListener('keydown', (event) => {
      const step = { ArrowUp: 0.1, ArrowRight: 0.1, ArrowDown: -0.1, ArrowLeft: -0.1 }[event.key];
      if (!step) return;
      event.preventDefault();
      event.stopPropagation();
      setSize((sticky.size || 1) + step);
      this.commit();
    });
  }

  makeDraggable(el, grip, sticky) {
    const place = (x, y) => {
      const width = this.container.clientWidth || 1;
      sticky.x = Math.round(Math.min(Math.max(x / width, 0), (width - 40) / width) * 1000) / 1000;
      sticky.y = Math.round(Math.max(0, y));
      el.style.left = `${sticky.x * 100}%`;
      el.style.top = `${sticky.y}px`;
    };

    grip.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      grip.setPointerCapture(event.pointerId);
      this.busy = true;
      el.classList.add('is-dragging');
      const offsetX = event.clientX - el.getBoundingClientRect().left;
      const offsetY = event.clientY - el.getBoundingClientRect().top;
      const move = (e) => {
        const now = this.container.getBoundingClientRect();
        place(e.clientX - now.left - offsetX, e.clientY - now.top - offsetY);
      };
      const up = () => {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
        grip.removeEventListener('pointercancel', up);
        el.classList.remove('is-dragging');
        this.busy = false;
        this.commit();
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
      grip.addEventListener('pointercancel', up);
    });

    // Arrow keys nudge the sticky (Shift = bigger steps).
    grip.addEventListener('keydown', (event) => {
      const step = event.shiftKey ? 40 : 10;
      const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      const move = moves[event.key];
      if (!move) return;
      event.preventDefault();
      event.stopPropagation();
      place(sticky.x * this.container.clientWidth + move[0], sticky.y + move[1]);
      this.commit();
    });
  }
}
