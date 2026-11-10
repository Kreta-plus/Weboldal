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

// egy űrlap többféle üzenetre, fent lehet váltani; csak hibánál kell alapból a technikai adat
const KINDS = {
  bug: {
    tab: "🐞 Hiba", title: "🐞 Hibabejelentés", tech: true,
    desc: "Írd le, mi történt, és mit csináltál előtte. Minél pontosabb, annál hamarabb javítjuk.",
    ph: "pl. A Jegyek oldalon nem jelenik meg a 9.A csoportátlaga, amióta…",
    short: "Írd le pár szóban, mi a hiba.", thanks: "Köszönjük, megkaptuk a bejelentést! 🙏",
  },
  idea: {
    tab: "💡 Ötlet", title: "💡 Ötlet", tech: false,
    desc: "Mi hiányzik, vagy mit csinálnál másképp? Minden ötletet elolvasunk.",
    ph: "pl. Jó lenne, ha az óra oldalán a házit is ki lehetne adni…",
    short: "Írd le pár szóban az ötleted.", thanks: "Köszönjük az ötletet! 💡",
  },
  msg: {
    tab: "💬 Üzenet", title: "💬 Írj nekünk", tech: false,
    desc: "Kérdésed van, vagy csak írnál nekünk? Az üzenet a fejlesztők Discord-csatornájába érkezik. Ha választ szeretnél, add meg, hol érünk el.",
    ph: "pl. Sziasztok! Az lenne a kérdésem, hogy…",
    short: "Írj legalább pár szót.", thanks: "Köszönjük, megkaptuk az üzeneted! ✉️",
  },
};

// a szerver mondja meg, mi küldhető (GlitchTip nélkül nincs hiba/ötlet, Discord nélkül nincs üzenet)
let enabledKinds = [];
export const setFeedbackKinds = (k) => { enabledKinds = Array.isArray(k) ? k : []; };
export const feedbackOn = () => enabledKinds.length > 0;
const usable = (order) => order.filter((k) => enabledKinds.includes(k));

let uid = 0;
// Az űrlap; kinds: a választható fajták sorrendben. onCancel nélkül nincs Mégsem gomb.
function feedbackForm(kinds, kind, prefill, { onDone, onCancel }) {
  const form = document.createElement("form"), id = `fb${++uid}`;
  form.className = "fb";
  form.setAttribute("aria-labelledby", id);
  form.innerHTML = `<div class="seg" role="group" aria-label="Mit küldesz?">${kinds.map((k) => `<button type="button" data-k="${k}">${KINDS[k].tab}</button>`).join("")}</div>
    <h3 id="${id}" class="fb-t"></h3>
    <div class="small muted fb-desc"></div>
    <textarea class="input fb-txt" maxlength="4000" required>${esc(prefill)}</textarea>
    <input class="input fb-con" maxlength="120" autocomplete="email" placeholder="E-mail vagy elérhetőség (nem kötelező)" aria-label="Elérhetőség, nem kötelező">
    <label class="switch"><input type="checkbox" class="fb-tech"><span>Technikai adatok csatolása</span></label>
    <div class="small muted">Melyik oldalon vagy, böngésző, képernyőméret és a legutóbbi hibaüzenetek (<span class="fb-n">${errors.length}</span> db). Diákok nevei, jegyek és jelszó nem kerülnek bele.</div>
    <div class="err fb-err" hidden></div>
    <div class="row">${onCancel ? `<button type="button" class="btn grow fb-no">Mégsem</button>` : ""}<button class="btn primary grow fb-send">Küldés</button></div>`;
  const $ = (s) => form.querySelector(s), txt = $(".fb-txt"), send = $(".fb-send");
  const err = (m) => { $(".fb-err").hidden = !m; $(".fb-err").textContent = m || ""; };
  const setKind = (k) => {
    kind = kinds.includes(k) ? k : kinds[0];
    const x = KINDS[kind];
    form.querySelectorAll(".seg button").forEach((b) => { b.classList.toggle("on", b.dataset.k === kind); b.setAttribute("aria-pressed", b.dataset.k === kind); });
    $(".fb-t").textContent = x.title; $(".fb-desc").textContent = x.desc; txt.placeholder = x.ph; $(".fb-tech").checked = x.tech;
    err("");
  };
  form.querySelectorAll(".seg button").forEach((b) => (b.onclick = () => { setKind(b.dataset.k); txt.focus(); }));
  form.addEventListener("focusin", () => ($(".fb-n").textContent = errors.length)); // az oldalba ágyazott űrlap sokáig nyitva lehet
  if (onCancel) $(".fb-no").onclick = onCancel;
  setKind(kind);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const text = txt.value.trim(), x = KINDS[kind];
    if (text.length < 5) return err(x.short);
    err(""); send.disabled = true; send.textContent = "Küldés…";
    const tech = $(".fb-tech").checked ? {
      view: location.hash.slice(1) || "", path: location.pathname, screen: `${innerWidth}x${innerHeight}@${devicePixelRatio}`,
      lang: navigator.language, theme: document.documentElement.dataset.theme || "", errors: [...errors],
    } : null;
    try {
      await post("/api/feedback", { kind, text, contact: $(".fb-con").value.trim(), tech });
      txt.value = "";
      onDone(x);
    } catch (ex) {
      err(ex.message);
    }
    send.disabled = false; send.textContent = "Küldés";
  };
  return form;
}

export function openBugReport(prefill = "", kind = "bug") {
  if (document.getElementById("bugmodal") || !feedbackOn()) return;
  const bg = document.createElement("div");
  bg.className = "modal-bg"; bg.id = "bugmodal";
  const close = () => { bg.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  const form = feedbackForm(usable(["bug", "idea", "msg"]), kind, prefill, { onDone: (x) => { close(); toast(x.thanks); }, onCancel: close });
  form.classList.add("card", "modal", "bug-modal");
  form.setAttribute("role", "dialog"); form.setAttribute("aria-modal", "true");
  bg.appendChild(form);
  document.body.appendChild(bg);
  document.addEventListener("keydown", onKey);
  bg.onclick = (e) => { if (e.target === bg) close(); };
  form.querySelector(".fb-txt").focus();
}
