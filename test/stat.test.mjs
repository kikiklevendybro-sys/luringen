// Anonymous statistics on the site: the switch in scripts/rusj.mjs, and the sender
// (rusj/kit/stat.js) — whose own tests live with the Worker in statistikk/test/klient.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CSP, lagCsp, statOpprinnelse, statFil, STAT_ADRESSE } from "../scripts/rusj.mjs";
import "../statistikk/test/klient.test.mjs";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");

test("statistics off: the CSP allows no outside request and no stat.js is made", () => {
  assert.equal(lagCsp(""), lagCsp(statOpprinnelse("")));
  assert.match(lagCsp(""), /connect-src 'self';/);
  assert.equal(statFil(ROT, ""), null);
  if (!STAT_ADRESSE) assert.equal(CSP, lagCsp(""));
});

test("statistics on: only the Worker's origin is added to connect-src", () => {
  const csp = lagCsp("https://rusj-statistikk.eksempel.workers.dev");
  assert.match(csp, /connect-src 'self' https:\/\/rusj-statistikk\.eksempel\.workers\.dev;/);
  assert.equal(csp.replace(" https://rusj-statistikk.eksempel.workers.dev", ""), lagCsp(""));
  const fil = statFil(ROT, "https://rusj-statistikk.eksempel.workers.dev");
  assert.ok(fil.innhold.startsWith('window.RUSJ_STAT="https://rusj-statistikk.eksempel.workers.dev";\n'));
  assert.match(fil.sti, /^\/felles\/stat\.js\?v=/);
});

test("the address must be a bare https origin (or localhost for tests)", () => {
  assert.equal(statOpprinnelse("https://a.workers.dev/"), "https://a.workers.dev");
  assert.equal(statOpprinnelse("http://127.0.0.1:9"), "http://127.0.0.1:9");
  for (const feil of ["http://a.workers.dev", "https://a.workers.dev/t", "https://a.workers.dev/?x=1", "https://u:p@a.workers.dev", "javascript:alert(1)", "ftp://a.dev"]) {
    assert.throws(() => statOpprinnelse(feil), feil);
  }
});
