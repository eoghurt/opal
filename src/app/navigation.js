// Getting around: the one-step-at-a-time queue that saves before every move,
// the page title and path, the tabs (each with its own back and forward),
// and restoring them from .opal/workspace.json. Moved out of renderer.js
// unchanged.

import { refreshExplorer } from '../explorer.js';
import { activeTabId, bookmarksData, calendar, corkboard, current, describeAfterOpen, examPaper, homeStickies, homeWidgets, moneyState, moneyView, movingTo, newTabAt, nextTabId, queue, reviewView, schoolView, screen, setActiveTabId, setCalendar, setCorkboard, setCurrent, setDescribeAfterOpen, setExamPaper, setHomeStickies, setHomeWidgets, setMoneyState, setMoneyView, setMovingTo, setNewTabAt, setNextTabId, setQueue, setReviewView, setSchoolView, setScreen, setTabs, setTasksView, setTree, setWorkspaceTimer, tabs, tasksView, tree, vault, vaultSettings, workspaceTimer } from './state.js';
import { noteName, parentOf, relativeDay } from '../format.js';
import { addButton, bookmarkTarget, chrome, colorMenu, colourSwatches, compileManuscript, describeFolder, folderLabel, itemMenuItems, newFolder, newNote, openLink, rearrange, reminders, renameFolderFromHome, showAsDatabase, showWordCount, sidebar, tabBar, toggleBookmarkOf, viewEl } from '../renderer.js';
import { examTrackerFor, folderHomeStickies, homeFidgets, mountHomeWidgets, schoolSubjects, showCalendar, showCorkboard, showExamPaper, showMoney, showNote, showReview, showSchool, showSettings, showTasks, updateCardsDue } from './screens.js';
import { findFile, findFolder } from '../tree.js';
import { openPinPicker } from '../tabs.js';
import { showMenu } from '../context-menu.js';
import { isBookmarked } from '../bookmarks.js';
import { ITEM_COLORS } from '../item-colors.js';
import { h, scribbleArrow } from '../ui.js';
import { renderFolderHome } from '../views/folder-home.js';
import { getDescription, getProp } from '../../shared/frontmatter.js';
import { ManuscriptView } from '../fidgets/manuscript/manuscript-view.js';
import { countWords } from '../../shared/words.js';
import { DatabaseView } from '../fidgets/database/database-view.js';
import { kindOf } from '../file-types.js';

// ---------- Everything happens one step at a time ----------

export function enqueue(task) {
  const run = queue.then(task);
  setQueue(run.catch((err) => console.error(err)));
  return run;
}
// Saves and removes the open editor. Throws (keeping the note open) if saving fails.
export async function closeCurrent() {
  if (!current) return;
  await current.editor.flush();
  // Leaving an edited note: one more snapshot for its history.
  if (current.edited && current.editor.getText) {
    await window.opal.saveSnapshot(current.filePath, current.editor.getText(), 'leave').catch(() => {});
  }
  current.editor.destroy();
  setCurrent(null);
}
export const schoolTabs = new Map();
// Called whenever another screen takes over.
export function leaveCalendar() {
  if (moneyView) moneyView.destroy();
  setMoneyView(null);
  if (reviewView) reviewView.destroy();
  setReviewView(null);
  if (tasksView && tasksView.destroy) tasksView.destroy();
  setTasksView(null);
  if (calendar) calendar.destroy();
  setCalendar(null);
  if (homeWidgets) homeWidgets.destroy();
  setHomeWidgets(null);
  if (corkboard) corkboard.destroy();
  setCorkboard(null);
  if (examPaper) examPaper.destroy();
  setExamPaper(null);
  if (schoolView) schoolView.destroy();
  setSchoolView(null);
}
export async function flushHomeStickies() {
  if (homeStickies) await homeStickies.flush();
}
// Every move to another screen goes through here: it saves the open note
// (and any sticky changes) first, and stays put if that fails.
export function navigate(task) {
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
export async function reloadTree() {
  setTree(await window.opal.listFiles());
  sidebar.setTree(tree);
  refreshExplorer();
  reminders.refresh();
  updateCardsDue();
}

// ---------- Screens ----------

// The breadcrumb for the screen just shown; also tells themes which screen
// it is (the GitHub theme underlines that tab).
export function showCrumbs(crumbs) {
  document.documentElement.dataset.screen = screen ? screen.kind : '';
  chrome.setCrumbs(crumbs);
  addButton.refresh();
  remember();
  if (!screen || screen.kind !== 'note') chrome.setWords(null);
  else showWordCount();
}

// ---------- Tabs, and back and forward ----------

export const PLACE_KINDS = ['calendar', 'tasks', 'settings', 'review', 'money'];
export const PLACE_TITLES = { calendar: 'Calendar', tasks: 'Tasks', settings: 'Settings', review: 'Review', money: 'Money' };
export const PLACE_ICONS = { calendar: 'calendar', tasks: 'tasks', settings: 'settings', review: 'review', money: 'money' };
export function currentPlace() {
  if (!screen) return null;
  if (screen.kind === 'home') return { kind: 'home', folderPath: screen.folderPath };
  if (screen.kind === 'note') return { kind: 'note', filePath: screen.filePath };
  // Money remembers which tab and month are showing, so back and forward
  // step through them too.
  if (screen.kind === 'money') return { kind: 'money', sub: { month: moneyState.month || null, tab: moneyState.tab || 'overview' } };
  if (screen.kind === 'exam-paper') return { kind: 'exam-paper', filePath: screen.filePath, sub: { paper: screen.paper } };
  if (PLACE_KINDS.includes(screen.kind)) return { kind: screen.kind };
  return null;
}
export function samePlace(a, b) {
  return Boolean(a && b && a.kind === b.kind && a.folderPath === b.folderPath && a.filePath === b.filePath
    && JSON.stringify(a.sub || null) === JSON.stringify(b.sub || null));
}
export function makeTab(place = null, pinned = false, pin = null) {
  return { id: (setNextTabId(nextTabId + 1) - 1), pinned, pin: pinned ? pin : null, places: place ? [place] : [], at: place ? 0 : -1, scroll: 0 };
}
export function activeTab() {
  return tabs.find((t) => t.id === activeTabId) || null;
}
export function tabPlace(tab) {
  return tab ? tab.places[tab.at] || null : null;
}
export function wantsNewTab() {
  return Boolean(newTabAt) && Date.now() - newTabAt < 1500;
}
export function placeTitle(place) {
  if (!place) return 'New tab';
  if (place.kind === 'note') return noteName(place.filePath);
  if (place.kind === 'home') return place.folderPath ? place.folderPath.split('/').pop() : 'Home';
  if (place.kind === 'exam-paper') return `${parentOf(place.filePath).split('/').pop()} · WACE ${place.sub && place.sub.paper}`;
  return PLACE_TITLES[place.kind] || '';
}
export function placeIcon(place) {
  if (!place) return 'plus';
  if (place.kind === 'note') return 'note';
  if (place.kind === 'home') return place.folderPath ? 'folder' : 'home';
  if (place.kind === 'exam-paper') return 'trophy';
  return PLACE_ICONS[place.kind] || 'note';
}
// A page was just shown: it becomes the active tab's next page (or a new tab's).
export function remember() {
  const place = currentPlace();
  if (!place) return;
  const tab = activeTab();
  const here = tabPlace(tab);
  const moving = movingTo && Date.now() - movingTo.at < 3000;
  setMovingTo(null);
  if (moving) {
    // From history: if the page couldn't be shown (a deleted note), the tab shows where it ended up.
    if (tab && !samePlace(place, here)) tab.places[tab.at] = place;
  } else {
    const toNewTab = wantsNewTab() || Boolean(tab && tab.pinned && here && !samePlace(place, here));
    setNewTabAt(0);
    if (!tab || toNewTab) {
      const fresh = makeTab(place);
      tabs.splice(tab ? tabs.indexOf(tab) + 1 : tabs.length, 0, fresh);
      setActiveTabId(fresh.id);
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
export function placePath(place) {
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
export function placeDetail(place) {
  if (!place || place.kind !== 'note') return '';
  const node = findFile(tree, place.filePath);
  return node && node.modified ? `Edited ${relativeDay(node.modified)} · ${place.filePath}` : place.filePath;
}
export function drawTabs() {
  tabBar.render(tabs.map((t) => {
    const place = tabPlace(t);
    return { id: t.id, pinned: t.pinned, pin: t.pin, title: placeTitle(place), icon: placeIcon(place), path: placePath(place), detail: placeDetail(place) };
  }), activeTabId);
  const tab = activeTab();
  chrome.setHistory(Boolean(tab && tab.at > 0), Boolean(tab && tab.at < tab.places.length - 1));
}
export function goToPlace(place) {
  if (place.kind === 'home') return openFolder(place.folderPath);
  if (place.kind === 'note') return openFile(place.filePath);
  if (place.kind === 'calendar') return showCalendar();
  if (place.kind === 'tasks') return showTasks();
  if (place.kind === 'logbook') return openFolder(''); // the Logbook is on the home page now
  if (place.kind === 'settings') return showSettings();
  if (place.kind === 'review') return showReview();
  if (place.kind === 'money') {
    if (place.sub) setMoneyState({ month: place.sub.month || null, tab: place.sub.tab || 'overview' });
    return showMoney();
  }
  if (place.kind === 'exam-paper') return showExamPaper(place.filePath, place.sub && place.sub.paper);
  return Promise.resolve();
}
// Shows a page without counting it as a new visit.
export async function showPlace(place) {
  setMovingTo({ place, at: Date.now() });
  setNewTabAt(0);
  await goToPlace(place);
}
// step: -1 = back, 1 = forward (within the active tab).
export async function goHistory(step) {
  const tab = activeTab();
  if (!vault || !tab) return;
  const index = tab.at + step;
  if (index < 0 || index >= tab.places.length) return;
  tab.at = index;
  drawTabs();
  await showPlace(tab.places[index]);
  saveWorkspace();
}

// Called once from renderer.js, at the point where this used to run.
export function rememberTabScroll() {
  // Keeps each tab's scroll position, to put back when it's shown again.
  viewEl.addEventListener('scroll', () => {
    const tab = activeTab();
    if (tab) tab.scroll = viewEl.scrollTop;
  }, { passive: true });
}

export async function activateTab(id) {
  const tab = tabs.find((t) => t.id === id);
  if (!tab || id === activeTabId) return;
  setActiveTabId(id);
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
export function newTab() {
  if (!vault) return;
  const fresh = makeTab();
  tabs.push(fresh);
  setActiveTabId(fresh.id);
  drawTabs();
  openFolder('');
}
export function closeTab(id) {
  const index = tabs.findIndex((t) => t.id === id);
  if (index === -1) return;
  if (tabs.length === 1) {
    // The last tab: a fresh one on the home page instead.
    setTabs([makeTab()]);
    setActiveTabId(tabs[0].id);
    drawTabs();
    openFolder('');
    return;
  }
  const wasActive = id === activeTabId;
  tabs.splice(index, 1);
  if (wasActive) {
    setActiveTabId(null);
    activateTab((tabs[index] || tabs[index - 1]).id);
  } else {
    drawTabs();
  }
  saveWorkspace();
}
export function closeTabs(keep) {
  const active = activeTab();
  const survivors = tabs.filter(keep);
  if (!survivors.length) return;
  setTabs(survivors);
  if (!tabs.includes(active)) {
    setActiveTabId(null);
    activateTab(tabs[0].id);
  } else {
    drawTabs();
  }
  saveWorkspace();
}
// Pinning a tab asks for its emoji and colour; unpinning forgets them.
export function togglePin(id) {
  const tab = tabs.find((t) => t.id === id);
  if (!tab) return;
  tab.pinned = !tab.pinned;
  tab.pin = tab.pinned ? { emoji: null, color: null } : null;
  drawTabs();
  saveWorkspace();
  if (tab.pinned) choosePin(id);
}
export function choosePin(id) {
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
export async function openFromTab(id, place) {
  if (id !== activeTabId) await activateTab(id);
  await goToPlace(place);
}
export function moveTab(id, index) {
  const from = tabs.findIndex((t) => t.id === id);
  if (from === -1) return;
  const [tab] = tabs.splice(from, 1);
  tabs.splice(index > from ? index - 1 : index, 0, tab);
  drawTabs();
  saveWorkspace();
}
// A tab's menu: Pin and Duplicate, then — for a note, file or folder — the
// same items (and colours) as its right-click menu in the sidebar, then Close.
export function tabMenu(event, id) {
  const tab = tabs.find((t) => t.id === id);
  if (!tab) return;
  const index = tabs.indexOf(tab);
  const place = tabPlace(tab);
  const node = place && place.kind === 'note' ? findFile(tree, place.filePath)
    : place && place.kind === 'home' && place.folderPath ? findFolder(tree, place.folderPath, vault && vault.name) : null;
  const kind = place && place.kind === 'home' ? 'folder' : 'file';
  const at = { clientX: event.clientX, clientY: event.clientY };
  const own = node
    ? itemMenuItems(node, kind, at).filter((item) => item && (item === 'separator' || item.label !== 'Open'))
    : [tabBookmarkItem(tab), ...(fileItems(tab).length ? ['separator', ...fileItems(tab)] : [])];
  showMenu(event, {
    title: placeTitle(place),
    items: [
      { label: tab.pinned ? 'Unpin' : 'Pin', onSelect: () => togglePin(id) },
      tab.pinned ? { label: 'Emoji and colour…', onSelect: () => choosePin(id) } : null,
      { label: 'Duplicate tab', onSelect: () => duplicateTab(id) },
      'separator',
      ...own,
      'separator',
      { label: 'Close', hint: '⌘W', onSelect: () => closeTab(id) },
      { label: 'Close others', disabled: tabs.length < 2, onSelect: () => closeTabs((t) => t === tab || t.pinned) },
      { label: 'Close tabs to the right', disabled: index === tabs.length - 1, onSelect: () => closeTabs((t, i) => i <= index || t.pinned) },
    ].filter(Boolean),
    extra: node ? colourSwatches(node, kind) : null,
  });
}
// Show in Finder / Copy path for a tab's note, file or folder (double-click a tab).
export function fileItems(tab) {
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
    { label: 'Copy path', onSelect: () => copy(full, 'the path') },
    rel ? { label: 'Copy vault path', onSelect: () => copy(rel, 'the vault path') } : null,
  ].filter(Boolean);
}
export function tabBookmarkItem(tab) {
  const place = tabPlace(tab);
  const target = place && place.kind === 'note' ? bookmarkTarget(place.filePath, false) : place && place.kind === 'home' ? bookmarkTarget(place.folderPath, true) : null;
  if (!target) return null;
  return { label: isBookmarked(bookmarksData, target) ? 'Remove bookmark' : 'Bookmark', onSelect: () => toggleBookmarkOf(target) };
}
// Double-clicking a tab opens the same menu as right-clicking it.
export function tabFileMenu(event, id) {
  tabMenu(event, id);
}
export function duplicateTab(id) {
  const tab = tabs.find((t) => t.id === id);
  if (!tab) return;
  const copy = { ...makeTab(), places: tab.places.slice(), at: tab.at, scroll: tab.scroll }; // a copy isn't pinned
  tabs.splice(tabs.indexOf(tab) + 1, 0, copy);
  activateTab(copy.id);
}
// Opens something in a new tab (the "Open in new tab" menu items).
export function inNewTab(open) {
  setNewTabAt(Date.now());
  return open();
}
// Notes or folders renamed or moved: every tab follows them.
export function renamePlaces(oldPath, newPath, isFolder) {
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
export function saveWorkspace() {
  if (!vault) return;
  clearTimeout(workspaceTimer);
  setWorkspaceTimer(setTimeout(() => {
    const data = {
      tabs: tabs.map((t) => ({ place: tabPlace(t), pinned: t.pinned || undefined, pin: t.pinned && t.pin && (t.pin.emoji || t.pin.color) ? t.pin : undefined })).filter((t) => t.place),
      active: Math.max(0, tabs.filter((t) => tabPlace(t)).indexOf(activeTab())),
    };
    window.opal.writeOpalJson('workspace.json', data).catch(() => {});
  }, 400));
}
// The tabs saved last time (or one tab on the home page). → the page to show first.
export async function restoreTabs() {
  clearTimeout(workspaceTimer);
  setTabs([]);
  setActiveTabId(null);
  const saved = vault && vaultSettings.tabs.restore ? await window.opal.readOpalJson('workspace.json').catch(() => ({})) : {};
  const clean = (place) => {
    if (!place || typeof place !== 'object') return null;
    if (place.kind === 'note' && typeof place.filePath === 'string' && findFile(tree, place.filePath)) return { kind: 'note', filePath: place.filePath };
    if (place.kind === 'home' && typeof (place.folderPath ?? '') === 'string' && findFolder(tree, place.folderPath || '', vault.name)) return { kind: 'home', folderPath: place.folderPath || '' };
    if (place.kind === 'logbook') return { kind: 'home', folderPath: '' }; // now on the home page
    if (place.kind === 'exam-paper' && typeof place.filePath === 'string' && findFile(tree, place.filePath) && place.sub && typeof place.sub.paper === 'string') return { kind: 'exam-paper', filePath: place.filePath, sub: { paper: place.sub.paper } };
    if (place.kind === 'money') {
      const sub = place.sub && typeof place.sub === 'object' ? place.sub : null;
      if (!sub) return { kind: place.kind };
      return { kind: 'money', sub: { month: /^\d{4}-\d{2}$/.test(sub.month || '') ? sub.month : null, tab: typeof sub.tab === 'string' ? sub.tab : 'overview' } };
    }
    if (PLACE_KINDS.includes(place.kind)) return { kind: place.kind };
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
  setActiveTabId(tab.id);
  drawTabs();
  return tabPlace(tab);
}
// Cycles through the tabs: step 1 = next, -1 = previous.
export function stepTab(step) {
  if (tabs.length < 2) return;
  const index = tabs.findIndex((t) => t.id === activeTabId);
  activateTab(tabs[(index + step + tabs.length) % tabs.length].id);
}
export function crumbsFor(folderPath) {
  const crumbs = [{ label: vault.name, onClick: () => openFolder('') }];
  const parts = folderPath ? folderPath.split('/') : [];
  parts.forEach((part, i) => {
    const target = parts.slice(0, i + 1).join('/');
    crumbs.push({ label: part, onClick: () => openFolder(target) });
  });
  return crumbs;
}
export function setTitle(text) {
  document.title = text ? `${text} — Opal` : 'Opal';
}
export function showWelcome(problem) {
  leaveCalendar();
  setScreen({ kind: 'welcome' });
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
export function showHome(folderPath, notice) {
  let folder = findFolder(tree, folderPath, vault.name);
  if (!folder) {
    folderPath = '';
    folder = findFolder(tree, '', vault.name);
  }
  leaveCalendar();
  setScreen({ kind: 'home', folderPath });
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
  setDescribeAfterOpen(null);
  setHomeStickies(folderHomeStickies(folderPath, folder, home));
  addButton.refresh();
}
// What renderFolderHome needs for a folder (its normal page, or the School page's Files tab).
export function folderHomeOptions(folder, folderPath, notice) {
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

// ---------- Moving around ----------

export function openFolder(folderPath) {
  return navigate(async () => {
    if (!findFolder(tree, folderPath, vault.name)) await reloadTree();
    showHome(folderPath);
  });
}
export function openFile(filePath) {
  if (kindOf(filePath) === 'ledger') return showMoney(); // the Money page shows the Ledger files
  if (current && current.filePath === filePath && !wantsNewTab()) return Promise.resolve();
  return navigate(() => showNote(filePath));
}