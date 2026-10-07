// The hand-drawn month calendar pinned to the corkboard. February–September
// use the artist's pages (top half only); the other months use Opal's own
// drawings. The grid is drawn by hand: wavering lines, drawn numbers, a
// "Notes:" box in the empty cells, the 1st in red.

import { lettering, rng, wobble, star } from './hand-lettering.js';
import { MONTH_ART } from './calendar-art.js';
import feb from '../assets/corkboard/month-02.webp';
import mar from '../assets/corkboard/month-03.webp';
import apr from '../assets/corkboard/month-04.webp';
import may from '../assets/corkboard/month-05.webp';
import jun from '../assets/corkboard/month-06.webp';
import jul from '../assets/corkboard/month-07.webp';
import aug from '../assets/corkboard/month-08.webp';
import sep from '../assets/corkboard/month-09.webp';

const NAMES = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
// [image, its height, where the drawing ends (as a fraction), paper colour]
const ART = {
  1: [feb, 1138, 0.534, '#fcf9ec'],
  2: [mar, 1138, 0.533, '#fcfaef'],
  3: [apr, 1138, 0.533, '#fcfaf0'],
  4: [may, 1043, 0.537, '#fcfaef'],
  5: [jun, 1043, 0.537, '#fcfaf0'],
  6: [jul, 1043, 0.542, '#fcfbf0'],
  7: [aug, 1043, 0.537, '#fcfaf1'],
  8: [sep, 1043, 0.539, '#fcfaf0'],
};
const STARS = {
  9: [[214, 40, 16, 7, 7, '#e9b949'], [372, 168, 13, 6, 6, '#93a7cf'], [520, 258, 15, 7, 7, '#b5e255'], [62, 92, 14, 6, 6, '#c8553d'], [500, 344, 13, 6, 6, 'none']],
  10: [[500, 160, 15, 7, 7, '#e9b949'], [96, 200, 12, 5, 6, '#c8553d'], [356, 220, 12, 6, 6, '#b5e255'], [268, 140, 10, 5, 6, 'none']],
  11: [[70, 60, 15, 7, 7, '#e9b949'], [290, 200, 13, 6, 6, '#c8553d'], [520, 380, 12, 5, 6, '#b5e255'], [250, 300, 10, 5, 6, 'none'], [440, 170, 11, 5, 7, '#93a7cf']],
  0: [[330, 40, 15, 7, 7, '#e9b949'], [180, 270, 12, 6, 6, '#c8553d'], [520, 280, 13, 6, 6, '#b5e255'], [36, 120, 10, 5, 6, 'none']],
};
const SVG = 'http://www.w3.org/2000/svg';
const GX = 34;
const GW = 492;
const CW = GW / 7;
const GY = 40;
const RH = 62;

function svg(width, height, inner, style = '') {
  const el = document.createElementNS(SVG, 'svg');
  el.setAttribute('width', width);
  el.setAttribute('height', height);
  el.setAttribute('viewBox', `0 0 ${width} ${height}`);
  el.setAttribute('fill', 'none');
  el.setAttribute('stroke-linecap', 'round');
  el.setAttribute('stroke-linejoin', 'round');
  if (style) el.setAttribute('style', style);
  el.innerHTML = inner;
  return el;
}

export class CorkCalendar {
  // io: { loadMonth(year, month) → { [day]: [{ text, color, cont }] }, openDay(year, month, day) }
  constructor(io, today = new Date()) {
    this.io = io;
    this.today = today;
    this.year = today.getFullYear();
    this.month = today.getMonth();
    this.el = document.createElement('div');
    this.el.className = 'cork-cal';
    this.render();
  }

  go(step) {
    const d = new Date(this.year, this.month + step, 1);
    this.year = d.getFullYear();
    this.month = d.getMonth();
    this.render();
  }

  async render() {
    const { year, month } = this;
    const token = (this.token = {});
    const paper = (ART[month] || [0, 0, 0, '#fcfaf0'])[3];
    const r = rng(year * 100 + month + 7);
    this.el.style.backgroundColor = paper;
    this.el.replaceChildren();

    // ---- the picture ----
    const top = document.createElement('div');
    top.className = 'cork-cal-art';
    if (ART[month]) {
      const [src, H, c] = ART[month];
      const scale = 430 / (H * c);
      const w = 736 * scale;
      const img = document.createElement('img');
      img.src = src;
      img.alt = `${NAMES[month]} illustration`;
      img.style.cssText = `position: absolute; top: 0; left: ${((560 - w) / 2).toFixed(1)}px; width: ${w.toFixed(1)}px; height: ${(H * scale).toFixed(1)}px`;
      top.append(img);
    } else {
      const name = lettering(NAMES[month], 0, 0, 52, 3);
      const nx = 538 - name.w;
      const ny = 424;
      const placed = lettering(NAMES[month], nx, ny, 52, 3);
      const fr = rng(month + 3);
      const frame = [wobble(fr, 22, 16, 538, 16, 1.4), wobble(fr, 538, 16, 538, 372, 1.4), wobble(fr, 22, 16, 22, 392, 1.4), wobble(fr, 22, 392, nx - 10, 392, 1.4)].join(' ');
      const stars = (STARS[month] || []).map(([x, y, R, rr, n, fill]) => `<path d="${star(x, y, R, rr, n, r() * 2)}" fill="${fill}" stroke="${fill === 'none' ? '#93a7cf' : fill}" stroke-width="1.4"></path>`).join('');
      top.append(svg(560, 430, `<g filter="url(#cork-hand)" stroke="#1d1d1b" stroke-width="1.8">
        <path d="${frame}" stroke="#c8553d" stroke-width="2.2"></path>
        ${MONTH_ART[month] || ''}
        ${stars}
        <path d="M${nx - 6} ${ny - 58} H${nx + name.w + 6} V${ny + 4} H${nx - 6} Z" stroke="none" fill="${paper}"></path>
        <path d="${placed.d}" stroke="#c8553d" stroke-width="2.6"></path>
      </g>`, 'position: absolute; inset: 0'));
    }
    this.el.append(top);

    // ---- which day goes in which cell ----
    const days = new Date(year, month + 1, 0).getDate();
    const lead = (new Date(year, month, 1).getDay() + 6) % 7;
    const prevDays = new Date(year, month, 0).getDate();
    const slots = [];
    let notes = null;
    if (lead >= 2) {
      const n = Math.min(3, lead);
      notes = { start: 0, len: n };
      for (let i = n; i < lead; i++) slots[i] = { grey: prevDays - (lead - 1 - i) };
    } else if (lead === 1) slots[0] = { grey: prevDays };
    for (let d = 1; d <= days; d++) {
      const i = lead + d - 1;
      if (i >= 35) slots[i - 7].split = d; // shares a cell, split on the diagonal
      else slots[i] = { d };
    }
    let next = 1;
    for (let i = Math.min(35, lead + days); i < 35; i++) {
      if (next <= 3 || 35 - i < 2 || notes) slots[i] = { grey: next++, nextMonth: true };
      else {
        notes = { start: i, len: 35 - i };
        break;
      }
    }

    // ---- the drawn grid ----
    let grid = '';
    let nums = '';
    let greys = '';
    let reds = '';
    let today = '';
    let notesD = '';
    for (let row = 0; row <= 5; row++) grid += `${wobble(r, GX, GY + row * RH, GX + GW, GY + row * RH, 1.2)} `;
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col <= 7; col++) {
        const i = row * 7 + col;
        if (notes && col > 0 && col < 7 && i > notes.start && i < notes.start + notes.len) continue;
        grid += `${wobble(r, GX + col * CW, GY + row * RH, GX + col * CW, GY + (row + 1) * RH, 1.1)} `;
      }
    }
    const isThisMonth = this.today.getFullYear() === year && this.today.getMonth() === month;
    const cells = document.createElement('div');
    cells.className = 'cork-cal-cells';
    const cellFor = {};
    for (let i = 0; i < 35; i++) {
      const row = Math.floor(i / 7);
      const col = i % 7;
      const sl = slots[i] || {};
      const x0 = GX + col * CW;
      const y0 = GY + row * RH;
      const number = (v) => {
        const w = lettering(v, 0, 0, 11, 2.6).w;
        return `${lettering(v, x0 + CW - 6 - w, y0 + 15, 11, 2.6).d} `;
      };
      if (sl.d) {
        if (sl.d === 1) reds += number(1);
        else nums += number(sl.d);
        if (sl.split) {
          grid += `${wobble(r, x0 + 2, y0 + RH - 2, x0 + CW - 2, y0 + 2, 0.8)} `;
          nums += `${lettering(sl.split, x0 + 5, y0 + RH - 6, 11, 2.6).d} `;
        }
        if (isThisMonth && sl.d === this.today.getDate()) {
          const cx = x0 + CW - 14;
          const cy = y0 + 9;
          today = `M${cx + 12} ${cy - 8} C ${cx - 4} ${cy - 14}, ${cx - 16} ${cy - 2}, ${cx - 12} ${cy + 6} C ${cx - 6} ${cy + 14}, ${cx + 14} ${cy + 12}, ${cx + 16} ${cy + 2} C ${cx + 17} ${cy - 6}, ${cx + 8} ${cy - 11}, ${cx} ${cy - 10}`;
        }
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'cork-cal-cell';
        cell.setAttribute('aria-label', `${sl.d} ${NAMES[month].toLowerCase()}`);
        cell.style.cssText = `left: ${x0 + 1}px; top: ${430 + y0 + 1}px; width: ${CW - 2}px; height: ${RH - 2}px`;
        const list = document.createElement('span');
        list.className = 'cork-cal-evs';
        cell.append(list);
        cell.dataset.openDay = `${year}-${String(month + 1).padStart(2, '0')}-${String(sl.d).padStart(2, '0')}`;
        cell.addEventListener('click', () => this.io.openDay(year, month, sl.d));
        cells.append(cell);
        cellFor[sl.d] = list;
        if (sl.split) cellFor[sl.split] = list;
      } else if (sl.grey) {
        if (sl.nextMonth && sl.grey === 1) reds += number(1);
        else greys += number(sl.grey);
      }
      if (notes && i === notes.start) notesD = lettering('NOTES:', x0 + 6, y0 + 13, 9, 2.4).d;
    }
    const dows = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((w, i) => lettering(w, GX + i * CW + 4, GY - 8, 12, 2.8).d).join(' ');
    const yl = lettering(String(year), 0, 0, 13, 9).w;
    const yearD = lettering(String(year), 280 - yl / 2, GY + 5 * RH + 40, 13, 9).d;
    this.el.append(svg(560, 400, `<g filter="url(#cork-hand2)">
      <path d="${dows}" stroke="#1d1d1b" stroke-width="1.7"></path>
      <path d="${grid}" stroke="#1d1d1b" stroke-width="2.3"></path>
      <path d="${nums}" stroke="#1d1d1b" stroke-width="1.6"></path>
      <path d="${greys}" stroke="#a9a69c" stroke-width="1.5"></path>
      <path d="${reds}" stroke="#c8553d" stroke-width="1.7"></path>
      <path d="${notesD}" stroke="#c8553d" stroke-width="1.5"></path>
      <path d="${today}" stroke="#c8553d" stroke-width="1.8"></path>
      <path d="${yearD}" stroke="#1d1d1b" stroke-width="1.7"></path>
    </g>`, 'position: absolute; left: 0; top: 430px; pointer-events: none'));
    this.el.append(cells);

    // ---- flipping months ----
    const arrow = (label, d, x, step) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cork-cal-nav';
      b.setAttribute('aria-label', label);
      b.style.left = `${x}px`;
      b.append(svg(26, 18, `<path d="${d}" stroke="#1d1d1b" stroke-width="1.8" filter="url(#cork-hand2)"></path>`));
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.go(step);
      });
      return b;
    };
    this.el.append(arrow('Previous month', 'M24 9 H3 M9 3 L3 9 L9 15', 176, -1), arrow('Next month', 'M2 9 H23 M17 3 L23 9 L17 15', 344, 1));

    // ---- the month's events, written in ----
    let byDay = {};
    try {
      byDay = await this.io.loadMonth(year, month);
    } catch {
      byDay = {};
    }
    if (token !== this.token) return;
    for (const [day, evs] of Object.entries(byDay)) {
      const list = cellFor[day];
      if (!list) continue;
      for (const ev of evs.slice(0, 3)) {
        const span = document.createElement('span');
        span.className = 'cork-cal-ev';
        span.textContent = ev.cont ? `~ ${ev.text}` : ev.text;
        span.title = ev.text;
        span.style.color = ev.color || '#2b2a35';
        if (ev.cont) span.style.opacity = '0.7';
        list.append(span);
      }
    }
  }
}
