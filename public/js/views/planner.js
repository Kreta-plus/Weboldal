import { S as ST, subjName, allSubjects, savePrefs } from "../state.js";
import { esc, iso, d0, fmtFull, relDay, subjColor } from "../util.js";

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function render(root) {
  const p = ST.prefs, today = d0(new Date());
  const subs = allSubjects();
  const hw = (p.myHomework || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  const ts = (p.myTests || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  const opts = subs.map((s) => `<option value="${esc(s)}">${esc(subjName(s))}</option>`).join("");
  const when = (d) => { const x = d0(d + "T00:00"); return `<span class="chip ${x < today ? "bad" : x - today < 864e5 * 1.5 ? "warn" : ""}">${relDay(x)}</span>`; };
  const row = (kind, it, body) => `<div class="item"><span class="dot" style="background:${subjColor(it.subject)}"></span>
    <div class="grow"><b>${esc(subjName(it.subject))}</b><div class="small muted" style="white-space:pre-wrap">${esc(body)}</div><div class="small muted">${fmtFull(it.date + "T00:00")}</div></div>
    ${when(it.date)}<button class="btn sm danger del" data-k="${kind}" data-id="${esc(it.id)}">✕</button></div>`;

  root.innerHTML = `<div class="topbar"><div><h1>Tervező</h1><div class="sub">Saját házik és dolgozatok – csak nálad, a KRÉTA-ba nem kerül be.</div></div></div>
  <div class="grid g2">
    <div class="card"><h3>Házi feladat hozzáadása</h3>
      <form id="fh" class="grid" style="gap:10px">
        <label class="f">Tantárgy<select class="input" name="subject" required>${opts}</select></label>
        <label class="f">Határidő<input class="input" type="date" name="date" value="${iso(new Date())}" required></label>
        <label class="f">Feladat<textarea class="input" name="text" required maxlength="500" placeholder="pl. 45. oldal 3–5. feladat"></textarea></label>
        <button class="btn primary">Hozzáadás</button></form>
      <div class="list" style="margin-top:14px">${hw.map((h) => row("hw", h, h.text)).join("") || `<div class="empty">Még nincs saját házi</div>`}</div></div>
    <div class="card"><h3>Dolgozat felírása</h3>
      <form id="ft" class="grid" style="gap:10px">
        <label class="f">Tantárgy<select class="input" name="subject" required>${opts}</select></label>
        <label class="f">Dátum<input class="input" type="date" name="date" value="${iso(new Date())}" required></label>
        <label class="f">Témakör<input class="input" name="topic" required maxlength="500" placeholder="pl. Másodfokú egyenletek"></label>
        <button class="btn primary">Felírás</button></form>
      <div class="list" style="margin-top:14px">${ts.map((t) => row("t", t, t.topic)).join("") || `<div class="empty">Még nincs felírt dolgozat</div>`}</div></div>
  </div>`;

  const add = (form, key, textkey) => (form.onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(form);
    if (!f.get("subject")) return;
    savePrefs({ [key]: [...(p[key] || []), { id: uid(), subject: f.get("subject"), date: f.get("date"), [textkey]: f.get(textkey).trim(), ...(textkey === "text" ? { done: false } : {}) }] });
    render(root);
  });
  add(root.querySelector("#fh"), "myHomework", "text");
  add(root.querySelector("#ft"), "myTests", "topic");
  root.querySelectorAll(".del").forEach((b) => (b.onclick = () => {
    const key = b.dataset.k === "hw" ? "myHomework" : "myTests";
    savePrefs({ [key]: p[key].filter((x) => x.id !== b.dataset.id) });
    render(root);
  }));
}
