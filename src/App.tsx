import {
  useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, lazy, Suspense,
} from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { Campaign, Filters, SortKey, View, FacetKey } from './lib/types';
import { EMPTY_FILTERS } from './lib/types';
import { search, countActive, buildVocabulary } from './lib/search';
import { fmt } from './lib/format';
import {
  DEPARTMENTS, DEPARTMENT_COLOURS, UNCLASSIFIED_COLOUR, industryColour,
} from './lib/taxonomy';
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
import LiveCount from './components/LiveCount';
import Ticker from './components/Ticker';
import {
  IconWarn, IconSun, IconMoon, IconFilter, IconLink, IconPresent, IconClose,
  IconWaves, IconRows, IconGrid,
} from './components/Icons';
// Fonts are served from the app itself, not Google: same-origin fonts can be
// embedded when the one-pager is drawn into a PDF, and there is no
// render-blocking request to a third party.
import '@fontsource/anton/latin-400.css';
import '@fontsource/sora/latin-300.css';
import '@fontsource/sora/latin-400.css';
import '@fontsource/sora/latin-500.css';
import '@fontsource/sora/latin-600.css';
import '@fontsource/sora/latin-700.css';
import './styles/app.css';

// three.js is ~700kB; the board must paint without it.
const ReachField = lazy(() => import('./components/ReachField'));
// The pitch one-pager is a separate screen; the board should not carry it.
const OnePager = lazy(() => import('./components/OnePager'));

const MAX_COMPARE = 4;
const THEME_KEY = 'wldd-theme-v2';
const initial = decode(location.search);

type Theme = 'light' | 'dark';
const storedTheme = (): Theme =>
  (localStorage.getItem(THEME_KEY) as Theme | null) ?? 'light';

/** The four brand shapes beside the headline. Pure decoration. */
function Shapes() {
  return (
    <div className="hero__shapes" aria-hidden>
      <span className="shape shape--circle" />
      <span className="shape shape--leaf" />
      <span className="shape shape--square" />
      <span className="shape shape--drop" />
    </div>
  );
}

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
    document.documentElement.dataset.theme = storedTheme();
  }, []);

  if (error) {
    return (
      <div className="app">
        <div className="empty" style={{ minHeight: '100vh' }}>
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
        <header className="topbar">
          <div className="topbar__row">
            <span className="mark"><span className="mark__word">WLDD</span> <em>Ammo</em></span>
          </div>
        </header>
        <section className="hero">
          <div className="hero__row">
            <h1 className="hero__title">Watch our <span>magic</span></h1>
            <Shapes />
          </div>
          <div className="search">
            <div className="search__field">
              <span className="search__input search__input--ghost" />
            </div>
          </div>
        </section>
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
  const [onePager, setOnePager] = useState(false);
  const [cmdk, setCmdk] = useState(false);
  const [help, setHelp] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(storedTheme);
  // The ambient glow is the one piece of pure decoration here, so it is a
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
  const boardRef = useRef<HTMLDivElement>(null);

  // The sticky rail sits under the sticky topbar, so it has to track the
  // topbar's real height rather than assume one.
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
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  // Deferring keeps typing at 60fps while the 2,000-row pass runs behind it.
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
    (c: Campaign) => (c.isVertical ? industryColour(c.industry, INDUSTRIES) : UNCLASSIFIED_COLOUR),
    [INDUSTRIES],
  );

  const togglePick = useCallback((c: Campaign) => {
    setCompare((cur) => {
      if (cur.includes(c.id)) return cur.filter((id) => id !== c.id);
      if (cur.length >= MAX_COMPARE) { flash(`The kit holds ${MAX_COMPARE}`); return cur; }
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

  const toBoard = useCallback(() => {
    boardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const anyOverlay = Boolean(openId || dossier || cmdk || help || showCompare || onePager);

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
        else if (onePager) setOnePager(false);
        else if (showCompare) setShowCompare(false);
        else if (railOpen) setRailOpen(false);
        else searchRef.current?.blur();
      },
    },
  ], [copyLink, exportCsv, reset, flash, cmdk, help, showCompare, onePager, railOpen]);

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
            <span className="mark__word">WLDD</span> <em>Ammo</em>
          </a>
          <div className="topbar__spacer" />
          <LiveCount total={META.totals.campaigns} syncedAt={META.generatedAt} />
          <div className="topbar__actions">
            <button className="iconbtn railtoggle" onClick={() => setRailOpen((v) => !v)}
              aria-label="Filters" aria-expanded={railOpen}>
              <IconFilter />{active > 0 && <span className="num">{active}</span>}
            </button>
            <button className={pitch ? 'iconbtn iconbtn--pitch iconbtn--on' : 'iconbtn iconbtn--pitch'}
              onClick={() => setPitch((v) => !v)} aria-pressed={pitch}
              title="Hide internal columns so the screen can face a client">
              <IconPresent /> {pitch ? 'Pitch on' : 'Pitch'}
            </button>
            <button className="iconbtn iconbtn--round" onClick={copyLink} aria-label="Copy link to this search"><IconLink /></button>
            <button className={ambient ? 'iconbtn iconbtn--round' : 'iconbtn iconbtn--round iconbtn--off'}
              onClick={() => setAmbient((v) => !v)} aria-pressed={ambient}
              aria-label="Toggle the ambient field" title="Ambient field">
              <IconWaves />
            </button>
            <button className="iconbtn iconbtn--round" onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              aria-label="Toggle theme">{theme === 'dark' ? <IconSun /> : <IconMoon />}</button>
            <button className="iconbtn iconbtn--round" onClick={() => setHelp(true)} aria-label="Keyboard shortcuts">?</button>
          </div>
        </div>
      </header>

      <section className="hero">
        <div className="hero__row">
          <h1 className="hero__title">Watch our <span>magic</span></h1>
          <Shapes />
        </div>

        <SearchBar
          value={query} onChange={setQuery} query={result.query}
          resultCount={result.items.length} inputRef={searchRef} onSubmit={toBoard}
        />

        <nav className="depts" aria-label="Departments">
          {DEPARTMENTS.map((d) => {
            const on = d.industries.some((i) => filters.industries.includes(i));
            return (
              <button key={d.label} className={on ? 'dept dept--on' : 'dept'} aria-pressed={on}
                style={{ ['--accent' as string]: DEPARTMENT_COLOURS[d.label] }}
                onClick={() => patch({
                  industries: on
                    ? filters.industries.filter((i) => !d.industries.includes(i))
                    : [...new Set([...filters.industries, ...d.industries])],
                })}>
                <span className="dept__dot" aria-hidden />
                {d.label}
              </button>
            );
          })}
          {active > 0 && (
            <button className="dept dept--clear" onClick={reset}>Clear {active}</button>
          )}
        </nav>
      </section>

      <Ticker items={result.items} colourOf={colourOf} />

      <div className="shell" ref={boardRef}>
        <FilterRail
          all={ALL} meta={META} query={result.query} filters={filters}
          pitch={pitch} open={railOpen} onPatch={patch} onReset={reset}
        />

        <main className="main">
          <div className="toolbar">
            <h2 className="board__title">Departures</h2>
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
              options={[['grid', 'Board'], ['field', 'Field']]}
            />

            {view === 'grid' && (
              <button
                className="iconbtn iconbtn--soft"
                onClick={() => setDensity((d) => (d === 'compact' ? 'comfortable' : 'compact'))}
                aria-pressed={density === 'compact'}
                aria-label="Toggle density"
                title={density === 'compact' ? 'Comfortable rows' : 'Compact rows'}
              >
                {density === 'compact' ? <IconRows /> : <IconGrid />}
                {density === 'compact' ? 'Compact' : 'Comfortable'}
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
                  Showing {result.items.length} that match part of it — each row says which.
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
        {compareItems.length > 0 && !onePager && (
          <CompareTray
            items={compareItems}
            colourOf={colourOf}
            onRemove={(id) => setCompare((c) => c.filter((x) => x !== id))}
            onClear={() => setCompare([])}
            onOpen={() => setShowCompare(true)}
            onBuild={() => setOnePager(true)}
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
            colourOf={colourOf}
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
            <motion.aside className="pane pane--wide" role="dialog" aria-modal="true" aria-label="Compare campaigns"
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 34, stiffness: 340 }}>
              <header className="pane__head">
                <div style={{ flex: 1 }}>
                  <span className="pane__kicker">Side by side</span>
                  <h2 className="pane__title">{compareItems.length} campaigns</h2>
                </div>
                <button className="btn btn--ghost" onClick={() => onCopy(digestOf(compareItems), 'Copied')}>Copy</button>
                <button className="btn" onClick={() => { setShowCompare(false); setOnePager(true); }}>Build one-pager</button>
                <button className="pane__close" onClick={() => setShowCompare(false)} aria-label="Close">
                  <IconClose />
                </button>
              </header>
              <div className="pane__body">
                <CompareTable items={compareItems} pitch={pitch} colourOf={colourOf} />
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {onePager && (
          <Suspense fallback={null}><OnePager
            items={compareItems} colourOf={colourOf}
            onClose={() => setOnePager(false)} onCopy={onCopy}
          /></Suspense>
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
