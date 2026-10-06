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

## Later list, round one (done)
- **Checkboxes** — `- [ ]` items in notes show a real box; clicking it writes
  [x] / [ ] into the note; ticked items are crossed out.
- **Heatmaps from notes** — ```tracker blocks (Obsidian's Tracker plugin
  format: tag, frontmatter, text, task, dvField, fileMeta; Opal adds
  `dateProperty`) show as a year of squares with totals and streaks; a
  Heatmap ribbon button and home widget.
- **The + button** — bottom right; Note, Folder and Sticky note.
- **Tab double-click** — Show in Finder, Copy path, Copy vault path.
- **Bookmarks** — in .obsidian/bookmarks.json (Obsidian's format), with
  sections; top bar icon, note button, menus, home widget; follow renames.
- **Skipping in audio and video** — click the sides for 5 s, twice for 10;
  ← / →.
- **Plain exports** — PDF and Word for any note: Arial 11pt, black on white,
  A4, 2.54 cm margins. Manuscripts and flow sheets use the same style.
- **Fixed** — a task dragged between lists could get stuck on screen.

## Widgets and fidgets (done)
- **Two kinds of "fun" features**, each in its own folder in the code:
  - **Widgets** (`src/widgets/`) are small things inside a page that do one
    job: heatmaps, tables, the home page widgets, sticky notes, the timer.
  - **Fidgets** (`src/fidgets/`) are heavier and take a whole page: calendar,
    tasks, inbox, flashcard review, flow sheets, folder databases,
    manuscripts.
  - Each folder has an `index.js` listing what's in it. Settings has a
    Widgets & Fidgets group: an overview of every one, then their settings
    (Home page, Timer).
- **Calendar** — smooth sliding between days, weeks and months (Mondays and
  month starts hold on a little); Delete/Backspace on the selected item;
  ⌘Z undo, ⇧⌘Z redo; titles edited in place; switch an event to a task and
  back; popovers stay on screen; a Tasks switch hides tasks.

## Money, and a tidier look (done)
- **Money** fidget (design A): a month at a glance — net worth, spending
  against the budget, saving goals, income, recent entries; Budget, Saving,
  Income and History pages; quick add ("Lunch 12.50 food"); edit and delete.
  Stored in the Obsidian Ledger plugin's `transactions.ledger` (its format,
  its settings) and a `budget.ledger` beside it (Ledger's monthly budget
  format). Move money between categories for one month; carry leftovers over;
  goals are Assets:Savings accounts. Investing left out for now. ⌘⇧M.
- **Home page** — fidget tiles first (Money, Calendar, Tasks, Review), then
  the folders, then the widgets, then loose notes.
- **Themes** — Minimal only, light or dark (Scrapbook and GitHub retired).
- **Dark mode** — scrollbars and built-in controls are dark too.

## Fidget ideas
Ethan's:
- **Bouldering tracker** — problems by gym, wall, grade and colour; sends,
  flashes and attempts; projects in progress; a grade pyramid and progress
  over time.
- **Money manager** — built (see above); investing still to come.
- **Boards** — a Pinterest-style pinboard of images and notes, styled like a
  real board: tape, pins, clips, slight tilts.
- **Debate fidget** (next to build; mockups: https://claude.ai/artifact/VATeYNgHVcDd2bGXRagRyG).
  Decided 2026-10-06:
  - Layout: B3 — a slim icon rail (Overview, Motions, Comps, Log, Board,
    Training, Notes); its own overview page (B3 · Overview), not tiles;
    the motion-for-prep card is see-through dark blue.
  - Motion bank: design A (library + filters + selected motion); prep it for
    15 / 30 / 60 min (makes a note in Practice preps). No imbalanced labels.
    Star motions (#starred on the motion's line). Link reworded versions of a
    motion across competitions (a shared #version/<name> tag on each line);
    the selected motion lists its other versions with changed words
    highlighted, and Opal suggests look-alikes to link.
  - Competition tracker: both the season list and a page per competition,
    and each competition page has a tournament overview to reflect on the
    whole tournament.
  - BP is scored differently: each round is a placing (1st–4th, worth
    3/2/1/0 team points); BP competitions show the average placing and the
    1st/2nd/3rd/4th split instead of a win rate. Two-team formats keep wins.
  - Pages (all in the B3 rail): Overview, Motions, Competitions, one
    competition, Log a round (Form 1, Form 2), Board (with a card opened),
    Training (week, phase, drill bank, matter cycle, targets), Notes.
  - Opal hosts the two feedback forms (no Microsoft Forms / Excel / script);
    rounds are saved by Round ID (COMP-R#) and link to motions and cards.
  - The Schools Record table becomes one note per competition
    (Debate/Competitions/), properties for the details.
- **Exam planner** — WACE exam countdown, each subject's syllabus dot points
  ticked off as revised, linked to flashcards and practice tests.
- **Practice test log** — scores per subject and topic over time, marks lost
  by reason, what to revise next (pairs with marking feedback).
- **Quote bank** — Literature quotes by text, character and theme, with page
  numbers; pull them straight into an essay plan.
- **Case and law cards** — Politics and Law cases, legislation and
  principles, with the facts, the ruling and why it matters.
- **Motion bank** — debate motions by topic, with prep notes, arguments for
  and against, and when you ran them (links to the competition tracker).
- **Reading list / bookshelf** — books to read, reading, and read, with notes
  and ratings.
- **Habit tracker** — daily ticks that feed the heatmaps.
- **Training log** — sessions of any kind (gym, running, climbing) with a
  weekly load chart.

## Widget ideas
- **Calculator** — a small one in a note or on the home page.
- **Kanban board** — a task list as columns (to do / doing / done) inside a
  note.
- **Countdown** — days until a date (an exam, a competition, a trip).
- **Progress bar** — a goal (words, pages, savings) and how far along it is.
- **Speech timer** — debate speaking times with protected-time bells.
- **Random quote** — one from the quote bank each day on the home page.

## Later
- **Block colours** — colour any block from the current palette (saved as a
  palette slot inside the markdown, so switching palettes recolours).
- **Opal on iPhone** — at least browsing notes, tasks and the calendar.
  Options to weigh up:
  - Free now: keep the vault in iCloud Drive and open it in the free Obsidian
    iPhone app; notes, task lists and day notes are all plain markdown.
  - A web version of Opal served from the Mac: free, but only on the same
    Wi-Fi and while the Mac is on.
  - A real iPhone app built from Opal's code (e.g. with Capacitor): needs
    Xcode; free installs expire every 7 days, keeping it installed needs the
    Apple Developer Program ($99 a year).
