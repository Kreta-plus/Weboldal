// Egy óra részletei egy ablakban (az órarendből és a kezdőlapról nyílik): idő, terem, tanár és helyettes,
// téma, állapot, a saját jelenléted, és ha van, az órához tartozó dolgozat és házi.
import { subjName, teacherName, homework, tests } from "./state.js";
import { esc, linkify, hwText, fmtTime, fmtDate, DAYS, subjColor } from "./util.js";

// a KRÉTA jelenlét-szótára (TanuloJelenlet): Jelenlet, Hianyzas, Keses, Na
const PRESENCE = { jelenlet: ["Jelen voltál", "ok"], hianyzas: ["Hiányoztál", "bad"], keses: ["Késtél", "warn"] };

const row = (k, v) => (v ? `<div class="lm-row"><span class="muted">${k}</span><span>${v}</span></div>` : "");

export function openLesson(l) {
  if (!l || document.getElementById("lessonmodal")) return;
  const test = l.testId && tests().find((t) => String(t.id) === l.testId);
  const hw = l.hwId && homework().find((h) => String(h.id) === l.hwId);
  const pres = PRESENCE[(l.presence || "").toLowerCase()];
  const status = l.off ? `<span class="chip bad">elmarad</span>` : l.sub ? `<span class="chip warn">helyettesítés</span>` : "";
  const day = DAYS[(l.start.getDay() + 6) % 7];

  const bg = document.createElement("div");
  bg.className = "modal-bg"; bg.id = "lessonmodal";
  bg.innerHTML = `<div class="card modal lesson-modal" role="dialog" aria-modal="true" aria-labelledby="lm-t" style="--c:${subjColor(l.subject)}">
    <div class="lm-head"><div class="grow"><h3 id="lm-t">${l.nr ? l.nr + ". óra · " : ""}${esc(subjName(l.subject))}</h3>
      <div class="small muted">${day}, ${fmtDate(l.start)} · ${fmtTime(l.start)}–${fmtTime(l.end)}</div></div>${status}</div>
    <div class="lm-rows">
      ${row("Terem", esc(l.room || "—"))}
      ${l.sub ? row("Helyettes tanár", `<b>${esc(teacherName(l.sub))}</b>`) + row("Eredeti tanár", esc(teacherName(l.teacher) || "—")) : row("Tanár", esc(teacherName(l.teacher) || "—"))}
      ${row("Osztály / csoport", esc(l.group))}
      ${row("Téma", l.topic ? esc(l.topic) : "")}
      ${row("Állapot", esc(l.off ? "Elmarad" : l.state))}
      ${pres ? row("Jelenlét", `<span class="chip ${pres[1]}">${pres[0]}</span>`) : ""}
      ${l.type && !/^(TanitasiOra|OrarendiOra)$/.test(l.type) ? row("Típus", esc(l.typeText || l.type)) : ""}
      ${row("Éves óraszám", l.yearNr ? `${l.yearNr}. óra a tanévben` : "")}
      ${l.digital ? row("Digitális óra", "igen") : ""}
      ${l.files ? row("Csatolmány", `${l.files} db (a KRÉTA-ban nézhető meg)`) : ""}
    </div>
    ${l.test ? `<div class="lm-box warn"><b>📣 Dolgozat ezen az órán</b>${test ? `<div>${esc(test.kind || "Számonkérés")}${test.topic ? ": " + esc(test.topic) : ""}</div>` : `<div class="small">A részletek a Házi oldalon jelennek meg, amikor a KRÉTA-ból betöltődnek.</div>`}</div>` : ""}
    ${l.hw ? `<div class="lm-box"><b>📝 Házi feladat ehhez az órához</b>${hw ? `<div class="small muted">Határidő: ${fmtDate(hw.due)}${hw.done ? " · kész ✓" : ""}</div><div style="white-space:pre-wrap;margin-top:4px">${linkify(hwText(hw.text))}</div>` : `<div class="small">A szövege a Házi oldalon látszik, ha az időszaka be van töltve.</div>`}</div>` : ""}
    ${l.fake ? `<div class="small muted">Ez egy teszt óra (fejlesztői mód), nem a KRÉTA-ból jön.</div>` : ""}
    <div class="row"><button class="btn grow" data-x>Bezárás</button></div></div>`;
  const close = () => { bg.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  bg.onclick = (e) => { if (e.target === bg || e.target.closest("[data-x]")) close(); };
  document.addEventListener("keydown", onKey);
  document.body.appendChild(bg);
  bg.querySelector("[data-x]").focus();
}
