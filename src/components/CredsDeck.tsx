import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Campaign } from '../lib/types';
import {
  MASTER, type Slide, slideFor, buildBrief, briefText, suggestName,
} from '../lib/creds';
import { fmt } from '../lib/format';
import { download } from '../lib/export';
import { IconCopy, IconDownload, IconClose, IconArrow } from './Icons';

/**
 * The cred deck builder.
 *
 * The pitch kit already collects campaigns; this turns the kit into slides on
 * WLDD's creds template — the same shape as slide 21, the Amazon Ravi Kishan
 * one — and hands the lot to Claude, which copies the master, writes the copy
 * and builds the deck.
 *
 * Deliberately not an approval queue. The written fields are empty here and
 * Claude fills them; whoever is pitching edits in Canva afterwards, where they
 * can see the slide. Typing a field here is an override, not a requirement:
 * the only thing the page insists on is a name, so every deck is its own file
 * and nobody lands in someone else's.
 */

const CHIP_COLOUR: Record<string, string> = {
  production: '#E8B33A',
  distribution: '#44D07B',
  influencer: '#B07CFF',
};

/** The slide as Canva will build it, at the size of a thumbnail. */
function SlidePreview({ slide, index }: { slide: Slide; index: number }) {
  return (
    <div className="credslide" aria-label={`Slide ${index + 1} preview`}>
      <div className="credslide__bar" aria-hidden />
      <div className="credslide__body">
        <div className="credslide__text">
          <p className="credslide__eyebrow">{slide.eyebrow || 'Campaign name'}</p>
          <p className={slide.headline ? 'credslide__head' : 'credslide__head credslide__head--ghost'}>
            {slide.headline || 'Claude writes the headline'}
          </p>
          <p className={slide.body1 ? 'credslide__para' : 'credslide__para credslide__para--ghost'}>
            {slide.body1 || 'What the campaign was, and what it was up against.'}
          </p>
          <p className={slide.kicker ? 'credslide__kick' : 'credslide__kick credslide__kick--ghost'}>
            {slide.kicker || 'The line that turns it.'}
          </p>
          <p className={slide.body2 ? 'credslide__para' : 'credslide__para credslide__para--ghost'}>
            {slide.body2 || 'How it landed.'}
          </p>
          <p className="credslide__figs">
            {slide.views || '—'}
            {slide.engagement && <><br />{slide.engagement}</>}
          </p>
          <p className="credslide__chips">
            {slide.chips.map((c) => (
              <span key={c} style={{ color: CHIP_COLOUR[c] ?? '#E8B33A' }}>{c}</span>
            ))}
          </p>
        </div>
        <div className="credslide__media">
          <span>media attached in Canva</span>
        </div>
      </div>
    </div>
  );
}

export default function CredsDeck({
  items, onRemove, onCopy, onOpenBoard,
}: {
  items: Campaign[];
  onRemove: (id: string) => void;
  onCopy: (text: string, label: string) => void;
  onOpenBoard: () => void;
}) {
  const [slides, setSlides] = useState<Slide[]>(() => items.map(slideFor));
  const [pitchingTo, setPitchingTo] = useState('');
  const [deckName, setDeckName] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [draftNote, setDraftNote] = useState('');

  // The kit is the source of truth for which campaigns are in the deck; the
  // slides follow it, keeping whatever has already been typed on one.
  useEffect(() => {
    setSlides((cur) => {
      const by = new Map(cur.map((s) => [s.id, s]));
      return items.map((c) => by.get(c.id) ?? slideFor(c));
    });
  }, [items]);

  const byId = useMemo(() => new Map(items.map((c) => [c.id, c])), [items]);
  const patch = (id: string, p: Partial<Slide>) =>
    setSlides((cur) => cur.map((s) => (s.id === id ? { ...s, ...p } : s)));

  const move = (id: string, delta: number) => setSlides((cur) => {
    const i = cur.findIndex((s) => s.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= cur.length) return cur;
    const next = [...cur];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  const name = deckName.trim() || suggestName(pitchingTo);
  const brief = useMemo(
    () => buildBrief(slides, items, name, pitchingTo),
    [slides, items, name, pitchingTo],
  );

  const hand = () => {
    onCopy(briefText(brief), `Brief for ${slides.length} slides copied`);
  };

  /**
   * Optional: have the copy drafted here before it goes over.
   *
   * It needs a key on the server, and the deck gets written either way — so a
   * missing key is a note, not an error. Nothing about the hand-off changes.
   */
  const draft = useCallback(async () => {
    setDrafting(true);
    setDraftNote('');
    try {
      const res = await fetch('/api/draft', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slides: brief.slides, pitchingTo: brief.pitchingTo }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(data.slides)) {
        setDraftNote(data.reason || 'No drafting here yet — Claude writes the copy when it builds the deck.');
        return;
      }
      const written = new Map<string, Partial<Slide>>(
        data.slides.map((s: Slide) => [s.id, s]),
      );
      setSlides((cur) => cur.map((s) => {
        const w = written.get(s.id);
        if (!w) return s;
        return {
          ...s,
          headline: s.headline || w.headline || '',
          body1: s.body1 || w.body1 || '',
          kicker: s.kicker || w.kicker || '',
          body2: s.body2 || w.body2 || '',
        };
      }));
      setDraftNote(`Drafted ${written.size} slides. Edit anything here, or in Canva after.`);
    } catch {
      setDraftNote('Could not reach the drafter — Claude writes the copy when it builds the deck.');
    } finally {
      setDrafting(false);
    }
  }, [brief]);

  if (!items.length) {
    return (
      <div className="creds">
        <div className="empty">
          <h3>Nothing picked yet</h3>
          <p>
            A cred deck is built out of the pitch kit. Go back to the board, pick the
            campaigns you want to put in front of this client — three or four is a deck,
            not a catalogue — and come back here.
          </p>
          <button onClick={onOpenBoard}>Back to the board</button>
        </div>
      </div>
    );
  }

  const reach = items.reduce((s, c) => s + (c.reach ?? 0), 0);

  return (
    <div className="creds">
      <div className="cold__head">
        <div>
          <h3 className="cold__title">Cred deck</h3>
          <p className="cold__sub">
            {slides.length} {slides.length === 1 ? 'slide' : 'slides'} on the WLDD creds
            template · <b className="num">{fmt(reach)}</b> reach between them · your own copy of{' '}
            <a href={MASTER.url} target="_blank" rel="noreferrer">{MASTER.title}</a>, never the master
          </p>
        </div>
      </div>

      <div className="creds__setup">
        <label className="creds__field">
          <span>Pitching to</span>
          <input
            value={pitchingTo} placeholder="Nykaa, Zomato, whoever"
            onChange={(e) => setPitchingTo(e.target.value)}
          />
        </label>
        <label className="creds__field creds__field--wide">
          <span>Name this deck</span>
          <input
            value={deckName} placeholder={suggestName(pitchingTo)}
            onChange={(e) => setDeckName(e.target.value)}
          />
        </label>
        <p className="creds__hint">
          Named before it is made, so two people building decks this afternoon end up
          with two files. The master is only ever read.
        </p>
      </div>

      <ol className="creds__list">
        {slides.map((s, i) => {
          const c = byId.get(s.id);
          if (!c) return null;
          const isOpen = open === s.id;
          return (
            <li className="creds__slide" key={s.id}>
              <div className="creds__num num">{String(i + 1).padStart(2, '0')}</div>
              <SlidePreview slide={s} index={i} />
              <div className="creds__side">
                <p className="creds__origin">
                  <b>{c.client}</b> — {c.name}
                  <br />
                  <i>
                    {[c.industry, c.services.join(' · '), c.year ? String(c.year) : '']
                      .filter(Boolean).join(' · ')}
                  </i>
                </p>
                <label className="creds__field">
                  <span>Anything only you know</span>
                  <textarea
                    rows={3} value={s.note}
                    placeholder="The brief, the constraint, the bit that made it work. One line is plenty — it is what makes the copy specific instead of generic."
                    onChange={(e) => patch(s.id, { note: e.target.value })}
                  />
                </label>
                <div className="creds__row">
                  <label className="creds__field">
                    <span>Views</span>
                    <input value={s.views} onChange={(e) => patch(s.id, { views: e.target.value })} />
                  </label>
                  <label className="creds__field">
                    <span>Engagement</span>
                    <input value={s.engagement} onChange={(e) => patch(s.id, { engagement: e.target.value })} />
                  </label>
                </div>
                <button className="creds__more" onClick={() => setOpen(isOpen ? null : s.id)}>
                  {isOpen ? 'Hide the words' : 'Write the words yourself'}
                </button>
                {isOpen && (
                  <div className="creds__words">
                    <label className="creds__field">
                      <span>Eyebrow</span>
                      <input value={s.eyebrow} onChange={(e) => patch(s.id, { eyebrow: e.target.value })} />
                    </label>
                    <label className="creds__field">
                      <span>Headline</span>
                      <textarea rows={2} value={s.headline} placeholder="Left empty, Claude writes it."
                        onChange={(e) => patch(s.id, { headline: e.target.value })} />
                    </label>
                    <label className="creds__field">
                      <span>First paragraph</span>
                      <textarea rows={3} value={s.body1} placeholder="Left empty, Claude writes it."
                        onChange={(e) => patch(s.id, { body1: e.target.value })} />
                    </label>
                    <label className="creds__field">
                      <span>Kicker</span>
                      <textarea rows={2} value={s.kicker} placeholder="Left empty, Claude writes it."
                        onChange={(e) => patch(s.id, { kicker: e.target.value })} />
                    </label>
                    <label className="creds__field">
                      <span>Second paragraph</span>
                      <textarea rows={3} value={s.body2} placeholder="Left empty, Claude writes it."
                        onChange={(e) => patch(s.id, { body2: e.target.value })} />
                    </label>
                  </div>
                )}
                <div className="creds__slideacts">
                  <button onClick={() => move(s.id, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                  <button onClick={() => move(s.id, 1)} disabled={i === slides.length - 1} aria-label="Move down">↓</button>
                  <button onClick={() => onRemove(s.id)} aria-label={`Drop ${c.name}`}><IconClose /> Drop</button>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="creds__foot">
        <div className="creds__footnote">
          <p>
            <b>What happens next.</b> The brief goes to Claude: it copies pages{' '}
            {MASTER.intro.from}–{MASTER.intro.to} and the blank template off the master,
            names the copy, writes a headline and a write-up per campaign from what the
            work actually was, fills the figures and the chips, and sends back a link.
            Media frames stay empty for you to drop stills into.
          </p>
          <p>
            Nothing is approved here first. If a line is wrong, change it on the slide —
            that is faster than judging it in a form.
          </p>
          {draftNote && <p className="creds__draftnote">{draftNote}</p>}
        </div>
        <div className="creds__acts">
          <button className="btn btn--ghost" onClick={draft} disabled={drafting}>
            {drafting ? 'Drafting…' : 'Draft the copy here first'}
          </button>
          <button
            className="btn btn--ghost"
            onClick={() => download(`${name}.json`, JSON.stringify(brief, null, 2), 'application/json')}
          >
            <IconDownload /> Brief as JSON
          </button>
          <button className="btn" onClick={hand}>
            <IconCopy /> Hand to Claude <IconArrow />
          </button>
        </div>
      </div>
    </div>
  );
}
