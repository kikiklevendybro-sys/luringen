/* Julekalenderen — 24 shared Christmas moments, one door a day from 1 to 24 December (the edition's
   date, R.dag()). Behind every door, 5–15 minutes together: something cosy to do (kos), a talk card
   with a gentle follow-up (prat), a guess-together bonus, a rusj game with a Christmas angle that its
   own mascot presents («Dagens figur»), on some days a kind task for someone outside the room – and,
   when the group is done, a new ornament on their shared Christmas tree. «Dagens nisse» (the host
   who reads aloud and leads) takes turns through the names. Who is playing (family, friends, class
   or work) is chosen once and picks the content. Before December: a countdown, a printable paper
   calendar with a QR code per door and an .ics file with a reminder each evening at 18:00. After
   the 24th: «takk for i år» and the finished tree to download, share or print.

   The rules (dates, door links, hosts, ornaments, the tree drawing, the .ics file) are pure functions
   on window.RusjJulekalender, so test/julekalenderen.test.mjs can load this file in node:vm without
   the kit. */
(function () {
  "use strict";

  // ---------- Rules (no kit, no DOM) ----------

  const GRUPPER = ["familie", "venner", "klasse"];
  // The door in an address, per edition: rusj.no/julekalenderen/#luke-7, /en/advent-calendar/#door-7.
  const HASH = { nb: "luke", en: "door", da: "laage" };
  // VTIMEZONE (RFC 5545) per edition time zone: standard and summer offset, names, the local time of
  // each change. December is standard time, so 18:00 is 17:00 UTC in Oslo and Copenhagen, 18:00 in London.
  const SONER = {
    "Europe/Oslo": ["+0100", "+0200", "CET", "CEST", "020000", "030000"],
    "Europe/Copenhagen": ["+0100", "+0200", "CET", "CEST", "020000", "030000"],
    "Europe/London": ["+0000", "+0100", "GMT", "BST", "010000", "020000"],
  };

  // Where we are in the season (unchanged from the first calendar): «for» (February–November and
  // until 1 December), «aktiv» (1–24 December), «etter» (25 December – 31 January, every door open).
  // The season is the year of its December. dag = R.dag() → { tekst: "2026-12-07", nr }.
  function faseFor(dag) {
    const [a, m, d] = String(dag.tekst).split("-").map(Number);
    if (m === 12 && d <= 24) return { fase: "aktiv", dag: d, sesong: a, nr: dag.nr };
    if (m === 12) return { fase: "etter", dag: 24, sesong: a, nr: dag.nr };
    if (m === 1) return { fase: "etter", dag: 24, sesong: a - 1, nr: dag.nr };
    return { fase: "for", dag: 0, sesong: a, nr: dag.nr, igjen: Math.floor(Date.UTC(a, 11, 1) / 86400000) - dag.nr };
  }
  const kanApnes = (d, f) => f.fase !== "for" && d >= 1 && d <= f.dag;

  // «luke-7», «door-7», «laage-7» or just «7» → 7.
  function lesLuke(hash) {
    const m = /^(?:luke|door|laage|lage|låge)?-?(\d{1,2})$/.exec(String(hash == null ? "" : hash).trim().toLowerCase());
    const d = m ? Number(m[1]) : 0;
    return d >= 1 && d <= 24 ? d : null;
  }
  const lukeAdresse = (base, sprak, d) => `${base}#${HASH[sprak] || HASH.nb}-${d}`;

  // Today's host: the named players take turns, one a day, from a starting point picked at setup;
  // «Bytt» moves today's turn on by one. → index into the list of names, or -1 without names.
  function nisse(dag, antall, start, bytt) {
    const n = Math.floor(Number(antall) || 0);
    if (n <= 0 || !(dag >= 1)) return -1;
    const k = (Math.floor(Number(start) || 0) + Math.floor(dag) - 1 + Math.floor(Number(bytt) || 0)) % n;
    return (k + n) % n;
  }

  // A door's content for a group: the base, with the group's own parts on top. The small children's
  // line is for families only.
  function lukeFor(L, gruppe) {
    const o = (gruppe && L && L[gruppe]) || {};
    const kos = o.kos || L.kos;
    return {
      tittel: o.tittel || L.tittel,
      kos,
      smaa: gruppe === "venner" || gruppe === "klasse" ? "" : kos.smaa || "",
      snill: "snill" in o ? o.snill : L.snill || null,
      prat: o.prat || L.prat,
      spill: o.spill || L.spill,
      bonus: L.bonus || null,
      storquiz: !!L.storquiz,
    };
  }
  // The steps of a door, in order. On the 24th the big quiz comes right after the cosy part.
  function steg(l) {
    const s = ["kos"];
    if (l.storquiz) s.push("gjett");
    if (l.snill) s.push("snilt");
    s.push("prat");
    if (l.bonus && !l.storquiz) s.push("gjett");
    if (l.spill) s.push("spill");
    s.push("pynt");
    return s;
  }
  // The doors that are done (their ornament hangs on the tree), in order.
  const pynt = (luker) =>
    Object.keys(luker || {})
      .map(Number)
      .filter((d) => Number.isInteger(d) && d >= 1 && d <= 24 && luker[d] && luker[d].ferdig)
      .sort((a, b) => a - b);
  // A group's linked games, door by door.
  const spillListe = (luker, gruppe) => luker.map((L) => (lukeFor(L, gruppe).spill || {}).id);
  // The big Christmas Eve quiz: the bonus of every door before the 24th.
  const storquiz = (luker) =>
    luker
      .slice(0, 23)
      .map((L, i) => (L.bonus ? Object.assign({ d: i + 1 }, L.bonus) : null))
      .filter(Boolean);

  // ---------- The tree (SVG) ----------

  // Where the 23 ornaments hang (viewBox 0 0 240 290); the star of door 24 sits on the top.
  const PLASS = [
    [120, 60], [104, 86], [136, 86], [92, 106], [120, 109], [148, 106], [92, 132], [120, 135], [148, 132],
    [76, 160], [106, 158], [136, 160], [166, 158], [66, 196], [93, 193], [120, 198], [147, 193], [174, 196],
    [46, 230], [83, 227], [120, 232], [157, 227], [194, 230],
  ];
  // Which place each door's ornament takes: spread out, so the tree fills evenly through December.
  const ORDEN = [16, 4, 11, 20, 7, 13, 1, 18, 9, 22, 5, 14, 0, 17, 10, 2, 21, 8, 15, 6, 12, 19, 3];
  const FORMER = ["kule", "stjerne", "hjerte", "kule", "bjelle", "stokk", "kule", "snofnugg"];
  const FARGER = ["#ff4f8b", "#ffd23f", "#59b9ff", "#ff6b5e", "#b48cff", "#3de3b0"];
  const BLEKK = "#170e2b";
  const n1 = (x) => Math.round(x * 10) / 10;
  function stjernesti(x, y, r1, r2, tagger = 5) {
    const p = [];
    for (let i = 0; i < tagger * 2; i++) {
      const r = i % 2 ? r2 : r1;
      const v = -Math.PI / 2 + (i * Math.PI) / tagger;
      p.push(`${n1(x + Math.cos(v) * r)} ${n1(y + Math.sin(v) * r)}`);
    }
    return `M${p.join(" L")}Z`;
  }
  // One ornament (door d) at x, y.
  function ornament(d, x, y) {
    const form = FORMER[(d - 1) % FORMER.length];
    const f = FARGER[(d * 5) % FARGER.length];
    const snor = `<path d="M${x} ${y - 13} V${y - 8}" stroke="#e8c76a" stroke-width="1.4"/>`;
    const glans = (dx, dy, r = 2.2) => `<ellipse cx="${n1(x + dx)}" cy="${n1(y + dy)}" rx="${r}" ry="${n1(r * 0.7)}" fill="rgba(255,255,255,.72)"/>`;
    switch (form) {
      case "stjerne":
        return `<path d="${stjernesti(x, y - 1, 9.5, 4.2)}" fill="${f}" stroke="${BLEKK}" stroke-width="1.6" stroke-linejoin="round"/>`;
      case "hjerte":
        return `${snor}<path d="M${x} ${y + 8} C${x - 12} ${y} ${x - 10} ${y - 9} ${x - 4.5} ${y - 8} C${x - 2} ${y - 7.6} ${x} ${y - 5.5} ${x} ${y - 4} C${x} ${y - 5.5} ${x + 2} ${y - 7.6} ${x + 4.5} ${y - 8} C${x + 10} ${y - 9} ${x + 12} ${y} ${x} ${y + 8}Z" fill="${f}" stroke="${BLEKK}" stroke-width="1.6"/>${glans(-4, -4, 1.8)}`;
      case "bjelle":
        return `${snor}<path d="M${x - 8} ${y + 6} C${x - 7} ${y + 1} ${x - 7} ${y - 7} ${x} ${y - 8} C${x + 7} ${y - 7} ${x + 7} ${y + 1} ${x + 8} ${y + 6}Z" fill="#ffd23f" stroke="${BLEKK}" stroke-width="1.6" stroke-linejoin="round"/><circle cx="${x}" cy="${y + 8}" r="2.4" fill="${f}" stroke="${BLEKK}" stroke-width="1.2"/>${glans(-3.5, -3, 1.6)}`;
      case "stokk":
        return `<path d="M${x + 3} ${y + 10} V${y - 4} A4.5 4.5 0 0 0 ${x - 6} ${y - 4}" fill="none" stroke="${BLEKK}" stroke-width="6" stroke-linecap="round"/><path d="M${x + 3} ${y + 10} V${y - 4} A4.5 4.5 0 0 0 ${x - 6} ${y - 4}" fill="none" stroke="#fff6e8" stroke-width="3.4" stroke-linecap="round"/><path d="M${x + 3} ${y + 10} V${y - 4} A4.5 4.5 0 0 0 ${x - 6} ${y - 4}" fill="none" stroke="#e8414f" stroke-width="3.4" stroke-dasharray="2.4 2.6"/>`;
      case "snofnugg":
        return `<g stroke="#fff6e8" stroke-width="2.2" stroke-linecap="round"><path d="M${x} ${y - 9} V${y + 9}M${x - 7.8} ${y - 4.5} L${x + 7.8} ${y + 4.5}M${x - 7.8} ${y + 4.5} L${x + 7.8} ${y - 4.5}"/></g><circle cx="${x}" cy="${y}" r="2.2" fill="#59b9ff"/>`;
      default:
        return `${snor}<rect x="${x - 2.6}" y="${y - 11}" width="5.2" height="3.6" rx="1" fill="#e8c76a" stroke="${BLEKK}" stroke-width="1"/><circle cx="${x}" cy="${y}" r="8.5" fill="${f}" stroke="${BLEKK}" stroke-width="1.6"/>${glans(-3, -3)}`;
    }
  }
  // The whole tree. ferdige: the doors that are done. o.id (unique per page), o.ny (a door whose
  // ornament just arrived: it drops in), o.etikett (the picture's name), o.frittstaende (an image file:
  // xmlns and no classes needed).
  function treSvg(ferdige, o = {}) {
    const har = new Set((ferdige || []).filter((d) => d >= 1 && d <= 24));
    const id = String(o.id || "jk").replace(/[^\w-]/g, "");
    const alle = har.size === 24;
    const lys = har.has(24);
    const deler = [];
    // Ground, snow, pot and trunk.
    deler.push(`<ellipse cx="120" cy="276" rx="112" ry="11" fill="rgba(255,246,232,.9)"/>`);
    deler.push(`<rect x="107" y="244" width="26" height="26" rx="4" fill="#8a5a3c" stroke="${BLEKK}" stroke-width="3"/>`);
    // Three tiers, bottom first.
    const lag = [
      "M120 116 L232 244 Q120 264 8 244Z",
      "M120 60 L204 176 Q120 194 36 176Z",
      "M120 20 L172 110 Q120 124 68 110Z",
    ];
    for (const sti of lag) deler.push(`<path d="${sti}" fill="url(#${id}-gran)" stroke="${BLEKK}" stroke-width="3.5" stroke-linejoin="round"/>`);
    // Snow on the tiers' edges.
    deler.push(`<path d="M14 243 Q120 262 226 243M42 175 Q120 192 198 175M74 109 Q120 122 166 109" fill="none" stroke="rgba(255,246,232,.55)" stroke-width="3" stroke-linecap="round"/>`);
    // A garland of small lights; lit when the star is on.
    const kjede = "M84 118 Q122 132 160 116M58 186 Q118 206 182 184";
    deler.push(`<path d="${kjede}" fill="none" stroke="#e8c76a" stroke-width="1.6" stroke-dasharray="1 5" stroke-linecap="round" opacity=".8"/>`);
    if (alle || lys) {
      for (const [x, y, k] of [[106, 123.6, 0], [134, 123.6, 1], [79.5, 191.6, 2], [106.5, 195.2, 3], [133.5, 194.8, 4], [160.5, 190.4, 0]])
        deler.push(`<circle cx="${x}" cy="${y}" r="2.6" fill="${FARGER[k]}" class="jk-lys"/>`);
    }
    // The ornaments and the empty places waiting for them.
    for (let d = 1; d <= 23; d++) {
      const [x, y] = PLASS[ORDEN[d - 1]];
      if (har.has(d)) deler.push(`<g class="jk-orn${o.ny === d ? " jk-orn-ny" : ""}" data-d="${d}">${ornament(d, x, y)}</g>`);
      else deler.push(`<circle cx="${x}" cy="${y}" r="7" fill="none" stroke="rgba(255,246,232,.38)" stroke-width="1.3" stroke-dasharray="2.2 2.6"/>`);
    }
    // The star on top (door 24).
    if (lys) {
      deler.push(`<circle cx="120" cy="16" r="22" fill="url(#${id}-glod)"/>`);
      deler.push(`<g class="jk-orn${o.ny === 24 ? " jk-orn-ny" : ""}" data-d="24"><path d="${stjernesti(120, 16, 16, 7)}" fill="#ffd23f" stroke="${BLEKK}" stroke-width="2.6" stroke-linejoin="round"/></g>`);
    } else deler.push(`<path d="${stjernesti(120, 16, 14, 6)}" fill="none" stroke="rgba(255,246,232,.45)" stroke-width="1.6" stroke-dasharray="3 3" stroke-linejoin="round"/>`);
    // Presents under the finished tree.
    if (alle) {
      deler.push(`<g stroke="${BLEKK}" stroke-width="2.4">
        <rect x="60" y="250" width="34" height="24" rx="3" fill="#ff4f8b"/><path d="M77 250 V274" stroke="#ffd23f" stroke-width="4"/>
        <rect x="146" y="254" width="30" height="20" rx="3" fill="#59b9ff"/><path d="M146 264 H176" stroke="#fff6e8" stroke-width="4"/>
        <rect x="178" y="258" width="24" height="16" rx="3" fill="#3de3b0"/><path d="M190 258 V274" stroke="#ff6b5e" stroke-width="3.6"/>
      </g>`);
    }
    const defs = `<defs>
      <linearGradient id="${id}-gran" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2e9a63"/><stop offset="1" stop-color="#156040"/></linearGradient>
      <radialGradient id="${id}-glod"><stop offset="0" stop-color="rgba(255,210,63,.75)"/><stop offset="1" stop-color="rgba(255,210,63,0)"/></radialGradient>
    </defs>`;
    const etikett = String(o.etikett || "").replace(/[<>&"]/g, "");
    const hode = o.frittstaende
      ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -8 240 296" width="${o.bredde || 960}" height="${Math.round(((o.bredde || 960) * 296) / 240)}">`
      : `<svg class="jk-tre${alle ? " jk-tre-ferdig" : ""}" viewBox="0 -8 240 296" role="img" aria-label="${etikett}">`;
    return `${hode}${defs}${deler.join("")}</svg>`;
  }

  // ---------- The reminders (.ics, RFC 5545) ----------

  // UTF-8 length of a text without TextEncoder (the unit tests run without it).
  function bytes(s) {
    let n = 0;
    for (const c of s) {
      const k = c.codePointAt(0);
      n += k < 0x80 ? 1 : k < 0x800 ? 2 : k < 0x10000 ? 3 : 4;
    }
    return n;
  }
  // Content lines are folded at 75 octets: the rest goes on the next line after one space.
  function brett(linje) {
    const ut = [];
    let na = "";
    let n = 0;
    let maks = 75;
    for (const c of linje) {
      const b = bytes(c);
      if (n + b > maks) {
        ut.push(na);
        na = " ";
        n = 1;
        maks = 75;
      }
      na += c;
      n += b;
    }
    ut.push(na);
    return ut.join("\r\n");
  }
  const icsTekst = (t) => String(t).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  // o: { sesong, fra (first door, 1–24), sone (R.tidssone), sprak, navn (calendar name), stamp
  // (DTSTAMP, «20261115T120000Z»), tittel(d), tekst(d), url(d) }. One event per door at 18:00 local
  // time, 15 minutes, with a reminder when it starts.
  function ics(o) {
    const sone = SONER[o.sone] ? o.sone : "Europe/Oslo";
    const [vinter, sommer, vinterNavn, sommerNavn, tilSommer, tilVinter] = SONER[sone];
    const to = (n) => String(n).padStart(2, "0");
    const sprak = /^[a-z]{2}$/.test(o.sprak || "") ? o.sprak : "nb";
    const l = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      `PRODID:-//rusj.no//Julekalenderen ${o.sesong}//${sprak.toUpperCase()}`,
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      `X-WR-CALNAME:${icsTekst(o.navn)}`,
      `X-WR-TIMEZONE:${sone}`,
      "BEGIN:VTIMEZONE",
      `TZID:${sone}`,
      "BEGIN:DAYLIGHT",
      `TZOFFSETFROM:${vinter}`,
      `TZOFFSETTO:${sommer}`,
      `TZNAME:${sommerNavn}`,
      `DTSTART:19700329T${tilSommer}`,
      "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
      "END:DAYLIGHT",
      "BEGIN:STANDARD",
      `TZOFFSETFROM:${sommer}`,
      `TZOFFSETTO:${vinter}`,
      `TZNAME:${vinterNavn}`,
      `DTSTART:19701025T${tilVinter}`,
      "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
      "END:STANDARD",
      "END:VTIMEZONE",
    ];
    for (let d = Math.min(24, Math.max(1, Math.floor(o.fra) || 1)); d <= 24; d++) {
      const dato = `${o.sesong}12${to(d)}`;
      l.push(
        "BEGIN:VEVENT",
        `UID:julekalenderen-${o.sesong}-${to(d)}-${sprak}@rusj.no`,
        `DTSTAMP:${o.stamp}`,
        `DTSTART;TZID=${sone}:${dato}T180000`,
        `DTEND;TZID=${sone}:${dato}T181500`,
        `SUMMARY:${icsTekst(o.tittel(d))}`,
        `DESCRIPTION:${icsTekst(o.tekst(d) + "\n" + o.url(d))}`,
        `URL:${o.url(d)}`,
        "TRANSP:TRANSPARENT",
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `DESCRIPTION:${icsTekst(o.tittel(d))}`,
        "TRIGGER:PT0M",
        "END:VALARM",
        "END:VEVENT",
      );
    }
    l.push("END:VCALENDAR");
    return l.map(brett).join("\r\n") + "\r\n";
  }

  const M = { GRUPPER, HASH, SONER, PLASS, ORDEN, fase: faseFor, kanApnes, lesLuke, lukeAdresse, nisse, lukeFor, steg, pynt, spillListe, storquiz, treSvg, ics, brett, bytes };
  window.RusjJulekalender = M;

  const R = window.Rusj;
  if (!R) return; // loaded by the unit tests

  // ---------- The game ----------

  const D = window.RUSJ_DATA;
  const LUKER = D.luker;
  const esc = R.esc;
  const SLUG = (R.sprak !== "nb" && window.RUSJ_SPILL && window.RUSJ_SPILL.slug) || "julekalenderen";
  // The calendar's address in the edition (shares, QR codes and reminders link to it).
  const BASE = "https://rusj.no" + R.forside + SLUG + "/";
  const ADRESSE_KORT = "rusj.no" + R.forside + SLUG;
  // The other games of the edition: name and address.
  const ANDRE = new Map((window.RUSJ_ANDRE || []).map((g) => [g.id, g]));
  // The fixed, shuffled order of the doors on the calendar (door 24 is the big one).
  const REKKEFOLGE = [9, 17, 3, 21, 12, 6, 1, 14, 23, 19, 11, 24, 4, 7, 15, 8, 20, 2, 13, 18, 5, 22, 10, 16];
  const FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", system-ui, sans-serif';
  const GRUPPE = {
    familie: { tittel: R.t("Hjemme med familien"), tekst: R.t("Kos, lek og prat for store og små"), ikon: "🏡" },
    venner: { tittel: R.t("Med venner"), tekst: R.t("Adventskos med gjengen"), ikon: "😎" },
    klasse: { tittel: R.t("Klassen eller jobben"), tekst: R.t("På storskjerm – og ingenting privat"), ikon: "🏫" },
  };
  const STEG = {
    kos: { navn: R.t("Kos"), tittel: R.t("Kos sammen"), ikon: "🕯️" },
    snilt: { navn: R.t("Snilt"), tittel: R.t("Gjør noe snilt"), ikon: "💛" },
    prat: { navn: R.t("Prat"), tittel: R.t("Prat sammen"), ikon: "💬" },
    gjett: { navn: R.t("Gjett"), tittel: R.t("Gjett sammen"), ikon: "❓" },
    spill: { navn: R.t("Spill"), tittel: R.t("Dagens spill"), ikon: "🎲" },
    pynt: { navn: R.t("Pynt"), tittel: R.t("Heng opp pynten"), ikon: "🎄" },
  };
  let H;
  let apner = false; // a door is swinging open (short animation before its screen)
  let opptatt = false; // the tree picture is being drawn

  const fase = () => M.fase(R.dag());
  const luke = (S, d) => M.lukeFor(LUKER[d - 1], S.gruppe);
  const antallPynt = (S) => M.pynt(S.luker).length;
  const erFerdig = (S, d) => !!(S.luker[d] && S.luker[d].ferdig);
  const spillet = (id) => {
    const g = ANDRE.get(id);
    return g ? { navn: g.navn, url: g.url || "/" + id + "/" } : null;
  };
  const klasse = (S) => S.gruppe === "klasse";
  // Wide screens in class mode get their own layout (html.jk-klasse, see spill.css).
  const settModus = (S) => document.documentElement.classList.toggle("jk-klasse", klasse(S));

  // ---------- Dagens nisse ----------

  // The players with a name typed in (shared names, R.felles.navn), as indexes.
  function navnene(S) {
    const ut = [];
    for (let i = 0; i < Math.min(Number(S.antall) || 0, R.MAKS_SPILLERE); i++) if (String(R.felles.navn[i] || "").trim()) ut.push(i);
    return ut;
  }
  function dagensNisse(S, d) {
    const n = navnene(S);
    const k = M.nisse(d, n.length, S.nisseStart, (S.luker[d] && S.luker[d].bytt) || 0);
    return k < 0 ? null : n[k];
  }
  function nisseHtml(S, d, bytt) {
    const i = dagensNisse(S, d);
    if (i == null)
      return `<div class="jk-nisse jk-nisse-tom"><span class="jk-nisse-lue" aria-hidden="true">🎅</span><p><b>${esc(R.t("Dagens nisse"))}</b><span>${esc(
        R.t("Velg en som leser høyt og leder i dag. Barn kan også lede!"),
      )}</span></p>${bytt ? `<button class="lenke" data-h="oppsett">${esc(R.t("Skriv inn navn"))}</button>` : ""}</div>`;
    const flere = navnene(S).length > 1;
    return `<div class="jk-nisse">${R.avatar(i, "mid")}<p><span>${esc(R.t("Dagens nisse"))}</span><b>${esc(R.navn(i))}</b><span>${esc(
      R.t("leser høyt og leder"),
    )}</span></p>${bytt && flere ? `<button class="lenke" data-h="bytt-nisse" aria-label="${esc(R.t("Bytt dagens nisse"))}">${esc(R.t("Bytt"))}</button>` : ""}</div>`;
  }

  // ---------- Progress ----------

  // Days in a row up to today with a finished door.
  function rekke(S, dag) {
    let n = 0;
    for (let d = dag; d >= 1 && erFerdig(S, d); d--) n++;
    return n;
  }
  function meldFerdig(S) {
    const f = fase();
    if (f.fase === "aktiv" && erFerdig(S, f.dag)) R.dagligFerdig({ vunnet: true, rekke: rekke(S, f.dag), res: R.t("Luke {n}", { n: f.dag }) });
  }

  // A door is opened for the first time: its state, the start count and the door stickers.
  function apneTilstand(S, d) {
    if (!S.luker[d]) {
      S.luker[d] = { ferdig: false, steg: 0, bytt: 0, vist: false };
      S.nytt = d;
      R.statistikk("start", { luke: d });
      if (d === 1 || d === 12 || d === 24) R.merke("luke-" + d);
    }
    S.aktiv = d;
  }
  // Where a door leads: its page, or «Gjør klart» first when nobody has said who is playing.
  function tilLuke(S) {
    if (S.gruppe) return R.gaTil("luke");
    S.etter = "luke";
    return R.gaTil("oppsett");
  }

  // ---------- Pieces of HTML ----------

  const merkeHtml = (d, klasseNavn = "") => {
    const L = LUKER[d - 1];
    return `<span class="jk-merke ${klasseNavn}" role="img" aria-label="${esc(R.t("Klistremerke: {navn}", { navn: L.merkeNavn }))}"><span aria-hidden="true">${esc(L.merke)}</span></span>`;
  };

  function dorHtml(S, d, f) {
    const apen = !!S.luker[d];
    const ferdig = erFerdig(S, d);
    const kan = M.kanApnes(d, f);
    const idag = f.fase === "aktiv" && d === f.dag;
    const kl = ["jk-luke", d === 24 ? "jk-stor" : "", apen ? "jk-apen" : kan ? "jk-klar" : "jk-last", ferdig ? "jk-ferdig" : "", idag ? "jk-idag" : ""].join(" ");
    const status = ferdig ? R.t("pynten henger på treet") : apen ? R.t("åpnet") : kan ? (idag ? R.t("dagens luke") : R.t("klar til å åpnes")) : R.t("låst");
    const inni = apen ? `<span class="jk-hull" aria-hidden="true">${esc(LUKER[d - 1].merke)}</span>` : "";
    return `<button class="${kl}" data-h="luke" data-v="${d}" aria-label="${esc(R.t("Luke {n}, {status}", { n: d, status }))}">${inni}<span class="jk-dor" aria-hidden="true"><span class="jk-nr">${d}</span></span></button>`;
  }

  function statusHtml(S, f) {
    if (f.fase === "for")
      return `<p class="jk-status"><b>${esc(R.t("Kalenderen åpner 1. desember"))}</b><span>${esc(f.igjen === 1 ? R.t("I morgen!") : R.t("Om {n} dager", { n: f.igjen }))}</span></p>`;
    if (f.fase === "etter") return `<p class="jk-status"><b>${esc(R.t("God jul!"))}</b><span>${esc(R.t("Takk for i år"))}</span></p>`;
    const ferdig = erFerdig(S, f.dag);
    return `<p class="jk-status"><b>${esc(f.dag === 24 ? R.t("Julaften!") : R.t("{n}. desember", { n: f.dag }))}</b><span>${esc(
      ferdig ? (f.dag === 24 ? R.t("God jul!") : R.t("Ny luke i morgen")) : R.t("Luke {n} er klar!", { n: f.dag }),
    )}</span></p>`;
  }

  const treEtikett = (n) => R.t("Juletreet med {n} av 24 pynt", { n });

  // The tree on the home screen, with the count and today's host.
  function trepanelHtml(S, f) {
    const ferdige = M.pynt(S.luker);
    const n = ferdige.length;
    return `<section class="jk-trepanel" aria-labelledby="jk-tre-tittel">
      <button class="jk-treknapp" data-h="tre" aria-label="${esc(R.t("Se juletreet"))}">${M.treSvg(ferdige, { id: "jk-hjem", etikett: treEtikett(n) })}</button>
      <div class="jk-treinfo">
        <h2 id="jk-tre-tittel">${esc(R.t("Juletreet vårt"))}</h2>
        <p class="jk-tretall">${esc(R.t("{antall} pynt", { n })).replace("{antall}", `<b>${esc(R.t("{n} av 24", { n }))}</b>`)}</p>
        <div class="jk-linje" aria-hidden="true"><span style="width:${Math.round((n / 24) * 100)}%"></span></div>
        ${f.fase === "aktiv" ? nisseHtml(S, f.dag, false) : `<p class="hjelp">${esc(n === 24 ? R.t("Hele treet er pyntet. For en desember!") : R.t("Hver luke dere gjør sammen, henger en ny pynt på treet."))}</p>`}
      </div>
    </section>`;
  }

  // Before December: what is coming, and who is playing.
  function teaserHtml(S) {
    const g = GRUPPE[S.gruppe];
    const deler = [
      ["🕯️", R.t("Kos"), R.t("noe å gjøre sammen, bort fra skjermen")],
      ["💬", R.t("Prat"), R.t("et julekort å snakke om")],
      ["🎲", R.t("Spill"), R.t("et rusj-spill med juletvist")],
    ];
    return `<section class="jk-teaser" aria-labelledby="jk-teaser-tittel">
      <div class="jk-teaser-tekst">
        <h2 id="jk-teaser-tittel">${esc(R.t("24 stunder sammen"))}</h2>
        <p>${esc(R.t("Fra 1. desember åpner dere én luke hver dag. Mobilen er vert – resten skjer mellom dere."))}</p>
        <ul class="jk-deler">${deler.map(([ikon, navn, tekst]) => `<li><span aria-hidden="true">${ikon}</span><span><b>${esc(navn)}</b> ${esc(tekst)}</span></li>`).join("")}</ul>
        <p class="jk-teaser-tre">${esc(R.t("Hver luke dere gjør, henger en ny pynt på juletreet deres. På julaften er det ferdig!"))}</p>
      </div>
      <div class="jk-teaser-bilde" aria-hidden="true">${M.treSvg([], { id: "jk-teaser" })}</div>
    </section>
    <section class="jk-hvem" aria-label="${esc(R.t("Hvem er med?"))}">
      ${
        g
          ? `<p><span aria-hidden="true">${g.ikon}</span><span><small>${esc(R.t("Hvem er med?"))}</small><b>${esc(g.tittel)}</b></span></p>${R.ui.knapp2(R.t("Endre"), "oppsett", {
              etikett: R.t("Endre hvem som er med"),
            })}`
          : `<p><span aria-hidden="true">🎅</span><span><small>${esc(R.t("Gjør klart til desember"))}</small><b>${esc(R.t("Hvem er med?"))}</b></span></p>${R.ui.knapp2(R.t("Gjør klart"), "oppsett")}`
      }
    </section>`;
  }

  // ---------- A door's page ----------

  const minutter = (kos) => R.t("ca. {n} min", { n: kos.min || 10 });

  function stegNav(s, i) {
    return `<nav class="jk-steg" aria-label="${esc(R.t("Lukas deler"))}"><ol>${s
      .map(
        (k, j) =>
          `<li><button class="jk-stegknapp${j < i ? " jk-forbi" : ""}" data-h="steg" data-v="${j}"${j === i ? ' aria-current="step"' : ""}><span aria-hidden="true">${STEG[k].ikon}</span>${esc(STEG[k].navn)}</button></li>`,
      )
      .join("")}</ol></nav>`;
  }

  function gjettHtml(S, d, L) {
    const l = S.luker[d];
    const B = L.bonus;
    if (B.type === "nott")
      return `<p class="jk-etikett">${esc(R.t("Gjett sammen"))} · ${esc(R.t("Julenøtt"))}</p>
        <p class="jk-sporsmal">${esc(B.tekst)}</p>
        ${
          l.vist
            ? `<p class="jk-svar" role="status">${esc(B.svar)}</p>`
            : `<p class="jk-instruks">${esc(R.t("Tenk sammen. Den som tror den vet det, hvisker svaret til dagens nisse."))}</p>`
        }`;
    return `<p class="jk-etikett">${esc(R.t("Gjett sammen"))} · ${esc(R.t("Julequiz"))}</p>
      <p class="jk-sporsmal">${esc(B.tekst)}</p>
      <ol class="jk-valg">${B.valg
        .map((v, i) => `<li class="${l.vist ? (i === B.riktig ? "riktig" : "av") : ""}"><span class="jk-valg-nr" aria-hidden="true">${i + 1}</span><span>${esc(v)}</span>${l.vist && i === B.riktig ? `<span class="jk-hake" aria-label="${esc(R.t("Riktig svar"))}">✓</span>` : ""}</li>`)
        .join("")}</ol>
      ${
        l.vist
          ? `<p class="jk-svar" role="status">${esc(R.t("Svaret er «{svar}».", { svar: B.valg[B.riktig] }))}${B.fakta ? `<span>${esc(B.fakta)}</span>` : ""}</p>`
          : `<p class="jk-instruks">${esc(R.t("Tell til tre – så viser alle svaret med fingrene samtidig: 1, 2 eller 3!"))}</p>`
      }`;
  }

  // The big quiz on the 24th: every bonus from doors 1–23, answered together.
  function storquizHtml(S, d) {
    const l = S.luker[d];
    const Q = M.storquiz(LUKER);
    const q = l.quiz || { i: 0, rett: [], vist: false };
    if (q.i >= Q.length) {
      const n = q.rett.length;
      return `<p class="jk-etikett">${esc(R.t("Den store julaftenquizen"))}</p>
        <p class="jk-sporsmal">${esc(R.t("Dere klarte {n} av {av}!", { n, av: Q.length }))}</p>
        <p class="jk-instruks">${esc(n >= Q.length * 0.6 ? R.t("For en gjeng! Dere har fulgt med hele desember.") : R.t("Godt jobba – og nå vet dere enda mer om jul."))}</p>`;
    }
    const B = Q[q.i];
    const vist = !!q.vist;
    const svar =
      B.type === "nott"
        ? vist
          ? `<p class="jk-svar" role="status">${esc(B.svar)}</p>`
          : ""
        : `<ol class="jk-valg">${B.valg
            .map((v, i) => `<li class="${vist ? (i === B.riktig ? "riktig" : "av") : ""}"><span class="jk-valg-nr" aria-hidden="true">${i + 1}</span><span>${esc(v)}</span>${vist && i === B.riktig ? `<span class="jk-hake" aria-label="${esc(R.t("Riktig svar"))}">✓</span>` : ""}</li>`)
            .join("")}</ol>`;
    return `<p class="jk-etikett">${esc(R.t("Den store julaftenquizen"))} · ${esc(R.t("{n} av {av}", { n: q.i + 1, av: Q.length }))}</p>
      <p class="jk-fra">${esc(R.t("Husker dere luke {n}?", { n: B.d }))}</p>
      <p class="jk-sporsmal">${esc(B.tekst)}</p>
      ${svar}
      <p class="jk-instruks">${esc(vist ? R.t("Hadde dere rett?") : R.t("Snakk sammen og bli enige om ett svar."))} <span class="jk-poeng">${esc(R.t("{n} riktige så langt", { n: q.rett.length }))}</span></p>`;
  }

  function spillHtml(S, d, L) {
    const sp = L.spill;
    const g = spillet(sp.id);
    const navn = g ? g.navn : "";
    return `<p class="jk-etikett">${esc(R.t("Dagens figur"))}</p>
      <div class="jk-figur">
        ${R.figur(sp.id, "jk-figur-bilde")}
        <blockquote class="jk-boble"><p>${esc(sp.figur)}</p>${navn ? `<cite>${esc(navn)}</cite>` : ""}</blockquote>
      </div>
      <p class="jk-stortekst">${esc(sp.tekst)}</p>
      <p class="hjelp">${esc(R.t("Spillet åpner her på mobilen. Trykk tilbake når dere er ferdige – luka venter."))}</p>`;
  }

  function pyntHtml(S, d) {
    const l = S.luker[d];
    const ferdige = M.pynt(S.luker);
    const n = ferdige.length;
    const tekst = l.ferdig
      ? n === 24
        ? R.t("Hele treet er pyntet! God jul!")
        : d === 24
          ? R.t("Stjerna er på plass. God jul!")
          : R.t("Pynten henger på treet. {n} av 24!", { n })
      : R.t("Har dere gjort luka sammen? Da får treet en ny pynt.");
    return `<p class="jk-etikett">${esc(R.t("Juletreet vårt"))}</p>
      <div class="jk-pynt-tre">${M.treSvg(ferdige, { id: "jk-luke", ny: l.ferdig && l.nyPynt ? d : 0, etikett: treEtikett(n) })}</div>
      <p class="jk-sporsmal jk-midt" role="status">${esc(tekst)}</p>
      ${l.ferdig ? `<p class="hjelp jk-midt">${esc(R.t("Del luka, så kan andre åpne den sammen de også."))}</p>` : ""}`;
  }

  function innholdHtml(S, d, L, na) {
    switch (na) {
      case "kos":
        return `<p class="jk-etikett">${esc(STEG.kos.tittel)} · ${esc(minutter(L.kos))}</p>
          <h2 class="jk-kort-tittel">${esc(L.kos.tittel)}</h2>
          <p class="jk-stortekst">${esc(L.kos.tekst)}</p>
          ${L.smaa ? `<p class="jk-smaa"><b>${esc(R.t("For de minste:"))}</b> ${esc(L.smaa)}</p>` : ""}`;
      case "snilt":
        return `<p class="jk-etikett">${esc(STEG.snilt.tittel)}</p>
          <h2 class="jk-kort-tittel">${esc(L.snill.tittel || R.t("Til noen utenfor rommet"))}</h2>
          <p class="jk-stortekst">${esc(L.snill.tekst)}</p>`;
      case "prat":
        return `<p class="jk-etikett">${esc(R.t("Julekort til praten"))}</p>
          <p class="jk-prat">${esc(L.prat.t)}</p>
          <p class="jk-videre"><b>${esc(R.t("Spør videre:"))}</b> ${esc(L.prat.f)}</p>
          <p class="hjelp">${esc(R.t("Dagens nisse leser høyt. Alle som vil, svarer – og de andre lytter. Det er alltid lov å stå over."))}</p>`;
      case "gjett":
        return L.storquiz ? storquizHtml(S, d) : gjettHtml(S, d, L);
      case "spill":
        return spillHtml(S, d, L);
      default:
        return pyntHtml(S, d);
    }
  }

  function lukeDokk(S, d, L, s, i) {
    const l = S.luker[d];
    const na = s[i];
    const til = R.ui.lenke(R.t("Til kalenderen"), "hjem");
    const neste = (tekst) => R.ui.knapp(tekst || R.t("Neste: {del}", { del: STEG[s[i + 1]].navn }), "neste");
    if (na === "gjett" && L.storquiz) {
      const q = l.quiz || { i: 0, rett: [], vist: false };
      const antall = M.storquiz(LUKER).length;
      if (q.i >= antall) return R.ui.dokk(neste(), R.ui.lenkerad(R.ui.lenke(R.t("Angre"), "quiz-angre"), til));
      if (!q.vist) return R.ui.dokk(R.ui.knapp(R.t("Vis svaret"), "vis-svar"), R.ui.lenkerad(q.i > 0 ? R.ui.lenke(R.t("Angre"), "quiz-angre") : "", R.ui.lenke(R.t("Hopp over quizen"), "neste"), til));
      return R.ui.dokk(
        `<div class="knapprad">${R.ui.knapp(R.t("Vi hadde rett"), "quiz-svar", { v: "1", variant: "mynte", ikon: "✓" })}${R.ui.knapp2(R.t("Ikke denne"), "quiz-svar", { v: "0" })}</div>`,
        R.ui.lenkerad(q.i > 0 ? R.ui.lenke(R.t("Angre"), "quiz-angre") : "", til),
      );
    }
    if (na === "gjett" && !l.vist) return R.ui.dokk(R.ui.knapp(R.t("Vis svaret"), "vis-svar"), R.ui.lenkerad(R.ui.lenke(R.t("Hopp over"), "neste"), til));
    if (na === "spill") {
      const g = spillet(L.spill.id);
      if (g)
        return R.ui.dokk(
          `<a class="knapp mynte jk-spillknapp" href="${esc(g.url + (L.spill.hash ? "#" + L.spill.hash : ""))}"><span class="ikon" aria-hidden="true">🎲</span>${esc(R.t("Spill {navn}", { navn: g.navn }))}</a>`,
          R.ui.lenkerad(R.ui.lenke(R.t("Neste: {del}", { del: STEG[s[i + 1]].navn }), "neste"), til),
        );
    }
    if (na === "pynt") {
      if (!l.ferdig) return R.ui.dokk(R.ui.knapp(R.t("Heng opp pynten"), "pynt", { variant: "lampe", ikon: "🎄" }), R.ui.lenkerad(til));
      return R.ui.dokk(R.ui.knapp(R.t("Del: Vi åpnet luke {n}!", { n: d }), "del-luke", { variant: "lampe", ikon: "📤" }), R.ui.lenkerad(R.ui.lenke(R.t("Se juletreet"), "tre"), til));
    }
    return R.ui.dokk(neste(), R.ui.lenkerad(til));
  }

  // ---------- Opening a door ----------

  const vent = (ms) => new Promise((ok) => setTimeout(ok, ms));
  async function apne(S, d, el) {
    const f = fase();
    if (!M.kanApnes(d, f)) {
      if (el) {
        el.classList.remove("risting");
        void el.offsetWidth;
        el.classList.add("risting");
      }
      R.toast(R.t("Luke {n} åpner {n}. desember", { n: d }));
      return;
    }
    if (S.luker[d]) {
      S.aktiv = d;
      return tilLuke(S);
    }
    if (apner) return;
    apneTilstand(S, d);
    if (d === 24) R.lyd.fanfare();
    else R.lyd.pling();
    R.vibrer(15);
    if (el && !R.rolig()) {
      apner = true;
      const fortsatt = R.vakt();
      el.classList.add("jk-apner");
      await vent(620);
      apner = false;
      if (!fortsatt()) return;
    }
    tilLuke(S);
    if (d === 24) R.konfetti();
  }

  // ---------- Files: download, the tree picture, the reminders ----------

  function lastNed(blob, navn) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = navn;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  // The tree as a 1080×1350 picture: night sky, the tree, the count and the address. No names.
  async function trebilde(S) {
    const ferdige = M.pynt(S.luker);
    const n = ferdige.length;
    const kilde = URL.createObjectURL(new Blob([M.treSvg(ferdige, { id: "bilde", frittstaende: true, bredde: 780 })], { type: "image/svg+xml" }));
    try {
      const bilde = new Image();
      await new Promise((ok, feil) => {
        bilde.onload = ok;
        bilde.onerror = feil;
        bilde.src = kilde;
      });
      const c = document.createElement("canvas");
      c.width = 1080;
      c.height = 1350;
      const g = c.getContext("2d");
      const bak = g.createLinearGradient(0, 0, 0, 1350);
      bak.addColorStop(0, "#150c28");
      bak.addColorStop(1, "#33215c");
      g.fillStyle = bak;
      g.fillRect(0, 0, 1080, 1350);
      const rng = R.rng(1224);
      g.fillStyle = "rgba(255, 255, 255, 0.7)";
      for (let i = 0; i < 110; i++) {
        g.beginPath();
        g.arc(rng() * 1080, rng() * 1350, 1.2 + rng() * 3.2, 0, Math.PI * 2);
        g.fill();
      }
      g.textAlign = "center";
      g.textBaseline = "alphabetic";
      g.fillStyle = "#ffd23f";
      g.font = `900 76px ${FONT}`;
      g.fillText(R.t("Juletreet vårt {aar}", { aar: S.sesong || fase().sesong }), 540, 132);
      g.drawImage(bilde, 150, 170, 780, 962);
      g.fillStyle = "#fff1dd";
      g.font = `800 54px ${FONT}`;
      g.fillText(n === 24 ? R.t("Alle 24 lukene – sammen!") : R.t("{n} av 24 luker – sammen", { n }), 540, 1222);
      g.fillStyle = "rgba(255, 241, 221, 0.72)";
      g.font = `700 36px ${FONT}`;
      g.fillText(ADRESSE_KORT, 540, 1292);
      return await new Promise((ok) => c.toBlob(ok, "image/png"));
    } finally {
      URL.revokeObjectURL(kilde);
    }
  }
  const bildenavn = (S) => R.t("juletreet-{aar}.png", { aar: S.sesong || fase().sesong });

  function stempel() {
    return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  }

  // ---------- The paper calendar ----------

  let qrMinne = null;
  function qr(d) {
    if (!qrMinne) qrMinne = {};
    if (qrMinne[d] != null) return qrMinne[d];
    const Q = window.LuringenQr;
    let svg = "";
    try {
      if (Q) svg = Q.qrSvg(Q.lagQr(M.lukeAdresse(BASE, R.sprak, d), "M"), { mork: "#170e2b", lys: "#ffffff", kant: 2, etikett: esc(R.t("QR-kode til luke {n}", { n: d })) });
    } catch (e) {
      svg = "";
    }
    return (qrMinne[d] = svg);
  }

  function arkHtml(S) {
    const aar = S.sesong || fase().sesong;
    return `<div class="jk-ark" aria-label="${esc(R.t("Papirkalenderen"))}">
      <header class="jk-ark-hode">
        ${R.figur(null, "jk-ark-figur")}
        <div>
          <p class="jk-ark-tittel">${esc(R.t("Julekalenderen {aar}", { aar }))}</p>
          <p class="jk-ark-under">${esc(R.t("24 stunder sammen – kos, prat og spill"))}</p>
        </div>
      </header>
      <ol class="jk-ark-dorer">${REKKEFOLGE.map(
        (d) => `<li class="jk-ark-dor${d === 24 ? " jk-ark-24" : ""}" data-d="${d}" data-url="${esc(M.lukeAdresse(BASE, R.sprak, d))}">
          <span class="jk-ark-nr">${d}</span>
          <span class="jk-ark-qr">${qr(d)}</span>
        </li>`,
      ).join("")}</ol>
      <footer class="jk-ark-fot">
        <span>${esc(R.t("Skann dagens luke med kameraet på mobilen."))}</span>
        <span class="jk-ark-adresse">${esc(ADRESSE_KORT)}</span>
      </footer>
    </div>`;
  }

  function skrivUt(hva) {
    R.statistikk("jul.utskrift", { hva });
    try {
      window.print();
    } catch (e) {
      R.toast(R.t("Utskrift virker ikke i denne nettleseren."));
    }
  }

  // ---------- The game ----------

  R.start({
    id: "julekalenderen",
    versjon: 1,
    // A door in progress keeps the screen on and shows «Fortsett» on the front page.
    pagar: (S) => !!(S.skjerm === "luke" && S.aktiv && S.luker && S.luker[S.aktiv] && !S.luker[S.aktiv].ferdig),

    tilstand: () => ({ sesong: 0, luker: {}, aktiv: 0, nytt: 0, gruppe: "", nisseStart: 0, antall: 4 }),

    // Saves from the first calendar ({ ferdig, svar, valgt, vist } per door) keep their doors and
    // count their finished ones as ornaments; the old word puzzle and quiz answers are dropped.
    lastet(S) {
      const f = fase();
      const ok = S.luker && typeof S.luker === "object" && !Array.isArray(S.luker);
      if (S.sesong !== f.sesong || !ok) {
        S.sesong = f.sesong;
        S.luker = {};
      }
      for (const k of Object.keys(S.luker)) {
        const d = Number(k);
        const l = S.luker[k];
        if (!Number.isInteger(d) || !M.kanApnes(d, f) || !l || typeof l !== "object") delete S.luker[k];
        else {
          l.ferdig = !!l.ferdig;
          l.vist = !!l.vist || Number.isInteger(l.svar);
          delete l.svar;
          delete l.valgt;
          delete l.feil;
          delete l.nyPynt;
          l.steg = Number.isInteger(l.steg) && l.steg >= 0 && l.steg < 8 ? l.steg : 0;
          l.bytt = Number.isInteger(l.bytt) && l.bytt >= 0 && l.bytt < 1000 ? l.bytt : 0;
          if (l.quiz) {
            const q = l.quiz;
            const antall = M.storquiz(LUKER).length;
            const ok2 = q && typeof q === "object" && Number.isInteger(q.i) && q.i >= 0 && q.i <= antall && Array.isArray(q.rett);
            if (!ok2) delete l.quiz;
            else {
              q.rett = q.rett.filter((x, j, a) => Number.isInteger(x) && x >= 0 && x < q.i && a.indexOf(x) === j);
              q.vist = !!q.vist;
            }
          }
        }
      }
      if (!M.GRUPPER.includes(S.gruppe)) S.gruppe = "";
      delete S.utkast;
      if (!Number.isInteger(S.nisseStart) || S.nisseStart < 0 || S.nisseStart > 99) S.nisseStart = 0;
      if (!Number.isInteger(S.antall) || S.antall < 1) S.antall = 4;
      S.nytt = 0;
      if (!S.luker[S.aktiv]) S.aktiv = 0;
      if ((S.skjerm === "luke" && (!S.aktiv || !S.gruppe)) || S.skjerm === "oppsett") S.skjerm = "hjem";
      meldFerdig(S);
    },

    regler: {
      intro: R.t("En julekalender for å gjøre noe sammen. Bak hver luke venter 5–15 minutter med kos, prat og et spill – for familien, vennegjengen eller klassen."),
      steg: [
        [R.t("Velg hvem som er med"), R.t("Familie, venner eller klassen og jobben. Skriv inn navnene, så blir én av dere dagens nisse som leser høyt og leder.")],
        [R.t("Åpne dagens luke"), R.t("Gjør kos-ideen sammen, snakk om julekortet, gjett sammen og spill dagens rusj-spill. Mobilen er vert – resten skjer mellom dere.")],
        [R.t("Heng opp pynten"), R.t("Hver luke dere gjør, gir en ny pynt på juletreet deres. På julaften er treet ferdig – og dere kan laste det ned eller skrive det ut.")],
      ],
      tips: [
        R.t("Barn kan godt være dagens nisse. De voksne hjelper med å lese."),
        R.t("Skriv ut papirkalenderen: Hver luke har en QR-kode som åpner akkurat den luka."),
        R.t("«Legg til påminnelse» gir en påminnelse i kalenderen klokka 18 hver dag. Ingenting sendes noe sted."),
        R.t("Har dere glemt en dag? Tidligere luker kan åpnes hele desember."),
        R.t("Kalenderen husker lukene og treet på denne mobilen."),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        inn(S) {
          if (S.lastLuke) {
            const d = S.lastLuke;
            delete S.lastLuke;
            R.toast(R.t("Luke {n} åpner {n}. desember", { n: d }));
          }
        },
        etter(S) {
          settModus(S);
        },
        vis(S) {
          const f = fase();
          const dorer = REKKEFOLGE.map((d) => dorHtml(S, d, f)).join("");
          const merker = Object.keys(S.luker)
            .map(Number)
            .sort((a, b) => a - b)
            .map((d) => merkeHtml(d))
            .join("");
          const idag = f.fase === "aktiv" ? S.luker[f.dag] : null;
          let hoved;
          let lenker;
          if (f.fase === "aktiv") {
            hoved = R.ui.knapp(
              idag ? (idag.ferdig ? R.t("Se luke {n}", { n: f.dag }) : R.t("Fortsett luke {n}", { n: f.dag })) : R.t("Åpne luke {n}", { n: f.dag }),
              "dagens",
              { variant: idag && idag.ferdig ? "" : "lampe" },
            );
            lenker = R.ui.lenkerad(R.ui.lenke(R.t("Skriv ut"), "utskrift"), R.ui.lenke(R.t("Påminnelse"), "paminnelse"), R.ui.lenke(R.t("Del"), "del"));
          } else if (f.fase === "for") {
            hoved = R.ui.knapp(R.t("Skriv ut papirkalenderen"), "utskrift", { variant: "lampe", ikon: "🖨️" });
            lenker = R.ui.lenkerad(R.ui.lenke(R.t("Legg til påminnelse"), "paminnelse"), R.ui.lenke(R.t("Del kalenderen"), "del"));
          } else {
            hoved = R.ui.knapp(R.t("Se juletreet"), "tre", { variant: "lampe", ikon: "🎄" });
            lenker = R.ui.lenkerad(R.ui.lenke(R.t("Del kalenderen"), "del"));
          }
          const takk =
            f.fase === "etter"
              ? `<section class="jk-takk" aria-labelledby="jk-takk-tittel"><h2 id="jk-takk-tittel">${esc(R.t("Takk for i år!"))}</h2><p>${esc(
                  R.t("Takk for alle stundene sammen i desember. Lukene står åpne en stund til – gjør gjerne en favoritt igjen."),
                )}</p></section>`
              : "";
          return `
            <div class="jk-hode">
              ${R.figur(null, "jk-hodefigur")}
              <div class="jk-tittel">
                <h1>${esc(R.t("Julekalenderen"))}</h1>
                ${statusHtml(S, f)}
              </div>
            </div>
            ${f.fase === "for" ? teaserHtml(S) : takk + trepanelHtml(S, f)}
            <div class="jk-kalender${f.fase === "for" ? " jk-stengt" : ""}" role="group" aria-label="${esc(R.t("Kalenderen med 24 luker"))}">
              <span class="jk-sno" aria-hidden="true"></span>
              <div class="jk-rutenett">${dorer}</div>
            </div>
            ${merker ? `<section class="jk-samling" aria-label="${esc(R.t("Klistremerkene dine"))}"><div class="jk-merker">${merker}</div></section>` : ""}
            ${R.ui.dokk(hoved, lenker)}`;
        },
      },

      oppsett: {
        tittel: () => R.t("Gjør klart"),
        // Back to the door it came from (when one is open and the group is known), else home.
        tilbake: (S) => {
          delete S.utkast;
          const ut = S.etter === "luke" && S.gruppe && S.aktiv && S.luker[S.aktiv] ? "luke" : "hjem";
          delete S.etter;
          return ut;
        },
        etter(S) {
          settModus(S);
        },
        vis(S) {
          const valgt = S.utkast || S.gruppe || "familie";
          const hjelp =
            valgt === "klasse"
              ? R.t("Fornavn eller gruppenavn – eller ingenting. Navnene blir bare på denne enheten.")
              : R.t("Én av dere er dagens nisse hver dag: leser høyt og leder. Barn kan også lede!");
          return `
            <h1 class="jk-h1">${esc(R.t("Hvem er med?"))}</h1>
            <section class="seksjon jk-grupper">
              ${R.ui.fliser(
                "gruppe",
                M.GRUPPER.map((v) => ({ v, tittel: GRUPPE[v].tittel, tekst: GRUPPE[v].tekst, ikon: GRUPPE[v].ikon })),
                valgt,
              )}
            </section>
            ${R.ui.spillere({ min: 1, max: 20, tittel: R.t("Hvem kan være dagens nisse?"), hjelp })}
            ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start"))}`;
        },
      },

      luke: {
        tittel: (S) => R.t("Luke {n}", { n: S.aktiv }),
        tilbake: "hjem",
        etter(S) {
          settModus(S);
          const l = S.luker[S.aktiv];
          if (l && l.nyPynt) delete l.nyPynt; // the ornament has dropped in once
        },
        vis(S) {
          const d = S.aktiv;
          const L = luke(S, d);
          const l = S.luker[d];
          const s = M.steg(L);
          const i = Math.max(0, Math.min(s.length - 1, l.steg || 0));
          const na = s[i];
          const ny = S.nytt === d;
          const ferdige = M.pynt(S.luker);
          return `
            <div class="jk-side jk-steg-${na}">
              <div class="jk-topp">
                ${merkeHtml(d, `jk-stort${ny ? " jk-nytt" : ""}`)}
                <div class="jk-topp-tekst">
                  <span class="etikett">${esc(R.t("{n}. desember", { n: d }))}</span>
                  <h1>${esc(L.tittel)}</h1>
                  ${ny ? `<p class="jk-fikk">${esc(R.t("Du fikk et klistremerke!"))}</p>` : ""}
                </div>
              </div>
              ${nisseHtml(S, d, true)}
              ${stegNav(s, i)}
              <section class="jk-kort jk-kort-${na}" aria-label="${esc(STEG[na].tittel)}">${innholdHtml(S, d, L, na)}</section>
              <aside class="jk-sidetre" aria-hidden="true">${na === "pynt" ? "" : M.treSvg(ferdige, { id: "jk-side" })}</aside>
            </div>
            ${lukeDokk(S, d, L, s, i)}`;
        },
        ut(S) {
          S.nytt = 0;
        },
      },

      tre: {
        tittel: () => R.t("Juletreet vårt"),
        tilbake: "hjem",
        inn(S) {
          if (antallPynt(S) === 24 && !S.feiret) {
            S.feiret = true;
            R.konfetti();
            R.lyd.fanfare();
          }
        },
        etter(S) {
          settModus(S);
        },
        vis(S) {
          const ferdige = M.pynt(S.luker);
          const n = ferdige.length;
          const f = fase();
          return `
            <div class="jk-treside">
              <h1>${esc(R.t("Juletreet vårt"))}</h1>
              <p class="jk-tre-aar">${esc(R.t("Julekalenderen {aar}", { aar: S.sesong || f.sesong }))}</p>
              <div class="jk-stortre">${M.treSvg(ferdige, { id: "jk-stor", etikett: treEtikett(n) })}</div>
              <p class="jk-sporsmal jk-midt">${esc(n === 24 ? R.t("Hele treet er pyntet! God jul!") : n ? R.t("{n} av 24 pynt – sammen", { n }) : R.t("Treet venter på den første pynten."))}</p>
              <p class="hjelp jk-midt jk-ikke-utskrift">${esc(R.t("Bildet lages her på mobilen. Ingen navn er med."))}</p>
            </div>
            ${R.ui.dokk(
              R.ui.knapp(R.t("Last ned bildet"), "last-ned", { ikon: "⬇️", variant: "lampe" }),
              R.ui.lenkerad(R.ui.lenke(R.t("Del bildet"), "del-bilde"), R.ui.lenke(R.t("Skriv ut"), "skriv-ut-tre"), R.ui.lenke(R.t("Til kalenderen"), "hjem")),
            )}`;
        },
      },

      utskrift: {
        tittel: () => R.t("Papirkalenderen"),
        tilbake: "hjem",
        etter(S) {
          settModus(S);
        },
        vis(S) {
          return `
            <div class="jk-utskrift-intro">
              <h1>${esc(R.t("Papirkalenderen"))}</h1>
              <p>${esc(R.t("Skriv ut på A4 og heng den på kjøleskapet eller i klasserommet. Hver luke har en QR-kode som åpner akkurat den luka."))}</p>
            </div>
            ${arkHtml(S)}
            ${R.ui.dokk(R.ui.knapp(R.t("Skriv ut"), "skriv-ut-ark", { ikon: "🖨️", variant: "lampe" }), R.ui.lenkerad(R.ui.lenke(R.t("Til kalenderen"), "hjem")))}`;
        },
      },
    },

    // rusj.no/julekalenderen/#dagens (the front page's «I dag») opens today's door in December;
    // #luke-7 (a share, a QR code, a reminder) opens door 7 – or says when it opens.
    vedHash(S, hash) {
      const h = String(hash).trim().toLowerCase();
      const f = fase();
      const d = h === "dagens" ? (f.fase === "aktiv" ? f.dag : 0) : M.lesLuke(h);
      if (h !== "dagens" && !d) return null;
      if (!d) return "hjem";
      if (!M.kanApnes(d, f)) {
        S.lastLuke = d;
        return "hjem";
      }
      apneTilstand(S, d);
      if (S.gruppe) return "luke";
      S.etter = "luke";
      return "oppsett";
    },

    handlinger: (H = {
      luke(el, e, S) {
        return apne(S, Number(el.dataset.v), el);
      },
      dagens(el, e, S) {
        const f = fase();
        if (f.fase !== "aktiv") return;
        const dor = document.querySelector(`.jk-luke[data-v="${f.dag}"]`);
        return apne(S, f.dag, S.luker[f.dag] ? null : dor);
      },
      hjem() {
        R.gaTil("hjem");
      },
      oppsett(el, e, S) {
        if (!S.etter) S.etter = S.skjerm === "luke" ? "luke" : "hjem";
        R.gaTil("oppsett");
      },
      gruppe(el, e, S) {
        if (!M.GRUPPER.includes(el.dataset.v)) return;
        S.utkast = el.dataset.v;
        R.lyd.klikk();
        R.vis();
      },
      start(el, e, S) {
        S.gruppe = M.GRUPPER.includes(S.utkast) ? S.utkast : S.gruppe || "familie";
        delete S.utkast;
        if (!S.nisseValgt) {
          S.nisseStart = R.heltall(0, 19);
          S.nisseValgt = true;
        }
        R.lagreFelles();
        R.statistikk("oppsett", { gruppe: S.gruppe, navn: navnene(S).length });
        const til = S.etter === "luke" && S.aktiv && S.luker[S.aktiv] ? "luke" : "hjem";
        delete S.etter;
        R.gaTil(til);
      },
      steg(el, e, S) {
        const l = S.luker[S.aktiv];
        if (!l) return;
        l.steg = Number(el.dataset.v) || 0;
        R.lyd.klikk();
        R.vis();
        window.scrollTo(0, 0);
      },
      neste(el, e, S) {
        const l = S.luker[S.aktiv];
        if (!l) return;
        const s = M.steg(luke(S, S.aktiv));
        l.steg = Math.min(s.length - 1, (l.steg || 0) + 1);
        R.lyd.sveip();
        R.vis();
        window.scrollTo(0, 0);
      },
      "bytt-nisse"(el, e, S) {
        const l = S.luker[S.aktiv];
        if (!l) return;
        l.bytt = ((l.bytt || 0) + 1) % 1000;
        R.lyd.pop();
        R.vis();
        const i = dagensNisse(S, S.aktiv);
        if (i != null) R.si(R.t("Dagens nisse: {navn}", { navn: R.navn(i) }));
      },
      "vis-svar"(el, e, S) {
        const d = S.aktiv;
        const L = luke(S, d);
        const l = S.luker[d];
        if (!l) return;
        if (L.storquiz) {
          l.quiz = l.quiz || { i: 0, rett: [], vist: false };
          l.quiz.vist = true;
        } else l.vist = true;
        R.lyd.snu();
        R.vis();
      },
      "quiz-svar"(el, e, S) {
        const l = S.luker[S.aktiv];
        if (!l || !l.quiz || !l.quiz.vist) return;
        const q = l.quiz;
        if (el.dataset.v === "1") {
          q.rett.push(q.i);
          R.lyd.riktig();
          R.vibrer(20);
        } else R.lyd.pling();
        q.i += 1;
        q.vist = false;
        if (q.i >= M.storquiz(LUKER).length) {
          if (q.rett.length >= q.i * 0.6) {
            R.lyd.fanfare();
            R.konfetti();
          } else R.lyd.takk();
        }
        R.vis();
      },
      "quiz-angre"(el, e, S) {
        const l = S.luker[S.aktiv];
        if (!l || !l.quiz || l.quiz.i < 1) return;
        const q = l.quiz;
        q.i -= 1;
        q.rett = q.rett.filter((x) => x !== q.i);
        q.vist = true;
        R.vis();
      },
      pynt(el, e, S) {
        const d = S.aktiv;
        const l = S.luker[d];
        if (!l || l.ferdig) return;
        l.ferdig = true;
        l.nyPynt = true;
        const n = antallPynt(S);
        R.statistikk("ferdig", { luke: d, gruppe: S.gruppe || "familie" });
        meldFerdig(S);
        if (n >= 10) R.merke("luke-10");
        if (n === 24) R.merke("luke-tre");
        if (dagensNisse(S, d) != null) R.merke("luke-nisse");
        if (n === 24 || d === 24) {
          R.lyd.fanfare();
          R.konfetti();
        } else R.lyd.takk();
        R.vibrer([20, 40, 30]);
        R.vis();
      },
      "del-luke"(el, e, S) {
        const d = S.aktiv;
        if (!d) return;
        const n = antallPynt(S);
        const L = luke(S, d);
        return R.del(R.t("Julekalenderen"), R.t("Vi åpnet luke {n} i julekalenderen på rusj.no! Åpne den sammen dere også:", { n: d }), M.lukeAdresse(BASE, R.sprak, d), {
          kort: { tittel: R.t("Vi åpnet luke {n}!", { n: d }), linjer: [R.t("{n} av 24", { n }), R.t("pynt på juletreet vårt"), L.tittel] },
        });
      },
      del() {
        return R.del(R.t("Julekalenderen"), R.t("24 stunder sammen i desember: kos, prat og spill bak hver luke. Gratis julekalender for familie, venner og klassen."), BASE);
      },
      tre() {
        R.gaTil("tre");
      },
      utskrift() {
        R.gaTil("utskrift");
      },
      "skriv-ut-ark"() {
        skrivUt("kalender");
      },
      "skriv-ut-tre"() {
        skrivUt("tre");
      },
      paminnelse(el, e, S) {
        const f = fase();
        if (f.fase === "etter") return;
        const fra = f.fase === "aktiv" ? f.dag : 1;
        const aar = f.sesong;
        const tekst = M.ics({
          sesong: aar,
          fra,
          sone: R.tidssone,
          sprak: R.sprak,
          stamp: stempel(),
          navn: R.t("Julekalenderen"),
          tittel: (d) => `🎄 ${R.t("Luke {n}", { n: d })}: ${LUKER[d - 1].tittel}`,
          tekst: () => R.t("Tid for dagens luke: kos, prat og et spill sammen."),
          url: (d) => M.lukeAdresse(BASE, R.sprak, d),
        });
        lastNed(new Blob([tekst], { type: "text/calendar;charset=utf-8" }), R.t("julekalenderen-{aar}.ics", { aar }));
        R.statistikk("jul.paminnelse", { fra });
        R.toast(R.t("Påminnelsene er lastet ned. Åpne fila for å legge dem i kalenderen."));
      },
      async "last-ned"(el, e, S) {
        if (opptatt) return;
        opptatt = true;
        const fortsatt = R.vakt();
        try {
          const blob = await trebilde(S);
          if (!fortsatt() || !blob) return;
          lastNed(blob, bildenavn(S));
          R.statistikk("jul.tre", { pynt: antallPynt(S) });
          R.toast(R.t("Bildet er lastet ned"));
        } catch (feil) {
          R.toast(R.t("Klarte ikke å lage bildet"));
        } finally {
          opptatt = false;
        }
      },
      async "del-bilde"(el, e, S) {
        if (opptatt) return;
        opptatt = true;
        const fortsatt = R.vakt();
        try {
          const blob = await trebilde(S);
          if (!fortsatt() || !blob) return;
          R.statistikk("jul.tre", { pynt: antallPynt(S), del: true });
          const fil = typeof File === "function" ? new File([blob], bildenavn(S), { type: "image/png" }) : null;
          const tekst = R.t("Juletreet vårt fra julekalenderen på rusj.no 🎄");
          if (fil && navigator.canShare && navigator.canShare({ files: [fil] })) {
            try {
              await navigator.share({ files: [fil], title: R.t("Juletreet vårt"), text: tekst + "\n" + BASE });
            } catch (feil) {
              if (feil && feil.name !== "AbortError") lastNed(blob, bildenavn(S));
            }
          } else {
            lastNed(blob, bildenavn(S));
            R.toast(R.t("Bildet er lastet ned"));
          }
        } catch (feil) {
          R.toast(R.t("Klarte ikke å lage bildet"));
        } finally {
          opptatt = false;
        }
      },
    }),
  });
})();
