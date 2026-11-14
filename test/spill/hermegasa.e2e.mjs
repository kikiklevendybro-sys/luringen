// Hermegåsa (follow the pattern). Runs in every edition: texts are checked in Norwegian only.
// 1 Home, rules, setup: two ways to play, three levels.
// 2 Alone on Lett: copy three rounds (one with the number keys); taps wait while the goose shows;
//   a reload in the middle of a round shows the row again; back + «Fortsett»; a slip costs a
//   feather and the row is shown again; out of feathers the go ends: the result and the record.
// 3 Together, three players on Middels: a gate before each go, each their own row, the longest
//   row wins «Kåringen» and the result goes to «Kveldens gjeng».
// 4 Vanskelig: six pads fit the screen.
export default async function (t) {
  const spillet = async () => (await t.tilstand()).spill;
  const din = () => t.vent("Rusj.S.spill && Rusj.S.spill.fase === 'din' && !document.querySelector('.hg-brett.viser')", 25000);
  const rad = () => t.js("Hermegasa.rad()");
  const brikke = (b) => `.hg-brikke[data-v="${b}"]`;
  // Copy the round that is shown now (with clicks or with the number keys).
  async function kopier(medTaster) {
    await din();
    for (const b of await rad()) {
      if (medTaster) await t.js(`document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "${b + 1}", bubbles: true }))`);
      else await t.klikk(brikke(b), 60);
      await t.sov(60);
    }
    await t.sov(300);
  }
  // A wrong pad at the start of the round.
  async function bom() {
    await din();
    const [forste] = await rad();
    await t.klikk(brikke((forste + 1) % 4), 200);
  }
  const passer = async (hvor) => {
    t.sjekk(await t.js("document.documentElement.scrollHeight <= window.innerHeight + 1"), `Siden scroller (${hvor})`);
    const ut = await t.js(`Array.from(document.querySelectorAll(".hg-brikke")).filter((b) => { const r = b.getBoundingClientRect(); return r.bottom > innerHeight + 1 || r.right > innerWidth + 1 || r.left < -1 || r.top < 0; }).length`);
    t.sjekk(ut === 0, `${ut} brikker stikker utenfor skjermen (${hvor})`);
    const str = await t.js(`document.querySelector(".hg-brikke").getBoundingClientRect().width`);
    t.sjekk(str >= 70, `Brikkene er for små (${Math.round(str)} px, ${hvor})`);
  };

  // ---------- 1 Home, rules, setup ----------
  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C"] });
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  await t.bilde("hjem");
  await t.klikk("#reglerknapp");
  await t.bilde("regler");
  await t.klikk('#ark [data-h="lukk-ark"]');
  await t.klikk('[data-h="nytt"]');
  t.sjekk((await t.antall('[data-h="modus"]')) === 2 && (await t.antall('[data-h="niva"]')) === 3, "Oppsettet skal ha to måter å spille på og tre nivåer");
  t.sjekk(!(await t.finnes("#spillerboks")), "«Alene» viser en spillerliste");
  await t.bilde("oppsett", true);

  // ---------- 2 Alone on Lett ----------
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.hg-brett')");
  t.sjekk((await t.antall(".hg-brikke")) === 4, "Lett skal ha fire brikker");
  await t.sov(1200);
  await t.bilde("gasa-viser");
  // A tap while the goose shows counts for nothing.
  await t.klikk(brikke(0), 50);
  let sp = await spillet();
  t.sjekk(sp.steg === 0 && sp.sjanser === 2, "Et trykk mens gåsa viser ble telt");
  await passer("Lett");
  await kopier();
  await kopier(true);
  sp = await spillet();
  t.sjekk(sp.runde === 3 && sp.sjanser === 2, `To runder ble ikke godkjent (runde ${sp.runde})`);
  await din();
  await t.bilde("din-tur");
  // One right tap, then reload: the goose shows the round again from the start.
  const [en] = await rad();
  await t.klikk(brikke(en), 150);
  t.sjekk((await spillet()).steg === 1, "Et riktig trykk ble ikke telt");
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.vent("document.querySelector('.hg-brett')");
  sp = await spillet();
  t.sjekk(sp.runde === 3 && sp.steg === 0, `Omlasting midt i en runde: runde ${sp.runde}, steg ${sp.steg}`);
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('[data-h="fortsett"]'), "Mangler «Fortsett» etter å ha gått tilbake");
  await t.bilde("hjem-fortsett");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('.hg-brett')");
  await kopier();
  // A slip: a feather is used and the row is shown again (no new pad).
  await bom();
  await t.sov(600);
  await t.bilde("bom");
  sp = await spillet();
  t.sjekk(sp.sjanser === 1 && sp.runde === 4 && sp.fase === "vis", `En bom brukte ikke en fjær (${JSON.stringify({ s: sp.sjanser, r: sp.runde, f: sp.fase })})`);
  await kopier();
  await bom();
  await bom();
  await t.vent("document.querySelector('.skjerm-slutt')", 9000);
  await t.sov(500);
  await t.bilde("resultat", true);
  let s = await t.tilstand();
  t.sjekk(s.spill.ferdig && s.spill.poeng[0] === 4 && s.rekorder["1"] === 4, `Resultatet ble feil (${JSON.stringify({ p: s.spill.poeng, r: s.rekorder })})`);
  t.sjekk(!t.norsk || /4/.test(await t.tekst(".hg-resultat")), "Resultatet viser ikke hvor mange du husket");

  // ---------- 3 Together ----------
  await t.klikk('.lenkerad [data-h="nytt"]');
  await t.klikk('[data-h="modus"][data-v="sammen"]');
  await t.klikk('[data-h="spiller-legg-til"]');
  await t.klikk('[data-h="niva"][data-v="2"]');
  await t.bilde("oppsett-sammen", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.skjerm-tur')");
  t.sjekk((t.norsk ? /Testspiller A/ : /Testspiller A|<x-q>/).test(await t.tekst("#skjerm")) || !t.norsk, "Porten viser ikke hvem sin tur det er");
  await t.bilde("port");
  // A: two rounds, then two slips (Middels has one spare chance).
  await t.klikk('[data-h="klar"]');
  await kopier();
  await kopier();
  await bom();
  await bom();
  await t.vent("document.querySelector('.skjerm-tur')", 9000);
  await t.bilde("port-b");
  sp = await spillet();
  t.sjekk(sp.poeng[0] === 2 && sp.spiller === 1, `Spiller A fikk ikke 2 (${JSON.stringify(sp.poeng)})`);
  // B: three rounds. The row is not the same as A's.
  await t.klikk('[data-h="klar"]');
  await kopier();
  await kopier();
  await kopier();
  await bom();
  await bom();
  await t.vent("document.querySelector('.skjerm-tur')", 9000);
  // C: one round.
  await t.klikk('[data-h="klar"]');
  await kopier();
  await bom();
  await bom();
  await t.vent("document.querySelector('.skjerm-slutt')", 9000);
  await t.sov(500);
  await t.bilde("kaaringen", true);
  s = await t.tilstand();
  t.sjekk(s.spill.poeng.join() === "2,3,1" && new Set(s.spill.fro).size === 3, `Sammen ble feil (${JSON.stringify(s.spill.poeng)})`);
  t.sjekk(!t.norsk || /Testspiller B vinner/.test(await t.tekst("#skjerm h1")), "Vinneren vises ikke");
  const kveld = await t.js(`(JSON.parse(localStorage.getItem("${t.nokkel("kveld")}") || "{}").spill || []).filter((x) => x.id === "hermegasa")`);
  t.sjekk(kveld.length === 1, "Resultatet ble ikke sendt til Kveldens gjeng");

  // ---------- 4 Vanskelig: six pads ----------
  await t.klikk('.lenkerad [data-h="nytt"]');
  await t.klikk('[data-h="modus"][data-v="alene"]');
  await t.klikk('[data-h="niva"][data-v="3"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.hg-brett')");
  t.sjekk((await t.antall(".hg-brikke")) === 6, "Vanskelig skal ha seks brikker");
  await din();
  await passer("Vanskelig");
  await t.bilde("vanskelig");
}
