# Abbrev Lookup

Look up an industry abbreviation, pick the sector, get the full name, a one-line
gist, a description and aliases. Curated dictionary first; an AI fallback fills
genuine gaps and labels itself as unverified.

Live: https://abbrev-lookup.vercel.app

## Run locally

The page fetches `data/<sector>.json`, so it needs serving over HTTP:

    python3 -m http.server 8000

then open http://localhost:8000. The AI fallback won't work this way (no
function runtime) — for that, use `npx vercel dev` instead, which serves the
static files and `/api/lookup` together.

## Deploy

    npx vercel --prod

Or push to the connected GitHub repo and Vercel deploys automatically.

`ANTHROPIC_API_KEY` is set once in Vercel's environment variables:

    npx vercel env add ANTHROPIC_API_KEY production

## Add a term

Edit the sector's JSON file:

    {
      "abbr": "XYZ",
      "fullName": { "en": "...", "no": "..." },
      "gist":     { "en": "...", "no": "..." },
      "description": { "en": "...", "no": "..." },
      "aliases": []
    }

Optional fields:
- `"note"` — extra context shown behind an (i) icon. Only add once checked.
- `"_source"` — never shown; where the definition came from. Keep it honest:
  `"General knowledge (not independently verified)"` unless you actually looked
  it up.

Two entries may share the same `abbr` — the app offers a choice by gist.

## Add a sector

1. `data/<id>.json`
2. `img/<id>.svg` (viewBox 0 0 1600 640, anchored bottom)
3. A `SECTORS` entry in `index.html` (id, label, theme)
4. A `SECTOR_LABELS` entry in `api/lookup.js`

## Miss logging

`tools/` holds the Google Apps Script that logs unmatched searches and Challenge
clicks to a Google Sheet. See `tools/README.md`.
