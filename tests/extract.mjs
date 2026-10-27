/**
 * The report extractor.
 *
 * Decks are built here rather than fetched, because the real ones are behind
 * a Drive login and run to 136MB. What is exercised is the part that can be
 * got wrong: telling a reel from a logo. A real deck is mostly furniture —
 * slide backgrounds, a wordmark on every page, divider strips — so an
 * extractor that keeps everything is as useless as one that keeps nothing.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extractImages, looksLikeContent, thumbnail, dimensions } from '../scripts/lib/extract.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wldd-extract-'));
const sh = (c, a) => execFileSync(c, a, { stdio: ['ignore', 'pipe', 'ignore'] });
let pass = 0; const fails = [];
const check = (name, cond) => { if (cond) pass++; else fails.push(name); };

console.log('\nReport extractor');

// Shapes a real deck contains: a reel, a square post, a wordmark, a divider.
const make = (name, w, h, colour) => {
  const f = path.join(dir, name);
  sh('convert', ['-size', `${w}x${h}`, `xc:${colour}`, '-depth', '8', f]);
  return f;
};
const reel = make('reel.png', 1080, 1920, 'tomato');
const post = make('post.png', 1080, 1080, 'steelblue');
const logo = make('logo.png', 180, 180, 'gold');
const strip = make('strip.png', 1600, 90, 'black');

// --- what is content and what is furniture -------------------------------
check('a reel is content', looksLikeContent(reel));
check('a square post is content', looksLikeContent(post));
check('a logo is not content', !looksLikeContent(logo));
check('a divider strip is not content', !looksLikeContent(strip));
console.log('  ok   reels and posts kept, logos and strips dropped');

// --- a real pptx, which is a zip with its media in ppt/media -------------
const pptx = path.join(dir, 'deck.pptx');
const stage = path.join(dir, 'stage/ppt/media');
fs.mkdirSync(stage, { recursive: true });
for (const f of [reel, post, logo, strip]) fs.copyFileSync(f, path.join(stage, path.basename(f)));
fs.mkdirSync(path.join(dir, 'stage/ppt/slides'), { recursive: true });
fs.writeFileSync(path.join(dir, 'stage/[Content_Types].xml'), '<Types/>');
execFileSync('zip', ['-q', '-r', pptx, '.'], { cwd: path.join(dir, 'stage') });

const fromDeck = extractImages(pptx, path.join(dir, 'out-pptx'), 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
check('a pptx gives up its media', fromDeck.length === 4);
check('the deck has both the reel and the post', fromDeck.filter(looksLikeContent).length === 2);
console.log(`  ok   pptx: ${fromDeck.length} images out, ${fromDeck.filter(looksLikeContent).length} of them content`);

// --- a real pdf with the same images embedded ----------------------------
const pdf = path.join(dir, 'report.pdf');
sh('convert', [reel, post, logo, '-quality', '92', pdf]);
const fromPdfOut = extractImages(pdf, path.join(dir, 'out-pdf'), 'application/pdf');
check('a pdf gives up images', fromPdfOut.length > 0);
check('the pdf yields something that is content', fromPdfOut.some(looksLikeContent));
console.log(`  ok   pdf: ${fromPdfOut.length} images out, ${fromPdfOut.filter(looksLikeContent).length} of them content`);

// --- thumbnails ----------------------------------------------------------
const thumbs = thumbnail(fromDeck, path.join(dir, 'thumbs'), 'c99', 4, 480);
check('thumbnails are written', thumbs.length === 2);
check('thumbnails are webp', thumbs.every((t) => t.file.endsWith('.webp')));
check('thumbnails are bounded', thumbs.every((t) => t.w <= 480 && t.h <= 480));
const first = thumbs[0] && dimensions(path.join(dir, 'thumbs', thumbs[0].file));
check('the reel is ranked first', !!first && first.h > first.w);
check('a thumbnail is small enough to serve', thumbs.every(
  (t) => fs.statSync(path.join(dir, 'thumbs', t.file)).size < 120_000));
console.log(`  ok   ${thumbs.length} thumbnails, reel first, ${thumbs.map((t) => `${t.w}x${t.h}`).join(' ')}`);

// --- nothing to find is not a crash --------------------------------------
check('an unreadable file yields nothing', extractImages(path.join(dir, 'nope.pdf'), path.join(dir, 'out-none'), 'application/pdf').length === 0);
console.log('  ok   a missing or unreadable report yields nothing rather than throwing');

fails.forEach((f) => console.log(`  FAIL ${f}`));
console.log(`  ${pass} passed, ${fails.length} failed`);
fs.rmSync(dir, { recursive: true, force: true });
if (fails.length) process.exit(1);
