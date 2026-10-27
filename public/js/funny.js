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
