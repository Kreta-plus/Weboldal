import { notes, teacherName } from "../state.js";
import { esc, fmtFull } from "../util.js";

export function render(root) {
  const list = notes();
  root.innerHTML = `<div class="topbar"><div><h1>Feljegyzések</h1><div class="sub">${list.length} bejegyzés a tanároktól</div></div></div>
    <div class="grid g2">${list.map((n) => `<div class="card"><h3>${esc(n.title || "Feljegyzés")}<small>${fmtFull(n.date)}</small></h3>
      <div style="white-space:pre-wrap">${esc(n.text.replace(/<[^>]+>/g, " ").trim())}</div><div class="small muted" style="margin-top:10px">${esc(teacherName(n.teacher))}${n.type ? " · " + esc(n.type) : ""}</div></div>`).join("") || `<div class="card empty">Nincs feljegyzés</div>`}</div>`;
}
