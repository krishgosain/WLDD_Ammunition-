/**
 * The cold-client list.
 *
 * The arithmetic here decides who gets a phone call, so the cases that matter
 * are the ones where a naive reading gets it wrong: a client whose campaign
 * started long ago but only finished last week, a client with work booked for
 * next year, and the month boundaries themselves.
 */
import { coldClients, coldCsv, monthsBefore } from '../src/lib/revive';
import type { Campaign } from '../src/lib/types';

let pass = 0; const fails: string[] = [];
const check = (name: string, cond: boolean) => { if (cond) pass++; else fails.push(name); };

const NOW = new Date('2026-10-30T00:00:00Z');

const campaign = (over: Partial<Campaign>): Campaign => ({
  id: Math.random().toString(36).slice(2), client: 'X', clientId: '1', name: 'c',
  objective: '', industry: 'OTT', isVertical: true, clientType: 'Brand',
  services: ['Amplification'], legacyServices: [], status: 'Complete', lead: 'Lead',
  date: '', endDate: '', year: null, deliverables: null, reach: null, eng: null,
  promisedReach: null, promisedEng: null, reachRatio: null, engRatio: null,
  report: null, corrected: false, search: '', ...over,
});

console.log('\nCold clients');

// --- the month boundary ---------------------------------------------------
check('one month back from 30 Oct is 30 Sep', monthsBefore(NOW, 1).toISOString().slice(0, 10) === '2026-09-30');
check('twelve months back is a year', monthsBefore(NOW, 12).toISOString().slice(0, 10) === '2025-10-30');
// 31 March minus one month must not land in March again.
check('a short month is clamped, not overflowed',
  monthsBefore(new Date('2026-03-31T00:00:00Z'), 1).toISOString().slice(0, 10) === '2026-02-28');
console.log('  ok   month arithmetic is by calendar, and clamps short months');

// --- who is cold ----------------------------------------------------------
const rows = coldClients([
  campaign({ client: 'LONG GONE', date: '2025-01-05', reach: 5_000_000 }),
  campaign({ client: 'RECENT', date: '2026-10-01', reach: 1_000_000 }),
  campaign({ client: 'EDGE', date: '2026-08-29', reach: 2_000_000 }),
], 2, NOW);
const names = rows.map((r) => r.name);
check('a client from last year is cold', names.includes('LONG GONE'));
check('a client from this month is not cold', !names.includes('RECENT'));
check('a client just past the cutoff is cold', names.includes('EDGE'));
console.log(`  ok   at 2 months: ${names.join(', ')}`);

// --- a long campaign that only just ended ---------------------------------
const stillRunning = coldClients([
  campaign({ client: 'LONG RUN', date: '2026-02-01', endDate: '2026-10-20', reach: 9_000_000 }),
], 3, NOW);
check('a campaign that ended last week is not a cold client', stillRunning.length === 0);
console.log('  ok   the end date counts, so a long campaign does not look like silence');

// --- work in the diary ----------------------------------------------------
const booked = coldClients([
  campaign({ client: 'BOOKED', date: '2025-03-01', reach: 1_000 }),
  campaign({ client: 'BOOKED', date: '2028-04-01', reach: 0 }),
], 12, NOW);
check('a client with work booked ahead is never cold', booked.length === 0);
console.log('  ok   future-dated work keeps a client out of the list');

// --- ordering and content -------------------------------------------------
const ranked = coldClients([
  campaign({ client: 'SMALL', date: '2025-05-01', reach: 10_000 }),
  campaign({ client: 'BIG', date: '2025-05-01', reach: 80_000_000, name: 'The big one', lead: 'Manvitha' }),
  campaign({ client: 'BIG', date: '2024-01-01', reach: 5_000_000 }),
], 6, NOW);
check('the most valuable cold client comes first', ranked[0].name === 'BIG');
check('every campaign counts towards the total', ranked[0].campaigns === 2 && ranked[0].reach === 85_000_000);
check('the last campaign is named', ranked[0].lastCampaign === 'The big one');
check('the lead on the last campaign is carried', ranked[0].lead === 'Manvitha');
check('months cold is whole months', ranked[0].monthsCold === 17);
console.log(`  ok   BIG first: ${ranked[0].campaigns} campaigns, ${ranked[0].monthsCold} months cold, lead ${ranked[0].lead}`);

// --- thresholds behave monotonically --------------------------------------
const all = [
  campaign({ client: 'A', date: '2026-10-20' }),
  campaign({ client: 'B', date: '2026-08-01' }),
  campaign({ client: 'C', date: '2026-02-01' }),
  campaign({ client: 'D', date: '2024-02-01' }),
];
const counts = [1, 3, 6, 12].map((m) => coldClients(all, m, NOW).length);
check('a longer silence is always a smaller list', counts.every((n, i) => i === 0 || n <= counts[i - 1]));
check('one month catches the most', counts[0] === 3);
check('twelve months catches only the oldest', counts[3] === 1);
console.log(`  ok   1/3/6/12 months → ${counts.join(' / ')} clients`);

// --- a client with no dates at all ----------------------------------------
check('an undated client is left out rather than guessed at',
  coldClients([campaign({ client: 'NO DATES' })], 1, NOW).length === 0);
console.log('  ok   an undated client is not called dead');

// --- the csv --------------------------------------------------------------
const csv = coldCsv(ranked);
check('the csv has a header and a row per client', csv.split('\n').length === ranked.length + 1);
check('the csv quotes a field holding a comma',
  coldCsv([{ ...ranked[0], name: 'A, B' }]).includes('"A, B"'));
console.log('  ok   csv exports for working the list outside the tool');

fails.forEach((f) => console.log(`  FAIL ${f}`));
console.log(`  ${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
