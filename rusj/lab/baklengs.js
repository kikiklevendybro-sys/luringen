// rusj.no/lab/baklengs/: a test page for the owner, not linked from anywhere. It records a word,
// plays it backwards, records the imitation and plays that backwards too. The sound never leaves
// the phone: it lives in the page's memory and is gone when the page is closed. The report at the
// bottom holds only technical facts (browser, timings, levels), and only the owner can copy it.
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const MAKS_SEK = 5;
  const TA_OPP = "Ta opp";
  const ORD = ["banan", "sjokolade", "elefant", "ananas", "tomat", "sofa", "lokomotiv", "pannekake", "måne", "sykkel", "kanin", "paraply"];
  const linjer = [];
  const si = (tekst) => {
    linjer.push(tekst);
    $("rapport").value = linjer.join("\n");
  };
  const feil = (hvor, e) => si(`FEIL ${hvor}: ${e && e.name ? e.name + ": " : ""}${e && e.message ? e.message : e}`);

  let ac = null;
  const lyd = { a: null, b: null }; // a: the word, b: the imitation (AudioBuffer, mono)
  let pagar = null; // the recording in progress: { stopp() }
  let spiller = null;

  function kontekst() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      ac = new AC();
      si(`lydmotor: ${ac.sampleRate} Hz, ${ac.state}`);
    }
    if (ac.state !== "running") ac.resume().catch((e) => feil("lydmotor", e));
    return ac;
  }
  // iPhone: tell the system whether we record or only play, so playback is not quiet and the
  // silent switch does not mute it (Safari 16.4 and later; harmless elsewhere).
  function okt(type) {
    try {
      if (navigator.audioSession) navigator.audioSession.type = type;
    } catch (e) {
      feil("lydøkt", e);
    }
  }
  function stoppSpill() {
    if (spiller) {
      try {
        spiller.stop();
      } catch (e) {
        /* already stopped */
      }
      spiller = null;
    }
  }
  function vis() {
    for (const id of ["bak1", "sakte1", "rett1", "ta2"]) $(id).disabled = !lyd.a;
    for (const id of ["bak2", "rett2"]) $(id).disabled = !lyd.b;
  }
  const toppI = (x, fra, n) => {
    let m = 0;
    for (let i = fra, til = Math.min(x.length, fra + n); i < til; i++) {
      const v = x[i] < 0 ? -x[i] : x[i];
      if (v > m) m = v;
    }
    return m;
  };
  // Cut the silence before and after the word, fade the ends and lift the level.
  function rens(x, sr) {
    const topp = toppI(x, 0, x.length);
    if (topp < 0.004) return null;
    const terskel = Math.max(0.012, topp * 0.06), vindu = Math.round(sr * 0.02);
    let fra = -1, til = -1;
    for (let i = 0; i + vindu <= x.length; i += vindu) {
      if (toppI(x, i, vindu) > terskel) {
        fra = Math.max(0, i - Math.round(sr * 0.06));
        break;
      }
    }
    for (let i = x.length - vindu; i >= 0; i -= vindu) {
      if (toppI(x, i, vindu) > terskel) {
        til = Math.min(x.length, i + vindu + Math.round(sr * 0.1));
        break;
      }
    }
    if (fra < 0 || til - fra < sr * 0.15) return null;
    const ut = x.slice(fra, til);
    const k = Math.min(8, 0.9 / topp), fade = Math.round(sr * 0.012);
    for (let i = 0; i < ut.length; i++) ut[i] *= k * Math.min(1, i / fade, (ut.length - 1 - i) / fade);
    return { data: ut, topp };
  }
  function ferdigOpptak(hvilken, raa, sr, metode) {
    const c = kontekst();
    const ren = rens(raa, sr);
    if (!ren) {
      si(`opptak ${hvilken} (${metode}): ingen lyd, ${(raa.length / sr).toFixed(2)} s tatt opp`);
      $("stille").hidden = false;
      return;
    }
    $("stille").hidden = true;
    const buf = c.createBuffer(1, ren.data.length, sr);
    buf.getChannelData(0).set(ren.data);
    lyd[hvilken] = buf;
    if (hvilken === "a") lyd.b = null;
    si(`opptak ${hvilken} (${metode}): ${(raa.length / sr).toFixed(2)} s tatt opp, ${(ren.data.length / sr).toFixed(2)} s etter klipp, topp ${ren.topp.toFixed(3)}`);
    vis();
  }

  async function taOpp(hvilken) {
    if (pagar) return pagar.stopp();
    const knapp = $(hvilken === "a" ? "ta1" : "ta2");
    stoppSpill();
    const c = kontekst();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      si("mikrofon: nettleseren har ikke mikrofon-API");
      $("sperret").hidden = false;
      return;
    }
    okt("play-and-record");
    const t0 = performance.now();
    let strom;
    try {
      // No echo or noise filters: they are made for calls and would eat parts of the word.
      strom = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true, channelCount: 1 } });
    } catch (e) {
      feil("mikrofon", e);
      okt("playback");
      $(e && e.name === "NotAllowedError" ? "nektet" : "sperret").hidden = false;
      return;
    }
    $("nektet").hidden = true;
    $("sperret").hidden = true;
    si(`mikrofon ${hvilken}: tillatt etter ${Math.round(performance.now() - t0)} ms`);
    let ferdig = false;
    let rydd = () => {};
    const slutt = () => {
      strom.getTracks().forEach((t) => t.stop());
      okt("playback");
      pagar = null;
      knapp.textContent = TA_OPP;
      knapp.classList.remove("pa");
      $("niva").style.width = "0";
    };
    if (c.createScriptProcessor) {
      // Raw samples straight from the microphone: no file format in between.
      const biter = [];
      let antall = 0;
      const kilde = c.createMediaStreamSource(strom);
      const proc = c.createScriptProcessor(4096, 1, 1);
      const stille = c.createGain();
      stille.gain.value = 0;
      const stopp = () => {
        if (ferdig) return;
        ferdig = true;
        proc.onaudioprocess = null;
        try {
          kilde.disconnect();
          proc.disconnect();
          stille.disconnect();
        } catch (e) {
          /* already disconnected */
        }
        clearTimeout(vakt);
        slutt();
        const raa = new Float32Array(antall);
        let o = 0;
        for (const b of biter) {
          raa.set(b, o);
          o += b.length;
        }
        ferdigOpptak(hvilken, raa, c.sampleRate, "direkte");
      };
      proc.onaudioprocess = (ev) => {
        const inn = ev.inputBuffer.getChannelData(0);
        biter.push(new Float32Array(inn));
        antall += inn.length;
        $("niva").style.width = Math.min(100, toppI(inn, 0, inn.length) * 220) + "%";
        if (antall >= MAKS_SEK * c.sampleRate) stopp();
      };
      kilde.connect(proc);
      proc.connect(stille);
      stille.connect(c.destination);
      const vakt = setTimeout(stopp, (MAKS_SEK + 1) * 1000);
      rydd = stopp;
    } else if (typeof MediaRecorder !== "undefined") {
      // Fallback: let the browser record a file, then decode it.
      const deler = [];
      const opptaker = new MediaRecorder(strom);
      opptaker.ondataavailable = (ev) => ev.data && ev.data.size && deler.push(ev.data);
      opptaker.onstop = async () => {
        slutt();
        try {
          const data = await new Blob(deler, { type: opptaker.mimeType }).arrayBuffer();
          const buf = await new Promise((ok, nei) => c.decodeAudioData(data, ok, nei));
          ferdigOpptak(hvilken, new Float32Array(buf.getChannelData(0)), buf.sampleRate, `fil ${opptaker.mimeType}`);
        } catch (e) {
          feil("dekoding", e);
        }
      };
      opptaker.start();
      const vakt = setTimeout(() => rydd(), MAKS_SEK * 1000);
      rydd = () => {
        if (ferdig) return;
        ferdig = true;
        clearTimeout(vakt);
        opptaker.stop();
      };
    } else {
      slutt();
      si("opptak: nettleseren kan verken gi rå lyd eller ta opp en fil");
      $("sperret").hidden = false;
      return;
    }
    pagar = { stopp: () => rydd() };
    knapp.textContent = "Stopp";
    knapp.classList.add("pa");
  }

  function spill(hvilken, baklengs, fart) {
    const b = lyd[hvilken];
    if (!b || pagar) return;
    stoppSpill();
    const c = kontekst();
    okt("playback");
    let buf = b;
    if (baklengs) {
      buf = c.createBuffer(1, b.length, b.sampleRate);
      const inn = b.getChannelData(0), ut = buf.getChannelData(0);
      for (let i = 0, n = inn.length; i < n; i++) ut[i] = inn[n - 1 - i];
    }
    const k = c.createBufferSource();
    k.buffer = buf;
    k.playbackRate.value = fart;
    k.connect(c.destination);
    k.onended = () => {
      if (spiller === k) spiller = null;
    };
    try {
      k.start();
      spiller = k;
      si(`spiller ${hvilken}${baklengs ? " baklengs" : " vanlig"}${fart !== 1 ? " sakte" : ""}: ${(buf.duration / fart).toFixed(2)} s`);
    } catch (e) {
      feil("avspilling", e);
    }
  }

  function nyttOrd() {
    let o;
    do o = ORD[Math.floor(Math.random() * ORD.length)];
    while (ORD.length > 1 && `«${o}»` === $("ord").textContent);
    $("ord").textContent = `«${o}»`;
  }

  // ---------- Start ----------
  const ua = navigator.userAgent;
  const app = /FBAN|FBAV|FB_IAB|Instagram|Messenger|TikTok|musical_ly|Snapchat|LinkedInApp|Line\//i.exec(ua);
  si(`nettleser: ${ua}`);
  si(`innebygd app-nettleser: ${app ? `ja (${app[0]})` : "nei, ser ut som en vanlig nettleser"}`);
  si(`sikker side: ${window.isSecureContext}, mikrofon-API: ${!!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)}, filopptak: ${typeof MediaRecorder !== "undefined"}, lydøkt-API: ${!!navigator.audioSession}`);
  nyttOrd();
  vis();
  $("nytt").addEventListener("click", nyttOrd);
  $("ta1").addEventListener("click", () => taOpp("a").catch((e) => feil("opptak", e)));
  $("ta2").addEventListener("click", () => taOpp("b").catch((e) => feil("opptak", e)));
  $("bak1").addEventListener("click", () => spill("a", true, 1));
  $("sakte1").addEventListener("click", () => spill("a", true, 0.7));
  $("rett1").addEventListener("click", () => spill("a", false, 1));
  $("bak2").addEventListener("click", () => spill("b", true, 1));
  $("rett2").addEventListener("click", () => spill("b", false, 1));
  $("kopier").addEventListener("click", async () => {
    const felt = $("rapport");
    try {
      await navigator.clipboard.writeText(felt.value);
      $("kopier").textContent = "Kopiert";
    } catch (e) {
      felt.focus();
      felt.select();
      $("kopier").textContent = "Marker og kopier selv";
    }
  });
  // For the automatic test: what the page holds, never the sound itself.
  window.__baklengs = { tilstand: () => ({ a: lyd.a ? lyd.a.duration : 0, b: lyd.b ? lyd.b.duration : 0, opptak: !!pagar, spiller: !!spiller }) };
})();
