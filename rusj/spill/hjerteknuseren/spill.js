/* Hjerteknuseren — hearts for four: you against three phone players. Every round each player passes
   three cards (to the left, to the right, across, and every fourth round nobody passes), then thirteen
   tricks are played: follow suit if you can, the highest card of the suit led takes the trick. Every
   heart taken costs a point and spar dame thirteen; take them all and the others get 26 instead
   («skyte månen»). When somebody reaches the limit, the lowest score wins. The rules (Hjerter) and the
   phone players (Mobil) are pure functions at the top; test/hjerteknuseren.test.mjs loads this file
   without the kit. */
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
  // Seats: 0 you (bottom), 1 left, 2 across (top), 3 right; play goes 0 → 1 → 2 → 3 (clockwise).
  // A round: { nr, hender: [[card] × 4], retning (0 left, 1 right, 2 across, 3 no passing), fase ("gi" |
  //   "spill" | "ferdig"), gitt: [3 cards | null] per seat, mottatt: [[cards received]], stikk: [{ p, k }]
  //   (the trick on the table, leader first), tur, tatt: [[cards taken]], brutt (a heart has been
  //   played), stikkNr (0–13), spilt: [{ kort: [{ p, k }], vinner }] (the finished tricks), resultat }

  const Hjerter = (() => {
    const sortAv = (k) => (k / 13) | 0;
    const verdiAv = (k) => (k % 13) + 1;
    const rang = (k) => (verdiAv(k) === 1 ? 14 : verdiAv(k)); // the ace is high
    const SPAR = 0;
    const HJERTER = 1;
    const KLOVER_TO = 3 * 13 + 1;
    const SPAR_DAME = 11;
    const MAANE = 26;
    const MOTTAKER = [1, 3, 2, 0]; // passing: to the left (+1), to the right (+3), across (+2), none
    const poengAv = (k) => (k === SPAR_DAME ? 13 : sortAv(k) === HJERTER ? 1 : 0);
    const gyldig = (k) => Number.isInteger(k) && k >= 0 && k < 52;

    function bland(liste, rng) {
      const a = liste.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    // o: { nr (0-based round number: decides the passing direction) }
    function nyRunde(o, rng) {
      const nr = Math.max(0, o.nr | 0);
      const stokk = bland(Array.from({ length: 52 }, (_, i) => i), rng);
      const hender = [[], [], [], []];
      for (let c = 0; c < 52; c++) hender[c % 4].push(stokk[c]);
      const r = {
        nr,
        hender,
        retning: nr % 4,
        fase: "gi",
        gitt: [null, null, null, null],
        mottatt: [[], [], [], []],
        stikk: [],
        tur: 0,
        tatt: [[], [], [], []],
        brutt: false,
        stikkNr: 0,
        spilt: [],
        resultat: null,
      };
      if (r.retning === 3) startSpill(r);
      return r;
    }
    const mottakerAv = (r, p) => (p + MOTTAKER[r.retning]) % 4;
    const giverTil = (r, p) => (p + 4 - MOTTAKER[r.retning]) % 4;

    function startSpill(r) {
      r.fase = "spill";
      r.tur = r.hender.findIndex((h) => h.includes(KLOVER_TO));
    }

    // Pass three cards (they leave the hand when all four have chosen).
    function kanGi(r, p, kort) {
      return r.fase === "gi" && r.gitt[p] == null && Array.isArray(kort) && kort.length === 3 && new Set(kort).size === 3 && kort.every((k) => r.hender[p].includes(k));
    }
    function gi(r, p, kort) {
      if (!kanGi(r, p, kort)) return false;
      r.gitt[p] = kort.slice();
      if (r.gitt.every(Boolean)) {
        for (let q = 0; q < 4; q++) r.hender[q] = r.hender[q].filter((k) => !r.gitt[q].includes(k));
        for (let q = 0; q < 4; q++) {
          const m = mottakerAv(r, q);
          r.hender[m].push(...r.gitt[q]);
          r.mottatt[m] = r.gitt[q].slice();
        }
        startSpill(r);
      }
      return true;
    }

    // The cards p may play now.
    function lovlige(r, p) {
      if (r.fase !== "spill" || r.tur !== p) return [];
      const hand = r.hender[p];
      if (!r.stikk.length) {
        if (r.stikkNr === 0) return hand.includes(KLOVER_TO) ? [KLOVER_TO] : [];
        if (!r.brutt) {
          const andre = hand.filter((k) => sortAv(k) !== HJERTER);
          if (andre.length) return andre;
        }
        return hand.slice();
      }
      const ledet = sortAv(r.stikk[0].k);
      const folg = hand.filter((k) => sortAv(k) === ledet);
      if (folg.length) return folg;
      // No points in the first trick, unless the hand has nothing else.
      if (r.stikkNr === 0) {
        const rene = hand.filter((k) => !poengAv(k));
        if (rene.length) return rene;
      }
      return hand.slice();
    }

    // Who takes a trick: the highest card of the suit led.
    function vinnerAv(stikk) {
      const ledet = sortAv(stikk[0].k);
      let v = stikk[0];
      for (const s of stikk) if (sortAv(s.k) === ledet && rang(s.k) > rang(v.k)) v = s;
      return v.p;
    }

    function legg(r, p, k) {
      if (!lovlige(r, p).includes(k)) return false;
      r.hender[p].splice(r.hender[p].indexOf(k), 1);
      r.stikk.push({ p, k });
      if (sortAv(k) === HJERTER) r.brutt = true;
      if (r.stikk.length < 4) {
        r.tur = (p + 1) % 4;
        return true;
      }
      const v = vinnerAv(r.stikk);
      r.tatt[v].push(...r.stikk.map((s) => s.k));
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

    const poengTatt = (r, p) => r.tatt[p].reduce((s, k) => s + poengAv(k), 0);
    // The round's points: what each took, or 26 to everybody else when one took it all.
    function oppgjor(r) {
      const tatt = [0, 1, 2, 3].map((p) => poengTatt(r, p));
      const maane = tatt.indexOf(MAANE);
      const poeng = maane >= 0 ? tatt.map((x, p) => (p === maane ? 0 : MAANE)) : tatt;
      return { tatt, poeng, maane: maane >= 0 ? maane : null };
    }

    // Every card exactly once (for checking a restored round).
    function hel(r) {
      if (!r || !Array.isArray(r.hender) || r.hender.length !== 4 || !Array.isArray(r.stikk) || !Array.isArray(r.tatt) || r.tatt.length !== 4 || !Array.isArray(r.spilt)) return false;
      if (!["gi", "spill", "ferdig"].includes(r.fase) || !Number.isInteger(r.tur) || r.tur < 0 || r.tur > 3 || !(r.retning >= 0 && r.retning <= 3)) return false;
      if (!Array.isArray(r.gitt) || r.gitt.length !== 4 || !Array.isArray(r.mottatt) || r.mottatt.length !== 4) return false;
      const alle = [].concat(...r.hender, r.stikk.map((s) => s && s.k), ...r.tatt);
      if (alle.length !== 52 || new Set(alle).size !== 52 || !alle.every(gyldig)) return false;
      const igjen = r.hender.map((h) => h.length);
      const spilt = r.stikk.length;
      // Hands shrink one card per play, in turn order from the leader.
      return igjen.every((n, p) => n === 13 - r.stikkNr - (spilt && ((p - r.stikk[0].p + 4) % 4) < spilt ? 1 : 0)) || r.fase === "gi";
    }

    return { sortAv, verdiAv, rang, SPAR, HJERTER, KLOVER_TO, SPAR_DAME, MAANE, poengAv, bland, nyRunde, mottakerAv, giverTil, kanGi, gi, lovlige, vinnerAv, legg, poengTatt, oppgjor, hel };
  })();

  // ---------- The phone players ----------
  // 1 Lett: any legal card, three cards at random. 2 Middels: passes the dangerous cards (spar dame,
  // ess and konge, high hearts), ducks under the winning card, dumps spar dame and hearts when it can't
  // follow. 3 Vanskelig: also remembers every card played and who is out of a suit, keeps a well
  // guarded spar dame, voids short suits, chases spar dame out with low spades, leads what can't win,
  // and stops a player who is about to take all the points. Only what a player at the table can know
  // is used: its own hand, the cards played and the cards it passed.

  const Mobil = (() => {
    const { sortAv, rang, SPAR, HJERTER, KLOVER_TO, SPAR_DAME, poengAv } = Hjerter;
    const hoyest = (liste) => liste.reduce((a, b) => (rang(b) > rang(a) ? b : a));
    const lavest = (liste) => liste.reduce((a, b) => (rang(b) < rang(a) ? b : a));

    function velgGi(r, p, niva, rng) {
      rng = rng || Math.random;
      const hand = r.hender[p];
      if (niva <= 1) return Hjerter.bland(hand, rng).slice(0, 3);
      const antall = [0, 0, 0, 0];
      for (const k of hand) antall[sortAv(k)]++;
      const lavSpar = hand.filter((k) => sortAv(k) === SPAR && rang(k) < 12).length;
      const vakt = niva >= 3 && lavSpar >= 4; // enough low spades to keep the high ones safe
      const verdi = (k) => {
        const s = sortAv(k);
        const t = rang(k);
        if (k === SPAR_DAME) return vakt ? 4 : 100;
        if (s === SPAR && t > 12) return vakt ? 6 : 80;
        if (s === HJERTER) return 18 + t * 2;
        let v = t * 2;
        if (niva >= 3 && s !== SPAR && s !== HJERTER && antall[s] <= 2) v += 14; // empty a short suit
        if (k === KLOVER_TO) v -= 6;
        return v;
      };
      return hand.slice().sort((a, b) => verdi(b) - verdi(a) || b - a).slice(0, 3);
    }

    // What this seat knows: the cards played, who is out of which suit, the points taken so far.
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
      const tatt = [0, 1, 2, 3].map((q) => Hjerter.poengTatt(r, q));
      return { ute, tom, tatt };
    }
    // Unseen cards of a suit (not played, not on this hand).
    function ukjente(r, p, s, ute) {
      const ut = [];
      for (let k = s * 13; k < s * 13 + 13; k++) if (!ute.has(k) && !r.hender[p].includes(k)) ut.push(k);
      return ut;
    }

    function spillUt(r, p, niva, lov, kj) {
      const hand = r.hender[p];
      const dameUte = kj.ute.has(SPAR_DAME);
      const harDame = hand.includes(SPAR_DAME);
      const lavSpar = hand.filter((k) => sortAv(k) === SPAR && rang(k) < 12);
      let best = lov[0];
      let bestV = Infinity;
      for (const k of lov) {
        const s = sortAv(k);
        let v = rang(k);
        if (s === HJERTER) v += 6;
        if (k === SPAR_DAME) v += 40;
        if (s === SPAR && rang(k) > 12 && !dameUte && !harDame) v += 25; // the queen would land on it
        if (niva >= 3) {
          const andre = ukjente(r, p, s, kj.ute);
          // A card that can't win is a safe lead; one that must win, a poor one.
          if (andre.length && rang(k) < Math.min(...andre.map(rang))) v -= 4;
          if (!andre.length) v += 10;
          // Somebody is out of this suit: they will throw points on it.
          for (let q = 0; q < 4; q++) if (q !== p && kj.tom[q].has(s)) v += 6;
          // Chase spar dame out with low spades.
          if (s === SPAR && !dameUte && !harDame && rang(k) < 12 && !hand.some((x) => sortAv(x) === SPAR && rang(x) > 12)) v -= 8;
          if (s === SPAR && harDame && lavSpar.length < 3) v += 8;
        }
        if (v < bestV) {
          bestV = v;
          best = k;
        }
      }
      return best;
    }

    // { a card p may play } — always legal.
    function velgKort(r, p, niva, rng) {
      rng = rng || Math.random;
      const lov = Hjerter.lovlige(r, p);
      if (lov.length <= 1 || niva <= 1) return lov[Math.floor(rng() * lov.length)];
      const kj = kunnskap(r);
      if (!r.stikk.length) return spillUt(r, p, niva, lov, kj);
      const ledet = sortAv(r.stikk[0].k);
      const vinnerKort = r.stikk.filter((s) => sortAv(s.k) === ledet).reduce((a, b) => (rang(b.k) > rang(a.k) ? b : a)).k;
      const poeng = r.stikk.reduce((s, x) => s + poengAv(x.k), 0);
      const sist = r.stikk.length === 3;
      const dameUte = kj.ute.has(SPAR_DAME);
      if (sortAv(lov[0]) === ledet) {
        // Vanskelig: one player has every point so far – take a trick with hearts in it to stop the moon.
        if (niva >= 3 && poeng > 0) {
          const sum = kj.tatt.reduce((a, b) => a + b, 0);
          const truer = kj.tatt.findIndex((x, q) => q !== p && x === sum && sum >= 12);
          const kanVinne = lov.filter((k) => rang(k) > rang(vinnerKort) && k !== SPAR_DAME);
          if (truer >= 0 && kanVinne.length && (sist || r.stikkNr >= 8)) return hoyest(kanVinne);
        }
        if (lov.includes(SPAR_DAME) && rang(vinnerKort) > 12) return SPAR_DAME;
        const under = lov.filter((k) => rang(k) < rang(vinnerKort) && k !== SPAR_DAME);
        if (under.length) return hoyest(under);
        const uten = lov.filter((k) => k !== SPAR_DAME);
        const valg = uten.length ? uten : lov;
        // The trick is ours anyway: get rid of the highest. Not last: the lowest, somebody may still go over.
        if (sist) return hoyest(valg);
        if (niva >= 3 && ledet !== HJERTER) {
          // If nobody after us can still follow, the trick is ours: throw the highest.
          const etter = [];
          for (let i = r.stikk.length + 1; i < 4; i++) etter.push((r.stikk[0].p + i) % 4);
          if (etter.every((q) => kj.tom[q].has(ledet)) && poeng === 0) return hoyest(valg);
        }
        return lavest(valg);
      }
      // Out of the suit: throw what hurts.
      if (lov.includes(SPAR_DAME)) return SPAR_DAME;
      if (!dameUte) {
        const ak = lov.filter((k) => sortAv(k) === SPAR && rang(k) > 12);
        if (ak.length) return hoyest(ak);
      }
      const hj = lov.filter((k) => sortAv(k) === HJERTER);
      if (hj.length) return hoyest(hj);
      if (niva >= 3) {
        // Empty the shortest suit, highest card first.
        const antall = [0, 0, 0, 0];
        for (const k of r.hender[p]) antall[sortAv(k)]++;
        return lov.reduce((a, b) => (antall[sortAv(b)] < antall[sortAv(a)] || (antall[sortAv(b)] === antall[sortAv(a)] && rang(b) > rang(a)) ? b : a));
      }
      return hoyest(lov);
    }

    return { velgGi, velgKort, kunnskap };
  })();

  const R = window.Rusj;
  if (!R) {
    // Loaded without the kit (unit tests in node): only the rules, the phone players and the cards.
    window.Hjerteknuseren = { Hjerter, Mobil, KORT };
    return;
  }

  // ---------- The game on the page ----------

  const esc = R.esc;
  const { sortAv, verdiAv, rang, SPAR_DAME, KLOVER_TO } = Hjerter;
  // Every text goes through R.t (rusj/SPRAK.md): the key is the Norwegian text.
  const NIVANAVN = { 1: R.t("Lett"), 2: R.t("Middels"), 3: R.t("Vanskelig") };
  const NIVATEKST = {
    1: R.t("Mobilene legger det som passer, helt tilfeldig. Fint for å lære."),
    2: R.t("Mobilene gir bort farlige kort, dukker under og dumper spar dame når de kan."),
    3: R.t("Mobilene husker hvert kort, jager spar dame og stopper den som prøver å skyte månen."),
  };
  const MAL = [["50", R.t("Til 50")], ["100", R.t("Til 100")]];
  const MAL_TEKST = {
    50: R.t("En kort kamp: når noen har 50 poeng, vinner den med færrest."),
    100: R.t("Vanlig lengde: når noen har 100 poeng, vinner den med færrest."),
  };
  const VERDIORD = ["", R.t("ess"), R.t("to"), R.t("tre"), R.t("fire"), R.t("fem"), R.t("seks"), R.t("sju"), R.t("åtte"), R.t("ni"), R.t("ti"), R.t("knekt"), R.t("dame"), R.t("konge")];
  const FARGENAVN = [R.t("spar"), R.t("hjerter"), R.t("ruter"), R.t("kløver")];
  const FARGE_EN = [R.t("en spar"), R.t("en hjerter"), R.t("en ruter"), R.t("en kløver")]; // «Legg en ruter.»
  const kortnavn = (k) => R.t("{farge} {verdi}", { farge: FARGENAVN[sortAv(k)], verdi: VERDIORD[verdiAv(k)] });
  const FART = { kort: 700, stikk: 1300, start: 900 }; // ms: a phone's card, a finished trick on the table
  // This edition's address (rusj.no/hjerteknuseren/, rusj.no/en/…)
  const DEL_URL = (document.querySelector('link[rel="canonical"]') || { href: "https://rusj.no/hjerteknuseren/" }).href;
  let H;

  // S.spill: { id, niva, mal, runde, poeng [per seat], r (the round, see Hjerter), lagt (the round's
  //   points are counted), valgt [cards picked to pass], ferdig, registrert }
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const navn = (p) => (p === 0 ? R.t("Du") : R.t("Mobil {n}", { n: p }));
  const avatarNr = (p) => (p === 0 ? 0 : 9 + p);
  const rundeFerdig = (sp) => sp.r.fase === "ferdig";
  const kampFerdig = (sp) => sp.lagt && sp.poeng.some((x) => x >= Number(sp.mal));
  const vinnere = (sp) => {
    const lav = Math.min(...sp.poeng);
    return sp.poeng.map((x, p) => (x === lav ? p : -1)).filter((p) => p >= 0);
  };
  const rng = () => R.rng(R.nyttFro());
  const poengTekst = (n) => R.flertall(n, "poeng", "poeng");
  const RETNINGTEKST = [R.t("til venstre"), R.t("til høyre"), R.t("over bordet"), ""];

  // ---------- Sounds ----------
  const lyd = {
    legg: () => {
      R.lyd.tone(520, 0, 0.06, "triangle", 0.1);
      R.lyd.stoy(0, 0.08, 0.14, 2400);
    },
    stikk: () => R.lyd.stoy(0, 0.16, 0.1, 900),
    hjerte: () => {
      R.lyd.tone(330, 0, 0.12, "sine", 0.1);
      R.lyd.tone(262, 0.1, 0.2, "sine", 0.09);
    },
    dame: () => {
      R.lyd.tone(220, 0, 0.25, "triangle", 0.13);
      R.lyd.tone(165, 0.2, 0.45, "triangle", 0.12);
    },
  };

  // ---------- The finished trick stays on the table for a moment ----------
  let pause = null; // { nr: the trick number shown, til: time }
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

  function sistTekst(sp) {
    const r = sp.r;
    if (r.fase === "spill" && r.stikkNr === 0 && !r.stikk.length && r.mottatt[0].length) {
      return R.t("Du fikk {kort} fra {navn}.", { kort: R.ramsOpp(r.mottatt[0].map(kortnavn)), navn: navn(Hjerter.giverTil(r, 0)) });
    }
    const t = r.spilt[r.spilt.length - 1];
    if (!t || (r.stikk.length && !visPause(sp))) return "";
    const poeng = t.kort.reduce((s, x) => s + Hjerter.poengAv(x.k), 0);
    const hvem = navn(t.vinner);
    const dame = t.kort.some((x) => x.k === SPAR_DAME);
    if (t.vinner === 0) return dame ? R.t("Du fikk spar dame – 13 poeng.") : poeng ? R.t("Du tok stikket – {poeng}.", { poeng: poengTekst(poeng) }) : R.t("Du tok stikket.");
    return dame ? R.t("{navn} fikk spar dame – 13 poeng.", { navn: hvem }) : poeng ? R.t("{navn} tok stikket – {poeng}.", { navn: hvem, poeng: poengTekst(poeng) }) : R.t("{navn} tok stikket.", { navn: hvem });
  }

  function meldingTekst(sp) {
    const r = sp.r;
    if (r.fase === "gi") {
      if (r.gitt[0]) return R.t("Venter på mobilene …");
      const n = (sp.valgt || []).length;
      return R.t("Gi tre kort {retning} – til {navn}. Valgt: {n} av 3.", { retning: RETNINGTEKST[r.retning], navn: navn(Hjerter.mottakerAv(r, 0)), n });
    }
    if (r.tur !== 0) return R.t("{navn} tenker …", { navn: navn(r.tur) });
    if (!r.stikk.length) {
      if (r.stikkNr === 0) return R.t("Du har kløver to – spill den ut.");
      return r.brutt || Hjerter.lovlige(r, 0).some((k) => sortAv(k) === 1) ? R.t("Din tur – spill ut et kort.") : R.t("Din tur – spill ut et kort. Hjerter er ikke brutt ennå.");
    }
    const ledet = sortAv(r.stikk[0].k);
    if (Hjerter.lovlige(r, 0).some((k) => sortAv(k) === ledet)) return R.t("Legg {farge}.", { farge: FARGE_EN[ledet] });
    if (r.stikkNr === 0) return R.t("Du har ingen {farge} – legg hva du vil, men ikke poeng i første stikk.", { farge: FARGENAVN[ledet] });
    return R.t("Du har ingen {farge} – kvitt deg med noe!", { farge: FARGENAVN[ledet] });
  }

  // ---------- Flow ----------

  function nyKamp(S) {
    const o = S.oppsett;
    S.spill = { id: R.nyttFro() % 1e9, niva: o.niva, mal: o.mal, runde: 0, poeng: [0, 0, 0, 0], r: null, lagt: false, valgt: [], ferdig: false, registrert: false };
    nyRunde(S);
    R.statistikk("start", { niva: o.niva, mal: o.mal });
  }
  function nyRunde(S) {
    const sp = S.spill;
    sp.r = Hjerter.nyRunde({ nr: sp.runde }, rng());
    sp.runde++;
    sp.lagt = false;
    sp.valgt = [];
    pause = null;
  }

  function etterKort(S) {
    const sp = S.spill;
    const r = sp.r;
    if (!rundeFerdig(sp) || sp.lagt) return;
    sp.lagt = true;
    r.resultat.poeng.forEach((x, p) => (sp.poeng[p] += x));
    const ferdig = kampFerdig(sp);
    const v = ferdig ? vinnere(sp) : [];
    if (ferdig) {
      const rek = S.rekord[sp.niva] || (S.rekord[sp.niva] = { seier: 0, tap: 0 });
      if (v.includes(0)) {
        rek.seier++;
        R.merke("klassiker-hjerteknuseren");
      } else rek.tap++;
      if (v.includes(0) && (rek.best == null || sp.poeng[0] < rek.best)) rek.best = sp.poeng[0];
    }
    const fortsatt = R.vakt();
    setTimeout(() => {
      if (!fortsatt()) return;
      if (r.resultat.maane === 0 || (ferdig && v.includes(0))) {
        R.lyd.fanfare();
        R.konfetti();
      } else if (r.resultat.poeng[0] === 0) R.lyd.riktig();
      else R.lyd.pling();
    }, FART.stikk);
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
  function planleggMobil(ms) {
    const S = R.S;
    const sp = S && S.spill;
    if (mobilId || !sp || sp.ferdig || S.skjerm !== "spill" || sp.r.fase !== "spill" || sp.r.tur === 0) return;
    const vent = pause ? Math.max(0, pause.til - performance.now()) + 200 : 0;
    mobilId = setTimeout(mobilSteg, (ms != null ? ms : FART.kort) + vent);
  }
  function spilt(sp, p, k) {
    const r = sp.r;
    const forNr = r.spilt.length;
    if (!Hjerter.legg(r, p, k)) return false;
    if (k === SPAR_DAME) lyd.dame();
    else if (sortAv(k) === 1) lyd.hjerte();
    else lyd.legg();
    if (r.spilt.length > forNr) {
      startPause(r);
      setTimeout(lyd.stikk, FART.stikk - 250);
    }
    return true;
  }
  function mobilSteg() {
    mobilId = null;
    const S = R.S;
    const sp = S && S.spill;
    if (!sp || sp.ferdig || S.skjerm !== "spill" || sp.r.fase !== "spill" || sp.r.tur === 0) return;
    // Never behind a sheet (rules, «Avslutt?»), during a finished trick or in a hidden tab.
    if (R.arkApent() || document.hidden) return planleggMobil(500);
    if (pause && pause.til > performance.now()) return planleggMobil(0);
    const p = sp.r.tur;
    if (!spilt(sp, p, Mobil.velgKort(sp.r, p, sp.niva, Math.random))) return;
    etterKort(S);
    R.vis();
    planleggMobil();
  }

  // ---------- Markup ----------

  const REKKE = [0, 1, 3, 2]; // spar, hjerter, kløver, ruter (red and black in turn)
  const sorter = (hand) => hand.slice().sort((a, b) => REKKE.indexOf(sortAv(a)) - REKKE.indexOf(sortAv(b)) || rang(a) - rang(b));

  function seteHtml(sp, p, plass) {
    const r = sp.r;
    const tatt = Hjerter.poengTatt(r, p);
    const aktiv = r.fase === "spill" && r.tur === p && !visPause(sp);
    const klar = r.fase === "gi" && p !== 0;
    return `<div class="hj-sete hj-${plass}${aktiv ? " aktiv" : ""}">
      <span class="hj-ava">${R.avatar(avatarNr(p))}${aktiv && p !== 0 ? '<span class="hj-tenker" aria-hidden="true"><i></i><i></i><i></i></span>' : ""}</span>
      <span class="hj-info"><b class="hj-navn">${esc(navn(p))}</b><span class="hj-tatt">${esc(R.t("{n} i runden", { n: tatt }))}</span><span class="hj-sum">${esc(R.t("{n} totalt", { n: sp.poeng[p] }))}</span>${klar ? `<span class="hj-klar">${esc(R.t("Har valgt"))}</span>` : ""}</span>
    </div>`;
  }

  function stikkHtml(sp) {
    const r = sp.r;

    let kort = r.stikk;
    let vinner = -1;
    if (visPause(sp) || (rundeFerdig(sp) && r.spilt.length)) {
      const t = r.spilt[r.spilt.length - 1];
      kort = t.kort;
      vinner = t.vinner;
    }
    const navnet = kort.length ? kort.map((x) => R.t("{navn}: {kort}", { navn: navn(x.p), kort: kortnavn(x.k) })).join(", ") : R.t("Ingen kort på bordet");
    return `<div class="hj-stikk${vinner >= 0 ? " samlet" : ""}" role="img" aria-label="${esc(navnet)}">
      ${kort.map((x, i) => `<span class="hj-lagt hj-p${x.p}${x.p === vinner ? " vinner" : ""}${i === 0 ? " forst" : ""}">${KORT.html(x.k, { opp: true })}</span>`).join("")}
      ${!kort.length && r.fase === "spill" && !r.brutt ? `<span class="hj-ubrutt" aria-hidden="true">♥</span>` : ""}
    </div>`;
  }

  function handHtml(sp) {
    const r = sp.r;
    const gi = r.fase === "gi" && !r.gitt[0];
    const min = r.fase === "spill" && r.tur === 0;
    const lov = new Set(min ? Hjerter.lovlige(r, 0) : []);
    const valgt = new Set(sp.valgt || []);
    const nye = new Set(r.fase === "spill" && r.stikkNr === 0 && !r.stikk.some((x) => x.p === 0) ? r.mottatt[0] : []);
    const hand = sorter(r.hender[0]);
    const tatt = Hjerter.poengTatt(r, 0);
    return `<div class="hj-handramme">
      <div class="hj-handtopp"><span>${esc(R.t("Du · {n} i runden · {sum} totalt", { n: tatt, sum: sp.poeng[0] }))}</span></div>
      <div class="hj-hand${min ? " min-tur" : ""}${gi ? " gir" : ""}" role="group" aria-label="${esc(R.t("Kortene dine"))}" style="--n:${hand.length}">${hand
        .map((k, i) => {
          const ok = gi || lov.has(k);
          const kl = [ok && min && "lovlig", valgt.has(k) && "valgt", nye.has(k) && "fersk"].filter(Boolean).join(" ");
          const trykket = gi ? ` aria-pressed="${valgt.has(k) ? "true" : "false"}"` : "";
          return `<button class="hj-hk${kl ? " " + kl : ""}" data-h="kort" data-v="${k}" aria-label="${esc(kortnavn(k))}"${trykket}${ok && (gi || min) ? "" : ' aria-disabled="true"'} style="--i:${i}">${KORT.html(k, { opp: true })}</button>`;
        })
        .join("")}</div>
    </div>`;
  }

  function resultatHtml(sp) {
    const res = sp.r.resultat;
    const lav = Math.min(...sp.poeng);
    return `<ul class="hj-resultat" aria-label="${esc(R.t("Poeng etter runden"))}">${[0, 1, 2, 3]
      .map(
        (p) => `<li class="${sp.poeng[p] === lav ? "leder" : ""}">${R.avatar(avatarNr(p))}<b>${esc(navn(p))}</b>
        <span class="hj-pluss">${res.maane === p ? "🌙 " : ""}+${res.poeng[p]}</span><span class="hj-tot">${sp.poeng[p]}</span></li>`,
      )
      .join("")}</ul>`;
  }

  function rundeTittel(sp) {
    const res = sp.r.resultat;
    if (kampFerdig(sp)) {
      const v = vinnere(sp);
      if (v.length === 1) return v[0] === 0 ? R.t("Du vinner kampen!") : R.t("{navn} vinner kampen!", { navn: navn(v[0]) });
      return R.t("{navn} deler seieren!", { navn: R.ramsOpp(v.map(navn)) });
    }
    if (res.maane === 0) return R.t("Du skjøt månen! Alle andre får 26.");
    if (res.maane != null) return R.t("{navn} skjøt månen! Alle andre får 26.", { navn: navn(res.maane) });
    if (res.poeng[0] === 0) return R.t("Ingen poeng på deg denne runden!");
    return R.t("Du tok {poeng} denne runden.", { poeng: poengTekst(res.poeng[0]) });
  }

  function spillHtml(S) {
    const sp = S.spill;
    const r = sp.r;
    const ferdig = rundeFerdig(sp) && !visPause(sp);
    const gi = r.fase === "gi" && !r.gitt[0];
    const sist = ferdig ? "" : sistTekst(sp);
    const melding = ferdig ? rundeTittel(sp) : meldingTekst(sp);
    let dokk;
    const avslutt = R.ui.lenke(R.t("Avslutt"), "avslutt");
    const siste = r.spilt.length && !ferdig ? R.ui.lenke(R.t("Siste stikk"), "siste") : "";
    if (ferdig) dokk = R.ui.dokk(kampFerdig(sp) ? R.ui.knapp(R.t("Se kåringen"), "kaaring", { ikon: "🏆" }) : R.ui.knapp(R.t("Ny runde"), "runde", { ikon: "🃏" }), R.ui.lenkerad(avslutt));
    else if (gi) {
      const n = (sp.valgt || []).length;
      dokk = R.ui.dokk(R.ui.knapp(n === 3 ? R.t("Gi kortene til {navn}", { navn: navn(Hjerter.mottakerAv(r, 0)) }) : R.t("Velg tre kort"), "gi", { av: n !== 3 }), R.ui.lenkerad(avslutt));
    } else dokk = R.ui.dokk(R.ui.lenkerad(siste, avslutt));
    return `
      <h1 class="vh" id="skjerm-tittel">${esc(R.t("Hjerteknuseren, runde {n}", { n: sp.runde }))}</h1>
      <div class="hj-bord">
        ${seteHtml(sp, 2, "topp")}
        ${seteHtml(sp, 1, "venstre")}
        ${stikkHtml(sp)}
        ${seteHtml(sp, 3, "hoyre")}
      </div>
      <div class="hj-melding${ferdig ? " ferdig" : r.tur === 0 || gi ? " din" : ""}" role="status">
        ${sist ? `<span class="hj-sist">${esc(sist)}</span>` : ""}
        <b>${esc(melding)}</b>
      </div>
      ${ferdig ? resultatHtml(sp) : handHtml(sp)}
      ${dokk}`;
  }

  function rekordHtml(S, niva) {
    const r = S.rekord[niva];
    if (!r || !(r.seier + r.tap)) return "";
    return `<span><b>${r.seier}</b> ${esc(R.t("seier|seirer", { n: r.seier }))}</span><span><b>${r.tap}</b> ${esc(R.t("tap|tap", { n: r.tap }))}</span>${r.best != null ? `<span>${esc(R.t("beste: {n}", { n: r.best }))}</span>` : ""}`;
  }

  // ---------- The hand: rows of overlapping cards that always fit ----------
  function leggUtHand() {
    for (const h of document.querySelectorAll(".hj-hand")) {
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
    id: "hjerteknuseren",
    versjon: 1,
    pagar,

    tilstand: () => ({ oppsett: { niva: 2, mal: "100" }, spill: null, rekord: {} }),

    lastet(S) {
      const o = (S.oppsett = Object.assign({ niva: 2, mal: "100" }, S.oppsett));
      if (![1, 2, 3].includes(o.niva)) o.niva = 2;
      if (!MAL.some(([m]) => m === o.mal)) o.mal = "100";
      if (!S.rekord || typeof S.rekord !== "object") S.rekord = {};
      const sp = S.spill;
      if (sp) {
        const ok = [1, 2, 3].includes(sp.niva) && MAL.some(([m]) => m === sp.mal) && Array.isArray(sp.poeng) && sp.poeng.length === 4 && Hjerter.hel(sp.r);
        if (!ok) S.spill = null;
        else if (!Array.isArray(sp.valgt)) sp.valgt = [];
      }
      if (!S.spill && ["spill", "slutt"].includes(S.skjerm)) S.skjerm = "hjem";
      if (S.spill && S.skjerm === "slutt" && !S.spill.ferdig) S.skjerm = "spill";
      if (S.spill && S.skjerm === "spill" && S.spill.ferdig) S.skjerm = "slutt";
    },

    regler: {
      intro: R.t("Du mot tre mobiler. Unngå hjerter og spar dame. Når noen når grensen, vinner den med færrest poeng."),
      steg: [
        [R.t("Gi tre kort"), R.t("Før hver runde gir alle tre kort: først til venstre, så til høyre, så over bordet. Hver fjerde runde beholder alle kortene sine.")],
        [R.t("Følg farge"), R.t("Den som har kløver to, spiller ut. Har du kort i fargen som ble spilt ut, må du legge et av dem. Det høyeste kortet i den fargen tar stikket og spiller ut neste gang.")],
        [R.t("Unngå poeng"), R.t("Hver hjerter du tar, gir ett poeng, og spar dame gir 13. Færrest poeng er best.")],
      ],
      tips: [
        R.t("Har du ikke fargen, kan du legge hva du vil – en fin sjanse til å bli kvitt spar dame eller hjerter."),
        R.t("Du kan ikke spille ut hjerter før noen har lagt en hjerter i et stikk (hjerter er «brutt»), med mindre du bare har hjerter igjen."),
        R.t("I første stikk kan ingen legge hjerter eller spar dame, med mindre de ikke har annet."),
        R.t("Skyte månen: Tar du alle hjerterne og spar dame, får du 0 og alle de andre 26."),
        R.t("Ess er høyest, så kommer konge, dame, knekt og ned til to."),
        R.t("Gi gjerne bort spar dame, spar ess og spar konge – og høye hjerter."),
        R.t("«Siste stikk» viser hvilke kort som ble lagt i stikket før."),
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
              slagordHtml: `${esc(R.t("Følg farge – og hold deg unna hjertene."))}<br><em>${esc(R.t("Spar dame er verst."))}</em>`,
              knapperHtml: R.ui.startKnapper({
                pagar: aktiv,
                fortsettTekst: aktiv ? R.t("Fortsett · runde {n}", { n: sp.runde }) : "",
                ekstraHtml: R.ui.lenke(R.t("Slik spiller du"), "regler"),
              }),
              merker: [
                ["3", R.t("mobiler å slå")],
                ["3", R.t("nivåer")],
                ["0", R.t("reklame")],
              ],
            }) +
            (rek.length ? `<section class="hj-rekorder" aria-label="${esc(R.t("Mot mobilen"))}"><p class="etikett">${esc(R.t("Mot mobilen"))}</p><ul>${rek.map(([n, h]) => `<li><b class="hj-niva">${esc(NIVANAVN[n])}</b>${h}</li>`).join("")}</ul></section>` : "")
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
            ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start", { variant: "stor", ikon: "♥️" }))}`;
        },
      },

      spill: {
        tittel: (S) => (S.spill ? R.t("Runde {n}", { n: S.spill.runde }) : ""),
        tilbake: "hjem",
        vis: spillHtml,
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

      slutt: {
        tittel: R.t("Kåringen"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const v = sp.poeng.some((x) => x > 0) ? vinnere(sp) : [];
          const duVant = v.includes(0);
          let tittel;
          if (!v.length) tittel = R.t("Ingen vinner denne gangen");
          else if (v.length === 1) tittel = duVant ? R.t("Du vinner!") : R.t("{navn} vinner!", { navn: navn(v[0]) });
          else tittel = R.t("{navn} vinner!|{navn} vinner!", { navn: R.ramsOpp(v.map(navn)), n: v.length });
          const runder = sp.runde - (sp.lagt ? 0 : 1);
          const etikett = `${R.flertall(runder, "runde", "runder")} · ${NIVANAVN[sp.niva].toLowerCase()}`;
          const tekst = duVant ? R.t("Godt jobba! Færrest poeng vinner.") : v.length ? R.t("Godt kjempa! Neste gang går spar dame til noen andre.") : "";
          const rek = rekordHtml(S, sp.niva);
          // Lowest first: in hearts few points are best.
          const rekke = [0, 1, 2, 3].sort((a, b) => sp.poeng[a] - sp.poeng[b] || a - b);
          const lav = Math.min(...sp.poeng);
          const liste = `<ol class="poengliste hj-tavle">${rekke
            .map((p) => `<li class="${sp.poeng[p] === lav && v.length ? "leder" : ""}"><span class="plass-nr">${1 + sp.poeng.filter((x) => x < sp.poeng[p]).length}</span>${R.avatar(avatarNr(p))}<span class="navn">${esc(navn(p))}</span><span class="sum">${esc(sp.poeng[p])}</span></li>`)
            .join("")}</ol>`;
          return `
            ${R.ui.banner({ tittel, etikett, tekst, stemning: v.length && !duVant ? "lei" : v.length ? "jubel" : "" })}
            ${liste}
            ${rek ? `<p class="hj-rekordlinje"><span class="etikett">${esc(R.t("Mot mobilen"))} · ${esc(NIVANAVN[sp.niva].toLowerCase())}</span>${rek}</p>` : ""}
            ${R.ui.flereSpill({ antall: 1 })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen", { ikon: "♥️" }), R.ui.lenkerad(R.ui.lenke(R.t("Del resultatet"), "del"), R.ui.lenke(R.t("Endre oppsett"), "nytt"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
        },
        inn(S) {
          const sp = S.spill;
          if (!sp) return R.gaTil("hjem");
          if (!sp.registrert) {
            sp.registrert = true;
            R.lagre();
          }
          const v = sp.poeng.some((x) => x > 0) ? vinnere(sp) : [];
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
      kort(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.ferdig || rundeFerdig(sp)) return;
        const r = sp.r;
        const k = Number(el.dataset.v);
        if (!r.hender[0].includes(k)) return;
        if (r.fase === "gi") {
          if (r.gitt[0]) return;
          if (sp.valgt.includes(k)) sp.valgt = sp.valgt.filter((x) => x !== k);
          else if (sp.valgt.length < 3) sp.valgt = sp.valgt.concat(k);
          else return R.toast(R.t("Du har valgt tre – trykk på ett for å bytte det ut"));
          R.lyd.klikk();
          return R.vis();
        }
        if (r.tur !== 0) return R.toast(R.t("Vent litt – {navn} tenker", { navn: navn(r.tur) }));
        if (!Hjerter.lovlige(r, 0).includes(k)) {
          R.lyd.feil();
          R.vibrer(30);
          el.classList.remove("risting");
          void el.offsetWidth;
          el.classList.add("risting");
          R.si(`${R.t("{kort} kan ikke legges nå.", { kort: kortnavn(k) })} ${meldingTekst(sp)}`);
          return;
        }
        // A tap during a finished trick sends that trick away at once.
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
      gi(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.r.fase !== "gi" || sp.r.gitt[0] || sp.valgt.length !== 3) return;
        const r = sp.r;
        if (!Hjerter.gi(r, 0, sp.valgt.slice())) return;
        for (let p = 1; p < 4; p++) Hjerter.gi(r, p, Mobil.velgGi(r, p, sp.niva, Math.random));
        sp.valgt = [];
        R.lyd.sveip();
        R.vibrer(12);
        R.vis();
        planleggMobil(FART.start);
      },
      siste(el, e, S) {
        const sp = S.spill;
        const t = sp && sp.r.spilt[sp.r.spilt.length - 1];
        if (!t) return;
        R.ark(`<h2>${esc(R.t("Siste stikk"))}</h2>
          <ul class="hj-siste">${t.kort.map((x) => `<li class="${x.p === t.vinner ? "vinner" : ""}">${KORT.html(x.k, { opp: true })}<span>${esc(navn(x.p))}</span></li>`).join("")}</ul>
          <p class="hjelp">${esc(t.vinner === 0 ? R.t("Du tok stikket.") : R.t("{navn} tok stikket.", { navn: navn(t.vinner) }))}</p>
          ${R.ui.knapp(R.t("Lukk"), "lukk-ark")}`);
      },
      runde(el, e, S) {
        const sp = S.spill;
        if (!sp || !rundeFerdig(sp)) return;
        if (kampFerdig(sp)) return avsluttKamp(S);
        nyRunde(S);
        R.lyd.snu();
        R.gaTil("spill");
      },
      kaaring(el, e, S) {
        if (S.spill && !S.spill.ferdig && rundeFerdig(S.spill) && kampFerdig(S.spill)) avsluttKamp(S);
      },
      del(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        const niva = NIVANAVN[sp.niva].toLowerCase();
        const v = vinnere(sp);
        const stilling = sp.poeng.join("–");
        const tekst = v.includes(0) ? R.t("Jeg slo mobilene i Hjerteknuseren ({niva}) med bare {n} poeng. Klarer du færre?", { niva, n: sp.poeng[0] }) : R.t("Mobilene slo meg i Hjerteknuseren ({niva}), {stilling}. Klarer du bedre?", { niva, stilling });
        R.del(R.t("Hjerteknuseren"), tekst, DEL_URL, { kort: { tittel: R.t("Hjerteknuseren"), linjer: [poengTekst(sp.poeng[0]), R.t("mot tre mobiler · {niva}", { niva })] } });
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
        if (!ferdige && !sp.lagt) {
          S.spill = null;
          R.gaTil("hjem");
          return;
        }
        avsluttKamp(S);
      },
    }),
  });
})();
