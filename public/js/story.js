// Instagram story kép (1080×1920): amire büszke lehetsz + az alkalmazás logója.
import { S as ST, shownName, numericGrades, absences, avgOf, bySubject, subjName } from "./state.js";
import { esc, f2, isLight } from "./util.js";

const W = 1080, H = 1920;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif';
const DISPLAY = '"URW Gothic", "Century Gothic", sans-serif'; // címek és számok, mint az oldalon
const INK = "#1d1510";
const HL = ["#ffe14d", "#5cc8ff", "#ff5fa2", "#45e3a0", "#ff9f43", "#b79cff"]; // szövegkiemelő színek a csempékhez
const THEMES = {
  night: { name: "Íróasztal", bg: "#221a15", text: "#f6efe6", sub: "rgba(246,239,230,.72)" },
  accent: { name: "Kiemelő", text: INK, sub: "rgba(29,21,16,.72)" },
  light: { name: "Világos", bg: "#eef1fa", text: INK, sub: "rgba(29,21,16,.65)" },
};

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

// a public/img/logo.svg rajza (64×64-es rácson); a „Kiemelő” témán sötét lapon sárga a Z
function drawLogo(c, x, y, size, dark) {
  c.save(); c.translate(x, y); c.scale(size / 64, size / 64);
  rr(c, 0, 0, 64, 64, 16); c.fillStyle = dark ? INK : "#ffe14d"; c.fill();
  c.strokeStyle = dark ? "#ffe14d" : INK; c.lineWidth = 5.5; c.lineCap = "round"; c.lineJoin = "round";
  c.stroke(new Path2D("M11 21.5c6-.8 12-1 18.5-.5L11.5 43.5c6.5-.9 13-1 19.5-.5"));
  c.translate(32.5, 42); c.rotate(Math.PI / 4);
  c.fillStyle = "#b8175f"; c.fill(new Path2D("M-2 0h4l4-8h-12z"));
  rr(c, -6, -31, 12, 23.5, 2); c.fillStyle = "#e0307e"; c.fill();
  c.fillStyle = INK; c.fillRect(-6, -25, 12, 13);
  c.fillStyle = "#ffe14d"; c.fillRect(-6, -20, 12, 3);
  c.restore();
}

export function drawStory(canvas, o) {
  const c = canvas.getContext("2d"), acc = ST.prefs.accent || "#ffe14d";
  const th = { ...THEMES[o.theme] };
  if (o.theme === "accent") { th.bg = acc; if (!isLight(acc)) { th.text = "#fff"; th.sub = "rgba(255,255,255,.75)"; } }
  canvas.width = W; canvas.height = H;
  c.fillStyle = th.bg; c.fillRect(0, 0, W, H);
  c.textAlign = "center"; c.textBaseline = "alphabetic";

  // logó + név (a story felső biztonsági sávja alatt)
  drawLogo(c, W / 2 - 78, 250, 156, o.theme === "accent");
  c.fillStyle = th.text; c.font = `700 60px ${DISPLAY}`; c.fillText("ZsírKréta", W / 2, 490);

  // fejléc
  c.fillStyle = th.sub; c.font = `600 42px ${FONT}`;
  c.fillText(o.name ? `${o.name} ezzel büszkélkedhet` : "Erre vagyok büszke", W / 2, 572);

  // nagy átlag: sötét folt, sárga számmal
  rr(c, 80, 620, W - 160, 330, 56); c.fillStyle = o.theme === "night" ? "#2d231d" : INK; c.fill();
  c.fillStyle = "#ffe14d"; c.font = `700 200px ${DISPLAY}`; c.fillText(f2(o.avg), W / 2, 820);
  c.fillStyle = "rgba(246,239,230,.78)"; c.font = `600 40px ${FONT}`; c.fillText(`átlag, ${o.count} jegy alapján`, W / 2, 900);

  // csempék: mindegyik egy kiemelőszín, sötét szöveggel
  const cols = 2, tw = 440, th_ = 200, gap = 40, startY = 990;
  o.items.forEach((it, i) => {
    const x = 80 + (i % cols) * (tw + gap), y = startY + Math.floor(i / cols) * (th_ + 28);
    rr(c, x, y, tw, th_, 40); c.fillStyle = HL[i % HL.length]; c.fill();
    c.textAlign = "left"; c.font = `60px ${FONT}`; c.fillStyle = INK; c.fillText(it.icon, x + 32, y + 98);
    c.font = `700 88px ${DISPLAY}`; c.fillText(it.value, x + 124, y + 102);
    c.fillStyle = "rgba(29,21,16,.78)"; c.font = `600 30px ${FONT}`; wrap(c, it.label, x + 32, y + 150, tw - 64, 34, 2);
    c.textAlign = "center";
  });

  // alsó felirat
  const rows = Math.ceil(o.items.length / cols), endY = startY + rows * (th_ + 28);
  const fy = Math.min(1640, Math.max(endY + 30, 1500));
  c.fillStyle = th.text; c.font = `700 46px ${DISPLAY}`;
  c.fillText(o.footer || "Próbáld ki te is!", W / 2, fy + 40);
  c.fillStyle = th.sub; c.font = `600 34px ${FONT}`;
  c.fillText("Jegyek, órarend, statisztikák egy helyen", W / 2, fy + 92);
}

export function openStory() {
  const data = collect();
  if (!data.count) return alert("Még nincs jegy, amiből képet lehetne csinálni.");
  const o = { theme: "night", name: "", footer: "Próbáld ki te is: ZsírKréta", ...data, items: data.items };
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
    a.href = URL.createObjectURL(await blob()); a.download = "zsirkreta-story.png"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  const sh = bg.querySelector("#st-sh");
  const canShareFiles = () => { try { return !!navigator.canShare?.({ files: [new File([], "x.png", { type: "image/png" })] }); } catch { return false; } };
  if (canShareFiles()) {
    sh.hidden = false;
    sh.onclick = async () => {
      const f = new File([await blob()], "zsirkreta-story.png", { type: "image/png" });
      try { await navigator.share({ files: [f], title: "ZsírKréta" }); } catch {}
    };
  }
  draw();
  document.fonts.load(`700 40px ${DISPLAY}`).then(draw, () => {});
}
