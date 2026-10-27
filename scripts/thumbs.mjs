/**
 * Take the posts and reels out of the reports and make thumbnails of them.
 *
 *   npm run thumbs            # the best campaigns for every client
 *   npm run thumbs -- --top 5 # how many per client
 *   npm run thumbs -- --client "NETFLIX INDIA"
 *
 * The work itself — the reels, the posts — only exists inside the decks. The
 * sheet has no link to a single piece of content, so the only way to show a
 * client what was made for them is to open the report and take the pictures
 * out.
 *
 * Only the best-performing campaigns are opened, because the reports run to
 * 136MB each and nobody needs a thumbnail of the 400th campaign. "Best" is
 * reach, which is the figure the sheet actually records.
 *
 * Output: public/thumbs/*.webp, and public/data/thumbs.json mapping each
 * campaign to its pictures. Both sit behind the sign-in gate, which is where
 * client work belongs.
 *
 * Needs GOOGLE_SERVICE_ACCOUNT_JSON and the reports shared with it.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { credentialsOrNull, downloadTo, driveId, driveToken, fileMeta } from './lib/drive.mjs';
import { extractImages, thumbnail } from './lib/extract.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const THUMB_DIR = path.join(ROOT, 'public/thumbs');
const INDEX = path.join(ROOT, 'public/data/thumbs.json');

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const TOP = Number(flag('top', 3));
const ONLY = flag('client', null);
const KEEP = Number(flag('keep', 4));
/** Past this a report is an archive, not a deck worth opening for a picture. */
const MAX_BYTES = Number(flag('max-mb', 150)) * 1024 * 1024;

const credentials = credentialsOrNull();
if (!credentials) {
  console.error(`
  This needs Drive access, which this machine does not have.

  The reels and posts are inside the reports, and the reports are private
  Drive files — none of the top-performing ones open without a login, so
  there is no way to read them anonymously.

  Set GOOGLE_SERVICE_ACCOUNT_JSON to a service-account key and share the
  report files with that account. Nothing was changed.`);
  process.exit(1);
}

const campaigns = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/campaigns.json'), 'utf8'));
const rows = Array.isArray(campaigns) ? campaigns : (campaigns.campaigns ?? campaigns.items ?? []);

/** The best campaigns per client: has a report, has a figure, highest reach. */
const byClient = new Map();
for (const c of rows) {
  if (!driveId(c.report) || !c.reach) continue;
  if (ONLY && c.client.toLowerCase() !== ONLY.toLowerCase()) continue;
  if (!byClient.has(c.client)) byClient.set(c.client, []);
  byClient.get(c.client).push(c);
}
const picked = [];
for (const [, list] of byClient) {
  list.sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0));
  picked.push(...list.slice(0, TOP));
}
picked.sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0));

console.log(`  ${picked.length} campaigns across ${byClient.size} clients`);
fs.mkdirSync(THUMB_DIR, { recursive: true });

let index = {};
try { index = JSON.parse(fs.readFileSync(INDEX, 'utf8')).campaigns ?? {}; } catch { /* first run */ }

const token = await driveToken(credentials);
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'wldd-thumbs-'));
let made = 0; let skipped = 0; let failed = 0;

for (const [i, c] of picked.entries()) {
  if (index[c.id]?.length) { skipped++; continue; }   // already done, resumable
  const id = driveId(c.report);
  const scratch = path.join(work, c.id);
  try {
    const meta = await fileMeta(id, token);
    if (!meta || meta.trashed) { failed++; continue; }
    if (Number(meta.size ?? 0) > MAX_BYTES) { skipped++; continue; }

    fs.mkdirSync(scratch, { recursive: true });
    const file = path.join(scratch, `report${path.extname(meta.name ?? '') || '.pdf'}`);
    await downloadTo(id, token, file, MAX_BYTES);

    const images = extractImages(file, path.join(scratch, 'raw'), meta.mimeType ?? '');
    const thumbs = thumbnail(images, THUMB_DIR, c.id, KEEP);
    if (thumbs.length) { index[c.id] = thumbs; made++; } else { failed++; }
  } catch {
    failed++;
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
  if (i % 10 === 0) process.stdout.write(`\r  ${i + 1}/${picked.length} — ${made} with pictures`);
}
process.stdout.write(`\r  ${picked.length}/${picked.length} — ${made} with pictures\n`);

fs.writeFileSync(INDEX, `${JSON.stringify({
  builtAt: new Date().toISOString().slice(0, 10),
  campaigns: index,
}, null, 2)}\n`);
fs.rmSync(work, { recursive: true, force: true });

console.log(`
  ${made} campaigns gained thumbnails
  ${skipped} skipped (already done, or the report is too big to open)
  ${failed} had nothing usable inside

  → public/thumbs/ and public/data/thumbs.json`);
