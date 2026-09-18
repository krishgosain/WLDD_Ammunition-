import { motion } from 'motion/react';
import type { Campaign } from '../lib/types';
import { fmt, fmtDate, fmtRatio } from '../lib/format';
import { IconClose, IconCopy } from './Icons';

/** Pinned campaigns, and the side-by-side that opens from them. */
export default function CompareTray({
  items, onRemove, onClear, onOpen, onCopy,
}: {
  items: Campaign[];
  onRemove: (id: string) => void;
  onClear: () => void;
  onOpen: () => void;
  onCopy: () => void;
}) {
  if (!items.length) return null;
  return (
    <motion.div
      className="tray" role="region" aria-label="Compare tray"
      initial={{ y: 70, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 70, opacity: 0 }}
      transition={{ type: 'spring', damping: 28, stiffness: 320 }}
    >
      <div className="tray__items">
        {items.map((c) => (
          <span className="tray__item" key={c.id}>
            <span>{c.client} — {c.name}</span>
            <button onClick={() => onRemove(c.id)} aria-label={`Remove ${c.name}`}>
              <IconClose />
            </button>
          </span>
        ))}
      </div>
      <button className="btn btn--ghost" onClick={onCopy}><IconCopy /> Copy</button>
      <button className="btn" onClick={onOpen} disabled={items.length < 2}>
        Compare {items.length}
      </button>
      <button className="iconbtn" onClick={onClear} aria-label="Clear compare"><IconClose /></button>
    </motion.div>
  );
}

/** The side-by-side itself, rendered inside the shared pane chrome. */
export function CompareTable({ items, pitch }: { items: Campaign[]; pitch: boolean }) {
  const rows: { label: string; get: (c: Campaign) => string; best?: (c: Campaign) => number | null }[] = [
    { label: 'Client', get: (c) => c.client },
    { label: 'Industry', get: (c) => (c.isVertical ? c.industry : c.clientType) },
    { label: 'Reach', get: (c) => fmt(c.reach), best: (c) => c.reach },
    { label: 'Engagement', get: (c) => fmt(c.eng), best: (c) => c.eng },
    { label: 'Deliverables', get: (c) => (c.deliverables ? String(c.deliverables) : '—'), best: (c) => c.deliverables },
    { label: 'Services', get: (c) => c.services.join(', ') },
    { label: 'Ran', get: (c) => fmtDate(c.date) },
    ...(pitch ? [] : [
      { label: 'Promised reach', get: (c: Campaign) => fmt(c.promisedReach) },
      { label: 'vs target', get: (c: Campaign) => fmtRatio(c.reachRatio)?.label ?? '—', best: (c: Campaign) => c.reachRatio },
      { label: 'Status', get: (c: Campaign) => c.status },
      { label: 'Lead', get: (c: Campaign) => c.lead },
    ]),
    { label: 'Report', get: (c) => (c.report ? 'Filed' : '—') },
  ];

  return (
    <div className="compare" style={{ gridTemplateColumns: `132px repeat(${items.length}, minmax(0, 1fr))` }}>
      <div className="compare__cell compare__cell--head" />
      {items.map((c) => (
        <div className="compare__cell compare__cell--head" key={c.id}>{c.name}</div>
      ))}
      {rows.map((r) => {
        const vals = r.best ? items.map(r.best) : [];
        const max = vals.length ? Math.max(...vals.map((v) => v ?? -Infinity)) : null;
        return (
          <div className="compare__row" key={r.label}>
            <div className="compare__cell compare__label">{r.label}</div>
            {items.map((c, i) => {
              const isBest = r.best && max !== null && max > 0 && vals[i] === max && items.length > 1;
              return (
                <div className={isBest ? 'compare__cell compare__win' : 'compare__cell'} key={c.id}>
                  {r.get(c)}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
