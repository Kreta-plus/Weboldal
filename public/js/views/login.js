import { post, get } from "../api.js";
import { esc } from "../util.js";

export function renderLogin(root, onDone) {
  let mode = "form";
  const draw = () => {
    root.innerHTML = `<div class="login-wrap"><div class="card login">
      <div class="hero"><div class="logo">K+</div><h1>KRÉTA Plusz</h1><div class="muted">Jegyek, órarend, statisztikák, a saját neveiddel.</div></div>
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
        
      </form>` : `
      <div class="grid" style="gap:12px">
        <ol class="small muted" style="margin:0;padding-left:18px;display:grid;gap:6px">
          <li>Kattints a gombra, és lépj be a megnyíló KRÉTA oldalon.</li>
          <li>A végén az oldal hibát vagy üres lapot mutathat, ez normális.</li>
          <li>Másold ki a böngésző címsorából a teljes címet (benne a <code>?code=</code> résszel), és illeszd be ide.</li>
        </ol>
        <button class="btn" id="open">Megnyitás új lapon</button>
        <label class="f">Beillesztett cím<input class="input" id="url" placeholder="https://…oauthredirect?code=…"></label>
        <label class="f">Iskola OM-azonosítója (ha kéri)<input class="input" id="inst2"></label>
        <div id="err"></div>
        <button class="btn primary" style="justify-content:center" id="fin">Kész, belépek</button>
        <a href="#" id="back" class="small" style="text-align:center">Vissza a normál belépéshez</a>
      </div>`}
    </div></div>`;
    const err = (m) => (root.querySelector("#err").innerHTML = m ? `<div class="err">${esc(m)}</div>` : "");
    if (mode === "form") {
      root.querySelector("#alt").onclick = (e) => { e.preventDefault(); mode = "link"; draw(); };
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
      root.querySelector("#back").onclick = (e) => { e.preventDefault(); mode = "form"; draw(); };
      root.querySelector("#open").onclick = async () => {
        try { const r = await get("/api/auth/link/start"); window.open(r.url, "_blank", "noopener"); } catch (ex) { err(ex.message); }
      };
      root.querySelector("#fin").onclick = async () => {
        err("");
        try {
          await post("/api/auth/link/finish", { url: root.querySelector("#url").value, inst: root.querySelector("#inst2").value, remember: true });
          onDone();
        } catch (ex) { err(ex.message); }
      };
    }
  };
  draw();
}
