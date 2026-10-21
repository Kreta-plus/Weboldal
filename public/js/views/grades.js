import { S as ST, savePrefs, subjName, teacherName, numericGrades, termGrades, avgOf, bySubject } from "../state.js";
import { esc, f2, fmtFull, gcls } from "../util.js";
import { gradeChip } from "./dashboard.js";

let term = "all", q = "", open = new Set();

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

  root.innerHTML = `
    <div class="topbar"><div><h1>Jegyek</h1><div class="sub">${subs.reduce((a, s) => a + s.list.length, 0)} jegy · átlag ${f2(avgOf(subs.flatMap((s) => s.list)))}</div></div>
      <div class="row wrap"><input class="input" id="q" placeholder="Keresés…" value="${esc(q)}" style="width:200px">
      <div class="seg" id="term">${[["all", "Egész év"], ["1", "1. félév"], ["2", "2. félév"]].map(([k, l]) => `<button data-t="${k}" class="${term === k ? "on" : ""}">${l}</button>`).join("")}</div></div></div>
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
          <div class="list">${s.list.map((g) => `<div class="item">${gradeChip(g)}<div class="grow"><b>${esc(g.topic || g.mode || "Érdemjegy")}</b>
            <div class="small muted">${esc(g.mode)} · ${esc(teacherName(g.teacher))}</div></div><span class="small muted">${fmtFull(g.date)}</span></div>`).join("")}</div>
        </div></details>`;
    }).join("") || `<div class="card empty">Nincs a szűrésnek megfelelő jegy</div>`}</div>`;

  root.querySelector("#q").oninput = (e) => { q = e.target.value.toLowerCase(); const p = e.target.selectionStart; render(root); const n = root.querySelector("#q"); n.focus(); n.setSelectionRange(p, p); };
  root.querySelectorAll("#term button").forEach((b) => (b.onclick = () => { term = b.dataset.t; render(root); }));
  root.querySelectorAll("details.subj").forEach((d) => d.addEventListener("toggle", () => (d.open ? open.add(d.dataset.s) : open.delete(d.dataset.s))));
  root.querySelectorAll("input.goal").forEach((i) => {
    i.onclick = (e) => e.stopPropagation();
    i.onchange = () => { savePrefs({ subjectGoals: { ...goals, [i.dataset.s]: parseFloat(i.value) || target0 } }); render(root); };
  });
}
const subjNameLower = (s) => subjName(s);
