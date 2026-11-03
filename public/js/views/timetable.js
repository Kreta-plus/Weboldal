import { S as ST, subjName, teacherName, loadWeek, fillTestLessons } from "../state.js";
import { esc, normLessons, mondayOf, addDays, iso, sameDay, fmtTime, fmtDate, DAYS, subjColor, toast } from "../util.js";

let monday = mondayOf(new Date());
let gen = 0, timer = null, last = "";

export async function render(root, { refresh } = {}) {
  const my = ++gen;
  stop();
  root.innerHTML = `<div class="topbar"><div><h1>Órarend</h1><div class="sub">${fmtDate(monday)} – ${fmtDate(addDays(monday, 6))}</div></div>
    <div class="row"><button class="btn" id="prev">←</button><button class="btn" id="now">Ma</button><button class="btn" id="next">→</button></div></div>
    <div class="tt" data-gen="${my}">${DAYS.slice(0, 5).map(() => `<div class="skeleton" style="min-height:240px"></div>`).join("")}</div>`;
  bind(root);
  let res;
  try { res = await loadWeek(monday, refresh); } catch (e) { root.querySelector(".tt").outerHTML = `<div class="card empty">${esc(e.message)}</div>`; return; }
  if (my !== gen) return;
  root.querySelector(".tt").innerHTML = last = days(res);
  if (res.meta?.stale) toast("Régebbi adatot mutatok, a KRÉTA most nem elérhető");
  schedule(root, my);
}

function days(res) {
  const ls = fillTestLessons(normLessons(res.data), monday);
  const now = new Date();
  return [0, 1, 2, 3, 4].map((i) => addDays(monday, i)).map((d, i) => {
    const dl = ls.filter((l) => sameDay(l.start, d));
    return `<div class="day ${sameDay(d, now) ? "today" : ""}"><h4><span>${DAYS[i]}</span><span>${fmtDate(d)}</span></h4>
      ${dl.map((l) => `<div class="les ${l.off ? "off" : ""} ${l.sub ? "sub" : ""} ${l.start <= now && now < l.end ? "now" : ""}" style="--c:${subjColor(l.subject)}" title="${esc(l.topic)}">
        <b>${l.nr ? l.nr + ". " : ""}${esc(subjName(l.subject))}</b>
        <span class="t">${fmtTime(l.start)}–${fmtTime(l.end)} · ${esc(l.room || "—")}</span>
        <span class="t">${esc(teacherName(l.sub || l.teacher))}${l.sub ? " · helyettesítés" : ""}${l.off ? " · elmarad" : ""}</span>
        ${l.fake ? `<span class="chip">teszt óra</span>` : ""}${l.test || l.hw ? `<span class="row" style="gap:4px">${l.test ? `<span class="chip warn">dolgozat</span>` : ""}${l.hw ? `<span class="chip">házi</span>` : ""}</span>` : ""}
      </div>`).join("") || `<div class="muted small" style="padding:8px">Nincs óra</div>`}</div>`;
  }).join("");
}

// Csendes frissítés percenként: nincs töltőképernyő, csak a változás kerül ki.
// A szerver a saját gyorsítótárából válaszol, a KRÉTA-t továbbra is csak ritkán hívja.
function schedule(root, my) {
  stop();
  const ms = 60000 - (Date.now() % 60000) + 500 + Math.random() * 2000; // a perc elején, hogy a „most” óra időben váltson
  timer = setTimeout(() => tick(root, my), ms);
}

async function tick(root, my) {
  const tt = root.querySelector(`.tt[data-gen="${my}"]`);
  if (my !== gen || !tt || !root.isConnected) return stop(); // közben másik oldalra léptek
  if (document.hidden) return schedule(root, my); // háttérben nem kérdezünk, visszatéréskor igen
  try {
    const res = await loadWeek(monday, false, true);
    if (my !== gen) return;
    const html = days(res);
    if (html !== last) tt.innerHTML = last = html;
  } catch {} // csendben: marad, ami kint van
  schedule(root, my);
}

function stop() { clearTimeout(timer); timer = null; }

document.addEventListener("visibilitychange", () => {
  const root = document.getElementById("view");
  if (!document.hidden && timer && root) { const my = gen; stop(); tick(root, my); }
});

function bind(root) {
  const go = (m) => { monday = m; render(root); };
  root.querySelector("#prev").onclick = () => go(addDays(monday, -7));
  root.querySelector("#next").onclick = () => go(addDays(monday, 7));
  root.querySelector("#now").onclick = () => go(mondayOf(new Date()));
}
