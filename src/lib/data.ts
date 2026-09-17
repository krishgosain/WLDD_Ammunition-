import type { Campaign, Meta } from './types';

export interface Dataset { all: Campaign[]; meta: Meta; byId: Map<string, Campaign> }

/**
 * Loads the archive.
 *
 * The data is fetched rather than imported so it downloads in parallel with the
 * bundle, parses natively and caches on its own hash. The lowercase haystack is
 * rebuilt here — regenerating it costs a few milliseconds once, against roughly
 * 100kB of transfer on every cold load if it were shipped.
 */
export async function loadData(signal?: AbortSignal): Promise<Dataset> {
  const base = import.meta.env.BASE_URL ?? '/';
  const [campaignsRes, metaRes] = await Promise.all([
    fetch(`${base}data/campaigns.json`, { signal }),
    fetch(`${base}data/meta.json`, { signal }),
  ]);
  if (!campaignsRes.ok || !metaRes.ok) {
    throw new Error(`Could not load the archive (${campaignsRes.status}/${metaRes.status})`);
  }
  const [rows, meta] = await Promise.all([
    campaignsRes.json() as Promise<Omit<Campaign, 'search'>[]>,
    metaRes.json() as Promise<Meta>,
  ]);

  const all: Campaign[] = rows.map((c) => ({
    ...c,
    search: `${c.client} ${c.name} ${c.objective} ${c.industry} ${c.services.join(' ')} ${c.lead} ${c.status}`
      .toLowerCase(),
  }));

  return { all, meta, byId: new Map(all.map((c) => [c.id, c])) };
}
