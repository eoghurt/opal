# ---- Corkboard home: calendar, passport stamps, receipt ticks, key tags that keep swinging ----
C "window.__errs=[]; addEventListener(\"error\",e=>window.__errs.push(e.message)); addEventListener(\"unhandledrejection\",e=>window.__errs.push(String(e.reason))); 1" >/dev/null
TODAY=$(date +%Y-%m-%d)
printf -- '# Today\n\n- [ ] Corkboard check task 📅 %s ⏰ 09:00–10:30\n- [ ] Another for today 📅 %s\n' "$TODAY" "$TODAY" > "$V/Tasks/Today list.md"
printf -- '# Today\n\n## Schedule\n- 18:30–20:30 Corkboard dinner #color/ocean\n' > "$V/Calendar/$TODAY.md"
sleep 1.5
C "document.querySelector('.wordmark').click(); 1" >/dev/null; sleep 2.5
ok "the vault's home page is the corkboard" '[[ $(C "Boolean(document.querySelector(\".cork-board\"))") == "true" ]]'
ok "the calendar shows this month, drawn by hand" '[[ $(C "document.querySelectorAll(\".cork-cal-cell\").length >= 28 && Boolean(document.querySelector(\".cork-cal svg path[d]\"))") == "true" ]]'
ok "today's calendar event is written in" '[[ $(C "[...document.querySelectorAll(\".cork-cal-ev\")].some(e=>e.textContent.includes(\"Corkboard dinner\"))") == "true" ]]'
ok "the receipt lists today's tasks" '[[ $(C "[...document.querySelectorAll(\".cork-rc-item\")].map(e=>e.textContent).join(\"|\")") == *"CORKBOARD CHECK TASK"* ]]'
C "[...document.querySelectorAll('.cork-rc-row')].find(r=>r.textContent.includes('CORKBOARD CHECK')).click(); 1" >/dev/null; sleep 2
ok "…ticking a line ticks the task in its note" 'grep -q "\- \[x\] Corkboard check task" "$V/Tasks/Today list.md"'
ok "…and draws a handwritten tick, not a strike-through" '[[ $(C "(()=>{const r=[...document.querySelectorAll(\".cork-rc-row\")].find(r=>r.textContent.includes(\"CORKBOARD CHECK\")); return Boolean(r.querySelector(\".cork-tick\")) && getComputedStyle(r.querySelector(\".cork-rc-item\")).textDecorationLine===\"none\"})()") == "true" ]]'
ok "the folders hang as key tags" '[[ $(C "[...document.querySelectorAll(\".cork-key-title\")].map(e=>e.textContent).join(\",\")") == *"School"* ]]'
C "(()=>{const k=[...document.querySelectorAll('.cork-key')][0]; k.dispatchEvent(new MouseEvent('mouseenter',{clientX:5})); k.dispatchEvent(new MouseEvent('mouseleave')); return 1})()" >/dev/null; sleep 0.6
A1=$(C "document.querySelector('.cork-key-swing').style.transform"); sleep 0.4
A2=$(C "document.querySelector('.cork-key-swing').style.transform")
ok "…a tag keeps swinging after the mouse leaves" '[[ "$A1" == *rotate* && "$A2" == *rotate* && "$A1" != "$A2" ]]'
sleep 6
ok "…and settles back to still" '[[ $(C "document.querySelector(\".cork-key-swing\").style.transform") == "\"\"" ]]'
C "[...document.querySelectorAll('.cork-key')].find(k=>k.textContent.includes('School')).click(); 1" >/dev/null; sleep 1.5
ok "…clicking a tag opens the folder" '[[ $(C "document.title") == *"School"* ]]'
C "document.querySelector('.wordmark').click(); 1" >/dev/null; sleep 2
C "document.querySelector('.cork-stamp[aria-label=\"Open Money\"]').click(); 1" >/dev/null; sleep 1.5
ok "a passport stamp opens its fidget" '[[ $(C "Boolean(document.querySelector(\".money\"))") == "true" ]]'
C "document.querySelector('.wordmark').click(); 1" >/dev/null; sleep 2
C "document.querySelector('.cork-quote-next').click(); 1" >/dev/null; sleep 0.3
ok "the quote card shows one of the quotes" '[[ $(C "document.querySelector(\".cork-quote-text\").textContent") == *[a-z]* ]]'
ok "no errors" '[[ $(C "JSON.stringify(window.__errs||[])") == "\"[]\"" ]]'

# the receipt's tear-off stub: a short to-do list you write on
C "document.querySelector('.wordmark').click(); 1" >/dev/null; sleep 2
C "(()=>{const i=document.querySelector('.cork-stub-row.is-new input'); i.value='Buy chalk'; i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); return 1})()" >/dev/null; sleep 2
ok "the receipt's stub adds a line to Tasks/Quick list.md" 'grep -q "\- \[ \] Buy chalk" "$V/Tasks/Quick list.md"'
C "(()=>{const i=document.querySelector('.cork-stub-row.is-new input'); i.value='Return library book'; i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); return 1})()" >/dev/null; sleep 2
ok "…new lines go at the bottom" '[[ $(grep -n "Return library book" "$V/Tasks/Quick list.md" | cut -d: -f1) -gt $(grep -n "Buy chalk" "$V/Tasks/Quick list.md" | cut -d: -f1) ]]'
C "[...document.querySelectorAll('.cork-stub-row')].find(r=>r.querySelector('input').value==='Buy chalk').querySelector('.cork-stub-box').click(); 1" >/dev/null; sleep 2
ok "…ticking draws a pen tick and ticks it in the note" 'grep -q "\- \[x\] Buy chalk" "$V/Tasks/Quick list.md" && [[ $(C "Boolean([...document.querySelectorAll(\".cork-stub-row\")].find(r=>r.querySelector(\"input\").value===\"Buy chalk\").querySelector(\".cork-tick\"))") == "true" ]]'
C "(()=>{const i=[...document.querySelectorAll('.cork-stub-row input')].find(i=>i.value==='Return library book'); i.value='Return two library books'; i.dispatchEvent(new FocusEvent('blur')); return 1})()" >/dev/null; sleep 2
ok "…a line can be rewritten" 'grep -q "Return two library books" "$V/Tasks/Quick list.md"'
C "document.querySelector('.cork-stub-clear').click(); 1" >/dev/null; sleep 2
ok "…clear ticked removes the ticked lines" '! grep -q "Buy chalk" "$V/Tasks/Quick list.md" && grep -q "Return two library books" "$V/Tasks/Quick list.md"'
ok "no errors after the stub" '[[ $(C "JSON.stringify(window.__errs||[])") == "\"[]\"" ]]'
