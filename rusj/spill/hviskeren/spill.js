/* Hviskeren — "Bare ett hint": a co-operative word game for 3–10 players.
   One player guesses. The others see the secret word and each give one hint in secret. Hints that
   are the same cancel each other out, and the guesser only sees what is left.
   Two ways to play:
     «Én mobil»       the phone goes round, one screen per hint giver. Equal hints are struck
                      automatically (also bil/bilen/biler/bilene and a doubled letter) and by tapping.
     «Alle samtidig»  everyone writes on a note or on their own phone while this phone shows the
                      word and keeps the time (45 s). The players compare the notes themselves.
   A deck of 8 or 13 cards; a wrong guess costs an extra card, a pass is free. Hard mode: the most
   obvious hint is printed on the card and is not allowed. The best result per deck length is kept
   on this phone. */
(function () {
  "use strict";

  const R = window.Rusj;
  const esc = R.esc;

  // =====================================================================================
  // Word matching — pure functions, exposed as window.HviskerenOrd for the tests.
  // =====================================================================================

  // The edition decides the language of the hints: Norwegian, English or Danish word forms.
  const SPRAK = R.sprak === "en" || R.sprak === "da" ? R.sprak : "nb";
  const harEgen = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  // Irregular noun forms → base form (the regular ones are handled by ENDELSER).
  const UREGELRETT_NB = {
    menn: "mann", mennene: "mann", bøker: "bok", bøkene: "bok", føtter: "fot", føttene: "fot",
    hender: "hånd", hendene: "hånd", tenner: "tann", tennene: "tann", netter: "natt", nettene: "natt", // sprak-ok
    røtter: "rot", røttene: "rot", bønder: "bonde", bøndene: "bonde", kyr: "ku", kyrne: "ku",
    gjess: "gås", gjessene: "gås", tær: "tå", tærne: "tå", knær: "kne", knærne: "kne", trær: "tre", // sprak-ok
    trærne: "tre", strender: "strand", strendene: "strand", øyne: "øye", øynene: "øye", brødre: "bror", // sprak-ok
    brødrene: "bror", døtre: "datter", døtrene: "datter", mødre: "mor", mødrene: "mor", fedre: "far",
    fedrene: "far", søstre: "søster", søstrene: "søster", ender: "and", endene: "and", stenger: "stang", // sprak-ok
    tenger: "tang", lus: "lus", mus: "mus",
  };
  // English: irregular plurals and the commonest irregular verbs (ran → run, flew → fly).
  const UREGELRETT_EN = {
    men: "man", women: "woman", children: "child", feet: "foot", teeth: "tooth", mice: "mouse", geese: "goose",
    people: "person", oxen: "ox", cacti: "cactus", fungi: "fungus", dice: "die", lice: "louse",
    ran: "run", swam: "swim", sang: "sing", rang: "ring", ate: "eat", went: "go", gone: "go", flew: "fly", flown: "fly",
    drew: "draw", drawn: "draw", threw: "throw", thrown: "throw", caught: "catch", bought: "buy", brought: "bring",
    taught: "teach", thought: "think", wrote: "write", written: "write", rode: "ride", ridden: "ride", froze: "freeze",
    frozen: "freeze", sat: "sit", stood: "stand", fell: "fall", fallen: "fall", built: "build", slept: "sleep",
    kept: "keep", felt: "feel", made: "make", said: "say", told: "tell", sold: "sell", won: "win", lost: "lose",
    broke: "break", broken: "break", hid: "hide", hidden: "hide", bit: "bite", bitten: "bite", drove: "drive",
    driven: "drive", grew: "grow", grown: "grow", knew: "know", known: "know", saw: "see", seen: "see", took: "take",
    taken: "take", gave: "give", given: "give", sank: "sink", sunk: "sink", dug: "dig", spun: "spin", swung: "swing",
  };
  // Danish: irregular plurals (mænd, bøger, fødder, børn …).
  const UREGELRETT_DA = {
    mænd: "mand", mændene: "mand", bøger: "bog", bøgerne: "bog", fødder: "fod", fødderne: "fod", // sprak-ok
    hænder: "hånd", hænderne: "hånd", tænder: "tand", tænderne: "tand", nætter: "nat", nætterne: "nat", // sprak-ok
    rødder: "rod", rødderne: "rod", bønder: "bonde", bønderne: "bonde", køer: "ko", køerne: "ko", // sprak-ok
    gæs: "gås", gæssene: "gås", tæer: "tå", tæerne: "tå", knæene: "knæ", træer: "træ", træerne: "træ", // sprak-ok
    øjne: "øje", øjnene: "øje", brødre: "bror", brødrene: "bror", døtre: "datter", døtrene: "datter", // sprak-ok
    mødre: "mor", mødrene: "mor", fædre: "far", fædrene: "far", søstre: "søster", søstrene: "søster", // sprak-ok
    ænder: "and", ænderne: "and", børn: "barn", børnene: "barn", stænger: "stang", tænger: "tang", // sprak-ok
    øer: "ø", øerne: "ø", lus: "lus", mus: "mus", ting: "ting", // sprak-ok
  };
  const UREGELRETT = SPRAK === "en" ? UREGELRETT_EN : SPRAK === "da" ? UREGELRETT_DA : UREGELRETT_NB;
  // Endings of definite and plural nouns (bilen, biler, bilene, huset, jenta), adjectives (rødt,
  // røde, blått) and verbs (kaster, kastet). Longest first. Past tense -te/-de is left out on
  // purpose: it would make bilde match bil and matte match mat.
  const ENDELSER = ["ene", "ane", "er", "ar", "en", "et", "tt", "a", "e", "t", "r", "n"];

  // The key a word is compared by: lower case, accents and punctuation gone, no spaces.
  const nokkel = (tekst) => R.normaliser(tekst).replace(/ /g, "");

  // English: plurals (cats, boxes, babies, wolves), past tense and -ing (jumped, baking, running).
  // -er/-est are left out on purpose: they would make water match wat and letter match let.
  const ENDELSER_EN = ["ies", "ves", "es", "ing", "ed", "s"];
  function stammerEn(ord) {
    const ut = new Set([ord]);
    if (harEgen(UREGELRETT, ord)) ut.add(UREGELRETT[ord]);
    for (const e of ENDELSER_EN) {
      if (!ord.endsWith(e)) continue;
      const rest = ord.slice(0, -e.length);
      if (e === "ies") {
        if (rest.length >= 2) ut.add(rest + "y"); // babies → baby
        continue;
      }
      if (e === "ves") {
        if (rest.length >= 2) ut.add(rest + "f").add(rest + "fe"); // wolves → wolf, knives → knife
        continue;
      }
      // A plain -s never splits a double s (glass) and leaves three letters (bus is not bu + s).
      if (e === "s" && (rest.length < 3 || rest.endsWith("s") || /(us|is)$/.test(ord))) continue;
      if ((e === "ing" || e === "ed") && rest.length < 3) continue;
      if (e === "es" && rest.length < 2) continue;
      ut.add(rest);
      if (e === "ing" || e === "ed") {
        ut.add(rest + "e"); // baking → bake
        if (/([bdgklmnprtz])\1$/.test(rest)) ut.add(rest.slice(0, -1)); // running → run
      }
    }
    return ut;
  }

  // Danish: definite and plural nouns (bilen, biler, bilerne, huset, husene), adjectives (rødt,
  // røde) and verbs (kaster, kastede). A doubled consonant before the ending is undone (katten,
  // kattene, dammen), and the e before a final l or r drops out as in Norwegian (cykel → cykler).
  const ENDELSER_DA = ["erne", "ene", "ede", "er", "en", "et", "e", "t", "r", "n"];
  function stammerDa(ord) {
    const ut = new Set([ord]);
    if (harEgen(UREGELRETT, ord)) ut.add(UREGELRETT[ord]);
    const el = /^(.*[^aeiouyæøå])e([lr])$/.exec(ord);
    if (el) {
      const uten = el[1] + el[2];
      ut.add(uten);
      ut.add(uten.replace(/([^aeiouyæøå])\1([lr])$/, "$1$2"));
    }
    for (const e of ENDELSER_DA) {
      if (!ord.endsWith(e) || ord.length - e.length < 2) continue;
      const rest = ord.slice(0, -e.length);
      if (e.length === 1 && (rest.endsWith(e) || rest.length < 3)) continue;
      ut.add(rest);
      if (/([bdfgklmnprstv])\1$/.test(rest)) ut.add(rest.slice(0, -1));
    }
    return ut;
  }

  // Possible base forms of one key: the key itself, an irregular base and the key minus one ending.
  function stammer(ord) {
    if (SPRAK === "en") return stammerEn(ord);
    if (SPRAK === "da") return stammerDa(ord);
    const ut = new Set([ord]);
    if (Object.prototype.hasOwnProperty.call(UREGELRETT, ord)) ut.add(UREGELRETT[ord]);
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

  // The plural/definite endings taken off before looking for a compound part.
  const DEL_ENDELSER = SPRAK === "en" ? ["es", "s"] : SPRAK === "da" ? ["erne", "ene", "er", "en", "et"] : ["ene", "er", "en", "et"];
  // One key is a part of the other in a compound: ball in fotball, hest in gyngehest, fisk in
  // fiskestang. Deliberately careful, because a wrong block is more annoying than a missed one
  // (the players can still strike hints by hand): both parts need at least 4 and 3 letters, so
  // mat/matematikk, and/vestlandet and bil/bilde are let through.
  function delAv(a, b) {
    const former = (o) => {
      const ut = new Set([o]);
      if (Object.prototype.hasOwnProperty.call(UREGELRETT, o)) ut.add(UREGELRETT[o]);
      for (const e of DEL_ENDELSER) if (o.endsWith(e) && o.length - e.length >= 4) ut.add(o.slice(0, -e.length));
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

  // Hard mode: is this key the forbidden hint, or a form of it? A forbidden hint of two words
  // («Hvit saus», «17. mai») rules out each of the words.
  function forbudtHint(k, forbudt) {
    const deler = R.normaliser(forbudt).split(" ").filter(Boolean);
    if (!k || !deler.length) return false;
    return likeOrd(k, deler.join("")) || (deler.length > 1 && deler.some((d) => d.length >= 2 && likeOrd(k, d)));
  }

  // Checks a typed hint. Returns null when it is fine, otherwise the reason.
  // egne = the other hint(s) this player already wrote this round; forbudt = the hint that is
  // not allowed in hard mode ("" otherwise).
  function sjekkHint(hint, hemmelig, egne, forbudt) {
    const ren = String(hint || "").trim();
    if (!ren) return "tom";
    if (/\s/.test(ren)) return "flere";
    const k = nokkel(ren);
    if (!k) return "tegn";
    const deler = R.normaliser(hemmelig).split(" ").filter(Boolean);
    const hel = deler.join("");
    if (likeOrd(k, hel) || deler.some((d) => d.length >= 3 && likeOrd(k, d))) return "samme";
    if (delAv(k, hel) || (deler.length > 1 && deler.some((d) => d.length >= 3 && delAv(k, d)))) return "del";
    if (forbudt && forbudtHint(k, forbudt)) return "forbudt";
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
    tom: R.t("Skriv ett ord først."),
    flere: R.t("Bare ett ord – uten mellomrom."),
    tegn: R.t("Hintet må ha bokstaver eller tall."),
    samme: R.t("Det er jo selve ordet! Finn på noe annet."),
    del: R.t("For likt ordet – det er en del av det. Prøv et annet hint."),
    egen: R.t("Det hintet har du allerede skrevet."),
  };

  window.HviskerenOrd = { nokkel, stammer, likeOrd, delAv, sjekkHint, finnLike, forbudtHint };

  // =====================================================================================
  // Words from the shared word bank
  // =====================================================================================

  const BANK = window.RUSJ_ORD || { kategorier: [] };
  // Phrases with commas or more than two words make poor secret words for one-word hints.
  const egnet = (o) => !/[,!?]/.test(o) && o.trim().split(/\s+/).length <= 2;
  const KATEGORIER = BANK.kategorier.map((k) => ({ id: k.id, navn: k.navn, ikon: k.ikon }));
  // o = the word, n = difficulty 1–3, h = the bank's own obvious hint (the forbidden one in hard mode).
  const ORD = [];
  BANK.kategorier.forEach((k) =>
    k.ord.forEach((e) => {
      if (egnet(e[0])) ORD.push({ k: k.id, o: e[0], n: e[1], h: String(e[2] || "").trim() });
    }),
  );
  const kategori = (id) => KATEGORIER.find((k) => k.id === id);
  const ALLE_KAT = KATEGORIER.map((k) => k.id);
  const NIVA = { lett: [1], blandet: [1, 2], vanskelig: [2, 3] };
  const harNiva = (n) => typeof n === "string" && Object.prototype.hasOwnProperty.call(NIVA, n);
  const stokk = R.kortstokk("ord", ORD.length);

  const passer = (S, n) => S.oppsett.kategorier.includes(ORD[n].k) && NIVA[S.oppsett.niva].includes(ORD[n].n);
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

  const MIN = 3;
  const MAKS = 10;
  const LENGDER = [8, 13];
  const TID = 45; // seconds to write a hint in «Alle samtidig»
  const UTFALL = { riktig: "riktig", feil: "feil", pass: "pass" };
  const erUtfall = (u) => typeof u === "string" && Object.prototype.hasOwnProperty.call(UTFALL, u);

  let H; // the actions, so one can call another

  const pagar = (S) => !!(S.spill && !S.spill.ferdig);

  // A fresh setup starts from the group that is saved on this phone.
  const lagredeNavn = () => R.felles.navn.filter((n) => String(n || "").trim()).length;
  const antallSpillere = (S) => R.klamp(Math.round(Number(S.antall)) || 4, MIN, MAKS);

  // The deck length follows the group until it is chosen by hand. One phone: a card takes about
  // 13 s per hint giver on top of the rest, so 13 cards up to six players and 8 from seven.
  // Everyone at once: about a minute per card whatever the group, so the full deck.
  const lengde = (S) => (S.oppsett.lengdeValgt ? S.oppsett.runder : S.oppsett.modus === "en" && antallSpillere(S) >= 7 ? 8 : 13);

  // An honest guess at how long the game takes, to the nearest five minutes.
  function minutter(S) {
    const n = antallSpillere(S);
    const sek = S.oppsett.modus === "alle" ? 75 : 55 + 13 * (n === 3 ? 3 : n - 1);
    return Math.max(5, Math.round((lengde(S) * sek) / 300) * 5);
  }

  // Cards still in the deck, counting the one being played.
  const kortIgjen = (sp) => sp.runder - sp.logg.length - sp.tapt;

  function nyRunde(S) {
    const sp = S.spill;
    const gjetter = (sp.start + sp.logg.length) % sp.antall;
    const givere = [];
    for (let k = 1; k < sp.antall; k++) givere.push((gjetter + k) % sp.antall);
    sp.r = { gjetter, ord: -1, givere, na: 0, hint: [], utfall: null, mal: "ordet", igjen: TID, pause: false };
    sp.r.ord = nyttOrd(S);
  }

  // Screens that show the secret word or the hints to the hint givers. «Fortsett» (and a reload,
  // through the screens' gjenoppta) never goes straight to them: first the gate where the guesser
  // is told to look away («runde»), which then leads on to r.mal.
  const BAK_PORTEN = ["ordet", "skriv", "sjekk", "tid", "lapper"];

  // The screen a running game can be picked up on, given what has happened in the round.
  function sted(sp, skjerm) {
    if (sp.ferdig) return "slutt";
    const r = sp.r;
    if (sp.modus === "alle") {
      if (skjerm === "svar") return r.utfall ? "svar" : "lapper";
      return ["runde", "ordet", "tid", "lapper"].includes(skjerm) ? skjerm : "runde";
    }
    const alleInne = r.na >= r.givere.length;
    if (skjerm === "skriv") return alleInne ? "sjekk" : "skriv";
    if (["sjekk", "gjetter", "gjett", "svar"].includes(skjerm)) return alleInne ? skjerm : r.hint.length ? "skriv" : "runde";
    return skjerm === "ordet" ? "ordet" : "runde";
  }

  function porten(S, skjerm) {
    const mal = sted(S.spill, skjerm);
    if (!BAK_PORTEN.includes(mal)) return mal;
    S.spill.r.mal = mal;
    return "runde";
  }

  const VURDERING = [
    [1, R.t("Telepater!"), R.t("Alle sammen. Hvert eneste ord. Dere deler visst én hjerne."), "🔮"],
    [0.9, R.t("Hjernetvillinger"), R.t("Nesten feilfritt – dere er på samme bølgelengde."), "🧠"],
    [0.75, R.t("Hviskemestere"), R.t("Sterkt! De fleste hintene traff blink."), "🏆"],
    [0.6, R.t("Godt samkjørt"), R.t("Mer riktig enn feil. Dette lover godt."), "🤝"],
    [0.4, R.t("Lovende gjeng"), R.t("Noen hint fløy forbi, men dere er på vei."), "🌱"],
    [0.2, R.t("Litt støy på linja"), R.t("Hintene kom fram, men ikke helt slik dere mente."), "📻"],
    [0, R.t("Hvem hvisket hva?"), R.t("Det var mer hvisking enn treff denne gangen. Ny runde?"), "🙊"],
  ];
  const vurdering = (poeng, runder) => VURDERING.find(([grense]) => poeng / runder >= grense - 1e-9);
  window.HviskerenOrd.vurdering = (poeng, runder) => vurdering(poeng, runder)[1]; // for the tests

  // ---------- Records (the best result per deck length, hard mode apart) ----------

  const rekordNokkel = (runder, forbudt) => `${runder}${forbudt ? "f" : ""}`;
  const REKORDNOKLER = ["13", "8", "13f", "8f"]; // also the order the home screen looks for one to show
  const rekordTekst = (n, poeng) => R.t("{poeng} av {n}", { poeng, n: parseInt(n, 10) });

  // The first chip on the home screen: the record for the deck that is set up now, else the best other one.
  function rekordMerke(S) {
    const n = [rekordNokkel(lengde(S), S.oppsett.forbudt), ...REKORDNOKLER].find((k) => S.rekorder[k] > 0);
    return n ? [R.t("REKORD"), rekordTekst(n, S.rekorder[n]) + (n.endsWith("f") ? ` · ${R.t("vanskelig")}` : "")] : null;
  }

  // The game is over: «Kåringen». Runs once per game. A record needs the whole deck.
  function kar(S, avbrutt) {
    const sp = S.spill;
    if (sp.ferdig) return;
    sp.ferdig = true;
    sp.avbrutt = !!avbrutt;
    sp.feiret = false;
    sp.rek = null;
    if (!avbrutt && sp.poeng > 0) {
      const n = rekordNokkel(sp.runder, sp.forbudt);
      const gml = S.rekorder[n] || 0;
      if (!gml) sp.rek = { t: Object.keys(S.rekorder).length ? "oppsett" : "forste", g: 0 };
      else sp.rek = { t: sp.poeng > gml ? "ny" : sp.poeng === gml ? "lik" : "under", g: gml };
      if (sp.poeng > gml) S.rekorder[n] = sp.poeng;
    }
    R.statistikk("ferdig", { runder: sp.logg.length, avbrutt: !!avbrutt, poeng: sp.poeng, kort: sp.runder, modus: sp.modus, forbudt: !!sp.forbudt });
    R.gaTil("slutt");
  }

  // Puts the round that was just judged into the log. False when there is nothing to put there.
  function bokfor(S) {
    const sp = S.spill;
    const r = sp.r;
    if (!erUtfall(r.utfall)) return false;
    const ekstra = r.utfall === "feil" && kortIgjen(sp) > 1 ? 1 : 0;
    if (r.utfall === "riktig") sp.poeng += 1;
    sp.tapt += ekstra;
    // The hints are kept too, the struck ones as well: they are the best part of the recap.
    sp.logg.push({ o: ORD[r.ord].o, u: r.utfall, g: r.gjetter, x: ekstra, h: r.hint.map((h) => ({ i: h.i, t: h.t, s: !!h.s })) });
    r.utfall = null;
    return true;
  }

  // «Hviskeren 9/13 – Godt samkjørt» and one mark per card. Never a word or a hint: the next
  // group may get the same cards.
  function delTekst(sp) {
    const spilt = sp.logg.length + sp.tapt;
    const merker = sp.logg.map((l) => ({ riktig: "✅", feil: "❌", pass: "➖" })[l.u] + (l.x ? "▪️" : "")).join("");
    const navn = (window.RUSJ_SPILL && window.RUSJ_SPILL.navn) || "Hviskeren";
    const hode =
      sp.avbrutt || spilt < sp.runder
        ? R.t("{navn} {poeng}/{antall} – avsluttet etter {spilt} av {kort} kort", { navn, poeng: sp.poeng, antall: sp.logg.length, spilt, kort: sp.runder })
        : sp.forbudt
          ? R.t("{navn} {poeng}/{antall} med forbudt hint – {vurdering}", { navn, poeng: sp.poeng, antall: sp.runder, vurdering: vurdering(sp.poeng, sp.runder)[1] })
          : `${navn} ${sp.poeng}/${sp.runder} – ${vurdering(sp.poeng, sp.runder)[1]}`;
    return `${hode}\n${merker}`;
  }

  // The "install as an app" tip at a calm moment – only if the players are still on this screen.
  // (The kit shows it after R.kveld.registrer; a co-op game has no evening score and calls it here.)
  function visTipsSnart() {
    const fortsatt = R.vakt();
    setTimeout(() => fortsatt() && R.visInstallTips(), 2500);
  }

  // Keyboard and screen-reader focus after a redraw that removed the pressed button.
  function fokus(sel) {
    const el = R.$(sel);
    if (!el) return;
    if (/^H[12]$/.test(el.tagName)) el.setAttribute("tabindex", "-1");
    try {
      el.focus({ preventScroll: true });
    } catch (e) {
      el.focus();
    }
  }

  // ---------- Validation of a saved game ----------

  // Returns the saved game cleaned up, or null when it can't be played on. Everything a screen
  // reads is checked here, so a damaged save ends on the home screen and never on a blank page.
  function rensSpill(sp) {
    if (!sp || typeof sp !== "object" || Array.isArray(sp)) return null;
    const antall = sp.antall;
    if (!Number.isInteger(antall) || antall < MIN || antall > MAKS) return null;
    if (!LENGDER.includes(sp.runder) || !Array.isArray(sp.logg) || sp.logg.length > sp.runder) return null;
    const spiller = (i) => Number.isInteger(i) && i >= 0 && i < antall;
    const hintliste = (liste, maks) =>
      (Array.isArray(liste) ? liste : [])
        .filter((h) => h && typeof h === "object" && typeof h.t === "string" && h.t.trim())
        .slice(0, maks)
        .map((h) => ({ i: spiller(h.i) ? h.i : 0, t: R.kutt(h.t, 24), a: !!h.a, s: !!h.s }));
    const logg = [];
    for (const l of sp.logg) {
      if (!l || typeof l !== "object" || typeof l.o !== "string" || !l.o || !erUtfall(l.u) || !spiller(l.g)) return null;
      // (a game saved before the hints were kept has no l.h)
      logg.push({ o: R.kutt(l.o, 60), u: l.u, g: l.g, x: l.u === "feil" && l.x ? 1 : 0, h: hintliste(l.h, 20).map(({ i, t, s }) => ({ i, t, s })) });
    }
    const r0 = sp.r;
    if (!r0 || typeof r0 !== "object" || !Number.isInteger(r0.ord) || r0.ord < 0 || r0.ord >= ORD.length) return null;
    const modus = sp.modus === "alle" ? "alle" : "en";
    const per = antall === 3 ? 2 : 1;
    const start = spiller(sp.start) ? sp.start : 0;
    const ut = {
      antall,
      modus,
      forbudt: sp.forbudt === true,
      per,
      runder: sp.runder,
      start,
      poeng: logg.filter((l) => l.u === "riktig").length,
      tapt: logg.reduce((sum, l) => sum + l.x, 0),
      logg,
      r: null,
      skjerm: typeof sp.skjerm === "string" ? sp.skjerm : "runde",
      ferdig: sp.ferdig === true,
      avbrutt: sp.avbrutt === true,
      feiret: sp.feiret === true,
      rek: null,
    };
    if (kortIgjen(ut) < 0) return null;
    if (!ut.ferdig && kortIgjen(ut) === 0) return null; // nothing left to play, and no «Kåringen» either
    if (ut.ferdig && kortIgjen(ut) > 0) ut.avbrutt = true; // a game that was ended early before that was noted
    const rek = sp.rek;
    if (rek && typeof rek === "object" && ["forste", "oppsett", "ny", "lik", "under"].includes(rek.t)) {
      ut.rek = { t: rek.t, g: Number.isInteger(rek.g) && rek.g > 0 && rek.g <= ut.runder ? rek.g : 0 };
      if (!ut.rek.g && ["ny", "lik", "under"].includes(rek.t)) ut.rek = null;
    }
    // The round: who guesses follows from the log; the hint givers are everybody else, in order.
    const gjetter = ut.ferdig && spiller(r0.gjetter) ? r0.gjetter : (start + logg.length) % antall;
    const givere = [];
    for (let k = 1; k < antall; k++) givere.push((gjetter + k) % antall);
    const r = {
      gjetter,
      ord: r0.ord,
      givere,
      na: Number.isInteger(r0.na) ? R.klamp(r0.na, 0, givere.length) : 0,
      hint: hintliste(r0.hint, givere.length * per),
      utfall: erUtfall(r0.utfall) ? r0.utfall : null,
      mal: BAK_PORTEN.includes(r0.mal) ? r0.mal : "ordet",
      igjen: Number.isFinite(r0.igjen) ? R.klamp(Math.ceil(r0.igjen), 1, TID) : TID,
      pause: r0.pause === true,
    };
    if (modus === "alle") {
      r.na = 0;
      r.hint = [];
    } else if (r.hint.length !== r.na * per) {
      // The hints don't add up with who has written: this round's hints start over.
      r.na = 0;
      r.hint = [];
      r.utfall = null;
    }
    ut.r = r;
    return ut;
  }

  // ---------- Markup helpers ----------

  const ROT = [-2, 1.5, -1, 2, -1.5, 1];
  function lapp(h, n, o = {}) {
    const lengde = h.t.length > 11 ? " ekstra-lang" : h.t.length > 7 ? " lang" : "";
    const indre = `<span class="hv-lapp-tekst${lengde}">${esc(h.t)}</span>${h.s ? `<span class="hv-lapp-merke">${esc(h.a ? R.t("Likt") : R.t("Strøket"))}</span>` : ""}${
      o.fra === false ? "" : `<span class="hv-lapp-fra">${R.avatar(h.i)}<span>${esc(R.navn(h.i))}</span></span>`
    }`;
    const stil = ` style="--rot: ${ROT[n % ROT.length]}deg; --i: ${n}"`; // sprak-ok
    if (!o.knapp) return `<div class="hv-lapp${h.s ? " strok" : ""}"${stil}>${indre}</div>`;
    return `<button class="hv-lapp" data-h="stryk" data-v="${n}" aria-pressed="${!!h.s}" aria-label="${esc(R.t("Stryk «{hint}» fra {navn}", { hint: h.t, navn: R.navn(h.i) }))}"${stil}>${indre}</button>`;
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
    const igjen = sp.ferdig ? 0 : Math.max(0, kortIgjen(sp) - (vis && r && r.utfall ? (r.utfall === "feil" && kortIgjen(sp) > 1 ? 2 : 1) : 0));
    const poeng = sp.poeng + (vis && r && r.utfall === "riktig" ? 1 : 0);
    return `<ol class="hv-bunke" role="img" aria-label="${esc(R.t("{poeng}, {kort} igjen", { poeng: R.flertall(poeng, "poeng", "poeng"), kort: R.flertall(igjen, "kort", "kort") }))}">${kort
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
  const hintTittel = (S) => {
    const v = { n: Math.min(S.spill.r.na + 1, S.spill.r.givere.length), antall: S.spill.r.givere.length };
    return S.spill.per === 2 ? R.t("Spiller {n} av {antall}", v) : R.t("Hint {n} av {antall}", v);
  };

  // A text with one name in bold: the text is escaped, then {navn} gets the markup.
  const medFet = (tekst, navn) => esc(tekst).replace("{navn}", () => `<b>${esc(navn)}</b>`);
  const serBort = (g) => `<p class="hv-ser-bort">${R.avatar(g)}<span>${medFet(R.t("{navn} ser bort"), R.navn(g))}</span></p>`;

  // Hard mode: the hint that is not allowed this round ("" when the mode is off).
  const forbudtOrd = (sp) => (sp.forbudt ? ORD[sp.r.ord].h : "");
  // The reminder of the word for the hint givers, with the forbidden hint beside it in hard mode.
  function minne(sp, klasse) {
    const f = forbudtOrd(sp);
    return `<p class="hv-minne ${klasse || ""}"><span>${esc(R.t("Ordet er"))}</span><b>${esc(ORD[sp.r.ord].o)}</b>${f ? `<em class="hv-nei"><small>${esc(R.t("Forbudt"))}<span class="vh"> ${esc(R.t("hint:"))}</span></small> ${esc(f)}</em>` : ""}</p>`;
  }

  function katOppsummering(S) {
    const valgt = S.oppsett.kategorier;
    if (valgt.length === KATEGORIER.length) return R.t("Alle kategorier");
    if (!valgt.length) return R.t("Ingen valgt");
    const navn = valgt.map((id) => kategori(id).navn);
    return navn.length <= 2 ? navn.join(" · ") : `${navn.slice(0, 2).join(" · ")} + ${navn.length - 2}`;
  }
  const katBrikker = (S) =>
    R.ui.brikker(
      "kat",
      KATEGORIER.map((k) => ({ v: k.id, tekst: k.navn, ikon: k.ikon })),
      S.oppsett.kategorier,
      { alle: true, etikett: R.t("Kategorier") },
    );

  // The rules follow the way of playing that is chosen (or being played).
  function regler(S) {
    const alle = !!S && ((pagar(S) ? S.spill.modus : S.oppsett && S.oppsett.modus) === "alle");
    return {
      intro: R.t("Et samarbeidsspill. Én gjetter, de andre gir ett hint hver – men like hint blir strøket!"),
      steg: alle
        ? [
            [R.t("Gjetteren ser bort"), R.t("De andre ser det hemmelige ordet sammen på mobilen.")],
            [R.t("Alle skriver samtidig"), R.t("Ett hint hver, på en lapp eller på egen mobil. Mobilen tar tiden: {tid} s.", { tid: TID })],
            [R.t("Sammenlign og gjett"), R.t("Legg bort hint som er like, og vis resten til gjetteren. Riktig svar gir ett poeng.")],
          ]
        : [
            [R.t("Gjetteren ser bort"), R.t("De andre ser det hemmelige ordet sammen på mobilen.")],
            [R.t("Ett hint hver"), R.t("Send mobilen rundt. Alle skriver ett ord i hemmelighet.")],
            [R.t("Gjett ordet"), R.t("Like hint strykes, og gjetteren ser bare resten. Riktig svar gir ett poeng.")],
          ],
      tips: [
        R.t("Pass er gratis, men feil svar koster et ekstra kort fra bunken."),
        R.t("Det mest opplagte hintet blir ofte strøket – tenk litt annerledes enn de andre."),
        R.t("Bøyninger regnes som like: bil, bilen og bilene stryker hverandre."),
        R.t("Er dere bare tre, gir hver av dere to hint."),
        alle ? R.t("Har dere ikke lapper? Velg «Én mobil», så går mobilen rundt i stedet.") : R.t("Er dere mange? Velg «Alle samtidig», så skriver alle på lapper eller hver sin mobil."),
        R.t("Vanskelig: det mest opplagte hintet står på kortet – og er forbudt."),
      ],
    };
  }

  // A double tap on «Ferdig» must not land on the next hint giver's empty form as an error.
  let skrivApnet = 0;

  // ---------- The game ----------

  R.start({
    id: "hviskeren",
    versjon: 1,
    pagar, // true while a game runs: the front page's «Fortsett» badge and the wake lock use it

    tilstand: () => ({
      antall: R.klamp(lagredeNavn() || 4, MIN, MAKS),
      oppsett: { kategorier: ALLE_KAT.slice(), niva: "blandet", runder: 13, lengdeValgt: false, modus: "en", forbudt: false },
      rekorder: {},
      spill: null,
    }),

    lastet(S) {
      // Settings
      const o = S.oppsett && typeof S.oppsett === "object" && !Array.isArray(S.oppsett) ? S.oppsett : (S.oppsett = {});
      const valgte = Array.isArray(o.kategorier) ? o.kategorier : ALLE_KAT;
      o.kategorier = ALLE_KAT.filter((id) => valgte.includes(id));
      if (!harNiva(o.niva)) o.niva = "blandet";
      o.modus = o.modus === "alle" ? "alle" : "en";
      o.forbudt = o.forbudt === true;
      // A save from before the length followed the group: 13 was the default there, so only 8 can
      // have been chosen by hand.
      if (typeof o.lengdeValgt !== "boolean") o.lengdeValgt = o.runder === 8;
      if (!LENGDER.includes(o.runder)) {
        o.runder = 13;
        o.lengdeValgt = false;
      }
      const antall = Math.round(Number(S.antall));
      S.antall = R.klamp(Number.isFinite(antall) && antall > 0 ? antall : lagredeNavn() || 4, MIN, MAKS);

      // Records
      const lagret = S.rekorder && typeof S.rekorder === "object" && !Array.isArray(S.rekorder) ? S.rekorder : {};
      S.rekorder = {};
      for (const n of REKORDNOKLER) {
        if (Number.isInteger(lagret[n]) && lagret[n] > 0 && lagret[n] <= parseInt(n, 10)) S.rekorder[n] = lagret[n];
      }

      // The game
      S.spill = rensSpill(S.spill);
      const sp = S.spill;
      if (!sp) {
        if (!["hjem", "oppsett", null, undefined].includes(S.skjerm)) S.skjerm = "hjem";
        return;
      }
      if (sp.skjerm === "gi") sp.skjerm = "skriv"; // the hand-over screen and the hint field are one screen now
      if (S.skjerm === "gi") S.skjerm = "skriv";
      sp.skjerm = sted(sp, sp.skjerm);
      // (the gate must lead to a screen that fits the round)
      const mal = sted(sp, sp.r.mal);
      sp.r.mal = BAK_PORTEN.includes(mal) ? mal : "ordet";
      if (!["hjem", "oppsett", null, undefined].includes(S.skjerm)) {
        // A saved screen that doesn't fit the game any more: home, with «Fortsett» there.
        if (sted(sp, S.skjerm) !== S.skjerm) S.skjerm = "hjem";
        // The screens behind the gate resume to the gate (gjenoppta), which then leads back to them.
        else if (BAK_PORTEN.includes(S.skjerm) && S.skjerm !== "skriv") sp.r.mal = S.skjerm;
      }
    },

    // (a getter: the kit reads it every time the «?» sheet is opened)
    get regler() {
      return regler(R.S);
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis: (S) => {
          const rekord = rekordMerke(S);
          return R.ui.spillhjem({
            slagordHtml: `${esc(R.t("Alle gir ett hint i hemmelighet."))}<br><em>${esc(R.t("Men like hint blir strøket!"))}</em>`,
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: pagar(S) ? R.t("Fortsett · runde {n}", { n: S.spill.logg.length + 1 }) : "",
              ekstraHtml: R.ui.lenke(R.t("Slik spiller du"), "regler"),
            }),
            merker: [...(rekord ? [rekord] : []), [`${MIN}–${MAKS}`, R.t("spillere")], [R.tall(ORD.length), R.t("ord")], ...(rekord ? [] : [[R.t("Alle"), R.t("på samme lag")]])],
          });
        },
      },

      oppsett: {
        tittel: R.t("Nytt spill"),
        tilbake: "hjem",
        vis: (S) => {
          const o = S.oppsett;
          const n = antallOrd(S);
          const antall = antallSpillere(S);
          const mange = o.modus === "en" && antall >= 8;
          return `
          <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
          <section class="seksjon">
            <div class="seksjon-hode"><h2>${esc(R.t("Hvordan spiller dere?"))}</h2></div>
            ${R.ui.fliser(
              "modus",
              [
                { v: "en", ikon: "📱", tittel: R.t("Én mobil"), tekst: R.t("Send den rundt. Best med 3–7.") },
                { v: "alle", ikon: "📝", tittel: R.t("Alle samtidig"), tekst: R.t("Lapper eller hver sin mobil.") },
              ],
              o.modus,
            )}
            <p class="hjelp hv-modus-hjelp">${esc(
              o.modus === "alle"
                ? R.t("Mobilen viser ordet og tar tiden. Alle skriver hintet sitt samtidig, og dere sammenligner selv.")
                : R.t("Mobilen går fra hånd til hånd. Like hint strykes automatisk."),
            )}</p>
          </section>
          ${R.ui.spillere({
            min: MIN,
            max: MAKS,
            hjelp: antall <= 3 ? R.t("Dere er tre, så hver av dere gir to hint.") : R.t("Dere bytter på å gjette."),
          })}
          ${
            mange
              ? `<div class="hv-forslag" role="note">
                  <p><b>${esc(R.t("Dere er {n}.", { n: antall }))}</b> ${esc(R.t("Da blir det mye venting med én mobil – det går raskere når alle skriver samtidig."))}</p>
                  ${R.ui.knapp2(R.t("Bytt til «Alle samtidig»"), "modus", { v: "alle", variant: "liten aksent" })}
                </div>`
              : ""
          }
          <section class="seksjon">
            <div class="seksjon-hode"><h2>${esc(R.t("Ordene"))}</h2><span class="tall">${esc(R.flertall(n, "ord", "ord"))}</span></div>
            ${R.ui.seg(
              "niva",
              [
                ["lett", R.t("Lette")],
                ["blandet", R.t("Blandet")],
                ["vanskelig", R.t("Vanskelige")],
              ],
              o.niva,
              { etikett: R.t("Vanskelighetsgrad") },
            )}
            <button class="hv-katknapp" data-h="kategorier"><span class="hv-kat-ikoner" aria-hidden="true">${o.kategorier
              .slice(0, 4)
              .map((id) => kategori(id).ikon)
              .join("")}</span><span class="hv-kat-tekst"><small>${esc(R.t("Kategorier"))}</small><b>${esc(katOppsummering(S))}</b></span><span class="hv-kat-endre">${esc(R.t("Endre"))}</span></button>
          </section>
          <section class="seksjon">
            <div class="seksjon-hode"><h2>${esc(R.t("Lengde"))}</h2><span class="tall">${esc(R.t("ca. {n} min", { n: minutter(S) }))}</span></div>
            ${R.ui.seg(
              "runder",
              [
                ["8", R.t("Kort · 8 ord")],
                ["13", R.t("Vanlig · 13 ord")],
              ],
              String(lengde(S)),
              { etikett: R.t("Antall kort") },
            )}
          </section>
          ${R.ui.bryter("forbudt", o.forbudt, R.t("Vanskelig – forbudt hint"), R.t("Det mest opplagte hintet står på kortet – og er ikke lov."))}
          ${R.ui.dokk(R.ui.knapp(n ? R.t("Start") : R.t("Velg minst én kategori"), "start", { av: !n }))}`;
        },
      },

      // The gate of every round: the guesser looks away before anything secret is shown.
      runde: {
        tittel: (S) => R.t("Runde {n}", { n: S.spill.logg.length + 1 }),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const g = sp.r.gjetter;
          return `
            ${bunke(sp)}
            <div class="gi-til">
              ${R.avatar(g, "gigant")}
              <p class="etikett" aria-hidden="true">${esc(R.t("Denne runden gjetter"))}</p>
              <h1 id="skjerm-tittel"><span class="vh">${esc(R.t("Denne runden gjetter"))} </span>${esc(R.navn(g))}</h1>
              <p class="ikke-se">🙈 ${esc(R.t("Snu deg bort – ikke se på mobilen!"))}</p>
            </div>
            ${R.ui.dokk(
              R.ui.knapp(sp.r.mal === "sjekk" ? R.t("Vis hintene til de andre") : R.t("Vis ordet til de andre"), "vis-ordet"),
              R.ui.lenkerad(R.ui.lenke(R.t("Avslutt"), "avslutt")),
            )}`;
        },
        inn(S) {
          S.spill.skjerm = "runde";
        },
      },

      ordet: {
        tittel: R.t("Hemmelig ord"),
        tilbake: "hjem",
        gjenoppta: "runde",
        vis(S) {
          const sp = S.spill;
          const o = ORD[sp.r.ord];
          const k = kategori(o.k) || { ikon: "💬", navn: R.t("Ord") };
          const alle = sp.modus === "alle";
          const f = forbudtOrd(sp);
          // (The heading is not the word itself: a screen reader on speaker would say it to the guesser.)
          return `
            <h1 class="vh" id="skjerm-tittel">${esc(R.t("Hemmelig ord – bare for dere som gir hint"))}</h1>
            <p class="hv-for-dere" aria-hidden="true">${esc(R.t("Bare for dere som gir hint"))}</p>
            <div class="bunke kompakt"><article class="storkort aksent hv-ordkort">
              <div class="storkort-topp"><span class="storkort-etikett">${esc(k.ikon + " " + k.navn)}</span><span class="storkort-nr">${esc(R.t("Runde {n}", { n: sp.logg.length + 1 }))}</span></div>
              <p class="kort-ord ${R.lengdeKlasse(o.o)}" id="hv-ord">${esc(o.o)}</p>
              ${f ? `<p class="hv-forbudt"><span>${esc(R.t("Forbudt hint"))}</span><b>${esc(f)}</b></p>` : ""}
            </article></div>
            ${serBort(sp.r.gjetter)}
            <p class="hjelp">${esc(
              alle
                ? sp.per === 2
                  ? R.t("Se på ordet sammen. Når klokka starter, skriver dere to hint hver – på en lapp eller på egen mobil.")
                  : R.t("Se på ordet sammen. Når klokka starter, skriver alle ett hint – på en lapp eller på egen mobil.")
                : sp.per === 2
                  ? R.t("Se på ordet sammen. Så går mobilen rundt, og dere skriver to hint hver i hemmelighet.")
                  : R.t("Se på ordet sammen. Så går mobilen rundt, og alle skriver ett hint i hemmelighet."),
            )}</p>
            ${R.ui.dokk(alle ? R.ui.knapp(R.t("Start klokka"), "start-klokka") : R.ui.knapp(R.t("Skriv hint"), "skriv"), R.ui.lenkerad(R.ui.lenke(R.t("Bytt ord"), "bytt-ord")))}`;
        },
        inn(S) {
          S.spill.skjerm = "ordet";
        },
      },

      // One phone: one screen per hand-over. The next hint giver's name is shown large, with the
      // word and the hint field right below. Nothing of what the others wrote is in the page.
      skriv: {
        tittel: (S) => hintTittel(S),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.r;
          const i = r.givere[Math.min(r.na, r.givere.length - 1)];
          const to = sp.per === 2;
          const felt = (n, siste) =>
            `<input id="hint-${n}" class="tekstfelt hv-felt" name="hint${n}" data-felt="hint" maxlength="24" autocomplete="off" autocorrect="off" autocapitalize="sentences" spellcheck="false" enterkeyhint="${
              siste ? "done" : "next"
            }" placeholder="${esc(to ? R.t("Hint {n}", { n }) : R.t("Ett ord"))}" aria-label="${esc(to ? R.t("Hint {n}", { n }) : R.t("Ditt hint"))}" aria-describedby="hint-feil">`;
          return `
            ${prikker(r)}
            <form class="hv-skriv" data-skjema="hint" autocomplete="off" novalidate>
              <div class="hv-tur" style="--pf: var(--p${(i % 20) + 1})">
                ${R.avatar(i, "stor")}
                <div class="hv-tur-tekst">
                  <p class="etikett" aria-hidden="true">${esc(R.t("Gi mobilen til"))}</p>
                  <h1 id="skjerm-tittel"><span class="vh">${esc(R.t("Gi mobilen til"))} </span>${esc(R.navn(i))}<span class="vh">. ${esc(hintTittel(S))}.</span></h1>
                </div>
              </div>
              ${minne(sp)}
              ${felt(1, !to)}
              ${to ? felt(2, true) : ""}
              <p class="feil" id="hint-feil" aria-live="assertive"></p>
              <button class="knapp" type="submit">${esc(R.t("Ferdig"))}</button>
            </form>
            <p class="hjelp">${esc(to ? R.t("To hint, ett ord i hvert.") : R.t("Bare ett ord."))} ${esc(R.t("Like hint blir strøket, så tenk litt annerledes enn de andre!"))}</p>
            ${serBort(r.gjetter)}`;
        },
        inn(S) {
          S.spill.skjerm = "skriv";
          skrivApnet = performance.now();
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
        tittel: R.t("Hintene"),
        tilbake: "hjem",
        gjenoppta: "runde",
        vis(S) {
          const sp = S.spill;
          const r = sp.r;
          const igjen = r.hint.filter((h) => !h.s).length;
          const auto = r.hint.some((h) => h.a);
          return `
            <div class="hv-sjekk-hode">
              ${minne(sp, "liten")}
              <h1 id="skjerm-tittel">${esc(R.t("Sjekk hintene"))}</h1>
              <p class="ingress">${esc(auto ? R.t("Like hint er strøket automatisk.") : R.t("Ingen hint var helt like!"))} ${esc(R.t("Trykk på et hint for å stryke det – eller hente det tilbake."))}</p>
            </div>
            <div class="hv-lapper">${r.hint.map((h, n) => lapp(h, n, { knapp: true })).join("")}</div>
            ${R.ui.dokk(
              `<p class="hv-status">${igjen ? esc(R.t("{igjen} av {n} hint går videre", { igjen: "{igjen}", n: r.hint.length })).replace("{igjen}", `<b>${igjen}</b>`) : esc(R.t("Alle hintene er strøket 😬"))}</p>`,
              R.ui.knapp(R.t("Gi mobilen til {navn}", { navn: R.navn(r.gjetter) }), "til-gjetter"),
            )}`;
        },
        inn(S) {
          S.spill.skjerm = "sjekk";
        },
      },

      gjetter: {
        tittel: R.t("Gjett"),
        tilbake: "hjem",
        vis(S) {
          const r = S.spill.r;
          const g = r.gjetter;
          const igjen = r.hint.filter((h) => !h.s).length;
          return `
            <div class="gi-til">
              ${R.avatar(g, "gigant")}
              <p class="etikett" aria-hidden="true">${esc(R.t("Gi mobilen til gjetteren"))}</p>
              <h1 id="skjerm-tittel"><span class="vh">${esc(R.t("Gi mobilen til gjetteren,"))} </span>${esc(R.navn(g))}</h1>
              <p class="hv-klar">${igjen ? `✨ ${esc(R.t("{n} hint venter på deg", { n: igjen }))}` : `😬 ${esc(R.t("Ingen hint overlevde"))}`}</p>
            </div>
            ${R.ui.dokk(R.ui.knapp(R.t("Jeg er {navn}", { navn: R.navn(g) }), "jeg-gjetter"))}`;
        },
        inn(S) {
          S.spill.skjerm = "gjetter";
        },
      },

      gjett: {
        tittel: (S) => R.t("Runde {n}", { n: S.spill.logg.length + 1 }),
        tilbake: "hjem",
        vis(S) {
          const r = S.spill.r;
          const synlige = r.hint.filter((h) => !h.s);
          const strok = r.hint.length - synlige.length;
          return `
            <div class="hv-gjett-hode">
              <p class="etikett">${esc(R.t("Hintene dine, {navn}", { navn: R.navn(r.gjetter) }))}</p>
              <h1 id="skjerm-tittel">${esc(R.t("Hva er ordet?"))}</h1>
            </div>
            ${
              synlige.length
                ? `<div class="hv-lapper stor">${synlige.map((h, n) => lapp(h, n)).join("")}</div>`
                : `<div class="tom">${R.figur()}<p>${esc(R.t("Alle hintene ble strøket. Gjett i blinde – eller pass."))}</p></div>`
            }
            ${strok && synlige.length ? `<p class="hjelp">${esc(R.t("{n} hint ble strøket", { n: strok }))}</p>` : ""}
            ${R.ui.dokk(`<p class="hv-status">${esc(R.t("Si gjetningen høyt – og sjekk svaret."))}</p>`, R.ui.knapp(R.t("Sjekk svaret"), "sjekk-svar"), R.ui.knapp2(R.t("Pass – jeg vet ikke"), "pass"))}`;
        },
        inn(S) {
          S.spill.skjerm = "gjett";
        },
      },

      // «Alle samtidig»: the writing time. The clock can be paused, and nothing is lost when it
      // runs out – the next screen has no clock.
      tid: {
        tittel: R.t("Skriv hint"),
        tilbake: "hjem",
        gjenoppta: "runde",
        vis(S) {
          const sp = S.spill;
          const r = sp.r;
          const to = sp.per === 2;
          return `
            ${minne(sp, "liten")}
            <div class="hv-tid">
              ${R.ui.timer({
                id: "hv-klokke",
                sekunder: r.igjen,
                stor: true,
                visning: "sek",
                kontrollHtml: `<button class="knapp-2 liten" data-h="klokke" data-timer-pause>${esc(r.pause ? R.t("Fortsett") : R.t("Pause"))}</button>`,
              })}
              <div class="hv-tid-tekst">
                <h1 id="skjerm-tittel">${esc(to ? R.t("Skriv to hint hver") : R.t("Skriv hintet ditt"))}</h1>
                <p class="ingress">${esc(
                  to
                    ? R.t("På lapper eller på egen mobil. Ett ord i hvert hint – og hold dem skjult til begge er ferdige.")
                    : R.t("På en lapp eller på din egen mobil. Bare ett ord – og hold det skjult til alle er ferdige."),
                )}</p>
              </div>
            </div>
            ${serBort(r.gjetter)}
            ${R.ui.dokk(R.ui.knapp(R.t("Ferdig"), "ferdig-skrevet"))}`;
        },
        inn(S) {
          const r = S.spill.r;
          S.spill.skjerm = "tid";
          const t = new R.Timer({
            id: "hv-klokke",
            sekunder: TID,
            visning: "sek",
            // (kept every second, so a reload or «Fortsett» goes on from where the clock was)
            vedTikk: (sek) => {
              r.igjen = R.klamp(sek, 1, TID);
              R.lagre();
            },
            vedSlutt: () => {
              const fortsatt = R.vakt();
              setTimeout(() => fortsatt() && R.gaTil("lapper"), 700);
            },
          });
          t.igjenMs = R.klamp(r.igjen, 1, TID) * 1000;
          if (r.pause) t.tegn();
          else t.start();
        },
      },

      // «Alle samtidig»: the hint givers compare their notes, then the guesser guesses out loud.
      lapper: {
        tittel: (S) => R.t("Runde {n}", { n: S.spill.logg.length + 1 }),
        tilbake: "hjem",
        gjenoppta: "runde",
        vis(S) {
          const sp = S.spill;
          const g = R.navn(sp.r.gjetter);
          const f = forbudtOrd(sp);
          return `
            ${minne(sp, "liten")}
            <h1 id="skjerm-tittel">${esc(R.t("Sammenlign lappene"))}</h1>
            <ol class="steg hv-steg">
              <li><b>${esc(R.t("Vis hintene til hverandre"))}</b><span>${esc(R.t("{navn} ser fortsatt bort.", { navn: g }))}</span></li>
              <li><b>${esc(R.t("Legg bort like hint"))}</b><span>${esc(f ? R.t("Bil og bilen er like, og «{hint}» er forbudt. I tvil? Legg bort begge.", { hint: f }) : R.t("Bil og bilen er like. I tvil? Legg bort begge."))}</span></li>
              <li><b>${esc(R.t("Vis resten til {navn}", { navn: g }))}</b><span>${esc(R.t("Men ikke mobilen! Bare ett forsøk."))}</span></li>
            </ol>
            ${R.ui.dokk(
              `<p class="hv-status">${esc(R.t("Gjettet {navn} riktig?", { navn: g }))}</p>`,
              `<div class="knapprad tre">${R.ui.knapp(R.t("Feil"), "feil", { variant: "rod" })}${R.ui.knapp2(R.t("Pass"), "pass")}${R.ui.knapp(R.t("Riktig!"), "riktig", { variant: "mynte" })}</div>`,
            )}`;
        },
        inn(S) {
          S.spill.skjerm = "lapper";
        },
      },

      svar: {
        tittel: R.t("Fasit"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.r;
          const o = ORD[r.ord];
          const u = r.utfall;
          const kort = `<div class="bunke kompakt"><article class="storkort aksent hv-ordkort ${u ? "stille" : "avslor"}">
              <div class="storkort-topp"><span class="storkort-etikett" aria-hidden="true">${esc(R.t("Ordet var"))}</span></div>
              <h1 class="kort-ord ${R.lengdeKlasse(o.o)}" id="skjerm-tittel"><span class="vh">${esc(R.t("Ordet var"))} </span><span id="hv-ord">${esc(o.o)}</span></h1>
            </article></div>`;
          if (!u) {
            // One phone: the card is turned over for everybody, then the group says how it went.
            return `${kort}
              <p class="hv-sporsmal">${esc(R.t("Gjettet {navn} riktig?", { navn: R.navn(r.gjetter) }))}</p>
              ${R.ui.dokk(`<div class="knapprad">${R.ui.knapp(R.t("Feil"), "feil", { variant: "rod" })}${R.ui.knapp(R.t("Riktig!"), "riktig", { variant: "mynte" })}</div>`)}`;
          }
          const ekstra = u === "feil" && kortIgjen(sp) > 1;
          const poeng = sp.poeng + (u === "riktig" ? 1 : 0);
          const igjen = Math.max(0, kortIgjen(sp) - 1 - (ekstra ? 1 : 0));
          const STEMPEL = { riktig: [R.t("Riktig!"), "mynte"], feil: [R.t("Feil"), ""], pass: [R.t("Pass"), "lampe"] };
          const tekst = {
            riktig: R.t("Godt jobba! Ett poeng til laget."),
            feil: ekstra ? R.t("Au! Feil svar koster et ekstra kort fra bunken.") : R.t("Au! Det var siste kort, så det koster ikke mer."),
            pass: R.t("Ingen skade skjedd – pass er gratis."),
          }[u];
          return `${kort}
            <div class="stempel-sted"><span class="stempel ${STEMPEL[u][1]}">${esc(STEMPEL[u][0])}</span></div>
            <p class="hv-utfall">${esc(tekst)}</p>
            ${bunke(sp, true)}
            <p class="hv-stand">${esc(R.t("{poeng} poeng · {kort} kort igjen", { poeng: "{poeng}", kort: "{kort}" }))
              .replace("{poeng}", `<b>${poeng}</b>`)
              .replace("{kort}", `<b>${igjen}</b>`)}</p>
            ${
              r.hint.length
                ? `<section class="seksjon hv-runden">
                    <h2 class="etikett">${esc(R.t("Hintene denne runden"))}</h2>
                    <div class="hv-lapper liten">${r.hint.map((h, n) => lapp(h, n)).join("")}</div>
                  </section>`
                : ""
            }
            ${R.ui.dokk(
              R.ui.knapp(igjen > 0 ? R.t("Neste runde") : R.t("Til kåringen"), "neste"),
              R.ui.lenkerad(R.ui.lenke(R.t("Angre"), "angre"), igjen > 0 ? R.ui.lenke(R.t("Avslutt"), "avslutt") : ""),
            )}`;
        },
        inn(S) {
          S.spill.skjerm = "svar";
        },
      },

      slutt: {
        tittel: R.t("Kåringen"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const spilt = sp.logg.length + sp.tapt;
          const avbrutt = sp.avbrutt || spilt < sp.runder;
          let banner;
          if (avbrutt) {
            banner = R.ui.banner({
              klasse: "aksent",
              stemning: "",
              etikett: spilt ? R.t("Avsluttet etter {spilt} av {n} kort", { spilt, n: sp.runder }) : R.t("Avsluttet før første kort"),
              tittel: !spilt ? R.t("Spillet ble avsluttet") : sp.poeng ? R.flertall(sp.poeng, "riktig", "riktige") : R.t("Ingen riktige ennå"),
              tekst: !spilt
                ? R.t("Dere rakk ikke noen kort denne gangen.")
                : sp.poeng
                  ? R.t("Godt jobba så langt! Rekorden teller bare når hele bunken er spilt.")
                  : R.t("Dere stoppet før bunken var tom. Prøv igjen når dere vil!"),
            });
          } else {
            const [, tittel, tekst, ikon] = vurdering(sp.poeng, sp.runder);
            const andel = sp.poeng / sp.runder;
            banner = R.ui.banner({
              klasse: "aksent",
              stemning: andel >= 0.6 || (sp.rek && sp.rek.t === "ny") ? "jubel" : andel < 0.2 ? "lei" : "",
              etikett: R.t("{poeng} av {n} ord riktig", { poeng: sp.poeng, n: sp.runder }) + (sp.forbudt ? ` · ${R.t("forbudt hint")}` : ""),
              tittelHtml: `<span aria-hidden="true">${ikon}</span> ${esc(tittel)}`,
              tekst,
            });
          }
          const n = rekordNokkel(sp.runder, sp.forbudt);
          const rek = sp.rek;
          const fet = (tekst) => esc(tekst).replace("{rekord}", () => `<b>${esc(rekordTekst(n, rek.g))}</b>`);
          const rekord = !rek
            ? ""
            : rek.t === "ny"
              ? `<p class="hv-rekord ny"><b>${esc(R.t("Ny rekord!"))}</b> ${esc(R.t("Forrige: {rekord}.", { rekord: rekordTekst(n, rek.g) }))}</p>`
              : rek.t === "lik"
                ? `<p class="hv-rekord">${fet(R.t("Dere tangerte rekorden: {rekord}."))}</p>`
                : rek.t === "under"
                  ? `<p class="hv-rekord">${fet(R.t("Rekorden å slå er {rekord}."))}</p>`
                  : `<p class="hv-rekord">${esc(rek.t === "forste" ? R.t("Første runde – nå har dere en rekord å slå!") : R.t("Første runde med dette oppsettet – nå har dere en rekord å slå!"))}</p>`;
          const TEGN = { riktig: "✓", feil: "✗", pass: "–" };
          const UTFALLORD = { riktig: R.t("riktig"), feil: R.t("feil"), pass: R.t("pass") };
          const hint = (h) => (h.s ? `<s class="hv-hint">${esc(h.t)}<span class="vh"> ${esc(R.t("(strøket)"))}</span></s>` : `<span class="hv-hint">${esc(h.t)}</span>`);
          const ordene = sp.logg
            .map(
              (l) => `<li class="hv-${l.u}">
                <span class="hv-logg-merke" aria-hidden="true">${TEGN[l.u]}</span>
                <div class="hv-logg-tekst">
                  <p class="hv-logg-ord"><b>${esc(l.o)}</b><span class="vh">: ${esc(UTFALLORD[l.u])}${l.x ? esc(R.t(", kostet et ekstra kort")) : ""}. ${esc(R.t("Gjettet av"))} </span><span class="hv-logg-hvem">${esc(R.navn(l.g))}</span></p>
                  ${l.h.length ? `<p class="hv-logg-hint"><span class="hv-pil" aria-hidden="true">←</span><span class="vh">${esc(R.t("Hint:"))} </span>${l.h.map(hint).join('<span class="vh">, </span>')}</p>` : ""}
                </div>
              </li>`,
            )
            .join("");
          return `
            ${banner}
            ${rekord}
            ${bunke(sp)}
            ${sp.logg.length ? `<section class="seksjon"><h2 class="etikett">${esc(R.t("Ordene"))}</h2><ol class="hv-logg" role="list">${ordene}</ol></section>` : ""}
            ${sp.logg.length ? R.ui.knapp2(R.t("Del resultatet"), "del") : ""}
            ${R.ui.flereSpill({ antall: sp.antall })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen"), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "nytt"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
        },
        inn(S) {
          const sp = S.spill;
          sp.skjerm = "slutt";
          R.slippVaken();
          if (sp.feiret) return; // a reload or a visit from the home screen: the party has been held
          sp.feiret = true;
          if (!sp.avbrutt && (sp.poeng / sp.runder >= 0.6 || (sp.rek && sp.rek.t === "ny"))) {
            R.lyd.fanfare();
            R.konfetti();
          } else if (sp.poeng > 0) R.lyd.pling();
          visTipsSnart();
        },
      },
    },

    skjema: {
      hint(S, form) {
        const sp = S.spill;
        if (!sp || sp.ferdig || S.skjerm !== "skriv") return;
        const r = sp.r;
        if (r.na >= r.givere.length) return;
        const i = r.givere[r.na];
        const felt = Array.from(form.querySelectorAll("input"));
        const feil = R.$("#hint-feil");
        // The second tap of a double tap on «Ferdig» lands on the next player's empty form.
        if (felt.every((f) => !f.value.trim()) && performance.now() - skrivApnet < 600) return;
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
        const forbudt = forbudtOrd(sp);
        const tekster = [];
        for (const f of felt) {
          const grunn = sjekkHint(f.value, ORD[r.ord].o, tekster, forbudt);
          if (grunn) return vis(grunn === "forbudt" ? R.t("«{hint}» er forbudt denne runden. Finn på noe lurere!", { hint: forbudt }) : FEILMELDING[grunn], f);
          tekster.push(f.value.trim());
        }
        tekster.forEach((t) => r.hint.push({ i, t: R.kutt(t, 24), a: false, s: false }));
        R.lyd.pop();
        R.vibrer(15);
        r.na += 1;
        if (r.na < r.givere.length) {
          // The same screen for the next hint giver: drawn from scratch, so the hint is gone.
          R.gaTil("skriv");
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
        if (!pagar(S)) return R.gaTil(S.spill ? "slutt" : "oppsett");
        R.holdVaken();
        R.gaTil(porten(S, S.spill.skjerm));
      },
      modus(el, e, S) {
        const ny = el.dataset.v === "alle" ? "alle" : "en";
        const fraForslag = !el.classList.contains("flis");
        if (S.oppsett.modus === ny) return;
        S.oppsett.modus = ny;
        R.vis();
        // The suggestion under the player list is gone now, and the tiles may be out of sight.
        if (fraForslag) {
          R.toast(R.t("«Alle samtidig» er valgt"));
          fokus("#spillerboks h2");
        }
      },
      forbudt(el, e, S) {
        S.oppsett.forbudt = !S.oppsett.forbudt;
        R.vis();
      },
      niva(el, e, S) {
        if (harNiva(el.dataset.v)) S.oppsett.niva = el.dataset.v;
        R.vis();
      },
      runder(el, e, S) {
        const ny = Number(el.dataset.v) === 8 ? 8 : 13;
        if (ny === lengde(S)) return;
        S.oppsett.runder = ny;
        S.oppsett.lengdeValgt = true; // from now on the length no longer follows the group
        R.vis();
      },
      kategorier(el, e, S) {
        R.ark(`
          <h2 id="ark-tittel">${esc(R.t("Kategorier"))}</h2>
          <p class="ingress">${esc(R.t("Ordene trekkes fra kategoriene dere velger."))}</p>
          <div id="hv-kat">${katBrikker(S)}</div>
          <button class="knapp" data-h="lukk-ark">${esc(R.t("Ferdig"))}</button>`);
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
        const antall = antallSpillere(S);
        S.antall = antall;
        S.spill = {
          antall,
          modus: S.oppsett.modus,
          forbudt: !!S.oppsett.forbudt,
          per: antall === 3 ? 2 : 1,
          runder: lengde(S),
          start: R.heltall(0, antall - 1),
          poeng: 0,
          tapt: 0,
          logg: [],
          r: null,
          skjerm: "runde",
          ferdig: false,
          avbrutt: false,
          feiret: false,
          rek: null,
        };
        nyRunde(S);
        R.statistikk("start", { modus: S.spill.modus, spillere: antall, kort: S.spill.runder, forbudt: S.spill.forbudt, niva: S.oppsett.niva });
        R.holdVaken();
        R.gaTil("runde");
      },
      "vis-ordet"(el, e, S) {
        const sp = S.spill;
        const mal = sted(sp, sp.r.mal);
        sp.r.mal = "ordet";
        R.lyd.snu();
        R.gaTil(BAK_PORTEN.includes(mal) ? mal : "ordet");
      },
      "bytt-ord"(el, e, S) {
        S.spill.r.ord = nyttOrd(S);
        R.lyd.sveip();
        R.vis();
        R.si(R.t("Nytt ord på kortet."));
      },
      skriv(el, e, S) {
        S.spill.r.na = 0;
        S.spill.r.hint = [];
        R.gaTil("skriv");
      },
      "start-klokka"(el, e, S) {
        S.spill.r.igjen = TID;
        S.spill.r.pause = false;
        R.gaTil("tid");
      },
      klokke(el, e, S) {
        const t = R.timer("hv-klokke");
        if (!t || t.ferdig) return;
        t.veksle();
        S.spill.r.pause = !t.kjorer;
        S.spill.r.igjen = R.klamp(Math.ceil(t.igjen), 1, TID);
        R.lagre();
        R.si(t.kjorer ? R.t("Klokka går.") : R.t("Klokka er satt på pause."));
      },
      "ferdig-skrevet": () => R.gaTil("lapper"),
      stryk(el, e, S) {
        const r = S.spill.r;
        const h = r.hint[Number(el.dataset.v)];
        if (!h) return;
        h.s = !h.s;
        if (h.s) R.lyd.takk();
        else R.lyd.pop();
        R.vis();
        const igjen = r.hint.filter((x) => !x.s).length;
        R.si(
          (h.s ? R.t("{hint} er strøket.", { hint: h.t }) : R.t("{hint} er hentet tilbake.", { hint: h.t })) +
            " " +
            R.t("{igjen} av {n} hint går videre.", { igjen, n: r.hint.length }),
        );
      },
      "til-gjetter": () => R.gaTil("gjetter"),
      "jeg-gjetter": () => R.gaTil("gjett"),
      "sjekk-svar"(el, e, S) {
        R.lyd.trommevirvel(0.6);
        R.gaTil("svar");
      },
      // The verdict. One phone: on the answer screen itself. Everyone at once: from the compare screen.
      pass(el, e, S) {
        S.spill.r.utfall = "pass";
        R.lyd.sveip();
        R.gaTil("svar");
        R.si(R.t("Pass. Ingen poeng, og ingen kort tapt."));
      },
      riktig(el, e, S) {
        S.spill.r.utfall = "riktig";
        R.lyd.riktig();
        R.vibrer([30, 40, 60]);
        if (S.skjerm === "svar") {
          R.vis();
          fokus('#skjerm [data-h="neste"]');
        } else R.gaTil("svar");
        R.konfetti();
        R.si(R.t("Riktig! Ett poeng til laget."));
      },
      feil(el, e, S) {
        const sp = S.spill;
        sp.r.utfall = "feil";
        R.lyd.feil();
        R.vibrer([80, 40, 80]);
        if (S.skjerm === "svar") {
          R.vis();
          fokus('#skjerm [data-h="neste"]');
        } else R.gaTil("svar");
        R.si(kortIgjen(sp) > 1 ? R.t("Feil svar. Det koster et ekstra kort.") : R.t("Feil svar."));
      },
      angre(el, e, S) {
        const sp = S.spill;
        sp.r.utfall = null;
        if (sp.modus === "alle") return R.gaTil("lapper");
        R.vis();
        fokus("#skjerm h1");
      },
      neste(el, e, S) {
        const sp = S.spill;
        if (!bokfor(S)) return;
        if (kortIgjen(sp) <= 0) return kar(S, false);
        nyRunde(S);
        R.gaTil("runde");
      },
      async avslutt(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreft(R.t("Avslutte spillet?"), R.t("Dere går til kåringen med poengene så langt."), R.t("Avslutt"), R.t("Spill videre"))) || !fortsatt() || !pagar(S)) return;
        // On the answer screen the round has been judged: it counts.
        if (S.skjerm === "svar") bokfor(S);
        kar(S, kortIgjen(S.spill) > 0);
      },
      del(el, e, S) {
        if (!S.spill || !S.spill.logg.length) return;
        return R.del((window.RUSJ_SPILL && window.RUSJ_SPILL.navn) || "Hviskeren", delTekst(S.spill), location.origin + R.forside + ((R.sprak !== "nb" && window.RUSJ_SPILL && window.RUSJ_SPILL.slug) || "hviskeren") + "/");
      },
      igjen(el, e, S) {
        S.spill = null;
        H.start(el, e, S);
      },
    }),
  });
})();
