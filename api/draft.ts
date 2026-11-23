/**
 * Draft the words on a cred slide, before the deck is built.
 *
 * Optional by design. The deck gets written either way — Claude writes the
 * copy when it builds the slides in Canva — so this endpoint exists only for
 * the person who would rather read the lines in AMO first. With no key
 * configured it says so plainly and the page carries on; a drafting service
 * that 500s on a missing key would make an optional convenience look like a
 * broken feature.
 *
 * It never writes to Canva and never sees a credential of the user's. It takes
 * the campaign rows AMO already has, asks for four short fields per slide, and
 * hands them back for the page to drop into the boxes.
 */

type Req = { method?: string; body?: unknown };
type Res = {
  status(code: number): Res;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
};

const MODEL = 'claude-opus-5';
const MAX_SLIDES = 15;

interface SlideIn {
  id?: unknown;
  client?: unknown;
  campaign?: unknown;
  objective?: unknown;
  industry?: unknown;
  services?: unknown;
  year?: unknown;
  views?: unknown;
  engagement?: unknown;
  note?: unknown;
}

const str = (v: unknown, max = 600) => (typeof v === 'string' ? v.slice(0, max) : '');

/**
 * What the deck sounds like.
 *
 * The master's own slides are the brief: a hook that reads like something a
 * person would repeat, then what the work was up against, then how it landed.
 * The examples are real slides from the deck, because a description of a tone
 * is weaker than two lines written in it.
 */
const SYSTEM = `You write slides for WLDD's credentials deck. WLDD is an Indian social and
creator agency; the deck is shown to brands deciding whether to hire them.

Each slide is four pieces of text about one campaign:
  headline  one line, 6-12 words, the hook. It should read like something a person would
            repeat, not like a title. End with a full stop.
  body1     2-3 sentences: what the campaign was and what it was up against.
  kicker    one short bold line that turns the story.
  body2     2-3 sentences: how it played out.

The voice, from slides already in the deck:
  headline "Ravi Kishan was training India all along."
  kicker   "Every \\"Daudo\\" had a deadline behind it."
  headline "Aryabhata invented zero and Amazon Now delivered the rest."
  kicker   "A very Indian insight made it impossible to ignore."

Rules. Write about the work, never about WLDD's excellence. No adjectives doing the job of
facts, no "leveraged", "synergy", "cutting-edge", no exclamation marks. Never invent a
figure, a date, a person or a result — the figures are already on the slide. If a campaign
row is thin, write plainly about what it plainly was rather than inflating it. Indian
English, present-tense confidence, no em-dashes.

Reply with JSON only: {"slides":[{"id":"...","headline":"...","body1":"...","kicker":"...","body2":"..."}]}`;

export default async function handler(req: Req, res: Res) {
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ reason: 'POST only' });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return res.status(200).json({
      slides: null,
      reason: 'No drafting key on this deployment — Claude writes the copy when it builds the deck.',
    });
  }

  const body = (req.body ?? {}) as { slides?: unknown; pitchingTo?: unknown };
  const raw = Array.isArray(body.slides) ? (body.slides as SlideIn[]).slice(0, MAX_SLIDES) : [];
  if (!raw.length) return res.status(400).json({ reason: 'No slides in the request' });

  const campaigns = raw.map((s) => ({
    id: str(s.id, 80),
    client: str(s.client, 120),
    campaign: str(s.campaign, 200),
    objective: str(s.objective, 800),
    industry: str(s.industry, 80),
    services: Array.isArray(s.services) ? s.services.map((x) => str(x, 40)).slice(0, 12) : [],
    year: typeof s.year === 'number' ? s.year : null,
    figures: [str(s.views, 40), str(s.engagement, 40)].filter(Boolean).join(' · '),
    note: str(s.note, 1000),
  })).filter((c) => c.id);

  const pitchingTo = str(body.pitchingTo, 120);
  const prompt = [
    pitchingTo ? `This deck is going to ${pitchingTo}.` : '',
    'Write the four fields for each campaign below. Where a campaign carries a note from the',
    'team, that note is first-hand and outranks everything else in the row.',
    '',
    JSON.stringify(campaigns, null, 2),
  ].filter(Boolean).join('\n');

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        system: SYSTEM,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!r.ok) {
      return res.status(200).json({
        slides: null,
        reason: `The drafter answered ${r.status}. Claude writes the copy when it builds the deck.`,
      });
    }

    const data = await r.json() as { content?: Array<{ type: string; text?: string }> };
    const text = (data.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
    const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
    const parsed = JSON.parse(json) as { slides?: unknown };
    if (!Array.isArray(parsed.slides)) throw new Error('no slides in reply');

    const known = new Set(campaigns.map((c) => c.id));
    const slides = (parsed.slides as Array<Record<string, unknown>>)
      .filter((s) => known.has(str(s.id, 80)))
      .map((s) => ({
        id: str(s.id, 80),
        headline: str(s.headline, 200),
        body1: str(s.body1, 900),
        kicker: str(s.kicker, 200),
        body2: str(s.body2, 900),
      }));
    return res.status(200).json({ slides });
  } catch {
    return res.status(200).json({
      slides: null,
      reason: 'The drafter could not be read. Claude writes the copy when it builds the deck.',
    });
  }
}
