// Theme & palettes, shown in Settings → Appearance: the app's look (theme,
// light or dark) and the colours folders, pages and events use.

import { h, icon } from '../ui.js';
import { PALETTES } from '../palettes.js';
import { MODES } from '../themes.js';

const STRIP_WEIGHTS = [3, 2, 2, 1, 1];

function strip(colors, className) {
  return h('span', { class: className, 'aria-hidden': 'true' },
    colors.map((color, i) => h('span', { style: `flex-grow: ${STRIP_WEIGHTS[i]}; background: ${color}` })));
}

// The palette cards: a strip of its colours and its name. Click one to use it.
export function paletteGrid(active, onUse) {
  const current = PALETTES.find((p) => p.name === active) || PALETTES[0];
  return h('section', { class: 'palette-grid', 'aria-label': 'Palettes' },
    PALETTES.map((p) => {
      const inUse = p.name === current.name;
      return h('button', {
        type: 'button',
        class: `palette-card${inUse ? ' is-active' : ''}`,
        'aria-pressed': String(inUse),
        title: `${p.byline} · ${p.colors.join(' ')}`,
        onclick: () => { if (!inUse) onUse(p.name); },
      },
        strip(p.colors, 'palette-strip'),
        h('span', { class: 'palette-name-row' },
          h('span', { class: 'palette-name' }, p.name),
          inUse ? h('span', { class: 'in-use' }, 'In use') : null));
    }));
}

// The palette in use, as a strip.
export function paletteNow(active) {
  const current = PALETTES.find((p) => p.name === active) || PALETTES[0];
  return h('div', { class: 'now-using' },
    h('span', { class: 'mono-label' }, 'Now using'),
    h('span', { class: 'display now-using-name' }, current.name),
    strip(current.colors, 'now-using-strip'));
}

// Light, dark or match the Mac. onLook({ theme, mode }).
export function themePicker(look, onLook) {
  // One theme now (Minimal): just light, dark or match the Mac.
  return h('section', { class: 'theme-picker', 'aria-label': 'Light or dark' },
    h('div', { class: 'theme-modes', role: 'group', 'aria-label': 'Light or dark' },
      MODES.map((m) => h('button', {
        class: `theme-mode${look.mode === m.id ? ' is-on' : ''}`,
        'aria-pressed': String(look.mode === m.id),
        onclick: () => onLook({ theme: 'minimal', mode: m.id }),
      },
        // A tiny picture of the app in that look.
        h('span', { class: `theme-shot is-${m.id}`, 'aria-hidden': 'true' }, h('span'), h('span')),
        m.name))));
}
