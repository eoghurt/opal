// Hand-drawn strokes for the corkboard: letters and numbers drawn as pen
// strokes (not a font), wobbly lines, and little stars.

// Each glyph sits in a 10 × 14 box, baseline at 14: [width, path].
const GLYPHS = {
  A: [10, 'M0 14 L5 0 L10 14 M2 9 L8 9'], B: [9, 'M1 14 V0 H5 C9 0 9 7 5 7 H1 M5 7 C10 7 10 14 5 14 H1'],
  C: [10, 'M10 2 C7 -1 0 0 0 7 C0 14 7 15 10 12'], D: [10, 'M1 0 V14 H4 C11 14 11 0 4 0 H1'],
  E: [8, 'M8 0 H1 V14 H8 M1 7 H6'], F: [8, 'M8 0 H1 V14 M1 7 H6'], G: [10, 'M10 3 C8 -1 0 -1 0 7 C0 15 10 15 10 8 H6'],
  H: [9, 'M1 0 V14 M9 0 V14 M1 7 H9'], I: [3, 'M1.5 0 V14'], J: [8, 'M8 0 V10 C8 15 1 15 1 10'], K: [9, 'M1 0 V14 M9 0 L1 8 M4 6 L9 14'],
  L: [8, 'M1 0 V14 H8'], M: [11, 'M0 14 V0 L5.5 8 L11 0 V14'], N: [9, 'M1 14 V0 L9 14 V0'],
  O: [10, 'M5 0 C-1 0 -1 14 5 14 C11 14 11 0 5 0'], P: [9, 'M1 14 V0 H5 C10 0 10 7 5 7 H1'],
  R: [9, 'M1 14 V0 H5 C10 0 10 7 5 7 H1 M5 7 L9 14'], S: [9, 'M9 2 C7 -1 1 0 1 4 C1 8 9 6 9 10 C9 15 2 15 0 12'],
  T: [10, 'M0 0 H10 M5 0 V14'], U: [9, 'M1 0 V10 C1 15 9 15 9 10 V0'], V: [10, 'M0 0 L5 14 L10 0'],
  W: [13, 'M0 0 L3 14 L6.5 5 L10 14 L13 0'], Y: [10, 'M0 0 L5 7 L10 0 M5 7 V14'], ':': [3, 'M1.5 5 L1.5 5.6 M1.5 11 L1.5 11.6'],
  0: [9, 'M4.5 0 C0 0 0 14 4.5 14 C9 14 9 0 4.5 0'], 1: [6, 'M1 3 L5 0 V14'],
  2: [9, 'M1 3 C2 -1 9 -1 9 4 C9 8 1 11 0 14 H9'], 3: [9, 'M1 1 H8 L4 6 C10 6 10 14 5 14 C2 14 1 12 0 11'],
  4: [9, 'M7 14 V0 L0 10 H9'], 5: [9, 'M8 0 H2 L1 6 C6 4 9 7 9 10 C8 15 2 14 0 12'],
  6: [9, 'M8 0 C3 2 0 7 1 11 C2 15 9 15 9 10 C9 6 3 6 1 10'], 7: [9, 'M0 0 H9 L4 14'],
  8: [9, 'M4.5 7 C0 6 1 0 4.5 0 C8 0 9 6 4.5 7 C0 8 0 14 4.5 14 C9 14 9 8 4.5 7'],
  9: [9, 'M8 5 C8 0 1 0 1 5 C1 9 8 9 8 5 V14'],
};

// Moves and scales one glyph's path (absolute M/L/H/V/C commands only).
function place(d, k, ox, oy) {
  const out = [];
  let cmd = '';
  let idx = 0;
  for (const tk of d.match(/[MLHVCZ]|-?\d*\.?\d+/g)) {
    if (/[MLHVCZ]/.test(tk)) {
      cmd = tk;
      idx = 0;
      out.push(tk);
      continue;
    }
    const v = parseFloat(tk);
    const isX = cmd === 'H' ? true : cmd === 'V' ? false : idx % 2 === 0;
    out.push((isX ? v * k + ox : v * k + oy).toFixed(1));
    idx++;
  }
  return out.join(' ');
}

// Text as one path: { d, w } — drawn from x, sitting on baseY, h tall.
export function lettering(str, x, baseY, h, gap = 3.4) {
  const k = h / 14;
  let cx = x;
  const parts = [];
  for (const ch of String(str).toUpperCase()) {
    if (ch === ' ') {
      cx += 6 * k;
      continue;
    }
    const g = GLYPHS[ch];
    if (!g) {
      cx += 8 * k;
      continue;
    }
    parts.push(place(g[1], k, cx, baseY - h));
    cx += (g[0] + gap) * k;
  }
  return { d: parts.join(' '), w: Math.max(0, cx - x - gap * k) };
}

// A small seeded random number generator, so the wobbles stay put.
export function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A hand-drawn line from one point to another that wavers a little.
export function wobble(r, x1, y1, x2, y2, amp = 1) {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const n = Math.max(2, Math.round(len / 24));
  const nx = -(y2 - y1) / len;
  const ny = (x2 - x1) / len;
  const over = r() * 3;
  let d = '';
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const j = i === 0 || i === n ? r() - 0.5 : (r() - 0.5) * 2 * amp;
    let x = x1 + (x2 - x1) * t + nx * j;
    let y = y1 + (y2 - y1) * t + ny * j;
    if (i === n) {
      x += ((x2 - x1) / len) * over;
      y += ((y2 - y1) / len) * over;
    }
    d += `${i ? ' L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
}

// An n-pointed star.
export function star(cx, cy, R, r, n, rot) {
  let d = '';
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (Math.PI * i) / n;
    const rr = i % 2 ? r : R;
    d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)} `;
  }
  return `${d}Z`;
}

// Five handwritten ticks.
export const TICKS = [
  'M2 11 C5 13 7 16 8 19 C11 12 16 6 23 2',
  'M1 13 C3 12 6 14 8 18 C10 10 14 4 22 1 M19 3 L24 1',
  'M3 10 L9 17 L21 4 M4 12 L9 18 L20 6',
  'M2 14 C6 15 8 18 9 20 C12 13 16 7 25 3',
  'M4 12 C6 16 8 18 9 19 C10 15 14 7 21 3 C22 2 23 2 24 4',
];
