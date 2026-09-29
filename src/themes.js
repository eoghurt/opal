// Themes: the whole look of the app. Scrapbook is the original; Minimal and
// GitHub also come in light and dark. The theme sets data-theme and
// data-mode on <html>; themes.css does the rest.

export const THEMES = [
  { id: 'scrapbook', name: 'Scrapbook', byline: 'bordered cells, handwriting, tape', dark: false, swatch: ['#EFEBE3', '#16140F', '#FF6B4A', '#FFD23F'] },
  { id: 'minimal', name: 'Minimal', byline: 'quiet paper, one blue accent', dark: true, swatch: ['#FAFAF8', '#1C1C1E', '#3B2CF5', '#E6E6E9'] },
  { id: 'github', name: 'GitHub', byline: 'tabs, file trees, activity grids', dark: true, swatch: ['#0D1117', '#E6EDF3', '#4493F8', '#238636'] },
];

export const MODES = [
  { id: 'light', name: 'Light' },
  { id: 'dark', name: 'Dark' },
  { id: 'auto', name: 'Match Mac' },
];

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
let current = { theme: 'scrapbook', mode: 'light' };

function paint() {
  const theme = THEMES.find((t) => t.id === current.theme) || THEMES[0];
  const dark = theme.dark && (current.mode === 'dark' || (current.mode === 'auto' && darkQuery.matches));
  document.documentElement.dataset.theme = theme.id;
  document.documentElement.dataset.mode = dark ? 'dark' : 'light';
}

darkQuery.addEventListener('change', () => {
  if (current.mode === 'auto') paint();
});

export function applyTheme(look) {
  current = { ...current, ...look };
  paint();
  return current;
}

export function currentLook() {
  return current;
}
