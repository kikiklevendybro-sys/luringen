// Verktøykassa: the toolbox, then every tool. «Hvem starter?» is tested with real multi-touch
// (Input.dispatchTouchEvent): three fingers → one picked, four → an order 1–4, four → two teams of two,
// one finger alone → no pick; the name draw for phones without touch. Then dice, teams, rock-paper-
// scissors (against the phone and face to face), coin, random numbers without repeats, the score
// counter with undo and a crowning, the countdown running out and the stopwatch with laps, reloads
// and small screens. Random results are forced by stubbing crypto.getRandomValues.
// Runs in every edition (node test/rusj-e2e.mjs --sprak en verktoykassa): the texts are checked in
// Norwegian only (t.norsk); elsewhere the state, the names and the links (t.forside, t.nokkel).
const NAVN = ["Testspiller A", "Testspiller B", "Testspiller C", "Testspiller D", "Testspiller E"];

export default async function (t) {
  // Each call of R.nyttFro() returns the next value u (0 ≤ u < 1) from this list.
  const tilfeldig = (u) => t.js(`(() => { const v = ${JSON.stringify(u)}; let i = 0; crypto.getRandomValues = (a) => { a[0] = Math.floor(v[i++ % v.length] * 4294967296); return a; }; })()`);
  const ekte = () => t.js("delete crypto.getRandomValues");
  const terninger = (verdier) => tilfeldig(verdier.map((v) => (v - 0.5) / 6));
  const apne = async (id) => {
    if (!(await t.finnes('[data-h="apne"]'))) {
      await t.klikk("#tilbake");
      // Back on the home screen the kit steps back in the browser history; let that finish first
      // (a scripted tap a few ms later can otherwise race it).
      await t.vent("!(history.state && history.state.rusj)", 4000);
      await t.sov(150);
    }
    await t.klikk(`[data-h="apne"][data-v="${id}"]`);
    await t.sov(420);
  };
  const fingre = async (antall) => {
    const b = await t.js("(() => { const r = document.querySelector('#vk-pad').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()");
    const steder = [[0.25, 0.3], [0.72, 0.36], [0.4, 0.7], [0.78, 0.78]].slice(0, antall);
    const punkter = steder.map(([fx, fy], i) => ({ x: Math.round(b.x + b.w * fx), y: Math.round(b.y + b.h * fy), id: i + 1 }));
    await t.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: punkter });
    return punkter;
  };
  const slipp = () => t.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  let s;

  // ---------- The toolbox ----------
  await t.start({ navn: NAVN });
  t.sjekk((await t.antall('[data-h="apne"]')) === 8, "Verktøykassa skal ha åtte verktøy");
  t.sjekk(await t.finnes('.vk-helt[data-v="starter"]'), "«Hvem starter?» skal være det store verktøyet øverst");
  await t.bilde("verktoy", true);

  // ---------- Hvem starter? ----------
  await apne("starter");
  t.sjekk(await t.finnes("#vk-pad"), "Flaten for fingrene vises ikke");
  await t.bilde("starter-tom");
  await fingre(3);
  await t.sov(700);
  t.sjekk((await t.antall("#vk-pad .vk-finger")) === 3, "Tre fingrer skal gi tre ringer");
  await t.bilde("starter-fingre");
  await t.vent("document.querySelector('#vk-pad.valgt')", 6000);
  await t.sov(700);
  t.sjekk((await t.antall("#vk-pad .vk-finger.vinner")) === 1 && (await t.antall("#vk-pad .vk-finger.taper")) === 2, "Én finger skulle vært valgt");
  await t.bilde("starter-valgt");
  await slipp();
  await t.vent("!document.querySelector('#vk-pad .vk-finger')", 6000);

  await t.klikk('[data-h="starter-modus"][data-v="rekke"]');
  await fingre(4);
  await t.vent("document.querySelector('#vk-pad.valgt')", 6000);
  await t.sov(1500);
  const nr = await t.js("[...document.querySelectorAll('#vk-pad .vk-finger')].map((f) => Number(f.dataset.nr)).sort()");
  t.sjekk(JSON.stringify(nr) === "[1,2,3,4]", `Rekkefølgen skal være 1–4 én gang hver: ${nr}`);
  await t.bilde("starter-rekke");
  await slipp();
  await t.vent("!document.querySelector('#vk-pad .vk-finger')", 6000);

  await t.klikk('[data-h="starter-modus"][data-v="lag"]');
  await fingre(4);
  await t.vent("document.querySelector('#vk-pad.valgt')", 6000);
  await t.sov(600);
  const lag = await t.js("[...document.querySelectorAll('#vk-pad .vk-finger')].map((f) => f.dataset.lag)");
  t.sjekk(lag.filter((l) => l === "0").length === 2 && lag.filter((l) => l === "1").length === 2, `To lag à to: ${lag}`);
  await t.bilde("starter-lag");
  await slipp();
  await t.vent("!document.querySelector('#vk-pad .vk-finger')", 6000);

  // One finger alone is never picked
  await t.klikk('[data-h="starter-modus"][data-v="en"]');
  await fingre(1);
  await t.sov(3200);
  t.sjekk(!(await t.finnes("#vk-pad.valgt")), "Én finger alene skal ikke bli valgt");
  t.sjekk(!t.norsk || /Flere/.test(await t.tekst(".vk-pad-hjelp")), "Flaten sier ikke at flere må være med");
  await slipp();

  // No touch screen: draw a name instead
  await t.klikk('[data-h="starter-navn"]');
  await t.vent("document.querySelector('#vk-trekk.ferdig')", 6000);
  t.sjekk((t.norsk ? /Testspiller [A-E] starter!/ : /Testspiller [A-E]/).test(await t.tekst("#vk-trekk")), `Navnetrekningen ga «${await t.tekst("#vk-trekk")}»`);
  await t.bilde("starter-navn");
  await t.klikk('#ark [data-h="apne"][data-v="lag"]');

  // ---------- Teams ----------
  await t.vent("document.querySelector('.skjerm-lag')");
  t.sjekk((await t.antall(".spiller")) === 5, "Lagdeleren viser ikke de fem navnene");
  await t.klikk('[data-h="lag-del"]');
  await t.vent("document.querySelectorAll('.vk-lag').length === 2");
  let storrelser = await t.js("[...document.querySelectorAll('.vk-lag')].map((l) => l.querySelectorAll('li').length).sort()");
  t.sjekk(JSON.stringify(storrelser) === "[2,3]", `Fem på to lag skal bli 3 og 2: ${storrelser}`);
  t.sjekk(!t.norsk || (/Lag Rosa/.test(await t.tekst(".vk-lagene")) && /Lag Gul/.test(await t.tekst(".vk-lagene"))), "Lagene skal hete «Lag Rosa» og «Lag Gul»");
  await t.sov(900);
  await t.bilde("lag-2");
  await t.klikk('[data-h="lag-endre"]');
  await t.klikk('[data-h="lag-antall"][data-v="3"]');
  await t.klikk('[data-h="lag-del"]');
  await t.vent("document.querySelectorAll('.vk-lag').length === 3");
  storrelser = await t.js("[...document.querySelectorAll('.vk-lag')].map((l) => l.querySelectorAll('li').length).sort()");
  t.sjekk(JSON.stringify(storrelser) === "[1,2,2]", `Fem på tre lag skal bli 2, 2 og 1: ${storrelser}`);
  await t.sov(900);
  await t.bilde("lag-3");

  // ---------- Dice (the kit's tray: R.terninger) ----------
  // The value on the face that points up on every die, read from how each cube is turned on screen.
  const topp = () =>
    t.js(`Array.from(document.querySelectorAll("#vk-terninger .trn-t")).map((b) => {
      const m = new DOMMatrix(getComputedStyle(b.querySelector(".trn-kube")).transform);
      const z = [m.m13, m.m23, m.m33];
      let best = -Infinity;
      let verdi = 0;
      b.querySelectorAll(".trn-flate").forEach((f, a) => {
        const opp = (a & 1 ? -1 : 1) * z[a >> 1];
        if (opp > best) {
          best = opp;
          verdi = Number(f.dataset.v);
        }
      });
      return verdi;
    }).join(",")`);
  await apne("terninger");
  await t.klikk('[data-h="terning-antall"][data-v="1"]');
  t.sjekk((await t.antall("#vk-terninger .trn-t")) === 3, "Tre terninger vises ikke");
  await terninger([2, 4, 6]);
  await t.klikk('[data-h="terning-kast"]', 0);
  await t.sov(150);
  await t.bilde("terninger-i-lufta");
  await t.vent("document.querySelector('#vk-sum.ny')", 6000);
  t.sjekk((await t.tekst("#vk-sum")).trim() === "12", `Summen skulle vært 12, ikke ${await t.tekst("#vk-sum")}`);
  t.sjekk((await topp()) === "2,4,6", `Terningene viser ${await topp()} på toppen, verktøyet kastet 2, 4 og 6`);
  t.sjekk(/2.*4.*6/.test(await t.js(`document.querySelector("#vk-terninger .trn-scene").getAttribute("aria-label")`)), "Terningbrettet sier ikke hva terningene viser");
  await t.bilde("terninger");
  // A fling on the tray throws too, with six dice
  for (let n = 0; n < 3; n++) await t.klikk('[data-h="terning-antall"][data-v="1"]', 60);
  await terninger([1, 2, 3, 4, 5, 6]);
  const p = await t.js(`(() => { const b = document.querySelector("#vk-terninger").getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height * 0.7 }; })()`);
  await t.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: p.x, y: p.y }] });
  for (let i = 1; i <= 6; i++) {
    await t.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: p.x - i * 4, y: p.y - i * 22 }] });
    await t.sov(12);
  }
  await t.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await t.vent("document.querySelector('#vk-sum.ny') && document.querySelector('#vk-sum').textContent.trim() === '21'", 6000);
  t.sjekk((await topp()) === "1,2,3,4,5,6", `Etter sveipet viser terningene ${await topp()}`);
  await ekte();
  await t.bilde("terninger-seks");
  t.sjekk(await t.friForDokk("#vk-terninger"), "Terningbrettet ligger bak kast-knappen");

  // ---------- Rock, paper, scissors ----------
  await apne("ssp");
  // Leaving in the middle of «Stein … saks … papir!» must not leave the buttons dead
  await t.klikk('[data-h="ssp-spill"][data-v="papir"]', 60);
  await t.klikk("#tilbake");
  await t.vent("!(history.state && history.state.rusj)", 4000);
  await t.sov(1300);
  await apne("ssp");
  t.sjekk((await t.tilstand()).ssp.du + (await t.tilstand()).ssp.mobil + (await t.tilstand()).ssp.likt === 0, "En avbrutt runde skulle ikke telle");
  await tilfeldig([0.5]); // the phone picks scissors
  await t.klikk('[data-h="ssp-spill"][data-v="stein"]');
  await t.vent("document.querySelector('#vk-arena.avslort')", 6000);
  await ekte();
  t.sjekk((t.norsk ? /Du vant/ : /!/).test(await t.tekst("#vk-ssp-res")), "Stein mot saks skulle vunnet");
  s = await t.tilstand();
  t.sjekk(s.ssp.du === 1 && s.ssp.mobil === 0, "Stillingen ble ikke talt");
  await t.sov(300);
  await t.bilde("ssp-mobil");
  await t.klikk('[data-h="ssp-modus"][data-v="to"]');
  await t.klikk('[data-h="ssp-to"][data-v="a:stein"]');
  t.sjekk(!(await t.finnes(".vk-ssp-avsl")), "Valget skal være hemmelig til begge har valgt");
  await t.bilde("ssp-to-en-klar");
  await t.klikk('[data-h="ssp-to"][data-v="b:papir"]');
  s = await t.tilstand();
  t.sjekk(s.ssp.poengB === 1 && s.ssp.poengA === 0, "Papir skulle slått stein");
  t.sjekk((await t.antall(".vk-ssp-avsl")) === 2, "Begge halvdelene skal vise valgene");
  await t.bilde("ssp-to");
  await t.klikk('[data-h="ssp-ny"]');
  t.sjekk((await t.antall('[data-h="ssp-to"]')) === 6, "«Ny runde» viser ikke knappene igjen");

  // ---------- Coin ----------
  await apne("mynt");
  await tilfeldig([0.2]);
  await t.klikk('.dokk [data-h="mynt-kast"]');
  await t.vent("document.querySelector('#vk-mynt-res.ny')", 6000);
  await ekte();
  t.sjekk(!t.norsk || (await t.tekst("#vk-mynt-res")).trim() === "Kron!", "Mynten skulle vist kron");
  await t.bilde("mynt");
  await tilfeldig([0.8]);
  await t.klikk('.dokk [data-h="mynt-kast"]');
  await t.vent(`(${t.norsk ? "/Mynt/" : "/!/"}).test(document.querySelector('#vk-mynt-res').textContent) && document.querySelector('#vk-mynt-res.ny')`, 6000);
  await ekte();
  s = await t.tilstand();
  t.sjekk(s.mynt.kron === 1 && s.mynt.mynt === 1, "Kron og mynt ble ikke talt");

  // ---------- Random number without repeats ----------
  await apne("tall");
  await t.klikk('[data-h="tall-fast"][data-v="1-6"]');
  await t.klikk('[data-h="tall-unik"]');
  await t.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  for (let k = 0; k < 6; k++) {
    await t.klikk('[data-h="tall-trekk"]', 60);
    await t.vent(`JSON.parse(localStorage.getItem("${t.nokkel("verktoykassa.v1")}")).tall.trukket.length === ${k + 1} && document.querySelector('#vk-tall.ny')`, 4000);
  }
  await t.send("Emulation.setEmulatedMedia", { features: [] });
  s = await t.tilstand();
  t.sjekk(JSON.stringify([...s.tall.trukket].sort()) === "[1,2,3,4,5,6]", `Tallene 1–6 skulle kommet én gang hver: ${s.tall.trukket}`);
  t.sjekk(!(await t.finnes('[data-h="tall-trekk"]')) && (!t.norsk || /Start på nytt/.test(await t.tekst(".dokk .knapp"))), "Når alle tallene er trukket, skal hovedknappen være «Start på nytt»");
  await t.bilde("tall");
  await t.klikk('.dokk [data-h="tall-nullstill"]');
  t.sjekk((await t.tilstand()).tall.trukket.length === 0, "«Nullstill» tømte ikke lista");

  // ---------- Score counter ----------
  await apne("poeng");
  for (let k = 0; k < 3; k++) await t.klikk('[data-h="poeng-endre"][data-v="0:1"]', 60);
  await t.klikk('[data-h="poeng-steg"][data-v="5"]');
  await t.klikk('[data-h="poeng-endre"][data-v="1:1"]');
  s = await t.tilstand();
  t.sjekk(s.poeng.verdier[0] === 3 && s.poeng.verdier[1] === 5, `Poengene ble ${s.poeng.verdier.slice(0, 2)}`);
  t.sjekk((t.norsk ? /Angre \+5 til Testspiller B/ : /\+5.*Testspiller B/).test(await t.tekst('[data-h="poeng-angre"]')), "Mangler «Angre +5 til Testspiller B»");
  await t.klikk('[data-h="poeng-angre"]');
  t.sjekk((await t.tilstand()).poeng.verdier[1] === 0, "«Angre» tok ikke poengene tilbake");
  await t.klikk('[data-h="poeng-endre"][data-v="1:1"]');
  await t.klikk('[data-h="poeng-legg-til"]');
  await t.skrivInn("#navn-2", "Testspiller C");
  // A real double tap on × removes only one player (and keeps the next name)
  await t.klikk('[data-h="poeng-legg-til"]');
  await t.skrivInn("#navn-3", "Testspiller D");
  await t.sov(400);
  const x = await t.js(`(() => { const b = document.querySelector('[data-h="poeng-fjern"][data-v="2"]').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
  for (const n of [1, 2]) {
    await t.send("Input.dispatchMouseEvent", { type: "mousePressed", x: x.x, y: x.y, button: "left", buttons: 1, clickCount: n });
    await t.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: x.x, y: x.y, button: "left", buttons: 0, clickCount: n });
    if (n === 1) await t.sov(90);
  }
  await t.sov(300);
  t.sjekk((await t.tilstand()).poeng.antall === 3, "Dobbelttrykk på × fjernet mer enn én spiller");
  await t.skrivInn("#navn-2", "Testspiller C");
  t.sjekk((await t.antall(".vk-pt-rad")) === 3, "Fikk ikke lagt til en tredje spiller");
  await t.lastSide(t.side, "document.querySelector('.vk-pt')");
  s = await t.tilstand();
  t.sjekk(s.skjerm === "poeng" && s.poeng.verdier[1] === 5 && s.poeng.antall === 3, "Poengtelleren ble ikke husket etter omlasting");
  await t.bilde("poeng");
  await t.klikk('[data-h="poeng-kaar"]');
  await t.vent("document.querySelector('.skjerm-kaaring')");
  t.sjekk(t.norsk ? (await t.tekst("#skjerm h1")).trim() === "Testspiller B vinner!" : /Testspiller B/.test(await t.tekst("#skjerm h1")), `Kåringen sier «${await t.tekst("#skjerm h1")}»`);
  t.sjekk(await t.finnes(".pall") && (await t.finnes(".poengliste")), "Kåringen mangler pall eller poengliste");
  t.sjekk(!t.norsk || /KÅRINGEN|Kåringen/.test(await t.tekst("#topp-tittel")), "Sluttskjermen skal hete «Kåringen»");
  await t.sov(500);
  await t.bilde("kaaring", true);
  await t.sov(1800);
  if (await t.finnes('#ark:not([hidden]) [data-h="lukk-ark"]')) await t.klikk('#ark [data-h="lukk-ark"]');
  // Back and «Kår vinneren» again: the evening scoreboard gets the result only once
  await t.klikk("#tilbake");
  await t.klikk('[data-h="poeng-kaar"]');
  await t.vent("document.querySelector('.skjerm-kaaring')");
  const kveld = await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("kveld")}") || "null")`);
  t.sjekk(kveld && kveld.spill.filter((x) => x.id === "verktoykassa").length === 1, "Samme kåring ble registrert to ganger i Kveldens gjeng");
  await t.sov(1900);
  if (await t.finnes('#ark:not([hidden]) [data-h="lukk-ark"]')) await t.klikk('#ark [data-h="lukk-ark"]');
  await t.klikk('[data-h="poeng-igjen"]');
  s = await t.tilstand();
  t.sjekk(s.skjerm === "poeng" && s.poeng.verdier.every((p) => p === 0), "«Spill igjen» nullstilte ikke poengene");

  // ---------- Clock: countdown runs out, stopwatch with a lap ----------
  await apne("klokke");
  await t.klikk('[data-h="klokke-tid"][data-v="30"]');
  await t.klikk('[data-h="klokke-juster"][data-v="-1"]');
  t.sjekk((await t.tilstand()).klokke.sekunder === 10, "Korteste nedtelling skal være 10 s");
  await t.klikk('[data-h="klokke-veksle"]');
  t.sjekk(!!(await t.tilstand()).klokke.slutt, "Nedtellingen startet ikke");
  await t.sov(1200);
  await t.bilde("nedtelling");
  await t.vent("document.querySelector('.vk-ute')", 14000);
  await t.bilde("tiden-er-ute");
  await t.klikk('[data-h="klokke-modus"][data-v="stopp"]');
  await t.klikk('[data-h="stopp-veksle"]');
  await t.sov(1300);
  await t.klikk('[data-h="stopp-runde"]');
  await t.sov(400);
  await t.lastSide(t.side, "document.querySelector('#vk-stoppur')");
  s = await t.tilstand();
  t.sjekk(!!s.klokke.stopp.start && s.klokke.stopp.runder.length === 1, "Stoppeklokka ble ikke husket etter omlasting");
  await t.klikk('[data-h="stopp-veksle"]');
  s = await t.tilstand();
  t.sjekk(!s.klokke.stopp.start && s.klokke.stopp.akk >= 1500, `Stoppeklokka tok feil tid: ${s.klokke.stopp.akk} ms`);
  await t.bilde("stoppeklokke");

  // ---------- Small screens ----------
  const [b0, h0] = await t.js("[window.innerWidth, window.innerHeight]");
  for (const [b, h] of [[320, 568], [Math.min(375, b0), 560]]) {
    await t.send("Emulation.setDeviceMetricsOverride", { width: b, height: h, deviceScaleFactor: 2, mobile: true });
    await t.klikk("#tilbake");
    await t.sov(400);
    t.sjekk(await t.js("document.documentElement.scrollWidth <= window.innerWidth"), `Verktøykassa er for bred på ${b} px`);
    const kuttet = await t.js("[...document.querySelectorAll('.vk-flis b, .vk-helt b')].filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent)");
    t.sjekk(!kuttet.length, `Verktøynavn får ikke plass på ${b} px: ${kuttet.join(", ")}`);
    await t.bilde(`verktoy-${b}x${h}`);
    await apne("starter");
    const pad = await t.js("(() => { const r = document.querySelector('#vk-pad').getBoundingClientRect(); return r.bottom <= window.innerHeight + 1 && r.height >= 240; })()");
    t.sjekk(pad, `Fingerflaten får ikke plass på ${b} × ${h}`);
    await t.bilde(`starter-${b}x${h}`);
    await apne("poeng");
    t.sjekk(await t.js("document.documentElement.scrollWidth <= window.innerWidth"), `Poengtelleren er for bred på ${b} px`);
    const rad = await t.js(`(() => {
      const r = document.querySelector('.vk-pt-rad');
      const boks = (s) => r.querySelector(s).getBoundingClientRect();
      const [minus, sum, pluss, navn] = [boks('[data-v$=":-1"]'), boks('.vk-pt-sum'), boks('[data-v$=":1"]'), boks('.vk-pt-navn')];
      return navn.right <= minus.left + 1 && minus.right <= sum.left + 1 && sum.right <= pluss.left + 1 && navn.width >= 80;
    })()`);
    t.sjekk(rad, `Navn, −, poeng og + overlapper i poengtelleren på ${b} px`);
    await t.bilde(`poeng-${b}x${h}`);
  }
  await t.send("Emulation.setDeviceMetricsOverride", { width: b0, height: h0, deviceScaleFactor: 2, mobile: true });
}
