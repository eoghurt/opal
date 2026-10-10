# ---- Mail: reading the sample .eml files (fixtures/mail, no real account) and saving one as a note ----
M "require('electron').BrowserWindow.getAllWindows()[0].webContents.send('ui:show-mail'); 1" >/dev/null; sleep 2.5
ok "Mail opens on People with the account's inbox" '[[ $(C "document.querySelector(\".mail .deb-kicker\").textContent") == "\"PEOPLE · STUDENT@EXAMPLE.COM\"" ]]'
ok "People holds the email from a person, unread" '[[ $(C "[...document.querySelectorAll(\".mail-row.is-unread .mail-from\")].map(e=>e.textContent).join()") == "\"Year 12 Coordinator\"" ]]'
C "[...document.querySelectorAll('.mail .deb-rail-btn')].find(b=>b.textContent.startsWith('Updates')).click(); 1" >/dev/null; sleep 0.6
ok "the newsletter (it has List-Unsubscribe) is under Updates" '[[ $(C "[...document.querySelectorAll(\".mail-row .mail-from\")].map(e=>e.textContent).join()") == "\"Music Weekly\"" ]]'
C "[...document.querySelectorAll('.mail .deb-rail-btn')].find(b=>b.textContent.startsWith('People')).click(); 1" >/dev/null; sleep 0.6
C "document.querySelector('.mail-row').click(); 1" >/dev/null; sleep 1.5
ok "opening it shows the subject, sender and Cc" '[[ $(C "document.querySelector(\".mail-reader-title\").textContent + \"|\" + document.querySelector(\".mail-meta\").textContent.includes(\"Parent <parent@example.com>\")") == "\"WACE exam timetable and seat numbers|true\"" ]]'
ok "the inline picture (cid:) shows as a data: image; the web picture is blocked; no script or style survives" '[[ $(C "const t=document.querySelector(\".mail-text\"); [t.querySelectorAll(\"img\").length, t.querySelector(\"img\").src.startsWith(\"data:image/png\"), !!document.querySelector(\".mail-blocked\"), t.querySelectorAll(\"script,style\").length].join()") == "\"1,true,true,0\"" ]]'
ok "it's marked read once opened" '[[ $(C "document.querySelectorAll(\".mail-row.is-unread\").length") == "0" ]]'
ok "the PDF is listed as an attachment" '[[ $(C "document.querySelector(\".mail-file\").textContent") == "\"Timetable.pdf69 B\"" ]]'
C "document.querySelector('.mail-row').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:300,clientY:300})); 1" >/dev/null; sleep 0.4
ok "right-click gives the message menu" '[[ $(C "[...document.querySelectorAll(\".ctx-menu .ctx-item > span:first-child\")].map(e=>e.textContent).join(\"|\")") == "\"Open|Reply|Reply all|Forward|To reply…|Mark as unread|Save to vault|Move to Updates|Archive|Delete\"" ]]'
C "document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); 1" >/dev/null; sleep 0.3
clickText '.mail-reader .deb-btn' 'Save to vault' 2
N="$V/Mail/2026-10-09 WACE exam timetable and seat numbers.md"
ok "Save writes Mail/YYYY-MM-DD Subject.md" '[[ -f "$N" ]]'
ok "with sender, recipients, date and Message-ID as properties" '[[ $(sed -n 1,10p "$N" | tr "\n" "|") == "---|from: \"Year 12 Coordinator <year12@school.example>\"|to:|  - \"Student One <student@example.com>\"|cc:|  - \"Parent <parent@example.com>\"|date: 2026-10-09T09:42|message-id: \"<wace-timetable-2026@school.example>\"|---|## Exam timetable|" ]]'
ok "the body is markdown: bold, the list, the link, the inline picture embedded" 'grep -q "your \*\*personal\*\* WACE timetable" "$N" && grep -q "^- Arrive 30 minutes early$" "$N" && grep -q "\[the exams page\](https://school.example/exams)" "$N" && grep -q "^!\[\[crest.png\]\]" "$N"'
ok "attachments are saved beside the note and linked" '[[ -f "$V/Mail/Timetable.pdf" && -f "$V/Mail/crest.png" ]] && grep -q "^- \[\[Timetable.pdf\]\]$" "$N"'
ok "nothing from the web picture or the script got into the note" '! grep -q "tracker.example\|alert" "$N"'
ok "the reader now says Saved, with Open note" '[[ $(C "document.querySelector(\".mail-saved\").textContent") == "\"SavedOpen note\"" ]]'
ok "the vault search finds the saved email" '[[ $(C "window.opal.search(\"seat numbers\").then(r=>JSON.stringify(r).includes(\"Mail/2026-10-09 WACE\"))") == "true" ]]'
C "[...document.querySelectorAll('.mail .deb-rail-btn')].find(b=>b.textContent.startsWith('Saved')).click(); 1" >/dev/null; sleep 0.8
ok "Saved lists it (read from the note's own properties)" '[[ $(C "document.querySelector(\".mail-saved-list .mail-subject\").textContent") == "\"WACE exam timetable and seat numbers\"" ]]'
ok "nothing about mail is stored in the vault except the saved note" '[[ -z "$(ls -A "$V/.opal" 2>/dev/null | grep -i mail)" ]] && [[ -f "$S/userdata/mail-cache/fixture/headers.json" ]]'
