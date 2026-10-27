/**
 * Probe 2, preview branch only.
 *
 * The bare middleware ran, so the mechanism is fine. Both failed versions
 * shared exactly one import — ./lib/session — and the first of them imported
 * nothing else, so that file is the suspect. This imports it and nothing
 * else, and exercises it, so a failure here is unambiguous.
 */
import { COOKIE, sign, verify } from './lib/session.js';

export default async function middleware() {
  const token = await sign('probe@wldd.in', 'probe-secret');
  const back = await verify(token, 'probe-secret');
  return new Response(`probe 2: cookie=${COOKIE} signed=${token.slice(0, 12)}… verified=${back?.email}`, {
    status: 200,
    headers: { 'content-type': 'text/plain' },
  });
}
