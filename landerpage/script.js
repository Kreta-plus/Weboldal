// Az alkalmazás címe: minden „Kipróbálom” / „Megnyitás” gomb ide visz. Élesítéskor írd át a valódi címre.
const APP_URL = "/";
document.querySelectorAll("[data-app]").forEach((a) => (a.href = APP_URL));

// ---------- jegyszámoló (ugyanaz a logika, mint az app „hány 5-ös kell” részében, súlyok nélkül) ----------
const NAMES = { 1: "Egyes", 2: "Kettes", 3: "Hármas", 4: "Négyes", 5: "Ötös" };
const GOAL = {
  2.5: ["A hármashoz", "Megvan a hármas."],
  3.5: ["A négyeshez", "Megvan a négyes."],
  4.5: ["Az ötöshöz", "Megvan az ötös."],
};
let grades = [5, 4, 5, 3, 5, 4, 4];
let target = 4.5;

const $grades = document.getElementById("grades");
const $avg = document.getElementById("avg");
const $verdict = document.getElementById("verdict");
const fmt = (n) => n.toFixed(2).replace(".", ",");

function fivesNeeded() {
  const sum = grades.reduce((a, b) => a + b, 0);
  let n = 0;
  while ((sum + 5 * n) / (grades.length + n) < target - 1e-9 && n <= 30) n++;
  return n;
}

function draw() {
  $grades.innerHTML = grades
    .map((g, i) => `<button type="button" class="gr g${g}" data-i="${i}" aria-label="${NAMES[g]} törlése">${g}</button>`)
    .join("");
  if (!grades.length) {
    $avg.textContent = "–";
    $verdict.textContent = "Adj hozzá jegyeket, és kiszámolom az átlagot.";
    return;
  }
  const avg = grades.reduce((a, b) => a + b, 0) / grades.length;
  $avg.textContent = fmt(avg);
  const [toward, done] = GOAL[target];
  const n = fivesNeeded();
  if (n === 0) $verdict.innerHTML = `<b>${done}</b> Most már csak tartani kell.`;
  else if (n > 30) $verdict.innerHTML = `${toward} több mint 30 ötös kellene. Erre a félévre válassz kisebb célt.`;
  else $verdict.innerHTML = `${toward} még <b>${n} ötös</b> kell.`;
}

$grades.addEventListener("click", (e) => {
  const b = e.target.closest("[data-i]");
  if (!b) return;
  grades.splice(+b.dataset.i, 1);
  draw();
});
document.querySelectorAll("[data-add]").forEach((b) => (b.onclick = () => {
  if (grades.length < 24) grades.push(+b.dataset.add);
  draw();
}));
document.querySelectorAll("[data-target]").forEach((b) => (b.onclick = () => {
  target = +b.dataset.target;
  document.querySelectorAll("[data-target]").forEach((x) => x.classList.toggle("on", x === b));
  draw();
}));
draw();

// ---------- színtémák a makettekhez ----------
const shots = document.getElementById("shots");
document.querySelectorAll("[data-pal]").forEach((b) => (b.onclick = () => {
  shots.dataset.pal = b.dataset.pal;
  document.querySelectorAll("[data-pal]").forEach((x) => x.setAttribute("aria-checked", x === b));
}));
