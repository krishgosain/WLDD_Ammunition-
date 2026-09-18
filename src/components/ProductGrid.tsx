import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Campaign, Tier } from '../lib/types';
import ProductCard from './ProductCard';

const COL_MIN = 320;
const GAP = 14;
const ROW_H = 238;

/**
 * Virtualised card grid. At ~1,700 campaigns, mounting every card destroys
 * scrolling, so only the visible rows exist in the DOM.
 */
export default function ProductGrid({
  items, tiers, colourOf, picked, pitch, onOpen, onPick, emptyPool, onReset,
}: {
  items: Campaign[];
  tiers: Map<string, Tier>;
  colourOf: (c: Campaign) => string;
  picked: Set<string>;
  pitch: boolean;
  onOpen: (c: Campaign) => void;
  onPick: (c: Campaign) => void;
  emptyPool: boolean;
  onReset: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

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

  const cols = Math.max(1, Math.floor((width + GAP) / (COL_MIN + GAP))) || 1;
  const rows = Math.ceil(items.length / cols);

  const virtual = useVirtualizer({
    count: rows,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H + GAP,
    overscan: 4,
  });

  // A new result set should start at the top, not wherever the last one ended.
  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }); }, [items]);

  return (
    <div className="gridscroll" ref={scrollRef}>
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
                height: ROW_H + GAP,
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
                {items.slice(row.index * cols, row.index * cols + cols).map((c, i) => (
                  <ProductCard
                    key={c.id}
                    campaign={c}
                    tier={tiers.get(c.id)}
                    index={row.index * cols + i}
                    colour={colourOf(c)}
                    picked={picked.has(c.id)}
                    pitch={pitch}
                    onOpen={onOpen}
                    onPick={onPick}
                  />
                ))}
              </motion.div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
