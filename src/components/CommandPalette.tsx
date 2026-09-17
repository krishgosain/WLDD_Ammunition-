import { useEffect, useMemo, useRef, useState } from 'react';
import type { Meta, FacetKey } from '../lib/types';
import { suggest } from '../lib/search';

const KIND_TO_FACET: Record<string, FacetKey> = {
  client: 'clients', industry: 'industries', service: 'services', lead: 'leads',
};

/**
 * ⌘K jump-to. Typing a brand and hitting Enter applies that filter — the
 * fastest path from "what did we do for Myntra" to the answer.
 */
export default function CommandPalette({
  meta, onPick, onClose,
}: {
  meta: Meta;
  onPick: (facet: FacetKey, value: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const hits = useMemo(() => {
    if (!q.trim()) {
      return meta.facets.clients.slice(0, 8)
        .map((c) => ({ kind: 'client', value: c.value, count: c.count }));
    }
    return suggest(meta, q, 10);
  }, [meta, q]);

  useEffect(() => { setActive(0); }, [q]);

  // Keep the highlighted row inside the scroll viewport.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const commit = (i: number) => {
    const hit = hits[i];
    if (!hit) return;
    onPick(KIND_TO_FACET[hit.kind], hit.value);
    onClose();
  };

  return (
    <>
      <div className="cmdk__scrim" onClick={onClose} />
      <div className="cmdk" role="dialog" aria-modal="true" aria-label="Jump to">
        <input
          ref={inputRef}
          className="cmdk__input"
          value={q}
          placeholder="Jump to a client, industry, service or lead…"
          aria-label="Jump to"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === 'Enter') { e.preventDefault(); commit(active); }
            else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
          }}
        />
        <div className="cmdk__list" ref={listRef}>
          {hits.length ? hits.map((h, i) => (
            <button
              key={`${h.kind}:${h.value}`}
              className="cmdk__item"
              data-active={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => commit(i)}
            >
              <span className="cmdk__kind">{h.kind}</span>
              <span className="cmdk__val">{h.value}</span>
              <span className="cmdk__n">{h.count}</span>
            </button>
          )) : <p className="cmdk__empty">Nothing matches “{q}”.</p>}
        </div>
        <div className="cmdk__foot">
          <span><span className="kbd">↑↓</span> navigate</span>
          <span><span className="kbd">↵</span> filter</span>
          <span><span className="kbd">esc</span> close</span>
        </div>
      </div>
    </>
  );
}
