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

// The palette cards. onUse(name).
export function paletteGrid(active, onUse) {
  const current = PALETTES.find((p) => p.name === active) || PALETTES[0];
  return h('section', { class: 'palette-grid', 'aria-label': 'Palettes' },
    PALETTES.map((p) => {
      const inUse = p.name === current.name;
      return h('article', { class: `palette-card${inUse ? ' is-active' : ''}` },
        strip(p.colors, 'palette-strip'),
        h('div', { class: 'palette-info' },
          h('span', { class: 'palette-name-row' },
            h('span', { class: 'display palette-name' }, p.name),
            inUse ? h('span', { class: 'in-use mono-label' }, 'In use') : null),
          h('span', { class: 'serif-i' }, `Built in · ${p.byline}`),
          h('span', { class: 'palette-hexes' }, p.colors.join('  '))),
        h('div', { class: 'palette-foot mono-label' },
          h('span', { class: 'palette-installed' }, icon('check', 12), 'Installed'),
          h('button', { class: 'palette-use', disabled: inUse, onclick: () => onUse(p.name) }, inUse ? 'Using' : 'Use')));
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
      }, m.name))));
}
