// Instagram story kép (1080×1920): amire büszke lehetsz + az alkalmazás logója.
// Állítható: téma (háttér és színek), elrendezés, igazítás, csempeoszlopok, felső felirat, és hogy mi látszódjon.
import { S as ST, shownName, numericGrades, absences, avgOf, bySubject, subjName } from "./state.js";
import { esc, f2, isLight } from "./util.js";

const W = 1080, H = 1920;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif';
const DISPLAY = '"URW Gothic", "Century Gothic", sans-serif'; // címek és számok, mint az oldalon
const TOP = 210, BOTTOM = 1710, M = 80; // a tartalom a story biztonsági sávjába kerül (felül a profilsor, alul a válaszmező takar)
const INK = "#1d1510", YELLOW = "#ffe14d";
const HL = ["#ffe14d", "#5cc8ff", "#ff5fa2", "#45e3a0", "#ff9f43", "#b79cff"]; // szövegkiemelő színek a csempékhez
const ON_BOX = "rgba(246,239,230,.9)", ON_BOX_SUB = "rgba(246,239,230,.72)"; // szöveg a sötét foltokon
const CARD = { text: INK, sub: "rgba(29,21,16,.62)", box: INK }; // a „Kártya” elrendezés világos cetlije
// kockás füzet: halványkék négyzetrács és piros margóvonal
function paper(c) {
  c.save(); c.strokeStyle = "rgba(70,130,200,.2)"; c.lineWidth = 2;
  for (let x = 0; x <= W; x += 54) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
  for (let y = 0; y <= H; y += 54) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
  c.strokeStyle = "rgba(230,80,80,.5)"; c.lineWidth = 4; c.beginPath(); c.moveTo(74, 0); c.lineTo(74, H); c.stroke();
  c.restore();
}
// krétatábla: halvány krétapor-folt és fakeret
function chalk(c) {
  const g = c.createRadialGradient(W * 0.3, H * 0.25, 40, W * 0.3, H * 0.25, 950);
  g.addColorStop(0, "rgba(255,255,255,.08)"); g.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.strokeStyle = "#7a5230"; c.lineWidth = 36; c.strokeRect(18, 18, W - 36, H - 36);
}
// neon: rózsaszín és türkiz ragyogás két sarokban
function neon(c) {
  for (const [x, y, col] of [[0, 0, "rgba(255,61,240,.45)"], [W, H, "rgba(0,209,193,.4)"]]) {
    const g = c.createRadialGradient(x, y, 0, x, y, 950);
    g.addColorStop(0, col); g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  }
}
// Témák. bg: háttérszín, vagy grad: színátmenet; box: a sötét foltok színe; logoDark: élénk háttéren sötét lapú logó; hl: kiemelőcsík;
// paint: rajzolt minta a háttéren; sw: a választó kis mintája (CSS háttér), ha nem a bg/grad adja ki
const THEMES = {
  night: { name: "Íróasztal", bg: "#221a15", box: "#2d231d", text: "#f6efe6", sub: "rgba(246,239,230,.72)" },
  accent: { name: "Kiemelő", box: INK, text: INK, sub: "rgba(29,21,16,.72)", logoDark: true, hl: "#ffffff", sw: "var(--accent)" },
  light: { name: "Világos", bg: "#eef1fa", box: INK, text: INK, sub: "rgba(29,21,16,.65)" },
  chalk: { name: "Krétatábla", bg: "#1f3a2e", box: "#2b4c3c", text: "#f3f1e7", sub: "rgba(243,241,231,.72)", paint: chalk, sw: "radial-gradient(circle at 30% 25%, rgba(255,255,255,.16), transparent 60%), #1f3a2e" },
  paper: { name: "Kockás füzet", bg: "#f8f7f1", box: INK, text: INK, sub: "rgba(29,21,16,.65)", paint: paper, sw: "repeating-linear-gradient(0deg, rgba(70,130,200,.35) 0 1px, transparent 1px 6px), repeating-linear-gradient(90deg, rgba(70,130,200,.35) 0 1px, transparent 1px 6px), #f8f7f1" },
  ocean: { name: "Óceán", grad: ["#0e3550", "#0b141c"], box: "#16324a", text: "#e8f2f8", sub: "rgba(232,242,248,.72)" },
  sunset: { name: "Naplemente", grad: ["#ffb347", "#ff5fa2"], box: INK, text: INK, sub: "rgba(29,21,16,.72)", logoDark: true },
  neon: { name: "Neon", bg: "#140d1f", box: "#2a1c42", text: "#ffffff", sub: "rgba(255,255,255,.75)", paint: neon, sw: "radial-gradient(circle at 0 0, rgba(255,61,240,.75), transparent 60%), radial-gradient(circle at 100% 100%, rgba(0,209,193,.7), transparent 60%), #140d1f" },
  amoled: { name: "Fekete", bg: "#000000", box: "#161616", text: "#ffffff", sub: "rgba(255,255,255,.7)" },
  pastel: { name: "Pasztell", grad: ["#f3e7ff", "#dff3f9"], box: INK, text: INK, sub: "rgba(29,21,16,.62)" },
};
const swatch = (t) => t.sw || (t.grad ? `linear-gradient(160deg, ${t.grad[0]}, ${t.grad[1]})` : t.bg);
const LAYOUTS = { classic: "Klasszikus", big: "Nagy szám", list: "Lista", card: "Kártya", magazine: "Magazin" };
const SHOW = [["logo", "Logó"], ["title", "Felső felirat"], ["avg", "Átlag"], ["footer", "Alsó felirat"]];
const OPTS_KEY = "kp_story";

// a választott téma és elrendezés megmarad a következő megnyitásig
function loadOpts() {
  const o = { theme: "night", layout: "classic", align: "center", cols: 2, show: { logo: true, title: true, avg: true, footer: true } };
  try {
    const s = JSON.parse(localStorage.getItem(OPTS_KEY) || "{}"), old = localStorage.getItem("kp_story_theme");
    if (THEMES[s.theme]) o.theme = s.theme; else if (THEMES[old]) o.theme = old;
    if (LAYOUTS[s.layout]) o.layout = s.layout;
    if (s.align === "left" || s.align === "center") o.align = s.align;
    if ([1, 2, 3].includes(s.cols)) o.cols = s.cols;
    for (const [k] of SHOW) if (typeof s.show?.[k] === "boolean") o.show[k] = s.show[k];
  } catch {}
  return o;
}
const saveOpts = (o) => { try { localStorage.setItem(OPTS_KEY, JSON.stringify({ theme: o.theme, layout: o.layout, align: o.align, cols: o.cols, show: o.show })); } catch {} };

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
const font = (c, size, weight = 600, family = FONT) => (c.font = `${weight} ${Math.round(size)}px ${family}`);
const ax = (P) => (P.align === "left" ? M : W / 2);
// mindenképp „…” a végére, és férjen bele a szélességbe
function ellipsis(c, s, max) {
  while (s.length > 1 && c.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}
const clip = (c, s, max) => (c.measureText(s).width <= max ? s : ellipsis(c, s, max));
function wrapLines(c, text, max, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean), out = [];
  let line = "";
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (line && c.measureText(t).width > max) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  const cut = out.length > maxLines;
  out.length = Math.min(out.length, maxLines);
  return out.map((l, i) => (cut && i === out.length - 1 ? ellipsis(c, l, max) : clip(c, l, max)));
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

// ---------- elrendezés: blokkok ({ h, draw(y) }) egymás alatt, a biztonsági sávban függőlegesen középre ----------
// A statisztika (csempék, sorok…) a maradék helyet kapja, így kikapcsolt részeknél és sok elemnél sem fut egymásra semmi.
const SLOT = {};
function stack(blocks, gap) {
  blocks = blocks.filter(Boolean);
  const total = blocks.reduce((s, b) => s + b.h, 0) + gap * (blocks.length - 1);
  let y = TOP + Math.max(0, (BOTTOM - TOP - total) / 2);
  for (const b of blocks) { b.draw(y); y += b.h + gap; }
}
function compose(parts, gap, makeStats) {
  parts = parts.filter(Boolean);
  const fixed = parts.reduce((s, b) => s + (b === SLOT ? 0 : b.h), 0) + gap * (parts.length - 1);
  stack(parts.map((b) => (b === SLOT ? makeStats(BOTTOM - TOP - fixed) : b)), gap);
}

// logó és név: egymás alatt, vagy egy sorban (inline)
function brand(c, P, size, inline = false) {
  const ns = Math.round(size * (inline ? 0.46 : 0.4));
  if (inline) return { h: size, draw(y) {
    font(c, ns, 700, DISPLAY);
    const x = P.align === "left" ? M : (W - size - 22 - c.measureText("ZsírKréta").width) / 2;
    drawLogo(c, x, y, size, P.logoDark);
    c.textAlign = "left"; c.fillStyle = P.col.text; c.fillText("ZsírKréta", x + size + 22, y + size / 2 + 2);
  } };
  return { h: size + 16 + ns, draw(y) {
    drawLogo(c, P.align === "left" ? M : W / 2 - size / 2, y, size, P.logoDark);
    font(c, ns, 700, DISPLAY); c.textAlign = P.align; c.fillStyle = P.col.text;
    c.fillText("ZsírKréta", ax(P), y + size + 16 + ns / 2);
  } };
}
function text(c, P, str, size, { weight = 600, family = FONT, color = P.col.sub, lines = 2, lh = 1.25 } = {}) {
  font(c, size, weight, family);
  const ls = wrapLines(c, str, W - 2 * M, lines), step = Math.round(size * lh);
  return { h: ls.length * step, draw(y) {
    font(c, size, weight, family); c.textAlign = P.align; c.fillStyle = color;
    ls.forEach((l, i) => c.fillText(l, ax(P), y + step * (i + 0.5)));
  } };
}
// átlag: sötét folt sárga számmal (klasszikus)
function avgBox(c, P, o) {
  return { h: 320, draw(y) {
    rr(c, M, y, W - 2 * M, 320, 56); c.fillStyle = P.col.box; c.fill();
    const x = P.align === "left" ? M + 64 : W / 2;
    c.textAlign = P.align; c.fillStyle = YELLOW; font(c, 200, 700, DISPLAY); c.fillText(f2(o.avg), x, y + 140);
    c.fillStyle = ON_BOX_SUB; font(c, 40); c.fillText(`átlag, ${o.count} jegy alapján`, x, y + 258);
  } };
}
// átlag: óriási szám; világos háttéren sötét szám kiemelőcsíkkal, sötéten sárga szám
function avgGiant(c, P, o, size) {
  return { h: Math.round(size * 1.32), draw(y) {
    font(c, size, 700, DISPLAY);
    const s = f2(o.avg), tw = c.measureText(s).width, x0 = P.align === "left" ? M : W / 2 - tw / 2, light = P.col.text === INK;
    if (light) { rr(c, x0 - size * 0.06, y + size * 0.56, tw + size * 0.12, size * 0.34, size * 0.06); c.fillStyle = P.hl || YELLOW; c.fill(); }
    c.textAlign = "left"; c.fillStyle = light ? INK : YELLOW; c.fillText(s, x0, y + size * 0.52);
    font(c, size * 0.12 + 12); c.textAlign = P.align; c.fillStyle = P.col.sub;
    c.fillText(`átlag, ${o.count} jegy alapján`, ax(P), y + size * 1.2);
  } };
}
// átlag: egy sor, balra a felirat, jobbra a szám (lista)
function avgRow(c, P, o) {
  return { h: 196, draw(y) {
    rr(c, M, y, W - 2 * M, 196, 44); c.fillStyle = P.col.box; c.fill();
    c.textAlign = "left"; c.fillStyle = ON_BOX; font(c, 48, 700, DISPLAY); c.fillText("Átlag", M + 48, y + 76);
    c.fillStyle = ON_BOX_SUB; font(c, 32); c.fillText(`${o.count} jegy alapján`, M + 48, y + 130);
    c.textAlign = "right"; c.fillStyle = YELLOW; font(c, 150, 700, DISPLAY); c.fillText(f2(o.avg), W - M - 48, y + 102);
  } };
}
// átlag: nagy szám, mellette kétsoros felirat (magazin)
function avgEditorial(c, P, o) {
  return { h: 270, draw(y) {
    const s = f2(o.avg);
    font(c, 250, 700, DISPLAY);
    const x = M + c.measureText(s).width + 36;
    c.textAlign = "left"; c.fillStyle = P.col.text; c.fillText(s, M - 8, y + 135);
    font(c, 46, 700, DISPLAY); c.fillText("átlag", x, y + 104);
    c.fillStyle = P.col.sub; font(c, 34); c.fillText(`${o.count} jegy alapján`, x, y + 160);
  } };
}
// csempék kiemelőszínekkel; alacsony csempén egy sorban az ikon, a szám és a felirat
function tiles(c, items, cols, maxH) {
  if (!items.length) return null;
  const gap = 24, rows = Math.ceil(items.length / cols), tw = (W - 2 * M - gap * (cols - 1)) / cols;
  const th = Math.round(Math.max(92, Math.min(210, (maxH - gap * (rows - 1)) / rows))), k = Math.min(1, tw / 440);
  return { h: rows * th + (rows - 1) * gap, draw(y) {
    items.forEach((it, i) => {
      const x = M + (i % cols) * (tw + gap), ty = y + Math.floor(i / cols) * (th + gap);
      rr(c, x, ty, tw, th, Math.min(40, th / 4)); c.fillStyle = HL[i % HL.length]; c.fill();
      c.textAlign = "left"; c.fillStyle = INK;
      if (th >= 160) {
        font(c, 58 * k); c.fillText(it.icon, x + 30 * k, ty + th * 0.34);
        font(c, 88 * k, 700, DISPLAY); c.fillText(clip(c, it.value, tw - 140 * k), x + 112 * k, ty + th * 0.35);
        c.fillStyle = "rgba(29,21,16,.78)"; font(c, Math.max(24, 30 * k));
        wrapLines(c, it.label, tw - 56 * k, 2).forEach((l, j) => c.fillText(l, x + 30 * k, ty + th * 0.68 + j * Math.max(28, 34 * k)));
      } else {
        const mid = ty + th / 2;
        font(c, 46); c.fillText(it.icon, x + 26, mid);
        font(c, 64, 700, DISPLAY); c.fillText(it.value, x + 88, mid + 2);
        const vx = x + 88 + c.measureText(it.value).width + 22;
        c.fillStyle = "rgba(29,21,16,.78)"; font(c, 30); c.fillText(clip(c, it.label, x + tw - 24 - vx), vx, mid);
      }
    });
  } };
}
// sorok sötét foltokon: színes korong az ikonnal, balra a felirat, jobbra a szám (lista)
function rowsBlock(c, items, box, maxH) {
  if (!items.length) return null;
  const gap = 18, rh = Math.round(Math.max(96, Math.min(130, (maxH - gap * (items.length - 1)) / items.length)));
  return { h: items.length * rh + (items.length - 1) * gap, draw(y) {
    items.forEach((it, i) => {
      const ty = y + i * (rh + gap), mid = ty + rh / 2;
      rr(c, M, ty, W - 2 * M, rh, 36); c.fillStyle = box; c.fill();
      c.beginPath(); c.arc(M + 70, mid, 36, 0, Math.PI * 2); c.fillStyle = HL[i % HL.length]; c.fill();
      c.textAlign = "center"; c.fillStyle = INK; font(c, 36); c.fillText(it.icon, M + 70, mid + 2);
      c.textAlign = "right"; c.fillStyle = YELLOW; font(c, 66, 700, DISPLAY); c.fillText(it.value, W - M - 40, mid + 2);
      const vw = c.measureText(it.value).width;
      c.textAlign = "left"; c.fillStyle = ON_BOX; font(c, 34);
      c.fillText(clip(c, it.label, W - 2 * M - 192 - vw), M + 128, mid);
    });
  } };
}
// csempék nélküli rács: színes csík, ikon, szám, felirat (nagy szám)
function statGrid(c, P, items, maxH) {
  if (!items.length) return null;
  const cols = Math.min(3, items.length), rows = Math.ceil(items.length / cols), gap = 30;
  const cw = (W - 2 * M - gap * (cols - 1)) / cols, rh = Math.round(Math.max(164, Math.min(200, (maxH - gap * (rows - 1)) / rows)));
  return { h: rows * rh + (rows - 1) * gap, draw(y) {
    items.forEach((it, i) => {
      const x = M + (i % cols) * (cw + gap), ty = y + Math.floor(i / cols) * (rh + gap);
      rr(c, x, ty, cw, 10, 5); c.fillStyle = HL[i % HL.length]; c.fill();
      c.textAlign = "left"; c.fillStyle = P.col.text;
      font(c, 40); c.fillText(it.icon, x, ty + 58);
      font(c, 70, 700, DISPLAY); c.fillText(clip(c, it.value, cw - 60), x + 56, ty + 62);
      c.fillStyle = P.col.sub; font(c, 28);
      wrapLines(c, it.label, cw - 6, 2).forEach((l, j) => c.fillText(l, x, ty + 118 + j * 34));
    });
  } };
}
// számozott lista vékony elválasztókkal (magazin)
function numbered(c, P, items, maxH) {
  if (!items.length) return null;
  const rh = Math.round(Math.max(92, Math.min(122, maxH / items.length)));
  const line = (y) => { c.fillStyle = P.col.sub; c.globalAlpha = 0.4; c.fillRect(M, y, W - 2 * M, 2); c.globalAlpha = 1; };
  return { h: items.length * rh + 2, draw(y) {
    items.forEach((it, i) => {
      const ty = y + i * rh, mid = ty + rh / 2;
      line(ty);
      c.textAlign = "left"; c.fillStyle = P.col.sub; font(c, 34, 700, DISPLAY); c.fillText(String(i + 1).padStart(2, "0"), M, mid + 2);
      c.fillStyle = P.col.text; font(c, 66, 700, DISPLAY); c.fillText(it.value, M + 92, mid + 4);
      const vx = M + 92 + c.measureText(it.value).width + 26;
      c.fillStyle = P.col.sub; font(c, 32); c.fillText(clip(c, `${it.icon} ${it.label}`, W - M - vx), vx, mid + 2);
    });
    line(y + items.length * rh);
  } };
}
function footer(c, P, o) {
  return { h: 112, draw(y) {
    c.textAlign = P.align; c.fillStyle = P.col.text; font(c, 46, 700, DISPLAY);
    c.fillText(clip(c, o.footer || "Próbáld ki te is!", W - 2 * M), ax(P), y + 28);
    c.fillStyle = P.col.sub; font(c, 34); c.fillText("Jegyek, órarend, statisztikák egy helyen", ax(P), y + 88);
  } };
}
// világos cetli ragasztószalaggal, benne a blokkok (kártya)
function cardBlock(c, P, inner, gap, pad) {
  const blocks = inner.filter(Boolean), h = blocks.reduce((s, b) => s + b.h, 0) + gap * Math.max(0, blocks.length - 1) + pad * 2;
  return { h, draw(y) {
    c.save(); c.shadowColor = "rgba(0,0,0,.3)"; c.shadowBlur = 50 * P.scale; c.shadowOffsetY = 18 * P.scale;
    rr(c, M - 30, y, W - 2 * M + 60, h, 48); c.fillStyle = "#fffaf0"; c.fill(); c.restore();
    c.save(); c.translate(W / 2, y + 4); c.rotate(-0.035); c.fillStyle = "rgba(255,225,77,.88)"; c.fillRect(-100, -20, 200, 46); c.restore();
    let cy = y + pad;
    for (const b of blocks) { b.draw(cy); cy += b.h + gap; }
  } };
}

const title = (c, P, o, size) => text(c, P, o.title, size, { weight: 700, family: DISPLAY, color: P.col.text });
const LAYOUT = {
  classic: (c, P, o) => compose([
    o.show.logo && brand(c, P, 150), o.show.title && text(c, P, o.title, 42),
    o.show.avg && avgBox(c, P, o), SLOT, o.show.footer && footer(c, P, o),
  ], 34, (h) => tiles(c, o.items, o.cols, h)),
  big: (c, P, o) => compose([
    o.show.logo && brand(c, P, 84, true), o.show.title && title(c, P, o, 54),
    o.show.avg && avgGiant(c, P, o, 330), SLOT, o.show.footer && footer(c, P, o),
  ], 46, (h) => statGrid(c, P, o.items, h)),
  list: (c, P, o) => compose([
    o.show.logo && brand(c, P, 84, true), o.show.title && title(c, P, o, 54),
    o.show.avg && avgRow(c, P, o), SLOT, o.show.footer && footer(c, P, o),
  ], 28, (h) => rowsBlock(c, o.items, P.col.box, h)),
  card: (c, P, o) => {
    const Pc = { ...P, col: CARD, hl: YELLOW }, gap = 58, igap = 30, pad = 60; // nagyobb hely a cetli fölött: ott a ragasztószalag
    const logo = o.show.logo && brand(c, P, 112), foot = o.show.footer && footer(c, P, o);
    const inner = [o.show.title && title(c, Pc, o, 46), o.show.avg && avgGiant(c, Pc, o, 210)].filter(Boolean);
    const used = [logo, foot].filter(Boolean).reduce((s, b) => s + b.h + gap, 0) + inner.reduce((s, b) => s + b.h + igap, 0) + pad * 2;
    stack([logo, cardBlock(c, P, [...inner, tiles(c, o.items, o.cols, BOTTOM - TOP - used)], igap, pad), foot], gap);
  },
  magazine: (c, P, o) => compose([
    o.show.logo && brand(c, P, 72, true), o.show.title && text(c, P, o.title, 108, { weight: 700, family: DISPLAY, color: P.col.text, lines: 3, lh: 1.02 }),
    o.show.avg && avgEditorial(c, P, o), SLOT, o.show.footer && footer(c, P, o),
  ], 42, (h) => numbered(c, P, o.items, h)),
};

// scale: kisebb vászon (a választó előnézeteihez); a rajz mindig 1080×1920-as koordinátákban készül
export function drawStory(canvas, o, scale = 1) {
  const c = canvas.getContext("2d"), acc = ST.prefs.accent || "#ffe14d";
  const th = { ...(THEMES[o.theme] || THEMES.night) };
  if (o.theme === "accent") { th.bg = acc; if (!isLight(acc)) { th.text = "#fff"; th.sub = "rgba(255,255,255,.75)"; } }
  canvas.width = Math.round(W * scale); canvas.height = Math.round(H * scale);
  c.setTransform(scale, 0, 0, scale, 0, 0);
  if (th.grad) {
    const g = c.createLinearGradient(0, 0, W * 0.4, H);
    g.addColorStop(0, th.grad[0]); g.addColorStop(1, th.grad[1]);
    c.fillStyle = g;
  } else c.fillStyle = th.bg;
  c.fillRect(0, 0, W, H);
  th.paint?.(c);
  c.textBaseline = "middle";
  const P = { align: o.layout === "magazine" ? "left" : o.align, col: th, hl: th.hl, logoDark: !!th.logoDark, scale };
  (LAYOUT[o.layout] || LAYOUT.classic)(c, P, o);
}

export function openStory() {
  const data = collect();
  if (!data.count) return alert("Még nincs jegy, amiből képet lehetne csinálni.");
  const o = { ...loadOpts(), footer: "Próbáld ki te is: ZsírKréta", ...data };
  const picked = new Set(data.items.filter((i) => i.on).map((i) => i.k));
  let useName = false;
  const defTitle = () => (useName ? `${shownName()} ezzel büszkélkedhet` : "Erre vagyok büszke");
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `<div class="card modal story-modal" role="dialog" aria-modal="true">
    <div class="row spread"><h3 style="margin:0">📸 Story kép</h3><button class="btn sm" id="st-x">✕</button></div>
    <div class="story-grid"><canvas id="st-cv" class="story-cv"></canvas>
      <div class="grid" style="gap:14px;align-content:start">
        <div><div class="small muted st-lbl">Elrendezés</div><div class="st-themes" id="st-lay">${Object.entries(LAYOUTS).map(([k, n]) => `<button type="button" data-v="${k}" class="st-th"><canvas class="st-mini"></canvas>${n}</button>`).join("")}</div></div>
        <div><div class="small muted st-lbl">Téma</div><div class="st-themes" id="st-th">${Object.entries(THEMES).map(([k, t]) => `<button type="button" data-v="${k}" class="st-th"><i style="background:${swatch(t)}"></i>${t.name}</button>`).join("")}</div></div>
        <div class="row wrap" style="gap:16px;align-items:flex-start">
          <div><div class="small muted st-lbl">Igazítás</div><div class="seg" id="st-al"><button type="button" data-v="center">Középre</button><button type="button" data-v="left">Balra</button></div></div>
          <div><div class="small muted st-lbl">Csempék</div><div class="seg" id="st-co">${[1, 2, 3].map((n) => `<button type="button" data-v="${n}">${n} oszlop</button>`).join("")}</div></div>
        </div>
        <div><div class="small muted st-lbl">Mi látszódjon?</div><div class="chips" id="st-show">${SHOW.map(([k, l]) => `<label class="chip" style="cursor:pointer"><input type="checkbox" data-k="${k}" ${o.show[k] ? "checked" : ""}> ${l}</label>`).join("")}</div></div>
        <label class="f">Felső felirat<input class="input" id="st-tt" maxlength="60" placeholder="${esc(defTitle())}"></label>
        <div><div class="small muted st-lbl">Mi kerüljön rá? (max. 6)</div><div class="chips" id="st-items">${data.items.map((i) => `<label class="chip" style="cursor:pointer"><input type="checkbox" data-k="${i.k}" ${picked.has(i.k) ? "checked" : ""}> ${i.icon} ${esc(i.label.split(":")[0])}</label>`).join("")}</div></div>
        <label class="switch"><input type="checkbox" id="st-name"><span>A nevem is legyen rajta (${esc(shownName())})</span></label>
        <label class="f">Alsó felirat<input class="input" id="st-ft" maxlength="60" value="${esc(o.footer)}"></label>
        <div class="row wrap"><button class="btn primary grow" id="st-dl">⬇ Letöltés</button><button class="btn grow" id="st-sh" hidden>↗ Megosztás</button></div>
        <div class="small muted">Az átlagodat és a jegyeid számát tartalmazza a kép, ezért csak akkor posztold, ha ezt meg szeretnéd mutatni. A kép a böngésződben készül, a szerverre nem kerül fel.</div>
      </div></div></div>`;
  document.body.appendChild(bg);
  const cv = bg.querySelector("#st-cv"), $ = (q) => bg.querySelector(q), all = (q) => bg.querySelectorAll(q);
  const opts = () => ({ ...o, title: $("#st-tt").value.trim() || defTitle(), items: data.items.filter((i) => picked.has(i.k)).slice(0, 6) });
  // a gombok állapota: a magazin mindig balra igazít, oszlopszám csak a csempés elrendezéseknél van
  const sync = () => {
    const left = o.layout === "magazine", hasCols = o.layout === "classic" || o.layout === "card";
    const on = (q, f) => all(q).forEach((b) => { b.classList.toggle("on", f(b)); b.setAttribute("aria-pressed", f(b)); });
    on("#st-lay button", (b) => b.dataset.v === o.layout);
    on("#st-th button", (b) => b.dataset.v === o.theme);
    on("#st-al button", (b) => b.dataset.v === (left ? "left" : o.align));
    on("#st-co button", (b) => +b.dataset.v === o.cols);
    all("#st-al button").forEach((b) => (b.disabled = left));
    all("#st-co button").forEach((b) => (b.disabled = !hasCols));
  };
  const draw = () => {
    const d = opts();
    drawStory(cv, d);
    all("#st-lay canvas").forEach((m) => drawStory(m, { ...d, layout: m.parentElement.dataset.v }, 0.06)); // élő kis előnézetek
    saveOpts(o);
    sync();
  };
  const close = () => { bg.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  $("#st-x").onclick = close;
  bg.onclick = (e) => { if (e.target === bg) close(); };
  const pick = (q, f) => all(q).forEach((b) => (b.onclick = () => { f(b.dataset.v); draw(); }));
  pick("#st-lay button", (v) => (o.layout = v));
  pick("#st-th button", (v) => (o.theme = v));
  pick("#st-al button", (v) => (o.align = v));
  pick("#st-co button", (v) => (o.cols = +v));
  all("#st-show input").forEach((i) => (i.onchange = () => { o.show[i.dataset.k] = i.checked; draw(); }));
  all("#st-items input").forEach((i) => (i.onchange = () => { i.checked ? picked.add(i.dataset.k) : picked.delete(i.dataset.k); draw(); }));
  $("#st-tt").oninput = draw;
  $("#st-name").onchange = (e) => { useName = e.target.checked; $("#st-tt").placeholder = defTitle(); draw(); };
  $("#st-ft").oninput = (e) => { o.footer = e.target.value; draw(); };
  const blob = () => new Promise((res) => cv.toBlob(res, "image/png"));
  $("#st-dl").onclick = async () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(await blob()); a.download = "zsirkreta-story.png"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  const sh = $("#st-sh");
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
