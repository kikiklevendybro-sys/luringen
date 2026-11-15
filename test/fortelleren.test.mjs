// Fortelleren: the deck building and the turn rules as pure functions loaded in node:vm without
// the kit – age bands, levels (fixed and rising), modes (no show-and-draw cards when guessing,
// «Begge svarer» only for a child and a grown-up), no card twice in a game, swaps and skips that
// never count, friendly points, favourites – and the cards: the same decks, levels and card
// structure in nb, en and da, 400+ per language, «Spør videre» on every card that needs one, no
// yes/no questions, no repeats, short cards for the youngest, and banned words kept out of the
// children's, family and teen decks.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const window = {};
vm.runInNewContext(readFileSync(join(ROT, "rusj/spill/fortelleren/spill.js"), "utf8"), { window, console });
const M = window.RusjForteller;
const j = (x) => JSON.parse(JSON.stringify(x));
const les = (mappe) => JSON.parse(readFileSync(join(ROT, "rusj/spill/fortelleren", mappe, "kort.json"), "utf8"));
const DATA = { nb: les("data"), en: les("data.en"), da: les("data.da") };
const stokk = (sprak, id) => DATA[sprak].stokker.find((s) => s.id === id).kort;
const ord = (t) => t.toLocaleLowerCase().split(/[^\p{L}\p{N}-]+/u).filter(Boolean);

// A deck that remembers what was shown, like R.kortstokk (seeded, so the tests are repeatable).
function lagDekk(antall, fro = 1) {
  let s = fro >>> 0;
  const rng = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const brukt = new Set();
  let forrige = -1;
  return (ok) => {
    let k = [];
    for (let i = 0; i < antall; i++) if (!brukt.has(i) && ok(i)) k.push(i);
    if (!k.length) {
      for (const i of Array.from(brukt)) if (ok(i)) brukt.delete(i);
      for (let i = 0; i < antall; i++) if (!brukt.has(i) && ok(i) && i !== forrige) k.push(i);
      if (!k.length && forrige >= 0 && ok(forrige)) k.push(forrige);
    }
    if (!k.length) return -1;
    const i = k[Math.floor(rng() * k.length)];
    brukt.add(i);
    forrige = i;
    return i;
  };
}

// Plays a whole game with the pure rules: answers every card (and swaps or skips now and then).
function spill(sprak, o, antall = 3, fro = 7, egne = null, bytte = true) {
  const oppsett = M.rydd(o);
  const sp = M.nyttSpill(oppsett, antall, 1, egne);
  const kort = egne || stokk(sprak, sp.stokk);
  const neste = lagDekk(kort.length, fro);
  const trekk = () => M.trekk(kort, egne ? null : M.nivaFor(sp.niva, sp.nr, sp.lengde), sp.modus, sp.sett, neste);
  M.legg(sp, trekk());
  const spilt = [];
  let svar;
  let runde = 0;
  do {
    runde += 1;
    if (bytte && runde % 4 === 2) M.bytt(sp, trekk());
    if (bytte && runde % 7 === 3) M.staOver(sp, trekk());
    if (sp.modus === "gjett") M.hor(sp);
    spilt.push({ nr: sp.nr, i: sp.kort, k: kort[sp.kort], onsket: egne ? null : M.nivaFor(sp.niva, sp.nr, sp.lengde) });
    svar = M.svart(sp);
    if (svar === "neste") M.legg(sp, trekk());
  } while (svar === "neste" && runde < 200);
  return { sp, spilt };
}

// ---------- The cards ----------

test("samme stokker, nivåer og kortstruktur på nb, en og da – og over 400 kort per språk", () => {
  for (const sprak of ["nb", "en", "da"]) {
    assert.deepEqual(j(DATA[sprak].stokker.map((s) => s.id)), j(M.STOKKER), `${sprak}: stokkene`);
    const alle = DATA[sprak].stokker.reduce((n, s) => n + s.kort.length, 0);
    assert.ok(alle >= 400, `${sprak}: bare ${alle} kort`);
  }
  for (const id of M.STOKKER) {
    const nb = stokk("nb", id);
    for (const sprak of ["en", "da"]) {
      const annen = stokk(sprak, id);
      assert.equal(annen.length, nb.length, `${sprak} ${id}: antall kort`);
      nb.forEach((k, i) => {
        const a = annen[i];
        const form = (x) => [x.n, x.ty, !!x.v, !!x.f, !!x.e].join();
        assert.equal(form(a), form(k), `${sprak} ${id} kort ${i + 1} har en annen form enn på norsk: «${a.t}» / «${k.t}»`);
        if (k.e) assert.equal(a.e, k.e, `${sprak} ${id} kort ${i + 1}: samme bilde`);
      });
    }
    for (const n of [1, 2, 3]) {
      const niva = nb.filter((k) => k.n === n);
      assert.ok(niva.length >= 12, `${id} nivå ${n}: bare ${niva.length} kort`);
      assert.ok(niva.filter((k) => k.ty !== "vis").length >= 11, `${id} nivå ${n}: for få kort til «Gjett svaret»`);
      assert.ok(new Set(niva.map((k) => k.ty)).size >= 5, `${id} nivå ${n}: for lite variasjon i korttyper`);
    }
  }
});

test("hvert kort: gyldig nivå og type, «Spør videre» der det trengs, den voksnes versjon og bilder bare for barn", () => {
  for (const sprak of ["nb", "en", "da"]) {
    for (const s of DATA[sprak].stokker) {
      const barn = M.ROLLE_STOKK[s.id];
      for (const k of s.kort) {
        const hvor = `${sprak} ${s.id}: «${k.t}»`;
        assert.ok([1, 2, 3].includes(k.n) && M.TYPER.includes(k.ty), `${hvor}: nivå/type`);
        assert.ok(typeof k.t === "string" && k.t.trim() === k.t && k.t.length > 8, `${hvor}: tekst`);
        assert.match(k.t, /[?!.]$/, `${hvor}: slutter ikke med ?, ! eller .`);
        if (k.ty !== "vis") assert.ok(k.f, `${hvor}: mangler «Spør videre»`);
        if (k.f) assert.match(k.f, /[?!]$/, `${hvor}: «Spør videre» slutter ikke med ? eller !`);
        if (k.f) assert.notEqual(k.f, k.t, `${hvor}: «Spør videre» er lik kortet`);
        if (k.v) assert.ok(barn && k.v !== k.t && /[?!.]$/.test(k.v), `${hvor}: den voksnes versjon`);
        if (s.id === "barn46") {
          assert.ok(k.e && k.e.length <= 12, `${hvor}: kort for 4–6 år skal ha et bilde`);
          assert.ok(k.t.length <= 64, `${hvor}: for langt for de minste (${k.t.length} tegn)`);
        } else assert.ok(!k.e, `${hvor}: bilder er bare for 4–6 år`);
      }
    }
  }
});

test("ingen kort to ganger, og ingen «Spør videre» som er et annet kort", () => {
  for (const sprak of ["nb", "en", "da"]) {
    const sett = new Map();
    for (const s of DATA[sprak].stokker)
      for (const k of s.kort) {
        for (const t of [k.t, k.v].filter(Boolean)) {
          const n = t.toLocaleLowerCase();
          assert.ok(!sett.has(n), `${sprak}: «${t}» står to ganger (${sett.get(n)} og ${s.id})`);
          sett.set(n, s.id);
        }
      }
    for (const s of DATA[sprak].stokker) for (const k of s.kort) if (k.f) assert.ok(!sett.has(k.f.toLocaleLowerCase()), `${sprak} ${s.id}: «Spør videre» «${k.f}» er også et kort`);
  }
});

const JANEI = {
  nb: ["er", "har", "kan", "vil", "liker", "synes", "tror", "skal", "ville", "kunne", "burde", "bør", "får", "husker", "føler", "pleier", "trenger", "savner", "gruer", "gleder", "hadde", "var", "blir", "ble", "finnes", "må", "tenker", "elsker", "vet", "kjenner", "ønsker", "angrer", "tør", "orker", "går", "gjør"],
  en: ["are", "is", "do", "does", "did", "have", "has", "had", "can", "could", "would", "will", "should", "shall", "was", "were", "may", "might", "must", "isn't", "aren't", "don't", "didn't"],
  da: ["er", "har", "kan", "vil", "kunne", "ville", "skal", "skulle", "synes", "tror", "bør", "burde", "får", "husker", "føler", "plejer", "savner", "glæder", "havde", "var", "bliver", "blev", "findes", "må", "tænker", "elsker", "ved", "kender", "ønsker", "fortryder", "tør", "gider", "går", "gør"],
};
const SPORREORD = {
  nb: ["hva", "hvem", "hvor", "hvordan", "hvorfor", "hvilken", "hvilket", "hvilke", "når"],
  en: ["what", "what's", "who", "who's", "whose", "where", "where's", "how", "why", "which", "when"],
  da: ["hvad", "hvem", "hvor", "hvordan", "hvorfor", "hvilken", "hvilket", "hvilke", "hvornår"],
};
const BYDE = {
  nb: ["vis", "tegn", "lag", "syng", "nynn", "spill", "etterlign", "fortell"],
  en: ["show", "draw", "make", "sing", "hum", "play", "do", "tell"],
  da: ["vis", "tegn", "lav", "syng", "nyn", "spil", "efterlign", "fortæl"],
};

test("ingen ja/nei-spørsmål: spørsmål har et spørreord, oppgaver begynner med et verb", () => {
  for (const sprak of ["nb", "en", "da"]) {
    for (const s of DATA[sprak].stokker)
      for (const k of s.kort)
        for (const [hva, t] of [["kort", k.t], ["voksen", k.v], ["videre", k.f]]) {
          if (!t) continue;
          const o = ord(t);
          const hvor = `${sprak} ${s.id} (${hva}): «${t}»`;
          if (t.endsWith("?")) {
            assert.ok(!JANEI[sprak].includes(o[0]), `${hvor}: ser ut som et ja/nei-spørsmål`);
            assert.ok(o.some((w) => SPORREORD[sprak].includes(w)), `${hvor}: spørsmål uten spørreord`);
          } else assert.ok(BYDE[sprak].includes(o[0]), `${hvor}: en oppgave skal begynne med et verb (${BYDE[sprak].join(", ")})`);
        }
  }
});

// Words that never belong in the children's, family or teen decks (whole words; * = the start of a word).
const FORBUDT = {
  nb: ["sex", "sexy", "naken", "nakne", "porno", "kåt", "kondom", "pupper", "alkohol", "øl", "vin", "fyll", "fylla", "fylleri", "beruset", "røyk*", "snus", "vape", "hasj", "narkotika", "dop", "rus", "selvmord*", "selvskad*", "overgrep*", "misbruk*", "voldt*", "vold", "død", "døde", "dødsfall", "begravelse*", "skilsmisse*", "mobb*", "slank*", "vekt", "kalori*", "diett", "feit", "tykk", "kyss*", "kline*", "drap*", "våpen"],
  en: ["sex", "sexy", "naked", "nude", "porn", "horny", "condom", "alcohol", "beer", "wine", "drunk", "vodka", "drugs", "weed", "cannabis", "cigarette*", "smoking", "vape*", "suicide*", "self-harm", "abuse*", "rape", "violence", "violent", "dead", "death", "die", "dying", "funeral*", "divorce*", "bully*", "bullie*", "diet*", "calorie*", "weight", "fat", "skinny", "kiss*", "snog*", "murder*", "gun*", "weapon*"],
  da: ["sex", "sexet", "nøgen", "porno", "liderlig", "kondom", "alkohol", "øl", "vin", "fuld", "druk*", "beruset", "stoffer", "hash", "cigaret*", "smøg*", "snus", "vape", "selvmord*", "selvskad*", "misbrug*", "overgreb*", "voldt*", "vold", "død", "døde", "dødsfald", "begravelse*", "skilsmisse*", "mobb*", "slank*", "vægt", "kalorie*", "tyk", "kys*", "mord*", "våben"],
};
const SEKSUELT = {
  nb: ["sex", "sexy", "naken", "nakne", "porno", "kåt", "kondom", "samleie*"],
  en: ["sex", "sexy", "naked", "nude", "porn", "horny", "condom"],
  da: ["sex", "sexet", "nøgen", "porno", "liderlig", "kondom", "samleje*"],
};
const treff = (liste, t) => {
  const o = ord(t);
  return liste.filter((f) => (f.endsWith("*") ? o.some((w) => w.startsWith(f.slice(0, -1))) : o.includes(f)));
};

test("forbudte ord: ingenting av dette for barn, familie og ungdom – og ingenting seksuelt noe sted", () => {
  for (const sprak of ["nb", "en", "da"]) {
    for (const s of DATA[sprak].stokker) {
      const streng = s.id.startsWith("barn") || s.id === "familie" || s.id === "ungdom";
      for (const k of s.kort)
        for (const t of [k.t, k.v, k.f].filter(Boolean)) {
          assert.deepEqual(treff(SEKSUELT[sprak], t), [], `${sprak} ${s.id}: «${t}»`);
          if (streng) assert.deepEqual(treff(FORBUDT[sprak], t), [], `${sprak} ${s.id}: «${t}»`);
        }
    }
  }
  // The check itself works.
  assert.deepEqual(treff(FORBUDT.nb, "Hva gjør deg slank og full?"), ["slank*"]);
  assert.deepEqual(treff(FORBUDT.en, "Who got bullied?"), ["bullie*"]);
});

// ---------- Setup ----------

test("hvem som spiller: barnets alder velger stokken, og «Begge svarer» finnes bare for barn og voksen", () => {
  assert.equal(M.stokkFor("barnvoksen", "46"), "barn46");
  assert.equal(M.stokkFor("barnvoksen", "79"), "barn79");
  assert.equal(M.stokkFor("barnvoksen", "1012"), "barn1012");
  assert.equal(M.stokkFor("barnvoksen", "13"), "barn46", "ukjent alder blir de minste");
  for (const g of ["familie", "venner", "ungdom", "voksne"]) assert.equal(M.stokkFor(g, "79"), g, `${g} har sin egen stokk uansett alder`);
  assert.equal(M.stokkFor("fest", "46"), "familie");
  assert.deepEqual(j(M.moduserFor("barnvoksen")), ["begge", "snakk", "gjett"]);
  for (const g of ["familie", "venner", "ungdom", "voksne"]) assert.deepEqual(j(M.moduserFor(g)), ["snakk", "gjett"]);
  assert.deepEqual(j(M.rydd({})), { gjeng: "familie", alder: "46", modus: "snakk", niva: "stiger", lengde: 10, poeng: false });
  assert.deepEqual(j(M.rydd({ gjeng: "venner", modus: "begge", niva: 3, lengde: 7, poeng: 1 })), { gjeng: "venner", alder: "46", modus: "snakk", niva: "3", lengde: 10, poeng: true });
  assert.equal(M.rydd({ gjeng: "barnvoksen", modus: "gjett" }).modus, "gjett");
  assert.equal(M.rydd({ gjeng: "barnvoksen" }).modus, "begge");
});

test("nivåer: fast nivå, eller «Stiger» – lett, så middels, så dypere", () => {
  const rekke = (lengde) => Array.from({ length: lengde }, (_, i) => M.nivaFor("stiger", i + 1, lengde)).join("");
  assert.equal(rekke(5), "11223");
  assert.equal(rekke(10), "1111222333");
  assert.equal(rekke(20), "11111112222222333333");
  for (const n of ["1", "2", "3"]) assert.equal(M.nivaFor(n, 9, 10), Number(n));
});

// ---------- Deck building ----------

test("trekk: ønsket nivå først, aldri samme kort to ganger i et spill, ingen vis-og-tegn i «Gjett svaret»", () => {
  for (const sprak of ["nb", "en", "da"]) {
    for (const g of M.GJENGER)
      for (const alder of g === "barnvoksen" ? M.ALDRE : ["46"])
        for (const modus of M.moduserFor(g))
          for (const niva of M.NIVAER)
            for (const lengde of M.LENGDER) {
              const { sp, spilt } = spill(sprak, { gjeng: g, alder, modus, niva, lengde }, 4, lengde * 13 + niva.length);
              const hvor = `${sprak} ${g}/${alder} ${modus} ${niva} ${lengde}`;
              assert.equal(sp.ferdig, true, `${hvor}: ble ikke ferdig`);
              assert.equal(sp.besvart, lengde, hvor);
              assert.equal(spilt.length, lengde, hvor);
              assert.equal(new Set(sp.sett).size, sp.sett.length, `${hvor}: et kort kom to ganger`);
              assert.ok(sp.sett.length >= lengde, hvor);
              if (modus === "gjett") assert.ok(spilt.every((x) => x.k.ty !== "vis"), `${hvor}: vis-og-tegn i «Gjett svaret»`);
              const kort = stokk(sprak, sp.stokk);
              // Every card is of the wanted level while that level still has cards nobody has seen.
              const brukt = new Set();
              for (const x of spilt) {
                const igjen = kort.some((k, i) => k.n === x.onsket && M.passer(k, modus) && !sp.sett.slice(0, sp.sett.indexOf(x.i)).includes(i));
                if (igjen) assert.equal(x.k.n, x.onsket, `${hvor}: kort ${x.nr} har nivå ${x.k.n}, ønsket ${x.onsket}`);
                brukt.add(x.i);
              }
            }
  }
});

test("trekk: når et nivå er brukt opp, kommer nærmeste nivå – og til slutt heller en gjentakelse enn ingenting", () => {
  const kort = [
    { n: 1, ty: "fortell", t: "a" },
    { n: 2, ty: "fortell", t: "b" },
    { n: 3, ty: "vis", t: "c" },
    { n: 3, ty: "minne", t: "d" },
  ];
  const neste = lagDekk(kort.length, 3);
  assert.equal(M.trekk(kort, 3, "gjett", [], neste), 3, "dypere uten vis-kortet");
  assert.equal(M.trekk(kort, 3, "gjett", [3], neste), 1, "så middels");
  assert.equal(M.trekk(kort, 3, "gjett", [3, 1], neste), 0, "så lett");
  assert.ok([0, 1, 3].includes(M.trekk(kort, 3, "gjett", [0, 1, 3], neste)), "alt er sett: en gjentakelse, aldri vis-kortet");
  assert.equal(M.trekk(kort, 1, "snakk", [0, 1, 3], neste), 2, "i «Snakk sammen» går vis-kortet fint");
  assert.equal(M.trekk([{ n: 1, ty: "vis", t: "x" }], 1, "gjett", [], lagDekk(1)), -1, "ingen kort passer");
});

// ---------- Turns ----------

test("barn og voksen: to roller uten navn; den voksne får sin egen versjon av kortet", () => {
  const sp = M.nyttSpill(M.rydd({ gjeng: "barnvoksen", alder: "79" }), 6, 3, null);
  assert.equal(sp.roller, true);
  assert.equal(sp.antall, 2, "alltid to roller, uansett hvor mange navn som er lagret");
  assert.equal(sp.tur, 0, "barnet først");
  assert.equal(sp.stokk, "barn79");
  assert.equal(sp.modus, "begge");
  assert.equal(M.rolle(sp, 0), "barn");
  assert.equal(M.rolle(sp, 1), "voksen");
  const k = { t: "Barnets spørsmål?", v: "Den voksnes spørsmål?" };
  assert.equal(M.tekstFor(k, "barn"), k.t);
  assert.equal(M.tekstFor(k, "voksen"), k.v);
  assert.equal(M.tekstFor({ t: "Det samme?" }, "voksen"), "Det samme?");
  M.legg(sp, 4);
  assert.equal(M.svart(sp), "neste");
  assert.equal(sp.tur, 1, "så svarer den voksne først");
  const venner = M.nyttSpill(M.rydd({ gjeng: "venner" }), 5, 7, null);
  assert.deepEqual(j([venner.roller, venner.antall, venner.tur, M.rolle(venner, 1)]), [false, 5, 2, null]);
});

test("snakk sammen: bytt og stå over teller aldri; stå over gir turen videre; ferdig etter siste kort", () => {
  const sp = M.nyttSpill(M.rydd({ gjeng: "familie", lengde: 5 }), 3, 0, null);
  M.legg(sp, 10);
  assert.deepEqual(j([sp.nr, sp.tur, sp.kort, sp.fase, sp.sett]), [1, 0, 10, "kort", [10]]);
  M.bytt(sp, 11);
  assert.deepEqual(j([sp.nr, sp.tur, sp.kort, sp.byttet, sp.besvart]), [1, 0, 11, 1, 0]);
  M.staOver(sp, 12);
  assert.deepEqual(j([sp.nr, sp.tur, sp.kort, sp.staOver, sp.besvart, sp.sett]), [1, 1, 12, 1, 0, [10, 11, 12]]);
  for (let n = 1; n < 5; n++) {
    assert.equal(M.svart(sp), "neste");
    M.legg(sp, 12 + n);
  }
  assert.deepEqual(j([sp.nr, sp.tur, sp.besvart]), [5, 2, 4]);
  assert.equal(M.svart(sp), "ferdig");
  assert.equal(sp.ferdig, true);
  assert.equal(M.svart(sp), null, "et ferdig spill teller ikke mer");
});

test("gjett svaret: gjett først (ingen lås), så svaret; vennlige poeng kan angres til neste kort", () => {
  const sp = M.nyttSpill(M.rydd({ gjeng: "venner", modus: "gjett", poeng: true, lengde: 5 }), 3, 0, null);
  M.legg(sp, 2);
  assert.equal(sp.fase, "gjett");
  assert.deepEqual(j(M.gjettere(sp)), [1, 2]);
  assert.equal(M.svart(sp), null, "kan ikke gå videre før svaret");
  assert.equal(M.veksle(sp, "traff", 1), false, "ingen treff før svaret");
  assert.equal(M.veksle(sp, "gjettet", 0), false, "den som svarer, gjetter ikke");
  assert.equal(M.veksle(sp, "gjettet", 2), true);
  assert.equal(M.veksle(sp, "gjettet", 1), true);
  assert.deepEqual(j(sp.gjettet), [1, 2]);
  assert.equal(M.veksle(sp, "gjettet", 2), true);
  assert.deepEqual(j(sp.gjettet), [1]);
  assert.equal(M.hor(sp), true);
  assert.equal(M.hor(sp), false);
  assert.equal(M.veksle(sp, "gjettet", 2), false, "gjettingen er over");
  M.veksle(sp, "traff", 2);
  M.veksle(sp, "traff", 1);
  M.veksle(sp, "traff", 1); // a wrong tap, undone
  assert.deepEqual(j(sp.traff), [2]);
  assert.equal(M.svart(sp), "neste");
  assert.deepEqual(j([sp.treff, sp.tur, sp.traff, sp.gjettet]), [[0, 0, 1], 1, [], []]);
  M.legg(sp, 3);
  assert.equal(sp.fase, "gjett");
  M.hor(sp);
  M.veksle(sp, "traff", 2);
  M.svart(sp);
  assert.deepEqual(j(M.vinnere(sp)), [2]);
  assert.deepEqual(j(M.rader(sp)), [{ i: 0, poeng: 0 }, { i: 1, poeng: 0 }, { i: 2, poeng: 2 }]);
  // Without points nobody hits.
  const uten = M.nyttSpill(M.rydd({ gjeng: "venner", modus: "gjett" }), 2, 0, null);
  M.legg(uten, 1);
  M.hor(uten);
  assert.equal(M.veksle(uten, "traff", 1), false);
  M.svart(uten);
  assert.deepEqual(j(M.vinnere(uten)), []);
  // Points only exist when guessing.
  assert.equal(M.nyttSpill(M.rydd({ gjeng: "venner", modus: "snakk", poeng: true }), 2, 0, null).poeng, false);
});

// ---------- Favourites ----------

test("favoritter: kopier av kortene, av og på med samme trykk, ryddes ved lasting", () => {
  const k = { n: 2, ty: "minne", t: "Hva husker du?", f: "Hvem var med?", v: "Hva husket du?", e: "🧸" };
  let r = M.veksleFav([], "barn46", k);
  assert.equal(r.pa, true);
  assert.deepEqual(j(r.liste), [{ s: "barn46", ty: "minne", n: 2, t: "Hva husker du?", v: "Hva husket du?", f: "Hvem var med?", e: "🧸" }]);
  const samme = M.veksleFav(r.liste, "barn79", k);
  assert.equal(samme.liste.length, 2, "samme tekst i en annen stokk er et annet kort");
  r = M.veksleFav(r.liste, "barn46", k);
  assert.deepEqual(j([r.pa, r.liste]), [false, []]);
  const rotete = [null, { t: "" , ty: "minne" }, { t: "x?", ty: "ukjent" }, { s: 4, t: "Hva?", ty: "drom", n: 9 }, { s: "", t: "Hva?", ty: "drom" }, "tekst"];
  assert.deepEqual(j(M.rensFav(rotete)), [{ s: "", ty: "drom", n: 1, t: "Hva?" }]);
  assert.equal(M.rensFav(Array.from({ length: 260 }, (_, i) => ({ s: "venner", ty: "fortell", n: 1, t: `Hva ${i}?` }))).length, 200);
  const fullt = M.rensFav(Array.from({ length: 200 }, (_, i) => ({ s: "venner", ty: "fortell", n: 1, t: `Hva ${i}?` })));
  assert.equal(M.veksleFav(fullt, "venner", { ty: "fortell", n: 1, t: "Ny?" }).fullt, true);
});

test("favorittspill: bare favorittkortene, så mange som finnes, uten gjentakelser", () => {
  const egne = stokk("nb", "voksne").slice(0, 4).map((k) => M.favKopi("voksne", k));
  const { sp, spilt } = spill("nb", { gjeng: "venner", lengde: 10 }, 3, 5, egne, false);
  assert.equal(sp.lengde, 4);
  assert.equal(sp.besvart, 4);
  assert.equal(new Set(spilt.map((x) => x.k.t)).size, 4);
  assert.ok(spilt.every((x) => egne.includes(x.k)));
});
