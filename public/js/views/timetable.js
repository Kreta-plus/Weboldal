import { S as ST, subjName, teacherName, loadWeek } from "../state.js";
import { esc, normLessons, mondayOf, addDays, iso, sameDay, fmtTime, fmtDate, DAYS, subjColor, toast } from "../util.js";

let monday = mondayOf(new Date());

export async function render(root, { refresh } = {}) {
  const key = iso(monday);
  root.innerHTML = `<div class="topbar"><div><h1>Órarend</h1><div class="sub">${fmtDate(monday)} – ${fmtDate(addDays(monday, 6))}</div></div>
    <div class="row"><button class="btn" id="prev">←</button><button class="btn" id="now">Ma</button><button class="btn" id="next">→</button></div></div>
    <div class="tt">${DAYS.slice(0, 5).map(() => `<div class="skeleton" style="min-height:240px"></div>`).join("")}</div>`;
  bind(root);
  let res;
  try { res = await loadWeek(monday, refresh); } catch (e) { root.querySelector(".tt").outerHTML = `<div class="card empty">${esc(e.message)}</div>`; return; }
  const ls = normLessons(res.data);
  const now = new Date();
  const days = [0, 1, 2, 3, 4].map((i) => addDays(monday, i));
  root.querySelector(".tt").innerHTML = days.map((d, i) => {
    const dl = ls.filter((l) => sameDay(l.start, d));
    return `<div class="day ${sameDay(d, now) ? "today" : ""}"><h4><span>${DAYS[i]}</span><span>${fmtDate(d)}</span></h4>
      ${dl.map((l) => `<div class="les ${l.off ? "off" : ""} ${l.sub ? "sub" : ""} ${l.start <= now && now < l.end ? "now" : ""}" style="--c:${subjColor(l.subject)}" title="${esc(l.topic)}">
        <b>${l.nr ? l.nr + ". " : ""}${esc(subjName(l.subject))}</b>
        <span class="t">${fmtTime(l.start)}–${fmtTime(l.end)} · ${esc(l.room || "—")}</span>
        <span class="t">${esc(teacherName(l.sub || l.teacher))}${l.sub ? " · helyettesítés" : ""}${l.off ? " · elmarad" : ""}</span>
        ${l.test || l.hw ? `<span class="row" style="gap:4px">${l.test ? `<span class="chip warn">dolgozat</span>` : ""}${l.hw ? `<span class="chip">házi</span>` : ""}</span>` : ""}
      </div>`).join("") || `<div class="muted small" style="padding:8px">Nincs óra</div>`}</div>`;
  }).join("");
  if (res.meta?.stale) toast("Régebbi adatot mutatok, a KRÉTA most nem elérhető");
}

function bind(root) {
  const go = (m) => { monday = m; render(root); };
  root.querySelector("#prev").onclick = () => go(addDays(monday, -7));
  root.querySelector("#next").onclick = () => go(addDays(monday, 7));
  root.querySelector("#now").onclick = () => go(mondayOf(new Date()));
}
