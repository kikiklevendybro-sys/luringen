// Våghalsen: the «Par» pack is for two people who are together – {spiller} on its cards is the
// partner and «dere to» is the couple – so it only counts when exactly two play. Checked through the
// game's own «start», «pakke» and «lastet» on the real kit, in every edition.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lastSpill, SPRAK, voksenTester } from "./kortpakker.mjs";

test("vaghalsen: «Par» kan bare velges og brukes når dere er akkurat to", () => {
  for (const sprak of SPRAK) {
    const { R, cfg, data, S } = lastSpill("vaghalsen", "kort", sprak);
    R.S = S; // the kit's player list on the setup screen reads the state from here
    assert.ok(data.pakker.some((p) => p.id === "par"), `${sprak}: mangler pakken «par»`);
    const html = () => cfg.skjermer.oppsett.vis(S);
    const flis = () => html().match(/<button class="flis" data-h="pakke" data-v="par"[^>]*>/)[0];

    // Three players: the tile is greyed out, a tap does nothing, and a chosen «Par» is not used.
    S.antall = 3;
    S.oppsett.pakker = ["familie", "venner"];
    assert.ok(/ disabled/.test(flis()), `${sprak}: «Par» skal være grå med tre spillere`);
    cfg.handlinger.pakke({ dataset: { v: "par" } }, null, S);
    assert.deepEqual([...S.oppsett.pakker], ["familie", "venner"], `${sprak}: «Par» ble valgt med tre spillere`);
    S.oppsett.pakker = ["par", "venner"];
    assert.ok(/aria-pressed="false"/.test(flis()), `${sprak}: «Par» skal ikke vises som valgt med tre spillere`);
    cfg.handlinger.start(null, null, S);
    assert.deepEqual([...S.spill.pakker], ["venner"], `${sprak}: et spill for tre skal ikke bruke «Par»`);
    // Only «Par» chosen and three players: nothing to play, so no game starts.
    S.spill = null;
    S.oppsett.pakker = ["par"];
    assert.ok(/data-h="start"[^>]* disabled/.test(html()), `${sprak}: «Start» skal være av når bare «Par» er valgt for tre`);
    cfg.handlinger.start(null, null, S);
    assert.equal(S.spill, null, `${sprak}: spillet startet med bare «Par» for tre spillere`);

    // Two players: «Par» can be chosen and is used, and {spiller} is always the other one.
    S.antall = 2;
    S.oppsett.pakker = ["familie"];
    assert.ok(!/ disabled/.test(flis()), `${sprak}: «Par» skal kunne velges med to spillere`);
    cfg.handlinger.pakke({ dataset: { v: "par" } }, null, S);
    assert.deepEqual([...S.oppsett.pakker], ["familie", "par"], `${sprak}: «Par» ble ikke valgt med to spillere`);
    cfg.handlinger.start(null, null, S);
    assert.deepEqual([...S.spill.pakker], ["familie", "par"], `${sprak}: et spill for to skal bruke «Par»`);

    // A saved game from before, for four with «Par»: «Par» is dropped (the default packs if nothing is left).
    S.spill.antall = 4;
    S.spill.stat = Array.from({ length: 4 }, () => ({ turer: 0, s: 0, k: 0 }));
    S.spill.pakker = ["par"];
    cfg.lastet(S);
    assert.ok(S.spill && !S.spill.pakker.includes("par") && S.spill.pakker.length, `${sprak}: et lagret spill for fire beholdt «Par» (${S.spill && S.spill.pakker})`);
  }
});

// «Fest» and «Russ» sit behind the 18+ question (as in Dommeren), in every edition.
voksenTester({ id: "vaghalsen", fil: "kort", voksne: ["fest", "russ"], standard: ["familie", "venner"] });
