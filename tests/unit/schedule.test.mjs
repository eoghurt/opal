// Flashcard review spacing, as the Obsidian Spaced Repetition plugin does it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { src } from './load.mjs';

const S = await src('fidgets/flashcards/schedule');

test('a new card', () => {
  assert.deepEqual(S.nextSchedule(null, 'good', '2026-10-01'), { due: '2026-10-04', interval: 3, ease: 250 });
  assert.equal(S.nextSchedule(null, 'easy', '2026-10-01').ease, 265);
});

test('getting it right stretches the interval by the ease', () => {
  assert.deepEqual(S.nextSchedule({ due: '2026-10-01', interval: 3, ease: 250 }, 'good', '2026-10-01'), { due: '2026-10-09', interval: 8, ease: 250 });
});

test('getting it wrong brings it back tomorrow and lowers the ease, never below 130', () => {
  assert.deepEqual(S.nextSchedule({ due: '2026-10-01', interval: 10, ease: 250 }, 'again', '2026-10-01'), { due: '2026-10-02', interval: 1, ease: 230 });
  assert.equal(S.nextSchedule({ due: '2026-10-01', interval: 10, ease: 140 }, 'again', '2026-10-01').ease, 130);
});

test('due counts: new cards, due sides of two-way cards, not ones due later', () => {
  const cards = [
    { reversed: false, schedule: [] }, // new: due
    { reversed: true, schedule: [{ due: '2026-10-01', interval: 1, ease: 250 }, { due: '2026-10-09', interval: 4, ease: 250 }] }, // one side due
    { reversed: false, schedule: [{ due: '2026-10-20', interval: 9, ease: 250 }] }, // later
  ];
  assert.equal(S.countDue(cards, '2026-10-05'), 2);
  assert.equal(S.describeInterval(1), 'tomorrow');
  assert.equal(S.describeInterval(21), '3 weeks');
});
