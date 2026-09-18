import { useEffect, useRef, useState } from 'react';

/**
 * Animates a figure up to its value.
 *
 * Only used for the cards visible on arrival. Running it on every mount would
 * mean numbers re-ticking each time a virtualised row scrolls back into view,
 * which reads as a glitch rather than a flourish.
 */
export function useCountUp(target: number | null, enabled: boolean, ms = 620): number | null {
  const [value, setValue] = useState(enabled ? 0 : target);
  const frame = useRef(0);

  useEffect(() => {
    if (!enabled || target === null) { setValue(target); return; }
    const reduced = typeof matchMedia !== 'undefined'
      && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { setValue(target); return; }

    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      // Ease out cubic: fast at first, settles onto the real figure.
      setValue(target * (1 - (1 - t) ** 3));
      if (t < 1) frame.current = requestAnimationFrame(tick);
      else setValue(target);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [target, enabled, ms]);

  return value;
}
