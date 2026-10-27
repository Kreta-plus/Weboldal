// Jótanuló mód: minden bekapcsoláskor másik „jogi nyilatkozat”.
const DISCLAIMERS = [
  "Nem vállalunk felelősséget azért, ha anyád megver, amikor kiderül az igazság.",
  "A fejlesztő kijelenti, hogy semmi köze ahhoz, ha a szüleid ötös alapján ígérnek neked jutalmat, és később csalódnak.",
  "Tudomásul veszem, hogy a tanár a valóságban is látja a valódi jegyeimet, és ezt az oldalt nem érdekli.",
  "Az alkalmazás nem felel a következményekért, ha nagyi ötösök alapján sütit sütni kezd, és az igazság után sírva fakad.",
  "Elfogadom, hogy ez csak a saját kijelzőmön igaz, és a KRÉTA-t nem fogja meghatni.",
  "Vállalom, hogy ezt a képernyőt nem mutatom meg az osztályfőnökömnek, és ha mégis, nem hivatkozom az oldalra.",
  "A készítők nem vállalnak felelősséget semmilyen szobafogságért, mobilelvételért vagy megvonott zsebpénzért.",
  "Tudomásul veszem, hogy az ötös jegy attól még nem lesz valódi, hogy nagyon szeretném.",
  "Esküszöm, hogy a hamis ötösök miatt nem fogok megsértődni, ha a félévi mégis kettes lesz.",
  "A fejlesztő a hatályos szülői jog értelmében minden felelősséget kizár a kiabálásért, sóhajtozásért és a „mit csináltál?!” kérdésért.",
  "Tudomásul veszem, hogy ha a szüleim meglátják a valódi jegyeimet, az nem az alkalmazás hibája.",
  "Kijelentem, hogy ez a mód a lelki békémet szolgálja, és nem a valóságot.",
  "Elfogadom, hogy a tanárok nem tanulnak jobban attól, hogy én ötösökkel látom magam.",
  "Tudomásul veszem, hogy az oldal nem áll jót a következő dolgozat eredményéért.",
  "A készítők nem vállalnak felelősséget az esetleges családi vacsorán kialakuló kínos csendért.",
  "Hozzájárulok, hogy a valóság eltűnjön a kijelzőmről, de a következményei nem.",
  "Megértettem, hogy a jótanuló mód csak mód, nem varázslat, és a magolást sem váltja ki.",
  "Kötelezem magam, hogy ha anyám megkérdezi, nem én voltam, és a lap magától hibásodott meg.",
  "Elfogadom, hogy a hamis jegyek nem számítanak bele az átlagba, csak az önbizalmamba.",
  "A fejlesztő nem felelős semmilyen megvont wifiért, lefoglalt telefonért vagy kiadott ejtőernyőért.",
];
const KEY = "kp_last_disclaimer";

export function randomDisclaimer() {
  let last = -1;
  try { last = +localStorage.getItem(KEY); } catch {}
  let i;
  do { i = Math.floor(Math.random() * DISCLAIMERS.length); } while (i === last && DISCLAIMERS.length > 1);
  try { localStorage.setItem(KEY, i); } catch {}
  return DISCLAIMERS[i];
}

// ---------- Kezdőlap: vicces szöveg a holnapi órák alapján ----------
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const SUBJ_QUIPS = [
  [/testnev/i, ["Holnap testnevelés: a tornazsák már az ajtónál vár, a kifogások még nem.", "Testnevelés lesz. A fáradtságot otthon felejtheted, a zoknit viszont ne.", "Holnap tesi, ma este kezdj el nyújtani, vagy legalább gondolj rá."]],
  [/matem/i, ["Holnap matek: x-et megint keresni kell, pedig tegnap is elveszett.", "Matekóra lesz. A számológép nem gondolkodik helyetted, de mellette kevésbé fáj.", "Matek: ahol a betűk is számok, és a számok is betűk lesznek."]],
  [/fizik/i, ["Fizika lesz: Newton is megkapta a magáét az almától, te is túléled.", "Holnap fizika, az erő legyen veled, a képletek pedig a füzetedben."]],
  [/k[ée]mi/i, ["Kémia lesz. Ha bármi füstölni kezd, az vagy a kísérlet, vagy a házid.", "Holnap kémia: remélem, nem te leszel a katalizátor a bajban."]],
  [/biol/i, ["Biológia lesz, kiderül, melyik sejtorganellum vagy az osztályban.", "Holnap biosz: legalább az élet értelmét nem kérdezik, csak a mitokondriumot."]],
  [/t[öo]rt[ée]n/i, ["Történelem: holnap megint minden háborúnak az évszáma lesz a lényeg.", "Holnap töri, ha eddig nem tanultad, legalább legyél kreatív az évszámokkal."]],
  [/magyar/i, ["Magyar irodalom lesz: a költők szenvedtek, most te jössz.", "Holnap magyar, a vesszők helye még mindig rejtély, de legalább a nyelvtanban megoldható."]],
  [/angol|n[ée]met/i, ["Holnap nyelvóra: remélem, tegnap este nem csak a Duolingo bagoly figyelmeztetett.", "Nyelvóra lesz. A szókincs nagy része nálad is megvan, csak épp rossz nyelven."]],
  [/inform/i, ["Informatika lesz: ha lefagy a gép, az nem te vagy, hanem a rendszer.", "Holnap infó, és igen, megpróbálhatod ki- és bekapcsolni."]],
  [/ének|zene/i, ["Ének-zene lesz. A hangod hibátlan, legfeljebb a hallgatóságnak kell erősnek lennie."]],
  [/földr/i, ["Földrajz lesz, legalább már tudod, hol vagy, mert a térképen még keresni kell."]],
];
const COUNT_QUIPS = {
  none: ["Holnap nincs óra az órarendben. Alhatsz, mint egy medve a téli álmában. 🐻", "Nincs tanítás holnap! Az ébresztőórád szabadságot kapott. 🎉", "Holnap nem kell iskolába menni, és ez nem hiba, ez a rendszer."],
  few: ["Csak pár óra lesz holnap, szinte már szabadnap.", "Rövid nap jön, a hátizsák is hálás lesz."],
  many: ["Holnap rengeteg óra lesz. Pakolj be sok kajával és sok türelemmel.", "Hosszú nap vár rád: a kávéd (vagy kakaód) is érdemel egy külön helyet a hátizsákban."],
};
const WEEKDAY_QUIPS = { 5: ["Holnap péntek, a hétvége már a küszöbön áll, és kopog.", "Péntek lesz! Már csak egy nap, és a hét befejeződik, ahogy kell."], 1: ["Holnap hétfő. Szoktam mondani: a hét nem is olyan rossz, csak az első napja."] };

export function tomorrowQuip({ day, lessons, tests, homework, subjName }) {
  const ls = lessons.filter((l) => !l.off);
  const wd = (day.getDay() + 6) % 7 + 1; // 1 = hétfő
  const c = [];
  if (!ls.length) c.push(...COUNT_QUIPS.none);
  else {
    const subs = [...new Set(ls.map((l) => l.subject))];
    for (const [re, qs] of SUBJ_QUIPS) if (subs.some((s) => re.test(s))) c.push(...qs, ...qs);
    if (ls.length <= 3) c.push(...COUNT_QUIPS.few);
    if (ls.length >= 7) c.push(...COUNT_QUIPS.many);
    const first = ls[0].start, hh = first.getHours() * 60 + first.getMinutes();
    if (hh <= 8 * 60) c.push(`Az első óra ${String(first.getHours()).padStart(2, "0")}:${String(first.getMinutes()).padStart(2, "0")}-kor kezdődik, az ágy már most hiányozni fog. 😴`);
    if (hh >= 9 * 60) c.push("Holnap később kezdesz, éld ki az extra alvást!");
    const t = tests[0];
    if (t) c.push(`Holnap ${subjName(t.subject)} dolgozat lesz${t.topic ? " (" + t.topic + ")" : ""}. A tanulás még belefér az estébe. 📚`, `Dolgozat holnap: ${subjName(t.subject)}. Ma este nem Netflix, hanem jegyzet.`);
    if (homework.length >= 3) c.push(`Holnapra ${homework.length} házi esedékes. A füzeted már most sóhajtozik.`);
    else if (homework.length === 1) c.push("Holnapra csak egy házi esedékes, szinte már nem is számít. (De számít.)");
    c.push(...(WEEKDAY_QUIPS[wd] || []));
    c.push(`Holnap ${ls.length} óra, ${[...new Set(ls.map((l) => subjName(l.subject)))].slice(0, 3).join(", ")}${subs.length > 3 ? " és még pár" : ""}. Nem lesz ez olyan vészes.`);
  }
  return pick(c);
}
