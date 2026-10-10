# ---- Mail 0.14: an Outlook account (a pretend Microsoft Graph server, no real account) beside Gmail ----
G="$S/graph"; rm -rf "$G"; mkdir -p "$G"
$E/stop.sh 2>/dev/null; pkill -f fake-graph.mjs 2>/dev/null
node $E/fake-graph.mjs "$G" > "$G/server.log" 2>&1 &
sleep 0.5
OPAL_GRAPH_BASE=http://127.0.0.1:9444/v1.0 OPAL_MS_POLL_MS=1500 $E/launch.sh
mailbox(){ C "[...document.querySelectorAll('.mail .deb-rail-btn')].find(b=>b.textContent.startsWith('$1')).click(); 1" >/dev/null; sleep 0.8; }
account(){ C "[...document.querySelectorAll('.mail-accounts button')].find(b=>b.textContent==='$1').click(); 1" >/dev/null; sleep 0.8; }
M "require('electron').BrowserWindow.getAllWindows()[0].webContents.send('ui:show-mail'); 1" >/dev/null; sleep 3
M "const {Notification}=require('electron'); global.__shown=[]; Notification.prototype.show=function(){ global.__shown.push(this.title+'|'+this.body) }; 1" >/dev/null
ok "both accounts are there: All, the Gmail one and Outlook" '[[ $(C "[...document.querySelectorAll(\".mail-accounts button\")].map(b=>b.textContent).join(\"|\")") == "\"All|Fixture|Outlook|+\"" ]]'
account Outlook
ok "Outlook's Focused inbox is People" '[[ $(C "[...document.querySelectorAll(\".mail-row .mail-from\")].map(e=>e.textContent).join()") == "\"Ms Jones\"" ]]'
mailbox Updates
ok "Outlook's Other inbox is Updates" '[[ $(C "[...document.querySelectorAll(\".mail-row .mail-from\")].map(e=>e.textContent).join()") == "\"Climb Weekly\"" ]]'
mailbox People
C "document.querySelector('.mail-row').click(); 1" >/dev/null; sleep 1.5
ok "opening it fetches the original email from Outlook and shows it" '[[ $(C "document.querySelector(\".mail-reader-title\").textContent + \"|\" + document.querySelector(\".mail-text\").textContent.trim()") == "\"Bouldering comp entries|Entries close Friday. Are you in?\"" ]] && grep -q "/me/messages/AAMkAD-jones=/\$value" "$G/graph-log.json"'
ok "and marks it read on Outlook" 'grep -q "\"method\": \"PATCH\"" "$G/graph-log.json"'
ok "every request carries the sign-in token (Bearer)" '! grep -q "\"auth\": \"\"" <(grep -v control "$G/graph-log.json")'
C "[...document.querySelectorAll('.mail-answer .deb-btn')].find(b=>b.textContent==='Reply').click(); 1" >/dev/null; sleep 1.5
ok "the reply starts From the Outlook account" '[[ $(C "const s=document.querySelector(\".compose-from\"); s.options[s.selectedIndex].text") == "\"Outlook · student@outlook.com\"" ]]'
C "(()=>{const c=document.querySelector('.compose-body .cm-content'); c.focus(); document.execCommand('insertText', false, 'Yes, count me in.'); return 1})()" >/dev/null; sleep 0.6
C "document.querySelector('.compose-send').click(); 1" >/dev/null; sleep 2.5
R="$G/graph-sent-1.eml"
ok "Send posts the whole email to Outlook (Graph sendMail, MIME)" '[[ -f "$R" ]]'
tr -d '\r' < "$R" > "$R.txt" 2>/dev/null; R="$R.txt"   # emails use CRLF line ends
ok "threaded and addressed: In-Reply-To/References, from the Outlook address, Re: once" 'grep -q "^In-Reply-To: <ms-1@outlook.com>" "$R" && grep -q "^References: <ms-1@outlook.com>" "$R" && grep -q "^From: student@outlook.com" "$R" && grep -q "^To: Ms Jones <jones@example.com>" "$R" && grep -q "^Subject: Re: Bouldering comp entries$" "$R"'
ok "Outlook files the copy in Sent (it shows under Sent)" 'sleep 1; [[ $(C "document.querySelector(\".mail .deb-rail-btn:nth-child(3)\").click(); new Promise(r=>setTimeout(()=>r([...document.querySelectorAll(\".mail-row .mail-subject\")].map(e=>e.textContent).join()),800))") == "\"Re: Bouldering comp entries\"" ]]'
mailbox People
C "[...document.querySelectorAll('.mail .deb-btn')].find(b=>b.textContent==='+ Write').click(); 1" >/dev/null; sleep 1.2
ok "a new email can be sent from either account (the From picker)" '[[ $(C "[...document.querySelector(\".compose-from\").options].map(o=>o.text).join(\"|\")") == "\"Fixture · student@example.com|Outlook · student@outlook.com\"" ]]'
C "document.querySelector('.compose-link.is-quiet').click(); 1" >/dev/null; sleep 0.8
# New mail on Outlook (checked every 1.5 s here, every minute normally)
curl -s -X POST http://127.0.0.1:9444/control/add >/dev/null; sleep 5
ok "new Outlook mail shows up by itself, marked NEW, with a notification" '[[ $(C "[...document.querySelectorAll(\".mail-row\")].filter(r=>r.querySelector(\".mail-new\")).map(r=>r.querySelector(\".mail-subject\").textContent).join()") == "\"Training moved to Thursday\"" ]] && [[ $(M "JSON.stringify(global.__shown)") == "\"[\\\"Coach Ryan|Training moved to Thursday\\\"]\"" ]]'
C "const r=[...document.querySelectorAll('.mail-row')].find(r=>r.textContent.includes('Ms Jones')); r.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:300,clientY:300})); 1" >/dev/null; sleep 0.4
clickText '.ctx-menu .ctx-item > span' 'To reply…' 0.5
clickText '.ctx-menu .ctx-item > span' 'Today' 1.5
ok "a to-reply task for an Outlook email links to Outlook" 'grep -q "Reply to Bouldering comp entries / Ms Jones 📅 $(date +%F) ➕ $(date +%F) \[📧\](https://outlook.live.com/mail/0/inbox#rfc822msgid%3Ams-1%40outlook.com)$" "$V/Tasks/My Tasks.md"'
# Adding an account
C "[...document.querySelectorAll('.mail-accounts button')].find(b=>b.textContent==='+').click(); 1" >/dev/null; sleep 0.6
ok "+ asks which kind: Google or Microsoft (personal accounts)" '[[ $(C "[...document.querySelectorAll(\".mail-pick b\")].map(e=>e.textContent).join(\"|\") + \"|\" + document.querySelector(\".mail .deb-h1\").textContent") == "\"Google|Microsoft|Add an account.\"" ]]'
ok "the Microsoft client ID is checked, and saved in Opal's settings folder (not the vault)" '[[ $(C "window.opal.mail.setMicrosoftClient(\"not-an-id\").then(()=>\"saved\",e=>e.message.startsWith(\"That isn’t an Application\"))") == "true" ]] && [[ $(C "window.opal.mail.setMicrosoftClient(\"0f3e1a2b-1111-2222-3333-444455556666\")") == "true" ]] && grep -q "0f3e1a2b-1111-2222-3333-444455556666" "$S/userdata/mail-microsoft.json"'
pkill -f fake-graph.mjs 2>/dev/null
