// Repeat rules (🔁 every …), shared by calendar events and tasks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { src } from './load.mjs';

const R = await src('fidgets/calendar/repeat');

test('rules are read', () => {
  assert.deepEqual(R.parseRule('every 2 weeks on Monday, Wednesday'), { every: 2, unit: 'week', days: [1, 3] });
  assert.equal(R.normaliseRule('Every 2 Weeks'), 'every 2 weeks');
});

test('the next date', () => {
  assert.equal(R.nextDate('every week', '2026-10-05'), '2026-10-12');
  assert.equal(R.nextDate('every weekday', '2026-10-09'), '2026-10-12'); // Friday → Monday
  assert.equal(R.nextDate('every month', '2026-01-31'), '2026-02-28'); // no 31 Feb
  assert.equal(R.nextDate('every year', '2028-02-29'), '2029-02-28');
});

test('which days a repeat lands on', () => {
  assert.equal(R.occursOn('every 2 weeks', '2026-10-05', '2026-10-19'), true);
  assert.equal(R.occursOn('every 2 weeks', '2026-10-05', '2026-10-12'), false);
  assert.equal(R.occursOn('every day', '2026-10-05', '2026-10-04'), false); // not before it starts
});
