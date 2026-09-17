import { useEffect, useRef } from 'react';
import type { Query } from '../lib/types';
import { fmt } from '../lib/format';
import { IconSearch, IconClose } from './Icons';

const EXAMPLES = [
  'cosmetic brand with 30M+ reach',
  'OTT campaign above 20M',
  'fintech influencers 2026',
  'meme amplification for edtech',
  'quick commerce ORM',
  'automobile launch 5M reach',
];

/**
 * The search box, plus a readout of how the query was understood. Showing the
 * parsed intent is the difference between a search that feels magic and one a
 * person can steer when it guesses wrong.
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

  return (
    <div className="search">
      <span className="search__icon"><IconSearch /></span>
      <input
        ref={inputRef}
        type="search"
        className="search__input"
        value={value}
        placeholder={`Try “${EXAMPLES[idx.current]}”`}
        autoComplete="off"
        spellCheck={false}
        aria-label="Search campaigns"
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="search__tail">
        {value && <span className="search__count num">{resultCount}</span>}
        {value && (
          <button
            className="search__clear"
            aria-label="Clear search"
            onClick={() => { onChange(''); inputRef.current?.focus(); }}
          >
            <IconClose />
          </button>
        )}
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {resultCount} campaigns found
      </span>
      <Intent query={query} />
    </div>
  );
}

/** Chips naming exactly what the engine extracted from the text. */
function Intent({ query: q }: { query: Query }) {
  const chips: { k: string; v: string }[] = [
    ...q.industries.map((v) => ({ k: 'industry', v })),
    ...q.services.map((v) => ({ k: 'service', v })),
    ...(q.reachMin !== null ? [{ k: 'reach ≥', v: fmt(q.reachMin) }] : []),
    ...(q.engMin !== null ? [{ k: 'engagement ≥', v: fmt(q.engMin) }] : []),
    ...(q.year !== null ? [{ k: 'year', v: String(q.year) }] : []),
    ...q.terms.map((v) => ({ k: 'text', v })),
  ];
  if (!chips.length) return null;
  return (
    <div className="intent" aria-label="How this search was read">
      {chips.map(({ k, v }) => (
        <span className="intent__chip" key={`${k}:${v}`}>{k} <b>{v}</b></span>
      ))}
    </div>
  );
}
