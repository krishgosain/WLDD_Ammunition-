/**
 * Search engine checks, run against the real archive.
 *   npm test
 */
import fs from 'node:fs';
import path from 'node:path';
import { search, buildVocabulary, parseQuery } from '../src/lib/search';
import { EMPTY_FILTERS, type Campaign, type Meta } from '../src/lib/types';

const D = path.join(process.cwd(), 'public', 'data');
const rows = JSON.parse(fs.readFileSync(path.join(D, 'campaigns.json'), 'utf8'));
const meta: Meta = JSON.parse(fs.readFileSync(path.join(D, 'meta.json'), 'utf8'));
const ALL: Campaign[] = rows.map((c: Omit<Campaign, 'search'>) => ({
  ...c,
  search: `${c.client} ${c.name} ${c.objective} ${c.industry} ${c.services.join(' ')} ${c.lead} ${c.status}`.toLowerCase(),
}));
const vocab = buildVocabulary(meta);

let pass = 0; const fails: string[] = [];
function check(name: string, fn: () => void) {
  try { fn(); pass++; console.log(`  ok   ${name}`); }
  catch (e) { fails.push(name); console.log(`  FAIL ${name}\n       ${(e as Error).message}`); }
}
const assert = (cond: unknown, msg: string) => { if (!cond) throw new Error(msg); };
const run = (q: string, f = EMPTY_FILTERS) => search(ALL, q, f, 'relevance', vocab);

console.log('\nTypo tolerance');
for (const [typo, want] of [
  ['finech', 'Finance'], ['fintec', 'Finance'], ['cosmetis', 'Cosmetics & Skin Care'],
  ['beuty', 'Cosmetics & Skin Care'], ['automobil', 'Automobile'], ['edtec', 'Edtech'],
  ['fashio', 'Fashion'], ['helthcare', 'Healthcare'], ['ecommerse', 'E-commerce'],
] as const) {
  check(`"${typo}" resolves ${want}`, () => {
    const r = run(typo);
    assert(r.query.industries.includes(want),
      `got industries ${JSON.stringify(r.query.industries)}, corrections ${JSON.stringify(r.query.corrections)}`);
    assert(r.items.length > 0, 'no results');
  });
}

console.log('\nMisspelt service and client names');
check('"amplificaton" resolves Amplification', () => {
  const r = run('amplificaton');
  assert(r.query.services.includes('Amplification'), JSON.stringify(r.query.services));
});
check('"influencor" resolves Influencers', () => {
  const r = run('influencor');
  assert(r.query.services.includes('Influencers'), JSON.stringify(r.query.services));
});
check('"razorpey" resolves Razorpay', () => {
  const r = run('razorpey');
  assert(r.query.clients.some((c) => /razorpay/i.test(c)), JSON.stringify(r.query.clients));
  assert(r.items.length > 0, 'no results');
});
check('"netflx" resolves Netflix India', () => {
  const r = run('netflx');
  assert(r.query.clients.some((c) => /netflix/i.test(c)), JSON.stringify(r.query.clients));
});
check('a correction is always reported, never silent', () => {
  const r = run('finech');
  assert(r.query.corrections.length > 0, 'no correction recorded');
  assert(r.query.corrections[0].from === 'finech', JSON.stringify(r.query.corrections));
});

console.log('\nCompound queries');
check('"any amplification done for Myntra above 20M reach"', () => {
  const r = run('any amplification done for Myntra above 20M reach');
  assert(r.query.services.includes('Amplification'), `services ${JSON.stringify(r.query.services)}`);
  assert(r.query.clients.includes('MYNTRA'), `clients ${JSON.stringify(r.query.clients)}`);
  assert(r.query.reachMin === 20e6, `reachMin ${r.query.reachMin}`);
  for (const c of r.items) {
    assert(c.client === 'MYNTRA', `leaked client ${c.client}`);
    assert(c.services.includes('Amplification'), `leaked service on ${c.name}`);
    assert((c.reach ?? 0) >= 20e6 || r.shortfall !== null, `under floor: ${c.reach}`);
  }
  console.log(`       → ${r.items.length} results, shortfall=${Boolean(r.shortfall)}`);
});
check('"ORM work for a food delivery brand in 2026"', () => {
  const r = run('ORM work for a food delivery brand in 2026');
  assert(r.query.services.includes('ORM'), JSON.stringify(r.query.services));
  assert(r.query.industries.includes('Restaurants and food delivery'), JSON.stringify(r.query.industries));
  assert(r.query.year === 2026, String(r.query.year));
  for (const c of r.items) assert(c.year === 2026, `year leak ${c.year}`);
});
check('"influencer campaigns for JioHotstar"', () => {
  const r = run('influencer campaigns for JioHotstar');
  assert(r.query.clients.includes('JioHotstar'), JSON.stringify(r.query.clients));
  assert(r.query.services.includes('Influencers'), JSON.stringify(r.query.services));
});
check('noise words leave no stray terms', () => {
  const r = run('show me any work we did for Zepto');
  assert(r.query.terms.length === 0, `leftover terms ${JSON.stringify(r.query.terms)}`);
  assert(r.query.clients.includes('Zepto'), JSON.stringify(r.query.clients));
});
check('a stopword never resolves as a client', () => {
  // "brand" appears inside several client names; a bare "brand" once ANDed
  // three of them into the query and returned nothing.
  const r = run('cosmetic brand with 30M+ reach');
  assert(r.query.clients.length === 0, `clients leaked: ${JSON.stringify(r.query.clients)}`);
  assert(r.query.industries.includes('Cosmetics & Skin Care'), JSON.stringify(r.query.industries));
  assert(r.query.reachMin === 30e6, `reachMin ${r.query.reachMin}`);
  assert(r.items.length > 0, 'no results for a query that has answers');
  console.log(`       → ${r.items.length} results`);
});
check('other stopwords stay inert too', () => {
  for (const q of ['work for us', 'show me the best campaigns', 'any media company']) {
    const p = run(q).query;
    assert(p.clients.length === 0, `${q} leaked clients ${JSON.stringify(p.clients)}`);
  }
});
check('a stopword inside a real phrase still resolves', () => {
  const r = run('"bombay sweet shop"');
  assert(r.items.length > 0, 'quoted client phrase found nothing');
});

check('engagement floor is read separately from reach', () => {
  const r = run('campaigns with 500k engagement');
  assert(r.query.engMin === 5e5, `engMin ${r.query.engMin}`);
  assert(r.query.reachMin === null, `reachMin should be null, got ${r.query.reachMin}`);
});

console.log('\nMatch tiers');
check('quoted phrase matches verbatim only', () => {
  const r = run('"oily sunscreen"');
  assert(r.items.length > 0, 'no results');
  for (const c of r.items) assert(c.search.includes('oily sunscreen'), `phrase leak: ${c.name}`);
});
check('title hits rank above body hits', () => {
  const r = run('helmet');
  assert(r.items.length > 0, 'no results');
  const first = r.items[0];
  assert(/helmet/i.test(`${first.client} ${first.name}`), `first result was ${first.name}`);
});
check('broad tier only appears when nothing tighter exists', () => {
  const r = run('razorpay');
  const tiers = new Set([...r.tiers.values()]);
  assert(!tiers.has('broad') || r.widened, 'broad results mixed into a good match set');
});
check('a pure filter query has no text tier noise', () => {
  const r = run('OTT');
  assert(r.items.length > 100, `only ${r.items.length}`);
  assert(r.items.every((c) => c.industry === 'OTT'), 'industry leak');
});

console.log('\nHonesty guarantees');
check('categorical constraints never relax under a numeric fallback', () => {
  const r = run('jewellery above 800M reach');
  assert(r.shortfall !== null, 'expected a shortfall');
  for (const c of r.items) assert(c.industry === 'Jewellery', `leaked ${c.industry}`);
});
check('shortfall reports the true ceiling', () => {
  const r = run('jewellery above 800M reach');
  const best = Math.max(...ALL.filter((c) => c.industry === 'Jewellery' && c.reach !== null).map((c) => c.reach as number));
  assert(r.shortfall!.best.reach === best, `reported ${r.shortfall!.best.reach}, true ${best}`);
});
check('an impossible query returns nothing rather than something', () => {
  const r = run('"a phrase that appears in no campaign anywhere"');
  assert(r.items.length === 0, `got ${r.items.length}`);
});

console.log('\nDid you mean');
check('a half-typed word offers completions', () => {
  const r = parseQuery('cosmet', { vocab });
  const all = [...r.suggestions.map((s) => s.to), ...r.industries];
  assert(all.some((v) => /cosmetic/i.test(v)), JSON.stringify({ s: r.suggestions, i: r.industries }));
});
check('suggestions carry what they would resolve to', () => {
  const r = parseQuery('influenc', { vocab });
  const hasTarget = r.suggestions.some((s) => s.values.length > 0) || r.services.length > 0;
  assert(hasTarget, JSON.stringify(r.suggestions));
});
check('gibberish neither crashes nor invents a match', () => {
  const r = run('zzzqqxwv');
  assert(r.items.length === 0, `got ${r.items.length} for gibberish`);
});

console.log('\nRegression');
check('empty query returns the whole archive', () => {
  assert(run('').items.length === ALL.length, 'archive size changed');
});
check('facet filters still bind', () => {
  const r = search(ALL, '', { ...EMPTY_FILTERS, industries: ['OTT'] }, 'relevance', vocab);
  assert(r.items.every((c) => c.industry === 'OTT'), 'facet leak');
});
check('sorting by reach is monotonic', () => {
  const r = search(ALL, '', EMPTY_FILTERS, 'reach', vocab);
  const vals = r.items.map((c) => c.reach ?? -1);
  for (let i = 1; i < vals.length; i++) assert(vals[i] <= vals[i - 1], `not sorted at ${i}`);
});

console.log('\nVendored components');
check('the fluid-field shader payload is intact', () => {
  const src = fs.readFileSync('src/components/ui/fluid-field.tsx', 'utf8');
  const open = src.indexOf('const FLUID_SOURCE = `') + 'const FLUID_SOURCE = `'.length;
  const close = src.indexOf('</body></html>`;');
  assert(open > 0 && close > open, 'FLUID_SOURCE not found');
  // The payload's own template literals are backslash-escaped so this file
  // parses; unescaping must round-trip to the original HTML.
  const html = src.slice(open, close + '</body></html>'.length).replace(/\\`/g, '`');
  for (const probe of [
    'const vertexShader = `', 'const fragmentShader = `',
    'float snoise(vec2 v)', 'id="bg-canvas"', 'gl_FragColor = vec4',
  ]) assert(html.includes(probe), `missing from payload: ${probe}`);
});

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log('  · ' + f)); process.exit(1); }
