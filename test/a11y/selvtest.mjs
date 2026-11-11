// rusj a11y — self-test of the checker: selvtest-web/index.html breaks every rule on purpose, once.
// Fails (exit 1) when a rule that should fire stays silent, or one fires that should not.
// Usage: node test/a11y/selvtest.mjs
import { fileURLToPath } from "node:url";
import { startChrome, startTjener } from "../chrome.mjs";
import { lagA11y } from "./a11y.mjs";

const VENTET = ["navn-mangler", "navn-bare-symbol", "mal-24", "mal-44", "kontrast", "h1-antall", "overskrift-hopp", "overskrift-tom", "felt-uten-etikett", "felt-bare-plassholder", "felt-uten-synlig-etikett", "tabindex-positiv", "aria-feil-rolle", "aria-hidden-fokus", "duplikat-id", "svg-ikke-skjult", "bilde-uten-alt", "lerret-uten-alternativ", "klikk-uten-tastatur", "rolle-uten-fokus", "rolle-ugyldig", "aria-label-uten-rolle", "navn-uten-synlig-tekst", "aria-ref-mangler", "nestet-kontroll", "live-flyktig", "live-assertiv", "live-i-kontroll", "engelsk-mistenkt", "tekst-klippet", "fokus-usynlig", "fokus-skjult", "lang-mangler", "tittel-mangler", "zoom-sperret"];

const tjener = await startTjener(fileURLToPath(new URL("./selvtest-web", import.meta.url)));
const c = await startChrome({ bredde: 390, hoyde: 844 });
let feil = 0;
try {
  const a11y = await lagA11y(c, { id: "selvtest" });
  await c.lastSide(tjener.url + "/");
  const post = await a11y.sjekk("selvtest");
  if (post.feil) throw new Error(post.feil);
  const funnet = new Set([...post.funn, ...post.usikre].map((f) => f.regel));
  const mangler = VENTET.filter((r) => !funnet.has(r));
  const uventet = Array.from(funnet).filter((r) => !VENTET.includes(r));
  feil = mangler.length + uventet.length;
  console.log(feil ? `✗ mangler: ${mangler.join(", ") || "–"} · uventet: ${uventet.join(", ") || "–"}` : `✓ alle ${VENTET.length} reglene slo til, ingen andre`);
} finally {
  await c.lukk();
  tjener.lukk();
}
process.exit(feil ? 1 : 0);
