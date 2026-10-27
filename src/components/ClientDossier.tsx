import { useMemo, useEffect } from 'react';
import { motion } from 'motion/react';
import type { Campaign, Meta } from '../lib/types';
import { fmt, fmtExact, fmtMonth } from '../lib/format';
import { useThumbs } from '../lib/thumbs';
import { IconClose, IconCopy, IconExternal } from './Icons';

/**
 * Everything WLDD has done for one client, on one screen.
 *
 * "What have we run for Amazon?" is the single most common question this tool
 * gets asked, and answering it by scrolling a filtered grid loses the shape of
 * the relationship — how long, how big, which services, trending up or down.
 */
const SPARK = ['#E9A23B', '#2F9E6E', '#1C96A2', '#7B61D9', '#3B5BDB', '#D4508F', '#EE7B30'];

/**
 * The work itself: posts and reels lifted out of this client's best reports.
 *
 * Figures say how far something travelled; they do not show what was made.
 * These come from the top-performing campaigns, so the strip is the client's
 * own best work rather than whatever happened to be extractable.
 *
 * Nothing renders when no thumbnails have been built — the builder needs
 * Drive access, and a checkout without it should simply show the dossier it
 * always showed.
 */
function ClientWork({ items }: { items: Campaign[] }) {
  const best = [...items]
    .filter((c) => c.reach)
    .sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0))
    .slice(0, 6);
  const thumbs = useThumbs(best.map((c) => c.id), 8);
  if (!thumbs.length) return null;

  const base = import.meta.env.BASE_URL ?? '/';
  return (
    <section className="sec">
      <h4>The work</h4>
      <div className="workstrip">
        {thumbs.map((t) => (
          <img
            key={t.file}
            className={t.h && t.w && t.h > t.w ? 'workstrip__img workstrip__img--reel' : 'workstrip__img'}
            src={`${base}thumbs/${t.file}`}
            width={t.w ?? undefined}
            height={t.h ?? undefined}
            loading="lazy"
            alt=""
          />
        ))}
      </div>
      <p className="hint" style={{ marginTop: 6 }}>From the reports on this client&rsquo;s best campaigns</p>
    </section>
  );
}

export default function ClientDossier({
  name, all, meta, pitch, colourOf, onClose, onOpen, onCopy, onFilter,
}: {
  name: string;
  all: Campaign[];
  meta: Meta;
  pitch: boolean;
  colourOf: (c: Campaign) => string;
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
        style={{ width: 'min(760px, 100vw)' }}
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 34, stiffness: 340 }}
      >
        <header className="pane__head">
          <div style={{ minWidth: 0, flex: 1 }}>
            <span className="pane__kicker">Client dossier</span>
            <h2 className="pane__title">{name}</h2>
            <div className="tags">
              {summary.industries.map((i) => {
                const sample = items.find((c) => c.industry === i);
                return (
                  <span className="pill pill--dept" key={i}
                    style={sample ? { ['--accent' as string]: colourOf(sample) } : undefined}>
                    <span className="pill__dot" />{i}
                  </span>
                );
              })}
              <span className="pill">{fmtMonth(summary.first)} – {fmtMonth(summary.last)}</span>
            </div>
          </div>
          <button className="pane__close" onClick={onClose} aria-label="Close"><IconClose /></button>
        </header>

        <div className="pane__body">
          <div className="statstrip">
            <div><b className="num">{summary.count}</b><i>Campaigns</i></div>
            <div><b className="num">{fmt(summary.reach)}</b><i>Total reach</i></div>
            <div><b className="num">{fmt(summary.eng)}</b><i>Total engagement</i></div>
            <div><b className="num">{summary.withReport}</b><i>Reports filed</i></div>
          </div>

          {spark.length > 1 && (
            <section className="sec">
              <h4>Reach by quarter</h4>
              <div className="sparkrow" role="img"
                aria-label={`Reach by quarter from ${spark[0].q} to ${spark[spark.length - 1].q}`}>
                {spark.map((s, i) => (
                  <span className="sparkrow__col" key={s.q} title={`${s.q}: ${fmt(s.v)}`}>
                    <span className="sparkrow__v num">{fmt(s.v)}</span>
                    <span className="sparkrow__bar" style={{
                      height: `${s.h}%`,
                      background: s.h === 100 ? 'var(--wldd-red)' : SPARK[i % SPARK.length],
                    }} />
                    <span className="sparkrow__q">{s.q}</span>
                  </span>
                ))}
              </div>
              <p className="hint" style={{ marginTop: 6 }}>
                {spark[0].q} → {spark[spark.length - 1].q} · peak {fmt(Math.max(...spark.map((s) => s.v)))}
              </p>
            </section>
          )}

          <ClientWork items={items} />

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
                    {!pitch && <td><span className={c.status === 'Active' ? 'pill pill--live' : 'pill'}>{c.status}</span></td>}
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
