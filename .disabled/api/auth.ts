import { createPublicKey, verify as verifySig } from 'node:crypto';
import { COOKIE, TTL_SECONDS, allowed, sign } from '../../lib/session';

/**
 * Turn a Google sign-in into a session cookie, if the account is WLDD's.
 *
 * The browser hands us an ID token. That token is worth nothing until it is
 * checked, so this verifies the signature against Google's published keys and
 * then checks every claim that matters: who issued it, that it was issued for
 * *this* client rather than some other site's, that it has not expired, that
 * the address is verified, and that it is on the allowed domain. Reading the
 * email straight out of an unverified token would be the whole gate undone —
 * anyone can mint JSON that says whatever they like.
 */

type Req = { method?: string; body?: unknown; headers: Record<string, string | string[] | undefined> };
type Res = {
  status(code: number): Res;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
};

const CERTS = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

type Jwk = { kid: string; n: string; e: string; kty: string; alg?: string; use?: string };
let cache: { keys: Jwk[]; until: number } | null = null;

async function googleKeys(): Promise<Jwk[]> {
  if (cache && cache.until > Date.now()) return cache.keys;
  const r = await fetch(CERTS);
  if (!r.ok) throw new Error(`google keys: ${r.status}`);
  const body = (await r.json()) as { keys: Jwk[] };
  // Honour Google's own caching window rather than guessing one.
  const cc = /max-age=(\d+)/.exec(r.headers.get('cache-control') ?? '');
  cache = { keys: body.keys, until: Date.now() + (cc ? Number(cc[1]) : 3600) * 1000 };
  return body.keys;
}

const unb64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

type Claims = {
  iss?: string; aud?: string; exp?: number; email?: string;
  email_verified?: boolean | string; hd?: string;
};

/** Verify an ID token end to end and return its claims, or throw. */
async function claimsFrom(idToken: string, clientId: string): Promise<Claims> {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  const [rawHead, rawBody, rawSig] = parts;

  const head = JSON.parse(unb64url(rawHead).toString('utf8')) as { kid?: string; alg?: string };
  if (head.alg !== 'RS256') throw new Error('unexpected signing algorithm');

  const jwk = (await googleKeys()).find((k) => k.kid === head.kid);
  if (!jwk) throw new Error('unknown signing key');

  const pub = createPublicKey({ key: jwk as unknown as JsonWebKey, format: 'jwk' });
  const signed = Buffer.from(`${rawHead}.${rawBody}`);
  if (!verifySig('RSA-SHA256', signed, pub, unb64url(rawSig))) throw new Error('bad signature');

  const claims = JSON.parse(unb64url(rawBody).toString('utf8')) as Claims;
  if (!ISSUERS.has(claims.iss ?? '')) throw new Error('wrong issuer');
  if (claims.aud !== clientId) throw new Error('token was not issued for this site');
  if (!claims.exp || claims.exp < Math.floor(Date.now() / 1000)) throw new Error('token expired');
  if (claims.email_verified !== true && claims.email_verified !== 'true') throw new Error('unverified address');
  if (!claims.email) throw new Error('token carries no address');
  return claims;
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.SESSION_SECRET;
  const domain = process.env.ALLOWED_EMAIL_DOMAIN || 'wldd.in';
  if (!clientId || !secret) {
    res.status(500).json({ error: 'sign-in is not configured on this deployment' });
    return;
  }

  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as { credential?: string } | undefined;
  const credential = body?.credential;
  if (!credential) {
    res.status(400).json({ error: 'no credential' });
    return;
  }

  let claims: Claims;
  try {
    claims = await claimsFrom(credential, clientId);
  } catch {
    // Never echo the reason: it tells someone probing exactly which check to
    // work around next.
    res.status(401).json({ error: 'Could not verify that sign-in.' });
    return;
  }

  // `hd` is Google's own statement that the account belongs to the Workspace
  // domain. A personal account that merely spells its address that way has no
  // hd, so both are required.
  if (claims.hd?.toLowerCase() !== domain.toLowerCase() || !allowed(claims.email!, domain)) {
    res.status(403).json({ error: `Use your @${domain} account — this archive is for the WLDD team.` });
    return;
  }

  const value = await sign(claims.email!, secret);
  res.setHeader('Set-Cookie',
    `${COOKIE}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${TTL_SECONDS}`);
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ ok: true, email: claims.email });
}
