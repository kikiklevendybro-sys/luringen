/* rusj.no – /merker/ «Klistremerkeboka». The album is drawn by the build (every sticker as a
   silhouette); this colours the ones this phone has earned, with the day, counts them and shares
   the count. It also gives stickers that follow from what is stored already (the same rules as the
   kit, rusj/kit/merker.js). Reads and writes this browser's storage only; nothing is sent. */
(function () {
  "use strict";

  const M = window.RusjMerker;
  const K = window.RUSJ_MERKER;
  if (!M || !K) return;
  const $ = (s) => document.querySelector(s);

  const les = (n, standard) => {
    try {
      const v = localStorage.getItem("rusj." + n);
      return v == null ? standard : JSON.parse(v);
    } catch (e) {
      return standard;
    }
  };
  const skriv = (n, v) => {
    try {
      localStorage.setItem("rusj." + n, JSON.stringify(v));
    } catch (e) {
      /* the book just isn't remembered */
    }
  };
  const fjern = (n) => {
    try {
      localStorage.removeItem("rusj." + n);
    } catch (e) {
      /* ignore */
    }
  };

  // Today in Norway as a day number (days since 1970 of the Oslo date), as R.dag() in the kit.
  function iDag() {
    const naa = new Date();
    let a, m, d;
    try {
      const deler = {};
      for (const p of new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Oslo", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(naa)) deler[p.type] = Number(p.value);
      a = deler.year;
      m = deler.month;
      d = deler.day;
    } catch (e) {
      /* fall through */
    }
    if (!(a > 0 && m > 0 && d > 0)) {
      a = naa.getFullYear();
      m = naa.getMonth() + 1;
      d = naa.getDate();
    }
    return Math.floor(Date.UTC(a, m - 1, d) / 86400000);
  }
  const MANEDER = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"];
  function datoTekst(nr, idag) {
    if (nr === idag) return "Fått i dag";
    if (nr === idag - 1) return "Fått i går";
    const d = new Date(nr * 86400000);
    const ar = d.getUTCFullYear() !== new Date(idag * 86400000).getUTCFullYear() ? " " + d.getUTCFullYear() : "";
    return `Fått ${d.getUTCDate()}. ${MANEDER[d.getUTCMonth()]}${ar}`;
  }

  const lesListe = (n) => {
    const l = les(n, []);
    return Array.isArray(l) ? l.filter((x) => typeof x === "string") : [];
  };

  function tegn() {
    const idag = iDag();
    let bok = M.rens(les("merker", {}), K);
    // Catch up: stickers that follow from what is stored (e.g. a streak from before the book existed).
    const kilde = { daglig: les("daglig", {}), kveld: les("kveld", null), spilt: lesListe("spilt"), iDag: idag, naa: Date.now() };
    const { lagret, nye } = M.tildel(bok, Array.from(M.utled(K, kilde)), K, idag);
    if (nye.length) {
      bok = lagret;
      skriv("merker", bok);
    }
    // Seen here: the games need not celebrate these again.
    if (lesListe("merkerNye").length) fjern("merkerNye");

    const antall = Object.keys(bok).length;
    for (const li of document.querySelectorAll(".bok-merke")) {
      const nr = bok[li.dataset.merke];
      const fatt = Number.isInteger(nr);
      li.classList.toggle("fatt", fatt);
      li.classList.toggle("ny", fatt && nr >= idag - 1);
      const dato = li.querySelector(".bok-dato");
      dato.hidden = !fatt;
      dato.textContent = fatt ? datoTekst(nr, idag) : "";
      li.setAttribute("aria-label", `${li.querySelector(".bok-navn").textContent}: ${fatt ? dato.textContent.toLowerCase() : "ikke fått ennå. " + li.querySelector(".bok-hvordan").textContent}`);
    }
    for (const el of document.querySelectorAll(".bok-gruppe-antall")) {
      const i = K.merker.filter((m) => m.gruppe === el.dataset.gruppe);
      const n = i.filter((m) => bok[m.id]).length;
      el.textContent = `${n} av ${i.length}`;
      el.classList.toggle("full", n === i.length);
    }
    $("#bok-antall").textContent = antall;
    $("#bok-mal").setAttribute("aria-valuenow", String(antall));
    $("#bok-mal-fyll").style.width = `${Math.round((antall / K.merker.length) * 100)}%`;
    $("#bok-tom").hidden = antall > 0;
    $("#bok-del").hidden = antall === 0;
    return antall;
  }

  let antall = tegn();
  // Another tab (a game) earned one: draw again.
  window.addEventListener("storage", (e) => {
    if (e.key && e.key.startsWith("rusj.")) antall = tegn();
  });

  // «Del boka»: only the count – no names, nothing personal.
  $("#bok-del").addEventListener("click", async () => {
    const url = location.origin && location.origin.startsWith("http") ? location.origin + "/merker/" : "https://rusj.no/merker/";
    const tekst = `Jeg har samlet ${antall} av ${K.merker.length} klistremerker på rusj 📒✨ Hvor mange har du?`;
    const status = $("#bok-delt");
    status.textContent = "";
    try {
      if (navigator.share) {
        await navigator.share({ title: "Klistremerkeboka på rusj", text: tekst, url });
        return;
      }
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(`${tekst} ${url}`);
      status.textContent = "Kopiert! Lim inn der du vil dele.";
    } catch (e) {
      status.textContent = `${tekst} ${url}`;
    }
  });
})();
