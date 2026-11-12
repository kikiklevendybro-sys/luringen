/* Vinglepetter — «Hva vil du helst?»
   A card split in two: option ☝️ (top, mint) or option ✌️ (bottom, lilac), «ELLER» on the seam.
   «Alle velger»: count down, and everyone holds up one or two fingers at the same time. One tap on
   how many chose ☝️ shows the split as an animated bar with a playful verdict; the minority may get
   a 20-second defence speech («Bytter noen side?»), and after 10 or 20 dilemmas the group gets its verdict.
   «I vinglestolen»: one player at a time chooses in secret, the others guess what it was — and
   Kåringen crowns the open book and the mystery (with two players: who knows the other best). */
(function () {
  "use strict";

  const R = window.Rusj;
  const D = window.RUSJ_DATA.dilemmaer;
  const esc = R.esc;

  // All dilemmas in one list so the deck can remember what has been shown across sessions.
  const ALLE = [];
  D.pakker.forEach((p) => p.dilemmaer.forEach(([a, b]) => ALLE.push({ p: p.id, a, b })));
  const PAKKER = D.pakker;
  const pakke = (id) => PAKKER.find((p) => p.id === id);
  // The season's pack («Jul») is listed first from 1 November to 6 January, otherwise last (as in the data).
  const iSesong = (() => {
    const d = new Date();
    const m = d.getMonth() + 1;
    return m >= 11 || (m === 1 && d.getDate() <= 6);
  })();
  const PAKKER_VIST = iSesong ? [...PAKKER.filter((p) => p.sesong), ...PAKKER.filter((p) => !p.sesong)] : PAKKER;
  const STANDARD = PAKKER.filter((p) => !p.voksen && !p.sesong).map((p) => p.id);
  const stokk = R.kortstokk("dilemmaer", ALLE.length);
  let H; // the actions, so one action can reuse another
  let opptatt = false; // a countdown or drum roll is running: ignore double taps (ghost taps: the kit)
  let trykket = null; // the number that was tapped, while the drum roll runs

  const LENGDER = [10, 20, 0]; // dilemmas in a session; 0 = no end («Fritt»)
  const TALETID = 20; // seconds for the minority's defence speech
  const MAKS_STOL = 12; // players in «I vinglestolen»

  const stor = (t) => t.charAt(0).toLocaleUpperCase("nb") + t.slice(1);
  const lengde = (t) => (t.length > 46 ? "vingle-lang" : t.length > 26 ? "vingle-mid" : "");
  const prosent = (n, t) => (t ? Math.round((n / t) * 100) : 0);
  const stemmer = (n) => R.flertall(n, "stemme", "stemmer");
  // A fixed pick for this card, so redrawing the screen never changes the text.
  const plukk = (liste, nokkel) => liste[R.hash(String(nokkel)) % liste.length];
  // A game is running until the verdict (then «Spill igjen» / «Endre oppsett» start a new one).
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const standardAntall = () => R.klamp(R.felles.navn.filter((n) => String(n || "").trim()).length || 4, 2, 20);
  // The last dilemma of a session with a length («10 dilemmaer»): then comes Kåringen.
  const erSiste = (sp) => sp.lengde > 0 && sp.nr >= sp.lengde;

  // «I vinglestolen»: everyone sits in the chair once per lap, in seat order from sp.start.
  const iStolen = (sp) => (sp.start + sp.nr - 1) % sp.antall;
  const totaltStol = (sp) => sp.antall * sp.runder;
  const runderFor = (S) => ([1, 2, 3].includes(S.oppsett.runder) ? S.oppsett.runder : R.klamp(S.antall, 2, MAKS_STOL) <= 6 ? 2 : 1);

  const PROMPTER = [
    R.t("Forsvar valget ditt!"),
    R.t("Hvem valgte annerledes? Forklar!"),
    R.t("De som valgte ✌️, forklarer først!"),
    R.t("De som valgte ☝️, forklarer først!"),
    R.t("Noen som vil bytte side?"),
    R.t("Ingen vingling – stå for valget!"),
    R.t("Hvem var raskest til å velge?"),
  ];

  // A playful one-line verdict for the split.
  function dom(a, b, nokkel) {
    const t = a + b;
    const min = Math.min(a, b);
    if (t === 1) return plukk([R.t("Én stemme – og den bestemmer!"), R.t("Bare én har stemt. Det får holde!")], nokkel);
    if (min === 0) return plukk([R.t("Enstemmig!"), R.t("Alle som én!"), R.t("Full enighet!")], nokkel);
    if (a === b) return plukk([R.t("Delt på midten!"), R.t("Dødt løp!"), R.t("Helt likt – nå må dere diskutere!")], nokkel);
    if (min === 1) return plukk([R.t("Bare én vinglepetter …"), R.t("Én mot resten – forsvar deg!"), R.t("En ensom ulv!")], nokkel);
    if (Math.abs(a - b) === 1) return plukk([R.t("Knepent!"), R.t("På hengende håret!"), R.t("Jevnt løp!")], nokkel);
    if (Math.max(a, b) / t >= 0.75) return plukk([R.t("Klart flertall!"), R.t("Ingen tvil her!")], nokkel);
    return plukk([R.t("Flertallet har talt!"), R.t("Ganske delt!")], nokkel);
  }

  // After the defence speech: how many changed sides.
  const bytteDom = (n) => (n === 0 ? R.t("Ingen lot seg rikke!") : n === 1 ? R.t("Én byttet side!") : R.t("{n} byttet side!", { n }));

  // The verdict for the whole group, from how big the majorities were on average.
  function gruppedom(logg) {
    const talte = logg.filter((l) => l.a + l.b >= 2);
    if (!talte.length) return null;
    const snitt = talte.reduce((s, l) => s + Math.max(l.a, l.b) / (l.a + l.b), 0) / talte.length;
    const felles = { prosent: Math.round(snitt * 100), antall: talte.length };
    if (snitt >= 0.85) return Object.assign(felles, { tittel: R.t("Tvillingsjeler!"), tekst: R.t("Dere er enige om nesten alt. Er dere sikre på at dere ikke er samme person?") });
    if (snitt >= 0.72) return Object.assign(felles, { tittel: R.t("Godt samkjørte!"), tekst: R.t("Stort sett enige – med noen herlige vinglepettere innimellom.") });
    if (snitt >= 0.6) return Object.assign(felles, { tittel: R.t("Passe uenige!"), tekst: R.t("Akkurat nok uenighet til at det ble gøy å diskutere.") });
    return Object.assign(felles, { tittel: R.t("Ekte vinglepettere!"), tekst: R.t("Dere er uenige om nesten alt. Lykke til med å velge pizza!") });
  }

  // The dilemmas the group was most split on and most agreed on (for the verdict and for sharing).
  function ytterpunkter(logg) {
    const talte = logg.filter((l) => l.a + l.b >= 2);
    const jevnhet = (l) => Math.abs(l.a - l.b) / (l.a + l.b);
    const sortert = talte.slice().sort((x, y) => jevnhet(x) - jevnhet(y) || y.a + y.b - (x.a + x.b));
    const splittet = sortert.length && jevnhet(sortert[0]) < 1 ? sortert[0] : null;
    const enige = sortert.length ? sortert[sortert.length - 1] : null;
    return { talte, splittet, enige: enige && enige !== splittet && (!splittet || jevnhet(enige) > jevnhet(splittet)) ? enige : null };
  }

  // «I vinglestolen»: how often each player was guessed right (a split guess counts as half), and —
  // with two players — how many times each guessed the other.
  function stolResultat(sp) {
    const sett = Array.from({ length: sp.antall }, () => ({ ganger: 0, treff: 0 }));
    const riktige = Array.from({ length: sp.antall }, () => 0);
    let treff = 0;
    let poeng = 0;
    for (const l of sp.logg) {
      const verdi = l.gjett === "delt" ? 0.5 : l.gjett === l.valg ? 1 : 0;
      sett[l.i].ganger += 1;
      sett[l.i].treff += verdi;
      poeng += verdi;
      if (verdi === 1) {
        treff += 1;
        if (sp.antall === 2) riktige[1 - l.i] += 1;
      }
    }
    const andel = sp.logg.length ? poeng / sp.logg.length : 0;
    const med = sett.map((s, i) => ({ i, ganger: s.ganger, treff: s.treff, andel: s.ganger ? s.treff / s.ganger : 0 })).filter((s) => s.ganger > 0);
    const hoyest = Math.max(0, ...med.map((s) => s.andel));
    const lavest = Math.min(1, ...med.map((s) => s.andel));
    return {
      treff,
      andel,
      med,
      apen: med.length > 1 && hoyest > lavest ? med.filter((s) => s.andel === hoyest) : [],
      mysterium: med.length > 1 && hoyest > lavest ? med.filter((s) => s.andel === lavest) : [],
      rader: riktige.map((p, i) => ({ i, poeng: p })),
    };
  }

  function stoldom(andel) {
    if (andel >= 0.8) return { tittel: R.t("Tankelesere!"), tekst: R.t("Dere kjenner hverandre ut og inn.") };
    if (andel >= 0.6) return { tittel: R.t("Godt kjent!"), tekst: R.t("Gjengen leser hverandre ganske godt.") };
    if (andel >= 0.4) return { tittel: R.t("Halvveis synske!"), tekst: R.t("Noen er åpne bøker, andre er rene gåter.") };
    return { tittel: R.t("Fulle av overraskelser!"), tekst: R.t("Her er det ingen som er lette å lese.") };
  }

  // nyttNr: the dilemma before this one was played, so this is the next one of the session
  // (a skipped dilemma is just replaced).
  function nyttKort(S, nyttNr) {
    const sp = S.spill;
    const valgt = new Set(sp.pakker);
    let i = stokk.neste((n) => valgt.has(ALLE[n].p));
    if (i < 0) i = stokk.neste();
    sp.kort = i;
    if (nyttNr) sp.nr += 1;
    if (sp.modus === "stol") Object.assign(sp, { fase: "stol", valg: null, gjett: null });
    else Object.assign(sp, { fase: "les", a: 0, b: 0, for: null });
  }

  // The split card. Top half ☝️, bottom half ✌️, «eller» stamped on the seam.
  // o: { kompakt, sveip, knapp (action name: the halves are buttons), vist ("a" | "b": that half is
  // lit and the other dimmed), vistNavn (whose choice it was) }
  function kortet(S, o = {}) {
    const sp = S.spill;
    const k = ALLE[sp.kort];
    const p = pakke(k.p);
    const total = sp.modus === "stol" ? totaltStol(sp) : sp.lengde;
    // How far the session has come: thin segments along the top edge of the card.
    const gang = total
      ? `<span class="vingle-gang" aria-hidden="true">${Array.from({ length: total }, (_, i) => `<i${i < sp.nr - 1 ? ' class="ferdig"' : i === sp.nr - 1 ? ' class="na"' : ""}></i>`).join("")}</span>`
      : "";
    const halv = (side, innhold) =>
      o.knapp
        ? `<button class="vingle-halv ${side}" data-h="${o.knapp}" data-v="${side}">${innhold}</button>`
        : `<div class="vingle-halv ${side}${o.vist ? (o.vist === side ? " valgt" : " ikke") : ""}">${innhold}${
            o.vist === side ? `<span class="vingle-valgt-merke">✓ ${esc(o.vistNavn || R.t("Valgt"))}</span>` : ""
          }</div>`;
    const valg = (merke, tekst, slutt) =>
      `<span class="vingle-valg ${lengde(tekst)}"><span class="vingle-merke" aria-hidden="true">${merke}</span><span>${esc(stor(tekst))}${slutt}</span></span>`;
    return `<div class="bunke vingle-bunke${o.kompakt ? " kompakt" : ""}">
      <article class="storkort vingle-kort${o.knapp ? " trykk" : ""}"${o.sveip ? ` data-sveip="${o.sveip}"` : ""}>
        ${gang}
        ${halv(
          "a",
          `<span class="storkort-topp"><span class="storkort-etikett">${p.ikon} ${esc(p.navn)}</span><span class="storkort-nr">${total ? esc(R.t("{n} av {alle}", { n: sp.nr, alle: total })) : `#${sp.nr}`}</span></span>
          <span class="vingle-sporsmal">${esc(R.t("Hva vil du helst …"))}</span>
          ${valg("☝️", k.a, "")}`,
        )}
        <div class="vingle-eller"><span>${esc(R.t("eller"))}</span></div>
        ${halv("b", valg("✌️", k.b, "?"))}
      </article>
    </div>`;
  }

  // What tells the options apart: drop the words both start with («at all musikken du hører, er …»);
  // the compact card right above still shows both options in full.
  function forskjell(a, b) {
    const x = a.split(" ");
    const y = b.split(" ");
    let n = 0;
    while (n < x.length - 1 && n < y.length - 1 && x[n] === y[n]) n++;
    return [stor(x.slice(n).join(" ")), stor(y.slice(n).join(" "))];
  }

  // Scroll so that what is under the dock comes into view (only when the page is taller than the screen).
  function visBunn() {
    const y = document.documentElement.scrollHeight - window.innerHeight;
    if (y > 0) window.scrollTo({ top: y, behavior: R.rolig() ? "auto" : "smooth" });
  }

  // One tap counts the votes: how many chose ☝️ (0 … everyone)? The rest chose ✌️.
  function tallknapper(sp, valgt) {
    const n = sp.antall;
    const merket = opptatt && trykket != null ? trykket : valgt;
    return `<div class="vingle-tall${n > 5 ? " mange" : ""}" role="group" aria-label="${esc(R.t("Hvor mange valgte én finger?"))}" style="--kol: ${Math.min(n + 1, 6)}">${Array.from(
      { length: n + 1 },
      (_, i) => `<button data-h="tell" data-v="${i}" aria-pressed="${merket === i}" aria-label="${esc(R.t("{a} valgte én finger, {b} valgte to", { a: i, b: n - i }))}"${opptatt ? " disabled" : ""}>${i}</button>`,
    ).join("")}</div>`;
  }

  function fordeling(S) {
    const sp = S.spill;
    const { a, b } = sp;
    const t = a + b;
    const pa = prosent(a, t);
    const pb = 100 - pa;
    // After a defence speech the bar moves from where it was.
    const fra = sp.for ? prosent(sp.for.a, sp.for.a + sp.for.b) : 50;
    const del = (side, p, f) =>
      p > 0 ? `<span class="vingle-del ${side}${p < 20 ? " smal" : ""}" style="--andel: ${p}%; --fra: ${f}%">${p >= 20 ? `<b>${p} %</b>` : ""}</span>` : "";
    const tekst = sp.for ? bytteDom(Math.abs(a - sp.for.a)) : dom(a, b, sp.kort);
    return `
      <div class="vingle-fordeling" role="img" aria-label="${esc(R.t("{a} for ☝️ ({pa} prosent) og {b} for ✌️ ({pb} prosent)", { a: stemmer(a), pa, b: stemmer(b), pb }))}">
        <div class="vingle-stolpe">${del("a", pa, fra)}${del("b", pb, 100 - fra)}</div>
        <div class="vingle-stemmer" aria-hidden="true"><span>☝️ ${stemmer(a)}</span><span>${stemmer(b)} ✌️</span></div>
      </div>
      <div class="vingle-dom"><span class="stempel ${a > b ? "aksent" : b > a ? "vingle-b" : "lampe"}">${esc(tekst)}</span></div>`;
  }

  // One dilemma from the log, with the votes, for the verdict screen.
  function loggBoks(etikett, l) {
    const k = ALLE[l.k];
    if (!k) return "";
    const linje = (merke, tekst, n, vant) =>
      `<li class="${vant ? "vant" : ""}"><span aria-hidden="true">${merke}</span><span>${esc(stor(tekst))}</span><b>${n}</b></li>`;
    return `<div class="papirboks vingle-boks">
      <p class="etikett">${esc(etikett)}</p>
      <ul class="${l.a === l.b ? "likt" : ""}">${linje("☝️", k.a, l.a, l.a > l.b)}${linje("✌️", k.b, l.b, l.b > l.a)}</ul>
    </div>`;
  }

  // ---------- The defence speech (20 s for the minority) ----------

  const taleklokke = () => R.timer("vingle-klokke");
  function stoppTale() {
    const t = taleklokke();
    if (t) t.stopp();
  }
  function tilBytte(S) {
    stoppTale();
    if (!pagar(S) || S.spill.fase !== "tale") return;
    S.spill.fase = "bytte";
    R.vis();
    R.si(R.t("Bytter noen side?"));
    visBunn();
  }
  function startTale() {
    stoppTale();
    new R.Timer({ id: "vingle-klokke", sekunder: TALETID, visning: "sek", vedSlutt: () => tilBytte(R.S) }).start();
  }

  // ---------- The end ----------

  function tilKaaring(S) {
    const sp = S.spill;
    if (!sp || sp.ferdig) return;
    stoppTale();
    sp.ferdig = true;
    if (sp.modus === "stol") {
      const r = stolResultat(sp);
      R.statistikk("ferdig", { modus: "stol", spillere: sp.antall, runder: sp.logg.length, treff: r.treff });
      // Two players: who knows the other best is a real ranking, so it counts for the evening.
      if (sp.antall === 2) R.kveld.registrer(r.rader);
    } else {
      const g = gruppedom(sp.logg);
      R.statistikk("ferdig", { modus: "alle", dilemmaer: sp.logg.length, enige: g ? g.prosent : 0, imal: erSiste(sp) });
    }
    R.slippVaken();
    R.gaTil("slutt");
  }

  function delTekst(sp) {
    if (sp.modus === "stol") {
      const r = stolResultat(sp);
      const navn = (liste) => R.ramsOpp(liste.map((s) => R.navn(s.i)));
      if (sp.antall === 2) {
        const [x, y] = r.rader;
        return R.t("{spill} – hvor godt kjenner vi hverandre? {navn1} gjettet riktig {x} av {xav} ganger, {navn2} {y} av {yav}.", { spill: R.app.navn, navn1: R.navn(0), x: x.poeng, xav: r.med.find((s) => s.i === 1) ? r.med.find((s) => s.i === 1).ganger : 0, navn2: R.navn(1), y: y.poeng, yav: r.med.find((s) => s.i === 0) ? r.med.find((s) => s.i === 0).ganger : 0 });
      }
      const deler = [R.t("I vinglestolen: {tittel} Gjengen gjettet riktig {n} av {alle} ganger.", { tittel: stoldom(r.andel).tittel, n: r.treff, alle: sp.logg.length })];
      if (r.apen.length) deler.push(R.t("Åpen bok 📖: {navn}.", { navn: navn(r.apen) }));
      if (r.mysterium.length) deler.push(R.t("Mysteriet 🕵️: {navn}.", { navn: navn(r.mysterium) }));
      return `${R.app.navn} – ${deler.join(" ")}`;
    }
    const g = gruppedom(sp.logg);
    const { splittet } = ytterpunkter(sp.logg);
    const k = splittet && ALLE[splittet.k];
    return R.t("{spill} – dommen over gjengen: {tittel} {prosent} % enige på {antall}.", { spill: R.app.navn, tittel: g.tittel, prosent: g.prosent, antall: R.flertall(g.antall, "dilemma", "dilemmaer") }) + (k ? " " + R.t("Mest uenige om: «{a} eller {b}?»", { a: stor(k.a), b: k.b }) : "");
  }

  // ---------- Screens of the two modes ----------

  function visAlle(S) {
    const sp = S.spill;
    const k = ALLE[sp.kort];
    const avslutt = R.ui.lenke(R.t("Avslutt"), "avslutt");
    const vh = (medId) => `<h1 class="vh"${medId ? ' id="skjerm-tittel"' : ""}>${esc(R.t("Hva vil du helst: {a}, eller {b}?", { a: k.a, b: k.b }))}</h1>`;
    const siste = erSiste(sp);
    const videre = siste ? R.ui.knapp(R.t("Til kåringen"), "til-kaaring") : R.ui.knapp(R.t("Neste dilemma"), "neste");
    if (sp.fase === "tell" || sp.fase === "bytte") {
      const bytte = sp.fase === "bytte";
      return `
        ${vh(false)}
        ${kortet(S, { kompakt: true })}
        <section class="seksjon vingle-telling">
          <div class="seksjon-hode"><h2 id="skjerm-tittel">${esc(bytte ? R.t("Bytter noen side?") : R.t("Hvor mange valgte ☝️?"))}</h2><span class="tall">${esc(R.t("av {n}", { n: sp.antall }))}</span></div>
          ${tallknapper(sp, bytte ? sp.for.a : null)}
          <p class="hjelp vingle-tall-hjelp">${esc(bytte ? R.t("Hvor mange velger ☝️ nå? Før var det {n}.", { n: sp.for.a }) : R.t("Resten valgte ✌️. Ett trykk, så kommer resultatet."))}</p>
        </section>
        ${R.ui.dokk(
          bytte ? R.ui.knapp(R.t("Ingen bytter"), "tell", { v: sp.for.a, av: opptatt }) : "",
          R.ui.lenkerad(bytte ? "" : R.ui.lenke(R.t("Hopp over tellingen"), "neste"), R.ui.lenke(R.t("Er dere ikke {n}?", { n: sp.antall }), "antall-ark"), avslutt),
        )}`;
    }
    if (sp.fase === "tale") {
      const [ta, tb] = forskjell(k.a, k.b);
      const a = sp.a < sp.b;
      return `
        ${vh(false)}
        ${kortet(S, { kompakt: true })}
        <section class="seksjon vingle-tale">
          <h2 id="skjerm-tittel">${esc(R.t("Mindretallet har ordet!"))}</h2>
          <p class="vingle-tale-hvem"><span aria-hidden="true">${a ? "☝️" : "✌️"}</span> ${esc(a ? ta : tb)}</p>
          ${R.ui.timer({ id: "vingle-klokke", sekunder: TALETID, alene: true, visning: "sek" })}
        </section>
        ${R.ui.dokk(R.ui.knapp(R.t("Ferdig snakket"), "tale-ferdig"), R.ui.lenkerad(avslutt))}`;
    }
    if (sp.fase === "svar") {
      const kanForsvare = !sp.for && Math.min(sp.a, sp.b) >= 1 && sp.a !== sp.b;
      return `
        ${vh(false)}
        ${kortet(S, { kompakt: true, sveip: siste ? null : "neste" })}
        <section class="seksjon vingle-svar">
          <h2 class="vh" id="skjerm-tittel">${esc(R.t("Resultatet"))}</h2>
          ${fordeling(S)}
          ${kanForsvare ? `<div class="vingle-forsvar">${R.ui.knapp2(R.t("Forsvarstale – {n} s", { n: TALETID }), "forsvar", { variant: "liten" })}</div>` : ""}
        </section>
        ${R.ui.dokk(videre, R.ui.lenkerad(R.ui.lenke(R.t("Endre tallet"), "endre-tall"), avslutt))}`;
    }
    if (sp.fase === "valgt") {
      return `
        ${vh(true)}
        ${kortet(S, { sveip: "neste" })}
        <p class="vingle-prompt"><span aria-hidden="true">💬</span> ${esc(plukk(PROMPTER, sp.kort * 7 + sp.nr))}</p>
        ${R.ui.dokk(R.ui.knapp(R.t("Neste dilemma"), "neste"), R.ui.lenkerad(avslutt))}`;
    }
    return `
      ${vh(true)}
      ${kortet(S, { sveip: "neste" })}
      <p class="vingle-hint">${esc(R.t("På «VELG!» holder alle opp {en} eller {to} fingrer")).replace("{en}", `<span class="vingle-hint-merke">☝️ ${esc(R.t("én"))}</span>`).replace("{to}", `<span class="vingle-hint-merke">✌️ ${esc(R.t("to"))}</span>`)}</p>
      ${R.ui.dokk(R.ui.knapp(R.t("3 · 2 · 1 – Velg!"), "velg", { variant: "stor" }), R.ui.lenkerad(R.ui.lenke(R.t("Hopp over"), "neste"), avslutt))}`;
  }

  function visStol(S) {
    const sp = S.spill;
    const i = iStolen(sp);
    const to = sp.antall === 2;
    const annen = (i + 1) % sp.antall; // the one who guesses when two play
    const navn = esc(R.navn(i));
    const avslutt = R.ui.lenke(R.t("Avslutt"), "avslutt");
    const hode = (hvem, etikett, valgt) => `
      <div class="vingle-stol">
        ${R.avatar(hvem, "mid")}
        <div><p class="etikett">${esc(etikett)}</p><h1 id="skjerm-tittel">${esc(R.navn(hvem))}</h1></div>
        ${valgt ? `<span class="vingle-valgt">${esc(R.t("Valgt ✓"))}</span>` : ""}
      </div>`;
    if (sp.fase === "stol") {
      return `
        ${hode(i, R.t("I vinglestolen"))}
        ${kortet(S, { knapp: "stol-velg" })}
        <p class="vingle-hint">${esc(R.t("Trykk på det du ville valgt – {hemmelig}. De andre ser bort.")).replace("{hemmelig}", `<b>${esc(R.t("i hemmelighet"))}</b>`)}</p>
        ${R.ui.dokk(R.ui.lenkerad(R.ui.lenke(R.t("Bytt dilemma"), "bytt"), avslutt))}`;
    }
    if (sp.fase === "gjett") {
      return `
        ${hode(i, R.t("I vinglestolen"), true)}
        ${kortet(S)}
        <p class="vingle-hint">${esc(R.t("Hva tror dere {navn} valgte? På «GJETT!» holder alle andre opp {en} eller {to} fingrer")).replace("{en}", `<span class="vingle-hint-merke">☝️ ${esc(R.t("én"))}</span>`).replace("{to}", `<span class="vingle-hint-merke">✌️ ${esc(R.t("to"))}</span>`).replace("{navn}", navn)}</p>
        ${R.ui.dokk(R.ui.knapp(R.t("3 · 2 · 1 – Gjett!"), "gjett", { variant: "stor" }), R.ui.lenkerad(avslutt))}`;
    }
    if (sp.fase === "flertall") {
      // An even number of guessers can split down the middle.
      const kanDeles = !to && (sp.antall - 1) % 2 === 0;
      return `
        ${to ? hode(annen, R.t("Din tur til å gjette")) : hode(i, R.t("I vinglestolen"), true)}
        ${kortet(S, { knapp: "flertall" })}
        <p class="vingle-hint">${esc(to ? R.t("Hva tror du {navn} valgte? Trykk på det.", { navn: R.navn(i) }) : R.t("Hva gjettet flertallet? Trykk på det."))}</p>
        ${R.ui.dokk(kanDeles ? R.ui.knapp2(R.t("Like mange på hver"), "flertall", { v: "delt" }) : "", R.ui.lenkerad(avslutt))}`;
    }
    const delt = sp.gjett === "delt";
    const traff = sp.gjett === sp.valg;
    const stempel = delt
      ? ["vingle-b", R.t("Delt gjeng!")]
      : traff
        ? ["aksent", to ? R.t("{navn} traff!", { navn: R.navn(annen) }) : R.t("Gjengen traff!")]
        : ["lampe", to ? R.t("{navn} lurte {annen}!", { navn: R.navn(i), annen: R.navn(annen) }) : R.t("{navn} lurte dere!", { navn: R.navn(i) })];
    const videre = sp.nr >= totaltStol(sp) ? R.ui.knapp(R.t("Til kåringen"), "til-kaaring") : R.ui.knapp(R.t("Neste: {navn} i stolen", { navn: R.navn(annen) }), "neste-stol");
    return `
      ${hode(i, R.t("I vinglestolen"))}
      ${kortet(S, { vist: sp.valg, vistNavn: R.navn(i), kompakt: true })}
      <div class="vingle-dom"><span class="stempel ${stempel[0]}">${esc(stempel[1])}</span></div>
      ${R.ui.dokk(videre, R.ui.lenkerad(R.ui.lenke(R.t("Endre"), "endre-gjett"), avslutt))}`;
  }

  function sluttAlle(S) {
    const sp = S.spill;
    const logg = sp.logg;
    const g = gruppedom(logg);
    const { talte, splittet, enige } = ytterpunkter(logg);
    const enstemmige = talte.filter((l) => Math.min(l.a, l.b) === 0).length;
    const delte = talte.filter((l) => l.a === l.b).length;
    return `
      ${R.ui.banner({
        klasse: "aksent",
        etikett: R.t("Dommen over gjengen"),
        stemning: g ? "jubel" : "",
        tittel: g ? g.tittel : R.t("Takk for nå!"),
        tekst: g ? g.tekst : R.t("Tell stemmene fra flere spillere, så får dere en dom over gjengen."),
      })}
      ${R.ui.merker([
        [String(logg.length), logg.length === 1 ? R.t("dilemma") : R.t("dilemmaer")],
        [String(enstemmige), enstemmige === 1 ? R.t("enstemmig") : R.t("enstemmige")],
        [String(delte), R.t("delt på midten")],
      ])}
      ${splittet ? loggBoks(R.t("Mest uenige"), splittet) : ""}
      ${enige ? loggBoks(R.t("Mest enige"), enige) : ""}
      ${g ? R.ui.knapp2(R.t("Del dommen"), "del") : ""}
      ${R.ui.flereSpill({ antall: sp.antall || logg.reduce((m, l) => Math.max(m, l.a + l.b), 0) || undefined })}`;
  }

  function sluttStol(S) {
    const sp = S.spill;
    const r = stolResultat(sp);
    const navn = (liste) => R.ramsOpp(liste.map((s) => R.navn(s.i)));
    const av = (s) => R.t("{n} av {alle}", { n: Number.isInteger(s.treff) ? s.treff : R.tall(s.treff), alle: s.ganger });
    if (sp.antall === 2) {
      const [x, y] = r.rader;
      const ganger = (i) => (r.med.find((s) => s.i === i) || { ganger: 0 }).ganger;
      const vinner = x.poeng === y.poeng ? null : x.poeng > y.poeng ? 0 : 1;
      return `
        ${R.ui.banner({
          klasse: "aksent",
          etikett: R.t("Hvem kjenner hvem best?"),
          stemning: x.poeng + y.poeng > 0 ? "jubel" : "",
          tittel: vinner == null ? R.t("Like godt kjent!") : R.t("{navn} vinner!", { navn: R.navn(vinner) }),
          tekst: R.t("{navn1} gjettet riktig {x} av {xav} ganger, {navn2} {y} av {yav}.", { navn1: R.navn(0), x: x.poeng, xav: ganger(1), navn2: R.navn(1), y: y.poeng, yav: ganger(0) }),
        })}
        ${R.ui.pall(r.rader, { enhet: R.t("riktige") })}
        ${R.ui.poengliste(r.rader)}
        ${R.ui.knapp2(R.t("Del kåringen"), "del")}
        ${R.ui.flereSpill({ antall: 2 })}`;
    }
    const d = stoldom(r.andel);
    const pris = (ikon, tittel, hvem, tekst) => `<div class="papirboks vingle-boks vingle-pris">
        <p class="etikett">${esc(tittel)} <span aria-hidden="true">${ikon}</span></p>
        <p class="vingle-pris-navn">${esc(navn(hvem))}</p>
        <p class="vingle-pris-tekst">${esc(tekst)}</p>
      </div>`;
    return `
      ${R.ui.banner({ klasse: "aksent", etikett: R.t("I vinglestolen"), stemning: r.andel >= 0.4 ? "jubel" : "", tittel: d.tittel, tekst: `${d.tekst} ${R.t("Gjengen gjettet riktig {n} av {alle} ganger.", { n: r.treff, alle: sp.logg.length })}` })}
      ${r.apen.length ? pris("📖", R.t("Åpen bok"), r.apen, R.t("Lettest å lese: Gjengen traff {av}.", { av: av(r.apen[0]) })) : ""}
      ${r.mysterium.length ? pris("🕵️", R.t("Mysteriet"), r.mysterium, R.t("Vanskeligst å lese: Gjengen traff {av}.", { av: av(r.mysterium[0]) })) : ""}
      ${!r.apen.length && r.med.length > 1 ? pris("⚖️", R.t("Like lette å lese"), r.med, R.t("Gjengen traff {av} på hver av dere.", { av: av(r.med[0]) })) : ""}
      <section class="seksjon">
        <h2>${esc(R.t("Så ofte traff gjengen"))}</h2>
        <ul class="vingle-liste">${r.med
          .slice()
          .sort((a, b) => b.andel - a.andel || a.i - b.i)
          .map((s) => `<li>${R.avatar(s.i)}<span class="navn">${esc(R.navn(s.i))}</span><b>${esc(av(s))}</b></li>`)
          .join("")}</ul>
      </section>
      ${R.ui.knapp2(R.t("Del kåringen"), "del")}
      ${R.ui.flereSpill({ antall: sp.antall })}`;
  }

  R.start({
    id: "vinglepetter",
    versjon: 1,
    pagar,

    tilstand: () => ({
      antall: standardAntall(), // «Hvor mange er dere?» — voters in «Alle velger», players in the chair mode
      oppsett: { modus: "alle", pakker: STANDARD.slice(), telle: true, lengde: 10, runder: 0 },
      nesteStart: 0, // who sits in the chair first: moves one seat for every game
      spill: null,
    }),

    // Drop saved settings or games that no longer fit the content. No new `versjon` for the chair
    // mode, the one-tap count and the session length: saved games from before get the new fields here.
    lastet(S) {
      const o = (S.oppsett = Object.assign({ modus: "alle", pakker: [], telle: true, lengde: 10, runder: 0 }, S.oppsett));
      o.modus = o.modus === "stol" ? "stol" : "alle";
      o.pakker = (Array.isArray(o.pakker) ? o.pakker : []).filter((id) => pakke(id));
      if (!o.pakker.length) o.pakker = STANDARD.slice();
      o.telle = o.telle !== false;
      o.lengde = LENGDER.includes(o.lengde) ? o.lengde : 10;
      o.runder = [1, 2, 3].includes(o.runder) ? o.runder : 0;
      S.antall = R.klamp(Math.round(Number(S.antall)) || standardAntall(), 2, o.modus === "stol" ? MAKS_STOL : 20);
      S.nesteStart = Number.isInteger(S.nesteStart) && S.nesteStart >= 0 ? S.nesteStart : 0;
      const sp = S.spill;
      if (sp) {
        const side = (v) => v === "a" || v === "b";
        let ok = !!ALLE[sp.kort] && Array.isArray(sp.pakker) && Array.isArray(sp.logg) && Number.isInteger(sp.nr) && sp.nr >= 1;
        if (ok && sp.modus === "stol") {
          ok =
            Number.isInteger(sp.antall) && sp.antall >= 2 && sp.antall <= MAKS_STOL && [1, 2, 3].includes(sp.runder) &&
            Number.isInteger(sp.start) && sp.start >= 0 && sp.start < sp.antall && sp.nr <= sp.antall * sp.runder &&
            ["stol", "gjett", "flertall", "avslort"].includes(sp.fase);
          if (ok) {
            sp.logg = sp.logg.filter((l) => l && ALLE[l.k] && Number.isInteger(l.i) && l.i >= 0 && l.i < sp.antall && side(l.valg) && (side(l.gjett) || l.gjett === "delt"));
            if (sp.fase !== "stol" && !side(sp.valg)) sp.fase = "stol";
            if (sp.fase === "avslort" && !(side(sp.gjett) || sp.gjett === "delt")) sp.fase = "flertall";
            if (sp.fase === "gjett" && sp.antall === 2) sp.fase = "flertall";
            if (sp.fase === "stol") Object.assign(sp, { valg: null, gjett: null });
          }
        } else if (ok) {
          sp.modus = "alle";
          ok = ["les", "valgt", "tell", "svar", "tale", "bytte"].includes(sp.fase);
          if (ok) {
            sp.telle = sp.telle !== false;
            sp.antall = R.klamp(Math.round(Number(sp.antall)) || S.antall, 2, 20);
            sp.lengde = sp.telle && LENGDER.includes(sp.lengde) ? sp.lengde : 0;
            sp.a = Math.max(0, Math.round(Number(sp.a)) || 0);
            sp.b = Math.max(0, Math.round(Number(sp.b)) || 0);
            sp.logg = sp.logg.filter((l) => l && ALLE[l.k] && Number.isFinite(l.a) && Number.isFinite(l.b) && l.a >= 0 && l.b >= 0);
            sp.for = sp.for && Number.isFinite(sp.for.a) && Number.isFinite(sp.for.b) ? { a: sp.for.a, b: sp.for.b } : null;
            if (!sp.telle && sp.fase !== "les") sp.fase = "valgt";
            if (["svar", "tale", "bytte"].includes(sp.fase) && !sp.logg.length) sp.fase = "tell";
            if (["tale", "bytte"].includes(sp.fase) && !sp.for) sp.fase = "svar";
            if (["les", "valgt", "tell"].includes(sp.fase)) sp.for = null;
          }
        }
        if (!ok) S.spill = null;
        else sp.ferdig = !!sp.ferdig;
      }
      const spill = S.spill;
      if (!spill && ["kort", "slutt"].includes(S.skjerm)) S.skjerm = "hjem";
      if (spill && spill.ferdig && S.skjerm === "kort") S.skjerm = "hjem";
      if (spill && !spill.ferdig && S.skjerm === "slutt") S.skjerm = "kort";
    },

    // rusj.no/vinglepetter/#jul: straight to «Gjør klart» with only the Christmas pack chosen
    // (a running game is left alone).
    vedHash(S, hash) {
      const id = String(hash || "").toLowerCase();
      const p = pakke(id);
      if (!p || !p.sesong || pagar(S)) return null;
      S.oppsett.pakker = [id];
      return "oppsett";
    },

    regler: {
      intro: R.t("To valg – begge fristende, eller begge forferdelige. Alle må velge ett. Ingen vingling!"),
      steg: [
        [R.t("Les begge valgene"), R.t("Én leser høyt: «Hva vil du helst … eller …?»")],
        [R.t("3 · 2 · 1 – Velg!"), R.t("Trykk på knappen. På «VELG!» holder alle opp én finger ☝️ eller to fingrer ✌️ – samtidig.")],
        [R.t("Se hvem som er enige"), R.t("Trykk på hvor mange som valgte ☝️, så viser mobilen fordelingen. Mindretallet får forsvare seg!")],
      ],
      tips: [
        R.t("Det finnes ingen riktige svar – bare gode begrunnelser."),
        R.t("I vinglestolen: Én velger i hemmelighet, og resten gjetter hva det ble. Hvem er en åpen bok?"),
        R.t("Ujevnt resultat? Gi mindretallet en forsvarstale på 20 sekunder – kanskje noen bytter side."),
        R.t("Skru av «Tell stemmer» hvis dere bare vil diskutere."),
        R.t("Sveip kortet til siden for et nytt dilemma."),
        R.t("Festpakken er for voksne og er ikke med før dere velger den."),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis: (S) =>
          R.ui.spillhjem({
            slagordHtml: `${esc(R.t("To valg. Begge fristende."))}<br><em>${esc(R.t("Du må velge ett!"))}</em>`,
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: pagar(S) ? (S.spill.modus === "stol" ? R.t("Fortsett · runde {nr}", { nr: S.spill.nr }) : R.t("Fortsett · dilemma {nr}", { nr: S.spill.nr })) : "",
              ekstraHtml: R.ui.lenke(R.t("Slik spiller du"), "regler"),
            }),
            merker: [
              ["2–20", R.t("spillere")],
              [String(ALLE.length), R.t("dilemmaer")],
              ["0", R.t("reklame")],
            ],
          }),
        inn: () => R.slippVaken(),
      },

      oppsett: {
        tittel: R.t("Nytt spill"),
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          const stol = o.modus === "stol";
          const antall = PAKKER.filter((p) => o.pakker.includes(p.id)).reduce((s, p) => s + p.dilemmaer.length, 0);
          const n = R.klamp(S.antall, 2, stol ? MAKS_STOL : 20);
          const runder = runderFor(S);
          return `
          <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
          <section class="seksjon">
            <h2>${esc(R.t("Hvordan vil dere spille?"))}</h2>
            ${R.ui.fliser(
              "modus",
              [
                { v: "alle", tittel: R.t("Alle velger"), tekst: R.t("Alle stemmer samtidig. Er dere enige?"), ikon: "✌️" },
                { v: "stol", tittel: R.t("I vinglestolen"), tekst: R.t("Én velger i hemmelighet. Resten gjetter."), ikon: "🪑" },
              ],
              o.modus,
            )}
          </section>
          <section class="seksjon">
            <div class="seksjon-hode"><h2>${esc(R.t("Velg pakker"))}</h2><span class="tall">${esc(R.t("{n} dilemmaer", { n: antall }))}</span></div>
            ${R.ui.fliser(
              "pakke",
              PAKKER_VIST.map((p) => ({ v: p.id, tittel: p.navn, tekst: `${p.tekst} · ${p.dilemmaer.length}`, ikon: p.ikon })),
              o.pakker,
            )}
          </section>
          ${
            stol
              ? `${R.ui.spillere({ min: 2, max: MAKS_STOL, hjelp: R.t("Mobilen går på rundgang, og alle sitter i vinglestolen etter tur.") })}
          <section class="seksjon">
            <h2>${esc(R.t("Hvor mange runder?"))}</h2>
            ${R.ui.seg("runder", [[1, R.t("1 runde")], [2, R.t("2 runder")], [3, R.t("3 runder")]], runder, { etikett: R.t("Runder i vinglestolen") })}
            <p class="hjelp">${esc(R.t("Alle sitter i stolen én gang per runde: {n} dilemmaer i alt.", { n: n * runder }))}</p>
          </section>`
              : `${R.ui.bryter("telle", o.telle, R.t("Tell stemmer"), R.t("Se hvor delt dere er på hvert dilemma – og få dommen over gjengen til slutt."))}
          ${
            o.telle
              ? `<section class="seksjon">
            <h2>${esc(R.t("Hvor mange er dere?"))}</h2>
            ${R.ui.teller("antall", n, 2, 20, { id: "vingle-antall", enhet: R.t("spillere"), minus: R.t("Færre spillere"), pluss: R.t("Flere spillere") })}
            <p class="hjelp">${esc(R.t("Da holder det å telle den ene siden."))}</p>
          </section>
          <section class="seksjon">
            <h2>${esc(R.t("Hvor mange dilemmaer?"))}</h2>
            ${R.ui.seg("lengde", [[10, "10"], [20, "20"], [0, R.t("Fritt")]], o.lengde, { etikett: R.t("Hvor mange dilemmaer") })}
            <p class="hjelp">${esc(o.lengde ? R.t("Etter {n} dilemmaer kommer dommen over gjengen.", { n: o.lengde }) : R.t("Spill så lenge dere vil. «Avslutt» gir dommen over gjengen."))}</p>
          </section>`
              : ""
          }`
          }
          ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start", { av: !o.pakker.length }))}`;
        },
      },

      kort: {
        tittel: (S) => {
          const sp = S.spill;
          if (sp.modus === "stol") return R.t("Runde {nr} av {alle}", { nr: sp.nr, alle: totaltStol(sp) });
          return sp.lengde ? R.t("Dilemma {nr} av {alle}", { nr: sp.nr, alle: sp.lengde }) : R.t("Dilemma {nr}", { nr: sp.nr });
        },
        tilbake: "hjem",
        vis: (S) => (S.spill.modus === "stol" ? visStol(S) : visAlle(S)),
        inn(S) {
          R.holdVaken();
          if (S.spill.fase === "tale") startTale();
        },
      },

      // Final: back leads home, and the game is no longer «in progress».
      slutt: {
        tittel: R.t("Kåringen"),
        tilbake: "hjem",
        vis: (S) => `
          ${S.spill.modus === "stol" ? sluttStol(S) : sluttAlle(S)}
          ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen"), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "nytt"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`,
        inn(S) {
          if (S.spill && S.spill.logg.length) {
            R.lyd.fanfare();
            R.konfetti(["--mynte", "--lilla", "--lampe", "--rosa"]);
          } else R.lyd.pling();
        },
      },
    },

    handlinger: (H = {
      async nytt(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(pagar(S))) || !fortsatt()) return;
        if (pagar(S)) S.spill = null;
        R.gaTil("oppsett");
      },
      fortsett(el, e, S) {
        if (pagar(S)) R.gaTil("kort");
      },
      modus(el, e, S) {
        S.oppsett.modus = el.dataset.v === "stol" ? "stol" : "alle";
        if (S.oppsett.modus === "stol") S.antall = R.klamp(S.antall, 2, MAKS_STOL);
        R.vis();
      },
      pakke(el, e, S) {
        const id = el.dataset.v;
        const liste = S.oppsett.pakker;
        S.oppsett.pakker = liste.includes(id) ? liste.filter((x) => x !== id) : [...liste, id];
        R.vis();
      },
      telle(el, e, S) {
        S.oppsett.telle = !S.oppsett.telle;
        R.vis();
      },
      antall(el, e, S) {
        S.antall = R.klamp((Number(S.antall) || 4) + Number(el.dataset.v), 2, 20);
        R.vis();
      },
      lengde(el, e, S) {
        const n = Number(el.dataset.v);
        if (LENGDER.includes(n)) S.oppsett.lengde = n;
        R.vis();
      },
      runder(el, e, S) {
        const n = Number(el.dataset.v);
        if ([1, 2, 3].includes(n)) S.oppsett.runder = n;
        R.vis();
      },
      start(el, e, S) {
        const o = S.oppsett;
        if (!o.pakker.length) return;
        if (o.modus === "stol") {
          const n = R.klamp(S.antall, 2, MAKS_STOL);
          // The first in the chair moves one seat for every game (the first game: player 1).
          const start = S.nesteStart % n;
          S.nesteStart = start + 1;
          S.spill = { modus: "stol", pakker: o.pakker.slice(), antall: n, runder: runderFor(S), start, nr: 0, kort: null, fase: "stol", valg: null, gjett: null, logg: [], ferdig: false };
        } else {
          const n = R.klamp(S.antall, 2, 20);
          S.spill = { modus: "alle", pakker: o.pakker.slice(), telle: o.telle, antall: n, lengde: o.telle ? o.lengde : 0, nr: 0, kort: null, fase: "les", a: 0, b: 0, for: null, logg: [], ferdig: false };
        }
        nyttKort(S, true);
        const sp = S.spill;
        R.statistikk("start", { modus: sp.modus, spillere: sp.antall, lengde: sp.modus === "stol" ? totaltStol(sp) : sp.lengde, pakker: sp.pakker.length, telle: sp.modus === "stol" ? true : sp.telle, jul: sp.pakker.includes("jul") });
        R.gaTil("kort");
      },

      // ----- «Alle velger» -----

      // Next dilemma: from the card, after the result, or by swiping the card. A dilemma that was
      // played counts towards the length of the session; a skipped one is just replaced.
      async neste(el, e, S) {
        if (opptatt || !pagar(S) || S.spill.modus !== "alle") return;
        const sp = S.spill;
        const spilt = sp.fase !== "les";
        if (spilt && erSiste(sp)) return tilKaaring(S);
        const fortsatt = R.vakt();
        stoppTale();
        if (!(el && el.classList && el.classList.contains("storkort"))) await R.kastKort(-1);
        if (!fortsatt()) return;
        nyttKort(S, spilt || !sp.lengde);
        R.vis();
        window.scrollTo(0, 0);
        const k = ALLE[sp.kort];
        R.si(`${R.t("Dilemma {nr}.", { nr: sp.nr })} ${R.t("Hva vil du helst: {a}, eller {b}?", { a: k.a, b: k.b })}`);
      },
      async velg(el, e, S) {
        if (opptatt || !pagar(S) || S.spill.modus !== "alle" || S.spill.fase !== "les") return;
        opptatt = true;
        let ferdigTelt = false;
        try {
          ferdigTelt = await R.nedtelling(["3", "2", "1", R.t("VELG!")], 650);
        } finally {
          opptatt = false;
        }
        if (!ferdigTelt) return;
        R.lyd.pek();
        R.vibrer([60, 40, 120]);
        const sp = S.spill;
        sp.fase = sp.telle ? "tell" : "valgt";
        sp.a = 0;
        sp.b = 0;
        R.vis();
        if (sp.fase === "tell") {
          R.si(R.t("Hvor mange valgte én finger? Dere er {n}.", { n: sp.antall }));
          visBunn();
        }
      },
      // One tap: this many chose ☝️, the rest ✌️ — drum roll and the result. After a defence
      // speech («Bytter noen side?») the same tap changes the count.
      async tell(el, e, S) {
        const sp = S.spill;
        if (opptatt || !pagar(S) || sp.modus !== "alle" || !["tell", "bytte"].includes(sp.fase)) return;
        const n = R.klamp(Math.round(Number(el.dataset.v)) || 0, 0, sp.antall);
        const bytte = sp.fase === "bytte";
        const fortsatt = R.vakt();
        opptatt = true;
        trykket = n;
        R.vis();
        const tid = R.rolig() ? 0.3 : bytte ? 0.5 : 0.9;
        R.lyd.trommevirvel(tid);
        await R.vent(tid * 1000);
        opptatt = false;
        trykket = null;
        // Left the screen meanwhile: nothing is logged, and the question is asked again.
        if (!fortsatt() || S.spill !== sp || sp.fase !== (bytte ? "bytte" : "tell")) {
          if (pagar(S) && S.skjerm === "kort") R.vis();
          return;
        }
        sp.a = n;
        sp.b = sp.antall - n;
        sp.fase = "svar";
        if (bytte && sp.logg.length) Object.assign(sp.logg[sp.logg.length - 1], { a: sp.a, b: sp.b });
        else {
          sp.logg.push({ k: sp.kort, a: sp.a, b: sp.b });
          if (sp.logg.length > 300) sp.logg.shift();
        }
        R.vis();
        const min = Math.min(sp.a, sp.b);
        if (bytte) (sp.a === sp.for.a ? R.lyd.pling : R.lyd.riktig)();
        else if (min === 0) {
          R.lyd.riktig();
          R.konfetti(sp.a ? ["--mynte", "--papir"] : ["--lilla", "--papir"]);
        } else if (min === 1 && sp.antall >= 3) R.lyd.latter();
        else R.lyd.pling();
        R.si(`${bytte ? bytteDom(Math.abs(sp.a - sp.for.a)) : dom(sp.a, sp.b, sp.kort)} ${R.t("{a} for én finger og {b} for to.", { a: stemmer(sp.a), b: stemmer(sp.b) })}`);
        window.scrollTo(0, 0);
        visBunn();
      },
      // Wrong tap: back to the count (the logged result goes away).
      "endre-tall"(el, e, S) {
        const sp = S.spill;
        if (opptatt || !pagar(S) || sp.modus !== "alle" || sp.fase !== "svar") return;
        sp.logg.pop();
        Object.assign(sp, { fase: "tell", for: null });
        R.vis();
        R.si(R.t("Hvor mange valgte én finger?"));
        visBunn();
      },
      // «Er dere ikke 8?»: change how many are voting, in a sheet with a stepper.
      "antall-ark"(el, e, S) {
        const sp = S.spill;
        if (opptatt || !pagar(S) || sp.modus !== "alle") return;
        R.ark(`
          <h2 id="ark-tittel">${esc(R.t("Hvor mange er dere?"))}</h2>
          <p class="ingress">${esc(R.t("Tell alle som er med og stemmer."))}</p>
          ${R.ui.teller("antall-spill", sp.antall, 2, 20, { enhet: R.t("spillere"), minus: R.t("Færre spillere"), pluss: R.t("Flere spillere") })}
          <button class="knapp" data-h="lukk-ark">${esc(R.t("Ferdig"))}</button>`);
      },
      "antall-spill"(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.modus !== "alle") return;
        sp.antall = R.klamp(sp.antall + Number(el.dataset.v), 2, 20);
        S.antall = sp.antall;
        // Update the stepper in place (the sheet keeps its focus), then the buttons behind it.
        const boks = el.closest(".teller");
        if (boks) {
          boks.querySelector("output").innerHTML = `${sp.antall} <small>${esc(R.t("spillere"))}</small>`;
          boks.querySelector('[data-v="-1"]').disabled = sp.antall <= 2;
          boks.querySelector('[data-v="1"]').disabled = sp.antall >= 20;
        }
        R.vis();
      },
      // The minority gets 20 seconds to win the others over; then «Bytter noen side?».
      forsvar(el, e, S) {
        const sp = S.spill;
        if (opptatt || !pagar(S) || sp.modus !== "alle" || sp.fase !== "svar" || sp.for) return;
        sp.for = { a: sp.a, b: sp.b };
        sp.fase = "tale";
        R.vis();
        startTale();
        R.si(R.t("Mindretallet har ordet i {n} sekunder.", { n: TALETID }));
        visBunn();
      },
      "tale-ferdig": (el, e, S) => tilBytte(S),

      // ----- «I vinglestolen» -----

      // The one in the chair taps a half in secret. Nothing on the screen shows which.
      "stol-velg"(el, e, S) {
        const sp = S.spill;
        if (opptatt || !pagar(S) || sp.modus !== "stol" || sp.fase !== "stol") return;
        sp.valg = el.dataset.v === "b" ? "b" : "a";
        sp.fase = sp.antall === 2 ? "flertall" : "gjett";
        R.vis();
        window.scrollTo(0, 0);
        R.si(sp.antall === 2 ? R.t("Valgt. {navn} gjetter.", { navn: R.navn((iStolen(sp) + 1) % 2) }) : R.t("Valgt. Nå gjetter de andre."));
      },
      // Another dilemma for the same player (nothing has been chosen yet).
      async bytt(el, e, S) {
        const sp = S.spill;
        if (opptatt || !pagar(S) || sp.modus !== "stol" || sp.fase !== "stol") return;
        const fortsatt = R.vakt();
        await R.kastKort(-1);
        if (!fortsatt()) return;
        nyttKort(S, false);
        R.vis();
      },
      async gjett(el, e, S) {
        if (opptatt || !pagar(S) || S.spill.modus !== "stol" || S.spill.fase !== "gjett") return;
        opptatt = true;
        let ferdigTelt = false;
        try {
          ferdigTelt = await R.nedtelling(["3", "2", "1", R.t("GJETT!")], 650);
        } finally {
          opptatt = false;
        }
        if (!ferdigTelt) return;
        R.lyd.pek();
        R.vibrer([60, 40, 120]);
        S.spill.fase = "flertall";
        R.vis();
        R.si(R.t("Hva gjettet flertallet?"));
      },
      // What most of the others guessed (or the one other player): drum roll, and the truth.
      async flertall(el, e, S) {
        const sp = S.spill;
        if (opptatt || !pagar(S) || sp.modus !== "stol" || sp.fase !== "flertall") return;
        const v = el.dataset.v;
        const gjett = v === "a" || v === "b" ? v : sp.antall > 2 ? "delt" : null;
        if (!gjett) return;
        const fortsatt = R.vakt();
        opptatt = true;
        const tid = R.rolig() ? 0.3 : 0.9;
        R.lyd.trommevirvel(tid);
        await R.vent(tid * 1000);
        opptatt = false;
        if (!fortsatt() || S.spill !== sp || sp.fase !== "flertall") return;
        sp.gjett = gjett;
        sp.fase = "avslort";
        sp.logg.push({ k: sp.kort, i: iStolen(sp), valg: sp.valg, gjett });
        R.vis();
        window.scrollTo(0, 0);
        const navn = R.navn(iStolen(sp));
        const k = ALLE[sp.kort];
        if (gjett === sp.valg) {
          R.lyd.riktig();
          R.konfetti(sp.valg === "a" ? ["--mynte", "--papir"] : ["--lilla", "--papir"]);
        } else if (gjett === "delt") R.lyd.pling();
        else R.lyd.latter();
        R.si(`${R.t("{navn} valgte: {valg}.", { navn, valg: sp.valg === "a" ? k.a : k.b })} ${gjett === sp.valg ? R.t("Riktig gjettet!") : gjett === "delt" ? R.t("Gjengen var delt.") : R.t("Feil gjettet!")}`);
        visBunn();
      },
      // Wrong tap: back to «Hva gjettet flertallet?» (the logged round goes away).
      "endre-gjett"(el, e, S) {
        const sp = S.spill;
        if (opptatt || !pagar(S) || sp.modus !== "stol" || sp.fase !== "avslort") return;
        sp.logg.pop();
        Object.assign(sp, { fase: "flertall", gjett: null });
        R.vis();
      },
      async "neste-stol"(el, e, S) {
        const sp = S.spill;
        if (opptatt || !pagar(S) || sp.modus !== "stol" || sp.fase !== "avslort") return;
        if (sp.nr >= totaltStol(sp)) return tilKaaring(S);
        const fortsatt = R.vakt();
        await R.kastKort(-1);
        if (!fortsatt()) return;
        nyttKort(S, true);
        R.vis();
        window.scrollTo(0, 0);
        R.si(R.t("Runde {nr}. {navn} sitter i vinglestolen.", { nr: sp.nr, navn: R.navn(iStolen(sp)) }));
      },

      // ----- The end -----

      "til-kaaring"(el, e, S) {
        if (opptatt || !pagar(S)) return;
        const sp = S.spill;
        if (sp.modus === "stol" ? sp.fase === "avslort" && sp.nr >= totaltStol(sp) : erSiste(sp) && ["svar", "valgt"].includes(sp.fase)) tilKaaring(S);
      },
      // «Avslutt»: with something to crown, straight to Kåringen (the sheet says so) — it is final.
      async avslutt(el, e, S) {
        const fortsatt = R.vakt();
        const sp = S.spill;
        const stol = !!sp && sp.modus === "stol";
        if (sp && sp.logg.length) {
          const tekst = stol ? R.t("Dere går rett til kåringen med rundene dere har spilt.") : R.t("Dere går rett til kåringen og får dommen over gjengen.");
          if (!(await R.bekreft(R.t("Avslutte spillet?"), tekst, R.t("Avslutt"), R.t("Spill videre"))) || !fortsatt() || !pagar(S)) return;
          tilKaaring(S);
          return;
        }
        if ((await R.bekreft(R.t("Avslutte spillet?"), R.t("Dere kan alltid starte et nytt."), R.t("Avslutt"), R.t("Spill videre"))) && fortsatt()) {
          stoppTale();
          S.spill = null;
          R.slippVaken();
          R.gaTil("hjem");
        }
      },
      del(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.logg.length || (sp.modus !== "stol" && !gruppedom(sp.logg))) return;
        R.del(R.app.navn, delTekst(sp), location.origin + R.forside + ((R.sprak !== "nb" && window.RUSJ_SPILL && window.RUSJ_SPILL.slug) || "vinglepetter") + "/");
      },
      igjen(el, e, S) {
        H.start(el, e, S);
      },
    }),
  });
})();
