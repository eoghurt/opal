// Merging Opal's edit and another app's edit of the same note.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { src } from './load.mjs';

const { merge3 } = await src('merge');
const base = '# Plan\n\nOne\nTwo\nThree\nFour\n';

test('changes in different places are both kept', () => {
  const mine = base.replace('Two', 'Two (mine)');
  const theirs = base.replace('Four', 'Four (theirs)');
  assert.deepEqual(merge3(base, mine, theirs), { text: '# Plan\n\nOne\nTwo (mine)\nThree\nFour (theirs)\n', conflicts: 0 });
});

test('lines added at the end on both sides by different amounts', () => {
  const r = merge3(base, `${base}Mine at the end\n`, base.replace('# Plan', '# Plan!'));
  assert.equal(r.text, '# Plan!\n\nOne\nTwo\nThree\nFour\nMine at the end\n');
  assert.equal(r.conflicts, 0);
});

test('the same change on both sides is kept once', () => {
  const both = base.replace('Three', 'THREE');
  assert.deepEqual(merge3(base, both, both), { text: both, conflicts: 0 });
});

test('different changes to the same line keep both, marked', () => {
  const r = merge3(base, base.replace('Two', 'Two A'), base.replace('Two', 'Two B'));
  assert.equal(r.conflicts, 1);
  assert.equal(r.text, '# Plan\n\nOne\n<<<<<<< Opal\nTwo A\n=======\nTwo B\n>>>>>>> Other app\nThree\nFour\n');
});

test('one side deleting, the other untouched', () => {
  assert.deepEqual(merge3(base, base.replace('Three\n', ''), base), { text: '# Plan\n\nOne\nTwo\nFour\n', conflicts: 0 });
});
