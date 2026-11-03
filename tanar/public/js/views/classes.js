// Osztályok: névsor a saját tantárgyaid átlagaival és a mulasztásokkal; diákra kattintva részletek.
import { get } from "../api.js";
import { S, groupName } from "../state.js";
import { esc, f2, gcls, fmtDate, day } from "../util.js";

let cid = null, sortBy = "name";

export async function render(root) {
  cid = S.ov.classes.some((c) => c.id === cid) ? cid : (S.ov.classes.find((c) => c.head) || S.ov.classes[0])?.id;
  if (!cid) { root.innerHTML = `<div class="card empty">Nincs osztályod.</div>`; return; }
  const d = await get(`/api/t/class/${cid}`);
  const sorters = { name: (a, b) => a.name.localeCompare(b.name, "hu"), avg: (a, b) => (a.avg ?? 9) - (b.avg ?? 9), abs: (a, b) => (b.absent ?? 0) - (a.absent ?? 0) };
  const studs = [...d.students].sort(sorters[sortBy]);
  const cols = d.groups.length;
  root.innerHTML = `<div class="topbar"><div><h1>${esc(d.cls.name)} ${d.cls.head ? `<span class="chip">osztályfőnök</span>` : ""}</h1>
      <div class="sub">${d.students.length} diák · a te tantárgyaid: ${d.groups.map((g) => esc(g.subject)).join(", ")}</div></div>
    <div class="row wrap"><div class="seg" id="cls">${S.ov.classes.map((c) => `<button data-c="${c.id}" class="${c.id === cid ? "on" : ""}">${esc(c.name)}</button>`).join("")}</div>
      <div class="seg" id="sort">${[["name", "Név"], ["avg", "Átlag"], ...(S.ov.absenceTotals === false ? [] : [["abs", "Hiányzás"]])].map(([k, l]) => `<button data-k="${k}" class="${k === sortBy ? "on" : ""}">${l}</button>`).join("")}</div></div></div>
    <div class="card cl" style="--cols:${cols}">
      <div class="cl-row gb-head"><span>Név</span>${d.groups.map((g) => `<span>${esc(g.subject)}</span>`).join("")}<span>Összesen</span><span class="gb-abs">${S.ov.absenceTotals === false ? "" : "Hiányzás"}</span></div>
      ${studs.map((s) => `<button class="cl-row ${s.avg != null && s.avg < 2 ? "risk" : ""}" data-s="${s.id}"><span class="gb-name">${esc(s.name)}</span>
        ${d.groups.map((g) => `<span class="cl-c" data-l="${esc(g.subject)}"><span class="gr ${gcls(s.bySubject[g.id])}">${f2(s.bySubject[g.id])}</span></span>`).join("")}
        <span class="cl-c" data-l="Összesen"><span class="gr ${gcls(s.avg)}">${f2(s.avg)}</span></span>
        <span class="small muted gb-abs">${s.absent == null ? "" : `${s.absent} óra${s.late ? ` · ${s.late} késés` : ""}`}</span></button>`).join("")}
    </div>`;
  root.querySelectorAll("#cls button").forEach((b) => (b.onclick = () => { cid = b.dataset.c; render(root); }));
  root.querySelectorAll("#sort button").forEach((b) => (b.onclick = () => { sortBy = b.dataset.k; render(root); }));
  root.querySelectorAll(".cl-row[data-s]").forEach((b) => (b.onclick = () => studentModal(b.dataset.s)));
}

async function studentModal(sid) {
  const d = await get(`/api/t/student/${sid}`);
  const byG = new Map();
  d.grades.forEach((g) => { if (!byG.has(g.groupId)) byG.set(g.groupId, []); byG.get(g.groupId).push(g); });
  const avg = (gs) => { const w = gs.reduce((a, g) => a + g.weight, 0); return w ? gs.reduce((a, g) => a + g.value * g.weight, 0) / w : null; };
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `<div class="card modal st-modal" role="dialog" aria-modal="true" aria-labelledby="st-t">
    <div class="row spread"><h3 id="st-t" style="margin:0">${esc(d.student.name)}</h3><button class="btn sm" data-x aria-label="Bezárás">✕</button></div>
    ${[...byG.entries()].map(([gid, gs]) => `<div><div class="row spread" style="margin-bottom:6px"><b>${esc(groupName(gid))}</b><span class="gr ${gcls(avg(gs))}">${f2(avg(gs))}</span></div>
      <div class="chips">${gs.map((g) => `<span class="gr w ${gcls(g.value)}" title="${esc(`${g.type} · ${g.weight}% · ${fmtDate(day(g.date))}${g.topic ? " · " + g.topic : ""}`)}">${g.value}${g.weight !== 100 ? `<sup>${g.weight}</sup>` : ""}</span>`).join("")}</div></div>`).join("") || `<div class="muted">Nincs jegye a tantárgyaidból.</div>`}
    ${d.notes.length ? `<div><b>Feljegyzések</b><div class="list" style="margin-top:6px">${d.notes.map((n) => `<div class="item"><div class="grow"><b class="small">${esc(n.title)}</b><div class="small muted">${fmtDate(day(n.date))} · ${esc(n.text)}</div></div><span class="chip ${/dicséret/i.test(n.kind) ? "ok" : /figyelmeztetés/i.test(n.kind) ? "bad" : ""}">${esc(n.kind)}</span></div>`).join("")}</div></div>` : ""}
    <div><b>Mulasztások a te óráidon</b><div class="list" style="margin-top:6px">${d.absences.slice(0, 12).map((a) => `<div class="item"><div class="grow">${fmtDate(day(a.date))}, ${a.nr}. óra · ${esc(groupName(a.groupId))}</div><span class="chip ${a.kind === "absent" ? "bad" : "warn"}">${a.kind === "absent" ? "hiányzott" : `késett ${a.minutes} percet`}</span></div>`).join("") || `<div class="muted small">Nincs mulasztása 👍</div>`}</div></div>
  </div>`;
  document.body.appendChild(bg);
  const close = () => { bg.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  bg.querySelector("[data-x]").onclick = close;
  bg.onclick = (e) => { if (e.target === bg) close(); };
}
