// Műveletnapló: minden elküldött írás (siker, ellenőrizetlen, hiba), hogy visszakereshető legyen.
import { get } from "../api.js";
import { esc, fmtFull, fmtTime } from "../util.js";
import { statusChip } from "./dashboard.js";

const OPS = { "grade.add": "📘", "grade.edit": "✏️", "grade.delete": "🗑", "homework.add": "📝", "homework.delete": "🗑", "test.add": "📣", "test.delete": "🗑", "absence.record": "✋", "lesson.topic": "📒", "note.add": "💬", "note.delete": "🗑" };

export async function render(root) {
  const rows = await get("/api/t/log");
  root.innerHTML = `<div class="topbar"><div><h1>Műveletnapló</h1><div class="sub">Minden elküldött művelet ide kerül, a sikertelenek is. „Ellenőrizd” jelölésnél a visszaolvasás nem erősítette meg az írást, nézd meg a KRÉTA-ban.</div></div></div>
    <div class="card"><div class="list">${rows.map((r) => { const d = new Date(r.ts * 1000); return `<div class="item"><span class="log-ic" aria-hidden="true">${OPS[r.op] || "•"}</span>
      <div class="grow"><b>${esc(r.title)}</b><div class="small muted">${fmtFull(d)} ${fmtTime(d)}${r.count ? ` · ${r.count} sor` : ""}${r.simulated ? " · teszt fiók" : ""}${r.detail ? ` · ${esc(r.detail)}` : ""}</div></div>${statusChip(r.status)}</div>`; }).join("")
      || `<div class="empty">Még nem küldtél el műveletet.</div>`}</div></div>`;
}
