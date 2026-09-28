// Shared base for view-only files (PDF, images, media, Office files).
// Viewers follow the same shape as editors (see editor-registry.js) but never
// have anything to save.

import { h } from '../ui.js';

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
    }
  }

  // The file changed on disk: draw it again from the new address.
  reload(url) {
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
    this.destroyed = true;
    this.cleanup();
    this.root.remove();
  }
}
