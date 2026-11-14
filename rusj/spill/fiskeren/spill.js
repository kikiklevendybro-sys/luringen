/* Fiskeren — Kasino, the Nordic fishing card game: you against one to three phone players, each for
   themselves. Four cards to each and four face up on the table; when the hands are empty, four more
   each until the deck is used up. On your turn play one card from your hand:
   - Ta (take): table cards of the same rank, and/or table cards that add up to the card's value, and
     builds of that value – several groups at once.
   - Bygg (build): put the card on table cards to make a sum you can take next time (you must hold a
     card of that value). A build can be raised by anyone who holds the new value, or doubled
     («dobbel», locked) with more cards of the same value. You may own one build at a time and may
     not lay a card out while you own one.
   - Legg ut: lay the card face up on the table.
   Values: 2–10 as printed, knekt 11, dame 12, konge 13. Ess is 1 on the table and 14 in the hand;
   spar 2 («lille kasino») 2 and 15; ruter 10 («store kasino») 10 and 16.
   Clearing the table is a «tabbe» (1 point). At the end of a round the last taker gets what is left.
   Points: most cards 1, most spades 2, store kasino 2, lille kasino 1, each ess 1, each tabbe 1
   (10 a round plus the tabber; a tie for most cards or spades gives nobody the point). First to the
   goal (11 or 21) after a round; the highest score wins.
   The rules (Kasino) and the phone players (Mobil) are pure functions at the top;
   test/fiskeren.test.mjs loads this file without the kit. */
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
  // Seats: 0 you, 1–3 the phones; play goes 0 → 1 → 2 → 3. A table item is a loose card
  // { t: "k", k } or a build { t: "b", kort: [cards], verdi, eier, dobbel }.
  // A round: { antall, giver, hender: [[card]], bord: [item], bunke: [card], tatt: [[card]],
  //   tabber: [n], sisteTaker, tur, fase ("spill" | "ferdig"), deling (deals done), sist (the last
  //   move: { p, type, k, kort: [cards taken or built], verdi, dobbel, tabbe }), resultat }

  const Kasino = (() => {
    const sortAv = (k) => (k / 13) | 0;
    const verdiAv = (k) => (k % 13) + 1;
    const SPAR = 0;
    const LILLE = 1; // spar 2
    const STORE = 2 * 13 + 9; // ruter 10
    const MAKS_BYGG = 16;
    const bordVerdi = (k) => verdiAv(k);
    const handVerdi = (k) => (k === LILLE ? 15 : k === STORE ? 16 : verdiAv(k) === 1 ? 14 : verdiAv(k));
    const kortI = (x) => (x.t === "b" ? x.kort : [x.k]);
    const gyldig = (k) => Number.isInteger(k) && k >= 0 && k < 52;

    function bland(liste, rng) {
      const a = liste.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    // o: { antall (2–4), giver }
    function nyRunde(o, rng) {
      const antall = Math.min(4, Math.max(2, o.antall | 0));
      const giver = ((o.giver | 0) % antall + antall) % antall;
      const bunke = bland(Array.from({ length: 52 }, (_, i) => i), rng);
      const r = { antall, giver, hender: Array.from({ length: antall }, () => []), bord: [], bunke, tatt: Array.from({ length: antall }, () => []), tabber: new Array(antall).fill(0), sisteTaker: -1, tur: (giver + 1) % antall, fase: "spill", deling: 0, sist: null, resultat: null };
      del(r);
      for (let i = 0; i < 4; i++) r.bord.push({ t: "k", k: r.bunke.shift() });
      return r;
    }
    // Four more to each, starting left of the dealer.
    function del(r) {
      for (let n = 0; n < 4; n++) for (let i = 1; i <= r.antall; i++) r.hender[(r.giver + i) % r.antall].push(r.bunke.shift());
      r.deling++;
    }
    const delinger = (antall) => 1 + (52 - 4 - 4 * antall) / (4 * antall);

    // Can these loose cards be split into groups that each are a card of the same rank as the hand
    // card, or add up to its hand value?
    function kanDele(kort, sum, rang) {
      if (!kort.length) return true;
      const f = kort[0];
      const rest = kort.slice(1);
      if ((verdiAv(f) === rang || bordVerdi(f) === sum) && kanDele(rest, sum, rang)) return true;
      const mal = sum - bordVerdi(f);
      if (mal <= 0) return false;
      // Some of the rest with f make the sum.
      const prov = (i, igjen, valgt) => {
        if (igjen === 0) return kanDele(rest.filter((_, k) => !valgt.includes(k)), sum, rang);
        for (let k = i; k < rest.length; k++) {
          const v = bordVerdi(rest[k]);
          if (v <= igjen && prov(k + 1, igjen - v, valgt.concat(k))) return true;
        }
        return false;
      };
      return prov(0, mal, []);
    }
    // Can these cards be split into groups that each add up to v (table values)?
    function iGrupper(kort, v) {
      if (!kort.length) return true;
      const f = kort[0];
      const rest = kort.slice(1);
      const prov = (i, igjen, valgt) => {
        if (igjen === 0) return iGrupper(rest.filter((_, k) => !valgt.includes(k)), v);
        for (let k = i; k < rest.length; k++) {
          const x = bordVerdi(rest[k]);
          if (x <= igjen && prov(k + 1, igjen - x, valgt.concat(k))) return true;
        }
        return false;
      };
      return bordVerdi(f) <= v && prov(0, v - bordVerdi(f), []);
    }
    // A take: hand card c on these table items (indexes).
    function gyldigFangst(bord, c, valgt) {
      if (!valgt.length || new Set(valgt).size !== valgt.length || valgt.some((i) => !bord[i])) return false;
      const hv = handVerdi(c);
      const lose = [];
      for (const i of valgt) {
        const x = bord[i];
        if (x.t === "b") {
          if (x.verdi !== hv) return false;
        } else lose.push(x.k);
      }
      return kanDele(lose, hv, verdiAv(c));
    }
    const eierBygg = (r, p) => r.bord.findIndex((x) => x.t === "b" && x.eier === p);
    // After playing c, does p still hold a card for every build p owns that stays on the table?
    function holderFor(r, p, c, borte) {
      const i = eierBygg(r, p);
      if (i < 0 || borte.includes(i)) return true;
      return r.hender[p].some((k) => k !== c && handVerdi(k) === r.bord[i].verdi);
    }
    function kanTa(r, p, c, valgt) {
      return r.fase === "spill" && r.tur === p && r.hender[p].includes(c) && gyldigFangst(r.bord, c, valgt) && holderFor(r, p, c, valgt);
    }
    function kanLeggeUt(r, p, c) {
      return r.fase === "spill" && r.tur === p && r.hender[p].includes(c) && eierBygg(r, p) < 0;
    }
    // The builds p can make with c on these table items: [{ verdi, dobbel }].
    function byggValg(r, p, c, valgt) {
      if (r.fase !== "spill" || r.tur !== p || !r.hender[p].includes(c) || !valgt.length || new Set(valgt).size !== valgt.length || valgt.some((i) => !r.bord[i])) return [];
      const items = valgt.map((i) => r.bord[i]);
      const bygg = items.filter((x) => x.t === "b");
      if (bygg.length > 1) return [];
      const b = bygg[0] || null;
      const egen = eierBygg(r, p);
      if (egen >= 0 && !valgt.includes(egen)) return []; // one build at a time
      const lose = items.filter((x) => x.t === "k").map((x) => x.k);
      const deler = [c].concat(lose);
      const sum = deler.reduce((s, k) => s + bordVerdi(k), 0);
      const andre = r.hender[p].filter((k) => k !== c);
      const holder = (v) => andre.some((k) => handVerdi(k) === v);
      const ut = [];
      if (!b) {
        if (lose.length && sum >= 2 && sum <= MAKS_BYGG && holder(sum)) ut.push({ verdi: sum, dobbel: false });
        for (let v = 2; v < sum && v <= MAKS_BYGG; v++) if (sum % v === 0 && holder(v) && iGrupper(deler, v)) ut.push({ verdi: v, dobbel: true });
      } else {
        if (!b.dobbel && b.verdi + sum <= MAKS_BYGG && holder(b.verdi + sum)) ut.push({ verdi: b.verdi + sum, dobbel: false });
        if (sum % b.verdi === 0 && holder(b.verdi) && iGrupper(deler, b.verdi)) ut.push({ verdi: b.verdi, dobbel: true });
      }
      return ut;
    }

    function fjern(r, valgt) {
      const ut = [];
      for (const i of valgt.slice().sort((a, b) => b - a)) ut.unshift(...kortI(r.bord.splice(i, 1)[0]));
      return ut;
    }
    function ta(r, p, c, valgt) {
      if (!kanTa(r, p, c, valgt)) return false;
      r.hender[p].splice(r.hender[p].indexOf(c), 1);
      const kort = fjern(r, valgt);
      r.tatt[p].push(c, ...kort);
      r.sisteTaker = p;
      const tabbe = r.bord.length === 0;
      if (tabbe) r.tabber[p]++;
      r.sist = { p, type: "ta", k: c, kort, tabbe };
      return videre(r);
    }
    function bygg(r, p, c, valgt, valg) {
      const mulige = byggValg(r, p, c, valgt);
      const v = mulige.find((x) => x.verdi === valg.verdi && x.dobbel === !!valg.dobbel);
      if (!v) return false;
      const forst = Math.min(...valgt);
      r.hender[p].splice(r.hender[p].indexOf(c), 1);
      const kort = fjern(r, valgt);
      kort.push(c);
      const plass = Math.min(forst, r.bord.length);
      r.bord.splice(plass, 0, { t: "b", kort, verdi: v.verdi, eier: p, dobbel: v.dobbel });
      r.sist = { p, type: "bygg", k: c, kort, verdi: v.verdi, dobbel: v.dobbel };
      return videre(r);
    }
    function leggUt(r, p, c) {
      if (!kanLeggeUt(r, p, c)) return false;
      r.hender[p].splice(r.hender[p].indexOf(c), 1);
      r.bord.push({ t: "k", k: c });
      r.sist = { p, type: "legg", k: c, kort: [] };
      return videre(r);
    }
    function utfor(r, p, trekk) {
      if (!trekk) return false;
      if (trekk.type === "ta") return ta(r, p, trekk.k, trekk.valgt);
      if (trekk.type === "bygg") return bygg(r, p, trekk.k, trekk.valgt, trekk);
      if (trekk.type === "legg") return leggUt(r, p, trekk.k);
      return false;
    }
    function erLovlig(r, p, trekk) {
      if (!trekk) return false;
      if (trekk.type === "ta") return kanTa(r, p, trekk.k, trekk.valgt);
      if (trekk.type === "legg") return kanLeggeUt(r, p, trekk.k);
      if (trekk.type === "bygg") return byggValg(r, p, trekk.k, trekk.valgt).some((x) => x.verdi === trekk.verdi && x.dobbel === !!trekk.dobbel);
      return false;
    }
    // Next player; new cards when every hand is empty; the end of the round when the deck is too.
    function videre(r) {
      r.tur = (r.tur + 1) % r.antall;
      if (r.hender.every((h) => !h.length)) {
        if (r.bunke.length) {
          del(r);
          r.tur = (r.giver + 1) % r.antall;
        } else {
          const rest = fjern(r, r.bord.map((_, i) => i));
          const mottaker = r.sisteTaker >= 0 ? r.sisteTaker : r.giver;
          r.tatt[mottaker].push(...rest);
          r.restTil = rest.length ? mottaker : -1;
          r.fase = "ferdig";
          r.resultat = oppgjor(r);
        }
      }
      return true;
    }

    // The round's points per player, with what they came from.
    function oppgjor(r) {
      const n = r.antall;
      const kort = r.tatt.map((t) => t.length);
      const spar = r.tatt.map((t) => t.filter((k) => sortAv(k) === SPAR).length);
      const best = (liste) => {
        const m = Math.max(...liste);
        return liste.filter((x) => x === m).length === 1 ? liste.indexOf(m) : -1;
      };
      const flestKort = best(kort);
      const flestSpar = best(spar);
      const rader = [];
      for (let p = 0; p < n; p++) {
        const ess = r.tatt[p].filter((k) => verdiAv(k) === 1).length;
        const store = r.tatt[p].includes(STORE) ? 2 : 0;
        const lille = r.tatt[p].includes(LILLE) ? 1 : 0;
        const d = { kort: flestKort === p ? 1 : 0, spar: flestSpar === p ? 2 : 0, store, lille, ess, tabber: r.tabber[p] };
        rader.push({ ...d, antallKort: kort[p], antallSpar: spar[p], poeng: d.kort + d.spar + d.store + d.lille + d.ess + d.tabber });
      }
      return { rader, poeng: rader.map((x) => x.poeng), flestKort, flestSpar };
    }

    // Every card exactly once (for checking a restored round).
    function hel(r) {
      if (!r || !(r.antall >= 2 && r.antall <= 4) || !Array.isArray(r.hender) || r.hender.length !== r.antall || !Array.isArray(r.tatt) || r.tatt.length !== r.antall || !Array.isArray(r.bord) || !Array.isArray(r.bunke)) return false;
      if (!["spill", "ferdig"].includes(r.fase) || !Number.isInteger(r.tur) || r.tur < 0 || r.tur >= r.antall || !Array.isArray(r.tabber)) return false;
      if (!r.bord.every((x) => x && (x.t === "k" ? gyldig(x.k) : x.t === "b" && Array.isArray(x.kort) && x.kort.length >= 2 && Number.isInteger(x.verdi) && x.eier >= 0 && x.eier < r.antall))) return false;
      const alle = [].concat(...r.hender, ...r.bord.map(kortI), r.bunke, ...r.tatt);
      return alle.length === 52 && new Set(alle).size === 52 && alle.every(gyldig);
    }

    return { sortAv, verdiAv, SPAR, LILLE, STORE, MAKS_BYGG, bordVerdi, handVerdi, kortI, bland, nyRunde, delinger, kanDele, iGrupper, gyldigFangst, eierBygg, kanTa, kanLeggeUt, byggValg, ta, bygg, leggUt, utfor, erLovlig, oppgjor, hel };
  })();

  // ---------- The phone players ----------
  // 1 Lett: takes what it sees about half the time, otherwise lays out a card at random; never builds.
  // 2 Middels: weighs every take, build and card to lay out by the points in it (aces, the two
  //   kasinos, spades, the number of cards, a tabbe) and avoids leaving a tabbe to the next player.
  // 3 Vanskelig: also counts the cards that are still unseen and weighs what the others can take
  //   after its move by how likely they are to hold the card for it; keeps its builds safe.
  // Only what a player at the table can know is used: its own hand, the table and the cards played.

  const Mobil = (() => {
    const K = Kasino;
    const kortVerdi = (k) => 0.15 + (K.sortAv(k) === K.SPAR ? 0.12 : 0) + (K.verdiAv(k) === 1 ? 1 : 0) + (k === K.LILLE ? 1 : 0) + (k === K.STORE ? 2 : 0);
    const sumVerdi = (kort) => kort.reduce((s, k) => s + kortVerdi(k), 0);

    // The groups a hand card can take on its own: single items and sets of loose cards.
    function atomer(bord, rang, hv) {
      const ut = [];
      const lose = [];
      bord.forEach((x, i) => {
        if (x.t === "b") {
          if (x.verdi === hv) ut.push([i]);
        } else {
          if (K.verdiAv(x.k) === rang || K.bordVerdi(x.k) === hv) ut.push([i]);
          lose.push(i);
        }
      });
      const finn = (fra, igjen, valgt) => {
        if (igjen === 0 && valgt.length >= 2) return ut.push(valgt);
        for (let j = fra; j < lose.length; j++) {
          const v = K.bordVerdi(bord[lose[j]].k);
          if (v <= igjen) finn(j + 1, igjen - v, valgt.concat(lose[j]));
        }
      };
      finn(0, hv, []);
      return ut;
    }
    // The best set of separate groups (by `verdi` of the cards taken), or [].
    function besteFangst(bord, rang, hv, verdi) {
      const a = atomer(bord, rang, hv);
      let best = [];
      let bestV = 0;
      let teller = 0;
      const gaa = (i, brukt, valgt, v) => {
        if (++teller > 4000) return;
        if (v > bestV) {
          bestV = v;
          best = valgt;
        }
        for (let j = i; j < a.length; j++) if (a[j].every((x) => !brukt.has(x))) gaa(j + 1, new Set([...brukt, ...a[j]]), valgt.concat(a[j]), v + a[j].reduce((s, x) => s + verdi(bord[x]), 0));
      };
      gaa(0, new Set(), [], 0);
      return best.sort((x, y) => x - y);
    }
    const itemVerdi = (x) => sumVerdi(K.kortI(x)) + 0.01;
    const TENKT = { 14: 0, 15: K.LILLE, 16: K.STORE }; // a hand value → a card that has it
    const kortMedHv = (v) => (v in TENKT ? TENKT[v] : 13 + v - 1); // hjerter of that value (2–13)

    // What the most dangerous next card could take from this table, weighed by how likely it is.
    function risiko(bord, ukjent, niva) {
      if (!bord.length) return 0;
      let verst = 0;
      let sum = 0;
      for (let hv = 2; hv <= 16; hv++) {
        const k = kortMedHv(hv);
        const rang = K.verdiAv(k);
        const f = besteFangst(bord, rang, hv, itemVerdi);
        if (!f.length) continue;
        let v = f.reduce((s, i) => s + itemVerdi(bord[i]), 0) + (f.length === bord.length ? 1.2 : 0);
        if (niva >= 3) {
          const andel = ukjent.filter((x) => K.handVerdi(x) === hv).length / Math.max(1, ukjent.length);
          v *= Math.min(1, andel * 4);
          sum += v;
        }
        verst = Math.max(verst, v);
      }
      return niva >= 3 ? sum * 0.35 + verst * 0.3 : verst * 0.6;
    }
    function ukjenteKort(r, p, sett) {
      const kjent = new Set([...r.hender[p], ...r.bord.flatMap(K.kortI), ...r.tatt.flat(), ...sett]);
      const ut = [];
      for (let k = 0; k < 52; k++) if (!kjent.has(k)) ut.push(k);
      return ut;
    }

    // Every move worth thinking about: the best take per card, builds of up to three table items,
    // and laying each card out.
    function trekkListe(r, p) {
      const hand = r.hender[p];
      const ut = [];
      for (const c of hand) {
        const f = besteFangst(r.bord, K.verdiAv(c), K.handVerdi(c), itemVerdi);
        if (f.length && K.kanTa(r, p, c, f)) ut.push({ type: "ta", k: c, valgt: f });
        if (K.kanLeggeUt(r, p, c)) ut.push({ type: "legg", k: c });
        const n = r.bord.length;
        for (let a = 0; a < n; a++) {
          const sett = [[a]];
          for (let b = a + 1; b < n; b++) {
            sett.push([a, b]);
            for (let d = b + 1; d < n; d++) sett.push([a, b, d]);
          }
          for (const valgt of sett) for (const v of K.byggValg(r, p, c, valgt)) ut.push({ type: "bygg", k: c, valgt, verdi: v.verdi, dobbel: v.dobbel });
        }
      }
      // A take that keeps a build p owns but leaves nothing to take it with is not in the list
      // (kanTa); if the best take for a card is not allowed, a smaller one may be.
      if (!ut.length) for (const c of hand) for (let i = 0; i < r.bord.length; i++) if (K.kanTa(r, p, c, [i])) ut.push({ type: "ta", k: c, valgt: [i] });
      return ut;
    }

    function poengFor(r, p, t, niva, sett) {
      const kopi = JSON.parse(JSON.stringify(r));
      if (!K.utfor(kopi, p, t)) return -Infinity;
      const ukjent = ukjenteKort(r, p, sett);
      const risk = kopi.fase === "spill" ? risiko(kopi.bord, ukjent, niva) : 0;
      if (t.type === "ta") {
        const kort = [t.k].concat(t.valgt.flatMap((i) => K.kortI(r.bord[i])));
        return sumVerdi(kort) + (kopi.sist && kopi.sist.tabbe ? 1.3 : 0) - risk;
      }
      if (t.type === "bygg") {
        const b = kopi.bord.find((x) => x.t === "b" && x.eier === p);
        const fanger = r.hender[p].filter((k) => k !== t.k && K.handVerdi(k) === t.verdi);
        // A build pays off next turn unless somebody else holds the value (Vanskelig counts them).
        const andre = niva >= 3 ? ukjent.filter((k) => K.handVerdi(k) === t.verdi).length / Math.max(1, ukjent.length) : 0.15;
        return (sumVerdi(b ? b.kort : []) + sumVerdi(fanger.slice(0, 1))) * (0.8 - Math.min(0.6, andre * 2)) + 0.15 - risk * 0.8;
      }
      return -kortVerdi(t.k) * 0.9 - (K.handVerdi(t.k) >= 14 ? 0.2 : 0) - risk;
    }

    // { a legal move for p } — always legal.
    function velgTrekk(r, p, niva, rng, sett) {
      rng = rng || Math.random;
      const liste = trekkListe(r, p).filter((t) => K.erLovlig(r, p, t));
      if (niva <= 1) {
        const tak = liste.filter((t) => t.type === "ta");
        if (tak.length && rng() < 0.6) return tak[Math.floor(rng() * tak.length)];
        const legg = liste.filter((t) => t.type === "legg");
        const fra = legg.length ? legg : liste;
        return fra[Math.floor(rng() * fra.length)];
      }
      let best = liste[0];
      let bestV = -Infinity;
      for (const t of liste) {
        const v = poengFor(r, p, t, niva, sett || []) + rng() * 0.05;
        if (v > bestV) {
          bestV = v;
          best = t;
        }
      }
      return best;
    }

    return { kortVerdi, atomer, besteFangst, risiko, trekkListe, velgTrekk };
  })();

  const R = window.Rusj;
  if (!R) {
    // Loaded without the kit (unit tests in node): only the rules, the phone players and the cards.
    window.Fiskeren = { Kasino, Mobil, KORT };
    return;
  }

  // ---------- The game on the page ----------

  const esc = R.esc;
  const { sortAv, verdiAv, handVerdi, LILLE, STORE } = Kasino;
  const NIVANAVN = { 1: R.t("Lett"), 2: R.t("Middels"), 3: R.t("Vanskelig") };
  const NIVATEKST = {
    1: R.t("Mobilene tar det de ser innimellom, og bygger aldri. Fint for å lære."),
    2: R.t("Mobilene jakter på ess og kasinoer, bygger og passer på tabbene."),
    3: R.t("Mobilene husker kortene som er ute, og vet hva du kan ta."),
  };
  const MAL = [["11", R.t("Til 11")], ["21", R.t("Til 21")]];
  const MAL_TEKST = {
    11: R.t("En kort kamp: den som først når 11 poeng etter en runde, vinner."),
    21: R.t("Vanlig lengde: den som først når 21 poeng etter en runde, vinner."),
  };
  const VERDIORD = ["", R.t("ess"), R.t("to"), R.t("tre"), R.t("fire"), R.t("fem"), R.t("seks"), R.t("sju"), R.t("åtte"), R.t("ni"), R.t("ti"), R.t("knekt"), R.t("dame"), R.t("konge")];
  const FARGENAVN = [R.t("spar"), R.t("hjerter"), R.t("ruter"), R.t("kløver")];
  const kortnavn = (k) => R.t("{farge} {verdi}", { farge: FARGENAVN[sortAv(k)], verdi: VERDIORD[verdiAv(k)] });
  const FART = { tenk: 900, vis: 1100, start: 900 };
  const DEL_URL = (document.querySelector('link[rel="canonical"]') || { href: "https://rusj.no/fiskeren/" }).href;
  const MERKE = "klassiker-fiskeren";
  let H;

  // S.spill: { niva, mal, antall, runde (rounds started), giver, poeng [per seat], r (the round),
  //   lagt (the round's points are counted), ferdig, valgt: { k, bord: [indexes] } }
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
  const poengTekst = (n) => R.flertall(n, "poeng", "poeng");
  const sett = (sp) => sp.sett || [];

  // ---------- Sounds ----------
  const lyd = {
    legg: () => {
      R.lyd.tone(520, 0, 0.06, "triangle", 0.1);
      R.lyd.stoy(0, 0.08, 0.14, 2400);
    },
    ta: () => {
      R.lyd.stoy(0, 0.16, 0.12, 900);
      R.lyd.tone(660, 0.05, 0.1, "triangle", 0.08);
    },
    tabbe: () => [523, 659, 784].forEach((f, i) => R.lyd.tone(f, i * 0.08, 0.14, "triangle", 0.1)),
    bygg: () => R.lyd.tone(440, 0, 0.12, "sine", 0.08, 560),
  };

  // ---------- Texts ----------

  function trekkTekst(r, s) {
    if (!s) return "";
    const hvem = navn(s.p);
    const kort = kortnavn(s.k);
    if (s.type === "legg") return s.p === 0 ? R.t("Du la ut {kort}.", { kort }) : R.t("{navn} la ut {kort}.", { navn: hvem, kort });
    if (s.type === "bygg") {
      const v = s.dobbel ? R.t("dobbel {n}", { n: s.verdi }) : R.t("bygg {n}", { n: s.verdi });
      return s.p === 0 ? R.t("Du bygde {bygg} med {kort}.", { bygg: v, kort }) : R.t("{navn} bygde {bygg} med {kort}.", { navn: hvem, bygg: v, kort });
    }
    const n = s.kort.length;
    if (s.tabbe) return s.p === 0 ? R.t("Tabbe! Du tok hele bordet med {kort}.", { kort }) : R.t("Tabbe! {navn} tok hele bordet med {kort}.", { navn: hvem, kort });
    return s.p === 0 ? R.t("Du tok {n} kort med {kort}.", { n, kort }) : R.t("{navn} tok {n} kort med {kort}.", { navn: hvem, n, kort });
  }

  function meldingTekst(sp) {
    const r = sp.r;
    if (r.fase === "ferdig") return "";
    if (r.tur !== 0) return R.t("{navn} tenker …", { navn: navn(r.tur) });
    const v = sp.valgt;
    if (!v || v.k == null) return Kasino.eierBygg(r, 0) >= 0 ? R.t("Din tur. Du har et bygg – ta det eller bygg videre.") : R.t("Din tur – velg et kort fra hånda.");
    if (!v.bord.length) return R.t("Trykk på kortene på bordet du vil ta eller bygge med, eller legg ut kortet.");
    const fangst = Kasino.kanTa(r, 0, v.k, v.bord);
    const bygg = Kasino.byggValg(r, 0, v.k, v.bord);
    if (fangst) return R.t("Du kan ta disse kortene.");
    if (bygg.length) return R.t("Du kan bygge {valg}.", { valg: R.ramsOpp(bygg.map((b) => (b.dobbel ? R.t("dobbel {n}", { n: b.verdi }) : R.t("bygg {n}", { n: b.verdi })))) });
    return R.t("Det går verken å ta eller bygge med de kortene.");
  }

  // ---------- Flow ----------

  function nyKamp(S) {
    const o = S.oppsett;
    const antall = o.motstandere + 1;
    const giver = Math.floor(Math.random() * antall);
    S.spill = { niva: o.niva, mal: o.mal, antall, runde: 0, giver, poeng: new Array(antall).fill(0), r: null, lagt: false, ferdig: false, valgt: null, sett: [] };
    nyRunde(S);
    R.statistikk("start", { niva: o.niva, mal: o.mal, spillere: antall });
  }
  function nyRunde(S) {
    const sp = S.spill;
    sp.r = Kasino.nyRunde({ antall: sp.antall, giver: (sp.giver + sp.runde) % sp.antall }, rng());
    sp.runde++;
    sp.lagt = false;
    sp.valgt = null;
    sp.sett = [];
    vis = null;
  }
  function etterTrekk(S) {
    const sp = S.spill;
    const r = sp.r;
    if (r.sist) sp.sett.push(r.sist.k);
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

  // ---------- The phone players' turns: first show the card and what it goes for, then do it ----------
  let mobilId = null;
  let vis = null; // { p, trekk } shown before it happens
  function stoppMobil() {
    clearTimeout(mobilId);
    mobilId = null;
  }
  function planleggMobil(ms) {
    const S = R.S;
    const sp = S && S.spill;
    if (mobilId || !sp || sp.ferdig || S.skjerm !== "spill" || sp.r.fase !== "spill" || sp.r.tur === 0) return;
    mobilId = setTimeout(mobilSteg, ms != null ? ms : FART.tenk);
  }
  function mobilSteg() {
    mobilId = null;
    const S = R.S;
    const sp = S && S.spill;
    if (!sp || sp.ferdig || S.skjerm !== "spill" || sp.r.fase !== "spill" || sp.r.tur === 0) return;
    if (R.arkApent() || document.hidden) return planleggMobil(500);
    const p = sp.r.tur;
    if (!vis || vis.p !== p) {
      const t = Mobil.velgTrekk(sp.r, p, sp.niva, Math.random, sett(sp));
      vis = { p, trekk: t };
      R.vis();
      mobilId = setTimeout(mobilSteg, FART.vis);
      return;
    }
    const t = vis.trekk;
    vis = null;
    if (!Kasino.erLovlig(sp.r, p, t) || !Kasino.utfor(sp.r, p, t)) {
      // Never stuck: lay out (or take) the first card that can be played.
      const nod = Mobil.trekkListe(sp.r, p).find((x) => Kasino.erLovlig(sp.r, p, x));
      Kasino.utfor(sp.r, p, nod);
    }
    spillLyd(sp.r.sist);
    etterTrekk(S);
    R.vis();
    if (sp.r.sist) R.si(trekkTekst(sp.r, sp.r.sist));
    planleggMobil();
  }
  function spillLyd(s) {
    if (!s) return;
    if (s.type === "ta" && s.tabbe) lyd.tabbe();
    else if (s.type === "ta") lyd.ta();
    else if (s.type === "bygg") lyd.bygg();
    else lyd.legg();
  }

  // ---------- Markup ----------

  const REKKE = [0, 1, 3, 2];
  const sorter = (hand) => hand.slice().sort((a, b) => REKKE.indexOf(sortAv(a)) - REKKE.indexOf(sortAv(b)) || verdiAv(a) - verdiAv(b));

  function seteHtml(sp, p) {
    const r = sp.r;
    const aktiv = r.fase === "spill" && r.tur === p;
    const n = r.hender[p].length;
    return `<div class="ka-sete${aktiv ? " aktiv" : ""}">
      <span class="ka-ava">${R.avatar(avatarNr(p))}${aktiv ? '<span class="ka-tenker" aria-hidden="true"><i></i><i></i><i></i></span>' : ""}</span>
      <span class="ka-info"><b class="ka-navn">${esc(navn(p))}</b><span class="ka-tall">${esc(R.t("{n} p", { n: sp.poeng[p] }))} · ${esc(R.t("{n} tatt", { n: r.tatt[p].length }))}${r.tabber[p] ? ` · ${esc(R.t("{n} tabbe|{n} tabber", { n: r.tabber[p] }))}` : ""}</span></span>
      <span class="ka-bak" aria-label="${esc(R.flertall(n, "kort", "kort"))}">${Array.from({ length: n }, () => KORT.html(null)).join("")}</span>
    </div>`;
  }
  function byggNavn(x) {
    return x.dobbel ? R.t("Dobbel {n}", { n: x.verdi }) : R.t("Bygg {n}", { n: x.verdi });
  }
  // The table: loose cards and builds; what can be tapped, what is chosen, what a phone goes for.
  function bordHtml(sp) {
    const r = sp.r;
    const min = r.fase === "spill" && r.tur === 0 && !vis;
    const v = sp.valgt || { k: null, bord: [] };
    const mal = vis && vis.trekk && vis.trekk.valgt ? new Set(vis.trekk.valgt) : new Set();
    const kan = new Set();
    if (min && v.k != null) for (const i of Mobil.besteFangst(r.bord, verdiAv(v.k), handVerdi(v.k), () => 1)) kan.add(i);
    const items = r.bord
      .map((x, i) => {
        const valgt = v.bord.includes(i);
        const kl = ["ka-ting", x.t === "b" ? "ka-bygg" : "", valgt ? "valgt" : "", kan.has(i) && !valgt ? "kan" : "", mal.has(i) ? "mal" : "", x.t === "b" && x.eier === 0 ? "min" : ""].filter(Boolean).join(" ");
        const etikett = x.t === "b" ? `${byggNavn(x)} (${navn(x.eier)}): ${x.kort.map(kortnavn).join(", ")}` : kortnavn(x.k);
        const innhold =
          x.t === "b"
            ? `<span class="ka-stabel" style="--n:${x.kort.length}">${x.kort.map((k, j) => `<span style="--j:${j}">${KORT.html(k, { opp: true })}</span>`).join("")}</span><span class="ka-merke">${esc(byggNavn(x))}<small>${esc(x.eier === 0 ? R.t("ditt") : navn(x.eier))}</small></span>`
            : KORT.html(x.k, { opp: true });
        return `<button class="${kl}" data-h="bord" data-v="${i}" aria-label="${esc(etikett)}" aria-pressed="${valgt}"${min && v.k != null ? "" : ' aria-disabled="true"'}>${innhold}</button>`;
      })
      .join("");
    const vist = vis ? `<div class="ka-vist" aria-hidden="true"><span>${esc(navn(vis.p))}</span>${KORT.html(vis.trekk.k, { opp: true })}</div>` : "";
    return `<div class="ka-bord${r.bord.length ? "" : " tomt"}" role="group" aria-label="${esc(R.t("Bordet"))}">${items || `<p class="ka-tom">${esc(R.t("Tomt bord"))}</p>`}${vist}</div>`;
  }
  function handHtml(sp) {
    const r = sp.r;
    const min = r.fase === "spill" && r.tur === 0 && !vis;
    const v = sp.valgt || { k: null };
    return `<div class="ka-hand${min ? " min-tur" : ""}" role="group" aria-label="${esc(R.t("Kortene dine"))}">${sorter(r.hender[0])
      .map((k) => `<button class="ka-hk${v.k === k ? " valgt" : ""}" data-h="kort" data-v="${k}" aria-label="${esc(kortnavn(k))}${handVerdi(k) !== verdiAv(k) ? esc(", " + R.t("teller {n} på hånda", { n: handVerdi(k) })) : ""}" aria-pressed="${v.k === k}"${min ? "" : ' aria-disabled="true"'}>${KORT.html(k, { opp: true })}${handVerdi(k) !== verdiAv(k) ? `<i class="ka-hv" aria-hidden="true">${handVerdi(k)}</i>` : ""}</button>`)
      .join("")}</div>`;
  }
  function dokkHtml(sp) {
    const r = sp.r;
    const avslutt = R.ui.lenke(R.t("Avslutt"), "avslutt");
    if (rundeFerdig(sp)) return R.ui.dokk(R.ui.knapp(R.t("Se rundens poeng"), "poeng", { ikon: "🎣" }), R.ui.lenkerad(avslutt));
    const min = r.tur === 0 && !vis;
    const v = sp.valgt || { k: null, bord: [] };
    const k = v.k;
    const kanTa = min && k != null && (v.bord.length ? Kasino.kanTa(r, 0, k, v.bord) : !!autoFangst(sp).length);
    const kanBygg = min && k != null && v.bord.length && Kasino.byggValg(r, 0, k, v.bord).length > 0;
    const kanLegge = min && k != null && Kasino.kanLeggeUt(r, 0, k);
    return R.ui.dokk(
      `<div class="ka-knapper">
        <button class="knapp" data-h="ta"${kanTa ? "" : " disabled"}>${esc(R.t("Ta"))}</button>
        <button class="knapp-2" data-h="bygg"${kanBygg ? "" : " disabled"}>${esc(R.t("Bygg"))}</button>
        <button class="knapp-2" data-h="legg"${kanLegge ? "" : " disabled"}>${esc(R.t("Legg ut"))}</button>
      </div>`,
      R.ui.lenkerad(R.ui.lenke(R.t("Bordet forklart"), "hjelp"), avslutt),
    );
  }
  // «Ta» with nothing chosen on the table: the most cards this card can take.
  function autoFangst(sp) {
    const r = sp.r;
    const k = sp.valgt && sp.valgt.k;
    if (k == null) return [];
    const f = Mobil.besteFangst(r.bord, verdiAv(k), handVerdi(k), (x) => Kasino.kortI(x).length * 10 + Mobil.kortVerdi(Kasino.kortI(x)[0]));
    return f.length && Kasino.kanTa(r, 0, k, f) ? f : [];
  }

  function spillHtml(S) {
    const sp = S.spill;
    const r = sp.r;
    const ferdig = rundeFerdig(sp);
    const sist = vis ? R.t("{navn} spiller {kort} …", { navn: navn(vis.p), kort: kortnavn(vis.trekk.k) }) : trekkTekst(r, r.sist);
    const melding = ferdig ? (r.restTil >= 0 ? R.t("Runden er ferdig. {navn} får resten av bordet.", { navn: navn(r.restTil) }) : R.t("Runden er ferdig.")) : meldingTekst(sp);
    const igjen = r.bunke.length;
    return `
      <h1 class="vh" id="skjerm-tittel">${esc(R.t("Fiskeren, runde {n}", { n: sp.runde }))}</h1>
      <div class="ka-seter" data-n="${sp.antall - 1}">${Array.from({ length: sp.antall - 1 }, (_, i) => seteHtml(sp, i + 1)).join("")}</div>
      <div class="ka-midt">
        <span class="ka-bunke" aria-label="${esc(R.t("{n} kort igjen i bunken", { n: igjen }))}">${igjen ? KORT.html(null) : ""}<b>${igjen}</b></span>
        ${bordHtml(sp)}
      </div>
      <div class="ka-melding${!ferdig && r.tur === 0 ? " din" : ""}" role="status">
        ${sist ? `<span class="ka-sist">${esc(sist)}</span>` : ""}
        <b>${esc(melding)}</b>
      </div>
      <div class="ka-handramme">
        <div class="ka-handtopp"><span>${esc(R.t("Du · {p} · {n} tatt", { p: R.t("{n} p", { n: sp.poeng[0] }), n: r.tatt[0].length }))}${r.tabber[0] ? ` · ${esc(R.t("{n} tabbe|{n} tabber", { n: r.tabber[0] }))}` : ""}</span></div>
        ${handHtml(sp)}
      </div>
      ${dokkHtml(sp)}`;
  }

  function poengTabellHtml(sp) {
    const res = sp.r.resultat;
    const seter = Array.from({ length: sp.antall }, (_, p) => p);
    const rad = (tittel, f, hjelp) => `<tr><th scope="row">${esc(tittel)}${hjelp ? `<small>${esc(hjelp)}</small>` : ""}</th>${seter.map((p) => `<td>${f(res.rader[p], p)}</td>`).join("")}</tr>`;
    const tall = (x) => (x ? `<b>${x}</b>` : `<span class="ka-null">–</span>`);
    return `<div class="ka-tabell-ramme"><table class="ka-tabell">
      <thead><tr><th scope="col"><span class="vh">${esc(R.t("Poeng"))}</span></th>${seter.map((p) => `<th scope="col">${R.avatar(avatarNr(p))}<span>${esc(navn(p))}</span></th>`).join("")}</tr></thead>
      <tbody>
        ${rad(R.t("Flest kort"), (x) => `${tall(x.kort)}<small>${x.antallKort}</small>`, R.t("1 poeng"))}
        ${rad(R.t("Flest spar"), (x) => `${tall(x.spar)}<small>${x.antallSpar}</small>`, R.t("2 poeng"))}
        ${rad(R.t("Store kasino"), (x) => tall(x.store), R.t("ruter 10"))}
        ${rad(R.t("Lille kasino"), (x) => tall(x.lille), R.t("spar 2"))}
        ${rad(R.t("Ess"), (x) => tall(x.ess))}
        ${rad(R.t("Tabber"), (x) => tall(x.tabber))}
      </tbody>
      <tfoot>
        ${rad(R.t("Runden"), (x) => `<b>${x.poeng}</b>`)}
        ${rad(R.t("Totalt"), (x, p) => `<b class="ka-tot">${sp.poeng[p]}</b>`)}
      </tfoot>
    </table></div>`;
  }

  function rekordHtml(S, niva) {
    const r = S.rekord[niva];
    if (!r || !(r.seier + r.tap)) return "";
    return `<span><b>${r.seier}</b> ${esc(R.t("seier|seirer", { n: r.seier }))}</span><span><b>${r.tap}</b> ${esc(R.t("tap|tap", { n: r.tap }))}</span>`;
  }

  // ---------- Screens ----------

  R.start({
    id: "fiskeren",
    versjon: 1,
    pagar,
    _motor: { Kasino, Mobil },

    tilstand: () => ({ oppsett: { motstandere: 1, niva: 2, mal: "21" }, spill: null, rekord: {} }),

    lastet(S) {
      const o = (S.oppsett = Object.assign({ motstandere: 1, niva: 2, mal: "21" }, S.oppsett));
      if (![1, 2, 3].includes(o.niva)) o.niva = 2;
      if (![1, 2, 3].includes(o.motstandere)) o.motstandere = 1;
      if (!MAL.some(([m]) => m === o.mal)) o.mal = "21";
      if (!S.rekord || typeof S.rekord !== "object") S.rekord = {};
      const sp = S.spill;
      if (sp) {
        const ok = [1, 2, 3].includes(sp.niva) && MAL.some(([m]) => m === sp.mal) && Array.isArray(sp.poeng) && sp.poeng.length === sp.antall && Kasino.hel(sp.r) && sp.r.antall === sp.antall;
        if (!ok) S.spill = null;
        else {
          if (!Array.isArray(sp.sett)) sp.sett = [];
          if (sp.valgt && !(sp.r.hender[0].includes(sp.valgt.k) && Array.isArray(sp.valgt.bord))) sp.valgt = null;
        }
      }
      if (!S.spill && ["spill", "runde", "slutt"].includes(S.skjerm)) S.skjerm = "hjem";
      if (S.spill && S.skjerm === "slutt" && !S.spill.ferdig) S.skjerm = "spill";
      if (S.spill && ["spill", "runde"].includes(S.skjerm) && S.spill.ferdig) S.skjerm = "slutt";
      if (S.spill && S.skjerm === "runde" && !rundeFerdig(S.spill)) S.skjerm = "spill";
    },

    regler: {
      intro: R.t("Kasino – fiskespillet fra Norden. Fisk kort fra bordet med kortene på hånda, og samle ess, kasinoer, spar og flest kort."),
      steg: [
        [R.t("Ta"), R.t("Velg et kort fra hånda. Det tar kort på bordet med samme verdi, og kort som til sammen blir verdien – flere grupper på én gang. Ta hele bordet, og du får en tabbe.")],
        [R.t("Bygg eller legg ut"), R.t("Legg kortet på kort på bordet for å bygge en sum du kan ta neste gang – du må ha et kort med den verdien på hånda. Kan du ikke ta eller bygge, legger du kortet ut på bordet.")],
        [R.t("Poeng"), R.t("Flest kort gir 1 poeng, flest spar 2, store kasino (ruter 10) 2, lille kasino (spar 2) 1, hvert ess 1 og hver tabbe 1. Først til målet etter en runde vinner.")],
      ],
      tips: [
        R.t("Knekt er 11, dame 12 og konge 13. Ess er 1 på bordet, men 14 på hånda. Spar 2 er 15 og ruter 10 er 16 på hånda."),
        R.t("Et kort tar alltid et kort med samme valør – også ess på ess."),
        R.t("Et bygg kan bygges videre av alle som har den nye verdien. Legger noen til flere kort med samme sum, blir det en dobbel – den kan bare tas."),
        R.t("Du kan bare eie ett bygg om gangen, og du kan ikke legge ut et kort mens du har et bygg på bordet."),
        R.t("Trykk «Ta» uten å velge kort på bordet, så tar kortet ditt så mye som mulig."),
        R.t("Fire kort hver og fire på bordet; nye kort deles når alle hendene er tomme. Den som tok sist, får det som ligger igjen når kortstokken er tom."),
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
              slagordHtml: `${esc(R.t("Fisk kortene fra bordet."))}<br><em>${esc(R.t("Ess, kasinoer og tabber gir poeng."))}</em>`,
              knapperHtml: R.ui.startKnapper({
                pagar: aktiv,
                fortsettTekst: aktiv ? R.t("Fortsett · runde {n}", { n: sp.runde }) : "",
                ekstraHtml: R.ui.lenke(R.t("Slik spiller du"), "regler"),
              }),
              merker: [
                ["1–3", R.t("mobiler å slå")],
                ["3", R.t("nivåer")],
                ["52", R.t("kort")],
              ],
            }) +
            (rek.length ? `<section class="ka-rekorder" aria-label="${esc(R.t("Mot mobilen"))}"><p class="etikett">${esc(R.t("Mot mobilen"))}</p><ul>${rek.map(([n, h]) => `<li><b class="ka-niva">${esc(NIVANAVN[n])}</b>${h}</li>`).join("")}</ul></section>` : "")
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
              <h2>${esc(R.t("Hvor mange mobiler?"))}</h2>
              ${R.ui.seg("motstandere", [["1", R.t("Én")], ["2", R.t("To")], ["3", R.t("Tre")]], String(o.motstandere), { etikett: R.t("Hvor mange mobiler?") })}
            </section>
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
            ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start", { variant: "stor", ikon: "🎣" }))}`;
        },
      },

      spill: {
        tittel: (S) => (S.spill ? R.t("Runde {n}", { n: S.spill.runde }) : ""),
        tilbake: "hjem",
        vis: spillHtml,
        inn(S) {
          if (!S.spill) return R.gaTil("hjem");
          vis = null;
          R.holdVaken();
          planleggMobil(FART.start);
        },
        etter() {
          planleggMobil();
        },
        ut() {
          stoppMobil();
          vis = null;
        },
      },

      runde: {
        tittel: (S) => (S.spill ? R.t("Runde {n}", { n: S.spill.runde }) : ""),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const res = sp.r.resultat;
          const ferdig = kampFerdig(sp);
          const v = vinnere(sp);
          let tittel;
          if (ferdig) tittel = v.length === 1 ? (v[0] === 0 ? R.t("Du vinner kampen!") : R.t("{navn} vinner kampen!", { navn: navn(v[0]) })) : R.t("{navn} deler seieren!", { navn: R.ramsOpp(v.map(navn)) });
          else tittel = res.poeng[0] === Math.max(...res.poeng) ? R.t("Du fikk flest poeng i runden!") : R.t("Du fikk {poeng} i runden.", { poeng: poengTekst(res.poeng[0]) });
          return `
            <h1 id="skjerm-tittel" class="ka-rundetittel">${esc(tittel)}</h1>
            <p class="ka-mal">${esc(R.t("Først til {n} poeng", { n: sp.mal }))}</p>
            ${poengTabellHtml(sp)}
            ${R.ui.dokk(ferdig ? R.ui.knapp(R.t("Se kåringen"), "kaaring", { ikon: "🏆" }) : R.ui.knapp(R.t("Ny runde"), "ny-runde", { ikon: "🎣" }), R.ui.lenkerad(R.ui.lenke(R.t("Avslutt"), "avslutt")))}`;
        },
        inn(S) {
          const sp = S.spill;
          if (!sp || !rundeFerdig(sp)) return R.gaTil(sp ? "spill" : "hjem");
          R.slippVaken();
          const res = sp.r.resultat;
          if (kampFerdig(sp) && vinnere(sp).includes(0)) {
            R.lyd.fanfare();
            R.konfetti();
          } else if (res.poeng[0] === Math.max(...res.poeng)) R.lyd.riktig();
          else R.lyd.pling();
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
          const tekst = duVant ? R.t("Godt jobba! Du fisket best.") : v.length ? R.t("Godt kjempa! Neste gang napper det for deg.") : "";
          const rader = Array.from({ length: sp.antall }, (_, p) => ({ navn: navn(p), i: avatarNr(p), poeng: sp.poeng[p] }));
          const rek = rekordHtml(S, sp.niva);
          return `
            ${R.ui.banner({ tittel, etikett, tekst, stemning: v.length && !duVant ? "lei" : v.length ? "jubel" : "" })}
            ${R.ui.pall(rader)}
            ${R.ui.poengliste(rader)}
            ${rek ? `<p class="ka-rekordlinje"><span class="etikett">${esc(R.t("Mot mobilen"))} · ${esc(NIVANAVN[sp.niva].toLowerCase())}</span>${rek}</p>` : ""}
            ${R.ui.flereSpill({ antall: 1 })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen", { ikon: "🎣" }), R.ui.lenkerad(R.ui.lenke(R.t("Del resultatet"), "del"), R.ui.lenke(R.t("Endre oppsett"), "nytt"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
        },
        inn(S) {
          const sp = S.spill;
          if (!sp) return R.gaTil("hjem");
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
        if (S.spill) R.gaTil(S.spill.ferdig ? "slutt" : rundeFerdig(S.spill) && S.spill.lagt ? "runde" : "spill");
      },
      motstandere(el, e, S) {
        S.oppsett.motstandere = R.klamp(Number(el.dataset.v) || 1, 1, 3);
        R.vis();
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
        if (r.tur !== 0 || vis) return R.toast(R.t("Vent litt – {navn} tenker", { navn: navn(r.tur) }));
        if (sp.valgt && sp.valgt.k === k) sp.valgt = null;
        else sp.valgt = { k, bord: sp.valgt ? sp.valgt.bord : [] };
        R.lyd.klikk();
        R.vis();
      },
      bord(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.ferdig || rundeFerdig(sp) || sp.r.tur !== 0 || vis) return;
        const i = Number(el.dataset.v);
        if (!sp.r.bord[i]) return;
        if (!sp.valgt || sp.valgt.k == null) return R.toast(R.t("Velg et kort fra hånda først"));
        const b = sp.valgt.bord;
        sp.valgt.bord = b.includes(i) ? b.filter((x) => x !== i) : b.concat(i);
        R.lyd.klikk();
        R.vis();
      },
      ta(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.r.tur !== 0 || vis || !sp.valgt) return;
        const valgt = sp.valgt.bord.length ? sp.valgt.bord : autoFangst(sp);
        gjor(S, { type: "ta", k: sp.valgt.k, valgt });
      },
      async bygg(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.r.tur !== 0 || vis || !sp.valgt || !sp.valgt.bord.length) return;
        const valg = Kasino.byggValg(sp.r, 0, sp.valgt.k, sp.valgt.bord);
        if (!valg.length) return;
        let v = valg[0];
        if (valg.length > 1) {
          const fortsatt = R.vakt();
          const svar = await R.velgIArk(
            R.t("Hva vil du bygge?"),
            valg.map((x, i) => ({ v: String(i), tekst: x.dobbel ? R.t("Dobbel {n}", { n: x.verdi }) : R.t("Bygg {n}", { n: x.verdi }) })),
          );
          if (!fortsatt() || svar == null) return;
          v = valg[Number(svar)];
          if (!v) return;
        }
        gjor(S, { type: "bygg", k: sp.valgt.k, valgt: sp.valgt.bord.slice(), verdi: v.verdi, dobbel: v.dobbel });
      },
      legg(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.r.tur !== 0 || vis || !sp.valgt) return;
        gjor(S, { type: "legg", k: sp.valgt.k });
      },
      hjelp() {
        R.ark(`<h2 id="ark-tittel">${esc(R.t("Bordet forklart"))}</h2>
          <ol class="ka-forklar">
            <li>${esc(R.t("Trykk på et kort fra hånda. Kortene på bordet det kan ta, lyser opp."))}</li>
            <li>${esc(R.t("Trykk «Ta» for å ta så mye som mulig – eller velg selv kortene på bordet først."))}</li>
            <li>${esc(R.t("For å bygge: velg kortene på bordet du vil legge kortet ditt på, og trykk «Bygg»."))}</li>
            <li>${esc(R.t("«Legg ut» legger kortet på bordet."))}</li>
          </ol>
          <p class="hjelp">${esc(R.t("Tallet i hjørnet av et kort på hånda er verdien det har der: ess 14, spar 2 15 og ruter 10 16."))}</p>
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
        const stilling = sp.poeng.join("–");
        const tekst = v.includes(0) ? R.t("Jeg slo mobilen i kasino i Fiskeren ({niva}), {stilling}. Klarer du det?", { niva, stilling }) : R.t("Mobilen slo meg i kasino i Fiskeren ({niva}), {stilling}. Klarer du bedre?", { niva, stilling });
        R.del(R.t("Fiskeren"), tekst, DEL_URL, { kort: { tittel: R.t("Fiskeren"), linjer: [poengTekst(sp.poeng[0]), stilling, R.t("kasino mot mobilen · {niva}", { niva })] } });
      },
      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        const fortsatt = R.vakt();
        stoppMobil();
        vis = null;
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

  function gjor(S, t) {
    const sp = S.spill;
    const r = sp.r;
    if (!Kasino.erLovlig(r, 0, t)) {
      R.lyd.feil();
      R.vibrer(30);
      return R.toast(R.t("Det går ikke – se «Bordet forklart»"));
    }
    Kasino.utfor(r, 0, t);
    sp.valgt = null;
    spillLyd(r.sist);
    R.vibrer(r.sist && r.sist.tabbe ? [30, 40, 30] : 12);
    etterTrekk(S);
    R.vis();
    planleggMobil();
  }
})();
