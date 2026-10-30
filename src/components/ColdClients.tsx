import { useMemo } from 'react';
import type { Campaign } from '../lib/types';
import { coldClients, coldCsv } from '../lib/revive';
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

  const download = () => {
    const blob = new Blob([coldCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `WLDD dead clients - ${months} month${months === 1 ? '' : 's'}.csv`;
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
            Nothing from them in <b>{months} month{months === 1 ? '' : 's'}</b>
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
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>{m} month{m === 1 ? '' : 's'}</option>
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
          <p>Every client has worked with WLDD inside the last {months} month{months === 1 ? '' : 's'}, or has work booked ahead.</p>
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
