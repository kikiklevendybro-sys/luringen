/* Luringen – game core: randomness, word selection, roles, scoring and join codes.
   Pure functions without DOM access. Loaded as a classic script in the browser
   (exposed as window.LuringenKjerne) and via require() in the Node tests. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.LuringenKjerne = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MIN_SPILLERE = 3;
  const MAKS_SPILLERE = 10;

  // Difficulty levels. `vansker` = which word difficulties (1–3) are in the pot.
  // `luringFar` = what the imposter sees on their card.
  const NIVAER = [
    { id: "lett", navn: "Lett", vansker: [1], luringFar: "hint" },
    { id: "middels", navn: "Middels", vansker: [1, 2], luringFar: "bare-hint" },
    { id: "vanskelig", navn: "Vanskelig", vansker: [2, 3], luringFar: "ingenting" },
    { id: "kaos", navn: "Kaos", vansker: [1, 2], luringFar: "lignende" },
  ];

  // Below this many words for a level, the whole category selection is used instead.
  const MIN_POTT = 12;
  // Words are packed as categoryIndex * PAKKE + wordIndex.
  const PAKKE = 4096;

  function maksLuringer(spillere) {
    return Math.max(1, Math.floor(spillere / 3));
  }

  // ---------- Deterministic randomness ----------

  // mulberry32: small, fast, good enough for shuffling party-game words.
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Mixes any number of integers into one 32-bit seed.
  function miks() {
    let h = 0x811c9dc5;
    for (let i = 0; i < arguments.length; i++) {
      h ^= arguments[i] >>> 0;
      h = Math.imul(h, 0x01000193);
      h ^= h >>> 13;
      h = Math.imul(h, 0x5bd1e995);
      h ^= h >>> 15;
    }
    return h >>> 0;
  }

  function hashTekst(tekst) {
    let h = 0x811c9dc5;
    for (let i = 0; i < tekst.length; i++) {
      h ^= tekst.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  // Fisher–Yates, in place.
  function stokk(liste, tilfeldig) {
    for (let i = liste.length - 1; i > 0; i--) {
      const j = Math.floor(tilfeldig() * (i + 1));
      const tmp = liste[i];
      liste[i] = liste[j];
      liste[j] = tmp;
    }
    return liste;
  }

  // 25-bit seed so it fits in a join code.
  function nyttFro(kilde) {
    if (kilde && typeof kilde.getRandomValues === "function") {
      const buf = new Uint32Array(1);
      kilde.getRandomValues(buf);
      return buf[0] & 0x1ffffff;
    }
    return Math.floor(Math.random() * 0x2000000);
  }

  // ---------- Words ----------

  function erAlleKategorier(data, kategorier) {
    return !kategorier || kategorier.length === 0 || kategorier.length >= data.kategorier.length;
  }

  // All packed word references that fit the category selection and level.
  function byggPott(data, kategorier, niva) {
    const vansker = NIVAER[niva].vansker;
    const valgt = erAlleKategorier(data, kategorier) ? null : new Set(kategorier);
    const pott = [];
    const alle = [];
    data.kategorier.forEach(function (kat, ki) {
      if (valgt && !valgt.has(kat.id)) return;
      kat.ord.forEach(function (ord, oi) {
        const pakket = ki * PAKKE + oi;
        alle.push(pakket);
        if (vansker.indexOf(ord[1]) !== -1) pott.push(pakket);
      });
    });
    return pott.length >= MIN_POTT ? pott : alle;
  }

  function antallOrd(data, kategorier, niva) {
    return byggPott(data, kategorier, niva).length;
  }

  // The full word order for a game. Same seed and settings give the same order on every device.
  function ordRekkefolge(data, oppsett) {
    const pott = byggPott(data, oppsett.kategorier, oppsett.niva);
    return stokk(pott.slice(), rng(miks(oppsett.seed, 0x51ed)));
  }

  function hentOrd(data, pakket) {
    const kat = data.kategorier[Math.floor(pakket / PAKKE)];
    const rad = kat.ord[pakket % PAKKE];
    return {
      ord: rad[0],
      vanske: rad[1],
      hint: rad[2],
      lignende: rad[3],
      kategori: { id: kat.id, navn: kat.navn, ikon: kat.ikon },
      nokkel: kat.id + ":" + rad[0],
    };
  }

  // Who is the imposter and who starts. Depends only on seed, round and player count.
  function fordelRoller(oppsett, runde) {
    const tilfeldig = rng(miks(oppsett.seed, runde, 0xa11ce));
    const plasser = [];
    for (let i = 0; i < oppsett.spillere; i++) plasser.push(i);
    stokk(plasser, tilfeldig);
    const luringer = plasser.slice(0, oppsett.luringer).sort(function (a, b) {
      return a - b;
    });
    const starter = Math.floor(tilfeldig() * oppsett.spillere);
    return { luringer: luringer, starter: starter };
  }

  // A complete round. `posisjon` is the index into the word order (defaults to runde - 1,
  // which is what every device in a shared-code game uses). `unnga` is a Set of word keys
  // to skip (single-device mode only, to avoid repeats across games).
  function lagRunde(data, oppsett, runde, valg) {
    valg = valg || {};
    const rekkefolge = valg.rekkefolge || ordRekkefolge(data, oppsett);
    let posisjon = typeof valg.posisjon === "number" ? valg.posisjon : runde - 1;
    if (valg.unnga && valg.unnga.size) {
      for (let forsok = 0; forsok < rekkefolge.length; forsok++) {
        const kandidat = hentOrd(data, rekkefolge[posisjon % rekkefolge.length]);
        if (!valg.unnga.has(kandidat.nokkel)) break;
        posisjon++;
      }
    }
    const ord = hentOrd(data, rekkefolge[posisjon % rekkefolge.length]);
    const roller = fordelRoller(oppsett, runde);
    return {
      runde: runde,
      posisjon: posisjon,
      ord: ord.ord,
      vanske: ord.vanske,
      hint: ord.hint,
      lignende: ord.lignende,
      kategori: ord.kategori,
      nokkel: ord.nokkel,
      luringer: roller.luringer,
      starter: roller.starter,
    };
  }

  // What one player sees on their card.
  function kortFor(runde, oppsett, plass) {
    const erLuring = runde.luringer.indexOf(plass) !== -1;
    const niva = NIVAER[oppsett.niva];
    if (!erLuring) return { type: "ord", ord: runde.ord, kategori: runde.kategori };
    if (niva.luringFar === "lignende") return { type: "ord", ord: runde.lignende, kategori: runde.kategori, kaos: true };
    return {
      type: "luring",
      kategori: niva.luringFar === "hint" ? runde.kategori : null,
      hint: niva.luringFar === "hint" || niva.luringFar === "bare-hint" ? runde.hint : null,
    };
  }

  // Points for one round: imposters get 2 each when they win, everyone else 1 each when the group wins.
  function poengForRunde(antall, luringer, luringVant) {
    const poeng = [];
    for (let i = 0; i < antall; i++) {
      const erLuring = luringer.indexOf(i) !== -1;
      poeng.push(erLuring ? (luringVant ? 2 : 0) : luringVant ? 0 : 1);
    }
    return poeng;
  }

  // ---------- Join codes ----------
  // Layout (bits): version 2 | players-3 3 | imposters-1 2 | level 2 | all-categories 1 |
  // [category mask, one bit per category] | seed 25, padded to 5-bit symbols,
  // followed by one checksum symbol that also covers the word-list hash.
  // All categories: 8 symbols. A category subset: 15 symbols (with 32 categories).

  const ALFABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32
  const KODE_VERSJON = 0;

  function sjekksum(symboler, dataHash) {
    return miks.apply(null, [dataHash, symboler.length].concat(symboler)) & 31;
  }

  function kodeLengde(data, alle) {
    const bits = 35 + (alle ? 0 : data.kategorier.length);
    return Math.ceil(bits / 5) + 1;
  }

  function lagKode(oppsett, data) {
    const bits = [];
    function skriv(verdi, antall) {
      for (let i = antall - 1; i >= 0; i--) bits.push((verdi >>> i) & 1);
    }
    skriv(KODE_VERSJON, 2);
    skriv(oppsett.spillere - MIN_SPILLERE, 3);
    skriv(oppsett.luringer - 1, 2);
    skriv(oppsett.niva, 2);
    const alle = erAlleKategorier(data, oppsett.kategorier);
    skriv(alle ? 1 : 0, 1);
    if (!alle) {
      const valgt = new Set(oppsett.kategorier);
      data.kategorier.forEach(function (k) {
        bits.push(valgt.has(k.id) ? 1 : 0);
      });
    }
    skriv(oppsett.seed & 0x1ffffff, 25);
    while (bits.length % 5) bits.push(0);
    const symboler = [];
    for (let i = 0; i < bits.length; i += 5) {
      let s = 0;
      for (let j = 0; j < 5; j++) s = s * 2 + bits[i + j];
      symboler.push(s);
    }
    symboler.push(sjekksum(symboler, data.hash));
    return symboler
      .map(function (s) {
        return ALFABET[s];
      })
      .join("");
  }

  function normaliserKode(tekst) {
    return String(tekst || "")
      .toUpperCase()
      .replace(/[^0-9A-Z]/g, "")
      .replace(/O/g, "0")
      .replace(/[IL]/g, "1")
      .replace(/U/g, "V");
  }

  function formaterKode(kode) {
    const ren = normaliserKode(kode);
    const deler = [];
    for (let i = 0; i < ren.length; i += 4) deler.push(ren.slice(i, i + 4));
    return deler.join("-");
  }

  // Returns { ok: true, oppsett } or { ok: false, feil } where feil is
  // "tom" | "kort" | "lang" | "sjekksum" | "versjon" | "ugyldig".
  function lesKode(tekst, data) {
    const kode = normaliserKode(tekst);
    if (!kode) return { ok: false, feil: "tom" };
    const kortest = kodeLengde(data, true);
    const lengst = kodeLengde(data, false);
    if (kode.length < kortest) return { ok: false, feil: "kort" };
    if (kode.length !== kortest && kode.length !== lengst) return { ok: false, feil: kode.length > lengst ? "lang" : "kort" };
    const symboler = kode.split("").map(function (c) {
      return ALFABET.indexOf(c);
    });
    const sum = symboler.pop();
    if (sjekksum(symboler, data.hash) !== sum) return { ok: false, feil: "sjekksum" };

    const bits = [];
    symboler.forEach(function (s) {
      for (let i = 4; i >= 0; i--) bits.push((s >>> i) & 1);
    });
    let p = 0;
    function les(antall) {
      let v = 0;
      for (let i = 0; i < antall; i++) v = v * 2 + (bits[p++] || 0);
      return v;
    }
    if (les(2) !== KODE_VERSJON) return { ok: false, feil: "versjon" };
    const spillere = les(3) + MIN_SPILLERE;
    const luringer = les(2) + 1;
    const niva = les(2);
    const alle = les(1) === 1;
    if (kode.length !== kodeLengde(data, alle)) return { ok: false, feil: "ugyldig" };
    let kategorier = null;
    if (!alle) {
      kategorier = [];
      data.kategorier.forEach(function (k) {
        if (les(1)) kategorier.push(k.id);
      });
      if (!kategorier.length) return { ok: false, feil: "ugyldig" };
    }
    const seed = les(25);
    if (spillere > MAKS_SPILLERE || niva >= NIVAER.length || luringer > maksLuringer(spillere)) {
      return { ok: false, feil: "ugyldig" };
    }
    return {
      ok: true,
      kode: kode,
      oppsett: { spillere: spillere, luringer: luringer, niva: niva, kategorier: kategorier, seed: seed },
    };
  }

  return {
    MIN_SPILLERE: MIN_SPILLERE,
    MAKS_SPILLERE: MAKS_SPILLERE,
    NIVAER: NIVAER,
    maksLuringer: maksLuringer,
    rng: rng,
    miks: miks,
    hashTekst: hashTekst,
    stokk: stokk,
    nyttFro: nyttFro,
    erAlleKategorier: erAlleKategorier,
    byggPott: byggPott,
    antallOrd: antallOrd,
    ordRekkefolge: ordRekkefolge,
    hentOrd: hentOrd,
    fordelRoller: fordelRoller,
    lagRunde: lagRunde,
    kortFor: kortFor,
    poengForRunde: poengForRunde,
    lagKode: lagKode,
    lesKode: lesKode,
    normaliserKode: normaliserKode,
    formaterKode: formaterKode,
    kodeLengde: kodeLengde,
  };
});
