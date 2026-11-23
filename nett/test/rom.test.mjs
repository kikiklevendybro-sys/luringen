// The room (src/rom.js): seats, order, coming back, limits and deletion.
import { test } from "node:test";
import assert from "node:assert/strict";
import { nyttRom, vekk, koble, romMedVert, NAA } from "./falsk.mjs";
import { LUKK } from "../src/rom.js";
import { FART, FART_STENG, MAKS_KOBLINGER, MAKS_TREKK, LEVETID_MS, RESERVERT_MS, SPILL, FORTSETT } from "../src/oppsett.js";

const TIME = 60 * 60 * 1000;

// Host + one friend in a two-seat game: the room starts by itself.
async function toSpillere(spill = "fireren", o) {
  const r = await romMedVert(spill, o);
  const venn = await koble(r);
  await venn.send({ h: "bli", navn: "Testspiller B" });
  return { ...r, venn };
}

test("the host sets up a reserved room and gets seat 0 with a token", async () => {
  const { vert, ctx } = await romMedVert("fireren", { oppsett: { mal: 5 }, fro: 4242 });
  const m = vert.siste;
  assert.equal(m.h, "rom");
  assert.equal(m.spill, "fireren");
  assert.deepEqual(m.oppsett, { mal: 5 });
  assert.equal(m.fro, 4242);
  assert.equal(m.du, 0);
  assert.match(m.token, /^[A-Za-z0-9_-]{22}$/);
  assert.deepEqual(m.seter, [{ navn: "Testspiller A", med: true, borte: false }]);
  assert.equal(m.startet, false);
  assert.deepEqual(m.logg, []);
  assert.deepEqual([m.min, m.maks], [2, 2]);
  assert.equal(ctx.storage.alarmTid, NAA + LEVETID_MS);
});

test("a second «lag» on a room that is set up is refused", async () => {
  const r = await romMedVert();
  const annen = await koble(r);
  await annen.send({ h: "lag", spill: "sjakkhesten", oppsett: {}, fro: 1 });
  assert.deepEqual(annen.siste, { h: "feil", kode: "opptatt" });
  assert.equal((await r.ctx.storage.get("rom")).spill, "fireren");
});

test("«lag» checks the game, the setup and the seed", async () => {
  for (const [lag, hva] of [
    [{ spill: "ukjent", oppsett: {}, fro: 1 }, "unknown game"],
    [{ spill: "__proto__", oppsett: {}, fro: 1 }, "prototype"],
    [{ spill: "fireren", oppsett: [], fro: 1 }, "setup is a list"],
    [{ spill: "fireren", oppsett: { x: "y".repeat(600) }, fro: 1 }, "setup too big"],
    [{ spill: "fireren", oppsett: {}, fro: -1 }, "negative seed"],
    [{ spill: "fireren", oppsett: {}, fro: 2 ** 32 }, "seed too big"],
    [{ spill: "fireren", oppsett: {}, fro: 1.5 }, "seed not whole"],
  ]) {
    const r = nyttRom();
    await r.rom.reserver();
    const v = await koble(r);
    await v.send({ h: "lag", ...lag });
    assert.deepEqual(v.siste, { h: "feil", kode: "ugyldig" }, hva);
    assert.equal((await r.ctx.storage.get("rom")).spill, null, hva);
  }
});

test("a friend joins; when the last seat is taken the room starts by itself", async () => {
  const { vert, venn } = await toSpillere();
  const inn = venn.av("rom")[0];
  assert.equal(inn.du, 1);
  assert.match(inn.token, /^[A-Za-z0-9_-]{22}$/);
  assert.notEqual(inn.token, vert.av("rom")[0].token);
  assert.deepEqual(inn.seter.map((s) => s.navn), ["Testspiller A", "Testspiller B"]);
  assert.deepEqual(vert.av("seter").at(-1).seter, [{ navn: "Testspiller A", med: true, borte: false }, { navn: "Testspiller B", med: true, borte: false }]);
  assert.equal(vert.av("start").length, 1);
  assert.equal(venn.av("start").length, 1);
});

test("Yatzy: the host starts when two of six are in; earlier and by others is refused", async () => {
  const r = await romMedVert("terninga");
  await r.vert.send({ h: "start" });
  assert.deepEqual(r.vert.siste, { h: "feil", kode: "ugyldig" }, "alone is not enough");
  const b = await koble(r);
  await b.send({ h: "bli", navn: "Testspiller B" });
  await b.send({ h: "start" });
  assert.deepEqual(b.siste, { h: "feil", kode: "ugyldig" }, "only the host starts");
  assert.equal(r.vert.av("start").length, 0);
  await r.vert.send({ h: "start" });
  assert.equal(r.vert.av("start").length, 1);
  assert.equal(b.av("start").length, 1);
});

test("a full room says no to a new phone, and closes its socket", async () => {
  const r = await toSpillere();
  const tredje = await koble(r);
  await tredje.send({ h: "bli", navn: "Testspiller C" });
  assert.deepEqual(tredje.siste, { h: "feil", kode: "full" });
  assert.equal(tredje.apen, false);
  assert.equal(tredje.klient.lukket.kode, LUKK.full);
  assert.equal((await r.ctx.storage.get("rom")).seter.length, 2);
});

test("a started Yatzy room with free seats says «startet» to a new phone", async () => {
  const r = await romMedVert("terninga");
  const b = await koble(r);
  await b.send({ h: "bli" });
  await r.vert.send({ h: "start" });
  const c = await koble(r);
  await c.send({ h: "bli" });
  assert.deepEqual(c.siste, { h: "feil", kode: "startet" });
  assert.equal(c.apen, false);
});

test("seats per game: chess, Fireren and Admiralen 2, Ludo 4, Yatzy 6", async () => {
  assert.deepEqual(SPILL, { sjakkhesten: [2, 2], fireren: [2, 2], admiralen: [2, 2], brikka: [2, 4], terninga: [2, 6], reversi: [2, 2], bonden: [2, 2], molla: [2, 2], samannen: [2, 2], snekkeren: [2, 2], dam: [2, 2], stigespillet: [2, 4], lykkegrisen: [2, 8] });
  for (const [spill, [, maks]] of Object.entries(SPILL)) {
    const r = await romMedVert(spill);
    const inne = [r.vert];
    for (let i = 1; i < maks; i++) {
      const p = await koble(r);
      await p.send({ h: "bli", navn: `Testspiller ${i}` });
      assert.equal(p.av("rom")[0].du, i, spill);
      inne.push(p);
    }
    const for_ = await koble(r);
    await for_.send({ h: "bli" });
    assert.deepEqual(for_.siste, { h: "feil", kode: "full" }, spill);
    assert.equal(inne.every((p) => p.av("start").length === 1), true, `${spill} starts when full`);
  }
});

test("moves are numbered in order and relayed to every phone, the sender too", async () => {
  const { vert, venn, ctx } = await toSpillere();
  await vert.send({ h: "trekk", n: 0, t: { k: 3 } });
  await venn.send({ h: "trekk", n: 1, t: { k: 4 } });
  await vert.send({ h: "trekk", n: 2, t: { k: 3 } });
  const forventet = [{ h: "trekk", n: 0, s: 0, t: { k: 3 } }, { h: "trekk", n: 1, s: 1, t: { k: 4 } }, { h: "trekk", n: 2, s: 0, t: { k: 3 } }];
  assert.deepEqual(vert.av("trekk"), forventet);
  assert.deepEqual(venn.av("trekk"), forventet);
  assert.deepEqual(await ctx.storage.get("t:0001"), [1, { k: 4 }]);
  assert.equal((await ctx.storage.get("rom")).n, 3);
});

test("a move on an old view of the match is refused with the current number, and not stored", async () => {
  const { vert, venn, ctx } = await toSpillere();
  await vert.send({ h: "trekk", n: 0, t: { k: 3 } });
  await venn.send({ h: "trekk", n: 0, t: { k: 1 } }); // sent before it saw the host's move
  assert.deepEqual(venn.siste, { h: "feil", kode: "utdatert", n: 1 });
  await venn.send({ h: "trekk", n: 5, t: { k: 1 } });
  assert.deepEqual(venn.siste, { h: "feil", kode: "utdatert", n: 1 });
  await venn.send({ h: "trekk", t: { k: 1 } });
  assert.deepEqual(venn.siste, { h: "feil", kode: "utdatert", n: 1 });
  assert.equal(vert.av("trekk").length, 1);
  assert.equal((await ctx.storage.get("rom")).n, 1);
  assert.equal(await ctx.storage.get("t:0001"), undefined);
});

test("no moves before the start, and none from a phone without a seat", async () => {
  const r = await romMedVert("terninga");
  await r.vert.send({ h: "trekk", n: 0, t: 1 });
  assert.deepEqual(r.vert.siste, { h: "feil", kode: "ugyldig" });
  const fremmed = await koble(r);
  await fremmed.send({ h: "trekk", n: 0, t: 1 });
  assert.deepEqual(fremmed.siste, { h: "feil", kode: "sete" });
  await fremmed.send({ h: "reaksjon", e: 1 });
  assert.deepEqual(fremmed.siste, { h: "feil", kode: "sete" });
});

test("a phone that comes back with its token gets its seat, the setup and the whole list to replay", async () => {
  const { vert, venn, rom } = await toSpillere("fireren", { fro: 777 });
  const token = venn.av("rom")[0].token;
  for (let n = 0; n < 6; n++) await (n % 2 ? venn : vert).send({ h: "trekk", n, t: { k: n % 7 } });
  await venn.lukk();
  assert.deepEqual(vert.av("seter").at(-1).seter.map((s) => s.med), [true, false], "the host sees the friend go");
  const igjen = await koble(rom);
  await igjen.send({ h: "bli", token });
  const m = igjen.siste;
  assert.equal(m.h, "rom");
  assert.equal(m.du, 1);
  assert.equal(m.token, token);
  assert.equal(m.fro, 777);
  assert.equal(m.startet, true);
  assert.deepEqual(m.logg, [[0, { k: 0 }], [1, { k: 1 }], [0, { k: 2 }], [1, { k: 3 }], [0, { k: 4 }], [1, { k: 5 }]]);
  assert.deepEqual(vert.av("seter").at(-1).seter.map((s) => s.med), [true, true], "and come back");
  await igjen.send({ h: "trekk", n: 6, t: { k: 6 } });
  assert.deepEqual(vert.siste, { h: "trekk", n: 6, s: 1, t: { k: 6 } });
});

test("the same seat from a second socket: the old one is closed as replaced", async () => {
  const { venn, rom } = await toSpillere();
  const token = venn.av("rom")[0].token;
  const ny = await koble(rom);
  await ny.send({ h: "bli", token });
  assert.equal(ny.siste.du, 1);
  assert.equal(venn.apen, false);
  assert.equal(venn.klient.lukket.kode, LUKK.erstattet);
});

test("a wrong or made-up token does not give a seat", async () => {
  const r = await toSpillere();
  for (const token of ["A".repeat(22), "kort", 42, null]) {
    const p = await koble(r);
    await p.send({ h: "bli", token });
    assert.deepEqual(p.siste, { h: "feil", kode: "full" }, String(token));
  }
});

test("after hibernation the room reads itself back from storage and goes on in order", async () => {
  const r = await toSpillere();
  const { vert, venn } = r;
  await vert.send({ h: "trekk", n: 0, t: { k: 3 } });
  await venn.send({ h: "trekk", n: 1, t: { k: 2 } });
  const vaken = vekk(r); // memory gone; storage and sockets kept
  await vert.send({ h: "trekk", n: 2, t: { k: 1 } }, vaken);
  assert.deepEqual(venn.siste, { h: "trekk", n: 2, s: 0, t: { k: 1 } });
  const igjen = await koble(vaken);
  await igjen.send({ h: "bli", token: venn.av("rom")[0].token }, vaken);
  assert.deepEqual(igjen.siste.logg, [[0, { k: 3 }], [1, { k: 2 }], [0, { k: 1 }]]);
});

test("a code nobody reserved: the socket is told «ukjent» and closed", async () => {
  const r = nyttRom();
  const p = await koble(r);
  assert.equal(p.svar.status, 101);
  assert.deepEqual(p.siste, { h: "feil", kode: "ukjent" });
  assert.equal(p.klient.lukket.kode, LUKK.ukjent);
  assert.equal(r.ctx.storage.data.size, 0, "nothing is written for an unknown code");
});

test("a reserved code is reserved once; a joiner before the host has set it up is told «ukjent»", async () => {
  const r = nyttRom();
  assert.equal((await r.rom.reserver()).status, 201);
  assert.equal((await r.rom.reserver()).status, 409);
  const p = await koble(r);
  await p.send({ h: "bli" });
  assert.deepEqual(p.siste, { h: "feil", kode: "ukjent" });
  assert.equal(r.ctx.storage.alarmTid, NAA + RESERVERT_MS);
});

test("limit: a message over 2 KB is refused and nothing changes", async () => {
  const { vert, ctx } = await toSpillere();
  await vert.send(JSON.stringify({ h: "trekk", n: 0, t: "x".repeat(2100) }));
  assert.deepEqual(vert.siste, { h: "feil", kode: "stor" });
  await vert.send(JSON.stringify({ h: "trekk", n: 0, t: "æ".repeat(1100) })); // 2200 bytes in UTF-8
  assert.deepEqual(vert.siste, { h: "feil", kode: "stor" });
  await vert.send({ h: "trekk", n: 0, t: "x".repeat(1100) }); // fits the message, not the 1 KB move
  assert.deepEqual(vert.siste, { h: "feil", kode: "ugyldig" });
  assert.equal((await ctx.storage.get("rom")).n, 0);
});

test("limit: garbage, binary data and unknown kinds of message are refused", async () => {
  const { vert, rom } = await toSpillere();
  for (const m of ["ikke json", "[1,2]", "null", '{"h":"slett"}', '{"h":"__proto__"}', '{"x":1}']) {
    await vert.send(m);
    assert.deepEqual(vert.siste, { h: "feil", kode: "ugyldig" }, m);
  }
  await rom.webSocketMessage(vert.tjener, new ArrayBuffer(8));
  assert.deepEqual(vert.siste, { h: "feil", kode: "ugyldig" });
});

test("limit: about 20 messages per 10 s per socket; far above that the socket is closed", async () => {
  const r = await toSpillere();
  const { vert, venn, klokke } = r;
  klokke.naa += FART.ms + 1; // a fresh window (setting up and joining were messages too)
  for (let i = 0; i < FART.antall; i++) await vert.send({ h: "reaksjon", e: 0 });
  assert.equal(venn.av("reaksjon").length, FART.antall);
  await vert.send({ h: "reaksjon", e: 0 });
  assert.deepEqual(vert.siste, { h: "feil", kode: "fort" });
  assert.equal(venn.av("reaksjon").length, FART.antall, "the 21st is dropped");
  klokke.naa += FART.ms + 1;
  await vert.send({ h: "reaksjon", e: 1 });
  assert.equal(venn.av("reaksjon").length, FART.antall + 1, "10 s later it is fine again");
  for (let i = 0; i < FART_STENG + 1; i++) await venn.send({ h: "reaksjon", e: 0 });
  assert.equal(venn.apen, false);
  assert.equal(venn.klient.lukket.kode, LUKK.fort);
});

test("limit: at most 2000 moves in one match", async () => {
  const r = await toSpillere();
  const { vert, ctx } = r;
  // Fill the list directly (2000 messages would take a long fake time with the rate limit).
  const rom = await r.rom.hent();
  for (let n = 0; n < MAKS_TREKK; n++) r.rom.logg.push([n % 2, n]);
  rom.n = MAKS_TREKK;
  await vert.send({ h: "trekk", n: MAKS_TREKK, t: 1 });
  assert.deepEqual(vert.siste, { h: "feil", kode: "logg" });
  assert.equal(ctx.storage.data.has("t:2000"), false);
});

test(`limit: at most ${MAKS_KOBLINGER} open sockets in one room`, async () => {
  const r = await romMedVert("terninga");
  const p = [];
  for (let i = 1; i < MAKS_KOBLINGER; i++) p.push(await koble(r));
  assert.ok(p.every((x) => x.apen));
  const for_ = await koble(r);
  assert.deepEqual(for_.siste, { h: "feil", kode: "full" });
  assert.equal(for_.apen, false);
});

test("nicknames: plain text, no control or direction characters, at most 16 characters", async () => {
  const r = await romMedVert("terninga", { navn: "  Testspiller\u202e A\u0000 \n " });
  assert.equal(r.vert.av("rom")[0].seter[0].navn, "Testspiller A");
  const b = await koble(r);
  await b.send({ h: "bli", navn: "Testspiller med et alt for langt navn" });
  assert.equal(b.siste.seter[1].navn, "Testspiller med", "16 characters, and no space left at the end");
  assert.equal(Array.from(b.siste.seter[1].navn).length <= 16, true);
  const c = await koble(r);
  await c.send({ h: "bli", navn: { navn: "objekt" } });
  assert.equal(c.siste.seter[2].navn, "");
  const d = await koble(r);
  await d.send({ h: "bli", navn: "<img src=x onerror=1>" });
  assert.equal(d.siste.seter[3].navn, "<img src=x onerr", "markup is kept as text: the phones show it as plain text");
});

test("reactions: one of six numbers, to the others, never stored", async () => {
  const { vert, venn, ctx } = await toSpillere();
  const for_ = ctx.storage.skrivinger;
  await vert.send({ h: "reaksjon", e: 5 });
  assert.deepEqual(venn.siste, { h: "reaksjon", s: 0, e: 5 });
  assert.equal(vert.av("reaksjon").length, 0, "not back to the sender");
  for (const e of [6, -1, 1.5, "😀", "hei"]) {
    await vert.send({ h: "reaksjon", e });
    assert.deepEqual(vert.siste, { h: "feil", kode: "ugyldig" }, String(e));
  }
  assert.equal(ctx.storage.skrivinger, for_);
});

test("deletion: the alarm deletes everything 24 hours after the last activity", async () => {
  const r = await toSpillere();
  const { vert, venn, ctx, klokke } = r;
  klokke.naa += 5 * TIME;
  await vert.send({ h: "trekk", n: 0, t: { k: 1 } });
  assert.equal(ctx.storage.alarmTid, klokke.naa + LEVETID_MS, "each move moves the alarm");
  // An alarm that fires early (or an old one) only moves on.
  klokke.naa += 23 * TIME;
  await r.rom.alarm();
  assert.ok(ctx.storage.data.size > 0);
  assert.equal(ctx.storage.alarmTid, NAA + 5 * TIME + LEVETID_MS);
  klokke.naa = ctx.storage.alarmTid;
  await r.rom.alarm();
  assert.equal(ctx.storage.data.size, 0, "every key is gone");
  assert.equal(ctx.storage.alarmTid, null);
  assert.deepEqual(vert.siste, { h: "slettet", grunn: "tid" });
  assert.equal(venn.klient.lukket.kode, LUKK.slettet);
  // The code can be used again by a new room.
  assert.equal((await vekk(r).reserver()).status, 201);
});

test("deletion: a code nobody set up goes after 10 minutes", async () => {
  const r = nyttRom();
  await r.rom.reserver();
  r.klokke.naa += RESERVERT_MS;
  await r.rom.alarm();
  assert.equal(r.ctx.storage.data.size, 0);
});

test("deletion: a finished match goes at once when everyone has left", async () => {
  const { vert, venn, ctx } = await toSpillere();
  await vert.send({ h: "trekk", n: 0, t: { k: 3 } });
  await vert.send({ h: "ferdig" });
  assert.ok(ctx.storage.data.size > 0, "someone is still in it");
  await vert.lukk();
  assert.ok(ctx.storage.data.size > 0, "the friend is still in it");
  await venn.lukk();
  assert.equal(ctx.storage.data.size, 0);
  assert.equal(ctx.storage.alarmTid, null);
});

test("deletion: an unfinished match is kept when the phones go (they may come back)", async () => {
  const { vert, venn, ctx } = await toSpillere();
  await vert.send({ h: "trekk", n: 0, t: { k: 3 } });
  await vert.lukk();
  await venn.lukk();
  assert.equal((await ctx.storage.get("rom")).n, 1);
});

test("leaving before the start: a friend frees the seat; the host closes the room", async () => {
  const r = await romMedVert("terninga");
  const b = await koble(r);
  await b.send({ h: "bli", navn: "Testspiller B" });
  const c = await koble(r);
  await c.send({ h: "bli", navn: "Testspiller C" });
  await b.send({ h: "forlat" });
  assert.equal(b.apen, false);
  assert.deepEqual(c.siste.seter.map((s) => s.navn), ["Testspiller A", "Testspiller C"]);
  assert.equal(c.siste.du, 1, "the seats close up, and each phone is told its new number");
  await r.vert.send({ h: "forlat" });
  assert.deepEqual(c.siste, { h: "slettet", grunn: "verten" });
  assert.equal(r.ctx.storage.data.size, 0);
});

test("leaving during the match: the seat is marked as left, the match is over, the token is dead", async () => {
  const { vert, venn, ctx, rom } = await toSpillere();
  const token = venn.av("rom")[0].token;
  await vert.send({ h: "trekk", n: 0, t: { k: 3 } });
  await venn.send({ h: "forlat" });
  assert.deepEqual(vert.siste.seter.map((s) => s.borte), [false, true]);
  const lagret = await ctx.storage.get("rom");
  assert.equal(lagret.ferdig, true);
  assert.equal(lagret.seter[1].token, null);
  const igjen = await koble(rom);
  await igjen.send({ h: "bli", token });
  assert.deepEqual(igjen.siste, { h: "feil", kode: "full" });
  await vert.send({ h: "trekk", n: 1, t: { k: 1 } });
  assert.deepEqual(vert.siste, { h: "feil", kode: "ugyldig" }, "no moves after the match is over");
});

test("leaving in a play-on game: the others go on, the room adds the seat's «borte» move in order", async () => {
  FORTSETT.add("terninga");
  try {
    const r = await romMedVert("terninga");
    const b = await koble(r);
    await b.send({ h: "bli", navn: "Testspiller B" });
    const c = await koble(r);
    await c.send({ h: "bli", navn: "Testspiller C" });
    await r.vert.send({ h: "start" });
    assert.equal(c.av("rom").at(-1).fortsett, true);
    await r.vert.send({ h: "trekk", n: 0, t: { k: 1 } });
    await b.send({ h: "forlat" });
    assert.deepEqual(c.siste, { h: "trekk", n: 1, s: 1, t: { $: "borte" } });
    const lagret = await r.ctx.storage.get("rom");
    assert.equal(lagret.ferdig, false);
    assert.equal(lagret.seter[1].borte, true);
    assert.equal(lagret.seter[1].token, null);
    await c.send({ h: "trekk", n: 2, t: { k: 2 } });
    assert.deepEqual(r.vert.siste, { h: "trekk", n: 2, s: 2, t: { k: 2 } }, "the match goes on");
    // Two left of a minimum of two: the next one to leave ends it.
    await c.send({ h: "forlat" });
    assert.equal((await r.ctx.storage.get("rom")).ferdig, true);
    await r.vert.send({ h: "trekk", n: 3, t: { k: 1 } });
    assert.deepEqual(r.vert.siste, { h: "feil", kode: "ugyldig" });
  } finally {
    FORTSETT.delete("terninga");
  }
});

test("«Ny kamp»: same seats, new seed, empty list, the old moves deleted", async () => {
  const { vert, venn, ctx } = await toSpillere("fireren", { fro: 1 });
  await vert.send({ h: "trekk", n: 0, t: { k: 3 } });
  await venn.send({ h: "trekk", n: 1, t: { k: 3 } });
  await vert.send({ h: "ny", fro: 99 });
  assert.deepEqual(vert.siste, { h: "feil", kode: "ugyldig" }, "not before the match is over");
  await venn.send({ h: "ferdig" });
  vert.tom();
  venn.tom();
  await vert.send({ h: "ny", fro: 99 });
  for (const [p, du] of [[vert, 0], [venn, 1]]) {
    const m = p.siste;
    assert.equal(m.h, "rom");
    assert.equal(m.kamp, 2);
    assert.equal(m.fro, 99);
    assert.equal(m.du, du);
    assert.equal(m.startet, true);
    assert.equal(m.ferdig, false);
    assert.deepEqual(m.logg, []);
  }
  assert.equal(ctx.storage.data.has("t:0000"), false);
  assert.equal(ctx.storage.data.has("t:0001"), false);
  await venn.send({ h: "trekk", n: 0, t: { k: 0 } });
  assert.deepEqual(vert.siste, { h: "trekk", n: 0, s: 1, t: { k: 0 } });
});

test("«Ny kamp» after someone left: without that seat, back to waiting when too few", async () => {
  const r = await romMedVert("terninga");
  const b = await koble(r);
  await b.send({ h: "bli", navn: "Testspiller B" });
  const c = await koble(r);
  await c.send({ h: "bli", navn: "Testspiller C" });
  await r.vert.send({ h: "start" });
  await b.send({ h: "forlat" });
  await c.send({ h: "ny", fro: 5 });
  assert.deepEqual(c.siste.seter.map((s) => s.navn), ["Testspiller A", "Testspiller C"]);
  assert.equal(c.siste.du, 1);
  assert.equal(c.siste.startet, true);
  // Two-seat game where one left: one seat is not enough to play.
  const t = await toSpillere();
  await t.venn.send({ h: "forlat" });
  await t.vert.send({ h: "ny", fro: 6 });
  assert.equal(t.vert.siste.startet, false);
  assert.deepEqual(t.vert.siste.seter.map((s) => s.navn), ["Testspiller A"]);
});

test("the keep-alive «ping» is answered by the platform without waking the room", async () => {
  const { ctx } = nyttRom();
  assert.equal(ctx.autoSvar.sporsmal, "ping");
  assert.equal(ctx.autoSvar.svar, "pong");
});

test("a socket that closes after the room was deleted does no harm", async () => {
  const r = await toSpillere();
  await r.rom.slettAlt("tid");
  await r.rom.webSocketClose(r.vert.tjener);
  await r.rom.alarm();
  assert.equal(r.ctx.storage.data.size, 0);
});
