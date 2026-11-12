/* Løgnhalsen — «To sannheter og en løgn».
   The teller gets a theme, thinks of two true things and one lie, and either says them out loud
   or types them in secret (the app shuffles them into numbered cards). 3 · 2 · 1 – everyone
   shows 1, 2 or 3 fingers. The lie gets a big «LØGN!» stamp, everyone who guessed right gets a
   point, and the teller gets a point for each player fooled — and a nose that grows. Then the
   teller is asked for the story behind one of the true claims.
   «Lag en utfordring»: the same three claims packed into a link (…/lognhalsen/#u=…) for a friend
   who is not in the room. Nothing is sent to a server, and a link that comes in is treated as
   hostile text (see «A challenge in a link»). */
(function () {
  "use strict";

  const R = window.Rusj;
  const D = window.RUSJ_DATA.temaer;
  const esc = R.esc;

  const TEMAER = D.temaer;
  const tema = (id) => TEMAER.find((t) => t.id === id);
  const ALLE = [];
  TEMAER.forEach((t) => t.kort.forEach(([tekst, start]) => ALLE.push({ t: t.id, tekst, start })));
  const STOKK = R.kortstokk("temaer", ALLE.length);
  const MAKS = 100; // characters per typed claim
  const MAKS_NAVN = 16;
  const MANGE = 4; // listeners: from here «Hvem pekte på …?» gets the chips «Alle» / «Ingen» and the switch
  const STOR_FRA = 9; // players: from here the setup offers «Stor gjeng»
  const TIPS_ETTER = 3000; // ms before the coach line fades in
  const JUL = "jul";
  // Which screen shows each phase of a turn. The private typing screen is never resumed
  // directly (after a reload or "Fortsett"): the phone is handed over again first.
  const SKJERM_FOR = { tema: "tur", gi: "gi", skriv: "gi", pek: "pek", velg: "avslor", klar: "avslor", hvem: "avslor", resultat: "resultat" };

  let H; // the actions, so one can call another
  let opptatt = false; // a countdown or reveal is running
  let feire = false; // «Kåringen» is about to be shown for the first time
  let nyssSvart = false; // a challenge was answered just now (sound on the reveal)
  let ugyldigLenke = false; // a challenge link could not be read: say so on the home screen

  // ---------- Helpers ----------

  const erObjekt = (v) => !!v && typeof v === "object" && !Array.isArray(v);
  const heltall = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
  const sum = (liste) => liste.reduce((s, v) => s + v, 0);
  const pagar = (S) => !!S.spill && !S.spill.ferdig;
  const tellerAv = (sp) => (sp.start + sp.k) % sp.antall;
  const totalt = (sp) => sp.runder * sp.antall;
  const rundeNr = (sp) => Math.floor(sp.k / sp.antall) + 1;
  const lyttere = (sp) => {
    const t = tellerAv(sp);
    return Array.from({ length: sp.antall }, (_, i) => i).filter((i) => i !== t);
  };
  const navneliste = (indekser) => R.ramsOpp(indekser.map((i) => R.navn(i)));
  const rader = (sp) => Array.from({ length: sp.antall }, (_, i) => ({ i, poeng: sp.poeng[i] }));
  const ferdigSpilt = (sp) => sp.fase === "resultat" && sp.k + 1 >= totalt(sp);
  const tittel = (S) => (S.spill ? R.t("Runde {n} av {av}", { n: rundeNr(S.spill), av: S.spill.runder }) : R.t("Løgnhalsen"));
  // Shared on the end screen and by a challenge: the game's address in this edition.
  const DEL_URL = location.origin + R.forside + ((R.sprak !== "nb" && window.RUSJ_SPILL && window.RUSJ_SPILL.slug) || "lognhalsen") + "/";

  function standardAntall() {
    const lagret = R.felles.navn.filter((n) => String(n || "").trim()).length;
    return R.klamp(lagret || 4, 3, 20);
  }

  // Up to five players tell twice, six or more once — until the stepper is used.
  const standardRunder = (antall) => (antall >= 6 ? 1 : 2);
  const runderFor = (S) => (S.oppsett.runderValgt ? S.oppsett.runder : standardRunder(S.antall));
  // About two minutes a turn: «ca. 25 min», «ca. 1,5 timer».
  function tidTekst(turer) {
    const min = turer * 2;
    if (min < 55) return R.t("ca. {n} min", { n: Math.max(5, Math.round(min / 5) * 5) });
    const timer = Math.round(min / 30) / 2;
    return R.t("ca. {n} time|ca. {n} timer", { n: R.tall(timer) });
  }

  // ---------- Themes and the «Jul» season ----------

  // 1 November – 6 January (the date in Oslo, "YYYY-MM-DD"): the year the season started, else 0.
  function julesesong(dag) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dag || ""));
    if (!m) return 0;
    const ar = Number(m[1]);
    const mnd = Number(m[2]);
    if (mnd >= 11) return ar;
    return mnd === 1 && Number(m[3]) <= 6 ? ar - 1 : 0;
  }
  const sesong = () => julesesong(R.dag().tekst);
  const standardTemaer = () => TEMAER.map((t) => t.id).filter((id) => id !== JUL);
  // The order of the chips: «Jul» first during the season, last the rest of the year.
  function temaRekke() {
    const jul = tema(JUL);
    const andre = TEMAER.filter((t) => t.id !== JUL);
    return !jul ? andre : sesong() ? [jul, ...andre] : [...andre, jul];
  }
  // «Jul» is switched on once when the season starts (whoever switches it off keeps it off) and
  // off again when the season is over (whoever switches it on by hand in June keeps it).
  function julRegel(S) {
    const ar = tema(JUL) ? sesong() : 0;
    if (ar && S.jul !== ar) {
      if (!S.oppsett.temaer.includes(JUL)) S.oppsett.temaer.push(JUL);
      S.jul = ar;
    } else if (!ar && S.jul) {
      S.oppsett.temaer = S.oppsett.temaer.filter((id) => id !== JUL);
      if (!S.oppsett.temaer.length) S.oppsett.temaer = standardTemaer();
      S.jul = 0;
    }
  }

  function trekkTema(sp) {
    const valgt = new Set(sp.temaer);
    sp.tema = STOKK.neste((i) => valgt.has(ALLE[i].t));
  }

  function nyTur(S) {
    const sp = S.spill;
    trekkTema(sp);
    sp.utkast = ["", "", ""];
    sp.kort = null;
    sp.logn = null;
    sp.riktige = [];
    sp.lurtAntall = 0;
    sp.fase = sp.modus === "skriv" ? "gi" : "tema";
    R.gaTil(sp.modus === "skriv" ? "gi" : "tur");
  }

  // Progress dots for this round, in seat order: who has told already, who is telling now.
  function fremdrift(sp) {
    const forste = (rundeNr(sp) - 1) * sp.antall;
    const ferdige = [];
    for (let k = forste; k < sp.k; k++) ferdige.push((sp.start + k) % sp.antall);
    return R.ui.fremdrift(sp.antall, tellerAv(sp), ferdige);
  }

  // The coach line: one tip per turn, in an order that is shuffled once per game. It fades in
  // about three seconds after the teller got the theme, in room that is already there (nothing
  // moves). A redraw of the same screen (a new theme) must not hide it again, so the time is
  // counted from when the screen was entered (tur.ut / skriv.ut reset it).
  let tipsFra = 0;
  function tipsFor(sp) {
    const liste = [...D.tips.felles, ...(D.tips[sp.modus] || [])];
    const rekke = R.stokk(liste.map((_, i) => i), R.rng(sp.tipsFro >>> 0));
    return liste[rekke[sp.k % liste.length]];
  }
  function tipsHtml(sp) {
    if (!tipsFra) tipsFra = performance.now();
    const igjen = Math.round(TIPS_ETTER - (performance.now() - tipsFra));
    return `<span class="lh-tips${igjen <= 0 ? " vist" : ""}"${igjen > 0 ? ` style="animation-delay: ${igjen}ms"` : ""}><b>${esc(R.t("Tips:"))}</b> ${esc(tipsFor(sp))}</span>`;
  }

  function temaKort(sp) {
    const k = ALLE[sp.tema];
    const t = tema(k.t);
    return `<div class="lh-temakort">${R.ui.storkort({
      etikett: `${t.ikon} ${t.navn}`,
      tekst: k.tekst,
      fotHtml: `${esc(R.t("Begynn for eksempel sånn:"))} <b>${esc(R.t("«{tekst}»", { tekst: k.start }))}</b>${tipsHtml(sp)}`,
      klasse: k.tekst.length > 34 ? "lh-tema lh-langt" : "lh-tema",
    })}</div>`;
  }

  // A small version of the theme for the typing screen (room for the keyboard).
  function temaBoks(sp) {
    const k = ALLE[sp.tema];
    const t = tema(k.t);
    return `<div class="lh-temaboks">
      <div class="lh-temaboks-tekst"><span class="etikett">${t.ikon} ${esc(t.navn)}</span><p>${esc(k.tekst)}</p></div>
      <button class="knapp-2 liten" data-h="nytt-tema" aria-label="${esc(R.t("Nytt tema"))}"><span aria-hidden="true">🎲</span> ${esc(R.t("Nytt"))}</button>
      ${tipsHtml(sp)}
    </div>`;
  }

  function temaSammendrag(S) {
    const rekke = temaRekke();
    const valgt = rekke.filter((t) => S.oppsett.temaer.includes(t.id));
    const uten = rekke.filter((t) => !S.oppsett.temaer.includes(t.id));
    if (!uten.length) return `🎲 ${R.t("Alle temaer")}`;
    if (uten.length <= 2 && valgt.length > 2) return `🎲 ${R.t("Alle unntatt {liste}", { liste: R.ramsOpp(uten.map((t) => t.navn)) })}`;
    return valgt.map((t) => `${t.ikon} ${t.navn}`).join(" · ");
  }

  function temaArk(S) {
    return `
      <h2 id="ark-tittel">${esc(R.t("Velg temaer"))}</h2>
      <p class="ingress">${esc(R.t("Temaene gir fortelleren noe å snakke om. Velg så mange dere vil."))}</p>
      ${R.ui.brikker("temavalg", temaRekke().map((t) => ({ v: t.id, tekst: t.navn, ikon: t.ikon, antall: t.kort.length })), S.oppsett.temaer, { alle: true, etikett: R.t("Temaer") })}
      <button class="knapp" data-h="lukk-ark">${esc(R.t("Ferdig"))}</button>`;
  }

  // The three typed claims as numbered cards; after the reveal the lie gets the stamp.
  // valgt: the card the receiver of a challenge tapped.
  function pastanderHtml(sp, avslort, valgt) {
    return `<ol class="lh-pastander${avslort ? " avslort" : ""}">${sp.kort
      .map((tekst, i) => {
        const logn = avslort && i === sp.logn;
        const sant = avslort && i !== sp.logn;
        const mitt = valgt === i;
        return `<li class="lh-pastand${logn ? " logn" : ""}${sant ? " sant" : ""}${mitt ? " valgt" : ""}">
          <span class="lh-nr" aria-hidden="true">${i + 1}</span>
          <p><span class="vh">${esc(R.t("Nummer {n}", { n: i + 1 }))}${logn ? ", " + esc(R.t("løgnen")) : sant ? ", " + esc(R.t("sant")) : ""}${mitt ? ", " + esc(R.t("ditt valg")) : ""}: </span>${esc(tekst)}</p>
          ${logn ? `<span class="stempel lh-stempel" aria-hidden="true">${esc(R.t("Løgn!"))}</span>` : ""}${sant ? `<span class="lh-sant" aria-hidden="true">${esc(R.t("Sant"))}</span>` : ""}${mitt ? `<span class="lh-mitt" aria-hidden="true">${esc(R.t("Ditt valg"))}</span>` : ""}
        </li>`;
      })
      .join("")}</ol>`;
  }

  // "Si det høyt": three big numbers; after the reveal the lie gets the stamp.
  function tallHtml(sp) {
    return `<div class="lh-tall-rad avslort">${[0, 1, 2]
      .map((i) => {
        const logn = i === sp.logn;
        return `<div class="lh-tall${logn ? " logn" : " sant"}"><span class="lh-siffer" aria-hidden="true">${i + 1}</span>${
          logn ? `<span class="stempel lh-stempel">${esc(R.t("Løgn!"))}</span>` : `<span class="lh-sant">${esc(R.t("Sant"))}</span>`
        }<span class="vh">${esc(R.t("Nummer {n}", { n: i + 1 }))}: ${logn ? esc(R.t("løgnen")) : esc(R.t("sant"))}</span></div>`;
      })
      .join("")}</div>`;
  }

  // A player with a nose that grows with how many they fooled (andel 0–1).
  function neseHtml(i, andel, storrelse) {
    const lengde = andel > 0 ? 0.3 + andel * 0.7 : 0;
    return `<span class="lh-nesefjes ${storrelse || "gigant"}" style="--lengde: ${lengde.toFixed(2)}">${R.avatar(i, storrelse || "gigant")}${
      lengde ? `<span class="lh-nese" aria-hidden="true">${lengde >= 0.75 ? '<span class="lh-blad"></span>' : ""}</span>` : ""
    }</span>`;
  }

  // ---------- Who was fooled? ----------
  // Three ways to enter the same thing: tap those who guessed right, tap those who were fooled
  // (the switch, remembered in the settings), or — «Stor gjeng» — just count the fooled.
  // sp.riktige always holds the listeners who guessed right.

  const erOmvendt = (S) => !!S.oppsett.lurte && !S.spill.stor && lyttere(S.spill).length >= MANGE;
  const tomtValg = (S) => (erOmvendt(S) ? lyttere(S.spill) : []);
  const antallLurt = (sp) => (sp.stor ? sp.lurtAntall : lyttere(sp).length - sp.riktige.length);

  function ferdigTekst(S) {
    const sp = S.spill;
    const alle = lyttere(sp).length;
    if (sp.stor || erOmvendt(S)) {
      const n = antallLurt(sp);
      return !n ? R.t("Ferdig – ingen ble lurt") : n === alle ? R.t("Ferdig – alle ble lurt") : R.t("Ferdig – {n} ble lurt", { n });
    }
    const n = sp.riktige.length;
    return !n ? R.t("Ferdig – ingen hadde rett") : n === alle ? R.t("Ferdig – alle hadde rett") : R.t("Ferdig – {n} hadde rett", { n });
  }

  const hurtigHtml = (alle, ingen) => `<div class="brikker lh-hurtig" role="group" aria-label="${esc(R.t("Hurtigvalg"))}">
      <button class="brikke" data-h="hurtig" data-v="alle" aria-pressed="${alle}">${esc(R.t("Alle"))}</button>
      <button class="brikke" data-h="hurtig" data-v="ingen" aria-pressed="${ingen}">${esc(R.t("Ingen"))}</button>
    </div>`;

  function hvemHtml(S) {
    const sp = S.spill;
    const alle = lyttere(sp);
    if (sp.stor) {
      const n = sp.lurtAntall;
      return `
        <h1 id="skjerm-tittel">${esc(R.t("Hvor mange ble lurt?"))}</h1>
        <p class="hjelp">${esc(R.t("Alle som pekte på feil nummer, rekker opp hånda. Tell hendene."))}</p>
        ${hurtigHtml(n === alle.length, n === 0)}
        ${R.ui.teller("lurt-antall", n, 0, alle.length, { enhet: R.t("av {n}", { n: alle.length }), minus: R.t("Færre ble lurt"), pluss: R.t("Flere ble lurt") })}`;
    }
    const omvendt = erOmvendt(S);
    const mange = alle.length >= MANGE;
    const trykket = alle.filter((i) => sp.riktige.includes(i) !== omvendt);
    // The switch sits under a short list of names and over a long one: in view either way.
    const bryter = mange ? R.ui.bryter("lurte", omvendt, R.t("Trykk heller på dem som ble lurt")) : "";
    const langListe = alle.length > 8;
    return `
      <h1 id="skjerm-tittel">${esc(omvendt ? R.t("Hvem ble lurt?") : R.t("Hvem pekte på nr. {n}?", { n: sp.logn + 1 }))}</h1>
      <p class="hjelp">${esc(omvendt ? R.t("Trykk på alle som pekte på feil nummer.") : R.t("Trykk på alle som gjettet riktig."))}</p>
      ${langListe ? bryter : ""}
      ${mange ? hurtigHtml(trykket.length === alle.length, !trykket.length) : ""}
      ${R.ui.velgere("riktig", alle, trykket)}
      ${langListe ? "" : bryter}`;
  }

  // Redraw only the question under the reveal (a full redraw would stamp «LØGN!» again on every
  // tap), keep the focus on the control that was tapped, and save.
  function tegnHvem(S, el) {
    const boks = R.$("#lh-hvem");
    if (!boks) return R.vis();
    boks.innerHTML = hvemHtml(S);
    const knapp = R.$("#lh-ferdig-tur");
    if (knapp) knapp.textContent = ferdigTekst(S);
    if (el && el.dataset && el.dataset.h) {
      const igjen = boks.querySelector(`[data-h="${CSS.escape(el.dataset.h)}"]${el.dataset.v != null ? `[data-v="${CSS.escape(el.dataset.v)}"]` : ""}`);
      if (igjen && !igjen.disabled) igjen.focus({ preventScroll: true });
    }
    R.lagre();
  }

  // ---------- «Kåringen» ----------

  function topp(liste, minst) {
    const verdier = liste.filter((v) => v != null);
    if (!verdier.length) return null;
    const mal = minst ? Math.min(...verdier) : Math.max(...verdier);
    if (!minst && mal <= 0) return null;
    const hvem = [];
    liste.forEach((v, i) => {
      if (v === mal) hvem.push(i);
    });
    return { verdi: mal, hvem };
  }

  function prisHtml(ikon, overskrift, vinner, tekst, farge, merke) {
    return `<li class="lh-pris" style="--vf: ${farge}">
      <span class="lh-pris-ikon" aria-hidden="true">${ikon}</span>
      <span class="lh-pris-tekst"><span class="etikett">${esc(overskrift)}</span><b>${esc(vinner)}</b><span>${esc(tekst)}</span></span>
      ${merke ? `<span class="lh-rekord">${esc(merke)}</span>` : ""}
    </li>`;
  }

  // The game is over (played to the end or ended early): from now on it is not «in progress».
  // Runs once per game, before «Kåringen» is shown the first time: statistics, the evening's
  // scoreboard and the record (the most people one player has fooled in one game on this phone).
  function fullfor(S) {
    const sp = S.spill;
    if (!sp || sp.feiret) return;
    sp.ferdig = true;
    sp.feiret = true;
    const turer = sum(sp.fortalt);
    R.statistikk("ferdig", { runder: Math.floor(turer / sp.antall), turer, avbrutt: turer < totalt(sp), modus: sp.modus, spillere: sp.antall, stor: !!sp.stor });
    feire = true;
    if (!turer) return;
    R.kveld.registrer(rader(sp));
    const best = Math.max(...sp.lurt);
    sp.gmlRekord = S.rekord;
    sp.rekord = S.rekord > 0 && best > S.rekord; // the very first game sets the record quietly
    if (best > S.rekord) S.rekord = best;
  }

  // One or two short lines: the winner and the awards. First names only — never a claim.
  function delTekst(sp) {
    const navn = (hvem) => (hvem.length > 3 ? R.t("{navn} og {n} til", { navn: hvem.slice(0, 2).map((i) => R.navn(i)).join(", "), n: hvem.length - 2 }) : navneliste(hvem));
    const vinner = topp(sp.poeng);
    const mester = topp(sp.lurt);
    const detektiv = sp.stor ? null : topp(sp.treff);
    const linjer = [`${R.t("Løgnhalsen")} 🤥 ${vinner ? R.t("{navn} vant med {poeng}.", { navn: navn(vinner.hvem), poeng: R.flertall(vinner.verdi, "poeng", "poeng") }) : R.t("Ingen ble lurt i dag.")}`];
    const priser = [];
    if (mester) priser.push(R.t("Mesterløgner: {navn} – lurte {n}", { navn: navn(mester.hvem), n: mester.verdi }));
    if (detektiv) priser.push(R.t("Løgndetektor: {navn} – avslørte {n}", { navn: navn(detektiv.hvem), n: detektiv.verdi }));
    if (priser.length) linjer.push(priser.join(" · "));
    return linjer.join("\n");
  }

  // ---------- A challenge in a link ----------
  // …/lognhalsen/#u=<base64url>. Bytes: the version, four check bytes, then the body XOR-ed with
  // a stream seeded by the check — so neither the claims nor the lie's place can be read in the
  // address. Body: the lie's place (0–2), then name, claim 1, claim 2 and claim 3 as UTF-8 with a
  // line feed between them. The claims are shuffled when the link is made.
  // FROZEN: links that are already sent must keep working. Never change these helpers or the
  // layout of version 1 — add a version instead.

  const U_VER = 1;
  const U_MAKS = 1900; // characters after «u=» (the kit hands vedHash at most 2 000)
  const U_BYTES = 320; // UTF-8 bytes per claim when a link is made (100 emoji would be 400)
  const U_TEKST = R.t("To sannheter og en løgn om meg 🤥 Finner du løgnen?");

  function uSjekk(bytes) {
    let h = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i++) {
      h ^= bytes[i];
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0x4c48; // "LH": a check from another game's link never fits
    h = Math.imul(h, 0x01000193);
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h >>> 0;
  }
  function uMaske(bytes, fro) {
    let a = fro >>> 0;
    const ut = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      ut[i] = bytes[i] ^ (((t ^ (t >>> 14)) >>> 0) & 255);
    }
    return ut;
  }
  function tilB64(bytes) {
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function fraB64(tekst) {
    try {
      const bin = atob(tekst.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((tekst.length + 3) % 4));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    } catch (e) {
      return null;
    }
  }
  const utf8 = (tekst) => new TextEncoder().encode(tekst);

  // Text that somebody typed — here or in a link from anywhere — before it is packed or shown:
  // no control or invisible formatting characters (line breaks, direction overrides, zero-width
  // and tag characters, private use, blank fillers), no towers of combining marks, single spaces,
  // at most `maks` characters. The joiner inside an emoji (U+200D, as in «woman astronaut») is
  // kept where the browser can tell. The result is still only text: every screen writes it with
  // esc(), never as a link.
  // (None of these characters is written in this file. They are made from their numbers, so an
  // editor can neither hide nor drop them.)
  const LIM = String.fromCodePoint(0x200d); // the zero-width joiner
  const MERKE = String.fromCodePoint(0xe000); // private use: free as a marker once those are removed
  const ALLE_LIM = new RegExp(LIM, "g");
  const ALLE_MERKER = new RegExp(MERKE, "g");
  let USYNLIG;
  let TARN = null;
  let EMOJI_LIM = null;
  let IKKE_NAVN;
  try {
    USYNLIG = new RegExp("(?!\\u200D)[\\p{Cc}\\p{Cf}\\p{Co}\\p{Cs}\\p{Zl}\\p{Zp}\\u115F\\u1160\\u2800\\u3164\\uFFA0\\uFFFC\\uFE00-\\uFE0E\\u{E0100}-\\u{E01EF}]", "gu");
    TARN = new RegExp("(\\p{M}{3})\\p{M}+", "gu");
    EMOJI_LIM = new RegExp("(\\p{Extended_Pictographic}[\\uFE0F\\u{1F3FB}-\\u{1F3FF}]?)\\u200D(?=\\p{Extended_Pictographic})", "gu");
    // A first name: letters, marks, emoji, space, hyphen and apostrophe — no dots, slashes or digits.
    IKKE_NAVN = new RegExp("[^\\p{L}\\p{M}\\p{Extended_Pictographic}\\u200D\\uFE0F\\u{1F3FB}-\\u{1F3FF} '\\u2019-]", "gu");
  } catch (e) {
    // A browser without Unicode properties in regular expressions: the ranges that matter.
    // (The joiner is dealt with in rens(); without EMOJI_LIM every one of them is removed.)
    USYNLIG = new RegExp("[\\u0000-\\u001f\\u007f-\\u009f\\u00ad\\u061c\\u115f\\u1160\\u180e\\u200b\\u200c\\u200e\\u200f\\u2028-\\u202e\\u2060-\\u206f\\u2800\\u3164\\ue000-\\uf8ff\\ufe00-\\ufe0e\\ufeff\\uffa0\\ufff0-\\ufffc]", "g");
    IKKE_NAVN = new RegExp("[\\u0021-\\u0026\\u0028-\\u002c\\u002e-\\u0040\\u005b-\\u0060\\u007b-\\u00bf\\u2000-\\u2018\\u201a-\\u2bff]", "g");
  }
  function rens(tekst, maks) {
    let t = String(tekst == null ? "" : tekst);
    try {
      t = t.normalize("NFC");
    } catch (e) {
      /* keep it as it is */
    }
    t = t.replace(/\s+/g, " ").replace(USYNLIG, "");
    // What is left of the joiner: keep it inside an emoji, drop it everywhere else.
    if (EMOJI_LIM) t = t.replace(EMOJI_LIM, "$1" + MERKE);
    t = t.replace(ALLE_LIM, "").replace(ALLE_MERKER, LIM);
    if (TARN) t = t.replace(TARN, "$1");
    return R.kutt(t.replace(/ {2,}/g, " ").trim(), maks).trim();
  }
  const rensNavn = (tekst) => R.kutt(rens(tekst, 40).replace(IKKE_NAVN, "").replace(/ {2,}/g, " ").trim(), MAKS_NAVN).trim();
  // Whole characters only, until the text fits in `maks` UTF-8 bytes.
  function kuttBytes(tekst, maks) {
    let t = tekst;
    for (let n = Array.from(t).length; n > 0 && utf8(t).length > maks; n--) t = R.kutt(t, n - 1).trim();
    return t;
  }

  // { navn, kort: [three claims in the order they are shown], logn: 0–2 } → "u=…"
  function lagUtfordring(u) {
    const tekst = utf8([u.navn, ...u.kort].join("\n"));
    const kropp = new Uint8Array(tekst.length + 1);
    kropp[0] = u.logn;
    kropp.set(tekst, 1);
    const medVersjon = new Uint8Array(kropp.length + 1);
    medVersjon[0] = U_VER;
    medVersjon.set(kropp, 1);
    const sjekk = uSjekk(medVersjon);
    const ut = new Uint8Array(kropp.length + 5);
    ut[0] = U_VER;
    ut[1] = sjekk >>> 24;
    ut[2] = (sjekk >>> 16) & 255;
    ut[3] = (sjekk >>> 8) & 255;
    ut[4] = sjekk & 255;
    ut.set(uMaske(kropp, sjekk), 5);
    return "u=" + tilB64(ut);
  }

  // "u=…" → { v (the link's own text), navn, kort, logn }, or null for anything that is not a
  // whole, valid link. Punctuation that a chat app glued to the end is ignored.
  function lesUtfordring(fragment) {
    const m = /^u=([A-Za-z0-9_-]{16,})[\s.,;:!?)\]}>»"']*$/.exec(String(fragment == null ? "" : fragment));
    if (!m || m[1].length > U_MAKS) return null;
    const bytes = fraB64(m[1]);
    if (!bytes || bytes.length < 12 || bytes[0] !== U_VER || tilB64(bytes) !== m[1]) return null;
    const sjekk = ((bytes[1] << 24) | (bytes[2] << 16) | (bytes[3] << 8) | bytes[4]) >>> 0;
    const kropp = uMaske(bytes.subarray(5), sjekk);
    const medVersjon = new Uint8Array(kropp.length + 1);
    medVersjon[0] = U_VER;
    medVersjon.set(kropp, 1);
    if (uSjekk(medVersjon) !== sjekk || kropp[0] > 2) return null;
    let tekst;
    try {
      tekst = new TextDecoder("utf-8", { fatal: true }).decode(kropp.subarray(1));
    } catch (e) {
      return null;
    }
    const deler = tekst.split("\n");
    if (deler.length !== 4) return null;
    const kort = deler.slice(1).map((t) => rens(t, MAKS));
    if (kort.some((t) => !t)) return null;
    return { v: "u=" + m[1], navn: rensNavn(deler[0]), kort, logn: kropp[0] };
  }

  const lenkeTil = (v) => location.origin + location.pathname + "#" + v;
  const delUtfordring = (S) => R.del(R.t("Løgnhalsen"), U_TEKST, lenkeTil(S.utf.lenke));
  // The three claims of the draft as they will be sent, or a message about what is missing.
  function utkastKlart(S) {
    const kort = S.utf.utkast.t.map((t) => kuttBytes(rens(t, MAKS), U_BYTES));
    if (kort.some((t) => !t)) return { feil: R.t("Skriv alle tre påstandene først") };
    if (new Set(kort.map((t) => R.normaliser(t) || t)).size < 3) return { feil: R.t("To av påstandene er like") };
    return { kort };
  }

  // Enter in a claim field moves on to the next field (the last one closes the keyboard).
  document.addEventListener("keydown", (e) => {
    const el = e.target;
    if (e.key !== "Enter" || e.shiftKey || !el || !el.matches || !el.matches(".lh-felt textarea, .lh-felt input")) return;
    e.preventDefault();
    const felter = R.$$(".lh-felt textarea, .lh-felt input");
    const neste = felter[felter.indexOf(el) + 1];
    if (neste) neste.focus();
    else el.blur();
  });

  // ---------- The game ----------

  R.start({
    id: "lognhalsen",
    versjon: 1,
    liggende: true, // landscape phones: the kit may move every dock to the side column, also those with the game's own buttons in them
    pagar,

    tilstand: () => ({
      antall: standardAntall(),
      oppsett: { modus: "hoyt", runder: 2, runderValgt: false, stor: false, lurte: false, temaer: standardTemaer() },
      jul: 0, // the year of the «Jul» season that has switched the pack on (see julRegel)
      rekord: 0, // the most people one player has fooled in one game on this phone
      // Challenges live apart from the party game: opening or making one never touches S.spill.
      utf: { utkast: { t: ["", "", ""], navn: "" }, lenke: "", mottatt: null },
      spill: null,
    }),

    lastet(S) {
      const o = (S.oppsett = Object.assign({ modus: "hoyt", runder: 2, stor: false, lurte: false, temaer: standardTemaer() }, erObjekt(S.oppsett) ? S.oppsett : {}));
      if (!["hoyt", "skriv"].includes(o.modus)) o.modus = "hoyt";
      o.runder = R.klamp(Math.round(Number(o.runder)) || 2, 1, 5);
      // Saved before the rounds followed the group size: 2 was the default, anything else was chosen.
      if (typeof o.runderValgt !== "boolean") o.runderValgt = o.runder !== 2;
      o.stor = o.stor === true;
      o.lurte = o.lurte === true;
      o.temaer = Array.from(new Set((Array.isArray(o.temaer) ? o.temaer : []).filter((id) => tema(id))));
      if (!o.temaer.length) o.temaer = standardTemaer();
      S.jul = heltall(S.jul, 1, 9999) ? S.jul : 0;
      julRegel(S);
      S.antall = R.klamp(Math.round(Number(S.antall)) || standardAntall(), 3, 20);
      S.rekord = heltall(S.rekord, 1, 999) ? S.rekord : 0;

      // Challenges: the draft is plain text; a link (made or received) is kept as the link's own
      // text and read through lesUtfordring every time, so there is one place that validates it.
      const u = erObjekt(S.utf) ? S.utf : {};
      const utkast = erObjekt(u.utkast) ? u.utkast : {};
      const tekster = Array.isArray(utkast.t) ? utkast.t : [];
      S.utf = {
        utkast: { t: [0, 1, 2].map((i) => R.kutt(typeof tekster[i] === "string" ? tekster[i] : "", MAKS)), navn: R.kutt(typeof utkast.navn === "string" ? utkast.navn : "", MAKS_NAVN) },
        lenke: typeof u.lenke === "string" && lesUtfordring(u.lenke) ? u.lenke : "",
        mottatt: erObjekt(u.mottatt) && typeof u.mottatt.v === "string" && lesUtfordring(u.mottatt.v) ? { v: u.mottatt.v, valgt: heltall(u.mottatt.valgt, 0, 2) ? u.mottatt.valgt : null } : null,
      };

      const sp = S.spill;
      if (sp) {
        const lister = erObjekt(sp) && ["poeng", "lurt", "treff", "fortalt"].every((n) => Array.isArray(sp[n]) && sp[n].length === sp.antall && sp[n].every((v) => heltall(v, 0, 9999)));
        const ok =
          lister && heltall(sp.antall, 3, 20) && ["hoyt", "skriv"].includes(sp.modus) && heltall(sp.runder, 1, 5) && heltall(sp.k, 0, sp.runder * sp.antall - 1) &&
          heltall(sp.start, 0, sp.antall - 1) && !!ALLE[sp.tema] && Array.isArray(sp.temaer) && typeof sp.fase === "string" && !!SKJERM_FOR[sp.fase];
        if (!ok) S.spill = null;
        else {
          sp.temaer = sp.temaer.filter((id) => tema(id));
          if (!sp.temaer.length) sp.temaer = standardTemaer();
          sp.ferdig = sp.ferdig === true;
          sp.feiret = sp.feiret === true;
          sp.stor = sp.stor === true && sp.antall >= STOR_FRA;
          if (!Number.isInteger(sp.tipsFro)) sp.tipsFro = 1;
          const alle = lyttere(sp);
          sp.riktige = Array.from(new Set(Array.isArray(sp.riktige) ? sp.riktige : [])).filter((i) => alle.includes(i));
          sp.lurtAntall = heltall(sp.lurtAntall, 0, alle.length) ? sp.lurtAntall : 0;
          const harLogn = heltall(sp.logn, 0, 2);
          const harKort = harLogn && Array.isArray(sp.kort) && sp.kort.length === 3 && sp.kort.every((t) => typeof t === "string" && !!t);
          if (harKort) sp.kort = sp.kort.map((t) => R.kutt(t, MAKS));
          else sp.kort = null;
          // A phase that does not belong to the mode starts the turn again.
          if (sp.modus === "hoyt" && ["gi", "skriv", "pek", "klar"].includes(sp.fase)) sp.fase = "tema";
          if (sp.modus === "skriv" && ["tema", "velg"].includes(sp.fase)) sp.fase = "gi";
          // A typed round without its cards (or the private typing screen) goes back to the hand-over.
          if (sp.modus === "skriv" && ["pek", "klar", "hvem"].includes(sp.fase) && !harKort) sp.fase = "gi";
          if (sp.modus === "hoyt" && sp.fase === "hvem" && !harLogn) sp.fase = "velg";
          const r = sp.siste;
          const sisteOk = erObjekt(r) && heltall(r.teller, 0, sp.antall - 1) && heltall(r.av, 1, sp.antall - 1) && heltall(r.lurt, 0, r.av) && Array.isArray(r.riktige) && r.riktige.every((i) => heltall(i, 0, sp.antall - 1));
          if (!sisteOk) sp.siste = null;
          // The story line needs a true claim: its number, and in "Skriv inn" the cards too.
          else if (!(heltall(r.sann, 0, 2) && harLogn && r.sann !== sp.logn && (sp.modus === "hoyt" || harKort))) r.sann = null;
          if (sp.fase === "resultat" && !sp.siste) sp.fase = sp.modus === "skriv" ? "gi" : "tema";
          sp.utkast = [0, 1, 2].map((i) => R.kutt(Array.isArray(sp.utkast) && typeof sp.utkast[i] === "string" ? sp.utkast[i] : "", MAKS));
          sp.rekord = sp.rekord === true;
          sp.gmlRekord = heltall(sp.gmlRekord, 0, 999) ? sp.gmlRekord : 0;
        }
      }
      // Keep the saved screen in step with the turn (the private typing screen itself is sent
      // back to the hand-over by its gjenoppta: "gi").
      if (["tur", "gi", "skriv", "pek", "avslor", "resultat"].includes(S.skjerm)) S.skjerm = pagar(S) ? SKJERM_FOR[S.spill.fase] || "hjem" : "hjem";
      if (S.skjerm === "slutt" && !S.spill) S.skjerm = "hjem";
      // Saved on «Kåringen» before a game was marked as finished there: it is finished.
      if (S.skjerm === "slutt" && S.spill && !S.spill.ferdig) S.spill.ferdig = S.spill.feiret = true;
      if (S.skjerm === "sendt" && !S.utf.lenke) S.skjerm = "hjem";
      if (S.skjerm === "svar" && !S.utf.mottatt) S.skjerm = "hjem";
    },

    regler: {
      intro: R.t("Fortell tre ting om deg selv. To er sanne, én er løgn. Klarer de andre å avsløre deg?"),
      steg: [
        [R.t("Få et tema"), R.t("Den som forteller, får et tema – for eksempel «Et sted du har sovet». Tenk ut to sanne ting og en løgn.")],
        [R.t("Si det – eller skriv det"), R.t("Si påstandene høyt som nummer 1, 2 og 3. Eller skriv dem i hemmelighet, så blander appen dem.")],
        [R.t("3 · 2 · 1 – pek!"), R.t("Alle viser 1, 2 eller 3 fingrer samtidig. Riktig svar gir 1 poeng. Fortelleren får 1 poeng for hver som ble lurt.")],
      ],
      tips: [
        R.t("Den beste løgnen er nesten sann. Den beste sannheten høres helt sprø ut."),
        R.t("Etter hver tur ber appen om historien bak en av de sanne påstandene – det er ofte det morsomste."),
        R.t("Liker du ikke temaet? Trykk «Nytt tema»."),
        R.t("Er dere mange? Fra ni spillere kan dere velge «Stor gjeng» og bare telle hvor mange som ble lurt."),
        R.t("Vil du lure noen som ikke er her? Trykk «Lag en utfordring» og send lenken."),
        R.t("Du trenger ikke fortelle noe du ikke vil. Hold det hyggelig."),
      ],
    },

    // A challenge link: …/lognhalsen/#u=… (anything else after # is not ours and is left alone).
    vedHash(S, hash) {
      const ra = (location.hash || "").slice(1);
      if (!/^u=/.test(hash) && !/^u(=|%3d)/i.test(ra)) return null;
      const u = lesUtfordring(hash);
      if (!u) {
        ugyldigLenke = true;
        return "hjem";
      }
      // The same link again shows the answer that was given; a new one replaces the old.
      if (!S.utf.mottatt || S.utf.mottatt.v !== u.v) {
        S.utf.mottatt = { v: u.v, valgt: null };
        R.statistikk("utfordring", { steg: "apnet" });
      }
      return "svar";
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis: (S) =>
          R.ui.spillhjem({
            slagordHtml: `${esc(R.t("Si tre ting om deg selv."))}<br>${esc(R.t("To er sanne."))} <em>${esc(R.t("Én er løgn."))}</em>`,
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: pagar(S) ? R.t("Fortsett · runde {n} av {av}", { n: rundeNr(S.spill), av: S.spill.runder }) : "",
              ekstraHtml: R.ui.knapp2(R.t("Lag en utfordring"), "utfordre") + R.ui.lenke(R.t("Slik spiller du"), "regler"),
            }),
            merker: [...(S.rekord ? [[R.t("REKORD"), R.t("lurte {n}", { n: S.rekord })]] : []), ["3–20", R.t("spillere")], [String(ALLE.length), R.t("kort")], ["0", R.t("reklame")]],
          }),
        inn() {
          if (!ugyldigLenke) return;
          ugyldigLenke = false;
          R.toast(R.t("Lenken er ikke gyldig"));
        },
      },

      oppsett: {
        tittel: R.t("Nytt spill"),
        tilbake: "hjem",
        vis(S) {
          const runder = runderFor(S);
          const turer = runder * S.antall;
          return `
          <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
          <section class="seksjon">
            <h2>${esc(R.t("Hvordan forteller dere?"))}</h2>
            ${R.ui.fliser(
              "modus",
              [
                { v: "hoyt", tittel: R.t("Si det høyt"), tekst: R.t("Raskest. Fortelleren sier påstandene høyt."), ikon: "🗣️" },
                { v: "skriv", tittel: R.t("Skriv inn"), tekst: R.t("I hemmelighet. Appen blander dem."), ikon: "✍️" },
              ],
              S.oppsett.modus,
            )}
          </section>
          ${R.ui.spillere({ min: 3, max: 20 })}
          ${S.antall >= STOR_FRA ? R.ui.bryter("stor", S.oppsett.stor, R.t("Stor gjeng"), R.t("Tell bare hvor mange som ble lurt – ingen navn å trykke på. Da er det bare fortelleren som får poeng.")) : ""}
          <section class="seksjon">
            <div class="seksjon-hode"><h2>${esc(R.t("Runder"))}</h2><span class="tall" id="lh-lengde">${R.flertall(turer, "tur", "turer")} · ${tidTekst(turer)}</span></div>
            ${R.ui.teller("runder", runder, 1, 5, { enhet: R.t("runde|runder", { n: runder }), minus: R.t("Færre runder"), pluss: R.t("Flere runder") })}
            <p class="hjelp">${esc(R.t("Alle forteller én gang per runde."))}</p>
          </section>
          <section class="seksjon">
            <div class="seksjon-hode"><h2>${esc(R.t("Temaer"))}</h2><span class="tall">${esc(R.t("{n} av {av}", { n: S.oppsett.temaer.length, av: TEMAER.length }))}</span></div>
            <button class="knapp-2 lh-temaknapp" data-h="vis-temaer"><span class="lh-temaknapp-tekst">${esc(temaSammendrag(S))}</span><span class="lh-endre">${esc(R.t("Endre"))}</span></button>
          </section>
          ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start"))}`;
        },
      },

      // "Si det høyt": the teller sees the theme, thinks, says the three claims out loud.
      tur: {
        tittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const t = tellerAv(sp);
          return `
            ${fremdrift(sp)}
            <div class="lh-teller">${R.avatar(t, "stor")}<div><p class="etikett">${esc(R.t("Nå forteller"))}</p><h1 id="skjerm-tittel">${esc(R.navn(t))}</h1></div></div>
            ${temaKort(sp)}
            ${R.ui.lenkerad(R.ui.lenke(`🎲 ${R.t("Nytt tema")}`, "nytt-tema"), R.ui.lenke(R.t("Avslutt"), "avslutt"))}
            <div class="lh-oppskrift" aria-hidden="true"><span>1</span><span>2</span><span>3</span></div>
            ${R.ui.dokk(
              `<p class="hjelp">${esc(R.t("Tenk ut to sanne ting og en løgn. Si dem høyt som nummer 1, 2 og 3."))}</p>`,
              R.ui.knapp(R.t("3 · 2 · 1 – Pek på løgnen!"), "pek", { variant: "stor", id: "lh-pek" }),
            )}`;
        },
        inn(S) {
          S.spill.skjerm = "tur";
        },
        ut() {
          tipsFra = 0;
        },
      },

      // "Skriv inn": hand the phone to the teller.
      gi: {
        tittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const t = tellerAv(sp);
          const html = `${fremdrift(sp)}${R.ui.giTil({ i: t, h: "jeg-er", tekst: R.t("Gi mobilen til"), knapp: R.t("Jeg er {navn}", { navn: R.navn(t) }), advarsel: R.t("De andre ser bort mens du skriver") })}`;
          // «Avslutt» under the kit's own button: the dock is the last thing in the kit's markup.
          const slutt = html.lastIndexOf("</div>");
          return html.slice(0, slutt) + R.ui.lenkerad(R.ui.lenke(R.t("Avslutt"), "avslutt")) + html.slice(slutt);
        },
        inn(S) {
          S.spill.skjerm = "gi";
        },
      },

      skriv: {
        tittel: R.t("Hemmelig"),
        gjenoppta: "gi",
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const k = ALLE[sp.tema];
          const felt = (i, merke, klasse) => `
            <label class="lh-felt ${klasse}" for="lh-felt-${i}">
              <span class="lh-merke">${merke}</span>
              <textarea id="lh-felt-${i}" data-felt="utkast" data-i="${i}" rows="2" maxlength="${MAKS}" placeholder="${esc(k.start)}" autocomplete="off" autocapitalize="sentences" enterkeyhint="${i < 2 ? "next" : "done"}">${esc(sp.utkast[i])}</textarea>
            </label>`;
          return `
            <div class="lh-skriv-topp">
              <p class="etikett">🤫 ${esc(R.t("Bare {navn} ser dette", { navn: R.navn(tellerAv(sp)) }))}</p>
              <h1 id="skjerm-tittel">${esc(R.t("To sannheter og en løgn"))}</h1>
            </div>
            ${temaBoks(sp)}
            <div class="lh-felter">
              ${felt(0, `✅ ${esc(R.t("Sant"))}`, "sant")}
              ${felt(1, `✅ ${esc(R.t("Også sant"))}`, "sant")}
              ${felt(2, `🤥 ${esc(R.t("Løgnen"))}`, "logn")}
            </div>
            <p class="hjelp">${esc(R.t("Appen blander rekkefølgen, så ingen ser hvilken som er løgnen."))}</p>
            ${R.ui.dokk(R.ui.knapp(R.t("Ferdig – bland og vis"), "ferdig-skrevet", { id: "lh-ferdig", av: sp.utkast.some((t) => !String(t || "").trim()) }))}`;
        },
        inn(S) {
          S.spill.skjerm = "skriv";
        },
        ut() {
          tipsFra = 0;
        },
      },

      // "Skriv inn": the shuffled claims, for everyone.
      pek: {
        tittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const t = tellerAv(sp);
          return `
            <div class="lh-teller liten">${R.avatar(t, "mid")}<div><p class="etikett">${esc(R.t("{navn} forteller", { navn: R.navn(t) }))}</p><p class="lh-tema-linje">${esc(ALLE[sp.tema].tekst)}</p></div></div>
            <h1 id="skjerm-tittel">${esc(R.t("Hvilken er løgnen?"))}</h1>
            ${pastanderHtml(sp, false)}
            ${R.ui.dokk(
              `<p class="hjelp">${esc(R.t("Les dem høyt. Så teller dere ned, og alle viser 1, 2 eller 3 fingrer."))}</p>`,
              R.ui.knapp(R.t("3 · 2 · 1 – Pek på løgnen!"), "pek", { variant: "stor", id: "lh-pek" }),
            )}`;
        },
        inn(S) {
          S.spill.skjerm = "pek";
        },
      },

      avslor: {
        tittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const t = tellerAv(sp);
          if (sp.fase === "velg") {
            return `
              <div class="lh-teller">${R.avatar(t, "stor")}<div><p class="etikett">${esc(R.navn(t))}</p><h1 id="skjerm-tittel">${esc(R.t("Hvilken var løgnen?"))}</h1></div></div>
              <p class="lh-fingre"><span aria-hidden="true">✋</span> ${esc(R.t("Alle andre: hold fingrene oppe!"))}</p>
              <div class="lh-figur">${R.figur()}</div>
              ${R.ui.dokk(
                `<p class="hjelp">${esc(R.t("{navn} trykker på nummeret til løgnen", { navn: R.navn(t) }))}</p>`,
                `<div class="lh-tall-rad">${[0, 1, 2]
                  .map((i) => `<button class="lh-tall" data-h="velg-logn" data-v="${i}" aria-label="${esc(R.t("Løgnen var nummer {n}", { n: i + 1 }))}"><span class="lh-siffer">${i + 1}</span></button>`)
                  .join("")}</div>`,
              )}`;
          }
          if (sp.fase === "klar") {
            return `
              <div class="lh-teller liten">${R.avatar(t, "mid")}<div><p class="etikett">${esc(R.t("{navn} forteller", { navn: R.navn(t) }))}</p><p class="lh-tema-linje">${esc(ALLE[sp.tema].tekst)}</p></div></div>
              <h1 id="skjerm-tittel">${esc(R.t("Fingrene opp!"))}</h1>
              ${pastanderHtml(sp, false)}
              ${R.ui.dokk(R.ui.knapp(R.t("Vis løgnen!"), "vis-logn", { variant: "stor" }))}`;
          }
          return `
            ${sp.modus === "skriv" ? pastanderHtml(sp, true) : tallHtml(sp)}
            <section class="seksjon lh-hvem" id="lh-hvem">${hvemHtml(S)}</section>
            ${R.ui.dokk(
              R.ui.knapp(ferdigTekst(S), "ferdig", { id: "lh-ferdig-tur" }),
              sp.modus === "hoyt" ? R.ui.lenkerad(R.ui.lenke(R.t("Feil nummer? Velg på nytt"), "angre-logn")) : "",
            )}`;
        },
        inn(S) {
          S.spill.skjerm = "avslor";
        },
      },

      resultat: {
        tittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.siste;
          const t = r.teller;
          const overskrift = r.lurt === 0 ? R.t("Avslørt!") : r.lurt === r.av ? R.t("Lurte alle sammen!") : R.t("Lurte {n} av {av}!", { n: r.lurt, av: r.av });
          const deler = [];
          if (r.lurt) deler.push(R.t("{navn} får {n} poeng", { navn: R.navn(t), n: r.lurt }));
          if (r.riktige.length > 3) deler.push(R.t("De {n} som gjettet riktig, får 1 poeng hver", { n: r.riktige.length }));
          else if (r.riktige.length) deler.push(r.riktige.length > 1 ? R.t("{navn} får 1 poeng hver", { navn: navneliste(r.riktige) }) : R.t("{navn} får 1 poeng", { navn: navneliste(r.riktige) }));
          const poengliste = rader(sp).map((rad) => ({ i: rad.i, poeng: rad.poeng, pluss: rad.i === t ? r.lurt : r.riktige.includes(rad.i) ? 1 : 0 }));
          const sist = sp.k + 1 >= totalt(sp);
          const neste = (sp.start + sp.k + 1) % sp.antall;
          // The story behind one of the two true claims: the laugh gets its minute.
          const bak = r.sann == null ? "" : sp.modus === "skriv" ? `<em>${esc(R.t("«{tekst}»", { tekst: sp.kort[r.sann] }))}</em>` : esc(R.t("nr. {n}", { n: r.sann + 1 }));
          return `
            <div class="lh-resultat${r.lurt === 0 ? " avslort" : ""}">
              ${neseHtml(t, r.av ? r.lurt / r.av : 0)}
              <p class="etikett">${esc(R.navn(t))}</p>
              <h1 id="skjerm-tittel">${esc(overskrift)}</h1>
              <p class="ingress">${esc(deler.length ? deler.join(". ") + "." : R.t("Ingen poeng denne gangen."))}</p>
            </div>
            ${bak ? `<p class="lh-historie"><span class="lh-historie-ikon" aria-hidden="true">🎤</span><span><b>${esc(R.navn(t))}:</b> ${esc(R.t("fortell historien bak {bak}!")).replace("{bak}", () => bak)}</span></p>` : ""}
            ${R.ui.poengliste(poengliste)}
            ${R.ui.dokk(
              sist ? R.ui.knapp(R.t("Til kåringen"), "slutt") : R.ui.knapp(R.t("Neste: {navn}", { navn: R.navn(neste) }), "neste"),
              R.ui.lenkerad(R.ui.lenke(R.t("Angre"), "angre"), sist ? "" : R.ui.lenke(R.t("Avslutt"), "avslutt")),
            )}`;
        },
        inn(S) {
          const sp = S.spill;
          sp.skjerm = "resultat";
          const r = sp.siste;
          if (r.lurt === 0) R.lyd.latter();
          else if (r.lurt === r.av) {
            R.lyd.fanfare();
            R.konfetti(["--aksent", "--rosa", "--lampe"]);
          } else R.lyd.riktig();
          if (r.lurt) setTimeout(() => R.lyd.tone(260, 0, 0.55, "triangle", 0.12, 780), 300);
        },
      },

      slutt: {
        tittel: R.t("Kåringen"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const turer = sum(sp.fortalt);
          const vinner = topp(sp.poeng);
          const mester = topp(sp.lurt);
          const detektiv = topp(sp.treff);
          // The most honest face: fooled the fewest, and at most half of the listeners.
          const fortalte = sp.lurt.map((v, i) => (sp.fortalt[i] && v <= (sp.fortalt[i] * (sp.antall - 1)) / 2 ? v : null));
          const aerlig = topp(fortalte, true);
          const priser = [];
          if (turer) {
            priser.push(
              mester
                ? prisHtml(
                    "🤥",
                    R.t("Mesterløgner"),
                    navneliste(mester.hvem),
                    sp.rekord
                      ? R.t("Lurte {personer} til sammen. Den forrige rekorden var {rekord}.", { personer: R.flertall(mester.verdi, "person", "personer"), rekord: sp.gmlRekord })
                      : R.t("Lurte {personer} til sammen. Se på den nesen!", { personer: R.flertall(mester.verdi, "person", "personer") }),
                    "var(--aksent)",
                    sp.rekord ? R.t("Ny rekord!") : "",
                  )
                : prisHtml("🤥", R.t("Mesterløgner"), R.t("Ingen!"), R.t("Ingen klarte å lure noen. For en ærlig gjeng!"), "var(--aksent)"),
            );
            // «Stor gjeng» counts only the fooled, so nobody can be the best detector there.
            if (!sp.stor) {
              priser.push(
                detektiv
                  ? prisHtml("🔍", R.t("Løgndetektor"), navneliste(detektiv.hvem), R.t("Avslørte {logner}. Ingenting slipper unna!", { logner: R.flertall(detektiv.verdi, "løgn", "løgner") }), "var(--himmel)")
                  : prisHtml("🔍", R.t("Løgndetektor"), R.t("Ingen!"), R.t("Ingen gjettet riktig. Dere er altfor godtroende!"), "var(--himmel)"),
              );
            }
            if (aerlig && mester && !aerlig.hvem.some((i) => mester.hvem.includes(i))) {
              priser.push(
                prisHtml("😇", R.t("Ærligste fjes"), navneliste(aerlig.hvem), aerlig.verdi ? R.t("Lurte bare {n}. Et ærlig fjes er gull verdt.", { n: aerlig.verdi }) : R.t("Lurte ingen. Et ærlig fjes er gull verdt."), "var(--mynte)"),
              );
            }
          }
          const banner = vinner
            ? R.ui.banner({ tittel: R.t("{navn} vinner!|{navn} vinner!", { navn: navneliste(vinner.hvem), n: vinner.hvem.length }), tekst: R.t("{poeng} etter {turer}", { poeng: R.flertall(vinner.verdi, "poeng", "poeng"), turer: R.flertall(turer, "tur", "turer") }), klasse: "aksent" })
            : turer
              ? R.ui.banner({ tittel: R.t("Ingen ble lurt!"), tekst: R.t("Alle løgnene ble avslørt, så ingen fikk poeng."), klasse: "aksent", stemning: "" })
              : R.ui.banner({ tittel: R.t("Ingen poeng ennå"), tekst: R.t("Ingen rakk å fortelle noe. Spill en runde, så blir det kåring!"), klasse: "aksent", stemning: "" });
          return `
            ${banner}
            ${vinner ? R.ui.pall(rader(sp)) : ""}
            ${vinner ? R.ui.poengliste(rader(sp)) : ""}
            ${priser.length ? `<ul class="lh-priser">${priser.join("")}</ul>` : ""}
            ${turer ? R.ui.knapp2(R.t("Del resultatet"), "del") : ""}
            ${R.ui.flereSpill({ antall: sp.antall })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen"), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "endre"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
        },
        inn(S) {
          S.spill.skjerm = "slutt";
          if (!feire) return; // back on the screen, or after a reload: the party was held already
          feire = false;
          if (topp(S.spill.poeng)) {
            R.lyd.fanfare();
            R.konfetti();
          } else R.lyd.pling();
        },
      },

      // ---------- «Lag en utfordring» ----------

      // The maker's private form. Never resumed directly: it shows which claim is the lie.
      utfordre: {
        tittel: R.t("Utfordring"),
        gjenoppta: "hjem",
        tilbake: "hjem",
        vis(S) {
          const u = S.utf.utkast;
          const felt = (i, merke, klasse, eksempel) => `
            <label class="lh-felt ${klasse}" for="lh-u-${i}">
              <span class="lh-merke">${merke}</span>
              <textarea id="lh-u-${i}" data-felt="uutkast" data-i="${i}" rows="2" maxlength="${MAKS}" placeholder="${esc(eksempel)}" autocomplete="off" autocapitalize="sentences" enterkeyhint="next">${esc(u.t[i])}</textarea>
            </label>`;
          return `
            <div class="lh-skriv-topp">
              <p class="etikett">🤫 ${esc(R.t("Bare du ser dette"))}</p>
              <h1 id="skjerm-tittel">${esc(R.t("Lag en utfordring"))}</h1>
            </div>
            <p class="ingress">${esc(R.t("Skriv to sanne ting og en løgn om deg selv. Send lenken til en venn, som skal finne løgnen."))}</p>
            <div class="lh-felter">
              ${felt(0, `✅ ${esc(R.t("Sant"))}`, "sant", R.t("Jeg har …"))}
              ${felt(1, `✅ ${esc(R.t("Også sant"))}`, "sant", R.t("Jeg kan …"))}
              ${felt(2, `🤥 ${esc(R.t("Løgnen"))}`, "logn", R.t("Jeg har aldri …"))}
              <label class="lh-felt navn" for="lh-u-navn">
                <span class="lh-merke">${esc(R.t("Fornavnet ditt"))} <small>(${esc(R.t("valgfritt"))})</small></span>
                <input id="lh-u-navn" data-felt="unavn" value="${esc(u.navn)}" maxlength="${MAKS_NAVN}" placeholder="${esc(R.t("Fra en venn"))}" autocomplete="given-name" autocapitalize="words" enterkeyhint="done">
              </label>
            </div>
            <p class="hjelp">${esc(R.t("Påstandene blandes før de vises. Alt ligger i selve lenken – ingenting lagres hos rusj.no."))}</p>
            ${R.ui.dokk(R.ui.knapp(R.t("Del utfordringen"), "utf-del", { id: "lh-u-del", av: !!utkastKlart(S).feil }))}`;
        },
      },

      // The link is made: share it again, copy it, change the claims or start over.
      sendt: {
        tittel: R.t("Utfordring"),
        tilbake: "hjem",
        vis: (S) => `
          ${R.ui.banner({ tittel: R.t("Klar til å sendes!"), tekst: R.t("Send lenken til en venn – eller til hele gruppechatten."), klasse: "aksent", stemning: "" })}
          <div class="papirboks lh-melding">
            <p class="etikett">${esc(R.t("Meldingen"))}</p>
            <p class="lh-melding-tekst">${esc(U_TEKST)}</p>
            <p class="lh-lenke" id="lh-lenke">${esc(lenkeTil(S.utf.lenke))}</p>
          </div>
          <p class="hjelp">${esc(R.t("Den som åpner lenken, ser påstandene i tilfeldig rekkefølge og trykker på løgnen. Be om å få høre hvordan det gikk!"))}</p>
          ${R.ui.dokk(R.ui.knapp(R.t("Del utfordringen"), "utf-del-igjen"), R.ui.knapp2(R.t("Kopier lenken"), "utf-kopier"), R.ui.lenkerad(R.ui.lenke(R.t("Endre"), "utf-endre"), R.ui.lenke(R.t("Lag en ny"), "utf-ny")))}`,
      },

      // A challenge that came in a link. Everything in it was typed by somebody else: it is
      // shown as plain text between «Fra en venn» and «… skrev dette – ikke rusj.no».
      svar: {
        tittel: R.t("Utfordring"),
        tilbake: "hjem",
        vis(S) {
          const m = S.utf.mottatt;
          const u = m && lesUtfordring(m.v);
          if (!u) return `<h1 id="skjerm-tittel">${esc(R.t("Lenken er ikke gyldig"))}</h1>${R.ui.dokk(R.ui.knapp(R.t("Til Løgnhalsen"), "hjem"))}`;
          const svart = m.valgt != null;
          const riktig = svart && m.valgt === u.logn;
          const fjes = R.hash(u.navn || u.kort[0]) % 20;
          const hvem = u.navn ? `<b>${esc(u.navn)}</b>` : esc(R.t("En venn"));
          const skrevet = `<p class="hjelp lh-skrevet">${esc(R.t("{hvem} skrev dette – ikke rusj.no.")).replace("{hvem}", () => u.navn ? esc(R.t("«{tekst}»", { tekst: u.navn })) : esc(R.t("Avsenderen")))}</p>`;
          if (!svart) {
            return `
              <div class="lh-resultat lh-fra">
                ${neseHtml(fjes, 0)}
                <p class="etikett">${esc(R.t("Fra en venn"))}</p>
                <h1 id="skjerm-tittel">${esc(R.t("Hvilken er løgnen?"))}</h1>
                <p class="ingress">${esc(R.t("{hvem} har sendt deg to sannheter og en løgn. Trykk på den du tror er løgn.")).replace("{hvem}", () => hvem)}</p>
              </div>
              <ol class="lh-pastander lh-valg">${u.kort
                .map(
                  (tekst, i) =>
                    `<li><button class="lh-pastand" data-h="svar-velg" data-v="${i}"><span class="lh-nr" aria-hidden="true">${i + 1}</span><span class="lh-ptekst"><span class="vh">${esc(R.t("Nummer {n}", { n: i + 1 }))}: </span>${esc(tekst)}</span></button></li>`,
                )
                .join("")}</ol>
              ${skrevet}`;
          }
          return `
            <div class="lh-resultat lh-fra svart${riktig ? " avslort" : ""}">
              ${neseHtml(fjes, riktig ? 0 : 1)}
              <p class="etikett">${esc(R.t("Fra en venn"))}</p>
              <h1 id="skjerm-tittel">${esc(riktig ? R.t("Avslørt!") : R.t("Lurt!"))}</h1>
              <p class="ingress">${
                riktig
                  ? u.navn
                    ? esc(R.t("Du fant løgnen til {navn}.")).replace("{navn}", () => `<b>${esc(u.navn)}</b>`)
                    : esc(R.t("Du fant løgnen."))
                  : esc(R.t("{hvem} lurte deg. Løgnen var nr. {n}.", { n: u.logn + 1 })).replace("{hvem}", () => hvem)
              }</p>
            </div>
            ${pastanderHtml(u, true, m.valgt)}
            ${skrevet}
            ${R.ui.dokk(R.ui.knapp(R.t("Send en tilbake"), "utfordre"), R.ui.knapp2(R.t("Spill med flere"), "hjem"), R.ui.lenkerad(R.ui.lenke(R.t("Del svaret"), "svar-del")))}`;
        },
        inn(S) {
          if (!nyssSvart) return;
          nyssSvart = false;
          const m = S.utf.mottatt;
          const u = m && lesUtfordring(m.v);
          if (!u) return;
          R.vibrer([80, 40, 140]);
          if (m.valgt === u.logn) R.lyd.riktig();
          else {
            R.lyd.latter();
            setTimeout(() => R.lyd.tone(260, 0, 0.55, "triangle", 0.12, 780), 300);
          }
        },
      },
    },

    felt: {
      utkast(S, el) {
        const sp = S.spill;
        if (!sp) return;
        sp.utkast[R.klamp(Number(el.dataset.i) || 0, 0, 2)] = R.kutt(el.value, MAKS);
        const knapp = R.$("#lh-ferdig");
        if (knapp) knapp.disabled = sp.utkast.some((t) => !String(t || "").trim());
        R.lagre();
      },
      uutkast(S, el) {
        S.utf.utkast.t[R.klamp(Number(el.dataset.i) || 0, 0, 2)] = R.kutt(el.value, MAKS);
        const knapp = R.$("#lh-u-del");
        if (knapp) knapp.disabled = !!utkastKlart(S).feil;
        R.lagre();
      },
      unavn(S, el) {
        S.utf.utkast.navn = R.kutt(el.value, MAKS_NAVN);
        R.lagre();
      },
    },

    handlinger: (H = {
      // A running game is never thrown away without asking.
      async nytt(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(pagar(S))) || !fortsatt()) return;
        S.spill = null;
        R.gaTil("oppsett");
      },
      endre: () => R.gaTil("oppsett"),
      hjem: () => R.gaTil("hjem"),
      fortsett(el, e, S) {
        R.gaTil(pagar(S) ? SKJERM_FOR[S.spill.fase] || "hjem" : "hjem");
      },
      modus(el, e, S) {
        S.oppsett.modus = el.dataset.v === "skriv" ? "skriv" : "hoyt";
        R.vis();
      },
      runder(el, e, S) {
        S.oppsett.runder = R.klamp(runderFor(S) + (Number(el.dataset.v) || 0), 1, 5);
        S.oppsett.runderValgt = true;
        R.vis();
      },
      stor(el, e, S) {
        S.oppsett.stor = !S.oppsett.stor;
        R.vis();
      },
      "vis-temaer": (el, e, S) => R.ark(temaArk(S)),
      temavalg(el, e, S) {
        const v = el.dataset.v;
        if (v === "*") S.oppsett.temaer = TEMAER.map((t) => t.id);
        else if (S.oppsett.temaer.includes(v)) {
          if (S.oppsett.temaer.length === 1) return R.toast(R.t("Velg minst ett tema"));
          S.oppsett.temaer = S.oppsett.temaer.filter((x) => x !== v);
        } else if (tema(v)) S.oppsett.temaer = [...S.oppsett.temaer, v];
        // Update the open sheet in place (keeping focus on the chip), then the screen behind it.
        const ark = R.$("#ark-innhold");
        if (ark && R.arkApent()) {
          ark.innerHTML = temaArk(S);
          const igjen = R.$(`#ark-innhold [data-h="temavalg"][data-v="${CSS.escape(v)}"]`);
          if (igjen) igjen.focus({ preventScroll: true });
        }
        R.vis();
      },
      start(el, e, S) {
        const n = R.klamp(S.antall, 3, 20);
        S.spill = {
          antall: n,
          modus: S.oppsett.modus,
          runder: runderFor(S),
          stor: S.oppsett.stor && n >= STOR_FRA,
          temaer: S.oppsett.temaer.slice(),
          start: R.heltall(0, n - 1),
          k: 0,
          fase: "tema",
          skjerm: null,
          tema: 0,
          tipsFro: R.nyttFro(),
          utkast: ["", "", ""],
          kort: null,
          logn: null,
          riktige: [],
          lurtAntall: 0,
          siste: null,
          poeng: Array(n).fill(0),
          lurt: Array(n).fill(0),
          treff: Array(n).fill(0),
          fortalt: Array(n).fill(0),
          ferdig: false,
          feiret: false,
          rekord: false,
          gmlRekord: 0,
        };
        R.statistikk("start", { modus: S.spill.modus, spillere: n, runder: S.spill.runder, stor: S.spill.stor });
        nyTur(S);
      },
      "nytt-tema"(el, e, S) {
        trekkTema(S.spill);
        R.lyd.snu();
        R.vis();
      },
      "jeg-er"(el, e, S) {
        S.spill.fase = "skriv";
        R.gaTil("skriv");
      },
      "ferdig-skrevet"(el, e, S) {
        const sp = S.spill;
        const tekster = sp.utkast.map((t) => String(t || "").trim().replace(/\s+/g, " "));
        if (tekster.some((t) => !t)) return R.toast(R.t("Skriv alle tre påstandene først"));
        if (new Set(tekster.map((t) => R.normaliser(t) || t)).size < 3) return R.toast(R.t("To av påstandene er like"));
        const rekkefolge = R.stokk([0, 1, 2], R.rng(R.nyttFro()));
        sp.kort = rekkefolge.map((i) => tekster[i]);
        sp.logn = rekkefolge.indexOf(2);
        sp.utkast = ["", "", ""];
        sp.fase = "pek";
        R.lyd.sveip();
        R.gaTil("pek");
      },
      async pek(el, e, S) {
        if (opptatt) return;
        opptatt = true;
        el.disabled = true;
        const ferdig = await R.nedtelling(["3", "2", "1", R.t("PEK!")], 750);
        opptatt = false;
        if (!ferdig || !S.spill) return;
        R.lyd.pek();
        R.vibrer([60, 40, 120]);
        S.spill.fase = S.spill.modus === "skriv" ? "klar" : "velg";
        R.gaTil("avslor");
      },
      "velg-logn"(el, e, S) {
        const sp = S.spill;
        if (sp.fase !== "velg") return;
        sp.logn = R.klamp(Number(el.dataset.v), 0, 2);
        sp.fase = "hvem";
        sp.riktige = tomtValg(S);
        sp.lurtAntall = 0;
        R.vis();
        R.lyd.bom();
        R.vibrer([80, 40, 140]);
        R.si(R.t("Løgnen var nummer {n}.", { n: sp.logn + 1 }));
        window.scrollTo(0, 0);
      },
      async "vis-logn"(el, e, S) {
        const sp = S.spill;
        if (sp.fase !== "klar" || opptatt) return;
        opptatt = true;
        el.disabled = true;
        R.lyd.trommevirvel(1.3);
        const fortsatt = R.vakt();
        await R.vent(R.rolig() ? 300 : 1300);
        opptatt = false;
        if (!fortsatt()) return;
        sp.fase = "hvem";
        sp.riktige = tomtValg(S);
        sp.lurtAntall = 0;
        R.vis();
        R.vibrer([80, 40, 140]);
        R.si(R.t("Løgnen var nummer {n}: {tekst}", { n: sp.logn + 1, tekst: sp.kort[sp.logn] }));
        window.scrollTo(0, 0);
      },
      "angre-logn"(el, e, S) {
        const sp = S.spill;
        sp.logn = null;
        sp.riktige = [];
        sp.lurtAntall = 0;
        sp.fase = "velg";
        R.vis();
      },
      // A name: tap again to take it back (it means «guessed right», or «was fooled» with the switch on).
      riktig(el, e, S) {
        const sp = S.spill;
        const i = Number(el.dataset.v);
        if (!sp || sp.fase !== "hvem" || sp.stor || !lyttere(sp).includes(i)) return;
        sp.riktige = sp.riktige.includes(i) ? sp.riktige.filter((x) => x !== i) : [...sp.riktige, i];
        tegnHvem(S, el);
      },
      // «Alle» / «Ingen»: every name (or the whole count) in one tap.
      hurtig(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.fase !== "hvem") return;
        const alle = el.dataset.v === "alle";
        if (sp.stor) sp.lurtAntall = alle ? lyttere(sp).length : 0;
        else sp.riktige = alle !== erOmvendt(S) ? lyttere(sp) : [];
        tegnHvem(S, el);
      },
      // «Trykk heller på dem som ble lurt». With nothing tapped yet the list starts empty the new
      // way; otherwise the answer stays the same and is shown the other way round.
      lurte(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.fase !== "hvem" || sp.stor) return;
        const forrige = erOmvendt(S);
        const trykket = lyttere(sp).filter((i) => sp.riktige.includes(i) !== forrige).length;
        S.oppsett.lurte = !S.oppsett.lurte;
        if (!trykket) sp.riktige = tomtValg(S);
        tegnHvem(S, el);
      },
      // «Stor gjeng»: how many were fooled.
      "lurt-antall"(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.fase !== "hvem" || !sp.stor) return;
        sp.lurtAntall = R.klamp(sp.lurtAntall + (Number(el.dataset.v) || 0), 0, lyttere(sp).length);
        tegnHvem(S, el);
      },
      ferdig(el, e, S) {
        const sp = S.spill;
        if (sp.fase !== "hvem") return;
        const t = tellerAv(sp);
        const kandidater = lyttere(sp);
        const riktige = sp.stor ? [] : sp.riktige.filter((i) => kandidater.includes(i)).sort((a, b) => a - b);
        riktige.forEach((i) => {
          sp.poeng[i] += 1;
          sp.treff[i] += 1;
        });
        const lurt = sp.stor ? R.klamp(sp.lurtAntall, 0, kandidater.length) : kandidater.length - riktige.length;
        sp.poeng[t] += lurt;
        sp.lurt[t] += lurt;
        sp.fortalt[t] += 1;
        // One of the two true claims, for «fortell historien bak …» (kept, so a reload shows the same).
        const sanne = [0, 1, 2].filter((i) => i !== sp.logn);
        sp.siste = { teller: t, lurt, riktige, av: kandidater.length, sann: sanne[R.heltall(0, sanne.length - 1)] };
        sp.fase = "resultat";
        R.gaTil("resultat");
      },
      // Take back the points of the last turn and go back to «who guessed right?».
      angre(el, e, S) {
        const sp = S.spill;
        const r = sp.siste;
        if (!r || sp.fase !== "resultat") return;
        r.riktige.forEach((i) => {
          sp.poeng[i] -= 1;
          sp.treff[i] -= 1;
        });
        sp.poeng[r.teller] -= r.lurt;
        sp.lurt[r.teller] -= r.lurt;
        sp.fortalt[r.teller] -= 1;
        sp.riktige = r.riktige.slice();
        sp.lurtAntall = r.lurt;
        sp.siste = null;
        sp.fase = "hvem";
        R.toast(R.t("Angret – poengene er tatt bort"));
        R.gaTil("avslor");
      },
      neste(el, e, S) {
        const sp = S.spill;
        if (sp.fase !== "resultat") return;
        if (sp.k + 1 >= totalt(sp)) return H.slutt(el, e, S);
        sp.k += 1;
        sp.siste = null;
        nyTur(S);
      },
      // The last turn is played: on to «Kåringen».
      slutt(el, e, S) {
        if (!S.spill) return;
        fullfor(S);
        R.gaTil("slutt");
      },
      // Ending early also ends in «Kåringen», with the score so far — and the game is finished.
      async avslutt(el, e, S) {
        const fortsatt = R.vakt();
        const ja = await R.bekreft(R.t("Avslutte spillet?"), R.t("Dere får se kåringen med stillingen så langt."), R.t("Avslutt"), R.t("Spill videre"));
        if (!ja || !fortsatt() || !S.spill) return;
        fullfor(S);
        R.gaTil("slutt");
      },
      igjen(el, e, S) {
        S.spill = null;
        H.start(el, e, S);
      },
      del(el, e, S) {
        if (S.spill) R.del(R.t("Løgnhalsen"), delTekst(S.spill), DEL_URL);
      },

      // ---------- «Lag en utfordring» ----------

      // From the home screen (and «Send en tilbake»). A draft that is not sent yet is kept; one
      // that was sent is not shown again — it says which claim is the lie.
      utfordre(el, e, S) {
        if (S.utf.lenke) {
          S.utf.utkast.t = ["", "", ""];
          S.utf.lenke = "";
        }
        R.gaTil("utfordre");
      },
      "utf-del"(el, e, S) {
        const klart = utkastKlart(S);
        if (klart.feil) return R.toast(klart.feil);
        const rekkefolge = R.stokk([0, 1, 2], R.rng(R.nyttFro()));
        const lenke = lagUtfordring({ navn: kuttBytes(rensNavn(S.utf.utkast.navn), 64), kort: rekkefolge.map((i) => klart.kort[i]), logn: rekkefolge.indexOf(2) });
        if (!lesUtfordring(lenke)) return R.toast(R.t("Det gikk ikke å lage lenken. Prøv med kortere tekst."));
        S.utf.lenke = lenke;
        R.statistikk("utfordring", { steg: "laget" });
        R.gaTil("sendt");
        delUtfordring(S); // in the same tap, or the phone will not open its share sheet
      },
      "utf-del-igjen": (el, e, S) => delUtfordring(S),
      "utf-kopier": (el, e, S) => R.kopier(lenkeTil(S.utf.lenke)),
      "utf-endre": () => R.gaTil("utfordre"),
      "utf-ny"(el, e, S) {
        S.utf.utkast.t = ["", "", ""];
        S.utf.lenke = "";
        R.gaTil("utfordre");
      },
      "svar-velg"(el, e, S) {
        const m = S.utf.mottatt;
        if (!m || m.valgt != null || !lesUtfordring(m.v)) return;
        m.valgt = R.klamp(Number(el.dataset.v) || 0, 0, 2);
        nyssSvart = true;
        R.statistikk("utfordring", { steg: "svart" });
        R.gaTil("svar");
      },
      // Only how it went — never anything from the challenge itself.
      "svar-del"(el, e, S) {
        const m = S.utf.mottatt;
        const u = m && lesUtfordring(m.v);
        if (!u || m.valgt == null) return;
        R.del(R.t("Løgnhalsen"), m.valgt === u.logn ? R.t("Jeg avslørte løgnen din! 🕵️") : R.t("Du lurte meg! 🤥"), DEL_URL);
      },
    }),
  });
})();
