// Links follow renames and moves.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const X = require('../../shared/relink.js');

test('every kind of link to a moved note is pointed at its new place', () => {
  const out = X.relinkText('See [[Old]] and [[Old|shown]] and [[Old#H]] and [x](Folder/Old.md)', {
    oldPath: 'Note.md', newPath: 'Note.md',
    moves: [{ from: 'Folder/Old.md', to: 'Folder/New.md' }],
    before: ['Note.md', 'Folder/Old.md'], after: ['Note.md', 'Folder/New.md'],
  });
  assert.equal(out, 'See [[New]] and [[New|shown]] and [[New#H]] and [x](Folder/New.md)');
});

test('a link by name still finds a picture that only changed folder', () => {
  const out = X.relinkText('![[pic.png]]', { oldPath: 'Note.md', newPath: 'Note.md', moves: [{ from: 'pic.png', to: 'img/pic.png' }], before: ['Note.md', 'pic.png'], after: ['Note.md', 'img/pic.png'] });
  assert.equal(out, '![[pic.png]]');
});

test('links to other notes are left alone', () => {
  const text = 'See [[Other]] and [[Old]]';
  const out = X.relinkText(text, { oldPath: 'Note.md', newPath: 'Note.md', moves: [{ from: 'Old.md', to: 'Archive/Old.md' }], before: ['Note.md', 'Old.md', 'Other.md'], after: ['Note.md', 'Archive/Old.md', 'Other.md'] });
  assert.equal(out, 'See [[Other]] and [[Old]]');
});

test('the same rules as following a link: exact path, then nearest the root', () => {
  assert.equal(X.resolve('Plan', ['Deep/Down/Plan.md', 'Up/Plan.md']), 'Up/Plan.md');
  assert.equal(X.resolve('Deep/Down/Plan', ['Deep/Down/Plan.md', 'Up/Plan.md']), 'Deep/Down/Plan.md');
});
