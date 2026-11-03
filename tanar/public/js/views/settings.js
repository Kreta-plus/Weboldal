import { post } from "../api.js";
import { S, PALETTES, savePrefs } from "../state.js";
import { esc } from "../util.js";

const SWATCHES = ["#ffe14d", "#e8c468", "#ff9f43", "#ff7a59", "#ff4d4d", "#ff5fa2", "#ff3df0", "#b79cff",
  "#8a7dff", "#3d5cff", "#5cc8ff", "#88c0d0", "#00d1c1", "#45e3a0", "#c6f25c", "#ffffff"];
const SECTIONS = [["look", "Megjelenés", "🎨"], ["general", "Általános", "🏠"], ["kreta", "KRÉTA-kapcsolat", "🔌"], ["account", "Fiók", "🔐"]];
const OPS = [["lesson.log", "Óra naplózása (téma + mulasztás egyszerre)"], ["grade.add", "Jegybeírás (egyenként és egész osztálynak)"], ["grade.edit", "Jegy módosítása"], ["grade.delete", "Jegy törlése"],
  ["absence.record", "Mulasztások rögzítése"], ["homework.add", "Házi feladat kiadása"], ["homework.delete", "Házi feladat törlése"],
  ["test.add", "Számonkérés bejelentése"], ["test.delete", "Számonkérés törlése"], ["lesson.topic", "Haladási napló (óra témája)"],
  ["note.add", "Feljegyzés, dicséret, figyelmeztetés"], ["note.delete", "Feljegyzés törlése"]];
const START = [["dashboard", "Kezdőlap"], ["timetable", "Órarend"], ["gradebook", "Jegyek"], ["attendance", "Mulasztás"], ["journal", "Haladási napló"], ["classes", "Osztályok"], ["notes", "Feljegyzések"]];
let section = "look";

const row = (title, desc, ctrl, wide = false) => `<div class="set-row ${wide ? "wide" : ""}"><div class="set-l"><b>${title}</b>${desc ? `<div class="small muted">${desc}</div>` : ""}</div><div class="set-c">${ctrl}</div></div>`;
const sec = (k, title, body) => `<section class="set-sec" data-sec="${k}" ${section === k ? "" : "hidden"}><h3>${title}</h3>${body}</section>`;

export function render(root) {
  const p = S.prefs, pal = PALETTES[p.palette] ? p.palette : "desk", lightPv = document.documentElement.dataset.theme === "light", caps = new Set(S.ov.capabilities);
  root.innerHTML = `<div class="topbar"><div><h1>Beállítások</h1></div></div>
    <div class="settings"><nav class="set-nav" aria-label="Beállítások témakörei">${SECTIONS.map(([k, l, ic]) => `<button data-sec="${k}" class="${section === k ? "on" : ""}"><span aria-hidden="true">${ic}</span>${l}</button>`).join("")}</nav>
    <div class="card">
    ${sec("look", "Megjelenés", `
      ${row("Mód", "", `<div class="seg" id="th">${[["dark", "Sötét"], ["amoled", "AMOLED"], ["light", "Világos"], ["auto", "Rendszer"]].map(([k, l]) => `<button data-v="${k}" class="${p.theme === k ? "on" : ""}">${l}</button>`).join("")}</div>`)}
      ${row("Színtéma", "A háttér és a kártyák színe.", `<div class="pal-grid">${Object.entries(PALETTES).map(([k, [l, dbg, dsf, lbg, lsf]]) => `<button class="pal ${pal === k ? "on" : ""}" data-p="${k}" aria-pressed="${pal === k}"><span class="pal-pv" style="background:${lightPv ? lbg : dbg}"><i style="background:${lightPv ? lsf : dsf}"></i><i></i></span>${l}</button>`).join("")}</div>`, true)}
      ${row("Kiemelő szín", "Gombok, aktív menüpont és kiemelések színe.", `<div class="row wrap">${SWATCHES.map((c) => `<button class="btn sm sw" data-c="${c}" title="${c}" style="background:${c};width:30px;height:30px;padding:0;border-radius:50%;box-shadow:inset 0 0 0 1px var(--border);${p.accent === c ? "outline:3px solid var(--text);outline-offset:2px" : ""}"></button>`).join("")}</div>`, true)}
      ${row("Lekerekítés", "", `<input type="range" id="rd" min="0" max="28" value="${p.radius}">`)}
      ${row("Betűméret", "", `<input type="range" id="fs" min="0.85" max="1.3" step="0.05" value="${p.fontScale}">`)}`)}
    ${sec("general", "Általános", `
      ${row("Kezdőoldal", "Ez nyílik meg belépés után.", `<select class="input" id="sv">${START.map(([k, l]) => `<option value="${k}" ${p.startView === k ? "selected" : ""}>${l}</option>`).join("")}</select>`)}`)}
    ${sec("kreta", "KRÉTA-kapcsolat", `
      ${row("Állapot", S.ov.demo ? "Teszt fiókkal vagy belépve: a generált iskola adatait látod, minden írás csak szimulált." : `Valódi KRÉTA-fiók${S.ov.teacher.school ? ": " + esc(S.ov.teacher.school) : ""}. Nem hivatalos kapcsolat, a tanári API leírása nyílt forráskódú projektekből származik.`, `<span class="chip ${S.ov.demo ? "" : "ok"}">${S.ov.demo ? "🧪 teszt fiók" : "KRÉTA"}</span>`)}
      ${S.ov.demo ? "" : row("Éles írás", "A KRÉTA-ba csak az a művelet ír, amelyik a szerveren be van kapcsolva: <code>KT_LIVE_WRITE=1</code> és a <code>KT_LIVE_OPS</code> listában a neve (pl. <code>KT_LIVE_OPS=lesson.log,homework.add</code>). A többi csak megmutatja a pontos kérést. Javaslat: egyesével kapcsold be, és ártalmatlan adattal próbáld ki.", `<span class="chip ${S.ov.liveWrite ? "warn" : "ok"}">${S.ov.liveWrite ? "bekapcsolva" : "kikapcsolva"}</span>`)}
      <div class="set-row wide"><div class="set-l"><b>Műveletek</b><div class="small muted">Minden írás előtt megjelenik, pontosan mi kerül be; a jóváhagyás után a program visszaolvassa és a Műveletnaplóba írja.</div></div>
        <div class="set-c"><div class="list">${OPS.filter(([k]) => S.ov.demo || k !== "absence.record").map(([k, l]) => `<div class="item"><span>${!caps.has(k) ? "—" : S.ov.demo || (S.ov.enabledOps || []).includes(k) ? "✅" : "🔒"}<code class="small muted" style="margin-left:6px">${esc(k)}</code></span><div class="grow">${esc(l)}</div>${k ? `<span class="chip ${caps.has(k) ? (S.ov.demo || (S.ov.enabledOps || []).includes(k) ? "ok" : "") : ""}">${!caps.has(k) ? "nem támogatott" : S.ov.demo ? "szimulált" : (S.ov.enabledOps || []).includes(k) ? "éles" : "csak előnézet"}</span>` : ""}</div>`).join("")}</div></div></div>`)}
    ${sec("account", "Fiók", `
      ${row("Kilépés", "", `<button class="btn" id="lo">Kilépés</button>`)}
      ${row("Fiók törlése", S.ov.demo ? "A teszt iskola és a műveletnapló is törlődik." : "A tárolt token, a beállítások és a műveletnapló törlődik. A KRÉTA-ban semmi nem változik.", `<button class="btn danger" id="del">Törlés</button>`)}`)}
    </div></div>`;
  const $ = (s) => root.querySelector(s);
  root.querySelectorAll(".set-nav button").forEach((b) => (b.onclick = () => {
    section = b.dataset.sec;
    root.querySelectorAll(".set-nav button").forEach((x) => x.classList.toggle("on", x === b));
    root.querySelectorAll(".set-sec").forEach((s) => (s.hidden = s.dataset.sec !== section));
  }));
  root.querySelectorAll("#th button").forEach((b) => (b.onclick = () => { savePrefs({ theme: b.dataset.v }); render(root); }));
  root.querySelectorAll(".pal").forEach((b) => (b.onclick = () => { savePrefs({ palette: b.dataset.p }); render(root); }));
  root.querySelectorAll(".sw").forEach((b) => (b.onclick = () => { savePrefs({ accent: b.dataset.c }); render(root); }));
  $("#rd").oninput = (e) => savePrefs({ radius: +e.target.value });
  $("#fs").oninput = (e) => savePrefs({ fontScale: +e.target.value });
  $("#sv").onchange = (e) => savePrefs({ startView: e.target.value }, { silent: false });
  $("#lo").onclick = async () => { await post("/api/auth/logout"); location.hash = ""; location.reload(); };
  $("#del").onclick = async () => {
    if (!confirm("Biztosan törlöd a fiókot?")) return;
    await post("/api/auth/account/delete"); location.hash = ""; location.reload();
  };
}
