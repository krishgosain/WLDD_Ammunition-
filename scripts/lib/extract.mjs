/**
 * Pull the content out of a report.
 *
 * The posts and reels live inside the decks, not in the sheet, so the only
 * way to show a client what was made for them is to open the report and take
 * the pictures out of it.
 *
 * A PPTX is a zip: its images sit in ppt/media untouched, which is the best
 * case — original resolution, no re-encoding. A PDF needs poppler to lift the
 * embedded images out; when a deck is one flat image per page (an exported
 * Canva deck usually is) that finds nothing useful, so pages are rendered
 * instead.
 *
 * Most of what comes out is furniture: logos, icons, slide backgrounds,
 * gradient strips. The filtering matters more than the extraction.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** Below this, it is an icon or a logo, not a piece of content. */
const MIN_PIXELS = 160_000;   // ~400x400
const MIN_SIDE = 300;
/** A strip or a rule: far too long and thin to be a post. */
const MAX_RATIO = 2.6;

const run = (cmd, args) => {
  try { return execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 }); }
  catch { return null; }
};

/** Width and height, via ImageMagick, or null if it is not a readable image. */
export function dimensions(file) {
  const out = run('identify', ['-format', '%w %h', `${file}[0]`]);
  if (!out) return null;
  const [w, h] = out.toString().trim().split(/\s+/).map(Number);
  return Number.isFinite(w) && Number.isFinite(h) && w && h ? { w, h } : null;
}

/**
 * Is this a piece of content, or is it slide furniture?
 *
 * Reels are tall, posts are square-ish. Anything far from those shapes, or
 * too small to be either, is the deck's own decoration.
 */
export function looksLikeContent(file) {
  const d = dimensions(file);
  if (!d) return false;
  if (d.w < MIN_SIDE || d.h < MIN_SIDE) return false;
  if (d.w * d.h < MIN_PIXELS) return false;
  const ratio = Math.max(d.w / d.h, d.h / d.w);
  if (ratio > MAX_RATIO) return false;
  return true;
}

/** A score for picking the few worth showing: bigger, and reel-shaped, wins. */
export function contentScore(file) {
  const d = dimensions(file);
  if (!d) return 0;
  const portrait = d.h > d.w ? 1.35 : 1;      // reels first
  return Math.sqrt(d.w * d.h) * portrait;
}

/** Everything image-shaped inside a .pptx, straight out of its zip. */
export function fromPptx(file, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  run('unzip', ['-o', '-j', file, 'ppt/media/*', '-d', outDir]);
  return fs.existsSync(outDir)
    ? fs.readdirSync(outDir).map((f) => path.join(outDir, f))
      .filter((f) => /\.(png|jpe?g|webp|gif)$/i.test(f))
    : [];
}

/**
 * Images from a PDF, embedded first and rendered pages as the fallback.
 *
 * Only the opening pages are touched: a 136MB report is mostly appendix, and
 * the work being shown off is at the front.
 */
export function fromPdf(file, outDir, pages = 12) {
  fs.mkdirSync(outDir, { recursive: true });
  run('pdfimages', ['-j', '-png', '-f', '1', '-l', String(pages), file, path.join(outDir, 'img')]);
  let found = fs.readdirSync(outDir).map((f) => path.join(outDir, f))
    .filter((f) => /\.(png|jpe?g|ppm)$/i.test(f));

  if (!found.some(looksLikeContent)) {
    // A deck exported as one flat image per page: render the pages instead.
    for (const f of found) fs.rmSync(f, { force: true });
    run('pdftoppm', ['-jpeg', '-r', '70', '-f', '1', '-l', String(Math.min(pages, 8)), file, path.join(outDir, 'page')]);
    found = fs.readdirSync(outDir).map((f) => path.join(outDir, f))
      .filter((f) => /\.(jpe?g|png|ppm)$/i.test(f));
  }
  return found;
}

/** Dispatch on what the file actually is, not on what it is called. */
export function extractImages(file, outDir, mimeType = '') {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.pptx' || mimeType.includes('presentationml')) return fromPptx(file, outDir);
  if (ext === '.pdf' || mimeType.includes('pdf')) return fromPdf(file, outDir);
  if (/\.(png|jpe?g|webp)$/i.test(ext)) return [file];
  return [];
}

/** The best few, as web-sized thumbnails. Returns what was written. */
export function thumbnail(sources, destDir, prefix, keep = 4, size = 480) {
  fs.mkdirSync(destDir, { recursive: true });
  const picked = sources
    .filter(looksLikeContent)
    .map((f) => ({ f, score: contentScore(f) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, keep);

  const written = [];
  picked.forEach(({ f }, i) => {
    const out = path.join(destDir, `${prefix}-${i + 1}.webp`);
    const ok = run('convert', [
      `${f}[0]`, '-auto-orient', '-strip',
      '-resize', `${size}x${size}>`, '-quality', '72', out,
    ]);
    if (ok !== null && fs.existsSync(out)) {
      const d = dimensions(out);
      written.push({ file: path.basename(out), w: d?.w ?? null, h: d?.h ?? null });
    }
  });
  return written;
}
