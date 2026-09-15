# Abbrev

Look up an industry abbreviation, pick the sector, get the full name, a short description and aliases.

## Run locally
The page fetches `data/<sector>.json`, so it needs to be served over HTTP:

    python3 -m http.server 8000

then open http://localhost:8000.

## Deploy
Push to GitHub, then Settings → Pages → Deploy from branch → `main` / root.

## Add a term
Edit the sector's JSON file and add an entry:

    { "abbr": "XYZ", "fullName": "...", "gist": "one-line headline", "description": "...", "aliases": [] }

Optional fields:
- `"note"` — extra context shown behind an (i) icon on the page (vendor names,
  history, maturity/lineage). Only add this once you've actually checked it.
- `"_source"` — never shown in the UI; a short note to your future self on
  where the definition came from ("Web research: ...", a vendor page, or
  "General knowledge (not independently verified)" if it wasn't specifically
  checked). This is what makes a Challenge fast to investigate later.

## Add a sector
1. Create `data/<id>.json` with the same shape.
2. Add `{ id, label }` to the `SECTORS` array at the top of `index.html`.

## AI fallback (step 2)
Set `AI_ENDPOINT` in `index.html` to a serverless function that accepts
`POST { abbr, sector }` and returns `{ fullName, gist, description, aliases }`.
