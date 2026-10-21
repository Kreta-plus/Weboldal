import { S as ST, subjName, teacherName, absences } from "../state.js";
import { esc, fmtFull } from "../util.js";
import { bars } from "../charts.js";

let flt = "all";

export function render(root) {
  const all = absences();
  const list = all.filter((a) => flt === "all" || (flt === "bad" ? !a.ok && !a.na : flt === "ok" ? a.ok : a.late > 0));
  const bySub = {};
  all.forEach((a) => (bySub[a.subject] = (bySub[a.subject] || 0) + 1));
  const top = Object.entries(bySub).sort((x, y) => y[1] - x[1]).map(([k, v]) => ({ label: subjName(k), value: v }));
  const days = new Set(all.map((a) => a.date.toDateString())).size;
  root.innerHTML = `<div class="topbar"><div><h1>Hiányzások</h1><div class="sub">${all.length} óra · ${days} nap · ${all.filter((a) => !a.ok && !a.na).length} igazolatlan</div></div>
    <div class="seg" id="f">${[["all", "Mind"], ["bad", "Igazolatlan"], ["ok", "Igazolt"], ["late", "Késés"]].map(([k, l]) => `<button data-k="${k}" class="${flt === k ? "on" : ""}">${l}</button>`).join("")}</div></div>
    <div class="grid g3"><div class="span2 list">${list.map((a) => `<div class="item"><span class="chip ${a.ok ? "ok" : a.na ? "" : "bad"}">${a.ok ? "igazolt" : a.na ? "nem igazolandó" : "igazolatlan"}</span>
      <div class="grow"><b>${esc(subjName(a.subject))}${a.nr ? ` · ${a.nr}. óra` : ""}</b><div class="small muted">${esc(a.kind.replace(/_/g, " "))}${a.late ? ` · ${a.late} perc késés` : ""}${a.type ? ` · ${esc(a.type)}` : ""} · ${esc(teacherName(a.teacher))}</div></div>
      <span class="small muted">${fmtFull(a.date)}</span></div>`).join("") || `<div class="card empty">Nincs találat</div>`}</div>
      <div class="card"><h3>Tantárgyanként</h3>${bars({ horizontal: true, items: top })}</div></div>`;
  root.querySelectorAll("#f button").forEach((b) => (b.onclick = () => { flt = b.dataset.k; render(root); }));
}
