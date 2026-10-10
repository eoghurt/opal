# ---- School page: a folder whose subjects have exam trackers opens as the School overview ----
C "window.__errs=[]; addEventListener(\"error\",e=>window.__errs.push(e.message)); addEventListener(\"unhandledrejection\",e=>window.__errs.push(String(e.reason))); 1" >/dev/null
mkdir -p "$V/School/Methods"
printf -- '---\nopal-type: exam-tracker\ncourse: methods\ntarget: 75\nmoderated: 58\n---\n# Methods exam tracker\n\n## School results\n\n| Assessment | Weight | Mark |\n| --- | --- | --- |\n| Test 1 | 4 | 56 |\n| Test 2 | 12 | 42 |\n| Test 4 | 12 | 57.7 |\n' > "$V/School/Methods/Exam tracker.md"
printf -- '---\nopal-type: exam-tracker\ncourse: economics\ntarget: 80\nmoderated: 65\n---\n# Economics exam tracker\n\n## School results\n\n| Assessment | Weight | Mark |\n| --- | --- | --- |\n| Task 1 | 10 | 80 |\n| Task 7 | 10 | 86.7 |\n' > "$V/School/History/Exam tracker.md"
D1=$(date -v+5d +%Y-%m-%d); D2=$(date -v+9d +%Y-%m-%d)
printf -- '# Exam\n## Schedule\n- 09:00–12:00 Methods WACE\n' > "$V/Calendar/$D1.md"
printf -- '# Exam\n## Schedule\n- 14:00–17:00 History WACE\n' > "$V/Calendar/$D2.md"
cp "/Users/ethan/Desktop/vaults/v3/School/Predicted ATAR.pdf" "$V/School/"
sleep 2
C "document.querySelector('.wordmark').click(); 1" >/dev/null; sleep 1.5
C "[...document.querySelectorAll('.cork-key')].find(k=>k.textContent.includes('School')).click(); 1" >/dev/null; sleep 3
ok "the School folder opens as the School page" '[[ $(C "Boolean(document.querySelector(\".sch\")) && document.querySelector(\".sch-h1\").textContent") == "\"5 days to go.\"" ]]'
ok "…predicted ATAR and average adjusted from the PDF, first exam from the calendar" '[[ $(C "[...document.querySelectorAll(\".sch-stat-big\")].map(e=>e.textContent).join(\"|\")") == "\"93.10|69.6|Methods|0 of 0\"" ]]'
ok "…subjects in exam order with what each needs (2×75−58, 2×80−65)" '[[ $(C "[...document.querySelectorAll(\".sch-table tbody tr\")].map(r=>r.querySelector(\".sch-subject\").textContent+\":\"+r.querySelector(\".sch-need-num\").textContent).join()") == "\"Methods:92,History:95\"" ]]'
C "[...document.querySelectorAll('.sch-seg button')].find(b=>b.textContent==='School mark').click(); 1" >/dev/null; sleep 0.4
ok "…worked out from the school mark instead (2×75−51.2)" '[[ $(C "document.querySelector(\".sch-need-num\").textContent") == "\"99\"" ]]'
ok "the exam timeline and moderation (Methods 56 → 58)" '[[ $(C "document.querySelectorAll(\".sch-line-dot\").length + \"|\" + document.querySelector(\".sch-mod-diff\").textContent") == "\"2|+2\"" ]]'
C "[...document.querySelectorAll('.deb-btn')].find(b=>b.textContent==='+ Add a result').click(); 1" >/dev/null; sleep 0.6
C "(()=>{const f=document.querySelector('.sch-form'); const [n,w,m]=f.querySelectorAll('input'); n.value='Test 5'; w.value='12'; m.value='80'; f.requestSubmit(); return 1})()" >/dev/null; sleep 2
ok "adding a result writes it to that subject's tracker note" 'grep -q "^| Test 5 | 12 | 80 |" "$V/School/Methods/Exam tracker.md"'
C "[...document.querySelectorAll('.deb-rail-btn')].find(b=>b.textContent==='Files').click(); 1" >/dev/null; sleep 1.5
ok "the Files page is the normal folder page" '[[ $(C "document.querySelectorAll(\".sch-files .folder-tile\").length") -ge 4 ]]'
C "[...document.querySelectorAll('.deb-rail-btn')].find(b=>b.textContent==='Overview').click(); 1" >/dev/null; sleep 1.5
C "[...document.querySelectorAll('.sch-subject')][0].click(); 1" >/dev/null; sleep 2
ok "a subject opens its own page with its exam tracker, as before" '[[ $(C "Boolean(document.querySelector(\".home-exams .ex\")) && !document.querySelector(\".sch\")") == "true" ]]'
ok "no errors" '[[ $(C "JSON.stringify(window.__errs||[])") == "\"[]\"" ]]'
