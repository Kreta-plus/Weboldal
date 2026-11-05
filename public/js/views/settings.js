import { S as ST, savePrefs, allSubjects, subjName, PALETTES } from "../state.js";
import { get, post } from "../api.js";
import { esc, toast, ago, iso } from "../util.js";
import { randomDisclaimer } from "../funny.js";
import { TRANSITIONS, preview } from "../transition.js";

const SWATCHES = ["#ffe14d", "#e8c468", "#ff9f43", "#ff7a59", "#ff4d4d", "#ff5fa2", "#ff3df0", "#b79cff",
  "#8a7dff", "#3d5cff", "#5cc8ff", "#88c0d0", "#00d1c1", "#45e3a0", "#c6f25c", "#ffffff"]; // szövegkiemelő színek
const BG_STYLES = [["flat", "Egyszínű"], ["glow", "Ragyogás"], ["dots", "Pöttyös"], ["grid", "Kockás füzet"]];
const CARD_STYLES = [["fill", "Kitöltött"], ["outline", "Keretes"], ["glass", "Üveg"]];
// az oldalváltás mintája: két kitalált oldal, ezek között vált
const TR_PAGES = [`<b>📘 Jegyek</b><i></i><i></i><i></i>`, `<b>🗓️ Órarend</b><span class="tr-cols"><i></i><i></i><i></i><i></i></span>`];
const WIDGETS = { avg: "Összesítő számok", next: "Mai órák", grades: "Friss jegyek", homework: "Házik", tests: "Számonkérések", absences: "Hiányzások", trend: "Átlag-diagram", subjects: "Tantárgyi átlagok" };
const CSS_PRESETS = {
  "Üveg": ".card{backdrop-filter:blur(12px);background:color-mix(in srgb,var(--surface) 65%,transparent)}",
  "Éles sarkok": ":root{--radius:4px}.btn,.input,.item,.les{border-radius:4px}",
  "Neon keret": ".card{border-color:var(--accent);box-shadow:0 0 18px var(--accent-soft)}",
  "Nagy számok": ".kpi .v{font-size:3rem}",
};

const CSS_CLASSES = [
  ["card", "Kártyák (doboz a tartalom körül)"], ["btn", "Minden gomb"], ["btn.primary", "Kiemelt (elsődleges) gomb"], ["btn.danger", "Piros, veszélyes gomb"],
  ["input", "Beviteli mezők és legördülők"], ["item", "Listaelem (jegy, házi, óra sora)"], ["list", "Listaelemeket tartó doboz"], ["chip", "Kis címke / jelvény"], ["chips", "Címkék sora"],
  ["kpi", "Összesítő szám doboz a kezdőlapon"], ["kpi .v", "A KPI nagy száma"], ["kpi .l", "A KPI felirata"], ["topbar", "Oldal tetején a cím sáv"], ["topbar h1", "Oldal főcíme"],
  ["nav", "Oldalsó menü linkjei"], ["side", "Oldalsó sáv"], ["main", "Fő tartalom terület"], ["les", "Egy óra az órarendben"], ["day", "Egy nap oszlopa az órarendben"],
  ["today", "A mai nap kiemelése"], ["now", "Éppen zajló óra"], ["seg", "Váltógomb-csoport (pl. téma)"], ["seg button.on", "Aktív váltógomb"], ["bar", "Folyamat-/átlagsáv"],
  ["toast", "Felbukkanó értesítés"], ["avatar", "Kerek profilkép / monogram"], ["hero", "Nagy felső blokk"], ["subj", "Tantárgy neve"], ["term", "Tanév / félév jelölő"],
  ["muted", "Halványabb szöveg"], ["small", "Kisebb szöveg"], ["grid", "Rácsos elrendezés"], ["row", "Vízszintes sor"],
];
const CSS_PROPS = ["background", "background-color", "border", "border-color", "border-radius", "border-width", "box-shadow", "color", "cursor", "display", "filter", "font-family", "font-size", "font-weight", "gap", "height", "letter-spacing", "line-height", "margin", "max-width", "opacity", "outline", "padding", "text-align", "text-transform", "transform", "transition", "width", "backdrop-filter"];
const CSS_VARS = ["--accent", "--accent-soft", "--bg", "--surface", "--text", "--muted", "--radius", "--g1", "--g2", "--g3", "--g4", "--g5"];

function cssComplete(ta, onChange) {
  const box = ta.parentElement, pop = document.createElement("div");
  pop.className = "ac"; pop.hidden = true; box.appendChild(pop);
  let items = [], sel = 0, tok = null;
  const close = () => { pop.hidden = true; items = []; };
  const draw = () => {
    pop.innerHTML = items.map((it, i) => `<div class="ac-i ${i === sel ? "on" : ""}" data-i="${i}"><b>${esc(it.label)}</b><span>${esc(it.hint || "")}</span></div>`).join("");
    pop.hidden = !items.length;
    pop.querySelector(".on")?.scrollIntoView({ block: "nearest" });
  };
  const update = () => {
    const pos = ta.selectionStart, before = ta.value.slice(0, pos);
    const inside = (before.match(/{/g) || []).length > (before.match(/}/g) || []).length;
    const m = before.match(/[.\w-]*$/)[0];
    tok = { start: pos - m.length, end: pos, inside };
    if (!m) return close();
    if (!inside && m[0] === ".") {
      const q = m.slice(1).toLowerCase();
      items = CSS_CLASSES.filter(([c]) => c.toLowerCase().includes(q)).map(([c, d]) => ({ label: "." + c, hint: d, kind: "cls" }));
    } else if (inside && m.startsWith("--")) {
      items = CSS_VARS.filter((v) => v.startsWith(m)).map((v) => ({ label: v, hint: "változó", kind: "var" }));
    } else if (inside && /^[a-z-]+$/.test(m) && m.length > 1) {
      items = CSS_PROPS.filter((x) => x.startsWith(m)).map((x) => ({ label: x, hint: "tulajdonság", kind: "prop" }));
    } else items = [];
    items = items.filter((it) => it.label !== m).slice(0, 8);
    sel = 0; draw();
  };
  const accept = (it) => {
    let ins = it.label, back = 0;
    if (it.kind === "cls") { ins += " {\n  \n}"; back = 2; }
    else if (it.kind === "prop") { ins += ": ;"; back = 1; }
    ta.value = ta.value.slice(0, tok.start) + ins + ta.value.slice(tok.end);
    const c = tok.start + ins.length - back;
    ta.focus(); ta.setSelectionRange(c, c); close(); onChange();
  };
  ta.addEventListener("input", update);
  ta.addEventListener("blur", () => setTimeout(close, 150));
  ta.addEventListener("keydown", (e) => {
    if (pop.hidden) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); sel = (sel + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length; draw(); }
    else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); accept(items[sel]); }
    else if (e.key === "Escape") close();
  });
  pop.addEventListener("mousedown", (e) => { const d = e.target.closest(".ac-i"); if (d) { e.preventDefault(); accept(items[+d.dataset.i]); } });
}

// témakörök: [kulcs, név, ikon]
const SECTIONS = [["look", "Megjelenés", "🎨"], ["home", "Kezdőlap", "🏠"], ["grades", "Jegyek", "📘"], ["css", "Egyedi CSS", "🧩"], ["account", "Fiók és adatok", "🔐"], ["dev", "Fejlesztői", "🛠️"]];
let section = "look";

export async function render(root) {
  const p = ST.prefs;
  let sessions = [];
  try { sessions = await get("/api/auth/sessions"); } catch {}
  const subs = allSubjects();
  const pal = PALETTES[p.palette] ? p.palette : "desk";
  const tr = p.transition || "fade", trMs = p.transitionMs ?? 250;
  const u = ST.user || {};
  const lightPv = document.documentElement.dataset.theme === "light"; // a téma-előnézet a mostani módhoz igazodik
  const row = (label, desc, control, wide = false) => `<div class="set-row ${wide ? "wide" : ""}"><div class="set-l"><b>${label}</b>${desc ? `<div class="small muted">${desc}</div>` : ""}</div><div class="set-c">${control}</div></div>`;
  const toggle = (id, on, cls = "", data = "") => `<label class="switch"><input type="checkbox" ${id ? `id="${id}"` : ""} class="${cls}" ${data} ${on ? "checked" : ""}><span class="sr">be/ki</span></label>`;
  const sec = (k, html) => `<section class="set-sec card" data-sec="${k}" ${section === k ? "" : "hidden"}>${html}</section>`;

  root.innerHTML = `<div class="topbar"><div><h1>Beállítások</h1><div class="sub">Minden változás azonnal mentődik.</div></div></div>
  <div class="settings">
    <nav class="set-nav" aria-label="Beállítások témakörei">${SECTIONS.map(([k, l, ic]) => `<button data-sec="${k}" class="${section === k ? "on" : ""}"><span aria-hidden="true">${ic}</span>${l}</button>`).join("")}</nav>
    <div class="set-body">
    ${sec("look", `<h3>Megjelenés</h3>
      ${row("Téma", "Az Auto a telefonod vagy géped beállítását követi.", `<div class="seg" data-seg="theme">${[["auto", "Auto"], ["dark", "Sötét"], ["light", "Világos"], ["amoled", "AMOLED"]].map(([k, l]) => `<button data-v="${k}" class="${p.theme === k ? "on" : ""}">${l}</button>`).join("")}</div>`)}
      ${row("Színtéma", "A háttér és a kártyák színe. A kiemelő színt nem változtatja meg, így bármelyik témához bármilyen kiemelő szín párosítható.", `<div class="pal-grid">${Object.entries(PALETTES).map(([k, [l, dbg, dsf, lbg, lsf]]) => `<button class="pal ${pal === k ? "on" : ""}" data-p="${k}" aria-pressed="${pal === k}"><span class="pal-pv" style="background:${lightPv ? lbg : dbg}"><i style="background:${lightPv ? lsf : dsf}"></i><i></i></span>${l}</button>`).join("")}</div>
        <div class="row wrap" style="margin-top:10px"><button class="btn sm" id="rnd">🎲 Véletlen párosítás</button></div>`, true)}
      ${row("Kiemelő szín", "Gombok, aktív menüpont és kiemelések színe. Független a színtémától.", `<div class="row wrap">${SWATCHES.map((c) => `<button class="btn sm sw" data-c="${c}" title="${c}" style="background:${c};width:30px;height:30px;padding:0;border-radius:50%;box-shadow:inset 0 0 0 1px var(--border);${p.accent === c ? "outline:3px solid var(--text);outline-offset:2px" : ""}"></button>`).join("")}
        <input type="color" id="acc" value="${p.accent}" title="Saját szín" style="width:40px;height:34px;border:0;background:none;cursor:pointer">
        <button class="btn sm" id="palacc" title="A(z) ${PALETTES[pal][0]} témához ajánlott szín"><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${PALETTES[pal][5]}"></span> Témához illő</button></div>`, true)}
      ${row("Háttér", "Minta vagy ragyogás a háttérben, a kiemelő szín árnyalatával.", `<div class="seg" data-seg="bgStyle">${BG_STYLES.map(([k, l]) => `<button data-v="${k}" class="${(p.bgStyle || "flat") === k ? "on" : ""}">${l}</button>`).join("")}</div>`)}
      ${row("Kártyák", "A tartalmat tartó dobozok stílusa. Az Üveg a Ragyogás vagy minta háttérrel mutat a legjobban.", `<div class="seg" data-seg="cardStyle">${CARD_STYLES.map(([k, l]) => `<button data-v="${k}" class="${(p.cardStyle || "fill") === k ? "on" : ""}">${l}</button>`).join("")}</div>`)}
      ${row("Sűrűség", "Mennyi hely legyen az elemek között.", `<div class="seg" data-seg="density">${[["compact", "Tömör"], ["normal", "Normál"], ["cozy", "Tágas"]].map(([k, l]) => `<button data-v="${k}" class="${p.density === k ? "on" : ""}">${l}</button>`).join("")}</div>`)}
      ${row(`Betűméret <span class="muted" id="fsv">${Math.round(p.fontScale * 100)}%</span>`, "", `<input type="range" id="fs" min="0.85" max="1.3" step="0.05" value="${p.fontScale}">`)}
      ${row(`Lekerekítés <span class="muted" id="rdv">${p.radius} px</span>`, "A lapok és gombok sarkai.", `<input type="range" id="rd" min="0" max="28" step="1" value="${p.radius}">`)}
      ${row("Oldalváltás", "Rövid animáció, amikor másik oldalra lépsz. A mintára kattintva újra megnézheted. Ha a rendszereden be van kapcsolva a mozgáscsökkentés, csak áttűnés lesz.", `<div class="tr-set"><div class="seg" id="trtype">${TRANSITIONS.map(([k, l]) => `<button data-v="${k}" class="${tr === k ? "on" : ""}">${l}</button>`).join("")}</div>
        <button class="tr-pv" id="trpv" title="Lejátszás" aria-label="Az oldalváltás lejátszása a mintán"><span class="tr-page">${TR_PAGES[0]}</span></button></div>`, true)}
      ${row(`Oldalváltás ideje <span class="muted" id="trv">${trMs} ms</span>`, "Az egész váltás hossza: rövidebb idővel fürgébb, hosszabbal látványosabb.", `<input type="range" id="trms" min="100" max="800" step="50" value="${trMs}" ${tr === "none" ? "disabled" : ""}>`)}`)}

    ${sec("home", `<h3>Kezdőlap</h3>
      ${row("Kezdőoldal", "Ez nyílik meg, amikor belépsz.", `<select class="input" id="sv">${[["dashboard", "Kezdőlap"], ["grades", "Jegyek"], ["stats", "Statisztikák"], ["timetable", "Órarend"], ["homework", "Házi"]].map(([k, l]) => `<option value="${k}" ${p.startView === k ? "selected" : ""}>${l}</option>`).join("")}</select>`)}
      ${row("Vicces szöveg", "Egy mondat a holnapi órák alapján a Kezdőlap tetején.", toggle("fq", p.funnyQuips !== false))}
      ${row("A Kezdőlapon látszik", "Kapcsold ki, amire nincs szükséged.", `<div class="set-list">${Object.entries(WIDGETS).map(([k, l]) => `<label class="switch"><input type="checkbox" class="wg" data-k="${k}" ${p.widgets.includes(k) ? "checked" : ""}><span>${l}</span></label>`).join("")}</div>`, true)}`)}

    ${sec("grades", `<h3>Jegyek és átlag</h3>
      ${row("Súlyozott átlag", "A KRÉTA súlyai szerint számol (pl. a témazáró 200%).", toggle("wt", p.weighted !== false))}
      ${row("Célátlag", "Ehhez méri, hány jó jegy kell még.", `<input class="input" type="number" id="ta" min="1" max="5" step="0.1" value="${p.targetAvg}" style="width:110px">`)}
      ${row("Elrejtett tantárgyak", "A bejelölt tárgyak kimaradnak az átlagból és a statisztikából.", subs.length ? `<div class="chips">${subs.map((s) => `<label class="chip" style="cursor:pointer"><input type="checkbox" class="hs" data-s="${esc(s)}" ${p.hiddenSubjects.includes(s) ? "checked" : ""}> ${esc(subjName(s))}</label>`).join("")}</div>` : `<span class="small muted">Még nincs betöltött tantárgy.</span>`, true)}
      ${row("Jótanuló mód 🎓", "Minden jegy 5-ösként látszik, csak a te kijelződön. Bekapcsoláskor el kell fogadnod egy nyilatkozatot.", toggle("gs", p.goodStudent))}`)}

    ${sec("css", `<h3>Egyedi CSS <small>saját kinézet, csak nálad</small></h3>
      <div class="chips" style="margin-bottom:10px">${Object.keys(CSS_PRESETS).map((k) => `<button class="btn sm pre" data-k="${esc(k)}">+ ${esc(k)}</button>`).join("")}<button class="btn sm danger" id="cssclr">Törlés</button></div>
      <details class="cls-d"><summary>Osztály beszúrása a kurzorhoz (${CSS_CLASSES.length})</summary><div class="clsgrid">${CSS_CLASSES.map(([c, d]) => `<button class="btn sm cls" data-c="${esc(c)}"><b>.${esc(c)}</b><span>${esc(d)}</span></button>`).join("")}</div></details>
      <div class="acwrap"><textarea class="input" id="css" spellcheck="false" placeholder="pl. .card { border-radius: 4px; } — írj egy . -ot vagy tulajdonságot a javaslatokhoz">${esc(p.customCss)}</textarea></div>
      <div class="small muted" style="margin-top:6px">Használható változók: --accent, --bg, --surface, --text, --muted, --radius, --g1…--g5. Külső url() és @import nem engedett.</div>`)}

    ${sec("account", `<h3>Fiók és adatok</h3>
      ${row("E-mailes belépés", (u.email
        ? `Ezzel is beléphetsz: <b>${esc(u.email)}</b>${u.admin ? ` <span class="chip">🧑‍💻 fejlesztői fiók</span>` : ""}`
        : "Csatolj egy e-mail címet és egy jelszót, és később KRÉTA nélkül is be tudsz lépni vele. Visszaigazoló levelet nem küldünk.")
        + (u.inst === "demo" ? " Teszt fióknál is működik, és így a fiók nem törlődik 7 nap után." : ""),
        `<div class="row wrap">${u.email ? `<button class="btn" id="emedit">Jelszó módosítása</button><button class="btn danger" id="emdel">Leválasztás</button>` : `<button class="btn" id="emedit">E-mail cím csatolása</button>`}</div>
        <form class="em-set" id="emset" hidden>
          <input class="input" id="emaddr" type="email" autocomplete="username" placeholder="E-mail cím" aria-label="E-mail cím" value="${esc(u.email || "")}" ${u.email ? "readonly" : ""} required>
          <input class="input" id="empw1" type="password" autocomplete="new-password" placeholder="${u.email ? "Új jelszó" : "Jelszó"} (legalább 8 karakter)" aria-label="Jelszó" minlength="8" required>
          <input class="input" id="empw2" type="password" autocomplete="new-password" placeholder="Jelszó még egyszer" aria-label="Jelszó még egyszer" required>
          <input class="input" id="emcode" placeholder="Fejlesztői kód" aria-label="Fejlesztői kód" autocomplete="off" hidden>
          <div class="err" id="emerr" hidden></div>
          <div class="row"><button type="button" class="btn grow" id="emcancel">Mégsem</button><button class="btn primary grow">Mentés</button></div>
        </form>`, true)}
      ${row("Beállítások mentése", "Lementheted fájlba, és másik eszközön visszatöltheted.", `<div class="row wrap"><button class="btn" id="exp">Exportálás</button><label class="btn" style="cursor:pointer">Importálás<input type="file" id="imp" accept="application/json" hidden></label></div>`)}
      ${row("Belépett eszközök", "A jelszavad nincs eltárolva. A szerver titkosítva tárol egy megújító tokent, ezért nem kell újra belépned.", `<div class="list">${sessions.map((s) => `<div class="item"><div class="grow small"><b>${s.current ? "Ez az eszköz" : "Másik eszköz"}</b><div class="muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.ua || "")}</div></div><span class="small muted">${ago(s.lastSeen)}</span></div>`).join("")}</div>`, true)}
      ${row("Kilépés", "", `<div class="row wrap"><button class="btn" id="lo">Kilépés</button><button class="btn" id="loa">Kilépés mindenhonnan</button></div>`)}
      ${row("Fiók törlése", "Törli a fiókodat és minden mentett adatot (beállítások, nevek, saját házik). Nem vonható vissza.", `<button class="btn danger" id="del">Fiók és adatok törlése</button>`)}`)}

    ${sec("dev", `<h3>Fejlesztői eszközök</h3>
      ${row("Developer mód", "Teszteléshez: kitalált órák és házik.", toggle("dev", p.devMode))}
      ${p.devMode ? `${row("Táska: véletlen órák", "Ha holnap nincs óra, véletlen órákkal tölti fel a Táskát.", toggle("devfill", p.devFillLessons))}
      ${row("Órarend: teszt órák", "Az üres tanítási napokat teszt órákkal tölti fel.", toggle("devtt", p.devFillTimetable))}
      ${row("Teszt házi", "Egy véletlen tantárgyhoz kerül, holnapi határidővel, „[teszt]” előtaggal a saját házik közé.", `<div class="row wrap"><button class="btn" id="devhw">+ Teszt házi holnapra</button><button class="btn danger" id="devhwclr">Teszt házik törlése</button></div>`)}` : ""}`)}
    </div>
  </div>`;

  root.querySelectorAll(".set-nav button").forEach((b) => (b.onclick = () => {
    section = b.dataset.sec;
    root.querySelectorAll(".set-nav button").forEach((x) => x.classList.toggle("on", x === b));
    root.querySelectorAll(".set-sec").forEach((x) => (x.hidden = x.dataset.sec !== section));
  }));
  root.querySelectorAll("[data-seg]").forEach((seg) => seg.querySelectorAll("button").forEach((b) => (b.onclick = () => { savePrefs({ [seg.dataset.seg]: b.dataset.v }); render(root); })));
  root.querySelectorAll(".pal").forEach((b) => (b.onclick = () => { savePrefs({ palette: b.dataset.p }); render(root); }));
  root.querySelector("#palacc").onclick = () => { savePrefs({ accent: PALETTES[pal][5] }); render(root); };
  root.querySelector("#rnd").onclick = () => {
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    savePrefs({ palette: pick(Object.keys(PALETTES)), accent: pick(SWATCHES) });
    render(root);
  };
  root.querySelectorAll(".sw").forEach((b) => (b.onclick = () => { savePrefs({ accent: b.dataset.c }); render(root); }));
  root.querySelector("#acc").oninput = (e) => savePrefs({ accent: e.target.value });
  // a csúszka mellett kiírt érték húzás közben is frissül
  root.querySelector("#fs").oninput = (e) => { const v = parseFloat(e.target.value); root.querySelector("#fsv").textContent = Math.round(v * 100) + "%"; savePrefs({ fontScale: v }); };
  root.querySelector("#rd").oninput = (e) => { const v = parseInt(e.target.value); root.querySelector("#rdv").textContent = v + " px"; savePrefs({ radius: v }); };
  // oldalváltás: típus- vagy időváltáskor a mintán rögtön le is játssza
  const trpage = root.querySelector("#trpv .tr-page"), trms = root.querySelector("#trms");
  let trAt = 0; // melyik minta-oldal látszik
  const trPlay = () => { const to = 1 - trAt; preview(trpage, to ? 1 : -1, () => { trAt = to; trpage.innerHTML = TR_PAGES[to]; }); };
  root.querySelector("#trpv").onclick = trPlay;
  root.querySelectorAll("#trtype button").forEach((b) => (b.onclick = () => {
    savePrefs({ transition: b.dataset.v });
    root.querySelectorAll("#trtype button").forEach((x) => x.classList.toggle("on", x === b));
    trms.disabled = b.dataset.v === "none";
    trPlay();
  }));
  trms.oninput = (e) => { const v = parseInt(e.target.value); root.querySelector("#trv").textContent = v + " ms"; savePrefs({ transitionMs: v }); };
  trms.onchange = trPlay;
  root.querySelector("#sv").onchange = (e) => savePrefs({ startView: e.target.value });
  root.querySelector("#fq").onchange = (e) => savePrefs({ funnyQuips: e.target.checked });
  root.querySelector("#wt").onchange = (e) => savePrefs({ weighted: e.target.checked });
  root.querySelector("#gs").onchange = (e) => {
    if (!e.target.checked) { savePrefs({ goodStudent: false }); return; }
    e.target.checked = false; // csak az elfogadás után kapcsol be
    const bg = document.createElement("div");
    bg.className = "modal-bg";
    bg.innerHTML = `<div class="card modal" role="dialog" aria-modal="true"><h3>🎓 Jótanuló mód</h3>
      <p class="gs-text">${esc(randomDisclaimer())}</p>
      <label class="switch"><input type="checkbox" id="gsok"><span>Elolvastam, és elfogadom</span></label>
      <div class="row" style="margin-top:14px"><button class="btn grow" id="gsno">Mégsem</button><button class="btn primary grow" id="gsyes" disabled>Bekapcsolom</button></div></div>`;
    document.body.appendChild(bg);
    const ok = bg.querySelector("#gsok"), yes = bg.querySelector("#gsyes");
    ok.onchange = () => (yes.disabled = !ok.checked);
    const close = () => bg.remove();
    bg.querySelector("#gsno").onclick = close;
    bg.onclick = (ev) => { if (ev.target === bg) close(); };
    yes.onclick = () => { savePrefs({ goodStudent: true }); close(); render(root); toast("Jótanuló mód bekapcsolva 🎉"); };
  };
  root.querySelector("#dev").onchange = (e) => { savePrefs({ devMode: e.target.checked, ...(e.target.checked ? {} : { devFillLessons: false, devFillTimetable: false }) }); render(root); };
  root.querySelector("#devtt")?.addEventListener("change", (e) => savePrefs({ devFillTimetable: e.target.checked }));
  root.querySelector("#devfill")?.addEventListener("change", (e) => savePrefs({ devFillLessons: e.target.checked }));
  root.querySelector("#devhw")?.addEventListener("click", () => {
    if (!subs.length) return toast("Nincs betöltött tantárgy");
    const d = new Date(); d.setDate(d.getDate() + 1);
    const subject = subs[Math.floor(Math.random() * subs.length)];
    savePrefs({ myHomework: [...(p.myHomework || []), { id: "t" + Date.now().toString(36), subject, date: iso(d), text: "[teszt] Gyakorló feladatok " + (1 + Math.floor(Math.random() * 40)) + ". oldal", done: false }] });
    toast("Teszt házi hozzáadva: " + subjName(subject));
  });
  root.querySelector("#devhwclr")?.addEventListener("click", () => { savePrefs({ myHomework: (p.myHomework || []).filter((h) => !h.text.startsWith("[teszt]")) }); toast("Teszt házik törölve"); });
  root.querySelector("#ta").onchange = (e) => savePrefs({ targetAvg: parseFloat(e.target.value) || 4.5 });
  root.querySelectorAll(".wg").forEach((c) => (c.onchange = () => savePrefs({ widgets: [...root.querySelectorAll(".wg:checked")].map((x) => x.dataset.k) })));
  root.querySelectorAll(".hs").forEach((c) => (c.onchange = () => savePrefs({ hiddenSubjects: [...root.querySelectorAll(".hs:checked")].map((x) => x.dataset.s) })));
  const css = root.querySelector("#css");
  css.oninput = () => savePrefs({ customCss: css.value });
  root.querySelectorAll(".pre").forEach((b) => (b.onclick = () => { css.value = (css.value + "\n" + CSS_PRESETS[b.dataset.k]).trim(); savePrefs({ customCss: css.value }); }));
  cssComplete(css, () => savePrefs({ customCss: css.value }));
  root.querySelectorAll(".cls").forEach((b) => (b.onclick = () => {
    const snip = "." + b.dataset.c + " {\n  \n}";
    const a = css.selectionStart ?? css.value.length, e = css.selectionEnd ?? a;
    const pre = css.value.slice(0, a), lead = pre && !pre.endsWith("\n") ? "\n" : "";
    css.value = pre + lead + snip + css.value.slice(e);
    const pos = pre.length + lead.length + snip.length - 2;
    css.focus(); css.setSelectionRange(pos, pos);
    savePrefs({ customCss: css.value });
  }));
  root.querySelector("#cssclr").onclick = () => { css.value = ""; savePrefs({ customCss: "" }); };
  root.querySelector("#exp").onclick = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(ST.prefs, null, 2)], { type: "application/json" }));
    a.download = "zsirkreta-beallitasok.json"; a.click();
  };
  root.querySelector("#imp").onchange = async (e) => {
    try { savePrefs(JSON.parse(await e.target.files[0].text())); toast("Importálva"); render(root); } catch { toast("Érvénytelen fájl"); }
  };
  // e-mailes belépés: csatolás / jelszócsere / leválasztás
  const emset = root.querySelector("#emset"), emcode = root.querySelector("#emcode");
  root.querySelector("#emedit").onclick = () => { emset.hidden = false; root.querySelector(u.email ? "#empw1" : "#emaddr").focus(); };
  root.querySelector("#emcancel").onclick = () => { emset.hidden = true; };
  root.querySelector("#emdel")?.addEventListener("click", async () => {
    if (!confirm(`Leválasztod a(z) ${u.email} címet? Utána csak KRÉTA-belépéssel tudsz belépni.`)) return;
    try {
      await post("/api/auth/email/remove");
      const wasAdmin = u.admin;
      Object.assign(ST.user, { email: null, admin: false });
      toast("E-mail cím leválasztva");
      wasAdmin ? location.reload() : render(root);
    } catch (e) { toast(e.message); }
  });
  emset.onsubmit = async (e) => {
    e.preventDefault();
    const er = root.querySelector("#emerr"), show = (m) => { er.hidden = !m; er.textContent = m || ""; };
    const pw = root.querySelector("#empw1").value;
    if (pw !== root.querySelector("#empw2").value) return show("A két jelszó nem egyezik.");
    const hadEmail = !!u.email, wasAdmin = !!u.admin; // az u maga a ST.user, a mentés felülírja
    try {
      const r = await post("/api/auth/email", { email: root.querySelector("#emaddr").value, pass: pw, devCode: emcode.hidden ? undefined : emcode.value });
      Object.assign(ST.user, { email: r.email, admin: r.admin });
      if (r.admin && !wasAdmin) { // a menübe is be kell kerülnie a Fejlesztő oldalnak: újratöltjük, és rögtön az nyílik meg
        toast("Fejlesztői fiók kész, megnyílik a fejlesztői oldal");
        setTimeout(() => { location.hash = "dev"; location.reload(); }, 900);
        return;
      }
      toast(hadEmail ? "Jelszó módosítva" : "E-mail cím csatolva, mostantól ezzel is beléphetsz");
      render(root);
    } catch (ex) {
      if (ex.code === "devcode") { emcode.hidden = false; emcode.focus(); }
      show(ex.message);
    }
  };
  const out = (url) => async () => { await post(url); location.reload(); };
  root.querySelector("#lo").onclick = out("/api/auth/logout");
  root.querySelector("#loa").onclick = out("/api/auth/logout-all");
  root.querySelector("#del").onclick = () => { if (confirm("Biztosan törlöd a fiókodat és az összes mentett adatot (beállítások, nevek)?")) out("/api/auth/account/delete")(); };
}
