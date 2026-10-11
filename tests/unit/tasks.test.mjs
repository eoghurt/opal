// Tasks/*.md in the Obsidian Tasks plugin's format.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { src } from './load.mjs';

const T = await src('fidgets/tasks/tasks');
const LIST = '# My Tasks\n\n- [ ] Buy pens 📅 2026-10-02 ⏰ 15:00 ⭐\n    Get the 0.5 mm ones\n    - [ ] Check the drawer\n- [x] Return books ✅ 2026-09-27\n- [ ] Water plants 📅 2026-10-05 🔁 every week\n';

test('tasks are read with their dates, time, star, details and subtasks', () => {
  const tasks = T.parseTasks(LIST, 'My Tasks');
  assert.deepEqual(tasks.map((t) => t.title), ['Buy pens', 'Return books', 'Water plants']);
  assert.equal(tasks[0].due, '2026-10-02');
  assert.equal(tasks[0].time, '15:00');
  assert.equal(tasks[0].starred, true);
  assert.deepEqual(tasks[0].details, ['Get the 0.5 mm ones']);
  assert.deepEqual(tasks[0].subtasks.map((s) => s.title), ['Check the drawer']);
  assert.equal(tasks[1].done, true);
  assert.equal(tasks[1].doneOn, '2026-09-27');
  assert.equal(tasks[2].repeat, 'every week');
});

test('ticking a task marks it [x] with today, and touches nothing else', () => {
  const [pens] = T.parseTasks(LIST, 'My Tasks');
  const next = T.toggleTask(LIST, pens, '2026-10-03');
  assert.equal(next, LIST.replace('- [ ] Buy pens 📅 2026-10-02 ⏰ 15:00 ⭐', '- [x] Buy pens 📅 2026-10-02 ⏰ 15:00 ⭐ ✅ 2026-10-03'));
  const [again] = T.parseTasks(next, 'My Tasks');
  assert.equal(T.toggleTask(next, again), LIST);
});

test('ticking a repeating task adds the next one above the finished one', () => {
  const water = T.parseTasks(LIST, 'My Tasks')[2];
  const next = T.toggleTask(LIST, water, '2026-10-05');
  assert.ok(next.endsWith('- [ ] Water plants 🔁 every week 📅 2026-10-12\n- [x] Water plants 📅 2026-10-05 ✅ 2026-10-05\n'));
});

test('a task changed somewhere else is not overwritten', () => {
  const [pens] = T.parseTasks(LIST, 'My Tasks');
  const edited = LIST.replace('Buy pens', 'Buy pencils');
  assert.throws(() => T.toggleTask(edited, pens), /changed somewhere else/);
});

test('a new list starts with its heading', () => {
  assert.equal(T.addTask('', { title: 'New', done: false, due: null, details: [], subtasks: [] }, 'My Tasks'), '# My Tasks\n\n- [ ] New\n');
});

test('a "to reply" task keeps its email link through a round trip', () => {
  const link = T.mailLink('<a(1)@b.c>', 'me@gmail.com');
  const text = `- [ ] Reply to Hi / Sam 📅 2026-10-12 [📧](${link})\n`;
  const [task] = T.parseTasks(text, 'My Tasks');
  assert.equal(task.title, 'Reply to Hi / Sam');
  assert.equal(task.mail, 'a(1)@b.c');
  assert.equal(T.formatTask(task)[0], text.trimEnd());
  const outlook = T.parseTasks(`- [ ] Reply [📧](${T.mailLink('x@y.z', '', 'microsoft')})`, 'L')[0];
  assert.equal(outlook.mail, 'x@y.z');
});
