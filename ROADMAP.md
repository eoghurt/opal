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

## Later, in no particular order
- **Block colours** — colour any block from the current palette (saved as a
  palette slot inside the markdown, so switching palettes recolours).
- **Downloadable palettes** — get more palettes as small files in the vault.
- **Spreadsheet and slide notes** — new file types via `src/editor-registry.js`.
- **Search, columns view, canvas view.**
- **Calendar extras** — month view, repeating events, reminders.
- **Richer file viewing** — old .doc/.ppt/.xls files, HEIC photos, chart
  and SmartArt drawing in slides, speaker notes.
- **Edit conflicts** — when a note is typed in Opal and changed elsewhere at
  the same moment, offer both versions instead of keeping Opal's.
- **Dark mode.**
