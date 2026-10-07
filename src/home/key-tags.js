// The vault's top-level folders as motel key tags hanging on a key rack.
// Brushing a tag with the mouse gives it a push; it swings and settles by
// itself (a damped pendulum), even after the mouse has moved on.

const ICONS = {
  book: 'M4 5c3 -2 6 -2 8 0c2 -2 5 -2 8 0v14c-3 -2 -6 -2 -8 0c-2 -2 -5 -2 -8 0z M12 5v14',
  peak: 'M3 19l6 -10l4 6l3 -4l5 8z',
  podium: 'M4 20h16 M7 20v-8h10v8 M9 12v-4a3 3 0 0 1 6 0v4',
  coin: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0 -18 M14.5 9c-.5 -1 -1.5 -1.5 -2.5 -1.5c-1.6 0 -2.5 .9 -2.5 2s1 1.6 2.5 2s2.5 .9 2.5 2s-.9 2 -2.5 2c-1 0 -2 -.5 -2.5 -1.5 M12 6v1.5 M12 16.5v1.5',
  compass: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0 -18 M15.5 8.5l-2 5l-5 2l2 -5z',
  lamp: 'M9 21h6 M12 21v-6 M6 15h12l-3 -9h-6z',
  cal: 'M5 6h14v14h-14z M5 10h14 M9 3v4 M15 3v4',
  check: 'M5 12l4 4l10 -10',
  box: 'M4 8l8 -4l8 4v8l-8 4l-8 -4z M4 8l8 4l8 -4 M12 12v8',
  star: 'M12 3l2.6 5.6l6.1 .6l-4.6 4.1l1.3 6l-5.4 -3.1l-5.4 3.1l1.3 -6l-4.6 -4.1l6.1 -.6z',
};
const FLAG = 'M3 4h14l-3 4l3 4h-14z M3 4v14';

// The tag colourways, after the motel key tags (colours sampled by eye).
const LOOKS = {
  red: { color: '#c41f33', edge: '#9e1828', ink: '#ffffff', barBg: '#1d1d1b', barInk: '#ffffff', numInk: '#ffffff', medalBg: '#1d1d1b', iconInk: '#ffffff', top: FLAG },
  mustard: { color: '#f1b434', edge: '#d39a1f', ink: '#c8323a', subBg: '#c8323a', subInk: '#ffe9b8', numInk: '#fff4dc', medalBg: '#fff4dc', medalRing: '#c8323a', iconInk: '#c8323a', top: 'M12 2c-4 2 -6 5 -5 8c-3 0 -4 3 -2 5h14c2 -2 1 -5 -2 -5c1 -3 -1 -6 -5 -8z M12 15v4' },
  blue: { color: '#a8d2ee', edge: '#86b6d6', ink: '#2a3d93', subInk: '#2a3d93', medalBg: 'transparent', medalRing: '#2a3d93', iconInk: '#2a3d93', big: true, top: 'M4 14c0 -6 16 -6 16 0z M12 8v-4' },
  teal: { color: '#135d66', edge: '#0d474e', ink: '#eab64b', subInk: '#f4ead2', numInk: '#eab64b', medalBg: '#f4ead2', medalRing: '#eab64b', iconInk: '#135d66', top: 'M12 3v16 M7 7c2 -3 8 -3 10 0 M8 11h8' },
  sage: { color: '#b9bd94', edge: '#9ea27a', ink: '#2c4a28', subInk: '#2c4a28', numInk: '#8a5a2b', medalBg: '#8a5a2b', medalRing: '#2c4a28', iconInk: '#f2ecd2', top: 'M12 2a8 8 0 1 0 0 16a8 8 0 0 0 0 -16 M12 5v4 M12 10l3 2' },
  cream: { color: '#f3eedb', edge: '#d9d2b8', ink: '#1d1d1b', subInk: '#c8323a', numInk: '#1d1d1b', medalBg: '#ffffff', medalRing: '#1fa3a8', iconInk: '#1fa3a8' },
  pink: { color: '#f6b8c4', edge: '#e396a6', ink: '#e03a44', subInk: '#e03a44', numInk: '#7c8a2a', medalBg: '#fff2f4', medalRing: '#e03a44', iconInk: '#e03a44' },
  grey: { color: '#9d9c9e', edge: '#828184', ink: '#8b1b2c', barBg: '#3a3a3a', barInk: '#ffffff', numInk: '#8b1b2c', medalBg: 'transparent', medalRing: '#8b1b2c', iconInk: '#8b1b2c', big: true, top: FLAG },
  navy: { color: '#1e2733', edge: '#141a22', ink: '#e2463c', barBg: '#ffffff', barInk: '#1e2733', numInk: '#f2c84b', medalBg: 'transparent', medalRing: '#e2463c', iconInk: '#e2463c' },
};
const ORDER = ['red', 'mustard', 'blue', 'teal', 'sage', 'cream', 'pink', 'grey', 'navy'];
// Folders Opal already knows a look for; anything else takes the next colourway.
const KNOWN = {
  school: ['red', 'book'], life: ['mustard', 'peak'], extracurriculars: ['blue', 'podium'], finance: ['teal', 'coin'],
  future: ['sage', 'compass'], knowledge: ['cream', 'lamp'], calendar: ['pink', 'cal'], tasks: ['grey', 'check'], archive: ['navy', 'box'],
};

function ribs(y0, y1) {
  const out = [];
  for (let y = y0; y <= y1; y += 5) {
    const half = y < 145 ? 45 + (y - 12) * 0.222 : 45 + (278 - y) * 0.222;
    out.push(`M${(75 - half + 6).toFixed(1)} ${y} H${(75 + half - 6).toFixed(1)}`);
  }
  return out.join(' ');
}
const RIBS_DARK = `${ribs(34, 59)} ${ribs(232, 257)}`;
const RIBS_LIGHT = `${ribs(35.6, 60.6)} ${ribs(233.6, 258.6)}`;
const SHAPE = 'M40 4 H110 Q118 4 120 12 L148 138 Q150 145 148 152 L120 278 Q118 286 110 286 H40 Q32 286 30 278 L2 152 Q0 145 2 138 L30 12 Q32 4 40 4 Z';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// folders: [{ name, path, subfolders: [names], notes: count }]; open(path)
export function keyRack(folders, open) {
  const rack = el('div', 'cork-keys');
  rack.append(el('div', 'cork-keys-rack'));
  let spare = 0;
  folders.slice(0, 9).forEach((f, i) => {
    const known = KNOWN[f.name.toLowerCase()];
    const look = LOOKS[known ? known[0] : ORDER[(i + spare++) % ORDER.length]];
    const icon = ICONS[known ? known[1] : 'star'];
    const key = el('button', 'cork-key');
    key.type = 'button';
    key.style.left = `${20 + i * 180}px`;
    key.setAttribute('aria-label', `Open ${f.name}`);
    key.dataset.openPath = f.path;
    key.dataset.openKind = 'folder';
    const sub = f.subfolders.slice(0, 2).join(' · ');
    // Fit the name on one line (Jost Heavy capitals are about 0.7em wide).
    const longest = Math.max(...f.name.split(/\s+/).map((w) => w.length), 1);
    const titleSize = Math.max(11, Math.min(26, Math.floor((look.big ? 100 : 108) / (longest * 0.7))));
    key.innerHTML = `
      <svg class="cork-key-hook" width="34" height="44" viewBox="0 0 34 44" fill="none"><circle cx="17" cy="8" r="6" fill="#c9a24a" stroke="#8a6a28" stroke-width="1.4"></circle><path d="M17 12 V28 C17 38, 30 38, 30 28" stroke="#b8913f" stroke-width="4" stroke-linecap="round"></path></svg>
      <span class="cork-key-swing">
        <svg class="cork-key-ring" width="68" height="64" viewBox="0 0 68 64" fill="none"><circle cx="34" cy="30" r="26" stroke="url(#cork-ring)" stroke-width="4.4"></circle><circle cx="34" cy="30" r="22.6" stroke="#bdbdbd" stroke-width="1" opacity=".7"></circle></svg>
        <svg class="cork-key-body" viewBox="0 0 150 290" aria-hidden="true">
          <defs><mask id="cork-hole-${i}"><rect width="150" height="290" fill="#fff"></rect><circle cx="75" cy="22" r="6.5" fill="#000"></circle></mask></defs>
          <g mask="url(#cork-hole-${i})">
            <path d="${SHAPE}" fill="${look.color}" stroke="${look.edge}" stroke-width="1"></path>
            <path d="${RIBS_DARK}" stroke="#000" stroke-opacity=".13" stroke-width="2.2"></path>
            <path d="${RIBS_LIGHT}" stroke="#fff" stroke-opacity=".32" stroke-width="1"></path>
            <path d="${SHAPE}" fill="url(#cork-gloss)"></path>
          </g>
          <circle cx="75" cy="22" r="6.5" fill="none" stroke="#000" stroke-opacity=".18" stroke-width="1"></circle>
        </svg>
        <span class="cork-key-face"></span>
      </span>`;
    const face = key.querySelector('.cork-key-face');
    const head = el('span', 'cork-key-top');
    if (look.top) head.innerHTML = `<svg width="22" height="18" viewBox="0 0 24 20" fill="none" stroke="${look.ink}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${look.top}"></path></svg>`;
    const title = el('span', 'cork-key-title', f.name);
    title.style.cssText = `color: ${look.ink}; font-size: ${titleSize}px; width: ${look.big ? 104 : 112}px`;
    face.append(head, title);
    if (sub) {
      const s = el('span', look.barBg ? 'cork-key-bar' : 'cork-key-sub', sub);
      s.style.color = look.barBg ? look.barInk : look.subInk || look.ink;
      if (look.barBg) s.style.background = look.barBg;
      if (look.subBg) {
        s.style.background = look.subBg;
        s.style.padding = '2px 5px';
        s.style.borderRadius = '2px';
      }
      face.append(s);
    }
    face.append(el('span', 'cork-key-gap'));
    if (!look.big) {
      const num = el('span', 'cork-key-num', String(f.notes).padStart(2, '0'));
      num.style.color = look.numInk;
      face.append(num);
    }
    const medal = el('span', 'cork-key-medal');
    const size = look.big ? 52 : 40;
    medal.style.cssText = `width: ${size}px; height: ${size}px; background: ${look.medalBg}; box-shadow: inset 0 0 0 ${look.big ? 3 : 2}px ${look.medalRing || look.medalBg}`;
    medal.innerHTML = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="${look.iconInk}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${icon}"></path></svg>`;
    face.append(medal, el('span', 'cork-key-foot'));
    key.title = f.subfolders.length ? `${f.name} — ${f.subfolders.join(', ')}` : f.name;
    key.addEventListener('click', () => open(f.path));
    swings(key, key.querySelector('.cork-key-swing'));
    rack.append(key);
  });
  return rack;
}

// A damped pendulum: a push from the mouse, then it swings down to rest.
function swings(key, part) {
  let angle = 0;
  let speed = 0;
  let lastX = null;
  let frame = 0;
  let last = 0;
  const step = (now) => {
    const dt = Math.min(0.032, (now - last) / 1000 || 0.016);
    last = now;
    speed += (-38 * angle - 1.6 * speed) * dt; // spring back, lose a little each swing
    angle += speed * dt;
    part.style.transform = `rotate(${angle.toFixed(3)}deg)`;
    if (Math.abs(angle) < 0.05 && Math.abs(speed) < 0.2) {
      angle = 0;
      speed = 0;
      part.style.transform = '';
      frame = 0;
      return;
    }
    frame = requestAnimationFrame(step);
  };
  const push = (dx) => {
    speed += Math.max(-90, Math.min(90, dx * 8)) || (Math.random() < 0.5 ? -48 : 48);
    if (!frame) {
      last = performance.now();
      frame = requestAnimationFrame(step);
    }
  };
  key.addEventListener('mouseenter', (e) => {
    lastX = e.clientX;
    push(e.movementX || 0);
  });
  key.addEventListener('mousemove', (e) => {
    if (lastX == null) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    if (Math.abs(dx) > 3) push(dx * 0.25);
  });
  key.addEventListener('mouseleave', () => {
    lastX = null; // the swing carries on by itself
  });
}
