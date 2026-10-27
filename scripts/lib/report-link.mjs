/**
 * What counts as a real report link, and what is a placeholder.
 *
 * The sheet is filled in by hand, so some rows carry a link that points at
 * nothing in particular: the Canva home page, somebody's Canva file list, a
 * Drive folder rather than the deck inside it, an Instagram profile rather
 * than the post. A client clicking one of those lands somewhere useless, and
 * on a pitch page that is worse than showing no link at all.
 *
 * The test is structural rather than a word list: a real report link names a
 * specific document, which means a host we recognise AND an identifier for
 * the thing itself. Word lists ("test", "dummy", "sample") were tried first
 * and were a false-positive machine — "Test camp" is a real campaign, "Jam
 * Breakdown" matched on a substring — so none of that is used here.
 *
 * Measured against the live archive when this was written: of 1,748 report
 * links, 15 fail these rules and 2 more are gone from Drive entirely. The
 * remaining 1,731 are real documents, most of them simply not shared.
 */

/** Hosts whose URL shapes are known well enough to judge. */
const KNOWN = ['drive.google.com', 'docs.google.com', 'canva.com', 'canva.link', 'instagram.com', 'wldd.in'];

/** Instagram paths that are a post rather than somebody's profile. */
const IG_POST = new Set(['p', 'reel', 'reels', 'tv']);

const host = (u) => u.hostname.replace(/^www\./, '');
const isKnown = (h) => KNOWN.some((k) => h === k || h.endsWith(`.${k}`));

/**
 * Judge one report link.
 *
 * Returns `{ ok: true }` for a link that names a document, or
 * `{ ok: false, reason }` for a placeholder. Unknown hosts are allowed
 * through: this rejects what it can prove is not a document, and a host it
 * has never seen is not proof of anything.
 */
export function checkReportLink(raw) {
  const t = String(raw ?? '').trim();
  if (!t) return { ok: false, reason: 'empty' };

  let u;
  try { u = new URL(t); } catch { return { ok: false, reason: 'not a URL' }; }
  if (!/^https?:$/.test(u.protocol)) return { ok: false, reason: 'not a web link' };

  const h = host(u);
  const segs = u.pathname.split('/').filter(Boolean);

  // A bare domain is a site, not a document — whatever the site is.
  if (segs.length === 0) return { ok: false, reason: 'links to a site, not a document' };

  if (!isKnown(h)) return { ok: true };

  if (h === 'drive.google.com') {
    if (segs[0] === 'drive' && segs[1] === 'folders') {
      return { ok: false, reason: 'links to a Drive folder, not a file' };
    }
    if (segs[0] === 'file' && segs[1] === 'd' && (segs[2] || '').length >= 20) return { ok: true };
    if (segs[0] === 'open' && u.searchParams.get('id')) return { ok: true };
    return { ok: false, reason: 'Drive link with no file id' };
  }

  if (h === 'docs.google.com') {
    const i = segs.indexOf('d');
    if (i >= 0 && (segs[i + 1] || '').length >= 20) return { ok: true };
    return { ok: false, reason: 'Google Docs link with no document id' };
  }

  if (h === 'canva.com') {
    // A share link is /design/<design id>/<share token>/...; anything else on
    // canva.com is the product, an account page, or a file listing.
    if (segs[0] === 'design' && (segs[1] || '').length >= 8 && (segs[2] || '').length >= 8) return { ok: true };
    return { ok: false, reason: 'Canva link that is not a design' };
  }

  if (h === 'canva.link') {
    if ((segs[0] || '').length >= 8) return { ok: true };
    return { ok: false, reason: 'Canva short link with no id' };
  }

  if (h === 'instagram.com') {
    if (IG_POST.has(segs[0])) return { ok: true };
    return { ok: false, reason: 'links to an Instagram profile, not a post' };
  }

  return { ok: true };
}
