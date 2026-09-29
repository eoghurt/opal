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

## Later
- **Block colours** — colour any block from the current palette (saved as a
  palette slot inside the markdown, so switching palettes recolours).
