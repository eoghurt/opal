// Repeat rules shared by calendar events and tasks. They're written the way
// Obsidian's Tasks plugin writes them, so they read naturally in any editor:
//
//   🔁 every day · every 3 days · every weekday · every week
//   🔁 every 2 weeks on Monday, Wednesday · every month · every 6 months · every year

// The quick choices offered in menus (anything else is "Custom…").
export const RULES = ['every day', 'every weekday', 'every week', 'every 2 weeks', 'every month', 'every year'];

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const UNITS = ['day', 'week', 'month', 'year'];

const DAY_NAME = '(?:mon|tues|wednes|thurs|fri|satur|sun)day';
// One capture group: the whole rule.
export const RULE_TEXT = new RegExp(
  `(every\\s+(?:weekday|(?:\\d+\\s+)?(?:day|week|month|year)s?(?:\\s+on\\s+${DAY_NAME}(?:\\s*(?:,|and)\\s*${DAY_NAME})*)?))`,
  'i',
);

const pad = (n) => String(n).padStart(2, '0');
const toKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const toDate = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / 86400000);
const mondayOf = (key) => {
  const d = toDate(key);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toKey(d);
};

// "every 2 weeks on Monday, Wednesday" → { every: 2, unit: 'week', days: [1, 3] }
// "every weekday" → { every: 1, unit: 'week', days: [1..5], weekday: true }
export function parseRule(text) {
  if (!text) return null;
  const clean = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (clean === 'every weekday') return { every: 1, unit: 'week', days: [1, 2, 3, 4, 5], weekday: true };
  const match = /^every (?:(\d+) )?(day|week|month|year)s?(?: on (.+))?$/.exec(clean);
  if (!match) return null;
  const every = Math.max(1, Math.min(99, Number(match[1] || 1)));
  const unit = match[2];
  const days = unit === 'week' && match[3]
    ? [...new Set((match[3].match(new RegExp(DAY_NAME, 'g')) || []).map((d) => WEEKDAYS.findIndex((w) => w.toLowerCase() === d)))].sort()
    : [];
  return { every, unit, days };
}

export function formatRule({ every, unit, days = [], weekday }) {
  if (weekday) return 'every weekday';
  let text = every > 1 ? `every ${every} ${unit}s` : `every ${unit}`;
  if (unit === 'week' && days.length) {
    const ordered = [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)); // Monday first
    text += ` on ${ordered.map((d) => WEEKDAYS[d]).join(', ')}`;
  }
  return text;
}

// "every  Week" → "every week"; anything unknown → null.
export function normaliseRule(text) {
  const rule = parseRule(text);
  return rule ? formatRule(rule) : null;
}

// Does a series that starts on `from` land on `key`?
export function occursOn(ruleText, from, key) {
  if (key < from) return false;
  const rule = parseRule(ruleText);
  if (!rule) return false;
  const a = toDate(from);
  const b = toDate(key);
  switch (rule.unit) {
    case 'day': return daysBetween(from, key) % rule.every === 0;
    case 'week': {
      const days = rule.days.length ? rule.days : [a.getDay()];
      if (!days.includes(b.getDay())) return false;
      return (daysBetween(mondayOf(from), mondayOf(key)) / 7) % rule.every === 0;
    }
    // Like Google Calendar: a series on the 31st skips shorter months.
    case 'month': {
      const months = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
      return a.getDate() === b.getDate() && months % rule.every === 0;
    }
    case 'year':
      return a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && (b.getFullYear() - a.getFullYear()) % rule.every === 0;
    default: return false;
  }
}

// The next date after `key` (used when a repeating task is ticked off).
export function nextDate(ruleText, key) {
  const rule = parseRule(ruleText);
  if (!rule) return key;
  const d = toDate(key);
  const clampTo = (year, month, day) => new Date(year, month, Math.min(day, new Date(year, month + 1, 0).getDate()));
  if (rule.unit === 'month') return toKey(clampTo(d.getFullYear(), d.getMonth() + rule.every, d.getDate()));
  if (rule.unit === 'year') return toKey(clampTo(d.getFullYear() + rule.every, d.getMonth(), d.getDate()));
  if (rule.unit === 'day') return shiftKey(key, rule.every);
  // Weeks: the next matching weekday, counting weeks from this one.
  for (let i = 1; i <= 7 * rule.every + 7; i++) {
    const candidate = shiftKey(key, i);
    if (occursOn(ruleText, key, candidate)) return candidate;
  }
  return shiftKey(key, 7 * rule.every);
}

const SHORT_DAY = (d) => WEEKDAYS[d].slice(0, 3);

// "Every week on Monday", "Every 2 weeks on Mon, Wed" — for menus and labels.
export function describeRule(ruleText, from) {
  const rule = parseRule(ruleText);
  if (!rule) return 'Does not repeat';
  if (rule.weekday) return 'Every weekday (Mon–Fri)';
  const date = from ? toDate(from) : null;
  const lead = rule.every > 1 ? `Every ${rule.every} ${rule.unit}s` : `Every ${rule.unit}`;
  switch (rule.unit) {
    case 'week':
      if (rule.days.length > 1) return `${lead} on ${[...rule.days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(SHORT_DAY).join(', ')}`;
      if (rule.days.length === 1) return `${lead} on ${WEEKDAYS[rule.days[0]]}`;
      return date ? `${lead} on ${WEEKDAYS[date.getDay()]}` : lead;
    case 'month': return date ? `${lead} on the ${ordinal(date.getDate())}` : lead;
    case 'year': return date ? `${lead} on ${date.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}` : lead;
    default: return lead;
  }
}

// Short form for small labels: "week", "2 weeks · Mon, Wed", "weekday".
export function shortRule(ruleText) {
  const rule = parseRule(ruleText);
  if (!rule) return '';
  if (rule.weekday) return 'weekdays';
  const lead = rule.every > 1 ? `${rule.every} ${rule.unit}s` : rule.unit;
  return rule.days.length ? `${lead} · ${[...rule.days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(SHORT_DAY).join(', ')}` : lead;
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
