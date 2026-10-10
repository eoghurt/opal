# ---- Review decks: keep only some, folders, renaming, card types ----
C "window.__errs=[]; addEventListener(\"error\",e=>window.__errs.push(e.message)); addEventListener(\"unhandledrejection\",e=>window.__errs.push(String(e.reason))); 1" >/dev/null
mkdir -p "$V/School/English/Memory"
printf -- '### Love and family\n\n"My father is the oldest man in the world" - Chapel\n\n"I am his only son and he loves me" - Chapel\n\n### Time / the past / the future\n\n"The future is just more of the past waiting to happen" - Whitechapel\n' > "$V/School/English/Memory/Quotes.md"
printf -- '"Duplicate line from another note here" - Someone\n' > "$V/School/English/Memory/Quotes on form.md"
F="School/English/Memory"
printf '{"flashcards":{"keepOnly":["theme:%s::Love and family","theme:%s::Time / the past / the future"],"folders":[{"name":"Memory","decks":["theme:%s::Love and family","theme:%s::Time / the past / the future"]}],"names":{"theme:%s::Time / the past / the future":"Time and memory"}}}' $F $F $F $F $F > "$V/.opal/settings.json"
M "require('electron').BrowserWindow.getAllWindows()[0].webContents.reload(); 1" >/dev/null; sleep 6
C "document.querySelector('#rail [data-section=\"flashcards\"]').click(); 1" >/dev/null; sleep 2.5
ok "Keep only: just the chosen decks, grouped in their folder" '[[ $(C "[...document.querySelectorAll(\".review-decks:not(.is-sub) button.review-deck\")].map(b=>b.textContent).join(\"|\")") == "\"All decks3| Memory3|+ Folder|Edit decks\"" ]]'
ok "…and every other deck is hidden in .opal/settings.json" 'grep -q "\"hidden\"" "$V/.opal/settings.json" && ! grep -q keepOnly "$V/.opal/settings.json"'
C "[...document.querySelectorAll('.review-deck')].find(b=>b.textContent.includes('Memory')).click(); 1" >/dev/null; sleep 0.6
ok "picking the folder practises its decks together, each still pickable (renamed one too)" '[[ $(C "[...document.querySelectorAll(\".review-decks.is-sub .review-deck\")].map(b=>b.textContent).join(\"|\")") == "\"Love and family2|Time and memory1\"" ]] && [[ $(C "document.querySelector(\".review-head .home-desc\").textContent") == "\"3 to go"* ]]'
C "[...document.querySelectorAll('.review-type-seg button')].find(b=>b.textContent==='Basic').click(); 1" >/dev/null; sleep 0.8
ok "a card's type can be changed to Basic (front: who and where, back: the quote)" '[[ $(C "!document.querySelector(\".review-modes\") && document.querySelector(\".review-q\").textContent.length > 0") == "true" ]] && grep -q "cardTypes" "$V/.opal/settings.json"'
C "[...document.querySelectorAll('.review-deck')].find(b=>b.textContent==='Edit decks').click(); 1" >/dev/null; sleep 0.6
ok "Edit decks lists every deck, hidden ones too" '[[ $(C "document.querySelectorAll(\".review-ed-row:not(.is-labels)\").length > 3 && document.querySelectorAll(\".review-ed-row.is-hidden\").length > 0") == "true" ]]'
C "document.querySelector('.review-deck.is-edit').click(); 1" >/dev/null; sleep 0.4
ok "a card shows only Basic/Quote, a link to its note, the content and Flip" '[[ $(C "[...document.querySelectorAll(\".review-type-seg button\")].map(b=>b.textContent).join() + \"|\" + !!document.querySelector(\".review-link\") + \"|\" + document.querySelector(\".review-show\").textContent") == "\"Quote,Basic|true|Flip\"" ]]'
C "document.querySelector('.review-deck.is-add').click(); 1" >/dev/null; sleep 0.3
C "(()=>{const i=document.querySelector('.review-deck-input'); i.value='Revision'; i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); return 1})()" >/dev/null; sleep 0.5
ok "+ Folder makes a folder with the name typed in place" '[[ $(C "[...document.querySelectorAll(\".review-deck.is-folder\")].map(b=>b.textContent.trim()).join(\"|\")") == *"Revision"* ]]'
C "(()=>{const d=[...document.querySelectorAll('.review-decks.is-sub .review-deck')].find(b=>b.textContent.startsWith('Love')); const f=[...document.querySelectorAll('.review-deck.is-folder')].find(b=>b.textContent.includes('Revision')); const dt=new DataTransfer(); d.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:dt})); f.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:dt})); f.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt})); return 1})()" >/dev/null; sleep 0.6
ok "dragging a deck onto a folder moves it in (saved)" 'python3 -c "import json,sys; f=json.load(open(\"$V/.opal/settings.json\"))[\"flashcards\"][\"folders\"]; r=[x for x in f if x[\"name\"]==\"Revision\"][0]; sys.exit(0 if any(\"Love and family\" in d for d in r[\"decks\"]) else 1)"'
ok "no errors" '[[ $(C "JSON.stringify(window.__errs||[])") == "\"[]\"" ]]'
