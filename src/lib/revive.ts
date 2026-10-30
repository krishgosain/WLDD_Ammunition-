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
export function coldClients(all: Campaign[], months: number, now = new Date()): ColdClient[] {
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
    if (lastDate >= cutoff) continue;          // seen inside the window

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
  const head = ['Client', 'Last worked', 'Months cold', 'Campaigns', 'Reach', 'Engagement', 'Last campaign', 'Lead', 'Industries', 'Services'];
  const cell = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) => [
    r.name, r.last, r.monthsCold, r.campaigns, r.reach, r.eng,
    r.lastCampaign, r.lead, r.industries.join(' · '), r.services.join(' · '),
  ].map(cell).join(','));
  return [head.join(','), ...lines].join('\n');
}

export { iso as isoDate };
