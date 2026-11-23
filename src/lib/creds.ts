import type { Campaign } from './types';
import { fmt } from './format';

/**
 * The cred deck: one slide per campaign, on WLDD's own creds template.
 *
 * The master deck (WLDD_Creds_Campaign) opens with nineteen slides that never
 * change — the story of the agency, ending on "Work that sticks" — and then
 * runs a campaign per slide in a fixed shape. That shape is seven pieces of
 * text, a media frame and a service chip, and it is the same on every slide
 * from Fizzy Goblet to Mirzapur:
 *
 *   eyebrow     Amazon Ravi Kisan                      gold, small
 *   headline    Ravi Kishan was training India all along.
 *   body        The internet memed him and newsrooms dissected him…
 *   kicker      Every "Daudo" had a deadline behind it.
 *   body        For months, Ravi Kishan dropped one banger after another…
 *   figures     2M Views  ·  75K Engagement
 *   chip        production / distribution / influencer
 *
 * Three of those AMO already knows — the campaign is in the archive with its
 * client, its figures and its services. The other four are writing, and the
 * writing is the point: "Ravi Kishan was training India all along" is not in
 * any spreadsheet. So AMO fills what it knows, carries whatever the person
 * wants to say about a campaign, and hands the rest to Claude, which writes
 * the copy and builds the deck.
 *
 * Nothing here edits the master. Every deck is a fresh copy, named before it
 * is made, so two people building decks on the same afternoon cannot land in
 * the same file.
 */

/** The master. Read for its shape, copied for every deck, never written to. */
export const MASTER = {
  id: 'DAHZv1w0zcE',
  title: 'WLDD_Creds_Campaign',
  url: 'https://www.canva.com/design/DAHZv1w0zcE/IahXPhdG8g6KYMbkcEVOMQ/edit',
  /** The story slides, up to and including the "Work that sticks" divider. */
  intro: { from: 1, to: 19 },
  /** The blank campaign slide at the end — the one to clone, so no real
   *  campaign's words have to be wiped off a slide to make room. */
  template: 53,
} as const;

export interface Slide {
  /** The campaign this slide is for. */
  id: string;
  /** Gold line at the top: brand and campaign, as a person would say it. */
  eyebrow: string;
  /** The hook. Written, not derived. */
  headline: string;
  /** What the campaign was and what it was up against. */
  body1: string;
  /** The one-line turn between the paragraphs. */
  kicker: string;
  /** How it played out. */
  body2: string;
  /** Big figure, bottom left. */
  views: string;
  /** Second figure, only when there is one worth showing. */
  engagement: string;
  /** Service chips, in the deck's own vocabulary. */
  chips: string[];
  /** Anything only a person knows — the backstory, the brief, the constraint. */
  note: string;
}

/**
 * The deck's chip vocabulary, against the sheet's service names.
 *
 * The master only ever shows three chips. Everything WLDD sells lands in one
 * of them: making the thing, getting it seen, or putting it in a creator's
 * hands. A service with no obvious home is left out rather than guessed into
 * the wrong chip — a cred deck that labels amplification as production is
 * worse than one that labels nothing.
 */
const CHIPS: Record<string, string> = {
  'Content Creation': 'production',
  Production: 'production',
  'Offline Activity': 'production',
  Amplification: 'distribution',
  'DP Pages': 'distribution',
  Seeding: 'distribution',
  'Twitter Trend': 'distribution',
  SOLO: 'distribution',
  "Meme'd": 'distribution',
  ORM: 'distribution',
  Influencers: 'influencer',
};

export function chipsFor(services: string[]): string[] {
  const out: string[] = [];
  for (const s of services) {
    const chip = CHIPS[s];
    if (chip && !out.includes(chip)) out.push(chip);
  }
  return out;
}

/**
 * The campaign as a person would say it on a slide.
 *
 * Sheet names carry the filing in them — "Fittr x WLDD | (Kiku Brief Amp)",
 * "ACKO X WLDD | Plan 1" — and none of that belongs in front of a client. The
 * agency's own name goes first, because the slide is WLDD's work and saying so
 * twice is noise, and the client is not repeated when the name already opens
 * with it.
 */
export function eyebrowFor(c: Campaign): string {
  let name = c.name
    // the agency's own name, however it was typed into the sheet
    .replace(/\b(x|×)\s*wldd\b/gi, ' ')
    .replace(/\bwldd\s*(x|×)\s*/gi, ' ')
    .replace(/\bwldd\b/gi, ' ')
    // the sheet's filing marks: pipes between parts, brackets around an aside
    .replace(/[|·()[\]{}]/g, ' ')
    .replace(/\s*[–—-]\s*$/, '')
    .replace(/^\s*[–—-]\s*/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!name) name = c.name.trim();
  const client = c.client.trim();
  const starts = name.toLowerCase().startsWith(client.toLowerCase());
  return (starts || !client || client === '—' ? name : `${client} ${name}`).trim();
}

/** "2M Views" — the deck's own wording, from the figure the sheet filed. */
export const viewsLine = (reach: number | null) => (reach ? `${fmt(reach)} Views` : '');
export const engLine = (eng: number | null) => (eng ? `${fmt(eng)} Engagement` : '');

/**
 * A slide with everything AMO can honestly fill already filled.
 *
 * The written fields come back empty on purpose. They are not placeholders to
 * be approved away: Claude writes them when it builds the deck, from the
 * campaign, the brand and whatever the person put in `note`. Anything typed
 * here is kept and used as written.
 */
export function slideFor(c: Campaign): Slide {
  return {
    id: c.id,
    eyebrow: eyebrowFor(c),
    headline: '',
    body1: '',
    kicker: '',
    body2: '',
    views: viewsLine(c.reach),
    engagement: engLine(c.eng),
    chips: chipsFor(c.services),
    note: '',
  };
}

/** A deck name that cannot collide with someone else's afternoon. */
export function suggestName(pitchingTo: string, now: Date = new Date()): string {
  const who = pitchingTo.trim().replace(/\s+/g, ' ');
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return who ? `WLDD Creds — ${who} — ${stamp}` : `WLDD Creds — ${stamp}`;
}

export interface Brief {
  deckName: string;
  pitchingTo: string;
  master: { id: string; title: string; url: string; keepPages: string; templatePage: number };
  slides: Array<Slide & {
    client: string;
    campaign: string;
    objective: string;
    industry: string;
    services: string[];
    year: number | null;
    reach: number | null;
    eng: number | null;
    report: string | null;
    lead: string;
  }>;
}

/**
 * Everything Claude needs to build the deck without asking a second question.
 *
 * The campaign's own record travels with each slide — objective, industry,
 * year, the report link — because that is the raw material the copy is written
 * from, and a brief that only carried the finished fields would make the
 * writing impossible to do well.
 */
export function buildBrief(
  slides: Slide[], items: Campaign[], deckName: string, pitchingTo: string,
): Brief {
  const by = new Map(items.map((c) => [c.id, c]));
  return {
    deckName: deckName.trim(),
    pitchingTo: pitchingTo.trim(),
    master: {
      id: MASTER.id,
      title: MASTER.title,
      url: MASTER.url,
      keepPages: `${MASTER.intro.from}-${MASTER.intro.to}`,
      templatePage: MASTER.template,
    },
    slides: slides.map((s) => {
      const c = by.get(s.id);
      return {
        ...s,
        client: c?.client ?? '',
        campaign: c?.name ?? '',
        objective: c?.objective ?? '',
        industry: c?.industry ?? '',
        services: c?.services ?? [],
        year: c?.year ?? null,
        reach: c?.reach ?? null,
        eng: c?.eng ?? null,
        report: c?.report ?? null,
        lead: c?.lead ?? '',
      };
    }),
  };
}

/**
 * The brief as a person hands it over: instructions first, data after.
 *
 * Written to be pasted straight into Claude. The rules at the top are the ones
 * that matter to WLDD rather than to Canva — never touch the master, name the
 * deck before building it, write the copy rather than restating the sheet.
 */
export function briefText(brief: Brief): string {
  const lines = [
    'Build a WLDD cred deck in Canva from this brief.',
    '',
    `Deck name: ${brief.deckName}`,
    brief.pitchingTo ? `Pitching to: ${brief.pitchingTo}` : '',
    '',
    'How:',
    `1. Copy ${brief.master.title} (${brief.master.url}) — pages ${brief.master.keepPages} and the blank`,
    `   template on page ${brief.master.templatePage}. Never edit the master itself.`,
    '2. Name the copy exactly as above.',
    '3. Clone the template page once per campaign below, in this order, and fill it:',
    '   eyebrow, headline, first paragraph, kicker, second paragraph, figures, service chip.',
    '4. Write the headline, paragraphs and kicker yourself — from what the campaign',
    '   actually was, the brand, and the note where there is one. The sheet row is',
    '   raw material, not copy. Match the voice of the deck: a hook that reads like a',
    '   line someone would repeat, then what it was up against, then how it landed.',
    '5. Leave the media frame empty; media is attached by hand afterwards.',
    '6. Send back the link to the new deck.',
    '',
    'Campaigns, in order:',
    '',
  ];
  brief.slides.forEach((s, i) => {
    lines.push(`${i + 1}. ${s.client} — ${s.campaign}`);
    lines.push(`   eyebrow: ${s.eyebrow}`);
    lines.push(`   figures: ${[s.views, s.engagement].filter(Boolean).join('  ·  ') || '(none filed)'}`);
    lines.push(`   chips: ${s.chips.join(', ') || '(none)'}`);
    lines.push(`   services: ${s.services.join(', ')}${s.year ? ` · ${s.year}` : ''} · ${s.industry}`);
    if (s.objective) lines.push(`   objective (from the sheet): ${s.objective}`);
    if (s.report) lines.push(`   report: ${s.report}`);
    if (s.note) lines.push(`   NOTE FROM ${s.lead || 'the team'}: ${s.note}`);
    for (const [label, value] of [
      ['headline', s.headline], ['paragraph 1', s.body1],
      ['kicker', s.kicker], ['paragraph 2', s.body2],
    ] as const) {
      if (value.trim()) lines.push(`   ${label} (written already, use as is): ${value.trim()}`);
    }
    lines.push('');
  });
  lines.push('JSON of the same thing, if it is easier to read:', '```json',
    JSON.stringify(brief, null, 2), '```');
  return lines.filter((l) => l !== null).join('\n');
}
