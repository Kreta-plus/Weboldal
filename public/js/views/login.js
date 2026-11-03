import { post, get } from "../api.js";
import { esc } from "../util.js";

export function renderLogin(root, onDone) {
  let mode = "form", ac = new AbortController();
  const draw = () => {
    ac.abort(); ac = new AbortController();
    root.innerHTML = `<div class="login-wrap"><div class="card login">
      <div class="hero"><div class="logo">K<b>+</b></div><h1>KRÉTA Plusz</h1><div class="muted">Jegyek, órarend, statisztikák, a saját neveiddel.</div></div>
      ${mode === "form" ? `
      <form id="f" class="grid" style="gap:12px" autocomplete="on">
        <a href="#" id="alt" class="small btn primary login_via_kreta" style="text-align:center">Belépés a KRÉTA oldalán keresztül</a>
        <label class="f">Iskola OM-azonosítója<input class="input" name="inst" placeholder="pl. klik035123456" autocomplete="organization" required></label>
        <label class="f">Felhasználónév<input class="input" name="user" autocomplete="username" required></label>
        <label class="f">Jelszó<input class="input" name="pass" type="password" autocomplete="current-password" required></label>
        <label class="switch"><input type="checkbox" name="remember" checked><span>Maradjak belépve ezen az eszközön</span></label>
        <div id="err"></div>
        <button class="btn primary" style="justify-content:center" id="go">Belépés</button>
        <div class="small muted">A jelszavadat nem tároljuk. A belépés után csak egy titkosított megújító token marad a szerveren, így nem kell újra belépned.</div>
        <button type="button" class="btn" style="justify-content:center" id="demo">🧪 Belépés teszt fiókkal</button>
        <div class="small muted">A teszt fiók véletlen jegyekkel, órákkal, házikkal és dolgozatokkal van feltöltve, a KRÉTA-hoz nem kapcsolódik.</div>
      </form>` : `
      <div class="grid" style="gap:12px">
        <ol class="small muted" style="margin:0;padding-left:18px;display:grid;gap:6px">
          <li>Nyomd meg a gombot, és lépj be a KRÉTA oldalán.</li>
          <li>A végén hibaoldal vagy üres lap jön, ez így jó. Másold ki a címsorból a címet.</li>
          <li>Gyere vissza ide, és a belépés magától megtörténik.</li>
        </ol>
        <button class="btn primary" style="justify-content:center" id="open">Belépés a KRÉTA-ban</button>
        <button class="btn" style="justify-content:center" id="paste">Beillesztés és belépés</button>
        <label class="f">Vagy illeszd be ide a címet<input class="input" id="url" placeholder="https://…oauthredirect?code=…" autocomplete="off"></label>
        <div id="err"></div>
        <a href="#" id="back" class="small" style="text-align:center">Vissza a normál belépéshez</a>
      </div>`}
    </div></div>`;
    const err = (m) => (root.querySelector("#err").innerHTML = m ? `<div class="err">${esc(m)}</div>` : "");
    if (mode === "form") {
      root.querySelector("#alt").onclick = (e) => { e.preventDefault(); mode = "link"; draw(); };
      root.querySelector("#demo").onclick = async (e) => {
        e.target.disabled = true; err("");
        try { await post("/api/auth/demo"); onDone(); } catch (ex) { err(ex.message); e.target.disabled = false; }
      };
      root.querySelector("#f").onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target), btn = root.querySelector("#go");
        btn.disabled = true; btn.textContent = "Belépés…"; err("");
        try {
          await post("/api/auth/login", { inst: fd.get("inst"), user: fd.get("user"), pass: fd.get("pass"), remember: fd.get("remember") === "on" });
          onDone();
        } catch (ex) {
          err(ex.message + (ex.code === "login" ? "" : ""));
          btn.disabled = false; btn.textContent = "Belépés";
        }
      };
    } else {
      const urlIn = root.querySelector("#url"), pasteBtn = root.querySelector("#paste");
      const hasCode = (t) => /[?&]code=/.test(t || "");
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
          ac.abort();
          onDone();
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
      const onBack = () => { if (opened && !busy && document.visibilityState === "visible") fromClipboard(false); };
      window.addEventListener("focus", onBack, { signal: ac.signal });
      document.addEventListener("visibilitychange", onBack, { signal: ac.signal });

      root.querySelector("#back").onclick = (e) => { e.preventDefault(); mode = "form"; draw(); };
      root.querySelector("#open").onclick = async () => {
        err("");
        try { const r = await get("/api/auth/link/start"); opened = true; tried = ""; window.open(r.url, "_blank", "noopener"); } catch (ex) { err(ex.message); }
      };
      pasteBtn.onclick = () => fromClipboard(true);
      urlIn.oninput = () => { if (hasCode(urlIn.value)) finish(urlIn.value, false); };
      urlIn.onkeydown = (e) => { if (e.key === "Enter") finish(urlIn.value, true); };
    }
  };
  draw();
}
