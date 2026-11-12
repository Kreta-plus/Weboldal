// ---------- Android letöltés ----------
// A webes változat még fejlesztés alatt áll, ezért a gombok az Android APK-t töltik le. A legújabb verziót az app repójának
// updates/latest.json leírója adja meg (ugyanezt nézi az app beépített frissítője is). Ha nem érhető el, a HTML-ben lévő 2.5-ös link marad.
const APK_BASE = "https://raw.githubusercontent.com/Kreta-plus/ZsirKretaAndroidApp/main/updates/";
const HU_MONTHS = ["január", "február", "március", "április", "május", "június", "július", "augusztus", "szeptember", "október", "november", "december"];
const ANDROID = { 21: "5.0", 23: "6.0", 24: "7.0", 26: "8.0", 28: "9", 29: "10", 30: "11", 31: "12", 33: "13", 34: "14", 35: "15" };
const huDate = (s) => { const [y, m, d] = String(s).split("-").map(Number); return y && m && d ? `${y}. ${HU_MONTHS[m - 1]} ${d}.` : ""; };
const mb = (b) => `${(b / 1048576).toFixed(1).replace(".", ",")} MB`;
const setText = (sel, text) => text && document.querySelectorAll(sel).forEach((el) => (el.textContent = text));

fetch(APK_BASE + "latest.json", { cache: "no-cache" })
  .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
  .then((m) => {
    if (!/^[\w.-]+\.apk$/.test(m.apk || "")) return; // csak sima fájlnevet fogadunk el
    const url = APK_BASE + encodeURIComponent(m.apk);
    document.querySelectorAll("[data-apk]").forEach((a) => (a.href = url));
    const android = ANDROID[m.minSdk];
    setText("[data-apk-meta]", [m.versionName && `Verzió: ${m.versionName}`, m.size > 0 && mb(m.size), android && `Android ${android} vagy újabb`].filter(Boolean).join(" · "));
    setText("[data-apk-version]", m.versionName);
    setText("[data-apk-date]", huDate(m.date));
    setText("[data-apk-sha]", m.sha256);
    const notes = document.querySelector("[data-apk-notes]");
    if (notes && Array.isArray(m.notes) && m.notes.length) {
      notes.replaceChildren(...m.notes.map((t) => Object.assign(document.createElement("li"), { textContent: String(t) })));
    }
  })
  .catch(() => {}); // marad a beépített (2.5-ös) link és leírás

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
