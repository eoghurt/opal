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
  table: 'table', widget: 'puzzle', fidget: 'layout-dashboard', inbox: 'inbox', database: 'database', book: 'book', flow: 'messages', money: 'wallet',
  debate: 'podium', motions: 'list-details', trophy: 'trophy', logRound: 'pencil-plus', kanban: 'layout-kanban', training: 'barbell', notebook: 'notebook', star: 'star', unlink: 'unlink', external: 'external-link',
  // Debate topics (see fidgets/debate/motions.js TOPIC_LOOKS).
  t_africa: 'world', t_animals: 'paw', t_art: 'palette', t_asia: 'world-latitude', t_business_work: 'briefcase', t_children: 'baby-carriage', t_cities: 'building-skyscraper', t_criminal_justice: 'shield-lock', t_culture: 'masks-theater', t_development: 'trending-up', t_economics: 'chart-line', t_education_academia: 'school', t_environment: 'leaf', t_europe: 'world-longitude', t_feminism: 'gender-female', t_international_relations: 'flag', t_latin_america: 'world-pin', t_law: 'scale', t_lgbtq: 'rainbow', t_media: 'news', t_medical: 'stethoscope', t_middle_east: 'map-2', t_military: 'shield', t_minority_communities: 'users-group', t_philosophy: 'bulb', t_politics: 'building-bank', t_religion: 'pray', t_romance_sexuality: 'heart', t_science: 'flask', t_social_justice: 'friends', t_sports: 'ball-football', t_technology_ai: 'cpu',
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
