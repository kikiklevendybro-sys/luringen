/* Skrønemakeren — «Finn den ekte forklaringen».
   A card shows something strange but real: a rare word, an odd fact with a blank, a place name,
   an animal, an old invention. The phone goes round: each player, alone, types a fake answer that
   sounds true. The game mixes the fakes with the real answer (identical fakes merge into one;
   a fake that IS the real answer gives its writer a bonus, and that player writes another fake and
   sits out the vote). Then the phone goes round again and everyone votes on what they think is
   true — never on their own fake. Finding the truth gives 2 points, each vote on your fake 1.
   The reveal shows the fakes one by one with who fell for them and who wrote them, the truth last.
   3, 5 or 8 rounds, then Kåringen with «Beste skrønemaker» and «Sannhetsjeger».

   Typed text lives only in the running round (S.spill.r) and is dropped when the round or the game
   ends. It is always escaped. The rules are pure functions on window.RusjSkrone, so
   test/skronemakeren.test.mjs can load this file in node:vm without the kit. */
(function () {
  "use strict";

  // ---------- Rules (no kit, no DOM) ----------

  const MAKS = 80; // characters per fake
  const SANN = 2; // points for voting on the truth
  const LURT = 1; // points per vote on your fake
  const BONUS = 3; // points for typing the real answer yourself
  const RUNDER = [3, 5, 8];
  const FASER = ["kort", "skriv", "les", "stem", "avslor", "resultat"];

  // The kit's R.normaliser, copied so the rules work without the kit: lower case, no accents
  // (æ, ø, å kept), no punctuation, single spaces.
  const normaliser = (tekst) =>
    String(tekst || "")
      .toLocaleLowerCase("nb")
      .replace(/[æøå]/g, (c) => ({ æ: "\u0001", ø: "\u0002", å: "\u0003" })[c])
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[\u0001-\u0003]/g, (c) => ({ "\u0001": "æ", "\u0002": "ø", "\u0003": "å" })[c])
      .replace(/[^a-z0-9æøå ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  // Small words that don't change what an answer means («en kjeve» = «kjeve»).
  const SMAAORD = new Set(["en", "et", "ei", "å", "den", "det", "de", "som", "noe", "noen", "slags", "type", "sorts"]);
  // The comparison key: normalised, small words out, no spaces. "" = nothing to compare.
  const nokkel = (tekst) =>
    normaliser(tekst)
      .split(" ")
      .filter((o) => o && !SMAAORD.has(o))
      .join("");

  // Fisher–Yates with a given random function.
  function stokk(liste, rng) {
    const a = liste.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const M = {
    MAKS,
    SANN,
    LURT,
    BONUS,
    RUNDER,
    FASER,
    normaliser,
    nokkel,
    // Clean a typed fake: one line, single spaces, at most MAKS characters (never half an emoji).
    rens(tekst) {
      const t = String(tekst || "")
        .replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return Array.from(t).slice(0, MAKS).join("").trim();
    },
    // Is the typed text the real answer of the card (or one of its accepted forms)?
    erSann(tekst, kort) {
      const n = nokkel(tekst);
      if (!n) return false;
      return [kort.a, ...(kort.g || [])].some((x) => nokkel(x) === n);
    },
    // A new round: everyone types in turn, starting with `forst`.
    nyRunde(antall, forst) {
      return {
        rekke: Array.from({ length: antall }, (_, k) => (forst + k) % antall),
        na: 0,
        skrevet: Array(antall).fill(null), // each player's fake
        sann: Array(antall).fill(false), // typed the real answer (bonus, sits out the vote)
        utkast: "", // what the player on the typing screen has typed so far
        valg: null, // the options: [{ t, av: [players], sann }]
        stemmer: Array(antall).fill(-1), // option per player, -1 = not voted (yet)
        srekke: null, // who votes, in order
        sna: 0,
        valgt: -1, // the option marked on the voting screen
        pluss: null, // points this round, per player
        vist: 0, // options shown on the reveal
      };
    },
    // The player on the typing screen hands in a fake. Returns "tom", "sann" (the real answer:
    // bonus, type again) or "ok".
    skriv(r, kort, tekst) {
      const i = r.rekke[r.na];
      const t = M.rens(tekst);
      if (!nokkel(t)) return "tom";
      if (M.erSann(t, kort)) {
        r.sann[i] = true;
        r.utkast = "";
        return "sann";
      }
      r.skrevet[i] = t;
      r.utkast = "";
      r.na += 1;
      return "ok";
    },
    alleHarSkrevet: (r) => r.na >= r.rekke.length,
    // Fakes that mean the same merge (the first writer's wording is shown); the truth is added and
    // everything is shuffled.
    byggValg(skrevet, sannTekst, rng) {
      const grupper = [];
      const finn = new Map();
      skrevet.forEach((t, i) => {
        if (t == null) return;
        const n = nokkel(t);
        if (finn.has(n)) grupper[finn.get(n)].av.push(i);
        else {
          finn.set(n, grupper.length);
          grupper.push({ t, av: [i], sann: false });
        }
      });
      grupper.push({ t: sannTekst, av: [], sann: true });
      return stokk(grupper, rng);
    },
    // Everyone has typed: the options and the voters (all but those who found the truth themselves).
    tilStemming(r, sannTekst, rng) {
      r.valg = M.byggValg(r.skrevet, sannTekst, rng);
      r.srekke = r.rekke.filter((i) => !r.sann[i]);
      r.sna = 0;
      r.valgt = -1;
      r.stemmer = r.stemmer.map(() => -1);
    },
    sannIndeks: (valg) => valg.findIndex((v) => v.sann),
    kanStemme: (r, i, k) => !!r.valg && Number.isInteger(k) && k >= 0 && k < r.valg.length && !r.valg[k].av.includes(i) && !r.sann[i],
    // The player whose turn it is votes. Returns false if the vote is not allowed.
    stem(r, k) {
      const i = r.srekke[r.sna];
      if (i == null || !M.kanStemme(r, i, k)) return false;
      r.stemmer[i] = k;
      r.sna += 1;
      r.valgt = -1;
      return true;
    },
    // Take back the last vote: that player votes again.
    angreStemme(r) {
      if (!r.srekke || r.sna <= 0) return false;
      r.sna -= 1;
      r.stemmer[r.srekke[r.sna]] = -1;
      r.valgt = -1;
      return true;
    },
    alleHarStemt: (r) => !!r.srekke && r.sna >= r.srekke.length,
    // Votes on option k.
    stemmerPa: (r, k) => r.stemmer.map((s, i) => (s === k ? i : -1)).filter((i) => i >= 0),
    // The round's points: { pluss, lurt (votes your fakes got), funnet (truth found: 1/0) }.
    regnUt(r) {
      const n = r.skrevet.length;
      const pluss = Array(n).fill(0);
      const lurt = Array(n).fill(0);
      const funnet = Array(n).fill(0);
      r.stemmer.forEach((k, i) => {
        if (k < 0 || !r.valg[k]) return;
        const v = r.valg[k];
        if (v.sann) {
          pluss[i] += SANN;
          funnet[i] = 1;
        } else
          v.av.forEach((a) => {
            if (a === i) return; // never happens (own votes are refused), but never counts
            pluss[a] += LURT;
            lurt[a] += 1;
          });
      });
      r.sann.forEach((s, i) => {
        if (s) {
          pluss[i] += BONUS;
          funnet[i] = 1;
        }
      });
      return { pluss, lurt, funnet };
    },
    // The reveal order: fakes somebody fell for (fewest votes first), the truth last.
    avslorRekke(r) {
      const sann = M.sannIndeks(r.valg);
      const falske = r.valg
        .map((v, k) => k)
        .filter((k) => k !== sann && M.stemmerPa(r, k).length > 0)
        .sort((a, b) => M.stemmerPa(r, a).length - M.stemmerPa(r, b).length || a - b);
      return [...falske, sann];
    },
    // A new game from the setup.
    nyttSpill(o, antall, forst, kort) {
      return {
        antall,
        runder: RUNDER.includes(o.runder) ? o.runder : 5,
        pakker: o.pakker.slice(),
        forst, // who types first in round 1 (the next player starts the next round)
        rn: 0,
        kort,
        fase: "kort",
        poeng: Array(antall).fill(0),
        lurt: Array(antall).fill(0),
        funnet: Array(antall).fill(0),
        bonuser: 0,
        spilt: 0, // rounds revealed
        r: null,
        ferdig: false,
      };
    },
    // The round is revealed: points go on the board (once).
    fullfor(sp) {
      const u = M.regnUt(sp.r);
      sp.r.pluss = u.pluss;
      sp.r.lurt = u.lurt;
      sp.spilt += 1;
      for (let i = 0; i < sp.antall; i++) {
        sp.poeng[i] += u.pluss[i];
        sp.lurt[i] += u.lurt[i];
        sp.funnet[i] += u.funnet[i];
      }
      sp.bonuser += sp.r.sann.filter(Boolean).length;
    },
    sisteRunde: (sp) => sp.rn + 1 >= sp.runder,
    rader: (sp) => sp.poeng.map((poeng, i) => ({ i, poeng })),
    // The players with the most of something (none when the best is 0).
    toppen(liste) {
      const topp = Math.max(0, ...liste);
      return topp > 0 ? liste.map((p, i) => (p === topp ? i : -1)).filter((i) => i >= 0) : [];
    },
    vinnere: (sp) => M.toppen(sp.poeng),
  };
  window.RusjSkrone = M;

  const R = window.Rusj;
  if (!R) return; // loaded by the unit tests

  // ---------- The game ----------

  const D = window.RUSJ_DATA.kort;
  const esc = R.esc;
  const ALLE = [];
  D.pakker.forEach((p) => p.kort.forEach((k) => ALLE.push({ p: p.id, s: k.s, a: k.a, g: k.g || [] })));
  const pakke = (id) => D.pakker.find((p) => p.id === id);
  const STANDARD = D.pakker.filter((p) => p.id !== "barn").map((p) => p.id);
  const OPPSETT = () => ({ pakker: STANDARD.slice(), runder: 5 });
  const stokken = R.kortstokk("kort", ALLE.length);
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const lagretAntall = () => R.felles.navn.filter((n) => String(n || "").trim()).length;
  const BOKSTAV = "ABCDEFGHIJKLMNOP";
  // Which screen shows each phase. The private screens («skriv», «stem») are never resumed
  // directly: after a reload or «Fortsett» the phone is handed over again first.
  const SKJERM_FOR = { kort: "kort", skriv: "gi", les: "les", stem: "gi", avslor: "avslor", resultat: "resultat" };
  let H;
  let feire = false;

  function trekk(pakker) {
    const valgt = new Set(pakker);
    let i = stokken.neste((n) => valgt.has(ALLE[n].p));
    if (i < 0) i = stokken.neste();
    return i;
  }
  const tittel = (S) => (S.spill ? `Runde ${Math.min(S.spill.rn + 1, S.spill.runder)} av ${S.spill.runder}` : "Skrønemakeren");
  const navneliste = (indekser) => R.ramsOpp(indekser.map((i) => R.navn(i)));

  function kortet(sp, o = {}) {
    const k = ALLE[sp.kort];
    const p = pakke(k.p);
    return R.ui.storkort({
      etikett: `${p.ikon} ${p.navn}`,
      nr: o.nr || null,
      tekst: k.s,
      klasse: "skrone-kort" + (o.klasse ? " " + o.klasse : ""),
      kompakt: !!o.kompakt,
      fot: o.fot || null,
    });
  }

  // «Avslutt» under the kit's own button on the hand-over screen (the dock is the last element).
  function medAvslutt(html, ekstra = "") {
    const slutt = html.lastIndexOf("</div>");
    return html.slice(0, slutt) + R.ui.lenkerad(ekstra, R.ui.lenke("Avslutt", "avslutt")) + html.slice(slutt);
  }

  // The letter badge of an option.
  const bokstav = (k) => `<span class="skrone-bokstav" aria-hidden="true">${BOKSTAV[k]}</span>`;

  function tilSlutt(S, tidlig) {
    const sp = S.spill;
    sp.ferdig = true;
    sp.r = null; // typed text goes with the game
    feire = true;
    R.statistikk("ferdig", { spillere: sp.antall, runder: sp.spilt, av: sp.runder, bonuser: sp.bonuser, tidlig: !!tidlig });
    R.kveld.registrer(M.rader(sp));
    R.slippVaken();
    R.gaTil("slutt");
  }

  function nesteRunde(S) {
    const sp = S.spill;
    sp.rn += 1;
    sp.r = null;
    sp.kort = trekk(sp.pakker);
    sp.fase = "kort";
    R.gaTil("kort");
  }

  // Everyone has typed: build the options and go to the list everybody reads.
  function tilLesing(S) {
    const sp = S.spill;
    M.tilStemming(sp.r, ALLE[sp.kort].a, Math.random);
    sp.fase = "les";
    R.lyd.pling();
    R.gaTil("les");
  }

  function tilAvsloring(S) {
    const sp = S.spill;
    M.fullfor(sp);
    sp.r.vist = 0;
    sp.fase = "avslor";
    R.lyd.trommevirvel(0.5);
    R.gaTil("avslor");
  }

  // ---------- Pieces of the reveal ----------

  function avslortKort(S, k, o = {}) {
    const sp = S.spill;
    const r = sp.r;
    const v = r.valg[k];
    const stemte = M.stemmerPa(r, k);
    const avatarer = stemte.length
      ? `<div class="skrone-stemte">${stemte.map((i, n) => `<span class="skrone-stemme" style="--n: ${n}" title="${esc(R.navn(i))}">${R.avatar(i, "mid")}<span class="skrone-stemme-navn">${esc(R.navn(i))}</span></span>`).join("")}</div>`
      : `<p class="skrone-ingen">Ingen stemte på denne.</p>`;
    const hvem = v.sann
      ? `<p class="skrone-av sann">${stemte.length ? `+${SANN} til ${esc(navneliste(stemte))}` : "Ingen fant sannheten!"}</p>`
      : `<p class="skrone-av">Skrøne av <b>${esc(navneliste(v.av))}</b>${stemte.length ? ` · +${stemte.length * LURT}` : ""}</p>`;
    return `
      <article class="skrone-avslort papirboks${v.sann ? " sann" : ""}${o.ny ? " ny" : ""}" aria-label="${esc(v.sann ? "Det ekte svaret" : "En skrøne")}">
        <p class="skrone-tekst">${bokstav(k)}<span>${esc(v.t)}</span></p>
        ${avatarer}
        ${hvem}
        <span class="skrone-stempel stempel" aria-hidden="true">${v.sann ? "SANT!" : "SKRØNE"}</span>
      </article>`;
  }

  // ---------- Start ----------

  R.start({
    id: "skronemakeren",
    versjon: 1,
    pagar,

    tilstand: () => ({
      antall: R.klamp(lagretAntall() || 4, 3, 10),
      oppsett: OPPSETT(),
      spill: null,
    }),

    lastet(S) {
      const o = (S.oppsett = Object.assign(OPPSETT(), S.oppsett));
      o.pakker = (Array.isArray(o.pakker) ? o.pakker : []).filter((id) => pakke(id));
      if (!o.pakker.length) o.pakker = STANDARD.slice();
      if (!RUNDER.includes(o.runder)) o.runder = 5;
      const sp = S.spill;
      const spiller = (i) => Number.isInteger(i) && i >= 0 && i < sp.antall;
      const tall = (l) => Array.isArray(l) && l.length === sp.antall && l.every((n) => Number.isInteger(n) && n >= 0);
      let ok =
        !!sp &&
        Number.isInteger(sp.antall) &&
        sp.antall >= 3 &&
        sp.antall <= 10 &&
        !!ALLE[sp.kort] &&
        RUNDER.includes(sp.runder) &&
        Number.isInteger(sp.rn) &&
        sp.rn >= 0 &&
        sp.rn < sp.runder &&
        FASER.includes(sp.fase) &&
        tall(sp.poeng) &&
        tall(sp.lurt) &&
        tall(sp.funnet) &&
        Number.isInteger(sp.spilt) &&
        Array.isArray(sp.pakker);
      if (ok && sp.ferdig) sp.r = null;
      else if (ok && sp.fase !== "kort") {
        const r = sp.r;
        const tekst = (t) => typeof t === "string" && t.length <= 400;
        ok =
          !!r &&
          Array.isArray(r.rekke) &&
          r.rekke.length === sp.antall &&
          r.rekke.every(spiller) &&
          Number.isInteger(r.na) &&
          r.na >= 0 &&
          r.na <= sp.antall &&
          Array.isArray(r.skrevet) &&
          r.skrevet.length === sp.antall &&
          r.skrevet.every((t) => t === null || tekst(t)) &&
          Array.isArray(r.sann) &&
          r.sann.length === sp.antall &&
          Array.isArray(r.stemmer) &&
          r.stemmer.length === sp.antall;
        if (ok && sp.fase !== "skriv")
          ok =
            r.na === sp.antall &&
            Array.isArray(r.valg) &&
            r.valg.length >= 2 &&
            r.valg.every((v) => v && tekst(v.t) && Array.isArray(v.av) && v.av.every(spiller)) &&
            r.valg.filter((v) => v.sann).length === 1 &&
            Array.isArray(r.srekke) &&
            r.srekke.every(spiller) &&
            Number.isInteger(r.sna) &&
            r.sna >= 0 &&
            r.sna <= r.srekke.length &&
            r.stemmer.every((k) => Number.isInteger(k) && k >= -1 && k < r.valg.length);
        if (ok && sp.fase === "skriv") ok = r.na < sp.antall;
        if (ok && sp.fase === "stem") ok = r.sna < r.srekke.length;
        if (ok && ["avslor", "resultat"].includes(sp.fase)) ok = Array.isArray(r.pluss) && Array.isArray(r.lurt) && Number.isInteger(r.vist);
        if (ok) {
          r.utkast = typeof r.utkast === "string" ? R.kutt(r.utkast, MAKS) : "";
          if (!Number.isInteger(r.valgt)) r.valgt = -1;
        }
      }
      if (!ok) S.spill = null;
      if (!S.spill && ["kort", "gi", "skriv", "les", "stem", "avslor", "resultat", "slutt"].includes(S.skjerm)) S.skjerm = "hjem";
    },

    regler: {
      intro: "Et kort viser noe rart, men ekte. Alle dikter et svar som høres sant ut – så gjelder det å finne det ekte.",
      steg: [
        ["Dikt en skrøne", "Mobilen går rundt. Hver av dere skriver i hemmelighet et svar som høres ekte ut."],
        ["Finn sannheten", "Skrønene blandes med det ekte svaret. Mobilen går rundt igjen, og alle stemmer på det de tror er sant."],
        ["Poeng", `Finner du sannheten, får du ${SANN} poeng. Hver gang noen går på skrønen din, får du ${LURT}.`],
      ],
      tips: [
        "Skriv kort og kjedelig – som en ordbok. De beste skrønene høres ut som noe man har lest et sted.",
        `Skriver du tilfeldigvis det ekte svaret, får du ${BONUS} poeng i bonus. Da skriver du en skrøne til og står over stemmingen.`,
        "Like skrøner slås sammen. Stemmer noen på den, får alle som skrev den, poeng.",
        "Du kan ikke stemme på din egen skrøne.",
        "Kjenner noen kortet fra før? Trykk «Bytt kort» før dere begynner å skrive.",
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          return R.ui.spillhjem({
            slagordHtml: "Alle dikter en forklaring.<br><em>Finner dere den ekte?</em>",
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: pagar(S) ? `Fortsett · ${tittel(S).toLowerCase()}` : "",
              ekstraHtml: R.ui.lenke("Slik spiller du", "regler"),
            }),
            merker: [["3–10", "spillere"], [String(ALLE.length), "kort"], ["1", "mobil"]],
          });
        },
        inn: () => R.slippVaken(),
      },

      oppsett: {
        tittel: "Nytt spill",
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          return `
          <h1 id="skjerm-tittel">Gjør klart</h1>
          <section class="seksjon">
            <div class="seksjon-hode"><h2>Velg pakker</h2><span class="tall">${o.pakker.length} valgt</span></div>
            ${R.ui.fliser(
              "pakke",
              D.pakker.map((p) => ({ v: p.id, tittel: p.navn, tekst: `${p.tekst} · ${p.kort.length}`, ikon: p.ikon })),
              o.pakker,
            )}
          </section>
          <section class="seksjon">
            <h2>Runder</h2>
            ${R.ui.seg("runder", RUNDER.map((n) => [String(n), String(n)]), String(o.runder), { etikett: "Runder" })}
            <p class="hjelp">Alle skriver og stemmer i hver runde. ${o.runder === 3 ? "Kjapt og godt." : o.runder === 8 ? "En lang kveld med skrøner." : "Passe lenge."}</p>
          </section>
          ${R.ui.spillere({ min: 3, max: 10 })}
          ${R.ui.dokk(R.ui.knapp("Start", "start", { av: !o.pakker.length }))}`;
        },
      },

      // The card, for everyone.
      kort: {
        tittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          return `
            <h1 class="vh" id="skjerm-tittel">${esc(tittel(S))}</h1>
            ${kortet(sp)}
            <p class="hjelp skrone-hjelp">Les kortet høyt. Alle dikter et svar som høres ekte ut – det ekte svaret blandes inn.</p>
            ${R.ui.dokk(
              R.ui.knapp("Skriv skrøner", "begynn", { variant: "stor", ikon: "✍️" }),
              R.ui.lenkerad(R.ui.lenke("Bytt kort", "bytt"), R.ui.lenke("Avslutt", "avslutt")),
            )}`;
        },
        inn() {
          R.holdVaken();
        },
      },

      // Hand the phone over — before typing and before voting.
      gi: {
        tittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.r;
          if (sp.fase === "stem") {
            const i = r.srekke[r.sna];
            const forrige = r.sna > 0 ? R.ui.lenke(`↶ Angre stemmen til ${R.navn(r.srekke[r.sna - 1])}`, "angre-stemme") : "";
            return medAvslutt(
              R.ui.giTil({ i, h: "jeg-er", tekst: "Stem i hemmelighet", knapp: `Jeg er ${R.navn(i)}`, advarsel: "De andre ser bort mens du stemmer", prikker: [r.srekke.length, r.sna] }),
              forrige,
            );
          }
          const i = r.rekke[r.na];
          return medAvslutt(R.ui.giTil({ i, h: "jeg-er", tekst: "Gi mobilen til", knapp: `Jeg er ${R.navn(i)}`, advarsel: "De andre ser bort mens du skriver", prikker: [r.rekke.length, r.na] }));
        },
        inn(S) {
          R.holdVaken();
        },
      },

      // Private: the player types a fake.
      skriv: {
        tittel: "Hemmelig",
        tilbake: "hjem",
        gjenoppta: "gi",
        vis(S) {
          const sp = S.spill;
          const r = sp.r;
          const i = r.rekke[r.na];
          const navn = R.navn(i);
          const igjen = r.sann[i];
          return `
            <form class="skrone-skriv" data-skjema="skrone" autocomplete="off" novalidate>
              <div class="skrone-topp">
                ${R.avatar(i, "mid")}
                <div><p class="etikett">🤫 Bare ${esc(navn)} ser dette</p><h1 id="skjerm-tittel">${igjen ? "Skriv en skrøne til" : "Dikt en skrøne"}</h1></div>
              </div>
              ${kortet(sp, { kompakt: true })}
              ${
                igjen
                  ? `<p class="papirboks skrone-truffet" role="status">🎯 <b>Det var det ekte svaret!</b> Du får ${BONUS} poeng i bonus. Skriv en skrøne til, så de andre har noe å gå på.</p>`
                  : ""
              }
              <label class="skrone-felt" for="skrone-felt">
                <span class="vh">Skrønen til ${esc(navn)}</span>
                <textarea id="skrone-felt" class="tekstfelt" data-felt="utkast" name="skrone-${sp.rn}-${r.na}" rows="2" maxlength="${MAKS}" placeholder="Skriv et svar som høres ekte ut …" autocomplete="off" autocapitalize="sentences" spellcheck="false" enterkeyhint="done" aria-describedby="skrone-feil skrone-igjen">${esc(r.utkast)}</textarea>
              </label>
              <p class="skrone-teller" id="skrone-igjen" aria-hidden="true">${Array.from(r.utkast).length}/${MAKS}</p>
              <p class="feil" id="skrone-feil" aria-live="assertive"></p>
              ${R.ui.dokk(`<button class="knapp" type="submit" id="skrone-ferdig">Ferdig</button>`)}
            </form>`;
        },
        inn() {
          const f = R.$("#skrone-felt");
          if (f) {
            try {
              f.focus({ preventScroll: true });
            } catch (e) {
              f.focus();
            }
          }
        },
      },

      // Everyone: all the answers, read out loud before the vote.
      les: {
        tittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.r;
          const fant = r.rekke.filter((i) => r.sann[i]);
          const alle = !r.srekke.length;
          return `
            <h1 id="skjerm-tittel">Hva er sant?</h1>
            <p class="skrone-sporsmal">${esc(ALLE[sp.kort].s)}</p>
            <ol class="skrone-liste">
              ${r.valg.map((v, k) => `<li>${bokstav(k)}<span>${esc(v.t)}</span></li>`).join("")}
            </ol>
            ${fant.length ? `<p class="papirboks skrone-fant">🎯 ${esc(navneliste(fant))} skrev det ekte svaret og får ${BONUS} poeng i bonus${alle ? "" : " – og står over stemmingen"}.</p>` : ""}
            ${R.ui.dokk(
              alle ? R.ui.knapp("Avslør svarene", "avslor-na") : R.ui.knapp("Send mobilen rundt og stem", "stem-start"),
              R.ui.lenkerad(R.ui.lenke("Avslutt", "avslutt")),
            )}`;
        },
        inn(S) {
          R.holdVaken();
          S.spill.fase = "les";
        },
      },

      // Private: the player votes.
      stem: {
        tittel: "Hemmelig",
        tilbake: "hjem",
        gjenoppta: "gi",
        vis(S) {
          const sp = S.spill;
          const r = sp.r;
          const i = r.srekke[r.sna];
          const navn = R.navn(i);
          return `
            <div class="skrone-topp">
              ${R.avatar(i, "mid")}
              <div><p class="etikett">🤫 Bare ${esc(navn)} ser dette</p><h1 id="skjerm-tittel">Hva er sant?</h1></div>
            </div>
            <p class="skrone-sporsmal">${esc(ALLE[sp.kort].s)}</p>
            <div class="skrone-valg" role="group" aria-label="Svarene">
              ${r.valg
                .map((v, k) => {
                  const egen = v.av.includes(i);
                  return `<button class="skrone-alt${egen ? " egen" : ""}${r.valgt === k ? " valgt" : ""}" data-h="velg" data-v="${k}" aria-pressed="${r.valgt === k}"${egen ? " disabled" : ""}>${bokstav(k)}<span class="skrone-alt-tekst">${esc(v.t)}</span>${egen ? `<span class="skrone-din">Din</span>` : ""}</button>`;
                })
                .join("")}
            </div>
            ${R.ui.dokk(R.ui.knapp(r.valgt >= 0 ? `Stem på ${BOKSTAV[r.valgt]}` : "Velg et svar", "stem", { id: "skrone-stem", av: r.valgt < 0 }))}`;
        },
      },

      // Everyone: the fakes one by one, the truth last.
      avslor: {
        tittel: "Avsløringen",
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.r;
          const rekke = M.avslorRekke(r);
          const vist = R.klamp(r.vist, 0, rekke.length);
          if (!vist) {
            return `
              <h1 id="skjerm-tittel">Avsløringen</h1>
              <p class="skrone-sporsmal">${esc(ALLE[sp.kort].s)}</p>
              <div class="skrone-venter">${R.figur()}</div>
              <p class="ingress skrone-ingress">Samle dere rundt mobilen. ${rekke.length > 1 ? "Først skrønene noen gikk på – det ekte svaret til slutt." : "Ingen gikk på en skrøne. Hva var det ekte svaret?"}</p>
              ${R.ui.dokk(R.ui.knapp(rekke.length > 1 ? "Vis første skrøne" : "Vis det ekte svaret", "vis-neste"), R.ui.lenkerad(R.ui.lenke("Avslutt", "avslutt")))}`;
          }
          const siste = vist === rekke.length;
          const tidligere = rekke.slice(0, vist - 1).reverse();
          return `
            <h1 id="skjerm-tittel">${siste ? "Det ekte svaret" : `Skrøne ${vist} av ${rekke.length - 1}`}</h1>
            <p class="skrone-sporsmal liten">${esc(ALLE[sp.kort].s)}</p>
            ${avslortKort(S, rekke[vist - 1], { ny: true })}
            ${tidligere.length ? `<div class="skrone-tidligere">${tidligere.map((k) => avslortKort(S, k)).join("")}</div>` : ""}
            ${R.ui.dokk(R.ui.knapp(siste ? "Se poengene" : vist === rekke.length - 1 ? "Vis det ekte svaret" : "Vis neste skrøne", "vis-neste"))}`;
        },
        inn(S) {
          R.holdVaken();
        },
      },

      // Everyone: the round's points and who wrote what.
      resultat: {
        tittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.r;
          const sannK = M.sannIndeks(r.valg);
          const rader = M.rader(sp).map((rad) => Object.assign(rad, r.pluss[rad.i] ? { pluss: r.pluss[rad.i] } : {}));
          const lurere = M.toppen(r.lurt);
          const ekte = ALLE[sp.kort];
          return `
            <h1 id="skjerm-tittel">${M.sisteRunde(sp) ? "Siste runde er ferdig" : `Runde ${sp.rn + 1} er ferdig`}</h1>
            <div class="papirboks skrone-fasit">
              <p class="etikett">${esc(ekte.s)}</p>
              <p class="skrone-fasit-svar">✅ ${esc(r.valg[sannK].t)}</p>
              ${lurere.length ? `<p class="skrone-runde-linje">Rundens skrønemaker: <b>${esc(navneliste(lurere))}</b></p>` : `<p class="skrone-runde-linje">Ingen gikk på en skrøne denne runden.</p>`}
            </div>
            ${R.ui.poengliste(rader)}
            <details class="skrone-alle">
              <summary>Alle svarene</summary>
              <ul>${r.valg
                .map((v, k) => `<li class="${v.sann ? "sann" : ""}"><span>${esc(v.t)}</span><small>${v.sann ? "Det ekte svaret" : `${esc(navneliste(v.av))}`} · ${R.flertall(M.stemmerPa(r, k).length, "stemme", "stemmer")}</small></li>`)
                .join("")}</ul>
            </details>
            ${R.ui.dokk(R.ui.knapp(M.sisteRunde(sp) ? "Til kåringen" : "Neste runde", "videre"), R.ui.lenkerad(M.sisteRunde(sp) ? "" : R.ui.lenke("Avslutt", "avslutt")))}`;
        },
        inn(S) {
          S.spill.fase = "resultat";
        },
      },

      slutt: {
        tittel: "Kåringen",
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const rader = M.rader(sp);
          const v = M.vinnere(sp);
          const skrone = M.toppen(sp.lurt);
          const jeger = M.toppen(sp.funnet);
          const h1 = !v.length ? "Ingen poeng denne gangen" : v.length > 3 ? `${v.length} spillere vinner!` : `${R.ramsOpp(v.map((i) => R.navn(i)))} vinner!`;
          const pris = (ikon, navn, hvem, linje) =>
            `<div class="skrone-pris"><span class="skrone-pris-ikon" aria-hidden="true">${ikon}</span><div><p class="etikett">${esc(navn)}</p><p class="skrone-pris-navn">${esc(hvem.length > 3 ? `${hvem.length} spillere` : navneliste(hvem))}</p><p class="hjelp">${esc(linje)}</p></div></div>`;
          const priser = [
            skrone.length ? pris("🎭", "Beste skrønemaker", skrone, `Lurte gjengen ${R.flertall(sp.lurt[skrone[0]], "gang", "ganger")}`) : "",
            jeger.length ? pris("🔎", "Sannhetsjeger", jeger, `Fant sannheten ${R.flertall(sp.funnet[jeger[0]], "gang", "ganger")}`) : "",
          ].join("");
          return `
            ${R.ui.banner({ klasse: "aksent", etikett: R.flertall(sp.spilt, "runde", "runder"), tittel: h1, tekst: v.length ? "Godt jobba! Skrønene satt som støpt." : "Dere er for ærlige til dette.", stemning: v.length ? "jubel" : "" })}
            ${v.length ? R.ui.pall(rader) : ""}
            ${R.ui.poengliste(rader)}
            ${priser ? `<section class="skrone-priser">${priser}</section>` : ""}
            ${v.length ? `<div class="skrone-del">${R.ui.knapp2("Del resultatet", "del", { ikon: "📣" })}</div>` : ""}
            ${R.ui.flereSpill({ antall: sp.antall })}
            ${R.ui.dokk(R.ui.knapp("Spill igjen", "igjen"), R.ui.lenkerad(R.ui.lenke("Endre oppsett", "nytt"), `<a class="lenke" href="/">Alle spill</a>`))}`;
        },
        inn(S) {
          if (!feire) return;
          feire = false;
          if (M.vinnere(S.spill).length) {
            R.lyd.fanfare();
            R.konfetti();
          } else R.lyd.pling();
        },
      },
    },

    skjema: {
      skrone(S, form) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "skriv" || S.skjerm !== "skriv") return;
        const r = sp.r;
        const felt = form.querySelector("textarea");
        const i = r.rekke[r.na];
        const svar = M.skriv(r, ALLE[sp.kort], felt.value);
        if (svar === "tom") {
          R.$("#skrone-feil").textContent = String(felt.value || "").trim() ? "Skrønen må ha bokstaver eller tall." : "Skriv en skrøne først.";
          felt.classList.remove("risting");
          void felt.offsetWidth;
          felt.classList.add("risting");
          felt.setAttribute("aria-invalid", "true");
          felt.focus();
          R.lyd.feil();
          R.vibrer(60);
          return;
        }
        if (svar === "sann") {
          R.lyd.riktig();
          R.vibrer([30, 40, 80]);
          R.vis();
          const f = R.$("#skrone-felt");
          if (f) f.focus();
          R.si(`Det var det ekte svaret! ${BONUS} poeng i bonus til ${R.navn(i)}. Skriv en skrøne til.`);
          return;
        }
        R.lyd.pop();
        R.vibrer(15);
        if (M.alleHarSkrevet(r)) return tilLesing(S);
        R.gaTil("gi"); // a new screen: nothing of this fake is left on the page
      },
    },

    felt: {
      utkast(S, el) {
        const sp = S.spill;
        if (!sp || !sp.r) return;
        sp.r.utkast = R.kutt(el.value, MAKS);
        el.removeAttribute("aria-invalid");
        const feil = R.$("#skrone-feil");
        if (feil && feil.textContent) feil.textContent = "";
        const t = R.$("#skrone-igjen");
        if (t) t.textContent = `${Array.from(el.value).length}/${MAKS}`;
        R.lagre();
      },
    },

    handlinger: (H = {
      async nytt(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(pagar(S))) || !fortsatt()) return;
        if (pagar(S)) {
          S.spill = null;
          R.slippVaken();
        }
        R.gaTil("oppsett");
      },
      fortsett(el, e, S) {
        if (!pagar(S)) return R.gaTil("oppsett");
        R.gaTil(SKJERM_FOR[S.spill.fase] || "kort");
      },
      pakke(el, e, S) {
        const id = el.dataset.v;
        const valgt = S.oppsett.pakker;
        S.oppsett.pakker = valgt.includes(id) ? valgt.filter((x) => x !== id) : [...valgt, id];
        R.vis();
      },
      runder(el, e, S) {
        const n = Number(el.dataset.v);
        S.oppsett.runder = RUNDER.includes(n) ? n : 5;
        R.vis();
      },
      start(el, e, S) {
        const o = S.oppsett;
        if (!o.pakker.length) return;
        const antall = R.klamp(S.antall || 4, 3, 10);
        S.spill = M.nyttSpill(o, antall, R.heltall(0, antall - 1), trekk(o.pakker));
        feire = false;
        R.statistikk("start", { spillere: antall, runder: S.spill.runder, pakker: o.pakker.length, barn: o.pakker.includes("barn") });
        R.gaTil("kort");
      },
      bytt(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "kort") return;
        sp.kort = trekk(sp.pakker);
        R.lyd.snu();
        R.vis();
        R.si(`Nytt kort. ${ALLE[sp.kort].s}`);
      },
      // From the card: the phone goes round for the fakes.
      begynn(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "kort") return;
        sp.r = M.nyRunde(sp.antall, (sp.forst + sp.rn) % sp.antall);
        sp.fase = "skriv";
        R.gaTil("gi");
      },
      // «Jeg er X» on the hand-over screen.
      "jeg-er"(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || !sp.r) return;
        if (sp.fase === "skriv" && !M.alleHarSkrevet(sp.r)) R.gaTil("skriv");
        else if (sp.fase === "stem" && !M.alleHarStemt(sp.r)) {
          sp.r.valgt = -1;
          R.gaTil("stem");
        }
      },
      "stem-start"(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "les") return;
        sp.fase = "stem";
        sp.r.sna = 0;
        R.gaTil("gi");
      },
      "avslor-na"(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "les" || sp.r.srekke.length) return;
        tilAvsloring(S);
      },
      velg(el, e, S) {
        const sp = S.spill;
        const k = Number(el.dataset.v);
        if (!pagar(S) || sp.fase !== "stem" || S.skjerm !== "stem") return;
        if (!M.kanStemme(sp.r, sp.r.srekke[sp.r.sna], k)) return;
        sp.r.valgt = k;
        R.lyd.klikk();
        R.vis();
      },
      stem(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "stem" || S.skjerm !== "stem") return;
        if (!M.stem(sp.r, sp.r.valgt)) return;
        R.lyd.pop();
        R.vibrer(15);
        if (M.alleHarStemt(sp.r)) return tilAvsloring(S);
        R.gaTil("gi");
      },
      "angre-stemme"(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "stem" || !M.angreStemme(sp.r)) return;
        R.lyd.snu();
        R.gaTil("gi");
        R.toast(`${R.navn(sp.r.srekke[sp.r.sna])} stemmer på nytt`);
      },
      "vis-neste"(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "avslor") return;
        const r = sp.r;
        const rekke = M.avslorRekke(r);
        if (r.vist >= rekke.length) {
          sp.fase = "resultat";
          R.gaTil("resultat");
          return;
        }
        r.vist += 1;
        const k = rekke[r.vist - 1];
        const v = r.valg[k];
        const stemte = M.stemmerPa(r, k);
        R.vis();
        if (v.sann) {
          R.lyd.riktig();
          if (stemte.length) R.konfetti(["--mynte", "--papir", "--lampe"]);
          R.vibrer([30, 40, 80]);
          R.si(`Det ekte svaret: ${v.t}. ${stemte.length ? `${navneliste(stemte)} fant det.` : "Ingen fant det."}`);
        } else {
          setTimeout(() => R.lyd.latter(), 520);
          R.vibrer(40);
          R.si(`${v.t} – en skrøne av ${navneliste(v.av)}. ${navneliste(stemte)} gikk på den.`);
        }
      },
      videre(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "resultat") return;
        if (M.sisteRunde(sp)) return tilSlutt(S);
        nesteRunde(S);
      },
      async avslutt(el, e, S) {
        const fortsatt = R.vakt();
        const avslort = ["avslor", "resultat"].includes(S.spill && S.spill.fase);
        const ja = await R.bekreft("Avslutte spillet?", avslort ? "Dere går rett til kåringen." : "Dere går rett til kåringen. Runden dere er i nå, gir ingen poeng.", "Avslutt", "Spill videre");
        if (!ja || !fortsatt() || !pagar(S)) return;
        tilSlutt(S, true); // a round that is not revealed yet gave no points
      },
      del(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        const v = M.vinnere(sp);
        if (!v.length) return;
        const topp = M.rader(sp)
          .filter((r) => r.poeng > 0)
          .sort((a, b) => b.poeng - a.poeng)
          .slice(0, 3)
          .map((r) => `${R.navn(r.i)}: ${R.flertall(r.poeng, "poeng", "poeng")}`);
        const skrone = M.toppen(sp.lurt);
        const vinner = v.length > 3 ? `${v.length} spillere vinner!` : `${R.ramsOpp(v.map((i) => R.navn(i)))} vinner!`;
        const linjer = [vinner, ...topp, ...(skrone.length && skrone.length <= 2 ? [`Beste skrønemaker: ${navneliste(skrone)}`] : [])];
        R.del("Skrønemakeren", ["Skrønemakeren – finn den ekte forklaringen 🎭", ...linjer].join("\n"), location.origin + "/skronemakeren/", {
          kort: { tittel: "Skrønemakeren", linjer },
        });
      },
      igjen(el, e, S) {
        S.spill = null;
        H.start(el, e, S);
      },
    }),
  });
})();
