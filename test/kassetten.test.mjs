// Kassetten's words and sentences: enough of them in every edition, no duplicates, short enough
// to say in one breath (the recording stops after six seconds), and the same shape everywhere.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const les = (mappe) => JSON.parse(readFileSync(new URL(`../rusj/spill/kassetten/${mappe}/kassett.json`, import.meta.url), "utf8"));

for (const [sprak, mappe] of [["nb", "data"], ["en", "data.en"], ["da", "data.da"]]) {
  const d = les(mappe);
  test(`${sprak}: at least 150 words and 80 sentences, no duplicates`, () => {
    assert.deepEqual(Object.keys(d).sort(), ["ord", "setninger"]);
    assert.ok(d.ord.length >= 150, `only ${d.ord.length} words`);
    assert.ok(d.setninger.length >= 80, `only ${d.setninger.length} sentences`);
    const alle = d.ord.concat(d.setninger).map((x) => x.toLowerCase());
    assert.equal(new Set(alle).size, alle.length, "duplicates");
  });
  test(`${sprak}: words are one or two words, sentences two to seven words, no end punctuation`, () => {
    for (const o of d.ord) assert.ok(o.trim() === o && o.split(" ").length <= 2 && o.length <= 16, `word: «${o}»`);
    for (const s of d.setninger) {
      const n = s.split(" ").length;
      assert.ok(n >= 2 && n <= 7 && s.length <= 40, `sentence: «${s}»`);
      assert.ok(!/[.!?]$/.test(s), `ends with punctuation: «${s}»`);
    }
  });
}
