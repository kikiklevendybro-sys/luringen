// Sladrehanken: the teen pack («Ungdom» / «Teens» / «Unge», 13–16) is added last, so the existing
// packs, saved games and remembered decks draw exactly as before (a fingerprint of seeded draws
// through the game's own «start», per edition); the pack has the same shape in nb, en and da,
// no repeats, no sex, alcohol, drugs or brand names, and is not chosen by default.
// The fingerprints were taken before the pack was added. If you change an existing card on
// purpose, run the same draws again and update them here.
import assert from "node:assert/strict";
import { ungdomTester } from "./kortpakker.mjs";

const GAMLE = ["familie", "venner", "pinlig", "reise", "mat", "jobb", "fest", "jul", "barn", "blikjent", "hytte", "sommer", "russ"];
const STANDARD = ["familie", "venner", "pinlig", "reise", "mat", "jobb", "barn", "blikjent", "hytte", "sommer"];

ungdomTester({
  id: "sladrehanken",
  fil: "kort",
  felt: "kort",
  gamle: GAMLE,
  avtrykk: {
    nb: { standard: STANDARD, antall: 1173, kart: "457d2d37dfec4fb8", trekk: "e0d76342eff35d27" },
    en: { standard: STANDARD, antall: 1151, kart: "9e4c245d633e9cf4", trekk: "350d660fd71c7234" },
    da: { standard: STANDARD, antall: 1160, kart: "9ed747f257ed73ba", trekk: "bf17c4cc568ae753" },
  },
  maks: 80,
  skjerm: "kort",
  vist: (k) => [k],
  // «Jeg har aldri …» + the card: a lower-case past participle phrase; the game adds the full stop.
  kort: (k, sprak) => {
    assert.equal(k[0], k[0].toLocaleLowerCase(sprak), `${sprak}: «${k}» skal begynne med liten bokstav`);
    assert.ok(!/[.?!]$/.test(k), `${sprak}: «${k}» skal ikke slutte med tegn (spillet setter punktum)`);
    assert.ok(!/^(jeg|never|i)\b/i.test(k), `${sprak}: «${k}» – «Jeg har aldri …» står allerede foran`);
  },
});
