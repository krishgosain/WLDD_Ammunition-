import { memo } from 'react';
import { motion } from 'framer-motion';
import type { Campaign, Tier } from '../lib/types';
import { fmt, fmtRatio } from '../lib/format';
import { IconPlus, IconCheck } from './Icons';

/**
 * One campaign as a product on a shelf.
 *
 * The hierarchy is steep on purpose: the reach figure is the largest element
 * because it is the number that gets said out loud on a call. Client, index and
 * services are machinery and sit in mono at the edges.
 *
 * The card carries its industry colour as `--accent`, which drives the client
 * label, the bleed behind the card and the hover glow — so a filtered grid
 * reads as one hue and a mixed grid reads as a spectrum.
 */
function ProductCard({
  campaign: c, tier, index, colour, picked, pitch, onOpen, onPick,
}: {
  campaign: Campaign;
  tier?: Tier;
  index: number;
  colour: string;
  picked: boolean;
  pitch: boolean;
  onOpen: (c: Campaign) => void;
  onPick: (c: Campaign) => void;
}) {
  const ratio = pitch ? null : fmtRatio(c.reachRatio);
  const running = c.status === 'Active';

  return (
    <motion.article
      className={picked ? 'card card--picked' : 'card'}
      style={{ ['--accent' as string]: colour }}
      tabIndex={0}
      role="button"
      aria-label={`${c.client} — ${c.name}`}
      onClick={() => onOpen(c)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(c); }
      }}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.992 }}
      transition={{ type: 'spring', stiffness: 460, damping: 32 }}
    >
      <button
        type="button"
        className={picked ? 'card__pick card__pick--on' : 'card__pick'}
        aria-label={picked ? 'Remove from compare' : 'Add to compare'}
        aria-pressed={picked}
        onClick={(e) => { e.stopPropagation(); onPick(c); }}
      >
        {picked ? <IconCheck /> : <IconPlus />}
      </button>

      <div className="card__head">
        <span className="card__index">{String(index + 1).padStart(3, '0')}</span>
        <span className="card__client">{c.client}</span>
        <span className="card__rule" />
      </div>

      <h3 className="card__name">{c.name}</h3>
      {c.objective && <p className="card__obj">{c.objective}</p>}

      {c.reach !== null || c.eng !== null ? (
        <div className="card__figures">
          {c.reach !== null && (
            <div className="figure">
              <i>reach</i>
              <b className="num">{fmt(c.reach)}</b>
            </div>
          )}
          {c.eng !== null && (
            <div className="figure figure--sm">
              <i>engagement</i>
              <b className="num">{fmt(c.eng)}</b>
            </div>
          )}
          {ratio && (
            <span className={ratio.over ? 'ratio ratio--over' : 'ratio'}>{ratio.label}</span>
          )}
        </div>
      ) : (
        <p className="figure__none">
          {running ? 'RUNNING — NO RESULTS YET' : 'NO FIGURES FILED'}
        </p>
      )}

      <div className="card__foot">
        {c.isVertical
          ? <span className="pill pill--dept">{c.industry}</span>
          : <span className="pill">{c.clientType}</span>}
        {c.services.slice(0, 2).map((s) => <span className="tag" key={s}>{s}</span>)}
        {c.services.length > 2 && <span className="tag">+{c.services.length - 2}</span>}
        {/* Only worth saying when the match is not an obvious one. */}
        {tier === 'partial' && <span className="tier tier--partial">in the brief</span>}
        {tier === 'broad' && <span className="tier tier--broad">partial</span>}
        {running && <span className="mark mark--live">● Running</span>}
        {!running && !c.report && !pitch && <span className="mark">No report</span>}
      </div>
    </motion.article>
  );
}

export default memo(ProductCard);
