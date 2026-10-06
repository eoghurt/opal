// Fidgets: heavier things that take up a whole page of their own — the
// calendar, tasks, a debate flow sheet. Each one sits in its own folder here.
//
// (Their opposite are widgets — see ../widgets/index.js — small things that
// live inside a page.)
//
// This list is what Settings → Widgets & Fidgets shows. `where` says how you
// open the fidget; `files` are its code; `off` means it's switched off for now.

export const FIDGETS = [
  {
    id: 'calendar',
    name: 'Calendar',
    icon: 'calendar',
    what: 'Day, week and month views of your events and tasks; repeats, reminders and colours.',
    where: 'The calendar button in the top bar (⌘⇧D). Events are kept in Calendar/ day notes.',
    files: ['fidgets/calendar/calendar-view.js', 'fidgets/calendar/events.js', 'fidgets/calendar/repeat.js', 'fidgets/calendar/repeat-picker.js', 'fidgets/calendar/reminders.js'],
  },
  {
    id: 'tasks',
    name: 'Tasks',
    icon: 'tasks',
    what: 'Task lists like Google Tasks: due dates, times, stars, repeats and subtasks.',
    where: 'The tasks button in the top bar (⌘⇧T). Lists are notes in Tasks/, in the Obsidian Tasks format.',
    files: ['fidgets/tasks/tasks-view.js', 'fidgets/tasks/tasks.js'],
  },
  {
    id: 'inbox',
    name: 'Inbox',
    icon: 'inbox',
    what: 'Everything waiting on you: quick jots, overdue and upcoming tasks, loose checklist items.',
    where: 'Switched off for now. Jots are kept in Inbox.md.',
    off: true,
    files: ['fidgets/inbox/inbox-view.js'],
  },
  {
    id: 'flashcards',
    name: 'Flashcard review',
    icon: 'review',
    what: 'Due cards one at a time, with Again / Hard / Good / Easy.',
    where: 'The review button in the top bar. Cards are written in notes, in the Spaced Repetition plugin’s format.',
    files: ['fidgets/flashcards/review-view.js', 'fidgets/flashcards/schedule.js'],
  },
  {
    id: 'flow',
    name: 'Flow sheet',
    icon: 'flow',
    what: 'A debate flow: one column per speaker, arguments side by side.',
    where: 'Any note: Apply a template → Flow sheet (the note gets opal-type: flow).',
    files: ['fidgets/flow/flow-editor.js'],
  },
  {
    id: 'database',
    name: 'Folder database',
    icon: 'database',
    what: 'A folder as a table or cards: each note a row, each property a column; sort, filter and group.',
    where: 'Right-click a folder → Show as database… Its settings live in the folder’s .opal.md.',
    files: ['fidgets/database/database-view.js'],
  },
  {
    id: 'manuscript',
    name: 'Manuscript',
    icon: 'book',
    what: 'A folder’s notes as chapters: reorder them, leave some out, and compile one Word file.',
    where: 'Right-click a folder → Manuscript… The chapter order lives in the folder’s .opal.md.',
    files: ['fidgets/manuscript/manuscript-view.js'],
  },
];
