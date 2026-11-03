/**
 * Daily Reads — results backend.
 * Paste into Extensions → Apps Script of a new Google Sheet, set the two keys, then
 * Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone.
 *
 * WRITE_KEY must match config.js in the app (it's public on GitHub, so it only allows adding results).
 * READ_KEY is private — you type it into the parent dashboard once. Never put it in the repo.
 */
const WRITE_KEY = "change-me-write";
const READ_KEY = "change-me-read";

const SESSION_COLS = ["sessionId", "receivedAt", "week", "date", "slot", "subject", "topic", "score", "total", "pct",
  "activeMin", "readMin", "quizMin", "awayCount", "startedAt", "finishedAt", "reflection", "deviceId"];
const ANSWER_COLS = ["sessionId", "date", "subject", "topic", "n", "tag", "ok", "chosen", "correct", "question"];

function sheet_(name, cols) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(cols); sh.setFrozenRows(1); }
  return sh;
}
function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function rows_(sh) {
  const v = sh.getDataRange().getValues();
  const head = v.shift() || [];
  return v.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] instanceof Date ? r[i].toISOString() : r[i]])));
}

function doPost(e) {
  let d;
  try { d = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: "bad json" }); }
  if (d.key !== WRITE_KEY || d.type !== "session" || !d.sessionId) return out_({ ok: false, error: "rejected" });

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const s = sheet_("Sessions", SESSION_COLS);
    const last = s.getLastRow();
    const ids = last > 1 ? s.getRange(2, 1, last - 1, 1).getValues().map(r => r[0]) : [];
    if (ids.indexOf(d.sessionId) !== -1) return out_({ ok: true, duplicate: true });

    const m = x => Math.round((Number(x) || 0) / 6) / 10; // seconds → minutes, 1 dp
    s.appendRow([d.sessionId, new Date(), d.week, d.date, d.slot, d.subject, d.topic, d.score, d.total,
      d.total ? Math.round(100 * d.score / d.total) : "", m(d.activeSec), m(d.readSec), m(d.quizSec), d.awayCount,
      d.startedAt, d.finishedAt, String(d.reflection || "").slice(0, 2000), d.deviceId]);

    const a = sheet_("Answers", ANSWER_COLS);
    const rows = (d.answers || []).map(x => [d.sessionId, d.date, d.subject, d.topic, x.n, x.tag, x.ok, x.chosen, x.correct, String(x.question || "").slice(0, 500)]);
    if (rows.length) a.getRange(a.getLastRow() + 1, 1, rows.length, ANSWER_COLS.length).setValues(rows);
  } finally {
    lock.releaseLock();
  }
  return out_({ ok: true });
}

function doGet(e) {
  if (!e.parameter || e.parameter.key !== READ_KEY) return out_({ ok: false, error: "key" });
  return out_({ ok: true, sessions: rows_(sheet_("Sessions", SESSION_COLS)), answers: rows_(sheet_("Answers", ANSWER_COLS)) });
}
