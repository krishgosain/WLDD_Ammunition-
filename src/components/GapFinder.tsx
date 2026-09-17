import type { Meta, Campaign } from '../lib/types';
import { fmt } from '../lib/format';

/**
 * Where the portfolio has no proof.
 *
 * BD's recurring problem is not finding a case study, it is discovering — on a
 * call — that none exists for the vertical in front of them. This ranks every
 * industry by its best result so the thin shelves are obvious in advance.
 */
export default function GapFinder({
  meta, colourOf, onPick,
}: {
  meta: Meta;
  colourOf: (c: Campaign) => string;
  onPick: (industry: string) => void;
}) {
  const bar = meta.gapBar;

  return (
    <div className="panel">
      <p className="panel__intro">
        Every vertical ranked by its single best reach figure. Anything below{' '}
        <strong>{fmt(bar)}</strong> is a shelf with no headline proof — the verticals
        where a pitch has to lean on adjacent work. Click a row to filter to it.
      </p>

      <table className="table">
        <thead>
          <tr>
            <th>Industry</th>
            <th className="num">Campaigns</th>
            <th className="num">Best reach</th>
            <th style={{ width: '26%' }}>Against {fmt(bar)}</th>
            <th className="num">Above bar</th>
            <th className="num">Figures filed</th>
          </tr>
        </thead>
        <tbody>
          {meta.gaps.map((g) => {
            const colour = colourOf({ industry: g.industry, isVertical: true } as Campaign);
            const thin = g.best < bar;
            return (
              <tr key={g.industry} onClick={() => onPick(g.industry)} style={{ cursor: 'pointer' }}>
                <td>
                  <span className="field__dot" style={{ background: colour, display: 'inline-block', marginRight: 8 }} />
                  {g.industry}
                </td>
                <td className="num">{g.count}</td>
                <td className="num" style={{ color: thin ? 'var(--warn)' : 'var(--figure)', fontWeight: 700 }}>
                  {fmt(g.best)}
                </td>
                <td>
                  {/* Progress toward the bar, not toward the global maximum: a
                      single trillion-scale outlier would otherwise flatten every
                      other row to an invisible sliver. */}
                  <span className="bar" role="img"
                    aria-label={`${fmt(g.best)} against a ${fmt(bar)} bar`}>
                    <span style={{
                      width: `${Math.min(100, (g.best / bar) * 100)}%`,
                      background: thin ? 'var(--warn)' : colour,
                    }} />
                  </span>
                </td>
                <td className="num">{g.above}</td>
                <td className="num">{Math.round(g.coverage * 100)}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
