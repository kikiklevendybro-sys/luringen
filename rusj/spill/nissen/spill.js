/* Nissen — "Nissetrekning" (Secret Santa).
   Everyone gets one person to give a present to, and nobody draws themselves. The draw is one
   big ring (a single cycle, Sattolo's shuffle). Two ways to draw:
   - one phone passed around the table (hold-to-reveal cards), or
   - each on their own phone: the host sends every person a link of their own. A personal link
     carries only that person's name, whom they give to, the budget and the date – never the
     draw itself – so nobody can work out the others from their link. Nothing is sent via us.
     The link is one scrambled token, so names can't be read off it at a glance. That is not
     encryption: whoever has a link can open it (and the host has them all).
   «Ikke trekk hverandre» pairs are honoured by choosing a seed whose ring avoids them.
   Personal links must keep working for weeks: they are made and read with Nissen's own frozen
   helpers below (not the kit's, which may change), and never depend on the content files. */
(function () {
  "use strict";

  const R = window.Rusj;
  const D = window.RUSJ_DATA;
  const esc = R.esc;
  let H; // the actions, so one action can reuse another

  // The "install as an app" tip at a calm moment – only if the player is still on this screen.
  // (The kit shows it after R.kveld.registrer; games without an evening score call it here.)
  function visTipsSnart() {
    const fortsatt = R.vakt();
    setTimeout(() => fortsatt() && R.visInstallTips(), 2500);
  }

  const MIN = 3;
  const MAKS = 30;
  const MAKS_NAVN = 16;
  const MAKS_PAR = 15;
  // Every text goes through R.t (rusj/SPRAK.md): the key is the Norwegian text.
  // The budget steps in the edition's own money – round amounts people actually use, not converted
  // kroner – and the top of the small, middle, medium and big gift-idea bands.
  const PENGER = {
    nb: { trinn: [0, 50, 100, 150, 200, 250, 300, 400, 500, 750, 1000], band: [100, 200, 300, 500] },
    en: { trinn: [0, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100], band: [10, 20, 30, 50] },
    da: { trinn: [0, 50, 75, 100, 150, 200, 250, 300, 400, 500, 750], band: [75, 150, 250, 400] },
  };
  const BUDSJETT = (PENGER[R.sprak] || PENGER.nb).trinn;
  const BAND_TOPP = (PENGER[R.sprak] || PENGER.nb).band;
  const STANDARD_BUDSJETT = 4; // 200 kr (£20, 150 kr in Denmark)
  const HOLD = R.t("Hold fingeren på kortet for å se");
  const range = (n) => Array.from({ length: n }, (_, i) => i);

  // Never part of a name: control characters, characters that can't be seen (zero width, blank
  // look-alikes) and the ones that turn the reading direction – they could hide or reorder the text
  // on a card, and "Kari" plus something invisible would count as another person. U+200C and
  // U+200D stay inside a name: joined emoji (a family, Mx Claus) need them.
  const USYNLIG = /[\u0000-\u0008\u000e-\u001f\u007f-\u009f\u00ad\u061c\u115f\u1160\u180e\u200b\u200e\u200f\u202a-\u202e\u2060-\u206f\u2800\u3164\ufeff\uffa0\ufff9-\ufffc]/g;
  // A name as it is kept: composed letters (NFC), nothing invisible, no half emoji, single spaces.
  const ren = (s) =>
    String(s == null ? "" : s)
      .normalize("NFC")
      .replace(USYNLIG, "")
      .replace(/[\ud800-\udfff]/gu, "")
      .replace(/\s+/g, " ")
      .replace(/^[ \u200c\u200d]+|[ \u200c\u200d]+$/g, "");
  const nokkel = (s) => ren(s).toLocaleLowerCase("nb");

  // At most `n` characters (code points) – and never half an emoji: where the browser can tell
  // whole characters (graphemes) apart, the cut is made between them. Counting code points keeps
  // the limit the same in every browser, which the links depend on.
  let segmenter = null;
  function kutt(tekst, n) {
    const s = String(tekst == null ? "" : tekst).replace(/[\ud800-\udfff]/gu, "");
    if (s.length <= n) return s;
    let biter;
    try {
      segmenter = segmenter || new Intl.Segmenter("nb", { granularity: "grapheme" });
      biter = Array.from(segmenter.segment(s), (x) => x.segment);
    } catch (e) {
      biter = Array.from(s);
    }
    let ut = "";
    let antall = 0;
    for (const b of biter) {
      antall += Array.from(b).length;
      if (antall > n) break;
      ut += b;
    }
    return ut;
  }
  // A typed name → the name used in the draw.
  const rentNavn = (s) => ren(kutt(ren(s), MAKS_NAVN));

  // The kit may cut or decode what it hands vedHash; a personal link is read whole and untouched
  // here first (this listener is added before the kit's own).
  let raHash = "";
  try {
    raHash = (window.location && window.location.hash ? window.location.hash : "").slice(1);
    window.addEventListener("hashchange", () => {
      raHash = (location.hash || "").slice(1);
    });
  } catch (e) {
    raHash = "";
  }

  // ---------- Frozen helpers (never change these: saved draws and sent links depend on them) ----------

  const ALFABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  function fnv(tekst) {
    let h = 0x811c9dc5;
    for (let i = 0; i < tekst.length; i++) {
      h ^= tekst.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }
  function bland(h) {
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h >>> 0;
  }
  function tilfeldig(fro) {
    let a = fro >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- The draw ----------

  const FRO_ANTALL = 2 ** 22;

  // Who gives to whom: mottaker[i] is the person i gives a present to. Sattolo's shuffle gives a
  // uniformly random single cycle, so nobody draws themselves and the ring goes through everyone.
  function trekk(n, fro) {
    const t = tilfeldig(fnv("nissen:" + n + ":" + fro));
    const a = range(n);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(t() * i);
      const x = a[i];
      a[i] = a[j];
      a[j] = x;
    }
    return a;
  }

  const holder = (mottaker, par) => par.every(([x, y]) => mottaker[x] !== y && mottaker[y] !== x);

  // One ring through everybody, nobody giving to themselves.
  function erRing(m, n) {
    if (!Array.isArray(m) || m.length !== n || new Set(m).size !== n || !m.every((x, i) => Number.isInteger(x) && x >= 0 && x < n && x !== i)) return false;
    let i = 0;
    let steg = 0;
    do {
      i = m[i];
      steg += 1;
    } while (i !== 0 && steg <= n);
    return steg === n;
  }

  // Can a ring avoid every pair at all? (A Hamiltonian cycle in the "allowed" graph.) Backtracking
  // with a step limit: true, false, or null when it gave up (only with absurd numbers of pairs).
  function muligRing(n, par, maksSteg) {
    const lov = range(n).map((i) => range(n).map((j) => i !== j));
    for (const [x, y] of par) {
      if (x < n && y < n) {
        lov[x][y] = false;
        lov[y][x] = false;
      }
    }
    if (lov.some((rad) => rad.filter(Boolean).length < 2)) return false;
    const brukt = range(n).map((i) => i === 0);
    const grense = maksSteg || 200000;
    let steg = 0;
    let avbrutt = false;
    const dfs = (sist, lengde) => {
      if (lengde === n) return lov[sist][0];
      if (++steg > grense) {
        avbrutt = true;
        return false;
      }
      for (let j = 1; j < n; j++) {
        if (brukt[j] || !lov[sist][j]) continue;
        brukt[j] = true;
        if (dfs(j, lengde + 1)) return true;
        brukt[j] = false;
        if (avbrutt) return false;
      }
      return false;
    };
    return dfs(0, 1) ? true : avbrutt ? null : false;
  }

  // The first seed from `start` whose ring honours every pair (-1 if none within the limit).
  function finnFro(n, par, start, maks) {
    const grense = Math.min(maks || 400000, FRO_ANTALL);
    for (let k = 0; k < grense; k++) {
      const fro = (((start + k) % FRO_ANTALL) + FRO_ANTALL) % FRO_ANTALL;
      if (holder(trekk(n, fro), par)) return fro;
    }
    return -1;
  }

  // The ring in reveal order: who was the Secret Santa of `start`, then of that person, and so on.
  function kjede(mottaker, start) {
    const giver = [];
    mottaker.forEach((m, i) => (giver[m] = i));
    const rekke = [];
    let r = start || 0;
    for (let k = 0; k < mottaker.length; k++) {
      rekke.push({ mottaker: r, giver: giver[r] });
      r = giver[r];
    }
    return rekke;
  }

  // ---------- Dates ----------

  const DAGER = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  // Dates are kept as month * 32 + day (0 = no date).
  const datoGyldig = (d) => d === 0 || (Math.floor(d / 32) >= 1 && Math.floor(d / 32) <= 12 && d % 32 >= 1 && d % 32 <= DAGER[Math.floor(d / 32) - 1]);
  const datoTall = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    return m ? Number(m[2]) * 32 + Number(m[3]) : 0;
  };
  // The coming gift day as a Date: the year is this one, unless the date is long gone (> 45 days).
  function dagFor(d, idag) {
    const na = idag || new Date();
    let ar = na.getFullYear();
    if (new Date(ar, Math.floor(d / 32) - 1, d % 32) < new Date(ar, na.getMonth(), na.getDate() - 45)) ar += 1;
    return new Date(ar, Math.floor(d / 32) - 1, d % 32);
  }
  // "fredag 19. desember"
  const datoTekst = (d, idag) => (d ? dagFor(d, idag).toLocaleDateString(R.lokale, { weekday: "long", day: "numeric", month: "long" }) : "");
  // Whole days from today to the gift day (negative when it has been).
  function dagerTil(d, idag) {
    const na = idag || new Date();
    const i0 = Date.UTC(na.getFullYear(), na.getMonth(), na.getDate());
    const dag = dagFor(d, na);
    return Math.round((Date.UTC(dag.getFullYear(), dag.getMonth(), dag.getDate()) - i0) / 86400000);
  }
  function nedtelling(d, idag) {
    if (!d) return "";
    const n = dagerTil(d, idag);
    return n > 1 ? R.t("{n} dager til gavedagen", { n }) : n === 1 ? R.t("Gavedag i morgen!") : n === 0 ? R.t("Gavedag i dag! 🎁") : "";
  }
  // The chain may be revealed from the gift day on (always, when no day was set).
  const gavedagNadd = (sp) => !sp.dato || dagerTil(sp.dato) <= 0;

  // ---------- Personal links (format 2) ----------
  // …/nissen/#2K7Q…: one token – "2" (the format), then the bytes below written five bits per
  // character with ALFABET (digits and capital letters only, so chat apps and QR scanners leave
  // the link alone).
  //   4 bytes  the check: a hash of everything after it, as it is before the scrambling. A link
  //            that was cut off or changed on the way is refused. The check also seeds the
  //            scrambling, so every link looks different from all the others.
  //   6 bytes  the draw's id (25 bits – so a phone can tell draws apart), the budget in kroner
  //            (14 bits) and the gift day (month 4 bits, day 5 bits; 0 = none)
  //   1 byte   how many bytes the giver's name takes
  //   …        the giver's name, then the receiver's name (UTF-8)
  // Everything after the check is XOR-ed with numbers drawn from the check. That keeps the names
  // from being read off a link – in a chat preview, over a shoulder, in the address bar. It is NOT
  // encryption: whoever has a link can open it, and anybody can write one (no server, no secret).
  // So the reader takes only what the game itself could have written, and a phone that already
  // holds a card asks before it takes a new one (vedHash).
  // Frozen from the day it is live: a change here needs a new format number, and "2" must still
  // be read. The name rules (ren, kutt, MAKS_NAVN) may only ever get looser.

  const KR_MAKS = 10000;
  const ID_FORM = /^[0-9A-HJKMNP-TV-Z]{5}$/;
  // "2", then 4 + 6 + 1 bytes and two names of at most MAKS_NAVN characters (four bytes each)
  const MAKS_LENKE = 1 + Math.ceil(((11 + 8 * MAKS_NAVN) * 8) / 5);

  function utf8(tekst) {
    const ut = [];
    for (const c of String(tekst)) {
      const k = c.codePointAt(0);
      if (k < 0x80) ut.push(k);
      else if (k < 0x800) ut.push(0xc0 | (k >> 6), 0x80 | (k & 63));
      else if (k < 0x10000) ut.push(0xe0 | (k >> 12), 0x80 | ((k >> 6) & 63), 0x80 | (k & 63));
      else ut.push(0xf0 | (k >> 18), 0x80 | ((k >> 12) & 63), 0x80 | ((k >> 6) & 63), 0x80 | (k & 63));
    }
    return ut;
  }

  // Bytes → text, strictly: null unless they are valid UTF-8 in its shortest form.
  function fraUtf8(bytes) {
    let ut = "";
    let i = 0;
    while (i < bytes.length) {
      const a = bytes[i++];
      const n = a < 0x80 ? 0 : a < 0xc0 ? -1 : a < 0xe0 ? 1 : a < 0xf0 ? 2 : a < 0xf8 ? 3 : -1;
      if (n < 0 || i + n > bytes.length) return null;
      let k = n ? a & (0x3f >> n) : a;
      for (let j = 0; j < n; j++) {
        const b = bytes[i++];
        if ((b & 0xc0) !== 0x80) return null;
        k = (k << 6) | (b & 63);
      }
      if (k < [0, 0x80, 0x800, 0x10000][n] || k > 0x10ffff || (k >= 0xd800 && k <= 0xdfff)) return null;
      ut += String.fromCodePoint(k);
    }
    return ut;
  }

  // Bytes ⇄ characters, five bits each (the last character is filled up with zero bits).
  function tilTegn(bytes) {
    let ut = "";
    let rest = 0;
    let bits = 0;
    for (const b of bytes) {
      rest = (rest << 8) | b;
      bits += 8;
      while (bits >= 5) {
        bits -= 5;
        ut += ALFABET[(rest >> bits) & 31];
      }
      rest &= (1 << bits) - 1;
    }
    return bits ? ut + ALFABET[(rest << (5 - bits)) & 31] : ut;
  }
  function fraTegn(tekst) {
    const ut = [];
    let rest = 0;
    let bits = 0;
    for (const c of tekst) {
      const v = ALFABET.indexOf(c);
      if (v < 0) return null;
      rest = (rest << 5) | v;
      bits += 5;
      if (bits >= 8) {
        bits -= 8;
        ut.push((rest >> bits) & 255);
        rest &= (1 << bits) - 1;
      }
    }
    return ut;
  }

  function sjekkAv(bytes) {
    let h = fnv("nissen-lenke-2:");
    for (const b of bytes) {
      h ^= b;
      h = Math.imul(h, 0x01000193);
    }
    return bland(h >>> 0);
  }
  // Scrambles and unscrambles (XOR with the same numbers gives the bytes back).
  function slor(bytes, sjekk) {
    const t = tilfeldig(fnv("nissen-slor:" + sjekk));
    return bytes.map((b) => b ^ Math.floor(t() * 256));
  }

  const nyId = () => {
    let h = R.nyttFro();
    let ut = "";
    for (let k = 0; k < 5; k++) {
      ut += ALFABET[h & 31];
      h >>>= 5;
    }
    return ut;
  };

  // { id, kr, dato, navn, mottaker } → the part after # ("" when it can't be written)
  function lagPersonlig(o) {
    const kr = o.kr || 0;
    const dato = o.dato || 0;
    if (!ID_FORM.test(o.id) || !Number.isInteger(kr) || kr < 0 || kr > KR_MAKS || !Number.isInteger(dato) || dato < 0 || !datoGyldig(dato)) return "";
    let id = 0;
    for (const c of String(o.id)) id = id * 32 + ALFABET.indexOf(c);
    const hoy = id * 128 + (kr >> 7); // 32 bits: the id and the top seven bits of the budget
    const lav = ((kr & 127) << 9) | dato; // 16 bits: the rest of the budget, the month and the day
    const giver = utf8(o.navn);
    if (giver.length > 255) return "";
    const data = [hoy >>> 24, (hoy >>> 16) & 255, (hoy >>> 8) & 255, hoy & 255, lav >> 8, lav & 255, giver.length, ...giver, ...utf8(o.mottaker)];
    const sjekk = sjekkAv(data);
    return "2" + tilTegn([sjekk >>> 24, (sjekk >>> 16) & 255, (sjekk >>> 8) & 255, sjekk & 255, ...slor(data, sjekk)]);
  }

  // A name out of a link: only one the name field itself could have given (so no long texts, no
  // invisible characters, nothing that turns the reading direction).
  function lesNavn(bytes) {
    const ra = fraUtf8(bytes);
    if (!ra) return null;
    const navn = rentNavn(ra);
    return navn && navn === ra.normalize("NFC") ? navn : null;
  }

  // The part after # → { id, kr, dato, navn, mottaker }, or null when it isn't a whole, valid link.
  function lesPersonlig(hash) {
    const tekst = String(hash == null ? "" : hash).toUpperCase();
    if (tekst[0] !== "2" || tekst.length > MAKS_LENKE) return null;
    const bytes = fraTegn(tekst.slice(1));
    // At least 13 bytes: the check, id/budget/day, the length and two names of one byte each
    if (!bytes || bytes.length < 13 || "2" + tilTegn(bytes) !== tekst) return null;
    const sjekk = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
    const data = slor(bytes.slice(4), sjekk);
    if (sjekkAv(data) !== sjekk) return null;
    const hoy = ((data[0] << 24) | (data[1] << 16) | (data[2] << 8) | data[3]) >>> 0;
    const lav = (data[4] << 8) | data[5];
    const kr = ((hoy & 127) << 7) | (lav >> 9);
    const dato = lav & 511;
    if (kr > KR_MAKS || !datoGyldig(dato)) return null;
    let id = "";
    for (let k = 4; k >= 0; k--) id += ALFABET[(hoy >>> (7 + 5 * k)) & 31];
    const navn = lesNavn(data.slice(7, 7 + data[6]));
    const mottaker = lesNavn(data.slice(7 + data[6]));
    if (!navn || !mottaker || nokkel(navn) === nokkel(mottaker)) return null;
    return { id, kr, dato, navn, mottaker };
  }

  // The same card? (A card kept on the phone has more on it than the link holds: «vert».)
  const likt = (a, b) => !!a && !!b && a.id === b.id && a.kr === b.kr && a.dato === b.dato && a.navn === b.navn && a.mottaker === b.mottaker;
  // Can a link carry this name there and back?
  const navnHolder = (x) => {
    const o = { id: "00000", kr: 0, dato: 0, navn: x, mottaker: nokkel(x) === "a" ? "b" : "a" };
    return likt(lesPersonlig(lagPersonlig(o)), o);
  };

  const lenkeTil = (fragment) => location.origin + location.pathname + "#" + fragment;
  const personlig = (sp, i) => ({ id: sp.id, kr: BUDSJETT[sp.budsjett], dato: sp.dato, navn: sp.navn[i], mottaker: sp.navn[sp.mottaker[i]] });
  const personligLenke = (sp, i) => lenkeTil(lagPersonlig(personlig(sp, i)));

  function qrSvg(tekst) {
    const Q = window.LuringenQr;
    if (!Q || !/^https?:$/.test(location.protocol)) return "";
    for (const niva of ["M", "L"]) {
      try {
        return Q.qrSvg(Q.lagQr(tekst, niva), { mork: "var(--blekk)", lys: "var(--papir)", etikett: R.t("QR-kode med en personlig lenke") });
      } catch (e) {
        /* too long at this level */
      }
    }
    return "";
  }

  // ---------- Small helpers ----------

  const kroner = (kr) => (kr ? R.t("{belop} kr", { belop: R.tall(kr) }) : "");
  // A translated sentence with markup in its gaps (R.t with "{navn}" left in): the text is escaped,
  // then the markup goes in where the gap is.
  const tMed = (tekst, html) => Object.entries(html).reduce((s, [k, v]) => s.split(`{${k}}`).join(v), esc(tekst));
  const belop = (b) => kroner(BUDSJETT[b]);

  function piller(kr, dato) {
    const deler = [kr ? `💰 ${kroner(kr)}` : "", dato ? `📅 ${datoTekst(dato)}` : ""];
    return `<div class="ni-piller">${deler.filter(Boolean).map((t) => `<span>${esc(t)}</span>`).join("")}</div>`;
  }

  // Big names shrink a little when one word is long, so they never break mid-word.
  function navnKlasse(navn) {
    const lengste = Math.max(...String(navn).split(/\s+/).map((d) => d.length));
    return lengste >= 14 ? "ni-navn-xl" : lengste >= 11 ? "ni-navn-l" : "";
  }
  // An avatar for someone known only by name (a personal link): the same animal every time.
  const navneAvatar = (navn, storrelse) => R.avatar(fnv(nokkel(navn)) % 20, storrelse);

  // ---------- Gift ideas ----------

  const BAND = ["liten", "mellom", "middels", "stor", "raus"];
  const IDEER = D.ideer;
  const ANTALL_IDEER = BAND.reduce((s, b) => s + IDEER[b].length, 0);
  const bandFor = (kr) => (!kr ? null : kr <= BAND_TOPP[0] ? "liten" : kr <= BAND_TOPP[1] ? "mellom" : kr <= BAND_TOPP[2] ? "middels" : kr <= BAND_TOPP[3] ? "stor" : "raus");
  const stokker = {};
  function nesteIdeer(kr, antall) {
    const band = bandFor(kr);
    const liste = band ? IDEER[band] : [...IDEER.mellom, ...IDEER.middels];
    const id = band || "uten";
    if (!stokker[id]) stokker[id] = R.kortstokk("ideer-" + id, liste.length);
    const ut = [];
    for (let k = 0; k < antall; k++) {
      const i = stokker[id].neste((x) => !ut.includes(x));
      if (i >= 0) ut.push(i);
    }
    return ut.map((i) => liste[i]);
  }

  function visIdeer(kr) {
    R.ark(`
      <h2 id="ark-tittel">${esc(kr ? R.t("Gaveideer for {belop}", { belop: kroner(kr) }) : R.t("Gaveideer"))}</h2>
      <ul class="ni-ideer" id="ni-ideer">${nesteIdeer(kr, 3)
        .map((t) => `<li>${esc(t)}</li>`)
        .join("")}</ul>
      <p class="hjelp">${esc(R.t("Det er tanken som teller – ikke prisen."))}</p>
      <div class="knapprad">
        ${R.ui.knapp2(R.t("Tre nye"), "ideer-nye", { v: String(kr || 0), ikon: "🎲" })}
        ${R.ui.knapp(R.t("Takk!"), "lukk-ark")}
      </div>`);
  }

  // ---------- Christmas: snow and bells ----------

  function sno() {
    const scene = document.querySelector(".scene");
    if (!scene || scene.querySelector(".ni-sno")) return;
    const t = tilfeldig(7);
    const fnugg = range(34)
      .map(() => {
        const s = 3 + Math.floor(t() * 5);
        return `<i style="left:${(t() * 100).toFixed(1)}%;width:${s}px;height:${s}px;animation-duration:${(9 + t() * 9).toFixed(1)}s;animation-delay:-${(t() * 18).toFixed(1)}s;--drift:${Math.round(t() * 60 - 30)}px;opacity:${(0.35 + t() * 0.5).toFixed(2)}"></i>`;
      })
      .join("");
    scene.insertAdjacentHTML("beforeend", `<div class="ni-sno">${fnugg}</div>`);
  }

  function bjeller() {
    const L = R.lyd;
    [0, 0.09, 0.18, 0.3, 0.38].forEach((t, i) => L.stoy(t, 0.07, 0.07 - i * 0.008, 7200, "highpass"));
    L.tone(1318.5, 0.02, 0.9, "sine", 0.1);
    L.tone(2637, 0.02, 0.45, "sine", 0.035);
    L.tone(1975.5, 0.22, 0.8, "sine", 0.07);
    L.tone(3951, 0.22, 0.3, "triangle", 0.02);
  }

  // ---------- Cards ----------

  // The back of a hold-to-reveal card. The text sits on a plate, so the ribbon never crosses it.
  function kortHtml(mottaker, kr, dato) {
    const linjer = [kr ? "💰 " + R.t("Budsjett {belop}", { belop: kroner(kr) }) : "", dato ? "📅 " + R.t("Gavedag {dato}", { dato: datoTekst(dato) }) : ""].filter(Boolean);
    return {
      klasse: "ni-kort",
      html: `
        <span class="ni-kort-gave" aria-hidden="true">🎁</span>
        <span class="ni-kort-plate">
          <span class="kort-etikett">${esc(R.t("Du skal gi gave til"))}</span>
          <span class="kort-ord ${R.lengdeKlasse(mottaker)}" data-mottaker="${esc(mottaker)}">${esc(mottaker)}</span>
          ${linjer.length ? `<span class="ni-kort-info">${linjer.map(esc).join("<br>")}</span>` : ""}
          <span class="kort-fot">${esc(R.t("Hysj! Ikke si det til noen."))}</span>
        </span>`,
    };
  }

  const kortFor = (sp, i) => kortHtml(sp.navn[sp.mottaker[i]], BUDSJETT[sp.budsjett], sp.dato);

  // «Glemt hvem du skal gi til?» (one phone only): pick a name, then hold to see.
  async function glemt(S) {
    const sp = S.spill;
    const fortsatt = R.vakt();
    const i = await R.velgIArk(
      R.t("Hvem vil se kortet sitt?"),
      range(sp.n).map((n) => ({ v: n, tekst: sp.navn[n] })),
    );
    if (i == null || !fortsatt()) return;
    R.ark(`
      <h2 id="ark-tittel">${esc(R.t("Kortet til {navn}", { navn: sp.navn[i] }))}</h2>
      ${R.ui.mappe({ id: "glemt" + i, etikett: R.t("Topphemmelig"), tekst: HOLD, etikettAria: R.t("Hold fingeren på kortet for å se kortet til {navn}", { navn: sp.navn[i] }) })}
      <p class="hjelp">${esc(R.t("Bare {navn} skal se. Slipp for å skjule.", { navn: sp.navn[i] }))}</p>
      <button class="knapp" data-h="lukk-ark">${esc(R.t("Ferdig"))}</button>`);
  }

  // ---------- Setup ----------

  const STANDARD_OPPSETT = () => ({ modus: "en", budsjett: STANDARD_BUDSJETT, dato: "", par: [] });

  let ringSjekk = { nokkel: "", svar: true };
  function ringMulig(n, par) {
    const k = n + "|" + JSON.stringify(par);
    if (ringSjekk.nokkel !== k) ringSjekk = { nokkel: k, svar: par.length ? muligRing(n, par) : true };
    return ringSjekk.svar !== false;
  }

  // What stops the draw, in words (or "" when it is ready).
  function oppsettFeil(S) {
    const navn = S.navn.map(rentNavn);
    const tomme = navn.filter((x) => !x).length;
    if (tomme) return tomme === 1 ? "Ett navn mangler." : `${tomme} navn mangler.`;
    const sett = new Map();
    for (const x of navn) {
      if (sett.has(nokkel(x))) return R.t("To heter «{navn}». Skriv for eksempel «{navn} B.»", { navn: x });
      sett.set(nokkel(x), true);
      // Every name must survive the trip through a link, or two people would get one that won't open.
      if (!navnHolder(x)) return R.t("Navnet «{navn}» kan ikke brukes. Prøv uten spesialtegn.", { navn: x });
    }
    if (!ringMulig(navn.length, S.oppsett.par)) return R.t("Det går ikke å trekke med alle disse parene. Fjern ett av dem.");
    return "";
  }

  // Typing a name must not redraw the screen (the keyboard would jump); only the message changes.
  function oppdaterFeil(S) {
    const feil = oppsettFeil(S);
    const boks = R.$("#ni-feil");
    if (boks) boks.textContent = feil;
    const knapp = R.$('#skjerm [data-h="start"]');
    if (knapp) knapp.disabled = !!feil;
  }

  function navnerader(S) {
    const n = S.navn.length;
    return S.navn
      .map(
        (navn, i) => `<div class="spiller" style="--pf: var(--p${(i % 20) + 1})">
          ${R.avatar(i)}
          <input id="ni-navn-${i}" data-felt="navn" data-i="${i}" value="${esc(navn)}" placeholder="${esc(R.t("Navn {n}", { n: i + 1 }))}" maxlength="${MAKS_NAVN}" autocomplete="off" autocapitalize="words" enterkeyhint="next" aria-label="${esc(R.t("Navn på person {n}", { n: i + 1 }))}">
          ${n > MIN ? `<button class="fjern" data-h="fjern" data-v="${i}" aria-label="${esc(R.t("Fjern {navn}", { navn: ren(navn) || R.t("person {n}", { n: i + 1 }) }))}">×</button>` : ""}
        </div>`,
      )
      .join("");
  }

  function parListe(S) {
    const par = S.oppsett.par;
    if (!par.length) return "";
    return `<ul class="ni-parliste">${par
      .map(([a, b], k) => {
        const na = ren(S.navn[a]) || R.t("Navn {n}", { n: a + 1 });
        const nb = ren(S.navn[b]) || R.t("Navn {n}", { n: b + 1 });
        return `<li class="ni-par"><span>${esc(na)}</span><span class="ni-par-pil" aria-label="${esc(R.t("og"))}">⇄</span><span>${esc(nb)}</span><button data-h="fjern-par" data-v="${k}" aria-label="${esc(R.t("Fjern paret {a} og {b}", { a: na, b: nb }))}">×</button></li>`;
      })
      .join("")}</ul>`;
  }

  let parValg = [];
  function visParArk(S) {
    parValg = [];
    R.ark(`
      <h2 id="ark-tittel">${esc(R.t("Hvem skal ikke trekke hverandre?"))}</h2>
      <p class="ingress">${esc(R.t("Velg to personer. De kan ikke trekke hverandre – verken den ene eller den andre veien."))}</p>
      <div class="velgere ni-parvelger">${S.navn
        .map((navn, i) => `<button class="velger" data-h="par-velg" data-v="${i}" aria-pressed="false">${R.avatar(i)}<span>${esc(ren(navn) || R.t("Navn {n}", { n: i + 1 }))}</span></button>`)
        .join("")}</div>
      <div class="knapprad">
        ${R.ui.knapp2(R.t("Avbryt"), "lukk-ark")}
        ${R.ui.knapp(R.t("Legg til"), "par-ok", { av: true, id: "ni-par-ok" })}
      </div>`);
  }

  // ---------- Game flow ----------

  // Ask the browser to keep what this site has stored: the draw must last until the gift day, and
  // Safari clears sites that go unvisited for a week. Chrome and Safari answer without asking the
  // player; Firefox would show a question, so it is left alone (it has no such weekly clearing).
  function beholdLager() {
    try {
      const lager = navigator.storage;
      if (lager && lager.persist && !/\bFirefox\//.test(navigator.userAgent || "")) lager.persist().catch(() => {});
    } catch (e) {
      /* not in this browser */
    }
  }

  // Is the draw really kept on this phone? (Storage can be full, or blocked in private browsing.)
  function erLagret(sp) {
    const lagret = R.les("nissen.v" + DEF.versjon, null);
    return !!(lagret && lagret.spill && lagret.spill.id === sp.id);
  }

  function startTrekning(S) {
    const navn = S.navn.map(rentNavn);
    const n = navn.length;
    const par = S.oppsett.par.map((p) => p.slice());
    const fro = finnFro(n, par, R.nyttFro() % FRO_ANTALL);
    if (fro < 0) {
      R.toast(R.t("Fant ingen trekning som passer med parene. Fjern ett av dem"));
      return;
    }
    const sp = {
      versjon: 2,
      id: nyId(),
      modus: S.oppsett.modus,
      n,
      navn,
      par,
      fro,
      // The whole draw is kept, so it never depends on code that might change later.
      mottaker: trekk(n, fro),
      budsjett: S.oppsett.budsjett,
      dato: datoTall(S.oppsett.dato),
      vis: { i: 0, sett: false },
      sendt: range(n).map(() => 0),
      avslort: 0,
      arets: null,
      ferdig: false,
      feiret: false,
      skjerm: null,
    };
    S.spill = sp;
    beholdLager();
    R.statistikk("start", { modus: sp.modus, antall: n, par: par.length, budsjett: BUDSJETT[sp.budsjett], dato: !!sp.dato });
    R.gaTil("trekk");
  }

  // Avoid two reveals from one quick double tap (the reveal waits for a drum roll).
  let avslorer = false;

  const SPILLSKJERMER = ["trekk", "vis", "klar", "del", "kaaring"];
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);

  // The small «Avslør nissekjeden» link: only from the gift day on, and always with a question.
  const avslorLenke = (sp) => (gavedagNadd(sp) ? R.ui.lenke(R.t("Avslør nissekjeden"), "til-kaaring") : "");

  function infoboks(sp) {
    const rader = [
      ["👥", R.t("{n} personer", { n: sp.n })],
      ["💰", belop(sp.budsjett) ? R.t("Budsjett {belop}", { belop: belop(sp.budsjett) }) : R.t("Fritt budsjett")],
      ["📅", sp.dato ? R.t("Gavedag {dato}", { dato: datoTekst(sp.dato) }) : R.t("Ingen gavedag satt")],
    ];
    if (sp.par.length) rader.push(["⇄", sp.par.length === 1 ? R.t("1 par trekker ikke hverandre") : R.t("{n} par trekker ikke hverandre", { n: sp.par.length })]);
    return `<ul class="papirboks ni-info">${rader.map(([ikon, tekst]) => `<li><span aria-hidden="true">${ikon}</span>${esc(tekst)}</li>`).join("")}</ul>`;
  }

  const nedtellingHtml = (dato) => (nedtelling(dato) ? `<p class="ni-nedtelling"><span aria-hidden="true">🎄</span> ${esc(nedtelling(dato))}</p>` : "");

  // The person sheet on the share screen: QR code, «Del» and «Kopier» for one person.
  function visPerson(S, i) {
    const sp = S.spill;
    const lenke = personligLenke(sp, i);
    const qr = qrSvg(lenke);
    R.ark(`
      <h2 id="ark-tittel">${esc(R.t("Lenken til {navn}", { navn: sp.navn[i] }))}</h2>
      <p class="ingress">${esc(R.t("Bare {navn} skal ha denne lenken. Den viser hvem {navn} skal gi gave til.", { navn: sp.navn[i] }))}</p>
      ${qr ? `<div class="kodekort ni-kodekort"><div class="qr">${qr}</div><span class="etikett">${esc(R.t("Eller la {navn} skanne denne", { navn: sp.navn[i] }))}</span></div>` : ""}
      <div class="knapprad">
        ${R.ui.knapp2(R.t("Kopier lenke"), "kopier-en", { v: i })}
        ${R.ui.knapp(R.t("Del lenke"), "del-en", { v: i })}
      </div>
      <button class="lenke" data-h="lukk-ark">${esc(R.t("Lukk"))}</button>`);
  }

  function merkSendt(S, i, hvordan) {
    const sp = S.spill;
    if (!sp || !(i >= 0 && i < sp.n)) return;
    sp.sendt[i] = Math.max(sp.sendt[i] || 0, hvordan);
    if (S.skjerm === "del") R.vis();
    else R.lagre();
  }

  const DEF = {
    id: "nissen",
    versjon: 1,
    pagar: (S) => pagar(S) || !!S.gjest,

    tilstand: () => ({
      navn: [],
      oppsett: STANDARD_OPPSETT(),
      spill: null,
      // The host's own card, per draw: once seen on this phone, the host can't pick another name.
      laste: {},
      // A personal card from a link: { id, navn, mottaker, kr, dato, vert? }
      gjest: null,
      // A card from a link that was opened while this phone already had one: waits for a yes.
      nyttKort: null,
      lenkefeil: "",
    }),

    lastet(S) {
      const o = (S.oppsett = Object.assign(STANDARD_OPPSETT(), S.oppsett));
      if (!["en", "hver"].includes(o.modus)) o.modus = "en";
      if (!(Number.isInteger(o.budsjett) && o.budsjett >= 0 && o.budsjett < BUDSJETT.length)) o.budsjett = STANDARD_BUDSJETT;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(o.dato || "") || !datoGyldig(datoTall(o.dato))) o.dato = "";
      S.navn = (Array.isArray(S.navn) ? S.navn : []).slice(0, MAKS).map((x) => kutt(x, MAKS_NAVN));
      // The first time: start from the gang's names (shared by all rusj games).
      if (!S.navn.length) S.navn = R.felles.navn.map(rentNavn).filter(Boolean).slice(0, MAKS);
      while (S.navn.length < MIN) S.navn.push("");
      const n = S.navn.length;
      o.par = (Array.isArray(o.par) ? o.par : [])
        .filter((p) => Array.isArray(p) && p.length === 2 && p.every((i) => Number.isInteger(i) && i >= 0 && i < n) && p[0] !== p[1])
        .slice(0, MAKS_PAR);
      const laste = {};
      if (S.laste && typeof S.laste === "object") {
        for (const [k, v] of Object.entries(S.laste).slice(-30)) if (/^[0-9A-Z]{5}$/.test(k) && Number.isInteger(v) && v >= 0 && v < MAKS) laste[k] = v;
      }
      S.laste = laste;
      const sp = S.spill;
      if (
        sp &&
        (sp.versjon !== 2 || !/^[0-9A-Z]{5}$/.test(sp.id || "") || !Array.isArray(sp.navn) || sp.navn.length !== sp.n || !(sp.n >= MIN && sp.n <= MAKS) || !erRing(sp.mottaker, sp.n) || !sp.vis || !Array.isArray(sp.sendt))
      )
        S.spill = null;
      // A kept card must be one a link could hold (the same rules as for a link that is opened).
      const helt = (g) => !!g && typeof g === "object" && likt(lesPersonlig(lagPersonlig(g)), g);
      if (!helt(S.gjest)) S.gjest = null;
      if (!helt(S.nyttKort)) S.nyttKort = null;
      if (!S.spill && SPILLSKJERMER.includes(S.skjerm)) S.skjerm = "hjem";
      if (!S.gjest && S.skjerm === "gjest") S.skjerm = "hjem";
      if (!S.nyttKort && S.skjerm === "nyttkort") S.skjerm = "hjem";
      if (S.skjerm === "lenkefeil" && !S.lenkefeil) S.skjerm = "hjem";
    },

    regler: {
      intro: R.t("Nissetrekning uten lapper i lua: Alle trekker én person å gi gave til – og ingen vet hvem som har trukket hvem."),
      steg: [
        [R.t("Skriv navnene"), R.t("Legg til alle som er med. Velg budsjett og gavedag hvis dere vil, og hvem som ikke skal trekke hverandre.")],
        [R.t("Trekk"), R.t("Én mobil: send den rundt, og alle holder fingeren på kortet. Hver sin mobil: alle får sin egen lenke, som bare viser hvem de selv skal gi til.")],
        [R.t("Hysj til gavedagen"), R.t("Ingen trekker seg selv. På gavedagen kan dere avsløre hele nissekjeden og kåre årets nisse.")],
      ],
      tips: [
        R.t("Hver sin mobil: Lenken til hver person har bare kortet til den personen. Navnene kan ikke leses rett ut av lenken, men den er ikke låst: Den som har en lenke, kan åpne kortet – og den som laget trekningen, kan åpne alle."),
        R.t("Glemt hvem du skal gi til? Åpne lenken din igjen. Den som laget trekningen, kan sende den på nytt."),
        R.t("Ingenting sendes via oss. Trekningen ligger bare på mobilen den ble laget på, så send lenkene med en gang. De virker også om mobilen skulle glemme trekningen."),
        R.t("Alle henger sammen i én stor ring. Fint for gaveutdelingen: den som nettopp fikk en gave, deler ut sin egen som neste."),
        R.t("Trenger du hjelp? «Gaveideer» gir forslag som passer budsjettet."),
      ],
    },

    hemmelig: {
      innhold(S, id) {
        if (id === "gjest") {
          const g = S.gjest;
          // The host's own card locks the name on this phone (also when it's just a quick peek).
          if (g.vert != null && S.spill && S.spill.id === g.id) {
            (S.laste = S.laste || {})[g.id] = g.vert;
            R.lagre();
          }
          return kortHtml(g.mottaker, g.kr, g.dato);
        }
        const i = Number(String(id).replace(/^\D+/, ""));
        return kortFor(S.spill, i);
      },
      sett(S, id) {
        if (S.skjerm === "vis" && id === "p" + S.spill.vis.i && !S.spill.vis.sett) {
          S.spill.vis.sett = true;
          R.vis();
          const knapp = R.$('[data-h="vist"]');
          if (knapp) knapp.classList.add("pop");
        }
      },
    },

    // Personal links: …/nissen/#2… (one token, see «Personal links» above)
    vedHash(S, kort) {
      const hash = raHash || kort;
      raHash = "";
      const o = lesPersonlig(hash);
      S.nyttKort = null;
      if (!o) {
        S.lenkefeil = R.t("Lenken er ufullstendig eller endret – kanskje ble den kuttet da den ble sendt. Be den som laget trekningen, om å sende den på nytt.");
        return "lenkefeil";
      }
      S.lenkefeil = "";
      // The card this phone already has: just show it.
      if (likt(S.gjest, o)) return "gjest";
      // Anybody can write a link. So a card that is kept is never replaced without a yes, and a
      // phone with a draw of its own asks before it opens somebody's card.
      if (S.gjest || pagar(S)) {
        S.nyttKort = o;
        return "nyttkort";
      }
      S.gjest = o;
      return "gjest";
    },

    felt: {
      navn(S, el) {
        const i = Number(el.dataset.i);
        if (!(i >= 0 && i < S.navn.length)) return;
        // Whole characters only (never half an emoji). A browser that counts the 16 in another way
        // may have let more in: show what is kept.
        const navn = kutt(el.value, MAKS_NAVN);
        if (navn !== el.value) el.value = navn;
        S.navn[i] = navn;
        const fjern = el.parentElement && el.parentElement.querySelector(".fjern");
        if (fjern) fjern.setAttribute("aria-label", "Fjern " + (ren(S.navn[i]) || "person " + (i + 1)));
        oppdaterFeil(S);
        R.lagre();
      },
      dato(S, el) {
        S.oppsett.dato = /^\d{4}-\d{2}-\d{2}$/.test(el.value) ? el.value : "";
        const fjern = R.$("#ni-dato-fjern");
        if (fjern) fjern.hidden = !S.oppsett.dato;
        R.lagre();
      },
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const dato = (S.spill && !S.spill.ferdig && S.spill.dato) || (S.gjest && S.gjest.dato) || 0;
          return R.ui.spillhjem({
            slagordHtml: `${esc(R.t("Hvem skal du gi gave til?"))}<br><em>${esc(R.t("Bare du får vite det."))}</em>`,
            knapperHtml:
              nedtellingHtml(dato) +
              R.ui.startKnapper({
                pagar: pagar(S),
                fortsettTekst: R.t("Fortsett trekningen"),
                startTekst: R.t("Ny nissetrekning"),
                nyTekst: R.t("Ny trekning"),
                ekstraHtml: (S.gjest ? R.ui.knapp2(R.t("Se hvem du skal gi til"), "til-gjest", { ikon: "🎁" }) : "") + R.ui.lenke(R.t("Slik spiller du"), "regler"),
              }),
            merker: [
              ["3–30", R.t("personer")],
              [String(ANTALL_IDEER), R.t("gaveideer")],
              ["0", R.t("lapper i lua")],
            ],
          });
        },
        // A card that waited for a yes is dropped when the question is left unanswered.
        inn(S) {
          S.nyttKort = null;
        },
        etter: () => sno(),
      },

      oppsett: {
        tittel: R.t("Nissetrekning"),
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          const n = S.navn.length;
          const feil = oppsettFeil(S);
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
            <section class="seksjon">
              <h2>${esc(R.t("Hvordan trekker dere?"))}</h2>
              ${R.ui.fliser(
                "modus",
                [
                  { v: "en", tittel: R.t("Én mobil"), tekst: R.t("Send den rundt – alle holder fingeren på kortet"), ikon: "📱" },
                  { v: "hver", tittel: R.t("Hver sin mobil"), tekst: R.t("Alle får sin egen lenke og ser bare sitt eget kort"), ikon: "📲" },
                ],
                o.modus,
              )}
            </section>
            <section class="seksjon" id="ni-navneboks">
              <div class="seksjon-hode"><h2>${esc(R.t("Hvem er med?"))}</h2><span class="tall">${esc(R.t("{n} personer", { n }))}</span></div>
              <div class="spillere">${navnerader(S)}</div>
              <button class="legg-til" data-h="legg-til"${n >= MAKS ? " disabled" : ""}>${esc(R.t("+ Legg til person"))}${n >= MAKS ? " " + esc(R.t("(maks {n})", { n: MAKS })) : ""}</button>
            </section>
            <section class="seksjon ni-to">
              <div class="seksjon">
                <h2>${esc(R.t("Budsjett"))}</h2>
                ${R.ui.teller("budsjett", o.budsjett, 0, BUDSJETT.length - 1, {
                  // «200 kr»: the number, then the unit in small type; «£20» has its sign in front.
                  vis: (b) => (!b ? R.t("Fritt") : R.sprak === "en" ? kroner(BUDSJETT[b]) : BUDSJETT[b]),
                  enhet: o.budsjett && R.sprak !== "en" ? R.t("kr") : "",
                  minus: R.t("Lavere budsjett"),
                  pluss: R.t("Høyere budsjett"),
                })}
              </div>
              <div class="seksjon">
                <h2><label for="ni-dato">${esc(R.t("Gavedag"))}</label></h2>
                <input class="tekstfelt ni-dato" type="date" id="ni-dato" data-felt="dato" value="${esc(o.dato)}">
                <button class="lenke ni-dato-fjern" id="ni-dato-fjern" data-h="fjern-dato"${o.dato ? "" : " hidden"}>${esc(R.t("Ingen dato"))}</button>
              </div>
            </section>
            <section class="seksjon">
              <div class="seksjon-hode"><h2>${esc(R.t("Ikke trekk hverandre"))}</h2><span class="tall">${esc(R.t("valgfritt"))}</span></div>
              <p class="ni-hjelp">${esc(R.t("For eksempel kjærester eller søsken."))}</p>
              ${parListe(S)}
              ${R.ui.knapp2(R.t("Legg til par"), "par", { variant: "liten", ikon: "+", av: o.par.length >= MAKS_PAR })}
            </section>
            ${R.ui.dokk(`<p class="ni-feil" id="ni-feil" role="status">${esc(feil)}</p>`, R.ui.knapp(R.t("Start"), "start", { av: !!feil }))}`;
        },
      },

      // The sack is shaken: a short animation while the draw is already made.
      trekk: {
        tittel: R.t("Nissetrekning"),
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const t = tilfeldig(sp.fro);
          const lapper = R.stokk(sp.navn, t)
            .slice(0, 8)
            .map((navn, k) => `<span class="ni-lapp" style="--x:${Math.round((k % 2 ? 1 : -1) * (30 + t() * 90))}px;--r:${Math.round(t() * 50 - 25)}deg;--d:${(k * 0.17).toFixed(2)}s">${esc(navn)}</span>`) // sprak-ok
            .join("");
          return `
            <div class="ni-trekk">
              <div class="ni-sekk" data-utenfor-ok>
                ${lapper}
                <svg viewBox="0 0 200 200" aria-hidden="true" focusable="false">
                  <path class="ni-sekk-kropp" d="M64 92 C26 112 18 168 46 184 C72 198 128 198 154 184 C182 168 174 112 136 92 Z"/>
                  <path class="ni-sekk-kropp" d="M66 95 C56 84 46 72 36 58 C64 70 136 70 164 58 C154 72 144 84 134 95 Z"/>
                  <ellipse class="ni-sekk-munn" cx="100" cy="59" rx="64" ry="10"/>
                  <path class="ni-sekk-glans" d="M54 126 C49 144 53 162 64 173"/>
                  <rect class="ni-sekk-lapp" x="116" y="134" width="28" height="24" rx="4" transform="rotate(-8 130 146)"/>
                  <path class="ni-sekk-band" d="M60 93 C86 102 114 102 140 93"/>
                  <path class="ni-sekk-sloyfe" d="M100 100 c-14 -16 -34 -6 -22 6 c8 8 22 -6 22 -6 c0 0 14 14 22 6 c12 -12 -8 -22 -22 -6z"/>
                </svg>
              </div>
              <h1 id="skjerm-tittel">${esc(R.t("Nissen trekker …"))}</h1>
              <p class="ingress">${esc(R.t("{n} lapper i lua. Ingen trekker seg selv.", { n: sp.n }))}</p>
            </div>`;
        },
        inn(S) {
          const sp = S.spill;
          const neste = sp.modus === "hver" ? "del" : "vis";
          sp.skjerm = neste; // «Fortsett» goes on from here, also after a reload
          R.lagre();
          R.lyd.trommevirvel(R.rolig() ? 0.5 : 1.6);
          const id = setTimeout(
            () => {
              if (S.spill === sp && S.skjerm === "trekk") {
                bjeller();
                R.vibrer([30, 40, 30]);
                R.gaTil(neste);
              }
            },
            R.rolig() ? 600 : 2100,
          );
          R.vedForlat(() => clearTimeout(id));
        },
      },

      // One phone: the phone goes around, everyone holds to see their card.
      vis: {
        tittel: R.t("Nissetrekning"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const i = sp.vis.i;
          const siste = i === sp.n - 1;
          const navn = sp.navn[i];
          return `
            ${R.ui.fremdrift(sp.n, i)}
            <div class="ni-mottaker">
              <p class="etikett">${esc(R.t("Gi mobilen til"))}</p>
              <h1 id="skjerm-tittel" class="spillernavn ${navnKlasse(navn)}">${R.avatar(i, "stor")}<span>${esc(navn)}</span></h1>
            </div>
            ${R.ui.mappe({ id: "p" + i, etikett: R.t("Topphemmelig"), tekst: HOLD, etikettAria: R.t("Hold fingeren på kortet for å se kortet til {navn}", { navn }) })}
            <p class="hjelp">${esc(sp.vis.sett ? R.t("Husket navnet? Trykk «Ferdig» og gi mobilen videre.") : R.t("Bare {navn} skal se. Slipp, så skjules kortet igjen.", { navn }))}</p>
            ${R.ui.dokk(
              R.ui.knapp(siste ? R.t("Alle har sett – ferdig!") : "", "vist", {
                av: !sp.vis.sett,
                tekstHtml: siste ? "" : `<span class="ni-to-linjer"><b>${esc(R.t("Ferdig"))}</b><small>${esc(R.t("Gi mobilen til {navn}", { navn: sp.navn[i + 1] }))}</small></span>`,
              }),
            )}`;
        },
        etter: () => sno(),
      },

      // One phone: everyone has seen their card.
      klar: {
        tittel: R.t("Nissetrekning"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          return `
            <div class="banner ni-banner">
              ${R.figur()}
              <h1 id="skjerm-tittel">${esc(R.t("Alle har trukket!"))}</h1>
              <p class="ingress">${esc(R.t("Nå er det bare å holde tett til gavedagen. 🤫"))}</p>
            </div>
            ${nedtellingHtml(sp.dato)}
            ${infoboks(sp)}
            <div class="stabel">
              ${R.ui.knapp2(R.t("Glemt hvem du skal gi til?"), "glemt", { ikon: "🔍" })}
              ${R.ui.knapp2(R.t("Gaveideer"), "ideer", { ikon: "💡" })}
            </div>
            <p class="hjelp">${esc(R.t("Tips: Del ut gavene i ring – den som nettopp fikk en gave, deler ut sin egen som neste."))}</p>
            ${R.ui.lenkerad(avslorLenke(sp), R.ui.lenke(R.t("Avslutt"), "avslutt"))}
            ${R.ui.dokk(R.ui.knapp(R.t("Ferdig – vi ses på gavedagen"), "ferdig", { ikon: "🎄" }))}`;
        },
        inn(S) {
          if (!S.spill.feiret) {
            S.spill.feiret = true;
            R.lagre();
            bjeller();
          }
          setTimeout(() => R.slippVaken(), 0); // the draw can rest for weeks: let the phone sleep
        },
        etter: () => sno(),
      },

      // Each on their own phone: one personal link per person.
      del: {
        tittel: R.t("Nissetrekning"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const delt = sp.sendt.filter(Boolean).length;
          const neste = sp.sendt.findIndex((x) => !x);
          const rader = sp.navn
            .map((navn, i) => {
              const status = sp.sendt[i] === 2 ? R.t("Lenken er kopiert") : sp.sendt[i] === 1 ? R.t("Lenken er delt") : R.t("Ikke sendt ennå");
              return `<li class="ni-lenkerad${sp.sendt[i] ? " sendt" : ""}">
                <button class="ni-lenkenavn" data-h="person" data-v="${i}" aria-label="${esc(R.t("{navn}: vis lenken og QR-koden", { navn }))}">${R.avatar(i)}<span><b>${esc(navn)}</b><small>${sp.sendt[i] ? "✓ " : ""}${esc(status)}</small></span></button>
                <button class="knapp-2 liten" data-h="del-en" data-v="${i}" aria-label="${esc(R.t("Del lenken til {navn}", { navn }))}">${esc(R.t("Del"))}</button>
                <button class="knapp-2 liten" data-h="kopier-en" data-v="${i}" aria-label="${esc(R.t("Kopier lenken til {navn}", { navn }))}">${esc(R.t("Kopier"))}</button>
              </li>`;
            })
            .join("");
          return `
            ${piller(BUDSJETT[sp.budsjett], sp.dato)}
            <h1 id="skjerm-tittel">${esc(R.t("Send lenkene"))}</h1>
            <p class="ingress">${esc(R.t("Hver person får sin egen lenke. Den viser bare hvem den personen skal gi gave til."))}</p>
            <p class="ni-varsel" id="ni-varsel">${
              !erLagret(sp)
                ? `<b>${esc(R.t("Send alle lenkene nå."))}</b> ${esc(R.t("Denne mobilen lagrer ikke trekningen – den blir borte når du lukker siden."))}`
                : neste >= 0
                  ? `<b>${esc(R.t("Send lenkene nå"))}</b> ${esc(R.t("– trekningen ligger bare på denne mobilen."))}`
                  : esc(R.t("Alle lenkene er sendt. Trekningen ligger bare på denne mobilen."))
            }</p>
            <section class="seksjon">
              <div class="seksjon-hode"><h2>${esc(R.t("Lenkene"))}</h2><span class="tall">${esc(R.t("{n} av {alle} sendt", { n: delt, alle: sp.n }))}</span></div>
              <ul class="ni-lenker">${rader}</ul>
            </section>
            <p class="hjelp">${esc(R.t("Lenkene virker også om mobilen skulle glemme trekningen. Har noen mistet lenken sin, sender du den på nytt herfra."))}</p>
            <p class="ni-aerlig">${esc(R.t("Lenkene sendes ikke via oss. Navnene kan ikke leses rett ut av en lenke, men den er ikke låst: Den som har lenken, kan åpne kortet. Du som laget trekningen, kan åpne alle."))}</p>
            ${R.ui.lenkerad(R.ui.lenke(R.t("Er du med selv? Se kortet ditt"), "vert-gjest"), avslorLenke(sp), R.ui.lenke(R.t("Avslutt"), "avslutt"))}
            ${R.ui.dokk(
              neste >= 0 ? R.ui.knapp(R.t("Del lenken til {navn}", { navn: sp.navn[neste] }), "del-en", { v: neste, ikon: "📨" }) : R.ui.knapp(R.t("Ferdig – vi ses på gavedagen"), "ferdig", { ikon: "🎄" }),
              neste >= 0 ? R.ui.lenkerad(R.ui.lenke(R.t("Ferdig for nå"), "ferdig")) : "",
            )}`;
        },
        etter: () => sno(),
      },

      // From the gift day on: reveal the whole ring step by step, then crown «årets nisse».
      kaaring: {
        tittel: R.t("Kåringen"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const rekke = kjede(sp.mottaker, 0);
          const vist = sp.avslort;
          const alle = vist >= sp.n;
          const linje = (k) => {
            const r = rekke[k];
            return `<li>${R.avatar(r.giver)}<span class="ni-kjede-tekst"><b>${esc(sp.navn[r.giver])}</b><small>${esc(R.t("var nissen til"))} <b>${esc(sp.navn[r.mottaker])}</b></small></span></li>`;
          };
          if (!alle) {
            const neste = rekke[vist].mottaker;
            return `
              <h1 id="skjerm-tittel" class="ni-kaaring-tittel">${esc(R.t("Hvem var nisse for hvem?"))}</h1>
              <div class="papirboks ni-sporsmal" aria-live="polite">
                <span class="etikett">${esc(R.t("{n} av {alle}", { n: vist + 1, alle: sp.n }))}</span>
                <span class="ni-sporsmal-navn">${R.avatar(neste, "stor")}<span>${esc(R.t("Hvem var nissen til"))} <b>${esc(sp.navn[neste])}</b>?</span></span>
              </div>
              ${vist ? `<ol class="ni-kjede nyest">${range(vist).reverse().map(linje).join("")}</ol>` : `<p class="hjelp">${esc(R.t("{navn} gjetter først. Så avslører dere én og én.", { navn: sp.navn[neste] }))}</p>`}
              ${R.ui.dokk(R.ui.knapp(R.t("Avslør!"), "avslor", { ikon: "🎅" }), R.ui.lenkerad(R.ui.lenke(R.t("Vis alle på en gang"), "vis-alle")))}`;
          }
          const arets = sp.arets;
          return `
            ${
              arets != null
                ? `<div class="banner aksent ni-arets">
                    ${R.figur()}
                    <p class="etikett">${esc(R.t("Årets nisse"))}</p>
                    <h1 id="skjerm-tittel">${esc(R.t("{navn} vinner!", { navn: sp.navn[arets] }))}</h1>
                    <p class="ingress">${esc(R.t("Takk for den fineste gaven. 🎁"))}</p>
                  </div>`
                : `<div class="banner ni-banner">
                    ${R.figur()}
                    <h1 id="skjerm-tittel">${esc(R.t("Ringen er sluttet!"))}</h1>
                    <p class="ingress">${esc(R.t("Alle {n} var nisse for noen – og fikk en nisse selv.", { n: sp.n }))}</p>
                  </div>`
            }
            <section class="seksjon">
              <h2>${esc(R.t("Årets nisse"))}</h2>
              <p class="ni-hjelp">${esc(R.t("Hvem ga den beste gaven? Trykk på navnet."))}</p>
              <div class="velgere">${range(sp.n)
                .map((i) => `<button class="velger" data-h="arets" data-v="${i}" aria-pressed="${arets === i}">${R.avatar(i)}<span>${esc(sp.navn[i])}</span></button>`)
                .join("")}</div>
            </section>
            <section class="seksjon">
              <h2>${esc(R.t("Nissekjeden"))}</h2>
              <ol class="ni-kjede">${range(sp.n).map(linje).join("")}</ol>
            </section>
            ${R.ui.flereSpill({ antall: sp.n })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen"), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "endre"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
        },
        inn(S) {
          const sp = S.spill;
          if (!sp.ferdig) {
            sp.ferdig = true;
            R.lagre();
            R.statistikk("ferdig", { antall: sp.n, modus: sp.modus });
          }
          R.slippVaken();
        },
        etter: () => sno(),
      },

      // A personal card, opened from a link (or the host's own).
      gjest: {
        tittel: R.t("Nissetrekning"),
        tilbake: "hjem",
        vis(S) {
          const g = S.gjest;
          return `
            <h1 id="skjerm-tittel" class="ni-hei ${navnKlasse(g.navn)}">${navneAvatar(g.navn, "mid")}<span>${esc(R.t("Hei, {navn}!", { navn: g.navn }))}</span></h1>
            ${R.ui.mappe({ id: "gjest", etikett: R.t("Topphemmelig"), tekst: HOLD })}
            ${piller(g.kr, g.dato)}
            ${nedtellingHtml(g.dato)}
            <p class="hjelp">${esc(R.t("Kortet er bare ditt. Glemmer du hvem du skal gi til, åpner du lenken igjen."))}</p>
            ${R.ui.lenkerad(R.ui.lenke(R.t("Fjern fra denne mobilen"), "forlat"))}
            ${R.ui.dokk(R.ui.knapp2(R.t("Gaveideer"), "ideer", { ikon: "💡" }))}`;
        },
        inn: () => setTimeout(() => R.slippVaken(), 0),
        etter: () => sno(),
      },

      // A link was opened on a phone that already has a card, or a draw of its own: ask first.
      // (The new card's receiver is never shown here – only whose card it is.)
      nyttkort: {
        tittel: R.t("Nissetrekning"),
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const ny = S.nyttKort;
          const g = S.gjest;
          const b = (navn) => `<b>${esc(navn)}</b>`;
          if (!g) {
            return `
              <div class="banner ni-banner">
                ${R.figur()}
                <h1 id="skjerm-tittel">${esc(R.t("Du har en trekning på denne mobilen"))}</h1>
                <p class="ingress">${tMed(R.t("Lenken du åpnet, er nissekortet til {navn}. Vil du åpne det?", { navn: "{navn}" }), { navn: b(ny.navn) })}</p>
              </div>
              <p class="hjelp">${esc(R.t("Trekningen din blir liggende som før. Kortet er bare ment for {navn}.", { navn: ny.navn }))}</p>
              ${R.ui.dokk(R.ui.knapp(R.t("Åpne kortet"), "apne-nytt"), R.ui.lenkerad(R.ui.lenke(R.t("Ikke nå"), "behold-kort")))}`;
          }
          const samme = nokkel(g.navn) === nokkel(ny.navn);
          return `
            <div class="banner ni-banner">
              ${R.figur()}
              <h1 id="skjerm-tittel">${esc(R.t("Du har allerede et nissekort"))}</h1>
              <p class="ingress">${
                samme
                  ? tMed(R.t("Denne mobilen har allerede et kort til {a}. Lenken du åpnet, er et annet kort til {b}.", { a: "{a}", b: "{b}" }), { a: b(g.navn), b: esc(ny.navn) })
                  : tMed(R.t("Denne mobilen har kortet til {a}. Lenken du åpnet, er kortet til {b}.", { a: "{a}", b: "{b}" }), { a: b(g.navn), b: b(ny.navn) })
              } ${esc(R.t("Vil du åpne det nye?"))}</p>
            </div>
            <p class="hjelp">${esc(R.t("Da forsvinner det gamle kortet fra denne mobilen."))} ${samme ? esc(R.t("Har dere trukket på nytt, er det nye kortet det riktige.")) + " " : ""}${esc(R.t("Er du usikker på lenken, så spør den som laget trekningen."))}</p>
            ${R.ui.dokk(R.ui.knapp(R.t("Åpne det nye kortet"), "apne-nytt"), R.ui.lenkerad(R.ui.lenke(R.t("Behold det gamle"), "behold-kort")))}`;
        },
        etter: () => sno(),
      },

      // A link that can't be read: say so kindly.
      lenkefeil: {
        tittel: R.t("Nissetrekning"),
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis: (S) => `
          <div class="banner">
            ${R.figur()}
            <h1 id="skjerm-tittel">${esc(R.t("Lenken virker ikke"))}</h1>
            <p class="ingress">${esc(S.lenkefeil || R.t("Lenken er ufullstendig."))}</p>
          </div>
          ${R.ui.dokk(R.ui.knapp(R.t("Til {spill}", { spill: R.app.navn }), "hjem"))}`,
        etter: () => sno(),
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
      hjem(el, e, S) {
        S.lenkefeil = "";
        R.gaTil("hjem");
      },
      endre: (el, e, S) => {
        S.spill = null;
        R.gaTil("oppsett");
      },
      fortsett: (el, e, S) => R.gaTil(S.spill && SPILLSKJERMER.includes(S.spill.skjerm) && S.spill.skjerm !== "trekk" ? S.spill.skjerm : S.spill && S.spill.modus === "hver" ? "del" : "vis"),
      "til-gjest": (el, e, S) => (S.gjest ? R.gaTil("gjest") : null),
      ferdig(el, e, S) {
        R.lagre();
        const lagret = !!S.spill && erLagret(S.spill);
        R.gaTil("hjem");
        R.toast(lagret ? R.t("Trekningen er lagret på denne mobilen") : R.t("Denne mobilen lagrer ikke trekningen"));
      },

      // Setup
      modus(el, e, S) {
        S.oppsett.modus = el.dataset.v === "hver" ? "hver" : "en";
        R.vis();
      },
      "legg-til"(el, e, S) {
        if (S.navn.length >= MAKS) return;
        S.navn.push("");
        R.vis();
        const ny = R.$(`#ni-navn-${S.navn.length - 1}`);
        if (ny) ny.focus();
      },
      fjern(el, e, S) {
        const i = Number(el.dataset.v);
        if (S.navn.length <= MIN || !(i >= 0 && i < S.navn.length)) return;
        S.navn.splice(i, 1);
        S.oppsett.par = S.oppsett.par.filter((p) => !p.includes(i)).map((p) => p.map((x) => (x > i ? x - 1 : x)));
        R.vis();
      },
      budsjett(el, e, S) {
        S.oppsett.budsjett = R.klamp(S.oppsett.budsjett + Number(el.dataset.v), 0, BUDSJETT.length - 1);
        R.vis();
      },
      "fjern-dato"(el, e, S) {
        S.oppsett.dato = "";
        R.vis();
      },
      par: (el, e, S) => visParArk(S),
      "par-velg"(el, e, S) {
        const i = Number(el.dataset.v);
        parValg = parValg.includes(i) ? parValg.filter((x) => x !== i) : [...parValg, i].slice(-2);
        R.$$("#ark [data-h='par-velg']").forEach((b) => b.setAttribute("aria-pressed", String(parValg.includes(Number(b.dataset.v)))));
        const ok = R.$("#ni-par-ok");
        if (ok) ok.disabled = parValg.length !== 2;
      },
      "par-ok"(el, e, S) {
        if (parValg.length !== 2) return;
        const [a, b] = parValg.slice().sort((x, y) => x - y);
        if (!S.oppsett.par.some((p) => p[0] === a && p[1] === b)) S.oppsett.par.push([a, b]);
        parValg = [];
        R.lukkArk();
        R.vis();
        if (!ringMulig(S.navn.length, S.oppsett.par)) R.lyd.feil();
      },
      "fjern-par"(el, e, S) {
        S.oppsett.par.splice(Number(el.dataset.v), 1);
        R.vis();
      },
      start(el, e, S) {
        if (oppsettFeil(S)) return oppdaterFeil(S);
        startTrekning(S);
      },
      igjen(el, e, S) {
        if (oppsettFeil(S)) return R.gaTil("oppsett");
        startTrekning(S);
      },

      // One phone
      vist(el, e, S) {
        const sp = S.spill;
        if (!sp.vis.sett) return;
        if (sp.vis.i < sp.n - 1) {
          sp.vis = { i: sp.vis.i + 1, sett: false };
          R.lyd.pop();
          R.gaTil("vis");
        } else {
          sp.skjerm = "klar";
          R.gaTil("klar");
        }
      },
      glemt: (el, e, S) => (S.spill && S.spill.modus === "en" ? glemt(S) : null),
      ideer: (el, e, S) => visIdeer(S.skjerm === "gjest" && S.gjest ? S.gjest.kr : BUDSJETT[(S.spill || S.oppsett).budsjett]),
      "ideer-nye"(el) {
        const liste = R.$("#ni-ideer");
        if (!liste) return;
        liste.innerHTML = nesteIdeer(Number(el.dataset.v) || 0, 3)
          .map((t) => `<li>${esc(t)}</li>`)
          .join("");
        liste.classList.remove("ny");
        void liste.offsetWidth;
        liste.classList.add("ny");
        R.lyd.snu();
      },
      async "til-kaaring"(el, e, S) {
        const sp = S.spill;
        if (!gavedagNadd(sp)) return R.toast(R.t("Nissekjeden kan avsløres fra gavedagen"));
        const fortsatt = R.vakt();
        const ja = await R.bekreft(R.t("Er alle gavene delt ut?"), R.t("Da kan dere se hele nissekjeden – hvem som var nisse for hvem. Det kan ikke skjules igjen."), R.t("Ja, avslør"), R.t("Ikke ennå"));
        if (!ja || !fortsatt()) return;
        sp.skjerm = "kaaring";
        R.gaTil("kaaring");
      },
      async avslor(el, e, S) {
        const sp = S.spill;
        if (avslorer || sp.avslort >= sp.n) return;
        avslorer = true;
        const fortsatt = R.vakt();
        try {
          R.lyd.trommevirvel(R.rolig() ? 0.3 : 0.8);
          const kort = R.$(".ni-sporsmal");
          if (kort) kort.classList.add("spenning");
          await R.vent(R.rolig() ? 350 : 950);
          if (!fortsatt() || S.spill !== sp) return;
          sp.avslort += 1;
          R.vis();
          bjeller();
          R.vibrer(25);
          const forste = R.$(".ni-kjede li");
          if (forste) forste.classList.add("ny");
          if (sp.avslort >= sp.n) {
            R.lyd.fanfare();
            R.konfetti(["--aksent", "--papir", "--mynte", "--lampe"]);
          }
        } finally {
          avslorer = false;
        }
      },
      "vis-alle"(el, e, S) {
        S.spill.avslort = S.spill.n;
        R.vis();
        window.scrollTo(0, 0);
        bjeller();
      },
      arets(el, e, S) {
        const i = Number(el.dataset.v);
        if (!(i >= 0 && i < S.spill.n)) return;
        const forrige = S.spill.arets;
        S.spill.arets = i;
        R.vis();
        window.scrollTo({ top: 0, behavior: R.rolig() ? "auto" : "smooth" });
        if (forrige == null) {
          R.lyd.fanfare();
          R.konfetti();
          visTipsSnart();
        } else R.lyd.riktig();
      },
      async avslutt(el, e, S) {
        const fortsatt = R.vakt();
        const tekst =
          S.spill.modus === "hver"
            ? R.t("Trekningen slettes fra denne mobilen. Lenkene som er sendt, virker fortsatt.")
            : R.t("Trekningen slettes fra denne mobilen. Har noen ikke sett kortet sitt, må dere trekke på nytt.");
        const ja = await R.bekreft(R.t("Avslutte trekningen?"), tekst, R.t("Avslutt"), R.t("Behold"));
        if (!ja || !fortsatt()) return;
        S.spill = null;
        R.slippVaken();
        R.gaTil("hjem");
      },

      // Each on their own phone: the host
      person: (el, e, S) => visPerson(S, Number(el.dataset.v)),
      "del-en"(el, e, S) {
        const sp = S.spill;
        const i = Number(el.dataset.v);
        if (!sp || !(i >= 0 && i < sp.n)) return;
        const tillegg = [belop(sp.budsjett) ? R.t("Budsjett: {belop}.", { belop: belop(sp.budsjett) }) : "", sp.dato ? R.t("Gavedag: {dato}.", { dato: datoTekst(sp.dato) }) : ""].filter(Boolean).join(" ");
        // The link is scrambled, not locked: whoever has it can open the card. So the message says so.
        R.del(R.t("Nissetrekning"), `${R.t("Hei, {navn}! Her er lenken din til nissetrekningen. Åpne den for å se hvem du skal gi gave til – og ikke send den videre.", { navn: sp.navn[i] })} ${tillegg}`.trim(), personligLenke(sp, i));
        R.lukkArk();
        merkSendt(S, i, 1);
      },
      "kopier-en"(el, e, S) {
        const sp = S.spill;
        const i = Number(el.dataset.v);
        if (!sp || !(i >= 0 && i < sp.n)) return;
        R.kopier(personligLenke(sp, i));
        R.lukkArk();
        merkSendt(S, i, 2);
      },
      // «Er du med selv?»: the host picks their own name once; this phone then shows only that card.
      async "vert-gjest"(el, e, S) {
        const sp = S.spill;
        let i = S.laste && Number.isInteger(S.laste[sp.id]) ? S.laste[sp.id] : null;
        if (i == null) {
          const fortsatt = R.vakt();
          i = await R.velgIArk(
            R.t("Hvem er du?"),
            range(sp.n).map((n) => ({ v: n, tekst: sp.navn[n] })),
            R.t("Når du har sett kortet ditt, viser denne mobilen bare det kortet."),
          );
          if (i == null || !fortsatt()) return;
        }
        S.gjest = Object.assign(personlig(sp, i), { vert: i });
        R.gaTil("gjest");
      },

      // A link opened on a phone that already has a card (or a draw of its own): the answer
      "apne-nytt"(el, e, S) {
        if (!S.nyttKort) return R.gaTil("hjem");
        S.gjest = S.nyttKort;
        S.nyttKort = null;
        R.gaTil("gjest");
      },
      "behold-kort"(el, e, S) {
        S.nyttKort = null;
        R.gaTil(S.gjest ? "gjest" : "hjem");
      },

      // A personal card
      async forlat(el, e, S) {
        const fortsatt = R.vakt();
        if ((await R.bekreft(R.t("Fjerne kortet fra denne mobilen?"), R.t("Du kan åpne lenken din igjen når du vil."), R.t("Fjern"), R.t("Behold"))) && fortsatt()) {
          S.gjest = null;
          R.gaTil("hjem");
        }
      },
    }),

    // The pure parts, for the unit tests (test/nissen.test.mjs).
    kjerne: { trekk, holder, erRing, muligRing, finnFro, kjede, ren, kutt, rentNavn, lagPersonlig, lesPersonlig, datoTekst, datoTall, dagerTil, nedtelling, bandFor, qrSvg, BUDSJETT, MIN, MAKS, MAKS_NAVN },
  };

  // Enter in a name field jumps to the next one (the kit does this for its own player list).
  try {
    document.addEventListener("keydown", (e) => {
      const el = e.target;
      if (e.key !== "Enter" || !el || !el.dataset || el.dataset.felt !== "navn") return;
      e.preventDefault();
      const neste = R.$(`#ni-navn-${Number(el.dataset.i) + 1}`);
      if (neste) neste.focus();
      else el.blur();
    });
  } catch (e) {
    /* no document (unit tests) */
  }

  // Remember which game screen was open, so «Fortsett» on the home screen returns to it.
  SPILLSKJERMER.forEach((navn) => {
    const sk = DEF.skjermer[navn];
    const inn = sk.inn;
    sk.inn = (S) => {
      if (S.spill && navn !== "trekk") S.spill.skjerm = navn;
      if (inn) inn(S);
    };
  });

  R.start(DEF);
})();
