/* Fortelleren — conversation cards for children and grown-ups, families, friends, teens and adults.
   Who is playing picks the deck (the children's decks come in three age bands); the way of playing:
   «Snakk sammen» (one answers, the others ask on with the card's «Spør videre»), «Gjett svaret»
   (the others guess first, then the answer – friendly points only if the group wants them) and,
   for a child and a grown-up, «Begge svarer» (the same card to both; the grown-up gets a version
   of the question written for a grown-up when it needs one). Levels: lett, middels, dypere, or
   rising through the game. Swapping or skipping a card is always fine and never counts.
   Favourite cards (the heart) are kept on this phone only, apart from the saved game.

   The rules and the deck building are pure functions on window.RusjForteller, so
   test/fortelleren.test.mjs can load this file in node:vm without the kit. */
(function () {
  "use strict";

  // ---------- Rules (no kit, no DOM) ----------

  const GJENGER = ["barnvoksen", "familie", "venner", "ungdom", "voksne"];
  const ALDRE = ["46", "79", "1012"]; // the children's age bands: 4–6, 7–9, 10–12
  const MODUSER = ["snakk", "gjett", "begge"];
  const NIVAER = ["stiger", "1", "2", "3"];
  const LENGDER = [5, 10, 20];
  const TYPER = ["fortell", "minne", "drom", "hvis", "folelse", "verdi", "takk", "vis"]; // sprak-ok
  const STOKKER = ["barn46", "barn79", "barn1012", "familie", "venner", "ungdom", "voksne"];
  const FASER = ["kort", "gjett", "svar"];
  const ROLLE_STOKK = { barn46: true, barn79: true, barn1012: true }; // decks with a grown-up's version
  const MAKS_FAV = 200;

  const heltall = (n) => Number.isInteger(n) && n >= 0;
  const M = {
    GJENGER,
    ALDRE,
    MODUSER,
    NIVAER,
    LENGDER,
    TYPER,
    STOKKER,
    FASER,
    ROLLE_STOKK,
    // The deck for a group: a child and a grown-up play the child's age band.
    stokkFor: (gjeng, alder) => (gjeng === "barnvoksen" ? "barn" + (ALDRE.includes(alder) ? alder : "46") : GJENGER.includes(gjeng) ? gjeng : "familie"),
    // The ways of playing that fit a group (the first is the default).
    moduserFor: (gjeng) => (gjeng === "barnvoksen" ? ["begge", "snakk", "gjett"] : ["snakk", "gjett"]),
    // A clean setup (unknown values become the defaults).
    rydd(o) {
      const u = Object.assign({}, o || {});
      const gjeng = GJENGER.includes(u.gjeng) ? u.gjeng : "familie";
      const moduser = M.moduserFor(gjeng);
      return {
        gjeng,
        alder: ALDRE.includes(u.alder) ? u.alder : "46",
        modus: moduser.includes(u.modus) ? u.modus : moduser[0],
        niva: NIVAER.includes(String(u.niva)) ? String(u.niva) : "stiger",
        lengde: LENGDER.includes(u.lengde) ? u.lengde : 10,
        poeng: !!u.poeng,
      };
    },
    // The level (1 lett, 2 middels, 3 dypere) of card nr (1 …) in a game of `lengde` cards.
    // «Stiger»: the first third is easy, the middle third a bit more, the last third deeper.
    nivaFor(niva, nr, lengde) {
      if (niva !== "stiger") return R1to3(Number(niva));
      if (nr <= Math.ceil(lengde / 3)) return 1;
      if (nr <= Math.ceil((2 * lengde) / 3)) return 2;
      return 3;
    },
    // «Gjett svaret» needs something to guess: no show-and-draw cards there.
    passer: (k, modus) => !!k && (modus !== "gjett" || k.ty !== "vis"),
    // Draw a card from `kort`: the wanted level first, then the nearest other levels, never a card
    // already on the table in this game. `neste(filter)` is the deck's own draw (R.kortstokk in the
    // browser: no repeats across games either). niva null: any level (the favourites).
    trekk(kort, niva, modus, sett, neste) {
      const brukt = new Set(sett || []);
      const rekke = niva == null ? [0] : niva === 1 ? [1, 2, 3] : niva === 2 ? [2, 1, 3] : [3, 2, 1];
      for (const n of rekke) {
        const i = neste((j) => (n === 0 || kort[j].n === n) && M.passer(kort[j], modus) && !brukt.has(j));
        if (i >= 0) return i;
      }
      // Every card has been on the table in this game: a repeat is better than no card.
      return neste((j) => M.passer(kort[j], modus));
    },
    // A new game. o: a clean setup; antall: players (a child and a grown-up are always two
    // roles, no names); forst: who starts; egne: the favourites' own cards (or null).
    nyttSpill(o, antall, forst, egne) {
      const roller = o.gjeng === "barnvoksen";
      const n = roller ? 2 : antall;
      const tur = roller ? 0 : ((forst % n) + n) % n;
      return {
        gjeng: o.gjeng,
        stokk: egne ? null : M.stokkFor(o.gjeng, o.alder),
        egne: egne || null,
        modus: o.modus,
        roller,
        antall: n,
        niva: o.niva,
        lengde: egne ? Math.max(1, Math.min(o.lengde, egne.length)) : o.lengde,
        poeng: o.modus === "gjett" && !!o.poeng,
        nr: 1, // the card on the table (1 … lengde)
        tur, // the seat whose turn it is (in «Begge svarer»: who answers first)
        kort: -1, // index in the deck (or in egne)
        sett: [], // every card that has been on the table in this game
        fase: o.modus === "gjett" ? "gjett" : "kort",
        gjettet: [], // seats that have guessed (a toggle per guesser)
        traff: [], // seats that guessed right (friendly points: a toggle until «Neste kort»)
        treff: Array(n).fill(0),
        besvart: 0,
        staOver: 0,
        byttet: 0,
        fav: [], // favourites saved in this game (keys)
        ferdig: false,
      };
    },
    // A seat's role: the child (0) and the grown-up (1), or nobody in particular.
    rolle: (sp, i) => (sp.roller ? (i === 0 ? "barn" : "voksen") : null),
    // The text a seat answers: the grown-up's own version when the card has one.
    tekstFor: (k, rolle) => (rolle === "voksen" && k.v ? k.v : k.t),
    // The ones who guess: everyone but the one whose turn it is.
    gjettere: (sp) => Array.from({ length: sp.antall }, (_, i) => i).filter((i) => i !== sp.tur),
    // Put a card on the table (the same number: a new card, a swap or a skip).
    legg(sp, k) {
      sp.kort = k;
      if (k >= 0 && !sp.sett.includes(k)) sp.sett.push(k);
      sp.fase = sp.modus === "gjett" ? "gjett" : "kort";
      sp.gjettet = [];
      sp.traff = [];
    },
    // The card is answered. Returns "ferdig" after the last card, else "neste" (the caller lays
    // the next card with legg). Friendly points for the hits that are switched on.
    svart(sp) {
      if (sp.ferdig || (sp.modus === "gjett" && sp.fase !== "svar")) return null;
      sp.besvart += 1;
      if (sp.poeng) for (const i of sp.traff) if (i !== sp.tur && i < sp.antall) sp.treff[i] += 1;
      sp.gjettet = [];
      sp.traff = [];
      if (sp.nr >= sp.lengde) {
        sp.ferdig = true;
        return "ferdig";
      }
      sp.nr += 1;
      sp.tur = (sp.tur + 1) % sp.antall;
      return "neste";
    },
    // «Bytt kort»: the same one answers a new card. Never counts.
    bytt(sp, k) {
      sp.byttet += 1;
      M.legg(sp, k);
    },
    // «Stå over»: the turn goes on to the next one with a new card. Never counts.
    staOver(sp, k) {
      sp.staOver += 1;
      sp.tur = (sp.tur + 1) % sp.antall;
      M.legg(sp, k);
    },
    // «Gjett svaret»: everyone has guessed (or not – the button is never locked): the answer.
    hor(sp) {
      if (sp.modus !== "gjett" || sp.fase !== "gjett") return false;
      sp.fase = "svar";
      return true;
    },
    // The chips: who has guessed (before the answer), who hit (after it, with points on).
    veksle(sp, felt, i) {
      const lov = felt === "gjettet" ? sp.fase === "gjett" : sp.fase === "svar" && sp.poeng;
      if (sp.modus !== "gjett" || !lov || !M.gjettere(sp).includes(i)) return false;
      const l = sp[felt];
      sp[felt] = l.includes(i) ? l.filter((x) => x !== i) : [...l, i].sort((a, b) => a - b);
      return true;
    },
    rader: (sp) => sp.treff.map((poeng, i) => ({ i, poeng })),
    // The ones with the most hits (none when nobody hit).
    vinnere(sp) {
      const topp = Math.max(0, ...sp.treff);
      return topp > 0 ? sp.treff.map((p, i) => (p === topp ? i : -1)).filter((i) => i >= 0) : [];
    },
    // Favourites are card copies (they survive changes in the decks): the key is deck + text.
    favNokkel: (s, k) => `${s || ""}|${k.t}`,
    favKopi(s, k) {
      const c = { s: s || "", ty: k.ty, n: k.n, t: k.t };
      if (k.v) c.v = k.v;
      if (k.f) c.f = k.f;
      if (k.e) c.e = k.e;
      return c;
    },
    // A stored favourites list, cleaned (anything odd is dropped, at most MAKS_FAV, no doubles).
    rensFav(liste) {
      const ut = [];
      const sett = new Set();
      for (const k of Array.isArray(liste) ? liste : []) {
        if (!k || typeof k.t !== "string" || !k.t.trim() || !TYPER.includes(k.ty)) continue;
        const c = M.favKopi(typeof k.s === "string" ? k.s : "", {
          ty: k.ty,
          n: [1, 2, 3].includes(k.n) ? k.n : 1,
          t: k.t.slice(0, 300),
          v: typeof k.v === "string" ? k.v.slice(0, 300) : "",
          f: typeof k.f === "string" ? k.f.slice(0, 300) : "",
          e: typeof k.e === "string" ? k.e.slice(0, 16) : "",
        });
        const n = M.favNokkel(c.s, c);
        if (sett.has(n)) continue;
        sett.add(n);
        ut.push(c);
        if (ut.length >= MAKS_FAV) break;
      }
      return ut;
    },
    // Add or remove a favourite. Returns the new list and whether the card is now a favourite.
    veksleFav(liste, s, k) {
      const n = M.favNokkel(s, k);
      const har = liste.some((f) => M.favNokkel(f.s, f) === n);
      if (har) return { liste: liste.filter((f) => M.favNokkel(f.s, f) !== n), pa: false };
      if (liste.length >= MAKS_FAV) return { liste, pa: false, fullt: true };
      return { liste: [M.favKopi(s, k), ...liste], pa: true };
    },
  };
  function R1to3(n) {
    return n === 2 || n === 3 ? n : 1;
  }
  window.RusjForteller = M;

  const R = window.Rusj;
  if (!R) return; // loaded by the unit tests

  // ---------- The game ----------

  const D = window.RUSJ_DATA.kort;
  const esc = R.esc;
  const STOKK = {};
  D.stokker.forEach((s) => (STOKK[s.id] = s.kort));
  const ALLE = D.stokker.reduce((sum, s) => sum + s.kort.length, 0);
  const DEKK = {}; // R.kortstokk per deck, made when first needed (it needs the started app)
  const dekk = (id) => DEKK[id] || (DEKK[id] = R.kortstokk(id, STOKK[id].length));
  const FAV_NOKKEL = "fortelleren.favoritter";
  let favListe = null;
  const fav = () => favListe || (favListe = M.rensFav(R.les(FAV_NOKKEL, [])));
  let favVisning = null; // the list on the favourites screen: a removed card stays until you leave, so a wrong tap is undone with one more
  let feire = false;
  let H;

  const TYPE = {
    fortell: { ikon: "💬", navn: R.t("Fortell om") },
    minne: { ikon: "📸", navn: R.t("Minne") },
    drom: { ikon: "✨", navn: R.t("Drøm") },
    hvis: { ikon: "🤔", navn: R.t("Hva om?") }, // sprak-ok
    folelse: { ikon: "💛", navn: R.t("Følelser") },
    verdi: { ikon: "🧭", navn: R.t("Det viktige") },
    takk: { ikon: "🌻", navn: R.t("Takknemlig") },
    vis: { ikon: "✏️", navn: R.t("Vis og tegn") }, // sprak-ok
  };
  const NIVA = { 1: R.t("Lett"), 2: R.t("Middels"), 3: R.t("Dypere") };
  const STOKKNAVN = {
    barn46: R.t("Barn 4–6 år"),
    barn79: R.t("Barn 7–9 år"),
    barn1012: R.t("Barn 10–12 år"),
    familie: R.t("Familie"),
    venner: R.t("Venner"),
    ungdom: R.t("Ungdom 13–16"),
    voksne: R.t("Voksne"),
  };
  const GJENG = {
    barnvoksen: { ikon: "🧒", navn: R.t("Barn og voksen"), tekst: R.t("Et barn og en voksen – begge svarer") },
    familie: { ikon: "🏡", navn: R.t("Familie"), tekst: R.t("Store og små rundt bordet") },
    venner: { ikon: "😎", navn: R.t("Venner"), tekst: R.t("Bli enda bedre kjent") },
    ungdom: { ikon: "🎧", navn: R.t("Ungdom 13–16"), tekst: R.t("Vennskap, følelser og framtida") },
    voksne: { ikon: "🕯️", navn: R.t("Voksne"), tekst: R.t("Dypere samtaler") },
  };
  const MODUS = {
    begge: { ikon: "🤝", navn: R.t("Begge svarer"), tekst: R.t("Samme kort til barnet og den voksne") },
    snakk: { ikon: "💬", navn: R.t("Snakk sammen"), tekst: R.t("Én svarer, de andre spør videre") },
    gjett: { ikon: "🤔", navn: R.t("Gjett svaret"), tekst: R.t("Gjett først – så kommer svaret") },
  };
  const ALDER = { 46: R.t("4–6 år"), 79: R.t("7–9 år"), 1012: R.t("10–12 år") };
  const OPPSETT = () => M.rydd({});

  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const lagretAntall = () => R.felles.navn.filter((n) => String(n || "").trim()).length;
  const kortet = (sp) => (sp.egne ? sp.egne[sp.kort] : STOKK[sp.stokk][sp.kort]);
  const stokkNavn = (sp) => (sp.egne ? R.t("Favoritter") : STOKKNAVN[sp.stokk]);

  // ---------- Seats: names, or the child and the grown-up ----------

  const seteNavn = (sp, i) => (sp.roller ? (i === 0 ? R.t("Barnet") : R.t("Den voksne")) : R.navn(i));
  const seteIkon = (sp, i) => (sp.roller ? (i === 0 ? "🧒" : "🧑") : R.DYR[i % 20]);
  const seteAvatar = (sp, i, str) =>
    sp.roller ? `<span class="avatar ft-rolle ${str || ""}" style="--pf: var(--p${i + 1})" aria-hidden="true">${seteIkon(sp, i)}</span>` : R.avatar(i, str);
  const sinTur = (sp) => (sp.roller ? (sp.tur === 0 ? R.t("Barnets tur") : R.t("Den voksnes tur")) : R.t("{navn} sin tur", { navn: R.navn(sp.tur) }));
  const hvaSvarer = (sp) => (sp.roller ? (sp.tur === 0 ? R.t("Hva svarer barnet?") : R.t("Hva svarer den voksne?")) : R.t("Hva svarer {navn}?", { navn: R.navn(sp.tur) }));
  const gjettForst = (sp) => (sp.roller ? (sp.tur === 0 ? R.t("Den voksne gjetter først.") : R.t("Barnet gjetter først.")) : R.t("De andre gjetter først."));
  const naForteller = (sp) => (sp.roller ? (sp.tur === 0 ? R.t("Nå forteller barnet!") : R.t("Nå forteller den voksne!")) : R.t("Nå forteller {navn}!", { navn: R.navn(sp.tur) }));

  // ---------- Cards ----------

  const enkel = (antall) => (f) => {
    const k = [];
    for (let i = 0; i < antall; i++) if (f(i)) k.push(i);
    return k.length ? R.velg(k) : -1;
  };
  function trekkFor(sp) {
    if (sp.egne) return M.trekk(sp.egne, null, sp.modus, sp.sett, enkel(sp.egne.length));
    return M.trekk(STOKK[sp.stokk], M.nivaFor(sp.niva, sp.nr, sp.lengde), sp.modus, sp.sett, (f) => dekk(sp.stokk).neste(f));
  }
  const favStokk = (sp) => (sp.egne ? kortet(sp).s : sp.stokk);
  const erFav = (s, k) => fav().some((f) => M.favNokkel(f.s, f) === M.favNokkel(s, k));

  // What the one whose turn it is reads (in «Begge svarer» the child's text is the main one).
  function hovedtekst(sp, k) {
    if (sp.modus === "begge") return k.t;
    return M.tekstFor(k, M.rolle(sp, sp.tur));
  }

  function kortHtml(sp) {
    const k = kortet(sp);
    const T = TYPE[k.ty] || TYPE.fortell;
    const tekst = hovedtekst(sp, k);
    const begge = sp.modus === "begge";
    const storrelse = tekst.length > 95 ? " lang" : tekst.length > 60 ? " mid" : "";
    const videre = k.f && !(sp.modus === "gjett" && sp.fase === "gjett") ? `<p class="ft-videre"><b>${esc(R.t("Spør videre"))}</b> ${esc(k.f)}</p>` : "";
    // «Begge svarer»: the child's question is the big one; the grown-up's own version sits under it.
    const voksen = begge
      ? `<p class="ft-voksen"><b><span aria-hidden="true">🧑</span> ${esc(R.t("Den voksne:"))}</b> ${esc(k.v || R.t("Det samme – svar du også!"))}</p>`
      : "";
    return `<div class="bunke ft-bunke ft-b${k.n}"><article class="storkort ft-kort ft-n${k.n}${begge ? " ft-begge" : ""}${k.e ? " ft-med-emoji" : ""}" data-sveip="bytt">
      <div class="storkort-topp"><span class="storkort-etikett"><span aria-hidden="true">${T.ikon}</span> ${esc(T.navn)}</span><span class="storkort-nr">${esc(R.t("{n} av {av}", { n: sp.nr, av: sp.lengde }))}</span></div>
      <div class="ft-midt">
        ${k.e ? `<span class="ft-emoji" aria-hidden="true">${esc(k.e)}</span>` : ""}
        <p class="storkort-tekst ft-tekst${storrelse}">${esc(tekst)}</p>
        ${voksen}
      </div>
      ${videre}
    </article></div>`;
  }

  // Who is on, above the card, and the level of the card.
  function hodeHtml(sp) {
    const k = kortet(sp);
    let hvem;
    let under = "";
    let avatar;
    if (sp.modus === "begge") {
      hvem = R.t("Begge svarer");
      under = sp.tur === 0 ? R.t("Barnet svarer først") : R.t("Den voksne svarer først");
      avatar = `<span class="ft-par">${seteAvatar(sp, sp.tur, "mid")}${seteAvatar(sp, 1 - sp.tur, "mid")}</span>`;
    } else {
      avatar = seteAvatar(sp, sp.tur, "mid");
      if (sp.modus === "gjett" && sp.fase === "gjett") {
        hvem = hvaSvarer(sp);
        under = gjettForst(sp);
      } else if (sp.modus === "gjett") hvem = naForteller(sp);
      else hvem = sinTur(sp);
    }
    return `<div class="ft-hode">${avatar}<p class="ft-hvem"><b>${esc(hvem)}</b>${under ? `<small>${esc(under)}</small>` : ""}</p><span class="ft-niva ft-n${k.n}">${esc(NIVA[k.n] || NIVA[1])}</span></div>`;
  }

  const brikker = (sp, h, tittel, valgt) =>
    `<div class="ft-gjett"><p class="ft-gjett-tittel" id="ft-gjett-tittel">${esc(tittel)}</p><div class="brikker ft-brikker" role="group" aria-labelledby="ft-gjett-tittel">${M.gjettere(sp)
      .map(
        (i) =>
          `<button class="brikke" data-h="${h}" data-v="${i}" aria-pressed="${valgt.includes(i)}"><span aria-hidden="true">${seteIkon(sp, i)}</span><span class="ft-brikke-navn">${esc(seteNavn(sp, i))}</span></button>`,
      )
      .join("")}</div></div>`;

  function gjettHtml(sp) {
    if (sp.modus !== "gjett") return "";
    if (sp.fase === "gjett") return brikker(sp, "gjettet", R.t("Hvem har gjettet?"), sp.gjettet);
    if (sp.poeng) return brikker(sp, "traff", R.t("Hvem traff?"), sp.traff);
    return "";
  }

  const hjerteKnapp = (pa) =>
    `<button class="knapp-2 ft-hjerte" data-h="favoritt" aria-pressed="${pa}"><span class="ft-hjerte-ikon" aria-hidden="true">${pa ? "♥" : "♡"}</span><span class="ft-hjerte-tekst">${esc(R.t("Favoritt"))}</span></button>`;

  // Screen readers don't hear a card that is redrawn in place.
  function siKort(S) {
    const sp = S.spill;
    const k = kortet(sp);
    const hvem = sp.modus === "begge" ? R.t("Begge svarer.") : sp.modus === "gjett" ? hvaSvarer(sp) : `${sinTur(sp)}.`;
    const voksen = sp.modus === "begge" ? ` ${R.t("Den voksne:")} ${k.v || R.t("Det samme – svar du også!")}` : "";
    R.si(`${R.t("Kort {n} av {av}.", { n: sp.nr, av: sp.lengde })} ${hvem} ${hovedtekst(sp, k)}${voksen}`);
  }

  function nyttKort(sp) {
    M.legg(sp, trekkFor(sp));
  }

  function tilSlutt(S, tidlig) {
    const sp = S.spill;
    sp.ferdig = true;
    feire = true;
    S.sist = { kort: sp.besvart, gjeng: sp.gjeng, modus: sp.modus, fav: !!sp.egne };
    R.statistikk("ferdig", { kort: sp.besvart, lengde: sp.lengde, sto: sp.staOver, byttet: sp.byttet, fav: sp.fav.length, poeng: sp.poeng, tidlig: !!tidlig });
    if (sp.poeng && !sp.roller) R.kveld.registrer(M.rader(sp));
    if (sp.besvart >= 10) R.merke("fortelleren-ti");
    R.slippVaken();
    R.gaTil("slutt");
  }

  function startSpill(S, egne) {
    const o = (S.oppsett = M.rydd(S.oppsett));
    const antall = R.klamp(S.antall || 3, 2, 12);
    let liste = egne;
    if (liste) {
      liste = R.stokk(liste.filter((k) => M.passer(k, o.modus)));
      if (!liste.length) return false;
    }
    S.spill = M.nyttSpill(o, antall, R.heltall(0, antall - 1), liste || null);
    nyttKort(S.spill);
    feire = false;
    R.statistikk("start", { modus: o.modus, gjeng: o.gjeng, niva: o.niva, lengde: S.spill.lengde, spillere: S.spill.antall, fav: !!liste });
    R.gaTil("kort");
    siKort(S);
    return true;
  }

  // ---------- The tips for grown-ups ----------

  const TIPS = [
    R.t("Lytt mer enn du snakker."),
    R.t("Spør videre med «Fortell mer!», «Hvordan var det?» eller «Hva skjedde så?»."),
    R.t("Si det barnet sa med dine egne ord: «Så du ble glad da?» Da merker barnet at du lytter."),
    R.t("Ingen svar er feil. Ikke rett på svaret og ikke gi råd – vær nysgjerrig."),
    R.t("Svar selv også, gjerne først. Det gjør det tryggere å fortelle."),
    R.t("Vil noen ikke svare, er det helt greit. Ikke grav – kom heller tilbake til det en annen gang."),
  ];
  const tipsArk = () => `
    <h2 id="ark-tittel">${esc(R.t("Tips til voksne"))}</h2>
    <ul class="ft-tips">${TIPS.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
    <button class="knapp" data-h="lukk-ark">${esc(R.t("Skjønner!"))}</button>`;

  const sistTekst = (s) =>
    R.t("Sist: {kort} · {gjeng} · {modus}", {
      kort: R.flertall(s.kort, "kort", "kort"),
      gjeng: s.fav ? R.t("Favoritter") : GJENG[s.gjeng].navn,
      modus: MODUS[s.modus].navn,
    });

  // ---------- Start ----------

  R.start({
    id: "fortelleren",
    versjon: 1,
    pagar,

    tilstand: () => ({
      antall: R.klamp(lagretAntall() || 3, 2, 12),
      oppsett: OPPSETT(),
      spill: null,
      sist: null,
    }),

    lastet(S) {
      S.oppsett = M.rydd(S.oppsett);
      const sp = S.spill;
      const ints = (l, maks) => Array.isArray(l) && l.every((n) => heltall(n) && n < maks);
      let ok = !!sp && typeof sp === "object";
      if (ok) {
        const liste = sp.egne ? (Array.isArray(sp.egne) ? sp.egne : null) : STOKK[sp.stokk];
        if (sp.egne) sp.egne = M.rensFav(sp.egne);
        ok =
          !!liste &&
          (!sp.egne || sp.egne.length === liste.length) &&
          GJENGER.includes(sp.gjeng) &&
          M.moduserFor(sp.gjeng).includes(sp.modus) &&
          sp.roller === (sp.gjeng === "barnvoksen") &&
          Number.isInteger(sp.antall) &&
          sp.antall >= 2 &&
          sp.antall <= 12 &&
          (!sp.roller || sp.antall === 2) &&
          NIVAER.includes(sp.niva) &&
          Number.isInteger(sp.lengde) &&
          sp.lengde >= 1 &&
          sp.lengde <= 20 &&
          Number.isInteger(sp.nr) &&
          sp.nr >= 1 &&
          sp.nr <= sp.lengde &&
          heltall(sp.tur) &&
          sp.tur < sp.antall &&
          heltall(sp.kort) &&
          sp.kort < liste.length &&
          ints(sp.sett, liste.length) &&
          FASER.includes(sp.fase) &&
          (sp.modus === "gjett" ? sp.fase !== "kort" : sp.fase === "kort") &&
          ints(sp.gjettet, sp.antall) &&
          ints(sp.traff, sp.antall) &&
          Array.isArray(sp.treff) &&
          sp.treff.length === sp.antall &&
          sp.treff.every(heltall) &&
          Array.isArray(sp.fav);
      }
      if (!ok) S.spill = null;
      else {
        sp.poeng = sp.modus === "gjett" && !!sp.poeng;
        sp.ferdig = !!sp.ferdig;
        for (const f of ["besvart", "staOver", "byttet"]) if (!heltall(sp[f])) sp[f] = 0;
        sp.fav = sp.fav.filter((x) => typeof x === "string").slice(0, 50);
      }
      const s = S.sist;
      if (!(s && heltall(s.kort) && GJENGER.includes(s.gjeng) && MODUSER.includes(s.modus))) S.sist = null;
      if (!S.spill && ["kort", "slutt"].includes(S.skjerm)) S.skjerm = "hjem";
    },

    regler: {
      intro: R.t("Trekk et kort og fortell. De andre lytter og spør videre. Det finnes ingen feil svar – og det er alltid lov å stå over."),
      steg: [
        [R.t("Velg hvem som spiller"), R.t("Barn og voksen, familie, venner, ungdom eller voksne. For barn velger dere alder – de minste får korte spørsmål med bilder som en voksen leser høyt.")],
        [R.t("Fortell og lytt"), R.t("Den som har tur, svarer på kortet. De andre lytter og spør videre – forslaget står nederst på kortet.")],
        [R.t("Gjett, eller svar begge"), R.t("I «Gjett svaret» gjetter de andre først hva svaret blir. Med «Begge svarer» svarer barnet og den voksne på det samme kortet.")],
      ],
      tips: [
        R.t("Lytt mer enn du snakker. «Fortell mer!» er ofte det beste spørsmålet."),
        R.t("Vil du ikke svare? Trykk «Stå over» eller «Bytt kort» – det er alltid lov. Du kan også sveipe kortet til siden."),
        R.t("Velg nivået «Stiger», så begynner det lett og blir litt dypere etter hvert."),
        R.t("Trykk på hjertet for å lagre et kort dere likte. Favorittene ligger bare på denne mobilen."),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const n = fav().length;
          const lenker = R.ui.lenkerad(
            R.ui.lenke(R.t("Slik spiller du"), "regler"),
            R.ui.lenke(R.t("Tips til voksne"), "tips"),
            n ? R.ui.lenke(R.t("Favoritter ({n})", { n }), "favoritter") : "",
          );
          return R.ui.spillhjem({
            slagordHtml: `${esc(R.t("Trekk et kort."))}<br><em>${esc(R.t("Fortell, lytt og bli bedre kjent."))}</em>`,
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: pagar(S) ? R.t("Fortsett · kort {n} av {av}", { n: S.spill.nr, av: S.spill.lengde }) : "",
              ekstraHtml: lenker + (S.sist ? `<p class="ft-sist">${esc(sistTekst(S.sist))}</p>` : ""),
            }),
            merker: [
              ["2–12", R.t("spillere")],
              [String(ALLE), R.t("kort")],
              ["4+", R.t("år")],
            ],
          });
        },
        inn: () => R.slippVaken(),
      },

      oppsett: {
        tittel: R.t("Nytt spill"),
        tilbake: "hjem",
        vis(S) {
          const o = (S.oppsett = M.rydd(S.oppsett));
          const barn = o.gjeng === "barnvoksen";
          const NIVAHJELP = {
            stiger: R.t("Begynner lett og blir litt dypere etter hvert."),
            1: R.t("Hverdagslig og lett å svare på."),
            2: R.t("Litt mer å tenke på."),
            3: R.t("Følelser, drømmer og det som betyr noe."),
          };
          const LENGDEHJELP = { 5: R.t("En liten stund – fint ved leggetid."), 10: R.t("Passe lenge – fint ved middagen."), 20: R.t("God tid – til lange kvelder.") };
          const ALDERHJELP = {
            46: R.t("Korte spørsmål med bilder. Den voksne leser høyt."),
            79: R.t("Fantasi, venner, skole og hverdag."),
            1012: R.t("Litt større tanker om venner, rettferdighet og framtida."),
          };
          return `
          <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
          <section class="seksjon">
            <h2>${esc(R.t("Hvem spiller?"))}</h2>
            <div class="ft-fliser">${R.ui.fliser(
              "gjeng",
              GJENGER.map((g) => ({ v: g, tittel: GJENG[g].navn, tekst: GJENG[g].tekst, ikon: GJENG[g].ikon })),
              o.gjeng,
            )}</div>
          </section>
          ${
            barn
              ? `<section class="seksjon">
            <h2>${esc(R.t("Barnets alder"))}</h2>
            ${R.ui.seg("alder", ALDRE.map((a) => [a, ALDER[a]]), o.alder, { etikett: R.t("Barnets alder") })}
            <p class="hjelp">${esc(ALDERHJELP[o.alder])}</p>
          </section>`
              : ""
          }
          <section class="seksjon">
            <h2>${esc(R.t("Slik spiller dere"))}</h2>
            <div class="ft-fliser">${R.ui.fliser(
              "modus",
              M.moduserFor(o.gjeng).map((m) => ({ v: m, tittel: MODUS[m].navn, tekst: MODUS[m].tekst, ikon: MODUS[m].ikon })),
              o.modus,
            )}</div>
          </section>
          ${o.modus === "gjett" ? R.ui.bryter("poeng", o.poeng, R.t("Vennlige poeng"), R.t("Ett poeng for hvert treff. Helt frivillig.")) : ""}
          <section class="seksjon">
            <h2>${esc(R.t("Nivå"))}</h2>
            ${R.ui.seg("niva", NIVAER.map((n) => [n, n === "stiger" ? R.t("Stiger") : NIVA[n]]), o.niva, { etikett: R.t("Nivå") })}
            <p class="hjelp">${esc(NIVAHJELP[o.niva])}</p>
          </section>
          <section class="seksjon">
            <h2>${esc(R.t("Antall kort"))}</h2>
            ${R.ui.seg("lengde", LENGDER.map((n) => [String(n), String(n)]), String(o.lengde), { etikett: R.t("Antall kort") })}
            <p class="hjelp">${esc(LENGDEHJELP[o.lengde])}</p>
          </section>
          ${barn ? "" : R.ui.spillere({ min: 2, max: 12, tittel: R.t("Navn") })}
          ${
            barn || o.gjeng === "familie"
              ? `<div class="papirboks ft-tips-boks"><p><span aria-hidden="true">💡</span> <b>${esc(R.t("Lytt mer enn du snakker."))}</b></p>${R.ui.lenke(R.t("Flere tips til voksne"), "tips")}</div>`
              : ""
          }
          ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start"))}`;
        },
      },

      // Everyone: the card on the table.
      kort: {
        tittel: (S) => (S.spill ? stokkNavn(S.spill) : null),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const sist = sp.nr >= sp.lengde;
          const hoved =
            sp.modus === "gjett" && sp.fase === "gjett" ? R.ui.knapp(R.t("Hør svaret"), "hor") : R.ui.knapp(sist ? R.t("Ferdig") : R.t("Neste kort"), "neste");
          return `
            <h1 class="vh" id="skjerm-tittel">${esc(R.t("Kort {n} av {av}", { n: sp.nr, av: sp.lengde }))}</h1>
            ${hodeHtml(sp)}
            ${kortHtml(sp)}
            ${gjettHtml(sp)}
            ${R.ui.dokk(
              `<div class="knapprad ft-knapper">${hjerteKnapp(erFav(favStokk(sp), kortet(sp)))}${hoved}</div>`,
              R.ui.lenkerad(R.ui.lenke(R.t("Bytt kort"), "bytt"), R.ui.lenke(R.t("Stå over"), "sta-over"), R.ui.lenke(R.t("Avslutt"), "avslutt")),
            )}`;
        },
        inn: () => R.holdVaken(),
      },

      slutt: {
        tittel: null,
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const nye = sp.fav.length;
          const v = sp.poeng ? M.vinnere(sp) : [];
          const tekst = nye
            ? R.t("Dere lagret {n} ny favoritt.|Dere lagret {n} nye favoritter.", { n: nye })
            : sp.besvart
              ? R.t("Takk for at dere lyttet til hverandre.")
              : R.t("Dere kan alltid trekke flere kort en annen gang.");
          const treff = sp.poeng
            ? `<section class="seksjon">
                <h2>${esc(R.t("Flest treff"))}</h2>
                ${
                  v.length
                    ? R.ui.poengliste(M.rader(sp).map((r) => (sp.roller ? Object.assign(r, { navn: seteNavn(sp, r.i) }) : r)))
                    : `<p class="hjelp">${esc(R.t("Ingen treff denne gangen – nå vet dere mer!"))}</p>`
                }
              </section>`
            : "";
          return `
            ${R.ui.banner({
              etikett: R.flertall(sp.besvart, "kort", "kort"),
              tittel: R.t("Godt snakka!"),
              tekst,
              stemning: sp.besvart ? "jubel" : "",
            })}
            ${treff}
            ${sp.besvart ? `<div class="ft-del">${R.ui.knapp2(R.t("Del"), "del", { ikon: "📣" })}</div>` : ""}
            ${R.ui.flereSpill({ antall: sp.antall })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen"), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "endre"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
        },
        inn(S) {
          if (!feire) return;
          feire = false;
          if (S.spill && S.spill.besvart) R.lyd.pling();
        },
      },

      // The favourite cards (this phone only).
      favoritter: {
        tittel: R.t("Favoritter"),
        tilbake: "hjem",
        vis(S) {
          const liste = favVisning || fav();
          const antall = fav().length;
          const rader = liste
            .map((k, i) => {
              const T = TYPE[k.ty] || TYPE.fortell;
              const pa = erFav(k.s, k);
              const kilde = STOKKNAVN[k.s] ? ` · ${STOKKNAVN[k.s]}` : "";
              return `<li class="papirboks ft-fav${pa ? "" : " fjernet"}">
                <p class="ft-fav-topp"><span aria-hidden="true">${k.e ? esc(k.e) : T.ikon}</span> ${esc(T.navn + kilde)}</p>
                <p class="ft-fav-tekst">${esc(k.t)}</p>
                <button class="ft-fav-hjerte" data-h="fav-veksle" data-v="${i}" aria-pressed="${pa}" aria-label="${esc(R.t("Favoritt: {tekst}", { tekst: R.kutt(k.t, 60) }))}"><span aria-hidden="true">${pa ? "♥" : "♡"}</span></button>
              </li>`;
            })
            .join("");
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Favoritter"))}</h1>
            <p class="ingress">${esc(R.t("Kortene dere har lagret med hjertet. De ligger bare på denne mobilen."))}</p>
            ${liste.length ? `<ul class="ft-favliste">${rader}</ul>` : `<p class="papirboks ft-tom">${esc(R.t("Ingen favoritter ennå. Trykk på hjertet under et kort for å lagre det."))}</p>`}
            ${R.ui.dokk(
              R.ui.knapp(R.t("Spill favorittene"), "spill-fav", { av: !antall || pagar(S) }),
              pagar(S) ? `<p class="hjelp ft-midt-tekst">${esc(R.t("Gjør ferdig spillet dere er i, først."))}</p>` : "",
            )}`;
        },
        inn() {
          favVisning = fav().slice();
        },
        ut() {
          favVisning = null;
        },
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
        R.gaTil("kort");
      },
      gjeng(el, e, S) {
        const g = el.dataset.v;
        if (!GJENGER.includes(g)) return;
        const o = S.oppsett;
        const fra = o.gjeng;
        o.gjeng = g;
        // A child and a grown-up start with «Begge svarer»; the others never have it.
        if (g === "barnvoksen" && fra !== g) o.modus = "begge";
        S.oppsett = M.rydd(o);
        R.vis();
      },
      alder(el, e, S) {
        S.oppsett.alder = el.dataset.v;
        S.oppsett = M.rydd(S.oppsett);
        R.vis();
      },
      modus(el, e, S) {
        S.oppsett.modus = el.dataset.v;
        S.oppsett = M.rydd(S.oppsett);
        R.vis();
      },
      niva(el, e, S) {
        S.oppsett.niva = el.dataset.v;
        S.oppsett = M.rydd(S.oppsett);
        R.vis();
      },
      lengde(el, e, S) {
        S.oppsett.lengde = Number(el.dataset.v);
        S.oppsett = M.rydd(S.oppsett);
        R.vis();
      },
      poeng(el, e, S) {
        S.oppsett.poeng = !S.oppsett.poeng;
        R.vis();
      },
      tips() {
        R.ark(tipsArk());
      },
      start(el, e, S) {
        startSpill(S, null);
      },
      // From the card: answered, the next card (or the end).
      async neste(el, e, S) {
        const sp = S.spill;
        if (!pagar(S)) return;
        const fortsatt = R.vakt();
        const svar = M.svart(sp);
        if (!svar) return;
        if (svar === "ferdig") return tilSlutt(S);
        nyttKort(sp);
        await R.kastKort(-1);
        if (!fortsatt()) return;
        R.vis();
        siKort(S);
      },
      // «Gjett svaret»: the guesses are in – now the answer.
      hor(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || !M.hor(sp)) return;
        R.lyd.pop();
        R.vis();
        R.si(naForteller(sp));
      },
      gjettet(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || !M.veksle(sp, "gjettet", Number(el.dataset.v))) return;
        R.lyd.klikk();
        R.vis();
      },
      traff(el, e, S) {
        const sp = S.spill;
        const i = Number(el.dataset.v);
        if (!pagar(S) || !M.veksle(sp, "traff", i)) return;
        if (sp.traff.includes(i)) {
          R.lyd.pling();
          R.vibrer([20, 30, 40]);
        } else R.lyd.klikk();
        R.vis();
      },
      // Swap the card (the link or a swipe): never counts.
      async bytt(el, e, S) {
        const sp = S.spill;
        if (!pagar(S)) return;
        const fortsatt = R.vakt();
        if (!(el && el.classList && el.classList.contains("storkort"))) await R.kastKort(-1);
        if (!fortsatt()) return;
        M.bytt(sp, trekkFor(sp));
        R.vis();
        siKort(S);
      },
      // Pass: the turn goes on with a new card. Always fine.
      async "sta-over"(el, e, S) {
        const sp = S.spill;
        if (!pagar(S)) return;
        const fortsatt = R.vakt();
        await R.kastKort(1);
        if (!fortsatt()) return;
        sp.tur = (sp.tur + 1) % sp.antall;
        sp.staOver += 1;
        nyttKort(sp);
        R.vis();
        R.toast(R.t("Helt greit å stå over!"));
        siKort(S);
      },
      favoritt(el, e, S) {
        const sp = S.spill;
        if (!pagar(S)) return;
        const k = kortet(sp);
        const s = favStokk(sp);
        const r = M.veksleFav(fav(), s, k);
        if (r.fullt) return R.toast(R.t("Favorittlista er full. Fjern noen først."));
        favListe = r.liste;
        R.skriv(FAV_NOKKEL, favListe);
        const n = M.favNokkel(s, k);
        sp.fav = r.pa ? [...sp.fav.filter((x) => x !== n), n] : sp.fav.filter((x) => x !== n);
        if (r.pa) {
          R.lyd.pling();
          R.vibrer(20);
        } else R.lyd.klikk();
        R.vis();
        R.si(r.pa ? R.t("Lagret som favoritt.") : R.t("Fjernet fra favorittene."));
      },
      favoritter() {
        R.gaTil("favoritter");
      },
      "fav-veksle"(el, e, S) {
        const liste = favVisning || fav();
        const k = liste[Number(el.dataset.v)];
        if (!k) return;
        const r = M.veksleFav(fav(), k.s, k);
        if (r.fullt) return R.toast(R.t("Favorittlista er full. Fjern noen først."));
        favListe = r.liste;
        R.skriv(FAV_NOKKEL, favListe);
        R.lyd.klikk();
        R.vis();
        R.si(r.pa ? R.t("Lagret som favoritt.") : R.t("Fjernet fra favorittene."));
      },
      "spill-fav"(el, e, S) {
        if (pagar(S) || !fav().length) return;
        if (!startSpill(S, fav().slice())) R.toast(R.t("Ingen av favorittene passer i «Gjett svaret». Velg en annen måte å spille på."));
      },
      async avslutt(el, e, S) {
        const fortsatt = R.vakt();
        const sp = S.spill;
        const ja = await R.bekreft(
          R.t("Ferdig for nå?"),
          sp && sp.besvart ? R.t("Dere ser hvor mange kort dere har snakket om. Favorittene blir liggende.") : R.t("Dere kan alltid trekke flere kort en annen gang."),
          R.t("Avslutt"),
          R.t("Spill videre"),
        );
        if (!ja || !fortsatt() || !pagar(S)) return;
        if (sp.besvart) return tilSlutt(S, true);
        R.statistikk("ferdig", { kort: 0, lengde: sp.lengde, sto: sp.staOver, byttet: sp.byttet, fav: sp.fav.length, poeng: sp.poeng, tidlig: true });
        S.spill = null;
        R.slippVaken();
        R.gaTil("hjem");
      },
      del(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.besvart) return;
        const kort = R.flertall(sp.besvart, "kort", "kort");
        const linjer = [kort, `${MODUS[sp.modus].navn} · ${stokkNavn(sp)}`];
        if (sp.fav.length) linjer.push(R.t("{n} ny favoritt|{n} nye favoritter", { n: sp.fav.length }));
        // Never the answers: at most a question from the deck that the group saved as a favourite.
        const favKort = sp.fav.length ? fav().find((f) => M.favNokkel(f.s, f) === sp.fav[sp.fav.length - 1]) : null;
        const tekst = [R.t("Vi har snakket om {kort} i {spill} 💬", { kort, spill: R.app.navn })];
        if (favKort) tekst.push(R.t("Prøv dette kortet: «{tekst}»", { tekst: favKort.t }));
        const adresse = location.origin + R.forside + ((R.sprak !== "nb" && window.RUSJ_SPILL && window.RUSJ_SPILL.slug) || "fortelleren") + "/";
        R.del(R.app.navn, tekst.join("\n"), adresse, { kort: { tittel: R.app.navn, linjer } });
      },
      igjen(el, e, S) {
        const egne = S.spill && S.spill.egne ? fav().slice() : null;
        S.spill = null;
        if (egne && egne.length && startSpill(S, egne)) return;
        startSpill(S, null);
      },
      endre(el, e, S) {
        S.spill = null;
        R.gaTil("oppsett");
      },
    }),
  });
})();
