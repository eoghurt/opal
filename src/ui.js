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
  // Top bar, tabs and the home page.
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  tasks: '<path d="M4 6l2 2 3-3"/><path d="M4 13l2 2 3-3"/><path d="M13 7h7M13 14h7M4 20h16"/>',
  review: '<rect x="6" y="3" width="14" height="14" rx="2"/><path d="M4 7v12a2 2 0 0 0 2 2h10"/><path d="M10 10h6"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M10 2h4"/>',
  tomato: '<circle cx="12" cy="14" r="7.5"/><path d="M12 6.5V3.5M9 5.5l3 1 3-1"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  pin: '<path d="M12 17v5"/><path d="M9 3h6l-1 7 3 3v2H7v-2l3-3z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  columns: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1 0 1.6-.8 1.6-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7H16a5 5 0 0 0 5-5c0-4-4-7.2-9-7.2z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>',
  folderOpen: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v1"/><path d="M3 7v10a2 2 0 0 0 2 2h12.5a2 2 0 0 0 1.9-1.4L21.5 12a1 1 0 0 0-1-1.3H8a2 2 0 0 0-1.9 1.4L3 19"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  activity: '<path d="M3 12h4l3 8 4-16 3 8h4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  drag: '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>',
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
