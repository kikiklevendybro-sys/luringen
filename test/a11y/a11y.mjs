// rusj a11y — accessibility findings for every screen an end-to-end test visits.
// The runner (test/rusj-e2e.mjs --a11y <dir>) does, per game:
//   const a11y = await lagA11y(c, { id, axMappe });   // c from test/chrome.mjs
//   const t = { ...a11y.chrome, … };                  // klikk/trykk/hold/sveip are observed
//   await a11y.sjekk(navn);                           // at every t.bilde()
//   a11y.resultat();                                  // → { skjermer, klikk, gester }
// Nothing here fails a test: findings are data. The checks themselves live in a11y-iside.js (in the
// page); this file adds what only the browser can tell (the accessibility tree, the pixels behind
// text on gradients) and watches the scripted clicks.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HER = dirname(fileURLToPath(import.meta.url));
const ISIDE = readFileSync(join(HER, "a11y-iside.js"), "utf8");
const q = JSON.stringify;

// Every rule: WCAG 2.2 criterion (level), default severity, what it means.
// Severity: 1 blocker · 2 serious · 3 moderate · 4 minor · 5 note (for manual review).
export const REGLER = {
  "navn-mangler": ["4.1.2 (A)", 1, "Control without an accessible name"],
  "navn-bare-symbol": ["4.1.2 (A) / 2.4.6 (AA)", 3, "Control named only by a symbol or emoji"],
  "dialog-uten-navn": ["4.1.2 (A)", 2, "Dialog without an accessible name"],
  "navn-uten-synlig-tekst": ["2.5.3 (A)", 3, "Visible text of a control is missing from its accessible name"],
  "mal-24": ["2.5.8 (AA)", 2, "Tap target under 24×24 px without enough spacing"],
  "mal-44": ["2.5.5 (AAA) / platform guidance", 4, "Tap target under 44×44 px"],
  kontrast: ["1.4.3 (AA)", 2, "Text contrast below 4.5:1 (3:1 for large text)"],
  "kontrast-symbol": ["1.4.11 (AA)", 3, "Symbol used as an icon has contrast below 3:1"],
  "kontrast-usikker": ["1.4.3 (AA)", 5, "Text over a gradient or image that could not be measured (off screen)"],
  "h1-antall": ["1.3.1 (A) / 2.4.6 (AA)", 3, "Screen does not have exactly one h1"],
  "overskrift-hopp": ["1.3.1 (A)", 4, "Heading level skipped"],
  "overskrift-tom": ["1.3.1 (A)", 3, "Empty heading"],
  "h1-ikke-forst": ["1.3.1 (A)", 4, "First heading on the screen is not the h1"],
  "felt-uten-etikett": ["1.3.1 / 4.1.2 (A)", 1, "Field without any label"],
  "felt-bare-plassholder": ["3.3.2 (A)", 2, "Field labelled only by its placeholder"],
  "felt-uten-synlig-etikett": ["3.3.2 (A)", 5, "Field with an aria-label but no visible label"],
  "tabindex-positiv": ["2.4.3 (A)", 3, "Positive tabindex"],
  "aria-feil-rolle": ["4.1.2 (A)", 3, "aria state on an element whose role does not support it"],
  "rolle-ugyldig": ["4.1.2 (A)", 3, "Unknown role"],
  "rolle-kontekst": ["1.3.1 (A)", 3, "Role outside its required parent role"],
  "rolle-uten-fokus": ["2.1.1 (A)", 2, "Widget role on an element that cannot take focus"],
  "aria-label-uten-rolle": ["4.1.2 (A)", 4, "aria-label on an element without a role (ignored by screen readers)"],
  "aria-hidden-fokus": ["4.1.2 (A)", 2, "aria-hidden on or around a focusable element"],
  "aria-ref-mangler": ["4.1.2 (A)", 3, "aria reference to an id that is not in the page"],
  "nestet-kontroll": ["4.1.2 (A)", 2, "Control inside another control"],
  "duplikat-id": ["4.1.2 (A)", 4, "Duplicate id"],
  "svg-ikke-skjult": ["1.1.1 (A)", 4, "Drawing neither hidden from nor named for screen readers"],
  "svg-uten-rolle": ["1.1.1 (A)", 4, "Named drawing without role=img"],
  "bilde-uten-navn": ["1.1.1 (A)", 2, "Image without a text alternative"],
  "bilde-uten-alt": ["1.1.1 (A)", 2, "img without alt"],
  "lerret-uten-alternativ": ["1.1.1 (A)", 2, "canvas without a text alternative"],
  "lerret-uten-rolle": ["1.1.1 (A)", 4, "Named canvas without a role"],
  "fokus-usynlig": ["2.4.7 (AA)", 2, "No visible focus indicator"],
  "fokus-kontrast": ["1.4.11 (AA)", 3, "Focus ring has contrast below 3:1 against what is behind it"],
  "fokus-skjult": ["2.4.11 (AA)", 2, "Focused element is completely hidden behind sticky or fixed content"],
  "fokus-delvis-skjult": ["2.4.12 (AAA)", 4, "Focused element is partly hidden behind sticky or fixed content"],
  "fokus-utenfor-skjermen": ["2.4.7 (AA)", 3, "Focused element stays outside the screen"],
  "fokus-tapt": ["2.4.3 (A)", 2, "Focus is dropped (to <body>) after activating a control"],
  "live-assertiv": ["4.1.3 (AA)", 4, "Assertive live region (interrupts the screen reader)"],
  "live-flyktig": ["4.1.3 (AA)", 3, "Live region inside a container that is redrawn wholesale (re-created, so not announced)"],
  "live-lang": ["4.1.3 (AA)", 4, "Live region with a lot of text"],
  "live-nestet": ["4.1.3 (AA)", 4, "Live region inside a live region"],
  "live-i-kontroll": ["4.1.3 (AA)", 2, "Live region inside a button or link (not exposed)"],
  "live-skjult-for-at": ["4.1.3 (AA)", 3, "Live region inside aria-hidden or inert content"],
  "klikk-uten-tastatur": ["2.1.1 (A)", 1, "Click action on an element a keyboard cannot reach"],
  "peker-uten-kontroll": ["2.1.1 (A)", 5, "Looks clickable (cursor) but is not a control"],
  "e2e-klikk-uten-tastatur": ["2.1.1 (A)", 1, "A step of the game is clicked on an element a keyboard cannot reach"],
  "e2e-gest": ["2.5.1 / 2.5.7 (A/AA)", 5, "A step of the game needs a tap, hold or swipe on something that is not a control"],
  "overlegg-bak-ikke-inert": ["2.4.3 (A) / 4.1.2 (A)", 3, "Overlay is open but the page behind it can still be reached"],
  "lang-mangler": ["3.1.1 (A)", 2, "Page language is not Norwegian"],
  "engelsk-mistenkt": ["3.1.2 (AA)", 5, "Possibly English text"],
  "tittel-mangler": ["2.4.2 (A)", 2, "Page without a title"],
  "zoom-sperret": ["1.4.4 (AA)", 1, "Viewport blocks zoom"],
  "tekst-kuttet": ["1.4.4 (AA)", 5, "Text cut off with an ellipsis or a line clamp"],
  "tekst-klippet": ["1.4.4 (AA)", 3, "Text cut through by a box with a fixed size (overflow hidden)"],
};

// ---------- Screenshot pixels (for text over gradients and images) ----------

// PNG (8-bit RGB/RGBA, not interlaced — what Chrome writes) → { bredde, hoyde, kanaler, data }.
function lesPng(buf) {
  let p = 8;
  let bredde = 0;
  let hoyde = 0;
  let type = 6;
  const idat = [];
  while (p < buf.length) {
    const lengde = buf.readUInt32BE(p);
    const navn = buf.toString("latin1", p + 4, p + 8);
    if (navn === "IHDR") {
      bredde = buf.readUInt32BE(p + 8);
      hoyde = buf.readUInt32BE(p + 12);
      type = buf[p + 17];
      if (buf[p + 16] !== 8 || (type !== 6 && type !== 2) || buf[p + 20] !== 0) throw new Error("PNG-formatet støttes ikke");
    } else if (navn === "IDAT") idat.push(buf.subarray(p + 8, p + 8 + lengde));
    p += 12 + lengde;
  }
  const kanaler = type === 6 ? 4 : 3;
  const ra = inflateSync(Buffer.concat(idat));
  const linje = bredde * kanaler;
  const data = new Uint8Array(linje * hoyde);
  for (let y = 0; y < hoyde; y++) {
    const filter = ra[y * (linje + 1)];
    const inn = y * (linje + 1) + 1;
    const ut = y * linje;
    for (let x = 0; x < linje; x++) {
      const a = x >= kanaler ? data[ut + x - kanaler] : 0;
      const b = y ? data[ut + x - linje] : 0;
      const c = y && x >= kanaler ? data[ut + x - linje - kanaler] : 0;
      let v = ra[inn + x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      data[ut + x] = v & 255;
    }
  }
  return { bredde, hoyde, kanaler, data };
}

const lin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const kontrast = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
const hex = (c) => "#" + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

// The colours along the edge of a text box are (almost only) background. Returns the background
// colours that make up at least 10 % of the edge, without the ones that are the text itself.
function bakgrunnRundt(bilde, skala, [x, y, b, h], tekstfarge, ut = 0) {
  const x0 = Math.max(0, Math.round((x - ut) * skala));
  const y0 = Math.max(0, Math.round((y - ut) * skala));
  const x1 = Math.min(bilde.bredde - 1, Math.round((x + b + ut) * skala) - 1);
  const y1 = Math.min(bilde.hoyde - 1, Math.round((y + h + ut) * skala) - 1);
  if (x1 - x0 < 2 || y1 - y0 < 2) return [];
  const botter = new Map();
  let n = 0;
  const ta = (px, py) => {
    const i = (py * bilde.bredde + px) * bilde.kanaler;
    const [r, g, bl] = [bilde.data[i], bilde.data[i + 1], bilde.data[i + 2]];
    const nokkel = ((r >> 3) << 10) | ((g >> 3) << 5) | (bl >> 3);
    const bo = botter.get(nokkel) || [0, 0, 0, 0];
    bo[0] += r;
    bo[1] += g;
    bo[2] += bl;
    bo[3]++;
    botter.set(nokkel, bo);
    n++;
  };
  for (let px = x0; px <= x1; px++) {
    ta(px, y0);
    ta(px, y1);
  }
  for (let py = y0 + 1; py < y1; py++) {
    ta(x0, py);
    ta(x1, py);
  }
  return Array.from(botter.values())
    .map(([r, g, bl, antall]) => ({ farge: [r / antall, g / antall, bl / antall], andel: antall / n }))
    .filter((f) => f.andel >= 0.1 && Math.hypot(f.farge[0] - tekstfarge[0], f.farge[1] - tekstfarge[1], f.farge[2] - tekstfarge[2]) > 36)
    .sort((a, b) => b.andel - a.andel);
}

// ---------- Accessibility tree ----------

const MA_HA_NAVN = new Set(["button", "link", "textbox", "searchbox", "checkbox", "radio", "switch", "combobox", "listbox", "slider", "spinbutton", "tab", "menuitem", "menuitemcheckbox", "menuitemradio", "option", "treeitem"]);
const VIS_EGENSKAP = ["focusable", "disabled", "pressed", "checked", "expanded", "selected", "level", "live", "atomic", "busy", "modal", "invalid", "required", "readonly", "hasPopup", "roledescription", "hidden"];

function axTekst(noder) {
  const etterId = new Map(noder.map((n) => [n.nodeId, n]));
  const linjer = [];
  const ga = (n, dybde, forelderNavn) => {
    if (!n) return;
    const rolle = n.role ? n.role.value : "";
    const navn = n.name && n.name.value != null ? String(n.name.value).replace(/\s+/g, " ").trim() : "";
    let neste = dybde;
    let videre = forelderNavn;
    const stille = n.ignored || rolle === "InlineTextBox" || rolle === "LineBreak" || ((rolle === "generic" || rolle === "none" || rolle === "") && !navn);
    // Text that only repeats the name of its parent adds nothing.
    const gjentar = rolle === "StaticText" && forelderNavn && forelderNavn.includes(navn);
    if (!stille && !gjentar) {
      const egenskaper = (n.properties || [])
        .filter((e) => VIS_EGENSKAP.includes(e.name) && e.value && e.value.value !== false && e.value.value !== "" && e.value.value !== "false" && !(e.name === "live" && e.value.value === "off") && !(e.name === "level" && rolle !== "heading"))
        .map((e) => (e.value.value === true ? e.name : `${e.name}=${e.value.value}`));
      const verdi = n.value && n.value.value !== "" && n.value.value != null ? ` verdi=${q(String(n.value.value))}` : "";
      const beskrivelse = n.description && n.description.value ? ` beskrivelse=${q(n.description.value)}` : "";
      linjer.push("  ".repeat(dybde) + (rolle === "StaticText" ? q(navn) : rolle + (navn ? " " + q(navn) : "")) + verdi + beskrivelse + (egenskaper.length ? " [" + egenskaper.join(", ") + "]" : ""));
      neste = dybde + 1;
      videre = navn;
    }
    for (const id of n.childIds || []) ga(etterId.get(id), neste, videre);
  };
  ga(noder.find((n) => !n.parentId) || noder[0], 0, "");
  return linjer.join("\n");
}

async function tast(c, key, code, vk) {
  for (const type of ["keyDown", "keyUp"]) await c.send("Input.dispatchKeyEvent", { type, key, code, windowsVirtualKeyCode: vk });
}

// ---------- One game ----------

// tastatur: true → every scripted click is done as a keyboard user would: focus the control, press Enter.
export async function lagA11y(c, { id, axMappe, tastatur = false }) {
  await c.send("Page.addScriptToEvaluateOnNewDocument", { source: ISIDE });
  await c.send("Accessibility.enable");
  // A headless page does not have focus: without this, :focus never matches and focus events never fire.
  await c.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  if (axMappe) mkdirSync(axMappe, { recursive: true });
  const skjermer = [];
  const klikk = new Map();
  const gester = new Map();
  const taster = { enter: 0, klikk: 0 }; // steps done with the Enter key / steps that needed a pointer click
  let nr = 0;

  const iside = async (uttrykk) => {
    if (!(await c.js("!!window.__rusjA11y"))) await c.send("Runtime.evaluate", { expression: ISIDE }); // a page loaded before we were installed
    return c.js(uttrykk);
  };

  // Text over a gradient or an image: measure the screenshot. Each entry ends up as a finding
  // (below the limit), is dropped (passes), or stays uncertain (never visible on screen).
  async function malUsikre(usikre, info) {
    const funn = [];
    const igjen = new Map(usikre.filter((u) => u.id != null && u.tekstfarge).map((u) => [String(u.id), u]));
    // Look at the screen as it is now and settle every uncertain text that is visible on it.
    const malSkjermen = async () => {
      if (!igjen.size) return;
      const synlige = await iside("__rusjA11y.rekterFor(" + q(Array.from(igjen.keys()).map(Number)) + ")");
      if (!Object.keys(synlige).length) return;
      const { data } = await c.send("Page.captureScreenshot", { format: "png" });
      const bilde = lesPng(Buffer.from(data, "base64"));
      for (const [id, rekter] of Object.entries(synlige)) {
        const u = igjen.get(id);
        const alfa = u.tekstfarge[3] * (u.opasitet == null ? 1 : u.opasitet);
        const malt = [];
        for (const r of rekter)
          for (const b of bakgrunnRundt(bilde, bilde.bredde / info.bredde, r, u.tekstfarge, u.grunn === "tekst i svg" ? 2 : 0)) {
            const fg = u.tekstfarge.slice(0, 3).map((v, i) => v * alfa + b.farge[i] * (1 - alfa));
            malt.push({ forhold: kontrast(fg, b.farge), fg, bg: b.farge });
          }
        if (!malt.length) continue;
        igjen.delete(id);
        malt.sort((a, b) => a.forhold - b.forhold);
        if (malt[0].forhold < u.grense - 0.005) funn.push({ ...rens(u), forhold: Math.round(malt[0].forhold * 100) / 100, fg: hex(malt[0].fg), bg: hex(malt[0].bg), metode: "piksler" });
      }
    };
    const rens = ({ id, tekstfarge, opasitet, til, ...rest }) => rest;
    await malSkjermen();
    // The rest is further down the page: scroll there, look, and scroll back.
    if (igjen.size) {
      for (const y of await iside("__rusjA11y.rullestopp(" + q(Array.from(igjen.keys()).map(Number)) + ")")) {
        await iside("scrollTo(0, " + y + "), new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))");
        await malSkjermen();
      }
      await iside("scrollTo(0, " + info.rulleY + ")");
    }
    const fortsatt = [];
    for (const u of usikre) {
      if (u.id != null && u.tekstfarge && !igjen.has(String(u.id))) continue; // measured
      // Fails against every stop of the gradient: no need to see it.
      if (u.til != null && u.til < u.grense) funn.push({ ...rens(u), forhold: u.til, metode: "alle gradientstopp" });
      else fortsatt.push({ ...rens(u), ...(u.til != null ? { til: u.til } : {}), regel: "kontrast-usikker" });
    }
    return { funn, fortsatt };
  }

  // Names and roles as the browser exposes them to screen readers.
  async function sjekkAx(navn) {
    const { nodes } = await c.send("Accessibility.getFullAXTree");
    if (axMappe) writeFileSync(join(axMappe, `${String(nr).padStart(2, "0")}-${navn}.txt`), axTekst(nodes) + "\n");
    const funn = [];
    for (const n of nodes) {
      if (n.ignored || !n.role || !n.backendDOMNodeId) continue;
      const rolle = n.role.value;
      const navnet = n.name && n.name.value != null ? String(n.name.value).trim() : "";
      let regel = null;
      if (MA_HA_NAVN.has(rolle)) regel = !navnet ? "navn-mangler" : !/[\p{L}\p{N}]/u.test(navnet) ? "navn-bare-symbol" : null;
      else if ((rolle === "dialog" || rolle === "alertdialog") && !navnet) regel = "dialog-uten-navn";
      if (!regel) continue;
      try {
        const { object } = await c.send("DOM.resolveNode", { backendNodeId: n.backendDOMNodeId });
        const r = await c.send("Runtime.callFunctionOn", {
          objectId: object.objectId,
          returnByValue: true,
          functionDeclaration: "function () { const el = this.nodeType === 1 ? this : this.parentElement; return el ? { ...__rusjA11y.beskriv(el), iOmfang: __rusjA11y.iOmfang(el) } : null; }",
        });
        const el = r.result.value;
        if (el && el.iOmfang) funn.push({ regel, sig: el.sig, sti: el.sti, tekst: el.tekst, boks: el.boks, rolle, ...(navnet ? { navn: navnet } : {}) });
      } catch (e) {
        /* the node went away while we looked */
      }
    }
    return funn;
  }

  const slaSammen = (liste) => {
    const sett = new Map();
    for (const f of liste) {
      const n = [f.regel, f.sig, f.sti, f.navn || "", f.fg || "", f.bg || ""].join("|");
      if (sett.has(n)) sett.get(n).antall = (sett.get(n).antall || 1) + (f.antall || 1);
      else sett.set(n, f);
    }
    return Array.from(sett.values());
  };

  async function sjekk(navn) {
    const post = { nr: ++nr, navn, funn: [], usikre: [], info: {}, hendelser: [] };
    try {
      post.hendelser = await iside("__rusjA11y.hendelser()");
      const r = await iside("__rusjA11y.sjekk()");
      post.info = r.info;
      const malt = await malUsikre(r.usikre, r.info);
      post.usikre = malt.fortsatt;
      const ax = await sjekkAx(navn);
      // Keyboard modality first, so :focus-visible applies when the page script focuses things.
      await tast(c, "Shift", "ShiftLeft", 16);
      const fokus = await iside("__rusjA11y.fokuspass()");
      post.funn = slaSammen([...r.funn, ...malt.funn, ...ax, ...fokus.funn]);
      await iside("__rusjA11y.hendelser()"); // what the checks themselves caused is not the game's doing
    } catch (e) {
      post.feil = e.message;
    }
    skjermer.push(post);
    return post;
  }

  // A scripted click stands in for Enter on a focused control: note whether the target can take
  // focus at all, and where focus is when the action is done.
  let sistTapt = null; // the click that last dropped focus, until we know whether focus came back
  const observerKlikk = (etter) => {
    if (!etter) return;
    const n = etter.skjerm + "|" + etter.sig;
    const k = klikk.get(n) || { skjerm: etter.skjerm, sig: etter.sig, sti: etter.sti, tekst: etter.tekst, innfodt: etter.innfodt, tabbar: etter.tabbar, synlig: etter.synlig, antall: 0, tapt: 0, tilSkjerm: {} };
    k.antall++;
    // Still nothing focused when the next control is pressed: the loss before this click was for good.
    if (sistTapt && etter.utenFokus) sistTapt.varig = (sistTapt.varig || 0) + 1;
    sistTapt = null;
    // Lost: the control could take focus, nothing took over, and no overlay (countdown) is covering the screen.
    if (etter.fikkFokus && !etter.fokusEtter && !etter.overlegg) {
      k.tapt++;
      k.tilSkjerm[etter.skjermEtter] = (k.tilSkjerm[etter.skjermEtter] || 0) + 1;
      sistTapt = k;
    }
    klikk.set(n, k);
  };
  const observerGest = (type, mal) => {
    if (!mal) return;
    const n = [type, mal.skjerm, mal.sig].join("|");
    const g = gester.get(n) || { type, skjerm: mal.skjerm, sig: mal.sig, sti: mal.sti, tekst: mal.tekst, innfodt: mal.innfodt, tabbar: mal.tabbar, touchAction: mal.touchAction, antall: 0 };
    g.antall++;
    gester.set(n, g);
  };
  const stille = async (fn) => {
    try {
      return await fn();
    } catch (e) {
      return null; // the page is navigating, or the element is not there yet: the real step reports that
    }
  };
  const medGest = (type) => async (sel, ...resten) => {
    observerGest(type, await stille(() => c.js(`window.__rusjA11y ? __rusjA11y.gestMal(${q(sel)}) : null`)));
    return c[type](sel, ...resten);
  };
  const chrome = {
    ...c,
    async klikk(sel, ms = 160) {
      const for_ = await stille(async () => {
        await c.vent(`document.querySelector(${q(sel)})`);
        return c.js(`window.__rusjA11y ? __rusjA11y.forKlikk(${q(sel)}) : null`);
      });
      // Keyboard mode: a control that took focus is activated with a real Enter key press. (The kit
      // ignores real presses for 350 ms after a screen change, so wait that out first.)
      if (tastatur && for_ && for_.fikkFokus && for_.innfodt && !for_.deaktivert) {
        const siden = await stille(() => c.js("__rusjA11y.sidenSkjermbytte()"));
        if (siden != null && siden < 380) await c.sov(380 - siden);
        await c.js(`document.querySelector(${q(sel)}).scrollIntoView({ block: "center" })`);
        for (const type of ["keyDown", "keyUp"]) await c.send("Input.dispatchKeyEvent", { type, key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, ...(type === "keyDown" ? { text: "\r" } : {}) });
        await c.sov(ms);
        taster.enter++;
      } else {
        await c.klikk(sel, ms);
        taster.klikk++;
      }
      observerKlikk(await stille(() => c.js("window.__rusjA11y ? __rusjA11y.etterKlikk() : null")));
    },
    trykk: medGest("trykk"),
    hold: medGest("hold"),
    sveip: medGest("sveip"),
  };

  return { chrome, sjekk, resultat: () => ({ id, skjermer, klikk: Array.from(klikk.values()), gester: Array.from(gester.values()), ...(tastatur ? { taster } : {}) }) };
}
