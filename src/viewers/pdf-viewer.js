// PDF viewer built on pdf.js: a slim toolbar, a collapsible page overview on
// the left, and pages as sheets of paper. Pages (and their thumbnails) are
// only drawn when they scroll near the screen, so long PDFs stay quick.

import * as pdfjs from 'pdfjs-dist';
import { h } from '../ui.js';
import { Viewer } from './viewer.js';

// pdf.js does its heavy lifting in a background worker (copied into dist/ by the build).
pdfjs.GlobalWorkerOptions.workerSrc = new URL('../dist/pdf.worker.min.mjs', window.location.href).href;

const CSS_UNITS = 96 / 72; // PDF points → screen pixels at "100%"
const ZOOM_STEPS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const THUMB_WIDTH = 132;
const RAIL_KEY = 'opal.pdfRailOpen';

// One background worker, shared by every PDF you open and never shut down.
// (Shutting a worker down mid-task can freeze the window, and reusing it
// makes each PDF open faster.)
let sharedWorker = null;
function pdfWorker() {
  if (!sharedWorker || sharedWorker.destroyed) sharedWorker = new pdfjs.PDFWorker();
  return sharedWorker;
}

function railPreference() {
  try {
    return localStorage.getItem(RAIL_KEY) !== 'false';
  } catch {
    return true;
  }
}

function saveRailPreference(open) {
  try {
    localStorage.setItem(RAIL_KEY, String(open));
  } catch {
    // Not remembered this time; that's fine.
  }
}

export class PdfViewer extends Viewer {
  async render() {
    this.root.classList.add('viewer-pdf');
    this.showLoading();
    const bytes = await window.opal.readBytes(this.filePath);
    // disableFontFace: draw text as shapes instead of installing the PDF's
    // fonts into the window. Looks the same; installing and removing fonts
    // on every PDF made the window stall when leaving one.
    this.task = pdfjs.getDocument({ data: bytes, worker: pdfWorker(), disableFontFace: true });
    this.pdf = await this.task.promise;
    if (this.destroyed) return;

    this.pageCount = this.pdf.numPages;
    this.current = 1;
    this.zoom = 'fit'; // 'fit' (fit width) or a number (1 = 100%)
    this.pages = []; // { num, base (1× viewport), el, canvasHost, rendered }
    this.thumbs = [];
    this.buildShell();

    // Sizes: start every page at page 1's size, then correct them as each loads.
    const first = await this.pdf.getPage(1);
    const firstBase = first.getViewport({ scale: 1 });
    for (let num = 1; num <= this.pageCount; num++) this.addPage(num, firstBase);
    this.stage.addEventListener('scroll', () => this.schedule(), { passive: true });
    this.rail.addEventListener('scroll', () => this.schedule(), { passive: true });
    this.applyZoom();
    this.loadRealSizes();
  }

  // ---------- Layout ----------

  buildShell() {
    this.pageInput = h('input', {
      class: 'pdf-page-input',
      type: 'text',
      inputmode: 'numeric',
      value: '1',
      'aria-label': 'Page number',
    });
    this.pageInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      const num = parseInt(this.pageInput.value, 10);
      if (num >= 1 && num <= this.pageCount) this.goToPage(num);
      else this.pageInput.value = String(this.current);
      this.pageInput.blur();
    });
    this.pageInput.addEventListener('focus', () => this.pageInput.select());

    this.zoomLabel = h('span', { class: 'pdf-zoom-label' }, '100%');
    this.railButton = h('button', {
      class: 'pdf-tool pdf-rail-toggle',
      'aria-pressed': 'true',
      onclick: () => this.setRailOpen(!this.railOpen),
    }, h('span', { class: 'pdf-rail-icon', 'aria-hidden': 'true' }), 'Pages');

    const toolbar = h('div', { class: 'pdf-toolbar', role: 'toolbar', 'aria-label': 'PDF' },
      this.railButton,
      h('div', { class: 'pdf-tool pdf-pager' },
        h('button', { class: 'pdf-step', 'aria-label': 'Previous page', onclick: () => this.goToPage(this.current - 1) }, '‹'),
        this.pageInput,
        h('span', { class: 'pdf-of' }, `/ ${this.pageCount}`),
        h('button', { class: 'pdf-step', 'aria-label': 'Next page', onclick: () => this.goToPage(this.current + 1) }, '›')),
      h('div', { class: 'grow' }),
      h('div', { class: 'pdf-tool pdf-zoom' },
        h('button', { class: 'pdf-step', 'aria-label': 'Zoom out', onclick: () => this.stepZoom(-1) }, '−'),
        this.zoomLabel,
        h('button', { class: 'pdf-step', 'aria-label': 'Zoom in', onclick: () => this.stepZoom(1) }, '+')),
      this.fitButton = h('button', { class: 'pdf-tool pdf-fit', 'aria-pressed': 'true', onclick: () => this.setZoom('fit') }, 'Fit width'),
    );

    this.rail = h('nav', { class: 'pdf-rail', 'aria-label': 'Page overview' });
    this.stage = h('div', { class: 'pdf-stage' });
    this.shell = h('div', { class: 'pdf-shell' }, toolbar, h('div', { class: 'pdf-body' }, this.rail, this.stage));
    this.root.replaceChildren(this.shell);
    this.setRailOpen(railPreference(), { remember: false });

    this.resizeObserver = new ResizeObserver(() => {
      if (this.zoom === 'fit') this.applyZoom();
      else this.schedule();
    });
    this.resizeObserver.observe(this.stage);
  }

  addPage(num, base) {
    const canvasHost = h('div', { class: 'pdf-canvas-host' });
    const el = h('section', { class: 'pdf-page', 'data-page': String(num), 'aria-label': `Page ${num}` },
      canvasHost,
      h('span', { class: 'pdf-page-number mono-label', 'aria-hidden': 'true' }, String(num).padStart(2, '0')));
    this.stage.append(el);
    this.pages.push({ num, base, el, canvasHost, rendered: null });

    const thumbCanvasHost = h('span', { class: 'pdf-thumb-sheet' });
    const thumb = h('button', {
      class: 'pdf-thumb',
      'data-page': String(num),
      'aria-label': `Go to page ${num}`,
      onclick: () => this.goToPage(num),
    }, thumbCanvasHost, h('span', { class: 'pdf-thumb-number' }, String(num)));
    this.rail.append(thumb);
    this.thumbs.push({ num, el: thumb, host: thumbCanvasHost, drawn: false });
    this.sizeThumb(num, base);
  }

  sizeThumb(num, base) {
    const thumb = this.thumbs[num - 1];
    thumb.host.style.width = `${THUMB_WIDTH}px`;
    thumb.host.style.height = `${Math.round((THUMB_WIDTH * base.height) / base.width)}px`;
  }

  // Pages can differ in size; fetch each one's real size in the background.
  async loadRealSizes() {
    for (let num = 2; num <= this.pageCount; num++) {
      if (this.destroyed) return;
      const page = await this.pdf.getPage(num);
      const base = page.getViewport({ scale: 1 });
      const entry = this.pages[num - 1];
      if (base.width !== entry.base.width || base.height !== entry.base.height) {
        entry.base = base;
        this.sizePage(entry);
        this.sizeThumb(num, base);
        this.schedule();
      }
    }
  }

  setRailOpen(open, { remember = true } = {}) {
    this.railOpen = open;
    this.shell.classList.toggle('rail-closed', !open);
    this.railButton.setAttribute('aria-pressed', String(open));
    if (remember) saveRailPreference(open);
    if (open) this.scrollThumbIntoView(this.current);
    if (this.pages) this.schedule();
  }

  // ---------- Zoom ----------

  scale() {
    if (this.zoom !== 'fit') return this.zoom * CSS_UNITS;
    const widest = Math.max(...this.pages.map((p) => p.base.width));
    const available = Math.max(200, this.stage.clientWidth - 64);
    return Math.min(available / widest, 4 * CSS_UNITS);
  }

  setZoom(zoom) {
    this.zoom = zoom;
    this.applyZoom();
  }

  stepZoom(direction) {
    const now = this.scale() / CSS_UNITS;
    const next = direction > 0
      ? ZOOM_STEPS.find((z) => z > now + 0.01)
      : [...ZOOM_STEPS].reverse().find((z) => z < now - 0.01);
    if (next) this.setZoom(next);
  }

  applyZoom() {
    const keepPage = this.current;
    this.currentScale = this.scale();
    this.zoomLabel.textContent = `${Math.round((this.currentScale / CSS_UNITS) * 100)}%`;
    this.fitButton.setAttribute('aria-pressed', String(this.zoom === 'fit'));
    for (const entry of this.pages) this.sizePage(entry);
    this.goToPage(keepPage);
    this.schedule();
  }

  sizePage(entry) {
    const s = this.currentScale || 1;
    entry.el.style.width = `${Math.floor(entry.base.width * s)}px`;
    entry.el.style.height = `${Math.floor(entry.base.height * s)}px`;
  }

  // ---------- Drawing ----------

  // Works out which pages and thumbnails are on (or near) screen and draws
  // them; pages far away are forgotten to save memory. Runs after scrolling,
  // resizing and zooming (at most once per ~frame).
  schedule() {
    if (this.pending) return;
    this.pending = true;
    setTimeout(() => {
      this.pending = false;
      if (!this.destroyed) this.update();
    }, 16);
  }

  update() {
    const margin = 1200;
    const top = this.stage.scrollTop;
    const bottom = top + this.stage.clientHeight;
    const reading = top + this.stage.clientHeight * 0.4;
    let current = this.current;
    for (const entry of this.pages) {
      const y = entry.el.offsetTop;
      const h = entry.el.offsetHeight;
      if (y + h > top - margin && y < bottom + margin) this.renderPage(entry);
      else this.clearPage(entry);
      if (y <= reading && y + h + 22 > reading) current = entry.num;
    }
    if (top <= 0) current = 1;
    this.setCurrent(current);

    if (this.railOpen) {
      const railTop = this.rail.scrollTop - 400;
      const railBottom = this.rail.scrollTop + this.rail.clientHeight + 400;
      for (const thumb of this.thumbs) {
        const y = thumb.el.offsetTop;
        if (y + thumb.el.offsetHeight > railTop && y < railBottom) this.drawThumb(thumb);
      }
    }
  }

  async renderPage(entry) {
    const scale = this.currentScale;
    if (entry.rendered === scale) return;
    entry.rendered = scale;
    if (entry.task) entry.task.cancel();

    const page = await this.pdf.getPage(entry.num);
    if (this.destroyed || entry.rendered !== scale) return;
    const viewport = page.getViewport({ scale });
    const ratio = window.devicePixelRatio || 1;
    const canvas = h('canvas', { class: 'pdf-canvas' });
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;

    entry.task = page.render({ canvas, viewport, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : null });
    try {
      await entry.task.promise;
    } catch (err) {
      if (err && err.name === 'RenderingCancelledException') return;
      throw err;
    }
    if (this.destroyed || entry.rendered !== scale) return;

    // Invisible text on top, so words can be selected and copied.
    const textLayer = h('div', { class: 'pdf-text-layer' });
    textLayer.style.setProperty('--scale-factor', String(scale));
    textLayer.style.setProperty('--total-scale-factor', String(scale));
    entry.canvasHost.replaceChildren(canvas, textLayer);
    try {
      await new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: textLayer, viewport }).render();
    } catch {
      // Pages without selectable text are fine as a picture.
    }
  }

  clearPage(entry) {
    if (!entry.rendered) return;
    if (entry.task) entry.task.cancel();
    entry.rendered = null;
    entry.canvasHost.replaceChildren();
  }

  async drawThumb(thumb) {
    if (thumb.drawn) return;
    thumb.drawn = true;
    const page = await this.pdf.getPage(thumb.num);
    if (this.destroyed) return;
    const base = page.getViewport({ scale: 1 });
    const ratio = window.devicePixelRatio || 1;
    const viewport = page.getViewport({ scale: (THUMB_WIDTH / base.width) * ratio });
    const canvas = h('canvas', { class: 'pdf-thumb-canvas' });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvas, viewport }).promise.catch(() => {});
    if (!this.destroyed) thumb.host.replaceChildren(canvas);
  }

  // ---------- Moving around ----------

  goToPage(num) {
    const target = Math.min(Math.max(1, num), this.pageCount);
    const entry = this.pages[target - 1];
    if (!entry) return;
    this.stage.scrollTop = entry.el.offsetTop - 26;
    this.setCurrent(target);
    this.schedule();
  }

  setCurrent(num) {
    if (num === this.current && this.pageInput.value === String(num)) return;
    this.current = num;
    if (document.activeElement !== this.pageInput) this.pageInput.value = String(num);
    this.thumbs.forEach((t) => t.el.classList.toggle('is-current', t.num === num));
    this.scrollThumbIntoView(num);
  }

  scrollThumbIntoView(num) {
    const thumb = this.thumbs[num - 1];
    if (!thumb || !this.railOpen) return;
    const top = thumb.el.offsetTop;
    const bottom = top + thumb.el.offsetHeight;
    if (top < this.rail.scrollTop || bottom > this.rail.scrollTop + this.rail.clientHeight) {
      this.rail.scrollTo({ top: top - 16, behavior: 'smooth' });
    }
  }

  cleanup() {
    if (this.resizeObserver) this.resizeObserver.disconnect();
    // Stop any half-drawn pages, then free the document.
    for (const entry of this.pages || []) {
      if (entry.task) entry.task.cancel();
    }
    const task = this.task;
    this.pdf = null;
    this.task = null;
    if (task) task.destroy().catch(() => {});
  }
}
