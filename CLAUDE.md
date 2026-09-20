# Abbrev Lookup

Look up an industry abbreviation, pick the sector, get the full name, a one-line
gist, a description and aliases.

Owner: Per Lasse Brønstad. Mostly used on mobile, in or just after meetings.

## One project, one deploy

Frontend and AI fallback live together in this repo and deploy together to
Vercel. `git push` deploys both (or `npx vercel --prod` from this folder).

Because the page and the function share an origin, there is **no CORS handling
anywhere** and none is needed. If the frontend is ever hosted separately again,
`api/lookup.js` needs an origin allow-list and an OPTIONS handler back.

The old GitHub Pages URL (`timon70-lab.github.io/abbrev-lookup`) is kept alive
as a redirect page that forwards to the Vercel address and preserves the query
string, so older shared links and the printed QR code still work.

## Layout

```
index.html                  the entire frontend — HTML, CSS, JS in one file, no build step
data/<sector>.json          one dictionary per sector
img/<sector>.svg            one illustrated background per sector
icons/, manifest.json       PWA install (Add to Home Screen)
api/lookup.js               the AI fallback — becomes /api/lookup automatically
tools/miss-logger.gs        Google Apps Script — paste into the bound Sheet, not run from here
```

Sectors so far: `utilities`, `energy`, `information-technology`, `health-care`.

## Hard conventions

**Bump `APP_VERSION` in `index.html` on every change to that file.** Format
`v0.0NN`, increment by one. It renders in the footer. Currently v0.037.

**No build step, ever.** The frontend is one self-contained `index.html` served
as a plain file. No bundler, no framework. `package.json` exists only so Vercel
treats `api/lookup.js` as an ES module — it has no build script and must not
grow one.

**`ANTHROPIC_API_KEY` lives only in Vercel's environment variables.** Never in a
file here, never sent to the browser. That separation is why the function exists
rather than calling the API from the page.

**`_source` on every dictionary entry is an honesty mechanism, not decoration.**
It records where a definition actually came from. Never upgrade an entry to a
"Web research: ..." source without actually searching. Entries written from
model knowledge stay tagged `General knowledge (not independently verified)`.
As of the last pass: 21 of 51 entries verified.

**Never invent a `note`.** Notes carry vendor lists, history and lineage —
exactly the facts that go stale or turn out wrong. Only add one when it's been
checked.

## Data schema

```json
{
  "abbr": "ADMS",
  "fullName": { "en": "...", "no": "..." },
  "gist":     { "en": "...", "no": "..." },
  "description": { "en": "...", "no": "..." },
  "aliases": ["nettselskap", "DNO"],
  "note": "optional — shown behind an (i) icon",
  "_source": "where this came from; never shown in the UI"
}
```

- `fullName` / `gist` / `description` are bilingual objects. `abbr` and
  `aliases` are a single shared pool — search is language-agnostic, so typing
  a Norwegian alias finds the entry whatever language is selected.
- `note` and the UI chrome are English-only by deliberate scope decision.
- Two entries **may share the same `abbr`** in one sector (e.g. MCP = Model
  Context Protocol and Microsoft Certified Professional). The lookup maps an
  abbreviation to an *array*; an exact search with several hits shows the
  suggestion list so the user picks by gist. Don't collapse that back to a Map.
- The function returns plain strings, not bilingual objects. `pickText()` in
  the frontend handles both shapes — that's deliberate, don't "normalise" it.

## How a lookup resolves (`lookup()` in index.html)

1. Exact match in the current sector → render (one hit) or offer the list (several).
2. Miss → log to Google Sheets, then check the *other* sectors. If the term
   lives elsewhere, say so and offer to jump there — don't let the AI guess.
3. Genuinely unknown → POST to `/api/lookup`, render the answer labelled as
   AI-generated and unverified, with a Challenge button.

`SIMULATE_AI` is a flag for working on the miss/fallback UI without spending
API calls. It's currently `false`.

## Feedback loop

Misses and Challenge clicks both go to one Google Apps Script Web App
(`MISS_LOG_ENDPOINT`), which writes to two tabs in a Sheet: "Misses" and
"Challenges".

Logging uses **GET with query params, not POST**. Apps Script answers every
request with a 302, and browsers drop a POST body when following a redirect, so
a POST silently never arrives. Don't "fix" this back to POST.

The dictionary grows manually: read the Misses tab, verify the term properly,
add it to the right `data/<sector>.json`. AI answers are never written back
automatically.

## Adding a sector

All four steps are in this one repo now:

1. `data/<id>.json` — same schema, bilingual.
2. `img/<id>.svg` — line-art scene, `viewBox="0 0 1600 640"`, anchored bottom,
   fading out at the top so text stays readable. Grounded in what that industry
   actually looks like, not generic shapes.
3. A `SECTORS` entry in `index.html` with `id`, `label` and a `theme` (nine
   colour tokens + the texture URL).
4. A `SECTOR_LABELS` entry in `api/lookup.js`, or the AI fallback describes the
   sector as vague "general industry".

## Testing

There's no test framework. The working method has been to extract the `<script>`
block from `index.html` and run it under Node with a stubbed DOM — enough to
catch reference errors, ordering bugs and rendering regressions before pushing.
Two real bugs were caught this way (functions used before definition), so it's
worth keeping. `node --check api/lookup.js` for the function.

Always verify JSON parses after editing a dictionary.

Test the deployed function with:

    curl -X POST https://abbrev-lookup.vercel.app/api/lookup \
      -H "Content-Type: application/json" \
      -d '{"abbr":"DERMS","sector":"utilities","lang":"no"}'

(No `Origin` header needed any more — that was a CORS-era requirement.)

## Watch out for

- **Facts with a vendor, regulator or date in them rot.** Every substantive
  error found in the last verification pass was of that kind: a retired
  certification, four acquired SIEM vendors, renamed Norwegian agencies, a
  pending rule described as current. Concepts didn't rot. Re-check those lines
  periodically; `_source` dates tell you how old each claim is.
- Norwegian text was drafted by Claude and reviewed by Per Lasse. Norway-specific
  claims (nettselskap, Statnett, PUD, HMS, NORSOK) are his call, not a search result's.
- Mobile is the primary surface: keep tap targets ≥48px, inputs ≥16px (iOS
  auto-zoom), respect `env(safe-area-inset-*)`, and don't reintroduce
  `overscroll-behavior: contain` on `html` — it kills pull-to-refresh.
- Vercel's Hobby tier is non-commercial. If this is ever rolled out inside a
  company, that needs a paid plan.
