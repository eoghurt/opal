# ---- 30 calendar colours; tasks outlined (events filled) ----
C --key Escape >/dev/null
T=$(date +%Y-%m-%d); T1=$(date -v+1d +%Y-%m-%d)
printf -- '- [ ] Essay draft #color/amber 📅 %s ⏰ 09:00–13:00\n- [x] Revise Chem #color/banana 📅 %s ⏰ 09:30–12:00 ✅ %s\n' $T $T1 $T1 >> "$V/Tasks/My Tasks.md"
f="$V/Calendar/$T1.md"; [ -f "$f" ] || printf -- "# $T1\n\n" > "$f"; printf -- "- 13:00–15:00 Study group #color/blueberry\n" >> "$f"; sleep 2
clickText .bar-link Calendar 1.5; C "document.querySelector('.cal-today')?.click(); 1" >/dev/null; clickText .cal-seg Week
C "document.documentElement.dataset.theme='minimal'; document.documentElement.dataset.mode='dark'; 1" >/dev/null; sleep 0.4
task() { C "(()=>{const b=[...document.querySelectorAll('.cal-task-block')].find(x=>x.textContent.includes('$1')); const cs=getComputedStyle(b); return cs.borderTopColor+'|'+cs.borderTopStyle+'|'+cs.backgroundColor})()" | tr -d '"'; }
ok "a long task is outlined in its colour (amber) with a faint tint" '[[ $(task "Essay draft") == "rgb(201, 151, 28)|solid|"*"rgba"*"0.1"* || $(task "Essay draft") == "rgb(201, 151, 28)|solid|color(srgb"* ]]'
ok "an older colour name (banana) shows as its new colour (butter)" '[[ $(task "Revise Chem") == "rgb(212, 190, 90)|solid|"* ]]'
ok "…a done task is faded with a filled tick" '[[ $(C "(()=>{const b=[...document.querySelectorAll(\".cal-task-block\")].find(x=>x.textContent.includes(\"Revise Chem\")); return getComputedStyle(b).opacity + \"|\" + getComputedStyle(b.querySelector(\".cal-task-box\")).backgroundColor})()") == "\"0.55|rgb(212, 190, 90)\"" ]]'
ok "events stay filled; old event colour names map too (blueberry → cobalt)" '[[ $(C "(()=>{const e=[...document.querySelectorAll(\".cal-day[data-key=\\\"$T1\\\"] .cal-event:not(.cal-task-block)\")].find(x=>x.textContent.includes(\"Study group\")); return getComputedStyle(e).backgroundColor})()") =~ "rgb\(51, 85, 201\)|color\(srgb 0\.2 0\.333333 0\.788235\)" ]]'
P=$(xy "[...document.querySelectorAll('.cal-day[data-key=\"$T1\"] .cal-event:not(.cal-task-block)')].find(x=>x.textContent.includes('Study group'))"); C --drag "$P,$P" >/dev/null; sleep 0.6
ok "the colour picker offers the 30 colours, with the event's one picked" '[[ $(C "(()=>{const p=document.querySelector(\".cal-pop\"); const s=p.querySelectorAll(\".cal-picker\")[0].querySelectorAll(\".cal-swatch:not(.is-none)\"); return s.length + \"|\" + [...s].find(x=>x.classList.contains(\"is-on\"))?.title})()") == "\"30|cobalt\"" ]]'
C --key Escape >/dev/null
ok "the note still says blueberry (nothing rewritten)" 'grep -q "Study group #color/blueberry" "$V/Calendar/$T1.md"'
