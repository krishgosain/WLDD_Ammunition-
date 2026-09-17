import { useMemo, useState } from 'react';
import type { Campaign, Filters, Query, FacetKey, Meta } from '../lib/types';
import { facetCounts } from '../lib/search';
import { parseInput, fmt } from '../lib/format';

function Facet({
  title, facet, values, counts, selected, onToggle, searchable = false, startOpen = false,
}: {
  title: string;
  facet: FacetKey;
  values: string[];
  counts: Map<string, number>;
  selected: string[];
  onToggle: (facet: FacetKey, value: string) => void;
  searchable?: boolean;
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const [find, setFind] = useState('');

  const shown = useMemo(() => {
    const f = find.toLowerCase();
    return values
      .filter((v) => !f || v.toLowerCase().includes(f))
      // A ticked value stays visible even at zero, so it can be un-ticked.
      .filter((v) => (counts.get(v) ?? 0) > 0 || selected.includes(v));
  }, [values, find, counts, selected]);

  return (
    <div className={open ? 'facet facet--open' : 'facet'}>
      <button className="facet__head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {title}
        {selected.length > 0 && <span className="facet__n num">{selected.length}</span>}
        <span className="facet__caret" aria-hidden>▾</span>
      </button>
      {open && (
        <div className="facet__body">
          {searchable && values.length > 12 && (
            <input
              className="facet__find"
              value={find}
              placeholder={`Find ${title.toLowerCase()}…`}
              onChange={(e) => setFind(e.target.value)}
            />
          )}
          <div className={searchable ? 'facet__list facet__list--scroll' : 'facet__list'}>
            {shown.map((v) => (
              <label className="opt" key={v}>
                <input
                  type="checkbox"
                  checked={selected.includes(v)}
                  onChange={() => onToggle(facet, v)}
                />
                <span className="opt__label" title={v}>{v}</span>
                <span className="opt__n num">{counts.get(v) ?? 0}</span>
              </label>
            ))}
            {!shown.length && <p className="facet__none">Nothing in the current scope.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function FilterRail({
  all, meta, query, filters, pitch, open, onPatch, onReset,
}: {
  all: Campaign[];
  meta: Meta;
  query: Query;
  filters: Filters;
  pitch: boolean;
  open: boolean;
  onPatch: (p: Partial<Filters>) => void;
  onReset: () => void;
}) {
  // Five facet passes over 1,700 rows on every keystroke is wasteful; the
  // result only changes when the query or the other filters do.
  const counts = useMemo(() => ({
    industries: facetCounts(all, query, filters, 'industries'),
    services: facetCounts(all, query, filters, 'services'),
    clients: facetCounts(all, query, filters, 'clients'),
    clientTypes: facetCounts(all, query, filters, 'clientTypes'),
    statuses: facetCounts(all, query, filters, 'statuses'),
    leads: facetCounts(all, query, filters, 'leads'),
  }), [all, query, filters]);

  const toggle = (facet: FacetKey, value: string) => {
    const cur = filters[facet];
    onPatch({ [facet]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] });
  };

  const v = meta.facets;
  return (
    <aside className={open ? 'rail rail--open' : 'rail'} aria-label="Filters">
      <Facet title="Industry" facet="industries" values={v.industries.map((x) => x.value)}
        counts={counts.industries} selected={filters.industries} onToggle={toggle} searchable startOpen />
      <Facet title="Service" facet="services" values={v.services.map((x) => x.value)}
        counts={counts.services} selected={filters.services} onToggle={toggle} searchable startOpen />
      <Facet title="Client" facet="clients" values={v.clients.map((x) => x.value)}
        counts={counts.clients} selected={filters.clients} onToggle={toggle} searchable />
      <Facet title="Client type" facet="clientTypes" values={v.clientTypes.map((x) => x.value)}
        counts={counts.clientTypes} selected={filters.clientTypes} onToggle={toggle} />
      {!pitch && (
        <>
          <Facet title="Status" facet="statuses" values={v.statuses.map((x) => x.value)}
            counts={counts.statuses} selected={filters.statuses} onToggle={toggle} />
          <Facet title="Campaign lead" facet="leads" values={v.leads.map((x) => x.value)}
            counts={counts.leads} selected={filters.leads} onToggle={toggle} searchable />
        </>
      )}

      <div className="facet facet--open">
        <span className="facet__head" style={{ cursor: 'default' }}>Figures</span>
        <div className="facet__body">
          <div className="range">
            <input
              inputMode="numeric" aria-label="Minimum reach" placeholder="Reach min"
              defaultValue={filters.reachMin ? fmt(filters.reachMin) : ''}
              onChange={(e) => onPatch({ reachMin: parseInput(e.target.value) })}
            />
            <input
              inputMode="numeric" aria-label="Maximum reach" placeholder="Reach max"
              defaultValue={filters.reachMax ? fmt(filters.reachMax) : ''}
              onChange={(e) => onPatch({ reachMax: parseInput(e.target.value) })}
            />
          </div>
          <p className="hint">Accepts 500K, 10M, 1.5Cr.</p>
          <div className="range">
            <input
              inputMode="numeric" aria-label="Year from" placeholder="From year"
              defaultValue={filters.yearFrom ?? ''}
              onChange={(e) => onPatch({ yearFrom: e.target.value ? Number(e.target.value) : null })}
            />
            <input
              inputMode="numeric" aria-label="Year to" placeholder="To year"
              defaultValue={filters.yearTo ?? ''}
              onChange={(e) => onPatch({ yearTo: e.target.value ? Number(e.target.value) : null })}
            />
          </div>
          <label className="opt" style={{ marginTop: 6 }}>
            <input type="checkbox" checked={filters.hasReport}
              onChange={(e) => onPatch({ hasReport: e.target.checked })} />
            <span className="opt__label">Has a report link</span>
          </label>
        </div>
      </div>

      <button className="rail__reset" onClick={onReset}>Reset everything</button>
    </aside>
  );
}
