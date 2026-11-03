// Közös állapot: beállítások, áttekintés (tanár, osztályok, csoportok, képességek).
import { get, put } from "./api.js";
import * as U from "./util.js";

export const S = {
  user: null,
  prefs: {},
  ov: { teacher: {}, classes: [], groups: [], capabilities: [], bells: {} },
};

// Színtémák (ugyanazok, mint a diák verzióban): [név, sötét háttér, sötét kártya, világos háttér, világos kártya, ajánlott kiemelő]
export const PALETTES = {
  desk: ["Íróasztal", "#221a15", "#3a2e26", "#e5e9f6", "#d3d9ee", "#ffe14d"],
  ocean: ["Óceán", "#0f1a24", "#1f3140", "#dfedf5", "#cadfea", "#5cc8ff"],
  forest: ["Erdő", "#141c16", "#26342b", "#e3ecdf", "#d0dfcc", "#45e3a0"],
  grape: ["Szőlő", "#1b1626", "#302841", "#e9e4f4", "#ddd4ee", "#b79cff"],
  rose: ["Rózsa", "#241519", "#3d262d", "#f5e4e8", "#efd3da", "#ff5fa2"],
  slate: ["Grafit", "#1a1b1e", "#2e3035", "#e9ebee", "#d8dbe0", "#ff9f43"],
  midnight: ["Éjfél", "#10122a", "#22264d", "#e3e6fa", "#d5d9f4", "#8a7dff"],
  sunset: ["Naplemente", "#26160f", "#42291e", "#f8e5d9", "#f1d5c4", "#ff7a59"],
  teal: ["Menta", "#0f1f1e", "#1f3836", "#dff0ed", "#c9e3df", "#00d1c1"],
  sand: ["Homok", "#1f1c14", "#353025", "#f1ebdb", "#e6dcc4", "#e8c468"],
  ice: ["Jég", "#1c2230", "#2e384c", "#e3e9f1", "#d3dce8", "#88c0d0"],
  neon: ["Neon", "#140d1f", "#2a1c42", "#f0e2f9", "#e5d0f2", "#ff3df0"],
};

export const GRADE_TYPES = { "Témazáró": 200, "Dolgozat": 100, "Röpdolgozat": 100, "Felelet": 100, "Órai munka": 50, "Házi feladat": 50, "Projektmunka": 100 };
export const WEIGHTS = [50, 100, 150, 200, 300];
export const NOTE_KINDS = ["Szaktanári dicséret", "Szaktanári figyelmeztetés", "Értesítés", "Osztályfőnöki dicséret", "Osztályfőnöki figyelmeztetés"];
export const HEAD_ONLY = ["Osztályfőnöki dicséret", "Osztályfőnöki figyelmeztetés"];
export const TEST_KINDS = ["Témazáró", "Dolgozat", "Röpdolgozat", "Szóbeli felelet", "Projekt bemutatása"];

// a KRÉTA saját listái (valódi fiókban), különben az alapértelmezettek
export const gradeTypes = () => S.ov.gradeTypes || GRADE_TYPES;
export const testKinds = () => S.ov.testKinds || TEST_KINDS;
export const noteKinds = () => S.ov.noteKinds || NOTE_KINDS;
export const defaultType = () => { const t = Object.keys(gradeTypes()); return t.find((x) => /felelet/i.test(x)) || t[0]; };
export const enabled = (op) => S.ov.demo || (S.ov.enabledOps || []).includes(op); // ténylegesen elküldhető-e

export const group = (id) => S.ov.groups.find((g) => g.id === id);
export const groupName = (id) => group(id)?.name || "?";
export const klass = (id) => S.ov.classes.find((c) => c.id === id);
export const can = (op) => S.ov.capabilities.includes(op);
export const shownName = () => S.ov.teacher?.name || "Tanár";
export const groupOptions = (sel) => S.ov.groups.map((g) => `<option value="${g.id}" ${g.id === sel ? "selected" : ""}>${U.esc(g.name)}</option>`).join("");

// a legutóbb választott csoport, hogy oldalváltáskor ne kelljen újra kiválasztani
const GK = "kt_group";
export const lastGroup = () => { try { const g = localStorage.getItem(GK); if (group(g)) return g; } catch {} return S.ov.groups[0]?.id; };
export const setLastGroup = (g) => { try { localStorage.setItem(GK, g); } catch {} };

export async function loadOverview() {
  S.ov = await get("/api/t/overview");
  return S.ov;
}

export const lessonsBetween = (from, to) => get(`/api/t/lessons?from=${U.iso(from)}&to=${U.iso(to)}`);

// ---------- beállítások ----------
let timer, rev = 0;
export function savePrefs(patch, { silent = true } = {}) {
  Object.assign(S.prefs, patch);
  applyPrefs();
  const my = ++rev;
  clearTimeout(timer);
  timer = setTimeout(async () => {
    try {
      const saved = await put("/api/prefs", S.prefs);
      if (my === rev) S.prefs = saved;
      if (!silent) U.toast("Mentve");
    } catch (e) { U.toast("Mentés sikertelen: " + e.message); }
  }, 450);
}

export function applyPrefs() {
  const p = S.prefs, root = document.documentElement;
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = p.theme === "auto" ? (dark ? "dark" : "light") : p.theme || "dark";
  root.dataset.palette = PALETTES[p.palette] ? p.palette : "desk";
  root.style.setProperty("--accent", p.accent || "#ffe14d");
  root.style.setProperty("--on-accent", U.isLight(p.accent || "#ffe14d") ? "#1d1510" : "#ffffff");
  root.style.setProperty("--fs", p.fontScale || 1);
  root.style.setProperty("--radius", (p.radius ?? 16) + "px");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", getComputedStyle(root).getPropertyValue("--bg").trim());
}

export async function loadPrefs() {
  S.prefs = await get("/api/prefs");
  applyPrefs();
}
