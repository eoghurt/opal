// Shared base for view-only files (PDF, images, media, Office files).
// Viewers follow the same shape as editors (see editor-registry.js) but never
// have anything to save.

import { h } from '../ui.js';

// Where you'd scrolled to in each file (Word documents, spreadsheets, slides…),
// so coming back to one — another tab, another note, Opal restarting — opens
// it there. A viewing preference on this Mac, never written into notes.
const PLACE_KEY = 'opal.viewerPlaces';
const MAX_PLACES = 200;
let places = null;
let placesTimer = null;

function placesMap() {
  if (!places) {
    try {
      places = new Map(JSON.parse(localStorage.getItem(PLACE_KEY) || '[]'));
    } catch {
      places = new Map();
    }
  }
  return places;
}

function rememberPlace(filePath, place) {
  const map = placesMap();
  map.delete(filePath);
  map.set(filePath, place);
  while (map.size > MAX_PLACES) map.delete(map.keys().next().value);
  clearTimeout(placesTimer);
  placesTimer = setTimeout(() => {
    try {
      localStorage.setItem(PLACE_KEY, JSON.stringify([...map]));
    } catch {
      // Not remembered after a restart this time.
    }
  }, 400);
}

export class Viewer {
  constructor({ parent, filePath, url }) {
    this.filePath = filePath;
    this.url = url;
    this.root = h('div', { class: 'viewer' });
    parent.append(this.root);
    this.destroyed = false;
    this.start();
  }

  // Draws (or redraws) the file. Subclasses implement render().
  async start() {
    try {
      await this.render();
    } catch (err) {
      if (!this.destroyed) this.showProblem(err.message || String(err));
      return;
    }
    if (!this.destroyed && this.remembersPlace !== false) this.keepPlace();
  }

  // ---------- Coming back to where you were ----------

  // The parts that scroll: the viewer itself, a pane inside it (a sheet's
  // grid, the slide list) and the page around it.
  scrollers() {
    const out = { viewer: this.root };
    const inner = this.root.querySelector('.sheet-scroll, .slides-list');
    if (inner) out.inner = inner;
    const page = this.root.closest('#view');
    if (page) out.page = page;
    return out;
  }

  keepPlace() {
    const saved = placesMap().get(this.filePath);
    let restoring = Boolean(saved);
    const stop = () => { restoring = false; };
    const restore = () => {
      if (!restoring || this.destroyed) return;
      for (const [name, el] of Object.entries(this.scrollers())) {
        const at = saved[name];
        if (!at) continue;
        // Scaled, in case the document is a different size now (window width, zoom).
        el.scrollTop = at.h ? at.top * (el.scrollHeight / at.h) : at.top;
        el.scrollLeft = at.w ? at.left * (el.scrollWidth / at.w) : at.left;
      }
    };
    const note = () => {
      if (restoring || this.destroyed) return;
      const place = {};
      for (const [name, el] of Object.entries(this.scrollers())) {
        place[name] = { top: el.scrollTop, left: el.scrollLeft, h: el.scrollHeight, w: el.scrollWidth };
      }
      rememberPlace(this.filePath, place);
    };
    const els = Object.values(this.scrollers());
    for (const el of els) el.addEventListener('scroll', note, { passive: true });
    for (const type of ['wheel', 'pointerdown', 'keydown']) this.root.addEventListener(type, stop, { passive: true });
    restore();
    // Pictures and fonts can still change the layout: once more shortly after.
    const timers = [setTimeout(restore, 300), setTimeout(() => { restore(); restoring = false; }, 1200)];
    if (!saved) restoring = false;
    this.unkeepPlace = () => {
      timers.forEach(clearTimeout);
      for (const el of els) el.removeEventListener('scroll', note);
    };
  }

  // The file changed on disk: draw it again from the new address.
  reload(url) {
    if (this.unkeepPlace) this.unkeepPlace();
    this.url = url;
    this.cleanup();
    this.root.replaceChildren();
    this.start();
  }

  showLoading(text = 'opening…') {
    this.root.replaceChildren(h('div', { class: 'viewer-message' }, h('p', { class: 'hand viewer-hand' }, text)));
  }

  showProblem(text) {
    this.root.replaceChildren(h('div', { class: 'viewer-message' },
      h('p', { class: 'hand viewer-hand' }, 'can’t show this one'),
      h('p', { class: 'serif-i viewer-detail' }, text),
      h('p', { class: 'mono-label' }, 'Try “Open in its own app” on the left.')));
  }

  // Reads the whole file (Office viewers need all of it). main.js checks the
  // path and size; this returns an ArrayBuffer.
  async fetchBytes() {
    const bytes = await window.opal.readBytes(this.filePath);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }

  get isDirty() {
    return false;
  }

  getText() {
    return '';
  }

  flush() {
    return Promise.resolve();
  }

  // Subclasses free anything they made (e.g. picture blobs).
  cleanup() {}

  destroy() {
    if (this.unkeepPlace) this.unkeepPlace();
    this.destroyed = true;
    this.cleanup();
    this.root.remove();
  }
}
