// Fidgets: heavier things that take up a whole page of their own — the
// calendar, tasks, a debate flow sheet. Each one sits in its own folder here.
//
// (Their opposite are widgets — see ../widgets/index.js — small things that
// live inside a page.)
//
// This list is what Settings → Widgets & Fidgets shows. `where` says how you
// open the fidget; `files` are its code; `off` means it's switched off for now;
// `page` ones get a tile at the top of the home page, with `short` under it.

export const FIDGETS = [
  {
    id: 'calendar',
    page: true, // a page of its own: a tile on the home page
    short: 'Days, weeks, months',
    name: 'Calendar',
    icon: 'calendar',
    what: 'Day, week and month views of your events and tasks; repeats, reminders and colours.',
    where: 'Its tile on the home page, or ⌘⇧D. Events are kept in Calendar/ day notes.',
    files: ['fidgets/calendar/calendar-view.js', 'fidgets/calendar/events.js', 'fidgets/calendar/repeat.js', 'fidgets/calendar/repeat-picker.js', 'fidgets/calendar/reminders.js'],
  },
  {
    id: 'money',
    page: true, // a page of its own: a tile on the home page
    short: 'Budget and saving',
    name: 'Money',
    icon: 'money',
    what: 'A month at a glance: net worth, spending against your budget, saving goals and income. Move budget between categories.',
    where: 'Its tile on the home page, or ⌘⇧M. Kept in transactions.ledger and budget.ledger, the Obsidian Ledger plugin’s format.',
    files: ['fidgets/money/money-view.js', 'fidgets/money/model.js', 'fidgets/money/ledger.js'],
  },
  {
    id: 'debate',
    name: 'Debate',
    icon: 'debate',
    page: true, // a page of its own: a tile on the home page
    short: 'Motions, rounds, feedback',
    what: 'Your debate folder in one place: a motion bank to prep from, competitions and rounds, the two feedback forms, the fix board, training and notes.',
    where: 'Its tile on the home page, or ⌘⇧B. Reads and writes the notes in your Debate folder.',
    files: ['fidgets/debate/debate-view.js', 'fidgets/debate/debate-forms.js', 'fidgets/debate/debate-more.js', 'fidgets/debate/motions.js', 'fidgets/debate/records.js', 'fidgets/debate/board.js'],
  },
  {
    id: 'tasks',
    page: true, // a page of its own: a tile on the home page
    short: 'Lists and due dates',
    name: 'Tasks',
    icon: 'tasks',
    what: 'Task lists like Google Tasks: due dates, times, stars, repeats and subtasks.',
    where: 'Its tile on the home page, or ⌘⇧T. Lists are notes in Tasks/, in the Obsidian Tasks format.',
    files: ['fidgets/tasks/tasks-view.js', 'fidgets/tasks/tasks.js'],
  },
  {
    id: 'flashcards',
    page: true, // a page of its own: a tile on the home page
    short: 'Cards to review',
    name: 'Flashcard review',
    icon: 'review',
    what: 'Due cards one at a time, with Again / Hard / Good / Easy.',
    where: 'Its tile on the home page. Cards are written in notes, in the Spaced Repetition plugin’s format.',
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
