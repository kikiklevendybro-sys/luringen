// Writes src/spilliste.js from the games in the repository (rusj/spill/*/spill.json + Luringen).
// Run it from anywhere:   node statistikk/oppdater-spilliste.mjs
// Then run the tests and deploy the Worker again — the dashboard gets its game names and its
// list of daily puzzles from that file. (test/oppsett.test.mjs fails when the file is out of date.)
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";

const spillmappe = new URL("../rusj/spill/", import.meta.url);
const ut = new URL("./src/spilliste.js", import.meta.url);

export function lesSpill() {
  // Luringen is the first game and lives in src/, not in rusj/spill/.
  const spill = [{ id: "luringen", navn: "Luringen", daglig: false, rekkefolge: 0 }];
  for (const mappe of readdirSync(spillmappe, { withFileTypes: true })) {
    const fil = new URL(`${mappe.name}/spill.json`, spillmappe);
    if (!mappe.isDirectory() || !existsSync(fil)) continue;
    const fakta = JSON.parse(readFileSync(fil, "utf8"));
    if (!/^[a-z0-9]{2,24}$/.test(fakta.id) || typeof fakta.navn !== "string") throw new Error(`${mappe.name}/spill.json: id or navn cannot be used`);
    spill.push({ id: fakta.id, navn: fakta.navn, daglig: (fakta.tagger || []).includes("daglig"), rekkefolge: Number(fakta.rekkefolge) || 0 });
  }
  return spill;
}

export function somFil(spill) {
  const etterId = spill.slice().sort((a, b) => (a.id < b.id ? -1 : 1));
  const daglige = spill.filter((s) => s.daglig).sort((a, b) => a.rekkefolge - b.rekkefolge || (a.id < b.id ? -1 : 1));
  return `// Written by statistikk/oppdater-spilliste.mjs from rusj/spill/*/spill.json — do not edit by hand.

// Every game on rusj.no: id (its folder, rusj.no/<id>/) → the name shown in the dashboard.
export const SPILL = {
${etterId.map((s) => `  ${s.id}: ${JSON.stringify(s.navn)},`).join("\n")}
};

// The daily puzzles («Dagens rusj»): the games tagged "daglig", in front-page order.
export const DAGLIGE = ${JSON.stringify(daglige.map((s) => s.id))};
`;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const spill = lesSpill();
  writeFileSync(ut, somFil(spill));
  console.log(`src/spilliste.js: ${spill.length} spill, ${spill.filter((s) => s.daglig).length} daglige (${spill.filter((s) => s.daglig).map((s) => s.id).join(", ")})`);
}
