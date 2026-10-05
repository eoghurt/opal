# ---- PDFs open where you left them ----
C --key Escape >/dev/null
openpdf() { C "[...document.querySelectorAll('.side-name')].find(b=>b.textContent==='Files')?.click(); 1" >/dev/null; sleep 0.8; C "[...document.querySelectorAll('.side-file')].find(b=>b.textContent.includes('$1')).click(); 1" >/dev/null; sleep 2.5; }
where() { C "(()=>{const s=document.querySelector('.pdf-stage'); const p=document.querySelector('.pdf-page[data-page=\"5\"]'); return document.querySelector('.pdf-page-input').value + '|' + Math.round(s.scrollTop - p.offsetTop)})()" | tr -d '"'; }
openpdf "Reading pack"
C "(()=>{const s=document.querySelector('.pdf-stage'); const p=document.querySelector('.pdf-page[data-page=\"5\"]'); s.scrollTop = p.offsetTop + 200; return 1})()" >/dev/null; sleep 1
BEFORE=$(where); echo "  (left at $BEFORE)"
C "document.querySelector('.side-file[title=\"Welcome.md\"]').click(); 1" >/dev/null; sleep 1.2
openpdf "Reading pack"
close() { local a=${1#*|} b=${2#*|}; [[ ${1%%|*} == ${2%%|*} ]] && (( a - b < 6 && b - a < 6 )); }
ok "leaving a PDF and coming back opens it at the same spot (not page 1)" 'close "$(where)" "$BEFORE"'
C "document.querySelector('.tab-new').click(); 1" >/dev/null; sleep 1.2
C "document.querySelector('.tab').dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0})); 1" >/dev/null; sleep 2.5
ok "…also when switching tabs" 'close "$(where)" "$BEFORE"'
C "[...document.querySelectorAll('.pdf-zoom .pdf-step')].find(b=>b.getAttribute('aria-label')==='Zoom in').click(); 1" >/dev/null; sleep 0.8
ZOOM=$(C "document.querySelector('.pdf-zoom-label').textContent" | tr -d '"'); PAGE=$(C "document.querySelector('.pdf-page-input').value" | tr -d '"')
ok "zooming keeps you on the same page" '[[ $PAGE == "5" ]]'
M "require('electron').BrowserWindow.getAllWindows()[0].webContents.reload(); 1" >/dev/null; sleep 5
ok "…and after Opal restarts, the same page and zoom" '[[ $(C "document.querySelector(\".pdf-page-input\")?.value + \"|\" + document.querySelector(\".pdf-zoom-label\")?.textContent") == "\"5|$ZOOM\"" ]]'
openpdf "Sample handout"
ok "another PDF still opens at its first page" '[[ $(C "document.querySelector(\".pdf-page-input\").value + \"|\" + (document.querySelector(\".pdf-stage\").scrollTop < 30)") == "\"1|true\"" ]]'
