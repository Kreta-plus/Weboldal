import { get, post } from "./api.js";
import { S, loadPrefs, loadOverview, applyPrefs, shownName } from "./state.js";
import { esc, toast } from "./util.js";
import { renderLogin } from "./views/login.js";
import { openBugReport, setFeedbackKinds, feedbackOn } from "./bugreport.js";

const PRIMARY = ["dashboard", "gradebook", "attendance", "timetable"]; // telefonon az alsó sávban; a többi a „Továbbiak” listában
const VIEWS = {
  dashboard: ["Kezdőlap", "🏠", () => import("./views/dashboard.js")],
  timetable: ["Órarend", "🗓️", () => import("./views/timetable.js")],
  gradebook: ["Jegyek", "📘", () => import("./views/gradebook.js")],
  attendance: ["Mulasztás", "✋", () => import("./views/attendance.js")],
  journal: ["Haladási napló", "📒", () => import("./views/journal.js")],
  homework: ["Házi feladat", "📝", () => import("./views/homework.js")],
  tests: ["Számonkérés", "📣", () => import("./views/tests.js")],
  classes: ["Osztályok", "👥", () => import("./views/classes.js")],
  notes: ["Feljegyzések", "💬", () => import("./views/notes.js")],
  log: ["Műveletnapló", "🧾", () => import("./views/log.js")],
  settings: ["Beállítások", "⚙️", () => import("./views/settings.js")],
  lesson: ["Óra", "🗓️", () => import("./views/lesson.js")],
};
const HIDDEN = ["lesson"]; // nem menüpont: az órarendből nyílik
const NAV_OF = { lesson: "timetable" }; // melyik menüpont legyen kiemelve
const GROUPS = [
  ["teach", "Tanóra", ["timetable", "attendance", "journal", "gradebook"]],
  ["tasks", "Feladatok", ["homework", "tests"]],
  ["school", "Osztályok", ["classes", "notes"]],
];
const GROUP_KEY = "kt_nav_closed";
const closedGroups = () => { try { return new Set(JSON.parse(localStorage.getItem(GROUP_KEY) || "[]")); } catch { return new Set(); } };

const app = document.getElementById("app");
let current = null, arg = "";

// cím: #nézet vagy #nézet/paraméter (pl. #attendance/g27|2026-11-03|3)
const parse = () => { const [v, ...rest] = location.hash.slice(1).split("/"); return [v, decodeURIComponent(rest.join("/"))]; };

async function boot() {
  let me;
  try { me = await get("/api/auth/me"); } catch { return showMsg("Nem érem el a szervert."); }
  const info = get("/api/auth/info").then((i) => setFeedbackKinds(i.feedback)).catch(() => {});
  if (!me.loggedIn) return renderLogin(app, boot);
  S.user = me.user;
  try { await Promise.all([loadPrefs(), loadOverview(), info]); } catch (e) { return showMsg(e.message); }
  shell();
}

function showMsg(t) { app.innerHTML = `<div class="login-wrap"><div class="card empty">${esc(t)}</div></div>`; }

function shell() {
  const [h, a] = parse();
  current = VIEWS[h] ? h : S.prefs.startView || "dashboard";
  arg = VIEWS[h] ? a : "";
  const link = (k, cls = "") => { const [l, ic] = VIEWS[k]; return `<a data-v="${k}" href="#${k}" class="${cls}"><span class="ic">${ic}</span>${l}</a>`; };
  const bugBtn = feedbackOn() ? `<button class="bug-btn" data-bug><span class="ic">📣</span>Hiba / ötlet</button>` : "";
  app.innerHTML = `<div class="shell"><aside class="side"><div class="brand"><img src="/img/logo.svg" alt=""><span class="brand-t">ZsírKréta<small class="brand-sub">tanári</small></span></div>
    <nav class="side-nav" aria-label="Menü">${link("dashboard")}
      ${GROUPS.map(([id, title, keys]) => `<div class="grp ${closedGroups().has(id) ? "" : "open"}" data-g="${id}">
        <button class="grp-h" aria-expanded="${!closedGroups().has(id)}"><span>${title}</span><span class="chev" aria-hidden="true">›</span></button>
        <div class="grp-b">${keys.map((k) => link(k)).join("")}</div></div>`).join("")}
      <div class="side-foot">${link("log")}${link("settings")}${bugBtn}</div></nav>
    <nav class="nav">${Object.keys(VIEWS).filter((k) => !HIDDEN.includes(k)).map((k) => link(k, PRIMARY.includes(k) ? "" : "sec")).join("")}
      <button class="more-btn" id="more" aria-expanded="false"><span class="ic">⋯</span>Továbbiak</button></nav>
    <div class="me"><div class="avatar">🧑‍🏫</div><div class="grow"><b>${esc(shownName())}</b><div class="small muted" id="fresh"></div></div>
      <button class="btn sm" id="sync" title="Frissítés" aria-label="Frissítés"><span>⟳</span></button></div></aside>
    <div class="sync-pill" id="syncpill" hidden><span class="spin">⟳</span> Frissítés…</div>
    <div class="more-sheet" id="sheet" hidden>${Object.keys(VIEWS).filter((k) => !PRIMARY.includes(k) && !HIDDEN.includes(k)).map((k) => link(k)).join("")}
      <button class="sheet-sync" data-sync><span class="ic">⟳</span>Frissítés</button>${bugBtn}</div>
    <main class="main" id="view"></main></div>`;
  document.querySelectorAll(".grp-h").forEach((b) => (b.onclick = () => {
    const g = b.parentElement, open = !g.classList.contains("open"), closed = closedGroups();
    g.classList.toggle("open", open); b.setAttribute("aria-expanded", open);
    open ? closed.delete(g.dataset.g) : closed.add(g.dataset.g);
    try { localStorage.setItem(GROUP_KEY, JSON.stringify([...closed])); } catch {}
  }));
  const sheet = document.getElementById("sheet"), more = document.getElementById("more");
  const setSheet = (open) => { sheet.hidden = !open; more.setAttribute("aria-expanded", open); };
  more.onclick = (e) => { e.stopPropagation(); setSheet(sheet.hidden); };
  sheet.onclick = () => setSheet(false);
  document.addEventListener("click", (e) => { if (!sheet.hidden && !sheet.contains(e.target)) setSheet(false); });
  document.querySelectorAll("#sync, [data-sync]").forEach((b) => (b.onclick = refresh));
  document.querySelectorAll("[data-bug]").forEach((b) => (b.onclick = () => openBugReport()));
  setStatus();
  show();
}

// ---------- frissítés ----------
// Kézzel, a gombbal: a szerver elavultnak jelöli a tárolt KRÉTA-adatot (legfeljebb 30 mp-enként),
// utána az áttekintés és az aktuális oldal újratöltődik. A teszt fióknál csak újrarajzol.
let syncing = false, nextAt = 0, syncedAt = Date.now();
const secs = () => Math.max(1, Math.ceil((nextAt - Date.now()) / 1000));

async function refresh() {
  if (syncing) return;
  if (Date.now() < nextAt) return toast(`Túl gyakran frissítenél, ${secs()} mp múlva lehet újra`);
  syncing = true; setStatus();
  try {
    const r = await post("/api/t/refresh");
    nextAt = Date.now() + (r.wait || 0) * 1000;
    await loadOverview();
    await rerender();
    syncedAt = Date.now();
    toast("Frissítve");
  } catch (e) {
    if (e.status === 429) nextAt = Date.now() + (parseInt(/(\d+) mp/.exec(e.message)?.[1], 10) || 30) * 1000;
    toast(e.message);
  }
  syncing = false; setStatus();
}

// az aktuális oldal újrarajzolása töltőképernyő nélkül, a görgetés marad
async function rerender() {
  const view = document.getElementById("view");
  if (!view) return;
  const y = scrollY;
  try {
    const m = await VIEWS[current][2]();
    await m.render(view, arg);
  } catch (e) {
    viewError(view, e);
  }
  scrollTo(0, y);
}

// ha egy oldal nem jelenik meg: a hiba szövegével kitöltött bejelentés egy gombnyomásra
function viewError(view, e) {
  view.innerHTML = `<div class="card empty">Hiba a megjelenítésben: ${esc(e.message)}${feedbackOn() ? `<div style="margin-top:12px"><button class="btn sm" id="viewbug">🐞 Hiba bejelentése</button></div>` : ""}</div>`;
  document.getElementById("viewbug")?.addEventListener("click", () => openBugReport(`A(z) ${VIEWS[current][0]} oldal nem jelenik meg: ${e.message}`));
  console.error(e);
}

function setStatus() {
  const el = document.getElementById("fresh"), btn = document.getElementById("sync"), pill = document.getElementById("syncpill");
  if (!el) return;
  const wait = Date.now() < nextAt, t = new Date(syncedAt);
  el.textContent = syncing ? "Frissítés…" : `${S.ov.demo ? "teszt fiók" : "KRÉTA"} · frissítve ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
  btn.disabled = syncing || wait;
  btn.classList.toggle("spin", syncing);
  btn.title = syncing ? "Frissítés…" : wait ? `Frissítés ${secs()} mp múlva lehet újra` : "Frissítés";
  pill.hidden = !syncing;
}
setInterval(() => !document.hidden && setStatus(), 1000);

async function show() {
  const [, , loader] = VIEWS[current], navKey = NAV_OF[current] || current;
  document.querySelectorAll(".nav a, .more-sheet a, .side-nav a").forEach((a) => a.classList.toggle("on", a.dataset.v === navKey));
  document.querySelector(`.side-nav .grp-b a[data-v="${navKey}"]`)?.closest(".grp")?.classList.add("open");
  document.querySelectorAll(".side-nav .grp").forEach((g) => g.querySelector(".grp-h").setAttribute("aria-expanded", g.classList.contains("open")));
  document.getElementById("more")?.classList.toggle("on", !PRIMARY.includes(navKey));
  const view = document.getElementById("view");
  if (!view) return;
  view.innerHTML = `<div class="grid g3">${"<div class='skeleton'></div>".repeat(3)}</div>`;
  try {
    const m = await loader();
    await m.render(view, arg);
  } catch (e) {
    viewError(view, e);
  }
}

window.addEventListener("hashchange", () => {
  const [h, a] = parse();
  if (VIEWS[h] && document.getElementById("view")) { current = h; arg = a; window.scrollTo(0, 0); show(); }
});
window.addEventListener("kp:auth", () => {
  if (!document.querySelector(".login-wrap")) {
    toast("Lejárt a belépés, jelentkezz be újra");
    setTimeout(() => renderLogin(app, boot), 600);
  }
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => S.prefs.theme === "auto" && applyPrefs());

boot();
