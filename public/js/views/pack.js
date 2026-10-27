import { S as ST, subjName, allSubjects, loadWeek, savePrefs, homework, fillTestLessons } from "../state.js";
import { esc, normLessons, mondayOf, addDays, d0, sameDay, iso, fmtTime, DAYS, subjColor } from "../util.js";


// Az adott napra esedékes házik egy tantárgyból: KRÉTA-s és saját (manuális) is.
const norm = (x) => String(x || "").trim().toLowerCase();
function hwFor(subject, day) {
  const k = norm(subject);
  const kreta = homework().filter((h) => !h.done && sameDay(h.due, day) && norm(h.subject) === k).map((h) => ({ text: h.text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(), own: !!h.own }));
  return kreta.filter((h) => h.text);
}

const commonGear = () => ST.prefs.packAll || [];
const ownGear = (subject) => ST.prefs.packItems?.[subject] || [];
const gearOf = (subject) => [...commonGear(), ...ownGear(subject).filter((x) => !commonGear().some((c) => c.toLowerCase() === x.toLowerCase()))];

// Következő nap óráinak meghatározása. Visszaad: { day, lessons, fake, note }
async function nextDay() {
  const tomorrow = addDays(d0(new Date()), 1);
  const lessonsOn = async (d) => {
    const res = await loadWeek(mondayOf(d));
    return fillTestLessons(normLessons(res.data), mondayOf(d)).filter((l) => sameDay(l.start, d) && !l.off);
  };
  const first = await lessonsOn(tomorrow);
  if (first.length) return { day: tomorrow, lessons: first };
  if (ST.prefs.devMode && ST.prefs.devFillLessons) return { day: tomorrow, lessons: randomLessons(tomorrow), fake: true };
  // nincs óra holnap (pl. hétvége): a következő tanítási nap
  for (let i = 2; i <= 14; i++) {
    const d = addDays(tomorrow, i - 1);
    const ls = await lessonsOn(d);
    if (ls.length) return { day: d, lessons: ls, note: "Holnap nincs óra, a következő tanítási nap:" };
  }
  return { day: tomorrow, lessons: [], note: "Holnap nincs óra." };
}

function randomLessons(day) {
  const pool = allSubjects();
  const withGear = pool.filter((s) => ownGear(s).length);
  const src = (withGear.length >= 3 ? withGear : pool).slice();
  const n = Math.min(src.length, 5 + Math.floor(Math.random() * 3));
  const out = [];
  for (let i = 0; i < n; i++) {
    const subject = src.splice(Math.floor(Math.random() * src.length), 1)[0];
    const start = new Date(day); start.setHours(8, 0, 0, 0); start.setMinutes(i * 55);
    const end = new Date(start.getTime() + 45 * 60000);
    out.push({ id: "fake" + i, subject, start, end, nr: i + 1, room: "", teacher: "", off: false });
  }
  return out;
}

function summary(lessons) {
  const all = new Map();
  for (const g of commonGear()) all.set(g.toLowerCase(), { name: g, n: 1 });
  for (const l of lessons) for (const g of ownGear(l.subject)) {
    const k = g.toLowerCase();
    if (all.has(k) && !commonGear().some((c) => c.toLowerCase() === k)) all.get(k).n++;
    else if (!all.has(k)) all.set(k, { name: g, n: 1 });
  }
  return [...all.values()];
}

const LAYOUTS = [["list", "Lista"], ["grid", "Rács"], ["strip", "Idősáv"], ["check", "Csak lista"]];

async function showFullscreen() {
  const ov = document.createElement("div");
  ov.className = "pk-full";
  ov.innerHTML = `<div class="pk-body"><div class="muted">Betöltés…</div></div>`;
  document.body.appendChild(ov);
  try { await ov.requestFullscreen?.(); } catch {}
  const checked = new Set();
  let closed = false, onResize = () => {};
  const close = () => { if (closed) return; closed = true; ov.remove(); document.removeEventListener("keydown", onKey); window.removeEventListener("resize", onResize); };
  const onKey = (e) => { if (e.key === "Escape" && !document.fullscreenElement) close(); };
  document.addEventListener("keydown", onKey);
  ov.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement) close(); });
  let r;
  try { r = await nextDay(); } catch (e) { ov.querySelector(".pk-body").innerHTML = `<div>${esc(e.message)}</div><button class="btn" id="pkx">✕ Bezár</button>`; ov.querySelector("#pkx").onclick = () => { document.fullscreenElement && document.exitFullscreen(); close(); }; return; }

  const chip = (key, label) => `<label class="chip pk-chk"><input type="checkbox" data-k="${esc(key)}" ${checked.has(key) ? "checked" : ""}> ${esc(label)}</label>`;
  const gearChips = (l) => { const g = gearOf(l.subject); return g.length ? g.map((x) => chip(l.id + "|" + x, x)).join("") : `<span class="small muted">nincs felszerelés megadva</span>`; };
  const head = (l) => `<span class="dot" style="background:${subjColor(l.subject)}"></span><b>${l.nr ? l.nr + ". " : ""}${esc(subjName(l.subject))}</b><span class="muted">${fmtTime(l.start)}${l.room ? " · " + esc(l.room) : ""}</span>`;
  const hwBox = (l) => { const h = hwFor(l.subject, r.day); return h.length ? `<div class="pk-hw">${h.map((x) => `<div>📝 ${esc(x.text)}${x.own ? ` <span class="small muted">(saját)</span>` : ""}</div>`).join("")}</div>` : ""; };
  const lessonCard = (l) => `<div class="pk-les"><div class="pk-h">${head(l)}</div>${hwBox(l)}<div class="chips">${gearChips(l)}</div></div>`;
  const sumBox = () => { const sum = summary(r.lessons); return `<div class="pk-sum"><h3>Összesen be kell pakolni</h3>${sum.length ? sum.map((g) => chip("sum|" + g.name, g.name + (g.n > 1 ? ` ×${g.n}` : ""))).join("") : `<div class="small muted">Nincs felszerelés megadva</div>`}</div>`; };

  const bodies = {
    list: () => `<div class="pk-cols"><div class="pk-list">${r.lessons.map(lessonCard).join("") || `<div class="empty">Nincs óra</div>`}</div>${sumBox()}</div>`,
    grid: () => `<div class="pk-grid">${r.lessons.map(lessonCard).join("") || `<div class="empty">Nincs óra</div>`}</div><div style="margin-top:3vmin">${sumBox()}</div>`,
    strip: () => `<div class="pk-strip">${r.lessons.map((l) => `<div class="pk-col"><div class="pk-time">${fmtTime(l.start)}</div><div class="pk-h">${head(l).replace(/<span class="muted">.*?<\/span>/, "")}</div>${hwBox(l)}<div class="pk-items">${gearOf(l.subject).map((x) => chip(l.id + "|" + x, x)).join("") || `<span class="small muted">–</span>`}</div></div>`).join("") || `<div class="empty">Nincs óra</div>`}</div>`,
    check: () => { const hs = r.lessons.filter((l) => hwFor(l.subject, r.day).length); return `<div class="pk-big ${hs.length ? "two" : ""}">${sumBox()}${hs.length ? `<div class="pk-sum"><h3>Házik</h3>${hs.map((l) => `<div><b>${esc(subjName(l.subject))}</b>${hwBox(l)}</div>`).join("")}</div>` : ""}</div>`; },
  };

  // a legnagyobb betűméret, amivel minden elfér görgetés nélkül
  const fit = () => {
    let px = Math.min(40, Math.max(12, innerHeight / 22));
    do { ov.style.setProperty("--pkfs", px + "px"); px -= 1; }
    while (px >= 7 && (ov.scrollHeight > ov.clientHeight + 1 || ov.scrollWidth > ov.clientWidth + 1));
  };
  onResize = () => fit();
  window.addEventListener("resize", onResize);
  const paint = () => {
    const lay = ST.prefs.packLayout || "list";
    ov.querySelector(".pk-body").innerHTML = `<div class="pk-top"><div><h1>🎒 ${DAYS[(r.day.getDay() + 6) % 7]}</h1><div class="muted">${esc(r.note || "Holnapi órák")}${r.fake ? " · <b>véletlen órák (developer)</b>" : ""}</div></div>
      <div class="row"><div class="seg" id="pklay">${LAYOUTS.map(([k, l]) => `<button data-v="${k}" class="${lay === k ? "on" : ""}">${l}</button>`).join("")}</div><button class="btn" id="pkx">✕ Bezár</button></div></div>${(bodies[lay] || bodies.list)()}`;
    ov.querySelectorAll("#pklay button").forEach((b) => (b.onclick = () => { savePrefs({ packLayout: b.dataset.v }); paint(); }));
    ov.querySelectorAll("input[data-k]").forEach((c) => (c.onchange = () => { c.checked ? checked.add(c.dataset.k) : checked.delete(c.dataset.k); }));
    fit();
    ov.querySelector("#pkx").onclick = () => { document.fullscreenElement && document.exitFullscreen(); close(); };
  };
  paint();
}

export function render(root) {
  const subs = allSubjects();
  const items = ST.prefs.packItems || {};
  const common = ST.prefs.packAll || [];
  const setCommon = (list) => { savePrefs({ packAll: list }); render(root); };
  const set = (subject, list) => {
    const next = { ...(ST.prefs.packItems || {}) };
    list.length ? (next[subject] = list) : delete next[subject];
    savePrefs({ packItems: next });
    render(root);
  };
  root.innerHTML = `<div class="topbar"><div><h1>Táska</h1><div class="sub">Add meg tantárgyanként, mit kell vinni – a holnapi órákhoz kiírja.</div></div>
    <button class="btn primary" id="go">⛶ Holnapi táska teljes képernyőn</button></div>
    <div class="card" style="margin-bottom:14px"><div class="row"><b class="grow">🎒 Minden órához</b><span class="small muted">minden tantárgynál megjelenik</span></div>
      <div class="chips" style="margin:10px 0">${common.map((x, i) => `<span class="chip">${esc(x)} <a href="#" class="rmc" data-i="${i}" style="text-decoration:none">✕</a></span>`).join("") || `<span class="small muted">Még nincs (pl. tolltartó, füzet, tízórai)</span>`}</div>
      <form class="row" id="addc"><input class="input grow" placeholder="pl. tolltartó, toll…" maxlength="60"><button class="btn sm">+</button></form></div>
    <div class="grid g3 pk-subs">${subs.map((s) => `<div class="card"><div class="row"><span class="dot" style="background:${subjColor(s)}"></span><b class="grow">${esc(subjName(s))}</b></div>
      <div class="chips" style="margin:10px 0">${(items[s] || []).map((x, i) => `<span class="chip">${esc(x)} <a href="#" class="rm" data-s="${esc(s)}" data-i="${i}" style="text-decoration:none">✕</a></span>`).join("") || `<span class="small muted">Még nincs felszerelés</span>`}</div>
      <form class="row add" data-s="${esc(s)}"><input class="input grow" placeholder="pl. füzet, könyv…" maxlength="60"><button class="btn sm">+</button></form></div>`).join("") || `<div class="card empty span2">Még nincs betöltött tantárgy – frissíts a Kezdőlapon.</div>`}</div>`;
  root.querySelector("#go").onclick = showFullscreen;
  root.querySelector("#addc").onsubmit = (e) => {
    e.preventDefault();
    const v = e.target.querySelector("input").value.split(",").map((x) => x.trim()).filter(Boolean);
    if (v.length) setCommon([...common, ...v]);
  };
  root.querySelectorAll(".rmc").forEach((a) => (a.onclick = (e) => { e.preventDefault(); setCommon(common.filter((_, i) => i !== +a.dataset.i)); }));
  root.querySelectorAll(".add").forEach((f) => (f.onsubmit = (e) => {
    e.preventDefault();
    const v = f.querySelector("input").value.split(",").map((x) => x.trim()).filter(Boolean);
    if (v.length) set(f.dataset.s, [...(items[f.dataset.s] || []), ...v]);
  }));
  root.querySelectorAll(".rm").forEach((a) => (a.onclick = (e) => {
    e.preventDefault();
    set(a.dataset.s, (items[a.dataset.s] || []).filter((_, i) => i !== +a.dataset.i));
  }));
}
