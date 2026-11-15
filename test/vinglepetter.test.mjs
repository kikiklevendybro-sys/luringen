// Vinglepetter: the teen pack («Ungdom» / «Teens» / «Unge», 13–16) is added last, so the existing
// packs, saved games and remembered decks draw exactly as before (a fingerprint of seeded draws
// through the game's own «start», per edition); the pack has the same shape in nb, en and da,
// no repeats, no sex, alcohol, drugs or brand names, and is not chosen by default.
// The fingerprints were taken before the pack was added. If you change an existing dilemma on
// purpose, run the same draws again and update them here.
import assert from "node:assert/strict";
import { ungdomTester } from "./kortpakker.mjs";

ungdomTester({
  id: "vinglepetter",
  fil: "dilemmaer",
  felt: "dilemmaer",
  gamle: ["barn", "familie", "mat", "fantasi", "ekkelt", "venner", "fest", "jul", "sport", "sommer", "jobb", "par", "blikjent"],
  avtrykk: {
    nb: { standard: ["barn", "familie", "mat", "fantasi", "ekkelt", "venner", "sport", "sommer", "jobb", "blikjent"], antall: 981, kart: "c54913e687c24929", trekk: "46857dfad6eb5578" },
    en: { standard: ["barn", "familie", "mat", "fantasi", "ekkelt", "venner", "sport", "sommer", "jobb", "blikjent"], antall: 936, kart: "63c91bfafc456a34", trekk: "20c04dc2805a0cf8" },
    da: { standard: ["barn", "familie", "mat", "fantasi", "ekkelt", "venner", "sport", "sommer", "jobb", "blikjent"], antall: 940, kart: "0c1db00726bfe8c4", trekk: "23d974b74cba300d" },
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
