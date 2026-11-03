export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// világos-e egy #rrggbb szín (a rajta lévő szöveg színéhez)
export const isLight = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return true;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.35;
};

// szövegben lévő webcímek (https://…, www.…, vagy pl. quizz.englert.hu) kattintható linkké alakítása; a többi szöveg escape-elve
const URL_RE = /\b(?:https?:\/\/[^\s<>"']+|www\.[^\s<>"']+|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:hu|com|org|net|eu|io|app|dev|edu|gov|info|me|co|uk|de|at|ro|sk|ly|gl|link|site|online|school|page)\b(?:\/[^\s<>"']*)?)/gi;
export function linkify(text) {
  const s = String(text ?? "");
  let out = "", last = 0;
  for (const m of s.matchAll(URL_RE)) {
    let url = m[0];
    const trail = url.match(/[.,;:!?)\]]+$/); // mondatvégi írásjel nem része a linknek
    if (trail && !(trail[0].startsWith(")") && url.includes("("))) url = url.slice(0, -trail[0].length);
    if (m.index > 0 && s[m.index - 1] === "@") continue; // e-mail cím domainje
    out += esc(s.slice(last, m.index));
    const href = /^https?:\/\//i.test(url) ? url : "https://" + url;
    out += `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(url)}</a>`;
    last = m.index + url.length;
  }
  return out + esc(s.slice(last));
}

export const DAYS = ["Hétfő", "Kedd", "Szerda", "Csütörtök", "Péntek", "Szombat", "Vasárnap"];
export const MONTHS = ["jan", "feb", "már", "ápr", "máj", "jún", "júl", "aug", "szep", "okt", "nov", "dec"];

export const d0 = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const iso = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };
export const mondayOf = (d) => { const x = d0(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const sameDay = (a, b) => iso(a) === iso(b);
export const fmtDate = (d) => { d = new Date(d); return isNaN(d) ? "" : `${MONTHS[d.getMonth()]} ${d.getDate()}.`; };
export const fmtFull = (d) => { d = new Date(d); return isNaN(d) ? "" : `${d.getFullYear()}. ${MONTHS[d.getMonth()]} ${d.getDate()}.`; };
export const fmtTime = (d) => { d = new Date(d); return isNaN(d) ? "" : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
export const ago = (ts) => {
  const s = Math.max(0, Date.now() / 1000 - ts);
  if (s < 60) return "most";
  if (s < 3600) return `${Math.floor(s / 60)} perce`;
  if (s < 86400) return `${Math.floor(s / 3600)} órája`;
  return `${Math.floor(s / 86400)} napja`;
};
export const relDay = (d) => {
  const diff = Math.round((d0(d) - d0(new Date())) / 864e5);
  if (diff === 0) return "ma";
  if (diff === 1) return "holnap";
  if (diff === -1) return "tegnap";
  if (diff > 1 && diff < 7) return `${diff} nap múlva`;
  return fmtDate(d);
};

export const avg = (arr, weighted = true) => {
  const v = arr.filter((g) => g.value != null);
  if (!v.length) return null;
  if (!weighted) return v.reduce((a, g) => a + g.value, 0) / v.length;
  const w = v.reduce((a, g) => a + g.weight, 0);
  return w ? v.reduce((a, g) => a + g.value * g.weight, 0) / w : null;
};
export const f2 = (n) => (n == null || isNaN(n) ? "–" : n.toFixed(2).replace(".", ","));
export const f1 = (n) => (n == null || isNaN(n) ? "–" : n.toFixed(1).replace(".", ","));
export const gcls = (v) => (v == null ? "gt" : "g" + Math.min(5, Math.max(1, Math.round(v))));
export const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// tantárgyszínek: stabil hash alapján
export function subjColor(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 70% 62%)`;
}
export function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = msg;
  document.getElementById("toasts").append(t);
  setTimeout(() => t.remove(), 3200);
}

// "YYYY-MM-DD" → helyi idő szerinti nap (nem UTC éjfél)
export const day = (s) => new Date(String(s).slice(0, 10) + "T00:00");
export const todayIso = () => iso(new Date());
