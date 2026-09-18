/**
 * Layout and interaction audit.
 *
 * Sweeps every view at every breakpoint for the classes of defect that type
 * checks and unit tests cannot see: overflow, off-screen controls, buttons with
 * no handler, overlapping hit targets, affordances that have drifted off the
 * control they belong to, zero-size canvases, and console errors.
 *
 *   node tests/ui-audit.mjs http://localhost:4173
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:4173';
const problems = [];

const VIEWS = [
  ['grid', '/'],
  ['search', '/?q=any%20amplification%20for%20myntra%20above%2020M%20reach%202026'],
  ['typo', '/?q=finech%20influencor'],
  ['broad', '/?q=zzzq'],
  ['field', '/?view=field&ind=OTT~Movie'],
  ['pitch', '/?pitch=1&q=netflix'],
  ['compare', '/?cmp=c0~c18~c99'],
  ['dossier', '/?dossier=AMAZON'],
  ['detail', '/?open=c0'],
];
const SIZES = [[1600, 1000], [1280, 860], [900, 800], [390, 844]];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

for (const [w, h] of SIZES) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errs = [];
  page.on('pageerror', (e) => {
    // The shader iframe loads three.js from a CDN. A blocked or offline CDN is
    // an environment fact; the backdrop degrades to grain and grid.
    if (/THREE is not defined/.test(e.message)) return;
    errs.push(e.message);
  });
  page.on('console', (m) => {
    if (m.type() === 'error' && !/CERT_AUTHORITY|Failed to load resource|THREE is not defined/.test(m.text())) {
      errs.push(m.text());
    }
  });

  for (const [name, url] of VIEWS) {
    await page.goto(BASE + url, { waitUntil: 'networkidle' });
    try { await page.waitForSelector('.card, .panel, .field, .pane', { timeout: 12000 }); } catch {}
    await page.waitForTimeout(name === 'field' ? 3200 : 800);

    const found = await page.evaluate(() => {
      const bad = [];
      const r = (el) => el.getBoundingClientRect();

      // 1. horizontal overflow
      const de = document.documentElement;
      if (de.scrollWidth > de.clientWidth + 2) {
        bad.push(`horizontal overflow ${de.scrollWidth} > ${de.clientWidth}`);
      }

      // Content in a horizontal scroller or a closed off-canvas drawer is
      // reachable and not a defect.
      const excused = (el) => {
        for (let n = el; n && n !== document.body; n = n.parentElement) {
          const cs = getComputedStyle(n);
          if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') return true;
          if (cs.transform !== 'none' && r(n).right <= 0) return true;
          if (cs.visibility === 'hidden' || cs.display === 'none') return true;
        }
        return false;
      };

      // 2. anything rendered off the edge
      for (const el of document.querySelectorAll('button, a, input, .card, .intent__chip')) {
        const b = r(el);
        if (!b.width && !b.height) continue;
        if ((b.right < -2 || b.left > innerWidth + 2) && !excused(el)) {
          bad.push(`off-screen ${el.className || el.tagName} @ ${Math.round(b.left)}`);
        }
      }

      // 3. controls that look interactive but carry no handler
      for (const el of document.querySelectorAll('button')) {
        const b = r(el);
        if (!b.width || !b.height || el.disabled) continue;
        const key = Object.keys(el).find((k) => k.startsWith('__reactProps$'));
        const props = key ? el[key] : null;
        if (props && !props.onClick && !props.onMouseDown && el.type !== 'submit') {
          bad.push(`dead control ${el.className} :: ${(el.textContent || '').trim().slice(0, 24)}`);
        }
      }

      // 4. overlapping hit targets. Motion writes `transform` wholesale,
      //    so any element that also uses transform for positioning silently
      //    collapses onto its siblings — invisible until a click lands on the
      //    wrong card.
      const cards = [...document.querySelectorAll('.card')].map(r)
        .filter((b) => b.width && b.height);
      for (let i = 0; i < cards.length; i++) {
        for (let j = i + 1; j < cards.length; j++) {
          const a = cards[i], c = cards[j];
          const ox = Math.min(a.right, c.right) - Math.max(a.left, c.left);
          const oy = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
          if (ox > 4 && oy > 4) { bad.push(`cards overlap by ${Math.round(ox)}×${Math.round(oy)}px`); i = cards.length; break; }
        }
      }

      // 5. chips must not cover the departments nav
      const depts = document.querySelector('.depts');
      if (depts) {
        const d = r(depts);
        for (const c of document.querySelectorAll('.intent__chip')) {
          const b = r(c);
          if (b.bottom > d.top + 1 && b.top < d.bottom - 1) { bad.push('chip over depts'); break; }
        }
      }

      // 6. overlay affordances stay centred on their control
      const input = document.querySelector('.search__input');
      if (input) {
        const ib = r(input);
        for (const sel of ['.search__icon', '.search__tail']) {
          const el = document.querySelector(sel);
          if (!el) continue;
          const b = r(el);
          const off = Math.abs((b.top + b.height / 2) - (ib.top + ib.height / 2));
          if (off > 3) bad.push(`${sel} is ${Math.round(off)}px off the input's centre`);
        }
      }

      // 7. zero-size drawing surfaces that are meant to be visible
      for (const el of document.querySelectorAll('canvas, svg')) {
        const b = r(el);
        if (b.width && b.height) continue;
        if (!el.checkVisibility?.({ checkVisibilityCSS: true })) continue;
        bad.push(`zero-size ${el.tagName}.${el.getAttribute('class') || ''}`);
      }
      return bad;
    });

    found.forEach((f) => problems.push(`${w}px ${name}: ${f}`));
  }
  errs.forEach((e) => problems.push(`${w}px console: ${e.slice(0, 150)}`));
  await page.close();
}

// keyboard and focus integrity
{
  const page = await browser.newPage({ viewport: { width: 1500, height: 940 } });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.card');

  const names = await page.locator('.topbar__actions button').evaluateAll(
    (els) => els.map((e) => (e.getAttribute('aria-label') || e.textContent || '').trim()));
  if (names.some((n) => !n)) problems.push('topbar control with no accessible name');

  for (const key of ['Meta+k', '?']) {
    await page.keyboard.press(key);
    try { await page.waitForSelector('.cmdk', { timeout: 3000 }); }
    catch { problems.push(`${key} did not open an overlay`); continue; }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    if (await page.locator('.cmdk').count()) problems.push(`Escape did not close the overlay from ${key}`);
  }

  await page.locator('.card').first().focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('.pane');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);   // past the pane's exit spring
  const active = await page.evaluate(() => document.activeElement?.className || '');
  if (!/card/.test(active)) problems.push(`focus not restored after the detail pane, went to: ${active}`);

  // clicking a card must open that card, not a neighbour
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const label = await page.locator('.card').nth(4).getAttribute('aria-label');
  await page.locator('.card').nth(4).click();
  await page.waitForSelector('.pane');
  const opened = await page.locator('.pane').getAttribute('aria-label');
  if (opened !== label) problems.push(`clicked "${label}" but "${opened}" opened`);

  await page.close();
}

await browser.close();
console.log(problems.length
  ? `\n${problems.length} problem(s):`
  : `\nClean across ${SIZES.length} widths × ${VIEWS.length} views.`);
[...new Set(problems)].forEach((p) => console.log('  · ' + p));
process.exit(problems.length ? 1 : 0);
