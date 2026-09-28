// Viewers for Office files: Word (via mammoth), Excel/CSV (via SheetJS),
// PowerPoint (via our own reader in pptx-reader.js).

import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { h } from '../ui.js';
import { Viewer } from './viewer.js';
import { sanitizeHtml } from './sanitize.js';
import { readPptx } from './pptx-reader.js';

// ---------- Word ----------

export class DocxViewer extends Viewer {
  async render() {
    this.root.classList.add('viewer-doc');
    this.showLoading();
    const arrayBuffer = await this.fetchBytes();
    const result = await mammoth.convertToHtml({ arrayBuffer });
    if (this.destroyed) return;
    const page = h('article', { class: 'doc-page' });
    page.append(sanitizeHtml(result.value));
    if (!page.textContent.trim() && !page.querySelector('img')) {
      page.append(h('p', { class: 'hand viewer-hand' }, 'this document looks empty'));
    }
    this.root.replaceChildren(h('div', { class: 'doc-desk' }, page));
  }
}

// ---------- Excel / CSV ----------

const MAX_ROWS = 1000;
const MAX_COLS = 60;

function columnName(index) {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

export class SheetViewer extends Viewer {
  async render() {
    this.root.classList.add('viewer-sheet');
    this.showLoading();
    const bytes = await this.fetchBytes();
    const isCsv = /\.csv$/i.test(this.filePath);
    this.workbook = isCsv
      ? XLSX.read(new TextDecoder().decode(bytes), { type: 'string', raw: true })
      : XLSX.read(new Uint8Array(bytes), { type: 'array', cellDates: true });
    if (this.destroyed) return;
    this.showSheet(this.workbook.SheetNames[0]);
  }

  showSheet(name) {
    const sheet = this.workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '', blankrows: true });
    const colCount = Math.min(MAX_COLS, rows.reduce((max, row) => Math.max(max, row.length), 0));
    const shownRows = rows.slice(0, MAX_ROWS);

    const tabs = h('div', { class: 'sheet-tabs', role: 'tablist' },
      this.workbook.SheetNames.map((sheetName) => h('button', {
        class: `sheet-tab${sheetName === name ? ' is-active' : ''}`,
        role: 'tab',
        'aria-selected': String(sheetName === name),
        onclick: () => this.showSheet(sheetName),
      }, sheetName)));

    const table = h('table', { class: 'sheet-grid' },
      h('thead', null, h('tr', null,
        h('th', { class: 'sheet-corner' }),
        Array.from({ length: colCount }, (_, c) => h('th', null, columnName(c))))),
      h('tbody', null, shownRows.map((row, r) => h('tr', null,
        h('th', null, String(r + 1)),
        Array.from({ length: colCount }, (_, c) => {
          const value = row[c] == null ? '' : String(row[c]);
          const numeric = value !== '' && !Number.isNaN(Number(value.replace(/[,%$€£]/g, '')));
          return h('td', { class: numeric ? 'is-number' : null }, value);
        })))));

    const notes = [];
    if (rows.length > MAX_ROWS) notes.push(`showing the first ${MAX_ROWS} of ${rows.length} rows`);
    if (rows.some((row) => row.length > MAX_COLS)) notes.push(`showing the first ${MAX_COLS} columns`);
    if (!rows.length) notes.push('this sheet is empty');

    this.root.replaceChildren(...[
      tabs,
      h('div', { class: 'sheet-scroll' }, table),
      notes.length ? h('div', { class: 'sheet-note mono-label' }, notes.join(' · ')) : null,
    ].filter(Boolean));
  }
}

// ---------- PowerPoint ----------

// Slides are laid out at this width, then scaled to fit the window.
const BASE_WIDTH = 960;

export class SlidesViewer extends Viewer {
  async render() {
    this.root.classList.add('viewer-slides');
    this.showLoading();
    const bytes = await this.fetchBytes();
    const deck = readPptx(new Uint8Array(bytes));
    if (this.destroyed) {
      deck.urls.forEach((u) => URL.revokeObjectURL(u));
      return;
    }
    this.urls = deck.urls;

    const baseHeight = Math.round((BASE_WIDTH * deck.height) / deck.width);
    const emu = (value) => (value / deck.width) * BASE_WIDTH; // slide units → layout pixels
    const pt = BASE_WIDTH / (deck.width / 12700); // 1 point → layout pixels

    const frames = deck.slides.map((slide, i) => {
      const frame = h('div', {
        class: 'slide-frame',
        style: `width: ${BASE_WIDTH}px; height: ${baseHeight}px;${slide.background ? ` background: ${slide.background};` : ''}`,
      }, slide.shapes.map((shape) => drawShape(shape, emu, pt)));
      const holder = h('div', { class: 'slide-holder' }, frame);
      return h('section', { class: 'slide-block', 'aria-label': `Slide ${i + 1}` },
        h('span', { class: 'mono-label slide-number' }, `${String(i + 1).padStart(2, '0')} / ${String(deck.slides.length).padStart(2, '0')}`),
        holder);
    });

    const intro = h('p', { class: 'serif-i slides-note' },
      'A reading copy: text, pictures and tables in place. For animations and exact styling, open it in its own app.');
    const list = h('div', { class: 'slides-list' }, intro, frames.length ? frames : h('p', { class: 'hand viewer-hand' }, 'no slides in here'));
    this.root.replaceChildren(list);

    // Scale every slide to the available width.
    const fit = () => {
      const available = Math.min(list.clientWidth - 48, 1100);
      const scale = Math.max(0.2, available / BASE_WIDTH);
      for (const holder of list.querySelectorAll('.slide-holder')) {
        holder.style.width = `${BASE_WIDTH * scale}px`;
        holder.style.height = `${baseHeight * scale}px`;
        holder.firstChild.style.transform = `scale(${scale})`;
      }
    };
    this.resizeObserver = new ResizeObserver(fit);
    this.resizeObserver.observe(list);
    fit();
  }

  cleanup() {
    if (this.resizeObserver) this.resizeObserver.disconnect();
    (this.urls || []).forEach((u) => URL.revokeObjectURL(u));
    this.urls = [];
  }
}

function box(shape, emu) {
  return `left: ${emu(shape.x)}px; top: ${emu(shape.y)}px; width: ${emu(shape.w)}px; height: ${emu(shape.h)}px;`;
}

function drawShape(shape, emu, pt) {
  if (shape.type === 'image') {
    return shape.url
      ? h('img', { class: 'slide-image', src: shape.url, alt: shape.name || '', style: box(shape, emu) })
      : h('div', { class: 'slide-missing mono-label', style: box(shape, emu) }, shape.label);
  }
  if (shape.type === 'placeholder') {
    return h('div', { class: 'slide-missing mono-label', style: box(shape, emu) }, shape.label);
  }
  if (shape.type === 'table') {
    return h('div', { class: 'slide-table-wrap', style: box(shape, emu) },
      h('table', { class: 'slide-table', style: `font-size: ${14 * pt}px` },
        shape.rows.map((row, r) => h('tr', null, row.map((cell) => h(r === 0 && shape.headerRow ? 'th' : 'td', null, cell))))));
  }

  // Text box
  const justify = { t: 'flex-start', ctr: 'center', b: 'flex-end' }[shape.anchor] || 'flex-start';
  const el = h('div', {
    class: `slide-text${shape.isTitle ? ' is-title' : ''}`,
    style: `${box(shape, emu)} justify-content: ${justify};${shape.fill ? ` background: ${shape.fill};` : ''}`,
  });
  for (const para of shape.paragraphs) {
    const size = (para.runs.find((r) => r.size)?.size || shape.defaultSize) * pt;
    const p = h('div', {
      class: 'slide-para',
      style: `font-size: ${size}px; text-align: ${{ ctr: 'center', r: 'right', just: 'justify' }[para.align] || 'left'}; padding-left: ${para.bullet ? (para.level + 1) * 1.1 : para.level * 1.1}em;`,
    });
    if (para.bullet) p.append(h('span', { class: 'slide-bullet', 'aria-hidden': 'true' }, para.level ? '–' : '•'));
    if (!para.runs.length) p.append(' ');
    for (const run of para.runs) {
      const styles = [];
      if (run.size) styles.push(`font-size: ${run.size * pt}px`);
      if (run.bold) styles.push('font-weight: 700');
      if (run.italic) styles.push('font-style: italic');
      if (run.color) styles.push(`color: ${run.color}`);
      p.append(styles.length ? h('span', { style: styles.join('; ') }, run.text) : run.text);
    }
    el.append(p);
  }
  return el;
}
