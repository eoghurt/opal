# ---- Calendar: Untitled previews, connected multi-day events, drag to make and stretch them ----
C --key Escape >/dev/null
f="$V/Calendar/2026-10-02.md"; [ -f "$f" ] || printf -- "# 2026-10-02\n\n" > "$f"; printf -- "- all day School camp → 2026-10-06\n" >> "$f"; sleep 2
fidget Calendar
C "(()=>{ window.__go=(d,m)=>1; return 1 })()" >/dev/null
C "document.querySelector('.cal-today')?.click(); [...document.querySelectorAll('.cal-seg')].find(b=>b.textContent==='Month').click(); 1" >/dev/null; sleep 1.3
ok "month view: a multi-day event is one bar per week, not a piece per day" '[[ $(C "[...document.querySelectorAll(\".cal-mbar\")].filter(b=>b.textContent.includes(\"School camp\")).length + \"|\" + [...document.querySelectorAll(\".cal-mcell .cal-chip\")].filter(b=>b.textContent.includes(\"School camp\")).length") == "\"2|0\"" ]]'
ok "…the first piece covers Fri–Sun, the next Mon–Tue, joined by arrows" '[[ $(C "(()=>{const b=[...document.querySelectorAll(\".cal-mbar\")].filter(b=>b.textContent.includes(\"School camp\")); const cell=(k)=>document.querySelector(\".cal-mcell[data-key=\\\"\"+k+\"\\\"]\").getBoundingClientRect(); const r0=b[0].getBoundingClientRect(), r1=b[1].getBoundingClientRect(); return r0.left>=cell(\"2026-10-02\").left-1 && r0.right>=cell(\"2026-10-04\").right-8 && b[0].classList.contains(\"is-cont-right\") && b[1].classList.contains(\"is-cont-left\") && r1.right<=cell(\"2026-10-06\").right+1 && r1.right>cell(\"2026-10-06\").left})()") == "true" ]]'
ok "the calendar shows a pointing hand, not the plus cursor" '[[ $(C "getComputedStyle(document.querySelector(\".cal-mcell\")).cursor") == "\"pointer\"" ]]'
# Drag across Mon 12 → Wed 14 in the month
pt() { C "(()=>{const r=document.querySelector('.cal-mcell[data-key=\"$1\"]').getBoundingClientRect(); return Math.round(r.x+r.width/2)+','+Math.round(r.bottom-12)})()" | tr -d '"'; }
P1=$(pt 2026-10-12); P2=$(pt 2026-10-14)
C "(()=>{const [x,y]='$P1'.split(',').map(Number); const t=document.elementFromPoint(x,y); t.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:3,clientX:x,clientY:y})); return t.className})()" >/dev/null
C "(()=>{const [x,y]='$P2'.split(',').map(Number); window.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:3,clientX:x,clientY:y})); return 1})()" >/dev/null; sleep 0.2
ok "dragging across days shows an Untitled bar over them" '[[ $(C "(()=>{const d=document.querySelector(\".cal-draft-bar\"); const a=document.querySelector(\".cal-mcell[data-key=\\\"2026-10-12\\\"]\").getBoundingClientRect(), c=document.querySelector(\".cal-mcell[data-key=\\\"2026-10-14\\\"]\").getBoundingClientRect(), r=d.getBoundingClientRect(); return d.textContent + \"|\" + (r.left<a.left+8 && r.right>c.right-8)})()") == "\"Untitled|true\"" ]]'
C "(()=>{const [x,y]='$P2'.split(',').map(Number); window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:3,clientX:x,clientY:y})); return 1})()" >/dev/null; sleep 0.5
ok "letting go opens the new event, set to those days" '[[ $(C "document.querySelector(\".cal-new .cal-new-until\").value + \"|\" + document.querySelector(\".cal-new\").textContent.includes(\"12 Oct\")") == "\"2026-10-14|true\"" ]]'
C --type "Rowing"; sleep 0.3
ok "the preview takes the title as it's typed" '[[ $(C "document.querySelector(\".cal-draft-bar\").textContent") == "\"Rowing\"" ]]'
C "document.querySelector('.cal-new .cal-pop-btn.is-primary').click(); 1" >/dev/null; sleep 2
ok "saving writes one multi-day event" 'grep -q "^- all day Rowing → 2026-10-14$" "$V/Calendar/2026-10-12.md"'
ok "…shown as one bar" '[[ $(C "[...document.querySelectorAll(\".cal-mbar\")].filter(b=>b.textContent.includes(\"Rowing\")).length") == "1" ]]'
# Click one day, save with no title → Untitled
P3=$(pt 2026-10-21)
C "(()=>{const [x,y]='$P3'.split(',').map(Number); const t=document.elementFromPoint(x,y); t.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:4,clientX:x,clientY:y})); window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:4,clientX:x,clientY:y})); return 1})()" >/dev/null; sleep 0.5
ok "a click shows an Untitled preview straight away" '[[ $(C "document.querySelector(\".cal-draft-bar\")?.textContent") == "\"Untitled\"" ]]'
C "document.querySelector('.cal-new .cal-pop-btn.is-primary').click(); 1" >/dev/null; sleep 2
ok "saving with no title makes it Untitled" 'grep -q "^- all day Untitled$" "$V/Calendar/2026-10-21.md"'
# Stretch Rowing's end from Wed 14 to Fri 16
C "(()=>{const g=[...document.querySelectorAll('.cal-mbar')].find(b=>b.textContent.includes('Rowing')).querySelector('.cal-bar-grip.is-end'); const r=g.getBoundingClientRect(); g.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:5,clientX:r.x+3,clientY:r.y+5})); const c=document.querySelector('.cal-mcell[data-key=\"2026-10-16\"]').getBoundingClientRect(); window.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:5,clientX:c.x+c.width/2,clientY:c.bottom-10})); window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:5,clientX:c.x+c.width/2,clientY:c.bottom-10})); return 1})()" >/dev/null; sleep 2
ok "dragging a bar's end stretches the event" 'grep -q "^- all day Rowing → 2026-10-16$" "$V/Calendar/2026-10-12.md"'
# Week view: the all-day row
C "[...document.querySelectorAll('.cal-seg')].find(b=>b.textContent==='Week').click(); 1" >/dev/null; sleep 1.2
ok "week view: the multi-day event is one bar in the all-day row" '[[ $(C "[...document.querySelectorAll(\".cal-alldaytrack > .cal-chip\")].filter(b=>b.textContent.includes(\"School camp\")).length") == "1" ]]'
# Timed grid draft says Untitled
XY=$(C "(()=>{const s=document.querySelector('.cal-scroll'); s.scrollTop=8*52; const r=[...document.querySelectorAll('.cal-day')].find(d=>d.getBoundingClientRect().left>=d.closest('.cal-hwin').getBoundingClientRect().left-1).getBoundingClientRect(); const top=s.getBoundingClientRect().top; return Math.round(r.x+30)+','+Math.round(top+60)+','+Math.round(r.x+30)+','+Math.round(top+140)})()" | tr -d '"'); sleep 0.3
C --drag "$XY" >/dev/null; sleep 0.6
ok "a new timed event's preview says Untitled" '[[ $(C "document.querySelector(\".cal-draft .cal-event-title\")?.textContent") == "\"Untitled\"" ]]'
C --key Escape >/dev/null
# Month bars sit over their days in every theme (Minimal once broke them)
C "[...document.querySelectorAll('.cal-seg')].find(b=>b.textContent==='Month').click(); 1" >/dev/null; sleep 1.2
for th in "minimal light" "minimal dark"; do set -- ${=th}
  C "document.documentElement.dataset.theme='$1'; document.documentElement.dataset.mode='$2'; 1" >/dev/null; sleep 0.4
  ok "month bars lie across their days ($1 $2)" '[[ $(C "(()=>{const b=[...document.querySelectorAll(\".cal-mbar\")].find(x=>x.textContent.includes(\"School camp\")); const fri=document.querySelector(\".cal-mcell[data-key=\\\"2026-10-02\\\"]\").getBoundingClientRect(); const sun=document.querySelector(\".cal-mcell[data-key=\\\"2026-10-04\\\"]\").getBoundingClientRect(); const r=b.getBoundingClientRect(); return getComputedStyle(b).position + \"|\" + (r.left>=fri.left-1 && r.left<fri.left+12 && r.right>sun.right-12 && r.top>fri.top && r.bottom<fri.bottom)})()") == "\"absolute|true\"" ]]'
done
