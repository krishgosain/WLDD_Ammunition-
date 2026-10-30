import { useMemo } from 'react';
import type { Campaign } from '../lib/types';
import { COLD_STEPS, coldClients, coldCsv } from '../lib/revive';
import { fmt, fmtMonth } from '../lib/format';
import { IconDownload } from './Icons';

/**
 * Clients who have gone quiet: the call list.
 *
 * Ordered by what they were worth rather than by how long they have been
 * silent, because the list exists to be worked from the top and a cold client
 * worth 200M is a different conversation from one worth 20k.
 *
 * Recency is measured across the whole archive, never the filtered view. A
 * client is not cold because the current filter hides their recent work.
 */
/** The ladder's own wording for a threshold, so the page never invents its own. */
const stepLabel = (months: number) =>
  COLD_STEPS.find((s) => s.months === months)?.label ?? `${months} months`;

/** How long they have been quiet, read the way someone would say it. */
function quietFor(months: number): string {
  if (months < 12) return `${months}m`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest ? `${years}y ${rest}m` : `${years}y`;
}

export default function ColdClients({
  all, months, onMonths, onOpenClient, onCopy,
}: {
  all: Campaign[];
  months: number;
  onMonths: (m: number) => void;
  onOpenClient: (client: string) => void;
  onCopy: (text: string, label: string) => void;
}) {
  const rows = useMemo(() => coldClients(all, months), [all, months]);

  const totals = useMemo(() => ({
    reach: rows.reduce((s, r) => s + r.reach, 0),
    campaigns: rows.reduce((s, r) => s + r.campaigns, 0),
  }), [rows]);

  /**
   * How far back the archive itself goes.
   *
   * An empty list at two years is a true answer when the records only start
   * eighteen months ago, but on screen it reads as a broken filter. Saying
   * where the data runs out is the difference between "nobody" and "nobody
   * could be".
   */
  const earliest = useMemo(() => {
    let first = '';
    for (const c of all) {
      const d = c.date || c.endDate;
      if (d && (!first || d < first)) first = d;
    }
    return first;
  }, [all]);

  const download = () => {
    const blob = new Blob([coldCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `WLDD dead clients - ${stepLabel(months)}.csv`;
    // The download attribute is only honoured on an anchor that is in the
    // document; detached, the file arrives named "download".
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="cold">
      <header className="cold__head">
        <div>
          <h2 className="cold__title">Dead clients</h2>
          <p className="cold__sub">
            Nothing from them in <b>{stepLabel(months)}</b>
            {rows.length > 0 && <> · {fmt(totals.reach)} reach across {totals.campaigns} past campaigns</>}
          </p>
        </div>
        <div className="cold__tools">
          <label className="cold__pick">
            <span>Quiet for</span>
            <select
              className="select"
              value={months}
              aria-label="Months of silence"
              onChange={(e) => onMonths(Number(e.target.value))}
            >
              {COLD_STEPS.map((s) => (
                <option key={s.months} value={s.months}>{s.label}</option>
              ))}
            </select>
          </label>
          <button className="btn btn--ghost" onClick={download} disabled={!rows.length}>
            <IconDownload /> Export list
          </button>
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="empty">
          <h3>Nobody has gone quiet</h3>
          <p>
            Every client has worked with WLDD inside the last {stepLabel(months)}, or has work
            booked ahead.
          </p>
          {earliest && (
            <p className="hint" style={{ marginTop: 10 }}>
              The archive starts in {fmtMonth(earliest)}, so no client can be quiet for much
              longer than that yet — this rung fills up as the records get deeper.
            </p>
          )}
        </div>
      ) : (
        <>
          <p className="cold__count"><b>{rows.length}</b> client{rows.length === 1 ? '' : 's'} to call</p>
          <div className="cold__list">
            <div className="cold__row cold__row--head" aria-hidden>
              <span>Client</span><span>Last worked</span><span className="r">Quiet</span>
              <span className="r">Campaigns</span><span className="r">Reach</span><span>Last campaign</span>
            </div>
            {rows.map((r) => (
              <button
                key={r.name}
                className="cold__row"
                onClick={() => onOpenClient(r.name)}
                title={`Open ${r.name}`}
              >
                <span className="cold__client">
                  <b>{r.name}</b>
                  {r.industries[0] && <i>{r.industries[0]}</i>}
                </span>
                <span className="cold__when">{fmtMonth(r.last)}</span>
                <span className="r cold__months">{quietFor(r.monthsCold)}</span>
                <span className="r num">{r.campaigns}</span>
                <span className="r num cold__reach">{fmt(r.reach)}</span>
                <span className="cold__last">
                  {r.lastCampaign}
                  {r.lead && <i>{r.lead}</i>}
                </span>
              </button>
            ))}
          </div>
          <p className="hint cold__note">
            Measured on every campaign a client has, start date or end date, so a long
            campaign that only just finished does not read as silence — and anyone with
            work already booked is never listed.{' '}
            <button
              className="linkish"
              onClick={() => onCopy(rows.map((r) => r.name).join('\n'), `${rows.length} client names copied`)}
            >
              Copy the names
            </button>
          </p>
        </>
      )}
    </div>
  );
}
