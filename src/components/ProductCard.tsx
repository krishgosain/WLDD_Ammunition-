import { memo } from 'react';
import type { Campaign, Tier } from '../lib/types';
import { fmt, fmtRatio } from '../lib/format';
import { IconPlus, IconCheck } from './Icons';

/**
 * One campaign as a product on a shelf.
 *
 * The reach figure is the largest element because it is the number that gets
 * said out loud on a call. Everything else stays quiet.
 */
function ProductCard({
  campaign: c, tier, colour, picked, pitch, onOpen, onPick,
}: {
  campaign: Campaign;
  tier?: Tier;
  colour: string;
  picked: boolean;
  pitch: boolean;
  onOpen: (c: Campaign) => void;
  onPick: (c: Campaign) => void;
}) {
  const ratio = pitch ? null : fmtRatio(c.reachRatio);
  const running = c.status === 'Active';

  return (
    <article
      className={picked ? 'card card--picked' : 'card'}
      style={{ ['--accent' as string]: colour }}
      tabIndex={0}
      role="button"
      aria-label={`${c.client} — ${c.name}`}
      onClick={() => onOpen(c)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(c); }
      }}
    >
      <button
        className={picked ? 'card__pick card__pick--on' : 'card__pick'}
        aria-label={picked ? 'Remove from compare' : 'Add to compare'}
        aria-pressed={picked}
        onClick={(e) => { e.stopPropagation(); onPick(c); }}
      >
        {picked ? <IconCheck /> : <IconPlus />}
      </button>

      <div className="card__head">
        <span className="card__client">{c.client}</span>
      </div>

      <h3 className="card__name">{c.name}</h3>
      {c.objective && <p className="card__obj">{c.objective}</p>}

      <div className="card__figures">
        {c.reach !== null || c.eng !== null ? (
          <>
            {c.reach !== null && (
              <div className="figure">
                <b className="num">{fmt(c.reach)}</b><i>reach</i>
              </div>
            )}
            {c.eng !== null && (
              <div className="figure figure--sm">
                <b className="num">{fmt(c.eng)}</b><i>engagement</i>
              </div>
            )}
            {ratio && (
              <span className={ratio.over ? 'ratio ratio--over' : 'ratio'}>{ratio.label}</span>
            )}
          </>
        ) : (
          <p className="figure__none">
            {running ? 'Running — results not filed yet' : 'No figures filed'}
          </p>
        )}
      </div>

      <div className="card__foot">
        {c.isVertical
          ? <span className="pill pill--dept" style={{ ['--accent' as string]: colour }}>{c.industry}</span>
          : <span className="pill">{c.clientType}</span>}
        {c.services.slice(0, 2).map((s) => <span className="tag" key={s}>{s}</span>)}
        {c.services.length > 2 && <span className="tag">+{c.services.length - 2}</span>}
        {/* Only worth saying when the match is not an obvious one. */}
        {tier === 'partial' && <span className="tier tier--partial">in the brief</span>}
        {tier === 'broad' && <span className="tier tier--broad">partial match</span>}
        {running && <span className="mark mark--live">● Running</span>}
        {!running && !c.report && !pitch && <span className="mark">No report</span>}
      </div>
    </article>
  );
}

export default memo(ProductCard);
