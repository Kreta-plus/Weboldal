import { S as ST, subjName, teacherName, homework, tests } from "../state.js";
import { esc, d0, fmtFull, relDay, subjColor } from "../util.js";

let tab = "open";
const key = () => `kp_hw_done_${ST.user?.id}`;
const doneSet = () => { try { return new Set(JSON.parse(localStorage.getItem(key()) || "[]")); } catch { return new Set(); } };

export function render(root) {
  const today = d0(new Date());
  const local = doneSet();
  const all = homework().map((h) => ({ ...h, done: h.done || local.has(h.id) }));
  const shown = tab === "open" ? all.filter((h) => !h.done && h.due >= today) : tab === "late" ? all.filter((h) => !h.done && h.due < today) : all.filter((h) => h.done);
  const ts = tests().filter((t) => t.date >= today);
  root.innerHTML = `<div class="topbar"><div><h1>Házi és számonkérés</h1><div class="sub">${all.filter((h) => !h.done && h.due >= today).length} nyitott házi · ${ts.length} számonkérés</div></div>
    <div class="seg" id="tabs">${[["open", "Nyitott"], ["late", "Lejárt"], ["done", "Kész"]].map(([k, l]) => `<button data-t="${k}" class="${tab === k ? "on" : ""}">${l}</button>`).join("")}</div></div>
    <div class="grid g3"><div class="span2 list">${shown.map((h) => `
      <div class="card"><div class="row"><input type="checkbox" class="chk" data-id="${esc(h.id)}" ${h.done ? "checked" : ""} style="width:20px;height:20px;accent-color:var(--accent)">
        <span class="dot" style="background:${subjColor(h.subject)}"></span><b class="grow">${esc(subjName(h.subject))}</b>
        <span class="chip ${h.due < today ? "bad" : h.due - today < 864e5 * 1.5 ? "warn" : ""}">${relDay(h.due)}</span></div>
        <div style="margin:10px 0 6px;white-space:pre-wrap">${esc(h.text.replace(/<[^>]+>/g, " ").trim())}</div>
        <div class="small muted">${h.own ? "saját · " : esc(teacherName(h.teacher)) + " · feladva: " + fmtFull(h.given) + " · "}határidő: ${fmtFull(h.due)}</div></div>`).join("") || `<div class="card empty">Itt nincs semmi 🎉</div>`}</div>
      <div class="card"><h3>Közelgő számonkérések</h3>${ts.length ? `<div class="list">${ts.map((t) => `<div class="item"><span class="dot" style="background:${subjColor(t.subject)}"></span>
        <div class="grow"><b>${esc(subjName(t.subject))}</b><div class="small muted">${esc(t.kind || "számonkérés")}${t.topic ? " · " + esc(t.topic) : ""}</div></div><span class="chip warn">${relDay(t.date)}</span></div>`).join("")}</div>` : `<div class="empty">Nincs bejelentett számonkérés</div>`}</div></div>`;
  root.querySelectorAll("#tabs button").forEach((b) => (b.onclick = () => { tab = b.dataset.t; render(root); }));
  root.querySelectorAll(".chk").forEach((c) => (c.onchange = () => {
    const s = doneSet(); c.checked ? s.add(c.dataset.id) : s.delete(c.dataset.id);
    localStorage.setItem(key(), JSON.stringify([...s])); render(root);
  }));
}
