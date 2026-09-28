// Side panels you can resize (drag the inner edge, or arrow keys on it;
// double-click to reset) and close (the round button on the edge). A closed
// panel leaves a slim labelled tab to open it again. Width and open/closed are
// remembered per panel on this Mac.

import { h } from './ui.js';

function load(id) {
  try {
    return JSON.parse(localStorage.getItem(`opal.panel.${id}`)) || {};
  } catch {
    return {};
  }
}

function save(id, state) {
  try {
    localStorage.setItem(`opal.panel.${id}`, JSON.stringify(state));
  } catch {
    // Not remembered this time.
  }
}

// Turns `el` into a panel and returns the element its contents belong in.
// side: which side of the screen the panel is on ('left' or 'right').
export function makePanel(el, { id, side, label, width, min = 160, max = 560 }) {
  const state = { width, closed: false, ...load(id) };
  const body = h('div', { class: 'panel-body' });
  body.append(...el.childNodes);

  const setWidth = (w) => {
    state.width = Math.round(Math.min(max, Math.max(min, w)));
    el.style.width = `${state.width}px`;
  };

  const handle = h('div', {
    class: `panel-handle is-${side}`,
    role: 'separator',
    'aria-orientation': 'vertical',
    'aria-label': `Resize ${label}`,
    'aria-valuenow': String(state.width),
    tabindex: '0',
    title: 'Drag to resize · double-click to reset',
  });
  const close = h('button', {
    class: `panel-close is-${side}`,
    'aria-label': `Close ${label}`,
    title: `Close ${label}`,
  }, side === 'left' ? '‹' : '›');
  const tab = h('button', {
    class: `panel-tab is-${side}`,
    'aria-label': `Open ${label}`,
    title: `Open ${label}`,
  }, h('span', null, label));

  const setClosed = (closed) => {
    state.closed = closed;
    el.classList.toggle('is-closed', closed);
    tab.hidden = !closed;
    save(id, state);
  };

  handle.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = el.getBoundingClientRect().width;
    document.body.classList.add('is-resizing');
    const move = (e) => setWidth(startWidth + (side === 'left' ? e.clientX - startX : startX - e.clientX));
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      document.body.classList.remove('is-resizing');
      handle.setAttribute('aria-valuenow', String(state.width));
      save(id, state);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  });
  handle.addEventListener('dblclick', () => {
    setWidth(width);
    save(id, state);
  });
  handle.addEventListener('keydown', (event) => {
    const grow = side === 'left' ? 1 : -1;
    const step = { ArrowRight: 16 * grow, ArrowLeft: -16 * grow }[event.key];
    if (!step) return;
    event.preventDefault();
    setWidth(state.width + step);
    save(id, state);
  });
  close.addEventListener('click', () => setClosed(true));
  tab.addEventListener('click', () => setClosed(false));

  el.classList.add('panel');
  el.replaceChildren(body, handle, close);
  // The reopen tab sits right next to the panel.
  if (side === 'left') el.after(tab);
  else el.before(tab);
  const placeTab = () => {
    if (!tab.isConnected && el.isConnected) {
      if (side === 'left') el.after(tab);
      else el.before(tab);
    }
  };
  queueMicrotask(placeTab);

  setWidth(state.width);
  setClosed(state.closed);
  el.panel = { toggle: () => setClosed(!state.closed), body };
  return body;
}
