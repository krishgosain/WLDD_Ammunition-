/**
 * The cred deck brief.
 *
 * This is the one place in AMO whose output is read by something other than a
 * person: the brief goes to Claude, which builds a deck in Canva from it. So
 * the things worth pinning are the ones a reader cannot catch — that the
 * master is only ever copied, that every picked campaign survives into the
 * brief in the order it was put there, and that a sheet filing like
 * "ACKO X WLDD | Plan 1" is not what ends up in front of a client.
 */
import {
  MASTER, buildBrief, briefText, chipsFor, eyebrowFor, slideFor, suggestName, viewsLine,
} from '../src/lib/creds';
import type { Campaign } from '../src/lib/types';

let pass = 0; const fails: string[] = [];
const check = (name: string, cond: boolean, detail = '') => {
  if (cond) pass++; else fails.push(name + (detail ? ` — ${detail}` : ''));
};

const campaign = (over: Partial<Campaign>): Campaign => ({
  id: Math.random().toString(36).slice(2), client: 'X', clientId: '1', name: 'c',
  objective: '', industry: 'OTT', isVertical: true, clientType: 'Brand',
  services: ['Amplification'], legacyServices: [], status: 'Complete', lead: 'Lead',
  date: '2025-06-01', endDate: '', year: 2025, deliverables: null, reach: null, eng: null,
  promisedReach: null, promisedEng: null, reachRatio: null, engRatio: null,
  report: null, corrected: false, search: '', ...over,
});

console.log('\nCred deck');

// --- the eyebrow ----------------------------------------------------------
// The sheet's campaign names carry the filing in them. None of it belongs on
// a slide: the deck is WLDD's work, so saying WLDD in every title is noise.
const eyebrows: Array<[Partial<Campaign>, string]> = [
  [{ client: 'ACKO', name: 'ACKO X WLDD | Plan 1' }, 'ACKO Plan 1'],
  [{ client: 'FITTR', name: 'Fittr x WLDD | (Kiku Brief Amp)' }, 'Fittr Kiku Brief Amp'],
  [{ client: 'Amazon', name: 'Ravi Kishan' }, 'Amazon Ravi Kishan'],
  [{ client: 'MADDOCK', name: 'IKKIS X WLDD' }, 'MADDOCK IKKIS'],
  [{ client: 'Netflix', name: 'WLDD x Netflix CAS' }, 'Netflix CAS'],
  // Nothing recoverable: better the sheet's own words than an empty gold line.
  [{ client: 'Zee5', name: 'WLDD' }, 'Zee5 WLDD'],
];
for (const [over, want] of eyebrows) {
  const got = eyebrowFor(campaign(over));
  check(`eyebrow: ${over.name}`, got === want, `got "${got}", wanted "${want}"`);
}
console.log(`  ok   ${eyebrows.length} sheet names read as campaign titles`);

// --- the chips ------------------------------------------------------------
// The deck only has three chips. A service with no obvious home is left off
// rather than guessed into the wrong one.
check('making the thing is production', chipsFor(['Content Creation']).join() === 'production');
check('getting it seen is distribution', chipsFor(['Amplification', 'DP Pages']).join() === 'distribution');
check('creators are their own chip', chipsFor(['Influencers']).join() === 'influencer');
check('a campaign can carry two', chipsFor(['Amplification', 'Influencers']).join() === 'distribution,influencer');
check('an unmapped service is left off, not guessed',
  chipsFor(['Campaign Analytics', 'Unspecified']).length === 0);
console.log('  ok   services map to the deck\'s own three chips');

// --- the figures ----------------------------------------------------------
check('a figure reads as the deck writes it', viewsLine(2_000_000) === '2M Views');
check('no figure filed, no line invented', viewsLine(null) === '' && viewsLine(0) === '');
console.log('  ok   figures carry the sheet\'s number or nothing');

// --- the brief ------------------------------------------------------------
const picks = [
  campaign({ client: 'Amazon', name: 'Ravi Kishan', reach: 2_000_000, eng: 75_000, services: ['Amplification'], objective: 'Great Indian Festival' }),
  campaign({ client: 'JioHotstar', name: 'Chiraiya', reach: 200_000_000, eng: 25_000_000, services: ['Influencers', 'Content Creation'] }),
  campaign({ client: 'Mirzapur', name: 'Gandi Bimari Song', reach: 2_500_000 }),
];
const slides = picks.map(slideFor);
slides[1].note = 'Divya Dutta episode-by-episode, no memes.';
slides[2].headline = 'Mirzapur never really left the timeline.';

const brief = buildBrief(slides, picks, 'WLDD Creds — Nykaa — 2026-11-23', 'Nykaa');
check('every pick reaches the brief, in the order it was put there',
  brief.slides.map((s) => s.client).join() === 'Amazon,JioHotstar,Mirzapur');
check('the campaign\'s own record travels with the slide',
  brief.slides[0].objective === 'Great Indian Festival' && brief.slides[1].services.length === 2);
check('the written fields come back empty for Claude to fill',
  brief.slides[0].headline === '' && brief.slides[0].body1 === '');
check('a line someone wrote is kept exactly',
  brief.slides[2].headline === 'Mirzapur never really left the timeline.');
check('the figures are the sheet\'s, in the deck\'s words',
  brief.slides[0].views === '2M Views' && brief.slides[0].engagement === '75K Engagement');
check('no engagement filed, no second line',
  brief.slides[2].engagement === '');

const text = briefText(brief);
check('the brief names the deck it is to create', text.includes('WLDD Creds — Nykaa — 2026-11-23'));
check('and says the master is never edited', /never edit the master/i.test(text));
check('it carries the pages to copy and the template to clone',
  text.includes(`${MASTER.intro.from}-${MASTER.intro.to}`) && text.includes(String(MASTER.template)));
check('a note from the team is passed through as first-hand',
  text.includes('Divya Dutta episode-by-episode'));
check('an already-written line is marked as written, not as a prompt',
  /use as is\): Mirzapur never really left the timeline\./.test(text));
check('the brief asks for writing, not for the sheet restated',
  /raw material, not copy/.test(text));
check('and leaves the media frame alone', /media frame empty/i.test(text));
console.log('  ok   the brief carries the deck, the campaigns and the rules');

// --- naming ---------------------------------------------------------------
// Two people building decks the same afternoon must not land in one file.
const now = new Date(2026, 10, 23);
check('a deck is named for who it is for', suggestName('Nykaa', now) === 'WLDD Creds — Nykaa — 2026-11-23');
check('and still has a name when nobody is named', suggestName('', now) === 'WLDD Creds — 2026-11-23');
console.log('  ok   every deck is named before it is made');

// The master is a source, never a target: nothing in the brief should read as
// an instruction to write to it.
// Every mention of editing the master must be the instruction never to.
const mentions = (re: RegExp) => (text.match(re) ?? []).length;
check('the master id appears only as something to copy from',
  brief.master.id === MASTER.id
  && mentions(/edit the master/gi) === mentions(/never edit the master/gi)
  && mentions(/never edit the master/gi) > 0);
console.log('  ok   the master is only ever read');

fails.forEach((f) => console.log(`  FAIL ${f}`));
console.log(`  ${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
