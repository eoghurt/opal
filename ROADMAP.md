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

## Later (v0.3 – v1.0), in no particular order
- **Folder previews** — the white sheets peeking out of a folder tile show
  previews of the first pages inside it.
- **Sticky notes anywhere** — place sticky notes freely on any page.
- **Daily calendar** — like Apple Calendar, with Google Calendar-style
  colours, and events that can link to pages.
- **Logbook** — an overview across periods of time (like a year heatmap /
  activity grid).
- **Block colours** — colour any block from the current palette (saved as a
  palette slot inside the markdown, so switching palettes recolours).
- **Downloadable palettes** — get more palettes as small files in the vault.
- **Spreadsheet and slide notes** — new file types via `src/editor-registry.js`.
- **Search, columns view, canvas view.**
- **Richer file viewing** — old .doc/.ppt/.xls files, HEIC photos, chart
  and SmartArt drawing in slides, speaker notes.
- **Edit conflicts** — when a note is typed in Opal and changed elsewhere at
  the same moment, offer both versions instead of keeping Opal's.
