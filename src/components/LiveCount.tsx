import { fmtDate } from '../lib/format';

/**
 * The archive size, as flip-board digits.
 *
 * The number is read from the dataset, which the daily workflow rebuilds from
 * the Google Sheet — so it moves on its own as campaigns land. It sits in the
 * corner rather than the headline: it is a status, not the point of the page.
 */
export default function LiveCount({ total, syncedAt }: { total: number; syncedAt: string }) {
  const digits = String(total).split('');
  return (
    <div
      className="live"
      role="status"
      aria-label={`${total} campaigns, synced from the Google Sheet on ${fmtDate(syncedAt)}`}
      title="Updates itself when new campaigns land in the sheet"
    >
      <span className="live__digits" aria-hidden>
        {digits.map((d, i) => <span className="live__digit" key={i}>{d}</span>)}
      </span>
      <span className="live__text" aria-hidden>
        <span className="live__label"><span className="live__dot" />Campaigns, live</span>
        <span className="live__sub">Google Sheet · {fmtDate(syncedAt)}</span>
      </span>
    </div>
  );
}
