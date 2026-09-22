/**
 * Ingest — turns the exported BD Ammo sheet into the JSON the app ships with.
 *
 *   npm run ingest              reads data/campaigns.csv
 *   npm run ingest -- other.csv
 *
 * Writes src/data/campaigns.json + src/data/meta.json and prints a data-quality
 * report. Runs at build time only; PapaParse never reaches the browser.
 *
 * Figures are read exactly as the sheet writes them. "235747 Thousand" is
 * 235,747,000 because that is what the sheet says and WLDD has confirmed those
 * are real numbers. Outliers are listed in the health report for review at
 * source; nothing here infers a correction.
 *
 * The one exception is data/corrections.json — figures WLDD has explicitly
 * confirmed and asked to override. Those are applied by hand, never by rule,
 * and every one is listed in the health report with the string it replaced.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ------------------------------------------------------------------ columns */

const COLS = {
  industry: ['industry'],
  client: ['client', 'brand'],
  name: ['campaign name', 'campaign'],
  objective: ['objective'],
  services: ['services', 'service'],
  status: ['status'],
  lead: ['lead', 'owner'],
  approvedAt: ['approved at', 'approved'],
  startDate: ['start date'],
  endDate: ['end date'],
  deliverables: ['deliverable', 'deliverables'],
  promisedReach: ['promised reach'],
  promisedEng: ['promised engagement'],
  achievedReach: ['achieved reach'],
  achievedEng: ['achieved engagement'],
  report: ['report', 'report link', 'case study'],
  clientId: ['client_id', 'client id'],
};

function pick(row, keys) {
  for (const k of keys) {
    const hit = Object.keys(row).find((h) => h.trim().toLowerCase() === k);
    if (hit && String(row[hit] ?? '').trim() !== '') return String(row[hit]).trim();
  }
  return '';
}

/* ------------------------------------------------------------- normalisers */

/** Collapse tabs and runs of whitespace — the sheet has "Pradheeksha\tBoopathy". */
const tidy = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** "22 Million" -> 22000000. "3.5 Million" -> 3500000. Bare numbers pass through. */
function parseNum(raw) {
  const t = String(raw ?? '').trim().replace(/,/g, '');
  if (!t) return null;
  const m = t.match(/^([\d.]+)\s*(million|thousand|mn|bn|billion|k|cr|crore|lakh|l|m|b)?$/i);
  if (!m) return null;
  const v = parseFloat(m[1]);
  if (!Number.isFinite(v)) return null;
  const u = (m[2] || '').toLowerCase();
  const mult =
    /^(billion|bn|b)$/.test(u) ? 1e9 :
    /^(million|mn|m)$/.test(u) ? 1e6 :
    /^(crore|cr)$/.test(u) ? 1e7 :
    /^(lakh|l)$/.test(u) ? 1e5 :
    /^(thousand|k)$/.test(u) ? 1e3 : 1;
  return v * mult;
}

/** dd/mm/yyyy, d/m/yyyy and yyyy-mm-dd all appear in the sheet. */
function parseDate(raw) {
  const t = String(raw ?? '').trim();
  if (!t) return '';
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return iso(+m[3], +m[2], +m[1]);
  return '';
}
function iso(y, mo, d) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Only real, openable links become clickable. "na", "cr", blanks do not. */
function parseUrl(raw) {
  const t = String(raw ?? '').trim();
  if (!t || !/^https?:\/\//i.test(t)) return null;
  try {
    const u = new URL(t);
    if (!u.hostname.includes('.') || /^na(\.com)?$/i.test(u.hostname)) return null;
    return u.href;
  } catch { return null; }
}

/* -------------------------------------------------------------- taxonomies */

const SERVICE_CANON = {
  'amplification': 'Amplification',
  'influencers': 'Influencers',
  'influencer': 'Influencers',
  'orm': 'ORM',
  'memed': "Meme'd",
  'solo': 'SOLO',
  'twitter trend': 'Twitter Trend',
  'offline activity': 'Offline Activity',
  'seeding': 'Seeding',
  'production': 'Production',
  'advanced campaign analytics': 'Campaign Analytics',
  'content creation /illustration work': 'Content Creation',
  'content creation/illustration work': 'Content Creation',
  'content creation': 'Content Creation',
  'dp': 'DP Pages',
  'miscl': 'Miscellaneous',
};

/** Industry-column values that describe the *counterparty*, not a vertical. */
const NON_INDUSTRY = {
  agency: 'Agency',
  person: 'Individual',
  others: 'Unclassified',
  other: 'Unclassified',
  '': 'Unclassified',
};

/* --------------------------------------------------------------------- run */

// Flags and the optional CSV path share argv, so separate them before either
// is used — otherwise `--lenient` gets resolved as a filename.
const flags = process.argv.slice(2).filter((a) => a.startsWith('-'));
const positional = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const lenient = flags.includes('--lenient') || process.env.INGEST_LENIENT === '1';

const csvPath = positional[0]
  ? path.resolve(positional[0])
  : path.join(ROOT, 'data', 'campaigns.csv');

if (!fs.existsSync(csvPath)) {
  console.error(`\n  No CSV at ${csvPath}`);
  console.error('  Export the BD Ammo sheet to data/campaigns.csv and re-run.\n');
  process.exit(1);
}

/** client + campaign, normalised, so a stray double space cannot miss a match. */
const keyOf = (client, campaign) =>
  `${tidy(client).toLowerCase()}\u0000${tidy(campaign).toLowerCase()}`;

const correctionsPath = path.join(ROOT, 'data', 'corrections.json');
const corrections = new Map();
if (fs.existsSync(correctionsPath)) {
  const parsedCorrections = JSON.parse(fs.readFileSync(correctionsPath, 'utf8'));
  for (const c of parsedCorrections.corrections ?? []) {
    corrections.set(keyOf(c.client, c.campaign), { ...c, applied: false });
  }
}

const text = fs.readFileSync(csvPath, 'utf8');
// The sheet carries two spacer rows above the real header.
const lines = text.split(/\r?\n/);
const headerAt = lines.findIndex((l) => /^Industry,Client,Campaign Name/i.test(l));
const body = headerAt > 0 ? lines.slice(headerAt).join('\n') : text;

const parsed = Papa.parse(body, { header: true, skipEmptyLines: 'greedy' });

const health = {
  skipped: 0, noReport: 0, noFigures: 0, badDate: 0,
  unclassified: 0, engOverReach: [], duplicatedFigures: [], extremeReach: [],
  unknownServices: new Set(), corrected: [],
};

/** LICIOUS / Licious are one client — fold case, keep the most common spelling. */
const spellings = new Map();
for (const row of parsed.data) {
  const c = tidy(pick(row, COLS.client));
  if (!c) continue;
  const k = c.toLowerCase();
  if (!spellings.has(k)) spellings.set(k, new Map());
  const m = spellings.get(k);
  m.set(c, (m.get(c) ?? 0) + 1);
}
const canonClient = new Map();
for (const [k, m] of spellings) {
  // Prefer the most frequent spelling; break ties toward Title Case over ALL CAPS.
  const best = [...m.entries()].sort((a, b) =>
    b[1] - a[1] || (a[0] === a[0].toUpperCase() ? 1 : -1))[0][0];
  canonClient.set(k, best);
}

const campaigns = [];
parsed.data.forEach((row, i) => {
  const client = tidy(pick(row, COLS.client));
  const name = tidy(pick(row, COLS.name));
  if (!client && !name) { health.skipped++; return; }

  const industryRaw = tidy(pick(row, COLS.industry));
  const key = industryRaw.toLowerCase();
  const isVertical = !(key in NON_INDUSTRY);
  const clientType = isVertical ? 'Brand' : NON_INDUSTRY[key];
  const industry = isVertical && industryRaw ? industryRaw : 'Unclassified';
  if (!isVertical) health.unclassified++;

  const services = pick(row, COLS.services)
    .split(',').map(tidy).filter(Boolean)
    .map((s) => {
      // "OLD-AMPLIFICATION" is the same service under a retired label.
      const legacy = /^old-/i.test(s);
      const base = s.replace(/^old-/i, '').toLowerCase();
      const canon = SERVICE_CANON[base];
      if (!canon) health.unknownServices.add(s);
      return { name: canon ?? tidy(s), legacy };
    });

  const rawReach = pick(row, COLS.achievedReach);
  const rawEng = pick(row, COLS.achievedEng);
  let reach = parseNum(rawReach);
  let eng = parseNum(rawEng);
  const promisedReach = parseNum(pick(row, COLS.promisedReach));
  const promisedEng = parseNum(pick(row, COLS.promisedEng));

  // Explicit, hand-confirmed overrides. Applied before anything downstream so
  // aggregates, sorts and the 3D field all see the corrected figure.
  const fix = corrections.get(keyOf(client, name));
  let corrected = null;
  if (fix) {
    fix.applied = true;
    corrected = { note: fix.note ?? '', was: {}, now: {} };
    if (typeof fix.reach === 'number') {
      corrected.was.reach = rawReach; corrected.now.reach = fix.reach; reach = fix.reach;
    }
    if (typeof fix.eng === 'number') {
      corrected.was.eng = rawEng; corrected.now.eng = fix.eng; eng = fix.eng;
    }
    health.corrected.push({ label: `${client} — ${name}`, ...corrected });
  }

  const date = parseDate(pick(row, COLS.startDate)) || parseDate(pick(row, COLS.approvedAt));
  const endDate = parseDate(pick(row, COLS.endDate));
  if (!date) health.badDate++;

  const report = parseUrl(pick(row, COLS.report));
  if (!report) health.noReport++;
  if (reach === null && eng === null) health.noFigures++;

  const label = `${client} — ${name}`;
  if (reach !== null && eng !== null && eng > reach) health.engOverReach.push(label);
  if (reach !== null && eng !== null && reach === eng) health.duplicatedFigures.push(label);
  if (reach !== null && reach > 2e9) {
    health.extremeReach.push({ label, reach, raw: pick(row, COLS.achievedReach) });
  }

  const status = tidy(pick(row, COLS.status)) || 'Unknown';
  const lead = tidy(pick(row, COLS.lead)) || '—';
  const objective = tidy(pick(row, COLS.objective));
  const serviceNames = services.map((s) => s.name);

  campaigns.push({
    id: `c${i}`,
    client: canonClient.get(client.toLowerCase()) ?? client ?? '—',
    clientId: tidy(pick(row, COLS.clientId)),
    name: name || 'Untitled campaign',
    objective,
    industry,
    isVertical: isVertical && Boolean(industryRaw),
    clientType,
    services: serviceNames.length ? serviceNames : ['Unspecified'],
    legacyServices: services.filter((s) => s.legacy).map((s) => s.name),
    status,
    lead,
    date,
    endDate,
    year: date ? +date.slice(0, 4) : null,
    deliverables: parseNum(pick(row, COLS.deliverables)),
    reach, eng, promisedReach, promisedEng,
    /** True when data/corrections.json supplied this figure. */
    corrected: Boolean(corrected),
    reachRatio: reach !== null && promisedReach ? reach / promisedReach : null,
    engRatio: eng !== null && promisedEng ? eng / promisedEng : null,
    report,
  });
});

/* ------------------------------------------------------------------- meta */

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const byCount = (a, b) => b.count - a.count || a.value.localeCompare(b.value);

function facet(getValues) {
  const m = new Map();
  for (const c of campaigns) for (const v of getValues(c)) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].map(([value, count]) => ({ value, count })).sort(byCount);
}

const clients = (() => {
  const m = new Map();
  for (const c of campaigns) {
    if (!m.has(c.client)) {
      m.set(c.client, {
        name: c.client, count: 0, reach: 0, eng: 0,
        industries: new Set(), services: new Set(), first: '', last: '', withReport: 0,
      });
    }
    const d = m.get(c.client);
    d.count++;
    d.reach += c.reach ?? 0;
    d.eng += c.eng ?? 0;
    if (c.isVertical) d.industries.add(c.industry);
    c.services.forEach((s) => d.services.add(s));
    if (c.report) d.withReport++;
    if (c.date) {
      if (!d.first || c.date < d.first) d.first = c.date;
      if (!d.last || c.date > d.last) d.last = c.date;
    }
  }
  return [...m.values()]
    .map((d) => ({ ...d, industries: [...d.industries], services: [...d.services] }))
    .sort((a, b) => b.count - a.count);
})();

const verticals = facet((c) => (c.isVertical ? [c.industry] : []));
const reachOf = (c) => c.reach ?? 0;

/** Where the portfolio has no quotable proof. Printed in the report below. */
const GAP_BAR = 10e6;
const gaps = verticals.map(({ value, count }) => {
  const inV = campaigns.filter((c) => c.industry === value);
  const withFigures = inV.filter((c) => c.reach !== null);
  const best = withFigures.length ? Math.max(...withFigures.map(reachOf)) : 0;
  return {
    industry: value, count, best,
    above: withFigures.filter((c) => reachOf(c) >= GAP_BAR).length,
    withReport: inV.filter((c) => c.report).length,
    coverage: inV.length ? withFigures.length / inV.length : 0,
  };
}).sort((a, b) => a.best - b.best);

const meta = {
  generatedAt: new Date().toISOString().slice(0, 10),
  totals: {
    campaigns: campaigns.length,
    clients: clients.length,
    industries: verticals.length,
    reach: sum(campaigns.map(reachOf)),
    eng: sum(campaigns.map((c) => c.eng ?? 0)),
    deliverables: sum(campaigns.map((c) => c.deliverables ?? 0)),
    withReport: campaigns.filter((c) => c.report).length,
    years: [...new Set(campaigns.map((c) => c.year).filter(Boolean))].sort(),
  },
  facets: {
    industries: verticals,
    services: facet((c) => c.services),
    statuses: facet((c) => [c.status]),
    clientTypes: facet((c) => [c.clientType]),
    leads: facet((c) => [c.lead]),
    clients: clients.map((c) => ({ value: c.name, count: c.count })),
  },
  clients,
};

// `gaps` and the health detail are still computed, because the report below is
// how data problems get noticed — but nothing in the app reads them, so they
// are not shipped to the browser.

// Served as static assets rather than bundled into JS: a 2MB module is parsed
// on the main thread before anything paints, whereas a fetched JSON file is
// cacheable, parsed natively and downloads in parallel with the bundle.
// A stale override is a hard error locally, because it means a correction is
// silently doing nothing. On the daily refresh it is only a warning: the sheet
// is the source of truth, an override that no longer matches simply does not
// apply, and halting the pipeline over a dead entry would stop real campaign
// updates from reaching the app.
const stale = [...corrections.values()].filter((c) => !c.applied);
if (stale.length) {
  const say = lenient ? console.warn : console.error;
  say(`\n  ${lenient ? 'WARNING: ' : ''}Corrections in data/corrections.json match no row:`);
  stale.forEach((c) => say(`    · ${c.client} — ${c.campaign}`));
  say('  Either the campaign was renamed in the sheet, or the fix has');
  say('  landed at source and the entry should be deleted.\n');
  if (!lenient) process.exit(1);
}

const out = path.join(ROOT, 'public', 'data');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'campaigns.json'), JSON.stringify(campaigns));
fs.writeFileSync(path.join(out, 'meta.json'), JSON.stringify(meta));

/* ----------------------------------------------------------------- report */

const pct = (n) => `${((n / campaigns.length) * 100).toFixed(1)}%`;
const L = (k, v) => console.log(`    ${k.padEnd(26)}${v}`);
console.log(`\n  ${campaigns.length} campaigns · ${clients.length} clients · ${verticals.length} verticals`);
if (health.skipped) console.log(`  ${health.skipped} empty rows skipped`);
console.log('\n  Data health');
L('No report link', `${health.noReport} (${pct(health.noReport)})`);
L('No figures filed', `${health.noFigures} (${pct(health.noFigures)})`);
L('Industry unclassified', `${health.unclassified} (${pct(health.unclassified)})`);
L('Unparseable date', health.badDate);
L('Engagement > reach', health.engOverReach.length);
L('Reach === engagement', health.duplicatedFigures.length);
L('Reach above 2B', health.extremeReach.length);
L('Figures corrected', health.corrected.length);
health.extremeReach.slice(0, 5).forEach((e) =>
  console.log(`      · ${e.label} — sheet reads "${e.raw}"`));
if (health.unknownServices.size) {
  console.log('\n  Unmapped service codes (add to SERVICE_CANON):');
  [...health.unknownServices].forEach((s) => console.log(`      · ${s}`));
}

// The thinnest shelves: verticals with no quotable proof. Surfaced here rather
// than in the app, so BD hears about it when the data is refreshed.
const thin = gaps.filter((g) => g.best < GAP_BAR);
if (thin.length) {
  console.log(`\n  Verticals with nothing above ${GAP_BAR / 1e6}M`);
  thin.forEach((g) => console.log(
    `    ${g.industry.padEnd(30)}${g.count} campaigns · best ${(g.best / 1e6).toFixed(1)}M`));
}
console.log(`\n  → public/data/campaigns.json + meta.json\n`);
