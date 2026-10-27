// Instagram story kép (1080×1920): amire büszke lehetsz + az alkalmazás logója.
import { S as ST, shownName, numericGrades, absences, avgOf, bySubject, subjName } from "./state.js";
import { esc, f2 } from "./util.js";

const W = 1080, H = 1920;
const FONT = '-apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const THEMES = {
  accent: { name: "Színes", text: "#fff", sub: "rgba(255,255,255,.78)", card: "rgba(255,255,255,.16)", border: "rgba(255,255,255,.28)" },
  dark: { name: "Sötét", bg: ["#0d0e1a", "#1c1f4a"], text: "#eef0ff", sub: "rgba(238,240,255,.7)", card: "rgba(255,255,255,.08)", border: "rgba(255,255,255,.16)" },
  light: { name: "Világos", bg: ["#f3f4fb", "#dfe2f6"], text: "#1b1d3a", sub: "rgba(27,29,58,.65)", card: "rgba(255,255,255,.85)", border: "rgba(27,29,58,.1)" },
};

function mix(hex, to, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = p(hex), b = p(to);
  return "#" + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

function collect() {
  const gs = numericGrades(), ab = absences(), now = Date.now();
  const avg = avgOf(gs);
  const fives = gs.filter((g) => g.value === 5).length;
  const subs = bySubject().filter((s) => s.avg != null).sort((a, b) => b.avg - a.avg);
  const last30 = gs.filter((g) => now - g.date < 30 * 864e5), prev = gs.filter((g) => g.date < now - 30 * 864e5);
  const avgPrev = avgOf(prev), delta = avg != null && avgPrev != null && last30.length ? avg - avgPrev : null;
  let streak = 0, cur = 0;
  [...gs].reverse().forEach((g) => { cur = g.value >= 4 ? cur + 1 : 0; streak = Math.max(streak, cur); });
  const unexc = ab.filter((a) => !a.ok && !a.na).length;
  const good = subs.filter((s) => s.avg >= 4.5).length;
  const items = [
    { k: "fives", icon: "⭐", value: String(fives), label: "ötös jegy", on: fives > 0, show: fives > 0 },
    { k: "best", icon: "🏆", value: subs[0] ? f2(subs[0].avg) : "", label: subs[0] ? `legjobb tárgy: ${subjName(subs[0].subject)}` : "", on: !!subs[0], show: !!subs[0] },
    { k: "streak", icon: "🔥", value: String(streak), label: "4–5-ös jegy egymás után", on: streak >= 3, show: streak > 0 },
    { k: "delta", icon: "📈", value: delta == null ? "" : (delta >= 0 ? "+" : "−") + f2(Math.abs(delta)), label: "átlag az elmúlt 30 napban", on: delta != null && delta > 0.005, show: delta != null },
    { k: "good", icon: "💪", value: String(good), label: "tantárgy 4,5 felett", on: good > 0, show: good > 0 },
    { k: "abs", icon: "✅", value: "0", label: "igazolatlan mulasztás", on: unexc === 0 && ab.length >= 0, show: unexc === 0 },
    { k: "count", icon: "📚", value: String(gs.length), label: "érdemjegy eddig", on: false, show: gs.length > 0 },
  ].filter((i) => i.show);
  return { avg, items, count: gs.length };
}

function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }

function fit(c, text, max, size, weight = 700) {
  let s = size;
  do { c.font = `${weight} ${s}px ${FONT}`; s -= 2; } while (c.measureText(text).width > max && s > 20);
}
function wrap(c, text, x, y, max, lh, maxLines = 2) {
  const words = text.split(" "), lines = [];
  let line = "";
  for (const w of words) {
    const t = line ? line + " " + w : w;
    if (c.measureText(t).width > max && line) { lines.push(line); line = w; } else line = t;
  }
  lines.push(line);
  lines.slice(0, maxLines).forEach((l, i) => c.fillText(i === maxLines - 1 && lines.length > maxLines ? l + "…" : l, x, y + i * lh));
  return Math.min(lines.length, maxLines);
}

export function drawStory(canvas, o) {
  const c = canvas.getContext("2d"), th = THEMES[o.theme], acc = ST.prefs.accent || "#6c5ce7";
  canvas.width = W; canvas.height = H;
  const g = c.createLinearGradient(0, 0, W * 0.6, H);
  if (o.theme === "accent") { g.addColorStop(0, mix(acc, "#000000", 0.15)); g.addColorStop(1, mix(acc, "#ffffff", 0.05)); }
  else { g.addColorStop(0, th.bg[0]); g.addColorStop(1, th.bg[1]); }
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  // dekoratív körök
  c.fillStyle = o.theme === "light" ? mix(acc, "#ffffff", 0.75) + "88" : "rgba(255,255,255,.07)";
  c.beginPath(); c.arc(W - 120, 330, 380, 0, 7); c.fill();
  c.beginPath(); c.arc(60, H - 360, 320, 0, 7); c.fill();
  c.textAlign = "center"; c.textBaseline = "alphabetic";

  // logó + név (a story felső biztonsági sávja alatt)
  const lg = c.createLinearGradient(W / 2 - 80, 250, W / 2 + 80, 410);
  lg.addColorStop(0, acc); lg.addColorStop(1, mix(acc, "#ffffff", 0.35));
  c.save(); c.shadowColor = "rgba(0,0,0,.3)"; c.shadowBlur = 40; c.shadowOffsetY = 14;
  rr(c, W / 2 - 80, 250, 160, 160, 48); c.fillStyle = lg; c.fill(); c.restore();
  c.fillStyle = "#fff"; c.font = `800 84px ${FONT}`; c.fillText("K+", W / 2, 360);
  c.fillStyle = th.text; c.font = `800 58px ${FONT}`; c.fillText("KRÉTA Plusz", W / 2, 490);

  // fejléc
  c.fillStyle = th.sub; c.font = `600 44px ${FONT}`;
  c.fillText(o.name ? `${o.name} ezzel büszkélkedhet` : "Erre vagyok büszke", W / 2, 580);

  // nagy átlag kártya
  c.fillStyle = th.card; rr(c, 80, 620, W - 160, 330, 56); c.fill();
  c.strokeStyle = th.border; c.lineWidth = 3; c.stroke();
  c.fillStyle = th.text; c.font = `800 190px ${FONT}`; c.fillText(f2(o.avg), W / 2, 810);
  c.fillStyle = th.sub; c.font = `600 42px ${FONT}`; c.fillText(`átlag · ${o.count} jegy alapján`, W / 2, 890);

  // csempék
  const cols = 2, tw = 440, th_ = 200, gap = 40, startY = 990;
  o.items.forEach((it, i) => {
    const x = 80 + (i % cols) * (tw + gap), y = startY + Math.floor(i / cols) * (th_ + 28);
    c.fillStyle = th.card; rr(c, x, y, tw, th_, 40); c.fill(); c.strokeStyle = th.border; c.lineWidth = 3; c.stroke();
    c.textAlign = "left"; c.font = `64px ${FONT}`; c.fillStyle = th.text; c.fillText(it.icon, x + 32, y + 100);
    fit(c, it.value, tw - 190, 92, 800); c.fillStyle = th.text; c.fillText(it.value, x + 130, y + 104);
    c.fillStyle = th.sub; c.font = `600 30px ${FONT}`; wrap(c, it.label, x + 32, y + 150, tw - 64, 34, 2);
    c.textAlign = "center";
  });

  // alsó felirat
  const rows = Math.ceil(o.items.length / cols), endY = startY + rows * (th_ + 28);
  const fy = Math.min(1640, Math.max(endY + 30, 1500));
  c.fillStyle = th.text; c.font = `800 46px ${FONT}`;
  c.fillText(o.footer || "Próbáld ki te is!", W / 2, fy + 40);
  c.fillStyle = th.sub; c.font = `600 34px ${FONT}`;
  c.fillText("Jegyek, órarend, statisztikák egy helyen", W / 2, fy + 92);
}

export function openStory() {
  const data = collect();
  if (!data.count) return alert("Még nincs jegy, amiből képet lehetne csinálni.");
  const o = { theme: "accent", name: "", footer: "Próbáld ki te is: KRÉTA Plusz", ...data, items: data.items };
  const picked = new Set(data.items.filter((i) => i.on).map((i) => i.k));
  let useName = false;
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `<div class="card modal story-modal" role="dialog" aria-modal="true">
    <div class="row spread"><h3 style="margin:0">📸 Story kép</h3><button class="btn sm" id="st-x">✕</button></div>
    <div class="story-grid"><canvas id="st-cv" class="story-cv"></canvas>
      <div class="grid" style="gap:12px;align-content:start">
        <div><div class="small muted" style="margin-bottom:6px">Stílus</div><div class="seg" id="st-th">${Object.entries(THEMES).map(([k, t]) => `<button data-v="${k}" class="${k === o.theme ? "on" : ""}">${t.name}</button>`).join("")}</div></div>
        <div><div class="small muted" style="margin-bottom:6px">Mi kerüljön rá? (max. 6)</div><div class="chips" id="st-items">${data.items.map((i) => `<label class="chip" style="cursor:pointer"><input type="checkbox" data-k="${i.k}" ${picked.has(i.k) ? "checked" : ""}> ${i.icon} ${esc(i.label.split(":")[0])}</label>`).join("")}</div></div>
        <label class="switch"><input type="checkbox" id="st-name"><span>A nevem is legyen rajta (${esc(shownName())})</span></label>
        <label class="f">Alsó felirat<input class="input" id="st-ft" maxlength="60" value="${esc(o.footer)}"></label>
        <div class="row wrap"><button class="btn primary grow" id="st-dl">⬇ Letöltés</button><button class="btn grow" id="st-sh" hidden>↗ Megosztás</button></div>
        <div class="small muted">Az átlagodat és a jegyeid számát tartalmazza a kép, ezért csak akkor posztold, ha ezt meg szeretnéd mutatni. A kép a böngésződben készül, a szerverre nem kerül fel.</div>
      </div></div></div>`;
  document.body.appendChild(bg);
  const cv = bg.querySelector("#st-cv");
  const draw = () => drawStory(cv, { ...o, name: useName ? shownName() : "", items: data.items.filter((i) => picked.has(i.k)).slice(0, 6) });
  const close = () => { bg.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  bg.querySelector("#st-x").onclick = close;
  bg.onclick = (e) => { if (e.target === bg) close(); };
  bg.querySelectorAll("#st-th button").forEach((b) => (b.onclick = () => { o.theme = b.dataset.v; bg.querySelectorAll("#st-th button").forEach((x) => x.classList.toggle("on", x === b)); draw(); }));
  bg.querySelectorAll("#st-items input").forEach((i) => (i.onchange = () => { i.checked ? picked.add(i.dataset.k) : picked.delete(i.dataset.k); draw(); }));
  bg.querySelector("#st-name").onchange = (e) => { useName = e.target.checked; draw(); };
  bg.querySelector("#st-ft").oninput = (e) => { o.footer = e.target.value; draw(); };
  const blob = () => new Promise((res) => cv.toBlob(res, "image/png"));
  bg.querySelector("#st-dl").onclick = async () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(await blob()); a.download = "kreta-plusz-story.png"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  const sh = bg.querySelector("#st-sh");
  const canShareFiles = () => { try { return !!navigator.canShare?.({ files: [new File([], "x.png", { type: "image/png" })] }); } catch { return false; } };
  if (canShareFiles()) {
    sh.hidden = false;
    sh.onclick = async () => {
      const f = new File([await blob()], "kreta-plusz-story.png", { type: "image/png" });
      try { await navigator.share({ files: [f], title: "KRÉTA Plusz" }); } catch {}
    };
  }
  draw();
}
