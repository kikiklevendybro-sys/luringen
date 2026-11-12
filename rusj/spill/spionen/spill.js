/* Spionen — "Find the spy".
   Everyone gets the same secret place and a role there, except the spy, who gets nothing.
   Two ways to play:
   - one phone passed around the table (hold-to-reveal cards), or
   - each on their own phone: the host shows a join code + QR; every phone picks its seat and
     computes the same round from the code alone (seed, player count, spy count and packs,
     salted with a hash of the place list). Nothing is sent anywhere.
   A game is 3 or 5 rounds (or «Fri»: until someone ends it), then «Kåringen». */
(function () {
  "use strict";

  const R = window.Rusj;
  const D = window.RUSJ_DATA;
  const esc = R.esc;

  // The packs in data order. New packs are added at the END of steder.json, so every place keeps
  // its number (saved games and the deck of played places store numbers).
  const PAKKER = D.steder.pakker;
  const STEDER = [];
  PAKKER.forEach((p) => p.steder.forEach((s) => STEDER.push({ p: p.id, navn: s.navn, ikon: s.ikon, roller: s.roller })));
  const pakke = (id) => PAKKER.find((p) => p.id === id);
  // A place's name without the soft hyphens (they only say where a long name may break).
  const rentNavn = (i) => STEDER[i].navn.replace(/\u00ad/g, "");

  // Question ideas: about the place, about the roles, and easy ones for children.
  const IDEGRUPPER = [
    ["sted", R.t("Om stedet")],
    ["rolle", R.t("Om rollen din")],
    ["lett", R.t("Lette spørsmål")],
  ];
  const SPORSMAL = IDEGRUPPER.flatMap(([id]) => D.sporsmal[id]);
  const sporsmalstokk = R.kortstokk("sporsmal", SPORSMAL.length);
  const nesteSporsmal = () => Math.max(0, sporsmalstokk.neste());

  const HOLD = R.t("Hold fingeren på kortet for å se");
  const MIN = 3;
  const MAKS = 12;
  const TIDER = [5, 8, 10];
  const RUNDER = [3, 5, 0]; // 0 = «Fri»: the game goes on until someone ends it
  const STANDARD_PAKKER = ["hverdag", "norge"];
  const maksSpioner = (n) => (n >= 7 ? 2 : 1);
  // Minutes that suit the group — used until the players choose the minutes themselves.
  const tidFor = (n) => (n <= 5 ? 5 : n <= 8 ? 8 : 10);
  const range = (n) => Array.from({ length: n }, (_, i) => i);
  const nuller = (n) => range(n).map(() => 0);
  const heltall = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
  const tallrekke = (l, n) => Array.isArray(l) && l.length === n && l.every((v) => Number.isFinite(v));
  const objekt = (x) => (x && typeof x === "object" && !Array.isArray(x) ? x : {});
  let H; // the actions, so one action can reuse another

  // ---------- The «Jul» pack: in season from 1 November to 6 January (Oslo time) ----------

  // The year the season started (2026 also in January 2027), or 0 outside the season.
  function julesesong() {
    const [aar, mnd, dag] = R.dag().tekst.split("-").map(Number);
    if (mnd >= 11) return aar;
    return mnd === 1 && dag <= 6 ? aar - 1 : 0;
  }
  // In season «Jul» is the first pack on the setup screen and in «Stedspasset».
  const pakkerekke = () => (julesesong() && pakke("jul") ? [pakke("jul"), ...PAKKER.filter((p) => p.id !== "jul")] : PAKKER);
  const standardPakker = () => (julesesong() && pakke("jul") ? ["jul", STANDARD_PAKKER[0]] : STANDARD_PAKKER.slice());

  // ---------- Join codes ----------
  // players-3 (4 bits) | spies-1 (1) | one bit per pack | seed (24), plus two check symbols.
  // The check symbols catch almost every typo, and they are salted with a hash of the place
  // list, so a phone with other content rejects the code instead of showing another place.
  const BREDDER = [4, 1, PAKKER.length, 24];
  const SJEKK = 2;
  const SALT = R.hash(JSON.stringify(PAKKER));
  const KODELENGDE = R.kode.lengde(BREDDER, SJEKK);
  // The place list as it was before the «Jul» pack came. «Julebordet» (then number 21) moved into
  // the new pack and «Søndagsturen» took its number; every other place is where it was, so a
  // one-phone game that was in progress carries on.
  const SALT_FOR_JUL = 2161112527;
  const FLYTTET = { nr: 21, navn: "Julebordet" }; // sprak-ok (a Norwegian save from before the «Jul» pack)

  function lagKode(o) {
    const maske = PAKKER.reduce((m, p, i) => (o.pakker.includes(p.id) ? m + 2 ** (PAKKER.length - 1 - i) : m), 0);
    return R.kode.lag([o.antall - MIN, o.spioner - 1, maske, o.fro], BREDDER, SALT, SJEKK);
  }

  function lesKode(tekst) {
    const v = R.kode.les(tekst, BREDDER, SALT, SJEKK);
    if (!v) return null;
    const antall = v[0] + MIN;
    const spioner = v[1] + 1;
    const pakker = PAKKER.filter((p, i) => Math.floor(v[2] / 2 ** (PAKKER.length - 1 - i)) % 2).map((p) => p.id);
    if (antall > MAKS || spioner > maksSpioner(antall) || !pakker.length) return null;
    return { kode: R.kode.normaliser(tekst), antall, spioner, pakker, fro: v[3] };
  }

  // The join link carries the round too (…/#CODE_3), so a late joiner lands in the right round.
  const lenkeFor = (sp) => R.kode.lenke(sp.kode) + (sp.runde > 1 ? "_" + sp.runde : "");

  function kodeFeil(tekst) {
    const ren = R.kode.normaliser(tekst);
    if (!ren) return R.t("Skriv inn koden først.");
    if (ren.length > KODELENGDE * 2) return R.t("Det der er ikke en spillkode. Koden har {n} tegn.", { n: KODELENGDE });
    if (ren.length !== KODELENGDE) return R.t("Koden har {n} tegn – du har skrevet {skrevet}.", { n: KODELENGDE, skrevet: ren.length });
    return R.t("Koden stemmer ikke. Sjekk skrivefeil – og at alle har lastet inn siden på nytt.");
  }

  // Only what a code can be made of is kept as the draft in the code field (a join link may
  // carry anything after the #).
  const kodeUtkast = (tekst) => R.kode.formater(R.kode.normaliser(String(tekst == null ? "" : tekst).slice(0, 200)).slice(0, KODELENGDE));

  // ---------- Seats ----------
  // A seat is locked to this phone once its card has been seen, per code — also after leaving and
  // joining again. The host's own seat is locked the same way (see hemmelig.innhold).

  const laastPlass = (S, kode) => (S.laste && Number.isInteger(S.laste[kode]) ? S.laste[kode] : null);

  function laas(S, kode, plass) {
    const l = (S.laste = objekt(S.laste));
    if (l[kode] === plass) return;
    delete l[kode];
    l[kode] = plass;
    // Old codes are games long finished: keep the list short.
    const koder = Object.keys(l);
    for (const k of koder.slice(0, Math.max(0, koder.length - 40))) delete l[k];
  }

  // Does this phone host the game with this code? Then it has a seat there already, and joining
  // as a guest would give the host a second card to look at.
  const erVertFor = (S, kode) => !!(S.spill && S.spill.modus === "hver" && S.spill.kode === kode);

  // ---------- Rounds ----------

  // Indexes of the places in the chosen packs.
  function utvalg(pakker) {
    const valgt = new Set(pakker);
    return STEDER.map((s, i) => i).filter((i) => valgt.has(STEDER[i].p));
  }

  // The order of the places for a seed: the same on every phone.
  const stedrekke = (pool, fro) => R.stokk(pool, R.rng(R.hash("steder:" + fro)));

  // Everything about one round. Same settings + seed + round number → the same round on every phone.
  function lagRunde(o, runde) {
    const rekke = stedrekke(utvalg(o.pakker), o.fro);
    const t = R.rng(R.hash("runde:" + o.fro + ":" + runde));
    const spioner = R.stokk(range(o.antall), t)
      .slice(0, o.spioner)
      .sort((a, b) => a - b);
    const starter = Math.floor(t() * o.antall);
    const rollerekke = R.stokk(range(7), t);
    let k = 0;
    const roller = range(o.antall).map((i) => (spioner.includes(i) ? -1 : rollerekke[k++ % 7]));
    return { sted: rekke[(runde - 1) % rekke.length], spioner, starter, roller };
  }

  const erSpion = (r, i) => r.spioner.includes(i);
  const rolleFor = (r, i) => {
    const roller = STEDER[r.sted].roller;
    return roller[r.roller[i] % roller.length];
  };

  // What one seat sees on the hold-to-reveal card. Spy and place cards share one layout and
  // one colour, so nobody can tell them apart from across the table.
  function kortHtml(r, plass) {
    if (erSpion(r, plass)) {
      return {
        klasse: "sp-kort",
        html: `
          <span class="kort-etikett">${esc(R.t("Du er"))}</span>
          <span class="sp-kort-ikon" aria-hidden="true">🕵️</span>
          <span class="kort-ord">${esc(R.t("Spionen"))}</span>
          <span class="sp-rolle"><small>${esc(R.t("Oppdraget ditt"))}</small>${esc(R.t("Finn ut hvor dere er – uten at noen skjønner at du ikke vet det."))}</span>
          <span class="kort-fot">${esc(r.spioner.length > 1 ? R.t("Dere er to spioner. Du vet ikke hvem den andre er.") : R.t("Lytt godt og bløff!"))}</span>`,
      };
    }
    const s = STEDER[r.sted];
    return {
      klasse: "sp-kort",
      html: `
        <span class="kort-etikett">📍 ${esc(R.t("Stedet er"))}</span>
        <span class="sp-kort-ikon" aria-hidden="true">${esc(s.ikon)}</span>
        <span class="kort-ord ${R.lengdeKlasse(rentNavn(r.sted))}">${esc(s.navn)}</span>
        <span class="sp-rolle"><small>${esc(R.t("Du er"))}</small>${esc(rolleFor(r, plass))}</span>
        <span class="kort-fot">${esc(R.t("Ikke si stedet høyt!"))}</span>`,
    };
  }

  // ---------- The deck of places (this phone) ----------
  // The places played since the deck last started over, oldest first. The game keeps the list
  // itself: R.kortstokk can deal a card, but not mark one that a join code picked. (Same key and
  // format as the R.kortstokk("steder") this game used before, so a phone's deck carries on.)

  const STOKK = "spionen.brukt.steder";

  function lesStokk() {
    const l = R.les(STOKK, []);
    return Array.isArray(l) ? l.filter((i, n) => heltall(i, 0, STEDER.length - 1) && l.indexOf(i) === n) : [];
  }

  function merkSpilt(i) {
    const l = lesStokk().filter((x) => x !== i);
    l.push(i);
    R.skriv(STOKK, l);
  }

  const ledige = (pool) => {
    const brukt = new Set(lesStokk());
    return pool.filter((i) => !brukt.has(i));
  };

  // The deck for these places starts over. The `behold` most recently played of them stay out, so
  // a place never comes straight back.
  function nyStokk(pool, behold) {
    const med = new Set(pool);
    const brukt = lesStokk();
    const mine = brukt.filter((i) => med.has(i));
    const ute = new Set(behold > 0 ? mine.slice(-behold) : []);
    R.skriv(STOKK, brukt.filter((i) => !med.has(i) || ute.has(i)));
  }

  // One phone: a place nobody has had since the deck started over.
  function trekkSted(pakker) {
    const pool = utvalg(pakker);
    let fri = ledige(pool);
    if (!fri.length) {
      nyStokk(pool, Math.min(5, pool.length >> 1));
      fri = ledige(pool);
    }
    const i = R.velg(fri.length ? fri : pool);
    merkSpilt(i);
    return i;
  }

  // «Hver sin mobil»: every phone works out the places from the code, so the deck can't deal
  // them. The host tries seeds instead, until the game's first rounds are places this phone
  // hasn't played. (Each round's place is marked as played when the round starts.)
  function nyttFro(pakker, runder) {
    const pool = utvalg(pakker);
    const antall = Math.min(runder || 6, pool.length);
    // The chance that a random order starts with `antall` fresh places when n are fresh.
    const sjanse = (n) => range(antall).reduce((p, j) => (p * Math.max(0, n - j)) / (pool.length - j), 1);
    let fri = ledige(pool);
    if (sjanse(fri.length) < 1 / 150) {
      // Too few fresh places left for a quick search: the deck starts over.
      nyStokk(pool, Math.min(antall, pool.length - antall));
      fri = ledige(pool);
    }
    const ferske = new Set(fri);
    let beste = R.nyttFro() % 2 ** 24;
    let flest = -1;
    for (let n = 0; n < 1500 && flest < antall; n++) {
      const fro = R.nyttFro() % 2 ** 24;
      const rekke = stedrekke(pool, fro);
      let treff = 0;
      while (treff < antall && ferske.has(rekke[treff])) treff++;
      if (treff > flest) {
        beste = fro;
        flest = treff;
      }
    }
    return beste;
  }

  // ---------- «Stedspasset»: the places this phone has played ----------
  // Kept by name, not by number, so the stamps survive new packs and a new order.

  const PASS = "spionen.pass";

  function lesPass() {
    const l = R.les(PASS, null);
    return Array.isArray(l) ? l.filter((n, i) => typeof n === "string" && n.length < 80 && l.indexOf(n) === i).slice(0, 600) : null;
  }

  // The first visit with a passport: the places still in this phone's deck have been played here,
  // so they are stamped from the start. (Done before anything is dealt: the numbers in the deck
  // are from the old place list.)
  // (only the Norwegian edition is old enough to have a deck from before the «Jul» pack)
  if (!lesPass()) R.skriv(PASS, lesStokk().map((i) => (i === FLYTTET.nr && R.sprak === "nb" ? FLYTTET.navn : rentNavn(i))));

  function besokte() {
    const navn = new Set(lesPass() || []);
    return new Set(range(STEDER.length).filter((i) => navn.has(rentNavn(i))));
  }

  function stemple(i) {
    const navn = lesPass() || [];
    if (navn.includes(rentNavn(i))) return;
    navn.push(rentNavn(i));
    R.skriv(PASS, navn);
  }

  // ---------- Clock (survives reloads: the end time is saved in S) ----------

  const igjenMs = (k) => (k.slutt ? Math.max(0, k.slutt - Date.now()) : k.igjen);

  function startKlokke(S) {
    const k = S.spill.klokke;
    if (k.gaar && !k.slutt) k.slutt = Date.now() + k.igjen;
    const igjen = igjenMs(k);
    const t = new R.Timer({ id: "klokke", sekunder: k.total, vedSlutt: () => tidenUte(S) });
    t.igjenMs = igjen;
    if (igjen <= 0) {
      // Coming back to a clock that has run out: show it, but don't jump anywhere by itself.
      k.igjen = 0;
      k.slutt = null;
      k.gaar = false;
      t.tegn();
      if (!S.spill.tidUte) {
        S.spill.tidUte = true;
        R.vis();
      }
      return;
    }
    if (k.gaar) t.start();
    else t.tegn();
    R.lagre();
  }

  // When the clock runs out while you watch, the accusation opens after a moment — unless
  // someone taps «+1 min» or «Pause» first.
  let hopp = null;
  const avbrytHopp = () => {
    clearTimeout(hopp);
    hopp = null;
  };

  // Leaving the play screen stops the clock; it starts again when you come back.
  function stoppKlokke(S) {
    const k = S.spill && S.spill.klokke;
    if (!k) return;
    if (k.slutt) {
      k.igjen = Math.max(0, k.slutt - Date.now());
      k.slutt = null;
    }
  }

  function tidenUte(S) {
    const sp = S.spill;
    if (!sp || S.skjerm !== "runde") return;
    sp.klokke.igjen = 0;
    sp.klokke.slutt = null;
    sp.klokke.gaar = false;
    sp.tidUte = true;
    sp.anklaget = null;
    R.vis();
    avbrytHopp();
    const fortsatt = R.vakt();
    hopp = setTimeout(() => {
      hopp = null;
      if (fortsatt() && S.spill && S.spill.tidUte) R.gaTil("anklage");
    }, 2600);
    R.vedForlat(avbrytHopp);
  }

  // The list of places on the play screen scrolls by itself; its position is kept across redraws.
  let stedrull = 0;

  // ---------- Small building blocks ----------

  // Big player names shrink a little when a single word is long, so they never break mid-word.
  function navnKlasse(navn) {
    const lengste = Math.max(...String(navn).split(/\s+/).map((d) => d.length));
    return lengste >= 14 ? "sp-navn-xl" : lengste >= 11 ? "sp-navn-l" : "";
  }

  const ferdigKnapp = (neste) => `<span class="sp-to-linjer"><b>${esc(R.t("Ferdig"))}</b><small>${esc(R.t("Gi mobilen til {navn}", { navn: neste }))}</small></span>`;

  function piller(liste) {
    return `<div class="sp-piller">${liste.filter(Boolean).map((t) => `<span>${esc(t)}</span>`).join("")}</div>`;
  }
  const spionTekst = (n) => R.flertall(n, "spion", "spioner");
  const rundeTittel = (sp) => (sp.runder ? R.t("Runde {n} av {av}", { n: sp.runde, av: sp.runder }) : R.t("Runde {n}", { n: sp.runde }));
  const sisteRunde = (sp) => !!sp.runder && sp.runde >= sp.runder;
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  // The minutes for the next game: the players' own choice, or what suits the group.
  const minutter = (S) => (S.oppsett.tidValgt ? S.oppsett.tid : tidFor(R.klamp(S.antall, MIN, MAKS)));

  function navnerad(liste) {
    return `<span class="sp-navnerad">${liste.map((i) => `<span>${R.avatar(i)}${esc(R.navn(i))}</span>`).join("")}</span>`;
  }

  // All places in the chosen packs, grouped by pack. o.h makes them buttons (guess / cross out);
  // o.nivaa is the heading level of the pack names (2 on a screen, 3 in a sheet).
  function stedListe(pakker, o = {}) {
    const hn = "h" + (o.nivaa || 3);
    return pakkerekke()
      .filter((p) => pakker.includes(p.id))
      .map((p) => {
        const rader = utvalg([p.id])
          .map((i) => {
            const s = STEDER[i];
            const innhold = `<span class="sp-sted-ikon" aria-hidden="true">${esc(s.ikon)}</span><span>${esc(s.navn)}</span>`;
            if (!o.h) return `<li class="sp-sted">${innhold}</li>`;
            const trykket = o.kryss ? ` aria-pressed="${o.kryss.includes(i)}"` : "";
            return `<button class="sp-sted" data-h="${o.h}" data-v="${i}"${trykket}>${innhold}</button>`;
          })
          .join("");
        return `<section class="sp-stedgruppe">
          <${hn}><span aria-hidden="true">${esc(p.ikon)}</span> ${esc(p.navn)}</${hn}>
          ${o.h ? `<div class="sp-steder">${rader}</div>` : `<ul class="sp-steder">${rader}</ul>`}
        </section>`;
      })
      .join("");
  }

  // A guest's own list of the places, with cross-out.
  function visSteder(S) {
    const g = S.gjest;
    R.ark(`
      <h2 id="ark-tittel">${esc(R.t("Mulige steder"))}</h2>
      <p class="ingress">${esc(R.t("Ett av disse {n} stedene er stedet dere er på. Trykk på et sted for å krysse det ut.", { n: utvalg(g.pakker).length }))}</p>
      ${stedListe(g.pakker, { h: "kryss", kryss: g.kryss || [] })}
      <button class="knapp" data-h="lukk-ark">${esc(R.t("Lukk"))}</button>`);
  }

  // «Spørsmålsideer»: a handful from each group; «Vis andre» draws again.
  function visIdeer() {
    R.ark(`
      <h2 id="ark-tittel">${esc(R.t("Spørsmålsideer"))}</h2>
      <p class="ingress">${esc(R.t("Still dem til hvem som helst. Svar ærlig – men ikke så tydelig at spionen skjønner stedet."))}</p>
      ${IDEGRUPPER.map(
        ([id, navn]) => `<section class="sp-idegruppe">
          <h3>${esc(navn)}</h3>
          <ul class="sp-ideer">${R.stokk(D.sporsmal[id])
            .slice(0, 4)
            .map((q) => `<li>${esc(q)}</li>`)
            .join("")}</ul>
        </section>`,
      ).join("")}
      <div class="knapprad">
        ${R.ui.knapp2(R.t("Vis andre"), "ide")}
        ${R.ui.knapp(R.t("Lukk"), "lukk-ark")}
      </div>`);
  }

  // «Stedspasset»: one page per pack, a stamp for every place played on this phone.
  function visPass() {
    const sett = besokte();
    R.ark(`
      <h2 id="ark-tittel">${esc(R.t("Stedspasset"))}</h2>
      <p class="ingress">${esc(
        sett.size ? R.t("{n} av {av} steder besøkt på denne mobilen.", { n: sett.size, av: STEDER.length }) : R.t("Ingen stempler ennå."),
      )} ${esc(R.t("Et sted får stempel når dere har spilt en runde der."))}</p>
      ${pakkerekke()
        .map((p) => {
          const steder = utvalg([p.id]);
          const antall = steder.filter((i) => sett.has(i)).length;
          const full = antall === steder.length;
          return `<section class="sp-pass${full ? " full" : ""}">
            <div class="sp-pass-hode">
              <h3><span aria-hidden="true">${esc(p.ikon)}</span> ${esc(p.navn)}</h3>
              ${full ? `<span class="sp-pass-full">${esc(R.t("Alle {n}", { n: steder.length }))}</span>` : `<span class="sp-pass-tall">${esc(R.t("{n} av {av}", { n: antall, av: steder.length }))}</span>`}
            </div>
            <ul class="sp-stempler">${steder
              .map(
                (i) =>
                  `<li class="${sett.has(i) ? "tatt" : ""}"><span class="sp-sted-ikon" aria-hidden="true">${esc(STEDER[i].ikon)}</span><span>${esc(STEDER[i].navn)}<span class="vh">${
                    " – " + esc(sett.has(i) ? R.t("besøkt") : R.t("ikke besøkt ennå"))
                  }</span></span></li>`,
              )
              .join("")}</ul>
          </section>`;
        })
        .join("")}
      <button class="knapp" data-h="lukk-ark">${esc(R.t("Lukk"))}</button>`);
  }

  // ---------- Game flow ----------

  function startSpill(S) {
    const o = S.oppsett;
    const antall = R.klamp(S.antall, MIN, MAKS);
    const pakker = PAKKER.map((p) => p.id).filter((id) => o.pakker.includes(id));
    const hver = o.modus === "hver";
    const sp = {
      salt: SALT,
      modus: o.modus,
      antall,
      spioner: Math.min(o.spioner, maksSpioner(antall)),
      tid: minutter(S),
      runder: o.runder,
      pakker,
      fro: hver ? nyttFro(pakker, o.runder) : R.nyttFro() % 2 ** 24,
      runde: 0,
      spilt: 0, // rounds with a result
      poeng: nuller(antall),
      seire: nuller(antall), // rounds won as spy: the tie-break on «Kåringen»
      fangst: nuller(antall), // times a player called stop and was right
      logg: [], // per finished round: did the spy win?
      vertPlass: null,
    };
    if (hver) sp.kode = lagKode(sp);
    S.spill = sp;
    R.statistikk("start", { modus: sp.modus, spillere: antall, runder: sp.runder, spioner: sp.spioner, steder: utvalg(pakker).length });
    R.holdVaken();
    nyRunde(S);
  }

  function nyRunde(S) {
    const sp = S.spill;
    sp.runde += 1;
    if (sp.modus === "hver") {
      sp.r = lagRunde(sp, sp.runde);
      merkSpilt(sp.r.sted);
    } else {
      // One phone: real randomness every round, and the place comes from the deck.
      sp.r = lagRunde(Object.assign({}, sp, { fro: R.nyttFro() }), 1);
      sp.r.sted = trekkSted(sp.pakker);
    }
    sp.sporsmal = nesteSporsmal();
    sp.vis = { i: 0, sett: false };
    sp.vertSett = false;
    sp.klokke = { total: sp.tid * 60, igjen: sp.tid * 60 * 1000, slutt: null, gaar: true };
    sp.anklaget = null;
    sp.tidUte = false;
    sp.avslort = false;
    sp.gjetter = null;
    sp.gjett = null;
    sp.svart = false;
    sp.utfall = null;
    sp.feiret = false;
    R.gaTil(sp.modus === "hver" ? (sp.runde === 1 ? "kode" : "vert") : "vis");
  }

  // Countdown overlays: one at a time, even if a button is tapped twice.
  // Resolves false if the countdown is already running or the screen changed during it.
  let teller = false;
  async function nedtelling(liste, ms) {
    if (teller) return false;
    teller = true;
    try {
      return await R.nedtelling(liste, ms);
    } finally {
      teller = false;
    }
  }

  async function startRunde(S) {
    const fortsatt = R.vakt();
    if (!(await nedtelling(["3", "2", "1", R.t("SPØR!")], 650)) || !fortsatt() || !S.spill) return;
    R.lyd.pek();
    R.gaTil("runde");
  }

  // Adds (fortegn 1) or takes back (−1) what the round gave: the points, and the counts behind
  // the tie-break and the awards.
  function bokfor(sp, fortegn) {
    const u = sp.utfall;
    sp.poeng = sp.poeng.map((p, i) => p + fortegn * (u.pluss[i] + (u.stoppet === i ? 1 : 0)));
    if (u.spionVant) sp.r.spioner.forEach((i) => (sp.seire[i] += fortegn));
    if (u.stoppet != null) sp.fangst[u.stoppet] += fortegn;
    sp.spilt += fortegn;
    if (fortegn > 0) sp.logg.push(!!u.spionVant);
    else sp.logg.pop();
  }

  // The scoring: every spy win gives the spy 2 — but 3 to the bold spy who stops the clock and
  // names the place. When the spy loses, everyone else gets 1 (and whoever called stop 1 more:
  // see the «stoppet» action).
  function ferdigRunde(S, spionVant, grunn) {
    const sp = S.spill;
    if (!sp.utfall) {
      const modig = spionVant && grunn === "gjettet" && sp.gjetter === "frivillig";
      const pluss = range(sp.antall).map((i) => (erSpion(sp.r, i) ? (spionVant ? (modig ? 3 : 2) : 0) : spionVant ? 0 : 1));
      sp.utfall = { spionVant, grunn, pluss, modig, stoppet: null };
      bokfor(sp, 1);
      stemple(sp.r.sted); // the place is in the open now
    }
    R.gaTil("resultat");
  }

  // Someone called stop, the group caught the spy and the spy's last guess missed: then one
  // player can get the accuser's extra point.
  const kanStoppe = (sp) => !!(sp.utfall && !sp.utfall.spionVant && sp.gjetter === "tatt" && sp.anklaget != null);

  function grunnTekst(sp) {
    const u = sp.utfall;
    const flere = sp.r.spioner.length > 1;
    const gjett = sp.gjett != null ? rentNavn(sp.gjett) : "";
    switch (u.grunn) {
      case "gjettet":
        return sp.gjetter === "tatt" ? R.t("Dere tok spionen – men spionen gjettet riktig: {sted}.", { sted: gjett }) : R.t("Spionen stoppet klokka selv og gjettet riktig: {sted}.", { sted: gjett });
      case "feilgjett":
        return sp.gjetter === "tatt" ? R.t("Spionen ble tatt og gjettet feil: {sted}.", { sted: gjett }) : R.t("Spionen stoppet klokka selv, men gjettet feil: {sted}.", { sted: gjett });
      case "uskyldig": {
        const navn = sp.anklaget != null ? R.navn(sp.anklaget) : R.t("Den dere pekte på");
        return flere ? R.t("{navn} var uskyldig, så spionene slapp unna.", { navn }) : R.t("{navn} var uskyldig, så spionen slapp unna.", { navn });
      }
      default:
        return flere ? R.t("Dere ble ikke enige før tiden var ute, så spionene slapp unna.") : R.t("Dere ble ikke enige før tiden var ute, så spionen slapp unna.");
    }
  }

  // ---------- «Kåringen» ----------

  // Most points first; equal points → most rounds won as spy. `plass` is shared only when both are equal.
  function rangering(sp) {
    const rader = range(sp.antall)
      .map((i) => ({ i, poeng: sp.poeng[i], seire: sp.seire[i] }))
      .sort((a, b) => b.poeng - a.poeng || b.seire - a.seire || a.i - b.i);
    rader.forEach((r) => (r.plass = 1 + rader.filter((x) => x.poeng > r.poeng || (x.poeng === r.poeng && x.seire > r.seire)).length));
    return rader;
  }

  // The podium and the list follow the game's own ranking; R.ui.pall and R.ui.poengliste only
  // know points. Same markup and classes as the kit's.
  function pall(rader) {
    const med = rader.filter((r) => r.poeng > 0);
    if (med.length < 2) return "";
    const s = med.slice(0, 3);
    const plass = (r) =>
      r
        ? `<div class="pall-plass p${Math.min(r.plass, 3)}">${R.avatar(r.i, "stor")}<span class="navn">${esc(R.navn(r.i))}</span><span class="poeng">${r.poeng} ${esc(R.t("p"))}</span><span class="blokk">${r.plass}</span></div>`
        : "<div></div>";
    return s.length < 3
      ? `<div class="pall to" aria-label="${esc(R.t("Pallen"))}">${plass(s[1])}${plass(s[0])}</div>`
      : `<div class="pall" aria-label="${esc(R.t("Pallen"))}">${plass(s[1])}${plass(s[0])}${plass(s[2])}</div>`;
  }

  function sluttliste(rader) {
    return `<ol class="poengliste">${rader
      .map(
        (r) =>
          `<li class="${r.plass === 1 && r.poeng > 0 ? "leder" : ""}"><span class="plass-nr">${r.plass}</span>${R.avatar(r.i)}<span class="navn">${esc(R.navn(r.i))}</span>${
            r.seire > 0 ? `<span class="sp-seire"><span aria-hidden="true">🕵️</span><span class="vh">${esc(R.t("Runder vunnet som spion:"))} </span>${r.seire}</span>` : ""
          }<span class="sum">${r.poeng}</span></li>`,
      )
      .join("")}</ol>`;
  }

  // The evening's awards: only when one or two players stand out.
  function priser(sp) {
    const ut = [];
    const legg = (liste, ikon, tittel, tekst) => {
      const topp = Math.max(...liste);
      const hvem = range(sp.antall).filter((i) => liste[i] === topp);
      if (topp > 0 && hvem.length <= 2) ut.push({ ikon, tittel, hvem, tekst: tekst(topp) });
    };
    legg(sp.seire, "🕵️", R.t("Mesterspion"), (n) => R.t("Vant {runder} som spion", { runder: R.flertall(n, "runde", "runder") }));
    legg(sp.fangst, "🔎", R.t("Spionjeger"), (n) => R.t("Ropte stopp og tok spionen {ganger}", { ganger: R.flertall(n, "gang", "ganger") }));
    return ut;
  }

  // One or two short lines for the share sheet: the result in numbers, a row with one sign per
  // round, and the award holders' names. Nothing else that a player has typed.
  function deletekst(sp) {
    const rader = rangering(sp);
    const vinnere = rader.filter((r) => r.plass === 1 && r.poeng > 0);
    const runder = R.flertall(sp.spilt, "runde", "runder");
    const linjer = [
      vinnere.length
        ? R.t("{navn} vant Spionen med {n} poeng etter {runder}.", { navn: R.ramsOpp(vinnere.map((r) => R.navn(r.i))), n: vinnere[0].poeng, runder })
        : R.t("Vi spilte {runder} av Spionen – og ingen fikk poeng.", { runder }),
    ];
    const rekke = sp.logg.map((vant) => (vant ? "🕵️" : "🔎")).join("");
    const pris = priser(sp)
      .map((p) => R.t("{tittel}: {navn}.", { tittel: p.tittel, navn: R.ramsOpp(p.hvem.map(R.navn)) }))
      .join(" ");
    if (rekke || pris) linjer.push([rekke, pris].filter(Boolean).join(" "));
    return linjer.join("\n");
  }

  // ---------- Saved state ----------

  // Screens that belong to a running game: "Fortsett" brings you back to the one you left.
  const SPILLSKJERMER = ["vis", "kode", "vert", "runde", "anklage", "avslor", "gjett", "svar", "resultat", "slutt"];

  // Does the saved game have what this screen draws?
  function kanVises(sp, skjerm) {
    if (skjerm === "vis") return sp.modus === "en";
    if (skjerm === "kode" || skjerm === "vert") return sp.modus === "hver";
    if (skjerm === "avslor") return sp.anklaget != null;
    if (skjerm === "svar") return sp.gjett != null;
    if (skjerm === "resultat") return !!sp.utfall;
    return SPILLSKJERMER.includes(skjerm);
  }

  // Is the saved game one this version can draw? Also fills in what older versions didn't save.
  function gyldigSpill(sp) {
    if (!sp || typeof sp !== "object") return false;
    const r = sp.r;
    const k = sp.klokke;
    const n = sp.antall;
    if (!r || typeof r !== "object" || !k || typeof k !== "object") return false;
    // A one-phone game from before the «Jul» pack plays on (see SALT_FOR_JUL).
    if (sp.salt === SALT_FOR_JUL && sp.modus === "en" && r.sted !== FLYTTET.nr) sp.salt = SALT;
    if (sp.salt !== SALT || !["en", "hver"].includes(sp.modus)) return false;
    if (!heltall(n, MIN, MAKS) || !heltall(sp.spioner, 1, maksSpioner(n)) || !heltall(sp.runde, 1, 9999) || !heltall(sp.fro, 0, 2 ** 32)) return false;
    if (!Number.isFinite(sp.tid) || sp.tid <= 0 || !tallrekke(sp.poeng, n)) return false;
    if (!Array.isArray(sp.pakker) || !sp.pakker.length || !sp.pakker.every((id) => typeof id === "string" && pakke(id))) return false;
    if (!STEDER[r.sted] || !sp.pakker.includes(STEDER[r.sted].p) || !heltall(r.starter, 0, n - 1)) return false;
    if (!Array.isArray(r.spioner) || !r.spioner.length || !r.spioner.every((i) => heltall(i, 0, n - 1))) return false;
    if (!Array.isArray(r.roller) || r.roller.length !== n || !r.roller.every((x) => heltall(x, -1, 99))) return false;
    if (!Number.isFinite(k.total) || !Number.isFinite(k.igjen) || !(k.slutt == null || Number.isFinite(k.slutt))) return false;
    if (sp.modus === "hver") {
      const o = typeof sp.kode === "string" ? lesKode(sp.kode) : null;
      if (!o || o.kode !== sp.kode || o.fro !== sp.fro || o.antall !== n) return false;
      if (!heltall(sp.vertPlass, 0, n - 1)) sp.vertPlass = null;
    }
    // Newer fields. A game from before the rounds had a number plays on as «Fri».
    if (!RUNDER.includes(sp.runder)) sp.runder = 0;
    if (!tallrekke(sp.seire, n)) sp.seire = nuller(n);
    if (!tallrekke(sp.fangst, n)) sp.fangst = nuller(n);
    sp.logg = Array.isArray(sp.logg) ? sp.logg.map(Boolean) : [];
    const u = sp.utfall;
    if (u && typeof u === "object" && tallrekke(u.pluss, n) && typeof u.grunn === "string") {
      u.spionVant = !!u.spionVant;
      u.modig = !!u.modig;
      if (!heltall(u.stoppet, 0, n - 1)) u.stoppet = null;
    } else sp.utfall = null;
    if (!heltall(sp.spilt, 0, 9999)) sp.spilt = sp.runde - (sp.utfall ? 0 : 1);
    if (!heltall(sp.sporsmal, 0, SPORSMAL.length - 1)) sp.sporsmal = 0;
    if (!sp.vis || typeof sp.vis !== "object" || !heltall(sp.vis.i, 0, n - 1)) sp.vis = { i: 0, sett: false };
    if (!heltall(sp.anklaget, 0, n - 1)) sp.anklaget = null;
    if (!heltall(sp.gjett, 0, STEDER.length - 1)) sp.gjett = null;
    if (!["tatt", "frivillig"].includes(sp.gjetter)) sp.gjetter = null;
    if (!kanVises(sp, sp.skjerm)) sp.skjerm = "runde";
    return true;
  }

  // A guest's seat: everything about the game is read from the code again.
  function gyldigGjest(g) {
    const o = g && typeof g === "object" && typeof g.kode === "string" ? lesKode(g.kode) : null;
    if (!o) return false;
    Object.assign(g, o);
    if (!heltall(g.runde, 1, 999)) g.runde = 1;
    if (!heltall(g.plass, 0, g.antall - 1)) g.plass = null;
    g.kryss = Array.isArray(g.kryss) ? g.kryss.filter((i) => heltall(i, 0, STEDER.length - 1)) : [];
    return true;
  }

  const DEF = {
    id: "spionen",
    versjon: 1,
    // A game is in progress (front page badge, screen kept awake): hosting, or holding a seat as a guest.
    pagar: (S) => pagar(S) || !!(S.gjest && S.gjest.plass != null),

    tilstand: () => ({
      antall: R.klamp(R.felles.navn.filter((n) => String(n || "").trim()).length || 4, MIN, MAKS),
      oppsett: { modus: "en", spioner: 1, tid: 8, tidValgt: false, runder: 5, pakker: standardPakker() },
      spill: null,
      // Seats this phone has seen a card for, per code: locked, also after leaving and rejoining.
      laste: {},
      gjest: null,
      // The season (its first year) in which «Jul» was last switched on by itself; null = never looked.
      jul: null,
    }),

    lastet(S) {
      const fersk = S.skjerm == null; // nothing was saved: tilstand() has just chosen everything
      S.antall = R.klamp(Math.round(Number(S.antall)) || 4, MIN, MAKS);
      const o = (S.oppsett = Object.assign({ modus: "en", spioner: 1, tid: 8, runder: 5, pakker: [] }, objekt(S.oppsett)));
      if (!["en", "hver"].includes(o.modus)) o.modus = "en";
      if (![1, 2].includes(o.spioner)) o.spioner = 1;
      // (8 was the fixed default before the minutes followed the group: only 5 and 10 were choices)
      if (typeof o.tidValgt !== "boolean") o.tidValgt = TIDER.includes(o.tid) && o.tid !== 8;
      if (!TIDER.includes(o.tid)) {
        o.tid = 8;
        o.tidValgt = false;
      }
      if (!RUNDER.includes(o.runder)) o.runder = 5;
      const valgt = Array.isArray(o.pakker) ? o.pakker : [];
      o.pakker = PAKKER.map((p) => p.id).filter((id) => valgt.includes(id));

      // «Jul» is switched on once when its season starts and off again when it is over. In between
      // the players decide: switched off in December it stays off, switched on in June it stays on.
      const aar = julesesong();
      if (fersk) S.jul = aar;
      else if (aar && S.jul !== aar && pakke("jul")) {
        if (!o.pakker.includes("jul")) o.pakker.push("jul");
        S.jul = aar;
      } else if (!aar && S.jul) {
        o.pakker = o.pakker.filter((id) => id !== "jul");
        // (what the season's own default leaves behind is one pack: back to the usual two)
        if (o.pakker.every((id) => id === STANDARD_PAKKER[0])) o.pakker = STANDARD_PAKKER.slice();
        S.jul = 0;
      }
      if (!Number.isInteger(S.jul)) S.jul = 0;
      if (!o.pakker.length) o.pakker = standardPakker();

      const laste = {};
      for (const [kode, plass] of Object.entries(objekt(S.laste))) if (heltall(plass, 0, MAKS - 1)) laste[kode] = plass;
      S.laste = laste;
      S.kodeUtkast = typeof S.kodeUtkast === "string" ? R.kutt(S.kodeUtkast, 20) : "";
      S.kodeFeil = typeof S.kodeFeil === "string" ? R.kutt(S.kodeFeil, 120) : "";

      if (!gyldigSpill(S.spill)) S.spill = null;
      if (!gyldigGjest(S.gjest)) S.gjest = null;
      if (S.gjest && erVertFor(S, S.gjest.kode)) S.gjest = null;
      if (SPILLSKJERMER.includes(S.skjerm) && !(S.spill && kanVises(S.spill, S.skjerm))) S.skjerm = "hjem";
      if (!S.gjest && ["plass", "gjest"].includes(S.skjerm)) S.skjerm = "hjem";
      if (S.gjest && S.gjest.plass == null && S.skjerm === "gjest") S.skjerm = "plass";
    },

    regler: {
      intro: R.t("Alle får vite hvor dere er – bortsett fra spionen. Still lure spørsmål, finn spionen og pass på at spionen ikke gjetter stedet."),
      steg: [
        [R.t("Se kortet ditt"), R.t("Alle får samme sted og en rolle der. Spionen får bare beskjeden «Du er spionen».")],
        [R.t("Still spørsmål"), R.t("Den som starter, spør en annen om stedet. Den som svarer, spør neste. Ikke for tydelig – spionen lytter!")],
        [R.t("Anklag eller gjett"), R.t("Trykk «Stopp» og pek på den dere mistenker. Spionen kan når som helst stoppe klokka selv og gjette stedet.")],
      ],
      tips: [
        R.t("Slipper spionen unna, eller gjetter stedet etter å ha blitt tatt, får spionen 2 poeng. Stopper spionen klokka selv og gjetter riktig, blir det 3 – modig spion!"),
        R.t("Taper spionen, får alle andre 1 poeng. Den som ropte stopp og anklaget spionen, får 1 ekstra."),
        R.t("Blir spionen tatt, får spionen likevel ett forsøk på å gjette stedet."),
        R.t("Står det likt til slutt, vinner den som har vunnet flest runder som spion."),
        R.t("De mulige stedene står under klokka hele runden – nyttig for spionen, og for å bløffe."),
        R.t("Hver sin mobil: én lager en kode, de andre trykker «Bli med i et spill» og velger nummeret sitt."),
        R.t("Svar gjerne i rollen din. Det er lov å overdrive! Tre kan spille, men spillet er best fra fire."),
      ],
    },

    hemmelig: {
      innhold(S, id) {
        // Seeing a card (even a quick peek) locks the seat, so nobody can look at other seats.
        if (id === "gjest") {
          const g = S.gjest;
          const laast = laastPlass(S, g.kode);
          if (laast != null && laast < g.antall) g.plass = laast;
          laas(S, g.kode, g.plass);
          const r = lagRunde(g, g.runde);
          // A place this phone has shown counts as played here (the deck and «Stedspasset»).
          if (!erSpion(r, g.plass)) {
            merkSpilt(r.sted);
            stemple(r.sted);
          }
          R.lagre();
          return kortHtml(r, g.plass);
        }
        if (id === "vert") {
          // The host's seat is locked on the guest side too, so it outlives the game: joining a
          // code this phone hosts — or has hosted — must never give a second seat.
          S.spill.vertLaast = true;
          laas(S, S.spill.kode, S.spill.vertPlass);
          R.lagre();
          return kortHtml(S.spill.r, S.spill.vertPlass);
        }
        return kortHtml(S.spill.r, Number(String(id).slice(1)));
      },
      sett(S, id) {
        if (id === "gjest" && S.skjerm === "gjest") {
          R.vis(); // the seat is locked now: drop «Bytt nummer»
          return;
        }
        if (id === "vert" && S.skjerm === "vert") {
          S.spill.vertSett = true;
          R.vis();
        } else if (S.skjerm === "vis" && id === "p" + S.spill.vis.i && !S.spill.vis.sett) {
          S.spill.vis.sett = true;
          R.vis();
          const knapp = R.$('[data-h="vist"]');
          if (knapp) knapp.classList.add("pop");
        }
      },
    },

    // Join links: …/spionen/#CODE
    vedHash(S, hash) {
      const [kodeDel, rundeDel] = String(hash).split("_");
      const o = lesKode(kodeDel);
      if (!o) {
        S.kodeUtkast = kodeUtkast(kodeDel);
        S.kodeFeil = kodeFeil(kodeDel);
        return "bli-med";
      }
      if (erVertFor(S, o.kode)) {
        // (after the screen change, which hides toasts)
        setTimeout(() => R.toast(R.t("Du er verten i dette spillet")), 0);
        return S.spill.skjerm;
      }
      if (!S.gjest || S.gjest.kode !== o.kode) S.gjest = Object.assign(o, { runde: 1, plass: laastPlass(S, o.kode), kryss: [] });
      const runde = Number(rundeDel);
      if (Number.isInteger(runde) && runde >= 1 && runde <= 999 && runde !== S.gjest.runde) {
        S.gjest.runde = runde;
        S.gjest.kryss = [];
      }
      R.holdVaken();
      return S.gjest.plass == null ? "plass" : "gjest";
    },

    vedSpillere(S) {
      if (S.oppsett.spioner > maksSpioner(S.antall)) S.oppsett.spioner = 1;
    },

    felt: {
      kode(S, el) {
        S.kodeUtkast = R.kutt(el.value, 20);
      },
    },

    skjema: {
      kode(S, form) {
        const felt = form.querySelector("#kodefelt");
        const o = lesKode(felt.value);
        if (!o) {
          S.kodeUtkast = R.kutt(felt.value, 20);
          S.kodeFeil = kodeFeil(felt.value);
          R.vis();
          const nytt = R.$("#kodefelt");
          if (nytt) {
            nytt.classList.add("risting");
            nytt.focus();
          }
          R.lyd.feil();
          R.vibrer(120);
          return;
        }
        S.kodeUtkast = "";
        S.kodeFeil = "";
        if (erVertFor(S, o.kode)) {
          R.gaTil(S.spill.skjerm);
          R.toast(R.t("Du er verten i dette spillet"));
          return;
        }
        if (!S.gjest || S.gjest.kode !== o.kode) S.gjest = Object.assign(o, { runde: 1, plass: laastPlass(S, o.kode), kryss: [] });
        R.lyd.riktig();
        R.holdVaken();
        R.gaTil(S.gjest.plass == null ? "plass" : "gjest");
      },
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const besokt = besokte().size;
          // The first chip opens «Stedspasset» (the kit's own chips are plain text, hence the markup here).
          return `${R.ui.spillhjem({
            slagordHtml: `${esc(R.t("Alle vet hvor dere er."))}<br><em>${esc(R.t("Bortsett fra spionen."))}</em>`,
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: pagar(S) ? R.t("Fortsett · runde {n}", { n: S.spill.runde }) : "",
              ekstraHtml:
                (S.gjest && S.gjest.plass != null ? R.ui.knapp2(R.t("Tilbake til kortet ditt · nr. {n}", { n: S.gjest.plass + 1 }), "til-gjest") : "") +
                R.ui.knapp2(R.t("Bli med i et spill"), "bli-med", { ikon: "📲" }) +
                R.ui.lenke(R.t("Slik spiller du"), "regler"),
            }),
          })}
          <ul class="merker" aria-label="${esc(R.t("Om spillet"))}">
            <li class="sp-passmerke"><button data-h="pass" aria-label="${esc(R.t("Stedspasset: {n} av {av} steder besøkt", { n: besokt, av: STEDER.length }))}"><b>${
              besokt ? esc(R.t("{n} av {av}", { n: besokt, av: STEDER.length })) : STEDER.length
            }</b> ${esc(R.t("steder"))} <span aria-hidden="true">›</span></button></li>
            <li><b>3–12</b> ${esc(R.t("spillere"))}</li>
            <li><b>0</b> ${esc(R.t("reklame"))}</li>
          </ul>`;
        },
      },

      oppsett: {
        tittel: R.t("Nytt spill"),
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          const maks = maksSpioner(S.antall);
          const hver = o.modus === "hver";
          const tid = minutter(S);
          const lengde = o.runder ? R.t("ca. {n} min", { n: Math.round((o.runder * (tid + 2)) / 5) * 5 }) : R.t("til dere avslutter");
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
            <section class="seksjon">
              <h2>${esc(R.t("Hvordan spiller dere?"))}</h2>
              ${R.ui.fliser(
                "modus",
                [
                  { v: "en", tittel: R.t("Én mobil"), tekst: R.t("Send den rundt bordet"), ikon: "📱" },
                  { v: "hver", tittel: R.t("Hver sin mobil"), tekst: R.t("Alle ser kortet på sin egen mobil"), ikon: "📲" },
                ],
                o.modus,
              )}
            </section>
            ${R.ui.spillere({
              min: MIN,
              max: MAKS,
              hjelp:
                S.antall === MIN
                  ? R.t("Tre går fint – men spillet er best fra fire.")
                  : hver
                    ? R.t("Navnene trengs bare på denne mobilen. De andre velger nummeret sitt.")
                    : R.t("Skriv navn – eller spill som Spiller 1, 2, 3 …"),
            })}
            <section class="seksjon">
              <div class="seksjon-hode"><h2>${esc(R.t("Steder"))}</h2><span class="tall">${esc(R.t("{n} steder", { n: utvalg(o.pakker).length }))}</span></div>
              <div class="sp-pakker${PAKKER.length % 2 ? " odde" : ""}">${R.ui.fliser(
                "pakke",
                pakkerekke().map((p) => ({ v: p.id, tittel: p.navn, tekst: p.tekst, ikon: p.ikon })),
                o.pakker,
              )}</div>
              ${o.pakker.length ? "" : `<p class="hjelp">${esc(R.t("Velg minst én pakke."))}</p>`}
            </section>
            <section class="seksjon">
              <div class="seksjon-hode"><h2>${esc(R.t("Antall runder"))}</h2><span class="tall">${esc(lengde)}</span></div>
              ${R.ui.seg("runder", [[3, "3"], [5, "5"], [0, R.t("Fri")]], o.runder, { etikett: R.t("Antall runder") })}
            </section>
            <div class="sp-to">
              <section class="seksjon">
                <h2>${esc(R.t("Spioner"))}</h2>
                ${R.ui.seg("spioner", [[1, "1"], [2, "2"]], Math.min(o.spioner, maks), { etikett: R.t("Antall spioner"), av: (v) => Number(v) > maks })}
              </section>
              <section class="seksjon">
                <h2>${esc(R.t("Minutter"))}</h2>
                ${R.ui.seg("tid", TIDER.map((t) => [t, String(t)]), tid, { etikett: R.t("Minutter per runde") })}
              </section>
            </div>
            <p class="hjelp">${esc(maks < 2 ? R.t("2 spioner kan velges fra 7 spillere.") : R.t("Med 2 spioner vet ingen av dem hvem den andre er."))}</p>
            ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start", { av: !o.pakker.length }))}`;
        },
      },

      // One phone: the phone goes around, everyone holds to see their card.
      vis: {
        tittel: (S) => rundeTittel(S.spill),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const i = sp.vis.i;
          const siste = i === sp.antall - 1;
          return `
            ${R.ui.fremdrift(sp.antall, i)}
            <div class="sp-mottaker">
              <p class="etikett">${esc(R.t("Gi mobilen til"))}</p>
              <h1 id="skjerm-tittel" class="spillernavn ${navnKlasse(R.navn(i))}">${R.avatar(i, "stor")}<span>${esc(R.navn(i))}</span></h1>
            </div>
            ${R.ui.mappe({ id: "p" + i, etikett: R.t("Topphemmelig"), tekst: HOLD, etikettAria: R.t("Hold fingeren på kortet for å se kortet til {navn}", { navn: R.navn(i) }) })}
            <p class="hjelp">${esc(sp.vis.sett ? R.t("Husket stedet og rollen? Trykk «Ferdig» og gi mobilen videre.") : R.t("Bare {navn} skal se. Slipp, så skjules kortet igjen.", { navn: R.navn(i) }))}</p>
            ${R.ui.dokk(R.ui.knapp(siste ? R.t("Alle har sett – start!") : "", "vist", { av: !sp.vis.sett, tekstHtml: siste ? "" : ferdigKnapp(R.navn(i + 1)) }))}`;
        },
      },

      // Each on their own phone, step 1: share the code.
      kode: {
        tittel: R.t("Del koden"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const lenke = lenkeFor(sp);
          const qr = /^https?:$/.test(location.protocol) ? R.kode.qr(lenke) : "";
          const forste = sp.runde === 1;
          return `
            ${piller([R.flertall(sp.antall, "spiller", "spillere"), spionTekst(sp.spioner), R.t("{n} steder", { n: utvalg(sp.pakker).length })])}
            <h1 id="skjerm-tittel">${esc(R.t("Del koden med de andre"))}</h1>
            <div class="kodekort">
              <span class="etikett">${esc(R.t("Koden til spillet"))}</span>
              <span class="kode" id="spillkode">${esc(R.kode.formater(sp.kode))}</span>
              ${qr ? `<div class="qr">${qr}</div>` : ""}
              <div class="knapprad">${R.ui.knapp2(R.t("Kopier kode"), "kopier", { variant: "liten" })}${R.ui.knapp2(R.t("Del lenke"), "del-lenke", { variant: "liten" })}</div>
            </div>
            ${
              forste
                ? `<ol class="steg sp-slik">
                    <li><b>${esc(R.t("Skann QR-koden med kameraet"))}</b><span>${esc(R.t("Eller åpne Spionen, trykk «Bli med i et spill» og skriv koden."))}</span></li>
                    <li><b>${esc(R.t("Velg nummeret ditt"))}</b><span>${esc(R.t("Nummeret står ved navnet ditt på neste skjerm her."))}</span></li>
                  </ol>`
                : `<p class="hjelp">${esc(R.t("QR-koden går rett til runde {n}. Skriver noen koden, trykker de «Til runde …» til de er på runde {n}.", { n: sp.runde }))}</p>`
            }
            ${R.ui.dokk(R.ui.knapp(forste ? R.t("Alle har koden – videre") : R.t("Tilbake til runden"), "til-vert"))}`;
        },
      },

      // Each on their own phone, step 2: the host picks a seat and sees their own card.
      vert: {
        tittel: (S) => rundeTittel(S.spill),
        tilbake: (S) => (S.spill.runde === 1 ? "kode" : "hjem"),
        vis(S) {
          const sp = S.spill;
          const forste = sp.runde === 1;
          const plasser = `<section class="seksjon" id="vert-plasser">
              <div class="seksjon-hode"><h2>${esc(forste ? R.t("Trykk på deg selv") : R.t("Nummerne"))}</h2><span class="tall">${esc(R.flertall(sp.antall, "spiller", "spillere"))}</span></div>
              <div class="sp-plasser liste">${range(sp.antall)
                .map(
                  (i) =>
                    `<button class="sp-plass" data-h="vert-plass" data-v="${i}" aria-pressed="${sp.vertPlass === i}"${sp.vertLaast && sp.vertPlass !== i ? " disabled" : ""}>${R.avatar(i)}<b>${i + 1}</b><span>${esc(R.navn(i))}</span></button>`,
                )
                .join("")}</div>
            </section>`;
          const kort =
            sp.vertPlass != null
              ? `<section class="seksjon" id="vertskort">
                  <h2>${esc(R.t("Kortet ditt"))}</h2>
                  ${R.ui.mappe({ id: "vert", etikett: R.t("Nr. {n} · topphemmelig", { n: sp.vertPlass + 1 }), tekst: HOLD })}
                  <p class="hjelp">${esc(R.t("De andre ser kortet sitt på sin egen mobil."))}</p>
                </section>`
              : "";
          const knapp = sp.vertPlass == null ? R.t("Velg nummeret ditt først") : !sp.vertSett ? R.t("Se kortet ditt først") : R.t("Alle har sett kortet – start!");
          return `
            <h1 id="skjerm-tittel">${esc(forste ? R.t("Hvem er du?") : R.t("Runde {n}", { n: sp.runde }))}</h1>
            <p class="ingress">${esc(
              forste ? R.t("Finn navnet ditt. Nummeret ved navnet er det de andre velger på mobilen sin.") : R.t("Alle trykker «Til runde {n}» på mobilen sin og ser det nye kortet.", { n: sp.runde }),
            )}</p>
            ${forste ? plasser + kort : kort + plasser}
            ${R.ui.lenke(R.t("Vis koden igjen"), "vis-kode")}
            ${R.ui.dokk(R.ui.knapp(knapp, "start-klokka", { av: !sp.vertSett }))}`;
        },
      },

      // The round: the clock, who asks first, a question to borrow — and every possible place in
      // the open, so the spy can study the list without giving anything away.
      runde: {
        tittel: R.t("Still spørsmål"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const k = sp.klokke;
          const hode = sp.tidUte
            ? `<p class="sp-tid-ute"><span aria-hidden="true">⏰</span> ${esc(R.t("Tiden er ute!"))}</p>
               <p class="sp-topp-hjelp">${esc(R.t("Pek på den dere mistenker – eller gi dere ett minutt til."))}</p>`
            : `<p class="sp-status"><span class="sp-rundemerke">${esc(rundeTittel(sp))}</span><span>${esc(spionTekst(sp.r.spioner.length))}</span></p>
               <p class="sp-starter-navn">${esc(R.t("{navn} spør først!")).replace("{navn}", () => `<b>${esc(R.navn(sp.r.starter))}</b>`)}</p>`;
          return `
            <h1 class="vh" id="skjerm-tittel">${esc(R.t("{runde}: still spørsmål", { runde: rundeTittel(sp) }))}</h1>
            <div class="sp-topp">
              ${R.ui.timer({ id: "klokke", sekunder: Math.ceil(igjenMs(k) / 1000), alene: true })}
              <div class="sp-topp-tekst">
                ${hode}
                <div class="sp-klokkeknapper">
                  ${sp.tidUte ? "" : `<button class="knapp-2 liten" data-h="pause" id="pauseknapp">${esc(k.gaar ? R.t("Pause") : R.t("Fortsett"))}</button>`}
                  ${R.ui.knapp2("+1 min", "pluss-min", { variant: "liten" })}
                </div>
              </div>
            </div>
            <div class="sp-forslag">
              <p class="etikett">${esc(R.t("Spør for eksempel"))}</p>
              <p class="sp-forslag-tekst" id="sp-forslag" aria-live="polite">${esc(R.t("«{tekst}»", { tekst: SPORSMAL[sp.sporsmal] }))}</p>
              <button class="sp-nytt" data-h="nytt-forslag" aria-label="${esc(R.t("Nytt forslag til spørsmål"))}"><span aria-hidden="true">↻</span> ${esc(R.t("Nytt"))}</button>
            </div>
            <section class="sp-apent" id="sp-apent" tabindex="0" aria-label="${esc(R.t("Mulige steder"))}">
              <p class="hjelp">${esc(R.t("Dere er på ett av disse {n} stedene.", { n: utvalg(sp.pakker).length }))}</p>
              ${stedListe(sp.pakker, { nivaa: 2 })}
              ${R.ui.lenkerad(R.ui.lenke(R.t("Spørsmålsideer"), "ide"), R.ui.lenke(R.t("Avslutt"), "avslutt"))}
            </section>
            ${R.ui.dokk(
              R.ui.knapp(sp.tidUte ? R.t("Hvem er spionen?") : R.t("Stopp – vi anklager noen!"), "anklag", { variant: "rosa" }),
              `<div class="knapprad">${R.ui.knapp2(R.t("Glemt kortet?"), "se-igjen")}${R.ui.knapp2(R.t("Spionen gjetter"), "spion-gjetter")}</div>`,
            )}`;
        },
        inn: (S) => startKlokke(S),
        ut(S) {
          stoppKlokke(S);
          stedrull = 0;
        },
        etter(S, rot) {
          const t = R.timer("klokke");
          if (t) t.tegn();
          const liste = rot.querySelector("#sp-apent");
          if (!liste) return;
          liste.scrollTop = stedrull;
          liste.addEventListener("scroll", () => (stedrull = liste.scrollTop), { passive: true });
        },
      },

      anklage: {
        tittel: R.t("Anklage"),
        tilbake: (S) => (S.spill.tidUte ? "hjem" : "runde"),
        vis(S) {
          const sp = S.spill;
          const valgt = sp.anklaget;
          return `
            ${sp.tidUte ? `<p class="sp-tid-ute"><span aria-hidden="true">⏰</span> ${esc(R.t("Tiden er ute!"))}</p>` : ""}
            <h1 id="skjerm-tittel">${esc(R.t("Hvem er spionen?"))}</h1>
            <p class="ingress">${esc(R.t("Tell ned – og pek samtidig på den dere mistenker. Den som får flest fingrer, blir anklaget."))}</p>
            ${R.ui.knapp2(R.t("3 · 2 · 1 – Pek!"), "pek", { ikon: "👉" })}
            <section class="seksjon">
              <h2>${esc(R.t("Hvem fikk flest fingrer?"))}</h2>
              ${R.ui.velgere("anklaget", range(sp.antall), valgt)}
            </section>
            ${
              sp.tidUte
                ? R.ui.lenke(R.t("Vi ble ikke enige – spionen slipper unna"), "uenige")
                : R.ui.lenke(R.t("Ikke enige ennå? Spill videre"), "spill-videre")
            }
            ${R.ui.dokk(R.ui.knapp(valgt != null ? R.t("Avslør {navn}", { navn: R.navn(valgt) }) : R.t("Velg hvem dere anklager"), "avslor", { variant: "rosa", av: valgt == null }))}`;
        },
      },

      avslor: {
        tittel: R.t("Avsløringen"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const a = sp.anklaget;
          const spion = erSpion(sp.r, a);
          const flere = sp.r.spioner.length > 1;
          let tekst = "";
          let dokk = "";
          if (sp.avslort && spion) {
            tekst = `<p class="ingress midt"><b>${esc(R.t("Men vent …"))}</b> ${esc(R.t("Spionen får én sjanse til. Gjetter {navn} stedet, vinner spionen likevel.", { navn: R.navn(a) }))}</p>`;
            dokk = R.ui.knapp(R.t("Gi mobilen til {navn}", { navn: R.navn(a) }), "til-gjett");
          } else if (sp.avslort) {
            const andre = sp.r.spioner;
            tekst = `<div class="papirboks sp-fasit"><span class="etikett">${esc(flere ? R.t("Spionene var") : R.t("Spionen var"))}</span>${navnerad(andre)}</div>`;
            dokk = R.ui.knapp(R.t("Se poengene"), "uskyldig");
          }
          const navnA = R.navn(a);
          const overskrift = sp.avslort
            ? spion
              ? flere
                ? R.t("{navn} er en spion!", { navn: navnA })
                : R.t("{navn} er spionen!", { navn: navnA })
              : R.t("{navn} er ikke spionen!", { navn: navnA })
            : flere
              ? R.t("Er {navn} en spion …?", { navn: navnA })
              : R.t("Er {navn} spionen …?", { navn: navnA });
          return `
            <div class="sp-spotlys${sp.avslort ? "" : " spenning"}">
              <span class="sp-skjelv">${R.avatar(a, "gigant")}</span>
              <h1 id="skjerm-tittel">${esc(overskrift)}</h1>
              <div class="stempel-sted">${sp.avslort ? (spion ? `<span class="stempel">${esc(R.t("Avslørt!"))}</span>` : `<span class="stempel mynte">${esc(R.t("Uskyldig"))}</span>`) : ""}</div>
            </div>
            ${tekst}
            ${dokk ? R.ui.dokk(dokk) : ""}`;
        },
        inn(S) {
          if (S.spill.avslort) return;
          R.lyd.trommevirvel(R.rolig() ? 0.6 : 2);
          const id = setTimeout(
            () => {
              const sp = S.spill;
              sp.avslort = true;
              R.vis();
              if (erSpion(sp.r, sp.anklaget)) {
                R.lyd.fanfare();
                R.vibrer([60, 30, 120]);
              } else {
                R.lyd.feil();
                R.vibrer([200]);
              }
              const el = R.$("#skjerm");
              el.classList.remove("risting");
              void el.offsetWidth;
              el.classList.add("risting");
            },
            R.rolig() ? 700 : 2150,
          );
          R.vedForlat(() => clearTimeout(id));
        },
      },

      // The spy's guess: the same list, in the same order, as on the play screen.
      gjett: {
        tittel: R.t("Spionen gjetter"),
        tilbake: (S) => (S.spill.gjetter === "frivillig" ? "runde" : "hjem"),
        vis(S) {
          const sp = S.spill;
          return `
            <div class="sp-gjett-topp">
              ${R.figur()}
              <div>
                <h1 id="skjerm-tittel">${esc(R.t("Hvor er dere?"))}</h1>
                <p class="ingress">${esc(sp.gjetter === "tatt" && sp.anklaget != null ? R.t("{navn} velger ett sted.", { navn: R.navn(sp.anklaget) }) : R.t("Spionen velger ett sted."))} ${esc(R.t("Riktig svar gir seier – feil svar gir tap."))}</p>
              </div>
            </div>
            ${stedListe(sp.pakker, { h: "gjett-sted", nivaa: 2 })}`;
        },
      },

      svar: {
        tittel: R.t("Spionens svar"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const g = STEDER[sp.gjett];
          const fasit = STEDER[sp.r.sted];
          const riktig = sp.gjett === sp.r.sted;
          return `
            <div class="sp-spotlys${sp.svart ? "" : " spenning"}">
              <p class="etikett">${esc(R.t("Spionen gjetter"))}</p>
              <div class="sp-gjettkort"><span aria-hidden="true">${esc(g.ikon)}</span><b>${esc(g.navn)}</b></div>
              <h1 id="skjerm-tittel">${esc(sp.svart ? (riktig ? R.t("Spionen gjettet riktig!") : R.t("Spionen gjettet feil!")) : R.t("Er det riktig …?"))}</h1>
              <div class="stempel-sted">${sp.svart ? (riktig ? `<span class="stempel">${esc(R.t("Riktig!"))}</span>` : `<span class="stempel mynte">${esc(R.t("Bom!"))}</span>`) : ""}</div>
            </div>
            ${
              sp.svart
                ? `<div class="papirboks sp-fasit"><span class="etikett">${esc(R.t("Stedet var"))}</span><strong>${esc(fasit.ikon)} ${esc(fasit.navn)}</strong></div>
                   ${R.ui.dokk(R.ui.knapp(R.t("Se poengene"), "se-poeng"))}`
                : ""
            }`;
        },
        inn(S) {
          if (S.spill.svart) return;
          R.lyd.trommevirvel(R.rolig() ? 0.6 : 1.8);
          const id = setTimeout(
            () => {
              const sp = S.spill;
              sp.svart = true;
              R.vis();
              if (sp.gjett === sp.r.sted) {
                R.lyd.latter();
                R.vibrer([60, 30, 120]);
              } else {
                R.lyd.fanfare();
                R.vibrer([200]);
              }
            },
            R.rolig() ? 700 : 1950,
          );
          R.vedForlat(() => clearTimeout(id));
        },
      },

      resultat: {
        tittel: (S) => rundeTittel(S.spill),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const u = sp.utfall;
          const flere = sp.r.spioner.length > 1;
          const fasit = STEDER[sp.r.sted];
          const siste = sisteRunde(sp);
          const rader = range(sp.antall).map((i) => ({ i, poeng: sp.poeng[i], pluss: u.pluss[i] + (u.stoppet === i ? 1 : 0) }));
          const roller = range(sp.antall)
            .map(
              (i) => `<li class="${erSpion(sp.r, i) ? "spion" : ""}">${R.avatar(i)}<span><b>${esc(R.navn(i))}</b>${
                erSpion(sp.r, i) ? `🕵️ ${esc(R.t("Spionen"))}` : esc(rolleFor(sp.r, i))
              }</span></li>`,
            )
            .join("");
          // One tap gives the accuser's extra point; another tap (or «Ingen bestemt») takes it back.
          const stopp = kanStoppe(sp)
            ? `<div class="sp-stopp">
                <h3 id="stopp-tittel">${esc(R.t("Hvem ropte stopp?"))}</h3>
                <p>${esc(R.t("Den som anklaget spionen, får 1 poeng ekstra."))}</p>
                <div class="velgere" role="group" aria-labelledby="stopp-tittel">
                  ${range(sp.antall)
                    .filter((i) => i !== sp.anklaget)
                    .map((i) => `<button class="velger" data-h="stoppet" data-v="${i}" aria-pressed="${u.stoppet === i}">${R.avatar(i)}<span>${esc(R.navn(i))}</span></button>`)
                    .join("")}
                  <button class="velger sp-ingen" data-h="stoppet" data-v="ingen" aria-pressed="${u.stoppet == null}"><span>${esc(R.t("Ingen bestemt"))}</span></button>
                </div>
              </div>`
            : "";
          const regel = u.modig
            ? R.t("Modig spion: 3 poeng for å stoppe klokka selv og gjette riktig.")
            : u.spionVant
              ? flere
                ? R.t("2 poeng til hver spion.")
                : R.t("2 poeng til spionen.")
              : R.t("1 poeng til alle som ikke var spion.");
          return `
            ${R.ui.banner({
              tittel: u.modig ? R.t("Modig spion!") : u.spionVant ? (flere ? R.t("Spionene vinner!") : R.t("Spionen vinner!")) : flere ? R.t("Dere slo spionene!") : R.t("Dere tok spionen!"),
              tekst: grunnTekst(sp),
              klasse: u.spionVant ? "rosa" : "mynte",
              stemning: u.spionVant ? "jubel" : "lei",
            })}
            <div class="papirboks sp-fasit">
              <div><span class="etikett">${esc(R.t("Stedet var"))}</span><strong>${esc(fasit.ikon)} ${esc(fasit.navn)}</strong></div>
              <div><span class="etikett">${esc(flere ? R.t("Spionene var") : R.t("Spionen var"))}</span>${navnerad(sp.r.spioner)}</div>
            </div>
            <section class="seksjon">
              <div class="seksjon-hode"><h2>${esc(R.t("Poeng"))}</h2><span class="tall">${esc(R.t("etter {runder}", { runder: R.flertall(sp.spilt, "runde", "runder") }))}</span></div>
              ${stopp}
              ${R.ui.poengliste(rader)}
              <p class="hjelp">${regel}</p>
            </section>
            <section class="seksjon">
              <h2>${esc(R.t("Hvem var hvem?"))}</h2>
              <ul class="sp-rolleliste">${roller}</ul>
            </section>
            ${R.ui.dokk(
              siste ? R.ui.knapp(R.t("Til kåringen"), "til-slutt") : R.ui.knapp(R.t("Ny runde"), "ny-runde"),
              R.ui.lenkerad(R.ui.lenke(R.t("Angre poengene"), "angre-poeng"), siste ? "" : R.ui.lenke(R.t("Avslutt"), "avslutt")),
            )}`;
        },
        // One round is a small win: a short sound. The fanfare and confetti are saved for the end.
        inn(S) {
          const sp = S.spill;
          if (sp.feiret) return;
          sp.feiret = true;
          R.lagre();
          if (sp.utfall.spionVant) R.lyd.latter();
          else R.lyd.riktig();
        },
      },

      slutt: {
        tittel: R.t("Kåringen"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const rader = rangering(sp);
          const vinnere = rader.filter((r) => r.plass === 1 && r.poeng > 0);
          // Did the rounds won as spy decide who is on top?
          const avgjort = vinnere.length > 0 && rader.some((r) => r.plass > 1 && r.poeng === vinnere[0].poeng);
          const utmerkelser = priser(sp);
          const besokt = besokte().size;
          return `
            ${R.ui.banner({
              etikett: sp.spilt ? R.t("Etter {runder}", { runder: R.flertall(sp.spilt, "runde", "runder") }) : "",
              tittel: vinnere.length ? R.t("{navn} vinner!|{navn} vinner!", { navn: R.ramsOpp(vinnere.map((r) => R.navn(r.i))), n: vinnere.length }) : R.t("Ingen poeng denne gangen"),
              tekst: !sp.spilt ? R.t("Dere avsluttet før første runde var ferdig.") : avgjort ? R.t("Likt på poeng – flest runder vunnet som spion avgjorde.") : "",
              klasse: "aksent",
              stemning: vinnere.length ? "jubel" : "",
            })}
            ${pall(rader)}
            ${sluttliste(rader)}
            ${
              utmerkelser.length
                ? `<section class="seksjon">
                    <h2>${esc(R.t("Kveldens agenter"))}</h2>
                    <ul class="sp-priser">${utmerkelser
                      .map(
                        (p) =>
                          `<li><span class="sp-pris-ikon" aria-hidden="true">${p.ikon}</span><span><b>${esc(p.tittel)}</b><strong>${esc(R.ramsOpp(p.hvem.map(R.navn)))}</strong><small>${esc(p.tekst)}</small></span></li>`,
                      )
                      .join("")}</ul>
                  </section>`
                : ""
            }
            ${sp.spilt ? R.ui.knapp2(R.t("Del resultatet"), "del") : ""}
            ${besokt ? R.ui.lenke(R.t("Stedspasset: {n} av {av} steder", { n: besokt, av: STEDER.length }), "pass") : ""}
            ${R.ui.flereSpill({ antall: sp.antall })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen"), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "nytt"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
        },
        // The first time «Kåringen» is shown the game is over: the result goes to «Kveldens gjeng»
        // once (not again after a reload or a visit to the home screen).
        inn(S) {
          const sp = S.spill;
          if (sp.ferdig) return;
          sp.ferdig = true;
          R.lagre();
          R.slippVaken();
          R.statistikk("ferdig", { runder: sp.spilt, avbrutt: !!sp.runder && sp.spilt < sp.runder });
          if (sp.spilt) {
            // Points decide the evening's places too, with the same tie-break as on the screen.
            R.kveld.registrer(rangering(sp).map((r) => ({ i: r.i, poeng: r.poeng * 100 + r.seire })));
          }
          if (Math.max(...sp.poeng) > 0) {
            R.lyd.fanfare();
            R.konfetti();
          }
        },
      },

      // ----- Joining a game on your own phone -----

      "bli-med": {
        tittel: R.t("Bli med"),
        tilbake: "hjem",
        vis: (S) => `
          <h1 id="skjerm-tittel">${esc(R.t("Bli med i et spill"))}</h1>
          <p class="ingress">${esc(R.t("Skriv koden fra mobilen til den som startet spillet – eller skann QR-koden med kameraet."))}</p>
          <form class="seksjon sp-kodeskjema" data-skjema="kode" autocomplete="off" novalidate>
            <label class="vh" for="kodefelt">${esc(R.t("Spillkode"))}</label>
            <input class="kodefelt" id="kodefelt" data-felt="kode" name="kode" inputmode="text" autocapitalize="characters" autocorrect="off" spellcheck="false" maxlength="20" placeholder="${esc(
              R.kode.formater("ABCDEFGHJKMNPQRS".slice(0, KODELENGDE)),
            )}" value="${esc(S.kodeUtkast || "")}">
            <p class="feil" id="kodefeil" role="alert">${esc(S.kodeFeil || "")}</p>
            ${R.ui.dokk(`<button class="knapp" type="submit">${esc(R.t("Bli med"))}</button>`)}
          </form>`,
      },

      plass: {
        tittel: R.t("Bli med"),
        tilbake: "hjem",
        vis(S) {
          const g = S.gjest;
          return `
            ${piller([R.flertall(g.antall, "spiller", "spillere"), spionTekst(g.spioner), R.t("{n} steder", { n: utvalg(g.pakker).length })])}
            <h1 id="skjerm-tittel">${esc(R.t("Hvilket nummer er du?"))}</h1>
            <p class="ingress">${esc(R.t("Se på mobilen til den som laget koden. Nummeret ditt står ved navnet ditt."))}</p>
            <div class="sp-plasser stor">${range(g.antall)
              .map((i) => `<button class="sp-plass" data-h="gjest-plass" data-v="${i}" aria-pressed="${g.plass === i}" aria-label="${esc(R.t("Nummer {n}", { n: i + 1 }))}">${R.avatar(i)}<b>${i + 1}</b></button>`)
              .join("")}</div>
            <p class="hjelp">${esc(R.t("Ett nummer per person. Nummeret låses når du har sett kortet ditt."))}</p>`;
        },
      },

      gjest: {
        tittel: (S) => R.t("Runde {n}", { n: S.gjest.runde }),
        tilbake: "hjem",
        vis(S) {
          const g = S.gjest;
          const r = lagRunde(g, g.runde);
          return `
            ${piller([R.flertall(g.antall, "spiller", "spillere"), spionTekst(g.spioner), R.t("{n} steder", { n: utvalg(g.pakker).length })])}
            <h1 id="skjerm-tittel" class="sp-du-er">${R.avatar(g.plass, "mid")}<span>${esc(R.t("Du er nr. {n}", { n: g.plass + 1 }))}</span></h1>
            ${R.ui.mappe({ id: "gjest", etikett: R.t("Runde {n} · topphemmelig", { n: g.runde }), tekst: HOLD })}
            <p class="hjelp">${esc(R.t("{nr} spør først.")).replace("{nr}", () => `<b>${esc(R.t("Nr. {n}", { n: r.starter + 1 }))}</b>`)}</p>
            ${R.ui.lenkerad(
              R.ui.lenke(R.t("Spørsmålsideer"), "ide"),
              laastPlass(S, g.kode) == null ? R.ui.lenke(R.t("Bytt nummer"), "bytt-plass") : "",
              g.runde > 1 ? R.ui.lenke(R.t("Tilbake til runde {n}", { n: g.runde - 1 }), "gjest-forrige") : "",
              R.ui.lenke(R.t("Forlat spillet"), "forlat"),
            )}
            ${R.ui.dokk(R.ui.knapp(R.t("Steder"), "steder"), R.ui.knapp2(R.t("Til runde {n}", { n: g.runde + 1 }), "gjest-neste", { variant: "liten" }))}`;
        },
      },
    },

    handlinger: (H = {
      async nytt(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(pagar(S))) || !fortsatt()) return;
        S.spill = null;
        R.slippVaken();
        R.gaTil("oppsett");
      },
      hjem: () => R.gaTil("hjem"),
      fortsett: (el, e, S) => R.gaTil(S.spill.skjerm),
      "til-gjest": () => R.gaTil("gjest"),
      "bli-med"(el, e, S) {
        S.kodeFeil = "";
        R.gaTil("bli-med");
        const felt = R.$("#kodefelt");
        if (felt) felt.focus();
      },
      pass: () => visPass(),

      // Setup
      modus(el, e, S) {
        S.oppsett.modus = el.dataset.v;
        R.vis();
      },
      pakke(el, e, S) {
        const id = el.dataset.v;
        const liste = S.oppsett.pakker;
        S.oppsett.pakker = liste.includes(id) ? liste.filter((x) => x !== id) : [...liste, id];
        R.vis();
      },
      spioner(el, e, S) {
        S.oppsett.spioner = Number(el.dataset.v);
        R.vis();
      },
      // From the first tap the minutes are the players' own choice and no longer follow the group.
      tid(el, e, S) {
        S.oppsett.tid = Number(el.dataset.v);
        S.oppsett.tidValgt = true;
        R.vis();
      },
      runder(el, e, S) {
        S.oppsett.runder = Number(el.dataset.v);
        R.vis();
      },
      start(el, e, S) {
        if (!S.oppsett.pakker.length) return;
        startSpill(S);
      },

      // One phone: next player
      vist(el, e, S) {
        const sp = S.spill;
        if (!sp.vis.sett) return;
        if (sp.vis.i < sp.antall - 1) {
          sp.vis = { i: sp.vis.i + 1, sett: false };
          R.lyd.pop();
          R.gaTil("vis");
        } else {
          startRunde(S);
        }
      },

      // Own phones: the host
      "vert-plass"(el, e, S) {
        const ny = Number(el.dataset.v);
        if (S.spill.vertLaast && S.spill.vertPlass !== ny) return R.toast(R.t("Nummeret er låst når du har sett kortet"));
        S.spill.vertPlass = ny;
        S.spill.vertSett = false;
        R.vis();
        const kort = R.$("#vertskort");
        if (kort) kort.scrollIntoView({ behavior: R.rolig() ? "auto" : "smooth", block: "center" });
      },
      "start-klokka"(el, e, S) {
        if (S.spill.vertSett) startRunde(S);
      },
      "til-vert": () => R.gaTil("vert"),
      "vis-kode": () => R.gaTil("kode"),
      kopier: (el, e, S) => R.kopier(R.kode.formater(S.spill.kode)),
      "del-lenke": (el, e, S) => R.del(R.t("Spionen"), R.t("Bli med i Spionen! Koden er {kode}.", { kode: R.kode.formater(S.spill.kode) }), lenkeFor(S.spill)),

      // Play
      pause(el, e, S) {
        const k = S.spill.klokke;
        const t = R.timer("klokke");
        avbrytHopp(); // staying put: no jump to the accusation
        if (k.gaar) {
          k.igjen = igjenMs(k);
          k.slutt = null;
          k.gaar = false;
          if (t) t.pause();
        } else if (k.igjen > 0) {
          k.gaar = true;
          k.slutt = Date.now() + k.igjen;
          if (t) t.start();
        }
        const knapp = R.$("#pauseknapp");
        if (knapp) knapp.textContent = k.gaar ? R.t("Pause") : R.t("Fortsett");
        R.lagre();
      },
      "pluss-min"(el, e, S) {
        const sp = S.spill;
        const k = sp.klokke;
        avbrytHopp();
        k.total += 60;
        if (sp.tidUte) {
          // Time had run out: one more minute, and the clock runs again.
          sp.tidUte = false;
          k.igjen = 60000;
          k.slutt = Date.now() + 60000;
          k.gaar = true;
          R.gaTil("runde");
        } else {
          if (k.slutt) k.slutt += 60000;
          else k.igjen += 60000;
          const t = R.timer("klokke");
          if (t) {
            t.leggTil(60);
            t.total = k.total;
            t.tegn();
          }
          R.lagre();
        }
      },
      // Another question on the table. Drawn in place: a redraw would scroll the list of places.
      "nytt-forslag"(el, e, S) {
        S.spill.sporsmal = nesteSporsmal();
        const p = R.$("#sp-forslag");
        if (p) {
          p.textContent = R.t("«{tekst}»", { tekst: SPORSMAL[S.spill.sporsmal] });
          p.classList.remove("ny");
          void p.offsetWidth;
          p.classList.add("ny");
        }
        R.lagre();
      },
      steder: (el, e, S) => visSteder(S),
      ide: () => visIdeer(),
      async "se-igjen"(el, e, S) {
        const sp = S.spill;
        let i = sp.vertPlass;
        if (sp.modus === "en") {
          const fortsatt = R.vakt();
          i = await R.velgIArk(
            R.t("Hvem vil se kortet sitt?"),
            range(sp.antall).map((n) => ({ v: n, tekst: R.navn(n) })),
          );
          if (i == null || !fortsatt()) return;
        }
        if (i == null) return;
        R.ark(`
          <h2 id="ark-tittel">${esc(R.t("Kortet til {navn}", { navn: R.navn(i) }))}</h2>
          ${R.ui.mappe({ id: sp.modus === "en" ? "p" + i : "vert", etikett: R.t("Topphemmelig"), tekst: HOLD })}
          <p class="hjelp">${esc(R.t("Bare {navn} skal se. Slipp for å skjule.", { navn: R.navn(i) }))}</p>
          <button class="knapp" data-h="lukk-ark">${esc(R.t("Ferdig"))}</button>`);
      },
      anklag(el, e, S) {
        avbrytHopp();
        S.spill.anklaget = null;
        R.gaTil("anklage");
      },
      "spill-videre": () => R.gaTil("runde"),
      async pek() {
        if (!(await nedtelling(["3", "2", "1", R.t("PEK!")], 700))) return;
        R.lyd.pek();
        R.vibrer([60, 40, 120]);
      },
      anklaget(el, e, S) {
        S.spill.anklaget = Number(el.dataset.v);
        R.vis();
      },
      async uenige(el, e, S) {
        const flere = S.spill.r.spioner.length > 1;
        const tekst = flere ? R.t("Da slipper spionene unna og får 2 poeng hver.") : R.t("Da slipper spionen unna og får 2 poeng.");
        const fortsatt = R.vakt();
        if ((await R.bekreft(R.t("Ble dere ikke enige?"), tekst, flere ? R.t("Ja, spionene slapp unna") : R.t("Ja, spionen slapp unna"), R.t("Spill videre"))) && fortsatt()) {
          ferdigRunde(S, true, "uenige");
        }
      },
      avslor(el, e, S) {
        if (S.spill.anklaget == null) return;
        S.spill.avslort = false;
        R.gaTil("avslor");
      },
      "til-gjett"(el, e, S) {
        S.spill.gjetter = "tatt";
        R.gaTil("gjett");
      },
      uskyldig: (el, e, S) => ferdigRunde(S, true, "uskyldig"),
      async "spion-gjetter"(el, e, S) {
        const fortsatt = R.vakt();
        const ja = await R.bekreft(
          R.t("Er du spionen?"),
          R.t("Da stopper du klokka og gjetter stedet. Riktig svar gir deg 3 poeng. Feil svar: de andre vinner."),
          R.t("Ja, jeg vil gjette"),
          R.t("Spill videre"),
        );
        if (!ja || !fortsatt()) return;
        avbrytHopp();
        S.spill.gjetter = "frivillig";
        R.gaTil("gjett");
      },
      async "gjett-sted"(el, e, S) {
        const i = Number(el.dataset.v);
        const s = STEDER[i];
        if (!s) return;
        const fortsatt = R.vakt();
        const ja = await R.bekreft(`${s.ikon} ${rentNavn(i)}?`, R.t("Spionen har bare ett forsøk."), R.t("Ja, det er svaret"), R.t("Velg et annet"));
        if (!ja || !fortsatt()) return;
        S.spill.gjett = i;
        S.spill.svart = false;
        R.gaTil("svar");
      },
      "se-poeng"(el, e, S) {
        const sp = S.spill;
        const riktig = sp.gjett === sp.r.sted;
        ferdigRunde(S, riktig, riktig ? "gjettet" : "feilgjett");
      },
      // «Hvem ropte stopp?»: the accuser's extra point. Tapping the same name again, or «Ingen
      // bestemt», takes it back.
      stoppet(el, e, S) {
        const sp = S.spill;
        if (!kanStoppe(sp)) return;
        const valgt = el.dataset.v === "ingen" ? null : Number(el.dataset.v);
        const ny = valgt === sp.utfall.stoppet || !heltall(valgt, 0, sp.antall - 1) || valgt === sp.anklaget ? null : valgt;
        if (ny === sp.utfall.stoppet) return;
        bokfor(sp, -1);
        sp.utfall.stoppet = ny;
        bokfor(sp, 1);
        if (ny != null) R.lyd.pling();
        R.vis();
      },
      "ny-runde": (el, e, S) => nyRunde(S),
      "til-slutt": () => R.gaTil("slutt"),
      // Undo the round's points (a mis-tap) and go back to where the outcome was decided.
      "angre-poeng"(el, e, S) {
        const sp = S.spill;
        const u = sp.utfall;
        if (!u) return;
        bokfor(sp, -1);
        sp.utfall = null;
        sp.feiret = false;
        R.toast(R.t("Poengene er tatt tilbake"));
        if (u.grunn === "gjettet" || u.grunn === "feilgjett") {
          sp.gjett = null;
          sp.svart = false;
          R.gaTil("gjett");
        } else {
          sp.anklaget = null;
          sp.avslort = false;
          R.gaTil("anklage");
        }
      },
      async avslutt(el, e, S) {
        const midt = !S.spill.utfall; // in the middle of a round: it doesn't count
        const fortsatt = R.vakt();
        const ja = await R.bekreft(
          R.t("Avslutte spillet?"),
          midt ? R.t("Runden dere er i, teller ikke. Dere går til kåringen med poengene så langt.") : R.t("Dere går til kåringen med poengene så langt."),
          R.t("Avslutt"),
          R.t("Spill videre"),
        );
        if (ja && fortsatt()) R.gaTil("slutt");
      },
      igjen: (el, e, S) => startSpill(S),
      del: (el, e, S) => R.del(R.t("Spionen"), deletekst(S.spill), location.origin + R.forside + ((R.sprak !== "nb" && window.RUSJ_SPILL && window.RUSJ_SPILL.slug) || "spionen") + "/"),

      // Own phones: the guests
      "gjest-plass"(el, e, S) {
        const laast = laastPlass(S, S.gjest.kode);
        if (laast != null && laast !== Number(el.dataset.v)) return R.toast(R.t("Nummeret er låst når du har sett kortet"));
        S.gjest.plass = Number(el.dataset.v);
        S.gjest.kryss = [];
        R.lyd.pop();
        R.gaTil("gjest");
      },
      // A new round changes the card, so ask first: only the host decides when it starts.
      async "gjest-neste"(el, e, S) {
        const neste = S.gjest.runde + 1;
        const fortsatt = R.vakt();
        const ja = await R.bekreft(
          R.t("Har verten startet runde {n}?", { n: neste }),
          R.t("Trykk bare når den som laget koden har startet en ny runde. Da får du et nytt kort."),
          R.t("Ja, vis runde {n}", { n: neste }),
          R.t("Ikke ennå"),
        );
        if (!ja || !fortsatt() || !S.gjest) return;
        S.gjest.runde = Math.min(999, neste);
        S.gjest.kryss = [];
        R.lyd.pop();
        R.gaTil("gjest");
      },
      "gjest-forrige"(el, e, S) {
        S.gjest.runde = Math.max(1, S.gjest.runde - 1);
        S.gjest.kryss = [];
        R.gaTil("gjest");
      },
      "bytt-plass": (el, e, S) => (laastPlass(S, S.gjest.kode) != null ? R.toast(R.t("Nummeret er låst når du har sett kortet")) : R.gaTil("plass")),
      async forlat(el, e, S) {
        const fortsatt = R.vakt();
        if ((await R.bekreft(R.t("Forlate spillet?"), R.t("Du kan bli med igjen med den samme koden."), R.t("Forlat"), R.t("Spill videre"))) && fortsatt()) {
          S.gjest = null;
          R.slippVaken();
          R.gaTil("hjem");
        }
      },
      kryss(el, e, S) {
        const i = Number(el.dataset.v);
        const liste = S.gjest.kryss || [];
        S.gjest.kryss = liste.includes(i) ? liste.filter((x) => x !== i) : [...liste, i];
        el.setAttribute("aria-pressed", String(S.gjest.kryss.includes(i)));
        R.lagre();
      },
    }),
  };

  // Remember which game screen was open, so "Fortsett" on the home screen returns to it.
  SPILLSKJERMER.forEach((navn) => {
    const sk = DEF.skjermer[navn];
    const inn = sk.inn;
    sk.inn = (S) => {
      if (S.spill) S.spill.skjerm = navn;
      if (inn) inn(S);
    };
  });

  R.start(DEF);
})();
