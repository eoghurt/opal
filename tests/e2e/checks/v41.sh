# ---- Calendar: smooth sliding, Delete/Backspace, undo, editable titles, event ⇄ task, popovers on screen, hiding tasks ----
C --key Escape >/dev/null
T=$(date +%Y-%m-%d)
f="$V/Calendar/$T.md"; [ -f "$f" ] || printf -- "# $T\n\n" > "$f"
printf -- "- 10:00–11:00 Lab report\n- 21:00–22:30 Late call\n" >> "$f"
printf -- '- [ ] Read chapter 4 📅 %s ⏰ 14:00–15:00\n' $T >> "$V/Tasks/My Tasks.md"; sleep 2
fidget Calendar; C "document.querySelector('.cal-today')?.click(); 1" >/dev/null; sleep 0.8; clickText .cal-seg Week
# A helper in the window: swipe sideways (or up/down) by a number of days (weeks in Month), then wait for it to settle.
C "window.__swipe=async(units,axis='x')=>{const win=document.querySelector('.cal-mscroll')||document.querySelector('.cal-daytrack').parentElement; const unit=axis==='x'?win.clientWidth/7:win.clientHeight/6; const main=document.querySelector('.cal-main'); const steps=12; let mid=null; for(let i=0;i<steps;i++){ main.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaX:axis==='x'?units*unit/steps:0,deltaY:axis==='y'?units*unit/steps:0})); await new Promise(r=>setTimeout(r,16)); if(i===6) mid=(document.querySelector('.cal-track')||{}).style?.transform; } await new Promise(r=>setTimeout(r,700)); return mid; }; 1" >/dev/null
first() { C "document.querySelector('.cal-h1').textContent" | tr -d '"'; }
W0=$(first)
ok "week view starts on this Monday" '[[ "$W0" == "5 Oct – 11 Oct 2026" ]]'
MID=$(C "window.__swipe(3)" | tr -d '"')
ok "swiping slides the days along smoothly (part-way positions in between)" '[[ "$MID" == translateX* && "$MID" != *"-33.3333%"* ]]'
ok "…and settles on the nearest day: Thursday first" '[[ "$(first)" == "8 Oct – 14 Oct 2026" ]]'
C "window.__swipe(0.6)" >/dev/null
ok "a small push from a Thursday moves on a day" '[[ "$(first)" == "9 Oct – 15 Oct 2026" ]]'
C "window.__swipe(2.45)" >/dev/null
ok "landing just short of a Monday sticks to the Monday" '[[ "$(first)" == "12 Oct – 18 Oct 2026" ]]'
C "window.__swipe(0.6)" >/dev/null
ok "the same small push from a Monday doesn't move it (harder to leave)" '[[ "$(first)" == "12 Oct – 18 Oct 2026" ]]'
C "window.__swipe(-0.6)" >/dev/null
ok "…nor backwards" '[[ "$(first)" == "12 Oct – 18 Oct 2026" ]]'
C "document.querySelector('.cal-nav .cal-navbtn[aria-label=Previous]').click(); 1" >/dev/null; sleep 0.8
ok "the ‹ button slides back a week" '[[ "$(first)" == "5 Oct – 11 Oct 2026" ]]'
ok "only the days on screen are visible (seven columns in view)" '[[ $(C "(()=>{const w=document.querySelector(\".cal-daytrack\").parentElement.getBoundingClientRect(); return [...document.querySelectorAll(\".cal-day\")].filter(d=>{const r=d.getBoundingClientRect(); return r.left>=w.left-1&&r.right<=w.right+1}).length})()") == 7 ]]'
# Month: up/down slides by weeks
clickText .cal-seg Month
MID=$(C "window.__swipe(1.2,'y')" | tr -d '"')
ok "month view slides up and down smoothly" '[[ "$MID" == translateY* ]]'
ok "…and settles a week on (whole weeks, not months)" '[[ $(C "(()=>{const w=document.querySelector(\".cal-mscroll\").getBoundingClientRect(); const c=[...document.querySelectorAll(\".cal-mcell\")].find(c=>c.getBoundingClientRect().top>=w.top-1); return c.dataset.key})()") == "\"2026-10-05\"" ]]'
C "window.__swipe(3,'y')" >/dev/null
ok "the title follows the month that fills the screen" '[[ "$(first)" == "November 2026" ]]'
C "document.querySelector('.cal-today').click(); 1" >/dev/null; sleep 0.8; clickText .cal-seg Week
ok "Today, then Week, goes back to this week" '[[ "$(first)" == "5 Oct – 11 Oct 2026" ]]'
# Select and delete; undo; redo
ev() { echo "[...document.querySelectorAll('.cal-day[data-key=\"$T\"] .cal-event')].find(x=>x.textContent.includes('$1'))"; }
P=$(xy "$(ev 'Lab report')"); C --drag "$P,$P" >/dev/null; sleep 0.6
ok "clicking an event selects it" '[[ $(C "$(ev "Lab report").classList.contains(\"is-selected\")") == "true" ]]'
C --key Backspace >/dev/null; sleep 1.2
ok "Backspace deletes the selected event" '! grep -q "Lab report" "$f"'
C --key Meta+z >/dev/null; sleep 1.5
ok "⌘Z brings it back" 'grep -q "^- 10:00–11:00 Lab report$" "$f"'
C --key Meta+Shift+z >/dev/null; sleep 1.5
ok "⇧⌘Z deletes it again" '! grep -q "Lab report" "$f"'
C --key Meta+z >/dev/null; sleep 1.5
# Edit the title in the popover
P=$(xy "$(ev 'Lab report')"); C --drag "$P,$P" >/dev/null; sleep 0.6
C "(()=>{const i=document.querySelector('.cal-pop .cal-edit-title'); i.focus(); i.select(); return 1})()" >/dev/null; C --type "Lab report v2" >/dev/null; C --key Enter >/dev/null; sleep 1.2
ok "an event's title can be edited in its popover" 'grep -q "^- 10:00–11:00 Lab report v2$" "$f"'
C --key Meta+z >/dev/null; sleep 1.5
ok "…and ⌘Z puts the old title back" 'grep -q "^- 10:00–11:00 Lab report$" "$f"'
# Event → task, task → event
P=$(xy "$(ev 'Lab report')"); C --drag "$P,$P" >/dev/null; sleep 0.6
C "[...document.querySelectorAll('.cal-pop .cal-new-kind')].find(b=>b.textContent==='Task').click(); 1" >/dev/null; sleep 1.5
ok "an event can be turned into a task (same day and times)" '! grep -q "Lab report" "$f" && grep -q "Lab report 📅 $T ⏰ 10:00–11:00" "$V/Tasks/My Tasks.md"'
TB="[...document.querySelectorAll('.cal-day[data-key=\"$T\"] .cal-task-block')].find(x=>x.textContent.includes('Lab report'))"
P=$(xy "$TB"); C --drag "$P,$P" >/dev/null; sleep 0.6
C "(()=>{const i=document.querySelector('.cal-pop .cal-edit-title'); i.focus(); i.select(); return 1})()" >/dev/null; C --type "Lab write-up" >/dev/null
C "[...document.querySelectorAll('.cal-pop .cal-new-kind')].find(b=>b.textContent==='Event').click(); 1" >/dev/null; sleep 1.5
ok "…and back into an event, keeping a title typed just before" 'grep -q "^- 10:00–11:00 Lab write-up$" "$f" && ! grep -q "Lab" "$V/Tasks/My Tasks.md"'
# A task's title, and Backspace on a task
TB="[...document.querySelectorAll('.cal-day[data-key=\"$T\"] .cal-task-block')].find(x=>x.textContent.includes('Read chapter 4'))"
P=$(xy "$TB"); C --drag "$P,$P" >/dev/null; sleep 0.6
C "(()=>{const i=document.querySelector('.cal-pop .cal-edit-title'); i.focus(); i.select(); return 1})()" >/dev/null; C --type "Read chapter 5" >/dev/null
C "document.querySelector('.cal-colday').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true})); 1" >/dev/null; sleep 1.2
ok "a task's title is saved when its popover closes" 'grep -q "Read chapter 5 📅" "$V/Tasks/My Tasks.md"'
# Popover for an item low on the screen stays on screen, beside it
C "document.querySelector('.cal-scroll').scrollTop=99999; 1" >/dev/null; sleep 0.3
P=$(C "(()=>{const e=$(ev 'Late call'); const r=e.getBoundingClientRect(); return Math.round(r.x+r.width/2)+','+Math.round(r.y+8)})()" | tr -d '"'); C --drag "$P,$P" >/dev/null; sleep 0.6
ok "a popover near the bottom stays inside the calendar, next to the item" '[[ $(C "(()=>{const p=document.querySelector(\".cal-pop\").getBoundingClientRect(); const m=document.querySelector(\".cal-main\").getBoundingClientRect(); const e=$(ev "Late call").getBoundingClientRect(); return p.bottom<=m.bottom+1 && (p.left>=e.right-1 || p.right<=e.left+1)})()") == "true" ]]'
C --key Escape >/dev/null
TB="[...document.querySelectorAll('.cal-day[data-key=\"$T\"] .cal-task-block')].find(x=>x.textContent.includes('Read chapter 5'))"
P=$(xy "$TB"); C --drag "$P,$P" >/dev/null; sleep 0.5; C --key Escape >/dev/null; C --key Delete >/dev/null; sleep 1.2
ok "Delete removes a selected task" '! grep -q "Read chapter" "$V/Tasks/My Tasks.md"'
C --key Meta+z >/dev/null; sleep 1.5
ok "…and ⌘Z brings the task back" 'grep -q "Read chapter 5 📅" "$V/Tasks/My Tasks.md"'
# Hide tasks
C "document.querySelector('.cal-tasks-toggle').click(); 1" >/dev/null; sleep 0.4
ok "the Tasks switch hides tasks, leaving events" '[[ $(C "document.querySelectorAll(\".cal-task-block, .cal-task\").length + \"|\" + (document.querySelectorAll(\".cal-event:not(.cal-task-block)\").length>0)") == "\"0|true\"" ]]'
C "document.querySelector('.cal-tasks-toggle').click(); 1" >/dev/null; sleep 0.4
ok "…and shows them again" '[[ $(C "document.querySelectorAll(\".cal-task-block\").length>0") == "true" ]]'
