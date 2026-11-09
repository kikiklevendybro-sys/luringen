/* Hjulet — «Snurr og skål» (a spin-the-wheel drinking game, 18+).
   A big glossy wheel with twelve fields. The player whose turn it is spins it (button, a tap on
   the wheel or a flick with a finger), the pointer flaps over the pegs, and the field it stops on
   decides what happens: a toast, a truth, a safe challenge, a category round, a new rule, a mate,
   a water break, a free pass … Then the phone goes to the next player. The fields can be renamed
   and rewritten as house rules (saved on this phone).
   Responsible by design: small sips only, alcohol-free counts the same, everyone may pass, no
   chugging, a water field on the wheel and a water break every ten spins. */
(function () {
  "use strict";

  const R = window.Rusj;
  const D = window.RUSJ_DATA.hjul;
  const esc = R.esc;

  const FELT = D.felt;
  const N = FELT.length; // 12
  const GRAD = 360 / N;
  const PEKER = 90; // the pointer sits at 3 o'clock, so the winning label reads left to right
  const VANN_HVERT = 10; // a water break after every tenth spin (unless the wheel just gave one)
  const MAKS_NAVN = 14;
  const MAKS_TEKST = 120;
  const IDEER = { sannhet: "sannhet", utfordring: "utfordring", kategori: "kategori", regel: "regel" };
  const indeks = (id) => FELT.findIndex((f) => f.id === id);

  const norm = (a) => ((a % 360) + 360) % 360;
  // The field under the pointer when the wheel is turned `theta` degrees clockwise.
  const feltVed = (theta) => Math.floor(norm(PEKER - theta) / GRAD) % N;
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const nesteSpiller = (sp) => (sp.tur + 1) % sp.antall;

  let H; // the actions, so one action can reuse another
  let animasjon = null; // the running wheel animation, if any
  let laast = false; // the wheel just stopped: wait for the card

  function standardAntall() {
    const lagret = R.felles.navn.filter((n) => String(n || "").trim()).length;
    return R.klamp(lagret || 4, 3, 20);
  }

  // A field with the house rules (if any) applied. `eget`: changed by the players, so the game
  // shows only their text (no suggestions or extra buttons).
  // A truth or challenge that is only renamed keeps its text and its built-in questions.
  const BEHOLD_VED_NYTT_NAVN = { sannhet: true, utfordring: true };

  function feltInfo(S, i) {
    const f = FELT[i];
    const eget = (S.oppsett.felt && S.oppsett.felt[f.id]) || {};
    const navn = String(eget.navn || "").trim().slice(0, MAKS_NAVN);
    const tekst = String(eget.tekst || "").trim().slice(0, MAKS_TEKST);
    const behold = !!BEHOLD_VED_NYTT_NAVN[f.id] && !tekst;
    return {
      i,
      id: f.id,
      ikon: f.ikon,
      farge: f.farge,
      navn: navn || f.navn,
      tittel: navn || f.tittel,
      tekst: tekst || (navn && !behold ? "" : f.tekst),
      eget: !!(tekst || (navn && !behold)),
      nyttNavn: !!navn,
    };
  }
  const antallEgne = (S) => FELT.filter((f, i) => feltInfo(S, i).eget || feltInfo(S, i).nyttNavn).length;

  // ---------- The wheel ----------

  // A wedge from angle a to b (degrees clockwise from the top), radius r, centre 0,0.
  function kile(a, b, r) {
    const p = (v) => {
      const rad = (v * Math.PI) / 180;
      return `${(r * Math.sin(rad)).toFixed(2)} ${(-r * Math.cos(rad)).toFixed(2)}`;
    };
    return `M0 0 L${p(a)} A${r} ${r} 0 0 1 ${p(b)} Z`;
  }

  function hjulSvg(S, o = {}) {
    const kiler = [];
    const merker = [];
    for (let i = 0; i < N; i++) {
      const f = feltInfo(S, i);
      const a = i * GRAD;
      kiler.push(`<path class="hjul-kile${o.valgt === i ? " vinner" : ""}" data-kile="${i}" d="${kile(a, a + GRAD, 98)}" style="--kf: var(--${f.farge})"/>`);
      const lengde = Math.max(4, Array.from(f.navn).length);
      const fs = R.klamp(50 / (lengde * 0.6), 6.2, 10.5).toFixed(2);
      merker.push(
        `<g transform="rotate(${(a + GRAD / 2).toFixed(1)})">` +
          `<text class="hjul-navn" transform="translate(0 -49) rotate(-90)" font-size="${fs}">${esc(f.navn)}</text>` +
          `<text class="hjul-ikon" transform="translate(0 -85) rotate(-90)">${f.ikon}</text>` +
          `</g>`,
      );
    }
    const pinner = Array.from({ length: N }, (_, i) => {
      const rad = (i * GRAD * Math.PI) / 180;
      return `<circle cx="${(99 * Math.sin(rad)).toFixed(2)}" cy="${(-99 * Math.cos(rad)).toFixed(2)}" r="2.6"/>`;
    }).join("");
    const lys = Array.from({ length: 24 }, (_, i) => {
      const rad = ((i * 15 + 7.5) * Math.PI) / 180;
      return `<circle class="${i % 2 ? "en" : "to"}" cx="${(105 * Math.sin(rad)).toFixed(2)}" cy="${(-105 * Math.cos(rad)).toFixed(2)}" r="2.2"/>`;
    }).join("");
    return `<svg class="hjul-svg" viewBox="-111 -111 222 222" aria-hidden="true" focusable="false">
      <circle r="110" class="hjul-kant"/>
      <circle r="100.5" class="hjul-kant-indre"/>
      <g class="hjul-lys">${lys}</g>
      <g class="hjul-kiler">${kiler.join("")}</g>
      <g class="hjul-merker">${merker.join("")}</g>
      <g class="hjul-pinner">${pinner}</g>
      <circle r="19" class="hjul-nav"/>
      <path class="hjul-nav-stjerne" d="M0 -9 L2.6 -2.6 L9 0 L2.6 2.6 L0 9 L-2.6 2.6 L-9 0 L-2.6 -2.6 Z"/>
    </svg>`;
  }

  const GLANS = `<svg class="hjul-glans" viewBox="-111 -111 222 222" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="hjul-glans-farge" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <radialGradient id="hjul-skygge" cx="50%" cy="50%" r="50%"><stop offset=".78" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></radialGradient>
      <clipPath id="hjul-klipp"><circle r="98"/></clipPath>
    </defs>
    <circle r="98" fill="url(#hjul-skygge)"/>
    <ellipse cx="-24" cy="-50" rx="80" ry="48" fill="url(#hjul-glans-farge)" clip-path="url(#hjul-klipp)"/>
  </svg>`;

  const PEKERSVG = `<svg viewBox="0 0 52 40" aria-hidden="true" focusable="false">
    <path d="M3 20 L34 5 Q49 2 49 20 Q49 38 34 35 Z" fill="var(--papir)" stroke="var(--blekk)" stroke-width="4" stroke-linejoin="round"/>
    <path d="M12 20 L32 11" stroke="#fff" stroke-opacity=".8" stroke-width="3" stroke-linecap="round"/>
    <circle cx="37" cy="20" r="5.5" fill="var(--aksent)" stroke="var(--blekk)" stroke-width="3"/>
  </svg>`;

  const SNURR_IKON =
    '<svg class="hjul-snurrikon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 12.5a8 8 0 1 1-2.6-6.4"/><path d="M19.5 3.5v4.4h-4.4"/></svg>';

  function hjulHtml(S, o = {}) {
    const sp = S.spill;
    const vinkel = sp ? sp.vinkel : o.vinkel || 0;
    const f = o.valgt != null ? feltInfo(S, o.valgt) : null;
    return `
      <div class="hjul${o.vent ? " vent" : ""}${f ? " har-valgt" : ""}" id="hjul" role="img" aria-label="${esc(f ? `Hjulet står på ${f.navn}` : "Lykkehjul med tolv felt")}">
        <div class="hjul-roter" data-roter style="transform: rotate(${vinkel.toFixed(2)}deg)">${hjulSvg(S, o)}</div>
        ${GLANS}
        <span class="hjul-peker" id="hjul-peker">${PEKERSVG}</span>
      </div>`;
  }

  // ---------- Wheel animation ----------

  const ut = (p) => (t) => 1 - Math.pow(1 - t, p);

  function tikk() {
    R.lyd.tone(2100, 0, 0.02, "square", 0.04);
    R.lyd.stoy(0, 0.03, 0.08, 4600);
  }

  // The pointer flaps when a peg passes it, then springs back.
  function kikk(peker, retning) {
    if (!peker) return;
    peker.style.transition = "none";
    peker.style.rotate = `${-retning * 24}deg`;
    void peker.offsetWidth;
    peker.style.transition = "rotate 0.22s cubic-bezier(0.3, 1.8, 0.5, 1)";
    peker.style.rotate = "0deg";
  }

  function animer(o) {
    const hjul = document.getElementById("hjul");
    if (!hjul || o.ms <= 0) {
      o.vedSlutt();
      return null;
    }
    const roter = R.$$("[data-roter]", hjul);
    const peker = R.$("#hjul-peker", hjul);
    let forrige = feltVed(o.fra);
    let sisteTikk = 0;
    let ferdig = false;
    let id = 0;
    const start = performance.now();
    function ramme(na) {
      if (ferdig) return;
      if (!hjul.isConnected) {
        ferdig = true;
        return o.vedSlutt();
      }
      const t = Math.min(1, (na - start) / o.ms);
      const a = o.fra + (o.til - o.fra) * o.kurve(t);
      const rot = `rotate(${a.toFixed(2)}deg)`;
      for (const el of roter) el.style.transform = rot;
      const felt = feltVed(a);
      if (felt !== forrige) {
        forrige = felt;
        kikk(peker, o.retning);
        if (o.lyd !== false && na - sisteTikk > 34) {
          tikk();
          if (t > 0.6) R.vibrer(4);
          sisteTikk = na;
        }
      }
      if (t < 1) id = requestAnimationFrame(ramme);
      else {
        ferdig = true;
        o.vedSlutt();
      }
    }
    id = requestAnimationFrame(ramme);
    return {
      avbryt() {
        ferdig = true;
        cancelAnimationFrame(id);
      },
    };
  }

  function stoppAnimasjon() {
    if (animasjon) animasjon.avbryt();
    animasjon = null;
  }

  const kanSnurre = (S) => S.skjerm === "hjul" && pagar(S) && S.spill.fase === "hjul" && !S.spill.snurr && !animasjon && !laast;

  // Spin: retning 1 clockwise, -1 counter-clockwise; fart: flick speed in degrees per second
  // (null = button). The field is drawn fairly first and saved, so a reload mid-spin lands on it.
  function snurr(retning, fart, fra) {
    const S = R.S;
    if (!kanSnurre(S)) return;
    const sp = S.spill;
    const rng = R.rng(R.nyttFro());
    const mal = Math.floor(rng() * N);
    const forskyvning = (rng() * 2 - 1) * 0.36 * GRAD; // inside the field, never on a peg
    const start = fra == null ? sp.vinkel : fra;
    const malVinkel = norm(PEKER - (mal * GRAD + GRAD / 2 + forskyvning));
    const avstand = norm((malVinkel - start) * retning);
    // Reduced motion: less than one calm turn, straight to the field. Otherwise several whole rounds.
    const rolig = R.rolig();
    const runder = rolig ? 0 : fart ? R.klamp(Math.round(fart / 380), 2, 9) : 4 + Math.floor(rng() * 2);
    const total = runder * 360 + avstand;
    const P = rolig ? 2 : 3.2;
    let ms = fart ? ((P * total) / fart) * 1000 : 4400 + rng() * 900;
    ms = rolig ? R.klamp(250 + avstand * 2, 300, 900) : R.klamp(ms, 3000, 6800);
    const til = start + retning * total;
    sp.snurr = { mal, vinkel: norm(til) };
    R.lagre();

    const hjul = document.getElementById("hjul");
    if (hjul) {
      hjul.classList.remove("vent");
      hjul.classList.add("snurrer");
    }
    R.$$('#skjerm [data-h="snurr"]').forEach((b) => (b.disabled = true));
    const etikett = R.$("#hjul-info .etikett");
    if (etikett) etikett.textContent = "Hjulet snurrer …";
    R.lyd.sveip();
    R.vibrer(15);
    animasjon = animer({
      fra: start,
      til,
      ms,
      retning,
      kurve: ut(P),
      vedSlutt: () => {
        animasjon = null;
        landet(R.S);
      },
    });
  }

  // The result of a spin: counted, prepared and saved (no effects; also used after a reload).
  function brukResultat(S) {
    const sp = S.spill;
    const r = sp.snurr;
    sp.snurr = null;
    sp.vinkel = r.vinkel;
    sp.felt = r.mal;
    sp.nr += 1;
    sp.tell[sp.tur][r.mal] += 1;
    sp.utkast = "";
    sp.ide = null;
    const f = feltInfo(S, r.mal);
    if (!f.eget) {
      if (f.id === "kompis") sp.kompis = null; // the old pair ends here; the new one is picked on the card
      if (f.id === "vann") sp.sisteVann = sp.nr;
      if (IDEER[f.id]) nyIde(S);
    }
    sp.fase = "felt";
  }

  async function landet(S) {
    const sp = S.spill;
    if (!sp || !sp.snurr) return;
    const mal = sp.snurr.mal;
    brukResultat(S);
    R.lagre();
    if (S.skjerm !== "hjul") return;
    // Celebrate on the wheel, then show the card.
    const hjul = document.getElementById("hjul");
    if (hjul) {
      hjul.classList.remove("snurrer");
      hjul.classList.add("stoppet", "har-valgt");
      const k = R.$(`[data-kile="${mal}"]`, hjul);
      if (k) k.classList.add("vinner");
    }
    const f = feltInfo(S, mal);
    const etikett = R.$("#hjul-info .etikett");
    if (etikett) etikett.textContent = `${f.ikon} ${f.navn}!`;
    R.lyd.pop();
    R.lyd.pling();
    R.vibrer([30, 50, 90]);
    R.si(`Hjulet stoppet på ${f.navn}.`);
    laast = true;
    const fortsatt = R.vakt();
    await R.vent(R.rolig() ? 350 : 1150);
    // Never change screen under an open sheet (rules, «Gjelder nå»): wait until it is closed.
    while (fortsatt() && R.arkApent && R.arkApent()) await R.vent(200);
    laast = false;
    if (fortsatt() && S.spill === sp && sp.fase === "felt") R.gaTil("felt");
  }

  // ---------- Flicking the wheel ----------

  let dra = null;
  function draStart(e) {
    const hjul = e.target.closest && e.target.closest("#hjul");
    const S = R.S;
    if (!hjul || !S || !kanSnurre(S)) return;
    if (e.button != null && e.button > 0) return;
    const b = hjul.getBoundingClientRect();
    const cx = b.left + b.width / 2;
    const cy = b.top + b.height / 2;
    const vinkel = (x, y) => (Math.atan2(x - cx, cy - y) * 180) / Math.PI;
    const iMidten = (e.clientX - cx) ** 2 + (e.clientY - cy) ** 2 < 22 * 22;
    dra = {
      id: e.pointerId,
      hjul,
      cx,
      cy,
      vinkel,
      siste: iMidten ? null : vinkel(e.clientX, e.clientY),
      a: S.spill.vinkel,
      flyttet: 0,
      x0: e.clientX,
      y0: e.clientY,
      piksler: 0,
      spor: [{ t: performance.now(), a: S.spill.vinkel }],
      roter: R.$$("[data-roter]", hjul),
      peker: R.$("#hjul-peker", hjul),
      felt: feltVed(S.spill.vinkel),
    };
    try {
      hjul.setPointerCapture(e.pointerId);
    } catch (feil) {
      /* not all pointers can be captured */
    }
    hjul.classList.add("drar");
    e.preventDefault();
  }
  function draFlytt(e) {
    if (!dra || e.pointerId !== dra.id) return;
    dra.piksler = Math.max(dra.piksler, Math.hypot(e.clientX - dra.x0, e.clientY - dra.y0));
    const dx = e.clientX - dra.cx;
    const dy = e.clientY - dra.cy;
    if (dx * dx + dy * dy < 22 * 22) return; // too close to the centre to read an angle
    const v = dra.vinkel(e.clientX, e.clientY);
    if (dra.siste == null) {
      dra.siste = v;
      return;
    }
    const d = ((v - dra.siste + 540) % 360) - 180;
    dra.siste = v;
    dra.a += d;
    dra.flyttet += Math.abs(d);
    const rot = `rotate(${dra.a.toFixed(2)}deg)`;
    dra.roter.forEach((el) => (el.style.transform = rot));
    const felt = feltVed(dra.a);
    if (felt !== dra.felt) {
      dra.felt = felt;
      kikk(dra.peker, Math.sign(d) || 1);
      tikk();
    }
    const na = performance.now();
    dra.spor.push({ t: na, a: dra.a });
    while (dra.spor.length > 2 && na - dra.spor[0].t > 140) dra.spor.shift();
  }
  function draSlutt(e) {
    if (!dra || e.pointerId !== dra.id) return;
    const d = dra;
    dra = null;
    d.hjul.classList.remove("drar");
    const S = R.S;
    if (!S.spill || S.spill.fase !== "hjul") return;
    if (e.type === "pointercancel") {
      S.spill.vinkel = norm(d.a);
      R.lagre();
      return;
    }
    const na = performance.now();
    const forste = d.spor.find((p) => na - p.t <= 110) || d.spor[d.spor.length - 1];
    const fart = na - forste.t > 8 ? ((d.a - forste.a) / (na - forste.t)) * 1000 : 0;
    if (d.piksler < 12 && d.flyttet < 4) return snurr(1, null, d.a); // a tap spins it like the button
    if (Math.abs(fart) >= 200) return snurr(Math.sign(fart), Math.min(Math.abs(fart), 3600), d.a);
    S.spill.vinkel = norm(d.a);
    R.lagre();
    R.toast("Gi det mer fart – eller trykk på knappen!");
  }
  document.addEventListener("pointerdown", draStart);
  document.addEventListener("pointermove", draFlytt);
  document.addEventListener("pointerup", draSlutt);
  document.addEventListener("pointercancel", draSlutt);

  // ---------- Ideas (truths, challenges, categories, rules) ----------

  function ideListe(S) {
    const sp = S.spill;
    if (!sp || sp.felt == null) return null;
    const f = feltInfo(S, sp.felt);
    return !f.eget && IDEER[f.id] ? D[IDEER[f.id]] : null;
  }

  function nyIde(S) {
    const sp = S.spill;
    const liste = ideListe(S);
    if (!liste) {
      sp.ide = null;
      return;
    }
    // Remember what was shown, so the same truth or challenge doesn't come back soon.
    const f = FELT[sp.felt];
    const stokk = R.kortstokk(f.id, liste.length);
    let i = stokk.neste((n) => n !== sp.ide);
    if (i < 0) i = 0;
    sp.ide = i;
  }

  function ideTekst(S) {
    const liste = ideListe(S);
    const sp = S.spill;
    return liste && sp.ide != null && liste[sp.ide] ? liste[sp.ide] : "";
  }

  // ---------- The result card ----------

  function ekstraHtml(S) {
    const sp = S.spill;
    const f = feltInfo(S, sp.felt);
    if (f.eget) return "";
    const ide = ideTekst(S);
    if (f.id === "sannhet" || f.id === "utfordring") {
      return `<div class="hjul-oppgave">
        <p class="hjul-oppgave-tekst">${esc(ide)}</p>
        <button class="hjul-ny" data-h="ide" aria-label="${f.id === "sannhet" ? "Nytt spørsmål" : "Ny utfordring"}"><span aria-hidden="true">🎲</span></button>
      </div>`;
    }
    if (f.id === "kategori") {
      return `<div class="hjul-oppgave">
        <p class="hjul-oppgave-tekst"><span class="hjul-forslag">Kategori:</span> ${esc(ide)}</p>
        <button class="hjul-ny" data-h="ide" aria-label="Ny kategori"><span aria-hidden="true">🎲</span></button>
      </div>`;
    }
    if (f.id === "regel") {
      return `<form class="hjul-skriv" data-skjema="utkast" autocomplete="off">
          <label class="etikett" for="hjul-utkast">Regelen <span class="hjul-valgfri">(valgfritt)</span></label>
          <input class="hjul-felt" id="hjul-utkast" data-felt="utkast" maxlength="80" value="${esc(sp.utkast || "")}" placeholder="Skriv regelen – mobilen husker den" enterkeyhint="done" autocapitalize="sentences">
        </form>
        <div class="hjul-ide">
          <span class="hjul-ide-tekst"><b>Idé:</b> ${esc(ide)}</span>
          <span class="hjul-ide-knapper">
            <button class="hjul-ide-knapp" data-h="ide-bruk">Bruk</button>
            <button class="hjul-ide-knapp terning" data-h="ide" aria-label="Ny idé"><span aria-hidden="true">🎲</span></button>
          </span>
        </div>`;
    }
    if (f.id === "kompis") {
      const k = sp.kompis;
      return k && k[0] === sp.tur
        ? `<div class="hjul-valgt"><span aria-hidden="true">🤝</span><span>Kompis: <b>${esc(R.navn(k[1]))}</b></span>${R.ui.lenke("Bytt", "kompis")}</div>`
        : R.ui.knapp2("Velg kompis", "kompis", { ikon: "🤝", variant: "liten hjul-kompisknapp" });
    }
    return "";
  }

  // Chips under the wheel: the current mates and the rules made so far.
  // Chips (tall screens) or one compact line (short screens and landscape), roles written out.
  function statusHtml(sp) {
    const deler = [];
    if (sp.kompis) deler.push({ ikon: "🤝", tekst: `Kompis: ${R.navn(sp.kompis[0])} + ${R.navn(sp.kompis[1])}` });
    if (sp.regler.length) deler.push({ ikon: "📜", tekst: R.flertall(sp.regler.length, "regel", "regler") });
    if (!deler.length) return `<p class="hjul-hint">Trykk på knappen – eller gi hjulet et spinn med fingeren.</p>`;
    const brikker = deler.map((d) => `<span class="hjul-brikke"><span aria-hidden="true">${d.ikon}</span><span class="hjul-brikke-navn">${esc(d.tekst)}</span></span>`);
    const linje = `Gjelder nå: ${deler.map((d) => `${d.ikon} ${d.tekst}`).join(" · ")}`;
    return `<button class="hjul-status" data-h="status" aria-label="Se kompiser og regler"><span class="etikett">Gjelder nå</span><span class="hjul-brikker">${brikker.join("")}</span>
      <span class="hjul-status-linje"><span class="hjul-status-tekst">${esc(linje)}</span><span aria-hidden="true">›</span></span></button>`;
  }

  // ---------- Awards ----------

  function priser(S) {
    const sp = S.spill;
    const PRISER = [
      // Never a prize for sips – only luck, rules, truths and challenges.
      { id: "fritak", ikon: "🛡️", tittel: "Heldiggrisen", tekst: (n) => `Fikk fritak ${n === 1 ? "én gang" : `${n} ganger`}.`, farge: "var(--mynte)" },
      { id: "regel", ikon: "📜", tittel: "Lovgiveren", tekst: (n) => `Laget ${R.flertall(n, "regel", "regler")}.`, farge: "var(--lilla)" },
      { id: "sannhet", ikon: "😇", tittel: "Flest sannheter", tekst: (n) => `Fikk ${n === 1 ? "ett sannhetsspørsmål" : `${n} sannhetsspørsmål`}.`, farge: "var(--lilla)" },
      { id: "utfordring", ikon: "🔥", tittel: "Flest utfordringer", tekst: (n) => `Fikk ${R.flertall(n, "utfordring", "utfordringer")}.`, farge: "var(--oransje)" },
    ];
    const ut = [];
    for (const p of PRISER) {
      const k = indeks(p.id);
      if (feltInfo(S, k).eget) continue;
      const max = Math.max(0, ...sp.tell.map((t) => t[k]));
      if (!max) continue;
      const hvem = sp.tell.map((t, i) => (t[k] === max ? i : -1)).filter((i) => i >= 0);
      ut.push({ ...p, n: max, hvem });
    }
    return ut.sort((a, b) => b.n - a.n).slice(0, 4);
  }

  // Luck decides «hjulets favoritt»: free passes count double, extra spins once (never sips).
  function favoritter(S) {
    const sp = S.spill;
    const vekt = { fritak: 2, igjen: 1 };
    const flaks = sp.tell.map((t) => Object.entries(vekt).reduce((s, [id, v]) => s + (feltInfo(S, indeks(id)).eget ? 0 : t[indeks(id)] * v), 0));
    const max = Math.max(0, ...flaks);
    return max ? flaks.map((f, i) => (f === max ? i : -1)).filter((i) => i >= 0) : [];
  }

  // ---------- Game state ----------

  function nyttSpill(S) {
    const antall = R.klamp(S.antall || 4, 3, 20);
    S.spill = {
      antall,
      tur: R.heltall(0, antall - 1),
      vinkel: Math.floor(Math.random() * 360),
      fase: "hjul",
      snurr: null,
      felt: null,
      igjen: false,
      nr: 0,
      sisteVann: 0,
      vann: 0,
      kompis: null,
      regler: [],
      tell: Array.from({ length: antall }, () => Array(N).fill(0)),
      ide: null,
      utkast: "",
      ferdig: false,
    };
    R.statistikk("start", { spillere: antall, egne: antallEgne(S) });
  }

  // Back to the game where it was. A spin that was interrupted (back button, house rules) has
  // already drawn its field, so it lands on that card.
  function fasen(S) {
    const sp = S.spill;
    if (sp.snurr) {
      stoppAnimasjon();
      brukResultat(S);
    }
    return sp.fase === "felt" ? "felt" : sp.fase === "vann" ? "vann" : "hjul";
  }
  const tilFase = (S) => R.gaTil(fasen(S));

  R.start({
    id: "hjulet",
    versjon: 1,
    pagar,

    tilstand: () => ({ antall: standardAntall(), oppsett: { felt: {} }, spill: null }),

    lastet(S) {
      S.antall = R.klamp(Number(S.antall) || standardAntall(), 3, 20);
      S.oppsett = Object.assign({ felt: {} }, S.oppsett || {});
      const felt = {};
      for (const f of FELT) {
        const e = S.oppsett.felt && S.oppsett.felt[f.id];
        if (e && typeof e === "object") felt[f.id] = { navn: String(e.navn || "").slice(0, MAKS_NAVN), tekst: String(e.tekst || "").slice(0, MAKS_TEKST) };
      }
      S.oppsett.felt = felt;
      const sp = S.spill;
      if (sp) {
        const spiller = (i) => Number.isInteger(i) && i >= 0 && i < sp.antall;
        const ok =
          Number.isInteger(sp.antall) && sp.antall >= 3 && sp.antall <= 20 &&
          spiller(sp.tur) && typeof sp.vinkel === "number" && Number.isFinite(sp.vinkel) &&
          ["hjul", "felt", "vann"].includes(sp.fase) &&
          Array.isArray(sp.tell) && sp.tell.length === sp.antall && sp.tell.every((t) => Array.isArray(t) && t.length === N) &&
          Array.isArray(sp.regler) && sp.regler.every((r) => r && spiller(r.i) && typeof r.t === "string") &&
          (sp.kompis == null || (Array.isArray(sp.kompis) && sp.kompis.length === 2 && sp.kompis.every(spiller)));
        if (!ok) S.spill = null;
        else {
          // Reloaded (or left) in the middle of a spin: the field was already drawn.
          if (sp.snurr && Number.isInteger(sp.snurr.mal) && sp.snurr.mal >= 0 && sp.snurr.mal < N) brukResultat(S);
          sp.snurr = null;
          if (sp.fase === "felt" && !(Number.isInteger(sp.felt) && sp.felt >= 0 && sp.felt < N)) sp.fase = "hjul";
          sp.utkast = String(sp.utkast || "").slice(0, 80);
          if (sp.ide != null && !(ideListe(S) && ideListe(S)[sp.ide])) sp.ide = null;
        }
      }
      if (["hjul", "felt", "vann"].includes(S.skjerm)) S.skjerm = pagar(S) ? (S.spill.fase === "felt" ? "felt" : S.spill.fase) : "hjem";
      if (S.skjerm === "slutt" && !(S.spill && S.spill.ferdig)) S.skjerm = "hjem";
    },

    regler: {
      intro: "Hjulet bestemmer! Dere snurrer etter tur, og feltet det stopper på, sier hva som skjer. Bare små slurker – og alkoholfritt teller like mye.",
      steg: [
        ["Snurr hjulet", "Trykk på knappen, trykk på hjulet eller gi det et spinn med fingeren."],
        ["Gjør som feltet sier", "Les feltet høyt. En slurk er en liten slurk av det du drikker – vann og brus teller like mye."],
        ["Gi mobilen videre", "Neste spiller snurrer. Når dere avslutter, kårer hjulet sin favoritt."],
      ],
      tips: [
        "Alle kan stå over – også slurken. Ingen trenger å forklare seg.",
        "Etter hvert tiende snurr er det vannpause, og hjulet har et eget vannfelt.",
        "Lag husregler: Gi feltene egne navn og oppgaver. Mobilen husker dem til neste gang.",
        "Utfordringene er trygge og passer i en stue. Passer den ikke, trykk 🎲 for en ny.",
        "Spis og drikk vann underveis, og sørg for trygg vei hjem.",
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis: (S) =>
          R.ui.spillhjem({
            slagordHtml: "Snurr det store hjulet.<br><em>Det bestemmer hva som skjer.</em>",
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: pagar(S) ? `Fortsett · snurr ${S.spill.nr + (S.spill.fase === "felt" ? 0 : 1)}` : "",
              ekstraHtml: R.ui.lenke("Slik spiller du", "regler"),
            }),
            merker: [
              ["3–20", "spillere"],
              ["12", "felt"],
              ["0", "reklame"],
            ],
          }),
        inn: () => R.slippVaken(),
      },

      oppsett: {
        tittel: "Nytt spill",
        tilbake: "hjem",
        vis(S) {
          const egne = antallEgne(S);
          return `
          <h1 id="skjerm-tittel">Gjør klart</h1>
          ${R.ui.spillere({ min: 3, max: 20, hjelp: "Sett dere i samme rekkefølge som lista. Mobilen går til venstre." })}
          <section class="seksjon">
            <div class="seksjon-hode"><h2>Hjulet</h2><span class="tall">${egne ? `${egne} av 12 felt er endret` : "12 felt"}</span></div>
            <div class="hjul-oppsett">
              <div class="hjul-mini">${hjulHtml(S, { vinkel: -GRAD / 2 })}</div>
              <div class="hjul-oppsett-tekst">
                <p>Gi feltene egne navn og regler – mobilen husker dem.</p>
                ${R.ui.knapp2("Husregler", "husregler", { ikon: "✏️", variant: "liten" })}
              </div>
            </div>
          </section>
          <div class="papirboks hjul-vett">
            <p class="etikett">Slik er slurkene</p>
            <ul class="tips">
              <li>En slurk er en liten slurk – aldri mer.</li>
              <li>Alkoholfritt teller like mye, og alle kan stå over.</li>
              <li>Etter hvert tiende snurr tar alle en vannpause.</li>
            </ul>
          </div>
          ${R.ui.dokk(R.ui.knapp("Start", "start"))}`;
        },
      },

      husregler: {
        tittel: "Husregler",
        tilbake: (S) => (pagar(S) ? fasen(S) : "oppsett"),
        vis(S) {
          const rader = FELT.map((f, i) => {
            const e = S.oppsett.felt[f.id] || {};
            return `<li class="hus-rad" style="--kf: var(--${f.farge})">
              <span class="hus-ikon" aria-hidden="true">${f.ikon}</span>
              <div class="hus-felt">
                <label class="vh" for="hus-navn-${i}">Navn på feltet «${esc(f.navn)}», maks ${MAKS_NAVN} tegn</label>
                <span class="hus-navnrad">
                  <input class="hus-navn" id="hus-navn-${i}" data-felt="husnavn" data-id="${f.id}" data-i="${i}" maxlength="${MAKS_NAVN}" value="${esc(e.navn || "")}" placeholder="${esc(f.navn)}" autocomplete="off" autocapitalize="sentences" enterkeyhint="next">
                  <span class="hus-teller" id="hus-teller-${i}" aria-hidden="true">${Array.from(e.navn || "").length}/${MAKS_NAVN}</span>
                </span>
                <label class="vh" for="hus-tekst-${i}">Hva skal skje på «${esc(f.navn)}»?</label>
                <textarea class="hus-tekst" id="hus-tekst-${i}" data-felt="hustekst" data-id="${f.id}" maxlength="${MAKS_TEKST}" rows="${f.tekst.length > 64 ? 3 : 2}" placeholder="${esc(f.tekst)}">${esc(e.tekst || "")}</textarea>
              </div>
            </li>`;
          }).join("");
          return `
            <h1 id="skjerm-tittel">Husregler</h1>
            <p class="ingress">Skriv over navnet eller teksten på feltene dere vil endre. Får et felt ny tekst, viser hjulet bare den – uten forslag. Sannhet og Utfordring beholder spørsmålene når dere bare bytter navn.</p>
            <ol class="hus-liste">${rader}</ol>
            ${R.ui.dokk(R.ui.knapp("Ferdig", "hus-ferdig"), R.ui.lenkerad(R.ui.lenke("Tilbakestill alle", "hus-nullstill")))}`;
        },
      },

      hjul: {
        tittel: (S) => `Snurr ${S.spill.nr + 1}`,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          return `
            <div class="hjul-tur" id="hjul-info">
              ${R.avatar(sp.tur, "mid")}
              <div class="hjul-tur-tekst"><p class="etikett">${sp.igjen ? "Snurr igjen!" : "Din tur"}</p><h1 id="skjerm-tittel">${esc(R.navn(sp.tur))}</h1></div>
            </div>
            <div class="hjul-scene">${hjulHtml(S, { vent: true })}</div>
            ${statusHtml(sp)}
            ${R.ui.dokk(
              R.ui.knapp(sp.igjen ? "Snurr igjen!" : "Snurr hjulet!", "snurr", { variant: "stor", ikon: SNURR_IKON, id: "hjul-snurrknapp" }),
              R.ui.lenkerad(R.ui.lenke("Husregler", "husregler"), R.ui.lenke("Avslutt", "avslutt")),
            )}`;
        },
        inn() {
          R.holdVaken();
          R.vedForlat(stoppAnimasjon);
          laast = false;
        },
      },

      felt: {
        tittel: (S) => `Snurr ${S.spill.nr}`,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const f = feltInfo(S, sp.felt);
          const igjen = f.id === "igjen" && !f.eget;
          const neste = nesteSpiller(sp);
          return `
            <div class="hjul-hvem">
              ${R.avatar(sp.tur)}
              <p><b>${esc(R.navn(sp.tur))}</b> fikk</p>
            </div>
            <article class="hjul-kort f-${f.id}${f.eget ? " eget" : ""}" id="hjul-kort" style="--kf: var(--${f.farge}); --kf-dyp: var(--${f.farge}-dyp)">
              <span class="hjul-kort-ikon" aria-hidden="true">${f.ikon}</span>
              <h1 id="skjerm-tittel">${esc(f.tittel)}</h1>
              ${f.tekst ? `<p class="hjul-kort-tekst">${esc(f.tekst)}</p>` : ""}
              ${ekstraHtml(S)}
            </article>
            <p class="hjul-fot"><span aria-hidden="true">🥤</span> Alkoholfritt teller like mye · alle kan stå over</p>
            ${R.ui.dokk(
              igjen ? "" : `<p class="hjul-neste-linje">${R.avatar(neste)}<span><b>${esc(R.navn(neste))}</b> snurrer neste</span></p>`,
              igjen ? R.ui.knapp("Snurr igjen!", "igjen-snurr", { variant: "stor", ikon: SNURR_IKON }) : R.ui.knapp("Neste snurr", "neste"),
              R.ui.lenkerad(R.ui.lenke("Avslutt", "avslutt")),
            )}`;
        },
        inn(S) {
          R.holdVaken();
          const f = feltInfo(S, S.spill.felt);
          R.si(`${f.tittel}. ${f.tekst} ${ideTekst(S)}`);
        },
      },

      vann: {
        tittel: "Vannpause",
        tilbake: "hjem",
        vis: (S) => `
          <div class="hjul-vann">
            <svg class="hjul-vannglass" viewBox="0 0 120 150" aria-hidden="true" focusable="false">
              <defs><clipPath id="hjul-glass-innside"><path d="M24 22 L34 132 Q35 140 44 140 H76 Q85 140 86 132 L96 22 Z"/></clipPath></defs>
              <g clip-path="url(#hjul-glass-innside)">
                <path class="hjul-vannflate" d="M0 70 Q15 62 30 70 T60 70 T90 70 T120 70 T150 70 V160 H0 Z" fill="var(--himmel)"/>
                <circle class="hjul-boble" cx="50" cy="120" r="4" fill="#fff" opacity=".7"/>
                <circle class="hjul-boble to" cx="70" cy="128" r="3" fill="#fff" opacity=".6"/>
              </g>
              <path d="M20 18 L31 133 Q32 144 44 144 H76 Q88 144 89 133 L100 18 Z" fill="none" stroke="var(--papir)" stroke-width="6" stroke-linejoin="round"/>
              <path d="M36 34 L42 112" stroke="#fff" stroke-opacity=".5" stroke-width="5" stroke-linecap="round"/>
            </svg>
            <p class="etikett">Etter ${S.spill.nr} snurr</p>
            <h1 id="skjerm-tittel">Vannpause!</h1>
            <p class="ingress">Alle tar en god slurk vann før hjulet snurrer igjen. Kroppen takker – og kvelden varer lenger.</p>
          </div>
          ${R.ui.dokk(R.ui.knapp("Skål i vann!", "vann-ferdig", { variant: "himmel", ikon: "💧" }), R.ui.lenkerad(R.ui.lenke("Avslutt", "avslutt")))}`,
        inn() {
          R.lyd.pop();
          R.vibrer(20);
        },
      },

      slutt: {
        tittel: "Kåringen",
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const fav = favoritter(S);
          const pris = priser(S);
          // What the wheel offered – the fields about sips are left out, so nothing counts drinking.
          const SLURKFELT = { alle: 1, venstre: 1, gi3: 1, ta1: 1, kompis: 1 };
          const totalt = FELT.map((f, i) => ({ f: feltInfo(S, i), n: sp.tell.reduce((s, t) => s + t[i], 0) }))
            .filter((x) => x.n > 0 && (x.f.eget || !SLURKFELT[x.f.id]))
            .sort((a, b) => b.n - a.n || a.f.i - b.f.i);
          const maks = totalt.length ? totalt[0].n : 1;
          const navn = R.ramsOpp(fav.map((i) => R.navn(i)));
          return `
            <div class="banner aksent hjul-banner">
              ${fav.length === 1 ? `<div class="hjul-fav">${R.avatar(fav[0], "gigant")}<span class="hjul-fav-stjerne" aria-hidden="true">🍀</span></div>` : R.figur()}
              <p class="etikett">Hjulet har talt</p>
              <h1 id="skjerm-tittel">${
                !fav.length ? "Skål for gjengen!" : fav.length > 3 ? `${fav.length} spillere er hjulets favoritter!` : `${esc(navn)} ${fav.length === 1 ? "er hjulets favoritt" : "er hjulets favoritter"}!`
              }</h1>
              <p class="ingress">${esc(R.flertall(sp.nr, "snurr", "snurr"))} og ${esc(R.flertall(sp.vann + sp.tell.reduce((s, t) => s + (feltInfo(S, indeks("vann")).eget ? 0 : t[indeks("vann")]), 0), "vannpause", "vannpauser"))}. ${fav.length ? "Mest flaks på hjulet – skål for gjengen!" : "Takk for laget!"}</p>
            </div>
            ${
              pris.length
                ? `<ul class="hjul-priser">${pris
                    .map(
                      (p) => `<li class="hjul-pris" style="--vf: ${p.farge}">
                        <span class="hjul-pris-ikon" aria-hidden="true">${p.ikon}</span>
                        <span class="hjul-pris-tekst"><span class="etikett">${esc(p.tittel)}</span><b>${esc(p.hvem.length > 3 ? `${p.hvem.length} spillere` : R.ramsOpp(p.hvem.map((i) => R.navn(i))))}</b><span>${esc(p.tekst(p.n))}</span></span>
                      </li>`,
                    )
                    .join("")}</ul>`
                : ""
            }
            ${
              totalt.length
                ? `<section class="seksjon"><h2>Hjulet bød på</h2><ul class="hjul-stat">${totalt
                    .map(
                      (x) => `<li style="--kf: var(--${x.f.farge}); --andel: ${((x.n / maks) * 100).toFixed(1)}%">
                        <span class="hjul-stat-navn"><span aria-hidden="true">${x.f.ikon}</span> ${esc(x.f.navn)}</span>
                        <span class="hjul-stat-strek" aria-hidden="true"><i></i></span>
                        <b>${x.n}</b>
                      </li>`,
                    )
                    .join("")}</ul></section>`
                : ""
            }
            ${
              sp.regler.some((r) => r.t)
                ? `<div class="papirboks hjul-liste"><p class="etikett">Reglene dere laget</p><ul>${sp.regler
                    .filter((r) => r.t)
                    .map((r) => `<li>${esc(r.t)} <span class="hjul-av">– ${esc(R.navn(r.i))}</span></li>`)
                    .join("")}</ul></div>`
                : ""
            }
            <p class="hjelp">💧 Husk vann, mat og trygg vei hjem.</p>
            ${R.ui.flereSpill({ antall: sp.antall })}
            ${R.ui.dokk(R.ui.knapp("Spill igjen", "igjen"), R.ui.lenkerad(R.ui.lenke("Endre oppsett", "nytt"), `<a class="lenke" href="/">Alle spill</a>`))}`;
        },
        inn(S) {
          if (favoritter(S).length) {
            R.lyd.fanfare();
            R.konfetti(["--aksent", "--lampe", "--rosa", "--mynte", "--lilla"]);
          } else R.lyd.pling();
          R.slippVaken();
        },
      },
    },

    felt: {
      utkast(S, el) {
        if (!S.spill || S.spill.fase !== "felt") return;
        S.spill.utkast = el.value.slice(0, 80);
        R.lagre();
      },
      husnavn(S, el) {
        const id = el.dataset.id;
        if (!FELT.some((f) => f.id === id)) return;
        const e = (S.oppsett.felt[id] = S.oppsett.felt[id] || { navn: "", tekst: "" });
        e.navn = el.value.slice(0, MAKS_NAVN);
        const teller = document.getElementById(`hus-teller-${el.dataset.i}`);
        if (teller) {
          const n = Array.from(e.navn).length;
          teller.textContent = `${n}/${MAKS_NAVN}`;
          teller.classList.toggle("full", n >= MAKS_NAVN);
        }
        R.lagre();
      },
      hustekst(S, el) {
        const id = el.dataset.id;
        if (!FELT.some((f) => f.id === id)) return;
        const e = (S.oppsett.felt[id] = S.oppsett.felt[id] || { navn: "", tekst: "" });
        e.tekst = el.value.slice(0, MAKS_TEKST);
        R.lagre();
      },
    },

    skjema: {
      utkast(S, form) {
        const f = form.querySelector("input");
        if (f) f.blur();
      },
    },

    handlinger: (H = {
      async nytt(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(pagar(S))) || !fortsatt()) return;
        S.spill = null;
        R.gaTil("oppsett");
      },
      fortsett(el, e, S) {
        if (pagar(S)) tilFase(S);
      },
      start(el, e, S) {
        nyttSpill(S);
        R.gaTil("hjul");
      },
      husregler: () => R.gaTil("husregler"),
      "hus-ferdig": (el, e, S) => (pagar(S) ? tilFase(S) : R.gaTil("oppsett")),
      async "hus-nullstill"(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreft("Tilbakestille hjulet?", "Alle feltene får tilbake sine vanlige navn og regler.", "Tilbakestill", "Avbryt")) || !fortsatt()) return;
        S.oppsett.felt = {};
        R.vis();
        R.toast("Hjulet er som nytt");
      },
      snurr: (el, e, S) => {
        if (kanSnurre(S)) snurr(1, null, S.spill.vinkel);
      },
      ide(el, e, S) {
        if (!pagar(S) || S.spill.fase !== "felt") return;
        nyIde(S);
        R.lyd.snu();
        R.vis();
      },
      "ide-bruk"(el, e, S) {
        if (!pagar(S) || S.spill.fase !== "felt") return;
        const t = ideTekst(S);
        if (!t) return;
        S.spill.utkast = t.slice(0, 80);
        R.lyd.pop();
        R.vis();
      },
      async kompis(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "felt") return;
        const fortsatt = R.vakt();
        const andre = Array.from({ length: sp.antall }, (_, i) => i).filter((i) => i !== sp.tur);
        const valgt = await R.velgIArk("Velg en kompis", andre.map((i) => ({ v: i, tekst: R.navn(i) })), "Dere drikker sammen til hjulet lander på Kompis igjen.");
        if (valgt == null || !fortsatt() || S.spill !== sp || sp.fase !== "felt") return;
        sp.kompis = [sp.tur, valgt];
        R.lyd.pop();
        R.vibrer(15);
        R.vis();
        R.si(`${R.navn(valgt)} er kompisen din.`);
      },
      status(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        const rader = [];
        if (sp.kompis) rader.push(`<li><span class="hjul-rolle-ikon" aria-hidden="true">🤝</span><span><b>${esc(`Kompiser: ${R.ramsOpp(sp.kompis.map((i) => R.navn(i)))}`)}</b><small>Til hjulet lander på Kompis igjen</small></span></li>`);
        sp.regler.forEach((r, n) =>
          rader.push(`<li><span class="hjul-rolle-ikon" aria-hidden="true">📜</span><span><b>${r.t ? esc(r.t) : `Regel ${n + 1} (sagt høyt)`}</b><small>Laget av ${esc(R.navn(r.i))}</small></span></li>`),
        );
        R.ark(`
          <h2 id="ark-tittel">Gjelder nå</h2>
          ${rader.length ? `<ul class="hjul-rolleliste">${rader.join("")}</ul>` : `<p class="ingress">Ingen kompiser eller regler ennå.</p>`}
          <button class="knapp" data-h="lukk-ark">Spill videre</button>`);
      },
      neste(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "felt") return;
        const f = feltInfo(S, sp.felt);
        if (f.id === "regel" && !f.eget) sp.regler.push({ i: sp.tur, t: String(sp.utkast || "").trim().slice(0, 80) });
        sp.utkast = "";
        sp.ide = null;
        sp.igjen = false;
        sp.tur = nesteSpiller(sp);
        if (sp.nr - sp.sisteVann >= VANN_HVERT) {
          sp.sisteVann = sp.nr;
          sp.vann += 1;
          sp.fase = "vann";
          R.gaTil("vann");
        } else {
          sp.fase = "hjul";
          R.gaTil("hjul");
        }
      },
      "igjen-snurr"(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "felt") return;
        sp.igjen = true;
        sp.ide = null;
        sp.fase = "hjul";
        R.gaTil("hjul");
      },
      "vann-ferdig"(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "vann") return;
        sp.fase = "hjul";
        R.gaTil("hjul");
      },
      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        const fortsatt = R.vakt();
        if (sp.nr === 0) {
          if ((await R.bekreft("Avslutte spillet?", "Dere kan alltid starte et nytt.", "Avslutt", "Spill videre")) && fortsatt()) {
            S.spill = null;
            R.gaTil("hjem");
          }
          return;
        }
        const ja = await R.bekreft("Avslutte spillet?", "Dere går rett til kåringen.", "Avslutt", "Spill videre");
        if (!ja || !fortsatt() || S.spill !== sp) return;
        stoppAnimasjon();
        if (sp.snurr) brukResultat(S);
        sp.ferdig = true;
        R.statistikk("ferdig", { snurr: sp.nr, egne: antallEgne(S) });
        R.gaTil("slutt");
      },
      igjen(el, e, S) {
        S.spill = null;
        H.start(el, e, S);
      },
    }),
  });
})();
