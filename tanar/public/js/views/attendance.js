// Mulasztás: a nap órái; egy órát kiválasztva az óra oldala (lesson.js) nyílik meg.
import { get } from "../api.js";
import { group, can, lessonsBetween } from "../state.js";
import { esc, day, todayIso, fmtDate, DAYS, subjColor, relDay } from "../util.js";
import { runOp, writeNote } from "../ops.js";

let pickDate = todayIso();

export async function render(root, arg) {
  if (arg) { location.replace("#lesson/" + encodeURIComponent(arg)); return; } // az óra oldala intézi
  const ls = await lessonsBetween(day(pickDate), day(pickDate));
  const d = day(pickDate), now = new Date();
  root.innerHTML = `<div class="topbar"><div><h1>Mulasztás</h1><div class="sub">Válaszd ki az órát, aztán jelöld a hiányzókat és a későket.</div></div>
    <input class="input" type="date" id="pd" value="${pickDate}" max="${todayIso()}" aria-label="Nap"></div>
    <div class="card"><h3>${DAYS[(d.getDay() + 6) % 7]}, ${fmtDate(d)}<small>${ls.length} óra</small></h3><div class="list">
      ${ls.map((l) => {
        const started = new Date(`${l.date}T${l.start}`) <= now;
        return `<a class="item linkrow" href="#lesson/${encodeURIComponent(l.id)}"><span class="les-nr">${l.nr}.</span><span class="dot" style="background:${subjColor(l.subject)}"></span>
          <div class="grow"><b>${esc(group(l.groupId)?.name || "?")}</b><div class="small muted">${l.start}–${l.end} · ${esc(l.room)}${l.topic ? ` · 📒 ${esc(l.topic)}` : ""}</div></div>
          ${l.recorded ? `<span class="chip ok">rögzítve${l.absent ? ` · ${l.absent} hiányzó` : ""}${l.late ? ` · ${l.late} késő` : ""}</span>` : started ? `<span class="chip warn">beírandó</span>` : `<span class="chip">később</span>`}</a>`;
      }).join("") || `<div class="empty">Ezen a napon nincs órád.</div>`}</div></div>`;
  root.querySelector("#pd").onchange = (e) => { pickDate = e.target.value || todayIso(); render(root); };
}

// Egy óra naplózása: téma + névsor (jelen / hiányzik / késik). Egy mentés, mert a KRÉTA is egy kérésben kéri.
// embedded: az óra oldalán (lesson.js) fül tartalmaként, saját fejléc nélkül.
export async function roster(root, lessonId, { embedded = false, onSaved } = {}) {
  const [gid, date, nr] = lessonId.split("|");
  let d;
  try { d = await get(`/api/t/attendance?groupId=${encodeURIComponent(gid)}&date=${encodeURIComponent(date)}&nr=${encodeURIComponent(nr)}`); }
  catch (e) { root.innerHTML = `<div class="card empty">${esc(e.message)} <a href="#attendance">Vissza</a></div>`; return; }
  const l = d.lesson, future = new Date(`${l.date}T${l.start}`) > new Date();
  const marks = Object.fromEntries(d.students.map((s) => [s.id, s.mark ? { kind: s.mark.kind, minutes: s.mark.minutes || 5 } : null]));
  const combined = can("lesson.log"), editable = (combined || can("absence.record")) && !future;
  pickDate = date;
  let topic = l.topic || "";

  const draw = () => {
    const ab = Object.values(marks).filter((m) => m?.kind === "absent").length, la = Object.values(marks).filter((m) => m?.kind === "late").length;
    root.innerHTML = `${embedded ? "" : `<div class="topbar"><div><h1>${esc(group(gid)?.name || "Óra")}</h1>
        <div class="sub">${relDay(day(date))}, ${fmtDate(day(date))} · ${l.nr}. óra (${l.start}–${l.end}) · ${esc(l.room)} · ${l.recorded ? "<b>naplózva</b>" : "még nincs naplózva"}</div></div>
      <div class="row"><a class="btn" href="#attendance">← Órák</a><a class="btn" href="#gradebook/${gid}">📘 Jegyek</a></div></div>`}
      ${future ? `<div class="card empty">Ez az óra még nem kezdődött el, csak utána naplózható.</div>` : `
      ${combined ? `<div class="card" style="margin-bottom:var(--gap)"><label class="f">📒 Az óra témája (haladási napló)
          <input class="input" id="tp" maxlength="200" placeholder="pl. Másodfokú egyenletek: gyakorlás" value="${esc(topic)}"></label></div>` : ""}
      <div class="card"><div class="row wrap spread" style="margin-bottom:12px">
          <div class="row wrap" style="gap:6px"><span class="chip ok">${d.students.length - ab - la} jelen</span><span class="chip bad">${ab} hiányzik</span><span class="chip warn">${la} késik</span>${writeNote()}</div>
          ${editable ? `<button class="btn sm" id="all">Mindenki jelen</button>` : ""}</div>
        <div class="att">${d.students.map((s, i) => {
          const m = marks[s.id];
          return `<div class="att-row ${m ? m.kind : ""}" data-s="${s.id}"><span class="gb-name"><span class="muted small">${i + 1}.</span> ${esc(s.name)}</span>
            <div class="seg" role="radiogroup" aria-label="${esc(s.name)}">${[["", "Jelen"], ["absent", "Hiányzik"], ["late", "Késik"]].map(([k, t]) => `<button data-k="${k}" class="${(m?.kind || "") === k ? "on" : ""}" ${editable ? "" : "disabled"} role="radio" aria-checked="${(m?.kind || "") === k}">${t}</button>`).join("")}</div>
            ${m?.kind === "late" ? `<label class="att-min"><input class="input" type="number" min="1" max="45" value="${m.minutes}" ${editable ? "" : "disabled"} aria-label="Késés percben"> perc</label>` : ""}</div>`;
        }).join("")}</div>
        ${editable ? `<div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn primary" id="save">${combined ? "Ellenőrzés és naplózás" : "Ellenőrzés és rögzítés"}</button></div>` : ""}</div>`}`;
    root.querySelectorAll(".att-row").forEach((row) => {
      const sid = row.dataset.s;
      row.querySelectorAll(".seg button").forEach((b) => (b.onclick = () => {
        marks[sid] = b.dataset.k ? { kind: b.dataset.k, minutes: marks[sid]?.minutes || 5 } : null;
        draw();
      }));
      const mi = row.querySelector(".att-min input");
      if (mi) mi.onchange = () => (marks[sid].minutes = Math.max(1, Math.min(45, +mi.value || 1)));
    });
    const tp = root.querySelector("#tp");
    if (tp) tp.oninput = () => (topic = tp.value);
    const all = root.querySelector("#all");
    if (all) all.onclick = () => { Object.keys(marks).forEach((k) => (marks[k] = null)); draw(); };
    const save = root.querySelector("#save");
    if (save) save.onclick = async () => {
      const entries = Object.entries(marks).filter(([, m]) => m).map(([studentId, m]) => ({ studentId, kind: m.kind, minutes: m.minutes }));
      const r = combined ? await runOp("lesson.log", { groupId: gid, date, nr: +nr, topic, entries }) : await runOp("absence.record", { groupId: gid, date, nr: +nr, entries });
      if (r) { onSaved?.(); roster(root, lessonId, { embedded, onSaved }); }
    };
  };
  draw();
}
