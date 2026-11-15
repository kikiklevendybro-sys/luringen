// Julekalenderen: the clock is pinned in the page (a script that runs before the page's own), so the
// test can stand on any day. Language-neutral: texts come from the page's own R.t (tr), the doors
// from RUSJ_DATA and the rules from window.RusjJulekalender.
// - 20 November: the teaser and the countdown, every door locked, «Gjør klart» (then back without
//   choosing), the .ics download (24 events at 18:00 in the edition's time zone), the paper
//   calendar with 24 QR codes and its print (one A4 page, nothing else on it).
// - 1 December: the first door asks who is playing (class mode on a big screen, else family), then
//   every part in order – something cosy, the talk card, the guess with its answer, the game with
//   its mascot and a link to it – and the ornament on the tree; today's door is reported to the
//   front page; «Vi åpnet luke 1!» shares that door's address and no names.
// - 7 December: a shared link (#luke-7) opens door 7, the host is the next name, «Bytt» changes it,
//   a reload keeps the step, door 8 is locked, door 3 can still be done.
// - 24 December: with doors 1–23 done, the big quiz (right, wrong, undo, to the end), the star,
//   the finished tree, its picture (PNG download) and its print.
// - 27 December: «Takk for i år», the tree and every door open again.
export default async function (t) {
  const pause = () => t.sov(440); // taps right after a screen change are ignored on purpose
  let skript = null;
  const settDato = async (iso) => {
    if (skript) await t.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: skript });
    const ms = Date.parse(`${iso}T12:00:00Z`);
    const kilde = `(() => { const Ekte = Date; const start = Ekte.now(); const T = ${ms};
      class Dato extends Ekte { constructor(...a) { if (a.length) super(...a); else super(T + (Ekte.now() - start)); } static now() { return T + (Ekte.now() - start); } }
      window.Date = Dato; })();`;
    skript = (await t.send("Page.addScriptToEvaluateOnNewDocument", { source: kilde })).identifier;
  };
  // A fresh load (also when only the #hash differs, which would otherwise not reload the page).
  const last = async (hash = "") => {
    await t.lastSide("about:blank");
    await t.lastSide(t.side + hash, "document.querySelector('#skjerm h1')");
    await pause();
  };
  const klikk = async (sel) => {
    await t.klikk(sel);
    await pause();
  };
  const toast = () => t.js(`document.querySelector("#toast.vis") ? document.querySelector("#toast").textContent : ""`);
  // The card's text as written (innerText would give the upper-case labels in capitals).
  const kortTekst = () => t.js(`document.querySelector(".jk-kort").textContent.replace(/\\s+/g, " ")`);
  const h1 = async () => (await t.tekst("#skjerm h1")).trim();
  const tr = (nokkel, verdier) => t.js(`Rusj.t(${JSON.stringify(nokkel)}, ${JSON.stringify(verdier || null)})`);
  const bred = await t.js("innerWidth >= 900");
  const liggende = await t.js("matchMedia('(orientation: landscape) and (max-height: 500px)').matches");
  const gruppe = bred ? "klasse" : "familie";
  // The door as the page shows it for the chosen group.
  const luke = (d) => t.js(`RusjJulekalender.lukeFor(RUSJ_DATA.luker[${d - 1}], ${JSON.stringify(gruppe)})`);
  const steg = (d) => t.js(`Array.from(RusjJulekalender.steg(RusjJulekalender.lukeFor(RUSJ_DATA.luker[${d - 1}], ${JSON.stringify(gruppe)})))`);
  const base = () => t.js(`"https://rusj.no" + Rusj.forside + ((Rusj.sprak !== "nb" && RUSJ_SPILL.slug) || "julekalenderen") + "/"`);
  const lukeUrl = async (d) => t.js(`RusjJulekalender.lukeAdresse(${JSON.stringify(await base())}, Rusj.sprak, ${d})`);
  const navnene = ["Testspiller A", "Testspiller B", "Testspiller C"];
  // Downloads: the link the page clicks is caught, and what it points to is read back.
  const fangNedlasting = () =>
    t.js(`(() => {
      window.__nedlast = [];
      window.__blob = window.__blob || {};
      if (!window.__lagUrl) {
        window.__lagUrl = URL.createObjectURL;
        URL.createObjectURL = (b) => { const u = window.__lagUrl(b); window.__blob[u] = b; return u; };
      }
      HTMLAnchorElement.prototype.click = function () { if (this.download) window.__nedlast.push({ href: this.href, navn: this.download }); };
    })()`);
  const lesNedlasting = (som) =>
    t.js(`(async () => { const n = window.__nedlast[window.__nedlast.length - 1]; if (!n) return null; const b = window.__blob[n.href]; if (!b) return { navn: n.navn, type: "", storrelse: 0, tekst: "" }; return { navn: n.navn, type: b.type, storrelse: b.size, tekst: ${som === "tekst" ? "await b.text()" : '""'} }; })()`);
  // Print: the page as paper, and how many A4 pages it gives.
  const utskrift = async (pa) => t.send("Emulation.setEmulatedMedia", { media: pa ? "print" : "" });
  const sider = async () => {
    const { data } = await t.send("Page.printToPDF", { preferCSSPageSize: true, printBackground: true });
    return (Buffer.from(data, "base64").toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
  };
  const synlig = (sel) => t.js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return !!e && getComputedStyle(e).display !== "none" && e.getBoundingClientRect().height > 0; })()`);
  const dagligMeldt = () => t.js(`(JSON.parse(localStorage.getItem("${t.nokkel("daglig")}") || "{}").julekalenderen || null)`);
  const settFerdige = (dager) =>
    t.js(`(() => { const k = "${t.nokkel("julekalenderen")}.v1"; const S = JSON.parse(localStorage.getItem(k)); for (const d of ${JSON.stringify(dager)}) S.luker[d] = { ferdig: true, steg: 0, bytt: 0, vist: false }; localStorage.setItem(k, JSON.stringify(S)); })()`);

  // ---------------- 20 November: the teaser ----------------
  await settDato("2026-11-20");
  await t.start({ navn: navnene });
  await pause();
  const status = await t.tekst(".jk-status");
  t.sjekk(status.includes(await tr("Kalenderen åpner 1. desember")) && status.includes(await tr("Om {n} dager", { n: 11 })), `Før desember: statusen sier «${status}»`);
  t.sjekk(!!(await t.finnes(".jk-teaser .jk-tre")) && (await t.antall(".jk-teaser .jk-deler li")) === 3, "Før desember: teaseren viser kos, prat og spill og et tomt tre");
  t.sjekk((await t.antall(".jk-luke")) === 24 && (await t.antall(".jk-luke.jk-last")) === 24, "Før desember skal alle 24 lukene være låst");
  const orden = await t.js(`Array.from(document.querySelectorAll(".jk-luke")).map((l) => Number(l.dataset.v))`);
  t.sjekk(orden.join() !== [...orden].sort((a, b) => a - b).join() && new Set(orden).size === 24, "Lukene står hulter til bulter, hver bare én gang");
  t.sjekk((await t.tekst("#skjerm .dokk")).includes(await tr("Skriv ut papirkalenderen")), "Før desember er papirkalenderen hovedknappen");
  await t.bilde("for-desember");
  await t.klikk('.jk-luke[data-v="1"]');
  t.sjekk((await toast()) === (await tr("Luke {n} åpner {n}. desember", { n: 1 })), `Låst luke før desember: toasten sier «${await toast()}»`);

  // A QR code scanned before its day: the calendar with the countdown, and when the door opens.
  await last("#" + (await lukeUrl(7)).split("#")[1]);
  t.sjekk(!!(await t.finnes(".skjerm-hjem .jk-teaser")) && (await toast()) === (await tr("Luke {n} åpner {n}. desember", { n: 7 })), `En QR-kode før desember: toasten sier «${await toast()}»`);

  // The reminders: an .ics file made on the phone.
  await fangNedlasting();
  await t.klikk('[data-h="paminnelse"]');
  const ics = await lesNedlasting("tekst");
  const sone = await t.js("Rusj.tidssone");
  const hendelser = ics ? ics.tekst.replace(/\r\n /g, "").split("\r\n") : [];
  const starter = hendelser.filter((l) => l.startsWith("DTSTART;"));
  t.sjekk(ics && /\.ics$/.test(ics.navn) && /text\/calendar/.test(ics.type), `Påminnelsen er ingen .ics-fil: ${JSON.stringify(ics && { navn: ics.navn, type: ics.type })}`);
  t.sjekk(hendelser.filter((l) => l === "BEGIN:VEVENT").length === 24 && starter.length === 24, `Påminnelsen har ${starter.length} hendelser, ventet 24`);
  t.sjekk(starter.every((l, i) => l === `DTSTART;TZID=${sone}:202612${String(i + 1).padStart(2, "0")}T180000`), `Påminnelsene er ikke klokka 18 i ${sone}: ${starter.slice(0, 2).join(" | ")}`);
  t.sjekk(hendelser.includes(`URL:${await lukeUrl(7)}`), "Påminnelsen for luke 7 lenker ikke til luke 7");
  t.sjekk((await toast()).length > 0, "Ingen beskjed etter at påminnelsene ble lastet ned");

  // «Gjør klart» before December: the choice is shown, then back without choosing.
  await klikk('[data-h="oppsett"]');
  t.sjekk((await h1()) === (await tr("Hvem er med?")) && (await t.antall('.jk-grupper [data-h="gruppe"]')) === 3, "«Gjør klart» viser de tre gruppene");
  t.sjekk((await t.antall("#spillerboks input[data-navn]")) >= 3, "«Gjør klart» har navnene til dagens nisse");
  await t.bilde("oppsett");
  await klikk("#tilbake, [data-h='tilbake']");
  t.sjekk(!!(await t.finnes(".skjerm-hjem")) && !(await t.tilstand()).gruppe, "Tilbake fra «Gjør klart» uten å velge");

  // The paper calendar: 24 doors, each with a QR code to that door; printed on one A4 page.
  await klikk('[data-h="utskrift"]');
  const ark = await t.js(`Array.from(document.querySelectorAll(".jk-ark-dor")).map((d) => ({ d: Number(d.dataset.d), url: d.dataset.url, qr: !!d.querySelector(".jk-ark-qr svg path") }))`);
  t.sjekk(ark.length === 24 && ark.every((a) => a.qr) && new Set(ark.map((a) => a.d)).size === 24, `Papirkalenderen har ${ark.length} luker med QR-kode`);
  const feilUrl = [];
  for (const a of ark) if (a.url !== (await lukeUrl(a.d))) feilUrl.push(`${a.d}: ${a.url}`);
  t.sjekk(!feilUrl.length, `QR-kodene peker feil: ${feilUrl.slice(0, 3).join(", ")}`);
  await t.bilde("papirkalender", true);
  await utskrift(true);
  t.sjekk((await synlig(".jk-ark")) && !(await synlig(".topp")) && !(await synlig("#skjerm .dokk")) && !(await synlig(".jk-utskrift-intro")), "Utskriften viser mer enn papirkalenderen");
  const arkSider = await sider();
  t.sjekk(arkSider === 1, `Papirkalenderen blir ${arkSider} sider, ventet én A4`);
  await utskrift(false);
  await t.js(`window.__skrevet = 0; window.print = () => { window.__skrevet++; }`);
  await t.klikk('[data-h="skriv-ut-ark"]');
  t.sjekk((await t.js("window.__skrevet")) === 1, "«Skriv ut» åpner ikke utskrift");

  // ---------------- 1 December ----------------
  await settDato("2026-12-01");
  await last();
  t.sjekk((await t.antall(".jk-luke.jk-klar")) === 1 && !!(await t.finnes('.jk-luke.jk-idag[data-v="1"]')), "1. desember: bare luke 1 kan åpnes, og den lyser");
  t.sjekk((await t.tekst("#skjerm .dokk")).includes(await tr("Åpne luke {n}", { n: 1 })), "Hovedknappen sier «Åpne luke 1»");
  if (liggende) t.sjekk(await t.friForDokk(".jk-rutenett"), "Kalenderen ligger bak dokken på en liggende mobil");
  await t.bilde("1-desember");
  // The first door asks who is playing.
  await t.klikk('.jk-luke[data-v="1"]');
  await t.vent("document.querySelector('.skjerm-oppsett')", 3000);
  await pause();
  await klikk(`[data-h="gruppe"][data-v="${gruppe}"]`);
  t.sjekk((await t.js(`document.querySelector('[data-h="gruppe"][data-v="${gruppe}"]').getAttribute("aria-pressed")`)) === "true", "Valget av gruppe vises ikke");
  await klikk('[data-h="start"]');
  await t.vent("document.querySelector('.skjerm-luke')", 3000);
  const S1 = await t.tilstand();
  t.sjekk(S1.gruppe === gruppe && S1.aktiv === 1 && S1.luker[1] && !S1.luker[1].ferdig, `Etter «Start» skal luke 1 være åpen for ${gruppe}: ${JSON.stringify({ g: S1.gruppe, a: S1.aktiv })}`);
  if (bred) t.sjekk(await t.js(`document.documentElement.classList.contains("jk-klasse") && document.querySelector(".app").getBoundingClientRect().width > 900`), "Klassemodus får ikke storskjermoppsettet");
  const L1 = await luke(1);
  const s1 = await steg(1);
  t.sjekk((await h1()) === L1.tittel, `Luke 1 har overskriften «${await h1()}», ventet «${L1.tittel}»`);
  t.sjekk((await t.antall(".jk-stegknapp")) === s1.length && s1[0] === "kos", `Luke 1 viser ${await t.antall(".jk-stegknapp")} deler, ventet ${s1.join(", ")}`);
  t.sjekk((await t.tekst(".jk-nisse")).includes(await tr("Dagens nisse")), "Dagens nisse vises ikke på luka");
  t.sjekk(await t.friForDokk(".jk-steg"), "Delene av luka ligger bak dokken");
  // Walk every part.
  for (let i = 0; i < s1.length; i++) {
    const del = s1[i];
    const kort = await kortTekst();
    if (del === "kos") t.sjekk(kort.includes(L1.kos.tittel) && (gruppe !== "familie" || kort.includes(L1.smaa)), "Kos-delen mangler tittel eller «For de minste»");
    if (del === "prat") t.sjekk(kort.includes(L1.prat.t) && kort.includes(L1.prat.f), "Julekortet til praten mangler spørsmålet eller «Spør videre»");
    if (del === "gjett") {
      t.sjekk(!(await t.finnes(".jk-svar")), "Svaret vises før det er spurt om");
      await t.bilde("luke-1-gjett");
      await klikk('[data-h="vis-svar"]');
      const svar = await t.tekst(".jk-svar");
      t.sjekk(L1.bonus.type === "nott" ? svar.includes(L1.bonus.svar) : svar.includes(L1.bonus.valg[L1.bonus.riktig]), `«Vis svaret» viser «${svar}»`);
    }
    if (del === "spill") {
      const lenke = await t.js(`document.querySelector("#skjerm .dokk a.jk-spillknapp") && document.querySelector("#skjerm .dokk a.jk-spillknapp").getAttribute("href")`);
      const ventet = await t.js(`(() => { const g = (window.RUSJ_ANDRE || []).find((x) => x.id === ${JSON.stringify(L1.spill.id)}); return g ? (g.url || "/" + g.id + "/") : null; })()`);
      t.sjekk(!!ventet && lenke === ventet + (L1.spill.hash ? "#" + L1.spill.hash : ""), `Spillet i luke 1 lenker til ${lenke}, ventet ${ventet}`);
      t.sjekk(kort.includes(L1.spill.figur) && !!(await t.finnes(".jk-figur .figur-ramme svg")), "Dagens figur mangler figuren eller replikken");
      await t.bilde("luke-1-spill");
    }
    if (i < s1.length - 1) await klikk('[data-h="neste"]');
  }
  t.sjekk(!!(await t.finnes(".jk-kort-pynt .jk-tre")) && (await t.antall(".jk-kort-pynt .jk-orn")) === 0, "Pynt-delen viser treet uten pynt før den henges opp");
  t.sjekk(!(await dagligMeldt()), "Luke 1 er meldt ferdig før pynten er hengt opp");
  await klikk('[data-h="pynt"]');
  t.sjekk((await t.antall(".jk-kort-pynt .jk-orn")) === 1 && (await t.tilstand()).luker[1].ferdig, "Pynten henger ikke på treet etter «Heng opp pynten»");
  const meldt = await dagligMeldt();
  t.sjekk(meldt && meldt.res === (await tr("Luke {n}", { n: 1 })) && meldt.vunnet === true, `Dagens luke meldes ikke som «Luke 1»: ${JSON.stringify(meldt)}`);
  await t.bilde("luke-1-pynt");
  // Sharing the door: its address, never a name.
  await t.js(`navigator.share = (d) => { window.__delt = d; return Promise.resolve(); }; navigator.canShare = () => false;`);
  await t.klikk('[data-h="del-luke"]');
  await t.sov(300);
  const delt = await t.js("window.__delt || null");
  const url1 = await lukeUrl(1);
  t.sjekk(delt && (delt.url === url1 || String(delt.text).includes(url1)), `Delingen peker ikke til luke 1: ${JSON.stringify(delt)}`);
  t.sjekk(delt && !navnene.some((n) => JSON.stringify(delt).includes(n)), "Delingen inneholder navn");
  await klikk('[data-h="hjem"]');
  t.sjekk((await t.tekst(".jk-tretall")).includes(await tr("{n} av 24", { n: 1 })) && !!(await t.finnes('.jk-luke.jk-ferdig[data-v="1"]')), "Treet på forsiden teller ikke den første pynten");

  // ---------------- 7 December: a shared link, the host, a reload ----------------
  await settDato("2026-12-07");
  const hash7 = (await lukeUrl(7)).split("#")[1];
  await last("#" + hash7);
  t.sjekk((await t.tilstand()).aktiv === 7 && !!(await t.finnes(".skjerm-luke")), `#${hash7} åpner ikke luke 7`);
  const L7 = await luke(7);
  t.sjekk((await h1()) === L7.tittel, `Luke 7 har overskriften «${await h1()}»`);
  const S7 = await t.tilstand();
  const nisse7 = (await t.tekst(".jk-nisse b")).trim();
  t.sjekk(nisse7 === navnene[(S7.nisseStart + 6) % 3], `Dagens nisse 7. desember er «${nisse7}», ventet ${navnene[(S7.nisseStart + 6) % 3]}`);
  await t.bilde("luke-7");
  await klikk('[data-h="bytt-nisse"]');
  const nisseBytt = (await t.tekst(".jk-nisse b")).trim();
  t.sjekk(nisseBytt === navnene[(S7.nisseStart + 7) % 3], `«Bytt» gir «${nisseBytt}»`);
  const s7 = await steg(7);
  const iPrat = s7.indexOf("prat");
  await klikk(`.jk-stegknapp[data-v="${iPrat}"]`);
  t.sjekk((await kortTekst()).includes(L7.prat.t), "Steg-knappen «Prat» viser ikke julekortet");
  await t.bilde("luke-7-prat");
  await last();
  t.sjekk(!!(await t.finnes(".skjerm-luke")) && (await t.tilstand()).luker[7].steg === iPrat && (await kortTekst()).includes(L7.prat.t), "Etter omlasting er luka ikke på samme del");
  await klikk(`.jk-stegknapp[data-v="${s7.length - 1}"]`);
  await klikk('[data-h="pynt"]');
  await klikk('[data-h="hjem"]');
  t.sjekk((await t.tekst("#skjerm .dokk")).includes(await tr("Se luke {n}", { n: 7 })) && (await t.tekst(".jk-status")).includes(await tr("Ny luke i morgen")), "Etter dagens luke: «Se luke 7» og «Ny luke i morgen»");
  await t.klikk('.jk-luke[data-v="8"]');
  t.sjekk((await toast()) === (await tr("Luke {n} åpner {n}. desember", { n: 8 })), "Luke 8 er ikke låst 7. desember");
  await pause();
  await klikk('.jk-luke[data-v="3"]');
  await t.vent("document.querySelector('.skjerm-luke')", 3000);
  t.sjekk((await t.tilstand()).aktiv === 3, "En tidligere luke (3) kan ikke åpnes");
  await klikk('[data-h="hjem"]');
  t.sjekk((await t.antall(".jk-trepanel .jk-orn")) === 2, "Treet på forsiden har ikke to pynt");
  if (liggende) t.sjekk(await t.friForDokk(".jk-rutenett"), "Kalenderen ligger bak dokken på en liggende mobil (7. desember)");
  if (bred) t.sjekk(await t.friForDokk(".jk-rutenett"), "Kalenderen får ikke plass over dokken på storskjermen");
  await t.bilde("hjem-7-desember", true);

  // ---------------- 24 December: the big quiz, the star, the tree ----------------
  await settDato("2026-12-24");
  await settFerdige(Array.from({ length: 23 }, (_, i) => i + 1));
  await last();
  await klikk('[data-h="dagens"]');
  await t.vent("document.querySelector('.skjerm-luke')", 3000);
  await pause();
  const s24 = await steg(24);
  t.sjekk(s24[0] === "kos" && s24[1] === "gjett", `Luke 24: quizen kommer ikke etter kosen (${s24.join(", ")})`);
  await klikk('.jk-stegknapp[data-v="1"]');
  const antallQ = await t.js("RusjJulekalender.storquiz(RUSJ_DATA.luker).length");
  t.sjekk(antallQ === 23 && (await kortTekst()).includes(await tr("{n} av {av}", { n: 1, av: 23 })), "Julaftenquizen har ikke 23 spørsmål");
  await t.bilde("luke-24-quiz");
  await klikk('[data-h="vis-svar"]');
  await t.bilde("luke-24-quiz-svar");
  await klikk('[data-h="quiz-svar"][data-v="1"]');
  await klikk('[data-h="vis-svar"]');
  await klikk('[data-h="quiz-svar"][data-v="0"]');
  await klikk('[data-h="quiz-angre"]');
  let q = (await t.tilstand()).luker[24].quiz;
  t.sjekk(q.i === 1 && q.rett.join() === "0" && q.vist, `«Angre» i quizen: ${JSON.stringify(q)}`);
  await klikk('[data-h="quiz-svar"][data-v="1"]');
  for (let i = 2; i < antallQ; i++) {
    await t.klikk('[data-h="vis-svar"]', 60);
    await t.klikk(`[data-h="quiz-svar"][data-v="${i % 4 ? 1 : 0}"]`, 60);
  }
  q = (await t.tilstand()).luker[24].quiz;
  t.sjekk(q.i === 23 && (await kortTekst()).includes(await tr("Dere klarte {n} av {av}!", { n: q.rett.length, av: 23 })), `Quizen slutter ikke med resultatet: ${JSON.stringify(q)}`);
  await t.bilde("luke-24-quiz-ferdig");
  await klikk(`.jk-stegknapp[data-v="${s24.length - 1}"]`);
  await klikk('[data-h="pynt"]');
  t.sjekk((await t.antall(".jk-kort-pynt .jk-orn")) === 24 && !!(await t.finnes(".jk-tre-ferdig")), "Treet er ikke ferdig pyntet etter luke 24");
  const merker = await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("merker")}") || "{}")`);
  t.sjekk(["luke-1", "luke-24", "luke-10", "luke-tre", "luke-nisse"].every((m) => m in merker), `Klistremerkene for kalenderen mangler: ${Object.keys(merker).join(", ")}`);
  await klikk('[data-h="tre"]');
  t.sjekk((await h1()) === (await tr("Juletreet vårt")) && (await t.antall(".jk-stortre .jk-orn")) === 24, "Juletre-siden viser ikke det ferdige treet");
  await t.bilde("tre-ferdig");
  await fangNedlasting();
  await t.klikk('[data-h="last-ned"]');
  await t.vent("window.__nedlast && window.__nedlast.length", 8000);
  const png = await lesNedlasting("bilde");
  t.sjekk(png && /\.png$/.test(png.navn) && png.type === "image/png" && png.storrelse > 20000, `Bildet av treet: ${JSON.stringify(png)}`);
  await utskrift(true);
  t.sjekk((await synlig(".jk-stortre")) && !(await synlig(".topp")) && !(await synlig("#skjerm .dokk")), "Utskriften av treet viser mer enn treet");
  const treSider = await sider();
  t.sjekk(treSider === 1, `Treet blir ${treSider} sider, ventet én A4`);
  await utskrift(false);

  // ---------------- 27 December: «Takk for i år» ----------------
  await settDato("2026-12-27");
  await last();
  t.sjekk(!!(await t.finnes(".jk-takk")) && (await t.tekst(".jk-status")).includes(await tr("God jul!")), "27. desember: ingen «Takk for i år»");
  t.sjekk((await t.antall(".jk-luke.jk-last")) === 0 && (await t.tekst(".jk-tretall")).includes(await tr("{n} av 24", { n: 24 })), "27. desember: alle lukene åpne og treet fullt");
  t.sjekk((await t.tekst("#skjerm .dokk")).includes(await tr("Se juletreet")), "27. desember: hovedknappen er ikke juletreet");
  await t.bilde("romjul", true);
  await klikk('.jk-luke[data-v="5"]');
  t.sjekk(!!(await t.finnes(".skjerm-luke")) && (await t.tilstand()).aktiv === 5, "Romjula: luke 5 kan ikke åpnes igjen");
  await klikk('[data-h="hjem"]');

  await t.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: skript });
}
