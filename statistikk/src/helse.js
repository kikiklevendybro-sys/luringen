// Is the rooms Worker (playing on the net) up? Asked when the owner opens the dashboard.
//
// This is the only request the statistics Worker ever makes: GET to a fixed address from
// oppsett.js, with no body, no headers of our own and nothing about anyone, and nothing from the
// answer is stored. `hent` is the fetch function (a fake one in the tests).
import { NETT_HELSE, HELSE_FRIST_MS } from "./oppsett.js";

export async function sjekkNett({ hent = (url, valg) => fetch(url, valg), adresse = NETT_HELSE, frist = HELSE_FRIST_MS, klokke = () => Date.now() } = {}) {
  if (!adresse || typeof hent !== "function") return { av: true };
  const start = klokke();
  try {
    const svar = await hent(adresse, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(frist) });
    const tekst = String(await svar.text()).slice(0, 100).trim();
    const ms = klokke() - start;
    if (svar.status === 200 && tekst === "rusj-nett: ok") return { ok: true, ms };
    return { ok: false, ms, status: svar.status, grunn: `svarte noe annet (status ${svar.status})` };
  } catch (e) {
    const tidsfrist = e && (e.name === "TimeoutError" || e.name === "AbortError");
    return { ok: false, ms: klokke() - start, grunn: tidsfrist ? `svarte ikke innen ${frist / 1000} sekunder`.replace(".", ",") : "kom ikke fram" };
  }
}
