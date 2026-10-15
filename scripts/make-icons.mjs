// Copies the Tabler icons Opal uses into src/icons.js (run: node scripts/make-icons.mjs).
// Only these ~30 icons go into the app, not the whole set of 5,000.
// Tabler Icons — MIT licence, © Paweł Kuna — https://tabler.io/icons
import fs from 'node:fs';

// Opal's name → Tabler's outline icon name.
const USE = {
  folder: 'folder', folderOpen: 'folder-open', note: 'file', chevron: 'chevron-right', check: 'check',
  home: 'home', search: 'search', calendar: 'calendar', tasks: 'list-check', review: 'cards',
  timer: 'clock', clock: 'clock', settings: 'settings', plus: 'plus', x: 'x', pin: 'pin',
  grid: 'layout-grid', columns: 'columns-3', palette: 'palette', keyboard: 'keyboard',
  activity: 'activity', info: 'info-circle', drag: 'grip-vertical', chart: 'chart-bar', pen: 'pencil',
  flame: 'flame', player: 'player-play', stop: 'player-stop', skip: 'player-skip-forward',
  history: 'history', template: 'template', layers: 'stack-2', sticky: 'note', bookmark: 'bookmark', bookmarks: 'bookmarks', link: 'link',
  table: 'table', widget: 'puzzle', fidget: 'layout-dashboard', inbox: 'inbox', database: 'database', book: 'book', money: 'wallet',
};

const dir = new URL('../node_modules/@tabler/icons/icons/outline/', import.meta.url);
const lines = Object.entries(USE).map(([name, file]) => {
  const svg = fs.readFileSync(new URL(`${file}.svg`, dir), 'utf8');
  const inner = svg.replace(/^[\s\S]*?<path stroke="none"[^>]*\/>/, '').replace(/<\/svg>\s*$/, '').replace(/\s+/g, ' ').replace(/>\s+</g, '><').trim();
  return `  ${name}: '${inner.replace(/'/g, "\\'")}',`;
});

fs.writeFileSync(new URL('../src/icons.js', import.meta.url), `// Opal's icons: outline icons from Tabler Icons (MIT licence, © Paweł Kuna,
// https://tabler.io/icons), plus a tomato for the Pomodoro timer.
// Made by scripts/make-icons.mjs — edit that list and run it again rather than this file.

export const ICONS = {
${lines.join('\n')}
  tomato: '<circle cx="12" cy="14" r="7.5"/><path d="M12 6.5V3.5M9 5.5l3 1 3-1"/>',
};
`);
console.log(`Wrote ${lines.length + 1} icons to src/icons.js`);
