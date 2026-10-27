/**
 * Sweep every report link and record the ones that are provably gone.
 *
 * Kept out of the daily refresh on purpose: this makes ~1,700 outbound
 * requests, and a refresh that depends on the network is a refresh that fails
 * for reasons nothing to do with the sheet. Run it when it is worth knowing:
 *
 *   npm run links
 *
 * It writes data/dead-links.json, which the ingest reads as a blocklist, so a
 * dead link stops reaching the dashboard on the next refresh.
 *
 * The distinction this leans on: a Google or Canva document that exists but
 * is private answers 401 or 403, while one that was deleted — or never
 * existed — answers 404. Only a 404 is treated as proof. Canva's short
 * links (canva.link) answer 403 either way, so they are never judged here.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(ROOT, 'public/data/campaigns.json');
const OUT = path.join(ROOT, 'data/dead-links.json');
const CONCURRENCY = 10;

const campaigns = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const rows = Array.isArray(campaigns) ? campaigns : (campaigns.campaigns ?? campaigns.items ?? []);
const urls = [...new Set(rows.map((c) => c.report).filter(Boolean))];

/** canva.link answers 403 for a live private link and a dead one alike. */
const judgeable = (u) => !/^https?:\/\/(www\.)?canva\.link\//i.test(u);

async function status(url) {
  const ctrl = AbortSignal.timeout(25_000);
  try {
    const r = await fetch(url, { redirect: 'follow', signal: ctrl });
    return r.status;
  } catch {
    return 0; // network trouble: say nothing rather than something wrong
  }
}

const dead = {};
let checked = 0;
for (let i = 0; i < urls.length; i += CONCURRENCY) {
  const batch = urls.slice(i, i + CONCURRENCY);
  const codes = await Promise.all(batch.map(status));
  batch.forEach((u, k) => {
    checked++;
    if (judgeable(u) && codes[k] === 404) dead[u] = 'the document is gone (404)';
  });
  if (i % 200 === 0) process.stdout.write(`\r  checked ${checked}/${urls.length}`);
}
process.stdout.write(`\r  checked ${checked}/${urls.length}\n`);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify({
  sweptAt: new Date().toISOString().slice(0, 10),
  checked: urls.length,
  links: dead,
}, null, 2)}\n`);

const n = Object.keys(dead).length;
console.log(`  ${n} dead link${n === 1 ? '' : 's'} recorded in data/dead-links.json`);
console.log('  run `npm run ingest` to keep them out of the dashboard');
