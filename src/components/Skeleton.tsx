/**
 * Loading state.
 *
 * Skeleton rows in the real board geometry rather than a spinner, so the page
 * arrives in the shape it will keep and nothing jumps when the archive lands.
 */
export default function Skeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="board skeleton" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div className="skel" key={i} style={{ animationDelay: `${i * 60}ms` }}>
          <span className="skel__bar" style={{ width: 28 }} />
          <span className="skel__stack">
            <span className="skel__bar skel__bar--title" style={{ width: '70%' }} />
            <span className="skel__bar" style={{ width: 80 }} />
          </span>
          <span className="skel__stack">
            <span className="skel__bar" style={{ width: '88%' }} />
            <span className="skel__bar" style={{ width: '64%' }} />
          </span>
          <span className="skel__bar skel__bar--figure" style={{ width: 92 }} />
          <span className="skel__bar skel__bar--figure" style={{ width: 56 }} />
        </div>
      ))}
    </div>
  );
}
