// Stubbed-DOM test harness.
//
//   node tools/harness.mjs                     run the suite (exit 1 on failure)
//   TEST_QUERY="?s=utilities&q=ADMS" node tools/harness.mjs    inspect one case
//   TEST_FILE=old.html node tools/harness.mjs  run against a different index.html
//
// There is no test framework here and no build step. This pulls the <script>
// block out of index.html and runs it under Node against a fake document and a
// fetch that reads data/*.json off disk. That is enough to catch reference
// errors, ordering bugs and rendering regressions before pushing.
//
// It earns its keep: it reproduces the v0.037 bug where a shared link rendered
// nothing because lookup() ran in the setup block, before the `let` bindings in
// the autocomplete section existed. That failed silently in the browser — the
// promise rejected and no error reached the user — so the unhandledRejection
// check below is the part that matters most. Every case asserts it is clean.

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import vm from "node:vm";

const ROOT = process.env.TEST_ROOT
  || path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const INDEX = process.env.TEST_FILE
  ? path.resolve(process.env.TEST_FILE)
  : path.join(ROOT, "index.html");

const html = fs.readFileSync(INDEX, "utf8");
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) throw new Error(`no <script> block found in ${INDEX}`);
const code = scriptMatch[1];

// ---- fake DOM -------------------------------------------------------------

function makeEl(id) {
  return {
    id, hidden: false, innerHTML: "", textContent: "", value: "",
    dataset: {}, style: { setProperty() {}, removeProperty() {} },
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    children: [],
    appendChild(c) { this.children.push(c); return c; },
    addEventListener() {}, removeEventListener() {},
    setAttribute() {}, removeAttribute() {}, getAttribute: () => null,
    focus() {}, blur() {}, close() {}, showModal() {},
    querySelector: () => makeEl("sub"), querySelectorAll: () => [],
  };
}

// Unhandled rejections are process-global and arrive a tick late, so they are
// collected into whichever case is currently running.
let currentFailures = [];
process.on("unhandledRejection", (err) => {
  currentFailures.push("unhandledRejection: " + (err?.stack || err));
});

async function runCase(query) {
  const els = {};
  const el = (id) => (els[id] ||= makeEl(id));
  const netLog = [];
  const failures = [];
  currentFailures = failures;

  const document = {
    documentElement: makeEl("html"),
    body: makeEl("body"),
    getElementById: (id) => el(id),
    querySelector: (sel) => el(sel.replace(/^#/, "")),
    querySelectorAll: () => [],
    createElement: (tag) => makeEl(tag),
    addEventListener() {},
  };

  const store = {};
  const sandbox = {
    document, console,
    location: {
      search: query, pathname: "/",
      href: "https://abbrev-lookup.vercel.app/" + query,
      origin: "https://abbrev-lookup.vercel.app",
      hostname: "abbrev-lookup.vercel.app",
    },
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    // data/*.json is served off disk; the miss-logger and the AI endpoint are
    // reachable but deliberately unhelpful, so no test depends on the network
    // or spends API credits.
    async fetch(u) {
      netLog.push(String(u));
      const local = String(u).match(/^data\/([a-z-]+)\.json$/);
      if (!local) return { ok: false, status: 599, json: async () => ({}), text: async () => "" };
      const file = path.join(ROOT, "data", local[1] + ".json");
      if (!fs.existsSync(file)) return { ok: false, status: 404 };
      const text = fs.readFileSync(file, "utf8");
      return { ok: true, status: 200, json: async () => JSON.parse(text), text: async () => text };
    },
    window: null,
    navigator: { userAgent: "node", language: "en", onLine: true },
    history: { replaceState(_s, _t, u) { sandbox.__lastUrl = u; }, pushState() {} },
    matchMedia: (q) => ({ matches: false, media: q, addEventListener() {}, addListener() {} }),
    setTimeout, clearTimeout, setInterval, clearInterval,
    URLSearchParams, URL, Map, Set, Promise, Math, Date, JSON,
    Object, Array, String, Number, Boolean, Error,
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    CSS: { supports: () => false },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  try {
    vm.runInContext(code, vm.createContext(sandbox), { filename: "index.html:<script>" });
  } catch (err) {
    failures.push("threw during script evaluation: " + (err?.stack || err));
  }

  await new Promise((r) => setTimeout(r, 300));   // let the lookup chain settle

  return {
    query: query || "(none)",
    version: el("version").textContent,
    sectorValue: el("sector").value,
    inputValue: el("q").value,
    resultHTML: el("result").innerHTML,
    suggestionsHTML: el("suggestions").innerHTML,
    suggestionsHidden: el("suggestions").hidden,
    urlAfter: sandbox.__lastUrl,
    fetched: netLog,
    failures,
  };
}

// ---- the suite ------------------------------------------------------------

const text = (h) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const CASES = [
  { name: "plain load renders nothing",
    query: "",
    check: (r) => r.resultHTML === "" || "expected an empty result pane" },

  { name: "shared link renders the entry",
    query: "?s=utilities&q=ADMS",
    check: (r) => text(r.resultHTML).includes("Advanced Distribution Management System")
      || "expected the ADMS entry" },

  { name: "shared abbr offers the picker (MCP)",
    query: "?s=information-technology&q=MCP",
    check: (r) => /has 2 meanings/.test(text(r.resultHTML))
      || "expected the two-meaning prompt" },

  { name: "shared abbr offers the picker (PIMS)",
    query: "?s=energy&q=PIMS",
    check: (r) => /has 2 meanings/.test(text(r.resultHTML)) && !r.suggestionsHidden
      || "expected two PIMS meanings and a visible suggestion list" },

  { name: "norwegian alias finds the entry",
    query: "?s=utilities&q=frontprosessor",
    check: (r) => text(r.resultHTML).includes("Front End Processor")
      || "expected the Norwegian alias to resolve to FEP" },

  { name: "norwegian text renders",
    query: "?s=energy&q=NVE&lang=no",
    check: (r) => text(r.resultHTML).includes("Norges vassdrags- og energidirektorat")
      || "expected Norwegian fullName with correct characters" },

  { name: "unknown term shows the miss state",
    query: "?s=utilities&q=ZZQQ",
    check: (r) => /isn't in the/.test(text(r.resultHTML))
      || "expected the miss state" },
];

if (process.env.TEST_QUERY !== undefined) {
  console.log(JSON.stringify(await runCase(process.env.TEST_QUERY), null, 2));
} else {
  let failed = 0;
  console.log(`harness: ${path.relative(ROOT, INDEX) || INDEX}\n`);
  for (const c of CASES) {
    const r = await runCase(c.query);
    const problem = r.failures.length
      ? r.failures[0].split("\n")[0]
      : (c.check(r) === true ? null : c.check(r));
    if (problem) {
      failed++;
      console.log(`  FAIL  ${c.name}`);
      console.log(`        ${c.query || "(no query)"}`);
      console.log(`        ${problem}`);
    } else {
      console.log(`  ok    ${c.name}`);
    }
  }
  console.log(`\n${CASES.length - failed}/${CASES.length} passed`);
  process.exit(failed ? 1 : 0);
}
