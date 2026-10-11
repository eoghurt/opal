# ---- The note's editing bar is solid (nothing shows through), and opening a page keeps the folder list's scroll ----
for i in $(seq -w 1 40); do mkdir -p "$V/Zfolder $i"; echo "# Note $i" > "$V/Zfolder $i/Note $i.md"; done; sleep 2.5
openfile "Welcome"; sleep 1
alpha(){ C "(()=>{const c=getComputedStyle(document.querySelector('$1')).backgroundColor; if(c==='transparent') return 0; const a=c.match(/\\/\\s*([\\d.]+)\\s*\\)$/) || c.match(/^rgba\\([^,]+,[^,]+,[^,]+,\\s*([\\d.]+)\\)$/); return a?Number(a[1]):1})()"; }   # 1 = solid (rgb(), rgba() or color(srgb …))
ok "light: the bar and its keys are solid" '[[ $(alpha ".note-view .ribbon") == 1 && $(alpha ".note-view .ribbon .rb-btn") == 1 ]]'
C "document.documentElement.dataset.mode='dark'; 1" >/dev/null; sleep 0.3
ok "dark: the bar and its keys are solid too" '[[ $(alpha ".note-view .ribbon") == 1 && $(alpha ".note-view .ribbon .rb-btn") == 1 ]]'
C "document.documentElement.dataset.mode='light'; 1" >/dev/null
C "const t=document.querySelector('#sidebar .side-tree:not(.side-bookmarks)'); t.scrollTop=t.scrollHeight; 1" >/dev/null; sleep 0.3
before=$(C "document.querySelector('#sidebar .side-tree:not(.side-bookmarks)').scrollTop")
C "[...document.querySelectorAll('.side-name')].find(e=>e.textContent.startsWith('Zfolder 38')).click(); 1" >/dev/null; sleep 1.2
after=$(C "document.querySelector('#sidebar .side-tree:not(.side-bookmarks)').scrollTop")
ok "opening a folder far down the list keeps the list where it was (was $before, now $after)" '[[ $before -gt 200 && $after -ge $((before - 40)) ]]'
C "[...document.querySelectorAll('.side-file')].find(e=>e.textContent==='Note 38').click(); 1" >/dev/null; sleep 1.2
after2=$(C "document.querySelector('#sidebar .side-tree:not(.side-bookmarks)').scrollTop")
ok "and opening a note there too (now $after2)" '[[ $after2 -ge $((before - 40)) ]]'
