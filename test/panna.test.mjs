// Panna's decks: every deck complete, no word twice (in a deck or across decks), the new decks big
// enough, and the order that saved games and the memory of shown words rely on.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const STOKKER = JSON.parse(readFileSync(new URL("../rusj/spill/panna/data/kortstokker.json", import.meta.url), "utf8")).kortstokker;
const stokk = (id) => STOKKER.find((s) => s.id === id);
// The same word whatever the case, spaces or punctuation («Hoppe tau» = «Hoppetau»).
const norm = (t) => t.toLocaleLowerCase("nb").replace(/[^a-z0-9æøåéèüöä]/g, "");
const FARGER = ["lampe", "oransje", "rod", "himmel", "rosa", "lilla", "mynte"];

test("alle kortstokker har id, navn, ikon, farge, beskrivelse, tips og ord", () => {
  assert.equal(new Set(STOKKER.map((s) => s.id)).size, STOKKER.length, "to kortstokker med samme id");
  for (const s of STOKKER) {
    assert.match(s.id, /^[a-z0-9]{1,20}$/, `id «${s.id}» kan ikke brukes i lenker og rekorder`);
    for (const felt of ["navn", "ikon", "tekst", "tips"]) assert.ok(typeof s[felt] === "string" && s[felt].trim() === s[felt] && s[felt], `${s.id}: mangler ${felt}`);
    assert.ok(FARGER.includes(s.farge), `${s.id}: ukjent farge ${s.farge}`);
    assert.ok(Array.isArray(s.ord) && s.ord.length >= 50, `${s.id}: bare ${s.ord.length} ord`);
    if (s.slik != null) assert.ok(typeof s.slik === "string" && s.slik.length >= 10 && s.slik.length <= 45, `${s.id}: «slik» må være én kort setning`);
    if (s.ny != null) assert.match(s.ny, /^20\d\d-\d\d-\d\d$/, `${s.id}: «ny» er en dato`);
  }
});

test("ingen ord står to ganger – verken i en kortstokk eller på tvers", () => {
  const sett = new Map();
  for (const s of STOKKER)
    for (const o of s.ord) {
      assert.ok(typeof o === "string" && o === o.trim() && o.length >= 2 && o.length <= 34, `${s.id}: «${o}» er tomt, for langt eller har mellomrom rundt seg`);
      assert.ok(!/\s{2,}/.test(o), `${s.id}: «${o}» har doble mellomrom`);
      const k = norm(o);
      assert.ok(!sett.has(k), `«${o}» står i både ${sett.get(k)} og ${s.id}`);
      sett.set(k, s.id);
    }
});

test("de nye kortstokkene er store nok og sier hva hjelperne gjør", () => {
  assert.ok(stokk("mim").ord.length >= 100, `Mim det!: ${stokk("mim").ord.length}`);
  assert.ok(stokk("lyd").ord.length >= 70, `Lag lyden!: ${stokk("lyd").ord.length}`);
  assert.ok(stokk("si").ord.length >= 50, `Si det som …: ${stokk("si").ord.length}`);
  assert.ok(stokk("jul").ord.length >= 90, `Jul: ${stokk("jul").ord.length}`);
  for (const id of ["mim", "lyd", "si", "folelser"]) assert.ok(stokk(id).slik, `${id} mangler «slik»`);
  // Mime tasks are things to do: they start with a verb in the infinitive (which ends in a vowel).
  for (const o of stokk("mim").ord) assert.match(o, /^[A-ZÆØÅ][a-zæøå]*[aeiouyæøå]( |$)/, `Mim det!: «${o}» ser ikke ut som noe man gjør`);
  assert.equal(stokk("jul").navn, "Jul");
  assert.equal(stokk("jul").ikon, "🎄");
  assert.equal(stokk("jul").tekst, "Jul og julebord");
});

test("jul er for hele familien: ingenting om alkohol", () => {
  for (const o of stokk("jul").ord) assert.ok(!/(^|\s)(jule)?(øl|vin|dram)($|\s)|akevitt|drink|bakrus|nachspiel|sprit|likør|champagne/i.test(o), `Jul: «${o}»`);
});

test("rekkefølgen lagrede spill peker inn i: de tolv første kortstokkene, så ordbanken, så de nye", () => {
  const forste = STOKKER.filter((s) => !s.etterOrdbank).map((s) => s.id);
  assert.deepEqual(forste, ["dyr", "mat", "yrker", "sport", "film", "eventyr", "huset", "steder", "norge", "folelser", "barn", "kaos"]);
  // The first 1226 words keep their numbers: nothing may be added to or removed from those decks
  // (raised from 841 on 2026-11-12 when every deck was filled up to at least 100 words).
  assert.equal(
    STOKKER.filter((s) => !s.etterOrdbank).reduce((n, s) => n + s.ord.length, 0),
    1226,
    "antall ord i de tolv første kortstokkene er endret – da peker lagrede spill og «allerede vist» på feil ord",
  );
  // New decks come last in the file, so their words keep their numbers when another deck is added.
  const sisteGamle = STOKKER.map((s) => !!s.etterOrdbank).lastIndexOf(false);
  assert.ok(STOKKER.slice(sisteGamle + 1).every((s) => s.etterOrdbank), "en ny kortstokk står foran en av de tolv første");
});
