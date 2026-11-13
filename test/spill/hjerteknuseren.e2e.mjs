// Hjerteknuseren: hearts against three phones. Passing three cards to the left (the button waits for
// three), the first trick opens with kløver to, only legal cards can be played (follow suit), the phones
// play by themselves (never behind a sheet, also after a reload), «Siste stikk», a whole round (26
// points shared out), the next round passes to the right, a round without passing; shooting the moon
// at the end of a match → «Kåringen» with the lowest score first, the record and the sticker.
// Runs in every edition (node test/rusj-e2e.mjs --sprak en hjerteknuseren): texts are checked in
// Norwegian only (t.norsk); elsewhere the state, the classes and the links (t.forside, t.nokkel).

// Card number: suit 0 spar, 1 hjerter, 2 ruter, 3 kløver; value 1 (ess) … 13 (konge).
const K = (s, v) => s * 13 + v - 1;

export default async function (t) {
  const sp = async () => (await t.tilstand()).spill;
  const lagret = () => `JSON.parse(localStorage.getItem('${t.nokkel("hjerteknuseren.v1")}')).spill`;
  const lastMed = async (endring) => {
    await t.js(`(() => { const S = Rusj.S; (${endring})(S); Rusj.lagre(); })()`);
    await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
    await t.sov(300);
  };
  // Your move when it is your turn: the first card that may be played.
  const spillRunde = async (maks = 300) => {
    for (let n = 0; n < maks; n++) {
      const s = await sp();
      if (s.r.fase === "ferdig") return s;
      const gjort = await t.js(`(() => { const b = document.querySelector('.hj-hand.min-tur .hj-hk.lovlig'); if (b) { b.click(); return 1; } return 0; })()`);
      await t.sov(gjort ? 200 : 250);
    }
    return sp();
  };

  await t.start();
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");

  await t.klikk('[data-h="nytt"]');
  t.sjekk(!t.norsk || /Gjør klart/.test(await t.tekst("#skjerm h1")), "Oppsettet heter ikke «Gjør klart»");
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.hj-hk').length === 13");
  await t.sov(400);
  let s = await sp();
  t.sjekk(s.niva === 2 && s.mal === "100" && s.r.retning === 0 && s.r.fase === "gi", "Første runde starter ikke med å gi kort til venstre på middels, til 100");
  t.sjekk(s.r.hender.every((h) => h.length === 13), "Alle skal ha 13 kort");
  t.sjekk(!t.norsk || /til venstre – til Mobil 1/.test(await t.tekst(".hj-melding")), "Meldingen sier ikke at kortene går til venstre");
  t.sjekk(await t.finnes('.dokk .knapp[data-h="gi"][disabled]'), "«Gi» kan trykkes før tre kort er valgt");
  const navn = await t.js(`Array.from(document.querySelectorAll('.hj-hk')).map((b) => b.getAttribute('aria-label'))`);
  t.sjekk(navn.every((n) => (t.norsk ? /^(spar|hjerter|ruter|kløver) (ess|to|tre|fire|fem|seks|sju|åtte|ni|ti|knekt|dame|konge)$/ : /^\S+( \S+){1,2}$/).test(n)), `Kortene heter ikke «farge verdi»: ${navn.join(", ")}`);
  t.sjekk(await t.friForDokk(".hj-hand"), "Hånda ligger bak handlingsfeltet");
  // Pick four: the fourth is refused; one off again, then three.
  const kort = s.r.hender[0].slice(0, 4);
  for (const k of kort) await t.klikk(`.hj-hk[data-v="${k}"]`, 120);
  t.sjekk((await t.antall(".hj-hk.valgt")) === 3, "Mer enn tre kort kan velges");
  await t.bilde("gi");
  await t.klikk('.dokk [data-h="gi"]', 500);
  s = await sp();
  t.sjekk(s.r.fase === "spill" && s.r.hender[0].length === 13 && kort.slice(0, 3).every((k) => s.r.hender[1].includes(k)), "Kortene ble ikke gitt til Mobil 1");
  t.sjekk(s.r.mottatt[0].length === 3 && s.r.mottatt[0].every((k) => s.r.hender[0].includes(k)), "Du fikk ikke tre kort fra Mobil 3");
  t.sjekk(!t.norsk || /Du fikk .* fra Mobil 3/.test(await t.tekst(".hj-melding")), "Meldingen sier ikke hva du fikk");
  await t.bilde("fikk");

  // Your turn: only legal cards lift; a wrong card is refused.
  await t.vent(`(() => { const s = ${lagret()}; return s.r.tur === 0 || s.r.fase !== "spill"; })()`, 12000);
  s = await sp();
  if (s.r.tur === 0 && s.r.fase === "spill") {
    const lov = await t.js(`Array.from(document.querySelectorAll('.hj-hk.lovlig')).map((b) => Number(b.dataset.v))`);
    const ulovlig = s.r.hender[0].find((k) => !lov.includes(k));
    if (ulovlig != null) {
      await t.klikk(`.hj-hk[data-v="${ulovlig}"]`, 250);
      t.sjekk((await sp()).r.hender[0].includes(ulovlig), "Et kort som ikke kan legges, ble lagt");
    }
    if (s.r.stikkNr === 0 && !s.r.stikk.length) t.sjekk(lov.length === 1 && lov[0] === K(3, 2), "Første stikk åpnes ikke med kløver to");
    await t.bilde("din-tur");
  }
  // A reload mid-round keeps it; the phones never play behind the rules.
  await t.lastSide(t.side, "document.querySelector('.hj-hand')");
  t.sjekk((await sp()).r.hender[0].length === s.r.hender[0].length, "Runden ble ikke gjenopprettet etter omlasting");
  await t.js(`(() => { const b = document.querySelector('.hj-hand.min-tur .hj-hk.lovlig'); if (b) b.click(); })()`);
  s = await sp();
  if (s.r.fase === "spill" && s.r.tur !== 0) {
    const for0 = s.r.hender.reduce((a, h) => a + h.length, 0);
    await t.klikk("#reglerknapp", 100);
    await t.sov(2000);
    t.sjekk((await sp()).r.hender.reduce((a, h) => a + h.length, 0) === for0, "Mobilene spilte mens reglene var åpne");
    await t.bilde("regler", true);
    await t.klikk('#ark [data-h="lukk-ark"]');
  }

  // The rest of the round.
  s = await spillRunde();
  t.sjekk(s.r.fase === "ferdig" && s.lagt, "Runden ble ikke ferdig");
  const sum = s.r.resultat.poeng.reduce((a, b) => a + b, 0);
  t.sjekk(sum === 26 || sum === 78, `Rundens poeng er ikke 26 (eller 78 med måne): ${sum}`);
  t.sjekk(s.poeng.join() === s.r.resultat.poeng.join(), "Rundens poeng ble ikke lagt til stillingen");
  await t.sov(1500);
  t.sjekk((await t.antall(".hj-resultat li")) === 4, "Resultatet viser ikke alle fire");
  await t.bilde("runde-ferdig");
  await t.klikk('.dokk [data-h="runde"]', 500);
  s = await sp();
  t.sjekk(s.runde === 2 && s.r.retning === 1 && s.r.fase === "gi", "Runde 2 gir ikke kort til høyre");
  t.sjekk(!t.norsk || /til høyre – til Mobil 3/.test(await t.tekst(".hj-melding")), "Meldingen sier ikke at kortene går til høyre");
  // Home: «Fortsett» while the match runs.
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="fortsett"]'), "«Fortsett» er ikke hovedknappen mens spillet pågår");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('.hj-hand')");

  // Shooting the moon in the last trick of a match: you hold hjerter ess and have taken every other point.
  const hjerter = Array.from({ length: 13 }, (_, i) => K(1, i + 1));
  const hender = [[K(1, 1)], [K(3, 2)], [K(2, 3)], [K(0, 4)]];
  const ibruk = new Set([...hender.flat(), ...hjerter, K(0, 12)]);
  const andre = [];
  for (let k = 0; k < 52; k++) if (!ibruk.has(k)) andre.push(k);
  const tatt = [hjerter.filter((k) => k !== K(1, 1)).concat(K(0, 12), andre.slice(0, 5)), andre.slice(5, 17), andre.slice(17, 29), andre.slice(29)];
  await t.start();
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.hj-hand')");
  await lastMed(`(S) => {
    const sp = S.spill;
    sp.poeng = [10, 95, 40, 60];
    sp.runde = 4;
    Object.assign(sp.r, { nr: 3, retning: 3, fase: "spill", hender: ${JSON.stringify(hender)}, tatt: ${JSON.stringify(tatt)}, stikk: [], stikkNr: 12, tur: 0, brutt: true, spilt: [], resultat: null, gitt: [null, null, null, null], mottatt: [[], [], [], []] });
    sp.lagt = false;
  }`);
  t.sjekk(await t.finnes(`.hj-hk.lovlig[data-v="${K(1, 1)}"]`), "Hjerter ess kan ikke spilles ut");
  await t.klikk(`.hj-hk[data-v="${K(1, 1)}"]`, 300);
  await t.vent(`${lagret()}.r.fase === "ferdig"`, 10000);
  s = await sp();
  t.sjekk(s.r.resultat.maane === 0 && s.r.resultat.poeng.join() === "0,26,26,26", "Å ta alle poengene ga ikke 26 til alle de andre");
  t.sjekk(s.poeng.join() === "10,121,66,86", "Stillingen etter månen er feil");
  await t.sov(1600);
  t.sjekk(!t.norsk || /Du vinner kampen!/.test(await t.tekst(".hj-melding")), "Meldingen sier ikke at du vant kampen");
  await t.bilde("maanen");
  await t.klikk('.dokk [data-h="kaaring"]');
  await t.vent("document.querySelector('.skjerm-slutt')");
  await t.sov(400);
  t.sjekk(!t.norsk || /Kåringen/i.test(await t.tekst("#topp-tittel")), "Sluttskjermen heter ikke «Kåringen»");
  t.sjekk(!t.norsk || /Du vinner!/.test(await t.tekst("#skjerm h1")), "Kåringen sier ikke at du vant");
  const rekke = await t.js(`Array.from(document.querySelectorAll('.hj-tavle .sum')).map((x) => Number(x.textContent))`);
  t.sjekk(rekke.join() === "10,66,86,121", `Tavla har ikke lavest først: ${rekke.join(", ")}`);
  const st = await t.tilstand();
  t.sjekk(st.rekord[2] && st.rekord[2].seier === 1 && st.rekord[2].best === 10, "Seieren ble ikke telt i rekorden");
  const merker = await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("merker")}") || "{}")`);
  t.sjekk(merker["klassiker-hjerteknuseren"], "Klistremerket for å slå mobilen ble ikke gitt");
  t.sjekk(await t.finnes('.dokk [data-h="del"]') && (await t.finnes(`.dokk a.lenke[href="${t.forside}"]`)), "Kåringen mangler «Del resultatet» eller «Alle spill»");
  await t.bilde("kaaringen", true);
  await t.klikk('[data-h="del"]', 600);
  if (await t.finnes("#ark:not([hidden])")) await t.klikk('#ark [data-h="lukk-ark"]');

  // Home shows the record.
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes(".hj-rekorder"), "Rekorden mot mobilen vises ikke på hjem");
  await t.bilde("hjem-rekord");

  // A new match at Vanskelig, to 50; the fourth round has no passing; «Siste stikk» after two tricks.
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="niva"][data-v="3"]');
  await t.klikk('[data-h="mal"][data-v="50"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.hj-hand')");
  s = await sp();
  t.sjekk(s.niva === 3 && s.mal === "50", "Oppsettet ble ikke vanskelig, til 50");
  await lastMed(`(S) => { const sp = S.spill; sp.runde = 3; sp.lagt = true; sp.r.fase = "ferdig"; sp.r.resultat = { tatt: [0, 0, 0, 0], poeng: [0, 0, 0, 0], maane: null }; }`);
  await t.klikk('.dokk [data-h="runde"]', 500);
  s = await sp();
  t.sjekk(s.runde === 4 && s.r.retning === 3 && s.r.fase === "spill", "Fjerde runde har ikke «ingen bytter»");
  t.sjekk(!(await t.finnes('.dokk [data-h="gi"]')), "Fjerde runde ber om å gi kort");
  for (let n = 0; n < 60 && (await sp()).r.spilt.length < 2; n++) {
    await t.js(`(() => { const b = document.querySelector('.hj-hand.min-tur .hj-hk.lovlig'); if (b) b.click(); })()`);
    await t.sov(300);
  }
  await t.vent(`document.querySelector('.dokk [data-h="siste"]')`, 8000);
  await t.klikk('.dokk [data-h="siste"]', 300);
  t.sjekk((await t.antall("#ark .hj-siste li")) === 4, "«Siste stikk» viser ikke fire kort");
  await t.bilde("siste-stikk", true);
  await t.klikk('#ark [data-h="lukk-ark"]');
  await t.klikk('[data-h="avslutt"]');
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.vent("document.querySelector('.skjerm-slutt')");
  t.sjekk(!t.norsk || /Ingen vinner/.test(await t.tekst("#skjerm h1")), "Kåringen etter et avbrutt spill uten poeng kårer en vinner");
}
