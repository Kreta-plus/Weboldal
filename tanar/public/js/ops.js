// Írási műveletek a felületen: előnézet a szervertől → megerősítő ablak → jóváhagyás.
// A szerver dönti el, mi kerül be (ellenőrzés, megtisztítás); itt csak azt mutatjuk, amit ő visszaadott.
import { post } from "./api.js";
import { S } from "./state.js";
import { esc, gcls, toast } from "./util.js";

const VERB = { "grade.add": "Beírás", "grade.edit": "Módosítás", "grade.delete": "Törlés", "homework.add": "Kiadás", "homework.delete": "Törlés",
  "test.add": "Bejelentés", "test.delete": "Törlés", "absence.record": "Rögzítés",
  "lesson.topic": "Beírás", "lesson.log": "Naplózás", "note.add": "Beírás", "note.delete": "Törlés" };

// Visszaad: a commit eredménye, vagy null, ha a felhasználó mégsem küldte el / hiba volt.
export async function runOp(op, payload) {
  let pv;
  try { pv = await post("/api/ops/preview", { op, payload }); } catch (e) { toast(e.message); return null; }
  return new Promise((resolve) => {
    const bg = document.createElement("div");
    bg.className = "modal-bg";
    bg.innerHTML = `<div class="card modal op-modal ${pv.danger ? "danger" : ""}" role="dialog" aria-modal="true" aria-labelledby="op-t">
      <div class="row spread"><h3 id="op-t" style="margin:0">Ellenőrizd, mielőtt elküldöd</h3><button class="btn sm" data-x aria-label="Bezárás">✕</button></div>
      <div class="op-title">${esc(pv.title)}</div>
      <div class="op-lines">${pv.lines.map((l) => `<div class="op-l"><span>${esc(l.k)}</span>${l.grade ? `<span class="row" style="gap:8px">${l.v !== String(l.grade) ? `<span class="small muted">${esc(l.v)}</span>` : ""}<span class="gr ${gcls(l.grade)}">${l.grade}</span></span>` : `<b>${esc(l.v)}</b>`}</div>`).join("")}</div>
      ${pv.lines.length > 4 ? `<div class="small muted">${pv.lines.length} sor</div>` : ""}
      ${pv.simulated ? `<div class="op-note sim">🧪 Teszt fiók: a művelet csak szimulált, a KRÉTA-ba nem kerül semmi.</div>`
        : pv.enabled ? `<div class="op-note live">⚠️ Ez a KRÉTA-ba ír, hivatalos adatot módosít. A kérés nem ellenőrzött, nem hivatalos leírás alapján készült: utána nézd meg a KRÉTA-ban is.</div>`
        : `<div class="op-note off">🔒 Ez a művelet nincs bekapcsolva éles írásra, ezért nem küldöm el. Lent látod, pontosan mi menne ki. Bekapcsolás a szerveren: <code>KT_LIVE_WRITE=1 KT_LIVE_OPS=${esc(op)}</code></div>`}
      ${pv.request ? `<details class="op-req" ${pv.enabled ? "" : "open"}><summary>A KRÉTA-nak küldött kérés</summary>${pv.request.note ? `<div class="small" style="margin:6px 0;color:var(--g2)">⚠️ ${esc(pv.request.note)}</div>` : ""}
        <pre>${esc(`${pv.request.method} …/naplo/V3/${pv.request.path}${pv.request.params ? "?" + new URLSearchParams(pv.request.params) : ""}${pv.request.body !== undefined ? "\n\n" + JSON.stringify(pv.request.body, null, 2) : ""}`)}</pre></details>` : ""}
      <div class="row wrap"><button class="btn grow" data-x>${pv.simulated || pv.enabled ? "Mégse" : "Bezárás"}</button>${pv.simulated || pv.enabled ? `<button class="btn ${pv.danger ? "danger-fill" : "primary"} grow" id="op-go">${VERB[op] || "Küldés"}</button>` : ""}</div></div>`;
    document.body.appendChild(bg);
    const go = bg.querySelector("#op-go");
    const close = (v) => { bg.remove(); document.removeEventListener("keydown", onKey); resolve(v); };
    const onKey = (e) => { if (e.key === "Escape" && !go?.disabled) close(null); };
    document.addEventListener("keydown", onKey);
    bg.querySelectorAll("[data-x]").forEach((b) => (b.onclick = () => close(null)));
    bg.onclick = (e) => { if (e.target === bg && !go?.disabled) close(null); };
    (go || bg.querySelector("[data-x]")).focus();
    if (go) go.onclick = async () => {
      go.disabled = true; go.textContent = "Küldés…";
      bg.querySelectorAll("[data-x]").forEach((b) => (b.disabled = true));
      try {
        const r = await post("/api/ops/commit", { token: pv.token });
        toast(r.verified ? `Kész${r.simulated ? " (teszt fiók)" : ""}` : "Elküldve, de a visszaellenőrzés nem sikerült. Nézd meg a KRÉTA-ban!");
        close(r);
      } catch (e) {
        // nincs automatikus újrapróbálás: a felhasználó dönt, miután megnézte, mi történt
        toast(e.message);
        close(null);
      }
    };
  });
}

export const writeNote = () => (S.ov.demo ? `<span class="chip">🧪 teszt fiók, szimulált írás</span>` : S.ov.liveWrite ? `<span class="chip warn">⚠️ éles KRÉTA</span>` : `<span class="chip">🔒 csak előnézet</span>`);
