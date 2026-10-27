// Közös állapot: beállítások, adatok, névfeloldás.
import { get, put } from "./api.js";
import * as U from "./util.js";

export const S = {
  user: null,
  prefs: {},
  raw: {},        // nyers válaszok: { jegyek: {data, meta}, ... }
  errors: {},
  weekCache: {},  // órarend hetek
};

export const subjName = (n) => S.prefs.subjectNames?.[n] || n;
export const teacherName = (n) => (n ? S.prefs.teacherNames?.[n] || n : "");
export const shownName = () => S.prefs.nickname || S.prefs.displayName || S.raw.tanulo?.data?.Nev?.split(" ").slice(-1)[0] || "Diák";

// Jótanuló mód: minden számértékű jegy ötösként jelenik meg (csak a kijelzőn, a KRÉTA-ban nem változik).
export const grades = () => {
  const gs = U.normGrades(S.raw.jegyek?.data);
  return S.prefs.goodStudent ? gs.map((g) => (g.value != null ? { ...g, value: 5 } : g)) : gs;
};
export const numericGrades = () => grades().filter((g) => g.value != null && !g.isTerm && !S.prefs.hiddenSubjects?.includes(g.subject));
export const termGrades = () => grades().filter((g) => g.isTerm);
export const lessons = () => fillTestLessons(U.normLessons(S.raw.orarend?.data), U.mondayOf(new Date()));
export const absences = () => U.normAbs(S.raw.mulasztasok?.data);
// A KRÉTA-s adatokhoz hozzávesszük a Tervezőben felvett saját házikat és dolgozatokat (own: true).
const day = (s) => new Date(s + "T00:00");
export const homework = () => [
  ...U.normHw(S.raw.hazi?.data),
  ...(S.prefs.myHomework || []).map((h) => ({ id: "own_" + h.id, subject: h.subject, teacher: "", text: h.text, given: day(h.date), due: day(h.date), done: !!h.done, own: true })),
].sort((a, b) => a.due - b.due);
export const tests = () => [
  ...U.normTests(S.raw.szamonkeres?.data),
  ...(S.prefs.myTests || []).map((t) => ({ id: "own_" + t.id, subject: t.subject, teacher: "", topic: t.topic, kind: "saját dolgozat", date: day(t.date), own: true })),
].sort((a, b) => a.date - b.date);
export const notes = () => U.normNotes(S.raw.feljegyzesek?.data);

// Developer mód: a tanítási napokat (h–p), ahol nincs óra, véletlen (stabil, napra szóló) tesztórákkal tölti fel.
function testPool(ls) {
  const s = new Set(ls.map((l) => l.subject));
  U.normGrades(S.raw.jegyek?.data).forEach((g) => s.add(g.subject));
  U.normHw(S.raw.hazi?.data).forEach((h) => s.add(h.subject));
  U.normTests(S.raw.szamonkeres?.data).forEach((t) => s.add(t.subject));
  const pool = [...s].filter((x) => x && x !== "Egyéb");
  return pool.length >= 3 ? pool : ["Matematika", "Magyar nyelv és irodalom", "Történelem", "Angol nyelv", "Fizika", "Testnevelés"];
}
function seeded(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}
export function fillTestLessons(ls, monday) {
  if (!S.prefs.devMode || !S.prefs.devFillTimetable) return ls;
  const pool = testPool(ls), out = [...ls];
  for (let i = 0; i < 5; i++) {
    const d = U.addDays(monday, i);
    if (ls.some((l) => U.sameDay(l.start, d))) continue;
    const rnd = seeded(U.iso(d)), left = [...pool], n = Math.min(left.length, 5 + Math.floor(rnd() * 3));
    for (let k = 0; k < n; k++) {
      const subject = left.splice(Math.floor(rnd() * left.length), 1)[0];
      const start = new Date(d); start.setHours(8, 55 * k, 0, 0);
      out.push({ id: "test_" + U.iso(d) + k, start, end: new Date(start.getTime() + 45 * 60000), subject, name: subject, teacher: "", sub: "", room: "T" + (10 + k), nr: k + 1, off: false, topic: "", test: false, hw: false, fake: true });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

export const avgOf = (arr) => U.avg(arr, S.prefs.weighted !== false);

export function bySubject() {
  const m = new Map();
  for (const g of numericGrades()) {
    if (!m.has(g.subject)) m.set(g.subject, []);
    m.get(g.subject).push(g);
  }
  return [...m.entries()].map(([subject, list]) => ({ subject, list, avg: avgOf(list) })).sort((a, b) => subjName(a.subject).localeCompare(subjName(b.subject), "hu"));
}

export function allSubjects() {
  const s = new Set();
  grades().forEach((g) => s.add(g.subject));
  lessons().forEach((l) => s.add(l.subject));
  absences().forEach((a) => s.add(a.subject));
  homework().forEach((h) => s.add(h.subject));
  tests().forEach((t) => s.add(t.subject));
  return [...s].filter(Boolean).sort((a, b) => a.localeCompare(b, "hu"));
}
export function allTeachers() {
  const s = new Set();
  grades().forEach((g) => g.teacher && s.add(g.teacher));
  lessons().forEach((l) => { l.teacher && s.add(l.teacher); l.sub && s.add(l.sub); });
  absences().forEach((a) => a.teacher && s.add(a.teacher));
  homework().forEach((h) => h.teacher && s.add(h.teacher));
  tests().forEach((t) => t.teacher && s.add(t.teacher));
  notes().forEach((n) => n.teacher && s.add(n.teacher));
  return [...s].sort((a, b) => a.localeCompare(b, "hu"));
}

// ---------- beállítások ----------
let timer;
export function savePrefs(patch, { silent = true } = {}) {
  Object.assign(S.prefs, patch);
  applyPrefs();
  clearTimeout(timer);
  timer = setTimeout(async () => {
    try {
      S.prefs = await put("/api/prefs", S.prefs);
      if (!silent) U.toast("Mentve");
    } catch (e) { U.toast("Mentés sikertelen: " + e.message); }
  }, 450);
}

export function applyPrefs() {
  const p = S.prefs, root = document.documentElement;
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = p.theme === "auto" ? (dark ? "dark" : "light") : p.theme || "dark";
  root.dataset.density = p.density || "normal";
  root.style.setProperty("--accent", p.accent || "#6c5ce7");
  root.style.setProperty("--fs", p.fontScale || 1);
  root.style.setProperty("--radius", (p.radius ?? 16) + "px");
  document.getElementById("user-css").textContent = p.customCss || "";
}

export async function loadPrefs() {
  S.prefs = await get("/api/prefs");
  applyPrefs();
}

// ---------- adatok ----------
export async function loadBundle(force = false) {
  const r = await get("/api/data/bundle" + (force ? "?force=1" : ""));
  S.errors = {};
  for (const [k, v] of Object.entries(r.items)) {
    if (v.error) S.errors[k] = v.error;
    else S.raw[k] = v;
  }
  return r;
}

export async function loadWeek(monday, force = false) {
  const key = U.iso(monday);
  if (!force && S.weekCache[key]) return S.weekCache[key];
  const r = await get(`/api/data/orarend?datumTol=${key}&datumIg=${U.iso(U.addDays(monday, 6))}${force ? "&force=1" : ""}`);
  S.weekCache[key] = r;
  return r;
}

export function freshest() {
  const ts = Object.values(S.raw).map((r) => r.meta?.fetchedAt).filter(Boolean);
  return ts.length ? Math.min(...ts) : null;
}
