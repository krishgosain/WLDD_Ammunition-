import { memo } from 'react';
import { motion } from 'framer-motion';
import type { Campaign, Tier } from '../lib/types';
import { fmt, fmtRatio, pitchLine } from '../lib/format';
import { useCountUp } from '../lib/useCountUp';
import { IconPlus, IconCheck, IconExternal, IconCopy } from './Icons';

/**
 * One campaign.
 *
 * Read top to bottom the card answers, in order, the only four questions
 * anyone asks of it: who was it for, what was it, how big did it get, and did
 * it beat what we promised. Services and provenance sit last because they are
 * qualifiers, not the headline.
 *
 * The bar under the figures is magnitude, not delivery. Delivery was the
 * obvious thing to draw, but promises in this archive are set low and almost
 * everything beats them — a bar that is full and green on every card carries no
 * information. Reach against the rest of the result set does: it makes a grid
 * scannable by size at a glance, which is the actual question being asked.
 *
 * It is a log scale, because reach spans a thousand-fold across a result set
 * and a linear bar would render everything below the leader as an empty track.
 * Delivery keeps its place as the label beside the bar, where green or amber
 * still says at a glance whether the campaign beat what was sold.
 *
 * On hover the footer swaps for the three actions people actually want, so the
 * common case never needs the detail drawer.
 */
function ProductCard({
  campaign: c, tier, index, colour, band, picked, pitch, compact, animate,
  onOpen, onPick, onCopy,
}: {
  campaign: Campaign;
  tier?: Tier;
  index: number;
  colour: string;
  /** log10 range of reach across the current result set. */
  band: { lo: number; hi: number } | null;
  picked: boolean;
  pitch: boolean;
  compact: boolean;
  animate: boolean;
  onOpen: (c: Campaign) => void;
  onPick: (c: Campaign) => void;
  onCopy: (text: string, label: string) => void;
}) {
  const ratio = pitch ? null : fmtRatio(c.reachRatio);
  const running = c.status === 'Active';
  const reach = useCountUp(c.reach, animate);
  const eng = useCountUp(c.eng, animate);

  const over = (c.reachRatio ?? 0) >= 1;
  // Position within the result set's reach range, on a log scale. A floor of
  // 0.06 keeps the smallest campaign visible rather than showing an empty track.
  const fill = band && c.reach && c.reach > 0 && band.hi > band.lo
    ? Math.max(0.06, (Math.log10(c.reach) - band.lo) / (band.hi - band.lo))
    : null;

  return (
    <motion.article
      className={[
        'card',
        picked ? 'card--picked' : '',
        compact ? 'card--compact' : '',
      ].filter(Boolean).join(' ')}
      style={{ ['--accent' as string]: colour }}
      tabIndex={0}
      role="button"
      data-card-index={index}
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
      {!compact && c.objective && <p className="card__obj">{c.objective}</p>}

      <div className="card__outcome">
        {c.reach !== null || c.eng !== null ? (
          <>
            <div className="card__figures">
              {c.reach !== null && (
                <div className="figure">
                  <i>reach</i>
                  <b className="num">{fmt(reach)}</b>
                </div>
              )}
              {c.eng !== null && (
                <div className="figure figure--sm">
                  <i>engagement</i>
                  <b className="num">{fmt(eng)}</b>
                </div>
              )}
            </div>

            {fill !== null && (
              <div
                className="meter"
                title={`${fmt(c.reach)} reach${c.promisedReach ? ` against a ${fmt(c.promisedReach)} promise` : ''}`}
              >
                <span
                  className="meter__track"
                  role="img"
                  aria-label={`${fmt(c.reach)} reach, relative to the largest in these results`}
                >
                  <motion.span
                    className="meter__fill"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: fill }}
                    transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: animate ? 0.1 : 0 }}
                  />
                </span>
                {ratio && (
                  <span className={over ? 'meter__label meter__label--over' : 'meter__label'}>
                    {ratio.label}
                  </span>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="figure__none">
            {running ? 'RUNNING — NO RESULTS YET' : 'NO FIGURES FILED'}
          </p>
        )}
      </div>

      <div className="card__foot">
        <div className="card__meta">
          {c.isVertical
            ? <span className="pill pill--dept">{c.industry}</span>
            : <span className="pill">{c.clientType}</span>}
          {c.services.slice(0, compact ? 1 : 2).map((s) => <span className="tag" key={s}>{s}</span>)}
          {c.services.length > (compact ? 1 : 2) && (
            <span className="tag">+{c.services.length - (compact ? 1 : 2)}</span>
          )}
          {/* Only worth saying when the match is not an obvious one. */}
          {tier === 'partial' && <span className="tier tier--partial">in the brief</span>}
          {tier === 'broad' && <span className="tier tier--broad">partial</span>}
          {running && <span className="mark mark--live">● Running</span>}
          {!running && !c.report && !pitch && <span className="mark">No report</span>}
        </div>

        {/* Slides over the metadata on hover: the common actions, without the drawer. */}
        <div className="card__actions">
          {c.report ? (
            <a
              className="act"
              href={c.report}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              <IconExternal /> Report
            </a>
          ) : (
            <span className="act act--dead">No report</span>
          )}
          <button
            type="button"
            className="act"
            onClick={(e) => { e.stopPropagation(); onCopy(pitchLine(c), 'Pitch line copied'); }}
          >
            <IconCopy /> Copy line
          </button>
          <button
            type="button"
            className="act act--go"
            onClick={(e) => { e.stopPropagation(); onOpen(c); }}
          >
            Details
          </button>
        </div>
      </div>
    </motion.article>
  );
}

export default memo(ProductCard);
