// Theme & palettes: pick the app's look (theme, light or dark) and the
// colours folders, pages and events use.

import { h, icon } from '../ui.js';
import { PALETTES } from '../palettes.js';
import { THEMES, MODES } from '../themes.js';

const STRIP_WEIGHTS = [3, 2, 2, 1, 1];

function strip(colors, className) {
  return h('span', { class: className, 'aria-hidden': 'true' },
    colors.map((color, i) => h('span', { style: `flex-grow: ${STRIP_WEIGHTS[i]}; background: ${color}` })));
}

export function renderPalettes(container, { active, onUse, look, onLook }) {
  const current = PALETTES.find((p) => p.name === active) || PALETTES[0];

  const head = h('section', { class: 'home-head' },
    h('div', { class: 'home-title' },
      h('span', { class: 'mono-label' }, `${THEMES.length} themes · ${PALETTES.length} palettes · all built in`),
      h('h1', { class: 'display home-h1' }, 'Theme & palettes.'),
      h('p', { class: 'home-desc' }, 'The theme is the look of the whole app; the palette colours your folders, pages and events.')),
    h('div', { class: 'now-using' },
      h('span', { class: 'mono-label' }, 'Now using'),
      h('span', { class: 'display now-using-name' }, current.name),
      strip(current.colors, 'now-using-strip')),
  );

  const grid = h('section', { class: 'palette-grid', 'aria-label': 'Palettes' },
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

  const theme = THEMES.find((t) => t.id === look.theme) || THEMES[0];
  const themes = h('section', { class: 'theme-picker', 'aria-label': 'Theme' },
    h('div', { class: 'theme-row' },
      THEMES.map((t) => {
        const on = t.id === theme.id;
        return h('button', {
          class: `theme-card${on ? ' is-active' : ''}`,
          'aria-pressed': String(on),
          onclick: () => onLook({ theme: t.id }),
        },
        h('span', { class: 'theme-preview', 'aria-hidden': 'true', style: `background: ${t.swatch[0]}` },
          h('span', { class: 'theme-preview-bar', style: `background: ${t.swatch[1]}` }),
          h('span', { class: 'theme-preview-line', style: `background: ${t.swatch[1]}` }),
          h('span', { class: 'theme-preview-line is-short', style: `background: ${t.swatch[3]}` }),
          h('span', { class: 'theme-preview-dot', style: `background: ${t.swatch[2]}` })),
        h('span', { class: 'theme-name' }, t.name),
        h('span', { class: 'theme-byline' }, t.byline));
      })),
    h('div', { class: 'theme-modes', role: 'group', 'aria-label': 'Light or dark' },
      MODES.map((m) => h('button', {
        class: `theme-mode${look.mode === m.id ? ' is-on' : ''}`,
        'aria-pressed': String(look.mode === m.id),
        disabled: !theme.dark || null,
        onclick: () => onLook({ mode: m.id }),
      }, m.name)),
      theme.dark ? null : h('span', { class: 'theme-mode-note' }, 'Scrapbook is light only')));

  container.replaceChildren(h('div', { class: 'home' }, head, themes, grid));
}
