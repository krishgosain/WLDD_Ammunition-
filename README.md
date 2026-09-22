# WLDD Ammo

Search every campaign WLDD has run. Built for the BD and sales floor: find the
proof, quote the real number, send the link.

**1,736 campaigns · 492 clients · 23 verticals · 2025–2026**

Campaigns are products. Industries are departments. Services are collections.
Someone should be able to browse without knowing what they want, or search
precisely when they do.

---

## Quick start

```bash
npm install
npm run ingest     # data/campaigns.csv  →  public/data/*.json
npm run dev        # http://localhost:5173
```

`npm run build` runs ingest, typechecks and bundles in one pass.

## Deploying to Vercel

The repo is zero-config. At [vercel.com/new](https://vercel.com/new), import
`krishgosain/WLDD_Ammunition-`, pick the branch, and deploy — `vercel.json`
already declares the framework, build command, output directory, SPA rewrite
and cache headers. No environment variables are needed; the dataset is
committed.

Every push redeploys. Data refreshes itself — see below.

---

## Daily refresh

The BD Ammo sheet
([17Zw3Rj…](https://docs.google.com/spreadsheets/d/17Zw3Rj0hv26vz7mApLB5hiKiY__5liO4tKF3VqGUaPQ/edit))
updates every day. `.github/workflows/refresh-data.yml` pulls it at 03:30 UTC
(09:00 IST), normalises it, and pushes only when the archive actually changed.
Vercel redeploys on that push.

**No model is in the loop.** That is the point: a scheduled job costs nothing to
run and never forgets. Asking an assistant to do it each morning would cost
tokens every day and stop the moment nobody asked.

```
cron ──▶ fetch-sheet.mjs ──▶ ingest.mjs ──▶ changed? ──▶ commit ──▶ Vercel
                                              └── no ──▶ stop
```

### Setup

**The sheet is link-readable, so the job needs no credentials and no secrets.**
It runs as-is.

Two repository settings have to be right, both one-time:

| Setting | Where | Why |
|---|---|---|
| Workflow permissions → **Read and write** | Settings → Actions → General | The job pushes the refreshed archive. A push rejected for this reason names the setting in the log. |
| Vercel connected to this repo | [vercel.com/new](https://vercel.com/new) | Without it the commits land but nothing deploys. |

`claude/elegant-faraday-kg9yrx` is the repository's default branch, which
matters twice: scheduled workflows only ever run from the default branch, and
Vercel picks it as the production branch on import. Neither needs changing.

Then: Actions → *Refresh campaign data* → **Run workflow** to confirm it works
before trusting the schedule.

**If the sheet is ever made private again**, the job keeps working via a service
account: create one in [Google Cloud](https://console.cloud.google.com/iam-admin/serviceaccounts)
with the Drive API enabled, share the sheet with its
`…@….iam.gserviceaccount.com` address as Viewer, and add the JSON key as the
repository secret `GOOGLE_SERVICE_ACCOUNT_JSON`. `fetch-sheet.mjs` prefers the
secret when present and falls back to the public export when it is not — no code
change either way.

### Why it diffs the JSON, not the CSV

Google re-serialises date cells on every export — `2/8/2025` one day,
`02/08/2025` the next, same date. Between two real exports five days apart that
churn touched **458 rows** while the data underneath was unchanged. Committing
the raw CSV would mean a few hundred lines of noise and a pointless deploy every
single morning.

Ingest parses both spellings to the same ISO date, so the normalised JSON is
stable. The workflow commits on a diff of `public/data`, never the CSV.

`tests/ingest-stability.mjs` holds that invariant: it flips the padding on every
date cell, re-ingests, and requires byte-identical output — then edits one
figure and requires the output to change. If the first breaks the workflow
commits noise daily; if the second breaks it silently skips real updates.

### Safety rails

`scripts/fetch-sheet.mjs` refuses to overwrite the archive when the download
does not look right, because Google answers an unauthorised export with a
sign-in **page**, not an error:

- HTML instead of CSV → stop
- no `Industry,Client,Campaign Name` header → stop
- fewer than 500 rows → stop
- row count down more than 10% → stop, unless re-run with `FORCE=1`

A stale entry in `data/corrections.json` fails the build locally but only warns
during the refresh (`--lenient`): the sheet is the source of truth, an override
that no longer matches simply does not apply, and a dead entry must not stop
real campaign updates from reaching the app.

### By hand

```bash
npm run refresh     # fetch + ingest
npm run fetch       # fetch only
```

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Build | Vite 6 + React 18 + TypeScript (strict) | Fast HMR, typed data model |
| Styling | Hand-written CSS with custom properties | One token file, no utility-class sprawl |
| 3D | react-three-fiber + drei, lazy-loaded | The Reach Field is a data view, not a background |
| Motion | Motion (`motion/react`) | Drawer, tray, list and card transitions |
| Search | Custom engine (`src/lib/search.ts`) | Synonym-aware; a generic fuzzy library cannot do the shortfall logic |
| Virtualisation | @tanstack/react-virtual | 1,736 cards must not mount at once |
| CSV | PapaParse, ingest only | Build time; never ships to the browser |

Initial payload is ~110kB gzipped of JS plus the archive fetched in parallel.
three.js (232kB gz) loads only when the Reach Field is opened.

---

## The problems this solves

### 1. Concept search, not string matching

"cosmetic brand with 30M+ reach" has to work even though the sheet says
`Cosmetics & Skin Care`. `src/lib/taxonomy.ts` maps concepts onto the literal
values in the sheet — `beauty`, `skincare`, `makeup`, `grooming` all resolve to
the same vertical; `bank`, `fintech`, `bfsi`, `lending` all resolve to Finance.

**Typos resolve too.** `src/lib/fuzzy.ts` builds a vocabulary from the archive
itself — every industry, service, client and lead — so new clients become
searchable, and misspellable, the moment they land in the sheet. `finech` finds
Finance, `razorpey` finds Razorpay, `influencor` finds Influencers.

Ranking is not raw edit distance, which gets the common case wrong: `cosmet` is
one edit from the client *COMET* and two from *cosmetic*, so distance alone
picks a five-campaign client over a seventy-five-campaign industry. Because
search-as-you-type means every query passes through its own prefixes, a prefix
relationship outranks any non-exact edit, and campaign weight breaks the
remaining ties.

**Compound requests work.** "any amplification done for Myntra above 20M reach"
resolves a service, a client and a numeric floor, and drops the rest as noise.
Stopwords never resolve as entities on their own — "brand" appears inside client
names like *Brand Solutions*, and letting a bare "brand" bind to them silently
narrowed queries to nothing.

**Matches are tiered**, tightest first:

| Tier | Meaning |
|---|---|
| exact | a quoted phrase, or the whole query, verbatim in the title |
| strong | every term in the client or campaign name |
| partial | every term somewhere in the record |
| broad | only some terms match |

Broad matches appear **only when nothing tighter exists**, are labelled on the
card, and the result header says the net was widened. Quoting a phrase —
`"oily sunscreen"` — makes it a hard requirement.

**Every chip is a button.** The intent row shows exactly how the query was read;
clicking a chip removes that constraint, clicking an amber correction undoes it
and restores what you typed, and "did you mean" offers the runner-up readings
one click away.

### 2. Never quote a number that isn't there

If someone asks for 30M+ and nothing qualifies, the tool does **not** quietly
widen the threshold and present the results as matches. It names the real
ceiling:

> No Jewellery campaign reached 800M reach. The highest is Tanishq x Smart
> Indian News at 6.3M. Showing the top 6 with their real figures.

The rule: **categorical constraints never relax.** A cosmetics query must never
return FMCG. Numeric constraints relax only after the shortfall is stated out
loud, and every card always shows its true figure. A BD person quoting an
inflated number on a live call is the worst failure this tool can cause.

### 3. Pitch Mode

BD opens this mid-call and turns the laptop around. Pressing <kbd>P</kbd> hides
everything internal — campaign leads, status, promised-vs-delivered ratios, the
"no report" marks — leaving the work and the results. It survives in the URL, so
a link shared with a prospect opens in the same state.

### 4. Messy production data

`scripts/ingest.mjs` handles what the sheet actually contains:

- **Mixed date formats** — `26/1/2026` and `26/01/2026` both parse.
- **Whitespace in names** — `Pradheeksha\tBoopathy` collapses to one lead.
- **Case-variant clients** — `LICIOUS` and `Licious` fold to one client, keeping
  the most common spelling.
- **Legacy service codes** — `OLD-AMPLIFICATION` maps to `Amplification` and is
  tagged legacy rather than shown as a separate service.
- **Non-industries** — `Others`, `Agency` and `Person` are not verticals. They
  become a separate `clientType` and read as Unclassified, never faked into a
  category they don't belong to.
- **Dead links** — `na`, `cr`, blanks and non-URLs never render as clickable.

**Figures are shown exactly as the sheet records them.** `235747 Thousand` reads
as 235.7M because that is what the sheet says and WLDD has confirmed those are
real. No rule in the pipeline infers a correction. The **Health** view lists the
rows worth a second look — 51 with engagement recorded above reach, 63 with the
same number in both columns — so they can be fixed at source rather than
silently patched here.

### Corrections

The one exception is `data/corrections.json`: figures WLDD has explicitly
confirmed and asked to override, applied by hand rather than by rule.

```json
{
  "client": "FOXTALE",
  "campaign": "GVC Brief | Foxtale x WLDD",
  "reach": 9700000,
  "eng": 2300000,
  "note": "Confirmed by WLDD. Sheet read '9733017 Million' / '233457 Thousand'."
}
```

It exists because the sheet is re-exported: editing `campaigns.csv` directly
means the next download quietly reinstates the bad figure. Overrides are matched
on client + campaign name (case- and whitespace-insensitive), reapplied on every
ingest, and every one is listed in the Health view beside the string it
replaced.

**`npm run build` fails if an override stops matching a row.** That is the point
— when a campaign is renamed, or the fix lands in the sheet itself, the build
tells you to delete the entry instead of letting a dead override rot unnoticed.

Four figures are currently corrected (the four that previously read above two
billion). Removing them is a one-line delete each once the sheet is fixed.

The one derived figure that *is* clamped is the "% of target" label, which is
computed by this app rather than read from the sheet: past 100× it collapses to
"over 100× target" instead of printing `129773560% of target`.

---

## Views

- **Grid** — virtualised cards, sorted by match, reach, engagement, deliverables
  or date, in comfortable or compact density. Arrow keys walk it as a grid.
- **3D Field** — every campaign as a point: x is time, y is reach on a log scale,
  z is its vertical, size is engagement, colour is department. Rendered as a
  single instanced mesh so 1,700 points stay at 60fps. It answers what the grid
  can't: *where are our proof points thin?* Falls back to a plain message where
  WebGL is unavailable.

Data quality no longer has a tab. `npm run ingest` prints it instead — missing
reports, unfiled figures, engagement above reach, confirmed corrections, and the
verticals with nothing above 10M — so it surfaces when the sheet is refreshed,
which is the moment anyone can act on it.

## The card

The card answers, top to bottom, the only four questions asked of it: who was it
for, what was it, how big did it get, and did it beat what we promised.

**The bar is magnitude, not delivery.** Delivery was the obvious thing to draw,
and it was wrong: promises in this archive are set low and almost everything
beats them, so every bar came out full and green and carried no information.
Reach against the rest of the result set does carry information — it makes a
grid scannable by size at a glance. It is a log scale, because reach spans a
thousand-fold within one result set and a linear bar would render everything
below the leader as an empty track. The bar takes the industry colour, so it
doubles as the category cue. Delivery keeps its place as the label beside it,
where green or amber still says whether the campaign beat what was sold.

**Hover swaps metadata for actions.** Open the report, copy the pitch line, or
go to details — so the common case never needs the drawer.

**Compact density** drops the objective and tightens the type, fitting roughly
four times as many campaigns on screen for scanning a long result set.

## Tests

```bash
npm test                                       # 36 search + 2 stability checks
node tests/ui-audit.mjs http://localhost:4173  # layout, needs a preview server
node tests/ui-flows.mjs http://localhost:4173  # interactions, needs a preview server
```

`npm test` covers typo resolution, entity extraction from compound queries,
match tiering, stopword handling, and the honesty guarantees — that categorical
constraints never relax and that a shortfall reports the true ceiling.
`npm run build` runs it, so a regression cannot ship.

`tests/ui-audit.mjs` sweeps 11 views across 4 breakpoints for the defects a
type checker cannot see: horizontal overflow, off-screen controls, buttons with
no handler, **overlapping hit targets**, affordances that have drifted off the
control they belong to, zero-size drawing surfaces, and console errors.

The overlap check exists because Motion writes `transform` wholesale, so
any element that also uses `transform` to position itself is silently erased.
That bug shipped three times in this codebase — the compare tray, the shortcut
sheet, and the virtualised grid, where every row collapsed onto the first and
clicks landed on the wrong campaign.

`tests/ui-flows.mjs` covers what people actually do: the magnitude bars vary,
hover actions fire, copy confirms, density switches, arrow keys walk the grid,
Enter opens the focused card, the shortfall banner names the real ceiling, the
palette filters, pitch mode hides internals, the 3D field renders, the theme
toggles, and a deep link restores the view.

## Keyboard

| | |
|---|---|
| <kbd>/</kbd> | Focus search |
| <kbd>⌘K</kbd> | Jump to a client, industry, service or lead |
| <kbd>P</kbd> | Pitch mode |
| <kbd>G</kbd> <kbd>F</kbd> | Grid · 3D Field |
| <kbd>D</kbd> | Comfortable / compact rows |
| <kbd>↑↓←→</kbd> | Move through the grid |
| <kbd>C</kbd> | Copy a link to this exact search |
| <kbd>E</kbd> | Export results as CSV |
| <kbd>T</kbd> | Light / dark |
| <kbd>R</kbd> | Reset |
| <kbd>?</kbd> | Shortcuts |

Single-key shortcuts stay quiet while a field has focus, so typing "philips"
doesn't toggle pitch mode.

---

## Structure

```
.github/workflows/          daily refresh from the sheet
data/campaigns.csv          source export, refreshed by the workflow
data/corrections.json       hand-confirmed figure overrides
scripts/fetch-sheet.mjs     sheet → CSV, with validation rails
scripts/ingest.mjs          CSV → JSON + data-quality report
public/data/                generated; fetched at runtime, never hand-edited
src/lib/
  types.ts                  shapes shared with the ingest script
  taxonomy.ts               synonyms, service canon, departments, series colours
  search.ts                 query parser, match engine, shortfall, facet counts
  format.ts                 every number, date and ratio the UI prints
  data.ts                   async archive loader
  url.ts                    URL ⇄ state, so any view is a shareable link
  export.ts                 CSV export, pitch lines, clipboard
  useHotkeys.ts
src/components/             Grid, Card, QuickView, FilterRail, ReachField,
                            CompareTray, CommandPalette, ClientDossier,
                            Backdrop, Skeleton, Segmented, ShortcutHelp, Icons
src/components/ui/          vendored shadcn components
src/styles/
  tokens.css                WLDD palette and type, light + dark
  app.css
```

## shadcn / Tailwind

This started as a Vite + React + TypeScript app with hand-written CSS — no
Tailwind, no shadcn, no path alias. All three are now in place, added
**additively** so the existing design system still owns the look.

What was added, and the CLI equivalent if you rebuild this from scratch:

```bash
npm i tailwindcss @tailwindcss/vite clsx tailwind-merge class-variance-authority
npx shadcn@latest init        # writes components.json, the alias and lib/utils
npx shadcn@latest add <name>  # drops a component into src/components/ui
```

| Piece | Where | Note |
|---|---|---|
| Tailwind v4 | `@tailwindcss/vite` in `vite.config.ts` | No config file needed in v4 |
| Styles entry | `src/styles/app.css` | Declared in `components.json` |
| Path alias | `@/*` → `src/*` | In both `tsconfig.json` and `vite.config.ts` |
| `cn()` | `src/lib/utils.ts` | clsx + tailwind-merge, what every shadcn component imports |
| Manifest | `components.json` | Tells the CLI where things go |
| Components | `src/components/ui/` | |

**Preflight is deliberately not imported.** `app.css` pulls in Tailwind's theme
and utilities layers but skips the reset, because this app's visual language
lives in `tokens.css` and Tailwind's base styles would flatten it. Tailwind is
therefore purely additive — available for new work, invisible to old.

### Why `components/ui` specifically

This project keeps its own components in `src/components/`. The `ui/`
subfolder is a separate thing and the split matters:

- **The CLI writes there.** `components.json` points `ui` at
  `@/components/ui`, and `npx shadcn@latest add` overwrites files at that path.
  Anything of your own living there can be clobbered by an update.
- **It marks ownership.** Files in `ui/` are vendored — copied in, occasionally
  re-copied, and read as "upstream". Files in `components/` are ours. Someone
  reviewing a diff needs to know which is which without asking.
- **Imports are portable.** Components published for shadcn assume
  `@/components/ui/<name>` and `@/lib/utils`. Matching the convention means
  paste-in components work unedited, which is the whole point.

### Motion, not framer-motion

`motion` is `framer-motion` renamed upstream — same library, same API, new entry
point. Adding `motion` beside the existing `framer-motion` would have bundled
the animation library twice, so the eight files that imported it were migrated
to `motion/react` and `framer-motion` was removed. One copy, 42kB gzipped, in
its own chunk.

If you add another component that asks for `framer-motion`, change its import
to `motion/react` rather than installing the old package again.

### Vendored components

| Component | Path | Notes |
|---|---|---|
| `FluidFieldBackground` | `ui/fluid-field.tsx` | Used via `Backdrop` |
| `StackSpread` | `ui/stack-spread.tsx` | Not mounted — see below |

### StackSpread

Copied in as given, with its demo at `ui/stack-spread-demo.tsx`. It compiles,
and rendering it in isolation confirms the mechanism: eight cards, a 350vh
stage, a 224px travel between the clustered and scattered states, centre copy
fading in on scroll, pointer parallax once settled.

**It is not mounted anywhere.** The tool opens straight into the grid because
BD opens it mid-pitch and needs product on screen immediately — putting three
and a half viewport-heights of scroll-driven stock photography in front of that
would undo the thing the tool is for. The component's own images are a plane, a
dog, a footballer and a basketball watch face, and its copy reads "Design That
Responds", none of which is WLDD's archive.

Where it would genuinely earn its place is a prospect-facing intro — a page BD
sends ahead of a call, with the eight cards swapped for real campaign stills and
the copy rewritten. That is a deliberate product decision rather than something
to switch on quietly, so it is left wired up and ready:

```tsx
import StackSpread from '@/components/ui/stack-spread';

<StackSpread
  bgColor="#08080A"
  textColor="#F2F2F5"
  cardRadius={14}
/>
```

### FluidFieldBackground

`src/components/ui/fluid-field.tsx`, copied in as given. It renders a
three.js simplex-noise shader inside a sandboxed iframe.

One fix was required: the payload's own `vertexShader` and `fragmentShader`
template literals contained unescaped backticks, which close the outer template
literal early — the file as supplied does not parse. The four backticks are now
backslash-escaped. That is a JavaScript-level change only; the emitted HTML is
byte-identical, and a build-time check asserts the shader source survives intact.

It is wired up in `src/components/Backdrop.tsx` rather than used directly,
because the iframe fetches three.js, Tailwind, GSAP and Iconify from CDNs on
every load — roughly a megabyte of scripts for a decorative background, on a
tool whose whole point is opening fast mid-pitch. So the backdrop:

- loads it **lazily, at idle**, never blocking first paint
- **skips it entirely** under `prefers-reduced-motion`
- **unmounts it** when the tab is hidden, so no hidden shader loop runs
- puts it behind a **user toggle** that persists
- hue-rotates it off the shader's native blue onto WLDD violet-magenta

If the CDN is blocked or offline the iframe renders flat and the grain, grid
and vignette layers carry the backdrop on their own.

## Design

Palette and display type are taken from wldd.in's own stylesheet so this reads
as WLDD property rather than a generic dashboard: `#131313` ink, `#FF3427` red,
`#FFD644` yellow, `#8580F7` violet, `#DF29B1` magenta, set in Bricolage
Grotesque. Dark is the default because the brand site is black-first; light is a
full peer.

**Two voices.** Display type carries meaning; JetBrains Mono carries the
machinery — every label, count, id, unit and tag. That single split is what
stops a data tool reading as a form.

**Steep hierarchy.** The reach figure is the largest thing on a card because it
is the number that gets said out loud on a call. The client, the index and the
services sit small and mono at the edges. Everything else stays quiet.

**Colour as index.** Each card carries its industry colour as `--accent`, which
drives the client label, a bleed behind the card and the hover glow — so a
filtered grid reads as one hue and a mixed grid reads as a spectrum.

**Depth without chrome.** Surfaces are separated by hairlines and a top-edge
highlight rather than borders and shadows, over a backdrop of live shader,
film grain, a drafting grid and a vignette.

**Motion with intent.** Rows stagger in as results change, cards lift on a
spring, and the view switcher's active pill is one shared element that slides
between options rather than two that blink.

Colour never carries meaning on its own, focus rings are visible throughout,
and `prefers-reduced-motion` stops every idle animation including the shader.

## Notes

- The repository is public and the committed dataset includes client names,
  objectives, performance figures, campaign leads and report links.
- `noindex, nofollow` is set on the page, which discourages search engines but
  does not restrict access. Vercel's Password Protection or Vercel Authentication
  is the way to actually gate the deployment.

## Roadmap

- [ ] Budget — decks don't carry spend; needs a join against the finance sheet
- [ ] Self-hosted Bricolage Grotesque, to drop the render-blocking font request
- [ ] Admin queue — resolve the Health findings in-app and write corrections back to the sheet
- [ ] Saved searches per user
