// The common course of an online e2e scenario (test/nett/<id>.mjs) for the free-text party games
// (Brevduen, Skrønemakeren, Hviskeren, Sauen): everyone writes a short answer on their own phone at
// the same time, then a reveal that one seat leads.
//
// A has a game saved on the phone (against nobody, offline) and makes a room; B, C and D join from
// the link and A starts with four; a fifth phone is told the match has begun. In every step each
// phone does what its own screen asks – all at the same time, so the room has to put the moves in
// order and a move that came second is sent again by the game. In the first round of answers: the
// first writer's answer is on no other screen before everyone has written; the next two write
// `<script>…</script>` and `<img onerror=…>` – every other phone shows them as plain text and no
// script runs. B closes its tab mid-match and comes back; D leaves before writing in a later round
// and is not waited for – the three others play to the end. «Ny kamp» starts match 2 with three;
// A leaves it and B and C are told it is over (too few left); A's saved game is untouched.
//
// o: {
//   lagret: "brevduen.v1",           the game's storage name,
//   offline: async (a) => …          A plays a little offline and sets up the room's settings; ends on the home screen,
//   skjermer: ["n-skriv", …]         the online play screens,
//   slutt: "slutt",                  the end screen,
//   skriv: async (p, tekst, sp) => …  type tekst into p's answer form and send it,
//   gjor: async (p, sp, meg, k) => bool  p does whatever else its screen asks (vote, the leader's button …),
//   tekst: (navn, steg) => "…",      the answer a phone writes in an ordinary step (optional),
//   injeksjon: [skript, bilde],      the two answers that must stay text (optional: the defaults below),
//   nokkel: (sp) => …,               the part of the state every phone must agree on,
//   gjenoppkoble: (sp) => bool,      when B closes its tab and comes back (once),
//   forlatNar: (sp) => bool,         from when D may leave (it does so while it still has to write),
//   sjekk: async (inne, sp) => …     extra checks after every step (optional),
//   kamp2: async (a, b, c) => …      checks on match 2 (optional),
//   maksSteg: 300,
// }
export const SKRIPT = "<script>window.__x=1</script>";
export const BILDE = '<img src=x onerror="window.__x=2">';
export const MERKE = "Zorblax7";

export async function fritekst(t, o) {
  const a = await t.telefon("A");
  const b = await t.telefon("B", { rolig: true });
  const c = await t.telefon("C", { rolig: true });
  const d = await t.telefon("D", { rolig: true });
  const LAGRET = t.nokkel(o.lagret);
  const nokkel = (sp) => JSON.stringify(o.nokkel(sp));
  const tekst = o.tekst || ((navn, steg) => `Zeta ${navn}${steg}`);
  const [skript, bilde] = o.injeksjon || [SKRIPT, BILDE];
  const pa = (p) => `Rusj.nett.aktiv() && ${JSON.stringify(o.skjermer)}.includes(Rusj.S.skjerm)`;
  // Wait until every phone in `inne` has the same state as the first one.
  const likt = async (inne, hva) => {
    for (let forsok = 0; forsok < 50; forsok++) {
      const alle = await Promise.all(inne.map(async (p) => nokkel(await p.spill())));
      if (alle.every((x) => x === alle[0])) return;
      await t.sov(200);
    }
    t.feil(`Mobilene er uenige etter ${hva}`);
  };

  // ---------- Offline first, then the room ----------
  await a.apne();
  await o.offline(a);
  await a.ventSkjerm("hjem");
  const lagret = await a.js(`localStorage.getItem(${JSON.stringify(LAGRET)})`);
  t.sjekk(!!lagret && JSON.parse(lagret).spill, "Spillet ble ikke lagret før nettkampen");
  t.sjekk(await a.finnes('[data-h="nett-apne"]'), "Ingen «Spill med en venn på nett» på hjemskjermen");
  await a.bilde("hjem");

  const lenke = await t.lagRom(a);
  await t.bliMed(b, lenke, "Testspiller B");
  await t.bliMed(c, lenke, "Testspiller C");
  await a.vent(`document.querySelectorAll(".nett-seter li:not(.ledig)").length === 3`, 10000);
  t.sjekk(await a.finnes('[data-h="nett-start"]'), "Verten kan starte med tre");
  await t.bliMed(d, lenke, "Testspiller D");
  await a.vent(`document.querySelectorAll(".nett-seter li:not(.ledig)").length === 4 && document.querySelector('[data-h="nett-start"]')`, 10000);
  await a.bilde("venterom");
  await a.klikk('[data-h="nett-start"]');
  for (const p of [a, b, c, d]) await p.vent(pa(p), 15000);
  const seter = await Promise.all([a, b, c, d].map((p) => p.nettMeg()));
  t.sjekk(seter.join() === "0,1,2,3", `Plassene er ${seter.join()}`);
  await t.sov(400);
  for (const p of [a, b]) await p.bilde("kamp-start");

  // A fifth phone: the match has begun (a full room needs 10–12 phones; not tested here).
  await t.fullt(lenke);

  // ---------- The match ----------
  let inne = [a, b, c, d];
  const meg = new Map([
    [a, 0],
    [b, 1],
    [c, 2],
    [d, 3],
  ]);
  let merket = false; // the round with the secret and the two scripts has been written
  const vist = { skript: false, bilde: false };
  let skriptAv = null;
  let bildeAv = null;
  let tilbake = false;
  let ute = false;
  let bilder = 0;
  const sist = new Map();
  // (The room takes at most 20 messages per 10 s from one phone: a robot is slowed to a person's pace.)
  const tempo = async (p) => {
    const vent = (sist.get(p) || 0) + 700 - Date.now();
    if (vent > 0) await t.sov(vent);
    sist.set(p, Date.now());
  };
  const harSkjema = (p) => p.finnes("[data-nett-skjema]");
  const ingenSkript = async (p, hva) => {
    const x = await p.js("typeof window.__x === 'undefined' && !document.querySelector('#skjerm script, #skjerm img[onerror], #skjerm img[src=\"x\"]')");
    if (!x) t.feil(`${p.navn}: HTML fra et svar ble tolket (${hva})`);
  };

  for (let steg = 0; steg < (o.maksSteg || 300); steg++) {
    const skjermer = await Promise.all(inne.map((p) => p.skjerm()));
    if (skjermer.every((s) => s === o.slutt)) break;
    const sp = await a.spill();

    if (!tilbake && o.gjenoppkoble(sp)) {
      tilbake = true;
      await t.gjenoppkoble(b, a, o.nokkel);
      await likt(inne, "at B kom tilbake");
      continue;
    }
    if (!ute && merket && o.forlatNar(sp) && (await harSkjema(d))) {
      ute = true;
      await d.bilde("for-d-gaar");
      await t.forlat(d);
      inne = [a, b, c];
      for (const p of inne) {
        await p.vent(`Rusj.nett.erUte(3)`, 10000).catch(() => t.feil(`${p.navn}: plassen til D ble ikke tatt ut`));
        await t.sov(300);
        t.sjekk(!(await p.finnes('#ark [data-h="nett-forlat"]')), `${p.navn}: kampen stoppet da D gikk`);
        t.sjekk(await p.js("Rusj.nett.aktiv()"), `${p.navn} er ikke lenger i kampen etter at D gikk`);
      }
      await likt(inne, "at D gikk");
      await a.bilde("d-gikk");
      continue;
    }

    const skrivere = [];
    for (const p of inne) if (await harSkjema(p)) skrivere.push(p);
    // (the first round of answers: everyone writes – in Hviskeren everyone but the guesser)
    if (!merket && skrivere.length >= 3) {
      // The first writer's answer: on no other screen until everyone has written.
      merket = true;
      const [forst, andre, tredje, ...resten] = skrivere;
      await tempo(forst);
      await o.skriv(forst, MERKE, await forst.spill());
      await forst.vent(`!document.querySelector("[data-nett-skjema]")`, 8000).catch(() => t.feil(`${forst.navn}: svaret ble ikke sendt`));
      for (const q of inne.filter((x) => x !== forst)) {
        await q.vent(`JSON.stringify(Rusj.S.spill).includes(${JSON.stringify(MERKE)})`, 10000).catch(() => t.feil(`${q.navn} fikk ikke svaret til ${forst.navn}`));
        const synlig = await q.js(`(() => { const s = document.querySelector("#skjerm"); const attr = Array.from(s.querySelectorAll("*")).flatMap((el) => Array.from(el.attributes).map((x) => x.value)); return (s.textContent + " " + attr.join(" ") + " " + document.querySelector("#topp-tittel").textContent).includes(${JSON.stringify(MERKE)}); })()`);
        t.sjekk(!synlig, `${q.navn} viser svaret til ${forst.navn} før alle har skrevet`);
      }
      await andre.bilde("skriver");
      // The next two answers are HTML; the rest ordinary text – all at the same time.
      skriptAv = andre;
      bildeAv = tredje;
      await Promise.all([
        o.skriv(andre, skript, await andre.spill()),
        o.skriv(tredje, bilde, await tredje.spill()),
        ...resten.map(async (p) => o.skriv(p, tekst(p.navn, steg), await p.spill())),
      ]);
    } else {
      await Promise.all(
        inne.map(async (p) => {
          await tempo(p);
          const egen = await p.spill();
          if (await harSkjema(p)) return o.skriv(p, tekst(p.navn, steg), egen);
          return o.gjor(p, egen, meg.get(p), { steg });
        }),
      );
    }
    await t.sov(300);
    await likt(inne, `steg ${steg}`);

    // Every step: nothing typed runs; the two HTML answers show as text once they are revealed.
    for (const p of inne) {
      await ingenSkript(p, `steg ${steg}`);
      if (p !== skriptAv && !vist.skript && (await p.js(`document.querySelector("#skjerm").innerText.includes(${JSON.stringify(skript)})`))) {
        vist.skript = true;
        await p.bilde("html-som-tekst");
      }
      if (p !== bildeAv && !vist.bilde && (await p.js(`document.querySelector("#skjerm").innerText.includes(${JSON.stringify(bilde)})`))) vist.bilde = true;
    }
    if (o.sjekk) await o.sjekk(inne, await a.spill());
    if (merket && bilder < 4 && steg % 4 === 0) {
      bilder++;
      await t.sov(1500); // (stamps and cards land with a delay: the picture and its checks after that)
      for (const p of inne.slice(0, 2)) await p.bilde(`steg-${steg}`);
    }
  }

  t.sjekk(merket, "Ingen runde der alle skrev samtidig");
  t.sjekk(vist.skript && vist.bilde, `HTML-svarene ble aldri vist som tekst hos de andre (skript ${vist.skript}, bilde ${vist.bilde})`);
  t.sjekk(tilbake, "B lukket aldri fanen midt i kampen");
  t.sjekk(ute, "D forlot aldri kampen");
  for (const p of [a, b, c]) await p.ventSkjerm(o.slutt, 15000).catch(() => t.feil(`${p.navn} kom ikke til kåringen`));
  const slutt = await Promise.all([a, b, c].map(async (p) => nokkel(await p.spill())));
  t.sjekk(slutt.every((x) => x === slutt[0]), "Sluttstillingen er ulik på mobilene");
  t.sjekk(await a.finnes('[data-h="nett-ny"]'), "Ingen «Ny kamp» på kåringen");
  t.sjekk(!(await d.js("Rusj.paNett()")), "D er fortsatt «på nett»");
  for (const p of [a, b, c]) await ingenSkript(p, "kåringen");
  await a.bilde("kaaring");
  await b.bilde("kaaring");

  // ---------- «Ny kamp»: the three in match 2 ----------
  await a.klikk('[data-h="nett-ny"]');
  for (const p of [a, b, c]) await p.vent(`Rusj.nett.kamp() === 2 && ${pa(p)}`, 10000);
  t.sjekk((await c.nettMeg()) === 2 && (await a.js("Rusj.nett.antall()")) === 3, "Kamp 2 har ikke tre plasser");
  if (o.kamp2) await o.kamp2(a, b, c);
  await b.bilde("ny-kamp");

  // A leaves: only two are left, so the match is over for B and C.
  await t.forlat(a);
  for (const p of [b, c]) {
    await p.vent(`document.querySelector('#ark [data-h="nett-forlat"]')`, 8000).catch(() => t.feil(`${p.navn} fikk ikke beskjed om at A gikk`));
    if (t.norsk) t.sjekk(/forlot kampen/.test(await p.tekst("#ark h2")), `${p.navn}: «${await p.tekst("#ark h2")}»`);
  }
  await b.bilde("a-forlot");
  for (const p of [b, c]) {
    await p.klikk('#ark [data-h="nett-forlat"]');
    await p.ventSkjerm("hjem");
    t.sjekk(!(await p.js("Rusj.paNett()")), `${p.navn} er fortsatt «på nett» etter «Forlat»`);
  }

  // A's own game: exactly as saved before the match on the net (only `_tid` moves).
  const utenTid = (x) => JSON.stringify({ ...JSON.parse(x), _tid: 0 });
  t.sjekk(utenTid(await a.js(`localStorage.getItem(${JSON.stringify(LAGRET)})`)) === utenTid(lagret), "Spillet A hadde lagret, ble endret av nettkampen");
  t.sjekk(await a.finnes('[data-h="fortsett"]'), "«Fortsett» mangler etter nettkampen");
  await a.klikk('[data-h="fortsett"]');
  await t.sov(400);
  t.sjekk((await a.spill()).modus !== "nett", "«Fortsett» ga ikke spillet fra før nettkampen");
  await a.bilde("fortsett-offline");
}

// Type into a field as a person would (the input event keeps the draft) and send the form.
export async function skrivOgSend(p, felt, tekst) {
  const felter = Array.isArray(felt) ? felt : [felt];
  const tekster = Array.isArray(tekst) ? tekst : [tekst];
  for (let n = 0; n < felter.length; n++) await p.skrivInn(felter[n], tekster[n]);
  await p.klikk('[data-nett-skjema] button[type="submit"]', 60);
}
