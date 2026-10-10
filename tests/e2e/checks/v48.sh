# ---- Review decks: keep only some, folders, renaming, card types ----
C "window.__errs=[]; addEventListener(\"error\",e=>window.__errs.push(e.message)); addEventListener(\"unhandledrejection\",e=>window.__errs.push(String(e.reason))); 1" >/dev/null
mkdir -p "$V/School/English/Memory"
printf -- '### Love and family\n\n"My father is the oldest man in the world" - Chapel\n\n"I am his only son and he loves me" - Chapel\n\n### Time / the past / the future\n\n"The future is just more of the past waiting to happen" - Whitechapel\n' > "$V/School/English/Memory/Quotes.md"
printf -- '"Duplicate line from another note here" - Someone\n' > "$V/School/English/Memory/Quotes on form.md"
F="School/English/Memory"
printf '{"flashcards":{"keepOnly":["theme:%s::Love and family","theme:%s::Time / the past / the future"],"folders":[{"name":"Memory","decks":["theme:%s::Love and family","theme:%s::Time / the past / the future"]}],"names":{"theme:%s::Time / the past / the future":"Time and memory"}}}' $F $F $F $F $F > "$V/.opal/settings.json"
M "require('electron').BrowserWindow.getAllWindows()[0].webContents.reload(); 1" >/dev/null; sleep 6
C "document.querySelector('#rail [data-section=\"flashcards\"]').click(); 1" >/dev/null; sleep 2.5
ok "Keep only: just the chosen decks, grouped in their folder" '[[ $(C "[...document.querySelectorAll(\".review-decks:not(.is-sub) .review-deck\")].map(b=>b.textContent).join(\"|\")") == "\"All decks3| Memory3|Edit decks\"" ]]'
ok "…and every other deck is hidden in .opal/settings.json" 'grep -q "\"hidden\"" "$V/.opal/settings.json" && ! grep -q keepOnly "$V/.opal/settings.json"'
C "[...document.querySelectorAll('.review-deck')].find(b=>b.textContent.includes('Memory')).click(); 1" >/dev/null; sleep 0.6
ok "picking the folder practises its decks together, each still pickable (renamed one too)" '[[ $(C "[...document.querySelectorAll(\".review-decks.is-sub .review-deck\")].map(b=>b.textContent).join(\"|\")") == "\"Love and family2|Time and memory1\"" ]] && [[ $(C "document.querySelector(\".review-head .home-desc\").textContent") == "\"3 to go"* ]]'
C "(()=>{const s=document.querySelector('.review-type-pick'); s.value='basic'; s.dispatchEvent(new Event('change')); return 1})()" >/dev/null; sleep 0.8
ok "a card's type can be changed to Basic (front: who and where, back: the quote)" '[[ $(C "!document.querySelector(\".review-modes\") && document.querySelector(\".review-q\").textContent.length > 0") == "true" ]] && grep -q "cardTypes" "$V/.opal/settings.json"'
C "[...document.querySelectorAll('.review-deck')].find(b=>b.textContent==='Edit decks').click(); 1" >/dev/null; sleep 0.6
ok "Edit decks lists every deck, hidden ones too" '[[ $(C "document.querySelectorAll(\".review-ed-row:not(.is-labels)\").length > 3 && document.querySelectorAll(\".review-ed-row.is-hidden\").length > 0") == "true" ]]'
ok "no errors" '[[ $(C "JSON.stringify(window.__errs||[])") == "\"[]\"" ]]'
