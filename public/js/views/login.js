import { post, get } from "../api.js";
import { esc } from "../util.js";

export function renderLogin(root, onDone) {
  root.innerHTML = `<div class="login-wrap"><div class="card login">
    <div class="hero"><div class="logo">K<b>+</b></div><h1>KRÉTA Plusz</h1><div class="muted">Jegyek, órarend, statisztikák, a saját neveiddel.</div></div>
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
    <div class="small muted">A jelszavad csak a KRÉTA oldalára kerül, mi nem látjuk és nem tároljuk. A belépés után csak egy titkosított megújító token marad a szerveren, így nem kell újra belépned.</div>
    <a href="#" id="demo" class="small" style="text-align:center">Kipróbálom teszt fiókkal</a>
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
  let busy = false, opened = false, tried = "";

  // manual: a felhasználó maga kérte, ilyenkor a hibát is jelezzük
  const finish = async (text, manual) => {
    text = (text || "").trim();
    if (busy || (!manual && text === tried)) return;
    if (!hasCode(text)) {
      if (manual) err("Ez nem a jó cím. A KRÉTA belépés utáni lap címét másold ki, a végén ?code=… van.");
      return;
    }
    busy = true; tried = text; err("");
    pasteBtn.disabled = true; pasteBtn.textContent = "Belépés…";
    try {
      await post("/api/auth/link/finish", { url: text, remember: true });
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

  // ha a lap ugyanebben a fülben ment a KRÉTA-ra, visszatérve a 3. lépésnél folytatjuk
  try { if (sessionStorage.getItem("kp_link")) { opened = true; step(3); } } catch {}

  $("#open").onclick = async () => {
    err("");
    // a lapot még a kattintásban nyitjuk meg, különben a Safari letiltja a felugró ablakot
    const w = window.open("", "_blank");
    try {
      const r = await get("/api/auth/link/start");
      opened = true; tried = ""; step(2);
      try { sessionStorage.setItem("kp_link", "1"); } catch {}
      if (w) { w.opener = null; w.location.href = r.url; } else location.href = r.url;
    } catch (ex) { w?.close(); err(ex.message); }
  };
  pasteBtn.onclick = () => fromClipboard(true);
  urlIn.oninput = () => { if (hasCode(urlIn.value)) finish(urlIn.value, false); };
  urlIn.onkeydown = (e) => { if (e.key === "Enter") finish(urlIn.value, true); };
  $("#demo").onclick = async (e) => {
    e.preventDefault(); err("");
    try { await post("/api/auth/demo"); done(); } catch (ex) { err(ex.message); }
  };
}
