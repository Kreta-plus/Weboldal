import { S as ST, savePrefs, subjName, teacherName, numericGrades, termGrades, avgOf, bySubject } from "../state.js";
import { esc, f2, fmtFull, gcls, toast } from "../util.js";
import { gradeChip } from "./dashboard.js";

let term = "all", q = "", open = new Set();
let sim = [];          // kipróbálós (még nem létező) jegyek: { id, subject, value, weight } – nem mentődnek
let calcOpen = false;
const WEIGHTS = [50, 100, 150, 200, 300];
const simOf = (subject) => sim.filter((x) => x.subject === subject).map((x) => ({ value: x.value, weight: x.weight / 100 }));
const diff = (a, b) => (a == null || b == null ? "" : `<span class="${b - a >= 0.005 ? "up" : b - a <= -0.005 ? "down" : "muted"}">${b - a >= 0 ? "▲" : "▼"} ${f2(Math.abs(b - a))}</span>`);
const simForm = (subject, subs) => `<div class="row wrap simform" data-s="${esc(subject || "")}">
  ${subject == null ? `<select class="input sf-s" style="width:auto;flex:2 1 160px">${subs.map((x) => `<option value="${esc(x.subject)}">${esc(subjName(x.subject))}</option>`).join("")}</select>` : ""}
  <select class="input sf-v" style="width:auto;flex:1 1 70px" title="Jegy">${[5, 4, 3, 2, 1].map((v) => `<option>${v}</option>`).join("")}</select>
  <input class="input sf-w" type="number" min="10" max="500" step="10" value="100" list="wl" style="width:auto;flex:1 1 90px" title="Súlyozás (%)">
  <button class="btn sm primary sf-add">+ Kipróbál</button></div>`;
const simChips = (list, subs) => list.map((x) => `<span class="chip">${subs ? esc(subjName(x.subject)) + " · " : ""}<b>${x.value}</b> · ${x.weight}% <a href="#" class="simrm" data-id="${x.id}" style="text-decoration:none">✕</a></span>`).join("");

function needed(list, target) {
  const w = ST.prefs.weighted !== false;
  const W = list.reduce((a, g) => a + (w ? g.weight : 1), 0), Ssum = list.reduce((a, g) => a + g.value * (w ? g.weight : 1), 0);
  if (W && Ssum / W >= target) return { ok: true };
  const out = {};
  for (const x of [5, 4]) {
    if (x <= target) continue;
    out[x] = Math.ceil((target * W - Ssum) / (x - target));
  }
  return { ok: false, out };
}

const inTerm = (g) => {
  if (term === "all") return true;
  const m = g.date.getMonth();
  const first = m >= 8 || m === 0; // szept–jan
  return term === "1" ? first : !first;
};

export function render(root) {
  const goals = ST.prefs.subjectGoals || {};
  const target0 = ST.prefs.targetAvg || 4.5;
  const subs = bySubject().map((s) => ({ ...s, list: s.list.filter(inTerm).filter((g) => !q || (g.topic + g.subject + subjNameLower(g.subject)).toLowerCase().includes(q)) }))
    .filter((s) => s.list.length).map((s) => ({ ...s, avg: avgOf(s.list) }));
  const terms = termGrades();
  const allList = subs.flatMap((s) => s.list);
  const simSubs = subs.map((s) => ({ subject: s.subject, now: s.avg, next: avgOf([...s.list, ...simOf(s.subject)]) }));
  const meanOf = (k) => { const v = simSubs.map((x) => x[k]).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const totNow = avgOf(allList), totNext = avgOf([...allList, ...sim.filter((x) => subs.some((s) => s.subject === x.subject)).map((x) => ({ value: x.value, weight: x.weight / 100 }))]);
  const calc = `<details class="card" id="calc" style="margin-bottom:var(--gap)" ${calcOpen ? "open" : ""}><summary style="cursor:pointer;font-weight:700">🧮 Jegyszámoló <span class="small muted" style="font-weight:500">– mi lenne az átlag, ha…</span></summary>
    <div class="grid" style="gap:12px;margin-top:12px">
      <datalist id="wl">${WEIGHTS.map((w) => `<option value="${w}">`).join("")}</datalist>
      ${simForm(null, subs)}
      <div class="chips">${simChips(sim, true) || `<span class="small muted">Válassz tantárgyat, jegyet és súlyozást (%), majd kattints a Kipróbálra. Tantárgyanként is kipróbálhatsz jegyet lent.</span>`}</div>
      ${sim.length ? `<div class="grid g2" style="gap:10px">
        <div class="item"><div class="grow"><div class="small muted">Összes jegy átlaga</div><b>${f2(totNow)} → ${f2(totNext)}</b></div>${diff(totNow, totNext)}</div>
        <div class="item"><div class="grow"><div class="small muted">Tantárgyi átlagok átlaga</div><b>${f2(meanOf("now"))} → ${f2(meanOf("next"))}</b></div>${diff(meanOf("now"), meanOf("next"))}</div>
      </div>
      <div class="list">${simSubs.filter((x) => sim.some((y) => y.subject === x.subject)).map((x) => `<div class="item"><b class="grow">${esc(subjName(x.subject))}</b><span>${f2(x.now)} → <b>${f2(x.next)}</b></span>${diff(x.now, x.next)}</div>`).join("")}</div>
      <div><button class="btn sm danger" id="simclr">Összes kipróbált jegy törlése</button></div>` : ""}
    </div></details>`;

  root.innerHTML = `
    <div class="topbar"><div><h1>Jegyek</h1><div class="sub">${subs.reduce((a, s) => a + s.list.length, 0)} jegy · átlag ${f2(avgOf(subs.flatMap((s) => s.list)))}</div></div>
      <div class="row wrap"><input class="input" id="q" placeholder="Keresés…" value="${esc(q)}" style="width:200px">
      <div class="seg" id="term">${[["all", "Egész év"], ["1", "1. félév"], ["2", "2. félév"]].map(([k, l]) => `<button data-t="${k}" class="${term === k ? "on" : ""}">${l}</button>`).join("")}</div></div></div>
    ${calc}
    ${terms.length ? `<div class="card" style="margin-bottom:var(--gap)"><h3>Félévi és év végi jegyek</h3><div class="row wrap">${terms.map((g) => `
      <div class="item"><span class="gr ${gcls(g.value)} term">${g.value ?? "·"}</span><div><b>${esc(subjName(g.subject))}</b><div class="small muted">${esc(g.mode || g.type)}</div></div></div>`).join("")}</div></div>` : ""}
    <div class="grid" style="gap:12px">${subs.map((s) => {
      const target = goals[s.subject] || target0;
      const n = needed(s.list, target);
      const trendUp = s.list.length >= 4 ? avgOf(s.list.slice(0, 3)) - avgOf(s.list.slice(3)) : 0;
      return `<details class="card subj" data-s="${esc(s.subject)}" ${open.has(s.subject) ? "open" : ""}>
        <summary><span class="gr ${gcls(s.avg)}" style="min-width:56px">${f2(s.avg)}</span>
          <div class="grow"><b>${esc(subjName(s.subject))}</b><div class="small muted">${s.list.length} jegy${trendUp ? ` · <span class="${trendUp > 0 ? "up" : "down"}">${trendUp > 0 ? "▲ javuló" : "▼ romló"}</span>` : ""}</div></div>
          <div class="chips">${s.list.slice(0, 8).map(gradeChip).join("")}</div></summary>
        <div class="body">
          <div class="row wrap spread"><div class="small muted">Cél ennél a tárgynál:
            <input type="number" class="input goal" min="1" max="5" step="0.1" value="${target}" data-s="${esc(s.subject)}" style="width:80px;display:inline-block;padding:4px 8px"></div>
            <div>${n.ok ? `<span class="chip ok">✓ a cél teljesítve</span>` : Object.entries(n.out).map(([x, c]) => `<span class="chip warn">${c} db ${x}-ös kell</span>`).join(" ")}</div></div>
          <div class="small muted" style="margin-top:4px">Jegy kipróbálása ennél a tárgynál:</div>${simForm(s.subject)}
          ${simOf(s.subject).length ? `<div class="chips">${simChips(sim.filter((x) => x.subject === s.subject))}<button class="btn sm danger simclr-s" data-s="${esc(s.subject)}">Kipróbált jegyek törlése</button></div>
            <div class="item"><div class="grow small muted">Új átlag ennél a tárgynál</div><b>${f2(s.avg)} → ${f2(avgOf([...s.list, ...simOf(s.subject)]))}</b>${diff(s.avg, avgOf([...s.list, ...simOf(s.subject)]))}</div>` : ""}
          <div class="list">${s.list.map((g) => `<div class="item">${gradeChip(g)}<div class="grow"><b>${esc(g.topic || g.mode || "Érdemjegy")}</b>
            <div class="small muted">${esc(g.mode)} · ${esc(teacherName(g.teacher))}</div></div><span class="small muted">${fmtFull(g.date)}</span></div>`).join("")}</div>
        </div></details>`;
    }).join("") || `<div class="card empty">Nincs a szűrésnek megfelelő jegy</div>`}</div>`;

  root.querySelector("#calc").addEventListener("toggle", (e) => (calcOpen = e.target.open));
  root.querySelectorAll(".simform").forEach((f) => (f.querySelector(".sf-add").onclick = (e) => {
    e.preventDefault(); e.stopPropagation();
    const subject = f.dataset.s || f.querySelector(".sf-s")?.value;
    const weight = parseFloat(f.querySelector(".sf-w").value);
    if (!subject) return toast("Nincs tantárgy");
    if (!(weight >= 10 && weight <= 500)) return toast("A súlyozás 10 és 500% közötti legyen");
    sim.push({ id: Date.now() + Math.random(), subject, value: +f.querySelector(".sf-v").value, weight });
    if (!f.dataset.s) calcOpen = true; else open.add(subject);
    render(root);
  }));
  root.querySelectorAll(".simrm").forEach((a) => (a.onclick = (e) => { e.preventDefault(); e.stopPropagation(); sim = sim.filter((x) => String(x.id) !== a.dataset.id); render(root); }));
  root.querySelectorAll(".simclr-s").forEach((b) => (b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); sim = sim.filter((x) => x.subject !== b.dataset.s); render(root); }));
  root.querySelector("#simclr")?.addEventListener("click", () => { sim = []; render(root); });
  root.querySelector("#q").oninput = (e) => { q = e.target.value.toLowerCase(); const p = e.target.selectionStart; render(root); const n = root.querySelector("#q"); n.focus(); n.setSelectionRange(p, p); };
  root.querySelectorAll("#term button").forEach((b) => (b.onclick = () => { term = b.dataset.t; render(root); }));
  root.querySelectorAll("details.subj").forEach((d) => d.addEventListener("toggle", () => (d.open ? open.add(d.dataset.s) : open.delete(d.dataset.s))));
  root.querySelectorAll("input.goal").forEach((i) => {
    i.onclick = (e) => e.stopPropagation();
    i.onchange = () => { savePrefs({ subjectGoals: { ...goals, [i.dataset.s]: parseFloat(i.value) || target0 } }); render(root); };
  });
}
const subjNameLower = (s) => subjName(s);
