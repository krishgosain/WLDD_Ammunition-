/**
 * The signed session cookie, shared by the edge gate and the sign-in handler.
 *
 * The cookie carries who signed in and when it expires, and nothing else. It
 * is signed with HMAC-SHA256 so the edge can trust it without a lookup, and
 * it is HttpOnly so the page's own JavaScript cannot read or forge one.
 *
 * Web Crypto is used rather than node:crypto because this runs in both
 * runtimes: the gate is edge middleware, the sign-in handler is a Node
 * function, and both need to agree on the format byte for byte.
 */

export const COOKIE = 'wldd_session';
/** A working day, so a laptop left open overnight asks again in the morning. */
export const TTL_SECONDS = 12 * 60 * 60;

const enc = new TextEncoder();

const b64url = (bytes: ArrayBuffer | Uint8Array) => {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const byte of b) s += String.fromCharCode(byte);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const unb64url = (s: string) => {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(pad + '='.repeat((4 - (pad.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

const key = (secret: string) =>
  crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

/** Mint a cookie value for an address that has already been checked. */
export async function sign(email: string, secret: string): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify({ email, exp: Math.floor(Date.now() / 1000) + TTL_SECONDS })));
  const mac = await crypto.subtle.sign('HMAC', await key(secret), enc.encode(body));
  return `${body}.${b64url(mac)}`;
}

/**
 * Read a cookie value back, or null if it is missing, altered or expired.
 *
 * The signature is checked with a constant-time comparison before the payload
 * is parsed, so a forged cookie never reaches the JSON parser.
 */
export async function verify(value: string | undefined, secret: string): Promise<{ email: string } | null> {
  if (!value) return null;
  const dot = value.lastIndexOf('.');
  if (dot < 1) return null;
  const body = value.slice(0, dot);
  let mac: Uint8Array;
  try { mac = unb64url(value.slice(dot + 1)); } catch { return null; }

  const good = await crypto.subtle.verify('HMAC', await key(secret), mac as unknown as ArrayBuffer, enc.encode(body));
  if (!good) return null;

  try {
    const claims = JSON.parse(new TextDecoder().decode(unb64url(body))) as { email?: string; exp?: number };
    if (!claims.email || !claims.exp) return null;
    if (claims.exp < Math.floor(Date.now() / 1000)) return null;
    return { email: claims.email };
  } catch { return null; }
}

/** Addresses this deployment lets in. */
export function allowed(email: string, domain: string): boolean {
  const at = email.lastIndexOf('@');
  if (at < 0) return false;
  return email.slice(at + 1).toLowerCase() === domain.toLowerCase();
}
