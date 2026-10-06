# ---- Money (fidget): Ledger plugin files, budget, moving money, goals, income, editing ----
C --key Escape >/dev/null
T=$(date +%Y-%m-%d); MON=$(date +%Y-%m); NEXT=$(date -v+1m +%Y-%m)
L="$V/transactions.ledger"; B="$V/budget.ledger"
C "document.querySelector('.bar-tools [title^=\"Money\"]').click(); 1" >/dev/null; sleep 1.2
tab() { C "[...document.querySelectorAll('.money-tab')].find(b=>b.textContent==='$1').click(); 1" >/dev/null; sleep 0.6; }
# Budget: add three categories
tab Budget
addcat() { C "(()=>{const f=[...document.querySelectorAll('.money-inline')].find(f=>f.querySelector('[aria-label=\"New category name\"]')); f.querySelector('[aria-label=\"New category name\"]').value='$1'; f.querySelector('[aria-label=\"Its monthly budget\"]').value='$2'; f.requestSubmit(); return 1})()" >/dev/null; sleep 1; }
addcat Food 250; addcat "Going out" 150; addcat Subscriptions 40
ok "categories go into budget.ledger as a Ledger monthly budget" 'grep -q "^~ Monthly$" "$B" && grep -q "^    Expenses:Food    \$250.00$" "$B" && grep -q "^    Expenses:Going out    \$150.00$" "$B" && grep -q "^    Assets:Budget$" "$B"'
# Quick add on History
tab History
C "(()=>{const i=document.querySelector('.money-quick'); i.value='Woolworths 42.10 food'; i.form.requestSubmit(); return 1})()" >/dev/null; sleep 1.2
ok "quick add writes the plugin's format to transactions.ledger" '[[ "$(cat "$L")" == "$T Woolworths
    Expenses:Food    \$42.10
    Assets:Everyday" ]]'
C "(()=>{const i=document.querySelector('.money-quick'); i.value='Dinner with the team 138.50 going'; i.form.requestSubmit(); return 1})()" >/dev/null; sleep 1.2
ok "…a short category name finds the category (going → Going out); entries have a blank line between" 'grep -q "^    Expenses:Going out    \$138.50$" "$L" && [[ $(grep -c "^$" "$L") == 1 ]]'
# Income through the + Add popover
C "document.querySelector('.money-add').click(); 1" >/dev/null; sleep 0.4
C "(()=>{const p=document.querySelector('.money-pop'); [...p.querySelectorAll('.money-kind')].find(b=>b.textContent==='Income').click(); p.querySelector('[aria-label=What]').value='Tutoring · Year 9 maths'; p.querySelector('[aria-label=Amount]').value='80'; p.querySelector('[aria-label=Job]').value='Income:Tutoring'; p.requestSubmit(); return 1})()" >/dev/null; sleep 1.2
ok "income: money into the account, from an Income account" 'grep -A2 "Tutoring · Year 9 maths" "$L" | grep -q "^    Assets:Everyday    \$80.00$" && grep -A2 "Tutoring · Year 9 maths" "$L" | grep -q "^    Income:Tutoring$"'
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
C "(()=>{const p=document.querySelector('.money-pop'); p.querySelector('[aria-label=Amount]').value='52.10'; p.requestSubmit(); return 1})()" >/dev/null; sleep 1.2
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
