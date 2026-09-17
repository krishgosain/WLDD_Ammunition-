/** Shapes emitted by scripts/ingest.mjs. Keep in sync with that file. */

export interface Campaign {
  id: string;
  client: string;
  clientId: string;
  name: string;
  objective: string;
  industry: string;
  /** False when the Industry column held Agency / Person / Others. */
  isVertical: boolean;
  clientType: 'Brand' | 'Agency' | 'Individual' | 'Unclassified';
  services: string[];
  legacyServices: string[];
  status: string;
  lead: string;
  /** ISO date, '' when the sheet had nothing parseable. */
  date: string;
  endDate: string;
  year: number | null;
  deliverables: number | null;
  reach: number | null;
  eng: number | null;
  promisedReach: number | null;
  promisedEng: number | null;
  reachRatio: number | null;
  engRatio: number | null;
  report: string | null;
  /** True when data/corrections.json supplied this campaign's figures. */
  corrected: boolean;
  search: string;
}

export interface Correction {
  label: string;
  note: string;
  was: { reach?: string; eng?: string };
  now: { reach?: number; eng?: number };
}

export interface FacetValue { value: string; count: number }

export interface ClientSummary {
  name: string;
  count: number;
  reach: number;
  eng: number;
  industries: string[];
  services: string[];
  first: string;
  last: string;
  withReport: number;
}

export interface Gap {
  industry: string;
  count: number;
  best: number;
  above: number;
  withReport: number;
  coverage: number;
}

export interface Meta {
  generatedAt: string;
  totals: {
    campaigns: number; clients: number; industries: number;
    reach: number; eng: number; deliverables: number;
    withReport: number; years: number[];
  };
  facets: {
    industries: FacetValue[]; services: FacetValue[]; statuses: FacetValue[];
    clientTypes: FacetValue[]; leads: FacetValue[]; clients: FacetValue[];
  };
  clients: ClientSummary[];
  gaps: Gap[];
  gapBar: number;
  health: {
    total: number; noReport: number; noFigures: number; badDate: number;
    unclassified: number; engOverReach: string[]; duplicatedFigures: string[];
    extremeReach: { label: string; reach: number; raw: string }[];
    corrected: Correction[];
    unknownServices: string[];
  };
}

export type FacetKey =
  | 'industries' | 'services' | 'clients' | 'clientTypes' | 'statuses' | 'leads';

export interface Filters {
  industries: string[];
  services: string[];
  clients: string[];
  clientTypes: string[];
  statuses: string[];
  leads: string[];
  reachMin: number | null;
  reachMax: number | null;
  engMin: number | null;
  yearFrom: number | null;
  yearTo: number | null;
  hasReport: boolean;
}

export const EMPTY_FILTERS: Filters = {
  industries: [], services: [], clients: [], clientTypes: [], statuses: [], leads: [],
  reachMin: null, reachMax: null, engMin: null, yearFrom: null, yearTo: null,
  hasReport: false,
};

export const FACET_TO_FILTER: Record<FacetKey, keyof Filters> = {
  industries: 'industries', services: 'services', clients: 'clients',
  clientTypes: 'clientTypes', statuses: 'statuses', leads: 'leads',
};

/** Structured intent pulled out of the search box. */
export interface Query {
  raw: string;
  terms: string[];
  industries: string[];
  services: string[];
  clients: string[];
  reachMin: number | null;
  engMin: number | null;
  year: number | null;
}

/**
 * Describes the distance between what was asked for and what exists, so the UI
 * can say it plainly rather than presenting near-misses as matches.
 */
export interface Shortfall {
  metric: 'reach' | 'engagement';
  asked: number;
  best: Campaign;
  scope: string | null;
  shown: number;
}

export interface SearchResult {
  query: Query;
  items: Campaign[];
  /** Size of the categorical pool before numeric floors were applied. */
  poolSize: number;
  shortfall: Shortfall | null;
}

export type SortKey =
  | 'relevance' | 'reach' | 'engagement' | 'recent' | 'oldest' | 'deliverables';

export type View = 'grid' | 'field' | 'gaps' | 'health';
