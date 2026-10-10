# ---- Bookmarks in the sidebar; quote cards in Review ----
C "window.__errs=[]; addEventListener(\"error\",e=>window.__errs.push(e.message)); addEventListener(\"unhandledrejection\",e=>window.__errs.push(String(e.reason))); 1" >/dev/null
ok "the sidebar has a Bookmarks section (with a hint while empty)" '[[ $(C "document.querySelector(\".side-bookmarks\").textContent") == *"Bookmark"* ]]'
C "(()=>{const e=[...document.querySelectorAll('.side-file')].find(b=>b.textContent==='Welcome'); const r=e.getBoundingClientRect(); e.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:r.x+20,clientY:r.y+5})); return 1})()" >/dev/null; sleep 0.5
C "[...document.querySelectorAll('[role=menuitem]')].find(b=>b.textContent.startsWith('Bookmark')).click(); 1" >/dev/null; sleep 1.5
ok "bookmarking a note puts it in the sidebar (and Obsidian's bookmarks.json)" '[[ $(C "[...document.querySelectorAll(\".side-bookmarks .side-bookmark\")].map(e=>e.textContent).join()") == "\"Welcome\"" ]] && grep -q "Welcome.md" "$V/.obsidian/bookmarks.json"'
mkdir -p "$V/School/English/Gatsby"
printf -- '# Gatsby quotes\n\n### Hope\n\n"So we beat on, boats against the current, borne back ceaselessly into the past." - Nick\n\n"Can'"'"'t repeat the past? Why of course you can!" - Gatsby\n\nNot a quote line - just notes\n' > "$V/School/English/Gatsby/Quotes.md"
sleep 1.5
C "document.querySelector('#rail [data-section=\"flashcards\"]').click(); 1" >/dev/null; sleep 2
C "[...document.querySelectorAll('.review-deck')].find(b=>b.textContent.startsWith('Quotes')).click(); 1" >/dev/null; sleep 0.8
ok "lines in a Quotes note become quote cards (a Quotes deck of 2)" '[[ $(C "[...document.querySelectorAll(\".review-deck\")].find(b=>b.textContent.startsWith(\"Quotes\")).textContent") == "\"Quotes2\"" ]]'
ok "…with who says it, the text (its folder) and the theme (heading)" '[[ $(C "document.querySelector(\".review-cue\").textContent") == *"Gatsby · Hope"* ]]'
C "[...document.querySelectorAll('.review-mode')].find(b=>b.textContent==='First letters').click(); 1" >/dev/null; sleep 0.3
ok "First letters shows each word's first letter" '[[ $(C "document.querySelector(\".review-quote\").textContent.replace(/\\s/g,\"\")") == "\"Sw"* || $(C "document.querySelector(\".review-quote\").textContent.replace(/\\s/g,\"\")") == "\"C"* ]]'
C "[...document.querySelectorAll('.review-mode')].find(b=>b.textContent==='Fill the gaps').click(); 1" >/dev/null; sleep 0.3
ok "Fill the gaps hides some words behind blanks" '[[ $(C "document.querySelectorAll(\".rq-gap\").length > 0") == "true" ]]'
C "[...document.querySelectorAll('.review-mode')].find(b=>b.textContent==='Type it').click(); 1" >/dev/null; sleep 0.3
C "(()=>{const q=[...document.querySelectorAll('.review-cue')][0].textContent.startsWith('Nick') ? 'So we beat on, boats against the current, borne back ceaselessly into the past.' : 'Can’t repeat the past? Why of course you can!'; const t=document.querySelector('.review-type'); t.value=q.toLowerCase(); [...document.querySelectorAll('.deb-btn')].find(b=>b.textContent==='Check').click(); return 1})()" >/dev/null; sleep 0.5
ok "Type it marks a word-perfect quote 100% (capitals and punctuation don't count) and suggests Good" '[[ $(C "document.querySelector(\".review-score b\").textContent + \"|\" + document.querySelector(\".review-grade.is-suggested .review-grade-name\").textContent") == "\"100%|Good\"" ]]'
C "document.querySelector('.review-grade.is-good').click(); 1" >/dev/null; sleep 1.5
ok "grading saves the schedule at the end of the quote's line" '[[ $(grep -c "<!--SR:!" "$V/School/English/Gatsby/Quotes.md") == 1 ]] && grep -q "^\"" "$V/School/English/Gatsby/Quotes.md"'
C "[...document.querySelectorAll('.review-mode')].find(b=>b.textContent==='Who said it').click(); 1" >/dev/null; sleep 0.3
ok "Who said it shows the quote and hides the speaker until asked" '[[ $(C "!document.querySelector(\".review-cue\") && document.querySelector(\".review-show\").textContent.startsWith(\"Show who\")") == "true" ]]'
ok "no errors" '[[ $(C "JSON.stringify(window.__errs||[])") == "\"[]\"" ]]'
