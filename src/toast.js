// A short message at the bottom of the window, for things that went wrong
// (a save, a rename, links that couldn't be updated) or need a decision.
//
//   showToast(text, { detail, actions: [{ label, run }], kind: 'error' | 'info', stay })
//   → the toast element (call .close() to take it away)
//
// Errors stay 10 seconds (or until clicked away); with actions, or `stay`,
// until you choose. The same message twice in a row isn't stacked.

import { h } from './ui.js';

let stack = null;
const open = new Map(); // text → toast

export function showToast(text, { detail = '', actions = [], kind = 'error', stay = false } = {}) {
  if (!stack) {
    stack = h('div', { class: 'toast-stack', role: 'status', 'aria-live': 'polite' });
    document.body.append(stack);
  }
  const key = `${text}|${detail}`;
  if (open.has(key)) return open.get(key);
  const close = () => {
    clearTimeout(timer);
    open.delete(key);
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 180);
  };
  const el = h('div', { class: `toast is-${kind}` },
    h('div', { class: 'toast-text' }, h('b', null, text), detail ? h('span', null, detail) : null),
    actions.length ? h('div', { class: 'toast-actions' }, actions.map((a) => h('button', {
      type: 'button',
      class: `toast-btn${a.primary ? ' is-primary' : ''}`,
      onclick: async () => {
        if (a.keepOpen) return a.run();
        close();
        await a.run();
      },
    }, a.label))) : null,
    h('button', { type: 'button', class: 'toast-close', 'aria-label': 'Close', onclick: close }, '×'));
  el.close = close;
  open.set(key, el);
  stack.append(el);
  const timer = stay || actions.length ? null : setTimeout(close, kind === 'error' ? 10000 : 5000);
  return el;
}
