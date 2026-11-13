/* Dobbelsekseren — classic dominoes with a double-six set, block or draw: you against one to three
   phone players, or two to four people passing one phone (the tiles hide behind a gate between
   turns). Match a number at one of the two open ends; can't go: draw from the boneyard (draw game)
   or pass (block game). First out of tiles wins the round and scores the pips left in the other
   hands; a blocked round goes to the lightest hand. The rules and the phone players are pure
   functions at the top (window.RusjDobbelsekseren when loaded without the kit);
   test/dobbelsekseren.test.mjs checks them and lets seeded phone players play whole rounds. */
(function () {
  "use strict";

  // ---------- The rules (pure: no DOM, no kit) ----------
  // A tile is [a, b] with a ≤ b in a hand; in the line it is turned so that each tile's right number
  // meets the next tile's left number: the open ends are line[0][0] and line[last][1].

  const D = (() => {
    const rng = (fro) => {
      let a = fro >>> 0;
      return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    };
    const ALLE = [];
    for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) ALLE.push([a, b]);
    const sum = (t) => t[0] + t[1];
    const dobbel = (t) => t[0] === t[1];
    const pips = (hand) => hand.reduce((s, t) => s + sum(t), 0);
    const ender = (rekke) => (rekke.length ? [rekke[0][0], rekke[rekke.length - 1][1]] : null);
    const stokk = (liste, rnd) => {
      const a = liste.map((t) => t.slice());
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };
    // Tiles per hand: 7 in the block game; in the draw game 7 for two players, 5 for three or four.
    const handStr = (variant, n) => (variant === "blokk" || n === 2 ? 7 : 5);

    function del(rnd, n, variant) {
      const bunke = stokk(ALLE, rnd);
      const k = handStr(variant, n);
      const hender = Array.from({ length: n }, () => bunke.splice(0, k).sort((x, y) => x[0] - y[0] || x[1] - y[1]));
      return { hender, bunke };
    }
    // The first round: the highest double starts (and must be played); no double: the heaviest tile.
    function apning(hender) {
      let best = null;
      hender.forEach((h, s) =>
        h.forEach((t, i) => {
          const v = (dobbel(t) ? 100 : 0) + sum(t) * 2 + t[1] / 10;
          if (!best || v > best.v) best = { v, spiller: s, brikke: t.slice() };
        }),
      );
      return best;
    }

    // Where tile t can go: "s" (start, empty line), "v" (left end), "h" (right end).
    function sider(t, rekke) {
      const e = ender(rekke);
      if (!e) return ["s"];
      const ut = [];
      if (t[0] === e[0] || t[1] === e[0]) ut.push("v");
      if ((t[0] === e[1] || t[1] === e[1]) && !(e[0] === e[1] && ut.length)) ut.push("h");
      return ut;
    }
    // Every legal move for a hand: [{ i, side }]. krav: the tile that must open the round.
    function trekk(hand, rekke, krav) {
      const ut = [];
      hand.forEach((t, i) => {
        if (krav && !rekke.length && !(t[0] === krav[0] && t[1] === krav[1])) return;
        for (const side of sider(t, rekke)) ut.push({ i, side });
      });
      return ut;
    }
    // Put tile t at that end, turned to match. Returns the tile as it lies.
    function legg(rekke, t, side) {
      if (side === "s") {
        rekke.push([t[0], t[1]]);
        return rekke[0];
      }
      if (side === "v") {
        const l = rekke[0][0];
        const lagt = t[1] === l ? [t[0], t[1]] : [t[1], t[0]];
        rekke.unshift(lagt);
        return lagt;
      }
      const r = rekke[rekke.length - 1][1];
      const lagt = t[0] === r ? [t[0], t[1]] : [t[1], t[0]];
      rekke.push(lagt);
      return lagt;
    }
    // The ends after a move (without changing the line).
    function nyeEnder(rekke, t, side) {
      if (side === "s") return [t[0], t[1]];
      const [l, r] = ender(rekke);
      if (side === "v") return [t[1] === l ? t[0] : t[1], r];
      return [l, t[0] === r ? t[1] : t[0]];
    }

    // ---------- The phone as a player ----------
    // Lett mostly plays any tile that fits. Middels gets rid of the heaviest tile (doubles first).
    // Vanskelig also keeps tiles that fit the new ends, keeps a spread of numbers, and leaves ends
    // the next player has shown (by passing) that they can't follow.
    // ctx: { hand, rekke, krav, mangler: [[numbers each seat lacks]], seat, n }
    function velgTrekk(ctx, niva, rnd) {
      const mulige = trekk(ctx.hand, ctx.rekke, ctx.krav);
      if (!mulige.length) return null;
      if (niva === "lett" && rnd() < 0.7) return mulige[Math.floor(rnd() * mulige.length)];
      let best = mulige[0];
      let bv = -Infinity;
      const neste = (ctx.seat + 1) % ctx.n;
      const mangler = (ctx.mangler && ctx.mangler[neste]) || [];
      for (const m of mulige) {
        const t = ctx.hand[m.i];
        let v = sum(t) + (dobbel(t) ? 2 : 0) + rnd() * 0.01;
        if (niva === "vanskelig") {
          const e = nyeEnder(ctx.rekke, t, m.side);
          const rest = ctx.hand.filter((_, k) => k !== m.i);
          v += 2 * (dobbel(t) ? 1 : 0);
          v += 1.5 * rest.filter((x) => x.includes(e[0]) || x.includes(e[1])).length;
          v += 0.5 * new Set(rest.flat()).size;
          const stengt = e.filter((x) => mangler.includes(x)).length;
          v += stengt === 2 || (e[0] === e[1] && stengt) ? 8 : stengt * 3;
        }
        if (v > bv) {
          bv = v;
          best = m;
        }
      }
      return best;
    }

    // Who wins a blocked round: the lightest hand (null on a tie).
    function blokkVinner(hender) {
      const p = hender.map(pips);
      const min = Math.min(...p);
      return p.filter((x) => x === min).length === 1 ? p.indexOf(min) : null;
    }
    // The winner's points: every pip left in the other hands.
    const poengFor = (hender, vinner) => hender.reduce((s, h, i) => (i === vinner ? s : s + pips(h)), 0);

    // A whole round between phone players (tests): { vinner, poeng, blokkert, trekk, hender, rekke }.
    // o: { variant, starter, apning: true for the first round, sjekk(handling, data) }
    function runde(fro, nivaer, o = {}) {
      const rnd = rng(fro);
      const n = nivaer.length;
      const variant = o.variant || "trekk";
      const { hender, bunke } = del(rnd, n, variant);
      const rekke = [];
      const mangler = Array.from({ length: n }, () => []);
      let tur = o.starter || 0;
      let krav = null;
      if (o.apning !== false) {
        const a = apning(hender);
        tur = a.spiller;
        krav = a.brikke;
      }
      let pass = 0;
      let antall = 0;
      for (let steg = 0; steg < 500; steg++) {
        const hand = hender[tur];
        const m = velgTrekk({ hand, rekke, krav, mangler, seat: tur, n }, nivaer[tur], rnd);
        if (!m) {
          if (o.sjekk) o.sjekk("ingen", { hand, rekke, krav, bunke: variant === "trekk" ? bunke.length : 0 });
          if (variant === "trekk" && bunke.length) {
            hand.push(bunke.shift());
            mangler[tur] = [];
            continue;
          }
          const e = ender(rekke);
          if (e) mangler[tur] = Array.from(new Set([...mangler[tur], ...e]));
          pass++;
          if (pass >= n) {
            const vinner = blokkVinner(hender);
            return { vinner, poeng: vinner == null ? 0 : poengFor(hender, vinner), blokkert: true, trekk: antall, hender, rekke, bunke };
          }
          tur = (tur + 1) % n;
          continue;
        }
        if (o.sjekk) o.sjekk("legg", { hand, rekke: rekke.map((t) => t.slice()), krav, m, t: hand[m.i].slice() });
        const t = hand.splice(m.i, 1)[0];
        legg(rekke, t, m.side);
        krav = null;
        antall++;
        pass = 0;
        if (!hand.length) return { vinner: tur, poeng: poengFor(hender, tur), blokkert: false, trekk: antall, hender, rekke, bunke };
        tur = (tur + 1) % n;
      }
      return { vinner: null, poeng: 0, blokkert: true, trekk: antall, hender, rekke, bunke, uendelig: true };
    }

    return { rng, ALLE, sum, dobbel, pips, ender, handStr, del, apning, sider, trekk, legg, nyeEnder, velgTrekk, blokkVinner, poengFor, runde };
  })();

  const R = window.Rusj;
  if (!R || typeof R.start !== "function") {
    window.RusjDobbelsekseren = D;
    return;
  }

  // ---------- The game on the page ----------

  const esc = R.esc;
  const NIVAER = [1, 2, 3];
  const NIVAKODE = { 1: "lett", 2: "middels", 3: "vanskelig" };
  const NIVANAVN = { 1: R.t("Lett"), 2: R.t("Middels"), 3: R.t("Vanskelig") };
  const NIVATEKST = {
    1: R.t("Mobilen legger det som passer, litt på måfå. Fin for å lære."),
    2: R.t("Mobilen kvitter seg med de tyngste brikkene først."),
    3: R.t("Mobilen holder på tallene sine og stenger for deg når den kan."),
  };
  const MAL = {
    en: { navn: R.t("Én runde"), tekst: R.t("Én runde – den som først blir kvitt brikkene, vinner.") },
    50: { navn: R.t("Først til {n}", { n: 50 }), tekst: R.t("Vinneren av hver runde får øynene i de andres hender. Først til 50 vinner.") },
    100: { navn: R.t("Først til {n}", { n: 100 }), tekst: R.t("Vinneren av hver runde får øynene i de andres hender. Først til 100 vinner.") },
  };
  const VARIANT = {
    trekk: { navn: R.t("Trekk"), tekst: R.t("Passer ingen brikke, trekker du fra bunken til du kan legge.") },
    blokk: { navn: R.t("Blokk"), tekst: R.t("Ingen bunke: Passer ingen brikke, står du over. Alle får sju brikker.") },
  };
  // This edition's address (rusj.no/dobbelsekseren/, rusj.no/en/…)
  const DEL_URL = (document.querySelector('link[rel="canonical"]') || { href: "https://rusj.no/dobbelsekseren/" }).href;
  const FART = { legg: 950, trekk: 600, start: 900 };
  let H;

  // S.spill: { id, modus "mobil" | "flere", niva, n, mal ("en" | 50 | 100), variant, poeng [per seat],
  //   runde, starter, port (gate before a person's hand in «flere»), ferdig, registrert,
  //   r: { hender, rekke, bunke, tur, krav, pass, mangler, logg [{ s, h: "legg" | "trekk" | "pass", t }],
  //        sett [logg length when each seat last looked], valgt (tile index), angre, resultat } }
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const erMenneske = (sp, s) => sp.modus === "flere" || s === 0;
  const navn = (sp, s) => (sp.modus === "flere" ? R.navn(s) : s === 0 ? R.t("Du") : sp.n === 2 ? R.t("Mobilen") : R.t("Mobil {n}", { n: s }));
  const avatarFor = (sp, s, storrelse) => (erMenneske(sp, s) ? R.avatar(s, storrelse) : `<span class="avatar do-robot ${storrelse || ""}" aria-hidden="true">🤖</span>`);
  const meg = (sp) => (sp.modus === "flere" ? sp.r.tur : 0);
  const rundeFerdig = (sp) => !!(sp.r && sp.r.resultat);
  const kampVunnet = (sp) => sp.mal === "en" ? rundeFerdig(sp) : Math.max(...sp.poeng) >= sp.mal;
  const tilfeldig = () => R.nyttFro() / 4294967296;
  const brikkeNavn = (t) => (t[0] === t[1] ? R.t("dobbel {a}", { a: t[0] }) : R.t("{a} og {b}", { a: t[0], b: t[1] }));
  const mulige = (sp) => D.trekk(sp.r.hender[sp.r.tur], sp.r.rekke, sp.r.krav);
  const kanTrekke = (sp) => sp.variant === "trekk" && sp.r.bunke.length > 0;

  let robotId = null;
  let ny = null; // { side } the tile just laid, for its pop-in

  // ---------- Sounds ----------
  const lyd = {
    legg: () => {
      R.lyd.stoy(0, 0.03, 0.26, 1700);
      R.lyd.tone(260, 0, 0.06, "triangle", 0.14, 180);
    },
    trekk: () => R.lyd.stoy(0, 0.08, 0.12, 2400),
    pass: () => R.lyd.tone(300, 0, 0.12, "sine", 0.1, 240),
    tap: () => {
      R.lyd.tone(392, 0, 0.22, "triangle", 0.13);
      R.lyd.tone(311, 0.2, 0.42, "triangle", 0.12);
    },
  };

  // ---------- Tiles ----------
  // Own drawing: ivory tile, ink pips, a groove across the middle. Standing (hand, doubles in the
  // line) or lying (the rest of the line).
  const PIPS = {
    0: [],
    1: [[50, 50]],
    2: [[72, 28], [28, 72]],
    3: [[72, 28], [50, 50], [28, 72]],
    4: [[28, 28], [72, 28], [28, 72], [72, 72]],
    5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
    6: [[28, 24], [72, 24], [28, 50], [72, 50], [28, 76], [72, 76]],
  };
  // a on top/left, b on the bottom/right.
  function brikkeSvg(a, b, staende) {
    const halv = (n, dx, dy) => PIPS[n].map(([x, y]) => `<circle cx="${dx + x * 0.9 + 5}" cy="${dy + y * 0.9 + 5}" r="8.5"/>`).join("");
    if (staende)
      return `<svg class="do-svg" viewBox="0 0 100 200" aria-hidden="true" focusable="false"><rect x="3" y="3" width="94" height="194" rx="16"/><path d="M14 100 H86"/>${halv(a, 0, 0)}${halv(b, 0, 100)}</svg>`;
    return `<svg class="do-svg" viewBox="0 0 200 100" aria-hidden="true" focusable="false"><rect x="3" y="3" width="194" height="94" rx="16"/><path d="M100 14 V86"/>${halv(a, 0, 0)}${halv(b, 100, 0)}</svg>`;
  }

  // ---------- Markup ----------
  function rekkeHtml(sp) {
    const r = sp.r;
    const e = D.ender(r.rekke);
    const minTur = kanSpille(sp);
    const valgt = minTur && r.valgt != null ? r.hender[r.tur][r.valgt] : null;
    const sider = valgt ? D.sider(valgt, r.rekke) : [];
    const mal = (side) =>
      `<button class="do-mal ${side === "v" ? "venstre" : "hoyre"}" data-h="side" data-v="${side}" aria-label="${esc(side === "v" ? R.t("Legg til venstre, mot {n}", { n: e[0] }) : R.t("Legg til høyre, mot {n}", { n: e[1] }))}"><span>${esc(String(side === "v" ? e[0] : e[1]))}</span></button>`;
    if (!r.rekke.length) {
      const tom = r.krav && erMenneske(sp, r.tur) ? R.t("Legg {brikke} først", { brikke: brikkeNavn(r.krav) }) : R.t("Bordet er tomt");
      return `<div class="do-bord tom" id="do-bord"><div class="do-rekke" role="list" aria-label="${esc(R.t("Rekka på bordet"))}"><p class="do-tom">${esc(tom)}</p></div></div>`;
    }
    const brikker = r.rekke
      .map((t, k) => {
        const d = t[0] === t[1];
        const nyKlasse = ny && ((ny.side === "v" && k === 0) || ((ny.side === "h" || ny.side === "s") && k === r.rekke.length - 1)) ? " ny" : "";
        return `<span class="do-lagt${d ? " dobbel" : ""}${nyKlasse}" role="listitem" aria-label="${esc(brikkeNavn(t))}">${brikkeSvg(t[0], t[1], d)}</span>`;
      })
      .join("");
    ny = null;
    return `<div class="do-bord" id="do-bord">
      <div class="do-ende venstre" aria-hidden="true"><span>${e[0]}</span></div>
      <div class="do-rekke" role="list" aria-label="${esc(R.t("Rekka på bordet: venstre ende {a}, høyre ende {b}", { a: e[0], b: e[1] }))}">${sider.includes("v") && sider.includes("h") ? mal("v") : ""}${brikker}${sider.includes("v") && sider.includes("h") ? mal("h") : ""}</div>
      <div class="do-ende hoyre" aria-hidden="true"><span>${e[1]}</span></div>
    </div>`;
  }
  function handHtml(sp) {
    const r = sp.r;
    const s = r.tur;
    const minTur = kanSpille(sp);
    const lovlig = new Set(minTur ? mulige(sp).map((m) => m.i) : []);
    const hand = r.hender[minTur ? s : meg(sp)];
    return `<div class="do-hand" role="group" aria-label="${esc(R.t("Brikkene dine"))}">${hand
      .map((t, i) => {
        const kl = ["do-hb"];
        if (lovlig.has(i)) kl.push("lovlig");
        if (r.valgt === i && minTur) kl.push("valgt");
        if (minTur && !lovlig.has(i)) kl.push("av");
        const etikett = brikkeNavn(t) + (lovlig.has(i) ? ", " + R.t("passer") : "") + (r.valgt === i && minTur ? ", " + R.t("valgt") : "");
        return `<button class="${kl.join(" ")}" data-h="brikke" data-v="${i}" data-stille aria-label="${esc(etikett)}"${minTur ? "" : ' aria-disabled="true"'}>${brikkeSvg(t[0], t[1], true)}</button>`;
      })
      .join("")}</div>`;
  }
  function andreHtml(sp) {
    const r = sp.r;
    const ferdig = rundeFerdig(sp);
    const vis = Array.from({ length: sp.n }, (_, s) => s).filter((s) => sp.modus === "flere" ? s !== r.tur || ferdig : s !== 0);
    return `<ul class="do-andre" aria-label="${esc(R.t("De andre"))}">${vis
      .map((s) => {
        const antall = r.hender[s].length;
        const rygger = Array.from({ length: Math.min(antall, 7) }, () => "<i></i>").join("");
        return `<li class="${s === r.tur && !ferdig ? "na" : ""}">${avatarFor(sp, s)}<span class="do-andre-info"><b>${esc(navn(sp, s))}</b><span class="do-rygger" aria-hidden="true">${rygger}</span><small>${esc(R.flertall(antall, "brikke", "brikker"))}${sp.mal !== "en" ? ` · ${esc(R.t("{n} p", { n: sp.poeng[s] }))}` : ""}</small></span></li>`;
      })
      .join("")}${sp.variant === "trekk" ? `<li class="do-bunke"><span class="do-bunke-stabel" aria-hidden="true"><i></i><i></i></span><span class="do-andre-info"><b>${esc(R.t("Bunken"))}</b><small>${esc(R.flertall(r.bunke.length, "brikke", "brikker"))}</small></span></li>` : ""}</ul>`;
  }

  // What happened since this seat last looked.
  function hendelseTekst(sp, h) {
    const hvem = navn(sp, h.s);
    if (h.h === "legg") return sp.modus === "mobil" && h.s === 0 ? R.t("Du la {brikke}.", { brikke: brikkeNavn(h.t) }) : R.t("{navn} la {brikke}.", { navn: hvem, brikke: brikkeNavn(h.t) });
    if (h.h === "trekk") return sp.modus === "mobil" && h.s === 0 ? R.t("Du trakk en brikke.") : R.t("{navn} trakk en brikke.", { navn: hvem });
    return sp.modus === "mobil" && h.s === 0 ? R.t("Du sto over.") : R.t("{navn} sto over.", { navn: hvem });
  }
  function sistTekst(sp, s) {
    const r = sp.r;
    const fra = r.sett[s] || 0;
    const nye = r.logg.slice(fra).filter((h) => h.s !== s);
    // Draws in a row by the same seat are said once.
    const ut = [];
    for (const h of nye) {
      const forrige = ut[ut.length - 1];
      if (forrige && forrige.h === "trekk" && h.h === "trekk" && forrige.s === h.s) forrige.n = (forrige.n || 1) + 1;
      else ut.push(Object.assign({}, h));
    }
    return ut
      .slice(-4)
      .map((h) => (h.h === "trekk" && h.n > 1 ? (sp.modus === "mobil" && h.s === 0 ? R.t("Du trakk {antall}.", { antall: R.flertall(h.n, "brikke", "brikker") }) : R.t("{navn} trakk {antall}.", { navn: navn(sp, h.s), antall: R.flertall(h.n, "brikke", "brikker") })) : hendelseTekst(sp, h)))
      .join(" ");
  }

  function meldingTekst(sp) {
    const r = sp.r;
    if (rundeFerdig(sp)) return resultatTekst(sp);
    if (!erMenneske(sp, r.tur)) return R.t("{navn} tenker …", { navn: navn(sp, r.tur) });
    const m = mulige(sp);
    const du = sp.modus === "mobil";
    if (r.krav && !r.rekke.length) return du ? R.t("Du har {brikke} – du begynner!", { brikke: brikkeNavn(r.krav) }) : R.t("{navn} har {brikke} og begynner!", { navn: navn(sp, r.tur), brikke: brikkeNavn(r.krav) });
    if (!r.rekke.length) return du ? R.t("Du begynner – legg hvilken brikke du vil.") : R.t("{navn} begynner – legg hvilken brikke du vil.", { navn: navn(sp, r.tur) });
    if (!m.length) return kanTrekke(sp) ? R.t("Ingen passer – trekk fra bunken.") : R.t("Ingen passer – du må stå over.");
    if (r.valgt != null && D.sider(r.hender[r.tur][r.valgt], r.rekke).length === 2) return R.t("Passer i begge ender – trykk der du vil legge den.");
    const [a, b] = D.ender(r.rekke);
    return a === b ? R.t("Legg en brikke med {a}.", { a }) : R.t("Legg en brikke med {a} eller {b}.", { a, b });
  }
  function resultatTekst(sp) {
    const res = sp.r.resultat;
    if (res.vinner == null) return R.t("Låst – likt antall øyne. Ingen får poeng.");
    const hvem = navn(sp, res.vinner);
    const poeng = R.flertall(res.poeng, "poeng", "poeng");
    if (res.blokkert) return sp.modus === "mobil" && res.vinner === 0 ? R.t("Låst! Du har færrest øyne og får {poeng}.", { poeng }) : R.t("Låst! {navn} har færrest øyne og får {poeng}.", { navn: hvem, poeng });
    return sp.modus === "mobil" && res.vinner === 0 ? R.t("Domino! Du ble kvitt alle brikkene og får {poeng}.", { poeng }) : R.t("Domino! {navn} ble kvitt alle brikkene og får {poeng}.", { navn: hvem, poeng });
  }

  // ---------- Line size: every tile visible, the line wraps into rows ----------
  // The biggest tile size (--h: the short side) at which the whole line fits the room the board has.
  function tilpass() {
    const bord = R.$("#do-bord");
    const rekke = bord && R.$(".do-rekke", bord);
    const spill = R.S && R.S.spill;
    if (!rekke || !spill || !spill.r || !spill.r.rekke.length) return;
    const w = rekke.clientWidth;
    if (!w) return;
    const stil = getComputedStyle(bord);
    const luft = parseFloat(stil.paddingTop) + parseFloat(stil.paddingBottom) + 4;
    const maal = () => {
      const over = document.documentElement.scrollHeight - window.innerHeight;
      return Math.max(44, bord.clientHeight - Math.max(0, over) - luft);
    };
    // Widths in tiles: a lying tile is 2 wide, a double (and an end target) 1, plus the gaps.
    const deler = spill.r.rekke.map((t) => (t[0] === t[1] ? 1 : 2)).concat(rekke.querySelector(".do-mal") ? [1, 1] : []);
    const rader = (h) => {
      const gap = Math.max(2, Math.round(h / 7));
      let n = 1;
      let x = 0;
      for (const d of deler) {
        const b = d * h + gap;
        if (x + b - gap > w && x > 0) {
          n++;
          x = 0;
        }
        x += b;
      }
      return { n, gap };
    };
    // Twice more if the page still scrolls (the board's own height follows its content).
    for (let gang = 0; gang < 3; gang++) {
      const tilgjengelig = maal();
      let h = 44;
      for (; h > 12; h--) {
        const r = rader(h);
        if (r.n * (Math.max(2 * h, rekke.querySelector(".do-mal") ? 44 : 0) + r.gap) <= tilgjengelig) break;
      }
      const r = rader(h);
      rekke.style.setProperty("--h", h + "px");
      rekke.style.setProperty("--g", r.gap + "px");
      rekke.classList.toggle("flere", r.n > 1);
      if (document.documentElement.scrollHeight <= window.innerHeight + 1 || h <= 12) break;
    }
  }
  let tilpassId = null;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(tilpassId);
    tilpassId = requestAnimationFrame(() => R.S && R.S.skjerm === "spill" && R.S.spill && tilpass());
  });
  const IKON = `<span class="do-ikon" aria-hidden="true">${brikkeSvg(6, 6, true)}</span>`;

  // ---------- Playing ----------
  function nyRunde(S, forste) {
    const s = S.spill;
    const { hender, bunke } = D.del(tilfeldig, s.n, s.variant);
    s.r = { hender, rekke: [], bunke, tur: 0, krav: null, pass: 0, mangler: Array.from({ length: s.n }, () => []), logg: [], sett: Array(s.n).fill(0), valgt: null, angre: null, resultat: null };
    if (forste) {
      const a = D.apning(hender);
      s.r.tur = a.spiller;
      s.r.krav = a.brikke;
    } else s.r.tur = s.starter;
    s.port = s.modus === "flere";
    stoppMobil();
  }
  function nyKamp(S) {
    const o = S.oppsett;
    const n = o.modus === "mobil" ? 1 + o.mobiler : R.klamp(Number(S.antall) || 2, 2, 4);
    S.spill = { id: R.nyttFro() % 1e9, modus: o.modus, niva: o.niva, n, mal: o.mal, variant: o.variant, poeng: Array(n).fill(0), runde: 1, starter: 0, port: false, ferdig: false, registrert: false, r: null };
    nyRunde(S, true);
    R.statistikk("start", { modus: o.modus, niva: o.modus === "mobil" ? o.niva : 0, spillere: n, mal: String(o.mal), variant: o.variant });
  }
  const kanSpille = (sp) => !!sp.r && !rundeFerdig(sp) && !sp.ferdig && erMenneske(sp, sp.r.tur) && !sp.port;

  function snapshot(sp) {
    const { angre, ...r } = sp.r;
    return JSON.stringify({ r, poeng: sp.poeng });
  }

  function leggBrikke(S, i, side) {
    const sp = S.spill;
    const r = sp.r;
    const s = r.tur;
    if (!D.trekk(r.hender[s], r.rekke, r.krav).some((m) => m.i === i && m.side === side)) return;
    const angre = erMenneske(sp, s) ? snapshot(sp) : null;
    const t = r.hender[s].splice(i, 1)[0];
    D.legg(r.rekke, t, side);
    r.krav = null;
    r.pass = 0;
    r.valgt = null;
    r.logg.push({ s, h: "legg", t });
    if (erMenneske(sp, s)) {
      r.angre = angre;
      r.sett[s] = r.logg.length;
    }
    ny = { side };
    lyd.legg();
    R.vibrer(10);
    R.si(hendelseTekst(sp, { s, h: "legg", t }));
    if (!r.hender[s].length) return avsluttRunde(S, s, false);
    nesteTur(S);
  }
  function trekkBrikke(S) {
    const sp = S.spill;
    const r = sp.r;
    const s = r.tur;
    if (!kanTrekke(sp) || mulige(sp).length) return;
    const t = r.bunke.shift();
    r.hender[s].push(t);
    if (erMenneske(sp, s)) r.hender[s].sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    r.mangler[s] = [];
    r.logg.push({ s, h: "trekk" });
    if (erMenneske(sp, s)) r.sett[s] = r.logg.length;
    lyd.trekk();
    R.vibrer(8);
    if (erMenneske(sp, s)) R.si(R.t("Du trakk {brikke}.", { brikke: brikkeNavn(t) }));
    R.vis();
    planleggMobil();
  }
  function passTur(S) {
    const sp = S.spill;
    const r = sp.r;
    const s = r.tur;
    if (mulige(sp).length || kanTrekke(sp)) return;
    if (erMenneske(sp, s)) r.angre = snapshot(sp);
    const e = D.ender(r.rekke);
    if (e) r.mangler[s] = Array.from(new Set([...r.mangler[s], ...e]));
    r.logg.push({ s, h: "pass" });
    if (erMenneske(sp, s)) r.sett[s] = r.logg.length;
    r.pass++;
    lyd.pass();
    R.si(hendelseTekst(sp, { s, h: "pass" }));
    if (r.pass >= sp.n) {
      const v = D.blokkVinner(r.hender);
      return avsluttRunde(S, v, true);
    }
    if (!erMenneske(sp, s)) R.toast(R.t("{navn} står over", { navn: navn(sp, s) }));
    nesteTur(S);
  }
  function nesteTur(S) {
    const sp = S.spill;
    const r = sp.r;
    r.tur = (r.tur + 1) % sp.n;
    r.valgt = null;
    if (sp.modus === "flere") sp.port = true;
    R.vis();
    planleggMobil();
  }

  function avsluttRunde(S, vinner, blokkert) {
    const sp = S.spill;
    const r = sp.r;
    const poeng = vinner == null ? 0 : D.poengFor(r.hender, vinner);
    r.resultat = { vinner, poeng, blokkert };
    if (vinner != null) sp.poeng[vinner] += poeng;
    sp.port = false;
    stoppMobil();
    R.vis();
    R.si(resultatTekst(sp));
    const fortsatt = R.vakt();
    setTimeout(() => {
      if (!fortsatt() || !R.S.spill || R.S.spill.r !== r) return;
      if (vinner == null) R.lyd.pling();
      else if (!erMenneske(sp, vinner)) lyd.tap();
      else {
        R.lyd.fanfare();
        R.vibrer([40, 60, 120]);
        if (kampVunnet(sp)) R.konfetti();
      }
    }, R.rolig() ? 80 : 350);
  }
  function angre(S) {
    const sp = S.spill;
    const r = sp.r;
    if (!r || !r.angre || sp.ferdig) return;
    const a = JSON.parse(r.angre);
    sp.r = Object.assign(a.r, { angre: null, valgt: null });
    sp.poeng = a.poeng;
    sp.port = false;
    stoppMobil();
    R.lyd.snu();
    R.toast(R.t("Angret – din tur igjen"));
    R.vis();
  }

  // ---------- The phone players ----------
  function stoppMobil() {
    clearTimeout(robotId);
    robotId = null;
  }
  function planleggMobil(ms) {
    stoppMobil();
    const S = R.S;
    const sp = S && S.spill;
    if (!sp || !sp.r || sp.ferdig || rundeFerdig(sp) || S.skjerm !== "spill" || erMenneske(sp, sp.r.tur)) return;
    robotId = setTimeout(() => {
      robotId = null;
      const S2 = R.S;
      const s2 = S2.spill;
      if (!s2 || s2 !== sp || S2.skjerm !== "spill" || rundeFerdig(s2) || erMenneske(s2, s2.r.tur)) return;
      if (R.arkApent()) return planleggMobil(400);
      const r = s2.r;
      const m = D.velgTrekk({ hand: r.hender[r.tur], rekke: r.rekke, krav: r.krav, mangler: r.mangler, seat: r.tur, n: s2.n }, NIVAKODE[s2.niva], tilfeldig);
      if (m) leggBrikke(S2, m.i, m.side);
      else if (kanTrekke(s2)) trekkBrikke(S2);
      else passTur(S2);
    }, R.rolig() ? 250 : ms || (mulige(sp).length ? FART.legg : FART.trekk));
  }

  // ---------- Screens ----------
  function rekordHtml(S, niva) {
    const r = S.rekord[niva];
    if (!r || !(r.seier + r.tap)) return "";
    return `<span><b>${r.seier}</b> ${esc(R.t("seier|seirer", { n: r.seier }))}</span><span><b>${r.tap}</b> ${esc(R.t("tap|tap", { n: r.tap }))}</span>`;
  }
  function spillHtml(S) {
    const sp = S.spill;
    const r = sp.r;
    const ferdig = rundeFerdig(sp);
    if (sp.port && !ferdig) {
      const sist = sistTekst(sp, r.tur);
      return `${sist ? `<p class="do-sist-port" role="status">${esc(sist)}</p>` : ""}
        ${R.ui.giTil({ i: r.tur, h: "vis", knapp: R.t("Vis brikkene mine"), tekst: r.logg.length ? R.t("Gi mobilen til") : R.t("Runde {n} – gi mobilen til", { n: sp.runde }), advarsel: R.t("De andre ser bort"), prikker: [sp.n, r.tur] })}`;
    }
    const minTur = kanSpille(sp);
    const m = minTur ? mulige(sp) : [];
    let hoved = "";
    if (ferdig) hoved = kampVunnet(sp) ? R.ui.knapp(R.t("Se kåringen"), "kaaring", { ikon: "🏆" }) : R.ui.knapp(R.t("Ny runde"), "runde", { ikon: IKON });
    else if (minTur && !m.length && !kanTrekke(sp)) hoved = R.ui.knapp(R.t("Stå over"), "pass");
    else if (sp.variant === "trekk") hoved = R.ui.knapp(R.t("Trekk fra bunken"), "trekk", { av: !minTur || m.length > 0 || !kanTrekke(sp) });
    const lenker = [];
    if (r.angre && (sp.modus === "mobil" || ferdig)) lenker.push(`<button class="lenke" data-h="angre">↶ ${esc(R.t("Angre"))}</button>`);
    lenker.push(R.ui.lenke(R.t("Avslutt"), "avslutt"));
    const sist = !ferdig && sp.modus === "mobil" ? sistTekst(sp, 0) : "";
    const stilling = sp.mal !== "en" ? `<p class="do-stilling">${esc(R.t("Først til {n} poeng", { n: sp.mal }))} · ${esc(sp.modus === "mobil" ? R.t("du har {n}", { n: sp.poeng[0] }) : R.t("{navn} har {n}", { navn: navn(sp, r.tur), n: sp.poeng[r.tur] }))}</p>` : "";
    return `
      <h1 class="vh" id="skjerm-tittel">${esc(R.t("Domino, runde {n}", { n: sp.runde }))}</h1>
      ${andreHtml(sp)}
      ${rekkeHtml(sp)}
      <div class="do-melding${ferdig ? " ferdig" : minTur ? " din" : ""}" role="status">
        ${sist ? `<span class="do-sist">${esc(sist)}</span>` : ""}
        <b>${esc(meldingTekst(sp))}</b>
      </div>
      ${ferdig ? resultatHtml(sp) : handHtml(sp)}
      ${stilling && !ferdig ? stilling : ""}
      ${R.ui.dokk(hoved, R.ui.lenkerad(...lenker))}`;
  }
  // The round's result: everyone's tiles left and the pips.
  function resultatHtml(sp) {
    const r = sp.r;
    return `<ul class="do-resultat">${r.hender
      .map(
        (h, s) =>
          `<li class="${r.resultat.vinner === s ? "vant" : ""}">${avatarFor(sp, s)}<span class="do-res-navn">${esc(navn(sp, s))}</span><span class="do-res-brikker" aria-label="${esc(h.map(brikkeNavn).join(", ") || R.t("ingen brikker"))}">${h.map((t) => `<span class="do-mini">${brikkeSvg(t[0], t[1], true)}</span>`).join("")}</span><b>${esc(R.t("{n} øyne", { n: D.pips(h) }))}</b></li>`,
      )
      .join("")}</ul>`;
  }

  R.start({
    id: "dobbelsekseren",
    versjon: 1,
    pagar,

    tilstand: () => ({
      antall: 2,
      oppsett: { modus: "mobil", mobiler: 1, niva: 2, mal: 100, variant: "trekk" },
      rekord: {},
      sist: null,
      spill: null,
    }),

    lastet(S) {
      const o = (S.oppsett = Object.assign({ modus: "mobil", mobiler: 1, niva: 2, mal: 100, variant: "trekk" }, S.oppsett));
      if (!["mobil", "flere"].includes(o.modus)) o.modus = "mobil";
      o.mobiler = R.klamp(Number(o.mobiler) || 1, 1, 3);
      if (!NIVAER.includes(o.niva)) o.niva = 2;
      if (!MAL[o.mal]) o.mal = 100;
      if (!VARIANT[o.variant]) o.variant = "trekk";
      S.antall = R.klamp(Number(S.antall) || 2, 2, 4);
      if (!S.rekord || typeof S.rekord !== "object") S.rekord = {};
      if (S.sist && typeof S.sist.tekst !== "string") S.sist = null;
      const sp = S.spill;
      if (sp) {
        const r = sp.r;
        const gyldig = (t) => Array.isArray(t) && t.length === 2 && t.every((x) => Number.isInteger(x) && x >= 0 && x <= 6);
        const ok =
          ["mobil", "flere"].includes(sp.modus) && Number.isInteger(sp.n) && sp.n >= 2 && sp.n <= 4 && NIVAER.includes(sp.niva) && MAL[sp.mal] && VARIANT[sp.variant] &&
          Array.isArray(sp.poeng) && sp.poeng.length === sp.n && r && Array.isArray(r.hender) && r.hender.length === sp.n && r.hender.every((h) => Array.isArray(h) && h.every(gyldig)) &&
          Array.isArray(r.rekke) && r.rekke.every(gyldig) && Array.isArray(r.bunke) && r.bunke.every(gyldig) && Number.isInteger(r.tur) && r.tur >= 0 && r.tur < sp.n &&
          r.hender.flat().length + r.rekke.length + r.bunke.length === 28;
        if (!ok) S.spill = null;
        else {
          if (!Array.isArray(r.logg)) r.logg = [];
          if (!Array.isArray(r.sett) || r.sett.length !== sp.n) r.sett = Array(sp.n).fill(r.logg.length);
          if (!Array.isArray(r.mangler) || r.mangler.length !== sp.n) r.mangler = Array.from({ length: sp.n }, () => []);
          if (r.valgt != null && !(r.valgt >= 0 && r.valgt < r.hender[r.tur].length)) r.valgt = null;
        }
      }
      if (!S.spill && ["spill", "slutt"].includes(S.skjerm)) S.skjerm = "hjem";
      if (S.spill && S.skjerm === "slutt" && !S.spill.ferdig) S.skjerm = "spill";
      if (S.spill && S.skjerm === "spill" && S.spill.ferdig) S.skjerm = "slutt";
    },

    regler: {
      intro: R.t("Bli kvitt alle brikkene dine først. Legg brikker etter hverandre slik at tallene møtes."),
      steg: [
        [R.t("Legg en brikke"), R.t("Brikken må ha samme tall som en av de to åpne endene på bordet. Trykk på en brikke som lyser – passer den begge steder, trykker du der du vil legge den.")],
        [R.t("Trekk eller stå over"), R.t("Passer ingen av brikkene dine, trekker du fra bunken til du kan legge (trekkdomino). Uten bunke står du over (blokkdomino).")],
        [R.t("Domino!"), R.t("Den som først blir kvitt brikkene, vinner runden og får alle øynene som er igjen hos de andre.")],
      ],
      tips: [
        R.t("Den som har dobbel seks, begynner første runde – med den. Har ingen en dobbel, begynner den tyngste brikken."),
        R.t("Doble brikker legges på tvers. De er vanskelige å bli kvitt – legg dem tidlig."),
        R.t("Kan ingen legge, er spillet låst. Da vinner den med færrest øyne igjen."),
        R.t("Bli kvitt de tunge brikkene først: De koster mest hvis noen andre går ut."),
        R.t("Står noen over, mangler de begge tallene i endene. Det kan du bruke!"),
        R.t("Flere på én mobil: Brikkene skjules mellom hver tur. Trykk «Vis brikkene mine» når du har fått mobilen."),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const sp = S.spill;
          const aktiv = pagar(S);
          const rek = NIVAER.map((n) => [n, rekordHtml(S, n)]).filter(([, h]) => h);
          return (
            R.ui.spillhjem({
              slagordHtml: `${esc(R.t("Legg tall mot tall."))}<br><em>${esc(R.t("Først tom for brikker vinner!"))}</em>`,
              knapperHtml: R.ui.startKnapper({
                pagar: aktiv,
                fortsettTekst: aktiv ? R.t("Fortsett · runde {n}", { n: sp.runde }) : "",
                ekstraHtml: R.ui.lenke(R.t("Slik spiller du"), "regler"),
              }),
              merker: [
                ["2–4", R.t("spillere")],
                ["28", R.t("brikker")],
                ["0", R.t("reklame")],
              ],
            }) +
            (rek.length || S.sist
              ? `<section class="do-rekorder" aria-label="${esc(R.t("Mot mobilen"))}">${rek.length ? `<p class="etikett">${esc(R.t("Mot mobilen"))}</p><ul>${rek.map(([n, h]) => `<li><b class="do-niva">${esc(NIVANAVN[n])}</b>${h}</li>`).join("")}</ul>` : ""}${S.sist ? `<p class="do-sistlinje"><b>${esc(R.t("Sist:"))}</b> ${esc(S.sist.tekst)}</p>` : ""}</section>`
              : "")
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
              <h2>${esc(R.t("Hvordan vil dere spille?"))}</h2>
              ${R.ui.fliser(
                "modus",
                [
                  { v: "mobil", ikon: "🤖", tittel: R.t("Mot mobilen"), tekst: R.t("Du mot 1–3 mobilspillere") },
                  { v: "flere", ikon: "👥", tittel: R.t("Flere på én mobil"), tekst: R.t("2–4 spillere sender mobilen rundt") },
                ],
                o.modus,
              )}
            </section>
            ${
              o.modus === "mobil"
                ? `<section class="seksjon">
                    <h2>${esc(R.t("Hvor mange mobilspillere?"))}</h2>
                    ${R.ui.seg("mobiler", [[1, "1"], [2, "2"], [3, "3"]], o.mobiler, { etikett: R.t("Antall mobilspillere") })}
                  </section>
                  <section class="seksjon">
                    <h2>${esc(R.t("Hvor flink er mobilen?"))}</h2>
                    ${R.ui.seg("niva", NIVAER.map((n) => [n, NIVANAVN[n]]), o.niva, { etikett: R.t("Nivå") })}
                    <p class="hjelp">${esc(NIVATEKST[o.niva])}</p>
                  </section>`
                : R.ui.spillere({ min: 2, max: 4, tittel: R.t("Hvem spiller?"), hjelp: R.t("Brikkene skjules mellom hver tur, så ingen ser de andres.") })
            }
            <section class="seksjon">
              <h2>${esc(R.t("Trekk eller blokk?"))}</h2>
              ${R.ui.seg("variant", Object.keys(VARIANT).map((v) => [v, VARIANT[v].navn]), o.variant, { etikett: R.t("Trekk eller blokk") })}
              <p class="hjelp">${esc(VARIANT[o.variant].tekst)}</p>
            </section>
            <section class="seksjon">
              <h2>${esc(R.t("Hvor lenge?"))}</h2>
              ${R.ui.seg("mal", Object.keys(MAL).map((m) => [m, MAL[m].navn]), o.mal, { etikett: R.t("Hvor lenge") })}
              <p class="hjelp">${esc(MAL[o.mal].tekst)}</p>
            </section>
            ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start", { variant: "stor", ikon: IKON }))}`;
        },
      },

      spill: {
        tittel: (S) => (S.spill ? R.t("Runde {n}", { n: S.spill.runde }) : ""),
        tilbake: "hjem",
        vis: spillHtml,
        etter() {
          tilpass();
        },
        inn(S) {
          if (!S.spill) return R.gaTil("hjem");
          R.holdVaken();
          R.vedForlat(stoppMobil);
          planleggMobil(FART.start);
        },
        ut() {
          stoppMobil();
        },
      },

      slutt: {
        tittel: R.t("Kåringen"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const rader = Array.from({ length: sp.n }, (_, s) => ({ navn: navn(sp, s), i: erMenneske(sp, s) ? s : 9 + s, poeng: sp.poeng[s] }));
          const topp = Math.max(...sp.poeng);
          const vinnere = Array.from({ length: sp.n }, (_, s) => s).filter((s) => sp.poeng[s] === topp && topp > 0);
          const duVant = sp.modus === "mobil" && vinnere.length === 1 && vinnere[0] === 0;
          const mobilVant = sp.modus === "mobil" && vinnere.length && !vinnere.includes(0);
          let tittel;
          if (!vinnere.length) tittel = R.t("Ingen vinner denne gangen");
          else if (duVant) tittel = R.t("Du vinner!");
          else tittel = R.t("{navn} vinner!|{navn} vinner!", { navn: R.ramsOpp(vinnere.map((s) => navn(sp, s))), n: vinnere.length });
          const runder = sp.runde - (rundeFerdig(sp) ? 0 : 1);
          const etikett = `${R.flertall(runder, "runde", "runder")}${sp.modus === "mobil" ? ` · ${NIVANAVN[sp.niva].toLowerCase()}` : ""}`;
          const tekst = mobilVant ? R.t("Godt kjempa! Neste gang går dominoen din vei.") : duVant ? R.t("Godt jobba!") : "";
          const rek = sp.modus === "mobil" ? rekordHtml(S, sp.niva) : "";
          return `
            ${R.ui.banner({ tittel, etikett, tekst, klasse: mobilVant ? "" : "aksent", stemning: mobilVant || !vinnere.length ? "lei" : "jubel" })}
            ${sp.n > 2 ? R.ui.pall(rader) : ""}
            ${R.ui.poengliste(rader)}
            ${rek ? `<p class="do-rekordlinje"><span class="etikett">${esc(R.t("Mot mobilen"))} · ${esc(NIVANAVN[sp.niva].toLowerCase())}</span>${rek}</p>` : ""}
            ${R.ui.flereSpill({ antall: sp.modus === "flere" ? sp.n : 1 })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen", { ikon: IKON }), R.ui.lenkerad(R.ui.lenke(R.t("Del resultatet"), "del"), R.ui.lenke(R.t("Endre oppsett"), "nytt"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
        },
        inn(S) {
          const sp = S.spill;
          if (!sp) return R.gaTil("hjem");
          if (!sp.registrert) {
            sp.registrert = true;
            // «Kveldens gjeng» counts people only, never the phone players.
            const folk = Array.from({ length: sp.n }, (_, s) => s).filter((s) => erMenneske(sp, s));
            if (folk.length > 1) R.kveld.registrer(folk.map((s) => ({ i: s, poeng: sp.poeng[s] })));
            R.lagre();
          }
          const topp = Math.max(...sp.poeng);
          if (sp.modus === "mobil" && sp.poeng[0] < topp) lyd.tap();
          else if (topp > 0) {
            R.lyd.fanfare();
            R.vibrer([40, 60, 120]);
            R.konfetti();
          } else R.lyd.pling();
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
        S.oppsett.modus = el.dataset.v === "flere" ? "flere" : "mobil";
        R.vis();
      },
      mobiler(el, e, S) {
        S.oppsett.mobiler = R.klamp(Number(el.dataset.v) || 1, 1, 3);
        R.vis();
      },
      niva(el, e, S) {
        S.oppsett.niva = R.klamp(Number(el.dataset.v) || 2, 1, 3);
        R.vis();
      },
      variant(el, e, S) {
        S.oppsett.variant = VARIANT[el.dataset.v] ? el.dataset.v : "trekk";
        R.vis();
      },
      mal(el, e, S) {
        const v = el.dataset.v === "en" ? "en" : Number(el.dataset.v);
        S.oppsett.mal = MAL[v] ? v : 100;
        R.vis();
      },
      start(el, e, S) {
        nyKamp(S);
        R.gaTil("spill");
      },
      igjen(el, e, S) {
        nyKamp(S);
        R.gaTil("spill");
      },
      vis(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.port) return;
        sp.port = false;
        R.lyd.snu();
        R.vis();
      },
      brikke(el, e, S) {
        const sp = S.spill;
        if (!sp || !kanSpille(sp)) {
          if (sp && sp.r && !rundeFerdig(sp) && !erMenneske(sp, sp.r.tur)) R.toast(R.t("Vent litt – det er ikke din tur"));
          return;
        }
        const r = sp.r;
        const i = Number(el.dataset.v);
        const t = r.hender[r.tur][i];
        if (!t) return;
        const m = mulige(sp).filter((x) => x.i === i);
        if (!m.length) {
          R.lyd.feil();
          R.vibrer(25);
          const en = D.ender(r.rekke);
          R.toast(r.krav && !r.rekke.length ? R.t("Du må begynne med {brikke}", { brikke: brikkeNavn(r.krav) }) : en ? R.t("Den passer ikke – endene er {a} og {b}", { a: en[0], b: en[1] }) : R.t("Den passer ikke"));
          el.classList.remove("risting");
          void el.offsetWidth;
          el.classList.add("risting");
          return;
        }
        if (m.length === 1) return leggBrikke(S, i, m[0].side);
        r.valgt = r.valgt === i ? null : i;
        R.lyd.klikk();
        R.vis();
      },
      side(el, e, S) {
        const sp = S.spill;
        if (!sp || !kanSpille(sp) || sp.r.valgt == null) return;
        leggBrikke(S, sp.r.valgt, el.dataset.v === "v" ? "v" : "h");
      },
      trekk(el, e, S) {
        const sp = S.spill;
        if (!sp || !kanSpille(sp)) return;
        trekkBrikke(S);
      },
      pass(el, e, S) {
        const sp = S.spill;
        if (!sp || !kanSpille(sp)) return;
        passTur(S);
      },
      angre(el, e, S) {
        angre(S);
      },
      runde(el, e, S) {
        const sp = S.spill;
        if (!sp || !rundeFerdig(sp) || kampVunnet(sp)) return;
        const v = sp.r.resultat.vinner;
        sp.starter = v != null ? v : (sp.starter + 1) % sp.n;
        sp.runde++;
        nyRunde(S, false);
        R.lyd.snu();
        R.vis();
        planleggMobil(FART.start);
      },
      kaaring(el, e, S) {
        const sp = S.spill;
        if (!sp || !kampVunnet(sp) || sp.ferdig) return;
        avsluttKamp(S);
      },
      del(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        const stilling = sp.poeng.join("–");
        const navnet = R.app.navn;
        let tekst;
        let linje2;
        if (sp.modus === "mobil") {
          const vant = sp.poeng[0] === Math.max(...sp.poeng) && sp.poeng.filter((x) => x === sp.poeng[0]).length === 1;
          const niva = NIVANAVN[sp.niva].toLowerCase();
          tekst = vant ? R.t("Jeg slo mobilen i domino ({niva}), {stilling}. Klarer du det?", { niva, stilling }) : R.t("Mobilen slo meg i domino ({niva}), {stilling}. Klarer du bedre?", { niva, stilling });
          linje2 = R.t("mot mobilen · {niva}", { niva });
        } else {
          const topp = Math.max(...sp.poeng);
          const v = sp.poeng.map((x, s) => (x === topp ? R.navn(s) : null)).filter(Boolean);
          tekst = R.t("{navn} vant domino ({stilling})! Ta en runde du også.", { navn: R.ramsOpp(v), stilling });
          linje2 = R.t("{spillere} på én mobil", { spillere: R.flertall(sp.n, "spiller", "spillere") });
        }
        R.del(navnet, tekst, DEL_URL, { kort: { tittel: navnet, linjer: [stilling, linje2] } });
      },
      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.ferdig) return;
        const fortsatt = R.vakt();
        stoppMobil();
        const ferdige = sp.runde - (rundeFerdig(sp) ? 0 : 1);
        const ja = await R.bekreft(R.t("Avslutte spillet?"), ferdige ? R.t("Dere går til kåringen. Runden dere er midt i, teller ikke.") : R.t("Dere kan alltid starte et nytt."), R.t("Avslutt"), R.t("Spill videre"));
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

  function avsluttKamp(S) {
    const sp = S.spill;
    stoppMobil();
    sp.ferdig = true;
    if (sp.r) sp.r.angre = null;
    const topp = Math.max(...sp.poeng);
    const vinnere = Array.from({ length: sp.n }, (_, s) => s).filter((s) => sp.poeng[s] === topp && topp > 0);
    if (sp.modus === "mobil" && vinnere.length) {
      const r = S.rekord[sp.niva] || (S.rekord[sp.niva] = { seier: 0, tap: 0 });
      if (vinnere.length === 1 && vinnere[0] === 0) {
        r.seier++;
        R.merke("klassiker-dobbelsekseren");
      } else if (!vinnere.includes(0)) r.tap++;
    }
    if (vinnere.length) S.sist = { tekst: R.t("{navn} vant med {poeng}.", { navn: R.ramsOpp(vinnere.map((s) => R.kutt(navn(sp, s), 16))), poeng: R.flertall(topp, "poeng", "poeng") }) };
    R.statistikk("ferdig", { modus: sp.modus, niva: sp.modus === "mobil" ? sp.niva : 0, spillere: sp.n, runder: sp.runde, variant: sp.variant });
    R.gaTil("slutt");
  }
})();
