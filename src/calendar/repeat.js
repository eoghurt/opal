// Repeat rules shared by calendar events and tasks. They're written the way
// Obsidian's Tasks plugin writes them, so they read naturally in any editor:
//
//   🔁 every day · every weekday · every week · every 2 weeks · every month · every year

export const RULES = ['every day', 'every weekday', 'every week', 'every 2 weeks', 'every month', 'every year'];
export const RULE_TEXT = new RegExp(`(${RULES.map((r) => r.replace(/ /g, '\\s+')).join('|')})`, 'i');

const pad = (n) => String(n).padStart(2, '0');
const toKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const toDate = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / 86400000);

// "every  Week" → "every week"; anything unknown → null.
export function normaliseRule(text) {
  if (!text) return null;
  const clean = text.trim().toLowerCase().replace(/\s+/g, ' ');
  return RULES.includes(clean) ? clean : null;
}

// Does a series that starts on `from` land on `key`?
export function occursOn(rule, from, key) {
  if (key < from) return false;
  const a = toDate(from);
  const b = toDate(key);
  switch (rule) {
    case 'every day': return true;
    case 'every weekday': return b.getDay() !== 0 && b.getDay() !== 6;
    case 'every week': return daysBetween(from, key) % 7 === 0;
    case 'every 2 weeks': return daysBetween(from, key) % 14 === 0;
    // Like Google Calendar: a series on the 31st skips shorter months.
    case 'every month': return a.getDate() === b.getDate();
    case 'every year': return a.getDate() === b.getDate() && a.getMonth() === b.getMonth();
    default: return false;
  }
}

// The next date after `key` (used when a repeating task is ticked off).
export function nextDate(rule, key) {
  const d = toDate(key);
  const clampTo = (year, month, day) => new Date(year, month, Math.min(day, new Date(year, month + 1, 0).getDate()));
  switch (rule) {
    case 'every day': d.setDate(d.getDate() + 1); break;
    case 'every weekday':
      do d.setDate(d.getDate() + 1); while (d.getDay() === 0 || d.getDay() === 6);
      break;
    case 'every week': d.setDate(d.getDate() + 7); break;
    case 'every 2 weeks': d.setDate(d.getDate() + 14); break;
    case 'every month': return toKey(clampTo(d.getFullYear(), d.getMonth() + 1, d.getDate()));
    case 'every year': return toKey(clampTo(d.getFullYear() + 1, d.getMonth(), d.getDate()));
    default: return key;
  }
  return toKey(d);
}

// "Every week on Monday", "Every month on the 28th" — for menus and labels.
export function describeRule(rule, from) {
  if (!rule) return 'Does not repeat';
  const date = from ? toDate(from) : null;
  const weekday = date ? date.toLocaleDateString(undefined, { weekday: 'long' }) : '';
  const nth = date ? ordinal(date.getDate()) : '';
  switch (rule) {
    case 'every day': return 'Every day';
    case 'every weekday': return 'Every weekday (Mon–Fri)';
    case 'every week': return date ? `Every week on ${weekday}` : 'Every week';
    case 'every 2 weeks': return date ? `Every 2 weeks on ${weekday}` : 'Every 2 weeks';
    case 'every month': return date ? `Every month on the ${nth}` : 'Every month';
    case 'every year': return date ? `Every year on ${date.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}` : 'Every year';
    default: return rule;
  }
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function shiftKey(key, days) {
  const d = toDate(key);
  d.setDate(d.getDate() + days);
  return toKey(d);
}
