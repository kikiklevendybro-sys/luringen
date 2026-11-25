// Sladrehanken: the teen pack («Ungdom» / «Teens» / «Unge», 13–16) is added last, so the existing
// packs, saved games and remembered decks draw exactly as before (a fingerprint of seeded draws
// through the game's own «start», per edition); the pack has the same shape in nb, en and da,
// no repeats, no sex, alcohol, drugs or brand names, and is not chosen by default.
// The fingerprints were taken before the pack was added. If you change an existing card on
// purpose, run the same draws again and update them here.
import assert from "node:assert/strict";
import { ungdomTester, voksenTester } from "./kortpakker.mjs";

const GAMLE = ["familie", "venner", "pinlig", "reise", "mat", "jobb", "fest", "jul", "barn", "blikjent", "hytte", "sommer", "russ"];
const STANDARD = ["familie", "venner", "pinlig", "reise", "mat", "jobb", "barn", "blikjent", "hytte", "sommer"];

ungdomTester({
  id: "sladrehanken",
  fil: "kort",
  felt: "kort",
  gamle: GAMLE,
  avtrykk: {
    nb: { standard: STANDARD, antall: 1173, kart: "8f6648949b2fe456", trekk: "e0d76342eff35d27" },
    en: { standard: STANDARD, antall: 1151, kart: "189a1b066932881c", trekk: "501f7a116c0168e7" },
    da: { standard: STANDARD, antall: 1160, kart: "ff703eea82b2bbbf", trekk: "a74f9cf7c7d41dc6" },
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

// «Fest» and «Russ» sit behind the 18+ question (as in Dommeren), in every edition.
voksenTester({ id: "sladrehanken", fil: "kort", voksne: ["fest", "russ"], standard: STANDARD });
