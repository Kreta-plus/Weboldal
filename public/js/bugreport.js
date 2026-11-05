import { post } from "./api.js";
import { esc, toast } from "./util.js";

// a legutóbbi böngészős hibák, hogy a bejelentéshez csatolni lehessen őket (csak a memóriában)
const errors = [];
const keep = (msg) => { errors.push(`${new Date().toISOString().slice(11, 19)} ${msg}`.slice(0, 1500)); if (errors.length > 10) errors.shift(); };
window.addEventListener("error", (e) => keep(`${e.message} @ ${(e.filename || "").replace(location.origin, "")}:${e.lineno}:${e.colno}${e.error?.stack ? "\n" + e.error.stack : ""}`));
window.addEventListener("unhandledrejection", (e) => keep(`Promise: ${e.reason?.stack || e.reason?.message || e.reason}`));
const origError = console.error;
const str = (x) => { if (x instanceof Error) return x.stack || x.message; if (typeof x === "string") return x; try { return JSON.stringify(x); } catch { return String(x); } };
console.error = (...a) => { keep("console: " + a.map(str).join(" ")); origError.apply(console, a); };

export function openBugReport(prefill = "") {
  if (document.getElementById("bugmodal")) return;
  const bg = document.createElement("div");
  bg.className = "modal-bg"; bg.id = "bugmodal";
  bg.innerHTML = `<form class="card modal bug-modal" role="dialog" aria-modal="true" aria-labelledby="bugt">
    <h3 id="bugt">🐞 Hibabejelentés</h3>
    <div class="small muted">Írd le, mi történt, és mit csináltál előtte. Minél pontosabb, annál hamarabb javítjuk.</div>
    <textarea class="input" id="bugtxt" maxlength="4000" required placeholder="pl. A Jegyek oldalon nem jelenik meg a matek átlag, amióta…">${esc(prefill)}</textarea>
    <input class="input" id="bugcon" maxlength="120" autocomplete="email" placeholder="E-mail vagy elérhetőség (nem kötelező)" aria-label="Elérhetőség, nem kötelező">
    <label class="switch"><input type="checkbox" id="bugtech" checked><span>Technikai adatok csatolása</span></label>
    <div class="small muted">Melyik oldalon vagy, böngésző, képernyőméret és a legutóbbi hibaüzenetek (${errors.length} db). Jegyek, nevek és jelszó nem kerülnek bele.</div>
    <div class="err" id="bugerr" hidden></div>
    <div class="row"><button type="button" class="btn grow" id="bugno">Mégsem</button><button class="btn primary grow" id="bugsend">Küldés</button></div>
  </form>`;
  document.body.appendChild(bg);
  const $ = (s) => bg.querySelector(s), txt = $("#bugtxt"), send = $("#bugsend");
  const close = () => { bg.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  bg.onclick = (e) => { if (e.target === bg) close(); };
  $("#bugno").onclick = close;
  txt.focus();
  $("form").onsubmit = async (e) => {
    e.preventDefault();
    const text = txt.value.trim();
    const err = (m) => { $("#bugerr").hidden = !m; $("#bugerr").textContent = m || ""; };
    if (text.length < 5) return err("Írd le pár szóban, mi a hiba.");
    err(""); send.disabled = true; send.textContent = "Küldés…";
    const tech = $("#bugtech").checked ? {
      view: location.hash.slice(1) || "", path: location.pathname, screen: `${innerWidth}x${innerHeight}@${devicePixelRatio}`,
      lang: navigator.language, theme: document.documentElement.dataset.theme || "", errors: [...errors],
    } : null;
    try {
      await post("/api/feedback", { text, contact: $("#bugcon").value.trim(), tech });
      close();
      toast("Köszönjük, megkaptuk a bejelentést! 🙏");
    } catch (ex) {
      err(ex.message);
      send.disabled = false; send.textContent = "Küldés";
    }
  };
}
