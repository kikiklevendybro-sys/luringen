// Pusen (children's card games). Runs in every edition: texts are checked in Norwegian only.
// The phone players are sped up (window.Pusen.fart) so whole games fit in the run.
// 1 Home, rules, setup: four games as tiles, against the phone or together.
// 2 Svarteper against the phone: draw from its face-down hand until the end; pairs go away;
//   a reload and back + «Fortsett» keep the game; the one left holds the cat; the win is counted.
// 3 Fisk against two phone players: choose whom to ask (a tap on a seat), ask with a tap on an
//   animal; the phones play by themselves; all ten sets are laid; the result.
// 4 Størst vinner against the phone: ten battles, every card won by someone.
// 5 Snapp, two on one phone face to face: turn in turn, a snap without a pair rests the button, a
//   snap on a pair wins the pile; «Kåringen» and Kveldens gjeng.
// 6 Svarteper, three on one phone: the gate before every turn, a reload shows the gate again.
export default async function (t) {
  const spillet = async () => (await t.tilstand()).spill;
  const fort = () => t.js("window.Pusen.fart = 0.12");
  const passer = async (hvor) => {
    t.sjekk(await t.js("document.documentElement.scrollWidth <= window.innerWidth"), `Bordet er for bredt (${hvor})`);
    const ut = await t.js(`Array.from(document.querySelectorAll(".pu-bord button")).filter((b) => { const r = b.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1); }).length`);
    t.sjekk(ut === 0, `${ut} knapper stikker ut på siden (${hvor})`);
  };
  async function nyttSpill(oppsett, navn) {
    await t.klikk("#tilbake");
    await t.vent("document.querySelector('[data-h=\"nytt\"]')");
    await t.klikk('[data-h="nytt"]');
    if (await t.finnes('#ark [data-h="ark-svar"][data-v="ja"]')) await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]', 300);
    await t.vent("document.querySelector('[data-h=\"modus\"]')");
    await t.klikk(`[data-h="modus"][data-v="${oppsett.modus}"]`);
    await t.klikk(`[data-h="mot"][data-v="${oppsett.mot}"]`);
    if (oppsett.mobiler) await t.klikk(`[data-h="mobiler"][data-v="${oppsett.mobiler}"]`);
    if (oppsett.niva) await t.klikk(`[data-h="niva"][data-v="${oppsett.niva}"]`);
    for (let i = 2; i < (oppsett.antall || 0); i++) await t.klikk('[data-h="spiller-legg-til"]');
    if (navn) await t.bilde(navn, true);
    await t.klikk('[data-h="start"]');
    await t.vent("document.querySelector('.pu-bord, .gi-til')");
    await fort();
  }
  const slutt = () => t.vent("document.querySelector('.skjerm-slutt')", 60000);

  // ---------- 1 Home, rules, setup ----------
  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C"] });
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  await t.bilde("hjem");
  await t.klikk("#reglerknapp");
  t.sjekk((await t.antall("#ark .steg li")) === 4, "Reglene skal ha ett steg for hvert av de fire spillene");
  await t.bilde("regler");
  await t.klikk('#ark [data-h="lukk-ark"]');
  await t.klikk('[data-h="nytt"]');
  t.sjekk((await t.antall('[data-h="modus"]')) === 4 && (await t.antall('[data-h="mot"]')) === 2, "Oppsettet skal ha fire spill og to måter å spille på");
  await t.bilde("oppsett", true);

  // ---------- 2 Svarteper against the phone ----------
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.pu-bord')");
  await fort();
  let sp = await spillet();
  t.sjekk(sp.modus === "svarte" && sp.n === 2, "Svarteper mot mobilen startet ikke");
  const parFor = sp.r.par[0].length + sp.r.par[1].length;
  t.sjekk(sp.r.hender.flat().length + parFor * 2 === 21, "Svarteper skal ha 21 kort");
  await passer("svarteper");
  await t.bilde("svarteper");
  let runder = 0;
  let trukket = 0;
  let lastet = false;
  while (!(await t.js("Rusj.S.spill.ferdig || Rusj.S.spill.r.taper != null")) && runder < 80) {
    runder++;
    if (await t.js("Rusj.S.spill.r.tur === 0 && !!document.querySelector('[data-h=\"trekk\"]')")) {
      await t.klikk('[data-h="trekk"]', 120);
      trukket++;
      if (trukket === 1 && !lastet && !(await t.js("Rusj.S.spill.r.taper != null"))) {
        lastet = true;
        const for_ = (await spillet()).r.hender.map((h) => h.length).join();
        await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
        await fort();
        t.sjekk((await spillet()).r.hender.map((h) => h.length).join() === for_, "Svarteper mistet kortene etter omlasting");
        await t.klikk("#tilbake");
        t.sjekk(await t.finnes('[data-h="fortsett"]'), "Mangler «Fortsett» etter å ha gått tilbake");
        await t.bilde("hjem-fortsett");
        await t.klikk('[data-h="fortsett"]');
        await t.vent("document.querySelector('.pu-bord')");
        await fort();
      }
    } else await t.sov(150);
  }
  await slutt();
  await t.sov(400);
  await t.bilde("svarteper-slutt", true);
  let s = await t.tilstand();
  t.sjekk(s.spill.ferdig && s.spill.r.taper >= 0 && s.spill.r.hender[s.spill.r.taper].join() === "40", "Den som er igjen, har ikke katten");
  t.sjekk(s.seirer.svarte.spilt === 1, "Spillet mot mobilen ble ikke telt");
  t.sjekk(lastet || trukket < 2, "Svarteper ble ferdig før omlastingen ble prøvd");

  // ---------- 3 Fisk against two phone players ----------
  await nyttSpill({ modus: "fisk", mot: "mobil", mobiler: 2, niva: 3 }, "oppsett-fisk");
  sp = await spillet();
  t.sjekk(sp.n === 3 && sp.r.hender.every((h) => h.length <= 5), "Fisk for tre skal gi fem kort hver");
  let spurt = false;
  for (let i = 0; i < 400 && !(await t.js("Rusj.S.spill.ferdig")); i++) {
    if (await t.js("Rusj.S.spill.r.tur === 0 && !!document.querySelector('[data-h=\"sporr\"]')")) {
      if (!spurt) {
        // Choose the second phone player first, then ask.
        if (await t.finnes('[data-h="velg"][data-v="2"]')) {
          await t.klikk('[data-h="velg"][data-v="2"]', 80);
          t.sjekk((await spillet()).valgt === 2, "Et trykk på en mobilspiller valgte den ikke");
          await t.bilde("fisk-velg");
        }
        spurt = true;
      }
      await t.klikk('[data-h="sporr"]', 80);
    } else await t.sov(120);
  }
  await slutt();
  await t.sov(400);
  await t.bilde("fisk-slutt", true);
  s = await t.tilstand();
  t.sjekk(s.spill.r.sett.flat().length === 10, `Fisk endte ikke med ti sett (${s.spill.r.sett.flat().length})`);

  // ---------- 4 Størst vinner ----------
  await nyttSpill({ modus: "krig", mot: "mobil" });
  await passer("størst vinner");
  for (let i = 0; i < 30 && !(await t.js("Rusj.S.spill.ferdig || Pusen.Krig.ferdig(Rusj.S.spill.r)")); i++) {
    await t.klikk('.pu-side-bunn [data-h="snu"]', 150);
    if (i === 1) await t.bilde("storst-vinner");
  }
  await slutt();
  await t.sov(400);
  await t.bilde("storst-vinner-slutt", true);
  s = await t.tilstand();
  t.sjekk(s.spill.r.vunnet[0] + s.spill.r.vunnet[1] === 20, "Ikke alle kortene ble vunnet");

  // ---------- 5 Snapp, two on one phone ----------
  await nyttSpill({ modus: "snap", mot: "sammen" }, "oppsett-snapp");
  t.sjekk((await spillet()).mot === "sammen" && (await t.antall(".pu-snapp")) === 2, "To spillere skal ha hver sin SNAPP-knapp");
  // Make sure of one pair at once (the shuffle only makes pairs likely): the second card turned
  // gets the same animal as the first.
  await t.js(`(() => {
    const r = Rusj.S.spill.r, a = r.hender[0][0];
    const i = r.hender[0].findIndex((k, x) => x > 0 && k % 10 === a % 10);
    const j = r.hender[1].findIndex((k) => k % 10 === a % 10);
    if (j > 0) [r.hender[1][0], r.hender[1][j]] = [r.hender[1][j], r.hender[1][0]];
    else if (j < 0 && i > 0) [r.hender[1][0], r.hender[0][i]] = [r.hender[0][i], r.hender[1][0]];
    Rusj.lagre();
  })()`);
  await passer("snapp");
  let snappet = false;
  let feilSnapp = false;
  for (let i = 0; i < 60 && !(await t.js("Rusj.S.spill.ferdig")); i++) {
    const like = await t.js("Pusen.Snap.like(Rusj.S.spill.r)");
    if (like) {
      if (!snappet) await t.bilde("snapp-like");
      // (The last pair of the game: the end comes after a moment if nobody snaps.)
      if (await t.finnes('.pu-side-topp [data-h="snapp"]')) {
        await t.klikk('.pu-side-topp [data-h="snapp"]', 200);
        snappet = true;
      }
      continue;
    }
    if (!feilSnapp && (await t.js("Rusj.S.spill.r.midt.length >= 2"))) {
      await t.klikk('.pu-side-bunn [data-h="snapp"]', 100);
      t.sjekk(await t.js("document.querySelector('.pu-side-bunn [data-h=\"snapp\"]').disabled"), "En SNAPP uten like dyr hvilte ikke knappen");
      feilSnapp = true;
      await t.sov(1300);
    }
    const tur = await t.js("Rusj.S.spill.r.tur");
    const sel = `${tur === 0 ? ".pu-side-bunn" : ".pu-side-topp"} [data-h="snu"]`;
    if (await t.finnes(sel)) await t.klikk(sel, 120);
    else await t.sov(200);
  }
  await slutt();
  await t.sov(400);
  await t.bilde("snapp-kaaringen", true);
  s = await t.tilstand();
  t.sjekk(snappet && s.spill.r.vunnet[1] > 0, "En SNAPP på like dyr vant ikke bunken");
  const kveld = await t.js(`(JSON.parse(localStorage.getItem("${t.nokkel("kveld")}") || "{}").spill || []).filter((x) => x.id === "pusen")`);
  t.sjekk(kveld.length === 1, "Snapp sammen ble ikke sendt til Kveldens gjeng");

  // ---------- 6 Svarteper, three on one phone ----------
  await nyttSpill({ modus: "svarte", mot: "sammen", antall: 3 });
  t.sjekk(await t.finnes(".gi-til"), "Svarteper sammen starter ikke med «Gi mobilen til»");
  await t.bilde("port");
  for (let i = 0; i < 400 && !(await t.js("Rusj.S.spill.ferdig || Rusj.S.spill.r.taper != null")); i++) {
    if (await t.finnes('[data-h="vis"]')) {
      await t.klikk('[data-h="vis"]', 100);
      if (i === 0) {
        await t.bilde("svarteper-sammen");
        // A reload while the hand shows: the gate again.
        await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
        t.sjekk(await t.finnes(".gi-til"), "Omlasting viste kortene uten porten");
        await t.klikk('[data-h="vis"]', 100);
      }
    } else if (await t.finnes('[data-h="trekk"]')) await t.klikk(`[data-h="trekk"][data-v="${i % (await t.antall('[data-h="trekk"]'))}"]`, 100);
    else if (await t.finnes('[data-h="videre"]')) await t.klikk('[data-h="videre"]', 100);
    else await t.sov(200);
  }
  await slutt();
  await t.sov(400);
  await t.bilde("svarteper-sammen-slutt", true);
  s = await t.tilstand();
  t.sjekk(s.spill.ferdig && s.spill.r.hender[s.spill.r.taper].join() === "40", "Svarteper sammen endte ikke med katten hos én");
}
