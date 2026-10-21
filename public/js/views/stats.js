import { S as ST, subjName, teacherName, numericGrades, absences, lessons, avgOf, bySubject } from "../state.js";
import { esc, f2, f1, median, DAYS, MONTHS, gcls } from "../util.js";
import { bars, line, donut } from "../charts.js";
import { monthlyTrend } from "./dashboard.js";

export function render(root) {
  const gs = numericGrades(), ab = absences();
  if (!gs.length) { root.innerHTML = `<div class="topbar"><h1>Statisztikák</h1></div><div class="card empty">Még nincs elég adat.</div>`; return; }
  const vals = gs.map((g) => g.value);
  const avg = avgOf(gs), plain = vals.reduce((a, b) => a + b, 0) / vals.length;
  const dist = [5, 4, 3, 2, 1].map((v) => ({ label: String(v), value: gs.filter((g) => Math.round(g.value) === v).length, color: `var(--g${v})` }));
  const mode = dist.reduce((a, b) => (b.value > a.value ? b : a));
  const subs = bySubject().filter((s) => s.avg != null).sort((a, b) => b.avg - a.avg);
  const best = subs[0], worst = subs[subs.length - 1];

  // tanárok szerinti átlagok
  const tm = new Map();
  gs.forEach((g) => { if (g.teacher) (tm.get(g.teacher) || tm.set(g.teacher, []).get(g.teacher)).push(g); });
  const teachers = [...tm.entries()].map(([t, l]) => ({ label: teacherName(t), value: avgOf(l), n: l.length })).filter((t) => t.n >= 2).sort((a, b) => b.value - a.value).slice(0, 8);

  // jegyek hónaponként (darab)
  const mc = {};
  gs.forEach((g) => { const k = g.date.getFullYear() * 12 + g.date.getMonth(); mc[k] = (mc[k] || 0) + 1; });
  const months = Object.keys(mc).sort((a, b) => a - b).slice(-10).map((k) => ({ label: MONTHS[k % 12], value: mc[k] }));

  // hét napjai szerinti jegyek
  const wd = [0, 0, 0, 0, 0];
  gs.forEach((g) => { const d = (g.date.getDay() + 6) % 7; if (d < 5) wd[d]++; });

  // hiányzások
  const okN = ab.filter((a) => a.ok).length, naN = ab.filter((a) => a.na).length, badN = ab.length - okN - naN;
  const abM = {};
  ab.forEach((a) => { const k = a.date.getFullYear() * 12 + a.date.getMonth(); abM[k] = (abM[k] || 0) + 1; });
  const abMonths = Object.keys(abM).sort((a, b) => a - b).slice(-10).map((k) => ({ label: MONTHS[k % 12], value: abM[k] }));

  // legjobb sorozat: egymás utáni 4-es vagy 5-ös
  let streak = 0, cur = 0;
  [...gs].reverse().forEach((g) => { cur = g.value >= 4 ? cur + 1 : 0; streak = Math.max(streak, cur); });

  const ls = lessons();
  const perDay = [0, 0, 0, 0, 0];
  ls.filter((l) => !l.off).forEach((l) => { const d = (l.start.getDay() + 6) % 7; if (d < 5) perDay[d]++; });

  root.innerHTML = `
    <div class="topbar"><div><h1>Statisztikák</h1><div class="sub">${gs.length} jegy alapján</div></div></div>
    <div class="grid g4 kp">
      <div class="card kpi"><div class="v">${f2(avg)}</div><div class="l">${ST.prefs.weighted !== false ? "Súlyozott" : "Egyszerű"} átlag</div><div class="d muted">egyszerű: ${f2(plain)}</div></div>
      <div class="card kpi"><div class="v">${f1(median(vals))}</div><div class="l">Medián</div><div class="d muted">leggyakoribb: ${mode.label}-es (${mode.value} db)</div></div>
      <div class="card kpi"><div class="v">${streak}</div><div class="l">Leghosszabb 4–5-ös sorozat</div><div class="d muted">egymás után</div></div>
      <div class="card kpi"><div class="v">${gs.filter((g) => g.value === 5).length}</div><div class="l">Ötösök</div><div class="d up">${Math.round((gs.filter((g) => g.value === 5).length / gs.length) * 100)}%-a az összes jegynek</div></div>
    </div>
    <div class="grid g2" style="margin-top:var(--gap)">
      <div class="card"><h3>Jegyek eloszlása</h3>${donut({ items: dist.map((d) => ({ ...d, label: d.label + "-es" })), center: gs.length })}</div>
      <div class="card"><h3>Átlag alakulása</h3>${line({ points: monthlyTrend(gs), goal: ST.prefs.targetAvg })}</div>
      <div class="card"><h3>Tantárgyak sorrendje</h3>${bars({ horizontal: true, max: 5, fmt: f2, items: subs.map((s) => ({ label: subjName(s.subject), value: s.avg, color: `var(--g${Math.min(5, Math.max(1, Math.round(s.avg)))})` })) })}</div>
      <div class="card"><h3>Tanárok szerinti átlag <small>legalább 2 jegy</small></h3>${teachers.length ? bars({ horizontal: true, max: 5, fmt: f2, items: teachers }) : `<div class="empty">Nincs elég adat</div>`}</div>
      <div class="card"><h3>Jegyek havonta</h3>${bars({ items: months })}</div>
      <div class="card"><h3>Jegyek a hét napjain</h3>${bars({ items: wd.map((v, i) => ({ label: DAYS[i].slice(0, 3), value: v })) })}</div>
      <div class="card"><h3>Mulasztások igazolása</h3>${donut({ items: [{ label: "Igazolt", value: okN, color: "var(--g5)" }, { label: "Igazolatlan", value: badN, color: "var(--g1)" }, { label: "Nem igazolandó", value: naN, color: "var(--muted)" }], center: ab.length })}</div>
      <div class="card"><h3>Mulasztások havonta</h3>${abMonths.length ? bars({ items: abMonths, color: "var(--g2)" }) : `<div class="empty">Nincs mulasztás</div>`}</div>
      <div class="card"><h3>Órák a hét napjain <small>a kiválasztott hét</small></h3>${bars({ items: perDay.map((v, i) => ({ label: DAYS[i].slice(0, 3), value: v })) })}</div>
      <div class="card"><h3>Érdekességek</h3><div class="list">
        <div class="item"><span class="gr ${gcls(best?.avg)}">★</span><div><b>Legjobb tárgy</b><div class="small muted">${esc(subjName(best.subject))} · ${f2(best.avg)}</div></div></div>
        <div class="item"><span class="gr ${gcls(worst?.avg)}">!</span><div><b>Legnagyobb fejlődési lehetőség</b><div class="small muted">${esc(subjName(worst.subject))} · ${f2(worst.avg)}</div></div></div>
        <div class="item"><span class="gr gt">Σ</span><div><b>Súlyozott/egyszerű különbség</b><div class="small muted">${f2(avg - plain)}</div></div></div>
      </div></div>
    </div>`;
}
