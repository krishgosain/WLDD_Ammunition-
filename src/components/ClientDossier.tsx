import { useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import type { Campaign, Meta } from '../lib/types';
import { fmt, fmtExact, fmtMonth } from '../lib/format';
import { IconClose, IconCopy, IconExternal } from './Icons';

/**
 * Everything WLDD has done for one client, on one screen.
 *
 * "What have we run for Amazon?" is the single most common question this tool
 * gets asked, and answering it by scrolling a filtered grid loses the shape of
 * the relationship — how long, how big, which services, trending up or down.
 */
export default function ClientDossier({
  name, all, meta, pitch, onClose, onOpen, onCopy, onFilter,
}: {
  name: string;
  all: Campaign[];
  meta: Meta;
  pitch: boolean;
  onClose: () => void;
  onOpen: (c: Campaign) => void;
  onCopy: (text: string, label: string) => void;
  onFilter: (client: string) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);

  const summary = meta.clients.find((c) => c.name === name);
  const items = useMemo(
    () => all.filter((c) => c.client === name).sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    [all, name],
  );

  // Reach per quarter, oldest first — the shape of the relationship over time.
  const spark = useMemo(() => {
    const byQ = new Map<string, number>();
    for (const c of items) {
      if (!c.date || c.reach === null) continue;
      const q = `${c.date.slice(0, 4)}Q${Math.floor((+c.date.slice(5, 7) - 1) / 3) + 1}`;
      byQ.set(q, (byQ.get(q) ?? 0) + c.reach);
    }
    const rows = [...byQ.entries()].sort();
    const max = Math.max(...rows.map(([, v]) => v), 1);
    return rows.map(([q, v]) => ({ q, v, h: Math.max(4, (v / max) * 100) }));
  }, [items]);

  if (!summary) return null;

  const digest = [
    `${name} × WLDD — ${summary.count} campaign${summary.count === 1 ? '' : 's'}`,
    `${fmt(summary.reach)} total reach · ${fmt(summary.eng)} total engagement`,
    `${summary.services.join(', ')}`,
    `${fmtMonth(summary.first)} – ${fmtMonth(summary.last)}`,
  ].join('\n');

  return (
    <>
      <motion.div className="scrim" onClick={onClose}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.aside
        className="pane" role="dialog" aria-modal="true" aria-label={`${name} dossier`}
        style={{ width: 'min(720px, 100vw)' }}
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 34, stiffness: 340 }}
      >
        <header className="pane__head">
          <div style={{ minWidth: 0, flex: 1 }}>
            <span className="card__client">Client dossier</span>
            <h2 className="pane__title">{name}</h2>
            <div className="tags">
              {summary.industries.map((i) => <span className="pill" key={i}>{i}</span>)}
              <span className="pill">{fmtMonth(summary.first)} – {fmtMonth(summary.last)}</span>
            </div>
          </div>
          <button className="pane__close" onClick={onClose} aria-label="Close"><IconClose /></button>
        </header>

        <div className="pane__body">
          <div className="statstrip">
            <div><b className="num">{summary.count}</b><i>Campaigns</i></div>
            <div><b className="num" style={{ color: 'var(--figure)' }}>{fmt(summary.reach)}</b><i>Total reach</i></div>
            <div><b className="num">{fmt(summary.eng)}</b><i>Total engagement</i></div>
            <div><b className="num">{summary.withReport}</b><i>Reports filed</i></div>
          </div>

          {spark.length > 1 && (
            <section className="sec">
              <h4>Reach by quarter</h4>
              <div className="sparkrow" role="img"
                aria-label={`Reach by quarter from ${spark[0].q} to ${spark[spark.length - 1].q}`}>
                {spark.map((s) => (
                  <span key={s.q} style={{ height: `${s.h}%` }} title={`${s.q}: ${fmt(s.v)}`} />
                ))}
              </div>
              <p className="hint" style={{ marginTop: 6 }}>
                {spark[0].q} → {spark[spark.length - 1].q} · peak {fmt(Math.max(...spark.map((s) => s.v)))}
              </p>
            </section>
          )}

          <section className="sec">
            <h4>Services used</h4>
            <div className="tags">
              {summary.services.map((s) => <span className="tag" key={s}>{s}</span>)}
            </div>
          </section>

          <section className="sec">
            <h4>Campaigns ({items.length})</h4>
            <table className="table">
              <thead>
                <tr>
                  <th>Campaign</th><th className="num">Reach</th>
                  <th className="num">Engagement</th><th>Ran</th>
                  {!pitch && <th>Status</th>}<th />
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id} onClick={() => onOpen(c)} style={{ cursor: 'pointer' }}>
                    <td>{c.name}</td>
                    <td className="num" style={{ color: 'var(--figure)', fontWeight: 600 }}>{fmt(c.reach)}</td>
                    <td className="num">{fmt(c.eng)}</td>
                    <td>{c.date ? fmtMonth(c.date) : '—'}</td>
                    {!pitch && <td>{c.status}</td>}
                    <td>
                      {c.report && (
                        <a href={c.report} target="_blank" rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Open report for ${c.name}`}
                          style={{ color: 'var(--muted)', display: 'inline-flex' }}>
                          <IconExternal />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="hint" style={{ marginTop: 8 }}>
              Totals sum every filed figure: {fmtExact(summary.reach)} reach across {summary.count} campaigns.
            </p>
          </section>
        </div>

        <footer className="pane__foot">
          <button className="btn btn--ghost btn--wide" onClick={() => onCopy(digest, 'Dossier copied')}>
            <IconCopy /> Copy summary
          </button>
          <button className="btn btn--wide" onClick={() => { onFilter(name); onClose(); }}>
            Filter to {name}
          </button>
        </footer>
      </motion.aside>
    </>
  );
}
