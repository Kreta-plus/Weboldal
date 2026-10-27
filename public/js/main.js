import { get, post } from "./api.js";
import * as St from "./state.js";
import { S, loadPrefs, loadBundle, applyPrefs, shownName, freshest } from "./state.js";
import { esc, ago, toast } from "./util.js";
import { renderLogin } from "./views/login.js";

const PRIMARY = ["dashboard", "grades", "timetable", "homework"]; // telefonon az alsó sávban; a többi a „Továbbiak” listában
const VIEWS = {
  dashboard: ["Kezdőlap", "🏠", () => import("./views/dashboard.js")],
  grades: ["Jegyek", "📘", () => import("./views/grades.js")],
  stats: ["Statisztika", "📊", () => import("./views/stats.js")],
  timetable: ["Órarend", "🗓️", () => import("./views/timetable.js")],
  homework: ["Házi", "📝", () => import("./views/homework.js")],
  absences: ["Hiányzás", "⏱️", () => import("./views/absences.js")],
  planner: ["Tervező", "➕", () => import("./views/planner.js")],
  pack: ["Táska", "🎒", () => import("./views/pack.js")],
  notes: ["Feljegyzések", "💬", () => import("./views/notes.js")],
  names: ["Nevek", "🏷️", () => import("./views/names.js")],
  settings: ["Beállítások", "⚙️", () => import("./views/settings.js")],
};

const app = document.getElementById("app");
let current = null;

async function boot() {
  let me;
  try { me = await get("/api/auth/me"); } catch { return showMsg("Nem érem el a szervert."); }
  if (!me.loggedIn) return renderLogin(app, boot);
  S.user = me.user;
  await loadPrefs();
  shell();
  await refresh(false);
}

function showMsg(t) { app.innerHTML = `<div class="login-wrap"><div class="card empty">${esc(t)}</div></div>`; }

function shell() {
  const hash = location.hash.slice(1);
  current = VIEWS[hash] ? hash : S.prefs.startView || "dashboard";
  const link = (k, cls = "") => { const [l, ic] = VIEWS[k]; return `<a data-v="${k}" href="#${k}" class="${cls}"><span class="ic">${ic}</span>${l}</a>`; };
  app.innerHTML = `<div class="shell"><aside class="side"><div class="brand"><i>K+</i>KRÉTA Plusz</div>
    <nav class="nav">${Object.keys(VIEWS).map((k) => link(k, PRIMARY.includes(k) ? "" : "sec")).join("")}
      <button class="more-btn" id="more" aria-expanded="false"><span class="ic">⋯</span>Továbbiak</button></nav>
    <div class="me"><div class="avatar">${esc(S.prefs.emoji || "🎓")}</div><div class="grow"><b>${esc(shownName())}</b><div class="small muted" id="fresh"></div></div>
      <button class="btn sm" id="sync" title="Frissítés">⟳</button></div></aside>
    <div class="more-sheet" id="sheet" hidden>${Object.keys(VIEWS).filter((k) => !PRIMARY.includes(k)).map((k) => link(k)).join("")}</div>
    <main class="main" id="view"></main></div>`;
  document.getElementById("sync").onclick = () => refresh(true);
  const sheet = document.getElementById("sheet"), more = document.getElementById("more");
  const setSheet = (open) => { sheet.hidden = !open; more.setAttribute("aria-expanded", open); };
  more.onclick = (e) => { e.stopPropagation(); setSheet(sheet.hidden); };
  sheet.onclick = () => setSheet(false);
  document.addEventListener("click", (e) => { if (!sheet.hidden && !sheet.contains(e.target)) setSheet(false); });
  show();
}

async function show() {
  const [, , loader] = VIEWS[current];
  document.querySelectorAll(".nav a, .more-sheet a").forEach((a) => a.classList.toggle("on", a.dataset.v === current));
  document.getElementById("more")?.classList.toggle("on", !PRIMARY.includes(current));
  const view = document.getElementById("view");
  if (!view) return;
  view.innerHTML = `<div class="grid g3">${"<div class='skeleton'></div>".repeat(3)}</div>`;
  try {
    const m = await loader();
    await m.render(view);
  } catch (e) {
    view.innerHTML = `<div class="card empty">Hiba a megjelenítésben: ${esc(e.message)}</div>`;
    console.error(e);
  }
  const f = freshest();
  const el = document.getElementById("fresh");
  if (el) el.textContent = f ? `frissítve ${ago(f)}` : "";
}

async function refresh(force) {
  const btn = document.getElementById("sync");
  if (btn) btn.disabled = true;
  try {
    S.weekCache = force ? {} : S.weekCache;
    await loadBundle(force);
    const errs = Object.keys(S.errors);
    if (errs.length) toast(`Nem minden adat töltődött be (${errs.join(", ")})`);
    else if (force) toast("Frissítve");
  } catch (e) {
    if (e.code !== "relogin" && e.code !== "auth") toast(e.message);
  }
  if (btn) btn.disabled = false;
  if (document.getElementById("view")) show();
}

window.addEventListener("hashchange", () => {
  const h = location.hash.slice(1);
  if (VIEWS[h] && document.getElementById("view")) { current = h; show(); }
});
window.addEventListener("kp:auth", () => {
  if (!document.querySelector(".login-wrap")) {
    toast("Lejárt a belépés, jelentkezz be újra");
    setTimeout(() => renderLogin(app, boot), 600);
  }
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => S.prefs.theme === "auto" && applyPrefs());

boot();
