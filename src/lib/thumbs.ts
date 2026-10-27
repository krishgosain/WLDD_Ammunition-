import { useEffect, useState } from 'react';

/** A picture lifted out of a campaign's report. */
export type Thumb = { file: string; w: number | null; h: number | null };
type Index = { builtAt?: string; campaigns: Record<string, Thumb[]> };

let cache: Index | null = null;
let inflight: Promise<Index> | null = null;

/**
 * The thumbnails built from the reports, if any have been built.
 *
 * The index is optional by design: `npm run thumbs` needs Drive access, so a
 * checkout without it simply has no pictures and the dossier shows none
 * rather than breaking. Fetched once and shared, because the dossier opens
 * and closes constantly.
 */
function load(base: string): Promise<Index> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetch(`${base}data/thumbs.json`)
      .then((r) => (r.ok ? r.json() : { campaigns: {} }))
      .catch(() => ({ campaigns: {} }))
      .then((j: Index) => { cache = j; return j; });
  }
  return inflight;
}

/** Thumbnails for these campaigns, best-performing first, capped. */
export function useThumbs(ids: string[], limit = 8): Thumb[] {
  const [thumbs, setThumbs] = useState<Thumb[]>([]);
  const key = ids.join(',');

  useEffect(() => {
    let live = true;
    const base = import.meta.env.BASE_URL ?? '/';
    load(base).then((index) => {
      if (!live) return;
      const out: Thumb[] = [];
      for (const id of key ? key.split(',') : []) {
        for (const t of index.campaigns?.[id] ?? []) {
          if (out.length < limit) out.push(t);
        }
      }
      setThumbs(out);
    });
    return () => { live = false; };
  }, [key, limit]);

  return thumbs;
}
