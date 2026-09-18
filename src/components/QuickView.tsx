import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import type { Campaign } from '../lib/types';
import { fmt, fmtExact, fmtDate, fmtRatio, pitchLine } from '../lib/format';
import { IconClose, IconExternal, IconCopy, IconLayers } from './Icons';

/**
 * Campaign detail. In pitch mode the internal columns — lead, status,
 * promise-vs-delivery — are withheld, so the screen can be turned around
 * mid-call without leaking how a deal was scoped.
 */
export default function QuickView({
  campaign: c, colour, pitch, inCompare, onClose, onPick, onClient, onCopy,
}: {
  campaign: Campaign;
  colour: string;
  pitch: boolean;
  inCompare: boolean;
  onClose: () => void;
  onPick: (c: Campaign) => void;
  onClient: (name: string) => void;
  onCopy: (text: string, label: string) => void;
}) {
  const paneRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    paneRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus();
    };
  }, [onClose]);

  const reachRatio = fmtRatio(c.reachRatio);

  return (
    <>
      <motion.div className="scrim" onClick={onClose}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.aside
        ref={paneRef} className="pane" role="dialog" aria-modal="true" tabIndex={-1}
        aria-label={`${c.client} — ${c.name}`}
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 34, stiffness: 340 }}
      >
        <header className="pane__head">
          <div style={{ minWidth: 0, flex: 1 }}>
            <button className="card__client" style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}
              onClick={() => onClient(c.client)}>
              {c.client}
            </button>
            <h2 className="pane__title">{c.name}</h2>
            <div className="tags">
              {c.isVertical && (
                <span className="pill pill--dept" style={{ ['--accent' as string]: colour }}>{c.industry}</span>
              )}
              {!pitch && <span className="pill">{c.status}</span>}
              <span className="pill">{fmtDate(c.date)}</span>
            </div>
          </div>
          <button className="pane__close" onClick={onClose} aria-label="Close"><IconClose /></button>
        </header>

        <div className="pane__body">
          {c.objective && (
            <section className="sec">
              <h4>Objective</h4>
              <p className="prose">{c.objective}</p>
            </section>
          )}

          <section className="sec">
            <h4>Performance</h4>
            <div className="metrics">
              <div>
                <b className="num" style={{ color: 'var(--figure)' }}>{fmt(c.reach)}</b>
                <i>Reach delivered</i>
              </div>
              <div><b className="num">{fmt(c.eng)}</b><i>Engagement delivered</i></div>
              {!pitch && (
                <>
                  <div><b className="num">{fmt(c.promisedReach)}</b><i>Reach promised</i></div>
                  <div><b className="num">{fmt(c.promisedEng)}</b><i>Engagement promised</i></div>
                </>
              )}
            </div>
            {c.reach !== null && (
              <p className="hint" style={{ marginTop: 8 }}>
                Exact: {fmtExact(c.reach)} reach
                {c.eng !== null && <> · {fmtExact(c.eng)} engagement</>}
              </p>
            )}
            {!pitch && reachRatio && (
              <p className={reachRatio.over ? 'ratio ratio--over' : 'ratio'}>
                Reach delivered {reachRatio.label}
              </p>
            )}
          </section>

          <section className="sec">
            <h4>Services</h4>
            <div className="tags">
              {c.services.map((s) => <span className="tag" key={s}>{s}</span>)}
            </div>
          </section>

          <section className="sec">
            <h4>Scope</h4>
            <div className="metrics">
              <div><b className="num">{c.deliverables ? fmtExact(c.deliverables) : '—'}</b><i>Deliverables</i></div>
              <div>
                <b className="metrics__text">{c.endDate ? fmtDate(c.endDate) : '—'}</b>
                <i>Wrapped</i>
              </div>
              {!pitch && (
                <>
                  <div><b className="metrics__text">{c.lead}</b><i>Campaign lead</i></div>
                  <div><b className="metrics__text">{c.clientType}</b><i>Counterparty</i></div>
                </>
              )}
            </div>
          </section>

          <section className="sec">
            <h4>Case study</h4>
            {c.report ? (
              <a className="btn" href={c.report} target="_blank" rel="noopener noreferrer">
                Open the report <IconExternal />
              </a>
            ) : (
              <p className="noreport">
                {c.status === 'Active'
                  ? 'Still running — the report gets filed once it wraps.'
                  : 'No report filed for this campaign.'}
              </p>
            )}
          </section>
        </div>

        <footer className="pane__foot">
          <button className="btn btn--ghost btn--wide"
            onClick={() => onCopy(pitchLine(c), 'Pitch line copied')}>
            <IconCopy /> Copy pitch line
          </button>
          <button className={inCompare ? 'btn btn--wide' : 'btn btn--ghost btn--wide'}
            onClick={() => onPick(c)}>
            <IconLayers /> {inCompare ? 'In compare' : 'Compare'}
          </button>
        </footer>
      </motion.aside>
    </>
  );
}
