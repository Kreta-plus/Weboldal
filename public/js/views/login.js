import { post, get } from "../api.js";
import { esc, linkify, fmtRange } from "../util.js";
import { openBugReport } from "../bugreport.js";
import { S } from "../state.js";

// mennyi idő után járjon le a belépés: a szerver SESSION_CHOICES kulcsai
const KEEP = [["1h", "1 óra múlva"], ["1d", "1 nap múlva"], ["7d", "1 hét múlva"], ["30d", "30 nap múlva"], ["365d", "1 év múlva"], ["never", "Soha"]];
const KEEP_KEY = "kp_keep";
const lastKeep = () => { try { const k = localStorage.getItem(KEEP_KEY); if (KEEP.some(([v]) => v === k)) return k; } catch {} return "365d"; };

// back: ha meg van adva, a belépett felhasználó csak a KRÉTA-kapcsolatot pótolja, és visszaléphet
export function renderLogin(root, onDone, { back } = {}) {
  const site = S.site || {}, when = fmtRange(site.maintenanceFrom, site.maintenanceUntil), notes = [];
  if (site.maintenance) notes.push(["warn", "🔧", `<b>Karbantartás.</b> ${esc(site.maintenanceText)}${when ? ` <b>${esc(when)}</b>.` : ""} Most csak a fejlesztők tudnak belépni.`]);
  else if (site.maintenanceUpcoming) notes.push(["warn", "🔧", `Karbantartás lesz: <b>${esc(when)}</b>. Ez idő alatt az oldal nem érhető el.`]);
  if (site.announcement) notes.push([site.announcementLevel || "info", "📢", linkify(site.announcement)]);
  const notice = notes.map(([lvl, ic, html]) => `<div class="announce ${esc(lvl)}"><span class="announce-ic" aria-hidden="true">${ic}</span><div class="grow">${html}</div></div>`).join("");
  root.innerHTML = `<div class="login-wrap"><div class="card login">
    <div class="hero"><img class="logo" src="/img/logo.svg" alt=""><h1>ZsírKréta</h1><div class="muted">Jegyek, órarend, statisztikák, a saját neveiddel.</div></div>
    ${notice}
    <div class="login-opts">
      <label class="keep-row"><span>A belépés lejár:</span>
        <select class="input" id="keep" aria-label="A belépés lejárata">${KEEP.map(([k, l]) => `<option value="${k}" ${k === lastKeep() ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <div class="small muted" id="keephint"></div>
      <label class="terms" id="termsrow"><input type="checkbox" id="terms">
        <span>Elolvastam és elfogadom az <a href="/aszf" target="_blank" rel="noopener">Általános Szerződési Feltételeket</a>.</span></label>
    </div>
    <ol class="steps">
      <li class="on" data-step="1">
        <b>Lépj be a KRÉTA-ban</b>
        <span class="small muted">A gomb új lapon megnyitja a KRÉTA saját belépőoldalát. Ott a szokásos neveddel és jelszavaddal lépj be.</span>
        <button class="btn primary" style="justify-content:center;margin-top:6px" id="open">Belépés a KRÉTA-ban</button>
      </li>
      <li data-step="2">
        <b>Másold ki a címet</b>
        <span class="small muted">A belépés után hibaoldal vagy üres lap jön, ez így jó. Másold ki a címsorból a teljes címet:</span>
        <div class="addr" aria-hidden="true"><span>mobil.e-kreta.hu/…/oauthredirect</span><mark>?code=…</mark></div>
        <span class="small muted">Telefonon: koppints a címsorra, majd a Másolás gombra.</span>
      </li>
      <li data-step="3">
        <b>Gyere vissza erre a lapra</b>
        <span class="small muted">A belépés magától megtörténik. Ha mégsem, nyomd meg ezt a gombot, vagy illeszd be a címet a mezőbe.</span>
        <button class="btn" style="justify-content:center;margin-top:6px" id="paste">Beillesztés és belépés</button>
        <input class="input" id="url" placeholder="https://…oauthredirect?code=…" autocomplete="off" aria-label="KRÉTA cím beillesztése">
      </li>
    </ol>
    <div id="err"></div>
    <div class="small muted">A jelszavad csak a KRÉTA oldalára kerül, mi nem látjuk és nem tároljuk. A belépés után a KRÉTA tokenje titkosítva ennek a böngészőnek a sütijében marad (a szerveren nem), így a választott ideig nem kell újra belépned.</div>
    ${back ? "" : `<details class="em-login"${site.maintenance ? " open" : ""}><summary>Belépés e-mail címmel</summary>
      <form class="em-form" id="emform">
        <input class="input" id="em" type="email" autocomplete="username" placeholder="E-mail cím" aria-label="E-mail cím" required>
        <input class="input" id="empw" type="password" autocomplete="current-password" placeholder="Jelszó" aria-label="Jelszó" required>
        <button class="btn primary" style="justify-content:center">Belépés</button>
        <span class="small muted">Ha a Beállításokban e-mail címet csatoltál a fiókodhoz, KRÉTA nélkül is beléphetsz vele. Ez a jelszó nem a KRÉTA-jelszavad, hanem amit ott megadtál. Ilyenkor ezen az eszközön a legutóbb letöltött adatokat látod, a friss adatokhoz a KRÉTA-ban is be kell lépni.</span>
      </form>
    </details>`}
    ${site.demoEnabled === false || back ? "" : `<a href="#" id="demo" class="small" style="text-align:center">Kipróbálom teszt fiókkal</a>`}
    ${back ? `<a href="#" id="back" class="small muted" style="text-align:center">← Vissza, most nem lépek be a KRÉTA-ban</a>` : ""}
    <a href="#" id="bug" class="small muted" style="text-align:center">📣 Hibát találtál, vagy van egy ötleted? Írd meg nekünk</a>
  </div></div>`;

  const $ = (s) => root.querySelector(s);
  const urlIn = $("#url"), pasteBtn = $("#paste"), ac = new AbortController();
  const err = (m) => ($("#err").innerHTML = m ? `<div class="err">${esc(m)}</div>` : "");
  const step = (n) => root.querySelectorAll(".steps li").forEach((li) => li.classList.toggle("on", +li.dataset.step === n));
  const hasCode = (t) => /[?&]code=/.test(t || "");
  const done = () => {
    ac.abort();
    try { sessionStorage.removeItem("kp_link"); } catch {}
    onDone();
  };
  const keepSel = $("#keep"), terms = $("#terms"), termsRow = $("#termsrow");
  const hint = () => ($("#keephint").textContent = { never: "Addig maradsz belépve, amíg ki nem lépsz. Közös gépen ne ezt válaszd.", "365d": "Közös gépen (pl. az iskolában) válassz rövidebb időt.", "30d": "Közös gépen (pl. az iskolában) válassz rövidebb időt." }[keepSel.value] || "");
  hint();
  keepSel.onchange = () => { hint(); try { localStorage.setItem(KEEP_KEY, keepSel.value); } catch {} };
  terms.onchange = () => termsRow.classList.remove("need");
  // minden belépéshez: a választott lejárat és az ÁSZF elfogadása; ha nincs elfogadva, null
  const opts = () => {
    if (terms.checked) return { keep: keepSel.value, terms: true };
    err("A belépéshez fogadd el az Általános Szerződési Feltételeket.");
    termsRow.classList.remove("need"); void termsRow.offsetWidth; termsRow.classList.add("need");
    terms.focus();
    return null;
  };
  let busy = false, opened = false, tried = "";

  // manual: a felhasználó maga kérte, ilyenkor a hibát is jelezzük
  const finish = async (text, manual) => {
    text = (text || "").trim();
    if (busy || (!manual && text === tried)) return;
    if (!hasCode(text)) {
      if (manual) err("Ez nem a jó cím. A KRÉTA belépés utáni lap címét másold ki, a végén ?code=… van.");
      return;
    }
    const o = opts();
    if (!o) return;
    busy = true; tried = text; err("");
    pasteBtn.disabled = true; pasteBtn.textContent = "Belépés…";
    try {
      await post("/api/auth/link/finish", { url: text, ...o });
      done();
    } catch (ex) {
      err(ex.message);
      busy = false; pasteBtn.disabled = false; pasteBtn.textContent = "Beillesztés és belépés";
    }
  };
  const fromClipboard = async (manual) => {
    try {
      const t = await navigator.clipboard.readText();
      if (hasCode(t)) { urlIn.value = t; return finish(t, manual); }
      if (manual) err("A vágólapon nincs KRÉTA-cím. Másold ki a címsorból a teljes címet.");
    } catch {
      if (manual) { err("A böngésző nem engedte a beolvasást, illeszd be a címet a mezőbe."); urlIn.focus(); }
    }
  };

  // visszatéréskor magától megnézzük a vágólapot
  const onBack = () => {
    if (!opened || busy || document.visibilityState !== "visible") return;
    step(3);
    fromClipboard(false);
  };
  window.addEventListener("focus", onBack, { signal: ac.signal });
  document.addEventListener("visibilitychange", onBack, { signal: ac.signal });

  // ha a lap ugyanebben a fülben ment a KRÉTA-ra, visszatérve a 3. lépésnél folytatjuk (az elfogadott ÁSZF-fel és a lejárattal)
  try {
    const k = sessionStorage.getItem("kp_link");
    if (k) { opened = true; step(3); terms.checked = true; if (KEEP.some(([v]) => v === k)) keepSel.value = k; hint(); }
  } catch {}

  $("#open").onclick = async () => {
    err("");
    if (!opts()) return;
    // a lapot még a kattintásban nyitjuk meg, különben a Safari letiltja a felugró ablakot
    const w = window.open("", "_blank");
    try {
      const r = await get("/api/auth/link/start");
      opened = true; tried = ""; step(2);
      try { sessionStorage.setItem("kp_link", keepSel.value); } catch {}
      if (w) { w.opener = null; w.location.href = r.url; } else location.href = r.url;
    } catch (ex) { w?.close(); err(ex.message); }
  };
  pasteBtn.onclick = () => fromClipboard(true);
  urlIn.oninput = () => { if (hasCode(urlIn.value)) finish(urlIn.value, false); };
  urlIn.onkeydown = (e) => { if (e.key === "Enter") finish(urlIn.value, true); };
  $("#bug").onclick = (e) => { e.preventDefault(); openBugReport(); };
  if ($("#emform")) $("#emform").onsubmit = async (e) => {
    e.preventDefault(); err("");
    const o = opts();
    if (!o) return;
    const b = $("#emform button");
    b.disabled = true; b.textContent = "Belépés…";
    try {
      const r = await post("/api/auth/email/login", { email: $("#em").value, pass: $("#empw").value, ...o });
      if (r.admin) location.hash = "dev"; // fejlesztői fiók: a fejlesztői oldal nyílik meg
      done();
    } catch (ex) {
      err(ex.message);
      b.disabled = false; b.textContent = "Belépés";
    }
  };
  if ($("#demo")) $("#demo").onclick = async (e) => {
    e.preventDefault(); err("");
    const o = opts();
    if (!o) return;
    try { await post("/api/auth/demo", o); done(); } catch (ex) { err(ex.message); }
  };
  if ($("#back")) $("#back").onclick = (e) => { e.preventDefault(); ac.abort(); back(); };
}
