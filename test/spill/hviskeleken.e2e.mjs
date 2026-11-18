// Hviskeleken: its own card on the front page that hands over at once to Kunstneren's Hviskeleken
// mode in the same edition (…/kunstneren/#hvisk). Opened directly, from a front-page search and
// from the card, it lands in Kunstneren's «Gjør klart» with Hviskeleken chosen for four or more;
// «back» goes to where the visitor came from (the hand-over leaves no page behind); a game in
// progress in Kunstneren is kept (the start screen with «Fortsett»).
// Needs the e2e runner to know hand-over cards (it skips the home-screen checks when the page
// has moved on: see the patch in the report). Language-neutral (rusj/SPRAK.md).
const ORD = {
  nb: { kunstneren: "/kunstneren/", sok: "hviskeleken", side: "/hviskeleken/", gjor: "Gjør klart" },
  en: { kunstneren: "/en/doodler/", sok: "telephone drawing", side: "/en/telephone-drawing/", gjor: "Get ready" },
  da: { kunstneren: "/da/kunstneren/", sok: "hviskelegen", side: "/da/hviskelegen/", gjor: "Gør klar" },
};

export default async function (t) {
  const O = ORD[t.sprak];
  const KUNST = t.nokkel("kunstneren.v1");
  const OPPSETT = "document.querySelector('[data-h=\"modus\"][data-v=\"hvisk\"]') && document.querySelector('[data-h=\"start\"]')";
  const her = () =>
    t.js(`({
      sti: location.pathname,
      hash: location.hash,
      id: window.RUSJ_SPILL && window.RUSJ_SPILL.id,
      h1: (document.querySelector("#skjerm h1") || {}).textContent || "",
      skjerm: window.Rusj && Rusj.S && Rusj.S.skjerm,
      modus: window.Rusj && Rusj.S && Rusj.S.oppsett && Rusj.S.oppsett.modus,
      antall: window.Rusj && Rusj.S && Rusj.S.antall,
      flis: (document.querySelector('[data-h="modus"][data-v="hvisk"]') || { getAttribute: () => null }).getAttribute("aria-pressed"),
      spill: !!(window.Rusj && Rusj.S && Rusj.S.spill),
    })`);
  const iOppsett = (h, hva) => {
    t.sjekk(h.sti === O.kunstneren && h.id === "kunstneren", `${hva}: havnet på ${h.sti} (${h.id}), ventet Kunstneren på ${O.kunstneren}`);
    t.sjekk(h.hash === "", `${hva}: #-delen ble stående i adressen (${h.hash})`);
    t.sjekk(h.skjerm === "oppsett" && h.h1.trim() === O.gjor, `${hva}: viser ikke «${O.gjor}» (${h.skjerm}, «${h.h1}»)`);
    t.sjekk(h.modus === "hvisk" && h.flis === "true" && h.antall >= 4, `${hva}: Hviskeleken er ikke valgt for minst fire (${JSON.stringify(h)})`);
  };

  // ---------- Opened directly: the runner's start already landed in Kunstneren ----------
  await t.vent(OPPSETT, 6000);
  await t.sov(300);
  iOppsett(await her(), "Rett på adressen");
  await t.bilde("kunstneren-hviskeleken", true);

  // ---------- The front page: the search finds the card, and the card hands over ----------
  await t.lastSide(t.url + t.forside, "document.querySelector('#alle-liste')");
  await t.skrivInn("#sok", O.sok);
  await t.sov(300);
  const treff = await t.js(`Array.from(document.querySelectorAll("#alle-liste li[data-id]")).filter((li) => !li.hidden).map((li) => li.dataset.id)`);
  t.sjekk(treff.includes("hviskeleken"), `Søket etter «${O.sok}» finner ikke Hviskeleken (${treff.join(", ")})`);
  const lenke = await t.js(`(() => { const a = document.querySelector('#alle-liste li[data-id="hviskeleken"] a'); return a ? new URL(a.href).pathname : null; })()`);
  t.sjekk(lenke === O.side, `Kortet lenker til ${lenke}, ventet ${O.side}`);
  await t.bilde("forside-sok-hviskeleken");
  await t.klikk('#alle-liste li[data-id="hviskeleken"] a');
  await t.vent(`location.pathname === ${JSON.stringify(O.kunstneren)} && document.readyState === "complete" && (${OPPSETT})`, 8000);
  await t.sov(300);
  iOppsett(await her(), "Fra kortet på forsiden");
  // The hand-over replaced the address: «back» goes through Kunstneren (its setup → its start screen,
  // as in every game) to the front page, never to a page that sends you on again.
  const steder = [];
  for (let i = 0; i < 3; i++) {
    await t.js("history.back()");
    await t.sov(900);
    const sti = await t.js("location.pathname");
    steder.push(sti);
    if (sti === t.forside) break;
  }
  await t.vent("document.querySelector('#alle-liste')", 6000);
  t.sjekk(steder[steder.length - 1] === t.forside && !steder.includes(O.side), `«Tilbake» fra Hviskeleken gikk ${steder.join(" → ")}, ventet å havne på ${t.forside}`);

  // ---------- Fewer than four saved: the link makes it four ----------
  await t.lastSide(t.url + O.kunstneren, "document.querySelector('#skjerm h1')");
  await t.js(`(() => { localStorage.setItem(${JSON.stringify(KUNST)}, JSON.stringify({ antall: 3, oppsett: { modus: "tegn" }, spill: null, nesteStart: 0, skjerm: "hjem", _tid: Date.now() })); })()`);
  await t.lastSide(t.side, OPPSETT);
  await t.sov(300);
  let h = await her();
  iOppsett(h, "Med tre spillere lagret");
  t.sjekk(h.antall === 4, `Hviskeleken trenger fire: lenken skulle gi fire spillere, ikke ${h.antall}`);

  // ---------- A game in progress is kept: the start screen with «Fortsett», and Hviskeleken for «Nytt spill» ----------
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('[data-h=\"hjeg\"]')");
  await t.lastSide(t.side, "document.querySelector('#skjerm h1') && window.Rusj && Rusj.S && Rusj.S.skjerm === 'hjem'");
  await t.sov(300);
  h = await her();
  t.sjekk(h.sti === O.kunstneren && h.skjerm === "hjem" && h.spill && h.modus === "hvisk", `Et pågående spill skal bli stående, og lenken gå til startskjermen (${JSON.stringify(h)})`);
  t.sjekk(await t.finnes('[data-h="fortsett"]'), "Startskjermen viser ikke «Fortsett» for spillet som pågår");
  await t.bilde("kunstneren-pagar");
  await t.klikk('[data-h="nytt"]');
  await t.vent("document.querySelector('#ark:not([hidden]) [data-v=\"ja\"]')");
  await t.klikk('#ark [data-v="ja"]');
  await t.vent(OPPSETT);
  h = await her();
  t.sjekk(h.skjerm === "oppsett" && h.modus === "hvisk" && h.flis === "true", `«Nytt spill» etter lenken åpner ikke i Hviskeleken (${JSON.stringify(h)})`);
}
