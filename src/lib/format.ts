/** Number, date and ratio formatting. One source of truth for every figure shown. */

/** Compact scale for cards and axes: 1_235_000 -> "1.2M". */
export function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${trim(n / 1e9)}B`;
  if (abs >= 1e6) return `${trim(n / 1e6)}M`;
  if (abs >= 1e3) return `${trim(n / 1e3)}K`;
  return String(Math.round(n));
}
const trim = (v: number) =>
  (v >= 100 ? v.toFixed(0) : v.toFixed(1)).replace(/\.0$/, '');

/** Full figure with separators, for detail panes where precision matters. */
export function fmtExact(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString('en-IN');
}

export function fmtDate(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return '—';
  return `${d} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1]} ${y}`;
}

export function fmtMonth(iso: string): string {
  if (!iso) return '—';
  const [y, m] = iso.split('-').map(Number);
  return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1]} ${y}`;
}

/**
 * 1.24 -> { label: "124% of target", over: true }. Null when not computable.
 *
 * Past 100x the promise the percentage stops carrying information and starts
 * being noise on the card ("129773560% of target"), so it collapses to a
 * multiplier. The underlying figures are never altered — only this derived
 * label, which is ours rather than the sheet's.
 */
const RATIO_CEILING = 100;
export function fmtRatio(r: number | null): { label: string; over: boolean } | null {
  if (r === null || !Number.isFinite(r) || r < 0) return null;
  if (r >= RATIO_CEILING) return { label: `over ${RATIO_CEILING}× target`, over: true };
  return { label: `${Math.round(r * 100)}% of target`, over: r >= 1 };
}

/** Parses what a person types into a reach box: "10M", "1.5 cr", "500k". */
export function parseInput(raw: string): number | null {
  const t = raw.trim().replace(/,/g, '');
  if (!t) return null;
  const m = t.match(/^([\d.]+)\s*(m|mn|million|k|thousand|cr|crore|l|lakh|b|bn|billion)?$/i);
  if (!m) return null;
  const v = parseFloat(m[1]);
  if (!Number.isFinite(v)) return null;
  const u = (m[2] || '').toLowerCase();
  const mult =
    /^(b|bn|billion)$/.test(u) ? 1e9 :
    /^(m|mn|million)$/.test(u) ? 1e6 :
    /^(cr|crore)$/.test(u) ? 1e7 :
    /^(l|lakh)$/.test(u) ? 1e5 :
    /^(k|thousand)$/.test(u) ? 1e3 : 1;
  return v * mult;
}

/** The line a BD person pastes into a deck or a chat. */
export function pitchLine(c: {
  client: string; name: string; reach: number | null; eng: number | null;
  date: string; deliverables: number | null;
}): string {
  const bits = [`${c.client} — ${c.name}`];
  const figures: string[] = [];
  if (c.reach !== null) figures.push(`${fmt(c.reach)} reach`);
  if (c.eng !== null) figures.push(`${fmt(c.eng)} engagement`);
  if (c.deliverables) figures.push(`${fmtExact(c.deliverables)} deliverables`);
  if (figures.length) bits.push(figures.join(' · '));
  if (c.date) bits.push(fmtMonth(c.date));
  return bits.join(' | ');
}
