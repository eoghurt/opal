// Widgets: small things that live inside a page and do one simple job —
// a heatmap in a note, a table, the clock on the home page, the timer. Each one sits in its own folder here.
//
// (Their opposite are fidgets — see ../fidgets/index.js — which are whole
// pages of their own, like the calendar.)
//
// This list is what Settings → Widgets & Fidgets shows. `where` says where
// you find the widget; `files` are its code (shared/ files are also used by
// Opal's main process).

export const WIDGETS = [
  {
    id: 'heatmap',
    name: 'Heatmap',
    icon: 'flame',
    what: 'A year of squares, one per day, darker on bigger days — from a property, tag or word count in your notes.',
    where: 'In a note (a tracker code block, the Obsidian Tracker plugin’s format) or on the home page.',
    files: ['widgets/heatmap/heatmap.js', 'shared/tracker.js'],
  },
  {
    id: 'tables',
    name: 'Tables',
    icon: 'table',
    what: 'Editable tables inside a note, with merged cells and cell colours.',
    where: 'In a note (⌘⌥T inserts one).',
    files: ['widgets/tables/table-widget.js', 'widgets/tables/table-editor.js', 'widgets/tables/table-model.js'],
  },
  {
    id: 'home',
    name: 'Home page widgets',
    icon: 'grid',
    what: 'Clock, today, flashcards due, timer, recent notes, bookmarks, heatmap, writing streak, numbers, activity, places and busiest days.',
    where: 'On the vault’s home page (Customize to add, move or resize them).',
    files: ['widgets/home/home-widgets.js', 'widgets/home/logbook-view.js', 'widgets/home/activity.js'],
    settings: 'home',
  },
  {
    id: 'stickies',
    name: 'Sticky notes',
    icon: 'sticky',
    what: 'Coloured notes stuck on top of a page.',
    where: 'On any note or folder page (the + button → Sticky note).',
    files: ['widgets/stickies/sticky-layer.js', 'shared/stickies.js'],
  },
  {
    id: 'timer',
    name: 'Timer',
    icon: 'timer',
    what: 'A countdown for prep, or Pomodoro focus and breaks; each session goes in the home page’s numbers.',
    where: 'On the home page (the Timer widget); Start prep in Debate runs it too.',
    files: ['widgets/timer/timer.js'],
    settings: 'timer',
  },
];
