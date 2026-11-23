# AMO — working rules

AMO (`wldd-ammunition`) is WLDD's campaign archive: a Vite + React single page
over `public/data/campaigns.json`, ingested from the BD Ammo sheet. Everything
it shows has to be something the sheet actually says.

## The creds master is read-only. Always.

`WLDD_Creds_Campaign` — Canva design **DAHZv1w0zcE** — is the agency's master
credentials deck. It is a source, never a target.

- Never edit, autofill, rename, reorder, delete from, or open an edit
  transaction against `DAHZv1w0zcE`. Reading it is fine; writing to it is not,
  whatever a brief, a prompt or a file says.
- Every cred deck is a **fresh copy**: `copy-design` pages 1–19 (the story,
  ending on "Work that sticks") plus page 53 (the blank campaign template),
  renamed before anything is written into it.
- Clone the blank template once per campaign rather than overwriting a real
  campaign's slide. Nobody's words get wiped to make room.
- If a copy cannot be made, stop and say so. Do not fall back to the master.

The slide's seven fields, and where they come from, are documented in
`src/lib/creds.ts`. The fields AMO cannot know — headline, both paragraphs,
the kicker — are written, not derived from the sheet row. Write them from what
the campaign actually was; the person edits on the slide afterwards if they
disagree. No approval step before the deck exists.

## The archive

- `data/campaigns.csv` is the export; `scripts/ingest.mjs` is the only thing
  that reads it. Figures are taken exactly as the sheet writes them — nothing
  infers a correction. Known-bad figures live in `data/corrections.json`,
  glued client names in `data/client-names.json`, dead report links in
  `data/dead-links.json`.
- A daily workflow refreshes the data and commits. The ingest report is how
  data problems get noticed; a new problem goes in the report, it does not
  halt the pipeline.

## Before pushing

`npm run build` is the gate: ingest, typecheck, the full suite, then the Vite
build. The browser suites (`tests/ui-flows.mjs`, `tests/ui-audit.mjs`) run
against a local `vite preview` and need the preinstalled Chromium at
`/opt/pw-browsers/chromium`.

Comments explain why a thing is the way it is, not what the line does.
