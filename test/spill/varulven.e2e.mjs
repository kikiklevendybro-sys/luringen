// Varulven: two full games on one phone.
// Game 1 (6 players, 1 wolf, seer, doctor): role pass with a reload, night 1 where the doctor saves
// the wolves' target (with a reload mid-night), day 1 voting out an innocent, night 2 with a death
// (the doctor may not protect the same person twice), day 2 voting out the wolf → the village wins.
// Game 2 (with the hunter): the hunter is voted out and shoots, the wolves win. Plus 18 players in
// setup, "forgot your role", back + continue and a 320 px check.
const NAVN = ["Testspiller A", "Testspiller B", "Testspiller C", "Testspiller D", "Testspiller E", "Testspiller F"];
const ROLLENAVN = { varulv: "Varulv", synsk: "Synsk", lege: "Lege", jeger: "Jeger", landsby: "Landsbyboer" };

const spill = async (t) => (await t.tilstand()).spill;
const lever = (sp) => sp.levende.map((l, i) => (l ? i : -1)).filter((i) => i >= 0);

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

// The card's instruction («Hold fingeren på kortet for å se») must not hide behind the dock.
const overDokken = (t, sel) =>
  t.js(`(() => {
    window.scrollTo(0, 0);
    const el = document.querySelector(${JSON.stringify(sel)});
    const dokk = document.querySelector("#skjerm .dokk");
    if (!el || !dokk) return true;
    const a = el.getBoundingClientRect();
    const d = dokk.getBoundingClientRect();
    // Beside the dock (a phone on its side: the dock is a column on the right) is fine when it is inside the screen.
    return a.right <= d.left + 1 || a.left >= d.right - 1 ? a.bottom <= window.innerHeight + 1 : a.bottom <= d.top + 1;
  })()`);

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

// Everyone holds to see their role. Optional reload after `omlast` players.
async function rollerunde(t, o = {}) {
  const sp = await spill(t);
  for (let i = 0; i < sp.n; i++) {
    const sel = `.mappe[data-mappe="r${i}"]`;
    await t.vent(`document.querySelector('${sel}')`);
    t.sjekk(await t.finnes('[data-h="vist"]:disabled'), "«Ferdig» skal være låst til rollen er sett");
    if (i === 0) t.sjekk(await overDokken(t, `${sel} .mappe-finger`), "Instruksen på rollekortet ligger bak knappen nederst");
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
    t.sjekk(tekst.includes(ROLLENAVN[sp.roller[i]]), `Spiller ${i + 1} skulle sett rollen ${ROLLENAVN[sp.roller[i]]}, men kortet viser: ${tekst.replace(/\s+/g, " ")}`);
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
async function spillNatt(t, velg, o = {}) {
  await t.vent("document.querySelector('[data-h=\"start-natt\"]')");
  if (o.bilder) await t.bilde("natt-start");
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
    if (o.bilder && tur === 0) await t.bilde("natt-gi");
    await t.klikk('[data-h="jeg-er"]');
    await t.vent("document.querySelector('[data-h=\"marker\"]')");
    t.sjekk(await t.finnes('[data-h="velg"]:disabled'), "Nattvalget kan bekreftes før et navn er valgt");
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
    t.sjekk(/^(Ta|Se på|Beskytt|Mistenk) /.test(knapp), `Bekreft-knappen om natta sier «${knapp}»`);
    if (o.bilder && !avbildet.has(rolle)) await t.bilde(`natt-valg-${rolle}`);
    await t.klikk('[data-h="velg"]');
    await t.vent("document.querySelector('[data-h=\"natt-ferdig\"]')");
    t.sjekk((await spill(t)).valg[meg] === mal, "Nattvalget ble ikke det som ble bekreftet");
    t.sjekk(await t.finnes('[data-h="natt-ferdig"]:disabled'), "«Ferdig» om natta skal vente litt for alle roller");
    if (rolle === "synsk") {
      const svar = await t.tekst(".vu-svar h1");
      const ulv = sp.roller[mal] === "varulv";
      t.sjekk(ulv ? /er varulv/.test(svar) : /ikke varulv/.test(svar), `Synsk fikk feil svar om ${NAVN[mal]}: ${svar}`);
    }
    if (o.bilder && !avbildet.has(rolle)) {
      await t.bilde(`natt-svar-${rolle}`);
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

export default async function (t) {
  await t.start({ navn: NAVN });
  await t.klikk('[data-h="nytt"]');
  t.sjekk((await t.tilstand()).antall === 6, "Antall spillere følger ikke navnene som finnes");

  // 18 players: the recommendation follows, then back to 6
  for (let i = 0; i < 12; i++) await t.klikk('[data-h="spiller-legg-til"]', 40);
  t.sjekk(/Anbefalt: 4/.test(await t.tekst(".skjerm-oppsett")), "Anbefalt antall varulver for 18 spillere er ikke 4");
  t.sjekk(await t.finnes('[data-h="spiller-legg-til"]:disabled'), "Kan legge til flere enn 18 spillere");
  await t.bilde("oppsett-18", true);
  // 18 players on the smallest phone: the role card's instruction stays above the dock, and the
  // whole back of the card fits
  const [bredde, hoyde] = await t.js("[window.innerWidth, window.innerHeight]");
  await t.send("Emulation.setDeviceMetricsOverride", { width: 320, height: 568, deviceScaleFactor: 2, mobile: true });
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.mappe[data-mappe=\"r0\"]')");
  t.sjekk(await overDokken(t, '.mappe[data-mappe="r0"] .mappe-finger'), "Med 18 spillere ligger instruksen på rollekortet bak knappen (320×568)");
  await les(t, '.mappe[data-mappe="r0"]');
  await t.bilde("18-spillere-320");
  await t.send("Emulation.setDeviceMetricsOverride", { width: bredde, height: hoyde, deviceScaleFactor: 2, mobile: true });
  await t.klikk("#tilbake");
  await t.klikk('[data-h="nytt"]');
  await t.vent("document.querySelector('#ark:not([hidden]) [data-h=\"ark-svar\"][data-v=\"ja\"]')");
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.vent("document.querySelector('.skjerm-oppsett')");
  for (let i = 17; i >= 6; i--) await t.klikk(`[data-h="spiller-fjern"][data-v="${i}"]`, 40);
  t.sjekk((await t.tilstand()).antall === 6, "Fikk ikke fjernet spillerne igjen");
  t.sjekk(await t.finnes('[data-h="ulver"][data-v="1"]:disabled'), "6 spillere skal ha maks 1 varulv");
  await t.klikk('[data-h="rolle"][data-v="jeger"]');
  t.sjekk((await t.tilstand()).oppsett.jeger === true, "Jeger ble ikke slått på");
  await t.klikk('[data-h="rolle"][data-v="jeger"]');
  await t.bilde("oppsett", true);

  // ---------- Game 1: the village wins ----------
  await t.klikk('[data-h="start"]');
  let sp = await spill(t);
  t.sjekk(sp.roller.filter((r) => r === "varulv").length === 1 && sp.roller.includes("synsk") && sp.roller.includes("lege"), `Feil roller: ${sp.roller}`);
  await rollerunde(t, { bilder: true, omlast: 2 });

  const ulv = sp.roller.indexOf("varulv");
  const lege = sp.roller.indexOf("lege");
  const synsk = sp.roller.indexOf("synsk");
  const bonder = sp.roller.map((r, i) => (r === "landsby" ? i : -1)).filter((i) => i >= 0);
  const [v1, v2, v3] = bonder;

  // Night 1: the wolf goes for v1, the doctor protects v1 → nobody dies. A double tap on the first
  // «Ferdig» must stop at the next gate.
  await spillNatt(
    t,
    (rolle, meg) => (rolle === "varulv" ? v1 : rolle === "lege" ? v1 : rolle === "synsk" ? ulv : meg === ulv ? v1 : ulv),
    {
      bilder: true,
      omlastVed: 2,
      dobbeltrykk: true,
      sjekk: async (rolle) => {
        if (rolle !== "varulv") return;
        const tekst = await t.tekst(".vu-oppdrag");
        t.sjekk(/Du er den eneste varulven\./.test(tekst) && !/igjen/.test(tekst), `Ulven alene natt 1 ser: ${tekst.replace(/\s+/g, " ")}`);
      },
    },
  );
  await morgen(t, "morgen-reddet");
  sp = await spill(t);
  t.sjekk(sp.morgen.reddet && lever(sp).length === 6, "Legen reddet ikke offeret");
  t.sjekk(/overlevde/.test(await t.tekst("#skjerm h1")), "Morgenen sier ikke at alle overlevde");
  await videre(t);

  // Day 1: back + continue, forgot your role, then vote out an innocent
  await t.vent("document.querySelector('.skjerm-dag #klokke')");
  await t.bilde("dag");
  await t.klikk("#tilbake");
  t.sjekk(/dag 1/.test(await t.tekst('[data-h="fortsett"]')), "«Fortsett» viser ikke dag 1");
  await t.bilde("hjem-fortsett");
  await t.klikk('[data-h="nytt"]');
  await t.vent("document.querySelector('#ark:not([hidden]) [data-h=\"ark-svar\"][data-v=\"nei\"]')");
  await t.klikk('#ark [data-h="ark-svar"][data-v="nei"]');
  t.sjekk((await t.tilstand()).spill !== null, "«Nytt spill» kastet spillet uten å spørre");
  await t.klikk('[data-h="fortsett"]');
  await t.klikk('[data-h="se-igjen"]');
  await t.klikk(`#ark [data-h="ark-svar"][data-v="${lever(sp).indexOf(lege)}"]`);
  await t.vent(`document.querySelector('#ark:not([hidden]) .mappe[data-mappe="r${lege}"]')`);
  t.sjekk((await les(t, `#ark .mappe[data-mappe="r${lege}"]`)).includes("Lege"), "«Glemt rollen» viste feil rolle");
  await t.klikk('#ark [data-h="lukk-ark"]');
  await stem(t, v2, "utkastet-uskyldig");
  t.sjekk(/Landsbyboer/i.test(await t.tekst(".skjerm-utkastet .stempel")) && /uskyldig/.test(await t.tekst(".skjerm-utkastet")), "Utkastet landsbyboer vises ikke som uskyldig");
  await videre(t);

  // Night 2: the doctor can't protect v1 again; the wolf takes v3
  await spillNatt(
    t,
    (rolle, meg) => (rolle === "varulv" ? v3 : rolle === "lege" ? lege : rolle === "synsk" ? v1 : ulv),
    {
      sjekk: async (rolle) => {
        if (rolle === "lege") t.sjekk(await t.finnes(`[data-h="marker"][data-v="${v1}"]:disabled`), "Legen kan beskytte samme person to netter på rad");
        if (rolle === "varulv") t.sjekk(await t.finnes(`[data-h="marker"][data-v="${ulv}"]:disabled`), "Ulven kan velge seg selv");
      },
    },
  );
  await morgen(t, "morgen-tatt");
  sp = await spill(t);
  t.sjekk(!sp.levende[v3] && sp.morgen.offer === v3, "Ulven tok ikke riktig person natt 2");
  await videre(t);

  // Day 2: the time runs out. «+1 min» cancels the jump to the vote; after a reload, or coming back
  // from the vote, nothing jumps by itself. Then the wolf is voted out → the village wins.
  await t.vent("document.querySelector('.skjerm-dag #klokke')");
  const settSlutt = (ms) =>
    t.js(`(() => { const k = "rusj.varulven.v1"; const s = JSON.parse(localStorage.getItem(k)); Object.assign(s.spill.klokke, { slutt: Date.now() + ${ms}, gaar: true, ute: false }); localStorage.setItem(k, JSON.stringify(s)); })()`);
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
  t.sjekk(/Landsbyen vinner/.test(await t.tekst("#skjerm h1")), "Landsbyen vant ikke");
  t.sjekk(await t.finnes('.skjerm-slutt a[href="/"]'), "Sluttskjermen mangler «Alle spill»");
  t.sjekk((await t.antall(".vu-historikk li")) === 4, "Historikken skal ha fire hendelser");
  t.sjekk(await t.finnes(".vu-stat li"), "Mangler statistikken fra natta");
  await t.bilde("slutt-landsby", true);

  // ---------- Game 2: hunter on, the wolves win ----------
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="rolle"][data-v="jeger"]');
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
  t.sjekk(/Varulvene vinner/.test(await t.tekst("#skjerm h1")), "Varulvene vant ikke");
  t.sjekk(await t.js("document.documentElement.classList.contains('vu-natt')"), "Ulvenes seier har ikke nattlook");
  await t.bilde("slutt-ulv", true);

  // Play again keeps the players and starts a new role pass
  await t.klikk('[data-h="igjen"]');
  await t.vent("document.querySelector('.mappe[data-mappe=\"r0\"]')");
  t.sjekk((await spill(t)).natt === 0, "«Spill igjen» startet ikke et nytt spill");
  t.sjekk(!klipte.length, `Innholdet er høyere enn kortet (blir kuttet): ${[...new Set(klipte)].join(", ")}`);
}
