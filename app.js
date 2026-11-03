/* Daily Reads — student app. Works offline; results queue and send when there's signal. */
(function () {
  "use strict";
  const CFG = window.APP_CONFIG || {};
  const TARGET = (CFG.TARGET_MINUTES || 20) * 60;
  const app = document.getElementById("app");

  // ---------- storage ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };
  let deviceId = store.get("deviceId", null);
  if (!deviceId) { deviceId = "d" + Math.random().toString(36).slice(2, 10); store.set("deviceId", deviceId); }

  // ---------- helpers ----------
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>");
  function para(text) {
    if (text.startsWith("## ")) return "<h3>" + inline(text.slice(3)) + "</h3>";
    return "<p>" + inline(text) + "</p>";
  }
  function todayStr(d) {
    d = d || new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function niceDate(s) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });
  }
  const mins = (sec) => Math.round(sec / 60);
  const fmtClock = (sec) => Math.floor(sec / 60) + ":" + String(Math.floor(sec % 60)).padStart(2, "0");

  // ---------- content ----------
  let pack = null;
  async function loadPack() {
    try {
      const r = await fetch("content/week.json", { cache: "no-store" });
      if (!r.ok) throw new Error("http " + r.status);
      pack = await r.json();
      store.set("pack", pack);
    } catch (e) {
      pack = store.get("pack", null);
    }
  }
  function allSessions() {
    if (!pack) return [];
    const out = [];
    (pack.days || []).forEach((day) => (day.sessions || []).forEach((s) => out.push(Object.assign({ date: day.date }, s))));
    return out;
  }
  const findSession = (id) => allSessions().find((s) => s.id === id);

  // ---------- outbox ----------
  function queue(item) { const q = store.get("outbox", []); q.push(item); store.set("outbox", q); flush(); }
  let flushing = false;
  async function flush() {
    if (flushing || !CFG.SCRIPT_URL) return;
    flushing = true;
    try {
      let q = store.get("outbox", []);
      while (q.length) {
        const item = q[0];
        // text/plain + no-cors avoids a CORS preflight that Apps Script can't answer.
        await fetch(CFG.SCRIPT_URL, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(item) });
        q = store.get("outbox", []); q.shift(); store.set("outbox", q);
      }
    } catch (e) { /* offline — try again later */ }
    flushing = false;
    if (current === null) renderHome();
  }
  window.addEventListener("online", flush);

  // ---------- active-time tracking (pauses when the app isn't on screen) ----------
  let run = null;          // in-progress session state
  let current = null;      // session id being shown, or null on home
  let visibleSince = null;
  let ticker = null;
  function startClock() { if (document.visibilityState === "visible") visibleSince = Date.now(); }
  function bankTime() {
    if (run && visibleSince) {
      const dt = (Date.now() - visibleSince) / 1000;
      if (run.stage === "read") run.readSec += dt; else run.quizSec += dt;
      visibleSince = Date.now();
      store.set("inprogress", run);
    }
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") { bankTime(); visibleSince = null; if (run) run.awayCount = (run.awayCount || 0) + 1; store.set("inprogress", run); }
    else if (run) visibleSince = Date.now();
  });
  function activeSec() { let s = run ? run.readSec + run.quizSec : 0; if (run && visibleSince) s += (Date.now() - visibleSince) / 1000; return s; }
  function startTicker() {
    clearInterval(ticker);
    ticker = setInterval(() => { const el = document.getElementById("clock"); if (el) el.textContent = fmtClock(activeSec()); }, 1000);
  }

  // ---------- home ----------
  function renderHome() {
    current = null; clearInterval(ticker);
    const done = store.get("done", {});
    const today = todayStr();
    const sessions = allSessions();
    const todays = sessions.filter((s) => s.date === today);
    const catchup = sessions.filter((s) => s.date < today && !done[s.id]);
    const outbox = store.get("outbox", []).length;
    const resume = store.get("inprogress", null);
    const name = store.get("name", "");

    let h = '<div class="topbar"><h1>' + (name ? "Hi " + esc(name) : "Daily Reads") + "</h1></div>";
    h += '<p class="muted">' + niceDate(today) + (pack && pack.title ? " · " + esc(pack.title) : "") + "</p>";
    if (!pack) h += '<div class="banner">No lessons loaded yet. Open the app once with signal to download this week.</div>';
    if (outbox) h += '<div class="banner">' + outbox + " result" + (outbox > 1 ? "s" : "") + " waiting to send — they'll go when you have signal.</div>";

    if (resume && findSession(resume.id)) {
      const s = findSession(resume.id);
      h += "<h2>Carry on</h2>" + card(s, false, "resume");
    }
    h += "<h2>Today</h2>";
    h += todays.length ? todays.map((s) => card(s, !!done[s.id])).join("") : '<p class="muted">Nothing scheduled today' + (catchup.length ? " — catch up on one below." : ". Enjoy the day off.") + "</p>";
    if (catchup.length) h += "<h2>Catch up</h2>" + catchup.map((s) => card(s, false)).join("");

    if (sessions.length) {
      h += '<h2>This week</h2><div class="card"><div class="dots">' +
        sessions.map((s) => '<span class="' + (done[s.id] ? "done" : "") + '" title="' + esc(s.date + " " + (s.slot || "")) + '"></span>').join("") +
        '</div><p class="small muted" style="margin:8px 0 0">' + sessions.filter((s) => done[s.id]).length + " of " + sessions.length + " done</p></div>";
    }
    h += '<p class="small muted" style="margin-top:24px"><button class="link" id="setname">' + (name ? "Change name" : "Set your name") + "</button></p>";
    app.innerHTML = h;

    app.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => openSession(b.getAttribute("data-open"))));
    const sn = document.getElementById("setname");
    sn.addEventListener("click", () => { const n = prompt("Your first name?", name); if (n !== null) { store.set("name", n.trim().slice(0, 30)); renderHome(); } });
  }
  function card(s, isDone, mode) {
    const r = store.get("done", {})[s.id];
    const right = isDone ? '<span class="tick" aria-label="done">✓</span>' : '<span class="go" aria-hidden="true">›</span>';
    const sub = isDone && r ? r.score + "/" + r.total + " · " + mins(r.activeSec) + " min" : (s.minutes || 20) + " min" + (mode === "resume" ? " · tap to continue" : "");
    return '<button class="card session-card" data-open="' + esc(s.id) + '"' + (isDone ? ' aria-label="Done: ' + esc(s.topic) + '"' : "") + '>' +
      '<div class="meta"><div><span class="pill ' + esc(s.subject) + '">' + esc(s.subject) + "</span>" +
      '<span class="small muted">' + esc(s.slot || "") + (s.date !== todayStr() ? " · " + esc(niceDate(s.date)) : "") + "</span></div>" +
      '<div class="title">' + esc(s.topic) + '</div><div class="small muted">' + sub + "</div></div>" + right + "</button>";
  }

  // ---------- session flow ----------
  function openSession(id) {
    const s = findSession(id); if (!s) return;
    const done = store.get("done", {});
    if (done[id]) { renderReview(s, done[id]); return; }
    let r = store.get("inprogress", null);
    if (!r || r.id !== id) {
      r = { id, stage: "read", q: 0, answers: [], readSec: 0, quizSec: 0, awayCount: 0, startedAt: new Date().toISOString(), reflection: "" };
    }
    run = r; current = id; store.set("inprogress", run);
    startClock(); startTicker();
    render();
  }
  function render() {
    const s = findSession(run.id);
    if (run.stage === "read") renderRead(s);
    else if (run.stage === "quiz") renderQuestion(s);
    else if (run.stage === "reflect") renderReflect(s);
    window.scrollTo(0, 0);
  }
  function header(s, label, frac) {
    return '<div class="topbar"><button class="link" id="back">‹ Home</button><span class="timer">⏱ <span id="clock">' + fmtClock(activeSec()) + "</span></span></div>" +
      '<div><span class="pill ' + esc(s.subject) + '">' + esc(s.subject) + '</span><span class="small muted">' + esc(label) + "</span></div>" +
      '<div class="progress"><i style="width:' + Math.round(frac * 100) + '%"></i></div>';
  }
  function wireBack() { document.getElementById("back").addEventListener("click", () => { bankTime(); visibleSince = null; run = null; renderHome(); }); }

  function renderRead(s) {
    const rd = s.read || {};
    const words = (rd.body || []).join(" ").split(/\s+/).length;
    const minRead = Math.round(words / 300 * 60); // floor at a brisk pace, so skipping straight to questions isn't possible
    let h = header(s, "Read", 0.05) + '<h1>' + esc(rd.title || s.topic) + "</h1>";
    if (rd.intro) h += '<p class="muted">' + inline(rd.intro) + "</p>";
    h += '<article class="reading">' + (rd.body || []).map(para).join("") + "</article>";
    if (rd.keywords && rd.keywords.length) {
      h += '<div class="card"><h3 style="margin-top:0">Key words</h3><dl class="keywords">' +
        rd.keywords.map((k) => "<dt>" + esc(k.term) + "</dt><dd>" + inline(k.def) + "</dd>").join("") + "</dl></div>";
    }
    h += '<button class="btn" id="next" disabled>Questions (' + s.questions.length + ") ›</button>" +
      '<p class="small muted" id="hint" style="text-align:center"></p>';
    app.innerHTML = h; wireBack();
    const btn = document.getElementById("next"), hint = document.getElementById("hint");
    const check = () => {
      const left = Math.max(0, minRead - run.readSec - (visibleSince ? (Date.now() - visibleSince) / 1000 : 0));
      if (left <= 0) { btn.disabled = false; hint.textContent = ""; clearInterval(t); }
      else hint.textContent = "Keep reading — questions unlock in " + fmtClock(left);
    };
    const t = setInterval(() => { if (current !== s.id || run.stage !== "read") return clearInterval(t); check(); }, 1000);
    check();
    btn.addEventListener("click", () => { bankTime(); run.stage = "quiz"; run.q = 0; store.set("inprogress", run); render(); });
  }

  function renderQuestion(s) {
    const i = run.q, qq = s.questions[i], prev = run.answers[i];
    let h = header(s, "Question " + (i + 1) + " of " + s.questions.length, 0.1 + 0.8 * (i / s.questions.length));
    h += '<p class="q">' + inline(qq.q) + "</p>";
    h += qq.options.map((o, k) => {
      let cls = "opt";
      if (prev) { if (k === qq.answer) cls += " right"; else if (k === prev.chosen) cls += " wrong"; }
      return '<button class="' + cls + '" data-k="' + k + '"' + (prev ? " disabled" : "") + ">" + "ABCD"[k] + ". " + inline(o) + "</button>";
    }).join("");
    if (prev) {
      h += '<div class="explain ' + (prev.ok ? "ok" : "no") + '"><strong>' + (prev.ok ? "Correct." : "Not quite — it's " + "ABCD"[qq.answer] + ".") + "</strong> " + inline(qq.explain || "") + "</div>";
      h += '<button class="btn" id="next">' + (i + 1 < s.questions.length ? "Next question ›" : (s.reflect ? "Last bit ›" : "Finish ›")) + "</button>";
    }
    app.innerHTML = h; wireBack();
    if (!prev) {
      app.querySelectorAll(".opt").forEach((b) => b.addEventListener("click", () => {
        const k = Number(b.getAttribute("data-k"));
        run.answers[i] = { n: i + 1, tag: qq.tag || "", chosen: k, correct: qq.answer, ok: k === qq.answer, at: Math.round(activeSec()) };
        store.set("inprogress", run); render();
      }));
    } else {
      document.getElementById("next").addEventListener("click", () => {
        bankTime();
        if (i + 1 < s.questions.length) run.q = i + 1;
        else if (s.reflect) run.stage = "reflect";
        else return finish(s);
        store.set("inprogress", run); render();
      });
    }
  }

  function renderReflect(s) {
    let h = header(s, "In your own words", 0.95);
    h += '<p class="q">' + inline(s.reflect) + '</p><textarea id="ref" placeholder="A few sentences is plenty…">' + esc(run.reflection || "") + "</textarea>";
    h += '<button class="btn" id="fin">Finish ›</button>';
    app.innerHTML = h; wireBack();
    const ta = document.getElementById("ref");
    ta.addEventListener("input", () => { run.reflection = ta.value.slice(0, 2000); store.set("inprogress", run); });
    document.getElementById("fin").addEventListener("click", () => finish(s));
  }

  function finish(s) {
    bankTime(); visibleSince = null; clearInterval(ticker);
    const score = run.answers.filter((a) => a && a.ok).length;
    const result = {
      type: "session", key: CFG.WRITE_KEY, deviceId, sessionId: s.id, week: pack.week || "", date: s.date, slot: s.slot || "",
      subject: s.subject, topic: s.topic, startedAt: run.startedAt, finishedAt: new Date().toISOString(),
      readSec: Math.round(run.readSec), quizSec: Math.round(run.quizSec), activeSec: Math.round(run.readSec + run.quizSec),
      awayCount: run.awayCount || 0, score, total: s.questions.length, reflection: run.reflection || "",
      answers: run.answers.map((a, i) => ({ n: i + 1, tag: a.tag, chosen: "ABCD"[a.chosen], correct: "ABCD"[a.correct], ok: a.ok, question: s.questions[i].q }))
    };
    const done = store.get("done", {}); done[s.id] = { score, total: result.total, activeSec: result.activeSec, answers: run.answers }; store.set("done", done);
    store.del("inprogress"); run = null;
    queue(result);
    renderResult(s, result);
  }

  function renderResult(s, r) {
    current = s.id;
    const pct = Math.round(100 * r.score / r.total);
    const msg = pct >= 90 ? "Brilliant." : pct >= 70 ? "Good work." : pct >= 50 ? "Solid start — have a look at the ones you missed." : "Tricky one — worth a re-read of the missed bits.";
    const wrong = r.answers.filter((a) => !a.ok);
    let h = '<div class="topbar"><button class="link" id="home">‹ Home</button></div>';
    h += '<span class="pill ' + esc(s.subject) + '">' + esc(s.subject) + "</span><h1>" + esc(s.topic) + '</h1><div class="card" style="text-align:center"><div class="score">' + r.score + "/" + r.total + "</div><p>" + msg + '</p><p class="small muted">' + mins(r.activeSec) + " minutes" + (r.activeSec < TARGET ? " — if you've got time left on the bus, look back over the reading." : "") + "</p></div>";
    if (wrong.length) {
      h += "<h2>Worth another look</h2>" + wrong.map((a) => {
        const q = s.questions[a.n - 1];
        return '<div class="card"><p style="margin-top:0"><strong>' + inline(q.q) + "</strong></p><p class=\"small\">Answer: " + inline(q.options[q.answer]) + '</p><p class="small muted" style="margin-bottom:0">' + inline(q.explain || "") + "</p></div>";
      }).join("");
    }
    h += '<button class="btn secondary" id="reread">Re-read the article</button><button class="btn" id="home2">Done</button>';
    app.innerHTML = h;
    document.getElementById("home").onclick = document.getElementById("home2").onclick = renderHome;
    document.getElementById("reread").onclick = () => renderArticleOnly(s);
  }
  function renderReview(s, d) {
    const r = { score: d.score, total: d.total, activeSec: d.activeSec, answers: (d.answers || []).map((a, i) => ({ n: i + 1, ok: a.ok })) };
    renderResult(s, r);
  }
  function renderArticleOnly(s) {
    const rd = s.read || {};
    app.innerHTML = '<div class="topbar"><button class="link" id="b">‹ Back</button></div><h1>' + esc(rd.title || s.topic) + '</h1><article class="reading">' + (rd.body || []).map(para).join("") + "</article>";
    document.getElementById("b").onclick = () => openSession(s.id);
    window.scrollTo(0, 0);
  }

  // ---------- start ----------
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  loadPack().then(() => {
    const r = store.get("inprogress", null);
    if (r && !findSession(r.id)) store.del("inprogress");
    renderHome(); flush();
  });
})();
