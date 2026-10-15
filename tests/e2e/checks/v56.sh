# ---- Debate: practice speeches (a prep note → speak → recording → transcript → judging) in the Log, the motion bank, Training and the Board ----
C --key Escape >/dev/null
T=$(date +%Y-%m-%d)
D="$V/Debate"; mkdir -p "$D/Motions/Practice preps" "$D/Rounds" "$D/Feedback/2 In Progress" "$D/Feedback/3 Parked"
MOTION='THBT the fifth wave of feminism will be more exclusionary'
printf -- 'Ideas\n- %s\n- THW abolish the jury system\n' "$MOTION" > "$D/Motions/Motion ideas.md"
printf -- '%s\n### Aff\nWho gets heard online\n### Neg\n' "$MOTION" > "$D/Motions/Practice preps/Fifth wave feminism.md"
# The contract (Claude's debate-judging skill writes exactly this), dated today.
cat > "$D/Rounds/PRAC-$T-P.md" <<EOF
---
opal-type: debate-round
round_id: PRAC-$T-P
round: Practice
format: World Schools
position: 1st Prop
motion: $MOTION
prep: "[[Fifth wave feminism]]"
prep_minutes: 30
recording: "[[PRAC-$T-P.m4a]]"
judge: Claude
wsdc_style: 26.5
wsdc_content: 27
wsdc_strategy: 13.5
wsdc_total: 67
wudc: 71
duration: "6:59"
wpm: 203
fillers: 63
score_mechanism_depth: 2
score_characterisation: 2
score_weighing_and_comparison: 1
score_structure_and_signposting: 4
form2: true
---
## Transcript
## Judging
## Symptom
## Cause
## Mini fix
## Model rewrite
EOF
# Two more speeches judged by Claude (one on the same motion, best 69), and
# three competition rounds a panel scored.
speech() { cat > "$D/Rounds/$1.md" <<EOF
---
opal-type: debate-round
round_id: $1
round: Practice
format: World Schools
position: $2
motion: $3
judge: Claude
wsdc_total: $4
wpm: $5
fillers: $6
score_mechanism_depth: $7
score_weighing_and_comparison: 2
form2: true
---
## Transcript
## Judging
EOF
}
speech PRAC-2026-09-01-P "Opp Reply" "$MOTION" 69 188 41 3
speech PRAC-2026-08-01-P "2nd Opp" "THW abolish the jury system" 64 221 88 2
panel() { printf -- '---\nopal-type: debate-round\nround_id: %s\ncompetition: "[[Spring Open 2026]]"\ndate: %s\nround: %s\nformat: World Schools\nposition: 2nd Prop\nmotion: THW ban zoos\nresult: Loss\nform2: true\nscore_mechanism_depth: %s\nscore_weighing_and_comparison: %s\n---\n' "$1" "$2" "$3" "$4" "$5" > "$D/Rounds/$1.md"; }
panel SO26-R1 2026-05-01 R1 4 1
panel SO26-R2 2026-05-01 R2 4 2
panel SO26-R3 2026-05-02 R3 5 1
# Board: a parked card seen in a practice speech, and one on trial in practice speeches.
printf -- '---\nround_id: SO26-R1\ndimension: Weighing and comparison\nstatus: parked\nopened: 2026-05-02\n---\n\n# Weighing and comparison — no even-if layer\n\n## Evidence\n\n> Never compared the two worlds. (PRAC-%s-P)\n\nRounds this has appeared in: SO26-R1, PRAC-%s-P\n' "$T" "$T" > "$D/Feedback/3 Parked/Weighing.md"
printf -- '---\nround_id: SO26-R2\ndimension: Mechanism depth\nstatus: in-progress\nopened: 2026-05-02\n---\n\n# Mechanism depth — stops at the first link\n\n## Evidence\n\n> Thin. (SO26-R2)\n\nRounds this has appeared in: SO26-R2\n\n## Trial\n\n| Round | Result |\n| --- | --- |\n| PRAC-2026-09-01-P | Held |\n| PRAC-%s-P | |\n' "$T" > "$D/Feedback/2 In Progress/Mechanism.md"
# The whisper model (any file; fake-whisper.sh only checks it's there).
: > "$S/fake-model.bin"; mkdir -p "$V/.opal"; printf '{"debate": {"whisperModel": "%s"}}\n' "$S/fake-model.bin" > "$V/.opal/settings.json"
sleep 2.5

# ---- Log: practice speeches as their own group ----
fidget Debate
C "document.querySelector('.deb-rail-btn:nth-child(4)').click(); 1" >/dev/null; sleep 1
ROWS=$(C "JSON.stringify([...document.querySelectorAll('.deb-prac-row:not(.is-head)')].map(r=>[...r.children].map(c=>c.textContent)))")
ok "the Log lists the 3 practice speeches, newest first" '[[ $(C "document.querySelectorAll(\".deb-prac-row:not(.is-head)\").length") == 3 && "$ROWS" == *"$MOTION"*"1st Prop"*"67"*"Claude"*"Opp Reply"*"69"*"2nd Opp"*"64"* ]]'
ok "…and no competition round is in that group" '[[ "$ROWS" != *"zoos"* ]]'
C "document.querySelector('.deb-prac-row:not(.is-head)').click(); 1" >/dev/null; sleep 1
ok "a row opens the speech: its Round ID, WSDC total and judge" '[[ $(C "document.querySelector(\".deb-h1\").textContent") == "\"PRAC-$T-P\"" && $(C "document.querySelector(\".deb-main\").textContent") == *"by Claude"*"WSDC total67"* ]]'

# ---- Motion bank: speeches given on the selected motion ----
C "document.querySelector('.deb-rail-btn:nth-child(2)').click(); 1" >/dev/null; sleep 1
C "[...document.querySelectorAll('.deb-motion-main')].find(b=>b.textContent.includes('$MOTION')).click(); 1" >/dev/null; sleep 0.8
ok "the selected motion says Given 2 times, best 69" '[[ $(C "document.querySelector(\".deb-given h3\")?.textContent") == "\"Given 2 times, best 69\"" ]]'
ok "…with both speeches (found by the prep link and the wording), best marked" '[[ $(C "document.querySelectorAll(\".deb-given .deb-speech\").length") == 2 && $(C "document.querySelector(\".deb-speech .is-best\")?.textContent") == "\"69\"" ]]'
ok "the motion's row says Spoken 2×" '[[ $(C "[...document.querySelectorAll(\".deb-motion-row\")].some(r=>r.textContent.includes(\"Spoken 2×\"))") == true ]]'
C "document.querySelector('.deb-given .deb-speech').click(); 1" >/dev/null; sleep 1.2
ok "clicking a speech opens its note" '[[ $(C "document.title") == "\"PRAC-$T-P — Opal\"" ]]'

# ---- Training: competition and practice medians apart ----
fidget Debate
C "document.querySelector('.deb-rail-btn:nth-child(6)').click(); 1" >/dev/null; sleep 1
med() { C "(()=>{const r=[...document.querySelectorAll('.deb-med-row')].find(x=>x.firstChild.textContent==='$1'); return r ? [...r.querySelectorAll('.deb-med .deb-mono')].map(x=>x.textContent).join('|') : 'none'})()" | tr -d '"'; }
ok "the columns: 3 competition rounds, 3 practice speeches judged by Claude" '[[ $(C "document.querySelector(\".deb-med-row.is-head\").textContent") == *"Competition · 3"*"Practice · Claude · 3"* ]]'
ok "Mechanism depth: competition 4, practice 2 (never mixed)" '[[ "$(med "Mechanism depth")" == "4|2" ]]'
ok "Weighing and comparison: competition 1, practice 2" '[[ "$(med "Weighing and comparison")" == "1|2" ]]'
ok "fewer than 3 rounds shows how many, not a median" '[[ "$(med "Characterisation")" == "—|1 of 3" && "$(med "Round vision")" == "—|—" ]]'
ok "the practice trend has WSDC total, wpm and fillers, latest last" '[[ $(C "[...document.querySelectorAll(\".deb-spark b\")].map(b=>b.textContent).join(\"|\")") == "\"67|203|63\"" && $(C "document.querySelectorAll(\".deb-spark circle\").length") == 9 ]]'

# ---- Overview: the gating chain uses panel rounds only ----
C "document.querySelector('.deb-rail-btn:nth-child(1)').click(); 1" >/dev/null; sleep 1
ok "Fix from the top counts only the 3 competition rounds" '[[ $(C "document.querySelector(\"[aria-label=\\\"Fix from the top\\\"] .deb-muted\").textContent") == "\"median, last 3 rounds\"" ]]'

# ---- Board: practice evidence is tagged; nothing moves by itself ----
C "document.querySelector('.deb-rail-btn:nth-child(5)').click(); 1" >/dev/null; sleep 1
ok "the parked card wears a practice tag" '[[ $(C "[...document.querySelectorAll(\".deb-column[aria-label=Parked] .deb-board-card\")].some(c=>c.querySelector(\".deb-tag.is-practice\"))") == true ]]'
ok "the card on trial takes PRAC rows, each tagged" '[[ $(C "[...document.querySelectorAll(\".deb-trial\")].map(t=>t.textContent).join(\"|\")") == *"PRAC-2026-09-01-P practice"*"PRAC-$T-P practice"* ]]'
C "document.querySelector('.deb-column[aria-label=Parked] .deb-board-card').click(); 1" >/dev/null; sleep 0.8
ok "its practice evidence and Seen in are tagged" '[[ $(C "document.querySelectorAll(\".deb-quote.is-practice\").length") == 1 && $(C "document.querySelector(\".deb-detail.is-card .deb-small\").textContent") == *"PRAC-$T-P practice"* ]]'
ok "it stays in Parked (practice evidence doesn't move it)" '[[ -f "$D/Feedback/3 Parked/Weighing.md" ]]'

# ---- Speak from the prep note: a phone recording dropped in ----
openfile 'Fifth wave feminism'
C "document.querySelector('.rb-speak').click(); 1" >/dev/null; sleep 1.5
ok "Speak on the prep note opens the speech timer with its motion" '[[ $(C "document.querySelector(\".deb-h1\").textContent") == "\"$MOTION\"" && $(C "document.querySelector(\".deb-kicker\").textContent") == *"prep: Fifth wave feminism"* && $(C "document.querySelector(\".deb-clock small\").textContent") == "\"of 8:00\"" ]]'
ok "World Schools bells at 1:00, 7:00 and 8:00, protected first and last minute" '[[ $(C "[...document.querySelectorAll(\".deb-bell i\")].map(i=>i.textContent).join()") == "\"1:00,7:00,8:00\"" && $(C "document.querySelectorAll(\".deb-track-protect\").length") == 2 ]]'
clickText .deb-seg-btn "Reply · 4:00" 0.4
ok "a reply is 4:00" '[[ $(C "document.querySelector(\".deb-clock small\").textContent") == "\"of 4:00\"" ]]'
clickText ".deb-q .deb-chip" "1st Prop" 0.4
afconvert -f WAVE -d LEI16@16000 -c 1 /System/Library/Sounds/Glass.aiff "$S/phone.wav" 2>/dev/null
B64=$(base64 -i "$S/phone.wav" | tr -d '\n')
C "(()=>{const b=atob('$B64'); const u=new Uint8Array(b.length); for(let i=0;i<b.length;i++) u[i]=b.charCodeAt(i); const dt=new DataTransfer(); dt.items.add(new File([u],'phone.wav',{type:'audio/wav'})); document.querySelector('.deb-drop').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt})); return 1})()" >/dev/null; sleep 5
NOTE="$D/Rounds/PRAC-$T-P2.md"
ok "the second speech today is PRAC-$T-P2, its audio turned into .m4a" '[[ -f "$NOTE" && -f "$D/Rounds/Audio/PRAC-$T-P2.m4a" ]] && afinfo "$D/Rounds/Audio/PRAC-$T-P2.m4a" | grep -q aac'
ok "its note has prep, format, position, motion, duration and recording" 'grep -qx "prep: \"\[\[Fifth wave feminism\]\]\"" "$NOTE" && grep -qx "prep_minutes: 30" "$NOTE" && grep -qx "format: World Schools" "$NOTE" && grep -qx "position: \"1st Prop\"" "$NOTE" && grep -qx "motion: $MOTION" "$NOTE" && grep -qx "duration: \"0:02\"" "$NOTE" && grep -qx "recording: \"\[\[PRAC-$T-P2.m4a\]\]\"" "$NOTE" && grep -qx "round: Practice" "$NOTE"'
ok "whisper's transcript went into Transcript (afconvert made it a 16 kHz mono WAV)" 'grep -q "^Madam Speaker, right? Um, the fifth wave" "$NOTE"'
ok "wpm and fillers counted, and the Fillers line tops Judging" 'grep -qx "fillers: 8" "$NOTE" && grep -qx "wpm: 900" "$NOTE" && grep -A2 "^## Judging" "$NOTE" | grep -qx "Fillers: 8 (right? 1, like 1, kind of 1, you know 1, um 1, uh 1, I think 1, basically 1) · 900 wpm · 0:02"'
ok "the six headings are there, in order" '[[ "$(grep "^## " "$NOTE" | tr "\n" "|")" == "## Transcript|## Judging|## Symptom|## Cause|## Mini fix|## Model rewrite|" ]]'
ok "the speech page shows the numbers" '[[ $(C "document.querySelector(\".deb-h1\").textContent") == "\"PRAC-$T-P2\"" && $(C "document.querySelector(\".deb-code\")?.textContent") == "\"Fillers: 8"* ]]'

# ---- No model: one line saying what's missing, and pasting works ----
printf '{"debate": {"whisperModel": ""}}\n' > "$V/.opal/settings.json"; sleep 1
clickText .deb-btn "Transcribe again" 1.5
ok "without a model it says what to do, in one line" '[[ $(C "document.querySelector(\".deb-notice.is-amber\")?.textContent") == *"needs a whisper model"*"Settings › Debate"* ]]'
C "(()=>{const t=document.querySelector('.deb-textarea.is-tall'); t.value='So basically I think the case is this. '.repeat(30); return 1})()" >/dev/null
clickText .deb-btn "Use this transcript" 1.5
ok "a pasted transcript replaces it, with new numbers" 'grep -q "^So basically I think the case is this." "$NOTE" && grep -qx "fillers: 60" "$NOTE" && grep -A2 "^## Judging" "$NOTE" | grep -q "^Fillers: 60 (I think 30, basically 30)"'

# ---- Recording from the microphone (a pretend one in tests) ----
C "document.querySelector('.deb-rail-btn:nth-child(4)').click(); 1" >/dev/null; sleep 1
clickText ".deb-chips .deb-chip" Practice 0.6
clickText .deb-btn "Speak instead →" 1
clickText .deb-btn "● Start speaking" 3.2
ok "the timer runs while recording" '[[ $(C "document.querySelector(\".deb-clock\").firstChild.textContent") == "\"0:03\"" || $(C "document.querySelector(\".deb-clock\").firstChild.textContent") == "\"0:02\"" ]]'
clickText .deb-btn "■ Stop and save" 4
ok "Stop saves PRAC-$T-P3 with its recording and length" '[[ -f "$D/Rounds/PRAC-$T-P3.md" && -f "$D/Rounds/Audio/PRAC-$T-P3.m4a" ]] && grep -Eqx "duration: \"0:0[23]\"" "$D/Rounds/PRAC-$T-P3.md"'
ok "…and opens the saved speech" '[[ $(C "document.querySelector(\".deb-h1\").textContent") == "\"PRAC-$T-P3\"" ]]'

# ---- Settings › Debate ----
C "document.querySelector('.wordmark').click(); 1" >/dev/null; sleep 1
M "require('electron').BrowserWindow.getAllWindows()[0].webContents.send('ui:show-palettes')" >/dev/null; sleep 1.2
clickText .settings-pill Debate 0.8
ok "Settings › Debate says whether whisper-cpp is there and which model" '[[ $(C "document.querySelector(\".settings-body\").textContent") == *"whisper-cpp"*"Installed"*"Model"* ]]'
C --key Escape >/dev/null
