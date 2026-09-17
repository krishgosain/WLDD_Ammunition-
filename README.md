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

To refresh the data later: export the BD Ammo sheet to `data/campaigns.csv`,
run `npm run ingest`, commit. Every push redeploys.

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Build | Vite 6 + React 18 + TypeScript (strict) | Fast HMR, typed data model |
| Styling | Hand-written CSS with custom properties | One token file, no utility-class sprawl |
| 3D | react-three-fiber + drei, lazy-loaded | The Reach Field is a data view, not a background |
| Motion | Framer Motion | Drawer, tray and list transitions |
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

- **Grid** — virtualised cards, sorted by match, reach, engagement, deliverables or date.
- **3D Field** — every campaign as a point: x is time, y is reach on a log scale,
  z is its vertical, size is engagement, colour is department. Rendered as a
  single instanced mesh so 1,700 points stay at 60fps. It answers what the grid
  can't: *where are our proof points thin?* Falls back to a plain message where
  WebGL is unavailable.
- **Gaps** — every vertical ranked by its single best reach figure. Anything
  under 10M is a shelf with no headline proof. Sports, Jewellery and Edtech are
  currently the thinnest.
- **Health** — what the sheet is missing or contradicting.

## Tests

```bash
npm test      # 35 checks against the real archive
```

Covers typo resolution, entity extraction from compound queries, match tiering,
stopword handling, and the honesty guarantees — that categorical constraints
never relax and that a shortfall reports the true ceiling. `npm run build` runs
them, so a regression cannot ship.

## Keyboard

| | |
|---|---|
| <kbd>/</kbd> | Focus search |
| <kbd>⌘K</kbd> | Jump to a client, industry, service or lead |
| <kbd>P</kbd> | Pitch mode |
| <kbd>G</kbd> <kbd>F</kbd> <kbd>A</kbd> <kbd>H</kbd> | Grid · Field · Gaps · Health |
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
data/campaigns.csv          source export, committed
data/corrections.json       hand-confirmed figure overrides
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
                            GapFinder, DataHealth, ShortcutHelp, Icons
src/styles/
  tokens.css                WLDD palette and type, light + dark
  app.css
```

## Design

Palette and type are taken from wldd.in's own stylesheet so this reads as WLDD
property rather than a generic dashboard: `#131313` ink, `#FF3427` red,
`#FFD644` yellow, `#8580F7` violet, `#DF29B1` magenta, set in Bricolage
Grotesque. Dark is the default because the brand site is black-first; light is a
full peer.

The reach figure is the largest element on a card, because it is the number that
gets said out loud. Everything else stays quiet. Colour never carries meaning on
its own, focus rings are visible throughout, and `prefers-reduced-motion` stops
the field's idle rotation.

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
