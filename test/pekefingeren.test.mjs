// Pekefingeren: the teen pack («Ungdom» / «Teens» / «Unge», 13–16) is added last, so the existing
// packs, saved games and remembered decks draw exactly as before (a fingerprint of seeded draws
// through the game's own «start», per edition); the pack has the same shape in nb, en and da,
// no repeats, no sex, alcohol, drugs or brand names, and is not chosen by default. Everyone points
// at a friend, so the statements stay kind.
// The fingerprints were taken before the pack was added. If you change an existing statement on
// purpose, run the same draws again and update them here.
import assert from "node:assert/strict";
import { ungdomTester } from "./kortpakker.mjs";

const GAMLE = ["familie", "venner", "fest", "jobb", "reise", "kaos", "jul", "barn", "russ", "bryllup", "laget"];

ungdomTester({
  id: "pekefingeren",
  fil: "utsagn",
  felt: "utsagn",
  gamle: GAMLE,
  avtrykk: {
    nb: { standard: ["familie", "venner"], antall: 963, kart: "f63fd5b7dbe4b0e5", trekk: "6d09b8ff4cb61cc0" },
    en: { standard: ["familie", "venner"], antall: 915, kart: "47e632ce70e32a2b", trekk: "e48918b4f6fee188" },
    da: { standard: ["familie", "venner"], antall: 929, kart: "10ea2963904c220e", trekk: "a531baa658b50300" },
  },
  maks: 75,
  skjerm: "kort",
  vist: (k) => [k],
  // «Hvem er mest sannsynlig til å …» + the statement + «?»: a lower-case verb phrase, no end mark.
  kort: (k, sprak) => {
    assert.equal(k[0], k[0].toLocaleLowerCase(sprak), `${sprak}: «${k}» skal begynne med liten bokstav`);
    assert.ok(!/[.?!]$/.test(k), `${sprak}: «${k}» skal ikke slutte med tegn (spillet setter «?»)`);
    assert.ok(!/^(å|to|at) /.test(k), `${sprak}: «${k}» – «til å / to / til at» står allerede foran`);
  },
});
