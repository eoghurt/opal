// Small helpers for building the interface without HTML strings, so text
// from notes can never be mistaken for code.

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

const ICONS = {
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  note: '<path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3v5h5"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
};

export function icon(name, size = 14) {
  const span = document.createElement('span');
  span.className = 'icon';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
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

export function askName(label, placeholder = 'Name, then Enter') {
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
    input.focus();
  });
}
