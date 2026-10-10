# ---- Heatmaps from notes (Tracker blocks) ----
C --key Escape >/dev/null
for i in $(seq 1 7 200); do d=$(date -v-${i}d +%Y-%m-%d); f="$V/Calendar/$d.md"; [ -f "$f" ] || printf -- "# $d\n" > "$f"; printf -- "Run #run:%s\n" $((i % 9 + 2)) >> "$f"; done
EXPECT=$(for i in $(seq 1 7 200); do d=$(date -v-${i}d +%s); [ $d -ge $(date -v-52w -v-7d +%s) ] && echo $((i % 9 + 2)); done | paste -sd+ - | bc)
printf -- '# Training\n\n```tracker\nsearchType: tag\nsearchTarget: run\nfolder: Calendar\ndatasetName: Running\nvalueUnit: km\nmonth:\n    color: orange\n```\n\nNotes below.\n' > "$V/Training.md"
mkdir -p "$V/Films"; for n in 1 2 3; do printf -- '---\nwatched: %s\nrating: %s\n---\n# Film %s\n' "$(date -v-${n}d +%Y-%m-%d)" $((n+2)) $n > "$V/Films/Film $n.md"; done
printf -- '# Films\n\n```tracker\nsearchType: frontmatter\nsearchTarget: rating\nfolder: Films\ndateProperty: watched\ndatasetName: Films watched\n```\n' > "$V/Film log.md"; sleep 2.5
cp "$V/Training.md" "$S/training-before.md"
C "[...document.querySelectorAll('.side-file')].find(b=>b.textContent==='Training').click(); 1" >/dev/null; sleep 2.5
ok "a tracker block shows as a heatmap (tag with values)" '[[ $(C "document.querySelector(\".heatmap .heat-title\").textContent + \"|\" + document.querySelector(\".heat-foot\").textContent") == "\"Running|"*"$EXPECT km in all"* ]]'
ok "one square per day for a year, with the days logged filled in" '[[ $(C "document.querySelectorAll(\".heat-weeks .heat-cell\").length + \"|\" + document.querySelectorAll(\".heat-weeks .heat-cell:not(.lvl-0)\").length") == "\"371|"* ]] && [[ $(C "document.querySelectorAll(\".heat-weeks .heat-cell:not(.lvl-0)\").length > 20") == "true" ]]'
ok "viewing it doesn't change the note" 'cmp -s "$V/Training.md" "$S/training-before.md"'
C "document.querySelector('.heat-weeks button.heat-cell').click(); 1" >/dev/null; sleep 1.3
ok "clicking a square opens that day's note" '[[ $(C "document.querySelector(\".crumb-current\").textContent") =~ ^\"20[0-9]{2}-[0-9]{2}-[0-9]{2}\"$ ]]'
C "[...document.querySelectorAll('.side-file')].find(b=>b.textContent==='Film log').click(); 1" >/dev/null; sleep 2.5
ok "notes dated by a property (dateProperty), values from a property" '[[ $(C "document.querySelector(\".heat-foot\").textContent") == *"3 days"*"12 in all"* ]]'
C "document.querySelector('.heat-edit').click(); 1" >/dev/null; sleep 0.6
ok "Edit shows the block's settings to change" '[[ $(C "!document.querySelector(\".heatmap\") && document.querySelector(\".cm-content\").textContent.includes(\"searchType: frontmatter\")") == "true" ]]'
C "document.querySelector('.side-file[title=\"Welcome.md\"]').click(); 1" >/dev/null; sleep 1.2
C "(()=>{const v=document.querySelector('.cm-content'); return 1})()" >/dev/null
C "document.querySelector('.ribbon .rb-insert').dispatchEvent(new MouseEvent('mousedown',{bubbles:true})); 1" >/dev/null; sleep 0.4
C "[...document.querySelectorAll('.rb-menu button')].find(b=>b.textContent==='Heatmap').dispatchEvent(new MouseEvent('mousedown',{bubbles:true})); 1" >/dev/null; sleep 1.5
ok "the ribbon's Heatmap button adds a starter block" 'grep -q "^searchTarget: exercise$" "$V/Welcome.md" && grep -q "^\`\`\`tracker$" "$V/Welcome.md"'
C "document.querySelector('.wordmark').click(); 1" >/dev/null; sleep 1.5
C "[...document.querySelectorAll('.widgets-btn')].find(b=>b.textContent.includes('Customize')).click(); 1" >/dev/null; sleep 0.4
C "[...document.querySelectorAll('.widgets-add-btn')].find(b=>b.textContent.includes('Heatmap')).click(); 1" >/dev/null; sleep 2.5
ok "a Heatmap widget on the home page shows one of them" '[[ $(C "!!document.querySelector(\".widget-heatmap .heatmap\")") == "true" ]]'
