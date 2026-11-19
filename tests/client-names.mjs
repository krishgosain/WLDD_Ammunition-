/**
 * Client names the sheet glues together.
 *
 * The Client column carries legal names pasted out of an invoicing system:
 * DENTSUADVERTISINGANDMEDIASERVICESINDIAPRIVATELIMITED is one word to every
 * renderer there is, so it reads as noise on the board and as noise in the CSV
 * someone is working a call list from.
 *
 * Ungluing them is display only, and the line it must not cross is inventing a
 * company: a break nobody can prove belongs to the sheet, not to a word list.
 * These cases pin both halves — what gets unglued, and what is left exactly as
 * the sheet typed it.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import Papa from 'papaparse';

const ROOT = path.join(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'data', 'campaigns.csv');
const OUT = path.join(ROOT, 'public', 'data', 'campaigns.json');

let failed = 0; let passed = 0;
const check = (name, cond, detail = '') => {
  if (cond) { console.log(`  ok   ${name}`); passed++; }
  else { console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`); failed++; }
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wldd-names-'));

const raw = fs.readFileSync(SRC, 'utf8').split(/\r?\n/);
const at = raw.findIndex((l) => /^Industry,Client,Campaign Name/i.test(l));
const sheet = Papa.parse(raw.slice(at < 0 ? 0 : at).join('\n'), {
  header: true, skipEmptyLines: 'greedy',
});

/**
 * Run ingest over a sheet whose Client column is ours.
 *
 * Built from real rows so the schema is the real schema, and run with
 * --lenient because a cut-down sheet will not contain the campaigns
 * data/corrections.json names.
 */
function ingest(clients) {
  const rows = clients.map((client, i) => ({
    ...sheet.data[i], Client: client, 'Campaign Name': `FIXTURE ${i}`,
  }));
  const file = path.join(tmp, 'fixture.csv');
  fs.writeFileSync(file, Papa.unparse(rows, { columns: sheet.meta.fields }));
  execFileSync(process.execPath,
    [path.join(ROOT, 'scripts', 'ingest.mjs'), file, '--lenient'], { stdio: 'ignore' });
  const out = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  return new Map(out.map((c) => [c.name, c.client]));
}

console.log('\nClient names');

const shown = ingest([
  // Listed by hand in data/client-names.json, because the brand spelling
  // cannot be derived from anything: SCHBANG is not a word.
  'SCHBANGDIGITALSOLUTIONSPVTLTD',
  "MASTERS'UNION",
  // Nothing listed, every piece a word ingest knows: split on its own.
  'GLOBALMEDIASOLUTIONSPRIVATELIMITED',
  // A brand nobody has spelled out. Guessing the break would invent a
  // company, so the sheet's own string survives untouched.
  'ZORBLATMEDIAPVTLTD',
  // Short and shouting is how these brands write themselves.
  'ACKO',
  'ZEE5',
  // Already readable: capitals are the sheet's business, not ours.
  'TATA MOTORS PASSENGER VEHICLES LIMITED',
  'Big Bang Social',
  // The same company, typed glued. Grouping has never cared about spacing, so
  // this must not become a second client.
  'BIGBANGSOCIAL',
  // A word the sheet itself spells out one row earlier teaches the splitter.
  'Mango Chutney Films',
  'MANGOCHUTNEYMEDIA',
]);

check('a listed legal name is unglued',
  shown.get('FIXTURE 0') === 'Schbang Digital Solutions Pvt Ltd', shown.get('FIXTURE 0'));
check('punctuation in a listed name survives',
  shown.get('FIXTURE 1') === "Masters' Union", shown.get('FIXTURE 1'));
check('a name made only of known words splits on its own',
  shown.get('FIXTURE 2') === 'Global Media Solutions Private Limited', shown.get('FIXTURE 2'));
check('an unknown brand is left exactly as the sheet typed it',
  shown.get('FIXTURE 3') === 'ZORBLATMEDIAPVTLTD', shown.get('FIXTURE 3'));
check('a short shouting brand is left alone',
  shown.get('FIXTURE 4') === 'ACKO' && shown.get('FIXTURE 5') === 'ZEE5',
  `${shown.get('FIXTURE 4')} / ${shown.get('FIXTURE 5')}`);
check('capitals with spaces are already readable and stay',
  shown.get('FIXTURE 6') === 'TATA MOTORS PASSENGER VEHICLES LIMITED', shown.get('FIXTURE 6'));
check('a glued spelling folds into the readable one, as it always did',
  shown.get('FIXTURE 7') === 'Big Bang Social' && shown.get('FIXTURE 8') === 'Big Bang Social',
  `${shown.get('FIXTURE 7')} / ${shown.get('FIXTURE 8')}`);
check('words the sheet spells out elsewhere are words the splitter knows',
  shown.get('FIXTURE 10') === 'Mango Chutney Media', shown.get('FIXTURE 10'));

// A name nobody can read must not pass quietly. The report is the channel the
// refresh already uses for near-duplicates and dead links: it never halts the
// pipeline, because a new legal name in the sheet should not stop that
// morning's campaign updates from reaching the app.
const log = execFileSync(process.execPath,
  [path.join(ROOT, 'scripts', 'ingest.mjs'), path.join(tmp, 'fixture.csv'), '--lenient'],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
check('a name it cannot read is reported, not swallowed',
  /glues together and nothing here can read/.test(log) && /ZORBLATMEDIAPVTLTD/.test(log));
check('and the ones it did unglue are shown with what they became',
  /Client names unglued\s+\d/.test(log) && /GLOBALMEDIASOLUTIONSPRIVATELIMITED\s+→\s+Global Media/.test(log));

// Where today's sheet stands. Printed, never asserted: tomorrow's export may
// carry a legal name nobody has written out yet, and that is the report's job
// to raise, not the build's job to fail on.
const live = ingest([...new Set(sheet.data.map((r) => (r.Client ?? '').trim()).filter(Boolean))]);
const stillGlued = [...new Set(live.values())]
  .filter((n) => n.length >= 10 && !/\s/.test(n) && n === n.toUpperCase());
console.log(`       ${new Set(live.values()).size} client names in the sheet, `
  + (stillGlued.length ? `${stillGlued.length} still glued: ${stillGlued.join(', ')}` : 'none glued'));

// Leave the committed data as it was found.
execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'ingest.mjs'), SRC], { stdio: 'ignore' });
fs.rmSync(tmp, { recursive: true, force: true });

if (failed) { console.log(`\n${failed} name check(s) failed`); process.exit(1); }
console.log(`  ${passed} passed`);
