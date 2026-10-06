# ---- Debate fidget: motion bank (read as written), stars, versions, records → competition notes, Form 1, Form 2 → card, board, drills ----
C --key Escape >/dev/null
D="$V/Clubs/Debate"; mkdir -p "$D/Motions/Practice preps" "$D/Feedback/1 Do Now" "$D/Feedback/2 In Progress" "$D/Feedback/3 Parked" "$D/Feedback/4 Done" "$D/Training"
printf -- '**Grandfinals**\nTHBT cities should ban cars\n- Cars include taxis.\n\n**Inrounds**\nTHW abolish homework\n' > "$D/Motions/Spring Open 2026.md"
printf -- 'Round 1 - THBT cities should ban private cars* *Private cars exclude buses.* #topic/cities\n\n==Round 2 - THR social media== #topic/media\n\n---\n**Related**\n' > "$D/Motions/Autumn Cup 2026.md"
printf -- 'Ideas\n- THP a world without exams\n' > "$D/Motions/Motion ideas.md"
printf -- 'THW abolish homework\n### Aff\nKids need rest\n### Neg\n' > "$D/Motions/Practice preps/Homework.md"
cat > "$D/Schools Record.md" <<'EOF'
<table data-opal-table><tr><th>Competition</th><th>Year</th><th>Team</th><th>Win %</th><th>Placing</th><th>Speaks</th><th>Notes</th><th>Tabs</th></tr>
<tr><td>Spring Open</td><td rowspan="2">2026</td><td>Alpha</td><td>3/4</td><td>Semi-finalist</td><td>7th</td><td>Captain</td><td></td></tr>
<tr><td>Autumn Cup</td><td>Beta</td><td>1/4</td><td></td><td></td><td></td><td></td></tr></table>
EOF
cat > "$D/Adjudication Record.md" <<'EOF'
<table data-opal-table><tr><th>Competition</th><th>Year</th><th>Rooms judged</th><th>Notes</th><th>Total teams</th></tr>
<tr><td>Winter BP</td><td>2026</td><td>4</td><td>Adjudicator</td><td>12</td></tr></table>
EOF
printf -- '**To do:**\n- Practise flowing\n\n**Quantitative KPIs**\n- Top 10 speaks in comps\n' > "$D/Dashboard.md"
cat > "$D/Feedback/_Card Template.md" <<'EOF'
---
round_id:
dimension:
status: do-now
opened:
closed:
---

# <dimension> — <short label>

## Evidence

> Judge, verbatim.

> Partner or coach.

Rounds this has appeared in:

## Cause

One, named.

## The fix

| Level | Content |
| ----- | ------- |
| Mini | The rule you hold in your head while speaking |
| Micro | The drill, if the mini decays |
| Macro | The structural change, if the mini fails under full attention |

## Trial

| Round | Held / decayed / failed |
| ----- | ----------------------- |
| +1 | |
| +2 | |
| +3 | |

## Verdict

- [ ] Held. Problem was attention. Move to `4 Done`
- [ ] Not upstream of anything. Move to `3 Parked`
EOF
cat > "$D/Training/Training Plan.md" <<'EOF'
# Training Plan

12 hours a week.

## Weekly template

| Day | Block | Hours | Content |
| --- | ----- | ----- | ------- |
| Mon | Drill | 1.5 | Drills from the bank |
| Sun | Review | 1.5 | [[Workflow\|Process the board]] |

## Phase 1, months 1 to 6, rebuild

Milestone. A clean 7-minute speech.

## Drill bank

| # | Drill | Time | Method | Fixes |
| - | ----- | ---- | ------ | ----- |
| 9 | Flow reconstruction | 45 min | Flow a recorded round | Round vision |

Phase 1 leans on 9.
EOF
sleep 2.5
fidget Debate
rail() { C "[...document.querySelectorAll('.deb-rail-btn')].find(b=>b.textContent==='$1').click(); 1" >/dev/null; sleep 0.8; }
ok "the Debate page finds the folder named Debate (Clubs/Debate)" '[[ $(C "document.querySelector(\".deb-h1\")?.textContent") == "\"The floor is yours.\"" ]]'
rail Motions
ok "motions are read as written: 5 from the notes, prep note matched, info slide split off" '[[ $(C "(()=>{const rows=[...document.querySelectorAll(\".deb-motion-row\")].map(r=>r.innerText); return rows.length+\"|\"+rows.some(t=>t.includes(\"Prepped\")&&t.includes(\"abolish homework\"))+\"|\"+rows.some(t=>t.includes(\"ban private cars\")&&!t.includes(\"exclude\"))})()") == "\"5|true|true\"" ]]'
ok "the topic filter offers the 32 topics as pills, counting #topic tags (Cities 1)" '[[ $(C "(()=>{const c=[...[...document.querySelectorAll(\".deb-filter-row\")].find(r=>r.innerText.startsWith(\"Topic\")).querySelectorAll(\".deb-pill\")]; return c.length+\"|\"+c.find(b=>b.innerText.startsWith(\"Cities\")).innerText.replace(/\\s+/g,\" \")+\"|\"+!!c[0].querySelector(\"svg\")})()") == "\"32|Cities 1|true\"" ]]'
C "[...document.querySelectorAll('.deb-motion-main')].find(b=>b.innerText.includes('abolish homework')&&!b.innerText.includes('Practice')).click(); 1" >/dev/null; sleep 0.4
C "[...document.querySelectorAll('.deb-detail .deb-btn')].find(b=>b.textContent==='Edit').click(); 1" >/dev/null; sleep 0.4
C "(()=>{const p=document.querySelector('.deb-pop'); const t=p.querySelector('textarea[aria-label=Motion]'); t.value='THW ban homework'; const i=p.querySelector('textarea[aria-label=\"Info slide\"]'); i.value='Homework means set tasks.'; [...p.querySelectorAll('.deb-pill')].find(b=>b.textContent==='Education/Academia').click(); return 1})()" >/dev/null; sleep 0.2
C "[...document.querySelectorAll('.deb-pop .deb-btn')].find(b=>b.textContent==='Save').click(); 1" >/dev/null; sleep 2
ok "editing a motion rewrites its line (wording, topic tag) and adds its info slide under it" 'grep -q "^THW ban homework #topic/education-academia$" "$D/Motions/Spring Open 2026.md" && grep -A1 "^THW ban homework" "$D/Motions/Spring Open 2026.md" | grep -q "^- Homework means set tasks.$"'
# Up to 3 topics, from the + Topic picker
C "[...document.querySelectorAll('.deb-motion-main')].find(b=>b.innerText.includes('ban homework')).click(); 1" >/dev/null; sleep 0.4
C "document.querySelector('.deb-detail .deb-pill-add').click(); 1" >/dev/null; sleep 0.3
for t in Children Politics Law; do C "[...document.querySelectorAll('.deb-pop .deb-pill')].find(b=>b.textContent==='$t').click(); 1" >/dev/null; sleep 0.15; done
ok "the picker stops at 3 topics (Law isn't added)" '[[ $(C "[...document.querySelectorAll(\".deb-pop .deb-pill.is-on\")].map(b=>b.textContent).join(\",\")") == "\"Children,Education/Academia,Politics\"" || $(C "[...document.querySelectorAll(\".deb-pop .deb-pill.is-on\")].length") == 3 ]]'
C "[...document.querySelectorAll('.deb-pop .deb-btn')].find(b=>b.textContent==='Done').click(); 1" >/dev/null; sleep 2
ok "…saved as three #topic tags on the line" 'grep -q "^THW ban homework #topic/education-academia #topic/children #topic/politics$" "$D/Motions/Spring Open 2026.md"'
ok "the list shows the topics as symbols only, named on hover" '[[ $(C "[...[...document.querySelectorAll(\".deb-motion-row\")].find(r=>r.innerText.includes(\"ban homework\")).querySelectorAll(\".deb-pill.is-compact\")].map(p=>p.title).join(\",\")") == "\"Education/Academia,Children,Politics\"" ]]'
C "[...document.querySelectorAll('.deb-motion-row')].find(r=>r.innerText.includes('ban private cars')).querySelector('.deb-star').click(); 1" >/dev/null; sleep 1.5
ok "starring adds #starred to the motion's line" 'grep -q "ban private cars\* \*Private cars exclude buses.\* #topic/cities #starred$" "$D/Motions/Autumn Cup 2026.md"'
C "[...document.querySelectorAll('.deb-motion-main')].find(b=>b.innerText.includes('ban private cars')).click(); 1" >/dev/null; sleep 0.5
C "[...document.querySelectorAll('.deb-link')].find(b=>/look.* like this/.test(b.textContent)).click(); 1" >/dev/null; sleep 0.4
C "[...document.querySelectorAll('.deb-pick')].find(b=>b.textContent.includes('ban cars')).click(); 1" >/dev/null; sleep 2
ok "linking versions tags both lines (different files) with the same #version/…" '[[ $(grep -o "#version/[a-z-]*" "$D/Motions/Autumn Cup 2026.md") == $(grep -o "#version/[a-z-]*" "$D/Motions/Spring Open 2026.md") && -n $(grep -o "#version/[a-z-]*" "$D/Motions/Spring Open 2026.md") ]]'
ok "…and the other version shows with its changed wording marked" '[[ $(C "document.querySelectorAll(\".deb-version mark, .deb-version del\").length>0") == "true" ]]'
rail Comps
C "document.querySelector('.deb-notice .deb-btn').click(); 1" >/dev/null; sleep 0.5; C "[...document.querySelectorAll('.ask-choice')].find(b=>b.textContent==='Make the notes').click(); 1" >/dev/null; sleep 4
ok "the record tables become one note per competition (2 speaking + 1 judging), tables untouched" '[ -f "$D/Competitions/Spring Open 2026.md" ] && [ -f "$D/Competitions/Autumn Cup 2026.md" ] && [ -f "$D/Competitions/Winter BP 2026.md" ] && grep -q "^record: \"3/4\"$" "$D/Competitions/Spring Open 2026.md" && grep -q "^year: 2026$" "$D/Competitions/Autumn Cup 2026.md" && grep -q "^format: British Parliamentary$" "$D/Competitions/Winter BP 2026.md" && grep -q "<table" "$D/Schools Record.md"'
ok "season tiles from the records: 4 of 8 won, 1 break" '[[ $(C "[...document.querySelectorAll(\".deb-tile\")].map(t=>t.innerText.replace(/\\n/g,\" \")).join(\"|\")") == *"50% 4 of 8"*"1 of 2 competitions"* ]]'
# Form 1
C "[...document.querySelectorAll('.deb-comp-row')].find(r=>r.innerText.startsWith('Spring Open')).click(); 1" >/dev/null; sleep 0.6
C "[...document.querySelectorAll('.deb-btn')].find(b=>b.textContent==='+ Round').click(); 1" >/dev/null; sleep 0.6
pick() { C "(()=>{const q=[...document.querySelectorAll('.deb-q')].find(q=>q.querySelector('.deb-q-label').textContent.startsWith('$1')); [...q.querySelectorAll('.deb-chip')].find(b=>b.textContent==='$2').click(); return 1})()" >/dev/null; sleep 0.3; }
pick Round R2; pick Format "British Parliamentary"
ok "BP rounds are placed 1st–4th, not won or lost" '[[ $(C "[...[...document.querySelectorAll(\".deb-q\")].find(q=>q.innerText.startsWith(\"Result\")).querySelectorAll(\".deb-chip\")].map(b=>b.textContent).join(\",\")") == "\"1st,2nd,3rd,4th\"" ]]'
pick Position "MG"; pick Result 3rd
C "(()=>{const t=document.querySelector('textarea[aria-label=feedback]'); t.value='Lost the thread'; t.dispatchEvent(new Event('input')); return 1})()" >/dev/null
C "[...document.querySelectorAll('.deb-btn')].find(b=>b.textContent==='Save round').click(); 1" >/dev/null; sleep 2.5
R="$D/Rounds/SO26-R2.md"
ok "Form 1 saves Rounds/<Round ID>.md linked to its competition" '[ -f "$R" ] && grep -q "^competition: \"\[\[Spring Open 2026\]\]\"$" "$R" && grep -q "^result: \"3rd\"$" "$R" && grep -q "^position: MG$" "$R"'
# Form 2
score() { C "(()=>{const r=[...document.querySelectorAll('.deb-score-pick')].find(r=>r.firstChild.textContent==='$1'); r.querySelectorAll('.deb-score-btn')[$2-1].click(); return 1})()" >/dev/null; sleep 0.3; }
score "Flowing and tracking" 2
C "(()=>{const t=[...document.querySelectorAll('.deb-field')].find(f=>f.textContent.startsWith('The mini fix')).querySelector('input'); t.value='Five words a point'; t.dispatchEvent(new Event('input')); return 1})()" >/dev/null
pick Priority "Do now"
C "[...document.querySelectorAll('.deb-btn.is-primary')].pop().click(); 1" >/dev/null; sleep 3
CARD=$(ls "$D/Feedback/1 Do Now/" | head -1)
ok "Form 2 saves scores and makes a card from the template (skill = the lowest score)" 'grep -q "^form2: true$" "$R" && grep -q "^score_flowing_and_tracking: 2$" "$R" && [[ "$CARD" == "Flowing and tracking"* ]] && grep -q "| Mini | Five words a point |" "$D/Feedback/1 Do Now/$CARD" && grep -q "> Lost the thread" "$D/Feedback/1 Do Now/$CARD"'
# Board
rail Board; C "document.querySelector('.deb-board-card').click(); 1" >/dev/null; sleep 0.4
C "[...document.querySelectorAll('.deb-detail .deb-btn')].find(b=>b.textContent==='In progress').click(); 1" >/dev/null; sleep 3
ok "moving a card moves its note to 2 In Progress and sets its status" '[ -f "$D/Feedback/2 In Progress/$CARD" ] && grep -q "^status: in-progress$" "$D/Feedback/2 In Progress/$CARD"'
C "(()=>{[...document.querySelector('.deb-trial').querySelectorAll('.deb-chip')].find(b=>b.textContent==='Held').click(); return 1})()" >/dev/null; sleep 2
ok "a trial result goes into the card's table" 'grep -q "^| +1 | Held |$" "$D/Feedback/2 In Progress/$CARD"'
# Training
rail Training
ok "the training plan is read (an escaped | inside a link doesn't split the cell)" '[[ $(C "[...document.querySelectorAll(\".deb-day\")].map(d=>d.innerText.replace(/\\n/g,\" \")).join(\"|\")") == *"Process the board"* ]]'
C "[...document.querySelectorAll('.deb-drill')][0].querySelector('.deb-btn').click(); 1" >/dev/null; sleep 2.5
ok "logging a drill writes Training/Drill log.md" 'grep -q " · 9 Flow reconstruction (45 min)$" "$D/Training/Drill log.md"'
rail Overview
ok "the overview shows the gating chain from Form 2 and the fix trial waiting" '[[ $(C "document.querySelector(\".deb-chain-box.is-weak\")?.innerText.split(\"\\n\")[0]") == "\"Flowing and tracking\"" && $(C "[...document.querySelectorAll(\".deb-wait\")].some(w=>w.innerText.startsWith(\"Fix trial +2\"))") == "true" ]]'
ok "no errors" '[[ $(C "JSON.stringify(window.__errs||[])") == "\"[]\"" ]]'
# Menus (right-click / double-click)
ctx() { C "(()=>{const el=$1; el.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:300,clientY:300})); return 1})()" >/dev/null; sleep 0.4; }
pickItem() { C "[...document.querySelectorAll('.ctx-item')].find(b=>b.textContent.startsWith('$1')).click(); 1" >/dev/null; sleep 0.5; }
C "[...document.querySelectorAll('.deb-rail-btn')].find(b=>b.textContent==='Motions').click(); 1" >/dev/null; sleep 0.8
ctx "[...document.querySelectorAll('.deb-motion-row')].find(r=>r.innerText.includes('world without exams'))"
ok "right-clicking a motion offers edit, topics, prep, Finder and delete" '[[ $(C "[...document.querySelectorAll(\".ctx-item\")].map(b=>b.textContent).join(\"|\")") == *"Edit…"*"Topics…"*"Prep · 30 min"*"Show in Finder"*"Delete the motion"* ]]'
pickItem "Delete the motion"; C "[...document.querySelectorAll('.ask-choice')].find(b=>b.textContent==='Delete').click(); 1" >/dev/null; sleep 2
ok "…Delete takes its line out of the note" '! grep -q "world without exams" "$D/Motions/Motion ideas.md" && grep -q "^Ideas$" "$D/Motions/Motion ideas.md"'
C "[...document.querySelectorAll('.deb-rail-btn')].find(b=>b.textContent==='Comps').click(); 1" >/dev/null; sleep 0.8
ctx "[...document.querySelectorAll('.deb-comp-row')].find(r=>r.innerText.startsWith('Spring Open'))"
ok "right-clicking a competition offers log a round, open the note, Finder and delete" '[[ $(C "[...document.querySelectorAll(\".ctx-item\")].map(b=>b.textContent).join(\"|\")") == *"Log a round here"*"Open the note"*"Show in Finder"*"Delete the competition"* ]]'
C --key Escape >/dev/null
C "[...document.querySelectorAll('.deb-comp-row')].find(r=>r.innerText.startsWith('Spring Open')).click(); 1" >/dev/null; sleep 0.8
ctx "document.querySelector('.deb-round-row:not(.is-head)')"
pickItem "Delete the round"; C "[...document.querySelectorAll('.ask-choice')].find(b=>b.textContent==='Delete').click(); 1" >/dev/null; sleep 2
ok "…a round's menu deletes its note (to the Trash)" '[ ! -f "$D/Rounds/SO26-R2.md" ]'
ok "the top bar keeps only Search and Settings" '[[ $(C "[...document.querySelectorAll(\".bar-tools > *\")].map(b=>b.getAttribute(\"aria-label\")||b.title).join(\",\")") == "\"Search,Settings\"" ]]'
