import type { Meta } from '../lib/types';
import { fmt, fmtExact } from '../lib/format';

/**
 * What the sheet is missing or contradicting.
 *
 * Nothing here is corrected in the app — figures are shown exactly as the sheet
 * records them. This page exists so the rows worth a second look are findable
 * and fixable at source.
 */
export default function DataHealth({ meta }: { meta: Meta }) {
  const h = meta.health;
  const pct = (n: number) => `${((n / h.total) * 100).toFixed(1)}%`;

  const tiles = [
    { n: h.noReport, label: 'No report link', hint: 'Campaign cannot be evidenced to a prospect' },
    { n: h.noFigures, label: 'No figures filed', hint: 'Invisible to any reach or engagement search' },
    { n: h.unclassified, label: 'Industry unclassified', hint: 'Sheet says Others, Agency or Person' },
    { n: h.engOverReach.length, label: 'Engagement > reach', hint: 'One of the two figures is in the wrong column' },
    { n: h.duplicatedFigures.length, label: 'Reach = engagement', hint: 'Same number pasted into both columns' },
    { n: h.extremeReach.length, label: 'Reach above 2B', hint: 'Larger than any plausible audience' },
  ];

  return (
    <div className="panel">
      <p className="panel__intro">
        {fmtExact(h.total)} rows as they stand in the sheet. Figures in this tool are shown
        exactly as recorded — nothing below has been altered. These are the rows worth
        a second look when someone next opens the source.
      </p>

      <div className="statstrip">
        {tiles.map((t) => (
          <div key={t.label}>
            <b className="num" style={{ color: t.n ? 'var(--warn)' : 'var(--good)' }}>{t.n}</b>
            <i>{t.label}</i>
            <p className="hint" style={{ margin: '4px 0 0' }}>{t.n ? pct(t.n) : 'clean'} · {t.hint}</p>
          </div>
        ))}
      </div>

      {h.extremeReach.length > 0 && (
        <section className="sec">
          <h4>Reach above 2 billion</h4>
          <table className="table">
            <thead>
              <tr><th>Campaign</th><th>Sheet value</th><th className="num">Reads as</th></tr>
            </thead>
            <tbody>
              {h.extremeReach.map((e) => (
                <tr key={e.label}>
                  <td>{e.label}</td>
                  <td><code style={{ font: '12px var(--mono)', color: 'var(--muted)' }}>{e.raw}</code></td>
                  <td className="num" style={{ color: 'var(--warn)' }}>{fmt(e.reach)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {h.engOverReach.length > 0 && (
        <section className="sec">
          <h4>Engagement recorded above reach ({h.engOverReach.length})</h4>
          <p className="hint">More interactions than people reached — the columns are likely swapped.</p>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13.5, lineHeight: 1.8, color: 'var(--ink-2)' }}>
            {h.engOverReach.slice(0, 25).map((l) => <li key={l}>{l}</li>)}
          </ul>
          {h.engOverReach.length > 25 && (
            <p className="hint">…and {h.engOverReach.length - 25} more.</p>
          )}
        </section>
      )}

      {h.unknownServices.length > 0 && (
        <section className="sec">
          <h4>Service codes with no mapping</h4>
          <div className="tags">
            {h.unknownServices.map((s) => <span className="tag" key={s}>{s}</span>)}
          </div>
        </section>
      )}
    </div>
  );
}
