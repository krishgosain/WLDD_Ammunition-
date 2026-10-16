import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import type { Campaign } from '../lib/types';
import { fmt, fmtMonth } from '../lib/format';
import { IconArrowLeft, IconExternal, IconLink, IconPrint } from './Icons';

/** Drive file links open most reliably at their /view URL. */
const reportUrl = (url: string) => url.replace(/^(https:\/\/drive\.google\.com\/file\/d\/[\w-]+)\/?$/, '$1/view');

const SITE = 'https://wldd.in';
const INK = '#131313';
const YELLOW = '#FFD644';
/** WLDD's own palette, from wldd.in: the wordmark letters and the tiles. */
const MARK = ['#FF3B2F', YELLOW, '#8B7CFF', '#E8389F'];
const TILES = [
  { bg: '#F2412B', ink: '#FFFFFF' },
  { bg: '#6C5CE7', ink: '#FFFFFF' },
  { bg: YELLOW, ink: INK },
  { bg: '#D9258F', ink: '#FFFFFF' },
  { bg: '#2F5BEA', ink: '#FFFFFF' },
  { bg: '#0F9A68', ink: '#FFFFFF' },
];
const ACCENTS = [YELLOW, '#FF3B2F', '#8B7CFF', '#E8389F', '#3DDC97'];
/** The sheet is A4 at 96dpi; the preview scales it, the PDF uses it as is. */
const SHEET_W = 794;
const SHEET_H = 1123;

/**
 * Build one-pager: the pitch kit laid out for the client.
 *
 * Pitch mode is always on here — leads, status and promise ratios never reach
 * the page. The page is a fixed A4 sheet whose campaign grid changes shape
 * with the number of campaigns, so it always fills the page. Download builds
 * the PDF in the app; the client link opens the app in pitch mode with exactly
 * these campaigns in the kit.
 */
export default function OnePager({
  items, colourOf, onClose, onCopy,
}: {
  items: Campaign[];
  colourOf: (c: Campaign) => string;
  onClose: () => void;
  onCopy: (text: string, label: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState<string[]>(() => items.map((c) => c.id));
  const [preparedFor, setPreparedFor] = useState('');
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [showEng, setShowEng] = useState(true);
  const [showBrief, setShowBrief] = useState(true);
  const [showReport, setShowReport] = useState(true);
  const [accent, setAccent] = useState(ACCENTS[0]);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    rootRef.current?.focus();
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; prev?.focus({ preventScroll: true }); };
  }, []);

  const chosen = useMemo(() => items.filter((c) => on.includes(c.id)), [items, on]);
  const total = chosen.reduce((s, c) => s + (c.reach ?? 0), 0);
  const totalEng = chosen.reduce((s, c) => s + (c.eng ?? 0), 0);
  const kinds = [...new Set(chosen.map((c) => (c.isVertical ? c.industry : c.clientType)))];
  const across = kinds.length > 1
    ? `${kinds.slice(0, -1).join(', ')} and ${kinds[kinds.length - 1]}`
    : kinds[0] ?? '';
  const today = fmtMonth(new Date().toISOString().slice(0, 10));

  const pageRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [sheetH, setSheetH] = useState(SHEET_H);

  // Fit the A4 sheet to the preview column; the sheet itself never reflows.
  useEffect(() => {
    const stage = stageRef.current, page = pageRef.current;
    if (!stage || !page) return;
    const ro = new ResizeObserver(() => {
      setScale(Math.min(1, stage.clientWidth / SHEET_W));
      setSheetH(page.offsetHeight);
    });
    ro.observe(stage); ro.observe(page);
    return () => ro.disconnect();
  }, []);
  const [busy, setBusy] = useState(false);
  const fileName = preparedFor.trim() ? `WLDD for ${preparedFor.trim()}` : 'WLDD';

  // Fallback only: the browser's print dialog. The page title becomes the PDF's
  // file name, so name it for the client; restore it once the dialog closes.
  const printPage = () => {
    const prev = document.title;
    document.title = fileName;
    window.addEventListener('afterprint', () => { document.title = prev; }, { once: true });
    window.print();
  };

  // The PDF is built here rather than through the print dialog, because
  // browsers disagree on whether a printed PDF keeps its links (Safari's
  // "Save as PDF" drops them). The page is drawn as one image, and every link
  // on it is written into the PDF as a real link annotation over the spot
  // where it sits — so "View the report" is clickable in any PDF viewer.
  const download = async () => {
    const el = pageRef.current;
    if (!el) return;
    setBusy(true);
    try {
      const [{ toCanvas }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')]);
      const box = el.getBoundingClientRect(); // scaled, like the link boxes below
      const canvas = await toCanvas(el, {
        pixelRatio: 2.5, backgroundColor: '#FFFCF6',
        width: el.offsetWidth, height: el.offsetHeight,
      });
      const W = 210; // A4 in mm; a long kit grows the page past 297
      const H = (W * el.offsetHeight) / el.offsetWidth;
      const pdf = new jsPDF({ unit: 'mm', format: [W, H], orientation: H >= W ? 'portrait' : 'landscape' });
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, W, H);
      const k = W / box.width; // box and link rects share the preview's scale
      el.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) => {
        const r = a.getBoundingClientRect();
        pdf.link((r.left - box.left) * k, (r.top - box.top) * k, r.width * k, r.height * k, { url: a.href });
      });
      pdf.setProperties({ title: fileName });
      pdf.save(`${fileName}.pdf`);
    } catch (err) {
      console.warn('PDF build failed, falling back to print', err);
      printPage();
    } finally {
      setBusy(false);
    }
  };

  const clientLink = () => {
    const p = new URLSearchParams({ pitch: '1', cmp: chosen.map((c) => c.id).join('~') });
    return `${location.origin}${location.pathname}?${p}`;
  };

  return (
    <motion.div
      ref={rootRef} className="onepager" role="dialog" aria-modal="true"
      aria-label="Build one-pager" tabIndex={-1}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <header className="onepager__bar">
        <button className="btn btn--ghost" onClick={onClose}><IconArrowLeft /> Back to the board</button>
        <span className="onepager__note">Pitch mode applied — leads, status and promise ratios never appear on the page</span>
      </header>

      <div className="onepager__body">
        <aside className="builder" aria-label="One-pager settings">
          <h1 className="builder__title">Build <span>one-pager</span></h1>
          <p className="builder__intro">Everything in your pitch kit, laid out for the client. Edit, then download or send the link.</p>

          <section className="builder__card">
            <label className="builder__h" htmlFor="op-for">Prepared for</label>
            <input id="op-for" className="builder__input" value={preparedFor}
              placeholder="Client or brand name" onChange={(e) => setPreparedFor(e.target.value)} />
          </section>

          <section className="builder__card">
            <div className="builder__h">Campaigns <span>from your pitch kit</span></div>
            {items.length ? items.map((c) => {
              const sel = on.includes(c.id);
              return (
                <button key={c.id} className={sel ? 'builder__pick builder__pick--on' : 'builder__pick'}
                  aria-pressed={sel} style={{ ['--accent' as string]: colourOf(c) }}
                  onClick={() => setOn((cur) => (sel ? cur.filter((x) => x !== c.id) : [...cur, c.id]))}>
                  <span className="builder__swatch" aria-hidden>{sel ? '✓' : ''}</span>
                  <span className="builder__pickname">
                    <b>{c.client}</b>
                    <span>{c.name}</span>
                  </span>
                  <span className="builder__pickfig num">{fmt(c.reach)}</span>
                </button>
              );
            }) : <p className="builder__empty">Your kit is empty. Add campaigns from the board with +.</p>}
            <button className="builder__more" onClick={onClose}>+ Add more from the board</button>
          </section>

          <section className="builder__card">
            <div className="builder__h">Show on the page</div>
            {([
              ['Engagement', showEng, setShowEng],
              ['Campaign brief', showBrief, setShowBrief],
              ['Report links', showReport, setShowReport],
            ] as const).map(([label, val, set]) => (
              <label className="switch" key={label}>
                <input type="checkbox" checked={val} onChange={(e) => set(e.target.checked)} />
                <span className="switch__track" aria-hidden><span className="switch__knob" /></span>
                <span>{label}</span>
              </label>
            ))}
            <div className="builder__h" style={{ marginTop: 6 }}>Accent</div>
            <div className="builder__accents">
              {ACCENTS.map((c) => (
                <button key={c} aria-label={`Accent ${c}`} aria-pressed={accent === c}
                  className={accent === c ? 'swatch swatch--on' : 'swatch'}
                  style={{ background: c, ['--accent' as string]: c }}
                  onClick={() => setAccent(c)} />
              ))}
            </div>
          </section>

          <section className="builder__card">
            <div className="builder__h">Your details</div>
            <input className="builder__input" aria-label="Your name" placeholder="Your name"
              value={name} onChange={(e) => setName(e.target.value)} />
            <input className="builder__input" aria-label="Email and phone" placeholder="Email · phone"
              value={contact} onChange={(e) => setContact(e.target.value)} />
          </section>

          <div className="builder__actions">
            <button className="btn btn--ghost" onClick={download} disabled={!chosen.length || busy}>
              <IconPrint /> {busy ? 'Building PDF…' : 'Download PDF'}
            </button>
            <button className="btn" disabled={!chosen.length}
              title="Opens WLDD Ammo in pitch mode with exactly these campaigns"
              onClick={() => onCopy(clientLink(), 'Client link copied')}>
              <IconLink /> Copy client link
            </button>
          </div>
        </aside>

        <section className="preview" aria-label="One-pager preview">
          <div className="preview__label"><span className="live__dot" /> Live preview · A4, exactly what the client gets</div>
          <div className="preview__stage" ref={stageRef} style={{ height: sheetH * scale }}>
            <div className="preview__scaler" style={{ transform: `scale(${scale})` }}>
              <article
                ref={pageRef}
                className={`onepage onepage--n${Math.min(chosen.length, 7)}${chosen.length >= 4 ? ' onepage--dense' : ''}`}
                style={{ ['--op-accent' as string]: accent }}
              >
                <header className="op-head">
                  <div className="op-head__top">
                    <a className="op-mark" href={SITE} target="_blank" rel="noopener noreferrer" aria-label="WLDD — wldd.in">
                      {'WLDD'.split('').map((ch, i) => <span key={i} style={{ color: MARK[i] }}>{ch}</span>)}
                    </a>
                    <span className="op-shapes" aria-hidden>
                      <i className="op-shape op-shape--circle" />
                      <i className="op-shape op-shape--leaf" />
                      <i className="op-shape op-shape--square" />
                      <i className="op-shape op-shape--pill" />
                    </span>
                    <div className="op-for">
                      <span>Prepared for</span>
                      <b>{preparedFor.trim() || '[Client name]'}</b>
                      <span>{today}</span>
                    </div>
                  </div>
                  {chosen.length ? (
                    <>
                      <div className="op-hero">
                        <div className={total ? 'op-total' : 'op-total num--none'}>{fmt(total || null)}</div>
                        <div className="op-hero__side">
                          <div className="op-hero__label">People reached</div>
                          <p>
                            {chosen.length} campaign{chosen.length === 1 ? '' : 's'}
                            {across && <> across {across}</>}. Every figure exactly as recorded.
                          </p>
                        </div>
                      </div>
                      <div className="op-stats">
                        {showEng && <div className="op-stat"><b>{fmt(totalEng || null)}</b><span>Engagement</span></div>}
                        <div className="op-stat"><b>{chosen.length}</b><span>Campaign{chosen.length === 1 ? '' : 's'}</span></div>
                        <div className="op-stat"><b>{kinds.length}</b><span>{kinds.length === 1 ? 'Category' : 'Categories'}</span></div>
                      </div>
                    </>
                  ) : null}
                </header>

                {chosen.length ? (
                  <section className="op-work">
                    <div className="op-work__head">
                      <h2>The work</h2>
                      <span>Campaigns WLDD has delivered</span>
                    </div>
                    <div className="op-grid">
                      {chosen.map((c, i) => {
                        const t = TILES[i % TILES.length];
                        return (
                          <div className="op-tile" key={c.id} style={{ background: t.bg, color: t.ink }}>
                            <span className="op-tile__no" aria-hidden>{String(i + 1).padStart(2, '0')}</span>
                            <span className="op-tile__meta">{c.isVertical ? c.industry : c.clientType} · {c.date ? fmtMonth(c.date) : '—'}</span>
                            <span className="op-tile__client">{c.client}</span>
                            <span className="op-tile__name">{c.name}</span>
                            {showBrief && c.objective && <p className="op-tile__brief">{c.objective}</p>}
                            <div className="op-tile__figs">
                              <span><b className={c.reach == null ? 'num--none' : undefined}>{fmt(c.reach)}</b><i>Reach</i></span>
                              {showEng && c.eng !== null && <span className="op-tile__eng"><b>{fmt(c.eng)}</b><i>Engagement</i></span>}
                            </div>
                            {showReport && c.report && (
                              <>
                                <a className="op-tile__report" href={reportUrl(c.report)} target="_blank" rel="noopener noreferrer"
                                  style={{ color: t.bg === YELLOW ? INK : t.bg }}>
                                  View the report <IconExternal />
                                </a>
                                {/* printed under the button, for PDF viewers that drop links */}
                                <span className="onepage__url">{reportUrl(c.report)}</span>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ) : (
                  <p className="onepage__empty">Pick at least one campaign to build the page.</p>
                )}

                <footer className="op-cta">
                  <div className="op-cta__main">
                    <div className="op-cta__title">Let’s build <span>yours.</span></div>
                    <p>Creator-led campaigns that get talked about, measured and reported. Your brand could be the next one on this page.</p>
                    <a className="op-cta__btn" href={SITE} target="_blank" rel="noopener noreferrer">
                      Start a campaign <span aria-hidden>→</span> wldd.in
                    </a>
                  </div>
                  <div className="op-cta__contact">
                    <span>Talk to</span>
                    <b>{name.trim() || '[Your name]'}</b>
                    <div>{contact.trim() || '[Email] · [Phone]'}</div>
                    <a href={SITE} target="_blank" rel="noopener noreferrer">www.wldd.in</a>
                  </div>
                </footer>
              </article>
            </div>
          </div>
        </section>
      </div>
    </motion.div>
  );
}
