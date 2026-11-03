import { get } from "./api.js";
import { S, loadPrefs, loadOverview, applyPrefs, shownName } from "./state.js";
import { esc, toast } from "./util.js";
import { renderLogin } from "./views/login.js";

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
  if (!me.loggedIn) return renderLogin(app, boot);
  S.user = me.user;
  try { await Promise.all([loadPrefs(), loadOverview()]); } catch (e) { return showMsg(e.message); }
  shell();
}

function showMsg(t) { app.innerHTML = `<div class="login-wrap"><div class="card empty">${esc(t)}</div></div>`; }

function shell() {
  const [h, a] = parse();
  current = VIEWS[h] ? h : S.prefs.startView || "dashboard";
  arg = VIEWS[h] ? a : "";
  const link = (k, cls = "") => { const [l, ic] = VIEWS[k]; return `<a data-v="${k}" href="#${k}" class="${cls}"><span class="ic">${ic}</span>${l}</a>`; };
  app.innerHTML = `<div class="shell"><aside class="side"><div class="brand"><i>T<b>+</b></i><span class="brand-t">KRÉTA Plusz<small class="brand-sub">tanári</small></span></div>
    <nav class="side-nav" aria-label="Menü">${link("dashboard")}
      ${GROUPS.map(([id, title, keys]) => `<div class="grp ${closedGroups().has(id) ? "" : "open"}" data-g="${id}">
        <button class="grp-h" aria-expanded="${!closedGroups().has(id)}"><span>${title}</span><span class="chev" aria-hidden="true">›</span></button>
        <div class="grp-b">${keys.map((k) => link(k)).join("")}</div></div>`).join("")}
      <div class="side-foot">${link("log")}${link("settings")}</div></nav>
    <nav class="nav">${Object.keys(VIEWS).filter((k) => !HIDDEN.includes(k)).map((k) => link(k, PRIMARY.includes(k) ? "" : "sec")).join("")}
      <button class="more-btn" id="more" aria-expanded="false"><span class="ic">⋯</span>Továbbiak</button></nav>
    <div class="me"><div class="avatar">🧑‍🏫</div><div class="grow"><b>${esc(shownName())}</b><div class="small muted">${S.ov.demo ? "teszt fiók" : "KRÉTA"}</div></div></div></aside>
    <div class="more-sheet" id="sheet" hidden>${Object.keys(VIEWS).filter((k) => !PRIMARY.includes(k) && !HIDDEN.includes(k)).map((k) => link(k)).join("")}</div>
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
  show();
}

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
    view.innerHTML = `<div class="card empty">Hiba a megjelenítésben: ${esc(e.message)}</div>`;
    console.error(e);
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
