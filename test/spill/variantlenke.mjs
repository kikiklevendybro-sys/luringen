// The link behind the front page's rows for well-known games inside a game («Fem på rad · i
// Bonden»): /<id>/#variant=<variant>. Shared by the scenarios of the games that have "varianter" in
// spill.json; the kit reads the link and asks the game's `variant` hook (rusj/KIT.md).

// What the page shows now. valgt: an expression that is true when the variant is chosen in the setup.
const les = (t, valgt = "false") =>
  t.js(`({
    skjerm: Rusj.S.skjerm,
    hash: location.hash,
    ark: !document.querySelector("#ark").hidden,
    valgt: !!(${valgt}),
    pagar: !!(Rusj.S.spill && !Rusj.S.spill.ferdig),
    // (which game is on the table – not its every detail: a phone player may move meanwhile)
    spill: JSON.stringify(Rusj.S.spill ? [Rusj.S.spill.id, Rusj.S.spill.variant, Rusj.S.spill.modus, Rusj.S.spill.type, !!Rusj.S.spill.ferdig] : null),
    oppsett: JSON.stringify(Rusj.S.oppsett || null),
  })`);

// Opens the link: as a fresh visit from the front page, or (sammeSide) while the game's page is
// already open, where only the address changes.
export async function apneVariant(t, variant, { sammeSide = false, valgt } = {}) {
  if (sammeSide) await t.js(`location.hash = ${JSON.stringify("variant=" + variant)}`);
  else {
    await t.js("window.Rusj && Rusj.lagre && Rusj.lagre()");
    await t.lastSide("about:blank");
    await t.lastSide(`${t.side}#variant=${variant}`, "document.querySelector('#skjerm h1, #skjerm .gi-til, #skjerm [data-h]')");
  }
  await t.sov(450);
  return les(t, valgt);
}

const svar = (t, ja) => t.klikk(`#ark [data-h="ark-svar"][data-v="${ja ? "ja" : "nei"}"]`, 450);

// The walk for a game that holds one game at a time (Bonden, Samleren, Pusen, Varulven).
//   o.variant     the variant's id
//   o.valgt       expression: the variant is chosen in the setup
//   o.start       what t.start gets (names …)
//   o.annet       expression that chooses another variant in the setup (run before a game is started)
//   o.skjerm      the setup screen ("oppsett")
export async function sjekkVariantlenke(t, o) {
  const skjerm = o.skjerm || "oppsett";
  const apne = (variant, sammeSide) => apneVariant(t, variant, { sammeSide, valgt: o.valgt });
  const startSpill = async () => {
    await t.js(`Rusj.gaTil(${JSON.stringify(skjerm)})`);
    await t.klikk('[data-h="start"]', 700);
  };

  // A new visitor: straight to the setup with the variant chosen, and the address is clean again.
  await t.start(o.start || {});
  await t.js(`(() => { ${o.annet}; Rusj.lagre(); })()`);
  let v = await apne(o.variant);
  t.sjekk(v.skjerm === skjerm && v.valgt && v.hash === "" && !v.ark, `#variant=${o.variant} åpner ikke oppsettet med varianten valgt (${JSON.stringify({ skjerm: v.skjerm, valgt: v.valgt, hash: v.hash, ark: v.ark })})`);
  await t.bilde(`variant-${o.variant}`, true);
  // A variant the game does not have: the usual start, nothing asked, the address clean – and the
  // setup as it was.
  const forUkjent = v.oppsett;
  v = await apne("finnes-ikke");
  t.sjekk(v.hash === "" && !v.ark && v.oppsett === forUkjent, `En ukjent variant i lenka rydder ikke adressen, spør om noe eller endrer oppsettet (${JSON.stringify({ hash: v.hash, ark: v.ark, oppsett: v.oppsett === forUkjent })})`);

  // A game of another kind is in progress: the usual question first – «Avbryt» changes nothing.
  await t.js(`(() => { ${o.annet}; Rusj.lagre(); })()`);
  await startSpill();
  const for_ = await les(t, o.valgt);
  t.sjekk(for_.pagar && !for_.valgt, `Fikk ikke i gang et spill av et annet slag til testen (${JSON.stringify({ pagar: for_.pagar, valgt: for_.valgt })})`);
  v = await apne(o.variant);
  t.sjekk(v.ark && v.pagar && !v.valgt && v.hash === "" && v.spill === for_.spill, `Lenka til en variant spør ikke først når et spill pågår (${JSON.stringify({ ark: v.ark, pagar: v.pagar, valgt: v.valgt })})`);
  if (t.norsk) t.sjekk(/Starte et nytt spill\?/.test(await t.tekst("#ark")), `Spørsmålet er ikke det vanlige: «${(await t.tekst("#ark")).replace(/\s+/g, " ").slice(0, 80)}»`);
  await t.bilde(`variant-${o.variant}-spor`);
  await svar(t, false);
  v = await les(t, o.valgt);
  t.sjekk(!v.ark && v.pagar && v.spill === for_.spill && v.oppsett === for_.oppsett, "«Avbryt» endret spillet som pågår, eller oppsettet");
  // The same link while the page is open: asked again; «Start nytt» goes to the setup.
  v = await apne(o.variant, true);
  t.sjekk(v.ark && v.hash === "", `Lenka spør ikke når siden allerede er åpen (${JSON.stringify({ ark: v.ark, hash: v.hash })})`);
  await svar(t, true);
  v = await les(t, o.valgt);
  t.sjekk(!v.ark && v.skjerm === skjerm && v.valgt, `«Start nytt» går ikke til oppsettet med varianten valgt (${JSON.stringify({ skjerm: v.skjerm, valgt: v.valgt })})`);

  // The variant itself is in progress: it just goes on, nothing asked.
  await t.klikk('[data-h="start"]', 700);
  const samme = await les(t, o.valgt);
  v = await apne(o.variant);
  t.sjekk(!v.ark && v.pagar && v.skjerm !== skjerm && v.spill === samme.spill && v.hash === "", `Lenka til varianten som pågår, spør eller starter på nytt (${JSON.stringify({ ark: v.ark, skjerm: v.skjerm, pagar: v.pagar })})`);

  await sjekkNettkamp(t, o.variant);
  await sjekkAldersport(t, o.variant);
}

// At the 18+ gate of a drinking game the link waits for the answer: the game's hook is not called
// before «Ja» – and then the link is followed. (No game with variants is 18+ today, so the gate is
// put up here: a screen named as the kit's own, with the kit's own answer on its button.)
export async function sjekkAldersport(t, variant) {
  const over18 = await t.js("!!Rusj.felles.over18");
  await t.js(`(() => {
    const app = Rusj.app;
    window.__variantkall = 0;
    for (const n of ["variant", "variantSpor"]) {
      const ekte = app[n];
      if (ekte && !ekte.__telt) {
        app[n] = function () { window.__variantkall++; return ekte.apply(this, arguments); };
        app[n].__telt = true;
      }
    }
    app.skjermer.alder = { tittel: "18+", gjenoppta: false, vis: () => '<div class="papirboks"><p>18+</p></div>' + Rusj.ui.dokk(Rusj.ui.knapp("18+", "alder-ja")) };
    Rusj.gaTil("alder");
  })()`);
  await t.sov(300);
  await t.js(`location.hash = ${JSON.stringify("variant=" + variant)}`);
  await t.sov(500);
  const les_ = () => t.js(`({ skjerm: Rusj.S.skjerm, hash: location.hash, ark: !document.querySelector("#ark").hidden, kall: window.__variantkall })`);
  let v = await les_();
  t.sjekk(v.skjerm === "alder" && v.hash === "" && !v.ark && v.kall === 0, `#variant=${variant} foran aldersporten: ${JSON.stringify(v)} (ventet at lenka venter på svaret, og at spillets variant-krok ikke ble kalt)`);
  await t.klikk('#skjerm [data-h="alder-ja"]', 600);
  v = await les_();
  t.sjekk(v.skjerm !== "alder" && v.kall >= 1, `Etter «Ja» i aldersporten følges ikke lenka til varianten: ${JSON.stringify(v)}`);
  if (v.ark) await svar(t, false);
  // (the gate was only put up for this check: the phone is as it was)
  await t.js(`(() => { delete Rusj.app.skjermer.alder; Rusj.lagreFelles({ over18: ${over18} }); })()`);
}

// In a match on the net the game on this phone is not on the table (the kit plays the match in a
// state of its own): the link says «Forlat kampen du er i først.» and the game's hook is never
// called – not for the question either. (The state of a match is what R._nettBytt gives the kit;
// no room is needed to check this.)
export async function sjekkNettkamp(t, variant) {
  await t.js("Rusj.lagre()");
  const lagret = await t.js(`localStorage.getItem(${JSON.stringify(t.nokkel(t.id))} + ".v" + (Rusj.app.versjon || 1))`);
  await t.js(`(() => {
    const app = Rusj.app;
    window.__variantkall = 0;
    for (const n of ["variant", "variantSpor"]) {
      const ekte = app[n];
      if (ekte && !ekte.__telt) {
        app[n] = function () { window.__variantkall++; return ekte.apply(this, arguments); };
        app[n].__telt = true;
      }
    }
    Rusj._nettBytt(true);
    Rusj.gaTil(app.hjem || "hjem");
  })()`);
  await t.sov(300);
  const for_ = await t.js(`JSON.stringify(Rusj.S.oppsett || null)`);
  await t.js(`location.hash = ${JSON.stringify("variant=" + variant)}`);
  await t.sov(500);
  const v = await t.js(`({ paNett: Rusj.paNett(), hash: location.hash, ark: !document.querySelector("#ark").hidden, toast: document.querySelector("#toast").classList.contains("vis") ? document.querySelector("#toast").textContent : "", kall: window.__variantkall, skjerm: Rusj.S.skjerm, oppsett: JSON.stringify(Rusj.S.oppsett || null) })`);
  t.sjekk(v.paNett && v.hash === "" && !v.ark && v.kall === 0 && /\S/.test(v.toast) && v.oppsett === for_, `#variant=${variant} midt i en kamp på nett: ${JSON.stringify(v)} (ventet en beskjed, ingen spørsmål og at spillets variant-krok ikke ble kalt)`);
  if (t.norsk) t.sjekk(v.toast === "Forlat kampen du er i først.", `Beskjeden i en kamp på nett: «${v.toast}»`);
  await t.bilde(`variant-${variant}-nettkamp`);
  // Out of the match: the game on this phone is as it was saved.
  await t.js(`(() => { Rusj._nettBytt(false); Rusj.gaTil(Rusj.app.hjem || "hjem"); })()`);
  await t.sov(300);
  const etter = await t.js(`({ paNett: Rusj.paNett(), lagret: localStorage.getItem(${JSON.stringify(t.nokkel(t.id))} + ".v" + (Rusj.app.versjon || 1)) })`);
  // (its setup and which game is on the table – a phone player may have moved meanwhile)
  const kjerne = (x) => {
    const s = JSON.parse(x || "{}");
    return JSON.stringify([s.oppsett || null, s.spill ? [s.spill.id, s.spill.variant, s.spill.modus, s.spill.type, !!s.spill.ferdig] : null, s.vid || null]);
  };
  t.sjekk(!etter.paNett && kjerne(etter.lagret) === kjerne(lagret), "Spillet på denne mobilen ble endret av en variantlenke midt i en kamp på nett");
}
