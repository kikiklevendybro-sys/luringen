/* Varulven — Werewolf on one phone that goes around the table. No game master: the phone tells
   everyone what to do, narrates the night and keeps track of everything.
   Two ways to play:
   · «Klassisk» (6–12 players): nights and days until one side has won. Every living player gets
     the phone every night; the first one out becomes the game leader.
   · «Én natt» (4–10 players): one night, one vote, nobody is out, several rounds with points.
     Everyone gets the phone once, sees their role and does one thing; roles are swapped at dawn.
   Fairness, in both: every player who gets the phone does the same thing — picks a name (the
   troublemaker picks two) and reads a short answer that stays on screen for the same minimum
   time — and every night screen looks alike, so nobody can work out roles from timing, colours
   or sounds. A reload in the night goes back to "give the phone to …", never to a secret. */
(function () {
  "use strict";

  const R = window.Rusj;
  const F = window.RUSJ_DATA.fortelling;
  const esc = R.esc;

  const HOLD = "Hold fingeren på kortet for å se";
  const MIN = 6;
  const MAKS = 12; // above twelve a night is mostly waiting
  const TIDER = [2, 3, 5];
  const VENT_MS = 1500; // every night answer stays at least this long, whatever the role
  const PORT_MS = 700; // «Jeg er X» ignores taps this soon after the hand-over (double taps)
  const NATT_SEK = 12; // about what one player's night turn takes, hand-over included
  const FREDELIG_TIL = 8; // «Fredelig første natt» is on by default up to this many players
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
      // The peaceful first night: the same screen and the same taps, but nobody is taken.
      fredelig: { sporsmal: "Hvem vil ulveflokken snuse på i natt?", verb: "Snus på" },
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
      fredelig: {
        sporsmal: "Hvem vil du passe på i natt?",
        info: "Første natt er fredelig: ingen blir tatt. Fra neste natt beskytter du på ordentlig – også den du velger nå.",
        verb: "Pass på",
      },
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

  // ---------- The second way to play: «Én natt» ----------
  // One night, one vote, nobody is out. Everyone gets the phone once, sees their role and does
  // one thing on the same kind of screen (so timing tells nothing here either). Everything a
  // player is shown is the roles AS DEALT; the swaps are carried out when the night is over –
  // the swapper's first, then the troublemaker's. A session is several rounds with points.
  const MODUS = { klassisk: { min: MIN, maks: MAKS }, en: { min: 4, maks: 10 } };
  const RUNDER = [3, 5, 0]; // 0 = «Fri»: play until «Avslutt»
  const TALETID = 4; // minutes of talk before the vote
  const EN_SEK = 16; // about what one player's turn takes in this mode (the role is new to them)
  const EN_ROLLER = {
    varulv: { navn: "Varulv", flertall: "varulver", ikon: "🐺", sporsmal: "Hvem vil du skylde på i morgen?", verb: "Skyld på" },
    synsk: { navn: "Synsk", ikon: "🔮", sporsmal: "Hvem vil du se rollen til?", info: "Du ser rollen slik den var da natta begynte.", verb: "Se på" },
    bytter: { navn: "Bytter", ikon: "🔄", sporsmal: "Hvem vil du bytte rolle med?", info: "Bare du får vite om byttet – og du får se den nye rollen din.", verb: "Bytt med" },
    brak: { navn: "Bråkmaker", ikon: "😈", sporsmal: "Hvilke to skal bytte roller?", info: "Velg to andre. Rollene deres bytter plass, uten at noen av dem får vite det.", verb: "Bytt om" },
    landsby: {
      navn: "Landsbyboer",
      flertall: "landsbyboere",
      ikon: "🏡",
      sporsmal: "Hvem tror du er varulv?",
      info: "Du har ingen nattjobb – bare magefølelsen. Svaret er hemmelig til runden er over.",
      verb: "Mistenk",
    },
  };
  // 1 wolf up to six players, 2 from seven; a seer and a swapper; a troublemaker from six.
  function enStokk(n) {
    const kort = n >= 7 ? ["varulv", "varulv"] : ["varulv"];
    kort.push("synsk", "bytter");
    if (n >= 6) kort.push("brak");
    while (kort.length < n) kort.push("landsby");
    return kort;
  }

  // The deck as one plain line of text (HTML): «🐺 1 varulv · 🔮 synsk · 🏡 3 landsbyboere».
  function stokkTekst(kort, roller, rekkefolge) {
    const tell = (r) => kort.filter((k) => k === r).length;
    return rekkefolge
      .filter((r) => tell(r))
      .map((r) => {
        const antall = tell(r);
        const navn = antall > 1 && roller[r].flertall ? roller[r].flertall : roller[r].navn.toLowerCase();
        return `<span class="vu-stokk-del"><span aria-hidden="true">${roller[r].ikon}</span> ${roller[r].flertall ? antall + " " : ""}${esc(navn)}</span>`;
      })
      .join('<span aria-hidden="true"> · </span>');
  }

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

  // «Fredelig første natt» follows the number of players until someone flips the switch.
  const fredeligPa = (S) => (S.oppsett.fredelig == null ? S.antall <= FREDELIG_TIL : !!S.oppsett.fredelig);

  // ---------- Reading the game state ----------

  const erUlv = (sp, i) => sp.roller[i] === "varulv";
  const levende = (sp) => range(sp.n).filter((i) => sp.levende[i]);
  const levendeMed = (sp, rolle) => levende(sp).filter((i) => sp.roller[i] === rolle);
  const ulveflokk = (sp) => levende(sp).filter((i) => erUlv(sp, i));
  const rolle = (sp, i) => ROLLER[sp.roller[i]];
  // The peaceful first night: everyone takes their turn and the seer sees, but nobody is taken.
  const erFredelig = (sp) => !!sp.fredelig && sp.natt === 1;
  // What a role does tonight: the question, the helper line and the verb on the button.
  const nattjobb = (sp, i) => Object.assign({}, rolle(sp, i), erFredelig(sp) ? rolle(sp, i).fredelig : null);

  // Small numbers as words («etter tre netter»).
  const TALLORD = ["null", "én", "to", "tre", "fire", "fem", "seks", "sju", "åtte", "ni", "ti", "elleve", "tolv"];
  const tallord = (n) => TALLORD[n] || String(n);
  const netter = (n) => (n === 1 ? "én natt" : `${tallord(n)} netter`);
  // How long the phone needs to go around, the way people say it: «ca. 2 minutter».
  function omtrentTid(sekunder) {
    if (sekunder < 45) return "under ett minutt";
    if (sekunder < 80) return "ca. 1 minutt";
    if (sekunder < 105) return "ca. halvannet minutt";
    return `ca. ${Math.round(sekunder / 60)} minutter`;
  }

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

  // (aria-hidden: the heading above the stamp says the role for screen readers)
  const stempel = (sp, i) => `<span class="stempel ${erUlv(sp, i) ? "mynte" : ""}" aria-hidden="true">${esc(rolle(sp, i).navn)}</span>`;

  // After a reveal that is drawn in place, the button that was pressed is gone: move focus to
  // the heading, so a screen reader says what happened and keeps its place.
  function fokuserTittel() {
    const h = R.$("#skjerm h1");
    if (!h) return;
    h.setAttribute("tabindex", "-1");
    try {
      h.focus({ preventScroll: true });
    } catch (e) {
      h.focus();
    }
  }

  // The three steps of a night, with tonight's song (a new one each night): humming gives the
  // ones who wait something to do, and it hides every sound around the table.
  function nattSteg(sp, nr, en, to, tre) {
    return `
      <ol class="steg vu-slik">
        <li><b>Lukk øynene og nynn «${esc(linje(sp, "sanger", nr))}» til hanen galer</b><span>${esc(en)}</span></li>
        <li><b>Får du en prikk på skulderen, er det din tur</b><span>${esc(to)}</span></li>
        <li><b>Gi mobilen videre og lukk øynene igjen</b><span>${esc(tre)}</span></li>
      </ol>`;
  }

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
          dod ? `<small>${rolle(sp, i).ikon} ${esc(rolle(sp, i).navn)}${sp.spilleder === i ? " · spilleder" : ""}</small>` : ""
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

  // "Give the phone to …": the first step of every night turn, in both ways of playing.
  function giSteg(sp) {
    const meg = sp.tur.rekke[sp.tur.pos];
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

  // The private answer: the last step of every night turn. The same paper card for every role,
  // and «Ferdig» waits the same moment for everyone, so a turn takes the same time whatever you are.
  // The heading (which gets the focus, and is what a screen reader on speaker says to the room) is
  // only the player's name, as on the hand-over screen; the secret is ordinary text below it.
  function svarSteg(sp, svar) {
    const t = sp.tur;
    const meg = t.rekke[t.pos];
    const nesteI = t.rekke[t.pos + 1];
    const venter = Date.now() < t.klar;
    return `
      ${prikker(sp)}
      <div class="vu-svar">
        <h1 id="skjerm-tittel" class="vu-svar-navn">${esc(R.navn(meg))}</h1>
        <span class="vu-svar-ikon" aria-hidden="true">${svar.ikon}</span>
        <p class="vu-svar-hoved">${esc(svar.hoved)}</p>
        <p class="vu-svar-under">${esc(svar.under)}</p>
      </div>
      <p class="hjelp">${nesteI != null ? "Ikke si noe. Gi mobilen videre, lukk øynene og nynn videre." : "Du er sist i natt. Ikke si noe ennå – trykk «Ferdig», så vekker du landsbyen."}</p>
      ${R.ui.dokk(
        `<button class="knapp${venter ? " vu-vent" : ""}" data-h="natt-ferdig"${venter ? ` disabled style="--vent: ${t.klar - Date.now()}ms"` : ""}>${
          nesteI != null ? toLinjer("Ferdig", `Gi mobilen til ${R.navn(nesteI)}`) : toLinjer("Ferdig", "Så vekker du landsbyen")
        }</button>`,
      )}`;
  }

  // After each draw of a night screen: open «Ferdig» when the wait is over.
  function nattEtter(S) {
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

  // What a wolf is told before the pick (HTML): who the pack is and what the others have chosen.
  function ulveInfo(sp, meg) {
    const fredelig = erFredelig(sp);
    const forst = fredelig ? "Første natt er fredelig: ingen blir tatt. " : "";
    const andre = ulveflokk(sp).filter((i) => i !== meg);
    if (!andre.length) return forst + (sp.roller.filter((r) => r === "varulv").length > 1 ? "Du er den eneste varulven igjen." : "Du er den eneste varulven.");
    const valgt = andre.filter((i) => sp.valg[i] != null);
    return (
      forst +
      `Ulveflokken: du og ${esc(liste(andre.map(R.navn)))}. ` +
      (valgt.length
        ? valgt.map((i) => `<b>${esc(R.navn(i))}</b> vil ${fredelig ? "snuse på" : "ta"} <b>${esc(R.navn(sp.valg[i]))}</b>.`).join(" ")
        : "Ingen av de andre har valgt ennå i natt.")
    );
  }

  // The short private answer after a night pick.
  function nattSvar(sp, meg) {
    const r = sp.roller[meg];
    const m = sp.valg[meg];
    const navn = R.navn(m);
    const fredelig = erFredelig(sp);
    if (r === "varulv") {
      const flokk = ulveflokk(sp).filter((i) => sp.valg[i] != null);
      const flokken = `Ulveflokken: ${flokk.map((i) => `${i === meg ? "du" : R.navn(i)} → ${R.navn(sp.valg[i])}`).join(", ")}.`;
      if (fredelig) {
        return {
          ikon: "🐺",
          hoved: `Du snuser på ${navn}.`,
          under: (flokk.length > 1 ? flokken + " " : "") + "Første natt blir ingen tatt. Fra neste natt er det alvor.",
        };
      }
      return {
        ikon: "🐺",
        hoved: `Du vil ta ${navn}.`,
        under: flokk.length > 1 ? `${flokken} Flertallet bestemmer – står det likt, avgjør månen.` : "Flertallet i ulveflokken bestemmer. Står det likt, avgjør månen.",
      };
    }
    if (r === "synsk") {
      const ulv = erUlv(sp, m);
      return { ikon: ulv ? "🐺" : "🏡", hoved: ulv ? `${navn} er varulv!` : `${navn} er ikke varulv.`, under: "Husk det – men ikke avslør deg for tidlig." };
    }
    if (r === "lege") {
      return fredelig
        ? { ikon: "🩺", hoved: `Du passer på ${navn} i natt.`, under: "En rolig vakt: første natt blir ingen tatt." }
        : { ikon: "🩺", hoved: `Du beskytter ${navn} i natt.`, under: "Kommer ulvene, står du klar med plaster." };
    }
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

  // The two day screens (the classic game and «Én natt») and the action that opens their vote.
  const TIL_STEMME = { dag: "til-stemme", "en-dag": "en-til-stemme" };

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
    if (!sp || !TIL_STEMME[S.skjerm]) return;
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
      if (fortsatt() && S.spill && S.spill.klokke && S.spill.klokke.ute) H[TIL_STEMME[S.skjerm]](null, null, S);
    }, 2600);
    R.vedForlat(avbrytHopp);
  }

  // ---------- Game flow ----------

  function nyttSpill(S) {
    const o = S.oppsett;
    const n = R.klamp(S.antall, MIN, MAKS);
    const ulver = R.klamp(o.ulver || anbefalteUlver(n), 1, maksUlver(n));
    S.spill = {
      modus: "klassisk",
      n,
      roller: R.stokk(kortstokk(n, ulver, o), R.rng(R.nyttFro())),
      levende: range(n).map(() => true),
      tid: o.tid,
      fredelig: fredeligPa(S),
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
      spilleder: null, // the first player out holds the phone from then on
      ingenUt: false, // the day before this night ended without anyone being voted out
      vinner: null, // "landsby" | "ulv"
      ferdig: false, // «Kåringen» is reached (a winner, or «Avslutt»)
      avbrutt: false,
      feiret: false,
    };
    R.statistikk("start", { modus: "klassisk", spillere: n });
    R.holdVaken();
    R.gaTil("roller");
  }

  // A player leaves the game. The first one out becomes the game leader.
  function ut(sp, i) {
    sp.levende[i] = false;
    if (sp.spilleder == null) sp.spilleder = i;
  }
  const spilleder = (sp) => (erIndeks(sp.spilleder, sp.n) ? sp.spilleder : null);

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
  // On the peaceful first night the wolves only sniff and the doctor only watches: nobody is taken,
  // and the doctor's pick does not count for «not the same person two nights in a row».
  function avsluttNatt(S) {
    const sp = S.spill;
    const fredelig = erFredelig(sp);
    const stemmer = new Map();
    if (!fredelig) {
      ulveflokk(sp).forEach((u) => {
        const m = sp.valg[u];
        if (m != null) stemmer.set(m, (stemmer.get(m) || 0) + 1);
      });
    }
    let mal = null;
    if (stemmer.size) {
      const topp = Math.max(...stemmer.values());
      mal = R.velg([...stemmer.keys()].filter((k) => stemmer.get(k) === topp));
    }
    const lege = levendeMed(sp, "lege")[0];
    const beskyttet = !fredelig && lege != null && sp.valg[lege] != null ? sp.valg[lege] : null;
    const synsk = levendeMed(sp, "synsk")[0];
    const reddet = mal != null && mal === beskyttet;
    const offer = mal != null && !reddet ? mal : null;
    sp.hendelser.push({
      type: "natt",
      nr: sp.natt,
      fredelig,
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
      ut(sp, offer);
      if (sp.roller[offer] === "jeger") sp.jeger = { av: offer, valgt: null, mal: null, vist: false, etter: "dag" };
    }
    sp.morgen = { offer, reddet, fredelig, vist: false };
    sp.ingenUt = false;
    sp.tur = null;
    R.gaTil("morgen");
  }

  // The main button after someone has died: the hunter first, then a winner, else on to day/night.
  function nesteKnapp(sp, etter) {
    if (sp.jeger && sp.jeger.mal == null) return R.ui.knapp("Jegeren sikter …", "til-jeger");
    if (vinner(sp)) return R.ui.knapp("Se hvem som vant", "til-slutt");
    return etter === "dag" ? R.ui.knapp("Til dagen", "til-dag") : R.ui.knapp("Natta faller på", "til-natt");
  }

  // Under the stamp on the screen where a player leaves the game. The first one out gets a job
  // (and stays in the middle of the game); the others are out and quiet.
  function uteTekst(sp, i, forst) {
    const r = rolle(sp, i);
    if (sp.spilleder !== i) return `<p class="ingress midt">${forst ? esc(forst) + " " : ""}${esc(r.ute)}</p>`;
    return `
      <p class="ingress midt">${forst ? esc(forst) + " " : ""}${esc(r.ute)}</p>
      <p class="vu-jobb"><span class="vu-jobb-ikon" aria-hidden="true">📣</span><span><b>${esc(R.navn(i))}, du er ute – men nå er du spillederen:</b> du holder mobilen, leser høyt og teller fingrene.</span></p>`;
  }

  // A short drum roll, then the answer: sett() changes the state, lyd() plays the verdict.
  function dramatisk(ms, sett, lyd) {
    const id = setTimeout(
      () => {
        sett();
        R.vis();
        fokuserTittel();
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
          if (h.fredelig) deler.push("En fredelig første natt: ingen ble tatt.");
          else if (h.reddet) deler.push(`Ulvene gikk etter <b>${esc(R.navn(h.mal))}</b>, men legen kom først.`);
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
      rader.push({
        ikon: "🎯",
        tittel: "Beste magefølelse",
        tekst: `${R.navn(i)} pekte på en varulv ${t.riktig} av ${t.alle} ${t.alle === 1 ? "natt" : "netter"}.`,
        del: `Beste magefølelse: ${R.navn(i)}, ${t.riktig} av ${t.alle}`, // for «Del resultatet»
      });
    }
    const mest = [...mistenkt.entries()].sort((a, b) => b[1] - a[1])[0];
    if (mest && mest[1] > 1) {
      const [i, antall] = mest;
      rader.push({ ikon: "👀", tittel: "Mest mistenkt om natta", tekst: `${R.navn(i)} fikk ${antall} hemmelige mistanker – ${erUlv(sp, i) ? "og var faktisk varulv!" : "men var helt uskyldig."}` });
    }
    const ulvene = range(sp.n).filter((i) => erUlv(sp, i));
    const lurt = ulvene.filter((i) => !mistenkt.has(i));
    if (lurt.length && sp.mistanker.length) rader.push({ ikon: "🎭", tittel: "Beste skuespiller", tekst: `Ingen landsbyboer mistenkte ${liste(lurt.map(R.navn))} om natta.` });
    return rader;
  }

  const prisHtml = (priser) =>
    priser.length
      ? `<section class="seksjon"><h2>Nattas hemmeligheter</h2><ul class="vu-stat">${priser
          .map((p) => `<li><span class="vu-stat-ikon" aria-hidden="true">${p.ikon}</span><span><b>${esc(p.tittel)}</b>${esc(p.tekst)}</span></li>`)
          .join("")}</ul></section>`
      : "";

  const spilteNetter = (sp) => sp.hendelser.filter((h) => h.type === "natt").length;

  // The tally on this phone: how many games each side has won («Landsbyen 3 – 2 Varulvene»).
  const stillingTekst = (S) => `Landsbyen ${S.stilling.landsby} – ${S.stilling.ulv} Varulvene`;
  const harStilling = (S) => S.stilling.landsby + S.stilling.ulv > 0;
  const stillingHtml = (S) =>
    harStilling(S)
      ? `<p class="vu-stilling"><span class="etikett">Stillingen på denne mobilen</span><span class="vu-stilling-tall"><span>Landsbyen</span> <b>${S.stilling.landsby} – ${S.stilling.ulv}</b> <span>Varulvene</span></span></p>`
      : "";

  // Done once per game, on the way to «Kåringen»: the tally, «Kveldens gjeng» and statistics.
  // The winning side gets one point each. A game that was ended early has no winner: it counts
  // for nothing but the statistics.
  function bokfor(S) {
    const sp = S.spill;
    if (sp.modus === "en") {
      // «Én natt»: the points of the session (the tally was counted round by round).
      if (sp.spilt > 0) R.kveld.registrer(range(sp.n).map((i) => ({ i, poeng: sp.poeng[i] })));
      R.statistikk("ferdig", { modus: "en", runder: sp.spilt, avbrutt: !!sp.avbrutt });
      return;
    }
    if (sp.vinner) {
      S.stilling[sp.vinner] = Math.min(999, S.stilling[sp.vinner] + 1);
      R.kveld.registrer(range(sp.n).map((i) => ({ i, poeng: erUlv(sp, i) === (sp.vinner === "ulv") ? 1 : 0 })));
    }
    R.statistikk("ferdig", { modus: "klassisk", runder: spilteNetter(sp), avbrutt: !!sp.avbrutt });
  }

  // To «Kåringen». The bookkeeping comes first: the screen shows the new tally.
  function tilKaring(S) {
    const sp = S.spill;
    sp.ferdig = true;
    if (!sp.bokfort) {
      sp.bokfort = true;
      bokfor(S);
    }
    R.gaTil("slutt");
  }

  // «Del resultatet»: the result and one award – first names only, nothing else a player typed.
  function delTekst(S) {
    const sp = S.spill;
    const pris = statistikk(sp).find((r) => r.del);
    const linjer = [`Varulven 🐺 ${sp.vinner === "ulv" ? "Varulvene" : "Landsbyen"} vant etter ${netter(spilteNetter(sp))}.`];
    if (pris) linjer.push(pris.del + ".");
    else if (S.stilling.landsby + S.stilling.ulv > 1) linjer.push(`Stillingen: ${stillingTekst(S)}.`);
    return linjer.join("\n");
  }

  // ---------- «Én natt»: the game ----------

  const EN_REKKE = ["varulv", "synsk", "bytter", "brak", "landsby"];
  const nattSkjerm = (sp) => (sp.modus === "en" ? "en-natt" : "natt");
  const rollenavn = (r) => EN_ROLLER[r].navn.toLowerCase();
  const rundeTekst = (sp) => (sp.runder ? `Runde ${sp.runde} av ${sp.runder}` : `Runde ${sp.runde}`);
  const sisteRunde = (sp) => sp.runder > 0 && sp.runde >= sp.runder;
  const antallOrd = (n, entall, flertall) => `${n === 0 ? "ingen" : tallord(n)} ${n === 1 ? entall : flertall}`;

  function enNyttSpill(S) {
    const n = R.klamp(S.antall, MODUS.en.min, MODUS.en.maks);
    S.spill = {
      modus: "en",
      n,
      runder: S.oppsett.runder,
      runde: 0,
      spilt: 0, // rounds that were played to the end and scored
      poeng: range(n).map(() => 0),
      seirer: { landsby: 0, ulv: 0 }, // rounds won by each side in this session
      logg: [], // what the awards on «Kåringen» are made of, one entry per scored round
      fro: R.nyttFro() % 1000,
      roller: [],
      tur: null,
      valg: {},
      slutt: null, // the roles when the night is over
      klokke: null,
      pektValg: [], // marked on the vote screen
      pekt: null, // those who were pointed out, once it is confirmed
      vist: false, // the reveal is done
      talt: false, // this round is in the score
      ferdig: false,
      avbrutt: false,
      feiret: false,
      bokfort: false,
    };
    R.statistikk("start", { modus: "en", spillere: n });
    R.holdVaken();
    enNyRunde(S);
  }

  // A new deal. The phone starts one seat further round the table each round.
  function enNyRunde(S) {
    const sp = S.spill;
    sp.runde += 1;
    sp.roller = R.stokk(enStokk(sp.n), R.rng(R.nyttFro()));
    sp.valg = {};
    sp.slutt = null;
    sp.klokke = null;
    sp.pektValg = [];
    sp.pekt = null;
    sp.vist = false;
    sp.talt = false;
    const start = (sp.runde - 1) % sp.n;
    sp.tur = { rekke: range(sp.n).map((k) => (start + k) % sp.n), pos: 0, steg: "gi", klar: 0, markert: [], port: 0 };
    R.gaTil("en-natt-start");
  }

  // The roles when the night is over: the swapper's swap first, then the troublemaker's.
  function sluttroller(sp) {
    const r = sp.roller.slice();
    const b = sp.roller.indexOf("bytter");
    if (b >= 0 && erIndeks(sp.valg[b], sp.n)) {
      const x = sp.valg[b];
      [r[b], r[x]] = [r[x], r[b]];
    }
    const k = sp.roller.indexOf("brak");
    const par = k >= 0 ? sp.valg[k] : null;
    if (Array.isArray(par)) [r[par[0]], r[par[1]]] = [r[par[1]], r[par[0]]];
    return r;
  }

  // The village wins if someone who ended the night as a wolf is among those pointed out.
  const enVinner = (sp) => (sp.pekt.some((i) => sp.slutt[i] === "varulv") ? "landsby" : "ulv");
  // You play for the side of the role you ended up with.
  const enVant = (sp, i) => (sp.slutt[i] === "varulv") === (enVinner(sp) === "ulv");

  // What a wolf is told before the pick (HTML).
  function enUlveInfo(sp, meg) {
    const andre = range(sp.n).filter((i) => i !== meg && sp.roller[i] === "varulv");
    if (!andre.length) return "Du er den eneste varulven. Blir du ikke pekt ut i morgen, vinner du.";
    const a = andre[0];
    return (
      `Den andre varulven er <b>${esc(R.navn(a))}</b>. ` +
      (sp.valg[a] != null ? `<b>${esc(R.navn(a))}</b> vil skylde på <b>${esc(R.navn(sp.valg[a]))}</b>.` : "Blir ingen av dere pekt ut i morgen, vinner dere.")
    );
  }

  // The names to pick from: everyone, in the same order for every role. You can't pick yourself,
  // and a wolf can't blame the other wolf.
  function enValg(sp, meg) {
    const ulv = sp.roller[meg] === "varulv";
    const m = sp.tur.markert;
    return `<div class="velgere vu-velgere">${range(sp.n)
      .map((i) => {
        const deg = i === meg;
        const flokk = ulv && !deg && sp.roller[i] === "varulv";
        const merke = deg ? "deg" : flokk ? "🐺" : "";
        return `<button class="velger" data-h="en-marker" data-v="${i}" aria-pressed="${m.includes(i)}"${deg || flokk ? " disabled" : ""}>${R.avatar(i)}<span><b>${esc(R.navn(i))}</b>${
          merke ? `<small>${esc(merke)}</small>` : ""
        }</span></button>`;
      })
      .join("")}</div>`;
  }

  // The short private answer after the pick.
  function enSvar(sp, meg) {
    const r = sp.roller[meg];
    const v = sp.valg[meg];
    if (r === "varulv") {
      const andre = range(sp.n).filter((i) => i !== meg && sp.roller[i] === "varulv");
      return {
        ikon: "🐺",
        hoved: `Du skylder på ${R.navn(v)}.`,
        under: (andre.length ? `Ulveflokken: du og ${R.navn(andre[0])}. ` : "") + "Få landsbyen til å peke på en som ikke er varulv. Men husk: rollen din kan bli byttet i natt.",
      };
    }
    if (r === "synsk") return { ikon: EN_ROLLER[sp.roller[v]].ikon, hoved: `${R.navn(v)} er ${rollenavn(sp.roller[v])}.`, under: "Slik var det da natta begynte. Roller kan bytte plass før hanen galer." };
    if (r === "bytter") {
      const ny = sp.roller[v];
      return {
        ikon: EN_ROLLER[ny].ikon,
        hoved: `Nå er du ${rollenavn(ny)}.`,
        under: `${R.navn(v)} er bytter nå – uten å vite det. ${ny === "varulv" ? "Du er på ulvenes lag: ikke bli pekt ut." : "Du er fortsatt på landsbyens lag."}`,
      };
    }
    if (r === "brak") return { ikon: "😈", hoved: `${R.navn(v[0])} og ${R.navn(v[1])} bytter roller i natt.`, under: "Ingen av dem får vite det. Hva gjør du med den hemmeligheten?" };
    return { ikon: "🤫", hoved: "Mistanken din er notert.", under: `Du tror ${R.navn(v)} er varulv. Dere får se hvem som hadde rett når runden er over.` };
  }

  // The card behind «Glemt hva du så i natt?»: the role as dealt and what the player did.
  function enKort(sp, i) {
    const r = sp.roller[i];
    const svar = sp.valg[i] != null ? enSvar(sp, i) : null;
    return {
      klasse: "vu-kort",
      html: `
        <span class="kort-etikett">Da natta begynte, var du</span>
        <span class="vu-kort-ikon" aria-hidden="true">${EN_ROLLER[r].ikon}</span>
        <span class="kort-ord">${esc(EN_ROLLER[r].navn)}</span>
        <span class="vu-kort-tekst">${esc(svar ? (r === "landsby" ? `Du mistenkte ${R.navn(sp.valg[i])}.` : svar.hoved) : "")}</span>
        <span class="kort-fot">Roller kan ha byttet plass i natt.</span>`,
    };
  }

  // The round is in the books when the players move on from the reveal (until then «Angre» can
  // take the vote back): the points, the tally on this phone, and what the awards are made of.
  function enTell(S) {
    const sp = S.spill;
    if (sp.talt || !sp.vist || !sp.pekt || !sp.slutt) return;
    const v = enVinner(sp);
    range(sp.n).forEach((i) => {
      if (enVant(sp, i)) sp.poeng[i] += 1;
    });
    const gjettet = range(sp.n).filter((i) => sp.roller[i] === "landsby" && erIndeks(sp.valg[i], sp.n));
    sp.logg.push({
      v,
      pekt: sp.pekt.slice(),
      ulver: range(sp.n).filter((i) => sp.slutt[i] === "varulv"),
      treff: gjettet.filter((i) => sp.roller[sp.valg[i]] === "varulv"), // the villagers' secret guesses
      bom: gjettet.filter((i) => sp.roller[sp.valg[i]] !== "varulv"),
    });
    if (sp.logg.length > 60) sp.logg.shift();
    sp.spilt += 1;
    sp.seirer[v] += 1;
    S.stilling[v] = Math.min(999, S.stilling[v] + 1);
    sp.talt = true;
  }

  // The night as a little story, for the reveal (HTML rows): what the wolves planned, what the
  // seer saw, and the swaps in the order they were carried out.
  function enHistorie(sp) {
    const n = (i) => `<b>${esc(R.navn(i))}</b>`;
    const rader = [];
    range(sp.n)
      .filter((i) => sp.roller[i] === "varulv" && sp.valg[i] != null)
      .forEach((u) => rader.push(["🐺", `Varulven ${n(u)} ville skylde på ${n(sp.valg[u])}.`]));
    const s = sp.roller.indexOf("synsk");
    if (s >= 0 && sp.valg[s] != null) rader.push(["🔮", `Den synske, ${n(s)}, så på ${n(sp.valg[s])}: ${esc(rollenavn(sp.roller[sp.valg[s]]))}.`]);
    const r = sp.roller.slice();
    const b = sp.roller.indexOf("bytter");
    if (b >= 0 && sp.valg[b] != null) {
      const x = sp.valg[b];
      [r[b], r[x]] = [r[x], r[b]];
      rader.push(["🔄", `Bytteren ${n(b)} byttet rolle med ${n(x)} og ble ${esc(rollenavn(r[b]))}. ${n(x)} ble bytter – uten å vite det.`]);
    }
    const k = sp.roller.indexOf("brak");
    if (k >= 0 && Array.isArray(sp.valg[k])) {
      const [y, z] = sp.valg[k];
      const like = r[y] === r[z];
      [r[y], r[z]] = [r[z], r[y]];
      rader.push([
        "😈",
        `Bråkmakeren ${n(k)} byttet om rollene til ${n(y)} og ${n(z)}` +
          (like ? ` – men begge var ${esc(EN_ROLLER[r[y]].flertall || rollenavn(r[y]))}, så ingenting skjedde.` : `: ${n(y)} ble ${esc(rollenavn(r[y]))}, og ${n(z)} ble ${esc(rollenavn(r[z]))}.`),
      ]);
    }
    const gjett = range(sp.n).filter((i) => sp.roller[i] === "landsby" && sp.valg[i] != null);
    if (gjett.length) {
      rader.push(["🤫", `Hemmelige mistanker: ${gjett.map((i) => `${n(i)} mistenkte ${n(sp.valg[i])} (${sp.roller[sp.valg[i]] === "varulv" ? "traff" : "bom"})`).join(", ")}.`]);
    }
    return rader.map(([ikon, tekst]) => `<li><span class="vu-hist-ikon" aria-hidden="true">${ikon}</span><span>${tekst}</span></li>`).join("");
  }

  // Awards for a whole session, from the rounds that were scored.
  function enPriser(sp) {
    const priser = [];
    const tell = (f) => range(sp.n).map((i) => sp.logg.filter((l) => f(l, i)).length);
    const treff = tell((l, i) => l.treff.includes(i));
    const forsok = tell((l, i) => l.treff.includes(i) || l.bom.includes(i));
    const beste = range(sp.n)
      .filter((i) => treff[i] > 0)
      .sort((a, b) => treff[b] / forsok[b] - treff[a] / forsok[a] || treff[b] - treff[a])[0];
    if (beste != null) {
      priser.push({
        ikon: "🎯",
        tittel: "Beste magefølelse",
        tekst: `${R.navn(beste)} pekte på en varulv ${treff[beste]} av ${forsok[beste]} ${forsok[beste] === 1 ? "natt" : "netter"} – helt uten ledetråder.`,
        del: `Beste magefølelse: ${R.navn(beste)}, ${treff[beste]} av ${forsok[beste]}`,
      });
    }
    const somUlv = tell((l, i) => l.v === "ulv" && l.ulver.includes(i));
    const flest = Math.max(0, ...somUlv);
    const skuespillere = range(sp.n).filter((i) => flest > 0 && somUlv[i] === flest);
    if (skuespillere.length === 1 || skuespillere.length === 2) {
      priser.push({ ikon: "🎭", tittel: "Beste skuespiller", tekst: `${liste(skuespillere.map(R.navn))} slapp unna som varulv ${antallOrd(flest, "gang", "ganger")}${skuespillere.length > 1 ? " hver" : ""}.` });
    }
    const pekt = tell((l, i) => l.pekt.includes(i));
    const mest = Math.max(0, ...pekt);
    const utpekte = range(sp.n).filter((i) => mest >= 2 && pekt[i] === mest);
    if (utpekte.length === 1) {
      const i = utpekte[0];
      const skyldig = sp.logg.filter((l) => l.pekt.includes(i) && l.ulver.includes(i)).length;
      const dom = skyldig === 0 ? "og var uskyldig hver gang." : skyldig === mest ? "og var varulv hver gang!" : `og var varulv ${skyldig === 1 ? "én" : tallord(skyldig)} av dem.`;
      priser.push({ ikon: "👉", tittel: "Mest utpekt", tekst: `${R.navn(i)} ble pekt ut ${tallord(mest)} ganger – ${dom}` });
    }
    return priser;
  }

  const enVinnere = (sp) => {
    const topp = Math.max(0, ...sp.poeng);
    return topp > 0 ? range(sp.n).filter((i) => sp.poeng[i] === topp) : [];
  };

  // «Del resultatet» for a session: the winner(s) by first name and the numbers.
  function enDelTekst(S) {
    const sp = S.spill;
    const vinnere = enVinnere(sp);
    const topp = Math.max(0, ...sp.poeng);
    const hvem = vinnere.length > 3 ? `${antallOrd(vinnere.length, "spiller", "spillere")} delte seieren` : vinnere.length > 1 ? `${liste(vinnere.map(R.navn))} delte seieren` : `${R.navn(vinnere[0])} vant`;
    const s = sp.seirer;
    return [
      `Varulven 🐺 Én natt: ${hvem} med ${topp} poeng etter ${antallOrd(sp.spilt, "runde", "runder")}.`,
      `Landsbyen vant ${antallOrd(s.landsby, "runde", "runder")}, varulvene ${s.ulv === 0 ? "ingen" : tallord(s.ulv)}.`,
    ].join("\n");
  }

  // «Kåringen» after a session: the winner(s), the podium, the scores and the awards.
  function enKaring(S) {
    const sp = S.spill;
    const rader = range(sp.n).map((i) => ({ i, poeng: sp.poeng[i] }));
    const vinnere = enVinnere(sp);
    const mange = vinnere.length > 3;
    const seirer = `Landsbyen vant ${antallOrd(sp.seirer.landsby, "runde", "runder")}, varulvene ${sp.seirer.ulv ? tallord(sp.seirer.ulv) : "ingen"}.`;
    const banner = vinnere.length
      ? R.ui.banner({
          klasse: "aksent",
          etikett: `Én natt · ${R.flertall(sp.spilt, "runde", "runder")}`,
          tittel: mange ? `${vinnere.length} spillere deler seieren!` : `${R.ramsOpp(vinnere.map(R.navn))} vinner!`,
          tekst: seirer,
        })
      : R.ui.banner({ stemning: "", etikett: "Én natt", tittel: "Ingen vant denne gangen", tekst: "Spillet ble avsluttet før første runde var ferdig." });
    return `
      ${banner}
      ${vinnere.length ? R.ui.pall(rader) + R.ui.poengliste(rader) : ""}
      ${prisHtml(enPriser(sp))}
      ${stillingHtml(S)}
      ${vinnere.length ? R.ui.knapp2("Del resultatet", "del") : ""}
      ${R.ui.flereSpill({ antall: sp.n })}
      ${R.ui.dokk(R.ui.knapp("Spill igjen", "igjen"), R.ui.lenkerad(R.ui.lenke("Endre oppsett", "nytt"), '<a class="lenke" href="/">Alle spill</a>'))}`;
  }

  // A game is in progress until «Kåringen» (front page badge, screen kept awake).
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const KLASSISKE = ["roller", "natt-start", "natt", "morgen", "jeger", "dag", "stemme", "utkastet"];
  const EN_SKJERMER = ["en-natt-start", "en-natt", "en-morgen", "en-dag", "en-stemme", "en-avsloring"];
  const SPILLSKJERMER = [...KLASSISKE, ...EN_SKJERMER, "slutt"];

  function fortsettTekst(sp) {
    const s = sp.skjerm;
    if (sp.modus === "en") return `Fortsett · ${rundeTekst(sp).toLowerCase()}`;
    if (s === "roller" || !s) return "Fortsett · rollene";
    if (s === "natt-start" || s === "natt") return `Fortsett · natt ${sp.natt}`;
    if (s === "morgen") return `Fortsett · morgen ${sp.natt}`;
    return `Fortsett · dag ${sp.dag}`;
  }

  // ---------- Saved state: check everything before it is used ----------
  // A damaged or outdated save must never give a dead screen: a game that does not hold together
  // is dropped (S.spill = null) and the player starts from the home screen.

  const erObjekt = (v) => !!v && typeof v === "object" && !Array.isArray(v);
  const erIndeks = (v, n) => Number.isInteger(v) && v >= 0 && v < n;
  const erTall = (v) => typeof v === "number" && Number.isFinite(v);
  const tomEllerIndeks = (v, n) => v == null || erIndeks(v, n);

  function gyldigKlokke(k) {
    return erObjekt(k) && erTall(k.total) && k.total > 0 && erTall(k.igjen) && (k.slutt == null || erTall(k.slutt));
  }

  function gyldigTur(t, n) {
    return erObjekt(t) && Array.isArray(t.rekke) && t.rekke.length > 0 && t.rekke.every((i) => erIndeks(i, n)) && erIndeks(t.pos, t.rekke.length);
  }

  function gyldigKlassisk(sp) {
    const n = sp.n;
    // (a game saved before the range became 6–12 may have up to 18 players and may finish)
    if (!Number.isInteger(n) || n < 3 || n > 18) return false;
    if (!Array.isArray(sp.roller) || sp.roller.length !== n || sp.roller.some((r) => !SPESIAL.includes(r) && r !== "varulv" && r !== "landsby")) return false;
    if (!sp.roller.includes("varulv")) return false;
    if (!Array.isArray(sp.levende) || sp.levende.length !== n) return false;
    if (!erTall(sp.natt) || !erTall(sp.dag) || !erTall(sp.fro) || !TIDER.includes(sp.tid)) return false;
    if (!erObjekt(sp.valg) || Object.keys(sp.valg).some((k) => !erIndeks(Number(k), n) || !tomEllerIndeks(sp.valg[k], n))) return false;
    if (!erObjekt(sp.vis) || !erIndeks(sp.vis.i, n)) return false;
    if (!tomEllerIndeks(sp.forrigeBeskyttet, n) || !tomEllerIndeks(sp.mistenkt, n) || !tomEllerIndeks(sp.utkastet, n)) return false;
    if (!(sp.spilleder == null || sp.spilleder === -1 || erIndeks(sp.spilleder, n))) return false;
    if (sp.vinner != null && sp.vinner !== "landsby" && sp.vinner !== "ulv") return false;
    if (!Array.isArray(sp.mistanker) || sp.mistanker.some((m) => !erObjekt(m) || !erIndeks(m.fra, n) || !erIndeks(m.til, n))) return false;
    const hendelseOk = (h) => {
      if (!erObjekt(h)) return false;
      if (h.type === "natt") return tomEllerIndeks(h.mal, n) && tomEllerIndeks(h.offer, n) && (h.synsk == null || (erObjekt(h.synsk) && erIndeks(h.synsk.av, n) && erIndeks(h.synsk.sjekket, n)));
      if (h.type === "dag") return tomEllerIndeks(h.ut, n);
      return h.type === "jeger" && erIndeks(h.av, n) && erIndeks(h.mal, n);
    };
    if (!Array.isArray(sp.hendelser) || !sp.hendelser.every(hendelseOk)) return false;
    if (sp.tur != null && !gyldigTur(sp.tur, n)) return false;
    if (sp.morgen != null && !(erObjekt(sp.morgen) && tomEllerIndeks(sp.morgen.offer, n))) return false;
    if (sp.jeger != null && !(erObjekt(sp.jeger) && erIndeks(sp.jeger.av, n) && tomEllerIndeks(sp.jeger.valgt, n) && tomEllerIndeks(sp.jeger.mal, n))) return false;
    if (sp.klokke != null && !gyldigKlokke(sp.klokke)) return false;
    // The screen the game is on must have what it draws.
    const s = sp.skjerm;
    if (s != null && !KLASSISKE.includes(s) && s !== "slutt") return false;
    if ((s === "natt-start" || s === "natt") && !sp.tur) return false;
    if (s === "morgen" && !sp.morgen) return false;
    if (s === "jeger" && !sp.jeger) return false;
    if ((s === "dag" || s === "stemme") && !sp.klokke) return false;
    if (s === "utkastet" && sp.utkastet == null) return false;
    if (s === "slutt" && !sp.ferdig && !sp.vinner) return false;
    return true;
  }

  function gyldigEn(sp) {
    const n = sp.n;
    const indekser = (l) => Array.isArray(l) && l.every((i) => erIndeks(i, n));
    const antall = (v) => Number.isInteger(v) && v >= 0;
    if (!Number.isInteger(n) || n < MODUS.en.min || n > MODUS.en.maks) return false;
    if (!RUNDER.includes(sp.runder) || !Number.isInteger(sp.runde) || sp.runde < 1 || !erTall(sp.fro) || !antall(sp.spilt)) return false;
    if (!Array.isArray(sp.poeng) || sp.poeng.length !== n || !sp.poeng.every(antall)) return false;
    if (!erObjekt(sp.seirer) || !antall(sp.seirer.landsby) || !antall(sp.seirer.ulv)) return false;
    if (!Array.isArray(sp.logg) || !sp.logg.every((l) => erObjekt(l) && (l.v === "landsby" || l.v === "ulv") && indekser(l.pekt) && indekser(l.ulver) && indekser(l.treff) && indekser(l.bom))) return false;
    // The round in play: the right deck, and night picks that fit the roles.
    if (!Array.isArray(sp.roller) || sp.roller.slice().sort().join() !== enStokk(n).sort().join()) return false;
    if (!erObjekt(sp.valg)) return false;
    for (const k of Object.keys(sp.valg)) {
      const i = Number(k);
      const v = sp.valg[k];
      if (!erIndeks(i, n)) return false;
      if (sp.roller[i] === "brak" ? !(indekser(v) && v.length === 2 && v[0] !== v[1] && !v.includes(i)) : !(erIndeks(v, n) && v !== i)) return false;
    }
    if (sp.tur != null && !gyldigTur(sp.tur, n)) return false;
    if (sp.slutt != null) {
      // After the night: everyone has picked, and the final roles are the same deck.
      if (!Array.isArray(sp.slutt) || sp.slutt.slice().sort().join() !== sp.roller.slice().sort().join()) return false;
      if (range(n).some((i) => sp.valg[i] == null)) return false;
    }
    if (!indekser(sp.pektValg) || (sp.pekt != null && !indekser(sp.pekt))) return false;
    if (sp.klokke != null && !gyldigKlokke(sp.klokke)) return false;
    // The screen the game is on must have what it draws.
    const s = sp.skjerm;
    if (s != null && !EN_SKJERMER.includes(s) && s !== "slutt") return false;
    if ((s === "en-natt-start" || s === "en-natt") && !sp.tur) return false;
    if (["en-morgen", "en-dag", "en-stemme", "en-avsloring"].includes(s) && !sp.slutt) return false;
    if ((s === "en-dag" || s === "en-stemme") && !sp.klokke) return false;
    if (s === "en-avsloring" && !sp.pekt) return false;
    if (s === "slutt" && !sp.ferdig) return false;
    return true;
  }

  const gyldigSpill = (sp) => erObjekt(sp) && (sp.modus === "en" ? gyldigEn(sp) : gyldigKlassisk(sp));

  const REGLER = {
    klassisk: {
      tittel: "Klassisk – den lange leken",
      intro: "Klassisk: Noen i landsbyen er varulver. Om natta jakter de, om dagen later de som ingenting. Mobilen er spillederen – den forteller alle hva de skal gjøre.",
      steg: [
        ["Se rollen din", "Send mobilen rundt. Hold fingeren på kortet for å se om du er varulv, synsk, lege eller landsbyboer."],
        ["Natt: mobilen går rundt", "Alle lukker øynene og nynner. Den som får mobilen, gjør nattjobben sin i stillhet og gir den videre. Alle gjør noe, så ingen kan gjette roller ut fra tiden."],
        ["Dag: snakk og stem", "Mobilen forteller hvem ulvene tok. Snakk sammen, pek samtidig og kast ut den dere mistenker. Rollen blir avslørt."],
      ],
      tips: [
        "Landsbyen vinner når alle varulvene er ute. Varulvene vinner når de er like mange som resten.",
        "Varulvene vet hvem de andre varulvene er, og ser hva de andre har valgt om natta.",
        "Den synske ser om én person er varulv hver natt. Legen beskytter én person – men ikke den samme to netter på rad.",
        "Jeger (valgfri): Blir jegeren tatt eller kastet ut, tar jegeren med seg én person.",
        "Fredelig første natt (valgfri): Alle tar nattrunden sin, og den synske ser – men ingen blir tatt. Da får alle spilt før noen ryker ut.",
        "Den første som ryker ut, blir spilleder: holder mobilen, leser høyt og teller fingrene. Ryker du ut senere, er du stille resten av spillet – men du får gjerne se på og le.",
      ],
    },
    en: {
      tittel: "Én natt – den korte leken",
      intro: "Én natt: Alle får en rolle, mobilen går én runde rundt bordet, og noen bytter roller i mørket. Så har dere fire minutter på å peke ut en varulv. Ingen ryker ut.",
      steg: [
        ["Natt: mobilen går én runde", "Alle lukker øynene og nynner. Når du får mobilen, ser du rollen din og gjør nattjobben din. Alle gjør noe, så ingen kan gjette roller ut fra tiden."],
        ["Dag: fire minutter prat", "Hvem er varulv? Fortell, spør og bløff. Husk at roller kan ha byttet plass i natt – kanskje din også."],
        ["Pek samtidig", "Landsbyen vinner hvis en varulv er blant dem som får flest fingrer. Ellers vinner varulvene. Vinnerne får ett poeng hver."],
      ],
      tips: [
        "Varulv: Fra sju spillere er det to, og de får vite om hverandre. Varulven velger hvem flokken vil skylde på.",
        "Synsk: Ser rollen til én spiller – slik den var da natta begynte.",
        "Bytter: Bytter rolle med én spiller og får se den nye rollen sin. Den andre får ikke vite noe.",
        "Bråkmaker (fra seks spillere): Bytter om rollene til to andre – uten at noen får se dem.",
        "Byttene skjer når natta er over: først bytterens, så bråkmakerens. Du spiller for laget til rollen du ender med.",
        "Fikk ingen mer enn én finger, er ingen pekt ut – og da vinner varulvene.",
        "Dere spiller tre eller fem runder, eller så mange dere vil. Flest poeng vinner.",
      ],
    },
  };

  const DEF = {
    id: "varulven",
    versjon: 1,
    pagar: (S) => pagar(S),

    // A fresh setup starts from the saved group: six or more start in the classic game, fewer
    // in «Én natt» (which needs four).
    tilstand: () => {
      const lagret = R.felles.navn.filter((n) => String(n || "").trim()).length;
      const modus = lagret >= MODUS.klassisk.min ? "klassisk" : "en";
      return {
        antall: R.klamp(lagret || 5, MODUS[modus].min, MODUS[modus].maks),
        oppsett: { modus, ulver: null, synsk: true, lege: true, jeger: false, tid: 3, fredelig: null, runder: 5, bytte: null },
        spill: null,
        stilling: { landsby: 0, ulv: 0 }, // games and rounds won by each side on this phone
      };
    },

    lastet(S) {
      // (a setup saved before «Én natt» existed was a classic one)
      const o = (S.oppsett = Object.assign({ modus: "klassisk", ulver: null, synsk: true, lege: true, jeger: false, tid: 3, fredelig: null, runder: 5, bytte: null }, erObjekt(S.oppsett) ? S.oppsett : null));
      if (!MODUS[o.modus]) o.modus = "klassisk";
      if (!TIDER.includes(o.tid)) o.tid = 3;
      if (!RUNDER.includes(o.runder)) o.runder = 5;
      if (!(Number.isInteger(o.ulver) && o.ulver >= 1 && o.ulver <= maksUlver(MAKS))) o.ulver = null;
      SPESIAL.forEach((r) => (o[r] = !!o[r]));
      if (o.fredelig != null) o.fredelig = !!o.fredelig;
      if (!(erObjekt(o.bytte) && MODUS[o.bytte.modus] && Number.isInteger(o.bytte.antall))) o.bytte = null;
      S.antall = R.klamp(Math.round(Number(S.antall)) || MODUS[o.modus].min, MODUS[o.modus].min, MODUS[o.modus].maks);
      const st = erObjekt(S.stilling) ? S.stilling : {};
      const seirer = (v) => (Number.isInteger(v) && v > 0 ? Math.min(v, 999) : 0);
      S.stilling = { landsby: seirer(st.landsby), ulv: seirer(st.ulv) };

      let sp = S.spill;
      if (erObjekt(sp) && sp.modus !== "en") {
        // A game saved before «Avslutt», the peaceful first night and the game leader existed
        // plays on as it was (no leader is named if someone is out already).
        if (sp.ferdig == null) sp.ferdig = !!sp.vinner;
        if (sp.spilleder === undefined) sp.spilleder = Array.isArray(sp.levende) && sp.levende.some((l) => !l) ? -1 : null;
        sp.modus = "klassisk";
      }
      if (!gyldigSpill(sp)) sp = S.spill = null;
      if (SPILLSKJERMER.includes(S.skjerm) && (!sp || sp.skjerm !== S.skjerm)) S.skjerm = "hjem";
      // After a reload in the middle of the night, start again at "give the phone to …": never
      // straight back to a secret.
      if (sp && sp.tur) Object.assign(sp.tur, { steg: "gi", markert: sp.modus === "en" ? [] : null });
    },

    // The rules sheet leads with the way of playing that is in use, and has the other one below.
    get regler() {
      const S = R.S;
      const modus = S && S.spill && !S.spill.ferdig ? S.spill.modus : S && S.oppsett ? S.oppsett.modus : "klassisk";
      const [forst, sa] = modus === "en" ? [REGLER.en, REGLER.klassisk] : [REGLER.klassisk, REGLER.en];
      return {
        intro: forst.intro,
        steg: forst.steg,
        tips: forst.tips,
        ekstraHtml: `
          <h3>${esc(sa.tittel)}</h3>
          <p class="ingress">${esc(sa.intro)}</p>
          <ol class="steg">${sa.steg.map(([t, x]) => `<li><b>${esc(t)}</b><span>${esc(x)}</span></li>`).join("")}</ol>
          <ul class="tips">${sa.tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`,
      };
    },

    hemmelig: {
      innhold(S, id) {
        const sp = S.spill;
        const i = Number(String(id).slice(1));
        if (!sp || !erIndeks(i, sp.n)) return { html: "" };
        return sp.modus === "en" ? enKort(sp, i) : rollekort(sp, i);
      },
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
      S.oppsett.bytte = null;
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
              ...(harStilling(S) ? [["STILLING", stillingTekst(S)]] : []),
              ["4–12", "spillere"],
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
          const en = o.modus === "en";
          // The way of playing comes first. A tile that does not fit the group says what it
          // needs – and still works: choosing it adds or hides rows in the list of players.
          const klassisk = MODUS.klassisk;
          const modusvalg = `
            <section class="seksjon">
              <h2>Hvordan vil dere spille?</h2>
              ${R.ui.fliser(
                "modus",
                [
                  {
                    v: "klassisk",
                    ikon: "🐺",
                    tittel: "Klassisk",
                    tekst: en && n < klassisk.min ? `Trenger minst ${klassisk.min} spillere (dere er ${n}). 20–40 min, noen ryker ut` : "6–12 spillere, 20–40 min, noen ryker ut",
                  },
                  {
                    v: "en",
                    ikon: "🌙",
                    tittel: "Én natt",
                    tekst: !en && n > MODUS.en.maks ? `Opptil ${MODUS.en.maks} spillere (dere er ${n}). 7 min per runde, alle er med hele tiden` : "4–10 spillere, 7 min per runde, alle er med hele tiden",
                  },
                ],
                o.modus,
              )}
            </section>`;
          const rekkefolge = "Skriv navnene i den rekkefølgen dere sitter rundt bordet – mobilen går rundt i den rekkefølgen.";
          if (en) {
            return `
              <h1 id="skjerm-tittel">Gjør klart</h1>
              ${modusvalg}
              ${R.ui.spillere({ min: MODUS.en.min, max: MODUS.en.maks, hjelp: rekkefolge })}
              <p class="vu-stokk"><span class="etikett">Rollene i spillet (${n})</span>${stokkTekst(enStokk(n), EN_ROLLER, EN_REKKE)}</p>
              <section class="seksjon">
                <h2>Antall runder</h2>
                ${R.ui.seg("runder", RUNDER.map((r) => [r, r ? String(r) : "Fri"]), o.runder, { etikett: "Antall runder" })}
                <p class="hjelp">${
                  o.runder ? `Ca. ${Math.round((o.runder * 7) / 5) * 5} minutter. Nye roller hver runde – flest poeng vinner.` : "Spill så mange runder dere vil. «Avslutt» tar dere til kåringen."
                }</p>
              </section>
              ${R.ui.dokk(R.ui.knapp("Start", "start"))}`;
          }
          const ulver = antallUlver(S);
          return `
            <h1 id="skjerm-tittel">Gjør klart</h1>
            ${modusvalg}
            ${R.ui.spillere({ min: klassisk.min, max: klassisk.maks, hjelp: "Best med 7–10. " + rekkefolge })}
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
            <p class="vu-stokk"><span class="etikett">Rollene i spillet (${n})</span>${stokkTekst(kortstokk(n, ulver, o), ROLLER, ["varulv", ...SPESIAL, "landsby"])}</p>
            ${R.ui.bryter("fredelig", fredeligPa(S), "Fredelig første natt", "Alle tar nattrunden sin, men ingen blir tatt den første natta. Da får alle spilt før noen ryker ut.")}
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
          // After a day when nobody was voted out, the night opens with that.
          const fortelling = sp.ingenUt ? linje(sp, "ingenUt", sp.dag) : linje(sp, "natt", sp.natt);
          return `
            <div class="vu-natthimmel">
              <span class="vu-maane" aria-hidden="true">🌙</span>
              <h1 id="skjerm-tittel">Natta faller på</h1>
              <p class="vu-fortelling">${esc(fortelling)}</p>
              ${erFredelig(sp) ? '<p class="vu-merke"><span aria-hidden="true">🕊️</span> Fredelig første natt: ingen blir tatt</p>' : ""}
            </div>
            ${nattSteg(sp, sp.natt, "Mobilen går rundt bordet. Ingen titter – og nynningen skjuler alle lyder.", "Åpne øynene, ta mobilen og gjør det den sier – helt stille.", "Alle får en tur, også de uten nattjobb.")}
            <p class="hjelp">Natta tar ${omtrentTid(sp.tur.rekke.length * NATT_SEK)} og starter hos <b>${esc(R.navn(forste))}</b>.</p>
            ${R.ui.dokk(R.ui.knapp("Start natta", "start-natt"), R.ui.lenkerad(R.ui.lenke("Avslutt", "avslutt")))}`;
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
          if (t.steg === "gi") return giSteg(sp);
          if (t.steg === "valg") {
            const r = nattjobb(sp, meg);
            const info = sp.roller[meg] === "varulv" ? ulveInfo(sp, meg) : esc(r.info);
            const m = t.markert;
            return `
              ${prikker(sp)}
              <div class="vu-oppdrag">
                <div class="vu-hvem">${R.avatar(meg)}<div><h1 id="skjerm-tittel">${esc(R.navn(meg))}</h1> <span>· ${r.ikon} ${esc(r.navn)}</span></div></div>
                <p class="vu-sporsmal">${esc(r.sporsmal)}</p>
                <p>${info}</p>
              </div>
              ${nattValg(sp, meg)}
              ${R.ui.dokk(R.ui.knapp(m != null ? `${r.verb} ${R.navn(m)}` : "Trykk på et navn", "velg", { av: m == null }))}`;
          }
          return svarSteg(sp, nattSvar(sp, meg));
        },
        etter: nattEtter,
      },

      morgen: {
        tittel: (S) => `Morgen ${S.spill.natt}`,
        tilbake: "hjem",
        stemning: "morgen",
        vis(S) {
          const sp = S.spill;
          const m = sp.morgen;
          if (!m.vist) {
            const leder = spilleder(sp);
            return `
              <div class="vu-sol" aria-hidden="true">☀️</div>
              <div class="vu-mottaker">
                <h1 id="skjerm-tittel">Alle åpner øynene!</h1>
                <p class="vu-fortelling">${esc(linje(sp, "morgen", sp.natt))}</p>
              </div>
              <p class="hjelp">Si det høyt: <b>«God morgen, landsby!»</b> ${
                leder != null ? `Gi mobilen til spillederen, <b>${esc(R.navn(leder))}</b>, som trykker når alle ser på.` : "Legg mobilen midt på bordet og trykk når alle ser på."
              }</p>
              ${R.ui.dokk(R.ui.knapp("Hva skjedde i natt?", "se-natt"))}`;
          }
          if (m.offer == null) {
            return `
              <div class="vu-spotlys">
                <div class="vu-stor-ikon" aria-hidden="true">${m.fredelig ? "🕊️" : m.reddet ? "🩹" : "🌤️"}</div>
                <h1 id="skjerm-tittel">${m.fredelig ? "Alle våknet. Denne gangen." : "Alle overlevde natta!"}</h1>
                <p class="vu-fortelling">${esc(m.fredelig ? linje(sp, "fredelig", 0) : m.reddet ? linje(sp, "reddet", sp.natt) : "En helt stille natt.")}</p>
              </div>
              ${R.ui.dokk(nesteKnapp(sp, "dag"))}`;
          }
          return `
            <div class="vu-spotlys">
              <span class="vu-dod">${R.avatar(m.offer, "gigant")}</span>
              <h1 id="skjerm-tittel">${esc(R.navn(m.offer))} ble tatt i natt<span class="vh"> – ${esc(rolle(sp, m.offer).navn)}</span></h1>
              <div class="stempel-sted">${stempel(sp, m.offer)}</div>
              ${uteTekst(sp, m.offer, sp.spilleder === m.offer ? "" : `${R.navn(m.offer)} er ute av spillet og sier ikke mer.`)}
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
              ${R.ui.dokk(R.ui.knapp(j.valgt != null ? `Skyt ${R.navn(j.valgt)}` : "Velg hvem jegeren skyter", "skyt", { variant: "rosa", av: j.valgt == null }))}`;
          }
          return `
            <div class="vu-spotlys${j.vist ? "" : " spenning"}">
              <span class="vu-skjelv${j.vist ? " vu-dod" : ""}">${R.avatar(j.mal, "gigant")}</span>
              <h1 id="skjerm-tittel">${j.vist ? `${esc(R.navn(j.mal))} var …<span class="vh"> ${esc(rolle(sp, j.mal).navn)}</span>` : `Jegeren sikter på ${esc(R.navn(j.mal))} …`}</h1>
              <div class="stempel-sted">${j.vist ? stempel(sp, j.mal) : ""}</div>
              ${j.vist ? uteTekst(sp, j.mal, "") : ""}
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
            ${R.ui.dokk(R.ui.knapp("Klare til å stemme", "til-stemme", { variant: "rosa" }), R.ui.lenkerad(R.ui.lenke("Glemt rollen din?", "se-igjen"), R.ui.lenke("Avslutt", "avslutt")))}`;
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
          const leder = spilleder(sp);
          return `
            <h1 id="skjerm-tittel">Landsbyen stemmer</h1>
            <p class="ingress">Tell ned og pek samtidig på den dere vil kaste ut. Den som får flest fingrer, må forlate landsbyen.${
              leder != null ? ` Spillederen, ${esc(R.navn(leder))}, teller fingrene.` : ""
            }</p>
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
          return `
            <div class="vu-spotlys${sp.utVist ? "" : " spenning"}">
              <span class="vu-skjelv${sp.utVist ? " vu-dod" : ""}">${R.avatar(i, "gigant")}</span>
              <h1 id="skjerm-tittel">${sp.utVist ? `${esc(R.navn(i))} var …<span class="vh"> ${esc(rolle(sp, i).navn)}</span>` : `${esc(R.navn(i))} forlater landsbyen …`}</h1>
              <div class="stempel-sted">${sp.utVist ? stempel(sp, i) : ""}</div>
              ${sp.utVist ? uteTekst(sp, i, erUlv(sp, i) ? "Riktig!" : "Å nei, en uskyldig!") : ""}
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

      // ---------- «Én natt» ----------

      "en-natt-start": {
        tittel: (S) => rundeTekst(S.spill),
        tilbake: "hjem",
        stemning: "natt",
        vis(S) {
          const sp = S.spill;
          return `
            <div class="vu-natthimmel">
              <span class="vu-maane" aria-hidden="true">🌙</span>
              <h1 id="skjerm-tittel">Natta faller på</h1>
              <p class="vu-fortelling">${esc(linje(sp, "enNatt", sp.runde))}</p>
            </div>
            ${nattSteg(sp, sp.runde, "Mobilen går én runde rundt bordet. Ingen titter – og nynningen skjuler alle lyder.", "Åpne øynene, se rollen din og gjør det mobilen sier – helt stille.", "Alle gjør noe i natt, så ingen kan gjette roller ut fra tiden.")}
            <p class="hjelp">Natta tar ${omtrentTid(sp.n * EN_SEK)} og starter hos <b>${esc(R.navn(sp.tur.rekke[0]))}</b>.</p>
            ${R.ui.dokk(R.ui.knapp("Start natta", "start-natt"), R.ui.lenkerad(R.ui.lenke("Avslutt", "avslutt")))}`;
        },
        inn: () => ul(),
      },

      // The one pass: "give the phone to X" → X sees the role and picks → a short private answer.
      "en-natt": {
        tittel: (S) => rundeTekst(S.spill),
        tilbake: "hjem",
        stemning: "natt",
        vis(S) {
          const sp = S.spill;
          const t = sp.tur;
          const meg = t.rekke[t.pos];
          if (t.steg === "gi") return giSteg(sp);
          if (t.steg === "valg") {
            const r = EN_ROLLER[sp.roller[meg]];
            const brak = sp.roller[meg] === "brak";
            const m = t.markert;
            const klar = m.length === (brak ? 2 : 1);
            const knapp = !klar
              ? R.ui.knapp(brak ? (m.length ? "Trykk på ett navn til" : "Trykk på to navn") : "Trykk på et navn", "en-velg", { av: true })
              : brak
                ? R.ui.knapp("", "en-velg", { tekstHtml: toLinjer("Bytt om rollene", `${R.navn(m[0])} og ${R.navn(m[1])}`) })
                : R.ui.knapp(`${r.verb} ${R.navn(m[0])}`, "en-velg");
            // (the heading is only the name here too; the role is ordinary text below it)
            return `
              ${prikker(sp)}
              <div class="vu-oppdrag vu-en-oppdrag">
                <div class="vu-hvem">${R.avatar(meg)}<div><h1 id="skjerm-tittel">${esc(R.navn(meg))}</h1> <span>· du er</span></div></div>
                <p class="vu-rolle"><span aria-hidden="true">${r.ikon}</span> ${esc(r.navn)}</p>
                <p class="vu-sporsmal">${esc(r.sporsmal)}</p>
                <p>${sp.roller[meg] === "varulv" ? enUlveInfo(sp, meg) : esc(r.info)}</p>
              </div>
              ${enValg(sp, meg)}
              ${R.ui.dokk(knapp)}`;
          }
          return svarSteg(sp, enSvar(sp, meg));
        },
        etter: nattEtter,
      },

      "en-morgen": {
        tittel: (S) => rundeTekst(S.spill),
        tilbake: "hjem",
        stemning: "morgen",
        vis(S) {
          const sp = S.spill;
          return `
            <div class="vu-sol" aria-hidden="true">☀️</div>
            <div class="vu-mottaker">
              <h1 id="skjerm-tittel">Alle åpner øynene!</h1>
              <p class="vu-fortelling">${esc(linje(sp, "enMorgen", sp.runde))}</p>
            </div>
            <p class="hjelp">Si det høyt: <b>«God morgen, landsby!»</b> Legg mobilen midt på bordet. Dere har ${tallord(TALETID)} minutter på å finne en varulv.</p>
            ${R.ui.dokk(R.ui.knapp("Start praten", "en-start-dag"))}`;
        },
        inn: () => hane(),
      },

      "en-dag": {
        tittel: (S) => rundeTekst(S.spill),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const k = sp.klokke;
          return `
            <div class="vu-mottaker">
              <h1 id="skjerm-tittel">Hvem er varulv?</h1>
              <p class="vu-fortelling">${esc(linje(sp, "enDag", sp.runde))}</p>
            </div>
            ${R.ui.timer({
              id: "klokke",
              sekunder: Math.ceil(igjenMs(k) / 1000),
              kontrollHtml: `${k.ute ? '<span class="vu-tid-ute"><span aria-hidden="true">⏰</span> Tiden er ute!</span>' : '<span class="etikett">Tid til å snakke</span>'}
                <button class="knapp-2 liten" data-h="pause" data-timer-pause>${k.gaar ? "Pause" : "Fortsett"}</button>
                ${R.ui.knapp2("+1 min", "pluss-min", { variant: "liten" })}`,
            })}
            <section class="seksjon">
              <h2>Rollene i natt</h2>
              <p class="vu-stokk">${stokkTekst(sp.roller, EN_ROLLER, EN_REKKE)}</p>
              <p class="hjelp vu-venstre">Landsbyen vinner hvis en varulv blir pekt ut. Husk: roller kan ha byttet plass i natt – kanskje din også.</p>
            </section>
            ${R.ui.dokk(R.ui.knapp("Stem nå", "en-til-stemme", { variant: "rosa" }), R.ui.lenkerad(R.ui.lenke("Glemt hva du så?", "se-igjen"), R.ui.lenke("Avslutt", "avslutt")))}`;
        },
        inn: (S) => startKlokke(S),
        ut: (S) => stoppKlokke(S),
        etter() {
          const t = R.timer("klokke");
          if (t) t.tegn();
        },
      },

      // One vote: everybody points at once, and the one who holds the phone taps who got the most
      // fingers – several on a tie, or nobody if nobody got more than one.
      "en-stemme": {
        tittel: (S) => rundeTekst(S.spill),
        tilbake: "en-dag",
        vis(S) {
          const sp = S.spill;
          const m = sp.pektValg;
          const knapp = !m.length ? "Trykk på den som fikk flest" : m.length > 2 ? `${m.length} ble pekt ut` : `${R.ramsOpp(m.map(R.navn))} ble pekt ut`;
          return `
            <h1 id="skjerm-tittel">Pek ut en varulv</h1>
            <p class="ingress">Tell ned og pek samtidig på den du tror er varulv. Landsbyen vinner hvis en varulv er blant dem som får flest fingrer.</p>
            ${R.ui.knapp2("3 · 2 · 1 – Pek!", "pek", { ikon: "👉" })}
            <section class="seksjon">
              <h2>Hvem fikk flest fingrer?</h2>
              ${R.ui.velgere("en-pekt", range(sp.n), m)}
              <p class="hjelp">Står det likt, trykker du på alle som fikk flest.</p>
            </section>
            ${R.ui.lenke("Ingen fikk mer enn én finger", "en-ingen")}
            ${R.ui.dokk(R.ui.knapp(knapp, "en-avslor", { variant: "rosa", av: !m.length }))}`;
        },
      },

      // The reveal, with the roles as they ended: who was pointed out, who wins, and the night as
      // a little story. The vote can be taken back («Angre») until the players move on.
      "en-avsloring": {
        tittel: (S) => rundeTekst(S.spill),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const pekt = sp.pekt;
          const storrelse = pekt.length === 1 ? "gigant" : "stor";
          if (!sp.vist) {
            const hvem = pekt.length > 3 ? `${pekt.length} spillere` : R.ramsOpp(pekt.map(R.navn));
            return `
              <div class="vu-spotlys spenning">
                ${
                  pekt.length
                    ? `<div class="vu-pekte">${pekt.map((i) => `<span class="vu-skjelv">${R.avatar(i, storrelse)}</span>`).join("")}</div>`
                    : '<div class="vu-stor-ikon" aria-hidden="true">🤷</div>'
                }
                <h1 id="skjerm-tittel">${pekt.length ? `${esc(hvem)} ble pekt ut …` : "Ingen ble pekt ut …"}</h1>
              </div>`;
          }
          const v = enVinner(sp);
          const ulver = range(sp.n).filter((i) => sp.slutt[i] === "varulv");
          const tatt = pekt.filter((i) => sp.slutt[i] === "varulv");
          const forklaring =
            v === "landsby"
              ? `${R.ramsOpp(tatt.map(R.navn))} endte natta som varulv – og ble pekt ut.`
              : `${pekt.length ? "Ingen varulv ble pekt ut." : "Ingen ble pekt ut."} ${ulver.length > 1 ? "Varulvene var" : "Varulven var"} ${R.ramsOpp(ulver.map(R.navn))}.`;
          const hvemVarHvem = range(sp.n)
            .map((i) => {
              const a = EN_ROLLER[sp.roller[i]];
              const b = EN_ROLLER[sp.slutt[i]];
              const roller = a === b ? `${a.ikon} ${esc(a.navn)}` : `${a.ikon} ${esc(a.navn)} <span aria-hidden="true">→</span><span class="vh"> ble til </span> ${b.ikon} ${esc(b.navn)}`;
              return `<li class="${sp.slutt[i] === "varulv" ? "ulv" : ""}">${R.avatar(i)}<span><b>${esc(R.navn(i))}</b><small>${roller}</small></span></li>`;
            })
            .join("");
          return `
            <div class="vu-spotlys">
              ${
                pekt.length
                  ? `<ul class="vu-pekte${pekt.length > 1 ? " flere" : ""}">${pekt
                      .map((i) => `<li>${R.avatar(i, storrelse)}<b>${esc(R.navn(i))}</b><span class="stempel ${sp.slutt[i] === "varulv" ? "mynte" : ""}">${esc(EN_ROLLER[sp.slutt[i]].navn)}</span></li>`)
                      .join("")}</ul>`
                  : '<div class="vu-stor-ikon" aria-hidden="true">🐺</div>'
              }
              <h1 id="skjerm-tittel" class="vu-dom ${v === "landsby" ? "mynte" : "rosa"}">${v === "landsby" ? "Landsbyen vinner runden!" : "Varulvene vinner runden!"}</h1>
              <p class="ingress midt">${esc(forklaring)}</p>
            </div>
            <section class="seksjon">
              <h2>Hvem var hvem?</h2>
              <ul class="vu-rolleliste">${hvemVarHvem}</ul>
            </section>
            <section class="seksjon">
              <h2>Slik gikk natta</h2>
              <ol class="vu-historikk">${enHistorie(sp)}</ol>
            </section>
            <section class="seksjon">
              <h2>Stillingen</h2>
              ${R.ui.poengliste(range(sp.n).map((i) => ({ i, poeng: sp.poeng[i] + (!sp.talt && enVant(sp, i) ? 1 : 0), pluss: enVant(sp, i) ? 1 : 0 })))}
            </section>
            ${R.ui.dokk(
              R.ui.knapp(sisteRunde(sp) ? "Til kåringen" : "Neste runde", "en-neste"),
              R.ui.lenkerad(R.ui.lenke("Angre", "en-angre"), sisteRunde(sp) ? "" : R.ui.lenke("Avslutt", "avslutt")),
            )}`;
        },
        inn(S) {
          const sp = S.spill;
          if (sp.vist) return;
          R.lyd.trommevirvel(R.rolig() ? 0.6 : 2);
          dramatisk(2150, () => (sp.vist = true), () => (enVinner(sp) === "landsby" ? R.lyd.fanfare() : ul()));
        },
      },

      slutt: {
        tittel: "Kåringen",
        tilbake: "hjem",
        stemning: null,
        vis(S) {
          const sp = S.spill;
          if (sp.modus === "en") return enKaring(S);
          const ulvVant = sp.vinner === "ulv";
          const roller = range(sp.n)
            .map((i) => {
              const r = rolle(sp, i);
              return `<li class="${erUlv(sp, i) ? "ulv" : ""}${sp.levende[i] ? "" : " dod"}">${R.avatar(i)}<span><b>${esc(R.navn(i))}</b><small>${r.ikon} ${esc(r.navn)} · ${esc(statusFor(sp, i))}</small></span></li>`;
            })
            .join("");
          const stat = statistikk(sp);
          const spilt = spilteNetter(sp);
          // The mascot is the wolf: it cheers when the pack wins and droops when the village does.
          const banner = sp.vinner
            ? R.ui.banner({
                klasse: ulvVant ? "rosa" : "mynte",
                stemning: ulvVant ? "jubel" : "lei",
                etikett: `Etter ${netter(spilt)}`,
                tittel: ulvVant ? "Varulvene vinner!" : "Landsbyen vinner!",
                tekst: linje(sp, ulvVant ? "ulvVant" : "landsbyVant", sp.natt),
              })
            : R.ui.banner({
                stemning: "",
                etikett: spilt ? `Avsluttet etter ${netter(spilt)}` : "Avsluttet før første natt",
                tittel: "Ingen vant denne gangen",
                tekst: "Spillet ble avsluttet før noen vant. Her er fasiten.",
              });
          return `
            ${banner}
            ${stillingHtml(S)}
            <section class="seksjon">
              <h2>Hvem var hvem?</h2>
              <ul class="vu-rolleliste">${roller}</ul>
            </section>
            ${prisHtml(stat)}
            ${
              sp.hendelser.length
                ? `<section class="seksjon">
              <h2>Slik gikk det</h2>
              <ol class="vu-historikk">${historikk(sp)}</ol>
            </section>`
                : ""
            }
            ${sp.vinner ? R.ui.knapp2("Del resultatet", "del") : ""}
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
          } else if (sp.vinner === "landsby" || (sp.modus === "en" && sp.spilt > 0)) {
            R.lyd.fanfare();
            R.konfetti();
          } else {
            R.lyd.pling(); // ended early: nothing to celebrate
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
        if (!pagar(S)) return;
        const en = sp.modus === "en";
        // Back in the middle of a night: start at "give the phone to …", never at a secret.
        if (sp.tur) Object.assign(sp.tur, { steg: "gi", markert: en ? [] : null });
        R.gaTil((en ? EN_SKJERMER : KLASSISKE).includes(sp.skjerm) ? sp.skjerm : en ? "en-natt-start" : "roller");
      },

      // Setup
      // The way of playing. The list of players follows what the new way allows; going straight
      // back gives the list it had (unless players were added or removed in between).
      modus(el, e, S) {
        const o = S.oppsett;
        const ny = el.dataset.v;
        if (!MODUS[ny] || ny === o.modus) return;
        const husket = o.bytte && o.bytte.modus === ny ? o.bytte.antall : S.antall;
        o.bytte = { modus: o.modus, antall: S.antall };
        o.modus = ny;
        S.antall = R.klamp(husket, MODUS[ny].min, MODUS[ny].maks);
        o.ulver = null;
        R.vis();
        R.si(`${ny === "en" ? "Én natt" : "Klassisk"}. ${R.flertall(S.antall, "spiller", "spillere")}.`);
      },
      runder(el, e, S) {
        const r = Number(el.dataset.v);
        if (RUNDER.includes(r)) S.oppsett.runder = r;
        R.vis();
      },
      ulver(el, e, S) {
        S.oppsett.ulver = R.klamp(antallUlver(S) + Number(el.dataset.v), 1, maksUlver(S.antall));
        R.vis();
        R.si(R.flertall(S.oppsett.ulver, "varulv", "varulver")); // the stepper's own live region is re-created
      },
      rolle(el, e, S) {
        const r = el.dataset.v;
        if (!SPESIAL.includes(r)) return;
        S.oppsett[r] = !S.oppsett[r];
        R.vis();
      },
      fredelig(el, e, S) {
        S.oppsett.fredelig = !fredeligPa(S);
        R.vis();
      },
      tid(el, e, S) {
        S.oppsett.tid = Number(el.dataset.v);
        R.vis();
      },
      start: (el, e, S) => (S.oppsett.modus === "en" ? enNyttSpill(S) : nyttSpill(S)),

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

      // Night (the hand-over and «Ferdig» are the same in both ways of playing)
      "start-natt"(el, e, S) {
        S.spill.tur.port = Date.now();
        R.gaTil(nattSkjerm(S.spill));
      },
      "jeg-er"(el, e, S) {
        const sp = S.spill;
        const t = sp.tur;
        // The previous player's finger may still be on the screen: a tap right after the hand-over
        // must never open the next player's secret.
        if (t.steg !== "gi" || (e && e.isTrusted && Date.now() - (t.port || 0) < PORT_MS)) return;
        t.markert = sp.modus === "en" ? [] : null;
        t.steg = sp.valg[t.rekke[t.pos]] != null ? "svar" : "valg";
        R.gaTil(nattSkjerm(sp));
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
        const sp = S.spill;
        const t = sp.tur;
        if (t.steg !== "svar" || Date.now() < t.klar) return;
        if (t.pos < t.rekke.length - 1) {
          t.pos += 1;
          t.steg = "gi";
          t.port = Date.now();
          R.gaTil(nattSkjerm(sp));
        } else if (sp.modus === "en") {
          // Dawn: now the swaps are carried out.
          sp.slutt = sluttroller(sp);
          sp.tur = null;
          R.gaTil("en-morgen");
        } else {
          avsluttNatt(S);
        }
      },

      // «Én natt»: the night pick. A tap only marks; the dock confirms. The troublemaker marks two
      // (a tap on a marked name takes it away, a third name replaces the oldest).
      "en-marker"(el, e, S) {
        const sp = S.spill;
        const t = sp.tur;
        const meg = t.rekke[t.pos];
        const i = Number(el.dataset.v);
        if (t.steg !== "valg" || !erIndeks(i, sp.n) || i === meg) return;
        if (sp.roller[meg] === "varulv" && sp.roller[i] === "varulv") return;
        if (sp.roller[meg] === "brak") t.markert = t.markert.includes(i) ? t.markert.filter((x) => x !== i) : [...t.markert, i].slice(-2);
        else t.markert = [i];
        R.vis();
      },
      "en-velg"(el, e, S) {
        const sp = S.spill;
        const t = sp.tur;
        const meg = t.rekke[t.pos];
        const brak = sp.roller[meg] === "brak";
        if (t.steg !== "valg" || t.markert.length !== (brak ? 2 : 1)) return;
        sp.valg[meg] = brak ? t.markert.slice() : t.markert[0];
        t.markert = [];
        t.steg = "svar";
        t.klar = Date.now() + VENT_MS;
        R.vibrer(15);
        R.gaTil("en-natt");
      },

      // «Én natt»: the day, the vote and the reveal
      "en-start-dag"(el, e, S) {
        S.spill.klokke = { total: TALETID * 60, igjen: TALETID * 60000, slutt: null, gaar: true };
        R.gaTil("en-dag");
      },
      "en-til-stemme"(el, e, S) {
        S.spill.pektValg = [];
        R.gaTil("en-stemme");
      },
      "en-pekt"(el, e, S) {
        const sp = S.spill;
        const i = Number(el.dataset.v);
        if (!erIndeks(i, sp.n)) return;
        sp.pektValg = sp.pektValg.includes(i) ? sp.pektValg.filter((x) => x !== i) : [...sp.pektValg, i];
        R.vis();
      },
      "en-avslor"(el, e, S) {
        const sp = S.spill;
        if (!sp.pektValg.length) return;
        sp.pekt = sp.pektValg.slice().sort((a, b) => a - b);
        sp.vist = false;
        R.gaTil("en-avsloring");
      },
      async "en-ingen"(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreft("Ingen ble pekt ut?", "Fikk ingen mer enn én finger, slipper varulvene unna.", "Ja, ingen", "Stem på nytt")) || !fortsatt()) return;
        const sp = S.spill;
        sp.pektValg = [];
        sp.pekt = [];
        sp.vist = false;
        R.gaTil("en-avsloring");
      },
      // The vote was tapped in wrong: back to it. Nothing is counted until the players move on.
      "en-angre"(el, e, S) {
        const sp = S.spill;
        if (sp.talt) return;
        sp.pekt = null;
        sp.vist = false;
        R.gaTil("en-stemme");
      },
      "en-neste"(el, e, S) {
        const sp = S.spill;
        if (!sp.vist || !sp.pekt) return;
        enTell(S);
        if (sisteRunde(sp)) tilKaring(S);
        else enNyRunde(S);
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
        fokuserTittel();
        if (m.offer != null) {
          R.lyd.bom();
          R.vibrer([200, 80, 300]);
        } else {
          R.lyd.riktig();
        }
      },
      "til-jeger": () => R.gaTil("jeger"),
      "til-slutt"(el, e, S) {
        const v = vinner(S.spill);
        if (!v) return;
        S.spill.vinner = v;
        tilKaring(S);
      },
      // «Avslutt»: to «Kåringen» with the result so far. The classic game then has no winner (the
      // answer key is shown); «Én natt» keeps the points of the rounds that were played to the end.
      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!pagar(S)) return;
        const en = sp.modus === "en";
        const tekst = !en
          ? "Dere går rett til kåringen og får se hvem som var hvem. Ingen vinner."
          : S.skjerm === "en-avsloring"
            ? "Dere går rett til kåringen med poengene så langt."
            : sp.spilt
              ? "Dere går rett til kåringen med poengene så langt. Runden dere holder på med, teller ikke."
              : "Ingen runder er spilt ferdig, så det blir en kåring uten poeng.";
        const fortsatt = R.vakt();
        const ja = await R.bekreft("Avslutte spillet?", tekst, "Avslutt", "Spill videre");
        if (!ja || !fortsatt() || !pagar(S)) return;
        if (en) enTell(S); // a round that has been revealed counts
        sp.avbrutt = true;
        tilKaring(S);
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
        ut(sp, j.mal);
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
          R.gaTil(S.skjerm);
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
        R.si("Ett minutt til"); // (the clock shows it; this is for screen readers)
      },
      // «Glemt rollen din?» / «Glemt hva du så?»: one player's own card again, behind a hold.
      async "se-igjen"(el, e, S) {
        const sp = S.spill;
        const en = sp.modus === "en";
        const fortsatt = R.vakt();
        const i = await R.velgIArk(
          en ? "Hvem vil se natta si igjen?" : "Hvem vil se rollen sin?",
          (en ? range(sp.n) : levende(sp)).map((n) => ({ v: n, tekst: R.navn(n) })),
        );
        if (!fortsatt()) return;
        if (i == null) return;
        R.ark(`
          <h2 id="ark-tittel">${en ? "Natta til" : "Rollen til"} ${esc(R.navn(i))}</h2>
          ${R.ui.mappe({ id: "r" + i, etikett: en ? "Hemmelig" : "Hemmelig rolle", tekst: HOLD })}
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
        ut(sp, i);
        sp.utkastet = i;
        sp.utVist = false;
        sp.hendelser.push({ type: "dag", nr: sp.dag, ut: i });
        if (sp.roller[i] === "jeger") sp.jeger = { av: i, valgt: null, mal: null, vist: false, etter: "natt" };
        R.gaTil("utkastet");
      },
      async "ingen-ut"(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreft("Ingen kastes ut?", "Da går landsbyen rett til natta.", "Ja, ingen i dag", "Stem på nytt")) || !fortsatt()) return;
        const sp = S.spill;
        sp.hendelser.push({ type: "dag", nr: sp.dag, ut: null });
        sp.ingenUt = true; // «Natta faller på» opens with it
        nyNatt(S);
      },

      // End
      igjen: (el, e, S) => (S.oppsett.modus === "en" ? enNyttSpill(S) : nyttSpill(S)),
      del(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.ferdig) return;
        const tekst = sp.modus === "en" ? (enVinnere(sp).length ? enDelTekst(S) : "") : sp.vinner ? delTekst(S) : "";
        if (tekst) R.del("Varulven", tekst, location.origin + "/varulven/");
      },
    }),
  };

  // Every screen sets the page's mood (night / morning / day), and game screens remember
  // themselves so "Fortsett" on the home screen returns to the right place.
  Object.keys(DEF.skjermer).forEach((navn) => {
    const sk = DEF.skjermer[navn];
    const etter = sk.etter;
    sk.etter = (S, rot) => {
      // The result screens: the wolves' night, the village's morning – or neither (ended early,
      // or not revealed yet). A session of «Én natt» ends in the morning light.
      const sp = S.spill;
      let v = null;
      if (sp && navn === "slutt") v = sp.modus === "en" ? (sp.spilt > 0 ? "landsby" : null) : sp.vinner;
      if (sp && navn === "en-avsloring" && sp.vist && sp.pekt && sp.slutt) v = enVinner(sp);
      stemning(v === "ulv" ? "natt" : v === "landsby" ? "morgen" : sk.stemning || "");
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
