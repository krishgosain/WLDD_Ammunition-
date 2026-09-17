import type { Campaign } from './types';
import { pitchLine } from './format';

/** Writes the current result set as a CSV a deck can be built from. */
export function toCsv(items: Campaign[], pitch: boolean): string {
  const cols: [string, (c: Campaign) => string | number][] = [
    ['Client', (c) => c.client],
    ['Campaign', (c) => c.name],
    ['Industry', (c) => (c.isVertical ? c.industry : c.clientType)],
    ['Services', (c) => c.services.join('; ')],
    ['Objective', (c) => c.objective],
    ['Start', (c) => c.date],
    ['End', (c) => c.endDate],
    ['Deliverables', (c) => c.deliverables ?? ''],
    ['Achieved Reach', (c) => c.reach ?? ''],
    ['Achieved Engagement', (c) => c.eng ?? ''],
    ...(pitch ? [] : ([
      ['Promised Reach', (c: Campaign) => c.promisedReach ?? ''],
      ['Promised Engagement', (c: Campaign) => c.promisedEng ?? ''],
      ['Status', (c: Campaign) => c.status],
      ['Lead', (c: Campaign) => c.lead],
    ] as [string, (c: Campaign) => string | number][])),
    ['Report', (c) => c.report ?? ''],
  ];
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    cols.map(([h]) => esc(h)).join(','),
    ...items.map((c) => cols.map(([, get]) => esc(get(c))).join(',')),
  ].join('\n');
}

export function download(filename: string, text: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  // Revoke on the next tick so the download has already started.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function digestOf(items: Campaign[]): string {
  return items.map(pitchLine).join('\n');
}

/** Clipboard with a fallback for non-secure contexts, where the async API is absent. */
export async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch { return false; }
  }
}
