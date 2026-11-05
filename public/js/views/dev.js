import { get, put } from "../api.js";
import { loadSite } from "../state.js";
import { esc, toast, ago, iso, fmtTime, fmtWhen, fmtRange, fmtLeft } from "../util.js";

// Fejlesztői oldal: az egész oldalra érvényes beállítások és egy kis áttekintés (csak fejlesztői fióknak)
const LEVELS = [["info", "📢 Infó"], ["warn", "⚠️ Figyelem"], ["danger", "⛔ Fontos"]];

const row = (label, desc, control, wide = false) => `<div class="set-row ${wide ? "wide" : ""}"><div class="set-l"><b>${label}</b>${desc ? `<div class="small muted">${desc}</div>` : ""}</div><div class="set-c">${control}</div></div>`;
const toggle = (id, on, disabled = false) => `<label class="switch"><input type="checkbox" id="${id}" ${on ? "checked" : ""} ${disabled ? "disabled" : ""}><span class="sr">be/ki</span></label>`;
const state = (on, yes = "működik", no = "nincs beállítva") => `<span class="dev-st ${on ? "on" : ""}">${on ? "● " + yes : "○ " + no}</span>`;
// datetime-local mező ↔ Unix-idő (a böngésző helyi idejében)
const toInput = (ts) => (ts ? `${iso(new Date(ts * 1000))}T${fmtTime(new Date(ts * 1000))}` : "");
const fromInput = (v) => (v ? Math.round(new Date(v).getTime() / 1000) : null);

function maintStatus(ms, s) {
  const now = Date.now() / 1000;
  if (ms === "active") return `🔧 <b>Folyamatban</b>${s.maintenanceUntil ? `, várható vége: ${esc(fmtWhen(s.maintenanceUntil))} (hátra van: ${fmtLeft(s.maintenanceUntil - now)})` : ", amíg ki nem kapcsolod"}. A diákok most nem érik el az oldalt.`;
  if (ms === "scheduled") return `🗓️ <b>Ütemezve:</b> ${esc(fmtRange(s.maintenanceFrom, s.maintenanceUntil))}. A diákok már látják az előzetes értesítést.`;
  if (ms === "ended") return `✓ <b>Befejeződött</b> (${esc(fmtWhen(s.maintenanceUntil))}).`;
  return "● Most nincs karbantartás.";
}

export async function render(root) {
  root.innerHTML = `<div class="topbar"><div><h1>Fejlesztői oldal</h1><div class="sub">Betöltés…</div></div></div><div class="grid g4">${"<div class='skeleton'></div>".repeat(4)}</div>`;
  let d;
  try { d = await get("/api/site/admin"); } catch (e) { root.innerHTML = `<div class="card empty">${esc(e.message)}</div>`; return; }
  const s = d.settings, st = d.stats, sys = d.system, ms = d.maintenanceStatus;
  root.innerHTML = `<div class="topbar"><div><h1>Fejlesztői oldal</h1><div class="sub">Az egész oldalra érvényes beállítások: mentés után mindenkinél azonnal érvényesek.</div></div></div>
  <div class="grid g4 kp">
    <div class="card kpi"><div class="v">${st.users}</div><div class="l">Diák (KRÉTA-fiók)</div><div class="d">+${st.newWeek} az elmúlt 7 napban</div></div>
    <div class="card kpi"><div class="v">${st.active24h}</div><div class="l">Aktív az elmúlt napban</div><div class="d">${st.sessions} élő munkamenet</div></div>
    <div class="card kpi"><div class="v">${st.email}</div><div class="l">E-mailes belépés</div><div class="d">${d.devs.filter((x) => x.claimed).length} fejlesztői fiók</div></div>
    <div class="card kpi"><div class="v">${st.demo}</div><div class="l">Teszt fiók</div><div class="d">7 nap után törlődnek</div></div>
  </div>
  <div class="grid g2 dev">
    <section class="card">
      <h3>📢 Közlemény</h3>
      <div class="small muted">Mindenkinél megjelenik a felület tetején és a belépőoldalon (bezárható). Üresen hagyva nincs közlemény.</div>
      <textarea class="input dev-ta" id="an" maxlength="300" placeholder="pl. Ma este 8 és 9 között karbantartás miatt nem érhető el az oldal.">${esc(s.announcement)}</textarea>
      <div class="seg" id="anlvl">${LEVELS.map(([k, l]) => `<button type="button" data-v="${k}" class="${s.announcementLevel === k ? "on" : ""}">${l}</button>`).join("")}</div>
    </section>
    <section class="card">
      <h3>🔧 Karbantartás</h3>
      <div class="maint-st ${ms}">${maintStatus(ms, s)}</div>
      ${row("Karbantartás most", "Azonnal elindul; ha megadod a végét, magától le is áll. Közben csak a fejlesztők használhatják az oldalt.", toggle("mt", s.maintenance && ms !== "ended"))}
      ${row("Mettől meddig", "A kezdetkor magától indul, a végén magától leáll. Előtte a diákok értesítést látnak az oldal tetején és a belépőoldalon, közben pedig kiírjuk nekik az időpontot és a hátralévő időt.",
        `<div class="mt-when">
          <label class="f">Kezdete<span class="mt-in"><input class="input" type="datetime-local" id="mtf" value="${toInput(s.maintenanceFrom)}"><button type="button" class="btn sm" data-clear="mtf" aria-label="Kezdet törlése">✕</button></span></label>
          <label class="f">Vége<span class="mt-in"><input class="input" type="datetime-local" id="mtu" value="${toInput(s.maintenanceUntil)}"><button type="button" class="btn sm" data-clear="mtu" aria-label="Vég törlése">✕</button></span></label>
        </div>`, true)}
      ${row("Üzenet a diákoknak", "", `<input class="input" id="mtt" maxlength="300" value="${esc(s.maintenanceText)}">`, true)}
      ${ms === "active" || ms === "scheduled" ? `<div class="row wrap" style="margin-top:12px"><button class="btn danger" id="mtend">${ms === "active" ? "Karbantartás befejezése most" : "Ütemezés törlése"}</button></div>` : ""}
    </section>
    <section class="card">
      <h3>⚙️ Funkciók</h3>
      ${row("Teszt fiók", sys.demoAllowed ? "„Kipróbálom teszt fiókkal” a belépőoldalon." : "A szerveren ki van kapcsolva (KP_DEMO=0), innen nem kapcsolható be.", toggle("demo", s.demoEnabled && sys.demoAllowed, !sys.demoAllowed))}
      ${row("Üzenetküldés", "Hibabejelentés, ötlet és üzenet a csapatnak (GlitchTip és Discord).", toggle("fb", s.feedbackEnabled))}
      ${row("Discord-meghívó", "A Kapcsolatok oldalon ez a link látszik.", `<input class="input" id="dc" maxlength="120" value="${esc(s.discordInvite)}" placeholder="https://discord.gg/…">`, true)}
    </section>
    <section class="card">
      <h3>🧑‍💻 Fejlesztői fiókok</h3>
      <div class="list">${d.devs.map((x) => `<div class="item"><div class="grow"><b>${esc(x.email)}</b><div class="small muted">${x.claimed ? `${esc(x.name || "Név még nincs betöltve")}${x.lastLogin ? ` · utoljára ${ago(x.lastLogin)}` : ""}` : "Még nincs fiókhoz csatolva"}</div></div>${state(x.claimed, "aktív", "szabad")}</div>`).join("")}</div>
      <div class="small muted" style="margin-top:10px">Fejlesztői címet a Beállítások › Fiók és adatok részben lehet csatolni; ehhez a szerver <code>.env</code> fájljában lévő fejlesztői kód (KP_DEV_CODE) kell.</div>
      <h3 style="margin-top:18px">🖥️ Rendszer</h3>
      <div class="list">
        <div class="item"><div class="grow">Környezet</div><b>${esc(sys.env)}</b></div>
        <div class="item"><div class="grow">GlitchTip hibakövetés</div>${state(sys.glitchtip)}</div>
        <div class="item"><div class="grow">Discord webhook</div>${state(sys.discordWebhook)}</div>
        <div class="item"><div class="grow">Fejlesztői kód (KP_DEV_CODE)</div>${state(sys.devCode, "beállítva")}</div>
      </div>
    </section>
  </div>
  <div class="dev-save"><span class="small muted" id="dirty">Nincs mentetlen változás.</span><button class="btn" id="undo">Elvetés</button><button class="btn primary" id="save">Mentés</button></div>`;

  let level = s.announcementLevel;
  const $ = (q) => root.querySelector(q);
  const collect = () => ({
    announcement: $("#an").value.trim(), announcementLevel: level,
    maintenance: $("#mt").checked, maintenanceFrom: fromInput($("#mtf").value), maintenanceUntil: fromInput($("#mtu").value), maintenanceText: $("#mtt").value.trim(),
    demoEnabled: sys.demoAllowed ? $("#demo").checked : s.demoEnabled, feedbackEnabled: $("#fb").checked, discordInvite: $("#dc").value.trim(),
  });
  const initial = collect(); // ehhez képest van mentetlen változás (lejárt karbantartásnál a kapcsoló már kikapcsolva látszik)
  const changed = () => JSON.stringify(collect()) !== JSON.stringify(initial);
  const mark = () => { $("#dirty").textContent = changed() ? "Mentetlen változás van." : "Nincs mentetlen változás."; };
  const saveSite = async (body, msg) => {
    await put("/api/site/admin", body);
    await loadSite();
    window.dispatchEvent(new Event("kp:site")); // a saját felületen is rögtön látszik a közlemény és a karbantartás
    toast(msg);
    render(root);
  };
  root.querySelectorAll("#anlvl button").forEach((b) => (b.onclick = () => {
    level = b.dataset.v;
    root.querySelectorAll("#anlvl button").forEach((x) => x.classList.toggle("on", x === b));
    mark();
  }));
  root.querySelectorAll("textarea, input").forEach((el) => { el.addEventListener("input", mark); el.addEventListener("change", mark); });
  root.querySelectorAll("[data-clear]").forEach((b) => (b.onclick = () => { $(`#${b.dataset.clear}`).value = ""; mark(); }));
  $("#mtend")?.addEventListener("click", async () => {
    try { await saveSite({ maintenance: false, maintenanceFrom: null, maintenanceUntil: null }, ms === "active" ? "Karbantartás befejezve" : "Ütemezés törölve"); } catch (e) { toast(e.message); }
  });
  $("#undo").onclick = () => render(root);
  $("#save").onclick = async () => {
    const body = collect(), now = Date.now() / 1000;
    if (body.maintenanceFrom && body.maintenanceUntil && body.maintenanceUntil <= body.maintenanceFrom) return toast("A karbantartás vége legyen később, mint a kezdete");
    if (body.maintenanceUntil && body.maintenanceUntil !== initial.maintenanceUntil && body.maintenanceUntil <= now) return toast("A megadott vége már elmúlt");
    const starts = (body.maintenance && !initial.maintenance) || (body.maintenanceFrom && body.maintenanceFrom <= now && body.maintenanceFrom !== initial.maintenanceFrom);
    if (starts && !confirm("Most elindul a karbantartás: amíg tart, a diákok nem tudják használni az oldalt. Folytatod?")) return;
    const btn = $("#save");
    btn.disabled = true;
    try { await saveSite(body, "Mentve, mindenkinél érvényes"); } catch (e) { toast(e.message); btn.disabled = false; }
  };
}

// nem a KRÉTA-adatokból épül: adatfrissítéskor nem rajzoljuk újra (a félig kitöltött mezők megmaradnak)
export function update() {}
