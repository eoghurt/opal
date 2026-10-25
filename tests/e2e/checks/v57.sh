# ---- The explorer (⌘O): columns, keys, ⌘\ split into 2 and 3 panes, drag files between panes (and Undo), several at once, list view remembered, search, Escape ----
C --key Escape >/dev/null
EN="$V/School/English"
xopen() { M "require('electron').BrowserWindow.getAllWindows()[0].webContents.send('ui:search','open')" >/dev/null; sleep 0.8; }
split() { M "require('electron').BrowserWindow.getAllWindows()[0].webContents.send('ui:toggle-sidebar')" >/dev/null; sleep 0.5; }
sel() { C "[...document.querySelectorAll('.xp-pane')][${1:-0}].querySelector('.xp-row.is-sel .xp-name')?.textContent || ''" | tr -d '"'; }
# Whether the drop target $2 lights up while the row at path $1 is dragged over it.
lit() { C "(()=>{const src=document.querySelector('[data-path=\"$1\"]'); const dst=document.querySelector('$2'); if(!src||!dst) return 'missing'; const dt=new DataTransfer(); src.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:dt})); dst.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:dt})); const on=dst.classList.contains('is-drop'); src.dispatchEvent(new DragEvent('dragend',{bubbles:true})); return on})()"; }
# A real mouse drag of the row at path $1 onto $2 (a CSS selector), as Chrome does it.
drag() { local a=$(xy "document.querySelector('[data-path=\"$1\"]')"); local b=$(xy "document.querySelector('$2')"); C --dnd "$a,$b"; }

openfile "Essay plan"; sleep 0.5
xopen
ok "⌘O opens the explorer on the open note's folder, the note picked" '[[ $(C "document.querySelectorAll(\".xp-scrim\").length") == 1 && "$(sel)" == "Essay plan" && $(C "document.querySelector(\".xp-phead\").textContent") == *"School/English"* ]]'
ok "columns show the way down: the vault, School, English" '[[ $(C "document.querySelectorAll(\".xp-col\").length") == 3 && $(C "[...document.querySelectorAll(\".xp-row.is-path .xp-name\")].map(e=>e.textContent).join()") == "\"School,English\"" ]]'
ok "rows are 24 px" '[[ $(C "document.querySelector(\".xp-row\").getBoundingClientRect().height") == 24 ]]'
C --key ArrowDown >/dev/null; sleep 0.2
ok "↓ moves down the folder" '[[ "$(sel)" == "Poetry anthology" ]]'
C --key ArrowLeft >/dev/null; sleep 0.2
ok "← goes out to the folder" '[[ "$(sel)" == "English" ]]'
C --key ArrowUp >/dev/null; sleep 0.2
ok "↑ to another folder shows what's in it" '[[ "$(sel)" == "Chemistry" && $(C "document.querySelector(\".xp-phead\").textContent") == *"School/Chemistry"* ]]'
C --key ArrowDown >/dev/null; C --key ArrowRight >/dev/null; sleep 0.2
ok "→ goes into it" '[[ "$(sel)" == "Chapter 3 notes" ]]'

# ---- Split, then drag a file into a folder in the other pane ----
split
ok "⌘\\ splits the explorer into 2 panes (and leaves the sidebar alone)" '[[ $(C "document.querySelectorAll(\".xp-pane\").length") == 2 && $(C "document.getElementById(\"sidebar\").panel.isClosed()") == false ]]'
C "[...document.querySelectorAll('.xp-pane')][1].querySelector('.xp-crumb:nth-of-type(2)') ? 1 : 0" >/dev/null
C "[...[...document.querySelectorAll('.xp-pane')][1].querySelectorAll('.xp-crumb')].find(b=>b.textContent==='School').click(); 1" >/dev/null; sleep 0.3
LIT=$(lit "School/English/Poetry anthology.md" ".xp-pane:nth-child(2) [data-path=\"School/History\"]"); DROP=$(drag "School/English/Poetry anthology.md" ".xp-pane:nth-child(2) [data-path=\"School/History\"]"); sleep 1.5
ok "dragging Poetry anthology (a real mouse drag) onto History in the other pane lights it up and moves the file on disk" '[[ "$LIT" == true && "$DROP" == "\"dropped\"" && -f "$V/School/History/Poetry anthology.md" && ! -f "$EN/Poetry anthology.md" ]]'
ok "a message says where it went, with Undo" '[[ $(C "[...document.querySelectorAll(\".toast\")].map(t=>t.textContent).join()") == *"Moved Poetry anthology to History"*"Undo"* ]]'
C "[...document.querySelectorAll('.toast-btn')].find(b=>b.textContent==='Undo').click(); 1" >/dev/null; sleep 1.5
ok "Undo moves it back" '[[ -f "$EN/Poetry anthology.md" && ! -f "$V/School/History/Poetry anthology.md" ]]'

# ---- Several at once: ⌘-click picks, one drag moves them all ----
C "[...document.querySelectorAll('.xp-pane')][0].querySelector('[data-path=\"School/English/Chapter 3 notes.md\"]').dispatchEvent(new MouseEvent('click',{bubbles:true})); 1" >/dev/null; sleep 0.2
C "[...document.querySelectorAll('.xp-pane')][0].querySelector('[data-path=\"School/English/Poetry anthology.md\"]').dispatchEvent(new MouseEvent('click',{bubbles:true,metaKey:true})); 1" >/dev/null; sleep 0.2
ok "⌘-click picks a second file" '[[ $(C "document.querySelectorAll(\".xp-pane:first-child .xp-row.is-sel, .xp-pane:first-child .xp-row.is-picked\").length") == 2 ]]'
drag "School/English/Poetry anthology.md" ".xp-pane:nth-child(2) [data-path=\"School/Maths\"]" >/dev/null; sleep 2
ok "dragging one of them moves both" '[[ -f "$V/School/Maths/Poetry anthology.md" && -f "$V/School/Maths/Chapter 3 notes.md" && ! -f "$EN/Chapter 3 notes.md" ]]'
C "[...document.querySelectorAll('.toast-btn')].find(b=>b.textContent==='Undo').click(); 1" >/dev/null; sleep 2
ok "…and Undo puts both back" '[[ -f "$EN/Poetry anthology.md" && -f "$EN/Chapter 3 notes.md" ]]'
drag "School/English/Essay plan.md" ".xp-pane:nth-child(2) [data-path=\"School/English\"]" >/dev/null; sleep 0.8
ok "dropping a file on its own folder does nothing" '[[ -f "$EN/Essay plan.md" ]]'

split
ok "⌘\\ again: 3 panes, each one column" '[[ $(C "document.querySelectorAll(\".xp-pane\").length") == 3 && $(C "document.querySelectorAll(\".xp-pane:nth-child(3) .xp-col\").length") == 1 ]]'
C --key "Meta+2" >/dev/null; sleep 0.2
ok "⌘2 moves to the second pane" '[[ $(C "[...document.querySelectorAll(\".xp-pane\")].findIndex(p=>p.classList.contains(\"is-focus\"))") == 1 ]]'
C "document.querySelector('.xp-pane:nth-child(3) .xp-close').click(); 1" >/dev/null; sleep 0.2
ok "× closes a pane" '[[ $(C "document.querySelectorAll(\".xp-pane\").length") == 2 ]]'
C "document.querySelector('[aria-label=\"One pane\"]').click(); 1" >/dev/null; sleep 0.2

# ---- List view, remembered ----
C "document.querySelector('.xp-tool[aria-label=\"List\"]').click(); 1" >/dev/null; sleep 0.8
ok "List shows one tree, opened down to the selection" '[[ $(C "document.querySelectorAll(\".xp-col.is-list\").length") == 1 && $(C "[...document.querySelectorAll(\".xp-chev\")].filter(c=>c.textContent===\"▾\").length") -ge 1 ]]'
ok "…starting at the pane's top folder (School), the path a shortcut up" '[[ $(C "document.querySelector(\".xp-phead\").textContent") == *"School"* && $(C "document.querySelector(\".xp-col.is-list .xp-row .xp-name\").textContent") == "\"Chemistry\"" ]]'
C "[...document.querySelectorAll('.xp-crumb')][0].click(); 1" >/dev/null; sleep 0.2
ok "clicking the vault in the path lists the whole vault" '[[ $(C "document.querySelector(\".xp-col.is-list .xp-row .xp-name\").textContent") == "\"Calendar\"" ]]'
ok "…and is remembered in the vault's .opal/settings.json" 'grep -q "\"view\": \"list\"" "$V/.opal/settings.json"'
C --key Escape >/dev/null; sleep 0.3; xopen
ok "reopening keeps the list view" '[[ $(C "document.querySelectorAll(\".xp-col.is-list\").length") == 1 ]]'
C "document.querySelector('.xp-tool[aria-label=\"Columns\"]').click(); 1" >/dev/null; sleep 0.3

# ---- Typing searches; Escape clears, then closes ----
C "(()=>{const i=document.querySelector('.xp-input'); i.value='essay'; i.dispatchEvent(new Event('input')); return 1})()" >/dev/null; sleep 1.2
ok "typing swaps the panes for results: names, then lines in notes" '[[ $(C "document.querySelectorAll(\".xp-pane\").length") == 0 && $(C "document.querySelector(\".xp-results\").textContent") == *"Names"*"Essay plan"*"In notes"* ]]'
C --key Escape >/dev/null; sleep 0.3
ok "Escape clears the search and the panes come back" '[[ $(C "document.querySelector(\".xp-input\").value") == "\"\"" && $(C "document.querySelectorAll(\".xp-pane\").length") == 1 ]]'
C --key Escape >/dev/null; sleep 0.3
ok "Escape again closes it" '[[ $(C "document.querySelectorAll(\".xp-scrim\").length") == 0 ]]'

# ---- Enter opens; right-click is the sidebar's menu; ⌘\ hides the sidebar when it's closed ----
xopen
C --key ArrowUp >/dev/null; C --key Enter >/dev/null; sleep 1.2
ok "↵ opens the picked note" '[[ $(C "document.title") == "\"Chapter 3 notes — Opal\"" && $(C "document.querySelectorAll(\".xp-scrim\").length") == 0 ]]'
xopen
C "document.querySelector('.xp-row.is-sel').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:400,clientY:300})); 1" >/dev/null; sleep 0.4
ok "right-click shows the same menu as the sidebar" '[[ $(C "document.querySelector(\".ctx-menu\")?.textContent || \"\"") == *"Rename…"*"Show in Finder"* ]]'
C "[...document.querySelectorAll('.ctx-item')].find(b=>b.textContent.startsWith('Rename')).click(); 1" >/dev/null; sleep 0.4
ok "Rename's name box sits above the explorer" '[[ $(C "Number(getComputedStyle(document.querySelector(\".ask\")).zIndex) > Number(getComputedStyle(document.querySelector(\".xp-scrim\")).zIndex)") == true ]]'
C "(()=>{const i=document.querySelector('.ask-input'); i.value='Chapter 3 summary'; return 1})()" >/dev/null
C --key Enter >/dev/null; sleep 1.5
ok "…Enter there renames it (not opens it), and the explorer shows the new name" '[[ -f "$EN/Chapter 3 summary.md" && ! -f "$EN/Chapter 3 notes.md" && $(C "document.querySelectorAll(\".xp-scrim\").length") == 1 && $(C "[...document.querySelectorAll(\".xp-name\")].some(n=>n.textContent===\"Chapter 3 summary\")") == true ]]'
C --key Escape >/dev/null; sleep 0.3
split
ok "with the explorer closed, ⌘\\ still hides the sidebar" '[[ $(C "document.getElementById(\"sidebar\").panel.isClosed()") == true ]]'
split
