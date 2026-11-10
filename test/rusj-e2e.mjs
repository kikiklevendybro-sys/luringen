// End-to-end check of rusj.no in headless Google Chrome on a phone-sized screen.
// For every game: loads the page, checks the basics (title, no errors, no sideways scrolling),
// then plays it through with test/spill/<id>.e2e.mjs if that file exists. Saves screenshots.
// Usage: node test/rusj-e2e.mjs [--web dist/web] [--bilder dir] [id ...]
//   ids: game ids, "forside" (front page) or "luringen". Default: everything that was built.
import { readdirSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
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
const WEB = resolve(flagg("--web") || join(ROT, "dist/web"));
const BILDER = resolve(flagg("--bilder") || join(tmpdir(), "rusj-e2e"));
// --probe: player names contain markup (<x-q>…</x-q>). Every screen is checked that the markup
// shows as text and never becomes an element. Only injection problems count as errors then.
const PROBE = args.includes("--probe");
if (PROBE) args.splice(args.indexOf("--probe"), 1);
// --bredde / --hoyde: phone size (default 390×844; try 320 568 for the smallest phones).
const BREDDE = Number(flagg("--bredde")) || 390;
const HOYDE = Number(flagg("--hoyde")) || 844;
if (!existsSync(join(WEB, "index.html"))) {
  console.error(`Fant ikke ${WEB}/index.html – kjør node scripts/bygg.mjs først.`);
  process.exit(1);
}
const bygget = readdirSync(WEB).filter((d) => existsSync(join(WEB, d, "index.html")) && existsSync(join(WEB, d, "data.js")));
const valgt = args.length ? args : ["forside", ...(existsSync(join(WEB, "luringen/index.html")) ? ["luringen"] : []), ...bygget];

const tjener = await startTjener(WEB);
const resultat = [];

function meta(id) {
  const tekst = readFileSync(join(WEB, id, "data.js"), "utf8");
  const m = /window\.RUSJ_SPILL=(\{.*?\});\n/.exec(tekst);
  return m ? JSON.parse(m[1]) : { id };
}

for (const id of valgt) {
  const mappe = join(BILDER, id);
  mkdirSync(mappe, { recursive: true });
  const c = await startChrome({ bredde: BREDDE, hoyde: HOYDE });
  const feil = [];
  let nr = 0;
  const t = {
    ...c,
    id,
    url: tjener.url,
    side: `${tjener.url}/${id === "forside" ? "" : id + "/"}`,
    feil: (m) => feil.push(m),
    sjekk: (ok, m) => {
      if (!ok) feil.push(m);
    },
    // Screenshot + checks that apply to every screen.
    async bilde(navn, helside = false) {
      await c.sov(350);
      if (PROBE) {
        const injisert = await c.js(`document.querySelectorAll("x-q").length`);
        if (injisert) feil.push(`HTML-INJEKSJON på «${navn}»: et spillernavn ble tolket som HTML (${injisert} element)`);
      }
      const bred = await c.js(`Math.max(document.documentElement.scrollWidth, window.innerWidth) - ${BREDDE}`);
      if (bred > 0) feil.push(`Sidelengs scrolling på «${navn}»: ${bred}px for bred (siden blir zoomet ut på mobil)`);
      const utenfor = await c.js(`(() => {
        const ut = [];
        for (const el of document.querySelectorAll("#skjerm *, .ark *, .portal-hoved *, .helt-slagord")) {
          if (el.closest("svg, .parade, canvas, [data-utenfor-ok]")) continue;
          let rulles = false; // inside a row that is meant to scroll sideways
          for (let f = el.parentElement; f && f !== document.body; f = f.parentElement) {
            if (/(auto|scroll)/.test(getComputedStyle(f).overflowX)) { rulles = true; break; }
          }
          if (rulles) continue;
          if (!Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
          const b = el.getBoundingClientRect();
          if (!b.width || !b.height) continue;
          const stil = getComputedStyle(el);
          if (stil.visibility === "hidden" || Number(stil.opacity) === 0) continue;
          if (b.right > window.innerWidth + 2 || b.left < -2) ut.push(el.tagName.toLowerCase() + "." + String(el.className).split(" ")[0] + " «" + el.textContent.trim().slice(0, 30) + "»");
        }
        return ut.slice(0, 3);
      })()`);
      if (utenfor.length) feil.push(`Tekst stikker utenfor skjermen på «${navn}»: ${utenfor.join(", ")}`);
      const tomme = await c.js(`Array.from(document.querySelectorAll("button, a")).filter(b => b.offsetParent && !b.innerText.trim() && !b.getAttribute("aria-label") && !b.querySelector("svg, img")).length`);
      if (tomme) feil.push(`${tomme} knapp(er) uten tekst eller aria-label på «${navn}»`);
      await c.skjermbilde(join(mappe, `${String(++nr).padStart(2, "0")}-${navn}.png`), { helside });
    },
    tilstand: () => c.js(`JSON.parse(localStorage.getItem("rusj.${id}.v1") || "null")`),
    // Fresh start: empty storage, load the page, wait for the game to draw.
    async start(valg = {}) {
      await c.lastSide(t.side);
      await c.js("localStorage.clear()");
      const navn = valg.navn && PROBE ? valg.navn.map((n, i) => `<x-q>${String.fromCharCode(65 + i)}</x-q>`) : valg.navn;
      if (navn) await c.js(`localStorage.setItem("rusj.felles", ${JSON.stringify(JSON.stringify({ lyd: false, navn }))})`);
      else await c.js(`localStorage.setItem("rusj.felles", JSON.stringify({ lyd: false, navn: [] }))`);
      await c.lastSide(t.side, id === "forside" ? "document.querySelector('.spillgrid')" : "document.querySelector('#skjerm h1')");
    },
  };

  try {
    if (id === "forside") {
      // A headless page has no focus, so «focus» never fires; the search row moves itself on focus.
      await c.send("Emulation.setFocusEmulationEnabled", { enabled: true });
      const tast = async (key, vk) => {
        await c.send("Input.dispatchKeyEvent", { type: "keyDown", key, code: key, windowsVirtualKeyCode: vk });
        await c.send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key, windowsVirtualKeyCode: vk });
      };
      // Like c.vent, but an answer instead of an exception (one slow thing should not stop the rest).
      const venter = async (uttrykk, ms = 3000) => {
        try {
          await c.vent(uttrykk, ms);
          return true;
        } catch (e) {
          return false;
        }
      };
      await t.start();
      await c.sov(2600); // let the intro animation finish
      await t.bilde("forside");
      const kort = await c.antall("#spillgrid .spillkort");
      const liste = await c.js("(window.RUSJ_SPILLISTE || []).map((s) => s.id)");
      const ventet = bygget.length + (liste.includes("luringen") ? 1 : 0);

      // The words on top: «spill» and «selskapsleker», never «festspill» (that is an arts festival).
      const ord = await c.js(`({ tittel: document.title, slagord: document.querySelector(".helt-slagord").innerText.replace(/\\s+/g, " ").trim(), beskrivelse: document.querySelector('meta[name="description"]').content })`);
      t.sjekk(ord.slagord === "Spill for hele gjengen. Rett i nettleseren.", `Slagordet på forsiden: «${ord.slagord}»`);
      t.sjekk(/selskapsleker/.test(ord.tittel) && /selskapsleker/.test(ord.beskrivelse) && !/festspill/i.test(ord.tittel + ord.slagord + ord.beskrivelse), `Tittel eller beskrivelse på forsiden: «${ord.tittel}» / «${ord.beskrivelse}»`);
      // Structured data is an inline data block: the browser must be able to read it (and the
      // content rules must let it be – a violation ends up among the console errors below).
      const ld = await c.js(`(() => { try { const g = JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent)["@graph"]; return { typer: g.map((n) => n["@type"]), spill: g.find((n) => n["@type"] === "ItemList").itemListElement.length }; } catch (e) { return { feil: e.message }; } })()`);
      t.sjekk(!ld.feil && ld.typer.includes("WebSite") && ld.spill === ventet, `Strukturerte data på forsiden: ${ld.feil || `${(ld.typer || []).join(", ")}, ${ld.spill} spill (ventet ${ventet})`}`);
      // Drinking games are in the list but hidden until someone confirms being over 18.
      t.sjekk((await c.antall("#spillgrid .spillkort[data-alder18]:not([hidden])")) === 0 || (await c.js("document.body.classList.contains('over18')")), "Drikkespill vises før 18-årsbekreftelsen");
      t.sjekk(kort === ventet && liste.length === ventet, `Forsiden viser ${kort} spillkort, ventet ${ventet}`);
      for (const id of bygget) t.sjekk(liste.includes(id), `Forsiden mangler kortet for ${id}`);
      const synligeKort = (sel = "#spillgrid .spillkort") => c.js(`Array.from(document.querySelectorAll(${JSON.stringify(sel)})).filter((k) => k.offsetParent).length`);
      const alle = await synligeKort();

      // First visit: the install tip is one compact row on the first screen, and on an ordinary
      // phone a whole row of game cards fits under it.
      const forste = await c.js(`(() => { const k = document.querySelector(".hylle-rad .spillkort a"); const tips = document.querySelector("#installtips"); const b = tips.getBoundingClientRect(); return { kortBunn: k ? Math.round(k.getBoundingClientRect().bottom) : 0, tipsSynlig: !tips.hidden, tipsHoyde: Math.round(b.height), tipsBunn: Math.round(b.bottom), vh: innerHeight }; })()`);
      t.sjekk(forste.tipsSynlig && forste.tipsHoyde <= 48 && forste.tipsBunn <= forste.vh, `Installeringstipset er ikke én kompakt rad på første skjerm (${forste.tipsHoyde} px høyt, slutter på ${forste.tipsBunn} av ${forste.vh} px)`);
      if (BREDDE <= 430 && HOYDE >= 800) t.sjekk(forste.kortBunn > 0 && forste.kortBunn <= forste.vh, `Første rad med spillkort får ikke plass på første skjerm (slutter på ${forste.kortBunn} av ${forste.vh} px)`);
      const fakta = (await c.tekst(".helt-fakta")).replace(/\s+/g, " ");
      t.sjekk(/Ingen konto/.test(fakta) && !/apper/.test(fakta), `Faktaene under logoen: «${fakta}»`);

      // The numbers agree: the hero counts every game; the line over the list says how many show now
      // and how many wait behind the 18+ question. («Overrask meg» is checked against it further down.)
      const tall = () => c.js(`({ helt: Number(document.querySelector("#helt-antall").textContent), alle: (window.RUSJ_SPILLISTE || []).length, linje: document.querySelector("#treff").textContent })`);
      const lesLinje = (linje) => /^(\d+) spill(?: \+ (\d+) for voksne \(18\+\))?/.exec(linje) || [];
      const for18 = await tall();
      const synligeSpill = Number(lesLinje(for18.linje)[1]);
      const voksneSpill = Number(lesLinje(for18.linje)[2] || 0);
      t.sjekk(for18.helt === for18.alle && synligeSpill + voksneSpill === for18.helt && synligeSpill === alle, `Antall spill stemmer ikke: logoen sier ${for18.helt}, lista sier «${for18.linje}» og viser ${alle}`);
      t.sjekk(voksneSpill === (await c.antall("#spillgrid .spillkort[data-alder18]")), `«${for18.linje}» stemmer ikke med antall drikkespill`);

      // The search field: the placeholder fits (also on the smallest phones).
      const plassholder = () => c.js(`(() => { const f = document.querySelector("#sok"); const s = getComputedStyle(f); const x = document.createElement("canvas").getContext("2d"); x.font = s.fontWeight + " " + s.fontSize + " " + s.fontFamily; const px = (n) => parseFloat(s[n]) || 0; return { tekst: f.placeholder, bredde: Math.ceil(x.measureText(f.placeholder).width), rom: Math.floor(f.getBoundingClientRect().width - px("paddingLeft") - px("paddingRight") - px("borderLeftWidth") - px("borderRightWidth")) }; })()`);
      let ph = await plassholder();
      t.sjekk(ph.tekst === "Søk etter spill" && ph.bredde <= ph.rom, `Plassholderen «${ph.tekst}» får ikke plass i søkefeltet (${ph.bredde} px tekst, ${ph.rom} px rom)`);

      // The shelves: names on one line across a shelf, and icons that show on the dark background.
      const hyller = await c.js(`(() => {
        const skjeve = [];
        for (const h of document.querySelectorAll(".hylle")) {
          const topper = new Set(Array.from(h.querySelectorAll(".spillkort a")).map((a) => Math.round(a.querySelector(".kort-navn").getBoundingClientRect().top - a.getBoundingClientRect().top)));
          if (topper.size > 1) skjeve.push(h.getAttribute("aria-label"));
        }
        const ikoner = Array.from(document.querySelectorAll(".hylle h3 > span[aria-hidden]")).map((el) => {
          const l = document.createElement("canvas");
          l.width = l.height = 48;
          const x = l.getContext("2d");
          x.font = "32px " + getComputedStyle(document.body).fontFamily;
          x.textBaseline = "top";
          x.fillStyle = "#000";
          x.fillText(el.textContent, 4, 6);
          const d = x.getImageData(0, 0, 48, 48).data;
          let n = 0, morke = 0;
          for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] < 128) continue;
            n++;
            if (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2] < 60) morke++;
          }
          return { ikon: el.textContent, mork: n ? morke / n : 1 };
        });
        return { skjeve, ikoner };
      })()`);
      t.sjekk(hyller.skjeve.length === 0, `Spillnavnene står ikke på linje på hylla: ${hyller.skjeve.join(", ")}`);
      t.sjekk(new Set(hyller.ikoner.map((i) => i.ikon)).size === hyller.ikoner.length, "To hyller har samme ikon");
      const morkeIkoner = hyller.ikoner.filter((i) => i.mork > 0.5).map((i) => i.ikon);
      t.sjekk(morkeIkoner.length === 0, `Hylleikon som nesten forsvinner på mørk bakgrunn: ${morkeIkoner.join(" ")}`);

      // The mascot parade: filled by portal.js, never a drinking game, doubled for the loop.
      const parade = await c.js(`(() => { const f = Array.from(document.querySelectorAll("#parade .parade-figur")); const ids = f.map((a) => a.getAttribute("href").split("/")[1]); const atten = (window.RUSJ_SPILLISTE || []).filter((s) => s.alder18).map((s) => s.id); return { n: f.length, skjult: f.filter((a) => a.getAttribute("aria-hidden") === "true").length, atten: ids.filter((i) => atten.includes(i)).length, fokus: f.filter((a) => a.tabIndex >= 0).length }; })()`);
      t.sjekk(parade.n > 0 && parade.skjult === parade.n / 2, `Paraden er tom eller ikke doblet (${parade.n} figurer, ${parade.skjult} skjult)`);
      t.sjekk(parade.atten === 0, "Paraden viser drikkespill");
      t.sjekk(parade.fokus === 0, "Paradefigurene kan få tastaturfokus");

      // Keyboard: the first stops come in reading order, and each one shows where the focus is.
      const stopp = [];
      for (let i = 0; i < 7; i++) {
        await tast("Tab", 9);
        await c.sov(80);
        stopp.push(
          await c.js(`(() => { const e = document.activeElement; const s = getComputedStyle(e); const ring = (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) >= 2) || (e.id === "sok" && s.borderTopColor === "rgb(255, 210, 63)"); return (e.id ? "#" + e.id : e.matches('a[href="#spill"]') ? "finn" : String(e.className).split(" ")[0] || e.tagName) + (ring ? "" : " (uten synlig fokus)"); })()`),
        );
      }
      const ventetStopp = ["finn", "#overrask", "#installtips-vis", "#installtips-lukk", "#sok", "#filter-knapp", "hylle-alle"];
      t.sjekk(stopp.join(" → ") === ventetStopp.join(" → "), `Tab-rekkefølgen på forsiden: ${stopp.join(" → ")}`);
      // Backwards from the last game: what gets focus is scrolled to the top of the screen, and must
      // not end up under the search row that sticks there.
      await c.js(`(() => { const a = Array.from(document.querySelectorAll("#spillgrid .spillkort a")).filter((x) => x.offsetParent); a[a.length - 1].focus(); })()`);
      await c.sov(200);
      const dekket = [];
      for (let i = 0; i < 8; i++) {
        await c.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, modifiers: 8 });
        await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, modifiers: 8 });
        await c.sov(80);
        const under = await c.js(`(() => { const e = document.activeElement; const l = document.querySelector("#filter").getBoundingClientRect(); const b = e.getBoundingClientRect(); return !e.closest("#filter") && l.top <= 0 && b.top < l.bottom - 2 ? (e.getAttribute("href") || e.className) + " (" + Math.round(l.bottom - b.top) + " px)" : ""; })()`);
        if (under) dekket.push(under);
      }
      t.sjekk(dekket.length === 0, `Fokus havner under søkelinja når man tabber bakover: ${dekket.join(", ")}`);
      await c.js("document.activeElement.blur(); scrollTo(0, 0)");
      await c.sov(400);

      // The search row sticks to the top. It must never change height there, and the page must not
      // jump as it passes that point (that once made slow scrolling get stuck). Once the page has
      // scrolled in under it, it gets its solid background.
      const glid = await c.js(`(async () => {
        const linje = document.querySelector("#filter");
        scrollTo(0, 0);
        const feste = Math.round(linje.getBoundingClientRect().top + scrollY);
        const hoyder = new Set(), sider = new Set();
        let hopp = 0;
        for (let y = feste - 30; y <= feste + 60; y += 2) {
          scrollTo(0, y);
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          hoyder.add(linje.offsetHeight);
          sider.add(document.documentElement.scrollHeight);
          if (Math.abs(scrollY - y) > 1) hopp++;
        }
        await new Promise((r) => setTimeout(r, 400));
        const fast = linje.classList.contains("fast");
        scrollTo(0, 0);
        return { hoyder: [...hoyder], sider: sider.size, hopp, fast };
      })()`);
      t.sjekk(glid.hoyder.length === 1 && glid.sider === 1 && glid.hopp === 0, `Søkelinja endrer høyde eller siden hopper der den fester seg (høyder: ${glid.hoyder.join("/")} px, ${glid.sider} sidehøyder, ${glid.hopp} hopp)`);
      t.sjekk(glid.fast, "Søkelinja får ikke bakgrunn når siden har rullet inn under den");
      const linjeHoyde = glid.hoyder[0];
      await c.sov(300);

      // Search: focus moves the search row to the top (room for the keyboard), typing narrows the
      // list, and the matches come right under the row.
      await c.js("document.querySelector('#sok').focus()");
      t.sjekk(await venter("document.querySelector('#filter').getBoundingClientRect().top <= 1"), "Søkefeltet flyttes ikke til toppen når det får fokus");
      await c.skrivInn("#sok", "Quiz");
      await c.sov(700);
      const treff = await synligeKort();
      t.sjekk(treff > 0 && treff < alle, `Søket «Quiz» viser ${treff} av ${alle} spill`);
      t.sjekk(await c.js("document.querySelector('#hyller').hidden"), "Hyllene vises fortsatt under søket");
      const sokt = await c.js(`(() => { const l = document.querySelector("#filter").getBoundingClientRect(); const k = Array.from(document.querySelectorAll("#spillgrid .spillkort")).find((x) => x.offsetParent).getBoundingClientRect(); return { topp: Math.round(l.top), hoyde: Math.round(l.height), kort: Math.round(k.top), vh: innerHeight }; })()`);
      t.sjekk(sokt.topp <= 1 && sokt.kort < sokt.vh / 2, `Treffene kommer ikke øverst, rett under søkefeltet (søkefeltet på ${sokt.topp} px, første treff på ${sokt.kort} av ${sokt.vh} px)`);
      t.sjekk(sokt.hoyde === linjeHoyde, `Søkelinja endrer høyde under søk (${linjeHoyde} → ${sokt.hoyde} px)`);
      await t.bilde("forside-sok");
      await c.klikk("#sok-tom");
      t.sjekk((await synligeKort()) === alle, "«Tøm søket» viser ikke alle spillene igjen");
      // The same from far down the list, where the search row is stuck to the top: a new search
      // brings the page back to where its matches begin.
      await c.js("scrollTo(0, document.documentElement.scrollHeight)");
      await c.sov(300);
      await c.skrivInn("#sok", "Quiz");
      await c.sov(900);
      const dypt = await c.js(`(() => { const k = Array.from(document.querySelectorAll("#spillgrid .spillkort")).find((x) => x.offsetParent).getBoundingClientRect(); return { kort: Math.round(k.top), vh: innerHeight }; })()`);
      t.sjekk(dypt.kort > 0 && dypt.kort < dypt.vh / 2, `Et søk langt nede på siden viser ikke treffene (første treff på ${dypt.kort} av ${dypt.vh} px)`);
      await c.klikk("#sok-tom");

      // The words people actually use find the games: what a game is called elsewhere, and the
      // occasion («vors», «bursdag» …). They come from rusj/seo.json.
      const finner = { alias: "skravla", imposter: "luringen", "nødt": "vaghalsen", pekeleken: "pekefingeren", "secret santa": "nissen", ludo: "brikka", mafia: "varulven", musikk: "nynneren", "bli kjent": "lognhalsen" };
      const anledninger = ["vors", "bursdag", "hyttetur", "selskapsleker", "festleker", "julebord", "klassefest", "leker til barnebursdag"];
      const sokeTreff = await c.js(`(() => {
        const felt = document.querySelector("#sok");
        const ut = {};
        for (const q of ${JSON.stringify([...Object.keys(finner), ...anledninger, "xyzzy"])}) {
          felt.value = q;
          felt.dispatchEvent(new Event("input", { bubbles: true }));
          ut[q] = Array.from(document.querySelectorAll("#spillgrid .spillkort")).filter((k) => k.offsetParent).map((k) => k.dataset.id);
        }
        felt.value = "";
        felt.dispatchEvent(new Event("input", { bubbles: true }));
        return ut;
      })()`);
      for (const [q, id] of Object.entries(finner)) if (liste.includes(id)) t.sjekk(sokeTreff[q].includes(id), `Søket «${q}» finner ikke ${id} (fant: ${sokeTreff[q].join(", ") || "ingenting"})`);
      if (ventet > 20) for (const q of anledninger) t.sjekk(sokeTreff[q].length >= 3, `Søket «${q}» gir bare ${sokeTreff[q].length} treff`);
      t.sjekk(sokeTreff.xyzzy.length === 0, "Et tulleord gir treff i søket");
      t.sjekk((await synligeKort()) === alle, "Lista er ikke tilbake etter søkene");

      // The filter button opens and closes the panel; the badge counts the active filters.
      t.sjekk(await c.js("document.querySelector('#filtre').hidden && document.querySelector('#filter-knapp').getAttribute('aria-expanded') === 'false'"), "Filterpanelet er åpent før det er valgt noe");
      await c.klikk("#filter-knapp");
      t.sjekk(await c.js("!document.querySelector('#filtre').hidden && document.querySelector('#filter-knapp').getAttribute('aria-expanded') === 'true'"), "Filterknappen åpner ikke panelet");
      await c.klikk('[data-antall="1"]');
      await c.klikk('[data-antall="1"]');
      const synlige2 = await c.antall("#spillgrid .spillkort:not([hidden])");
      t.sjekk(synlige2 > 0, "Ingen spill passer for 3 spillere");
      await c.klikk("#tagger .brikke:not(.alle)");
      t.sjekk((await c.tekst("#filter-antall")).trim() === "2", "Filterknappen viser ikke 2 aktive filtre");
      ph = await plassholder();
      t.sjekk(ph.bredde <= ph.rom, `Plassholderen får ikke plass i søkefeltet når filtertelleren vises (${ph.bredde} px tekst, ${ph.rom} px rom)`);
      await t.bilde("forside-filter");
      // Typing a search puts a tall panel away (it would hide the matches above the keyboard).
      const panelHoyt = await c.js("document.querySelector('#filtre').getBoundingClientRect().height > (window.visualViewport ? visualViewport.height : innerHeight) * 0.35");
      await c.skrivInn("#sok", "a");
      t.sjekk((await c.js("document.querySelector('#filtre').hidden")) === panelHoyt, panelHoyt ? "Et høyt filterpanel blir stående over treffene når det søkes" : "Filterpanelet lukkes under søk selv om det er plass til det");
      await c.klikk("#sok-tom");
      if (await c.js("document.querySelector('#filtre').hidden")) await c.klikk("#filter-knapp");
      await c.klikk('#tagger [data-tagg=""]');
      await c.klikk('[data-antall="-1"]');
      await c.klikk('[data-antall="-1"]'); // 3 → 2 → alle
      t.sjekk(await c.js("document.querySelector('#filter-antall').hidden"), "Filtertelleren vises uten aktive filtre");
      await c.klikk("#filter-knapp");
      t.sjekk(await c.js("document.querySelector('#filtre').hidden"), "Filterknappen lukker ikke panelet");

      // A search for drinking games before anyone has said they are 18: one row «Drikkespill (18+)»
      // that opens the question – not «no games fit». After «Ja» the games are right there.
      const atten = await c.antall("#spillgrid .spillkort[data-alder18]");
      if (atten) {
        for (const q of ["drikkeleker", "drikkespill"]) {
          await c.skrivInn("#sok", q);
          const dor = await c.js(`({ rad: !!document.querySelector("#atten-dor").offsetParent, tekst: document.querySelector("#atten-dor").innerText.replace(/\\s+/g, " "), ingen: !document.querySelector("#ingen-treff").hidden, linje: document.querySelector("#treff").textContent })`);
          t.sjekk(dor.rad && /Drikkespill \(18\+\)/.test(dor.tekst) && !dor.ingen, `Søket «${q}» viser ikke raden «Drikkespill (18+)» (rad: ${dor.rad}, «ingen spill passer»: ${dor.ingen})`);
          t.sjekk(new RegExp(`\\+ ${atten} for voksne`).test(dor.linje), `Søket «${q}»: linja over treffene sier «${dor.linje}»`);
          t.sjekk((await synligeKort("#spillgrid .spillkort[data-alder18]")) === 0, `Søket «${q}» viser drikkespill før 18-årsbekreftelsen`);
        }
        await c.sov(700);
        await t.bilde("forside-drikkeleker");
        await c.skrivInn("#sok", "sudoku");
        t.sjekk(!(await c.js(`!!document.querySelector("#atten-dor").offsetParent`)), "Raden «Drikkespill (18+)» vises for et søk som ikke gjelder drikkespill");
        await c.skrivInn("#sok", "drikkeleker");
        await c.klikk("#atten-dor button");
        t.sjekk(await c.js("document.querySelector('#dialog').open"), "Raden «Drikkespill (18+)» åpner ikke 18+-dialogen");
        // The answer is a whole sentence: it must stay on one line, also on the smallest phones.
        const svarLinjer = await c.js(`(() => { const k = document.querySelector('#dialog [value="ja"]'); const r = document.createRange(); r.selectNodeContents(k); return new Set(Array.from(r.getClientRects()).map((b) => Math.round(b.top))).size; })()`);
        t.sjekk(svarLinjer === 1, `«Ja, jeg er 18 eller eldre» står på ${svarLinjer} linjer i dialogen`);
        await c.klikk('#dialog [value="nei"]');
        t.sjekk(await c.js(`!document.querySelector("#dialog").open && !!document.querySelector("#atten-dor").offsetParent && !document.body.classList.contains("over18")`), "«Nei» i 18+-dialogen lukker ikke bare dialogen");
        await c.klikk("#atten-dor button");
        await c.klikk('#dialog [value="ja"]');
        t.sjekk((await synligeKort("#spillgrid .spillkort[data-alder18]")) === atten && !(await c.js(`!!document.querySelector("#atten-dor").offsetParent`)), "Drikkespillene vises ikke som treff etter «Ja»");
        t.sjekk(await c.js("!!document.activeElement.closest('#spillgrid .spillkort[data-alder18]')"), "Fokus havner ikke på det første drikkespillet blant treffene etter «Ja»");
        // Back to «not confirmed» for the checks below.
        await c.klikk("#sok-tom");
        await c.klikk("[data-skjul18]");
        t.sjekk(!(await c.js("document.body.classList.contains('over18')")), "«Skjul» virker ikke etter et søk");
      }

      // 18+: hidden until confirmed in the dialog, then focus lands on the drinking shelf.
      if (atten) {
        t.sjekk((await synligeKort("#spillgrid .spillkort[data-alder18]")) === 0, "Drikkespill vises før 18-årsbekreftelsen");
        await c.klikk("[data-vis18]");
        t.sjekk(await c.js("document.querySelector('#dialog').open"), "18+-dialogen åpnes ikke");
        await t.bilde("forside-18");
        await c.klikk('#dialog [value="ja"]');
        t.sjekk((await synligeKort("#spillgrid .spillkort[data-alder18]")) === atten, "Drikkespillene vises ikke etter «Ja»");
        t.sjekk(await c.js("!!document.activeElement.closest('.hylle-18')"), "Fokus havner ikke på drikkespill-hylla etter «Ja»");
        const etter18 = await tall();
        t.sjekk(Number(lesLinje(etter18.linje)[1]) === etter18.helt && !lesLinje(etter18.linje)[2], `Etter «Ja» sier lista «${etter18.linje}», logoen ${etter18.helt}`);
        await c.klikk("[data-skjul18]");
        t.sjekk((await synligeKort("#spillgrid .spillkort[data-alder18]")) === 0, "«Skjul» skjuler ikke drikkespillene");
        t.sjekk(await c.js("document.activeElement !== document.body"), "Fokus forsvinner etter «Skjul»");
      }

      // «Overrask meg»: the slot machine opens on the screen, picks among the games that show now
      // (never an 18+ game), and Escape closes it.
      await c.klikk("#overrask");
      t.sjekk(await c.js("document.querySelector('#automat').open"), "«Overrask meg» åpner ikke automaten");
      await c.vent("document.querySelector('#automat [data-spill]').getAttribute('aria-disabled') === 'false'", 5000);
      const valgt = await c.js("document.querySelector('#automat-svar b')?.textContent || ''");
      const valgt18 = await c.js(`(window.RUSJ_SPILLISTE || []).some((s) => s.alder18 && s.navn === ${JSON.stringify(valgt)})`);
      t.sjekk(valgt && !valgt18, `Automaten valgte «${valgt}»${valgt18 ? " (et drikkespill)" : ""}`);
      const blant = Number((/Blant (\d+) spill/.exec(await c.tekst("#automat-under")) || [])[1]);
      t.sjekk(blant === synligeSpill, `Automaten sier «Blant ${blant} spill», lista sier ${synligeSpill}`);
      const boks = await c.js(`(() => { const r = document.querySelector("#automat").getBoundingClientRect(); const i = document.querySelector("#automat .automat-inn").getBoundingClientRect(); return { topp: Math.round(Math.min(r.top, i.top)), bunn: Math.round(Math.max(r.bottom, i.bottom)), venstre: Math.round(r.left), hoyre: Math.round(r.right), vh: innerHeight, vw: innerWidth }; })()`);
      t.sjekk(boks.topp >= 0 && boks.bunn <= boks.vh && boks.venstre >= 0 && boks.hoyre <= boks.vw, `Automaten får ikke plass på skjermen (${boks.topp}–${boks.bunn} av ${boks.vh} px høyde)`);
      await t.bilde("forside-overrask");
      await c.klikk("#automat [data-en-til]");
      await c.vent("document.querySelector('#automat [data-spill]').getAttribute('aria-disabled') === 'false'", 5000);
      await tast("Escape", 27);
      await c.sov(200);
      t.sjekk(await c.js("!document.querySelector('#automat').open"), "Escape lukker ikke automaten");
      t.sjekk(await c.js("document.activeElement && document.activeElement.id === 'overrask'"), "Fokus går ikke tilbake til «Overrask meg»");

      // «Fortsett der dere slapp» shows a game with saved, in-progress state (two lines of text and
      // a «Fortsett» badge in ordinary case). «Kveldens gjeng» shows the three best, and everyone
      // on «Vis alle».
      const fortsettId = bygget.find((i) => !meta(i).alder18);
      const navn = ["Ada", "Bo", "Cia", "Dag", "Eli", "Fia", "Gro"];
      const kveld = (spill) => `localStorage.setItem("rusj.kveld", ${JSON.stringify(JSON.stringify({ start: Date.now(), spill }))})`;
      await c.js(`localStorage.setItem("rusj.${fortsettId}.v1", JSON.stringify({ _aktiv: true, _tid: Date.now(), skjerm: "spill" }))`);
      // Four players with points (Ada 5, Dag 3, Bo 2, Cia 1) and three without.
      await c.js(kveld([{ id: "x", resultat: navn.map((n, i) => ({ navn: n, plass: Math.min(i + 1, 4) })) }, { id: "y", resultat: [{ navn: "Dag", plass: 1 }, { navn: "Ada", plass: 2 }] }]));
      await c.lastSide(t.side, "document.querySelector('.spillgrid')");
      await c.sov(2600);
      t.sjekk(await c.finnes(`#fortsett:not([hidden]) #fortsett-rad .spillkort[data-id="${fortsettId}"] .kort-fortsett`), `«Fortsett»-raden viser ikke ${fortsettId}`);
      const merke = await c.js(`(() => { const m = document.querySelector("#fortsett-rad .kort-fortsett"); const l = document.querySelector("#fortsett-rad .kort-linje"); return m && l ? { tekst: m.textContent, form: getComputedStyle(m).textTransform, linjer: getComputedStyle(l).webkitLineClamp } : null; })()`);
      t.sjekk(merke && merke.tekst === "Fortsett" && merke.form === "none", `«Fortsett»-merket er ikke i vanlig skrift (${merke && merke.form})`);
      t.sjekk(merke && merke.linjer === "2", "Fortsett-kortet viser ikke to linjer tekst");
      const tavle = () => c.js(`Array.from(document.querySelectorAll("#kveld-liste li:not([hidden])")).map((li) => li.querySelector(".kveld-navn").textContent)`);
      t.sjekk((await tavle()).join(",") === "Ada,Dag,Bo", `Kveldens gjeng viser ikke de tre beste (${(await tavle()).join(", ")})`);
      await t.bilde("forside-fortsett");
      // Back from a game (the page comes from the browser's memory) with a new evening where only
      // two have points: the rows with 0 points stay hidden until «Vis alle».
      await c.js(kveld([{ id: "z", resultat: navn.map((n, i) => ({ navn: n, plass: i < 2 ? i + 1 : 4 })) }]));
      await c.js(`window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }))`);
      await c.sov(150);
      t.sjekk((await tavle()).join(",") === "Ada,Bo", `Kveldens gjeng viser spillere uten poeng før «Vis alle» (${(await tavle()).join(", ")})`);
      // Luringen keeps its own saved state. It is «in progress» for 12 hours like the other games:
      // not for ever after one round, and not at all without the time it was saved.
      if (liste.includes("luringen")) {
        const lurRad = async (tid) => {
          await c.js(`localStorage.setItem("luringen.v1", JSON.stringify({ spill: { skjerm: "diskusjon" }${tid ? `, _tid: ${tid}` : ""} }))`);
          await c.js(`window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }))`);
          await c.sov(100);
          return c.finnes('#fortsett-rad .spillkort[data-id="luringen"] .kort-fortsett');
        };
        t.sjekk(await lurRad("Date.now() - 60 * 1000"), "Luringen vises ikke under «Fortsett» med et spill fra i sted");
        t.sjekk(!(await lurRad("Date.now() - 13 * 3600 * 1000")), "Luringen står under «Fortsett» 13 timer etter siste runde");
        t.sjekk(!(await lurRad(null)), "Luringen står under «Fortsett» uten tidspunkt for lagringen");
        await c.js(`localStorage.removeItem("luringen.v1")`);
      }
      await c.klikk("#kveld-alle");
      t.sjekk((await tavle()).length === 7 && (await c.js("document.querySelector('#kveld-alle').getAttribute('aria-expanded') === 'true'")), "«Vis alle» viser ikke hele Kveldens gjeng");
      const plasser = await c.js(`Array.from(document.querySelectorAll("#kveld-liste li .kveld-plass")).map((p) => p.textContent).join(" ")`);
      t.sjekk(plasser === "🥇 🥈 3. 3. 3. 3. 3.", `Spillere uten poeng får medalje i Kveldens gjeng (${plasser})`);
      // The whole page in one image, on phone widths. From the top: a full-page capture of a scrolled
      // page makes headless Chrome jump to the end of the page, and the search row (which sticks to
      // the top of the screen) goes missing in it. On wide screens such an image gets so big that
      // headless Chrome hangs on it, so there the list is captured as one screen instead.
      // First: a jump straight to the end of the page (the End key, a restored scroll position) with
      // the heading far below the first screen. The search row must get its solid background there too.
      await c.js("scrollTo(0, 0)");
      await c.sov(150);
      await c.js("scrollTo(0, document.documentElement.scrollHeight)");
      t.sjekk(await venter("document.querySelector('#filter').classList.contains('fast')", 1500), "Søkelinja er gjennomsiktig etter et hopp rett til bunnen av siden");
      if (BREDDE <= 430) {
        await c.js("scrollTo(0, 0)");
        await c.sov(200);
        await t.bilde("forside-hel", true);
      } else {
        await c.js(`scrollTo(0, document.querySelector("#alle-tittel").getBoundingClientRect().top + scrollY - 90)`);
        await c.sov(300);
        await t.bilde("forside-liste");
      }
      // Old Luringen links (rusj.no/#CODE) are sent on to /luringen/ – but only real codes, never a
      // place on this page.
      for (const anker of ["#fortsett", "#overrask", "#spill"]) {
        await c.lastSide("about:blank");
        await c.lastSide(`${tjener.url}/${anker}`, "document.querySelector('.spillgrid') || location.pathname !== '/'");
        await c.sov(300);
        const havnet = await c.js("location.pathname");
        t.sjekk(havnet === "/", `Adressen /${anker} sendes til ${havnet} (skal bli på forsiden)`);
      }
      await c.lastSide("about:blank");
      await c.lastSide(`${tjener.url}/#ABCD2345`, "location.pathname.startsWith('/luringen/')");
      t.sjekk((await c.js("location.pathname")) === "/luringen/", "Gammel Luringen-lenke sendes ikke videre til /luringen/");
      await c.lastSide(`${tjener.url}/finnes-ikke/`, "document.querySelector('h1')");
      t.sjekk(/tomt/i.test(await c.tekst("h1")), "404-siden vises ikke");
      await t.bilde("404");

      // The pages about rusj: linked from the footer of the front page, readable on a phone, and
      // the button on /personvern/ really removes everything – after asking.
      await c.lastSide(t.side, "document.querySelector('.spillgrid')");
      const bunnlenker = await c.js(`Array.from(document.querySelectorAll(".bunn a")).map((a) => a.getAttribute("href"))`);
      t.sjekk(bunnlenker.includes("/om/") && bunnlenker.includes("/personvern/"), `Bunnteksten på forsiden lenker ikke til /om/ og /personvern/ (${bunnlenker.join(", ")})`);
      const utenfor = () => c.js(`Array.from(document.querySelectorAll("main *, footer *")).filter((el) => { const b = el.getBoundingClientRect(); return b.width && b.height && !el.closest("svg, dialog") && (b.right > innerWidth + 1 || b.left < -1); }).map((el) => el.tagName.toLowerCase() + " «" + el.textContent.trim().slice(0, 30) + "»").slice(0, 3)`);
      await c.lastSide(`${tjener.url}/om/`, "document.querySelector('h1')");
      const om = await c.js(`({ h1: document.querySelector("h1").innerText, tekst: document.querySelector("main").innerText, epost: (document.querySelector('main a[href^="mailto:"]') || {}).textContent || "", hjem: !!document.querySelector('a[href="/"]'), personvern: !!document.querySelector('a[href="/personvern/"]') })`);
      t.sjekk(/Om rusj/.test(om.h1) && (!/Kontakt: /.test(om.tekst) || /@/.test(om.epost)) && om.hjem && om.personvern, "Om-siden mangler overskrift eller lenker, eller kontaktlinja mangler adresse");
      if (atten) t.sjekk(/18 år/.test(om.tekst) && /alkoholfritt/i.test(om.tekst), "Om-siden sier ikke noe om drikkelekene og måtehold");
      t.sjekk((await utenfor()).length === 0, `Tekst stikker utenfor skjermen på Om-siden: ${(await utenfor()).join(", ")}`);
      await t.bilde("om");
      await c.lastSide(`${tjener.url}/personvern/`, "document.querySelector('#slett-alt')");
      const pv = await c.js(`({ h1: document.querySelector("h1").innerText, tekst: document.querySelector("main").innerText, knapp: document.querySelector("#slett-alt").innerText.trim() })`);
      t.sjekk(/Personvern/.test(pv.h1) && /localStorage/.test(pv.tekst) && /informasjonskapsler/.test(pv.tekst) && /GitHub Pages/.test(pv.tekst) && /IP-adresse/.test(pv.tekst) && /utenfor EU\/EØS/.test(pv.tekst) && /uten nett/.test(pv.tekst), "Personvernsiden mangler noe av det den skal si (lagring, informasjonskapsler, nettvert, IP-adresse, EU/EØS, bruk uten nett)");
      t.sjekk(pv.knapp === "Slett alt rusj har lagret på denne enheten", `Sletteknappen heter «${pv.knapp}»`);
      t.sjekk((await utenfor()).length === 0, `Tekst stikker utenfor skjermen på personvernsiden: ${(await utenfor()).join(", ")}`);
      // Something of everything rusj stores, two keys that are not ours, a stored copy of a file and
      // (a stand-in for) the helper that keeps the offline copy.
      await c.js(`(async () => {
        localStorage.clear();
        for (const n of ["rusj.felles", "rusj.kveld", "rusj.sladrehanken.v1", "rusj.portal.installSkjult", "luringen.v1", "luringen.annet", "annet.nokkel", "rusjx"]) localStorage.setItem(n, JSON.stringify({ navn: ["Ada"] }));
        await (await caches.open("rusj-test")).put("/x", new Response("x"));
      })()`);
      await c.lastSide(`${tjener.url}/personvern/`, "document.querySelector('#slett-alt')");
      await c.js(`window.__avregistrert = 0; navigator.serviceWorker.getRegistrations = async () => [{ unregister: async () => (window.__avregistrert++, true) }];`);
      t.sjekk(/6 lagrede/.test(await c.tekst("#slett-status")), `Personvernsiden teller ikke det som er lagret («${await c.tekst("#slett-status")}»)`);
      await t.bilde("personvern");
      const lagretNa = () => c.js(`(async () => ({ nokler: Object.keys(localStorage).sort().join(","), lagre: (await caches.keys()).length, avregistrert: window.__avregistrert, status: document.querySelector("#slett-status").textContent }))()`);
      await c.klikk("#slett-alt");
      t.sjekk(await c.js("document.querySelector('#dialog').open"), "Sletteknappen spør ikke først");
      await c.klikk('#dialog [value="nei"]');
      const urort = await lagretNa();
      t.sjekk(urort.nokler.split(",").length === 8 && urort.lagre === 1 && urort.avregistrert === 0, `«Avbryt» slettet noe likevel (${urort.nokler})`);
      await c.klikk("#slett-alt");
      await c.klikk('#dialog [value="ja"]');
      await venter("/Slettet/.test(document.querySelector('#slett-status').textContent)");
      const slettet = await lagretNa();
      t.sjekk(slettet.nokler === "annet.nokkel,rusjx", `Etter «Ja, slett alt» ligger dette igjen i lagringen: ${slettet.nokler || "(ingenting)"} (ventet bare annet.nokkel og rusjx)`);
      t.sjekk(slettet.lagre === 0, `Etter «Ja, slett alt» ligger ${slettet.lagre} lagret kopi igjen`);
      t.sjekk(slettet.avregistrert === 1, "Etter «Ja, slett alt» er ikke hjelperen for bruk uten nett avregistrert");
      t.sjekk(/Slettet/.test(slettet.status), `Etter «Ja, slett alt» sier siden «${slettet.status}»`);
      await c.js(`localStorage.clear()`);
    } else if (id === "luringen") {
      await c.lastSide(t.side, "document.querySelector('#s-hjem h1')");
      await c.js("localStorage.clear()");
      await c.lastSide(t.side, "document.querySelector('#s-hjem h1')");
      await t.bilde("luringen-hjem");
      t.sjekk(await c.finnes('a[href="/"]'), "Luringen mangler lenke tilbake til rusj.no");
      await c.klikk('[data-h="nytt"]');
      await t.bilde("luringen-oppsett");
    } else {
      const m = meta(id);
      await t.start();
      if (m.alder18) {
        // Drinking games: the kit's 18+ gate comes first; "Nei" leads away, "Ja" opens the game.
        t.sjekk(/18/.test(await c.tekst("#skjerm h1")), "18+-porten vises ikke først i et drikkespill");
        t.sjekk(await c.finnes('[data-h="alder-ja"]') && (await c.finnes('[data-h="alder-nei"]')), "18+-porten mangler Ja/Nei");
        await t.bilde("alder");
        await c.klikk('[data-h="alder-ja"]');
        await c.vent("document.querySelector('#skjerm h1') && !/18\\?/.test(document.querySelector('#skjerm h1').textContent)");
      }
      const h1 = await c.tekst("#skjerm h1");
      t.sjekk(h1.trim() === m.navn, `Hjem-skjermen har overskriften «${h1}», ventet «${m.navn}»`);
      t.sjekk(await c.finnes("#tilportal:not([hidden])"), "Mangler rusj-knappen øverst på hjem-skjermen");
      await t.bilde("hjem");
      await c.klikk("#reglerknapp");
      t.sjekk(await c.finnes("#ark:not([hidden]) .steg li"), "Reglene vises ikke");
      await t.bilde("regler");
      await c.klikk('#ark [data-h="lukk-ark"]');
      const scenario = join(ROT, "test/spill", `${id}.e2e.mjs`);
      if (existsSync(scenario)) {
        const modul = await import(pathToFileURL(scenario).href);
        await modul.default(t);
      } else {
        feil.push(`Mangler test/spill/${id}.e2e.mjs (gjennomspilling)`);
      }
    }
  } catch (e) {
    feil.push(`Stoppet: ${e.message}`);
    try {
      await c.skjermbilde(join(mappe, "99-feil.png"));
    } catch (e2) {
      /* ignore */
    }
  }
  feil.push(...c.feil.filter((f) => !f.includes("/finnes-ikke/"))); // the 404 test asks for a missing page on purpose
  if (PROBE) {
    try {
      const injisert = await c.js(`document.querySelectorAll("x-q").length`);
      if (injisert) feil.push(`HTML-INJEKSJON på siste skjerm (${injisert} element)`);
    } catch (e) {
      /* page gone */
    }
    // In probe mode the scripted checks fail on the odd names; only injections matter.
    const injeksjoner = feil.filter((f) => f.startsWith("HTML-INJEKSJON"));
    feil.length = 0;
    feil.push(...injeksjoner);
  }
  await c.lukk();
  resultat.push({ id, feil, bilder: nr });
  console.log(`${feil.length ? "✗" : "✓"} ${id}${feil.length ? "" : ` (${nr} skjermbilder)`}`);
  for (const f of feil) console.log(`    – ${f}`);
}

tjener.lukk();
const antallFeil = resultat.reduce((s, r) => s + r.feil.length, 0);
console.log(`\nSkjermbilder: ${BILDER}`);
if (antallFeil) {
  console.log(`${antallFeil} feil i ${resultat.filter((r) => r.feil.length).length} av ${resultat.length}`);
  process.exit(1);
}
console.log(`Alle ${resultat.length} besto.`);
