import { useMemo, useState } from 'react';
import type { Campaign, Filters, Query, FacetKey, Meta } from '../lib/types';
import { facetCounts, inScope } from '../lib/search';
import { coldFacetCounts } from '../lib/revive';
import { parseInput, fmt } from '../lib/format';
import { SERIES, industryColour } from '../lib/taxonomy';

/**
 * One filter group, drawn as a card.
 *
 * Long facets (industries, clients, leads) are a searchable checklist; short
 * ones (services, client types, statuses) are chips, because six to fourteen
 * options read faster as a cloud than as a column. Every group starts open:
 * the rail is for scanning, not for hunting.
 */
function Facet({
  title, facet, values, counts, selected, onToggle, colour, shape,
  kind = 'list', searchable = false, colourOf,
}: {
  title: string;
  facet: FacetKey;
  values: string[];
  counts: Map<string, number>;
  selected: string[];
  onToggle: (facet: FacetKey, value: string) => void;
  colour: string;
  shape: string;
  kind?: 'list' | 'chips';
  searchable?: boolean;
  colourOf?: (v: string) => string;
}) {
  const [open, setOpen] = useState(true);
  const [find, setFind] = useState('');

  const shown = useMemo(() => {
    const f = find.toLowerCase();
    return values
      .filter((v) => !f || v.toLowerCase().includes(f))
      .filter((v) => (counts.get(v) ?? 0) > 0 || selected.includes(v));
  }, [values, find, counts, selected]);

  return (
    <section className={open ? 'facet facet--open' : 'facet'} style={{ ['--accent' as string]: colour }}>
      <button className="facet__head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="facet__mark" style={{ borderRadius: shape }} aria-hidden />
        <span className="facet__title">{title}</span>
        {selected.length > 0 && <span className="facet__n num">{selected.length}</span>}
        <span className="facet__total num">{values.length}</span>
        <span className="facet__caret" aria-hidden>▾</span>
      </button>
      {open && (
        <div className="facet__body">
          {searchable && values.length > 12 && (
            <input
              className="facet__find"
              value={find}
              placeholder={`Find ${title.toLowerCase()}…`}
              aria-label={`Find ${title.toLowerCase()}`}
              onChange={(e) => setFind(e.target.value)}
            />
          )}
          {kind === 'chips' ? (
            <div className="facet__chips">
              {shown.map((v) => {
                const on = selected.includes(v);
                return (
                  <label className={on ? 'chipopt chipopt--on' : 'chipopt'} key={v}>
                    <input type="checkbox" checked={on} onChange={() => onToggle(facet, v)} />
                    <span>{v}</span>
                    <span className="chipopt__n num">{counts.get(v) ?? 0}</span>
                  </label>
                );
              })}
              {!shown.length && <p className="facet__none">Nothing in the current scope.</p>}
            </div>
          ) : (
            <div className={searchable ? 'facet__list facet__list--scroll' : 'facet__list'}>
              {shown.map((v) => (
                <label className="opt" key={v}
                  style={colourOf ? { ['--accent' as string]: colourOf(v) } : undefined}>
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
          )}
        </div>
      )}
    </section>
  );
}

export default function FilterRail({
  all, meta, query, filters, pitch, open, coldMonths, onPatch, onReset,
}: {
  all: Campaign[];
  meta: Meta;
  query: Query;
  filters: Filters;
  pitch: boolean;
  open: boolean;
  /** Months of silence when the call list is on screen, else null. */
  coldMonths: number | null;
  onPatch: (p: Partial<Filters>) => void;
  onReset: () => void;
}) {
  /**
   * Counts in the unit the screen is actually showing.
   *
   * On the board a facet counts campaigns. On the call list that is the wrong
   * unit — "446 clients to call" beside "Amplification 1,709" reads as a
   * promise the filter cannot keep — so each value counts the clients that
   * would remain if it were ticked.
   *
   * Either way the facet's own selections are dropped before counting, so
   * ticking one value does not zero the numbers beside its siblings.
   */
  const counts = useMemo(() => {
    const of = (facet: FacetKey) => {
      if (coldMonths === null) return facetCounts(all, query, filters, facet);
      const relaxed: Filters = { ...filters, [facet]: [] };
      return coldFacetCounts(all, coldMonths, facet, (c) => inScope(c, query, relaxed));
    };
    return {
      industries: of('industries'),
      services: of('services'),
      clients: of('clients'),
      clientTypes: of('clientTypes'),
      statuses: of('statuses'),
      leads: of('leads'),
    };
  }, [all, query, filters, coldMonths]);

  const toggle = (facet: FacetKey, value: string) => {
    const cur = filters[facet];
    onPatch({ [facet]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] });
  };

  const v = meta.facets;
  const industries = v.industries.map((x) => x.value);
  const [red, violet, , , blue, green, pink, teal] = SERIES;
  return (
    <aside className={open ? 'rail rail--open' : 'rail'} aria-label="Filters">
      <Facet title="Industry" facet="industries" values={industries} colour={red} shape="50%"
        counts={counts.industries} selected={filters.industries} onToggle={toggle} searchable
        colourOf={(x) => industryColour(x, industries)} />
      <Facet title="Service" facet="services" values={v.services.map((x) => x.value)} colour={violet} shape="4px"
        counts={counts.services} selected={filters.services} onToggle={toggle} kind="chips" />
      <Facet title="Client" facet="clients" values={v.clients.map((x) => x.value)} colour={teal} shape="50% 50% 0 50%"
        counts={counts.clients} selected={filters.clients} onToggle={toggle} searchable />
      <Facet title="Client type" facet="clientTypes" values={v.clientTypes.map((x) => x.value)} colour={green} shape="50%"
        counts={counts.clientTypes} selected={filters.clientTypes} onToggle={toggle} kind="chips" />
      {!pitch && (
        <>
          <Facet title="Status" facet="statuses" values={v.statuses.map((x) => x.value)} colour={blue} shape="4px"
            counts={counts.statuses} selected={filters.statuses} onToggle={toggle} kind="chips" />
          <Facet title="Campaign lead" facet="leads" values={v.leads.map((x) => x.value)} colour={pink} shape="50% 0 50% 50%"
            counts={counts.leads} selected={filters.leads} onToggle={toggle} searchable />
        </>
      )}

      <section className="facet facet--open" style={{ ['--accent' as string]: SERIES[2] }}>
        <span className="facet__head" style={{ cursor: 'default' }}>
          <span className="facet__mark" style={{ borderRadius: '50% 50% 0 50%' }} aria-hidden />
          <span className="facet__title">Figures</span>
        </span>
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
          <label className="switch">
            <input type="checkbox" checked={filters.hasReport}
              onChange={(e) => onPatch({ hasReport: e.target.checked })} />
            <span className="switch__track" aria-hidden><span className="switch__knob" /></span>
            <span>Has a report link</span>
          </label>
        </div>
      </section>

      <button className="rail__reset" onClick={onReset}>Reset everything</button>
    </aside>
  );
}
