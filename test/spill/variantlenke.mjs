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
  // A variant the game does not have: the usual start, nothing asked, the address clean.
  v = await apne("finnes-ikke");
  t.sjekk(v.hash === "" && !v.ark, `En ukjent variant i lenka rydder ikke adressen, eller spør om noe (${JSON.stringify({ hash: v.hash, ark: v.ark })})`);

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
}
