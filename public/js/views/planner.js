import { S as ST, subjName, allSubjects, savePrefs, profile, loadShared, sharedLabel } from "../state.js";
import { post, del } from "../api.js";
import { esc, linkify, iso, d0, fmtFull, relDay, subjColor, toast } from "../util.js";

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// Kinek szól: csak magamnak (a beállításokban, csak nálad), az egész osztálynak, vagy egy csoportnak (közösen, a szerveren).
// Az osztály és a csoportok a KRÉTA-órarendből jönnek; teszt fióknál a Beállításokban kézzel is megadhatók.
function audience() {
  const p = profile();
  return [["me", "🔒 Csak magamnak"], ...(p.cls ? [[`class:${p.cls}`, `👥 Egész osztály (${p.cls})`]] : []), ...p.groups.map((x) => [`group:${x}`, `👥 Csoport: ${x}`])];
}

export function render(root) {
  const p = ST.prefs, today = d0(new Date());
  const subs = allSubjects();
  const mine = (key, kind, textkey) => [
    ...(p[key] || []).map((x) => ({ ...x, body: x[textkey], priv: true })),
    ...ST.shared.items.filter((i) => i.kind === kind).map((i) => ({ id: i.id, subject: i.subject, date: i.date, body: i.text, sh: i })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const hw = mine("myHomework", "hw", "text"), ts = mine("myTests", "test", "topic");
  const opts = subs.map((s) => `<option value="${esc(s)}">${esc(subjName(s))}</option>`).join("");
  const aud = audience();
  const audSel = aud.length > 1 ? `<label class="f">Kinek írod fel?<select class="input" name="aud">${aud.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("")}</select>
      <span class="small muted aud-help">Az osztálynak vagy csoportnak felírtat mindenki látja, aki a KRÉTA szerint oda jár, és a neved is mellette lesz.</span></label>` : "";
  const when = (d) => { const x = d0(d + "T00:00"); return `<span class="chip ${x < today ? "bad" : x - today < 864e5 * 1.5 ? "warn" : ""}">${relDay(x)}</span>`; };
  const who = (it) => (it.priv ? "🔒 csak nálad" : `👥 ${esc(sharedLabel(it.sh))}${it.sh.mine ? " · te írtad fel" : it.sh.author ? ` · felírta: ${esc(it.sh.author)}` : ""}`);
  const row = (kind, it) => `<div class="item"><span class="dot" style="background:${subjColor(it.subject)}"></span>
    <div class="grow"><b>${esc(subjName(it.subject))}</b><div class="small muted" style="white-space:pre-wrap">${linkify(it.body)}</div>
      <div class="small muted">${fmtFull(it.date + "T00:00")} · ${who(it)}</div></div>
    ${when(it.date)}${it.priv || it.sh.canDelete ? `<button class="btn sm danger del" data-k="${kind}" data-id="${esc(String(it.id))}" data-sh="${it.priv ? "" : "1"}" aria-label="Törlés">✕</button>` : ""}</div>`;

  root.innerHTML = `<div class="topbar"><div><h1>Tervező</h1><div class="sub">Saját házik és dolgozatok: csak magadnak, vagy az osztályodnak / csoportodnak. A KRÉTA-ba nem kerülnek be.</div></div></div>
  <div class="grid g2">
    <div class="card"><h3>Házi feladat hozzáadása</h3>
      <form id="fh" class="grid" style="gap:10px">
        <label class="f">Tantárgy<select class="input" name="subject" required>${opts}</select></label>
        <label class="f">Határidő<input class="input" type="date" name="date" value="${iso(new Date())}" required></label>
        <label class="f">Feladat<textarea class="input" name="text" required maxlength="500" placeholder="pl. 45. oldal 3–5. feladat"></textarea></label>
        ${audSel}
        <button class="btn primary">Hozzáadás</button></form>
      <div class="list" style="margin-top:14px">${hw.map((h) => row("hw", h)).join("") || `<div class="empty">Még nincs felírt házi</div>`}</div></div>
    <div class="card"><h3>Dolgozat felírása</h3>
      <form id="ft" class="grid" style="gap:10px">
        <label class="f">Tantárgy<select class="input" name="subject" required>${opts}</select></label>
        <label class="f">Dátum<input class="input" type="date" name="date" value="${iso(new Date())}" required></label>
        <label class="f">Témakör<input class="input" name="topic" required maxlength="500" placeholder="pl. Másodfokú egyenletek"></label>
        ${audSel}
        <button class="btn primary">Felírás</button></form>
      <div class="list" style="margin-top:14px">${ts.map((t) => row("t", t)).join("") || `<div class="empty">Még nincs felírt dolgozat</div>`}</div></div>
  </div>`;

  const add = (form, key, textkey, kind) => (form.onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(form), aud = f.get("aud") || "me";
    if (!f.get("subject")) return;
    const text = f.get(textkey).trim();
    if (aud === "me") {
      savePrefs({ [key]: [...(p[key] || []), { id: uid(), subject: f.get("subject"), date: f.get("date"), [textkey]: text, ...(textkey === "text" ? { done: false } : {}) }] });
      return render(root);
    }
    const [scope, ...rest] = aud.split(":");
    const btn = form.querySelector("button"); btn.disabled = true;
    try {
      await post("/api/shared", { kind, scope, target: rest.join(":"), subject: f.get("subject"), date: f.get("date"), text });
      await loadShared();
      toast(scope === "class" ? "Felírva az egész osztálynak 👥" : "Felírva a csoportnak 👥");
      render(root);
    } catch (ex) { toast(ex.message); btn.disabled = false; }
  });
  add(root.querySelector("#fh"), "myHomework", "text", "hw");
  add(root.querySelector("#ft"), "myTests", "topic", "test");
  root.querySelectorAll(".del").forEach((b) => (b.onclick = async () => {
    if (b.dataset.sh) {
      if (!confirm("Törlöd? Mindenkinél eltűnik, akinek felírtad.")) return;
      try { await del(`/api/shared/${b.dataset.id}`); await loadShared(); } catch (ex) { return toast(ex.message); }
      return render(root);
    }
    const key = b.dataset.k === "hw" ? "myHomework" : "myTests";
    savePrefs({ [key]: p[key].filter((x) => x.id !== b.dataset.id) });
    render(root);
  }));
}
