// Skattejegeren (treasure hunt): the chain of clues for every edition, age and place – no hiding
// place twice, every place fits the age and the place, «inside and out» goes out only once, no two
// posts in a row in the same room when that can be avoided, every post is reached from the start
// card and the last one is the treasure – and the content behind it (riddles short enough for the
// age, every theme with its words and pictures). Loads rusj/spill/skattejegeren/spill.js without
// the kit (node:vm).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MAPPE = join(ROT, "rusj/spill/skattejegeren");
const kontekst = { window: {}, console };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(MAPPE, "spill.js"), "utf8"), kontekst);
const { Jakt, ALDRE, HVOR, MIN_POSTER, MAKS_POSTER, BILDEVALG } = kontekst.window.Skattejegeren;

const SPRAK = { nb: "data", en: "data.en", da: "data.da" };
const les = (mappe, fil) => JSON.parse(readFileSync(join(MAPPE, mappe, fil), "utf8"));
const DATA = Object.fromEntries(Object.entries(SPRAK).map(([s, m]) => [s, { steder: les(m, "steder.json").steder, temaer: les(m, "temaer.json").temaer }]));
const ROM = ["kjokken", "stue", "gang", "bad", "soverom", "lek", "hage", "terrasse", "inngang"];
// The longest clue for each age band: a short sentence for 4–6, a riddle for the bigger ones.
const MAKS_LENGDE = { 4: 60, 7: 110, 10: 150 };

function rng(fro) {
  return () => {
    fro = (fro + 0x6d2b79f5) | 0;
    let t = Math.imul(fro ^ (fro >>> 15), 1 | fro);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

for (const [sprak, { steder, temaer }] of Object.entries(DATA)) {
  test(`${sprak}: every hiding place is complete, safe in shape and fits its age bands`, () => {
    const ider = new Set();
    for (const s of steder) {
      assert.match(s.id, /^[a-z0-9]+$/, `${sprak}: id ${s.id}`);
      assert.ok(!ider.has(s.id), `${sprak}: ${s.id} twice`);
      ider.add(s.id);
      assert.ok(["inne", "ute"].includes(s.hvor), `${sprak} ${s.id}: hvor`);
      assert.ok(ROM.includes(s.rom), `${sprak} ${s.id}: unknown room ${s.rom}`);
      assert.ok(s.ikon && s.ikon.length <= 8, `${sprak} ${s.id}: ikon`);
      assert.ok(s.sted && s.sted.length <= 60, `${sprak} ${s.id}: sted «${s.sted}»`);
      const baand = Object.keys(s.gater);
      assert.ok(baand.length >= 2 && baand.every((a) => ALDRE.includes(Number(a))), `${sprak} ${s.id}: age bands ${baand}`);
      assert.ok(s.gater["7"] && s.gater["10"], `${sprak} ${s.id}: every place has clues for 7–9 and 10–12`);
      for (const a of baand) {
        const g = s.gater[a];
        assert.ok(g.trim() === g && g.length >= 10, `${sprak} ${s.id} ${a}: «${g}»`);
        assert.ok(g.length <= MAKS_LENGDE[a], `${sprak} ${s.id} ${a}: ${g.length} characters is too long for the age («${g}»)`);
        assert.ok(/[.!?]$/.test(g), `${sprak} ${s.id} ${a}: a clue ends with . ! or ? («${g}»)`);
      }
    }
    // No clue twice for the same age.
    for (const a of ALDRE) {
      const g = steder.map((s) => s.gater[a]).filter(Boolean);
      assert.equal(new Set(g).size, g.length, `${sprak} ${a}: the same clue twice`);
    }
  });

  test(`${sprak}: there are places for the most posts in every setting`, () => {
    for (const a of ALDRE)
      for (const h of HVOR) assert.equal(Jakt.maks(steder, a, h), MAKS_POSTER, `${sprak}: only ${Jakt.maks(steder, a, h)} posts for ${a} år ${h}`);
  });

  test(`${sprak}: every theme has start texts, calls, a treasure and enough code words`, () => {
    assert.deepEqual(
      temaer.map((t) => t.id),
      DATA.nb.temaer.map((t) => t.id),
      `${sprak}: the themes differ from the Norwegian ones`,
    );
    for (const t of temaer) {
      assert.ok(t.navn && t.tekst && t.ikon, `${sprak} ${t.id}: name, text, icon`);
      for (const a of ALDRE) assert.ok(t.start[a] && t.start[a].length <= 130, `${sprak} ${t.id}: start text for ${a} («${t.start[a]}»)`);
      assert.ok(t.innled.length >= 4 && t.innled.every((x) => x && x.length <= 30), `${sprak} ${t.id}: calls`);
      assert.ok(t.skatt.tittel && t.skatt.tekst && t.skatt.kort, `${sprak} ${t.id}: treasure`);
      assert.ok(t.koder.length >= MAKS_POSTER, `${sprak} ${t.id}: ${t.koder.length} code words`);
      assert.equal(new Set(t.koder.map((k) => Jakt.enkel(k.o))).size, t.koder.length, `${sprak} ${t.id}: two code words alike`);
      assert.equal(new Set(t.koder.map((k) => k.i)).size, t.koder.length, `${sprak} ${t.id}: two pictures alike`);
      for (const k of t.koder) {
        assert.match(k.o, /^[A-ZÆØÅ]{2,12}$/, `${sprak} ${t.id}: code word «${k.o}» must be one word in capitals`);
        assert.ok(k.i && k.i.length <= 8, `${sprak} ${t.id}: picture for ${k.o}`);
      }
    }
  });

  test(`${sprak}: routes never repeat a place, fit the age and the place, and change rooms`, () => {
    for (const alder of ALDRE)
      for (const hvor of HVOR)
        for (let antall = MIN_POSTER; antall <= MAKS_POSTER; antall++)
          for (let fro = 1; fro <= 25; fro++) {
            const r = rng(fro * 7919 + antall * 31 + alder);
            const rute = Jakt.rute(steder, { antall, alder, hvor }, r);
            const hvem = `${sprak} ${alder} år ${hvor} ${antall} poster, frø ${fro}`;
            assert.equal(rute.length, antall, `${hvem}: ${rute.length} posts`);
            assert.equal(new Set(rute).size, rute.length, `${hvem}: a place twice`);
            const s = rute.map((id) => steder.find((x) => x.id === id));
            assert.ok(s.every((x) => x && Jakt.passer(x, alder, hvor)), `${hvem}: a place that does not fit`);
            const skifter = s.filter((x, i) => i > 0 && x.hvor !== s[i - 1].hvor).length;
            if (hvor === "begge") {
              assert.ok(s.some((x) => x.hvor === "inne") && s.some((x) => x.hvor === "ute"), `${hvem}: not both inside and out`);
              assert.equal(skifter, 1, `${hvem}: the children go in and out ${skifter} times`);
            } else assert.equal(skifter, 0, `${hvem}: ${hvor} only`);
            // Same room twice in a row only when one room has more than half the places of its group.
            for (const gruppe of ["inne", "ute"]) {
              const g = s.filter((x) => x.hvor === gruppe);
              if (!g.length) continue;
              const flest = Math.max(...g.map((x) => g.filter((y) => y.rom === x.rom).length));
              const par = g.filter((x, i) => i > 0 && x.rom === g[i - 1].rom).length;
              assert.ok(par <= Math.max(0, 2 * flest - g.length - 1), `${hvem}: two posts in a row in the same room (${g.map((x) => x.rom).join(",")})`);
            }
          }
  });
}

test("the same seed gives the same route", () => {
  const { steder } = DATA.nb;
  const a = Jakt.rute(steder, { antall: 8, alder: 7, hvor: "begge" }, rng(42));
  const b = Jakt.rute(steder, { antall: 8, alder: 7, hvor: "begge" }, rng(42));
  assert.deepEqual(a, b);
});

test("a route asks for no more posts than there are places", () => {
  const steder = DATA.nb.steder.slice(0, 5);
  assert.equal(Jakt.rute(steder, { antall: 12, alder: 7, hvor: "inne" }, rng(1)).length, Jakt.maks(steder, 7, "inne"));
});

test("places without a clue for 4–6 are left out for the youngest", () => {
  for (const { steder } of Object.values(DATA)) {
    const utenSma = steder.filter((s) => !s.gater["4"]);
    for (let fro = 1; fro <= 50; fro++) {
      const rute = Jakt.rute(steder, { antall: 12, alder: 4, hvor: "begge" }, rng(fro));
      assert.ok(!rute.some((id) => utenSma.some((s) => s.id === id)));
    }
  }
});

test("ordering avoids the same room twice in a row whenever possible", () => {
  for (let fro = 1; fro <= 300; fro++) {
    const r = rng(fro);
    const n = 3 + Math.floor(r() * 10);
    const liste = Array.from({ length: n }, (_, i) => ({ id: "s" + i, rom: "r" + Math.floor(r() * 4) }));
    const ut = Jakt.ordne(liste);
    assert.equal(ut.length, n);
    const flest = Math.max(...["r0", "r1", "r2", "r3"].map((rom) => liste.filter((s) => s.rom === rom).length));
    const par = ut.filter((s, i) => i > 0 && s.rom === ut[i - 1].rom).length;
    if (flest <= Math.ceil(n / 2)) assert.equal(par, 0, `frø ${fro}: ${ut.map((s) => s.rom).join(",")}`);
    else assert.equal(par, 2 * flest - n - 1, `frø ${fro}: more repeats than needed`);
  }
});

test("every post is reached from the start card, once, and the last card is the treasure", () => {
  for (let n = 1; n <= MAKS_POSTER; n++) {
    const kort = Jakt.kort(n);
    assert.equal(kort.length, n + 1, `${n} posts: start card, a card at every post but the last, and the treasure card`);
    assert.equal(kort.filter((k) => k.type === "start").length, 1);
    assert.equal(kort.filter((k) => k.type === "skatt").length, 1);
    const { besokt, slutt } = Jakt.folg(kort);
    assert.deepEqual(Array.from(besokt), Array.from({ length: n }, (_, i) => i), `${n} posts: visited ${besokt}`);
    assert.equal(slutt, "skatt");
    // Every card lies at a different post, and every post but the first gets exactly one pointer.
    const ved = kort.filter((k) => k.ved != null).map((k) => k.ved);
    assert.equal(new Set(ved).size, ved.length);
    const til = kort.filter((k) => k.til != null).map((k) => k.til);
    assert.equal(new Set(til).size, n);
  }
});

test("different code words per post, and picture choices with the right one among four", () => {
  for (let fro = 1; fro <= 200; fro++) {
    const r = rng(fro);
    const koder = Jakt.koder(12, 1 + (fro % 12), r);
    assert.equal(new Set(koder).size, koder.length);
    assert.ok(koder.every((k) => k >= 0 && k < 12));
    const riktig = fro % 12;
    const valg = Jakt.bildevalg(12, riktig, r);
    assert.equal(valg.length, BILDEVALG);
    assert.equal(new Set(valg).size, BILDEVALG);
    assert.ok(valg.includes(riktig));
  }
});

test("moving a post to a place in use swaps the two, so no place is used twice", () => {
  const poster = [{ s: "a" }, { s: "b" }, { s: "c" }];
  Jakt.bytt(poster, 0, "c");
  assert.deepEqual(poster.map((p) => p.s), ["c", "b", "a"]);
  Jakt.bytt(poster, 1, "d");
  assert.deepEqual(poster.map((p) => p.s), ["c", "d", "a"]);
  const ledige = Jakt.ledige(DATA.nb.steder, [{ s: "kjoleskap" }, { s: "dyne" }], 0, 7, "inne").map((s) => s.id);
  assert.ok(ledige.includes("kjoleskap") && !ledige.includes("dyne"));
});

test("code words are forgiving: case, spaces and æ/ø/å typed as ae/o/a", () => {
  assert.ok(Jakt.riktigKode(" kompass ", "KOMPASS"));
  assert.ok(Jakt.riktigKode("papegoye", "PAPEGØYE"));
  assert.ok(Jakt.riktigKode("Papegøye", "PAPEGØYE"));
  assert.ok(Jakt.riktigKode("laas", "LÅS"));
  assert.ok(Jakt.riktigKode("las", "LÅS"));
  assert.ok(Jakt.riktigKode("NOEGLE", "NØGLE"));
  assert.ok(Jakt.riktigKode("Nøgle", "NØGLE"));
  assert.ok(!Jakt.riktigKode("ngle", "NØGLE"));
  assert.ok(!Jakt.riktigKode("laos", "LÅS"));
  assert.ok(!Jakt.riktigKode("", "SOL"));
  assert.ok(!Jakt.riktigKode("sola", "SOL"));
});
