/* Pakketyven — «Pakkeleken», the Nordic parcel game, for 4–20 players around one phone.
   Real wrapped parcels lie in a pile on the table; the phone in the middle is the die, keeps track
   of whose turn it is and who has how many parcels, and hides the clock.
   Part 1: throw in turn with one tap – a six takes a parcel from the pile. When the pile is empty,
   part 2: a hidden clock runs (nobody is shown how long) and a six now steals a parcel from another
   player. When the horn goes, it is over and everyone opens what they have.
   House rule «Enere gir bort»: a one gives one of your parcels to somebody else.
   The clock runs only while the game is on the screen: it stands still when the phone is locked,
   on the home screen or while the page loads again, and it is never drawn anywhere.
   The rules are pure functions at the top (window.RusjPakketyven when loaded without the kit);
   test/pakketyven.test.mjs checks them. */
(function () {
  "use strict";

  // ---------- The rules (pure: no DOM, no kit) ----------

  const P = (() => {
    const MIN = 4;
    const MAKS = 20;
    const MAKS_PAKKER = 99;
    // The hidden clock of part 2 in seconds: [shortest, longest]. Nobody is told where it stops.
    const LENGDER = { kort: [120, 240], vanlig: [180, 420], lang: [360, 600] };
    const klamp = (n, a, b) => Math.min(b, Math.max(a, n));
    const heltall = (x, standard) => (Number.isFinite(Number(x)) ? Math.round(Number(x)) : standard);
    const standardPakker = (antall) => klamp(antall * 2, 2, MAKS_PAKKER);

    function nytt(o = {}) {
      const antall = klamp(heltall(o.antall, MIN), MIN, MAKS);
      const pakker = klamp(heltall(o.pakker, 0) || standardPakker(antall), 2, MAKS_PAKKER);
      return {
        antall,
        pakker, // in the pile at the start
        enere: !!o.enere,
        lengde: LENGDER[o.lengde] ? o.lengde : "vanlig",
        tema: o.tema === "fest" ? "fest" : "jul",
        fase: 1, // 1: the pile · 2: stealing
        status: "kast", // kast | velg (who to steal from / give to) | mellom (the pile is empty: part 2 next)
        haug: pakker,
        har: Array(antall).fill(0),
        tur: 0,
        velg: null, // { type: "stjel" | "gi", fra }
        terning: 5,
        vri: 0,
        sist: null, // the last thing that happened: { i, v, hva, mot }
        kast: 0,
        seksere: Array(antall).fill(0),
        tyverier: Array(antall).fill(0),
        klokke: null, // part 2: { igjen (ms, while it stands still), slutt (a time, while it runs) }
        angre: null,
        ferdig: false,
        komplett: false, // the horn ended it (not «Avslutt»)
      };
    }
    const neste = (sp, i) => (i + 1) % sp.antall;
    const seter = (sp) => Array.from({ length: sp.antall }, (_, i) => i);
    const andreMedPakker = (sp, i) => seter(sp).filter((j) => j !== i && sp.har[j] > 0);
    // Who the player with the choice may point at.
    function kandidater(sp) {
      if (!sp.velg) return [];
      const fra = sp.velg.fra;
      return sp.velg.type === "stjel" ? andreMedPakker(sp, fra) : seter(sp).filter((j) => j !== fra);
    }

    // One throw by the player whose turn it is; v is what the die shows. Returns what happened:
    // { i, v, hva } with hva "ingen" (nothing), "tok" (a parcel from the pile), "stjel" / "gi" (a
    // choice is waiting), "alene" (a six, but nobody to steal from), "tomhendt" (a one, but nothing
    // to give). Null when no throw is due.
    function kast(sp, v) {
      if (sp.ferdig || sp.status !== "kast" || !(v >= 1 && v <= 6)) return null;
      if (sp.fase === 1 && sp.haug <= 0) {
        sp.status = "mellom"; // (only after «Rett opp»: the pile was emptied by hand)
        return null;
      }
      const i = sp.tur;
      sp.kast++;
      sp.terning = v;
      sp.angre = null;
      let hva = "ingen";
      if (v === 6) {
        sp.seksere[i]++;
        if (sp.fase === 1) {
          sp.haug--;
          sp.har[i]++;
          hva = "tok";
          if (sp.haug === 0) sp.status = "mellom";
        } else if (andreMedPakker(sp, i).length) {
          sp.status = "velg";
          sp.velg = { type: "stjel", fra: i };
          hva = "stjel";
        } else hva = "alene";
      } else if (v === 1 && sp.enere) {
        if (sp.har[i] > 0) {
          sp.status = "velg";
          sp.velg = { type: "gi", fra: i };
          hva = "gi";
        } else hva = "tomhendt";
      }
      if (sp.status !== "velg") sp.tur = neste(sp, i);
      sp.sist = { i, v, hva, siste: hva === "tok" && sp.haug === 0 };
      return sp.sist;
    }

    // The choice after a six in part 2 (steal from j) or after a one (give to j). j = −1 lets a
    // steal be («Stjel ikke»); a one must be given. Returns what happened, or null.
    function velg(sp, j) {
      if (sp.ferdig || sp.status !== "velg" || !sp.velg) return null;
      const { type, fra } = sp.velg;
      let hva;
      if (j === -1) {
        if (type !== "stjel") return null;
        hva = "lot";
      } else {
        if (!kandidater(sp).includes(j)) return null;
        if (type === "stjel") {
          sp.har[j]--;
          sp.har[fra]++;
          sp.tyverier[fra]++;
          hva = "stjal";
        } else {
          sp.har[fra]--;
          sp.har[j]++;
          hva = "ga";
        }
      }
      sp.sist = { i: fra, v: sp.terning, hva, mot: j };
      sp.velg = null;
      sp.status = "kast";
      sp.tur = neste(sp, fra);
      return sp.sist;
    }

    // Part 2 begins: the clock is set (it starts when the screen shows the game).
    function startDel2(sp, sekunder) {
      if (sp.ferdig || sp.fase !== 1) return false;
      sp.fase = 2;
      sp.status = "kast";
      sp.velg = null;
      sp.angre = null;
      sp.sist = null;
      sp.klokke = { igjen: Math.max(0, Math.round(sekunder * 1000)), slutt: null };
      return true;
    }
    // How long the hidden clock runs: a whole number of seconds, every one equally likely.
    function varighet(lengde, rnd) {
      const [a, b] = LENGDER[lengde] || LENGDER.vanlig;
      return a + Math.floor(rnd() * (b - a + 1));
    }
    // The clock: `igjen` ms while it stands still, `slutt` (a point in time) while it runs.
    const klokkeStart = (k, na) => {
      if (k && k.slutt == null) k.slutt = na + k.igjen;
    };
    const klokkePause = (k, na) => {
      if (k && k.slutt != null) {
        k.igjen = Math.max(0, k.slutt - na);
        k.slutt = null;
      }
    };
    const klokkeIgjen = (k, na) => (!k ? Infinity : k.slutt != null ? Math.max(0, k.slutt - na) : k.igjen);
    const klokkeUte = (k, na) => !!k && klokkeIgjen(k, na) <= 0;
    // A saved clock is repaired: never more time than it was given, never a broken number.
    function klokkeGyldig(k, na, lengde) {
      if (!k || typeof k !== "object") return null;
      const maks = (LENGDER[lengde] || LENGDER.lang)[1] * 1000;
      let igjen = Number.isFinite(k.igjen) ? klamp(k.igjen, 0, maks) : 0;
      let slutt = Number.isFinite(k.slutt) ? k.slutt : null;
      if (slutt != null && slutt - na > igjen) slutt = na + igjen; // the phone's clock was set back
      if (slutt != null) igjen = Math.max(igjen, 0);
      return { igjen, slutt };
    }

    // «Rett opp»: the table and the phone disagree. hvem: "haug" or a seat; d: +1 / −1.
    function rett(sp, hvem, d) {
      if (sp.ferdig || (d !== 1 && d !== -1)) return false;
      if (hvem === "haug") {
        if (sp.fase !== 1 || sp.status === "mellom" || sp.haug + d < 0 || sp.haug + d > MAKS_PAKKER) return false;
        sp.haug += d;
      } else {
        if (!Number.isInteger(hvem) || hvem < 0 || hvem >= sp.antall || sp.har[hvem] + d < 0 || sp.har[hvem] + d > MAKS_PAKKER) return false;
        sp.har[hvem] += d;
      }
      sp.angre = null;
      // A choice that can no longer be made (nobody left to steal from, nothing left to give) is dropped.
      if (sp.status === "velg" && sp.velg && ((sp.velg.type === "stjel" && !andreMedPakker(sp, sp.velg.fra).length) || (sp.velg.type === "gi" && sp.har[sp.velg.fra] <= 0))) {
        sp.tur = neste(sp, sp.velg.fra);
        sp.velg = null;
        sp.status = "kast";
      }
      return true;
    }

    function horn(sp, komplett) {
      sp.ferdig = true;
      sp.komplett = !!komplett;
      sp.status = "kast";
      sp.velg = null;
      sp.angre = null;
      if (sp.klokke) sp.klokke = { igjen: 0, slutt: null };
    }
    // Most parcels first; those level keep the order round the table.
    const rekkefolge = (sp) => seter(sp).sort((a, b) => sp.har[b] - sp.har[a] || a - b);
    const flest = (liste) => {
      const topp = Math.max(0, ...liste);
      return topp > 0 ? liste.map((n, i) => (n === topp ? i : -1)).filter((i) => i >= 0) : [];
    };

    // Is this a game the screens can draw? (A saved game from the phone's storage.)
    function gyldig(sp) {
      const tall = (x, a, b) => Number.isInteger(x) && x >= a && x <= b;
      if (!sp || typeof sp !== "object" || !tall(sp.antall, MIN, MAKS)) return false;
      const n = sp.antall;
      if (![sp.har, sp.seksere, sp.tyverier].every((l) => Array.isArray(l) && l.length === n && l.every((x) => tall(x, 0, 100000)))) return false;
      if (!tall(sp.haug, 0, MAKS_PAKKER) || !tall(sp.pakker, 0, MAKS_PAKKER) || !tall(sp.tur, 0, n - 1) || !tall(sp.terning, 1, 6) || !tall(sp.kast, 0, 1e7)) return false;
      if (![1, 2].includes(sp.fase) || !["kast", "velg", "mellom"].includes(sp.status) || !LENGDER[sp.lengde] || !["jul", "fest"].includes(sp.tema)) return false;
      if (sp.status === "velg" && !(sp.velg && ["stjel", "gi"].includes(sp.velg.type) && tall(sp.velg.fra, 0, n - 1) && kandidater(sp).length)) return false;
      if (sp.status === "mellom" && sp.fase !== 1) return false;
      if (sp.fase === 2 && !sp.ferdig && !sp.klokke) return false;
      if (sp.sist != null && !(typeof sp.sist === "object" && tall(sp.sist.i, 0, n - 1) && typeof sp.sist.hva === "string" && (sp.sist.mot == null || tall(sp.sist.mot, -1, n - 1)))) return false;
      return true;
    }

    return { MIN, MAKS, MAKS_PAKKER, LENGDER, standardPakker, nytt, neste, kandidater, andreMedPakker, kast, velg, startDel2, varighet, klokkeStart, klokkePause, klokkeIgjen, klokkeUte, klokkeGyldig, rett, horn, rekkefolge, flest, gyldig };
  })();

  const R = window.Rusj;
  if (!R || typeof R.start !== "function") {
    window.RusjPakketyven = P;
    return;
  }

  // ---------- The game on the page ----------

  const esc = R.esc;
  const BRETT = "pt-brett";
  const LENGDENAVN = { kort: R.t("Kort"), vanlig: R.t("Vanlig"), lang: R.t("Lang") };
  const TEMAER = ["jul", "fest"];
  let H;

  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const tilfeldig = () => R.nyttFro() / 4294967296;
  const pakkerTekst = (n) => R.flertall(n, "pakke", "pakker");
  // Christmas from the middle of November to Epiphany, a party the rest of the year (until the
  // players choose for themselves).
  function autoTema(dato) {
    const d = dato || new Date();
    const m = d.getMonth() + 1;
    return m === 12 || (m === 11 && d.getDate() >= 15) || (m === 1 && d.getDate() <= 6) ? "jul" : "fest"; // sprak-ok
  }
  const temaFor = (S) => (pagar(S) || (S.spill && S.spill.ferdig && S.skjerm === "slutt") ? S.spill.tema : TEMAER.includes(S.oppsett.tema) ? S.oppsett.tema : autoTema());
  const pakkerFor = (S) => (Number.isInteger(S.oppsett.pakker) ? R.klamp(S.oppsett.pakker, 2, P.MAKS_PAKKER) : P.standardPakker(R.klamp(S.antall || P.MIN, P.MIN, P.MAKS)));
  const skjermFor = (sp) => (sp.ferdig ? "slutt" : sp.status === "mellom" ? "tyveri" : "spill"); // sprak-ok

  let ruller = false; // the die is in the air
  let sveipKast = null; // a fling on the tray: its direction and speed for the next throw
  let pause = false; // a short beat after a six, so everyone sees it
  let pauseId = null;
  let klokkeId = null;
  let tuter = false; // the horn goes when the result screen comes up

  // ---------- Drawings ----------

  const BLEKK = "#170e2b";
  // [box, ribbon] per parcel, by theme.
  const PAKKEFARGER = {
    jul: [["#e8414f", "#ffd23f"], ["#1f9d6b", "#fff1dd"], ["#fff1dd", "#e8414f"], ["#ffd23f", "#1f9d6b"], ["#2a7cc4", "#fff1dd"]],
    fest: [["#ff4f8b", "#ffd23f"], ["#59b9ff", "#fff1dd"], ["#3de3b0", "#ff4f8b"], ["#ffd23f", "#a47bff"], ["#a47bff", "#fff1dd"]],
  };
  function pakke(nr, tema, klasse) {
    const farger = PAKKEFARGER[tema] || PAKKEFARGER.jul;
    const [eske, band] = farger[((nr % farger.length) + farger.length) % farger.length];
    return `<svg class="pt-pakke ${klasse || ""}" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><path d="M6 17h28v17a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3Z" fill="${eske}" stroke="${BLEKK}" stroke-width="2.5" stroke-linejoin="round"/><rect x="3.5" y="11" width="33" height="8" rx="2.5" fill="${eske}" stroke="${BLEKK}" stroke-width="2.5"/><path d="M17 11h6v26h-6Z" fill="${band}" stroke="${BLEKK}" stroke-width="2"/><path d="M20 11C15 3 7 4 9 8.5C10.5 11.5 16 11 20 11C24 11 29.5 11.5 31 8.5C33 4 25 3 20 11Z" fill="${band}" stroke="${BLEKK}" stroke-width="2.2" stroke-linejoin="round"/></svg>`;
  }
  // A string across the top of the screen: fairy lights at Christmas, bunting at a party.
  function pyntHtml(tema) {
    const farger = tema === "jul" ? ["#ff5a4e", "#ffd23f", "#3de3b0", "#59b9ff"] : ["#ff4f8b", "#ffd23f", "#3de3b0", "#a47bff", "#59b9ff"];
    const n = tema === "jul" ? 9 : 8;
    const t1 = (v) => Math.round(v * 10) / 10;
    let ut = "";
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const x = t1(360 * t);
      const y = t1(3 + 44 * t * (1 - t));
      const f = farger[i % farger.length];
      ut +=
        tema === "jul"
          ? `<g class="pt-paere" style="--i: ${i}"><rect x="${t1(x - 2.5)}" y="${y}" width="5" height="4.5" rx="1" fill="#6a5594"/><ellipse cx="${x}" cy="${t1(y + 10)}" rx="5" ry="6.5" fill="${f}"/></g>`
          : `<path d="M${t1(x - 10)} ${y}H${t1(x + 10)}L${x} ${t1(y + 17)}Z" fill="${f}" stroke="${BLEKK}" stroke-width="1.5" stroke-linejoin="round"/>`;
    }
    return `<svg class="pt-pynt ${tema}" viewBox="0 0 360 34" aria-hidden="true" focusable="false"><path d="M0 3Q180 25 360 3" fill="none" stroke="#6a5594" stroke-width="2"/>${ut}</svg>`;
  }
  // The hidden clock: a face with no hands, only a question mark.
  const klokkeSvg = () =>
    `<svg class="pt-ur" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><circle cx="32" cy="34" r="24" fill="#fff1dd" stroke="${BLEKK}" stroke-width="4"/><path d="M22 6h20" stroke="${BLEKK}" stroke-width="5" stroke-linecap="round"/><path d="M32 6v5" stroke="${BLEKK}" stroke-width="4"/>${[0, 90, 180, 270].map((v) => `<path d="M32 14v4" stroke="${BLEKK}" stroke-width="3" stroke-linecap="round" transform="rotate(${v} 32 34)"/>`).join("")}<text x="32" y="44" text-anchor="middle" font-family="ui-rounded,'Arial Rounded MT Bold',system-ui,sans-serif" font-weight="900" font-size="27" fill="${BLEKK}">?</text></svg>`;

  // ---------- Pieces of the screens ----------

  // What just happened, in words (the line under the die).
  function hendelseTekst(sp) {
    const s = sp.sist;
    if (!s) {
      const navn = R.navn(sp.tur);
      return sp.fase === 2 ? R.t("Klokka går! {navn} begynner. Slå en sekser og stjel en pakke!", { navn }) : R.t("{navn} begynner. Slå en sekser og ta en pakke!", { navn });
    }
    const navn = R.navn(s.i);
    if (s.hva === "tok") return s.siste ? R.t("Sekser! {navn} tok den siste pakken.", { navn }) : R.t("Sekser! {navn} tok en pakke fra haugen.", { navn });
    if (s.hva === "stjal") return R.t("Sekser! {navn} stjal en pakke fra {offer}.", { navn, offer: R.navn(s.mot) });
    if (s.hva === "lot") return R.t("{navn} slo en sekser, men lot pakkene være.", { navn });
    if (s.hva === "alene") return sp.har[s.i] > 0 ? R.t("Sekser! Men {navn} har alle pakkene allerede.", { navn }) : R.t("Sekser! Men ingen har pakker å stjele.");
    if (s.hva === "ga") return R.t("Ener! {navn} ga en pakke til {mottaker}.", { navn, mottaker: R.navn(s.mot) });
    if (s.hva === "tomhendt") return R.t("{navn} slo en ener, men har ingen pakke å gi bort.", { navn });
    return R.t("{navn} slo {v}.", { navn, v: s.v });
  }

  // Everyone round the table with their parcels.
  function bordHtml(sp, o = {}) {
    const s = sp.sist || {};
    const fikk = s.hva === "tok" || s.hva === "stjal" ? s.i : s.hva === "ga" ? s.mot : -1;
    const mistet = s.hva === "stjal" ? s.mot : s.hva === "ga" ? s.i : -1;
    return `<ul class="pt-bord${sp.antall > 8 ? " mange" : " fa"}" aria-label="${esc(R.t("Hvem har hvor mange pakker"))}">${sp.har
      .map(
        (n, i) =>
          `<li class="${[i === sp.tur && !o.utenTur ? "na" : "", n ? "" : "tom", i === fikk ? "fikk" : "", i === mistet ? "mistet" : ""].filter(Boolean).join(" ")}" style="--pf: var(--p${(i % 20) + 1})">${R.avatar(i)}<span class="pt-bord-navn">${esc(R.navn(i))}</span><b aria-hidden="true">${n}</b><span class="vh">: ${esc(pakkerTekst(n))}</span></li>`,
      )
      .join("")}</ul>`;
  }
  function haugHtml(sp) {
    const vist = Math.min(sp.haug, 14);
    const ikoner = Array.from({ length: vist }, (_, k) => pakke(k, sp.tema)).join("");
    return `<div class="pt-haug" role="img" aria-label="${esc(R.t("{n} pakke igjen i haugen|{n} pakker igjen i haugen", { n: sp.haug }))}">
      <span class="pt-haug-ikoner" aria-hidden="true">${ikoner}${sp.haug > vist ? `<i>+${sp.haug - vist}</i>` : ""}</span>
      <p aria-hidden="true"><b>${sp.haug}</b> ${esc(R.t("pakke igjen i haugen|pakker igjen i haugen", { n: sp.haug }))}</p>
    </div>`;
  }
  // Part 2: the clock that shows nothing. (No time, no bar, nothing that moves with the time.)
  const urHtml = () =>
    `<div class="pt-klokke">${klokkeSvg()}<p><b>${esc(R.t("Klokka går …"))}</b><span>${esc(R.t("Ingen vet når hornet går!"))}</span></p></div>`;

  function brettHtml(sp) {
    const kan = sp.status === "kast" && !ruller && !pause;
    return R.terninger.html({
      id: BRETT,
      klasse: "pt-brett",
      verdier: [sp.terning],
      vri: [sp.vri || 0],
      hold: false,
      plass: 4.6,
      handling: "kast", // sprak-ok (the action's name)
      av: !kan,
      etikett: () => (kan ? R.t("Kast terningen") : R.t("Terningen viser {n}", { n: sp.terning })),
      navn: R.t("Terningen"),
      klar: sp.kast === 0,
    });
  }
  function stempel(tekst, klasse) {
    const brett = R.$("#" + BRETT);
    if (!brett) return;
    const gml = R.$(".pt-stempel", brett);
    if (gml) gml.remove();
    brett.insertAdjacentHTML("beforeend", `<span class="pt-stempel" aria-hidden="true"><span class="stempel ${klasse}">${esc(tekst)}</span></span>`);
  }

  // The screen while a throw is due: whose turn, the die, what happened, the pile or the clock, the table.
  function kastHtml(sp) {
    const i = sp.tur;
    const tomHaug = sp.fase === 1 && sp.haug <= 0;
    const lenker = [];
    if (sp.angre) lenker.push(`<button class="lenke" data-h="angre">↶ ${esc(R.t("Angre"))}</button>`);
    lenker.push(R.ui.lenke(R.t("Rett opp"), "rett-opp"), R.ui.lenke(R.t("Avslutt"), "avslutt"));
    const hoved = tomHaug ? R.ui.knapp(R.t("Haugen er tom – videre"), "videre", { variant: "stor" }) : R.ui.knapp(R.t("Kast terningen"), "kast", { variant: "stor", ikon: "🎲", av: ruller || pause });
    return `
      <div class="pt-hode" style="--pf: var(--p${(i % 20) + 1})">
        ${R.avatar(i, "stor")}
        <div class="pt-hvem">
          <p class="etikett">${esc(R.t("Nå kaster"))}</p>
          <h1 id="skjerm-tittel"${[...R.navn(i)].length > 9 ? ` class="lang"` : ""}>${esc(R.navn(i))}</h1>
        </div>
        <p class="pt-mine"><span class="vh">${esc(R.t("{navn} har {pakker}", { navn: R.navn(i), pakker: pakkerTekst(sp.har[i]) }))}</span><b aria-hidden="true">${sp.har[i]}</b>${pakke(i, sp.tema)}</p>
      </div>
      ${brettHtml(sp)}
      <p class="pt-hendelse" id="pt-hendelse" aria-live="polite">${esc(hendelseTekst(sp))}<span class="vh"> ${esc(sp.sist ? R.t("{navn} sin tur.", { navn: R.navn(i) }) : "")}</span></p>
      ${sp.fase === 1 ? haugHtml(sp) : urHtml()}
      ${bordHtml(sp)}
      ${R.ui.dokk(hoved, R.ui.lenkerad(...lenker))}`;
  }
  // A six in part 2 (or a one with the house rule): point at somebody.
  function velgHtml(sp) {
    const { type, fra } = sp.velg;
    const stjel = type === "stjel";
    const navn = R.navn(fra);
    const valg = P.kandidater(sp)
      .map((j) => {
        const n = sp.har[j];
        const etikett = stjel ? R.t("Stjel fra {navn}, som har {pakker}", { navn: R.navn(j), pakker: pakkerTekst(n) }) : R.t("Gi til {navn}, som har {pakker}", { navn: R.navn(j), pakker: pakkerTekst(n) });
        return `<button class="pt-offer" data-h="velg" data-v="${j}" style="--pf: var(--p${(j % 20) + 1})" aria-label="${esc(etikett)}">${R.avatar(j)}<span class="pt-offer-navn">${esc(R.navn(j))}</span><span class="pt-offer-antall" aria-hidden="true"><b>${n}</b>${pakke(j, sp.tema)}</span></button>`;
      })
      .join("");
    return `
      <div class="pt-velg-hode" style="--pf: var(--p${(fra % 20) + 1})">
        ${R.avatar(fra, "stor")}
        <div class="pt-hvem">
          <p class="etikett"><span class="pt-terningtall" aria-hidden="true">${sp.terning}</span> ${esc(stjel ? R.t("Sekser!") : R.t("Ener!"))}</p>
          <h1 id="skjerm-tittel">${esc(stjel ? R.t("Hvem stjeler {navn} fra?", { navn }) : R.t("Hvem får en pakke av {navn}?", { navn }))}</h1>
        </div>
      </div>
      <div class="pt-ofre${P.kandidater(sp).length > 6 ? " mange" : ""}">${valg}</div>
      ${R.ui.dokk(R.ui.lenkerad(stjel ? R.ui.lenke(R.t("Stjel ikke"), "velg", { v: -1 }) : "", R.ui.lenke(R.t("Rett opp"), "rett-opp"), R.ui.lenke(R.t("Avslutt"), "avslutt")))}`;
  }

  // «Rett opp»: the pile and everyone's parcels with − and +.
  function rettRad(id, etikettHtml, navn, n, min) {
    return `<li data-rad="${esc(id)}"><span class="pt-rett-navn">${etikettHtml}</span>${R.ui.teller("rett", n, min, P.MAKS_PAKKER, { minus: R.t("Én pakke færre for {navn}", { navn }), pluss: R.t("Én pakke mer for {navn}", { navn }) })}</li>`;
  }
  function rettHtml(sp) {
    return `
      <h2 id="ark-tittel">${esc(R.t("Rett opp"))}</h2>
      <p class="ingress">${esc(R.t("Stemmer ikke mobilen med bordet? Endre tallene her."))}</p>
      <ul class="pt-rett">
        ${sp.fase === 1 && sp.status !== "mellom" ? rettRad("haug", `${pakke(0, sp.tema)}<b>${esc(R.t("Haugen"))}</b>`, R.t("haugen"), sp.haug, 0) : ""}
        ${sp.har.map((n, i) => rettRad(String(i), `${R.avatar(i)}<b>${esc(R.navn(i))}</b>`, R.navn(i), n, 0)).join("")}
      </ul>
      <button class="knapp" data-h="lukk-ark">${esc(R.t("Ferdig"))}</button>`;
  }

  // ---------- The hidden clock ----------
  // It runs only while the game screen shows: P.klokkeStart when the screen comes up (also after
  // the page has loaded again), P.klokkePause when it goes away. Nothing of it is ever drawn.

  function stoppTikk() {
    clearInterval(klokkeId);
    klokkeId = null;
  }
  function startKlokke(S) {
    const sp = S.spill;
    stoppTikk();
    if (!sp || sp.ferdig || sp.fase !== 2 || !sp.klokke || S.skjerm !== "spill" || document.hidden) return;
    P.klokkeStart(sp.klokke, Date.now());
    R.lagre();
    klokkeId = setInterval(sjekkKlokke, 250);
  }
  function pauseKlokke(S) {
    stoppTikk();
    const sp = S && S.spill;
    if (!sp || !sp.klokke || sp.klokke.slutt == null) return;
    P.klokkePause(sp.klokke, Date.now());
    R.lagre();
  }
  // Time is up: the horn – but a throw in the air lands first, and a six that is waiting for its
  // choice is allowed to steal.
  function sjekkKlokke() {
    const S = R.S;
    const sp = S && S.spill;
    if (!sp || sp.ferdig || sp.fase !== 2 || S.skjerm !== "spill") return stoppTikk();
    if (ruller || sp.status !== "kast") return;
    if (P.klokkeUte(sp.klokke, Date.now())) hornetGar(S);
  }
  function hornetGar(S) {
    const sp = S.spill;
    stoppTikk();
    clearTimeout(pauseId);
    pause = false;
    P.horn(sp, true);
    tuter = true;
    avslutt(S);
  }
  function avslutt(S) {
    const sp = S.spill;
    // The game counts for the evening («Kveldens gjeng»), but parcels are not points: nobody is placed.
    R.kveld.registrer(sp.har.map((_, i) => ({ i, poeng: 0 })));
    R.statistikk("ferdig", { spillere: sp.antall, pakker: sp.pakker, kast: sp.kast, tyverier: sp.tyverier.reduce((a, b) => a + b, 0), komplett: !!sp.komplett, enere: sp.enere });
    R.gaTil("slutt");
  }

  // The horn: two notes together, two short blasts and a long one. The kit has no sustained sound,
  // so this one is made here, on the kit's audio (nothing when the sound is off).
  function tut() {
    const c = R.lyd.lasOpp();
    if (!c) return;
    try {
      const ut = c.createGain();
      ut.gain.value = 0.5;
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 2400;
      const komp = c.createDynamicsCompressor();
      lp.connect(komp).connect(ut).connect(c.destination);
      const t0 = c.currentTime + 0.03;
      const stot = (start, lengde) => {
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t0 + start);
        g.gain.exponentialRampToValueAtTime(1, t0 + start + 0.035);
        g.gain.setValueAtTime(1, t0 + start + lengde - 0.09);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + start + lengde);
        g.connect(lp);
        // Each note is a stack of soft partials (a horn, not a beep).
        for (const f of [233.1, 293.7]) {
          [1, 0.55, 0.38, 0.22, 0.12].forEach((styrke, k) => {
            const o = c.createOscillator();
            const d = c.createGain();
            o.frequency.value = f * (k + 1);
            d.gain.value = styrke * 0.22;
            o.connect(d).connect(g);
            o.start(t0 + start);
            o.stop(t0 + start + lengde + 0.05);
          });
        }
      };
      stot(0, 0.3);
      stot(0.42, 0.3);
      stot(0.84, 1.7);
    } catch (e) {
      /* no sound is no reason to stop the game */
    }
  }

  // ---------- Playing ----------

  function nyttSpill(S) {
    const o = S.oppsett;
    S.spill = P.nytt({ antall: S.antall, pakker: pakkerFor(S), enere: o.enere, lengde: o.lengde, tema: temaFor({ oppsett: o, spill: null }) });
    ruller = false;
    pause = false;
    const sp = S.spill;
    R.statistikk("start", { spillere: sp.antall, pakker: sp.pakker, enere: sp.enere, lengde: sp.lengde, tema: sp.tema });
  }

  async function kast(S) {
    const sp = S.spill;
    if (!pagar(S) || ruller || pause || sp.status !== "kast" || S.skjerm !== "spill") return;
    if (sp.fase === 1 && sp.haug <= 0) return H.videre(null, null, S);
    const vei = sveipKast;
    sveipKast = null;
    const h = P.kast(sp, 1 + Math.floor(tilfeldig() * 6));
    if (!h) return;
    sp.vri = Math.round(Math.random() * 30 - 15);
    R.lagre(); // what the die shows is decided and saved before it lands
    ruller = true;
    for (const k of R.$$('#skjerm [data-h="kast"]')) k.disabled = true;
    const fortsatt = R.vakt();
    await R.terninger.kast(BRETT, { verdier: [h.v], indekser: [0], retning: vei && vei.retning, styrke: vei ? vei.styrke : 0.42 + Math.random() * 0.2 });
    ruller = false;
    if (!fortsatt() || R.S.spill !== sp) return;
    etterKast(S, h);
  }
  // The die has landed: show what it gave, and whose turn it is now.
  function etterKast(S, h) {
    const sp = S.spill;
    const seks = h.v === 6;
    // A six gets a beat of its own before the next throw (and a taken parcel is seen leaving the pile).
    pause = seks && sp.status === "kast";
    R.vis();
    if (h.hva === "tok") {
      stempel(h.siste ? R.t("Siste pakke!") : R.t("Sekser!"), "lampe");
      R.lyd.riktig();
      setTimeout(() => R.lyd.pling(), 180);
      R.vibrer([30, 40, 60]);
    } else if (h.hva === "stjel") {
      R.lyd.pek();
      R.vibrer([30, 40, 60]);
    } else if (h.hva === "alene") {
      stempel(R.t("Sekser!"), "lampe");
      R.lyd.pling();
    } else if (h.hva === "gi") R.lyd.snu();
    if (sp.status === "mellom") {
      // The pile is empty: the last parcel is seen, then part 2 is explained.
      const fortsatt = R.vakt();
      clearTimeout(pauseId);
      pauseId = setTimeout(() => fortsatt() && R.S.spill === sp && R.gaTil("tyveri"), R.rolig() ? 500 : 1300);
      return;
    }
    if (pause) {
      const fortsatt = R.vakt();
      clearTimeout(pauseId);
      pauseId = setTimeout(
        () => {
          pause = false;
          if (!fortsatt() || R.S.spill !== sp) return;
          for (const k of R.$$('#skjerm [data-h="kast"]')) k.disabled = false;
          sjekkKlokke();
        },
        R.rolig() ? 250 : 800,
      );
      return;
    }
    sjekkKlokke();
  }

  const REGLER = {
    intro: R.t("Legg pakkene i en haug på bordet og mobilen i midten. Mobilen er terningen, viser hvem sin tur det er – og gjemmer klokka."),
    steg: [
      [R.t("Slå en sekser"), R.t("Kast etter tur med ett trykk. En sekser gir deg en pakke fra haugen. Ikke åpne den ennå!")],
      [R.t("Tyverunden"), R.t("Når haugen er tom, starter en hemmelig klokke. Nå stjeler en sekser en pakke fra en annen spiller.")],
      [R.t("Hornet går"), R.t("Ingen vet hvor lenge klokka går. Når hornet lyder, er det slutt – og alle åpner pakkene de sitter med.")],
    ],
    tips: [
      R.t("Sitt i ring og skriv navnene i den rekkefølgen dere sitter. Da er det lett å se hvem som er neste."),
      R.t("Skru opp lyden på mobilen, så alle hører hornet."),
      R.t("Med «Enere gir bort» må den som slår en ener, gi en av pakkene sine til en annen."),
      R.t("Stemmer ikke mobilen med bordet? «Rett opp» lar dere endre tallene når som helst."),
      R.t("Slo du en sekser rett før tiden var ute? Da får du stjele ferdig før hornet går."),
      R.t("Passer like godt til bursdag: Velg stilen «Fest» når dere gjør klart."),
    ],
  };

  R.start({
    id: "pakketyven",
    versjon: 1,
    pagar,

    tilstand: () => ({
      antall: R.klamp(R.felles.navn.filter((n) => String(n || "").trim()).length || 6, P.MIN, P.MAKS),
      oppsett: { pakker: null, enere: false, lengde: "vanlig", tema: null },
      spill: null,
    }),

    lastet(S) {
      const o = (S.oppsett = Object.assign({ pakker: null, enere: false, lengde: "vanlig", tema: null }, S.oppsett && typeof S.oppsett === "object" ? S.oppsett : {}));
      o.pakker = Number.isInteger(o.pakker) ? R.klamp(o.pakker, 2, P.MAKS_PAKKER) : null;
      o.enere = !!o.enere;
      if (!P.LENGDER[o.lengde]) o.lengde = "vanlig";
      if (!TEMAER.includes(o.tema)) o.tema = null;
      S.antall = R.klamp(Number(S.antall) || P.MIN, P.MIN, P.MAKS);
      if (S.spill && !P.gyldig(S.spill)) S.spill = null;
      const sp = S.spill;
      if (sp) {
        const na = Date.now();
        sp.klokke = sp.fase === 2 ? P.klokkeGyldig(sp.klokke, na, sp.lengde) || { igjen: 0, slutt: null } : null;
        // A clock that was still running when the page went away (it was closed without warning):
        // it stood still from the last time the game was saved. The time away never counts.
        if (sp.klokke && sp.klokke.slutt != null) P.klokkePause(sp.klokke, Number.isFinite(S._tid) && S._tid <= na ? S._tid : na);
        if (typeof sp.angre !== "string") sp.angre = null;
      }
      if (["spill", "tyveri", "slutt"].includes(S.skjerm)) S.skjerm = sp ? skjermFor(sp) : "hjem";
    },

    regler: REGLER,

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const sp = S.spill;
          const jul = temaFor(S) === "jul";
          return R.ui.spillhjem({
            slagordHtml: `${esc(R.t("Slå en sekser – ta en pakke."))}<br><em>${esc(jul ? R.t("Og stjel til hornet går. God jul!") : R.t("Og stjel til hornet går!"))}</em>`,
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: pagar(S) ? (sp.fase === 2 ? R.t("Fortsett tyverunden") : R.t("Fortsett · {pakker} igjen", { pakker: pakkerTekst(sp.haug) })) : "",
              ekstraHtml: (sp && sp.ferdig ? R.ui.knapp2(R.t("Til kåringen"), "resultat") : "") + R.ui.lenke(R.t("Slik spiller du"), "regler"),
            }),
            merker: [
              ["4–20", R.t("spillere")],
              ["1", R.t("terning")],
              ["0", R.t("reklame")],
            ],
          });
        },
        inn: () => R.slippVaken(),
      },

      oppsett: {
        tittel: R.t("Nytt spill"),
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          const [a, b] = P.LENGDER[o.lengde].map((s) => s / 60);
          const tema = temaFor(S);
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
            ${R.ui.spillere({ min: P.MIN, max: P.MAKS, tittel: R.t("Hvem er med?"), hjelp: R.t("Skriv navnene i den rekkefølgen dere sitter rundt bordet.") })}
            <section class="seksjon">
              <div class="seksjon-hode"><h2>${esc(R.t("Pakker i haugen"))}</h2></div>
              ${R.ui.teller("pakker", pakkerFor(S), 2, P.MAKS_PAKKER, { id: "pt-pakker", minus: R.t("Færre pakker"), pluss: R.t("Flere pakker") })}
              <p class="hjelp">${esc(R.t("Tell pakkene på bordet. To per spiller er vanlig."))}</p>
            </section>
            <section class="seksjon">
              <div class="seksjon-hode"><h2>${esc(R.t("Tyverunden"))}</h2></div>
              ${R.ui.seg("lengde", Object.keys(P.LENGDER).map((l) => [l, LENGDENAVN[l]]), o.lengde, { etikett: R.t("Hvor lenge tyverunden varer") })}
              <p class="hjelp">${esc(R.t("Hornet går et sted mellom {a} og {b} minutter. Ingen får vite når.", { a, b }))}</p>
            </section>
            ${R.ui.bryter("enere", o.enere, R.t("Enere gir bort"), R.t("Slår du en ener, må du gi en pakke til en annen."))}
            <section class="seksjon">
              <div class="seksjon-hode"><h2>${esc(R.t("Stil"))}</h2></div>
              ${R.ui.seg("tema", [["jul", "🎄 " + R.t("Jul")], ["fest", "🎈 " + R.t("Fest")]], tema, { etikett: R.t("Stil") })}
            </section>
            ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start", { variant: "stor", ikon: "🎁" }))}`;
        },
      },

      spill: {
        tittel: (S) => (S.spill && S.spill.fase === 2 ? R.t("Del 2: Tyverunden") : R.t("Del 1: Haugen")),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          return `<div class="pt-scene pt-${esc(sp.tema)} pt-del${sp.fase}${sp.status === "velg" ? " pt-velger" : ""}">${pyntHtml(sp.tema)}${sp.status === "velg" ? velgHtml(sp) : kastHtml(sp)}</div>`;
        },
        etter: () =>
          R.terninger.koble(BRETT, {
            vedSveip(vei) {
              const S = R.S;
              if (!pagar(S) || ruller || pause || S.spill.status !== "kast" || R.arkApent()) return;
              sveipKast = vei;
              kast(S).catch((feil) => console.error(feil));
            },
          }),
        inn(S) {
          const sp = S.spill;
          if (!sp) return R.gaTil("hjem");
          if (skjermFor(sp) !== "spill") return R.gaTil(skjermFor(sp));
          ruller = false;
          pause = false;
          R.holdVaken();
          R.vedForlat(() => {
            stoppTikk();
            clearTimeout(pauseId);
          });
          startKlokke(S);
          sjekkKlokke();
        },
        ut(S) {
          clearTimeout(pauseId);
          pause = false;
          pauseKlokke(S);
        },
      },

      // The pile is empty: part 2 is explained before the hidden clock starts.
      tyveri: {
        tittel: R.t("Del 2: Tyverunden"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const lydAv = !R.felles.lyd;
          return `<div class="pt-scene pt-${esc(sp.tema)} pt-mellom">
            ${pyntHtml(sp.tema)}
            <div class="pt-mellom-topp">
              ${klokkeSvg()}
              <p class="etikett">${esc(R.t("Del 2: Tyverunden"))}</p>
              <h1 id="skjerm-tittel">${esc(R.t("Haugen er tom!"))}</h1>
              <p class="ingress">${esc(R.t("Nå stjeler dere fra hverandre: Slå en sekser og ta en pakke fra en annen."))}</p>
              <p class="pt-hemmelig">${esc(R.t("Klokka er hemmelig. Når hornet går, er det slutt!"))}</p>
            </div>
            ${lydAv ? `<div class="boks pt-lyd"><p>${esc(R.t("Lyden er av – da hører ingen hornet."))}</p>${R.ui.knapp2(R.t("Skru på lyden"), "lyd-pa", { ikon: "🔊", variant: "liten" })}</div>` : ""}
            ${bordHtml(sp, { utenTur: true })}
            ${R.ui.dokk(R.ui.knapp(R.t("Start klokka"), "start-klokka", { variant: "stor", ikon: "⏱️" }), R.ui.lenkerad(R.ui.lenke(R.t("Rett opp"), "rett-opp"), R.ui.lenke(R.t("Avslutt"), "avslutt")))}
          </div>`;
        },
        inn(S) {
          const sp = S.spill;
          if (!sp) return R.gaTil("hjem");
          if (skjermFor(sp) !== "tyveri") return R.gaTil(skjermFor(sp));
          R.holdVaken();
        },
      },

      slutt: {
        tittel: R.t("Kåringen"),
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const jul = sp.tema === "jul";
          const rader = P.rekkefolge(sp)
            .map((i) => {
              const n = sp.har[i];
              const vist = Math.min(n, 6);
              return `<li class="${n ? "" : "tom"}" style="--pf: var(--p${(i % 20) + 1})">${R.avatar(i)}<span class="pt-res-navn">${esc(R.navn(i))}</span><span class="pt-res-pakker" aria-hidden="true">${Array.from({ length: vist }, (_, k) => pakke(i + k, sp.tema)).join("")}${n > vist ? `<i>+${n - vist}</i>` : ""}</span><b>${esc(n ? pakkerTekst(n) : R.t("ingen pakker"))}</b></li>`;
            })
            .join("");
          const fakta = [`<li><span aria-hidden="true">🎲</span> ${esc(R.t("{n} kast i alt|{n} kast i alt", { n: sp.kast }))}</li>`];
          const seksere = P.flest(sp.seksere);
          if (seksere.length) fakta.push(`<li><span aria-hidden="true">🍀</span> ${esc(R.t("Flest seksere: {navn} ({n})", { navn: R.ramsOpp(seksere.map((i) => R.navn(i))), n: sp.seksere[seksere[0]] }))}</li>`);
          const tyver = P.flest(sp.tyverier);
          if (tyver.length) fakta.push(`<li><span aria-hidden="true">🦝</span> ${esc(R.t("Kveldens pakketyv: {navn} ({n})", { navn: R.ramsOpp(tyver.map((i) => R.navn(i))), n: sp.tyverier[tyver[0]] }))}</li>`);
          return `<div class="pt-scene pt-${esc(sp.tema)} pt-slutt">
            ${pyntHtml(sp.tema)}
            ${R.ui.banner({ etikett: R.t("Kåringen"), tittel: sp.komplett ? R.t("Hornet har gått!") : R.t("Pakkeleken er over"), tekst: jul ? R.t("Nå kan dere åpne pakkene. God jul!") : R.t("Nå kan dere åpne pakkene. Kos dere!"), klasse: "aksent" })}
            <ol class="pt-resultat" aria-label="${esc(R.t("Hvem har hvor mange pakker"))}">${rader}</ol>
            ${sp.har.some((n) => !n) ? `<p class="hjelp">${esc(R.t("Sitter noen uten pakke? Da er det lov å dele."))}</p>` : ""}
            <ul class="pt-fakta">${fakta.join("")}</ul>
            ${R.ui.flereSpill({ antall: sp.antall })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen", { ikon: "🎁" }), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "endre"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}
          </div>`;
        },
        inn(S) {
          const sp = S.spill;
          if (!sp || !sp.ferdig) return R.gaTil(sp ? skjermFor(sp) : "hjem");
          if (tuter) {
            tuter = false;
            tut();
            R.vibrer([350, 120, 350, 120, 900]);
            R.konfetti();
            R.si(R.t("Hornet har gått! Tiden er ute."));
          } else R.lyd.pling();
          R.slippVaken();
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
      endre(el, e, S) {
        S.spill = null;
        R.gaTil("oppsett");
      },
      fortsett(el, e, S) {
        if (pagar(S)) R.gaTil(skjermFor(S.spill));
      },
      resultat(el, e, S) {
        if (S.spill && S.spill.ferdig) R.gaTil("slutt");
      },
      pakker(el, e, S) {
        S.oppsett.pakker = R.klamp(pakkerFor(S) + (Number(el.dataset.v) || 0), 2, P.MAKS_PAKKER);
        R.vis();
      },
      lengde(el, e, S) {
        S.oppsett.lengde = P.LENGDER[el.dataset.v] ? el.dataset.v : "vanlig";
        R.vis();
      },
      enere(el, e, S) {
        S.oppsett.enere = !S.oppsett.enere;
        R.vis();
      },
      tema(el, e, S) {
        S.oppsett.tema = TEMAER.includes(el.dataset.v) ? el.dataset.v : null;
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
      kast(el, e, S) {
        return kast(S);
      },
      // The pile was emptied with «Rett opp»: on to part 2.
      videre(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== 1 || sp.haug > 0) return;
        sp.status = "mellom";
        R.gaTil("tyveri");
      },
      "start-klokka"(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.status !== "mellom") return;
        if (!P.startDel2(sp, P.varighet(sp.lengde, tilfeldig))) return;
        R.lyd.pling();
        R.gaTil("spill");
      },
      "lyd-pa"() {
        if (!R.felles.lyd) {
          R.felles.lyd = true;
          R.lagreFelles();
          R.lyd.pling();
        }
        R.vis(); // (the redraw also sets the sound button in the top bar)
      },
      velg(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.status !== "velg") return;
        const for_ = JSON.stringify({ har: sp.har, tur: sp.tur, velg: sp.velg, sist: sp.sist, tyverier: sp.tyverier });
        const h = P.velg(sp, Number(el.dataset.v));
        if (!h) return;
        sp.angre = for_;
        if (h.hva === "stjal") {
          R.lyd.sveip();
          setTimeout(() => R.lyd.pop(), 140);
          R.vibrer(30);
        } else if (h.hva === "ga") R.lyd.riktig();
        R.vis();
        sjekkKlokke();
      },
      // Take back the last choice (who was stolen from, who was given to) until the next throw.
      angre(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || !sp.angre || ruller || sp.status !== "kast") return;
        let a;
        try {
          a = JSON.parse(sp.angre);
        } catch (feil) {
          a = null;
        }
        sp.angre = null;
        if (a && a.velg) {
          Object.assign(sp, { har: a.har, tur: a.tur, velg: a.velg, sist: a.sist, tyverier: a.tyverier, status: "velg" });
          R.lyd.snu();
          R.toast(R.t("Angret – {navn} velger på nytt", { navn: R.navn(sp.velg.fra) }));
        }
        R.vis();
      },
      "rett-opp"(el, e, S) {
        if (!pagar(S) || ruller) return;
        R.ark(rettHtml(S.spill));
      },
      rett(el, e, S) {
        const sp = S.spill;
        const rad = el.closest("[data-rad]");
        if (!pagar(S) || !rad) return;
        const hvem = rad.dataset.rad === "haug" ? "haug" : Number(rad.dataset.rad);
        if (!P.rett(sp, hvem, Number(el.dataset.v))) return;
        // The row in the sheet is updated in place; the screen under it is drawn again.
        const n = hvem === "haug" ? sp.haug : sp.har[hvem];
        const ut = rad.querySelector("output");
        if (ut) ut.textContent = String(n);
        const [minus, pluss] = rad.querySelectorAll("button");
        if (minus) minus.disabled = n <= 0;
        if (pluss) pluss.disabled = n >= P.MAKS_PAKKER;
        if (S.skjerm === "spill" || S.skjerm === "tyveri") R.vis();
      },
      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || ruller) return;
        const fortsatt = R.vakt();
        const tomt = sp.kast === 0;
        const ja = await R.bekreft(R.t("Avslutte spillet?"), tomt ? R.t("Ingen har kastet ennå. Dere kan alltid starte et nytt.") : R.t("Dere går rett til kåringen med pakkene slik de er nå."), R.t("Avslutt"), R.t("Spill videre"));
        if (!fortsatt() || !ja || !pagar(S)) return;
        if (tomt) {
          S.spill = null;
          R.gaTil("hjem");
          return;
        }
        stoppTikk();
        P.horn(sp, false);
        avslutt(S);
      },
    }),
  });

  // The clock stands still while nobody can see the game: the phone is locked, another app is in
  // front, or the page is on its way out (a reload). It goes on from the same place afterwards.
  const skjult = () => {
    const S = R.S;
    if (S && S.skjerm === "spill") pauseKlokke(S);
  };
  const synlig = () => {
    const S = R.S;
    if (S && S.skjerm === "spill" && !R.paNett()) startKlokke(S);
  };
  document.addEventListener("visibilitychange", () => (document.hidden ? skjult() : synlig()));
  window.addEventListener("pagehide", skjult);
  window.addEventListener("pageshow", synlig);
})();
