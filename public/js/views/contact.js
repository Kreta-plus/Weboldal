import { get } from "../api.js";
import { esc, toast } from "../util.js";
import { mountFeedback } from "../bugreport.js";
import { S } from "../state.js";

// Kapcsolatok: a Discord-szerver (élő létszámmal) és üzenet a csapatnak
export function render(root) {
  root.innerHTML = `<div class="topbar"><div><h1>Kapcsolatok</h1><div class="sub">Itt éred el a fejlesztőket és a többi ZsírKréta-használót.</div></div></div>
  <div class="grid g2 contact">
    <section class="card dc">
      <div class="dc-head"><span class="dc-icon" aria-hidden="true">💬</span><div><h3>Discord</h3><div class="small muted" id="dcstat">Betöltés…</div></div></div>
      <p class="dc-txt">Kérdezz, ötletelj, segíts másoknak, és értesülj elsőként az újdonságokról. A fejlesztők is itt vannak.</p>
      <div class="row wrap"><a class="btn discord" id="dcjoin" target="_blank" rel="noopener noreferrer" hidden>Csatlakozom a szerverhez</a><button class="btn" id="dccopy" hidden>Link másolása</button></div>
      <div class="small muted" id="dcurl"></div>
    </section>
    <section class="card" id="fbbox"></section>
  </div>`;
  const box = root.querySelector("#fbbox");
  if (S.site.feedbackEnabled === false) box.innerHTML = `<h3>💬 Írj nekünk</h3><div class="muted">Az üzenetküldés most ki van kapcsolva. Addig a Discordon éred el a csapatot.</div>`;
  else mountFeedback(box, "msg");
  get("/api/contact/discord").then((d) => fill(root, d), () => fill(root, null));
}

// az oldal nem a KRÉTA-adatokból épül: adatfrissítéskor nem rajzoljuk újra, így a félig megírt üzenet megmarad
export function update() {}

function fill(root, d) {
  const join = root.querySelector("#dcjoin"), stat = root.querySelector("#dcstat");
  if (!join) return; // közben másik oldalra léptek
  if (!d?.url) { stat.textContent = "A meghívó most nem tölthető be, próbáld később."; return; }
  if (d.name) root.querySelector(".dc-head h3").textContent = d.name;
  if (d.icon) root.querySelector(".dc-icon").outerHTML = `<img class="dc-icon" src="${esc(d.icon)}" alt="">`;
  const parts = ["Discord-szerver"];
  if (Number.isInteger(d.online)) parts.push(`<span class="dc-on">${d.online} online</span>`);
  if (Number.isInteger(d.members)) parts.push(`${d.members} tag`);
  stat.innerHTML = parts.join(" · ");
  join.href = d.url; join.hidden = false;
  root.querySelector("#dcurl").textContent = d.url.replace(/^https?:\/\//, "");
  const copy = root.querySelector("#dccopy");
  copy.hidden = !navigator.clipboard;
  copy.onclick = () => navigator.clipboard.writeText(d.url).then(() => toast("Link kimásolva"), () => toast("Nem sikerült másolni"));
}
