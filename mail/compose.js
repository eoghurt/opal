// Writing email: new emails, replies, reply-alls and forwards, as drafts, and
// a draft as the message Nodemailer sends.
//
//   newDraft(account)                       → an empty draft
//   replyDraft(parsed, account, { all })    → To/Cc filled, "Re:" once,
//                                             In-Reply-To and References set,
//                                             the original quoted underneath
//   forwardDraft(parsed, account, sourceId) → "Fwd:" once, the original's
//                                             attachments, its sender, date
//                                             and body quoted
//   mailOptions(draft, account, files)      → Nodemailer's message: markdown
//                                             as the text part, HTML made from it
//
// A draft (kept in <userData>/mail-drafts/<id>.json until it is sent):
//   { id, account, mode: 'new'|'reply'|'all'|'forward', sourceId, to, cc, bcc,
//     subject, body, quote, inReplyTo, references: [], attachments: [], error }
//   attachment: { kind: 'file', path, name, size }      (from Finder)
//               { kind: 'vault', path, name, size }     (a vault file, by path)
//               { kind: 'original', index, name, size } (from the forwarded email)
// Nothing here touches the disk or the network.

const crypto = require('crypto');
const { addressList } = require('./note.js');
const { emailHtml } = require('../shared/md-html.js');
const { convert: htmlToText } = require('html-to-text');

const newId = () => `d${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;

// "Name <a@b.c>" (the form the To/Cc/Bcc fields hold).
function formatAddress(a) {
  if (!a || !a.address) return '';
  const name = String(a.name || '').replace(/["<>]/g, '').trim();
  return name ? `${name} <${a.address}>` : a.address;
}

// "a@b.c, Name <d@e.f>; g@h.i" → [{ name, address }]; bad bits are dropped.
function parseAddresses(text) {
  const out = [];
  for (const part of String(text || '').split(/[,;\n]+(?=(?:[^"]*"[^"]*")*[^"]*$)/)) {
    const s = part.trim();
    if (!s) continue;
    const m = /^(?:"?([^"<]*?)"?\s*)?<([^<>\s]+@[^<>\s]+)>$/.exec(s) || /^()([^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)$/.exec(s);
    if (m) out.push({ name: (m[1] || '').trim(), address: m[2] });
  }
  return out;
}

function invalidAddresses(text) {
  return String(text || '').split(/[,;\n]+(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((s) => s.trim()).filter((s) => s && !parseAddresses(s).length);
}

const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

function uniqueBy(list, skip = []) {
  const seen = new Set(skip.map((s) => s.toLowerCase()));
  return list.filter((a) => {
    const key = (a.address || '').toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Re:/Fwd: added once, whatever prefixes the subject already had.
function prefixed(prefix, subject) {
  const base = String(subject || '').trim();
  const pattern = prefix === 'Re:' ? /^(re|aw|sv)\s*(\[\d+\])?\s*:\s*/i : /^(fwd?|fw)\s*:\s*/i;
  let rest = base;
  if (prefix === 'Re:') while (pattern.test(rest)) rest = rest.replace(pattern, '');
  else if (pattern.test(rest)) return base.replace(pattern, 'Fwd: ');
  return `${prefix} ${rest || '(no subject)'}`;
}

function longDate(date) {
  if (!date) return '';
  return new Date(date).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// The original's words for quoting: its plain-text part, or its HTML as text
// (links kept in brackets, pictures left out) when it only came as HTML.
function plainText(parsed) {
  let text = String(parsed.text || '').trim();
  if (!text && parsed.html) {
    text = htmlToText(parsed.html, {
      wordwrap: false,
      selectors: [{ selector: 'img', format: 'skip' }, { selector: 'a', options: { hideLinkHrefIfSameAsText: true } }],
    });
  }
  return text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function references(parsed) {
  const refs = parsed.references ? [].concat(parsed.references) : [];
  const id = parsed.messageId;
  return [...refs.filter((r) => r && r !== id), ...(id ? [id] : [])];
}

function blank(account) {
  return { id: newId(), account: account.id, mode: 'new', sourceId: null, to: '', cc: '', bcc: '', subject: '', body: '', quote: null, inReplyTo: null, references: [], attachments: [], error: null, updated: new Date().toISOString() };
}

function newDraft(account) {
  return blank(account);
}

function replyDraft(parsed, account, { all = false, sourceId = null } = {}) {
  const me = account.email;
  const from = addressList(parsed.from);
  const replyTo = addressList(parsed.replyTo);
  const wasMine = from.some((a) => same(a.address, me));
  // A reply to something I sent goes back to the people I sent it to.
  let to = wasMine ? addressList(parsed.to) : (replyTo.length ? replyTo : from);
  let cc = [];
  if (all) {
    to = [...to, ...addressList(parsed.to)];
    cc = addressList(parsed.cc);
  }
  to = uniqueBy(to, [me]);
  cc = uniqueBy(cc, [me, ...to.map((a) => a.address)]);
  const sender = formatAddress(from[0]) || 'someone';
  return {
    ...blank(account),
    mode: all ? 'all' : 'reply',
    sourceId,
    to: to.map(formatAddress).join(', '),
    cc: cc.map(formatAddress).join(', '),
    subject: prefixed('Re:', parsed.subject),
    inReplyTo: parsed.messageId || null,
    references: references(parsed),
    quote: { header: `On ${longDate(parsed.date)}, ${sender} wrote:`, text: plainText(parsed), forward: false },
  };
}

function forwardDraft(parsed, account, { sourceId = null } = {}) {
  const from = addressList(parsed.from);
  const header = [
    '---------- Forwarded message ----------',
    `From: ${formatAddress(from[0])}`,
    `Date: ${longDate(parsed.date)}`,
    `Subject: ${parsed.subject || ''}`,
    `To: ${addressList(parsed.to).map(formatAddress).join(', ')}`,
    ...(addressList(parsed.cc).length ? [`Cc: ${addressList(parsed.cc).map(formatAddress).join(', ')}`] : []),
  ].join('\n');
  return {
    ...blank(account),
    mode: 'forward',
    sourceId,
    subject: prefixed('Fwd:', parsed.subject),
    references: references(parsed),
    quote: { header, text: plainText(parsed), forward: true },
    attachments: (parsed.attachments || []).map((att, index) => ({
      kind: 'original',
      index,
      name: att.filename || `attachment ${index + 1}`,
      size: att.size || (att.content ? att.content.length : 0),
    })),
  };
}

// The quoted original under the reply: "> " lines for a reply, as-is under
// the forwarded-message header for a forward.
function quotedMarkdown(quote) {
  if (!quote) return '';
  if (quote.forward) return `${quote.header}\n\n${quote.text}`;
  return `${quote.header}\n\n${quote.text.split('\n').map((l) => `> ${l}`.trimEnd()).join('\n')}`;
}

function recipients(draft) {
  return {
    to: parseAddresses(draft.to),
    cc: parseAddresses(draft.cc),
    bcc: parseAddresses(draft.bcc),
  };
}

function recipientCount(draft) {
  const r = recipients(draft);
  return r.to.length + r.cc.length + r.bcc.length;
}

// Problems that stop a send, in plain words ([] when it can go).
function problems(draft) {
  const out = [];
  const r = recipients(draft);
  if (!r.to.length && !r.cc.length && !r.bcc.length) out.push('Add who it’s going to.');
  for (const field of ['to', 'cc', 'bcc']) {
    const bad = invalidAddresses(draft[field]);
    if (bad.length) out.push(`${bad.join(', ')} isn’t an email address.`);
  }
  return out;
}

// `files`: [{ filename, content (Buffer) }] for the draft's attachments, in order.
function mailOptions(draft, account, files) {
  const r = recipients(draft);
  const quote = quotedMarkdown(draft.quote);
  const text = [String(draft.body || '').trim(), quote].filter(Boolean).join('\n\n');
  const options = {
    from: formatAddress({ name: account.name || '', address: account.email }),
    to: r.to.map(formatAddress),
    cc: r.cc.map(formatAddress),
    bcc: r.bcc.map(formatAddress),
    subject: String(draft.subject || '').trim() || '(no subject)',
    text: `${text}\n`,
    html: emailHtml(text),
    attachments: files.map((f) => ({ filename: f.filename, content: f.content, contentType: f.contentType || undefined })),
  };
  if (draft.inReplyTo) options.inReplyTo = draft.inReplyTo;
  if (draft.references && draft.references.length) options.references = draft.references;
  return options;
}

module.exports = { newDraft, replyDraft, forwardDraft, mailOptions, problems, recipients, recipientCount, parseAddresses, formatAddress, prefixed, quotedMarkdown };
