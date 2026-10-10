// Mail (read-only for now): Gmail accounts over IMAP, in the main process.
//
// Where things live — none of it in the vault:
//   <userData>/mail-accounts.json   the signed-in accounts; each refresh token is
//                                   encrypted with Electron's safeStorage (the
//                                   Mac keychain holds the key)
//   <userData>/mail-cache/<id>/     a cache of message headers (headers.json) and
//                                   bodies (<uid>.eml), so the inbox opens fast.
//                                   Delete it any time; Gmail still has everything.
//   <userData>/mail-cache/sorting.json  senders you moved between People and Updates
//
// An email only reaches the vault when you press Save: Mail/YYYY-MM-DD Subject.md
// with its attachments beside it (see note.js).
//
// Mailboxes: Gmail already sorts the inbox into Primary (people) and
// Promotions / Updates / Social / Forums (companies). People = Primary,
// Updates = the rest.
//
// For the e2e checks, OPAL_MAIL_FIXTURE=<folder of .eml files> swaps Gmail for
// that folder: one pretend account, nothing sent anywhere.

const fs = require('fs');
const path = require('path');
const { ImapFlow } = require('imapflow');
const { readProperties } = require('../shared/properties.js');
const oauth = require('./oauth.js');
const note = require('./note.js');

const LIST_LIMIT = 150; // newest messages kept per account
const IDLE_CLOSE_MS = 90 * 1000;
const MAIL_FOLDER = 'Mail';
const TOKEN = /\{\{opal-attachment:(\d+)\}\}/g;

function setupMail({ app, ipcMain, safeStorage, shell, ctx }) {
  const userData = () => app.getPath('userData');
  const accountsFile = () => path.join(userData(), 'mail-accounts.json');
  const cacheDir = (...parts) => path.join(userData(), 'mail-cache', ...parts);
  const fixtureDir = process.env.OPAL_MAIL_FIXTURE || '';

  // ---------- Accounts ----------

  function readAccounts() {
    if (fixtureDir) return [{ id: 'fixture', email: 'fixture@example.com', label: 'Fixture' }];
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
    return list.map(publicAccount);
  }

  async function removeAccount(id) {
    const list = readAccounts().filter((a) => a.id !== id);
    if (!fixtureDir) writeAccounts(list);
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
      for (const m of readCache(a.id).messages) out.push({ ...m, id: `${a.id}:${m.uid}`, account: a.id, box: boxOf(m, sorting) });
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
        writeCache(account.id, { uidValidity: validity, messages });
      } finally {
        lock.release();
      }
    });
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
    writeCache('fixture', { uidValidity: '1', messages });
  }

  // ---------- Opening one message ----------

  function splitId(id) {
    const [accountId, uid] = String(id).split(':');
    const account = readAccounts().find((a) => a.id === accountId);
    if (!account || !/^\d+$/.test(uid || '')) throw new Error('That message isn’t here any more.');
    return { account, uid: Number(uid) };
  }

  const snippetOf = (text) => String(text || '').replace(/\s+/g, ' ').trim().slice(0, 140);

  async function rawMessage(account, uid) {
    if (fixtureDir) return fs.promises.readFile(path.join(fixtureDir, fixtureFiles()[uid - 1]));
    const file = cacheDir(safeId(account.id), `${uid}.eml`);
    try {
      return await fs.promises.readFile(file);
    } catch {
      // not cached yet
    }
    const raw = await withImap(account, async (imap) => {
      const lock = await imap.getMailboxLock('INBOX');
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
    const { account, uid } = splitId(id);
    const parsed = await note.parseEml(await rawMessage(account, uid));
    const view = note.forWindow(parsed);
    updateCached(account, uid, (m) => { m.snippet = snippetOf(view.text); });
    return { id, account: account.id, ...view };
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
    const { account, uid } = splitId(id);
    const parsed = await note.parseEml(await rawMessage(account, uid));
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

  app.on('before-quit', () => {
    for (const id of [...clients.keys()]) closeClient(id);
  });
}

module.exports = { setupMail };
