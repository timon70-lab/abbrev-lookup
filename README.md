# Abbrev

Look up an industry abbreviation, pick the domain, get the full name, a short description and aliases.

## Run locally
The page fetches `data/<domain>.json`, so it needs to be served over HTTP:

    python3 -m http.server 8000

then open http://localhost:8000.

## Deploy
Push to GitHub, then Settings → Pages → Deploy from branch → `main` / root.

## Add a term
Edit `data/utilities.json` and add an entry:

    { "abbr": "XYZ", "fullName": "...", "description": "...", "aliases": [] }

## Add a domain
1. Create `data/<id>.json` with the same shape.
2. Add `{ id, label }` to the `DOMAINS` array at the top of `index.html`.

## AI fallback (step 2)
Set `AI_ENDPOINT` in `index.html` to a serverless function that accepts
`POST { abbr, domain }` and returns `{ fullName, description, aliases }`.
