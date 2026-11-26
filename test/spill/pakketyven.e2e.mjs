// Pakketyven (Pakkeleken): six players round one phone. Setup (parcels follow the players until
// they are set by hand, the length of part 2, «Enere gir bort», the look); part 1 with decided
// throws – a three passes the turn on, a six takes a parcel from the pile and the die on the
// screen really shows six, two real taps 250 ms apart throw once (the rest after every throw), a
// one gives a parcel away (and «Angre» takes the choice back); reload, back + «Fortsett», «Rett
// opp»; the last parcel leads to the screen before part 2 (sound warning); part 2 with the hidden
// clock: nothing on the screen tells the time, setting the phone's own clock does not move it, it
// stands still on the home screen and through a reload (neither reset nor used up) and after a
// reload waits for «Trykk for å fortsette», a six chooses whom to steal from (only those with
// parcels), «Stjel ikke», a six thrown just before time is up may still steal – then
// the horn and «Kåringen» (nobody placed in «Kveldens gjeng»); «Spill igjen», «Avslutt» (two
// kinds), the horn while nobody throws, twenty players, and damaged saves.
// Runs in every edition (texts are checked in Norwegian only) and at every size.
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { mkdirSync } from "node:fs";

function bildemappe(id) {
  const i = process.argv.indexOf("--bilder");
  const rot = i > 0 ? resolve(process.argv[i + 1]) : join(tmpdir(), "rusj-e2e");
  const mappe = join(rot, id);
  mkdirSync(mappe, { recursive: true });
  return mappe;
}
const flaggTall = (navn, standard) => {
  const i = process.argv.indexOf(navn);
  return (i > 0 && Number(process.argv[i + 1])) || standard;
};
const MOBIL = { width: flaggTall("--bredde", 390), height: flaggTall("--hoyde", 844), deviceScaleFactor: 2, mobile: true };
const LIGGENDE = MOBIL.width > MOBIL.height;

const NAVN = ["A", "B", "C", "D", "E", "F"].map((b) => `Testspiller ${b}`);
// The next throws are decided: the game reads its chance from crypto.getRandomValues.
const tving = (verdier) => `(() => { const v = ${JSON.stringify(verdier)}; let i = 0; crypto.getRandomValues = (a) => { a[0] = Math.floor((v[Math.min(i++, v.length - 1)] - 0.5) / 6 * 4294967296); return a; }; })()`;
// The die lies still and the game waits for the next tap (or has left the throwing screen).
const ROLIG = `(() => { const S = Rusj.S, s = S.spill; if (!s || S.skjerm !== "spill") return true; if (document.querySelector("#pt-brett[data-kaster]")) return false; if (s.status === "velg") return !!document.querySelector(".pt-offer"); const k = document.querySelector("#skjerm .dokk .knapp"); return !!k && !k.disabled; })()`;

export default async function (t) {
  const sp = async () => (await t.tilstand()).spill;
  const sett = (endring) => t.js(`(() => { const S = Rusj.S; (${endring})(S); Rusj.vis(); })()`);
  const kast = async (v) => {
    await t.vent(ROLIG, 12000);
    if (v) await t.js(tving([v]));
    await t.klikk('#skjerm .dokk [data-h="kast"]', 80);
    await t.vent(ROLIG, 12000);
    if (v) await t.js("delete crypto.getRandomValues");
    await t.sov(150);
  };
  // What the die shows on top, read from how the cube is turned on the screen.
  const topp = () =>
    t.js(`(() => { const b = document.querySelector("#pt-brett .trn-t"); const m = new DOMMatrix(getComputedStyle(b.querySelector(".trn-kube")).transform); const z = [m.m13, m.m23, m.m33];
      let best = -Infinity, verdi = 0;
      b.querySelectorAll(".trn-flate").forEach((f, a) => { const opp = (a & 1 ? -1 : 1) * z[a >> 1]; if (opp > best) { best = opp; verdi = Number(f.dataset.v); } });
      return verdi; })()`);
  // What is left of the hidden clock, read from the game's state (it is nowhere on the screen).
  const igjen = () => t.js(`(() => { const k = Rusj.S.spill.klokke; return k.slutt != null ? k.slutt - Date.now() : k.igjen; })()`);
  // Nothing on the page may tell the time: no «3:12», no seconds or minutes, no bar or meter.
  const viserTid = () =>
    t.js(`(() => { const tekst = document.querySelector("#skjerm").innerText + " " + document.querySelector("#topp-tittel").textContent + " " + document.title;
      const k = Rusj.S.spill.klokke; const sek = Math.round((k.slutt != null ? k.slutt - Date.now() : k.igjen) / 1000);
      const html = document.documentElement.outerHTML;
      return { klokkeslett: /\\d\\s*:\\s*\\d\\d/.test(tekst), enheter: /\\d+\\s*(s|sek|sek\\.|min|minutter|minutes|seconds|sekunder)\\b/i.test(tekst), maaler: !!document.querySelector("#skjerm progress, #skjerm meter, #skjerm [role=progressbar], #skjerm [role=timer], #skjerm .timer"),
        slutt: k.slutt != null && html.includes(String(k.slutt)), sek: new RegExp("(^|\\\\D)" + sek + "(\\\\D|$)").test(tekst) }; })()`);

  // ---------- Home: everything fits a phone in the browser (390 × 664) ----------
  await t.start({ navn: NAVN });
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  const hjemFar = async (navn) => {
    if (LIGGENDE) return;
    await t.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 664, deviceScaleFactor: 2, mobile: true });
    await t.sov(400);
    await t.js("window.scrollTo(0, 0)");
    const m = await t.js(`({ merker: Math.round(document.querySelector(".merker li:last-child").getBoundingClientRect().bottom), knapper: document.querySelectorAll(".hjem-knapper button").length, bred: document.documentElement.scrollWidth - window.innerWidth })`);
    t.sjekk(m.merker <= 664 && m.bred <= 0, `Hjem-skjermen («${navn}», ${m.knapper} knapper) får ikke plass på 390×664 (merkene slutter på ${m.merker} px)`);
    await t.skjermbilde(join(bildemappe(t.id), `${navn}-390x664.png`));
    await t.send("Emulation.setDeviceMetricsOverride", MOBIL);
    await t.sov(300);
  };
  await hjemFar("hjem");
  t.sjekk((await t.antall(".merker li")) === 3, "Hjem-skjermen viser ikke tre merker");

  // ---------- Setup ----------
  await t.klikk('[data-h="nytt"]');
  t.sjekk((await t.tilstand()).antall === 6 && (await t.tekst("#pt-pakker output")).trim() === "12", `Seks spillere skal gi 12 pakker som forslag (${await t.tekst("#pt-pakker output")})`);
  await t.klikk('[data-h="spiller-legg-til"]');
  t.sjekk((await t.tekst("#pt-pakker output")).trim() === "14", "Forslaget på pakker følger ikke antall spillere");
  await t.klikk('[data-h="spiller-fjern"][data-v="6"]');
  for (let i = 0; i < 3; i++) await t.klikk('#pt-pakker [data-v="-1"]', 60);
  await t.klikk('#pt-pakker [data-v="1"]', 60);
  t.sjekk((await t.tilstand()).oppsett.pakker === 10, "Telleren for pakker ga ikke 10");
  await t.klikk('[data-h="spiller-legg-til"]');
  t.sjekk((await t.tekst("#pt-pakker output")).trim() === "10", "Et antall pakker som er satt for hånd, skal stå når en spiller kommer til");
  await t.klikk('[data-h="spiller-fjern"][data-v="6"]');
  await t.klikk('[data-h="lengde"][data-v="lang"]');
  if (t.norsk) t.sjekk(/mellom 6 og 10 minutter/.test(await t.tekst("#skjerm")), "Hjelpeteksten sier ikke 6–10 minutter for «Lang»");
  await t.klikk('[data-h="lengde"][data-v="kort"]');
  if (t.norsk) t.sjekk(/mellom 2 og 4 minutter/.test(await t.tekst("#skjerm")), "Hjelpeteksten sier ikke 2–4 minutter for «Kort»");
  await t.klikk('[data-h="enere"]');
  await t.klikk('[data-h="tema"][data-v="fest"]');
  await t.klikk('[data-h="tema"][data-v="jul"]');
  let o = (await t.tilstand()).oppsett;
  t.sjekk(o.enere === true && o.lengde === "kort" && o.tema === "jul", `Oppsettet ble ikke lagret: ${JSON.stringify(o)}`);
  await t.bilde("oppsett", true);

  // ---------- Part 1: the pile ----------
  // (The phone is asked to stay awake when the game is on the screen: counted here.)
  await t.js(`(() => { window.__vaken = 0; if (!navigator.wakeLock) return; const ekte = navigator.wakeLock.request.bind(navigator.wakeLock); navigator.wakeLock.request = (slag) => { window.__vaken++; return ekte(slag); }; })()`);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('#pt-brett')");
  await t.sov(400);
  t.sjekk(await t.js("!navigator.wakeLock || window.__vaken > 0"), "Spillet ber ikke mobilen holde skjermen våken");
  let s = await sp();
  t.sjekk(s.antall === 6 && s.haug === 10 && s.fase === 1 && s.tur === 0 && s.klokke === null, `Spillet startet feil: ${JSON.stringify(s)}`);
  t.sjekk((await t.antall("#pt-brett .trn-t")) === 1, "Brettet har ikke én terning");
  t.sjekk((await t.antall(".pt-bord li")) === 6 && (await t.antall(".pt-bord li.na")) === 1, "Bordet viser ikke seks spillere med én på tur");
  for (const sel of [".pt-brett", ".pt-hendelse", ".pt-hode"]) t.sjekk(await t.friForDokk(sel), `${sel} ligger bak dokka ved start`);
  const navn0 = await t.js("Rusj.navn(0)");
  t.sjekk((await t.tekst("#skjerm h1")).trim() === navn0, `Overskriften er ikke den som har tur («${await t.tekst("#skjerm h1")}»)`);
  await t.bilde("start");

  // A three: nothing happens, the next player's name at once
  await t.js(tving([3]));
  t.sjekk(await t.js(`(() => { const k = document.querySelector('#skjerm .dokk [data-h="kast"]'); k.click(); return k.disabled && !!document.querySelector("#pt-brett[data-kaster]"); })()`), "Knappen er ikke låst mens terningen ruller");
  await t.bilde("i-lufta");
  await t.vent(ROLIG, 12000);
  await t.js("delete crypto.getRandomValues");
  s = await sp();
  t.sjekk(s.terning === 3 && s.tur === 1 && s.haug === 10 && s.kast === 1 && s.sist.hva === "ingen", `En treer: ${JSON.stringify(s.sist)} tur ${s.tur}`);
  t.sjekk((await topp()) === 3, `Terningen viser ${await topp()} på toppen, spillet kastet 3`);
  t.sjekk((await t.tekst("#skjerm h1")).trim() === (await t.js("Rusj.navn(1)")), "Neste spillers navn kom ikke med en gang");
  if (t.norsk) t.sjekk(/slo 3/.test(await t.tekst("#pt-hendelse")), `Linja under terningen: «${await t.tekst("#pt-hendelse")}»`);

  // A six: a parcel from the pile
  await kast(6);
  s = await sp();
  t.sjekk(s.har[1] === 1 && s.haug === 9 && s.tur === 2 && s.seksere[1] === 1 && s.sist.hva === "tok", `En sekser i del 1: ${JSON.stringify(s)}`);
  t.sjekk((await topp()) === 6, `Terningen viser ${await topp()} på toppen, spillet kastet 6`);
  t.sjekk(await t.finnes("#pt-brett .pt-stempel"), "Ingen «Sekser!» på brettet");
  t.sjekk((await t.tekst(".pt-haug p b")).trim() === "9", "Haugen viser ikke 9");
  await t.bilde("sekser");

  // From here the dice fade in instead of flying (the rest of the game is the same, only quicker).
  await t.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });

  // Two real taps 250 ms apart (with reduced motion the die is down after 200 ms): the second lands
  // in the short rest after every throw. The next player's name is already there, and nothing is
  // thrown for them.
  await t.vent(ROLIG, 12000);
  s = await sp();
  const [kast0, tur0] = [s.kast, s.tur];
  await t.js(tving([2, 4]));
  await t.js("window.scrollTo(0, 0)");
  const knapp = await t.js(`(() => { const b = document.querySelector('#skjerm .dokk [data-h="kast"]').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
  const tapp = async () => {
    await t.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [knapp] });
    await t.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  await tapp();
  await t.sov(250);
  const mellom = await t.js(`({ navn: document.querySelector("#skjerm h1").textContent.trim(), av: document.querySelector('#skjerm .dokk [data-h="kast"]').disabled, ruller: !!document.querySelector("#pt-brett[data-kaster]") })`);
  await tapp();
  await t.sov(150);
  s = await sp();
  t.sjekk(s.kast === kast0 + 1 && s.tur === (tur0 + 1) % 6, `Det andre trykket kastet for neste spiller (${s.kast - kast0} kast, tur ${tur0} → ${s.tur})`);
  t.sjekk(mellom.navn === (await t.js(`Rusj.navn(${(tur0 + 1) % 6})`)) && mellom.av && !mellom.ruller, `Rett etter kastet: ${JSON.stringify(mellom)} (ventet neste navn og en hvilende knapp)`);
  await t.vent(ROLIG, 3000);
  await t.js("delete crypto.getRandomValues");
  await sett(`(S) => { S.spill.tur = ${tur0}; }`);

  // «Enere gir bort»: empty-handed, nothing to give; with a parcel, choose who gets it – and undo
  await kast(1);
  s = await sp();
  t.sjekk(s.sist.hva === "tomhendt" && s.tur === 3 && s.status === "kast", `En ener uten pakker: ${JSON.stringify(s.sist)}`);
  await sett("(S) => { S.spill.tur = 1; }");
  await kast(1);
  s = await sp();
  t.sjekk(s.status === "velg" && s.velg.type === "gi" && s.velg.fra === 1 && s.tur === 1, `En ener med pakke: ${JSON.stringify(s.velg)}`);
  t.sjekk((await t.antall(".pt-offer")) === 5 && !(await t.finnes('.pt-offer[data-v="1"]')), "«Hvem får en pakke» viser ikke de fem andre");
  t.sjekk(!(await t.finnes('#skjerm [data-h="velg"][data-v="-1"]')), "En ener kan ikke hoppes over");
  await t.bilde("gi-bort");
  await t.klikk('.pt-offer[data-v="4"]');
  s = await sp();
  t.sjekk(s.har[1] === 0 && s.har[4] === 1 && s.tur === 2 && s.status === "kast" && s.sist.hva === "ga" && s.sist.mot === 4, `Ga ikke pakken til E: ${JSON.stringify(s)}`);
  t.sjekk(await t.finnes('#skjerm [data-h="angre"]'), "Ingen «Angre» etter å ha gitt bort");
  await t.bilde("ga-bort");
  await t.klikk('#skjerm [data-h="angre"]');
  s = await sp();
  t.sjekk(s.status === "velg" && s.har[1] === 1 && s.har[4] === 0 && s.velg.fra === 1, "«Angre» ga ikke valget tilbake");
  await t.klikk('.pt-offer[data-v="3"]');
  s = await sp();
  t.sjekk(s.har[3] === 1 && s.har[1] === 0 && s.tur === 2, "Det nye valget ble ikke brukt");
  await kast(2);
  t.sjekk(!(await t.finnes('#skjerm [data-h="angre"]')), "«Angre» står igjen etter neste kast");

  // Reload, and back + «Fortsett»
  s = await sp();
  await t.lastSide(t.side, "document.querySelector('#pt-brett')");
  await t.sov(300);
  let s2 = await sp();
  t.sjekk(JSON.stringify([s2.har, s2.haug, s2.tur, s2.kast, s2.terning]) === JSON.stringify([s.har, s.haug, s.tur, s.kast, s.terning]) && (await t.tilstand()).skjerm === "spill", "Spillet ble ikke likt etter en omlasting");
  t.sjekk((await topp()) === s.terning, "Terningen viser ikke det siste kastet etter en omlasting");
  await t.klikk("#tilbake");
  t.sjekk((await t.finnes('[data-h="fortsett"]')) && (await t.finnes('[data-h="nytt"]')), "Hjem mangler «Fortsett» og «Nytt spill» midt i et spill");
  if (t.norsk) t.sjekk(/Fortsett · 9 pakker igjen/.test(await t.tekst('[data-h="fortsett"]')), `«Fortsett»-knappen: «${await t.tekst('[data-h="fortsett"]')}»`);
  await t.bilde("hjem-fortsett");
  await hjemFar("hjem-fortsett");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('#pt-brett')");

  // «Rett opp»: the pile and one player
  await t.klikk('#skjerm [data-h="rett-opp"]');
  t.sjekk((await t.antall("#ark .pt-rett li")) === 7, "«Rett opp» viser ikke haugen og seks spillere");
  await t.bilde("rett-opp");
  await t.klikk('#ark [data-rad="haug"] [data-v="-1"]', 80);
  await t.klikk('#ark [data-rad="0"] [data-v="1"]', 80);
  t.sjekk((await t.tekst('#ark [data-rad="haug"] output')).trim() === "8" && (await t.tekst('#ark [data-rad="0"] output')).trim() === "1", "Tallene i arket fulgte ikke med");
  await t.klikk('#ark [data-h="lukk-ark"]');
  s = await sp();
  t.sjekk(s.haug === 8 && s.har[0] === 1 && (await t.tekst(".pt-haug p b")).trim() === "8", "«Rett opp» endret ikke haugen og spilleren");

  // The pile emptied by hand: the button leads on, and back again when a parcel turns up
  await sett("(S) => { S.spill.haug = 0; }");
  t.sjekk((await t.finnes('#skjerm .dokk [data-h="videre"]')) && !(await t.finnes('#skjerm .dokk [data-h="kast"]')), "En tom haug gir ikke knappen videre til del 2");
  await sett("(S) => { S.spill.haug = 1; }");

  // The last parcel: on to the screen before part 2
  await kast(6);
  await t.vent(`Rusj.S.skjerm === "tyveri"`, 6000);
  await t.sov(400);
  s = await sp();
  t.sjekk(s.haug === 0 && s.status === "mellom" && s.fase === 1 && s.sist.siste === true && s.klokke === null, `Den siste pakken: ${JSON.stringify(s)}`);
  if (t.norsk) t.sjekk(/Haugen er tom!/.test(await t.tekst("#skjerm h1")), `Overskriften før del 2: «${await t.tekst("#skjerm h1")}»`);
  t.sjekk(await t.finnes(".pt-lyd"), "Ingen beskjed om at lyden er av før del 2");
  for (const sel of [".pt-mellom-topp", ".pt-lyd"]) t.sjekk(await t.friForDokk(sel), `${sel} ligger bak dokka før del 2`);
  await t.bilde("for-del-2");
  await t.klikk('[data-h="lyd-pa"]');
  t.sjekk((await t.js("Rusj.felles.lyd")) === true && !(await t.finnes(".pt-lyd")) && (await t.js(`document.querySelector("#lydknapp").getAttribute("aria-pressed")`)) === "true", "«Skru på lyden» skrudde ikke på lyden");
  await t.bilde("for-del-2-lyd-pa");
  // (Sound off again for the rest: a headless browser logs every vibration no finger asked for.)
  await t.js("Rusj.felles.lyd = false; Rusj.lagreFelles()");
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.sov(300);
  t.sjekk((await t.tilstand()).skjerm === "tyveri" && (await sp()).klokke === null && (await t.finnes(".pt-lyd")), "Skjermen før del 2 kom ikke tilbake etter en omlasting");

  // ---------- Part 2: the hidden clock ----------
  await t.js(tving([1])); // the shortest clock the setting allows: 2 minutes
  await t.klikk('[data-h="start-klokka"]');
  await t.js("delete crypto.getRandomValues");
  await t.vent(`Rusj.S.skjerm === "spill" && !!document.querySelector(".pt-klokke")`, 6000);
  await t.sov(300);
  s = await sp();
  t.sjekk(s.fase === 2 && s.status === "kast" && s.klokke && s.klokke.slutt != null && s.klokke.igjen >= 120000 && s.klokke.igjen < 141000, `Klokka startet ikke som ventet: ${JSON.stringify(s.klokke)}`);
  const start0 = s.klokke.igjen;
  t.sjekk(!(await t.finnes(".pt-haug")), "Haugen vises fortsatt i del 2");
  let tid = await viserTid();
  t.sjekk(!Object.values(tid).some(Boolean), `Skjermen røper klokka: ${JSON.stringify(tid)}`);
  const klokke1 = await t.js(`document.querySelector(".pt-klokke").outerHTML`);
  await t.bilde("del-2");
  for (const sel of [".pt-brett", ".pt-hendelse"]) t.sjekk(await t.friForDokk(sel), `${sel} ligger bak dokka i del 2`);
  await t.sov(1300);
  t.sjekk((await t.js(`document.querySelector(".pt-klokke").outerHTML`)) === klokke1, "Klokkefeltet endrer seg mens tiden går");

  // The phone's own clock is set six minutes on, then six minutes back: the horn does not move
  // (while the game is on the screen the clock is measured with a steady timer).
  const forStill = await igjen();
  await t.js(`(() => { window.__ekteNaa = Date.now; const e = Date.now; Date.now = () => e() + 6 * 60 * 1000; })()`);
  await t.sov(1300);
  const fram = await igjen();
  t.sjekk((await t.tilstand()).skjerm === "spill" && !(await sp()).ferdig && fram <= forStill - 900 && fram > forStill - 4000, `Klokka på mobilen ble stilt fram, og den skjulte klokka fulgte med (${Math.round(forStill)} → ${Math.round(fram)} ms)`);
  await t.js(`(() => { const e = window.__ekteNaa; Date.now = () => e() - 6 * 60 * 1000; })()`);
  await t.sov(1300);
  const tilbake = await igjen();
  t.sjekk(tilbake <= fram - 900 && tilbake > fram - 4000, `Klokka på mobilen ble stilt tilbake, og den skjulte klokka fulgte med (${Math.round(fram)} → ${Math.round(tilbake)} ms)`);
  await t.js("Date.now = window.__ekteNaa");
  await t.sov(400);

  // A six: only those with parcels can be stolen from; undo; «Stjel ikke»
  await sett("(S) => { const s = S.spill; s.har = [1, 0, 0, 4, 1, 3]; s.tur = 2; }");
  await kast(6);
  s = await sp();
  t.sjekk(s.status === "velg" && s.velg.type === "stjel" && s.velg.fra === 2, `En sekser i del 2: ${JSON.stringify(s.velg)}`);
  t.sjekk((await t.js(`Array.from(document.querySelectorAll(".pt-offer")).map((b) => b.dataset.v).join()`)) === "0,3,4,5", "Valget viser ikke akkurat dem som har pakker");
  tid = await viserTid();
  t.sjekk(!tid.klokkeslett && !tid.enheter && !tid.maaler && !tid.slutt, `Tyveriskjermen røper klokka: ${JSON.stringify(tid)}`);
  await t.bilde("stjel");
  await t.klikk('.pt-offer[data-v="3"]');
  s = await sp();
  t.sjekk(s.har[2] === 1 && s.har[3] === 3 && s.tyverier[2] === 1 && s.tur === 3 && s.sist.hva === "stjal", `Tyveriet: ${JSON.stringify(s)}`);
  if (t.norsk) t.sjekk(/stjal en pakke fra/.test(await t.tekst("#pt-hendelse")), `Linja etter tyveriet: «${await t.tekst("#pt-hendelse")}»`);
  await t.bilde("stjal");
  await t.klikk('#skjerm [data-h="angre"]');
  s = await sp();
  t.sjekk(s.status === "velg" && s.har[2] === 0 && s.har[3] === 4 && s.tyverier[2] === 0, "«Angre» tok ikke tyveriet tilbake");
  await t.klikk('#skjerm [data-h="velg"][data-v="-1"]');
  s = await sp();
  t.sjekk(s.sist.hva === "lot" && s.har.join() === "1,0,0,4,1,3" && s.tur === 3, "«Stjel ikke» lot ikke pakkene være");

  // A six by the one who has every parcel: nobody to steal from
  await sett("(S) => { const s = S.spill; s.har = [0, 0, 0, 9, 0, 0]; s.tur = 3; }");
  await kast(6);
  s = await sp();
  t.sjekk(s.sist.hva === "alene" && s.status === "kast" && s.tur === 4, `En sekser uten noen å stjele fra: ${JSON.stringify(s.sist)}`);
  await sett("(S) => { S.spill.har = [1, 0, 2, 4, 1, 1]; }");

  // The clock stands still on the home screen and goes on afterwards
  const for_ = await igjen();
  await t.klikk("#tilbake");
  s = await sp();
  t.sjekk(s.klokke.slutt === null && s.klokke.igjen <= for_ + 5 && s.klokke.igjen > for_ - 4000, `Klokka stoppet ikke på hjem-skjermen: ${JSON.stringify(s.klokke)} (${for_})`);
  if (t.norsk) t.sjekk(/Fortsett tyverunden/.test(await t.tekst('[data-h="fortsett"]')), "«Fortsett»-knappen i del 2 sier noe annet");
  t.sjekk(!/\d/.test(await t.tekst('[data-h="fortsett"]')), "«Fortsett»-knappen røper noe med tall i del 2");
  await t.sov(1500);
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('#pt-brett')");
  const etterPause = await igjen();
  t.sjekk(etterPause <= s.klokke.igjen && etterPause > s.klokke.igjen - 4000 && (await sp()).klokke.slutt != null, `Klokka gikk mens spillet lå på hjem-skjermen, eller startet ikke igjen (${s.klokke.igjen} → ${etterPause})`);

  // … and through a reload: neither reset nor used up. After a reload the phone may only play sound
  // after a tap, so the clock waits for one («Trykk for å fortsette») – and still shows no time.
  await t.sov(1100);
  const forLast = await igjen();
  const dom1 = await t.js(`document.querySelector(".pt-klokke").outerHTML`);
  await t.lastSide(t.side, "document.querySelector('#pt-brett')");
  await t.sov(300);
  const etterLast = await igjen();
  s = await sp();
  t.sjekk((await t.tilstand()).skjerm === "spill" && s.fase === 2 && s.klokke.slutt == null, `Etter en omlasting skal klokka stå til noen trykker: ${JSON.stringify(s.klokke)}`);
  t.sjekk((await t.finnes('#skjerm .dokk [data-h="vekk"]')) && !(await t.finnes('#skjerm .dokk [data-h="kast"]')) && (await t.js(`document.querySelector("#pt-brett .trn-t").disabled`)), "Etter en omlasting vises ikke «Trykk for å fortsette», eller terningen kan kastes");
  if (t.norsk) t.sjekk(/Trykk for å fortsette/.test(await t.tekst("#skjerm .dokk .knapp")) && /venter/.test(await t.tekst(".pt-klokke")), `Teksten mens klokka venter: «${await t.tekst(".pt-klokke")}»`);
  tid = await viserTid();
  t.sjekk(!Object.values(tid).some(Boolean), `Skjermen røper klokka mens den venter: ${JSON.stringify(tid)}`);
  await t.bilde("trykk-for-a-fortsette");
  await t.sov(1200);
  t.sjekk((await igjen()) === etterLast, "Klokka gikk før noen trykket");
  t.sjekk(etterLast <= forLast + 50 && etterLast > forLast - 8000, `Omlastingen stilte klokka tilbake eller brukte den opp (${Math.round(forLast)} → ${Math.round(etterLast)} ms)`);
  t.sjekk(etterLast < start0 - 2500, `Klokka ser ut til å ha startet på nytt (${Math.round(etterLast)} ms igjen av ${start0})`);
  await t.klikk('#skjerm .dokk [data-h="vekk"]');
  s = await sp();
  t.sjekk(s.klokke.slutt != null && (await t.finnes('#skjerm .dokk [data-h="kast"]')), "«Trykk for å fortsette» satte ikke klokka i gang");
  t.sjekk((await t.js(`document.querySelector(".pt-klokke").outerHTML`)) === dom1, "Klokkefeltet er ikke det samme etter en omlasting");
  tid = await viserTid();
  t.sjekk(!Object.values(tid).some(Boolean), `Skjermen røper klokka etter en omlasting: ${JSON.stringify(tid)}`);
  t.sjekk(s.har.join() === "1,0,2,4,1,1" && s.tur === 4, "Pakkene eller turen ble ikke like etter omlastingen i del 2");
  // A page that went away without warning (the clock still running in the save): the time away does not count.
  await t.js(`(() => { const kopi = JSON.parse(JSON.stringify(Rusj.S)); kopi.spill.klokke = { igjen: 90000, slutt: Date.now() - 5000 }; kopi._tid = Date.now() - 60000;
    const lagret = JSON.stringify(kopi); window.addEventListener("pagehide", () => localStorage.setItem(${JSON.stringify(t.nokkel("pakketyven.v1"))}, lagret)); })()`);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.sov(300);
  s = await sp();
  t.sjekk((await t.tilstand()).skjerm === "spill" && !s.ferdig && s.klokke.slutt == null && s.klokke.igjen > 40000 && s.klokke.igjen <= 55000, `En klokke som sto og gikk i lagringen, ble brukt opp mens siden var borte: ${JSON.stringify(s.klokke)}`);
  // (The tap lets the clock go on.)
  await t.klikk('#skjerm .dokk [data-h="vekk"]');

  // Time runs out while a six is in the air: the six may steal first, then the horn. (The clock is
  // set on the home screen, where it stands still; «Fortsett» and the throw come in the same instant.)
  await t.send("Emulation.setEmulatedMedia", { features: [] });
  await t.vent(ROLIG, 6000);
  await t.klikk("#tilbake");
  await t.js(`(() => { const s = Rusj.S.spill; s.har = [1, 0, 2, 4, 1, 1]; s.tur = 1; s.klokke.igjen = 300; })()`);
  // With the sound on, so the horn itself is made (the vibration is answered here, not by the phone).
  await t.js("navigator.vibrate = () => true; Rusj.felles.lyd = true;");
  await t.js(tving([6]));
  await t.js(`(() => { document.querySelector('[data-h="fortsett"]').click(); document.querySelector('#skjerm .dokk [data-h="kast"]').click(); })()`);
  await t.vent(ROLIG, 12000);
  await t.js("delete crypto.getRandomValues");
  await t.sov(700);
  s = await sp();
  t.sjekk((await t.tilstand()).skjerm === "spill" && s.status === "velg" && !s.ferdig && (await igjen()) <= 0, `Hornet gikk før sekseren fikk stjele: ${JSON.stringify([s.status, s.ferdig])}`);
  await t.klikk('.pt-offer[data-v="3"]', 60);
  await t.vent(`Rusj.S.skjerm === "slutt"`, 4000);
  await t.sov(600);
  s = await sp();
  t.sjekk(s.ferdig && s.komplett && s.har.join() === "1,1,2,3,1,1" && s.tyverier[1] === 1, `Etter hornet: ${JSON.stringify(s)}`);
  await t.sov(2600); // the horn plays out
  await t.js("Rusj.felles.lyd = false; Rusj.lagreFelles()");

  // ---------- Kåringen ----------
  if (t.norsk) t.sjekk(/Hornet har gått!/.test(await t.tekst("#skjerm h1")), `Overskriften på kåringen: «${await t.tekst("#skjerm h1")}»`);
  t.sjekk((await t.antall(".pt-resultat li")) === 6, "Kåringen viser ikke seks spillere");
  t.sjekk((await t.tekst(".pt-resultat li:first-child .pt-res-navn")).trim() === (await t.js("Rusj.navn(3)")), "Den med flest pakker står ikke øverst");
  const kveld = await t.js(`JSON.parse(localStorage.getItem(${JSON.stringify(t.nokkel("kveld"))}) || "null")`);
  t.sjekk(kveld && kveld.spill.length === 1 && kveld.spill[0].id === "pakketyven" && kveld.spill[0].resultat.length === 6 && kveld.spill[0].resultat.every((r) => r.plass === 0), `«Kveldens gjeng» skal telle spillet uten å gi noen plass: ${JSON.stringify(kveld)}`);
  t.sjekk((await t.finnes('[data-h="igjen"]')) && (await t.finnes(`a.lenke[href="${t.forside}"]`)) && (await t.finnes('[data-h="endre"]')), "Kåringen mangler «Spill igjen», «Endre oppsett» eller «Alle spill»");
  await t.bilde("kaaring", true);
  await t.klikk("#tilbake");
  t.sjekk(!(await t.finnes('[data-h="fortsett"]')) && (await t.finnes('[data-h="resultat"]')) && (await t.tilstand())._aktiv === false, "Hjem etter et ferdig spill: «Fortsett» står igjen, eller «Til kåringen» mangler");
  await t.klikk('[data-h="resultat"]');
  t.sjekk((await t.tilstand()).skjerm === "slutt", "«Til kåringen» viste ikke kåringen");

  // ---------- «Spill igjen», and the horn while nobody throws ----------
  await t.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await t.klikk('[data-h="igjen"]');
  await t.vent("document.querySelector('#pt-brett')");
  s = await sp();
  t.sjekk(s.fase === 1 && s.haug === 10 && s.enere === true && s.lengde === "kort" && s.kast === 0 && s.har.every((n) => n === 0), `«Spill igjen» startet ikke likt: ${JSON.stringify(s)}`);
  await t.klikk('#skjerm [data-h="avslutt"]');
  await t.bilde("avslutt-sporsmal");
  await t.klikk('#ark [data-h="ark-svar"][data-v="nei"]');
  t.sjekk((await t.tilstand()).skjerm === "spill", "«Spill videre» avsluttet spillet");
  await kast(4);
  await sett("(S) => { const s = S.spill; s.haug = 1; s.tur = 0; }");
  await kast(6);
  await t.vent(`Rusj.S.skjerm === "tyveri"`, 6000);
  await t.klikk('[data-h="start-klokka"]');
  await t.vent(`Rusj.S.skjerm === "spill" && Rusj.S.spill.fase === 2`, 6000);
  await t.klikk("#tilbake");
  await t.js(`Rusj.S.spill.klokke.igjen = 500`);
  await t.klikk('[data-h="fortsett"]');
  await t.vent(`Rusj.S.skjerm === "slutt"`, 5000);
  await t.sov(500);
  s = await sp();
  t.sjekk(s.ferdig && s.komplett && s.har[0] === 1, "Hornet gikk ikke av seg selv da tiden var ute");
  t.sjekk((await t.js(`JSON.parse(localStorage.getItem(${JSON.stringify(t.nokkel("kveld"))})).spill.length`)) === 2, "Det andre spillet ble ikke talt i «Kveldens gjeng»");

  // «Avslutt» in the middle: straight to «Kåringen», without the horn; before the first throw: home
  await t.klikk('[data-h="igjen"]');
  await t.vent("document.querySelector('#pt-brett')");
  await t.klikk('#skjerm [data-h="avslutt"]');
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.sov(400);
  t.sjekk((await t.tilstand()).skjerm === "hjem" && (await sp()) === null, "«Avslutt» før første kast ga ikke hjem-skjermen uten spill");
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('#pt-brett')");
  await kast(6);
  await t.klikk('#skjerm [data-h="avslutt"]');
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.vent(`Rusj.S.skjerm === "slutt"`, 4000);
  s = await sp();
  t.sjekk(s.ferdig && !s.komplett && s.har[0] === 1, "«Avslutt» midt i spillet ga ikke kåringen");
  if (t.norsk) t.sjekk(/Pakkeleken er over/.test(await t.tekst("#skjerm h1")), "Kåringen etter «Avslutt» sier at hornet har gått");
  await t.bilde("kaaring-avsluttet");

  // ---------- Twenty players ----------
  await t.start({ navn: Array.from({ length: 20 }, (_, i) => `Testspiller ${String.fromCharCode(65 + i)}`) });
  await t.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await t.klikk('[data-h="nytt"]');
  t.sjekk((await t.tilstand()).antall === 20 && (await t.tekst("#pt-pakker output")).trim() === "40" && (await t.js(`document.querySelector('[data-h="spiller-legg-til"]').disabled`)), "Tjue spillere: forslaget er ikke 40 pakker, eller en til kan legges til");
  await t.klikk('[data-h="tema"][data-v="fest"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('#pt-brett')");
  t.sjekk((await t.antall(".pt-bord li")) === 20 && (await sp()).tema === "fest", "Bordet viser ikke tjue spillere i stilen «Fest»");
  for (const sel of [".pt-brett", ".pt-hendelse"]) t.sjekk(await t.friForDokk(sel), `${sel} ligger bak dokka med tjue spillere`);
  await kast(6);
  await t.bilde("tjue", true);
  await sett(`(S) => { const s = S.spill; s.fase = 2; s.haug = 0; s.klokke = { igjen: 200000, slutt: null }; s.har = s.har.map((_, i) => (i % 5) + 1); s.tur = 19; }`);
  // (Straight into part 2 on a page that has not had «Start klokka»: the clock waits for a tap.)
  await t.klikk('#skjerm .dokk [data-h="vekk"]');
  await kast(6);
  t.sjekk((await t.antall(".pt-offer")) === 19, "Nitten å stjele fra ble ikke vist");
  await t.bilde("tjue-stjel", true);
  await t.klikk('.pt-offer[data-v="18"]');
  s = await sp();
  t.sjekk(s.har[19] === 6 && s.har[18] === 3 && s.tur === 0, "Den tjuende spilleren stjal ikke, eller turen gikk ikke rundt til den første");
  await t.klikk('#skjerm [data-h="rett-opp"]');
  t.sjekk((await t.antall("#ark .pt-rett li")) === 20, "«Rett opp» i del 2 skal vise spillerne, ikke haugen");
  await t.bilde("tjue-rett-opp");
  await t.klikk('#ark [data-h="lukk-ark"]');

  // ---------- Damaged saves never give a blank page ----------
  for (const skadet of [`{ "skjerm": "spill", "spill": { "antall": 3, "har": "x" } }`, `{ "skjerm": "slutt", "spill": null, "oppsett": "tull", "antall": 99 }`, `{ "skjerm": "tyveri", "spill": { "antall": 6, "har": [0,0,0,0,0,0], "seksere": [0,0,0,0,0,0], "tyverier": [0,0,0,0,0,0], "haug": 3, "pakker": 3, "tur": 9, "terning": 2, "kast": 0, "fase": 1, "status": "kast", "lengde": "kort", "tema": "jul" } }`]) {
    await t.js(`(() => { const n = ${JSON.stringify(t.nokkel("pakketyven.v1"))}; const v = ${JSON.stringify(skadet)}; window.addEventListener("pagehide", () => localStorage.setItem(n, v)); localStorage.setItem(n, v); })()`);
    await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
    await t.sov(250);
    const st = await t.tilstand();
    t.sjekk(st.skjerm === "hjem" && st.spill === null && st.antall >= 4 && st.antall <= 20 && typeof st.oppsett === "object", `En skadet lagring ga ikke hjem-skjermen: ${JSON.stringify(st).slice(0, 160)}`);
  }
  await t.bilde("etter-skadet-lagring");
  await t.send("Emulation.setEmulatedMedia", { features: [] });
}
