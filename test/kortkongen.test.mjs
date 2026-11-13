// Kortkongen (Kabal): the rules engine accepts exactly the moves Klondike allows.
// Loads rusj/spill/kortkongen/spill.js in node:vm (without the kit the file hands over its rules).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const kontekst = {};
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/kortkongen/spill.js"), "utf8"), kontekst);
const K = kontekst.KortkongenRegler;
const LOSBARE = JSON.parse(readFileSync(join(ROT, "rusj/spill/kortkongen/data/losbare.json"), "utf8"));

// Values from the vm context have their own Array prototype: compare plain copies.
const ren = (x) => JSON.parse(JSON.stringify(x));

// Card helpers: s = suit (0 spar, 1 hjerter, 2 ruter, 3 kløver), v = 1 (ess) … 13 (konge)
const kort = (s, v) => s * 13 + v - 1;
const SPAR = 0;
const HJERTER = 1;
const RUTER = 2;
const KLOVER = 3;
const tom = () => ({ bunke: [], avfall: [], vifte: 0, grunn: [0, 0, 0, 0], bord: [[], [], [], [], [], [], []], skjult: [0, 0, 0, 0, 0, 0, 0], modus: 1 });
// Puts every card not placed yet in the stock, so the position holds all 52 cards.
function fyll(st) {
  const brukt = new Set([...st.bunke, ...st.avfall, ...st.bord.flat()]);
  st.grunn.forEach((v, s) => {
    for (let n = 0; n < v; n++) brukt.add(s * 13 + n);
  });
  for (let k = 0; k < 52; k++) if (!brukt.has(k)) st.bunke.unshift(k);
  assert.ok(K.gyldig(st), "teststillingen er ugyldig");
  return st;
}

// An independent, plain reading of the Klondike rules, to compare the engine against.
function referanse(st, t) {
  if (t.fra === "s") return st.bunke.length + st.avfall.length > 0;
  let rekke;
  if (t.fra === "a") {
    if (!st.avfall.length) return false;
    rekke = [st.avfall[st.avfall.length - 1]];
  } else if (t.fra === "g") {
    if (!(st.grunn[t.i] > 0)) return false;
    rekke = [t.i * 13 + st.grunn[t.i] - 1];
  } else if (t.fra === "b") {
    const kol = st.bord[t.i];
    if (!(t.p >= st.skjult[t.i] && t.p < kol.length)) return false; // face-up cards only
    rekke = kol.slice(t.p);
  } else return false;
  const farge = (k) => (Math.floor(k / 13) === 1 || Math.floor(k / 13) === 2 ? "rød" : "svart");
  const verdi = (k) => (k % 13) + 1;
  for (let n = 1; n < rekke.length; n++) if (verdi(rekke[n]) !== verdi(rekke[n - 1]) - 1 || farge(rekke[n]) === farge(rekke[n - 1])) return false;
  if (t.til === "g") {
    if (t.fra === "g" || rekke.length !== 1) return false;
    const k = rekke[0];
    return t.j === Math.floor(k / 13) && st.grunn[t.j] === verdi(k) - 1;
  }
  if (t.til === "b") {
    if (t.fra === "b" && t.i === t.j) return false;
    const kol = st.bord[t.j];
    if (!kol.length) return verdi(rekke[0]) === 13;
    const under = kol[kol.length - 1];
    return verdi(rekke[0]) === verdi(under) - 1 && farge(rekke[0]) !== farge(under);
  }
  return false;
}

// Every move one could try in a position (also the illegal ones).
function alleForsok(st) {
  const ut = [{ fra: "s" }];
  const kilder = [{ fra: "a" }, ...[0, 1, 2, 3].map((i) => ({ fra: "g", i }))];
  st.bord.forEach((kol, i) => {
    for (let p = 0; p < kol.length; p++) kilder.push({ fra: "b", i, p });
  });
  for (const k of kilder) {
    for (let j = 0; j < 4; j++) ut.push({ ...k, til: "g", j });
    for (let j = 0; j < 7; j++) ut.push({ ...k, til: "b", j });
  }
  return ut;
}

test("utdelingen: 7 kolonner med 1–7 kort, bare det øverste opp, 24 i bunken, samme frø gir samme kabal", () => {
  for (const fro of [1, 2, 99, 123456, 4294967295]) {
    for (const modus of [1, 3]) {
      const st = K.del(fro, fro & 7, modus);
      assert.ok(K.gyldig(st));
      assert.deepEqual(ren(st.bord.map((k) => k.length)), [1, 2, 3, 4, 5, 6, 7]);
      assert.deepEqual(ren(st.skjult), [0, 1, 2, 3, 4, 5, 6]);
      assert.equal(st.bunke.length, 24);
      assert.equal(st.avfall.length, 0);
      assert.equal(st.modus, modus);
      assert.equal(K.kode(K.del(fro, fro & 7, modus)), K.kode(st), "samme frø skal gi samme kabal");
    }
  }
  assert.notEqual(K.kode(K.del(1, 0, 1)), K.kode(K.del(2, 0, 1)));
});

test("på bordet: synkende og annenhver farge – og bare en konge på en tom plass", () => {
  const st = tom();
  st.bord[0] = [kort(SPAR, 8)];
  st.bord[1] = [kort(HJERTER, 7)];
  st.bord[2] = [kort(KLOVER, 7)];
  st.bord[3] = [kort(RUTER, 9)];
  st.bord[4] = [kort(SPAR, 13)];
  fyll(st);
  const flytt = (i, j) => K.lovlig(st, { fra: "b", i, p: 0, til: "b", j });
  assert.equal(flytt(1, 0), true, "rød 7 på svart 8");
  assert.equal(flytt(2, 0), false, "svart 7 på svart 8");
  assert.equal(flytt(0, 3), true, "svart 8 på rød 9");
  assert.equal(flytt(1, 3), false, "7 på 9 hopper over en verdi");
  assert.equal(flytt(3, 0), false, "9 på 8 går oppover");
  assert.equal(flytt(1, 5), false, "en 7-er kan ikke stå øverst på en tom plass");
  assert.equal(flytt(4, 5), true, "en konge kan stå på en tom plass");
  assert.equal(flytt(0, 0), false, "ikke til samme kolonne");
});

test("flere kort: bare en riktig rekke kan løftes, og bare kort med bildet opp", () => {
  const st = tom();
  st.bord[0] = [kort(RUTER, 2), kort(SPAR, 10), kort(HJERTER, 9), kort(SPAR, 8)];
  st.skjult[0] = 1;
  st.bord[1] = [kort(KLOVER, 11)];
  st.bord[2] = [kort(HJERTER, 13), kort(KLOVER, 3)];
  st.skjult[2] = 1;
  fyll(st);
  assert.equal(K.lovlig(st, { fra: "b", i: 0, p: 1, til: "b", j: 1 }), false, "10 på knekt må ha motsatt farge (begge svarte)");
  st.bord[1] = [kort(HJERTER, 11)];
  fyll(Object.assign(st, { bunke: [] }));
  assert.equal(K.lovlig(st, { fra: "b", i: 0, p: 1, til: "b", j: 1 }), true, "hele rekka 10-9-8 på rød knekt");
  assert.equal(K.lovlig(st, { fra: "b", i: 0, p: 0, til: "b", j: 1 }), false, "et kort med baksiden opp kan ikke flyttes");
  assert.equal(K.lovlig(st, { fra: "b", i: 2, p: 0, til: "b", j: 5 }), false, "den skjulte kongen kan ikke løftes");
  // A broken run (not possible in play, but the engine must still refuse it)
  const odelagt = { ...st, bord: st.bord.map((k) => k.slice()), skjult: st.skjult.slice() };
  odelagt.bord[0] = [kort(RUTER, 2), kort(SPAR, 10), kort(SPAR, 9)];
  assert.equal(K.loft(odelagt, { fra: "b", i: 0, p: 1 }), null, "en rekke med samme farge kan ikke løftes");
});

test("hjem: ess først, så samme sort oppover – ett kort om gangen", () => {
  const st = tom();
  st.avfall = [kort(HJERTER, 2)];
  st.bord[0] = [kort(HJERTER, 1)];
  st.bord[1] = [kort(SPAR, 3), kort(RUTER, 2)];
  st.skjult[1] = 1;
  fyll(st);
  assert.equal(K.lovlig(st, { fra: "a", til: "g", j: HJERTER }), false, "2-er før esset");
  assert.equal(K.lovlig(st, { fra: "b", i: 0, p: 0, til: "g", j: SPAR }), false, "hjerter ess i sparbunken");
  assert.equal(K.lovlig(st, { fra: "b", i: 0, p: 0, til: "g", j: HJERTER }), true);
  K.utfor(st, { fra: "b", i: 0, p: 0, til: "g", j: HJERTER });
  assert.equal(st.grunn[HJERTER], 1);
  assert.equal(K.lovlig(st, { fra: "a", til: "g", j: HJERTER }), true, "hjerter 2 på hjerter ess");
  assert.equal(K.lovlig(st, { fra: "b", i: 1, p: 1, til: "g", j: RUTER }), false, "ruter 2 uten ruter ess");
  // Two cards at once never go home
  const to = tom();
  to.grunn = [2, 0, 0, 0];
  to.bord[0] = [kort(SPAR, 3), kort(HJERTER, 2)];
  fyll(to);
  assert.equal(K.lovlig(to, { fra: "b", i: 0, p: 0, til: "g", j: SPAR }), false);
  // From the foundation back to the table is allowed, between foundations is not
  const tilbake = tom();
  tilbake.grunn = [5, 0, 0, 0];
  tilbake.bord[0] = [kort(HJERTER, 6)];
  fyll(tilbake);
  assert.equal(K.lovlig(tilbake, { fra: "g", i: SPAR, til: "b", j: 0 }), true, "spar 5 fra hjem til hjerter 6");
  assert.equal(K.lovlig(tilbake, { fra: "g", i: SPAR, til: "g", j: SPAR }), false);
});

test("bunken: ett eller tre kort, og når den er tom, legges kortene tilbake i samme rekkefølge", () => {
  for (const modus of [1, 3]) {
    const st = K.del(42, 0, modus);
    const forste = st.bunke.slice();
    let n = 0;
    while (st.bunke.length) {
      const for0 = st.avfall.length;
      K.utfor(st, { fra: "s" });
      assert.equal(st.avfall.length - for0, Math.min(modus, forste.length - for0));
      n++;
    }
    assert.equal(n, Math.ceil(24 / modus));
    assert.equal(K.lovlig(st, { fra: "s" }), true, "en tom bunk med kort ved siden av kan snus");
    K.utfor(st, { fra: "s" });
    assert.deepEqual(ren(st.bunke), ren(forste), "kortene kom tilbake i en annen rekkefølge");
    assert.equal(st.avfall.length, 0);
  }
  const ingenting = tom();
  ingenting.grunn = [13, 13, 13, 13];
  assert.equal(K.lovlig(ingenting, { fra: "s" }), false);
  // Only the top card of the waste can be played
  const st = tom();
  st.avfall = [kort(SPAR, 1), kort(HJERTER, 9)];
  fyll(st);
  assert.equal(K.lovlig(st, { fra: "a", til: "g", j: SPAR }), false, "esset under hjerter 9 kan ikke spilles");
});

test("et skjult kort snus når det blir liggende øverst", () => {
  const st = tom();
  st.bord[0] = [kort(RUTER, 4), kort(SPAR, 9)];
  st.skjult[0] = 1;
  st.bord[1] = [kort(HJERTER, 10)];
  fyll(st);
  const r = K.utfor(st, { fra: "b", i: 0, p: 1, til: "b", j: 1 });
  assert.equal(r.snudd, true);
  assert.equal(st.skjult[0], 0);
  assert.ok(K.gyldig(st));
});

test("motoren sier ja og nei nøyaktig som reglene i tusenvis av tilfeldige stillinger", () => {
  let lovlige = 0;
  let ulovlige = 0;
  for (let spill = 0; spill < 60; spill++) {
    const rng = K.tilfeldig(spill + 7);
    const st = K.del(spill * 31 + 5, spill & 7, spill % 2 ? 3 : 1);
    for (let steg = 0; steg < 120; steg++) {
      const forsok = alleForsok(st);
      for (const t of forsok) {
        const svar = K.lovlig(st, t);
        assert.equal(svar, referanse(st, t), `uenig om ${JSON.stringify(t)} i ${K.kode(st)}`);
        if (svar) lovlige++;
        else ulovlige++;
      }
      const lov = forsok.filter((t) => K.lovlig(st, t));
      if (!lov.length) break;
      const for0 = K.kode(st);
      K.utfor(st, lov[Math.floor(rng() * lov.length)]);
      assert.ok(K.gyldig(st), "et lovlig trekk ga en ødelagt stilling");
      assert.notEqual(K.kode(st), for0);
      assert.equal(K.kode(K.fraKode(K.kode(st))), K.kode(st), "lagring og lesing ga en annen stilling");
    }
  }
  assert.ok(lovlige > 3000 && ulovlige > 100000, `for få tilfeller: ${lovlige} lovlige, ${ulovlige} ulovlige`);
});

test("angre: hvert trekk kan tas tilbake til nøyaktig samme stilling", () => {
  const rng = K.tilfeldig(2024);
  const st = K.del(777, 3, 3);
  const historikk = [];
  for (let n = 0; n < 300; n++) {
    const lov = alleForsok(st).filter((t) => K.lovlig(st, t));
    if (!lov.length) break;
    historikk.push(K.kode(st));
    K.utfor(st, lov[Math.floor(rng() * lov.length)]);
  }
  // Undo is a stored position: reading them back in reverse order gives every earlier position.
  for (let n = historikk.length - 1; n >= 0; n--) {
    const tilbake = K.fraKode(historikk[n]);
    assert.ok(tilbake && K.gyldig(tilbake));
    assert.equal(K.kode(tilbake), historikk[n]);
  }
  assert.equal(historikk[0], K.kode(K.del(777, 3, 3)));
});

test("ødelagte eller juksede lagringer avvises", () => {
  const god = K.kode(K.del(5, 0, 1));
  assert.ok(K.fraKode(god));
  assert.equal(K.fraKode("tull"), null);
  assert.equal(K.fraKode(god.replace(/^(.)/, "$1$1")), null, "samme kort to ganger");
  assert.equal(K.fraKode(god.slice(1)), null, "et kort mangler");
  const juks = tom();
  juks.bord[0] = [kort(SPAR, 9), kort(KLOVER, 8)]; // black on black, both face up
  for (let k = 0; k < 52; k++) if (!juks.bord[0].includes(k)) juks.bunke.push(k);
  assert.equal(K.gyldig(juks), false, "svart på svart med bildet opp");
  assert.equal(K.fraKode(K.kode(juks)), null);
  const forMange = tom();
  forMange.grunn = [14, 0, 0, 0];
  assert.equal(K.gyldig(forMange), false, "en hjemmebunke kan ikke ha mer enn 13 kort");
});

test("trykk: kortet går hjem hvis det kan, ellers dit det bygger – aldri en ensom konge til tom plass", () => {
  const st = tom();
  st.bord[0] = [kort(HJERTER, 1)];
  st.bord[1] = [kort(SPAR, 13)];
  st.bord[2] = [kort(RUTER, 9), kort(KLOVER, 8)];
  st.skjult[2] = 1;
  st.bord[3] = [kort(HJERTER, 9)];
  fyll(st);
  assert.deepEqual(ren(K.besteMal(st, { fra: "b", i: 0, p: 0 })), { fra: "b", i: 0, p: 0, til: "g", j: HJERTER });
  assert.equal(K.besteMal(st, { fra: "b", i: 1, p: 0 }), null, "kongen ligger alt nederst");
  const t = K.besteMal(st, { fra: "b", i: 2, p: 1 });
  assert.equal(t.til, "b");
  assert.equal(t.j, 3, "kløver 8 på hjerter 9");
});

test("de lagrede løsbare kabalene kan faktisk løses (stikkprøve, spilt helt ut etter reglene)", () => {
  assert.ok(LOSBARE.tre.length >= 1000 && LOSBARE.en.length >= 100, "for få løsbare kabaler");
  const prove = [...LOSBARE.tre.slice(0, 4).map((f) => [f, 3]), ...LOSBARE.en.slice(0, 3).map((f) => [f, 1])];
  for (const [fro, modus] of prove) {
    const variant = fro % 8; // any colour-keeping suit swap keeps a deal solvable
    const st = K.del(fro, variant, modus);
    const r = K.los(st, 400000);
    assert.ok(r.trekk, `kabal ${fro} (${modus} kort) ble ikke løst`);
    // Play the solution through the real rules
    for (const m of r.trekk) {
      if (m.t === "tg" || m.t === "tb") {
        const talong = st.avfall.concat(st.bunke.slice().reverse());
        const onsket = talong[m.q];
        let vakt = 0;
        while (st.avfall[st.avfall.length - 1] !== onsket) {
          assert.ok(K.lovlig(st, { fra: "s" }));
          K.utfor(st, { fra: "s" });
          assert.ok(++vakt < 80, "kortet kom aldri fram fra bunken");
        }
        const t = m.t === "tg" ? { fra: "a", til: "g", j: Math.floor(onsket / 13) } : { fra: "a", til: "b", j: m.j };
        assert.ok(K.lovlig(st, t), `ulovlig trekk i løsningen: ${JSON.stringify(t)}`);
        K.utfor(st, t);
      } else {
        const t = K.forsteSteg(st, m);
        assert.ok(K.lovlig(st, t), `ulovlig trekk i løsningen: ${JSON.stringify(t)}`);
        K.utfor(st, t);
      }
    }
    // Everything face up and the talon empty: the rest goes home card by card.
    let vakt = 0;
    while (!K.vunnet(st)) {
      const t = st.bord
        .map((kol, i) => (kol.length ? { fra: "b", i, p: kol.length - 1, til: "g", j: Math.floor(kol[kol.length - 1] / 13) } : null))
        .find((x) => x && K.lovlig(st, x));
      assert.ok(t && ++vakt < 60, "kabalen ble ikke ferdig");
      K.utfor(st, t);
    }
  }
});

// Plays solver moves through the real rules (drawing from the stock as needed); with `antall`, only
// the first so many. Without it: to the end, and the rest goes home card by card.
function spillLosning(st, trekk, antall) {
  for (const m of trekk.slice(0, antall == null ? trekk.length : antall)) {
    if (m.t === "tg" || m.t === "tb") {
      const onsket = st.avfall.concat(st.bunke.slice().reverse())[m.q];
      let vakt = 0;
      while (st.avfall[st.avfall.length - 1] !== onsket) {
        assert.ok(K.lovlig(st, { fra: "s" }));
        K.utfor(st, { fra: "s" });
        assert.ok(++vakt < 80, "kortet kom aldri fram fra bunken");
      }
      const t = m.t === "tg" ? { fra: "a", til: "g", j: Math.floor(onsket / 13) } : { fra: "a", til: "b", j: m.j };
      assert.ok(K.lovlig(st, t), `ulovlig trekk i løsningen: ${JSON.stringify(t)}`);
      K.utfor(st, t);
    } else {
      const t = K.forsteSteg(st, m);
      assert.ok(K.lovlig(st, t), `ulovlig trekk i løsningen: ${JSON.stringify(t)}`);
      K.utfor(st, t);
    }
  }
  if (antall != null) return st;
  let vakt = 0;
  while (!K.vunnet(st)) {
    const t = st.bord
      .map((kol, i) => (kol.length ? { fra: "b", i, p: kol.length - 1, til: "g", j: Math.floor(kol[kol.length - 1] / 13) } : null))
      .find((x) => x && K.lovlig(st, x));
    assert.ok(t && ++vakt < 60, "kabalen ble ikke ferdig");
    K.utfor(st, t);
  }
  return st;
}

// Nothing fits anywhere: only black cards on top (K♠ J♠ 9♠ 7♠ 5♠ 3♠ K♣), everything else face down.
function laastStilling() {
  const st = tom();
  const topper = [kort(SPAR, 13), kort(SPAR, 11), kort(SPAR, 9), kort(SPAR, 7), kort(SPAR, 5), kort(SPAR, 3), kort(KLOVER, 13)];
  const resten = Array.from({ length: 52 }, (_, k) => k).filter((k) => !topper.includes(k));
  topper.forEach((k, i) => {
    const skjulte = resten.splice(0, i === 6 ? resten.length : 6);
    st.bord[i] = [...skjulte, k];
    st.skjult[i] = skjulte.length;
  });
  assert.ok(K.gyldig(st));
  return st;
}

test("løseren i små steg (så brettet aldri fryser) gir samme svar som i ett strekk", () => {
  for (const [fro, modus] of [[LOSBARE.tre[0], 3], [LOSBARE.tre[1], 1], [LOSBARE.en[0], 1]]) {
    const st = K.del(fro, 2, modus);
    const hel = K.los(st, 60000);
    const l = K.loser(st, 60000);
    let runder = 0;
    while (!l.kjor(250)) assert.ok(++runder < 2000, "søket ble aldri ferdig");
    const r = l.resultat();
    assert.equal(r.noder, hel.noder);
    assert.deepEqual(ren(r.trekk), ren(hel.trekk));
    assert.equal(l.kjor(1), true, "et ferdig søk er ferdig");
  }
  // A limit that is reached is no answer – and never «proven lost».
  const kort = K.los(K.del(LOSBARE.tre[0], 0, 3), 5);
  assert.equal(kort.trekk, null);
  assert.equal(kort.uttomt, false);
});

test("det fulle søket: løsningen kan spilles etter reglene, og bare et tomt søk er et bevis på at kabalen er låst", () => {
  for (const modus of [1, 3]) {
    // A good way into a proven deal, then every line that could matter from there.
    const start = K.del(LOSBARE.tre[3], 5, modus);
    const vei = K.los(start, 400000);
    assert.ok(vei.trekk);
    const midt = spillLosning(start, vei.trekk, Math.floor(vei.trekk.length * 0.6));
    const r = K.los(midt, 150000, { full: true });
    assert.ok(r.trekk, `det fulle søket fant ingen vei (${modus} kort)`);
    assert.equal(r.uttomt, false);
    assert.ok(K.vunnet(spillLosning(midt, r.trekk)));
  }
  const laast = laastStilling();
  for (const o of [undefined, { full: true }]) {
    const r = K.los(laast, 1000, o);
    assert.equal(r.trekk, null);
    assert.equal(r.uttomt, true, "ingen trekk igjen: søket tømmes");
  }
  assert.equal(K.fast(laast), true);
});

test("en løsning funnet med tre kort gjelder også med ett kort (brukes når ett-kort-søket går seg bort)", () => {
  const ett = K.del(LOSBARE.tre[4], 3, 1);
  const somTre = K.los(Object.assign(K.kopi(ett), { modus: 3 }), 400000);
  assert.ok(somTre.trekk);
  assert.ok(K.vunnet(spillLosning(ett, somTre.trekk)), "tre-korts-løsningen kunne ikke spilles med ett kort");
});

test("dagens kabal: samme løsbare kabal for alle på en dato – fastlåst, og uten gjentakelser", () => {
  // FROZEN: these must never change (players share their results for the day).
  const fasit = { "2026-11-11": [974, 0], "2026-11-12": [2355, 1], "2026-12-24": [742, 3], "2027-01-01": [2267, 3] };
  for (const [dato, [fro, variant]] of Object.entries(fasit)) {
    assert.deepEqual(ren(K.dagens(dato, LOSBARE.tre)), { fro, variant }, `dagens kabal ${dato} er endret`);
    assert.ok(K.los(K.del(fro, variant, 3), 400000).trekk, `dagens kabal ${dato} kan ikke løses med tre kort`);
  }
  const sett = new Set();
  for (let i = 0; i < 1742 * 2; i++) {
    const dato = new Date(Date.UTC(2026, 10, 11) + i * 86400000).toISOString().slice(0, 10);
    const d = K.dagens(dato, LOSBARE.tre);
    assert.ok(LOSBARE.tre.indexOf(d.fro) >= 0 && LOSBARE.tre.indexOf(d.fro) < 1742 && d.variant >= 0 && d.variant < 8);
    sett.add(d.fro + "." + d.variant);
  }
  assert.equal(sett.size, 1742 * 2, "en dagens kabal kom igjen innen ni og et halvt år");
  // A longer list later must not move the dailies.
  assert.deepEqual(ren(K.dagens("2026-11-11", LOSBARE.tre.concat([999991, 999992]))), ren(K.dagens("2026-11-11", LOSBARE.tre)));
});

test("flere plasser: alle stedene et kort kan ligge – og hjem er ikke et valg når ingenting kan trenge kortet", () => {
  const st = tom();
  st.avfall = [kort(HJERTER, 7)];
  st.vifte = 1;
  st.bord[0] = [kort(SPAR, 8)];
  st.bord[1] = [kort(KLOVER, 8)];
  st.bord[2] = [kort(RUTER, 2), kort(SPAR, 13)];
  st.skjult[2] = 1;
  st.grunn = [0, 6, 0, 0];
  st.bord[3] = [kort(HJERTER, 8)];
  fyllUtenGrunn(st);
  const mal = ren(K.alleMal(st, { fra: "a" }));
  assert.deepEqual(mal.map((m) => m.til + m.j), ["g" + HJERTER, "b0", "b1"], "hjem først, så kolonnene der kortet bygger");
  assert.equal(K.tryggHjem(st, kort(HJERTER, 7)), false, "en svart 6-er kan fortsatt trenge hjerter 7");
  assert.equal(K.tryggHjem(st, kort(SPAR, 2)), true);
  // A king on face-down cards: one empty column is enough as a choice (they are all alike).
  assert.deepEqual(ren(K.alleMal(st, { fra: "b", i: 2, p: 1 })).map((m) => m.til + m.j), ["b4"]);
  assert.deepEqual(ren(K.alleMal(st, { fra: "b", i: 0, p: 0 })), [], "spar 8 har ingen steder å gå");
});

// Like fyll(), for a position that already has cards on the foundations.
function fyllUtenGrunn(st) {
  const brukt = new Set([...st.bunke, ...st.avfall, ...st.bord.flat()]);
  st.grunn.forEach((v, s) => {
    for (let n = 0; n < v; n++) brukt.add(s * 13 + n);
  });
  for (let k = 0; k < 52; k++) if (!brukt.has(k)) st.bunke.unshift(k);
  assert.ok(K.gyldig(st), "teststillingen er ugyldig");
  return st;
}

test("Klondike er uendret etter de nye kabalene: dagens kabal, utdelingene og listen over løsbare kabaler gir samme fingeravtrykk som før", () => {
  // Taken with the code from before Edderkopp, FreeCell, Pyramide, Tre topper and Golf came (commit
  // 0e58b10): the daily deals of 3 484 days from 11 November 2026 in both draw modes, 3 000 free deals
  // as saved codes, and the file of proven deals.
  const dagens = createHash("sha256");
  for (let i = 0; i < 1742 * 2; i++) {
    const dato = new Date(Date.UTC(2026, 10, 11) + i * 86400000).toISOString().slice(0, 10);
    const d = K.dagens(dato, LOSBARE.tre);
    dagens.update(dato + ":" + K.kode(K.del(d.fro, d.variant, 1)) + ":" + K.kode(K.del(d.fro, d.variant, 3)) + "\n");
  }
  assert.equal(dagens.digest("hex"), "70d7e236f587c7afbd68999fea9175af49c7b65ac3af0ab80c5adb7ffa75f48c", "dagens kabal er endret");
  const del = createHash("sha256");
  for (let f = 0; f < 3000; f++) del.update(K.kode(K.del(f * 7919 + 1, f & 7, f % 2 ? 3 : 1)) + "\n");
  assert.equal(del.digest("hex"), "f4ab3fb702eb8ce434dc4619c4e0cac05125942bbf4837c64bee66851e012c69", "utdelingen eller lagringskoden er endret");
  const liste = createHash("sha256");
  liste.update(readFileSync(join(ROT, "rusj/spill/kortkongen/data/losbare.json")));
  assert.equal(liste.digest("hex"), "198ed076d565dc956bc47d3f05546ca72a130bde21488ba62f1313277cdd6ac4", "listen over løsbare kabaler er endret");
});
