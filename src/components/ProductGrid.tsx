import { useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Campaign } from '../lib/types';
import ProductCard from './ProductCard';

const COL_MIN = 310;
const GAP = 14;
const ROW_H = 262;

/**
 * Virtualised card grid. At ~1,700 campaigns, mounting every card destroys
 * scrolling, so only the visible rows exist in the DOM.
 */
export default function ProductGrid({
  items, colourOf, picked, pitch, onOpen, onPick, emptyPool, onReset,
}: {
  items: Campaign[];
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
            <div
              key={row.key}
              className="gridrow"
              style={{
                position: 'absolute', top: 0, left: 0, width: '100%',
                height: ROW_H + GAP,
                transform: `translateY(${row.start}px)`,
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              }}
            >
              {items.slice(row.index * cols, row.index * cols + cols).map((c) => (
                <ProductCard
                  key={c.id}
                  campaign={c}
                  colour={colourOf(c)}
                  picked={picked.has(c.id)}
                  pitch={pitch}
                  onOpen={onOpen}
                  onPick={onPick}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
