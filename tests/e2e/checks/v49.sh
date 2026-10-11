# ---- Styling a selection that runs onto the next line (or over several) ----
printf 'First line here\nSecond line\n- item one\n' > "$V/Wraptest.md"; sleep 1.5
openfile "Wraptest"; sleep 1.2
pick(){ OPAL_FOCUS=1 C "(()=>{const L=[...document.querySelectorAll('.cm-content .cm-line')]; const first=(el)=>{const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT); return w.nextNode()}; const last=(el)=>{const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT); let n,x; while((x=w.nextNode())) n=x; return n}; const r=document.createRange(); $1; const s=getSelection(); s.removeAllRanges(); s.addRange(r); document.querySelector('.cm-content').focus(); return 1})()" >/dev/null; sleep 0.4; }
press(){ C "document.querySelector('.ribbon .rb-btn[title^=\"$1\"]').dispatchEvent(new MouseEvent('mousedown',{bubbles:true})); 1" >/dev/null; sleep 1.2; }
pick "r.setStart(first(L[0]),0); r.setEnd(first(L[1]),0)"; press Underline
ok "a whole line selected with its line break: the closing mark stays on that line" '[[ $(head -2 "$V/Wraptest.md" | tr "\n" "|") == "<u>First line here</u>|Second line|" ]]'
press Undo
pick "r.setStart(first(L[0]),0); const t=last(L[2]); r.setEnd(t,t.textContent.length)"; press Bold
ok "over several lines: each line is styled on its own, list bullets left outside" '[[ $(tr "\n" "|" < "$V/Wraptest.md") == "**First line here**|**Second line**|- **item one**|" ]]'
press Undo
pick "const t=first(L[1]); r.setStart(t,0); r.setEnd(t,6)"; press Italic
ok "inside a line it works as before" '[[ $(sed -n 2p "$V/Wraptest.md") == "*Second* line" ]]'
