import { S as ST, savePrefs, allSubjects, allTeachers, shownName } from "../state.js";
import { esc } from "../util.js";

export function render(root) {
  const p = ST.prefs;
  const subj = allSubjects(), teach = allTeachers();
  const rows = (items, map, kind) => items.map((n) => `<div class="row" style="gap:10px">
    <div class="grow small muted" style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(n)}">${esc(n)}</div>
    <input class="input nm" data-k="${kind}" data-o="${esc(n)}" value="${esc(map[n] || "")}" placeholder="saját név" style="max-width:55%" maxlength="80"></div>`).join("");

  root.innerHTML = `<div class="topbar"><div><h1>Nevek</h1><div class="sub">Állítsd be, minek hívjanak, és hogy hívod a tanárokat és tantárgyakat. Csak nálad jelenik meg így.</div></div></div>
    <div class="grid g2">
      <div class="card"><h3>Rólad</h3><div class="grid" style="gap:12px">
        <label class="f">Megjelenített név<input class="input" id="dn" value="${esc(p.displayName)}" placeholder="${esc(ST.raw.tanulo?.data?.Nev || "")}" maxlength="60"></label>
        <label class="f">Becenév (ezen köszöntünk)<input class="input" id="nn" value="${esc(p.nickname)}" maxlength="40"></label>
        <label class="f">Emoji<input class="input" id="em" value="${esc(p.emoji)}" maxlength="8" style="max-width:100px"></label>
        <div class="small muted">Előnézet: „Szia, ${esc(shownName())}! ${esc(p.emoji || "")}”</div></div></div>
      <div class="card"><h3>Tanárok <small>${teach.length}</small></h3><div class="grid" style="gap:8px;max-height:480px;overflow:auto">${rows(teach, p.teacherNames || {}, "t") || `<div class="empty">Még nincs betöltött adat</div>`}</div></div>
      <div class="card span2"><h3>Tantárgyak <small>${subj.length}</small></h3><div class="grid g2" style="gap:8px">${rows(subj, p.subjectNames || {}, "s")}</div></div>
    </div>`;

  const bindText = (id, key) => (root.querySelector(id).oninput = (e) => { savePrefs({ [key]: e.target.value }); });
  bindText("#dn", "displayName"); bindText("#nn", "nickname"); bindText("#em", "emoji");
  root.querySelectorAll("input.nm").forEach((i) => (i.onchange = () => {
    const key = i.dataset.k === "t" ? "teacherNames" : "subjectNames";
    const m = { ...(ST.prefs[key] || {}) };
    i.value.trim() ? (m[i.dataset.o] = i.value.trim()) : delete m[i.dataset.o];
    savePrefs({ [key]: m });
  }));
}
