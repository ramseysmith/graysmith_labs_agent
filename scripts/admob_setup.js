#!/usr/bin/env node
'use strict';

// One time AdMob authorisation.
//
// AdMob does not support service accounts, so a background job needs a refresh
// token obtained once through a browser consent. This runs a loopback OAuth flow
// on localhost, does the exchange, and prints the line to paste into your
// secrets file. Run it yourself; it never sends anything anywhere but Google.
//
//   node scripts/admob_setup.js
//
// Needs ADMOB_CLIENT_ID and ADMOB_CLIENT_SECRET in the environment or the
// secrets file. See the README for creating the OAuth client.

const http = require('http');
const { execFile } = require('child_process');
const crypto = require('crypto');

const SCOPES = [
  'https://www.googleapis.com/auth/admob.readonly',
  'https://www.googleapis.com/auth/admob.report',
];

const CLIENT_ID = process.env.ADMOB_CLIENT_ID || '';
const CLIENT_SECRET = process.env.ADMOB_CLIENT_SECRET || '';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('ADMOB_CLIENT_ID and ADMOB_CLIENT_SECRET must be set.');
  console.error('Put them in ~/.graysmith_labs_secrets, then run:');
  console.error('  bash scripts/admob_setup.sh');
  process.exit(1);
}

// PKCE is not required for a confidential client, but costs nothing and means a
// stray authorisation code on this machine is not enough on its own.
const verifier = crypto.randomBytes(32).toString('base64url');
const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
const state = crypto.randomBytes(16).toString('hex');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname !== '/callback') {
    res.writeHead(404).end('no');
    return;
  }

  const err = url.searchParams.get('error');
  if (err) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<h1>Denied</h1><p>${err}</p><p>You can close this tab.</p>`);
    console.error(`\nConsent was denied: ${err}`);
    server.close();
    process.exit(1);
  }

  if (url.searchParams.get('state') !== state) {
    res.writeHead(400).end('state mismatch');
    console.error('\nState mismatch. Aborting rather than trusting that redirect.');
    server.close();
    process.exit(1);
  }

  const code = url.searchParams.get('code');
  const port = server.address().port;

  try {
    const body = new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: `http://127.0.0.1:${port}/callback`,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    });
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const tok = await r.json();

    if (!r.ok || !tok.refresh_token) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h1>Failed</h1><p>Check the terminal.</p>');
      console.error('\nToken exchange failed:');
      console.error(JSON.stringify(tok, null, 2));
      if (!tok.refresh_token && r.ok) {
        console.error('\nGoogle returned no refresh_token. That happens when you have');
        console.error('already consented. Revoke this app at');
        console.error('https://myaccount.google.com/permissions and run this again.');
      }
      server.close();
      process.exit(1);
    }

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h1>Done</h1><p>Refresh token captured. Close this tab and check your terminal.</p>');

    console.log('\nPaste this into ~/.graysmith_labs_secrets:\n');
    console.log(`ADMOB_REFRESH_TOKEN="${tok.refresh_token}"`);
    console.log('\nThen: chmod 600 ~/.graysmith_labs_secrets');
    console.log('\nIf your OAuth consent screen is still on "Testing", this token dies in');
    console.log('7 days and your ad revenue silently goes to zero. Set the publishing');
    console.log('status to "In production" before you rely on it.');
    server.close();
    process.exit(0);
  } catch (e) {
    res.writeHead(500).end('error');
    console.error(e);
    server.close();
    process.exit(1);
  }
});

server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  auth.searchParams.set('client_id', CLIENT_ID);
  auth.searchParams.set('redirect_uri', `http://127.0.0.1:${port}/callback`);
  auth.searchParams.set('response_type', 'code');
  auth.searchParams.set('scope', SCOPES.join(' '));
  // offline + consent is what actually produces a refresh token.
  auth.searchParams.set('access_type', 'offline');
  auth.searchParams.set('prompt', 'consent');
  auth.searchParams.set('state', state);
  auth.searchParams.set('code_challenge', challenge);
  auth.searchParams.set('code_challenge_method', 'S256');

  console.log('Add this exact redirect URI to your OAuth client first:');
  console.log(`\n  http://127.0.0.1:${port}/callback\n`);
  console.log('Google requires it to be registered. Because the port is random, the');
  console.log('simplest path is an OAuth client of type "Desktop app", which accepts any');
  console.log('loopback port automatically. If you made a "Web application" client, add');
  console.log('the URI above to its Authorized redirect URIs and rerun this.\n');
  console.log('Opening your browser. If nothing happens, visit:\n');
  console.log(auth.toString() + '\n');

  execFile('open', [auth.toString()], () => {});
});
