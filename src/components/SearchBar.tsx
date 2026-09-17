import { useEffect, useRef } from 'react';
import type { Query } from '../lib/types';
import { fmt } from '../lib/format';
import { IconSearch, IconClose } from './Icons';

const EXAMPLES = [
  'cosmetic brand with 30M+ reach',
  'amplification for Myntra above 20M',
  'fintech influencers 2026',
  'meme amplification for edtech',
  'quick commerce ORM',
  '"oily sunscreen"',
];

export interface Chip {
  key: string;
  label: string;
  value: string;
  /** Removing a chip must take its cause out of the query text too. */
  drop: () => void;
}

/**
 * The search box, plus a readout of how the query was understood.
 *
 * Every chip is a button. Showing what the parser extracted is only half the
 * job — being able to strike a wrong reading off without retyping the whole
 * query is the other half.
 */
export default function SearchBar({
  value, onChange, query, resultCount, inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  query: Query;
  resultCount: number;
  inputRef: React.RefObject<HTMLInputElement>;
}) {
  const idx = useRef(Math.floor(Math.random() * EXAMPLES.length));
  useEffect(() => { idx.current = Math.floor(Math.random() * EXAMPLES.length); }, []);

  /** Strike a word out of the raw query, preserving the rest verbatim. */
  const dropWord = (word: string) => {
    const next = value
      .replace(new RegExp(`(^|\\s)${escapeRe(word)}(?=\\s|$)`, 'gi'), ' ')
      .replace(/\s+/g, ' ')
      .trim();
    onChange(next);
    inputRef.current?.focus();
  };

  /** Swap a misread word for the thing the parser thinks was meant. */
  const replaceWord = (from: string, to: string) => {
    const next = value.replace(new RegExp(`(^|\\s)${escapeRe(from)}(?=\\s|$)`, 'gi'), `$1${to}`);
    onChange(next === value ? `${value} ${to}`.trim() : next);
    inputRef.current?.focus();
  };

  const q = query;
  const chips: Chip[] = [
    ...q.clients.map((v) => ({ key: `c:${v}`, label: 'client', value: v, drop: () => dropWord(firstWord(v)) })),
    ...q.industries.map((v) => ({ key: `i:${v}`, label: 'industry', value: v, drop: () => dropWord(firstWord(v)) })),
    ...q.services.map((v) => ({ key: `s:${v}`, label: 'service', value: v, drop: () => dropWord(firstWord(v)) })),
    ...q.leads.map((v) => ({ key: `l:${v}`, label: 'lead', value: v, drop: () => dropWord(firstWord(v)) })),
    ...q.phrases.map((v) => ({ key: `p:${v}`, label: 'phrase', value: `"${v}"`, drop: () => onChange(value.replace(`"${v}"`, '').trim()) })),
    ...(q.reachMin !== null ? [{ key: 'rm', label: 'reach ≥', value: fmt(q.reachMin), drop: () => stripNumbers(value, onChange) }] : []),
    ...(q.engMin !== null ? [{ key: 'em', label: 'engagement ≥', value: fmt(q.engMin), drop: () => stripNumbers(value, onChange) }] : []),
    ...(q.year !== null ? [{ key: 'y', label: 'year', value: String(q.year), drop: () => dropWord(String(q.year)) }] : []),
    ...q.terms.map((v) => ({ key: `t:${v}`, label: 'text', value: v, drop: () => dropWord(v) })),
  ];

  // De-duplicated: three prefix hits on one typo should read as one question.
  const seen = new Set<string>();
  const didYouMean = q.suggestions.filter((s) => {
    const k = `${s.from}->${s.to}`;
    return seen.has(k) ? false : (seen.add(k), true);
  }).slice(0, 3);

  return (
    <div className="search">
      {/* The field is its own positioning context: the icon and the tail centre
          on the input, not on the input plus however many chips are below it. */}
      <div className="search__field">
      <span className="search__icon"><IconSearch /></span>
      <input
        ref={inputRef}
        /*
         * Deliberately type="text", not type="search". WebKit decorates a
         * search input with its own cancel button, which stretches to the width
         * of the field and paints a stray ✕ across it; the author-side reset for
         * that pseudo-element is not reliably reflected, so the cause is removed
         * rather than patched. role + inputMode keep the semantics and the
         * mobile keyboard, and .search__clear is the clear affordance.
         */
        type="text"
        role="searchbox"
        inputMode="search"
        enterKeyHint="search"
        className="search__input"
        value={value}
        placeholder={`Try “${EXAMPLES[idx.current]}”`}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-label="Search campaigns"
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="search__tail">
        {value && <span className="search__count num">{resultCount}</span>}
        {value && (
          <button
            type="button"
            className="search__clear"
            aria-label="Clear search"
            onClick={() => { onChange(''); inputRef.current?.focus(); }}
          >
            <IconClose />
          </button>
        )}
      </div>
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {resultCount} campaigns found
      </span>

      {(chips.length > 0 || q.corrections.length > 0 || didYouMean.length > 0) && (
        <div className="intent" aria-label="How this search was read">
          {q.corrections.map((c) => (
            <button
              key={`fix:${c.from}`}
              type="button"
              className="intent__chip intent__chip--fixed"
              title={`“${c.from}” read as “${c.to}” — click to undo`}
              onClick={() => replaceWord(c.to, c.from)}
            >
              {c.from} → <b>{c.to}</b>
              <span className="intent__x" aria-hidden>×</span>
            </button>
          ))}

          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              className="intent__chip"
              title={`Remove ${c.label} ${c.value}`}
              onClick={c.drop}
            >
              {c.label} <b>{c.value}</b>
              <span className="intent__x" aria-hidden>×</span>
            </button>
          ))}

          {didYouMean.map((s) => (
            <button
              key={`dym:${s.from}:${s.to}`}
              type="button"
              className="intent__chip intent__chip--ask"
              onClick={() => replaceWord(s.from, s.to)}
            >
              Did you mean <b>{s.to}</b>?
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const firstWord = (s: string) => s.split(/[^A-Za-z0-9]/)[0] || s;

/** Reach and engagement floors both come from figures in the text. */
function stripNumbers(value: string, onChange: (v: string) => void) {
  onChange(
    value
      .replace(/(?:above|over|more than|at least|min(?:imum)?|>|crossed|upwards of|north of)?\s*[\d.]+\s*(?:billion|million|thousand|mn|crore|cr|lakh|bn|[mkbl])\s*\+?/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}
