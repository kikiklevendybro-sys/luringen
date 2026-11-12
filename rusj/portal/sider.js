/* rusj.no – the pages about rusj. One job: the button on /personvern/ that removes everything rusj
   has stored in this browser (names, settings, games, the offline copy). It asks first.
   Runs in the browser only; nothing is sent anywhere. */
(function () {
  "use strict";

  const knapp = document.getElementById("slett-alt");
  if (!knapp) return;
  const status = document.getElementById("slett-status");
  const dialog = document.getElementById("dialog");
  const T = window.RusjTekst;
  const t = T.t;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // Everything rusj writes starts with «rusj.» – and Luringen's with «luringen.».
  const erVar = (nokkel) => !!nokkel && (nokkel.startsWith("rusj.") || nokkel.startsWith("luringen."));
  function nokler() {
    const ut = [];
    try {
      for (let i = 0; i < localStorage.length; i++) if (erVar(localStorage.key(i))) ut.push(localStorage.key(i));
    } catch (e) {
      /* storage is blocked: then nothing is stored either */
    }
    return ut;
  }

  // Is there a copy of the games for playing without a connection?
  async function harKopi() {
    try {
      return !!window.caches && (await caches.keys()).length > 0;
    } catch (e) {
      return false;
    }
  }

  async function visStatus() {
    const n = nokler().length;
    const kopi = await harKopi();
    status.textContent = n
      ? kopi
        ? t("Akkurat nå ligger det {n} lagret oppføring fra rusj i denne nettleseren, og en kopi av spillene for bruk uten nett.|Akkurat nå ligger det {n} lagrede oppføringer fra rusj i denne nettleseren, og en kopi av spillene for bruk uten nett.", { n })
        : t("Akkurat nå ligger det {n} lagret oppføring fra rusj i denne nettleseren.|Akkurat nå ligger det {n} lagrede oppføringer fra rusj i denne nettleseren.", { n })
      : kopi
        ? t("Akkurat nå ligger det bare en kopi av spillene for bruk uten nett i denne nettleseren.")
        : t("Akkurat nå ligger det ingenting fra rusj i denne nettleseren.");
  }

  // «Are you sure?» – in the site's own dialog, with the harmless answer in focus.
  function sporr() {
    if (!dialog || !dialog.showModal) return Promise.resolve(window.confirm(t("Slette alt rusj har lagret på denne enheten? Det kan ikke angres.")));
    return new Promise((ferdig) => {
      dialog.innerHTML = `
        <h2 id="dialog-tittel">${esc(t("Slette alt på denne enheten?"))}</h2>
        <p>${esc(t("Navn, innstillinger, spill som pågår, rekorder og den nedlastede kopien av spillene fjernes fra denne nettleseren. Det kan ikke angres."))}</p>
        <div class="dialog-knapper stabel">
          <button type="button" class="knapp rod" value="ja">${esc(t("Ja, slett alt"))}</button>
          <button type="button" class="knapp-2" value="nei" autofocus>${esc(t("Avbryt"))}</button>
        </div>`;
      let svart = false;
      const svar = (ja) => {
        if (svart) return;
        svart = true;
        if (dialog.open) dialog.close();
        ferdig(ja);
      };
      dialog.querySelector('[value="ja"]').addEventListener("click", () => svar(true));
      dialog.querySelector('[value="nei"]').addEventListener("click", () => svar(false));
      dialog.addEventListener("close", () => svar(false), { once: true }); // Escape
      dialog.showModal();
    });
  }

  async function slettAlt() {
    // 1. Names, settings, games in progress, records …
    try {
      for (const n of nokler()) localStorage.removeItem(n);
    } catch (e) {
      /* ignore */
    }
    // 2. The copy of the games kept for playing without a connection.
    try {
      if (window.caches) await Promise.all((await caches.keys()).map((n) => caches.delete(n)));
    } catch (e) {
      /* ignore */
    }
    // 3. The helper that keeps that copy up to date (it comes back the next time rusj is opened).
    try {
      if (navigator.serviceWorker) await Promise.all((await navigator.serviceWorker.getRegistrations()).map((r) => r.unregister()));
    } catch (e) {
      /* ignore */
    }
  }

  knapp.addEventListener("click", async () => {
    if (!(await sporr())) {
      knapp.focus();
      return;
    }
    knapp.disabled = true;
    await slettAlt();
    knapp.disabled = false;
    status.textContent = nokler().length || (await harKopi()) ? t("Noe kunne ikke slettes. Prøv å slette nettstedsdata for rusj.no i innstillingene til nettleseren.") : t("Slettet. Det ligger ikke lenger noe fra rusj i denne nettleseren.");
    knapp.focus();
  });

  visStatus();
})();
