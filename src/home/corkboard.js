// The vault's home page as a corkboard: the hand-drawn calendar on a brass
// clip, the passport whose stamps open the fidgets, today's tasks on a shop
// receipt, a quote card, the folders as motel key tags, and stickers, stamps
// and tickets pinned all over. Everything shown comes from the vault; the
// pictures ship with Opal.

import { CorkCalendar } from './cork-calendar.js';
import { keyRack } from './key-tags.js';
import { TICKS } from './hand-lettering.js';
import passportImg from '../assets/corkboard/passport.webp';
import stickersImg from '../assets/corkboard/stickers.webp';
import stampsImg from '../assets/corkboard/stamps.webp';
import ticketsImg from '../assets/corkboard/tickets.webp';
import trailImg from '../assets/corkboard/photo-trail.webp';
import lakeImg from '../assets/corkboard/photo-lake.webp';
import bayImg from '../assets/corkboard/photo-bay.webp';

const W = 1440;
const H = 860;

export const DEFAULT_QUOTES = [
  { text: 'Watch the waves, not the shore.', who: 'me' },
  { text: 'And keep your face to the risin’ sun.', who: 'Kanye' },
  { text: 'If you don’t do the things that you do, they will just happen to you.', who: 'Clairo' },
  { text: 'The world offers itself to your imagination.', who: 'Mary Oliver' },
];

// Cut-outs from the sticker, stamp and ticket sheets:
// [sheet, x1, y1, x2, y2, left, top, scale, rotate, round, extra, z]
const SHEETS = { st: [stickersImg, 736, 1041], mb: [stampsImg, 2000, 1301], tk: [ticketsImg, 2000, 1301] };
const CUTS = [
  ['tk', 491, 790, 659, 1135, 8, 640, 0.5, -6, 0, 'pin'],
  ['tk', 491, 668, 717, 780, 90, 652, 0.75, 4, 0, ''],
  ['tk', 491, 568, 719, 658, 112, 742, 0.75, -3, 0, 'tape'],
  ['mb', 562, 197, 770, 337, 270, 646, 0.62, 6, 0, 'pin'],
  ['tk', 675, 380, 831, 490, 300, 752, 0.62, 7, 0, ''],
  ['st', 11, 579, 121, 689, 338, 560, 0.9, -8, 1, '', 6],
  ['st', 100, 802, 212, 914, 352, 6, 0.62, 0, 1, '', 5],
  ['st', 12, 105, 130, 262, 384, 440, 0.6, -8, 0, 'tape'],
  ['mb', 715, 1043, 848, 1243, 402, 620, 0.45, -10, 0, ''],
  ['mb', 978, 440, 1140, 703, 1004, 318, 0.55, 8, 0, 'pin'],
  ['st', 643, 448, 733, 538, 1022, 232, 0.7, 0, 1, ''],
  ['st', 657, 150, 730, 425, 1352, 36, 0.62, 3, 0, ''],
  ['mb', 560, 695, 778, 1000, 1338, 512, 0.42, 6, 0, ''],
  ['mb', 978, 725, 1140, 977, 1336, 664, 0.42, -5, 0, 'pin'],
  ['mb', 796, 580, 956, 825, 1250, 584, 0.45, -4, 0, ''],
  ['st', 406, 626, 558, 770, 1226, 432, 0.62, 0, 1, ''],
];
const PINS = ['#d6283a', '#2563eb', '#16a34a', '#f59e0b', '#e5e7eb'];

// The passport's stamps → the fidgets they open (in the photo's pixels).
const STAMPS = [
  ['calendar', 'Calendar', 235, 157, 266, 200, 0],
  ['money', 'Money', 724, 152, 320, 205, 0],
  ['debate', 'Debate', 860, 410, 260, 188, 0],
  ['flashcards', 'Flashcards', 648, 478, 180, 262, 16],
  ['tasks', 'Tasks', 440, 455, 92, 316, 0],
  [null, 'Bookshelf · later', 95, 232, 148, 240, '50%'],
  [null, 'Collages · later', 666, 300, 194, 194, '50%'],
  [null, 'Cinema · later', 830, 600, 240, 140, 0],
];
// The only text changed on the photo: four place names become fidget names.
const PATCHES = [
  [305, 303, 186, 21, 0, '#4a4646', 15, 'CALENDAR · PERTH'],
  [885, 436, 120, 18, 180, '#4a4646', 13, 'DEBATE · PERTH'],
  [675, 538, 19, 140, 90, '#4a4646', 13, 'FLASHCARDS · PERTH'],
  [475, 542, 18, 148, 90, '#3346a8', 14, 'TASKS · OPEN'],
];

const DEFS = `
  <filter id="cork-tex" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="3" seed="7" result="n"></feTurbulence>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 .3  0 0 0 0 .17  0 0 0 0 .07  0 0 0 -2.2 1.35" result="dark"></feColorMatrix>
    <feTurbulence type="fractalNoise" baseFrequency="0.3" numOctaves="2" seed="19" result="n2"></feTurbulence>
    <feColorMatrix in="n2" type="matrix" values="0 0 0 0 .95  0 0 0 0 .78  0 0 0 0 .52  0 0 0 -2.6 1.45" result="light"></feColorMatrix>
    <feMerge><feMergeNode in="dark"></feMergeNode><feMergeNode in="light"></feMergeNode></feMerge>
  </filter>
  <filter id="cork-wood" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.004 0.25" numOctaves="3" seed="4" result="n"></feTurbulence>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 .2  0 0 0 0 .1  0 0 0 0 .04  0 0 0 -1.4 .9"></feColorMatrix>
  </filter>
  <filter id="cork-thermal" x="-5%" y="-20%" width="110%" height="140%">
    <feTurbulence type="fractalNoise" baseFrequency="0.02 0.9" numOctaves="2" seed="3" result="n"></feTurbulence>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -2.2 0 0 0 2.1" result="m"></feColorMatrix>
    <feComposite in="SourceGraphic" in2="m" operator="in"></feComposite>
  </filter>
  <filter id="cork-worn" x="-8%" y="-20%" width="116%" height="140%">
    <feTurbulence type="fractalNoise" baseFrequency="1" numOctaves="2" seed="15" result="n"></feTurbulence>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="3" xChannelSelector="R" yChannelSelector="G" result="d"></feDisplacementMap>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 -2.8 0 0 2.5" result="m"></feColorMatrix>
    <feComposite in="d" in2="m" operator="in"></feComposite>
  </filter>
  <filter id="cork-pen" x="-10%" y="-10%" width="120%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed="8" result="n"></feTurbulence>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="1.4" xChannelSelector="R" yChannelSelector="G"></feDisplacementMap>
  </filter>
  <filter id="cork-chalk" x="-10%" y="-10%" width="120%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="12" result="n"></feTurbulence>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 -3 0 0 2.2" result="m"></feColorMatrix>
    <feComposite in="SourceGraphic" in2="m" operator="in" result="c"></feComposite>
    <feGaussianBlur in="c" stdDeviation=".6"></feGaussianBlur>
  </filter>
  <filter id="cork-stamp" x="-10%" y="-30%" width="120%" height="160%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" result="fine"></feTurbulence>
    <feDisplacementMap in="SourceGraphic" in2="fine" scale="2.2" xChannelSelector="R" yChannelSelector="G" result="rough"></feDisplacementMap>
    <feColorMatrix in="fine" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 -3.2 0 0 2.8" result="m"></feColorMatrix>
    <feComposite in="rough" in2="m" operator="in" result="inked"></feComposite>
    <feGaussianBlur in="inked" stdDeviation="0.35"></feGaussianBlur>
  </filter>
  <filter id="cork-hand" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="3" result="n"></feTurbulence>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="2.4" xChannelSelector="R" yChannelSelector="G"></feDisplacementMap>
  </filter>
  <filter id="cork-hand2" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="11" result="n"></feTurbulence>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="3" xChannelSelector="R" yChannelSelector="G"></feDisplacementMap>
  </filter>
  <linearGradient id="cork-ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4f4f4"></stop><stop offset=".45" stop-color="#9c9c9c"></stop><stop offset="1" stop-color="#e6e6e6"></stop></linearGradient>
  <linearGradient id="cork-gloss" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".38"></stop><stop offset=".18" stop-color="#fff" stop-opacity=".06"></stop><stop offset=".8" stop-color="#000" stop-opacity="0"></stop><stop offset="1" stop-color="#000" stop-opacity=".1"></stop></linearGradient>
  <symbol id="cork-star" viewBox="0 0 24 24"><path d="M12 2l2.9 6.3l6.9 .8l-5.1 4.7l1.4 6.8l-6.1 -3.5l-6.1 3.5l1.4 -6.8l-5.1 -4.7l6.9 -.8z"></path></symbol>`;

// The fixed decorations: photos, the pencil, climbing things, badges, tape, stars.
const DECOR = `
  <svg class="cork-o cork-sh" style="left: 1330px; top: 180px; transform: rotate(24deg); z-index: 9" width="56" height="100" viewBox="0 0 56 100"><path d="M18 8 C 4 8, 4 30, 8 50 C 12 74, 14 92, 28 92 C 44 92, 50 76, 48 54 C 46 30, 44 8, 30 8 Z" fill="none" stroke="#e05a2b" stroke-width="7"></path><path d="M40 20 L44 54" stroke="#c9c9c9" stroke-width="4" stroke-linecap="round"></path></svg>
  <svg class="cork-o cork-die" style="left: 1240px; top: 560px; transform: rotate(-8deg)" width="96" height="76" viewBox="0 0 96 76"><path d="M10 40 C 6 16, 30 4, 52 8 C 78 12, 92 30, 86 50 C 80 70, 50 74, 30 68 C 16 64, 12 56, 10 40 Z" fill="#7c3aed"></path><circle cx="48" cy="38" r="8" fill="#4c1d95"></circle><circle cx="48" cy="38" r="4" fill="#c4b5fd"></circle></svg>
  <svg class="cork-o" style="left: 1100px; top: 470px; transform: rotate(18deg); opacity: .85" width="110" height="130" viewBox="0 0 110 130" filter="url(#cork-chalk)"><path d="M30 126 C 14 108, 12 84, 18 66 L 10 40 C 8 32, 18 28, 22 36 L 32 58 L 30 20 C 30 10, 42 10, 42 20 L 46 52 L 52 12 C 54 2, 66 4, 64 14 L 60 54 L 72 22 C 76 12, 88 16, 84 26 L 72 64 L 86 50 C 94 42, 104 50, 96 60 C 84 76, 80 96, 72 112 C 66 124, 44 132, 30 126 Z" fill="#f6f4ee"></path></svg>
  <div class="cork-o cork-lift cork-polaroid" style="left: 452px; top: 470px; --r: -5deg; transform: rotate(-5deg)">
    <img src="${trailImg}" alt="The trail">
    <span class="cork-polaroid-cap">the trail ♡</span>
    <span class="cork-pin" style="left: 100px; top: -6px; background: #d6283a"></span>
  </div>
  <div class="cork-o cork-sh cork-pencil" style="left: 660px; top: 432px; transform: rotate(-24deg); z-index: 7"><span></span><span></span><span></span><span></span></div>
  <div class="cork-o cork-lift cork-film" style="left: 700px; top: 488px; --r: 3deg; transform: rotate(3deg)">
    <img src="${lakeImg}" alt="Photobooth frame"><img src="${bayImg}" alt="Photobooth frame"><img src="${trailImg}" alt="Photobooth frame" style="object-position: 70% 50%">
    <span class="cork-pin" style="left: 48px; top: -6px; background: #2563eb"></span>
  </div>
  <div class="cork-o cork-lift cork-badge" style="left: 984px; top: 464px; --r: -10deg; transform: rotate(-10deg); z-index: 9; background: radial-gradient(circle at 35% 30%, #ff9a52, #ea580c 60%, #b23f06)"><span style="font: 26px/1 'Anton', sans-serif; color: #fff8eb">V5</span></div>
  <div class="cork-o cork-lift cork-badge" style="left: 1340px; top: 420px; width: 52px; height: 52px; background: radial-gradient(circle at 35% 30%, #86efac, #16a34a 60%, #0f6b30)"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f0fdf4" stroke-width="2" stroke-linecap="round"><path d="M5 21c.5 -4.5 2.5 -8 7 -10M9 18c6.2 0 10.5 -3.3 11 -12v-2h-4c-9 0 -12 4 -12 9c0 1 0 3 2 5h3"></path></svg></div>
  <span class="cork-washi" style="left: 640px; top: 16px; width: 120px; height: 26px; transform: rotate(-4deg); background: repeating-linear-gradient(90deg, #f4b6c2 0 10px, #fbe3e8 10px 20px); z-index: 6"></span>
  <span class="cork-washi" style="left: 950px; top: 620px; width: 90px; height: 22px; transform: rotate(32deg); background: repeating-linear-gradient(45deg, #93c5fd 0 6px, #dbeafe 6px 12px)"></span>
  <span class="cork-washi" style="left: 330px; top: 230px; width: 100px; height: 22px; transform: rotate(-70deg); background: #b7d7a8"></span>
  ${[[26, 40, -14, 38, '#e8b93a'], [360, 600, 18, 30, '#e8b93a'], [1060, 440, -20, 34, '#e8b93a'], [980, 230, 4, 26, '#e8b93a'], [400, 4, 22, 28, '#e8b93a'], [230, 790, -4, 24, '#7ec8e3'], [1380, 300, 10, 30, '#7ec8e3']]
    .map(([x, y, r, s, c]) => `<svg class="cork-sh" style="position: absolute; left: ${x}px; top: ${y}px; transform: rotate(${r}deg)" width="${s}" height="${s}"><use href="#cork-star" fill="${c}"></use></svg>`).join('')}`;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

const hash = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7);

export class Corkboard {
  // io: {
  //   openFidget(id), openFolder(path), openDay(year, month, day),
  //   loadMonth(year, month), loadToday() → tasks, toggleTask(task),
  //   folders() → [{ name, path, subfolders, notes }], quotes() → [{ text, who }],
  //   onMenu(event) — right-click on the frame
  // }
  constructor(container, io) {
    this.io = io;
    this.root = el('div', 'cork-home');
    this.stage = el('div', 'cork-stage');
    this.root.append(this.stage);
    container.replaceChildren(this.root);
    this.build();
    this.fit();
    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(this.root);
  }

  destroy() {
    if (this.resize) this.resize.disconnect();
  }

  // Files changed: reload what the board shows, keeping it as it is.
  refresh() {
    const typing = this.receiptEl && this.receiptEl.contains(document.activeElement) && document.activeElement.tagName === 'INPUT';
    if (typing) document.activeElement.addEventListener('blur', () => setTimeout(() => this.fillReceipt(), 0), { once: true });
    else this.fillReceipt();
    if (this.cal) this.cal.render();
    if (this.keysBox) this.keysBox.replaceChildren(keyRack(this.io.folders(), (path) => this.io.openFolder(path)));
  }

  // The board is drawn at 1440 × 860 and scaled to fit the window.
  fit() {
    const w = this.root.clientWidth;
    const h = this.root.clientHeight;
    if (!w || !h) return;
    const k = Math.min(w / W, h / H);
    this.stage.style.transform = `translate(${((w - W * k) / 2).toFixed(1)}px, ${((h - H * k) / 2).toFixed(1)}px) scale(${k.toFixed(4)})`;
  }

  build() {
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    defs.setAttribute('width', '0');
    defs.setAttribute('height', '0');
    defs.setAttribute('aria-hidden', 'true');
    defs.style.position = 'absolute';
    defs.innerHTML = `<defs>${DEFS}</defs>`;

    const frame = el('div', 'cork-frame');
    frame.innerHTML = '<svg width="1440" height="860" aria-hidden="true"><rect width="1440" height="860" filter="url(#cork-wood)"></rect></svg>';
    frame.addEventListener('contextmenu', (e) => {
      if (!e.target.closest('.cork-board')) this.io.onMenu(e);
    });
    this.board = el('div', 'cork-board');
    this.boardBg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.boardBg.setAttribute('width', '1404');
    this.boardBg.setAttribute('height', '824');
    this.boardBg.innerHTML = '<rect width="1404" height="824" filter="url(#cork-tex)"></rect>';
    this.boardBg.addEventListener('contextmenu', (e) => this.io.onMenu(e));
    this.board.append(this.boardBg);

    this.board.append(...this.cutouts());
    this.board.insertAdjacentHTML('beforeend', DECOR);
    this.board.append(this.calendar(), this.passport(), this.receipt(), this.quoteCard(), this.keys());
    frame.append(this.board);
    this.stage.append(defs, frame);
  }

  cutouts() {
    return CUTS.map(([sh, x1, y1, x2, y2, left, top, k, rot, round, extra, z], i) => {
      const [src, SW, SH] = SHEETS[sh];
      const w = (x2 - x1) * k;
      const hh = (y2 - y1) * k;
      const wrap = el('div', 'cork-o cork-lift');
      wrap.style.cssText = `left: ${left}px; top: ${top}px; width: ${w.toFixed(1)}px; height: ${hh.toFixed(1)}px; --r: ${rot}deg; transform: rotate(${rot}deg);${z ? ` z-index: ${z};` : ''}`;
      const art = el('span', 'cork-cut');
      art.style.cssText = `background-image: url(${src}); background-size: ${(SW * k).toFixed(1)}px ${(SH * k).toFixed(1)}px; background-position: ${(-x1 * k).toFixed(1)}px ${(-y1 * k).toFixed(1)}px; border-radius: ${round ? '50%' : '2px'}`;
      wrap.append(art);
      if (extra === 'pin') {
        const p = el('span', 'cork-pin');
        p.style.cssText = `left: ${(w / 2 - 7).toFixed(1)}px; top: -6px; background: ${PINS[i % PINS.length]}`;
        wrap.append(p);
      } else if (extra === 'tape') {
        const t = el('span', 'cork-tape');
        t.style.cssText = `left: ${(w * 0.25).toFixed(1)}px; top: -10px; width: ${(w * 0.5).toFixed(1)}px; height: 18px; transform: rotate(${i % 2 ? 4 : -5}deg)`;
        wrap.append(t);
      }
      return wrap;
    });
  }

  // The calendar hangs from a brass bulldog clip on a pushpin.
  calendar() {
    const box = el('div', 'cork-o');
    box.style.cssText = 'left: 26px; top: 58px; width: 560px; height: 830px; transform: scale(.69) rotate(-1.6deg); transform-origin: top left';
    this.cal = new CorkCalendar({
      loadMonth: (y, m) => this.io.loadMonth(y, m),
      openDay: (y, m, d) => this.io.openDay(y, m, d),
    });
    box.append(this.cal.el);
    const clip = el('div');
    clip.innerHTML = `
      <svg style="position: absolute; left: 196px; top: 2px; z-index: 12; pointer-events: none" width="40" height="70" viewBox="0 0 40 70" fill="none"><path d="M20 10 C 6 30, 8 52, 14 62 M20 10 C 34 30, 32 52, 26 62" stroke="#3a3a3a" stroke-width="1.4"></path></svg>
      <span class="cork-pin" style="left: 208px; top: 6px; width: 18px; height: 18px; background: #d6283a; z-index: 13"></span>
      <div class="cork-bulldog"><span></span><span></span><span></span>
        <svg width="72" height="12" viewBox="0 0 72 12" fill="none" stroke="#7a5f25" stroke-width="1.2"><path d="M4 2 H68 M24 2 L36 10 L48 2"></path></svg></div>`;
    const wrap = el('div', 'cork-calendar');
    wrap.append(box, ...clip.children);
    return wrap;
  }

  // The passport: a real passport photo; its stamps open the fidgets.
  passport() {
    const box = el('div', 'cork-o cork-passport');
    box.style.cssText = 'left: 404px; top: -4px; transform: scale(.52) rotate(1.4deg); transform-origin: top left; z-index: 4';
    const page = el('div', 'cork-passport-page');
    const img = el('img');
    img.src = passportImg;
    img.alt = 'Passport visa pages';
    page.append(img);
    for (const [x, y, w, hh, rot, ink, size, text] of PATCHES) {
      const p = el('div', 'cork-passport-patch');
      p.style.cssText = `left: ${x}px; top: ${y}px; width: ${w}px; height: ${hh}px;${rot === 180 ? ' transform: rotate(180deg);' : ''}`;
      const t = el('span', null, text);
      t.style.cssText = `color: ${ink}; font-size: ${size}px;${rot === 90 ? ' transform: rotate(90deg);' : ''}`;
      p.append(t);
      page.append(p);
    }
    box.append(page);
    for (const [id, label, x, y, w, hh, radius] of STAMPS) {
      const b = el('button', `cork-stamp${id ? '' : ' is-later'}`);
      b.type = 'button';
      b.style.cssText = `left: ${x}px; top: ${y}px; width: ${w}px; height: ${hh}px; border-radius: ${typeof radius === 'number' ? `${radius}px` : radius}`;
      b.setAttribute('aria-label', id ? `Open ${label}` : label);
      b.append(el('span', 'cork-stamp-tip', label));
      if (id) b.addEventListener('click', () => this.io.openFidget(id));
      box.append(b);
    }
    return box;
  }

  // Today's tasks, printed on a shop receipt. Ticking draws a pen tick.
  receipt() {
    const box = el('div', 'cork-o cork-receipt-wrap');
    box.style.cssText = 'left: 1086px; top: 40px; width: 252px; transform: rotate(2deg); z-index: 11';
    this.receiptEl = el('div', 'cork-receipt');
    box.append(this.receiptEl);
    box.insertAdjacentHTML('beforeend', '<div class="cork-binder"><span></span><span></span><span></span></div>');
    this.fillReceipt();
    return box;
  }

  async fillReceipt() {
    const r = this.receiptEl;
    const now = new Date();
    const two = (n) => String(n).padStart(2, '0');
    const line = (cls, ...parts) => {
      const d = el('div', `cork-rc ${cls || ''}`);
      parts.forEach((p) => d.append(typeof p === 'string' ? el('span', null, p) : p));
      return d;
    };
    let tasks = [];
    try {
      tasks = await this.io.loadToday();
    } catch {
      tasks = [];
    }
    tasks.sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
    const hours = (t) => {
      if (!t.time || !t.endTime) return 0;
      const m = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
      return Math.max(0, (m(t.endTime) - m(t.time)) / 60);
    };
    const total = tasks.reduce((s, t) => s + hours(t), 0);
    r.replaceChildren(
      line('is-big is-center', 'OPAL & CO.'),
      line('is-small is-center', '12 VAULT LANE, PERTH WA 6000'),
      line('is-small is-center', 'ABN 07 102 026 441'),
      line('is-small is-split is-gap', `REG 03  TRN ${4400 + now.getDate() * 3}`, `${two(now.getDate())}/${two(now.getMonth() + 1)}/${String(now.getFullYear()).slice(2)} ${two(now.getHours())}:${two(now.getMinutes())}`),
      line('is-small', 'TODAY’S ITEMS'),
    );
    if (!tasks.length) r.append(line('is-center is-gap', '— NOTHING DUE TODAY —'));
    tasks.slice(0, 8).forEach((t) => {
      const row = el('button', 'cork-rc-row');
      row.type = 'button';
      row.setAttribute('aria-pressed', String(t.done));
      row.setAttribute('aria-label', `${t.done ? 'Untick' : 'Tick'} ${t.title}`);
      if (t.done) {
        const v = Math.abs(hash(t.title)) % TICKS.length;
        row.insertAdjacentHTML('afterbegin', `<svg class="cork-tick" style="transform: rotate(${[-8, 4, -3, 7, -5][v]}deg)" width="26" height="22" viewBox="0 0 26 22" fill="none" stroke="#2346b5" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" filter="url(#cork-pen)"><path d="${TICKS[v]}"></path></svg>`);
      }
      const body = el('span', 'cork-rc-body');
      const top = el('span', 'cork-rc is-split');
      top.append(el('span', 'cork-rc-item', t.title.toUpperCase()), el('span', null, t.time || ''));
            body.append(top);
      row.append(body);
      row.addEventListener('click', async () => {
        row.disabled = true;
        try {
          await this.io.toggleTask(t);
        } finally {
          this.fillReceipt();
        }
      });
      r.append(row);
    });
    const done = tasks.filter((t) => t.done).length;
    const barcode = el('div', 'cork-barcode');
    r.append(
      line('is-split is-rule', 'SUBTOTAL', `${total.toFixed(1)} HRS`),
      line('is-small is-split', 'DONE', `${done} / ${tasks.length}`),
      line('is-total is-split', 'TOTAL', `${tasks.length} ITEM${tasks.length === 1 ? '' : 'S'}`),
      line('is-small is-gap', 'PAID BY: EFFORT ************26'),
      barcode,
      line('is-small is-center', 'THANK YOU · NO REFUNDS ON TIME'),
    );
    if (this.io.quickList) r.append(await this.stub());
  }

  // The tear-off stub: a short to-do list you can write on (Tasks/Quick list.md).
  async stub() {
    const io = this.io.quickList;
    const box = el('div', 'cork-stub');
    box.insertAdjacentHTML('beforeend', '<div class="cork-perf"><svg width="18" height="14" viewBox="0 0 24 18" fill="none" stroke="#6a645c" stroke-width="1.6" stroke-linecap="round"><circle cx="5" cy="4" r="3"></circle><circle cx="5" cy="14" r="3"></circle><path d="M7.5 5.5 L22 14 M7.5 12.5 L22 4"></path></svg></div>');
    box.append(el('div', 'cork-rc is-big is-center', 'TO DO'), el('div', 'cork-rc is-small is-center is-dim', 'TEAR HERE · WRITE ON ME'));
    let tasks = [];
    try {
      tasks = await io.load();
    } catch {
      tasks = [];
    }
    const save = async (fn) => {
      box.classList.add('is-saving');
      try {
        await fn();
      } catch (err) {
        alert(`Couldn't save the list.\n\n${err.message}`);
      }
      this.fillReceipt();
    };
    tasks.slice(0, 8).forEach((t) => {
      const row = el('div', 'cork-stub-row');
      const tick = el('button', 'cork-stub-box');
      tick.type = 'button';
      tick.setAttribute('aria-label', `${t.done ? 'Untick' : 'Tick'} ${t.title}`);
      tick.setAttribute('aria-pressed', String(t.done));
      if (t.done) {
        const v = Math.abs(hash(t.title)) % TICKS.length;
        tick.innerHTML = `<svg class="cork-tick" style="transform: rotate(${[-8, 4, -3, 7, -5][v]}deg)" width="26" height="22" viewBox="0 0 26 22" fill="none" stroke="#2346b5" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" filter="url(#cork-pen)"><path d="${TICKS[v]}"></path></svg>`;
      }
      tick.addEventListener('click', () => save(() => io.toggle(t)));
      const input = el('input', 'cork-stub-text');
      input.value = t.title;
      input.setAttribute('aria-label', 'To-do');
      const commit = () => {
        const next = input.value.trim();
        if (next === t.title) return;
        save(() => (next ? io.rename(t, next) : io.remove(t)));
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') input.blur();
        if (e.key === 'Escape') {
          input.value = t.title;
          input.blur();
        }
      });
      input.addEventListener('blur', commit);
      row.append(tick, input);
      box.append(row);
    });
    if (tasks.length < 8) {
      const row = el('div', 'cork-stub-row is-new');
      const plus = el('span', 'cork-stub-box cork-rc', '+');
      const input = el('input', 'cork-stub-text');
      input.placeholder = 'ADD A LINE…';
      input.setAttribute('aria-label', 'Add a to-do');
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && input.value.trim()) {
          const title = input.value.trim();
          this.stubFocus = true; // keep writing on the next line
          save(() => io.add(title));
        }
      });
      row.append(plus, input);
      box.append(row);
      if (this.stubFocus) {
        this.stubFocus = false;
        requestAnimationFrame(() => input.focus());
      }
    }
    if (tasks.some((t) => t.done)) {
      const clear = el('button', 'cork-stub-clear cork-rc is-small', 'CLEAR TICKED');
      clear.type = 'button';
      clear.addEventListener('click', () => save(() => io.clearDone()));
      box.append(clear);
    }
    return box;
  }

  // A quote on an index card, under a gold clip.
  quoteCard() {
    const card = el('div', 'cork-o cork-lift cork-quote');
    card.style.cssText = 'left: 860px; top: 496px; --r: -2deg; transform: rotate(-2deg); z-index: 12';
    const text = el('div', 'cork-quote-text');
    const who = el('span', 'cork-quote-who');
    const next = el('button', 'cork-quote-next');
    next.type = 'button';
    next.setAttribute('aria-label', 'Another quote');
    next.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4v5h5M20 20v-5h-5"></path><path d="M5.6 15a8 8 0 0 0 13.4 2M18.4 9A8 8 0 0 0 5 7"></path></svg>';
    const foot = el('div', 'cork-quote-foot');
    foot.append(who, next);
    card.append(text, foot);
    card.insertAdjacentHTML('beforeend', '<div class="cork-goldclip"><span></span><span></span></div>');
    const quotes = (this.io.quotes() || []).filter((q) => q && q.text);
    const list = quotes.length ? quotes : DEFAULT_QUOTES;
    let i = Math.floor(Math.random() * list.length);
    const show = () => {
      text.textContent = list[i].text;
      who.textContent = list[i].who ? `— ${list[i].who}` : '';
    };
    next.addEventListener('click', () => {
      i = (i + 1) % list.length;
      show();
    });
    show();
    return card;
  }

  keys() {
    const box = el('div', 'cork-o');
    box.style.cssText = 'left: 470px; top: 640px; width: 1660px; height: 380px; transform: scale(.5); transform-origin: top left; z-index: 10';
    box.append(keyRack(this.io.folders(), (path) => this.io.openFolder(path)));
    this.keysBox = box;
    return box;
  }
}
