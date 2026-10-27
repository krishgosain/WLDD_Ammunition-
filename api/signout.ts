import { COOKIE } from '../lib/session.js';

/** Drop the session cookie. */
type Res = { status(c: number): Res; setHeader(n: string, v: string): void; json(b: unknown): void };

export default function handler(_req: unknown, res: Res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ ok: true });
}
