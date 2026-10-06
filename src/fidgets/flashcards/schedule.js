// Spacing reviews out, the way the Obsidian Spaced Repetition plugin does:
// each side of a card has a next date, an interval in days and an ease (250
// to start). Getting it right stretches the interval by the ease; getting it
// wrong brings the card back tomorrow and makes it a little less easy.

export const GRADES = ['again', 'hard', 'good', 'easy'];

const MIN_EASE = 130;

function addDays(key, days) {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// side: { due, interval, ease } or null for a new card → the next schedule.
export function nextSchedule(side, grade, today = todayKey()) {
  const ease = side ? side.ease : 250;
  const interval = side ? Math.max(1, side.interval) : 0;
  let nextInterval;
  let nextEase = ease;
  if (!side) {
    nextInterval = { again: 1, hard: 1, good: 3, easy: 4 }[grade];
    if (grade === 'easy') nextEase = ease + 15;
    if (grade === 'again') nextEase = ease - 20;
  } else if (grade === 'again') {
    nextInterval = 1;
    nextEase = ease - 20;
  } else if (grade === 'hard') {
    nextInterval = Math.max(interval + 1, Math.round(interval * 1.2));
    nextEase = ease - 15;
  } else if (grade === 'good') {
    nextInterval = Math.max(interval + 1, Math.round((interval * ease) / 100));
  } else {
    nextInterval = Math.max(interval + 2, Math.round((interval * ease * 1.3) / 100));
    nextEase = ease + 15;
  }
  nextEase = Math.max(MIN_EASE, nextEase);
  return { due: addDays(today, nextInterval), interval: nextInterval, ease: nextEase };
}

// "tomorrow", "3 days", "2 weeks", "4 months" for the buttons.
export function describeInterval(days) {
  if (days <= 1) return 'tomorrow';
  if (days < 14) return `${days} days`;
  if (days < 60) return `${Math.round(days / 7)} weeks`;
  if (days < 365) return `${Math.round(days / 30)} months`;
  return `${(days / 365).toFixed(1).replace(/\.0$/, '')} years`;
}

// A card's sides that are due today (a two-way card has two).
export function dueSides(card, today = todayKey()) {
  const sides = card.reversed ? [0, 1] : [0];
  return sides.filter((i) => !card.schedule[i] || card.schedule[i].due <= today);
}

export function countDue(cards, today = todayKey()) {
  return cards.reduce((n, card) => n + dueSides(card, today).length, 0);
}
