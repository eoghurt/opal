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
