/* Grådigper — «Ett kort til?», a push-your-luck card game for 2–8 players, on one phone in the
   middle of the table or with a phone each on the net.
   The cards are rusj's own: number cards 0–12 – as many of each as its number (one 1, two 2s …
   twelve 12s) and a single 0 – plus ten bonus cards: treats (+3, +5, +7), one «Dobbel» (×2) and
   three cheek pouches. A fresh, shuffled pack every round; everyone starts with one card.
   On your turn: «Ett til» (one more card) or «Stopp» (keep this round's points). A number you
   already have in front of you loses the round's points – unless a cheek pouch swallows it. Seven
   different numbers end the round at once with 15 extra points. First to the target (200) wins.
   Every card lies face up, so nothing is secret: the phone only keeps the table.
   The rules are pure functions at the top (window.RusjGradigper when loaded without the kit);
   test/gradigper.test.mjs checks them and plays whole games with a seeded pack. */
(function () {
  "use strict";

  // ---------- The rules (pure: no DOM, no kit) ----------

  const G = (() => {
    const MIN = 2;
    const MAKS = 8;
    const SJU = 7; // this many different numbers end the round …
    const SJU_BONUS = 15; // … and give this much extra
    const MAL = [100, 200];
    // Bonus cards (strings; number cards are numbers): treats add to the round, «x2» doubles the
    // number cards, «kp» (the cheek pouch) swallows one number you already have.
    const BONUSKORT = ["+3", "+3", "+3", "+5", "+5", "+7", "x2", "kp", "kp", "kp"];
    const klamp = (n, a, b) => Math.min(b, Math.max(a, n));
    const heltall = (x, standard) => (Number.isFinite(Number(x)) ? Math.round(Number(x)) : standard);
    const erTall = (k) => typeof k === "number";
    const erKort = (k) => (Number.isInteger(k) && k >= 0 && k <= 12) || BONUSKORT.includes(k);

    // The whole pack, in order: 0, 1, 2 2, 3 3 3 … twelve 12s, then the bonus cards (89 cards).
    function kortstokk() {
      const k = [0];
      for (let n = 1; n <= 12; n++) for (let i = 0; i < n; i++) k.push(n);
      return k.concat(BONUSKORT);
    }
    const tallene = (rad) => rad.filter(erTall);
    const ulike = (rad) => new Set(tallene(rad)).size;
    // What a row is worth: the numbers (doubled by «x2»), plus the treats, plus 15 for seven different.
    function poeng(rad) {
      let p = tallene(rad).reduce((a, b) => a + b, 0);
      if (rad.includes("x2")) p *= 2;
      for (const k of rad) if (typeof k === "string" && k[0] === "+") p += Number(k.slice(1));
      if (ulike(rad) >= SJU) p += SJU_BONUS;
      return p;
    }
    const seter = (sp) => Array.from({ length: sp.antall }, (_, i) => i);
    const inne = (sp) => seter(sp).filter((i) => !sp.ute.includes(i));

    // A new game, before the first deal. forste: who begins round 1 (on the net it moves one seat
    // per match).
    function nytt(o = {}) {
      const antall = klamp(heltall(o.antall, MIN), MIN, MAKS);
      return {
        antall,
        mal: MAL.includes(Number(o.mal)) ? Number(o.mal) : 200,
        forste: ((heltall(o.forste, 0) % antall) + antall) % antall,
        sum: Array(antall).fill(0),
        runde: 0,
        starter: 0,
        tur: 0,
        fase: "ferdig", // spill (cards are drawn) | ferdig (the round is counted)
        bunke: [],
        rader: Array.from({ length: antall }, () => []),
        like: Array(antall).fill(null), // the number that came twice (and lost the round)
        status: Array(antall).fill("med"), // med | stopp | ute (two alike) | borte (left, on the net)
        sju: -1, // who got seven different this round
        steg: 0, // counts every accepted action: a move on the net must name the step it was made at
        siste: null, // the last thing that happened: { i, kort, hva }
        logg: [], // per finished round: { pluss, status, sju }
        ute: [], // on the net: seats that left
        slutt: false, // somebody reached the target: no more rounds
        ferdig: false,
        vinnere: [],
        angre: null,
      };
    }
    // The first seat still in from seat s (s itself if it is in).
    function inneFra(sp, s) {
      for (let k = 0; k < sp.antall; k++) {
        const i = (s + k) % sp.antall;
        if (!sp.ute.includes(i)) return i;
      }
      return s;
    }
    // Who begins the next round: the first seat still in after the one who began this round (so the
    // seats still in take turns evenly, also after someone has left). Round 0: the first seat.
    const nesteStarter = (sp) => inneFra(sp, (sp.starter + 1) % sp.antall);
    // The pack is shuffled once, when the round begins (rnd decides the whole order), and every card
    // after that is the top one. On the net nothing that happens later in the round – a move, an
    // ignored move, a seat leaving – can change which card comes next.
    function stokk(rnd) {
      const k = kortstokk();
      for (let i = k.length - 1; i > 0; i--) {
        const j = Math.min(i, Math.floor(rnd() * (i + 1)));
        [k[i], k[j]] = [k[j], k[i]];
      }
      return k;
    }
    // The top card of the pack.
    function dra(sp) {
      if (!sp.bunke.length) sp.bunke = kortstokk(); // (never happens: a round cannot use 89 cards)
      return sp.bunke.shift();
    }
    // Round r begins: a freshly shuffled pack, one card each from the one who begins and round the table.
    function nyRunde(sp, r, rnd) {
      const starter = r === 0 ? inneFra(sp, sp.forste) : nesteStarter(sp);
      sp.runde = r;
      sp.bunke = stokk(rnd);
      sp.rader = seter(sp).map(() => []);
      sp.like = seter(sp).map(() => null);
      sp.status = seter(sp).map((i) => (sp.ute.includes(i) ? "borte" : "med"));
      sp.sju = -1;
      sp.siste = null;
      sp.angre = null;
      sp.fase = "spill";
      sp.starter = starter;
      for (let k = 0; k < sp.antall; k++) {
        const i = (sp.starter + k) % sp.antall;
        if (sp.status[i] === "med") sp.rader[i].push(dra(sp));
      }
      sp.tur = sp.starter;
      sp.steg++;
    }
    function start(o, rnd) {
      const sp = nytt(o);
      nyRunde(sp, 0, rnd);
      return sp;
    }

    // The round is counted: everyone who stopped – and everyone still in when somebody got seven
    // different – keeps their points. Reaching the target ends the game after this round.
    function avsluttRunde(sp) {
      sp.fase = "ferdig";
      const pluss = seter(sp).map((i) => (sp.status[i] === "med" || sp.status[i] === "stopp" ? poeng(sp.rader[i]) : 0));
      pluss.forEach((p, i) => (sp.sum[i] += p));
      sp.logg.push({ pluss, status: sp.status.slice(), sju: sp.sju });
      if (inne(sp).some((i) => sp.sum[i] >= sp.mal)) sp.slutt = true;
    }
    // The turn passes to the next seat still drawing (maybe the same one), or the round is over.
    function videre(sp, fra) {
      for (let k = 1; k <= sp.antall; k++) {
        const i = (fra + k) % sp.antall;
        if (sp.status[i] === "med") {
          sp.tur = i;
          return;
        }
      }
      avsluttRunde(sp);
    }
    const paTur = (sp) => !sp.ferdig && sp.fase === "spill" && sp.status[sp.tur] === "med";

    // «Ett til»: the seat on turn takes the top card. Returns { i, kort, hva } with hva "tall" (a new
    // number), "bonus", "like" (a number it had: the round is lost), "reddet" (… but a cheek pouch
    // swallowed it) or "sju" (the seventh different number: the round ends). Null when nobody may draw.
    function trekk(sp) {
      if (!paTur(sp)) return null;
      const i = sp.tur;
      const rad = sp.rader[i];
      const kort = dra(sp);
      let hva = "bonus";
      if (erTall(kort)) {
        if (rad.includes(kort)) {
          const pose = rad.indexOf("kp");
          if (pose >= 0) {
            rad.splice(pose, 1); // the pouch and the card it swallowed both leave the table
            hva = "reddet";
          } else {
            sp.like[i] = kort;
            sp.status[i] = "ute";
            hva = "like";
          }
        } else {
          rad.push(kort);
          hva = ulike(rad) >= SJU ? "sju" : "tall";
        }
      } else rad.push(kort);
      sp.steg++;
      sp.angre = null;
      sp.siste = { i, kort, hva };
      if (hva === "sju") {
        sp.sju = i;
        avsluttRunde(sp);
      } else videre(sp, i);
      return sp.siste;
    }
    // «Stopp»: the seat on turn keeps what lies in front of it and draws no more this round.
    function stopp(sp) {
      if (!paTur(sp)) return null;
      const i = sp.tur;
      sp.status[i] = "stopp";
      sp.steg++;
      sp.siste = { i, kort: null, hva: "stopp" };
      videre(sp, i);
      return sp.siste;
    }
    // The next round (the game goes on until somebody has reached the target).
    function nesteRunde(sp, rnd) {
      if (sp.ferdig || sp.slutt || sp.fase !== "ferdig") return false;
      nyRunde(sp, sp.runde + 1, rnd);
      return true;
    }
    // «Kåringen»: the most points among those still in (nobody, if nobody has any).
    function kaar(sp) {
      sp.ferdig = true;
      sp.angre = null;
      const med = inne(sp);
      const topp = Math.max(0, ...med.map((i) => sp.sum[i]));
      sp.vinnere = topp > 0 ? med.filter((i) => sp.sum[i] === topp) : [];
    }
    // On the net: a seat left. Its cards of this round are gone, it is never waited for and is not
    // ranked; with fewer than two left the match is over. Once somebody has reached the target the
    // match is decided and a seat leaving changes nothing: a phone that replays the match is at
    // «Kåringen» at once, while a phone that played it live gets there with «Se kåringen» – both
    // must rank the same seats.
    function forlat(sp, sete) {
      if (sp.ferdig || sp.slutt || !Number.isInteger(sete) || sete < 0 || sete >= sp.antall || sp.ute.includes(sete)) return false;
      sp.ute.push(sete);
      // (The line under the heading told what this seat just did, with the cards that are now gone.)
      if (sp.siste && sp.siste.i === sete) sp.siste = { i: sete, kort: null, hva: "borte" };
      if (sp.fase === "spill") {
        const hadde = sp.status[sete];
        sp.status[sete] = "borte";
        sp.rader[sete] = [];
        sp.like[sete] = null;
        if (sp.tur === sete && hadde === "med") videre(sp, sete);
        else if (!sp.status.includes("med")) avsluttRunde(sp);
      }
      if (sp.antall - sp.ute.length < MIN) {
        if (sp.fase === "spill") avsluttRunde(sp);
        sp.slutt = true;
        sp.forFa = true; // ended because too few are left, not because someone reached the goal
        kaar(sp);
      } else if (sp.fase === "ferdig" && !sp.slutt && inne(sp).some((i) => sp.sum[i] >= sp.mal)) sp.slutt = true;
      return true;
    }
    // The chance that the next card is a number this seat already has (what a careful player weighs).
    function risiko(sp, i) {
      const har = new Set(tallene(sp.rader[i]));
      return sp.bunke.length ? sp.bunke.filter((k) => har.has(k)).length / sp.bunke.length : 0;
    }

    // Is this a game the screens can draw? (A saved game from the phone's storage.)
    function gyldig(sp) {
      const tall = (x, a, b) => Number.isInteger(x) && x >= a && x <= b;
      if (!sp || typeof sp !== "object" || !tall(sp.antall, MIN, MAKS) || !MAL.includes(sp.mal)) return false;
      const n = sp.antall;
      if (![sp.sum, sp.rader, sp.status, sp.like].every((l) => Array.isArray(l) && l.length === n)) return false;
      if (!sp.sum.every((p) => tall(p, 0, 1e6)) || !sp.rader.every((r) => Array.isArray(r) && r.length <= 40 && r.every(erKort))) return false;
      if (!sp.status.every((s) => ["med", "stopp", "ute", "borte"].includes(s)) || !sp.like.every((k) => k === null || tall(k, 0, 12))) return false;
      if (!Array.isArray(sp.bunke) || sp.bunke.length > 89 || !sp.bunke.every(erKort) || !Array.isArray(sp.ute) || !Array.isArray(sp.logg) || !Array.isArray(sp.vinnere)) return false;
      if (!tall(sp.runde, 0, 9999) || !tall(sp.tur, 0, n - 1) || !tall(sp.starter, 0, n - 1) || !tall(sp.forste, 0, n - 1) || !tall(sp.steg, 0, 1e7) || !tall(sp.sju, -1, n - 1)) return false;
      if (!["spill", "ferdig"].includes(sp.fase) || (sp.fase === "spill" && sp.status[sp.tur] !== "med" && !sp.ferdig)) return false;
      if (!sp.logg.every((l) => l && Array.isArray(l.pluss) && l.pluss.length === n && l.pluss.every((p) => tall(p, 0, 1e5)) && Array.isArray(l.status) && l.status.length === n)) return false;
      if (sp.siste != null && !(typeof sp.siste === "object" && tall(sp.siste.i, 0, n - 1) && typeof sp.siste.hva === "string" && (sp.siste.kort === null || erKort(sp.siste.kort)))) return false;
      return true;
    }

    return { MIN, MAKS, SJU, SJU_BONUS, MAL, BONUSKORT, erTall, erKort, kortstokk, stokk, tallene, ulike, poeng, inne, nytt, nesteStarter, nyRunde, start, trekk, stopp, nesteRunde, kaar, forlat, paTur, risiko, gyldig };
  })();

  const R = window.Rusj;
  if (!R || typeof R.start !== "function") {
    window.RusjGradigper = G;
    return;
  }

  // ---------- The game on the page ----------

  const esc = R.esc;
  // This edition's address (rusj.no/gradigper/, rusj.no/en/…)
  const DEL_URL = (document.querySelector('link[rel="canonical"]') || { href: "https://rusj.no/gradigper/" }).href;
  let H;

  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const tilfeldig = () => R.nyttFro() / 4294967296;
  const poengTekst = (n) => R.flertall(n, "poeng", "poeng");
  // On the net (R.nett, rusj/kit/nett.js): seat i is player i on its own phone. Every card lies face
  // up on every phone, so there is nothing to hide; «Ett til», «Stopp» and «Neste runde» are moves,
  // played when the room sends them back. Each round's pack is shuffled from the room's seed and the
  // round's number (rundeRng below), so every phone turns the same cards in the same order.
  // (Friends level: a changed client could work out the order from the seed, but never choose it.)
  const paNett = (sp) => !!sp && sp.modus === "nett" && !!R.nett;
  const erJeg = (sp, i) => paNett(sp) && R.nett.erMeg(i);
  const kanSpille = (sp, i) => !paNett(sp) || (R.nett.erMeg(i) && !R.nett.venter());
  const rangert = (sp) => G.inne(sp).map((i) => ({ i, poeng: sp.sum[i] }));

  let laast = false; // a short beat after every card: a double tap must not draw for the next player
  let laasId = null;
  let blink = null; // the card just drawn, shown big once: { i, kort, hva }

  // ---------- The cards ----------

  const kortNavn = (k) => (G.erTall(k) ? String(k) : k === "x2" ? R.t("dobbel") : k === "kp" ? R.t("kinnpose") : R.t("pluss {n}", { n: k.slice(1) }));
  // The cheek pouch card: Grådigper's own face with the cheeks full.
  const POSE = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="6.5" cy="6" r="3.2" fill="#f08a4b" stroke="#170e2b" stroke-width="1.6"/><circle cx="17.5" cy="6" r="3.2" fill="#f08a4b" stroke="#170e2b" stroke-width="1.6"/><ellipse cx="12" cy="13.5" rx="10" ry="8.5" fill="#ffa94d" stroke="#170e2b" stroke-width="1.8"/><ellipse cx="5.6" cy="16" rx="4.2" ry="3.6" fill="#fff1dd"/><ellipse cx="18.4" cy="16" rx="4.2" ry="3.6" fill="#fff1dd"/><circle cx="8.6" cy="11" r="1.5" fill="#170e2b"/><circle cx="15.4" cy="11" r="1.5" fill="#170e2b"/><path d="M10.6 14.2h2.8l-1.4 1.6Z" fill="#170e2b"/></svg>`;
  function kortHtml(k, klasse) {
    const kl = klasse ? " " + klasse : "";
    if (G.erTall(k)) return `<span class="gp-kort t${k}${kl}">${k}</span>`;
    if (k === "x2") return `<span class="gp-kort bonus dobbel${kl}">×2</span>`;
    if (k === "kp") return `<span class="gp-kort bonus pose${kl}">${POSE}</span>`;
    return `<span class="gp-kort bonus godbit${kl}">${esc(k)}</span>`;
  }
  const bakside = (klasse) => `<span class="gp-kort gp-bak ${klasse || ""}"><i></i></span>`;
  // A row read out: «3, 7, 12, pluss 5 og kinnpose».
  const radTekst = (rad) => (rad.length ? R.ramsOpp(rad.map(kortNavn)) : R.t("ingen kort"));

  // ---------- Pieces of the screen ----------

  // What just happened, in words (the line under the heading; read out by screen readers).
  function hendelseTekst(sp) {
    const s = sp.siste;
    if (!s) return sp.runde === 0 ? R.t("Alle har fått ett kort. Ett til – eller stopp?") : R.t("Nye kort til alle. Ett til – eller stopp?");
    const navn = R.navn(s.i);
    if (s.hva === "borte") return R.t("{navn} forlot kampen.", { navn });
    if (s.hva === "stopp") return R.t("{navn} stopper og beholder {poeng}.", { navn, poeng: poengTekst(G.poeng(sp.rader[s.i])) });
    if (s.hva === "like") return R.t("{navn} fikk {kort} en gang til og mister rundens poeng.", { navn, kort: kortNavn(s.kort) });
    if (s.hva === "reddet") return R.t("{navn} fikk {kort} en gang til – men kinnposen tok den!", { navn, kort: kortNavn(s.kort) });
    if (s.hva === "sju") return R.t("{navn} har sju ulike tall! Runden er over, og det gir {n} poeng ekstra.", { navn, n: G.SJU_BONUS });
    if (s.kort === "kp") return R.t("{navn} fikk en kinnpose – den redder ett tall som kommer igjen.", { navn });
    if (s.kort === "x2") return R.t("{navn} fikk «Dobbel»: tallkortene teller dobbelt.", { navn });
    if (s.hva === "bonus") return R.t("{navn} fikk en godbit: {kort}.", { navn, kort: s.kort });
    return R.t("{navn} trakk {kort}.", { navn, kort: kortNavn(s.kort) });
  }
  // One seat at the table: who, the cards, this round's points and the total.
  function plassHtml(sp, i) {
    const st = sp.status[i];
    const rad = sp.rader[i];
    const over = sp.fase === "ferdig";
    const paTur = !over && sp.tur === i;
    const p = st === "ute" || st === "borte" ? 0 : G.poeng(rad);
    const pluss = over && sp.logg.length ? sp.logg[sp.logg.length - 1].pluss[i] : null;
    const merke =
      st === "borte"
        ? `<span class="gp-merke borte"><span aria-hidden="true">👋</span> ${esc(R.t("forlot kampen"))}</span>`
        : st === "ute"
          ? `<span class="gp-merke ute"><span aria-hidden="true">💥</span> ${esc(R.t("to like"))}</span>`
          : sp.sju === i
            ? `<span class="gp-merke sju"><span aria-hidden="true">🌟</span> ${esc(R.t("sju ulike"))}</span>`
            : st === "stopp"
              ? `<span class="gp-merke stopp"><span aria-hidden="true">✋</span> ${esc(R.t("stoppet"))}</span>`
              : `<span class="gp-merke teller" aria-label="${esc(R.t("{n} av {sju} ulike tall", { n: G.ulike(rad), sju: G.SJU }))}">${G.ulike(rad)}/${G.SJU}</span>`;
    const kort = rad.map((k, n) => kortHtml(k, sp.siste && sp.siste.i === i && n === rad.length - 1 && sp.siste.kort === k && !over && blink ? "ny" : "")).join("") + (st === "ute" && sp.like[i] != null ? kortHtml(sp.like[i], "to") : "");
    const etikett =
      st === "borte"
        ? R.t("{navn} forlot kampen.", { navn: R.navn(i) })
        : R.t("{navn}: {kort}. {runde} i runden, {sum} i alt.", { navn: R.navn(i), kort: radTekst(rad), runde: st === "ute" ? R.t("to like, 0 poeng") : poengTekst(p), sum: poengTekst(sp.sum[i]) });
    return `<li class="gp-plass ${st}${paTur ? " na" : ""}${erJeg(sp, i) ? " meg" : ""}${sp.sju === i ? " sju" : ""}" style="--pf: var(--p${(i % 20) + 1})">
      <span class="vh">${esc(etikett)}</span>
      <div class="gp-plass-hode" aria-hidden="true">
        ${R.avatar(i)}
        <span class="gp-navn">${esc(R.navn(i))}</span>
        <b class="gp-sum">${sp.sum[i]}</b>
      </div>
      <div class="gp-rad" aria-hidden="true">${kort || `<span class="gp-tom"></span>`}</div>
      <div class="gp-plass-fot" aria-hidden="true">
        ${merke}
        <b class="gp-rp${st === "ute" ? " tapt" : ""}">${pluss != null ? `+${pluss}` : st === "borte" ? "" : p}</b>
      </div>
    </li>`;
  }
  const bordKlasse = (sp) => (sp.antall <= 2 ? "n2" : sp.antall <= 4 ? "n4" : "n8");
  function toppHtml(sp) {
    const over = sp.fase === "ferdig";
    const sisteLogg = sp.logg[sp.logg.length - 1];
    let etikett;
    let tittel;
    if (over) {
      etikett = R.t("Runde {n} er ferdig", { n: sp.runde + 1 });
      const leder = G.inne(sp).filter((i) => sp.sum[i] === Math.max(...G.inne(sp).map((k) => sp.sum[k])));
      tittel = sp.slutt
        ? R.t("I mål: {navn}!", { navn: R.ramsOpp(G.inne(sp).filter((i) => sp.sum[i] >= sp.mal).map((i) => R.navn(i))) || R.ramsOpp(leder.map((i) => R.navn(i))) })
        : sisteLogg && sisteLogg.sju >= 0
          ? R.t("Sju ulike til {navn}!", { navn: R.navn(sisteLogg.sju) })
          : leder.length === 1 && sp.sum[leder[0]] > 0
            ? R.t("{navn} leder", { navn: R.navn(leder[0]) })
            : R.t("Runden er over");
    } else {
      etikett = R.t("Runde {n} · først til {mal}", { n: sp.runde + 1, mal: sp.mal });
      tittel = erJeg(sp, sp.tur) ? R.t("Din tur") : R.t("{navn} sin tur", { navn: R.navn(sp.tur) });
    }
    return `<div class="gp-topp">
      <div class="gp-hvem">
        <p class="etikett">${esc(etikett)}</p>
        <h1 id="skjerm-tittel">${esc(tittel)}</h1>
      </div>
      <span class="gp-bunke" aria-hidden="true">${bakside()}${bakside()}${bakside("overst")}</span>
    </div>
    <p class="gp-hendelse" id="gp-hendelse" aria-live="polite">${esc(over && !sp.siste ? "" : hendelseTekst(sp))}</p>`;
  }
  function dokkHtml(sp) {
    const lenker = [];
    if (sp.angre && !paNett(sp)) lenker.push(`<button class="lenke" data-h="angre">↶ ${esc(R.t("Angre"))}</button>`);
    if (sp.logg.length) lenker.push(R.ui.lenke(R.t("Poenglista"), "lapp"));
    lenker.push(R.ui.lenke(R.t("Kortene"), "kortene"), R.ui.lenke(R.t("Avslutt"), "avslutt"));
    if (sp.fase === "ferdig") {
      if (sp.slutt) return R.ui.dokk(R.ui.knapp(R.t("Se kåringen"), "kaaring", { variant: "stor", ikon: "🏆" }), R.ui.lenkerad(...lenker));
      const neste = G.nesteStarter(sp);
      if (paNett(sp) && !erJeg(sp, neste)) return R.ui.dokk(R.ui.knapp(R.t("{navn} deler ut …", { navn: R.navn(neste) }), "vent", { av: true }), R.ui.lenkerad(...lenker));
      return R.ui.dokk(R.ui.knapp(R.t("Neste runde"), "neste", { variant: "stor", id: "gp-neste" }), R.ui.lenkerad(...lenker));
    }
    const i = sp.tur;
    if (paNett(sp) && !erJeg(sp, i)) return R.ui.dokk(R.ui.knapp(R.t("{navn} velger …", { navn: R.navn(i) }), "vent", { av: true }), R.ui.lenkerad(...lenker));
    const p = G.poeng(sp.rader[i]);
    const av = laast || !kanSpille(sp, i);
    return R.ui.dokk(
      `<div class="knapprad gp-valg">
        <button class="knapp-2" data-h="stopp" id="gp-stopp" aria-label="${esc(R.t("Stopp og behold {poeng}", { poeng: poengTekst(p) }))}"${av ? " disabled" : ""}${laast ? " data-laast" : ""}><span class="ikon" aria-hidden="true">✋</span>${esc(R.t("Stopp"))} <b>${p}</b></button>
        <button class="knapp" data-h="til" id="gp-til"${av ? " disabled" : ""}${laast ? " data-laast" : ""}><span class="ikon gp-ikon" aria-hidden="true">${bakside()}</span>${esc(R.t("Ett til"))}</button>
      </div>`,
      R.ui.lenkerad(...lenker),
    );
  }
  // The card just drawn, big, in the middle of the table for a moment.
  function blinkHtml(sp, b) {
    const stempler = {
      like: [R.t("To like!"), "rod"],
      reddet: [R.t("Reddet!"), "mynte"],
      sju: [R.t("Sju ulike!"), "lampe"],
    };
    const st = stempler[b.hva] || (b.kort === "kp" ? [R.t("Kinnpose!"), "mynte"] : b.kort === "x2" ? [R.t("Dobbel!"), "lampe"] : b.hva === "bonus" ? [R.t("Godbit!"), "lampe"] : null);
    return `<div class="gp-blink ${esc(b.hva)}" aria-hidden="true">
      <span class="gp-blink-navn" style="--pf: var(--p${(b.i % 20) + 1})">${R.avatar(b.i)}${esc(R.navn(b.i))}</span>
      ${kortHtml(b.kort, "stor")}
      ${st ? `<span class="stempel ${st[1]}">${esc(st[0])}</span>` : ""}
    </div>`;
  }

  // The whole score sheet: one column per player, one row per round.
  function lappHtml(sp) {
    const celle = (l, i) => (l.status[i] === "borte" ? "" : l.status[i] === "ute" ? `<span class="gp-null">0</span>` : l.sju === i ? `<b>${l.pluss[i]}</b>` : String(l.pluss[i]));
    return `<div class="gp-lapp-ramme"><table class="gp-lapp">
      <thead><tr><th scope="col"><span class="vh">${esc(R.t("Runde"))}</span></th>${sp.sum.map((_, i) => `<th scope="col">${R.avatar(i)}<span class="gp-lapp-navn">${esc(R.navn(i))}</span></th>`).join("")}</tr></thead>
      <tbody>${sp.logg.map((l, r) => `<tr><th scope="row">${r + 1}</th>${sp.sum.map((_, i) => `<td>${celle(l, i)}</td>`).join("")}</tr>`).join("")}</tbody>
      <tfoot><tr><th scope="row">${esc(R.t("Sum"))}</th>${sp.sum.map((p) => `<td>${p}</td>`).join("")}</tr></tfoot>
    </table></div>`;
  }
  // The pack, explained with the cards themselves (the rules sheet and «Kortene»).
  const kortForklaring = () => `
    <h3>${esc(R.t("Kortene"))}</h3>
    <ul class="gp-forklaring">
      <li><span class="gp-vifte">${[3, 7, 12].map((k) => kortHtml(k)).join("")}</span><span><b>${esc(R.t("Tallkort 0–12"))}</b>${esc(R.t("Gir like mange poeng som tallet. Det finnes like mange av hvert tall som tallet selv – og én nuller."))}</span></li>
      <li><span class="gp-vifte">${["+3", "+5", "+7"].map((k) => kortHtml(k)).join("")}</span><span><b>${esc(R.t("Godbit"))}</b>${esc(R.t("Legges til poengene dine i runden. Seks i bunken."))}</span></li>
      <li><span class="gp-vifte">${kortHtml("x2")}</span><span><b>${esc(R.t("Dobbel"))}</b>${esc(R.t("Tallkortene dine teller dobbelt i denne runden. Bare én i bunken."))}</span></li>
      <li><span class="gp-vifte">${kortHtml("kp")}</span><span><b>${esc(R.t("Kinnpose"))}</b>${esc(R.t("Redder deg én gang: Får du et tall du har fra før, forsvinner det i posen. Tre i bunken."))}</span></li>
    </ul>`;
  const REGLER = {
    intro: R.t("Trekk ett kort til – eller stopp mens leken er god. Får du et tall du har fra før, ryker rundens poeng. Først til 200 vinner."),
    steg: [
      [R.t("Ett til eller stopp"), R.t("Alle starter runden med ett kort. Når det er din tur, velger du: «Ett til» for et nytt kort, eller «Stopp» for å beholde poengene dine i runden.")],
      [R.t("To like, og runden ryker"), R.t("Tallkortene gir like mange poeng som tallet. Men får du et tall du allerede har foran deg, mister du alt du har samlet i denne runden.")],
      [R.t("Sju ulike"), R.t("Sju ulike tall foran deg stopper runden med en gang og gir 15 poeng ekstra. Når noen har nådd målet etter en runde, vinner den med flest poeng.")],
    ],
    tips: [
      R.t("Høye kort gir mest – men det finnes tolv 12-ere og bare én ener, så de høye kommer oftest igjen."),
      R.t("Når noen får sju ulike, beholder alle som fortsatt er med, poengene sine."),
      R.t("Nullen gir ingen poeng, men teller som ett av de sju."),
      R.t("Har du en kinnpose, kan du våge ett kort til."),
      R.t("Trykket «Stopp» ved et uhell? «Angre» virker helt til neste spiller har valgt."),
      R.t("Legg mobilen midt på bordet så alle ser kortene – eller spill med hver sin mobil på nett."),
    ],
    ekstraHtml: kortForklaring(),
  };

  // ---------- Playing ----------

  function nyttSpill(S) {
    S.spill = G.start({ antall: S.antall, mal: S.oppsett.mal, forste: 0 }, tilfeldig);
    laast = false;
    blink = null;
    R.statistikk("start", { spillere: S.spill.antall, mal: S.spill.mal });
  }
  function las(ms) {
    laast = true;
    clearTimeout(laasId);
    const fortsatt = R.vakt();
    laasId = setTimeout(
      () => {
        laast = false;
        if (!fortsatt()) return;
        for (const k of R.$$("#skjerm .dokk [data-laast]")) {
          k.disabled = false;
          k.removeAttribute("data-laast");
        }
      },
      R.rolig() ? 250 : ms,
    );
  }
  // A card has been drawn (the state is already changed): show it, say it, sound it.
  function visTrekk(sp, h) {
    blink = h;
    las(700);
    R.vis();
    if (h.hva === "like") {
      R.lyd.feil();
      R.vibrer([30, 50, 30]);
    } else if (h.hva === "sju") {
      R.lyd.fanfare();
      R.vibrer([40, 60, 120]);
      R.konfetti();
    } else if (h.hva === "reddet") R.lyd.riktig();
    else if (h.hva === "bonus") R.lyd.pling();
    else R.lyd.snu();
    if (sp.fase === "ferdig" && h.hva !== "sju") setTimeout(() => R.lyd.pling(), 320);
  }
  function visStopp(sp) {
    R.lyd.takk();
    R.vibrer(15);
    R.vis();
    if (sp.fase === "ferdig") setTimeout(() => R.lyd.pling(), 200);
  }
  function visNyRunde() {
    blink = null;
    las(350);
    R.lyd.sveip();
    R.vis();
    window.scrollTo(0, 0);
  }
  function tilKaaring(S, komplett) {
    const sp = S.spill;
    G.kaar(sp);
    sp.komplett = !!komplett;
    if (!paNett(sp)) {
      // (On the net «Kveldens gjeng» on the phone is left alone.)
      R.kveld.registrer(rangert(sp));
      R.statistikk("ferdig", { spillere: sp.antall, mal: sp.mal, runder: sp.logg.length, komplett: !!komplett });
    }
    R.gaTil("slutt");
  }

  // ---------- On the net (R.nett, rusj/kit/nett.js) ----------
  // The pack of round r is shuffled from the room's seed and the round's number only – not from the
  // place a move gets in the list – so no move, ignored or not, can choose a card.
  // (Friends level: a changed phone could work the order out from the seed.)
  const rundeRng = (okt, r) => R.nett.tilfeldig(okt.fro, "runde" + r);
  // Moves from the seat on turn: { til: 1, r, n } takes the top card, { stopp: 1, r, n }
  // keeps the round's points. r is the round and n the step the phone saw when the button was
  // tapped: a tap that comes late or twice names an old step and is ignored, the same on every
  // phone. { runde: r } from the one who begins round r deals it. Anything else, or anything the
  // rules don't allow now, is ignored. A seat that leaves loses this round's cards, is skipped and
  // is not ranked. When somebody has reached the target the match is over (each phone goes to
  // «Kåringen» itself). No «Angre» on the net: the others have seen the «Stopp».
  const NETT = {
    min: G.MIN,
    maks: G.MAKS,
    oppsett: (S) => ({ mal: S.oppsett.mal }),
    oppsettTekst: (o) => R.t("Først til {n}", { n: G.MAL.includes(Number(o && o.mal)) ? Number(o.mal) : 200 }),
    start(S, okt) {
      const o = okt.oppsett || {};
      const antall = R.klamp(okt.antall || G.MIN, G.MIN, G.MAKS);
      const sp = G.nytt({ antall, mal: o.mal, forste: (okt.kamp - 1) % antall });
      sp.modus = "nett";
      G.nyRunde(sp, 0, rundeRng(okt, 0));
      S.spill = sp;
      laast = false;
      blink = null;
      clearTimeout(laasId);
    },
    trekk(S, t, sete, okt) {
      const sp = S.spill;
      if (!paNett(sp) || sp.ferdig || !t || typeof t !== "object") return;
      const live = !okt.gjenspill && S.skjerm === "spill";
      if (sp.fase === "spill" && sete === sp.tur && t.r === sp.runde && t.n === sp.steg) {
        if (t.til === 1) {
          const h = G.trekk(sp);
          if (!h) return;
          if (okt.gjenspill && sp.slutt) G.kaar(sp); // a finished match, replayed: the result
          if (live) visTrekk(sp, h);
          return;
        }
        if (t.stopp === 1) {
          if (!G.stopp(sp)) return;
          if (okt.gjenspill && sp.slutt) G.kaar(sp);
          if (live) visStopp(sp);
        }
        return;
      }
      if (sp.fase === "ferdig" && !sp.slutt && t.runde === sp.runde + 1 && sete === G.nesteStarter(sp)) {
        if (!G.nesteRunde(sp, rundeRng(okt, t.runde))) return;
        if (live) visNyRunde();
      }
    },
    borte(S, sete, okt) {
      const sp = S.spill;
      if (!paNett(sp) || !G.forlat(sp, sete)) return;
      if (okt.gjenspill) {
        if (sp.slutt && !sp.ferdig) G.kaar(sp);
        return;
      }
      if (sp.ferdig && S.skjerm === "spill") return R.gaTil("slutt");
      if (S.skjerm === "spill") R.vis();
    },
    skjerm: (S) => (S.spill && S.spill.ferdig ? "slutt" : "spill"),
    tur(S) {
      const sp = S.spill;
      if (!sp || sp.ferdig || sp.slutt) return null;
      return sp.fase === "ferdig" ? G.nesteStarter(sp) : sp.tur;
    },
    ferdig: (S) => !!S.spill && (S.spill.ferdig || S.spill.slutt),
  };

  R.start({
    id: "gradigper",
    versjon: 1,
    pagar,
    nett: NETT,

    tilstand: () => ({
      antall: R.klamp(R.felles.navn.filter((n) => String(n || "").trim()).length || 3, G.MIN, G.MAKS),
      oppsett: { mal: 200 },
      spill: null,
    }),

    lastet(S) {
      const o = (S.oppsett = Object.assign({ mal: 200 }, S.oppsett && typeof S.oppsett === "object" ? S.oppsett : {}));
      o.mal = G.MAL.includes(Number(o.mal)) ? Number(o.mal) : 200;
      S.antall = R.klamp(Number(S.antall) || G.MIN, G.MIN, G.MAKS);
      if (S.spill && (S.spill.modus === "nett" || !G.gyldig(S.spill))) S.spill = null;
      if (S.spill && typeof S.spill.angre !== "string") S.spill.angre = null;
      if (S.skjerm === "spill" && !S.spill) S.skjerm = "hjem";
      if (S.skjerm === "slutt" && !(S.spill && S.spill.ferdig)) S.skjerm = S.spill ? "spill" : "hjem";
      if (S.skjerm === "spill" && S.spill && S.spill.ferdig) S.skjerm = "slutt";
    },

    regler: REGLER,

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const sp = S.spill;
          return R.ui.spillhjem({
            slagordHtml: `${esc(R.t("Ett kort til – eller stopp?"))}<br><em>${esc(R.t("To like, og rundens poeng ryker!"))}</em>`,
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: pagar(S) ? R.t("Fortsett · runde {n}", { n: sp.runde + 1 }) : "",
              ekstraHtml: (R.nett ? R.nett.knapp() : "") + R.ui.lenke(R.t("Slik spiller du"), "regler"),
            }),
            merker: [
              ["2–8", R.t("spillere")],
              ["89", R.t("kort")],
              ["0", R.t("reklame")],
            ],
          });
        },
        inn: () => R.slippVaken(),
      },

      oppsett: {
        tittel: R.t("Nytt spill"),
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
            ${R.ui.spillere({ min: G.MIN, max: G.MAKS, tittel: R.t("Hvem spiller?"), hjelp: R.t("Legg mobilen midt på bordet, så alle ser kortene.") })}
            <section class="seksjon">
              <div class="seksjon-hode"><h2>${esc(R.t("Først til"))}</h2></div>
              ${R.ui.seg("mal", G.MAL.map((m) => [m, R.t("{n} poeng", { n: m })]), o.mal, { etikett: R.t("Hvor mange poeng dere spiller til") })}
              <p class="hjelp">${esc(o.mal === 200 ? R.t("Det vanlige målet. Tar gjerne et kvarter.") : R.t("Et kortere spill."))}</p>
            </section>
            ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start", { variant: "stor", ikon: "🐹" }))}`;
        },
      },

      spill: {
        tittel: (S) => (S.spill ? R.t("Først til {n}", { n: S.spill.mal }) : ""),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          return `${toppHtml(sp)}
            <ul class="gp-bord ${bordKlasse(sp)}${sp.fase === "ferdig" ? " over" : ""}">${sp.sum.map((_, i) => plassHtml(sp, i)).join("")}</ul>
            ${dokkHtml(sp)}`;
        },
        etter(S, rot) {
          // Many players on a short phone: the seat on turn is brought into view if it lies under the buttons.
          setTimeout(() => {
            const na = rot.querySelector(".gp-plass.na");
            if (na && R.S.skjerm === "spill" && na.scrollIntoView) na.scrollIntoView({ block: "nearest", behavior: R.rolig() ? "auto" : "smooth" });
          }, 0);
          if (!blink) return;
          const b = blink;
          blink = null;
          rot.insertAdjacentHTML("beforeend", blinkHtml(S.spill, b));
          const el = rot.lastElementChild;
          setTimeout(() => el.isConnected && el.remove(), R.rolig() ? 900 : 1300);
        },
        inn(S) {
          if (!S.spill) return R.gaTil("hjem");
          if (S.spill.ferdig) return R.gaTil("slutt");
          laast = false;
          blink = null;
          R.holdVaken();
          R.vedForlat(() => clearTimeout(laasId));
        },
        ut() {
          clearTimeout(laasId);
          laast = false;
          blink = null;
        },
      },

      slutt: {
        tittel: R.t("Kåringen"),
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const v = sp.vinnere || [];
          const rader = rangert(sp);
          const topp = Math.max(0, ...rader.map((r) => r.poeng));
          const jegVant = v.length === 1 && erJeg(sp, v[0]);
          const tittel = !v.length ? R.t("Ingen vinner denne gangen") : jegVant ? R.t("Du vinner!") : R.t("{navn} vinner!|{navn} vinner!", { navn: R.ramsOpp(v.map((i) => R.navn(i))), n: v.length });
          const tekst = !v.length ? "" : v.length > 1 ? R.t("Likt med {poeng} hver.", { poeng: poengTekst(topp) }) : sp.komplett === false ? R.t("{poeng} da spillet ble avsluttet.", { poeng: poengTekst(topp) }) : R.t("{poeng} – først til {mal}!", { poeng: poengTekst(topp), mal: sp.mal });
          const taper = paNett(sp) && v.length > 0 && !v.some((i) => erJeg(sp, i));
          return `
            ${R.ui.banner({ tittel, tekst, etikett: R.t("Kåringen"), klasse: "aksent", stemning: !v.length || taper ? "lei" : "jubel" })}
            ${R.ui.pall(rader)}
            ${R.ui.poengliste(rader)}
            ${sp.logg.length ? `<section class="seksjon"><h2>${esc(R.t("Poenglista"))}</h2>${lappHtml(sp)}</section>` : ""}
            ${
              paNett(sp)
                ? R.nett.sluttDokk()
                : `${R.ui.flereSpill({ antall: sp.antall })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen", { ikon: "🐹" }), R.ui.lenkerad(R.ui.lenke(R.t("Del resultatet"), "del"), R.ui.lenke(R.t("Endre oppsett"), "endre"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`
            }`;
        },
        inn(S) {
          const sp = S.spill;
          if (!sp || !sp.ferdig) return R.gaTil(sp ? "spill" : "hjem");
          const v = sp.vinnere || [];
          // On the net: the fanfare on the winner's phone, a gentle note on the others.
          if (v.length && (!paNett(sp) || v.some((i) => erJeg(sp, i)))) {
            R.lyd.fanfare();
            R.vibrer([40, 60, 120]);
            R.konfetti();
          } else {
            R.lyd.riktig();
            setTimeout(() => R.lyd.pling(), 260);
          }
          R.slippVaken();
        },
      },
    },

    handlinger: (H = {
      async nytt(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(pagar(S))) || !fortsatt()) return;
        S.spill = null;
        R.gaTil("oppsett");
      },
      endre(el, e, S) {
        S.spill = null;
        R.gaTil("oppsett");
      },
      fortsett(el, e, S) {
        if (pagar(S)) R.gaTil("spill");
      },
      mal(el, e, S) {
        const m = Number(el.dataset.v);
        S.oppsett.mal = G.MAL.includes(m) ? m : 200;
        R.vis();
      },
      start(el, e, S) {
        nyttSpill(S);
        R.gaTil("spill");
      },
      igjen(el, e, S) {
        nyttSpill(S);
        R.gaTil("spill");
      },
      vent() {},
      // «Ett til»: one more card for the seat on turn.
      til(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || laast || !G.paTur(sp) || !kanSpille(sp, sp.tur)) return;
        if (paNett(sp)) return void R.nett.send({ til: 1, r: sp.runde, n: sp.steg });
        const h = G.trekk(sp);
        if (h) visTrekk(sp, h);
      },
      stopp(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || laast || !G.paTur(sp) || !kanSpille(sp, sp.tur)) return;
        if (paNett(sp)) return void R.nett.send({ stopp: 1, r: sp.runde, n: sp.steg });
        const for_ = JSON.stringify(Object.assign({}, sp, { angre: null }));
        if (!G.stopp(sp)) return;
        sp.angre = for_;
        las(450);
        visStopp(sp);
      },
      // Take back the last «Stopp», until the next player has chosen (never on the net).
      angre(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || !sp.angre || paNett(sp)) return;
        let for_ = null;
        try {
          for_ = JSON.parse(sp.angre);
        } catch (feil) {
          for_ = null;
        }
        sp.angre = null;
        if (for_ && G.gyldig(for_)) {
          S.spill = for_;
          R.lyd.snu();
          R.toast(R.t("Angret – {navn} velger på nytt", { navn: R.navn(for_.tur) }));
        }
        R.vis();
      },
      neste(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "ferdig" || sp.slutt) return;
        if (paNett(sp)) return void (kanSpille(sp, G.nesteStarter(sp)) && R.nett.send({ runde: sp.runde + 1 }));
        if (G.nesteRunde(sp, tilfeldig)) visNyRunde();
      },
      kaaring(el, e, S) {
        const sp = S.spill;
        if (pagar(S) && sp.slutt && sp.fase === "ferdig") tilKaaring(S, !sp.forFa);
      },
      lapp(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.logg.length) return;
        R.ark(`
          <h2 id="ark-tittel">${esc(R.t("Poenglista"))}</h2>
          ${lappHtml(sp)}
          <p class="hjelp">${esc(R.t("Først til {mal}. Fet skrift betyr sju ulike.", { mal: sp.mal }))}</p>
          <button class="knapp" data-h="lukk-ark">${esc(R.t("Spill videre"))}</button>`);
      },
      kortene() {
        R.ark(`
          <h2 id="ark-tittel">${esc(R.t("Kortene i bunken"))}</h2>
          <div class="gp-ark-kort">${kortForklaring()}</div>
          <button class="knapp" data-h="lukk-ark">${esc(R.t("Spill videre"))}</button>`);
      },
      del(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.ferdig) return;
        const v = (sp.vinnere || []).map((i) => R.navn(i));
        const topp = Math.max(0, ...rangert(sp).map((r) => r.poeng));
        const navn = R.app.navn;
        const tekst = v.length ? R.t("{navn} vant {spill} med {poeng}! Tør du ta ett kort til?", { navn: R.ramsOpp(v), spill: navn, poeng: poengTekst(topp) }) : R.t("Vi har spilt {spill}. Tør du ta ett kort til?", { spill: navn });
        // (Only the result goes on the picture: the points and first names.)
        R.del(navn, tekst, DEL_URL, { kort: { tittel: navn, linjer: [String(topp), v.length ? R.t("{navn} vant", { navn: R.ramsOpp(v.map((x) => R.kutt(x, 14))) }) : ""].filter(Boolean) } });
      },
      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!pagar(S)) return;
        const fortsatt = R.vakt();
        const tomt = !sp.logg.length;
        const ja = await R.bekreft(R.t("Avslutte spillet?"), tomt ? R.t("Ingen runde er ferdig ennå. Dere kan alltid starte et nytt.") : R.t("Dere går rett til kåringen med poengene fra rundene som er ferdige."), R.t("Avslutt"), R.t("Spill videre"));
        if (!fortsatt() || !ja || !pagar(S)) return;
        if (tomt) {
          S.spill = null;
          R.gaTil("hjem");
          return;
        }
        tilKaaring(S, false);
      },
    }),
  });
})();
