// Colour palettes. Each has five colours, used through the CSS variables
// --c1 … --c5, so switching palette recolours the whole app at once.

export const PALETTES = [
  { name: 'Riso', byline: 'print-shop brights', colors: ['#FF6B4A', '#FFD23F', '#3DA5D9', '#7BC67E', '#C3A6FF'] },
  { name: 'Sorbet', byline: 'soft and sweet', colors: ['#F7A8B8', '#FDE68A', '#A7F3D0', '#BFDBFE', '#FBCFA0'] },
  { name: 'Field notes', byline: 'earth and ink', colors: ['#D9623B', '#E8B04A', '#8FAE6B', '#6E9CC0', '#C9B28A'] },
  { name: 'Metro', byline: 'subway-map loud', colors: ['#F0524D', '#FFB81C', '#2DB38A', '#5AA6EE', '#B98AE0'] },
  { name: 'Postcard', byline: 'faded holiday', colors: ['#E27D60', '#85DCB0', '#E8A87C', '#C38D9E', '#41B3A3'] },
  { name: 'Scrapbook', byline: 'glue-stick and tape', colors: ['#E86A58', '#F2C14E', '#9BC1BC', '#7FA7C9', '#D6A2E8'] },
];

export function paletteByName(name) {
  return PALETTES.find((p) => p.name === name) || PALETTES[0];
}

export function applyPalette(name) {
  const palette = paletteByName(name);
  palette.colors.forEach((color, i) => {
    document.documentElement.style.setProperty(`--c${i + 1}`, color);
  });
  return palette;
}

// A stable colour slot (1–5) for a piece of text, so a folder or card keeps
// the same colour every time.
export function slotFor(text) {
  let hash = 0;
  for (const ch of text) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  return (hash % 5) + 1;
}
