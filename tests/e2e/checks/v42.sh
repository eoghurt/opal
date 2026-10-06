# ---- Money (fidget): Ledger plugin files, budget, moving money, goals, income, editing ----
C --key Escape >/dev/null
T=$(date +%Y-%m-%d); MON=$(date +%Y-%m); NEXT=$(date -v+1m +%Y-%m)
L="$V/transactions.ledger"; B="$V/budget.ledger"
C "document.querySelector('.bar-tools [title^=\"Money\"]').click(); 1" >/dev/null; sleep 1.2
tab() { C "[...document.querySelectorAll('.money-tab')].find(b=>b.textContent==='$1').click(); 1" >/dev/null; sleep 0.6; }
# Budget: add three categories
tab Budget
addcat() { C "(()=>{const b=[...document.querySelectorAll('.money-add-cats .money-chip')].find(b=>b.textContent==='$1'); b.click(); return 1})()" >/dev/null; sleep 1; C "(()=>{const r=[...document.querySelectorAll('.money-brow')].find(r=>r.textContent.includes('$1')); const i=r.querySelector('.money-amount'); i.value='$2'; i.dispatchEvent(new Event('change')); return 1})()" >/dev/null; sleep 1; }
addcat Food 250; addcat "Going out" 150; addcat Subscriptions 40
ok "suggested categories are added with a click; amounts go into budget.ledger" 'grep -q "^~ Monthly$" "$B" && grep -q "^    Expenses:Food    \$250.00$" "$B" && grep -q "^    Expenses:Going out    \$150.00$" "$B" && grep -q "^    Assets:Budget$" "$B"'
# + New category from the budget page (only its name is typed)
C "(()=>{[...document.querySelectorAll('.money-add-cats .money-chip')].find(b=>b.textContent==='+ New').click(); const i=document.querySelector('.money-chip-input'); i.value='climbing'; i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); return 1})()" >/dev/null; sleep 1.2
ok "+ New makes a category of your own (Climbing)" 'grep -q "^    Expenses:Climbing    \$0.00$" "$B"'
# Adding entries: title and amount typed, everything else clicked
add() { # kind title amount choice
C "document.querySelector('.money-head .money-add').click(); 1" >/dev/null; sleep 0.4
C "(()=>{const p=document.querySelector('.money-pop'); [...p.querySelectorAll('.money-kind')].find(b=>b.textContent==='$1').click(); p.querySelector('[aria-label=Title]').value='$2'; p.querySelector('.money-amount-big').value='$3'; const c=[...p.querySelectorAll('.money-field')][0].querySelectorAll('.money-chip'); [...c].find(b=>b.textContent==='$4').click(); p.requestSubmit(); return 1})()" >/dev/null; sleep 1.2; }
ok "the add box only has two typing boxes (title and amount)" '[[ $(C "(()=>{document.querySelector(\".money-head .money-add\").click(); const n=document.querySelectorAll(\".money-pop input:not([type=date])\").length; document.querySelector(\".money-pop .money-btn\").click(); return n})()") == 2 ]]'
add Spend Woolworths 42.10 Food
ok "spending: picked category, default account, today — in the plugin's format" '[[ "$(head -3 "$L")" == "$T Woolworths
    Expenses:Food    \$42.10
    Assets:Everyday" ]]'
add Spend "Dinner with the team" 138.50 "Going out"
ok "…entries have a blank line between" 'grep -q "^    Expenses:Going out    \$138.50$" "$L" && [[ $(grep -c "^$" "$L") == 1 ]]'
add Income "Tutoring · Year 9 maths" 80 Tutoring
ok "income: a suggested job (Tutoring) is one click; money goes into the account" 'grep -A2 "Tutoring · Year 9 maths" "$L" | grep -q "^    Assets:Everyday    \$80.00$" && grep -A2 "Tutoring · Year 9 maths" "$L" | grep -q "^    Income:Tutoring$"'
# Move money: $20 from Subscriptions to Going out (this month only)
tab Budget
C "(()=>{const f=document.querySelector('.money-move'); f.querySelector('[aria-label=\"Amount to move\"]').value='20'; f.querySelector('[aria-label=\"Move from\"]').value='Expenses:Subscriptions'; f.querySelector('[aria-label=\"Move to\"]').value='Expenses:Going out'; f.requestSubmit(); return 1})()" >/dev/null; sleep 1.2
ok "moving money writes a this-month-only budget block" 'grep -q "^~ Monthly from $MON-01 to $NEXT-01$" "$B" && grep -q "^    ; moved \$20.00 from Subscriptions to Going out$" "$B" && grep -q "^    Expenses:Subscriptions    \$-20.00$" "$B"'
ok "…the Going out budget is now \$170 for this month (and shows it was moved)" '[[ $(C "[...document.querySelectorAll(\".money-brow\")].find(r=>r.textContent.includes(\"Going out\")).textContent.includes(\"+\$20 moved\")") == "true" ]]'
ok "…the monthly amount itself is unchanged" 'grep -q "^    Expenses:Going out    \$150.00$" "$B"'
C "[...document.querySelectorAll('.money-brow')].find(r=>r.textContent.includes('Food')).querySelector('.set-toggle').click(); 1" >/dev/null; sleep 1.2
ok "carry-over is remembered in budget.ledger as a comment" 'grep -q "^; opal-rollover: Expenses:Food | $MON$" "$B"'
# Saving goal
tab Saving
C "(()=>{const f=[...document.querySelectorAll('.money-inline')].find(f=>f.querySelector('[aria-label=\"Goal name\"]')); f.querySelector('[aria-label=\"Goal name\"]').value='Climbing shoes'; f.querySelector('[aria-label=\"Target amount\"]').value='220'; f.requestSubmit(); return 1})()" >/dev/null; sleep 1.2
ok "a goal is saved in budget.ledger" 'grep -q "^; opal-goal: Assets:Savings:Climbing shoes | \$220.00$" "$B"'
C "(()=>{const f=document.querySelector('.money-goal-card form'); f.querySelector('input').value='50'; f.requestSubmit(); return 1})()" >/dev/null; sleep 1.2
ok "putting money in is a transfer into its savings account" 'grep -A2 "To savings · Climbing shoes" "$L" | grep -q "^    Assets:Savings:Climbing shoes    \$50.00$"'
ok "…and the goal shows \$50 of \$220" '[[ $(C "document.querySelector(\".money-goal-card .money-num\").textContent") == "\"\$50 of \$220\"" ]]'
# Overview numbers
tab Overview
tiles=$(C "[...document.querySelectorAll('.money-tile-big')].map(t=>t.textContent).join('|')")
ok "overview: net worth −\$100.60, spent \$180.60 of \$440, saved \$50, income \$80" '[[ $tiles == "\"−\$100.60|\$180.60 of \$440|\$50|\$80\"" ]]'
ok "…Going out (\$138.50 of \$170) isn't flagged; nothing is over" '[[ $(C "document.querySelectorAll(\".money-warn\").length") == 0 ]]'
# Edit an entry: Woolworths 42.10 → 52.10
tab History
C "[...document.querySelectorAll('.money-entry')].find(r=>r.textContent.includes('Woolworths')).click(); 1" >/dev/null; sleep 0.4
C "(()=>{const p=document.querySelector('.money-pop'); p.querySelector('.money-amount-big').value='52.10'; p.requestSubmit(); return 1})()" >/dev/null; sleep 1.2
ok "editing an entry rewrites it in place" 'grep -q "^    Expenses:Food    \$52.10$" "$L" && ! grep -q "42.10" "$L" && [[ $(grep -c "Woolworths" "$L") == 1 ]]'
# Delete an entry
C "[...document.querySelectorAll('.money-entry')].find(r=>r.textContent.includes('Dinner')).querySelector('.money-x').click(); 1" >/dev/null; sleep 0.5
C "[...document.querySelectorAll('.ask-choice')].find(b=>b.textContent==='Delete').click(); 1" >/dev/null; sleep 1.2
ok "deleting an entry removes it (and its blank line)" '! grep -q "Dinner" "$L" && ! grep -q -Pzo "\n\n\n" "$L" 2>/dev/null; ! grep -q "Dinner" "$L"'
# The files show in the sidebar and open the Money page
ok "transactions.ledger shows in the sidebar" '[[ $(C "[...document.querySelectorAll(\".side-file\")].some(e=>e.textContent.startsWith(\"transactions\"))") == "true" ]]'
# Something written by hand (plugin style) is read too
printf -- '\n2026-01-15 * Old savings\n  * Assets:Savings:Climbing shoes    $30.00\n  * Assets:Everyday\n' >> "$L"; sleep 2
tab Saving
ok "entries written elsewhere (with ✓ marks) are read too: the goal now has \$80" '[[ $(C "document.querySelector(\".money-goal-card .money-num\").textContent") == "\"\$80 of \$220\"" ]]'
