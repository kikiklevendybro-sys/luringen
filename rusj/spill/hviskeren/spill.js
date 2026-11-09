/* Hviskeren — "Bare ett hint": a co-operative word game for 3–10 players on one phone.
   One player guesses. The others see the secret word and, passing the phone, each type one
   hint in secret. Hints that are the same cancel each other out — automatically (also
   bil/bilen/biler/bilene and a doubled letter) and by tapping — and the guesser only sees what is left.
   A deck of 8 or 13 cards; a wrong guess costs an extra card, a pass is free. */
(function () {
  "use strict";

  const R = window.Rusj;
  const esc = R.esc;

  // =====================================================================================
  // Word matching — pure functions, exposed as window.HviskerenOrd for the tests.
  // =====================================================================================

  // Irregular noun forms → base form (the regular ones are handled by ENDELSER).
  const UREGELRETT = {
    menn: "mann", mennene: "mann", bøker: "bok", bøkene: "bok", føtter: "fot", føttene: "fot",
    hender: "hånd", hendene: "hånd", tenner: "tann", tennene: "tann", netter: "natt", nettene: "natt",
    røtter: "rot", røttene: "rot", bønder: "bonde", bøndene: "bonde", kyr: "ku", kyrne: "ku",
    gjess: "gås", gjessene: "gås", tær: "tå", tærne: "tå", knær: "kne", knærne: "kne", trær: "tre",
    trærne: "tre", strender: "strand", strendene: "strand", øyne: "øye", øynene: "øye", brødre: "bror",
    brødrene: "bror", døtre: "datter", døtrene: "datter", mødre: "mor", mødrene: "mor", fedre: "far",
    fedrene: "far", søstre: "søster", søstrene: "søster", ender: "and", endene: "and", stenger: "stang",
    tenger: "tang", lus: "lus", mus: "mus",
  };
  // Endings of definite and plural nouns (bilen, biler, bilene, huset, jenta), adjectives (rødt,
  // røde, blått) and verbs (kaster, kastet). Longest first. Past tense -te/-de is left out on
  // purpose: it would make bilde match bil and matte match mat.
  const ENDELSER = ["ene", "ane", "er", "ar", "en", "et", "tt", "a", "e", "t", "r", "n"];

  // The key a word is compared by: lower case, accents and punctuation gone, no spaces.
  const nokkel = (tekst) => R.normaliser(tekst).replace(/ /g, "");

  // Possible base forms of one key: the key itself, an irregular base and the key minus one ending.
  function stammer(ord) {
    const ut = new Set([ord]);
    if (UREGELRETT[ord]) ut.add(UREGELRETT[ord]);
    // støvel → støvler, sykkel → sykler, finger → fingre: the e before a final l or r drops out.
    const el = /^(.*[^aeiouyæøå])e([lr])$/.exec(ord);
    if (el) {
      const uten = el[1] + el[2];
      ut.add(uten);
      ut.add(uten.replace(/([^aeiouyæøå])\1([lr])$/, "$1$2"));
    }
    for (const e of ENDELSER) {
      if (!ord.endsWith(e) || ord.length - e.length < 2) continue;
      const rest = ord.slice(0, -e.length);
      // A one-letter ending never splits a double letter (katt is not kat + t, mann is not man + n),
      // and leaves at least three letters unless it's -a (kua → ku): kur is not ku + r.
      if (e.length === 1 && (rest.endsWith(e) || (rest.length < 3 && e !== "a"))) continue;
      // -tt only after a short vowel word: blå → blått, ny → nytt (not kassett → kasse).
      if (e === "tt" && (rest.length > 3 || !/[aeiouyæøå]$/.test(rest))) continue;
      ut.add(rest);
      // dam → dammen, rom → rommet: the m is doubled before an ending.
      if (rest.endsWith("mm") && e.length >= 2) ut.add(rest.slice(0, -1));
      // grønn → grønt, trygg → trygt: the double letter is dropped before the t.
      if (e === "t" && /[ng]$/.test(rest) && !/(nn|gg)$/.test(rest)) ut.add(rest + rest.slice(-1));
    }
    return ut;
  }

  // The same word with one letter doubled or not (bannan/banan, kafe/kaffe): the most common slip
  // on a phone keyboard. Wider typo rules made real words match (Island/Irland, bjørn/bjørk).
  function dobbel(a, b) {
    if (Math.abs(a.length - b.length) !== 1) return false;
    const [kort, lang] = a.length < b.length ? [a, b] : [b, a];
    for (let i = 0; i < lang.length - 1; i++) {
      if (lang[i] === lang[i + 1] && lang.slice(0, i) + lang.slice(i + 1) === kort) return true;
    }
    return false;
  }

  // Two keys mean the same word: equal, a shared base form (bil/bilene, katt/katter, mann/menn,
  // rød/rødt) or the same word with one letter doubled (banan/bannan).
  function likeOrd(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    const sa = stammer(a);
    for (const s of stammer(b)) if (sa.has(s) && (s.length >= 3 || s === a || s === b)) return true;
    return Math.min(a.length, b.length) >= 4 && dobbel(a, b);
  }

  // One key is a part of the other in a compound: ball in fotball, hest in gyngehest, fisk in
  // fiskestang. Deliberately careful, because a wrong block is more annoying than a missed one
  // (the players can still strike hints by hand): both parts need at least 4 and 3 letters, so
  // mat/matematikk, and/vestlandet and bil/bilde are let through.
  function delAv(a, b) {
    const former = (o) => {
      const ut = new Set([o]);
      if (UREGELRETT[o]) ut.add(UREGELRETT[o]);
      for (const e of ["ene", "er", "en", "et"]) if (o.endsWith(e) && o.length - e.length >= 4) ut.add(o.slice(0, -e.length));
      return ut;
    };
    for (const x of former(a)) {
      for (const y of former(b)) {
        const [kort, lang] = x.length <= y.length ? [x, y] : [y, x];
        if (kort.length < 4 || lang.length - kort.length < 3) continue;
        if (lang.startsWith(kort) || lang.endsWith(kort)) return true;
      }
    }
    return false;
  }

  // Checks a typed hint. Returns null when it is fine, otherwise the reason.
  // egne = the other hint(s) this player already wrote this round.
  function sjekkHint(hint, hemmelig, egne) {
    const ren = String(hint || "").trim();
    if (!ren) return "tom";
    if (/\s/.test(ren)) return "flere";
    const k = nokkel(ren);
    if (!k) return "tegn";
    const deler = R.normaliser(hemmelig).split(" ").filter(Boolean);
    const hel = deler.join("");
    if (likeOrd(k, hel) || deler.some((d) => d.length >= 3 && likeOrd(k, d))) return "samme";
    if (delAv(k, hel) || (deler.length > 1 && deler.some((d) => d.length >= 3 && delAv(k, d)))) return "del";
    if ((egne || []).some((e) => likeOrd(k, nokkel(e)))) return "egen";
    return null;
  }

  // Which hints have a twin among the others (same word or a form of it)? → array of booleans.
  function finnLike(hint) {
    const k = hint.map(nokkel);
    const like = hint.map(() => false);
    for (let a = 0; a < k.length; a++) {
      for (let b = a + 1; b < k.length; b++) {
        if (likeOrd(k[a], k[b])) like[a] = like[b] = true;
      }
    }
    return like;
  }

  const FEILMELDING = {
    tom: "Skriv ett ord først.",
    flere: "Bare ett ord – uten mellomrom.",
    tegn: "Hintet må ha bokstaver eller tall.",
    samme: "Det er jo selve ordet! Finn på noe annet.",
    del: "For likt ordet – det er en del av det. Prøv et annet hint.",
    egen: "Det hintet har du allerede skrevet.",
  };

  window.HviskerenOrd = { nokkel, stammer, likeOrd, delAv, sjekkHint, finnLike };

  // =====================================================================================
  // Words from the shared word bank
  // =====================================================================================

  const BANK = window.RUSJ_ORD || { kategorier: [] };
  // Phrases with commas or more than two words make poor secret words for one-word hints.
  const egnet = (o) => !/[,!?]/.test(o) && o.trim().split(/\s+/).length <= 2;
  const KATEGORIER = BANK.kategorier.map((k) => ({ id: k.id, navn: k.navn, ikon: k.ikon }));
  const ORD = [];
  BANK.kategorier.forEach((k) =>
    k.ord.forEach((e) => {
      if (egnet(e[0])) ORD.push({ k: k.id, o: e[0], n: e[1] });
    }),
  );
  const kategori = (id) => KATEGORIER.find((k) => k.id === id);
  const ALLE_KAT = KATEGORIER.map((k) => k.id);
  const NIVA = { lett: [1], blandet: [1, 2], vanskelig: [2, 3] };
  const stokk = R.kortstokk("ord", ORD.length);

  const passer = (S, n) => S.oppsett.kategorier.includes(ORD[n].k) && (NIVA[S.oppsett.niva] || NIVA.blandet).includes(ORD[n].n);
  const antallOrd = (S) => ORD.reduce((sum, o, n) => sum + (passer(S, n) ? 1 : 0), 0);

  function nyttOrd(S) {
    const forrige = S.spill.r ? S.spill.r.ord : -1;
    let i = stokk.neste((n) => n !== forrige && passer(S, n));
    if (i < 0) i = stokk.neste((n) => n !== forrige);
    return i;
  }

  // =====================================================================================
  // Game flow
  // =====================================================================================

  let H; // the actions, so one can call another

  const pagar = (S) => !!(S.spill && !S.spill.ferdig);

  // Cards still in the deck, counting the one being played.
  const kortIgjen = (sp) => sp.runder - sp.logg.length - sp.tapt;

  function nyRunde(S) {
    const sp = S.spill;
    const gjetter = (sp.start + sp.logg.length) % sp.antall;
    const givere = [];
    for (let k = 1; k < sp.antall; k++) givere.push((gjetter + k) % sp.antall);
    sp.r = { gjetter, ord: -1, givere, na: 0, hint: [], utfall: null, mal: "ordet" };
    sp.r.ord = nyttOrd(S);
  }

  // "Fortsett" never goes straight to a screen that shows a secret, only to its gate
  // (after a reload the screens' gjenoppta does the same).
  function porten(S, skjerm) {
    if (skjerm === "ordet") return "runde";
    if (skjerm === "skriv") return "gi";
    if (skjerm === "sjekk") {
      S.spill.r.mal = "sjekk";
      return "runde";
    }
    return skjerm || "runde";
  }

  const VURDERING = [
    [1, "Telepater!", "Alle sammen. Hvert eneste ord. Dere deler visst én hjerne.", "🔮"],
    [0.9, "Tankelesere", "Nesten feilfritt – dere er på samme bølgelengde.", "🧠"],
    [0.75, "Hviskemestere", "Sterkt! De fleste hintene traff blink.", "🏆"],
    [0.6, "Godt samkjørt", "Mer riktig enn feil. Dette lover godt.", "🤝"],
    [0.4, "Lovende gjeng", "Noen hint fløy forbi, men dere er på vei.", "🌱"],
    [0.2, "Litt støy på linja", "Hintene kom fram, men ikke helt slik dere mente.", "📻"],
    [0, "Hvem hvisket hva?", "Det var mer hvisking enn treff denne gangen. Ny runde?", "🙊"],
  ];
  const vurdering = (poeng, runder) => VURDERING.find(([grense]) => poeng / runder >= grense - 1e-9);

  // ---------- Markup helpers ----------

  const ROT = [-2, 1.5, -1, 2, -1.5, 1];
  function lapp(h, n, o = {}) {
    const lengde = h.t.length > 11 ? " ekstra-lang" : h.t.length > 7 ? " lang" : "";
    const indre = `<span class="hv-lapp-tekst${lengde}">${esc(h.t)}</span>${h.s ? `<span class="hv-lapp-merke">${h.a ? "Likt" : "Strøket"}</span>` : ""}${
      o.fra === false ? "" : `<span class="hv-lapp-fra">${R.avatar(h.i)}<span>${esc(R.navn(h.i))}</span></span>`
    }`;
    const stil = ` style="--rot: ${ROT[n % ROT.length]}deg; --i: ${n}"`;
    if (!o.knapp) return `<div class="hv-lapp${h.s ? " strok" : ""}"${stil}>${indre}</div>`;
    return `<button class="hv-lapp" data-h="stryk" data-v="${n}" aria-pressed="${!!h.s}" aria-label="Stryk «${esc(h.t)}» fra ${esc(R.navn(h.i))}"${stil}>${indre}</button>`;
  }

  // The deck: one small card per card in the game, coloured by what happened to it.
  function bunke(sp, vis) {
    const kort = [];
    sp.logg.forEach((l) => {
      kort.push(l.u);
      for (let k = 0; k < (l.x || 0); k++) kort.push("tapt");
    });
    const r = sp.r;
    if (!sp.ferdig && r) {
      if (vis && r.utfall) {
        kort.push(r.utfall + " na");
        if (r.utfall === "feil" && kortIgjen(sp) > 1) kort.push("tapt");
      } else kort.push("na");
    }
    while (kort.length < sp.runder) kort.push("");
    const tegn = { riktig: "✓", feil: "✗", pass: "–", tapt: "" };
    const igjen = Math.max(0, kortIgjen(sp) - (vis && r && r.utfall ? (r.utfall === "feil" && kortIgjen(sp) > 1 ? 2 : 1) : 0));
    return `<ol class="hv-bunke" aria-label="${sp.poeng} poeng, ${igjen} kort igjen">${kort
      .slice(0, sp.runder)
      .map((k) => `<li class="${k ? k.split(" ").map((c) => "hv-" + c).join(" ") : ""}" aria-hidden="true">${tegn[k.split(" ")[0]] || ""}</li>`)
      .join("")}</ol>`;
  }

  // Progress dots for the hint givers (the guesser has no dot).
  function prikker(r) {
    return `<div class="fremdrift" aria-hidden="true">${r.givere
      .map((i, n) => `<span class="prikk ${n === r.na ? "na" : n < r.na ? "ferdig" : ""}" style="--pf: var(--p${(i % 20) + 1})"></span>`)
      .join("")}</div>`;
  }

  // Top bar while the phone goes round: "Hint 2 av 4", or "Spiller 1 av 2" when each gives two.
  const hintTittel = (S) => `${S.spill.per === 2 ? "Spiller" : "Hint"} ${S.spill.r.na + 1} av ${S.spill.r.givere.length}`;

  const serBort = (g) => `<p class="hv-ser-bort">${R.avatar(g)}<span><b>${esc(R.navn(g))}</b> ser bort</span></p>`;

  function katOppsummering(S) {
    const valgt = S.oppsett.kategorier;
    if (valgt.length === KATEGORIER.length) return "Alle kategorier";
    if (!valgt.length) return "Ingen valgt";
    const navn = valgt.map((id) => kategori(id).navn);
    return navn.length <= 2 ? navn.join(" · ") : `${navn.slice(0, 2).join(" · ")} + ${navn.length - 2}`;
  }
  const katBrikker = (S) =>
    R.ui.brikker(
      "kat",
      KATEGORIER.map((k) => ({ v: k.id, tekst: k.navn, ikon: k.ikon })),
      S.oppsett.kategorier,
      { alle: true, etikett: "Kategorier" },
    );

  // ---------- The game ----------

  R.start({
    id: "hviskeren",
    versjon: 1,
    pagar, // true while a game runs: the front page's «Fortsett» badge and the wake lock use it

    tilstand: () => ({
      antall: 4,
      oppsett: { kategorier: ALLE_KAT.slice(), niva: "blandet", runder: 13 },
      spill: null,
    }),

    lastet(S) {
      const o = S.oppsett && typeof S.oppsett === "object" ? S.oppsett : (S.oppsett = {});
      o.kategorier = (Array.isArray(o.kategorier) ? o.kategorier : ALLE_KAT).filter((id) => kategori(id));
      if (!NIVA[o.niva]) o.niva = "blandet";
      if (![8, 13].includes(o.runder)) o.runder = 13;
      const sp = S.spill;
      const gyldig = sp && Array.isArray(sp.logg) && sp.r && ORD[sp.r.ord] && Array.isArray(sp.r.hint) && sp.antall >= 3;
      if (!gyldig) S.spill = null;
      if (!S.spill && !["hjem", "oppsett", null, undefined].includes(S.skjerm)) S.skjerm = "hjem";
      // The check screen resumes to the "guesser looks away" gate (gjenoppta), which then leads back to it.
      if (S.spill && S.skjerm === "sjekk") S.spill.r.mal = "sjekk";
    },

    regler: {
      intro: "Et samarbeidsspill. Én gjetter, de andre gir ett hint hver – men like hint blir strøket!",
      steg: [
        ["Gjetteren ser bort", "De andre ser det hemmelige ordet sammen på mobilen."],
        ["Ett hint hver", "Send mobilen rundt. Alle skriver ett ord i hemmelighet."],
        ["Gjett ordet", "Like hint strykes, og gjetteren ser bare resten. Riktig svar gir ett poeng."],
      ],
      tips: [
        "Pass er gratis, men feil svar koster et ekstra kort fra bunken.",
        "Det mest opplagte hintet blir ofte strøket – tenk litt annerledes enn de andre.",
        "Bøyninger regnes som like: bil, bilen og bilene stryker hverandre.",
        "Er dere bare tre, gir hver av dere to hint.",
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis: (S) =>
          R.ui.spillhjem({
            slagordHtml: "Alle gir ett hint i hemmelighet.<br><em>Men like hint blir strøket!</em>",
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: pagar(S) ? `Fortsett · runde ${S.spill.logg.length + 1}` : "",
              ekstraHtml: R.ui.lenke("Slik spiller du", "regler"),
            }),
            merker: [
              ["3–10", "spillere"],
              [R.tall(ORD.length), "ord"],
              ["Alle", "på samme lag"],
            ],
          }),
      },

      oppsett: {
        tittel: "Nytt spill",
        tilbake: "hjem",
        vis: (S) => {
          const n = antallOrd(S);
          return `
          <h1 id="skjerm-tittel">Gjør klart</h1>
          ${R.ui.spillere({
            min: 3,
            max: 10,
            hjelp: (S.antall || 4) <= 3 ? "Dere er tre, så hver av dere gir to hint." : "Dere bytter på å gjette.",
          })}
          <section class="seksjon">
            <div class="seksjon-hode"><h2>Ordene</h2><span class="tall">${R.tall(n)} ord</span></div>
            ${R.ui.seg(
              "niva",
              [
                ["lett", "Lette"],
                ["blandet", "Blandet"],
                ["vanskelig", "Vanskelige"],
              ],
              S.oppsett.niva,
              { etikett: "Vanskelighetsgrad" },
            )}
            <button class="hv-katknapp" data-h="kategorier"><span class="hv-kat-ikoner" aria-hidden="true">${S.oppsett.kategorier
              .slice(0, 4)
              .map((id) => kategori(id).ikon)
              .join("")}</span><span class="hv-kat-tekst"><small>Kategorier</small><b>${esc(katOppsummering(S))}</b></span><span class="hv-kat-endre">Endre</span></button>
          </section>
          <section class="seksjon">
            <div class="seksjon-hode"><h2>Lengde</h2></div>
            ${R.ui.seg(
              "runder",
              [
                ["8", "Kort · 8 ord"],
                ["13", "Vanlig · 13 ord"],
              ],
              String(S.oppsett.runder),
              { etikett: "Antall kort" },
            )}
          </section>
          ${R.ui.dokk(R.ui.knapp(n ? "Start" : "Velg minst én kategori", "start", { av: !n }))}`;
        },
      },

      runde: {
        tittel: (S) => `Runde ${S.spill.logg.length + 1}`,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const g = sp.r.gjetter;
          const sjekk = sp.r.mal === "sjekk";
          return `
            ${bunke(sp)}
            <div class="gi-til">
              ${R.avatar(g, "gigant")}
              <p class="etikett">Denne runden gjetter</p>
              <h1 id="skjerm-tittel">${esc(R.navn(g))}</h1>
              <p class="ikke-se">🙈 Snu deg bort – ikke se på mobilen!</p>
            </div>
            ${R.ui.dokk(
              R.ui.knapp(sjekk ? "Vis hintene til de andre" : "Vis ordet til de andre", "vis-ordet", { ikon: "🤫" }),
              R.ui.lenkerad(R.ui.lenke("Avslutt", "avslutt")),
            )}`;
        },
        inn(S) {
          S.spill.skjerm = "runde";
          R.holdVaken();
        },
      },

      ordet: {
        tittel: "Hemmelig ord",
        tilbake: "hjem",
        gjenoppta: "runde",
        vis(S) {
          const sp = S.spill;
          const o = ORD[sp.r.ord];
          const k = kategori(o.k) || { ikon: "💬", navn: "Ord" };
          return `
            <p class="hv-for-dere">Bare for dere som gir hint</p>
            <div class="bunke kompakt"><article class="storkort aksent hv-ordkort">
              <div class="storkort-topp"><span class="storkort-etikett">${esc(k.ikon + " " + k.navn)}</span><span class="storkort-nr">Runde ${sp.logg.length + 1}</span></div>
              <h1 class="kort-ord ${R.lengdeKlasse(o.o)}" id="skjerm-tittel">${esc(o.o)}</h1>
            </article></div>
            ${serBort(sp.r.gjetter)}
            <p class="hjelp">Se på ordet sammen. Så går mobilen rundt, og alle skriver ett hint i hemmelighet.</p>
            ${R.ui.dokk(
              R.ui.knapp("Skriv hint", "skriv", { ikon: "✍️" }),
              R.ui.lenkerad(R.ui.lenke("Bytt ord", "bytt-ord")),
            )}`;
        },
        inn(S) {
          S.spill.skjerm = "ordet";
          R.holdVaken();
        },
      },

      gi: {
        tittel: (S) => hintTittel(S),
        tilbake: "hjem",
        vis(S) {
          const r = S.spill.r;
          const i = r.givere[r.na];
          return `${prikker(r)}${R.ui.giTil({ i, h: "jeg-er", tekst: "Gi mobilen til" })}`;
        },
        inn(S) {
          S.spill.skjerm = "gi";
          R.holdVaken();
        },
      },

      skriv: {
        tittel: (S) => hintTittel(S),
        tilbake: "hjem",
        gjenoppta: "gi",
        vis(S) {
          const sp = S.spill;
          const r = sp.r;
          const i = r.givere[r.na];
          const o = ORD[r.ord];
          const to = sp.per === 2;
          const felt = (n, siste) =>
            `<input id="hint-${n}" class="tekstfelt hv-felt" name="hint${n}" data-felt="hint" maxlength="24" autocomplete="off" autocorrect="off" autocapitalize="sentences" spellcheck="false" enterkeyhint="${
              siste ? "done" : "next"
            }" placeholder="${to ? `Hint ${n}` : "Ett ord"}" aria-label="${to ? `Hint ${n}` : "Ditt hint"}" aria-describedby="hint-feil">`;
          return `
            ${prikker(r)}
            <form class="hv-skriv" data-skjema="hint" novalidate>
              <div class="hv-skriv-hode">${R.avatar(i, "mid")}<h1 id="skjerm-tittel">${to ? "Dine to hint" : "Ditt hint"}<small>${esc(R.navn(i))}</small></h1></div>
              <p class="hv-minne"><span>Ordet er</span><b>${esc(o.o)}</b></p>
              ${felt(1, !to)}
              ${to ? felt(2, true) : ""}
              <p class="feil" id="hint-feil" aria-live="assertive"></p>
              <button class="knapp" type="submit">Ferdig</button>
            </form>
            <p class="hjelp">Ett ord. Like hint blir strøket – så tenk litt annerledes enn de andre!</p>`;
        },
        inn(S) {
          S.spill.skjerm = "skriv";
          R.holdVaken();
          const f = R.$("#hint-1");
          if (f) {
            try {
              f.focus({ preventScroll: true });
            } catch (e) {
              f.focus();
            }
          }
        },
      },

      sjekk: {
        tittel: "Sjekk hintene",
        tilbake: "hjem",
        gjenoppta: "runde",
        vis(S) {
          const sp = S.spill;
          const r = sp.r;
          const o = ORD[r.ord];
          const igjen = r.hint.filter((h) => !h.s).length;
          const auto = r.hint.some((h) => h.a);
          return `
            <div class="hv-sjekk-hode">
              <p class="hv-minne liten"><span>Ordet er</span><b>${esc(o.o)}</b></p>
              <h1 id="skjerm-tittel">Sjekk hintene</h1>
              <p class="ingress">Se på hintene sammen. ${auto ? "Like hint er strøket automatisk." : "Ingen var helt like!"} Trykk på et hint for å stryke det – eller hente det tilbake.</p>
            </div>
            <div class="hv-lapper">${r.hint.map((h, n) => lapp(h, n, { knapp: true })).join("")}</div>
            ${R.ui.dokk(
              `<p class="hv-status">${igjen ? `<b>${igjen}</b> av ${r.hint.length} hint går videre` : "Alle hintene er strøket 😬"}</p>`,
              R.ui.knapp(`Gi mobilen til ${R.navn(r.gjetter)}`, "til-gjetter"),
            )}`;
        },
        inn(S) {
          S.spill.skjerm = "sjekk";
          R.holdVaken();
        },
      },

      gjetter: {
        tittel: "Gjett",
        tilbake: "hjem",
        vis(S) {
          const r = S.spill.r;
          const g = r.gjetter;
          const igjen = r.hint.filter((h) => !h.s).length;
          return `
            <div class="gi-til">
              ${R.avatar(g, "gigant")}
              <p class="etikett">Gi mobilen til gjetteren</p>
              <h1 id="skjerm-tittel">${esc(R.navn(g))}</h1>
              <p class="hv-klar">${igjen ? `✨ ${igjen} hint venter på deg` : "😬 Ingen hint overlevde"}</p>
            </div>
            ${R.ui.dokk(R.ui.knapp(`Jeg er ${R.navn(g)}`, "jeg-gjetter"))}`;
        },
        inn(S) {
          S.spill.skjerm = "gjetter";
          R.holdVaken();
        },
      },

      gjett: {
        tittel: (S) => `Runde ${S.spill.logg.length + 1}`,
        tilbake: "hjem",
        vis(S) {
          const r = S.spill.r;
          const synlige = r.hint.filter((h) => !h.s);
          const strok = r.hint.length - synlige.length;
          return `
            <div class="hv-gjett-hode">
              <p class="etikett">Hintene dine, ${esc(R.navn(r.gjetter))}</p>
              <h1 id="skjerm-tittel">Hva er ordet?</h1>
            </div>
            ${
              synlige.length
                ? `<div class="hv-lapper stor">${synlige.map((h, n) => lapp(h, n)).join("")}</div>`
                : `<div class="tom">${R.figur()}<p>Alle hintene ble strøket. Gjett i blinde – eller pass.</p></div>`
            }
            ${strok && synlige.length ? `<p class="hjelp">${strok} hint ble strøket</p>` : ""}
            ${R.ui.dokk(
              `<p class="hv-status">Si gjetningen høyt – og sjekk svaret.</p>`,
              R.ui.knapp("Sjekk svaret", "sjekk-svar", { ikon: "🔍" }),
              R.ui.knapp2("Pass – jeg vet ikke", "pass"),
            )}`;
        },
        inn(S) {
          S.spill.skjerm = "gjett";
          R.holdVaken();
        },
      },

      svar: {
        tittel: "Fasit",
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.r;
          const o = ORD[r.ord];
          const u = r.utfall;
          const g = R.navn(r.gjetter);
          const kort = `<div class="bunke kompakt"><article class="storkort aksent hv-ordkort ${u ? "stille" : "avslor"}">
              <div class="storkort-topp"><span class="storkort-etikett">Ordet var</span></div>
              <h1 class="kort-ord ${R.lengdeKlasse(o.o)}" id="skjerm-tittel">${esc(o.o)}</h1>
            </article></div>`;
          if (!u) {
            return `${kort}
              <p class="hv-sporsmal">Gjettet ${esc(g)} riktig?</p>
              ${R.ui.dokk(`<div class="knapprad">${R.ui.knapp("Feil", "feil", { variant: "rod", ikon: "✗" })}${R.ui.knapp("Riktig!", "riktig", { variant: "mynte", ikon: "✓" })}</div>`)}`;
          }
          const ekstra = u === "feil" && kortIgjen(sp) > 1;
          const poeng = sp.poeng + (u === "riktig" ? 1 : 0);
          const igjen = kortIgjen(sp) - 1 - (ekstra ? 1 : 0);
          const STEMPEL = { riktig: ["Riktig!", "mynte"], feil: ["Feil", ""], pass: ["Pass", "lampe"] };
          const tekst = {
            riktig: "Godt jobba! Ett poeng til laget.",
            feil: ekstra ? "Au! Feil svar koster et ekstra kort fra bunken." : "Au! Det var siste kort, så det koster ikke mer.",
            pass: "Ingen skade skjedd – pass er gratis.",
          }[u];
          return `${kort}
            <div class="stempel-sted"><span class="stempel ${STEMPEL[u][1]}">${STEMPEL[u][0]}</span></div>
            <p class="hv-utfall">${tekst}</p>
            ${bunke(sp, true)}
            <p class="hv-stand"><b>${poeng}</b> ${poeng === 1 ? "poeng" : "poeng"} · <b>${Math.max(0, igjen)}</b> kort igjen</p>
            <section class="seksjon hv-runden">
              <h2 class="etikett">Hintene denne runden</h2>
              <div class="hv-lapper liten">${r.hint.map((h, n) => lapp(h, n)).join("")}</div>
            </section>
            ${R.ui.dokk(
              R.ui.knapp(igjen > 0 ? "Neste runde" : "Se resultatet", "neste"),
              R.ui.lenkerad(R.ui.lenke("Angre", "angre")),
            )}`;
        },
        inn(S) {
          S.spill.skjerm = "svar";
          R.holdVaken();
        },
      },

      slutt: {
        tittel: "Kåringen",
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const spilt = sp.logg.length + sp.tapt;
          const tidlig = spilt < sp.runder;
          const [, tittel, tekst, ikon] = tidlig ? [0, "Spillet ble avsluttet", "Dere kan alltid prøve igjen.", "👋"] : vurdering(sp.poeng, sp.runder);
          return `
            <div class="banner aksent">
              ${R.figur()}
              <p class="etikett">${sp.poeng} av ${sp.runder} ord riktig</p>
              <h1 id="skjerm-tittel"><span aria-hidden="true">${ikon}</span> ${esc(tittel)}</h1>
              <p class="ingress">${esc(tekst)}</p>
            </div>
            ${bunke(sp)}
            <section class="seksjon"${sp.logg.length ? "" : " hidden"}>
              <h2 class="etikett">Ordene</h2>
              <ol class="hv-logg">${sp.logg
                .map(
                  (l) =>
                    `<li class="hv-${l.u}"><span class="hv-logg-merke" aria-hidden="true">${{ riktig: "✓", feil: "✗", pass: "–" }[l.u]}</span><b>${esc(l.o)}</b><span>${esc(
                      R.navn(l.g),
                    )}</span><span class="vh">${{ riktig: "riktig", feil: "feil", pass: "pass" }[l.u]}</span></li>`,
                )
                .join("")}</ol>
            </section>
            ${R.ui.flereSpill({ antall: sp.antall })}
            ${R.ui.dokk(R.ui.knapp("Spill igjen", "igjen"), R.ui.lenkerad(R.ui.lenke("Endre oppsett", "nytt"), '<a class="lenke" href="/">Alle spill</a>'))}`;
        },
        inn(S) {
          const sp = S.spill;
          if (sp.logg.length + sp.tapt >= sp.runder && sp.poeng / sp.runder >= 0.6) {
            R.lyd.fanfare();
            R.konfetti();
          } else if (sp.poeng > 0) R.lyd.pling();
          R.slippVaken();
        },
      },
    },

    skjema: {
      hint(S, form) {
        const sp = S.spill;
        const r = sp.r;
        const i = r.givere[r.na];
        const felt = Array.from(form.querySelectorAll("input"));
        const feil = R.$("#hint-feil");
        const vis = (melding, f) => {
          feil.textContent = melding;
          f.classList.remove("risting");
          void f.offsetWidth;
          f.classList.add("risting");
          f.setAttribute("aria-invalid", "true");
          f.focus();
          R.lyd.feil();
          R.vibrer(60);
        };
        // Two fields: Enter in the first one just moves on to the second.
        if (felt.length === 2 && document.activeElement === felt[0] && felt[0].value.trim() && !felt[1].value.trim()) {
          felt[1].focus();
          return;
        }
        const tekster = [];
        for (const f of felt) {
          const grunn = sjekkHint(f.value, ORD[r.ord].o, tekster);
          if (grunn) return vis(FEILMELDING[grunn], f);
          tekster.push(f.value.trim());
        }
        tekster.forEach((t) => r.hint.push({ i, t: t.slice(0, 24), a: false, s: false }));
        R.lyd.pop();
        R.vibrer(15);
        r.na += 1;
        if (r.na < r.givere.length) {
          R.gaTil("gi");
          return;
        }
        // Everyone has written: strike hints that have a twin.
        finnLike(r.hint.map((h) => h.t)).forEach((like, n) => {
          r.hint[n].a = like;
          r.hint[n].s = like;
        });
        if (r.hint.some((h) => h.a)) R.lyd.bom();
        R.gaTil("sjekk");
      },
    },

    felt: {
      hint(S, el) {
        el.removeAttribute("aria-invalid");
        const feil = R.$("#hint-feil");
        if (feil && feil.textContent) feil.textContent = "";
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
      hjem: () => R.gaTil("hjem"),
      fortsett(el, e, S) {
        if (!S.spill) return R.gaTil("oppsett");
        R.holdVaken();
        R.gaTil(porten(S, S.spill.skjerm));
      },
      niva(el, e, S) {
        S.oppsett.niva = el.dataset.v;
        R.vis();
      },
      runder(el, e, S) {
        S.oppsett.runder = Number(el.dataset.v) === 8 ? 8 : 13;
        R.vis();
      },
      kategorier(el, e, S) {
        R.ark(`
          <h2 id="ark-tittel">Kategorier</h2>
          <p class="ingress">Ordene trekkes fra kategoriene dere velger.</p>
          <div id="hv-kat">${katBrikker(S)}</div>
          <button class="knapp" data-h="lukk-ark">Ferdig</button>`);
      },
      kat(el, e, S) {
        const v = el.dataset.v;
        const liste = S.oppsett.kategorier;
        if (v === "*") S.oppsett.kategorier = liste.length === KATEGORIER.length ? [] : ALLE_KAT.slice();
        else S.oppsett.kategorier = liste.includes(v) ? liste.filter((x) => x !== v) : ALLE_KAT.filter((x) => x === v || liste.includes(x));
        const boks = R.$("#hv-kat");
        if (boks) {
          boks.innerHTML = katBrikker(S);
          const ny = boks.querySelector(`[data-v="${CSS.escape(v)}"]`);
          if (ny) ny.focus({ preventScroll: true });
        }
        R.vis();
      },
      start(el, e, S) {
        if (!antallOrd(S)) return;
        const antall = R.klamp(S.antall || 4, 3, 10);
        S.antall = antall;
        S.spill = {
          antall,
          per: antall === 3 ? 2 : 1,
          runder: S.oppsett.runder,
          start: R.heltall(0, antall - 1),
          poeng: 0,
          tapt: 0,
          logg: [],
          r: null,
          skjerm: "runde",
          ferdig: false,
        };
        nyRunde(S);
        R.holdVaken();
        R.gaTil("runde");
      },
      "vis-ordet"(el, e, S) {
        const mal = S.spill.r.mal === "sjekk" ? "sjekk" : "ordet";
        S.spill.r.mal = "ordet";
        R.lyd.snu();
        R.gaTil(mal);
      },
      "bytt-ord"(el, e, S) {
        S.spill.r.ord = nyttOrd(S);
        R.lyd.sveip();
        R.vis();
      },
      skriv(el, e, S) {
        S.spill.r.na = 0;
        S.spill.r.hint = [];
        R.gaTil("gi");
      },
      "jeg-er": () => R.gaTil("skriv"),
      stryk(el, e, S) {
        const h = S.spill.r.hint[Number(el.dataset.v)];
        if (!h) return;
        h.s = !h.s;
        if (h.s) R.lyd.takk();
        else R.lyd.pop();
        R.vis();
      },
      "til-gjetter": () => R.gaTil("gjetter"),
      "jeg-gjetter": () => R.gaTil("gjett"),
      "sjekk-svar"(el, e, S) {
        R.lyd.trommevirvel(0.6);
        R.gaTil("svar");
      },
      pass(el, e, S) {
        S.spill.r.utfall = "pass";
        R.lyd.sveip();
        R.gaTil("svar");
      },
      riktig(el, e, S) {
        S.spill.r.utfall = "riktig";
        R.lyd.riktig();
        R.vibrer([30, 40, 60]);
        R.konfetti();
        R.vis();
        R.si("Riktig! Ett poeng.");
      },
      feil(el, e, S) {
        S.spill.r.utfall = "feil";
        R.lyd.feil();
        R.vibrer([80, 40, 80]);
        R.vis();
        R.si("Feil svar.");
      },
      angre(el, e, S) {
        S.spill.r.utfall = null;
        R.vis();
      },
      neste(el, e, S) {
        const sp = S.spill;
        const r = sp.r;
        if (!r.utfall) return;
        const ekstra = r.utfall === "feil" && kortIgjen(sp) > 1 ? 1 : 0;
        if (r.utfall === "riktig") sp.poeng += 1;
        sp.tapt += ekstra;
        sp.logg.push({ o: ORD[r.ord].o, u: r.utfall, g: r.gjetter, x: ekstra });
        if (kortIgjen(sp) <= 0) {
          sp.ferdig = true;
          R.gaTil("slutt");
          return;
        }
        nyRunde(S);
        R.gaTil("runde");
      },
      async avslutt(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreft("Avslutte spillet?", "Dere ser poengene så langt.", "Avslutt", "Spill videre")) || !fortsatt() || !S.spill) return;
        S.spill.ferdig = true;
        R.gaTil("slutt");
      },
      igjen(el, e, S) {
        S.spill = null;
        H.start(el, e, S);
      },
    }),
  });
})();
