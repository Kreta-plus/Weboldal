// Jegyek: csoportonként a névsor a jegyekkel; beíró módban egész osztálynak egyszerre (üresen hagyott sor = nincs jegy).
import { get } from "../api.js";
import { S, group, groupOptions, lastGroup, setLastGroup, can, gradeTypes, defaultType, WEIGHTS } from "../state.js";
import { esc, f2, gcls, fmtDate, day, todayIso } from "../util.js";
import { runOp, writeNote } from "../ops.js";

let entry = null; // beíró mód: { type, weight, date, topic, values: {studentId: n} }

export async function render(root, arg) {
  const gid = group(arg) ? arg : lastGroup();
  if (!gid) { root.innerHTML = `<div class="card empty">Nincs csoportod.</div>`; return; }
  setLastGroup(gid);
  const d = await get(`/api/t/group/${gid}`);
  const canAdd = can("grade.add");
  root.innerHTML = `<div class="topbar"><div><h1>Jegyek</h1><div class="sub">${esc(d.group.name)} · ${d.students.length} diák · ${d.count} jegy · csoportátlag <b>${f2(d.avg)}</b></div></div>
    <div class="row wrap"><select class="input" id="grp" aria-label="Csoport">${groupOptions(gid)}</select>
      ${canAdd ? `<button class="btn ${entry ? "" : "primary"}" id="mode">${entry ? "Beírás bezárása" : "＋ Jegybeírás"}</button>` : ""}</div></div>
    ${entry ? entryBar() : ""}
    <div class="card gb ${entry ? "entering" : ""}">
      <div class="gb-row gb-head"><span>Név</span><span>Jegyek</span><span>Átlag</span><span class="gb-abs">${S.ov.absenceTotals === false ? "" : "Hiányzás"}</span>${entry ? "<span>Új jegy</span>" : ""}</div>
      ${d.students.map((s, i) => `<div class="gb-row" data-s="${s.id}"><span class="gb-name"><span class="muted small">${i + 1}.</span> ${esc(s.name)}</span>
        <span class="chips">${s.grades.map((g) => `<button class="gr w ${gcls(g.value)}" data-g="${g.id}" title="${esc(`${g.type} · ${g.weight}% · ${fmtDate(day(g.date))}${g.topic ? " · " + g.topic : ""}`)}">${g.value}${g.weight !== 100 ? `<sup>${g.weight}</sup>` : ""}</button>`).join("") || `<span class="muted small">nincs jegy</span>`}</span>
        <span class="gr ${gcls(s.avg)} gb-avg">${f2(s.avg)}</span>
        <span class="small muted gb-abs">${s.absent == null ? "" : `${s.absent} ó${s.late ? ` · ${s.late} késés` : ""}`}</span>
        ${entry ? digitInput(s, entry.values[s.id]) : ""}
      </div>`).join("")}
    </div>
    ${entry ? `<div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn primary e-go" disabled>Ellenőrzés és beírás (0)</button></div>` : ""}`;
  const grades = Object.fromEntries(d.students.flatMap((s) => s.grades.map((g) => [g.id, { ...g, student: s.name }])));
  root.querySelector("#grp").onchange = (e) => { location.hash = `gradebook/${e.target.value}`; };
  const mode = root.querySelector("#mode");
  if (mode) mode.onclick = () => { entry = entry ? null : newEntry(todayIso()); render(root, gid); };
  root.querySelectorAll(".gb .gr[data-g]").forEach((b) => (b.onclick = () => gradeModal(grades[b.dataset.g], () => render(root, gid))));
  if (entry) bindEntry(root, d, gid);
}

// ---- a jegybeírás darabjai: a Jegyek oldal és az óra oldala (lesson.js) is ezeket használja ----
export const newEntry = (date, topic = "") => { const type = defaultType(); return { type, weight: gradeTypes()[type] || 100, date, topic, values: {} }; };
export const digitInput = (s, v) => `<span class="gb-in-wrap"><input class="input gb-in" data-s="${s.id}" inputmode="numeric" autocomplete="off" aria-label="${esc(s.name)} új jegye" value="${v || ""}"></span>`;

// a közös mezők; fixDate: az óra napja, nem módosítható
export function entryFields(e, { fixDate = false } = {}) {
  const types = gradeTypes();
  return `<div class="gb-bar-f">
      <label class="f">Típus<select class="input" id="e-type">${Object.keys(types).map((t) => `<option ${t === e.type ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label>
      ${S.ov.fixedWeights ? "" : `<label class="f">Súly<select class="input" id="e-w">${WEIGHTS.map((w) => `<option value="${w}" ${w === e.weight ? "selected" : ""}>${w}%</option>`).join("")}</select></label>`}
      ${fixDate ? "" : `<label class="f">Dátum<input class="input" type="date" id="e-date" max="${todayIso()}" value="${e.date}"></label>`}
      <label class="f grow">Téma<input class="input" id="e-topic" maxlength="120" placeholder="pl. Másodfokú egyenletek" value="${esc(e.topic)}"></label></div>`;
}
export const entryHelp = () => `Írd be a jegyet (1–5) a diák sorába: a szám után magától a következő diákra ugrik, Enterrel kihagyhatsz valakit. Egy számsor (pl. 54325) beillesztve sorban kitölti a névsort. Az üresen hagyott diák nem kap jegyet.${S.ov.fixedWeights ? " A súlyt a KRÉTA a típusból számolja." : ""} ${writeNote()}`;

// a mezők és a számbeviteli sorok bekötése; send: a „beírás” gombok (.e-go) megnyomásakor
export function bindEntryUI(root, e, send) {
  const $ = (s) => root.querySelector(s);
  const upd = () => {
    const n = Object.values(e.values).filter(Boolean).length;
    root.querySelectorAll(".e-go").forEach((b) => { b.disabled = !n; b.textContent = `Ellenőrzés és beírás (${n})`; });
  };
  $("#e-type").onchange = (ev) => { e.type = ev.target.value; e.weight = gradeTypes()[e.type] || e.weight; if ($("#e-w")) $("#e-w").value = e.weight; };
  if ($("#e-w")) $("#e-w").onchange = (ev) => (e.weight = +ev.target.value);
  if ($("#e-date")) $("#e-date").onchange = (ev) => (e.date = ev.target.value);
  $("#e-topic").oninput = (ev) => (e.topic = ev.target.value);
  const ins = [...root.querySelectorAll(".gb-in")];
  const entry = e;
  ins.forEach((inp, i) => {
    inp.paint = () => { inp.className = `input gb-in ${inp.value ? gcls(+inp.value) : ""}`; };
    inp.paint();
    inp.onfocus = () => inp.select(); // a meglévő számot felülírja a következő leütés
    inp.oninput = () => {
      // több számjegy (pl. beillesztett „54325”) → a következő sorokba kerül sorban
      const digits = inp.value.replace(/[^1-5]/g, "").split("");
      let k = i;
      if (!digits.length) { entry.values[inp.dataset.s] = 0; inp.value = ""; ins[i].paint(); }
      for (const v of digits) {
        if (!ins[k]) break;
        ins[k].value = v; entry.values[ins[k].dataset.s] = +v; ins[k].paint(); k++;
      }
      upd();
      if (digits.length) (ins[k] || ins[k - 1]).focus();
    };
    inp.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === "ArrowDown") { e.preventDefault(); ins[i + 1]?.focus(); }
      if (e.key === "ArrowUp") { e.preventDefault(); ins[i - 1]?.focus(); }
      if (e.key === "Backspace" && !inp.value) { e.preventDefault(); ins[i - 1]?.focus(); }
    };
  });
  root.querySelectorAll(".e-go").forEach((b) => (b.onclick = send));
  upd();
  ins[0]?.focus();
}

export const sendGrades = (gid, e) => runOp("grade.add", { groupId: gid, date: e.date, type: e.type, weight: e.weight, topic: e.topic,
  entries: Object.entries(e.values).filter(([, v]) => v).map(([studentId, value]) => ({ studentId, value })) });

function entryBar() {
  const n = Object.values(entry.values).filter(Boolean).length;
  return `<div class="card gb-bar">${entryFields(entry)}
    <div class="row wrap spread"><div class="small muted">${entryHelp()}</div>
      <button class="btn primary e-go" ${n ? "" : "disabled"}>Ellenőrzés és beírás (${n})</button></div></div>`;
}

function bindEntry(root, d, gid) {
  bindEntryUI(root, entry, async () => { if (await sendGrades(gid, entry)) { entry = null; render(root, gid); } });
}

export function gradeModal(g, done) {
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `<div class="card modal" role="dialog" aria-modal="true" aria-labelledby="gm-t">
    <div class="row spread"><h3 id="gm-t" style="margin:0">${esc(g.student)}</h3><button class="btn sm" data-x aria-label="Bezárás">✕</button></div>
    <div class="row" style="gap:14px"><span class="gr ${gcls(g.value)}" style="min-width:56px;height:56px;font-size:1.6rem">${g.value}</span>
      <div><b>${esc(g.type)}</b>${g.weight ? ` · ${g.weight}%` : ""}<div class="small muted">${fmtDate(day(g.date))}${g.topic ? " · " + esc(g.topic) : ""}</div></div></div>
    ${can("grade.edit") ? `<div class="gb-bar-f">
      <label class="f">Jegy<select class="input" id="m-v">${[5, 4, 3, 2, 1].map((v) => `<option ${v === g.value ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      <label class="f">Típus<select class="input" id="m-t">${Object.keys(gradeTypes()).map((t) => `<option ${t === g.type ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label>
      ${S.ov.fixedWeights ? "" : `<label class="f">Súly<select class="input" id="m-w">${WEIGHTS.map((w) => `<option value="${w}" ${w === g.weight ? "selected" : ""}>${w}%</option>`).join("")}</select></label>`}
      <label class="f grow">Téma<input class="input" id="m-tp" maxlength="120" value="${esc(g.topic)}"></label></div>` : ""}
    <div class="row wrap">${can("grade.delete") ? `<button class="btn danger grow" id="m-del">Törlés</button>` : ""}${can("grade.edit") ? `<button class="btn primary grow" id="m-save">Módosítás</button>` : ""}</div></div>`;
  document.body.appendChild(bg);
  const close = () => { bg.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  bg.querySelector("[data-x]").onclick = close;
  bg.onclick = (e) => { if (e.target === bg) close(); };
  const $ = (s) => bg.querySelector(s);
  if ($("#m-t") && $("#m-w")) $("#m-t").onchange = (e) => ($("#m-w").value = gradeTypes()[e.target.value] || $("#m-w").value);
  if ($("#m-save")) $("#m-save").onclick = async () => {
    close();
    const r = await runOp("grade.edit", { groupId: g.groupId, gradeId: g.id, value: +$("#m-v").value, type: $("#m-t").value, weight: $("#m-w") ? +$("#m-w").value : null, topic: $("#m-tp").value });
    if (r) done();
  };
  if ($("#m-del")) $("#m-del").onclick = async () => { close(); if (await runOp("grade.delete", { groupId: g.groupId, gradeId: g.id })) done(); };
}
