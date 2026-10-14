import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import type { Campaign } from '../lib/types';
import { fmt, fmtMonth } from '../lib/format';
import { IconArrowLeft, IconExternal, IconLink, IconPrint } from './Icons';

/** Drive file links open most reliably at their /view URL. */
const reportUrl = (url: string) => url.replace(/^(https:\/\/drive\.google\.com\/file\/d\/[\w-]+)\/?$/, '$1/view');

const ACCENTS = ['#E4572E', '#7B61D9', '#2F9E6E', '#E9A23B', '#1C96A2'];

/**
 * Build one-pager: the pitch kit laid out for the client.
 *
 * Pitch mode is always on here — leads, status and promise ratios never reach
 * the page. Download uses the browser's print-to-PDF with a print stylesheet
 * that prints the page alone; the client link opens the app in pitch mode with
 * exactly these campaigns in the kit.
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
  const kinds = [...new Set(chosen.map((c) => (c.isVertical ? c.industry : c.clientType)))];
  const across = kinds.length > 1
    ? `${kinds.slice(0, -1).join(', ')} and ${kinds[kinds.length - 1]}`
    : kinds[0] ?? '';
  const today = fmtMonth(new Date().toISOString().slice(0, 10));

  // The page title becomes the PDF's file name, so name it for the client
  // rather than the app; restore it once the print dialog closes.
  const download = () => {
    const prev = document.title;
    document.title = preparedFor.trim() ? `WLDD for ${preparedFor.trim()}` : 'WLDD';
    window.addEventListener('afterprint', () => { document.title = prev; }, { once: true });
    window.print();
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
            <button className="btn btn--ghost" onClick={download} disabled={!chosen.length}>
              <IconPrint /> Download PDF
            </button>
            <button className="btn" disabled={!chosen.length}
              title="Opens WLDD Ammo in pitch mode with exactly these campaigns"
              onClick={() => onCopy(clientLink(), 'Client link copied')}>
              <IconLink /> Copy client link
            </button>
          </div>
        </aside>

        <section className="preview" aria-label="One-pager preview">
          <div className="preview__label"><span className="live__dot" /> Live preview · what the client sees</div>
          <article className="onepage" style={{ ['--op-accent' as string]: accent }}>
            <header className="onepage__head">
              <span className="onepage__mark">WLDD</span>
              <span className="onepage__for">
                Prepared for {preparedFor.trim() || '[CLIENT NAME]'} · {today}
              </span>
            </header>
            {chosen.length ? (
              <>
                <div className="onepage__hero">
                  <div className={total ? "onepage__total num" : "onepage__total num num--none"}>{fmt(total || null)}</div>
                  <div className="onepage__sum">
                    <div className="onepage__reached">People reached</div>
                    <p>
                      {chosen.length} campaign{chosen.length === 1 ? '' : 's'}
                      {across && <> across {across}</>} — every figure exactly as recorded.
                    </p>
                  </div>
                </div>
                <div className="onepage__panels">
                  {chosen.map((c) => (
                    <div className="onepage__panel" key={c.id} style={{ background: colourOf(c) }}>
                      <span className="onepage__meta">{c.isVertical ? c.industry : c.clientType} · {c.date ? fmtMonth(c.date) : '—'}</span>
                      <span className="onepage__client">{c.client}</span>
                      <span className="onepage__name">{c.name}</span>
                      {showBrief && c.objective && <p className="onepage__brief">{c.objective}</p>}
                      <div className="onepage__figs">
                        <span><b className={c.reach == null ? "num num--none" : "num"}>{fmt(c.reach)}</b><i>reach</i></span>
                        {showEng && c.eng !== null && <span className="onepage__eng"><b className={c.eng == null ? "num num--none" : "num"}>{fmt(c.eng)}</b><i>engagement</i></span>}
                      </div>
                      {showReport && c.report && (
                        <>
                          <a className="onepage__report" href={reportUrl(c.report)} target="_blank" rel="noopener noreferrer">
                            View the report <IconExternal />
                          </a>
                          {/* printed under the button, for PDF viewers that drop links */}
                          <span className="onepage__url">{reportUrl(c.report)}</span>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="onepage__empty">Pick at least one campaign to build the page.</p>
            )}
            <footer className="onepage__foot">
              <div className="onepage__cta">Let’s build <span>yours.</span></div>
              <div className="onepage__contact">
                <div>{name.trim() || '[YOUR NAME]'}</div>
                <div>{contact.trim() || '[EMAIL] · [PHONE]'}</div>
              </div>
              <span className="onepage__site">wldd.in</span>
            </footer>
          </article>
        </section>
      </div>
    </motion.div>
  );
}
