// Signing in to Google: OAuth 2.0 for a desktop app, with PKCE.
//
// 1. Opal starts a tiny web server on 127.0.0.1 (a random free port) that
//    only lives until the sign-in finishes.
// 2. Google's sign-in page opens in the Mac's default browser. You type your
//    password there, never into Opal.
// 3. Google sends the browser back to that 127.0.0.1 address with a one-time
//    code; Opal swaps the code (plus the PKCE secret only it knows) for tokens.
//
// The client ID and secret come from mail-client.json — the file Google Cloud
// Console downloads for a "Desktop app" client. It is looked for in Opal's
// settings folder first, then the project folder; it is never committed (see
// .gitignore).

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
// IMAP needs the full mail scope; "email" tells Opal which address it is.
const SCOPES = ['https://mail.google.com/', 'openid', 'email'];
const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000;

function clientFiles(userData, appDir) {
  return [path.join(userData, 'mail-client.json'), path.join(appDir, 'mail-client.json')];
}

// { clientId, clientSecret } or null when there's no usable file.
function loadClient(userData, appDir) {
  for (const file of clientFiles(userData, appDir)) {
    try {
      const json = JSON.parse(fs.readFileSync(file, 'utf8'));
      const c = json.installed || json.web || json;
      if (c.client_id) return { clientId: c.client_id, clientSecret: c.client_secret || '' };
    } catch {
      // missing or unreadable: try the next place
    }
  }
  return null;
}

const base64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function postForm(url, fields) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error_description || json.error || `Google said ${res.status}.`);
    err.code = json.error;
    throw err;
  }
  return json;
}

// The signed-in address, read from the ID token Google just sent straight back
// over HTTPS (so it doesn't need checking again).
function emailFromIdToken(idToken) {
  try {
    const payload = JSON.parse(Buffer.from(String(idToken).split('.')[1], 'base64').toString('utf8'));
    return payload.email || '';
  } catch {
    return '';
  }
}

const PAGE = (title, text) => `<!doctype html><meta charset="utf-8"><title>${title}</title>
<body style="font:16px -apple-system,sans-serif;display:grid;place-items:center;height:90vh;margin:0;background:#F9F9F8;color:#16140F">
<div style="text-align:center"><h1 style="font-size:34px;letter-spacing:-0.03em;margin:0 0 8px">${title}</h1><p style="color:#6E685C;margin:0">${text}</p></div>`;

// Runs the whole sign-in. `openExternal` opens a URL in the default browser.
// Resolves to { email, refreshToken, accessToken, expiresAt }.
function signIn(client, openExternal) {
  const verifier = base64url(crypto.randomBytes(48));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  const state = base64url(crypto.randomBytes(16));

  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (err, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      server.close();
      if (err) reject(err);
      else resolve(value);
    };
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
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
        finish(new Error(error === 'access_denied' ? 'Sign-in was cancelled.' : `Google said: ${error}`));
        return;
      }
      try {
        const port = server.address().port;
        const tokens = await postForm(TOKEN_URL, {
          code: url.searchParams.get('code') || '',
          client_id: client.clientId,
          client_secret: client.clientSecret,
          code_verifier: verifier,
          grant_type: 'authorization_code',
          redirect_uri: `http://127.0.0.1:${port}`,
        });
        if (!tokens.refresh_token) throw new Error('Google didn’t send a refresh token. Remove Opal from your Google account’s third-party access and sign in again.');
        reply('Signed in.', 'You can close this tab and go back to Opal.');
        finish(null, {
          email: emailFromIdToken(tokens.id_token),
          refreshToken: tokens.refresh_token,
          accessToken: tokens.access_token,
          expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
        });
      } catch (err) {
        reply('Not signed in.', 'Something went wrong. Go back to Opal to see what.');
        finish(err);
      }
    });
    const timer = setTimeout(() => finish(new Error('Sign-in timed out. Try again.')), SIGN_IN_TIMEOUT_MS);
    server.on('error', (err) => finish(err));
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const url = new URL(AUTH_URL);
      url.search = new URLSearchParams({
        client_id: client.clientId,
        redirect_uri: `http://127.0.0.1:${port}`,
        response_type: 'code',
        scope: SCOPES.join(' '),
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
        access_type: 'offline',
        prompt: 'consent select_account',
      }).toString();
      Promise.resolve(openExternal(url.href)).catch((err) => finish(err));
    });
  });
}

// A fresh access token (they last an hour) from the stored refresh token.
async function refreshAccess(client, refreshToken) {
  const tokens = await postForm(TOKEN_URL, {
    client_id: client.clientId,
    client_secret: client.clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  return { accessToken: tokens.access_token, expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000 };
}

module.exports = { loadClient, signIn, refreshAccess };
