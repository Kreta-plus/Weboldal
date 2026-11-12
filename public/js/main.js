import { get, post } from "./api.js";
import * as St from "./state.js";
import { S, loadPrefs, loadSite, loadBundle, applyPrefs, shownName, freshest, LABELS } from "./state.js";
import { esc, ago, toast, linkify, fmtWhen, fmtRange, fmtLeft } from "./util.js";
import { renderLogin } from "./views/login.js";
import { openBugReport } from "./bugreport.js";
import { pageIn, pageOut } from "./transition.js";

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
  contact: ["Kapcsolatok", "🤝", () => import("./views/contact.js")],
  dev: ["Fejlesztő", "🧑‍💻", () => import("./views/dev.js")], // csak fejlesztői fióknak látszik
};
const shown = (k) => k !== "dev" || !!S.user?.admin;

// asztali oldalsáv: csoportok, lenyitható menüként; a Kezdőlap felül, a FOOT oldalai (Nevek, Beállítások, Kapcsolatok) alul külön
const GROUPS = [
  ["study", "Tanulmányok", ["grades", "stats", "absences", "notes"]],
  ["daily", "Napi teendők", ["timetable", "homework", "planner", "pack"]],
];
const FOOT = ["names", "settings", "contact"];
const GROUP_KEY = "kp_nav_closed";
const closedGroups = () => { try { return new Set(JSON.parse(localStorage.getItem(GROUP_KEY) || "[]")); } catch { return new Set(); } };

const app = document.getElementById("app");
let current = null;

async function boot() {
  let me;
  try { me = await get("/api/auth/me"); } catch { return showMsg("Nem érem el a szervert."); }
  await loadSite();
  if (!me.loggedIn) return renderLogin(app, boot);
  S.user = me.user;
  if (S.site.maintenance && !S.user.admin) return showMaintenance(S.site.maintenanceText);
  await loadPrefs();
  loaded = false;
  shell();
  // előbb a tárolt adat (gyorsan kint van valami), utána rögtön friss a KRÉTA-ból, ha az elsőből nem az jött
  const r = await refresh(false);
  if (r && !r.refreshed) await refresh(true, { auto: true });
}

function showMsg(t) { app.innerHTML = `<div class="login-wrap"><div class="card empty">${esc(t)}</div></div>`; }

// karbantartás: a fejlesztőkön kívül mindenki ezt látja; kiírja, meddig tart, és ha vége, magától visszatölt
let maintTimer = null;
function showMaintenance(text) {
  stopAuto();
  const s = S.site, when = fmtRange(s.maintenanceFrom, s.maintenanceUntil);
  app.innerHTML = `<div class="login-wrap"><div class="card login maint"><img class="logo" src="/img/logo.svg" alt="">
    <h1>Karbantartás</h1><p>${esc(text)}</p>${when ? `<div class="maint-when">🕒 ${esc(when)}</div>` : ""}<div class="small muted" id="mleft"></div>
    <button class="btn primary" id="mretry">Újrapróbálom</button></div></div>`;
  document.getElementById("mretry").onclick = () => location.reload();
  const left = () => {
    const el = document.getElementById("mleft"), u = S.site.maintenanceUntil;
    if (el) el.textContent = u ? `Hátra van még: ${fmtLeft(u - Date.now() / 1000)}` : "";
  };
  left();
  clearInterval(maintTimer);
  maintTimer = setInterval(async () => { // félpercenként: ha közben befejeződött, visszajön az oldal
    await loadSite();
    if (!S.site.maintenance) { clearInterval(maintTimer); location.reload(); } else left();
  }, 30000);
}
window.addEventListener("kp:maintenance", async (e) => {
  if (S.user?.admin) return;
  await loadSite();
  showMaintenance(e.detail);
});

// értesítések a tartalom fölött: közelgő karbantartás, fejlesztőnek a futó karbantartás, közlemény.
// Bezárás után az adott szöveg nem jön elő újra (ha a szöveg változik, igen).
const CLOSED_KEY = "kp_notices_closed";
const closedNotices = () => { try { return JSON.parse(localStorage.getItem(CLOSED_KEY) || "[]"); } catch { return []; } };
function notices() {
  const s = S.site, out = [];
  if (s.maintenanceUpcoming) out.push({ lvl: "warn", ic: "🔧", text: `Karbantartás lesz: ${fmtRange(s.maintenanceFrom, s.maintenanceUntil)}. Ez idő alatt az oldal nem érhető el.` });
  if (s.maintenance && S.user?.admin) out.push({ lvl: "danger", ic: "🔧", text: `Karbantartás folyamatban, a diákok most nem érik el az oldalt${s.maintenanceUntil ? ` (várható vége: ${fmtWhen(s.maintenanceUntil)})` : ""}.` });
  if (s.announcement) out.push({ lvl: s.announcementLevel || "info", ic: { info: "📢", warn: "⚠️", danger: "⛔" }[s.announcementLevel] || "📢", text: s.announcement });
  // e-mailes belépés: a KRÉTA-token csak annak a böngészőnek a sütijében van, ahol a KRÉTA-ban beléptél
  if (S.user?.needsLogin) out.push({ lvl: "warn", ic: "🔌", text: "Ezen az eszközön e-mail címmel léptél be, ezért nincs KRÉTA-kapcsolat: a legutóbb letöltött adatokat látod.",
    action: ["Belépés a KRÉTA-ban", () => { stopAuto(); renderLogin(app, boot, { back: boot }); }] });
  return out;
}
function renderNotices() {
  const el = document.getElementById("notices");
  if (!el) return;
  const closed = closedNotices(), list = notices().filter((n) => !closed.includes(n.text));
  el.innerHTML = list.map((n, i) => `<div class="announce ${n.lvl}"><span class="announce-ic" aria-hidden="true">${n.ic}</span><div class="grow">${linkify(n.text)}${n.action ? `<div class="announce-act"><button class="btn sm primary" data-act="${i}">${esc(n.action[0])}</button></div>` : ""}</div><button class="btn sm" data-i="${i}" aria-label="Értesítés bezárása">✕</button></div>`).join("");
  el.querySelectorAll("[data-act]").forEach((b) => (b.onclick = () => list[b.dataset.act].action[1]()));
  el.querySelectorAll("[data-i]").forEach((b) => (b.onclick = () => {
    try { localStorage.setItem(CLOSED_KEY, JSON.stringify([...closedNotices(), list[b.dataset.i].text].slice(-30))); } catch {}
    renderNotices();
  }));
}
window.addEventListener("kp:site", renderNotices);

function shell() {
  const hash = location.hash.slice(1);
  current = VIEWS[hash] && shown(hash) ? hash : S.prefs.startView || "dashboard";
  const bugBtn = S.site.feedbackEnabled === false ? "" : `<button class="bug-btn" data-bug><span class="ic">📣</span>Hiba / ötlet</button>`;
  const link = (k, cls = "") => { const [l, ic] = VIEWS[k]; return `<a data-v="${k}" href="#${k}" class="${cls}"><span class="ic">${ic}</span>${l}</a>`; };
  app.innerHTML = `<div class="shell"><aside class="side"><div class="brand"><img src="/img/logo.svg" alt="">ZsírKréta</div>
    <nav class="side-nav" aria-label="Menü">${link("dashboard")}
      ${GROUPS.map(([id, title, keys]) => `<div class="grp ${closedGroups().has(id) ? "" : "open"}" data-g="${id}">
        <button class="grp-h" aria-expanded="${!closedGroups().has(id)}"><span>${title}</span><span class="chev" aria-hidden="true">›</span></button>
        <div class="grp-b">${keys.map((k) => link(k)).join("")}</div></div>`).join("")}
      <div class="side-foot">${[...FOOT, "dev"].filter(shown).map((k) => link(k)).join("")}${bugBtn}</div></nav>
    <nav class="nav">${Object.keys(VIEWS).filter(shown).map((k) => link(k, PRIMARY.includes(k) ? "" : "sec")).join("")}
      <button class="more-btn" id="more" aria-expanded="false"><span class="ic">⋯</span>Továbbiak</button></nav>
    <div class="me"><div class="avatar">${esc(S.prefs.emoji || "🎓")}</div><div class="grow"><b>${esc(shownName())}</b><div class="small muted" id="fresh"></div></div>
      <button class="btn sm" id="sync" title="Frissítés"><span>⟳</span></button></div></aside>
    <div class="sync-pill" id="syncpill" hidden><span class="spin">⟳</span> Frissítés…</div>
    <div class="more-sheet" id="sheet" hidden>${Object.keys(VIEWS).filter((k) => !PRIMARY.includes(k) && shown(k)).map((k) => link(k)).join("")}${bugBtn}</div>
    <main class="main"><div class="notices" id="notices"></div><div id="view"></div></main></div>`;
  renderNotices();
  document.getElementById("sync").onclick = () => refresh(true);
  document.querySelectorAll("[data-bug]").forEach((b) => (b.onclick = () => openBugReport()));
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
  show("enter");
}

// Oldalváltás iránya a látható menü sorrendje szerint (telefonon alsó sáv + Továbbiak, asztalon az oldalsáv).
const ORDER_SIDE = ["dashboard", ...GROUPS.flatMap(([, , keys]) => keys), ...FOOT, "dev"];
const ORDER_PHONE = [...PRIMARY, ...Object.keys(VIEWS).filter((k) => !PRIMARY.includes(k))];
function navDir(from, to) {
  const nav = document.querySelector(".nav");
  const order = nav && getComputedStyle(nav).display !== "none" ? ORDER_PHONE : ORDER_SIDE;
  return order.indexOf(to) >= order.indexOf(from) ? 1 : -1;
}
let navSeq = 0, shownView = null;
const entered = new WeakSet(); // nézetek, amelyek már beúsztak egyszer (az adatbetöltés utáni újrarajzolás nem animál újra)

// mode: "nav" oldalváltás (ki- és beúszás), "enter" első megjelenés (csak beúszás), üres: csendes újrarajzolás
async function show(mode) {
  const seq = ++navSeq, [, , loader] = VIEWS[current];
  document.querySelectorAll(".nav a, .more-sheet a, .side-nav a").forEach((a) => a.classList.toggle("on", a.dataset.v === current));
  // az aktuális oldalt tartalmazó csoport mindig nyitva van
  document.querySelector(`.side-nav .grp-b a[data-v="${current}"]`)?.closest(".grp")?.classList.add("open");
  document.querySelectorAll(".side-nav .grp").forEach((g) => g.querySelector(".grp-h").setAttribute("aria-expanded", g.classList.contains("open")));
  document.getElementById("more")?.classList.toggle("on", !PRIMARY.includes(current));
  const view = document.getElementById("view");
  if (!view) return;
  const d = navDir(shownView, current), animate = mode === "nav" || (mode === "enter" && !entered.has(view));
  shownView = current;
  const mod = loader(); // a kilépő animáció alatt már töltődik
  mod.catch(() => {}); // a hibát lent kezeljük, ne jelenjen meg kezeletlenként
  if (mode === "nav") await pageOut(view, d);
  if (seq !== navSeq) return; // közben újabb oldalváltás jött, az viszi tovább
  view.innerHTML = `<div class="grid g3">${"<div class='skeleton'></div>".repeat(3)}</div>`;
  let shown = false;
  const reveal = () => { if (!shown) { shown = true; entered.add(view); pageIn(view, d, animate); } };
  try {
    const m = await mod;
    if (seq !== navSeq) return;
    const done = m.render(view); // a szinkron rész (fejléc, váz) már kint van, így rögtön beúszhat; a lassabb adat a helyére kerül
    reveal();
    await done;
  } catch (e) {
    if (seq !== navSeq) return; // egy régebbi oldal hibája ne írja felül az újat
    view.innerHTML = `<div class="card empty">Hiba a megjelenítésben: ${esc(e.message)}<div style="margin-top:12px"><button class="btn sm" id="viewbug">🐞 Hiba bejelentése</button></div></div>`;
    console.error(e);
    document.getElementById("viewbug").onclick = () => openBugReport(`A(z) ${VIEWS[current][0]} oldal nem jelenik meg: ${e.message}`);
    reveal();
  }
  setStatus();
}

// ---------- frissítés ----------
// Percenként automatikusan (csak ha látszik az oldal), a gombbal kézzel is, de a kettő együtt is legfeljebb percenként:
// a szerver megmondja, hány mp múlva lehet újra (wait), és 429 után mennyi a szünet (cooldown).
const AUTO_MS = 60000;
let loaded = false, syncing = false, nextAt = 0, autoAt = 0, autoTimer = null, note = "", lastErrs = "", pendingRender = false;
const names = (keys) => keys.map((k) => LABELS[k] || k).join(", ");
const secs = (t) => Math.max(1, Math.ceil((t - Date.now()) / 1000));

async function refresh(force, { auto = false } = {}) {
  if (syncing) return null;
  if (force && Date.now() < nextAt) {
    if (!auto) toast(`Túl gyakran frissítenél, ${secs(nextAt)} mp múlva lehet újra`);
    return null;
  }
  syncing = true; setStatus();
  let r = null;
  try {
    r = await loadBundle(force);
    loadSite().then(renderNotices); // a közlemény és a karbantartás változása is megjelenik a következő frissítéskor
    if (S.user.needsLogin !== !r.kreta) { S.user.needsLogin = !r.kreta; renderNotices(); }
    note = !r.kreta ? "nincs KRÉTA-kapcsolat, tárolt adat" : r.cooldown ? "a KRÉTA lassít, kicsit várunk" : r.stale ? "a KRÉTA nem elérhető, régebbi adat" : "";
    nextAt = Date.now() + (r.wait || 0) * 1000;
    const errs = Object.keys(S.errors), errKey = errs.join();
    if (errs.length && r.kreta && (!auto || errKey !== lastErrs)) toast(`Nem minden adat töltődött be (${names(errs)})`);
    lastErrs = errKey;
    if (r.changed.length) toast(`Frissítve, új adat: ${names(r.changed)}`);
    else if (!auto && r.throttled) toast(`Túl gyakran frissítenél, ${secs(nextAt)} mp múlva lehet újra`);
    else if (!auto && force && !errs.length) toast("Frissítve, nincs új adat");
    if (force || r.changed.includes("orarend")) S.weekCache = {};
  } catch (e) {
    note = e.code === "net" ? "nincs kapcsolat a szerverrel" : "a frissítés nem sikerült";
    if (e.code === "relogin" || e.code === "auth") { syncing = false; stopAuto(); return null; }
    if (!auto) toast(e.message);
  }
  syncing = false;
  if (!document.getElementById("view")) return r;
  scheduleAuto(r);
  if (!loaded) { loaded = true; show("enter"); }
  else if (r?.changed.length) rerender();
  setStatus();
  return r;
}

function scheduleAuto(r) {
  clearTimeout(autoTimer);
  const ms = Math.max(AUTO_MS, (r?.wait || 0) * 1000, (r?.cooldown || 0) * 1000) + 500 + Math.random() * 1500;
  autoAt = Date.now() + ms;
  autoTimer = setTimeout(autoTick, ms);
}
function stopAuto() { clearTimeout(autoTimer); autoTimer = null; autoAt = 0; }
function autoTick() {
  autoTimer = null;
  if (!document.getElementById("view")) return stopAuto();
  if (document.hidden || !navigator.onLine) return; // háttérben nem kérdezünk; visszatéréskor pótoljuk
  refresh(true, { auto: true });
}
const catchUp = () => { if (!document.hidden && autoAt && !autoTimer && !syncing) refresh(true, { auto: true }); };
document.addEventListener("visibilitychange", catchUp);
window.addEventListener("online", catchUp);

// Új adatnál az aktuális oldal csendben újrarajzolódik (töltőképernyő nélkül, a görgetés marad).
// Ha épp írsz valamit az oldalon, megvárja, amíg kilépsz a mezőből.
async function rerender() {
  const view = document.getElementById("view");
  if (!view) return;
  const a = document.activeElement;
  if (a && view.contains(a) && a.matches("input, textarea, select, [contenteditable]")) { pendingRender = true; return; }
  pendingRender = false;
  const y = scrollY;
  try {
    const m = await VIEWS[current][2]();
    await (m.update ? m.update(view) : m.render(view));
  } catch (e) { console.error(e); }
  scrollTo(0, y);
}
document.addEventListener("focusout", () => setTimeout(() => pendingRender && rerender(), 0));

function setStatus() {
  const el = document.getElementById("fresh"), btn = document.getElementById("sync"), pill = document.getElementById("syncpill");
  if (!el) return;
  const f = freshest(), wait = Date.now() < nextAt;
  el.textContent = syncing ? "Frissítés…" : [note || (f ? `frissítve ${ago(f)}` : ""), autoAt > Date.now() ? `újra ${secs(autoAt)} mp múlva` : ""].filter(Boolean).join(" · ");
  btn.disabled = syncing || wait;
  btn.classList.toggle("spin", syncing);
  btn.title = syncing ? "Frissítés…" : wait ? `Frissítés ${secs(nextAt)} mp múlva lehet újra` : "Frissítés";
  pill.hidden = !syncing;
}
setInterval(() => !document.hidden && setStatus(), 1000);

window.addEventListener("hashchange", () => {
  const h = location.hash.slice(1);
  if (VIEWS[h] && shown(h) && document.getElementById("view")) { current = h; show("nav"); }
});
window.addEventListener("kp:auth", () => {
  stopAuto();
  if (!document.querySelector(".login-wrap")) {
    toast("Lejárt a belépés, jelentkezz be újra");
    setTimeout(() => renderLogin(app, boot), 600);
  }
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => S.prefs.theme === "auto" && applyPrefs());

boot();
