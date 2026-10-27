/**
 * The session cookie.
 *
 * This is the whole gate: if a cookie can be forged, altered or replayed past
 * its expiry, every other check in the sign-in path is decoration. So the
 * tampering cases matter more than the happy path.
 */
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wldd-sess-')), 'session.mjs');
await build({ entryPoints: ['lib/session.ts'], bundle: true, platform: 'neutral',
  format: 'esm', outfile: out, logLevel: 'error' });
const { sign, verify, allowed, COOKIE, TTL_SECONDS } = await import(out);

let pass = 0; const fails = [];
const check = (name, cond) => { if (cond) { pass++; } else { fails.push(name); } };

console.log('\nSession cookie');

const SECRET = 'a-secret-that-only-the-deployment-knows';
const token = await sign('krish@wldd.in', SECRET);

check('a freshly signed cookie verifies', (await verify(token, SECRET))?.email === 'krish@wldd.in');
check('a cookie signed with another secret is refused', (await verify(token, 'not-the-secret')) === null);
check('an empty cookie is refused', (await verify(undefined, SECRET)) === null);
check('a cookie with no signature is refused', (await verify('justsomething', SECRET)) === null);

// Tamper with the payload, keeping the original signature.
const [body, mac] = token.split('.');
const forgedBody = Buffer.from(JSON.stringify({ email: 'attacker@example.com', exp: 2 ** 31 }))
  .toString('base64url');
check('a swapped address is refused', (await verify(`${forgedBody}.${mac}`, SECRET)) === null);

// Re-sign an expired payload with the real secret: signature good, time bad.
const expired = await sign('krish@wldd.in', SECRET);
const [expBody] = expired.split('.');
const stale = JSON.parse(Buffer.from(expBody, 'base64url').toString());
check('the cookie carries an expiry', typeof stale.exp === 'number');
check('the expiry is the stated lifetime', Math.abs(stale.exp - (Math.floor(Date.now() / 1000) + TTL_SECONDS)) <= 2);

// An expired-but-correctly-signed cookie must still be refused.
const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const oldBody = enc({ email: 'krish@wldd.in', exp: Math.floor(Date.now() / 1000) - 60 });
const reSigned = await sign('krish@wldd.in', SECRET); // same secret, used below only for shape
check('cookie format is body.signature', reSigned.split('.').length === 2);
// Build a genuinely signed, genuinely expired cookie via the same primitive.
const { createHmac } = await import('node:crypto');
const oldMac = createHmac('sha256', SECRET).update(oldBody).digest('base64url');
check('an expired cookie is refused even when properly signed',
  (await verify(`${oldBody}.${oldMac}`, SECRET)) === null);

check('the cookie name is stable', COOKIE === 'wldd_session');

// --- who is allowed in -----------------------------------------------------
check('a wldd address is allowed', allowed('krish@wldd.in', 'wldd.in'));
check('capitals do not matter', allowed('Krish@WLDD.IN', 'wldd.in'));
check('an outside address is refused', !allowed('someone@gmail.com', 'wldd.in'));
check('a lookalike domain is refused', !allowed('someone@notwldd.in', 'wldd.in'));
check('a domain as a prefix is refused', !allowed('someone@wldd.in.evil.com', 'wldd.in'));
check('the domain in the local part is refused', !allowed('wldd.in@gmail.com', 'wldd.in'));
check('a malformed address is refused', !allowed('nobody', 'wldd.in'));

fails.forEach((f) => console.log(`  FAIL ${f}`));
console.log(`  ${pass} passed, ${fails.length} failed`);
fs.rmSync(path.dirname(out), { recursive: true, force: true });
if (fails.length) process.exit(1);
