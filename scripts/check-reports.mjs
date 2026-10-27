/**
 * Look inside every report and say which ones are empty.
 *
 *   npm run reports
 *
 * The HTTP sweep in check-links.mjs can only see whether a URL answers. It
 * cannot tell a real deck from a one-page placeholder, because 1,447 of the
 * reports answer 401 to anyone outside WLDD. This asks Drive directly, as a
 * service account, and so can see what the file actually is: whether it
 * exists, whether it is in the bin, what type it is and how big it is.
 *
 * "Has content" is judged conservatively. A missing file and a file in the
 * bin are certain. Beyond that only emptiness is claimed — a zero-byte file,
 * or a deck so small it cannot hold a report — because a thin file is not
 * necessarily a bad one and wrongly hiding real work is the worse error.
 *
 * Findings are written into data/dead-links.json, which the ingest already
 * reads as a blocklist, so an empty report stops reaching the dashboard on
 * the next refresh.
 *
 * Needs GOOGLE_SERVICE_ACCOUNT_JSON, and the reports shared with that service
 * account. Without it the script says so and changes nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { credentialsOrNull, driveId, driveToken, fileMeta } from './lib/drive.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'data/dead-links.json');
const CONCURRENCY = 8;

/** A PDF or deck below this cannot be a campaign report. */
const MIN_REPORT_BYTES = 30 * 1024;

const credentials = credentialsOrNull();
if (!credentials) {
  console.error(`
  This needs Drive access, which this machine does not have.

  Set GOOGLE_SERVICE_ACCOUNT_JSON to a service-account key, and share the
  report files (or the folder holding them) with that account's address.
  The same credential the sheet fetcher already uses works here.

  Nothing was changed.`);
  process.exit(1);
}

const campaigns = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/campaigns.json'), 'utf8'));
const rows = Array.isArray(campaigns) ? campaigns : (campaigns.campaigns ?? campaigns.items ?? []);

/** One entry per Drive file, with the campaigns that point at it. */
const byId = new Map();
for (const c of rows) {
  const id = driveId(c.report);
  if (!id) continue;
  if (!byId.has(id)) byId.set(id, { url: c.report, labels: [] });
  byId.get(id).labels.push(`${c.client} — ${c.name}`);
}

const token = await driveToken(credentials);
const ids = [...byId.keys()];
console.log(`  checking ${ids.length} Drive reports`);

const verdicts = new Map();
const kinds = { missing: 0, binned: 0, empty: 0, thin: 0, ok: 0, unreadable: 0 };

async function judge(id) {
  let meta;
  try { meta = await fileMeta(id, token); }
  catch { kinds.unreadable++; return; }   // say nothing rather than something wrong

  if (meta === null) { kinds.missing++; verdicts.set(id, 'the file is gone from Drive'); return; }
  if (meta.trashed) { kinds.binned++; verdicts.set(id, 'the file is in the Drive bin'); return; }

  const size = Number(meta.size ?? 0);
  const isDoc = (meta.mimeType ?? '').startsWith('application/vnd.google-apps');
  if (!isDoc && size === 0) { kinds.empty++; verdicts.set(id, 'the file is empty (0 bytes)'); return; }
  if (!isDoc && size > 0 && size < MIN_REPORT_BYTES) {
    kinds.thin++; verdicts.set(id, `the file holds almost nothing (${Math.round(size / 1024)}kB)`); return;
  }
  kinds.ok++;
}

for (let i = 0; i < ids.length; i += CONCURRENCY) {
  await Promise.all(ids.slice(i, i + CONCURRENCY).map(judge));
  if (i % 160 === 0) process.stdout.write(`\r  ${Math.min(i + CONCURRENCY, ids.length)}/${ids.length}`);
}
process.stdout.write(`\r  ${ids.length}/${ids.length}\n`);

// Fold into the blocklist, keeping anything the HTTP sweep found.
let existing = { links: {} };
try { existing = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { /* first run */ }
const links = { ...(existing.links ?? {}) };
for (const [id, why] of verdicts) links[byId.get(id).url] = why;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify({
  ...existing,
  inspectedAt: new Date().toISOString().slice(0, 10),
  inspected: ids.length,
  links,
}, null, 2)}\n`);

console.log(`
  real reports        ${kinds.ok}
  gone from Drive     ${kinds.missing}
  in the bin          ${kinds.binned}
  empty (0 bytes)     ${kinds.empty}
  holds almost nothing ${kinds.thin}
  could not read      ${kinds.unreadable}

  ${verdicts.size} report${verdicts.size === 1 ? '' : 's'} recorded in data/dead-links.json`);
if (verdicts.size) {
  console.log('\n  The campaigns behind them (they keep their figures, they just show no report):');
  for (const [id, why] of [...verdicts].slice(0, 40)) {
    for (const label of byId.get(id).labels) console.log(`    · ${label} — ${why}`);
  }
}
console.log('\n  run `npm run ingest` to keep them out of the dashboard');
