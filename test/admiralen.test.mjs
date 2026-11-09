// Unit tests for Admiralen (Battleship): random fleets follow the rules (inside the board, no
// overlaps, never touching), the board knowledge (miss / hit / sunk / water around a sunk ship) is
// right, the computer never fires twice at the same cell, and the three levels really differ in
// strength. Loads the kit and the game in a small fake browser (node:vm).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");

function lastSpill() {
  const lager = new Map();
  const location = { protocol: "http:", origin: "http://lokal", pathname: "/admiralen/", hash: "" };
  const window = {
    RUSJ_SPILL: { id: "admiralen", navn: "Admiralen" },
    RUSJ_DATA: {},
    RusjGjengen: { svg: () => "<svg></svg>", logo: () => "<svg></svg>" },
    matchMedia: () => ({ matches: false }),
    addEventListener() {},
    location,
  };
  window.self = window;
  window.top = window;
  const kontekst = {
    window,
    localStorage: {
      getItem: (k) => (lager.has(k) ? lager.get(k) : null),
      setItem: (k, v) => lager.set(k, String(v)),
      removeItem: (k) => lager.delete(k),
    },
    navigator: {},
    document: { addEventListener() {}, documentElement: {} },
    crypto: globalThis.crypto,
    location,
    history: { pushState() {}, replaceState() {} },
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    performance,
  };
  vm.createContext(kontekst);
  vm.runInContext(readFileSync(join(ROT, "rusj/kit/rusj.js"), "utf8"), kontekst);
  let def = null;
  window.Rusj.start = (d) => (def = d);
  vm.runInContext(readFileSync(join(ROT, "rusj/spill/admiralen/spill.js"), "utf8"), kontekst);
  assert.ok(def && def.kjerne, "spill.js skal kalle Rusj.start med kjerne-funksjonene");
  return { R: window.Rusj, K: def.kjerne };
}

const { R, K } = lastSpill();

test("tilfeldige flåter følger reglene", () => {
  for (const n of [8, 10]) {
    for (let k = 0; k < 300; k++) {
      const flate = K.tilfeldigFlate(n);
      assert.equal(flate.length, K.FLATER[n].length);
      assert.ok(K.gyldig(flate, n), "flåten bryter reglene");
      const eier = new Map();
      flate.forEach((s, j) => {
        assert.equal(s.lengde, K.FLATER[n][j][1]);
        for (const c of K.celler(s, n)) {
          assert.ok(c >= 0 && c < n * n);
          assert.ok(!eier.has(c), "to skip på samme rute");
          eier.set(c, j);
        }
      });
      for (const [c, j] of eier) for (const m of K.naboer(c, n, true)) assert.ok(!eier.has(m) || eier.get(m) === j, "to skip ligger inntil hverandre");
    }
  }
});

test("reglene for plassering", () => {
  const n = 10;
  const a = { id: "torpedo", lengde: 2, r: "h", x: 0, y: 0 };
  assert.ok(K.gyldig([a], n));
  assert.ok(!K.gyldig([{ ...a, x: 9 }], n), "utenfor brettet");
  assert.ok(!K.gyldig([a, { id: "ubat", lengde: 3, r: "v", x: 1, y: 0 }], n), "overlapp");
  assert.ok(!K.gyldig([a, { id: "ubat", lengde: 3, r: "v", x: 2, y: 1 }], n), "inntil på skrå");
  assert.ok(!K.gyldig([a, { id: "ubat", lengde: 3, r: "h", x: 0, y: 1 }], n), "inntil under");
  assert.ok(K.gyldig([a, { id: "ubat", lengde: 3, r: "h", x: 0, y: 2 }], n), "én rad mellom går fint");
  assert.equal(K.rute(0, 10), "A1");
  assert.equal(K.rute(99, 10), "J10");
  assert.equal(K.rute(9, 10), "J1");
});

test("tavla: bom, treff, senket og vann rundt et senket skip", () => {
  const n = 10;
  const flate = [{ id: "torpedo", lengde: 2, r: "h", x: 4, y: 4 }];
  let { t, senket } = K.tavle(flate, [44, 0], n);
  assert.equal(t[44], 2, "treff");
  assert.equal(t[0], 1, "bom");
  assert.equal(senket[0], false);
  ({ t, senket } = K.tavle(flate, [44, 45], n));
  assert.equal(senket[0], true);
  assert.equal(t[44], 3);
  assert.equal(t[45], 3);
  for (const c of [33, 34, 35, 36, 43, 46, 53, 54, 55, 56]) assert.equal(t[c], 4, `rute ${K.rute(c, n)} rundt skipet skal være vann`);
  assert.equal(t[37], 0, "lenger unna vet vi ingenting");
});

// Plays one side's whole game: the computer fires until every ship is sunk. Returns the shot count.
function spill(niva, n, flate) {
  const skudd = [];
  for (let k = 0; k < n * n + 1; k++) {
    const { t, senket } = K.tavle(flate, skudd, n);
    if (senket.every(Boolean)) return skudd.length;
    const igjen = flate.filter((s, j) => !senket[j]).map((s) => s.lengde);
    const i = K.maskinVelg(niva, n, js(t), igjen);
    assert.ok(i >= 0 && i < n * n, `${niva}: ugyldig skudd ${i}`);
    assert.equal(t[i], 0, `${niva} skjøt på en rute som allerede var kjent (${K.rute(i, n)})`);
    skudd.push(i);
  }
  throw new Error(`${niva} ble aldri ferdig`);
}
const js = (x) => JSON.parse(JSON.stringify(x));

test("datamaskinen: aldri samme rute to ganger, og nivåene er ulike sterke", () => {
  for (const n of [8, 10]) {
    const snitt = {};
    for (const niva of ["lett", "middels", "vanskelig"]) {
      let sum = 0;
      const runder = 60;
      for (let k = 0; k < runder; k++) sum += spill(niva, n, K.tilfeldigFlate(n));
      snitt[niva] = sum / runder;
    }
    assert.ok(snitt.vanskelig < snitt.middels && snitt.middels < snitt.lett, `n=${n}: ${JSON.stringify(snitt)}`);
    if (n === 10) assert.ok(snitt.vanskelig < 52, `vanskelig bruker ${snitt.vanskelig} skudd i snitt på 10 × 10`);
  }
});

test("treffgrupper: rutene til ett skip henger sammen", () => {
  const g = js(K.grupper([44, 45, 46, 80], 10));
  assert.equal(g.length, 2);
  assert.deepEqual(g.find((x) => x.length === 3), [44, 45, 46]);
  void R;
});
