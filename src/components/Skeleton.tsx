/**
 * Loading state.
 *
 * Skeleton cards in the real grid geometry rather than a spinner, so the page
 * arrives in the shape it will keep and nothing jumps when the archive lands.
 */
export default function Skeleton({ count = 9 }: { count?: number }) {
  return (
    <div className="skeleton" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div className="skel" key={i} style={{ animationDelay: `${(i % 3) * 90 + Math.floor(i / 3) * 60}ms` }}>
          <div className="skel__row">
            <span className="skel__bar" style={{ width: 26 }} />
            <span className="skel__bar" style={{ width: 72 }} />
            <span className="skel__rule" />
          </div>
          <span className="skel__bar skel__bar--title" style={{ width: '82%' }} />
          <span className="skel__bar skel__bar--title" style={{ width: '54%' }} />
          <span className="skel__bar" style={{ width: '94%', marginTop: 4 }} />
          <span className="skel__bar" style={{ width: '70%' }} />
          <div className="skel__figures">
            <span className="skel__bar skel__bar--figure" style={{ width: 92 }} />
            <span className="skel__bar skel__bar--figure" style={{ width: 58 }} />
          </div>
          <span className="skel__bar" style={{ width: '100%', height: 3 }} />
          <div className="skel__row" style={{ marginTop: 'auto' }}>
            <span className="skel__bar" style={{ width: 64, height: 14 }} />
            <span className="skel__bar" style={{ width: 52, height: 14 }} />
          </div>
        </div>
      ))}
    </div>
  );
}
