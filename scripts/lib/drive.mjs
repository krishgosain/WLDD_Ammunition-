/**
 * Read-only Google Drive access for a service account.
 *
 * The same credential shape the sheet fetcher already uses
 * (GOOGLE_SERVICE_ACCOUNT_JSON), lifted out so the report checker and the
 * thumbnail builder share one token exchange instead of each growing their
 * own. Drive is reached with plain fetch rather than googleapis: a large
 * dependency for a token and a handful of GETs is not worth it.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';

const b64url = (s) => Buffer.from(s).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Exchange a service-account key for a read-only Drive token. */
export async function driveToken(credentials) {
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify(claim))}`;
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).end()
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
  if (!res.ok) throw new Error(`Google rejected the service account (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).access_token;
}

/** The credential, or null when this machine has not been given one. */
export function credentialsOrNull() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    const c = JSON.parse(raw);
    return c.client_email && c.private_key ? c : null;
  } catch { return null; }
}

/** The Drive file id inside a report link, or null if it is not a Drive file. */
export function driveId(url) {
  const m = /drive\.google\.com\/file\/d\/([\w-]{20,})/.exec(url ?? '')
    ?? /drive\.google\.com\/open\?id=([\w-]{20,})/.exec(url ?? '');
  return m ? m[1] : null;
}

/**
 * What Drive knows about a file. Returns null when the file is gone — a
 * missing file and an empty one are different problems and the caller says
 * so differently.
 */
export async function fileMeta(id, token) {
  const fields = 'id,name,mimeType,size,trashed,modifiedTime,owners(emailAddress),thumbnailLink,videoMediaMetadata,imageMediaMetadata';
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${id}?fields=${encodeURIComponent(fields)}&supportsAllDrives=true`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Drive ${res.status} for ${id}`);
  return res.json();
}

/** Stream a file to disk. Never buffered whole: these run to 136MB. */
export async function downloadTo(id, token, dest, maxBytes = 200 * 1024 * 1024) {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Drive download ${res.status} for ${id}`);
  const out = fs.createWriteStream(dest);
  let seen = 0;
  for await (const chunk of res.body) {
    seen += chunk.length;
    if (seen > maxBytes) { out.destroy(); throw new Error(`file exceeds ${maxBytes} bytes`); }
    out.write(chunk);
  }
  await new Promise((ok, no) => out.end((e) => (e ? no(e) : ok())));
  return seen;
}
