// Small helpers for building the interface without HTML strings, so text
// from notes can never be mistaken for code.

import { ICONS } from './icons.js';

// h('div', { class: 'x', onclick: fn }, 'text', otherElement)
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'style') el.style.cssText = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}


export function icon(name, size = 14) {
  const span = document.createElement('span');
  span.className = 'icon';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
  return span;
}

// A hand-drawn arrow. `d` is the curve, `head` the arrowhead.
export function scribbleArrow({ width, height, d, head, style }) {
  const span = document.createElement('span');
  span.className = 'scribble-arrow';
  span.setAttribute('aria-hidden', 'true');
  if (style) span.style.cssText = style;
  span.innerHTML = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/><path d="${head}"/></svg>`;
  return span;
}

// Asks for a name in a small box at the top of the window.
// Resolves to the trimmed name, or null if cancelled (Escape or clicking away).
let cancelOpenAsk = null;

export function askName(label, placeholder = 'Name, then Enter', initial = '') {
  if (cancelOpenAsk) cancelOpenAsk();
  return new Promise((resolve) => {
    const input = h('input', { class: 'ask-input', placeholder, spellcheck: 'false', 'aria-label': label });
    const box = h('div', { class: 'ask', role: 'dialog', 'aria-label': label }, h('div', { class: 'mono-label' }, label), input);
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      cancelOpenAsk = null;
      box.remove();
      resolve(value);
    };
    cancelOpenAsk = () => finish(null);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') finish(null);
      if (event.key === 'Enter') finish(input.value.trim() || null);
    });
    input.addEventListener('blur', () => finish(null));
    document.body.append(box);
    input.value = initial;
    input.focus();
    input.select();
  });
}

// Asks the user to pick one of a few buttons, in the same box as askName.
// choices: [{ label, value }]. Resolves to the value, or null if cancelled.
export function askChoice(label, choices) {
  if (cancelOpenAsk) cancelOpenAsk();
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      cancelOpenAsk = null;
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onOutside, true);
      box.remove();
      resolve(value);
    };
    const buttons = choices.map((c, i) => h('button', {
      class: `ask-choice${i === 0 ? ' is-primary' : ''}`,
      onclick: () => finish(c.value),
    }, c.label));
    const box = h('div', { class: 'ask', role: 'dialog', 'aria-label': label },
      h('div', { class: 'mono-label' }, label),
      h('div', { class: 'ask-choices' }, buttons, h('button', { class: 'ask-choice', onclick: () => finish(null) }, 'Cancel')));
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        finish(null);
      }
    };
    const onOutside = (event) => {
      if (!box.contains(event.target)) finish(null);
    };
    cancelOpenAsk = () => finish(null);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onOutside, true);
    document.body.append(box);
    buttons[0].focus();
  });
}
