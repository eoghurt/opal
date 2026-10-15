# Opal

Hi! This is Opal, a fast notes app for the Mac that combines my favourite features from Notion, OneNote and Obsidian into one app, which stays fast because it works straight from the files on your computer rather than from a server.

I used all 3 of those apps for school, and each one had a flaw that one of the others had already solved. Obsidian keeps your notes as plain markdown files that you own, but it leaves calendars, flashcards and file viewing to plugins that each look and behave differently. Notion has databases and clean pages, but your notes live on Notion's servers rather than as files on your computer. OneNote is good for keeping lecture slides and notes together, but it stores everything in its own format that other apps cannot open. Opal keeps Obsidian's plain files and builds the rest into the app itself, so every tool shares one design, works offline, and saves into files you can open anywhere.

## Coming from Obsidian

Opal is mainly an Obsidian alternative, and your Obsidian vault opens in it as it is. Opal reads and writes the same markdown files and uses the file formats of the plugins it replaces, so tasks stay in the Obsidian Tasks format, flashcards in the Spaced Repetition format, budgets in the Ledger plugin's files, bookmarks in Obsidian's own bookmarks.json and heatmaps in Tracker blocks. You can go back to Obsidian at any time and find everything where you left it. Opal keeps its own settings in hidden files, so nothing extra shows up in Obsidian or in Finder.

Two things do not carry over. Canvas files (.canvas) do not open in Opal, and Obsidian community plugins do not run in it, although Opal reads the files that several popular plugins write.

## Features

**Notes.** Markdown is the main way you write, with formatting shown as you type, a Word-style editing bar, [[links]] that update when you rename a note, backlinks, templates, version history kept for 90 days, and tables you can merge, style and sort like tables in Word. Any note exports to PDF or Word.

**Files.** PDFs, Word documents, PowerPoint slides, spreadsheets, images, audio and video all open inside Opal, so lecture slides and the notes about them sit in the same folder and open in the same window.

**Calendar and tasks.** Day, week and month views with repeating events, task lists, and Mac notifications for reminders. Events are saved as lines in daily notes and tasks as Obsidian Tasks lines, which means both still work if you open the vault in Obsidian.

**Flashcards.** Write a card as `Question::Answer` in any note and review it on a spaced-repetition schedule. Quote cards turn every quotation in a quotes note into practice, with modes for first letters, filling the gaps, typing it out and guessing who said it.

**Money.** A monthly budget, saving goals, income and spending history, kept in the Ledger plugin's files.

**Folders.** Any folder can become a database with table and card views, a manuscript that compiles its chapters into one Word file, or a home page with its own description and sticky notes.

**Search.** ⌘O jumps to any note, folder or file by name, and ⌘⇧F searches inside every note. Both take under a third of a second on a vault of 5,000 notes.

**School and debate.** A subject tracker shows your school mark, your target and the exam mark you need, and it marks past WACE papers question by question to show which question types lose you the most marks. A School page combines every subject and reads your predicted ATAR. I do competitive debate, so there is also a motion bank, a competition tracker, round logging and flow sheets for taking notes during a round. Practice speeches are recorded against a speech timer with the format's bells and saved as round notes beside competition rounds, with the recording, a transcript made on the Mac by whisper-cpp, and the words per minute and filler words counted from it. Claude's judging goes into the same note, so practice scores sit apart from a panel's scores on the Training page, and a practice speech can count as a trial round for a fix on the feedback board.

Quite a few of these features are built around how I work, the WACE and debate tools most of all. You don't have to use them if you don't want to, and they stay out of the way until you open them.

## Running Opal

Opal runs on macOS and needs [Node.js](https://nodejs.org) 22 or newer.

```sh
git clone https://github.com/eoghurt/opal
cd opal
npm install
npm start
```

`npm start` builds Opal and opens it, and the first launch opens a welcome screen where you choose a folder as your vault, which can be an existing Obsidian vault. To build an app you can keep in Applications, run `npm run dist`, and the app appears in the `release` folder. The app is not signed, so the first time you open it, right-click it and choose Open.

`npm test` runs the unit tests and then every end-to-end check against a demo vault.

## Bugs and ideas

Please message me on Discord at **@kleptonomics** if you find a bug or something that doesn't work the way you expect. If something goes wrong, `opal.log` in `~/Library/Application Support/Opal` has the error, and sending it with your message helps me find the cause much faster.
