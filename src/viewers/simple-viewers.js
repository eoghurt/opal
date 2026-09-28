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

export class AudioViewer extends Viewer {
  render() {
    this.root.classList.add('viewer-media');
    const audio = h('audio', { class: 'audio-player', controls: true, preload: 'metadata', src: this.url });
    audio.addEventListener('error', () => this.showProblem('This audio file could not be played here.'));
    this.root.replaceChildren(h('div', { class: 'audio-card' },
      h('span', { class: 'mono-label' }, 'Audio'),
      h('span', { class: 'display audio-title' }, this.filePath.split('/').pop()),
      h('span', { class: 'audio-bars', 'aria-hidden': 'true' },
        Array.from({ length: 48 }, (_, i) => h('span', { style: `height: ${20 + Math.round(60 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.45)))}%` }))),
      audio));
  }
}

export class VideoViewer extends Viewer {
  render() {
    this.root.classList.add('viewer-media');
    const video = h('video', { class: 'video-player', controls: true, preload: 'metadata', src: this.url });
    video.addEventListener('error', () => this.showProblem('This video could not be played here — some formats (like ProRes or old AVI files) only play in QuickTime or VLC.'));
    this.root.replaceChildren(h('div', { class: 'video-stage' }, video));
  }
}
