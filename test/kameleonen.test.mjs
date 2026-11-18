// Kameleonen: the switch plan (gaps within the tempo's bounds, nothing in the last seconds, the
// same plan for the same seed, never the same emotion twice in a row — also across scenes), the
// rotation (everyone acts exactly twice per round, never with themselves, and from five players up
// never two scenes in a row), the clock ticks, scoring and undo — loaded in node:vm without the
// kit. And the content: at least 60 scenes and 30 emotions, the same counts and ids in nb, en, da.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const window = {};
vm.runInNewContext(readFileSync(join(ROT, "rusj/spill/kameleonen/spill.js"), "utf8"), { window, console });
const M = window.RusjKameleonen;
const j = (x) => JSON.parse(JSON.stringify(x));
const data = (mappe) => JSON.parse(readFileSync(join(ROT, "rusj/spill/kameleonen", mappe, "innhold.json"), "utf8"));
const NB = data("data");
const N = NB.folelser.length;

test("byttene ligger innenfor tempoets grenser og aldri helt på slutten", () => {
  for (const tempo of Object.keys(M.TEMPO)) {
    const [min, maks] = M.TEMPO[tempo];
    for (const tid of M.TIDER) {
      for (let fro = 1; fro <= 300; fro++) {
        const p = M.plan(fro * 7919, tid, tempo, N, -1);
        assert.ok(p.bytt.length >= 1, `minst ett bytte (${tempo}, ${tid} s)`);
        let forrige = 0;
        for (const t of p.bytt) {
          assert.ok(t - forrige >= min && t - forrige <= maks, `${tempo}: gap ${t - forrige} utenfor ${min}–${maks}`);
          assert.ok(t <= tid - M.SLUTTFRI, `bytte ved ${t} s er for nær slutten av ${tid} s`);
          forrige = t;
        }
        assert.ok(tid - M.SLUTTFRI - forrige < maks, "ingen lang stillhet før slutten");
        assert.equal(p.f.length, p.bytt.length + 1);
      }
    }
  }
});

test("samme frø gir samme plan; ulike frø gir ulike planer", () => {
  const a = M.plan(12345, 60, "vanlig", N, 3);
  const b = M.plan(12345, 60, "vanlig", N, 3);
  assert.deepEqual(j(a), j(b));
  const ulike = new Set();
  for (let fro = 1; fro <= 40; fro++) ulike.add(JSON.stringify(j(M.plan(fro, 60, "vanlig", N, -1))));
  assert.ok(ulike.size >= 38, "planene skal variere med frøet");
});

test("aldri samme følelse to ganger på rad – heller ikke fra scene til scene", () => {
  for (let fro = 1; fro <= 500; fro++) {
    const forrige = fro % N;
    const p = M.plan(fro, 90, "kaos", N, forrige);
    assert.notEqual(p.f[0], forrige, "første følelse skal ikke være den forrige scenen sluttet på");
    assert.equal(new Set(p.f).size, p.f.length, "ingen følelse to ganger i samme scene");
    p.f.forEach((i) => assert.ok(i >= 0 && i < N));
  }
  // Even with few emotions to pick from: no two in a row.
  for (let fro = 1; fro <= 200; fro++) {
    const p = M.plan(fro, 90, "kaos", 3, 1);
    for (let k = 1; k < p.f.length; k++) assert.notEqual(p.f[k], p.f[k - 1]);
    assert.notEqual(p.f[0], 1);
  }
});

test("indeks og tikk følger planen sekund for sekund", () => {
  const sp = M.nyttSpill({ tid: 60, tempo: "vanlig", runder: 1 }, 4, 99);
  M.startScene(sp, 4242, N);
  const p = sp.plan;
  assert.equal(M.indeks(p, 0), 0);
  assert.equal(M.indeks(p, p.bytt[0] - 1), 0);
  assert.equal(M.indeks(p, p.bytt[0]), 1);
  let bytter = 0;
  for (let sek = 60; sek >= 1; sek--) if (M.tikk(sp, sek)) bytter++;
  assert.equal(bytter, p.bytt.length, "ett bytte per planlagt tidspunkt");
  assert.equal(sp.fi, p.f.length - 1);
  assert.equal(sp.bytter, p.bytt.length);
  assert.equal(M.tikk(sp, 1), false, "samme sekund igjen bytter ikke");
  // Resuming after a reload at the same second shows the same emotion.
  const kopi = j(sp);
  kopi.fi = 0;
  kopi.bytter = 0;
  M.tikk(kopi, 60 - p.bytt[1]);
  assert.equal(kopi.fi, 2, "en omlasting hopper rett til følelsen for sekundet");
});

test("rotasjon: alle spiller nøyaktig to scener per runde, aldri med seg selv", () => {
  for (let antall = 3; antall <= 12; antall++) {
    for (const runder of M.RUNDER) {
      for (let fro = 1; fro <= 30; fro++) {
        const sp = M.nyttSpill({ tid: 45, tempo: "vanlig", runder }, antall, fro);
        assert.equal(sp.turer, antall * runder);
        const teller = Array(antall).fill(0);
        sp.par.forEach(([a, b], k) => {
          assert.notEqual(a, b);
          teller[a]++;
          teller[b]++;
          if (antall >= 5 && k > 0) {
            const [c, d] = sp.par[k - 1];
            assert.ok(![c, d].includes(a) && ![c, d].includes(b), `${antall} spillere: noen spiller to scener på rad (scene ${k})`);
          }
        });
        teller.forEach((n) => assert.equal(n, 2 * runder, `${antall} spillere, ${runder} runder: ujevn fordeling ${teller}`));
        // Two different partners within each round
        for (let r = 0; r < runder; r++) {
          const runde = sp.par.slice(r * antall, (r + 1) * antall);
          for (let i = 0; i < antall; i++) {
            const med = runde.filter((p) => p.includes(i)).map(([a, b]) => (a === i ? b : a));
            assert.equal(med.length, 2);
            assert.notEqual(med[0], med[1], "to ulike partnere");
          }
        }
      }
    }
  }
  assert.deepEqual(j(M.nyttSpill({ runder: 2 }, 6, 77).par), j(M.nyttSpill({ runder: 2 }, 6, 77).par), "samme frø, samme rekkefølge");
});

test("poeng: best gir to, like gode gir ett hver; angre tar dommen tilbake", () => {
  const sp = M.nyttSpill({ tid: 45, tempo: "rolig", runder: 1 }, 3, 5);
  const [a, b] = M.aktorer(sp);
  assert.equal(M.dom(sp, "a"), false, "ingen dom før scenen er kuttet");
  M.startScene(sp, 1, N);
  assert.equal(M.kutt(sp), true);
  assert.equal(sp.fase, "dom");
  assert.equal(M.neste(sp, 1), false, "kan ikke gå videre uten dom");
  M.dom(sp, "a");
  assert.deepEqual(j(M.pluss(sp)), [[a, 2]]);
  assert.equal(M.rader(sp, true).find((r) => r.i === a).pluss, 2);
  M.dom(sp, "begge"); // the audience changes its mind
  assert.deepEqual(j(M.pluss(sp)), [[a, 1], [b, 1]]);
  assert.equal(M.angre(sp), true);
  assert.equal(sp.dom, null);
  assert.deepEqual(j(M.pluss(sp)), []);
  assert.equal(M.angre(sp), false, "ingenting mer å angre");
  assert.equal(M.dom(sp, "tull"), false);
  M.dom(sp, "b");
  const sist = M.folelse(sp);
  assert.equal(M.neste(sp, 7), false);
  assert.equal(sp.poeng[b], 2);
  assert.equal(sp.poeng.reduce((s, p) => s + p, 0), 2);
  assert.equal(sp.forrige, sist, "neste scene husker hvilken følelse den forrige sluttet på");
  assert.deepEqual(j([sp.tur, sp.scene, sp.fase, sp.dom, sp.plan]), [1, 7, "klar", null, null]);
  assert.equal(M.angre(sp), false, "dommen kan ikke angres etter neste scene");
  assert.equal(sp.logg.length, 1);
});

test("spillet slutter etter siste scene; vinnere og uavgjort", () => {
  const sp = M.nyttSpill({ tid: 45, tempo: "vanlig", runder: 1 }, 3, 11);
  const dommer = ["a", "begge", "b"];
  for (let k = 0; k < 3; k++) {
    M.startScene(sp, k + 1, N);
    M.kutt(sp);
    M.dom(sp, dommer[k]);
    assert.equal(M.neste(sp, k), k === 2);
  }
  assert.equal(sp.ferdig, true);
  assert.equal(sp.poeng.reduce((s, p) => s + p, 0), 6);
  const v = M.vinnere(sp);
  const topp = Math.max(...sp.poeng);
  assert.deepEqual(j(v), j(sp.poeng).map((p, i) => (p === topp ? i : -1)).filter((i) => i >= 0));
  const tom = M.nyttSpill({}, 4, 1);
  assert.deepEqual(j(M.vinnere(tom)), []);
  assert.deepEqual(j([tom.tid, tom.tempo, tom.runder]), [60, "vanlig", 1], "ukjente valg gir standard");
});

test("innhold: minst 60 scener og 30 følelser, like mange og samme id-er på nb, en og da", () => {
  const spraak = { nb: NB, en: data("data.en"), da: data("data.da") };
  for (const [s, d] of Object.entries(spraak)) {
    assert.ok(d.scener.length >= 60, `${s}: ${d.scener.length} scener`);
    assert.ok(d.folelser.length >= 30, `${s}: ${d.folelser.length} følelser`);
    assert.equal(d.scener.length, NB.scener.length, `${s}: antall scener`);
    assert.equal(d.folelser.length, NB.folelser.length, `${s}: antall følelser`);
    assert.deepEqual(d.folelser.map((f) => f.id), NB.folelser.map((f) => f.id), `${s}: id-ene i samme rekkefølge`);
    assert.deepEqual(d.folelser.map((f) => f.e), NB.folelser.map((f) => f.e), `${s}: samme emoji`);
    for (const f of d.folelser) {
      assert.ok(f.t && f.t.length <= 24 && f.h && f.h.length <= 60, `${s}: ${f.id} er for lang eller mangler tekst`);
    }
    const titler = new Set();
    for (const sc of d.scener) {
      assert.ok(Array.isArray(sc) && sc.length === 3 && sc.every((x) => typeof x === "string" && x.trim()), `${s}: ${JSON.stringify(sc)}`);
      assert.ok(sc[0].length <= 56, `${s}: scenen «${sc[0]}» er for lang`);
      assert.ok(!titler.has(sc[0]), `${s}: «${sc[0]}» to ganger`);
      titler.add(sc[0]);
    }
    assert.equal(new Set(d.folelser.map((f) => f.t)).size, d.folelser.length, `${s}: samme følelse to ganger`);
  }
});
