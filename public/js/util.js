export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

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

// ---------- normalizálás (a KRÉTA mezőneveit véd(ekez)ve kezeli) ----------
export function normGrades(raw) {
  return (Array.isArray(raw) ? raw : []).map((g) => {
    const type = g.Tipus?.Nev || "";
    const kind = g.ErtekFajta?.Nev || "";
    let value = typeof g.SzamErtek === "number" && g.SzamErtek >= 1 && g.SzamErtek <= 5 ? g.SzamErtek : null;
    if (/szazal/i.test(kind)) value = null;
    return {
      id: g.Uid, date: new Date(g.KeszitesDatuma || g.RogzitesDatuma), subject: g.Tantargy?.Nev || "Egyéb",
      topic: g.Tema || "", teacher: g.ErtekeloTanarNeve || "", value, text: g.SzovegesErtek || g.SzovegesErtekelesRovidNev || "",
      weight: (g.SulySzazalekErteke || 100) / 100, kind, type, mode: g.Mod?.Leiras || "",
      isTerm: /felevi|evvegi|ev_vegi|vegi/i.test(type) && !/evkozi/i.test(type),
    };
  }).filter((g) => !isNaN(g.date)).sort((a, b) => b.date - a.date);
}
// Nem valódi órák: szünetek, munkaszüneti napok (a KRÉTA órarend-elemként adja őket).
const NOT_LESSON = /(munkasz[üu]net|[őo]szi sz[üu]net|t[ée]li sz[üu]net|tavaszi sz[üu]net|ny[áa]ri sz[üu]net|tan[íi]t[áa]si sz[üu]net|tan[íi]t[áa]s n[ée]lk[üu]li|sz[üu]netnap|ünnepnap)/i;
export function normLessons(raw) {
  return (Array.isArray(raw) ? raw : []).filter((l) => !NOT_LESSON.test([l.Tantargy?.Nev, l.Nev, l.Tema, l.Tipus?.Nev].filter(Boolean).join(" "))).map((l) => ({
    id: l.Uid, start: new Date(l.KezdetIdopont), end: new Date(l.VegIdopont), subject: l.Tantargy?.Nev || l.Nev || "Óra",
    name: l.Nev || "", teacher: l.TanarNeve || "", sub: l.HelyettesitoTanarNeve || "", room: l.TeremNeve || (typeof l.Tanterem === "string" ? l.Tanterem : l.Tanterem?.Nev) || l.Terem || "", nr: l.Oraszam,
    off: /elmaradt/i.test(l.Allapot?.Nev || ""), topic: l.Tema || "", test: !!l.BejelentettSzamonkeresUid, hw: !!l.HaziFeladatUid,
  })).filter((l) => !isNaN(l.start)).sort((a, b) => a.start - b.start);
}
export function normAbs(raw) {
  return (Array.isArray(raw) ? raw : []).map((m) => ({
    id: m.Uid, date: new Date(m.Datum), subject: m.Tantargy?.Nev || "Egyéb", nr: m.Oraszam, teacher: m.RogzitoTanarNeve || "",
    status: m.IgazolasAllapota || "", type: m.IgazolasTipusa?.Nev || m.IgazolasTipusa?.Leiras || "", late: m.KesesPercben || 0,
    kind: m.Tipus?.Nev || "", ok: /^igazolt$/i.test(m.IgazolasAllapota || ""), na: /nem_igazol/i.test(m.IgazolasAllapota || ""),
  })).filter((m) => !isNaN(m.date)).sort((a, b) => b.date - a.date);
}
export function normHw(raw) {
  return (Array.isArray(raw) ? raw : []).map((h) => ({
    id: h.Uid, subject: h.TantargyNeve || "Egyéb", teacher: h.RogzitoTanarNeve || "", text: h.Szoveg || "",
    given: new Date(h.FeladasDatuma), due: new Date(h.HataridoDatuma), done: !!h.IsMegoldva,
  })).filter((h) => !isNaN(h.due)).sort((a, b) => a.due - b.due);
}
export function normTests(raw) {
  return (Array.isArray(raw) ? raw : []).map((t) => ({
    id: t.Uid, date: new Date(t.Datum), subject: t.TantargyNeve || t.Tantargy?.Nev || "Egyéb", teacher: t.RogzitoTanarNeve || "",
    topic: t.Temaja || "", kind: t.Modja?.Leiras || t.Modja?.Nev || "", nr: t.OrarendiOraOraszama,
  })).filter((t) => !isNaN(t.date)).sort((a, b) => a.date - b.date);
}
export function normNotes(raw) {
  return (Array.isArray(raw) ? raw : []).map((n) => ({
    id: n.Uid, title: n.Cim || "", text: n.Tartalom || "", date: new Date(n.FeljegyzesDatuma || n.Datum), teacher: n.KeszitoTanarNeve || "", type: n.Tipus?.Nev || "",
  })).sort((a, b) => b.date - a.date);
}

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
