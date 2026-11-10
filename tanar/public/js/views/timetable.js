import { group, lessonsBetween } from "../state.js";
import { esc, mondayOf, addDays, iso, sameDay, fmtDate, DAYS, subjColor } from "../util.js";

let monday = mondayOf(new Date());

export async function render(root) {
  root.innerHTML = `<div class="topbar"><div><h1>Órarend</h1><div class="sub">${fmtDate(monday)} – ${fmtDate(addDays(monday, 4))}</div></div>
    <div class="row"><button class="btn" id="prev" aria-label="Előző hét">←</button><button class="btn" id="now">Ma</button><button class="btn" id="next" aria-label="Következő hét">→</button></div></div>
    <div class="tt">${DAYS.slice(0, 5).map(() => `<div class="skeleton" style="min-height:240px"></div>`).join("")}</div>`;
  const go = (m) => { monday = m; render(root); };
  root.querySelector("#prev").onclick = () => go(addDays(monday, -7));
  root.querySelector("#next").onclick = () => go(addDays(monday, 7));
  root.querySelector("#now").onclick = () => go(mondayOf(new Date()));
  const ls = await lessonsBetween(monday, addDays(monday, 4));
  const now = new Date();
  root.querySelector(".tt").innerHTML = [0, 1, 2, 3, 4].map((i) => addDays(monday, i)).map((d, i) => {
    const dl = ls.filter((l) => l.date === iso(d));
    return `<div class="day ${sameDay(d, now) ? "today" : ""}"><h4><span>${DAYS[i]}</span><span>${fmtDate(d)}</span></h4>
      ${dl.map((l) => {
        const st = new Date(`${l.date}T${l.start}`), en = new Date(`${l.date}T${l.end}`), g = group(l.groupId);
        return `<a class="les les-link ${st <= now && now < en ? "now" : ""}" href="#lesson/${encodeURIComponent(l.id)}" style="--c:${subjColor(l.subject)}" title="Az óra megnyitása: naplózás, mulasztás, jegyek">
          <b>${l.nr}. ${esc(g?.className || "")} ${esc(l.subject)}</b>
          <span class="t">${l.start}–${l.end} · ${esc(l.room)}</span>
          ${l.topic ? `<span class="t">📒 ${esc(l.topic)}</span>` : ""}
          <span class="row" style="gap:4px;flex-wrap:wrap">${l.cancelled ? `<span class="chip">elmaradt</span>` : l.recorded ? `<span class="chip ok">naplózva</span>` : st <= now ? `<span class="chip warn">beírandó</span>` : ""}${l.testId ? `<span class="chip warn">számonkérés</span>` : ""}${l.hwCount ? `<span class="chip">házi</span>` : ""}</span>
          <span class="les-go small">Megnyitás ›</span>
        </a>`;
      }).join("") || `<div class="muted small" style="padding:8px">Nincs órád</div>`}</div>`;
  }).join("");
}
