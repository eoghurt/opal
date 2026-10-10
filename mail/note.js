// Turning one email into something Opal can show, and into a note.
//
//   parseEml(raw)              → the email's parts (mailparser does the reading)
//   forWindow(parsed)          → what the Mail page shows: headers, safe-to-sanitise
//                                HTML with cid: pictures swapped for data: URLs,
//                                and the attachments (names and sizes, no bytes)
//   noteFor(parsed, markdown, files) → the note's text: sender, recipients, date
//                                and Message-ID as properties, the body as markdown,
//                                attachments linked as [[name.ext]]
//   attachmentNames(parsed, noteName, taken) → a file name for every attachment
//
// Nothing here touches the disk or the network, so the e2e check can run it
// on a sample .eml file.

const { simpleParser } = require('mailparser');

const PICTURE = /^image\/(png|jpe?g|gif|webp|bmp)$/i;

async function parseEml(raw) {
  return simpleParser(raw, { skipImageLinks: true, skipTextToHtml: false, keepCidLinks: true });
}

function addressList(field) {
  if (!field) return [];
  const groups = Array.isArray(field) ? field : [field];
  return groups.flatMap((g) => g.value || []).map((a) => ({ name: a.name || '', address: a.address || '' }));
}

function addressText(a) {
  if (!a) return '';
  return a.name && a.address ? `${a.name} <${a.address}>` : a.address || a.name;
}

// The email's own pictures (cid:…) become data: URLs so they show without
// fetching anything; pictures from the web are left for the sanitiser to drop.
function inlineCids(html, attachments) {
  const byCid = new Map();
  attachments.forEach((att, index) => {
    if (att.contentId && PICTURE.test(att.contentType || '')) byCid.set(att.contentId.replace(/^<|>$/g, ''), { att, index });
  });
  const used = new Set();
  const out = html.replace(/(["'(])cid:([^"')\s>]+)/gi, (whole, lead, cid) => {
    const hit = byCid.get(decodeURIComponent(cid));
    if (!hit) return whole;
    used.add(hit.index);
    return `${lead}data:${hit.att.contentType.toLowerCase()};base64,${hit.att.content.toString('base64')}`;
  });
  return { html: out, used };
}

function forWindow(parsed) {
  const attachments = parsed.attachments || [];
  const { html, used } = parsed.html ? inlineCids(parsed.html, attachments) : { html: '', used: new Set() };
  const remote = (html.match(/<img\b[^>]*\bsrc\s*=\s*["']?\s*https?:/gi) || []).length;
  return {
    subject: parsed.subject || '(no subject)',
    from: addressList(parsed.from)[0] || null,
    to: addressList(parsed.to),
    cc: addressList(parsed.cc),
    date: parsed.date ? parsed.date.toISOString() : null,
    messageId: parsed.messageId || '',
    html,
    text: parsed.text || '',
    remoteImages: remote,
    attachments: attachments.map((att, index) => ({
      index,
      filename: att.filename || '',
      size: att.size || (att.content ? att.content.length : 0),
      contentType: att.contentType || '',
      inline: used.has(index),
      // An inline picture's data: URL, so the window can tell which file an <img> is.
      dataUrl: used.has(index) ? `data:${att.contentType.toLowerCase()};base64,${att.content.toString('base64')}` : undefined,
    })),
  };
}

const two = (n) => String(n).padStart(2, '0');

function localDay(date) {
  const d = date ? new Date(date) : new Date();
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

// Obsidian's date-and-time property format.
function localDateTime(date) {
  const d = date ? new Date(date) : new Date();
  return `${localDay(d)}T${two(d.getHours())}:${two(d.getMinutes())}`;
}

// Characters macOS or other apps don't allow in file names become '-'.
function safeName(name, fallback = 'Untitled') {
  const clean = String(name || '').replace(/[\\/:*?"<>|#^[\]]/g, '-').replace(/\s+/g, ' ').replace(/^\.+/, '').trim();
  return Array.from(clean).slice(0, 120).join('').trim() || fallback;
}

// "2026-10-11 WACE exam timetable"
function noteName(parsed) {
  const subject = String(parsed.subject || '').replace(/^\s*((re|fw|fwd)\s*:\s*)+/i, '');
  return `${localDay(parsed.date)} ${safeName(subject, 'No subject')}`;
}

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp', 'application/pdf': 'pdf', 'text/calendar': 'ics', 'text/plain': 'txt' };

// One file name per attachment, none clashing with each other or with `taken`
// (names already in the folder). Unnamed pictures get "<note> image 2.png".
function attachmentNames(parsed, base, taken = new Set()) {
  const lower = new Set([...taken].map((n) => n.toLowerCase()));
  return (parsed.attachments || []).map((att, i) => {
    let name = att.filename ? safeName(att.filename, `${base} attachment ${i + 1}`) : `${base} ${PICTURE.test(att.contentType || '') ? 'image' : 'attachment'} ${i + 1}`;
    if (!/\.[a-z0-9]{1,6}$/i.test(name)) name += `.${EXT[(att.contentType || '').toLowerCase()] || 'bin'}`;
    const dot = name.lastIndexOf('.');
    const stem = name.slice(0, dot);
    const ext = name.slice(dot);
    for (let n = 2; lower.has(name.toLowerCase()); n++) name = `${stem} ${n}${ext}`;
    lower.add(name.toLowerCase());
    return name;
  });
}

// A property value in double quotes (Obsidian reads these as plain text).
const q = (value) => JSON.stringify(String(value));

function listProp(key, values) {
  if (!values.length) return [];
  return [`${key}:`, ...values.map((v) => `  - ${q(v)}`)];
}

// The note's whole text. `markdown` is the body (made in the window from the
// sanitised email); `files` is attachmentNames(); inline pictures are already
// embedded in the body, the rest are listed at the end.
function noteFor(parsed, markdown, files, inlineUsed = new Set()) {
  const from = addressList(parsed.from)[0];
  const props = [
    '---',
    `from: ${q(addressText(from))}`,
    ...listProp('to', addressList(parsed.to).map(addressText)),
    ...listProp('cc', addressList(parsed.cc).map(addressText)),
    `date: ${localDateTime(parsed.date)}`,
    `message-id: ${q(parsed.messageId || '')}`,
    '---',
    '',
  ];
  const body = String(markdown || parsed.text || '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const others = files.filter((_, i) => !inlineUsed.has(i));
  const tail = others.length ? ['', '## Attachments', '', ...others.map((name) => `- [[${name}]]`)] : [];
  return `${props.join('\n')}${body}\n${tail.length ? `${tail.join('\n')}\n` : ''}`;
}

module.exports = { parseEml, forWindow, noteFor, noteName, attachmentNames, addressList, addressText, safeName, localDay };
