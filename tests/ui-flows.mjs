/**
 * End-to-end interaction flows.
 *
 * The unit suite proves the search engine is right and ui-audit proves nothing
 * is visually broken. This proves the things people actually do still work.
 *
 *   node tests/ui-flows.mjs http://localhost:4173
 */
import { chromium } from 'playwright';

const B = process.argv[2] || 'http://localhost:4173';
const fails = []; const errs = [];
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport:{width:1500,height:940} });
p.on('pageerror', e=>{ if(!/THREE is not defined/.test(e.message)) errs.push(e.message); });
p.on('console', m=>{ if(m.type()==='error' && !/CERT_AUTHORITY|Failed to load resource/.test(m.text())) errs.push(m.text()); });
const step=async(n,f)=>{try{await f();console.log('  ok   '+n);}catch(e){console.log('  FAIL '+n+'\n       '+e.message);fails.push(n);}};
const A=(c,m)=>{if(!c)throw new Error(m);};

await p.goto(B,{waitUntil:'networkidle'}); await p.waitForSelector('.card'); await p.waitForTimeout(1200);

await step('gaps and health are gone', async()=>{
  const views = await p.locator('.segmented button').allInnerTexts();
  A(views.join()==='GRID,FIELD', 'switcher shows '+views.join());
  await p.goto(B+'/?view=gaps',{waitUntil:'networkidle'});
  await p.waitForSelector('.card',{timeout:10000});
  A(await p.locator('.table').count()===0, 'a gaps table still rendered');
  A(await p.locator('.segmented button[aria-pressed="true"]').innerText()==='GRID','bad view did not fall back to grid');
});

await step('magnitude bars vary across a result set', async()=>{
  await p.goto(B,{waitUntil:'networkidle'}); await p.waitForSelector('.card'); await p.waitForTimeout(1800);
  const widths = await p.locator('.meter__fill').evaluateAll(els=>els.map(e=>{
    const m=/matrix\(([\d.]+)/.exec(getComputedStyle(e).transform); return m?+m[1]:1;
  }));
  A(widths.length>4,'not enough meters: '+widths.length);
  const uniq = new Set(widths.map(w=>w.toFixed(2)));
  A(uniq.size>3, 'bars barely vary: '+JSON.stringify([...uniq]));
  console.log('       '+widths.length+' bars, '+uniq.size+' distinct lengths');
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
  A(await p.getAttribute('html','data-theme')==='light','theme did not switch');
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

console.log('\nerrors: '+errs.length); errs.slice(0,5).forEach(e=>console.log('  ! '+e.slice(0,160)));
console.log('failures: '+fails.length);
await b.close();
process.exit(fails.length||errs.length?1:0);
