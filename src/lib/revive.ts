import type { Campaign } from './types';

/**
 * Which clients have gone quiet.
 *
 * A revival list rather than a report: the point is to see who was worth
 * money, has not been heard from in a while, and is therefore worth a call.
 *
 * "Last worked" is the latest date anywhere on a client's campaigns, start or
 * end. A campaign that began in March and ran until last week is not evidence
 * of a cold client, so the end date counts; taking only start dates would
 * declare live clients dead.
 *
 * Work booked for the future counts as alive. The archive holds campaigns
 * dated into 2028 — 68 clients have one — and a client with something in the
 * diary is the opposite of cold, so their months cold is zero and no
 * threshold ever reaches them.
 */

export interface ColdClient {
  name: string;
  /** The most recent date on any of their campaigns, start or end. */
  last: string;
  daysCold: number;
  /** Whole months since, which is what the filter is phrased in. */
  monthsCold: number;
  campaigns: number;
  reach: number;
  eng: number;
  industries: string[];
  services: string[];
  /** Whoever ran the most recent campaign: the person who should call. */
  lead: string;
  lastCampaign: string;
}

const DAY = 86_400_000;

/**
 * The rungs the filter offers, and the only values it accepts.
 *
 * There is exactly one way to express each length of silence. "12 months" and
 * "1 year" would be the same threshold wearing two labels, so only the year
 * is offered; the same reasoning puts a single rung at two years rather than
 * both "24 months" and "2 years".
 *
 * The last rung is open-ended on purpose: a threshold is already "this long
 * or longer", so two years is two years and more, and the label says so
 * rather than implying a ceiling that does not exist.
 */
export const COLD_STEPS: ReadonlyArray<{ months: number; label: string }> = [
  ...Array.from({ length: 11 }, (_, i) => ({ months: i + 1, label: `${i + 1} month${i ? 's' : ''}` })),
  { months: 12, label: '1 year' },
  { months: 18, label: '18 months' },
  { months: 24, label: '2 years +' },
];

/** The default rung: long enough to mean something, short enough to act on. */
export const COLD_DEFAULT = 3;

/** A threshold the filter actually offers, or the default. */
export function coldStep(value: unknown): number {
  const n = Number(value);
  return COLD_STEPS.some((s) => s.months === n) ? n : COLD_DEFAULT;
}

/**
 * The caller's calendar date, pinned to midnight UTC.
 *
 * Everything downstream compares against dates the ingest wrote as plain ISO
 * days, which are read as UTC midnight. A `new Date()` carries both a local
 * time and a timezone, so reading its UTC parts in Delhi before 5:30am gives
 * yesterday — a silent one-day shift in every boundary. Taking the local
 * calendar parts and pinning them to UTC keeps "today" the day the person
 * reading the screen thinks it is.
 */
export function startOfDay(from: Date = new Date()): Date {
  return new Date(Date.UTC(from.getFullYear(), from.getMonth(), from.getDate()));
}

/**
 * The date N whole months before `from`.
 *
 * Done by calendar rather than by multiplying days, because "three months"
 * means three months to the person reading it, not ninety days. The day of
 * the month is clamped so that 31 March minus one month is 28 February and
 * not 3 March, which is what naive setMonth would give.
 */
export function monthsBefore(from: Date, months: number): Date {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  d.setUTCMonth(d.getUTCMonth() - months);
  const lastDayOfTarget = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(from.getUTCDate(), lastDayOfTarget));
  return d;
}

/** Whole calendar months between two dates, never negative. */
function wholeMonths(last: Date, now: Date): number {
  if (last >= now) return 0;
  let n = (now.getUTCFullYear() - last.getUTCFullYear()) * 12
    + (now.getUTCMonth() - last.getUTCMonth());
  if (now.getUTCDate() < last.getUTCDate()) n -= 1;
  return Math.max(0, n);
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Clients whose last work was longer ago than `months`.
 *
 * Recency is always measured across every campaign a client has, even when
 * the caller has filtered the archive down. Asking "who has gone quiet" of a
 * narrowed set would otherwise answer with clients who are perfectly active
 * in work the filter happens to exclude.
 */
export function coldClients(all: Campaign[], months: number, asOf: Date = new Date()): ColdClient[] {
  const now = startOfDay(asOf);
  const cutoff = monthsBefore(now, months);
  const byClient = new Map<string, Campaign[]>();
  for (const c of all) {
    if (!c.client) continue;
    const list = byClient.get(c.client);
    if (list) list.push(c); else byClient.set(c.client, [c]);
  }

  const out: ColdClient[] = [];
  for (const [name, list] of byClient) {
    let last = '';
    let lastCampaign: Campaign | null = null;
    for (const c of list) {
      for (const d of [c.date, c.endDate]) {
        if (d && d > last) { last = d; lastCampaign = c; }
      }
    }
    if (!last) continue;                       // nothing dated: nothing to say
    const lastDate = new Date(`${last}T00:00:00Z`);
    // The cutoff day itself counts as having been seen: at three months on
    // 30 October, work dated 30 July is inside the window and 29 July is not.
    if (lastDate >= cutoff) continue;

    out.push({
      name,
      last,
      daysCold: Math.max(0, Math.floor((now.getTime() - lastDate.getTime()) / DAY)),
      monthsCold: wholeMonths(lastDate, now),
      campaigns: list.length,
      reach: list.reduce((s, c) => s + (c.reach ?? 0), 0),
      eng: list.reduce((s, c) => s + (c.eng ?? 0), 0),
      industries: [...new Set(list.map((c) => c.industry).filter(Boolean))],
      services: [...new Set(list.flatMap((c) => c.services))],
      lead: lastCampaign?.lead ?? '',
      lastCampaign: lastCampaign?.name ?? '',
    });
  }

  // Biggest first: a cold client worth 200M is a different phone call from one
  // worth 20k, and the list is there to be worked from the top.
  out.sort((a, b) => b.reach - a.reach || b.campaigns - a.campaigns || a.name.localeCompare(b.name));
  return out;
}

/** The cold list as a CSV, for working through outside the tool. */
export function coldCsv(rows: ColdClient[]): string {
  const head = ['Client', 'Last worked', 'Months cold', 'Days cold', 'Campaigns', 'Reach', 'Engagement', 'Last campaign', 'Lead', 'Industries', 'Services'];
  const cell = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) => [
    r.name, r.last, r.monthsCold, r.daysCold, r.campaigns, r.reach, r.eng,
    r.lastCampaign, r.lead, r.industries.join(' · '), r.services.join(' · '),
  ].map(cell).join(','));
  return [head.join(','), ...lines].join('\n');
}

export { iso as isoDate };
