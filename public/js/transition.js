// Oldalváltás animációja (Web Animations API). A típus és az idő a beállításokból jön:
// S.prefs.transition és S.prefs.transitionMs (az egész váltás hossza: kb. 40% kilépés, 60% belépés).
import { S } from "./state.js";

export const TRANSITIONS = [["none", "Nincs"], ["fade", "Áttűnés"], ["slide", "Csúszás"], ["rise", "Felúszás"], ["zoom", "Nagyítás"], ["blur", "Elmosás"], ["wipe", "Függöny"]];

// típus -> (irány, nagyítás középpontja) => [kilépő, belépő] kulcskockák; irány: 1 = előre a menüben, -1 = vissza
const FX = {
  fade: () => [[{ opacity: 1 }, { opacity: 0 }], [{ opacity: 0 }, { opacity: 1 }]],
  slide: (d) => [
    [{ opacity: 1, transform: "none" }, { opacity: 0, transform: `translateX(${-32 * d}px)` }],
    [{ opacity: 0, transform: `translateX(${32 * d}px)` }, { opacity: 1, transform: "none" }],
  ],
  rise: () => [
    [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(-10px)" }],
    [{ opacity: 0, transform: "translateY(20px)" }, { opacity: 1, transform: "none" }],
  ],
  zoom: (d, o) => [
    [{ opacity: 1, transform: "none", transformOrigin: o }, { opacity: 0, transform: "scale(1.04)", transformOrigin: o }],
    [{ opacity: 0, transform: "scale(.94)", transformOrigin: o }, { opacity: 1, transform: "none", transformOrigin: o }],
  ],
  blur: () => [
    [{ opacity: 1, filter: "blur(0px)" }, { opacity: 0, filter: "blur(8px)" }],
    [{ opacity: 0, filter: "blur(8px)" }, { opacity: 1, filter: "blur(0px)" }],
  ],
  // függöny: a régi oldalt egy él letakarja, az új ugyanabban az irányban tűnik elő (mint a csúszásnál)
  wipe: (d) => {
    const toLeft = "inset(0 100% 0 0)", toRight = "inset(0 0 0 100%)", all = "inset(0 0 0 0)";
    return [[{ clipPath: all }, { clipPath: d > 0 ? toLeft : toRight }], [{ clipPath: d > 0 ? toRight : toLeft }, { clipPath: all }]];
  },
};
const EXIT_EASE = "cubic-bezier(.4, 0, 1, 1)";
const ENTER_EASE = "cubic-bezier(0, 0, .2, 1)";
const reduce = matchMedia("(prefers-reduced-motion: reduce)");

function effect() {
  const fx = FX[S.prefs.transition || "fade"];
  if (!fx) return null; // "none": nincs animáció
  return reduce.matches ? FX.fade : fx; // ha a rendszerben be van kapcsolva a mozgáscsökkentés, csak áttűnés
}
// [kilépés, belépés] ezredmásodpercben
function times() {
  const ms = Math.min(800, Math.max(100, Number(S.prefs.transitionMs) || 250));
  const out = Math.round(ms * 0.4);
  return [out, ms - out];
}
// a nagyítás a képernyőn látszó rész közepéből induljon, ne a (hosszú) oldal közepéből
function origin(el) {
  const r = el.getBoundingClientRect();
  return `50% ${Math.round((Math.max(0, -r.top) + Math.min(r.height, innerHeight - r.top)) / 2)}px`;
}

let cur = null; // a nézet éppen futó, vagy kilépés után rejtve tartó animációja

// Kilépés: a régi tartalom eltűnik, és rejtve marad, amíg a pageIn meg nem jeleníti az újat.
export function pageOut(el, d = 1) {
  const fx = effect();
  if (!fx) return Promise.resolve();
  if (!(cur?.effect?.target === el && cur.dir === "out")) { // egy már futó kilépést nem kezdünk újra
    cur?.cancel();
    cur = el.animate(fx(d, origin(el))[0], { duration: times()[0], easing: EXIT_EASE, fill: "forwards" });
    cur.dir = "out";
  }
  return cur.finished.then(() => {}, () => {});
}

// Belépés. animate=false: nincs új animáció, csak a kilépés utáni rejtés szűnik meg; egy futó belépés folytatódik.
export function pageIn(el, d = 1, animate = true) {
  if (cur?.effect?.target === el && cur.dir === "in" && cur.playState === "running") return;
  cur?.cancel();
  cur = null;
  const fx = animate && effect();
  if (!fx) return;
  cur = el.animate(fx(d, origin(el))[1], { duration: times()[1], easing: ENTER_EASE });
  cur.dir = "in";
}

// A beállításoknál: lejátssza a váltást egy kis mintán; swap() a kilépés és a belépés között cseréli a tartalmat.
let pvSeq = 0;
export async function preview(el, d, swap) {
  const my = ++pvSeq, fx = effect(), [outMs, inMs] = times();
  el.getAnimations().forEach((a) => a.cancel());
  if (fx) await el.animate(fx(d, "50% 50%")[0], { duration: outMs, easing: EXIT_EASE, fill: "forwards" }).finished.catch(() => {});
  if (my !== pvSeq) return; // közben újra elindították
  swap();
  el.getAnimations().forEach((a) => a.cancel());
  if (fx) el.animate(fx(d, "50% 50%")[1], { duration: inMs, easing: ENTER_EASE });
}
