// Skattejegeren (treasure hunt). Runs in every edition: texts are checked in Norwegian only (t.norsk).
// 1 Home, rules, setup: three ways, the themes, three ages, inside/outside, the number of posts.
// 2 Code words for the youngest, inside and out, 8 posts: the plan has 8 different places that
//   fit; a post is moved to another place; a clue of one's own (with markup) shows as text;
//   «Bland postene på nytt» asks first.
// 3 Printing: the code slips and the clue cards (N + 1), a paper view where only the cards show,
//   and «Skriv ut» calls the browser's print.
// 4 The hunt with pictures: a wrong picture is greyed out, the right one opens the next clue; a
//   reload and back + «Fortsett» keep the post; «Trenger dere hjelp?» shows the answer; «Angre»
//   goes back; the treasure is found; the result, the sticker and the «sist» line.
// 5 Code words typed (10–12): a wrong word is refused, the right one (lower case, without æøå) opens.
// 6 Printed cards only: «Skatten er funnet!» from the plan gives the result without a time.
export default async function (t) {
  const jakt = async () => (await t.tilstand()).jakt;
  const svarJa = async () => {
    await t.vent(`document.querySelector('#ark:not([hidden]) [data-h="ark-svar"][data-v="ja"]')`);
    await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]', 300);
  };
  // The code word (or picture index) of the post the children are looking for now.
  const riktig = () =>
    t.js(`(() => { const j = Rusj.S.jakt; const tema = RUSJ_DATA.temaer.temaer.find((x) => x.id === j.tema); const p = j.poster[j.na]; return { k: p.k, o: tema.koder[p.k].o }; })()`);
  const ingenStedTo = (j) => new Set(j.poster.map((p) => p.s)).size === j.poster.length;
  async function oppsett(o) {
    await t.vent("document.querySelector('[data-h=\"maate\"]')");
    await t.klikk(`[data-h="maate"][data-v="${o.maate}"]`);
    if (o.tema) await t.klikk(`[data-h="tema"][data-v="${o.tema}"]`);
    await t.klikk(`[data-h="alder"][data-v="${o.alder}"]`);
    await t.klikk(`[data-h="hvor"][data-v="${o.hvor}"]`);
    for (let n = (await t.tilstand()).oppsett.antall; n !== o.antall; n = (await t.tilstand()).oppsett.antall) {
      await t.klikk(`[data-h="antall"][data-v="${n < o.antall ? 1 : -1}"]`, 60);
    }
  }

  // ---------- 1 Home, rules, setup ----------
  await t.start();
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  await t.bilde("hjem");
  await t.klikk("#reglerknapp");
  t.sjekk((await t.antall("#ark .steg li")) === 3, "Reglene skal ha tre steg");
  await t.bilde("regler");
  await t.klikk('#ark [data-h="lukk-ark"]');
  await t.klikk('[data-h="nytt"]');
  t.sjekk((await t.antall('[data-h="maate"]')) === 3, "Oppsettet skal ha tre måter");
  t.sjekk((await t.antall('[data-h="tema"]')) === 6, "Oppsettet skal ha seks temaer");
  t.sjekk((await t.antall('[data-h="alder"]')) === 3 && (await t.antall('[data-h="hvor"]')) === 3, "Oppsettet skal ha tre aldre og tre steder");
  t.sjekk(!t.norsk || (await t.tekst("#skjerm h1")).trim() === "Gjør klart", "Oppsettet heter ikke «Gjør klart»");
  await t.bilde("oppsett", true);

  // ---------- 2 The plan: code words for the youngest, inside and out, 8 posts ----------
  await oppsett({ maate: "kode", tema: "rom", alder: 4, hvor: "begge", antall: 8 });
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.sk-poster')");
  let j = await jakt();
  t.sjekk(j && j.poster.length === 8 && j.alder === 4 && j.maate === "kode" && j.tema === "rom", `Jakten ble ikke laget som valgt (${JSON.stringify(j && { n: j.poster.length, a: j.alder })})`);
  t.sjekk(ingenStedTo(j), "Samme gjemmested brukes to ganger");
  const hvor = await t.js(`Rusj.S.jakt.poster.map((p) => RUSJ_DATA.steder.steder.find((s) => s.id === p.s).hvor)`);
  t.sjekk(hvor.includes("inne") && hvor.includes("ute"), `«Inne og ute» ga ikke begge deler (${hvor.join(",")})`);
  t.sjekk(hvor.filter((h, i) => i > 0 && h !== hvor[i - 1]).length === 1, `Barna må ut og inn flere ganger (${hvor.join(",")})`);
  t.sjekk((await t.antall(".sk-post")) === 9, "Planen skal vise start og åtte poster");
  t.sjekk((await t.antall(".sk-kode-linje")) === 7, "Kodemodus skal vise kodeord ved alle poster unntatt skatten");
  await t.bilde("plan", true);
  // Move post 2 to another place.
  const forSted = j.poster[1].s;
  await t.klikk('[data-h="endre"][data-v="1"]');
  await t.vent("document.querySelector('#ark .sk-stedvalg')");
  t.sjekk((await t.antall('#ark .sk-stedvalg[aria-pressed="true"]')) === 1, "Arket viser ikke hvilket sted posten har nå");
  const arkTopp = await t.js(`[document.querySelector("#ark-innhold").scrollTop, document.activeElement && document.activeElement.outerHTML.slice(0, 80)]`);
  t.sjekk(arkTopp[0] < 4, `Arket åpner ikke øverst (${JSON.stringify(arkTopp)})`);
  await t.bilde("endre-post");
  await t.klikk('#ark .sk-stedvalg[aria-pressed="false"]');
  j = await jakt();
  t.sjekk(j.poster[1].s !== forSted && ingenStedTo(j) && j.endret, "Posten fikk ikke et nytt sted");
  // A clue of one's own, with markup that must stay text.
  await t.klikk('[data-h="endre"][data-v="2"]');
  await t.vent("document.querySelector('#sk-egen-gate')");
  await t.skrivInn("#sk-egen-sted", "Testspiller A <b>7</b>");
  await t.skrivInn("#sk-egen-gate", "Testspiller B <i>8</i>!");
  await t.klikk('#ark .sk-egen button[type="submit"]');
  j = await jakt();
  t.sjekk(j.poster[2].e && j.poster[2].e.gate.includes("<i>"), "Den egne ledetråden ble ikke lagret");
  t.sjekk((await t.antall(".sk-poster b, .sk-poster i")) === 0 && (await t.tekst(".sk-poster")).includes("<b>7</b>"), "Egen tekst ble tolket som HTML");
  await t.bilde("egen-ledetrad");
  // Shuffle asks first, then gives new places and drops the changes.
  await t.klikk('[data-h="bland"]');
  await svarJa();
  j = await jakt();
  t.sjekk(!j.endret && !j.poster.some((p) => p.e) && j.poster.length === 8 && ingenStedTo(j), "«Bland postene på nytt» laget ikke nye poster");

  // ---------- 3 Printing ----------
  await t.klikk('[data-h="til-utskrift"][data-v="koder"]');
  await t.vent("document.querySelector('.sk-lapp')");
  t.sjekk((await t.antall(".sk-lapp")) === 7, "Det skal være én kodelapp for hver post før skatten");
  await t.bilde("kodelapper", true);
  await t.klikk('[data-h="utskrift-type"][data-v="kort"]');
  t.sjekk((await t.antall(".sk-kort")) === 9, "Det skal være ett kort mer enn postene (startkortet og kortet ved skatten)");
  t.sjekk((await t.antall(".sk-kort .sk-kort-bilde")) === 9, "Kortene for de minste skal ha et bilde");
  await t.bilde("kort");
  await t.send("Emulation.setEmulatedMedia", { media: "print" });
  await t.sov(200);
  const papir = await t.js(`(() => {
    const synlig = (el) => !!el && getComputedStyle(el).display !== "none";
    return { topp: synlig(document.querySelector(".topp")), dokk: synlig(document.querySelector("#skjerm .dokk")), ingress: synlig(document.querySelector(".sk-ingress")), kort: Array.from(document.querySelectorAll(".sk-kort")).every(synlig), om: synlig(document.querySelector("#om-spillet")), bg: getComputedStyle(document.body).backgroundColor };
  })()`);
  t.sjekk(!papir.topp && !papir.dokk && !papir.ingress && !papir.om && papir.kort, `På papir skal bare kortene vises (${JSON.stringify(papir)})`);
  t.sjekk(/255, 255, 255/.test(papir.bg), `Papiret er ikke hvitt (${papir.bg})`);
  // (On paper the page is A4 wide; a phone narrower than 390 px only squeezes this preview.)
  if ((await t.js("window.innerWidth")) >= 390) await t.bilde("papir", true);
  await t.send("Emulation.setEmulatedMedia", { media: "" });
  await t.js("window.print = () => { window.__skrevetUt = (window.__skrevetUt || 0) + 1; }");
  await t.klikk('[data-h="skriv-ut"]');
  t.sjekk((await t.js("window.__skrevetUt")) === 1, "«Skriv ut» åpnet ikke utskriften");
  await t.klikk("#tilbake");
  await t.vent("document.querySelector('.sk-poster')");

  // ---------- 4 The hunt with pictures ----------
  await t.klikk('.dokk [data-h="jakt"]');
  await t.vent("document.querySelector('.sk-ledetrad')");
  j = await jakt();
  t.sjekk(j.na === 0 && j.start > 0, "Jakten startet ikke på første ledetråd");
  t.sjekk((await t.antall(".sk-bildeknapp")) === 4, "De minste skal velge mellom fire bilder");
  t.sjekk(await t.friForDokk(".sk-gate"), "Ledetråden ligger under knappene");
  await t.bilde("jakt");
  let r = await riktig();
  const feil = await t.js(`Array.from(document.querySelectorAll(".sk-bildeknapp")).map((b) => Number(b.dataset.v)).find((v) => v !== ${r.k})`);
  await t.klikk(`.sk-bildeknapp[data-v="${feil}"]`);
  t.sjekk((await jakt()).na === 0 && (await t.js(`document.querySelector('.sk-bildeknapp[data-v="${feil}"]').disabled`)), "Et feil bilde ble ikke grået ut");
  await t.klikk(`.sk-bildeknapp[data-v="${r.k}"]`, 400);
  t.sjekk((await jakt()).na === 1, "Riktig bilde åpnet ikke neste ledetråd");
  await t.bilde("ledetrad-2");
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.vent("document.querySelector('.sk-ledetrad')");
  t.sjekk((await jakt()).na === 1, "Ledetråden forsvant etter omlasting");
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('[data-h="fortsett"]'), "Mangler «Fortsett» etter å ha gått tilbake");
  await t.bilde("hjem-fortsett");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('.sk-ledetrad')");
  t.sjekk((await jakt()).na === 1, "«Fortsett» startet ikke der jakten var");
  await t.klikk('[data-h="hjelp"]');
  await svarJa();
  await t.vent("document.querySelector('#ark .sk-svar')");
  t.sjekk((await jakt()).hjelp === 1, "Hjelpen ble ikke telt");
  await t.bilde("svaret");
  await t.klikk('#ark [data-h="lukk-ark"]');
  await t.klikk('[data-h="angre"]');
  t.sjekk((await jakt()).na === 0, "«Angre» gikk ikke tilbake til forrige ledetråd");
  for (let i = 0; i < 7; i++) {
    r = await riktig();
    await t.klikk(`.sk-bildeknapp[data-v="${r.k}"]`, 250);
  }
  j = await jakt();
  t.sjekk(j.na === 7 && !(await t.finnes(".sk-bildeknapp")), `Siste post skal ikke ha kodeord (na ${j.na})`);
  await t.bilde("siste-ledetrad");
  await t.klikk('.dokk [data-h="funnet"]');
  await t.vent("document.querySelector('.skjerm-slutt')");
  await t.sov(400);
  let s = await t.tilstand();
  t.sjekk(s.jakt.ferdig && s.funnet === 1 && s.sist && s.sist.poster === 8 && s.jakt.sek >= 1, `Resultatet ble ikke lagret (${JSON.stringify({ f: s.funnet, sist: s.sist })})`);
  t.sjekk((await t.antall(".sk-tall")) === 2, "Resultatet skal vise tid og poster");
  const merker = await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("merker")}") || "{}")`);
  t.sjekk(!!merker["skattejegeren-skatt"], "Klistremerket ble ikke gitt");
  await t.bilde("skatten", true);
  await t.klikk("#tilbake");
  await t.vent("document.querySelector('.sk-sist')");
  await t.bilde("hjem-sist");

  // ---------- 5 Typed code words for 10–12 ----------
  await t.klikk('[data-h="nytt"]');
  await oppsett({ maate: "kode", tema: "detektiv", alder: 10, hvor: "inne", antall: 4 });
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.sk-poster')");
  await t.klikk('.dokk [data-h="jakt"]');
  await t.vent("document.querySelector('#sk-kode')");
  t.sjekk(!(await t.finnes(".sk-bilde")), "De store skal ikke få bildehint");
  await t.skrivInn("#sk-kode", "feil ord");
  await t.klikk('.sk-kodeform button[type="submit"]');
  t.sjekk((await jakt()).na === 0, "Et feil kodeord låste opp");
  await t.bilde("kodeord");
  for (let i = 0; i < 3; i++) {
    r = await riktig();
    const skrevet = r.o.toLowerCase().replace(/æ/g, "ae").replace(/ø/g, "o").replace(/å/g, "a");
    await t.skrivInn("#sk-kode", ` ${skrevet} `);
    await t.klikk('.sk-kodeform button[type="submit"]', 250);
    t.sjekk((await jakt()).na === i + 1, `Kodeordet «${skrevet}» låste ikke opp`);
  }
  await t.klikk('.dokk [data-h="funnet"]');
  await t.vent("document.querySelector('.skjerm-slutt')");

  // ---------- 6 Printed cards only, outdoors ----------
  await t.klikk('.dokk [data-h="igjen"]');
  await t.vent("document.querySelector('.sk-poster')");
  t.sjekk((await jakt()).maate === "kode" && (await jakt()).poster.length === 4, "«Ny skattejakt» brukte ikke samme oppsett");
  await t.klikk('[data-h="til-oppsett"]');
  await oppsett({ maate: "utskrift", tema: "pirat", alder: 7, hvor: "ute", antall: 3 });
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.sk-poster')");
  j = await jakt();
  const ute = await t.js(`Rusj.S.jakt.poster.every((p) => RUSJ_DATA.steder.steder.find((s) => s.id === p.s).hvor === "ute")`);
  t.sjekk(j.poster.length === 3 && ute, "En utejakt har steder inne");
  await t.bilde("plan-utskrift");
  await t.klikk('[data-h="skatt-funnet"]');
  await t.vent("document.querySelector('.skjerm-slutt')");
  t.sjekk((await t.antall(".sk-tall")) === 1, "En utskrevet jakt har ingen tid å vise");
  s = await t.tilstand();
  t.sjekk(s.funnet === 3, "Skattene ble ikke telt");
}
