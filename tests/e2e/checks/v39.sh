# ---- Word documents (and other viewers) open where you left them ----
C --key Escape >/dev/null
open1() { C "[...document.querySelectorAll('.side-name')].find(b=>b.textContent==='Files')?.click(); 1" >/dev/null; sleep 0.8; C "[...document.querySelectorAll('.side-file')].find(b=>b.textContent.includes('$1')).click(); 1" >/dev/null; sleep 3; }
top() { C "Math.round(document.querySelector('.viewer').scrollTop)" | tr -d '"'; }
open1 "Landscape timetable"
C "(()=>{const v=document.querySelector('.viewer'); v.scrollTop = v.scrollHeight * 0.6; return 1})()" >/dev/null; sleep 1
LEFT=$(top); echo "  (left at $LEFT px)"
near() { local a=$1 b=$2; (( a - b < 8 && b - a < 8 )); }
ok "the Word file was scrolled well down" '(( LEFT > 400 ))'
C "document.querySelector('.side-file[title=\"Welcome.md\"]').click(); 1" >/dev/null; sleep 1.2
open1 "Landscape timetable"
ok "leaving a Word file and coming back opens it at the same spot" 'near "$(top)" "$LEFT"'
C "document.querySelector('.tab-new').click(); 1" >/dev/null; sleep 1.2
C "document.querySelector('.tab').dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0})); 1" >/dev/null; sleep 3
ok "…also when switching tabs" 'near "$(top)" "$LEFT"'
M "require('electron').BrowserWindow.getAllWindows()[0].webContents.reload(); 1" >/dev/null; sleep 6
ok "…and after Opal restarts" 'near "$(top)" "$LEFT"'
open1 "Excursion note"
ok "another document still opens at the top" '(( $(top) < 5 ))'
open1 "Reading pack"
ok "PDFs still remember their own way (page 1 for a new one)" '[[ $(C "document.querySelector(\".pdf-page-input\")?.value") == "\"1\"" ]]'
