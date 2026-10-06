// The look of the app: Minimal, in light or dark (or matching the Mac).
// (Scrapbook and GitHub were retired; a saved choice of either shows as
// Minimal.) Sets data-theme and data-mode on <html>; themes.css does the rest.

export const THEMES = [
  { id: 'minimal', name: 'Minimal', byline: 'quiet paper, one blue accent', dark: true, swatch: ['#FAFAF8', '#1C1C1E', '#3B2CF5', '#E6E6E9'] },
];

export const MODES = [
  { id: 'light', name: 'Light' },
  { id: 'dark', name: 'Dark' },
  { id: 'auto', name: 'Match Mac' },
];

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
let current = { theme: 'minimal', mode: 'light' };

function paint() {
  const theme = THEMES.find((t) => t.id === current.theme) || THEMES[0];
  const dark = theme.dark && (current.mode === 'dark' || (current.mode === 'auto' && darkQuery.matches));
  document.documentElement.dataset.theme = theme.id;
  document.documentElement.dataset.mode = dark ? 'dark' : 'light';
  window.dispatchEvent(new Event('opal:theme')); // things sized by their font measure again
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
