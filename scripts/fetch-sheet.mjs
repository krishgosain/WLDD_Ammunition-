/**
 * Pulls the BD Ammo sheet down to data/campaigns.csv.
 *
 *   node scripts/fetch-sheet.mjs
 *
 * Two ways in, tried in order:
 *
 *   1. A Google service account in GOOGLE_SERVICE_ACCOUNT_JSON. The sheet stays
 *      private and is shared with the service account's email. Preferred.
 *   2. The public CSV export, which only works if the sheet is set to
 *      "anyone with the link can view".
 *
 * Signed by hand with node's crypto rather than pulling in googleapis, which is
 * a large dependency for one token exchange and one GET.
 *
 * The download is validated before it is allowed to replace the committed file.
 * Google answers an unauthorised export with a 200 and a login page, so status
 * alone proves nothing — a silent overwrite with HTML would destroy the archive.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'campaigns.csv');
const SHEET_ID = process.env.SHEET_ID
  || '17Zw3Rj0hv26vz7mApLB5hiKiY__5liO4tKF3VqGUaPQ';
const GID = process.env.SHEET_GID || '0';

/** Minimum rows a download must carry to be believed. */
const MIN_ROWS = 500;
/** A drop larger than this against the committed file needs a human. */
const MAX_SHRINK = 0.1;

const die = (msg) => { console.error(`\n  ${msg}\n`); process.exit(1); };

function base64url(input) {
  return Buffer.from(input).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Service-account JWT -> OAuth access token. */
async function accessToken(credentials) {
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64url(JSON.stringify(claim))}`;
  const signature = crypto.createSign('RSA-SHA256')
    .update(unsigned).end()
    .sign(credentials.private_key.replace(/\\n/g, '\n'), 'base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`,
    }),
  });
  if (!res.ok) {
    die(`Google rejected the service account (${res.status}).\n  ${(await res.text()).slice(0, 300)}`);
  }
  return (await res.json()).access_token;
}

async function viaServiceAccount(raw) {
  let credentials;
  try { credentials = JSON.parse(raw); }
  catch { die('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.'); }
  if (!credentials.client_email || !credentials.private_key) {
    die('GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email or private_key.');
  }
  console.log(`  auth: service account ${credentials.client_email}`);
  const token = await accessToken(credentials);
  const url = `https://www.googleapis.com/drive/v3/files/${SHEET_ID}/export?mimeType=text/csv`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (res.status === 404) {
    die(`The sheet was not found, which usually means it has not been shared\n  with ${credentials.client_email}. Share it as Viewer and retry.`);
  }
  if (!res.ok) die(`Export failed (${res.status}).\n  ${(await res.text()).slice(0, 300)}`);
  return res.text();
}

async function viaPublicLink() {
  console.log('  auth: none — trying the public CSV export');
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) {
    die(`The sheet is not publicly readable (${res.status}).\n`
      + '  Either set GOOGLE_SERVICE_ACCOUNT_JSON, or set the sheet to\n'
      + '  "anyone with the link can view".');
  }
  return res.text();
}

/** Refuse anything that is not recognisably the sheet. */
function validate(text) {
  if (/^\s*<!DOCTYPE html/i.test(text) || /<html/i.test(text.slice(0, 400))) {
    die('Got an HTML page instead of CSV — almost always a sign-in redirect.\n'
      + '  The committed data has been left untouched.');
  }
  const lines = text.split(/\r?\n/);
  const headerAt = lines.findIndex((l) => /^Industry,Client,Campaign Name/i.test(l));
  if (headerAt < 0) {
    die('No "Industry,Client,Campaign Name" header row found.\n'
      + '  The tab layout may have changed. Leaving the committed data alone.');
  }
  const rows = lines.slice(headerAt + 1).filter((l) => l.trim() && !/^,+$/.test(l)).length;
  if (rows < MIN_ROWS) {
    die(`Only ${rows} rows came back, below the ${MIN_ROWS} floor.\n`
      + '  Refusing to overwrite the archive with a partial export.');
  }
  return rows;
}

// ------------------------------------------------------------------ run

const sa = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
const text = sa ? await viaServiceAccount(sa) : await viaPublicLink();
const rows = validate(text);

if (fs.existsSync(OUT)) {
  const before = fs.readFileSync(OUT, 'utf8').split(/\r?\n/);
  const at = before.findIndex((l) => /^Industry,Client,Campaign Name/i.test(l));
  const had = before.slice(at + 1).filter((l) => l.trim() && !/^,+$/.test(l)).length;
  if (had && !process.env.FORCE && rows < had * (1 - MAX_SHRINK)) {
    die(`Row count fell from ${had} to ${rows}, more than ${MAX_SHRINK * 100}%.\n`
      + '  That is usually a bad export rather than deleted campaigns.\n'
      + '  Re-run with FORCE=1 if the drop is real.');
  }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, text);
console.log(`  ${rows} rows → data/campaigns.csv\n`);
