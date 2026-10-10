// Mail: Gmail accounts over IMAP (reading, new mail) and SMTP (sending), in
// the main process.
//
// Where things live — none of it in the vault:
//   <userData>/mail-accounts.json   the signed-in accounts; each refresh token is
//                                   encrypted with Electron's safeStorage (the
//                                   Mac keychain holds the key)
//   <userData>/mail-cache/<id>/     a cache of message headers (headers.json) and
//                                   bodies (<uid>.eml), so the inbox opens fast.
//                                   Delete it any time; Gmail still has everything.
//   <userData>/mail-cache/sorting.json  senders you moved between People and Updates
//   <userData>/mail-drafts/<id>.json   emails being written, kept until they're
//                                   sent or discarded (so nothing is lost if Opal
//                                   closes or a send fails). Never Gmail drafts.
//
// Sending goes through smtp.gmail.com with Nodemailer (XOAUTH2, the same sign-in
// IMAP uses). Gmail files a copy in Sent by itself. Only mail:send sends, and the
// window only calls it from the Send button's click.
//
// New mail: an IMAP IDLE connection stays open on each Inbox while Opal runs
// (reconnecting after sleep or a dropped line); new messages go to the window
// as 'mail:arrived', which updates the list and shows the Mac notification.
//
// An email only reaches the vault when you press Save: Mail/YYYY-MM-DD Subject.md
// with its attachments beside it (see note.js).
//
// Mailboxes: Gmail already sorts the inbox into Primary (people) and
// Promotions / Updates / Social / Forums (companies). People = Primary,
// Updates = the rest.
//
// For the e2e checks, OPAL_MAIL_FIXTURE=<folder of .eml files> swaps Gmail for
// that folder: one pretend account, new files there count as new mail, and
// sending goes to Nodemailer's stream transport, written to
// <userData>/mail-test-outbox/ — nothing is sent anywhere.

const fs = require('fs');
const path = require('path');
const { ImapFlow } = require('imapflow');
const nodemailer = require('nodemailer');
const { readProperties } = require('../shared/properties.js');
const oauth = require('./oauth.js');
const note = require('./note.js');
const compose = require('./compose.js');

const LIST_LIMIT = 150; // newest messages kept per account
const IDLE_CLOSE_MS = 90 * 1000;
const MAIL_FOLDER = 'Mail';
const TOKEN = /\{\{opal-attachment:(\d+)\}\}/g;
const SENT_LIMIT = 60;
const CONFIRM_OVER = 10; // more recipients than this: the window must show them first
const MAX_ATTACH_BYTES = 25 * 1024 * 1024; // Gmail's limit for one email

function setupMail({ app, ipcMain, safeStorage, shell, dialog, powerMonitor, getWindow, ctx }) {
  const userData = () => app.getPath('userData');
  const accountsFile = () => path.join(userData(), 'mail-accounts.json');
  const cacheDir = (...parts) => path.join(userData(), 'mail-cache', ...parts);
  const fixtureDir = process.env.OPAL_MAIL_FIXTURE || '';
  const draftsDir = (...parts) => path.join(userData(), 'mail-drafts', ...parts);
  const outboxDir = () => path.join(userData(), 'mail-test-outbox');
  const tell = (channel, data) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel, data);
  };

  // ---------- Accounts ----------

  function readAccounts() {
    if (fixtureDir) return [{ id: 'fixture', email: 'student@example.com', label: 'Fixture' }];
    try {
      const list = JSON.parse(fs.readFileSync(accountsFile(), 'utf8')).accounts;
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  function writeAccounts(list) {
    fs.mkdirSync(userData(), { recursive: true });
    const temp = `${accountsFile()}.saving`;
    fs.writeFileSync(temp, JSON.stringify({ accounts: list }, null, 2), { mode: 0o600 });
    fs.renameSync(temp, accountsFile());
  }

  // What the window may see: never the token.
  const publicAccount = (a) => ({ id: a.id, email: a.email, label: a.label || a.email, needsSignIn: !!a.needsSignIn });

  function refreshTokenOf(account) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('This Mac can’t encrypt the sign-in right now.');
    return safeStorage.decryptString(Buffer.from(account.token, 'base64'));
  }

  function client() {
    const c = oauth.loadClient(userData(), app.getAppPath());
    if (!c) throw new Error('Opal needs mail-client.json first (see the setup steps on the Mail page).');
    return c;
  }

  async function addAccount() {
    if (fixtureDir) return readAccounts().map(publicAccount);
    if (!safeStorage.isEncryptionAvailable()) throw new Error('This Mac can’t encrypt the sign-in right now, so Opal won’t store it.');
    const result = await oauth.signIn(client(), (url) => shell.openExternal(url));
    if (!result.email) throw new Error('Google didn’t say which address signed in.');
    const list = readAccounts();
    const token = safeStorage.encryptString(result.refreshToken).toString('base64');
    const existing = list.find((a) => a.email.toLowerCase() === result.email.toLowerCase());
    if (existing) {
      existing.token = token;
      delete existing.needsSignIn;
    } else {
      list.push({ id: `a${Date.now().toString(36)}`, email: result.email, label: result.email.endsWith('@gmail.com') ? 'Personal' : result.email.split('@')[1].split('.')[0], token });
    }
    writeAccounts(list);
    const account = list.find((a) => a.email.toLowerCase() === result.email.toLowerCase());
    access.set(account.id, { accessToken: result.accessToken, expiresAt: result.expiresAt });
    watch(account);
    return list.map(publicAccount);
  }

  async function removeAccount(id) {
    const list = readAccounts().filter((a) => a.id !== id);
    if (!fixtureDir) writeAccounts(list);
    unwatch(id);
    await closeClient(id);
    await fs.promises.rm(cacheDir(String(id).replace(/[^a-z0-9]/gi, '')), { recursive: true, force: true });
    return list.map(publicAccount);
  }

  function renameAccount(id, label) {
    const list = readAccounts();
    const a = list.find((x) => x.id === id);
    if (!a) throw new Error('That account isn’t signed in.');
    a.label = String(label || '').trim().slice(0, 40) || a.email;
    if (!fixtureDir) writeAccounts(list);
    return list.map(publicAccount);
  }

  // ---------- IMAP connections (one per account, closed when idle) ----------

  const access = new Map(); // account id → { accessToken, expiresAt }
  const clients = new Map(); // account id → { imap, timer }

  async function accessToken(account) {
    const known = access.get(account.id);
    if (known && known.expiresAt - Date.now() > 60 * 1000) return known.accessToken;
    try {
      const fresh = await oauth.refreshAccess(client(), refreshTokenOf(account));
      access.set(account.id, fresh);
      return fresh.accessToken;
    } catch (err) {
      if (err.code === 'invalid_grant') {
        const list = readAccounts();
        const a = list.find((x) => x.id === account.id);
        if (a) a.needsSignIn = true;
        writeAccounts(list);
        throw new Error(`${account.email} needs signing in again.`);
      }
      throw err;
    }
  }

  async function closeClient(id) {
    const c = clients.get(id);
    if (!c) return;
    clients.delete(id);
    clearTimeout(c.timer);
    try {
      await c.imap.logout();
    } catch {
      c.imap.close();
    }
  }

  async function withImap(account, job) {
    let c = clients.get(account.id);
    if (!c || !c.imap.usable) {
      if (c) await closeClient(account.id);
      const imap = new ImapFlow({
        host: 'imap.gmail.com',
        port: 993,
        secure: true,
        auth: { user: account.email, accessToken: await accessToken(account) },
        logger: false, // never log: the log would hold addresses and tokens
      });
      imap.on('error', () => closeClient(account.id));
      await imap.connect();
      c = { imap, timer: null };
      clients.set(account.id, c);
    }
    clearTimeout(c.timer);
    try {
      return await job(c.imap);
    } finally {
      c.timer = setTimeout(() => closeClient(account.id), IDLE_CLOSE_MS);
    }
  }

  async function specialFolder(imap, use) {
    const list = await imap.list();
    const hit = list.find((m) => m.specialUse === use);
    if (!hit) throw new Error('Gmail didn’t say where that folder is.');
    return hit.path;
  }

  // ---------- The header cache ----------

  const safeId = (id) => String(id).replace(/[^a-z0-9]/gi, '');

  function readCache(accountId) {
    try {
      return JSON.parse(fs.readFileSync(cacheDir(safeId(accountId), 'headers.json'), 'utf8'));
    } catch {
      return { uidValidity: null, messages: [] };
    }
  }

  function writeCache(accountId, cache) {
    const dir = cacheDir(safeId(accountId));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'headers.json'), JSON.stringify(cache));
  }

  function readSorting() {
    try {
      return JSON.parse(fs.readFileSync(cacheDir('sorting.json'), 'utf8'));
    } catch {
      return {};
    }
  }

  function boxOf(message, sorting) {
    const sender = (message.from && message.from.address || '').toLowerCase();
    return sorting[sender] || message.gmailBox || 'people';
  }

  function listFor(accounts) {
    const sorting = readSorting();
    const out = [];
    for (const a of accounts) {
      const cache = readCache(a.id);
      for (const m of cache.messages) out.push({ ...m, id: `${a.id}:${m.uid}`, account: a.id, box: boxOf(m, sorting) });
      for (const m of cache.sent || []) out.push({ ...m, id: `${a.id}:sent:${m.uid}`, account: a.id, box: 'sent', unread: false });
    }
    return out.sort((x, y) => String(y.date).localeCompare(String(x.date)));
  }

  function hasAttachments(structure) {
    if (!structure) return false;
    if (structure.disposition === 'attachment') return true;
    return (structure.childNodes || []).some(hasAttachments);
  }

  async function syncAccount(account) {
    if (fixtureDir) return syncFixture();
    await withImap(account, async (imap) => {
      const lock = await imap.getMailboxLock('INBOX');
      try {
        const old = readCache(account.id);
        const validity = String(imap.mailbox.uidValidity);
        if (old.uidValidity && old.uidValidity !== validity) {
          await fs.promises.rm(cacheDir(safeId(account.id)), { recursive: true, force: true });
        }
        const all = (await imap.search({ all: true }, { uid: true })) || [];
        const newest = all.sort((a, b) => b - a).slice(0, LIST_LIMIT);
        const primary = new Set((await imap.search({ gmraw: 'category:primary' }, { uid: true })) || []);
        const messages = [];
        if (newest.length) {
          for await (const msg of imap.fetch(newest.join(','), { uid: true, envelope: true, flags: true, internalDate: true, bodyStructure: true, threadId: true }, { uid: true })) {
            const env = msg.envelope || {};
            const from = (env.from && env.from[0]) || {};
            messages.push({
              uid: msg.uid,
              threadId: msg.threadId || '',
              messageId: env.messageId || '',
              subject: env.subject || '(no subject)',
              from: { name: from.name || '', address: from.address || '' },
              date: (msg.internalDate || env.date || new Date()).toISOString(),
              unread: !(msg.flags && msg.flags.has('\\Seen')),
              attachments: hasAttachments(msg.bodyStructure),
              gmailBox: primary.has(msg.uid) ? 'people' : 'updates',
            });
          }
        }
        const snippets = new Map(old.messages.map((m) => [m.uid, m.snippet]));
        for (const m of messages) if (snippets.get(m.uid)) m.snippet = snippets.get(m.uid);
        writeCache(account.id, { ...readCache(account.id), uidValidity: validity, messages });
      } finally {
        lock.release();
      }
      await syncSent(account, imap);
    });
  }

  function headerOf(msg) {
    const env = msg.envelope || {};
    const from = (env.from && env.from[0]) || {};
    const to = (env.to || []).map((a) => ({ name: a.name || '', address: a.address || '' }));
    return {
      uid: msg.uid,
      threadId: msg.threadId || '',
      messageId: env.messageId || '',
      subject: env.subject || '(no subject)',
      from: { name: from.name || '', address: from.address || '' },
      to,
      date: (msg.internalDate || env.date || new Date()).toISOString(),
      attachments: hasAttachments(msg.bodyStructure),
    };
  }

  // The newest messages in Gmail's Sent folder (for Save to vault on sent mail).
  async function syncSent(account, imap) {
    let sentPath;
    try {
      sentPath = await specialFolder(imap, '\\Sent');
    } catch {
      return;
    }
    const lock = await imap.getMailboxLock(sentPath);
    try {
      const old = readCache(account.id);
      const validity = String(imap.mailbox.uidValidity);
      const all = (await imap.search({ all: true }, { uid: true })) || [];
      const newest = all.sort((a, b) => b - a).slice(0, SENT_LIMIT);
      const sent = [];
      if (newest.length) {
        for await (const msg of imap.fetch(newest.join(','), { uid: true, envelope: true, internalDate: true, bodyStructure: true, threadId: true }, { uid: true })) sent.push(headerOf(msg));
      }
      if (old.sentValidity && old.sentValidity !== validity) {
        for (const f of await fs.promises.readdir(cacheDir(safeId(account.id))).catch(() => [])) {
          if (f.startsWith('sent-')) await fs.promises.rm(cacheDir(safeId(account.id), f), { force: true });
        }
      }
      writeCache(account.id, { ...readCache(account.id), sent, sentPath, sentValidity: validity });
    } finally {
      lock.release();
    }
  }

  // ---------- Fixture mode (tests) ----------

  const fixtureFlags = new Map(); // uid → { unread, gone }

  function fixtureFiles() {
    return fs.readdirSync(fixtureDir).filter((f) => f.toLowerCase().endsWith('.eml')).sort();
  }

  async function syncFixture() {
    const messages = [];
    const files = fixtureFiles();
    for (let i = 0; i < files.length; i++) {
      const uid = i + 1;
      const flags = fixtureFlags.get(uid) || { unread: true };
      if (flags.gone) continue;
      const parsed = await note.parseEml(fs.readFileSync(path.join(fixtureDir, files[i])));
      const view = note.forWindow(parsed);
      messages.push({
        uid,
        threadId: '',
        messageId: view.messageId,
        subject: view.subject,
        from: view.from || { name: '', address: '' },
        date: view.date || new Date().toISOString(),
        unread: flags.unread,
        attachments: view.attachments.some((a) => !a.inline),
        gmailBox: (parsed.headerLines || []).some((l) => l.key === 'list-unsubscribe') ? 'updates' : 'people',
        snippet: snippetOf(view.text),
      });
    }
    const sent = [];
    const out = await fs.promises.readdir(outboxDir()).catch(() => []);
    for (const f of out.filter((x) => x.endsWith('.eml')).sort()) {
      const view = note.forWindow(await note.parseEml(await fs.promises.readFile(path.join(outboxDir(), f))));
      sent.push({ uid: Number(f.replace(/\D/g, '')), threadId: '', messageId: view.messageId, subject: view.subject, from: view.from, to: view.to, date: view.date || new Date().toISOString(), attachments: view.attachments.length > 0 });
    }
    writeCache('fixture', { uidValidity: '1', messages, sent });
  }

  // ---------- Opening one message ----------

  // "<account>:<uid>" is in the Inbox, "<account>:sent:<uid>" in Sent.
  function splitId(id) {
    const parts = String(id).split(':');
    const [accountId] = parts;
    const folder = parts.length === 3 && parts[1] === 'sent' ? 'sent' : 'inbox';
    const uid = parts[parts.length - 1];
    const account = readAccounts().find((a) => a.id === accountId);
    if (!account || !/^\d+$/.test(uid || '') || (parts.length === 3 && folder !== 'sent') || parts.length > 3) throw new Error('That message isn’t here any more.');
    return { account, uid: Number(uid), folder };
  }

  const snippetOf = (text) => String(text || '').replace(/\s+/g, ' ').trim().slice(0, 140);

  async function rawMessage(account, uid, folder = 'inbox') {
    if (fixtureDir && folder === 'sent') return fs.promises.readFile(path.join(outboxDir(), `${String(uid).padStart(4, '0')}.eml`));
    if (fixtureDir) return fs.promises.readFile(path.join(fixtureDir, fixtureFiles()[uid - 1]));
    const file = cacheDir(safeId(account.id), `${folder === 'sent' ? 'sent-' : ''}${uid}.eml`);
    try {
      return await fs.promises.readFile(file);
    } catch {
      // not cached yet
    }
    const mailbox = folder === 'sent' ? readCache(account.id).sentPath : 'INBOX';
    if (!mailbox) throw new Error('Gmail’s Sent folder wasn’t found.');
    const raw = await withImap(account, async (imap) => {
      const lock = await imap.getMailboxLock(mailbox);
      try {
        const { content } = await imap.download(String(uid), undefined, { uid: true });
        if (!content) throw new Error('Gmail didn’t send that message.');
        const chunks = [];
        for await (const chunk of content) chunks.push(chunk);
        return Buffer.concat(chunks);
      } finally {
        lock.release();
      }
    });
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    await fs.promises.writeFile(file, raw);
    return raw;
  }

  function updateCached(account, uid, change) {
    const cache = readCache(account.id);
    const m = cache.messages.find((x) => x.uid === uid);
    if (!m) return;
    change(m);
    writeCache(account.id, cache);
  }

  async function openMessage(id) {
    const { account, uid, folder } = splitId(id);
    const parsed = await note.parseEml(await rawMessage(account, uid, folder));
    const view = note.forWindow(parsed);
    if (folder === 'inbox') updateCached(account, uid, (m) => { m.snippet = snippetOf(view.text); });
    return { id, account: account.id, folder, ...view };
  }

  async function parsedMessage(id) {
    const { account, uid, folder } = splitId(id);
    return { account, parsed: await note.parseEml(await rawMessage(account, uid, folder)) };
  }

  // A message by its Message-ID (for "to reply" tasks): the cache first, then Gmail.
  async function findMessage(messageId) {
    const wanted = String(messageId || '').trim();
    if (!wanted) return null;
    const bare = wanted.replace(/^<|>$/g, '');
    const hit = listFor(readAccounts()).find((m) => m.messageId && m.messageId.replace(/^<|>$/g, '') === bare);
    if (hit) return hit.id;
    if (fixtureDir) return null;
    for (const account of readAccounts()) {
      if (account.needsSignIn) continue;
      try {
        const uid = await withImap(account, async (imap) => {
          const lock = await imap.getMailboxLock('INBOX');
          try {
            const found = await imap.search({ header: { 'message-id': bare } }, { uid: true });
            return found && found.length ? found[found.length - 1] : null;
          } finally {
            lock.release();
          }
        });
        if (uid) {
          await syncAccount(account);
          return `${account.id}:${uid}`;
        }
      } catch {
        // try the next account
      }
    }
    return null;
  }

  // ---------- Changing messages ----------

  async function setRead(ids, read) {
    for (const id of [].concat(ids)) {
      const { account, uid } = splitId(id);
      if (fixtureDir) {
        fixtureFlags.set(uid, { ...(fixtureFlags.get(uid) || {}), unread: !read });
      } else {
        await withImap(account, async (imap) => {
          const lock = await imap.getMailboxLock('INBOX');
          try {
            if (read) await imap.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
            else await imap.messageFlagsRemove(String(uid), ['\\Seen'], { uid: true });
          } finally {
            lock.release();
          }
        });
      }
      updateCached(account, uid, (m) => { m.unread = !read; });
    }
    return true;
  }

  // Archive (out of the inbox, still in All Mail) or Trash.
  async function moveOut(id, where) {
    const { account, uid } = splitId(id);
    if (fixtureDir) {
      fixtureFlags.set(uid, { ...(fixtureFlags.get(uid) || {}), gone: true });
    } else {
      await withImap(account, async (imap) => {
        const target = await specialFolder(imap, where === 'trash' ? '\\Trash' : '\\All');
        const lock = await imap.getMailboxLock('INBOX');
        try {
          await imap.messageMove(String(uid), target, { uid: true });
        } finally {
          lock.release();
        }
      });
    }
    const cache = readCache(account.id);
    cache.messages = cache.messages.filter((m) => m.uid !== uid);
    writeCache(account.id, cache);
    return true;
  }

  // People ⇄ Updates for everything from this sender (kept on this Mac).
  function setBox(id, box) {
    const { account, uid } = splitId(id);
    const m = readCache(account.id).messages.find((x) => x.uid === uid);
    if (!m || !m.from.address) throw new Error('That message has no sender address.');
    const sorting = readSorting();
    const sender = m.from.address.toLowerCase();
    if (box === m.gmailBox) delete sorting[sender];
    else sorting[sender] = box === 'updates' ? 'updates' : 'people';
    fs.mkdirSync(cacheDir(), { recursive: true });
    fs.writeFileSync(cacheDir('sorting.json'), JSON.stringify(sorting, null, 2));
    return true;
  }

  // Replying comes in 0.13; until then this opens the thread in Gmail.
  async function openInGmail(id) {
    const { account, uid } = splitId(id);
    if (fixtureDir) return false;
    const m = readCache(account.id).messages.find((x) => x.uid === uid);
    const thread = m && m.threadId ? BigInt(m.threadId).toString(16) : '';
    await shell.openExternal(`https://mail.google.com/mail/?authuser=${encodeURIComponent(account.email)}#${thread ? `all/${thread}` : 'inbox'}`);
    return true;
  }

  // ---------- Saving into the vault ----------

  async function saveMessage(id, markdown) {
    const { account, uid, folder: where } = splitId(id);
    const parsed = await note.parseEml(await rawMessage(account, uid, where));
    const folder = ctx.resolveFolderPath(MAIL_FOLDER);
    await fs.promises.mkdir(folder, { recursive: true });
    const taken = new Set(await fs.promises.readdir(folder));
    const base = note.noteName(parsed);
    let name = `${base}.md`;
    for (let n = 2; taken.has(name); n++) name = `${base} ${n}.md`;
    taken.add(name);
    const files = note.attachmentNames(parsed, name.replace(/\.md$/, ''), taken);
    const used = new Set();
    const body = String(markdown || '').replace(TOKEN, (_, i) => {
      const index = Number(i);
      if (!files[index]) return '';
      used.add(index);
      return files[index];
    });
    const text = note.noteFor(parsed, body, files, used);
    const attachments = parsed.attachments || [];
    for (let i = 0; i < attachments.length; i++) {
      await fs.promises.writeFile(path.join(folder, files[i]), attachments[i].content, { flag: 'wx' });
    }
    const relPath = `${MAIL_FOLDER}/${name}`;
    await fs.promises.writeFile(path.join(folder, name), text, { flag: 'wx' });
    ctx.scheduleRefresh();
    return relPath;
  }

  // Notes in Mail/ that came from an email: Message-ID → note path, plus what the
  // Saved list shows. Read from the notes themselves, so they stay the truth.
  async function savedNotes() {
    let folder;
    try {
      folder = ctx.resolveFolderPath(MAIL_FOLDER);
    } catch {
      return [];
    }
    let names = [];
    try {
      names = (await fs.promises.readdir(folder)).filter((n) => n.toLowerCase().endsWith('.md'));
    } catch {
      return [];
    }
    const out = [];
    for (const n of names) {
      try {
        const head = (await fs.promises.readFile(path.join(folder, n), 'utf8')).slice(0, 4000);
        const props = readProperties(head);
        if (!props['message-id'] && !props.from) continue;
        out.push({ path: `${MAIL_FOLDER}/${n}`, name: n.replace(/\.md$/i, ''), messageId: String(props['message-id'] || ''), from: String(props.from || ''), date: String(props.date || '') });
      } catch {
        // unreadable: leave it out
      }
    }
    return out.sort((a, b) => b.date.localeCompare(a.date));
  }

  // ---------- Drafts (emails being written) ----------

  function draftFile(id) {
    if (!/^d[a-z0-9]{4,40}$/.test(String(id))) throw new Error('That draft isn’t here any more.');
    return draftsDir(`${id}.json`);
  }

  async function readDraft(id) {
    try {
      return JSON.parse(await fs.promises.readFile(draftFile(id), 'utf8'));
    } catch {
      throw new Error('That draft isn’t here any more.');
    }
  }

  async function writeDraft(draft) {
    await fs.promises.mkdir(draftsDir(), { recursive: true });
    const file = draftFile(draft.id);
    await fs.promises.writeFile(`${file}.saving`, JSON.stringify(draft, null, 2), { mode: 0o600 });
    await fs.promises.rename(`${file}.saving`, file);
    return draft;
  }

  async function listDrafts() {
    const names = await fs.promises.readdir(draftsDir()).catch(() => []);
    const out = [];
    for (const n of names.filter((x) => x.endsWith('.json'))) {
      try {
        out.push(JSON.parse(await fs.promises.readFile(draftsDir(n), 'utf8')));
      } catch {
        // half-written: skip
      }
    }
    return out.sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
  }

  function accountFor(id) {
    const list = readAccounts().filter((a) => !a.needsSignIn);
    return list.find((a) => a.id === id) || list[0] || null;
  }

  async function startDraft(mode, sourceId, accountId) {
    if (mode === 'new') {
      const account = accountFor(accountId);
      if (!account) throw new Error('Sign in to an account first.');
      return writeDraft(compose.newDraft(account));
    }
    const { account, parsed } = await parsedMessage(sourceId);
    const draft = mode === 'forward'
      ? compose.forwardDraft(parsed, account, { sourceId })
      : compose.replyDraft(parsed, account, { all: mode === 'all', sourceId });
    return writeDraft(draft);
  }

  // The window sends the whole draft as it is typed; only the fields it may
  // change are taken, and attachments only by the ones already on the draft.
  async function updateDraft(next) {
    const draft = await readDraft(next && next.id);
    for (const key of ['to', 'cc', 'bcc', 'subject', 'body']) {
      if (typeof next[key] === 'string') draft[key] = next[key].slice(0, key === 'body' ? 2000000 : 20000);
    }
    if (next.quote === null) draft.quote = null;
    if (Array.isArray(next.keep)) draft.attachments = draft.attachments.filter((_, i) => next.keep.includes(i));
    draft.updated = new Date().toISOString();
    return writeDraft(draft);
  }

  async function discardDraft(id) {
    await fs.promises.rm(draftFile(id), { force: true });
    return true;
  }

  async function attachFromFinder(id) {
    const draft = await readDraft(id);
    const win = getWindow();
    const result = await dialog.showOpenDialog(win, { title: 'Attach files', properties: ['openFile', 'multiSelections'] });
    if (result.canceled) return draft;
    for (const file of result.filePaths) {
      const stat = await fs.promises.stat(file);
      if (!stat.isFile()) continue;
      draft.attachments.push({ kind: 'file', path: file, name: path.basename(file), size: stat.size });
    }
    return writeDraft(draft);
  }

  async function attachFromVault(id, relPath) {
    const draft = await readDraft(id);
    const full = ctx.resolveVaultFile(relPath);
    const stat = await fs.promises.stat(full);
    draft.attachments.push({ kind: 'vault', path: relPath, name: path.basename(full), size: stat.size });
    return writeDraft(draft);
  }

  // The draft's attachments as bytes, read now (so a file changed since it was
  // attached goes as it is now).
  async function attachmentFiles(draft) {
    const files = [];
    let parsed = null;
    for (const att of draft.attachments) {
      if (att.kind === 'file') files.push({ filename: att.name, content: await fs.promises.readFile(att.path) });
      else if (att.kind === 'vault') files.push({ filename: att.name, content: await fs.promises.readFile(ctx.resolveVaultFile(att.path)) });
      else if (att.kind === 'original') {
        if (!parsed) parsed = (await parsedMessage(draft.sourceId)).parsed;
        const original = (parsed.attachments || [])[att.index];
        if (!original) throw new Error(`${att.name} isn’t in the original email any more.`);
        files.push({ filename: att.name, content: original.content, contentType: original.contentType });
      }
    }
    const total = files.reduce((n, f) => n + f.content.length, 0);
    if (total > MAX_ATTACH_BYTES) throw new Error('The attachments come to more than 25 MB, Gmail’s limit. Take some off.');
    return files;
  }

  // ---------- Sending ----------

  let testCount = 0;

  async function transportFor(account) {
    if (fixtureDir || process.env.OPAL_MAIL_TEST_TRANSPORT) {
      // Tests: Nodemailer builds the whole email but only hands it back.
      return { transport: nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' }), test: true };
    }
    return {
      transport: nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { type: 'OAuth2', user: account.email, accessToken: await accessToken(account) },
        logger: false,
      }),
      test: false,
    };
  }

  // `seen`: the window showed every recipient and you pressed Send again
  // (needed when there are more than 10).
  async function sendDraft(next, { seen = false } = {}) {
    let draft = await updateDraft(next);
    const account = accountFor(draft.account);
    if (!account) throw new Error('That account isn’t signed in any more.');
    const problems = compose.problems(draft);
    if (problems.length) throw new Error(problems.join(' '));
    const count = compose.recipientCount(draft);
    if (count > CONFIRM_OVER && !seen) {
      const r = compose.recipients(draft);
      return { needsCheck: true, count, recipients: { to: r.to.map(compose.formatAddress), cc: r.cc.map(compose.formatAddress), bcc: r.bcc.map(compose.formatAddress) } };
    }
    try {
      const options = compose.mailOptions(draft, account, await attachmentFiles(draft));
      const { transport, test } = await transportFor(account);
      const info = await transport.sendMail(options);
      if (test) {
        await fs.promises.mkdir(outboxDir(), { recursive: true });
        testCount = Math.max(testCount, (await fs.promises.readdir(outboxDir())).length) + 1;
        await fs.promises.writeFile(path.join(outboxDir(), `${String(testCount).padStart(4, '0')}.eml`), info.message);
      }
    } catch (err) {
      draft.error = String(err && err.message ? err.message : err).replace(/\s+/g, ' ').slice(0, 400);
      draft = await writeDraft(draft);
      const failure = new Error(draft.error);
      throw failure;
    }
    await discardDraft(draft.id);
    // Gmail files the copy in Sent; fetch it so it shows (and can be saved).
    syncAccount(account).then(() => tell('mail:changed', null)).catch(() => {});
    return { sent: true, inReplyTo: draft.inReplyTo, count };
  }

  // ---------- New mail (IMAP IDLE) ----------

  const watchers = new Map(); // account id → { imap, timer, stopped, backoff }

  function knownUids(accountId) {
    return new Set(readCache(accountId).messages.map((m) => m.uid));
  }

  async function checkNew(account, before) {
    await syncAccount(account);
    const sorting = readSorting();
    const fresh = readCache(account.id).messages
      .filter((m) => !before.has(m.uid) && m.unread)
      .map((m) => ({ id: `${account.id}:${m.uid}`, from: m.from, subject: m.subject, box: boxOf(m, sorting) }));
    tell('mail:arrived', { messages: listFor(readAccounts()), fresh });
  }

  function watch(account) {
    if (fixtureDir) return watchFixture();
    if (watchers.has(account.id) || account.needsSignIn) return;
    const w = { imap: null, timer: null, stopped: false, backoff: 5000, busy: Promise.resolve() };
    watchers.set(account.id, w);
    const retry = () => {
      if (w.stopped) return;
      clearTimeout(w.timer);
      w.timer = setTimeout(start, w.backoff);
      w.backoff = Math.min(w.backoff * 2, 5 * 60 * 1000);
    };
    const start = async () => {
      if (w.stopped) return;
      try {
        const imap = new ImapFlow({
          host: 'imap.gmail.com',
          port: 993,
          secure: true,
          auth: { user: account.email, accessToken: await accessToken(account) },
          logger: false,
          maxIdleTime: 9 * 60 * 1000, // Gmail drops IDLE after ~10 min; renew before
        });
        w.imap = imap;
        imap.on('close', () => { if (w.imap === imap) { w.imap = null; retry(); } });
        imap.on('error', () => {});
        await imap.connect();
        await imap.mailboxOpen('INBOX', { readOnly: true });
        w.backoff = 5000;
        let before = knownUids(account.id);
        imap.on('exists', () => {
          w.busy = w.busy.then(async () => {
            await checkNew(account, before).catch(() => {});
            before = knownUids(account.id);
          });
        });
        // Anything that came while Opal was closed or asleep.
        await checkNew(account, before).catch(() => {});
        before = knownUids(account.id);
      } catch {
        if (w.imap) {
          const dead = w.imap;
          w.imap = null;
          dead.close();
        }
        retry();
      }
    };
    start();
  }

  function unwatch(id) {
    const w = watchers.get(id);
    if (!w) return;
    watchers.delete(id);
    w.stopped = true;
    clearTimeout(w.timer);
    if (w.imap) {
      const imap = w.imap;
      w.imap = null;
      imap.logout().catch(() => imap.close());
    }
  }

  // After sleep (or a network change) every connection is redone from scratch.
  function rewatchAll() {
    for (const id of [...watchers.keys()]) unwatch(id);
    for (const a of readAccounts()) watch(a);
  }

  let fixtureWatcher = null;
  function watchFixture() {
    if (fixtureWatcher) return;
    let timer = null;
    fixtureWatcher = fs.watch(fixtureDir, () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const before = knownUids('fixture');
        checkNew(readAccounts()[0], before).catch(() => {});
      }, 300);
    });
  }

  app.whenReady().then(() => {
    for (const a of readAccounts()) watch(a);
    powerMonitor.on('resume', () => setTimeout(rewatchAll, 3000));
  });

  // ---------- The window's channels ----------

  ipcMain.handle('mail:status', () => ({ accounts: readAccounts().map(publicAccount), configured: !!fixtureDir || !!oauth.loadClient(userData(), app.getAppPath()), fixture: !!fixtureDir }));
  ipcMain.handle('mail:add-account', () => addAccount());
  ipcMain.handle('mail:remove-account', (_e, id) => removeAccount(id));
  ipcMain.handle('mail:rename-account', (_e, id, label) => renameAccount(id, label));
  ipcMain.handle('mail:list', () => listFor(readAccounts()));
  ipcMain.handle('mail:sync', async () => {
    const problems = [];
    for (const a of readAccounts()) {
      if (a.needsSignIn) continue;
      try {
        await syncAccount(a);
      } catch (err) {
        problems.push(`${a.email}: ${err.message}`);
      }
    }
    return { messages: listFor(readAccounts()), problems };
  });
  ipcMain.handle('mail:open', (_e, id) => openMessage(id));
  ipcMain.handle('mail:set-read', (_e, ids, read) => setRead(ids, !!read));
  ipcMain.handle('mail:archive', (_e, id) => moveOut(id, 'archive'));
  ipcMain.handle('mail:trash', (_e, id) => moveOut(id, 'trash'));
  ipcMain.handle('mail:set-box', (_e, id, box) => setBox(id, box));
  ipcMain.handle('mail:open-in-gmail', (_e, id) => openInGmail(id));
  ipcMain.handle('mail:save', (_e, id, markdown) => saveMessage(id, markdown));
  ipcMain.handle('mail:saved', () => savedNotes());
  // Opens Opal's settings folder in Finder, where mail-client.json goes.
  ipcMain.handle('mail:reveal-setup', () => shell.openPath(userData()));

  ipcMain.handle('mail:find', (_e, messageId) => findMessage(messageId));
  ipcMain.handle('mail:compose', (_e, mode, sourceId, accountId) => startDraft(['new', 'reply', 'all', 'forward'].includes(mode) ? mode : 'new', sourceId, accountId));
  ipcMain.handle('mail:drafts', () => listDrafts());
  ipcMain.handle('mail:draft-update', (_e, draft) => updateDraft(draft || {}));
  ipcMain.handle('mail:draft-discard', (_e, id) => discardDraft(id));
  ipcMain.handle('mail:attach-finder', (_e, id) => attachFromFinder(id));
  ipcMain.handle('mail:attach-vault', (_e, id, relPath) => attachFromVault(id, relPath));
  ipcMain.handle('mail:send', (_e, draft, options) => sendDraft(draft || {}, { seen: !!(options && options.seen) }));

  app.on('before-quit', () => {
    for (const id of [...clients.keys()]) closeClient(id);
    for (const id of [...watchers.keys()]) unwatch(id);
    if (fixtureWatcher) fixtureWatcher.close();
  });
}

module.exports = { setupMail };
