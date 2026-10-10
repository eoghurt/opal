// A pretend Microsoft Graph mail server for the Outlook check (v52), on
// 127.0.0.1:9444. Opal's test copy is pointed at it with OPAL_GRAPH_BASE, so
// nothing reaches Microsoft. It records what it was asked in <out>/graph-log.json
// and keeps every email "sent" through it as <out>/graph-sent-N.eml.
//
//   node fake-graph.mjs <out folder>
//   POST /control/add   adds a new Focused message (stands in for new mail)

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });
const log = [];
const save = () => fs.writeFileSync(path.join(out, 'graph-log.json'), JSON.stringify(log, null, 2));

const mime = (m) => [
  `From: ${m.fromName} <${m.from}>`,
  'To: Student <student@outlook.com>',
  `Subject: ${m.subject}`,
  `Date: ${new Date(m.date).toUTCString()}`,
  `Message-ID: ${m.internetMessageId}`,
  ...(m.other ? ['List-Unsubscribe: <https://example.com/u>'] : []),
  'MIME-Version: 1.0',
  'Content-Type: text/plain; charset=utf-8',
  '',
  m.text,
  '',
].join('\r\n');

const inbox = [
  { id: 'AAMkAD-jones=', fromName: 'Ms Jones', from: 'jones@example.com', subject: 'Bouldering comp entries', date: '2026-10-10T02:00:00Z', internetMessageId: '<ms-1@outlook.com>', text: 'Entries close Friday. Are you in?', other: false, isRead: false },
  { id: 'AAMkAD-news=', fromName: 'Climb Weekly', from: 'news@climb.example', subject: 'New routes this week', date: '2026-10-09T01:00:00Z', internetMessageId: '<ms-2@climb.example>', text: 'Six new routes at the gym.', other: true, isRead: true },
];
const sent = [];
let n = 0;

const graphMessage = (m) => ({
  id: m.id,
  subject: m.subject,
  from: { emailAddress: { name: m.fromName, address: m.from } },
  toRecipients: [{ emailAddress: { name: 'Student', address: 'student@outlook.com' } }],
  receivedDateTime: m.date,
  sentDateTime: m.date,
  isRead: m.isRead,
  hasAttachments: false,
  internetMessageId: m.internetMessageId,
  conversationId: `conv-${m.id}`,
  inferenceClassification: m.other ? 'other' : 'focused',
  bodyPreview: m.text,
});

const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': type });
  res.end(type === 'application/json' && body !== undefined ? JSON.stringify(body) : body);
};

http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const route = decodeURIComponent(url.pathname.replace(/^\/v1\.0/, ''));
    log.push({ method: req.method, route, query: url.search, auth: req.headers.authorization || '' });
    save();
    if (req.method === 'POST' && route === '/control/add') {
      inbox.unshift({ id: `AAMkAD-new${++n}=`, fromName: 'Coach Ryan', from: 'ryan@example.com', subject: 'Training moved to Thursday', date: new Date().toISOString(), internetMessageId: `<ms-new-${n}@outlook.com>`, text: 'Same time, different day.', other: false, isRead: false });
      return send(res, 200, { ok: true });
    }
    if (req.headers.authorization !== 'Bearer test-token') return send(res, 401, { error: { message: 'No token' } });
    if (req.method === 'GET' && route === '/me/mailFolders/inbox/messages') return send(res, 200, { value: inbox.map(graphMessage) });
    if (req.method === 'GET' && route === '/me/mailFolders/sentitems/messages') return send(res, 200, { value: sent.map(graphMessage) });
    if (req.method === 'GET' && route === '/me/messages') {
      const want = /internetMessageId eq '([^']+)'/.exec(url.searchParams.get('$filter') || '');
      const hit = want && [...inbox, ...sent].find((m) => m.internetMessageId === want[1]);
      return send(res, 200, { value: hit ? [{ id: hit.id }] : [] });
    }
    let m = /^\/me\/messages\/([^/]+)\/\$value$/.exec(route);
    if (m && req.method === 'GET') {
      const hit = [...inbox, ...sent].find((x) => x.id === m[1]);
      return hit ? send(res, 200, hit.raw || mime(hit), 'message/rfc822') : send(res, 404, { error: { message: 'Not found' } });
    }
    m = /^\/me\/messages\/([^/]+)$/.exec(route);
    if (m && req.method === 'PATCH') {
      const hit = inbox.find((x) => x.id === m[1]);
      if (hit) hit.isRead = !!JSON.parse(body || '{}').isRead;
      return send(res, 200, {});
    }
    m = /^\/me\/messages\/([^/]+)\/move$/.exec(route);
    if (m && req.method === 'POST') {
      const at = inbox.findIndex((x) => x.id === m[1]);
      if (at >= 0) inbox.splice(at, 1);
      return send(res, 201, {});
    }
    if (req.method === 'POST' && route === '/me/sendMail') {
      if (req.headers['content-type'] !== 'text/plain') return send(res, 400, { error: { message: 'Expected MIME' } });
      const raw = Buffer.from(body, 'base64').toString('utf8');
      const count = sent.length + 1;
      fs.writeFileSync(path.join(out, `graph-sent-${count}.eml`), raw);
      const subject = (/^Subject: (.*)$/m.exec(raw) || [])[1] || '';
      sent.push({ id: `AAMkAD-sent${count}=`, fromName: 'Student', from: 'student@outlook.com', subject, date: new Date().toISOString(), internetMessageId: (/^Message-ID: (.*)$/mi.exec(raw) || [])[1] || '', text: '', raw, isRead: true });
      return send(res, 202);
    }
    send(res, 404, { error: { message: `No route ${req.method} ${route}` } });
  });
}).listen(9444, '127.0.0.1');
