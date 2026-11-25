// Flinkisen on the net: A has a game on paper saved (three rounds, the classic five; the party
// pack asked about age first and A said «Nei», so it is not the room's pack), makes a room; B, C and D join and A starts with four (of up to ten); a fifth phone is told the match has
// begun. Everyone types at once on their own phone, one answer per category.
// Round 1: D types two answers and loads the page again: the text is still in the fields (kept
// on D's phone only). B is first and taps «Stopp» – its answers are in no other phone's page; the
// others get ten seconds (counted on each phone); A and C send at the same time (one answer is
// `<script>…</script>`, another `<img onerror=…>`), D sends nothing and its phone sends what it
// has when its own ten seconds are out – into a line that is dead: the page says «sender», never
// «sendt», and when the line is back the phone sends what it owes by itself. Category by category
// every answer is plain text; two of the
// three others mark an answer as «teller ikke» and it scores 0; only the leader goes on.
// Round 2: C closes its tab while it should write; A stops, B and D send, and when the ten seconds
// and a little more are out A goes on without C; C comes back into the same match.
// Round 3: D leaves while it still has to write and is not waited for; the three others play to
// «Kåringen». «Ny kamp» lets the next seat lead; A leaves and B and C play on (two is enough); B
// leaves and C is told it is over. A's saved game is untouched.
import { SKRIPT, MERKE } from "../nett-fritekst.mjs";

// (An answer is at most 30 characters and begins with the round's letter: the letter, then a whole
// tag that would run if the answer were read as HTML.)
const BILDE = "<img src=x onerror=__x=2>";
const nokkel = (sp) => [sp.runde, sp.ferdig, sp.steg, sp.ute, sp.poeng, sp.spilt, sp.r && [sp.r.b, sp.r.k, sp.r.leder, sp.r.fase, sp.r.svar, sp.r.stopp, sp.r.nr, sp.r.merk, sp.r.pluss]];
const SKJERMER = ["n-skriv", "n-dom", "n-poeng", "slutt"];

export default async function (t) {
  const a = await t.telefon("A");
  const b = await t.telefon("B", { rolig: true });
  const c = await t.telefon("C", { rolig: true });
  const d = await t.telefon("D", { rolig: true });
  const LAGRET = t.nokkel("flinkisen.v1");
  const tekst = (sp) => JSON.stringify(nokkel(sp));
  const pa = `Rusj.nett.aktiv() && ${JSON.stringify(SKJERMER)}.includes(Rusj.S.skjerm)`;
  // Wait until every phone in `inne` has the same state as the first one.
  const likt = async (inne, hva) => {
    for (let forsok = 0; forsok < 50; forsok++) {
      const alle = await Promise.all(inne.map(async (p) => tekst(await p.spill())));
      if (alle.every((x) => x === alle[0])) return;
      await t.sov(200);
    }
    t.feil(`Mobilene er uenige etter ${hva}`);
  };
  const fase = (p, f, ms = 15000) => p.vent(`Rusj.S.spill && Rusj.S.spill.r && Rusj.S.spill.r.fase === ${JSON.stringify(f)}`, ms);
  const ingenSkript = async (p, hva) => {
    const ok = await p.js("typeof window.__x === 'undefined' && !document.querySelector('#skjerm script, #skjerm img[onerror], #skjerm img[src=\"x\"]')");
    if (!ok) t.feil(`${p.navn}: HTML fra et svar ble tolket (${hva})`);
  };
  // Type into the fields as a person would (the input event keeps the draft); empty strings are left alone.
  const fyll = async (p, svar) => {
    for (let n = 0; n < svar.length; n++) if (svar[n] !== "") await p.skrivInn(`#fl-felt-${n}`, svar[n]);
  };
  // … and send: «Stopp» for the first one, «Send svarene» for the rest (an empty field is asked about).
  const send = async (p) => {
    await p.klikk("#fl-send", 80);
    if (await p.finnes('#ark [data-h="ark-svar"][data-v="ja"]')) await p.klikk('#ark [data-h="ark-svar"][data-v="ja"]', 80);
  };
  // Answers on the round's letter that are nobody else's (and no word of any language).
  const egne = (sp, hvem) => sp.r.k.map((_, n) => `${sp.r.b}yxa${hvem}${n}`);
  const levert = (p) => p.vent(`!document.querySelector("[data-nett-skjema]")`, 8000).catch(() => t.feil(`${p.navn}: svarene ble ikke sendt`));
  // The leader takes the scoring through every category and gives out the points.
  const gjennom = async (leder, inne, fra = 0) => {
    const antall = (await leder.spill()).r.k.length;
    for (let n = fra; n < antall; n++) {
      await t.sov(650); // (a person's pace: the room takes 20 messages per 10 s from one phone)
      await leder.klikk('[data-h="n-neste"]');
      if (n < antall - 1) await leder.vent(`Rusj.S.spill.r.nr === ${n + 1}`, 8000);
    }
    for (const p of inne) await fase(p, "poeng");
    await likt(inne, "at poengene ble delt ut");
  };

  // ---------- A's own game first, then the room ----------
  await a.apne();
  await a.klikk('[data-h="nytt"]');
  await a.ventSkjerm("oppsett");
  // The party pack is 18+: A says «Nei», and neither the game nor the room gets it.
  await a.klikk('[data-h="pakke"][data-v="fest"]');
  await a.vent(`document.querySelector('#ark:not([hidden]) [data-h="ark-svar"]')`, 6000).catch(() => t.feil("Festpakken spør ikke om alder"));
  if (t.norsk) t.sjekk(/Er du 18 år eller eldre\?/.test(await a.tekst("#ark")), "Festpakken spør ikke om alder");
  await a.klikk('#ark [data-h="ark-svar"][data-v="nei"]', 300);
  t.sjekk((await a.js("Rusj.S.oppsett.pakke")) !== "fest" && (await a.js("!JSON.parse(localStorage.getItem('rusj.felles') || '{}').over18")), "«Nei» valgte festpakken likevel");
  await a.klikk('[data-h="pakke"][data-v="klassisk"]');
  await a.klikk('[data-h="kat"][data-v="5"]');
  await a.klikk('[data-h="runder"][data-v="3"]');
  await a.klikk('[data-h="start"]');
  await a.ventSkjerm("klar");
  await a.klikk('[data-h="tilbake"]');
  await a.ventSkjerm("hjem");
  const lagret = await a.js(`localStorage.getItem(${JSON.stringify(LAGRET)})`);
  t.sjekk(!!lagret && JSON.parse(lagret).spill, "Spillet ble ikke lagret før nettkampen");
  t.sjekk(await a.finnes('[data-h="nett-apne"]'), "Ingen «Spill med en venn på nett» på hjemskjermen");
  await a.bilde("hjem");

  const lenke = await t.lagRom(a);
  await t.bliMed(b, lenke, "Testspiller B");
  await a.vent(`document.querySelectorAll(".nett-seter li:not(.ledig)").length === 2`, 10000);
  t.sjekk(await a.finnes('[data-h="nett-start"]'), "Verten kan ikke starte med to");
  await t.bliMed(c, lenke, "Testspiller C");
  await t.bliMed(d, lenke, "Testspiller D");
  await a.vent(`document.querySelectorAll(".nett-seter li:not(.ledig)").length === 4 && document.querySelector('[data-h="nett-start"]')`, 10000);
  if (t.norsk) t.sjekk(/Klassisk.*3 runder.*5 kategorier/.test(await a.tekst("#skjerm .seksjon .hjelp")), `Venterommet viser ikke vertens oppsett: «${await a.tekst("#skjerm .seksjon .hjelp")}»`);
  t.sjekk(!/18\+/.test(await a.tekst("#skjerm .seksjon .hjelp")), "Rommet er satt opp med festpakken uten ja på aldersspørsmålet");
  await a.bilde("venterom");
  await a.klikk('[data-h="nett-start"]');
  for (const p of [a, b, c, d]) await p.vent(pa, 15000);
  const seter = await Promise.all([a, b, c, d].map((p) => p.nettMeg()));
  t.sjekk(seter.join() === "0,1,2,3", `Plassene er ${seter.join()}`);
  let sp = await a.spill();
  t.sjekk(sp.runder === 3 && sp.kat === 5 && sp.pakke === "klassisk" && sp.r.k.join() === "0,1,2,3,4" && sp.r.leder === 0, "Kampen har ikke vertens oppsett");
  t.sjekk((await a.antall("#skjerm .fl-felt input")) === 5 && (await d.antall("#skjerm .fl-felt input")) === 5, "Ikke fem felt å skrive i");
  t.sjekk((await b.tekst(".fl-bokstav")).trim() === sp.r.b, "B viser ikke samme bokstav som A");
  t.sjekk((await a.js(`document.querySelector("#fl-felt-0").maxLength`)) === 30, "Feltene tar ikke høyst 30 tegn");
  await t.sov(400);
  for (const p of [a, b]) await p.bilde("kamp-start");

  // A fifth phone: the match has begun.
  await t.fullt(lenke);

  // ---------- Round 1: «Stopp», ten seconds, HTML as text ----------
  const L = sp.r.b;
  // A field that does not begin with the letter says so (and still goes, for 0 points).
  await a.skrivInn("#fl-felt-3", "1x");
  t.sjekk(await a.js(`document.querySelector("#fl-felt-3").closest(".fl-felt").classList.contains("feil")`), "Feil bokstav i et felt blir ikke merket");
  await a.skrivInn("#fl-felt-3", "");
  // D types two answers and loads the page again while writing: the text is still in the fields.
  // It is kept on D's phone only (no other phone has it), and a reload delivers nothing.
  await fyll(d, [`${L}yxad0`, `${L}yxad1`]);
  // (The page is left and opened again, as in the other scenarios: the document is loaded anew.)
  await d.js("window.__forOmlasting = 1");
  await d.js("location.href = 'about:blank'");
  await t.sov(500);
  await d.lastSide(d.side, "document.querySelector('#skjerm h1')");
  await d.vent(`${pa} && !!document.querySelector("#fl-felt-4")`, 15000).catch(() => t.feil("D kom ikke tilbake til feltene etter å ha lastet siden på nytt"));
  t.sjekk(await d.js("typeof window.__forOmlasting === 'undefined'"), "Siden til D ble ikke lastet på nytt");
  const utkastD = await d.js(`[0, 1, 2, 3, 4].map((n) => document.querySelector("#fl-felt-" + n).value).join("|")`);
  t.sjekk(utkastD === `${L}yxad0|${L}yxad1|||`, `Det D hadde skrevet ble borte da siden ble lastet på nytt: «${utkastD}»`);
  t.sjekk(!(await a.js(`JSON.stringify(Rusj.S.spill).includes("yxad")`)) && (await a.spill()).r.svar[3] == null, "Utkastet til D gikk til rommet");
  await d.bilde("utkast-etter-omlasting");
  // B is first with all five: «Stopp». Its answers are on no other phone's page.
  await fyll(b, [L + MERKE, ...egne(sp, "b").slice(1)]);
  await send(b);
  await levert(b);
  for (const q of [a, c, d]) {
    await q.vent(`JSON.stringify(Rusj.S.spill).includes(${JSON.stringify(MERKE)})`, 10000).catch(() => t.feil(`${q.navn} fikk ikke svarene til B`));
    const synlig = await q.js(`(() => { const s = document.querySelector("#skjerm"); const attr = Array.from(s.querySelectorAll("*")).flatMap((el) => Array.from(el.attributes).map((x) => x.value)); return (s.textContent + " " + attr.join(" ") + " " + document.querySelector("#topp-tittel").textContent).includes(${JSON.stringify(MERKE)}); })()`);
    t.sjekk(!synlig, `${q.navn} viser svarene til B før runden er lukket`);
    // The ten seconds run on this phone, and the button now sends the answers.
    await q.vent(`!document.querySelector("[data-fl-stopp]").hidden && Number(document.querySelector("[data-fl-ned]").textContent) >= 1`, 5000).catch(() => t.feil(`${q.navn} ser ikke nedtellingen etter «Stopp»`));
  }
  if (t.norsk) t.sjekk(/Testspiller B sa stopp/.test(await a.tekst("[data-fl-stopptekst]")) && /Send svarene/.test(await a.tekst("#fl-send")), `A etter «Stopp»: «${await a.tekst("[data-fl-stopptekst]")}» / «${await a.tekst("#fl-send")}»`);
  if (t.norsk) t.sjekk(/Du sa stopp/.test(await b.tekst("[data-fl-stopptekst]")), `B etter «Stopp»: «${await b.tekst("[data-fl-stopptekst]")}»`);
  t.sjekk((await b.antall(".fl-mine li")) === 5, "B ser ikke sine egne svar etter at de er sendt");
  await a.bilde("stopp-ti-sekunder");
  await b.bilde("har-sagt-stopp");
  // D's line dies without the phone knowing: what it sends from now on never reaches the room.
  await d.js(`(() => { window.__ekteSend = WebSocket.prototype.send; window.__slukt = 0; WebSocket.prototype.send = function (m) { window.__ws = this; if (m !== "ping") window.__slukt += 1; }; })()`);
  // A and C send at the same time; C's first answer is a script, A's second an image tag. D has
  // its two answers from before the reload and sends nothing: its phone does, when its own ten
  // seconds are out.
  await Promise.all([
    (async () => {
      await fyll(a, [`${L}yxaa0`, L + BILDE, ...egne(sp, "a").slice(2)]);
      await send(a);
    })(),
    (async () => {
      await fyll(c, [L + SKRIPT, ...egne(sp, "c").slice(1)]);
      await send(c);
    })(),
  ]);
  for (const p of [a, c]) await levert(p);
  // D's ten seconds run out: its phone sends what is in the fields – into the dead line. Its page
  // says «sender», not «sendt», and the room has nothing from D (the round is still open).
  await d.vent(`window.__slukt >= 1 && !!document.querySelector(".fl-sendt.sender")`, 20000).catch(() => t.feil("D sin mobil sendte ikke da tiden var ute (eller viser ikke «Sender …»)"));
  if (t.norsk) t.sjekk(/Sender svarene dine/.test(await d.tekst(".fl-sendt-tittel")) && !/er sendt/.test(await d.tekst(".fl-sendt-tittel")), `D med død linje: «${await d.tekst(".fl-sendt-tittel")}»`);
  await t.sov(400);
  sp = await a.spill();
  t.sjekk(sp.r.fase === "skriv" && sp.r.svar[3] == null && (await d.spill()).r.svar[3] == null, "Rommet fikk svar fra D gjennom en død linje");
  await d.bilde("sender");
  // The phone notices that the line is gone (close code 1006, as a dead line gives – a close of
  // our own would look like the room saying goodbye) and connects again: it sends what it owes by
  // itself – nobody touches it – and the round closes with D's answers.
  await d.js(`(() => { WebSocket.prototype.send = window.__ekteSend; const ws = window.__ws; ws.onclose(new CloseEvent("close", { code: 1006 })); ws.close(); })()`);
  for (const p of [a, b, c, d]) await fase(p, "dom", 20000).catch(() => t.feil(`${p.navn} kom ikke til poengene etter ti sekunder`));
  t.sjekk((await d.js("window.__slukt")) === 1, `D sin mobil sendte ${await d.js("window.__slukt")} ganger inn i den døde linja (ventet én)`);
  await likt([a, b, c, d], "runde 1 ble lukket");
  sp = await a.spill();
  t.sjekk(sp.r.stopp === 1 && sp.r.svar[3].join("|") === `${L}yxad0|${L}yxad1|||`, `D sin mobil sendte ikke det som sto i feltene: ${JSON.stringify(sp.r.svar[3])}`);
  t.sjekk(sp.r.svar[2][0] === L + SKRIPT && sp.r.svar[0][1] === L + BILDE, "HTML-svarene kom ikke fram som de ble skrevet");
  // In the room's list: nothing of the draft is left on D's phone.
  t.sjekk(await d.js(`Rusj.nett.hemmelig() == null`), "Utkastet til D ligger igjen på mobilen etter at svarene er levert");

  // Category 1: every answer as plain text; C's script is on the page as text, on every other phone.
  for (const p of [a, b, d]) {
    await ingenSkript(p, "kategori 1");
    t.sjekk(await p.js(`document.querySelector("#skjerm").innerText.includes(${JSON.stringify(SKRIPT)})`), `${p.navn} viser ikke skript-svaret som tekst`);
    t.sjekk((await p.antall(".fl-rad")) === 4, `${p.navn} ser ikke fire svar`);
  }
  t.sjekk((await a.antall('[data-h="n-merk"]')) === 3 && !(await a.finnes('[data-h="n-merk"][data-v="0"]')), "A kan merke sitt eget svar (eller mangler knapper for de andres)");
  t.sjekk((await a.finnes('[data-h="n-neste"]')) && !(await b.finnes('[data-h="n-neste"]')) && !(await c.finnes('[data-h="n-neste"]')), "Bare lederen (A) skal kunne gå videre");
  if (t.norsk) t.sjekk(/Spiller 1 går videre/.test(await b.tekst(".fl-venter")), `B får ikke vite hvem som går videre: «${await b.tekst(".fl-venter")}»`);
  await b.bilde("html-som-tekst");
  // «Teller ikke»: one mark of three others is not enough, two are – and C's answer scores 0.
  await a.klikk('[data-h="n-merk"][data-v="2"]');
  for (const p of [a, b, c, d]) await p.vent(`(Rusj.S.spill.r.merk["0:2"] || []).length === 1`, 8000);
  t.sjekk(!(await c.finnes(".fl-rad.strok")), "Ett merke av tre strøk svaret");
  await b.klikk('[data-h="n-merk"][data-v="2"]');
  for (const p of [a, b, c, d]) await p.vent(`(Rusj.S.spill.r.merk["0:2"] || []).length === 2 && !!document.querySelector(".fl-rad.strok")`, 8000).catch(() => t.feil(`${p.navn}: to merker av tre strøk ikke svaret`));
  // D marks and takes it back: the count follows.
  await d.klikk('[data-h="n-merk"][data-v="2"]');
  await a.vent(`(Rusj.S.spill.r.merk["0:2"] || []).length === 3`, 8000);
  await t.sov(650);
  await d.klikk('[data-h="n-merk"][data-v="2"]');
  await a.vent(`(Rusj.S.spill.r.merk["0:2"] || []).length === 2`, 8000);
  await likt([a, b, c, d], "merkene");
  await c.bilde("strøket");
  // The leader goes on to the next category (the image tag as text), one back, and through the rest.
  await a.klikk('[data-h="n-neste"]');
  for (const p of [a, b, c, d]) await p.vent(`Rusj.S.spill.r.nr === 1 && Rusj.S.skjerm === "n-dom"`, 8000);
  await t.sov(400);
  for (const p of [b, c, d]) {
    await ingenSkript(p, "kategori 2");
    t.sjekk(await p.js(`document.querySelector("#skjerm").innerText.includes(${JSON.stringify(BILDE)})`), `${p.navn} viser ikke bilde-svaret som tekst`);
  }
  t.sjekk(!(await b.finnes(".fl-rad.strok")), "Merkene fra forrige kategori fulgte med til neste");
  await t.sov(650);
  await a.klikk('[data-h="n-forrige"]');
  await b.vent(`Rusj.S.spill.r.nr === 0 && !!document.querySelector(".fl-rad.strok")`, 8000).catch(() => t.feil("«Forrige kategori» viste ikke merkene igjen"));
  await gjennom(a, [a, b, c, d]);
  sp = await a.spill();
  // A and B alone five times; C's first is struck; D has two answers.
  t.sjekk(sp.poeng.join() === "50,50,40,20", `Poengene etter runde 1: ${sp.poeng}`);
  for (const p of [a, b, c, d]) await ingenSkript(p, "stillingen");
  await a.bilde("stillingen");
  await t.sov(650);
  await a.klikk('[data-h="n-neste"]');
  for (const p of [a, b, c, d]) await p.vent(`Rusj.S.spill.runde === 1 && Rusj.S.skjerm === "n-skriv"`, 10000);

  // ---------- Round 2: C's tab is closed; the others go on without it ----------
  sp = await a.spill();
  t.sjekk(sp.r.leder === 1 && sp.r.b !== L, "Runde 2 har ikke ny bokstav og neste leder");
  await c.js("location.href = 'about:blank'");
  await t.sov(800);
  await fyll(a, egne(sp, "a"));
  await send(a);
  await levert(a);
  await Promise.all(
    [b, d].map(async (p) => {
      await fyll(p, egne(sp, p.navn.toLowerCase()));
      await send(p);
    }),
  );
  for (const p of [b, d]) await levert(p);
  t.sjekk((await a.spill()).r.fase === "skriv" && !(await a.finnes('[data-h="n-lukk"]')), "Runden ventet ikke på C, eller «Gå videre uten» kom for tidlig");
  // Ten seconds and a little more: the ones who have delivered may go on without C.
  await a.vent(`document.querySelector('[data-h="n-lukk"]')`, 20000).catch(() => t.feil("A fikk aldri «Gå videre uten …»"));
  if (t.norsk) t.sjekk(/Gå videre uten Testspiller C/.test(await a.tekst('[data-h="n-lukk"]')), `Knappen: «${await a.tekst('[data-h="n-lukk"]')}»`);
  await a.bilde("venn-borte");
  await a.klikk('[data-h="n-lukk"]');
  for (const p of [a, b, d]) await fase(p, "dom");
  // C opens the game again: back in the same match, with empty answers in this round.
  await c.lastSide(c.side, "document.querySelector('#skjerm h1')");
  await c.vent("window.Rusj && Rusj.nett && Rusj.nett.aktiv()", 15000);
  await t.sov(600);
  await likt([a, b, c, d], "at C kom tilbake");
  sp = await c.spill();
  t.sjekk(sp.r.fase === "dom" && sp.r.svar[2].join("") === "" && sp.poeng.join() === "50,50,40,20", "C fikk ikke samme kamp tilbake");
  await c.bilde("tilbake-i-kampen");
  t.sjekk((await b.finnes('[data-h="n-neste"]')) && !(await a.finnes('[data-h="n-neste"]')), "Leder i runde 2 skal være B");
  await gjennom(b, [a, b, c, d]);
  sp = await a.spill();
  t.sjekk(sp.poeng.join() === "100,100,40,70", `Poengene etter runde 2: ${sp.poeng}`);
  await t.sov(650);
  await b.klikk('[data-h="n-neste"]');
  for (const p of [a, b, c, d]) await p.vent(`Rusj.S.spill.runde === 2 && Rusj.S.skjerm === "n-skriv"`, 10000);

  // ---------- Round 3: D leaves while it still has to write ----------
  sp = await a.spill();
  await d.bilde("for-d-gaar");
  await t.forlat(d);
  for (const p of [a, b, c]) {
    await p.vent(`Rusj.nett.erUte(3)`, 10000).catch(() => t.feil(`${p.navn}: plassen til D ble ikke tatt ut`));
    await t.sov(300);
    t.sjekk(!(await p.finnes('#ark [data-h="nett-forlat"]')), `${p.navn}: kampen stoppet da D gikk`);
    t.sjekk(await p.js("Rusj.nett.aktiv()"), `${p.navn} er ikke lenger i kampen etter at D gikk`);
  }
  await a.bilde("d-gikk");
  // All three at the same time: the room puts the moves in order, and the round closes on the last one.
  await Promise.all(
    [a, b, c].map(async (p) => {
      await fyll(p, [`${sp.r.b}felles`, ...egne(sp, p.navn.toLowerCase()).slice(1)]);
      await send(p);
    }),
  );
  for (const p of [a, b, c]) await fase(p, "dom").catch(() => t.feil(`${p.navn}: runden ble ikke lukket uten D`));
  await likt([a, b, c], "runde 3 ble lukket");
  t.sjekk((await a.antall(".fl-rad")) === 3 && (await a.antall(".fl-rad.delt")) === 3, "Tre like svar gir ikke «likt» for alle tre (eller D står fortsatt i lista)");
  await b.bilde("like-svar");
  // In the next category B and C (both of the others) mark A's answer: it scores 0.
  await t.sov(650);
  await c.klikk('[data-h="n-neste"]');
  for (const p of [a, b, c]) await p.vent(`Rusj.S.spill.r.nr === 1 && Rusj.S.skjerm === "n-dom"`, 8000);
  await b.klikk('[data-h="n-merk"][data-v="0"]');
  await t.sov(650);
  await c.klikk('[data-h="n-merk"][data-v="0"]');
  for (const p of [a, b, c]) await p.vent(`(Rusj.S.spill.r.merk["1:0"] || []).length === 2`, 8000).catch(() => t.feil(`${p.navn}: merkene på svaret til A kom ikke fram`));
  await gjennom(c, [a, b, c], 1);
  sp = await a.spill();
  t.sjekk(sp.poeng.join() === "135,145,85,70", `Poengene etter runde 3: ${sp.poeng}`);
  await t.sov(650);
  await c.klikk('[data-h="n-neste"]');

  // ---------- «Kåringen» ----------
  for (const p of [a, b, c]) await p.ventSkjerm("slutt", 15000).catch(() => t.feil(`${p.navn} kom ikke til kåringen`));
  const slutt = await Promise.all([a, b, c].map(async (p) => tekst(await p.spill())));
  t.sjekk(slutt.every((x) => x === slutt[0]), "Sluttstillingen er ulik på mobilene");
  if (t.norsk) t.sjekk(/Testspiller B vinner!/.test(await a.tekst("#skjerm h1")), `Kåringen: «${await a.tekst("#skjerm h1")}»`);
  t.sjekk((await a.antall(".poengliste li")) === 3, "D (som gikk) står i kåringen");
  t.sjekk(await a.finnes('[data-h="nett-ny"]'), "Ingen «Ny kamp» på kåringen");
  t.sjekk(!(await d.js("Rusj.paNett()")), "D er fortsatt «på nett»");
  for (const p of [a, b, c]) await ingenSkript(p, "kåringen");
  await a.bilde("kaaring");
  await b.bilde("kaaring");

  // ---------- «Ny kamp»: the three in match 2; A leaves and two play on; B leaves and it is over ----------
  await a.klikk('[data-h="nett-ny"]');
  for (const p of [a, b, c]) await p.vent(`Rusj.nett.kamp() === 2 && Rusj.S.skjerm === "n-skriv"`, 10000);
  sp = await b.spill();
  t.sjekk((await c.nettMeg()) === 2 && sp.antall === 3 && sp.r.leder === 1 && sp.poeng.join() === "0,0,0" && sp.runder === 3, "Kamp 2 har ikke tre plasser, neste leder og vertens oppsett");
  t.sjekk((await a.js(`document.querySelector("#fl-felt-0").value`)) === "", "Feltene i kamp 2 har tekst fra forrige kamp");
  await b.bilde("ny-kamp");
  await t.forlat(a);
  for (const p of [b, c]) {
    await p.vent(`Rusj.nett.erUte(0)`, 10000).catch(() => t.feil(`${p.navn}: plassen til A ble ikke tatt ut`));
    await t.sov(300);
    t.sjekk(!(await p.finnes('#ark [data-h="nett-forlat"]')) && (await p.js("Rusj.nett.aktiv()")), `${p.navn}: kampen stoppet da A gikk, selv om to er nok`);
  }
  await t.forlat(b);
  await c.vent(`document.querySelector('#ark [data-h="nett-forlat"]')`, 8000).catch(() => t.feil("C fikk ikke beskjed om at B gikk"));
  if (t.norsk) t.sjekk(/forlot kampen/.test(await c.tekst("#ark h2")), `C: «${await c.tekst("#ark h2")}»`);
  await c.bilde("b-forlot");
  await c.klikk('#ark [data-h="nett-forlat"]');
  await c.ventSkjerm("hjem");
  t.sjekk(!(await c.js("Rusj.paNett()")), "C er fortsatt «på nett» etter «Forlat»");

  // A's own game: exactly as saved before the match on the net (only `_tid` moves).
  const utenTid = (x) => JSON.stringify({ ...JSON.parse(x), _tid: 0 });
  t.sjekk(utenTid(await a.js(`localStorage.getItem(${JSON.stringify(LAGRET)})`)) === utenTid(lagret), "Spillet A hadde lagret, ble endret av nettkampen");
  t.sjekk(await a.finnes('[data-h="fortsett"]'), "«Fortsett» mangler etter nettkampen");
  await a.klikk('[data-h="fortsett"]');
  await t.sov(400);
  t.sjekk((await a.spill()).modus === "en" && (await a.skjerm()) === "klar", "«Fortsett» ga ikke spillet fra før nettkampen");
  await a.bilde("fortsett-paa-papir");
}
