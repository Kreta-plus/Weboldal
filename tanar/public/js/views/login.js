import { post, get } from "../api.js";
import { esc } from "../util.js";
import { openBugReport, setFeedbackKinds } from "../bugreport.js";

const normInst = (v) => v.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\.e-kreta\.hu.*$/, "");

export async function renderLogin(root, onDone) {
  let info = { demo: true, kreta: false, link: false };
  try { info = await get("/api/auth/info"); } catch {}
  setFeedbackKinds(info.feedback);
  root.innerHTML = `<div class="login-wrap"><div class="card login">
    <div class="hero"><img class="logo" src="/img/logo.svg" alt=""><h1>ZsírKréta</h1><div class="muted">Tanári felület: órarend, jegyek, mulasztások, házi feladatok egy helyen.</div></div>
    ${info.link ? `<ol class="steps">
      <li class="on" data-step="1">
        <b>Lépj be a KRÉTA-ban</b>
        <span class="small muted">A gomb új lapon megnyitja a KRÉTA saját belépőoldalát. Ott a tanári KRÉTA-fiókoddal lépj be, ahogy szoktál.</span>
        <button class="btn primary" style="justify-content:center;margin-top:6px" id="open">Belépés a KRÉTA-ban</button>
      </li>
      <li data-step="2">
        <b>Másold ki a címet</b>
        <span class="small muted">A belépés után hibaoldal vagy üres lap jön, ez így jó. Másold ki a címsorból a teljes címet:</span>
        <div class="addr" aria-hidden="true"><span>mobil.e-kreta.hu/naplo/prod/oauthredirect</span><mark>?code=…</mark></div>
        <span class="small muted">Telefonon: koppints a címsorra, majd a Másolás gombra.</span>
      </li>
      <li data-step="3">
        <b>Gyere vissza erre a lapra</b>
        <span class="small muted">A belépés magától megtörténik. Ha mégsem, nyomd meg ezt a gombot, vagy illeszd be a címet a mezőbe.</span>
        <button class="btn" style="justify-content:center;margin-top:6px" id="paste">Beillesztés és belépés</button>
        <input class="input" id="url" placeholder="https://mobil.e-kreta.hu/…?code=…" autocomplete="off" aria-label="KRÉTA cím beillesztése">
      </li>
    </ol>` : ""}
    ${info.kreta ? `<details class="login-alt"${info.link ? "" : " open"}><summary>Belépés jelszóval, ezen az oldalon</summary>
    <form id="lf" class="grid" style="gap:10px;margin-top:10px" autocomplete="on">
      <label class="f">Iskola azonosító (KRÉTA-cím eleje)<input class="input" id="inst" name="inst" placeholder="pl. klik035046001" autocomplete="organization" required></label>
      <label class="f">Felhasználónév<input class="input" id="user" name="username" autocomplete="username" required></label>
      <label class="f">Jelszó<input class="input" id="pass" name="password" type="password" autocomplete="current-password" required></label>
      <button class="btn" style="justify-content:center" id="real" type="submit">Belépés</button></form>
      <div class="small muted" style="margin-top:8px">Ilyenkor a program tölti ki helyetted a KRÉTA belépőoldalát. Ha a KRÉTA captchát vagy kétlépcsős azonosítást kér, ez nem megy, használd a fenti lépéseket.</div></details>` : ""}
    <div id="err"></div>
    ${info.kreta ? `<div class="small muted">Nem hivatalos program. A jelszavad csak a KRÉTA felé megy, nem tároljuk, csak egy titkosított token marad ezen a gépen.
      Minden írás előtt megmutatja, pontosan mi megy ki a KRÉTA-ba, és csak a jóváhagyásod után küldi el.</div>` : ""}
    ${info.demo ? `${info.kreta ? `<div class="login-sep"><span>vagy</span></div>` : ""}
      <button class="btn${info.kreta ? "" : " primary"}" style="justify-content:center" id="demo">Kipróbálom teszt fiókkal</button>
      <div class="small muted">A teszt fiók egy kitalált iskolát generál osztályokkal, diákokkal és jegyekkel. Minden művelet kipróbálható, de csak szimulált: a KRÉTA-ba semmi nem kerül.</div>` : ""}
    ${info.feedback?.length ? `<a href="#" id="bug" class="small muted" style="text-align:center">📣 Hibát találtál, vagy van egy ötleted? Írd meg nekünk</a>` : ""}
  </div></div>`;

  const $ = (s) => root.querySelector(s);
  const err = (m) => ($("#err").innerHTML = m ? `<div class="err">${esc(m)}</div>` : "");
  const ac = new AbortController();
  const done = () => {
    ac.abort();
    try { sessionStorage.removeItem("kt_link"); } catch {}
    onDone();
  };

  $("#bug")?.addEventListener("click", (e) => { e.preventDefault(); openBugReport(); });
  const demo = $("#demo");
  if (demo) demo.onclick = async () => {
    err(""); demo.disabled = true; demo.textContent = "Iskola generálása…";
    try { await post("/api/auth/demo"); done(); } catch (ex) { err(ex.message); demo.disabled = false; demo.textContent = "Kipróbálom teszt fiókkal"; }
  };

  const lf = $("#lf");
  if (lf) lf.onsubmit = async (e) => {
    e.preventDefault(); err("");
    const btn = $("#real");
    btn.disabled = true; btn.textContent = "Belépés…";
    try {
      await post("/api/auth/login", { inst: normInst($("#inst").value), user: $("#user").value.trim(), pass: $("#pass").value });
      done();
    } catch (ex) { err(ex.message); btn.disabled = false; btn.textContent = "Belépés"; }
  };

  if (info.link) linkFlow($, err, done, ac.signal, root);
}

// belépés a KRÉTA saját oldalán: a végén kapott címet (…?code=…) a tanár visszahozza ide
function linkFlow($, err, done, signal, root) {
  const urlIn = $("#url"), pasteBtn = $("#paste");
  const step = (n) => root.querySelectorAll(".steps li").forEach((li) => li.classList.toggle("on", +li.dataset.step === n));
  const hasCode = (t) => /[?&](code|error)=/.test(t || "");
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
  window.addEventListener("focus", onBack, { signal });
  document.addEventListener("visibilitychange", onBack, { signal });

  // ha a lap ugyanebben a fülben ment a KRÉTA-ra, visszatérve a 3. lépésnél folytatjuk
  try { if (sessionStorage.getItem("kt_link")) { opened = true; step(3); } } catch {}

  $("#open").onclick = async () => {
    err("");
    // a lapot még a kattintásban nyitjuk meg, különben a Safari letiltja a felugró ablakot
    const w = window.open("", "_blank");
    try {
      const r = await get("/api/auth/link/start");
      opened = true; tried = ""; step(2);
      try { sessionStorage.setItem("kt_link", "1"); } catch {}
      if (w) { w.opener = null; w.location.href = r.url; } else location.href = r.url;
    } catch (ex) { w?.close(); err(ex.message); }
  };
  pasteBtn.onclick = () => fromClipboard(true);
  urlIn.oninput = () => { if (hasCode(urlIn.value)) finish(urlIn.value, false); };
  urlIn.onkeydown = (e) => { if (e.key === "Enter") finish(urlIn.value, true); };
}
