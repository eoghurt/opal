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

## v0.9 — Tables, sleeker calendar (done)
- **Tables** — Word-style tables inside notes, saved as HTML `<table>` (shows in
  Obsidian too): merge/split, resize columns and rows, cell colours, alignment,
  borders, margins, header row. `+ Table` in a note, or ⌘⌥T.
- **Calendar** — Apple Calendar look: tinted events, red today circle and now-line.
- **Inbox** — built here (quick capture into `Inbox.md`, overdue and upcoming
  tasks, loose checklist items), switched off later and deleted in the v0.16
  clean-up. `Inbox.md` notes are left alone.

## v0.10 — Themes and editing (done)
- **Ribbon** — a Word-style editing bar at the top of every note (styles, text
  colour, lists, indent, insert link/table/sticky/date, find). Since v0.12 it is
  one slim bar of line icons; the pop-up bar over selected text is gone (the
  shortcuts still work).
- **Create pop-up** — new notes and folders from a pop-up like the calendar's
  (name, note/folder, where, colour); right-click or double-click empty space.
- **Links follow renames** — renaming or moving a note, file or folder updates
  every link to it across the vault. Links show as plain coloured text.
- **Theme** — Minimal: quiet paper, pill buttons and a calendar of solid colour
  blocks with bold titles, in Light, Dark or Match Mac (Settings › Appearance),
  coloured by one of the palettes. (Scrapbook and GitHub themes were built here
  and retired in v0.12.)
- **Fonts** — Geist and Geist Mono for the app, Inter for notes (since v0.12),
  Nanum Pen Script and Caveat for handwriting. All bundled, nothing loaded from
  the web.
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

## v0.12 — Study tools, home, fidgets and the new frame (done)
Everything built between v0.11 and Mail, numbered afterwards (tagged on the
last commit before Mail).

### Study, writing and debate tools
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

### Home, tabs and settings
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
- **The frame** — since v0.12 (design B): a rail of icons on the left (home,
  search, the fidgets, settings), the open tabs listed down the sidebar above
  Bookmarks and Folders, and the page on a rounded sheet whose top row holds
  back/forward, the path, word count, save status and the timer.
- **Settings** — Appearance (light/dark, palette, home page), Tabs, Vault,
  Shortcuts, About, and Widgets & Fidgets (Timer) (⌘,). Vault settings
  live in .opal/settings.json.
- **Pomodoro** — focus / short break / long break, lengths in Settings; focus
  parts are saved with the timer sessions.
- **Flow sheets are templates** — apply one (or any vault template) to a note
  from its Template button; Normal note turns it back.

### Later list, round one
- **Checkboxes** — `- [ ]` items in notes show a real box; clicking it writes
  [x] / [ ] into the note; ticked items are crossed out.
- **Heatmaps from notes** — ```tracker blocks (Obsidian's Tracker plugin
  format: tag, frontmatter, text, task, dvField, fileMeta; Opal adds
  `dateProperty`) show as a year of squares with totals and streaks; a
  Heatmap ribbon button and home widget.
- **The + button** — bottom right; Note, Folder and Sticky note.
- **Tab double-click** — Show in Finder, Copy path, Copy vault path.
- **Bookmarks** — in .obsidian/bookmarks.json (Obsidian's format), with
  sections; in the sidebar (since v0.12), the note's ⋯ menu, right-click menus
  and a home widget; they follow renames.
- **Skipping in audio and video** — click the sides for 5 s, twice for 10;
  ← / →.
- **Plain exports** — PDF and Word for any note: Arial 11pt, black on white,
  A4, 2.54 cm margins. Manuscripts and flow sheets use the same style.
- **Fixed** — a task dragged between lists could get stuck on screen.

### Widgets and fidgets
- **Two kinds of "fun" features**, each in its own folder in the code:
  - **Widgets** (`src/widgets/`) are small things inside a page that do one
    job: heatmaps, tables, the home page widgets, sticky notes, the timer.
  - **Fidgets** (`src/fidgets/`) are heavier and take a whole page: calendar,
    tasks, money, debate, flashcard review, flow sheets, folder
    databases, manuscripts, the exam tracker.
  - Each folder has an `index.js` listing what's in it. Settings has a
    Widgets & Fidgets group: an overview of every one, then their settings
    (Home page, Timer).
- **Calendar** — smooth sliding between days, weeks and months (Mondays and
  month starts hold on a little); Delete/Backspace on the selected item;
  ⌘Z undo, ⇧⌘Z redo; titles edited in place; switch an event to a task and
  back; popovers stay on screen; a Tasks switch hides tasks.

### Money, and a tidier look
- **Money** fidget (design A): a month at a glance — net worth, spending
  against the budget, saving goals, income, recent entries; Budget, Saving,
  Income and History pages; quick add ("Lunch 12.50 food"); edit and delete.
  Stored in the Obsidian Ledger plugin's `transactions.ledger` (its format,
  its settings) and a `budget.ledger` beside it (Ledger's monthly budget
  format). Move money between categories for one month; carry leftovers over;
  goals are Assets:Savings accounts. Investing left out for now. ⌘⇧M.
- **Home page** — fidget tiles first (Money, Calendar, Tasks, Review), then
  the folders, then the widgets, then loose notes. (Now the classic home; the
  corkboard is the default since v0.12.)
- **Themes** — Minimal only, light or dark (Scrapbook and GitHub retired).
- **Dark mode** — scrollbars and built-in controls are dark too.

### Corkboard home and exam tracker
- **Corkboard home** — the vault's home page as a pinboard: hand-drawn month
  calendar, passport stamps that open the fidgets, today's tasks on a receipt
  with a tear-off to-do stub (Tasks/Quick list.md), quote card, folders as
  motel key tags. Switch back in Settings › Appearance.
- **Exam tracker** — in a subject folder with an "Exam tracker.md" note (or
  right-click a folder › Add an exam tracker): school mark, target, the WACE
  mark needed (2 × target − school), WACE papers read from their PDFs and
  marked question by question, by section, with the question types that lose
  the most marks. Literature tracks results only.
- **School page** — a folder whose subject folders have exam trackers opens as
  one overview (rail: Overview, Marks, Papers, Dates, Files): predicted ATAR
  and moderation read from a "Predicted ATAR" PDF, each subject's school mark,
  target and what it needs in the WACE, exam dates from calendar events that
  say WACE, latest results. Files is the normal folder page.
- **New frame (design B), 2026-10-10** — mockups: https://claude.ai/artifact/GF3rRdmSKrPmaE3nBNQq1G.
  A rail of icons on the left (home, search, the fidgets, settings); open tabs
  down the sidebar above the folders (plain-type list, option 4a); the page on
  a rounded sheet with back/forward, breadcrumb, word count, save status and the
  timer along its top. Note page: one slim editing bar with an Insert menu,
  Details in the ⋯ menu (option N2). Settings and the classic home page in the
  fidget style.
- **Quote cards, 2026-10-10** — in a note named …quote… (or tagged #quotes), each
  line starting with a quotation mark ("quote" - speaker) is a card; its folder
  is the text, the heading above its theme. Practised as First letters, Fill the
  gaps (more hidden as it sticks), Type it (marked word by word) or Who said it;
  Practise anyway runs a deck without changing dates. Bookmarks are back, in the
  sidebar.

## v0.13 — Mail, reading (done; taken out in v0.17)
- **Mail** fidget (design A, mockups: https://claude.ai/artifact/2x3wcG523GX9Z4pec2CkGw):
  Gmail accounts over IMAP (ImapFlow, XOAUTH2), parsed with mailparser, all in
  the main process (`mail/`, `mail:*` channels). Rail: People (Gmail's Primary),
  Updates (Promotions, Updates, Social, Forums) and Saved; switch between
  accounts or see them all; All / Unread / Attachments and search; the list on
  the left, the open email on the right. Right-click or double-click a message:
  Open, Reply in Gmail, mark read/unread, Save to vault, move the sender to
  People/Updates, Archive, Delete. ⌘⇧E.
- **The mailbox stays on Gmail.** A cache of headers and bodies lives in Opal's
  settings folder (mail-cache/), never in the vault. **Save to vault** writes
  `Mail/YYYY-MM-DD Subject.md` (from, to, cc, date, message-id as properties,
  the body as markdown) with attachments beside it as [[name.ext]].
- **Sign-in** — OAuth 2.0 for a desktop app with PKCE: Google's page opens in the
  browser, the reply comes back to a one-off 127.0.0.1 address. The client is
  mail-client.json (from Google Cloud Console, not in git); refresh tokens are
  encrypted with safeStorage in mail-accounts.json, never logged.
- **Safe reading** — email HTML goes through viewers/sanitize.js; cid: pictures
  become data: URLs, pictures from the web stay blocked, links open in the browser.

## v0.14 — Mail, writing (done; taken out in v0.17)
- **Writing** (design A, same mockups as 0.13): + Write, Reply, Reply all and
  Forward open a writing card in the reader's place — To / Cc / Bcc as address
  bubbles, Subject, the body in Opal's markdown editor (sent as plain text and
  as HTML made from it), the original folded underneath, attachments from the
  vault or Finder. Only the Send button sends: no shortcut, no other way. More
  than 10 people: it lists them all first. A failed send stays open with the
  reason. Unsent emails are kept in Opal's settings folder (mail-drafts/), never
  in the vault or Gmail's drafts; "N unsent" reopens them.
- **Sending** — smtp.gmail.com with Nodemailer, XOAUTH2 with the same sign-in as
  IMAP; Gmail files the copy in Sent. Replies set In-Reply-To and References and
  add "Re:" once; Reply all leaves your own address out; forwards carry the
  original attachments and quote its sender, date and text.
- **Sent** mailbox in the rail, with Save to vault (the same Mail/YYYY-MM-DD
  Subject.md notes as received mail).
- **To reply** — right-click › To reply… › Today / Tomorrow / This weekend / a
  date: a task "Reply to <subject> / <sender>" in Tasks/My Tasks.md, ending in
  [📧](a Gmail link to the email) so it works in Obsidian too. In Tasks and the
  calendar it has an envelope instead of a tick box, which opens the reply;
  sending the reply ticks it off.
- **New mail** — an IMAP IDLE connection on the Inbox while Opal runs
  (reconnects after sleep or a dropped line); new emails appear marked NEW and
  get a Mac notification (sender and subject, never the body) that opens them.
  Settings › Widgets & Fidgets › Mail turns the notifications off.
- Tests send only to Nodemailer's stream transport (OPAL_MAIL_FIXTURE), check v51.

## v0.15 — Mail, Outlook accounts (done; taken out in v0.17)
- **Outlook.com, Hotmail and Live** accounts beside Gmail (personal Microsoft
  accounts only; school and work Microsoft accounts are left out), through
  Microsoft Graph (mail/microsoft.js): sign-in with PKCE in the browser to a
  one-off http://localhost address; only the Application (client) ID is needed,
  pasted into the setup card and kept in mail-microsoft.json in Opal's settings
  folder. Refresh tokens are encrypted with safeStorage like Google's.
- People / Updates come from Outlook's Focused / Other inbox. Opening fetches
  the original email, so it reads and saves exactly like Gmail's; read/unread,
  archive and delete go back to Outlook; Sent Items show under Sent.
- Sending posts the email Nodemailer builds (threading headers kept) to Graph's
  sendMail; Outlook files the copy in Sent Items. New mail is checked every
  minute (Graph has no IDLE for desktop apps), with the same NEW mark and
  notification.
- **+ Add an account** asks Google or Microsoft; the writing card has a **From**
  picker (a reply starts on the account the email came to). "To reply" tasks for
  Outlook emails link to Outlook on the web.
- Mockups: the "0.14 · Outlook" row (now v0.15) on https://claude.ai/artifact/2x3wcG523GX9Z4pec2CkGw.
  Check v52 runs against a pretend Graph server (tests/e2e/fake-graph.mjs).

## v0.16 — Clean-up (done)
- **Versions** — the sections after v0.11 numbered (v0.12 for everything up to
  the new frame, Mail as v0.13–v0.15) and tagged on the matching commits; this
  file brought up to date with the app (one theme, the frame, the Inbox gone).
- **Inbox deleted** — switched off since v0.12; its screen, rail button, menu
  item and code are gone (Inbox.md notes are left alone).
- **Outside edits** — if another app changes a note while it has unsaved typing
  in Opal, the other app's version goes into the note's version history before
  Opal's save replaces it, and a notice offers Compare (side by side), Keep
  mine, Keep theirs, or Merge (both sets of changes, line by line; lines both
  changed are kept and marked <<<<<<< Opal / >>>>>>> Other app).
- **Errors** — a short message at the bottom of the window when a save, rename,
  move or link update fails; every error is written to opal.log in Opal's
  settings folder (opal.old.log after 1 MB); uncaught exceptions and unhandled
  rejections in the main process are caught and logged instead of lost.
- **Tests** — `npm test`: unit tests in plain Node for the code that reads and
  writes vault files (ledger, tasks, repeats, flashcard schedule, front matter
  and properties, stickies, relink, merge), then every e2e check on a fresh demo
  vault. The e2e scripts find the repo from their own location.
- **renderer.js split** — into src/app/state.js (the shared state, with
  setters), navigation.js (the save-first step queue, tabs, back/forward),
  screens.js (School, homes, Settings, the fidgets) and shortcuts.js (keys,
  mouse buttons, menu commands), with no change in behaviour.
- **One menu** — a tab's right-click menu has the same items and colours as the
  sidebar's (plus Pin, Duplicate and Close), without explanations under them.
- **Search timed on 5,000 notes (38 MB)** — the sidebar's scan 136 ms (84 ms
  after), ⌘⇧F 141–268 ms depending on matches, and no pause over 50 ms in the
  window when the sidebar redraws; all under half a second, so no search index.

## v0.17 — Mail archived (done)
- **Mail taken out of the app**, unused. It's kept whole at the git tag
  `mail-archive` (v0.16.0, the last version with it): `mail/`,
  `src/fidgets/mail/`, `shared/md-html.js`, its styles, Settings section, ⌘⇧E,
  checks v50–v52, tests/e2e/fake-graph.mjs and the sample emails. Its four
  libraries (ImapFlow, mailparser, Nodemailer, html-to-text) are uninstalled.
- To bring it back: restore those files from the tag (`git checkout mail-archive
  -- mail src/fidgets/mail …`), reinstall the libraries, and put back the lines
  that hook it up in main.js, preload.js, src/app/ and Settings (`git diff
  mail-archive v0.17.0` shows every one).
- "To reply" tasks keep their [📧](link) when Opal edits them, but have an
  ordinary tick box now. Accounts, cache and drafts in Opal's settings folder are
  left as they were (nothing reads them).

## Fidget ideas
Ethan's:
- **Bouldering tracker** — problems by gym, wall, grade and colour; sends,
  flashes and attempts; projects in progress; a grade pyramid and progress
  over time.
- **Money manager** — built (see above); investing still to come.
- **Boards** — a Pinterest-style pinboard of images and notes, styled like a
  real board: tape, pins, clips, slight tilts.
- **Debate fidget** — built 2026-10-06 (mockups: https://claude.ai/artifact/VATeYNgHVcDd2bGXRagRyG).
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
