/* Skattejegeren — a treasure hunt for children's parties, planned on the phone in two minutes.
   The parent picks how the children find the clues (printed cards, the phone with a tap, or the
   phone with a code word found at every post), a theme, the children's age (4–6, 7–9, 10–12),
   indoors, outdoors or both, and the number of posts. The phone makes a chain of hiding places
   that fit (no place twice, never two in a row in the same room where it can be avoided, indoors
   before outdoors or the other way round), and a clue for each that fits the age. The parent can
   swap any hiding place or write a clue of their own. The last post is where the treasure lies.
   Everything stays on this phone: no names, nothing typed is ever shared or counted.
   The rules at the top are pure functions; test/skattejegeren.test.mjs loads this file without
   the kit. */
(function () {
  "use strict";

  // ---------- The hunt (no kit needed) ----------
  const ALDRE = [4, 7, 10]; // the age bands 4–6, 7–9 and 10–12, by their youngest year
  const HVOR = ["inne", "ute", "begge"];
  const MAATER = ["utskrift", "trykk", "kode"];
  const MIN_POSTER = 3;
  const MAKS_POSTER = 12;
  const BILDEVALG = 4; // pictures to choose from for the youngest in code mode

  const stokk = (liste, rng) => {
    const a = liste.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // Lower case, letters and digits only. A code word typed on a keyboard without æ, ø and å still
  // counts: written the long way (ae, oe, aa) or the short way (ae, o, a).
  const enkel = (s, kort) =>
    String(s || "")
      .toLowerCase()
      .replace(/æ/g, "ae")
      .replace(/[øö]/g, kort ? "o" : "oe")
      .replace(/å/g, kort ? "a" : "aa")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]/g, "");

  const Jakt = {
    // A hiding place fits when it has a clue for the age band and is in the right place.
    passer(sted, alder, hvor) {
      return !!(sted && sted.gater && typeof sted.gater[alder] === "string" && sted.gater[alder].trim() && (hvor === "begge" || sted.hvor === hvor));
    },
    utvalg(steder, alder, hvor) {
      return steder.filter((s) => Jakt.passer(s, alder, hvor));
    },
    // The most posts the setup allows.
    maks(steder, alder, hvor) {
      return Math.min(MAKS_POSTER, Jakt.utvalg(steder, alder, hvor).length);
    },
    // An order where no two places in a row are in the same room whenever that can be done: each
    // step takes a place from the room with the most places left (not the room just visited).
    ordne(liste) {
      const igjen = liste.slice();
      const ut = [];
      while (igjen.length) {
        const forrige = ut.length ? ut[ut.length - 1].rom : null;
        const antall = new Map();
        for (const s of igjen) antall.set(s.rom, (antall.get(s.rom) || 0) + 1);
        let i = -1;
        for (let n = 0; n < igjen.length; n++) {
          if (igjen[n].rom === forrige) continue;
          if (i < 0 || antall.get(igjen[n].rom) > antall.get(igjen[i].rom)) i = n;
        }
        if (i < 0) i = 0;
        ut.push(igjen.splice(i, 1)[0]);
      }
      return ut;
    },
    // A route: `antall` different hiding places (ids) for the age and the place. With "begge",
    // about half indoors and half outdoors, one group after the other, so the children go out once.
    rute(steder, valg, rng) {
      const { alder, hvor } = valg;
      const pool = Jakt.utvalg(steder, alder, hvor);
      const n = Math.max(0, Math.min(valg.antall | 0, MAKS_POSTER, pool.length));
      if (hvor !== "begge") return Jakt.ordne(stokk(pool, rng).slice(0, n)).map((s) => s.id);
      const inne = stokk(pool.filter((s) => s.hvor === "inne"), rng);
      const ute = stokk(pool.filter((s) => s.hvor === "ute"), rng);
      let ni = rng() < 0.5 ? Math.ceil(n / 2) : Math.floor(n / 2);
      ni = Math.min(inne.length, Math.max(n - ute.length, ni));
      const nu = n - ni;
      const a = Jakt.ordne(inne.slice(0, ni));
      const b = Jakt.ordne(ute.slice(0, nu));
      return (rng() < 0.5 ? a.concat(b) : b.concat(a)).map((s) => s.id);
    },
    // A different code word for every post (indexes into the theme's list).
    koder(antallKoder, n, rng) {
      return stokk(
        Array.from({ length: antallKoder }, (_, i) => i),
        rng,
      ).slice(0, n);
    },
    // The pictures the youngest choose from: the right one and three others, mixed.
    bildevalg(antallKoder, riktig, rng) {
      const andre = stokk(
        Array.from({ length: antallKoder }, (_, i) => i).filter((i) => i !== riktig),
        rng,
      ).slice(0, BILDEVALG - 1);
      return stokk([riktig, ...andre], rng);
    },
    // The cards of a hunt: the start card points to post 0, the card found at post i points to
    // post i + 1, and the card at the last post is the treasure's.
    kort(antall) {
      const ut = [{ type: "start", til: 0 }];
      for (let i = 0; i < antall - 1; i++) ut.push({ type: "post", ved: i, til: i + 1 });
      if (antall > 0) ut.push({ type: "skatt", ved: antall - 1 });
      return ut;
    },
    // Follow the cards from the start: the posts in the order the children reach them.
    folg(kort) {
      const ved = new Map(kort.filter((k) => k.ved != null).map((k) => [k.ved, k]));
      const besokt = [];
      let k = kort.find((x) => x.type === "start");
      while (k && k.til != null && besokt.length <= kort.length) {
        besokt.push(k.til);
        k = ved.get(k.til);
      }
      return { besokt, slutt: k ? k.type : null };
    },
    // The fitting places not used by any other post (the post's own place included).
    ledige(steder, poster, i, alder, hvor) {
      const brukt = new Set(poster.filter((_, j) => j !== i).map((p) => p.s));
      return Jakt.utvalg(steder, alder, hvor).filter((s) => !brukt.has(s.id));
    },
    // Move post i to place id; if another post has it, the two swap, so no place is used twice.
    bytt(poster, i, id) {
      const j = poster.findIndex((p, n) => n !== i && p.s === id);
      if (j >= 0) poster[j].s = poster[i].s;
      poster[i].s = id;
      return poster;
    },
    riktigKode(svar, ord) {
      return !!enkel(svar) && (enkel(svar) === enkel(ord) || enkel(svar, true) === enkel(ord, true));
    },
    enkel,
  };

  const R = window.Rusj;
  if (!R) {
    window.Skattejegeren = { Jakt, ALDRE, HVOR, MAATER, MIN_POSTER, MAKS_POSTER, BILDEVALG };
    return;
  }

  // ---------- The game ----------

  const esc = R.esc;
  const D = window.RUSJ_DATA;
  const STEDER = (D.steder && D.steder.steder) || [];
  const TEMAER = (D.temaer && D.temaer.temaer) || [];
  const STED = new Map(STEDER.map((s) => [s.id, s]));
  const tema = (id) => TEMAER.find((t) => t.id === id) || TEMAER[0];
  const DEL_URL = "https://rusj.no" + R.forside + ((R.sprak !== "nb" && window.RUSJ_SPILL && window.RUSJ_SPILL.slug) || "skattejegeren") + "/";
  const ALDER_NAVN = { 4: R.t("4–6 år"), 7: R.t("7–9 år"), 10: R.t("10–12 år") };
  const HVOR_NAVN = { inne: R.t("Inne"), ute: R.t("Ute"), begge: R.t("Inne og ute") };
  const MAKS_EGEN_STED = 60;
  const MAKS_EGEN_GATE = 180;
  let H; // the actions, so one can call another
  let endrer = -1; // the post whose sheet is open

  window.Skattejegeren = { Jakt, ALDRE, HVOR, MAATER, MIN_POSTER, MAKS_POSTER, BILDEVALG };

  const maks = (o) => Math.max(MIN_POSTER, Jakt.maks(STEDER, o.alder, o.hvor));
  const stedNavn = (p) => (p.e ? p.e.sted : (STED.get(p.s) || {}).sted || "");
  const gate = (j, p) => (p.e ? p.e.gate : ((STED.get(p.s) || {}).gater || {})[j.alder] || "");
  const ikon = (j, p) => (p.e ? "" : (STED.get(p.s) || {}).ikon || "");
  const innled = (t, i) => (t.innled && t.innled.length ? t.innled[i % t.innled.length] : "");
  const kode = (j, p) => tema(j.tema).koder[p.k] || { o: "", i: "" };
  const bildevalg = (j, i) => Jakt.bildevalg(tema(j.tema).koder.length, j.poster[i].k, R.rng((j.fro + i * 7919) >>> 0));

  function lagJakt(S) {
    const o = S.oppsett;
    const fro = R.nyttFro() >>> 0;
    const rng = R.rng(fro);
    const ider = Jakt.rute(STEDER, o, rng);
    const koder = Jakt.koder(tema(o.tema).koder.length, ider.length, rng);
    S.jakt = { fro, maate: o.maate, tema: tema(o.tema).id, alder: o.alder, hvor: o.hvor, poster: ider.map((s, i) => ({ s, k: koder[i] })), na: -1, start: 0, hjelp: 0, bort: [], ferdig: false, sek: 0, endret: false };
  }

  // A new sheet starts at its top (the kit's sheet keeps the scroll of the one before, e.g. the
  // rules scrolled down to «Lukk»).
  const tilToppen = () => {
    const ark = R.$("#ark-innhold");
    if (ark) ark.scrollTop = 0;
  };

  // The hunt is running: the children have the phone (or the cards are out).
  const iGang = (j) => !!(j && !j.ferdig && j.na >= 0);
  // Something the parent would lose: a running hunt or their own changes to the posts.
  const verdifull = (j) => !!(j && !j.ferdig && (j.na >= 0 || j.endret));

  // ---------- Pieces of markup ----------

  const sammendrag = (j) => {
    const t = tema(j.tema);
    const deler = [`<span aria-hidden="true">${esc(t.ikon)}</span> ${esc(t.navn)}`, esc(ALDER_NAVN[j.alder]), esc(HVOR_NAVN[j.hvor]), esc(R.flertall(j.poster.length, "post", "poster"))];
    return `<p class="sk-sammendrag">${deler.map((d) => `<span class="sk-hel">${d}</span>`).join(" · ")}</p>`;
  };

  // The rooms, in the order the sheet lists them (the hiding places' "rom" in the data).
  const ROM = [
    ["kjokken", R.t("Kjøkkenet")],
    ["stue", R.t("Stua")],
    ["gang", R.t("Gangen")],
    ["bad", R.t("Badet")],
    ["soverom", R.t("Soverommet")],
    ["lek", R.t("Lekeplassen")],
    ["hage", R.t("Hagen")],
    ["terrasse", R.t("Terrassen")],
    ["inngang", R.t("Ved inngangen")],
  ];

  const kodeHtml = (j, p) => {
    const k = kode(j, p);
    return j.alder === 4 ? `<span class="sk-kodebilde" aria-hidden="true">${esc(k.i)}</span><span class="sk-kodeord liten">${esc(k.o)}</span>` : `<span class="sk-kodeord">${esc(k.o)}</span>`;
  };

  function postHtml(j, p, i) {
    const n = j.poster.length;
    const siste = i === n - 1;
    const etikett = siste ? R.t("Skatten") : R.t("Post {n}", { n: i + 1 });
    return `<li class="sk-post${siste ? " sk-post-skatt" : ""}${p.e ? " egen" : ""}">
      <span class="sk-nr" aria-hidden="true">${siste ? "🎁" : i + 1}</span>
      <div class="sk-post-tekst">
        <p class="sk-post-etikett">${esc(etikett)}</p>
        <p class="sk-sted"><span aria-hidden="true">📍</span> ${esc(stedNavn(p))}</p>
        <p class="sk-gate-liten"><span class="vh">${esc(R.t("Ledetråden hit:"))} </span>«${esc(gate(j, p))}»</p>
        ${j.maate === "kode" && !siste ? `<p class="sk-kode-linje">${esc(R.t("Kodeord:"))} ${kodeHtml(j, p)}</p>` : ""}
      </div>
      <button class="sk-endre" data-h="endre" data-v="${i}" aria-label="${esc(R.t("Endre {post}", { post: etikett.toLocaleLowerCase(R.lokale) }))}">${esc(R.t("Endre"))}</button>
    </li>`;
  }

  // One card, on screen and on paper. type: start | post | skatt.
  function kortHtml(j, k) {
    const t = tema(j.tema);
    const n = j.poster.length;
    if (k.type === "skatt") {
      return `<article class="sk-kort sk-kort-skatt">
        <header><span class="sk-kort-ikon" aria-hidden="true">${esc(t.ikon)}</span><span class="sk-kort-nr">${esc(t.skatt.tittel)}</span></header>
        <span class="sk-kort-bilde" aria-hidden="true">🎁</span>
        <p class="sk-kort-gate">${esc(t.skatt.kort)}</p>
        <footer>${esc(R.t("Legg kortet ved skatten: {sted}", { sted: stedNavn(j.poster[k.ved]) }))}</footer>
      </article>`;
    }
    const til = j.poster[k.til];
    const nr = k.til + 1;
    const forste = k.type === "start";
    return `<article class="sk-kort${forste ? " sk-kort-start" : ""}">
      <header><span class="sk-kort-ikon" aria-hidden="true">${esc(t.ikon)}</span><span class="sk-kort-nr">${esc(R.t("Ledetråd {n}", { n: nr }))}</span><span class="sk-kort-av">${esc(R.t("{n} av {av}", { n: nr, av: n }))}</span></header>
      ${forste ? `<p class="sk-kort-intro">${esc(t.start[j.alder] || "")}</p>` : `<p class="sk-kort-innled">${esc(innled(t, k.til))}</p>`}
      ${j.alder === 4 && ikon(j, til) ? `<span class="sk-kort-bilde" aria-hidden="true">${esc(ikon(j, til))}</span>` : ""}
      <p class="sk-kort-gate">${esc(gate(j, til))}</p>
      <footer>${forste ? esc(R.t("Gi dette kortet til barna.")) : esc(R.t("Gjem kortet her: {sted}", { sted: stedNavn(j.poster[k.ved]) }))}</footer>
    </article>`;
  }

  function lappHtml(j, p, i) {
    const t = tema(j.tema);
    return `<article class="sk-lapp">
      <header><span class="sk-kort-ikon" aria-hidden="true">${esc(t.ikon)}</span><span>${esc(R.t("Kodeord"))}</span></header>
      <div class="sk-lapp-kode">${kodeHtml(j, p)}</div>
      <footer>${esc(R.t("Post {n}: {sted}", { n: i + 1, sted: stedNavn(p) }))}</footer>
    </article>`;
  }

  function sistLinje(S) {
    const s = S.sist;
    if (!s) return "";
    const t = tema(s.tema);
    const deler = [`${t.ikon} ${t.navn}`, R.flertall(s.poster, "post", "poster")];
    if (s.sek) deler.push(R.formaterTid(s.sek));
    return `<p class="sk-sist">${esc(R.t("Sist: {hva}", { hva: deler.join(" · ") }))}${S.funnet > 1 ? ` · ${esc(R.t("{n} skatter funnet|{n} skatter funnet", { n: S.funnet }))}` : ""}</p>`;
  }

  // ---------- Finding a post ----------

  function funnet(S) {
    const j = S.jakt;
    if (!iGang(j)) return;
    const siste = j.na >= j.poster.length - 1;
    if (siste) return ferdig(S);
    j.na += 1;
    j.bort = [];
    j.forrige = Date.now();
    R.lyd.riktig();
    R.vibrer([18, 40, 18]);
    R.toast(R.t("Riktig! Her er neste ledetråd."));
    R.vis();
    const kort = R.$(".sk-ledetrad");
    if (kort && !R.rolig()) kort.classList.add("ny");
  }

  function ferdig(S) {
    const j = S.jakt;
    j.ferdig = true;
    j.na = j.poster.length;
    j.sek = j.start ? Math.max(1, Math.min(6 * 3600, Math.round((Date.now() - j.start) / 1000))) : 0;
    S.funnet = (S.funnet || 0) + 1;
    S.sist = { tema: j.tema, poster: j.poster.length, alder: j.alder, sek: j.sek };
    R.merke("skattejegeren-skatt");
    R.statistikk("ferdig", { poster: j.poster.length, alder: j.alder, maate: j.maate, hjelp: j.hjelp, min: Math.round(j.sek / 60) });
    R.gaTil("slutt");
  }

  // ---------- Start ----------

  R.start({
    id: "skattejegeren",
    versjon: 1,
    pagar: (S) => !!(S.jakt && !S.jakt.ferdig),

    tilstand: () => ({
      oppsett: { maate: "trykk", tema: (TEMAER[0] || {}).id || "pirat", alder: 7, hvor: "inne", antall: 6 },
      jakt: null,
      utskrift: "kort",
      sist: null,
      funnet: 0,
    }),

    lastet(S) {
      const heltall = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
      const tekst = (s, n) => typeof s === "string" && s.trim().length > 0 && s.length <= n;
      const o = S.oppsett && typeof S.oppsett === "object" ? S.oppsett : {};
      S.oppsett = {
        maate: MAATER.includes(o.maate) ? o.maate : "trykk",
        tema: TEMAER.some((t) => t.id === o.tema) ? o.tema : (TEMAER[0] || {}).id,
        alder: ALDRE.includes(o.alder) ? o.alder : 7,
        hvor: HVOR.includes(o.hvor) ? o.hvor : "inne",
        antall: heltall(o.antall, MIN_POSTER, MAKS_POSTER) ? o.antall : 6,
      };
      S.oppsett.antall = Math.min(S.oppsett.antall, maks(S.oppsett));
      S.utskrift = S.utskrift === "koder" ? "koder" : "kort";
      S.funnet = heltall(S.funnet, 0, 1e7) ? S.funnet : 0;
      const s = S.sist;
      S.sist = s && TEMAER.some((t) => t.id === s.tema) && heltall(s.poster, 1, MAKS_POSTER) ? { tema: s.tema, poster: s.poster, alder: ALDRE.includes(s.alder) ? s.alder : 7, sek: heltall(s.sek, 0, 6 * 3600) ? s.sek : 0 } : null;
      const j = S.jakt;
      if (j) {
        const t = TEMAER.find((x) => x.id === j.tema);
        const ok =
          t &&
          MAATER.includes(j.maate) &&
          ALDRE.includes(j.alder) &&
          HVOR.includes(j.hvor) &&
          Number.isFinite(j.fro) &&
          Array.isArray(j.poster) &&
          j.poster.length >= 1 &&
          j.poster.length <= MAKS_POSTER &&
          j.poster.every((p) => p && STED.has(p.s) && heltall(p.k, 0, t.koder.length - 1) && (p.e == null || (tekst(p.e.sted, MAKS_EGEN_STED) && tekst(p.e.gate, MAKS_EGEN_GATE)))) &&
          new Set(j.poster.map((p) => p.s)).size === j.poster.length &&
          heltall(j.na, -1, j.poster.length);
        if (!ok) S.jakt = null;
        else {
          j.ferdig = !!j.ferdig;
          if (!j.ferdig && j.na >= j.poster.length) j.na = j.poster.length - 1;
          j.start = Number.isFinite(j.start) && j.start >= 0 ? j.start : 0;
          j.hjelp = heltall(j.hjelp, 0, 1e6) ? j.hjelp : 0;
          j.sek = heltall(j.sek, 0, 6 * 3600) ? j.sek : 0;
          j.bort = Array.isArray(j.bort) ? j.bort.filter((b) => heltall(b, 0, t.koder.length - 1)) : [];
          j.endret = !!j.endret;
          for (const p of j.poster) if (p.e == null) delete p.e;
        }
      }
      const jj = S.jakt;
      if (["plan", "utskrift", "jakt", "slutt"].includes(S.skjerm) && !jj) S.skjerm = "hjem";
      if (S.skjerm === "jakt" && jj && (jj.ferdig || jj.na < 0)) S.skjerm = jj.ferdig ? "slutt" : "plan";
      if (S.skjerm === "slutt" && jj && !jj.ferdig) S.skjerm = "plan";
    },

    regler: {
      intro: R.t("Lag en skattejakt til barnebursdagen på et par minutter. Mobilen lager ledetrådene – du gjemmer dem."),
      steg: [
        [R.t("Velg"), R.t("Velg tema, hvor gamle barna er, hvor mange poster dere vil ha, og om jakten skal være inne eller ute.")],
        [R.t("Gjem"), R.t("Se hvor hver ledetråd skal ligge, og bytt sted der det passer bedre hjemme hos dere. Skatten gjemmer du ved den siste posten.")],
        [R.t("Jakt!"), R.t("Skriv ut kortene og gi barna det første – eller gi dem mobilen. Der låser de opp én ledetråd om gangen, med et trykk eller et kodeord fra posten.")],
      ],
      tips: [
        R.t("Gjem ledetrådene der barna trygt kan lete: ikke høyt oppe, ikke i ovnen og ikke nær vei eller vann."),
        R.t("For de minste viser kortet et bilde som hint, og kodeordet er et bilde de trykker på."),
        R.t("Lag skatten først – godteposer, klistremerker eller en liten premie til hver – og gjem den til slutt."),
        R.t("Står barna fast? «Trenger dere hjelp?» viser hvor ledetråden peker."),
        R.t("Alt lagres bare på denne mobilen. Ingen navn, ingen konto."),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const j = S.jakt;
          const aktiv = !!(j && !j.ferdig);
          const t = aktiv ? tema(j.tema) : null;
          return R.ui.spillhjem({
            slagordHtml: `${esc(R.t("Ledetråder, gåter og en skjult skatt."))}<br><em>${esc(R.t("Klar på to minutter."))}</em>`,
            knapperHtml: R.ui.startKnapper({
              pagar: aktiv,
              fortsettTekst: aktiv ? (iGang(j) ? R.t("Fortsett jakten · ledetråd {n}", { n: j.na + 1 }) : R.t("Fortsett · {tema}", { tema: t.navn })) : "",
              nyTekst: R.t("Ny skattejakt"),
              startTekst: R.t("Lag en skattejakt"),
              ekstraHtml: R.ui.lenke(R.t("Slik spiller du"), "regler") + sistLinje(S),
            }),
            merker: [
              ["4–12", R.t("år")],
              [String(TEMAER.length), R.t("temaer")],
              ["0", R.t("konto")],
            ],
          });
        },
      },

      oppsett: {
        tittel: R.t("Skattejakt"),
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          const mx = maks(o);
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
            <section class="seksjon sk-maater">
              <div class="seksjon-hode"><h2>${esc(R.t("Hvordan finner barna ledetrådene?"))}</h2></div>
              ${R.ui.fliser(
                "maate",
                [
                  { v: "utskrift", tittel: R.t("Utskrift"), tekst: R.t("Klipp ut kortene og gjem dem"), ikon: "🖨️" },
                  { v: "trykk", tittel: R.t("På mobilen"), tekst: R.t("Én ledetråd om gangen – trykk når dere er framme"), ikon: "📱" },
                  { v: "kode", tittel: R.t("Med kodeord"), tekst: R.t("Et kodeord ved hver post låser opp neste"), ikon: "🔑" },
                ],
                o.maate,
                { en: true },
              )}
            </section>
            <section class="seksjon sk-temaer">
              <div class="seksjon-hode"><h2>${esc(R.t("Tema"))}</h2></div>
              ${R.ui.fliser(
                "tema",
                TEMAER.map((t) => ({ v: t.id, tittel: t.navn, tekst: t.tekst, ikon: esc(t.ikon) })),
                o.tema,
              )}
            </section>
            <section class="seksjon">
              <div class="seksjon-hode"><h2>${esc(R.t("Hvor gamle er barna?"))}</h2></div>
              ${R.ui.seg("alder", ALDRE.map((a) => [a, ALDER_NAVN[a]]), o.alder, { etikett: R.t("Hvor gamle er barna?") })}
            </section>
            <section class="seksjon">
              <div class="seksjon-hode"><h2>${esc(R.t("Hvor skal dere lete?"))}</h2></div>
              ${R.ui.seg("hvor", HVOR.map((h) => [h, HVOR_NAVN[h]]), o.hvor, { etikett: R.t("Hvor skal dere lete?") })}
            </section>
            <section class="seksjon">
              <div class="seksjon-hode"><h2>${esc(R.t("Antall poster"))}</h2></div>
              ${R.ui.teller("antall", o.antall, MIN_POSTER, mx, { minus: R.t("Færre poster"), pluss: R.t("Flere poster") })}
              <p class="hjelp">${esc(R.t("Skatten ligger ved den siste posten."))}</p>
            </section>
            ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start", { variant: "stor" }))}`;
        },
      },

      plan: {
        tittel: (S) => (S.jakt ? tema(S.jakt.tema).navn : ""),
        tilbake: "hjem",
        vis(S) {
          const j = S.jakt;
          if (!j) return `<h1 id="skjerm-tittel" class="vh">${esc(R.t("Postene"))}</h1>`;
          const tekst = {
            utskrift: R.t("Skriv ut kortene og klipp dem ut. Gi barna det første kortet, og gjem resten der det står på dem."),
            trykk: R.t("Gjem skatten ved den siste posten. Barna får mobilen, leser ledetråden og trykker «Vi fant den!» når de er framme."),
            kode: R.t("Skriv ut kodelappene, eller skriv kodeordene på lapper, og gjem dem der det står. Kodeordet ved en post låser opp neste ledetråd."),
          }[j.maate];
          const lenker =
            j.maate === "utskrift"
              ? R.ui.lenkerad(R.ui.lenke(R.t("Skatten er funnet!"), "skatt-funnet"))
              : R.ui.lenkerad(j.maate === "kode" ? R.ui.lenke(R.t("Skriv ut kodelappene"), "til-utskrift", { v: "koder" }) : "", R.ui.lenke(R.t("Skriv ut kortene"), "til-utskrift", { v: "kort" }));
          const hoved = j.maate === "utskrift" ? R.ui.knapp(R.t("Skriv ut kortene"), "til-utskrift", { v: "kort", ikon: "🖨️" }) : R.ui.knapp(iGang(j) ? R.t("Fortsett jakten") : R.t("Start jakten"), "jakt", { ikon: "🗺️" });
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Postene"))}</h1>
            ${sammendrag(j)}
            <p class="ingress sk-ingress">${esc(tekst)}</p>
            <ol class="sk-poster">
              <li class="sk-post sk-post-start"><span class="sk-nr" aria-hidden="true">${esc(tema(j.tema).ikon)}</span><div class="sk-post-tekst"><p class="sk-post-etikett">${esc(R.t("Start"))}</p><p class="sk-sted">${esc(j.maate === "utskrift" ? R.t("Barna får det første kortet i hånden.") : R.t("Barna får første ledetråd på mobilen."))}</p></div></li>
              ${j.poster.map((p, i) => postHtml(j, p, i)).join("")}
            </ol>
            ${R.ui.lenkerad(R.ui.lenke(R.t("Bland postene på nytt"), "bland"), R.ui.lenke(R.t("Endre oppsett"), "til-oppsett"))}
            ${R.ui.dokk(hoved, lenker)}`;
        },
      },

      utskrift: {
        tittel: R.t("Skriv ut"),
        tilbake: "plan",
        vis(S) {
          const j = S.jakt;
          if (!j) return `<h1 id="skjerm-tittel" class="vh">${esc(R.t("Skriv ut"))}</h1>`;
          const koder = j.maate === "kode" && S.utskrift === "koder";
          const innhold = koder ? j.poster.slice(0, -1).map((p, i) => lappHtml(j, p, i)).join("") : Jakt.kort(j.poster.length).map((k) => kortHtml(j, k)).join("");
          return `
            <h1 id="skjerm-tittel">${esc(koder ? R.t("Kodelappene") : R.t("Ledetrådene"))}</h1>
            ${j.maate === "kode" ? R.ui.seg("utskrift-type", [["kort", R.t("Ledetråder")], ["koder", R.t("Kodelapper")]], koder ? "koder" : "kort", { etikett: R.t("Hva vil du skrive ut?") }) : ""}
            <p class="ingress sk-ingress">${esc(koder ? R.t("Klipp ut lappene og gjem dem ved postene. Barna skriver kodeordet inn på mobilen.") : R.t("Skriv ut på A4, og klipp langs de stiplede linjene. Det står nederst på hvert kort hvor det skal gjemmes."))}</p>
            <div class="sk-trykk ${koder ? "sk-trykk-lapper" : "sk-trykk-kort"}" data-utenfor-ok>${innhold}</div>
            ${R.ui.dokk(R.ui.knapp(R.t("Skriv ut"), "skriv-ut", { ikon: "🖨️" }))}`;
        },
      },

      jakt: {
        tittel: (S) => (S.jakt ? tema(S.jakt.tema).navn : ""),
        tilbake: "hjem",
        vis(S) {
          const j = S.jakt;
          if (!iGang(j)) return `<h1 id="skjerm-tittel" class="vh">${esc(R.t("Skattejakt"))}</h1>`;
          const t = tema(j.tema);
          const n = j.poster.length;
          const i = j.na;
          const p = j.poster[i];
          const siste = i === n - 1;
          let dokk;
          if (siste || j.maate !== "kode") dokk = R.ui.dokk(R.ui.knapp(siste ? R.t("Vi fant skatten!") : R.t("Vi fant den!"), "funnet", { ikon: siste ? "🎁" : "✓" }));
          else if (j.alder === 4) {
            const valg = bildevalg(j, i);
            dokk = R.ui.dokk(`<p class="sk-sporsmal" id="sk-bildespm">${esc(R.t("Hvilket bilde fant dere?"))}</p>
              <div class="sk-bildevalg" role="group" aria-labelledby="sk-bildespm">${valg
                .map((v) => `<button class="sk-bildeknapp" data-h="bilde" data-v="${v}" aria-label="${esc(t.koder[v].o)}"${j.bort.includes(v) ? " disabled" : ""}><span aria-hidden="true">${esc(t.koder[v].i)}</span></button>`)
                .join("")}</div>`);
          } else
            dokk = R.ui.dokk(`<form class="sk-kodeform" data-skjema="kode" autocomplete="off">
                <label for="sk-kode">${esc(R.t("Kodeordet fra posten"))}</label>
                <div class="sk-koderad"><input id="sk-kode" name="kode" maxlength="20" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" enterkeyhint="go"><button class="knapp" type="submit">${esc(R.t("Lås opp"))}</button></div>
              </form>`);
          return `
            ${R.ui.fremdrift(n, i)}
            <h1 id="skjerm-tittel" class="vh">${esc(R.t("Ledetråd {n}", { n: i + 1 }))}</h1>
            <article class="sk-ledetrad">
              <p class="sk-ledetrad-nr">${esc(siste ? R.t("Siste ledetråd!") : R.t("Ledetråd {n} av {av}", { n: i + 1, av: n }))}</p>
              ${i === 0 ? `<p class="sk-intro">${esc(t.start[j.alder] || "")}</p>` : `<p class="sk-innled">${esc(innled(t, i))}</p>`}
              ${j.alder === 4 && ikon(j, p) ? `<span class="sk-bilde" aria-hidden="true">${esc(ikon(j, p))}</span>` : ""}
              <p class="sk-gate">${esc(gate(j, p))}</p>
            </article>
            ${R.ui.lenkerad(R.ui.lenke(R.t("Trenger dere hjelp?"), "hjelp"), i > 0 ? R.ui.lenke(R.t("Angre"), "angre") : "", R.ui.lenke(R.t("Avslutt"), "avslutt"))}
            ${dokk}`;
        },
        inn(S) {
          if (!iGang(S.jakt)) return R.gaTil(S.jakt && S.jakt.ferdig ? "slutt" : "plan");
          R.holdVaken();
        },
        ut() {
          R.slippVaken();
        },
      },

      slutt: {
        tittel: R.t("Kåringen"),
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const j = S.jakt;
          if (!j) return `<h1 id="skjerm-tittel" class="vh">${esc(R.t("Kåringen"))}</h1>`;
          const t = tema(j.tema);
          return `
            ${R.ui.banner({ etikett: `${t.ikon} ${t.navn}`, tittel: t.skatt.tittel, tekst: t.skatt.tekst, klasse: "aksent" })}
            <div class="sk-resultat${j.sek ? "" : " en"}">
              ${j.sek ? `<div class="sk-tall"><b>${esc(R.formaterTid(j.sek))}</b><span>${esc(R.t("tid"))}</span></div>` : ""}
              <div class="sk-tall"><b>${esc(String(j.poster.length))}</b><span>${esc(R.t("poster"))}</span></div>
            </div>
            <p class="hjelp sk-linje">${esc(R.t("Godt jobba, skattejegere!"))}${S.funnet > 1 ? " " + esc(R.t("Dette er skatt nummer {n} på denne mobilen.", { n: S.funnet })) : ""}</p>
            ${R.ui.knapp2(R.t("Del"), "del", { ikon: "📤" })}
            ${R.ui.flereSpill({ antall: 4 })}
            ${R.ui.dokk(R.ui.knapp(R.t("Ny skattejakt"), "igjen"), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "til-oppsett"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
        },
        inn(S) {
          if (!S.jakt || !S.jakt.ferdig) return;
          R.lyd.fanfare();
          R.vibrer([40, 60, 120]);
          R.konfetti();
        },
      },
    },

    skjema: {
      kode(S, form) {
        const j = S.jakt;
        if (!iGang(j)) return;
        const felt = form.querySelector("input");
        const svar = felt ? felt.value : "";
        if (!svar.trim()) {
          if (felt) felt.focus();
          return;
        }
        if (Jakt.riktigKode(svar, kode(j, j.poster[j.na]).o)) return funnet(S);
        R.lyd.tone(330, 0, 0.12, "sine", 0.05);
        R.vibrer(20);
        R.toast(R.t("Ikke helt. Se på lappen en gang til!"));
        if (felt) {
          felt.classList.remove("rist");
          void felt.offsetWidth;
          felt.classList.add("rist");
          felt.select();
        }
      },
      egen(S, form) {
        const j = S.jakt;
        const i = endrer;
        if (!j || i < 0 || i >= j.poster.length) return R.lukkArk();
        const sted = R.kutt(String(form.elements.sted.value || "").trim(), MAKS_EGEN_STED);
        const ny = R.kutt(String(form.elements.gate.value || "").trim(), MAKS_EGEN_GATE);
        if (!ny) {
          R.toast(R.t("Skriv ledetråden først."));
          form.elements.gate.focus();
          return;
        }
        j.poster[i].e = { sted: sted || R.t("Mitt eget gjemmested"), gate: ny };
        j.endret = true;
        R.lukkArk();
        R.vis();
        R.toast(R.t("Din egen ledetråd er lagret."));
      },
    },

    handlinger: (H = {
      async nytt(el, e, S) {
        const fortsatt = R.vakt();
        if ((await R.bekreftNytt(verdifull(S.jakt), true)) && fortsatt()) R.gaTil("oppsett");
      },
      fortsett(el, e, S) {
        const j = S.jakt;
        R.gaTil(!j ? "hjem" : j.ferdig ? "slutt" : iGang(j) ? "jakt" : "plan");
      },
      maate(el, e, S) {
        if (MAATER.includes(el.dataset.v)) S.oppsett.maate = el.dataset.v;
        R.vis();
      },
      tema(el, e, S) {
        if (TEMAER.some((t) => t.id === el.dataset.v)) S.oppsett.tema = el.dataset.v;
        R.vis();
      },
      alder(el, e, S) {
        const a = Number(el.dataset.v);
        if (ALDRE.includes(a)) S.oppsett.alder = a;
        S.oppsett.antall = Math.min(S.oppsett.antall, maks(S.oppsett));
        R.vis();
      },
      hvor(el, e, S) {
        if (HVOR.includes(el.dataset.v)) S.oppsett.hvor = el.dataset.v;
        S.oppsett.antall = Math.min(S.oppsett.antall, maks(S.oppsett));
        R.vis();
      },
      antall(el, e, S) {
        S.oppsett.antall = R.klamp(S.oppsett.antall + Number(el.dataset.v), MIN_POSTER, maks(S.oppsett));
        R.vis();
      },
      async start(el, e, S) {
        const fortsatt = R.vakt();
        if (verdifull(S.jakt) && !(await R.bekreftNytt(true, true))) return;
        if (!fortsatt()) return;
        lagJakt(S);
        R.statistikk("start", { poster: S.jakt.poster.length, alder: S.jakt.alder, maate: S.jakt.maate, hvor: S.jakt.hvor, tema: S.jakt.tema });
        R.gaTil("plan");
      },
      "til-oppsett"(el, e, S) {
        if (S.jakt && S.jakt.ferdig) S.oppsett = Object.assign({}, S.oppsett, { maate: S.jakt.maate, tema: S.jakt.tema, alder: S.jakt.alder, hvor: S.jakt.hvor });
        R.gaTil("oppsett");
      },
      async bland(el, e, S) {
        const j = S.jakt;
        if (!j) return;
        const fortsatt = R.vakt();
        if (j.endret || iGang(j)) {
          const ja = await R.bekreft(R.t("Lage nye poster?"), R.t("Du får nye gjemmesteder, og endringene du har gjort, forsvinner."), R.t("Bland"), R.t("Avbryt"));
          if (!ja || !fortsatt()) return;
        }
        S.oppsett = Object.assign({}, S.oppsett, { maate: j.maate, tema: j.tema, alder: j.alder, hvor: j.hvor, antall: j.poster.length });
        lagJakt(S);
        R.vis();
        R.toast(R.t("Nye poster!"));
      },
      endre(el, e, S) {
        const j = S.jakt;
        const i = Number(el.dataset.v);
        if (!j || !Number.isInteger(i) || i < 0 || i >= j.poster.length) return;
        endrer = i;
        const p = j.poster[i];
        const siste = i === j.poster.length - 1;
        const ledige = Jakt.ledige(STEDER, j.poster, i, j.alder, j.hvor);
        R.ark(`
          <h2 id="ark-tittel">${esc(siste ? R.t("Skatten") : R.t("Post {n}", { n: i + 1 }))}</h2>
          <p class="ingress">${esc(R.t("Velg et annet gjemmested – ledetråden følger med."))}</p>
          ${R.ui.knapp2(R.t("Et tilfeldig sted"), "tilfeldig", { ikon: "🎲" })}
          ${ROM.map(([rom, navn]) => {
            const her = ledige.filter((s) => s.rom === rom);
            return her.length
              ? `<h3 class="sk-rom" id="sk-rom-${rom}">${esc(navn)}</h3><div class="sk-steder" role="group" aria-labelledby="sk-rom-${rom}">${her
                  .map((s) => `<button class="sk-stedvalg" data-h="velg-sted" data-v="${esc(s.id)}" aria-pressed="${!p.e && s.id === p.s}"><span aria-hidden="true">${esc(s.ikon || "📍")}</span>${esc(s.sted)}</button>`)
                  .join("")}</div>`
              : "";
          }).join("")}
          <form class="sk-egen" data-skjema="egen" autocomplete="off">
            <h3>${esc(R.t("Eller skriv din egen"))}</h3>
            <label for="sk-egen-sted">${esc(R.t("Hvor gjemmer du den?"))}</label>
            <input id="sk-egen-sted" name="sted" maxlength="${MAKS_EGEN_STED}" value="${esc(p.e ? p.e.sted : "")}" placeholder="${esc(R.t("F.eks. under trappa"))}">
            <label for="sk-egen-gate">${esc(R.t("Ledetråden barna får"))}</label>
            <textarea id="sk-egen-gate" name="gate" maxlength="${MAKS_EGEN_GATE}" rows="3" placeholder="${esc(R.t("F.eks. Let der vi går opp og ned hver dag!"))}">${esc(p.e ? p.e.gate : "")}</textarea>
            <button class="knapp-2" type="submit">${esc(R.t("Bruk min ledetråd"))}</button>
          </form>
          <button class="lenke" data-h="lukk-ark">${esc(R.t("Lukk"))}</button>`);
        tilToppen();
      },
      "velg-sted"(el, e, S) {
        const j = S.jakt;
        const i = endrer;
        const id = el.dataset.v;
        if (!j || i < 0 || i >= j.poster.length || !Jakt.passer(STED.get(id), j.alder, j.hvor)) return R.lukkArk();
        Jakt.bytt(j.poster, i, id);
        delete j.poster[i].e;
        j.endret = true;
        R.lukkArk();
        R.vis();
        R.toast(R.t("Nytt gjemmested: {sted}", { sted: stedNavn(j.poster[i]) }));
      },
      tilfeldig(el, e, S) {
        const j = S.jakt;
        const i = endrer;
        if (!j || i < 0 || i >= j.poster.length) return R.lukkArk();
        const andre = Jakt.ledige(STEDER, j.poster, i, j.alder, j.hvor).filter((s) => s.id !== j.poster[i].s);
        if (!andre.length) return R.toast(R.t("Det finnes ikke flere steder å velge."));
        H["velg-sted"]({ dataset: { v: R.velg(andre).id } }, e, S);
      },
      "til-utskrift"(el, e, S) {
        if (!S.jakt) return;
        S.utskrift = el.dataset.v === "koder" ? "koder" : "kort";
        R.gaTil("utskrift");
      },
      "utskrift-type"(el, e, S) {
        S.utskrift = el.dataset.v === "koder" ? "koder" : "kort";
        R.vis();
      },
      "skriv-ut"(el, e, S) {
        if (!S.jakt) return;
        R.statistikk("utskrift", { poster: S.jakt.poster.length, lapper: S.utskrift === "koder" });
        try {
          window.print();
        } catch (feil) {
          R.toast(R.t("Utskrift virker ikke i denne nettleseren."));
        }
      },
      jakt(el, e, S) {
        const j = S.jakt;
        if (!j || j.ferdig) return;
        if (j.na < 0) {
          j.na = 0;
          j.start = Date.now();
          j.bort = [];
        }
        R.gaTil("jakt");
      },
      funnet(el, e, S) {
        funnet(S);
      },
      bilde(el, e, S) {
        const j = S.jakt;
        if (!iGang(j)) return;
        const v = Number(el.dataset.v);
        if (v === j.poster[j.na].k) return funnet(S);
        if (!j.bort.includes(v)) j.bort.push(v);
        R.lyd.tone(330, 0, 0.12, "sine", 0.05);
        R.vis();
        R.toast(R.t("Ikke det bildet – prøv et annet!"));
      },
      async hjelp(el, e, S) {
        const j = S.jakt;
        if (!iGang(j)) return;
        const fortsatt = R.vakt();
        const ja = await R.bekreft(R.t("Vise svaret?"), R.t("Da ser dere hvor ledetråden peker. Prøv gjerne litt til først!"), R.t("Vis svaret"), R.t("Vi prøver selv"));
        if (!ja || !fortsatt() || !iGang(j)) return;
        j.hjelp += 1;
        R.lagre();
        R.ark(`
          <h2 id="ark-tittel">${esc(R.t("Svaret"))}</h2>
          <p class="sk-svar"><span aria-hidden="true">📍</span> ${esc(stedNavn(j.poster[j.na]))}</p>
          ${R.ui.knapp(R.t("Lukk"), "lukk-ark")}`);
        tilToppen();
      },
      angre(el, e, S) {
        const j = S.jakt;
        if (!iGang(j) || j.na < 1) return;
        j.na -= 1;
        j.bort = [];
        R.vis();
        R.toast(R.t("Tilbake til ledetråd {n}", { n: j.na + 1 }));
      },
      async avslutt(el, e, S) {
        const fortsatt = R.vakt();
        const ja = await R.bekreft(R.t("Avslutte jakten?"), R.t("Postene blir liggende, så dere kan starte jakten på nytt."), R.t("Avslutt"), R.t("Spill videre"));
        if (!ja || !fortsatt() || !S.jakt) return;
        S.jakt.na = -1;
        S.jakt.bort = [];
        R.gaTil("plan");
      },
      "skatt-funnet"(el, e, S) {
        const j = S.jakt;
        if (!j || j.ferdig) return;
        j.na = Math.max(0, j.na);
        ferdig(S);
      },
      igjen(el, e, S) {
        const j = S.jakt;
        if (j) S.oppsett = Object.assign({}, S.oppsett, { maate: j.maate, tema: j.tema, alder: j.alder, hvor: j.hvor, antall: Math.min(j.poster.length, maks(S.oppsett)) });
        lagJakt(S);
        R.statistikk("start", { poster: S.jakt.poster.length, alder: S.jakt.alder, maate: S.jakt.maate, hvor: S.jakt.hvor, tema: S.jakt.tema });
        R.gaTil("plan");
      },
      del(el, e, S) {
        const j = S.jakt;
        if (!j || !j.ferdig) return;
        const t = tema(j.tema);
        const tekst = j.sek
          ? R.t("Vi fant skatten etter {n} poster på {tid}! Lag din egen skattejakt:", { n: j.poster.length, tid: R.formaterTid(j.sek) })
          : R.t("Vi fant skatten etter {n} poster! Lag din egen skattejakt:", { n: j.poster.length });
        R.del(R.app.navn, `${t.ikon} ${tekst}`, DEL_URL, { kort: { tittel: t.skatt.tittel, linjer: [j.sek ? R.formaterTid(j.sek) : R.flertall(j.poster.length, "post", "poster"), `${t.ikon} ${t.navn}`, j.sek ? R.flertall(j.poster.length, "post", "poster") : ALDER_NAVN[j.alder]] } });
      },
    }),
  });
})();
