# Opal roadmap

Rule for every version: the markdown files on disk are the only source of truth.

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

## Later, in no particular order
- **Block colours** — colour any block from the current palette (saved as a
  palette slot inside the markdown, so switching palettes recolours).
- **Downloadable palettes** — get more palettes as small files in the vault.
- **Spreadsheet and slide notes** — new file types via `src/editor-registry.js`.
- **Search, columns view, canvas view.**
- **Calendar extras** — reminders even when Opal is closed (a small menu-bar helper).
- **Tasks extras** — drag subtasks, reorder lists, repeat "when done".
- **Richer file viewing** — old .doc/.ppt/.xls files, HEIC photos, chart
  and SmartArt drawing in slides, speaker notes.
- **Edit conflicts** — when a note is typed in Opal and changed elsewhere at
  the same moment, offer both versions instead of keeping Opal's.
- **Dark mode.**
