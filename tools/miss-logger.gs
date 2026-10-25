/**
 * Google Apps Script Web App that logs two kinds of events to a Google
 * Sheet: abbreviation searches with no dictionary match ("Misses" tab), and
 * clicks on "Challenge" for an AI-generated answer ("Challenges" tab). Bind
 * this script to a Sheet (Extensions > Apps Script), paste this in, then
 * Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone),
 * and put the resulting URL into MISS_LOG_ENDPOINT in index.html.
 *
 * The site logs via GET with query params (?abbr=...&sector=...&type=...),
 * handled by doGet below — not doPost. Apps Script Web Apps answer every
 * request with a 302 redirect, and browsers drop a POST body when following
 * a 302, so a POST from the browser never actually reaches doPost with its
 * data intact. doPost is kept here in case you ever call this from a
 * server-side context (e.g. the Vercel function) where that redirect isn't
 * an issue.
 *
 * doGet also serves the log back out as JSON (?action=read), so the dictionary
 * pipeline can read what has been missed instead of a human reading the tab.
 * That read is behind a key — see readLog_ below.
 */
function doPost(e) {
  var data = {};
  try { data = JSON.parse(e.postData.contents); } catch (err) { data = {}; }
  logEvent_(data);
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

// Lets you open the deployment URL in a browser to confirm it's live, and to
// log a test row without going through the website at all:
//   .../exec                                    -> health check, no row written
//   .../exec?abbr=TEST&sector=demo               -> logs a test miss
//   .../exec?abbr=TEST&sector=demo&type=challenge -> logs a test challenge
//   .../exec?action=read&key=...                 -> reads the log back as JSON
function doGet(e) {
  var p = (e && e.parameter) || {};

  if (p.action === "read") return readLog_(p);

  if (p.abbr) {
    logEvent_(p);
    return json_({ ok: true, logged: p.abbr, type: p.type || "miss" });
  }
  return json_({ ok: true, note: "Add ?abbr=TEST&sector=demo (optionally &type=challenge) to this URL to test." });
}

/**
 * Reads a tab back out as JSON, for the dictionary pipeline.
 *
 *   ?action=read&key=...                 -> the Misses tab
 *   ?action=read&key=...&tab=challenges  -> the Challenges tab
 *   ?action=read&key=...&since=2026-10-01    -> only rows from that date on
 *   ?action=read&key=...&limit=500       -> cap the rows returned (default 5000)
 *
 * The web app is deployed "Anyone", because the browser has to be able to log
 * without signing in. That makes this read public too, so it is gated on a
 * shared key held in Script Properties (File > Project Settings > Script
 * Properties, add READ_KEY). Set one before deploying: with no READ_KEY set,
 * the read refuses rather than falling open.
 *
 * The key travels in the query string, so treat it as a weak secret — it keeps
 * the log from being casually readable by anyone who has the logging URL, which
 * is all it is meant to do. Rotate it by changing the property.
 */
function readLog_(p) {
  var expected = PropertiesService.getScriptProperties().getProperty("READ_KEY");
  if (!expected) return json_({ ok: false, error: "no READ_KEY set on this script" });
  if (p.key !== expected) return json_({ ok: false, error: "unauthorized" });

  var name = (p.tab === "challenges") ? "Challenges" : "Misses";
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) return json_({ ok: true, tab: name, rows: [], note: "tab does not exist yet" });

  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return json_({ ok: true, tab: name, rows: [] });

  var headers = values[0].map(function (h) {
    return String(h).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  });

  var since = p.since ? new Date(p.since) : null;
  if (since && isNaN(since.getTime())) since = null;
  var limit = Math.min(parseInt(p.limit, 10) || 5000, 20000);

  var rows = [];
  // Newest first, so a limit keeps the most recent rows rather than the oldest.
  for (var i = values.length - 1; i >= 1 && rows.length < limit; i--) {
    var row = values[i];
    var ts = row[0] instanceof Date ? row[0] : new Date(row[0]);
    if (since && !(ts >= since)) continue;
    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      obj[headers[c]] = (row[c] instanceof Date) ? row[c].toISOString() : row[c];
    }
    rows.push(obj);
  }

  return json_({ ok: true, tab: name, count: rows.length, rows: rows });
}

// Routes to the right sheet based on ?type= — "miss" (default) or "challenge".
function logEvent_(p) {
  var sector = (p.sector || "").toString().slice(0, 60);
  var abbr = (p.abbr || "").toString().slice(0, 60).toUpperCase();
  var page = (p.page || "").toString().slice(0, 200);

  if (p.type === "challenge") {
    var sheet = getOrCreateSheet_("Challenges", ["Timestamp", "Sector", "Abbreviation", "AI full name", "AI description", "Page"]);
    sheet.appendRow([
      new Date(), sector, abbr,
      (p.fullname || "").toString().slice(0, 200),
      (p.desc || "").toString().slice(0, 500),
      page,
    ]);
  } else {
    var sheet = getOrCreateSheet_("Misses", ["Timestamp", "Sector", "Abbreviation", "Page"]);
    sheet.appendRow([new Date(), sector, abbr, page]);
  }
}

function getOrCreateSheet_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
