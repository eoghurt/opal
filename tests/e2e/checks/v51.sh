# ---- Mail 0.13: replies, forwards, sending (to Nodemailer's test transport only), to-reply tasks, new mail ----
O="$S/userdata/mail-test-outbox"
mailbox(){ C "[...document.querySelectorAll('.mail .deb-rail-btn')].find(b=>b.textContent.startsWith('$1')).click(); 1" >/dev/null; sleep 0.8; }
type_body(){ C "(()=>{const c=document.querySelector('.compose-body .cm-content'); c.focus(); document.execCommand('insertText', false, $1); return 1})()" >/dev/null; sleep 0.6; }
send(){ C "document.querySelector('.compose-send').click(); 1" >/dev/null; sleep ${1:-2}; }
# One part of a sent email, decoded (the transport writes quoted-printable).
part(){ python3 -c 'import sys,email; from email import policy; m=email.message_from_file(open(sys.argv[1]),policy=policy.default); print(next(p for p in m.walk() if p.get_content_type()==sys.argv[2]).get_content())' "$1" "$2"; }
M "require('electron').BrowserWindow.getAllWindows()[0].webContents.send('ui:show-mail'); 1" >/dev/null; sleep 2.5
mailbox People
# Mac notifications are caught here instead of shown, so the check can read them.
M "const {Notification}=require('electron'); global.__shown=[]; Notification.prototype.show=function(){ global.__shown.push(this.title+'|'+this.body) }; 1" >/dev/null
C "document.querySelector('.mail-row').click(); 1" >/dev/null; sleep 1.2

# Reply
clickText '.mail-answer .deb-btn' 'Reply' 1.5
ok "Reply opens the writing card in the reader's place, addressed to the sender, with Re: once" '[[ $(C "[document.querySelector(\".mail-compose .deb-kicker\").textContent, [...document.querySelectorAll(\".compose-field\")].slice(0,2).map(f=>f.textContent).join(\"/\"), document.querySelector(\".compose-subject\").value].join(\"|\")") == "\"REPLY|FromFixture · student@example.com/ToYear 12 Coordinator×Cc / Bcc|Re: WACE exam timetable and seat numbers\"" ]]'
type_body '"Thanks — **see you** there.\n\n- seat 14"'
sleep 0.6
ok "what's typed is kept on this Mac as a draft (not in the vault)" '[[ $(cat "$S"/userdata/mail-drafts/*.json | grep -c "see you") == 1 ]] && [[ -z "$(grep -rl "see you" "$V")" ]]'
C "document.querySelector('.compose-body .cm-content').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',metaKey:true,bubbles:true})); 1" >/dev/null; sleep 1
ok "no keyboard shortcut sends (⌘Enter did nothing)" '[[ ! -d "$O" || -z "$(ls -A "$O")" ]]'
send
R="$O/0001.eml"
ok "Send hands the email to the test transport (nothing goes to Gmail)" '[[ -f "$R" ]]'
ok "the reply threads: In-Reply-To and References are the original's Message-ID" 'grep -q "^In-Reply-To: <wace-timetable-2026@school.example>" "$R" && grep -q "^References: <wace-timetable-2026@school.example>" "$R"'
ok "to the sender only, from me, Re: added once" 'grep -q "^To: Year 12 Coordinator <year12@school.example>" "$R" && ! grep -q "^Cc:" "$R" && grep -q "^From: student@example.com" "$R" && grep -q "^Subject: Re: WACE exam timetable and seat numbers$" "$R"'
ok "sent as plain text (the markdown) and HTML (bold, a list), with the original quoted" 'part "$R" text/plain | grep -q "\*\*see you\*\*" && part "$R" text/html | grep -q "<strong>see you</strong>" && part "$R" text/html | grep -q "<li>seat 14</li>" && part "$R" text/plain | grep -q "^> Hi everyone,"'
ok "the draft is gone once sent, and the page says Sent" '[[ -z "$(ls -A "$S/userdata/mail-drafts" 2>/dev/null)" ]] && [[ $(C "document.querySelector(\".mail-flash\").textContent") == "\"Sent.\"" ]]'

# Reply all
C "document.querySelector('.mail-row').click(); 1" >/dev/null; sleep 1.2
clickText '.mail-answer .deb-btn' 'Reply all' 1.5
send
R="$O/0002.eml"
ok "Reply all: the sender and the other recipients, without my own address" 'grep -q "^To: Year 12 Coordinator <year12@school.example>$" "$R" && grep -q "^Cc: Parent <parent@example.com>$" "$R" && ! grep -qi "student@example.com" <(grep -E "^(To|Cc):" "$R")'

# Forward
C "document.querySelector('.mail-row').click(); 1" >/dev/null; sleep 1.2
clickText '.mail-answer .deb-btn' 'Forward' 1.5
ok "Forward carries the original's attachments and shows its sender and date" '[[ $(C "[...document.querySelectorAll(\".compose-file\")].map(e=>e.firstChild.nextSibling.textContent).join()+\"|\"+document.querySelector(\".compose-quote-head\").textContent.split(\"\n\").slice(0,3).join(\"/\")") == "\"crest.png,Timetable.pdf|---------- Forwarded message ----------/From: Year 12 Coordinator <year12@school.example>/Date: Fri, 9 Oct 2026, 9:42 am\"" ]]'
C "(()=>{const i=document.querySelector('.compose-chip-input'); i.focus(); i.value='mum@example.com'; i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); return 1})()" >/dev/null; sleep 0.5
send
R="$O/0003.eml"
ok "the forward goes with both attachments, Fwd: once, and no threading headers pointing at a reply" 'grep -q "^Subject: Fwd: WACE exam timetable and seat numbers$" "$R" && grep -q "filename=Timetable.pdf" "$R" && grep -q "filename=crest.png" "$R" && ! grep -q "^In-Reply-To:" "$R"'
ok "the forwarded body quotes the original sender, date and text" 'part "$R" text/plain | grep -q "^From: Year 12 Coordinator <year12@school.example>" && part "$R" text/plain | grep -q "^Date: Fri, 9 Oct 2026" && part "$R" text/plain | grep -q "Please find attached your"'

# More than 10 people, and a send that fails
C "[...document.querySelectorAll('.mail .deb-btn')].find(b=>b.textContent==='+ Write').click(); 1" >/dev/null; sleep 1.5
C "(()=>{const i=document.querySelector('.compose-chip-input'); i.focus(); i.value=Array.from({length:11},(_, n)=>'p'+n+'@example.com').join(', '); i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); const s=document.querySelector('.compose-subject'); s.value='Debate training'; s.dispatchEvent(new Event('input')); return 1})()" >/dev/null; sleep 0.6
send 1.5
ok "more than 10 people: it shows who first, and nothing is sent yet" '[[ $(C "document.querySelector(\".compose-check h3\").textContent + \"|\" + document.querySelectorAll(\".compose-check .compose-chip\").length") == "\"Send to 11 people?|11\"" ]] && [[ ! -f "$O/0004.eml" ]]'
clickText '.compose-check .deb-btn' 'Go back' 0.8
C "(()=>{const i=document.querySelector('.compose-chip-input'); i.focus(); i.value='not an address'; i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); return 1})()" >/dev/null; sleep 0.4
type_body '"Practice is at 4."'
send 1.5
ok "a send that fails keeps the email open with the reason, and the draft stays" '[[ $(C "document.querySelector(\".compose-error\").textContent.includes(\"isn’t an email address\") && document.querySelector(\".compose-subject\").value") == "\"Debate training\"" ]] && grep -q "Practice is at 4" "$S"/userdata/mail-drafts/*.json && [[ ! -f "$O/0004.eml" ]]'
C "document.querySelector('.compose-chip.is-bad button').click(); 1" >/dev/null; sleep 0.4
send 1.5
clickText '.compose-check .deb-btn' 'Send to all 11' 2
ok "after seeing them, Send to all sends" '[[ -f "$O/0004.eml" ]] && [[ $(grep -c "p[0-9]*@example.com" <(grep -A3 "^To:" "$O/0004.eml")) -ge 1 ]]'

# Sent, and Save to vault on a sent email
C "document.querySelector('.mail .deb-btn:not(.is-primary):not(.mail-drafts)') && [...document.querySelectorAll('.mail .deb-btn')].find(b=>b.textContent==='Refresh').click(); 1" >/dev/null; sleep 1.5
mailbox Sent
ok "Sent lists what was sent" '[[ $(C "document.querySelectorAll(\".mail-row\").length") == "4" ]]'
C "[...document.querySelectorAll('.mail-row')].find(r=>r.textContent.includes('Re: WACE')).click(); 1" >/dev/null; sleep 1.2
clickText '.mail-reader .deb-btn' 'Save to vault' 2
ok "Save to vault on a sent email writes the same Mail/YYYY-MM-DD Subject.md note" 'ls "$V/Mail/" | grep -q "WACE exam timetable and seat numbers.md" && grep -q "^from: \"student@example.com\"" "$V"/Mail/*WACE*.md'

# To reply: a task with an envelope; sending the reply ticks it
mailbox People
C "const r=document.querySelector('.mail-row'); r.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:300,clientY:300})); 1" >/dev/null; sleep 0.4
clickText '.ctx-menu .ctx-item > span' 'To reply…' 0.5
clickText '.ctx-menu .ctx-item > span' 'Tomorrow' 1.5
T="$V/Tasks/My Tasks.md"
ok "To reply › Tomorrow adds “Reply to <subject> / <sender>” due tomorrow, linked to the email" 'grep -q "^- \[ \] Reply to WACE exam timetable and seat numbers / Year 12 Coordinator 📅 $(date -v+1d +%F) ➕ $(date +%F) \[📧\](https://mail.google.com/mail/?authuser=student%40example.com#search/rfc822msgid%3Awace-timetable-2026%40school.example)$" "$T"'
M "require('electron').BrowserWindow.getAllWindows()[0].webContents.send('ui:show-tasks'); 1" >/dev/null; sleep 1.5
ok "in Tasks it has an envelope instead of a tick box" '[[ $(C "!!document.querySelector(\".task-check.task-mail[aria-label^=\\\"Write the reply\\\"]\")") == "true" ]]'
C "document.querySelector('.task-check.task-mail').click(); 1" >/dev/null; sleep 2.5
ok "the envelope opens the reply, addressed and threaded" '[[ $(C "document.querySelector(\".mail-compose .deb-kicker\").textContent + \"|\" + document.querySelector(\".compose-subject\").value") == "\"REPLY|Re: WACE exam timetable and seat numbers\"" ]]'
send
ok "sending that reply ticks the task off" 'grep -q "^- \[x\] Reply to WACE exam timetable" "$T"'

# New mail arriving (a new file in the fixture folder stands in for IDLE)
sed -e 's/^Message-ID: .*/Message-ID: <new-1@example.com>/' -e 's/^Subject: .*/Subject: Can I borrow your Methods notes?/' -e 's/^From: .*/From: Maya Chen <maya@example.com>/' -e 's/^Date: .*/Date: Sun, 11 Oct 2026 16:00:00 +0800/' -e '/^List-Unsubscribe/d' "$S/mail-fixture/02 newsletter.eml" > "$S/mail-fixture/03 maya.eml"; sleep 2.5
M "require('electron').BrowserWindow.getAllWindows()[0].webContents.send('ui:show-mail'); 1" >/dev/null; sleep 1.5
ok "new mail shows up in the list by itself, marked NEW" '[[ $(C "[...document.querySelectorAll(\".mail-row\")].filter(r=>r.querySelector(\".mail-new\")).map(r=>r.querySelector(\".mail-subject\").textContent).join()") == "\"Can I borrow your Methods notes?\"" ]]'
ok "a Mac notification: sender and subject, not the body" '[[ $(M "JSON.stringify(global.__shown)") == "\"[\\\"Maya Chen|Can I borrow your Methods notes?\\\"]\"" ]]'
