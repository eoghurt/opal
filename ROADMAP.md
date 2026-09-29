# Opal roadmap

Rule for every version: the markdown files on disk are the only source of truth.

Versions: each finished version updates three things together — its section
here (marked done), `version` in package.json (v0.10 → 0.10.0), and a git tag
(`v0.10.0`) pushed to GitHub.

## v0.1 — Obsidian foundation (done)
Vault, sidebar tree, CodeMirror editor with autosave, [[links]], new notes.

## v0.2 — Scrapbook look (done)
The "Round 2" design (D/E/F on the Opal Design Concepts canvas):
dense bordered layout, SF Pro bold headlines + serif italics + handwriting,
six built-in colour palettes, folder home pages (a note named after its
folder becomes the description), note view with details/outline/folder
panels, new notes and folders in any folder.

## v0.3 — File viewing (done)
View-only support for PDF, images, audio, video, Word (.docx), Excel
(.xlsx/.xls/.csv) and PowerPoint (.pptx, as a reading copy). Files show in
the sidebar and folder homes, can be linked with [[name.ext]], and open in
their own Mac app with one click. File types live in file-types.json.

## v0.4 — Life tools (done)
- **Folder previews** — sheets on folder tiles show the newest files inside.
- **Sticky notes** — on any note or folder home; drag, type, recolour. Stored
  inside the markdown as a hidden comment block (shared/stickies.js).
- **Daily calendar** — Day/Week views over Calendar/YYYY-MM-DD.md daily notes;
  events are lines like `- 09:00–10:30 Title [[Page]] #c3`.
- **Logbook** — week/month/year overview: totals, activity heatmap, where you
  worked, busiest days; click a day to see and open everything from it.
- New PDF viewer (pdf.js) with collapsible page overview.

## v0.5 — Writing & organising (done)
- **Live preview** — markdown symbols hidden unless the cursor is on them;
  pop-up formatting bar over selected text; Cmd+B/I/U/K.
- **Sticky sizes** — ¼× to 2×.
- **Panels** — every side panel can be resized and closed (Cmd+\ for the sidebar).
- **Folder & page colours** — ten colours, stored as `opal-color` properties.
- **Calendar colours** — 20 fills + 20 accents per event (`#color/…`, `#accent/…`).
- **Tasks** — Google Tasks-style lists in `Tasks/*.md` (Obsidian Tasks format),
  shown in the calendar and counted in the logbook.

## v0.6 — Planning (done)
- **Month view** — whole-month grid; drag events between days; click a date for its day.
- **Repeating events** — every day / weekday / week / 2 weeks / month / year, with an
  end date and skipped days, kept in `Calendar/Repeating.md`. Moving one asks
  "just this one or every repeat?".
- **Repeating tasks** — `🔁 every week` (Obsidian Tasks style); ticking one adds the next.
- **Moving tasks** — drag to reorder or into another list, Option+↑/↓, or the List menu.

## v0.7 — Reminders (done)
- **Reminders** — Mac notifications while Opal is open: `🔔 10m` on an event's
  line (at the start, 5/10/15/30 min, 1 hour or 1 day before), and every task with a time.
- **Custom repeats** — "every 2 weeks on Monday, Wednesday", "every 3 days", "every 6 months".
- **Timed tasks in the grid** — tasks with a ⏰ time sit in the Day/Week grid; drag to reschedule.

## v0.8 — Search (done)
- **Search** — ⌘O jumps to any page, folder or file by name; ⌘⇧F searches inside
  every note and opens the note with the match selected. Also a Search button in the top bar.

## v0.9 — Tables, sleeker calendar, Inbox (done)
- **Tables** — Word-style tables inside notes, saved as HTML `<table>` (shows in
  Obsidian too): merge/split, resize columns and rows, cell colours, alignment,
  borders, margins, header row. `+ Table` in a note, or ⌘⌥T.
- **Calendar** — Apple Calendar look: tinted events, red today circle and now-line.
- **Inbox** — ⌘⇧I: quick capture into `Inbox.md`, then → task or → note; overdue,
  today, next 7 days, undated tasks, and loose checklist items from any note.

## v0.10 — Themes and editing (done)
- **Ribbon** — a Word-style editing bar at the top of every note (styles, text
  colour, lists, indent, insert link/table/sticky/date, find); the pop-up bar
  over selected text keeps just the basics.
- **Create pop-up** — new notes and folders from a pop-up like the calendar's
  (name, note/folder, where, colour); right-click or double-click empty space.
- **Links follow renames** — renaming or moving a note, file or folder updates
  every link to it across the vault. Links show as plain coloured text.
- **Themes** — Scrapbook (the original), Minimal and GitHub, picked on the
  Theme & palettes screen. Minimal and GitHub come in Light, Dark or Match Mac.
- **Minimal** — quiet paper, pill buttons, frosted folders, and a calendar of
  solid colour blocks with bold titles.
- **GitHub** — tabs, a file-tree sidebar, notes in a README box, folders as a
  file list, lists as project columns, green activity squares in the Logbook.
- **Font sets** — Scrapbook: SF Pro, Instrument Serif, Caveat, JetBrains Mono.
  Minimal: Geist, Geist Mono, Nanum Pen Script. GitHub: Mona Sans, Helvetica /
  Arial, Monaspace Neon. All bundled, nothing loaded from the web.
- **Descriptions** — a line under a note's or folder's title, edited in place
  (Enter after the name opens it), saved as the `description` property.
- **Hidden folder settings** — a folder's colour, order, description and page
  stickies live in a hidden `.opal.md` inside it, so no extra notes show in
  Finder or Obsidian. Old settings-only folder notes are moved in automatically.

## v0.11 — Tables like Word, back and forward (done)
- **Tables like Word** — the table's tools sit in a Table row of the ribbon
  while you're in a table (no floating bar); a right-click menu on cells
  (insert, merge/split, even sizes, sort, clear, delete, shading); table
  styles (plain grid, shaded header, banded rows, bold header, lines only,
  colourful); Layout: header row, centre table, even columns/rows, autofit to
  contents, fit to page, sort A→Z / Z→A; arrow keys move between cells; the
  ribbon's bold/italic/underline/strike/highlight and text colour work in cells;
  resize lines never cross merged cells.
- **Undo in tables** — ⌘Z / Ctrl+Z and ⌘Y / Ctrl+Y / ⌘⇧Z work inside table cells.
- **Back and forward** — ‹ › in the top bar, ⌘[ / ⌘], mouse side buttons and
  trackpad swipes go through the pages you've visited.
- **Pictures** — [[photo.png]], ![[photo.png]] and ![](photo.png) show the
  picture; double-click one to edit its link.
- **Dark mode fixes** — tables, search results, highlights, stickies and the
  find bar all read properly; search skips sticky data and reads table text.

## Study, writing and debate tools (done)
Everything lives in the notes, in properties, in `.opal.md` folder settings or
in the hidden `.opal` folder, so the vault still opens cleanly in Obsidian.
- **Backlinks** — "Linked from" and "Unlinked mentions" under each note, with a
  Link button that turns a mention into a [[link]].
- **Templates** — notes in `Templates/` with {{title}}, {{date}}, {{time}} and
  {{date:FORMAT}}; each folder can have a default template, plus a daily-note one.
- **Version history** — snapshots in `.opal/history` (at most every 10 minutes
  while editing, and on leaving a note); all kept for 7 days, then one a day up
  to 90 days. History shows the differences and restores (saving the current
  version first).
- **Pasting and dropping pictures** — copied into `Attachments/`, named after
  the note plus date and time, inserted as ![[name]].
- **Scrapbook sticky notes** in every theme.
- **Folder databases** — table and cards views, each with its own sort, filter
  and group; text, number, date, checkbox, select and link columns; editing a
  cell writes the note's property; new rows use the folder's template; assignment
  tracker and reading list starters.
- **Manuscript compile** — drag chapters into order, leave some out, and save
  one .docx with chapter headings and page breaks (no properties, stickies or
  comments).
- **Word counts and targets** — note and selection count in the status bar,
  folder totals, `word-target` progress bars, words written per day in the Logbook.
- **Flashcards** — Question::Answer cards in the Spaced Repetition plugin's
  format (with its <!--SR:--> schedule); Review with Again/Hard/Good/Easy; folder
  and tag decks; due counts on the Review link and on the calendar's today.
- **Prep timer** — 15/30/60/custom countdown in the top bar, a Mac notification
  when time's up, and the session saved in the Logbook linked to the open note.
- **Flow sheets** — `opal-type: flow` notes as speaker columns (Australs 3v3,
  World Schools, BP or your own), Tab between columns, export as a Word table.

## Home, tabs and settings (done)
- **Home page widgets** — the vault's home page has a clock, Today (events and
  tasks due, tick them off there), Flashcards, the Timer, Recent pages, Writing,
  and the Logbook's Numbers, Activity, Where you worked and Busiest days.
  Customize adds, removes, resizes (S/M/L) and drags them; the layout is the
  `opal-home` list in the vault's hidden .opal.md. The Logbook screen is gone.
- **Tabs like Obsidian** — in the top bar; each tab has its own back/forward;
  ⌘-click opens in a new tab; pinned tabs keep their page; drag to reorder;
  ⌘T, ⌘W, ⌃Tab, ⌘1–9; they squeeze to icons when there are many; reopened on
  start from .opal/workspace.json. Resting on a tab shows where it is, with
  each folder on the way as a link; pinned tabs are small, with an emoji and
  a colour you pick when pinning.
- **One-row top bar** — logo (as wide as the sidebar), back/forward, tabs, then
  icons (Tabler Icons) for Search, Calendar, Tasks, Review, the Timer and
  Settings. No Recent strip at the bottom.
- **Settings** — Appearance (theme, palette), Home page, Timer, Tabs, Vault,
  Shortcuts, About (⌘,). Vault settings live in .opal/settings.json.
- **Pomodoro** — focus / short break / long break, lengths in Settings; focus
  parts are saved with the timer sessions.
- **Flow sheets are templates** — apply one (or any vault template) to a note
  from its Template button; Normal note turns it back.

## Later
- **Block colours** — colour any block from the current palette (saved as a
  palette slot inside the markdown, so switching palettes recolours).
