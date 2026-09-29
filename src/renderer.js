// Window code: decides what's on screen and moves between screens.
// Bundled into dist/renderer.js (+ dist/renderer.css) by esbuild (`npm run build`).
//
// Screens: 'welcome' (no vault), 'home' (a folder's home page), 'note', 'palettes'.

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

import { Sidebar } from './sidebar.js';
import { Chrome } from './chrome.js';
import { editorForFile } from './editor-registry.js';
import { renderFolderHome } from './views/folder-home.js';
import { NoteView } from './views/note-view.js';
import { FileView } from './views/file-view.js';
import { fileUrl } from './file-types.js';
import { StickyLayer } from './sticky-layer.js';
import { makePanel } from './panel.js';
import { swatchRow } from './item-colors.js';
import { showMenu, closeMenu } from './context-menu.js';
import { setProp, setDescription, getDescription } from '../shared/frontmatter.js';
import { kindOf } from './file-types.js';
import { CalendarView } from './views/calendar-view.js';
import { LogbookView } from './views/logbook-view.js';
import { TasksView } from './views/tasks-view.js';
import { TASKS_FOLDER, DEFAULT_LIST, parseTasks, toggleTask, replaceTask, addTask, todayKey } from './tasks/tasks.js';
import { CALENDAR_FOLDER, REPEATS_NAME, REPEATS_PATH, dayPath, keyToDate, parseEvents, parseSeries, occurrences } from './calendar/events.js';
import { parseStickies, writeStickies } from '../shared/stickies.js';
import { renderPalettes } from './views/palettes-view.js';
import { applyPalette } from './palettes.js';
import { applyTheme, currentLook } from './themes.js';
import { askName, h, scribbleArrow } from './ui.js';
import { findFile, findFolder, recentFiles, flattenFiles } from './tree.js';
import { noteName, parentOf } from './format.js';
import { Reminders } from './reminders.js';
import { openSearch } from './search.js';
import { InboxView, INBOX_PATH } from './views/inbox-view.js';
import { openCreateItem } from './create-popover.js';

// The Inbox is switched off for now (its code stays, ready to come back).
const INBOX_ENABLED = false;

const viewEl = document.getElementById('view');

// Main passes the saved palette in the address so the first paint uses it.
const initialPalette = new URLSearchParams(location.search).get('palette');
if (initialPalette) applyPalette(initialPalette);
// …and the theme, for the same reason.
{
  const params = new URLSearchParams(location.search);
  applyTheme({ theme: params.get('theme') || 'scrapbook', mode: params.get('mode') || 'light' });
}

let vault = null;
let tree = [];
let paletteName = initialPalette || 'Riso';
let screen = { kind: 'welcome' }; // plus folderPath / filePath
// The open note: { filePath, editor, noteView } or null.
let current = null;

const sidebarPanel = makePanel(document.getElementById('sidebar'), { id: 'sidebar', side: 'left', label: 'Sidebar', width: 240, min: 180, max: 480 });
const sidebar = new Sidebar(sidebarPanel, {
  onOpenFile: (p) => openFile(p),
  onOpenFolder: (p) => openFolder(p),
  onSwitchVault: () => window.opal.chooseVault(),
  onColorMenu: (event, node, kind) => colorMenu(event, node, kind),
  onRearrange: (item, target, zone) => rearrange(item, target, zone),
  onCreate: (event) => newNote('', event),
});

const chrome = new Chrome(document.getElementById('topbar'), document.getElementById('footer'), {
  onHome: () => vault && openFolder(''),
  onPalettes: () => showPalettes(),
  onOpenFile: (p) => openFile(p),
  onCalendar: (date) => showCalendar(date),
  onSearch: () => startSearch('open'),
  onInbox: INBOX_ENABLED ? () => showInbox() : null,
  onLogbook: () => showLogbook(),
  onTasks: () => showTasks(),
});

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
  current.editor.destroy();
  current = null;
}

// Stickies on the folder home on screen: { layer, flush } or null.
let homeStickies = null;
// The calendar on screen (and where it was last left).
let calendar = null;
let calendarState = { date: new Date(), mode: 'day' };

// The logbook on screen (and where it was last left).
let logbook = null;
let logbookState = { kind: 'month', date: new Date() };

let tasksView = null;
let inboxView = null;

// Called whenever another screen takes over.
function leaveCalendar() {
  tasksView = null;
  inboxView = null;
  if (calendar) calendar.destroy();
  calendar = null;
  if (logbook) logbook.destroy();
  logbook = null;
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
  chrome.setRecent(recentFiles(tree, 6));
  reminders.refresh();
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
  const home = renderFolderHome(viewEl, {
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
  });
  describeAfterOpen = null;
  homeStickies = folderHomeStickies(folderPath, folder, home);
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
  const EditorType = await editorForFile(filePath);
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

  screen = { kind: 'note', filePath };
  viewEl.scrollTop = 0;
  const noteView = new NoteView(viewEl, {
    filePath,
    vaultName: vault.name,
    onOpenFile: (p) => openFile(p),
    onOpenFolder: (p) => openFolder(p),
    onOpenLink: (target) => openLink(target),
    onNewNoteHere: (at) => newNote(parentOf(filePath), at),
    onPalettes: () => showPalettes(),
    onGoToLine: (line) => current && current.editor.goToLine && current.editor.goToLine(line),
    onAddSticky: () => current && current.stickies && current.stickies.add(viewEl.scrollTop - noteView.center.offsetTop),
    onInsertTable: (rows, cols) => current && current.editor.insertTable && current.editor.insertTable(rows, cols),
    onRename: (newName, options) => renameOpenNote(filePath, newName, options),
    onDescribe: (text) => describeOpenNote(filePath, text),
    onSetColor: (path, kind, color) => setItemColor(path, kind, color),
  });

  let changeTimer = null;
  const editor = new EditorType({
    parent: noteView.editorHost,
    content,
    save: async (text) => {
      await window.opal.writeFile(filePath, text);
      noteSaved(filePath);
    },
    onStatus: (status) => chrome.setStatus(status),
    onOpenLink: (target) => openLink(target),
    onOpenHref: (href) => openHref(href, filePath),
    linkTargets: () => linkTargets(),
    findLink: (target) => window.opal.findLink(target),
    onCursor: () => noteView.ribbon.refresh(),
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
  if (current && current.filePath === filePath) return Promise.resolve();
  return navigate(() => showNote(filePath));
}

function showPalettes() {
  if (!vault) return Promise.resolve();
  return navigate(async () => {
    homeStickies = null;
    leaveCalendar();
    screen = { kind: 'palettes' };
    setTitle('Theme & palettes');
    sidebar.setActive(null, null);
    showCrumbs([{ label: vault.name, onClick: () => openFolder('') }, { label: 'Theme & palettes' }]);
    viewEl.scrollTop = 0;
    drawPalettes();
  });
}

function drawPalettes() {
  if (screen.kind !== 'palettes') return;
  const scrollTop = viewEl.scrollTop;
  renderPalettes(viewEl, {
    active: paletteName,
    look: currentLook(),
    onLook: async (change) => {
      try {
        applyTheme(await window.opal.setLook(change));
      } catch (err) {
        alert(`Couldn't change the theme.\n\n${err.message}`);
      }
      drawPalettes();
    },
    onUse: async (name) => {
      paletteName = await window.opal.setPalette(name);
      chrome.setPalette(applyPalette(paletteName));
      drawPalettes();
    },
  });
  viewEl.scrollTop = scrollTop;
}

// ---------- Calendar ----------

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
      readDay: async (key) => {
        try {
          return await window.opal.readFile(dayPath(key));
        } catch {
          return null;
        }
      },
      writeDay: async (key, text) => {
        await window.opal.createFolder(CALENDAR_FOLDER, '');
        const path = await window.opal.createNote(key, CALENDAR_FOLDER);
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
        const path = await window.opal.createNote(key, CALENDAR_FOLDER);
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
      onChange: (state) => { calendarState = state; },
    });
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

// ---------- Logbook ----------

function showLogbook() {
  if (!vault) return Promise.resolve();
  return navigate(async () => {
    homeStickies = null;
    leaveCalendar();
    screen = { kind: 'logbook' };
    setTitle('Logbook');
    sidebar.setActive(null, null);
    showCrumbs([{ label: vault.name, onClick: () => openFolder('') }, { label: 'Logbook' }]);
    viewEl.scrollTop = 0;
    logbook = new LogbookView(viewEl, {
      kind: logbookState.kind,
      date: logbookState.date,
      getFiles: () => flattenFiles(tree),
      readFile: (path) => window.opal.readFile(path),
      openFile: (path) => openFile(path),
      openCalendarDay: (key) => {
        calendarState = { ...calendarState, mode: 'day' };
        showCalendar(keyToDate(key));
      },
      openTasks: () => showTasks(),
      onChange: (state) => { logbookState = state; },
    });
  });
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
      { label: 'New note here…', onSelect: () => newNote(node.path, at) },
      { label: 'New folder inside…', onSelect: () => newFolder(node.path, at) },
      'separator',
      { label: 'Rename…', onSelect: () => renameItem(node, kind) },
      { label: 'Show in Finder', onSelect: () => window.opal.revealFolder(node.path) },
      'separator',
      { label: 'Delete folder…', danger: true, hint: 'to the Trash', onSelect: () => deleteItem(node, kind) },
    ]
    : [
      { label: 'Open', onSelect: () => openFile(node.path) },
      isNote ? null : { label: 'Open in its own app', onSelect: () => window.opal.openExternal(node.path) },
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
    onCreate: async ({ kind: made, name, folder: where, color, description }) => {
      try {
        if (made === 'folder') {
          const folderPath = await window.opal.createFolder(name, where);
          if (color) await setItemColor(folderPath, 'folder', color);
          if (description) await window.opal.setDescription(folderPath, 'folder', description);
          await navigate(async () => {
            await reloadTree();
            showHome(folderPath);
          });
        } else {
          const filePath = await window.opal.createNote(name, where);
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
    } else if (screen.kind === 'logbook' && logbook) {
      logbook.reload();
    } else if (screen.kind === 'tasks' && tasksView) {
      tasksView.reload();
    } else if (screen.kind === 'inbox' && inboxView) {
      inboxView.reload();
    } else if (screen.kind === 'home') {
      if (homeStickies && homeStickies.layer.busy) return; // redraw after they're done
      // Typing the folder's name or description: redraw once that's finished.
      const typing = viewEl.querySelector('.home-h1-text:focus, .home .editable-line:focus');
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
    chrome.setRecent(recentFiles(tree, 6));
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
  chrome.setRecent([]);
  showWelcome(`Can't find your vault folder “${vault.name}” any more — it may have been moved, renamed or deleted. Choose it again (or another folder).`);
}

function loadVault(newVault) {
  return enqueue(async () => {
    // Main already saved and closed the note before switching; this is a safety net.
    if (current) {
      current.editor.destroy();
      current = null;
    }
    vault = newVault;
    tree = [];
    sidebar.setVault(vault);
    chrome.setRecent([]);
    if (!vault) {
      showWelcome();
      return;
    }
    await reloadTree();
    showHome('');
  });
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
window.opal.onShowPalettes(showPalettes);
window.opal.onToggleSidebar(() => document.getElementById('sidebar').panel.toggle());
window.opal.onShowCalendar(() => showCalendar());
window.opal.onShowLogbook(() => showLogbook());
window.opal.onShowTasks(() => showTasks());
window.opal.onShowInbox(() => showInbox());
window.opal.onOpenReminder(openReminder);
window.opal.onSearch(startSearch);
window.opal.onVaultChanged(loadVault);
window.opal.onFilesChanged(refreshFiles);

window.opal.getPalette().then((name) => {
  paletteName = name;
  chrome.setPalette(applyPalette(name));
});
window.opal.getVault().then(loadVault);
