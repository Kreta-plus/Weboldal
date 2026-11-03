// Az óra oldala (az órarendből egy órára kattintva): naplózás (téma + mulasztás) és jegybeírás erre az órára.
import { get } from "../api.js";
import { group, can } from "../state.js";
import { esc, f2, gcls, day, fmtDate, relDay, todayIso, DAYS } from "../util.js";
import { roster } from "./attendance.js";
import { newEntry, digitInput, entryFields, entryHelp, bindEntryUI, sendGrades, gradeModal } from "./gradebook.js";

let tab = "log";

export async function render(root, arg) {
  const [gid, date, nr] = String(arg || "").split("|");
  if (!gid || !date || !nr) { location.replace("#timetable"); return; }
  let d;
  try { d = await get(`/api/t/attendance?groupId=${encodeURIComponent(gid)}&date=${encodeURIComponent(date)}&nr=${encodeURIComponent(nr)}`); }
  catch (e) { root.innerHTML = `<div class="card empty">${esc(e.message)} <a href="#timetable">Vissza az órarendhez</a></div>`; return; }
  const l = d.lesson, dd = day(date);
  const head = () => `<div class="topbar"><div><h1>${esc(group(gid)?.name || l.subject)}</h1>
      <div class="sub">${DAYS[(dd.getDay() + 6) % 7]}, ${fmtDate(dd)} (${relDay(dd)}) · ${l.nr}. óra, ${l.start}–${l.end} · ${esc(l.room || "–")} ·
        ${l.recorded ? `<b>naplózva</b>${l.topic ? ` · 📒 ${esc(l.topic)}` : ""}` : "még nincs naplózva"}${l.testId ? ` · <span class="chip warn">számonkérés</span>` : ""}</div></div>
    <div class="row wrap"><a class="btn" href="#timetable">← Órarend</a>
      <div class="seg" id="ltab" role="tablist">${[["log", "✋ Naplózás"], ["grades", "📘 Jegyek"]].map(([k, t]) => `<button data-t="${k}" role="tab" aria-selected="${tab === k}" class="${tab === k ? "on" : ""}">${t}</button>`).join("")}</div></div></div>
    <div id="lbody"></div>`;
  root.innerHTML = head();
  const body = root.querySelector("#lbody");
  root.querySelectorAll("#ltab button").forEach((b) => (b.onclick = () => { tab = b.dataset.t; render(root, arg); }));
  if (tab === "log") return roster(body, arg, { embedded: true, onSaved: () => render(root, arg) });
  return gradesTab(body, gid, date, l);
}

// jegybeírás erre az órára: a dátum az óra napja, a téma alapból az óra témája
async function gradesTab(root, gid, date, lesson) {
  if (date > todayIso()) { root.innerHTML = `<div class="card empty">Ez az óra még nem volt meg, jegyet csak utána lehet rá beírni.</div>`; return; }
  const d = await get(`/api/t/group/${gid}`);
  const e = newEntry(date, lesson.topic || "");
  const canAdd = can("grade.add");
  const grades = Object.fromEntries(d.students.flatMap((s) => s.grades.map((g) => [g.id, { ...g, student: s.name }])));
  root.innerHTML = `${canAdd ? `<div class="card gb-bar">${entryFields(e, { fixDate: true })}
      <div class="row wrap spread"><div class="small muted">A jegy dátuma az óra napja (${fmtDate(day(date))}). ${entryHelp()}</div>
        <button class="btn primary e-go" disabled>Ellenőrzés és beírás (0)</button></div></div>` : ""}
    <div class="card gb ${canAdd ? "entering" : ""}">
      <div class="gb-row gb-head"><span>Név</span><span>Ezen az órán</span><span>Átlag</span><span class="gb-abs">Jegyek</span>${canAdd ? "<span>Új jegy</span>" : ""}</div>
      ${d.students.map((s, i) => {
        const here = s.grades.filter((g) => g.date === date);
        return `<div class="gb-row"><span class="gb-name"><span class="muted small">${i + 1}.</span> ${esc(s.name)}</span>
          <span class="chips">${here.map((g) => `<button class="gr w ${gcls(g.value)}" data-g="${g.id}" title="${esc(`${g.type}${g.topic ? " · " + g.topic : ""}`)}">${g.value}</button>`).join("") || `<span class="muted small">–</span>`}</span>
          <span class="gr ${gcls(s.avg)} gb-avg">${f2(s.avg)}</span><span class="small muted gb-abs">${s.grades.length} db</span>
          ${canAdd ? digitInput(s, "") : ""}</div>`;
      }).join("")}
    </div>
    ${canAdd ? `<div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn primary e-go" disabled>Ellenőrzés és beírás (0)</button></div>` : ""}`;
  root.querySelectorAll(".gr[data-g]").forEach((b) => (b.onclick = () => gradeModal(grades[b.dataset.g], () => gradesTab(root, gid, date, lesson))));
  if (canAdd) bindEntryUI(root, e, async () => { if (await sendGrades(gid, e)) gradesTab(root, gid, date, lesson); });
}
