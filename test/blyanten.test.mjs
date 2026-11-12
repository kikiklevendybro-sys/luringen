// Blyanten: every daily crossword of the first year, in every edition (Norwegian, English, Danish),
// is a valid grid. Loads the kit and rusj/spill/blyanten/spill.js in a small fake browser (node:vm)
// with the edition's data, builds each day's crossword with the game's own generator, and checks:
// the day's planned theme is used; every word comes from that theme's first ordAntall words with
// its clue; letters agree where words cross; and every run of two or more letters across or down
// in the grid is exactly one of the placed words (so no accidental words form where letters touch).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DAGER = 366;

function lastSpill(sprak) {
  const mappe = join(ROT, "rusj/spill/blyanten", sprak === "nb" ? "data" : `data.${sprak}`);
  const data = {
    temaer: JSON.parse(readFileSync(join(mappe, "temaer.json"), "utf8")),
    dagens: JSON.parse(readFileSync(join(mappe, "dagens.json"), "utf8")),
  };
  const lager = new Map();
  const window = {
    RUSJ_SPRAK: sprak === "nb" ? undefined : sprak,
    RUSJ_SPILL: { id: "blyanten", navn: "Blyanten" },
    RUSJ_DATA: data,
    RusjGjengen: { svg: () => "<svg></svg>", logo: () => "<svg></svg>" },
    matchMedia: () => ({ matches: false }),
    addEventListener() {},
    location: { protocol: "http:", origin: "http://lokal", pathname: "/blyanten/", hash: "" },
  };
  window.self = window;
  window.top = window;
  const kontekst = {
    window,
    localStorage: { getItem: (k) => (lager.has(k) ? lager.get(k) : null), setItem: (k, v) => lager.set(k, String(v)), removeItem: (k) => lager.delete(k) },
    navigator: {},
    document: { addEventListener() {}, documentElement: {} },
    crypto: globalThis.crypto,
    location: window.location,
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
  const R = window.Rusj;
  let def = null;
  R.start = (d) => (def = d);
  vm.runInContext(readFileSync(join(ROT, "rusj/spill/blyanten/spill.js"), "utf8"), kontekst);
  return { R, def, data };
}

// What is wrong with one crossword (an empty list when it is fine).
function sjekkKryss(k, lov) {
  const feil = [];
  const celler = new Map();
  for (const w of k.ord) {
    const b = Array.from(w.o);
    if (!lov.has(w.o)) feil.push(`«${w.o}» er ikke i temaets liste`);
    else if (lov.get(w.o) !== w.hint) feil.push(`«${w.o}» har feil stikkord`);
    b.forEach((c, i) => {
      const x = w.x + (w.r === "v" ? i : 0);
      const y = w.y + (w.r === "l" ? i : 0);
      if (x < 0 || y < 0 || x >= k.b || y >= k.h) feil.push(`«${w.o}» går utenfor rutenettet`);
      const n = y * k.b + x;
      if (celler.has(n) && celler.get(n) !== c) feil.push(`«${w.o}» krysser med en annen bokstav i (${x}, ${y})`);
      celler.set(n, c);
    });
  }
  // Every run of two or more letters is one placed word, and every placed word is one run.
  const ord = new Set(k.ord.map((w) => `${w.r}:${w.x},${w.y}:${w.o}`));
  const funnet = new Set();
  for (const r of ["v", "l"]) {
    const ytre = r === "v" ? k.h : k.b;
    const indre = r === "v" ? k.b : k.h;
    for (let a = 0; a < ytre; a++) {
      let start = -1;
      let tekst = "";
      for (let i = 0; i <= indre; i++) {
        const x = r === "v" ? i : a;
        const y = r === "v" ? a : i;
        const c = i < indre ? celler.get(y * k.b + x) : undefined;
        if (c) {
          if (start < 0) start = i;
          tekst += c;
        } else {
          if (start >= 0 && Array.from(tekst).length >= 2) {
            const sx = r === "v" ? start : a;
            const sy = r === "v" ? a : start;
            const nokkel = `${r}:${sx},${sy}:${tekst}`;
            if (!ord.has(nokkel)) feil.push(`«${tekst}» (${r === "v" ? "vannrett" : "loddrett"}) er ikke et av ordene`);
            funnet.add(nokkel);
          }
          start = -1;
          tekst = "";
        }
      }
    }
  }
  for (const w of ord) if (!funnet.has(w)) feil.push(`${w} står ikke alene i rutenettet`);
  // Clue numbers: row by row, one number per starting cell.
  const starter = [...new Set(k.ord.map((w) => w.y * k.b + w.x))].sort((a, b) => a - b);
  for (const w of k.ord) if (w.nr !== starter.indexOf(w.y * k.b + w.x) + 1) feil.push(`«${w.o}» har feil nummer`);
  return feil;
}

for (const sprak of ["nb", "en", "da"]) {
  test(`${sprak}: every daily crossword of the first year is a valid grid from the day's theme`, () => {
    const { R, def, data } = lastSpill(sprak);
    assert.ok(def && def._dagensKryss, "fant ikke generatoren");
    const forste = R.dag(new Date(Date.UTC(2026, 10, 9, 12))).nr;
    const plan = data.dagens.temaer;
    const tema = new Map(data.temaer.temaer.map((t) => [t.id, t]));
    for (const id of plan) assert.ok(tema.has(id), `${sprak}: planen har et ukjent tema «${id}»`);
    for (const [id, n] of Object.entries(data.dagens.ordAntall)) assert.ok(tema.has(id) && n <= tema.get(id).ord.length, `${sprak}: ordAntall for «${id}»`);
    assert.ok(plan.length >= DAGER, `${sprak}: planen dekker bare ${plan.length} dager`);
    for (let d = 0; d < DAGER; d++) {
      const k = def._dagensKryss(forste + d);
      assert.ok(k, `${sprak} dag ${d + 1}: ingen kryss`);
      assert.equal(k.tema, plan[d], `${sprak} dag ${d + 1}: brukte «${k.tema}» i stedet for «${plan[d]}»`);
      assert.equal(k.ord.length, 8, `${sprak} dag ${d + 1}: ${k.ord.length} ord`);
      const t = tema.get(k.tema);
      const lov = new Map(t.ord.slice(0, data.dagens.ordAntall[k.tema]));
      assert.deepEqual(sjekkKryss(k, lov), [], `${sprak} dag ${d + 1} (${k.tema})`);
    }
  });
}

test("the checker finds a word that touches another from the side", () => {
  const lov = new Map([["katt", "a"], ["tak", "b"], ["ku", "c"]]);
  const k = { b: 4, h: 3, ord: [{ o: "katt", hint: "a", x: 0, y: 0, r: "v", nr: 1 }, { o: "ku", hint: "c", x: 0, y: 1, r: "v", nr: 3 }, { o: "tak", hint: "b", x: 3, y: 0, r: "l", nr: 2 }] };
  assert.ok(sjekkKryss(k, lov).length > 0);
});
