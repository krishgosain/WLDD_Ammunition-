/**
 * End-to-end interaction flows.
 *
 * The unit suite proves the search engine is right and ui-audit proves nothing
 * is visually broken. This proves the things people actually do still work.
 *
 *   node tests/ui-flows.mjs http://localhost:4173
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const B = process.argv[2] || 'http://localhost:4173';
const fails = []; const errs = [];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  // behind an HTTPS proxy (sandboxed CI), route the font request through it
  ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: '<-loopback>,localhost,127.0.0.1' }, args: ['--ignore-certificate-errors'] } : {}) });
const p = await b.newPage({ viewport:{width:1500,height:940} });
p.on('pageerror', e=>{ if(!/THREE is not defined/.test(e.message)) errs.push(e.message); });
p.on('console', m=>{ if(m.type()==='error' && !/CERT_AUTHORITY|Failed to load resource/.test(m.text())) errs.push(m.text()); });
const step=async(n,f)=>{try{await f();console.log('  ok   '+n);}catch(e){console.log('  FAIL '+n+'\n       '+e.message);fails.push(n);}};
const A=(c,m)=>{if(!c)throw new Error(m);};

await p.goto(B,{waitUntil:'networkidle'}); await p.waitForSelector('.card'); await p.waitForTimeout(1200);

await step('gaps and health are gone', async()=>{
  const views = await p.locator('.segmented button').allInnerTexts();
  A(views.join().toUpperCase()==='BOARD,FIELD', 'switcher shows '+views.join());
  await p.goto(B+'/?view=gaps',{waitUntil:'networkidle'});
  await p.waitForSelector('.card',{timeout:10000});
  A(await p.locator('.table').count()===0, 'a gaps table still rendered');
  A(await p.locator('.segmented button[aria-pressed="true"]').innerText().then(t=>t.toUpperCase())==='BOARD','bad view did not fall back to the board');
});

await step('reach figures vary across a result set', async()=>{
  await p.goto(B,{waitUntil:'networkidle'}); await p.waitForSelector('.card'); await p.waitForTimeout(1800);
  const figs = await p.locator('.card__fig--reach b').allInnerTexts();
  A(figs.length>4,'not enough reach figures: '+figs.length);
  const uniq = new Set(figs);
  A(uniq.size>3, 'figures barely vary: '+JSON.stringify([...uniq]));
  const sizes = new Set(await p.locator('.card__fig--reach b').evaluateAll(els=>els.map(e=>getComputedStyle(e).fontSize)));
  A(sizes.size===1, 'reach figures use more than one size: '+[...sizes]);
  console.log('       '+figs.length+' figures, '+uniq.size+' distinct, one size');
});

await step('hover actions appear and are clickable', async()=>{
  await p.locator('.card').first().hover(); await p.waitForTimeout(500);
  const acts = await p.locator('.card').first().locator('.act').allInnerTexts();
  A(acts.length>=2, 'actions missing: '+JSON.stringify(acts));
  const before = await p.locator('.tray__item').count();
  await p.locator('.card').first().locator('.card__pick').click();
  await p.waitForTimeout(500);
  A(await p.locator('.tray__item').count()===before+1,'compare did not add');
  console.log('       '+JSON.stringify(acts));
});

await step('copy line works from the card', async()=>{
  await p.locator('.card').nth(1).hover(); await p.waitForTimeout(400);
  await p.locator('.card').nth(1).locator('.act', { hasText:'COPY' }).click();
  await p.waitForTimeout(600);
  A(await p.locator('.toast').count()>0, 'no confirmation shown');
});

await step('density toggle switches layout', async()=>{
  await p.goto(B,{waitUntil:'networkidle'}); await p.waitForSelector('.card'); await p.waitForTimeout(800);
  const wide = await p.locator('.card').first().boundingBox();
  await p.evaluate(()=>document.activeElement&&document.activeElement.blur());
  await p.keyboard.press('d'); await p.waitForTimeout(900);
  A(await p.locator('.card--compact').count()>0,'compact class not applied');
  const narrow = await p.locator('.card').first().boundingBox();
  A(narrow.height < wide.height, `not shorter: ${wide.height} -> ${narrow.height}`);
  console.log(`       card height ${Math.round(wide.height)} -> ${Math.round(narrow.height)}`);
  await p.keyboard.press('d'); await p.waitForTimeout(600);
});

await step('arrow keys walk the grid', async()=>{
  await p.locator('.card').first().focus();
  const first = await p.evaluate(()=>document.activeElement?.getAttribute('data-card-index'));
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(350);
  const right = await p.evaluate(()=>document.activeElement?.getAttribute('data-card-index'));
  A(right === String(+first+1), `right went ${first} -> ${right}`);
  await p.keyboard.press('ArrowDown'); await p.waitForTimeout(350);
  const down = await p.evaluate(()=>document.activeElement?.getAttribute('data-card-index'));
  A(+down > +right, `down went ${right} -> ${down}`);
  console.log(`       ${first} → ${right} → ${down}`);
});

await step('Enter on a focused card opens it', async()=>{
  const label = await p.evaluate(()=>document.activeElement?.getAttribute('aria-label'));
  await p.keyboard.press('Enter');
  await p.waitForSelector('.pane',{timeout:5000});
  A(await p.locator('.pane').getAttribute('aria-label')===label,'opened the wrong campaign');
  await p.keyboard.press('Escape'); await p.waitForTimeout(700);
});

await step('shortfall names the real ceiling', async()=>{
  await p.fill('.search__input','jewellery above 800M reach');
  await p.waitForTimeout(1000);
  A(await p.locator('.shortfall').count()>0,'no shortfall banner');
  const t = await p.locator('.shortfall').innerText();
  A(/highest/i.test(t), 'banner did not name the ceiling: '+t.slice(0,80));
  await p.fill('.search__input',''); await p.waitForTimeout(500);
});

await step('command palette filters on click', async()=>{
  await p.keyboard.press('Meta+k'); await p.waitForSelector('.cmdk');
  await p.fill('.cmdk__input','myntra'); await p.waitForTimeout(500);
  A(await p.locator('.cmdk__item').count()>0,'no palette hits');
  await p.locator('.cmdk__item').first().click(); await p.waitForTimeout(700);
  A(await p.locator('.cmdk').count()===0,'palette stayed open');
  A(await p.locator('.facet__n').count()>0,'no filter applied');
});

await step('pitch mode hides internal columns', async()=>{
  await p.goto(B,{waitUntil:'networkidle'}); await p.waitForSelector('.card');
  await p.evaluate(()=>document.activeElement&&document.activeElement.blur());
  await p.keyboard.press('p'); await p.waitForTimeout(600);
  A(await p.locator('.iconbtn--on').count()>0,'pitch not engaged');
  A(await p.locator('.facet__head',{hasText:'Campaign lead'}).count()===0,'lead facet still shown');
  await p.keyboard.press('p'); await p.waitForTimeout(400);
});

await step('3D field renders', async()=>{
  await p.evaluate(()=>document.activeElement&&document.activeElement.blur());
  await p.keyboard.press('f');
  await p.waitForSelector('.field canvas',{timeout:25000});
  await p.waitForTimeout(3000);
  const box = await p.locator('.field canvas').boundingBox();
  A(box.width>200 && box.height>200,'canvas too small');
  await p.keyboard.press('g'); await p.waitForTimeout(600);
});

await step('theme toggles', async()=>{
  await p.evaluate(()=>document.activeElement&&document.activeElement.blur());
  await p.keyboard.press('t'); await p.waitForTimeout(500);
  A(await p.getAttribute('html','data-theme')==='dark','theme did not switch');
  await p.keyboard.press('t'); await p.waitForTimeout(400);
});

await step('a deep link restores the view', async()=>{
  await p.goto(B+'/?q=fintech&sort=reach',{waitUntil:'networkidle'});
  await p.waitForSelector('.card',{timeout:12000});
  A(await p.inputValue('.search__input')==='fintech','query not restored');
  A(await p.inputValue('.select')==='reach','sort not restored');
});

await step('search still works end to end', async()=>{
  await p.goto(B,{waitUntil:'networkidle'}); await p.waitForSelector('.card');
  await p.fill('.search__input','any amplification for myntra above 20M reach');
  await p.waitForTimeout(1000);
  const clients = await p.locator('.card__client').allInnerTexts();
  A(clients.length>0 && clients.every(c=>/myntra/i.test(c)),'client leak: '+JSON.stringify([...new Set(clients)]));
  console.log('       '+clients.length+' results, all MYNTRA');
});

await step('Download PDF writes a file whose report links are real', async()=>{
  // The browser's print dialog cannot be trusted to carry a hyperlink into a
  // PDF: Chrome's own "Save as PDF" keeps the anchor as a /Link annotation,
  // but "Microsoft Print to PDF" — a printer driver — rasterises the page and
  // drops every annotation, which is what reached the field. The button now
  // writes the file itself, so this walks the real path and reads the bytes
  // that come out of it.
  await p.goto(B,{waitUntil:'networkidle'}); await p.waitForSelector('.card');
  const ids = await p.evaluate(async()=>{
    const r = await fetch('/data/campaigns.json'); const j = await r.json();
    const arr = Array.isArray(j) ? j : (j.campaigns ?? j.items ?? []);
    return arr.filter(c=>c.report).slice(0,3).map(c=>c.id);
  });
  A(ids.length===3,'no campaigns with report links to test with');
  await p.goto(B+'/?cmp='+ids.join('~'),{waitUntil:'networkidle'});
  await p.waitForSelector('text=Build one-pager',{timeout:15000});
  await p.click('text=Build one-pager');
  await p.waitForSelector('.onepage',{timeout:15000});
  await p.waitForTimeout(1200);
  const urls = await p.locator('.op-tile__report').evaluateAll(els=>els.map(e=>e.href));
  A(urls.length===3,'report links missing on screen');

  const [dl] = await Promise.all([
    p.waitForEvent('download',{timeout:90000}),
    p.click('text=Download PDF'),
  ]);
  const file = await dl.path();
  const pdf = fs.readFileSync(file);
  A(pdf.length>50000,'PDF came out near-empty ('+pdf.length+' bytes)');
  const txt = pdf.toString('latin1');
  const links = (txt.match(/\/Subtype\s*\/Link/g)||[]).length;
  // three reports, plus wldd.in on the wordmark, the CTA button and the contact card
  A(links===6,'expected 6 link annotations, found '+links);
  for (const u of urls) A(txt.includes(u),'the PDF does not carry '+u);
  A(txt.includes('https://wldd.in'),'the PDF does not link to wldd.in');
  A(/\/Subtype\s*\/Image/.test(txt),'the page itself is missing from the PDF');
  console.log('       '+dl.suggestedFilename()+' — '+Math.round(pdf.length/1024)+'kB, '+links+' live links');
});

await step('a 15-campaign kit becomes a multi-page A4 deck', async()=>{
  // The kit used to hold four. It now holds fifteen, which no longer fits one
  // sheet, so the one-pager deals itself across A4 pages: the opening sheet
  // keeps the headline number and four campaigns, every sheet after it takes
  // six. Each sheet has to stay exactly A4 or the PDF pages come out ragged.
  const ids = await p.evaluate(async()=>{
    const r = await fetch('/data/campaigns.json'); const j = await r.json();
    const arr = Array.isArray(j) ? j : (j.campaigns ?? j.items ?? []);
    return arr.filter(c=>c.report && c.reach).slice(0,15).map(c=>c.id);
  });
  A(ids.length===15,'not enough campaigns with reach and a report to fill a kit');
  await p.goto(B+'/?cmp='+ids.join('~'),{waitUntil:'networkidle'});
  await p.waitForSelector('text=Build one-pager',{timeout:15000});
  await p.click('text=Build one-pager');
  await p.waitForSelector('.onepage',{timeout:15000});
  await p.waitForTimeout(1500);

  A(await p.locator('.onepage').count()===3,'expected 3 sheets, got '+await p.locator('.onepage').count());
  A(await p.locator('.op-tile').count()===15,'not every campaign made it onto a sheet');
  const heights = await p.locator('.onepage').evaluateAll(els=>els.map(e=>e.offsetHeight));
  A(heights.every(h=>h===1123),'a sheet is not A4: '+heights.join(', '));
  A(await p.locator('.op-cta').count()===1,'the closing call to action should appear once, on the last sheet');

  const [dl] = await Promise.all([
    p.waitForEvent('download',{timeout:120000}),
    p.click('text=Download PDF'),
  ]);
  const pdf = fs.readFileSync(await dl.path());
  const txt = pdf.toString('latin1');
  const pages = (txt.match(/\/Type\s*\/Page[^s]/g)||[]).length;
  const links = (txt.match(/\/Subtype\s*\/Link/g)||[]).length;
  A(pages===3,'expected a 3-page PDF, got '+pages);
  A(links>=15,'expected at least 15 link annotations, got '+links);
  console.log('       '+pages+' A4 pages, '+links+' live links, '+Math.round(pdf.length/1024)+'kB');
  await p.goto(B,{waitUntil:'networkidle'});
});

await step('the one-pager survives print media', async()=>{
  // Ctrl+P still has to work. The print stylesheet hides the board, every
  // virtualised row then measured zero, the virtualiser read each zero as a
  // resize, and React gave up - taking the one-pager down with it.
  const ids = await p.evaluate(async()=>{
    const r = await fetch('/data/campaigns.json'); const j = await r.json();
    const arr = Array.isArray(j) ? j : (j.campaigns ?? j.items ?? []);
    return arr.filter(c=>c.report).slice(0,3).map(c=>c.id);
  });
  await p.goto(B+'/?cmp='+ids.join('~'),{waitUntil:'networkidle'});
  await p.waitForSelector('text=Build one-pager',{timeout:15000});
  await p.click('text=Build one-pager');
  await p.waitForSelector('.onepage',{timeout:15000});
  await p.waitForTimeout(800);
  await p.emulateMedia({media:'print'});
  await p.waitForTimeout(2500);
  A(await p.locator('.onepager').count()>0,'the one-pager was torn out of the DOM in print');
  await p.emulateMedia({media:'screen'});
});

console.log('\nerrors: '+errs.length); errs.slice(0,5).forEach(e=>console.log('  ! '+e.slice(0,160)));
console.log('failures: '+fails.length);
await b.close();
process.exit(fails.length||errs.length?1:0);
