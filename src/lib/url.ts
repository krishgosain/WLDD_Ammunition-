import type { Filters, SortKey, View } from './types';
import { EMPTY_FILTERS } from './types';

/**
 * URL <-> app state. A search is a link: whatever is on screen can be pasted
 * into Slack and opens identically for the next person.
 */

export interface AppState {
  q: string;
  filters: Filters;
  sort: SortKey;
  view: View;
  pitch: boolean;
  open: string | null;
  client: string | null;
  compare: string[];
}

const LIST_KEYS = ['industries', 'services', 'clients', 'clientTypes', 'statuses', 'leads'] as const;
const NUM_KEYS = ['reachMin', 'reachMax', 'engMin', 'yearFrom', 'yearTo'] as const;

const SHORT: Record<string, string> = {
  industries: 'ind', services: 'svc', clients: 'cl', clientTypes: 'ct',
  statuses: 'st', leads: 'ld', reachMin: 'rmin', reachMax: 'rmax',
  engMin: 'emin', yearFrom: 'yf', yearTo: 'yt',
};

export function encode(s: AppState): string {
  const p = new URLSearchParams();
  if (s.q.trim()) p.set('q', s.q.trim());
  for (const k of LIST_KEYS) if (s.filters[k].length) p.set(SHORT[k], s.filters[k].join('~'));
  for (const k of NUM_KEYS) if (s.filters[k] !== null) p.set(SHORT[k], String(s.filters[k]));
  if (s.filters.hasReport) p.set('rep', '1');
  if (s.sort !== 'relevance') p.set('sort', s.sort);
  if (s.view !== 'grid') p.set('view', s.view);
  if (s.pitch) p.set('pitch', '1');
  if (s.open) p.set('open', s.open);
  if (s.client) p.set('dossier', s.client);
  if (s.compare.length) p.set('cmp', s.compare.join('~'));
  const qs = p.toString();
  return qs ? `?${qs}` : location.pathname;
}

const SORTS: SortKey[] = ['relevance', 'reach', 'engagement', 'recent', 'oldest', 'deliverables'];
const VIEWS: View[] = ['grid', 'field', 'gaps', 'health'];

export function decode(searchStr: string): AppState {
  const p = new URLSearchParams(searchStr);
  const filters: Filters = { ...EMPTY_FILTERS };
  for (const k of LIST_KEYS) {
    const v = p.get(SHORT[k]);
    filters[k] = v ? v.split('~').filter(Boolean) : [];
  }
  for (const k of NUM_KEYS) {
    const v = p.get(SHORT[k]);
    const n = v === null ? null : Number(v);
    filters[k] = n !== null && Number.isFinite(n) ? n : null;
  }
  filters.hasReport = p.get('rep') === '1';

  const sort = p.get('sort') as SortKey | null;
  const view = p.get('view') as View | null;
  return {
    q: p.get('q') ?? '',
    filters,
    sort: sort && SORTS.includes(sort) ? sort : 'relevance',
    view: view && VIEWS.includes(view) ? view : 'grid',
    pitch: p.get('pitch') === '1',
    open: p.get('open'),
    client: p.get('dossier'),
    compare: (p.get('cmp') ?? '').split('~').filter(Boolean),
  };
}

/** Replaces history rather than pushing, so Back leaves the app instead of
 *  unwinding every keystroke. */
export function syncUrl(s: AppState) {
  const next = encode(s);
  if (next !== location.search + (location.search ? '' : '')) {
    history.replaceState(null, '', next || location.pathname);
  }
}
