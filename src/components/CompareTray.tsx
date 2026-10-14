import { motion } from 'motion/react';
import type { Campaign } from '../lib/types';
import { fmt, fmtDate, fmtRatio } from '../lib/format';
import { IconClose, IconCopy, IconArrow } from './Icons';

/**
 * The pitch kit: what has been picked from the board, docked at the bottom.
 *
 * It is the compare tray grown up — the same picks feed the side-by-side table
 * and the client one-pager, so collecting proof and presenting it are one
 * motion rather than two tools.
 */
export default function CompareTray({
  items, colourOf, onRemove, onClear, onOpen, onBuild, onCopy,
}: {
  items: Campaign[];
  colourOf: (c: Campaign) => string;
  onRemove: (id: string) => void;
  onClear: () => void;
  onOpen: () => void;
  onBuild: () => void;
  onCopy: () => void;
}) {
  if (!items.length) return null;
  const reach = items.reduce((s, c) => s + (c.reach ?? 0), 0);
  return (
    <motion.div
      className="tray" role="region" aria-label="Pitch kit"
      initial={{ y: 70, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 70, opacity: 0 }}
      transition={{ type: 'spring', damping: 28, stiffness: 320 }}
    >
      <span className="tray__label">Pitch kit</span>
      <span className="tray__count num">{items.length}</span>
      <div className="tray__items">
        {items.map((c) => (
          <span className="tray__item" key={c.id} style={{ ['--accent' as string]: colourOf(c) }}
            title={`${c.client} — ${c.name}`}>
            <span>{c.client}</span>
            <button onClick={() => onRemove(c.id)} aria-label={`Remove ${c.name}`}>
              <IconClose />
            </button>
          </span>
        ))}
      </div>
      {reach > 0 && <span className="tray__reach"><b className="num">{fmt(reach)}</b> combined reach</span>}
      <button className="btn btn--tray" onClick={onCopy}><IconCopy /> Copy</button>
      <button className="btn btn--tray" onClick={onOpen} disabled={items.length < 2}>
        Compare {items.length}
      </button>
      <button className="btn" onClick={onBuild}>Build one-pager <IconArrow /></button>
      <button className="iconbtn iconbtn--round iconbtn--tray" onClick={onClear} aria-label="Clear compare"><IconClose /></button>
    </motion.div>
  );
}

export function CompareTable({
  items, pitch, colourOf,
}: {
  items: Campaign[];
  pitch: boolean;
  colourOf: (c: Campaign) => string;
}) {
  const rows: { label: string; get: (c: Campaign) => string; best?: (c: Campaign) => number | null; fig?: boolean }[] = [
    { label: 'Client', get: (c) => c.client },
    { label: 'Industry', get: (c) => (c.isVertical ? c.industry : c.clientType) },
    { label: 'Reach', get: (c) => fmt(c.reach), best: (c) => c.reach, fig: true },
    { label: 'Engagement', get: (c) => fmt(c.eng), best: (c) => c.eng, fig: true },
    { label: 'Deliverables', get: (c) => (c.deliverables ? String(c.deliverables) : '—'), best: (c) => c.deliverables, fig: true },
    { label: 'Services', get: (c) => c.services.join(', ') },
    { label: 'Ran', get: (c) => fmtDate(c.date) },
    ...(pitch ? [] : [
      { label: 'Promised reach', get: (c: Campaign) => fmt(c.promisedReach), fig: true },
      { label: 'vs target', get: (c: Campaign) => fmtRatio(c.reachRatio)?.label ?? '—', best: (c: Campaign) => c.reachRatio },
      { label: 'Status', get: (c: Campaign) => c.status },
      { label: 'Lead', get: (c: Campaign) => c.lead },
    ]),
    { label: 'Report', get: (c) => (c.report ? 'Filed' : '—') },
  ];
  return (
    <div className="compare" style={{ gridTemplateColumns: `128px repeat(${items.length}, minmax(150px, 1fr))` }}>
      <div className="compare__cell compare__cell--blank" />
      {items.map((c) => (
        <div className="compare__cell compare__cell--head" key={c.id} style={{ ['--accent' as string]: colourOf(c) }}>
          <span className="compare__ind">{c.isVertical ? c.industry : c.clientType}</span>
          <span className="compare__client">{c.client}</span>
          <span className="compare__name">{c.name}</span>
        </div>
      ))}
      {rows.map((r) => {
        const vals = r.best ? items.map(r.best) : [];
        const max = vals.length ? Math.max(...vals.map((v) => v ?? -Infinity)) : null;
        return (
          <div className="compare__row" key={r.label}>
            <div className="compare__cell compare__label">{r.label}</div>
            {items.map((c, i) => {
              const isBest = r.best && max !== null && max > 0 && vals[i] === max && items.length > 1;
              const text = r.get(c);
              return (
                <div className={[
                  'compare__cell',
                  isBest ? 'compare__win' : '',
                  r.fig ? 'compare__fig' : '',
                  r.fig && text === '—' ? 'num--none' : '',
                ].filter(Boolean).join(' ')} key={c.id}>
                  {text}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
