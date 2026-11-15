// «Spill med en venn på nett» end to end: two (or more) phones – separate headless Chromes with their
// own profiles – play a game against each other through the real rooms Worker, run locally with
// `wrangler dev` (it needs no Cloudflare login). For each game: the invite flow (link, nickname,
// waiting room), a whole match to the end, one phone closing its tab mid-match and coming back
// (the match is replayed from the room), a phone that finds the room full, «Ny kamp», leaving,
// and that the game saved on the phone before going online is exactly as it was afterwards.
//
//   node scripts/bygg.mjs --ut build/web-nett-e2e   (with RUSJ_NETT_ADRESSE=http://127.0.0.1:8799)
//   node test/nett-e2e.mjs --web build/web-nett-e2e [--bilder dir] [--sprak en] [--bredde 320 --hoyde 568] [ids]
//
// --port P: the Worker's port (default 8799). It is started here unless one already answers there.
// The scenarios are in test/nett/<id>.mjs: export default async function (t, a, b, …).
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { startChrome, startTjener } from "./chrome.mjs";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flagg = (n) => {
  const i = args.indexOf(n);
  if (i < 0) return null;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const WEB = resolve(flagg("--web") || join(ROT, "build/web-nett-e2e"));
const BILDER = resolve(flagg("--bilder") || join(tmpdir(), "rusj-nett-e2e"));
const BREDDE = Number(flagg("--bredde")) || 390;
const HOYDE = Number(flagg("--hoyde")) || 844;
const PORT = Number(flagg("--port")) || 8799;
const SPRAK = flagg("--sprak");
const WORKER = `http://127.0.0.1:${PORT}`;
const sov = (ms) => new Promise((r) => setTimeout(r, ms));

const NORSKE = {
  en: new Set("og ikke er på med som har kan vil det et av du dere deg din ditt dine jeg meg hva når nå igjen spill spillet spiller spillere mobilen runde runder trekk poeng vinner avslutt fortsett angre lukk tilbake ferdig neste velg trykk spill rommet kampen venter".split(" ")),
  da: new Set("spill trykk velg igjen noe fortsett avslutt lukk uavgjort brettet deg meg dere hva gjør ble brikka rommet kampen".split(" ")),
};
const norskOrd = (tekst) => {
  const ren = String(tekst).replace(/Testspiller [A-Z]/g, " ");
  if (SPRAK === "en" && /[æøå]/i.test(ren)) return true;
  return (ren.toLocaleLowerCase("nb").match(/[a-zæøå]+/g) || []).some((o) => NORSKE[SPRAK].has(o));
};

// ---------- The Worker ----------
async function svarer() {
  try {
    return (await (await fetch(WORKER + "/", { signal: AbortSignal.timeout(1500) })).text()).startsWith("rusj-nett");
  } catch (e) {
    return false;
  }
}
let wrangler = null;
if (!(await svarer())) {
  wrangler = spawn("npx", ["--yes", "wrangler@4.160.0", "dev", "--port", String(PORT), "--ip", "127.0.0.1", "--var", "LOKAL:1", "--show-interactive-dev-session=false"], { cwd: join(ROT, "nett"), stdio: "ignore", detached: true });
  for (let i = 0; i < 120 && !(await svarer()); i++) await sov(500);
  if (!(await svarer())) {
    console.error(`Fikk ikke startet rusj-nett lokalt på ${WORKER} (npx wrangler@4.160.0 dev i nett/).`);
    process.exit(1);
  }
}
const stoppWorker = () => {
  if (wrangler) {
    try {
      process.kill(-wrangler.pid, "SIGTERM");
    } catch (e) {
      /* already gone */
    }
  }
};

// ---------- The site ----------
if (!existsSync(join(WEB, "felles/nett.js"))) {
  console.error(`Fant ikke ${WEB}/felles/nett.js – bygg med RUSJ_NETT_ADRESSE=${WORKER} node scripts/bygg.mjs --ut ${WEB}`);
  stoppWorker();
  process.exit(1);
}
const adresse = /window\.RUSJ_NETT="([^"]+)"/.exec(readFileSync(join(WEB, "felles/nett.js"), "utf8"));
if (!adresse || adresse[1] !== WORKER) {
  console.error(`${WEB} er bygget for ${adresse && adresse[1]}, ikke ${WORKER}`);
  stoppWorker();
  process.exit(1);
}
const tjener = await startTjener(WEB);
const sideFor = (id) => {
  if (!SPRAK) return `/${id}/`;
  for (const d of readdirSync(join(WEB, SPRAK))) {
    const fil = join(WEB, SPRAK, d, "data.js");
    if (existsSync(fil) && readFileSync(fil, "utf8").includes(`"id":"${id}"`)) return `/${SPRAK}/${d}/`;
  }
  throw new Error(`${id} finnes ikke på ${SPRAK}`);
};

const SCENARIER = readdirSync(join(ROT, "test/nett")).filter((f) => f.endsWith(".mjs")).map((f) => f.replace(/\.mjs$/, ""));
const valgt = args.length ? args : SCENARIER;
const resultat = [];

// ---------- One phone ----------
async function telefon(navn, id, t, valg = {}) {
  const c = await startChrome({ bredde: BREDDE, hoyde: HOYDE });
  if (valg.rolig) await c.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  const mappe = join(BILDER, id);
  mkdirSync(mappe, { recursive: true });
  const p = {
    ...c,
    navn,
    side: `${tjener.url}${sideFor(id)}`,
    // Fresh phone: empty storage, sound off, then the game's page.
    // navn: the names this phone already uses in the games (the kit's shared names).
    async apne(url = p.side, navn = []) {
      await c.lastSide(p.side);
      await c.js("localStorage.clear()");
      await c.js(`localStorage.setItem("rusj.felles", ${JSON.stringify(JSON.stringify({ lyd: false, navn }))})`);
      // (A link to the same page with only another #hash would not load the page again.)
      if (url !== p.side) await c.lastSide("about:blank");
      await c.lastSide(url, "document.querySelector('#skjerm h1')");
    },
    // Tap something that sends a move; tap again if the game was still busy (a disc falling) and
    // nothing happened. ferdig: an expression that is true once the move has been played.
    async trekk(sel, ferdig, ms = 8000) {
      for (let forsok = 0; forsok < 4; forsok++) {
        await c.klikk(sel);
        try {
          await c.vent(ferdig, forsok < 3 ? 1500 : ms);
          return;
        } catch (e) {
          if (forsok === 3) throw e;
        }
      }
    },
    skjerm: () => c.js("window.Rusj && Rusj.S && Rusj.S.skjerm"),
    minTur: () => c.js(`document.documentElement.getAttribute("data-nett-tur") === "meg"`),
    tittel: () => c.js(`document.querySelector("#topp-tittel").textContent`),
    spill: () => c.js("JSON.parse(JSON.stringify(Rusj.S.spill))"),
    nettMeg: () => c.js("Rusj.nett.meg()"),
    async ventSkjerm(navn, ms = 15000) {
      await c.vent(`window.Rusj && Rusj.S && Rusj.S.skjerm === ${JSON.stringify(navn)}`, ms);
      await sov(250);
    },
    async ventTur(ms = 15000) {
      await c.vent(`document.documentElement.getAttribute("data-nett-tur") === "meg"`, ms);
    },
    // Screenshot + the checks that apply to every screen.
    async bilde(hva) {
      await sov(300);
      const bred = await c.js(`Math.max(document.documentElement.scrollWidth, window.innerWidth) - ${BREDDE}`);
      if (bred > 0) t.feil(`${navn}: sidelengs scrolling på «${hva}» (${bred}px)`);
      const tomme = await c.js(`Array.from(document.querySelectorAll("button, a")).filter(b => b.offsetParent && !b.innerText.trim() && !b.getAttribute("aria-label") && !b.querySelector("svg, img")).length`);
      if (tomme) t.feil(`${navn}: ${tomme} knapp(er) uten navn på «${hva}»`);
      const utenfor = await c.js(`(() => {
        const ut = [];
        for (const el of document.querySelectorAll("#skjerm *, .ark *, .nett-boble *")) {
          if (el.closest("svg, [data-utenfor-ok]")) continue;
          let rulles = false;
          for (let f = el.parentElement; f && f !== document.body; f = f.parentElement) if (/(auto|scroll)/.test(getComputedStyle(f).overflowX)) { rulles = true; break; }
          if (rulles || !Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
          const b = el.getBoundingClientRect();
          if (!b.width || !b.height || getComputedStyle(el).visibility === "hidden") continue;
          if (b.right > innerWidth + 2 || b.left < -2) ut.push(el.tagName.toLowerCase() + " «" + el.textContent.trim().slice(0, 30) + "»");
        }
        return ut.slice(0, 3);
      })()`);
      if (utenfor.length) t.feil(`${navn}: tekst utenfor skjermen på «${hva}»: ${utenfor.join(", ")}`);
      if (SPRAK) {
        const lang = await c.js("document.documentElement.lang");
        if (lang !== SPRAK) t.feil(`${navn}: <html lang="${lang}"> på «${hva}»`);
        const tekster = await c.js(`(() => {
          const ut = [];
          const synlig = (el) => { if (el.closest("[hidden], svg, script, style, template, noscript, .om-spillet")) return false; const s = getComputedStyle(el); if (s.display === "none" || s.visibility === "hidden") return false; const b = el.getBoundingClientRect(); return b.width > 0 || b.height > 0; };
          const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          for (let n = w.nextNode(); n; n = w.nextNode()) { const el = n.parentElement; const x = n.textContent.trim(); if (x && el && !el.closest("[lang]:not(html)") && synlig(el)) ut.push(x); }
          for (const el of document.querySelectorAll("[aria-label], [placeholder]")) if (synlig(el)) for (const a of ["aria-label", "placeholder"]) if (el.getAttribute(a)) ut.push(el.getAttribute(a));
          return ut;
        })()`);
        const norsk = [...new Set(tekster.filter(norskOrd))];
        if (norsk.length) t.feil(`${navn}: norsk tekst på «${hva}» (${SPRAK}): ${norsk.slice(0, 4).map((x) => `«${x.slice(0, 60)}»`).join(", ")}`);
      }
      await c.skjermbilde(join(mappe, `${String(++t.nr).padStart(2, "0")}-${navn}-${hva}.png`));
    },
  };
  return p;
}

// ---------- Shared steps ----------
function lagT(id) {
  const feil = [];
  const telefoner = [];
  const t = {
    id,
    nr: 0,
    norsk: !SPRAK,
    sprak: SPRAK || "nb",
    url: tjener.url,
    nokkel: (n) => `rusj.${SPRAK ? SPRAK + "." : ""}${n}`,
    feil: (m) => feil.push(m),
    sjekk: (ok, m) => {
      if (!ok) feil.push(m);
    },
    sov,
    async telefon(navn, valg) {
      const p = await telefon(navn, id, t, valg);
      telefoner.push(p);
      return p;
    },
    // The host makes a room; returns the invite link.
    // One tap on the game's home screen: the room is made and the invite comes up. The host's
    // nickname is the first of its shared names (kallenavn: set as that name first).
    async lagRom(a, kallenavn) {
      if (kallenavn != null) await a.js(`Rusj.felles.navn[0] = ${JSON.stringify(kallenavn)}`);
      await a.bilde("hjem-med-knapp");
      await a.klikk('[data-h="nett-apne"]');
      await a.ventSkjerm("nett");
      await a.vent("document.querySelector('.nett-invitasjon')", 15000);
      if (kallenavn != null) t.sjekk((await a.js("Rusj.nett.navn(0)")) === kallenavn, `Vertens kallenavn er ikke ${kallenavn}`);
      const lenke = await a.js(`location.origin + location.pathname + "#nett=" + document.querySelector(".nett-invitasjon .etikett").textContent.trim().split(" ").pop()`);
      t.sjekk(/#nett=[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/.test(lenke), `Invitasjonslenken ser feil ut: ${lenke}`);
      const vist = await a.tekst(".nett-lenke");
      t.sjekk(lenke.endsWith(vist.replace(/^.*?\//, "/")), `Lenken i arket («${vist}») er ikke ${lenke}`);
      t.sjekk(await a.finnes(".nett-invitasjon .qr svg"), "Invitasjonen har ingen QR-kode");
      await a.bilde("invitasjon");
      await a.klikk('#ark [data-h="lukk-ark"]');
      return lenke;
    },
    // A friend opens the link and joins.
    // A friend opens the link and joins with one tap: the nickname field is already filled in
    // from its shared names.
    async bliMed(b, lenke, kallenavn) {
      await b.apne(lenke, kallenavn != null ? [kallenavn] : []);
      await b.ventSkjerm("nett");
      t.sjekk((await b.js("location.hash")) === "", "Koden står igjen i adressen etter at lenken er åpnet");
      if (kallenavn != null) t.sjekk((await b.js(`document.querySelector("#nett-navn").value`)) === kallenavn, "Kallenavnet er ikke fylt inn fra navnene på mobilen");
      await b.bilde("bli-med");
      await b.klikk('[data-h="nett-bli"]');
    },
    // A phone closes its tab and opens the game again: back into the same match.
    // nokkel: the part of the game state that must be the same after the replay.
    async gjenoppkoble(p, sjekkHos, nokkel = (sp) => sp.trekk ?? sp) {
      const for_ = await p.spill();
      await p.js("location.href = 'about:blank'");
      await sov(1200);
      if (sjekkHos) {
        await sjekkHos.vent(`!document.querySelector("#nett-rom") || document.querySelector(".nett-seter") || true`);
        const tittel = await sjekkHos.tittel();
        if (t.norsk && (await sjekkHos.js("Rusj.nett.aktiv()")) && !(await sjekkHos.minTur())) t.sjekk(/^Venter på /.test(tittel), `Tittelen hos ${sjekkHos.navn} mens ${p.navn} er borte: «${tittel}»`);
        await sjekkHos.bilde("venn-borte");
      }
      await p.lastSide(p.side, "document.querySelector('#skjerm h1')");
      await p.vent("window.Rusj && Rusj.nett && Rusj.nett.aktiv()", 15000);
      await sov(600);
      const etter = await p.spill();
      t.sjekk(JSON.stringify(nokkel(etter)) === JSON.stringify(nokkel(for_)), `${p.navn}: spillet ble ikke likt etter gjenoppkobling`);
      await p.bilde("tilbake-i-kampen");
      return etter;
    },
    // A phone that finds the room full (or started) gets the kind error screen.
    async fullt(lenke) {
      const c = await t.telefon("C");
      await c.apne(lenke);
      await c.ventSkjerm("nett");
      if (await c.finnes('[data-h="nett-bli"]')) await c.klikk('[data-h="nett-bli"]');
      await c.vent(`document.querySelector('[data-h="nett-ut"]')`, 15000);
      const h1 = await c.tekst("#skjerm h1");
      if (t.norsk) t.sjekk(/Rommet er fullt|Kampen har begynt/.test(h1), `Fullt rom: «${h1}»`);
      await c.bilde("rommet-er-fullt");
      await c.klikk('[data-h="nett-ut"]');
      await c.ventSkjerm("hjem");
      t.sjekk(!(await c.js("Rusj.paNett()")), "C er fortsatt «på nett» etter «Til spillet»");
      await c.lukk();
      telefoner.splice(telefoner.indexOf(c), 1);
    },
    // Leave on purpose; the phone is back on the game's home screen, offline again.
    async forlat(p) {
      if (await p.finnes('[data-h="nett-forlat"]')) await p.klikk('[data-h="nett-forlat"]');
      else await p.klikk("#tilbake"); // «back» in the top bar leaves the match, on every screen
      if (await p.finnes('#ark [data-h="ark-svar"][data-v="ja"]')) await p.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
      await p.ventSkjerm("hjem");
      t.sjekk(!(await p.js("Rusj.paNett()")), `${p.navn} er fortsatt «på nett» etter «Forlat»`);
      t.sjekk(!(await p.js(`JSON.parse(localStorage.getItem(${JSON.stringify(t.nokkel("nett"))}) || "{}").okter?.[${JSON.stringify(id)}]`)), `${p.navn}: økta ligger igjen i lagringen`);
    },
    async lukk() {
      for (const p of telefoner) await p.lukk();
    },
    feilene: () => [...feil, ...telefoner.flatMap((p) => p.feil.map((f) => `${p.navn}: ${f}`))],
  };
  return t;
}

for (const id of valgt) {
  const t = lagT(id);
  const start = Date.now();
  try {
    const scenario = (await import(pathToFileURL(join(ROT, "test/nett", `${id}.mjs`)).href)).default;
    await scenario(t);
  } catch (e) {
    t.feil(`Krasj: ${e.stack || e.message}`);
  }
  const feil = t.feilene();
  resultat.push({ id, feil, sek: Math.round((Date.now() - start) / 1000) });
  console.log(`${feil.length ? "✗" : "✓"} ${id}${SPRAK ? ` (${SPRAK})` : ""} ${BREDDE}×${HOYDE} – ${Math.round((Date.now() - start) / 1000)} s${feil.length ? "\n    " + feil.join("\n    ") : ""}`);
  await t.lukk();
}

tjener.lukk();
stoppWorker();
const feilet = resultat.filter((r) => r.feil.length);
console.log(`\n${resultat.length - feilet.length}/${resultat.length} spill på nett uten feil. Bilder: ${BILDER}`);
process.exit(feilet.length ? 1 : 0);
