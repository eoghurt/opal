// Keyboard shortcuts, mouse back/forward buttons, and the menu commands
// (File, View: ⌘N, ⌘[, ⌘⇧D…) that main sends to the window. Moved out of
// renderer.js unchanged; renderer.js calls installShortcuts() where they were.

import { newFolder, newNote, openReminder, startSearch } from '../renderer.js';
import { activeTabId, setNewTabAt, tabs, vault } from './state.js';
import { activateTab, closeTab, goHistory, newTab, openFolder, stepTab, togglePin } from './navigation.js';
import { showCalendar, showDebate, showMoney, showSettings, showTasks } from './screens.js';
export function installShortcuts() {
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
    setNewTabAt(event.metaKey && !event.target.closest('#tabbar, #topbar .bar-history') ? Date.now() : 0);
  }, true);

  // Middle-click on a note or folder in the sidebar: a new tab too.
  document.addEventListener('auxclick', (event) => {
    if (event.button !== 1) return;
    const item = event.target.closest('#sidebar .side-file, #sidebar .side-name');
    if (!item) return;
    event.preventDefault();
    setNewTabAt(Date.now());
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

  window.opal.onShowLogbook(() => vault && openFolder(''));

  window.opal.onShowTasks(() => showTasks());

  window.opal.onShowMoney(() => showMoney());

  window.opal.onShowDebate(() => showDebate());


  window.opal.onOpenReminder(openReminder);

  window.opal.onSearch(startSearch);
}
