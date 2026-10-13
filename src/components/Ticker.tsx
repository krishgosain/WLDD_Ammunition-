import { useMemo } from 'react';
import type { Campaign } from '../lib/types';
import { fmt } from '../lib/format';

/**
 * A departures-board strip of the biggest campaigns in the current results.
 *
 * It follows the search, so it doubles as a glance at what the board holds.
 * Purely visual — every figure on it is also on the board — so it is hidden
 * from assistive tech and stops moving for people who prefer reduced motion.
 */
export default function Ticker({
  items, colourOf,
}: {
  items: Campaign[];
  colourOf: (c: Campaign) => string;
}) {
  const top = useMemo(
    () => items
      .filter((c) => c.reach !== null && c.reach > 0)
      .slice(0, 40)
      .sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0))
      .slice(0, 10),
    [items],
  );
  if (top.length < 3) return null;
  // Rendered twice so the loop is seamless.
  const loop = [...top, ...top];
  return (
    <div className="ticker" aria-hidden>
      <div className="ticker__track">
        {loop.map((c, i) => (
          <span className="ticker__item" key={`${c.id}-${i}`} style={{ ['--accent' as string]: colourOf(c) }}>
            <span className="ticker__dot" />
            {c.client}
            <span className="ticker__fig">{fmt(c.reach)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
