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

export const grades = () => U.normGrades(S.raw.jegyek?.data);
export const numericGrades = () => grades().filter((g) => g.value != null && !g.isTerm && !S.prefs.hiddenSubjects?.includes(g.subject));
export const termGrades = () => grades().filter((g) => g.isTerm);
export const lessons = () => U.normLessons(S.raw.orarend?.data);
export const absences = () => U.normAbs(S.raw.mulasztasok?.data);
export const homework = () => U.normHw(S.raw.hazi?.data);
export const tests = () => U.normTests(S.raw.szamonkeres?.data);
export const notes = () => U.normNotes(S.raw.feljegyzesek?.data);

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
