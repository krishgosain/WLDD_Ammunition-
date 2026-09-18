import { lazy, Suspense, useEffect, useState } from 'react';

// The shader runs in an iframe that pulls three.js from a CDN, so it is loaded
// only after the interface is interactive and never blocks first paint.
const FluidFieldBackground = lazy(() => import('@/components/ui/fluid-field'));

/**
 * The layers behind everything: live shader field, film grain, drafting grid,
 * vignette.
 *
 * The field is decoration with a real cost — a continuous WebGL loop — so it is
 * deferred past first paint, dropped entirely when the viewer prefers reduced
 * motion, and paused when the tab is hidden. It is hue-rotated off the shader's
 * native blue onto WLDD violet-magenta.
 */
export default function Backdrop({ enabled }: { enabled: boolean }) {
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(
    () => typeof document === 'undefined' || !document.hidden,
  );

  const reduced = typeof matchMedia !== 'undefined'
    && matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (!enabled || reduced) return;
    // Idle time, so the grid paints and becomes usable first.
    const idle = (window as unknown as {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
    }).requestIdleCallback;
    const id = idle
      ? idle(() => setReady(true), { timeout: 2200 })
      : window.setTimeout(() => setReady(true), 900);
    return () => {
      if (idle) (window as unknown as { cancelIdleCallback: (h: number) => void })
        .cancelIdleCallback(id as number);
      else clearTimeout(id);
    };
  }, [enabled, reduced]);

  // A hidden tab should not keep a shader spinning.
  useEffect(() => {
    const onVis = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  return (
    <div className="backdrop" aria-hidden>
      {enabled && !reduced && ready && visible && (
        <Suspense fallback={null}>
          <div className="backdrop__field">
            <FluidFieldBackground hue={-42} saturation={0.82} brightness={0.72} />
          </div>
        </Suspense>
      )}
      <div className="backdrop__grain" />
      <div className="backdrop__grid" />
      <div className="backdrop__vignette" />
    </div>
  );
}
