import type {
  Campaign, Filters, Query, SearchResult, SortKey, FacetKey,
  Meta, Tier, Scored,
} from './types';
import {
  buildVocabulary, candidates, prefixMatches, toleranceFor,
  type Vocabulary, type EntityKind,
} from './fuzzy';
import { STOPWORDS, KEEP_SHORT } from './taxonomy';

export { buildVocabulary };
export type { Vocabulary };

/* ------------------------------------------------------------------ parsing */

const UNITS: Record<string, number> = {
  billion: 1e9, bn: 1e9, b: 1e9,
  million: 1e6, mn: 1e6, m: 1e6,
  crore: 1e7, cr: 1e7,
  lakh: 1e5, l: 1e5,
  thousand: 1e3, k: 1e3,
};

const NOISE = STOPWORDS;
const KEEP = KEEP_SHORT;

interface ParseOpts { vocab: Vocabulary | null }

export function parseQuery(raw: string, { vocab }: ParseOpts = { vocab: null }): Query {
  const q: Query = {
    raw: raw.trim(), phrases: [], terms: [],
    industries: [], services: [], clients: [], leads: [],
    reachMin: null, engMin: null, year: null,
    corrections: [], suggestions: [],
  };
  if (!q.raw) return q;

  let work = ` ${raw.toLowerCase()} `;

  // 1. Quoted phrases are literal. "oily sunscreen" must match as written.
  work = work.replace(/"([^"]+)"|'([^']{3,})'/g, (_m, a, b) => {
    const phrase = (a ?? b).trim();
    if (phrase) q.phrases.push(phrase);
    return ' ';
  });

  // 2. Numeric intent. Reach vs engagement is decided by the surrounding words.
  const numRe =
    /(?:above|over|more than|at least|min(?:imum)?|>|crossed|upwards of|north of)?\s*([\d.]+)\s*(billion|million|thousand|mn|crore|cr|lakh|bn|[mkbl])\s*\+?/gi;
  for (const m of [...work.matchAll(numRe)]) {
    const value = parseFloat(m[1]) * (UNITS[m[2].toLowerCase()] ?? 1);
    if (!Number.isFinite(value)) continue;
    const at = m.index ?? 0;
    const window = work.slice(Math.max(0, at - 32), at + m[0].length + 32);
    const key = /engag|interaction|like|comment|save|share/.test(window) ? 'engMin' : 'reachMin';
    if (q[key] === null || value > (q[key] as number)) q[key] = value;
    work = work.replace(m[0], ' ');
  }

  const year = work.match(/\b(20\d{2})\b/);
  if (year) { q.year = Number(year[1]); work = work.replace(year[0], ' '); }

  // 3. Tokenise what is left.
  const tokens = work.split(/[^a-z0-9'&/+-]+/).filter(Boolean);
  const used = new Array(tokens.length).fill(false);

  const push = (kind: EntityKind, values: string[]) => {
    const bucket =
      kind === 'industry' ? q.industries :
      kind === 'service' ? q.services :
      kind === 'client' ? q.clients : q.leads;
    for (const v of values) if (!bucket.includes(v)) bucket.push(v);
  };

  // 4. Entity resolution, longest phrase first so "food delivery" beats "food"
  //    and "Bombay Sweet Shop" beats "shop".
  if (vocab) {
    const span = Math.min(vocab.maxPhrase, 5);
    for (let n = span; n >= 1; n--) {
      for (let i = 0; i + n <= tokens.length; i++) {
        if (used.slice(i, i + n).some(Boolean)) continue;
        const phrase = tokens.slice(i, i + n).join(' ');
        // A single stopword is never an entity on its own, however many client
        // names happen to contain it. Inside a longer phrase it is fine.
        if (n === 1 && NOISE.has(phrase) && !KEEP.has(phrase)) continue;
        const hits = vocab.byTerm.get(phrase);
        if (!hits?.length) continue;
        // One term can name several things ("music" is an industry; "solo" a
        // service and a client). Take the heaviest reading of each kind.
        const byKind = new Map<EntityKind, string[]>();
        for (const h of hits) {
          const cur = byKind.get(h.kind) ?? [];
          byKind.set(h.kind, [...new Set([...cur, ...h.values])]);
        }
        const kinds = [...byKind.keys()];
        const primary = kinds.length === 1
          ? kinds[0]
          : (hits.slice().sort((a, b) => b.weight - a.weight)[0].kind);
        push(primary, byKind.get(primary) ?? []);
        for (let k = i; k < i + n; k++) used[k] = true;
      }
    }
  }

  // 5. Whatever is left: noise, a real word, a typo, or a half-typed word.
  for (let i = 0; i < tokens.length; i++) {
    if (used[i]) continue;
    const t = tokens[i];
    if (NOISE.has(t) && !KEEP.has(t)) continue;
    if (t.length < 2) continue;

    if (!vocab) { q.terms.push(t); continue; }

    // A word the archive actually contains is taken at face value.
    if (vocab.corpus.has(t)) { q.terms.push(t); continue; }

    const reads = candidates(vocab, t, 3);
    if (reads.length) {
      const [best, ...rest] = reads;
      // Applied, but always shown in the intent row so a wrong guess is visible
      // and undoable rather than silently steering the results.
      q.corrections.push({ from: t, to: best.entry.term, kind: best.entry.kind });
      push(best.entry.kind, best.entry.values);
      // Runners-up are offered, not applied — one click to switch reading.
      for (const alt of rest) {
        q.suggestions.push({
          from: t, to: alt.entry.term, kind: alt.entry.kind,
          values: alt.entry.values, count: alt.entry.weight,
        });
      }
      continue;
    }

    // Nothing close enough to act on; offer completions if the word looks
    // half-typed, and keep it as free text either way.
    const prefixes = prefixMatches(vocab, t, 3);
    for (const e of prefixes) {
      q.suggestions.push({
        from: t, to: e.term, kind: e.kind, values: e.values, count: e.weight,
      });
    }
    q.terms.push(t);
  }

  return q;
}

/* ----------------------------------------------------------------- matching */

/**
 * Hard constraints — facets, resolved entities, numeric floors.
 *
 * These NEVER relax. A cosmetics query returning FMCG is worse than returning
 * nothing, because nobody notices until they are on the call.
 */
function passes(c: Campaign, q: Query, f: Filters): boolean {
  if (f.industries.length && !f.industries.includes(c.industry)) return false;
  if (f.services.length && !f.services.every((s) => c.services.includes(s))) return false;
  if (f.clients.length && !f.clients.includes(c.client)) return false;
  if (f.clientTypes.length && !f.clientTypes.includes(c.clientType)) return false;
  if (f.statuses.length && !f.statuses.includes(c.status)) return false;
  if (f.leads.length && !f.leads.includes(c.lead)) return false;
  if (f.hasReport && !c.report) return false;
  if (f.yearFrom !== null && (c.year === null || c.year < f.yearFrom)) return false;
  if (f.yearTo !== null && (c.year === null || c.year > f.yearTo)) return false;

  // Entities from the query widen across their synonyms, never outside them.
  if (q.industries.length && !q.industries.includes(c.industry)) return false;
  if (q.services.length && !q.services.some((s) => c.services.includes(s))) return false;
  if (q.clients.length && !q.clients.includes(c.client)) return false;
  if (q.leads.length && !q.leads.includes(c.lead)) return false;
  if (q.year !== null && c.year !== q.year) return false;
  return true;
}

function numeric(c: Campaign, reachMin: number | null, engMin: number | null, reachMax: number | null) {
  if (reachMin !== null && (c.reach === null || c.reach < reachMin)) return false;
  if (engMin !== null && (c.eng === null || c.eng < engMin)) return false;
  if (reachMax !== null && (c.reach === null || c.reach > reachMax)) return false;
  return true;
}

const TIER_RANK: Record<Tier, number> = { exact: 0, strong: 1, partial: 2, broad: 3 };

/**
 * How well a campaign answers the free-text part of the query.
 *
 *   exact    a quoted phrase, or the whole query, appears verbatim in the title
 *   strong   every term appears in the client or campaign name
 *   partial  every term appears somewhere in the record
 *   broad    at least one term does
 *
 * Returns null when the text cannot be reconciled at all. With no free text the
 * tier is 'exact' — a pure filter query has nothing to rank against.
 */
function tierOf(c: Campaign, q: Query): Tier | null {
  if (!q.terms.length && !q.phrases.length) return 'exact';

  const title = `${c.client} ${c.name}`.toLowerCase();

  // Quoted phrases are a hard requirement wherever they appear.
  for (const p of q.phrases) if (!c.search.includes(p)) return null;

  if (!q.terms.length) return 'exact';

  const inTitle = q.terms.filter((t) => title.includes(t)).length;
  const inRecord = q.terms.filter((t) => c.search.includes(t)).length;

  if (inTitle === q.terms.length) {
    const whole = q.terms.join(' ');
    return title.includes(whole) ? 'exact' : 'strong';
  }
  if (inRecord === q.terms.length) return 'partial';
  if (inRecord > 0) return 'broad';
  return q.phrases.length ? 'partial' : null;
}

function score(c: Campaign, q: Query): number {
  let s = 0;
  const client = c.client.toLowerCase();
  const name = c.name.toLowerCase();
  for (const t of q.terms) {
    if (client === t) s += 180;
    else if (client.startsWith(t)) s += 120;
    else if (client.includes(t)) s += 85;
    if (name.startsWith(t)) s += 60;
    else if (name.includes(t)) s += 45;
    if (c.objective.toLowerCase().includes(t)) s += 12;
  }
  for (const p of q.phrases) if (name.includes(p)) s += 100;
  if (q.industries.includes(c.industry)) s += 30;
  if (q.services.some((x) => c.services.includes(x))) s += 20;
  if (q.clients.includes(c.client)) s += 60;
  // Bigger, evidenced, recent work outranks equally relevant small work.
  if (c.reach) s += Math.min(40, Math.log10(c.reach) * 5);
  if (c.report) s += 14;
  if (c.year) s += (c.year - 2024) * 3;
  if (c.status === 'Complete') s += 6;
  return s;
}

const cmpNum = (a: number | null, b: number | null) => (b ?? -1) - (a ?? -1);

function sortItems(list: Scored[], key: SortKey): Scored[] {
  const out = [...list];
  switch (key) {
    case 'reach': out.sort((a, b) => cmpNum(a.c.reach, b.c.reach)); break;
    case 'engagement': out.sort((a, b) => cmpNum(a.c.eng, b.c.eng)); break;
    case 'deliverables': out.sort((a, b) => cmpNum(a.c.deliverables, b.c.deliverables)); break;
    case 'recent': out.sort((a, b) => (b.c.date || '').localeCompare(a.c.date || '')); break;
    case 'oldest': out.sort((a, b) => (a.c.date || '9999').localeCompare(b.c.date || '9999')); break;
    // Relevance orders by tier first: a title match always beats a body match,
    // however large the body match's campaign was.
    default: out.sort((a, b) =>
      TIER_RANK[a.tier] - TIER_RANK[b.tier] || b.score - a.score);
  }
  return out;
}

/**
 * The core call.
 *
 * Two fallbacks, both stated out loud rather than applied silently:
 *   · broad text matches appear only when nothing tighter exists
 *   · a numeric floor that eliminates everything reports the real ceiling
 */
export function search(
  all: Campaign[], rawQuery: string, filters: Filters,
  sort: SortKey = 'relevance', vocab: Vocabulary | null = null,
): SearchResult {
  const q = parseQuery(rawQuery, { vocab });

  const pool: Scored[] = [];
  for (const c of all) {
    if (!passes(c, q, filters)) continue;
    const tier = tierOf(c, q);
    if (tier === null) continue;
    pool.push({ c, tier, score: 0 });
  }
  for (const s of pool) s.score = score(s.c, q);

  // Broad matches are a last resort, not filler mixed into good results.
  const tight = pool.filter((s) => s.tier !== 'broad');
  const used = tight.length ? tight : pool;
  const widened = !tight.length && pool.length > 0 && q.terms.length > 0;

  const reachMin = filters.reachMin ?? q.reachMin;
  const engMin = filters.engMin ?? q.engMin;
  const strict = used.filter((s) => numeric(s.c, reachMin, engMin, filters.reachMax));

  const bestTier = strict.length
    ? strict.reduce<Tier>((t, s) => (TIER_RANK[s.tier] < TIER_RANK[t] ? s.tier : t), 'broad')
    : null;

  if (strict.length || (reachMin === null && engMin === null)) {
    return {
      query: q,
      items: sortItems(strict, sort).map((s) => s.c),
      tiers: new Map(strict.map((s) => [s.c.id, s.tier])),
      poolSize: used.length,
      bestTier,
      widened,
      shortfall: null,
    };
  }

  // Nothing cleared the floor. Name the real ceiling instead of moving it.
  const metric: 'reach' | 'engagement' = reachMin !== null ? 'reach' : 'engagement';
  const field = metric === 'reach' ? 'reach' : 'eng';
  const withMetric = used.filter((s) => s.c[field] !== null);
  if (!withMetric.length) {
    return {
      query: q, items: [], tiers: new Map(), poolSize: used.length,
      bestTier: null, widened, shortfall: null,
    };
  }

  const best = withMetric.reduce((a, b) =>
    ((b.c[field] as number) > (a.c[field] as number) ? b : a));
  const items = sortItems(withMetric, metric === 'reach' ? 'reach' : 'engagement').slice(0, 12);

  return {
    query: q,
    items: items.map((s) => s.c),
    tiers: new Map(items.map((s) => [s.c.id, s.tier])),
    poolSize: used.length,
    bestTier: null,
    widened,
    shortfall: {
      metric,
      asked: (reachMin ?? engMin) as number,
      best: best.c,
      scope: q.clients[0] ?? q.industries[0] ?? filters.industries[0] ?? filters.clients[0] ?? null,
      shown: items.length,
    },
  };
}

/** Counts for one facet, with that facet's own selection removed. */
export function facetCounts(
  all: Campaign[], q: Query, filters: Filters, facet: FacetKey,
): Map<string, number> {
  const relaxed: Filters = { ...filters, [facet]: [] };
  const counts = new Map<string, number>();
  for (const c of all) {
    if (!passes(c, q, relaxed)) continue;
    if (tierOf(c, q) === null) continue;
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

/** Ranked jump-to suggestions for the command palette. */
export function suggest(meta: Meta, raw: string, limit = 8) {
  const t = raw.toLowerCase().trim();
  if (!t) return [];
  const groups: { kind: EntityKind; list: { value: string; count: number }[] }[] = [
    { kind: 'client', list: meta.facets.clients },
    { kind: 'industry', list: meta.facets.industries },
    { kind: 'service', list: meta.facets.services },
    { kind: 'lead', list: meta.facets.leads },
  ];
  const hits: { kind: EntityKind; value: string; count: number; rank: number }[] = [];
  for (const g of groups) {
    for (const { value, count } of g.list) {
      const v = value.toLowerCase();
      if (v === t) hits.push({ kind: g.kind, value, count, rank: 0 });
      else if (v.startsWith(t)) hits.push({ kind: g.kind, value, count, rank: 1 });
      else if (v.includes(t)) hits.push({ kind: g.kind, value, count, rank: 2 });
      // A misspelt jump should still land.
      else if (toleranceFor(t) && editDistanceLite(t, v)) {
        hits.push({ kind: g.kind, value, count, rank: 3 });
      }
    }
  }
  return hits.sort((a, b) => a.rank - b.rank || b.count - a.count).slice(0, limit);
}

/** Cheap gate used only by `suggest`, where the full matrix is overkill. */
function editDistanceLite(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 2) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 2) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 2;
}

export function countActive(f: Filters): number {
  return f.industries.length + f.services.length + f.clients.length +
    f.clientTypes.length + f.statuses.length + f.leads.length +
    (f.reachMin !== null ? 1 : 0) + (f.reachMax !== null ? 1 : 0) +
    (f.engMin !== null ? 1 : 0) + (f.yearFrom !== null ? 1 : 0) +
    (f.yearTo !== null ? 1 : 0) + (f.hasReport ? 1 : 0);
}
