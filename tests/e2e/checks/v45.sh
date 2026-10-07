# ---- Exam tracker: a subject folder's tracker, reading a WACE paper's PDF, marking it, saving to the note ----
C "window.__errs=[]; addEventListener(\"error\",e=>window.__errs.push(e.message)); addEventListener(\"unhandledrejection\",e=>window.__errs.push(String(e.reason))); 1" >/dev/null
W=/Users/ethan/Desktop/vaults/v3/School/Methods/Past\ Assessments/WACE
mkdir -p "$V/School/Methods/WACE"; cp "$W/2025 WACE S1.pdf" "$W/2025 WACE S2.pdf" "$V/School/Methods/WACE/"
printf -- '---\nopal-type: exam-tracker\ncourse: methods\ntarget: 70\nmoderated: 58\n---\n# Methods exam tracker\n\n## School results\n\n| Assessment | Weight | Mark |\n| --- | --- | --- |\n| Test 1 | 4 | 56 |\n| Test 2 | 12 | 42 |\n| Investigation 1 | 10 | 68 |\n| Exam 1 | 16 | 58 |\n\n## Question types\n\n| Paper | Q | Type |\n| --- | --- | --- |\n| 2025 | 14 | Trig functions |\n| 2025 | 9 | Exponentials & logarithms |\n' > "$V/School/Methods/Exam tracker.md"
sleep 2
C "document.querySelector('.wordmark').click(); 1" >/dev/null; sleep 1.5
C "[...document.querySelectorAll('.cork-key')].find(k=>k.textContent.includes('School')).click(); 1" >/dev/null; sleep 2
C "[...document.querySelectorAll('.home-folders .folder-tile')].find(e=>e.textContent.includes('2025 WACE')).click(); 1" >/dev/null; sleep 3
ok "a subject folder with an Exam tracker note shows the tracker" '[[ $(C "Boolean(document.querySelector(\".home-exams .ex\"))") == "true" ]]'
ok "…school mark, target and the exam mark needed (2 × 70 − 55.6)" '[[ $(C "[...document.querySelectorAll(\".ex-stats .ex-big\")].map(e=>e.textContent).join(\"|\")") == "\"55.6|70|84%\"" ]]'
ok "…and the moderated version (2 × 70 − 58)" '[[ $(C "document.querySelector(\".ex-card.is-accent .ex-sub\").textContent") == *"82%"* ]]'
ok "…finds the 2025 paper from its two PDFs" '[[ $(C "[...document.querySelectorAll(\".ex-booklet-year\")].map(e=>e.textContent).join()") == "\"2025\"" ]]'
C "[...document.querySelectorAll('.ex-step')].find(b=>b.getAttribute('aria-label')==='Raise the target').click(); 1" >/dev/null; sleep 1.5
ok "raising the target saves it to the note" 'grep -q "^target: 71" "$V/School/Methods/Exam tracker.md"'
C "(()=>{const r=document.querySelector('.ex-row.is-new'); const [n,w,m]=r.querySelectorAll('input'); n.value='Test 3'; w.value='12'; m.value='71'; m.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'})); return 1})()" >/dev/null; sleep 1.5
ok "a new school result is added to the note's table" 'grep -q "^| Test 3 | 12 | 71 |" "$V/School/Methods/Exam tracker.md"'
C "document.querySelector('.ex-booklet').click(); 1" >/dev/null; sleep 5
ok "a paper opens on its own page (its own tab title and history)" '[[ $(C "Boolean(document.querySelector(\".ex-page .ex-marking\")) && !document.querySelector(\".home-exams\") && document.title") == *"WACE 2025"* ]]'
ok "marking reads the paper: 2 sections, 17 questions with their marks" '[[ $(C "document.querySelectorAll(\".ex-q:not(.is-head)\").length + \"|\" + [...document.querySelectorAll(\".ex-mark-sec\")].map(e=>e.textContent).join(\"|\")") == *"17|Calculator-free35%7 questions · 47 marks|Calculator-assumed65%10 questions · 97 marks"* ]]'
ok "…uses the question types assigned in the note (Q9 → exponentials)" '[[ $(C "[...document.querySelectorAll(\".ex-q:not(.is-head)\")][8].querySelector(\".ex-type\").value") == *"Exponentials"* ]]'
ok "…and guesses the rest from the paper (Q16 → confidence intervals)" '[[ $(C "[...document.querySelectorAll(\".ex-q:not(.is-head)\")][15].querySelector(\".ex-type\").value") == *"confidence"* ]]'
C "(()=>{const q=[...document.querySelectorAll('.ex-q:not(.is-head)')][11]; const i=q.querySelector('.ex-got'); i.value='3'; i.dispatchEvent(new Event('change')); return 1})()" >/dev/null; sleep 0.4
C "[...document.querySelectorAll('.ex-q:not(.is-head)')][11].querySelectorAll('.ex-ache-btn')[2].click(); 1" >/dev/null; sleep 0.4
C "(()=>{const q=[...document.querySelectorAll('.ex-q:not(.is-head)')][0]; const i=q.querySelector('.ex-got'); i.value='6'; i.dispatchEvent(new Event('change')); return 1})()" >/dev/null; sleep 0.4
ok "…the mark counts only questions marked so far" '[[ $(C "document.querySelector(\".ex-big.is-accent\").textContent") == "\"57%\"" ]]'
sleep 1.5
ok "marks save as you go, before pressing Done" '[[ $(grep -c "^| [0-9]* | Calculator-" "$V/School/Methods/Exam tracker.md") == 17 ]]'
C "document.querySelector('.ex-back').click(); 1" >/dev/null; sleep 2
C "[...document.querySelectorAll('.ex-chip')].find(b=>b.textContent==='Open the marking').click(); 1" >/dev/null; sleep 3
ok "…so leaving half-way and coming back keeps the marks" '[[ $(C "[...document.querySelectorAll(\".ex-q:not(.is-head)\")][11].querySelector(\".ex-got\").value") == "\"3\"" ]]'
C "[...document.querySelectorAll('.ex-save')].find(b=>b.textContent==='Done').click(); 1" >/dev/null; sleep 2.5
ok "saving writes the paper to the note, a row per question" '[[ $(grep -c "^| [0-9]* | Calculator-" "$V/School/Methods/Exam tracker.md") == 17 ]] && grep -q "^| 12 | Calculator-assumed | Rates of change & optimisation | 3 | 9 | 3 |" "$V/School/Methods/Exam tracker.md"'
ok "…and the tracker shows it: score, sections, where the marks go" '[[ $(C "document.querySelector(\".ex-booklet-pct\").textContent + \"|\" + document.querySelectorAll(\".ex-sec\").length + \"|\" + document.querySelector(\".ex-loss:not(.is-head) .ex-loss-name\").textContent") == "\"57%|2|Rates of change & optimisation\"" ]]'
ok "no errors" '[[ $(C "JSON.stringify(window.__errs||[])") == "\"[]\"" ]]'

# right-click the paper's PDF button, and the steps in a tab's hover card
C "[...document.querySelectorAll('.ex-chip')].find(b=>b.textContent==='Open the marking').click(); 1" >/dev/null; sleep 3
ok "right-click the paper's 'Open …pdf' button: the file's menu" '[[ $(C "(()=>{const b=[...document.querySelectorAll(\".ex-chip\")].find(b=>b.textContent.startsWith(\"Open 2025\")); b.dispatchEvent(new MouseEvent(\"contextmenu\",{bubbles:true,cancelable:true,clientX:300,clientY:300})); return [...document.querySelectorAll(\"[role=menuitem]\")].map(e=>e.textContent).join(\"|\")})()") == *"Open in new tab"*"Show in Finder"* ]]'
C "document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})); 1" >/dev/null; sleep 0.3
C "[...document.querySelectorAll('.ex-chip')].find(b=>b.textContent.startsWith('Open 2025')).click(); 1" >/dev/null; sleep 2.5
C "(()=>{const t=document.querySelector('.tab.is-active'); t.dispatchEvent(new PointerEvent('pointerenter',{bubbles:true})); t.dispatchEvent(new MouseEvent('mouseenter',{bubbles:true})); return 1})()" >/dev/null; sleep 1.5
ok "right-click a folder in a tab's hover card: that folder's menu" '[[ $(C "(()=>{const s=[...document.querySelectorAll(\".tab-peek-step\")].find(e=>e.textContent.includes(\"Methods\")); if(!s) return \"no card\"; s.dispatchEvent(new MouseEvent(\"contextmenu\",{bubbles:true,cancelable:true,clientX:300,clientY:120})); return [...document.querySelectorAll(\"[role=menuitem]\")].map(e=>e.textContent).join(\"|\")})()") == *"Open in new tab"*"Delete folder"* ]]'
