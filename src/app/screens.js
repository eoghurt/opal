// The whole-page screens: School, the exam tracker, the corkboard and
// classic home pages, Settings, and the fidgets (Calendar, Tasks, Debate,
// Money, Mail, Review). Moved out of renderer.js unchanged.

import { TRACKER_NAME, findPapers, formatTracker, guessCourse, parseTracker } from '../fidgets/exams/exams.js';
import { SchoolView, readPredicted } from '../fidgets/exams/school-view.js';
import { pdfLines } from '../fidgets/exams/pdf-lines.js';
import { CALENDAR_FOLDER, REPEATS_NAME, REPEATS_PATH, colorHex, dayKey, dayPath, keyToDate } from '../fidgets/calendar/events.js';
import { countNotes, findFile, findFolder, flattenFiles } from '../tree.js';
import { appInfo, bookmarksData, calendar, calendarState, cardsDueCount, cardsDueTimer, corkboard, current, debateState, homeEditing, homeLayoutForSettings, homeWidgets, mailState, mailView, moneyState, paletteName, screen, setAppInfo, setCalendar, setCalendarState, setCardsDueCount, setCardsDueTimer, setCorkboard, setCurrent, setDebateState, setDebateView, setExamPaper, setHomeEditing, setHomeLayoutForSettings, setHomeStickies, setHomeWidgets, setMailState, setMailView, setMoneyState, setMoneyView, setPaletteName, setReviewView, setSchoolView, setScreen, setSettingsSection, setTasksView, setVaultSettings, settingsSection, tree, vault, vaultSettings } from './state.js';
import { addButton, bookmarkIo, bookmarkTarget, changeOpenNote, chooseTemplateFor, chrome, colorMenu, describeOpenNote, exportFlow, exportMenu, linkTargets, loadAllTasks, loadBacklinks, loadDayEvents, newFolder, newNote, noteSaved, openHref, openLink, prepTimer, readNoteOrNull, reminders, renameOpenNote, setItemColor, showHistory, showWordCount, sidebar, toggleBookmarkOf, viewEl } from '../renderer.js';
import { activeTab, crumbsFor, folderHomeOptions, goHistory, inNewTab, leaveCalendar, navigate, newTab, openFile, openFolder, reloadTree, remember, samePlace, schoolTabs, setTitle, showCrumbs, showHome } from './navigation.js';
import { colorOf } from '../item-colors.js';
import { noteName, parentOf, shortDate } from '../format.js';
import { fileUrl, kindLabel, kindOf } from '../file-types.js';
import { renderFolderHome } from '../views/folder-home.js';
import { ExamPaper, ExamTracker } from '../fidgets/exams/exam-tracker-view.js';
import { Corkboard, DEFAULT_QUOTES } from '../home/corkboard.js';
import { DEFAULT_LIST, TASKS_FOLDER, addTask, formatTask, mailLink, parseTasks, replaceTask, todayKey, toggleTask } from '../fidgets/tasks/tasks.js';
import { showMenu } from '../context-menu.js';
import { FIDGETS } from '../fidgets/index.js';
import { askName, h } from '../ui.js';
import { readProperties, writeProperty } from '../../shared/properties.js';
import { HomeWidgets, WIDGETS, formatLayout, parseLayout } from '../widgets/home/home-widgets.js';
import { getProp, setProp } from '../../shared/frontmatter.js';
import { parseStickies, writeStickies } from '../../shared/stickies.js';
import { StickyLayer } from '../widgets/stickies/sticky-layer.js';
import { editorForFile } from '../editor-registry.js';
import { FlowEditor, fromFlowText, isFlowNote } from '../fidgets/flow/flow-editor.js';
import { NoteView } from '../views/note-view.js';
import { countWords } from '../../shared/words.js';
import { showConflict } from '../conflict.js';
import { showToast } from '../toast.js';
import { isBookmarked } from '../bookmarks.js';
import { FileView } from '../views/file-view.js';
import { renderSettings, withDefaults } from '../views/settings-view.js';
import { applyTheme, currentLook } from '../themes.js';
import { applyPalette } from '../palettes.js';
import { CalendarView } from '../fidgets/calendar/calendar-view.js';
import { TasksView } from '../fidgets/tasks/tasks-view.js';
import { DebateView } from '../fidgets/debate/debate-view.js';
import { MoneyView } from '../fidgets/money/money-view.js';
import { MailView } from '../fidgets/mail/mail-view.js';
import { ReviewView } from '../fidgets/flashcards/review-view.js';
import { countDue } from '../fidgets/flashcards/schedule.js';

// ---------- School ----------

export function schoolSubjects(folder) {
  if (!folder || !folder.path) return [];
  return folder.children.filter((c) => c.type === 'folder' && c.children.some((f) => f.type === 'file' && f.name === `${TRACKER_NAME}.md`));
}
export const predictedCache = new Map();
export async function predictedFor(folder) {
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
export async function waceExamsFor(subjects) {
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
export function showSchool(folder, folderPath) {
  setHomeStickies(null);
  const subjects = schoolSubjects(folder);
  setSchoolView(new SchoolView(viewEl, {
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
  }));
  addButton.refresh();
}

// ---------- Exam tracker ----------

export function examTrackerFor(folder) {
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
export function showExamPaper(trackerPath, paper) {
  if (!vault || !trackerPath || !paper) return Promise.resolve();
  return navigate(async () => {
    const folderPath = parentOf(trackerPath);
    const folder = findFolder(tree, folderPath, vault.name);
    if (!folder || !findFile(tree, trackerPath)) return showHome(folderPath, `Can't find ${trackerPath} any more.`);
    setHomeStickies(null);
    leaveCalendar();
    setScreen({ kind: 'exam-paper', filePath: trackerPath, paper });
    setTitle(`${folder.name} · WACE ${paper}`);
    sidebar.setActive('folder', folderPath);
    showCrumbs([...crumbsFor(folderPath).map((c, i, all) => (i === all.length - 1 ? { ...c, onClick: () => openFolder(folderPath) } : c)), { label: `WACE ${paper}` }]);
    viewEl.scrollTop = 0;
    setExamPaper(new ExamPaper(viewEl, {
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
    }));
  });
}
// A new "Exam tracker.md" in a subject folder, its course guessed from the folder's name.
export async function addExamTracker(node) {
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

export async function showCorkboard() {
  setHomeStickies(null);
  viewEl.scrollTop = 0;
  const quotes = await loadQuotes();
  if (screen.kind !== 'home' || screen.folderPath) return;
  if (corkboard) corkboard.destroy();
  setCorkboard(new Corkboard(viewEl, {
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
  }));
  addButton.refresh();
}
// The short to-do list on the receipt's tear-off stub: an ordinary task list.
export const QUICK_LIST = 'Quick list';
export async function editQuickList(change) {
  const text = (await readTaskList(QUICK_LIST)) || '';
  await writeTaskList(QUICK_LIST, change(text, parseTasks(text, QUICK_LIST)));
}
// The quotes on the corkboard: blockquotes in Quotes.md, each with its author
// on a last "— who" line. Until that note exists, the built-in four.
export const QUOTES_PATH = 'Quotes.md';
export function parseQuotes(text) {
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
export async function loadQuotes() {
  const text = await readNoteOrNull(QUOTES_PATH);
  const list = text ? parseQuotes(text) : [];
  if (list.length) return list;
  return Array.isArray(vaultSettings.homeQuotes) ? vaultSettings.homeQuotes : [];
}
export async function editQuotes() {
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
export function openerMenu(event) {
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

// Called once from renderer.js, at the point where this used to run.
export function listenForOpenerMenu() {
  viewEl.addEventListener('contextmenu', openerMenu, true);
}

export function fidgetMenu(event, id) {
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
export function dayMenu(event, key) {
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
export function taskMenu(event, task, after = () => {}) {
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
export async function setHomeStyle(style) {
  await saveVaultSettings({ homeStyle: style });
  if (screen.kind === 'home' && !screen.folderPath) showHome('');
}
// Every event in a month for the corkboard calendar: { day: [{ text, color, cont }] }.
export async function loadMonthEvents(year, month) {
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

// ---------- Home page widgets ----------

export async function readHomeLayout() {
  const text = await window.opal.readFolderSettings('').catch(() => '');
  return readProperties(text)['opal-home'] || null;
}
export async function saveHomeLayout(items) {
  try {
    const text = await window.opal.readFolderSettings('');
    await window.opal.writeFolderSettings('', writeProperty(text, 'opal-home', formatLayout(items), 'text'));
  } catch (err) {
    alert(`Couldn't save the home page layout.\n\n${err.message}`);
  }
}
export async function mountHomeWidgets(slot) {
  const layout = await readHomeLayout();
  if (!slot.isConnected) return;
  if (homeWidgets) homeWidgets.destroy();
  setHomeWidgets(new HomeWidgets(slot, {
    layout,
    editing: homeEditing,
    io: {
      saveLayout: (items) => saveHomeLayout(items),
      onEditing: (on) => { setHomeEditing(on); },
      files: () => flattenFiles(tree),
      openFile: (path) => openFile(path),
      openFolder: (path) => openFolder(path),
      openCalendarDay: (key) => {
        setCalendarState({ ...calendarState, mode: 'day' });
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
  }));
}
export function homeSettingsSection() {
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
          h('button', { class: 'set-btn', onclick: () => { setHomeLayoutForSettings(parseLayout(null)); save(); } }, 'Reset to the default widgets')),
      ];
    },
  };
}
// A folder home's stickies are kept in the folder's hidden settings file
// (School/.opal.md), made the first time one is added.
// Writes wait a moment so a burst of typing becomes one save.
export function folderHomeStickies(folderPath, folder, home) {
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
export async function showNote(filePath) {
  setHomeStickies(null);
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

  setScreen({ kind: 'note', filePath });
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
  // The text this editor last loaded or saved: sent with each save so main can
  // tell if another app changed the note in the meantime (see conflict.js).
  const sync = { base: content };
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
      const startedFrom = sync.base;
      const result = await window.opal.writeFile(filePath, text, startedFrom);
      sync.base = text;
      if (result && result.conflict) {
        showConflict({
          filePath, name: noteName(filePath), editor, mine: text, theirs: result.conflict.outside, base: startedFrom,
          saveSnapshot: (path, body, reason) => window.opal.saveSnapshot(path, body, reason),
        });
      }
      if (current && current.editor === editor) current.edited = true;
      // Words written: what was added since the last save (never less than 0).
      const words = countWords(text);
      if (words > lastWords) window.opal.addWords(dayKey(new Date()), words - lastWords).catch(() => {});
      lastWords = words;
      noteSaved(filePath);
      window.opal.saveSnapshot(filePath, text, 'auto').catch(() => {});
    },
    onStatus: (status, err) => {
      chrome.setStatus(status);
      if (status === 'Save failed') showToast(`Couldn't save “${noteName(filePath)}”.`, { detail: `${err ? `${err.message} ` : ''}Your typing is still here; Opal keeps trying.` });
    },
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
  setCurrent({ filePath, editor, noteView, stickies, sync });
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
export async function showViewer(filePath, ViewerType) {
  if (!findFile(tree, filePath)) await reloadTree();
  const node = findFile(tree, filePath);
  if (!node) {
    showHome(parentOf(filePath), `Can't find ${filePath} any more.`);
    return;
  }

  setScreen({ kind: 'note', filePath });
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
  setCurrent({ filePath, editor: viewer, noteView: fileView, modified: node.modified });
  fileView.setTree(tree);

  chrome.setStatus('Saved');
  setTitle(noteName(filePath));
  showCrumbs([...crumbsFor(parentOf(filePath)), { label: noteName(filePath) }]);
  sidebar.setActive('file', filePath);
}

// ---------- Settings ----------

export async function loadVaultSettings() {
  setVaultSettings(withDefaults(vault ? await window.opal.readOpalJson('settings.json').catch(() => ({})) : {}));
  settingsChanged();
}
// Changes some of this vault's settings and saves them.
export async function saveVaultSettings(patch) {
  setVaultSettings(withDefaults({ ...vaultSettings, ...patch }));
  settingsChanged();
  try {
    await window.opal.writeOpalJson('settings.json', vaultSettings);
  } catch (err) {
    alert(`Couldn't save the settings.\n\n${err.message}`);
  }
  drawSettings();
}
// Everything that uses a setting picks up the new values.
export function settingsChanged() {
  prepTimer.setPomodoro(vaultSettings.pomodoro);
}
export function showSettings(section) {
  if (!vault) return Promise.resolve();
  if (section) setSettingsSection(section);
  return navigate(async () => {
    setHomeStickies(null);
    leaveCalendar();
    setScreen({ kind: 'settings' });
    setTitle('Settings');
    sidebar.setActive(null, null);
    showCrumbs([{ label: vault.name, onClick: () => openFolder('') }, { label: 'Settings' }]);
    viewEl.scrollTop = 0;
    setAppInfo(appInfo || await window.opal.appInfo().catch(() => null));
    setHomeLayoutForSettings(parseLayout(await readHomeLayout()));
    drawSettings();
  });
}
export function drawSettings() {
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
        setSettingsSection(id);
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
        setPaletteName(await window.opal.setPalette(name));
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
export const calendarUndo = { undo: [], redo: [], step: null };
export async function readOrNull(path) {
  try {
    return await window.opal.readFile(path);
  } catch {
    return null;
  }
}
// Called just before the calendar writes a file during a step.
export async function rememberForUndo(path) {
  const { step } = calendarUndo;
  if (step && !step.has(path)) step.set(path, await readOrNull(path));
}
// Runs fn as one undoable step.
export async function recordCalendarStep(fn) {
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
export async function restoreFiles(step) {
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
export async function undoCalendar(redo = false) {
  const from = redo ? calendarUndo.redo : calendarUndo.undo;
  const to = redo ? calendarUndo.undo : calendarUndo.redo;
  const step = from.pop();
  if (!step) return false;
  to.push(await restoreFiles(step));
  return true;
}
export function showCalendar(date) {
  if (!vault) return Promise.resolve();
  return navigate(async () => {
    setHomeStickies(null);
    leaveCalendar();
    if (date) setCalendarState({ ...calendarState, date });
    setScreen({ kind: 'calendar' });
    setTitle('Calendar');
    sidebar.setActive(null, null);
    showCrumbs([{ label: vault.name, onClick: () => openFolder('') }, { label: 'Calendar' }]);
    viewEl.scrollTop = 0;
    setCalendar(new CalendarView(viewEl, {
      openMailReply,
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
      onChange: (state) => { setCalendarState(state); },
    }));
    calendar.setCardsDue(cardsDueCount);
  });
}

// ---------- Tasks ----------

export function taskListNodes() {
  const folder = findFolder(tree, TASKS_FOLDER, vault.name);
  return folder ? folder.children.filter((n) => n.type === 'file' && /\.md$/i.test(n.name)) : [];
}
export function taskListPath(name) {
  const node = taskListNodes().find((n) => n.name.slice(0, -3).toLowerCase() === name.toLowerCase());
  return node ? node.path : `${TASKS_FOLDER}/${name}.md`;
}
export async function readTaskList(name) {
  try {
    return await window.opal.readFile(taskListPath(name));
  } catch {
    return null;
  }
}
export async function writeTaskList(name, text) {
  await rememberForUndo(taskListPath(name));
  const known = taskListNodes().some((n) => n.name.slice(0, -3).toLowerCase() === name.toLowerCase());
  await window.opal.createFolder(TASKS_FOLDER, '');
  const path = await window.opal.createNote(name, TASKS_FOLDER);
  await window.opal.writeFile(path, text);
  if (!known) await reloadTree();
  else reminders.refresh();
}
// Every task with a due date, from every list (for the calendar).
export async function loadDueTasks() {
  const lists = await Promise.all(taskListNodes().map(async (n) => {
    const name = n.name.slice(0, -3);
    return parseTasks((await readTaskList(name)) || '', name);
  }));
  return lists.flat().filter((t) => t.due);
}
export async function toggleTaskDone(task) {
  const text = (await readTaskList(task.list)) || '';
  await writeTaskList(task.list, toggleTask(text, task));
}
export function showTasks() {
  if (!vault) return Promise.resolve();
  return navigate(async () => {
    setHomeStickies(null);
    leaveCalendar();
    setScreen({ kind: 'tasks' });
    setTitle('Tasks');
    sidebar.setActive(null, null);
    showCrumbs([{ label: vault.name, onClick: () => openFolder('') }, { label: 'Tasks' }]);
    viewEl.scrollTop = 0;
    setTasksView(new TasksView(viewEl, {
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
      openMailReply,
    }));
  });
}

// ---------- Debate ----------

// The debate folder: the vault's first folder called "Debate" (nearest the top).
export function debateFolder() {
  let level = findFolder(tree, '', vault.name).children;
  while (level.length) {
    const found = level.find((n) => n.type === 'folder' && n.name.toLowerCase() === 'debate');
    if (found) return found;
    level = level.filter((n) => n.type === 'folder').flatMap((n) => n.children);
  }
  return null;
}
export function showDebate() {
  if (!vault) return Promise.resolve();
  return navigate(async () => {
    setHomeStickies(null);
    leaveCalendar();
    setScreen({ kind: 'debate' });
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
    setDebateView(new DebateView(viewEl, {
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
          setDebateState(state && state.page && typeof state.page === 'object' ? state.page : state);
          remember();
        },
      },
    }));
  });
}

// ---------- Money ----------

// The fidget tiles at the top of the vault's home page.
export const FIDGET_PAGES = { mail: () => showMail(), money: () => showMoney(), calendar: () => showCalendar(), tasks: () => showTasks(), debate: () => showDebate(), flashcards: () => showReview() };
export function homeFidgets() {
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
export function showMoney() {
  if (!vault) return Promise.resolve();
  return navigate(async () => {
    setHomeStickies(null);
    leaveCalendar();
    setScreen({ kind: 'money' });
    setTitle('Money');
    sidebar.setActive(null, null);
    showCrumbs([{ label: vault.name, onClick: () => openFolder('') }, { label: 'Money' }]);
    viewEl.scrollTop = 0;
    setMoneyView(new MoneyView(viewEl, {
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
          setMoneyState(state);
          remember();
        },
      },
    }));
  });
}

// ---------- Mail ----------

export function showMail(then) {
  if (!vault) return Promise.resolve();
  if (screen && screen.kind === 'mail' && mailView) {
    if (then) mailView.whenReady(() => then(mailView));
    return Promise.resolve();
  }
  return navigate(async () => {
    setHomeStickies(null);
    leaveCalendar();
    setScreen({ kind: 'mail' });
    setTitle('Mail');
    sidebar.setActive(null, null);
    showCrumbs([{ label: vault.name, onClick: () => openFolder('') }, { label: 'Mail' }]);
    viewEl.scrollTop = 0;
    setMailView(new MailView(viewEl, {
      box: mailState.box,
      account: mailState.account,
      io: {
        ...window.opal.mail,
        openNote: async (path) => {
          await reloadTree();
          openFile(path);
        },
        openWeb: (url) => window.opal.openWebLink(url).catch(() => {}),
        onChange: (state) => { setMailState(state); },
        vaultFiles: () => flattenFiles(tree).map((f) => ({ path: f.path, name: f.name })),
        addReplyTask: (message, day) => addReplyTask(message, day),
        onSent: (result) => { if (result && result.inReplyTo) tickReplyTasks(result.inReplyTo).catch(() => {}); },
      },
    }));
    if (then) mailView.whenReady(() => then(mailView));
  });
}
// "To reply" (Mail's menu): a task in My Tasks on that day, titled
// "Reply to <subject> / <sender>", carrying a link to the email (see tasks.js).
export async function addReplyTask(message, day) {
  const status = await window.opal.mail.status();
  const account = status.accounts.find((a) => a.id === message.account);
  const sender = (message.from && (message.from.name || message.from.address)) || 'someone';
  const task = {
    title: `Reply to ${String(message.subject || '(no subject)').replace(/\s+/g, ' ')} / ${sender}`.replace(/[\[\]]/g, ''),
    done: false, due: day, time: null, endTime: null, startDate: null, repeat: null, starred: false,
    primary: null, secondary: null, created: todayKey(), doneOn: null,
    mailLink: mailLink(message.messageId, account ? account.email : '', account ? account.provider : 'google'),
    details: [], subtasks: [],
  };
  const text = (await readTaskList(DEFAULT_LIST)) || '';
  await writeTaskList(DEFAULT_LIST, addTask(text, task, DEFAULT_LIST));
}
// Sending a reply ticks off its "to reply" task(s).
export async function tickReplyTasks(inReplyTo) {
  const wanted = String(inReplyTo).replace(/^<|>$/g, '');
  for (const node of taskListNodes()) {
    const name = node.name.slice(0, -3);
    for (;;) {
      const text = (await readTaskList(name)) || '';
      const task = parseTasks(text, name).find((t) => t.mail === wanted && !t.done);
      if (!task) break;
      await writeTaskList(name, toggleTask(text, task));
    }
  }
}
// The envelope on a "to reply" task: Mail, writing the reply.
export function openMailReply(messageId) {
  return showMail((view) => view.replyToMessageId(messageId));
}

// Called once from renderer.js, at the point where this used to run.
export function listenForNewMail() {
  // New mail (main's IDLE connection): the list updates, and a Mac notification
  // per email — sender and subject only — unless switched off in Settings › Mail.
  window.opal.mail.onArrived((data) => {
    if (mailView) mailView.arrived(data);
    if (vaultSettings.mail && vaultSettings.mail.notify === false) return;
    for (const m of (data.fresh || []).slice(0, 5)) {
      window.opal.notify({ title: (m.from && (m.from.name || m.from.address)) || 'New email', body: m.subject || '(no subject)', mail: m.id }).catch(() => {});
    }
  });

  window.opal.mail.onChanged(() => { if (mailView) mailView.refreshList().catch(() => {}); });
}

// ---------- Flashcards ----------

export function showReview() {
  if (!vault) return Promise.resolve();
  return navigate(async () => {
    setHomeStickies(null);
    leaveCalendar();
    setScreen({ kind: 'review' });
    setTitle('Review');
    sidebar.setActive(null, null);
    showCrumbs([{ label: vault.name, onClick: () => openFolder('') }, { label: 'Review' }]);
    viewEl.scrollTop = 0;
    setReviewView(new ReviewView(viewEl, {
      io: {
        listCards: () => window.opal.listCards(),
        reviewCard: (path, line, raw, schedule) => window.opal.reviewCard(path, line, raw, schedule),
        openFile: (path) => openFile(path),
        onReviewed: () => updateCardsDue(),
        settings: () => vaultSettings.flashcards || null,
        saveSettings: (flashcards) => saveVaultSettings({ flashcards }),
      },
    }));
  });
}
export function updateCardsDue() {
  clearTimeout(cardsDueTimer);
  setCardsDueTimer(setTimeout(async () => {
    if (!vault) return;
    try {
      // Cards in hidden decks (Review › Edit decks) don't count.
      const hidden = new Set(((vaultSettings.flashcards || {}).hidden) || []);
      setCardsDueCount(countDue((await window.opal.listCards()).filter((c) => c.decks.some((d) => !hidden.has(d)))));
    } catch {
      return;
    }
    chrome.setCardsDue(cardsDueCount);
    if (calendar) calendar.setCardsDue(cardsDueCount);
  }, 400));
}