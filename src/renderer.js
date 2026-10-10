// Window code: decides what's on screen and moves between screens.
// Bundled into dist/renderer.js (+ dist/renderer.css) by esbuild (`npm run build`).
//
// Screens: 'welcome' (no vault), 'home' (a folder's home page), 'note', 'settings', 'calendar', 'tasks', 'review'.

import '@fontsource/caveat/latin-500.css';
import '@fontsource/caveat/latin-700.css';
import '@fontsource/instrument-serif/latin-400.css';
import '@fontsource/instrument-serif/latin-400-italic.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-600.css';
// Minimal's fonts
import '@fontsource/geist/latin-400.css';
import '@fontsource/geist/latin-500.css';
import '@fontsource/geist/latin-600.css';
import '@fontsource/geist/latin-700.css';
import '@fontsource/geist-mono/latin-400.css';
import '@fontsource/geist-mono/latin-500.css';
import '@fontsource/nanum-pen-script/latin-400.css';
// GitHub's fonts
import '@fontsource-variable/mona-sans/wght.css';
import '@fontsource/monaspace-neon/latin-400.css';
import '@fontsource/monaspace-neon/latin-500.css';
// The corkboard home: key tags, the receipt, the quote card, calendar writing.
import '@fontsource/jost/latin-500.css';
import '@fontsource/jost/latin-700.css';
import '@fontsource/jost/latin-800.css';
import '@fontsource/vt323/latin-400.css';
import '@fontsource/courier-prime/latin-400.css';
import '@fontsource/gochi-hand/latin-400.css';
import '@fontsource/anton/latin-400.css';
import '@fontsource/archivo-narrow/latin-600.css';

import { Sidebar } from './sidebar.js';
import { Chrome } from './chrome.js';
import { editorForFile } from './editor-registry.js';
import { renderFolderHome } from './views/folder-home.js';
import { NoteView } from './views/note-view.js';
import { FileView } from './views/file-view.js';
import { fileUrl } from './file-types.js';
import { StickyLayer } from './widgets/stickies/sticky-layer.js';
import { makePanel } from './panel.js';
import { swatchRow, colorOf } from './item-colors.js';
import { showMenu, closeMenu } from './context-menu.js';
import { setProp, getProp, setDescription, getDescription } from '../shared/frontmatter.js';
import { countWords, countSelected } from '../shared/words.js';
import { dayKey } from './fidgets/calendar/events.js';
import { CalendarView } from './fidgets/calendar/calendar-view.js';
import { HomeWidgets, WIDGETS, parseLayout, formatLayout } from './widgets/home/home-widgets.js';
import { readProperties, writeProperty } from '../shared/properties.js';
import { TasksView } from './fidgets/tasks/tasks-view.js';
import { TASKS_FOLDER, DEFAULT_LIST, parseTasks, toggleTask, replaceTask, addTask, formatTask, todayKey } from './fidgets/tasks/tasks.js';
import { CALENDAR_FOLDER, REPEATS_NAME, REPEATS_PATH, dayPath, keyToDate, parseEvents, parseSeries, occurrences, colorHex } from './fidgets/calendar/events.js';
import { parseStickies, writeStickies } from '../shared/stickies.js';
import { renderSettings, withDefaults } from './views/settings-view.js';
import { applyPalette } from './palettes.js';
import { applyTheme, currentLook } from './themes.js';
import { askName, h, scribbleArrow } from './ui.js';
import { findFile, findFolder, flattenFiles, countNotes } from './tree.js';
import { noteName, parentOf, relativeDay, shortDate } from './format.js';
import { Reminders } from './fidgets/calendar/reminders.js';
import { openSearch } from './search.js';
import { InboxView, INBOX_PATH } from './fidgets/inbox/inbox-view.js';
import { openCreateItem } from './create-popover.js';
import { openHistory } from './history-view.js';
import { DatabaseView, PRESETS } from './fidgets/database/database-view.js';
import { ManuscriptView } from './fidgets/manuscript/manuscript-view.js';
import { MoneyView } from './fidgets/money/money-view.js';
import { DebateView } from './fidgets/debate/debate-view.js';
import { Corkboard, DEFAULT_QUOTES } from './home/corkboard.js';
import { ExamTracker, ExamPaper } from './fidgets/exams/exam-tracker-view.js';
import { TRACKER_NAME, guessCourse, formatTracker, parseTracker, findPapers } from './fidgets/exams/exams.js';
import { SchoolView, readPredicted } from './fidgets/exams/school-view.js';
import { kindOf, kindLabel } from './file-types.js';
import { pdfLines } from './fidgets/exams/pdf-lines.js';
import { FIDGETS } from './fidgets/index.js';
import { noteStructure } from './export/note-structure.js';
import { docxFromChapters, docxFromTable, docxFromNote } from './export/docx.js';
import { htmlFromNote } from './export/html.js';
import { FlowEditor, FLOW_FORMATS, isFlowNote, newFlowText, toFlowText, fromFlowText } from './fidgets/flow/flow-editor.js';
import { mergeTemplate } from './templates.js';
import { inlineRuns } from './export/note-structure.js';
import { ReviewView } from './fidgets/flashcards/review-view.js';
import { countDue } from './fidgets/flashcards/schedule.js';
import { PrepTimer } from './widgets/timer/timer.js';
import { TabBar, openPinPicker } from './tabs.js';
import { AddButton } from './fab.js';
import { BookmarkList, openBookmarksPanel, isBookmarked, toggleBookmark } from './bookmarks.js';
import { ITEM_COLORS } from './item-colors.js';

// The Inbox is switched off for now (its code stays, ready to come back).
const INBOX_ENABLED = false;

const viewEl = document.getElementById('view');

// Main passes the saved palette in the address so the first paint uses it.
const initialPalette = new URLSearchParams(location.search).get('palette');
if (initialPalette) applyPalette(initialPalette);
// …and the theme, for the same reason.
{
  const params = new URLSearchParams(location.search);
  applyTheme({ theme: params.get('theme') || 'minimal', mode: params.get('mode') || 'light' });
}

let vault = null;
let tree = [];
let paletteName = initialPalette || 'Riso';
let screen = { kind: 'welcome' }; // plus folderPath / filePath
// The open note: { filePath, editor, noteView } or null.
let current = null;

const sidebarPanel = makePanel(document.getElementById('sidebar'), { id: 'sidebar', side: 'left', label: 'Sidebar', width: 240, min: 180, max: 480, reopenTab: false, onChange: () => { try { chrome.renderTop(); } catch { /* not drawn yet */ } } });
const sidebar = new Sidebar(sidebarPanel, {
  onOpenFile: (p) => openFile(p),
  onOpenFolder: (p) => openFolder(p),
  onSwitchVault: () => window.opal.chooseVault(),
  onColorMenu: (event, node, kind) => colorMenu(event, node, kind),
  onRearrange: (item, target, zone) => rearrange(item, target, zone),
  onCreate: (event) => newNote('', event),
  onOpenBookmark: (item, event) => openBookmark(item, event),
  onBookmarkMenu: (event) => showBookmarks(event.currentTarget),
});

const chrome = new Chrome(document.getElementById('rail'), document.getElementById('topbar'), {
  onHome: () => vault && openFolder(''),
  onSettings: () => showSettings(),
  onBookmarks: (anchor) => showBookmarks(anchor),
  onBack: () => goHistory(-1),
  onForward: () => goHistory(1),
  onReview: () => showReview(),
  onMoney: () => showMoney(),
  onDebate: () => showDebate(),
  onCalendar: (date) => showCalendar(date),
  onSearch: () => startSearch('open'),
  onInbox: INBOX_ENABLED ? () => showInbox() : null,
  onTasks: () => showTasks(),
  onToggleSidebar: () => document.getElementById('sidebar').panel.toggle(),
  sidebarClosed: () => document.getElementById('sidebar').panel.isClosed(),
  fidgets: () => (vault ? homeFidgets() : []),
  railPlace: () => ({ money: 'money', calendar: 'calendar', tasks: 'tasks', debate: 'debate', review: 'flashcards', inbox: 'inbox', settings: 'settings' })[screen.kind] || null,
});

// The tabs sit in the sidebar, one under another (Sidebar places this element).
const tabStrip = h('div', { id: 'tabbar' });
const tabBar = new TabBar(tabStrip, {
  onActivate: (id) => activateTab(id),
  onClose: (id) => closeTab(id),
  onNew: () => newTab(),
  onMenu: (event, id) => tabMenu(event, id),
  onMove: (id, index) => moveTab(id, index),
  onPath: (id, place) => openFromTab(id, place),
  onDouble: (event, id) => tabFileMenu(event, id),
  onPathMenu: (event, id, place) => {
    if (!place) {
      const tab = tabs.find((t) => t.id === id);
      place = tab ? tabPlace(tab) : null; // the tab's own note or folder
      if (!place || (place.kind !== 'home' && place.kind !== 'note')) return tabFileMenu(event, id);
    }
    if (place.kind === 'home') {
      const node = findFolder(tree, place.folderPath, vault.name);
      if (node) colorMenu(event, node, 'folder');
    } else if (place.kind === 'note') {
      const node = findFile(tree, place.filePath);
      if (node) colorMenu(event, node, 'file');
    }
  },
});

// The prep timer lives in the top bar and keeps running across screens.
const prepTimer = new PrepTimer({
  openNote: () => (current && screen && screen.kind === 'note' ? current.filePath : null),
  notify: (payload) => window.opal.notify(payload).catch(() => {}),
  record: (session) => window.opal.addSession(session).then(() => { if (homeWidgets) homeWidgets.reload(); }).catch(() => {}),
  openSettings: () => showSettings('timer'),
});
chrome.timerSlot = prepTimer.el;
sidebar.setTabs(tabStrip);
chrome.renderTop();

// The + button in the bottom right: what can be added depends on the page.
const addButton = new AddButton(document.getElementById('workspace'), { items: () => addItems() });

function addItems() {
  if (!vault || !screen || screen.kind === 'welcome') return [];
  const items = [
    { id: 'note', label: 'Note', hint: '⌘N', icon: 'note', run: (at) => newNote(currentFolder(), at) },
    { id: 'folder', label: 'Folder', hint: '⌘⇧N', icon: 'folder', run: (at) => newFolder(currentFolder(), at) },
  ];
  if (screen.kind === 'home' && homeStickies) {
    items.push({ id: 'sticky', label: 'Sticky note', icon: 'sticky', run: () => homeStickies && homeStickies.layer.add(viewEl.scrollTop) });
  } else if (screen.kind === 'note' && current && current.stickies) {
    items.push({ id: 'sticky', label: 'Sticky note', icon: 'sticky', run: () => current && current.stickies && current.stickies.add(viewEl.scrollTop - current.noteView.center.offsetTop) });
  }
  return items;
}

// ---------- Everything happens one step at a time ----------

// Opening, closing and saving run one after another, never overlapping,
// so a fast click can't skip saving the previous note.
let queue = Promise.resolve();
function enqueue(task) {
  const run = queue.then(task);
  queue = run.catch((err) => console.error(err));
  return run;
}

// Saves and removes the open editor. Throws (keeping the note open) if saving fails.
async function closeCurrent() {
  if (!current) return;
  await current.editor.flush();
  // Leaving an edited note: one more snapshot for its history.
  if (current.edited && current.editor.getText) {
    await window.opal.saveSnapshot(current.filePath, current.editor.getText(), 'leave').catch(() => {});
  }
  current.editor.destroy();
  current = null;
}

// Stickies on the folder home on screen: { layer, flush } or null.
let homeStickies = null;
// The calendar on screen (and where it was last left).
let calendar = null;
let calendarState = { date: new Date(), mode: 'day' };

// The home page's widgets on screen, and whether they're being arranged.
let homeWidgets = null;
let homeEditing = false;

let tasksView = null;
let reviewView = null;
let moneyView = null;
let debateView = null;
let debateState = null;
let moneyState = { month: null, tab: 'overview' };
let inboxView = null;
let corkboard = null;
let examPaper = null;
let schoolView = null;
const schoolTabs = new Map(); // folder path → the School page's open tab

// Called whenever another screen takes over.
function leaveCalendar() {
  if (debateView) debateView.destroy();
  debateView = null;
  if (moneyView) moneyView.destroy();
  moneyView = null;
  if (reviewView) reviewView.destroy();
  reviewView = null;
  if (tasksView && tasksView.destroy) tasksView.destroy();
  tasksView = null;
  inboxView = null;
  if (calendar) calendar.destroy();
  calendar = null;
  if (homeWidgets) homeWidgets.destroy();
  homeWidgets = null;
  if (corkboard) corkboard.destroy();
  corkboard = null;
  if (examPaper) examPaper.destroy();
  examPaper = null;
  if (schoolView) schoolView.destroy();
  schoolView = null;
}

async function flushHomeStickies() {
  if (homeStickies) await homeStickies.flush();
}

// Every move to another screen goes through here: it saves the open note
// (and any sticky changes) first, and stays put if that fails.
function navigate(task) {
  return enqueue(async () => {
    try {
      await flushHomeStickies();
      await closeCurrent();
    } catch (err) {
      alert(`Opal could not save “${noteName(current.filePath)}”, so it is staying open.\n\n${err.message}`);
      return;
    }
    await task();
  });
}

async function reloadTree() {
  tree = await window.opal.listFiles();
  sidebar.setTree(tree);
  reminders.refresh();
  updateCardsDue();
  updateInboxCount();
}

// ---------- Reminders ----------

const reminders = new Reminders({
  readFile: (path) => window.opal.readFile(path),
  listFiles: () => (vault ? flattenFiles(tree) : []),
  notify: (payload) => window.opal.notify(payload).catch(() => {}),
});

// ---------- Renaming the open note (from its title) ----------

async function renameOpenNote(filePath, newName, { describe = false } = {}) {
  if (current && current.filePath === filePath) await current.editor.flush();
  const newPath = await window.opal.renameNote(filePath, newName);
  if (newPath !== filePath) renamePlaces(filePath, newPath, false);
  await reloadTree();
  if (newPath !== filePath) {
    // Close the editor without saving again (the old file name is gone — a
    // save would bring it back), then reopen the note under its new name.
    if (current && current.filePath === filePath) {
      current.editor.destroy();
      current = null;
    }
    await navigate(() => showNote(newPath));
  }
  // Enter after the name: straight on to the description line.
  if (describe && current && current.filePath === newPath && current.noteView.openDescription) current.noteView.openDescription();
}

// The open note's description, changed through its editor (so it's saved
// like typing and nothing typed is lost).
function describeOpenNote(filePath, text) {
  if (!current || current.filePath !== filePath || !current.editor.replaceText) return;
  current.editor.replaceText(setDescription(current.editor.getText(), text));
}

// A folder's description, kept in its folder note.
async function describeFolder(folderPath, text) {
  try {
    await window.opal.setDescription(folderPath, 'folder', text);
    await refreshFiles();
  } catch (err) {
    alert(`Couldn't save the description.\n\n${err.message}`);
  }
}

// Folder renamed from its own page (the big title).
let describeAfterOpen = null; // a folder whose description should open when it's shown
async function renameFolderFromHome(folderPath, next, { describe = false } = {}) {
  const node = findFolder(tree, folderPath, vault.name);
  if (!node) return;
  // Renaming reopens the folder's page; this tells it to open the description.
  describeAfterOpen = describe ? '*' : null;
  try {
    await renameItemTo(node, 'folder', next);
  } finally {
    describeAfterOpen = null;
  }
}

// ---------- Search ----------

function startSearch(mode) {
  if (!vault) return;
  openSearch({
    tree: () => tree,
    search: (query) => window.opal.search(query),
    openFile: (path) => openFile(path),
    openFolder: (path) => openFolder(path),
    openAt: async (path, line, column, length) => {
      await openFile(path);
      if (current && current.filePath === path && current.editor.goToLine) current.editor.goToLine(line, column, length);
    },
  }, { mode });
}

function openReminder(open) {
  if (!vault || !open) return;
  if (open.kind === 'tasks') {
    showTasks();
  } else if (open.kind === 'calendar') {
    calendarState = { ...calendarState, mode: 'day' };
    showCalendar(keyToDate(open.day));
  }
}

// ---------- Screens ----------

// The breadcrumb for the screen just shown; also tells themes which screen
// it is (the GitHub theme underlines that tab).
function showCrumbs(crumbs) {
  document.documentElement.dataset.screen = screen ? screen.kind : '';
  chrome.setCrumbs(crumbs);
  addButton.refresh();
  remember();
  if (!screen || screen.kind !== 'note') chrome.setWords(null);
  else showWordCount();
}

// ---------- Word count (status bar) ----------

let wordTimer = null;
function showWordCount() {
  clearTimeout(wordTimer);
  wordTimer = setTimeout(() => {
    if (!current || !current.editor.view) {
      chrome.setWords(null);
      return;
    }
    const { state } = current.editor.view;
    const text = state.doc.toString();
    const selected = state.selection.ranges.reduce((n, r) => n + (r.empty ? 0 : countSelected(state.sliceDoc(r.from, r.to))), 0);
    const target = parseInt(String(getProp(text, 'word-target') || ''), 10) || null;
    chrome.setWords({ words: countWords(text), selected, target });
  }, 120);
}

// ---------- Version history ----------

async function showHistory(filePath) {
  if (!current || current.filePath !== filePath) return;
  await current.editor.flush();
  openHistory({
    title: noteName(filePath),
    list: () => window.opal.listSnapshots(filePath),
    read: (id) => window.opal.readSnapshot(filePath, id),
    current: () => current.editor.getText(),
    restore: async (text) => {
      // The version being replaced becomes a snapshot first, so this can be undone.
      await window.opal.saveSnapshot(filePath, current.editor.getText(), 'restore').catch(() => {});
      current.editor.replaceText(text);
      await current.editor.flush();
      current.edited = true;
    },
  });
}

// ---------- Backlinks ----------

// Fills the open note's Linked from / Unlinked mentions lists.
let backlinkTimer = null;
function loadBacklinks() {
  clearTimeout(backlinkTimer);
  backlinkTimer = setTimeout(async () => {
    const open = current;
    if (!open || !open.noteView || !open.noteView.setBacklinks) return;
    try {
      const data = await window.opal.backlinks(open.filePath);
      if (current === open) open.noteView.setBacklinks(data);
    } catch {
      // Leave the lists as they were.
    }
  }, 120);
}

// ---------- Tabs, and back and forward ----------
//
// Like Obsidian: several tabs, each showing one page and keeping its own
// back / forward history (like a web browser). Only the active tab's page is
// drawn; switching tabs draws that tab's page again. ⌘-click (or "Open in
// new tab") opens something in a new tab, and a pinned tab keeps its page —
// anything opened from it goes to a new tab. The tabs are saved in the
// vault's .opal/workspace.json so they come back next time.

const PLACE_KINDS = ['calendar', 'tasks', 'settings', 'inbox', 'review', 'money', 'debate'];
const PLACE_TITLES = { calendar: 'Calendar', tasks: 'Tasks', settings: 'Settings', inbox: 'Inbox', review: 'Review', money: 'Money', debate: 'Debate' };
const PLACE_ICONS = { calendar: 'calendar', tasks: 'tasks', settings: 'settings', inbox: 'tasks', review: 'review', money: 'money', debate: 'debate' };

let tabs = []; // [{ id, pinned, pin: { emoji, color }, places: [place], at, scroll }]
let activeTabId = null;
let nextTabId = 1;
// A page being drawn from a tab's history (or another tab): not a new visit.
let movingTo = null; // { place, at }
// A ⌘-click just asked for the next page to open in a new tab.
let newTabAt = 0;

function currentPlace() {
  if (!screen) return null;
  if (screen.kind === 'home') return { kind: 'home', folderPath: screen.folderPath };
  if (screen.kind === 'note') return { kind: 'note', filePath: screen.filePath };
  // Money and Debate remember which page (or tab and month) is showing, so
  // back and forward step through them too.
  if (screen.kind === 'money') return { kind: 'money', sub: { month: moneyState.month || null, tab: moneyState.tab || 'overview' } };
  if (screen.kind === 'debate') return { kind: 'debate', sub: debatePlace(debateState) };
  if (screen.kind === 'exam-paper') return { kind: 'exam-paper', filePath: screen.filePath, sub: { paper: screen.paper } };
  if (PLACE_KINDS.includes(screen.kind)) return { kind: screen.kind };
  return null;
}

// The part of the Debate page's state worth going back to.
function debatePlace(state) {
  const s = state || {};
  const out = { page: s.page || 'overview' };
  for (const key of ['path', 'tab', 'comp']) if (typeof s[key] === 'string' || typeof s[key] === 'number') out[key] = s[key];
  return out;
}

function samePlace(a, b) {
  return Boolean(a && b && a.kind === b.kind && a.folderPath === b.folderPath && a.filePath === b.filePath
    && JSON.stringify(a.sub || null) === JSON.stringify(b.sub || null));
}

function makeTab(place = null, pinned = false, pin = null) {
  return { id: nextTabId++, pinned, pin: pinned ? pin : null, places: place ? [place] : [], at: place ? 0 : -1, scroll: 0 };
}

function activeTab() {
  return tabs.find((t) => t.id === activeTabId) || null;
}

function tabPlace(tab) {
  return tab ? tab.places[tab.at] || null : null;
}

function wantsNewTab() {
  return Boolean(newTabAt) && Date.now() - newTabAt < 1500;
}

function placeTitle(place) {
  if (!place) return 'New tab';
  if (place.kind === 'note') return noteName(place.filePath);
  if (place.kind === 'home') return place.folderPath ? place.folderPath.split('/').pop() : 'Home';
  if (place.kind === 'exam-paper') return `${parentOf(place.filePath).split('/').pop()} · WACE ${place.sub && place.sub.paper}`;
  return PLACE_TITLES[place.kind] || '';
}

function placeIcon(place) {
  if (!place) return 'plus';
  if (place.kind === 'note') return 'note';
  if (place.kind === 'home') return place.folderPath ? 'folder' : 'home';
  if (place.kind === 'exam-paper') return 'trophy';
  return PLACE_ICONS[place.kind] || 'note';
}

// A page was just shown: it becomes the active tab's next page (or a new tab's).
function remember() {
  const place = currentPlace();
  if (!place) return;
  const tab = activeTab();
  const here = tabPlace(tab);
  const moving = movingTo && Date.now() - movingTo.at < 3000;
  movingTo = null;
  if (moving) {
    // From history: if the page couldn't be shown (a deleted note), the tab shows where it ended up.
    if (tab && !samePlace(place, here)) tab.places[tab.at] = place;
  } else {
    const toNewTab = wantsNewTab() || Boolean(tab && tab.pinned && here && !samePlace(place, here));
    newTabAt = 0;
    if (!tab || toNewTab) {
      const fresh = makeTab(place);
      tabs.splice(tab ? tabs.indexOf(tab) + 1 : tabs.length, 0, fresh);
      activeTabId = fresh.id;
    } else if (!samePlace(place, here)) {
      tab.places = tab.places.slice(0, tab.at + 1);
      tab.places.push(place);
      if (tab.places.length > 200) tab.places.shift();
      tab.at = tab.places.length - 1;
    }
  }
  drawTabs();
  saveWorkspace();
}

// Where a page is, for the tab's hover card: the vault, the folders on the
// way (each one a link) and the page itself.
function placePath(place) {
  if (!place || !vault) return [];
  const steps = [{ label: vault.name, icon: 'home', place: { kind: 'home', folderPath: '' } }];
  if (place.kind === 'note' || place.kind === 'home') {
    const folder = place.kind === 'note' ? parentOf(place.filePath) : place.folderPath;
    const parts = folder ? folder.split('/') : [];
    parts.forEach((part, i) => steps.push({ label: part, icon: 'folder', place: { kind: 'home', folderPath: parts.slice(0, i + 1).join('/') } }));
    if (place.kind === 'note') steps.push({ label: noteName(place.filePath), icon: 'note', place });
  } else {
    steps.push({ label: placeTitle(place), icon: placeIcon(place), place });
  }
  return steps;
}

function placeDetail(place) {
  if (!place || place.kind !== 'note') return '';
  const node = findFile(tree, place.filePath);
  return node && node.modified ? `Edited ${relativeDay(node.modified)} · ${place.filePath}` : place.filePath;
}

function drawTabs() {
  tabBar.render(tabs.map((t) => {
    const place = tabPlace(t);
    return { id: t.id, pinned: t.pinned, pin: t.pin, title: placeTitle(place), icon: placeIcon(place), path: placePath(place), detail: placeDetail(place) };
  }), activeTabId);
  const tab = activeTab();
  chrome.setHistory(Boolean(tab && tab.at > 0), Boolean(tab && tab.at < tab.places.length - 1));
}

function goToPlace(place) {
  if (place.kind === 'home') return openFolder(place.folderPath);
  if (place.kind === 'note') return openFile(place.filePath);
  if (place.kind === 'calendar') return showCalendar();
  if (place.kind === 'tasks') return showTasks();
  if (place.kind === 'logbook') return openFolder(''); // the Logbook is on the home page now
  if (place.kind === 'settings') return showSettings();
  if (place.kind === 'inbox') return showInbox();
  if (place.kind === 'review') return showReview();
  if (place.kind === 'money') {
    if (place.sub) moneyState = { month: place.sub.month || null, tab: place.sub.tab || 'overview' };
    return showMoney();
  }
  if (place.kind === 'debate') {
    if (place.sub) debateState = { ...place.sub };
    return showDebate();
  }
  if (place.kind === 'exam-paper') return showExamPaper(place.filePath, place.sub && place.sub.paper);
  return Promise.resolve();
}

// Shows a page without counting it as a new visit.
async function showPlace(place) {
  movingTo = { place, at: Date.now() };
  newTabAt = 0;
  await goToPlace(place);
}

// step: -1 = back, 1 = forward (within the active tab).
async function goHistory(step) {
  const tab = activeTab();
  if (!vault || !tab) return;
  const index = tab.at + step;
  if (index < 0 || index >= tab.places.length) return;
  tab.at = index;
  drawTabs();
  await showPlace(tab.places[index]);
  saveWorkspace();
}

// Keeps each tab's scroll position, to put back when it's shown again.
viewEl.addEventListener('scroll', () => {
  const tab = activeTab();
  if (tab) tab.scroll = viewEl.scrollTop;
}, { passive: true });

async function activateTab(id) {
  const tab = tabs.find((t) => t.id === id);
  if (!tab || id === activeTabId) return;
  activeTabId = id;
  drawTabs();
  const scroll = tab.scroll;
  const place = tabPlace(tab);
  if (!place) {
    await openFolder('');
    return;
  }
  await showPlace(place);
  requestAnimationFrame(() => {
    if (activeTabId === id) viewEl.scrollTop = scroll;
  });
  saveWorkspace();
}

// A new tab at the far right, showing the vault's home page.
function newTab() {
  if (!vault) return;
  const fresh = makeTab();
  tabs.push(fresh);
  activeTabId = fresh.id;
  drawTabs();
  openFolder('');
}

function closeTab(id) {
  const index = tabs.findIndex((t) => t.id === id);
  if (index === -1) return;
  if (tabs.length === 1) {
    // The last tab: a fresh one on the home page instead.
    tabs = [makeTab()];
    activeTabId = tabs[0].id;
    drawTabs();
    openFolder('');
    return;
  }
  const wasActive = id === activeTabId;
  tabs.splice(index, 1);
  if (wasActive) {
    activeTabId = null;
    activateTab((tabs[index] || tabs[index - 1]).id);
  } else {
    drawTabs();
  }
  saveWorkspace();
}

function closeTabs(keep) {
  const active = activeTab();
  const survivors = tabs.filter(keep);
  if (!survivors.length) return;
  tabs = survivors;
  if (!tabs.includes(active)) {
    activeTabId = null;
    activateTab(tabs[0].id);
  } else {
    drawTabs();
  }
  saveWorkspace();
}

// Pinning a tab asks for its emoji and colour; unpinning forgets them.
function togglePin(id) {
  const tab = tabs.find((t) => t.id === id);
  if (!tab) return;
  tab.pinned = !tab.pinned;
  tab.pin = tab.pinned ? { emoji: null, color: null } : null;
  drawTabs();
  saveWorkspace();
  if (tab.pinned) choosePin(id);
}

function choosePin(id) {
  const tab = tabs.find((t) => t.id === id);
  const el = document.querySelector(`#tabbar .tab[data-id="${id}"]`);
  if (!tab || !tab.pinned || !el) return;
  openPinPicker(el, tab.pin || {}, (pin) => {
    tab.pin = pin;
    drawTabs();
    saveWorkspace();
  });
}

// A folder or page chosen on a tab's hover card: shown in that tab (a
// pinned tab keeps its page, so it opens in a new tab instead).
async function openFromTab(id, place) {
  if (id !== activeTabId) await activateTab(id);
  await goToPlace(place);
}

function moveTab(id, index) {
  const from = tabs.findIndex((t) => t.id === id);
  if (from === -1) return;
  const [tab] = tabs.splice(from, 1);
  tabs.splice(index > from ? index - 1 : index, 0, tab);
  drawTabs();
  saveWorkspace();
}

function tabMenu(event, id) {
  const tab = tabs.find((t) => t.id === id);
  if (!tab) return;
  const index = tabs.indexOf(tab);
  showMenu(event, {
    title: placeTitle(tabPlace(tab)),
    items: [
      { label: tab.pinned ? 'Unpin' : 'Pin', hint: tab.pinned ? '' : 'small, with an emoji', onSelect: () => togglePin(id) },
      tab.pinned ? { label: 'Emoji and colour…', onSelect: () => choosePin(id) } : null,
      { label: 'Duplicate tab', onSelect: () => duplicateTab(id) },
      tabBookmarkItem(tab),
      ...(fileItems(tab).length ? ['separator', ...fileItems(tab)] : []),
      'separator',
      { label: 'Close', hint: '⌘W', onSelect: () => closeTab(id) },
      { label: 'Close others', hint: 'keeps pinned tabs', disabled: tabs.length < 2, onSelect: () => closeTabs((t) => t === tab || t.pinned) },
      { label: 'Close tabs to the right', disabled: index === tabs.length - 1, onSelect: () => closeTabs((t, i) => i <= index || t.pinned) },
    ].filter(Boolean),
  });
}

// Show in Finder / Copy path for a tab's note, file or folder (double-click a tab).
function fileItems(tab) {
  const place = tabPlace(tab);
  if (!place || !vault || (place.kind !== 'note' && place.kind !== 'home')) return [];
  const rel = place.kind === 'note' ? place.filePath : place.folderPath;
  const full = rel ? `${vault.path}/${rel}` : vault.path;
  const copy = async (text, what) => {
    try {
      await window.opal.copyText(text);
      chrome.setStatus(`Copied ${what}`);
    } catch (err) {
      alert(`Couldn't copy the path.\n\n${err.message}`);
    }
  };
  return [
    { label: 'Show in Finder', onSelect: () => (place.kind === 'note' ? window.opal.revealInFinder(rel) : window.opal.revealFolder(rel)) },
    { label: 'Copy path', hint: 'the full path on this Mac', onSelect: () => copy(full, 'the path') },
    rel ? { label: 'Copy vault path', hint: rel.length > 28 ? `…${rel.slice(-27)}` : rel, onSelect: () => copy(rel, 'the vault path') } : null,
  ].filter(Boolean);
}

function tabBookmarkItem(tab) {
  const place = tabPlace(tab);
  const target = place && place.kind === 'note' ? bookmarkTarget(place.filePath, false) : place && place.kind === 'home' ? bookmarkTarget(place.folderPath, true) : null;
  if (!target) return null;
  return { label: isBookmarked(bookmarksData, target) ? 'Remove bookmark' : 'Bookmark', onSelect: () => toggleBookmarkOf(target) };
}

function tabFileMenu(event, id) {
  const tab = tabs.find((t) => t.id === id);
  if (!tab) return;
  const items = fileItems(tab);
  if (!items.length) return;
  showMenu(event, { title: placeTitle(tabPlace(tab)), items });
}

function duplicateTab(id) {
  const tab = tabs.find((t) => t.id === id);
  if (!tab) return;
  const copy = { ...makeTab(), places: tab.places.slice(), at: tab.at, scroll: tab.scroll }; // a copy isn't pinned
  tabs.splice(tabs.indexOf(tab) + 1, 0, copy);
  activateTab(copy.id);
}

// Opens something in a new tab (the "Open in new tab" menu items).
function inNewTab(open) {
  newTabAt = Date.now();
  return open();
}

// Notes or folders renamed or moved: every tab follows them.
function renamePlaces(oldPath, newPath, isFolder) {
  const moved = (p) => (p === oldPath ? newPath : isFolder && p && p.startsWith(`${oldPath}/`) ? `${newPath}${p.slice(oldPath.length)}` : p);
  for (const tab of tabs) {
    tab.places = tab.places.map((place) => {
      if (place.kind === 'note') return { ...place, filePath: moved(place.filePath) };
      if (place.kind === 'home' && isFolder) return { ...place, folderPath: moved(place.folderPath) };
      return place;
    });
  }
  drawTabs();
  saveWorkspace();
}

let workspaceTimer = null;
function saveWorkspace() {
  if (!vault) return;
  clearTimeout(workspaceTimer);
  workspaceTimer = setTimeout(() => {
    const data = {
      tabs: tabs.map((t) => ({ place: tabPlace(t), pinned: t.pinned || undefined, pin: t.pinned && t.pin && (t.pin.emoji || t.pin.color) ? t.pin : undefined })).filter((t) => t.place),
      active: Math.max(0, tabs.filter((t) => tabPlace(t)).indexOf(activeTab())),
    };
    window.opal.writeOpalJson('workspace.json', data).catch(() => {});
  }, 400);
}

// The tabs saved last time (or one tab on the home page). → the page to show first.
async function restoreTabs() {
  clearTimeout(workspaceTimer);
  tabs = [];
  activeTabId = null;
  const saved = vault && vaultSettings.tabs.restore ? await window.opal.readOpalJson('workspace.json').catch(() => ({})) : {};
  const clean = (place) => {
    if (!place || typeof place !== 'object') return null;
    if (place.kind === 'note' && typeof place.filePath === 'string' && findFile(tree, place.filePath)) return { kind: 'note', filePath: place.filePath };
    if (place.kind === 'home' && typeof (place.folderPath ?? '') === 'string' && findFolder(tree, place.folderPath || '', vault.name)) return { kind: 'home', folderPath: place.folderPath || '' };
    if (place.kind === 'logbook') return { kind: 'home', folderPath: '' }; // now on the home page
    if (place.kind === 'exam-paper' && typeof place.filePath === 'string' && findFile(tree, place.filePath) && place.sub && typeof place.sub.paper === 'string') return { kind: 'exam-paper', filePath: place.filePath, sub: { paper: place.sub.paper } };
    if (place.kind === 'money' || place.kind === 'debate') {
      const sub = place.sub && typeof place.sub === 'object' ? place.sub : null;
      if (!sub) return { kind: place.kind };
      return place.kind === 'money'
        ? { kind: 'money', sub: { month: /^\d{4}-\d{2}$/.test(sub.month || '') ? sub.month : null, tab: typeof sub.tab === 'string' ? sub.tab : 'overview' } }
        : { kind: 'debate', sub: debatePlace(sub) };
    }
    if (PLACE_KINDS.includes(place.kind) && (place.kind !== 'inbox' || INBOX_ENABLED)) return { kind: place.kind };
    return null;
  };
  for (const t of Array.isArray(saved.tabs) ? saved.tabs.slice(0, 50) : []) {
    const place = clean(t && t.place);
    if (!place) continue;
    // A pinned tab's emoji (one short piece of text) and palette colour.
    const pin = t.pin && typeof t.pin === 'object' ? {
      emoji: typeof t.pin.emoji === 'string' && t.pin.emoji.length <= 16 ? t.pin.emoji : null,
      color: typeof t.pin.color === 'string' && ITEM_COLORS[t.pin.color] ? t.pin.color : null,
    } : { emoji: null, color: null };
    tabs.push(makeTab(place, Boolean(t.pinned), pin));
  }
  if (!tabs.length) tabs.push(makeTab({ kind: 'home', folderPath: '' }));
  const tab = tabs[Math.min(Math.max(0, Number(saved.active) || 0), tabs.length - 1)];
  activeTabId = tab.id;
  drawTabs();
  return tabPlace(tab);
}

// Cycles through the tabs: step 1 = next, -1 = previous.
function stepTab(step) {
  if (tabs.length < 2) return;
  const index = tabs.findIndex((t) => t.id === activeTabId);
  activateTab(tabs[(index + step + tabs.length) % tabs.length].id);
}

function crumbsFor(folderPath) {
  const crumbs = [{ label: vault.name, onClick: () => openFolder('') }];
  const parts = folderPath ? folderPath.split('/') : [];
  parts.forEach((part, i) => {
    const target = parts.slice(0, i + 1).join('/');
    crumbs.push({ label: part, onClick: () => openFolder(target) });
  });
  return crumbs;
}

function setTitle(text) {
  document.title = text ? `${text} — Opal` : 'Opal';
}

function showWelcome(problem) {
  leaveCalendar();
  screen = { kind: 'welcome' };
  setTitle('');
  sidebar.setActive(null, null);
  showCrumbs([{ label: 'Welcome' }]);
  viewEl.replaceChildren(h('div', { class: 'welcome' },
    problem ? h('div', { class: 'home-notice welcome-notice' }, problem) : null,
    h('span', { class: 'mono-label' }, 'Opal · notes that live in plain files'),
    h('h1', { class: 'display home-h1' }, 'Opal.'),
    h('p', { class: 'home-desc' }, 'Pick a folder to be your vault. Any folder of markdown files works — even an Obsidian vault.'),
    h('div', { class: 'welcome-row' },
      h('button', { class: 'home-action is-primary welcome-button', onclick: () => window.opal.chooseVault() }, 'Choose a folder…'),
      scribbleArrow({ width: 110, height: 60, d: 'M104 40 C 80 56, 40 54, 14 30', head: 'M12 44 L13 29 L27 30' }),
      h('span', { class: 'hand welcome-hint' }, 'start here'))));
}

function showHome(folderPath, notice) {
  let folder = findFolder(tree, folderPath, vault.name);
  if (!folder) {
    folderPath = '';
    folder = findFolder(tree, '', vault.name);
  }
  leaveCalendar();
  screen = { kind: 'home', folderPath };
  setTitle(folder.name);
  sidebar.setActive('folder', folderPath);
  showCrumbs(crumbsFor(folderPath));
  if (!folderPath && vaultSettings.homeStyle !== 'classic') {
    showCorkboard();
    return;
  }
  if (schoolSubjects(folder).length >= 2) {
    showSchool(folder, folderPath);
    return;
  }
  const home = renderFolderHome(viewEl, folderHomeOptions(folder, folderPath, notice));
  describeAfterOpen = null;
  homeStickies = folderHomeStickies(folderPath, folder, home);
  addButton.refresh();
}

// What renderFolderHome needs for a folder (its normal page, or the School page's Files tab).
function folderHomeOptions(folder, folderPath, notice) {
  return {
    folder,
    isRoot: !folderPath,
    notice,
    getPreviews: (paths) => window.opal.getPreviews(paths),
    onOpenFile: (p) => openFile(p),
    onOpenFolder: (p) => openFolder(p),
    onNewNote: (at) => newNote(folderPath, at),
    onNewFolder: (at) => newFolder(folderPath, at),
    onAddSticky: () => homeStickies && homeStickies.layer.add(viewEl.scrollTop),
    onColorMenu: (event, node, kind) => colorMenu(event, node, kind),
    onRearrange: (item, target, zone) => rearrange(item, target, zone),
    onCreateHere: (event) => newNote(folderPath, event),
    onRename: (next, options) => renameFolderFromHome(folderPath, next, options),
    onDescribe: (text) => describeFolder(folderPath, text),
    describeNow: describeAfterOpen === '*',
    loadDescription: async () => getDescription(await window.opal.readFolderSettings(folderPath)),
    loadWords: () => window.opal.folderWords(folderPath),
    loadManuscript: () => window.opal.readManuscript(folderPath),
    mountManuscript: (slot, settings, notes) => new ManuscriptView(slot, {
      folderName: folderLabel(folderPath),
      notes,
      settings,
      io: {
        save: (next) => window.opal.writeManuscript(folderPath, { on: true, ...next }).catch((err) => alert(`Couldn't save the chapter order.\n\n${err.message}`)),
        words: async (path) => countWords(await window.opal.readFile(path)),
        openFile: (path) => openFile(path),
        compile: (paths) => compileManuscript(folderLabel(folderPath), paths),
        reveal: () => window.opal.revealExport(),
      },
    }),
    loadDatabase: () => window.opal.readDatabase(folderPath),
    mountDatabase: (slot, settings) => new DatabaseView(slot, {
      folderName: folderLabel(folderPath),
      settings,
      io: {
        rows: () => window.opal.databaseRows(folderPath),
        setCell: (path, key, value, type) => window.opal.setDatabaseCell(path, key, value, type),
        save: (next) => window.opal.writeDatabase(folderPath, true, next).catch((err) => alert(`Couldn't save the database settings.\n\n${err.message}`)),
        addRow: (name) => window.opal.createNote(name, folderPath, 'default'),
        openFile: (path) => openFile(path),
        openLink: (target) => openLink(target),
        turnOff: () => showAsDatabase(folderPath, null),
      },
    }),
    loadWordTarget: async () => parseInt(String(getProp(await window.opal.readFolderSettings(folderPath), 'word-target') || ''), 10) || null,
    mountWidgets: folderPath ? null : (slot) => mountHomeWidgets(slot),
    fidgets: folderPath ? null : homeFidgets(),
    mountExams: examTrackerFor(folder),
  };
}

// ---------- School ----------
//
// A folder whose subject folders have exam trackers (School/Methods/Exam
// tracker.md…) opens as the School page (src/fidgets/exams/school-view.js):
// every subject's marks, the WACE dates from the calendar, and moderation from
// a "Predicted ATAR" PDF in the folder. Its Files tab is the normal folder page.

function schoolSubjects(folder) {
  if (!folder || !folder.path) return [];
  return folder.children.filter((c) => c.type === 'folder' && c.children.some((f) => f.type === 'file' && f.name === `${TRACKER_NAME}.md`));
}

const predictedCache = new Map(); // pdf path → { modified, value }

async function predictedFor(folder) {
  const pdf = folder.children.find((c) => c.type === 'file' && /\.pdf$/i.test(c.name) && /predict/i.test(c.name) && /atar/i.test(c.name));
  if (!pdf) return null;
  const hit = predictedCache.get(pdf.path);
  if (hit && hit.modified === pdf.modified) return hit.value;
  let value = null;
  try {
    value = readPredicted((await pdfLines([pdf.path], (p) => window.opal.readBytes(p))).join(' '));
  } catch {
    value = null;
  }
  predictedCache.set(pdf.path, { modified: pdf.modified, value });
  return value;
}

// Each subject's WACE exam: the first calendar event from today on (up to five
// months ahead) that says WACE and names the subject (its folder's first word).
async function waceExamsFor(subjects) {
  const start = new Date();
  const keys = [];
  for (let i = 0; i < 160; i++) {
    const key = dayKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
    if (findFile(tree, dayPath(key))) keys.push(key);
  }
  const days = await Promise.all(keys.map((key) => loadDayEvents(key).catch(() => [])));
  const out = [];
  for (const s of subjects) {
    const word = s.name.split(/\s+/)[0].toLowerCase();
    const alias = /^politics/.test(word) ? /\b(politics|p&l|pal)\b/i : new RegExp(`\\b${word.replace(/[^a-z]/g, '')}`, 'i');
    for (const events of days) {
      const ev = events.find((e) => /wace/i.test(e.title || e.text) && alias.test(e.title || e.text));
      if (ev) {
        out.push({ subject: s.name, day: ev.day, start: ev.start, end: ev.end, allDay: ev.allDay });
        break;
      }
    }
  }
  return out;
}

function showSchool(folder, folderPath) {
  homeStickies = null;
  const subjects = schoolSubjects(folder);
  schoolView = new SchoolView(viewEl, {
    tab: schoolTabs.get(folderPath),
    io: {
      name: folder.name,
      load: async () => {
        const list = await Promise.all(subjects.map(async (sub) => {
          const note = sub.children.find((f) => f.type === 'file' && f.name === `${TRACKER_NAME}.md`);
          const files = flattenFiles(sub.children);
          return {
            name: sub.name,
            path: sub.path,
            trackerPath: note.path,
            color: colorOf(sub),
            tracker: parseTracker(await window.opal.readFile(note.path), sub.name),
            papers: findPapers(files.map((f) => ({ path: f.path }))),
            items: files.filter((f) => !f.quiet).length,
          };
        }));
        const loose = folder.children.filter((c) => c.type === 'file' && !c.quiet).sort((a, b) => (b.modified || 0) - (a.modified || 0));
        const [exams, predicted] = await Promise.all([waceExamsFor(list), predictedFor(folder)]);
        return {
          subjects: list,
          exams,
          predicted,
          files: loose.map((f) => ({
            path: f.path,
            name: noteName(f.path).replace(/\.[^.]+$/, ''),
            meta: `${kindOf(f.path) === 'note' ? 'Note' : kindLabel(kindOf(f.path))}${f.modified ? ` · ${shortDate(f.modified)}` : ''}`,
          })),
        };
      },
      openFolder: (p) => openFolder(p),
      openFile: (p) => openFile(p),
      openPaper: (trackerPath, year) => showExamPaper(trackerPath, year),
      openDay: (key) => showCalendar(keyToDate(key)),
      addResult: async (trackerPath, result) => {
        const text = await window.opal.readFile(trackerPath);
        const t = parseTracker(text, noteName(parentOf(trackerPath)));
        t.results.push({ ...result, date: '' });
        await window.opal.writeFile(trackerPath, formatTracker(t, text));
      },
      mountFiles: (slot) => {
        const home = renderFolderHome(slot, folderHomeOptions(folder, folderPath));
        home.classList.add('is-inside-school');
      },
      onTab: (tab) => schoolTabs.set(folderPath, tab),
    },
  });
  addButton.refresh();
}

// ---------- Exam tracker ----------
//
// A subject folder with an "Exam tracker.md" note shows the tracker at the top
// of its page (src/fidgets/exams/). Everything is in that note.

function examTrackerFor(folder) {
  if (!folder || !folder.path) return null;
  const note = folder.children.find((c) => c.type === 'file' && c.name === `${TRACKER_NAME}.md`);
  if (!note) return null;
  return (slot) => new ExamTracker(slot, {
    path: note.path,
    folderName: folder.name,
    load: () => window.opal.readFile(note.path),
    save: (text) => window.opal.writeFile(note.path, text),
    files: () => flattenFiles(folder.children).map((f) => ({ path: f.path })),
    pdfLines: (paths) => pdfLines(paths, (p) => window.opal.readBytes(p)),
    openFile: (p) => openFile(p),
    openPaper: (name, { newTab } = {}) => (newTab ? inNewTab(() => showExamPaper(note.path, name)) : showExamPaper(note.path, name)),
  });
}

// One WACE paper, marked question by question, on its own page.
function showExamPaper(trackerPath, paper) {
  if (!vault || !trackerPath || !paper) return Promise.resolve();
  return navigate(async () => {
    const folderPath = parentOf(trackerPath);
    const folder = findFolder(tree, folderPath, vault.name);
    if (!folder || !findFile(tree, trackerPath)) return showHome(folderPath, `Can't find ${trackerPath} any more.`);
    homeStickies = null;
    leaveCalendar();
    screen = { kind: 'exam-paper', filePath: trackerPath, paper };
    setTitle(`${folder.name} · WACE ${paper}`);
    sidebar.setActive('folder', folderPath);
    showCrumbs([...crumbsFor(folderPath).map((c, i, all) => (i === all.length - 1 ? { ...c, onClick: () => openFolder(folderPath) } : c)), { label: `WACE ${paper}` }]);
    viewEl.scrollTop = 0;
    examPaper = new ExamPaper(viewEl, {
      path: trackerPath,
      paper,
      folderName: folder.name,
      load: () => window.opal.readFile(trackerPath),
      save: (text) => window.opal.writeFile(trackerPath, text),
      files: () => flattenFiles(folder.children).map((f) => ({ path: f.path })),
      pdfLines: (paths) => pdfLines(paths, (p) => window.opal.readBytes(p)),
      openFile: (p) => openFile(p),
      back: () => {
        const tab = activeTab();
        if (tab && tab.at > 0 && samePlace(tab.places[tab.at - 1], { kind: 'home', folderPath })) goHistory(-1);
        else openFolder(folderPath);
      },
    });
  });
}

// A new "Exam tracker.md" in a subject folder, its course guessed from the folder's name.
async function addExamTracker(node) {
  const course = guessCourse(node.name);
  const text = formatTracker({ course, target: 70, moderated: null, results: [], papers: [] }, '', `${node.name} exam tracker`);
  try {
    const path = await window.opal.createNote(TRACKER_NAME, node.path);
    await window.opal.writeFile(path, text);
    await reloadTree();
    openFolder(node.path);
  } catch (err) {
    alert(`Couldn't add the exam tracker.\n\n${err.message}`);
  }
}

// ---------- The corkboard home ----------
//
// The vault's home page as a pinboard (src/home/corkboard.js). Switch it off
// in Settings › Appearance, or right-click the frame, for the classic home.

async function showCorkboard() {
  homeStickies = null;
  viewEl.scrollTop = 0;
  const quotes = await loadQuotes();
  if (screen.kind !== 'home' || screen.folderPath) return;
  if (corkboard) corkboard.destroy();
  corkboard = new Corkboard(viewEl, {
    openFidget: (id) => FIDGET_PAGES[id] && FIDGET_PAGES[id](),
    openFolder: (path) => openFolder(path),
    openDay: (year, month, day) => showCalendar(new Date(year, month, day)),
    loadMonth: loadMonthEvents,
    loadToday: async () => {
      const today = todayKey();
      return (await loadAllTasks()).filter((t) => t.due === today);
    },
    toggleTask: (task) => toggleTaskDone(task),
    quickList: {
      load: async () => parseTasks((await readTaskList(QUICK_LIST)) || '', QUICK_LIST),
      add: (title) => editQuickList((text, tasks) => {
        const task = { title, done: false, details: [], subtasks: [] };
        if (!tasks.length) return addTask(text, task, QUICK_LIST);
        const lines = text.split(/\r?\n/);
        lines.splice(tasks[tasks.length - 1].end, 0, ...formatTask(task)); // new lines go at the bottom
        return lines.join('\n');
      }),
      toggle: (task) => toggleTaskDone(task),
      rename: (task, title) => editQuickList((text) => replaceTask(text, task, { ...task, title })),
      remove: (task) => editQuickList((text) => replaceTask(text, task, null)),
      clearDone: () => editQuickList((text, tasks) => tasks.filter((t) => t.done).reverse().reduce((t, task) => replaceTask(t, task, null), text)),
    },
    folders: () => tree.filter((n) => n.type === 'folder' && !n.name.startsWith('.')).map((n) => ({
      name: n.name,
      path: n.path,
      subfolders: n.children.filter((c) => c.type === 'folder').map((c) => c.name),
      notes: countNotes(n),
    })),
    quotes: () => quotes,
    taskMenu: (event, task, after) => taskMenu(event, task, after),
    quoteMenu: (event, quote, next) => showMenu(event, {
      title: 'Quote',
      items: [
        { label: 'Another quote', onSelect: next },
        { label: 'Copy the quote', onSelect: () => window.opal.copyText(`“${quote.text}”${quote.who ? ` — ${quote.who}` : ''}`) },
        'separator',
        { label: 'Edit quotes…', hint: QUOTES_PATH, onSelect: () => editQuotes() },
      ],
    }),
    onMenu: (event) => showMenu(event, {
      items: [
        { label: 'New note', onSelect: () => newNote('') },
        { label: 'New folder', onSelect: () => newFolder('') },
        'separator',
        { label: 'Classic home page', hint: 'folders and widgets', onSelect: () => setHomeStyle('classic') },
      ],
    }),
  });
  addButton.refresh();
}

// The short to-do list on the receipt's tear-off stub: an ordinary task list.
const QUICK_LIST = 'Quick list';
async function editQuickList(change) {
  const text = (await readTaskList(QUICK_LIST)) || '';
  await writeTaskList(QUICK_LIST, change(text, parseTasks(text, QUICK_LIST)));
}

// The quotes on the corkboard: blockquotes in Quotes.md, each with its author
// on a last "— who" line. Until that note exists, the built-in four.
const QUOTES_PATH = 'Quotes.md';
function parseQuotes(text) {
  const out = [];
  for (const block of String(text || '').split(/\n\s*\n/)) {
    const lines = block.split(/\r?\n/).filter((l) => /^\s*>/.test(l)).map((l) => l.replace(/^\s*>\s?/, '').trim()).filter(Boolean);
    if (!lines.length) continue;
    const last = lines[lines.length - 1];
    const by = /^[—–-]\s*(.+)$/.exec(last);
    const body = (by ? lines.slice(0, -1) : lines).join(' ').replace(/^[“"]|[”"]$/g, '').trim();
    if (body) out.push({ text: body, who: by ? by[1].trim() : '' });
  }
  return out;
}
async function loadQuotes() {
  const text = await readNoteOrNull(QUOTES_PATH);
  const list = text ? parseQuotes(text) : [];
  if (list.length) return list;
  return Array.isArray(vaultSettings.homeQuotes) ? vaultSettings.homeQuotes : [];
}
async function editQuotes() {
  if (!findFile(tree, QUOTES_PATH)) {
    const text = `# Quotes\n\nThe quotes on the home page's card. Each is a quote block, with who said it on its last line.\n\n${DEFAULT_QUOTES.map((q) => `> ${q.text}\n> — ${q.who}`).join('\n\n')}\n`;
    const path = await window.opal.createNote('Quotes', '');
    await window.opal.writeFile(path, text);
    await reloadTree();
  }
  openFile(QUOTES_PATH);
}

// Right-click on anything that opens a note, folder, fidget or day: its menu.
// (Those elements say what they open with data-open-path / -day / -fidget.)
function openerMenu(event) {
  const el = event.target.closest('[data-open-path], [data-open-day], [data-open-fidget]');
  if (!el || !viewEl.contains(el)) return;
  event.preventDefault();
  event.stopPropagation();
  if (el.dataset.openFidget) return fidgetMenu(event, el.dataset.openFidget);
  if (el.dataset.openDay) return dayMenu(event, el.dataset.openDay);
  const path = el.dataset.openPath;
  const node = el.dataset.openKind === 'folder' ? findFolder(tree, path, vault.name) : findFile(tree, path);
  if (node) colorMenu(event, node, el.dataset.openKind === 'folder' ? 'folder' : 'file');
}
viewEl.addEventListener('contextmenu', openerMenu, true);

function fidgetMenu(event, id) {
  const f = FIDGETS.find((x) => x.id === id);
  const open = FIDGET_PAGES[id];
  if (!open) return;
  showMenu(event, {
    title: f ? f.name : id,
    items: [
      { label: 'Open', onSelect: () => open() },
      { label: 'Open in new tab', hint: '⌘-click', onSelect: () => inNewTab(() => open()) },
      'separator',
      { label: 'Fidget settings…', onSelect: () => showSettings('parts') },
    ],
  });
}

function dayMenu(event, key) {
  const note = findFile(tree, dayPath(key));
  const date = keyToDate(key);
  showMenu(event, {
    title: date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }),
    items: [
      { label: 'Open in Calendar', onSelect: () => showCalendar(date) },
      { label: 'Open in new tab', hint: '⌘-click', onSelect: () => inNewTab(() => showCalendar(date)) },
      note ? 'separator' : null,
      note ? { label: 'Open the day note', onSelect: () => openFile(note.path) } : null,
      note ? { label: 'Show in Finder', onSelect: () => window.opal.revealInFinder(note.path) } : null,
    ],
  });
}

// A task (on the corkboard's receipt or to-do stub): tick, rename, open its list, delete.
function taskMenu(event, task, after = () => {}) {
  const listPath = taskListPath(task.list);
  const change = async (fn) => {
    try {
      const text = (await readTaskList(task.list)) || '';
      await writeTaskList(task.list, fn(text));
    } catch (err) {
      alert(`Couldn't change the task.\n\n${err.message}`);
    }
    after();
  };
  showMenu(event, {
    title: task.title,
    items: [
      { label: task.done ? 'Untick' : 'Tick', onSelect: () => change((text) => toggleTask(text, task)) },
      { label: 'Rename…', onSelect: async () => {
        const next = await askName('Rename the task', 'New name, then Enter', task.title);
        if (next && next.trim() && next.trim() !== task.title) change((text) => replaceTask(text, task, { ...task, title: next.trim() }));
      } },
      'separator',
      { label: `Open “${task.list}”`, onSelect: () => openFile(listPath) },
      { label: 'Open in new tab', onSelect: () => inNewTab(() => openFile(listPath)) },
      { label: 'Open Tasks', onSelect: () => showTasks() },
      'separator',
      { label: 'Delete the task', danger: true, onSelect: () => {
        if (confirm(`Delete “${task.title}”?`)) change((text) => replaceTask(text, task, null));
      } },
    ],
  });
}

async function setHomeStyle(style) {
  await saveVaultSettings({ homeStyle: style });
  if (screen.kind === 'home' && !screen.folderPath) showHome('');
}

// Every event in a month for the corkboard calendar: { day: [{ text, color, cont }] }.
async function loadMonthEvents(year, month) {
  const days = new Date(year, month + 1, 0).getDate();
  const keys = Array.from({ length: days }, (_, i) => dayKey(new Date(year, month, i + 1)));
  const lists = await Promise.all(keys.map((key) => loadDayEvents(key).catch(() => [])));
  const byDay = {};
  const add = (day, entry) => (byDay[day] = byDay[day] || []).push(entry);
  lists.forEach((events, i) => {
    events.sort((a, b) => a.start - b.start).forEach((ev) => {
      const color = colorHex(ev.primary);
      add(i + 1, { text: ev.title || ev.text, color });
      if (ev.endDay) {
        for (let d = i + 2; d <= days && keys[d - 1] <= ev.endDay; d++) add(d, { text: ev.title || ev.text, color, cont: true });
      }
    });
  });
  return byDay;
}

// ---------- Bookmarks ----------
//
// In .obsidian/bookmarks.json (Obsidian's format — see bookmarks.js and main.js).

let bookmarksData = { items: [] };

async function loadBookmarks() {
  bookmarksData = vault ? await window.opal.readBookmarks().catch(() => ({ items: [] })) : { items: [] };
  bookmarksChanged();
}

async function saveBookmarks() {
  bookmarksChanged();
  try {
    await window.opal.writeBookmarks(bookmarksData);
  } catch (err) {
    alert(`Couldn't save the bookmarks.\n\n${err.message}`);
  }
}

// Everything showing bookmarks picks up the change.
function bookmarksChanged() {
  sidebar.setBookmarks(vault ? bookmarksData.items || [] : null);
  if (current && current.noteView && current.noteView.setBookmarked) current.noteView.setBookmarked(isBookmarked(bookmarksData, { type: 'file', path: current.filePath }));
  if (homeWidgets) homeWidgets.reload();
}

// What a bookmark of this note, file or folder looks like ({ type, path }).
function bookmarkTarget(path, isFolder) {
  if (isFolder) return path ? { type: 'folder', path } : null;
  return { type: 'file', path };
}

async function toggleBookmarkOf(target) {
  if (!target) return;
  // Read them again first, so a change made in Obsidian isn't overwritten.
  bookmarksData = await window.opal.readBookmarks().catch(() => bookmarksData);
  toggleBookmark(bookmarksData, target);
  await saveBookmarks();
}

function openBookmark(item, event = {}) {
  const open = () => {
    if (item.type === 'file') {
      if (!findFile(tree, item.path)) return alert(`Can't find “${item.path}” any more.`);
      return openFile(item.path);
    }
    if (item.type === 'folder') return openFolder(item.path);
    if (item.type === 'url') return window.opal.openWebLink(item.url).catch((err) => alert(err.message));
    if (item.type === 'search') return startSearch('text');
    return undefined;
  };
  return event.metaKey && item.type !== 'url' ? inNewTab(open) : open();
}

function bookmarkIo() {
  return {
    data: () => bookmarksData,
    save: () => saveBookmarks(),
    open: (item, event) => openBookmark(item, event),
    exists: (item) => (item.type === 'file' ? Boolean(findFile(tree, item.path)) : item.type === 'folder' ? Boolean(findFolder(tree, item.path, vault.name)) : true),
  };
}

async function showBookmarks(anchor) {
  if (!vault) return;
  await loadBookmarks(); // Obsidian may have changed them
  const place = currentPlace();
  let target = null;
  if (place && place.kind === 'note') target = { target: bookmarkTarget(place.filePath, false), title: noteName(place.filePath) };
  else if (place && place.kind === 'home' && place.folderPath) target = { target: bookmarkTarget(place.folderPath, true), title: place.folderPath.split('/').pop() };
  openBookmarksPanel(anchor, { io: bookmarkIo(), current: target, onToggleCurrent: () => toggleBookmarkOf(target.target) });
}

// ---------- Home page widgets ----------
//
// The vault's own page has widgets (home-widgets.js). Which ones, in what
// order and size, is the `opal-home` list in the vault's hidden .opal.md.

async function readHomeLayout() {
  const text = await window.opal.readFolderSettings('').catch(() => '');
  return readProperties(text)['opal-home'] || null;
}

async function saveHomeLayout(items) {
  try {
    const text = await window.opal.readFolderSettings('');
    await window.opal.writeFolderSettings('', writeProperty(text, 'opal-home', formatLayout(items), 'text'));
  } catch (err) {
    alert(`Couldn't save the home page layout.\n\n${err.message}`);
  }
}

async function mountHomeWidgets(slot) {
  const layout = await readHomeLayout();
  if (!slot.isConnected) return;
  if (homeWidgets) homeWidgets.destroy();
  homeWidgets = new HomeWidgets(slot, {
    layout,
    editing: homeEditing,
    io: {
      saveLayout: (items) => saveHomeLayout(items),
      onEditing: (on) => { homeEditing = on; },
      files: () => flattenFiles(tree),
      openFile: (path) => openFile(path),
      openFolder: (path) => openFolder(path),
      openCalendarDay: (key) => {
        calendarState = { ...calendarState, mode: 'day' };
        showCalendar(keyToDate(key));
      },
      openTasks: () => showTasks(),
      openReview: () => showReview(),
      openSettings: (section) => showSettings(section),
      loadDayEvents,
      loadTasks: loadAllTasks,
      toggleTask: toggleTaskDone,
      listCards: () => window.opal.listCards(),
      readLogbook: () => window.opal.readLogbook(),
      readFile: (path) => window.opal.readFile(path),
      timer: prepTimer,
      bookmarks: bookmarkIo(),
      trackerNotes: () => window.opal.trackerNotes(),
      trackerData: (source) => window.opal.trackerData(source),
      heatmapChoice: async () => getProp(await window.opal.readFolderSettings('').catch(() => ''), 'opal-home-heatmap') || null,
      setHeatmapChoice: async (path) => {
        const text = await window.opal.readFolderSettings('').catch(() => '');
        await window.opal.writeFolderSettings('', setProp(text, 'opal-home-heatmap', JSON.stringify(path)));
      },
      makeHeatmapNote: async () => {
        const path = await window.opal.createNote('Exercise heatmap', '');
        const existing = await window.opal.readFile(path).catch(() => '');
        if (!existing.trim()) {
          await window.opal.writeFile(path, '# Exercise heatmap\n\nEvery day note in the Calendar folder that mentions #exercise is a square here. Click the heatmap to change what it counts.\n\n```tracker\nsearchType: tag\nsearchTarget: exercise\nfolder: Calendar\ndatasetName: Exercise\nmonth:\n    color: green\n```\n');
        }
        await reloadTree();
        if (homeWidgets) homeWidgets.reload();
      },
    },
  });
}

// Settings → Home page: every widget with a switch and a size.
let homeLayoutForSettings = [];
function homeSettingsSection() {
  return {
    id: 'home',
    label: 'Home page',
    icon: 'grid',
    title: 'Home page.',
    desc: 'The widgets on your vault’s home page. You can also arrange them there with Customize (drag to reorder).',
    render: () => {
      const items = homeLayoutForSettings;
      const save = async () => {
        await saveHomeLayout(items);
        drawSettings();
      };
      const rows = WIDGETS.map((w) => {
        const item = items.find((i) => i.id === w.id);
        const size = h('select', { class: 'set-select', 'aria-label': `${w.name} size`, disabled: !item || null },
          [['small', 'Small'], ['wide', 'Wide'], ['full', 'Full width']].map(([v, label]) => h('option', { value: v, selected: (item ? item.size : w.size) === v || null }, label)));
        size.addEventListener('change', () => {
          if (item) item.size = size.value;
          save();
        });
        const on = h('button', {
          class: `set-toggle${item ? ' is-on' : ''}`,
          role: 'switch',
          'aria-checked': String(Boolean(item)),
          'aria-label': `Show ${w.name}`,
          onclick: () => {
            if (item) items.splice(items.indexOf(item), 1);
            else items.push({ id: w.id, size: size.value });
            save();
          },
        }, h('span', { class: 'set-toggle-knob' }));
        return h('div', { class: 'set-row' },
          h('div', { class: 'set-info' }, h('span', { class: 'set-name' }, w.name), h('span', { class: 'set-desc' }, w.desc)),
          h('div', { class: 'set-control' }, size, on));
      });
      return [
        ...rows,
        h('div', { class: 'set-buttons', style: 'margin-top: 18px' },
          h('button', { class: 'set-btn', onclick: () => openFolder('') }, 'Open the home page'),
          h('button', { class: 'set-btn', onclick: () => { homeLayoutForSettings = parseLayout(null); save(); } }, 'Reset to the default widgets')),
      ];
    },
  };
}

// A folder home's stickies are kept in the folder's hidden settings file
// (School/.opal.md), made the first time one is added.
// Writes wait a moment so a burst of typing becomes one save.
function folderHomeStickies(folderPath, folder, home) {
  const read = () => window.opal.readFolderSettings(folderPath).catch(() => '');
  let latest = null;
  let timer = null;
  let writing = Promise.resolve();

  const flush = () => {
    clearTimeout(timer);
    if (!latest) return writing;
    const list = latest;
    latest = null;
    writing = writing.then(async () => {
      await window.opal.writeFolderSettings(folderPath, writeStickies(await read(), list));
    }).catch((err) => alert(`Opal couldn't save the sticky notes.\n\n${err.message}`));
    return writing;
  };

  const layer = new StickyLayer(home, {
    load: async () => parseStickies(await read()),
    save: (list) => {
      latest = list;
      clearTimeout(timer);
      timer = setTimeout(flush, 400);
    },
  });
  layer.refresh();
  return { layer, flush };
}

async function showNote(filePath) {
  homeStickies = null;
  leaveCalendar();
  let EditorType = await editorForFile(filePath);
  if (!EditorType) {
    showHome(parentOf(filePath), `Opal can't open this kind of file yet: ${filePath}`);
    return;
  }
  if (!EditorType.editsText) {
    await showViewer(filePath, EditorType);
    return;
  }

  let content;
  try {
    content = await window.opal.readFile(filePath);
  } catch (err) {
    showHome(parentOf(filePath), `Could not open ${filePath}: ${err.message}`);
    return;
  }
  if (!findFile(tree, filePath)) await reloadTree();
  // A flow sheet (opal-type: flow) opens as speaker columns.
  if (isFlowNote(content)) EditorType = FlowEditor;

  screen = { kind: 'note', filePath };
  viewEl.scrollTop = 0;
  const noteView = new NoteView(viewEl, {
    filePath,
    vaultName: vault.name,
    onOpenFile: (p) => openFile(p),
    onOpenFolder: (p) => openFolder(p),
    onOpenLink: (target) => openLink(target),
    onNewNoteHere: (at) => newNote(parentOf(filePath), at),
    onPalettes: () => showSettings('appearance'),
    onGoToLine: (line) => current && current.editor.goToLine && current.editor.goToLine(line),
    onAddSticky: () => current && current.stickies && current.stickies.add(viewEl.scrollTop - noteView.center.offsetTop),
    onInsertTable: (rows, cols) => current && current.editor.insertTable && current.editor.insertTable(rows, cols),
    onRename: (newName, options) => renameOpenNote(filePath, newName, options),
    onDescribe: (text) => describeOpenNote(filePath, text),
    onHistory: () => showHistory(filePath),
    onTemplate: (anchor) => chooseTemplateFor(filePath, anchor),
    onBookmark: () => toggleBookmarkOf(bookmarkTarget(filePath, false)),
    onExport: (anchor) => exportMenu(filePath, anchor),
    onWordTarget: (target) => {
      if (!current || current.filePath !== filePath) return;
      current.editor.replaceText(setProp(current.editor.getText(), 'word-target', target ? String(target) : null));
    },
    onOpenAt: async (path, line) => {
      await openFile(path);
      if (current && current.filePath === path && current.editor.goToLine) current.editor.goToLine(line);
    },
    onLinkMention: async (hit) => {
      try {
        await window.opal.linkMention(hit.path, hit.line, hit.column, filePath);
      } catch (err) {
        alert(`Couldn't add the link.\n\n${err.message}`);
      }
      loadBacklinks();
  showWordCount();
    },
    onSetColor: (path, kind, color) => setItemColor(path, kind, color),
  });

  let changeTimer = null;
  let keptOriginal = false;
  let lastWords = countWords(content); // for words written today (the Logbook)
  const editor = new EditorType({
    parent: noteView.editorHost,
    content,
    save: async (text) => {
      // Version history: the note as it was before this visit's first edit,
      // then at most one snapshot every 10 minutes (main decides).
      if (!keptOriginal) {
        keptOriginal = true;
        await window.opal.saveSnapshot(filePath, content, 'auto').catch(() => {});
      }
      await window.opal.writeFile(filePath, text);
      if (current && current.editor === editor) current.edited = true;
      // Words written: what was added since the last save (never less than 0).
      const words = countWords(text);
      if (words > lastWords) window.opal.addWords(dayKey(new Date()), words - lastWords).catch(() => {});
      lastWords = words;
      noteSaved(filePath);
      window.opal.saveSnapshot(filePath, text, 'auto').catch(() => {});
    },
    onStatus: (status) => chrome.setStatus(status),
    onOpenLink: (target) => openLink(target),
    onOpenHref: (href) => openHref(href, filePath),
    linkTargets: () => linkTargets(),
    findLink: (target) => window.opal.findLink(target),
    saveImage: (ext, bytes) => window.opal.saveAttachment(filePath, ext, bytes),
    heatmap: { load: (source) => window.opal.trackerData(source), openFile: (path) => openFile(path) },
    onExport: (data) => exportFlow(noteName(filePath), data),
    onLeaveFlow: () => changeOpenNote(filePath, fromFlowText),
    onCursor: () => {
      noteView.ribbon.refresh();
      showWordCount();
    },
    onChange: () => {
      clearTimeout(changeTimer);
      changeTimer = setTimeout(() => {
        if (!current || current.editor !== editor) return;
        noteView.setText(editor.getText());
        current.stickies.refresh();
      }, 150);
    },
  });
  // Stickies on a note are saved into the note itself, like typing.
  const stickies = new StickyLayer(noteView.center, {
    load: () => editor.getStickies(),
    save: (list) => editor.setStickies(list),
  });
  stickies.refresh();
  noteView.connectEditor(editor.view);
  current = { filePath, editor, noteView, stickies };
  addButton.refresh();
  noteView.setBookmarked(isBookmarked(bookmarksData, { type: 'file', path: filePath }));
  loadBacklinks();
  noteView.setTree(tree);
  noteView.setText(content);

  chrome.setStatus('Saved');
  setTitle(noteName(filePath));
  showCrumbs([...crumbsFor(parentOf(filePath)), { label: noteName(filePath) }]);
  sidebar.setActive('file', filePath);
}

// PDFs, pictures, media and Office files: view-only.
async function showViewer(filePath, ViewerType) {
  if (!findFile(tree, filePath)) await reloadTree();
  const node = findFile(tree, filePath);
  if (!node) {
    showHome(parentOf(filePath), `Can't find ${filePath} any more.`);
    return;
  }

  screen = { kind: 'note', filePath };
  viewEl.scrollTop = 0;
  const fileView = new FileView(viewEl, {
    filePath,
    vaultName: vault.name,
    onOpenFile: (p) => openFile(p),
    onOpenFolder: (p) => openFolder(p),
    onSetColor: (path, kind, color) => setItemColor(path, kind, color),
  });
  const viewer = new ViewerType({
    parent: fileView.viewerHost,
    filePath,
    url: fileUrl(filePath, node.modified),
    onStatus: (status) => chrome.setStatus(status),
  });
  current = { filePath, editor: viewer, noteView: fileView, modified: node.modified };
  fileView.setTree(tree);

  chrome.setStatus('Saved');
  setTitle(noteName(filePath));
  showCrumbs([...crumbsFor(parentOf(filePath)), { label: noteName(filePath) }]);
  sidebar.setActive('file', filePath);
}

// ---------- Moving around ----------

function openFolder(folderPath) {
  return navigate(async () => {
    if (!findFolder(tree, folderPath, vault.name)) await reloadTree();
    showHome(folderPath);
  });
}

function openFile(filePath) {
  if (kindOf(filePath) === 'ledger') return showMoney(); // the Money page shows the Ledger files
  if (current && current.filePath === filePath && !wantsNewTab()) return Promise.resolve();
  return navigate(() => showNote(filePath));
}

// ---------- Settings ----------

// This vault's settings (.opal/settings.json), with defaults filled in.
let vaultSettings = withDefaults({});
let settingsSection = 'appearance';

async function loadVaultSettings() {
  vaultSettings = withDefaults(vault ? await window.opal.readOpalJson('settings.json').catch(() => ({})) : {});
  settingsChanged();
}

// Changes some of this vault's settings and saves them.
async function saveVaultSettings(patch) {
  vaultSettings = withDefaults({ ...vaultSettings, ...patch });
  settingsChanged();
  try {
    await window.opal.writeOpalJson('settings.json', vaultSettings);
  } catch (err) {
    alert(`Couldn't save the settings.\n\n${err.message}`);
  }
  drawSettings();
}

// Everything that uses a setting picks up the new values.
function settingsChanged() {
  prepTimer.setPomodoro(vaultSettings.pomodoro);
}

function showSettings(section) {
  if (!vault) return Promise.resolve();
  if (section) settingsSection = section;
  return navigate(async () => {
    homeStickies = null;
    leaveCalendar();
    screen = { kind: 'settings' };
    setTitle('Settings');
    sidebar.setActive(null, null);
    showCrumbs([{ label: vault.name, onClick: () => openFolder('') }, { label: 'Settings' }]);
    viewEl.scrollTop = 0;
    appInfo = appInfo || await window.opal.appInfo().catch(() => null);
    homeLayoutForSettings = parseLayout(await readHomeLayout());
    drawSettings();
  });
}

let appInfo = null;
function drawSettings() {
  if (screen.kind !== 'settings') return;
  const scrollTop = viewEl.scrollTop;
  renderSettings(viewEl, {
    section: settingsSection,
    look: currentLook(),
    palette: paletteName,
    settings: vaultSettings,
    info: appInfo,
    extraSections: [homeSettingsSection()],
    io: {
      setSection: (id) => {
        settingsSection = id;
        viewEl.scrollTop = 0;
        drawSettings();
      },
      setLook: async (change) => {
        try {
          applyTheme(await window.opal.setLook(change));
        } catch (err) {
          alert(`Couldn't change the theme.\n\n${err.message}`);
        }
        drawSettings();
      },
      setPalette: async (name) => {
        paletteName = await window.opal.setPalette(name);
        applyPalette(paletteName);
        drawSettings();
      },
      saveSettings: (patch) => saveVaultSettings(patch),
      switchVault: () => window.opal.chooseVault(),
      revealVault: () => window.opal.revealFolder(''),
    },
  });
  viewEl.scrollTop = scrollTop;
}

// ---------- Calendar ----------

// Undo / redo for the calendar. Each change the calendar makes is one step:
// the files it touched and what they said before (null = the file didn't
// exist yet). Undo writes those back; nothing is kept outside the notes
// except this list, which lives only while Opal is open.
const calendarUndo = { undo: [], redo: [], step: null };

async function readOrNull(path) {
  try {
    return await window.opal.readFile(path);
  } catch {
    return null;
  }
}

// Called just before the calendar writes a file during a step.
async function rememberForUndo(path) {
  const { step } = calendarUndo;
  if (step && !step.has(path)) step.set(path, await readOrNull(path));
}

// Runs fn as one undoable step.
async function recordCalendarStep(fn) {
  const step = new Map();
  calendarUndo.step = step;
  try {
    await fn();
  } finally {
    calendarUndo.step = null;
    if (step.size) {
      calendarUndo.undo.push(step);
      if (calendarUndo.undo.length > 100) calendarUndo.undo.shift();
      calendarUndo.redo = [];
    }
  }
}

// Puts files back as a step remembers them; → the step that reverses it.
async function restoreFiles(step) {
  const back = new Map();
  for (const [path, text] of step) {
    back.set(path, await readOrNull(path));
    if (text === null) {
      if (findFile(tree, path) || (await readOrNull(path)) !== null) await window.opal.trashFile(path);
    } else {
      await window.opal.createFolder(path.split('/').slice(0, -1).join('/'), '');
      await window.opal.writeFile(path, text);
    }
  }
  await reloadTree();
  reminders.refresh();
  return back;
}

// → true if there was something to undo (or redo).
async function undoCalendar(redo = false) {
  const from = redo ? calendarUndo.redo : calendarUndo.undo;
  const to = redo ? calendarUndo.undo : calendarUndo.redo;
  const step = from.pop();
  if (!step) return false;
  to.push(await restoreFiles(step));
  return true;
}

function showCalendar(date) {
  if (!vault) return Promise.resolve();
  return navigate(async () => {
    homeStickies = null;
    leaveCalendar();
    if (date) calendarState = { ...calendarState, date };
    screen = { kind: 'calendar' };
    setTitle('Calendar');
    sidebar.setActive(null, null);
    showCrumbs([{ label: vault.name, onClick: () => openFolder('') }, { label: 'Calendar' }]);
    viewEl.scrollTop = 0;
    calendar = new CalendarView(viewEl, {
      date: calendarState.date,
      mode: calendarState.mode,
      openReview: () => showReview(),
      readDay: async (key) => {
        try {
          return await window.opal.readFile(dayPath(key));
        } catch {
          return null;
        }
      },
      writeDay: async (key, text) => {
        await rememberForUndo(dayPath(key));
        await window.opal.createFolder(CALENDAR_FOLDER, '');
        const isNew = !findFile(tree, dayPath(key));
        const path = await window.opal.createNote(key, CALENDAR_FOLDER, 'default');
        // A new day note starts from the daily template; the event goes below it.
        if (isNew) {
          const fromTemplate = await window.opal.readFile(path).catch(() => '');
          if (fromTemplate.trim() && !text.startsWith(fromTemplate)) text = `${fromTemplate.replace(/\s*$/, '')}\n\n${text.replace(/^\s+/, '')}`;
        }
        await window.opal.writeFile(path, text);
        reminders.refresh();
      },
      noteDays: () => {
        const folder = findFolder(tree, CALENDAR_FOLDER, vault.name);
        const keys = new Set();
        for (const node of folder ? folder.children : []) {
          const match = node.type === 'file' && /^(\d{4}-\d{2}-\d{2})\.md$/i.exec(node.name);
          if (match) keys.add(match[1]);
        }
        return keys;
      },
      openDayNote: async (key) => {
        await window.opal.createFolder(CALENDAR_FOLDER, '');
        const path = await window.opal.createNote(key, CALENDAR_FOLDER, 'default');
        openFile(path);
      },
      readRepeats: async () => {
        if (!findFile(tree, REPEATS_PATH)) return '';
        try {
          return await window.opal.readFile(REPEATS_PATH);
        } catch {
          return '';
        }
      },
      writeRepeats: async (text) => {
        await rememberForUndo(REPEATS_PATH);
        await window.opal.createFolder(CALENDAR_FOLDER, '');
        const path = await window.opal.createNote(REPEATS_NAME, CALENDAR_FOLDER);
        await window.opal.writeFile(path, text);
        reminders.refresh();
      },
      openLink: (target) => openLink(target),
      loadTasks: loadDueTasks,
      toggleTask: toggleTaskDone,
      deleteTask: async (task) => {
        const text = (await readTaskList(task.list)) || '';
        await writeTaskList(task.list, replaceTask(text, task, null));
      },
      addTask: async ({ title, due, startDate, time, endTime, primary, secondary }) => {
        const text = (await readTaskList(DEFAULT_LIST)) || '';
        const task = { title, done: false, due, startDate, time, endTime, starred: false, repeat: null, doneOn: null, details: [], subtasks: [], primary, secondary };
        await writeTaskList(DEFAULT_LIST, addTask(text, task, DEFAULT_LIST));
      },
      updateTask: async (task, patch) => {
        const text = (await readTaskList(task.list)) || '';
        await writeTaskList(task.list, replaceTask(text, task, { ...task, ...patch }));
      },
      openTasks: () => showTasks(),
      recordStep: recordCalendarStep,
      undo: undoCalendar,
      onChange: (state) => { calendarState = state; },
    });
    calendar.setCardsDue(cardsDueCount);
  });
}

// ---------- Tasks ----------

function taskListNodes() {
  const folder = findFolder(tree, TASKS_FOLDER, vault.name);
  return folder ? folder.children.filter((n) => n.type === 'file' && /\.md$/i.test(n.name)) : [];
}

function taskListPath(name) {
  const node = taskListNodes().find((n) => n.name.slice(0, -3).toLowerCase() === name.toLowerCase());
  return node ? node.path : `${TASKS_FOLDER}/${name}.md`;
}

async function readTaskList(name) {
  try {
    return await window.opal.readFile(taskListPath(name));
  } catch {
    return null;
  }
}

async function writeTaskList(name, text) {
  await rememberForUndo(taskListPath(name));
  const known = taskListNodes().some((n) => n.name.slice(0, -3).toLowerCase() === name.toLowerCase());
  await window.opal.createFolder(TASKS_FOLDER, '');
  const path = await window.opal.createNote(name, TASKS_FOLDER);
  await window.opal.writeFile(path, text);
  if (!known) await reloadTree();
  else reminders.refresh();
}

// Every task with a due date, from every list (for the calendar).
async function loadDueTasks() {
  const lists = await Promise.all(taskListNodes().map(async (n) => {
    const name = n.name.slice(0, -3);
    return parseTasks((await readTaskList(name)) || '', name);
  }));
  return lists.flat().filter((t) => t.due);
}

async function toggleTaskDone(task) {
  const text = (await readTaskList(task.list)) || '';
  await writeTaskList(task.list, toggleTask(text, task));
}

function showTasks() {
  if (!vault) return Promise.resolve();
  return navigate(async () => {
    homeStickies = null;
    leaveCalendar();
    screen = { kind: 'tasks' };
    setTitle('Tasks');
    sidebar.setActive(null, null);
    showCrumbs([{ label: vault.name, onClick: () => openFolder('') }, { label: 'Tasks' }]);
    viewEl.scrollTop = 0;
    tasksView = new TasksView(viewEl, {
      // "My Tasks" first, like Google Tasks; the rest alphabetically.
      listNames: () => taskListNodes().map((n) => n.name.slice(0, -3)).sort((a, b) => (b === 'My Tasks') - (a === 'My Tasks') || a.localeCompare(b)),
      readList: readTaskList,
      writeList: writeTaskList,
      renameList: async (name, next) => {
        await window.opal.renameNote(taskListPath(name), next);
        await reloadTree();
      },
      deleteList: async (name) => {
        await window.opal.trashNote(taskListPath(name));
        await reloadTree();
      },
    });
  });
}

// ---------- Inbox ----------

async function readNoteOrNull(path) {
  if (!findFile(tree, path)) return null;
  try {
    return await window.opal.readFile(path);
  } catch {
    return null;
  }
}

async function writeInbox(text) {
  const known = Boolean(findFile(tree, INBOX_PATH));
  const path = await window.opal.createNote('Inbox', '');
  await window.opal.writeFile(path, text);
  if (!known) await reloadTree();
  else updateInboxCount();
}

// Every task in every list (open and done).
async function loadAllTasks() {
  const lists = await Promise.all(taskListNodes().map(async (n) => {
    const name = n.name.slice(0, -3);
    return parseTasks((await readTaskList(name)) || '', name);
  }));
  return lists.flat();
}

// One day's events: its day note plus repeating events that land on it.
async function loadDayEvents(key) {
  const [dayText, repeats] = await Promise.all([readNoteOrNull(dayPath(key)), readNoteOrNull(REPEATS_PATH)]);
  return [...parseEvents(dayText || '', key), ...occurrences(parseSeries(repeats || ''), key)];
}

// The number on the Inbox button: captured items + overdue + due today.
let inboxCountTimer = null;
function updateInboxCount() {
  if (!INBOX_ENABLED) return;
  clearTimeout(inboxCountTimer);
  inboxCountTimer = setTimeout(async () => {
    if (!vault) {
      chrome.setInboxCount(0);
      return;
    }
    try {
      const today = todayKey();
      const [inbox, tasks] = await Promise.all([readNoteOrNull(INBOX_PATH), loadAllTasks()]);
      const captured = parseTasks(inbox || '', 'Inbox').filter((t) => !t.done).length;
      const due = tasks.filter((t) => !t.done && t.due && t.due <= today).length;
      chrome.setInboxCount(captured + due);
    } catch {
      // Try again on the next change.
    }
  }, 300);
}

function showInbox() {
  if (!vault || !INBOX_ENABLED) return Promise.resolve();
  return navigate(async () => {
    homeStickies = null;
    leaveCalendar();
    screen = { kind: 'inbox' };
    setTitle('Inbox');
    sidebar.setActive(null, null);
    showCrumbs([{ label: vault.name, onClick: () => openFolder('') }, { label: 'Inbox' }]);
    viewEl.scrollTop = 0;
    inboxView = new InboxView(viewEl, {
      cardsDue: async () => countDue(await window.opal.listCards()),
      openReview: () => showReview(),
      readInbox: () => readNoteOrNull(INBOX_PATH),
      writeInbox,
      loadTasks: loadAllTasks,
      listNames: () => {
        const names = taskListNodes().map((n) => n.name.slice(0, -3));
        return names.sort((a, b) => (b === DEFAULT_LIST) - (a === DEFAULT_LIST) || a.localeCompare(b));
      },
      toggleTask: toggleTaskDone,
      addToList: async (list, task) => {
        const text = (await readTaskList(list)) || '';
        await writeTaskList(list, addTask(text, task, list));
      },
      openTasks: () => showTasks(),
      loadEvents: loadDayEvents,
      openCalendarDay: (key) => {
        calendarState = { ...calendarState, mode: 'day' };
        showCalendar(keyToDate(key));
      },
      loadChecklists: () => window.opal.openCheckboxes(),
      tickChecklist: async (item) => {
        const text = await window.opal.readFile(item.path);
        const lines = text.split(/\r?\n/);
        const nl = /\r\n/.test(text) ? '\r\n' : '\n';
        let index = lines[item.line - 1] === item.raw ? item.line - 1 : lines.indexOf(item.raw);
        if (index === -1) throw new Error('That item was changed somewhere else. The Inbox has been refreshed — try again.');
        lines[index] = lines[index].replace('[ ]', '[x]');
        await window.opal.writeFile(item.path, lines.join(nl));
      },
      openAt: async (path, line) => {
        await openFile(path);
        if (current && current.filePath === path && current.editor.goToLine) current.editor.goToLine(line);
      },
      makeNote: async (name, body) => {
        const path = await window.opal.createNote(name, '');
        const existing = (await window.opal.readFile(path)) || '';
        await window.opal.writeFile(path, existing.trim() ? `${existing.replace(/\s+$/, '')}\n\n${body}\n` : `# ${name}\n\n${body}\n`);
        await reloadTree();
        await openFile(path);
      },
    });
  });
}

// ---------- Debate ----------

// The debate folder: the vault's first folder called "Debate" (nearest the top).
function debateFolder() {
  let level = findFolder(tree, '', vault.name).children;
  while (level.length) {
    const found = level.find((n) => n.type === 'folder' && n.name.toLowerCase() === 'debate');
    if (found) return found;
    level = level.filter((n) => n.type === 'folder').flatMap((n) => n.children);
  }
  return null;
}

function showDebate() {
  if (!vault) return Promise.resolve();
  return navigate(async () => {
    homeStickies = null;
    leaveCalendar();
    screen = { kind: 'debate' };
    setTitle('Debate');
    sidebar.setActive(null, null);
    showCrumbs([{ label: vault.name, onClick: () => openFolder('') }, { label: 'Debate' }]);
    viewEl.scrollTop = 0;
    let folder = debateFolder();
    if (!folder) {
      await window.opal.createFolder('Debate', '');
      await reloadTree();
      folder = debateFolder();
    }
    const folderPath = folder.path;
    // A name not taken yet in a folder ("Name", "Name 2", …).
    const freeName = (dir, name) => {
      const taken = new Set(flattenFiles(tree).map((f) => f.path.toLowerCase()));
      let n = name;
      for (let i = 2; taken.has(`${dir}/${n}.md`.toLowerCase()); i++) n = `${name} ${i}`;
      return n;
    };
    const ensureFolder = async (dir) => {
      const parts = dir.split('/');
      for (let i = 1; i <= parts.length; i++) {
        const sub = parts.slice(0, i).join('/');
        if (!findFolder(tree, sub, vault.name)) await window.opal.createFolder(parts[i - 1], parts.slice(0, i - 1).join('/'));
      }
    };
    debateView = new DebateView(viewEl, {
      page: debateState,
      io: {
        folder: folderPath,
        files: () => {
          const node = findFolder(tree, folderPath, vault.name);
          return node ? flattenFiles(node.children).map((f) => ({ path: f.path, name: f.name })) : [];
        },
        read: (path) => window.opal.readFile(path),
        write: async (path, text) => {
          await window.opal.writeFile(path, text);
        },
        create: async (dir, name, text) => {
          await ensureFolder(dir);
          await reloadTree();
          const path = await window.opal.createNote(freeName(dir, name), dir);
          await window.opal.writeFile(path, text);
          await reloadTree();
          return path;
        },
        move: async (path, dir) => {
          await ensureFolder(dir);
          const next = await window.opal.moveItem(path, 'file', dir);
          await reloadTree();
          return next;
        },
        open: (path) => openFile(path),
        reveal: (path) => window.opal.revealInFinder(path),
        copy: (text) => window.opal.copyText(text),
        trash: async (path) => {
          await (/\.md$/i.test(path) ? window.opal.trashNote(path) : window.opal.trashFile(path));
          await reloadTree();
        },
        startPrep: (minutes) => prepTimer.start(minutes),
        // The page reports { page: { page, path, … } }.
        onChange: (state) => {
          debateState = state && state.page && typeof state.page === 'object' ? state.page : state;
          remember();
        },
      },
    });
  });
}

// ---------- Money ----------

// The fidget tiles at the top of the vault's home page.
const FIDGET_PAGES = { money: () => showMoney(), calendar: () => showCalendar(), tasks: () => showTasks(), debate: () => showDebate(), flashcards: () => showReview() };
function homeFidgets() {
  const order = Object.keys(FIDGET_PAGES);
  return FIDGETS.filter((f) => f.page && !f.off && FIDGET_PAGES[f.id]).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)).map((f, i) => ({
    id: f.id,
    name: f.name === 'Flashcard review' ? 'Review' : f.name,
    icon: f.icon,
    what: f.what,
    sub: f.id === 'flashcards' && cardsDueCount ? `${cardsDueCount} card${cardsDueCount === 1 ? '' : 's'} due` : f.short,
    slot: (i % 5) + 1,
    open: () => FIDGET_PAGES[f.id](),
  }));
}

function showMoney() {
  if (!vault) return Promise.resolve();
  return navigate(async () => {
    homeStickies = null;
    leaveCalendar();
    screen = { kind: 'money' };
    setTitle('Money');
    sidebar.setActive(null, null);
    showCrumbs([{ label: vault.name, onClick: () => openFolder('') }, { label: 'Money' }]);
    viewEl.scrollTop = 0;
    moneyView = new MoneyView(viewEl, {
      month: moneyState.month,
      tab: moneyState.tab,
      io: {
        read: () => window.opal.readLedger(),
        reveal: (path) => window.opal.revealInFinder(path),
        copy: (text) => window.opal.copyText(text),
        writeTransactions: async (text) => {
          await window.opal.writeLedger('transactions', text);
          await reloadTree();
        },
        writeBudget: async (text) => {
          await window.opal.writeLedger('budget', text);
          await reloadTree();
        },
        onChange: (state) => {
          moneyState = state;
          remember();
        },
      },
    });
  });
}

// ---------- Flashcards ----------

function showReview() {
  if (!vault) return Promise.resolve();
  return navigate(async () => {
    homeStickies = null;
    leaveCalendar();
    screen = { kind: 'review' };
    setTitle('Review');
    sidebar.setActive(null, null);
    showCrumbs([{ label: vault.name, onClick: () => openFolder('') }, { label: 'Review' }]);
    viewEl.scrollTop = 0;
    reviewView = new ReviewView(viewEl, {
      io: {
        listCards: () => window.opal.listCards(),
        reviewCard: (path, line, raw, schedule) => window.opal.reviewCard(path, line, raw, schedule),
        openFile: (path) => openFile(path),
        onReviewed: () => updateCardsDue(),
        settings: () => vaultSettings.flashcards || null,
        saveSettings: (flashcards) => saveVaultSettings({ flashcards }),
      },
    });
  });
}

// How many cards are due today: on Review, the calendar's today and the Inbox.
let cardsDueTimer = null;
let cardsDueCount = 0;
function updateCardsDue() {
  clearTimeout(cardsDueTimer);
  cardsDueTimer = setTimeout(async () => {
    if (!vault) return;
    try {
      // Cards in hidden decks (Review › Edit decks) don't count.
      const hidden = new Set(((vaultSettings.flashcards || {}).hidden) || []);
      cardsDueCount = countDue((await window.opal.listCards()).filter((c) => c.decks.some((d) => !hidden.has(d))));
    } catch {
      return;
    }
    chrome.setCardsDue(cardsDueCount);
    if (calendar) calendar.setCardsDue(cardsDueCount);
  }, 400);
}

// ---------- Folder & page colours ----------

// The right-click / double-click menu for a page, file or folder.
function colorMenu(event, node, kind) {
  const at = { clientX: event.clientX, clientY: event.clientY };
  const isFolder = kind === 'folder';
  const isNote = !isFolder && kindOf(node.path) === 'note';
  const name = isFolder ? node.name : noteName(node.path);
  const items = isFolder
    ? [
      { label: 'Open', onSelect: () => openFolder(node.path) },
      { label: 'Open in new tab', hint: '⌘-click', onSelect: () => inNewTab(() => openFolder(node.path)) },
      node.path ? { label: isBookmarked(bookmarksData, bookmarkTarget(node.path, true)) ? 'Remove bookmark' : 'Bookmark', onSelect: () => toggleBookmarkOf(bookmarkTarget(node.path, true)) } : null,
      { label: 'New note here…', onSelect: () => newNote(node.path, at) },
      { label: 'New folder inside…', onSelect: () => newFolder(node.path, at) },
      'separator',
      { label: node.path === CALENDAR_FOLDER ? 'Daily note template…' : 'Default template…', onSelect: () => chooseDefaultTemplate(node.path, at) },
      { label: 'Word target…', hint: node.wordTarget ? node.wordTarget.toLocaleString() : '', onSelect: () => setFolderTarget(node) },
      { label: 'Show as database…', onSelect: () => chooseDatabase(node.path, at) },
      { label: 'Manuscript…', onSelect: () => toggleManuscript(node.path, at) },
      node.path && !node.children.some((c) => c.type === 'file' && c.name === `${TRACKER_NAME}.md`) ? { label: 'Add an exam tracker', hint: 'WACE subjects', onSelect: () => addExamTracker(node) } : null,
      'separator',
      { label: 'Rename…', onSelect: () => renameItem(node, kind) },
      { label: 'Show in Finder', onSelect: () => window.opal.revealFolder(node.path) },
      'separator',
      { label: 'Delete folder…', danger: true, hint: 'to the Trash', onSelect: () => deleteItem(node, kind) },
    ]
    : [
      { label: 'Open', onSelect: () => openFile(node.path) },
      { label: 'Open in new tab', hint: '⌘-click', onSelect: () => inNewTab(() => openFile(node.path)) },
      { label: isBookmarked(bookmarksData, bookmarkTarget(node.path, false)) ? 'Remove bookmark' : 'Bookmark', onSelect: () => toggleBookmarkOf(bookmarkTarget(node.path, false)) },
      isNote ? null : { label: 'Open in its own app', onSelect: () => window.opal.openExternal(node.path) },
      isNote ? { label: 'Export to PDF…', onSelect: () => exportNote(node.path, 'pdf') } : null,
      isNote ? { label: 'Export to Word…', onSelect: () => exportNote(node.path, 'docx') } : null,
      isNote ? { label: 'Apply template…', hint: 'or a flow sheet', onSelect: async () => { await openFile(node.path); if (current && current.filePath === node.path) chooseTemplateFor(node.path, at); } } : null,
      'separator',
      { label: 'Rename…', onSelect: () => renameItem(node, kind) },
      { label: 'Show in Finder', onSelect: () => window.opal.revealInFinder(node.path) },
      'separator',
      { label: isNote ? 'Delete note…' : 'Delete file…', danger: true, hint: 'to the Trash', onSelect: () => deleteItem(node, kind) },
    ];
  showMenu(event, {
    title: name,
    items,
    extra: h('div', { class: 'ctx-colours' },
      h('span', { class: 'mono-label' }, 'Colour'),
      swatchRow(node.color, (color) => {
        closeMenu();
        setItemColor(node.path, kind, color);
      })),
  });
}

// ---------- Manuscripts ----------

async function toggleManuscript(folderPath, at) {
  const ms = await window.opal.readManuscript(folderPath);
  showMenu({ clientX: at.clientX, clientY: at.clientY, preventDefault() {}, stopPropagation() {} }, {
    title: 'Manuscript',
    items: ms.on
      ? [
        { label: 'Compile to Word…', onSelect: async () => { await openFolder(folderPath); setTimeout(() => document.querySelector('.ms-compile')?.click(), 400); } },
        { label: 'Stop treating as a manuscript', hint: 'keeps the order', onSelect: () => setManuscript(folderPath, false) },
      ]
      : [{ label: 'Mark as a manuscript', hint: 'each note is a chapter', onSelect: () => setManuscript(folderPath, true) }],
  });
}

async function setManuscript(folderPath, on) {
  try {
    await window.opal.writeManuscript(folderPath, { on });
    await openFolder(folderPath);
    refreshFiles();
  } catch (err) {
    alert(`Couldn't change the manuscript setting.\n\n${err.message}`);
  }
}

// Joins the chapters, in order, into one Word file (built with the shared note
// structure) and asks where to save it. → the saved path, or null.
async function compileManuscript(title, paths) {
  const chapters = [];
  for (const path of paths) {
    chapters.push({ title: noteName(path), blocks: noteStructure(await window.opal.readFile(path)) });
  }
  return window.opal.saveDocx(title, docxFromChapters(chapters));
}

// ---------- Exporting a note (plain PDF / Word) ----------

// The note as saved (the open note's latest typing included), as the shared structure.
async function exportNote(filePath, kind) {
  try {
    if (current && current.filePath === filePath) await current.editor.flush();
    const title = noteName(filePath);
    const blocks = noteStructure(await window.opal.readFile(filePath));
    const saved = kind === 'pdf'
      ? await window.opal.savePdf(title, htmlFromNote(title, blocks))
      : await window.opal.saveDocx(title, docxFromNote(title, blocks));
    if (saved) chrome.setStatus(`Exported ${saved.split('/').pop()}`);
  } catch (err) {
    alert(`Couldn't export “${noteName(filePath)}”.\n\n${err.message}`);
  }
}

function exportMenu(filePath, anchor) {
  const box = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: anchor.clientX, bottom: anchor.clientY };
  showMenu({ clientX: box.left, clientY: box.bottom + 4, preventDefault() {}, stopPropagation() {} }, {
    title: 'Export',
    items: [
      { label: 'PDF…', hint: 'Arial 11pt, A4', onSelect: () => exportNote(filePath, 'pdf') },
      { label: 'Word document…', hint: '.docx', onSelect: () => exportNote(filePath, 'docx') },
    ],
  });
}

// ---------- Flow sheets ----------

// A flow sheet → a Word table, one column per speaker.
async function exportFlow(title, data) {
  try {
    const saved = await window.opal.saveDocx(title, docxFromTable({
      title,
      subtitle: data.format,
      headers: data.columns,
      columns: data.lines.map((lines) => lines.map((line) => inlineRuns(line))),
    }));
    if (saved) chrome.setStatus(`Exported ${saved.split('/').pop()}`);
  } catch (err) {
    alert(`Couldn't export the flow sheet.\n\n${err.message}`);
  }
}

// ---------- Templates on an existing note ----------

// The Template menu on a note: its vault templates and the flow sheet formats.
async function chooseTemplateFor(filePath, anchor) {
  let info = { templates: [] };
  try {
    info = await window.opal.templateInfo(parentOf(filePath));
  } catch {
    // Just the flow sheets then.
  }
  const box = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: anchor.clientX, bottom: anchor.clientY };
  const isFlow = current && current.filePath === filePath && current.editor instanceof FlowEditor;
  const name = (p) => p.replace(/^Templates\//, '').replace(/\.md$/i, '');
  showMenu({ clientX: box.left, clientY: box.bottom + 4, preventDefault() {}, stopPropagation() {} }, {
    title: 'Apply a template',
    items: [
      ...(info.templates.length
        ? info.templates.map((p) => ({ label: name(p), hint: 'adds to the note', onSelect: () => applyTemplate(filePath, p) }))
        : [{ label: 'Notes in a Templates folder show here', disabled: true, onSelect: () => {} }]),
      'separator',
      ...Object.entries(FLOW_FORMATS).map(([key, format]) => ({
        label: `Flow sheet · ${format.name}`,
        hint: isFlow ? '' : 'speaker columns',
        onSelect: () => changeOpenNote(filePath, (text) => toFlowText(text, key)),
      })),
      isFlow ? 'separator' : null,
      isFlow ? { label: 'Normal note', hint: 'no columns', onSelect: () => changeOpenNote(filePath, fromFlowText) } : null,
    ].filter(Boolean),
  });
}

async function applyTemplate(filePath, templatePath) {
  let templateText;
  try {
    templateText = await window.opal.fillTemplate(templatePath, filePath);
  } catch (err) {
    alert(`Couldn't read that template.\n\n${err.message}`);
    return;
  }
  await changeOpenNote(filePath, (text) => mergeTemplate(text, templateText));
}

// Changes the open note's whole text (saved like typing, with a snapshot of
// how it was first); if it became or stopped being a flow sheet, it reopens
// in the right editor.
async function changeOpenNote(filePath, change) {
  if (!current || current.filePath !== filePath || !current.editor.getText) return;
  const before = current.editor.getText();
  const next = change(before);
  if (next === before) return;
  await window.opal.saveSnapshot(filePath, before, 'restore').catch(() => {});
  current.editor.replaceText(next);
  try {
    await current.editor.flush();
  } catch (err) {
    alert(`Couldn't save “${noteName(filePath)}”.\n\n${err.message}`);
    return;
  }
  current.edited = true;
  if (isFlowNote(next) !== (current.editor instanceof FlowEditor)) await navigate(() => showNote(filePath));
}

// Shows a folder as a database (starting from a preset), or back as a page.
async function chooseDatabase(folderPath, at) {
  const db = await window.opal.readDatabase(folderPath);
  showMenu({ clientX: at.clientX, clientY: at.clientY, preventDefault() {}, stopPropagation() {} }, {
    title: 'Show as a database',
    items: [
      db.on ? { label: 'Show as a folder page again', onSelect: () => showAsDatabase(folderPath, null) } : null,
      db.settings && !db.on ? { label: 'The database it had before', onSelect: () => showAsDatabase(folderPath, db.settings) } : null,
      db.on || db.settings ? 'separator' : null,
      { label: 'Blank database', hint: 'columns from your notes', onSelect: () => showAsDatabase(folderPath, PRESETS.blank) },
      { label: 'Assignment tracker', hint: 'subject · due · status · mark', onSelect: () => showAsDatabase(folderPath, PRESETS.assignments) },
      { label: 'Reading list', hint: 'author · status · rating', onSelect: () => showAsDatabase(folderPath, PRESETS.reading) },
    ],
  });
}

async function showAsDatabase(folderPath, settings) {
  try {
    await window.opal.writeDatabase(folderPath, Boolean(settings), settings || undefined);
    await openFolder(folderPath);
  } catch (err) {
    alert(`Couldn't change how the folder is shown.\n\n${err.message}`);
  }
}

async function setFolderTarget(node) {
  const answer = await askName(`Word target for ${node.name}`, 'Words, then Enter (empty = none)', node.wordTarget ? String(node.wordTarget) : '');
  if (answer === null) return;
  const n = parseInt(String(answer).replace(/[,\s]/g, ''), 10);
  try {
    await window.opal.setFolderWordTarget(node.path, Number.isFinite(n) && n > 0 ? n : null);
    await refreshFiles();
  } catch (err) {
    alert(`Couldn't set the word target.\n\n${err.message}`);
  }
}

// Picks the template new notes in a folder start from (for the Calendar
// folder, the one new daily notes start from).
async function chooseDefaultTemplate(folderPath, at) {
  const info = await window.opal.templateInfo(folderPath);
  const pick = async (templatePath) => {
    try {
      await window.opal.setDefaultTemplate(folderPath, templatePath);
    } catch (err) {
      alert(`Couldn't set the template.\n\n${err.message}`);
    }
  };
  const name = (p) => p.replace(/^Templates\//, '').replace(/\.md$/i, '');
  showMenu({ clientX: at.clientX, clientY: at.clientY, preventDefault() {}, stopPropagation() {} }, {
    title: folderPath === CALENDAR_FOLDER ? 'Daily note template' : 'Default template',
    items: info.templates.length
      ? [
        { label: 'None (blank notes)', hint: info.default ? '' : '✓', onSelect: () => pick(null) },
        'separator',
        ...info.templates.map((p) => ({ label: name(p), hint: p === info.default ? '✓' : '', onSelect: () => pick(p) })),
      ]
      : [{ label: 'Make a Templates folder with notes in it first', disabled: true, onSelect: () => {} }],
  });
}

// Is the open note this item (or inside this folder)?
function openNoteIsIn(path, kind) {
  if (!current) return false;
  return kind === 'folder' ? current.filePath.startsWith(`${path}/`) : current.filePath === path;
}

// Dragging: move `item` into a folder ('into'), or next to `target`
// ('before' / 'after'), saving that folder's own order.
async function rearrange(item, target, zone) {
  const kind = item.type === 'folder' ? 'folder' : 'file';
  const destFolder = zone === 'into' ? target.path : parentOf(target.path);
  try {
    if (parentOf(item.path) !== destFolder) {
      // The open note (or one inside a moved folder) is saved first and reopened after.
      const reopen = openNoteIsIn(item.path, kind) ? current.filePath : null;
      if (reopen) await current.editor.flush();
      const newPath = await window.opal.moveItem(item.path, kind, destFolder);
      renamePlaces(item.path, newPath, kind === 'folder');
      if (reopen) {
        current.editor.destroy();
        current = null;
        await reloadTree();
        await navigate(() => showNote(`${newPath}${reopen.slice(item.path.length)}`));
      } else if (kind === 'folder' && screen.kind === 'home' && (screen.folderPath === item.path || screen.folderPath.startsWith(`${item.path}/`))) {
        await reloadTree();
        openFolder(`${newPath}${screen.folderPath.slice(item.path.length)}`);
      }
    }
    if (zone !== 'into') {
      await reloadTree();
      const folder = findFolder(tree, destFolder, vault.name);
      if (folder) {
        const names = folder.children.filter((n) => !n.quiet).map((n) => n.name).filter((n) => n !== item.name);
        const at = names.indexOf(target.name);
        names.splice(at === -1 ? names.length : at + (zone === 'after' ? 1 : 0), 0, item.name);
        await window.opal.setOrder(destFolder, names);
      }
    }
    await reloadTree();
    refreshFiles();
  } catch (err) {
    alert(`Couldn't move “${item.name.replace(/\.md$/i, '')}”.\n\n${err.message}`);
    refreshFiles();
  }
}

async function renameItem(node, kind) {
  const oldName = kind === 'folder' ? node.name : noteName(node.path);
  const next = await askName(`Rename “${oldName}”`, 'New name, then Enter', oldName);
  if (!next || next === oldName) return;
  await renameItemTo(node, kind, next).catch(() => {}); // already explained in an alert
}

// Renames a page, file or folder and keeps whatever's open pointing at it.
// Returns the new path (or null if it couldn't).
async function renameItemTo(node, kind, next) {
  const isFolder = kind === 'folder';
  const oldName = isFolder ? node.name : noteName(node.path);
  try {
    if (!isFolder && openNoteIsIn(node.path, kind)) {
      await renameOpenNote(node.path, next);
      return current ? current.filePath : null;
    }
    // Save what's open first; if it lives in the folder, reopen it at its new path.
    const reopen = isFolder && openNoteIsIn(node.path, kind) ? current.filePath : null;
    if (reopen) await current.editor.flush();
    const newPath = isFolder ? await window.opal.renameFolder(node.path, next) : await window.opal.renameFile(node.path, next);
    renamePlaces(node.path, newPath, isFolder);
    if (reopen) {
      current.editor.destroy();
      current = null;
      await reloadTree();
      await navigate(() => showNote(`${newPath}${reopen.slice(node.path.length)}`));
      return newPath;
    }
    await reloadTree();
    if (isFolder && screen.kind === 'home' && (screen.folderPath === node.path || screen.folderPath.startsWith(`${node.path}/`))) {
      await openFolder(`${newPath}${screen.folderPath.slice(node.path.length)}`);
    } else {
      refreshFiles();
    }
    return newPath;
  } catch (err) {
    alert(`Couldn't rename “${oldName}”.\n\n${err.message}`);
    throw err;
  }
}

async function deleteItem(node, kind) {
  const isFolder = kind === 'folder';
  const name = isFolder ? node.name : noteName(node.path);
  const count = isFolder ? flattenFiles(node.children || []).length : 0;
  const what = isFolder ? `the folder “${name}”${count ? ` and the ${count} file${count === 1 ? '' : 's'} in it` : ''}` : `“${name}”`;
  if (!window.confirm(`Move ${what} to the Trash?\n\nYou can get it back from the Mac's Trash.`)) return;
  try {
    // Step out of it first if it's open (its last typing is saved on the way).
    if (openNoteIsIn(node.path, kind)) await openFolder(parentOf(isFolder ? node.path : node.path));
    if (isFolder) await window.opal.trashFolder(node.path);
    else await window.opal.trashFile(node.path);
    await reloadTree();
    if (screen.kind === 'home' && isFolder && (screen.folderPath === node.path || screen.folderPath.startsWith(`${node.path}/`))) {
      openFolder(parentOf(node.path));
    } else {
      refreshFiles();
    }
  } catch (err) {
    alert(`Couldn't delete “${name}”.\n\n${err.message}`);
  }
}


async function setItemColor(path, kind, color) {
  try {
    // Notes keep their colour in their own properties; folders and other files
    // in the folder's hidden settings file.
    const isNote = kind === 'file' && kindOf(path) === 'note';
    const open = isNote && current && current.editor.getStickies && current.filePath.toLowerCase() === path.toLowerCase();
    if (open) {
      // The note is open: change it through the editor so nothing typed is lost.
      current.editor.replaceText(setProp(current.editor.getText(), 'opal-color', color));
      await current.editor.flush();
      await refreshFiles();
    } else {
      await window.opal.setColor(path, kind, color);
    }
  } catch (err) {
    alert(`Couldn't change the colour.\n\n${err.message}`);
  }
}

// Follows a [[link]]: main finds the note (or creates it), then we open it.
// [[Note]], [[Note|text]] or [[Note#Heading]]: opens the note (made if it
// doesn't exist yet) and jumps to the heading, if there is one.
async function openLink(target) {
  const name = String(target).split('|')[0];
  const hash = name.indexOf('#');
  const heading = hash >= 0 ? name.slice(hash + 1).trim() : '';
  if (hash === 0 && heading) {
    // [[#Heading]] points inside this note.
    if (current && current.editor.goToHeading) current.editor.goToHeading(heading);
    return;
  }
  try {
    await openFile(await window.opal.resolveLink(target));
    if (heading && current && current.editor.goToHeading) current.editor.goToHeading(heading);
  } catch (err) {
    alert(`Could not open [[${target}]].\n\n${err.message}`);
  }
}

// Joins and tidies a vault path: "School/English/../Maths/x.md" → "School/Maths/x.md".
function joinVaultPath(folder, relative) {
  const parts = [];
  for (const part of `${folder ? `${folder}/` : ''}${relative}`.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
}

// [text](address): web and email links open in the browser / mail app; paths
// open files in the vault (relative to the note first, then the vault root).
async function openHref(href, fromPath) {
  const address = String(href || '').trim().replace(/^<|>$/g, '');
  if (/^(https?:|mailto:)/i.test(address)) {
    try {
      await window.opal.openWebLink(address);
    } catch (err) {
      alert(`Could not open ${address}.\n\n${err.message}`);
    }
    return;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(address)) {
    alert(`Opal only opens web links and links to files in this vault.\n\n${address}`);
    return;
  }
  const hash = address.indexOf('#');
  let pathPart = hash >= 0 ? address.slice(0, hash) : address;
  const heading = hash >= 0 ? address.slice(hash + 1).replace(/-/g, ' ') : '';
  try {
    pathPart = decodeURIComponent(pathPart);
  } catch {
    // Not %-encoded; use it as written.
  }
  if (!pathPart) {
    if (heading && current && current.editor.goToHeading) current.editor.goToHeading(heading);
    return;
  }
  const folder = parentOf(fromPath || '');
  const tries = [joinVaultPath(folder, pathPart), joinVaultPath('', pathPart)];
  if (!/\.[a-z0-9]+$/i.test(pathPart)) tries.push(...tries.map((p) => `${p}.md`));
  let found = tries.find((p) => findFile(tree, p));
  if (!found) found = await window.opal.findLink(pathPart.split('/').pop());
  if (!found) {
    alert(`There's no file “${pathPart}” in this vault.`);
    return;
  }
  await openFile(found);
  if (heading && current && current.editor.goToHeading) current.editor.goToHeading(heading);
}

// Names offered when typing [[ — notes by name (with their folder), then files.
function linkTargets() {
  return flattenFiles(tree)
    .filter((f) => !f.quiet)
    .map((f) => {
      const isNote = /\.md$/i.test(f.name);
      const folder = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : '';
      return { name: isNote ? f.name.slice(0, -3) : f.name, folder, isNote };
    });
}

// The folder new things go into: the folder on screen, or the open note's folder.
function currentFolder() {
  if (screen.kind === 'home') return screen.folderPath;
  if (screen.kind === 'note') return parentOf(screen.filePath);
  return '';
}

function folderLabel(folderPath) {
  return folderPath ? folderPath.split('/').pop() : vault.name;
}

// Every folder, for the "In" list of the create pop-up.
function folderChoices() {
  const out = [{ path: '', label: vault.name, depth: 0 }];
  const walk = (nodes, depth) => {
    for (const node of nodes) {
      if (node.type !== 'folder') continue;
      out.push({ path: node.path, label: node.name, depth });
      walk(node.children, depth + 1);
    }
  };
  walk(tree, 1);
  return out;
}

// The create pop-up (name, Note/Folder, where, colour). `at` is the click or
// button it opens beside.
function createItem(kind, folder = currentFolder(), at = null) {
  if (!vault) return;
  openCreateItem(at, {
    kind,
    folder,
    folders: folderChoices(),
    loadTemplates: (where) => window.opal.templateInfo(where),
    onCreate: async ({ kind: made, name, folder: where, color, description, template }) => {
      try {
        // A flow sheet is one of the templates ("flow:australs", …).
        if (made === 'note' && template && template.startsWith('flow:')) {
          const filePath = await window.opal.createNote(name, where);
          await window.opal.writeFile(filePath, newFlowText(template.slice(5), ['Speaker 1', 'Speaker 2']));
          if (color) await setItemColor(filePath, 'file', color);
          if (description) await window.opal.setDescription(filePath, 'file', description);
          await openFile(filePath);
          return;
        }
        if (made === 'folder') {
          const folderPath = await window.opal.createFolder(name, where);
          if (color) await setItemColor(folderPath, 'folder', color);
          if (description) await window.opal.setDescription(folderPath, 'folder', description);
          await navigate(async () => {
            await reloadTree();
            showHome(folderPath);
          });
        } else {
          const filePath = await window.opal.createNote(name, where, template);
          if (color) await setItemColor(filePath, 'file', color);
          if (description) await window.opal.setDescription(filePath, 'file', description);
          await openFile(filePath);
        }
      } catch (err) {
        alert(`Could not create “${name}”.\n\n${err.message}`);
      }
    },
  });
}

function newNote(folder = currentFolder(), at = null) {
  createItem('note', folder, at);
}

function newFolder(parent = currentFolder(), at = null) {
  createItem('folder', parent, at);
}

// ---------- Keeping up with the disk ----------

function refreshFiles() {
  // Queued so the listing is always fresher than any note just opened or created.
  return enqueue(async () => {
    if (!vault) return;
    try {
      await reloadTree();
    } catch {
      vaultWentMissing();
      return;
    }

    if (screen.kind === 'calendar' && calendar) {
      calendar.reload();
    } else if (screen.kind === 'tasks' && tasksView) {
      tasksView.reload();
    } else if (screen.kind === 'money' && moneyView) {
      moneyView.reload();
    } else if (screen.kind === 'debate' && debateView) {
      debateView.reload();
    } else if (screen.kind === 'inbox' && inboxView) {
      inboxView.reload();
    } else if (screen.kind === 'home' && corkboard) {
      corkboard.refresh();
    } else if (screen.kind === 'home') {
      if (homeStickies && homeStickies.layer.busy) return; // redraw after they're done
      // Typing the folder's name or description: redraw once that's finished.
      const typing = viewEl.querySelector('.home-h1-text:focus, .home .editable-line:focus, .db input:focus, .db select:focus, .home-exams input:focus, .home-exams select:focus');
      if (typing) {
        typing.addEventListener('blur', () => setTimeout(refreshFiles, 0), { once: true });
        return;
      }
      await flushHomeStickies();
      const gone = screen.folderPath && !findFolder(tree, screen.folderPath, vault.name);
      showHome(screen.folderPath, gone ? `The folder “${screen.folderPath}” was moved or deleted outside Opal.` : undefined);
    } else if (screen.kind === 'note' && current) {
      // If the open note was moved or deleted outside Opal and nothing is waiting
      // to be saved, close it. (With unsaved typing we keep it open and let the
      // save recreate the file, so nothing is lost.)
      if (!current.editor.isDirty && !findFile(tree, current.filePath)) {
        const gone = current.filePath;
        current.editor.destroy();
        current = null;
        showHome(parentOf(gone), `“${gone}” was moved or deleted outside Opal.`);
      } else {
        current.noteView.setTree(tree);
        await pickUpOutsideEdits();
        loadBacklinks(); // other notes may have gained or lost a link here
      }
    }
  });
}

// If another app (Obsidian, a text editor, sync) changed the open note, show
// that version — the editor only accepts it when nothing here is unsaved.
async function pickUpOutsideEdits() {
  const { editor, filePath } = current;
  if (editor.reload) {
    // A viewer: redraw if the file itself changed.
    const node = findFile(tree, filePath);
    if (node && node.modified !== current.modified) {
      current.modified = node.modified;
      editor.reload(fileUrl(filePath, node.modified));
    }
    return;
  }
  if (!editor.reloadFromDisk || editor.isDirty) return;
  const token = editor.saveToken;
  let diskText;
  try {
    diskText = await window.opal.readFile(filePath);
  } catch {
    return;
  }
  if (current && current.editor === editor && editor.reloadFromDisk(diskText, token)) {
    chrome.setStatus('Reloaded');
  }
}

// Opal's own saves don't trigger a vault rescan, so keep the dates fresh here.
function noteSaved(filePath) {
  reminders.refresh(); // a 🔔 or ⏰ may have been typed
  const node = findFile(tree, filePath);
  if (node) {
    node.modified = Date.now();
    if (current && current.filePath === filePath) current.noteView.setTree(tree);
  } else {
    // The save recreated a file that had been deleted outside Opal.
    reloadTree().catch(() => {});
  }
}

// The vault folder was moved, renamed or deleted while Opal was open.
function vaultWentMissing() {
  if (current && current.editor.isDirty) return; // keep typing; its save will say if it fails
  if (current) {
    current.editor.destroy();
    current = null;
  }
  tree = [];
  sidebar.setTree([]);
  showWelcome(`Can't find your vault folder “${vault.name}” any more — it may have been moved, renamed or deleted. Choose it again (or another folder).`);
}

function loadVault(newVault) {
  let firstPlace = null;
  const loading = enqueue(async () => {
    // Main already saved and closed the note before switching; this is a safety net.
    if (current) {
      current.editor.destroy();
      current = null;
    }
    vault = newVault;
    tree = [];
    sidebar.setVault(vault);
      if (!vault) {
      tabs = [];
      activeTabId = null;
      drawTabs();
      showWelcome();
      return;
    }
    await reloadTree();
    await loadVaultSettings();
    await loadBookmarks();
    firstPlace = await restoreTabs();
  });
  // The first tab's page is drawn once loading is done (drawing goes through the same queue).
  return loading.then(() => (firstPlace ? showPlace(firstPlace) : undefined));
}

// Safety net: if the page is ever unloaded some other way while typing is
// unsaved, refuse, save immediately, and let the next attempt go through.
window.addEventListener('beforeunload', (event) => {
  if (current && current.editor.isDirty) {
    event.preventDefault();
    event.returnValue = false;
    enqueue(() => current && current.editor.flush());
  }
});

window.opal.onFlushRequest(({ closeEditor }) =>
  enqueue(async () => {
    await flushHomeStickies();
    if (closeEditor) {
      await closeCurrent();
      screen = { kind: 'welcome' };
      viewEl.replaceChildren(h('div', { class: 'welcome' }, h('p', { class: 'hand welcome-hint' }, 'switching vault…')));
    } else if (current) {
      await current.editor.flush();
    }
  }),
);
window.opal.onNewNoteRequest(() => newNote());
window.opal.onNewFolderRequest(() => newFolder());
window.opal.onGoHome(() => vault && openFolder(''));
window.opal.onHistory((step) => goHistory(step));
window.opal.onTab((action) => {
  if (action === 'new') newTab();
  else if (action === 'close' && activeTabId) closeTab(activeTabId);
  else if (action === 'pin' && activeTabId) togglePin(activeTabId);
});
// ⌘-click opens in a new tab; any other click clears that.
document.addEventListener('mousedown', (event) => {
  if (event.button !== 0) return;
  newTabAt = event.metaKey && !event.target.closest('#tabbar, #topbar .bar-history') ? Date.now() : 0;
}, true);
// Middle-click on a note or folder in the sidebar: a new tab too.
document.addEventListener('auxclick', (event) => {
  if (event.button !== 1) return;
  const item = event.target.closest('#sidebar .side-file, #sidebar .side-name');
  if (!item) return;
  event.preventDefault();
  newTabAt = Date.now();
  item.click();
}, true);
// Tab keys: ⌃Tab / ⌃⇧Tab next / previous, ⌘1…⌘8 that tab, ⌘9 the last.
document.addEventListener('keydown', (event) => {
  if (!vault) return;
  if (event.ctrlKey && !event.metaKey && !event.altKey && event.key === 'Tab') {
    event.preventDefault();
    event.stopPropagation();
    stepTab(event.shiftKey ? -1 : 1);
  } else if (event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && /^[1-9]$/.test(event.key)) {
    event.preventDefault();
    event.stopPropagation();
    const n = Number(event.key);
    const tab = n === 9 ? tabs[tabs.length - 1] : tabs[n - 1];
    if (tab) activateTab(tab.id);
  }
}, true);
// The back / forward buttons on a mouse.
window.addEventListener('mouseup', (event) => {
  if (event.button === 3 || event.button === 4) {
    event.preventDefault();
    goHistory(event.button === 3 ? -1 : 1);
  }
});
window.opal.onShowPalettes(() => showSettings());
window.opal.onToggleSidebar(() => document.getElementById('sidebar').panel.toggle());
window.opal.onShowCalendar(() => showCalendar());
window.opal.onShowLogbook(() => vault && openFolder('')); // the Logbook is on the home page now
window.opal.onShowTasks(() => showTasks());
window.opal.onShowInbox(() => showInbox());
window.opal.onShowMoney(() => showMoney());
window.opal.onShowDebate(() => showDebate());
window.opal.onOpenReminder(openReminder);
window.opal.onSearch(startSearch);
window.opal.onVaultChanged(loadVault);
window.opal.onFilesChanged(refreshFiles);

window.opal.getPalette().then((name) => {
  paletteName = name;
  applyPalette(name);
});
window.opal.getVault().then(loadVault);
