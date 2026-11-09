/* Varulven — Werewolf on one phone that goes around the table. No game master: the phone tells
   everyone what to do, narrates the night and keeps track of who is alive.
   Fairness: every living player gets the phone every night and does the same thing — picks one
   name and reads a short answer that stays on screen for the same minimum time — and every night
   screen looks alike, so nobody can work out roles from timing, colours or sounds. */
(function () {
  "use strict";

  const R = window.Rusj;
  const F = window.RUSJ_DATA.fortelling;
  const esc = R.esc;

  const HOLD = "Hold fingeren på kortet for å se";
  const MIN = 6;
  const MAKS = 18;
  const TIDER = [2, 3, 5];
  const VENT_MS = 2200; // every night answer stays at least this long, whatever the role
  const PORT_MS = 700; // «Jeg er X» ignores taps this soon after the hand-over (double taps)
  const range = (n) => Array.from({ length: n }, (_, i) => i);
  let H; // the actions, so one action can reuse another
  let teller = false; // a countdown is running

  const MAGEFOLELSE = "Svaret er hemmelig. Når spillet er slutt, får dere se hvem som hadde best magefølelse.";
  const ROLLER = {
    varulv: {
      navn: "Varulv",
      flertall: "varulver",
      ikon: "🐺",
      tekst: "Om natta velger ulveflokken hvem som skal tas. Om dagen later du som du er helt vanlig.",
      sporsmal: "Hvem skal ulveflokken ta i natt?",
      verb: "Ta",
      ute: "En varulv mindre i landsbyen!",
    },
    synsk: {
      navn: "Synsk",
      ikon: "🔮",
      tekst: "Hver natt får du vite om én person er varulv. Bruk det klokt – uten å avsløre deg.",
      sporsmal: "Hvem vil du se nærmere på i natt?",
      info: "Du får vite om personen er varulv eller ikke.",
      verb: "Se på",
      ute: "Nå er det ingen som ser inn i krystallkula lenger.",
    },
    lege: {
      navn: "Lege",
      ikon: "🩺",
      tekst: "Hver natt beskytter du én person mot ulvene. Gjerne deg selv – men ikke den samme to netter på rad.",
      sporsmal: "Hvem vil du beskytte i natt?",
      info: "Du kan beskytte deg selv, men ikke den samme to netter på rad.",
      verb: "Beskytt",
      ute: "Uten lege blir nettene farligere.",
    },
    jeger: {
      navn: "Jeger",
      ikon: "🏹",
      tekst: "Blir du tatt eller kastet ut, tar du med deg én person i fallet. Sikt godt!",
      sporsmal: "Hvem tror du er varulv?",
      info: MAGEFOLELSE,
      verb: "Mistenk",
      ute: "Men jegeren rekker et siste skudd …",
    },
    landsby: {
      navn: "Landsbyboer",
      flertall: "landsbyboere",
      ikon: "🏡",
      tekst: "Ingen superkrefter – bare magefølelse. Finn varulvene og stem dem ut om dagen.",
      sporsmal: "Hvem tror du er varulv?",
      info: MAGEFOLELSE,
      verb: "Mistenk",
      ute: "Varulvene gnir seg i potene.",
    },
  };
  const SPESIAL = ["synsk", "lege", "jeger"];

  const anbefalteUlver = (n) => (n <= 7 ? 1 : n <= 11 ? 2 : n <= 15 ? 3 : 4);
  const maksUlver = (n) => Math.max(1, Math.floor((n - 1) / 3));
  const antallUlver = (S) => R.klamp(S.oppsett.ulver || anbefalteUlver(S.antall), 1, maksUlver(S.antall));

  function kortstokk(n, ulver, o) {
    const kort = [];
    for (let i = 0; i < ulver; i++) kort.push("varulv");
    SPESIAL.forEach((r) => o[r] && kort.push(r));
    while (kort.length < n) kort.push("landsby");
    return kort;
  }

  // ---------- Reading the game state ----------

  const erUlv = (sp, i) => sp.roller[i] === "varulv";
  const levende = (sp) => range(sp.n).filter((i) => sp.levende[i]);
  const levendeMed = (sp, rolle) => levende(sp).filter((i) => sp.roller[i] === rolle);
  const ulveflokk = (sp) => levende(sp).filter((i) => erUlv(sp, i));
  const rolle = (sp, i) => ROLLER[sp.roller[i]];

  function vinner(sp) {
    const lev = levende(sp);
    const ulver = lev.filter((i) => erUlv(sp, i)).length;
    if (ulver === 0) return "landsby";
    if (ulver >= lev.length - ulver) return "ulv";
    return null;
  }

  // "A", "A og B", "A, B og C"
  const liste = (navn) => R.ramsOpp(navn);
  // Narration rotates through the lines, starting somewhere new each game. Lines that refer to
  // earlier rounds (in "<kind>Senere") join from round 2.
  const linje = (sp, slag, nr) => {
    const linjer = nr >= 2 && F[slag + "Senere"] ? F[slag].concat(F[slag + "Senere"]) : F[slag];
    return linjer[(sp.fro + nr) % linjer.length];
  };

  // ---------- Sounds (synthesised) ----------

  function ul() {
    const c = R.lyd.lasOpp();
    if (!c) return;
    try {
      const t0 = c.currentTime + 0.03;
      const o = c.createOscillator();
      const vib = c.createOscillator();
      const vibStyrke = c.createGain();
      const g = c.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(320, t0);
      o.frequency.exponentialRampToValueAtTime(600, t0 + 0.55);
      o.frequency.linearRampToValueAtTime(570, t0 + 1.5);
      o.frequency.exponentialRampToValueAtTime(350, t0 + 2.4);
      vib.frequency.value = 5.5;
      vibStyrke.gain.setValueAtTime(0, t0);
      vibStyrke.gain.linearRampToValueAtTime(11, t0 + 1);
      vib.connect(vibStyrke).connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.1, t0 + 0.35);
      g.gain.setValueAtTime(0.1, t0 + 1.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.5);
      o.connect(g).connect(c.destination);
      o.start(t0);
      vib.start(t0);
      o.stop(t0 + 2.6);
      vib.stop(t0 + 2.6);
      R.lyd.stoy(0.05, 0.7, 0.03, 700);
    } catch (e) {
      /* no audio on this device */
    }
  }

  function hane() {
    const t = R.lyd.tone;
    t(600, 0, 0.1, "square", 0.05, 700);
    t(700, 0.12, 0.1, "square", 0.05, 820);
    t(820, 0.24, 0.12, "square", 0.05, 980);
    t(980, 0.4, 0.55, "square", 0.06, 620);
  }

  // Night, morning or day look for the whole page.
  function stemning(navn) {
    const el = document.documentElement;
    el.classList.toggle("vu-natt", navn === "natt");
    el.classList.toggle("vu-morgen", navn === "morgen");
  }

  // ---------- Small building blocks ----------

  function navnKlasse(navn) {
    const lengste = Math.max(...String(navn).split(/\s+/).map((d) => d.length));
    return lengste >= 14 ? "vu-navn-xl" : lengste >= 11 ? "vu-navn-l" : "";
  }

  const stempel = (sp, i) => `<span class="stempel ${erUlv(sp, i) ? "mynte" : ""}">${esc(rolle(sp, i).navn)}</span>`;

  const toLinjer = (topp, under) => `<span class="vu-to-linjer"><b>${esc(topp)}</b><small>${esc(under)}</small></span>`;

  function rollekort(sp, i) {
    const r = rolle(sp, i);
    let fot = "Du er med i landsbyen. Dere vinner når alle varulvene er ute.";
    if (erUlv(sp, i)) {
      const andre = range(sp.n).filter((j) => j !== i && erUlv(sp, j));
      fot = andre.length ? `Ulveflokken: du og ${liste(andre.map(R.navn))}.` : "Du er den eneste varulven.";
    }
    return {
      klasse: "vu-kort",
      html: `
        <span class="kort-etikett">Du er</span>
        <span class="vu-kort-ikon" aria-hidden="true">${r.ikon}</span>
        <span class="kort-ord">${esc(r.navn)}</span>
        <span class="vu-kort-tekst">${esc(r.tekst)}</span>
        <span class="kort-fot">${esc(fot)}</span>`,
    };
  }

  // Everyone in the village: the living, and the dead with their role turned over.
  function landsbyen(sp) {
    return `<ul class="vu-landsby">${range(sp.n)
      .map((i) => {
        const dod = !sp.levende[i];
        return `<li class="${dod ? "dod" : ""}">${R.avatar(i)}<span><b>${esc(R.navn(i))}</b>${
          dod ? `<small>${rolle(sp, i).ikon} ${esc(rolle(sp, i).navn)}</small>` : ""
        }</span></li>`;
      })
      .join("")}</ul>`;
  }

  function prikker(sp) {
    const t = sp.tur;
    return `<div class="fremdrift" aria-hidden="true">${t.rekke
      .map((i, k) => `<span class="prikk ${k === t.pos ? "na" : k < t.pos ? "ferdig" : ""}" style="--pf: var(--p${(i % 20) + 1})"></span>`)
      .join("")}</div>`;
  }

  // The names a player can pick at night. Everyone sees every living player in the same list;
  // the ones you can't pick are greyed out. A tap only marks a name; the dock confirms it.
  function nattValg(sp, meg) {
    const r = sp.roller[meg];
    const markert = sp.tur.markert;
    return `<div class="velgere vu-velgere">${levende(sp)
      .map((i) => {
        const deg = i === meg;
        let av = false;
        let merke = "";
        if (r === "varulv" && erUlv(sp, i)) {
          av = true;
          merke = deg ? "deg" : "🐺";
        } else if (r === "lege") {
          if (i === sp.forrigeBeskyttet) {
            av = true;
            merke = "i går";
          } else if (deg) merke = "deg";
        } else if (deg) {
          av = true;
          merke = "deg";
        }
        return `<button class="velger" data-h="marker" data-v="${i}" aria-pressed="${markert === i}"${av ? " disabled" : ""}>${R.avatar(i)}<span><b>${esc(R.navn(i))}</b>${
          merke ? `<small>${esc(merke)}</small>` : ""
        }</span></button>`;
      })
      .join("")}</div>`;
  }

  function ulveInfo(sp, meg) {
    const andre = ulveflokk(sp).filter((i) => i !== meg);
    if (!andre.length) return sp.roller.filter((r) => r === "varulv").length > 1 ? "Du er den eneste varulven igjen." : "Du er den eneste varulven.";
    const valgt = andre.filter((i) => sp.valg[i] != null);
    return (
      `Ulveflokken: du og ${esc(liste(andre.map(R.navn)))}. ` +
      (valgt.length
        ? valgt.map((i) => `<b>${esc(R.navn(i))}</b> vil ta <b>${esc(R.navn(sp.valg[i]))}</b>.`).join(" ")
        : "Ingen av de andre har valgt ennå i natt.")
    );
  }

  // The short private answer after a night pick.
  function nattSvar(sp, meg) {
    const r = sp.roller[meg];
    const m = sp.valg[meg];
    const navn = R.navn(m);
    if (r === "varulv") {
      const flokk = ulveflokk(sp).filter((i) => sp.valg[i] != null);
      return {
        ikon: "🐺",
        hoved: `Du vil ta ${navn}.`,
        under:
          flokk.length > 1
            ? `Ulveflokken: ${flokk.map((i) => `${i === meg ? "du" : R.navn(i)} → ${R.navn(sp.valg[i])}`).join(", ")}. Flertallet bestemmer – står det likt, avgjør månen.`
            : "Flertallet i ulveflokken bestemmer. Står det likt, avgjør månen.",
      };
    }
    if (r === "synsk") {
      const ulv = erUlv(sp, m);
      return { ikon: ulv ? "🐺" : "🏡", hoved: ulv ? `${navn} er varulv!` : `${navn} er ikke varulv.`, under: "Husk det – men ikke avslør deg for tidlig." };
    }
    if (r === "lege") return { ikon: "🩺", hoved: `Du beskytter ${navn} i natt.`, under: "Kommer ulvene, står du klar med plaster." };
    return { ikon: "🤫", hoved: "Mistanken din er notert.", under: `Du tror ${navn} er varulv. Dere får se hvem som hadde rett når spillet er slutt.` };
  }

  // ---------- Day clock (survives reloads: the end time is saved in S) ----------

  const igjenMs = (k) => (k.slutt ? Math.max(0, k.slutt - Date.now()) : k.igjen);

  function startKlokke(S) {
    const k = S.spill.klokke;
    if (k.gaar && !k.slutt) k.slutt = Date.now() + k.igjen;
    const igjen = igjenMs(k);
    const t = new R.Timer({ id: "klokke", sekunder: k.total, vedSlutt: () => tidenUte(S) });
    t.igjenMs = igjen;
    if (igjen <= 0) {
      // Coming back to a day whose time is up: show it, but don't jump anywhere by itself.
      k.igjen = 0;
      k.slutt = null;
      k.gaar = false;
      t.tegn();
      if (!k.ute) {
        k.ute = true;
        R.vis();
      }
      return;
    }
    if (k.gaar) t.start();
    else t.tegn();
    R.lagre();
  }

  // When the time runs out while you watch, the vote opens after a moment — unless someone taps
  // «+1 min» or «Pause» first.
  let hopp = null;
  const avbrytHopp = () => {
    clearTimeout(hopp);
    hopp = null;
  };

  function stoppKlokke(S) {
    const k = S.spill && S.spill.klokke;
    if (k && k.slutt) {
      k.igjen = Math.max(0, k.slutt - Date.now());
      k.slutt = null;
    }
  }

  function tidenUte(S) {
    const sp = S.spill;
    if (!sp || S.skjerm !== "dag") return;
    const k = sp.klokke;
    k.igjen = 0;
    k.slutt = null;
    k.gaar = false;
    k.ute = true;
    R.vis();
    avbrytHopp();
    const fortsatt = R.vakt();
    hopp = setTimeout(() => {
      hopp = null;
      if (fortsatt() && S.spill && S.spill.klokke && S.spill.klokke.ute) H["til-stemme"](null, null, S);
    }, 2600);
    R.vedForlat(avbrytHopp);
  }

  // ---------- Game flow ----------

  function nyttSpill(S) {
    const o = S.oppsett;
    const n = R.klamp(S.antall, MIN, MAKS);
    const ulver = R.klamp(o.ulver || anbefalteUlver(n), 1, maksUlver(n));
    S.spill = {
      n,
      roller: R.stokk(kortstokk(n, ulver, o), R.rng(R.nyttFro())),
      levende: range(n).map(() => true),
      tid: o.tid,
      fro: R.nyttFro() % 1000,
      vis: { i: 0, sett: false },
      natt: 0,
      dag: 0,
      tur: null,
      valg: {},
      forrigeBeskyttet: null,
      hendelser: [],
      mistanker: [],
      morgen: null,
      klokke: null,
      mistenkt: null,
      utkastet: null,
      utVist: false,
      jeger: null,
      vinner: null,
      feiret: false,
    };
    R.holdVaken();
    R.gaTil("roller");
  }

  function nyNatt(S) {
    const sp = S.spill;
    sp.jeger = null;
    sp.natt += 1;
    sp.valg = {};
    sp.tur = { rekke: levende(sp), pos: 0, steg: "gi", klar: 0, markert: null, port: 0 };
    R.gaTil("natt-start");
  }

  function startDag(S) {
    const sp = S.spill;
    sp.jeger = null;
    sp.dag += 1;
    sp.klokke = { total: sp.tid * 60, igjen: sp.tid * 60000, slutt: null, gaar: true };
    sp.mistenkt = null;
    sp.utkastet = null;
    sp.utVist = false;
    R.gaTil("dag");
  }

  // Morning: the wolves' majority choice (random tie-break), unless the doctor protected that person.
  function avsluttNatt(S) {
    const sp = S.spill;
    const stemmer = new Map();
    ulveflokk(sp).forEach((u) => {
      const m = sp.valg[u];
      if (m != null) stemmer.set(m, (stemmer.get(m) || 0) + 1);
    });
    let mal = null;
    if (stemmer.size) {
      const topp = Math.max(...stemmer.values());
      mal = R.velg([...stemmer.keys()].filter((k) => stemmer.get(k) === topp));
    }
    const lege = levendeMed(sp, "lege")[0];
    const beskyttet = lege != null && sp.valg[lege] != null ? sp.valg[lege] : null;
    const synsk = levendeMed(sp, "synsk")[0];
    const reddet = mal != null && mal === beskyttet;
    const offer = mal != null && !reddet ? mal : null;
    sp.hendelser.push({
      type: "natt",
      nr: sp.natt,
      mal,
      reddet,
      offer,
      synsk: synsk != null && sp.valg[synsk] != null ? { av: synsk, sjekket: sp.valg[synsk], ulv: erUlv(sp, sp.valg[synsk]) } : null,
    });
    levende(sp).forEach((i) => {
      if ((sp.roller[i] === "landsby" || sp.roller[i] === "jeger") && sp.valg[i] != null) sp.mistanker.push({ natt: sp.natt, fra: i, til: sp.valg[i] });
    });
    sp.forrigeBeskyttet = beskyttet;
    if (offer != null) {
      sp.levende[offer] = false;
      if (sp.roller[offer] === "jeger") sp.jeger = { av: offer, valgt: null, mal: null, vist: false, etter: "dag" };
    }
    sp.morgen = { offer, reddet, vist: false };
    sp.tur = null;
    R.gaTil("morgen");
  }

  // The main button after someone has died: the hunter first, then a winner, else on to day/night.
  function nesteKnapp(sp, etter) {
    if (sp.jeger && sp.jeger.mal == null) return R.ui.knapp("Jegeren sikter …", "til-jeger", { ikon: "🏹" });
    if (vinner(sp)) return R.ui.knapp("Se hvem som vant", "til-slutt", { ikon: "🏆" });
    return etter === "dag" ? R.ui.knapp("Til dagen", "til-dag", { ikon: "☀️" }) : R.ui.knapp("Natta faller på", "til-natt", { ikon: "🌙" });
  }

  // A short drum roll, then the answer: sett() changes the state, lyd() plays the verdict.
  function dramatisk(ms, sett, lyd) {
    const id = setTimeout(
      () => {
        sett();
        R.vis();
        if (lyd) lyd();
        const el = R.$("#skjerm");
        el.classList.remove("risting");
        void el.offsetWidth;
        el.classList.add("risting");
      },
      R.rolig() ? Math.min(ms, 700) : ms,
    );
    R.vedForlat(() => clearTimeout(id));
  }

  function statusFor(sp, i) {
    for (const h of sp.hendelser) {
      if (h.type === "natt" && h.offer === i) return `Tatt natt ${h.nr}`;
      if (h.type === "dag" && h.ut === i) return `Kastet ut dag ${h.nr}`;
      if (h.type === "jeger" && h.mal === i) return "Skutt av jegeren";
    }
    return "Overlevde";
  }

  function historikk(sp) {
    const navnRolle = (i) => `<b>${esc(R.navn(i))}</b> (${esc(rolle(sp, i).navn.toLowerCase())})`;
    return sp.hendelser
      .map((h) => {
        if (h.type === "natt") {
          const deler = [];
          if (h.reddet) deler.push(`Ulvene gikk etter <b>${esc(R.navn(h.mal))}</b>, men legen kom først.`);
          else if (h.offer != null) deler.push(`Ulvene tok ${navnRolle(h.offer)}.`);
          else deler.push("En stille natt.");
          if (h.synsk) deler.push(`Den synske, ${esc(R.navn(h.synsk.av))}, så på ${esc(R.navn(h.synsk.sjekket))}: ${h.synsk.ulv ? "varulv!" : "ikke varulv."}`);
          return `<li><span class="vu-hist-ikon" aria-hidden="true">🌙</span><span><b class="vu-hist-tittel">Natt ${h.nr}</b> ${deler.join(" ")}</span></li>`;
        }
        if (h.type === "dag") {
          return `<li><span class="vu-hist-ikon" aria-hidden="true">☀️</span><span><b class="vu-hist-tittel">Dag ${h.nr}</b> ${
            h.ut != null ? `Landsbyen kastet ut ${navnRolle(h.ut)}.` : "Ingen ble kastet ut."
          }</span></li>`;
        }
        return `<li><span class="vu-hist-ikon" aria-hidden="true">🏹</span><span>Jegeren ${esc(R.navn(h.av))} tok med seg ${navnRolle(h.mal)}.</span></li>`;
      })
      .join("");
  }

  // Fun numbers from the villagers' secret night answers ("Who do you think is a werewolf?").
  function statistikk(sp) {
    const rader = [];
    const treff = new Map();
    const mistenkt = new Map();
    sp.mistanker.forEach((m) => {
      const t = treff.get(m.fra) || { riktig: 0, alle: 0 };
      t.alle += 1;
      if (erUlv(sp, m.til)) t.riktig += 1;
      treff.set(m.fra, t);
      mistenkt.set(m.til, (mistenkt.get(m.til) || 0) + 1);
    });
    const beste = [...treff.entries()].filter(([, t]) => t.riktig > 0).sort((a, b) => b[1].riktig / b[1].alle - a[1].riktig / a[1].alle || b[1].riktig - a[1].riktig)[0];
    if (beste) {
      const [i, t] = beste;
      rader.push(["🎯", "Beste magefølelse", `${R.navn(i)} pekte på en varulv ${t.riktig} av ${t.alle} ${t.alle === 1 ? "natt" : "netter"}.`]);
    }
    const mest = [...mistenkt.entries()].sort((a, b) => b[1] - a[1])[0];
    if (mest && mest[1] > 1) {
      const [i, antall] = mest;
      rader.push(["👀", "Mest mistenkt om natta", `${R.navn(i)} fikk ${antall} hemmelige mistanker – ${erUlv(sp, i) ? "og var faktisk varulv!" : "men var helt uskyldig."}`]);
    }
    const ulvene = range(sp.n).filter((i) => erUlv(sp, i));
    const lurt = ulvene.filter((i) => !mistenkt.has(i));
    if (lurt.length && sp.mistanker.length) rader.push(["🎭", "Beste skuespiller", `Ingen landsbyboer mistenkte ${liste(lurt.map(R.navn))} om natta.`]);
    return rader;
  }

  const pagar = (S) => !!(S.spill && !S.spill.vinner);
  const SPILLSKJERMER = ["roller", "natt-start", "natt", "morgen", "jeger", "dag", "stemme", "utkastet", "slutt"];

  function fortsettTekst(sp) {
    const s = sp.skjerm;
    if (s === "slutt") return "Se resultatet";
    if (s === "roller" || !s) return "Fortsett · rollene";
    if (s === "natt-start" || s === "natt") return `Fortsett · natt ${sp.natt}`;
    if (s === "morgen") return `Fortsett · morgen ${sp.natt}`;
    return `Fortsett · dag ${sp.dag}`;
  }

  const DEF = {
    id: "varulven",
    versjon: 1,
    // A game is in progress until someone has won (front page badge, screen kept awake).
    pagar: (S) => pagar(S),

    tilstand: () => ({
      antall: R.klamp(R.felles.navn.filter((n) => String(n || "").trim()).length || 8, MIN, MAKS),
      oppsett: { ulver: null, synsk: true, lege: true, jeger: false, tid: 3 },
      spill: null,
    }),

    lastet(S) {
      const o = (S.oppsett = Object.assign({ ulver: null, synsk: true, lege: true, jeger: false, tid: 3 }, S.oppsett));
      if (!TIDER.includes(o.tid)) o.tid = 3;
      if (o.ulver != null && !(o.ulver >= 1 && o.ulver <= maksUlver(MAKS))) o.ulver = null;
      const sp = S.spill;
      if (sp && (!Array.isArray(sp.roller) || sp.roller.some((r) => !ROLLER[r]) || sp.roller.length !== sp.n)) S.spill = null;
      if (!S.spill && SPILLSKJERMER.includes(S.skjerm)) S.skjerm = "hjem";
      // After a reload in the middle of the night, start again at "give the phone to …".
      if (S.spill && S.spill.tur) Object.assign(S.spill.tur, { steg: "gi", markert: null });
    },

    regler: {
      intro: "Noen i landsbyen er varulver. Om natta jakter de, om dagen later de som ingenting. Mobilen er spillederen – den forteller alle hva de skal gjøre.",
      steg: [
        ["Se rollen din", "Send mobilen rundt. Hold fingeren på kortet for å se om du er varulv, synsk, lege eller landsbyboer."],
        ["Natt: mobilen går rundt", "Alle lukker øynene. Den som får mobilen, gjør nattjobben sin i stillhet og gir den videre. Alle gjør noe, så ingen kan gjette roller ut fra tiden."],
        ["Dag: snakk og stem", "Mobilen forteller hvem ulvene tok. Snakk sammen, pek samtidig og kast ut den dere mistenker. Rollen blir avslørt."],
      ],
      tips: [
        "Landsbyen vinner når alle varulvene er ute. Varulvene vinner når de er like mange som resten.",
        "Varulvene vet hvem de andre varulvene er, og ser hva de andre har valgt om natta.",
        "Den synske ser om én person er varulv hver natt. Legen beskytter én person – men ikke den samme to netter på rad.",
        "Jeger (valgfri): Blir jegeren tatt eller kastet ut, tar jegeren med seg én person.",
        "Er du ute, er du stille resten av spillet – men du får gjerne se på og le.",
      ],
    },

    hemmelig: {
      innhold: (S, id) => rollekort(S.spill, Number(String(id).slice(1))),
      sett(S, id) {
        const sp = S.spill;
        if (S.skjerm === "roller" && id === "r" + sp.vis.i && !sp.vis.sett) {
          sp.vis.sett = true;
          R.vis();
          const knapp = R.$('[data-h="vist"]');
          if (knapp) knapp.classList.add("pop");
        }
      },
    },

    vedSpillere(S) {
      S.oppsett.ulver = null;
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis: (S) =>
          R.ui.spillhjem({
            slagordHtml: "Noen i landsbyen er varulver.<br><em>Mobilen er spillederen.</em>",
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: pagar(S) ? fortsettTekst(S.spill) : "",
              ekstraHtml: R.ui.lenke("Slik spiller du", "regler"),
            }),
            merker: [
              ["6–18", "spillere"],
              ["1", "mobil"],
              ["0", "spilleder"],
            ],
          }),
      },

      oppsett: {
        tittel: "Nytt spill",
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          const n = S.antall;
          const ulver = antallUlver(S);
          const kort = kortstokk(n, ulver, o);
          const tell = (r) => kort.filter((k) => k === r).length;
          const stokk = ["varulv", ...SPESIAL, "landsby"]
            .filter((r) => tell(r))
            .map((r) => {
              const antall = tell(r);
              const navn = antall > 1 && ROLLER[r].flertall ? ROLLER[r].flertall : ROLLER[r].navn.toLowerCase();
              const tall = r === "varulv" || r === "landsby" ? antall + " " : "";
              return `<span class="vu-stokk-del"><span aria-hidden="true">${ROLLER[r].ikon}</span> ${tall}${esc(navn)}</span>`;
            })
            .join('<span aria-hidden="true"> · </span>');
          return `
            <h1 id="skjerm-tittel">Gjør klart</h1>
            ${R.ui.spillere({ min: MIN, max: MAKS, hjelp: "Skriv navnene i den rekkefølgen dere sitter rundt bordet. Mobilen går rundt i denne rekkefølgen." })}
            <section class="seksjon">
              <div class="seksjon-hode"><h2>Varulver</h2><span class="tall">Anbefalt: ${anbefalteUlver(n)}</span></div>
              ${R.ui.teller("ulver", ulver, 1, maksUlver(n), { enhet: ulver === 1 ? "varulv" : "varulver", minus: "Færre varulver", pluss: "Flere varulver" })}
            </section>
            <section class="seksjon">
              <h2>Spesialroller</h2>
              ${R.ui.brikker(
                "rolle",
                SPESIAL.map((r) => ({ v: r, tekst: ROLLER[r].navn, ikon: ROLLER[r].ikon })),
                SPESIAL.filter((r) => o[r]),
                { etikett: "Spesialroller" },
              )}
              <p class="hjelp vu-venstre">Den synske ser om én person er varulv hver natt. Legen beskytter én person hver natt. Jegeren tar med seg én person når jegeren dør.</p>
            </section>
            <p class="vu-stokk"><span class="etikett">Rollene i spillet (${n})</span>${stokk}</p>
            <section class="seksjon">
              <h2>Tid til å diskutere</h2>
              ${R.ui.seg("tid", TIDER.map((t) => [t, `${t} min`]), o.tid, { etikett: "Minutter til å diskutere om dagen" })}
            </section>
            ${R.ui.dokk(R.ui.knapp("Start", "start"))}`;
        },
      },

      // The phone goes around once: everyone holds to see their role.
      roller: {
        tittel: "Rollene",
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const i = sp.vis.i;
          const siste = i === sp.n - 1;
          return `
            ${R.ui.fremdrift(sp.n, i)}
            <div class="vu-mottaker">
              <p class="etikett">Gi mobilen til</p>
              <h1 id="skjerm-tittel" class="spillernavn ${navnKlasse(R.navn(i))}">${R.avatar(i, "stor")}<span>${esc(R.navn(i))}</span></h1>
            </div>
            ${R.ui.mappe({ id: "r" + i, etikett: "Hemmelig rolle", tekst: HOLD, etikettAria: `Hold fingeren på kortet for å se rollen til ${R.navn(i)}` })}
            <p class="hjelp">${sp.vis.sett ? "Husket rollen? Trykk «Ferdig» og gi mobilen videre." : `Bare ${esc(R.navn(i))} skal se. Slipp, så skjules kortet igjen.`}</p>
            ${R.ui.dokk(
              R.ui.knapp(siste ? "Alle har sett rollen sin" : "", "vist", {
                av: !sp.vis.sett,
                tekstHtml: siste ? "" : toLinjer("Ferdig", `Gi mobilen til ${R.navn(i + 1)}`),
              }),
            )}`;
        },
      },

      "natt-start": {
        tittel: (S) => `Natt ${S.spill.natt}`,
        tilbake: "hjem",
        stemning: "natt",
        vis(S) {
          const sp = S.spill;
          const forste = sp.tur.rekke[0];
          return `
            <div class="vu-natthimmel">
              <span class="vu-maane" aria-hidden="true">🌙</span>
              <h1 id="skjerm-tittel">Natta faller på</h1>
              <p class="vu-fortelling">${esc(linje(sp, "natt", sp.natt))}</p>
            </div>
            <ol class="steg vu-slik">
              <li><b>Alle lukker øynene</b><span>Mobilen går rundt bordet. Ingen titter, ingen sier noe.</span></li>
              <li><b>Får du en prikk på skulderen, er det din tur</b><span>Åpne øynene, ta mobilen og gjør det den sier – helt stille.</span></li>
              <li><b>Gi mobilen videre og lukk øynene igjen</b><span>Alle får en tur, også de uten nattjobb.</span></li>
            </ol>
            <p class="hjelp">Natta starter hos <b>${esc(R.navn(forste))}</b>.</p>
            ${R.ui.dokk(R.ui.knapp("Start natta", "start-natt", { ikon: "🌙" }))}`;
        },
        inn: () => ul(),
      },

      // The night turn: "give the phone to X" → X picks one name → a short private answer.
      natt: {
        tittel: (S) => `Natt ${S.spill.natt}`,
        tilbake: "hjem",
        stemning: "natt",
        vis(S) {
          const sp = S.spill;
          const t = sp.tur;
          const meg = t.rekke[t.pos];
          const nesteI = t.rekke[t.pos + 1];
          if (t.steg === "gi") {
            return `
              ${prikker(sp)}
              <div class="vu-port">
                ${R.avatar(meg, "gigant")}
                <p class="etikett">Gi mobilen til</p>
                <h1 id="skjerm-tittel" class="${navnKlasse(R.navn(meg))}">${esc(R.navn(meg))}</h1>
                <p class="ikke-se">🙈 Alle andre har øynene lukket</p>
              </div>
              ${R.ui.dokk(R.ui.knapp(`Jeg er ${R.navn(meg)}`, "jeg-er"))}`;
          }
          const r = rolle(sp, meg);
          if (t.steg === "valg") {
            const info = sp.roller[meg] === "varulv" ? ulveInfo(sp, meg) : esc(r.info);
            const m = t.markert;
            return `
              ${prikker(sp)}
              <div class="vu-oppdrag">
                <p class="vu-hvem">${R.avatar(meg)}<span>${esc(R.navn(meg))} · ${r.ikon} ${esc(r.navn)}</span></p>
                <h1 id="skjerm-tittel">${esc(r.sporsmal)}</h1>
                <p>${info}</p>
              </div>
              ${nattValg(sp, meg)}
              ${R.ui.dokk(R.ui.knapp(m != null ? `${r.verb} ${R.navn(m)}` : "Trykk på et navn", "velg", { av: m == null }))}`;
          }
          const svar = nattSvar(sp, meg);
          const venter = Date.now() < t.klar;
          return `
            ${prikker(sp)}
            <div class="vu-svar">
              <span class="vu-svar-ikon" aria-hidden="true">${svar.ikon}</span>
              <h1 id="skjerm-tittel">${esc(svar.hoved)}</h1>
              <p>${esc(svar.under)}</p>
            </div>
            <p class="hjelp">${nesteI != null ? "Ikke si noe. Gi mobilen videre og lukk øynene." : "Du er sist i natt. Ikke si noe ennå – trykk «Ferdig», så vekker du landsbyen."}</p>
            ${R.ui.dokk(
              `<button class="knapp${venter ? " vu-vent" : ""}" data-h="natt-ferdig"${venter ? ` disabled style="--vent: ${t.klar - Date.now()}ms"` : ""}>${
                nesteI != null ? toLinjer("Ferdig", `Gi mobilen til ${R.navn(nesteI)}`) : toLinjer("Ferdig", "Så vekker du landsbyen")
              }</button>`,
            )}`;
        },
        etter(S) {
          const t = S.spill && S.spill.tur;
          if (!t || t.steg !== "svar") return;
          const igjen = t.klar - Date.now();
          if (igjen <= 0) return;
          const id = setTimeout(() => {
            const knapp = R.$('[data-h="natt-ferdig"]');
            if (knapp) {
              knapp.disabled = false;
              knapp.classList.remove("vu-vent");
            }
          }, igjen + 30);
          R.vedForlat(() => clearTimeout(id));
        },
      },

      morgen: {
        tittel: (S) => `Morgen ${S.spill.natt}`,
        tilbake: "hjem",
        stemning: "morgen",
        vis(S) {
          const sp = S.spill;
          const m = sp.morgen;
          if (!m.vist) {
            return `
              <div class="vu-sol" aria-hidden="true">☀️</div>
              <div class="vu-mottaker">
                <h1 id="skjerm-tittel">Alle åpner øynene!</h1>
                <p class="vu-fortelling">${esc(linje(sp, "morgen", sp.natt))}</p>
              </div>
              <p class="hjelp">Si det høyt: <b>«God morgen, landsby!»</b> Legg mobilen midt på bordet og trykk når alle ser på.</p>
              ${R.ui.dokk(R.ui.knapp("Hva skjedde i natt?", "se-natt", { ikon: "🥁" }))}`;
          }
          if (m.offer == null) {
            return `
              <div class="vu-spotlys">
                <div class="vu-stor-ikon" aria-hidden="true">${m.reddet ? "🩹" : "🌤️"}</div>
                <h1 id="skjerm-tittel">Alle overlevde natta!</h1>
                <p class="vu-fortelling">${esc(m.reddet ? linje(sp, "reddet", sp.natt) : "En helt stille natt.")}</p>
              </div>
              ${R.ui.dokk(nesteKnapp(sp, "dag"))}`;
          }
          const r = rolle(sp, m.offer);
          return `
            <div class="vu-spotlys">
              <span class="vu-dod">${R.avatar(m.offer, "gigant")}</span>
              <h1 id="skjerm-tittel">${esc(R.navn(m.offer))} ble tatt i natt</h1>
              <div class="stempel-sted">${stempel(sp, m.offer)}</div>
              <p class="ingress midt">${esc(R.navn(m.offer))} er ute av spillet og sier ikke mer. ${esc(r.ute)}</p>
            </div>
            ${R.ui.dokk(nesteKnapp(sp, "dag"))}`;
        },
        inn(S) {
          if (!S.spill.morgen.vist) hane();
        },
      },

      jeger: {
        tittel: "Jegeren",
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const j = sp.jeger;
          if (j.mal == null) {
            return `
              <div class="vu-jeger-topp">
                ${R.avatar(j.av, "stor")}
                <div>
                  <p class="etikett">${esc(R.navn(j.av))} var jeger</p>
                  <h1 id="skjerm-tittel">Et siste skudd</h1>
                </div>
              </div>
              <p class="ingress">${esc(R.navn(j.av))} peker på én person som må bli med ut av spillet.</p>
              ${R.ui.velgere("jeger-valg", levende(sp), j.valgt)}
              ${R.ui.dokk(R.ui.knapp(j.valgt != null ? `Skyt ${R.navn(j.valgt)}` : "Velg hvem jegeren skyter", "skyt", { variant: "rosa", av: j.valgt == null, ikon: "🏹" }))}`;
          }
          const r = rolle(sp, j.mal);
          return `
            <div class="vu-spotlys${j.vist ? "" : " spenning"}">
              <span class="vu-skjelv${j.vist ? " vu-dod" : ""}">${R.avatar(j.mal, "gigant")}</span>
              <h1 id="skjerm-tittel">${j.vist ? `${esc(R.navn(j.mal))} var …` : `Jegeren sikter på ${esc(R.navn(j.mal))} …`}</h1>
              <div class="stempel-sted">${j.vist ? stempel(sp, j.mal) : ""}</div>
              ${j.vist ? `<p class="ingress midt">${esc(r.ute)}</p>` : ""}
            </div>
            ${j.vist ? R.ui.dokk(nesteKnapp(sp, j.etter)) : ""}`;
        },
        inn(S) {
          const j = S.spill.jeger;
          if (j.mal != null && !j.vist) {
            R.lyd.trommevirvel(R.rolig() ? 0.6 : 1.6);
            dramatisk(1750, () => (j.vist = true), () => R.lyd.bom());
          }
        },
      },

      dag: {
        tittel: (S) => `Dag ${S.spill.dag}`,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const k = sp.klokke;
          const lev = levende(sp).length;
          return `
            <div class="vu-mottaker">
              <h1 id="skjerm-tittel">Hvem er varulv?</h1>
              <p class="vu-fortelling">${esc(linje(sp, "dag", sp.dag))}</p>
            </div>
            ${R.ui.timer({
              id: "klokke",
              sekunder: Math.ceil(igjenMs(k) / 1000),
              kontrollHtml: `${k.ute ? '<span class="vu-tid-ute"><span aria-hidden="true">⏰</span> Tiden er ute!</span>' : '<span class="etikett">Tid til å snakke</span>'}
                <button class="knapp-2 liten" data-h="pause" data-timer-pause>${k.gaar ? "Pause" : "Fortsett"}</button>
                ${R.ui.knapp2("+1 min", "pluss-min", { variant: "liten" })}`,
            })}
            <section class="seksjon">
              <div class="seksjon-hode"><h2>Landsbyen</h2><span class="tall">${lev} lever · ${sp.n - lev} ute</span></div>
              ${landsbyen(sp)}
            </section>
            ${R.ui.lenke("Glemt rollen din?", "se-igjen")}
            ${R.ui.dokk(R.ui.knapp("Klare til å stemme", "til-stemme", { variant: "rosa", ikon: "✋" }))}`;
        },
        inn: (S) => startKlokke(S),
        ut: (S) => stoppKlokke(S),
        etter() {
          const t = R.timer("klokke");
          if (t) t.tegn();
        },
      },

      stemme: {
        tittel: (S) => `Dag ${S.spill.dag}`,
        tilbake: "dag",
        vis(S) {
          const sp = S.spill;
          const valgt = sp.mistenkt;
          return `
            <h1 id="skjerm-tittel">Landsbyen stemmer</h1>
            <p class="ingress">Tell ned og pek samtidig på den dere vil kaste ut. Den som får flest fingrer, må forlate landsbyen.</p>
            ${R.ui.knapp2("3 · 2 · 1 – Pek!", "pek", { ikon: "👉" })}
            <section class="seksjon">
              <h2>Hvem fikk flest fingrer?</h2>
              ${R.ui.velgere("mistenkt", levende(sp), valgt)}
            </section>
            ${R.ui.lenke("Uavgjort – ingen kastes ut i dag", "ingen-ut")}
            ${R.ui.dokk(R.ui.knapp(valgt != null ? `Kast ut ${R.navn(valgt)}` : "Velg hvem som må gå", "kast-ut", { variant: "rosa", av: valgt == null }))}`;
        },
      },

      utkastet: {
        tittel: (S) => `Dag ${S.spill.dag}`,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const i = sp.utkastet;
          const r = rolle(sp, i);
          const ulv = erUlv(sp, i);
          return `
            <div class="vu-spotlys${sp.utVist ? "" : " spenning"}">
              <span class="vu-skjelv${sp.utVist ? " vu-dod" : ""}">${R.avatar(i, "gigant")}</span>
              <h1 id="skjerm-tittel">${sp.utVist ? `${esc(R.navn(i))} var …` : `${esc(R.navn(i))} forlater landsbyen …`}</h1>
              <div class="stempel-sted">${sp.utVist ? stempel(sp, i) : ""}</div>
              ${sp.utVist ? `<p class="ingress midt">${ulv ? "Riktig! " : "Å nei, en uskyldig! "}${esc(r.ute)}</p>` : ""}
            </div>
            ${sp.utVist ? R.ui.dokk(nesteKnapp(sp, "natt")) : ""}`;
        },
        inn(S) {
          const sp = S.spill;
          if (sp.utVist) return;
          R.lyd.trommevirvel(R.rolig() ? 0.6 : 2);
          dramatisk(2150, () => (sp.utVist = true), () => (erUlv(sp, sp.utkastet) ? R.lyd.fanfare() : R.lyd.feil()));
        },
      },

      slutt: {
        tittel: "Kåringen",
        tilbake: "hjem",
        stemning: null,
        vis(S) {
          const sp = S.spill;
          const ulvVant = sp.vinner === "ulv";
          const roller = range(sp.n)
            .map((i) => {
              const r = rolle(sp, i);
              return `<li class="${erUlv(sp, i) ? "ulv" : ""}${sp.levende[i] ? "" : " dod"}">${R.avatar(i)}<span><b>${esc(R.navn(i))}</b><small>${r.ikon} ${esc(r.navn)} · ${esc(statusFor(sp, i))}</small></span></li>`;
            })
            .join("");
          const stat = statistikk(sp);
          return `
            <div class="banner ${ulvVant ? "rosa" : "mynte"}">
              ${R.figur()}
              <h1 id="skjerm-tittel">${ulvVant ? "Varulvene vinner!" : "Landsbyen vinner!"}</h1>
              <p class="vu-fortelling">${esc(linje(sp, ulvVant ? "ulvVant" : "landsbyVant", sp.natt))}</p>
            </div>
            <section class="seksjon">
              <h2>Hvem var hvem?</h2>
              <ul class="vu-rolleliste">${roller}</ul>
            </section>
            ${
              stat.length
                ? `<section class="seksjon"><h2>Nattas hemmeligheter</h2><ul class="vu-stat">${stat
                    .map(([ikon, tittel, tekst]) => `<li><span class="vu-stat-ikon" aria-hidden="true">${ikon}</span><span><b>${esc(tittel)}</b>${esc(tekst)}</span></li>`)
                    .join("")}</ul></section>`
                : ""
            }
            <section class="seksjon">
              <h2>Slik gikk det</h2>
              <ol class="vu-historikk">${historikk(sp)}</ol>
            </section>
            ${R.ui.flereSpill({ antall: sp.n })}
            ${R.ui.dokk(R.ui.knapp("Spill igjen", "igjen"), R.ui.lenkerad(R.ui.lenke("Endre oppsett", "nytt"), '<a class="lenke" href="/">Alle spill</a>'))}`;
        },
        inn(S) {
          const sp = S.spill;
          if (sp.feiret) return;
          sp.feiret = true;
          R.lagre();
          R.slippVaken();
          if (sp.vinner === "ulv") {
            ul();
            R.konfetti(["--rosa", "--lilla", "--aksent", "--natt-3"]);
          } else {
            R.lyd.fanfare();
            R.konfetti();
          }
        },
      },
    },

    handlinger: (H = {
      async nytt(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(pagar(S))) || !fortsatt()) return;
        S.spill = null;
        R.slippVaken();
        R.gaTil("oppsett");
      },
      fortsett(el, e, S) {
        const sp = S.spill;
        if (sp.tur) Object.assign(sp.tur, { steg: "gi", markert: null });
        R.gaTil(SPILLSKJERMER.includes(sp.skjerm) ? sp.skjerm : "roller");
      },

      // Setup
      ulver(el, e, S) {
        S.oppsett.ulver = R.klamp(antallUlver(S) + Number(el.dataset.v), 1, maksUlver(S.antall));
        R.vis();
      },
      rolle(el, e, S) {
        const r = el.dataset.v;
        S.oppsett[r] = !S.oppsett[r];
        R.vis();
      },
      tid(el, e, S) {
        S.oppsett.tid = Number(el.dataset.v);
        R.vis();
      },
      start: (el, e, S) => nyttSpill(S),

      // Roles
      vist(el, e, S) {
        const sp = S.spill;
        if (!sp.vis.sett) return;
        if (sp.vis.i < sp.n - 1) {
          sp.vis = { i: sp.vis.i + 1, sett: false };
          R.lyd.pop();
          R.gaTil("roller");
        } else {
          nyNatt(S);
        }
      },

      // Night
      "start-natt"(el, e, S) {
        S.spill.tur.port = Date.now();
        R.gaTil("natt");
      },
      "jeg-er"(el, e, S) {
        const t = S.spill.tur;
        // The previous player's finger may still be on the screen: a tap right after the hand-over
        // must never open the next player's secret.
        if (t.steg !== "gi" || (e && e.isTrusted && Date.now() - (t.port || 0) < PORT_MS)) return;
        t.markert = null;
        t.steg = S.spill.valg[t.rekke[t.pos]] != null ? "svar" : "valg";
        R.gaTil("natt");
      },
      // A tap only marks a name; «Ta X» / «Beskytt X» / «Se på X» / «Mistenk X» confirms it.
      marker(el, e, S) {
        const t = S.spill.tur;
        if (t.steg !== "valg") return;
        t.markert = Number(el.dataset.v);
        R.vis();
      },
      velg(el, e, S) {
        const sp = S.spill;
        const t = sp.tur;
        if (t.steg !== "valg" || t.markert == null) return;
        sp.valg[t.rekke[t.pos]] = t.markert;
        t.markert = null;
        t.steg = "svar";
        t.klar = Date.now() + VENT_MS;
        R.vibrer(15);
        R.gaTil("natt");
      },
      "natt-ferdig"(el, e, S) {
        const t = S.spill.tur;
        if (t.steg !== "svar" || Date.now() < t.klar) return;
        if (t.pos < t.rekke.length - 1) {
          t.pos += 1;
          t.steg = "gi";
          t.port = Date.now();
          R.gaTil("natt");
        } else {
          avsluttNatt(S);
        }
      },

      // Morning
      async "se-natt"(el, e, S) {
        const m = S.spill.morgen;
        if (m.vist || el.disabled) return;
        el.disabled = true;
        const fortsatt = R.vakt();
        const slag = R.rolig() ? [0] : [0, 750, 1350, 1800];
        slag.forEach((ms) => setTimeout(() => fortsatt() && R.lyd.hjerteslag(), ms));
        R.vibrer([30, 120, 30, 500, 30, 120, 30]);
        await R.vent(R.rolig() ? 500 : 2300);
        if (!fortsatt()) return;
        m.vist = true;
        R.vis();
        if (m.offer != null) {
          R.lyd.bom();
          R.vibrer([200, 80, 300]);
        } else {
          R.lyd.riktig();
        }
      },
      "til-jeger": () => R.gaTil("jeger"),
      "til-slutt"(el, e, S) {
        S.spill.vinner = vinner(S.spill);
        R.gaTil("slutt");
      },
      "til-dag": (el, e, S) => startDag(S),
      "til-natt": (el, e, S) => nyNatt(S),

      // Hunter
      "jeger-valg"(el, e, S) {
        S.spill.jeger.valgt = Number(el.dataset.v);
        R.vis();
      },
      skyt(el, e, S) {
        const sp = S.spill;
        const j = sp.jeger;
        if (j.valgt == null || j.mal != null) return;
        j.mal = j.valgt;
        j.vist = false;
        sp.levende[j.mal] = false;
        sp.hendelser.push({ type: "jeger", av: j.av, mal: j.mal });
        R.gaTil("jeger");
      },

      // Day
      pause(el, e, S) {
        const k = S.spill.klokke;
        const t = R.timer("klokke");
        avbrytHopp(); // staying put: no jump to the vote
        if (k.gaar) {
          k.igjen = igjenMs(k);
          k.slutt = null;
          k.gaar = false;
          if (t) t.pause();
        } else if (k.igjen > 0) {
          k.gaar = true;
          k.slutt = Date.now() + k.igjen;
          if (t) t.start();
        }
        R.lagre();
      },
      "pluss-min"(el, e, S) {
        const k = S.spill.klokke;
        avbrytHopp();
        k.total += 60;
        if (k.ute) {
          // Time had run out: one more minute, and the clock runs again.
          k.ute = false;
          k.igjen = 60000;
          k.slutt = Date.now() + 60000;
          k.gaar = true;
          R.gaTil("dag");
        } else {
          if (k.slutt) k.slutt += 60000;
          else k.igjen += 60000;
          const t = R.timer("klokke");
          if (t) {
            t.leggTil(60);
            t.total = k.total;
            t.tegn();
          }
          R.lagre();
        }
        R.toast("+1 minutt");
      },
      async "se-igjen"(el, e, S) {
        const sp = S.spill;
        const fortsatt = R.vakt();
        const i = await R.velgIArk(
          "Hvem vil se rollen sin?",
          levende(sp).map((n) => ({ v: n, tekst: R.navn(n) })),
        );
        if (!fortsatt()) return;
        if (i == null) return;
        R.ark(`
          <h2 id="ark-tittel">Rollen til ${esc(R.navn(i))}</h2>
          ${R.ui.mappe({ id: "r" + i, etikett: "Hemmelig rolle", tekst: HOLD })}
          <p class="hjelp">Bare ${esc(R.navn(i))} skal se. Slipp for å skjule.</p>
          <button class="knapp" data-h="lukk-ark">Ferdig</button>`);
      },
      "til-stemme"(el, e, S) {
        S.spill.mistenkt = null;
        R.gaTil("stemme");
      },
      async pek() {
        if (teller) return;
        teller = true;
        let ferdig = false;
        try {
          ferdig = await R.nedtelling(["3", "2", "1", "PEK!"], 700);
        } finally {
          teller = false;
        }
        if (!ferdig) return; // the screen changed during the countdown
        R.lyd.pek();
        R.vibrer([60, 40, 120]);
      },
      mistenkt(el, e, S) {
        S.spill.mistenkt = Number(el.dataset.v);
        R.vis();
      },
      "kast-ut"(el, e, S) {
        const sp = S.spill;
        const i = sp.mistenkt;
        if (i == null || !sp.levende[i]) return;
        sp.levende[i] = false;
        sp.utkastet = i;
        sp.utVist = false;
        sp.hendelser.push({ type: "dag", nr: sp.dag, ut: i });
        if (sp.roller[i] === "jeger") sp.jeger = { av: i, valgt: null, mal: null, vist: false, etter: "natt" };
        R.gaTil("utkastet");
      },
      async "ingen-ut"(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreft("Ingen kastes ut?", "Da går landsbyen rett til natta.", "Ja, ingen i dag", "Avbryt")) || !fortsatt()) return;
        const sp = S.spill;
        sp.hendelser.push({ type: "dag", nr: sp.dag, ut: null });
        nyNatt(S);
        R.toast(linje(sp, "ingenUt", sp.dag));
      },

      // End
      igjen: (el, e, S) => nyttSpill(S),
    }),
  };

  // Every screen sets the page's mood (night / morning / day), and game screens remember
  // themselves so "Fortsett" on the home screen returns to the right place.
  Object.keys(DEF.skjermer).forEach((navn) => {
    const sk = DEF.skjermer[navn];
    const etter = sk.etter;
    sk.etter = (S, rot) => {
      const ulvenesNatt = navn === "slutt" && S.spill && S.spill.vinner === "ulv";
      stemning(ulvenesNatt ? "natt" : sk.stemning || (navn === "slutt" ? "morgen" : ""));
      if (etter) etter(S, rot);
    };
    if (SPILLSKJERMER.includes(navn)) {
      const inn = sk.inn;
      sk.inn = (S) => {
        if (S.spill) S.spill.skjerm = navn;
        if (inn) inn(S);
      };
    }
  });

  R.start(DEF);
})();
