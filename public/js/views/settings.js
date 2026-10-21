import { S as ST, savePrefs, allSubjects, subjName } from "../state.js";
import { get, post } from "../api.js";
import { esc, toast, ago } from "../util.js";

const SWATCHES = ["#6c5ce7", "#2ecc8f", "#38bdf8", "#f43f5e", "#f59e0b", "#d946ef", "#14b8a6", "#ef4444"];
const WIDGETS = { avg: "Összesítő számok", next: "Mai órák", grades: "Friss jegyek", homework: "Házik", tests: "Számonkérések", absences: "Hiányzások", trend: "Átlag-diagram", subjects: "Tantárgyi átlagok" };
const CSS_PRESETS = {
  "Üveg": ".card{backdrop-filter:blur(12px);background:color-mix(in srgb,var(--surface) 65%,transparent)}",
  "Éles sarkok": ":root{--radius:4px}.btn,.input,.item,.les{border-radius:4px}",
  "Neon keret": ".card{border-color:var(--accent);box-shadow:0 0 18px var(--accent-soft)}",
  "Nagy számok": ".kpi .v{font-size:3rem}",
};

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
    </div></div>

    <div class="card"><h3>Jegyek és átlag</h3><div class="grid" style="gap:14px">
      <label class="switch"><input type="checkbox" id="wt" ${p.weighted !== false ? "checked" : ""}><span>Súlyozott átlag (a KRÉTA súlyai szerint)</span></label>
      <label class="f">Célátlag<input class="input" type="number" id="ta" min="1" max="5" step="0.1" value="${p.targetAvg}"></label>
      <div><div class="small muted" style="margin-bottom:6px">Kezdőlap elemei</div><div class="grid" style="gap:8px">${Object.entries(WIDGETS).map(([k, l]) => `<label class="switch"><input type="checkbox" class="wg" data-k="${k}" ${p.widgets.includes(k) ? "checked" : ""}><span>${l}</span></label>`).join("")}</div></div>
      <div><div class="small muted" style="margin-bottom:6px">Elrejtett tantárgyak (kiesnek az átlagból)</div><div class="chips">${subs.map((s) => `<label class="chip" style="cursor:pointer"><input type="checkbox" class="hs" data-s="${esc(s)}" ${p.hiddenSubjects.includes(s) ? "checked" : ""}> ${esc(subjName(s))}</label>`).join("")}</div></div>
    </div></div>

    <div class="card span2"><h3>Egyedi CSS <small>saját kinézet, csak nálad</small></h3>
      <div class="chips" style="margin-bottom:10px">${Object.keys(CSS_PRESETS).map((k) => `<button class="btn sm pre" data-k="${esc(k)}">+ ${esc(k)}</button>`).join("")}<button class="btn sm danger" id="cssclr">Törlés</button></div>
      <textarea class="input" id="css" spellcheck="false" placeholder="pl. .card { border-radius: 4px; }">${esc(p.customCss)}</textarea>
      <div class="small muted" style="margin-top:6px">Használható változók: --accent, --bg, --surface, --text, --muted, --radius, --g1…--g5. Külső url() és @import nem engedett.</div></div>

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
  root.querySelector("#wt").onchange = (e) => savePrefs({ weighted: e.target.checked });
  root.querySelector("#ta").onchange = (e) => savePrefs({ targetAvg: parseFloat(e.target.value) || 4.5 });
  root.querySelectorAll(".wg").forEach((c) => (c.onchange = () => savePrefs({ widgets: [...root.querySelectorAll(".wg:checked")].map((x) => x.dataset.k) })));
  root.querySelectorAll(".hs").forEach((c) => (c.onchange = () => savePrefs({ hiddenSubjects: [...root.querySelectorAll(".hs:checked")].map((x) => x.dataset.s) })));
  const css = root.querySelector("#css");
  css.oninput = () => savePrefs({ customCss: css.value });
  root.querySelectorAll(".pre").forEach((b) => (b.onclick = () => { css.value = (css.value + "\n" + CSS_PRESETS[b.dataset.k]).trim(); savePrefs({ customCss: css.value }); }));
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
