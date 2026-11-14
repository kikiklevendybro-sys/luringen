/* Makkeren — Amerikaner, the Norwegian trick-taking game with bidding: you and three phone players.
   The rules follow the well-documented four-player game without a kitty (pagat.com, «Amerikaner»,
   variant «No kitty»): 13 cards each; from the left of the dealer everyone may bid how many tricks
   (7–13) they will take together with a partner, or pass for the rest of the bidding; «Amerikaner»
   is the highest bid: all 13 tricks alone, without trumps. The highest bidder («spillfører») names
   the trump suit and asks for a card of that suit he does not hold; whoever holds it is his
   «makker» for the round and must play it in the first trick, which the spillfører opens with a
   trump. So every round is two against two – you plus a phone partner against two phone opponents,
   or you and another phone against the bidding pair.
   Follow suit if you can; otherwise play anything; the highest trump wins, else the highest card of
   the suit led. Points: the spillfører and makker each get the bid if they take that many tricks
   together, or lose it; every other player gets one point per trick. Amerikaner: ±52. All pass: a
   new deal. The first to 52 after a round ends the match; the highest score wins.
   The rules (Amerikaner) and the phone players (Mobil) are pure functions at the top;
   test/makkeren.test.mjs loads this file without the kit. */
(function () {
  "use strict";

  // ---------- Playing cards ----------
  // The same card look in Kortkongen, Vri åtter, Bussen and Pyramiden (copied, the games share no files).
  // A card is 0–51: suit = floor(k / 13) (0 spar, 1 hjerter, 2 ruter, 3 kløver), value = k % 13 + 1.
  const KORT = (() => {
    const SORTER = [
      { navn: "spar", rod: false },
      { navn: "hjerter", rod: true },
      { navn: "ruter", rod: true },
      { navn: "kløver", rod: false }, // sprak-ok (not shown in this game)
    ];
    const BOKSTAV = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
    const VERDINAVN = ["", "ess", "2", "3", "4", "5", "6", "7", "8", "9", "10", "knekt", "dame", "konge"];
    // «en 7-er», «et ess», «en dame»: for questions like «Har noen en 7-er?»
    // Suit outlines in a 100 × 100 box. Every part runs clockwise, so they fill the same everywhere.
    const FORM = [
      "M50 6C62 24 92 38 92 62C92 76 81 84 70 84C62 84 56 80 53 74C54 83 58 89 66 95L34 95C42 89 46 83 47 74C44 80 38 84 30 84C19 84 8 76 8 62C8 38 38 24 50 6Z",
      "M50 90C47 87 8 62 8 34C8 19 19 9 32 9C40 9 46 13 50 20C54 13 60 9 68 9C81 9 92 19 92 34C92 62 53 87 50 90Z",
      "M50 5C58 20 70 36 86 50C70 64 58 80 50 95C42 80 30 64 14 50C30 36 42 20 50 5Z",
      "M31 29A19 19 0 1 1 69 29A19 19 0 1 1 31 29ZM10 59A19 19 0 1 1 48 59A19 19 0 1 1 10 59ZM52 59A19 19 0 1 1 90 59A19 19 0 1 1 52 59ZM38 40L62 40L62 64L38 64ZM46 62L54 62C54 78 58 87 67 95L33 95C42 87 46 78 46 62Z",
    ];
    const ROD = "#dc2440";
    const SVART = "#1b1230";
    const BLEKK = "#1b1230";
    const sortAv = (k) => (k / 13) | 0;
    const verdiAv = (k) => (k % 13) + 1;
    const erRod = (k) => SORTER[sortAv(k)].rod;
    const farge = (k) => (erRod(k) ? ROD : SVART);
    const navn = (k) => `${SORTER[sortAv(k)].navn} ${VERDINAVN[verdiAv(k)]}`;
    const Navn = (k) => navn(k).charAt(0).toUpperCase() + navn(k).slice(1);

    // A suit symbol of size str with its top-left corner at (x, y); upside down when snu.
    const symbol = (s, x, y, str, snu) =>
      `<path d="${FORM[s]}" transform="${snu ? `rotate(180 ${x + str / 2} ${y + str / 2}) ` : ""}translate(${x} ${y}) scale(${str / 100})"/>`;

    // Court portraits in a 100 × 100 box: konge (crown and beard), dame (hair and tiara), knekt (cap and feather).
    function portrett(v, f) {
      const strek = `stroke="${BLEKK}" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"`;
      const gull = "#ffc93c";
      const kropp = `<path d="M13 100C13 80 30 70 50 70C70 70 87 80 87 100Z" fill="${f}" ${strek}/><path d="M42 72L50 84L58 72" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
      const hode = `<circle cx="50" cy="50" r="20" fill="#ffd9b6" ${strek}/>`;
      const ansikt = `<circle cx="43" cy="49" r="2.7" fill="${BLEKK}"/><circle cx="57" cy="49" r="2.7" fill="${BLEKK}"/><circle cx="38.5" cy="56" r="3.6" fill="#ff7f97" opacity=".55"/><circle cx="61.5" cy="56" r="3.6" fill="#ff7f97" opacity=".55"/>`;
      const smil = `<path d="M44.5 57.5Q50 62.5 55.5 57.5" fill="none" stroke="${BLEKK}" stroke-width="2.6" stroke-linecap="round"/>`;
      if (v === 13)
        return `${kropp}${hode}<path d="M33 55C33 71 42 79 50 79C58 79 67 71 67 55C63 62 57 64 50 64C43 64 37 62 33 55Z" fill="${f}" ${strek}/>${ansikt}<path d="M44 58Q50 61 56 58" fill="none" stroke="${BLEKK}" stroke-width="2.6" stroke-linecap="round"/><path d="M30 35L31 14L41 25L50 9L59 25L69 14L70 35Z" fill="${gull}" ${strek}/><circle cx="50" cy="27" r="3" fill="#fff"/>`;
      if (v === 12)
        return `<path d="M27 54C25 31 35 22 50 22C65 22 75 31 73 54C73 66 77 73 82 80L18 80C23 73 27 66 27 54Z" fill="${f}" ${strek}/>${kropp}${hode}${ansikt}${smil}<path d="M35 33L39 22L45 29L50 17L55 29L61 22L65 33Z" fill="${gull}" ${strek}/>`;
      return `${kropp}${hode}${ansikt}${smil}<path d="M28 42C26 27 38 21 51 21C65 21 76 27 76 39C67 33 42 34 28 42Z" fill="${f}" ${strek}/><path d="M65 27C70 15 80 9 92 6C89 16 82 25 70 31Z" fill="${gull}" ${strek}/>`;
    }

    // Classic positions of the pips (centres in a 100 × 140 card); pips below the middle are upside down.
    const PL = 35;
    const PM = 50;
    const PH = 65;
    const PIPS = {
      2: [[PM, 30], [PM, 110]],
      3: [[PM, 30], [PM, 70], [PM, 110]],
      4: [[PL, 30], [PH, 30], [PL, 110], [PH, 110]],
      5: [[PL, 30], [PH, 30], [PM, 70], [PL, 110], [PH, 110]],
      6: [[PL, 30], [PH, 30], [PL, 70], [PH, 70], [PL, 110], [PH, 110]],
      7: [[PL, 30], [PH, 30], [PM, 50], [PL, 70], [PH, 70], [PL, 110], [PH, 110]],
      8: [[PL, 30], [PH, 30], [PM, 50], [PL, 70], [PH, 70], [PM, 90], [PL, 110], [PH, 110]],
      9: [[PL, 30], [PH, 30], [PL, 56.7], [PH, 56.7], [PM, 70], [PL, 83.3], [PH, 83.3], [PL, 110], [PH, 110]],
      10: [[PL, 30], [PH, 30], [PM, 43.3], [PL, 56.7], [PH, 56.7], [PL, 83.3], [PH, 83.3], [PM, 96.7], [PL, 110], [PH, 110]],
    };

    const cache = {};
    function svg(k, stor) {
      const nokkel = (stor ? "s" : "l") + k;
      if (cache[nokkel]) return cache[nokkel];
      const s = sortAv(k);
      const v = verdiAv(k);
      const f = farge(k);
      const b = BOKSTAV[v];
      let inni = "";
      if (stor) {
        const hjorne = `<text x="12" y="22" text-anchor="middle" font-size="${v === 10 ? 16 : 19}" letter-spacing="${v === 10 ? -1.4 : 0}">${b}</text>${symbol(s, 5.5, 26, 13)}`;
        inni = `<g fill="${f}">${hjorne}<g transform="rotate(180 50 70)">${hjorne}</g>`;
        if (v === 1) inni += symbol(s, 24, 44, 52);
        else if (v <= 10) inni += PIPS[v].map(([x, y]) => symbol(s, x - 8, y - 8, 16, y > 70)).join("");
        inni += "</g>";
        if (v > 10)
          inni += `<rect x="23" y="12" width="54" height="116" rx="7" fill="${f}" fill-opacity=".07" stroke="${f}" stroke-width="1.6"/><g fill="${f}">${symbol(s, 27, 16, 10)}${symbol(s, 63, 114, 10, true)}</g><g transform="translate(20 40) scale(.6)">${portrett(v, f)}</g>`;
      } else {
        inni = `<g fill="${f}"><text x="${v === 10 ? 5 : 8}" y="35" font-size="37" letter-spacing="${v === 10 ? -2.5 : 0}">${b}</text>${symbol(s, 65, 9, 26)}`;
        if (v === 1) inni += symbol(s, 20, 50, 60);
        else if (v <= 10) inni += symbol(s, 27, 58, 46);
        inni += "</g>";
        if (v > 10) inni += `<g transform="translate(17 52) scale(.66)">${portrett(v, f)}</g>`;
      }
      cache[nokkel] = `<svg class="sk-ansikt" viewBox="0 0 100 140" aria-hidden="true" focusable="false">${inni}</svg>`;
      return cache[nokkel];
    }

    // The face as a standalone picture (for drawing on a canvas): paper, rim, fonts written out.
    function bilde(k, stor) {
      const inni = svg(k, stor).replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
      const s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 140" width="200" height="280"><rect x=".8" y=".8" width="98.4" height="138.4" rx="10" fill="#fffaf1" stroke="#1b1230" stroke-opacity=".22" stroke-width="1.6"/><g font-family="ui-rounded, 'SF Pro Rounded', 'Arial Rounded MT Bold', Nunito, system-ui, sans-serif" font-weight="900">${inni}</g></svg>`;
      return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s);
    }

    // o: { opp (face up), stor, klasse, stil (inline style), attr (extra attributes), tag ("span" | "button") }
    function html(k, o = {}) {
      const tag = o.tag || "span";
      return `<${tag} class="sk-kort${o.stor ? " sk-stor" : ""}${o.opp ? " sk-opp" : ""}${o.klasse ? " " + o.klasse : ""}"${o.stil ? ` style="${o.stil}"` : ""}${o.attr || ""}><span class="sk-indre"><span class="sk-side sk-bak"></span><span class="sk-side sk-for">${k == null ? "" : svg(k, o.stor)}</span></span></${tag}>`;
    }

    return { SORTER, BOKSTAV, VERDINAVN, FORM, ROD, SVART, sortAv, verdiAv, erRod, farge, navn, Navn, svg, bilde, html, symbol };
  })();

  // ---------- Rules ----------
  // Seats: 0 you (bottom), 1 left, 2 across (top), 3 right; play goes 0 → 1 → 2 → 3.
  // A round: { giver, hender, fase ("melding" | "velg" | "spill" | "ferdig"), tur, meldinger:
  //   [{ p, bud }] (0 = pass, 7–13, 14 = Amerikaner), passet: [bool], hoyest: { p, bud } | null,
  //   spillforer, bud, trumf (suit or null), spurt (the card asked for, or null), makker (its holder;
  //   shown when it is played), avslort, stikk: [{ p, k }], spilt: [{ kort, vinner }], tatt:
  //   [tricks per seat], stikkNr, resultat }

  const Amerikaner = (() => {
    const sortAv = (k) => (k / 13) | 0;
    const verdiAv = (k) => (k % 13) + 1;
    const rang = (k) => (verdiAv(k) === 1 ? 14 : verdiAv(k)); // the ace is high
    const MIN_BUD = 7;
    const AMERIKANER = 14;
    const gyldig = (k) => Number.isInteger(k) && k >= 0 && k < 52;

    function bland(liste, rng) {
      const a = liste.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }
    function nyRunde(o, rng) {
      const giver = (((o.giver | 0) % 4) + 4) % 4;
      const stokk = bland(Array.from({ length: 52 }, (_, i) => i), rng);
      const hender = [[], [], [], []];
      for (let c = 0; c < 52; c++) hender[(giver + 1 + c) % 4].push(stokk[c]);
      return { giver, hender, fase: "melding", tur: (giver + 1) % 4, meldinger: [], passet: [false, false, false, false], hoyest: null, spillforer: null, bud: null, trumf: null, spurt: null, makker: null, avslort: false, stikk: [], spilt: [], tatt: [0, 0, 0, 0], stikkNr: 0, resultat: null };
    }

    // ---- Bidding ----
    const minBud = (r) => (r.hoyest ? r.hoyest.bud + 1 : MIN_BUD);
    // The bids p may make now (0 = pass).
    function lovligeBud(r, p) {
      if (r.fase !== "melding" || r.tur !== p || r.passet[p]) return [];
      const ut = [0];
      for (let b = minBud(r); b <= AMERIKANER; b++) ut.push(b);
      return ut;
    }
    function meld(r, p, bud) {
      if (!lovligeBud(r, p).includes(bud)) return false;
      r.meldinger.push({ p, bud });
      if (bud === 0) r.passet[p] = true;
      else r.hoyest = { p, bud };
      const igjen = [0, 1, 2, 3].filter((q) => !r.passet[q]);
      if (!r.hoyest && !igjen.length) {
        r.fase = "omgjort"; // everybody passed: a new deal
        return true;
      }
      if (r.hoyest && (r.hoyest.bud === AMERIKANER || (igjen.length === 1 && igjen[0] === r.hoyest.p))) {
        r.spillforer = r.hoyest.p;
        r.bud = r.hoyest.bud;
        if (r.bud === AMERIKANER) {
          r.trumf = null;
          r.spurt = null;
          r.makker = null;
          r.fase = "spill";
          r.tur = r.spillforer;
        } else {
          r.fase = "velg";
          r.tur = r.spillforer;
        }
        return true;
      }
      let q = (p + 1) % 4;
      while (r.passet[q]) q = (q + 1) % 4;
      r.tur = q;
      return true;
    }

    // ---- The spillfører names the trump and the card asked for ----
    // The cards of a suit p does not hold (the ones that may be asked for), highest first.
    const kanSporres = (r, p, s) => {
      const ut = [];
      for (let k = s * 13; k < s * 13 + 13; k++) if (!r.hender[p].includes(k)) ut.push(k);
      return ut.sort((a, b) => rang(b) - rang(a));
    };
    const kanVelgeTrumf = (r, p, s) => r.hender[p].some((k) => sortAv(k) === s) && kanSporres(r, p, s).length > 0;
    function velg(r, p, trumf, spurt) {
      if (r.fase !== "velg" || p !== r.spillforer || !kanVelgeTrumf(r, p, trumf) || !kanSporres(r, p, trumf).includes(spurt)) return false;
      r.trumf = trumf;
      r.spurt = spurt;
      r.makker = r.hender.findIndex((h) => h.includes(spurt));
      r.fase = "spill";
      r.tur = p;
      return true;
    }

    // ---- Play ----
    function lovlige(r, p) {
      if (r.fase !== "spill" || r.tur !== p) return [];
      const hand = r.hender[p];
      if (!r.stikk.length) {
        // The spillfører opens the first trick with a trump (the suit of the card asked for).
        if (r.stikkNr === 0 && r.trumf != null) return hand.filter((k) => sortAv(k) === r.trumf);
        return hand.slice();
      }
      if (r.stikkNr === 0 && r.spurt != null && hand.includes(r.spurt)) return [r.spurt];
      const ledet = sortAv(r.stikk[0].k);
      const folg = hand.filter((k) => sortAv(k) === ledet);
      return folg.length ? folg : hand.slice();
    }
    // Who takes a trick: the highest trump, else the highest card of the suit led.
    function vinnerAv(stikk, trumf) {
      const ledet = sortAv(stikk[0].k);
      let v = stikk[0];
      const sterk = (x) => (trumf != null && sortAv(x.k) === trumf ? 100 : sortAv(x.k) === ledet ? 0 : -100) + rang(x.k);
      for (const s of stikk) if (sterk(s) > sterk(v)) v = s;
      return v.p;
    }
    function legg(r, p, k) {
      if (!lovlige(r, p).includes(k)) return false;
      r.hender[p].splice(r.hender[p].indexOf(k), 1);
      r.stikk.push({ p, k });
      if (k === r.spurt) r.avslort = true;
      if (r.stikk.length < 4) {
        r.tur = (p + 1) % 4;
        return true;
      }
      const v = vinnerAv(r.stikk, r.trumf);
      r.tatt[v]++;
      r.spilt.push({ kort: r.stikk.slice(), vinner: v });
      r.stikk = [];
      r.stikkNr++;
      r.tur = v;
      if (r.stikkNr === 13) {
        r.fase = "ferdig";
        r.resultat = oppgjor(r);
      }
      return true;
    }
    // The pair that bid (spillfører and makker; the spillfører alone in Amerikaner).
    const angripere = (r) => (r.makker == null || r.makker === r.spillforer ? [r.spillforer] : [r.spillforer, r.makker]);
    function oppgjor(r) {
      const lag = angripere(r);
      const stikk = lag.reduce((s, p) => s + r.tatt[p], 0);
      const amerikaner = r.bud === AMERIKANER;
      const klart = amerikaner ? r.tatt[r.spillforer] === 13 : stikk >= r.bud;
      const poeng = [0, 1, 2, 3].map((p) => (lag.includes(p) ? (amerikaner ? (klart ? 52 : -52) : klart ? r.bud : -r.bud) : r.tatt[p]));
      return { klart, stikk, lag, poeng };
    }

    // Every card exactly once (for checking a restored round).
    function hel(r) {
      if (!r || !Array.isArray(r.hender) || r.hender.length !== 4 || !Array.isArray(r.stikk) || !Array.isArray(r.spilt) || !Array.isArray(r.tatt) || r.tatt.length !== 4) return false;
      if (!["melding", "velg", "spill", "ferdig", "omgjort"].includes(r.fase) || !Number.isInteger(r.tur) || r.tur < 0 || r.tur > 3) return false;
      const alle = [].concat(...r.hender, r.stikk.map((s) => s && s.k), ...r.spilt.map((t) => t.kort.map((x) => x.k)));
      if (alle.length !== 52 || new Set(alle).size !== 52 || !alle.every(gyldig)) return false;
      if (r.fase === "spill" || r.fase === "ferdig") return r.spillforer != null && Number.isInteger(r.bud) && (r.bud === AMERIKANER || (r.trumf != null && r.spurt != null && r.makker >= 0));
      return true;
    }

    return { sortAv, verdiAv, rang, MIN_BUD, AMERIKANER, bland, nyRunde, minBud, lovligeBud, meld, kanSporres, kanVelgeTrumf, velg, lovlige, vinnerAv, legg, angripere, oppgjor, hel };
  })();

  // ---------- The phone players ----------
  // 1 Lett: bids on a rough count (often too high or too low), plays any legal card half the time.
  // 2 Middels: counts high cards and trump length to bid; wins tricks as cheaply as it can, does not
  //   go over its partner, trumps in when the other side is winning.
  // 3 Vanskelig: also remembers every card played and who is out of a suit, knows which cards are
  //   the highest left, draws trumps as the bidding side and leads its sure winners.
  // Only what a player at the table can know is used: its own hand, the bids and the cards played.

  const Mobil = (() => {
    const A = Amerikaner;
    const { sortAv, rang } = A;

    // Tricks a hand can expect to take with suit s as trumps (null: no trumps).
    function styrke(hand, s) {
      const per = [[], [], [], []];
      for (const k of hand) per[sortAv(k)].push(rang(k));
      let t = 0;
      for (let f = 0; f < 4; f++) {
        const l = per[f].sort((a, b) => b - a);
        const n = l.length;
        if (l.includes(14)) t += 1;
        if (l.includes(13)) t += n >= 2 ? 0.8 : 0.3;
        if (l.includes(12)) t += n >= 3 ? 0.45 : 0.15;
        if (f === s) {
          if (l.includes(11)) t += 0.3;
          t += Math.max(0, n - 3) * 0.9;
        } else if (s != null && per[s].length >= 3) {
          if (n === 0) t += 0.8;
          else if (n === 1) t += 0.4;
        }
      }
      return t;
    }
    function besteTrumf(hand) {
      let best = 0;
      let bestV = -Infinity;
      for (let s = 0; s < 4; s++) {
        if (!hand.some((k) => sortAv(k) === s)) continue;
        const v = styrke(hand, s) + hand.filter((k) => sortAv(k) === s).length * 0.05;
        if (v > bestV) {
          bestV = v;
          best = s;
        }
      }
      return { trumf: best, tricks: bestV };
    }
    // The bid: what the hand and an average partner (about two and a half tricks) can take.
    function velgBud(r, p, niva, rng) {
      rng = rng || Math.random;
      const lov = A.lovligeBud(r, p);
      if (lov.length <= 1) return 0;
      const { tricks } = besteTrumf(r.hender[p]);
      const makker = niva >= 3 ? 2.6 : 2.4;
      let anslag = tricks + makker;
      if (niva <= 1) anslag += (rng() - 0.5) * 3;
      else if (niva === 2) anslag -= 0.2;
      // Amerikaner: only a hand that can take everything on its own without trumps.
      if (niva >= 2 && styrke(r.hender[p], null) >= 12.5 && lov.includes(A.AMERIKANER)) return A.AMERIKANER;
      const maks = Math.min(13, Math.floor(anslag));
      if (maks < A.minBud(r)) return 0;
      // Middels and Vanskelig say what they think they can take (the bid is what they score);
      // Lett goes up a step at a time.
      return niva <= 1 ? A.minBud(r) : maks;
    }
    function velgTrumfOgKort(r, p) {
      const hand = r.hender[p];
      let { trumf } = besteTrumf(hand);
      if (!A.kanVelgeTrumf(r, p, trumf)) trumf = [0, 1, 2, 3].find((s) => A.kanVelgeTrumf(r, p, s));
      return { trumf, spurt: A.kanSporres(r, p, trumf)[0] };
    }

    // What p knows: the cards played (by whom), who has shown out of which suit.
    function kunnskap(r) {
      const ute = new Set();
      const tom = [new Set(), new Set(), new Set(), new Set()];
      for (const t of r.spilt.concat(r.stikk.length ? [{ kort: r.stikk }] : [])) {
        const ledet = sortAv(t.kort[0].k);
        for (const x of t.kort) {
          ute.add(x.k);
          if (sortAv(x.k) !== ledet) tom[x.p].add(ledet);
        }
      }
      return { ute, tom };
    }
    // Is q on p's side, as far as p can know?
    function venn(r, p, q) {
      if (q === p) return true;
      const lag = A.angripere(r);
      const pAngriper = p === r.spillforer || p === r.makker;
      if (r.avslort || r.bud === A.AMERIKANER) return lag.includes(q) === pAngriper;
      if (p === r.makker) return q === r.spillforer; // the makker knows from the start
      if (p === r.spillforer) return false; // does not know the makker yet
      return false; // a defender does not know the other defender before the card is shown
    }
    // The highest card of a suit not yet played and not in p's hand (null: none left out there).
    function hoyesteIgjen(r, p, s, ute) {
      for (let v = 14; v >= 2; v--) {
        const k = s * 13 + (v === 14 ? 0 : v - 1);
        if (!ute.has(k) && !r.hender[p].includes(k)) return k;
      }
      return null;
    }
    const lavest = (l) => l.reduce((a, b) => (rang(b) < rang(a) ? b : a));
    const hoyest = (l) => l.reduce((a, b) => (rang(b) > rang(a) ? b : a));

    function velgKort(r, p, niva, rng) {
      rng = rng || Math.random;
      const lov = A.lovlige(r, p);
      if (lov.length <= 1) return lov[0];
      if (niva <= 1 && rng() < 0.5) return lov[Math.floor(rng() * lov.length)];
      const kj = niva >= 3 ? kunnskap(r) : { ute: new Set(r.spilt.flatMap((t) => t.kort.map((x) => x.k))), tom: [new Set(), new Set(), new Set(), new Set()] };
      const hand = r.hender[p];
      const T = r.trumf;
      const erTrumf = (k) => T != null && sortAv(k) === T;
      const angriper = p === r.spillforer || (p === r.makker && r.bud !== A.AMERIKANER);
      // A card that will surely win when led: the highest left of its suit (and trumps are gone, or it is a trump).
      const sikker = (k) => {
        const s = sortAv(k);
        const hoy = hoyesteIgjen(r, p, s, kj.ute);
        if (hoy != null && rang(hoy) > rang(k)) return false;
        if (erTrumf(k) || T == null) return true;
        // Somebody out of this suit may trump it.
        const trumfUte = hoyesteIgjen(r, p, T, kj.ute) != null;
        return niva >= 3 ? !trumfUte || ![0, 1, 2, 3].some((q) => q !== p && kj.tom[q].has(s) && !venn(r, p, q)) : rang(k) === 14;
      };
      // Throw away: the lowest card of the shortest side suit, never a trump if anything else will do.
      const kast = (liste) => {
        const ikkeT = liste.filter((k) => !erTrumf(k));
        const fra = ikkeT.length ? ikkeT : liste;
        const antall = [0, 0, 0, 0];
        for (const k of hand) antall[sortAv(k)]++;
        return fra.reduce((a, b) => (antall[sortAv(b)] < antall[sortAv(a)] || (antall[sortAv(b)] === antall[sortAv(a)] && rang(b) < rang(a)) ? b : a));
      };

      if (!r.stikk.length) {
        // The first lead of the spillfører: a low trump, so the makker's card can take it.
        if (r.stikkNr === 0 && T != null) return niva >= 2 ? lavest(lov) : lov[Math.floor(rng() * lov.length)];
        const sikre = lov.filter(sikker);
        // The bidding side draws trumps while the others may still have some.
        if (angriper && T != null && niva >= 3) {
          const mine = lov.filter(erTrumf);
          const trumfUte = hoyesteIgjen(r, p, T, kj.ute) != null;
          if (mine.length >= 2 && trumfUte) return sikre.find(erTrumf) || lavest(mine);
        }
        if (sikre.length) return niva >= 3 ? sikre.find((k) => !erTrumf(k)) || sikre[0] : sikre[0];
        return kast(lov);
      }
      const ledet = sortAv(r.stikk[0].k);
      const vinner = A.vinnerAv(r.stikk, T);
      const vinnerKort = r.stikk.find((x) => x.p === vinner).k;
      const sist = r.stikk.length === 3;
      const slaar = (k) => A.vinnerAv(r.stikk.concat({ p, k }), T) === p;
      const vinnende = lov.filter(slaar);
      if (venn(r, p, vinner)) {
        // The partner is winning: stay under it (unless it can still be beaten and we can do better).
        const trygg = sist || (niva >= 3 && (erTrumf(vinnerKort) ? hoyesteIgjen(r, p, T, kj.ute) == null || rang(hoyesteIgjen(r, p, T, kj.ute)) < rang(vinnerKort) : sikker(vinnerKort)));
        if (trygg || !vinnende.length) return sortAv(lov[0]) === ledet ? lavest(lov) : kast(lov);
      }
      if (vinnende.length) {
        if (sist) return lavest(vinnende);
        // Not last: the cheapest card that is sure to hold, else the cheapest that wins now.
        const holder = niva >= 3 ? vinnende.filter((k) => sikker(k) || erTrumf(k)) : vinnende;
        return lavest(holder.length ? holder : vinnende);
      }
      return sortAv(lov[0]) === ledet ? lavest(lov) : kast(lov);
    }

    return { styrke, besteTrumf, velgBud, velgTrumfOgKort, velgKort, venn, kunnskap };
  })();

  const R = window.Rusj;
  if (!R) {
    window.Makkeren = { Amerikaner, Mobil, KORT };
    return;
  }

  // ---------- The game on the page ----------

  const esc = R.esc;
  const { sortAv, verdiAv, rang, AMERIKANER } = Amerikaner;
  const NIVANAVN = { 1: R.t("Lett"), 2: R.t("Middels"), 3: R.t("Vanskelig") };
  const NIVATEKST = {
    1: R.t("Mobilene melder på magefølelsen og legger ofte et tilfeldig kort. Fint for å lære."),
    2: R.t("Mobilene teller honnører og trumf, og tar stikk så billig de kan."),
    3: R.t("Mobilene husker hvert kort, trekker trumf og vet hvilke kort som er høyest igjen."),
  };
  const MAL = [["26", R.t("Til 26")], ["52", R.t("Til 52")]];
  const MAL_TEKST = {
    26: R.t("En kort kamp: når noen har 26 poeng etter en runde, vinner den med flest."),
    52: R.t("Vanlig lengde: når noen har 52 poeng etter en runde, vinner den med flest."),
  };
  const VERDIORD = ["", R.t("ess"), R.t("to"), R.t("tre"), R.t("fire"), R.t("fem"), R.t("seks"), R.t("sju"), R.t("åtte"), R.t("ni"), R.t("ti"), R.t("knekt"), R.t("dame"), R.t("konge")];
  const FARGENAVN = [R.t("spar"), R.t("hjerter"), R.t("ruter"), R.t("kløver")];
  const FARGE_EN = [R.t("en spar"), R.t("en hjerter"), R.t("en ruter"), R.t("en kløver")];
  const SYMBOL = ["♠", "♥", "♦", "♣"];
  const kortnavn = (k) => R.t("{farge} {verdi}", { farge: FARGENAVN[sortAv(k)], verdi: VERDIORD[verdiAv(k)] });
  const budTekst = (b) => (b === 0 ? R.t("Pass") : b === AMERIKANER ? R.t("Amerikaner") : String(b));
  const FART = { kort: 750, stikk: 1300, start: 900, melding: 800 };
  const DEL_URL = (document.querySelector('link[rel="canonical"]') || { href: "https://rusj.no/makkeren/" }).href;
  const MERKE = "klassiker-makkeren";
  let H;

  // S.spill: { niva, mal, runde, poeng [per seat], r, lagt, ferdig, valg: { trumf, spurt } (your own
  //   choice while you name the trump), registrert }
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const navn = (p) => (p === 0 ? R.t("Du") : R.t("Mobil {n}", { n: p }));
  const avatarNr = (p) => (p === 0 ? 0 : 9 + p);
  const rundeFerdig = (sp) => sp.r.fase === "ferdig";
  const kampFerdig = (sp) => sp.lagt && sp.poeng.some((x) => x >= Number(sp.mal));
  const vinnere = (sp) => {
    const hoy = Math.max(...sp.poeng);
    return sp.poeng.map((x, p) => (x === hoy ? p : -1)).filter((p) => p >= 0);
  };
  const rng = () => R.rng(R.nyttFro());
  const poengTekst = (n) => R.flertall(Math.abs(n), "poeng", "poeng");

  const lyd = {
    legg: () => {
      R.lyd.tone(520, 0, 0.06, "triangle", 0.1);
      R.lyd.stoy(0, 0.08, 0.14, 2400);
    },
    stikk: () => R.lyd.stoy(0, 0.16, 0.1, 900),
    trumf: () => R.lyd.tone(330, 0, 0.14, "triangle", 0.1, 440),
    bud: () => R.lyd.tone(700, 0, 0.08, "sine", 0.07),
  };

  // ---------- The finished trick stays on the table for a moment ----------
  let pause = null;
  let pauseId = null;
  function startPause(r) {
    pause = { nr: r.spilt.length, til: performance.now() + FART.stikk };
    clearTimeout(pauseId);
    pauseId = setTimeout(() => {
      pauseId = null;
      pause = null;
      const S = R.S;
      if (S && S.skjerm === "spill" && S.spill) {
        R.vis();
        planleggMobil();
      }
    }, FART.stikk);
  }
  const visPause = (sp) => pause && pause.nr === sp.r.spilt.length && sp.r.spilt.length > 0;

  // ---------- Texts ----------

  const kontraktTekst = (r) => (r.bud === AMERIKANER ? R.t("{navn}: Amerikaner – alle 13 stikk alene", { navn: navn(r.spillforer) }) : R.t("{navn}: {bud} stikk, {farge} er trumf", { navn: navn(r.spillforer), bud: r.bud, farge: FARGENAVN[r.trumf] }));
  function makkerTekst(r) {
    if (r.bud === AMERIKANER) return "";
    if (r.avslort) return r.makker === 0 ? R.t("Du er makker.") : R.t("Makker: {navn}", { navn: navn(r.makker) });
    if (r.makker === 0) return R.t("Du har {kort} – du er makker! Det vet ingen ennå.", { kort: kortnavn(r.spurt) });
    return R.t("Spør etter {kort}", { kort: kortnavn(r.spurt) });
  }
  function meldingTekst(sp) {
    const r = sp.r;
    if (r.fase === "melding") {
      if (r.tur !== 0) return R.t("{navn} melder …", { navn: navn(r.tur) });
      return r.hoyest ? R.t("Din tur å melde. Høyest nå: {bud} ({navn}).", { bud: budTekst(r.hoyest.bud), navn: navn(r.hoyest.p) }) : R.t("Din tur å melde: hvor mange stikk tar du med en makker?");
    }
    if (r.fase === "velg") return r.spillforer === 0 ? R.t("Du fikk meldingen! Velg trumf og kortet du spør etter.") : R.t("{navn} velger trumf …", { navn: navn(r.spillforer) });
    if (r.tur !== 0) return R.t("{navn} tenker …", { navn: navn(r.tur) });
    const lov = Amerikaner.lovlige(r, 0);
    if (!r.stikk.length) return r.stikkNr === 0 && r.trumf != null ? R.t("Spill ut en trumf – {farge}.", { farge: FARGENAVN[r.trumf] }) : R.t("Din tur – spill ut et kort.");
    if (r.stikkNr === 0 && lov.length === 1 && lov[0] === r.spurt) return R.t("Du må legge {kort} – nå ser alle at du er makker.", { kort: kortnavn(r.spurt) });
    const ledet = sortAv(r.stikk[0].k);
    if (lov.some((k) => sortAv(k) === ledet)) return R.t("Legg {farge}.", { farge: FARGE_EN[ledet] });
    return r.trumf != null && lov.some((k) => sortAv(k) === r.trumf) ? R.t("Du har ingen {farge} – trumf, eller kast et kort.", { farge: FARGENAVN[ledet] }) : R.t("Du har ingen {farge} – kast et kort.", { farge: FARGENAVN[ledet] });
  }
  function sistTekst(sp) {
    const r = sp.r;
    if (r.fase === "melding") {
      const m = r.meldinger[r.meldinger.length - 1];
      return m ? (m.bud ? R.t("{navn} meldte {bud}.", { navn: navn(m.p), bud: budTekst(m.bud) }) : R.t("{navn} passet.", { navn: navn(m.p) })) : R.t("{navn} delte ut. {neste} melder først.", { navn: navn(r.giver), neste: navn((r.giver + 1) % 4) });
    }
    const t = r.spilt[r.spilt.length - 1];
    if (!t || (r.stikk.length && !visPause(sp))) return r.fase === "spill" || r.fase === "velg" ? "" : "";
    return t.vinner === 0 ? R.t("Du tok stikket.") : R.t("{navn} tok stikket.", { navn: navn(t.vinner) });
  }

  // ---------- Flow ----------

  function nyKamp(S) {
    const o = S.oppsett;
    S.spill = { niva: o.niva, mal: o.mal, runde: 0, giver: Math.floor(Math.random() * 4), poeng: [0, 0, 0, 0], r: null, lagt: false, ferdig: false, valg: null, registrert: false, omgjort: 0 };
    nyRunde(S);
    R.statistikk("start", { niva: o.niva, mal: o.mal });
  }
  function nyRunde(S) {
    const sp = S.spill;
    sp.r = Amerikaner.nyRunde({ giver: (sp.giver + sp.runde + sp.omgjort) % 4 }, rng());
    sp.runde++;
    sp.lagt = false;
    sp.valg = null;
    pause = null;
  }
  // Everybody passed: a new deal by the next dealer (the round number stays).
  function omgjor(S) {
    const sp = S.spill;
    sp.omgjort++;
    sp.runde--;
    nyRunde(S);
    R.toast(R.t("Alle passet – nye kort!"));
  }
  function etterKort(S) {
    const sp = S.spill;
    const r = sp.r;
    if (!rundeFerdig(sp) || sp.lagt) return;
    sp.lagt = true;
    r.resultat.poeng.forEach((x, p) => (sp.poeng[p] += x));
    if (kampFerdig(sp)) {
      const v = vinnere(sp);
      const rek = S.rekord[sp.niva] || (S.rekord[sp.niva] = { seier: 0, tap: 0 });
      if (v.includes(0)) {
        rek.seier++;
        R.merke(MERKE);
      } else rek.tap++;
    }
  }
  function avsluttKamp(S) {
    const sp = S.spill;
    stoppMobil();
    sp.ferdig = true;
    R.statistikk("ferdig", { niva: sp.niva, mal: sp.mal, runder: sp.runde - (sp.lagt ? 0 : 1) });
    R.gaTil("slutt");
  }

  // ---------- The phone players' turns ----------
  let mobilId = null;
  function stoppMobil() {
    clearTimeout(mobilId);
    mobilId = null;
  }
  const mobilensTur = (r) => (r.fase === "melding" || r.fase === "velg" || r.fase === "spill") && (r.fase === "velg" ? r.spillforer !== 0 : r.tur !== 0);
  function planleggMobil(ms) {
    const S = R.S;
    const sp = S && S.spill;
    if (mobilId || !sp || sp.ferdig || S.skjerm !== "spill" || !mobilensTur(sp.r)) return;
    const vent = pause ? Math.max(0, pause.til - performance.now()) + 200 : 0;
    mobilId = setTimeout(mobilSteg, (ms != null ? ms : sp.r.fase === "spill" ? FART.kort : FART.melding) + vent);
  }
  function mobilSteg() {
    mobilId = null;
    const S = R.S;
    const sp = S && S.spill;
    if (!sp || sp.ferdig || S.skjerm !== "spill" || !mobilensTur(sp.r)) return;
    if (R.arkApent() || document.hidden) return planleggMobil(500);
    if (pause && pause.til > performance.now()) return planleggMobil(0);
    const r = sp.r;
    if (r.fase === "melding") {
      const p = r.tur;
      const bud = Mobil.velgBud(r, p, sp.niva, Math.random);
      Amerikaner.meld(r, p, bud);
      lyd.bud();
      R.si(bud ? R.t("{navn} meldte {bud}.", { navn: navn(p), bud: budTekst(bud) }) : R.t("{navn} passet.", { navn: navn(p) }));
      if (r.fase === "omgjort") omgjor(S);
    } else if (r.fase === "velg") {
      const v = Mobil.velgTrumfOgKort(r, r.spillforer);
      Amerikaner.velg(r, r.spillforer, v.trumf, v.spurt);
      R.si(`${kontraktTekst(r)}. ${makkerTekst(r)}`);
    } else {
      const p = r.tur;
      spilt(sp, p, Mobil.velgKort(r, p, sp.niva, Math.random));
      etterKort(S);
    }
    R.vis();
    planleggMobil();
  }
  function spilt(sp, p, k) {
    const r = sp.r;
    const forNr = r.spilt.length;
    if (!Amerikaner.legg(r, p, k)) return false;
    if (r.trumf != null && sortAv(k) === r.trumf && r.stikk.length !== 1) lyd.trumf();
    else lyd.legg();
    if (k === r.spurt) R.si(R.t("{navn} har {kort} og er makker.", { navn: navn(p), kort: kortnavn(k) }));
    if (r.spilt.length > forNr) {
      startPause(r);
      setTimeout(lyd.stikk, FART.stikk - 250);
    }
    return true;
  }

  // ---------- Markup ----------

  const REKKE = [0, 1, 3, 2];
  const sorter = (hand, trumf) => hand.slice().sort((a, b) => (trumf != null ? (sortAv(b) === trumf) - (sortAv(a) === trumf) : 0) || REKKE.indexOf(sortAv(a)) - REKKE.indexOf(sortAv(b)) || rang(b) - rang(a));

  function rolleHtml(r, p) {
    if (r.spillforer === p) return `<span class="ma-rolle sf">${esc(r.bud === AMERIKANER ? R.t("Amerikaner") : `${r.bud ?? ""}${r.trumf != null ? " " + SYMBOL[r.trumf] : ""}`)}</span>`;
    if (r.avslort && r.makker === p) return `<span class="ma-rolle mk">${esc(R.t("Makker"))}</span>`;
    return "";
  }
  function seteHtml(sp, p, plass) {
    const r = sp.r;
    const aktiv = !visPause(sp) && ((r.fase === "melding" && r.tur === p) || (r.fase === "velg" && r.spillforer === p) || (r.fase === "spill" && r.tur === p));
    const siste = r.fase === "melding" ? [...r.meldinger].reverse().find((m) => m.p === p) : null;
    const boble = siste ? `<span class="ma-boble${siste.bud ? "" : " pass"}">${esc(budTekst(siste.bud))}</span>` : "";
    const stikk = r.fase === "spill" || r.fase === "ferdig" ? R.t("{n} stikk", { n: r.tatt[p] }) : "";
    return `<div class="ma-sete ma-${plass}${aktiv ? " aktiv" : ""}">
      <span class="ma-ava">${R.avatar(avatarNr(p))}${aktiv && p !== 0 ? '<span class="ma-tenker" aria-hidden="true"><i></i><i></i><i></i></span>' : ""}${boble}</span>
      <span class="ma-info"><b class="ma-navn">${esc(navn(p))}</b><span class="ma-tall">${esc(R.t("{n} p", { n: sp.poeng[p] }))}${stikk ? ` · ${esc(stikk)}` : ""}</span>${rolleHtml(r, p)}</span>
    </div>`;
  }
  function midtHtml(sp) {
    const r = sp.r;
    if (r.fase === "melding" || r.fase === "velg") {
      const h = r.hoyest;
      return `<div class="ma-midt ma-tavle" role="status"><span class="etikett">${esc(R.t("Høyeste melding"))}</span><b>${esc(h ? budTekst(h.bud) : "–")}</b><small>${esc(h ? navn(h.p) : R.t("ingen ennå"))}</small></div>`;
    }
    let kort = r.stikk;
    let vinner = -1;
    if (visPause(sp) || (rundeFerdig(sp) && r.spilt.length)) {
      const t = r.spilt[r.spilt.length - 1];
      kort = t.kort;
      vinner = t.vinner;
    }
    const navnet = kort.length ? kort.map((x) => R.t("{navn}: {kort}", { navn: navn(x.p), kort: kortnavn(x.k) })).join(", ") : R.t("Ingen kort på bordet");
    return `<div class="ma-midt ma-stikk${vinner >= 0 ? " samlet" : ""}" role="img" aria-label="${esc(navnet)}">
      ${kort.map((x, i) => `<span class="ma-lagt ma-p${x.p}${x.p === vinner ? " vinner" : ""}${i === 0 ? " forst" : ""}${x.k === r.spurt ? " spurt" : ""}">${KORT.html(x.k, { opp: true })}</span>`).join("")}
      ${!kort.length && r.trumf != null ? `<span class="ma-trumf${sortAv(r.spurt) === 1 || sortAv(r.spurt) === 2 ? " rod" : ""}" aria-hidden="true">${SYMBOL[r.trumf]}</span>` : ""}
    </div>`;
  }
  function kontraktHtml(sp) {
    const r = sp.r;
    if (r.fase !== "spill" && r.fase !== "ferdig") return "";
    const lag = Amerikaner.angripere(r);
    const har = lag.reduce((s, p) => s + r.tatt[p], 0);
    const mal = r.bud === AMERIKANER ? 13 : r.bud;
    return `<div class="ma-kontrakt"><span>${esc(kontraktTekst(r))}</span><span>${esc(makkerTekst(r))}</span><b>${esc(R.t("{n} av {av} stikk", { n: har, av: mal }))}</b></div>`;
  }
  function handHtml(sp) {
    const r = sp.r;
    const min = r.fase === "spill" && r.tur === 0 && !visPause(sp);
    const lov = new Set(min ? Amerikaner.lovlige(r, 0) : []);
    const hand = sorter(r.hender[0], r.trumf);
    return `<div class="ma-handramme">
      <div class="ma-hand${min ? " min-tur" : ""}" role="group" aria-label="${esc(R.t("Kortene dine"))}" style="--n:${hand.length}">${hand
        .map((k, i) => {
          const ok = lov.has(k);
          const kl = [ok && "lovlig", k === r.spurt && "spurt", r.trumf != null && sortAv(k) === r.trumf && "trumf"].filter(Boolean).join(" ");
          return `<button class="ma-hk${kl ? " " + kl : ""}" data-h="kort" data-v="${k}" aria-label="${esc(kortnavn(k))}"${ok ? "" : ' aria-disabled="true"'} style="--i:${i}">${KORT.html(k, { opp: true })}</button>`;
        })
        .join("")}</div>
    </div>`;
  }
  // The bidding panel: the numbers that may still be bid, Amerikaner and Pass.
  function budHtml(sp) {
    const r = sp.r;
    const lov = Amerikaner.lovligeBud(r, 0);
    const min = r.fase === "melding" && r.tur === 0;
    const tall = [];
    for (let b = Amerikaner.MIN_BUD; b <= 13; b++) tall.push(`<button class="ma-budknapp" data-h="meld" data-v="${b}" aria-label="${esc(R.t("Meld {n} stikk", { n: b }))}"${min && lov.includes(b) ? "" : " disabled"}>${b}</button>`);
    return `<div class="ma-bud">
        <div class="ma-budtall">${tall.join("")}</div>
        <div class="ma-budrad">
          <button class="knapp-2" data-h="meld" data-v="0"${min ? "" : " disabled"}>${esc(R.t("Pass"))}</button>
          <button class="knapp-2 ma-am" data-h="meld" data-v="${AMERIKANER}"${min && lov.includes(AMERIKANER) ? "" : " disabled"}>${esc(R.t("Amerikaner"))}</button>
        </div>
      </div>`;
  }
  // Naming the trump and the card asked for.
  function velgHtml(sp) {
    const r = sp.r;
    const v = sp.valg || {};
    const farger = [0, 1, 3, 2]
      .map((s) => `<button class="ma-farge${s === 1 || s === 2 ? " rod" : ""}" data-h="trumf" data-v="${s}" aria-pressed="${v.trumf === s}" aria-label="${esc(FARGENAVN[s])}"${Amerikaner.kanVelgeTrumf(r, 0, s) ? "" : " disabled"}><span aria-hidden="true">${SYMBOL[s]}</span><small>${esc(R.flertall(r.hender[0].filter((k) => sortAv(k) === s).length, "kort", "kort"))}</small></button>`)
      .join("");
    const kort = v.trumf != null ? Amerikaner.kanSporres(r, 0, v.trumf).slice(0, 4) : [];
    return `<div class="ma-velg">
        <p class="etikett">${esc(R.t("Trumf"))}</p>
        <div class="ma-farger">${farger}</div>
        ${kort.length ? `<p class="etikett">${esc(R.t("Spør etter"))}</p><div class="ma-spor">${kort.map((k) => `<button class="ma-sporkort" data-h="spor" data-v="${k}" aria-pressed="${v.spurt === k}" aria-label="${esc(kortnavn(k))}">${KORT.html(k, { opp: true })}</button>`).join("")}</div>` : ""}
      </div>`;
  }

  function spillHtml(S) {
    const sp = S.spill;
    const r = sp.r;
    const ferdig = rundeFerdig(sp) && !visPause(sp);
    const sist = ferdig ? "" : sistTekst(sp);
    const melding = ferdig ? (r.resultat.klart ? R.t("Meldingen holdt!") : R.t("Meldingen gikk ikke.")) : meldingTekst(sp);
    const avslutt = R.ui.lenke(R.t("Avslutt"), "avslutt");
    const siste = r.spilt.length && !ferdig ? R.ui.lenke(R.t("Siste stikk"), "siste") : "";
    let dokk;
    let panel = "";
    if (ferdig) dokk = R.ui.dokk(R.ui.knapp(R.t("Se rundens poeng"), "poeng", { ikon: "🃏" }), R.ui.lenkerad(avslutt));
    else if (r.fase === "melding") dokk = R.ui.dokk(budHtml(sp), R.ui.lenkerad(R.ui.lenke(R.t("Meldingene"), "meldinger"), avslutt));
    else if (r.fase === "velg" && r.spillforer === 0) {
      panel = velgHtml(sp);
      const v = sp.valg || {};
      dokk = R.ui.dokk(R.ui.knapp(v.spurt != null ? R.t("Spør etter {kort}", { kort: kortnavn(v.spurt) }) : R.t("Velg trumf"), "bekreft", { av: v.spurt == null }), R.ui.lenkerad(R.ui.lenke(R.t("Meldingene"), "meldinger"), avslutt));
    } else dokk = R.ui.dokk(R.ui.lenkerad(siste, R.ui.lenke(R.t("Meldingene"), "meldinger"), avslutt));
    return `
      <h1 class="vh" id="skjerm-tittel">${esc(R.t("Makkeren, runde {n}", { n: sp.runde }))}</h1>
      <div class="ma-bord${r.fase === "velg" && r.spillforer === 0 ? " velger" : ""}">
        ${seteHtml(sp, 2, "topp")}
        ${seteHtml(sp, 1, "venstre")}
        ${midtHtml(sp)}
        ${seteHtml(sp, 3, "hoyre")}
      </div>
      ${kontraktHtml(sp)}
      <div class="ma-melding${ferdig ? " ferdig" : (r.fase === "spill" && r.tur === 0) || (r.fase === "melding" && r.tur === 0) || (r.fase === "velg" && r.spillforer === 0) ? " din" : ""}" role="status">
        ${sist ? `<span class="ma-sist">${esc(sist)}</span>` : ""}
        <b>${esc(melding)}</b>
      </div>
      ${panel}
      ${handHtml(sp)}
      ${dokk}`;
  }

  function rekordHtml(S, niva) {
    const r = S.rekord[niva];
    if (!r || !(r.seier + r.tap)) return "";
    return `<span><b>${r.seier}</b> ${esc(R.t("seier|seirer", { n: r.seier }))}</span><span><b>${r.tap}</b> ${esc(R.t("tap|tap", { n: r.tap }))}</span>`;
  }

  // ---------- The hand: rows of overlapping cards that always fit ----------
  function leggUtHand() {
    for (const h of document.querySelectorAll(".ma-hand")) {
      const n = h.children.length;
      const ramme = h.parentElement;
      if (!n || !ramme) continue;
      const W = ramme.clientWidth;
      const kb = h.children[0].getBoundingClientRect().width || 56;
      const MIN = 26;
      const perRad = Math.max(1, Math.floor((W - kb) / MIN) + 1);
      const rader = Math.ceil(n / perRad);
      const iRad = Math.ceil(n / rader);
      const steg = Math.max(MIN, Math.min(kb + 6, iRad > 1 ? (W - kb) / (iRad - 1) : kb));
      h.style.setProperty("--steg", `${Math.floor(steg * 10) / 10}px`);
      h.style.setProperty("--per-rad", String(iRad));
    }
  }
  window.addEventListener("resize", () => {
    if (R.S && R.S.skjerm === "spill") leggUtHand();
  });

  // ---------- Screens ----------

  R.start({
    id: "makkeren",
    versjon: 1,
    pagar,
    _motor: { Amerikaner, Mobil },

    tilstand: () => ({ oppsett: { niva: 2, mal: "52" }, spill: null, rekord: {} }),

    lastet(S) {
      const o = (S.oppsett = Object.assign({ niva: 2, mal: "52" }, S.oppsett));
      if (![1, 2, 3].includes(o.niva)) o.niva = 2;
      if (!MAL.some(([m]) => m === o.mal)) o.mal = "52";
      if (!S.rekord || typeof S.rekord !== "object") S.rekord = {};
      const sp = S.spill;
      if (sp) {
        const ok = [1, 2, 3].includes(sp.niva) && MAL.some(([m]) => m === sp.mal) && Array.isArray(sp.poeng) && sp.poeng.length === 4 && Amerikaner.hel(sp.r) && sp.r.fase !== "omgjort";
        if (!ok) S.spill = null;
        else {
          if (!Number.isInteger(sp.omgjort)) sp.omgjort = 0;
          if (sp.valg && !(sp.r.fase === "velg" && sp.r.spillforer === 0)) sp.valg = null;
        }
      }
      if (!S.spill && ["spill", "runde", "slutt"].includes(S.skjerm)) S.skjerm = "hjem";
      if (S.spill && S.skjerm === "slutt" && !S.spill.ferdig) S.skjerm = "spill";
      if (S.spill && ["spill", "runde"].includes(S.skjerm) && S.spill.ferdig) S.skjerm = "slutt";
      if (S.spill && S.skjerm === "runde" && !rundeFerdig(S.spill)) S.skjerm = "spill";
    },

    regler: {
      intro: R.t("Amerikaner: meld hvor mange stikk du tar sammen med en makker – og finn makkeren ved å spørre etter et kort. Hver runde blir det to mot to."),
      steg: [
        [R.t("Meld"), R.t("Alle får 13 kort. Etter tur melder dere hvor mange stikk dere tar sammen med en makker – minst 7 og alltid høyere enn før – eller passer resten av runden. «Amerikaner» er høyest: alle 13 stikk alene, uten trumf.")],
        [R.t("Velg trumf og makker"), R.t("Den som melder høyest, blir spillfører, velger trumf og spør etter et trumfkort som ikke er på egen hånd – gjerne esset. Den som har kortet, blir makker og må legge det i første stikk. Spillføreren spiller ut en trumf.")],
        [R.t("Ta stikk"), R.t("Følg farge hvis du kan, ellers legg hva du vil. Høyeste trumf tar stikket, ellers høyeste kort i fargen som ble spilt ut. Den som tar stikket, spiller ut neste.")],
      ],
      tips: [
        R.t("Poeng: Klarer spillføreren og makkeren meldingen sammen, får begge det de meldte. Klarer de det ikke, mister begge like mye. De to andre får ett poeng per stikk."),
        R.t("Amerikaner gir 52 poeng – eller minus 52."),
        R.t("Passer alle, deles kortene ut på nytt."),
        R.t("Når noen har nådd målet etter en runde, vinner den med flest poeng."),
        R.t("Har du kortet det spørres etter, er du makker – men det vet ingen før du legger det."),
        R.t("Reglene følger Amerikaner for fire uten kitty: 13 kort hver og minst 7 i melding."),
        R.t("Ess er høyest, så kommer konge, dame, knekt og ned til to."),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const sp = S.spill;
          const aktiv = pagar(S);
          const rek = [1, 2, 3].map((n) => [n, rekordHtml(S, n)]).filter(([, h]) => h);
          return (
            R.ui.spillhjem({
              slagordHtml: `${esc(R.t("Meld høyt – og finn makkeren din."))}<br><em>${esc(R.t("Hver runde blir det to mot to."))}</em>`,
              knapperHtml: R.ui.startKnapper({
                pagar: aktiv,
                fortsettTekst: aktiv ? R.t("Fortsett · runde {n}", { n: sp.runde }) : "",
                ekstraHtml: R.ui.lenke(R.t("Slik spiller du"), "regler"),
              }),
              merker: [
                ["3", R.t("mobiler")],
                ["7–13", R.t("stikk i melding")],
                ["52", R.t("poeng til seier")],
              ],
            }) +
            (rek.length ? `<section class="ma-rekorder" aria-label="${esc(R.t("Mot mobilen"))}"><p class="etikett">${esc(R.t("Mot mobilen"))}</p><ul>${rek.map(([n, h]) => `<li><b class="ma-niva">${esc(NIVANAVN[n])}</b>${h}</li>`).join("")}</ul></section>` : "")
          );
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
            <section class="seksjon">
              <h2>${esc(R.t("Hvor flinke er mobilene?"))}</h2>
              ${R.ui.fliser(
                "niva",
                [
                  { v: 1, ikon: "🐣", tittel: NIVANAVN[1], tekst: NIVATEKST[1] },
                  { v: 2, ikon: "🦊", tittel: NIVANAVN[2], tekst: NIVATEKST[2] },
                  { v: 3, ikon: "🦉", tittel: NIVANAVN[3], tekst: NIVATEKST[3] },
                ],
                o.niva,
                { en: true },
              )}
            </section>
            <section class="seksjon">
              <h2>${esc(R.t("Hvor lenge?"))}</h2>
              ${R.ui.seg("mal", MAL, o.mal, { etikett: R.t("Hvor lenge?") })}
              <p class="hjelp">${esc(MAL_TEKST[o.mal])}</p>
            </section>
            ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start", { variant: "stor", ikon: "🃏" }))}`;
        },
      },

      spill: {
        tittel: (S) => (S.spill ? R.t("Runde {n}", { n: S.spill.runde }) : ""),
        tilbake: "hjem",
        vis: spillHtml,
        liggende: "bunn",
        inn(S) {
          if (!S.spill) return R.gaTil("hjem");
          R.holdVaken();
          planleggMobil(FART.start);
        },
        etter() {
          leggUtHand();
          planleggMobil();
        },
        ut() {
          stoppMobil();
          clearTimeout(pauseId);
          pauseId = null;
          pause = null;
        },
      },

      runde: {
        tittel: (S) => (S.spill ? R.t("Runde {n}", { n: S.spill.runde }) : ""),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.r;
          const res = r.resultat;
          const ferdig = kampFerdig(sp);
          const lag = res.lag;
          const mal = r.bud === AMERIKANER ? 13 : r.bud;
          let tittel;
          if (ferdig) {
            const v = vinnere(sp);
            tittel = v.length === 1 ? (v[0] === 0 ? R.t("Du vinner kampen!") : R.t("{navn} vinner kampen!", { navn: navn(v[0]) })) : R.t("{navn} deler seieren!", { navn: R.ramsOpp(v.map(navn)) });
          } else if (r.bud === AMERIKANER) tittel = res.klart ? R.t("{navn} klarte Amerikaner!", { navn: navn(r.spillforer) }) : R.t("{navn} klarte ikke Amerikaner.", { navn: navn(r.spillforer) });
          else tittel = res.klart ? R.t("{navn} klarte {n}!", { navn: R.ramsOpp(lag.map(navn)), n: r.bud }) : R.t("{navn} gikk bet med {n} av {av} stikk.", { navn: R.ramsOpp(lag.map(navn)), n: res.stikk, av: mal });
          const rad = (p) => `<li class="${lag.includes(p) ? "lag" : ""}">${R.avatar(avatarNr(p))}<b>${esc(navn(p))}</b><span class="ma-st">${esc(R.t("{n} stikk", { n: r.tatt[p] }))}</span><span class="ma-pluss${res.poeng[p] < 0 ? " minus" : ""}">${res.poeng[p] > 0 ? "+" : ""}${res.poeng[p]}</span><span class="ma-tot">${sp.poeng[p]}</span></li>`;
          return `
            <h1 id="skjerm-tittel" class="ma-rundetittel">${esc(tittel)}</h1>
            <p class="ma-mal">${esc(kontraktTekst(r))}${r.makker != null && r.bud !== AMERIKANER ? ` · ${esc(R.t("Makker: {navn}", { navn: navn(r.makker) }))}` : ""}</p>
            <ul class="ma-resultat" aria-label="${esc(R.t("Poeng etter runden"))}">${[0, 1, 2, 3].map(rad).join("")}</ul>
            <p class="hjelp ma-forklar">${esc(R.t("Først til {n} poeng", { n: sp.mal }))}</p>
            ${R.ui.dokk(ferdig ? R.ui.knapp(R.t("Se kåringen"), "kaaring", { ikon: "🏆" }) : R.ui.knapp(R.t("Ny runde"), "ny-runde", { ikon: "🃏" }), R.ui.lenkerad(R.ui.lenke(R.t("Avslutt"), "avslutt")))}`;
        },
        inn(S) {
          const sp = S.spill;
          if (!sp || !rundeFerdig(sp)) return R.gaTil(sp ? "spill" : "hjem");
          R.slippVaken();
          const res = sp.r.resultat;
          if (kampFerdig(sp) && vinnere(sp).includes(0)) {
            R.lyd.fanfare();
            R.konfetti();
          } else if (res.poeng[0] > 0) R.lyd.riktig();
          else R.lyd.pling();
        },
      },

      slutt: {
        tittel: R.t("Kåringen"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const v = sp.poeng.some((x) => x !== 0) ? vinnere(sp) : [];
          const duVant = v.includes(0);
          let tittel;
          if (!v.length) tittel = R.t("Ingen vinner denne gangen");
          else if (v.length === 1) tittel = duVant ? R.t("Du vinner!") : R.t("{navn} vinner!", { navn: navn(v[0]) });
          else tittel = R.t("{navn} vinner!|{navn} vinner!", { navn: R.ramsOpp(v.map(navn)), n: v.length });
          const runder = sp.runde - (sp.lagt ? 0 : 1);
          const etikett = `${R.flertall(runder, "runde", "runder")} · ${NIVANAVN[sp.niva].toLowerCase()}`;
          const tekst = duVant ? R.t("Godt jobba! Du meldte og spilte best.") : v.length ? R.t("Godt kjempa! Neste gang holder meldingen.") : "";
          const rader = [0, 1, 2, 3].map((p) => ({ navn: navn(p), i: avatarNr(p), poeng: sp.poeng[p] }));
          const rek = rekordHtml(S, sp.niva);
          return `
            ${R.ui.banner({ tittel, etikett, tekst, stemning: v.length && !duVant ? "lei" : v.length ? "jubel" : "" })}
            ${R.ui.pall(rader)}
            ${R.ui.poengliste(rader)}
            ${rek ? `<p class="ma-rekordlinje"><span class="etikett">${esc(R.t("Mot mobilen"))} · ${esc(NIVANAVN[sp.niva].toLowerCase())}</span>${rek}</p>` : ""}
            ${R.ui.flereSpill({ antall: 1 })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen", { ikon: "🃏" }), R.ui.lenkerad(R.ui.lenke(R.t("Del resultatet"), "del"), R.ui.lenke(R.t("Endre oppsett"), "nytt"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
        },
        inn(S) {
          const sp = S.spill;
          if (!sp) return R.gaTil("hjem");
          const v = sp.poeng.some((x) => x !== 0) ? vinnere(sp) : [];
          if (v.includes(0)) {
            R.lyd.fanfare();
            R.vibrer([40, 60, 120]);
            R.konfetti();
          } else if (v.length) {
            R.lyd.tone(392, 0, 0.2, "triangle", 0.12);
            R.lyd.tone(311, 0.18, 0.4, "triangle", 0.11);
          } else R.lyd.pling();
          R.slippVaken();
        },
      },
    },

    handlinger: (H = {
      async nytt(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(pagar(S), true)) || !fortsatt()) return;
        R.gaTil("oppsett");
      },
      fortsett(el, e, S) {
        if (S.spill) R.gaTil(S.spill.ferdig ? "slutt" : "spill");
      },
      niva(el, e, S) {
        S.oppsett.niva = R.klamp(Number(el.dataset.v) || 2, 1, 3);
        R.vis();
      },
      mal(el, e, S) {
        if (MAL.some(([m]) => m === el.dataset.v)) S.oppsett.mal = el.dataset.v;
        R.vis();
      },
      start(el, e, S) {
        nyKamp(S);
        R.lyd.snu();
        R.gaTil("spill");
      },
      igjen(el, e, S) {
        nyKamp(S);
        R.gaTil("spill");
      },
      meld(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.r.fase !== "melding" || sp.r.tur !== 0) return;
        const bud = Number(el.dataset.v);
        if (!Amerikaner.meld(sp.r, 0, bud)) return;
        lyd.bud();
        R.vibrer(10);
        if (sp.r.fase === "omgjort") omgjor(S);
        R.vis();
        planleggMobil();
      },
      trumf(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.r.fase !== "velg" || sp.r.spillforer !== 0) return;
        const s = Number(el.dataset.v);
        if (!Amerikaner.kanVelgeTrumf(sp.r, 0, s)) return;
        sp.valg = { trumf: s, spurt: Amerikaner.kanSporres(sp.r, 0, s)[0] };
        R.lyd.klikk();
        R.vis();
      },
      spor(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.valg || sp.r.fase !== "velg") return;
        const k = Number(el.dataset.v);
        if (!Amerikaner.kanSporres(sp.r, 0, sp.valg.trumf).includes(k)) return;
        sp.valg.spurt = k;
        R.lyd.klikk();
        R.vis();
      },
      bekreft(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.valg || sp.r.fase !== "velg") return;
        if (!Amerikaner.velg(sp.r, 0, sp.valg.trumf, sp.valg.spurt)) return;
        sp.valg = null;
        R.lyd.snu();
        R.vis();
      },
      kort(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.ferdig || rundeFerdig(sp)) return;
        const r = sp.r;
        const k = Number(el.dataset.v);
        if (!r.hender[0].includes(k)) return;
        if (r.fase !== "spill") return R.toast(r.fase === "melding" ? R.t("Først melder dere") : R.t("Vent litt – trumf er ikke valgt ennå"));
        if (r.tur !== 0) return R.toast(R.t("Vent litt – {navn} tenker", { navn: navn(r.tur) }));
        if (!Amerikaner.lovlige(r, 0).includes(k)) {
          R.lyd.feil();
          R.vibrer(30);
          el.classList.remove("risting");
          void el.offsetWidth;
          el.classList.add("risting");
          R.si(`${R.t("{kort} kan ikke legges nå.", { kort: kortnavn(k) })} ${meldingTekst(sp)}`);
          return;
        }
        if (pause) {
          clearTimeout(pauseId);
          pauseId = null;
          pause = null;
        }
        if (!spilt(sp, 0, k)) return;
        R.vibrer(10);
        etterKort(S);
        R.vis();
        planleggMobil();
      },
      siste(el, e, S) {
        const sp = S.spill;
        const t = sp && sp.r.spilt[sp.r.spilt.length - 1];
        if (!t) return;
        R.ark(`<h2>${esc(R.t("Siste stikk"))}</h2>
          <ul class="ma-siste">${t.kort.map((x) => `<li class="${x.p === t.vinner ? "vinner" : ""}">${KORT.html(x.k, { opp: true })}<span>${esc(navn(x.p))}</span></li>`).join("")}</ul>
          <p class="hjelp">${esc(t.vinner === 0 ? R.t("Du tok stikket.") : R.t("{navn} tok stikket.", { navn: navn(t.vinner) }))}</p>
          ${R.ui.knapp(R.t("Lukk"), "lukk-ark")}`);
      },
      meldinger(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        const m = sp.r.meldinger;
        R.ark(`<h2>${esc(R.t("Meldingene"))}</h2>
          ${m.length ? `<ol class="ma-meldinger">${m.map((x) => `<li>${R.avatar(avatarNr(x.p))}<b>${esc(navn(x.p))}</b><span>${esc(budTekst(x.bud))}</span></li>`).join("")}</ol>` : `<p class="hjelp">${esc(R.t("Ingen har meldt ennå."))}</p>`}
          ${sp.r.fase === "spill" || sp.r.fase === "ferdig" ? `<p class="hjelp">${esc(kontraktTekst(sp.r))}. ${esc(makkerTekst(sp.r))}</p>` : ""}
          ${R.ui.knapp(R.t("Lukk"), "lukk-ark")}`);
      },
      poeng(el, e, S) {
        const sp = S.spill;
        if (sp && rundeFerdig(sp)) R.gaTil("runde");
      },
      "ny-runde"(el, e, S) {
        const sp = S.spill;
        if (!sp || !rundeFerdig(sp)) return;
        if (kampFerdig(sp)) return avsluttKamp(S);
        nyRunde(S);
        R.lyd.snu();
        R.gaTil("spill");
      },
      kaaring(el, e, S) {
        if (S.spill && !S.spill.ferdig && kampFerdig(S.spill)) avsluttKamp(S);
      },
      del(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        const niva = NIVANAVN[sp.niva].toLowerCase();
        const v = vinnere(sp);
        const stilling = sp.poeng.join(" · ");
        const tekst = v.includes(0) ? R.t("Jeg vant Amerikaner mot tre mobiler i Makkeren ({niva}) med {n} poeng. Klarer du det?", { niva, n: sp.poeng[0] }) : R.t("Mobilene slo meg i Amerikaner i Makkeren ({niva}), {stilling}. Klarer du bedre?", { niva, stilling });
        R.del(R.t("Makkeren"), tekst, DEL_URL, { kort: { tittel: R.t("Makkeren"), linjer: [poengTekst(sp.poeng[0]), stilling, R.t("Amerikaner mot tre mobiler · {niva}", { niva })] } });
      },
      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        const fortsatt = R.vakt();
        stoppMobil();
        const ferdige = sp.runde - (sp.lagt ? 0 : 1);
        const ja = await R.bekreft(R.t("Avslutte spillet?"), ferdige ? R.t("Du går til kåringen. Runden du er midt i, teller ikke.") : R.t("Du kan alltid starte et nytt."), R.t("Avslutt"), R.t("Spill videre"));
        if (!fortsatt() || S.spill !== sp || sp.ferdig) return;
        if (!ja) return planleggMobil();
        if (!ferdige) {
          S.spill = null;
          R.gaTil("hjem");
          return;
        }
        avsluttKamp(S);
      },
    }),
  });
})();
