/* Lurendreieren — «Løgnerterning» (liar's dice with bids). Everyone has five hidden dice. In turn:
   say a bid – «at least four fives» among ALL the dice on the table – that is higher than the last
   one (more dice, or as many of a higher face), or call «Løgn!». Then every die is shown and the
   matching ones are counted up one by one: if the bid held, the caller loses a die; if not, the
   bidder does. Without dice you are out; the last one with dice wins. Ones are wild (an option).
   On the net: a phone each, and each phone shows only its own dice until someone calls.
   On one phone: the phone goes round the table, and each player holds a finger on the card to
   peek at their own dice.
   The rules at the top are pure (window.RusjLurendreieren); test/lurendreieren.test.mjs loads this
   file without the kit. */
(function () {
  "use strict";

  // ---------- The rules (no kit needed) ----------

  const MIN = 2;
  const MAKS = 8;
  const START = [3, 5]; // dice each: a quick game, an ordinary one
  const range = (n) => Array.from({ length: n }, (_, i) => i);
  const klamp = (n, min, max) => Math.min(max, Math.max(min, n));
  // The faces one can bid on: with wild ones a one is never a face of its own.
  const flater = (joker) => (joker ? [2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6]);
  // Does this die count for face x?
  const teller = (v, x, joker) => v === x || (!!joker && v === 1);
  // How many of the dice on the table (kast: one list per seat) count for face x.
  const tell = (kast, x, joker) => (kast || []).reduce((s, liste) => s + liste.filter((v) => teller(v, x, joker)).length, 0);

  // o: { antall, terninger, joker, starter }
  function nytt(o = {}) {
    const antall = klamp(o.antall | 0 || MIN, MIN, MAKS);
    const start = START.includes(o.terninger) ? o.terninger : 5;
    return {
      antall,
      start,
      joker: o.joker !== false,
      ant: Array(antall).fill(start), // dice left per seat
      forlot: [], // seats that left the match (on the net)
      ute: [], // seats in the order they went out
      uteRunde: Array(antall).fill(0),
      runde: 0, // rounds begun
      kast: null, // this round's dice, one list per seat
      starter: klamp(o.starter | 0, 0, antall - 1), // who begins the round
      tur: 0,
      bud: null, // { n, x, av }: «at least n dice showing x», said by seat av
      kjede: [], // every bid of the round
      fase: "ny", // ny (nothing thrown yet) → bud → avslort → bud …
      utfall: null,
      vinner: null,
      valg: null, // the bid being built on the screen: { n, x }
      tall: range(antall).map(() => ({ rop: 0, treff: 0, avslort: 0, hjem: 0 })),
      steg: 0,
    };
  }
  const inne = (sp, i) => sp.ant[i] > 0;
  const igjen = (sp) => range(sp.antall).filter((i) => inne(sp, i));
  // The next seat with dice after seat i.
  function neste(sp, i) {
    for (let k = 1; k <= sp.antall; k++) {
      const j = (i + k) % sp.antall;
      if (inne(sp, j)) return j;
    }
    return i;
  }
  // The dice lying on the table this round (a seat that left mid-round still has its dice there).
  const total = (sp) => (sp.kast || []).reduce((s, l) => s + l.length, 0);

  // A new round: everyone with dice throws. terning(sete, antall, runde) gives a seat's dice.
  function nyRunde(sp, terning) {
    if (sp.vinner != null || !["ny", "avslort"].includes(sp.fase)) return false;
    sp.runde += 1;
    sp.kast = range(sp.antall).map((i) => (inne(sp, i) ? terning(i, sp.ant[i], sp.runde).slice(0, sp.ant[i]) : []));
    sp.tur = inne(sp, sp.starter) ? sp.starter : neste(sp, sp.starter);
    sp.bud = null;
    sp.kjede = [];
    sp.utfall = null;
    sp.valg = null;
    sp.fase = "bud";
    sp.steg += 1;
    return true;
  }
  // The fewest dice one may say for face x now (more than there are on the table: no bid on x).
  const minste = (sp, x) => (!sp.bud ? 1 : x > sp.bud.x ? sp.bud.n : sp.bud.n + 1);
  // Strictly higher than the last bid: more dice, or as many of a higher face.
  function lovlig(sp, n, x) {
    if (sp.fase !== "bud" || !Number.isInteger(n) || !Number.isInteger(x) || !flater(sp.joker).includes(x)) return false;
    return n >= minste(sp, x) && n <= total(sp);
  }
  const kanBy = (sp) => sp.fase === "bud" && flater(sp.joker).some((x) => minste(sp, x) <= total(sp));
  // The lowest bid that is allowed now (what the screen starts from), or null.
  function lavesteBud(sp) {
    if (sp.fase !== "bud") return null;
    const f = flater(sp.joker);
    if (!sp.bud) return { n: 1, x: f[0] };
    const hoyere = f.find((x) => x > sp.bud.x);
    if (hoyere != null && sp.bud.n <= total(sp)) return { n: sp.bud.n, x: hoyere };
    return sp.bud.n + 1 <= total(sp) ? { n: sp.bud.n + 1, x: f[0] } : null;
  }
  function by(sp, n, x) {
    if (!lovlig(sp, n, x)) return false;
    sp.bud = { n, x, av: sp.tur };
    sp.kjede.push({ n, x, av: sp.tur });
    sp.tur = neste(sp, sp.tur);
    sp.valg = null;
    sp.steg += 1;
    return true;
  }
  // «Løgn!»: every die is shown. The bid held → the caller loses a die; else the bidder does.
  function lyv(sp) {
    if (sp.fase !== "bud" || !sp.bud) return false;
    const b = sp.bud;
    const roper = sp.tur;
    const antall = tell(sp.kast, b.x, sp.joker);
    const holdt = antall >= b.n;
    const taper = holdt ? roper : b.av;
    sp.tall[roper].rop += 1;
    if (!holdt) {
      sp.tall[roper].treff += 1;
      sp.tall[b.av].avslort += 1;
    }
    // The bluffs nobody called: every earlier bid of the round that the dice did not hold.
    for (const k of sp.kjede.slice(0, -1)) if (tell(sp.kast, k.x, sp.joker) < k.n) sp.tall[k.av].hjem += 1;
    // (A bidder that has left the match has no die to lose.)
    const mistet = inne(sp, taper);
    if (mistet) {
      sp.ant[taper] -= 1;
      if (sp.ant[taper] === 0) {
        sp.ute.push(taper);
        sp.uteRunde[taper] = sp.runde;
      }
    }
    sp.utfall = { type: "lyv", roper, av: b.av, n: b.n, x: b.x, antall, holdt, taper, mistet, ute: mistet && !inne(sp, taper) };
    const rest = igjen(sp);
    if (rest.length === 1) sp.vinner = rest[0];
    // The loser begins the next round; out of the game, the next one does.
    sp.starter = inne(sp, taper) ? taper : neste(sp, taper);
    sp.valg = null;
    sp.fase = "avslort";
    sp.steg += 1;
    return true;
  }
  // A seat leaves the match (on the net): it is out, and its dice leave the count from the next
  // round – this round's dice stay on the table and the bid that is said stands. If it was its
  // turn, the turn passes. One seat left with dice: that one wins.
  function forlat(sp, sete) {
    if (!(sete >= 0 && sete < sp.antall) || sp.forlot.includes(sete)) return false;
    sp.forlot.push(sete);
    if (inne(sp, sete)) {
      sp.ant[sete] = 0;
      sp.ute.push(sete);
      sp.uteRunde[sete] = sp.runde;
    }
    sp.steg += 1;
    if (sp.vinner != null) return true;
    const rest = igjen(sp);
    if (rest.length <= 1) {
      sp.vinner = rest.length ? rest[0] : null;
      if (sp.fase !== "avslort") {
        sp.utfall = { type: "borte", av: sete };
        sp.fase = "avslort";
      }
      sp.valg = null;
      return true;
    }
    if (sp.fase === "bud" && sp.tur === sete) {
      sp.tur = neste(sp, sete);
      sp.valg = null;
    }
    if (!inne(sp, sp.starter)) sp.starter = neste(sp, sp.starter);
    return true;
  }
  // Is a reveal on the table – every die face up after «Løgn!», with matching dice to count?
  // (Not while the bidding goes on, and not when the match ended because the last opponent left.)
  const tellbar = (sp) => !!sp && sp.fase === "avslort" && !!sp.utfall && sp.utfall.type === "lyv";
  // Places: the winner, then the ones still in by dice, then the last to go out first.
  function rangering(sp) {
    const rad = range(sp.antall).map((i) => ({ i, ant: sp.ant[i], ut: sp.ute.indexOf(i) }));
    return rad.sort((a, b) => (b.i === sp.vinner) - (a.i === sp.vinner) || b.ant - a.ant || b.ut - a.ut);
  }

  const Regler = { MIN, MAKS, START, flater, teller, tell, nytt, inne, igjen, neste, total, nyRunde, minste, lovlig, kanBy, lavesteBud, by, lyv, forlat, tellbar, rangering };
  window.RusjLurendreieren = Regler;

  const R = window.Rusj;
  if (!R || typeof R.start !== "function") return; // loaded by the unit tests

  // ---------- The page ----------

  const esc = R.esc;
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const STANDARD = { terninger: 5, joker: true };
  // On the net (R.nett, rusj/kit/nett.js): seat i is player i on its own phone.
  const paNett = (sp) => !!sp && sp.modus === "nett" && !!R.nett;
  const meg = () => (R.nett ? R.nett.meg() : -1);
  // May this phone act for seat i now? (Always on one phone.)
  const kanSpille = (sp, i) => !paNett(sp) || (R.nett.erMeg(i) && !R.nett.venter());
  // The seat whose dice this phone may show while the bidding goes on: on the net its own, on one
  // phone the one who has said «Jeg er …» (behind the hold-card).
  const minPlass = (sp) => (paNett(sp) ? meg() : sp.hos);

  let H;
  // The reveal that is being counted up on this phone: { steg, vist, id }.
  let anim = null;
  let nyeTerninger = 0; // until when this phone's dice tumble in (a new round, live)

  const tilfeldigKast = (sete, n) => range(n).map(() => 1 + Math.floor((R.nyttFro() / 4294967296) * 6));
  // «4 femmere», «1 sekser» (a bid always means «at least»).
  const budTekst = (n, x) =>
    [null, R.flertall(n, "ener", "enere"), R.flertall(n, "toer", "toere"), R.flertall(n, "treer", "treere"), R.flertall(n, "firer", "firere"), R.flertall(n, "femmer", "femmere"), R.flertall(n, "sekser", "seksere")][x] || "";
  const FLATENAVN = { 1: R.t("Enere"), 2: R.t("Toere"), 3: R.t("Treere"), 4: R.t("Firere"), 5: R.t("Femmere"), 6: R.t("Seksere") };

  // ---------- Dice ----------
  // The dice that lie still are the kit's (R.terninger.statisk); the small faces in buttons and
  // bids are flat.
  const PUNKT = {
    1: [[50, 50]],
    2: [[71, 29], [29, 71]],
    3: [[71, 29], [50, 50], [29, 71]],
    4: [[29, 29], [71, 29], [29, 71], [71, 71]],
    5: [[29, 29], [71, 29], [50, 50], [29, 71], [71, 71]],
    6: [[29, 27], [71, 27], [29, 50], [71, 50], [29, 73], [71, 73]],
  };
  const flate = (v, klasse) =>
    `<svg class="lur-flate ${klasse || ""}" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><rect x="6" y="6" width="88" height="88" rx="22" fill="#fffaf2" stroke="#170e2b" stroke-width="7"/>${(PUNKT[v] || [])
      .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${v === 1 ? 13 : 9.5}" fill="${v === 1 ? "#d42a46" : "#170e2b"}"/>`)
      .join("")}</svg>`;
  const kube = (v, s, vri) => (R.terninger ? R.terninger.statisk([v], { s, vri: [vri || 0] }) : flate(v));
  const VRI = [-9, 7, -4, 11, -7, 5, -11, 8];
  // A seat's dice in a row (only ever drawn for the seat this phone may show, or at the reveal).
  const terningRad = (sete, verdier, s, klasse) =>
    `<span class="lur-terninger ${klasse || ""}" data-sete="${sete}" aria-hidden="true">${verdier.map((v, k) => `<span class="lur-t">${kube(v, s, VRI[(k + sete) % VRI.length])}</span>`).join("")}</span>`;

  // Sounds: dice rattling in a hand, and the tick of one die being counted.
  function rasle(n = 6) {
    for (let k = 0; k < n; k++) R.lyd.stoy(k * 0.04 + Math.random() * 0.012, 0.024, 0.08 + Math.random() * 0.06, 2400 + Math.random() * 2600);
  }

  // ---------- Pieces of the screen ----------

  // Who has how many dice, and whose turn it is.
  function bordRad(sp, aktiv) {
    return `<ol class="lur-bord-rad" aria-label="${esc(R.t("Terninger igjen"))}">${range(sp.antall)
      .map((i) => {
        const ute = !inne(sp, i);
        return `<li class="${i === aktiv ? "na" : ""}${ute ? " ute" : ""}" style="--pf: var(--p${(i % 20) + 1})"${i === aktiv ? ' aria-current="true"' : ""}>
          ${R.avatar(i)}<span class="lur-bord-navn">${esc(R.navn(i))}</span><b class="lur-ant" aria-hidden="true">${ute ? "×" : sp.ant[i]}</b><span class="vh">: ${esc(ute ? R.t("ute") : R.flertall(sp.ant[i], "terning", "terninger"))}</span>
        </li>`;
      })
      .join("")}</ol>`;
  }
  // The bid that stands (or the start of a round).
  function budKort(sp) {
    const b = sp.bud;
    if (!b) return `<div class="lur-bud tomt"><p class="lur-bud-tekst">${esc(R.t("Ny runde – {navn} begynner og kan si hva som helst.", { navn: R.navn(sp.tur) }))}</p></div>`;
    return `<div class="lur-bud" style="--pf: var(--p${(b.av % 20) + 1})">
      <p class="lur-bud-hvem">${R.avatar(b.av)}<span>${esc(R.t("{navn} sier", { navn: R.navn(b.av) }))}</span></p>
      <p class="lur-bud-verdi" aria-hidden="true"><b>${b.n}</b><i>×</i>${flate(b.x)}</p>
      <p class="lur-bud-tekst">${esc(R.t("minst {bud}", { bud: budTekst(b.n, b.x) }))}</p>
    </div>`;
  }
  // Building a bid: how many, and which face.
  function bygger(sp) {
    const v = sp.valg;
    const maks = total(sp);
    const f = flater(sp.joker);
    const min = v ? minste(sp, v.x) : 1;
    return `<div class="lur-bygger">
      <div class="lur-bygg-rad">
        <span class="lur-bygg-etikett">${esc(R.t("Antall"))}</span>
        ${R.ui.teller("antall", v ? v.n : 1, min, maks, { minus: R.t("Færre terninger"), pluss: R.t("Flere terninger") })}
      </div>
      <div class="lur-flater" role="group" aria-label="${esc(R.t("Hvilke øyne"))}">
        ${f.map((x) => `<button class="lur-flateknapp" data-h="flate" data-v="${x}" aria-pressed="${!!v && v.x === x}" aria-label="${esc(FLATENAVN[x])}"${minste(sp, x) > maks ? " disabled" : ""}>${flate(x)}</button>`).join("")}
      </div>
      <p class="hjelp lur-bygg-hjelp">${esc(sp.joker ? R.t("{n} terninger på bordet. Enere er jokere og teller som alt.", { n: maks }) : R.t("{n} terninger på bordet.", { n: maks }))}</p>
    </div>`;
  }
  // The screen starts from the lowest bid that is allowed.
  function passValg(sp) {
    const v = sp.valg;
    if (v && lovlig(sp, v.n, v.x)) return;
    sp.valg = lavesteBud(sp);
  }

  function resultatTekst(sp) {
    const u = sp.utfall;
    if (!u) return { tittel: "", tekst: "" };
    if (u.type === "borte") return { tittel: R.t("{navn} forlot kampen", { navn: R.navn(u.av) }), tekst: sp.vinner != null ? R.t("{navn} står igjen med terninger.", { navn: R.navn(sp.vinner) }) : "" };
    const t = R.navn(u.taper);
    const fant = u.holdt ? R.t("Det lå {antall} på bordet.", { antall: budTekst(u.antall, u.x) }) : u.antall === 0 ? R.t("Det lå ingen på bordet.") : R.t("Det lå bare {antall} på bordet.", { antall: budTekst(u.antall, u.x) });
    const mister = !u.mistet ? R.t("{navn} har forlatt kampen – ingen mister noe.", { navn: t }) : u.ute ? R.t("{navn} mister den siste terningen og er ute!", { navn: t }) : R.t("{navn} mister en terning.", { navn: t });
    return { tittel: u.holdt ? R.t("Det stemte!") : R.t("Bløff!"), tekst: `${fant} ${mister}` };
  }

  // ---------- The reveal: the matching dice are counted up one by one ----------

  const tellesOpp = (sp) => !!anim && anim.steg === sp.steg && tellbar(sp);
  function stoppAnim() {
    if (anim) clearTimeout(anim.id);
    anim = null;
  }
  // The count is over (or skipped): the verdict.
  function domAvsagt(sp) {
    stoppAnim();
    const u = sp.utfall;
    if (R.S.spill !== sp || !u || R.S.skjerm !== "spill") return;
    const r = resultatTekst(sp);
    if (u.type === "lyv") {
      // (as in Meyer: the sound of the call – right, or wrong)
      if (u.holdt) R.lyd.feil();
      else R.lyd.riktig();
      R.vibrer(u.ute ? [60, 40, 160] : [30, 30, 60]);
      if (u.ute) setTimeout(() => R.lyd.bom(), 350);
    }
    R.si(`${r.tittel} ${r.tekst}`);
    R.vis();
  }
  function tellVidere(sp) {
    // (Only while this reveal is on the table: a new round, or a match that ended because someone
    // left, has no dice to count – the outcome may not even be there.)
    if (!anim || R.S.spill !== sp || sp.steg !== anim.steg || R.S.skjerm !== "spill" || !tellbar(sp)) return stoppAnim();
    const u = sp.utfall;
    if (anim.vist >= u.antall) {
      anim.id = setTimeout(() => domAvsagt(sp), 520);
      return;
    }
    anim.vist += 1;
    const t = R.$(`#skjerm .lur-t[data-n="${anim.vist - 1}"]`);
    if (t) t.classList.add("talt", "na");
    const tall = R.$("#skjerm [data-lur-tall]");
    if (tall) {
      tall.textContent = String(anim.vist);
      tall.classList.toggle("nok", anim.vist >= u.n);
    }
    const tone = 380 + 45 * Math.min(anim.vist, 14); // one step up for every die that counts
    R.lyd.tone(tone, 0, 0.07, "triangle", 0.16, tone * 1.15);
    R.vibrer(8);
    anim.id = setTimeout(() => tellVidere(sp), 170);
  }
  function startAvsloring(sp) {
    stoppAnim();
    const u = sp.utfall;
    if (!u || u.type !== "lyv") return R.vis();
    if (R.rolig()) return domAvsagt(sp);
    anim = { steg: sp.steg, vist: 0, id: null };
    R.lyd.trommevirvel(0.5);
    R.vis();
    anim.id = setTimeout(() => tellVidere(sp), 620);
  }

  // The table with every die face up (the reveal). Matching dice get their place in the count.
  function avsloring(sp) {
    const u = sp.utfall;
    const r = resultatTekst(sp);
    if (u.type === "borte") {
      return `
        ${bordRad(sp, -1)}
        ${R.ui.banner({ tittel: r.tittel, tekst: r.tekst, klasse: "aksent", stemning: "" })}`;
    }
    const tellerNa = tellesOpp(sp);
    const vist = tellerNa ? anim.vist : u.antall;
    let nr = 0;
    const rader = range(sp.antall)
      .filter((i) => sp.kast[i].length)
      .map((i) => {
        const terninger = sp.kast[i]
          .map((v, k) => {
            const treff = teller(v, u.x, sp.joker);
            const n = treff ? nr++ : -1;
            return `<span class="lur-t${treff ? " treff" : ""}${treff && n < vist ? " talt" : ""}"${treff ? ` data-n="${n}"` : ""}>${kube(v, 30, VRI[(k + i) % VRI.length])}</span>`;
          })
          .join("");
        const rolle = i === u.av ? R.t("bød") : i === u.roper ? R.t("ropte løgn") : "";
        return `<li class="lur-rad${i === u.taper ? " taper" : ""}" style="--pf: var(--p${(i % 20) + 1})">
          ${R.avatar(i)}<span class="lur-rad-navn">${esc(R.navn(i))}${rolle ? `<small>${esc(rolle)}</small>` : ""}</span>
          <span class="lur-terninger" data-sete="${i}" aria-hidden="true">${terninger}</span>
          <span class="vh">${esc(R.t("{navn} hadde {terninger}.", { navn: R.navn(i), terninger: R.ramsOpp(sp.kast[i].map(String)) }))}</span>
        </li>`;
      })
      .join("");
    return `
      <div class="lur-avsloring${tellerNa ? " teller" : " ferdig"}${u.holdt ? " holdt" : " blof"}">
        <div class="lur-dom">
          <p class="lur-telleverk" aria-hidden="true"><b data-lur-tall class="${vist >= u.n ? "nok" : ""}">${vist}</b><span>${esc(R.t("av {n}", { n: u.n }))}</span></p>
          <div class="lur-dom-tekst">
            <p class="etikett">${esc(R.t("{navn} sa minst {bud}", { navn: R.navn(u.av), bud: budTekst(u.n, u.x) }))}</p>
            <h1 id="skjerm-tittel">${esc(tellerNa ? R.t("{navn} roper «Løgn!»", { navn: R.navn(u.roper) }) : r.tittel)}</h1>
          </div>
        </div>
        <ul class="lur-bord">${rader}</ul>
        ${tellerNa ? "" : `<p class="lur-res${u.ute ? " ute" : ""}" role="status">${esc(r.tekst)}</p>`}
        ${!tellerNa && sp.vinner == null ? `<p class="lur-neste">${R.avatar(sp.starter)}<span>${esc(R.t("{navn} begynner neste runde", { navn: R.navn(sp.starter) }))}</span></p>` : ""}
      </div>`;
  }

  // ---------- A game on one phone ----------

  function nyttSpill(S) {
    const antall = R.klamp(Number(S.antall) || MIN, MIN, MAKS);
    const sp = nytt({ antall, terninger: S.oppsett.terninger, joker: S.oppsett.joker, starter: Math.floor((R.nyttFro() / 4294967296) * antall) });
    sp.modus = "en";
    sp.hos = -1; // who holds the phone (has said «Jeg er …»); −1: it is on its way round
    nyRunde(sp, tilfeldigKast);
    S.spill = sp;
    stoppAnim();
    R.statistikk("start", { spillere: antall, terninger: sp.start, joker: sp.joker });
  }
  function lagreSlutt(S) {
    const sp = S.spill;
    if (!sp || sp.registrert) return;
    sp.registrert = true;
    const rang = rangering(sp);
    if (sp.ant.some((n) => n < sp.start)) R.kveld.registrer(rang.map((r, k) => ({ i: r.i, poeng: rang.length - k })));
    R.statistikk("ferdig", { spillere: sp.antall, runder: sp.runde, avbrutt: sp.vinner == null });
  }

  // ---------- On the net (R.nett, rusj/kit/nett.js) ----------
  // Every player on their own phone, 2–8. The moves:
  //   { bud: [n, x], r, k }   from the seat whose turn it is: «at least n dice showing x», strictly
  //                           higher than the bid that stands (r: the round, k: the bids said so
  //                           far – a stale or double tap counts once);
  //   { lyv: 1, r, k }        from the seat whose turn it is: «Løgn!» – every die is shown;
  //   { neste: r }            from the one who begins the next round, after the reveal of round r.
  // Anything else, or anything the rules don't allow now, is ignored on every phone.
  // The dice of a round come from the room's seed, the round and the seat (R.nett.tilfeldig), so
  // every phone computes all of them – but each phone only draws its own until someone calls.
  // Friends level: a modified phone could compute the others' dice from the seed, as it could any
  // coming throw on the net. These are games among friends who invited each other.
  // A seat that leaves: out of the game; its dice of this round stay in the count (the bid that is
  // said stands), and they are gone from the next round. If it was its turn, the turn passes.
  const nettKast = (fro) => (sete, n, runde) => {
    const rng = R.nett.tilfeldig(fro, `lur:${runde}:${sete}`);
    return range(n).map(() => 1 + Math.floor(rng() * 6));
  };

  const NETT = {
    min: MIN,
    maks: MAKS,
    oppsett: (S) => ({ terninger: S.oppsett.terninger === 3 ? 3 : 5, joker: S.oppsett.joker !== false }),
    oppsettTekst: (o) => {
      const x = o || {};
      return [R.t("{antall} hver", { antall: R.flertall(x.terninger === 3 ? 3 : 5, "terning", "terninger") }), x.joker !== false ? R.t("Enere er jokere") : R.t("Uten jokere")].join(" · ");
    },
    start(S, okt) {
      const o = okt.oppsett || {};
      const antall = R.klamp(okt.antall || MIN, MIN, MAKS);
      // Who begins moves on one seat per match.
      const sp = nytt({ antall, terninger: o.terninger === 3 ? 3 : 5, joker: o.joker !== false, starter: (okt.kamp - 1) % antall });
      Object.assign(sp, { modus: "nett", fro: okt.fro >>> 0, hos: -1, registrert: true });
      nyRunde(sp, nettKast(sp.fro));
      S.spill = sp;
      stoppAnim();
      nyeTerninger = 0;
    },
    trekk(S, t, sete, okt) {
      const sp = S.spill;
      if (!paNett(sp) || sp.ferdig || sp.vinner != null || !t || typeof t !== "object" || !(sete >= 0 && sete < sp.antall)) return;
      const live = !okt.gjenspill && S.skjerm === "spill";
      if (Array.isArray(t.bud)) {
        if (sp.fase !== "bud" || sete !== sp.tur || t.r !== sp.runde || t.k !== sp.kjede.length || t.bud.length !== 2 || !by(sp, t.bud[0], t.bud[1])) return;
        if (live) sagt(sp);
        return;
      }
      if (t.lyv === 1) {
        if (sp.fase !== "bud" || sete !== sp.tur || t.r !== sp.runde || t.k !== sp.kjede.length || !lyv(sp)) return;
        if (okt.gjenspill && sp.vinner != null) sp.ferdig = true; // a finished match, replayed: the result
        if (live) ropt(sp);
        return;
      }
      if (Number.isInteger(t.neste)) {
        if (sp.fase !== "avslort" || sp.vinner != null || sete !== sp.starter || t.neste !== sp.runde) return;
        // (Someone still watching the count gets the verdict as a line.)
        const midtI = live && tellesOpp(sp) ? resultatTekst(sp) : null;
        if (!nyRunde(sp, nettKast(sp.fro)) || !live) return;
        if (midtI) R.toast(`${midtI.tittel} ${midtI.tekst}`);
        kastet(sp);
      }
    },
    borte(S, sete, okt) {
      const sp = S.spill;
      if (!paNett(sp) || sp.ferdig || !forlat(sp, sete)) return;
      if (okt.gjenspill && sp.vinner != null) sp.ferdig = true;
      if (!okt.gjenspill && S.skjerm === "spill") {
        // The count on the screen goes on – but only if it is this reveal that is still on the
        // table (the next round may have begun a moment ago: then there is nothing to count).
        if (anim) {
          if (tellbar(sp)) anim.steg = sp.steg;
          else stoppAnim();
        }
        R.vis();
      }
    },
    // Every phone goes to «Kåringen» itself when the last one with dice is known.
    skjerm: (S) => (S.spill && S.spill.ferdig ? "slutt" : "spill"),
    tur(S) {
      const sp = S.spill;
      if (!sp || sp.ferdig || sp.vinner != null) return null;
      return sp.fase === "avslort" ? sp.starter : sp.tur;
    },
    ferdig: (S) => !!S.spill && (S.spill.ferdig || S.spill.vinner != null),
  };

  // ---------- What happens on the screen after a bid, a call and a new round ----------

  function sagt(sp) {
    const b = sp.bud;
    R.lyd.pop();
    R.vibrer(10);
    const tekst = R.t("{navn} sier minst {bud}.", { navn: R.navn(b.av), bud: budTekst(b.n, b.x) });
    if (paNett(sp)) {
      if (!R.nett.erMeg(b.av)) R.toast(tekst);
      else R.si(tekst);
    } else R.si(`${tekst} ${R.t("Gi mobilen til {navn}.", { navn: R.navn(sp.tur) })}`);
    R.vis();
  }
  function ropt(sp) {
    const u = sp.utfall;
    R.skjulToast(); // (the last bid's line must not lie over the count)
    R.vibrer([20, 30, 40]);
    R.si(R.t("{navn} roper «Løgn!»", { navn: R.navn(u.roper) }));
    startAvsloring(sp);
  }
  function kastet(sp) {
    stoppAnim(); // (a new round: whatever was being counted is over)
    rasle(7);
    setTimeout(() => rasle(5), 240);
    R.vibrer([12, 40, 12]);
    nyeTerninger = performance.now() + 700;
    R.si(R.t("Runde {n}. {navn} begynner.", { n: sp.runde, navn: R.navn(sp.tur) }));
    R.vis();
  }

  // ---------- Start ----------

  R.start({
    id: "lurendreieren",
    versjon: 1,
    pagar,
    nett: NETT,

    tilstand: () => ({
      antall: R.klamp(R.felles.navn.filter((n) => String(n || "").trim()).length || 3, MIN, MAKS),
      oppsett: Object.assign({}, STANDARD),
      spill: null,
    }),

    lastet(S) {
      S.oppsett = Object.assign({}, STANDARD, S.oppsett && typeof S.oppsett === "object" ? S.oppsett : {});
      S.oppsett.terninger = START.includes(Number(S.oppsett.terninger)) ? Number(S.oppsett.terninger) : 5;
      S.oppsett.joker = S.oppsett.joker !== false;
      S.antall = R.klamp(Number(S.antall) || MIN, MIN, MAKS);
      const sp = S.spill;
      if (sp) {
        const n = sp.antall;
        const sete = (i) => Number.isInteger(i) && i >= 0 && i < n;
        const terning = (x) => Number.isInteger(x) && x >= 1 && x <= 6;
        const bud = (b) => !!b && Number.isInteger(b.n) && b.n >= 1 && flater(sp.joker).includes(b.x) && sete(b.av);
        const ok =
          sp.modus === "en" && Number.isInteger(n) && n >= MIN && n <= MAKS && START.includes(sp.start) &&
          Array.isArray(sp.ant) && sp.ant.length === n && sp.ant.every((a) => Number.isInteger(a) && a >= 0 && a <= sp.start) &&
          Array.isArray(sp.ute) && sp.ute.every(sete) && Array.isArray(sp.uteRunde) && sp.uteRunde.length === n &&
          Array.isArray(sp.tall) && sp.tall.length === n && sp.tall.every((t) => t && ["rop", "treff", "avslort", "hjem"].every((k) => Number.isInteger(t[k]))) &&
          Array.isArray(sp.forlot) && Number.isInteger(sp.runde) && sp.runde >= 1 && Number.isInteger(sp.steg) &&
          sete(sp.tur) && sete(sp.starter) && ["bud", "avslort"].includes(sp.fase) &&
          Array.isArray(sp.kast) && sp.kast.length === n && sp.kast.every((l) => Array.isArray(l) && l.length <= sp.start && l.every(terning)) &&
          Array.isArray(sp.kjede) && sp.kjede.every(bud) && (sp.bud == null || bud(sp.bud)) &&
          (sp.fase !== "bud" || (inne(sp, sp.tur) && sp.kast[sp.tur].length === sp.ant[sp.tur])) &&
          (sp.fase !== "avslort" || (sp.utfall && sp.utfall.type === "lyv" && sete(sp.utfall.taper) && sete(sp.utfall.roper) && sete(sp.utfall.av))) &&
          (sp.vinner == null || sete(sp.vinner)) && igjen(sp).length >= 1;
        if (!ok) S.spill = null;
        else {
          // Never back with someone's dice within reach: the phone is on its way to the one whose turn it is.
          sp.hos = -1;
          sp.valg = null;
          if (sp.vinner == null && igjen(sp).length === 1) sp.vinner = igjen(sp)[0];
        }
      }
      if (S.skjerm === "spill" && !S.spill) S.skjerm = "hjem";
      if (S.skjerm === "slutt" && !(S.spill && S.spill.ferdig)) S.skjerm = S.spill ? "spill" : "hjem";
    },

    regler: {
      intro: R.t("Alle har skjulte terninger. By på hvor mange av et tall dere har til sammen – sant eller bløff. Tror du ikke på budet, roper du «Løgn!»."),
      steg: [
        [R.t("Kast og kikk"), R.t("Alle kaster terningene sine – fem hver, eller tre i et kjapt spill. Bare du ser dine egne.")],
        [R.t("Si et bud"), R.t("Et bud er for eksempel «minst fire femmere» – blant alle terningene på bordet. Neste bud må være høyere: flere terninger, eller like mange med flere øyne.")],
        [R.t("… eller rop «Løgn!»"), R.t("Da vises alle terningene. Stemte budet, mister den som ropte, en terning. Var det bløff, mister den som bød. Sist med terninger igjen vinner.")],
      ],
      tips: [
        R.t("Enere er jokere og teller som alt, så ingen kan by på enere. Jokerne kan slås av i oppsettet."),
        R.t("Den som mistet en terning, begynner neste runde."),
        R.t("Regn litt: med jokere viser omtrent hver tredje terning det du byr på."),
        R.t("På nett viser hver mobil bare sine egne terninger. På én mobil går mobilen rundt bordet, og du holder fingeren på kortet for å se dine."),
      ],
    },

    hemmelig: {
      innhold(S) {
        const sp = S.spill;
        if (!sp || paNett(sp) || sp.fase !== "bud" || sp.hos !== sp.tur) return { html: "" };
        const mine = sp.kast[sp.tur];
        return {
          html: `${terningRad(sp.tur, mine, mine.length > 4 ? 40 : 46, "lur-bak-terninger")}<p class="lur-bak-tekst">${esc(R.t("Dine terninger"))}</p>`,
          klasse: "lur-bak",
          si: R.t("Terningene dine: {terninger}.", { terninger: R.ramsOpp(mine.map(String)) }),
        };
      },
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const sp = S.spill;
          return R.ui.spillhjem({
            slagordHtml: `${esc(S.oppsett.terninger === 3 ? R.t("Tre terninger i skjul.") : R.t("Fem terninger i skjul."))}<br><em>${esc(R.t("Hvor mange tør du love?"))}</em>`,
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: pagar(S) ? (sp.vinner != null ? R.t("Fortsett · se kåringen") : R.t("Fortsett · runde {n}", { n: sp.runde })) : "",
              ekstraHtml: (R.nett ? R.nett.knapp() : "") + R.ui.lenke(R.t("Slik spiller du"), "regler"),
            }),
            merker: [
              [`${MIN}–${MAKS}`, R.t("spillere")],
              [String(S.oppsett.terninger), R.t("terninger hver")],
              ["0", R.t("reklame")],
            ],
          });
        },
        inn: () => R.slippVaken(),
      },

      oppsett: {
        tittel: R.t("Nytt spill"),
        tilbake: "hjem",
        vis: (S) => `
          <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
          ${R.ui.spillere({ min: MIN, max: MAKS, hjelp: R.t("Mobilen går rundt bordet i denne rekkefølgen.") })}
          <section class="seksjon">
            <div class="seksjon-hode"><h2>${esc(R.t("Terninger"))}</h2><span class="tall">${esc(R.t("{antall} hver", { antall: R.flertall(S.oppsett.terninger, "terning", "terninger") }))}</span></div>
            ${R.ui.seg("terninger", [[3, R.t("3 · kjapt")], [5, R.t("5 · vanlig")]], S.oppsett.terninger, { etikett: R.t("Hvor mange terninger hver spiller har") })}
          </section>
          <section class="seksjon">
            ${R.ui.bryter("joker", S.oppsett.joker, R.t("Enere er jokere"), R.t("En ener teller som hvilket som helst tall."))}
          </section>
          ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start", { variant: "stor", ikon: "🎲" }))}`,
      },

      spill: {
        tittel: (S) => R.t("Runde {n}", { n: S.spill.runde }),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const nett = paNett(sp);
          const avslutt = R.ui.lenke(R.t("Avslutt"), "avslutt");
          const regler = R.ui.lenke(R.t("Slik spiller du"), "regler");

          // ----- The reveal, and what it cost -----
          if (sp.fase === "avslort") {
            const ferdig = sp.vinner != null;
            const andres = nett && !R.nett.erMeg(sp.starter);
            return `
              ${avsloring(sp)}
              ${R.ui.dokk(
                tellesOpp(sp)
                  ? R.ui.knapp2(R.t("Hopp over"), "hopp")
                  : ferdig
                    ? R.ui.knapp(R.t("Til kåringen"), "kaaring", { variant: "stor", ikon: "🏆" })
                    : andres
                      ? R.ui.knapp(R.t("Venter på {navn} …", { navn: R.navn(sp.starter) }), "runde", { variant: "stor", av: true })
                      : R.ui.knapp(R.t("Neste runde"), "runde", { variant: "stor", ikon: "🎲", av: nett && R.nett.venter() }),
                R.ui.lenkerad(regler, ferdig ? "" : avslutt),
              )}`;
          }

          const tur = sp.tur;
          const navn = R.navn(tur);
          const jeg = minPlass(sp);
          const minTur = nett ? R.nett.erMeg(tur) : sp.hos === tur;
          const mine = nett && jeg >= 0 && sp.kast[jeg] && sp.kast[jeg].length ? sp.kast[jeg] : null;
          const ny = performance.now() < nyeTerninger;
          // My own dice, on my own phone (on the net; on one phone they are behind the hold-card).
          const hand = mine
            ? `<div class="lur-hand${ny ? " ny" : ""}"><p class="etikett">${esc(R.t("Dine terninger"))}</p>${terningRad(jeg, mine, mine.length > 4 ? 40 : 46)}<span class="vh">${esc(R.t("Terningene dine: {terninger}.", { terninger: R.ramsOpp(mine.map(String)) }))}</span></div>`
            : nett && jeg >= 0 && !inne(sp, jeg)
              ? `<p class="lur-ute-linje">${esc(R.t("Du er ute – følg med på resten."))}</p>`
              : "";

          // ----- One phone, on its way to the one whose turn it is -----
          if (!nett && !minTur) {
            return `
              ${bordRad(sp, tur)}
              <div class="lur-gi">
                ${R.avatar(tur, "stor")}
                <div><p class="etikett">${esc(R.t("Gi mobilen til"))}</p><h1 id="skjerm-tittel">${esc(navn)}</h1></div>
              </div>
              ${budKort(sp)}
              <p class="hjelp lur-hint">${esc(sp.bud ? R.t("{navn} må by høyere – eller rope «Løgn!».", { navn }) : R.t("De andre ser bort mens {navn} kikker på terningene sine.", { navn }))}</p>
              ${R.ui.dokk(R.ui.knapp(R.t("Jeg er {navn}", { navn }), "jeg-er", { variant: "stor" }), R.ui.lenkerad(regler, avslutt))}`;
          }

          // ----- On the net: someone else's turn -----
          if (nett && !minTur) {
            return `
              ${bordRad(sp, tur)}
              <div class="lur-hode">
                ${R.avatar(tur, "mid")}
                <div><p class="etikett">${esc(R.t("På tur"))}</p><h1 id="skjerm-tittel">${esc(navn)}</h1></div>
              </div>
              ${budKort(sp)}
              ${hand}
              ${R.ui.dokk(R.ui.knapp(R.t("{navn} tenker …", { navn }), "si", { variant: "stor", av: true, ikon: "🤔" }), R.ui.lenkerad(regler, avslutt))}`;
          }

          // ----- My turn: a higher bid, or «Løgn!» -----
          passValg(sp);
          const v = sp.valg;
          const venter = nett && R.nett.venter();
          return `
            ${nett ? bordRad(sp, tur) : ""}
            <div class="lur-hode kompakt">
              ${R.avatar(tur)}
              <div><p class="etikett">${esc(nett ? R.t("Din tur") : R.t("{navn} · bare du ser", { navn }))}</p><h1 id="skjerm-tittel">${esc(sp.bud ? R.t("Høyere – eller løgn?") : R.t("Hva sier du?"))}</h1></div>
            </div>
            ${nett ? "" : `<div class="lur-titt" data-hemmelig>${R.ui.mappe({ id: "kast", etikett: R.t("Dine terninger"), tekst: R.t("Hold fingeren på kortet for å se"), etikettAria: R.t("Dine terninger. Hold fingeren på kortet for å se dem") })}</div>`}
            ${sp.bud ? budKort(sp) : ""}
            ${hand}
            ${v ? bygger(sp) : `<p class="hjelp lur-hint">${esc(R.t("Ingen kan by høyere enn dette. Rop «Løgn!».") )}</p>`}
            ${R.ui.dokk(
              `<div class="knapprad lur-svar">${sp.bud ? R.ui.knapp(R.t("Løgn!"), "lyv", { variant: "rod", ikon: "✋", av: venter }) : ""}${
                v ? R.ui.knapp(R.t("Si {bud}", { bud: budTekst(v.n, v.x) }), "si", { av: venter, id: "lur-si", etikett: R.t("Si minst {bud}", { bud: budTekst(v.n, v.x) }) }) : ""
              }</div>`,
              R.ui.lenkerad(regler, avslutt),
            )}`;
        },
        inn(S) {
          if (!S.spill) return R.gaTil("hjem");
          R.holdVaken();
          R.vedForlat(stoppAnim);
        },
        // Leaving the table (back, «Kåringen»): the phone is no longer in anyone's hand.
        ut(S) {
          if (!S.spill) return;
          S.spill.hos = -1;
          S.spill.valg = null;
        },
      },

      slutt: {
        tittel: R.t("Kåringen"),
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const rang = rangering(sp);
          const ledere = sp.vinner != null ? [sp.vinner] : rang.filter((r) => r.ant === rang[0].ant).map((r) => r.i);
          const etikett = (r) =>
            r.ant > 0
              ? R.t("{antall} igjen", { antall: R.flertall(r.ant, "terning", "terninger") })
              : sp.forlot.includes(r.i)
                ? R.t("forlot kampen i runde {n}", { n: sp.uteRunde[r.i] })
                : R.t("ute i runde {n}", { n: sp.uteRunde[r.i] });
          const liste = `<ol class="lur-plasser">${rang
            .map((r, k) => {
              const t = sp.tall[r.i];
              return `<li class="${ledere.includes(r.i) ? "leder" : ""}" style="--pf: var(--p${(r.i % 20) + 1})"><span class="plass-nr">${k + 1}</span>${R.avatar(r.i)}<span class="navn">${esc(R.navn(r.i))}<small>${esc(etikett(r))}${t.hjem ? ` · ${esc(R.t("{antall} gikk hjem", { antall: R.flertall(t.hjem, "bløff", "bløffer") }))}` : ""}${t.treff ? ` · ${esc(R.t("avslørte {n}", { n: t.treff }))}` : ""}</small></span><b class="lur-ant" aria-hidden="true">${r.ant > 0 ? r.ant : "×"}</b></li>`;
            })
            .join("")}</ol>`;
          const tittel = ledere.length > 1 ? R.t("{navn} leder!", { navn: R.ramsOpp(ledere.map((i) => R.navn(i))) }) : R.t("{navn} vinner!", { navn: R.navn(ledere[0]) });
          const luring = rang.slice().sort((a, b) => sp.tall[b.i].hjem - sp.tall[a.i].hjem)[0];
          const tekst =
            sp.vinner == null
              ? R.t("Spillet ble avsluttet før det var ferdig.")
              : sp.tall[luring.i].hjem > 0
                ? R.t("Kveldens lurendreier: {navn} – {antall} gikk hjem.", { navn: R.navn(luring.i), antall: R.flertall(sp.tall[luring.i].hjem, "bløff", "bløffer") })
                : R.t("Godt jobba – ærlig spilt!");
          return `
            <div class="banner aksent">
              ${ledere.length === 1 ? `<span class="lur-vinner">${R.avatar(ledere[0], "gigant")}<span class="lur-krone" aria-hidden="true">👑</span></span>` : R.ui.figur(null, { stemning: "jubel" })}
              <p class="etikett">${esc(R.t("Kåringen"))}</p>
              <h1 id="skjerm-tittel">${esc(tittel)}</h1>
              <p class="ingress">${esc(tekst)}</p>
            </div>
            <section class="seksjon"><h2>${esc(R.t("Slik gikk det"))}</h2>${liste}</section>
            ${
              paNett(sp)
                ? R.nett.sluttDokk()
                : `${R.ui.flereSpill({ antall: sp.antall })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen"), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "endre"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`
            }`;
        },
        inn(S) {
          const sp = S.spill;
          if (!sp) return;
          R.slippVaken();
          // On the net: the fanfare on the winner's phone, a gentle note on the others.
          if (sp.vinner != null && (!paNett(sp) || R.nett.erMeg(sp.vinner))) {
            R.lyd.fanfare();
            R.vibrer([40, 60, 120]);
            R.konfetti();
          } else R.lyd.pling();
          if (!paNett(sp)) R.visInstallTips();
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
      endre: () => R.gaTil("oppsett"),
      fortsett(el, e, S) {
        if (!pagar(S)) return;
        S.spill.hos = -1;
        R.gaTil("spill");
      },
      terninger(el, e, S) {
        S.oppsett.terninger = Number(el.dataset.v) === 3 ? 3 : 5;
        R.vis();
      },
      joker(el, e, S) {
        S.oppsett.joker = !S.oppsett.joker;
        R.vis();
      },
      start(el, e, S) {
        nyttSpill(S);
        R.gaTil("spill");
      },
      igjen(el, e, S) {
        const sp = S.spill;
        if (sp) {
          S.antall = sp.antall;
          S.oppsett.terninger = sp.start;
          S.oppsett.joker = sp.joker;
        }
        nyttSpill(S);
        R.gaTil("spill");
      },

      // One phone: the one whose turn it is has the phone now.
      "jeg-er"(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || paNett(sp) || sp.fase !== "bud") return;
        sp.hos = sp.tur;
        R.vis();
      },
      // (The bid being built is this phone's own until it is said: only «Si» is a move.)
      antall(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "bud" || !sp.valg || !kanSpille(sp, sp.tur)) return;
        const n = sp.valg.n + (Number(el.dataset.v) > 0 ? 1 : -1);
        if (!lovlig(sp, n, sp.valg.x)) return;
        sp.valg.n = n;
        R.vis();
      },
      flate(el, e, S) {
        const sp = S.spill;
        const x = Number(el.dataset.v);
        if (!pagar(S) || sp.fase !== "bud" || !sp.valg || !kanSpille(sp, sp.tur) || !flater(sp.joker).includes(x) || minste(sp, x) > total(sp)) return;
        sp.valg = { n: Math.max(sp.valg.n, minste(sp, x)), x };
        R.lyd.tone(420 + x * 30, 0, 0.06, "sine", 0.12, 300);
        R.vis();
      },
      si(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "bud" || !sp.valg || !lovlig(sp, sp.valg.n, sp.valg.x)) return;
        if (paNett(sp)) return void (kanSpille(sp, sp.tur) && R.nett.send({ bud: [sp.valg.n, sp.valg.x], r: sp.runde, k: sp.kjede.length }));
        if (sp.hos !== sp.tur || !by(sp, sp.valg.n, sp.valg.x)) return;
        sp.hos = -1;
        sagt(sp);
      },
      lyv(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "bud" || !sp.bud) return;
        if (paNett(sp)) return void (kanSpille(sp, sp.tur) && R.nett.send({ lyv: 1, r: sp.runde, k: sp.kjede.length }));
        if (sp.hos !== sp.tur || !lyv(sp)) return;
        sp.hos = -1;
        ropt(sp);
      },
      hopp(el, e, S) {
        const sp = S.spill;
        if (pagar(S) && tellesOpp(sp)) domAvsagt(sp);
      },
      runde(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "avslort" || sp.vinner != null || tellesOpp(sp)) return;
        if (paNett(sp)) return void (kanSpille(sp, sp.starter) && R.nett.send({ neste: sp.runde }));
        if (!nyRunde(sp, tilfeldigKast)) return;
        sp.hos = -1;
        kastet(sp);
      },
      kaaring(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.vinner == null) return;
        stoppAnim();
        if (!paNett(sp)) lagreSlutt(S); // (on the net nothing is kept on this phone)
        sp.ferdig = true;
        R.gaTil("slutt");
      },
      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!pagar(S)) return;
        const fortsatt = R.vakt();
        const urort = sp.ant.every((n) => n === sp.start);
        const ja = await R.bekreft(R.t("Avslutte spillet?"), urort ? R.t("Ingen har mistet en terning ennå. Dere kan alltid starte et nytt.") : R.t("Dere går rett til kåringen. Flest terninger igjen leder."), R.t("Avslutt"), R.t("Spill videre"));
        if (!ja || !fortsatt() || S.spill !== sp || !pagar(S)) return;
        stoppAnim();
        if (urort) {
          S.spill = null;
          return R.gaTil("hjem");
        }
        lagreSlutt(S);
        sp.ferdig = true;
        R.gaTil("slutt");
      },
    }),
  });
})();
