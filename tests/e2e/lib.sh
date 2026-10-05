# Shared by the end-to-end checks. Sourced by quick.sh / fresh.sh.
E=/Users/ethan/opal/tests/e2e          # these tools
S=$E/.run                              # scratch: test vault, app data, exports
V=$S/test-vault                        # the vault the test copy opens
mkdir -p "$S"
C() { node $E/cdp.mjs "$@"; }          # the window
M() { node $E/cdp-main.mjs "$@"; }     # the main process
ok() { if eval "$2"; then echo "PASS  $1"; else echo "FAIL  $1"; fi; }
# Centre of an element (scrolled into view): xy "<JS expression for the element>"
xy() { C "(()=>{const e=$1; if(!e) return 'none'; e.scrollIntoView({block:'center'}); const r=e.getBoundingClientRect(); return Math.round(r.x+r.width/2)+','+Math.round(r.y+${2:-r.height/2})})()" | tr -d '"'; }
clickText() { C "[...document.querySelectorAll('$1')].find(b=>b.textContent==='$2').click(); 1" >/dev/null; sleep ${3:-1.2}; }
openfile() { C "(async()=>{ const find=()=>[...document.querySelectorAll('.side-file')].find(e=>e.textContent==='$1'); for (let i=0;i<5&&!find();i++){ [...document.querySelectorAll('.side-caret:not(.is-open)')].forEach(c=>c.click()); await new Promise(r=>setTimeout(r,100)); } find().click(); return 1 })()" >/dev/null; sleep 0.8; }
