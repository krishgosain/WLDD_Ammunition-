import { memo } from 'react';
import type { Campaign, Tier } from '../lib/types';
import { fmt, fmtVerdict, pitchLine } from '../lib/format';
import { useCountUp } from '../lib/useCountUp';
import { IconPlus, IconCheck, IconExternal, IconCopy } from './Icons';

/**
 * One campaign, as a row on the departures board.
 *
 * Left to right the row answers, in order, the only four questions anyone asks
 * of it: who was it for, what was it, how big did it get, and did it beat what
 * we promised. Every reach figure is the same size so a column of them can be
 * read down like a timetable.
 *
 * On hover the campaign column swaps its description for the three actions
 * people actually want — report, pitch line, details — so the common case
 * never needs the drawer. The kit button is the only state the row carries;
 * a picked row is marked by that button alone.
 */
function ProductCard({
  campaign: c, tier, index, colour, picked, pitch, compact, animate,
  onOpen, onPick, onCopy,
}: {
  campaign: Campaign;
  tier?: Tier;
  index: number;
  colour: string;
  picked: boolean;
  pitch: boolean;
  compact: boolean;
  animate: boolean;
  onOpen: (c: Campaign) => void;
  onPick: (c: Campaign) => void;
  onCopy: (text: string, label: string) => void;
}) {
  const verdict = pitch ? null : fmtVerdict(c.reachRatio);
  const running = c.status === 'Active';
  const reach = useCountUp(c.reach, animate);
  const eng = useCountUp(c.eng, animate);
  const hasFigures = c.reach !== null || c.eng !== null;
  const shownServices = c.services.slice(0, compact ? 1 : 2);
  const more = c.services.length - shownServices.length;

  return (
    <article
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
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(c); }
      }}
    >
      <span className="card__index num">{String(index + 1).padStart(3, '0')}</span>

      <div className="card__who">
        <span className="card__client">{c.client}</span>
        {c.isVertical
          ? <span className="pill pill--dept"><span className="pill__dot" />{c.industry}</span>
          : <span className="pill">{c.clientType}</span>}
      </div>

      <div className="card__what">
        <div className="card__meta">
          <h3 className="card__name">{c.name}</h3>
          {!compact && c.objective && <p className="card__obj">{c.objective}</p>}
          <div className="card__tags">
            <span>{shownServices.join(' · ')}{more > 0 ? ` · +${more}` : ''}</span>
            {/* Only worth saying when the match is not an obvious one. */}
            {tier === 'partial' && <span className="tier tier--partial">in the brief</span>}
            {tier === 'broad' && <span className="tier tier--broad">partial</span>}
            {running && <span className="mark mark--live">● Running</span>}
            {!running && !c.report && !pitch && <span className="mark">No report</span>}
          </div>
        </div>
        {/* Slides over the description on hover: the common actions, without the drawer. */}
        <div className="card__actions">
          {c.report ? (
            <a
              className="act act--report"
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

      {hasFigures ? (
        <>
          <div className="card__fig card__fig--reach">
            <b className="num">{c.reach !== null ? fmt(reach) : '—'}</b>
            <i>reach</i>
          </div>
          <div className="card__fig card__fig--eng">
            <b className="num">{c.eng !== null ? fmt(eng) : '—'}</b>
            <i>engagement</i>
          </div>
          <div className="card__verdict">
            {verdict && (
              <span className={verdict.over ? 'verdict verdict--over' : 'verdict'}
                title={c.promisedReach ? `Against a ${fmt(c.promisedReach)} reach promise` : undefined}>
                {verdict.label}
              </span>
            )}
          </div>
        </>
      ) : (
        <p className="figure__none">
          {running ? 'Running — no results yet' : 'No figures filed'}
        </p>
      )}

      <button
        type="button"
        className={picked ? 'card__pick card__pick--on' : 'card__pick'}
        aria-label={picked ? 'Remove from compare' : 'Add to compare'}
        aria-pressed={picked}
        title={picked ? 'In your pitch kit' : 'Add to your pitch kit'}
        onClick={(e) => { e.stopPropagation(); onPick(c); }}
      >
        {picked ? <IconCheck /> : <IconPlus />}
      </button>
    </article>
  );
}

export default memo(ProductCard);
