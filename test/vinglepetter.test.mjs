// Vinglepetter: the teen pack («Ungdom» / «Teens» / «Unge», 13–16) is added last, so the existing
// packs, saved games and remembered decks draw exactly as before (a fingerprint of seeded draws
// through the game's own «start», per edition); the pack has the same shape in nb, en and da,
// no repeats, no sex, alcohol, drugs or brand names, and is not chosen by default.
// The fingerprints were taken before the pack was added. If you change an existing dilemma on
// purpose, run the same draws again and update them here.
import assert from "node:assert/strict";
import { ungdomTester, voksenTester } from "./kortpakker.mjs";

ungdomTester({
  id: "vinglepetter",
  fil: "dilemmaer",
  felt: "dilemmaer",
  gamle: ["barn", "familie", "mat", "fantasi", "ekkelt", "venner", "fest", "jul", "sport", "sommer", "jobb", "par", "blikjent"],
  avtrykk: {
    nb: { standard: ["barn", "familie", "mat", "fantasi", "ekkelt", "venner", "sport", "sommer", "jobb", "blikjent"], antall: 981, kart: "0a35cd6825497b10", trekk: "91e1ffc4712e16e1" },
    en: { standard: ["barn", "familie", "mat", "fantasi", "ekkelt", "venner", "sport", "sommer", "jobb", "blikjent"], antall: 936, kart: "36a5c1590d1fcd15", trekk: "20c04dc2805a0cf8" },
    da: { standard: ["barn", "familie", "mat", "fantasi", "ekkelt", "venner", "sport", "sommer", "jobb", "blikjent"], antall: 940, kart: "200d867a13e20d38", trekk: "cf1c5620d6a41a1e" },
  },
  maks: 62,
  // The hidden heading of the card screen says both options as they are written.
  skjerm: "kort",
  vist: (k) => k,
  // A dilemma is two different, lower-case options (the game capitalises the first letter itself).
  kort: (k, sprak) => {
    assert.ok(Array.isArray(k) && k.length === 2, `${sprak}: et dilemma er to valg`);
    assert.notEqual(k[0], k[1], `${sprak}: to like valg «${k[0]}»`);
    for (const t of k) {
      assert.equal(t[0], t[0].toLocaleLowerCase(sprak), `${sprak}: «${t}» skal begynne med liten bokstav`);
      assert.ok(!/[.?!]$/.test(t), `${sprak}: «${t}» skal ikke slutte med tegn (spillet setter «?»)`);
    }
  },
});

// «Fest» and «Par» sit behind the 18+ question (as in Dommeren), in every edition.
voksenTester({ id: "vinglepetter", fil: "dilemmaer", voksne: ["fest", "par"], standard: ["barn", "familie", "mat", "fantasi", "ekkelt", "venner", "sport", "sommer", "jobb", "blikjent"] });
