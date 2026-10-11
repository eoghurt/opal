# ---- A note changed in another app while typing here: the other version is kept, and you choose. Errors are shown and logged. ----
mkdir -p "$V/Clash"; printf 'Line one\nLine two\nLine three\n' > "$V/Clash/Plan.md"; sleep 1.5
openfile "Plan"; sleep 1
# Type at the start (unsaved for half a second), and meanwhile another app changes the last line.
OPAL_FOCUS=1 C "(()=>{const c=document.querySelector('.cm-content'); c.focus(); const t=document.createTreeWalker(c.querySelector('.cm-line'),NodeFilter.SHOW_TEXT).nextNode(); const r=document.createRange(); r.setStart(t,0); r.setEnd(t,0); getSelection().removeAllRanges(); getSelection().addRange(r); document.execCommand('insertText', false, 'MINE '); return 1})()" >/dev/null
printf 'Line one\nLine two\nLine three THEIRS\n' > "$V/Clash/Plan.md"; sleep 2.5
ok "Opal's save went ahead (your typing is on disk)" '[[ $(head -1 "$V/Clash/Plan.md") == "MINE Line one" ]]'
ok "…and the other app's version was put in the note's history first" '[[ -n "$(grep -rl "Line three THEIRS" "$V/.opal/history" 2>/dev/null)" ]]'
ok "a notice says so, with Compare / Keep mine / Keep theirs / Merge" '[[ $(C "[...document.querySelectorAll(\".toast\")].map(t=>t.querySelector(\"b\").textContent + \"|\" + [...t.querySelectorAll(\".toast-btn\")].map(b=>b.textContent).join(\",\")).join(\"\n\")") == "\"“Plan” was also changed in another app.|Compare,Keep mine,Keep theirs,Merge\"" ]]'
C "[...document.querySelectorAll('.toast-btn')].find(b=>b.textContent==='Compare').click(); 1" >/dev/null; sleep 0.5
ok "Compare shows both versions, each with its own change marked" '[[ $(C "[...document.querySelectorAll(\".cmp-line.is-mine\")].map(e=>e.textContent).join() + \"|\" + [...document.querySelectorAll(\".cmp-line.is-theirs\")].map(e=>e.textContent).join()") == "\"MINE Line one,Line three|Line one,Line three THEIRS\"" ]]'
C "document.querySelector('.cmp-backdrop').click(); 1" >/dev/null; sleep 0.3
C "[...document.querySelectorAll('.toast-btn')].find(b=>b.textContent==='Merge').click(); 1" >/dev/null; sleep 2
ok "Merge keeps both changes, and saves" '[[ $(tr "\n" "|" < "$V/Clash/Plan.md") == "MINE Line one|Line two|Line three THEIRS|" ]]'
ok "a note changed outside while nothing was unsaved just reloads (no notice)" 'printf "Calm\n" > "$V/Clash/Plan.md"; sleep 2; [[ $(C "document.querySelector(\".cm-content\").textContent") == "\"Calm\"" ]]'
# Errors
C "document.querySelectorAll('.toast').forEach(t=>t.close()); 1" >/dev/null; sleep 0.4
M "setTimeout(() => { throw new Error('test boom in main'); }, 0); 1" >/dev/null; sleep 1
ok "an uncaught error in the main process is caught, logged and shown" 'grep -q "test boom in main" "$S/userdata/opal.log" && [[ $(C "document.querySelector(\".toast.is-error b\")?.textContent") == "\"Something went wrong inside Opal. It has been written to the log.\"" ]]'
C "setTimeout(() => { throw new Error('test boom in window'); }, 0); 1" >/dev/null; sleep 1
ok "the window's own errors go in the log too" 'grep -q "\[window: error\].*test boom in window" "$S/userdata/opal.log"'
C "document.querySelectorAll('.toast').forEach(t=>t.close()); 1" >/dev/null; sleep 0.4
chmod 555 "$V/Clash"
OPAL_FOCUS=1 C "(()=>{const c=document.querySelector('.cm-content'); c.focus(); document.execCommand('insertText', false, ' more'); return 1})()" >/dev/null; sleep 2
ok "a save that fails shows a message (and keeps the typing)" '[[ $(C "document.querySelector(\".toast.is-error b\")?.textContent") == "\"Couldn’t save “Plan”.\"" || $(C "document.querySelector(\".toast.is-error b\")?.textContent") == "\"Couldn'"'"'t save “Plan”.\"" ]] && [[ $(C "document.querySelector(\".cm-content\").textContent") == *more* ]]'
chmod 755 "$V/Clash"; sleep 3.5
ok "…and it saves once it can" 'grep -q "more" "$V/Clash/Plan.md"'
