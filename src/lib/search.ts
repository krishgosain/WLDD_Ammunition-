import type {
  Campaign, Filters, Query, SearchResult, SortKey, FacetKey, Meta,
} from './types';
import { resolveConcept } from './taxonomy';

/* ------------------------------------------------------------------ parsing */

const UNITS: Record<string, number> = {
  billion: 1e9, bn: 1e9, b: 1e9,
  million: 1e6, mn: 1e6, m: 1e6,
  crore: 1e7, cr: 1e7,
  lakh: 1e5, l: 1e5,
  thousand: 1e3, k: 1e3,
};

/** Words that carry no selectivity — dropped before free-text matching. */
const NOISE = new Set([
  'show','me','the','a','an','of','and','with','for','in','on','to','at','by','our','we',
  'best','top','good','great','big','some','any','all','find','get','give','need','want',
  'campaign','campaigns','case','study','studies','brand','brands','client','clients','work',
  'above','over','more','than','least','min','minimum','max','plus','around','near','about',
  'reach','reaches','reached','views','view','engagement','engagements','crossed','did','have',
  'has','had','was','were','that','this','which','something','anything','similar','like',
]);

export function parseQuery(raw: string): Query {
  const q: Query = {
    raw: raw.trim(), terms: [], industries: [], services: [], clients: [],
    reachMin: null, engMin: null, year: null,
  };
  if (!q.raw) return q;

  const lower = ` ${raw.toLowerCase()} `;
  let residue = lower;

  // Numeric intent. "30m+ reach" vs "50k engagement" is decided by nearby words.
  const numRe =
    /(?:above|over|more than|at least|min(?:imum)?|>|crossed|upwards of)?\s*([\d.]+)\s*(billion|million|thousand|mn|crore|cr|lakh|bn|[mkbl])\s*\+?/gi;
  for (const m of lower.matchAll(numRe)) {
    const value = parseFloat(m[1]) * (UNITS[m[2].toLowerCase()] ?? 1);
    if (!Number.isFinite(value)) continue;
    const at = m.index ?? 0;
    const window = lower.slice(Math.max(0, at - 30), at + m[0].length + 30);
    const key = /engag|interaction|like|comment/.test(window) ? 'engMin' : 'reachMin';
    if (q[key] === null || value > (q[key] as number)) q[key] = value;
    residue = residue.replace(m[0], ' ');
  }

  const year = residue.match(/\b(20\d{2})\b/);
  if (year) { q.year = Number(year[1]); residue = residue.replace(year[0], ' '); }

  const tokens = residue.split(/[^a-z0-9'&/+-]+/).filter(Boolean);
  // Two-word phrases first, so "food delivery" beats a bare "food".
  const phrases = [
    ...tokens.slice(0, -1).map((_, i) => tokens.slice(i, i + 2).join(' ')),
    ...tokens,
  ];
  const consumed = new Set<string>();
  for (const phrase of phrases) {
    if (consumed.has(phrase)) continue;
    const { industries, services } = resolveConcept(phrase);
    if (industries.length || services.length) {
      q.industries.push(...industries);
      q.services.push(...services);
      phrase.split(' ').forEach((w) => consumed.add(w));
      consumed.add(phrase);
    }
  }

  q.industries = [...new Set(q.industries)];
  q.services = [...new Set(q.services)];
  q.terms = tokens.filter((t) => t.length > 1 && !NOISE.has(t) && !consumed.has(t));
  return q;
}

/* ----------------------------------------------------------------- matching */

/**
 * Categorical constraints. These NEVER relax. Returning an FMCG campaign to a
 * cosmetics query is worse than returning nothing, because the person quoting it
 * will not notice until they are on the call.
 */
function categorical(c: Campaign, q: Query, f: Filters): boolean {
  if (f.industries.length && !f.industries.includes(c.industry)) return false;
  if (f.services.length && !f.services.every((s) => c.services.includes(s))) return false;
  if (f.clients.length && !f.clients.includes(c.client)) return false;
  if (f.clientTypes.length && !f.clientTypes.includes(c.clientType)) return false;
  if (f.statuses.length && !f.statuses.includes(c.status)) return false;
  if (f.leads.length && !f.leads.includes(c.lead)) return false;
  if (f.hasReport && !c.report) return false;
  if (f.yearFrom !== null && (c.year === null || c.year < f.yearFrom)) return false;
  if (f.yearTo !== null && (c.year === null || c.year > f.yearTo)) return false;

  // A typed concept widens across its synonyms but never outside them.
  if (q.industries.length && !q.industries.includes(c.industry)) return false;
  if (q.services.length && !q.services.some((s) => c.services.includes(s))) return false;
  if (q.year !== null && c.year !== q.year) return false;
  if (q.terms.length && !q.terms.every((t) => c.search.includes(t))) return false;
  return true;
}

function numeric(c: Campaign, reachMin: number | null, engMin: number | null, reachMax: number | null) {
  if (reachMin !== null && (c.reach === null || c.reach < reachMin)) return false;
  if (engMin !== null && (c.eng === null || c.eng < engMin)) return false;
  if (reachMax !== null && (c.reach === null || c.reach > reachMax)) return false;
  return true;
}

function score(c: Campaign, q: Query): number {
  let s = 0;
  const client = c.client.toLowerCase();
  const name = c.name.toLowerCase();
  for (const t of q.terms) {
    if (client === t) s += 160;
    else if (client.startsWith(t)) s += 110;
    else if (client.includes(t)) s += 80;
    if (name.includes(t)) s += 45;
    if (c.objective.toLowerCase().includes(t)) s += 12;
  }
  if (q.industries.includes(c.industry)) s += 30;
  if (q.services.some((x) => c.services.includes(x))) s += 20;
  // Bigger, evidenced, recent work outranks equally relevant small work.
  if (c.reach) s += Math.min(40, Math.log10(c.reach) * 5);
  if (c.report) s += 14;
  if (c.year) s += (c.year - 2024) * 3;
  if (c.status === 'Complete') s += 6;
  return s;
}

const cmpNum = (a: number | null, b: number | null) => (b ?? -1) - (a ?? -1);

function sortItems(list: Campaign[], key: SortKey, q: Query): Campaign[] {
  const out = [...list];
  switch (key) {
    case 'reach': out.sort((a, b) => cmpNum(a.reach, b.reach)); break;
    case 'engagement': out.sort((a, b) => cmpNum(a.eng, b.eng)); break;
    case 'deliverables': out.sort((a, b) => cmpNum(a.deliverables, b.deliverables)); break;
    case 'recent': out.sort((a, b) => (b.date || '').localeCompare(a.date || '')); break;
    case 'oldest': out.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999')); break;
    default: out.sort((a, b) => score(b, q) - score(a, q));
  }
  return out;
}

/**
 * The core call.
 *
 * When a reach or engagement floor eliminates everything, the threshold is NOT
 * quietly widened. The real ceiling in the matching pool is reported, then the
 * best of what genuinely exists is shown, each with its true figure.
 */
export function search(
  all: Campaign[], rawQuery: string, filters: Filters, sort: SortKey = 'relevance',
): SearchResult {
  const q = parseQuery(rawQuery);
  const pool = all.filter((c) => categorical(c, q, filters));

  const reachMin = filters.reachMin ?? q.reachMin;
  const engMin = filters.engMin ?? q.engMin;
  const strict = pool.filter((c) => numeric(c, reachMin, engMin, filters.reachMax));

  if (strict.length || (reachMin === null && engMin === null)) {
    return { query: q, items: sortItems(strict, sort, q), poolSize: pool.length, shortfall: null };
  }

  const metric: 'reach' | 'engagement' = reachMin !== null ? 'reach' : 'engagement';
  const field = metric === 'reach' ? 'reach' : 'eng';
  const withMetric = pool.filter((c) => c[field] !== null);
  if (!withMetric.length) {
    return { query: q, items: [], poolSize: pool.length, shortfall: null };
  }

  const best = withMetric.reduce((a, b) => ((b[field] as number) > (a[field] as number) ? b : a));
  const items = sortItems(withMetric, metric === 'reach' ? 'reach' : 'engagement', q).slice(0, 12);

  return {
    query: q,
    items,
    poolSize: pool.length,
    shortfall: {
      metric,
      asked: (reachMin ?? engMin) as number,
      best,
      scope: q.industries[0] ?? filters.industries[0] ?? filters.clients[0] ?? null,
      shown: items.length,
    },
  };
}

/**
 * Counts for one facet, computed with that facet's own selection removed — so
 * ticking "OTT" doesn't make every other industry read zero.
 */
export function facetCounts(
  all: Campaign[], q: Query, filters: Filters, facet: FacetKey,
): Map<string, number> {
  const key = facet === 'clientTypes' ? 'clientTypes' : facet;
  const relaxed: Filters = { ...filters, [key]: [] };
  const counts = new Map<string, number>();
  for (const c of all) {
    if (!categorical(c, q, relaxed)) continue;
    const values =
      facet === 'services' ? c.services :
      facet === 'industries' ? [c.industry] :
      facet === 'clients' ? [c.client] :
      facet === 'clientTypes' ? [c.clientType] :
      facet === 'statuses' ? [c.status] : [c.lead];
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return counts;
}

/** Suggestions for the command palette, ranked by prefix then frequency. */
export function suggest(meta: Meta, raw: string, limit = 8) {
  const t = raw.toLowerCase().trim();
  if (!t) return [];
  const groups: { kind: 'client' | 'industry' | 'service' | 'lead'; list: { value: string; count: number }[] }[] = [
    { kind: 'client', list: meta.facets.clients },
    { kind: 'industry', list: meta.facets.industries },
    { kind: 'service', list: meta.facets.services },
    { kind: 'lead', list: meta.facets.leads },
  ];
  const hits: { kind: string; value: string; count: number; rank: number }[] = [];
  for (const g of groups) {
    for (const { value, count } of g.list) {
      const v = value.toLowerCase();
      if (v === t) hits.push({ kind: g.kind, value, count, rank: 0 });
      else if (v.startsWith(t)) hits.push({ kind: g.kind, value, count, rank: 1 });
      else if (v.includes(t)) hits.push({ kind: g.kind, value, count, rank: 2 });
    }
  }
  return hits.sort((a, b) => a.rank - b.rank || b.count - a.count).slice(0, limit);
}

export function countActive(f: Filters): number {
  return f.industries.length + f.services.length + f.clients.length +
    f.clientTypes.length + f.statuses.length + f.leads.length +
    (f.reachMin !== null ? 1 : 0) + (f.reachMax !== null ? 1 : 0) +
    (f.engMin !== null ? 1 : 0) + (f.yearFrom !== null ? 1 : 0) +
    (f.yearTo !== null ? 1 : 0) + (f.hasReport ? 1 : 0);
}
