// Feljegyzések: dicséret, figyelmeztetés, értesítés egy vagy több diáknak; lista szűréssel és törléssel.
import { get } from "../api.js";
import { S, group, groupOptions, lastGroup, klass, can, noteKinds, HEAD_ONLY } from "../state.js";
import { esc, day, todayIso, fmtDate } from "../util.js";
import { runOp, writeNote } from "../ops.js";

let draft = { groupId: null, kind: "Szaktanári dicséret", title: "", text: "", date: "", picked: new Set() };
let filter = "all";
const tone = (k) => (/dicséret/i.test(k) ? "ok" : /figyelmeztetés/i.test(k) ? "bad" : "");

export async function render(root) {
  draft.groupId ||= lastGroup();
  draft.date ||= todayIso();
  const [notes, grp] = await Promise.all([get("/api/t/notes"), get(`/api/t/group/${draft.groupId}`)]);
  const headOnly = HEAD_ONLY.includes(draft.kind), headClass = !!klass(group(draft.groupId)?.classId)?.head;
  const shown = notes.filter((n) => filter === "all" || (filter === "praise" ? /dicséret/i.test(n.kind) : filter === "warn" ? /figyelmeztetés/i.test(n.kind) : !/dicséret|figyelmeztetés/i.test(n.kind)));
  root.innerHTML = `<div class="topbar"><div><h1>Feljegyzések</h1><div class="sub">${notes.length} feljegyzés a diákjaidnál · a diákok és a szülők a KRÉTA-ban látják</div></div></div>
    <div class="grid g2">
      ${!can("note.add") && !S.ov.demo ? `<div class="card empty">A KRÉTA tanári (mobil) API-jában nincs szabad szöveges feljegyzés, ezért itt nem írható. A hivatalos webes KRÉTA-ban tudod megtenni.</div>` : ""}
      ${can("note.add") ? `<div class="card"><h3>Új feljegyzés ${writeNote()}</h3><div class="grid" style="gap:12px">
        <label class="f">Típus<select class="input" id="n-k">${noteKinds().map((k) => `<option ${k === draft.kind ? "selected" : ""}>${k}</option>`).join("")}</select></label>
        <label class="f">Csoport<select class="input" id="n-g">${groupOptions(draft.groupId)}</select></label>
        ${headOnly && !headClass ? `<div class="err">${esc(draft.kind)} csak a saját osztályod diákjainak adható. Válaszd az osztályfőnöki csoportodat.</div>` : ""}
        <div><div class="row spread" style="margin-bottom:6px"><span class="small muted">Diákok (${draft.picked.size} kiválasztva)</span><button class="btn sm" id="n-none">Egyik sem</button></div>
          <div class="pick">${grp.students.map((s) => `<label class="pick-i ${draft.picked.has(s.id) ? "on" : ""}"><input type="checkbox" data-s="${s.id}" ${draft.picked.has(s.id) ? "checked" : ""}> ${esc(s.name)}</label>`).join("")}</div></div>
        <label class="f">Cím<input class="input" id="n-t" maxlength="80" placeholder="pl. Kiemelkedő órai munka" value="${esc(draft.title)}"></label>
        <label class="f">Szöveg<textarea class="input" id="n-x" maxlength="1000" rows="4" placeholder="Mit szeretnél üzenni a diáknak és a szüleinek?">${esc(draft.text)}</textarea></label>
        <label class="f">Dátum<input class="input" type="date" id="n-d" max="${todayIso()}" value="${draft.date}"></label>
        <button class="btn primary" id="n-go" ${draft.picked.size ? "" : "disabled"}>Ellenőrzés és beírás (${draft.picked.size} diák)</button></div></div>` : ""}
      <div class="card"><h3>Eddigiek<small>${shown.length}</small></h3>
        <div class="seg" id="n-f" style="margin-bottom:12px">${[["all", "Mind"], ["praise", "Dicséret"], ["warn", "Figyelmeztetés"], ["info", "Értesítés"]].map(([k, l]) => `<button data-f="${k}" class="${k === filter ? "on" : ""}">${l}</button>`).join("")}</div>
        <div class="list">${shown.map((n) => `<div class="item"><div class="grow"><b>${esc(n.studentName)}</b> <span class="small muted">· ${esc(klass(n.classId)?.name || "")} · ${fmtDate(day(n.date))}</span>
            <div class="row wrap" style="gap:6px;margin:4px 0"><span class="chip ${tone(n.kind)}">${esc(n.kind)}</span><b class="small">${esc(n.title)}</b></div>
            <div class="small muted hw-text">${esc(n.text)}</div></div>
          ${can("note.delete") ? `<button class="btn sm danger" data-del="${n.id}" title="Törlés" aria-label="Törlés">🗑</button>` : ""}</div>`).join("") || `<div class="empty">Nincs ilyen feljegyzés</div>`}</div></div>
    </div>`;
  const $ = (s) => root.querySelector(s);
  root.querySelectorAll("#n-f button").forEach((b) => (b.onclick = () => { filter = b.dataset.f; render(root); }));
  root.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => { if (await runOp("note.delete", { noteId: b.dataset.del })) render(root); }));
  if (!$("#n-k")) return;
  const upd = () => { $("#n-go").disabled = !draft.picked.size; $("#n-go").textContent = `Ellenőrzés és beírás (${draft.picked.size} diák)`; root.querySelector(".pick").previousElementSibling.firstElementChild.textContent = `Diákok (${draft.picked.size} kiválasztva)`; };
  $("#n-k").onchange = (e) => { draft.kind = e.target.value; render(root); };
  $("#n-g").onchange = (e) => { draft.groupId = e.target.value; draft.picked = new Set(); render(root); };
  $("#n-none").onclick = () => { draft.picked = new Set(); render(root); };
  root.querySelectorAll(".pick input").forEach((c) => (c.onchange = () => {
    c.checked ? draft.picked.add(c.dataset.s) : draft.picked.delete(c.dataset.s);
    c.parentElement.classList.toggle("on", c.checked); upd();
  }));
  $("#n-t").oninput = (e) => (draft.title = e.target.value);
  $("#n-x").oninput = (e) => (draft.text = e.target.value);
  $("#n-d").onchange = (e) => (draft.date = e.target.value);
  $("#n-go").onclick = async () => {
    const r = await runOp("note.add", { studentIds: [...draft.picked], kind: draft.kind, title: draft.title, text: draft.text, date: draft.date });
    if (r) { draft = { ...draft, title: "", text: "", picked: new Set() }; render(root); }
  };
}
