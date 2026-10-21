import { S as ST, subjName, teacherName, shownName, grades, numericGrades, lessons, homework, tests, absences, avgOf, bySubject } from "../state.js";
import { esc, f2, gcls, fmtDate, fmtTime, relDay, d0, sameDay, subjColor, MONTHS } from "../util.js";
import { line, bars } from "../charts.js";

export const gradeChip = (g) => `<span class="gr ${gcls(g.value)} ${g.weight !== 1 ? "w" : ""}" title="${esc(subjName(g.subject))} · ${esc(g.topic || g.mode)} · ${fmtDate(g.date)}${g.weight !== 1 ? ` · súly ${Math.round(g.weight * 100)}%` : ""}">${g.value ?? "·"}${g.weight !== 1 ? `<sup>${Math.round(g.weight * 100)}</sup>` : ""}</span>`;

export function monthlyTrend(list) {
  // kumulált átlag hónapról hónapra
  const sorted = [...list].sort((a, b) => a.date - b.date);
  const pts = [];
  let acc = [];
  let cur = null;
  for (const g of sorted) {
    const key = g.date.getFullYear() * 12 + g.date.getMonth();
    if (cur !== null && key !== cur) pts.push({ label: MONTHS[Math.floor(cur % 12)], value: avgOf(acc) });
    cur = key; acc.push(g);
  }
  if (acc.length) pts.push({ label: MONTHS[cur % 12], value: avgOf(acc) });
  return pts;
}

export function render(root) {
  const gs = numericGrades(), ls = lessons(), hw = homework(), ts = tests(), ab = absences();
  const now = new Date(), today = d0(now);
  const widgets = new Set(ST.prefs.widgets);
  const avg = avgOf(gs), target = ST.prefs.targetAvg || 4.5;
  const recent = gs.slice(0, 8);
  const last30 = gs.filter((g) => now - g.date < 30 * 864e5);
  const prev = gs.filter((g) => g.date < now - 30 * 864e5);
  const avgPrev = avgOf(prev);
  const delta = avg != null && avgPrev != null && last30.length ? avg - avgPrev : null;
  const todayL = ls.filter((l) => sameDay(l.start, now));
  const nextL = ls.find((l) => l.end > now && !l.off);
  const hwOpen = hw.filter((h) => !h.done && h.due >= today);
  const testsNext = ts.filter((t) => t.date >= today).slice(0, 5);
  const unexc = ab.filter((a) => !a.ok && !a.na).length;
  const hours = new Date().getHours();
  const hello = hours < 5 ? "Még ébren?" : hours < 11 ? "Jó reggelt" : hours < 18 ? "Szia" : "Jó estét";
  const trend = monthlyTrend(gs);
  const subs = bySubject().filter((s) => s.avg != null).sort((a, b) => b.avg - a.avg);

  const kpis = widgets.has("avg") ? `
    <div class="grid g4 kp">
      <div class="card kpi"><div class="v">${f2(avg)}</div><div class="l">Összátlag</div>
        <div class="d ${delta == null ? "muted" : delta >= 0 ? "up" : "down"}">${delta == null ? `cél: ${f2(target)}` : `${delta >= 0 ? "▲" : "▼"} ${f2(Math.abs(delta))} az elmúlt 30 napban`}</div></div>
      <div class="card kpi"><div class="v">${gs.length}</div><div class="l">Érdemjegy</div><div class="d muted">${last30.length} az elmúlt 30 napban</div></div>
      <div class="card kpi"><div class="v">${ab.length}</div><div class="l">Mulasztás</div><div class="d ${unexc ? "down" : "up"}">${unexc ? `${unexc} igazolatlan` : "minden igazolt"}</div></div>
      <div class="card kpi"><div class="v">${hwOpen.length}</div><div class="l">Nyitott házi</div><div class="d muted">${testsNext.length} közelgő számonkérés</div></div>
    </div>` : "";

  const cards = [];
  if (widgets.has("next")) cards.push(`<div class="card"><h3>Mai órák <small>${todayL.length ? todayL.length + " óra" : ""}</small></h3>
    ${todayL.length ? `<div class="list">${todayL.map((l) => `
      <div class="item" style="${l.end < now ? "opacity:.5" : ""}${nextL && nextL.id === l.id ? ";border-color:var(--accent)" : ""}">
        <span class="dot" style="background:${subjColor(l.subject)}"></span>
        <div class="grow"><b class="${l.off ? "muted" : ""}" style="${l.off ? "text-decoration:line-through" : ""}">${esc(subjName(l.subject))}</b>
          <div class="small muted">${fmtTime(l.start)}–${fmtTime(l.end)} · ${esc(l.room || "—")} · ${esc(teacherName(l.sub || l.teacher))}${l.sub ? " (helyettes)" : ""}</div></div>
        ${l.test ? `<span class="chip warn">dolgozat</span>` : ""}
      </div>`).join("")}</div>` : `<div class="empty">Ma nincs óra az órarendben 🎉</div>`}</div>`);

  if (widgets.has("grades")) cards.push(`<div class="card"><h3>Friss jegyek <small><a href="#grades">Mind</a></small></h3>
    ${recent.length ? `<div class="list">${recent.map((g) => `
      <div class="item">${gradeChip(g)}<div class="grow"><b>${esc(subjName(g.subject))}</b>
      <div class="small muted">${esc(g.topic || g.mode || "—")} · ${esc(teacherName(g.teacher))}</div></div><span class="small muted">${fmtDate(g.date)}</span></div>`).join("")}</div>` : `<div class="empty">Még nincs jegy</div>`}</div>`);

  if (widgets.has("homework")) cards.push(`<div class="card"><h3>Házi feladatok <small><a href="#homework">Mind</a></small></h3>
    ${hwOpen.length ? `<div class="list">${hwOpen.slice(0, 6).map((h) => `
      <div class="item"><span class="dot" style="background:${subjColor(h.subject)}"></span><div class="grow"><b>${esc(subjName(h.subject))}</b>
      <div class="small muted" style="overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${esc(h.text.replace(/<[^>]+>/g, " "))}</div></div>
      <span class="chip ${h.due - today < 864e5 * 1.5 ? "warn" : ""}">${relDay(h.due)}</span></div>`).join("")}</div>` : `<div class="empty">Nincs függő házi 🙌</div>`}</div>`);

  if (widgets.has("tests")) cards.push(`<div class="card"><h3>Számonkérések</h3>
    ${testsNext.length ? `<div class="list">${testsNext.map((t) => `
      <div class="item"><span class="dot" style="background:${subjColor(t.subject)}"></span><div class="grow"><b>${esc(subjName(t.subject))}</b>
      <div class="small muted">${esc(t.kind || "számonkérés")}${t.topic ? " · " + esc(t.topic) : ""}</div></div><span class="chip warn">${relDay(t.date)}</span></div>`).join("")}</div>` : `<div class="empty">Nincs bejelentett számonkérés</div>`}</div>`);

  if (widgets.has("trend")) cards.push(`<div class="card span2"><h3>Átlag alakulása <small>cél: ${f2(target)}</small></h3>${line({ points: trend, goal: target })}</div>`);

  if (widgets.has("subjects")) cards.push(`<div class="card"><h3>Tantárgyi átlagok</h3>${bars({ horizontal: true, items: subs.map((s) => ({ label: subjName(s.subject), value: s.avg, color: `var(--g${Math.min(5, Math.max(1, Math.round(s.avg)))})` })), max: 5, fmt: f2 })}</div>`);

  if (widgets.has("absences")) {
    const bySub = {};
    ab.forEach((a) => (bySub[a.subject] = (bySub[a.subject] || 0) + 1));
    const top = Object.entries(bySub).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([k, v]) => ({ label: subjName(k), value: v }));
    cards.push(`<div class="card"><h3>Hiányzások tantárgyanként</h3>${top.length ? bars({ horizontal: true, items: top }) : `<div class="empty">Nincs hiányzás 👏</div>`}</div>`);
  }

  root.innerHTML = `
    <div class="topbar"><div><h1>${hello}, ${esc(shownName())}! ${esc(ST.prefs.emoji || "")}</h1>
      <div class="sub">${new Intl.DateTimeFormat("hu-HU", { weekday: "long", month: "long", day: "numeric" }).format(now)}${nextL ? ` · következő óra: <b>${esc(subjName(nextL.subject))}</b> ${fmtTime(nextL.start)}` : ""}</div></div></div>
    <div class="grid" style="gap:var(--gap)">${kpis}<div class="grid g3">${cards.join("") || `<div class="card empty span2">Minden widget ki van kapcsolva. Beállítások → Kezdőlap.</div>`}</div></div>`;
}
