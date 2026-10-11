// Sticky notes kept inside a note, in a hidden comment block.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const K = require('../../shared/stickies.js');

test('stickies are written, read back and removed, leaving the note as it was', () => {
  const note = '# Note\nBody\n';
  const withOne = K.writeStickies(note, [{ id: 'a1', x: 0.5, y: 10, color: 3, text: 'hi' }]);
  assert.ok(withOne.startsWith(note));
  assert.match(withOne, /<!-- opal:stickies\n\{"id":"a1".*\}\n-->\n$/);
  assert.deepEqual(K.parseStickies(withOne), [{ id: 'a1', x: 0.5, y: 10, color: 3, tilt: 0, size: 1, text: 'hi' }]);
  assert.equal(K.stripStickies(withOne), note);
  assert.equal(K.writeStickies(withOne, []), note);
});

test('bad values are kept in range and damaged lines skipped', () => {
  const text = '# N\n\n<!-- opal:stickies\n{"id":"x","x":9,"y":-5,"color":42,"size":7}\nnot json\n-->\n';
  assert.deepEqual(K.parseStickies(text), [{ id: 'x', x: 0.95, y: 0, color: 2, tilt: 0, size: 2, text: '' }]);
});
