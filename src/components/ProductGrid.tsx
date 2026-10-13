import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import type { Campaign, Tier } from '../lib/types';
import ProductCard from './ProductCard';

/** Starting guesses only; every row is measured once it mounts. */
const ROW_H = { comfortable: 112, compact: 74 } as const;

/** How many leading rows get the count-up animation. */
const ANIMATE_LEAD = 12;

/**
 * The departures board: one row per campaign, virtualised against the page
 * scroll.
 *
 * At ~2,000 campaigns, mounting every row destroys scrolling, so only the rows
 * near the viewport exist in the DOM. Rows are measured as they mount, because
 * their height changes with density and with the stacked layout on phones.
 * Arrow keys walk the board — up/left to the previous campaign, down/right to
 * the next — because a result set this size is faster from the keyboard.
 */
export default function ProductGrid({
  items, tiers, density, colourOf, picked, pitch, onOpen, onPick, onCopy, emptyPool, onReset,
}: {
  items: Campaign[];
  tiers: Map<string, Tier>;
  density: 'comfortable' | 'compact';
  colourOf: (c: Campaign) => string;
  picked: Set<string>;
  pitch: boolean;
  onOpen: (c: Campaign) => void;
  onPick: (c: Campaign) => void;
  onCopy: (text: string, label: string) => void;
  emptyPool: boolean;
  onReset: () => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);

  // The list's distance from the top of the document moves whenever anything
  // above it changes height — intent chips, a shortfall banner — so it is
  // re-measured rather than read once.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const measure = () => setOffset(el.getBoundingClientRect().top + window.scrollY);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [items.length]);

  const virtual = useWindowVirtualizer({
    count: items.length,
    estimateSize: () => ROW_H[density],
    overscan: 6,
    scrollMargin: offset,
  });

  // Density changes every row height at once.
  useEffect(() => { virtual.measure(); }, [density, virtual]);

  // A new result set should start at its first row, not wherever the last one
  // ended — but only pull the page up if the reader was already below it.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const el = listRef.current;
    if (!el) return;
    const topbar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h')) || 72;
    const top = el.getBoundingClientRect().top + window.scrollY - topbar - 90;
    if (window.scrollY > top) window.scrollTo({ top });
  }, [items]);

  /** Move focus by a delta through the board, scrolling as needed. */
  const move = useCallback((from: number, delta: number) => {
    const next = Math.max(0, Math.min(items.length - 1, from + delta));
    if (next === from) return;
    virtual.scrollToIndex(next, { align: 'auto' });
    // The target row may not be mounted yet; focus once it is.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      listRef.current
        ?.querySelector<HTMLElement>(`[data-card-index="${next}"]`)
        ?.focus({ preventScroll: true });
    }));
  }, [items.length, virtual]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-card-index]');
    if (!el || e.target !== el) return;
    const i = Number(el.dataset.cardIndex);
    const delta =
      e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 :
      e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 :
      e.key === 'Home' ? -i :
      e.key === 'End' ? items.length - 1 - i : 0;
    if (!delta) return;
    e.preventDefault();
    move(i, delta);
  }, [items.length, move]);

  if (!items.length) {
    return (
      <div className="board">
        <div className="empty">
          <h3>Nothing here</h3>
          <p>
            {emptyPool
              ? 'No campaign fits those categories together. Widen the department or drop a filter — the tool will not hand you a near-miss and call it a match.'
              : 'No campaign clears that figure. Try lowering the floor, or search a brand name directly.'}
          </p>
          <button onClick={onReset}>Reset everything</button>
        </div>
      </div>
    );
  }

  return (
    <div className={density === 'compact' ? 'board board--compact' : 'board'} onKeyDown={onKeyDown}>
      <div className="board__head" aria-hidden>
        <span>Nº</span><span>Client</span><span>Campaign</span>
        <span className="r">Reach</span><span className="r">Engagement</span>
        <span className="r">{pitch ? '' : 'vs promise'}</span><span />
      </div>
      <div ref={listRef} style={{ height: virtual.getTotalSize(), position: 'relative' }}>
        {virtual.getVirtualItems().map((row) => {
          const c = items[row.index];
          return (
            // The outer element owns the virtualiser's positioning; nothing
            // inside uses transform for layout, so no animation can erase it.
            <div
              key={c.id}
              data-index={row.index}
              ref={virtual.measureElement}
              className="board__slot"
              style={{
                position: 'absolute', top: 0, left: 0, width: '100%',
                transform: `translateY(${row.start - virtual.options.scrollMargin}px)`,
              }}
            >
              <ProductCard
                campaign={c}
                tier={tiers.get(c.id)}
                index={row.index}
                colour={colourOf(c)}
                picked={picked.has(c.id)}
                pitch={pitch}
                compact={density === 'compact'}
                animate={row.index < ANIMATE_LEAD}
                onOpen={onOpen}
                onPick={onPick}
                onCopy={onCopy}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
