// Window code: decides what's on screen and moves between screens.
// Bundled into dist/renderer.js (+ dist/renderer.css) by esbuild (`npm run build`).
//
// Screens: 'welcome' (no vault), 'home' (a folder's home page), 'note', 'settings', 'calendar', 'tasks', 'review'.

import '@fontsource-variable/inter/wght.css'; // note text (Inter)
import '@fontsource-variable/inter/wght-italic.css';
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
import { TASKS_FOLDER, DEFAULT_LIST, parseTasks, toggleTask, replaceTask, addTask, formatTask, todayKey, mailLink } from './fidgets/tasks/tasks.js';
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
import { openCreateItem } from './create-popover.js';
import { openHistory } from './history-view.js';
import { DatabaseView, PRESETS } from './fidgets/database/database-view.js';
import { ManuscriptView } from './fidgets/manuscript/manuscript-view.js';
import { MoneyView } from './fidgets/money/money-view.js';
import { MailView } from './fidgets/mail/mail-view.js';
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
import { showToast } from './toast.js';
import { showConflict } from './conflict.js';
import {
  vault, tree, paletteName, screen, current, queue, homeStickies, calendar, calendarState, homeWidgets, homeEditing, tasksView, reviewView, moneyView, mailView, mailState, debateView, debateState, moneyState, corkboard, examPaper, schoolView, describeAfterOpen, wordTimer, backlinkTimer, tabs, activeTabId, nextTabId, movingTo, newTabAt, workspaceTimer, bookmarksData, homeLayoutForSettings, vaultSettings, settingsSection, appInfo, cardsDueTimer, cardsDueCount, setVault, setTree, setPaletteName, setScreen, setCurrent, setQueue, setHomeStickies, setCalendar, setCalendarState, setHomeWidgets, setHomeEditing, setTasksView, setReviewView, setMoneyView, setMailView, setMailState, setDebateView, setDebateState, setMoneyState, setCorkboard, setExamPaper, setSchoolView, setDescribeAfterOpen, setWordTimer, setBacklinkTimer, setTabs, setActiveTabId, setNextTabId, setMovingTo, setNewTabAt, setWorkspaceTimer, setBookmarksData, setHomeLayoutForSettings, setVaultSettings, setSettingsSection, setAppInfo, setCardsDueTimer, setCardsDueCount,
} from './app/state.js';
import {
  activateTab, activeTab, closeCurrent, closeTab, crumbsFor, currentPlace, drawTabs, enqueue, flushHomeStickies, folderHomeOptions, goHistory, inNewTab, leaveCalendar, moveTab, navigate, newTab, openFile, openFolder, openFromTab, reloadTree, remember, renamePlaces, restoreTabs, rememberTabScroll, samePlace, schoolTabs, setTitle, showCrumbs, showHome, showPlace, showWelcome, stepTab, tabFileMenu, tabMenu, tabPlace, togglePin,
} from './app/navigation.js';
import {
  addExamTracker, homeFidgets, loadVaultSettings, readTaskList, listenForOpenerMenu, listenForNewMail, showCalendar, showDebate, showMail, showMoney, showNote, showReview, showSettings, showTasks, taskListNodes,
} from './app/screens.js';
import {
  installShortcuts,
} from './app/shortcuts.js';

const viewEl = document.getElementById('view');

// Main passes the saved palette in the address so the first paint uses it.
const initialPalette = new URLSearchParams(location.search).get('palette');
if (initialPalette) applyPalette(initialPalette);
// …and the theme, for the same reason.
{
  const params = new URLSearchParams(location.search);
  applyTheme({ theme: params.get('theme') || 'minimal', mode: params.get('mode') || 'light' });
}


setPaletteName(initialPalette || 'Riso');
 // plus folderPath / filePath


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
  onTasks: () => showTasks(),
  onToggleSidebar: () => document.getElementById('sidebar').panel.toggle(),
  sidebarClosed: () => document.getElementById('sidebar').panel.isClosed(),
  fidgets: () => (vault ? homeFidgets() : []),
  railPlace: () => ({ mail: 'mail', money: 'money', calendar: 'calendar', tasks: 'tasks', debate: 'debate', review: 'flashcards', settings: 'settings' })[screen.kind] || null,
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


 // folder path → the School page's open tab


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
      setCurrent(null);
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

 // a folder whose description should open when it's shown
async function renameFolderFromHome(folderPath, next, { describe = false } = {}) {
  const node = findFolder(tree, folderPath, vault.name);
  if (!node) return;
  // Renaming reopens the folder's page; this tells it to open the description.
  setDescribeAfterOpen(describe ? '*' : null);
  try {
    await renameItemTo(node, 'folder', next);
  } finally {
    setDescribeAfterOpen(null);
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
    setCalendarState({ ...calendarState, mode: 'day' });
    showCalendar(keyToDate(open.day));
  } else if (open.kind === 'mail') {
    showMail((view) => view.openMessage(open.id));
  }
}

// ---------- Screens ----------


// ---------- Word count (status bar) ----------


function showWordCount() {
  clearTimeout(wordTimer);
  setWordTimer(setTimeout(() => {
    if (!current || !current.editor.view) {
      chrome.setWords(null);
      return;
    }
    const { state } = current.editor.view;
    const text = state.doc.toString();
    const selected = state.selection.ranges.reduce((n, r) => n + (r.empty ? 0 : countSelected(state.sliceDoc(r.from, r.to))), 0);
    const target = parseInt(String(getProp(text, 'word-target') || ''), 10) || null;
    chrome.setWords({ words: countWords(text), selected, target });
  }, 120));
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


function loadBacklinks() {
  clearTimeout(backlinkTimer);
  setBacklinkTimer(setTimeout(async () => {
    const open = current;
    if (!open || !open.noteView || !open.noteView.setBacklinks) return;
    try {
      const data = await window.opal.backlinks(open.filePath);
      if (current === open) open.noteView.setBacklinks(data);
    } catch {
      // Leave the lists as they were.
    }
  }, 120));
}

// ---------- Tabs, and back and forward ----------
//
// Like Obsidian: several tabs, each showing one page and keeping its own
// back / forward history (like a web browser). Only the active tab's page is
// drawn; switching tabs draws that tab's page again. ⌘-click (or "Open in
// new tab") opens something in a new tab, and a pinned tab keeps its page —
// anything opened from it goes to a new tab. The tabs are saved in the
// vault's .opal/workspace.json so they come back next time.


 // [{ id, pinned, pin: { emoji, color }, places: [place], at, scroll }]


 // { place, at }


rememberTabScroll();


// ---------- School ----------
//
// A folder whose subject folders have exam trackers (School/Methods/Exam
// tracker.md…) opens as the School page (src/fidgets/exams/school-view.js):
// every subject's marks, the WACE dates from the calendar, and moderation from
// a "Predicted ATAR" PDF in the folder. Its Files tab is the normal folder page.


 // pdf path → { modified, value }


// ---------- Exam tracker ----------
//
// A subject folder with an "Exam tracker.md" note shows the tracker at the top
// of its page (src/fidgets/exams/). Everything is in that note.


// ---------- The corkboard home ----------
//
// The vault's home page as a pinboard (src/home/corkboard.js). Switch it off
// in Settings › Appearance, or right-click the frame, for the classic home.


listenForOpenerMenu();


// ---------- Bookmarks ----------
//
// In .obsidian/bookmarks.json (Obsidian's format — see bookmarks.js and main.js).


async function loadBookmarks() {
  setBookmarksData(vault ? await window.opal.readBookmarks().catch(() => ({ items: [] })) : { items: [] });
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
  setBookmarksData(await window.opal.readBookmarks().catch(() => bookmarksData));
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


// ---------- Moving around ----------


// ---------- Settings ----------


// ---------- Calendar ----------


// ---------- Tasks ----------


// ---------- Reading notes for the home page and calendar ----------

async function readNoteOrNull(path) {
  if (!findFile(tree, path)) return null;
  try {
    return await window.opal.readFile(path);
  } catch {
    return null;
  }
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

// ---------- Debate ----------


// ---------- Money ----------


// ---------- Mail ----------


listenForNewMail();


// ---------- Flashcards ----------


// ---------- Folder & page colours ----------

// The right-click / double-click menu for a page, file or folder — the same
// in the sidebar and on a tab (a tab adds its own items around these).
function colorMenu(event, node, kind) {
  const at = { clientX: event.clientX, clientY: event.clientY };
  showMenu(event, { title: kind === 'folder' ? node.name : noteName(node.path), items: itemMenuItems(node, kind, at), extra: colourSwatches(node, kind) });
}

function colourSwatches(node, kind) {
  return h('div', { class: 'ctx-colours' },
    h('span', { class: 'mono-label' }, 'Colour'),
    swatchRow(node.color, (color) => {
      closeMenu();
      setItemColor(node.path, kind, color);
    }));
}

function itemMenuItems(node, kind, at) {
  const isFolder = kind === 'folder';
  const isNote = !isFolder && kindOf(node.path) === 'note';
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
      ...copyPathItems(node.path),
      'separator',
      { label: 'Delete folder…', danger: true, onSelect: () => deleteItem(node, kind) },
    ]
    : [
      { label: 'Open', onSelect: () => openFile(node.path) },
      { label: 'Open in new tab', hint: '⌘-click', onSelect: () => inNewTab(() => openFile(node.path)) },
      { label: isBookmarked(bookmarksData, bookmarkTarget(node.path, false)) ? 'Remove bookmark' : 'Bookmark', onSelect: () => toggleBookmarkOf(bookmarkTarget(node.path, false)) },
      isNote ? null : { label: 'Open in its own app', onSelect: () => window.opal.openExternal(node.path) },
      isNote ? { label: 'Export to PDF…', onSelect: () => exportNote(node.path, 'pdf') } : null,
      isNote ? { label: 'Export to Word…', onSelect: () => exportNote(node.path, 'docx') } : null,
      isNote ? { label: 'Apply template…', onSelect: async () => { await openFile(node.path); if (current && current.filePath === node.path) chooseTemplateFor(node.path, at); } } : null,
      'separator',
      { label: 'Rename…', onSelect: () => renameItem(node, kind) },
      { label: 'Show in Finder', onSelect: () => window.opal.revealInFinder(node.path) },
      ...copyPathItems(node.path),
      'separator',
      { label: isNote ? 'Delete note…' : 'Delete file…', danger: true, onSelect: () => deleteItem(node, kind) },
    ];
  return items;
}

// Copy path (the full path on this Mac) and Copy vault path.
function copyPathItems(rel) {
  if (!vault) return [];
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
    { label: 'Copy path', onSelect: () => copy(full, 'the path') },
    rel ? { label: 'Copy vault path', onSelect: () => copy(rel, 'the vault path') } : null,
  ].filter(Boolean);
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
        setCurrent(null);
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
    showToast(`Couldn't move “${item.name.replace(/\.md$/i, '')}”.`, { detail: err.message });
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
      setCurrent(null);
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
    showToast(`Couldn't rename “${oldName}”.`, { detail: err.message });
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
        setCurrent(null);
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
    if (current.sync) current.sync.base = diskText;
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
    setCurrent(null);
  }
  setTree([]);
  sidebar.setTree([]);
  showWelcome(`Can't find your vault folder “${vault.name}” any more — it may have been moved, renamed or deleted. Choose it again (or another folder).`);
}

function loadVault(newVault) {
  let firstPlace = null;
  const loading = enqueue(async () => {
    // Main already saved and closed the note before switching; this is a safety net.
    if (current) {
      current.editor.destroy();
      setCurrent(null);
    }
    setVault(newVault);
    setTree([]);
    sidebar.setVault(vault);
      if (!vault) {
      setTabs([]);
      setActiveTabId(null);
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
      setScreen({ kind: 'welcome' });
      viewEl.replaceChildren(h('div', { class: 'welcome' }, h('p', { class: 'hand welcome-hint' }, 'switching vault…')));
    } else if (current) {
      await current.editor.flush();
    }
  }),
);
installShortcuts();


 // the Logbook is on the home page now


// Errors main wants you to see (a link update or history move that failed…).
window.opal.onAppError(({ text, detail }) => showToast(text, { detail }));
// The window's own unexpected errors go to the log file (opal.log).
window.addEventListener('error', (e) => window.opal.logError('error', e.error && e.error.stack ? e.error.stack : e.message).catch(() => {}));
window.addEventListener('unhandledrejection', (e) => window.opal.logError('promise', e.reason && e.reason.stack ? e.reason.stack : String(e.reason)).catch(() => {}));

window.opal.onVaultChanged(loadVault);
window.opal.onFilesChanged(refreshFiles);

window.opal.getPalette().then((name) => {
  setPaletteName(name);
  applyPalette(name);
});
window.opal.getVault().then(loadVault);

// Shared with the modules in ./app (they import these from here).
export {
  addButton, bookmarkIo, bookmarkTarget, changeOpenNote, chooseTemplateFor, chrome, colorMenu, colourSwatches, compileManuscript, describeFolder, describeOpenNote, exportFlow, exportMenu, folderLabel, itemMenuItems, linkTargets, loadAllTasks, loadBacklinks, loadDayEvents, newFolder, newNote, noteSaved, openHref, openLink, openReminder, prepTimer, readNoteOrNull, rearrange, reminders, renameFolderFromHome, renameOpenNote, setItemColor, showAsDatabase, showHistory, showWordCount, sidebar, startSearch, tabBar, toggleBookmarkOf, viewEl,
};
