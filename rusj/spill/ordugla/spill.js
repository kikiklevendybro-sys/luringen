/* Ordugla — «Dagens ord»: guess the day's five-letter Norwegian word in six tries.
   Green = right letter in the right place, yellow = in the word but somewhere else, grey = not in
   the word (orange/blue in the colour-blind palette). Everyone in Norway gets the same word each
   day (R.dag), and practice mode gives a new word whenever you like. Statistics, the streak and the
   game in progress stay on this phone.
   While playing, the board is updated in place (no R.vis per key press), so fast typing is never
   swallowed by the kit's ghost-tap guard, and the reveal animation runs undisturbed. Every key on
   the on-screen keyboard is the same action ("tast"). */
(function () {
  "use strict";

  const R = window.Rusj;
  const esc = R.esc;
  const D = window.RUSJ_DATA;
  // FROZEN daily order: data/svar.json «dagens»[0] is the word of 9.11.2026, [1] the next day, …
  // Never reorder or delete: new words only go at the end, and a word that must go is replaced in
  // place – otherwise today's and every later daily word would change. (See build/blyord/lag-ordugla-data.mjs.)
  const REKKE = D.svar.dagens;
  const SVAR = REKKE; // every daily word is also a practice word
  const LOV = new Set(SVAR.concat(D.gyldige.ord.split(" "))); // every word you may guess
  const L = 5; // letters
  const MAKS = 6; // tries
  const FORSTE_DAG = R.dag(new Date(Date.UTC(2026, 10, 9, 12))).nr; // the day of «Ordugla nr. 1»
  const OV_SPERRE = 365; // practice never uses the next year's daily words
  const ovStokk = R.kortstokk("ov", SVAR.length);
  const RADER = ["qwertyuiopå", "asdfghjkløæ", "zxcvbnm"];
  const BOKSTAV = /^[a-zæøå]$/;
  const NAVN = { rett: "riktig plass", med: "med, men et annet sted", ikke: "ikke med" };
  const RUTER = { rett: "🟩", med: "🟨", ikke: "⬛" };
  const RUTER_K = { rett: "🟧", med: "🟦", ikke: "⬛" };
  const ROS = ["Genialt!", "Fantastisk!", "Kjempebra!", "Godt jobba!", "Bra!", "Puh, det holdt!"];
  const SLETT_IKON =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8.5 5H20a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 20 19H8.5L2.5 12z"/><path d="M11.5 9.5l5 5M16.5 9.5l-5 5"/></svg>';

  let H; // the actions
  let avslorer = false; // the reveal animation is running: keys wait
  let nyFeiring = false; // celebrate once on the result screen right after a game
  let tikker = null; // countdown to tomorrow's word

  // ---------- Words and days ----------

  const bokstaver = (o) => Array.from(String(o || ""));
  const iDag = () => R.dag().nr;
  const nrFor = (dag) => dag - FORSTE_DAG + 1;
  const dagensOrd = (dag) => {
    const n = REKKE.length;
    return REKKE[(((dag - FORSTE_DAG) % n) + n) % n];
  };
  const stor = (o) => String(o).toLocaleUpperCase("nb");

  // Wordle rules for repeated letters: greens first, then yellows while the answer has that letter left.
  function vurder(gjett, svar) {
    const g = bokstaver(gjett);
    const s = bokstaver(svar);
    const res = g.map((b, i) => (b === s[i] ? "rett" : null));
    const igjen = {};
    s.forEach((b, i) => {
      if (res[i] !== "rett") igjen[b] = (igjen[b] || 0) + 1;
    });
    return res.map((r, i) => {
      if (r) return r;
      if (igjen[g[i]] > 0) {
        igjen[g[i]] -= 1;
        return "med";
      }
      return "ikke";
    });
  }

  // What each key on the keyboard is known to be (the best result so far).
  const RANG = { ikke: 1, med: 2, rett: 3 };
  function tastStatus(sp) {
    const st = {};
    if (!sp) return st;
    for (const g of sp.gjett) {
      const res = vurder(g, sp.ord);
      bokstaver(g).forEach((b, i) => {
        if (!st[b] || RANG[res[i]] > RANG[st[b]]) st[b] = res[i];
      });
    }
    return st;
  }

  // ---------- Games and statistics ----------

  const aktiv = (S) => (S.modus === "ov" ? S.ov : S.dag);
  const iGang = (sp) => !!(sp && !sp.ferdig && (sp.gjett.length || sp.rad));
  const dagenIGang = (S) => iGang(S.dag) && S.dag.nr === iDag();
  const pagar = (S) => dagenIGang(S) || iGang(S.ov);

  function nyttDagspill(S) {
    const nr = iDag();
    S.dag = { nr, ord: dagensOrd(nr), gjett: [], rad: "", ferdig: false, vunnet: false };
    R.statistikk("start", { modus: "dag" });
  }

  // Today's word and the next year's daily words: practice never shows them in advance.
  function kommendeDagsord() {
    const d = iDag();
    const sett = new Set();
    for (let k = 0; k <= OV_SPERRE; k++) sett.add(dagensOrd(d + k));
    return sett;
  }

  function nyttOvespill(S) {
    const sperret = kommendeDagsord();
    let i = ovStokk.neste((n) => !sperret.has(SVAR[n]));
    if (i < 0) i = SVAR.indexOf(R.velg(SVAR.filter((o) => !sperret.has(o))));
    S.ov = { ord: SVAR[i], gjett: [], rad: "", ferdig: false, vunnet: false };
    R.statistikk("start", { modus: "ov" });
  }

  const tomStat = () => ({ spilt: 0, vunnet: 0, rekke: 0, best: 0, fordeling: [0, 0, 0, 0, 0, 0], sistVunnet: null, sistSpilt: null });
  const tall = (n) => (Number.isFinite(Number(n)) && Number(n) > 0 ? Math.floor(Number(n)) : 0);

  // The day's result counts once. A streak is wins on days that follow each other.
  function registrerDag(S, sp) {
    const st = S.stat;
    if (st.sistSpilt === sp.nr) return;
    st.sistSpilt = sp.nr;
    st.spilt += 1;
    if (sp.vunnet) {
      st.vunnet += 1;
      st.fordeling[sp.gjett.length - 1] += 1;
      st.rekke = st.sistVunnet === sp.nr - 1 ? st.rekke + 1 : 1;
      st.sistVunnet = sp.nr;
      st.best = Math.max(st.best, st.rekke);
    } else {
      st.rekke = 0;
    }
    // The front page shows «✓ i dag» and the streak.
    if (sp.nr === iDag()) R.dagligFerdig({ vunnet: sp.vunnet, rekke: st.rekke });
  }
  // The streak shown today: it is broken once a whole day has passed without a win.
  const rekkeNa = (S) => (S.stat.sistVunnet != null && S.stat.sistVunnet >= iDag() - 1 ? S.stat.rekke : 0);

  // ---------- Countdown to the next word (midnight in Norway) ----------

  function sekunderTilNyttOrd() {
    const na = Date.now();
    const deler = {};
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Oslo", hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(na))
      .forEach((p) => (deler[p.type] = Number(p.value)));
    let igjen = 86400 - ((deler.hour % 24) * 3600 + deler.minute * 60 + deler.second);
    const dag = R.dag(new Date(na)).nr;
    // The two nights a year the clocks change, the day is 23 or 25 hours long.
    if (R.dag(new Date(na + igjen * 1000)).nr === dag) igjen += 3600;
    else if (igjen > 3600 && R.dag(new Date(na + (igjen - 3600) * 1000)).nr !== dag) igjen -= 3600;
    return Math.max(1, igjen);
  }
  const klokke = (s) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  const nedtellingHtml = () => `<p class="ou-nedtelling">Nytt ord om <b>${klokke(sekunderTilNyttOrd())}</b></p>`;

  function startNedtelling() {
    clearInterval(tikker);
    const dag = iDag();
    const oppdater = () => {
      const el = R.$(".ou-nedtelling b");
      if (!el) return clearInterval(tikker);
      if (iDag() !== dag) {
        clearInterval(tikker);
        return R.vis(); // a new word is ready
      }
      el.textContent = klokke(sekunderTilNyttOrd());
    };
    tikker = setInterval(oppdater, 1000);
    R.vedForlat(() => clearInterval(tikker));
  }

  // ---------- Markup ----------

  function rutenHtml(b, klasse) {
    return `<span class="ou-rute ${klasse || ""}">${b ? esc(b) : ""}</span>`;
  }

  function radHtml(sp, r) {
    const gjett = sp.gjett[r];
    if (gjett != null) {
      const res = vurder(gjett, sp.ord);
      const b = bokstaver(gjett);
      const etikett = `Forsøk ${r + 1}: ${b.map((x, i) => `${stor(x)} ${NAVN[res[i]]}`).join(", ")}`;
      return `<div class="ou-rad" data-rad="${r}" role="img" aria-label="${esc(etikett)}">${b.map((x, i) => rutenHtml(x, res[i])).join("")}</div>`;
    }
    const na = r === sp.gjett.length && !sp.ferdig;
    const b = na ? bokstaver(sp.rad) : [];
    return `<div class="ou-rad${na ? " na" : ""}" data-rad="${r}"${na ? ` aria-label="Forsøk ${r + 1}"` : ' aria-hidden="true"'}>${Array.from({ length: L }, (_, i) => rutenHtml(b[i], b[i] ? "full" : "")).join("")}</div>`;
  }

  function tastaturHtml(S) {
    const sp = aktiv(S);
    const st = tastStatus(sp);
    const klar = sp && bokstaver(sp.rad).length === L;
    const tast = (b) =>
      `<button class="ou-tast${st[b] ? " " + st[b] : ""}" data-h="tast" data-v="${b}" data-stille aria-label="${esc(stor(b) + (st[b] ? ", " + NAVN[st[b]] : ""))}">${esc(b)}</button>`;
    return `<div class="ou-tastatur" role="group" aria-label="Tastatur">
      <div class="ou-tastrad">${bokstaver(RADER[0]).map(tast).join("")}</div>
      <div class="ou-tastrad">${bokstaver(RADER[1]).map(tast).join("")}</div>
      <div class="ou-tastrad"><button class="ou-tast bred gjett${klar ? " klar" : ""}" data-h="tast" data-v="gjett" data-stille>Gjett</button>${bokstaver(RADER[2]).map(tast).join("")}<button class="ou-tast bred" data-h="tast" data-v="slett" data-stille aria-label="Slett">${SLETT_IKON}</button></div>
    </div>`;
  }

  const forklaringHtml = () =>
    `<span><i class="rett"></i>Riktig plass</span><span><i class="med"></i>Med, feil plass</span><span><i class="ikke"></i>Ikke med</span>`;

  // The guesses in small tiles, with letters (the result screen).
  function miniHtml(sp) {
    return `<div class="ou-mini" role="img" aria-label="Forsøkene dine">${sp.gjett
      .map((g) => {
        const res = vurder(g, sp.ord);
        return `<div class="ou-rad">${bokstaver(g)
          .map((b, i) => rutenHtml(b, res[i]))
          .join("")}</div>`;
      })
      .join("")}</div>`;
  }

  const ordetHtml = (ord) => `<div class="ou-ordet" role="img" aria-label="${esc(stor(ord))}">${bokstaver(ord).map((b) => rutenHtml(b, "rett")).join("")}</div>`;

  function statistikkHtml(S, uthev) {
    const st = S.stat;
    const prosent = st.spilt ? Math.round((st.vunnet / st.spilt) * 100) : 0;
    const maks = Math.max(1, ...st.fordeling);
    return `<div class="ou-tall">
        <div><b>${R.tall(st.spilt)}</b><span>spilt</span></div>
        <div><b>${prosent} %</b><span>vunnet</span></div>
        <div><b>${R.tall(rekkeNa(S))}</b><span>på rad</span></div>
        <div><b>${R.tall(st.best)}</b><span>beste rekke</span></div>
      </div>
      <h3 class="ou-h3">Antall forsøk</h3>
      <ol class="ou-fordeling">${st.fordeling
        .map(
          (n, i) =>
            `<li class="${uthev === i + 1 ? "na" : ""}"><span class="ou-nr">${i + 1}</span><span class="ou-stolpe" style="--andel:${(n / maks).toFixed(3)}" aria-label="${esc(`${R.flertall(n, "gang", "ganger")} på ${i + 1} forsøk`)}">${R.tall(n)}</span></li>`,
        )
        .join("")}</ol>`;
  }

  function statistikkArk(S) {
    const ov = S.ovStat;
    return `
      <h2 id="ark-tittel">Statistikk</h2>
      ${S.stat.spilt ? statistikkHtml(S) : `<p class="ingress">Du har ikke spilt dagens ord ennå. Gjør det, så dukker statistikken opp her.</p>`}
      ${ov.spilt ? `<p class="hjelp">Øving: ${esc(R.flertall(ov.spilt, "ord", "ord"))}, ${esc(R.flertall(ov.vunnet, "riktig", "riktige"))}.</p>` : ""}
      <button class="knapp" data-h="lukk-ark">Lukk</button>`;
  }

  const fargeTekst = (kontrast) =>
    kontrast
      ? "Oransje: riktig bokstav på riktig plass. Blå: bokstaven er med, men et annet sted. Mørk: bokstaven er ikke med."
      : "Grønn: riktig bokstav på riktig plass. Gul: bokstaven er med, men et annet sted. Mørk: bokstaven er ikke med.";
  const FLERE = { antall: 1 }; // the kit titles it «Flere spill du kan spille alene»

  // An example row for the rules: one letter coloured, the rest plain.
  function eksempelHtml(ord, pos, klasse, tekst) {
    return `<div class="ou-eksempel"><div class="ou-rad" aria-hidden="true">${bokstaver(ord)
      .map((b, i) => rutenHtml(b, i === pos ? klasse : "full"))
      .join("")}</div><p>${tekst}</p></div>`;
  }

  // ---------- Board size: six rows always fit above the keyboard ----------

  function tilpass() {
    const brett = R.$(".ou-brett");
    const bord = R.$(".ou-bord");
    if (!brett || !bord) return;
    const gap = window.innerHeight < 640 ? 5 : 6;
    const skjerm = R.$("#skjerm");
    const mellom = parseFloat(getComputedStyle(skjerm).rowGap) || 14;
    const dokk = R.$("#skjerm .dokk");
    const hjelp = R.$(".ou-hjelp");
    const topp = bord.getBoundingClientRect().top + window.scrollY;
    const under = (dokk ? dokk.offsetHeight : 0) + (hjelp ? hjelp.offsetHeight + mellom : 0) + mellom;
    const hoyde = window.innerHeight - topp - under - 2;
    const bredde = bord.clientWidth;
    const r = Math.floor(Math.max(30, Math.min((hoyde - gap * (MAKS - 1)) / MAKS, (bredde - gap * (L - 1)) / L, 64)));
    brett.style.setProperty("--ou-r", r + "px");
    brett.style.setProperty("--ou-gap", gap + "px");
  }
  window.addEventListener("resize", () => {
    if (R.S && R.S.skjerm === "brett") tilpass();
  });

  // ---------- Playing ----------

  const lyd = {
    tast: () => R.lyd.tone(1180, 0, 0.03, "sine", 0.05),
    slett: () => R.lyd.tone(520, 0, 0.04, "sine", 0.05),
    nei: () => R.lyd.tone(220, 0, 0.16, "triangle", 0.14, 170),
    rute: (r) => R.lyd.tone(r === "rett" ? 784 : r === "med" ? 587 : 330, 0, 0.1, "triangle", 0.1),
    tapt: () => {
      R.lyd.tone(523, 0, 0.18, "triangle", 0.1);
      R.lyd.tone(440, 0.18, 0.18, "triangle", 0.1);
      R.lyd.tone(392, 0.36, 0.4, "triangle", 0.1);
    },
  };

  // The row being typed, updated in place.
  function visRad(S, ny) {
    const sp = aktiv(S);
    const rad = R.$(`.ou-rad[data-rad="${sp.gjett.length}"]`);
    if (!rad) return;
    const b = bokstaver(sp.rad);
    rad.querySelectorAll(".ou-rute").forEach((el, i) => {
      el.textContent = b[i] || "";
      el.classList.toggle("full", !!b[i]);
      el.classList.remove("ny");
      if (ny && i === b.length - 1 && !R.rolig()) {
        void el.offsetWidth;
        el.classList.add("ny");
      }
    });
    const g = R.$('.ou-tast[data-v="gjett"]');
    if (g) g.classList.toggle("klar", b.length === L);
  }

  function avvis(tekst) {
    const rad = R.$(".ou-rad.na");
    if (rad && !R.rolig()) {
      rad.classList.remove("risting");
      void rad.offsetWidth;
      rad.classList.add("risting");
    }
    R.toast(tekst);
    R.si(tekst);
    lyd.nei();
    R.vibrer(50);
  }

  function trykk(S, v) {
    const sp = aktiv(S);
    if (!sp || sp.ferdig || avslorer || S.skjerm !== "brett") return;
    if (v === "gjett") return send(S);
    if (v === "slett") {
      if (!sp.rad) return;
      sp.rad = bokstaver(sp.rad).slice(0, -1).join("");
      visRad(S);
      R.lagre();
      lyd.slett();
      return;
    }
    if (!BOKSTAV.test(v) || bokstaver(sp.rad).length >= L) return;
    sp.rad += v;
    visRad(S, true);
    R.lagre();
    lyd.tast();
  }

  function send(S) {
    const sp = aktiv(S);
    const ord = sp.rad;
    if (bokstaver(ord).length < L) return avvis("For få bokstaver");
    if (!LOV.has(ord)) return avvis("Ikke i ordlista");
    if (sp.gjett.includes(ord)) return avvis("Det ordet har du prøvd");
    sp.gjett.push(ord);
    sp.rad = "";
    const vant = ord === sp.ord;
    // Decided and saved right away; the animation is only the show.
    if (vant || sp.gjett.length >= MAKS) {
      sp.ferdig = true;
      sp.vunnet = vant;
      if (S.modus === "dag") registrerDag(S, sp);
      else {
        S.ovStat.spilt += 1;
        if (vant) S.ovStat.vunnet += 1;
      }
      R.statistikk("ferdig", { modus: S.modus, vunnet: vant, forsok: sp.gjett.length });
    }
    R.lagre();
    avslor(S, sp, sp.gjett.length - 1);
  }

  // Flip the tiles one by one, then colour the keyboard.
  function avslor(S, sp, r) {
    avslorer = true;
    const fortsatt = R.vakt();
    const res = vurder(sp.gjett[r], sp.ord);
    const rad = R.$(`.ou-rad[data-rad="${r}"]`);
    const ruter = rad ? Array.from(rad.querySelectorAll(".ou-rute")) : [];
    if (rad) rad.classList.remove("na");
    const rolig = R.rolig();
    const steg = rolig ? 0 : 280;
    ruter.forEach((el, i) => {
      setTimeout(() => {
        if (!fortsatt()) return;
        if (!rolig) el.classList.add("snu");
        setTimeout(
          () => {
            if (!fortsatt()) return;
            el.classList.remove("full", "ny");
            el.classList.add(res[i]);
            lyd.rute(res[i]);
          },
          rolig ? 0 : 240,
        );
      }, i * steg);
    });
    setTimeout(
      () => {
        if (!fortsatt()) return;
        avslorer = false;
        R.vis();
        const b = bokstaver(sp.gjett[r]);
        R.si(`Forsøk ${r + 1}: ${b.map((x, i) => `${stor(x)} ${NAVN[res[i]]}`).join(", ")}.`);
        if (sp.ferdig) feire(S, sp);
      },
      rolig ? 60 : (L - 1) * steg + 560,
    );
  }

  function feire(S, sp) {
    const fortsatt = R.vakt();
    avslorer = true; // no typing on a finished board while we wait
    if (sp.vunnet) {
      const rad = R.$(`.ou-rad[data-rad="${sp.gjett.length - 1}"]`);
      if (rad && !R.rolig())
        rad.querySelectorAll(".ou-rute").forEach((el, i) => {
          el.style.setProperty("--i", i);
          el.classList.add("hopp");
        });
      R.toast(ROS[sp.gjett.length - 1]);
      R.lyd.riktig();
      R.vibrer([30, 50, 30]);
    } else {
      R.toast(`Ordet var ${stor(sp.ord)}`);
      lyd.tapt();
    }
    nyFeiring = true;
    setTimeout(
      () => {
        avslorer = false;
        if (fortsatt()) R.gaTil("resultat");
      },
      R.rolig() ? 900 : sp.vunnet ? 1800 : 2400,
    );
  }

  // Share the day's result as coloured squares (never the word itself).
  function delTekst(S) {
    const sp = S.dag;
    const ruter = S.kontrast ? RUTER_K : RUTER;
    const linjer = sp.gjett.map((g) =>
      vurder(g, sp.ord)
        .map((r) => ruter[r])
        .join(""),
    );
    return `Ordugla nr. ${nrFor(sp.nr)} · ${sp.vunnet ? sp.gjett.length : "X"}/${MAKS}\n\n${linjer.join("\n")}\n\nrusj.no/ordugla`;
  }

  async function del(S) {
    const tekst = delTekst(S);
    try {
      if (navigator.share) {
        await navigator.share({ text: tekst });
        return;
      }
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(tekst);
      R.toast("Kopiert! Lim inn der du vil dele.");
    } catch (e) {
      // No clipboard (old browser or no permission): show the text so it can be copied by hand.
      R.ark(`
        <h2 id="ark-tittel">Del resultatet</h2>
        <p class="ingress">Kopier teksten og lim den inn i en melding.</p>
        <textarea class="tekstfelt ou-deletekst" readonly rows="${tekst.split("\n").length}" aria-label="Resultatet som tekst">${esc(tekst)}</textarea>
        <button class="knapp" data-h="lukk-ark">Ferdig</button>`);
    }
  }

  // Physical keyboard (computers, tablets with a keyboard).
  document.addEventListener("keydown", (e) => {
    const S = R.S;
    if (!S || S.skjerm !== "brett" || e.ctrlKey || e.metaKey || e.altKey || (R.arkApent && R.arkApent())) return;
    const el = e.target;
    if (el && el.closest && el.closest("input, textarea, select")) return;
    // A focused button keeps Enter and Space (keyboard users pressing on-screen keys).
    if ((e.key === "Enter" || e.key === " ") && el && el.closest && el.closest("button, a")) return;
    let v = null;
    if (e.key === "Enter") v = "gjett";
    else if (e.key === "Backspace") v = "slett";
    else if (e.key && e.key.length === 1 && BOKSTAV.test(e.key.toLocaleLowerCase("nb"))) v = e.key.toLocaleLowerCase("nb");
    if (!v) return;
    e.preventDefault();
    trykk(S, v);
  });
  // On-screen keys never take the focus from a mouse or a finger, so Enter on a real keyboard
  // always means «Gjett».
  document.addEventListener("pointerdown", (e) => {
    if (e.target && e.target.closest && e.target.closest(".ou-tast")) e.preventDefault();
  });

  // ---------- The game ----------

  R.start({
    id: "ordugla",
    versjon: 1,
    pagar,
    _dagensOrd: dagensOrd, // for the test that pins the daily words (test/spill/ordugla.e2e.mjs)
    _kommendeDagsord: () => [...kommendeDagsord()],

    tilstand: () => ({
      modus: "dag", // which game the board shows: "dag" (today's word) or "ov" (practice)
      dag: null, // { nr, ord, gjett: [], rad, ferdig, vunnet }
      ov: null, // the same without nr
      stat: tomStat(),
      ovStat: { spilt: 0, vunnet: 0 },
      kontrast: false, // colour-blind palette
    }),

    lastet(S) {
      const ok = (sp) =>
        sp &&
        typeof sp.ord === "string" &&
        bokstaver(sp.ord).length === L &&
        Array.isArray(sp.gjett) &&
        sp.gjett.length <= MAKS &&
        sp.gjett.every((g) => typeof g === "string" && bokstaver(g).length === L) &&
        typeof sp.rad === "string" &&
        bokstaver(sp.rad).length <= L;
      if (!ok(S.dag) || !Number.isInteger(S.dag.nr)) S.dag = null;
      if (!ok(S.ov)) S.ov = null;
      for (const sp of [S.dag, S.ov]) {
        if (!sp) continue;
        sp.vunnet = sp.gjett.includes(sp.ord);
        sp.ferdig = sp.vunnet || sp.gjett.length >= MAKS;
        if (sp.ferdig) sp.rad = "";
      }
      if (S.modus !== "ov") S.modus = "dag";
      const st = S.stat && typeof S.stat === "object" ? S.stat : {};
      S.stat = {
        spilt: tall(st.spilt),
        vunnet: tall(st.vunnet),
        rekke: tall(st.rekke),
        best: tall(st.best),
        fordeling: Array.isArray(st.fordeling) && st.fordeling.length === MAKS ? st.fordeling.map(tall) : tomStat().fordeling,
        sistVunnet: Number.isInteger(st.sistVunnet) ? st.sistVunnet : null,
        sistSpilt: Number.isInteger(st.sistSpilt) ? st.sistSpilt : null,
      };
      // A finished day that was never counted (should not happen, but never lose a result).
      if (S.dag && S.dag.ferdig && S.stat.sistSpilt !== S.dag.nr) registrerDag(S, S.dag);
      // Keep the front page's «✓ i dag» in step (also for days finished before this existed).
      else if (S.dag && S.dag.ferdig && S.dag.nr === iDag()) R.dagligFerdig({ vunnet: S.dag.vunnet, rekke: S.dag.vunnet ? S.stat.rekke : 0 });
      const ov = S.ovStat && typeof S.ovStat === "object" ? S.ovStat : {};
      S.ovStat = { spilt: tall(ov.spilt), vunnet: tall(ov.vunnet) };
      S.kontrast = !!S.kontrast;
      const sp = aktiv(S);
      if ((S.skjerm === "brett" || S.skjerm === "resultat") && !sp) S.skjerm = "hjem";
      if (S.skjerm === "resultat" && sp && !sp.ferdig) S.skjerm = "brett";
      document.documentElement.classList.toggle("ou-kontrast", S.kontrast);
    },

    regler: {
      intro: "Gjett dagens ord på fem bokstaver. Du har seks forsøk – og fargene viser hvor nær du er.",
      get steg() {
        return [
          ["Skriv et ord", "Bruk tastaturet og trykk «Gjett». Ordet må finnes i ordlista."],
          ["Se på fargene", fargeTekst(R.S && R.S.kontrast)],
          ["Finn ordet", "Bruk det du har lært i neste forsøk. Klarer du det på seks?"],
        ];
      },
      tips: [
        "Alle får det samme ordet. Et nytt ord kommer ved midnatt.",
        "Svaret er alltid et vanlig ord i grunnform – for eksempel «hoppe», ikke «hoppet».",
        "Samme bokstav kan være med flere ganger.",
        "Del resultatet som fargeruter – uten å røpe ordet.",
        "Vil du spille mer? «Øv med flere ord» gir nye ord så lenge du vil.",
      ],
      get ekstraHtml() {
        const S = R.S;
        return `<h3>Eksempler</h3>
          ${eksempelHtml("fjell", 0, "rett", "<b>F</b> er med og står på riktig plass.")}
          ${eksempelHtml("glede", 1, "med", "<b>L</b> er med, men et annet sted.")}
          ${eksempelHtml("bobil", 3, "ikke", "<b>I</b> er ikke med i ordet.")}
          ${R.ui.bryter("kontrast", S && S.kontrast, "Farger for fargeblinde", "Oransje og blått i stedet")}`;
      },
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const d = S.dag && S.dag.nr === iDag() ? S.dag : null;
          const ferdig = !!(d && d.ferdig);
          const iGangD = iGang(d);
          const hoved = ferdig
            ? R.ui.knapp("Se dagens resultat", "se-resultat", { ikon: d.vunnet ? "🏆" : "📊" })
            : R.ui.knapp(iGangD ? `Fortsett dagens ord · ${d.gjett.length}/${MAKS}` : "Dagens ord", "dag", { ikon: iGangD ? "▶" : "☀️", variant: iGangD ? "" : "stor" });
          const rekke = rekkeNa(S);
          return R.ui.spillhjem({
            slagordHtml: "Fem bokstaver. Seks forsøk.<br><em>Nytt ord hver dag.</em>",
            knapperHtml:
              hoved +
              (ferdig ? nedtellingHtml() : "") +
              R.ui.knapp2(iGang(S.ov) ? "Fortsett øvingen" : "Øv med flere ord", "ov", { ikon: "🔁" }) +
              R.ui.lenkerad(R.ui.lenke("Statistikk", "statistikk"), R.ui.lenke("Slik spiller du", "regler")),
            merker: [["5", "bokstaver"], ["6", "forsøk"], rekke ? [`🔥 ${rekke}`, rekke === 1 ? "dag på rad" : "dager på rad"] : [R.tall(SVAR.length), "ord"]],
          });
        },
        inn(S) {
          if (S.dag && S.dag.nr === iDag() && S.dag.ferdig) startNedtelling();
        },
      },

      brett: {
        tittel: (S) => (S.modus === "ov" ? "Øving" : "Dagens ord"),
        tilbake: "hjem",
        vis(S) {
          const sp = aktiv(S);
          const rader = Array.from({ length: MAKS }, (_, r) => radHtml(sp, r)).join("");
          const hjelp = sp.ferdig
            ? ""
            : sp.gjett.length
              ? `<div class="ou-hjelp ou-forklaring"><span class="ou-fargeforklaring" aria-hidden="true">${forklaringHtml()}</span>${S.modus === "ov" ? R.ui.lenke("Gi opp", "gi-opp") : ""}</div>`
              : `<p class="ou-hjelp">Skriv et ord på fem bokstaver og trykk <b>Gjett</b>.</p>`;
          return `
            <h1 class="vh" id="skjerm-tittel">${S.modus === "ov" ? "Øving" : "Dagens ord"}</h1>
            <div class="ou-bord"><div class="ou-brett" role="group" aria-label="Brettet">${rader}</div></div>
            ${hjelp}
            ${R.ui.dokk(sp.ferdig ? R.ui.knapp("Se resultatet", "resultat", { ikon: sp.vunnet ? "🏆" : "📊" }) : tastaturHtml(S))}`;
        },
        etter() {
          tilpass();
        },
        inn() {
          avslorer = false;
        },
        ut() {
          avslorer = false;
        },
      },

      resultat: {
        tittel: (S) => (S.modus === "ov" ? "Øving" : `Ordugla nr. ${nrFor(S.dag.nr)}`),
        tilbake: "hjem",
        vis(S) {
          const sp = aktiv(S);
          const n = sp.gjett.length;
          const ov = S.modus === "ov";
          const gammel = !ov && sp.nr !== iDag(); // yesterday's result, a new word is ready
          const etikett = sp.vunnet ? ROS[n - 1] : ov ? "Ikke denne gangen" : "Ikke i dag";
          const tittel = sp.vunnet ? (n === 1 ? "Du fant ordet på første forsøk!" : `Du fant ordet på ${n} forsøk!`) : "Ordet var";
          const banner = `
            <div class="banner ou-banner">
              ${R.figur()}
              <p class="etikett">${esc(etikett)}</p>
              <h1 id="skjerm-tittel">${esc(tittel)}${sp.vunnet ? "" : `<span class="vh"> ${esc(stor(sp.ord))}</span>`}</h1>
              ${sp.vunnet ? "" : ordetHtml(sp.ord)}
              ${sp.vunnet || ov ? "" : `<p class="ingress">Ordet var vrient i dag. Nytt ord i morgen!</p>`}
            </div>`;
          if (ov) {
            const o = S.ovStat;
            const tally = o.vunnet ? `Du har klart ${R.tall(o.vunnet)} av ${R.tall(o.spilt)} øveord.` : "Øvelse gjør mester – prøv et nytt ord!";
            return `${banner}
              ${miniHtml(sp)}
              <p class="hjelp">${esc(tally)}</p>
              ${R.ui.flereSpill(FLERE)}
              ${R.ui.dokk(R.ui.knapp("Nytt ord", "nytt-ov", { ikon: "🔁" }), R.ui.lenkerad(R.ui.lenke("Til Ordugla", "hjem"), '<a class="lenke" href="/">Alle spill</a>'))}`;
          }
          return `${banner}
            ${miniHtml(sp)}
            ${gammel ? `<p class="ou-nedtelling"><b>Et nytt ord er klart!</b></p>` : nedtellingHtml()}
            <section class="seksjon ou-stat" aria-labelledby="ou-stat-tittel">
              <h2 id="ou-stat-tittel">Statistikk</h2>
              ${statistikkHtml(S, sp.vunnet ? n : 0)}
            </section>
            ${R.ui.flereSpill(FLERE)}
            ${R.ui.dokk(
              gammel ? R.ui.knapp("Spill dagens ord", "dag", { ikon: "☀️" }) : R.ui.knapp("Del resultatet", "del", { ikon: "📤" }),
              R.ui.lenkerad(R.ui.lenke("Øv med flere ord", "ov"), '<a class="lenke" href="/">Alle spill</a>'),
            )}`;
        },
        inn(S) {
          R.slippVaken();
          const sp = aktiv(S);
          if (S.modus === "dag" && sp.nr === iDag()) startNedtelling();
          if (!nyFeiring) return;
          nyFeiring = false;
          if (sp.vunnet && sp.gjett.length <= 4) {
            R.lyd.fanfare();
            R.konfetti();
          } else if (sp.vunnet) {
            R.lyd.pling();
          }
          if (S.modus === "dag") {
            const fortsatt = R.vakt();
            setTimeout(() => fortsatt() && R.visInstallTips(), 3000);
          }
        },
      },
    },

    handlinger: (H = {
      dag(el, e, S) {
        if (!S.dag || S.dag.nr !== iDag()) nyttDagspill(S);
        S.modus = "dag";
        R.gaTil(S.dag.ferdig ? "resultat" : "brett");
      },
      ov(el, e, S) {
        if (!S.ov || S.ov.ferdig) nyttOvespill(S);
        S.modus = "ov";
        R.gaTil("brett");
      },
      "nytt-ov"(el, e, S) {
        nyttOvespill(S);
        S.modus = "ov";
        R.gaTil("brett");
      },
      "se-resultat"(el, e, S) {
        if (!S.dag || S.dag.nr !== iDag() || !S.dag.ferdig) return H.dag(el, e, S);
        S.modus = "dag";
        R.gaTil("resultat");
      },
      resultat(el, e, S) {
        const sp = aktiv(S);
        if (sp && sp.ferdig) R.gaTil("resultat");
      },
      hjem() {
        R.gaTil("hjem");
      },
      tast(el, e, S) {
        trykk(S, el.dataset.v);
      },
      async "gi-opp"(el, e, S) {
        const fortsatt = R.vakt();
        const ja = await R.bekreft("Gi opp ordet?", "Du får se svaret, og ordet teller som tapt i øvingen.", "Gi opp", "Fortsett");
        const sp = S.ov;
        if (!ja || !fortsatt() || S.modus !== "ov" || !sp || sp.ferdig || avslorer) return;
        sp.ferdig = true;
        sp.vunnet = false;
        sp.rad = "";
        S.ovStat.spilt += 1;
        R.statistikk("ferdig", { modus: "ov", vunnet: false, forsok: sp.gjett.length, gaOpp: true });
        R.gaTil("resultat");
      },
      statistikk(el, e, S) {
        R.ark(statistikkArk(S));
      },
      del(el, e, S) {
        if (S.dag && S.dag.ferdig) return del(S);
      },
      // The switch lives in the rules sheet: update it in place (the examples above it change colour).
      kontrast(el, e, S) {
        S.kontrast = !S.kontrast;
        document.documentElement.classList.toggle("ou-kontrast", S.kontrast);
        el.setAttribute("aria-pressed", String(S.kontrast));
        const steg = R.$("#ark .steg li:nth-child(2) span");
        if (steg) steg.textContent = fargeTekst(S.kontrast);
        R.lagre();
        R.si(S.kontrast ? "Farger for fargeblinde er på." : "Vanlige farger er på.");
      },
    }),
  });
})();
