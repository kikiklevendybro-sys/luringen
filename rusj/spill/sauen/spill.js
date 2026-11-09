/* Sauen — "Tenk som flokken": 3–12 players on one phone. A question ("En frukt som er gul"),
   everyone types one answer in secret, the app groups equal answers (also banan/bananer and small
   a doubled letter), the players merge answers that mean the same, and a reveal shows who thought alike.
   Everyone in the single biggest group scores. Whoever stands completely alone gets the black
   sheep — and while you hold it, you can't win. First to 8 points without it wins. */
(function () {
  "use strict";

  const R = window.Rusj;
  const esc = R.esc;
  const D = window.RUSJ_DATA.sporsmal;

  // =====================================================================================
  // Answer matching and scoring — pure functions, exposed as window.SauenSvar for the tests.
  // =====================================================================================

  // Irregular noun forms → base form (the regular ones are handled by ENDELSER).
  const UREGELRETT = {
    menn: "mann", mennene: "mann", bøker: "bok", bøkene: "bok", føtter: "fot", føttene: "fot",
    hender: "hånd", hendene: "hånd", tenner: "tann", tennene: "tann", netter: "natt", nettene: "natt",
    røtter: "rot", røttene: "rot", bønder: "bonde", bøndene: "bonde", kyr: "ku", kyrne: "ku",
    gjess: "gås", gjessene: "gås", tær: "tå", tærne: "tå", knær: "kne", knærne: "kne", trær: "tre",
    trærne: "tre", strender: "strand", strendene: "strand", øyne: "øye", øynene: "øye", brødre: "bror",
    brødrene: "bror", døtre: "datter", døtrene: "datter", mødre: "mor", mødrene: "mor", fedre: "far",
    fedrene: "far", søstre: "søster", søstrene: "søster", ender: "and", endene: "and", stenger: "stang",
    tenger: "tang",
  };
  // Endings of definite and plural nouns (bilen, biler, bilene, huset, jenta), adjectives (rødt,
  // røde, blått) and verbs (kaster, kastet). Longest first. Past tense -te/-de is left out on
  // purpose: it would make bilde match bil and matte match mat.
  const ENDELSER = ["ene", "ane", "er", "ar", "en", "et", "tt", "a", "e", "t", "r", "n"];

  // The key a single word is compared by: lower case, accents and punctuation gone, no spaces.
  const nokkel = (tekst) => R.normaliser(tekst).replace(/ /g, "");

  // Possible base forms of one key: the key itself, an irregular base and the key minus one ending.
  function stammer(ord) {
    const ut = new Set([ord]);
    if (UREGELRETT[ord]) ut.add(UREGELRETT[ord]);
    // støvel → støvler, sykkel → sykler, finger → fingre: the e before a final l or r drops out.
    const el = /^(.*[^aeiouyæøå])e([lr])$/.exec(ord);
    if (el) {
      const uten = el[1] + el[2];
      ut.add(uten);
      ut.add(uten.replace(/([^aeiouyæøå])\1([lr])$/, "$1$2"));
    }
    for (const e of ENDELSER) {
      if (!ord.endsWith(e) || ord.length - e.length < 2) continue;
      const rest = ord.slice(0, -e.length);
      // A one-letter ending never splits a double letter (katt is not kat + t, mann is not man + n),
      // and leaves at least three letters unless it's -a (kua → ku): kur is not ku + r.
      if (e.length === 1 && (rest.endsWith(e) || (rest.length < 3 && e !== "a"))) continue;
      // -tt only after a short vowel word: blå → blått, ny → nytt (not kassett → kasse).
      if (e === "tt" && (rest.length > 3 || !/[aeiouyæøå]$/.test(rest))) continue;
      ut.add(rest);
      // dam → dammen, rom → rommet: the m is doubled before an ending.
      if (rest.endsWith("mm") && e.length >= 2) ut.add(rest.slice(0, -1));
      // grønn → grønt, trygg → trygt: the double letter is dropped before the t.
      if (e === "t" && /[ng]$/.test(rest) && !/(nn|gg)$/.test(rest)) ut.add(rest + rest.slice(-1));
    }
    return ut;
  }

  // The same word with one letter doubled or not (bannan/banan, kafe/kaffe): the most common slip
  // on a phone keyboard. Wider typo rules made real words match (Island/Irland, bjørn/bjørk).
  function dobbel(a, b) {
    if (Math.abs(a.length - b.length) !== 1) return false;
    const [kort, lang] = a.length < b.length ? [a, b] : [b, a];
    for (let i = 0; i < lang.length - 1; i++) {
      if (lang[i] === lang[i + 1] && lang.slice(0, i) + lang.slice(i + 1) === kort) return true;
    }
    return false;
  }

  // Two single-word keys mean the same: equal, a shared base form (banan/bananer, katt/kattene,
  // mann/menn) or the same word with one letter doubled (banan/bannan).
  function likeOrd(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    const sa = stammer(a);
    for (const s of stammer(b)) if (sa.has(s) && (s.length >= 3 || s === a || s === b)) return true;
    return Math.min(a.length, b.length) >= 4 && dobbel(a, b);
  }

  // The words of an answer, without a leading article: "en banan" → ["banan"].
  const ARTIKLER = new Set(["en", "ei", "et", "den", "det", "de", "noen"]);
  function ordene(tekst) {
    const ord = R.normaliser(tekst).split(" ").filter(Boolean);
    return ord.length > 1 && ARTIKLER.has(ord[0]) ? ord.slice(1) : ord;
  }

  // Two answers mean the same: the same word(s) in some form, also with or without spaces
  // ("is krem" / "iskrem") and with or without an article ("en banan" / "banan").
  function likeSvar(a, b) {
    const oa = ordene(a);
    const ob = ordene(b);
    if (!oa.length || !ob.length) return false;
    if (likeOrd(oa.join(""), ob.join(""))) return true;
    return oa.length === ob.length && oa.length > 1 && oa.every((o, i) => likeOrd(o, ob[i]));
  }

  // Groups typed answers. Answers that are exactly the same after normalising form one unit that
  // can never be split; units that count as the same are grouped. → { enheter, grupper }
  // enheter: arrays of answer indexes · grupper: arrays of unit indexes.
  function grupperSvar(tekster) {
    const enheter = [];
    const nokler = [];
    tekster.forEach((t, n) => {
      const k = ordene(t).join(" ");
      const i = nokler.indexOf(k);
      if (i >= 0) enheter[i].push(n);
      else {
        nokler.push(k);
        enheter.push([n]);
      }
    });
    const mor = enheter.map((_, i) => i);
    const finn = (x) => (mor[x] === x ? x : (mor[x] = finn(mor[x])));
    for (let a = 0; a < enheter.length; a++) {
      for (let b = a + 1; b < enheter.length; b++) {
        if (likeSvar(tekster[enheter[a][0]], tekster[enheter[b][0]])) mor[finn(b)] = finn(a);
      }
    }
    const grupper = [];
    const plass = {};
    enheter.forEach((_, i) => {
      const rot = finn(i);
      if (plass[rot] == null) {
        plass[rot] = grupper.length;
        grupper.push([]);
      }
      grupper[plass[rot]].push(i);
    });
    return { enheter, grupper };
  }

  // Scores one round. grupper: arrays of player indexes; sau: who holds the black sheep (−1 = nobody).
  // The single biggest group is the flock (a tie for biggest → no flock). If exactly one player is
  // alone, the black sheep moves to them; otherwise it stays where it is.
  function regnUt(grupper, sau) {
    const storst = Math.max(0, ...grupper.map((g) => g.length));
    const topp = grupper.filter((g) => g.length === storst);
    const flokk = topp.length === 1 && storst > 1 ? topp[0].slice() : null;
    const alene = grupper.filter((g) => g.length === 1).map((g) => g[0]);
    return { flokk, uavgjort: !flokk && storst > 1, alene, sau: alene.length === 1 ? alene[0] : sau };
  }

  // Winners: everyone with at least `mal` points who doesn't hold the black sheep.
  const vinnere = (poeng, sau, mal) => poeng.map((p, i) => (p >= mal && i !== sau ? i : -1)).filter((i) => i >= 0);

  window.SauenSvar = { nokkel, stammer, likeOrd, ordene, likeSvar, grupperSvar, regnUt, vinnere };

  // =====================================================================================
  // Questions
  // =====================================================================================

  const ALLE = [];
  D.pakker.forEach((p) => p.sporsmal.forEach((t) => ALLE.push({ p: p.id, t })));
  const PAKKER = D.pakker;
  const pakke = (id) => PAKKER.find((p) => p.id === id);
  const ALLE_PAKKER = PAKKER.map((p) => p.id);
  const MAL = [5, 8, 12];
  const stokk = R.kortstokk("sporsmal", ALLE.length);

  function nyttSporsmal(S) {
    const valgt = new Set(S.oppsett.pakker);
    const forrige = S.spill.r ? S.spill.r.q : -1;
    let i = stokk.neste((n) => n !== forrige && valgt.has(ALLE[n].p));
    if (i < 0) i = stokk.neste((n) => n !== forrige);
    return i;
  }

  // =====================================================================================
  // Game flow
  // =====================================================================================

  let H; // the actions, so one can call another
  let opptatt = false; // a reveal animation is running
  let puls = -1; // the group that was just merged (animated once)
  let nyttKort = -1; // the group revealed last (slides in once)

  function nyRunde(S) {
    const sp = S.spill;
    const forste = (sp.start + sp.nr) % sp.antall;
    sp.nr += 1;
    sp.r = {
      q: -1,
      rekke: Array.from({ length: sp.antall }, (_, k) => (forste + k) % sp.antall),
      na: 0,
      svar: [],
      enheter: [],
      grupper: [],
      valgt: -1,
      angre: [],
      rekkefolge: [],
      vist: 0,
      avslort: false,
      res: null,
    };
    sp.r.q = nyttSporsmal(S);
  }

  // Players in a merge group, and the texts that group stands for.
  const spillereI = (r, g) => g.flatMap((u) => r.enheter[u].map((k) => r.svar[k].i));
  const forStor = (t) => (t ? t.charAt(0).toLocaleUpperCase("nb") + t.slice(1) : t);
  function teksterI(r, svarIdx) {
    // Distinct spellings (by normalised key), most common first.
    const telling = new Map();
    svarIdx.forEach((k) => {
      const t = r.svar[k].t.trim();
      const n = R.normaliser(t);
      const f = telling.get(n);
      if (f) f.antall += 1;
      else telling.set(n, { t, antall: 1 });
    });
    return Array.from(telling.values())
      .sort((a, b) => b.antall - a.antall || a.t.length - b.t.length)
      .map((f) => forStor(f.t));
  }
  const gruppeSvar = (r, g) => g.flatMap((u) => r.enheter[u]);
  const storrelse = (r, n) => gruppeSvar(r, r.grupper[n]).length;
  // «A», «A og B», «A, B og C» (the kit's shared wording)
  const liste = (deler) => R.ramsOpp(deler);

  const pagar = (S) => !!(S.spill && !S.spill.ferdig);

  // "Fortsett" never goes straight to the answer screen, only to its gate (after a reload the
  // screen's gjenoppta does the same).
  const porten = (skjerm) => (skjerm === "skriv" ? "gi" : skjerm || "sporsmal");

  // ---------- Markup helpers ----------

  const svartSau = (klasse) => R.figur("sauen", "sau-merke " + (klasse || ""), { svart: true });
  const medSau = (S, i, storrelse) =>
    `<span class="sau-ramme ${storrelse || ""}">${R.avatar(i, storrelse)}${S.spill && S.spill.sau === i ? svartSau(storrelse) : ""}</span>`;

  function poengtavle(S, pluss) {
    const sp = S.spill;
    const rekke = Array.from({ length: sp.antall }, (_, i) => i).sort((a, b) => sp.poeng[b] - sp.poeng[a] || a - b);
    const topp = Math.max(...sp.poeng);
    return `<ol class="sau-tavle">${rekke
      .map((i) => {
        const p = sp.poeng[i];
        const pips = Array.from({ length: sp.mal }, (_, n) => `<i class="${n < p ? "fylt" : ""}"></i>`).join("");
        return `<li class="${sp.sau === i ? "har-sau" : ""} ${p === topp && p > 0 ? "leder" : ""}">
          ${medSau(S, i)}
          <span class="sau-tavle-navn"><b>${esc(R.navn(i))}</b>${sp.sau === i ? '<span class="vh">, har den svarte sauen</span>' : ""}<span class="sau-tavle-linje"><span class="sau-pips" aria-hidden="true">${pips}</span>${
            (pluss || []).includes(i) ? '<span class="pluss">+1</span>' : ""
          }</span></span>
          <span class="sum">${p}</span>
        </li>`;
      })
      .join("")}</ol>`;
  }

  // One group of answers as a card; n = index in r.grupper. o: { spot (the newest during the reveal),
  // inn (slide in), ferdig, flokk, uavgjort, svart, knapp (tap to merge, ✂ to split) }.
  function gruppekort(S, n, o) {
    const r = S.spill.r;
    const svar = gruppeSvar(r, r.grupper[n]);
    const spillere = svar.map((k) => r.svar[k].i).sort((a, b) => a - b);
    const tekster = teksterI(r, svar);
    const kanDeles = o.knapp && r.grupper[n].length > 1;
    const klasse = [
      "sau-gruppe",
      spillere.length === 1 ? "alene" : "",
      o.flokk ? "flokk" : "",
      o.uavgjort ? "uavgjort" : "",
      o.svart ? "svart" : "",
      o.spot && !o.svart && !o.flokk ? "spot" : "",
      o.inn ? "inn" : "",
      o.knapp && r.valgt === n ? "valgt" : "",
      o.knapp && n === puls ? "puls" : "",
      kanDeles ? "kan-deles" : "",
    ].filter(Boolean);
    const merke = o.flokk
      ? '<span class="sau-gruppe-stempel">Flokken!</span>'
      : o.uavgjort
        ? '<span class="sau-gruppe-stempel lampe">Uavgjort</span>'
        : o.svart
          ? `<span class="sau-gruppe-svartsau">${R.figur("sauen", "", { svart: true })}Svart sau!</span>`
          : "";
    const antall = `${spillere.length} ${spillere.length === 1 ? "spiller" : "spillere"}`;
    return `<li class="${klasse.join(" ")}">
      <span class="sau-gruppe-topp">
        <b class="sau-gruppe-svar">${esc(tekster[0])}</b>
        ${spillere.length === 1 && o.ferdig && !o.svart ? '<span class="sau-gruppe-alene">Alene</span>' : ""}
        <span class="sau-gruppe-antall" aria-label="${antall}">${spillere.length}</span>
      </span>
      ${tekster.length > 1 ? `<span class="sau-varianter">${tekster.slice(1).map(esc).join(" · ")}</span>` : ""}
      <span class="sau-gruppe-hvem">${spillere.map((i) => `<span class="sau-hvem">${R.avatar(i)}<span>${esc(R.navn(i))}</span></span>`).join("")}</span>
      ${merke}
      ${o.knapp ? `<button class="sau-gruppeknapp" data-h="velg" data-v="${n}" aria-pressed="${r.valgt === n}" aria-label="«${esc(tekster[0])}», ${antall}"></button>` : ""}
      ${kanDeles ? `<button class="sau-del" data-h="del" data-v="${n}" aria-label="Del opp «${esc(tekster.join(", "))}»"><span aria-hidden="true">✂</span></button>` : ""}
    </li>`;
  }

  function prikker(S) {
    const r = S.spill.r;
    return R.ui.fremdrift(S.spill.antall, r.rekke[r.na], r.rekke.slice(0, r.na));
  }

  // ---------- The game ----------

  R.start({
    id: "sauen",
    versjon: 1,
    pagar, // true while a game runs: the front page's «Fortsett» badge and the wake lock use it

    tilstand: () => ({
      antall: 4,
      oppsett: { pakker: ALLE_PAKKER.slice(), mal: 8 },
      spill: null,
    }),

    lastet(S) {
      const o = S.oppsett && typeof S.oppsett === "object" ? S.oppsett : (S.oppsett = {});
      o.pakker = (Array.isArray(o.pakker) ? o.pakker : ALLE_PAKKER).filter((id) => pakke(id));
      if (!MAL.includes(o.mal)) o.mal = 8;
      const sp = S.spill;
      const gyldig =
        sp &&
        sp.antall >= 3 &&
        [sp.poeng, sp.iFlokk, sp.alene].every((a) => Array.isArray(a) && a.length === sp.antall) &&
        sp.r &&
        ALLE[sp.r.q] &&
        Array.isArray(sp.r.svar) &&
        Array.isArray(sp.r.rekke) &&
        Array.isArray(sp.r.rekkefolge) &&
        typeof sp.r.vist === "number";
      if (!gyldig) S.spill = null;
      if (!S.spill && !["hjem", "oppsett", null, undefined].includes(S.skjerm)) S.skjerm = "hjem";
    },

    regler: {
      intro: "Svar det samme som flest mulig – men ikke bli den eneste som tenker annerledes.",
      steg: [
        ["Les spørsmålet", "Alle ser spørsmålet sammen, for eksempel «En frukt som er gul»."],
        ["Svar i hemmelighet", "Send mobilen rundt. Alle skriver ett svar uten at de andre ser."],
        ["Følg flokken", "Alle i den største gruppen får ett poeng. Står du helt alene, får du den svarte sauen."],
      ],
      tips: [
        "Har du den svarte sauen, kan du ikke vinne. Den går videre neste gang én person står alene.",
        "Er de største gruppene like store, får ingen poeng.",
        "Etter avsløringen kan dere slå sammen svar som betyr det samme, som «Sitron» og «Gul sitron» – før poengene deles ut.",
        "Den første som når målet – vanligvis 8 poeng – uten den svarte sauen, vinner.",
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis: (S) => `
          <div class="spillhjem">
            <div class="sau-duo">${R.figur("sauen")}${R.figur("sauen", "sau-svart", { svart: true })}</div>
            <h1 id="skjerm-tittel">Sauen</h1>
            <span class="undertittel">Tenk som flokken</span>
            <p class="slagord">Svar det samme som de andre.<br><em>Ikke bli den svarte sauen!</em></p>
          </div>
          <div class="hjem-knapper">${R.ui.startKnapper({
            pagar: pagar(S),
            fortsettTekst: pagar(S) ? `Fortsett · runde ${S.spill.nr}` : "",
            ekstraHtml: R.ui.lenke("Slik spiller du", "regler"),
          })}</div>
          <ul class="merker" aria-label="Om spillet">
            <li><b>3–12</b> spillere</li><li><b>${ALLE.length}</b> spørsmål</li><li><b>1</b> svart sau</li>
          </ul>`,
      },

      oppsett: {
        tittel: "Nytt spill",
        tilbake: "hjem",
        vis: (S) => {
          const n = ALLE.filter((q) => S.oppsett.pakker.includes(q.p)).length;
          return `
          <h1 id="skjerm-tittel">Gjør klart</h1>
          ${R.ui.spillere({ min: 3, max: 12, hjelp: "Alle svarer på hvert spørsmål." })}
          <section class="seksjon">
            <div class="seksjon-hode"><h2>Spørsmål</h2><span class="tall">${n} spørsmål</span></div>
            ${R.ui.brikker(
              "pakke",
              PAKKER.map((p) => ({ v: p.id, tekst: p.navn, ikon: p.ikon })),
              S.oppsett.pakker,
              { alle: true, etikett: "Spørsmålspakker" },
            )}
          </section>
          <section class="seksjon">
            <div class="seksjon-hode"><h2>Først til</h2></div>
            ${R.ui.seg(
              "mal",
              MAL.map((m) => [String(m), `${m} poeng`]),
              String(S.oppsett.mal),
              { etikett: "Poeng for å vinne" },
            )}
          </section>
          ${R.ui.dokk(R.ui.knapp(n ? "Start" : "Velg minst én pakke", "start", { av: !n }))}`;
        },
      },

      sporsmal: {
        tittel: (S) => `Runde ${S.spill.nr}`,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const q = ALLE[sp.r.q];
          const p = pakke(q.p) || { ikon: "🐑", navn: "Spørsmål" };
          return `
            <div class="bunke"><article class="storkort sau-kort">
              <div class="storkort-topp"><span class="storkort-etikett">${esc(p.ikon + " " + p.navn)}</span><span class="storkort-nr">Først til ${sp.mal}</span></div>
              <h1 class="storkort-tekst ${q.t.length > 34 ? "lang" : ""}" id="skjerm-tittel">${esc(q.t)}</h1>
              <p class="storkort-fot">Alle svarer i hemmelighet. Svar det du tror de <em>andre</em> svarer!</p>
            </article></div>
            ${
              sp.sau >= 0
                ? `<p class="sau-holder">${medSau(S, sp.sau)}<span><b>${esc(R.navn(sp.sau))}</b> har den svarte sauen</span></p>`
                : ""
            }
            ${R.ui.dokk(
              R.ui.knapp("Send mobilen rundt", "send-rundt", { ikon: "📱" }),
              R.ui.lenkerad(R.ui.lenke("Bytt spørsmål", "bytt-sporsmal"), R.ui.lenke("Stillingen", "stilling"), R.ui.lenke("Avslutt", "avslutt")),
            )}`;
        },
        inn(S) {
          S.spill.skjerm = "sporsmal";
          R.holdVaken();
        },
      },

      gi: {
        tittel: (S) => `Svar ${S.spill.r.na + 1} av ${S.spill.antall}`,
        tilbake: "hjem",
        vis(S) {
          const r = S.spill.r;
          const i = r.rekke[r.na];
          return `${prikker(S)}${R.ui.giTil({ i, h: "jeg-er", merkeHtml: S.spill.sau === i ? R.figur("sauen", "", { svart: true, tittel: "Den svarte sauen" }) : "" })}`;
        },
        inn(S) {
          S.spill.skjerm = "gi";
          R.holdVaken();
        },
      },

      skriv: {
        tittel: (S) => `Svar ${S.spill.r.na + 1} av ${S.spill.antall}`,
        tilbake: "hjem",
        gjenoppta: "gi",
        vis(S) {
          const r = S.spill.r;
          const i = r.rekke[r.na];
          return `
            ${prikker(S)}
            <form class="sau-skriv" data-skjema="svar" novalidate>
              <div class="sau-skriv-hode">${medSau(S, i, "mid")}<h1 id="skjerm-tittel">Ditt svar<small>${esc(R.navn(i))}</small></h1></div>
              <p class="sau-minne">${esc(ALLE[r.q].t)}</p>
              <input id="svar-felt" class="tekstfelt sau-felt" name="svar" data-felt="svar" maxlength="40" autocomplete="off" autocorrect="on" autocapitalize="sentences" spellcheck="false" enterkeyhint="done" placeholder="Skriv svaret ditt" aria-label="Ditt svar" aria-describedby="svar-feil">
              <p class="feil" id="svar-feil" aria-live="assertive"></p>
              <button class="knapp" type="submit">Ferdig</button>
            </form>
            <p class="hjelp">Tenk som flokken: hva svarer de fleste?</p>`;
        },
        inn(S) {
          S.spill.skjerm = "skriv";
          R.holdVaken();
          const f = R.$("#svar-felt");
          if (f) {
            try {
              f.focus({ preventScroll: true });
            } catch (e) {
              f.focus();
            }
          }
        },
      },

      avslor: {
        tittel: "Avsløringen",
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.r;
          const total = r.rekkefolge.length;
          const hode = (h1, tekst) => `
            <div class="sau-avslor-hode">
              <p class="sau-minne liten">${esc(ALLE[r.q].t)}</p>
              <h1 id="skjerm-tittel">${esc(h1)}</h1>
              ${tekst ? `<p class="ingress">${esc(tekst)}</p>` : ""}
            </div>`;
          if (!r.avslort) {
            // The reveal: one group at a time, smallest first, newest on top.
            const siste = r.vist === total - 1;
            const kort = r.rekkefolge
              .slice(0, r.vist)
              .map((n, k) => gruppekort(S, n, { spot: k === r.vist - 1, inn: k === r.vist - 1 }))
              .reverse()
              .join("");
            return `
              ${r.vist ? hode(`Svar ${r.vist} av ${total}`) : hode("Alle har svart!", "Samle dere rundt mobilen. Svarene vises ett og ett – den største gruppen kommer til slutt.")}
              ${r.vist ? `<ol class="sau-avslorte">${kort}</ol>` : `<div class="sau-venter">${R.figur()}</div>`}
              ${R.ui.dokk(
                R.ui.knapp(r.vist === 0 ? "Avslør svarene" : siste ? "Vis den største gruppen" : "Vis neste svar", "neste-svar", {
                  ikon: r.vist === 0 || siste ? "🥁" : "👀",
                }),
              )}`;
          }
          // Everything is out: biggest group first. Tap two groups that mean the same to merge them.
          const rekke = r.grupper.map((g, n) => n).sort((a, b) => storrelse(r, b) - storrelse(r, a));
          const ut = regnUt(
            r.grupper.map((g) => spillereI(r, g)),
            sp.sau,
          );
          const storst = Math.max(...rekke.map((n) => storrelse(r, n)));
          const flokkN = ut.flokk ? rekke[0] : -1;
          const svartN = ut.alene.length === 1 ? r.grupper.findIndex((g) => spillereI(r, g).length === 1 && spillereI(r, g)[0] === ut.alene[0]) : -1;
          const flere = r.grupper.length > 1;
          const forklaring = ut.flokk ? "" : ut.uavgjort ? "De største gruppene er like store. " : "Alle svarte noe forskjellig. ";
          return `
            ${hode(ut.flokk ? "Flokken er funnet!" : ut.uavgjort ? "Uavgjort!" : "Ingen tenkte likt!", flere ? `${forklaring}Betyr to svar egentlig det samme? Trykk på begge for å slå dem sammen før poengene deles ut.` : "Hele flokken tenkte det samme!")}
            <ol class="sau-avslorte">${rekke
              .map((n) =>
                gruppekort(S, n, {
                  ferdig: true,
                  knapp: flere,
                  inn: n === nyttKort,
                  flokk: n === flokkN,
                  uavgjort: ut.uavgjort && storrelse(r, n) === storst,
                  svart: n === svartN,
                }),
              )
              .join("")}</ol>
            ${R.ui.dokk(
              r.valgt >= 0 ? '<p class="sau-tips" aria-live="polite">Trykk på svaret som betyr det samme – eller på det samme igjen for å angre.</p>' : "",
              R.ui.knapp("Del ut poengene", "del-ut"),
              r.angre.length ? R.ui.lenkerad(R.ui.lenke("Angre", "angre")) : "",
            )}`;
        },
        inn(S) {
          S.spill.skjerm = "avslor";
          R.holdVaken();
        },
        etter() {
          puls = -1;
          nyttKort = -1;
        },
      },

      poeng: {
        tittel: (S) => `Runde ${S.spill.nr}`,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const res = sp.r.res;
          const navn = (spillere) =>
            liste(
              spillere
                .slice()
                .sort((a, b) => a - b)
                .map((i) => R.navn(i)),
            );
          let etikett;
          let tittel;
          let tekst;
          if (res.flokk && res.flokk.length === sp.antall) {
            etikett = "Hele flokken!";
            tittel = `«${res.tekst}»`;
            tekst = "Alle svarte det samme – alle får poeng!";
          } else if (res.flokk) {
            const TALL = ["", "", "to", "tre", "fire", "fem", "seks", "sju", "åtte", "ni", "ti", "elleve", "tolv"];
            etikett = "Flokken svarte";
            tittel = `«${res.tekst}»`;
            tekst = res.flokk.length > 3 ? `+1 til alle ${TALL[res.flokk.length]} i flokken` : `+1 til ${navn(res.flokk)}`;
          } else if (res.uavgjort) {
            etikett = "Uavgjort i flokken";
            tittel = "Ingen poeng";
            tekst = `${liste(res.like.map((t) => `«${t}»`))} var like store.`;
          } else {
            etikett = "Ingen tenkte likt";
            tittel = "Ingen poeng";
            tekst = "Alle svarte noe forskjellig. For en sprø flokk!";
          }
          let sauTekst = "";
          if (res.sau >= 0 && res.sau !== res.forrigeSau) {
            const kvitt = res.forrigeSau >= 0 ? ` ${esc(R.navn(res.forrigeSau))} er kvitt den.` : "";
            sauTekst = `<div class="sau-nyhet ny">${svartSau("stor")}<div><p class="etikett">Den svarte sauen</p><p><b>${esc(R.navn(res.sau))}</b> var den eneste som svarte «${esc(
              res.aleneTekst,
            )}» og får den svarte sauen!${kvitt}</p></div></div>`;
          } else if (res.sau >= 0 && res.alene.length === 1) {
            sauTekst = `<div class="sau-nyhet ny">${svartSau("stor")}<div><p class="etikett">Den svarte sauen</p><p><b>${esc(R.navn(res.sau))}</b> står alene igjen og beholder den svarte sauen.</p></div></div>`;
          } else if (res.sau >= 0) {
            sauTekst = `<div class="sau-nyhet">${svartSau("stor")}<div><p class="etikett">Den svarte sauen</p><p><b>${esc(R.navn(res.sau))}</b> har den fortsatt.</p></div></div>`;
          }
          return `
            <div class="banner ${res.flokk ? "aksent" : ""}">
              <p class="etikett">${esc(etikett)}</p>
              <h1 id="skjerm-tittel">${esc(tittel)}</h1>
              <p class="ingress">${esc(tekst)}</p>
            </div>
            ${sauTekst}
            <section class="seksjon">
              <div class="seksjon-hode"><h2>Stillingen</h2><span class="tall">Først til ${sp.mal}</span></div>
              ${poengtavle(S, res.flokk || [])}
            </section>
            ${R.ui.dokk(
              sp.ferdig ? R.ui.knapp("Kår vinneren", "til-vinner", { ikon: "🏆" }) : R.ui.knapp("Neste spørsmål", "neste-runde"),
              R.ui.lenkerad(R.ui.lenke("Angre", "angre-poeng")),
            )}`;
        },
        inn(S) {
          S.spill.skjerm = "poeng";
          R.holdVaken();
        },
      },

      vinner: {
        tittel: "Kåringen",
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const v = sp.vinnere || [];
          const navn = v.map((i) => R.navn(i));
          const rader = Array.from({ length: sp.antall }, (_, i) => ({ i, poeng: sp.poeng[i] }));
          const topp = Math.max(...sp.poeng);
          const pall = v.length && sp.poeng.every((p, i) => p < topp || v.includes(i)) ? R.ui.pall(rader) : "";
          // Fun titles: who was in the flock most often, who stood alone most often.
          const mest = (liste) => {
            const maks = Math.max(0, ...liste);
            const hvem = liste.map((n, i) => (n === maks ? i : -1)).filter((i) => i >= 0);
            return maks > 0 && hvem.length <= 2 ? { navn: hvem.map((i) => R.navn(i)).join(" og "), hvem, n: maks } : null;
          };
          const ganger = (n) => `${n} ${n === 1 ? "gang" : "ganger"}`;
          const flokkdyr = mest(sp.iFlokk);
          const ulv = mest(sp.alene);
          const titler = [
            flokkdyr && ["🐑", "Flokkdyret", flokkdyr.navn, `Med i flokken ${ganger(flokkdyr.n)}`],
            ulv && !(ulv.hvem.length === 1 && ulv.hvem[0] === sp.sau) && ["🐺", "Ensom ulv", ulv.navn, `Sto helt alene ${ganger(ulv.n)}`],
            sp.sau >= 0 && ["🖤", "Den svarte sauen", R.navn(sp.sau), sp.alene[sp.sau] > 1 ? `Sto alene ${ganger(sp.alene[sp.sau])} – og satt igjen med sauen` : "Satt igjen med sauen til slutt"],
          ].filter(Boolean);
          return `
            <div class="banner aksent">
              ${R.figur()}
              <p class="etikett">${v.length > 1 ? "Flokkens ledere" : v.length ? "Flokkens leder" : "Spillet ble avsluttet"}</p>
              <h1 id="skjerm-tittel">${v.length ? esc(`${liste(navn)} vinner!`) : "Ingen vinner"}</h1>
              <p class="ingress">${sp.tidlig ? `Etter ${sp.nr} ${sp.nr === 1 ? "runde" : "runder"}.` : `Først til ${sp.mal} poeng – uten den svarte sauen.`}</p>
            </div>
            ${pall}
            ${titler.length ? `<ul class="sau-titler">${titler.map(([ikon, t, n, x]) => `<li><span aria-hidden="true">${ikon}</span><div><small>${esc(t)}</small><b>${esc(n)}</b><span>${esc(x)}</span></div></li>`).join("")}</ul>` : ""}
            ${poengtavle(S, [])}
            ${R.ui.flereSpill({ antall: sp.antall })}
            ${R.ui.dokk(R.ui.knapp("Spill igjen", "igjen"), R.ui.lenkerad(R.ui.lenke("Endre oppsett", "nytt"), '<a class="lenke" href="/">Alle spill</a>'))}`;
        },
        inn(S) {
          if ((S.spill.vinnere || []).length) {
            R.lyd.fanfare();
            R.konfetti(["--aksent", "--papir", "--mynte", "--lampe", "--lilla"]);
          }
          R.slippVaken();
        },
      },
    },

    skjema: {
      svar(S, form) {
        const sp = S.spill;
        const r = sp.r;
        const felt = form.querySelector("input");
        const tekst = felt.value.trim().replace(/\s+/g, " ");
        if (!R.normaliser(tekst)) {
          R.$("#svar-feil").textContent = tekst ? "Svaret må ha bokstaver eller tall." : "Skriv et svar først.";
          felt.classList.remove("risting");
          void felt.offsetWidth;
          felt.classList.add("risting");
          felt.setAttribute("aria-invalid", "true");
          felt.focus();
          R.lyd.feil();
          R.vibrer(60);
          return;
        }
        r.svar.push({ i: r.rekke[r.na], t: tekst.slice(0, 40) });
        r.na += 1;
        R.lyd.pop();
        R.vibrer(15);
        if (r.na < r.rekke.length) {
          R.gaTil("gi");
          return;
        }
        // Everyone has answered: group the answers and get the reveal ready (smallest group first,
        // equal sizes in random order, so the biggest group comes last).
        const g = grupperSvar(r.svar.map((s) => s.t));
        r.enheter = g.enheter;
        r.grupper = g.grupper;
        r.rekkefolge = R.stokk(r.grupper.map((x, n) => n)).sort((a, b) => storrelse(r, a) - storrelse(r, b));
        r.vist = 0;
        r.avslort = false;
        r.valgt = -1;
        r.angre = [];
        R.lyd.pling();
        R.gaTil("avslor");
      },
    },

    felt: {
      svar(S, el) {
        el.removeAttribute("aria-invalid");
        const feil = R.$("#svar-feil");
        if (feil && feil.textContent) feil.textContent = "";
      },
    },

    handlinger: (H = {
      async nytt(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(pagar(S))) || !fortsatt()) return;
        if (pagar(S)) {
          S.spill = null;
          R.slippVaken();
        }
        R.gaTil("oppsett");
      },
      hjem: () => R.gaTil("hjem"),
      fortsett(el, e, S) {
        if (!S.spill) return R.gaTil("oppsett");
        R.holdVaken();
        R.gaTil(porten(S.spill.skjerm));
      },
      pakke(el, e, S) {
        const v = el.dataset.v;
        const liste = S.oppsett.pakker;
        if (v === "*") S.oppsett.pakker = liste.length === PAKKER.length ? [] : ALLE_PAKKER.slice();
        else S.oppsett.pakker = liste.includes(v) ? liste.filter((x) => x !== v) : ALLE_PAKKER.filter((x) => x === v || liste.includes(x));
        R.vis();
      },
      mal(el, e, S) {
        const m = Number(el.dataset.v);
        S.oppsett.mal = MAL.includes(m) ? m : 8;
        R.vis();
      },
      start(el, e, S) {
        if (!ALLE.some((q) => S.oppsett.pakker.includes(q.p))) return;
        const antall = R.klamp(S.antall || 4, 3, 12);
        S.antall = antall;
        S.spill = {
          antall,
          mal: S.oppsett.mal,
          poeng: Array(antall).fill(0),
          iFlokk: Array(antall).fill(0),
          alene: Array(antall).fill(0),
          sau: -1,
          start: R.heltall(0, antall - 1),
          nr: 0,
          logg: [],
          r: null,
          skjerm: "sporsmal",
          ferdig: false,
          tidlig: false,
          vinnere: [],
        };
        nyRunde(S);
        R.holdVaken();
        R.gaTil("sporsmal");
      },
      "bytt-sporsmal"(el, e, S) {
        S.spill.r.q = nyttSporsmal(S);
        R.lyd.sveip();
        R.vis();
      },
      stilling(el, e, S) {
        R.ark(`
          <h2 id="ark-tittel">Stillingen</h2>
          <p class="ingress">Først til ${S.spill.mal} poeng – uten den svarte sauen.</p>
          ${poengtavle(S, [])}
          <button class="knapp" data-h="lukk-ark">Lukk</button>`);
      },
      "send-rundt"(el, e, S) {
        const r = S.spill.r;
        r.na = 0;
        r.svar = [];
        R.gaTil("gi");
      },
      "jeg-er": () => R.gaTil("skriv"),
      velg(el, e, S) {
        const r = S.spill.r;
        const g = Number(el.dataset.v);
        if (!r.avslort || r.res || !r.grupper[g]) return;
        if (r.valgt < 0 || r.valgt >= r.grupper.length) {
          r.valgt = g;
          R.lyd.klikk();
        } else if (r.valgt === g) {
          r.valgt = -1;
        } else {
          r.angre.push(r.grupper.map((x) => x.slice()));
          const [a, b] = [Math.min(r.valgt, g), Math.max(r.valgt, g)];
          r.grupper[a] = r.grupper[a].concat(r.grupper[b]);
          r.grupper.splice(b, 1);
          r.valgt = -1;
          puls = a;
          R.lyd.pop();
          R.vibrer(20);
          R.si("Slått sammen");
        }
        R.vis();
      },
      del(el, e, S) {
        const r = S.spill.r;
        const g = Number(el.dataset.v);
        if (!r.avslort || r.res || !r.grupper[g] || r.grupper[g].length < 2) return;
        r.angre.push(r.grupper.map((x) => x.slice()));
        const deler = r.grupper[g].map((u) => [u]);
        r.grupper.splice(g, 1, ...deler);
        r.valgt = -1;
        R.lyd.sveip();
        R.si("Delt opp");
        R.vis();
      },
      angre(el, e, S) {
        const r = S.spill.r;
        if (!r.angre.length) return;
        r.grupper = r.angre.pop();
        r.valgt = -1;
        R.vis();
      },
      async "neste-svar"(el, e, S) {
        const r = S.spill.r;
        const total = r.rekkefolge.length;
        if (opptatt || r.avslort) return;
        if (r.vist >= total - 1) {
          // The biggest group: drum roll first.
          opptatt = true;
          el.disabled = true;
          R.lyd.trommevirvel(1.1);
          const fortsatt = R.vakt();
          await R.vent(R.rolig() ? 300 : 1150);
          opptatt = false;
          if (!fortsatt()) return; // they left the screen during the drum roll: reveal it next time
          r.vist = total;
          r.avslort = true;
          const storste = r.rekkefolge[total - 1];
          nyttKort = storste; // slides in on the next render only
          R.vis();
          const ut = regnUt(
            r.grupper.map((g) => spillereI(r, g)),
            S.spill.sau,
          );
          if (ut.flokk) {
            R.lyd.riktig();
            R.vibrer([40, 40, 120]);
            R.si(`Flokken svarte ${teksterI(r, gruppeSvar(r, r.grupper[storste]))[0]}`);
          } else {
            R.lyd.buu();
            R.si("Ingen flokk denne gangen");
          }
          window.scrollTo({ top: 0, behavior: R.rolig() ? "auto" : "smooth" });
          return;
        }
        r.vist += 1;
        R.lyd.snu();
        R.vibrer(12);
        R.vis();
        const n = r.rekkefolge[r.vist - 1];
        R.si(`${teksterI(r, gruppeSvar(r, r.grupper[n]))[0]}: ${spillereI(r, r.grupper[n]).map((i) => R.navn(i)).join(", ")}`);
        window.scrollTo({ top: 0, behavior: R.rolig() ? "auto" : "smooth" });
      },
      "del-ut"(el, e, S) {
        const sp = S.spill;
        const r = sp.r;
        if (!r.avslort) return;
        if (!r.res) {
          const info = r.grupper.map((g) => {
            const svar = gruppeSvar(r, g);
            return { spillere: svar.map((k) => r.svar[k].i), tekst: teksterI(r, svar)[0] };
          });
          const ut = regnUt(
            info.map((x) => x.spillere),
            sp.sau,
          );
          const storst = Math.max(...info.map((x) => x.spillere.length));
          r.valgt = -1;
          r.res = {
            flokk: ut.flokk,
            uavgjort: ut.uavgjort,
            alene: ut.alene,
            forrigeSau: sp.sau,
            sau: ut.sau,
            tekst: ut.flokk ? info.find((x) => x.spillere.length === storst).tekst : "",
            like: ut.uavgjort ? info.filter((x) => x.spillere.length === storst).map((x) => x.tekst) : [],
            aleneTekst: ut.alene.length === 1 ? info.find((x) => x.spillere.length === 1 && x.spillere[0] === ut.alene[0]).tekst : "",
            // Everything needed to take the points back with «Angre».
            for: { poeng: sp.poeng.slice(), iFlokk: sp.iFlokk.slice(), alene: sp.alene.slice(), sau: sp.sau, logg: sp.logg.length },
          };
          (ut.flokk || []).forEach((i) => {
            sp.poeng[i] += 1;
            sp.iFlokk[i] += 1;
          });
          ut.alene.forEach((i) => (sp.alene[i] += 1));
          sp.sau = ut.sau;
          sp.logg.push({ q: r.q, f: r.res.tekst, n: ut.flokk ? ut.flokk.length : 0, sau: ut.sau });
          const v = vinnere(sp.poeng, sp.sau, sp.mal);
          if (v.length) {
            sp.ferdig = true;
            sp.vinnere = v;
          }
        }
        R.gaTil("poeng");
        if (r.res.sau >= 0 && r.res.sau !== r.res.forrigeSau) {
          R.lyd.latter();
          R.vibrer([60, 50, 60]);
        } else if (r.res.flokk) R.lyd.pling();
      },
      "angre-poeng"(el, e, S) {
        const sp = S.spill;
        const r = sp.r;
        if (!r.res) return;
        const f = r.res.for;
        sp.poeng = f.poeng;
        sp.iFlokk = f.iFlokk;
        sp.alene = f.alene;
        sp.sau = f.sau;
        sp.logg.length = f.logg;
        sp.ferdig = false;
        sp.vinnere = [];
        r.res = null;
        R.gaTil("avslor");
      },
      "neste-runde"(el, e, S) {
        nyRunde(S);
        R.gaTil("sporsmal");
      },
      "til-vinner": () => R.gaTil("vinner"),
      async avslutt(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreft("Avslutte spillet?", "Dere ser stillingen så langt.", "Avslutt", "Spill videre")) || !fortsatt() || !S.spill) return;
        const sp = S.spill;
        const kandidater = sp.poeng.map((p, i) => (i !== sp.sau ? p : -1));
        const topp = Math.max(...kandidater);
        sp.vinnere = topp > 0 ? kandidater.map((p, i) => (p === topp ? i : -1)).filter((i) => i >= 0) : [];
        sp.ferdig = true;
        sp.tidlig = true;
        R.gaTil("vinner");
      },
      igjen(el, e, S) {
        S.spill = null;
        H.start(el, e, S);
      },
    }),
  });
})();
