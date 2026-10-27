import { next } from '@vercel/functions';
import { COOKIE, verify } from './lib/session.js';

/**
 * The gate. Nothing in this deployment is served to someone who has not
 * signed in with a WLDD address.
 *
 * It runs at the edge, ahead of the static files, which is the only place
 * that actually protects the data: the campaign archive is a plain JSON file
 * next to the app, so a sign-in screen drawn by the app itself would stop
 * nobody — the file is one URL away. Gating here covers the page, the
 * bundles and the data with the same check.
 *
 * It is inert until it is configured. With no GOOGLE_CLIENT_ID and no
 * SESSION_SECRET in the environment the gate steps aside and the site behaves
 * exactly as it did before, so shipping this cannot lock anyone out of a live
 * dashboard; adding those two variables in Vercel is what switches it on.
 *
 * Relative imports here name their extension. package.json sets
 * "type": "module", so the platform resolves this file as strict ESM and an
 * extensionless './lib/session' is simply not found — the module dies at load
 * with no log line at all, which is a miserable thing to debug and is exactly
 * what took the site down once.
 *
 * It also fails open. Everything below runs in front of every request, so a
 * mistake in it takes the whole site down rather than one page — which is
 * exactly what happened the first time this shipped, by returning nothing
 * where the platform wanted next(). A gate that errors is a gate that stops
 * the team working, so an unexpected throw lets the request through and says
 * so in the log rather than serving a 500 to everybody.
 */
export const config = {
  // Node, explicitly. The gate verifies an HMAC and reads the environment, and
  // leaving the runtime to be inferred is one more thing that can differ
  // between here and the platform.
  runtime: 'nodejs',
};

/**
 * Paths the gate must never hold, or signing in becomes impossible: the
 * handler that mints the session, and the one that clears it.
 *
 * This is deliberately done in code rather than with a config matcher. A
 * matcher is the one part of this file that cannot be exercised by a test —
 * it is interpreted by the platform — so the exclusions live where the tests
 * can see them.
 */
const PUBLIC_PATHS = new Set(['/api/auth', '/api/signout']);

export default async function middleware(request: Request) {
  try {
    return await gate(request);
  } catch (err) {
    console.error('sign-in gate failed open:', err);
    return next();
  }
}

async function gate(request: Request) {
  const url = new URL(request.url);
  if (PUBLIC_PATHS.has(url.pathname)) return next();

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.SESSION_SECRET;
  const password = process.env.TEAM_PASSWORD;
  const domain = process.env.ALLOWED_EMAIL_DOMAIN || 'wldd.in';

  // Two ways in, and Google wins when both are set up. The shared password
  // exists because creating a Google client needs the Workspace console,
  // which is not always to hand, and an archive of client work sitting open
  // on a public URL while that is arranged is the worse trade. It knows who
  // nobody is, so it is a stopgap and the door says so.
  const mode = secret && clientId ? 'google' : secret && password ? 'password' : null;

  // Not configured yet: behave as though the gate were not here at all.
  if (!mode) return next();

  const cookie = request.headers.get('cookie') ?? '';
  const token = cookie.split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);

  if (await verify(token, secret!)) return next();

  // A fetch for data gets a status it can act on; a person gets the door.
  const wantsJson = url.pathname.startsWith('/api/')
    || url.pathname.startsWith('/data/')
    || (request.headers.get('accept') ?? '').includes('application/json');

  if (wantsJson) {
    return new Response(JSON.stringify({ error: 'sign in with a WLDD account' }), {
      status: 401,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  return new Response(
    mode === 'google' ? signInPage(clientId!, domain) : passwordPage(domain),
    { status: 401, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
  );
}

/** One look for both doors, so the stopgap does not feel like a different site. */
const DOOR_STYLE = `<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100svh; display: grid; place-items: center; padding: 24px;
    background: #EDE7DC; color: #131313;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  .card {
    width: min(420px, 100%); padding: 40px 36px; border-radius: 22px; background: #FFF8EC;
    box-shadow: 0 40px 80px -40px rgba(31, 26, 20, .45); text-align: center;
  }
  .mark { font-size: 34px; font-weight: 800; letter-spacing: .02em; }
  .mark span:nth-child(1) { color: #FF3B2F; }
  .mark span:nth-child(2) { color: #FFD644; }
  .mark span:nth-child(3) { color: #8B7CFF; }
  .mark span:nth-child(4) { color: #E8389F; }
  .sub { margin: 6px 0 26px; font-size: 13px; letter-spacing: .14em; text-transform: uppercase; color: #8A7C68; }
  p { margin: 0 0 22px; font-size: 14px; line-height: 1.55; color: #5C5245; }
  .btn { display: flex; justify-content: center; min-height: 44px; }
  .err { margin-top: 18px; font-size: 13px; line-height: 1.5; color: #A3281A; min-height: 1.2em; }
  @media (prefers-color-scheme: dark) {
    body { background: #131313; color: #FFF8EC; }
    .card { background: #1C1C1C; }
    p { color: #B8AB97; }
  }
</style>
<style>
  .pw {
    width: 100%; height: 46px; padding: 0 14px; border-radius: 12px; margin-bottom: 10px;
    border: 1px solid #DED4C3; background: #fff; color: #131313; font-size: 15px;
  }
  .pw:focus { outline: 2px solid #8B7CFF; outline-offset: 1px; }
  .go {
    width: 100%; height: 46px; border: 0; border-radius: 999px; cursor: pointer;
    background: #131313; color: #FFF8EC; font-size: 14px; font-weight: 600;
  }
  .go:hover { background: #2a2a2a; }
  .note { margin-top: 16px; font-size: 11.5px; letter-spacing: .08em; text-transform: uppercase; color: #9A8C78; }
  @media (prefers-color-scheme: dark) {
    .pw { background: #131313; border-color: #3a3a3a; color: #FFF8EC; }
    .go { background: #FFF8EC; color: #131313; }
  }
</style>`;

/**
 * The stopgap door: one password for the team.
 *
 * Deliberately plain about what it is. A shared password cannot tell one
 * person from another and cannot be revoked for one of them, so it is worth
 * saying on the page itself that this is temporary — otherwise it quietly
 * becomes permanent.
 */
function passwordPage(domain: string) {
  return `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WLDD Ammo</title>
${DOOR_STYLE}
</head>
<body>
  <main class="card">
    <div class="mark"><span>W</span><span>L</span><span>D</span><span>D</span></div>
    <div class="sub">Ammo</div>
    <p>The campaign archive is for the ${domain} team. Enter the team password to continue.</p>
    <form id="f" autocomplete="on">
      <input id="pw" class="pw" type="password" name="password" placeholder="Team password"
             aria-label="Team password" autocomplete="current-password" autofocus>
      <button class="go" type="submit">Open the archive</button>
    </form>
    <div class="err" id="err" role="alert"></div>
    <div class="note">Temporary, until Google sign-in is switched on.</div>
  </main>
  <script>
    document.getElementById('f').addEventListener('submit', function (e) {
      e.preventDefault();
      var err = document.getElementById('err');
      err.textContent = 'Checking…';
      fetch('/api/auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: document.getElementById('pw').value })
      }).then(function (r) {
        return r.json().then(function (b) { return { ok: r.ok, b: b }; });
      }).then(function (out) {
        if (out.ok) { location.reload(); return; }
        err.textContent = (out.b && out.b.error) || 'That password was not right.';
      }).catch(function () { err.textContent = 'Could not reach the sign-in service.'; });
    });
  </script>
</body>
</html>`;
}

/**
 * The door: a single self-contained page, served by the gate rather than
 * built into the app, so none of the app's own bundles or data are handed to
 * someone who has not signed in yet.
 */
function signInPage(clientId: string, domain: string) {
  return `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WLDD Ammo</title>
<link rel="preconnect" href="https://accounts.google.com">
${DOOR_STYLE}
</head>
<body>
  <main class="card">
    <div class="mark"><span>W</span><span>L</span><span>D</span><span>D</span></div>
    <div class="sub">Ammo</div>
    <p>The campaign archive is for the ${domain} team. Sign in with your WLDD Google account to continue.</p>
    <div class="btn"><div id="gsi"></div></div>
    <div class="err" id="err" role="alert"></div>
  </main>
  <script src="https://accounts.google.com/gsi/client" async defer></script>
  <script>
    function onCredential(res) {
      var err = document.getElementById('err');
      err.textContent = 'Checking…';
      fetch('/api/auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ credential: res.credential })
      }).then(function (r) {
        return r.json().then(function (b) { return { ok: r.ok, b: b }; });
      }).then(function (out) {
        if (out.ok) { location.reload(); return; }
        err.textContent = (out.b && out.b.error) || 'That account cannot open this.';
      }).catch(function () { err.textContent = 'Could not reach the sign-in service.'; });
    }
    window.addEventListener('load', function () {
      if (!window.google || !google.accounts) {
        document.getElementById('err').textContent = 'Could not load Google sign-in.';
        return;
      }
      google.accounts.id.initialize({
        client_id: ${JSON.stringify(clientId)},
        callback: onCredential,
        hd: ${JSON.stringify(domain)},
        auto_select: true
      });
      google.accounts.id.renderButton(document.getElementById('gsi'), {
        theme: 'filled_black', size: 'large', shape: 'pill', text: 'signin_with', width: 280
      });
      google.accounts.id.prompt();
    });
  </script>
</body>
</html>`;
}
