// Számonkérés: bejelentés a csoport egy jövőbeli órájára (a lenyíló csak valódi órákat kínál), lista törléssel.
import { get } from "../api.js";
import { groupName, groupOptions, lastGroup, setLastGroup, can, lessonsBetween, testKinds } from "../state.js";
import { esc, day, todayIso, addDays, fmtDate, relDay, DAYS } from "../util.js";
import { runOp, writeNote } from "../ops.js";

let draft = { groupId: null, lesson: "", kind: "", topic: "" };

export async function render(root) {
  const [tests, upcoming] = await Promise.all([get("/api/t/tests"), lessonsBetween(new Date(), addDays(new Date(), 56))]);
  draft.groupId ||= lastGroup();
  if (!testKinds().includes(draft.kind)) draft.kind = testKinds().find((k) => /témazáró/i.test(k)) || testKinds()[0] || "";
  const t = todayIso(), now = new Date();
  const slots = (gid) => upcoming.filter((l) => l.groupId === gid && new Date(`${l.date}T${l.start}`) > now);
  const opts = (gid) => slots(gid).map((l) => `<option value="${l.date}|${l.nr}" ${draft.lesson === `${l.date}|${l.nr}` ? "selected" : ""} ${l.testId ? "disabled" : ""}>${DAYS[(day(l.date).getDay() + 6) % 7]}, ${fmtDate(day(l.date))} · ${l.nr}. óra${l.testId ? " (már van)" : ""}</option>`).join("");
  const open = tests.filter((x) => x.date >= t), past = tests.filter((x) => x.date < t).reverse();
  const item = (x) => `<div class="item"><div class="grow"><b>${esc(groupName(x.groupId))}</b> · ${esc(x.kind)}<div class="small muted">${esc(x.topic)}</div></div>
    <div class="row" style="gap:6px"><span class="chip ${x.date >= t ? "warn" : ""}">${relDay(day(x.date))}, ${x.nr}. óra</span>${can("test.delete") && x.date >= t ? `<button class="btn sm danger" data-del="${x.id}" title="Törlés" aria-label="Törlés">🗑</button>` : ""}</div></div>`;
  root.innerHTML = `<div class="topbar"><div><h1>Számonkérés</h1><div class="sub">${open.length} bejelentett · a diákok a saját KRÉTA-jukban látják</div></div></div>
    <div class="grid g2">
      ${can("test.add") ? `<div class="card"><h3>Bejelentés ${writeNote()}</h3><div class="grid" style="gap:12px">
        <label class="f">Csoport<select class="input" id="t-g">${groupOptions(draft.groupId)}</select></label>
        <label class="f">Óra<select class="input" id="t-l">${opts(draft.groupId) || `<option value="">Nincs órád a következő 8 hétben</option>`}</select></label>
        <label class="f">Mód<select class="input" id="t-k">${testKinds().map((k) => `<option ${k === draft.kind ? "selected" : ""}>${esc(k)}</option>`).join("")}</select></label>
        <label class="f">Téma<input class="input" id="t-tp" maxlength="120" placeholder="pl. Függvények" value="${esc(draft.topic)}"></label>
        <button class="btn primary" id="t-go">Ellenőrzés és bejelentés</button></div></div>` : ""}
      <div class="card"><h3>Közelgő<small>${open.length}</small></h3><div class="list">${open.map(item).join("") || `<div class="empty">Nincs bejelentett számonkérés</div>`}</div></div>
      <details class="card span2"><summary><b>Korábbiak</b> <span class="muted small">(${past.length})</span></summary><div class="list" style="margin-top:12px">${past.map(item).join("")}</div></details>
    </div>`;
  const $ = (s) => root.querySelector(s);
  if ($("#t-g")) {
    if (!draft.lesson || !slots(draft.groupId).some((l) => `${l.date}|${l.nr}` === draft.lesson && !l.testId)) draft.lesson = $("#t-l").value;
    $("#t-g").onchange = (e) => { draft.groupId = e.target.value; setLastGroup(draft.groupId); draft.lesson = ""; render(root); };
    $("#t-l").onchange = (e) => (draft.lesson = e.target.value);
    $("#t-k").onchange = (e) => (draft.kind = e.target.value);
    $("#t-tp").oninput = (e) => (draft.topic = e.target.value);
    $("#t-go").onclick = async () => {
      const [date, nr] = (draft.lesson || "|").split("|");
      if (await runOp("test.add", { groupId: draft.groupId, date, nr: +nr, kind: draft.kind, topic: draft.topic })) { draft = { ...draft, lesson: "", topic: "" }; render(root); }
    };
  }
  root.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => { if (await runOp("test.delete", { testId: b.dataset.del })) render(root); }));
}
