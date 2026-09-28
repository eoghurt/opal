// Palette library: pick the colours the whole app uses.

import { h, icon } from '../ui.js';
import { PALETTES } from '../palettes.js';

const STRIP_WEIGHTS = [3, 2, 2, 1, 1];

function strip(colors, className) {
  return h('span', { class: className, 'aria-hidden': 'true' },
    colors.map((color, i) => h('span', { style: `flex-grow: ${STRIP_WEIGHTS[i]}; background: ${color}` })));
}

export function renderPalettes(container, { active, onUse }) {
  const current = PALETTES.find((p) => p.name === active) || PALETTES[0];

  const head = h('section', { class: 'home-head' },
    h('div', { class: 'home-title' },
      h('span', { class: 'mono-label' }, `Library · ${PALETTES.length} palettes · all built in`),
      h('h1', { class: 'display home-h1' }, 'Palettes.'),
      h('p', { class: 'home-desc' }, 'Every colour in Opal comes from the palette you’ve got on.')),
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

  container.replaceChildren(h('div', { class: 'home' }, head, grid));
}
