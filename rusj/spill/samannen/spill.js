/* Såmannen — kalaha, the Scandinavian mancala: six pits each and a store («kalaha») at the end, 4 or
   6 marbles in every pit. Pick up all the marbles in one of your pits and put one in each pit after
   it, counter-clockwise (your own store too, never the other's). The last one in your store: go
   again. The last one in an empty pit of yours: take it and everything in the pit opposite. When
   one side is empty, each takes what is left on their own side; most in the store wins.
   Two players on one phone, or against the phone at three levels. The rules (Kalaha) and the
   engine (Motor: Lett plays at random with a taste for extra turns, Middels looks three moves
   ahead, Vanskelig searches deep with alpha-beta in small slices) are pure functions at the top;
   test/samannen.test.mjs loads the file without the kit. */
(function () {
  "use strict";

  // ---------- The rules ----------
  // b[0…5]: side 0's pits (in sowing order), b[6]: side 0's store, b[7…12]: side 1's pits,
  // b[13]: side 1's store. Side 0 starts. The pit opposite i is 12 − i.

  const Kalaha = (() => {
    const KULER = [4, 6];
    const LAGER = [6, 13];
    const egne = (s) => (s === 0 ? [0, 1, 2, 3, 4, 5] : [7, 8, 9, 10, 11, 12]);
    const eier = (i) => (i < 6 ? 0 : i > 6 && i < 13 ? 1 : -1);

    function nyttParti(kuler) {
      const b = new Array(14).fill(kuler);
      b[6] = b[13] = 0;
      return { kuler, b, tur: 0, hist: [], slutt: false };
    }
    const lovlige = (p) => (p.slutt ? [] : egne(p.tur).filter((i) => p.b[i] > 0));
    const sideTom = (b, s) => egne(s).every((i) => !b[i]);

    // Play pit i; returns { i, s, gang: [pits, in order], tatt: { fra, antall } | null, igjen,
    // rest: [seeds side 0, side 1] when the game ends here } or null when the move isn't legal.
    function spill(p, i) {
      if (p.slutt || eier(i) !== p.tur || !p.b[i]) return null;
      const s = p.tur;
      const for_ = p.b.slice();
      let n = p.b[i];
      p.b[i] = 0;
      const gang = [];
      let k = i;
      while (n > 0) {
        k = (k + 1) % 14;
        if (k === LAGER[1 - s]) continue;
        p.b[k]++;
        gang.push(k);
        n--;
      }
      let tatt = null;
      if (eier(k) === s && p.b[k] === 1 && p.b[12 - k] > 0) {
        tatt = { fra: 12 - k, antall: p.b[12 - k] + 1 };
        p.b[LAGER[s]] += p.b[12 - k] + 1;
        p.b[12 - k] = 0;
        p.b[k] = 0;
      }
      const igjen = k === LAGER[s];
      if (!igjen) p.tur = 1 - s;
      const h = { i, s, gang, tatt, igjen, for_, rest: null };
      if (sideTom(p.b, 0) || sideTom(p.b, 1)) {
        h.rest = [0, 1].map((t) => egne(t).reduce((sum, j) => sum + p.b[j], 0));
        for (const t of [0, 1])
          for (const j of egne(t)) {
            p.b[LAGER[t]] += p.b[j];
            p.b[j] = 0;
          }
        p.slutt = true;
      }
      p.hist.push(h);
      return h;
    }
    function tilbake(p) {
      const h = p.hist.pop();
      if (!h) return null;
      p.b = h.for_.slice();
      p.tur = h.s;
      p.slutt = false;
      return h;
    }
    function spillUt(kuler, liste) {
      if (!KULER.includes(kuler) || !Array.isArray(liste)) return null;
      const p = nyttParti(kuler);
      for (const i of liste) if (!spill(p, i)) return null;
      return p;
    }
    // { slutt, vinner (side | null), lager [side 0, side 1] }
    function status(p) {
      const l = [p.b[6], p.b[13]];
      return { slutt: p.slutt, vinner: !p.slutt || l[0] === l[1] ? null : l[0] > l[1] ? 0 : 1, lager: l };
    }

    return { KULER, LAGER, egne, eier, nyttParti, lovlige, spill, tilbake, spillUt, status };
  })();

  // ---------- The engine ----------

  const Motor = (() => {
    const { lovlige, spill, tilbake, LAGER } = Kalaha;
    const NIVA = { 1: {}, 2: { dybde: 3 }, 3: { dybde: 16, noder: 150000, ms: 600 } };
    const VINN = 10000;

    // From side s: the stores, and a little for the marbles still on one's own side.
    function evaluer(p, s) {
      const o = 1 - s;
      if (p.slutt) {
        const d = p.b[LAGER[s]] - p.b[LAGER[o]];
        return d > 0 ? VINN + d : d < 0 ? -VINN + d : 0;
      }
      let egne = 0, andre = 0;
      for (const i of Kalaha.egne(s)) egne += p.b[i];
      for (const i of Kalaha.egne(o)) andre += p.b[i];
      return (p.b[LAGER[s]] - p.b[LAGER[o]]) * 4 + (egne - andre);
    }
    // Moves that end in one's own store first (they keep the turn), then the rest from the right.
    function ordne(p) {
      const s = p.tur;
      return lovlige(p).sort((a, b) => {
        const fa = (LAGER[s] - a + 14) % 14 === p.b[a] ? 1 : 0;
        const fb = (LAGER[s] - b + 14) % 14 === p.b[b] ? 1 : 0;
        return fb - fa || b - a;
      });
    }
    // Alpha-beta from side s (an extra turn keeps the same side, so no negation). A generator that
    // yields every 256 nodes, so the page can run it in slices (tenk).
    function* sok(p, s, dybde, alfa, beta, k) {
      if (p.slutt || dybde <= 0) return evaluer(p, s);
      if (++k.noder > k.maks || ((k.noder & 255) === 0 && k.klokke() > k.slutt)) {
        k.stopp = true;
        return 0;
      }
      if ((k.noder & 255) === 0) yield;
      const maks = p.tur === s;
      let best = maks ? -Infinity : Infinity;
      for (const i of ordne(p)) {
        spill(p, i);
        const v = yield* sok(p, s, dybde - 1, alfa, beta, k);
        tilbake(p);
        if (k.stopp) return 0;
        if (maks) {
          if (v > best) best = v;
          if (v > alfa) alfa = v;
        } else {
          if (v < best) best = v;
          if (v < beta) beta = v;
        }
        if (alfa >= beta) break;
      }
      return best;
    }

    function* finn(p, o) {
      const r = o.tilfeldig || Math.random;
      const liste = lovlige(p);
      if (!liste.length) return -1;
      const niva = NIVA[o.niva] ? o.niva : 2;
      const s = p.tur;
      if (niva === 1) {
        const igjen = liste.filter((i) => (LAGER[s] - i + 14) % 14 === p.b[i]);
        if (igjen.length && r() < 0.5) return igjen[Math.floor(r() * igjen.length)];
        return liste[Math.floor(r() * liste.length)];
      }
      const def = NIVA[niva];
      const klokke = o.klokke || (() => performance.now());
      const k = { noder: 0, maks: o.noder || def.noder || 1e9, slutt: klokke() + (o.ms || def.ms || 1e9), klokke, stopp: false };
      let best = ordne(p)[0];
      for (let d = niva === 2 ? def.dybde : 1; d <= def.dybde; d++) {
        let alfa = -Infinity;
        const verdier = [];
        const rot = [best, ...ordne(p).filter((i) => i !== best)];
        for (const i of rot) {
          spill(p, i);
          const v = yield* sok(p, s, d - 1, niva === 2 ? -Infinity : alfa, Infinity, k);
          tilbake(p);
          if (k.stopp) break;
          verdier.push({ i, v });
          if (v > alfa) alfa = v;
        }
        verdier.sort((a, b) => b.v - a.v);
        if (k.stopp) {
          if (verdier.length) best = verdier[0].i;
          break;
        }
        // Middels: one of the moves close to the best (a little at random)
        const topp = niva === 2 ? verdier.filter((x) => x.v >= verdier[0].v - 2) : verdier.filter((x) => x.v === verdier[0].v);
        best = topp[Math.floor(r() * topp.length)].i;
        if (Math.abs(verdier[0].v) >= VINN) break;
      }
      return best;
    }
    function velg(p, o) {
      const it = finn(p, o);
      let x = it.next();
      while (!x.done) x = it.next();
      return x.value;
    }
    // In the page: slices of about 10 ms; returns a function that stops the search.
    function tenk(p, o, ferdig) {
      const it = finn(p, o);
      let stopp = false;
      let id = null;
      const steg = () => {
        if (stopp) return;
        const slutt = performance.now() + 10;
        let x = it.next();
        while (!x.done && performance.now() < slutt) x = it.next();
        if (x.done) ferdig(x.value);
        else id = setTimeout(steg, 0);
      };
      id = setTimeout(steg, 0);
      return () => {
        stopp = true;
        clearTimeout(id);
      };
    }

    return { NIVA, evaluer, velg, tenk };
  })();

  const R = window.Rusj;
  if (!R) {
    // Loaded without the kit (unit tests in node): only the rules and the engine.
    window.Samannen = { Kalaha, Motor };
    return;
  }

  // ---------- The game on the page ----------

  const esc = R.esc;
  // Every text goes through R.t (rusj/SPRAK.md): the key is the Norwegian text.
  const KLASSE = ["rosa", "bla"]; // class names // sprak-ok
  const NIVANAVN = { 1: R.t("Lett"), 2: R.t("Middels"), 3: R.t("Vanskelig") };
  const NIVATEKST = {
    1: R.t("Mobilen velger hull litt på måfå. Fint for de minste."),
    2: R.t("Mobilen ser noen trekk fram og tar gjerne en ekstra tur."),
    3: R.t("Mobilen regner langt fram. Klarer du å slå den?"),
  };
  const NIVAER = [1, 2, 3];
  const MIN_TENK = 700;
  const IGJEN_TENK = 600;
  const ADRESSE = location.origin + R.forside + ((R.sprak !== "nb" && window.RUSJ_SPILL && window.RUSJ_SPILL.slug) || "samannen") + "/";
  let H;

  // S.spill: { id, modus "mobil" | "to", niva, kuler, starter (player with side 0), trekk (pits),
  //   resultat { vinner (player | null), lager [p0, p1] } | null, ferdig, registrert }
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const erMaskin = (sp, i) => sp.modus === "mobil" && i === 1;
  const navn = (sp, i) => (sp.modus === "mobil" ? (i === 1 ? R.t("Mobilen") : R.t("Du")) : R.navn(i));
  const spillerFor = (sp, side) => (side === 0 ? sp.starter : 1 - sp.starter);
  const sideFor = (sp, i) => (i === sp.starter ? 0 : 1);

  let parti = null;
  let partiFor = "";
  const partiNokkel = (sp) => `${sp.id}:${sp.kuler}:${sp.trekk.length}:${sp.trekk[sp.trekk.length - 1]}`;
  function hentParti(S) {
    const sp = S.spill;
    const k = partiNokkel(sp);
    if (parti && partiFor === k) return parti;
    parti = Kalaha.spillUt(sp.kuler, sp.trekk);
    partiFor = k;
    return parti;
  }
  const merkParti = (S) => (partiFor = partiNokkel(S.spill));
  const tur = (S) => spillerFor(S.spill, hentParti(S).tur);
  const lager = (sp, p, i) => p.b[Kalaha.LAGER[sideFor(sp, i)]];

  let animer = null; // the move just played: { h } (the pits that got a marble pulse in order)
  let tenkId = null;
  let tenkStopp = null;
  let tenkerPa = "";
  let kaaringId = null;

  // ---------- Sounds ----------
  const lyd = {
    sa: (n) => {
      for (let k = 0; k < Math.min(n, 12); k++) R.lyd.tone(900 + ((k * 37) % 5) * 60, k * 0.075, 0.05, "sine", 0.07);
    },
    fang: () => {
      R.lyd.stoy(0, 0.2, 0.18, 900);
      R.lyd.tone(523, 0.05, 0.12, "triangle", 0.13);
      R.lyd.tone(784, 0.16, 0.2, "triangle", 0.13);
    },
    igjen: () => R.lyd.tone(988, 0, 0.15, "triangle", 0.12),
    tap: () => {
      R.lyd.tone(392, 0, 0.2, "triangle", 0.12);
      R.lyd.tone(311, 0.18, 0.4, "triangle", 0.11);
    },
  };

  // ---------- Playing ----------
  const kanSpille = (S) => {
    const sp = S.spill;
    return !!sp && !sp.ferdig && !sp.resultat && !erMaskin(sp, tur(S));
  };

  function spillHull(S, i) {
    const sp = S.spill;
    const p = hentParti(S);
    const hvem = spillerFor(sp, p.tur);
    const h = Kalaha.spill(p, i);
    if (!h) return;
    sp.trekk.push(i);
    merkParti(S);
    animer = R.rolig() ? null : { h };
    lyd.sa(h.gang.length);
    const mobil = sp.modus === "mobil";
    const n = h.gang.length;
    const nr = hullNr(sp, i);
    let linje = mobil ? (hvem === 0 ? R.t("Du tok {n} kule fra hull {nr}.|Du tok {n} kuler fra hull {nr}.", { n, nr }) : R.t("Mobilen tok {n} kule fra hull {nr}.|Mobilen tok {n} kuler fra hull {nr}.", { n, nr })) : R.t("{navn} tok {n} kule fra hull {nr}.|{navn} tok {n} kuler fra hull {nr}.", { navn: navn(sp, hvem), n, nr });
    if (h.tatt) {
      setTimeout(lyd.fang, Math.min(n, 12) * 75);
      R.vibrer([20, 40, 30]);
      linje += " " + R.t("Fangst! {n} kuler i kalahaen.", { n: h.tatt.antall });
    } else if (h.igjen) {
      setTimeout(lyd.igjen, Math.min(n, 12) * 75);
      R.vibrer([10, 30, 10]);
      linje += " " + R.t("Siste kule i kalahaen – en tur til!");
    } else R.vibrer(8);
    if (p.slutt) {
      avsluttRunde(S, p);
      linje += " " + resultatLinje(S);
    } else if (!erMaskin(sp, spillerFor(sp, p.tur))) {
      const neste = spillerFor(sp, p.tur);
      if (!h.igjen) linje += " " + (mobil ? R.t("Din tur.") : R.t("{navn} sin tur.", { navn: navn(sp, neste) }));
    }
    R.si(linje);
    R.vis();
    if (!p.slutt) startTenking(S, h.igjen);
  }

  function resultatLinje(S) {
    const sp = S.spill;
    const r = sp.resultat;
    if (!r) return "";
    const tall = `${r.lager[0]}–${r.lager[1]}`;
    if (r.vinner == null) return R.t("Uavgjort, {tall}!", { tall });
    return sp.modus === "mobil" ? (r.vinner === 0 ? R.t("Du vinner {tall}!", { tall }) : R.t("Mobilen vinner {tall}!", { tall })) : R.t("{navn} vinner {tall}!", { navn: navn(sp, r.vinner), tall });
  }

  function avsluttRunde(S, p) {
    const sp = S.spill;
    stoppTenking();
    const l = [lager(sp, p, 0), lager(sp, p, 1)];
    const vinner = l[0] === l[1] ? null : l[0] > l[1] ? 0 : 1;
    sp.resultat = { vinner, lager: l };
    telRekord(S, vinner, 1);
    if (sp.modus === "mobil" && vinner === 0) R.merke("klassiker-samannen");
    const fortsatt = R.vakt();
    const id = sp.id;
    setTimeout(() => fortsatt() && R.S.spill && R.S.spill.id === id && R.S.spill.resultat && feir(R.S), R.rolig() ? 100 : 1100);
    tilKaaringOm(S, 3200);
  }
  function feir(S) {
    const sp = S.spill;
    const v = sp.resultat.vinner;
    if (v == null) return R.lyd.pling();
    if (sp.modus === "mobil" && v === 1) return lyd.tap();
    R.lyd.fanfare();
    R.vibrer([40, 60, 120]);
    R.konfetti(v === 0 ? ["--rosa", "--papir", "--lampe"] : ["--himmel", "--papir", "--mynte"]);
  }
  function telRekord(S, vinner, d) {
    const sp = S.spill;
    if (sp.modus !== "mobil") return;
    const r = S.rekord[sp.niva] || (S.rekord[sp.niva] = { seier: 0, uavgjort: 0, tap: 0 });
    const felt = vinner == null ? "uavgjort" : vinner === 0 ? "seier" : "tap";
    r[felt] = Math.max(0, r[felt] + d);
  }
  function tilKaaringOm(S, ms) {
    clearTimeout(kaaringId);
    const fortsatt = R.vakt();
    const id = S.spill.id;
    kaaringId = setTimeout(() => {
      kaaringId = null;
      const sp = R.S.spill;
      if (fortsatt() && sp && sp.id === id && !sp.ferdig && sp.resultat && R.S.skjerm === "spill" && !R.arkApent()) avsluttKamp(R.S);
    }, R.rolig() ? Math.min(ms, 1500) : ms);
  }
  function avsluttKamp(S) {
    const sp = S.spill;
    clearTimeout(kaaringId);
    stoppTenking();
    sp.ferdig = true;
    parti = null;
    R.statistikk("ferdig", { modus: sp.modus, niva: sp.modus === "mobil" ? sp.niva : 0, kuler: sp.kuler, vinner: sp.resultat ? (sp.resultat.vinner == null ? -1 : sp.resultat.vinner) : -2 });
    R.gaTil("slutt");
  }

  // ---------- The phone's turn ----------
  function startTenking(S, igjen) {
    const sp = S.spill;
    if (!sp || sp.ferdig || sp.resultat || S.skjerm !== "spill" || !erMaskin(sp, tur(S))) return;
    const nokkel = partiNokkel(sp);
    if ((tenkStopp || tenkId) && tenkerPa === nokkel) return;
    stoppTenking();
    tenkerPa = nokkel;
    const fortsatt = R.vakt();
    const gjelder = () => fortsatt() && R.S.spill && !R.S.spill.resultat && partiNokkel(R.S.spill) === nokkel;
    // Let the marbles of the last move land before the phone moves again.
    const forrige = hentParti(S).hist;
    const sa = forrige.length ? Math.min(forrige[forrige.length - 1].gang.length, 14) * 80 : 0;
    const vent = (igjen ? IGJEN_TENK : MIN_TENK) + (R.rolig() ? 0 : sa);
    const start = performance.now();
    tenkStopp = Motor.tenk(Kalaha.spillUt(sp.kuler, sp.trekk), { niva: sp.niva }, (i) => {
      tenkStopp = null;
      if (!gjelder()) return;
      const spillNaa = () => {
        tenkId = null;
        if (!gjelder()) return;
        if (R.arkApent()) {
          tenkId = setTimeout(spillNaa, 300);
          return;
        }
        tenkerPa = "";
        if (i >= 0) spillHull(R.S, i);
      };
      tenkId = setTimeout(spillNaa, Math.max(0, vent - (performance.now() - start)));
    });
  }
  function stoppTenking() {
    if (tenkStopp) tenkStopp();
    tenkStopp = null;
    clearTimeout(tenkId);
    tenkId = null;
    tenkerPa = "";
  }

  // «Angre»: two players one move; against the phone back to before your own last move.
  function angreAntall(S) {
    const sp = S.spill;
    const p = hentParti(S);
    const n = p.hist.length;
    if (!n) return 0;
    if (sp.modus !== "mobil") return 1;
    const meg = sideFor(sp, 0);
    for (let k = n - 1; k >= 0; k--) if (p.hist[k].s === meg) return n - k;
    return 0;
  }

  // ---------- Markup ----------
  // Player 0's side is always near (left column and the bottom store when upright; the bottom row
  // and the right store on a phone on its side): the board turns half a round when player 0 has
  // side 1. A pit's number counts 1–6 in sowing order for its owner.
  const plass = (sp, i) => (sideFor(sp, 0) === 0 ? i : (i + 7) % 14);
  const hullNr = (sp, i) => (i % 7) + 1;
  // Grid places: [row, column] upright (2 columns, 8 rows) and lying (8 columns, 2 rows).
  function rute(slot) {
    if (slot < 6) return { st: [slot + 2, 1], li: [2, slot + 2] };
    if (slot === 6) return { st: [8, "1 / span 2"], li: ["1 / span 2", 8] };
    if (slot < 13) return { st: [14 - slot, 2], li: [1, 14 - slot] };
    return { st: [1, "1 / span 2"], li: ["1 / span 2", 1] };
  }
  // The marbles in a pit: up to 15 drawn (a little scattered, the same every time), then the number.
  const FARGER = ["#ff4f8b", "#ffd23f", "#59b9ff", "#3de3b0", "#b48cff", "#ff8a3d"];
  // A small pile (CSS wraps them): the colours follow the marble's place, so a pile only grows.
  function kulerHtml(n, stor) {
    const vis = Math.min(n, stor ? 30 : 15);
    const ut = [];
    for (let k = 0; k < vis; k++) ut.push(`<i style="--k:${FARGER[(k * 5 + 2) % 6]}"></i>`);
    return `<span class="sa-kuler" aria-hidden="true">${ut.join("")}</span>`;
  }

  function brettHtml(S, o) {
    const sp = S.spill;
    const p = hentParti(S);
    const fri = o.interaktiv && kanSpille(S);
    const lov = new Set(fri ? Kalaha.lovlige(p) : []);
    const h = o.interaktiv && animer ? animer.h : null;
    const fikk = new Map(); // pit → the order its first marble came in
    if (h) h.gang.forEach((k, nr) => !fikk.has(k) && fikk.set(k, nr));
    const sist = p.hist.length ? p.hist[p.hist.length - 1] : null;
    const deler = [];
    for (let i = 0; i < 14; i++) {
      const slot = plass(sp, i);
      const { st, li } = rute(slot);
      const side = Kalaha.eier(i);
      const erLager = side < 0;
      const eierSide = erLager ? (i === 6 ? 0 : 1) : side;
      const spiller = spillerFor(sp, eierSide);
      const n = p.b[i];
      const kl = ["sa-hull", KLASSE[spiller]];
      if (erLager) kl.push("lager");
      if (lov.has(i)) kl.push("kan");
      if (fikk.has(i)) kl.push("fikk");
      if (h && h.i === i) kl.push("tomt");
      if (h && h.tatt && (h.tatt.fra === i || h.gang[h.gang.length - 1] === i)) kl.push("fanget");
      if (sist && sist.i === i && !h) kl.push("sist");
      const stil = `--sr:${st[0]};--sk:${st[1]};--lr:${li[0]};--lk:${li[1]};--nr:${fikk.has(i) ? fikk.get(i) : 0}`;
      const innhold = `${kulerHtml(n, erLager)}<b class="sa-tall">${n}</b>`;
      if (erLager) {
        const etikett = R.t("Kalahaen til {navn}: {n} kule|Kalahaen til {navn}: {n} kuler", { navn: navn(sp, spiller), n });
        deler.push(`<div class="${kl.join(" ")}" style="${stil}" data-v="${i}" role="img" aria-label="${esc(etikett)}">${innhold}</div>`);
      } else if (o.interaktiv) {
        const nr = hullNr(sp, i);
        const etikett = R.t("Hull {nr} til {navn}: {n} kule|Hull {nr} til {navn}: {n} kuler", { nr, navn: navn(sp, spiller), n }) + (lov.has(i) ? ", " + R.t("kan velges") : "");
        deler.push(`<button class="${kl.join(" ")}" style="${stil}" data-h="hull" data-v="${i}" data-stille${lov.has(i) ? "" : ' aria-disabled="true"'} aria-label="${esc(etikett)}">${innhold}</button>`);
      } else deler.push(`<span class="${kl.join(" ")}" style="${stil}">${innhold}</span>`);
    }
    if (o.interaktiv) animer = null;
    const stempel = o.stempel ? `<span class="sa-stempel" aria-hidden="true"><span class="stempel ${o.stempel.klasse}">${esc(o.stempel.tekst)}</span></span>` : "";
    return `<div class="sa-brett${fri ? " fri" : ""}"${o.interaktiv ? ` role="group" aria-label="${esc(R.t("Brettet"))}"` : ' aria-hidden="true"'}>${deler.join("")}${stempel}</div>`;
  }

  function poengHtml(S) {
    const sp = S.spill;
    const p = hentParti(S);
    const naa = sp.resultat ? -1 : tur(S);
    const kort = (i) => `<div class="sa-spiller ${KLASSE[i]}${naa === i ? " aktiv" : ""}${sp.resultat && sp.resultat.vinner === i ? " vant" : ""}">
        <span class="sa-merke" aria-hidden="true">${erMaskin(sp, i) ? `<span class="sa-maskin">${R.figur()}</span>` : R.avatar(i)}</span>
        <b class="sa-navn">${esc(navn(sp, i))}</b>
      </div>`;
    const tekst = R.t("I kalahaen: {a} {pa}, {b} {pb}.", { a: navn(sp, 0), pa: lager(sp, p, 0), b: navn(sp, 1), pb: lager(sp, p, 1) });
    return `<div class="sa-stilling" role="group" aria-label="${esc(tekst)}">
      ${kort(0)}
      <div class="sa-tall-stilling" aria-hidden="true"><b class="rosa">${lager(sp, p, 0)}</b><span>–</span><b class="bla">${lager(sp, p, 1)}</b></div>
      ${kort(1)}
    </div>`;
  }

  function meldingHtml(S) {
    const sp = S.spill;
    if (sp.resultat) {
      const v = sp.resultat.vinner;
      return `<p class="sa-melding ${v == null ? "remis" : "vinner"}"><span>${esc(resultatLinje(S))}</span></p>`;
    }
    const p = hentParti(S);
    const i = tur(S);
    const sist = p.hist.length ? p.hist[p.hist.length - 1] : null;
    const igjen = sist && sist.igjen;
    const fangst = sist && sist.tatt;
    let tekst;
    let klasse = "";
    if (erMaskin(sp, i)) tekst = `<span class="sa-tenker">${esc(igjen ? R.t("Mobilen får en tur til") : sist ? R.t("Mobilen tenker") : R.t("Mobilen begynner"))}<i>.</i><i>.</i><i>.</i></span>`;
    else if (igjen) {
      klasse = " igjen";
      tekst = esc(sp.modus === "mobil" ? R.t("I kalahaen – en tur til!") : R.t("I kalahaen – {navn} får en tur til!", { navn: navn(sp, i) }));
    } else if (fangst && sist.s !== sideFor(sp, i)) {
      klasse = " fangst";
      const hvem = spillerFor(sp, sist.s);
      tekst = esc(sp.modus === "mobil" ? R.t("Mobilen fanget {n} – din tur", { n: fangst.antall }) : R.t("{navn} fanget {n} – {neste} sin tur", { navn: navn(sp, hvem), n: fangst.antall, neste: navn(sp, i) }));
    } else if (sp.modus === "mobil") tekst = esc(sist ? R.t("Din tur – velg et hull") : R.t("Du begynner – velg et hull"));
    else tekst = esc(R.t("{navn} sin tur", { navn: navn(sp, i) }));
    return `<p class="sa-melding ${KLASSE[i]}${klasse}"><span class="sa-meldingsmerke" aria-hidden="true">${erMaskin(sp, i) ? `<span class="sa-maskin">${R.figur()}</span>` : R.avatar(i)}</span><span>${tekst}</span></p>`;
  }

  // ---------- Board size ----------
  // Upright the board is two columns of pits between the stores; lying (and on wide screens) it is
  // the classic long board.
  const LIGGENDE = "(min-width: 900px) and (min-aspect-ratio: 5/4), (orientation: landscape) and (max-height: 600px) and (min-width: 560px)";
  function tilpass() {
    const brett = R.$(".skjerm-spill .sa-brett");
    if (!brett) return;
    const ramme = brett.parentElement;
    const ligg = window.matchMedia && window.matchMedia(LIGGENDE).matches;
    brett.classList.toggle("ligg", !!ligg);
    if (ligg) {
      brett.style.height = "";
      let b = Math.min(ramme.clientWidth, 760);
      brett.style.width = b + "px";
      for (let k = 0; k < 3; k++) {
        const over = document.documentElement.scrollHeight - window.innerHeight;
        if (over <= 0 || b <= 360) break;
        b = Math.max(360, Math.floor(b - (over * 8) / 2.75));
        brett.style.width = b + "px";
      }
      return;
    }
    // Upright: as tall as the screen allows (8 rows), at most 1.9 × the width.
    const bredde = Math.min(ramme.clientWidth, 420);
    brett.style.width = bredde + "px";
    let hoyde = Math.round(bredde * 1.9);
    brett.style.height = hoyde + "px";
    for (let k = 0; k < 3; k++) {
      const over = document.documentElement.scrollHeight - window.innerHeight;
      if (over <= 0 || hoyde <= 270) break;
      hoyde = Math.max(270, Math.floor(hoyde - over));
      brett.style.height = hoyde + "px";
    }
  }
  let tilpassId = null;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(tilpassId);
    tilpassId = requestAnimationFrame(() => R.S && R.S.skjerm === "spill" && tilpass());
  });

  // ---------- Setup and flow ----------
  function nyttSpill(S) {
    const o = S.oppsett;
    const starter = o.starter === 1 ? 1 : 0;
    o.starter = 1 - starter; // the next game is opened by the other one, unless changed
    S.spill = { id: R.nyttFro() % 1e9, modus: o.modus, niva: o.niva, kuler: o.kuler, starter, trekk: [], resultat: null, ferdig: false, registrert: false };
    nullstillVisning();
    R.statistikk("start", { modus: o.modus, niva: o.modus === "mobil" ? o.niva : 0, kuler: o.kuler });
  }
  function nullstillVisning() {
    parti = null;
    animer = null;
    stoppTenking();
    clearTimeout(kaaringId);
  }
  function rekordHtml(S, niva) {
    const r = S.rekord[niva];
    if (!r || !(r.seier + r.uavgjort + r.tap)) return "";
    return `<span><b>${r.seier}</b> ${esc(R.t("seier|seirer", { n: r.seier }))}</span><span><b>${r.uavgjort}</b> ${esc(R.t("uavgjort|uavgjort", { n: r.uavgjort }))}</span><span><b>${r.tap}</b> ${esc(R.t("tap|tap", { n: r.tap }))}</span>`;
  }
  const IKON = '<span class="sa-knappeikon" aria-hidden="true"><i></i><i></i><i></i></span>';

  function stempelFor(sp) {
    const r = sp.resultat;
    const tall = `${r.lager[0]}–${r.lager[1]}`;
    if (r.vinner == null) return { tekst: R.t("Uavgjort {tall}", { tall }), klasse: "lampe" };
    return { tekst: tall, klasse: "aksent" };
  }

  function delTekst(sp) {
    const r = sp.resultat;
    const tall = `${r.lager[0]}–${r.lager[1]}`;
    if (sp.modus === "mobil") {
      const niva = NIVANAVN[sp.niva].toLowerCase();
      if (r.vinner === 0) return R.t("Jeg slo mobilen {tall} i kalaha på {niva}! Klarer du det?", { tall, niva });
      if (r.vinner == null) return R.t("Uavgjort {tall} mot mobilen i kalaha på {niva}. Klarer du bedre?", { tall, niva });
      return R.t("Mobilen slo meg {tall} i kalaha på {niva}. Klarer du bedre?", { tall, niva });
    }
    if (r.vinner == null) return R.t("Uavgjort {tall} i kalaha!", { tall });
    return R.t("{navn} vant {tall} i kalaha!", { navn: R.kutt(navn(sp, r.vinner), 16), tall });
  }

  R.start({
    id: "samannen",
    versjon: 1,
    pagar,

    tilstand: () => ({
      antall: 2,
      oppsett: { modus: "mobil", niva: 2, kuler: 4, starter: 0 },
      spill: null,
      rekord: {},
      sist: null,
    }),

    lastet(S) {
      const o = (S.oppsett = Object.assign({ modus: "mobil", niva: 2, kuler: 4, starter: 0 }, S.oppsett));
      if (!["mobil", "to"].includes(o.modus)) o.modus = "mobil";
      if (!NIVAER.includes(o.niva)) o.niva = 2;
      if (!Kalaha.KULER.includes(o.kuler)) o.kuler = 4;
      o.starter = o.starter === 1 ? 1 : 0;
      S.antall = 2;
      if (!S.rekord || typeof S.rekord !== "object") S.rekord = {};
      if (S.sist && !(Array.isArray(S.sist.lager) && typeof S.sist.tekst === "string")) S.sist = null;
      const sp = S.spill;
      if (sp) {
        const p = Array.isArray(sp.trekk) && [0, 1].includes(sp.starter) && ["mobil", "to"].includes(sp.modus) && NIVAER.includes(sp.niva) ? Kalaha.spillUt(sp.kuler, sp.trekk) : null;
        if (!p) S.spill = null;
        else if (p.slutt && !sp.resultat) {
          const l = [lager(sp, p, 0), lager(sp, p, 1)];
          sp.resultat = { vinner: l[0] === l[1] ? null : l[0] > l[1] ? 0 : 1, lager: l };
        } else if (!p.slutt) {
          sp.resultat = null;
          sp.ferdig = false;
        }
      }
      if (!S.spill && ["spill", "slutt"].includes(S.skjerm)) S.skjerm = "hjem";
      if (S.spill && S.skjerm === "slutt" && !S.spill.ferdig) S.skjerm = "spill";
      if (S.spill && S.skjerm === "spill" && S.spill.ferdig) S.skjerm = "slutt";
    },

    regler: {
      intro: R.t("Kalaha: Flytt kuler rundt brettet og samle flest i kalahaen din – den store gropa på din side."),
      steg: [
        [R.t("Velg et hull"), R.t("Ta alle kulene i et av dine seks hull. Legg én kule i hvert hull etter det, mot klokka – også i din egen kalaha, men aldri i motstanderens.")],
        [R.t("Tur til eller fangst"), R.t("Havner den siste kula i kalahaen din, får du en tur til. Havner den i et tomt hull på din side, tar du den og alle kulene i hullet rett overfor.")],
        [R.t("Flest vinner"), R.t("Når den ene siden er tom, tar hver av dere kulene som er igjen på egen side. Flest kuler i kalahaen vinner.")],
      ],
      tips: [
        R.t("Tell kulene: Har et hull like mange kuler som det er hull igjen til kalahaen, får du en tur til."),
        R.t("Pass på hullene dine som står tomme – og hullene til motstanderen rett overfor."),
        R.t("Velg 6 kuler i hvert hull for et lengre og mer uforutsigbart spill."),
        R.t("Dere bytter på å begynne. Trykket feil? «Angre» tar tilbake trekket."),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const sp = S.spill;
          const aktiv = pagar(S);
          const rek = NIVAER.map((n) => [n, rekordHtml(S, n)]).filter(([, h]) => h);
          let fort = "";
          if (aktiv) {
            const p = Kalaha.spillUt(sp.kuler, sp.trekk);
            fort = R.t("Fortsett · {stilling}", { stilling: `${lager(sp, p, 0)}–${lager(sp, p, 1)}` });
          }
          return (
            R.ui.spillhjem({
              slagordHtml: `${esc(R.t("Én kule i hvert hull –"))}<br><em>${esc(R.t("og flest i kalahaen vinner!"))}</em>`,
              knapperHtml: R.ui.startKnapper({ pagar: aktiv, fortsettTekst: fort, ekstraHtml: R.ui.lenke(R.t("Slik spiller du"), "regler") }),
              merker: [
                ["1–2", R.t("spillere")],
                ["3", R.t("nivåer")],
                ["0", R.t("reklame")],
              ],
            }) +
            (S.sist ? `<p class="sa-sist"><span class="etikett">${esc(R.t("Sist"))}</span> ${esc(S.sist.tekst)} <b>${S.sist.lager[0]}–${S.sist.lager[1]}</b></p>` : "") +
            (rek.length ? `<section class="sa-rekorder" aria-label="${esc(R.t("Mot mobilen"))}"><p class="etikett">${esc(R.t("Mot mobilen"))}</p><ul>${rek.map(([n, h]) => `<li><b class="sa-niva">${esc(NIVANAVN[n])}</b>${h}</li>`).join("")}</ul></section>` : "")
          );
        },
        inn: () => R.slippVaken(),
      },

      oppsett: {
        tittel: R.t("Nytt spill"),
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          const mot = o.modus === "mobil";
          const hvem = mot ? [[0, R.t("Du")], [1, R.t("Mobilen")]] : [[0, R.kutt(R.navn(0), 14)], [1, R.kutt(R.navn(1), 14)]];
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
            <section class="seksjon">
              <h2>${esc(R.t("Hvordan vil du spille?"))}</h2>
              ${R.ui.fliser(
                "modus",
                [
                  { v: "mobil", ikon: "🤖", tittel: R.t("Mot mobilen"), tekst: R.t("Tre nivåer") },
                  { v: "to", ikon: "👥", tittel: R.t("To spillere"), tekst: R.t("På samme mobil") },
                ],
                o.modus,
              )}
            </section>
            ${
              mot
                ? `<section class="seksjon">
                    <h2>${esc(R.t("Hvor flink er mobilen?"))}</h2>
                    ${R.ui.seg("niva", NIVAER.map((n) => [n, NIVANAVN[n]]), o.niva, { etikett: R.t("Nivå") })}
                    <p class="hjelp">${esc(NIVATEKST[o.niva])}</p>
                  </section>`
                : R.ui.spillere({ min: 2, max: 2, tittel: R.t("Spillerne") })
            }
            <section class="seksjon">
              <h2>${esc(R.t("Kuler i hvert hull"))}</h2>
              ${R.ui.seg("kuler", Kalaha.KULER.map((n) => [n, R.t("{n} kuler", { n })]), o.kuler, { etikett: R.t("Kuler i hvert hull") })}
              <p class="hjelp">${esc(o.kuler === 4 ? R.t("Fire kuler: et raskt spill på et par minutter.") : R.t("Seks kuler: lengre spill og store fangster."))}</p>
            </section>
            <section class="seksjon">
              <h2>${esc(R.t("Hvem begynner?"))}</h2>
              ${R.ui.seg("starter", hvem, o.starter, { etikett: R.t("Hvem begynner") })}
              <p class="hjelp">${esc(mot ? R.t("Du og mobilen bytter på å begynne.") : R.t("Dere bytter på å begynne."))}</p>
            </section>
            ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start", { variant: "stor", ikon: IKON }))}`;
        },
      },

      spill: {
        tittel: (S) => (S.spill.modus === "mobil" ? R.t("Mot mobilen") : R.t("To spillere")),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const ferdig = !!sp.resultat;
          const kanAngre = angreAntall(S) > 0 && !ferdig;
          const tittel = R.t("Kalaha") + ": " + (ferdig ? R.t("spillet er ferdig") : erMaskin(sp, tur(S)) ? R.t("mobilen sin tur") : sp.modus === "mobil" ? R.t("din tur") : R.t("{navn} sin tur", { navn: navn(sp, tur(S)) }));
          return `
            <h1 class="vh" id="skjerm-tittel">${esc(tittel)}</h1>
            ${poengHtml(S)}
            ${meldingHtml(S)}
            <span class="sa-luft" aria-hidden="true"></span>
            <div class="sa-brettramme">${brettHtml(S, { interaktiv: true, stempel: ferdig ? stempelFor(sp) : null })}</div>
            <span class="sa-luft under" aria-hidden="true"></span>
            ${R.ui.dokk(
              ferdig ? R.ui.knapp(R.t("Se kåringen"), "kaaring", { ikon: "🏆" }) : "",
              R.ui.lenkerad(`<button class="lenke" data-h="angre"${kanAngre ? "" : " disabled"}>↶ ${esc(R.t("Angre"))}</button>`, R.ui.lenke(R.t("Avslutt"), "avslutt")),
            )}`;
        },
        etter() {
          tilpass();
        },
        inn(S) {
          if (!S.spill) return R.gaTil("hjem");
          R.holdVaken();
          startTenking(S);
          if (S.spill.resultat) tilKaaringOm(S, 1800);
        },
        ut() {
          stoppTenking();
          clearTimeout(kaaringId);
          animer = null;
        },
      },

      slutt: {
        tittel: R.t("Kåringen"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.resultat || { vinner: null, lager: [0, 0] };
          const rader = [0, 1].map((i) => ({ navn: navn(sp, i), i, poeng: r.lager[i] }));
          const v = r.vinner;
          let tittel;
          if (!sp.resultat) tittel = R.t("Ingen vinner denne gangen");
          else if (v == null) tittel = R.t("Uavgjort!");
          else if (sp.modus === "mobil") tittel = v === 0 ? R.t("Du vinner!") : R.t("Mobilen vinner!");
          else tittel = R.t("{navn} vinner!", { navn: navn(sp, v) });
          const etikett = R.t("{n} kuler i hvert hull", { n: sp.kuler });
          const figur = v != null && !(sp.modus === "mobil" && v === 1) ? `<span class="sa-vinner">${R.avatar(v, "gigant")}<span class="sa-kroneemoji" aria-hidden="true">👑</span></span>` : R.figur();
          const tekst = sp.modus === "mobil" && v === 1 ? (sp.niva > 1 ? R.t("Godt kjempa! Tips: Se etter hull som gir en tur til.") : R.t("Godt kjempa! Prøv igjen.")) : "";
          let rekord = "";
          if (sp.modus === "mobil") {
            const rek = rekordHtml(S, sp.niva);
            rekord = rek ? `<p class="sa-rekordlinje"><span class="etikett">${esc(R.t("Mot mobilen"))} · ${esc(NIVANAVN[sp.niva].toLowerCase())}</span>${rek}</p>` : "";
          }
          return `
            <div class="banner ${sp.modus === "mobil" && v === 1 ? "" : "aksent"}">
              ${figur}
              <p class="etikett">${esc(etikett)}</p>
              <h1 id="skjerm-tittel">${esc(tittel)}</h1>
              ${tekst ? `<p class="ingress">${esc(tekst)}</p>` : ""}
            </div>
            ${R.ui.poengliste(rader)}
            ${rekord}
            ${sp.resultat ? `<div class="sa-del">${R.ui.knapp2(R.t("Del resultatet"), "del", { ikon: "📣" })}</div>` : ""}
            ${R.ui.flereSpill({ antall: sp.modus === "to" ? 2 : 1 })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen", { ikon: IKON }), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "nytt"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
        },
        inn(S) {
          const sp = S.spill;
          if (!sp) return R.gaTil("hjem");
          const r = sp.resultat;
          if (r && !sp.registrert) {
            sp.registrert = true;
            if (sp.modus === "to") R.kveld.registrer([0, 1].map((i) => ({ i, poeng: r.lager[i] })));
            const hvem = sp.modus === "mobil" ? R.t("Du mot mobilen ({niva})", { niva: NIVANAVN[sp.niva].toLowerCase() }) : R.t("{a} mot {b}", { a: R.kutt(navn(sp, 0), 14), b: R.kutt(navn(sp, 1), 14) });
            S.sist = { tekst: hvem, lager: r.lager.slice() };
            R.lagre();
          }
          if (r && r.vinner != null && !(sp.modus === "mobil" && r.vinner === 1)) {
            R.lyd.fanfare();
            R.vibrer([40, 60, 120]);
            R.konfetti();
          } else if (r && sp.modus === "mobil" && r.vinner === 1) lyd.tap();
          else R.lyd.pling();
          R.slippVaken();
        },
      },
    },

    handlinger: (H = {
      async nytt(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(pagar(S), !!S.spill && S.spill.modus === "mobil")) || !fortsatt()) return;
        R.gaTil("oppsett");
      },
      fortsett(el, e, S) {
        if (S.spill) R.gaTil(S.spill.ferdig ? "slutt" : "spill");
      },
      modus(el, e, S) {
        S.oppsett.modus = el.dataset.v === "to" ? "to" : "mobil";
        R.vis();
      },
      niva(el, e, S) {
        S.oppsett.niva = R.klamp(Number(el.dataset.v) || 2, 1, 3);
        R.vis();
      },
      kuler(el, e, S) {
        const n = Number(el.dataset.v);
        S.oppsett.kuler = Kalaha.KULER.includes(n) ? n : 4;
        R.vis();
      },
      starter(el, e, S) {
        S.oppsett.starter = el.dataset.v === "1" ? 1 : 0;
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
      kaaring(el, e, S) {
        if (S.spill && !S.spill.ferdig && S.spill.resultat) avsluttKamp(S);
      },
      hull(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.ferdig || sp.resultat) return;
        if (!kanSpille(S)) {
          R.toast(R.t("Vent litt – mobilen tenker"));
          return;
        }
        const i = Number(el.dataset.v);
        const p = hentParti(S);
        if (!Kalaha.lovlige(p).includes(i)) {
          R.lyd.feil();
          R.vibrer(30);
          R.toast(Kalaha.eier(i) !== p.tur ? R.t("Det hullet er ikke ditt – velg et på din side") : R.t("Det hullet er tomt"));
          el.classList.remove("risting");
          void el.offsetWidth;
          el.classList.add("risting");
          return;
        }
        spillHull(S, i);
      },
      angre(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.ferdig || sp.resultat) return;
        const n = angreAntall(S);
        if (n <= 0) return;
        stoppTenking();
        const p = hentParti(S);
        for (let k = 0; k < n; k++) {
          Kalaha.tilbake(p);
          sp.trekk.pop();
        }
        merkParti(S);
        animer = null;
        R.lyd.snu();
        R.toast(n >= 2 ? R.t("Angret – din tur igjen") : R.t("Angret"));
        R.vis();
        startTenking(S);
      },
      del(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.resultat) return;
        const r = sp.resultat;
        const linjer = [`${r.lager[0]}–${r.lager[1]}`, sp.modus === "mobil" ? R.t("Mot mobilen · {niva}", { niva: NIVANAVN[sp.niva].toLowerCase() }) : `${R.kutt(navn(sp, 0), 16)} – ${R.kutt(navn(sp, 1), 16)}`, R.t("{n} kuler i hvert hull", { n: sp.kuler })];
        R.del(R.app.navn, delTekst(sp), ADRESSE, { kort: { tittel: R.app.navn, linjer } });
      },
      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.ferdig) return;
        const fortsatt = R.vakt();
        stoppTenking();
        const ja = await R.bekreft(R.t("Avslutte spillet?"), R.t("Spillet som er i gang, teller ikke. Dere kan alltid starte et nytt."), R.t("Avslutt"), R.t("Spill videre"));
        if (!fortsatt() || S.spill !== sp || sp.ferdig) return;
        if (!ja) return startTenking(S);
        S.spill = null;
        nullstillVisning();
        R.gaTil("hjem");
      },
    }),
  });
})();
