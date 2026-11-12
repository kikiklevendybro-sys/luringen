/* rusj.no – «Klistremerkeboka»: the pure rules behind the stickers (catalogue: rusj/merker.json).
   Derives which stickers a phone has earned from what is already stored (rusj.daglig, rusj.kveld,
   rusj.spilt), adds stickers to the stored book (rusj.merker = { <id>: dayNr earned }) and draws a
   sticker. No DOM and no storage access here: everything is passed in, so the same code runs on the
   game pages and /merker/ (window.RusjMerker) and in the tests (CommonJS). */
(function (root) {
  "use strict";

  const erObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // ---------- What is stored ----------

  // The days with a finished daily (rusj/DAGLIG.md): the site log plus what each game's own streak
  // tells of (older phones have no log yet).
  function spilteDager(daglig) {
    const spilt = new Set();
    if (!erObj(daglig)) return spilt;
    const logg = erObj(daglig._) && erObj(daglig._.dager) ? daglig._.dager : {};
    for (const k of Object.keys(logg)) if (/^\d+$/.test(k) && Array.isArray(logg[k]) && logg[k].length) spilt.add(Number(k));
    for (const k of Object.keys(daglig)) {
      const e = daglig[k];
      if (k === "_" || !erObj(e) || !Number.isInteger(e.nr)) continue;
      for (let i = 0; i < Math.min(4000, Math.max(1, Number(e.rekke) || 0)); i++) spilt.add(e.nr - i);
    }
    return spilt;
  }

  // The site streak, the same rule as the kit and rusj/portal/daglig.js: days in a row with a finished
  // daily, one missed day per week (Monday–Sunday) forgiven. Counted back from today (or yesterday).
  function rekkeFra(spilt, iDag) {
    const uke = (d) => Math.floor((d + 3) / 7);
    const brukt = new Set();
    let n = 0;
    for (let d = spilt.has(iDag) ? iDag : iDag - 1, i = 0; d > 0 && i < 4000; d--, i++) {
      if (spilt.has(d)) n++;
      else if (brukt.has(uke(d))) break;
      else brukt.add(uke(d));
    }
    return n;
  }
  const rekke = (daglig, iDag) => rekkeFra(spilteDager(daglig), iDag);
  // The longest streak this phone remembers: today's, the stored best, and every game's own streak.
  function besteRekke(daglig, iDag) {
    let best = rekke(daglig, iDag);
    if (!erObj(daglig)) return best;
    if (erObj(daglig._) && Number.isFinite(daglig._.best)) best = Math.max(best, daglig._.best);
    const spilt = spilteDager(daglig);
    // Any earlier run also counts: count back from every played day that ends a run.
    for (const d of spilt) if (!spilt.has(d + 1)) best = Math.max(best, rekkeFra(spilt, d));
    return best;
  }

  // The evening's scoreboard, as in the kit: 3/2/1 points for places 1/2/3. Kept for 12 hours.
  function kveldNa(kveld, naa) {
    if (!erObj(kveld) || !Array.isArray(kveld.spill)) return [];
    if (Number.isFinite(naa) && naa - (Number(kveld.start) || 0) > 12 * 3600 * 1000) return [];
    return kveld.spill.filter((s) => erObj(s) && Array.isArray(s.resultat));
  }
  function kronet(spill, n) {
    if (spill.length < n) return false;
    const poeng = new Map();
    for (const s of spill)
      for (const r of s.resultat) {
        const p = r.plass === 1 ? 3 : r.plass === 2 ? 2 : r.plass === 3 ? 1 : 0;
        poeng.set(r.navn, (poeng.get(r.navn) || 0) + p);
      }
    const tavle = Array.from(poeng.values()).sort((a, b) => b - a);
    return tavle[0] > 0 && tavle[0] !== tavle[1];
  }

  // ---------- The rules ----------

  // kilde: { daglig, kveld, spilt: [ids], iDag, naa }. katalog: rusj/merker.json plus, from the
  // build, alle (games that count as «tried»), daglige (the daily games) and tagger ({ id: [tags] }).
  // Returns the ids whose rule holds. Stickers with { type: "merke" } are only given by R.merke.
  function utled(katalog, kilde) {
    const ut = new Set();
    if (!erObj(katalog) || !Array.isArray(katalog.merker)) return ut;
    kilde = kilde || {};
    const daglig = erObj(kilde.daglig) ? kilde.daglig : {};
    const iDag = Number(kilde.iDag) || 0;
    const dager = spilteDager(daglig);
    let best = null;
    const alle = new Set(Array.isArray(katalog.alle) ? katalog.alle : []);
    const spilt = new Set((Array.isArray(kilde.spilt) ? kilde.spilt : []).filter((id) => alle.has(id)));
    const tagger = erObj(katalog.tagger) ? katalog.tagger : {};
    const daglige = Array.isArray(katalog.daglige) ? katalog.daglige : [];
    const kveld = kveldNa(kilde.kveld, kilde.naa);
    for (const m of katalog.merker) {
      const r = (m && m.regel) || {};
      let ja = false;
      if (r.type === "dager") ja = dager.size >= r.n;
      else if (r.type === "rekke") ja = (best == null ? (best = besteRekke(daglig, iDag)) : best) >= r.n;
      else if (r.type === "alleIdag") {
        const logg = erObj(daglig._) && erObj(daglig._.dager) ? daglig._.dager : {};
        ja = daglige.length > 0 && Object.values(logg).some((l) => Array.isArray(l) && daglige.every((id) => l.includes(id)));
      } else if (r.type === "dagligSeier") {
        const e = daglig[r.spill];
        ja = erObj(e) && (e.vunnet === true || Number(e.rekke) > 0);
      } else if (r.type === "kveldSpill") ja = kveld.length >= r.n;
      else if (r.type === "kveldFolk") ja = kveld.some((s) => s.resultat.length >= r.n);
      else if (r.type === "kronet") ja = kronet(kveld, r.n || 3);
      else if (r.type === "provd") ja = alle.size > 0 && spilt.size >= (r.n === "alle" ? alle.size : r.n);
      else if (r.type === "provdTagg") ja = Array.from(spilt).some((id) => Array.isArray(tagger[id]) && tagger[id].includes(r.tagg));
      if (ja) ut.add(m.id);
    }
    return ut;
  }

  // ---------- The book ----------

  // Only known ids with a whole day number survive (an old or tampered value never breaks the page).
  function rens(lagret, katalog) {
    const kjent = new Set(((katalog && katalog.merker) || []).map((m) => m.id));
    const ut = {};
    if (!erObj(lagret)) return ut;
    for (const [id, nr] of Object.entries(lagret)) if (kjent.has(id) && Number.isInteger(nr) && nr > 0) ut[id] = nr;
    return ut;
  }
  // Adds the ids to the book on day dagNr. Unknown ids are ignored, and a sticker keeps the day it
  // was first earned. → { lagret (a new object), nye: [ids that were not in the book] }
  function tildel(lagret, ids, katalog, dagNr) {
    const kjent = new Set(((katalog && katalog.merker) || []).map((m) => m.id));
    const ny = Object.assign({}, erObj(lagret) ? lagret : {});
    const nye = [];
    for (const id of ids || []) {
      if (typeof id !== "string" || !kjent.has(id) || Number.isInteger(ny[id])) continue;
      ny[id] = dagNr;
      nye.push(id);
    }
    return { lagret: ny, nye };
  }

  // ---------- Drawing a sticker ----------

  // A round die-cut sticker: the game's mascot (G = RusjGjengen) or an emoji on a coloured disc,
  // and a small number badge when the sticker has one. Decorative: the caller names it.
  function tegn(m, G) {
    const farge = m.farge || "#ffd23f";
    let bilde = "";
    if (m.figur && G && (!G.finnes || G.finnes(m.figur))) bilde = G.svg(m.figur);
    else bilde = `<span class="klistre-emoji">${esc(m.emoji || "⭐")}</span>`;
    const tall = m.tall != null ? `<b class="klistre-tall">${esc(m.tall)}</b>` : "";
    return `<span class="klistre" style="--mf: ${esc(farge)}" aria-hidden="true"><span class="klistre-bilde">${bilde}</span>${tall}</span>`;
  }

  const api = { spilteDager, rekke, besteRekke, utled, rens, tildel, tegn };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RusjMerker = api;
})(typeof self !== "undefined" ? self : this);
