/**
 * The property the daily refresh depends on.
 *
 * Google re-serialises date cells on every export — 2/8/2025 one day,
 * 02/08/2025 the next — for the same underlying date. Measured against two real
 * exports five days apart, that churn touched 458 rows while the data was
 * unchanged.
 *
 * The refresh workflow therefore commits on a diff of the NORMALISED JSON, not
 * the raw CSV. That is only safe while ingest maps both spellings to the same
 * ISO date. This asserts it: flip the padding on every date cell, re-ingest,
 * and the output must be byte-identical.
 *
 * If this fails, the workflow will either commit noise every morning or, worse,
 * start skipping real updates.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import Papa from 'papaparse';

const ROOT = path.join(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'data', 'campaigns.csv');
const OUT = path.join(ROOT, 'public', 'data', 'campaigns.json');
const DATE_COLS = ['Approved At', 'Start Date', 'End Date'];

let failed = 0;
let passed = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ok   ${name}`); passed++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); failed++; }
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wldd-stability-'));
const ingest = (csv) => {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'ingest.mjs'), csv], { stdio: 'ignore' });
  return fs.readFileSync(OUT);
};

console.log('\nIngest stability');

check('date re-serialisation produces identical output', () => {
  const original = fs.readFileSync(SRC, 'utf8');
  const lines = original.split(/\r?\n/);
  const at = lines.findIndex((l) => /^Industry,Client,Campaign Name/i.test(l));
  const parsed = Papa.parse(lines.slice(at < 0 ? 0 : at).join('\n'), {
    header: true, skipEmptyLines: 'greedy',
  });

  let flipped = 0;
  for (const row of parsed.data) {
    for (const col of DATE_COLS) {
      const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((row[col] ?? '').trim());
      if (!m) continue;
      const d = m[1].length === 2 ? String(+m[1]) : m[1].padStart(2, '0');
      const mo = m[2].length === 2 ? String(+m[2]) : m[2].padStart(2, '0');
      row[col] = `${d}/${mo}/${m[3]}`;
      flipped++;
    }
  }
  if (flipped < 100) throw new Error(`only ${flipped} date cells found to flip`);

  const churned = path.join(tmp, 'churned.csv');
  fs.writeFileSync(churned, Papa.unparse(parsed.data, { columns: parsed.meta.fields }));

  const a = ingest(SRC);
  const b = ingest(churned);
  if (!a.equals(b)) {
    throw new Error('normalised output changed after re-serialising dates — '
      + 'the refresh workflow would commit noise every day');
  }
  console.log(`       ${flipped} date cells flipped, output unchanged`);
});

check('a real row change is still detected', () => {
  const lines = fs.readFileSync(SRC, 'utf8').split(/\r?\n/);
  const at = lines.findIndex((l) => /^Industry,Client,Campaign Name/i.test(l));
  const parsed = Papa.parse(lines.slice(at < 0 ? 0 : at).join('\n'), {
    header: true, skipEmptyLines: 'greedy',
  });
  parsed.data[0]['Achieved Reach'] = '999 Million';

  const edited = path.join(tmp, 'edited.csv');
  fs.writeFileSync(edited, Papa.unparse(parsed.data, { columns: parsed.meta.fields }));

  if (ingest(SRC).equals(ingest(edited))) {
    throw new Error('an edited figure produced identical output — real updates would be skipped');
  }
});

check('the change gate ignores the daily timestamp', () => {
  // The workflow gates on campaigns.json alone. meta.json carries generatedAt,
  // which differs on every run, so including it would commit and redeploy every
  // morning regardless of the data. This pins both halves of that: the campaign
  // file must carry no wall-clock field, and meta must be the only file that does.
  ingest(SRC);
  const campaigns = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  const stamped = Object.keys(campaigns[0])
    .filter((k) => /generat|fetched|stamp|ranAt|updatedAt/i.test(k));
  if (stamped.length) {
    throw new Error(`campaigns.json carries a run timestamp (${stamped.join(', ')}) — `
      + 'the gate would fire every day');
  }
  const meta = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'public', 'data', 'meta.json'), 'utf8'));
  if (!meta.generatedAt) {
    throw new Error('meta.generatedAt is gone; the workflow comment explaining '
      + 'why the gate excludes meta.json is now misleading');
  }
});

// Leave the committed data as it was found.
ingest(SRC);
fs.rmSync(tmp, { recursive: true, force: true });

if (failed) { console.log(`\n${failed} stability check(s) failed`); process.exit(1); }
console.log(`  ${passed} passed`);
