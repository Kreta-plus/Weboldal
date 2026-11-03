// Haladási napló: a hét órái, mindegyikhez az óra témája. Csak elkezdett órához írható be.
import { group, can, lessonsBetween } from "../state.js";
import { esc, mondayOf, addDays, iso, fmtDate, DAYS, day, subjColor } from "../util.js";
import { runOp, writeNote } from "../ops.js";

let monday = mondayOf(new Date());
const drafts = {}; // lecke-azonosító -> még el nem küldött szöveg, hogy újrarajzoláskor ne vesszen el

export async function render(root) {
  const ls = await lessonsBetween(monday, addDays(monday, 4));
  const now = new Date(), started = (l) => new Date(`${l.date}T${l.start}`) <= now;
  const missing = ls.filter((l) => started(l) && !l.topic).length;
  root.innerHTML = `<div class="topbar"><div><h1>Haladási napló</h1><div class="sub">${fmtDate(monday)} – ${fmtDate(addDays(monday, 4))} · ${missing ? `<b>${missing} órának hiányzik a témája</b>` : "minden megtartott óra be van írva"} ${writeNote()}</div></div>
    <div class="row"><button class="btn" id="prev" aria-label="Előző hét">←</button><button class="btn" id="now">Ma</button><button class="btn" id="next" aria-label="Következő hét">→</button></div></div>
    <div class="grid">${[0, 1, 2, 3, 4].map((i) => addDays(monday, i)).map((d, i) => {
      const dl = ls.filter((l) => l.date === iso(d));
      if (!dl.length) return "";
      return `<div class="card"><h3>${DAYS[i]}<small>${fmtDate(d)}</small></h3><div class="list">${dl.map((l) => {
        const ok = started(l), val = drafts[l.id] ?? l.topic;
        return `<div class="item jr" data-l="${esc(l.id)}"><span class="les-nr">${l.nr}.</span><span class="dot" style="background:${subjColor(l.subject)}"></span>
          <div class="grow"><b>${esc(group(l.groupId)?.name || "?")}</b> <span class="small muted">${l.start}–${l.end}</span>
            ${ok && can("lesson.topic") ? `<div class="row jr-f"><input class="input grow" maxlength="200" placeholder="Az óra témája" value="${esc(val)}" aria-label="Az óra témája">
              <button class="btn sm ${l.topic ? "" : "primary"}" data-go>${l.topic ? "Módosítás" : "Beírás"}</button></div>`
              : `<div class="small muted">${l.topic ? esc(l.topic) : ok ? "nincs téma" : "még nem volt meg"}</div>`}</div>
          ${ok ? (l.topic ? `<span class="chip ok">beírva</span>` : `<span class="chip warn">hiányzik</span>`) : `<span class="chip">később</span>`}</div>`;
      }).join("")}</div></div>`;
    }).join("") || `<div class="card empty">Ezen a héten nincs órád.</div>`}</div>`;
  const go = (m) => { monday = m; render(root); };
  root.querySelector("#prev").onclick = () => go(addDays(monday, -7));
  root.querySelector("#next").onclick = () => go(addDays(monday, 7));
  root.querySelector("#now").onclick = () => go(mondayOf(new Date()));
  root.querySelectorAll(".jr").forEach((row) => {
    const inp = row.querySelector("input"), btn = row.querySelector("[data-go]");
    if (!inp) return;
    const id = row.dataset.l, [groupId, date, nr] = id.split("|");
    inp.oninput = () => (drafts[id] = inp.value);
    inp.onkeydown = (e) => { if (e.key === "Enter") btn.click(); };
    btn.onclick = async () => {
      if (await runOp("lesson.topic", { groupId, date, nr: +nr, topic: inp.value })) { delete drafts[id]; render(root); }
    };
  });
}
