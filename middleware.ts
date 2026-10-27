import { COOKIE, verify } from './lib/session';

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
 */
export const config = {
  // Everything except the sign-in endpoints themselves and Vercel's internals.
  matcher: ['/((?!api/auth|api/signout|_vercel|favicon).*)'],
};

const PUBLIC_PATHS = new Set(['/api/auth', '/api/signout']);

export default async function middleware(request: Request) {
  const url = new URL(request.url);
  if (PUBLIC_PATHS.has(url.pathname)) return;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.SESSION_SECRET;
  const domain = process.env.ALLOWED_EMAIL_DOMAIN || 'wldd.in';

  // Not configured yet: behave as though the gate were not here at all.
  if (!clientId || !secret) return;

  const cookie = request.headers.get('cookie') ?? '';
  const token = cookie.split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);

  if (await verify(token, secret)) return;

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

  return new Response(signInPage(clientId, domain), {
    status: 401,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
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
<style>
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
