// Pakketyven (Pakkeleken): the rules as pure functions in rusj/spill/pakketyven/spill.js, loaded in
// node:vm without the kit (window.RusjPakketyven). A new game and its limits; part 1 (only a six
// takes a parcel, the last one leads to part 2); part 2 (a six chooses among those who have
// parcels, «Stjel ikke», nobody to steal from); «Enere gir bort»; the hidden clock (its length is
// fair and inside the setting, it stands still while paused, a saved clock is never given more
// time); «Rett opp»; the order on «Kåringen»; saved games that cannot be drawn; and whole games
// with a seeded die where no parcel is ever lost or made.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const KILDE = readFileSync(join(ROT, "rusj/spill/pakketyven/spill.js"), "utf8");
const window = {};
vm.runInNewContext(KILDE, { window, console });
const P = window.RusjPakketyven;
const j = (x) => JSON.parse(JSON.stringify(x));
const sum = (l) => l.reduce((a, b) => a + b, 0);
const rng = (fro) => {
  let a = fro >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

test("a new game: 4–20 players, two parcels each unless told otherwise, everything at zero", () => {
  const sp = P.nytt({ antall: 6 });
  assert.equal(sp.antall, 6);
  assert.equal(sp.haug, 12);
  assert.equal(sp.pakker, 12);
  assert.deepEqual(j(sp.har), [0, 0, 0, 0, 0, 0]);
  assert.deepEqual([sp.fase, sp.status, sp.tur, sp.kast, sp.klokke, sp.ferdig, sp.enere, sp.lengde, sp.tema], [1, "kast", 0, 0, null, false, false, "vanlig", "jul"]);
  assert.equal(P.nytt({ antall: 2 }).antall, 4, "never fewer than four");
  assert.equal(P.nytt({ antall: 99 }).antall, 20, "never more than twenty");
  assert.equal(P.nytt({ antall: 20 }).haug, 40);
  assert.equal(P.nytt({ antall: 5, pakker: 7 }).haug, 7);
  assert.equal(P.nytt({ antall: 5, pakker: 1 }).haug, 2);
  assert.equal(P.nytt({ antall: 5, pakker: 500 }).haug, 99);
  assert.equal(P.nytt({ antall: 5, pakker: "tull" }).haug, 10);
  assert.deepEqual([P.nytt({ lengde: "lang", tema: "fest", enere: 1 })].map((s) => [s.lengde, s.tema, s.enere])[0], ["lang", "fest", true]);
  assert.equal(P.nytt({ lengde: "evig" }).lengde, "vanlig");
  assert.ok(P.gyldig(sp));
});

test("part 1: only a six takes a parcel; the turn goes round the table", () => {
  const sp = P.nytt({ antall: 4, pakker: 3 });
  for (const v of [1, 2, 3, 4, 5]) {
    const tur = sp.tur;
    const h = P.kast(sp, v);
    assert.deepEqual(j(h), { i: tur, v, hva: "ingen", siste: false });
    assert.equal(sp.tur, (tur + 1) % 4);
  }
  assert.equal(sp.haug, 3);
  assert.equal(sp.tur, 1);
  assert.deepEqual(j(P.kast(sp, 6)), { i: 1, v: 6, hva: "tok", siste: false });
  assert.deepEqual(j(sp.har), [0, 1, 0, 0]);
  assert.deepEqual([sp.haug, sp.tur, sp.seksere[1], sp.kast, sp.terning, sp.status], [2, 2, 1, 6, 6, "kast"]);
  assert.equal(P.kast(sp, 0), null);
  assert.equal(P.kast(sp, 7), null);
  assert.equal(sp.kast, 6, "an impossible throw changes nothing");
  assert.equal(P.velg(sp, 0), null, "nothing to choose in part 1");
});

test("the last parcel: no more throws until part 2 is started, and the clock is set then", () => {
  const sp = P.nytt({ antall: 4, pakker: 2 });
  P.kast(sp, 6);
  const h = P.kast(sp, 6);
  assert.equal(h.siste, true);
  assert.deepEqual([sp.haug, sp.status, sp.fase, sp.tur], [0, "mellom", 1, 2]);
  assert.equal(P.kast(sp, 6), null, "nobody throws while the pile is empty and part 2 has not begun");
  assert.equal(sp.klokke, null);
  assert.equal(P.startDel2(sp, 200), true);
  assert.deepEqual([sp.fase, sp.status, sp.tur, sp.sist], [2, "kast", 2, null]);
  assert.deepEqual(j(sp.klokke), { igjen: 200000, slutt: null });
  assert.equal(P.startDel2(sp, 200), false, "part 2 starts once");
  // The pile emptied by hand («Rett opp») in the middle of part 1
  const b = P.nytt({ antall: 4, pakker: 5 });
  for (let k = 0; k < 5; k++) P.rett(b, "haug", -1);
  assert.equal(b.haug, 0);
  assert.equal(P.rett(b, "haug", -1), false);
  assert.equal(P.kast(b, 3), null);
  assert.equal(b.status, "mellom");
  assert.equal(b.kast, 0);
});

test("part 2: a six steals from someone who has a parcel – never from oneself, never from the empty-handed", () => {
  const sp = P.nytt({ antall: 5, pakker: 6 });
  sp.har = [2, 0, 3, 0, 1];
  sp.haug = 0;
  sp.status = "mellom";
  P.startDel2(sp, 100);
  sp.tur = 1;
  assert.equal(P.kast(sp, 5).hva, "ingen");
  assert.equal(sp.tur, 2);
  const h = P.kast(sp, 6);
  assert.deepEqual(j(h), { i: 2, v: 6, hva: "stjel", siste: false });
  assert.deepEqual([sp.status, sp.tur], ["velg", 2], "the turn waits for the choice");
  assert.deepEqual(j(P.kandidater(sp)), [0, 4]);
  assert.equal(P.kast(sp, 6), null, "no throw while a choice is waiting");
  for (const feil of [2, 1, 3, 9, 1.5, NaN]) assert.equal(P.velg(sp, feil), null, `stealing from ${feil}`);
  assert.deepEqual(j(sp.har), [2, 0, 3, 0, 1]);
  assert.deepEqual(j(P.velg(sp, 4)), { i: 2, v: 6, hva: "stjal", mot: 4 });
  assert.deepEqual(j(sp.har), [2, 0, 4, 0, 0]);
  assert.deepEqual([sp.status, sp.tur, sp.velg, sp.tyverier[2]], ["kast", 3, null, 1]);
  // «Stjel ikke»
  P.kast(sp, 6);
  assert.deepEqual(j(P.kandidater(sp)), [0, 2]);
  assert.deepEqual(j(P.velg(sp, -1)), { i: 3, v: 6, hva: "lot", mot: -1 });
  assert.deepEqual(j(sp.har), [2, 0, 4, 0, 0]);
  assert.deepEqual([sp.tur, sp.tyverier[3]], [4, 0]);
  // The one who has everything rolls a six: nobody to steal from
  sp.har = [0, 0, 6, 0, 0];
  sp.tur = 2;
  assert.equal(P.kast(sp, 6).hva, "alene");
  assert.deepEqual([sp.status, sp.tur], ["kast", 3]);
  assert.equal(sum(sp.har), 6);
});

test("«Enere gir bort»: a one gives a parcel away (it cannot be skipped); off, a one is nothing", () => {
  const av = P.nytt({ antall: 4, pakker: 4 });
  av.har[0] = 2;
  assert.equal(P.kast(av, 1).hva, "ingen");
  const sp = P.nytt({ antall: 4, pakker: 4, enere: true });
  assert.equal(P.kast(sp, 1).hva, "tomhendt", "nothing to give");
  assert.equal(sp.tur, 1);
  sp.har[1] = 1;
  assert.equal(P.kast(sp, 1).hva, "gi");
  assert.deepEqual(j(P.kandidater(sp)), [0, 2, 3], "anyone else, with or without parcels");
  assert.equal(P.velg(sp, -1), null, "a one must be given");
  assert.equal(P.velg(sp, 1), null);
  assert.deepEqual(j(P.velg(sp, 3)), { i: 1, v: 1, hva: "ga", mot: 3 });
  assert.deepEqual(j(sp.har), [0, 0, 0, 1]);
  assert.deepEqual([sp.tur, sp.status, sp.haug, sp.tyverier[1]], [2, "kast", 4, 0]);
});

test("the hidden clock: its length is a whole number of seconds inside the setting, every one as likely", () => {
  for (const [lengde, [a, b]] of Object.entries(P.LENGDER)) {
    assert.equal(P.varighet(lengde, () => 0), a);
    assert.equal(P.varighet(lengde, () => 0.999999999), b);
    const r = rng(2026);
    const tall = new Map();
    for (let k = 0; k < 20000; k++) {
      const s = P.varighet(lengde, r);
      assert.ok(Number.isInteger(s) && s >= a && s <= b, `${lengde}: ${s}`);
      tall.set(s, (tall.get(s) || 0) + 1);
    }
    assert.equal(tall.size, b - a + 1, `${lengde}: every second from ${a} to ${b} turns up`);
    const snitt = [...tall].reduce((x, [s, n]) => x + s * n, 0) / 20000;
    assert.ok(Math.abs(snitt - (a + b) / 2) < (b - a) * 0.02, `${lengde}: the average is ${snitt}`);
  }
  assert.deepEqual(j(P.LENGDER.vanlig), [180, 420], "3–7 minutes is the usual clock");
  assert.equal(P.varighet("tull", () => 0), 180);
});

test("the clock runs only between start and pause: a pause loses nothing and gives nothing", () => {
  const k = { igjen: 60000, slutt: null };
  assert.equal(P.klokkeIgjen(k, 1000), 60000);
  assert.equal(P.klokkeUte(k, 999999999), false, "a clock that stands still never runs out");
  P.klokkeStart(k, 1000);
  assert.deepEqual(k, { igjen: 60000, slutt: 61000 });
  P.klokkeStart(k, 5000);
  assert.equal(k.slutt, 61000, "starting a running clock does not move its end");
  assert.equal(P.klokkeIgjen(k, 21000), 40000);
  P.klokkePause(k, 21000);
  assert.deepEqual(k, { igjen: 40000, slutt: null });
  P.klokkePause(k, 50000);
  assert.deepEqual(k, { igjen: 40000, slutt: null }, "pausing a paused clock changes nothing");
  P.klokkeStart(k, 900000);
  assert.equal(P.klokkeIgjen(k, 900000), 40000, "the time away did not count");
  assert.equal(P.klokkeUte(k, 939999), false);
  assert.equal(P.klokkeUte(k, 940000), true);
  assert.equal(P.klokkeIgjen(k, 990000), 0);
  P.klokkePause(k, 990000);
  assert.deepEqual(k, { igjen: 0, slutt: null });
  assert.equal(P.klokkeUte(k, 0), true);
  assert.equal(P.klokkeUte(null, 0), false, "no clock in part 1");
  assert.equal(P.klokkeIgjen(null, 0), Infinity);
});

test("a saved clock is repaired: never more time than the setting allows, never a broken number", () => {
  assert.equal(P.klokkeGyldig(null, 0, "kort"), null);
  assert.deepEqual(j(P.klokkeGyldig({ igjen: 5000, slutt: null }, 100, "kort")), { igjen: 5000, slutt: null });
  assert.deepEqual(j(P.klokkeGyldig({ igjen: 9e9, slutt: null }, 100, "kort")), { igjen: 240000, slutt: null });
  assert.deepEqual(j(P.klokkeGyldig({ igjen: "x", slutt: "y" }, 100, "kort")), { igjen: 0, slutt: null });
  assert.deepEqual(j(P.klokkeGyldig({ igjen: -5, slutt: null }, 100, "vanlig")), { igjen: 0, slutt: null });
  // The phone's clock was set back while the game clock ran: the end is never further away than the time it had
  assert.deepEqual(j(P.klokkeGyldig({ igjen: 30000, slutt: 9000000 }, 1000, "vanlig")), { igjen: 30000, slutt: 31000 });
  assert.deepEqual(j(P.klokkeGyldig({ igjen: 30000, slutt: 20000 }, 1000, "vanlig")), { igjen: 30000, slutt: 20000 });
});

test("the horn: the game is over, nothing more can be thrown or chosen", () => {
  const sp = P.nytt({ antall: 4, pakker: 2 });
  sp.har = [1, 1, 0, 0];
  sp.haug = 0;
  sp.status = "mellom";
  P.startDel2(sp, 10);
  P.klokkeStart(sp.klokke, 0);
  sp.tur = 2;
  P.kast(sp, 6);
  assert.equal(sp.status, "velg");
  P.horn(sp, true);
  assert.deepEqual([sp.ferdig, sp.komplett, sp.status, sp.velg], [true, true, "kast", null]);
  assert.deepEqual(j(sp.klokke), { igjen: 0, slutt: null });
  assert.equal(P.kast(sp, 6), null);
  assert.equal(P.velg(sp, 0), null);
  assert.equal(P.rett(sp, 0, 1), false);
  assert.deepEqual(j(sp.har), [1, 1, 0, 0]);
  const b = P.nytt({ antall: 4 });
  P.horn(b, false);
  assert.deepEqual([b.ferdig, b.komplett], [true, false], "«Avslutt» ends it without the horn");
});

test("«Rett opp»: the pile in part 1, anyone's parcels always; a choice that can no longer be made is dropped", () => {
  const sp = P.nytt({ antall: 4, pakker: 5 });
  assert.equal(P.rett(sp, "haug", 1), true);
  assert.equal(P.rett(sp, 2, 1), true);
  assert.equal(P.rett(sp, 2, 1), true);
  assert.equal(P.rett(sp, 2, -1), true);
  assert.deepEqual([sp.haug, sp.har[2]], [6, 1]);
  for (const [hvem, d] of [[0, -1], [9, 1], [-1, 1], ["x", 1], [1, 2], [1, 0], ["haug", 5]]) assert.equal(P.rett(sp, hvem, d), false, `${hvem} ${d}`);
  sp.haug = 99;
  assert.equal(P.rett(sp, "haug", 1), false);
  sp.haug = 0;
  sp.status = "mellom";
  assert.equal(P.rett(sp, "haug", 1), false, "not the pile once part 2 is next");
  assert.equal(P.rett(sp, 0, 1), true);
  P.startDel2(sp, 100);
  assert.equal(P.rett(sp, "haug", 1), false, "no pile in part 2");
  // B rolled a six and may steal from A or C; the table says C has none after all, then A neither
  sp.har = [1, 0, 1, 0];
  sp.tur = 1;
  P.kast(sp, 6);
  assert.deepEqual(j(P.kandidater(sp)), [0, 2]);
  assert.equal(P.rett(sp, 2, -1), true);
  assert.deepEqual([sp.status, j(P.kandidater(sp))], ["velg", [0]]);
  assert.equal(P.rett(sp, 0, -1), true);
  assert.deepEqual([sp.status, sp.velg, sp.tur], ["kast", null, 2], "nobody left to steal from: the turn passes on");
});

test("«Kåringen»: most parcels first, those level in the order round the table", () => {
  const sp = P.nytt({ antall: 6 });
  sp.har = [1, 3, 0, 3, 5, 1];
  assert.deepEqual(j(P.rekkefolge(sp)), [4, 1, 3, 0, 5, 2]);
  assert.deepEqual(j(P.flest([0, 2, 5, 5, 1])), [2, 3]);
  assert.deepEqual(j(P.flest([0, 0, 0])), [], "nobody is named for nothing");
});

test("a saved game that cannot be drawn is refused", () => {
  const ok = () => {
    const sp = P.nytt({ antall: 5, pakker: 4 });
    P.kast(sp, 6);
    return j(sp);
  };
  assert.ok(P.gyldig(ok()));
  const feil = [
    (s) => (s.antall = 3),
    (s) => (s.antall = 21),
    (s) => (s.har = "x"),
    (s) => s.har.pop(),
    (s) => (s.har[0] = -1),
    (s) => (s.har[0] = 1.5),
    (s) => (s.tur = 5),
    (s) => (s.terning = 7),
    (s) => (s.fase = 3),
    (s) => (s.status = "tull"),
    (s) => (s.lengde = "evig"),
    (s) => (s.tema = "paske"),
    (s) => (s.haug = -1),
    (s) => (s.status = "velg"),
    (s) => ((s.status = "velg"), (s.velg = { type: "stjel", fra: 1 })), // part 1: fra 1 could only steal from 0 – fine; made wrong below
    (s) => ((s.fase = 2), (s.klokke = null)),
    (s) => ((s.fase = 2), (s.status = "mellom"), (s.klokke = { igjen: 1, slutt: null })),
    (s) => (s.sist = { i: 9, hva: "tok" }),
    (s) => (s.seksere = [0]),
  ];
  for (const [n, f] of feil.entries()) {
    const s = ok();
    f(s);
    if (n === 14) {
      assert.ok(P.gyldig(s), "a choice with someone to point at can be drawn");
      s.har = s.har.map(() => 0);
      s.velg.fra = 0;
    }
    assert.equal(P.gyldig(s), false, `damage ${n}`);
  }
  for (const x of [null, undefined, "x", 5, [], {}]) assert.equal(P.gyldig(x), false);
});

test("whole games with a seeded die: no parcel is lost or made, part 2 begins exactly when the pile is empty", () => {
  for (let fro = 1; fro <= 60; fro++) {
    const r = rng(fro);
    const antall = 4 + Math.floor(r() * 17);
    const sp = P.nytt({ antall, pakker: 2 + Math.floor(r() * 30), enere: fro % 2 === 0, lengde: ["kort", "vanlig", "lang"][fro % 3] });
    const alle = sp.pakker;
    let kast = 0;
    while (sp.status !== "mellom") {
      assert.ok(++kast < 20000);
      const tur = sp.tur;
      const h = P.kast(sp, 1 + Math.floor(r() * 6));
      assert.ok(h);
      if (sp.status === "velg") {
        assert.equal(sp.velg.type, "gi", "nothing is stolen in part 1");
        const k = P.kandidater(sp);
        assert.ok(P.velg(sp, k[Math.floor(r() * k.length)]));
      }
      assert.equal(sp.tur, (tur + 1) % antall);
      assert.equal(sp.haug + sum(sp.har), alle);
      assert.ok(sp.har.every((n) => n >= 0));
    }
    assert.equal(sp.haug, 0);
    assert.equal(sum(sp.har), alle);
    assert.ok(P.startDel2(sp, P.varighet(sp.lengde, r)));
    P.klokkeStart(sp.klokke, 0);
    // Part 2: a throw every three seconds until the horn
    let na = 0;
    let tyverier = 0;
    while (!P.klokkeUte(sp.klokke, na)) {
      const h = P.kast(sp, 1 + Math.floor(r() * 6));
      assert.ok(h);
      if (sp.status === "velg") {
        const k = P.kandidater(sp);
        assert.ok(k.length && !k.includes(sp.velg.fra));
        if (sp.velg.type === "stjel") {
          assert.ok(k.every((x) => sp.har[x] > 0));
          tyverier++;
        }
        assert.ok(P.velg(sp, k[Math.floor(r() * k.length)]));
      }
      assert.equal(sum(sp.har), alle);
      assert.ok(sp.har.every((n) => n >= 0));
      assert.ok(P.gyldig(j(sp)));
      na += 3000;
    }
    P.horn(sp, true);
    assert.equal(sum(sp.har), alle);
    assert.equal(sum(sp.tyverier), tyverier);
    assert.deepEqual(j(P.rekkefolge(sp)).sort((a, b) => a - b), Array.from({ length: antall }, (_, i) => i));
    assert.ok(na >= P.LENGDER[sp.lengde][0] * 1000 && na <= P.LENGDER[sp.lengde][1] * 1000 + 3000);
  }
});

test("the die is fair enough: the game's own formula gives every face, none much more than another", () => {
  const r = rng(112);
  const tall = [0, 0, 0, 0, 0, 0, 0];
  for (let k = 0; k < 60000; k++) tall[1 + Math.floor(r() * 6)]++;
  assert.equal(tall[0], 0);
  for (let v = 1; v <= 6; v++) assert.ok(Math.abs(tall[v] - 10000) < 400, `${v}: ${tall[v]}`);
  assert.match(KILDE, /P\.kast\(sp, 1 \+ Math\.floor\(tilfeldig\(\) \* 6\)\)/, "the game throws with 1 + floor(chance × 6)");
  assert.match(KILDE, /const tilfeldig = \(\) => R\.nyttFro\(\) \/ 4294967296;/, "… and takes its chance from the kit's real randomness");
});

test("nothing of the clock is ever put on the screen: the game's markup has no place for the time", () => {
  // The only things drawn from the clock are «it runs» (a fixed text) and the horn at the end.
  const ui = KILDE.slice(KILDE.indexOf("// ---------- The game on the page ----------"));
  const vis = ui.slice(ui.indexOf("// ---------- Pieces of the screens ----------"), ui.indexOf("// ---------- The hidden clock ----------"));
  assert.doesNotMatch(vis, /klokke\.(igjen|slutt)|klokkeIgjen|formaterTid|R\.ui\.timer|R\.Timer/);
  const skjermer = ui.slice(ui.indexOf("skjermer: {"), ui.indexOf("handlinger: (H = {"));
  assert.doesNotMatch(skjermer, /klokke\.(igjen|slutt)|klokkeIgjen|formaterTid|R\.ui\.timer|R\.Timer/);
});
