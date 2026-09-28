// Small helpers for names and dates.

export function noteName(filePath) {
  return filePath.split('/').pop().replace(/\.md$/i, '');
}

export function parentOf(filePath) {
  const parts = filePath.split('/');
  parts.pop();
  return parts.join('/');
}

function startOfDay(ms) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// "today", "yesterday", "Monday", "last week", "30 Aug"
export function relativeDay(ms) {
  if (!ms) return '';
  const days = Math.round((startOfDay(Date.now()) - startOfDay(ms)) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return new Date(ms).toLocaleDateString(undefined, { weekday: 'long' });
  if (days < 14) return 'last week';
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

const pad = (n) => String(n).padStart(2, '0');

// "28.09.26"
export function shortDate(ms) {
  const d = new Date(ms);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${String(d.getFullYear()).slice(2)}`;
}

// "12:10"
export function clockTime(ms) {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// "Mon 28.09"
export function todayStamp() {
  const d = new Date();
  return `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
}

export function pad2(n) {
  return pad(n);
}
