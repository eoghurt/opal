// Viewers for files the window already knows how to show: images, audio, video.
// (PDFs have their own viewer in pdf-viewer.js.)

import { h } from '../ui.js';
import { Viewer } from './viewer.js';

// Images sit on the page like a taped-in photo. Click to switch between
// "fit to window" and actual size.
export class ImageViewer extends Viewer {
  render() {
    this.root.classList.add('viewer-image');
    const img = h('img', { class: 'image-photo', src: this.url, alt: this.filePath.split('/').pop() });
    const size = h('span', { class: 'mono-label image-size' }, '');
    const mount = h('button', { class: 'image-mount is-fit', title: 'Click to switch between fit and actual size' },
      h('span', { class: 'tape', 'aria-hidden': 'true', style: 'background: var(--c3)' }),
      img);
    mount.addEventListener('click', () => mount.classList.toggle('is-fit'));
    img.addEventListener('load', () => { size.textContent = `${img.naturalWidth} × ${img.naturalHeight} px · click to zoom`; });
    img.addEventListener('error', () => this.showProblem('This picture could not be shown (it may be damaged, or a format the window can’t draw).'));
    this.root.replaceChildren(h('div', { class: 'image-stage' }, mount), size);
  }
}

// ---------- Skipping back and forward ----------
//
// Click once to jump 5 seconds, click again straight away to make it 10
// (each quick click adds 5, as on YouTube). A bubble shows how far it went.
// ← / → skip 5 seconds, with Shift 10.

const STEP = 5;
const STREAK_MS = 700; // clicks closer together than this add up

function skipper(media, bubbleHost) {
  let streak = { dir: 0, total: 0, at: 0 };
  const bubble = h('span', { class: 'skip-bubble', 'aria-live': 'polite' });
  bubbleHost.append(bubble);
  let hideTimer = null;
  return (dir, amount = STEP) => {
    const now = Date.now();
    streak = streak.dir === dir && now - streak.at < STREAK_MS ? { dir, total: streak.total + amount, at: now } : { dir, total: amount, at: now };
    // Some files don't say how long they are: then as far as the player can reach.
    const last = (ranges) => (ranges && ranges.length ? ranges.end(ranges.length - 1) : 0);
    const reach = Math.max(last(media.seekable), last(media.buffered)) || Infinity;
    const end = Number.isFinite(media.duration) ? media.duration : reach;
    media.currentTime = Math.max(0, Math.min(end, media.currentTime + dir * amount));
    bubble.textContent = `${dir < 0 ? '−' : '+'}${streak.total}s`;
    bubble.className = `skip-bubble is-shown ${dir < 0 ? 'is-back' : 'is-forward'}`;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { bubble.className = 'skip-bubble'; }, STREAK_MS);
  };
}

// ← / → while the player is on screen (not while typing somewhere).
function arrowKeys(viewer, skip) {
  const onKey = (e) => {
    if (!viewer.root.isConnected || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest && e.target.closest('input, textarea, [contenteditable], .cm-editor')) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    skip(e.key === 'ArrowLeft' ? -1 : 1, e.shiftKey ? STEP * 2 : STEP);
  };
  document.addEventListener('keydown', onKey);
  viewer.cleanups = [...(viewer.cleanups || []), () => document.removeEventListener('keydown', onKey)];
}

function noDoubleClickZoom(el) {
  el.addEventListener('dblclick', (e) => e.preventDefault());
  el.addEventListener('mousedown', (e) => { if (e.detail > 1) e.preventDefault(); }); // no text selection
}

export class AudioViewer extends Viewer {
  render() {
    this.root.classList.add('viewer-media');
    const audio = h('audio', { class: 'audio-player', controls: true, preload: 'metadata', src: this.url });
    audio.addEventListener('error', () => this.showProblem('This audio file could not be played here.'));
    const bars = h('span', { class: 'audio-bars', 'aria-hidden': 'true' },
      Array.from({ length: 48 }, (_, i) => h('span', { style: `height: ${20 + Math.round(60 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.45)))}%` })));
    const row = h('div', { class: 'audio-skip-row' });
    const skip = skipper(audio, row);
    const button = (dir) => {
      const b = h('button', {
        class: `skip-btn ${dir < 0 ? 'is-back' : 'is-forward'}`,
        title: dir < 0 ? 'Back 5 seconds — click again for 10 (←)' : 'Forward 5 seconds — click again for 10 (→)',
        'aria-label': dir < 0 ? 'Back 5 seconds' : 'Forward 5 seconds',
        onclick: () => skip(dir),
      }, dir < 0 ? '−5s' : '+5s');
      noDoubleClickZoom(b);
      return b;
    };
    row.append(button(-1), bars, button(1));
    this.root.replaceChildren(h('div', { class: 'audio-card' },
      h('span', { class: 'mono-label' }, 'Audio'),
      h('span', { class: 'display audio-title' }, this.filePath.split('/').pop()),
      row,
      audio,
      h('span', { class: 'skip-hint' }, 'Click either side to skip 5 seconds — click twice for 10 · ← →')));
    arrowKeys(this, skip);
  }

  cleanup() {
    for (const fn of this.cleanups || []) fn();
    this.cleanups = [];
  }
}

export class VideoViewer extends Viewer {
  render() {
    this.root.classList.add('viewer-media');
    const video = h('video', { class: 'video-player', controls: true, preload: 'metadata', src: this.url });
    video.addEventListener('error', () => this.showProblem('This video could not be played here — some formats (like ProRes or old AVI files) only play in QuickTime or VLC.'));
    // The left and right thirds of the picture (not the controls along the bottom) skip.
    const frame = h('div', { class: 'video-frame' }, video);
    const skip = skipper(video, frame);
    for (const dir of [-1, 1]) {
      const zone = h('div', {
        class: `skip-zone ${dir < 0 ? 'is-back' : 'is-forward'}`,
        title: dir < 0 ? 'Back 5 seconds — click again for 10 (←)' : 'Forward 5 seconds — click again for 10 (→)',
      });
      zone.addEventListener('click', () => skip(dir));
      noDoubleClickZoom(zone);
      frame.append(zone);
    }
    this.root.replaceChildren(h('div', { class: 'video-stage' }, frame));
    arrowKeys(this, skip);
  }

  cleanup() {
    for (const fn of this.cleanups || []) fn();
    this.cleanups = [];
  }
}
