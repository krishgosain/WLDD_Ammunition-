import {
  useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, lazy, Suspense,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Campaign, Filters, SortKey, View, FacetKey } from './lib/types';
import { EMPTY_FILTERS } from './lib/types';
import { search, countActive, buildVocabulary } from './lib/search';
import { fmt } from './lib/format';
import { DEPARTMENTS, industryColour } from './lib/taxonomy';
import { decode, encode } from './lib/url';
import { useHotkeys } from './lib/useHotkeys';
import { toCsv, download, digestOf, copy } from './lib/export';
import { loadData, type Dataset } from './lib/data';

import SearchBar from './components/SearchBar';
import FilterRail from './components/FilterRail';
import ProductGrid from './components/ProductGrid';
import QuickView from './components/QuickView';
import CompareTray, { CompareTable } from './components/CompareTray';
import CommandPalette from './components/CommandPalette';
import ClientDossier from './components/ClientDossier';
import ShortcutHelp from './components/ShortcutHelp';
import Backdrop from './components/Backdrop';
import Skeleton from './components/Skeleton';
import Segmented from './components/Segmented';
import {
  IconWarn, IconSun, IconMoon, IconFilter, IconLink, IconDownload, IconPresent, IconClose,
  IconWaves, IconRows, IconGrid,
} from './components/Icons';
import './styles/app.css';

// three.js is ~700kB; the grid must paint without it.
const ReachField = lazy(() => import('./components/ReachField'));

const MAX_COMPARE = 4;
const initial = decode(location.search);

/**
 * Loading gate. The archive is a fetch, so the shell renders a brand-correct
 * placeholder rather than a blank page, and says plainly when it cannot load.
 */
export default function App() {
  const [data, setData] = useState<Dataset | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    loadData(ac.signal)
      .then(setData)
      .catch((e: unknown) => {
        if ((e as Error)?.name === 'AbortError') return;
        setError(e instanceof Error ? e.message : 'Could not load the archive');
      });
    return () => ac.abort();
  }, []);

  useEffect(() => {
    const t = (localStorage.getItem('wldd-theme') as 'dark' | 'light') ?? 'dark';
    document.documentElement.dataset.theme = t;
  }, []);

  if (error) {
    return (
      <div className="app">
        <div className="empty" style={{ height: '100%' }}>
          <h3>The archive did not load</h3>
          <p>{error}</p>
          <button onClick={() => location.reload()}>Try again</button>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="app app--loading">
        <Backdrop enabled />
        <header className="topbar">
          <div className="topbar__row">
            <span className="mark">
              <span className="mark__dot" aria-hidden /> WLDD <em>Ammo</em>
            </span>
            <div className="search">
              <div className="search__field">
                <span className="search__input search__input--ghost" />
              </div>
            </div>
            <div className="topbar__actions" />
          </div>
        </header>
        <div className="shell">
          <div className="rail rail--ghost" aria-hidden>
            {Array.from({ length: 7 }, (_, i) => (
              <span className="skel__bar" key={i} style={{ width: `${52 + (i % 3) * 14}%`, height: 13 }} />
            ))}
          </div>
          <main className="main">
            <p className="count" role="status">Loading the archive…</p>
            <Skeleton />
          </main>
        </div>
      </div>
    );
  }
  return <Ammo data={data} />;
}

function Ammo({ data }: { data: Dataset }) {
  const { all: ALL, meta: META, byId: BY_ID } = data;
  const INDUSTRIES = useMemo(() => META.facets.industries.map((i) => i.value), [META]);
  // Built once from the archive, so new clients become searchable — and
  // misspellable — the moment they appear in the sheet.
  const vocab = useMemo(() => buildVocabulary(META), [META]);
  const [query, setQuery] = useState(initial.q);
  const [filters, setFilters] = useState<Filters>(initial.filters);
  const [sort, setSort] = useState<SortKey>(initial.sort);
  const [view, setView] = useState<View>(initial.view);
  const [pitch, setPitch] = useState(initial.pitch);
  const [openId, setOpenId] = useState<string | null>(initial.open);
  const [dossier, setDossier] = useState<string | null>(initial.client);
  const [compare, setCompare] = useState<string[]>(initial.compare);
  const [showCompare, setShowCompare] = useState(false);
  const [cmdk, setCmdk] = useState(false);
  const [help, setHelp] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>(
    () => (localStorage.getItem('wldd-theme') as 'dark' | 'light') ?? 'dark',
  );
  // The shader field is the one piece of pure decoration here, so it is a
  // preference rather than a fact of the interface.
  const [ambient, setAmbient] = useState(
    () => localStorage.getItem('wldd-ambient') !== 'off',
  );
  // Comfortable for browsing, compact for scanning a long result set.
  const [density, setDensity] = useState<'comfortable' | 'compact'>(
    () => (localStorage.getItem('wldd-density') as 'comfortable' | 'compact') ?? 'comfortable',
  );
  useEffect(() => { localStorage.setItem('wldd-density', density); }, [density]);
  useEffect(() => {
    localStorage.setItem('wldd-ambient', ambient ? 'on' : 'off');
  }, [ambient]);

  const searchRef = useRef<HTMLInputElement>(null);
  const topbarRef = useRef<HTMLElement>(null);

  // The topbar grows when the intent row has chips in it, so the sticky filter
  // rail has to track its real height rather than assume one.
  useEffect(() => {
    const el = topbarRef.current;
    if (!el) return;
    const apply = () =>
      document.documentElement.style.setProperty('--topbar-h', `${el.offsetHeight}px`);
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    apply();
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('wldd-theme', theme);
  }, [theme]);

  // Deferring keeps typing at 60fps while the 1,700-row pass runs behind it.
  const deferredQuery = useDeferredValue(query);
  const result = useMemo(
    () => search(ALL, deferredQuery, filters, sort, vocab),
    [ALL, deferredQuery, filters, sort, vocab],
  );

  const state = useMemo(
    () => ({ q: query, filters, sort, view, pitch, open: openId, client: dossier, compare }),
    [query, filters, sort, view, pitch, openId, dossier, compare],
  );

  // The URL always describes the screen, so any view can be pasted into Slack.
  useEffect(() => {
    const url = encode(state);
    history.replaceState(null, '', url || location.pathname);
  }, [state]);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 1800);
  }, []);

  const patch = useCallback((p: Partial<Filters>) => setFilters((f) => ({ ...f, ...p })), []);

  const reset = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setQuery('');
    setSort('relevance');
    flash('Reset');
  }, [flash]);

  const colourOf = useCallback(
    (c: Campaign) => (c.isVertical ? industryColour(c.industry, INDUSTRIES) : '#55556E'),
    [INDUSTRIES],
  );

  const togglePick = useCallback((c: Campaign) => {
    setCompare((cur) => {
      if (cur.includes(c.id)) return cur.filter((id) => id !== c.id);
      if (cur.length >= MAX_COMPARE) { flash(`Compare holds ${MAX_COMPARE}`); return cur; }
      return [...cur, c.id];
    });
  }, [flash]);

  const applyFacet = useCallback((facet: FacetKey, value: string) => {
    setFilters((f) => {
      const cur = f[facet];
      return { ...f, [facet]: cur.includes(value) ? cur : [...cur, value] };
    });
    setView('grid');
  }, []);

  const copyLink = useCallback(async () => {
    const url = `${location.origin}${location.pathname}${encode(state)}`;
    flash(await copy(url) ? 'Link copied' : 'Could not copy');
  }, [state, flash]);

  const exportCsv = useCallback(() => {
    if (!result.items.length) return flash('Nothing to export');
    download(`wldd-ammo-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(result.items, pitch));
    flash(`${result.items.length} rows exported`);
  }, [result.items, pitch, flash]);

  const onCopy = useCallback(async (text: string, label: string) => {
    flash(await copy(text) ? label : 'Could not copy');
  }, [flash]);

  const anyOverlay = Boolean(openId || dossier || cmdk || help || showCompare);

  useHotkeys([
    { key: 'k', meta: true, whileTyping: true, run: () => setCmdk((v) => !v) },
    { key: '/', run: () => searchRef.current?.focus() },
    { key: 'p', run: () => { setPitch((v) => { flash(v ? 'Pitch mode off' : 'Pitch mode on'); return !v; }); } },
    { key: 'g', run: () => setView('grid') },
    { key: 'f', run: () => setView('field') },
    { key: 't', run: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')) },
    { key: 'c', run: copyLink },
    { key: 'e', run: exportCsv },
    { key: 'r', run: reset },
    { key: 'd', run: () => setDensity((v) => (v === 'compact' ? 'comfortable' : 'compact')) },
    { key: '?', run: () => setHelp((v) => !v) },
    {
      key: 'Escape', whileTyping: true,
      run: () => {
        if (cmdk) setCmdk(false);
        else if (help) setHelp(false);
        else if (showCompare) setShowCompare(false);
        else if (railOpen) setRailOpen(false);
        else searchRef.current?.blur();
      },
    },
  ], [copyLink, exportCsv, reset, flash, cmdk, help, showCompare, railOpen]);

  const active = countActive(filters);
  const open = openId ? BY_ID.get(openId) ?? null : null;
  const picked = useMemo(() => new Set(compare), [compare]);
  const compareItems = useMemo(
    () => compare.map((id) => BY_ID.get(id)).filter(Boolean) as Campaign[],
    [BY_ID, compare],
  );
  const { shortfall, widened, tiers } = result;

  return (
    <div className="app">
      <Backdrop enabled={ambient} />
      <header className="topbar" ref={topbarRef}>
        <div className="topbar__row">
          <a className="mark" href={location.pathname} aria-label="WLDD Ammo — home">
            <span className="mark__dot" aria-hidden />
            WLDD <em>Ammo</em>
          </a>

          <SearchBar
            value={query} onChange={setQuery} query={result.query}
            resultCount={result.items.length} inputRef={searchRef}
          />

          <div className="topbar__actions">
            <button className="iconbtn railtoggle" onClick={() => setRailOpen((v) => !v)}
              aria-label="Filters" aria-expanded={railOpen}>
              <IconFilter />{active > 0 && <span className="num">{active}</span>}
            </button>
            <button className="iconbtn" onClick={() => setCmdk(true)} aria-label="Jump to">
              Jump <span className="kbd">⌘K</span>
            </button>
            <button className={pitch ? 'iconbtn iconbtn--on' : 'iconbtn'}
              onClick={() => setPitch((v) => !v)} aria-pressed={pitch}
              title="Hide internal columns so the screen can face a client">
              <IconPresent /> Pitch
            </button>
            <button className="iconbtn" onClick={copyLink} aria-label="Copy link to this search"><IconLink /></button>
            <button className="iconbtn" onClick={exportCsv} aria-label="Export results as CSV"><IconDownload /></button>
            <button className={ambient ? 'iconbtn' : 'iconbtn iconbtn--off'}
              onClick={() => setAmbient((v) => !v)} aria-pressed={ambient}
              aria-label="Toggle the ambient field" title="Ambient field">
              <IconWaves />
            </button>
            <button className="iconbtn" onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              aria-label="Toggle theme">{theme === 'dark' ? <IconSun /> : <IconMoon />}</button>
            <button className="iconbtn" onClick={() => setHelp(true)} aria-label="Keyboard shortcuts">?</button>
          </div>
        </div>

        <nav className="depts" aria-label="Departments">
          {DEPARTMENTS.map((d) => {
            const on = d.industries.some((i) => filters.industries.includes(i));
            return (
              <button key={d.label} className={on ? 'dept dept--on' : 'dept'} aria-pressed={on}
                onClick={() => patch({
                  industries: on
                    ? filters.industries.filter((i) => !d.industries.includes(i))
                    : [...new Set([...filters.industries, ...d.industries])],
                })}>
                {d.label}
              </button>
            );
          })}
          {active > 0 && (
            <button className="dept dept--clear" onClick={reset}>Clear {active}</button>
          )}
        </nav>
      </header>

      <div className="shell">
        <FilterRail
          all={ALL} meta={META} query={result.query} filters={filters}
          pitch={pitch} open={railOpen} onPatch={patch} onReset={reset}
        />

        <main className="main">
          <div className="toolbar">
            <p className="count">
              {result.items.length
                ? <><strong className="num">{result.items.length}</strong>{' '}
                    {result.items.length === 1 ? 'campaign' : 'campaigns'}</>
                : 'Nothing matched'}
              {result.poolSize !== result.items.length && result.poolSize > 0 && !shortfall && (
                <> of <span className="num">{result.poolSize}</span> in scope</>
              )}
            </p>
            <div className="toolbar__spacer" />

            <Segmented
              label="View"
              value={view}
              onChange={setView}
              options={[['grid', 'Grid'], ['field', 'Field']]}
            />

            {view === 'grid' && (
              <button
                className="iconbtn"
                onClick={() => setDensity((d) => (d === 'compact' ? 'comfortable' : 'compact'))}
                aria-pressed={density === 'compact'}
                aria-label="Toggle density"
                title={density === 'compact' ? 'Comfortable rows' : 'Compact rows'}
              >
                {density === 'compact' ? <IconRows /> : <IconGrid />}
              </button>
            )}

            {view === 'grid' && (
              <select className="select" value={sort} aria-label="Sort by"
                onChange={(e) => setSort(e.target.value as SortKey)}>
                <option value="relevance">Best match</option>
                <option value="reach">Highest reach</option>
                <option value="engagement">Highest engagement</option>
                <option value="deliverables">Most deliverables</option>
                <option value="recent">Most recent</option>
                <option value="oldest">Oldest first</option>
              </select>
            )}
          </div>

          {/*
            The honest fallback. A floor is never quietly widened — the real
            ceiling is named, then the best of what exists is shown with its
            true figures.
          */}
          {shortfall && (
            <div className="shortfall" role="status">
              <span className="shortfall__icon"><IconWarn /></span>
              <div>
                <p className="shortfall__lead">
                  No {shortfall.scope ?? 'matching'} campaign reached{' '}
                  <b>{fmt(shortfall.asked)}</b> {shortfall.metric}.
                </p>
                <p className="shortfall__body">
                  The highest is <b>{shortfall.best.client}</b> — {shortfall.best.name} at{' '}
                  <b>{fmt(shortfall.metric === 'reach' ? shortfall.best.reach : shortfall.best.eng)}</b>.
                  Showing the top {shortfall.shown} with their real figures.
                </p>
              </div>
            </div>
          )}

          {/* Broad matches are shown only when nothing tighter exists, and
              never without saying so. */}
          {widened && !shortfall && result.items.length > 0 && (
            <div className="shortfall shortfall--info" role="status">
              <span className="shortfall__icon"><IconWarn /></span>
              <div>
                <p className="shortfall__lead">
                  No campaign matches all of that.
                </p>
                <p className="shortfall__body">
                  Showing {result.items.length} that match part of it — each card says which.
                </p>
              </div>
            </div>
          )}

          {view === 'grid' && (
            <ProductGrid
              items={result.items} tiers={tiers} density={density}
              colourOf={colourOf} picked={picked} pitch={pitch}
              onOpen={(c) => setOpenId(c.id)} onPick={togglePick} onCopy={onCopy}
              emptyPool={result.poolSize === 0} onReset={reset}
            />
          )}
          {view === 'field' && (
            <Suspense fallback={<div className="field"><div className="empty"><p>Loading the field…</p></div></div>}>
              <ReachField items={result.items} colourOf={colourOf} onPick={(c) => setOpenId(c.id)} />
            </Suspense>
          )}
        </main>
      </div>

      {railOpen && (
        <div className="scrim" style={{ zIndex: 69 }} onClick={() => setRailOpen(false)} />
      )}

      <AnimatePresence>
        {compareItems.length > 0 && (
          <CompareTray
            items={compareItems}
            onRemove={(id) => setCompare((c) => c.filter((x) => x !== id))}
            onClear={() => setCompare([])}
            onOpen={() => setShowCompare(true)}
            onCopy={() => onCopy(digestOf(compareItems), 'Copied')}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <QuickView
            key={open.id} campaign={open} colour={colourOf(open)} pitch={pitch}
            inCompare={picked.has(open.id)}
            onClose={() => setOpenId(null)} onPick={togglePick}
            onClient={(name) => { setOpenId(null); setDossier(name); }}
            onCopy={onCopy}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {dossier && (
          <ClientDossier
            key={dossier} name={dossier} all={ALL} meta={META} pitch={pitch}
            onClose={() => setDossier(null)} onOpen={(c) => { setDossier(null); setOpenId(c.id); }}
            onCopy={onCopy} onFilter={(name) => applyFacet('clients', name)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCompare && (
          <>
            <motion.div className="scrim" onClick={() => setShowCompare(false)}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            <motion.aside className="pane" role="dialog" aria-modal="true" aria-label="Compare campaigns"
              style={{ width: 'min(880px, 100vw)' }}
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 34, stiffness: 340 }}>
              <header className="pane__head">
                <div style={{ flex: 1 }}>
                  <span className="card__client">Side by side</span>
                  <h2 className="pane__title">{compareItems.length} campaigns</h2>
                </div>
                <button className="pane__close" onClick={() => setShowCompare(false)} aria-label="Close">
                  <IconClose />
                </button>
              </header>
              <div className="pane__body">
                <CompareTable items={compareItems} pitch={pitch} />
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>{cmdk && (
        <CommandPalette meta={META} onPick={applyFacet} onClose={() => setCmdk(false)} />
      )}</AnimatePresence>

      <AnimatePresence>{help && <ShortcutHelp onClose={() => setHelp(false)} />}</AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div className="toast" role="status"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <span className="sr-only" aria-live="polite">
        {anyOverlay ? 'Panel open' : `${result.items.length} campaigns listed`}
      </span>
    </div>
  );
}
