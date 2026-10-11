# ---- A note's menu is the same in the sidebar and on its tab (the tab adds Pin / Duplicate and Close) ----
openfile "Welcome"; sleep 1
items(){ C "[...document.querySelectorAll('.ctx-menu .ctx-item > span:first-child')].map(e=>e.textContent).join('|') + (document.querySelector('.ctx-menu .ctx-colours') ? '|+colours' : '')"; }
esc(){ C "document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); 1" >/dev/null; sleep 0.3; }
C "[...document.querySelectorAll('.side-file')].find(e=>e.textContent==='Welcome').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:200,clientY:300})); 1" >/dev/null; sleep 0.4
SIDE=$(items); esc
C "document.querySelector('#tabbar .tab.is-active .tab-title').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:200,clientY:160})); 1" >/dev/null; sleep 0.4
TAB=$(items); esc
ok "the sidebar menu has Copy path and Copy vault path, and the colours" '[[ $SIDE == *"Show in Finder|Copy path|Copy vault path|Delete note…|+colours"* ]]'
ok "the tab menu has every sidebar item except Open (it is open), with the colours" '[[ ${TAB} == "\"Pin|Duplicate tab|${${SIDE#\"Open|}%\"}|Close|Close others|Close tabs to the right|+colours\"" || ${TAB} == "\"Pin|Duplicate tab|${${SIDE#\"Open|}%|+colours\"}|Close|Close others|Close tabs to the right|+colours\"" ]]'
echo "      sidebar: $SIDE"; echo "      tab:     $TAB"
C "document.querySelector('#tabbar .tab.is-active .tab-title').dispatchEvent(new MouseEvent('dblclick',{bubbles:true,clientX:200,clientY:160})); 1" >/dev/null; sleep 0.4
ok "double-clicking a tab opens the same menu" '[[ $(items) == $TAB ]]'; esc
