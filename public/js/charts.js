// Kis SVG diagramkönyvtár, külső függőség nélkül.
import { esc } from "./util.js";

const COL = ["#6c5ce7", "#2ecc8f", "#f4c542", "#ef5b5b", "#38bdf8", "#f39a3d", "#d946ef", "#8bd450"];
export const palette = (i) => COL[i % COL.length];

export function bars({ items, max, h = 220, color, fmt = (v) => v, horizontal = false }) {
  if (!items.length) return `<div class="empty">Nincs adat</div>`;
  max = max ?? Math.max(...items.map((i) => i.value), 1);
  if (horizontal) {
    return `<div class="list">${items.map((i, n) => `
      <div><div class="row spread small"><span>${esc(i.label)}</span><b>${esc(fmt(i.value))}</b></div>
      <div class="bar"><i style="width:${Math.max(2, (i.value / max) * 100)}%;${i.color || color ? `background:${i.color || color}` : ""}"></i></div></div>`).join("")}</div>`;
  }
  const W = 560, pad = 26, bw = Math.min(46, (W - pad * 2) / items.length - 8);
  const step = (W - pad * 2) / items.length;
  const g = items.map((i, n) => {
    const bh = ((h - 40) * i.value) / max;
    const x = pad + n * step + (step - bw) / 2;
    return `<rect x="${x}" y="${h - 22 - bh}" width="${bw}" height="${bh}" rx="6" fill="${i.color || color || palette(n)}"/>
      <text x="${x + bw / 2}" y="${h - 26 - bh}" text-anchor="middle" style="fill:var(--text);font-weight:700">${esc(fmt(i.value))}</text>
      <text x="${x + bw / 2}" y="${h - 6}" text-anchor="middle">${esc(i.label)}</text>`;
  }).join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${h}">${g}</svg>`;
}

export function line({ points, h = 200, min, max, color = "var(--accent)", goal }) {
  // points: [{label, value}]
  if (points.length < 2) return `<div class="empty">Még kevés adat a diagramhoz</div>`;
  const W = 560, L = 30, R = 10, T = 14, B = 26;
  const vals = points.map((p) => p.value);
  min = min ?? Math.floor(Math.min(...vals, goal ?? 5) * 2) / 2 - 0.5;
  max = max ?? 5;
  min = Math.max(1, min);
  const x = (i) => L + (i * (W - L - R)) / (points.length - 1);
  const y = (v) => T + ((max - v) * (h - T - B)) / (max - min || 1);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${path} L${x(points.length - 1)},${h - B} L${x(0)},${h - B} Z`;
  const ticks = [];
  for (let v = Math.ceil(min); v <= max; v++) ticks.push(`<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`);
  const every = Math.ceil(points.length / 7);
  const labels = points.map((p, i) => (i % every === 0 || i === points.length - 1 ? `<text x="${x(i)}" y="${h - 6}" text-anchor="middle">${esc(p.label)}</text>` : "")).join("");
  const goalLine = goal ? `<line x1="${L}" x2="${W - R}" y1="${y(goal)}" y2="${y(goal)}" stroke="var(--g3)" stroke-dasharray="5 5"/><text x="${W - R}" y="${y(goal) - 5}" text-anchor="end" style="fill:var(--g3)">cél ${String(goal).replace(".", ",")}</text>` : "";
  const dots = points.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.value)}" r="3.5" fill="${color}"><title>${esc(p.label)}: ${p.value.toFixed(2)}</title></circle>`).join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${h}"><defs><linearGradient id="lg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".35"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    ${ticks.join("")}${goalLine}<path d="${area}" fill="url(#lg)"/><path d="${path}" fill="none" stroke="${color}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>${dots}${labels}</svg>`;
}

export function donut({ items, size = 150, center }) {
  const total = items.reduce((a, i) => a + i.value, 0);
  if (!total) return `<div class="empty">Nincs adat</div>`;
  const r = 52, c = 2 * Math.PI * r;
  let off = 0;
  const segs = items.filter((i) => i.value > 0).map((i, n) => {
    const len = (i.value / total) * c;
    const s = `<circle r="${r}" cx="70" cy="70" fill="none" stroke="${i.color || palette(n)}" stroke-width="20" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"><title>${esc(i.label)}: ${i.value}</title></circle>`;
    off += len;
    return s;
  }).join("");
  const legend = items.map((i, n) => `<span><i style="background:${i.color || palette(n)}"></i>${esc(i.label)} <b>${i.value}</b></span>`).join("");
  return `<div class="row wrap" style="gap:18px"><svg viewBox="0 0 140 140" width="${size}" height="${size}" class="chart" style="width:${size}px">${segs}
    <text x="70" y="68" text-anchor="middle" style="fill:var(--text);font-size:20px;font-weight:800">${esc(center ?? total)}</text>
    <text x="70" y="84" text-anchor="middle" style="font-size:10px">összesen</text></svg><div class="legend" style="flex-direction:column">${legend}</div></div>`;
}

export function spark(values, w = 90, h = 28, color = "var(--accent)") {
  if (values.length < 2) return "";
  const mn = Math.min(...values), mx = Math.max(...values);
  const pts = values.map((v, i) => `${((i * w) / (values.length - 1)).toFixed(1)},${(h - 3 - ((v - mn) / (mx - mn || 1)) * (h - 6)).toFixed(1)}`).join(" ");
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
