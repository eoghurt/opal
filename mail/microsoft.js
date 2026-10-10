// Outlook.com / Hotmail / Live accounts (personal Microsoft accounts only),
// through Microsoft Graph — Microsoft's own mail service — not IMAP.
//
// Sign-in: OAuth 2.0 for a desktop ("public") app with PKCE, like Google's, at
// login.microsoftonline.com/consumers. No secret: only the Application
// (client) ID, saved as <userData>/mail-microsoft.json by the setup card.
// The reply comes back to http://localhost:<port> (Microsoft allows any port
// for localhost); Opal listens on 127.0.0.1 and ::1 only, just for the sign-in.
//
// Mail: the Inbox (Focused → People, Other → Updates, from Outlook's own
// Focused Inbox), Sent Items, an email's original MIME (so note.js parses it
// exactly like Gmail's), read/unread, archive, delete. Sending posts the same
// MIME Nodemailer builds for Gmail (so threading headers are kept); Outlook
// files the copy in Sent Items. New mail: Graph has no IDLE for a desktop app,
// so the Inbox is checked every minute while Opal runs.
//
// Graph's message ids are long strings; Opal's ids are "<account>:<number>",
// so each account's cache keeps a number for each Graph id (idMap).

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const AUTH = 'https://login.microsoftonline.com/consumers/oauth2/v2.0';
const GRAPH = process.env.OPAL_GRAPH_BASE || 'https://graph.microsoft.com/v1.0';
const SCOPES = ['offline_access', 'openid', 'User.Read', 'Mail.ReadWrite', 'Mail.Send'];
const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000;
const LIST_LIMIT = 150;
const SENT_LIMIT = 60;
const MAX_SEND_BYTES = 3 * 1024 * 1024; // Graph takes about 4 MB per request; base64 adds a third
const FIELDS = 'id,subject,from,toRecipients,receivedDateTime,sentDateTime,isRead,hasAttachments,internetMessageId,conversationId,inferenceClassification,bodyPreview';

// ---------- The client ID ----------

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clientFile(userData) {
  return path.join(userData, 'mail-microsoft.json');
}

function loadClient(userData) {
  try {
    const id = JSON.parse(fs.readFileSync(clientFile(userData), 'utf8')).clientId;
    return GUID.test(id || '') ? { clientId: id } : null;
  } catch {
    return null;
  }
}

function saveClient(userData, clientId) {
  const id = String(clientId || '').trim();
  if (!GUID.test(id)) throw new Error('That isn’t an Application (client) ID. It looks like 0f3e1a2b-…, five groups of letters and numbers.');
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(clientFile(userData), JSON.stringify({ clientId: id }, null, 2));
  return true;
}

// ---------- Sign-in ----------

const base64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function tokenRequest(fields) {
  const res = await fetch(`${AUTH}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(String(json.error_description || json.error || `Microsoft said ${res.status}.`).split(/\r?\n/)[0]);
    err.code = json.error;
    throw err;
  }
  return json;
}

const PAGE = (title, text) => `<!doctype html><meta charset="utf-8"><title>${title}</title>
<body style="font:16px -apple-system,sans-serif;display:grid;place-items:center;height:90vh;margin:0;background:#F9F9F8;color:#16140F">
<div style="text-align:center"><h1 style="font-size:34px;letter-spacing:-0.03em;margin:0 0 8px">${title}</h1><p style="color:#6E685C;margin:0">${text}</p></div>`;

// Resolves to { email, name, refreshToken, accessToken, expiresAt }.
function signIn(client, openExternal) {
  const verifier = base64url(crypto.randomBytes(48));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  const state = base64url(crypto.randomBytes(16));
  return new Promise((resolve, reject) => {
    let done = false;
    const servers = [];
    let port = 0;
    const finish = (err, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      for (const s of servers) s.close();
      if (err) reject(err);
      else resolve(value);
    };
    const handle = async (req, res) => {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname !== '/') {
        res.writeHead(404).end();
        return;
      }
      const reply = (title, text) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(PAGE(title, text));
      };
      if (url.searchParams.get('state') !== state) {
        reply('Something went wrong.', 'That sign-in reply wasn’t for Opal. Try again from Opal.');
        return;
      }
      const error = url.searchParams.get('error');
      if (error) {
        reply('Not signed in.', 'You can close this tab and go back to Opal.');
        const text = url.searchParams.get('error_description') || error;
        finish(new Error(error === 'access_denied' ? 'Sign-in was cancelled.' : `Microsoft said: ${text.split(/\r?\n/)[0]}`));
        return;
      }
      try {
        const tokens = await tokenRequest({
          client_id: client.clientId,
          grant_type: 'authorization_code',
          code: url.searchParams.get('code') || '',
          redirect_uri: `http://localhost:${port}`,
          code_verifier: verifier,
          scope: SCOPES.join(' '),
        });
        if (!tokens.refresh_token) throw new Error('Microsoft didn’t send a refresh token. Try signing in again.');
        const me = await graph(tokens.access_token, '/me?$select=displayName,mail,userPrincipalName');
        reply('Signed in.', 'You can close this tab and go back to Opal.');
        finish(null, {
          email: me.mail || me.userPrincipalName || '',
          name: me.displayName || '',
          refreshToken: tokens.refresh_token,
          accessToken: tokens.access_token,
          expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
        });
      } catch (err) {
        reply('Not signed in.', 'Something went wrong. Go back to Opal to see what.');
        finish(err);
      }
    };
    const timer = setTimeout(() => finish(new Error('Sign-in timed out. Try again.')), SIGN_IN_TIMEOUT_MS);
    // "localhost" can mean 127.0.0.1 or ::1 to the browser: listen on both, same port.
    const first = http.createServer(handle);
    servers.push(first);
    first.on('error', (err) => finish(err));
    first.listen(0, '127.0.0.1', () => {
      port = first.address().port;
      const second = http.createServer(handle);
      servers.push(second);
      second.on('error', () => {}); // no IPv6 on this Mac: 127.0.0.1 is enough
      second.listen(port, '::1');
      const url = new URL(`${AUTH}/authorize`);
      url.search = new URLSearchParams({
        client_id: client.clientId,
        response_type: 'code',
        redirect_uri: `http://localhost:${port}`,
        response_mode: 'query',
        scope: SCOPES.join(' '),
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
        prompt: 'select_account',
      }).toString();
      Promise.resolve(openExternal(url.href)).catch((err) => finish(err));
    });
  });
}

// A fresh access token. Microsoft hands back a new refresh token each time,
// which replaces the stored one (the caller saves it).
async function refreshAccess(client, refreshToken) {
  const tokens = await tokenRequest({
    client_id: client.clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: SCOPES.join(' '),
  });
  return { accessToken: tokens.access_token, refreshToken: tokens.refresh_token || refreshToken, expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000 };
}

// ---------- Graph ----------

async function graph(token, route, { method = 'GET', body, type = 'application/json', raw = false } = {}) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(route.startsWith('http') ? route : `${GRAPH}${route}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { 'Content-Type': type } : {}) },
      body: body === undefined ? undefined : type === 'application/json' ? JSON.stringify(body) : body,
    });
    if (res.status === 429 && attempt < 3) {
      await new Promise((r) => setTimeout(r, Math.min(30, Number(res.headers.get('retry-after')) || 2 ** attempt) * 1000));
      continue;
    }
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      const err = new Error((json.error && json.error.message) || `Outlook said ${res.status}.`);
      err.status = res.status;
      throw err;
    }
    if (raw) return Buffer.from(await res.arrayBuffer());
    if (res.status === 202 || res.status === 204) return null;
    return res.json();
  }
}

const address = (r) => ({ name: (r && r.emailAddress && r.emailAddress.name) || '', address: (r && r.emailAddress && r.emailAddress.address) || '' });

// The provider the mail module uses for an account with provider: 'microsoft'.
// `store`: { readCache(id), writeCache(id, cache), token(account) }.
function provider(store) {
  // A stable number for each Graph id (kept in the cache).
  function numberFor(cache, graphId) {
    cache.idMap = cache.idMap || {};
    if (!cache.idMap[graphId]) {
      cache.nextUid = (cache.nextUid || 0) + 1;
      cache.idMap[graphId] = cache.nextUid;
    }
    return cache.idMap[graphId];
  }

  function graphIdOf(accountId, uid) {
    const map = store.readCache(accountId).idMap || {};
    const hit = Object.keys(map).find((k) => map[k] === uid);
    if (!hit) throw new Error('That message isn’t here any more.');
    return hit;
  }

  function header(cache, m) {
    return {
      uid: numberFor(cache, m.id),
      threadId: m.conversationId || '',
      messageId: m.internetMessageId || '',
      subject: m.subject || '(no subject)',
      from: address(m.from),
      to: (m.toRecipients || []).map(address),
      date: m.receivedDateTime || m.sentDateTime || new Date().toISOString(),
      unread: !m.isRead,
      attachments: !!m.hasAttachments,
      snippet: String(m.bodyPreview || '').replace(/\s+/g, ' ').trim().slice(0, 140),
      gmailBox: m.inferenceClassification === 'other' ? 'updates' : 'people', // Focused → People
    };
  }

  async function sync(account) {
    const token = await store.token(account);
    const inbox = await graph(token, `/me/mailFolders/inbox/messages?$top=${LIST_LIMIT}&$orderby=receivedDateTime desc&$select=${FIELDS}`);
    const sent = await graph(token, `/me/mailFolders/sentitems/messages?$top=${SENT_LIMIT}&$orderby=sentDateTime desc&$select=${FIELDS}`);
    const cache = store.readCache(account.id);
    const messages = (inbox.value || []).map((m) => header(cache, m));
    const sentList = (sent.value || []).map((m) => ({ ...header(cache, m), unread: false, date: m.sentDateTime || m.receivedDateTime }));
    // Forget numbers for messages gone from both lists, so the map doesn't grow forever.
    const keep = new Set([...(inbox.value || []), ...(sent.value || [])].map((m) => m.id));
    for (const id of Object.keys(cache.idMap || {})) if (!keep.has(id)) delete cache.idMap[id];
    store.writeCache(account.id, { ...cache, provider: 'microsoft', messages, sent: sentList });
  }

  async function raw(account, uid) {
    return graph(await store.token(account), `/me/messages/${encodeURIComponent(graphIdOf(account.id, uid))}/$value`, { raw: true });
  }

  async function setRead(account, uid, read) {
    await graph(await store.token(account), `/me/messages/${encodeURIComponent(graphIdOf(account.id, uid))}`, { method: 'PATCH', body: { isRead: !!read } });
  }

  async function moveOut(account, uid, where) {
    await graph(await store.token(account), `/me/messages/${encodeURIComponent(graphIdOf(account.id, uid))}/move`, { method: 'POST', body: { destinationId: where === 'trash' ? 'deleteditems' : 'archive' } });
  }

  async function find(account, messageId) {
    const id = `<${String(messageId).replace(/^<|>$/g, '')}>`.replace(/'/g, "''");
    const found = await graph(await store.token(account), `/me/messages?$filter=internetMessageId eq '${encodeURIComponent(id)}'&$select=id&$top=1`);
    if (!found.value || !found.value.length) return null;
    await sync(account);
    const map = store.readCache(account.id).idMap || {};
    return map[found.value[0].id] || null;
  }

  // `mime`: the whole email as Nodemailer built it.
  async function send(account, mime) {
    if (mime.length > MAX_SEND_BYTES) throw new Error('Outlook takes emails up to about 3 MB from apps like Opal. Take some attachments off.');
    await graph(await store.token(account), '/me/sendMail', { method: 'POST', body: Buffer.from(mime).toString('base64'), type: 'text/plain' });
  }

  return { sync, raw, setRead, moveOut, find, send };
}

module.exports = { loadClient, saveClient, signIn, refreshAccess, provider, graph };
