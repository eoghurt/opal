// Settings: sections down the left (like Obsidian's settings), their options
// on the right. Redrawn after every change.
//
//   renderSettings(container, { section, look, palette, settings, info, extraSections, io })
//   settings: this vault's settings (see DEFAULT_SETTINGS), kept in .opal/settings.json
//   io: setSection(id), setLook(change), setPalette(name), saveSettings(patch),
//       switchVault(), revealVault()
// extraSections: [{ id, label, icon, title, desc, render() → element }] added by
// other parts of Opal (the home page's widgets); they go in the Widgets &
// Fidgets group unless they say otherwise (group: 'opal').
//
// The sections come in two groups: Opal's own settings, and Widgets & Fidgets
// (an overview of every widget and fidget, then each one's settings).

import { h, icon } from '../ui.js';
import { themePicker, paletteGrid } from './palettes-view.js';
import { WIDGETS } from '../widgets/index.js';
import { FIDGETS } from '../fidgets/index.js';

export const DEFAULT_SETTINGS = {
  pomodoro: { focus: 25, short: 5, long: 15, rounds: 4, autoStart: true },
  tabs: { restore: true },
};

// This vault's settings with anything missing filled in from the defaults.
export function withDefaults(saved) {
  const s = saved && typeof saved === 'object' ? saved : {};
  const out = {};
  for (const [key, defaults] of Object.entries(DEFAULT_SETTINGS)) out[key] = { ...defaults, ...(s[key] && typeof s[key] === 'object' ? s[key] : {}) };
  for (const [key, value] of Object.entries(s)) if (!(key in out)) out[key] = value;
  return out;
}

const SHORTCUTS = [
  ['Notes', [['⌘N', 'New note'], ['⌘⇧N', 'New folder'], ['⌘O', 'Open a note by name'], ['⌘⇧F', 'Search every note'], ['⌘-click a link', 'Open it in a new tab']]],
  ['Tabs', [['⌘T', 'New tab'], ['⌘W', 'Close tab'], ['⌃Tab / ⌃⇧Tab', 'Next / previous tab'], ['⌘1 … ⌘8', 'Go to that tab'], ['⌘9', 'Go to the last tab']]],
  ['Moving around', [['⌘[ / ⌘]', 'Back / forward'], ['⌘⇧H', 'Home'], ['⌘⇧D', 'Calendar'], ['⌘⇧T', 'Tasks'], ['⌘⇧M', 'Money'], ['⌘⇧B', 'Debate'], ['⌘\\', 'Show or hide the sidebar'], ['⌘,', 'Settings']]],
  ['Writing', [['⌘B / ⌘I / ⌘U', 'Bold / italic / underline'], ['⌘K', '[[Link]]'], ['⌘Z / ⌘⇧Z', 'Undo / redo'], ['⌘⌥T', 'Insert a table']]],
];

// One setting: its name and explanation on the left, the control on the right.
function row(name, desc, control) {
  return h('div', { class: 'set-row' },
    h('div', { class: 'set-info' },
      h('span', { class: 'set-name' }, name),
      desc ? h('span', { class: 'set-desc' }, desc) : null),
    h('div', { class: 'set-control' }, control));
}

export function toggle(on, onChange, label) {
  return h('button', {
    class: `set-toggle${on ? ' is-on' : ''}`,
    role: 'switch',
    'aria-checked': String(Boolean(on)),
    'aria-label': label,
    onclick: () => onChange(!on),
  }, h('span', { class: 'set-toggle-knob' }));
}

function minutesInput(value, onChange, label, { min = 1, max = 180 } = {}) {
  const input = h('input', { class: 'set-number', type: 'number', min: String(min), max: String(max), value: String(value), 'aria-label': label });
  input.addEventListener('change', () => {
    const n = Math.round(Number(input.value));
    if (Number.isFinite(n) && n >= min && n <= max) onChange(n);
    else input.value = String(value);
  });
  return h('span', { class: 'set-number-wrap' }, input, h('span', { class: 'set-unit' }, label.startsWith('Rounds') ? 'rounds' : 'min'));
}

function heading(text) {
  return h('h2', { class: 'set-h2' }, text);
}

const GROUPS = [['opal', 'Settings'], ['parts', 'Widgets & Fidgets']];

const SECTIONS = [
  { id: 'appearance', group: 'opal', label: 'Appearance', icon: 'palette', title: 'Appearance.', desc: 'Light or dark for the whole app; the palette colours your folders, pages and events.' },
  { id: 'tabs', group: 'opal', label: 'Tabs', icon: 'columns', title: 'Tabs.', desc: 'Pages open in tabs, like Obsidian. ⌘-click anything to open it in a new tab; a pinned tab keeps its page.' },
  { id: 'vault', group: 'opal', label: 'Vault', icon: 'folderOpen', title: 'Vault.', desc: 'The folder of notes Opal is showing, and where Opal keeps its own things.' },
  { id: 'shortcuts', group: 'opal', label: 'Shortcuts', icon: 'keyboard', title: 'Shortcuts.', desc: 'Keys that work everywhere in Opal.' },
  { id: 'about', group: 'opal', label: 'About', icon: 'info', title: 'About Opal.', desc: 'Notes that live in plain files.' },
  { id: 'parts', group: 'parts', label: 'Overview', icon: 'widget', title: 'Widgets & Fidgets.', desc: 'Widgets are small things inside a page that do one job. Fidgets are bigger, and take up a whole page of their own.' },
  { id: 'timer', group: 'parts', label: 'Timer', icon: 'timer', title: 'Timer.', desc: 'The timer (on the home page, and behind Start prep in Debate): a plain countdown for prep, or Pomodoro — focus, short break, repeat, then a long break.' },
];

function appearance({ look, palette, io }) {
  return [
    heading('Light or dark'),
    themePicker(look, io.setLook),
    heading('Palette'),
    paletteGrid(palette, io.setPalette),
  ];
}

function timer({ settings, io }) {
  const p = settings.pomodoro;
  const set = (patch) => io.saveSettings({ pomodoro: { ...p, ...patch } });
  return [
    heading('Pomodoro'),
    row('Focus', 'How long each focus part lasts.', minutesInput(p.focus, (n) => set({ focus: n }), 'Focus minutes')),
    row('Short break', 'The break after each focus part.', minutesInput(p.short, (n) => set({ short: n }), 'Short break minutes', { max: 60 })),
    row('Long break', 'The longer break after a full set.', minutesInput(p.long, (n) => set({ long: n }), 'Long break minutes', { max: 90 })),
    row('Long break after', 'Focus parts in a set before the long break.', minutesInput(p.rounds, (n) => set({ rounds: n }), 'Rounds before a long break', { max: 12 })),
    row('Start the next part by itself', 'Off: each break or focus part waits for you to press Start.', toggle(p.autoStart, (on) => set({ autoStart: on }), 'Start the next part by itself')),
    h('p', { class: 'set-note' }, 'Each finished focus part is saved in the home page’s numbers (.opal/logbook.md), linked to the note that was open, like a prep session.'),
  ];
}

function tabsSection({ settings, io }) {
  const t = settings.tabs;
  return [
    heading('Tabs'),
    row('Reopen tabs when Opal starts', 'The open tabs are kept in the vault’s hidden .opal/workspace.json.', toggle(t.restore, (on) => io.saveSettings({ tabs: { ...t, restore: on } }), 'Reopen tabs when Opal starts')),
    heading('Using tabs'),
    h('ul', { class: 'set-list' },
      h('li', null, h('b', null, '⌘-click'), ' a note, folder, link or section — or right-click → Open in new tab.'),
      h('li', null, h('b', null, 'Pin'), ' a tab (right-click it): it keeps its page, and anything opened from it goes to a new tab.'),
      h('li', null, h('b', null, 'Drag'), ' tabs to reorder them; middle-click closes one.'),
      h('li', null, h('b', null, '⌘T / ⌘W'), ' new / close tab · ', h('b', null, '⌃Tab'), ' next tab · ', h('b', null, '⌘1–9'), ' jump to a tab.')),
  ];
}

function vaultSection({ info, io }) {
  const vault = info && info.vault;
  return [
    heading('This vault'),
    row(vault ? vault.name : 'No vault', vault ? vault.path : '', h('div', { class: 'set-buttons' },
      h('button', { class: 'set-btn', onclick: io.revealVault }, 'Show in Finder'),
      h('button', { class: 'set-btn', onclick: io.switchVault }, 'Switch vault…'))),
    heading('Where Opal keeps things'),
    h('ul', { class: 'set-list' },
      h('li', null, h('b', null, 'Your notes'), ' — plain markdown files in the vault. Nothing is kept anywhere else, so the vault opens in Obsidian too.'),
      h('li', null, h('b', null, 'Folder settings'), ' — a hidden .opal.md in each folder: colours, order, templates, databases, the home page’s widgets.'),
      h('li', null, h('b', null, '.opal/'), ' — a hidden folder: version history, the logbook of words and timer sessions, these settings and your open tabs.'),
      h('li', null, h('b', null, 'Theme and palette'), ' — Opal’s own preferences on this Mac, so every vault looks the same.')),
  ];
}

// Every widget and fidget: what it is, where to find it, and its settings.
function partsSection({ io }, sections) {
  const card = (part) => h('div', { class: `part-card${part.off ? ' is-off' : ''}` },
    h('span', { class: 'part-icon', 'aria-hidden': 'true' }, icon(part.icon, 18)),
    h('div', { class: 'part-info' },
      h('span', { class: 'part-name' }, part.name, part.off ? h('span', { class: 'part-badge' }, 'off for now') : null),
      h('span', { class: 'part-what' }, part.what),
      h('span', { class: 'part-where' }, part.where)),
    part.settings && sections.some((s) => s.id === part.settings)
      ? h('button', { class: 'set-btn part-settings', onclick: () => io.setSection(part.settings) }, 'Settings')
      : null);
  return [
    heading('Widgets'),
    h('p', { class: 'set-note' }, 'Small and simple: they live inside a note or on the home page.'),
    h('div', { class: 'part-list' }, WIDGETS.map(card)),
    heading('Fidgets'),
    h('p', { class: 'set-note' }, 'Heavier: each one is a whole page of its own.'),
    h('div', { class: 'part-list' }, FIDGETS.map(card)),
  ];
}

function shortcuts() {
  return SHORTCUTS.map(([group, keys]) => h('div', { class: 'set-keys' },
    heading(group),
    keys.map(([k, what]) => h('div', { class: 'set-key-row' }, h('span', { class: 'set-key-what' }, what), h('kbd', { class: 'set-kbd' }, k)))));
}

function about({ info }) {
  return [
    row('Version', null, h('span', { class: 'set-value' }, info ? info.version : '')),
    h('p', { class: 'set-note' }, 'Opal is a local-first notes app. Your notes are markdown files on your Mac — Opal reads and writes them directly and never uploads them.'),
  ];
}

export function renderSettings(container, opts) {
  const extras = (opts.extraSections || []).map((s) => ({ group: 'parts', ...s }));
  const parts = SECTIONS.filter((s) => s.group === 'parts');
  const sections = [...SECTIONS.filter((s) => s.group === 'opal'), parts[0], ...extras, ...parts.slice(1)];
  const section = sections.find((s) => s.id === opts.section) || sections[0];
  const tab = (s) => h('button', {
    class: `settings-tab${s.id === section.id ? ' is-on' : ''}`,
    'aria-current': s.id === section.id ? 'page' : null,
    'data-section': s.id,
    onclick: () => opts.io.setSection(s.id),
  }, icon(s.icon, 15), s.label);
  const nav = h('nav', { class: 'settings-nav', 'aria-label': 'Settings sections' },
    GROUPS.flatMap(([id, label]) => [
      h('span', { class: 'mono-label settings-nav-label' }, label),
      ...sections.filter((s) => s.group === id).map(tab),
    ]));
  let body;
  if (section.render) body = section.render();
  else if (section.id === 'parts') body = partsSection(opts, sections);
  else if (section.id === 'appearance') body = appearance(opts);
  else if (section.id === 'timer') body = timer(opts);
  else if (section.id === 'tabs') body = tabsSection(opts);
  else if (section.id === 'vault') body = vaultSection(opts);
  else if (section.id === 'shortcuts') body = shortcuts();
  else body = about(opts);
  const main = h('div', { class: 'settings-body' },
    h('header', { class: 'settings-head' },
      h('span', { class: 'mono-label' }, `Settings · ${section.label}`),
      h('h1', { class: 'display home-h1' }, section.title),
      h('p', { class: 'home-desc' }, section.desc)),
    h('div', { class: 'settings-content' }, body));
  container.replaceChildren(h('div', { class: 'settings' }, nav, main));
}
