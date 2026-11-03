import { get } from "../api.js";
import { S, groupName, group, klass, lessonsBetween } from "../state.js";
import { esc, f2, gcls, day, todayIso, addDays, fmtDate, relDay, ago, DAYS, subjColor } from "../util.js";

const greet = () => { const h = new Date().getHours(); return h < 9 ? "Jó reggelt" : h < 18 ? "Jó napot" : "Jó estét"; };
const started = (l) => new Date(`${l.date}T${l.start || "00:00"}`) <= new Date();

export async function render(root) {
  const today = new Date();
  const [week, next, tests, hw, log, groups] = await Promise.all([
    lessonsBetween(addDays(today, -7), today),
    lessonsBetween(addDays(today, 1), addDays(today, 10)),
    get("/api/t/tests"), get("/api/t/homework"), get("/api/t/log"),
    Promise.all(S.ov.groups.map((g) => get(`/api/t/group/${g.id}?summary=1`))),
  ]);
  const t = todayIso();
  let dayLs = week.filter((l) => l.date === t), dayLabel = "Mai órák";
  if (!dayLs.length && next.length) { dayLs = next.filter((l) => l.date === next[0].date); dayLabel = `Következő tanítási nap: ${DAYS[(day(next[0].date).getDay() + 6) % 7]}, ${fmtDate(day(next[0].date))}`; }
  const todo = week.filter((l) => (!l.recorded || !l.topic) && started(l));
  const soon = tests.filter((x) => x.date >= t && x.date <= addIso(14));
  const risk = groups.flatMap((g) => g.students.filter((s) => s.avg != null && s.avg < 2).map((s) => ({ ...s, group: g.group })))
    .sort((a, b) => a.avg - b.avg);
  const hwSoon = hw.filter((h) => h.due >= t).slice(0, 6);

  root.innerHTML = `<div class="topbar"><div><h1>${greet()}, ${esc(S.ov.teacher.name?.split(" ").slice(-1)[0] || "")}!</h1>
      <div class="sub">${DAYS[(today.getDay() + 6) % 7]}, ${fmtDate(today)} · ${S.ov.groups.length} csoport, ${S.ov.classes.reduce((a, c) => a + c.count, 0)} diák</div></div>
      ${S.ov.demo ? `<span class="chip">🧪 teszt fiók</span>` : ""}</div>
    <div class="grid g4 kp">
      <div class="card kpi"><div class="v">${week.filter((l) => l.date === t).length}</div><div class="l">óra ma</div><div class="d">${week.filter((l) => l.date === t && !started(l)).length} van még hátra</div></div>
      <div class="card kpi"><div class="v">${todo.length}</div><div class="l">beírandó óra</div><div class="d">${todo.length ? "hiányzik a mulasztás vagy a téma" : "minden óra rögzítve"}</div></div>
      <div class="card kpi"><div class="v">${soon.length}</div><div class="l">számonkérés 2 héten belül</div><div class="d">${soon[0] ? `legközelebb ${relDay(day(soon[0].date))}` : "nincs bejelentve"}</div></div>
      <div class="card kpi"><div class="v">${risk.length}</div><div class="l">diák 2,0 alatt</div><div class="d">a saját tantárgyaidban</div></div>
    </div>
    <div class="grid g2" style="margin-top:var(--gap)">
      <div class="card"><h3>${esc(dayLabel)}<small>${dayLs.length} óra</small></h3><div class="list">
        ${dayLs.map((l) => lessonRow(l)).join("") || `<div class="empty">Ma nincs órád 🎉</div>`}</div></div>
      <div class="card"><h3>Beírandó órák<small>elmúlt 7 nap</small></h3><div class="list">
        ${todo.map((l) => `<a class="item linkrow" href="#lesson/${encodeURIComponent(l.id)}"><span class="dot" style="background:${subjColor(l.subject)}"></span>
          <div class="grow"><b>${esc(groupName(l.groupId))}</b><div class="small muted">${relDay(day(l.date))}, ${l.nr}. óra · ${l.start}</div></div><span class="row" style="gap:4px">${l.recorded ? "" : `<span class="chip warn">mulasztás</span>`}${l.topic ? "" : `<span class="chip warn">téma</span>`}</span></a>`).join("")
          || `<div class="empty">Minden megtartott óra be van írva ✅</div>`}</div></div>
      <div class="card"><h3>Közelgő számonkérések<small><a href="#tests">összes</a></small></h3><div class="list">
        ${tests.filter((x) => x.date >= t).slice(0, 6).map((x) => `<div class="item"><div class="grow"><b>${esc(groupName(x.groupId))}</b> · ${esc(x.kind)}
          <div class="small muted">${esc(x.topic)}</div></div><span class="chip">${relDay(day(x.date))}, ${x.nr}. óra</span></div>`).join("") || `<div class="empty">Nincs bejelentett számonkérés</div>`}</div></div>
      <div class="card"><h3>Kiadott házik határideje<small><a href="#homework">összes</a></small></h3><div class="list">
        ${hwSoon.map((h) => `<div class="item"><div class="grow"><b>${esc(groupName(h.groupId))}</b><div class="small muted clamp">${esc(h.text)}</div></div><span class="chip">${relDay(day(h.due))}</span></div>`).join("") || `<div class="empty">Nincs nyitott házi feladat</div>`}</div></div>
      <div class="card"><h3>Figyelmet igényel<small>átlag 2,0 alatt</small></h3><div class="list">
        ${risk.slice(0, 8).map((s) => `<a class="item linkrow" href="#gradebook/${s.group.id}"><span class="gr ${gcls(s.avg)}">${f2(s.avg)}</span>
          <div class="grow"><b>${esc(s.name)}</b><div class="small muted">${esc(s.group.name)} · ${s.count} jegy</div></div></a>`).join("") || `<div class="empty">Senki nem áll bukásra 👏</div>`}</div></div>
      <div class="card"><h3>Legutóbbi műveletek<small><a href="#log">napló</a></small></h3><div class="list">
        ${log.slice(0, 5).map((r) => `<div class="item"><div class="grow"><b>${esc(r.title)}</b><div class="small muted">${ago(r.ts)}${r.count ? ` · ${r.count} sor` : ""}</div></div>${statusChip(r.status)}</div>`).join("") || `<div class="empty">Még nem küldtél el műveletet</div>`}</div></div>
    </div>`;
}

const addIso = (n) => { const d = addDays(new Date(), n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export const statusChip = (s) => s === "ok" ? `<span class="chip ok">kész</span>` : s === "unverified" ? `<span class="chip warn">ellenőrizd</span>` : `<span class="chip bad">hiba</span>`;

export function lessonRow(l) {
  const g = group(l.groupId), now = new Date(), st = new Date(`${l.date}T${l.start}`), en = new Date(`${l.date}T${l.end}`);
  const state = l.recorded ? `<span class="chip ok">naplózva${l.absent ? ` · ${l.absent} hiányzó` : ""}</span>` : st <= now ? `<span class="chip warn">beírandó</span>` : "";
  return `<div class="item les-row ${st <= now && now < en ? "now" : ""}"><span class="les-nr">${l.nr}.</span>
    <div class="grow"><b>${esc(g?.name || "?")}</b><div class="small muted">${l.start}–${l.end} · ${esc(l.room)} terem${klass(l.classId)?.head ? " · osztályfőnöki" : ""}</div>
      ${l.topic ? `<div class="small">📒 ${esc(l.topic)}</div>` : ""}
      <div class="row wrap" style="gap:4px;margin-top:4px">${state}${l.testId ? `<span class="chip warn">számonkérés</span>` : ""}${l.hwCount ? `<span class="chip">házi határidő</span>` : ""}</div></div>
    <div class="row les-act"><a class="btn sm" href="#lesson/${encodeURIComponent(l.id)}" title="Az óra megnyitása: naplózás, mulasztás, jegyek">Megnyitás ›</a></div></div>`;
}
