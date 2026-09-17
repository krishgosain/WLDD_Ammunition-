/**
 * Typo tolerance and entity recognition.
 *
 * Two jobs:
 *   1. "finech" should find Finance. "razorpey" should find Razorpay.
 *   2. "any amplification work for Myntra above 20M" should resolve Myntra as a
 *      client rather than leaving it as free text that happens to match.
 *
 * Both run against a vocabulary built once from the archive, so new clients and
 * industries become searchable — and misspellable — the moment they land in the
 * sheet, with nothing to maintain by hand.
 */

import type { Meta } from './types';
import { INDUSTRY_SYNONYMS, SERVICE_SYNONYMS, STOPWORDS } from './taxonomy';

export type EntityKind = 'industry' | 'service' | 'client' | 'lead';

export interface VocabEntry {
  /** The lowercased word or phrase a person might type. */
  term: string;
  kind: EntityKind;
  /** The literal sheet values this resolves to. */
  values: string[];
  /** How many campaigns sit behind it — breaks ties toward the useful answer. */
  weight: number;
}

export interface Vocabulary {
  /** Exact lookup, including multi-word phrases. */
  byTerm: Map<string, VocabEntry[]>;
  /** Everything, for fuzzy scanning. */
  entries: VocabEntry[];
  /** Single words that appear anywhere in campaign text — used to decide
   *  whether a token is "real" before offering a correction. */
  corpus: Set<string>;
  /** Longest phrase, in words, worth testing against byTerm. */
  maxPhrase: number;
}

/**
 * Damerau–Levenshtein, bounded.
 *
 * Bounded because an unbounded distance over a few thousand vocabulary entries
 * on every keystroke is wasted work: anything past `max` is rejected regardless,
 * so the row-minimum check bails early.
 */
export function editDistance(a: string, b: string, max = 2): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  if (!a.length || !b.length) return Math.max(a.length, b.length);

  let prev2: number[] = [];
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  let cur: number[] = [];

  for (let i = 1; i <= a.length; i++) {
    cur = new Array(b.length + 1);
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      // transposition: "finetch" -> "fintech"
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prev2[j - 2] + 1);
      }
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev; prev = cur;
  }
  return prev[b.length];
}

/** How far a typo may stray before it stops being a typo. */
export function toleranceFor(word: string): number {
  if (word.length <= 3) return 0;
  if (word.length <= 5) return 1;
  return 2;
}

export function buildVocabulary(meta: Meta): Vocabulary {
  const byTerm = new Map<string, VocabEntry[]>();
  const entries: VocabEntry[] = [];
  let maxPhrase = 1;

  const add = (term: string, kind: EntityKind, values: string[], weight: number) => {
    const t = term.toLowerCase().trim();
    if (!t) return;
    const entry: VocabEntry = { term: t, kind, values, weight };
    entries.push(entry);
    const list = byTerm.get(t);
    if (list) list.push(entry); else byTerm.set(t, [entry]);
    maxPhrase = Math.max(maxPhrase, t.split(/\s+/).length);
  };

  const countOf = (list: { value: string; count: number }[], value: string) =>
    list.find((x) => x.value === value)?.count ?? 0;

  // Literal sheet values first: they are the ground truth.
  for (const { value, count } of meta.facets.industries) add(value, 'industry', [value], count);
  for (const { value, count } of meta.facets.services) add(value, 'service', [value], count);
  for (const { value, count } of meta.facets.clients) add(value, 'client', [value], count);
  for (const { value, count } of meta.facets.leads) add(value, 'lead', [value], count);

  // Hand-written concepts on top — "beauty", "bfsi", "qsr".
  for (const [term, values] of Object.entries(INDUSTRY_SYNONYMS)) {
    add(term, 'industry', values,
      values.reduce((n, v) => n + countOf(meta.facets.industries, v), 0));
  }
  for (const [term, values] of Object.entries(SERVICE_SYNONYMS)) {
    add(term, 'service', values,
      values.reduce((n, v) => n + countOf(meta.facets.services, v), 0));
  }

  // Individual words of multi-word client names, so "sweet shop" reaches
  // "Bombay Sweet Shop" and a typo in one word is still recoverable. Stopwords
  // are excluded: indexing "brand" from "Brand Solutions" made a bare "brand"
  // resolve to a handful of unrelated clients and silently narrow the query.
  for (const { value, count } of meta.facets.clients) {
    const words = value.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
    // The multi-word test runs on the raw split: "Netflix India" is two words
    // and must still index "netflix", even though "india" is itself a stopword.
    if (words.length < 2) continue;
    for (const w of words) if (!STOPWORDS.has(w)) add(w, 'client', [value], count);
  }

  const corpus = new Set<string>();
  for (const e of entries) for (const w of e.term.split(/\s+/)) if (w.length > 2) corpus.add(w);

  return { byTerm, entries, corpus, maxPhrase };
}

export interface FuzzyHit {
  entry: VocabEntry;
  distance: number;
  /** Lower is better. See `rank` below. */
  rank: number;
}

/**
 * Ranking for a candidate reading of a token.
 *
 * Edit distance alone gets this wrong in the common case. "cosmet" is one edit
 * from the client COMET and two from "cosmetic", so raw distance picks a
 * five-campaign client over a seventy-five-campaign industry — when in fact the
 * person is halfway through typing "cosmetics".
 *
 * A prefix relationship is much stronger evidence than a one-character edit,
 * because search-as-you-type means every query passes through its own prefixes.
 * So prefixes outrank every non-exact edit, and weight breaks the remaining
 * ties toward the reading that actually has campaigns behind it.
 */
const RANK_EXACT = 0;
const RANK_PREFIX = 0.5;

function rankOf(token: string, entry: VocabEntry, distance: number): number {
  if (entry.term === token) return RANK_EXACT;
  if (entry.term.startsWith(token) && token.length >= 4) return RANK_PREFIX;
  return distance;
}

function better(a: FuzzyHit, b: FuzzyHit | null): boolean {
  if (!b) return true;
  if (a.rank !== b.rank) return a.rank < b.rank;
  return a.entry.weight > b.entry.weight;
}

/** Best reading of a token, or null when nothing is close enough. */
export function nearest(
  vocab: Vocabulary, token: string, kinds?: EntityKind[],
): FuzzyHit | null {
  return candidates(vocab, token, 1, kinds)[0] ?? null;
}

/**
 * Top distinct readings of a token, best first.
 *
 * More than one is kept so the UI can apply the best and still offer the
 * runners-up as "did you mean" — a wrong guess costs one click, not a retype.
 */
export function candidates(
  vocab: Vocabulary, token: string, limit = 3, kinds?: EntityKind[],
): FuzzyHit[] {
  const t = token.toLowerCase();
  const max = toleranceFor(t);
  if (!max) return [];

  const hits: FuzzyHit[] = [];
  for (const entry of vocab.entries) {
    if (kinds && !kinds.includes(entry.kind)) continue;
    // Phrases are handled by n-gram lookup, not by distance.
    if (entry.term.includes(' ')) continue;

    const isPrefix = entry.term.startsWith(t) && t.length >= 4;
    // A prefix may be much longer than the fragment typed so far, so the
    // length guard must not reject it.
    if (!isPrefix && Math.abs(entry.term.length - t.length) > max) continue;

    const d = isPrefix ? 0 : editDistance(t, entry.term, max);
    if (!isPrefix && d > max) continue;

    const hit: FuzzyHit = { entry, distance: d, rank: rankOf(t, entry, d) };
    hits.push(hit);
  }

  hits.sort((a, b) => (better(a, b) ? -1 : better(b, a) ? 1 : 0));

  // Collapse readings that land on the same values — "cosmetic" and "cosmetics"
  // are one answer, not two.
  const seen = new Set<string>();
  const out: FuzzyHit[] = [];
  for (const h of hits) {
    const key = `${h.entry.kind}:${[...h.entry.values].sort().join('|')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(h);
    if (out.length >= limit) break;
  }
  return out;
}

/** Vocabulary entries starting with a fragment — powers "did you mean" on
 *  half-typed words, where edit distance is the wrong tool. */
export function prefixMatches(
  vocab: Vocabulary, token: string, limit = 3,
): VocabEntry[] {
  const t = token.toLowerCase();
  if (t.length < 3) return [];
  const hits = vocab.entries.filter(
    (e) => !e.term.includes(' ') && e.term.startsWith(t) && e.term !== t,
  );
  const seen = new Set<string>();
  return hits
    .sort((a, b) => b.weight - a.weight || a.term.length - b.term.length)
    .filter((e) => (seen.has(e.term) ? false : seen.add(e.term)))
    .slice(0, limit);
}
