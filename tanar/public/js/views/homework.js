// Házi feladat: kiadás csoportnak határidővel (alapból a csoport következő órája), lista törléssel.
import { get } from "../api.js";
import { groupName, groupOptions, lastGroup, setLastGroup, can, lessonsBetween } from "../state.js";
import { esc, linkify, day, todayIso, addDays, fmtDate, relDay, DAYS } from "../util.js";
import { runOp, writeNote } from "../ops.js";

let draft = { groupId: null, due: "", text: "" };

export async function render(root) {
  const [hw, upcoming] = await Promise.all([get("/api/t/homework"), lessonsBetween(addDays(new Date(), 1), addDays(new Date(), 28))]);
  draft.groupId ||= lastGroup();
  const nextOf = (gid) => upcoming.filter((l) => l.groupId === gid);
  if (!draft.due) draft.due = nextOf(draft.groupId)[0]?.date || todayIso();
  const t = todayIso(), open = hw.filter((h) => h.due >= t), past = hw.filter((h) => h.due < t).reverse();
  const item = (h) => `<div class="item"><div class="grow"><b>${esc(groupName(h.groupId))}</b> <span class="small muted">· kiadva ${fmtDate(day(h.given))}</span>
      <div class="hw-text">${linkify(h.text)}</div></div>
    <div class="row" style="gap:6px"><span class="chip ${h.due >= t ? "" : "ok"}">${relDay(day(h.due))}</span>${can("homework.delete") ? `<button class="btn sm danger" data-del="${h.id}" title="Törlés" aria-label="Törlés">🗑</button>` : ""}</div></div>`;
  root.innerHTML = `<div class="topbar"><div><h1>Házi feladat</h1><div class="sub">${open.length} nyitott · ${past.length} lejárt</div></div></div>
    <div class="grid g2">
      ${can("homework.add") ? `<div class="card"><h3>Új házi feladat ${writeNote()}</h3><div class="grid" style="gap:12px">
        <label class="f">Csoport<select class="input" id="h-g">${groupOptions(draft.groupId)}</select></label>
        <label class="f">Határidő<input class="input" type="date" id="h-due" min="${t}" value="${draft.due}"></label>
        <div class="chips" id="h-next">${nextChips(nextOf(draft.groupId))}</div>
        <label class="f">Feladat<textarea class="input" id="h-text" maxlength="2000" rows="5" placeholder="pl. Tankönyv 42. oldal 3–5. feladat. A linkek kattinthatók lesznek.">${esc(draft.text)}</textarea></label>
        <button class="btn primary" id="h-go">Ellenőrzés és kiadás</button></div></div>` : ""}
      <div class="card"><h3>Nyitott<small>${open.length}</small></h3><div class="list">${open.map(item).join("") || `<div class="empty">Nincs nyitott házi feladat</div>`}</div></div>
      <details class="card span2"><summary><b>Lejárt házik</b> <span class="muted small">(${past.length})</span></summary><div class="list" style="margin-top:12px">${past.map(item).join("")}</div></details>
    </div>`;
  const $ = (s) => root.querySelector(s);
  const bindNext = () => root.querySelectorAll("#h-next button").forEach((b) => (b.onclick = () => { draft.due = $("#h-due").value = b.dataset.d; }));
  if ($("#h-g")) {
    $("#h-g").onchange = (e) => {
      draft.groupId = e.target.value; setLastGroup(draft.groupId);
      const n = nextOf(draft.groupId); draft.due = $("#h-due").value = n[0]?.date || t;
      $("#h-next").innerHTML = nextChips(n); bindNext();
    };
    $("#h-due").onchange = (e) => (draft.due = e.target.value);
    $("#h-text").oninput = (e) => (draft.text = e.target.value);
    bindNext();
    $("#h-go").onclick = async () => {
      if (await runOp("homework.add", { groupId: draft.groupId, due: draft.due, text: draft.text })) { draft = { groupId: draft.groupId, due: "", text: "" }; render(root); }
    };
  }
  root.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => { if (await runOp("homework.delete", { homeworkId: b.dataset.del })) render(root); }));
}

const nextChips = (ls) => ls.length ? `<span class="small muted">Következő órák:</span>${ls.slice(0, 4).map((l) => `<button class="chip" data-d="${l.date}">${DAYS[(day(l.date).getDay() + 6) % 7].slice(0, 3)} ${fmtDate(day(l.date))}</button>`).join("")}` : "";
