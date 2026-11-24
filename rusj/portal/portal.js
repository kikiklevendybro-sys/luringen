/* rusj.no front page («Miks»): one list of every game, «Alle spill A–Å», written into the page by
   the build: small cards with the mascot, the name and what the game is. The search in the top bar
   (rusj/portal/sok.js), the shortcuts («Med barna», «Vorspiel» …), the rooms (Fest, Familie …) and
   the three questions behind «Hjelp oss å velge» all filter that one list in place – then it is rows
   with the facts; what is chosen shows as chips that can be removed, and with a choice the three
   best suggestions (rusj/portal/finner.js) come first. Around it: «Fortsett der dere slapp», «Dagens», «Kveldens gjeng»,
   «Overrask meg» (a slot machine), the 18+ door for the drinking games, the install tip and «Send
   rusj til gjengen». Reads window.RUSJ_SPILLISTE (written by the build). Nothing leaves the device.
   The same file runs every edition (rusj/SPRAK.md): texts through t() from /felles/tekst.js. */
(function () {
  "use strict";

  const T = window.RusjTekst;
  const t = T.t;
  // Another edition keeps its own front-page state (rusj.en.kveld …); rusj.felles is shared.
  const k = (n) => "rusj." + (T.sprak === "nb" ? "" : T.sprak + ".") + n;
  const url = (s) => s.url || "/" + s.id + "/";

  // Old Luringen join links (rusj.no/#CODE) moved to /luringen/. Only real codes are sent on: eight
  // or fifteen characters from Luringen's own alphabet (digits and capital letters without I, L, O
  // and U) – never a place on this page (#alle, #overrask, #spill …).
  const hash = location.hash || "";
  if (T.sprak === "nb" && /^#([0-9A-HJKMNP-TV-Z]{8}|[0-9A-HJKMNP-TV-Z]{15})$/.test(hash) && !document.getElementById(hash.slice(1))) {
    location.replace("/luringen/" + hash);
    return;
  }

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  // A sentence with markup in it: the text is escaped, then the {places} get the markup.
  const th = (nokkel, html) => esc(t(nokkel)).replace(/\{(\w+)\}/g, (hele, n) => (n in html ? html[n] : hele));
  const har = (o, n) => !!o && Object.prototype.hasOwnProperty.call(o, n);
  const SPILL = window.RUSJ_SPILLISTE || [];
  const spillAv = new Map(SPILL.map((s) => [s.id, s]));
  const F = window.RusjFinner;
  const D = window.RusjDaglig;
  const MANED = new Date().getMonth() + 1;
  const rolig = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const fra = (a, b) => (a === b ? `${a}` : `${a}–${b}`);

  const les = (n, std) => {
    try {
      const v = localStorage.getItem(n);
      return v == null ? std : JSON.parse(v);
    } catch (e) {
      return std;
    }
  };
  const skriv = (n, v) => {
    try {
      localStorage.setItem(n, JSON.stringify(v));
    } catch (e) {
      /* ignore */
    }
  };

  // ---------- 18+ (shared with the games: rusj.felles.over18) ----------

  const felles = () => les("rusj.felles", {}) || {};
  let over18 = !!felles().over18;
  const visAlder = () => document.body.classList.toggle("over18", over18);
  visAlder();

  function bekreft18() {
    return new Promise((ferdig) => {
      const d = $("#dialog");
      d.innerHTML = `
        <h2 id="dialog-tittel">${esc(t("Er du 18 år eller eldre?"))}</h2>
        <p>${esc(t("Drikkespillene er for voksne. Alkoholfritt teller like mye, ingen skal presses, og vann er alltid lov."))}</p>
        <div class="dialog-knapper stabel">
          <button type="button" class="knapp" value="ja">${esc(t("Ja, jeg er 18 eller eldre"))}</button>
          <button type="button" class="knapp-2" value="nei" autofocus>${esc(t("Nei"))}</button>
        </div>`;
      const svar = (ja) => {
        d.close();
        if (ja) {
          over18 = true;
          skriv("rusj.felles", Object.assign(felles(), { over18: true }));
          visAlder();
        }
        ferdig(ja);
      };
      d.querySelector('[value="ja"]').addEventListener("click", () => svar(true));
      d.querySelector('[value="nei"]').addEventListener("click", () => svar(false));
      d.addEventListener("cancel", () => ferdig(false), { once: true });
      d.showModal();
    });
  }

  // ---------- A game as the page draws it ----------

  const MOB_LEST = { en: t("én mobil"), hver: t("hver sin mobil"), begge: t("én eller flere mobiler") };
  const stor = (s) => s.charAt(0).toLocaleUpperCase(T.lokale) + s.slice(1);
  // The facts of a game in one sentence: «3 til 10 spillere, én mobil, 10 til 20 minutter …».
  function faktaLest(s) {
    const [a, b] = s.spillere;
    const [f, til] = s.minutter;
    return [
      a === b ? (a === 1 ? t("én spiller") : t("{n} spillere", { n: a })) : t("{a} til {b} spillere", { a, b }),
      MOB_LEST[s.mobiler],
      f === til ? t("{n} minutter", { n: f }) : t("{a} til {b} minutter", { a: f, b: til }),
      s.tagger.includes("daglig") && t("ny oppgave hver dag"),
      s.motMobilen && t("kan spilles mot mobilen"),
      s.nett && t("kan spilles på nett"),
      s.alder18 && t("for voksne over 18 år"),
    ]
      .filter(Boolean)
      .join(", ");
  }
  // What a screen reader hears for a game (the same sentence as the build writes into the list).
  const etikett = (s) => `${s.navn}: ${s.undertittel}. ${s.kort} ${stor(faktaLest(s))}.`;
  // A well-known game inside a game (spill.json "varianter"): where it opens, and its facts – the
  // game's own, but for what the variant says differently (and never «ny oppgave hver dag»).
  const variantUrl = (s, v) => url(s) + "#variant=" + v.id;
  const somVariant = (s, v) => Object.assign({}, s, { tagger: s.tagger.filter((x) => x !== "daglig") }, v.spillere ? { spillere: v.spillere } : null, v.minutter ? { minutter: v.minutter } : null, v.nett === false ? { nett: false } : null);
  // «Fra 7 år · 3–8 spillere · 10–30 min · én mobil · kan spilles på nett»: why a suggestion fits.
  // [kind, text]: the kind lets a narrow card leave the phones out.
  function grunn(s) {
    const [a, b] = s.spillere;
    const [f, til] = s.minutter;
    return [
      ["alder", s.alder18 ? "18+" : t("Fra {n} år", { n: s.alder })],
      ["spillere", a === b ? (a === 1 ? t("1 spiller") : t("{n} spillere", { n: a })) : t("{a}–{b} spillere", { a, b })],
      ["tid", f === til ? `${f} min` : `${f}–${til} min`],
      ["mobiler", MOB_LEST[s.mobiler]],
      ["nett", s.nett && t("kan spilles på nett")],
    ].filter(([, tekst]) => tekst);
  }
  const ikon = (navn) => `<svg class="fakta-ikon" aria-hidden="true" focusable="false"><use href="#i-${navn}"/></svg>`;
  // The mascot: its own picture (/<id>/figur.svg), fetched when it comes near unless `straks`.
  const bilde = (s, straks) => (s && s.fig ? `<img src="${esc(s.fig)}" alt=""${straks ? "" : ' loading="lazy"'} decoding="async">` : "");
  const nettMerke = () => `<span class="nett-merke" aria-hidden="true">${ikon("nett")}${esc(t("På nett"))}</span>`;
  // The facts of a row: players, minutes and «På nett» (the link's name says them aloud).
  function fakta(s) {
    const [f, til] = s.minutter;
    return `<span class="spillflis-fakta" aria-hidden="true"><span>${ikon("spillere")}${fra(...s.spillere)}</span><span>${ikon("tid")}${fra(f, til)} min</span>${s.nett ? `<span class="fakta-nett">${ikon("nett")}${esc(t("På nett"))}</span>` : ""}</span>`;
  }
  // A game in a list, as the build writes «Alle spill A–Å» (flis() in scripts/rusj.mjs): the
  // mascot, the name and the genre – and here the facts too. o.fortsett: a game left in the middle.
  // o.variant: a well-known game inside this one, as a row of its own: «FreeCell · i Kortkongen».
  function flis(s, o = {}) {
    if (o.variant) {
      const v = o.variant;
      const g = somVariant(s, v);
      const i = t("i {spill}", { spill: s.navn });
      const sjanger = v.undertittel || s.undertittel;
      return `<a class="spillflis" href="${esc(variantUrl(s, v))}" style="--kf: ${s.farge}" aria-label="${esc(`${v.navn}, ${i}: ${sjanger}. ${stor(faktaLest(g))}.`)}"><span class="spillflis-bilde">${bilde(s)}</span><span class="spillflis-tekst"><span class="spillflis-navn">${esc(v.navn)} <span class="spillflis-i">· ${esc(i)}</span></span><span class="spillflis-sjanger">${esc(sjanger)}</span>${fakta(g)}</span></a>`;
    }
    const merke = o.fortsett
      ? `<span class="flis-merke fortsett" aria-hidden="true">${esc(t("Fortsett"))}</span>`
      : s.alder18
        ? '<span class="flis-merke atten" aria-hidden="true">18+</span>'
        : s.tagger.includes("daglig")
          ? '<span class="flis-merke dagens" aria-hidden="true">📅</span>'
          : "";
    const navn = (o.fortsett ? t("Fortsett.") + " " : "") + etikett(s);
    return `<a class="spillflis" href="${esc(url(s))}" style="--kf: ${s.farge}" aria-label="${esc(navn)}"><span class="spillflis-bilde">${bilde(s)}${merke}${s.nett ? nettMerke() : ""}</span><span class="spillflis-tekst"><span class="spillflis-navn">${esc(s.navn)}</span><span class="spillflis-sjanger">${esc(s.undertittel)}</span>${fakta(s)}</span></a>`;
  }
  // A bigger card with the reason it fits (the three best suggestions).
  function forslag(s, nr) {
    const merker = [s.tagger.includes("daglig") && `<span class="kort-merke dagens">${esc(t("Dagens"))}</span>`, s.motMobilen && `<span class="kort-merke">${esc(t("Mot mobilen"))}</span>`, s.nett && `<span class="kort-merke nett">${ikon("nett")}${esc(t("På nett"))}</span>`].filter(Boolean).join("");
    const navn = `${t("Nummer {n}.", { n: nr })} ${etikett(s)}${s.alder18 ? "" : " " + t("Fra {n} år", { n: s.alder }) + "."}`;
    return `<li class="forslagkort" data-id="${s.id}"><a href="${esc(url(s))}" style="--kf: ${s.farge}" aria-label="${esc(navn)}"><span class="forslagkort-bilde"><span class="topp-nr" aria-hidden="true">${nr}</span>${bilde(s, true)}</span><span class="forslagkort-sjanger">${esc(s.undertittel)}</span><span class="forslagkort-navn">${esc(s.navn)}</span>${merker ? `<span class="kort-merker" aria-hidden="true">${merker}</span>` : ""}<span class="kort-grunn" aria-hidden="true">${grunn(s)
      .map(([slag, tekst]) => `<span class="grunn-${slag}">${esc(tekst)}</span>`)
      .join(" ")}</span></a></li>`;
  }

  // ---------- Search (rusj/portal/sok.js) ----------
  // The names people use for a game, a typo put right, head counts («2 spillere», «for to»), the
  // facts in whole phrases («én mobil», «alene», «mot mobilen», «på nett», «kjapt») and the words
  // for a kind of game («selskapsleker», «vors», «bursdag» …, from rusj/seo.json).
  const Sok = window.RusjSok.lag({ spill: SPILL, taggsok: window.RUSJ_TAGGSOK || {}, sprak: T.sprak, F });
  let sok = "";
  let funn = null; // what the search found for `sok`; null while nothing is typed
  function settSok(q) {
    sok = q;
    funn = q ? Sok.sok(q) : null;
  }

  // ---------- What the list shows ----------
  // One room, the three answers (set by a shortcut or one by one) and the search, all at once.
  // Kept in rusj.portal (not the search). The page before this one kept { antall, tagg, finn }: its
  // type becomes the room that holds it, its player count the nearest answer.

  const lagret = les(k("portal"), {}) || {};
  const GAMLE_TAGGER = { daglig: "dagens", fest: "fest", familie: "familie", barn: "barn", alene: "alene", klassiker: "klassikere", kort: "kort", ord: "ord", quiz: "ord", arkade: "arkade", drikke: "voksen" };
  let rom = typeof lagret.rom === "string" && har(F.ROM, lagret.rom) ? lagret.rom : typeof lagret.tagg === "string" && har(GAMLE_TAGGER, lagret.tagg) ? GAMLE_TAGGER[lagret.tagg] : "";
  let hurtig = typeof lagret.hurtig === "string" && har(F.HURTIG, lagret.hurtig) ? lagret.hurtig : "";
  let valg = F.normaliser(lagret.finn, over18);
  if (!valg.antall && Number.isInteger(lagret.antall) && lagret.antall > 0) valg.antall = F.naermesteBand(lagret.antall);
  if (hurtig) valg = F.HURTIG[hurtig](over18);
  if (rom === "voksen" && !over18) rom = "";
  const lagre = () => skriv(k("portal"), { rom, hurtig, finn: valg });

  const synlig = (s) => over18 || !s.alder18;
  const svart = () => !F.ubesvart(valg);
  // In the 18+ room the answers mean an adult party: its drinking games count.
  const finnValg = () => (rom === "voksen" && valg.yngst === "voksen" ? Object.assign({}, valg, { yngst: "fest" }) : valg);
  // The room and the answers (a variant's row follows its game's), and the search on top of them.
  const passerValg = (s) => synlig(s) && (!rom || F.iRom(s, rom)) && (!svart() || F.passer(s, finnValg(), { maned: MANED }));
  const passer = (s) => passerValg(s) && (!funn || funn.av.has(s.id));
  const filtrert = () => !!(rom || svart() || sok);

  // ---------- The drinking games in the list: only once someone is 18 ----------

  const liste = $("#alle-liste");
  const sorter = (a, b) => a.localeCompare(b, T.lokale);
  function synk18() {
    const der = $$("li[data-alder18]", liste);
    if (!over18) {
      der.forEach((li) => li.remove());
      return;
    }
    if (der.length) return;
    for (const s of SPILL.filter((x) => x.alder18)) {
      const li = document.createElement("li");
      li.dataset.id = s.id;
      li.dataset.b = s.navn.charAt(0).toLocaleUpperCase(T.lokale);
      li.setAttribute("data-alder18", "");
      li.innerHTML = flis(s);
      liste.insertBefore(li, $("#dor-celle") || null); // (ordne() puts it in its place)
    }
  }

  // The order of the rows: A–Å as the build wrote the list (the drinking games put in by name) –
  // or, while something is typed, the search's own order: the best match first.
  // A search also finds the well-known games inside games («freecell», «fem på rad»): each is a row
  // of its own (li[data-var], never li[data-id]: it is not a game) that opens the game with it
  // chosen. Made when a search shows it, taken away when it does not.
  const statisk = $$("li[data-id]", liste).map((li) => li.dataset.id);
  const varianter = new Map(); // «id#variant» → its row
  let rekke = statisk.join();
  function ordne() {
    const li = new Map($$("li[data-id]", liste).map((x) => [x.dataset.id, x]));
    const rader = []; // [key, row]
    const vist = new Set();
    if (funn) {
      for (const x of funn.treff) {
        if (!x.v) {
          if (li.has(x.s.id)) rader.push([x.s.id, li.get(x.s.id)]);
          continue;
        }
        if (!passerValg(x.s)) continue;
        if (!varianter.has(x.n)) {
          const rad = document.createElement("li");
          rad.dataset.var = x.n;
          rad.innerHTML = flis(x.s, { variant: x.v });
          varianter.set(x.n, rad);
        }
        vist.add(x.n);
        rader.push([x.n, varianter.get(x.n)]);
      }
      const tatt = new Set(rader.map(([n]) => n));
      for (const [id, el] of li) if (!tatt.has(id)) rader.push([id, el]);
    } else {
      const ider = statisk.filter((id) => li.has(id));
      for (const id of li.keys()) {
        if (statisk.includes(id)) continue;
        const etter = ider.findIndex((x) => sorter(spillAv.get(x).navn, spillAv.get(id).navn) > 0);
        ider.splice(etter < 0 ? ider.length : etter, 0, id);
      }
      for (const id of ider) rader.push([id, li.get(id)]);
    }
    for (const [n, el] of varianter) {
      if (vist.has(n)) continue;
      el.remove();
      varianter.delete(n);
    }
    const ny = rader.map(([n]) => n).join();
    if (ny === rekke) return;
    rekke = ny;
    const slutt = $("#dor-celle");
    for (const [, el] of rader) liste.insertBefore(el, slutt);
  }
  // Under the row of a game with well-known games inside it: «Også: Edderkoppkabal · FreeCell …»,
  // each a link straight to it. Shown in the rows of a room, a shortcut or the three questions –
  // not while words are searched for: then the ones that match are rows of their own.
  const ogsa = (s) =>
    `<p class="flis-ogsa"><span>${esc(t("Også:"))}</span>${s.varianter.map((v) => `<a href="${esc(variantUrl(s, v))}" aria-label="${esc(`${v.navn}, ${t("i {spill}", { spill: s.navn })}`)}">${esc(v.navn)}</a>`).join("")}</p>`;

  // The 18+ room: a door until someone is 18, then a room like the others.
  const voksenKnapp = $('#rommene [data-rom="voksen"]');
  const laastRom = voksenKnapp ? voksenKnapp.innerHTML : "";
  function visVoksenRom() {
    if (!voksenKnapp || over18 === !voksenKnapp.classList.contains("rom-laast")) return; // drawn already
    const n18 = SPILL.filter((s) => s.alder18).length;
    voksenKnapp.classList.toggle("rom-laast", !over18);
    voksenKnapp.parentElement.classList.toggle("rom-bred", !over18);
    if (!over18) {
      voksenKnapp.innerHTML = laastRom;
      voksenKnapp.removeAttribute("aria-pressed");
      voksenKnapp.removeAttribute("aria-label");
      return;
    }
    const VOKSEN_FIGURER = ["ringen", "hjulet"];
    const figurer = [...VOKSEN_FIGURER.map((id) => spillAv.get(id)), ...SPILL.filter((s) => s.alder18)].filter((s, i, a) => s && s.alder18 && a.indexOf(s) === i).slice(0, 2);
    voksenKnapp.setAttribute("aria-label", `${t("Drikkespill 18+")}: ${t("{antall} spill", { antall: n18, n: n18 })}`);
    voksenKnapp.innerHTML = `<span class="rom-navn">18+</span><span class="rom-antall" aria-hidden="true">${n18}</span><span class="rom-gjeng" aria-hidden="true">${figurer.map((s) => bilde(s, true)).join("")}</span>`;
  }

  // ---------- The three questions («Hjelp oss å velge») ----------

  const yngstValg = $("#finner-yngst");
  function visFinner() {
    $$("[data-finn-antall]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.finnAntall === valg.antall)));
    $$("[data-finn-lyst]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.finnLyst === valg.lyst)));
    let fest = $('option[value="fest"]', yngstValg);
    if (over18 && !fest) {
      fest = document.createElement("option");
      fest.value = "fest";
      fest.textContent = t("Voksen fest (18+)");
      yngstValg.append(fest);
    } else if (!over18 && fest) yngstValg.removeChild(fest);
    yngstValg.value = String(valg.yngst);
    const trinn = F.alderTrinn(over18);
    const her = trinn.indexOf(valg.yngst);
    // aria-disabled, not disabled: the button keeps the focus at the end of the steps.
    $('[data-finn-yngst="-1"]').setAttribute("aria-disabled", String(her <= 0));
    $('[data-finn-yngst="1"]').setAttribute("aria-disabled", String(her >= trinn.length - 1));
  }

  // ---------- Drawing the list, the chips and the suggestions ----------

  const antallTekst = (band) => {
    const [a, b] = band.split("-");
    return band === "1" ? t("1 spiller") : b ? t("{a}–{b} spillere", { a, b }) : t("{n} spillere", { n: a });
  };
  const knappTekst = (sel) => {
    const b = $(sel);
    return b ? `${b.dataset.ikon ? b.dataset.ikon + " " : ""}${b.dataset.navn || b.textContent.trim()}` : "";
  };
  function aktiveValg() {
    const ut = [];
    if (rom) ut.push(["rom", knappTekst(`#rommene [data-rom="${rom}"]`)]);
    if (hurtig) ut.push(["hurtig", knappTekst(`[data-hurtig="${hurtig}"]`)]);
    else {
      if (valg.antall) ut.push(["antall", antallTekst(valg.antall)]);
      if (valg.yngst !== "voksen") ut.push(["yngst", valg.yngst === "fest" ? t("Voksen fest (18+)") : `${t("Yngste")} ${t("{n} år", { n: valg.yngst })}`]);
      if (valg.lyst !== "alt") ut.push(["lyst", ($(`[data-finn-lyst="${valg.lyst}"]`) || {}).textContent || valg.lyst]);
    }
    if (sok) ut.push(["sok", `«${sok}»`]);
    return ut;
  }

  let siTimer = null;
  // Read aloud, politely: what the list shows now. A search waits until the typing stops.
  function si(tekst, vent) {
    clearTimeout(siTimer);
    siTimer = setTimeout(() => ($("#si").textContent = tekst), vent ? 700 : 50);
  }

  // The best suggestions: three, and three more at a time on «Vis flere» (at most nine).
  const BESTE = 3;
  let beste = [];
  let besteVist = BESTE;
  function visBeste() {
    const boks = $("#beste");
    boks.hidden = beste.length < BESTE;
    boks.innerHTML =
      beste.length < BESTE
        ? ""
        : `<h3 class="beste-tittel" id="beste-t">${esc(t("Våre tre beste forslag"))}</h3><ol class="beste-liste" aria-label="${esc(t("Forslag"))}">${beste
            .slice(0, besteVist)
            .map((s, i) => forslag(s, i + 1))
            .join("")}</ol>${beste.length > besteVist ? `<button type="button" class="knapp-2 liten beste-mer" id="beste-mer">${esc(t("Vis flere"))}</button>` : ""}`;
  }
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#beste-mer")) return;
    const for_ = besteVist;
    besteVist += BESTE;
    visBeste();
    // On to the first new card (the button may be gone now).
    const ny = $$("#beste .forslagkort a")[for_];
    if (ny) ny.focus();
  });

  // Never a dead end: with nothing to show after a search, say so and offer something – the
  // nearest we have when a well-known game is not here yet, else three of the most played – and
  // the kinds of game. (What was typed is shown as text, never as markup.)
  function ingenTreff() {
    if (!sok) return `<p>${esc(svart() ? t("Ingen spill passer akkurat det. Prøv en annen alder eller et annet ønske.") : t("Ingen spill passer akkurat det. Prøv et annet søkeord, et annet antall eller en annen type."))}</p>`;
    const ikke = funn && funn.ikkeEnna;
    const mestSpilt = (liste) => liste.filter((s) => !s.alder18 && !s.tagger.includes("verktoy")).sort((a, b) => (a.topp || Infinity) - (b.topp || Infinity) || a.rekkefolge - b.rekkefolge).slice(0, 3);
    const rommene = $$("#rommene .rom:not(.rom-laast)").map((b) => b.dataset.rom).filter((id) => id !== "voksen");
    // The nearest we have: the games named for it, else the most played of its kind.
    let naer = ikke ? ikke.spill.filter((s) => !s.alder18).slice(0, 3) : [];
    if (ikke && !naer.length && rommene.includes(ikke.rom)) naer = mestSpilt(SPILL.filter((s) => F.iRom(s, ikke.rom)));
    const mest = mestSpilt(SPILL);
    if (ikke && rommene.includes(ikke.rom)) rommene.unshift(...rommene.splice(rommene.indexOf(ikke.rom), 1));
    return `<p class="ingen-tittel">${esc(t("Fant ingen spill for «{sok}»", { sok }))}</p>${ikke ? `<p class="ingen-ikke">${esc(t("Det har vi ikke ennå."))}</p>` : ""}
      <p class="ingen-under">${esc(naer.length ? t("Det nærmeste vi har:") : t("Prøv et av de mest spilte:"))}</p>
      <ul class="ingen-liste rader">${(naer.length ? naer : mest).map((s) => `<li>${flis(s)}</li>`).join("")}</ul>
      <p class="ingen-under">${esc(t("Eller velg en type spill:"))}</p>
      <div class="ingen-rom">${rommene.map((id) => `<button type="button" class="brikke" data-til-rom="${id}">${esc(knappTekst(`#rommene [data-rom="${id}"]`))}</button>`).join("")}</div>`;
  }

  let dorHtml = ""; // what the 18+ door says now
  let ingenHtml = null; // … and the box for «nothing fits»
  // o.stille: nothing read aloud (the first drawing, a page back from memory).
  function oppdater(o = {}) {
    synk18();
    visVoksenRom();
    ordne();
    const vis = new Set(SPILL.filter(passer).map((s) => s.id));
    const valgt = filtrert();
    const bokstaver = new Set();
    let vist = 0;
    for (const li of $$("li[data-id]", liste)) {
      const ja = vis.has(li.dataset.id);
      li.hidden = !ja;
      // A row gets its facts (and the line of games inside it) the first time it is shown as one:
      // the build writes name and genre.
      if (ja && valgt && !$(".spillflis-fakta", li)) {
        const s = spillAv.get(li.dataset.id);
        $(".spillflis-tekst", li).insertAdjacentHTML("beforeend", fakta(s));
        if (s.varianter) li.insertAdjacentHTML("beforeend", ogsa(s));
      }
      // (the letters belong to A–Å, not to the search's order)
      li.classList.toggle("forste", !funn && ja && !bokstaver.has(li.dataset.b));
      if (ja) {
        bokstaver.add(li.dataset.b);
        vist++;
      }
    }
    const totalt = SPILL.filter(synlig).length;
    // (the rows of games inside games are matches too, but never counted as games)
    const treff = vist + varianter.size;

    // The 18+ door at the end of the list: before anyone is 18, when nothing is chosen, for
    // «Vorspiel», and when a search also fits drinking games. After: «Skjul» to hide them again.
    const dor = $("#dor-celle");
    const bakDora = !over18 && funn ? SPILL.filter((s) => s.alder18 && funn.av.has(s.id)).length : 0;
    if (dor) {
      const n18 = SPILL.filter((s) => s.alder18).length;
      dor.hidden = over18 ? !(rom === "voksen" || !valgt) : !(!valgt || hurtig === "vors" || bakDora);
      const html = over18
        ? `<div class="dor dor-apen"><span class="dor-ikon" aria-hidden="true">🔞</span><span class="dor-tekst"><b>${esc(t("Drikkespill (18+)"))}</b><span>${esc(t("{n} spill for voksne (18+)", { n: n18 }))}</span></span><button type="button" class="knapp-2 liten" data-skjul18>${esc(t("Skjul"))}</button></div>`
        : `<button type="button" class="dor" data-atten><span class="dor-ikon" aria-hidden="true">🔞</span><span class="dor-tekst"><b>${esc(hurtig === "vors" ? t("Vis drikkespillene") : t("Drikkespill (18+)"))}</b><span>${esc(bakDora ? t("+ {n} for voksne (18+)", { n: bakDora }) : t("{n} spill for voksne – trykk for å vise", { n: n18 }))}</span></span></button>`;
      // (only when it changes: a button with the focus stays)
      if (dorHtml !== html) {
        dor.innerHTML = html;
        dorHtml = html;
      }
    }
    const dorApen = !!(dor && !dor.hidden && !over18);

    $("#alle-t").textContent = valgt ? t("{n} spill passer", { n: treff }) : t("Alle spill A–Å");
    $("#nullstill").hidden = !valgt;
    const tomt = treff === 0 && !dorApen;
    $("#ingen-treff").hidden = !tomt;
    const ingen = tomt ? ingenTreff() : "";
    // (only when it changes: the pictures in it are not fetched again for every letter typed)
    if (ingen !== ingenHtml) {
      $("#ingen-treff").innerHTML = ingen;
      ingenHtml = ingen;
    }
    // A typo the search put right: say which word the matches are for.
    const rettet = funn && funn.rettet && !tomt ? t("Viser treff for «{ord}»", { ord: funn.rettet }) : "";
    $("#sok-melding").hidden = !rettet;
    $("#sok-melding").textContent = rettet;

    // The choices as chips that can be removed one by one.
    const aktive = aktiveValg();
    $("#aktive").hidden = !aktive.length;
    $("#aktive").setAttribute("aria-label", t("Filter, {n} valgt", { n: aktive.length }));
    $("#aktive").innerHTML = aktive.map(([n, tekst]) => `<button type="button" class="brikke aktiv-brikke" data-fjern="${n}" aria-label="${esc(t("Fjern {valg}", { valg: tekst }))}">${esc(tekst)} <span class="x" aria-hidden="true">×</span></button>`).join("");
    liste.setAttribute("aria-label", valgt ? t("Treff") : t("Alle spill"));
    // Something is chosen: rows with the facts, instead of the small cards of A–Å.
    liste.classList.toggle("rader", valgt);
    liste.classList.toggle("med-ogsa", valgt && !(funn && funn.tekst));

    // The best suggestions (rusj/portal/finner.js), once something is chosen and more than three fit.
    beste = [];
    besteVist = BESTE;
    // (Not while words are searched for: then the list itself is in the order of the best match.)
    if (valgt && vist > BESTE && !(funn && funn.tekst)) {
      let svar = svart() ? finnValg() : { antall: "", yngst: rom === "voksen" ? "fest" : "voksen", lyst: "alt" };
      // «for to» and «kjapt» in the search count as answers here.
      if (funn) svar = Object.assign({}, svar, funn.antall && !svar.antall ? { antall: funn.antall } : null, funn.kjapt && svar.lyst === "alt" ? { lyst: "kjapt" } : null);
      // («Med barna», «Vorspiel» …: together, so the games for one alone come last)
      beste = F.finn(SPILL.filter(passer), svar, { maned: MANED, gruppe: har(F.GRUPPE, hurtig) }).slice(0, 3 * BESTE);
    }
    visBeste();

    // Which shortcut, room and answers are on.
    $$("[data-hurtig]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.hurtig === hurtig)));
    $$("#rommene .rom:not(.rom-laast)").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.rom === rom)));
    visFinner();
    $("#finner-treff").textContent = t("{n} spill passer", { n: treff });
    $("#sok-tom").hidden = !sok;
    lagre();

    if (!o.stille) {
      const voksne = SPILL.length - totalt;
      si(
        tomt && sok
          ? t("Fant ingen spill for «{sok}»", { sok }) + (funn && funn.ikkeEnna ? " " + t("Det har vi ikke ennå.") : "")
          : valgt
            ? (rettet ? rettet + ". " : "") + t("Viser {synlige} av {n} spill", { synlige: treff, n: totalt }) + (bakDora ? " " + t("+ {n} for voksne (18+)", { n: bakDora }) : "")
            : voksne
            ? t("{n} spill + {voksne} for voksne (18+)", { n: totalt, voksne })
            : t("{n} spill – trykk på ett for å starte", { n: totalt }),
        o.skriver,
      );
    }
  }

  // To the list: its heading right under the top bar (only when it is not there already).
  function tilResultat() {
    const y = $("#alle").getBoundingClientRect().top + window.scrollY - $("#linje").offsetHeight - 6;
    if (Math.abs(y - window.scrollY) > 40) window.scrollTo({ top: Math.max(0, y), behavior: rolig() ? "auto" : "smooth" });
  }

  // Everything that depends on the 18+ answer.
  function nyAlder() {
    visAlder();
    if (!over18 && rom === "voksen") rom = "";
    if (hurtig) valg = F.HURTIG[hurtig](over18);
    valg = F.normaliser(valg, over18);
    visFortsett();
    oppdater();
  }

  document.addEventListener("click", async (e) => {
    const fjern = e.target.closest("[data-fjern]");
    if (fjern) {
      const n = fjern.dataset.fjern;
      const plass = $$("#aktive [data-fjern]").indexOf(fjern);
      if (n === "rom") rom = "";
      else if (n === "hurtig") {
        hurtig = "";
        valg = F.normaliser({}, over18);
      } else if (n === "sok") {
        settSok("");
        $("#sok").value = "";
      } else {
        valg[n] = n === "yngst" ? "voksen" : n === "lyst" ? "alt" : "";
      }
      oppdater();
      const igjen = $$("#aktive [data-fjern]");
      (igjen[Math.min(plass, igjen.length - 1)] || $("#alle-t")).focus();
      return;
    }
    const h = e.target.closest("[data-hurtig]");
    if (h) {
      const var_ = hurtig === h.dataset.hurtig;
      hurtig = var_ ? "" : h.dataset.hurtig;
      valg = var_ ? F.normaliser({}, over18) : F.HURTIG[hurtig](over18);
      oppdater();
      if (!var_) tilResultat();
      return;
    }
    if (e.target.closest("#flere")) {
      const apen = $("#finner").hidden;
      $("#finner").hidden = !apen;
      $("#flere").setAttribute("aria-expanded", String(apen));
      return;
    }
    const a = e.target.closest("[data-finn-antall]");
    const l = e.target.closest("[data-finn-lyst]");
    const steg = e.target.closest("[data-finn-yngst]");
    if (a || l || steg) {
      if (steg && steg.getAttribute("aria-disabled") === "true") return;
      hurtig = "";
      if (a) valg.antall = valg.antall === a.dataset.finnAntall ? "" : a.dataset.finnAntall;
      if (l) valg.lyst = valg.lyst === l.dataset.finnLyst ? "alt" : l.dataset.finnLyst;
      if (steg) {
        const trinn = F.alderTrinn(over18);
        valg.yngst = trinn[Math.max(0, Math.min(trinn.length - 1, trinn.indexOf(valg.yngst) + Number(steg.dataset.finnYngst)))];
      }
      oppdater();
      return;
    }
    if (e.target.closest("#finner-vis")) {
      tilResultat();
      $("#alle-t").focus({ preventScroll: true });
      return;
    }
    const r = e.target.closest("#rommene [data-rom], [data-til-rom]");
    if (r) {
      const id = r.dataset.rom || r.dataset.tilRom;
      // From the box under a search that found nothing: the room instead of the search.
      const fraIngen = !!r.closest("#ingen-treff");
      if (fraIngen) {
        settSok("");
        $("#sok").value = "";
      }
      if (id === "voksen" && !over18) {
        if (!(await bekreft18())) return;
        rom = "voksen";
        nyAlder();
        tilResultat();
        return;
      }
      rom = rom === id && r.dataset.rom ? "" : id;
      oppdater();
      if (rom) tilResultat();
      if (fraIngen) $("#alle-t").focus({ preventScroll: true }); // the button that was pressed is gone
      return;
    }
    if (e.target.closest("[data-atten]")) {
      if (!(await bekreft18())) return;
      nyAlder();
      // The button that was pressed is gone: on to the first drinking game in the list.
      const forste = $("#alle-liste li[data-alder18]:not([hidden]) a");
      (forste || $("#alle-t")).focus();
      return;
    }
    if (e.target.closest("[data-skjul18]")) {
      over18 = false;
      skriv("rusj.felles", Object.assign(felles(), { over18: false }));
      nyAlder();
      $("#alle-t").focus();
    }
  });
  $("#nullstill").addEventListener("click", () => {
    rom = "";
    hurtig = "";
    settSok("");
    $("#sok").value = "";
    valg = F.normaliser({}, over18);
    oppdater();
    $("#alle-t").focus();
  });
  yngstValg.addEventListener("change", () => {
    hurtig = "";
    valg.yngst = /^\d+$/.test(yngstValg.value) ? Number(yngstValg.value) : yngstValg.value;
    oppdater();
  });
  $("#finner").addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    $("#finner").hidden = true;
    $("#flere").setAttribute("aria-expanded", "false");
    $("#flere").focus();
  });

  // The search in the top bar: the list narrows as one types, and comes up under the bar.
  const sokFelt = $("#sok");
  sokFelt.addEventListener("input", () => {
    const for_ = sok;
    settSok(sokFelt.value.slice(0, 40).trim());
    oppdater({ skriver: true });
    if (sok && !for_) tilResultat();
  });
  sokFelt.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && sokFelt.value) {
      e.preventDefault();
      sokFelt.value = "";
      settSok("");
      oppdater();
    } else if (e.key === "Enter") {
      // «Søk» on the keyboard: put it away; the matches are right under the bar.
      e.preventDefault();
      sokFelt.blur();
      tilResultat();
    }
  });
  $("#sok-tom").addEventListener("click", () => {
    settSok("");
    sokFelt.value = "";
    oppdater();
    sokFelt.focus();
  });

  // ---------- Fortsett (games left in the middle) ----------

  // The newest saved state of a game, whatever its version number (rusj.<id>.v1, .v2 …).
  function lagretSpill(id) {
    let beste = null;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const n = localStorage.key(i);
        if (!n || !n.startsWith(`${k(id)}.v`) || !/^\d+$/.test(n.slice(`${k(id)}.v`.length))) continue;
        const l = les(n, null);
        if (l && (!beste || (l._tid || 0) > (beste._tid || 0))) beste = l;
      }
    } catch (e) {
      /* storage blocked */
    }
    return beste;
  }
  const aktive = new Map(); // id -> when it was last played
  function finnAktive() {
    const na = Date.now();
    aktive.clear();
    for (const s of SPILL) {
      if (s.id === "luringen") {
        // Luringen keeps its own state (with the time it was saved): in progress for 12 hours,
        // like the rest. No time stamp = saved by an older version, long ago.
        const l = les("luringen.v1", null);
        if (l && l.spill && l._tid && na - l._tid < 12 * 3600 * 1000) aktive.set(s.id, l._tid);
        continue;
      }
      const l = lagretSpill(s.id);
      // _aktiv is written by the kit (the game decides what counts as "in progress").
      const pagar = l && (l._aktiv != null ? l._aktiv : l.skjerm && l.skjerm !== "hjem");
      if (pagar && l._tid && na - l._tid < 12 * 3600 * 1000) aktive.set(s.id, l._tid);
    }
  }
  function visFortsett() {
    const liste_ = SPILL.filter((s) => aktive.has(s.id) && synlig(s)).sort((a, b) => aktive.get(b.id) - aktive.get(a.id));
    $("#fortsett").hidden = !liste_.length;
    $("#fortsett-rad").innerHTML = liste_.map((s) => `<li data-id="${s.id}">${flis(s, { fortsett: true })}</li>`).join("");
  }

  // ---------- «Dagens»: today's daily game, how today went and the streak ----------
  // Read from «rusj.daglig», which the games write through the kit (rusj/DAGLIG.md; the reading and
  // the counting in daglig.js). The same game for everyone today. Storage blocked: as for a new visitor.

  const daglige = SPILL.filter((s) => s.tagger.includes("daglig") && !s.alder18);
  let dagNr = null;
  function visDagens() {
    const kort = $("#dagens-kort");
    if (!kort || !daglige.length || !D) return;
    const dag = D.dag();
    dagNr = dag.nr;
    const s = daglige[((dag.nr % daglige.length) + daglige.length) % daglige.length];
    const st = D.status(les(k("daglig"), null), daglige.map((x) => x.id), dag.nr);
    const r = D.rekke(st.dager, dag.nr);
    const her = st.spill.find((x) => x.id === s.id) || {};
    const tilstand = her.tilstand === "ferdig" ? " – " + t("ferdig i dag") + (her.res ? ", " + D.lesbart(her.res) : "") : her.tilstand === "pagar" ? " – " + t("i gang") : "";
    kort.href = url(s) + "#dagens";
    kort.style.setProperty("--kf", s.farge);
    kort.setAttribute("aria-label", `${t("Dagens utfordring")}. ${etikett(s)}${tilstand}`);
    const merke = her.tilstand === "ferdig" ? `<span class="dagens-status-merke ferdig" aria-hidden="true">✓${her.res ? " " + esc(her.res) : ""}</span>` : her.tilstand === "pagar" ? `<span class="dagens-status-merke" aria-hidden="true">${esc(t("I gang"))}</span>` : "";
    $(".dagens-bilde", kort).innerHTML = bilde(s, true) + merke;
    $(".dagens-navn", kort).textContent = s.navn;
    $(".dagens-linje", kort).textContent = t("{undertittel} – ny hver natt, lik for alle", { undertittel: s.undertittel });
    kort.hidden = false;
    $("#dagens-dato").textContent = D.datoTekst(dag);
    const status = [st.ferdige ? "✓ " + t("{n} av {alle} i dag", { n: st.ferdige, alle: st.antall }) : "", r.rekke >= 2 ? "🔥 " + t("{n} dager på rad", { n: r.rekke }) : ""].filter(Boolean);
    $("#dagens-status").textContent = status.join(" · ");
  }
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) visDagens();
  });
  window.addEventListener("storage", (e) => {
    if (e.key === k("daglig")) visDagens();
  });
  // A page left open past midnight: a new game of the day.
  setInterval(() => {
    if (D && dagNr != null && !document.hidden && D.dag().nr !== dagNr) visDagens();
  }, 60000);

  // ---------- Kveldens gjeng ----------

  // Collapsed: the podium, the (up to) three best with points. «Vis alle» shows everyone.
  const KVELD_TOPP = 3;
  let kveldAlle = false;
  function visKveld() {
    const kv = les(k("kveld"), null);
    const fersk = kv && Array.isArray(kv.spill) && kv.spill.length && Date.now() - (kv.start || 0) < 12 * 3600 * 1000;
    $("#kveld").hidden = !fersk;
    if (!fersk) return;
    const poeng = new Map();
    for (const s of kv.spill)
      for (const r of s.resultat || []) {
        const p = r.plass === 1 ? 3 : r.plass === 2 ? 2 : r.plass === 3 ? 1 : 0;
        poeng.set(r.navn, (poeng.get(r.navn) || 0) + p);
      }
    const tavle = Array.from(poeng, ([navn, p]) => ({ navn, p })).sort((a, b) => b.p - a.p);
    let topp = tavle.filter((r) => r.p > 0).slice(0, KVELD_TOPP);
    if (!topp.length) topp = tavle.slice(0, KVELD_TOPP); // nobody has points yet: never an empty board
    const medaljer = ["🥇", "🥈", "🥉"];
    $("#kveld-liste").innerHTML = tavle
      .map((r) => {
        const plass = 1 + tavle.filter((x) => x.p > r.p).length;
        const skjult = !kveldAlle && !topp.includes(r) ? " hidden" : "";
        // Medals (and the leader's glow) are for points: nobody gets bronze for sharing third place with 0.
        const merke = (r.p > 0 && medaljer[plass - 1]) || plass + ".";
        return `<li class="${plass === 1 && r.p > 0 ? "leder" : ""}"${skjult}><span class="kveld-plass">${merke}</span><span class="kveld-navn">${esc(r.navn)}</span><span class="kveld-poeng">${r.p}<span class="vh"> ${esc(t("poeng"))}</span></span></li>`;
      })
      .join("");
    const alle = $("#kveld-alle");
    alle.hidden = tavle.length <= topp.length;
    if (alle.hidden) kveldAlle = false;
    alle.setAttribute("aria-expanded", String(kveldAlle));
    alle.textContent = kveldAlle ? t("Vis færre") : t("Vis alle {n}", { n: tavle.length });
    const n = kv.spill.length;
    $("#kveld-antall").textContent = t("{n} spill i kveld", { n });
  }
  $("#kveld-alle").addEventListener("click", () => {
    kveldAlle = !kveldAlle;
    visKveld();
  });
  $("#kveld-nullstill").addEventListener("click", () => {
    try {
      localStorage.removeItem(k("kveld"));
    } catch (e) {
      /* ignore */
    }
    visKveld();
    $("#spill").focus();
  });

  // ---------- Overrask meg: a little slot machine ----------

  const automat = $("#automat");
  automat.innerHTML = `
    <div class="automat-inn">
      <button type="button" class="automat-lukk" data-lukk aria-label="${esc(t("Lukk"))}">×</button>
      <h2 id="automat-tittel">${esc(t("Overrask meg"))}</h2>
      <p class="automat-under" id="automat-under"></p>
      <div class="antall" role="group" aria-label="${esc(t("Hvor mange spillere er dere?"))}">
        <span class="antall-tekst">${esc(t("Spillere"))}</span>
        <button type="button" class="antall-knapp" data-antall="-1" aria-label="${esc(t("Færre spillere"))}">−</button>
        <output id="antall" aria-live="polite">${esc(t("alle"))}</output>
        <button type="button" class="antall-knapp" data-antall="1" aria-label="${esc(t("Flere spillere"))}">+</button>
      </div>
      <div class="automat-maskin" aria-hidden="true">
        <span class="automat-lys"></span>
        <div class="automat-vindu"><div class="automat-hjul"></div></div>
        <span class="automat-lys"></span>
      </div>
      <p class="automat-svar" id="automat-svar" aria-live="polite"></p>
      <div class="dialog-knapper">
        <button type="button" class="knapp-2" data-en-til><span aria-hidden="true">🎲</span> ${esc(t("En til"))}</button>
        <button type="button" class="knapp" data-spill>${esc(t("Spill!"))}</button>
      </div>
    </div>`;
  const maskin = $(".automat-maskin", automat);
  const hjul = $(".automat-hjul", automat);
  const svar = $("#automat-svar");
  let valgt = null;
  let snurrer = false;
  let hjulAnim = null;

  // Among the games the list shows now (when that is a choice of a few), else among all of them,
  // for as many players as the machine's own stepper says. Never a tool: this is for playing.
  let spillere = 0; // 0 = any number
  function kandidater() {
    const alle = SPILL.filter((s) => synlig(s) && !s.tagger.includes("verktoy"));
    const viste = alle.filter(passer);
    const blant = filtrert() && viste.length >= 2 ? viste : alle;
    const passende = blant.filter((s) => !spillere || (s.spillere[0] <= spillere && s.spillere[1] >= spillere));
    return passende.length ? passende : blant;
  }
  function visSpillere() {
    $("#antall", automat).textContent = spillere ? String(spillere) : t("alle");
    $$(".antall-knapp", automat)[0].disabled = spillere === 0;
    $$(".antall-knapp", automat)[1].disabled = spillere >= 20;
  }
  function klar(ja) {
    for (const b of $$("[data-en-til], [data-spill]", automat)) b.setAttribute("aria-disabled", String(!ja));
  }

  async function snurr() {
    const liste_ = kandidater();
    if (!liste_.length) return;
    let vinner = liste_[Math.floor(Math.random() * liste_.length)];
    for (let n = 0; n < 6 && liste_.length > 1 && valgt && vinner.id === valgt.id; n++) vinner = liste_[Math.floor(Math.random() * liste_.length)];
    valgt = vinner;
    const passer_ = spillere && liste_.every((s) => s.spillere[0] <= spillere && s.spillere[1] >= spillere);
    $("#automat-under").textContent = passer_ ? t("Blant {n} spill for {antall} spillere", { n: liste_.length, antall: spillere }) : t("Blant {n} spill", { n: liste_.length });
    // The reel: random mascots, the winner last.
    const rolle = rolig() ? [] : Array.from({ length: 16 }, () => liste_[Math.floor(Math.random() * liste_.length)]);
    rolle.push(vinner);
    hjul.innerHTML = rolle.map((s) => `<span class="automat-figur" style="--kf: ${s.farge}">${bilde(s, true)}</span>`).join("");
    maskin.classList.remove("ferdig");
    svar.textContent = "";
    if (hjulAnim) hjulAnim.cancel();
    hjulAnim = null;
    if (rolle.length > 1 && hjul.animate) {
      snurrer = true;
      klar(false);
      maskin.classList.add("snurrer");
      const h = hjul.firstElementChild.getBoundingClientRect().height;
      hjulAnim = hjul.animate([{ transform: "translateY(0)" }, { transform: `translateY(${-(rolle.length - 1) * h}px)` }], {
        duration: 1900,
        easing: "cubic-bezier(0.12, 0.72, 0.2, 1.03)",
        fill: "forwards",
      });
      try {
        await hjulAnim.finished;
      } catch (e) {
        return; // cancelled: a new spin or the page came back from memory
      }
      maskin.classList.remove("snurrer");
      snurrer = false;
    } else {
      hjul.style.transform = "none";
    }
    maskin.style.setProperty("--kf", vinner.farge);
    maskin.classList.add("ferdig");
    svar.innerHTML = `<b>${esc(vinner.navn)}</b><span>${esc(vinner.undertittel)}</span><span class="automat-fakta">👥 ${fra(...vinner.spillere)} · ⏱ ${fra(...(vinner.minutter || [5, 15]))} min</span>`;
    klar(true);
    if (automat.open) $("[data-spill]", automat).focus();
  }

  $("#overrask").addEventListener("click", () => {
    if (automat.open) return;
    automat.showModal();
    snurr();
  });
  automat.addEventListener("click", (e) => {
    // A click on the backdrop lands on the <dialog> itself (its content fills it).
    if (e.target === automat || e.target.closest("[data-lukk]")) {
      automat.close();
      return;
    }
    const steg = e.target.closest("[data-antall]");
    if (steg) {
      const d = Number(steg.dataset.antall);
      spillere = spillere === 0 && d > 0 ? 2 : spillere === 2 && d < 0 ? 0 : Math.max(0, Math.min(20, spillere + d));
      visSpillere();
      if (!snurrer) snurr();
      return;
    }
    if (snurrer) return;
    if (e.target.closest("[data-en-til]")) snurr();
    else if (e.target.closest("[data-spill]") && valgt) location.href = url(valgt);
  });
  automat.addEventListener("close", () => {
    if (hjulAnim) hjulAnim.cancel();
    hjulAnim = null;
    snurrer = false;
    $("#overrask").focus();
  });

  // ---------- Install as an app ----------

  const installert = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone;
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  // Inside an app's own browser (Instagram, Facebook, Snapchat, TikTok): see «Send rusj til gjengen» below.
  const innebygd = D && D.innebygdNettleser ? D.innebygdNettleser(navigator.userAgent) : "";
  let installer = null;
  if (installert) $("#installer").hidden = true;
  // The quick tip under the rooms: until it's dismissed or rusj is installed.
  if (!installert && !les(k("portal.installSkjult"), false)) $("#installtips").hidden = false;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installer = e;
    if (innebygd) return; // the app's browser can't install rusj, whatever it says
    $("#installer-knapp").hidden = false;
    $("#installer-tekst").textContent = t("Legg rusj på hjemskjermen, så starter spillene som en app – og de virker uten nett.");
  });
  async function installer_() {
    if (installer) {
      const sporsmal = installer;
      installer = null;
      $("#installer-knapp").hidden = true;
      try {
        await sporsmal.prompt();
        await sporsmal.userChoice;
        return;
      } catch (e) {
        /* the browser would not show its own question after all: show the steps instead */
      }
    }
    const d = $("#dialog");
    d.innerHTML = `
      <h2 id="dialog-tittel">${esc(t("Ha rusj som app"))}</h2>
      ${
        ios
          ? `<ol class="dialog-steg"><li>${th("Trykk på {del}-knappen {pil} nederst i Safari.", { del: `<b>${esc(t("Del"))}</b>`, pil: '<span aria-hidden="true">⬆︎</span>' })}</li><li>${th("Velg {valg}.", { valg: `<b>${esc(t("«Legg til på Hjem-skjerm»"))}</b>` })}</li><li>${th("Trykk {knapp}.", { knapp: `<b>${esc(t("Legg til"))}</b>` })}</li></ol>`
          : `<ol class="dialog-steg"><li>${th("Åpne menyen i nettleseren {meny}.", { meny: '<span aria-hidden="true">⋮</span>' })}</li><li>${th("Velg {valg} eller {annet}.", { valg: `<b>${esc(t("«Installer app»"))}</b>`, annet: `<b>${esc(t("«Legg til på startsiden»"))}</b>` })}</li></ol>`
      }
      <p>${esc(t("Da starter rusj som en app fra hjemskjermen – og spillene virker uten nett."))}</p>
      <div class="dialog-knapper"><button type="button" class="knapp" value="ok">${esc(t("Skjønner!"))}</button></div>`;
    d.querySelector('[value="ok"]').addEventListener("click", () => d.close());
    d.showModal();
  }
  $("#installer-knapp").addEventListener("click", installer_);
  $("#installtips-vis").addEventListener("click", installer_);
  $("#installtips-lukk").addEventListener("click", () => {
    $("#installtips").hidden = true;
    skriv(k("portal.installSkjult"), true);
    $("#spill").focus({ preventScroll: true });
  });

  // ---------- «Send rusj til gjengen»: a big QR code for the table, and the link ----------

  // Inside Instagram/Facebook/Snapchat/TikTok a page can't be installed: say so instead of the steps.
  if (innebygd && !installert) $("#installer-tekst").textContent = t("Du er inne i {app}. Åpne rusj.no i nettleseren for å installere og lagre.", { app: innebygd });
  // The QR encoder is loaded the first time the sheet opens, not with the page.
  let qrLaster = null;
  const lastQr = (src) => {
    if (window.LuringenQr) return Promise.resolve(window.LuringenQr);
    if (!qrLaster)
      qrLaster = new Promise((ok) => {
        const el = document.createElement("script");
        el.src = src;
        el.onload = () => ok(window.LuringenQr || null);
        el.onerror = () => {
          qrLaster = null;
          ok(null);
        };
        document.head.appendChild(el);
      });
    return qrLaster;
  };
  const sendKnapp = $("#send-rusj");
  const ADRESSE = "https://rusj.no" + T.forside; // this edition's front page
  const VIST = "rusj.no" + T.forside.replace(/\/$/, "");
  if (sendKnapp)
    sendKnapp.addEventListener("click", async () => {
      const d = $("#dialog");
      if (d.open) return;
      const Q = await lastQr(sendKnapp.dataset.qr);
      let qr = "";
      try {
        qr = Q ? Q.qrSvg(Q.lagQr(ADRESSE, "M"), { mork: "var(--blekk)", lys: "var(--papir)", kant: 2, etikett: t("QR-kode som åpner rusj.no") }) : "";
      } catch (e) {
        qr = "";
      }
      if (d.open) return;
      d.innerHTML = `
        <div class="qr-ark">
          <h2 id="dialog-tittel">${esc(t("Send rusj til gjengen"))}</h2>
          ${qr ? `<div class="qr-stor">${qr}</div>` : `<b class="qr-adresse">${esc(VIST)}</b>`}
          <p class="qr-tekst">${esc(t("Skann for å bli med"))}</p>
          ${innebygd ? `<p class="innebygd-tips">${esc(t("Åpne i nettleseren for å installere og lagre."))}</p>` : ""}
          <p class="qr-melding" id="qr-melding" role="status"></p>
          <div class="dialog-knapper">
            <button type="button" class="knapp-2" value="ok">${esc(t("Lukk"))}</button>
            <button type="button" class="knapp" id="del-lenken">${esc(t("Del lenken"))}</button>
          </div>
        </div>`;
      d.querySelector('[value="ok"]').addEventListener("click", () => d.close());
      d.querySelector("#del-lenken").addEventListener("click", async () => {
        try {
          if (navigator.share) {
            await navigator.share({ title: "rusj", text: t("Bli med på rusj – gratis spill for hele gjengen, rett i nettleseren."), url: ADRESSE });
            return;
          }
        } catch (e) {
          if (e && e.name === "AbortError") return;
        }
        let ok = false;
        try {
          await navigator.clipboard.writeText(ADRESSE);
          ok = true;
        } catch (e) {
          ok = false;
        }
        $("#qr-melding").textContent = ok ? t("Lenken er kopiert. Lim den inn i gruppechatten.") : t("Kopier lenken: {adresse}", { adresse: VIST });
      });
      d.addEventListener("close", () => sendKnapp.focus(), { once: true });
      d.showModal();
      d.querySelector("#del-lenken").focus();
    });

  // ---------- Reveal sections on scroll; the top bar's edge ----------

  if ("IntersectionObserver" in window && !rolig()) {
    const obs = new IntersectionObserver(
      (oppf) => {
        for (const o of oppf) {
          if (o.isIntersecting) {
            o.target.classList.add("synlig");
            obs.unobserve(o.target);
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    $$(".slik, .gjengen, .installer, .bunn").forEach((el) => {
      el.classList.add("avdekk");
      obs.observe(el);
    });
  }
  // A line under the top bar once the page has scrolled in under it.
  let kant = false;
  const sjekkKant = () => {
    kant = false;
    $("#linje").classList.toggle("skygget", window.scrollY > 4);
  };
  window.addEventListener(
    "scroll",
    () => {
      if (!kant) {
        kant = true;
        requestAnimationFrame(sjekkKant);
      }
    },
    { passive: true },
  );
  sjekkKant();

  // ---------- Card rows for mouse users ----------
  // The rows scroll sideways with a finger or a trackpad, but a mouse wheel only scrolls the page.
  // With a mouse: arrow buttons on each row (shown when there is more to see that way), and
  // click-and-drag that never turns into a click on a card.
  const RADER = ".forside-rad, .topp-rad";
  const finPeker = window.matchMedia("(hover: hover) and (pointer: fine)");
  const pilerFor = new WeakMap(); // row → its arrows
  const radFor = new WeakMap(); // arrows → their row
  function oppdaterPiler(rad) {
    const p = pilerFor.get(rad);
    if (!p || !p.isConnected) return;
    const mer = rad.scrollWidth - rad.clientWidth > 4;
    p.hidden = !mer || !finPeker.matches;
    p.querySelector("[data-rull='-1']").disabled = rad.scrollLeft <= 2;
    p.querySelector("[data-rull='1']").disabled = rad.scrollLeft >= rad.scrollWidth - rad.clientWidth - 2;
  }
  function lagPiler() {
    for (const rad of $$(RADER)) {
      if (!(pilerFor.get(rad) && pilerFor.get(rad).isConnected)) {
        const del = rad.closest("section");
        const h2 = del && $("h2", del);
        const navn = (h2 && h2.textContent.replace(/^[^\p{L}\d]+/u, "").trim()) || t("raden");
        const p = document.createElement("div");
        p.className = "rad-piler";
        p.hidden = true;
        p.innerHTML = `<button type="button" data-rull="-1" aria-label="${esc(t("Bla tilbake i {rad}", { rad: navn }))}">‹</button><button type="button" data-rull="1" aria-label="${esc(t("Bla videre i {rad}", { rad: navn }))}">›</button>`;
        // In the heading row of the section, to the right.
        const topp = del && $(".del-topp", del);
        if (topp) topp.append(p);
        else rad.before(p);
        pilerFor.set(rad, p);
        radFor.set(p, rad);
        rad.addEventListener("scroll", () => oppdaterPiler(rad), { passive: true });
      }
      oppdaterPiler(rad);
    }
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".rad-piler [data-rull]");
    if (!b) return;
    const rad = radFor.get(b.parentElement);
    if (!rad) return;
    rad.scrollBy({ left: Number(b.dataset.rull) * Math.max(160, rad.clientWidth * 0.85), behavior: rolig() ? "auto" : "smooth" });
  });
  let dra = null;
  document.addEventListener("pointerdown", (e) => {
    const rad = e.pointerType === "mouse" && e.button === 0 && e.target.closest(RADER);
    if (rad) dra = { rad, x: e.clientX, start: rad.scrollLeft, flyttet: false };
  });
  document.addEventListener("pointermove", (e) => {
    if (!dra) return;
    const dx = e.clientX - dra.x;
    if (!dra.flyttet && Math.abs(dx) < 6) return;
    if (!dra.flyttet) {
      dra.flyttet = true;
      dra.rad.classList.add("drar");
    }
    dra.rad.scrollLeft = dra.start - dx;
  });
  const slipp = () => {
    if (!dra) return;
    const var_ = dra;
    dra = null;
    var_.rad.classList.remove("drar");
    // A drag must not also open the card it started on.
    if (var_.flyttet) document.addEventListener("click", (e) => (e.preventDefault(), e.stopPropagation()), { capture: true, once: true });
  };
  document.addEventListener("pointerup", slipp);
  document.addEventListener("pointercancel", slipp);
  document.addEventListener("dragstart", (e) => {
    if (e.target.closest && e.target.closest(RADER)) e.preventDefault(); // links and images would start a browser drag
  });
  window.addEventListener("resize", () => $$(RADER).forEach(oppdaterPiler));
  if (finPeker.addEventListener) finPeker.addEventListener("change", () => $$(RADER).forEach(oppdaterPiler));

  // ---------- Start ----------

  finnAktive();
  visFortsett();
  visDagens();
  visKveld();
  visSpillere();
  oppdater({ stille: true });
  lagPiler();

  // The app shortcut «Overrask meg» (a long press on the app icon) opens /#overrask: spin at once.
  if (hash === "#overrask" && automat.showModal) {
    try {
      history.replaceState(null, "", location.pathname + location.search); // not again on a reload
    } catch (e) {
      /* ignore */
    }
    automat.showModal();
    snurr();
  }

  // Back from a game, the browser may show this page from its memory (bfcache) exactly as it was
  // left: an open «Overrask meg», and an old scoreboard and badges. Bring it up to date.
  window.addEventListener("pageshow", (e) => {
    if (!e.persisted) return;
    if (automat.open) automat.close();
    if (!over18 && felles().over18) {
      over18 = true; // confirmed in a game's 18+ gate meanwhile
      nyAlder();
    }
    finnAktive();
    visFortsett();
    visDagens();
    visKveld();
    oppdater({ stille: true });
    lagPiler();
  });

  // The language picker (a <details>) also closes on a tap outside it and on Escape.
  document.addEventListener("click", (e) => {
    for (const d of $$("details.sprakvelger[open]")) if (!d.contains(e.target)) d.open = false;
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    for (const d of $$("details.sprakvelger[open]")) {
      d.open = false;
      const s = $("summary", d);
      if (s) s.focus();
    }
  });

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
})();
