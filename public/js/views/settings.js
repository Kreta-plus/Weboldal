import { S as ST, savePrefs, allSubjects, subjName } from "../state.js";
import { get, post } from "../api.js";
import { esc, toast, ago, iso } from "../util.js";
import { randomDisclaimer } from "../funny.js";

const SWATCHES = ["#6c5ce7", "#2ecc8f", "#38bdf8", "#f43f5e", "#f59e0b", "#d946ef", "#14b8a6", "#ef4444"];
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

export async function render(root) {
  const p = ST.prefs;
  let sessions = [];
  try { sessions = await get("/api/auth/sessions"); } catch {}
  const subs = allSubjects();
  root.innerHTML = `<div class="topbar"><div><h1>Beállítások</h1><div class="sub">Minden automatikusan mentődik.</div></div></div>
  <div class="grid g2">
    <div class="card"><h3>Megjelenés</h3><div class="grid" style="gap:14px">
      <div><div class="small muted" style="margin-bottom:6px">Téma</div><div class="seg" data-seg="theme">${[["auto", "Auto"], ["dark", "Sötét"], ["light", "Világos"], ["amoled", "AMOLED"]].map(([k, l]) => `<button data-v="${k}" class="${p.theme === k ? "on" : ""}">${l}</button>`).join("")}</div></div>
      <div><div class="small muted" style="margin-bottom:6px">Kiemelő szín</div><div class="row wrap">${SWATCHES.map((c) => `<button class="btn sm sw" data-c="${c}" style="background:${c};width:30px;height:30px;padding:0;border-radius:50%;${p.accent === c ? "outline:3px solid var(--text)" : ""}"></button>`).join("")}
        <input type="color" id="acc" value="${p.accent}" style="width:40px;height:34px;border:0;background:none;cursor:pointer"></div></div>
      <div><div class="small muted" style="margin-bottom:6px">Sűrűség</div><div class="seg" data-seg="density">${[["compact", "Tömör"], ["normal", "Normál"], ["cozy", "Tágas"]].map(([k, l]) => `<button data-v="${k}" class="${p.density === k ? "on" : ""}">${l}</button>`).join("")}</div></div>
      <label class="f">Betűméret (${Math.round(p.fontScale * 100)}%)<input type="range" id="fs" min="0.85" max="1.3" step="0.05" value="${p.fontScale}"></label>
      <label class="f">Lekerekítés (${p.radius}px)<input type="range" id="rd" min="0" max="28" step="1" value="${p.radius}"></label>
      <label class="f">Kezdőoldal<select class="input" id="sv">${[["dashboard", "Kezdőlap"], ["grades", "Jegyek"], ["stats", "Statisztikák"], ["timetable", "Órarend"], ["homework", "Házi"]].map(([k, l]) => `<option value="${k}" ${p.startView === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label class="switch"><input type="checkbox" id="fq" ${p.funnyQuips !== false ? "checked" : ""}><span>Vicces szöveg a kezdőlapon (a holnapi órák alapján)</span></label>
    </div></div>

    <div class="card"><h3>Jegyek és átlag</h3><div class="grid" style="gap:14px">
      <label class="switch"><input type="checkbox" id="wt" ${p.weighted !== false ? "checked" : ""}><span>Súlyozott átlag (a KRÉTA súlyai szerint)</span></label>
      <label class="f">Célátlag<input class="input" type="number" id="ta" min="1" max="5" step="0.1" value="${p.targetAvg}"></label>
      <div><div class="small muted" style="margin-bottom:6px">Kezdőlap elemei</div><div class="grid" style="gap:8px">${Object.entries(WIDGETS).map(([k, l]) => `<label class="switch"><input type="checkbox" class="wg" data-k="${k}" ${p.widgets.includes(k) ? "checked" : ""}><span>${l}</span></label>`).join("")}</div></div>
      <div><div class="small muted" style="margin-bottom:6px">Elrejtett tantárgyak (kiesnek az átlagból)</div><div class="chips">${subs.map((s) => `<label class="chip" style="cursor:pointer"><input type="checkbox" class="hs" data-s="${esc(s)}" ${p.hiddenSubjects.includes(s) ? "checked" : ""}> ${esc(subjName(s))}</label>`).join("")}</div></div>
    </div></div>

    <div class="card span2"><h3>Egyedi CSS <small>saját kinézet, csak nálad</small></h3>
      <div class="chips" style="margin-bottom:10px">${Object.keys(CSS_PRESETS).map((k) => `<button class="btn sm pre" data-k="${esc(k)}">+ ${esc(k)}</button>`).join("")}<button class="btn sm danger" id="cssclr">Törlés</button></div>
      <details class="cls-d"><summary>Osztály beszúrása a kurzorhoz (${CSS_CLASSES.length})</summary><div class="clsgrid">${CSS_CLASSES.map(([c, d]) => `<button class="btn sm cls" data-c="${esc(c)}"><b>.${esc(c)}</b><span>${esc(d)}</span></button>`).join("")}</div></details>
      <div class="acwrap"><textarea class="input" id="css" spellcheck="false" placeholder="pl. .card { border-radius: 4px; } — írj egy . -ot vagy tulajdonságot a javaslatokhoz">${esc(p.customCss)}</textarea></div>
      <div class="small muted" style="margin-top:6px">Használható változók: --accent, --bg, --surface, --text, --muted, --radius, --g1…--g5. Külső url() és @import nem engedett.</div></div>

    <div class="card"><h3>Jótanuló mód <small>🎓</small></h3><div class="grid" style="gap:12px">
      <label class="switch"><input type="checkbox" id="gs" ${p.goodStudent ? "checked" : ""}><span>Jótanuló mód: minden jegy 5-ös</span></label>
      <div class="small muted">Csak a te kijelződön látszik így, a KRÉTA-ban a jegyek nem változnak. Bekapcsoláskor el kell fogadnod egy nyilatkozatot.</div>
    </div></div>

    <div class="card"><h3>Developer mód <small>fejlesztői eszközök</small></h3><div class="grid" style="gap:14px">
      <label class="switch"><input type="checkbox" id="dev" ${p.devMode ? "checked" : ""}><span>Developer mód bekapcsolása</span></label>
      ${p.devMode ? `<label class="switch"><input type="checkbox" id="devfill" ${p.devFillLessons ? "checked" : ""}><span>Táska: ha holnap nincs óra, véletlen órákkal töltse fel</span></label>
      <label class="switch"><input type="checkbox" id="devtt" ${p.devFillTimetable ? "checked" : ""}><span>Órarend: az üres tanítási napokat töltse fel teszt órákkal</span></label>
      <div class="row wrap"><button class="btn" id="devhw">+ Teszt házi holnapra</button><button class="btn danger" id="devhwclr">Teszt házik törlése</button></div>
      <div class="small muted">A teszt házi egy véletlen tantárgyhoz kerül, holnapi határidővel (saját házik közé, „[teszt]” előtaggal).</div>` : ""}
    </div></div>

    <div class="card"><h3>Adatok és biztonság</h3><div class="grid" style="gap:10px">
      <div class="small muted">A jelszavad nincs eltárolva. A szerver titkosítva tárol egy megújító tokent, ezért nem kell újra belépned.</div>
      <div class="row wrap"><button class="btn" id="exp">Beállítások exportja</button><label class="btn" style="cursor:pointer">Import<input type="file" id="imp" accept="application/json" hidden></label></div>
      <div class="list">${sessions.map((s) => `<div class="item"><div class="grow small"><b>${s.current ? "Ez az eszköz" : "Másik eszköz"}</b><div class="muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:260px">${esc(s.ua || "")}</div></div><span class="small muted">${ago(s.lastSeen)}</span></div>`).join("")}</div>
      <div class="row wrap"><button class="btn" id="lo">Kilépés</button><button class="btn" id="loa">Kilépés mindenhonnan</button><button class="btn danger" id="del">Fiók és adatok törlése</button></div></div></div>
  </div>`;

  root.querySelectorAll("[data-seg]").forEach((seg) => seg.querySelectorAll("button").forEach((b) => (b.onclick = () => { savePrefs({ [seg.dataset.seg]: b.dataset.v }); render(root); })));
  root.querySelectorAll(".sw").forEach((b) => (b.onclick = () => { savePrefs({ accent: b.dataset.c }); render(root); }));
  root.querySelector("#acc").oninput = (e) => savePrefs({ accent: e.target.value });
  root.querySelector("#fs").oninput = (e) => savePrefs({ fontScale: parseFloat(e.target.value) });
  root.querySelector("#rd").oninput = (e) => savePrefs({ radius: parseInt(e.target.value) });
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
    a.download = "kreta-plusz-beallitasok.json"; a.click();
  };
  root.querySelector("#imp").onchange = async (e) => {
    try { savePrefs(JSON.parse(await e.target.files[0].text())); toast("Importálva"); render(root); } catch { toast("Érvénytelen fájl"); }
  };
  const out = (url) => async () => { await post(url); location.reload(); };
  root.querySelector("#lo").onclick = out("/api/auth/logout");
  root.querySelector("#loa").onclick = out("/api/auth/logout-all");
  root.querySelector("#del").onclick = () => { if (confirm("Biztosan törlöd a fiókodat és az összes mentett adatot (beállítások, nevek)?")) out("/api/auth/account/delete")(); };
}
