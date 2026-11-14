/* Pusen — four card games for children with an animal deck: Svarteper (Old Maid), Fisk (Go Fish),
   Størst vinner (War) and Snapp (Snap). Ten animals from the little mouse (1) to the big elephant
   (10), four of each in four colours, and one odd card: Svarteper, a friendly black cat. Play
   against the phone (one to three phone players where the game allows it; levels in Fisk and
   Snapp) or together on one phone (a gate hides the hand between turns in Svarteper and Fisk; in
   Størst vinner and Snapp two players sit face to face with the phone between them).
   The rules and the phone players at the top are pure functions with a seeded rng;
   test/pusen.test.mjs loads this file without the kit. */
(function () {
  "use strict";

  // ---------- The deck (no kit needed) ----------
  // A card is 0–39: animal = k % 10 (0 the mouse … 9 the elephant, worth 1–10), colour = k / 10.
  // KATT (40) is Svarteper, the odd card.
  const KATT = 40;
  const art = (k) => k % 10;
  const verdi = (k) => (k % 10) + 1;
  const fargeAv = (k) => Math.floor(k / 10);
  const MODUSER = ["svarte", "fisk", "krig", "snap"];

  function bland(liste, rng) {
    const a = liste.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  const alle = (n) => Array.from({ length: n }, (_, i) => i);
  // The next player after p (in turn order) for whom ok(i) holds; -1 if none.
  function nesteAv(n, p, ok) {
    for (let d = 1; d <= n; d++) {
      const i = (p + d) % n;
      if (ok(i)) return i;
    }
    return -1;
  }

  // ---------- Svarteper (Old Maid) ----------
  // r: { n, hender: [[card]], par: [[animal]] (pairs laid down), ute: [players out, in order],
  //   tur, taper (the one left with the cat) }
  const Svarte = {
    // Two players: ten pairs (every animal in two colours); three or four: fifteen pairs. Plus the cat.
    kortstokk(n) {
      const k = [...alle(20)];
      if (n > 2) for (const f of [2, 3]) for (let a = 0; a < 5; a++) k.push(f * 10 + a);
      k.push(KATT);
      return k;
    },
    // Two of the same animal in a hand go away as a pair (the cat has no mate).
    kastPar(hand) {
      const ut = [];
      const par = [];
      for (const k of hand) {
        const i = k === KATT ? -1 : ut.findIndex((x) => x !== KATT && art(x) === art(k));
        if (i >= 0) {
          par.push(art(k));
          ut.splice(i, 1);
        } else ut.push(k);
      }
      return { hand: ut, par };
    },
    ny(n, rng, start = 0) {
      const stokk = bland(Svarte.kortstokk(n), rng);
      const hender = Array.from({ length: n }, () => []);
      stokk.forEach((k, i) => hender[(start + i) % n].push(k));
      const r = { n, hender: [], par: [], ute: [], tur: start, taper: null };
      for (const h of hender) {
        const { hand, par } = Svarte.kastPar(h);
        r.hender.push(bland(hand, rng));
        r.par.push(par);
      }
      Svarte.oppdater(r);
      if (r.hender[r.tur].length === 0) r.tur = nesteAv(n, r.tur, (i) => r.hender[i].length > 0);
      return r;
    },
    aktive: (r) => alle(r.n).filter((i) => r.hender[i].length > 0),
    // The one p draws from: the next player who still has cards.
    fra: (r, p) => nesteAv(r.n, p, (i) => i !== p && r.hender[i].length > 0),
    oppdater(r) {
      for (let i = 0; i < r.n; i++) if (!r.hender[i].length && !r.ute.includes(i)) r.ute.push(i);
      const igjen = Svarte.aktive(r);
      if (igjen.length <= 1 && r.taper == null) r.taper = igjen.length ? igjen[0] : -1;
    },
    // The player whose turn it is takes card number i from the next player's hand. With rng, the
    // hand is mixed afterwards, as players do (then always taking the first card can never go round
    // in a circle, and nobody can follow where the cat went).
    trekk(r, i, rng) {
      const p = r.tur;
      const q = Svarte.fra(r, p);
      if (r.taper != null || q < 0 || !(i >= 0 && i < r.hender[q].length)) return null;
      const kort = r.hender[q].splice(i, 1)[0];
      const hand = r.hender[p];
      let par = null;
      const mate = kort === KATT ? -1 : hand.findIndex((x) => x !== KATT && art(x) === art(kort));
      if (mate >= 0) {
        hand.splice(mate, 1);
        par = art(kort);
        r.par[p].push(par);
      } else hand.push(kort);
      if (rng) r.hender[p] = bland(hand, rng);
      Svarte.oppdater(r);
      if (r.taper == null) r.tur = nesteAv(r.n, p, (x) => r.hender[x].length > 0);
      return { p, q, kort, par };
    },
    // Places: those who got out first come first; the one with the cat is last.
    plasser(r) {
      const rekke = [...r.ute.filter((i) => i !== r.taper), ...(r.taper >= 0 ? [r.taper] : [])];
      return rekke;
    },
  };

  // ---------- Fisk (Go Fish) ----------
  // r: { n, hender, dam (the pond, top = last), sett: [[animal]] (sets of four), tur,
  //   minne: [[animal]] (what everyone has seen that a player holds) }
  const Fisk = {
    ny(n, rng, start = 0) {
      const dam = bland(alle(40), rng);
      const per = n === 2 ? 7 : 5;
      const hender = Array.from({ length: n }, () => []);
      for (let c = 0; c < per; c++) for (let p = 0; p < n; p++) hender[(start + p) % n].push(dam.pop());
      const r = { n, hender, dam, sett: Array.from({ length: n }, () => []), tur: start, minne: Array.from({ length: n }, () => []) };
      for (let p = 0; p < n; p++) Fisk.legg(r, p);
      return r;
    },
    antall: (hand, a) => hand.filter((k) => art(k) === a).length,
    // Four of an animal in a hand become a set.
    legg(r, p) {
      const nye = [];
      for (let a = 0; a < 10; a++)
        if (Fisk.antall(r.hender[p], a) === 4) {
          r.hender[p] = r.hender[p].filter((k) => art(k) !== a);
          r.sett[p].push(a);
          nye.push(a);
          for (const m of r.minne) if (m.includes(a)) m.splice(m.indexOf(a), 1);
        }
      return nye;
    },
    huske(r, p, a) {
      if (!r.minne[p].includes(a)) r.minne[p].push(a);
    },
    glemme(r, p, a) {
      const i = r.minne[p].indexOf(a);
      if (i >= 0) r.minne[p].splice(i, 1);
    },
    // Everybody with an empty hand takes a card from the pond (while there are any).
    fyll(r) {
      for (let i = 0; i < r.n; i++) {
        const p = (r.tur + i) % r.n;
        if (!r.hender[p].length && r.dam.length) {
          r.hender[p].push(r.dam.pop());
          Fisk.legg(r, p);
        }
      }
    },
    ferdig: (r) => r.sett.reduce((s, x) => s + x.length, 0) === 10 || r.hender.every((h) => !h.length),
    // Can p ask q for the animal a?
    lovlig: (r, p, q, a) => p === r.tur && q !== p && q >= 0 && q < r.n && r.hender[q].length > 0 && r.hender[p].some((k) => art(k) === a),
    // p (whose turn it is) asks q for animal a. Returns what happened:
    // { p, q, a, fikk (cards handed over), trakk (card from the pond or null), heldig (it was a), sett: [animals], igjen (p goes again) }
    sporr(r, q, a) {
      const p = r.tur;
      if (!Fisk.lovlig(r, p, q, a)) return null;
      Fisk.huske(r, p, a);
      const gitt = r.hender[q].filter((k) => art(k) === a);
      let trakk = null;
      let heldig = false;
      if (gitt.length) {
        r.hender[q] = r.hender[q].filter((k) => art(k) !== a);
        r.hender[p].push(...gitt);
        Fisk.glemme(r, q, a);
      } else if (r.dam.length) {
        trakk = r.dam.pop();
        r.hender[p].push(trakk);
        heldig = art(trakk) === a;
      }
      const sett = Fisk.legg(r, p);
      const igjen = gitt.length > 0 || heldig;
      Fisk.fyll(r);
      // The turn passes unless p got what was asked for (and still has cards).
      if (!Fisk.ferdig(r) && !(igjen && r.hender[p].length)) {
        const neste = nesteAv(r.n, p, (i) => r.hender[i].length > 0);
        if (neste >= 0) r.tur = neste;
      }
      return { p, q, a, fikk: gitt.length, trakk, heldig, sett, igjen };
    },
    // A turn that cannot ask anyone (only one player has cards left): the game is stuck – over.
    fast: (r) => !Fisk.ferdig(r) && !alle(r.n).some((i) => i !== r.tur && r.hender[i].length > 0),
    vinnere(r) {
      const best = Math.max(...r.sett.map((s) => s.length));
      return alle(r.n).filter((i) => r.sett[i].length === best);
    },
  };

  // ---------- Størst vinner (War) ----------
  // r: { hender: [[card], [card]] (top = last), vunnet: [n, n] (cards won), sist: the last battle }
  const Krig = {
    // Short: 10 cards each (every animal in two colours); long: 20 each (the whole deck).
    ny(per, rng) {
      const stokk = bland(per >= 20 ? alle(40) : alle(20), rng);
      return { hender: [stokk.slice(0, per), stokk.slice(per, per * 2)], vunnet: [0, 0], sist: null };
    },
    // One battle: both turn their top card; the bigger animal takes both. Equal: each lays one card
    // face down and turns the next – the bigger takes everything. Without cards to go on, everyone
    // keeps their own. Returns { runder: [[a, b], …] (face up), skjult: [[a, b] | null, …], vinner (0, 1 or null), antall }.
    slag(r) {
      const [A, B] = r.hender;
      if (!A.length || !B.length) return null;
      const runder = [];
      const skjult = [];
      const pott = [[], []];
      let vinner = null;
      for (;;) {
        const a = A.pop();
        const b = B.pop();
        pott[0].push(a);
        pott[1].push(b);
        runder.push([a, b]);
        if (verdi(a) !== verdi(b)) {
          vinner = verdi(a) > verdi(b) ? 0 : 1;
          break;
        }
        if (!A.length || !B.length) break;
        // Equal: one face down each (when there is a card after it to turn), then the next face up.
        if (A.length >= 2 && B.length >= 2) {
          const da = A.pop();
          const db = B.pop();
          pott[0].push(da);
          pott[1].push(db);
          skjult.push([da, db]);
        } else skjult.push(null);
      }
      if (vinner == null) {
        r.vunnet[0] += pott[0].length;
        r.vunnet[1] += pott[1].length;
      } else r.vunnet[vinner] += pott[0].length + pott[1].length;
      r.sist = { runder, skjult, vinner, antall: pott[0].length + pott[1].length };
      return r.sist;
    },
    ferdig: (r) => !r.hender[0].length || !r.hender[1].length,
  };

  // ---------- Snapp (Snap) ----------
  // r: { hender: [[card], [card]] (in the order they are turned), pos: [i, i] (next to turn),
  //   midt (the pile in the middle, top = last), vunnet: [n, n], tur }
  const Snap = {
    // A shuffle that gives more pairs than chance (fun for children): at every place, with the
    // chance `sjanse`, a later card with the same animal as the one before is moved in.
    stokk(kort, rng, sjanse = 0.3) {
      const a = bland(kort, rng);
      for (let i = 1; i < a.length; i++) {
        if (art(a[i]) === art(a[i - 1]) || rng() >= sjanse) continue;
        // Not three alike in a row.
        if (i >= 2 && art(a[i - 1]) === art(a[i - 2])) continue;
        const j = a.findIndex((k, x) => x > i && art(k) === art(a[i - 1]));
        if (j > i) [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
    // The cards are turned in turn: player 0 turns the even places of the shuffled row, player 1 the odd.
    ny(per, rng, sjanse) {
      const rad = Snap.stokk(per >= 20 ? alle(40) : alle(20), rng, sjanse);
      return { hender: [rad.filter((_, i) => i % 2 === 0), rad.filter((_, i) => i % 2 === 1)], pos: [0, 0], midt: [], vunnet: [0, 0], tur: 0 };
    },
    igjen: (r, p) => r.hender[p].length - r.pos[p],
    snu(r) {
      const p = r.tur;
      if (Snap.igjen(r, p) <= 0) return null;
      const kort = r.hender[p][r.pos[p]++];
      r.midt.push(kort);
      const q = 1 - p;
      r.tur = Snap.igjen(r, q) > 0 ? q : p;
      return { p, kort };
    },
    like: (r) => r.midt.length >= 2 && art(r.midt[r.midt.length - 1]) === art(r.midt[r.midt.length - 2]),
    // A snap: right when the two top cards show the same animal; then the pile is won.
    snapp(r, p) {
      if (!Snap.like(r)) return false;
      r.vunnet[p] += r.midt.length;
      r.midt = [];
      return true;
    },
    tomt: (r) => Snap.igjen(r, 0) <= 0 && Snap.igjen(r, 1) <= 0,
  };

  // ---------- The phone players ----------
  // niva: 1 Lett, 2 Middels, 3 Vanskelig. rng: numbers from 0 to 1.
  const Mobil = {
    // Svarteper: a card from the next hand, at random (nobody can see them).
    svarte: (antall, rng) => Math.floor(rng() * antall),
    // Fisk: which animal to ask for, and whom. Lett asks at random; Middels remembers what the
    // others have asked for (most of the time) and else asks for what it has most of; Vanskelig
    // always uses what it has seen, then asks the one with most cards for what it has most of.
    fisk(r, p, niva, rng) {
      const hand = r.hender[p];
      const arter = [...new Set(hand.map(art))];
      const andre = alle(r.n).filter((i) => i !== p && r.hender[i].length > 0);
      if (!arter.length || !andre.length) return null;
      const tilfeldig = (l) => l[Math.floor(rng() * l.length)];
      if (niva >= 2 && (niva >= 3 || rng() < 0.65)) {
        const kjent = [];
        for (const q of andre) for (const a of r.minne[q]) if (arter.includes(a)) kjent.push({ q, a, n: Fisk.antall(hand, a) });
        if (kjent.length) {
          kjent.sort((x, y) => y.n - x.n);
          const best = kjent.filter((x) => x.n === kjent[0].n);
          const v = tilfeldig(best);
          return { q: v.q, a: v.a };
        }
      }
      if (niva === 1) return { q: tilfeldig(andre), a: tilfeldig(arter) };
      const mest = Math.max(...arter.map((a) => Fisk.antall(hand, a)));
      const a = tilfeldig(arter.filter((x) => Fisk.antall(hand, x) === mest));
      if (niva >= 3) {
        const flest = Math.max(...andre.map((i) => r.hender[i].length));
        return { q: tilfeldig(andre.filter((i) => r.hender[i].length === flest)), a };
      }
      return { q: tilfeldig(andre), a };
    },
    // Snapp: how long the phone takes to see a pair (ms), and whether it misses it.
    reaksjon(niva, rng) {
      const [fra, til, bom] = niva >= 3 ? [520, 820, 0] : niva === 2 ? [880, 1350, 0.1] : [1450, 2200, 0.25];
      return { ms: Math.round(fra + rng() * (til - fra)), bom: rng() < bom };
    },
  };

  const R = window.Rusj;
  if (!R) {
    window.Pusen = { KATT, art, verdi, fargeAv, MODUSER, Svarte, Fisk, Krig, Snap, Mobil, bland };
    return;
  }

  // ---------- The game ----------

  const esc = R.esc;
  const DEL_URL = "https://rusj.no" + R.forside + ((R.sprak !== "nb" && window.RUSJ_SPILL && window.RUSJ_SPILL.slug) || "pusen") + "/";
  window.Pusen = { KATT, art, verdi, fargeAv, MODUSER, Svarte, Fisk, Krig, Snap, Mobil, bland };

  // The ten animals, small to big. «med» is the name with its article («en gris», «an elephant»),
  // «bestemt» the definite form that starts a sentence («Elefanten vinner!», «The elephant wins!»).
  const DYR = [
    { e: "🐭", navn: R.t("Mus"), med: R.t("en mus"), bestemt: R.t("Musa") },
    { e: "🐰", navn: R.t("Kanin"), med: R.t("en kanin"), bestemt: R.t("Kaninen") },
    { e: "🦊", navn: R.t("Rev"), med: R.t("en rev"), bestemt: R.t("Reven") },
    { e: "🐶", navn: R.t("Hund"), med: R.t("en hund"), bestemt: R.t("Hunden") },
    { e: "🐷", navn: R.t("Gris"), med: R.t("en gris"), bestemt: R.t("Grisen") },
    { e: "🦁", navn: R.t("Løve"), med: R.t("en løve"), bestemt: R.t("Løven") },
    { e: "🐻", navn: R.t("Bjørn"), med: R.t("en bjørn"), bestemt: R.t("Bjørnen") },
    { e: "🐴", navn: R.t("Hest"), med: R.t("en hest"), bestemt: R.t("Hesten") },
    { e: "🦒", navn: R.t("Sjiraff"), med: R.t("en sjiraff"), bestemt: R.t("Sjiraffen") },
    { e: "🐘", navn: R.t("Elefant"), med: R.t("en elefant"), bestemt: R.t("Elefanten") },
  ];
  // «Du spør …» and «Mobilen spør …» are separate keys: English verbs agree («You ask», «The phone asks»).
  const sporTekst = (sp, p, q, a) =>
    mot(sp) && p === 0
      ? R.t("Du spør {mal}: Har du {dyr}?", { mal: objekt(sp, q), dyr: DYR[a].med })
      : R.t("{navn} spør {mal}: Har du {dyr}?", { navn: navn(sp, p), mal: objekt(sp, q), dyr: DYR[a].med });
  const KATTENAVN = R.t("Svarteper");
  const TINT = ["#ffd6e4", "#fff0bd", "#d4efff", "#d9f6cf"];
  const NIVA = { 1: R.t("Lett"), 2: R.t("Middels"), 3: R.t("Vanskelig") };
  const NIVATEKST = {
    1: R.t("Mobilen tar det med ro og glemmer litt."),
    2: R.t("Mobilen følger godt med."),
    3: R.t("Mobilen er rask og husker alt."),
  };

  // The friendly odd card: a black cat with green eyes and a red bow, in a 100 × 100 box.
  const KATTSVG = `<svg class="pu-katt" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
    <path d="M18 44 L16 10 L42 28Z M82 44 L84 10 L58 28Z" fill="#2a2140" stroke="#170e2b" stroke-width="4" stroke-linejoin="round"/>
    <path d="M22 34 L21 18 L34 28Z M78 34 L79 18 L66 28Z" fill="#ff9ec4"/>
    <ellipse cx="50" cy="56" rx="36" ry="32" fill="#2a2140" stroke="#170e2b" stroke-width="4"/>
    <ellipse cx="36" cy="52" rx="9" ry="10" fill="#9be15d"/><ellipse cx="64" cy="52" rx="9" ry="10" fill="#9be15d"/>
    <ellipse cx="37" cy="53" rx="3.6" ry="7" fill="#170e2b"/><ellipse cx="65" cy="53" rx="3.6" ry="7" fill="#170e2b"/>
    <circle cx="34" cy="48" r="2.4" fill="#fff"/><circle cx="62" cy="48" r="2.4" fill="#fff"/>
    <path d="M46 64 H54 L50 69Z" fill="#ff9ec4"/>
    <path d="M50 69 Q46 75 41 73 M50 69 Q54 75 59 73" fill="none" stroke="#fff1dd" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M30 66 L12 63 M30 70 L13 74 M70 66 L88 63 M70 70 L87 74" stroke="#fff1dd" stroke-width="2" stroke-linecap="round" opacity=".8"/>
    <path d="M38 88 L50 82 L62 88 L62 96 L50 90 L38 96Z" fill="#ff5a6e" stroke="#170e2b" stroke-width="3" stroke-linejoin="round"/>
    <circle cx="50" cy="89" r="3.6" fill="#ff5a6e" stroke="#170e2b" stroke-width="2.6"/>
  </svg>`;

  const MODUS = {
    svarte: { navn: R.t("Svarteper"), tekst: R.t("Ikke bli sittende med katten!"), ikon: `<span class="pu-flisikon">${KATTSVG}</span>`, flere: true },
    fisk: { navn: R.t("Fisk"), tekst: R.t("Samle fire like dyr"), ikon: "🎣", flere: true, niva: true },
    krig: { navn: R.t("Størst vinner"), tekst: R.t("Det største dyret vinner"), ikon: "🐘", lengde: true },
    snap: { navn: R.t("Snapp"), tekst: R.t("Like dyr? Trykk først!"), ikon: "👏", niva: true, lengde: true },
  };

  // ---------- Players ----------
  const mot = (sp) => sp.mot === "mobil";
  const menneske = (sp, p) => !mot(sp) || p === 0;
  // Whose eyes the table is seen with: you against the phone; together, the player whose turn it is.
  const meg = (sp) => (mot(sp) ? 0 : sp.modus === "svarte" || sp.modus === "fisk" ? R.klamp(sp.seer | 0, 0, sp.n - 1) : 0);
  const navn = (sp, p) => (!mot(sp) ? R.navn(p) : p === 0 ? R.t("Du") : sp.n === 2 ? R.t("Mobilen") : R.t("Mobil {n}", { n: p }));
  const objekt = (sp, p) => (!mot(sp) ? R.navn(p) : p === 0 ? R.t("deg") : sp.n === 2 ? R.t("mobilen") : R.t("Mobil {n}", { n: p }));
  const avatar = (sp, p, str = "") => (mot(sp) && p > 0 ? `<span class="avatar pu-mobil ${str}" aria-hidden="true">📱</span>` : R.avatar(p, str));

  // The phone players' dice; the seed moves on in the saved game, so a reload plays the same.
  function terning(sp) {
    const x = R.rng(sp.fro >>> 0)();
    sp.fro = (Math.imul(sp.fro, 1664525) + 1013904223) >>> 0;
    return x;
  }

  // ---------- Cards ----------
  const kortNavn = (k) => (k === KATT ? KATTENAVN : R.t("{dyr} ({n})", { dyr: DYR[art(k)].navn, n: verdi(k) }));
  // o: { opp (face up), h, v (button), klasse, stil, etikett }
  function kortHtml(k, o = {}) {
    const tag = o.h ? "button" : "span";
    const opp = o.opp !== false && k != null;
    const front =
      k == null
        ? ""
        : k === KATT
          ? `<span class="pu-side pu-for katt">${KATTSVG}</span>`
          : `<span class="pu-side pu-for" style="--kf:${TINT[fargeAv(k)]}"><b class="pu-tall">${verdi(k)}</b><span class="pu-dyr" style="--s:${(0.5 + art(k) * 0.045).toFixed(3)}">${DYR[art(k)].e}</span><b class="pu-tall ned">${verdi(k)}</b></span>`;
    const etikett = o.etikett || (opp ? kortNavn(k) : R.t("Et kort med baksiden opp"));
    return `<${tag} class="pu-kort${opp ? " opp" : ""}${o.klasse ? " " + o.klasse : ""}"${o.h ? ` data-h="${o.h}" data-v="${o.v}"` : ""}${o.stil ? ` style="${o.stil}"` : ""} ${tag === "button" ? "" : 'role="img" '}aria-label="${esc(etikett)}"><span class="pu-side pu-bak"></span>${opp ? front : ""}</${tag}>`;
  }
  // A row of cards that overlap when there is not room for all (the row is a size container).
  const rad = (innhold, antall, klasse = "") => `<div class="pu-rad ${klasse}" style="--n:${Math.max(1, antall)}">${innhold}</div>`;

  // ---------- A new game ----------

  function nyttSpill(S) {
    const o = S.oppsett;
    const modus = MODUSER.includes(o.modus) ? o.modus : "svarte";
    const m = MODUS[modus];
    const sammen = o.mot === "sammen";
    const n = sammen ? (m.flere ? R.klamp(S.antall || 2, 2, 4) : 2) : m.flere ? 1 + R.klamp(o.mobiler, 1, 3) : 2;
    const rng = R.rng(R.nyttFro());
    const per = o.lengde === "lang" ? 20 : 10;
    const r = modus === "svarte" ? Svarte.ny(n, rng) : modus === "fisk" ? Fisk.ny(n, rng) : modus === "krig" ? Krig.ny(per, rng) : Snap.ny(per, rng, 0.3);
    S.spill = {
      modus,
      mot: sammen ? "sammen" : "mobil",
      n,
      niva: R.klamp(o.niva, 1, 3),
      per,
      fro: R.nyttFro() >>> 0,
      r,
      port: sammen && (modus === "svarte" || modus === "fisk"),
      vist: false,
      valgt: -1,
      klar: [false, false],
      logg: null,
      ferdig: false,
      resultat: null,
    };
    R.statistikk("start", { modus, mot: S.spill.mot, spillere: n, niva: sammen ? 0 : S.spill.niva, kort: per });
  }

  // ---------- The phone players' turns (and Snapp's timing) ----------

  let turNr = 0; // a newer plan (or leaving the screen) stops the one that waits
  const sperret = [0, 0]; // a snap without a pair: that player's button rests a moment
  // The phone players' pace (the tests set window.Pusen.fart to play quicker).
  const FART = () => (Number(window.Pusen.fart) || 1) * (R.rolig() ? 0.6 : 1);

  function logg(sp, tekst, p, ikon) {
    sp.logg = { tekst, p: p == null ? -1 : p, ikon: ikon || "" };
  }

  function planlegg(S) {
    const sp = S.spill;
    const mitt = ++turNr;
    if (!sp || sp.ferdig || S.skjerm !== "spill" || sp.port) return;
    const fortsatt = R.vakt();
    const nar = (ms, fn) => setTimeout(() => mitt === turNr && fortsatt() && S.spill === sp && !sp.ferdig && fn(), ms * FART());
    const r = sp.r;
    if (sp.modus === "svarte") {
      if (r.taper != null) return nar(900, () => avslutt(S));
      if (sp.loft != null) {
        return nar(550, () => {
          const i = sp.loft;
          sp.loft = null;
          trekkSvarte(S, i);
        });
      }
      if (!menneske(sp, r.tur)) nar(menneske(sp, 0) && !r.hender[0].length ? 650 : 1100, () => mobilSvarte(S));
    } else if (sp.modus === "fisk") {
      if (Fisk.ferdig(r) || Fisk.fast(r)) return nar(1000, () => avslutt(S));
      if (sp.sporsmal) {
        return nar(1500, () => {
          const v = sp.sporsmal;
          sp.sporsmal = null;
          sporr(S, v.q, v.a);
        });
      }
      if (!menneske(sp, r.tur)) nar(1100, () => mobilFisk(S));
    } else if (sp.modus === "krig") {
      if (Krig.ferdig(r)) return nar(1400, () => avslutt(S));
    } else if (sp.modus === "snap") {
      if (Snap.like(r)) {
        if (mot(sp)) {
          const x = Mobil.reaksjon(sp.niva, () => terning(sp));
          if (!x.bom) nar(x.ms, () => snapp(S, 1));
          else if (Snap.tomt(r)) nar(2600, () => avslutt(S));
          else if (r.tur === 1) nar(2400, () => mobilSnu(S));
        } else if (Snap.tomt(r)) nar(3200, () => avslutt(S));
        return;
      }
      if (Snap.tomt(r)) return nar(900, () => avslutt(S));
      if (mot(sp) && r.tur === 1) nar(sp.niva >= 3 ? 750 : 1000, () => mobilSnu(S));
    }
  }

  // ---------- Svarteper ----------

  function trekkSvarte(S, i) {
    const sp = S.spill;
    const r = sp.r;
    const t = Svarte.trekk(r, i, () => terning(sp));
    if (!t) return;
    const hvem = navn(sp, t.p);
    // Who got the cat is only told against the phone (together, the others must not know).
    if (t.par != null) {
      logg(sp, R.t("{navn} fikk et par!", { navn: hvem }), t.p, DYR[t.par].e + DYR[t.par].e);
      R.lyd.riktig();
    } else if (t.kort === KATT && mot(sp) && t.p === 0) {
      logg(sp, R.t("Du fikk katten! Mjau!"), t.p, "🐱");
      R.lyd.pop();
    } else if (t.kort === KATT && mot(sp) && t.q === 0) {
      logg(sp, R.t("{navn} tok katten fra deg!", { navn: hvem }), t.p, "🐱");
      R.lyd.pling();
    } else {
      logg(sp, R.t("{navn} trakk et kort.", { navn: hvem }), t.p, "");
      R.lyd.snu();
    }
    for (const x of r.ute) if (!sp.utMeldt || !sp.utMeldt.includes(x)) {
      sp.utMeldt = [...(sp.utMeldt || []), x];
      if (menneske(sp, x) && x !== r.taper) {
        R.lyd.fanfare();
        R.si(mot(sp) ? R.t("Du er ferdig! Ingen kort igjen.") : R.t("{navn} er ferdig!", { navn: R.navn(x) }));
      }
    }
    sp.sistTrukket = { p: t.p, kort: t.kort, par: t.par };
    if (!mot(sp) && r.taper == null) sp.vist = true;
    R.vibrer(8);
    R.lagre();
    R.vis();
  }
  function mobilSvarte(S) {
    const sp = S.spill;
    const q = Svarte.fra(sp.r, sp.r.tur);
    if (q < 0) return;
    const i = Mobil.svarte(sp.r.hender[q].length, () => terning(sp));
    // Drawing from you: the card lifts out of your hand first (the plan takes it a moment later).
    if (q === 0 && !R.rolig()) {
      sp.loft = i;
      R.lagre();
      R.vis();
    } else trekkSvarte(S, i);
  }

  // ---------- Fisk ----------

  function sporr(S, q, a) {
    const sp = S.spill;
    const r = sp.r;
    const p = r.tur;
    const t = Fisk.sporr(r, q, a);
    if (!t) return;
    const dyr = DYR[a];
    const hvem = navn(sp, p);
    if (t.fikk) {
      logg(sp, R.t("{navn} fikk {antall} av {mal}!", { navn: hvem, antall: R.flertall(t.fikk, "kort", "kort"), mal: objekt(sp, q) }), p, `${dyr.e}×${t.fikk}`);
      R.lyd.riktig();
    } else if (t.heldig) {
      logg(sp, R.t("Fisk! {navn} trakk akkurat det dyret!", { navn: hvem }), p, `🎣${dyr.e}`);
      R.lyd.riktig();
    } else if (t.trakk != null) {
      logg(sp, R.t("Fisk! {navn} trakk et kort.", { navn: hvem }), p, "🎣");
      R.lyd.sveip();
    } else {
      logg(sp, R.t("Fisk! Men dammen er tom."), p, "🎣");
      R.lyd.pop();
    }
    if (t.sett.length) {
      setTimeout(() => R.lyd.fanfare(), 300);
      logg(sp, R.t("{navn} fikk fire like!", { navn: hvem }), p, t.sett.map((x) => DYR[x].e.repeat(4)).join(" "));
    }
    sp.sistSpurt = { p, q, a, fikk: t.fikk, trakk: menneske(sp, p) ? t.trakk : null };
    // Together: when the turn passes, the phone goes to the next player behind the gate.
    if (!mot(sp) && r.tur !== p && !Fisk.ferdig(r)) sp.vist = true;
    R.vibrer(8);
    R.lagre();
    R.vis();
  }
  // The phone asks: first the question (a moment to read it), then the answer.
  function mobilFisk(S) {
    const sp = S.spill;
    const p = sp.r.tur;
    const v = Mobil.fisk(sp.r, p, sp.niva, () => terning(sp));
    if (!v) return;
    logg(sp, sporTekst(sp, p, v.q, v.a), p, `${DYR[v.a].e}?`);
    sp.sporsmal = { p, q: v.q, a: v.a };
    R.lagre();
    R.vis();
  }

  // ---------- Størst vinner ----------

  function slag(S) {
    const sp = S.spill;
    const r = sp.r;
    const s = Krig.slag(r);
    if (!s) return;
    sp.klar = [false, false];
    const siste = s.runder[s.runder.length - 1];
    if (s.vinner == null) logg(sp, R.t("Like store! Alle beholder sine."), -1, "🤝");
    else {
      const stor = DYR[art(siste[s.vinner])];
      const tekst = mot(sp) ? (s.vinner === 0 ? R.t("{dyr} vinner! Kortene er dine.", { dyr: stor.bestemt }) : R.t("{dyr} vinner! Mobilen får kortene.", { dyr: stor.bestemt })) : R.t("{dyr} vinner! {navn} får kortene.", { dyr: stor.bestemt, navn: navn(sp, s.vinner) });
      logg(sp, (s.runder.length > 1 ? R.t("Like store – en gang til!") + " " : "") + tekst, s.vinner, stor.e);
    }
    if (s.vinner === 0 || !mot(sp)) R.lyd.riktig();
    else R.lyd.snu();
    R.vibrer(10);
    R.lagre();
    R.vis();
  }

  // ---------- Snapp ----------

  function snu(S, p) {
    const sp = S.spill;
    const r = sp.r;
    if (r.tur !== p || Snap.igjen(r, p) <= 0) return;
    Snap.snu(r);
    sp.logg = null;
    R.lyd.snu();
    R.lagre();
    R.vis();
  }
  function mobilSnu(S) {
    snu(S, 1);
  }
  function snapp(S, p) {
    const sp = S.spill;
    const r = sp.r;
    if (performance.now() < sperret[p]) return;
    const antall = r.midt.length;
    if (Snap.snapp(r, p)) {
      ++turNr; // the phone's planned snap is too late now
      logg(sp, mot(sp) ? (p === 0 ? R.t("Snapp! Du var først!") : R.t("Snapp! Mobilen var først.")) : R.t("Snapp! {navn} var først!", { navn: navn(sp, p) }), p, `+${antall}`);
      if (p === 0 || !mot(sp)) {
        R.lyd.fanfare();
        R.vibrer([20, 40, 20]);
      } else R.lyd.pop();
      R.lagre();
      R.vis();
      return;
    }
    // Not a pair: no penalty – the button just rests a moment.
    sperret[p] = performance.now() + 1200;
    logg(sp, R.t("Ikke like – vent på to like dyr!"), p, "🙈");
    R.lyd.pop();
    R.vis();
    const fortsatt = R.vakt();
    setTimeout(() => fortsatt() && R.vis(), 1250);
  }

  // ---------- The end ----------

  function avslutt(S) {
    const sp = S.spill;
    if (!sp || sp.ferdig) return;
    const r = sp.r;
    sp.ferdig = true;
    let poeng;
    let vant;
    if (sp.modus === "svarte") {
      const plass = Svarte.plasser(r);
      poeng = Array.from({ length: sp.n }, (_, i) => (i === r.taper ? 0 : sp.n - 1 - plass.indexOf(i)));
      vant = r.taper !== 0;
    } else if (sp.modus === "fisk") {
      poeng = r.sett.map((x) => x.length);
      const v = Fisk.vinnere(r);
      vant = v.length === 1 && v[0] === 0;
    } else {
      poeng = r.vunnet.slice();
      vant = poeng[0] > poeng[1];
    }
    sp.resultat = { poeng, vant };
    if (mot(sp)) {
      const s = S.seirer[sp.modus];
      s.spilt += 1;
      if (vant) {
        s.seirer += 1;
        R.merke("klassiker-pusen");
      }
    } else R.kveld.registrer(poeng.map((x, i) => ({ i, poeng: x })));
    S.sist = { modus: sp.modus, mot: sp.mot, vant: mot(sp) ? vant : null };
    R.statistikk("ferdig", { modus: sp.modus, mot: sp.mot, spillere: sp.n, niva: mot(sp) ? sp.niva : 0, vant: mot(sp) ? vant : null });
    R.lagre();
    R.gaTil("slutt");
  }

  // ---------- Markup ----------

  function meldingHtml(sp) {
    const l = sp.logg;
    if (!l) return `<p class="pu-melding tom" role="status"></p>`;
    return `<p class="pu-melding" role="status">${l.ikon ? `<span class="pu-ikon" aria-hidden="true">${esc(l.ikon)}</span>` : ""}<span>${esc(l.tekst)}</span></p>`;
  }

  // A seat: avatar, name and a line under it. o: { na (their turn), valgt, h, v, ute, kort (mini backs), info }
  function seteHtml(sp, p, o = {}) {
    const tag = o.h ? "button" : "div";
    const klasse = `pu-sete${o.na ? " na" : ""}${o.valgt ? " valgt" : ""}${o.ute ? " ute" : ""}`;
    const mini = o.kort ? `<span class="pu-mini" aria-hidden="true">${Array.from({ length: Math.min(o.kort, 10) }, () => "<i></i>").join("")}</span>` : "";
    return `<${tag} class="${klasse}"${o.h ? ` data-h="${o.h}" data-v="${o.v}" aria-pressed="${!!o.valgt}"` : ""}>
      ${avatar(sp, p)}<span class="pu-sete-navn">${esc(navn(sp, p))}</span>${mini}<small>${esc(o.info || "")}</small>
    </${tag}>`;
  }

  function svarteHtml(S) {
    const sp = S.spill;
    const r = sp.r;
    const jeg = meg(sp);
    const fra = Svarte.fra(r, r.tur);
    const minTur = menneske(sp, r.tur) && r.taper == null && !sp.vist;
    const andre = Array.from({ length: sp.n }, (_, i) => i).filter((i) => i !== jeg);
    const seter = andre
      .map((p) =>
        seteHtml(sp, p, {
          na: r.tur === p && r.taper == null,
          ute: !r.hender[p].length,
          kort: r.hender[p].length,
          info: r.hender[p].length ? R.flertall(r.hender[p].length, "kort", "kort") : r.taper === p ? "🐱" : R.t("Ferdig!"),
        }),
      )
      .join("");
    // The hand the turn draws from: face down. Your turn: each card is a button.
    let midt = "";
    if (r.taper == null && fra >= 0 && !(sp.vist && !mot(sp))) {
      const kort = r.hender[fra]
        .map((k, i) => (minTur ? kortHtml(k, { opp: false, h: "trekk", v: i, etikett: R.t("Kort {n} fra {navn}", { n: i + 1, navn: objekt(sp, fra) }) }) : kortHtml(k, { opp: false })))
        .join("");
      midt = `<div class="pu-trekk${minTur ? " din" : ""}">
          <p class="pu-hint">${esc(minTur ? R.t("Trekk et kort fra {navn}", { navn: objekt(sp, fra) }) : fra === jeg && mot(sp) ? R.t("{navn} trekker fra deg …", { navn: navn(sp, r.tur) }) : R.t("{navn} trekker fra {mal} …", { navn: navn(sp, r.tur), mal: objekt(sp, fra) }))}</p>
          ${fra === jeg && mot(sp) ? "" : rad(kort, r.hender[fra].length, "pu-bakrad")}
        </div>`;
    }
    const min = r.hender[jeg];
    const ny = sp.sistTrukket && sp.sistTrukket.p === jeg ? sp.sistTrukket.kort : null;
    const hand = min.map((k, i) => kortHtml(k, { klasse: (k === ny ? "ny" : "") + (sp.loft === i && fra === jeg ? " tatt" : "") })).join("");
    const parene = r.par[jeg].length;
    return `
      <div class="pu-seter">${seter}</div>
      ${meldingHtml(sp)}
      <div class="pu-midt">${midt}</div>
      <div class="pu-min">
        <p class="pu-hint">${esc(min.length ? (mot(sp) ? R.t("Dine kort") : R.t("Kortene til {navn}", { navn: R.navn(jeg) })) : R.t("Ingen kort igjen – du er ferdig!"))}${parene ? ` · ${esc(R.t("{n} par|{n} par", { n: parene }))}` : ""}</p>
        ${rad(hand, min.length, "pu-hand")}
      </div>`;
  }

  function fiskHtml(S) {
    const sp = S.spill;
    const r = sp.r;
    const jeg = meg(sp);
    const minTur = menneske(sp, r.tur) && !Fisk.ferdig(r) && !sp.vist;
    const andre = Array.from({ length: sp.n }, (_, i) => i).filter((i) => i !== jeg);
    const kan = andre.filter((i) => r.hender[i].length > 0);
    // The one to ask: chosen by a tap on a seat (with more than one to choose from).
    if (minTur && !kan.includes(sp.valgt)) sp.valgt = kan.length ? kan[0] : -1;
    const seter = andre
      .map((p) =>
        seteHtml(sp, p, {
          na: r.tur === p,
          valgt: minTur && kan.length > 1 && sp.valgt === p,
          h: minTur && kan.length > 1 && r.hender[p].length ? "velg" : "",
          v: p,
          kort: r.hender[p].length,
          info: `${R.flertall(r.hender[p].length, "kort", "kort")} · ${r.sett[p].map((a) => DYR[a].e).join("") || "–"}`,
        }),
      )
      .join("");
    const spm = sp.sporsmal;
    const min = r.hender[jeg];
    // Your hand by animal: one button per animal (the cards of it overlap).
    const grupper = [];
    for (let a = 0; a < 10; a++) {
      const kort = min.filter((k) => art(k) === a);
      if (kort.length) grupper.push({ a, kort });
    }
    const ny = sp.sistSpurt && sp.sistSpurt.p === jeg ? sp.sistSpurt.trakk : null;
    const gruppeHtml = grupper
      .map(({ a, kort }) => {
        const etikett = minTur && sp.valgt >= 0 ? R.t("Spør {mal} om {dyr} ({n} på hånden)", { mal: objekt(sp, sp.valgt), dyr: DYR[a].med, n: kort.length }) : R.t("{dyr}: {n}", { dyr: DYR[a].navn, n: kort.length });
        const inni = kort.map((k) => kortHtml(k, { klasse: k === ny ? "ny" : "" })).join("");
        return minTur && sp.valgt >= 0
          ? `<button class="pu-gruppe" data-h="sporr" data-v="${a}" style="--g:${kort.length}" aria-label="${esc(etikett)}">${inni}</button>`
          : `<span class="pu-gruppe" style="--g:${kort.length}" role="img" aria-label="${esc(etikett)}">${inni}</span>`;
      })
      .join("");
    const sett = r.sett[jeg];
    return `
      <div class="pu-seter">${seter}</div>
      ${meldingHtml(sp)}
      <div class="pu-midt pu-dam-rad">
        <div class="pu-dam" role="img" aria-label="${esc(R.t("Dammen: {n} kort|Dammen: {n} kort", { n: r.dam.length }))}">
          ${r.dam.length ? `${kortHtml(0, { opp: false })}${r.dam.length > 1 ? kortHtml(0, { opp: false, klasse: "bak2" }) : ""}` : ""}
          <span class="pu-dam-tall">🎣 ${r.dam.length}</span>
        </div>
        ${spm ? `<div class="pu-boble" aria-hidden="true">${avatar(sp, spm.p)}<b>${DYR[spm.a].e}?</b></div>` : ""}
      </div>
      <div class="pu-min">
        <p class="pu-hint">${esc(minTur ? (sp.valgt >= 0 ? R.t("Trykk på et dyr for å spørre {mal}", { mal: objekt(sp, sp.valgt) }) : "") : mot(sp) ? R.t("Dine kort") : R.t("Kortene til {navn}", { navn: R.navn(jeg) }))}${sett.length ? ` · <span class="pu-sett" aria-label="${esc(R.t("Fire like: {n}", { n: sett.length }))}">${sett.map((a) => DYR[a].e).join("")}</span>` : ""}</p>
        <div class="pu-grupper">${gruppeHtml}</div>
      </div>`;
  }

  // Størst vinner and Snapp: the other side at the top (turned round when two sit face to face).
  function siderHtml(sp, innholdTopp, innholdBunn, midt) {
    return `
      <div class="pu-side-topp${mot(sp) ? "" : " snudd"}">${innholdTopp}</div>
      ${meldingHtml(sp)}
      <div class="pu-midt pu-arena">${midt}</div>
      <div class="pu-side-bunn">${innholdBunn}</div>`;
  }
  // A deck to tap (face down, with the number of cards left), and what has been won.
  function bunkeHtml(sp, p, igjen, aktiv, tekst) {
    const etikett = R.t("{navn}: {n} kort igjen|{navn}: {n} kort igjen", { navn: navn(sp, p), n: igjen });
    const kort = igjen ? kortHtml(0, { opp: false }) + (igjen > 1 ? kortHtml(0, { opp: false, klasse: "bak2" }) : "") : "";
    return aktiv
      ? `<button class="pu-bunke aktiv" data-h="snu" data-v="${p}" aria-label="${esc(tekst + ". " + etikett)}">${kort}<span class="pu-bunke-tall">${igjen}</span><span class="pu-trykk">${esc(tekst)}</span></button>`
      : `<div class="pu-bunke" role="img" aria-label="${esc(etikett)}">${kort}<span class="pu-bunke-tall">${igjen}</span></div>`;
  }
  const vunnetHtml = (sp, p, n) => `<span class="pu-vunnet">${avatar(sp, p)}<b>${esc(navn(sp, p))}</b><small>${esc(R.t("{n} vunnet", { n }))}</small></span>`;

  function krigHtml(S) {
    const sp = S.spill;
    const r = sp.r;
    const s = r.sist;
    let midt = "";
    if (s) {
      midt = s.runder
        .map(([a, b], i) => {
          const kl = (p) => (s.vinner === p && i === s.runder.length - 1 ? " vinner" : "");
          const skjult = s.skjult[i] ? `<span class="pu-skjult">${kortHtml(0, { opp: false })}${kortHtml(0, { opp: false })}</span>` : "";
          return `<div class="pu-slag" style="--i:${i}">${kortHtml(b, { klasse: "topp" + kl(1) })}${kortHtml(a, { klasse: "bunn" + kl(0) })}</div>${skjult}`;
        })
        .join("");
    } else midt = `<p class="pu-hint">${esc(R.t("Snu kortet ditt – det største dyret vinner!"))}</p>`;
    const igjen = (p) => r.hender[p].length;
    const kanSnu = (p) => !Krig.ferdig(r) && !sp.klar[p];
    const topp = `${vunnetHtml(sp, 1, r.vunnet[1])}${bunkeHtml(sp, 1, igjen(1), !mot(sp) && kanSnu(1), sp.klar[1] ? R.t("Klar!") : R.t("Snu!"))}`;
    const bunn = `${bunkeHtml(sp, 0, igjen(0), kanSnu(0), sp.klar[0] ? R.t("Klar!") : R.t("Snu!"))}${vunnetHtml(sp, 0, r.vunnet[0])}`;
    return siderHtml(sp, topp, bunn, `<div class="pu-slagene" style="--runder:${s ? s.runder.length : 1}">${midt}</div>`);
  }

  const OVER_NY = "over ny"; // sprak-ok (class names)
  function snapHtml(S) {
    const sp = S.spill;
    const r = sp.r;
    const like = Snap.like(r);
    const topp1 = r.midt[r.midt.length - 1];
    const topp2 = r.midt[r.midt.length - 2];
    const midt = `<div class="pu-haug${like ? " like" : ""}" role="img" aria-label="${esc(r.midt.length ? (like ? R.t("To like dyr: {dyr}!", { dyr: DYR[art(topp1)].navn }) : R.t("Øverst: {dyr}", { dyr: kortNavn(topp1) })) : R.t("Ingen kort i midten"))}">
        ${topp2 != null ? kortHtml(topp2, { klasse: "under" }) : ""}
        ${topp1 != null ? kortHtml(topp1, { klasse: OVER_NY }) : `<span class="pu-tom">${esc(R.t("Tom bunke"))}</span>`}
        ${r.midt.length ? `<span class="pu-haug-tall">${r.midt.length}</span>` : ""}
      </div>`;
    const naa = performance.now();
    const snappKnapp = (p) =>
      `<button class="pu-snapp${like ? " like" : ""}" data-h="snapp" data-v="${p}" data-stille${naa < sperret[p] ? " disabled" : ""} aria-keyshortcuts="${p === 0 ? "S" : "L"}">${esc(R.t("SNAPP!"))}</button>`;
    const kanSnu = (p) => r.tur === p && Snap.igjen(r, p) > 0 && menneske(sp, p);
    const topp = `${vunnetHtml(sp, 1, r.vunnet[1])}${mot(sp) ? "" : snappKnapp(1)}${bunkeHtml(sp, 1, Snap.igjen(r, 1), !mot(sp) && kanSnu(1), R.t("Snu!"))}`;
    const bunn = `${bunkeHtml(sp, 0, Snap.igjen(r, 0), kanSnu(0), R.t("Snu!"))}${snappKnapp(0)}${vunnetHtml(sp, 0, r.vunnet[0])}`;
    return siderHtml(sp, topp, bunn, midt);
  }

  // Against the phone: you and the phone players with what each won (the phones keep their own avatar).
  function stillingHtml(sp, poeng) {
    const rekke = poeng.map((p, i) => ({ p, i })).sort((a, b) => b.p - a.p);
    const best = rekke[0].p;
    const enhet = sp.modus === "fisk" ? (n) => R.t("{n} × fire like", { n }) : (n) => R.flertall(n, "kort", "kort");
    return `<ol class="pu-stilling">${rekke
      .map(({ p, i }) => `<li class="${p === best ? "leder" : ""}">${avatar(sp, i)}<b>${esc(navn(sp, i))}</b><span>${esc(enhet(p))}</span></li>`)
      .join("")}</ol>`;
  }

  // Svarteper together: the order the players got out, and the cat with the last one.
  function svarteListe(sp) {
    const r = sp.r;
    return `<ol class="pu-stilling">${Svarte.plasser(r)
      .map((i, n) => `<li class="${n === 0 ? "leder" : ""}">${avatar(sp, i)}<b>${esc(navn(sp, i))}</b><span>${i === r.taper ? `<span class="pu-sluttkatt" role="img" aria-label="${esc(KATTENAVN)}">${KATTSVG}</span>` : esc(R.t("Nr. {n}", { n: n + 1 }))}</span></li>`)
      .join("")}</ol>`;
  }

  function spillHtml(S) {
    const sp = S.spill;
    const r = sp.r;
    // Together in Svarteper and Fisk: the gate before each turn hides the hand.
    if (sp.port) {
      return `${sp.logg ? `<p class="pu-port-sist" role="status">${esc(sp.logg.tekst)}</p>` : ""}
        ${R.ui.giTil({ i: r.tur, h: "vis", knapp: R.t("Vis kortene mine"), advarsel: R.t("De andre ser bort"), prikker: [sp.n, r.tur] })}`;
    }
    const innhold = sp.modus === "svarte" ? svarteHtml(S) : sp.modus === "fisk" ? fiskHtml(S) : sp.modus === "krig" ? krigHtml(S) : snapHtml(S);
    const videre = !mot(sp) && sp.vist ? R.ui.dokk(R.ui.knapp(R.t("Gi mobilen til {navn}", { navn: R.navn(r.tur) }), "videre")) : "";
    return `<h1 class="vh" id="skjerm-tittel">${esc(MODUS[sp.modus].navn)}</h1>
      <div class="pu-bord pu-${sp.modus}${mot(sp) ? "" : " sammen"}">${innhold}</div>${videre}`;
  }

  // ---------- Keys ----------
  document.addEventListener("keydown", (e) => {
    const S = R.S;
    if (!S || S.skjerm !== "spill" || !S.spill || S.spill.ferdig || R.arkApent() || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    const sp = S.spill;
    const m = e.target;
    if (m && m.closest && m.closest("button, input, a")) return;
    const k = e.key.toLowerCase();
    if (sp.modus === "snap") {
      if (k === " ") {
        e.preventDefault();
        if (menneske(sp, sp.r.tur)) snu(S, sp.r.tur);
      } else if (k === "s") snapp(S, 0);
      else if (k === "l" && !mot(sp)) snapp(S, 1);
    } else if (sp.modus === "krig" && (k === " " || k === "enter")) {
      e.preventDefault();
      H.snu({ dataset: { v: k === "enter" && !mot(sp) ? "1" : "0" } }, e, S);
    }
  });

  // ---------- Start ----------

  const tom = () => ({ spilt: 0, seirer: 0 });
  let H;
  R.start({
    id: "pusen",
    versjon: 1,
    pagar: (S) => !!(S.spill && !S.spill.ferdig),

    tilstand: () => ({
      antall: 2,
      oppsett: { modus: "svarte", mot: "mobil", mobiler: 1, niva: 2, lengde: "kort" },
      seirer: { svarte: tom(), fisk: tom(), krig: tom(), snap: tom() },
      sist: null,
      spill: null,
    }),

    lastet(S) {
      const heltall = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
      const o = S.oppsett && typeof S.oppsett === "object" ? S.oppsett : {};
      S.oppsett = {
        modus: MODUSER.includes(o.modus) ? o.modus : "svarte",
        mot: o.mot === "sammen" ? "sammen" : "mobil",
        mobiler: heltall(o.mobiler, 1, 3) ? o.mobiler : 1,
        niva: heltall(o.niva, 1, 3) ? o.niva : 2,
        lengde: o.lengde === "lang" ? "lang" : "kort",
      };
      S.antall = R.klamp(Math.floor(Number(S.antall)) || 2, 2, 4);
      const sei = S.seirer && typeof S.seirer === "object" ? S.seirer : {};
      S.seirer = {};
      for (const m of MODUSER) {
        const x = sei[m] || {};
        const spilt = heltall(x.spilt, 0, 1e6) ? x.spilt : 0;
        S.seirer[m] = { spilt, seirer: heltall(x.seirer, 0, spilt) ? x.seirer : 0 };
      }
      S.sist = S.sist && MODUSER.includes(S.sist.modus) ? S.sist : null;
      const sp = S.spill;
      if (sp) {
        const kortOk = (h) => Array.isArray(h) && h.every((k) => heltall(k, 0, 40));
        const r = sp.r;
        let ok = MODUSER.includes(sp.modus) && ["mobil", "sammen"].includes(sp.mot) && heltall(sp.n, 2, 4) && r && typeof r === "object" && Number.isFinite(sp.fro);
        if (ok && (sp.modus === "svarte" || sp.modus === "fisk")) ok = Array.isArray(r.hender) && r.hender.length === sp.n && r.hender.every(kortOk) && heltall(r.tur, 0, sp.n - 1);
        if (ok && sp.modus === "fisk") ok = kortOk(r.dam) && Array.isArray(r.sett) && Array.isArray(r.minne);
        if (ok && sp.modus === "svarte") ok = Array.isArray(r.par) && Array.isArray(r.ute);
        if (ok && (sp.modus === "krig" || sp.modus === "snap")) ok = sp.n === 2 && Array.isArray(r.hender) && r.hender.length === 2 && r.hender.every(kortOk) && Array.isArray(r.vunnet);
        if (ok && sp.modus === "snap") ok = Array.isArray(r.pos) && kortOk(r.midt) && heltall(r.tur, 0, 1);
        if (!ok) S.spill = null;
        else {
          sp.ferdig = !!sp.ferdig && !!sp.resultat;
          sp.klar = [false, false];
          sp.sporsmal = null;
          sp.loft = null;
          if (!Array.isArray(sp.utMeldt)) sp.utMeldt = [];
          // A reload on a hot seat: whoever holds the phone shows it is them again.
          if (!sp.ferdig && sp.mot === "sammen" && (sp.modus === "svarte" || sp.modus === "fisk")) {
            sp.port = !sp.vist;
          }
        }
      }
      const s = S.spill;
      if (S.skjerm === "spill" && !s) S.skjerm = "hjem";
      if (S.skjerm === "slutt" && !(s && s.ferdig)) S.skjerm = s ? "spill" : "hjem";
      if (S.skjerm === "spill" && s && s.ferdig) S.skjerm = "slutt";
    },

    regler: {
      intro: R.t("Fire kortspill for barn med dyrekort – fra den lille musa (1) til den store elefanten (10). Spill mot mobilen eller sammen på én mobil."),
      steg: [
        [R.t("Svarteper"), R.t("Like par legges bort med en gang. Etter tur trekker du et kort fra den neste. Ikke bli sittende igjen med katten Svarteper til slutt!")],
        [R.t("Fisk"), R.t("Spør en annen spiller om et dyr du har selv. Har spilleren det, får du alle – og spør igjen. Hvis ikke: Fisk! Trekk et kort. Fire like dyr blir lagt ned, og den som får flest, vinner.")],
        [R.t("Størst vinner"), R.t("Snu det øverste kortet samtidig. Det største dyret vinner begge. Like store? Ett kort med baksiden opp, så ett til – det største tar alt.")],
        [R.t("Snapp"), R.t("Snu kort etter tur i midten. Kommer to like dyr etter hverandre, trykk SNAPP! fortest mulig. Den raskeste får hele bunken.")],
      ],
      tips: [
        R.t("Tallet på kortet viser hvor stort dyret er: 1 musa, 2 kaninen, 3 reven, 4 hunden, 5 grisen, 6 løven, 7 bjørnen, 8 hesten, 9 sjiraffen og 10 elefanten."),
        R.t("Svarteper er en snill, svart katt. Den som har den til slutt, får bare en kos fra pusen!"),
        R.t("I Fisk lønner det seg å huske hva de andre spør om – da vet du hvem som har hva."),
        R.t("Mot mobilen kan du velge lett, middels eller vanskelig i Fisk og Snapp."),
        R.t("Sammen på én mobil: I Svarteper og Fisk skjules kortene mellom hver tur. I Størst vinner og Snapp sitter dere overfor hverandre med mobilen i midten."),
        R.t("Med tastatur i Snapp: mellomrom snur kortet, S er SNAPP (L for spilleren på den andre siden)."),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const sp = S.spill;
          const aktiv = !!(sp && !sp.ferdig);
          const sei = MODUSER.filter((m) => S.seirer[m].spilt > 0).map((m) => `<li><b>${esc(MODUS[m].navn)}</b> ${esc(R.t("{seirer} av {spilt}", { seirer: S.seirer[m].seirer, spilt: S.seirer[m].spilt }))}</li>`);
          const sist = S.sist
            ? S.sist.vant == null
              ? R.t("Sist: {spill} sammen", { spill: MODUS[S.sist.modus].navn })
              : S.sist.vant
                ? R.t("Sist: {spill} – du vant!", { spill: MODUS[S.sist.modus].navn })
                : R.t("Sist: {spill} – mobilen vant", { spill: MODUS[S.sist.modus].navn })
            : "";
          return R.ui.spillhjem({
            slagordHtml: `${esc(R.t("Svarteper, Fisk, Størst vinner og Snapp."))}<br><em>${esc(R.t("Fire kortspill med dyr!"))}</em>`,
            knapperHtml: R.ui.startKnapper({
              pagar: aktiv,
              fortsettTekst: aktiv ? R.t("Fortsett · {spill}", { spill: MODUS[sp.modus].navn }) : "",
              startTekst: R.t("Start"),
              ekstraHtml:
                R.ui.lenke(R.t("Slik spiller du"), "regler") +
                (sei.length || sist
                  ? `<section class="pu-rekorder" aria-label="${esc(R.t("Seirer mot mobilen"))}">${sei.length ? `<p class="etikett">${esc(R.t("Seirer mot mobilen"))}</p><ul>${sei.join("")}</ul>` : ""}${sist ? `<p class="pu-sistlinje">${esc(sist)}</p>` : ""}</section>`
                  : ""),
            }),
            merker: [
              ["4", R.t("kortspill")],
              ["1–4", R.t("spillere")],
              ["0", R.t("reklame")],
            ],
          });
        },
      },

      oppsett: {
        tittel: R.t("Nytt spill"),
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          const m = MODUS[o.modus];
          const sammen = o.mot === "sammen";
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
            <section class="seksjon pu-moduser">
              ${R.ui.fliser("modus", MODUSER.map((x) => ({ v: x, tittel: MODUS[x].navn, tekst: MODUS[x].tekst, ikon: MODUS[x].ikon })), o.modus)}
            </section>
            <section class="seksjon">
              <div class="seksjon-hode"><h2>${esc(R.t("Hvem spiller?"))}</h2></div>
              ${R.ui.seg("mot", [["mobil", R.t("Mot mobilen")], ["sammen", R.t("Sammen på én mobil")]], o.mot, { etikett: R.t("Hvem spiller") })}
            </section>
            ${
              !sammen && m.flere
                ? `<section class="seksjon"><div class="seksjon-hode"><h2>${esc(R.t("Hvor mange mobilspillere?"))}</h2></div>${R.ui.seg("mobiler", [[1, "1"], [2, "2"], [3, "3"]], o.mobiler, { etikett: R.t("Antall mobilspillere") })}</section>`
                : ""
            }
            ${
              !sammen && m.niva
                ? `<section class="seksjon"><div class="seksjon-hode"><h2>${esc(R.t("Hvor flink er mobilen?"))}</h2></div>${R.ui.seg("niva", [1, 2, 3].map((n) => [n, NIVA[n]]), o.niva, { etikett: R.t("Nivå") })}<p class="hjelp">${esc(NIVATEKST[o.niva])}</p></section>`
                : ""
            }
            ${sammen ? R.ui.spillere({ min: 2, max: m.flere ? 4 : 2, tittel: R.t("Hvem er med?"), hjelp: m.flere ? R.t("Kortene skjules mellom hver tur, så ingen ser de andres.") : R.t("Sett dere overfor hverandre med mobilen i midten.") }) : ""}
            ${
              m.lengde
                ? `<section class="seksjon"><div class="seksjon-hode"><h2>${esc(R.t("Hvor lenge?"))}</h2></div>${R.ui.seg("lengde", [["kort", R.t("10 kort hver")], ["lang", R.t("20 kort hver")]], o.lengde, { etikett: R.t("Hvor lenge") })}</section>`
                : ""
            }
            ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start", { variant: "stor" }))}`;
        },
      },

      spill: {
        tittel: (S) => (S.spill ? MODUS[S.spill.modus].navn : ""),
        tilbake: "hjem",
        liggende: false,
        vis: spillHtml,
        etter(S) {
          planlegg(S);
        },
        inn(S) {
          if (!S.spill) return R.gaTil("hjem");
          if (S.spill.ferdig) return R.gaTil("slutt");
          R.holdVaken();
        },
        ut() {
          ++turNr;
          R.slippVaken();
        },
      },

      slutt: {
        tittel: (S) => (S.spill && !mot(S.spill) ? R.t("Kåringen") : S.spill ? MODUS[S.spill.modus].navn : ""),
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const res = sp.resultat || { poeng: [], vant: false };
          const r = sp.r;
          const rader = res.poeng.map((p, i) => ({ i, poeng: p, navn: navn(sp, i) }));
          let banner;
          if (sp.modus === "svarte") {
            const taper = r.taper;
            const tekst = mot(sp)
              ? taper === 0
                ? R.t("Katten Svarteper ble hos deg. Den gir deg en kos – prøv igjen!")
                : R.t("Katten Svarteper ble hos {navn}.", { navn: objekt(sp, taper) })
              : R.t("Katten Svarteper ble hos {navn}. Den gir en kos!", { navn: R.navn(taper) });
            const forst = Svarte.plasser(r)[0];
            banner = R.ui.banner({
              etikett: MODUS.svarte.navn,
              tittel: mot(sp) ? (taper === 0 ? R.t("Mjau! Du fikk katten") : R.t("Du slapp unna katten!")) : R.t("{navn} ble ferdig først!", { navn: R.navn(forst) }),
              tekstHtml: `<span class="pu-sluttkatt">${KATTSVG}</span> ${esc(tekst)}`,
              klasse: "aksent",
              stemning: mot(sp) && taper === 0 ? "" : "jubel",
            });
          } else {
            const best = Math.max(...res.poeng);
            const vinnere = rader.filter((x) => x.poeng === best).map((x) => x.i);
            const enhet = sp.modus === "fisk" ? R.t("fire like") : R.t("kort");
            const etikett = MODUS[sp.modus].navn + (sp.n === 2 ? " · " + res.poeng.join("–") + " " + enhet : "");
            const tittel = mot(sp)
              ? vinnere.length > 1
                ? R.t("Uavgjort!")
                : vinnere[0] === 0
                  ? R.t("Du vant!")
                  : sp.n === 2
                    ? R.t("Mobilen vant!")
                    : R.t("{navn} vant!", { navn: navn(sp, vinnere[0]) })
              : R.t("{navn} vinner!|{navn} vinner!", { navn: R.ramsOpp(vinnere.map((i) => R.navn(i))), n: vinnere.length });
            banner = R.ui.banner({ etikett, tittel, klasse: "aksent", stemning: !mot(sp) || res.vant || vinnere.length > 1 ? "jubel" : "", tekst: mot(sp) && !res.vant ? R.t("Godt spilt! Vil du prøve en gang til?") : "" });
          }
          const sei = mot(sp) ? S.seirer[sp.modus] : null;
          return `
            ${banner}
            ${sp.modus === "svarte" ? (mot(sp) ? "" : svarteListe(sp)) : mot(sp) ? stillingHtml(sp, res.poeng) : `${sp.n >= 3 ? R.ui.pall(rader.map((x) => ({ i: x.i, poeng: x.poeng }))) : ""}${R.ui.poengliste(rader.map((x) => ({ i: x.i, poeng: x.poeng })))}`}
            ${sei ? `<p class="hjelp pu-linje">${esc(R.t("Seirer mot mobilen i {spill}: {seirer} av {spilt}", { spill: MODUS[sp.modus].navn, seirer: sei.seirer, spilt: sei.spilt }))}</p>` : ""}
            ${mot(sp) && res.vant ? R.ui.knapp2(R.t("Del resultatet"), "del") : ""}
            ${R.ui.flereSpill({ antall: mot(sp) ? 1 : sp.n })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen"), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "nytt"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
        },
        inn(S) {
          const sp = S.spill;
          if (!sp || !sp.resultat) return;
          if (!mot(sp) || sp.resultat.vant) {
            R.lyd.fanfare();
            R.vibrer([40, 60, 120]);
            R.konfetti();
          } else {
            R.lyd.riktig();
            setTimeout(() => R.lyd.pling(), 260);
          }
        },
      },
    },

    handlinger: (H = {
      async nytt(el, e, S) {
        const fortsatt = R.vakt();
        const sp = S.spill;
        if ((await R.bekreftNytt(!!(sp && !sp.ferdig), !!sp && mot(sp))) && fortsatt()) R.gaTil("oppsett");
      },
      fortsett(el, e, S) {
        R.gaTil(S.spill && !S.spill.ferdig ? "spill" : "hjem");
      },
      modus(el, e, S) {
        if (MODUSER.includes(el.dataset.v)) S.oppsett.modus = el.dataset.v;
        R.vis();
      },
      mot(el, e, S) {
        S.oppsett.mot = el.dataset.v === "sammen" ? "sammen" : "mobil";
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
      lengde(el, e, S) {
        S.oppsett.lengde = el.dataset.v === "lang" ? "lang" : "kort";
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
      // The gate: the player shows it is them, and the hand comes up.
      vis(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.port) return;
        sp.port = false;
        sp.vist = false;
        sp.seer = sp.r.tur;
        sp.logg = null;
        R.vis();
      },
      // Together: done with the turn, the phone goes on (behind the gate).
      videre(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.vist) return;
        sp.vist = false;
        if (sp.modus === "svarte" ? sp.r.taper != null : Fisk.ferdig(sp.r)) return avslutt(S);
        sp.port = true;
        R.vis();
      },
      trekk(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.ferdig || sp.modus !== "svarte" || sp.port || sp.vist || !menneske(sp, sp.r.tur)) return;
        trekkSvarte(S, Number(el.dataset.v));
      },
      velg(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.modus !== "fisk") return;
        sp.valgt = Number(el.dataset.v);
        R.vis();
      },
      sporr(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.ferdig || sp.modus !== "fisk" || sp.port || sp.vist || !menneske(sp, sp.r.tur)) return;
        const a = Number(el.dataset.v);
        if (!Fisk.lovlig(sp.r, sp.r.tur, sp.valgt, a)) return;
        logg(sp, sporTekst(sp, sp.r.tur, sp.valgt, a), sp.r.tur, `${DYR[a].e}?`);
        sporr(S, sp.valgt, a);
      },
      snu(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.ferdig) return;
        const p = Number(el.dataset.v);
        if (sp.modus === "snap") {
          if (menneske(sp, p)) snu(S, p);
          return;
        }
        if (sp.modus !== "krig" || Krig.ferdig(sp.r) || !menneske(sp, p)) return;
        if (mot(sp)) return slag(S);
        sp.klar[p] = true;
        R.lyd.klikk();
        if (sp.klar[0] && sp.klar[1]) slag(S);
        else R.vis();
      },
      snapp(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.ferdig || sp.modus !== "snap") return;
        const p = Number(el.dataset.v);
        if (menneske(sp, p)) snapp(S, p);
      },
      del(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.ferdig || !sp.resultat) return;
        const res = sp.resultat;
        const tekst = R.t("Pusen 🐱 Jeg slo mobilen i {spill} ({stilling})! Klarer du det?", { spill: MODUS[sp.modus].navn, stilling: res.poeng.join("–") });
        R.del(R.app.navn, tekst, DEL_URL, { kort: { tittel: R.app.navn, linjer: [res.poeng.join("–"), MODUS[sp.modus].navn] } });
      },
    }),
  });
})();
