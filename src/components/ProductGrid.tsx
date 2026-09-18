import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Campaign, Tier } from '../lib/types';
import ProductCard from './ProductCard';

const GAP = 14;
const LAYOUT = {
  comfortable: { colMin: 320, rowH: 264 },
  compact: { colMin: 250, rowH: 176 },
} as const;

/** How many leading cards get the arrival animation. */
const ANIMATE_LEAD = 12;

/**
 * Virtualised card grid.
 *
 * At ~1,700 campaigns, mounting every card destroys scrolling, so only the
 * visible rows exist in the DOM. Arrow keys walk the grid as a grid — left and
 * right along a row, up and down between them — because a result set this size
 * is faster to work with from the keyboard than the mouse.
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const { colMin, rowH } = LAYOUT[density];

  // Column count must track the real element width, not a guess taken during
  // the first render before layout has happened.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // The magnitude bar is scaled against the result set it sits in, so a bar
  // means "big for this search" rather than "big for the archive".
  const band = useMemo(() => {
    const vals = items.map((c) => c.reach).filter((v): v is number => v !== null && v > 0);
    if (vals.length < 2) return null;
    return { lo: Math.log10(Math.min(...vals)), hi: Math.log10(Math.max(...vals)) };
  }, [items]);

  const cols = Math.max(1, Math.floor((width + GAP) / (colMin + GAP))) || 1;
  const rows = Math.ceil(items.length / cols);

  const virtual = useVirtualizer({
    count: rows,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowH + GAP,
    overscan: 4,
  });

  // A new result set should start at the top, not wherever the last one ended.
  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }); }, [items]);

  /** Move focus by a delta through the flattened grid, scrolling as needed. */
  const move = useCallback((from: number, delta: number) => {
    const next = Math.max(0, Math.min(items.length - 1, from + delta));
    if (next === from) return;
    virtual.scrollToIndex(Math.floor(next / cols), { align: 'auto' });
    // The target row may not be mounted yet; focus once it is.
    requestAnimationFrame(() => {
      scrollRef.current
        ?.querySelector<HTMLElement>(`[data-card-index="${next}"]`)
        ?.focus();
    });
  }, [items.length, cols, virtual]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-card-index]');
    if (!el) return;
    const i = Number(el.dataset.cardIndex);
    const delta =
      e.key === 'ArrowRight' ? 1 :
      e.key === 'ArrowLeft' ? -1 :
      e.key === 'ArrowDown' ? cols :
      e.key === 'ArrowUp' ? -cols :
      e.key === 'Home' ? -i :
      e.key === 'End' ? items.length - 1 - i : 0;
    if (!delta) return;
    e.preventDefault();
    move(i, delta);
  }, [cols, items.length, move]);

  return (
    <div className="gridscroll" ref={scrollRef} onKeyDown={onKeyDown}>
      {!items.length ? (
        <div className="empty">
          <h3>Nothing here</h3>
          <p>
            {emptyPool
              ? 'No campaign fits those categories together. Widen the department or drop a filter — the tool will not hand you a near-miss and call it a match.'
              : 'No campaign clears that figure. Try lowering the floor, or search a brand name directly.'}
          </p>
          <button onClick={onReset}>Reset everything</button>
        </div>
      ) : (
        <div style={{ height: virtual.getTotalSize(), position: 'relative' }}>
          {virtual.getVirtualItems().map((row) => (
            // The outer element owns the virtualiser's translateY. The entry
            // animation lives on an inner element, because Framer Motion writes
            // `transform` wholesale and would otherwise erase that positioning,
            // collapsing every row onto the first one.
            <div
              key={row.key}
              style={{
                position: 'absolute', top: 0, left: 0, width: '100%',
                height: rowH + GAP,
                transform: `translateY(${row.start}px)`,
              }}
            >
              <motion.div
                className="gridrow"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.32,
                  ease: [0.22, 1, 0.36, 1],
                  // Stagger by row position, capped so a long scroll never
                  // waits on a queue of delays.
                  delay: Math.min(row.index, 5) * 0.035,
                }}
                style={{
                  height: '100%',
                  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                }}
              >
                {items.slice(row.index * cols, row.index * cols + cols).map((c, i) => {
                  const index = row.index * cols + i;
                  return (
                    <ProductCard
                      key={c.id}
                      campaign={c}
                      tier={tiers.get(c.id)}
                      index={index}
                      colour={colourOf(c)}
                      picked={picked.has(c.id)}
                      pitch={pitch}
                      band={band}
                      compact={density === 'compact'}
                      animate={index < ANIMATE_LEAD}
                      onOpen={onOpen}
                      onPick={onPick}
                      onCopy={onCopy}
                    />
                  );
                })}
              </motion.div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
