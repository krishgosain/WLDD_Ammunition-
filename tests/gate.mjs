/**
 * The edge gate.
 *
 * Two things have to hold. Nothing gets served without a valid WLDD session —
 * and, just as important, the gate does nothing at all until it is configured,
 * because shipping it to a live deployment that has no Google client yet must
 * not lock the team out of their own dashboard.
 */
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wldd-gate-'));
const out = path.join(dir, 'middleware.mjs');

// Stand in for the platform's next(), so a pass-through is something this
// test can see. The real one tells Vercel to carry on to the static files.
const stub = path.join(dir, 'vercel-functions.mjs');
fs.writeFileSync(stub, `export const next = () =>
  new Response(null, { status: 200, headers: { 'x-middleware-next': '1' } });\n`);

await build({ entryPoints: ['middleware.ts'], bundle: true, platform: 'neutral',
  format: 'esm', outfile: out, logLevel: 'error',
  alias: { '@vercel/functions': stub } });
const sessOut = path.join(dir, 'session.mjs');
await build({ entryPoints: ['lib/session.ts'], bundle: true, platform: 'neutral',
  format: 'esm', outfile: sessOut, logLevel: 'error' });

const { default: middleware } = await import(out);
const { sign, COOKIE } = await import(sessOut);

let pass = 0; const fails = [];
const check = (name, cond) => { if (cond) pass++; else fails.push(name); };

/** The gate let this through to the site. */
const wentThrough = (r) => r === undefined || r.headers.get('x-middleware-next') === '1';
/** The gate stopped it. */
const blocked = (r) => r !== undefined && r.status === 401;

const SECRET = 'deployment-secret';
const configure = (on) => {
  if (on) {
    process.env.GOOGLE_CLIENT_ID = '1234.apps.googleusercontent.com';
    process.env.SESSION_SECRET = SECRET;
  } else {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.SESSION_SECRET;
  }
};
const req = (url, headers = {}) => new Request(`https://ammo.test${url}`, { headers });

console.log('\nEdge gate');

// --- unconfigured: the gate must be invisible ------------------------------
configure(false);
check('an unconfigured gate lets the page through', wentThrough(await middleware(req('/'))));
check('an unconfigured gate lets the data through', wentThrough(await middleware(req('/data/campaigns.json'))));

// --- configured, no session ------------------------------------------------
configure(true);
const page = await middleware(req('/', { accept: 'text/html' }));
check('a stranger does not get the app', blocked(page));
check('a stranger gets the sign-in page', (await page.text()).includes('Sign in with your WLDD Google account'));
check('the sign-in page is never cached', page.headers.get('cache-control') === 'no-store');

const data = await middleware(req('/data/campaigns.json'));
check('a stranger does not get the campaign archive', blocked(data));
check('the refusal is JSON a fetch can read', data.headers.get('content-type').includes('application/json'));

const asset = await middleware(req('/assets/index-abc123.js'));
check('a stranger does not get the bundles either', blocked(asset));

// --- configured, with a session -------------------------------------------
const good = await sign('krish@wldd.in', SECRET);
const cookie = (v) => ({ cookie: `${COOKIE}=${v}` });
check('a signed-in request passes', wentThrough(await middleware(req('/', cookie(good)))));
check('a signed-in request reaches the data', wentThrough(await middleware(req('/data/campaigns.json', cookie(good)))));

const [body, mac] = good.split('.');
const forged = `${Buffer.from(JSON.stringify({ email: 'x@evil.com', exp: 2 ** 31 })).toString('base64url')}.${mac}`;
check('a forged cookie is refused', blocked(await middleware(req('/', cookie(forged)))));
check('a cookie from another deployment is refused',
  blocked(await middleware(req('/', cookie(await sign('krish@wldd.in', 'other-secret'))))));
check('a junk cookie is refused', blocked(await middleware(req('/', cookie('nonsense')))));

// --- the sign-in endpoints must stay reachable -----------------------------
check('the sign-in endpoint is not gated', wentThrough(await middleware(req('/api/auth'))));
check('the sign-out endpoint is not gated', wentThrough(await middleware(req('/api/signout'))));

// Other cookies on the domain must not confuse the reader.
check('an unrelated cookie does not grant access',
  blocked(await middleware(req('/', { cookie: 'theme=dark; other=1' }))));
check('the session is found among other cookies',
  wentThrough(await middleware(req('/', { cookie: `theme=dark; ${COOKIE}=${good}; x=1` }))));

// The gate runs in front of everything, so a bug in it must not be able to
// take the site down. This is the failure that actually shipped once.
const broken = await middleware({ url: 'not a url', headers: { get: () => null } });
check('a gate that throws lets the request through', wentThrough(broken));

configure(false);
fails.forEach((f) => console.log(`  FAIL ${f}`));
console.log(`  ${pass} passed, ${fails.length} failed`);
fs.rmSync(dir, { recursive: true, force: true });
if (fails.length) process.exit(1);
