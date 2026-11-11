// Julekalenderen: the clock is pinned in the page (a script that runs before the page's own) so
// the test can stand on any day. Before 1 December: a calm teaser and every door locked. On
// 14 December: doors 1–14 can be opened, 15 says when it opens; one door of every kind (quiz with a
// wrong answer, riddle, word puzzle with a wrong and a right try, cosy idea, song, challenge link),
// today's door through #dagens reports «Luke 14» to the front page, the sticker count and stickers
// survive a reload, sharing never gives an answer, the doors fit beside the dock on a phone on its
// side. On 26 December every door is open and the calendar says «God jul!».
export default async function (t) {
  const pause = () => t.sov(420); // taps right after a screen change are ignored on purpose
  let skript = null;
  // Pins Date (and Date.now) to the given day at 13:00 Oslo time; the clock still ticks from there.
  const settDato = async (iso) => {
    if (skript) await t.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: skript });
    const ms = Date.parse(`${iso}T12:00:00Z`);
    const kilde = `(() => { const Ekte = Date; const start = Ekte.now(); const T = ${ms};
      class Dato extends Ekte { constructor(...a) { if (a.length) super(...a); else super(T + (Ekte.now() - start)); } static now() { return T + (Ekte.now() - start); } }
      window.Date = Dato; })();`;
    skript = (await t.send("Page.addScriptToEvaluateOnNewDocument", { source: kilde })).identifier;
  };
  const last = async (hash = "") => {
    await t.lastSide(t.side + hash, "document.querySelector('#skjerm h1')");
    await pause();
  };
  const toast = () => t.js(`document.querySelector("#toast.vis") ? document.querySelector("#toast").textContent : ""`);
  const h1 = () => t.tekst("#skjerm h1");
  const apne = async (d) => {
    await t.klikk(`.jk-luke[data-v="${d}"]`);
    await t.vent("document.querySelector('.skjerm-luke')", 3000);
    await pause();
  };
  const tilbake = async () => {
    await t.klikk('[data-h="hjem"]');
    await t.vent("document.querySelector('.skjerm-hjem .jk-kalender')");
    await pause();
  };
  const liggende = await t.js("matchMedia('(orientation: landscape) and (max-height: 500px)').matches");
  // Every door inside the screen and beside (or above) the dock.
  const doreneFrie = () =>
    t.js(`(() => {
      window.scrollTo(0, 0);
      const dokk = document.querySelector("#skjerm .dokk").getBoundingClientRect();
      const side = dokk.left > innerWidth / 2;
      return Array.from(document.querySelectorAll(".jk-luke")).every((l) => {
        const b = l.getBoundingClientRect();
        return b.left >= 0 && b.right <= (side ? dokk.left : innerWidth) + 1;
      });
    })()`);

  // ---- Before December ----
  await settDato("2026-11-20");
  await t.start();
  await pause();
  const status = await t.tekst(".jk-status");
  t.sjekk(/Kalenderen åpner 1\. desember/.test(status) && /Om 11 dager/.test(status), `Før desember: statusen sier «${status}»`);
  t.sjekk((await t.antall(".jk-luke")) === 24 && (await t.antall(".jk-luke.jk-last")) === 24, "Før desember skal alle 24 lukene vises og være låst");
  const orden = await t.js(`Array.from(document.querySelectorAll(".jk-luke")).map((l) => Number(l.dataset.v))`);
  t.sjekk(orden.join() !== [...orden].sort((a, b) => a - b).join() && new Set(orden).size === 24, "Lukene skal stå hulter til bulter, hver bare én gang");
  t.sjekk(/0 av 24/.test(await t.tekst(".jk-telling")), "Før desember: telleren skal si 0 av 24");
  await t.bilde("for-desember");
  await t.klikk('.jk-luke[data-v="1"]');
  t.sjekk((await toast()) === "Luke 1 åpner 1. desember", `Låst luke før desember: toasten sier «${await toast()}»`);
  t.sjekk(!!(await t.finnes(".skjerm-hjem")) && Object.keys((await t.tilstand()).luker).length === 0, "En låst luke skal ikke åpnes");

  // ---- 14 December ----
  await settDato("2026-12-14");
  await last();
  t.sjekk((await t.antall(".jk-luke.jk-klar")) === 14 && (await t.antall(".jk-luke.jk-last")) === 10, "14. desember: lukene 1–14 skal kunne åpnes, 15–24 være låst");
  t.sjekk(!!(await t.finnes('.jk-luke.jk-idag[data-v="14"]')), "Dagens luke (14) skal lyse");
  t.sjekk(/Åpne luke 14/.test(await t.tekst("#skjerm .dokk")), "Hovedknappen skal si «Åpne luke 14»");
  t.sjekk(await doreneFrie(), "Lukene skal få plass på skjermen og ikke ligge bak dokken");
  if (liggende) t.sjekk(await t.friForDokk(".jk-rutenett"), "Kalenderen ligger bak dokken på en liggende mobil");
  await t.bilde("14-desember");
  await t.klikk('.jk-luke[data-v="15"]');
  t.sjekk((await toast()) === "Luke 15 åpner 15. desember", `Luke 15 den 14.: toasten sier «${await toast()}»`);

  // Door 1: quiz, a wrong answer shows the right one.
  await apne(1);
  t.sjekk((await h1()) === "Julequiz" && !!(await t.finnes(".jk-merke.jk-stort")), "Luke 1 skal være en quiz med klistremerke");
  t.sjekk(/klistremerke/.test(await t.tekst(".jk-fikk")), "Første åpning skal si «Du fikk et klistremerke!»");
  await t.klikk('.jk-valg[data-v="0"]');
  t.sjekk(!!(await t.finnes(".jk-valg.feil")) && !!(await t.finnes('.jk-valg.riktig[data-v="1"]')), "Feil svar skal vise både det valgte og det riktige");
  t.sjekk(/Nesten! Svaret er «Fire»/.test(await t.tekst(".jk-resultat")), "Feil svar på quizen skal si hva som er riktig");
  await t.klikk('.jk-valg[data-v="2"]');
  t.sjekk((await t.tilstand()).luker[1].svar === 0, "Et svar kan ikke endres etterpå");
  await t.bilde("quiz");
  await tilbake();
  t.sjekk(!!(await t.finnes('.jk-luke.jk-apen[data-v="1"] .jk-hull')), "Åpnet luke skal vise klistremerket i hullet");

  // Door 2: riddle.
  await apne(2);
  t.sjekk((await h1()) === "Julenøtt" && !(await t.finnes(".jk-resultat")), "Luke 2 skal være en julenøtt med skjult svar");
  await t.bilde("julenott");
  await t.klikk('[data-h="vis-svar"]');
  t.sjekk(/Fotspor/.test(await t.tekst(".jk-resultat")), "«Vis svaret» skal vise svaret på nøtta");
  await tilbake();

  // Door 3: word puzzle (NISSE) — the shuffled order first (wrong), then the word.
  await apne(3);
  t.sjekk((await h1()) === "Ordgåte" && (await t.antall(".jk-brikke")) === 5 && (await t.antall(".jk-rute")) === 5, "Luke 3 skal være en ordgåte med fem bokstaver");
  const stokk = await t.js(`Array.from(document.querySelectorAll(".jk-brikke")).map((b) => b.textContent).join("")`);
  t.sjekk(stokk !== "NISSE" && [...stokk].sort().join("") === [..."NISSE"].sort().join(""), `Bokstavene skal være stokket: «${stokk}»`);
  await t.klikk('.jk-brikke[data-v="0"]', 80);
  await t.klikk('.jk-brikke[data-v="1"]', 80);
  await t.bilde("ordgate-underveis");
  await t.klikk('[data-h="visk"]', 80);
  t.sjekk((await t.antall(".jk-rute.full")) === 1, "«Visk ut» skal fjerne siste bokstav");
  for (let i = 1; i < 5; i++) await t.klikk(`.jk-brikke[data-v="${i}"]`, 80);
  t.sjekk((await t.antall(".jk-rute.full")) === 0 && /prøv/.test(await toast()), "Feil ord skal tømme rutene og be om et nytt forsøk");
  for (const b of "NISSE") {
    const i = await t.js(`Array.from(document.querySelectorAll(".jk-brikke")).findIndex((k) => !k.disabled && k.textContent === ${JSON.stringify(b)})`);
    await t.klikk(`.jk-brikke[data-v="${i}"]`, 80);
  }
  t.sjekk((await t.antall(".jk-rute.riktig")) === 5 && /Riktig/.test(await t.tekst(".jk-resultat")), "Riktig ord skal gi grønne ruter og «Riktig!»");
  await t.bilde("ordgate-lost");
  await tilbake();

  // Door 4: cosy idea, done when opened.
  await apne(4);
  t.sjekk((await h1()) === "Papirsnøfnugg" && (await t.tilstand()).luker[4].ferdig, "Luke 4 skal være en kos-idé som er ferdig når den åpnes");
  await t.bilde("julekos");
  await tilbake();

  // Door 5: guess the song, the right answer.
  await apne(5);
  t.sjekk((await h1()) === "Gjett julesangen", "Luke 5 skal være «Gjett julesangen»");
  await t.klikk('.jk-valg[data-v="0"]');
  t.sjekk(!!(await t.finnes('.jk-valg.riktig[aria-pressed="true"]')) && /Riktig/.test(await t.tekst(".jk-resultat")), "Riktig sang skal gi «Riktig!»");
  await t.bilde("julesang");
  await tilbake();

  // Door 6: a challenge in another game.
  await apne(6);
  t.sjekk((await t.js(`document.querySelector("#skjerm .dokk a.knapp").getAttribute("href")`)) === "/mimen/#jul", "Luke 6 skal lenke til Mimen med julekategorien");
  await t.bilde("utfordring");
  await tilbake();
  t.sjekk(/6 av 24/.test(await t.tekst(".jk-telling")), "Telleren skal si 6 av 24");

  // Today's door through the front page's «I dag» link; done → reported.
  const daglig = () => t.js(`(JSON.parse(localStorage.getItem("rusj.daglig") || "{}").julekalenderen || null)`);
  await last("#dagens");
  t.sjekk((await t.tilstand()).aktiv === 14 && (await h1()) === "Julenøtt" && !(await daglig()), `#dagens skal åpne luke 14 uten å melde den ferdig før nøtta er løst: ${JSON.stringify(await daglig())}`);
  await t.klikk('[data-h="vis-svar"]');
  const d = await daglig();
  t.sjekk(d && d.res === "Luke 14" && d.vunnet === true && d.nr === (await t.js("Rusj.dag().nr")), `Dagens luke skal meldes som «Luke 14»: ${JSON.stringify(d)}`);
  await tilbake();
  t.sjekk(/Se luke 14/.test(await t.tekst("#skjerm .dokk")) && /Ny luke i morgen/.test(await t.tekst(".jk-status")), "Etter dagens luke: «Se luke 14» og «Ny luke i morgen»");

  // Reload: the stickers stay.
  await last();
  t.sjekk(/7 av 24/.test(await t.tekst(".jk-telling")) && (await t.antall(".jk-merker .jk-merke")) === 7 && (await t.antall(".jk-luke.jk-apen")) === 7, "Etter omlasting: 7 av 24 luker og sju klistremerker");
  await t.bilde("hjem-7-luker", true);

  // Sharing: the count and the link, never an answer.
  await t.js(`navigator.share = (d) => { window.__delt = d; return Promise.resolve(); }`);
  await t.klikk('[data-h="del"]');
  const delt = await t.js("window.__delt || null");
  t.sjekk(delt && delt.text === "Jeg har åpnet 7 av 24 luker i rusj-julekalenderen" && delt.url === "https://rusj.no/julekalenderen/", `Delingen: ${JSON.stringify(delt)}`);

  // ---- 26 December ----
  await settDato("2026-12-26");
  await last();
  t.sjekk((await t.antall(".jk-luke.jk-last")) === 0 && /God jul!/.test(await t.tekst(".jk-status")), "26. desember: alle lukene åpne og «God jul!»");
  t.sjekk(/7 av 24/.test(await t.tekst(".jk-telling")), "Romjula: klistremerkene fra desember er der fortsatt");
  await apne(24);
  t.sjekk((await h1()) === "God jul!", "Luke 24 skal si «God jul!»");
  await t.bilde("luke-24");
  await tilbake();
  await t.bilde("romjul");

  await t.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: skript });
}
