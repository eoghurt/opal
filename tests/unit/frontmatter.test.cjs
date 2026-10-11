// Properties at the top of a note (Obsidian's front matter).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const F = require('../../shared/frontmatter.js');
const P = require('../../shared/properties.js');

test('a property is added, changed and removed without touching the rest', () => {
  assert.equal(F.setProp('# Hi\n', 'opal-color', 'coral'), '---\nopal-color: coral\n---\n# Hi\n');
  assert.equal(F.getProp('---\nopal-color: sky\n---\n', 'opal-color'), 'sky');
  assert.equal(F.setProp('---\nopal-color: coral\ntags: x\n---\nBody', 'opal-color', null), '---\ntags: x\n---\nBody');
  assert.equal(F.stripFrontmatter('---\na: 1\n---\nBody'), 'Body');
});

test('Obsidian-style properties: lists, numbers, booleans, links', () => {
  const text = '---\nsubject: English\nmark: 18\ndone: true\nbook: "[[Pride and Prejudice]]"\ntags:\n  - reading\n  - school\n---\nBody\n';
  assert.deepEqual(P.readProperties(text), { subject: 'English', mark: 18, done: true, book: '[[Pride and Prejudice]]', tags: ['reading', 'school'] });
  const next = P.writeProperty(text, 'mark', 19, 'number');
  assert.equal(P.readProperties(next).mark, 19);
  assert.ok(next.endsWith('---\nBody\n'));
});
