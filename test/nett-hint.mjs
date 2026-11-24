// The common course of an online e2e scenario (test/nett/<id>.mjs) for the «one knows, the others
// guess» party games, where many phones act at once (everyone picks a card, everyone sets a needle)
// and some phones see what others must not (the key, the target, the secret): A (maybe with a game
// saved on the phone) makes a room, the others join from the link and A starts; a phone that comes
// later is refused; they play the match to its end, driven by the game's own `steg` – one reaction
// goes across, B closes its tab half-way and comes back, the game checks every step that the
// secrets stay on their phones; everyone sees the result; «Ny kamp» starts match 2; then everyone
// leaves and A's saved game is untouched. With `forlat`, one phone leaves on purpose mid-match
// instead and the others play on to the end (games in FORTSETT, nett/src/oppsett.js).
//
// o: {
//   antall: 3,                     phones in the room (A is the host, seat 0; the others in order)
//   lagret: "dommeren.v1",         the game's storage name, with offline (lagretSom: (state) => state
//                                   evens out what the game's own loading tidies on every reload):
//   offline: async (a) => …        play a little on A first, end on the home screen (optional)
//   forbered: async (a) => …       A's own settings before the room is made (the room's setup), optional
//   steg: async (tlf, sp, ctx) => bool   one step of the match: make a move on a phone (each phone
//                                   has .sete) and wait until it is played; false: nothing to do now.
//                                   ctx.klar(p) before a tap that sends a move (at most one move per
//                                   phone per 600 ms – the room takes 20 messages in 10 s).
//   hemmelig: async (tlf, sp) => … checks of what the phones show (every step), optional
//   nokkel: (sp) => …              the part of the state every phone must agree on,
//   gjenoppkoble: (sp) => bool     when B closes its tab and comes back (once; leave out to skip),
//   slutt: "slutt"                 the end screen («Kåringen»),
//   tilSlutt: async (p) => …       what a phone taps to get there when the match is over (optional),
//   kamp2: async (tlf) => …        checks on match 2 (who starts),
//   forlat: { nar: (sp) => bool, hvem: 2, etter: async (tlf) => … }  play-on: that seat leaves,
//   maksSteg: 400,
// }
const sov = (ms) => new Promise((r) => setTimeout(r, ms));
const NAVN = ["A", "B", "C", "D", "E", "F"];

export async function hintRom(t, o) {
  const antall = o.antall || 3;
  const SLUTT = o.slutt || "slutt";
  const merke = o.merke || "";
  const tlf = [];
  for (let i = 0; i < antall; i++) {
    const p = await t.telefon(NAVN[i] + merke, i ? { rolig: true } : undefined);
    p.sete = i;
    tlf.push(p);
  }
  const [a] = tlf;
  const nokkel = (sp) => JSON.stringify(o.nokkel(sp));
  let inne = tlf.slice();
  // Wait until the phones still in agree with p.
  const likt = async (p, hva) => {
    const mal = nokkel(await p.spill());
    for (const q of inne) {
      if (q === p) continue;
      let ok = false;
      for (let i = 0; i < 40 && !ok; i++) {
        ok = nokkel(await q.spill()) === mal;
        if (!ok) await sov(200);
      }
      if (!ok) t.feil(`${q.navn} er uenig med ${p.navn} etter ${hva}`);
    }
  };
  const sist = new Map();
  const ctx = {
    async klar(p) {
      const vent = (sist.get(p) || 0) + 600 - Date.now();
      if (vent > 0) await sov(vent);
      sist.set(p, Date.now());
    },
    likt,
  };

  await a.apne();
  let lagret = null;
  const LAGRET = o.lagret && t.nokkel(o.lagret);
  if (o.offline) {
    await o.offline(a);
    await a.ventSkjerm("hjem");
    lagret = await a.js(`localStorage.getItem(${JSON.stringify(LAGRET)})`);
    t.sjekk(!!lagret && JSON.parse(lagret).spill, "Spillet på mobilen ble ikke lagret før nettkampen");
  }
  if (o.forbered) await o.forbered(a);
  await a.ventSkjerm("hjem");
  t.sjekk(await a.finnes('[data-h="nett-apne"]'), "Ingen «Spill med en venn på nett» på hjemskjermen");
  const lenke = await t.lagRom(a);
  for (const p of tlf.slice(1)) await t.bliMed(p, lenke, `Testspiller ${p.navn.charAt(0)}`);
  await a.vent(`document.querySelectorAll(".nett-seter li:not(.ledig)").length === ${antall}`, 15000);
  if (await a.finnes('[data-h="nett-start"]')) {
    await a.bilde("venterom");
    await a.klikk('[data-h="nett-start"]');
  }
  for (const p of tlf) await p.vent("window.Rusj && Rusj.nett && Rusj.nett.aktiv()", 15000);
  await sov(400);
  for (const p of tlf) t.sjekk((await p.nettMeg()) === p.sete, `${p.navn} har ikke plass ${p.sete}`);
  await a.bilde("kamp-start");
  await tlf[1].bilde("kamp-start");
  if (!o.forlat) await t.fullt(lenke);

  let reaksjon = false;
  let tilbake = !o.gjenoppkoble;
  let ute = null;
  for (let steg = 0; steg < (o.maksSteg || 400); steg++) {
    if (await a.js("!!(Rusj.nett.aktiv() && Rusj.app.nett.ferdig(Rusj.S))")) break;
    const sp = await a.spill();
    if (o.hemmelig) await o.hemmelig(inne, sp);
    if (!tilbake && o.gjenoppkoble(sp)) {
      tilbake = true;
      await t.gjenoppkoble(tlf[1], a, o.nokkel);
      continue;
    }
    if (!reaksjon && steg >= 2) {
      reaksjon = true;
      await a.klikk('[data-h="nett-reaksjoner"]');
      await a.klikk('#ark [data-h="nett-reaksjon"][data-v="1"]');
      await tlf[1].vent(`document.querySelector("#nett-boble")`, 5000).catch(() => t.feil("B så ikke reaksjonen fra A"));
    }
    if (o.forlat && !ute && o.forlat.nar(sp)) {
      const p = tlf[o.forlat.hvem];
      ute = p;
      await p.bilde("for-den-gaar");
      await t.forlat(p);
      inne = inne.filter((q) => q !== p);
      for (const q of inne) {
        await q.vent(`Rusj.nett.erUte(${p.sete})`, 10000).catch(() => t.feil(`${q.navn}: plassen til ${p.navn} ble ikke tatt ut`));
        await sov(300);
        t.sjekk(!(await q.finnes('#ark [data-h="nett-forlat"]')), `${q.navn}: kampen stoppet da ${p.navn} gikk`);
        t.sjekk(await q.js("Rusj.nett.aktiv()"), `${q.navn} er ikke lenger i kampen etter at ${p.navn} gikk`);
      }
      await likt(a, `at ${p.navn} gikk`);
      await a.bilde("en-gikk");
      if (o.forlat.etter) await o.forlat.etter(inne);
      continue;
    }
    const gjort = await o.steg(inne, sp, ctx);
    if (!gjort) {
      await sov(250);
      continue;
    }
    await likt(a, `steg ${steg}`);
    if (steg === 5) for (const p of inne) await p.bilde("midt-i-kampen");
  }
  t.sjekk(tilbake && reaksjon, "Kampen ble for kort til å teste gjenoppkobling og reaksjon");
  if (o.forlat) t.sjekk(!!ute, "Ingen forlot kampen");
  t.sjekk(await a.js("Rusj.app.nett.ferdig(Rusj.S)"), "Kampen ble ikke ferdig");
  for (const p of inne) {
    if (o.tilSlutt && (await p.skjerm()) !== SLUTT) await o.tilSlutt(p);
    await p.ventSkjerm(SLUTT, 15000);
  }
  const slutt = nokkel(await a.spill());
  for (const p of inne) t.sjekk(nokkel(await p.spill()) === slutt, `Sluttstillingen er ulik hos ${p.navn} og A`);
  t.sjekk(await a.finnes('[data-h="nett-ny"]'), "Ingen «Ny kamp» på kåringen");
  for (const p of inne) await p.bilde("kaaring");

  if (!o.forlat) {
    // «Ny kamp»: every phone in match 2.
    await a.klikk('[data-h="nett-ny"]');
    for (const p of inne) await p.vent(`Rusj.nett.kamp() === 2 && Rusj.nett.aktiv() && Rusj.S.skjerm !== ${JSON.stringify(SLUTT)}`, 10000);
    if (o.kamp2) await o.kamp2(inne);
    await tlf[1].bilde("ny-kamp");
  }
  for (const p of inne) {
    if (!(await p.js("Rusj.paNett()"))) continue;
    await t.forlat(p);
  }
  if (lagret) {
    // A's own game: exactly as saved before the match on the net (only `_tid` moves; o.lagretSom
    // evens out what the game's own loading tidies on any reload).
    const utenTid = (x) => JSON.stringify((o.lagretSom || ((y) => y))({ ...JSON.parse(x), _tid: 0 }));
    const etter = utenTid(await a.js(`localStorage.getItem(${JSON.stringify(LAGRET)})`));
    const for_ = utenTid(lagret);
    const i = [...for_].findIndex((ch, n) => ch !== etter[n]);
    t.sjekk(etter === for_, `Spillet A hadde lagret, ble endret av nettkampen (før: …${for_.slice(Math.max(0, i - 40), i + 40)}… etter: …${etter.slice(Math.max(0, i - 40), i + 40)}…)`);
    t.sjekk(await a.finnes('[data-h="fortsett"]'), "«Fortsett» mangler etter nettkampen");
  }
  return { tlf };
}

// The text a phone shows (for «the secret is not on this screen»): the page and any open sheet.
export const synligTekst = (p) => p.js(`(document.querySelector("#skjerm")?.innerText || "") + " " + (document.querySelector("#ark")?.innerText || "")`);
