// The window's shared state: what is open and on screen, the tabs, the
// fidgets' views and timers. Every module reads these as they are; only the
// setters change them, so it is easy to find what changes what.

import { withDefaults } from '../views/settings-view.js';

export let vault = null;

export let tree = [];

export let paletteName; // first set in renderer.js

export let screen = { kind: 'welcome' };

// The open note: { filePath, editor, noteView } or null.
export let current = null;

// Opening, closing and saving run one after another, never overlapping,
// so a fast click can't skip saving the previous note.
export let queue = Promise.resolve();

// Stickies on the folder home on screen: { layer, flush } or null.
export let homeStickies = null;

// The calendar on screen (and where it was last left).
export let calendar = null;

export let calendarState = { date: new Date(), mode: 'day' };

// The home page's widgets on screen, and whether they're being arranged.
export let homeWidgets = null;

export let homeEditing = false;

export let tasksView = null;

export let reviewView = null;

export let moneyView = null;

export let moneyState = { month: null, tab: 'overview' };

export let corkboard = null;

export let examPaper = null;

export let schoolView = null;

// Folder renamed from its own page (the big title).
export let describeAfterOpen = null;

export let wordTimer = null;

// Fills the open note's Linked from / Unlinked mentions lists.
export let backlinkTimer = null;

export let tabs = [];

export let activeTabId = null;

export let nextTabId = 1;

// A page being drawn from a tab's history (or another tab): not a new visit.
export let movingTo = null;

// A ⌘-click just asked for the next page to open in a new tab.
export let newTabAt = 0;

export let workspaceTimer = null;

export let bookmarksData = { items: [] };

// Settings → Home page: every widget with a switch and a size.
export let homeLayoutForSettings = [];

// This vault's settings (.opal/settings.json), with defaults filled in.
export let vaultSettings = withDefaults({});

export let settingsSection = 'appearance';

export let appInfo = null;

// How many cards are due today: on Review and the calendar's today.
export let cardsDueTimer = null;

export let cardsDueCount = 0;

// ---------- Setters ----------

export function setVault(value) {
  vault = value;
  return value;
}
export function setTree(value) {
  tree = value;
  return value;
}
export function setPaletteName(value) {
  paletteName = value;
  return value;
}
export function setScreen(value) {
  screen = value;
  return value;
}
export function setCurrent(value) {
  current = value;
  return value;
}
export function setQueue(value) {
  queue = value;
  return value;
}
export function setHomeStickies(value) {
  homeStickies = value;
  return value;
}
export function setCalendar(value) {
  calendar = value;
  return value;
}
export function setCalendarState(value) {
  calendarState = value;
  return value;
}
export function setHomeWidgets(value) {
  homeWidgets = value;
  return value;
}
export function setHomeEditing(value) {
  homeEditing = value;
  return value;
}
export function setTasksView(value) {
  tasksView = value;
  return value;
}
export function setReviewView(value) {
  reviewView = value;
  return value;
}
export function setMoneyView(value) {
  moneyView = value;
  return value;
}
export function setMoneyState(value) {
  moneyState = value;
  return value;
}
export function setCorkboard(value) {
  corkboard = value;
  return value;
}
export function setExamPaper(value) {
  examPaper = value;
  return value;
}
export function setSchoolView(value) {
  schoolView = value;
  return value;
}
export function setDescribeAfterOpen(value) {
  describeAfterOpen = value;
  return value;
}
export function setWordTimer(value) {
  wordTimer = value;
  return value;
}
export function setBacklinkTimer(value) {
  backlinkTimer = value;
  return value;
}
export function setTabs(value) {
  tabs = value;
  return value;
}
export function setActiveTabId(value) {
  activeTabId = value;
  return value;
}
export function setNextTabId(value) {
  nextTabId = value;
  return value;
}
export function setMovingTo(value) {
  movingTo = value;
  return value;
}
export function setNewTabAt(value) {
  newTabAt = value;
  return value;
}
export function setWorkspaceTimer(value) {
  workspaceTimer = value;
  return value;
}
export function setBookmarksData(value) {
  bookmarksData = value;
  return value;
}
export function setHomeLayoutForSettings(value) {
  homeLayoutForSettings = value;
  return value;
}
export function setVaultSettings(value) {
  vaultSettings = value;
  return value;
}
export function setSettingsSection(value) {
  settingsSection = value;
  return value;
}
export function setAppInfo(value) {
  appInfo = value;
  return value;
}
export function setCardsDueTimer(value) {
  cardsDueTimer = value;
  return value;
}
export function setCardsDueCount(value) {
  cardsDueCount = value;
  return value;
}
