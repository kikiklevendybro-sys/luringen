// Varulven: both ways of playing, on one phone.
// THE CLASSIC GAME
// Game 1 (6 players, 1 wolf, seer, doctor, «Fredelig første natt» on by default): role pass with a
// reload, a peaceful night 1 (with a reload mid-night), day 1 voting out an innocent who becomes the
// game leader, night 2 where the doctor saves the wolves' target, a day without a verdict, night 3
// with a death, and day 3 voting out the wolf → the village wins. «Kåringen»: the tally, «Kveldens
// gjeng» registered once, «Del resultatet», a reload.
// Game 2 (hunter on, peaceful night off): a death on night 1, the hunter is voted out and shoots,
// the wolves win. Game 3: «Avslutt» → «Kåringen» without a winner. Plus 12 players in setup, "forgot
// your role", back + continue, the screen-reader focus on the night screens and a 320 px check.
// «ÉN NATT»
// Session A (4 players, 3 rounds): the roles as specified, a reload with a secret on the screen, the
// swapper's swap at dawn, «Glemt hva du så?», the village wins (the wolf is pointed out), «Angre»,
// the wolves win (nobody is pointed out, the swapper has become the wolf), a tie in the vote,
// «Kåringen» with podium, «Kveldens gjeng» once, «Del resultatet», a reload.
// Session B (7 players): two wolves who see each other, the troublemaker's two names, the swaps in
// the right order (the swapper's first), «Avslutt» from the reveal → «Kåringen» with one round.
// Then «Avslutt» before any round is finished, and a damaged saved state in both ways of playing.
const NAVN = ["Testspiller A", "Testspiller B", "Testspiller C", "Testspiller D", "Testspiller E", "Testspiller F"];
const ROLLENAVN = { varulv: "Varulv", synsk: "Synsk", lege: "Lege", jeger: "Jeger", landsby: "Landsbyboer" };
const NOKKEL = "rusj.varulven.v1";

const spill = async (t) => (await t.tilstand()).spill;
const lever = (sp) => sp.levende.map((l, i) => (l ? i : -1)).filter((i) => i >= 0);
const kveld = (t) => t.js(`(JSON.parse(localStorage.getItem("rusj.kveld") || "null") || { spill: [] }).spill.filter((s) => s.id === "varulven")`);
const ren = (s) => String(s).replace(/\s+/g, " ").trim();

// Hold a card, read its back, let go. Cards whose content is taller than the card are noted.
const klipte = [];
const erKlipt = (t, sel) =>
  t.js(`Array.from(document.querySelectorAll(${JSON.stringify(`${sel} .mappe-forside, ${sel} .mappe-bakside`)})).some((b) => b.scrollHeight > b.clientHeight + 2)`);
async function les(t, sel) {
  const slipp = await t.hold(sel, 650);
  const tekst = await t.tekst(`${sel} .mappe-bakside`);
  if (await erKlipt(t, sel)) klipte.push(sel);
  await slipp();
  return tekst;
}

// Two real finger taps 90 ms apart (like a nervous double tap).
async function dobbeltrykk(t, sel) {
  const p = await t.js(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
  for (let i = 0; i < 2; i++) {
    await t.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: p.x, y: p.y }] });
    await t.sov(30);
    await t.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    if (i === 0) await t.sov(60);
  }
  await t.sov(500);
}

// What has the focus, and the screen's heading (what a screen reader says on arrival).
const fokus = (t) => t.js(`({ id: document.activeElement && document.activeElement.id, tag: document.activeElement && document.activeElement.tagName, h1: (document.querySelector("#skjerm h1") || {}).textContent || "" })`);

// The confirm sheet: its two buttons, then answer.
async function ark(t, svar) {
  await t.vent(`document.querySelector('#ark:not([hidden]) [data-h="ark-svar"][data-v="${svar}"]')`);
  const knapper = await t.js(`Array.from(document.querySelectorAll('#ark [data-h="ark-svar"]')).map((b) => b.textContent.trim())`);
  await t.klikk(`#ark [data-h="ark-svar"][data-v="${svar}"]`);
  return knapper;
}

// Everyone holds to see their role. Optional reload after `omlast` players.
async function rollerunde(t, o = {}) {
  const sp = await spill(t);
  for (let i = 0; i < sp.n; i++) {
    const sel = `.mappe[data-mappe="r${i}"]`;
    await t.vent(`document.querySelector('${sel}')`);
    t.sjekk(await t.finnes('[data-h="vist"]:disabled'), "«Ferdig» skal være låst til rollen er sett");
    if (i === 0) t.sjekk(await t.friForDokk(`${sel} .mappe-finger`), "Instruksen på rollekortet ligger bak knappen nederst");
    let tekst;
    if (i === 0 && o.bilder) {
      await t.bilde("roller-gi");
      const slipp = await t.hold(sel, 650);
      tekst = await t.tekst(`${sel} .mappe-bakside`);
      if (await erKlipt(t, sel)) klipte.push(sel);
      await t.bilde("roller-kort");
      await slipp();
    } else {
      tekst = await les(t, sel);
    }
    t.sjekk(tekst.includes(ROLLENAVN[sp.roller[i]]), `Spiller ${i + 1} skulle sett rollen ${ROLLENAVN[sp.roller[i]]}, men kortet viser: ${ren(tekst)}`);
    if (sp.roller[i] === "varulv" && sp.roller.filter((r) => r === "varulv").length === 1) t.sjekk(/eneste varulven/.test(tekst), "Ulven får ikke vite at den er alene");
    await t.vent("!document.querySelector('[data-h=\"vist\"]').disabled", 3000);
    if (o.omlast === i) {
      await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
      t.sjekk(await t.finnes(`${sel}`), "Omlasting midt i rollerunden mistet plassen");
    }
    await t.klikk('[data-h="vist"]');
  }
  await t.vent("document.querySelector('[data-h=\"start-natt\"]')", 6000);
}

// One night: the phone goes around; velg(rolle, meg, spill) decides each pick.
// o: bilder (name prefix for screenshots), omlastVed, dobbeltrykk, sjekk(rolle, meg, sp), fredelig, start(sp)
async function spillNatt(t, velg, o = {}) {
  await t.vent("document.querySelector('[data-h=\"start-natt\"]')");
  if (o.start) await o.start(await spill(t));
  if (o.bilder) await t.bilde(`${o.bilder}-start`);
  await t.klikk('[data-h="start-natt"]');
  const avbildet = new Set();
  let omlastet = false;
  for (let tur = 0; tur < 40; tur++) {
    await t.vent("document.querySelector('[data-h=\"jeg-er\"]') || document.querySelector('.skjerm-morgen')", 8000);
    if (await t.finnes(".skjerm-morgen")) return;
    let sp = await spill(t);
    if (o.omlastVed === sp.tur.pos && !omlastet) {
      omlastet = true;
      await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
      sp = await spill(t);
      t.sjekk(sp.tur.pos === o.omlastVed && (await t.finnes('[data-h="jeg-er"]')), "Omlasting midt i natta gikk ikke tilbake til «Gi mobilen til …»");
      t.sjekk(await t.js("document.documentElement.classList.contains('vu-natt')"), "Nattlooken mangler etter omlasting");
    }
    const meg = sp.tur.rekke[sp.tur.pos];
    const rolle = sp.roller[meg];
    if (o.bilder && tur === 0) await t.bilde(`${o.bilder}-gi`);
    await t.klikk('[data-h="jeg-er"]');
    await t.vent("document.querySelector('[data-h=\"marker\"]')");
    t.sjekk(await t.finnes('[data-h="velg"]:disabled'), "Nattvalget kan bekreftes før et navn er valgt");
    // The focused heading is only the player's name: a screen reader on speaker must not tell the
    // room what the role's question is.
    let f = await fokus(t);
    t.sjekk(f.id === "skjerm-tittel" && f.h1 === NAVN[meg], `Nattspørsmålet: fokus på «${f.tag}#${f.id}», overskriften sier «${f.h1}» (skal bare være navnet)`);
    if (o.sjekk) await o.sjekk(rolle, meg, sp);
    const mal = velg(rolle, meg, sp);
    // A tap only marks a name; mark another name first (a mis-tap), then the right one, then confirm
    if (tur === 0) {
      const annen = await t.js(`Number((Array.from(document.querySelectorAll('[data-h="marker"]:not(:disabled)')).find((b) => Number(b.dataset.v) !== ${mal}) || {}).dataset?.v ?? -1)`);
      if (annen >= 0) await t.klikk(`[data-h="marker"][data-v="${annen}"]`);
    }
    await t.klikk(`[data-h="marker"][data-v="${mal}"]`);
    t.sjekk(await t.finnes(`[data-h="marker"][data-v="${mal}"][aria-pressed="true"]`), "Navnet ble ikke markert");
    const knapp = await t.tekst('[data-h="velg"]');
    const verb = o.fredelig ? { varulv: "Snus på", lege: "Pass på", synsk: "Se på" }[rolle] || "Mistenk" : { varulv: "Ta", lege: "Beskytt", synsk: "Se på" }[rolle] || "Mistenk";
    t.sjekk(knapp.startsWith(verb + " "), `Bekreft-knappen om natta sier «${knapp}» for ${rolle} (ventet «${verb} …»)`);
    if (o.bilder && !avbildet.has(rolle)) await t.bilde(`${o.bilder}-valg-${rolle}`);
    await t.klikk('[data-h="velg"]');
    await t.vent("document.querySelector('[data-h=\"natt-ferdig\"]')");
    t.sjekk((await spill(t)).valg[meg] === mal, "Nattvalget ble ikke det som ble bekreftet");
    t.sjekk(await t.finnes('[data-h="natt-ferdig"]:disabled'), "«Ferdig» om natta skal vente litt for alle roller");
    f = await fokus(t);
    t.sjekk(f.id === "skjerm-tittel" && f.h1 === NAVN[meg], `Nattsvaret: fokus på «${f.tag}#${f.id}», overskriften sier «${f.h1}» (skal bare være navnet)`);
    if (rolle === "synsk") {
      const svar = await t.tekst(".vu-svar-hoved");
      const ulv = sp.roller[mal] === "varulv";
      t.sjekk(ulv ? /er varulv/.test(svar) : /ikke varulv/.test(svar), `Synsk fikk feil svar om ${NAVN[mal]}: ${svar}`);
    }
    if (o.bilder && !avbildet.has(rolle)) {
      await t.bilde(`${o.bilder}-svar-${rolle}`);
      avbildet.add(rolle);
    }
    await t.vent("!document.querySelector('[data-h=\"natt-ferdig\"]').disabled", 6000);
    if (o.dobbeltrykk && tur === 0) {
      // A double tap on «Ferdig» must stop at «Gi mobilen til …», never open the next secret
      await dobbeltrykk(t, '[data-h="natt-ferdig"]');
      const etter = await spill(t);
      t.sjekk(
        etter.tur.pos === sp.tur.pos + 1 && etter.tur.steg === "gi" && (await t.finnes('[data-h="jeg-er"]')) && !(await t.finnes('[data-h="marker"]')),
        "Dobbelttrykk på «Ferdig» viste neste spillers hemmelighet",
      );
      continue;
    }
    await t.klikk('[data-h="natt-ferdig"]');
  }
  t.feil("Natta tok aldri slutt");
}

async function morgen(t, navn) {
  await t.vent("document.querySelector('[data-h=\"se-natt\"]')");
  if (navn) await t.bilde(`${navn}-for`);
  await t.klikk('[data-h="se-natt"]');
  await t.vent("document.querySelector('.skjerm-morgen .vu-spotlys')", 6000);
  // The button that was pressed is gone: the focus is on the new heading, not lost
  const f = await fokus(t);
  t.sjekk(f.id === "skjerm-tittel", `Etter «Hva skjedde i natt?» har «${f.tag}» fokus (skal være overskriften)`);
  if (navn) await t.bilde(navn);
}

const videre = async (t) => t.klikk('[data-h="til-dag"], [data-h="til-natt"], [data-h="til-jeger"], [data-h="til-slutt"]');

async function stem(t, i, navn) {
  await t.vent("document.querySelector('.skjerm-dag')");
  await t.klikk('[data-h="til-stemme"]');
  await t.klikk('[data-h="pek"]', 50);
  await t.vent("!document.querySelector('#nedtelling').hidden");
  await t.vent("document.querySelector('#nedtelling').hidden", 6000);
  await t.klikk(`[data-h="mistenkt"][data-v="${i}"]`);
  if (navn) await t.bilde(`${navn}-stemme`);
  await t.klikk('[data-h="kast-ut"]');
  await t.vent("document.querySelector('.skjerm-utkastet .stempel')", 6000);
  if (navn) await t.bilde(navn);
}

// The main buttons of the dock are plain text (no emoji).
async function renKnapp(t, hvor) {
  const tekst = await t.js(`Array.from(document.querySelectorAll("#skjerm .dokk .knapp")).map((b) => b.textContent.trim()).join(" | ")`);
  t.sjekk(!/\p{Extended_Pictographic}/u.test(tekst), `Hovedknappen på «${hvor}» har emoji: ${tekst}`);
}

// ---------- The classic game ----------
async function klassiskSpill(t) {
  t.sjekk(!/STILLING/.test(await t.tekst(".merker")), "Hjem-skjermen viser en stilling før noe er spilt");
  await t.klikk('[data-h="nytt"]');
  t.sjekk((await t.tilstand()).antall === 6, "Antall spillere følger ikke navnene som finnes");
  t.sjekk(await t.finnes('[data-h="fredelig"][aria-pressed="true"]'), "«Fredelig første natt» står ikke på som standard med 6 spillere");

  // 12 players: the recommendation follows, the peaceful night is off by default, then back to 6
  for (let i = 0; i < 6; i++) await t.klikk('[data-h="spiller-legg-til"]', 40);
  t.sjekk(/Anbefalt: 3/.test(await t.tekst(".skjerm-oppsett")), "Anbefalt antall varulver for 12 spillere er ikke 3");
  t.sjekk(await t.finnes('[data-h="spiller-legg-til"]:disabled'), "Kan legge til flere enn 12 spillere");
  t.sjekk(await t.finnes('[data-h="fredelig"][aria-pressed="false"]'), "«Fredelig første natt» står på som standard med 12 spillere");
  await t.bilde("oppsett-12", true);
  // 12 players on the smallest phone: the role card's instruction stays above the dock, and the
  // whole back of the card fits
  const [bredde, hoyde] = await t.js("[window.innerWidth, window.innerHeight]");
  await t.send("Emulation.setDeviceMetricsOverride", { width: 320, height: 568, deviceScaleFactor: 2, mobile: true });
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.mappe[data-mappe=\"r0\"]')");
  t.sjekk(await t.friForDokk('.mappe[data-mappe="r0"] .mappe-finger'), "Med 12 spillere ligger instruksen på rollekortet bak knappen (320×568)");
  await les(t, '.mappe[data-mappe="r0"]');
  await t.bilde("12-spillere-320");
  await t.send("Emulation.setDeviceMetricsOverride", { width: bredde, height: hoyde, deviceScaleFactor: 2, mobile: true });
  await t.klikk("#tilbake");
  await t.klikk('[data-h="nytt"]');
  await ark(t, "ja");
  await t.vent("document.querySelector('.skjerm-oppsett')");
  for (let i = 11; i >= 6; i--) await t.klikk(`[data-h="spiller-fjern"][data-v="${i}"]`, 40);
  t.sjekk((await t.tilstand()).antall === 6, "Fikk ikke fjernet spillerne igjen");
  t.sjekk(await t.finnes('[data-h="ulver"][data-v="1"]:disabled'), "6 spillere skal ha maks 1 varulv");
  t.sjekk(await t.finnes('[data-h="fredelig"][aria-pressed="true"]'), "«Fredelig første natt» kom ikke tilbake med 6 spillere");
  await t.klikk('[data-h="rolle"][data-v="jeger"]');
  t.sjekk((await t.tilstand()).oppsett.jeger === true, "Jeger ble ikke slått på");
  await t.klikk('[data-h="rolle"][data-v="jeger"]');
  await t.bilde("oppsett", true);
  await renKnapp(t, "oppsett");

  // ---------- Game 1: a peaceful first night, the village wins ----------
  await t.klikk('[data-h="start"]');
  let sp = await spill(t);
  t.sjekk(sp.roller.filter((r) => r === "varulv").length === 1 && sp.roller.includes("synsk") && sp.roller.includes("lege"), `Feil roller: ${sp.roller}`);
  t.sjekk(sp.fredelig === true, "Spillet startet uten fredelig første natt");
  await rollerunde(t, { bilder: true, omlast: 2 });

  const ulv = sp.roller.indexOf("varulv");
  const lege = sp.roller.indexOf("lege");
  const synsk = sp.roller.indexOf("synsk");
  const bonder = sp.roller.map((r, i) => (r === "landsby" ? i : -1)).filter((i) => i >= 0);
  const [v1, v2, v3] = bonder;

  // Night 1 is peaceful: the wolf sniffs at v1 and the doctor watches v1, and nobody is taken. A
  // double tap on the first «Ferdig» must stop at the next gate.
  let sang1 = "";
  await spillNatt(t, (rolle, meg) => (rolle === "varulv" ? v1 : rolle === "lege" ? v1 : rolle === "synsk" ? ulv : meg === ulv ? v1 : ulv), {
    bilder: "natt",
    omlastVed: 2,
    dobbeltrykk: true,
    fredelig: true,
    start: async () => {
      const tekst = ren(await t.tekst(".skjerm-natt-start"));
      t.sjekk(/Natta tar ca\. 1 minutt og starter hos Testspiller A/.test(tekst), `«Natta faller på» sier ikke hvor lang natta er: ${tekst}`);
      t.sjekk(/Fredelig første natt: ingen blir tatt/.test(tekst), "«Natta faller på» sier ikke at første natt er fredelig");
      sang1 = (/nynn «([^»]+)»/.exec(tekst) || [])[1] || "";
      t.sjekk(await t.js(`window.RUSJ_DATA.fortelling.sanger.length === 12 && window.RUSJ_DATA.fortelling.sanger.includes(${JSON.stringify(sang1)})`), `Fant ikke en av de tolv sangene på «Natta faller på» («${sang1}»)`);
      t.sjekk(await t.friForDokk(".skjerm-natt-start .vu-natthimmel"), "«Natta faller på» ligger bak knappen");
      await renKnapp(t, "Natta faller på");
    },
    sjekk: async (rolle) => {
      if (rolle !== "varulv") return;
      const tekst = ren(await t.tekst(".vu-oppdrag"));
      t.sjekk(/Første natt er fredelig: ingen blir tatt\. Du er den eneste varulven\./.test(tekst) && !/igjen/.test(tekst), `Ulven alene natt 1 ser: ${tekst}`);
    },
  });
  await morgen(t, "morgen-fredelig");
  sp = await spill(t);
  t.sjekk(lever(sp).length === 6 && sp.morgen.offer === null && sp.morgen.fredelig === true && sp.forrigeBeskyttet === null, "Den fredelige natta tok noen, eller legens valg ble husket");
  t.sjekk(ren(await t.tekst("#skjerm h1")) === "Alle våknet. Denne gangen.", `Morgenen etter den fredelige natta sier «${ren(await t.tekst("#skjerm h1"))}»`);
  await renKnapp(t, "morgen");
  await videre(t);

  // Day 1: back + continue, forgot your role, «Avslutt» can be regretted, then vote out an innocent –
  // the first one out becomes the game leader
  await t.vent("document.querySelector('.skjerm-dag #klokke')");
  await t.bilde("dag");
  t.sjekk(await t.friForDokk(".skjerm-dag .timer"), "Klokka på dagen ligger bak knappene");
  await renKnapp(t, "dag");
  await t.klikk("#tilbake");
  t.sjekk(/dag 1/.test(await t.tekst('[data-h="fortsett"]')), "«Fortsett» viser ikke dag 1");
  await t.bilde("hjem-fortsett");
  await t.klikk('[data-h="nytt"]');
  await ark(t, "nei");
  t.sjekk((await t.tilstand()).spill !== null, "«Nytt spill» kastet spillet uten å spørre");
  await t.klikk('[data-h="fortsett"]');
  await t.klikk('[data-h="se-igjen"]');
  await t.klikk(`#ark [data-h="ark-svar"][data-v="${lever(sp).indexOf(lege)}"]`);
  await t.vent(`document.querySelector('#ark:not([hidden]) .mappe[data-mappe="r${lege}"]')`);
  t.sjekk((await les(t, `#ark .mappe[data-mappe="r${lege}"]`)).includes("Lege"), "«Glemt rollen» viste feil rolle");
  await t.klikk('#ark [data-h="lukk-ark"]');
  await t.klikk('[data-h="avslutt"]');
  let knapper = await ark(t, "nei");
  t.sjekk(knapper.join("|") === "Spill videre|Avslutt", `Arket for «Avslutt» har knappene ${knapper.join(" / ")}`);
  t.sjekk((await t.tilstand()).skjerm === "dag" && (await t.tilstand())._aktiv === true, "«Spill videre» avsluttet spillet likevel");
  await stem(t, v2, "utkastet-uskyldig");
  let tekst = ren(await t.tekst(".skjerm-utkastet"));
  t.sjekk(/Landsbyboer/i.test(await t.tekst(".skjerm-utkastet .stempel")) && /uskyldig/.test(tekst), "Utkastet landsbyboer vises ikke som uskyldig");
  t.sjekk(new RegExp(`${NAVN[v2]}, du er ute – men nå er du spillederen: du holder mobilen, leser høyt og teller fingrene\\.`).test(tekst), `Den første som ryker ut, får ikke jobben som spilleder: ${tekst}`);
  t.sjekk((await spill(t)).spilleder === v2, "Spillederen ble ikke lagret");
  t.sjekk(await t.friForDokk(".skjerm-utkastet .vu-jobb"), "Jobben som spilleder ligger bak knappen");
  await videre(t);

  // Night 2: a new song; the doctor may protect v1 (the peaceful night did not count) and saves the
  // wolves' target
  await spillNatt(t, (rolle, meg) => (rolle === "varulv" ? v1 : rolle === "lege" ? v1 : rolle === "synsk" ? v1 : ulv), {
    start: async () => {
      const tekst = ren(await t.tekst(".skjerm-natt-start"));
      const sang2 = (/nynn «([^»]+)»/.exec(tekst) || [])[1] || "";
      t.sjekk(sang2 && sang2 !== sang1, `Natt 2 har samme sang som natt 1 («${sang2}»)`);
      t.sjekk(!/Fredelig/.test(tekst), "Natt 2 kalles fredelig");
    },
    sjekk: async (rolle) => {
      if (rolle === "lege") t.sjekk(!(await t.finnes(`[data-h="marker"][data-v="${v1}"]:disabled`)), "Legen kan ikke beskytte den hun passet på den fredelige natta");
    },
  });
  await t.vent("document.querySelector('[data-h=\"se-natt\"]')");
  t.sjekk(new RegExp(`Gi mobilen til spillederen, ${NAVN[v2]}`).test(ren(await t.tekst(".skjerm-morgen"))), "Morgenen sender ikke mobilen til spillederen");
  await morgen(t, "morgen-reddet");
  sp = await spill(t);
  t.sjekk(sp.morgen.reddet && lever(sp).length === 5, "Legen reddet ikke offeret");
  t.sjekk(/overlevde/.test(await t.tekst("#skjerm h1")), "Morgenen sier ikke at alle overlevde");
  await videre(t);

  // Day 2: the game leader is marked; nobody is voted out («Stem på nytt» stays), and the next night
  // opens with that
  await t.vent("document.querySelector('.skjerm-dag #klokke')");
  t.sjekk(/spilleder/.test(await t.tekst(".vu-landsby li.dod")), "Spillederen er ikke merket i landsbyen");
  await t.klikk('[data-h="til-stemme"]');
  t.sjekk(new RegExp(`Spillederen, ${NAVN[v2]}, teller fingrene`).test(ren(await t.tekst(".skjerm-stemme"))), "Avstemningen nevner ikke spillederen");
  await t.klikk('[data-h="ingen-ut"]');
  knapper = await ark(t, "nei");
  t.sjekk(knapper.join("|") === "Stem på nytt|Ja, ingen i dag" && (await t.tilstand()).skjerm === "stemme", `Arket for «ingen kastes ut»: ${knapper.join(" / ")}`);
  await t.klikk('[data-h="ingen-ut"]');
  await ark(t, "ja");
  await t.vent("document.querySelector('.skjerm-natt-start')");
  t.sjekk(await t.js(`window.RUSJ_DATA.fortelling.ingenUt.includes(document.querySelector(".skjerm-natt-start .vu-fortelling").textContent)`), "Natta etter en dag uten dom åpner ikke med det");
  t.sjekk(!(await t.js("document.querySelector('#toast').classList.contains('vis')")), "Dagen uten dom gir en toast i tillegg");

  // Night 3: the doctor can't protect v1 again; the wolf takes v3
  await spillNatt(t, (rolle, meg) => (rolle === "varulv" ? v3 : rolle === "lege" ? lege : rolle === "synsk" ? v1 : ulv), {
    sjekk: async (rolle) => {
      if (rolle === "lege") t.sjekk(await t.finnes(`[data-h="marker"][data-v="${v1}"]:disabled`), "Legen kan beskytte samme person to netter på rad");
      if (rolle === "varulv") t.sjekk(await t.finnes(`[data-h="marker"][data-v="${ulv}"]:disabled`), "Ulven kan velge seg selv");
    },
  });
  await morgen(t, "morgen-tatt");
  sp = await spill(t);
  t.sjekk(!sp.levende[v3] && sp.morgen.offer === v3, "Ulven tok ikke riktig person natt 3");
  tekst = ren(await t.tekst(".skjerm-morgen"));
  t.sjekk(/er ute av spillet og sier ikke mer/.test(tekst) && !/spillederen/.test(tekst), "Den andre som ryker ut, får også jobben som spilleder");
  await videre(t);

  // Day 3: the time runs out. «+1 min» cancels the jump to the vote; after a reload, or coming back
  // from the vote, nothing jumps by itself. Then the wolf is voted out → the village wins.
  await t.vent("document.querySelector('.skjerm-dag #klokke')");
  const settSlutt = (ms) =>
    t.js(`(() => { const k = "${NOKKEL}"; const s = JSON.parse(localStorage.getItem(k)); Object.assign(s.spill.klokke, { slutt: Date.now() + ${ms}, gaar: true, ute: false }); localStorage.setItem(k, JSON.stringify(s)); })()`);
  await settSlutt(2000);
  await t.lastSide(t.side, "document.querySelector('.skjerm-dag')");
  await t.vent("document.querySelector('.skjerm-dag .vu-tid-ute')", 8000);
  await t.bilde("dag-tiden-ute");
  await t.klikk('[data-h="pluss-min"]');
  await t.sov(3500);
  let st = await t.tilstand();
  t.sjekk(st.skjerm === "dag" && !st.spill.klokke.ute && st.spill.klokke.gaar, "«+1 min» stoppet ikke hoppet til avstemningen");
  await settSlutt(-1000);
  await t.lastSide(t.side, "document.querySelector('.skjerm-dag')");
  await t.sov(3500);
  t.sjekk((await t.tilstand()).skjerm === "dag" && (await t.finnes(".vu-tid-ute")), "Omlasting etter at tiden var ute hoppet videre av seg selv");
  await t.klikk('[data-h="til-stemme"]');
  await t.klikk("#tilbake");
  await t.sov(3500);
  t.sjekk((await t.tilstand()).skjerm === "dag", "Tilbake fra avstemningen hoppet rett til avstemningen igjen");
  await stem(t, ulv, "utkastet-ulv");
  await videre(t);
  await t.vent("document.querySelector('.skjerm-slutt')");
  t.sjekk(/Landsbyen vinner!/.test(await t.tekst("#skjerm h1")), "Landsbyen vant ikke");
  t.sjekk(/Etter tre netter/i.test(await t.tekst(".skjerm-slutt .banner")), "Kåringen sier ikke hvor mange netter spillet varte");
  t.sjekk(await t.finnes('.skjerm-slutt a[href="/"]'), "Sluttskjermen mangler «Alle spill»");
  t.sjekk((await t.antall(".vu-historikk li")) === 6, `Historikken skal ha seks hendelser, har ${await t.antall(".vu-historikk li")}`);
  t.sjekk(/fredelig første natt/i.test(await t.tekst(".vu-historikk")), "Historikken nevner ikke den fredelige natta");
  t.sjekk(await t.finnes(".vu-stat li"), "Mangler statistikken fra natta");
  t.sjekk(/Landsbyen\s*1 – 0\s*Varulvene/.test(await t.tekst(".vu-stilling")), `Stillingen på kåringen: ${ren(await t.tekst(".vu-stilling"))}`);
  await renKnapp(t, "kåringen");
  // «Kveldens gjeng»: once, the five on the winning side share first place
  let gjeng = await kveld(t);
  t.sjekk(gjeng.length === 1 && gjeng[0].resultat.filter((r) => r.plass === 1).length === 5 && (gjeng[0].resultat.find((r) => r.navn === NAVN[ulv]) || {}).plass === 6, `Kveldens gjeng etter spill 1: ${JSON.stringify(gjeng)}`);
  st = await t.tilstand();
  t.sjekk(st._aktiv === false && st.spill.ferdig === true, "Spillet står som «pågår» på kåringen");
  await t.bilde("slutt-landsby", true);
  // «Del resultatet»: the result, never more of what the players typed than first names
  await t.js(`Object.defineProperty(navigator, "share", { configurable: true, value: (d) => { window.__delt = d; return Promise.resolve(); } })`);
  await t.klikk('[data-h="del"]');
  const delt = await t.js("window.__delt || null");
  t.sjekk(delt && /^Varulven 🐺 Landsbyen vant etter tre netter\.\n/.test(delt.text) && /\/varulven\/$/.test(delt.url), `«Del resultatet» deler: ${JSON.stringify(delt)}`);
  // A reload: still «Kåringen», nothing is registered twice; the home screen offers a new game
  await t.lastSide(t.side, "document.querySelector('.skjerm-slutt')");
  gjeng = await kveld(t);
  st = await t.tilstand();
  t.sjekk(gjeng.length === 1 && st.stilling.landsby === 1 && st.stilling.ulv === 0, "Omlasting på kåringen registrerte resultatet en gang til");
  await t.klikk("#tilbake");
  t.sjekk((await t.finnes('[data-h="nytt"]')) && !(await t.finnes('[data-h="fortsett"]')), "Hjem-skjermen tilbyr «Fortsett» etter at spillet er slutt");
  t.sjekk(/STILLING\s*Landsbyen 1 – 0 Varulvene/.test(ren(await t.tekst(".merker li"))), `Stillingen står ikke først blant merkene: ${ren(await t.tekst(".merker"))}`);
  await t.bilde("hjem-stilling");

  // ---------- Game 2: hunter on, no peaceful night, the wolves win ----------
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="rolle"][data-v="jeger"]');
  await t.klikk('[data-h="fredelig"]');
  t.sjekk((await t.tilstand()).oppsett.fredelig === false, "«Fredelig første natt» lar seg ikke slå av");
  await t.klikk('[data-h="start"]');
  await rollerunde(t);
  sp = await spill(t);
  const ulv2 = sp.roller.indexOf("varulv");
  const jeger = sp.roller.indexOf("jeger");
  const lege2 = sp.roller.indexOf("lege");
  const forste = (s, unntatt = []) => lever(s).find((i) => s.roller[i] !== "varulv" && !unntatt.includes(i));
  const offer1 = forste(sp, [jeger, lege2]);

  // Narrow phone for the night screens
  await t.send("Emulation.setDeviceMetricsOverride", { width: 320, height: 640, deviceScaleFactor: 2, mobile: true });
  await spillNatt(t, (rolle, meg, s) => (rolle === "varulv" ? offer1 : rolle === "lege" ? lege2 : lever(s).find((i) => i !== meg)), {
    sjekk: async (rolle) => {
      const bred = await t.js("document.documentElement.scrollWidth - window.innerWidth");
      t.sjekk(bred <= 0, `Sidelengs scrolling om natta ved 320 px (${rolle})`);
    },
  });
  await morgen(t);
  await t.bilde("320-morgen");
  // Taken on night 1: the first one out gets the job on the morning screen
  sp = await spill(t);
  tekst = ren(await t.tekst(".skjerm-morgen"));
  t.sjekk(sp.spilleder === offer1 && /nå er du spillederen/.test(tekst) && !/sier ikke mer/.test(tekst), `Offeret natt 1 ble ikke spilleder: ${tekst}`);
  t.sjekk(await t.friForDokk(".skjerm-morgen .vu-jobb"), "Jobben som spilleder ligger bak knappen på morgenen (320 px)");
  await videre(t);
  await t.vent("document.querySelector('.skjerm-dag')");
  t.sjekk((await t.js("document.documentElement.scrollWidth - window.innerWidth")) <= 0, "Sidelengs scrolling på dagen ved 320 px");
  await t.bilde("320-dag");
  await t.send("Emulation.setDeviceMetricsOverride", { width: bredde, height: hoyde, deviceScaleFactor: 2, mobile: true });

  // Day 1: the hunter is voted out and takes someone along
  await stem(t, jeger);
  await videre(t);
  await t.vent("document.querySelector('[data-h=\"jeger-valg\"]')");
  sp = await spill(t);
  const skudd = forste(sp);
  await t.klikk(`[data-h="jeger-valg"][data-v="${skudd}"]`);
  await t.bilde("jeger");
  await renKnapp(t, "jeger");
  await t.klikk('[data-h="skyt"]');
  await t.vent("document.querySelector('.skjerm-jeger .stempel')", 6000);
  await t.bilde("jeger-skudd");
  sp = await spill(t);
  t.sjekk(!sp.levende[skudd] && sp.hendelser.some((h) => h.type === "jeger"), "Jegerens skudd ble ikke registrert");
  await videre(t);

  // Night 2: the wolf takes one more → the wolves win
  sp = await spill(t);
  const offer2 = forste(sp, [lege2]) ?? forste(sp);
  await spillNatt(t, (rolle, meg, s) =>
    rolle === "varulv" ? offer2 : rolle === "lege" ? lever(s).find((i) => i !== offer2 && i !== s.forrigeBeskyttet) : lever(s).find((i) => i !== meg),
  );
  await morgen(t);
  await t.vent("document.querySelector('[data-h=\"til-slutt\"]')");
  await videre(t);
  await t.vent("document.querySelector('.skjerm-slutt')");
  t.sjekk(/Varulvene vinner!/.test(await t.tekst("#skjerm h1")), "Varulvene vant ikke");
  t.sjekk(await t.js("document.documentElement.classList.contains('vu-natt')"), "Ulvenes seier har ikke nattlook");
  t.sjekk(/Landsbyen\s*1 – 1\s*Varulvene/.test(await t.tekst(".vu-stilling")), `Stillingen etter to spill: ${ren(await t.tekst(".vu-stilling"))}`);
  gjeng = await kveld(t);
  t.sjekk(gjeng.length === 2 && gjeng[1].resultat.filter((r) => r.plass === 1).length === 1 && gjeng[1].resultat[0].navn === NAVN[ulv2], `Kveldens gjeng etter spill 2: ${JSON.stringify(gjeng[1])}`);
  await t.bilde("slutt-ulv", true);

  // ---------- Game 3: «Spill igjen», then «Avslutt» → «Kåringen» without a winner ----------
  await t.klikk('[data-h="igjen"]');
  await t.vent("document.querySelector('.mappe[data-mappe=\"r0\"]')");
  t.sjekk((await spill(t)).natt === 0, "«Spill igjen» startet ikke et nytt spill");
  await rollerunde(t);
  await t.klikk('[data-h="avslutt"]');
  await ark(t, "ja");
  await t.vent("document.querySelector('.skjerm-slutt')");
  st = await t.tilstand();
  t.sjekk(/Ingen vant denne gangen/.test(await t.tekst("#skjerm h1")) && /Avsluttet før første natt/i.test(await t.tekst(".skjerm-slutt .banner")), `«Avslutt» ga kåringen «${ren(await t.tekst(".skjerm-slutt .banner"))}»`);
  t.sjekk(st._aktiv === false && st.spill.ferdig && st.spill.avbrutt && !st.spill.vinner, "Etter «Avslutt» står spillet fortsatt som «pågår»");
  t.sjekk((await t.antall(".vu-rolleliste li")) === 6, "«Hvem var hvem?» mangler etter «Avslutt»");
  t.sjekk(!(await t.finnes('[data-h="del"]')), "«Del resultatet» vises uten en vinner");
  t.sjekk((await kveld(t)).length === 2 && st.stilling.landsby === 1 && st.stilling.ulv === 1, "Et avbrutt spill ble registrert som en seier");
  await t.bilde("slutt-avbrutt", true);
  await t.klikk("#tilbake");
  t.sjekk((await t.finnes('[data-h="nytt"]')) && !(await t.finnes('[data-h="fortsett"]')), "Hjem-skjermen tilbyr «Fortsett» etter «Avslutt»");
}

// ---------- «Én natt» ----------
async function enNattSpill(t) {
  let sp, st, tekst, knapper, gjeng;
  // The tally on this phone and «Kveldens gjeng» as they were before this part
  const for0 = { landsby: (await t.tilstand()).stilling.landsby, ulv: (await t.tilstand()).stilling.ulv, kveld: (await kveld(t)).length };
  // =====================================================================================
  // «Én natt»: one night, swaps at dawn, one vote, points over several rounds
  // =====================================================================================
  const EN_NAVN = { varulv: "Varulv", synsk: "Synsk", bytter: "Bytter", brak: "Bråkmaker", landsby: "Landsbyboer" };
  const lite = (r) => EN_NAVN[r].toLowerCase();
  const navnFor = (i) => NAVN[i] && i < 4 ? NAVN[i] : `Spiller ${i + 1}`;
  const stokk = (n) => [...(n >= 7 ? ["varulv", "varulv"] : ["varulv"]), "synsk", "bytter", ...(n >= 6 ? ["brak"] : []), ...Array(n).fill("landsby")].slice(0, n).sort().join();
  const alle = (sp, rolle) => sp.roller.map((r, i) => (r === rolle ? i : -1)).filter((i) => i >= 0);
  const topptittel = () => t.js(`document.querySelector("#topp-tittel").textContent`);

  // One night of «Én natt»: the phone goes round once; plan(rolle, meg, sp) gives each pick (an
  // index, or two for the troublemaker). o: bilder, start(sp), sjekk(rolle, meg, sp), omlastVed
  async function enNatt(plan, o = {}) {
    await t.vent("document.querySelector('.skjerm-en-natt-start [data-h=\"start-natt\"]')");
    if (o.start) await o.start(await spill(t));
    if (o.bilder) await t.bilde(`${o.bilder}-start`);
    await t.klikk('[data-h="start-natt"]');
    const avbildet = new Set();
    let omlastet = false;
    for (let tur = 0; tur < 14; tur++) {
      await t.vent("document.querySelector('[data-h=\"jeg-er\"]') || document.querySelector('.skjerm-en-morgen')", 8000);
      if (await t.finnes(".skjerm-en-morgen")) return;
      const sp = await spill(t);
      const meg = sp.tur.rekke[sp.tur.pos];
      const rolle = sp.roller[meg];
      if (o.bilder && tur === 0) await t.bilde(`${o.bilder}-gi`);
      await t.klikk('[data-h="jeg-er"]');
      await t.vent("document.querySelector('[data-h=\"en-marker\"]')");
      // The role is shown here for the first time – as ordinary text: the focused heading is the name
      let f = await fokus(t);
      t.sjekk(f.id === "skjerm-tittel" && f.h1 === navnFor(meg), `«Én natt», valget: fokus på «${f.tag}#${f.id}», overskriften sier «${f.h1}» (skal bare være navnet)`);
      t.sjekk(ren(await t.tekst(".vu-rolle")).includes(EN_NAVN[rolle]), `Spiller ${meg + 1} skulle sett rollen ${EN_NAVN[rolle]}, men ser «${ren(await t.tekst(".vu-rolle"))}»`);
      t.sjekk(await t.finnes('[data-h="en-velg"]:disabled'), "«Én natt»: valget kan bekreftes før et navn er valgt");
      t.sjekk(await t.finnes(`[data-h="en-marker"][data-v="${meg}"]:disabled`), "«Én natt»: man kan velge seg selv");
      t.sjekk((await t.antall('[data-h="en-marker"]')) === sp.n, "«Én natt»: lista viser ikke alle spillerne");
      if (o.sjekk) await o.sjekk(rolle, meg, sp);
      const mal = plan(rolle, meg, sp);
      for (const m of [].concat(mal)) await t.klikk(`[data-h="en-marker"][data-v="${m}"]`);
      const knapp = ren(await t.tekst('[data-h="en-velg"]'));
      const ventet = rolle === "brak" ? "Bytt om rollene" : `${{ varulv: "Skyld på", synsk: "Se på", bytter: "Bytt med", landsby: "Mistenk" }[rolle]} ${navnFor(mal)}`;
      t.sjekk(knapp.startsWith(ventet), `«Én natt»: bekreft-knappen sier «${knapp}» for ${rolle} (ventet «${ventet}»)`);
      if (o.bilder && !avbildet.has(rolle)) await t.bilde(`${o.bilder}-valg-${rolle}`);
      await t.klikk('[data-h="en-velg"]');
      await t.vent("document.querySelector('[data-h=\"natt-ferdig\"]')");
      t.sjekk(JSON.stringify((await spill(t)).valg[meg]) === JSON.stringify(mal), "«Én natt»: nattvalget ble ikke det som ble bekreftet");
      t.sjekk(await t.finnes('[data-h="natt-ferdig"]:disabled'), "«Én natt»: «Ferdig» skal vente litt for alle roller");
      f = await fokus(t);
      t.sjekk(f.id === "skjerm-tittel" && f.h1 === navnFor(meg), `«Én natt», svaret: fokus på «${f.tag}#${f.id}», overskriften sier «${f.h1}» (skal bare være navnet)`);
      // Everything a player is told is the roles as dealt
      const svar = ren(await t.tekst(".vu-svar-hoved"));
      if (rolle === "synsk") t.sjekk(svar === `${navnFor(mal)} er ${lite(sp.roller[mal])}.`, `Den synske fikk svaret «${svar}» om en ${sp.roller[mal]}`);
      if (rolle === "bytter") t.sjekk(svar === `Nå er du ${lite(sp.roller[mal])}.`, `Bytteren fikk svaret «${svar}» etter å ha byttet med en ${sp.roller[mal]}`);
      if (o.bilder && !avbildet.has(rolle)) {
        await t.bilde(`${o.bilder}-svar-${rolle}`);
        avbildet.add(rolle);
      }
      if (o.omlastVed === sp.tur.pos && !omlastet) {
        // A reload with a secret on the screen: back to the hand-over, and the pick is kept
        omlastet = true;
        await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
        const etter = await t.tilstand();
        t.sjekk(etter.skjerm === "en-natt" && etter.spill.tur.pos === sp.tur.pos && etter.spill.tur.steg === "gi" && (await t.finnes('[data-h="jeg-er"]')) && !(await t.finnes(".vu-svar")), "«Én natt»: omlasting midt i natta viste en hemmelighet");
        t.sjekk(await t.js("document.documentElement.classList.contains('vu-natt')"), "«Én natt»: nattlooken mangler etter omlasting");
        await t.klikk('[data-h="jeg-er"]');
        await t.vent("document.querySelector('[data-h=\"natt-ferdig\"]')");
        t.sjekk(!(await t.finnes('[data-h="en-marker"]')), "«Én natt»: etter omlasting kan spilleren velge på nytt");
      }
      await t.vent("!document.querySelector('[data-h=\"natt-ferdig\"]').disabled", 6000);
      await t.klikk('[data-h="natt-ferdig"]');
    }
    t.feil("Natta i «Én natt» tok aldri slutt");
  }

  // Morning → the talk → the vote. pekt: the players the phone holder marks ([] = nobody).
  async function enDagOgStemme(pekt, o = {}) {
    await t.vent("document.querySelector('.skjerm-en-morgen [data-h=\"en-start-dag\"]')");
    if (o.bilder) await t.bilde(`${o.bilder}-morgen`);
    await t.klikk('[data-h="en-start-dag"]');
    await t.vent("document.querySelector('.skjerm-en-dag #klokke')");
    if (o.dag) await o.dag();
    if (o.bilder) await t.bilde(`${o.bilder}-dag`);
    await t.klikk('[data-h="en-til-stemme"]');
    await t.vent("document.querySelector('.skjerm-en-stemme')");
    t.sjekk(await t.finnes('[data-h="en-avslor"]:disabled'), "«Én natt»: avstemningen kan bekreftes uten at noen er pekt ut");
    if (o.pek) {
      await t.klikk('[data-h="pek"]', 50);
      await t.vent("!document.querySelector('#nedtelling').hidden");
      await t.vent("document.querySelector('#nedtelling').hidden", 6000);
    }
    if (!pekt.length) {
      await t.klikk('[data-h="en-ingen"]');
      const knapper = await ark(t, "nei");
      t.sjekk(knapper.join("|") === "Stem på nytt|Ja, ingen" && (await t.tilstand()).skjerm === "en-stemme", `Arket for «ingen ble pekt ut»: ${knapper.join(" / ")}`);
      await t.klikk('[data-h="en-ingen"]');
      await ark(t, "ja");
    } else {
      for (const i of pekt) await t.klikk(`[data-h="en-pekt"][data-v="${i}"]`);
      if (o.stemme) await o.stemme();
      if (o.bilder) await t.bilde(`${o.bilder}-stemme`);
      await t.klikk('[data-h="en-avslor"]');
    }
    await t.vent("document.querySelector('.skjerm-en-avsloring .vu-dom')", 7000);
    const f = await fokus(t);
    t.sjekk(f.id === "skjerm-tittel", `Etter avsløringen har «${f.tag}» fokus (skal være overskriften)`);
  }

  // ---------- Session A: 4 players, 3 rounds ----------
  await t.klikk('[data-h="nytt"]');
  await t.vent("document.querySelector('.skjerm-oppsett')");
  t.sjekk((await t.js(`Array.from(document.querySelectorAll('.skjerm-oppsett .seksjon')).findIndex((s) => s.querySelector('[data-h="modus"]'))`)) === 0 && (await t.antall('[data-h="modus"]')) === 2, "Spillemåten er ikke første seksjon i oppsettet (to fliser)");
  await t.klikk('[data-h="modus"][data-v="en"]');
  st = await t.tilstand();
  t.sjekk(st.oppsett.modus === "en" && st.antall === 6 && (await t.finnes('[data-h="runder"][data-v="5"][aria-pressed="true"]')), "«Én natt» ble ikke valgt, eller fem runder er ikke standard");
  for (let i = 5; i >= 4; i--) await t.klikk(`[data-h="spiller-fjern"][data-v="${i}"]`, 40);
  t.sjekk((await t.tilstand()).antall === 4 && !(await t.finnes('[data-h="spiller-fjern"]')), "«Én natt» lar seg ikke sette opp med fire spillere");
  tekst = ren(await t.tekst(".skjerm-oppsett"));
  t.sjekk(/Trenger minst 6 spillere \(dere er 4\)/.test(tekst), "Flisen «Klassisk» forklarer ikke at den trenger seks");
  t.sjekk(/1 varulv · 🔮 synsk · 🔄 bytter · 🏡 1 landsbyboer/.test(tekst.replace(/\s+/g, " ")), `Rollene for fire spillere: ${ren(await t.tekst(".vu-stokk"))}`);
  // No dead end: «Klassisk» with four gives six rows – and going back gives the four again
  await t.klikk('[data-h="modus"][data-v="klassisk"]');
  st = await t.tilstand();
  t.sjekk(st.oppsett.modus === "klassisk" && st.antall === 6 && (await t.antall("#spillerboks .spiller")) === 6, "«Klassisk» med fire spillere ga ikke seks rader");
  await t.klikk('[data-h="modus"][data-v="en"]');
  t.sjekk((await t.tilstand()).antall === 4, "Tilbake til «Én natt» ga ikke de fire spillerne igjen");
  await t.klikk('[data-h="runder"][data-v="3"]');
  await t.bilde("en-oppsett", true);
  await renKnapp(t, "oppsett (Én natt)");
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.skjerm-en-natt-start')");
  sp = await spill(t);
  t.sjekk(sp.modus === "en" && sp.n === 4 && sp.runder === 3 && sp.runde === 1 && sp.roller.slice().sort().join() === stokk(4), `«Én natt» med fire: feil utdeling ${sp.roller}`);
  t.sjekk((await topptittel()) === "Runde 1 av 3", `Topplinja sier «${await topptittel()}»`);

  // Round 1: the swapper swaps with the seer (the wolf stays the wolf), the wolf is pointed out
  let [w] = alle(sp, "varulv");
  let [s] = alle(sp, "synsk");
  let [b] = alle(sp, "bytter");
  let [l] = alle(sp, "landsby");
  await enNatt((rolle) => ({ varulv: l, synsk: w, bytter: s, landsby: w })[rolle], {
    bilder: "en-natt",
    omlastVed: 1,
    start: async () => {
      const tekst = ren(await t.tekst(".skjerm-en-natt-start"));
      t.sjekk(/Natta tar ca\. 1 minutt og starter hos Testspiller A/.test(tekst) && /nynn «[^»]+»/.test(tekst), `«Natta faller på» i «Én natt»: ${tekst}`);
      t.sjekk(await t.friForDokk(".skjerm-en-natt-start .vu-natthimmel"), "«Natta faller på» («Én natt») ligger bak knappen");
      await renKnapp(t, "Natta faller på (Én natt)");
    },
    sjekk: async (rolle) => {
      t.sjekk(await t.friForDokk(".vu-en-oppdrag"), `«Én natt»: rollen og spørsmålet ligger bak knappen (${rolle})`);
      if (rolle === "varulv") t.sjekk(/Du er den eneste varulven/.test(ren(await t.tekst(".vu-oppdrag"))), "Den ene varulven får ikke vite at den er alene");
    },
  });
  sp = await spill(t);
  let ventet = sp.roller.slice();
  [ventet[b], ventet[s]] = [ventet[s], ventet[b]];
  t.sjekk(sp.slutt.join() === ventet.join() && sp.tur === null, `Runde 1: byttet ble ikke utført ved daggry (${sp.roller} → ${sp.slutt})`);
  await enDagOgStemme([w], {
    bilder: "en",
    pek: true,
    dag: async () => {
      t.sjekk(/4:00|3:5\d/.test(await t.tekst("#klokke .timer-tid")), `Taleklokka starter ikke på fire minutter (${await t.tekst("#klokke .timer-tid")})`);
      t.sjekk(await t.friForDokk(".skjerm-en-dag .timer"), "«Én natt»: klokka ligger bak knappene");
      await renKnapp(t, "dagen (Én natt)");
      // «Glemt hva du så?»: the seer's own card again, behind a hold
      await t.klikk('[data-h="se-igjen"]');
      await t.klikk(`#ark [data-h="ark-svar"][data-v="${s}"]`);
      await t.vent(`document.querySelector('#ark:not([hidden]) .mappe[data-mappe="r${s}"]')`);
      const kort = ren(await les(t, `#ark .mappe[data-mappe="r${s}"]`));
      t.sjekk(/Synsk/.test(kort) && kort.includes(`${navnFor(w)} er varulv.`), `«Glemt hva du så?» viser: ${kort}`);
      await t.klikk('#ark [data-h="lukk-ark"]');
      // Back + continue keeps the round
      await t.klikk("#tilbake");
      t.sjekk(/runde 1 av 3/.test(await t.tekst('[data-h="fortsett"]')), `«Fortsett» sier «${await t.tekst('[data-h="fortsett"]')}»`);
      await t.klikk('[data-h="fortsett"]');
      await t.vent("document.querySelector('.skjerm-en-dag #klokke')");
    },
    stemme: async () => {
      t.sjekk(ren(await t.tekst('[data-h="en-avslor"]')) === `${navnFor(w)} ble pekt ut`, `Knappen i avstemningen sier «${ren(await t.tekst('[data-h="en-avslor"]'))}»`);
      t.sjekk(await t.friForDokk(".skjerm-en-stemme h1"), "«Én natt»: avstemningen ligger bak knappen");
    },
  });
  await t.bilde("en-avsloring-landsby");
  tekst = ren(await t.tekst(".skjerm-en-avsloring"));
  t.sjekk(/Landsbyen vinner runden!/.test(await t.tekst("#skjerm h1")) && /Varulv/i.test(await t.tekst(".vu-pekte .stempel")), `Runde 1: avsløringen sier «${ren(await t.tekst("#skjerm h1"))}»`);
  t.sjekk(tekst.includes(`${navnFor(w)} endte natta som varulv – og ble pekt ut.`) && tekst.includes(`Bytteren ${navnFor(b)} byttet rolle med ${navnFor(s)} og ble synsk.`), `Runde 1: historien mangler: ${tekst}`);
  t.sjekk(await t.friForDokk(".skjerm-en-avsloring .vu-dom"), "Avsløringen: dommen ligger bak knappene");
  t.sjekk(await t.js("document.documentElement.classList.contains('vu-morgen')"), "Landsbyens seier i runden har ikke morgenlook");
  await renKnapp(t, "avsløringen");
  await t.bilde("en-avsloring-hel", true);
  // Nothing is counted until the players move on: «Angre» takes the vote back
  sp = await spill(t);
  t.sjekk(sp.poeng.join() === "0,0,0,0" && (await t.antall(".poengliste .pluss")) === 3, `Poengene telles før «Neste runde», eller pluss-merkene er feil (${sp.poeng})`);
  await t.klikk('[data-h="en-angre"]');
  st = await t.tilstand();
  t.sjekk(st.skjerm === "en-stemme" && st.spill.pekt === null && (await t.finnes(`[data-h="en-pekt"][data-v="${w}"][aria-pressed="true"]`)), "«Angre» gikk ikke tilbake til avstemningen med valget på plass");
  await t.klikk('[data-h="en-avslor"]');
  await t.vent("document.querySelector('.skjerm-en-avsloring .vu-dom')", 7000);
  await t.klikk('[data-h="en-neste"]');
  await t.vent("document.querySelector('.skjerm-en-natt-start')");
  st = await t.tilstand();
  sp = st.spill;
  t.sjekk(sp.runde === 2 && sp.spilt === 1 && sp.poeng.reduce((a, x) => a + x, 0) === 3 && sp.poeng[w] === 0, `Etter runde 1: poeng ${sp.poeng}, runde ${sp.runde}`);
  t.sjekk(st.stilling.landsby === for0.landsby + 1 && st.stilling.ulv === for0.ulv, `Stillingen på mobilen etter runde 1: ${JSON.stringify(st.stilling)}`);
  t.sjekk(sp.tur.rekke[0] === 1 && (await topptittel()) === "Runde 2 av 3", "Runde 2 starter ikke ett sete videre");
  const poeng1 = sp.poeng.slice();

  // Round 2: the swapper swaps with the wolf and becomes the wolf. Nobody is pointed out → the wolves win
  [w] = alle(sp, "varulv");
  [s] = alle(sp, "synsk");
  [b] = alle(sp, "bytter");
  [l] = alle(sp, "landsby");
  await enNatt((rolle) => ({ varulv: l, synsk: b, bytter: w, landsby: s })[rolle]);
  sp = await spill(t);
  t.sjekk(sp.slutt[b] === "varulv" && sp.slutt[w] === "bytter", `Runde 2: bytteren ble ikke varulv (${sp.slutt})`);
  await enDagOgStemme([]);
  await t.bilde("en-avsloring-ulv");
  tekst = ren(await t.tekst(".skjerm-en-avsloring"));
  t.sjekk(/Varulvene vinner runden!/.test(await t.tekst("#skjerm h1")) && tekst.includes(`Ingen ble pekt ut. Varulven var ${navnFor(b)}.`), `Runde 2: ${tekst.slice(0, 200)}`);
  t.sjekk(await t.js("document.documentElement.classList.contains('vu-natt')"), "Ulvenes seier i runden har ikke nattlook");
  await t.klikk('[data-h="en-neste"]');
  await t.vent("document.querySelector('.skjerm-en-natt-start')");
  sp = await spill(t);
  t.sjekk(sp.poeng[b] === poeng1[b] + 1 && sp.poeng.reduce((a, x) => a + x, 0) === 4, `Etter runde 2: bare den som endte som varulv, skal ha fått poeng (${poeng1} → ${sp.poeng})`);

  // Round 3 (the last): a tie between the wolf and a villager → both are pointed out → the village wins
  [w] = alle(sp, "varulv");
  [s] = alle(sp, "synsk");
  [b] = alle(sp, "bytter");
  [l] = alle(sp, "landsby");
  await enNatt((rolle) => ({ varulv: s, synsk: l, bytter: l, landsby: b })[rolle]);
  await enDagOgStemme([w, l], {
    stemme: async () => {
      const knapp = ren(await t.tekst('[data-h="en-avslor"]'));
      t.sjekk(knapp === `${[w, l].sort((a, c) => a - c).map(navnFor).join(" og ")} ble pekt ut` || knapp === `${navnFor(w)} og ${navnFor(l)} ble pekt ut`, `Knappen ved delt førsteplass sier «${knapp}»`);
    },
  });
  await t.bilde("en-avsloring-to");
  t.sjekk(/Landsbyen vinner runden!/.test(await t.tekst("#skjerm h1")) && (await t.antall(".vu-pekte.flere li")) === 2, "Runde 3: to utpekte vises ikke, eller landsbyen vant ikke");
  t.sjekk(ren(await t.tekst('[data-h="en-neste"]')) === "Til kåringen" && !(await t.finnes('.skjerm-en-avsloring [data-h="avslutt"]')), "Siste runde: hovedknappen er ikke «Til kåringen»");
  await t.klikk('[data-h="en-neste"]');
  await t.vent("document.querySelector('.skjerm-slutt')");
  st = await t.tilstand();
  sp = st.spill;
  const topp = Math.max(...sp.poeng);
  const vinnere = sp.poeng.map((p, i) => (p === topp ? i : -1)).filter((i) => i >= 0);
  const vinnerlinje = `${vinnere.map(navnFor).join(", ").replace(/, ([^,]*)$/, " og $1")} vinner!`;
  t.sjekk(st._aktiv === false && sp.ferdig && sp.spilt === 3 && sp.poeng.reduce((a, x) => a + x, 0) === 7, `Kåringen etter tre runder: ${JSON.stringify(sp.poeng)}`);
  t.sjekk(vinnere.length > 3 || ren(await t.tekst("#skjerm h1")) === vinnerlinje, `Vinnerlinja sier «${ren(await t.tekst("#skjerm h1"))}», ventet «${vinnerlinje}»`);
  t.sjekk(/Én natt · 3 runder/i.test(await t.tekst(".skjerm-slutt .banner")) && /Landsbyen vant to runder, varulvene én\./.test(await t.tekst(".skjerm-slutt .banner")), `Banneret på kåringen: ${ren(await t.tekst(".skjerm-slutt .banner"))}`);
  t.sjekk((await t.antall(".skjerm-slutt .poengliste li")) === 4 && (await t.finnes(".skjerm-slutt .pall")), "Kåringen mangler pall eller poengliste");
  t.sjekk(new RegExp(`Landsbyen\\s*${for0.landsby + 2} – ${for0.ulv + 1}\\s*Varulvene`).test(await t.tekst(".vu-stilling")), `Stillingen etter «Én natt»: ${ren(await t.tekst(".vu-stilling"))}`);
  gjeng = await kveld(t);
  t.sjekk(gjeng.length === for0.kveld + 1 && gjeng[for0.kveld].resultat.length === 4 && gjeng[for0.kveld].resultat.filter((r) => r.plass === 1).length === vinnere.length, `Kveldens gjeng etter «Én natt»: ${JSON.stringify(gjeng[for0.kveld])}`);
  await renKnapp(t, "kåringen (Én natt)");
  await t.bilde("en-slutt", true);
  await t.js(`window.__delt = null; Object.defineProperty(navigator, "share", { configurable: true, value: (d) => { window.__delt = d; return Promise.resolve(); } })`);
  await t.klikk('[data-h="del"]');
  const delt2 = await t.js("window.__delt || null");
  t.sjekk(delt2 && /^Varulven 🐺 Én natt: .+ med \d poeng etter tre runder\.\nLandsbyen vant to runder, varulvene én\.$/.test(delt2.text) && /\/varulven\/$/.test(delt2.url), `«Del resultatet» etter «Én natt»: ${JSON.stringify(delt2)}`);
  await t.lastSide(t.side, "document.querySelector('.skjerm-slutt')");
  t.sjekk((await kveld(t)).length === for0.kveld + 1 && (await t.tilstand()).stilling.landsby === for0.landsby + 2, "Omlasting på kåringen («Én natt») registrerte resultatet en gang til");

  // ---------- Session B: 7 players – two wolves, the troublemaker, the order of the swaps ----------
  await t.klikk('[data-h="nytt"]');
  await t.vent("document.querySelector('.skjerm-oppsett')");
  for (let i = 0; i < 3; i++) await t.klikk('[data-h="spiller-legg-til"]', 40);
  await t.klikk('[data-h="runder"][data-v="5"]');
  tekst = ren(await t.tekst(".vu-stokk"));
  t.sjekk(/2 varulver · 🔮 synsk · 🔄 bytter · 😈 bråkmaker · 🏡 2 landsbyboere/.test(tekst), `Rollene for sju spillere: ${tekst}`);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.skjerm-en-natt-start')");
  sp = await spill(t);
  t.sjekk(sp.n === 7 && sp.roller.slice().sort().join() === stokk(7), `«Én natt» med sju: feil utdeling ${sp.roller}`);
  t.sjekk(/Natta tar ca\. 2 minutter/.test(ren(await t.tekst(".skjerm-en-natt-start"))) && (await topptittel()) === "Runde 1 av 5", "«Natta faller på» med sju spillere sier ikke ca. 2 minutter");
  const [w1, w2] = alle(sp, "varulv");
  [s] = alle(sp, "synsk");
  [b] = alle(sp, "bytter");
  const [k] = alle(sp, "brak");
  const [l1, l2] = alle(sp, "landsby");
  // The swapper takes w1's wolf role; then the troublemaker swaps the swapper and l1. If the swaps
  // were done in the wrong order, the swapper would end as a wolf and l1 as the swapper.
  await enNatt((rolle, meg) => ({ varulv: l2, synsk: w1, bytter: w1, brak: [b, l1], landsby: meg === l1 ? w1 : l1 })[rolle], {
    bilder: "en7",
    sjekk: async (rolle, meg, s0) => {
      if (rolle === "varulv") {
        const annen = meg === w1 ? w2 : w1;
        const tekst = ren(await t.tekst(".vu-oppdrag"));
        t.sjekk(tekst.includes(`Den andre varulven er ${navnFor(annen)}.`) && (s0.valg[annen] == null || tekst.includes(`${navnFor(annen)} vil skylde på ${navnFor(l2)}.`)), `Varulven ser ikke den andre varulven: ${tekst}`);
        t.sjekk(await t.finnes(`[data-h="en-marker"][data-v="${annen}"]:disabled`), "En varulv kan skylde på den andre varulven");
      }
      if (rolle === "brak") {
        // Two names: the button counts down, and a third name replaces the oldest
        t.sjekk(ren(await t.tekst('[data-h="en-velg"]')) === "Trykk på to navn", "Bråkmakerens knapp ber ikke om to navn");
        await t.klikk(`[data-h="en-marker"][data-v="${w2}"]`);
        t.sjekk(ren(await t.tekst('[data-h="en-velg"]')) === "Trykk på ett navn til", "Bråkmakerens knapp ber ikke om ett navn til");
        await t.klikk(`[data-h="en-marker"][data-v="${b}"]`);
        await t.klikk(`[data-h="en-marker"][data-v="${l1}"]`);
        t.sjekk((await spill(t)).tur.markert.join() === [b, l1].join(), "Det tredje navnet erstattet ikke det eldste");
        await t.klikk(`[data-h="en-marker"][data-v="${b}"]`);
        await t.klikk(`[data-h="en-marker"][data-v="${l1}"]`);
        t.sjekk((await spill(t)).tur.markert.length === 0, "Et trykk til på et markert navn fjernet ikke merket");
      }
    },
  });
  sp = await spill(t);
  t.sjekk(sp.slutt[w1] === "bytter" && sp.slutt[b] === "landsby" && sp.slutt[l1] === "varulv" && sp.slutt[w2] === "varulv" && sp.slutt[k] === "brak", `Byttene ble ikke utført i riktig rekkefølge (bytteren først, så bråkmakeren): ${sp.roller} → ${sp.slutt}`);
  // The village points at w1 – who is no longer a wolf → the wolves win
  await enDagOgStemme([w1]);
  await t.bilde("en7-avsloring");
  tekst = ren(await t.tekst(".skjerm-en-avsloring"));
  t.sjekk(/Varulvene vinner runden!/.test(await t.tekst("#skjerm h1")) && /Bytter/i.test(await t.tekst(".vu-pekte .stempel")), `Sju spillere: avsløringen sier «${ren(await t.tekst("#skjerm h1"))}» og stempelet «${await t.tekst(".vu-pekte .stempel")}»`);
  t.sjekk(tekst.includes("Ingen varulv ble pekt ut. Varulvene var") && tekst.includes(`Bråkmakeren ${navnFor(k)} byttet om rollene til ${navnFor(b)} og ${navnFor(l1)}: ${navnFor(b)} ble landsbyboer, og ${navnFor(l1)} ble varulv.`), `Sju spillere: historien er feil: ${tekst}`);
  t.sjekk((await t.antall(".vu-rolleliste li.ulv")) === 2 && (await t.antall(".vu-rolleliste li")) === 7, "«Hvem var hvem?» viser ikke de to som endte som varulver");
  await t.bilde("en7-avsloring-hel", true);
  // «Avslutt» from the reveal: the round counts, and «Kåringen» comes with the points so far
  await t.klikk('.skjerm-en-avsloring [data-h="avslutt"]');
  knapper = await ark(t, "nei");
  t.sjekk(knapper.join("|") === "Spill videre|Avslutt" && (await t.tilstand()).skjerm === "en-avsloring", `Arket for «Avslutt» («Én natt»): ${knapper.join(" / ")}`);
  await t.klikk('.skjerm-en-avsloring [data-h="avslutt"]');
  await ark(t, "ja");
  await t.vent("document.querySelector('.skjerm-slutt')");
  st = await t.tilstand();
  sp = st.spill;
  t.sjekk(st._aktiv === false && sp.ferdig && sp.avbrutt && sp.spilt === 1 && sp.poeng[l1] === 1 && sp.poeng[w2] === 1 && sp.poeng.reduce((a, x) => a + x, 0) === 2, `«Avslutt» etter én runde: ${JSON.stringify(sp.poeng)}`);
  t.sjekk(ren(await t.tekst("#skjerm h1")) === `${[l1, w2].sort((a, c) => a - c).map(navnFor).join(" og ")} vinner!`, `Delt seier skrives «${ren(await t.tekst("#skjerm h1"))}»`);
  gjeng = await kveld(t);
  t.sjekk(gjeng.length === for0.kveld + 2 && gjeng[for0.kveld + 1].resultat.length === 7 && gjeng[for0.kveld + 1].resultat.filter((r) => r.plass === 1).length === 2, `Kveldens gjeng etter «Avslutt» med én runde: ${JSON.stringify(gjeng[for0.kveld + 1])}`);
  t.sjekk(st.stilling.landsby === for0.landsby + 2 && st.stilling.ulv === for0.ulv + 2, `Stillingen etter økt B: ${JSON.stringify(st.stilling)}`);
  await t.bilde("en7-slutt", true);

  // «Spill igjen», then «Avslutt» before a single round is finished: no winner, nothing registered
  await t.klikk('[data-h="igjen"]');
  await t.vent("document.querySelector('.skjerm-en-natt-start')");
  sp = await spill(t);
  t.sjekk(sp.runde === 1 && sp.spilt === 0 && sp.poeng.every((p) => p === 0) && sp.n === 7, "«Spill igjen» startet ikke en ny økt med «Én natt»");
  await t.klikk('[data-h="avslutt"]');
  await ark(t, "ja");
  await t.vent("document.querySelector('.skjerm-slutt')");
  st = await t.tilstand();
  t.sjekk(/Ingen vant denne gangen/.test(await t.tekst("#skjerm h1")) && st._aktiv === false && !(await t.finnes('[data-h="del"]')) && !(await t.finnes(".skjerm-slutt .pall")), "«Avslutt» før første runde ga ikke en kåring uten vinner");
  t.sjekk((await kveld(t)).length === for0.kveld + 2 && st.stilling.landsby + st.stilling.ulv === for0.landsby + for0.ulv + 4, "En økt uten ferdige runder ble registrert");
  await t.klikk("#tilbake");
  t.sjekk((await t.finnes('[data-h="nytt"]')) && !(await t.finnes('[data-h="fortsett"]')), "Hjem-skjermen tilbyr «Fortsett» etter «Avslutt» («Én natt»)");
}

async function odelagtLagring(t) {
  // ---------- A damaged saved state must never give a dead screen ----------
  const odelegg = async (kode, hva) => {
    await t.js(`(() => { const s = JSON.parse(localStorage.getItem("${NOKKEL}")); s._tid = Date.now(); ${kode}; localStorage.setItem("${NOKKEL}", JSON.stringify(s)); })()`);
    await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
    t.sjekk(ren(await t.tekst("#skjerm h1")) === "Varulven" && (await t.finnes('[data-h="nytt"]')) && !(await t.finnes('[data-h="fortsett"]')), `Ødelagt lagring (${hva}) ga ikke en ren hjem-skjerm`);
    await t.klikk('[data-h="nytt"]');
    t.sjekk((await t.finnes(".skjerm-oppsett #spillerboks")) && (await t.finnes('[data-h="start"]:not(:disabled)')), `Ødelagt lagring (${hva}): oppsettet tegnes ikke`);
    await t.klikk("#tilbake");
  };
  await odelegg(`s.spill = "tull"; s.skjerm = "dag"`, "spill er tekst");
  await odelegg(`s.spill = { modus: "klassisk", n: 6, roller: ["varulv", "synsk", "lege", "landsby", "landsby", "landsby"], levende: [true, true, true, true, true, true], tid: 3, fro: 1, natt: 1, dag: 0, valg: {}, vis: { i: 0, sett: false }, hendelser: [], mistanker: [], tur: 7, skjerm: "natt" }; s.skjerm = "natt"`, "nattrunden er et tall");
  await odelegg(`s.spill = { n: 6, roller: ["varulv", "trollmann", "lege", "landsby", "landsby", "landsby"], skjerm: "roller" }; s.skjerm = "roller"`, "ukjent rolle");
  const enSpill = `{ modus: "en", n: 4, runder: 3, runde: 1, spilt: 0, poeng: [0, 0, 0, 0], seirer: { landsby: 0, ulv: 0 }, logg: [], fro: 1, roller: ["varulv", "synsk", "bytter", "landsby"], valg: {}, tur: { rekke: [0, 1, 2, 3], pos: 0, steg: "valg", markert: [] }, slutt: null, klokke: null, pektValg: [], pekt: null }`;
  await odelegg(`s.spill = Object.assign(${enSpill}, { valg: { 0: 0 }, skjerm: "en-natt" }); s.skjerm = "en-natt"`, "«Én natt»: en spiller har valgt seg selv");
  await odelegg(`s.spill = Object.assign(${enSpill}, { tur: null, skjerm: "en-avsloring", pekt: [9] }); s.skjerm = "en-avsloring"`, "«Én natt»: avsløring uten natt");
  await odelegg(`s.spill = Object.assign(${enSpill}, { poeng: "mange", skjerm: "en-natt-start" }); s.skjerm = "en-natt-start"`, "«Én natt»: poengene er tekst");
  await odelegg(`s.stilling = "mange"; s.oppsett = 5; s.antall = "x"; s.spill = [1, 2]; s.skjerm = "slutt"`, "stilling, oppsett og antall er tull");
  t.sjekk((await t.tilstand()).antall === 6, "Antall spillere ble ikke reparert etter ødelagt lagring");
}

// VARULVEN_E2E=klassisk or VARULVEN_E2E=en runs one half only (while developing).
export default async function (t) {
  await t.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await t.start({ navn: NAVN });
  const del = process.env.VARULVEN_E2E || "";
  if (del !== "en") await klassiskSpill(t);
  if (del !== "klassisk") await enNattSpill(t);
  await odelagtLagring(t);
  t.sjekk(!klipte.length, `Innholdet er høyere enn kortet (blir kuttet): ${[...new Set(klipte)].join(", ")}`);
}
