/* rusj a11y — the part of the accessibility checker that runs inside the page.
   a11y.mjs installs this file in every new document (before the page's own scripts) and calls:
     __rusjA11y.sjekk()        static checks of the current screen → { funn, usikre, info }
     __rusjA11y.fokuspass()    focuses every tab stop (indicator, obscured by the dock), then puts
                               focus and scroll back → { funn }
     __rusjA11y.beskriv(el)    { sig, sti, tekst, boks } for an element (used for AX-tree findings)
     __rusjA11y.forKlikk(sel) / etterKlikk()   focus bookkeeping around a scripted click
     __rusjA11y.hendelser()    drains the recorder: live-region announcements, focus moves, screen
                               changes and clicks since the last call
   A finding is { regel, sig, sti, tekst, boks, ...details }; the rules are documented in a11y.mjs.
   Plain script, no dependencies. Nothing leaves the page and nothing visible is changed. */
(() => {
  "use strict";
  if (window.__rusjA11y) return;

  // ---------- What the checker knows about the rusj kit (everything else is generic) ----------
  const K = {
    mal: 44, // comfortable tap target (Apple HIG, WCAG 2.5.5 AAA)
    malWcag: 24, // WCAG 2.2 AA minimum (2.5.8)
    overlegg: 'dialog[open], [aria-modal="true"], .nedtelling', // layers that take over the screen
    flyktig: "#skjerm, #ark-innhold", // redrawn wholesale by the kit: live regions inside are re-created
    klikk: "[data-h], [data-mappe]", // delegated click / hold actions
    gest: "[data-sveip], [data-mappe], [draggable='true']", // gesture surfaces declared in markup
    pynt: "svg.figur, svg.rusj-logo, svg.maskot, svg.logo-svg, .parade", // decoration: mascots and logo
    bakteppe: ".scene", // fixed backdrop painted behind the whole page
    dokk: ".dokk", // sticky action area; the top of it is a see-through fade
    hemmelig: ".mappe-bakside", // the back of a secret card: must not be in the button’s name (it is read out through #si)
    dokkToning: 0.22, // share of the dock's height that is mostly transparent
    skjerm: "#skjerm", // its class names the current screen
  };

  const KONTROLL =
    'a[href], button, input:not([type="hidden"]), select, textarea, summary, [contenteditable]:not([contenteditable="false"]), ' +
    ["button", "link", "checkbox", "radio", "switch", "tab", "menuitem", "menuitemcheckbox", "menuitemradio", "option", "slider", "spinbutton", "textbox", "searchbox", "combobox"]
      .map((r) => `[role="${r}"]`)
      .join(", ") +
    ', [tabindex]:not([tabindex^="-"])';
  const FOKUSERBAR = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, iframe, [tabindex], [contenteditable]:not([contenteditable="false"]), audio[controls], video[controls]';
  const LEVENDE = '[aria-live], [role="status"], [role="alert"], [role="log"], [role="timer"], [role="marquee"], output';
  const ROLLER = new Set(
    "alert alertdialog application article banner blockquote button caption cell checkbox code columnheader combobox complementary contentinfo definition deletion dialog directory document emphasis feed figure form generic grid gridcell group heading img insertion link list listbox listitem log main marquee math menu menubar menuitem menuitemcheckbox menuitemradio meter navigation none note option paragraph presentation progressbar radio radiogroup region row rowgroup rowheader scrollbar search searchbox separator slider spinbutton status strong subscript superscript switch tab table tablist tabpanel term textbox time timer toolbar tooltip tree treegrid treeitem".split(" "),
  );
  // aria-* states and the roles (or native elements) that support them.
  const STOTTER = {
    "aria-pressed": { roller: ["button"], innfodt: 'button, input[type="button"], input[type="submit"], input[type="reset"], summary' },
    "aria-checked": { roller: ["checkbox", "radio", "switch", "menuitemcheckbox", "menuitemradio", "option", "treeitem"], innfodt: 'input[type="checkbox"], input[type="radio"]' },
    "aria-selected": { roller: ["gridcell", "option", "row", "tab", "columnheader", "rowheader", "treeitem"], innfodt: "option, td, th, tr" },
    "aria-expanded": { roller: ["button", "link", "combobox", "application", "checkbox", "gridcell", "listbox", "menuitem", "menuitemcheckbox", "menuitemradio", "row", "rowheader", "columnheader", "switch", "tab", "treeitem"], innfodt: "button, a[href], summary, input, select" },
  };
  // Roles that must sit inside a given parent role.
  const KONTEKST = { gridcell: ["row"], row: ["grid", "table", "treegrid", "rowgroup"], tab: ["tablist"], option: ["listbox", "group"], listitem: ["list"], menuitem: ["menu", "menubar", "group"], columnheader: ["row"], rowheader: ["row"] };
  // Elements whose implicit role may not be named: aria-label there is ignored by screen readers.
  const UTEN_NAVN = new Set(["div", "span", "p", "i", "b", "em", "strong", "small", "u", "s", "code", "sub", "sup", "mark"]);
  // Words that are English and not also Norwegian (so not: best, hint, score, level, skip, hard, medium).
  const ENGELSK = /\b(game over|high ?score|undo|share|loading|next|new game|play again|continue|settings|mute|you win|you lose|close|done|players?|winner|easy|tap to|click|swipe)\b/i;

  // ---------- Small helpers ----------

  const $$ = (sel, rot) => Array.from((rot || document).querySelectorAll(sel));
  const kort = (t, n = 60) => {
    t = String(t == null ? "" : t).replace(/\s+/g, " ").trim();
    return t.length > n ? t.slice(0, n - 1) + "…" : t;
  };
  const rund = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
  let stiler = new Map();
  const stil = (el) => {
    let s = stiler.get(el);
    if (!s) stiler.set(el, (s = getComputedStyle(el)));
    return s;
  };

  // A stable name for "this kind of element": tag, id (digits → N), two classes, action, role.
  const sig = (el) => {
    if (!el || el.nodeType !== 1) return "";
    const id = el.id ? "#" + el.id.replace(/\d+/g, "N") : "";
    const kl = Array.from(el.classList).slice(0, 2).map((k) => "." + k).join("");
    const h = el.getAttribute("data-h");
    const rolle = el.getAttribute("role");
    return el.localName + id + kl + (h ? `[data-h=${h}]` : "") + (rolle ? `[role=${rolle}]` : "");
  };
  const sti = (el) => {
    const deler = [];
    for (let e = el.parentElement; e && e !== document.body && deler.length < 2; e = e.parentElement) if (e.id || e.classList.length) deler.unshift(sig(e));
    return deler.join(" > ");
  };
  const synligTekst = (el) => kort(el.innerText != null ? el.innerText : el.textContent);
  const tekstAv = (el) => kort(el.getAttribute("aria-label") || synligTekst(el) || el.value || el.getAttribute("placeholder") || el.getAttribute("title") || el.getAttribute("alt") || "");
  const boks = (el) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y + scrollY), b: rund(r.width), h: rund(r.height) };
  };
  const beskriv = (el) => ({ sig: sig(el), sti: sti(el), tekst: tekstAv(el), boks: boks(el) });

  function synlig(el) {
    if (!el.isConnected) return false;
    if (el.checkVisibility && !el.checkVisibility({ checkVisibilityCSS: true, visibilityProperty: true })) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  // Hidden for the eye on purpose (.vh): read by screen readers, but no tap target and no colours.
  function gjemt(el) {
    for (let e = el, n = 0; e && e !== document.body && n < 4; e = e.parentElement, n++) {
      const r = e.getBoundingClientRect();
      if (r.width <= 2 && r.height <= 2 && (stil(e).overflow !== "visible" || stil(e).clipPath !== "none")) return true;
    }
    return false;
  }
  // Cut away completely by an ancestor with overflow hidden/clip (collapsed panels, card backs).
  function klippetBort(el) {
    const r = el.getBoundingClientRect();
    for (let e = el.parentElement; e && e !== document.documentElement; e = e.parentElement) {
      const s = stil(e);
      if (!/hidden|clip/.test(s.overflowX + s.overflowY)) continue;
      const f = e.getBoundingClientRect();
      if (r.right <= f.left + 1 || r.left >= f.right - 1 || r.bottom <= f.top + 1 || r.top >= f.bottom - 1) return true;
    }
    return false;
  }
  const opasitet = (el) => {
    let o = 1;
    for (let e = el; e; e = e.parentElement) o *= Number(stil(e).opacity);
    return o;
  };
  // Turned away (the back of a flipped card): painted nowhere although it has a size.
  const bortvendt = (el) => {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const s = stil(e);
      if (s.backfaceVisibility !== "hidden") continue;
      // The face is hidden when the accumulated rotation turns it away: compare its matrix with the viewer.
      let m = new DOMMatrix();
      for (let f = e; f && f !== document.body; f = f.parentElement) {
        const t = stil(f).transform;
        if (t && t !== "none") m = new DOMMatrix(t).multiply(m);
      }
      if (m.m33 < 0) return true;
    }
    return false;
  };
  const inaktiv = (el) => !!el.closest('button:disabled, input:disabled, select:disabled, textarea:disabled, fieldset:disabled, [aria-disabled="true"], [inert]');
  const iAtTre = (el) => !el.closest('[aria-hidden="true"], [inert]');
  const erTabbar = (el) => el.matches(FOKUSERBAR) && el.tabIndex >= 0 && !el.disabled && !el.closest("[inert]") && synlig(el);
  const innfodt = (el) => (el.matches('a[href], button, input:not([type="hidden"]), select, textarea, summary') ? el.localName : "");
  const idrefTekst = (el, attr) =>
    (el.getAttribute(attr) || "")
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => (document.getElementById(id) || {}).textContent || "")
      .join(" ")
      .trim();
  const skjermnavn = () => {
    const s = document.querySelector(K.skjerm);
    if (s) return (s.className.match(/skjerm-([\w-]+)/) || [])[1] || "";
    const apen = $$("main > section.skjerm:not([hidden])")[0]; // Luringen: one section per screen
    return apen ? apen.id.replace(/^s-/, "") : "";
  };

  // The layer the user is actually in: the top overlay if one is open, else the whole page.
  function omfang() {
    let topp = null;
    let toppZ = -Infinity;
    for (const el of $$(K.overlegg)) {
      if (!synlig(el)) continue;
      let z = 0;
      if (el.matches("dialog:modal")) z = 1e9;
      else
        for (let e = el; e && e !== document.body; e = e.parentElement) {
          const s = stil(e);
          if (s.position !== "static" && s.zIndex !== "auto") z = Math.max(z, Number(s.zIndex));
        }
      if (z >= toppZ) {
        toppZ = z;
        topp = el;
      }
    }
    return topp;
  }

  // ---------- Colour ----------

  let lerret = null;
  const fargeCache = new Map();
  // Any CSS colour → [r, g, b, a] (0–255, alpha 0–1).
  function farge(tekst) {
    if (fargeCache.has(tekst)) return fargeCache.get(tekst);
    const alfa = (a) => (a == null ? 1 : /%$/.test(a) ? parseFloat(a) / 100 : Number(a));
    let v;
    let m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(tekst);
    if (m) v = [Number(m[1]), Number(m[2]), Number(m[3]), alfa(m[4])];
    else if ((m = /^color\(srgb\s+([\d.e+-]+)\s+([\d.e+-]+)\s+([\d.e+-]+)(?:\s*\/\s*([\d.e+-]+%?))?\s*\)$/.exec(tekst))) v = [m[1] * 255, m[2] * 255, m[3] * 255, alfa(m[4])];
    else {
      if (!lerret) {
        lerret = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
        lerret.canvas.width = lerret.canvas.height = 1;
      }
      lerret.clearRect(0, 0, 1, 1);
      lerret.fillStyle = "#000";
      lerret.fillStyle = tekst;
      lerret.fillRect(0, 0, 1, 1);
      const d = lerret.getImageData(0, 0, 1, 1).data;
      v = [d[0], d[1], d[2], d[3] / 255];
    }
    fargeCache.set(tekst, v);
    return v;
  }
  const hex = (c) => "#" + c.slice(0, 3).map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
  const lin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const kontrast = (a, b) => {
    const la = lum(a);
    const lb = lum(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };
  // Premultiplied "source over".
  const pre = (c) => [c[0] * c[3], c[1] * c[3], c[2] * c[3], c[3]];
  const over = (s, d) => [s[0] + d[0] * (1 - s[3]), s[1] + d[1] * (1 - s[3]), s[2] + d[2] * (1 - s[3]), s[3] + d[3] * (1 - s[3])];
  const upre = (c) => (c[3] > 0 ? [c[0] / c[3], c[1] / c[3], c[2] / c[3], c[3]] : [0, 0, 0, 0]);

  // Split "a, b(c, d), e" at top-level commas.
  function delLag(tekst) {
    const ut = [];
    let dybde = 0;
    let start = 0;
    for (let i = 0; i < tekst.length; i++) {
      const t = tekst[i];
      if (t === "(") dybde++;
      else if (t === ")") dybde--;
      else if (t === "," && dybde === 0) {
        ut.push(tekst.slice(start, i).trim());
        start = i + 1;
      }
    }
    ut.push(tekst.slice(start).trim());
    return ut.filter(Boolean);
  }

  // What one element paints behind its content: colour, gradient layers (their stop colours), image.
  let lagCache = new Map();
  function lag(el) {
    let l = lagCache.get(el);
    if (l) return l;
    const s = stil(el);
    l = { bg: farge(s.backgroundColor), grad: [], bilde: false, o: Number(s.opacity), filter: /brightness|contrast|opacity|invert|grayscale|sepia|saturate|hue-rotate/.test(s.filter) };
    if (s.backgroundImage && s.backgroundImage !== "none") {
      // First layer is painted on top: store bottom → top.
      for (const del of delLag(s.backgroundImage).reverse()) {
        if (/gradient\(/.test(del)) {
          const stopp = (del.match(/rgba?\([^)]*\)|color\([^)]*\)/g) || []).map(farge);
          if (stopp.length) l.grad.push(stopp);
        } else if (/url\(/.test(del)) l.bilde = true;
      }
    }
    lagCache.set(el, l);
    return l;
  }

  // The colours an element's text is seen with: text colour and background after every ancestor's
  // background, gradient and opacity. Gradients give several possible backgrounds (one per stop).
  function fargerFor(el, tekstfarge) {
    let kjede = [];
    for (let e = el; e; e = e.parentElement) kjede.unshift({ el: e, ...lag(e) });
    const bakteppe = document.querySelector(K.bakteppe);
    if (bakteppe && synlig(bakteppe) && !bakteppe.contains(el)) {
      const i = kjede.findIndex((k) => k.el === document.body);
      // Painted above <body>'s own background and below the rest of the page.
      kjede.splice(i + 1, 0, { el: bakteppe, ...lag(bakteppe), sosken: true });
    }
    // Everything under an opaque, fully visible background is hidden: start there.
    let start = 0;
    let o = 1;
    const opakOver = [];
    for (let i = 0; i < kjede.length; i++) {
      o *= kjede[i].o;
      opakOver[i] = o >= 0.999;
    }
    for (let i = kjede.length - 1; i >= 0; i--)
      if (kjede[i].bg[3] >= 0.999 && opakOver[i] && !kjede[i].sosken) {
        start = i;
        break;
      }
    const rot = stil(document.documentElement);
    const grunn = (() => {
      for (const s of [rot, stil(document.body)]) {
        const c = farge(s.backgroundColor);
        if (c[3] > 0) return [c[0], c[1], c[2], 1];
      }
      return /dark/.test(rot.colorScheme) ? [18, 18, 18, 1] : [255, 255, 255, 1];
    })();
    kjede = kjede.slice(start);
    const bilde = kjede.some((k) => k.bilde);
    const filter = kjede.some((k) => k.filter);
    // One choice of stop colour per gradient layer; the combinations are the possible backgrounds.
    const gradienter = [];
    kjede.forEach((k, i) => k.grad.forEach((stopp, j) => gradienter.push({ i, j, stopp: ytterpunkter(stopp) })));
    let kombinasjoner = [[]];
    for (const g of gradienter) {
      const neste = [];
      for (const k of kombinasjoner) for (const c of g.stopp) neste.push([...k, c]);
      kombinasjoner = neste.slice(0, 256);
    }
    const mal = (i, valg, medTekst) => {
      const k = kjede[i];
      let buf = pre(k.bg);
      k.grad.forEach((_, j) => {
        const g = gradienter.findIndex((x) => x.i === i && x.j === j);
        buf = over(pre(valg[g]), buf);
      });
      // A sibling layer (the backdrop) does not contain the rest: paint it, then go on beside it.
      if (k.sosken) {
        const lag = buf.map((v) => v * k.o);
        return i === kjede.length - 1 ? lag : over(mal(i + 1, valg, medTekst), lag);
      }
      if (i === kjede.length - 1) {
        if (medTekst) buf = over(pre(tekstfarge), buf);
      } else buf = over(mal(i + 1, valg, medTekst), buf);
      return buf.map((v) => v * k.o);
    };
    const varianter = kombinasjoner.map((valg) => {
      const bg = upre(over(mal(0, valg, false), pre(grunn)));
      const fg = upre(over(mal(0, valg, true), pre(grunn)));
      return { fg, bg, forhold: kontrast(fg, bg) };
    });
    varianter.sort((a, b) => a.forhold - b.forhold);
    return { varianter, flat: gradienter.length === 0 && !bilde && !filter, bilde, filter };
  }
  // The stops that can give the lowest and highest contrast: extremes in alpha and in lightness.
  function ytterpunkter(stopp) {
    const unike = Array.from(new Map(stopp.map((c) => [c.join(), c])).values());
    if (unike.length <= 4) return unike;
    const etter = (f) => unike.slice().sort((a, b) => f(a) - f(b));
    const a = etter((c) => c[3]);
    const l = etter((c) => lum(c));
    return Array.from(new Set([a[0], a[a.length - 1], l[0], l[l.length - 1]]));
  }

  // ---------- The checks ----------

  let funn = [];
  const meld = (regel, el, detaljer) => funn.push({ regel, ...beskriv(el), ...(detaljer || {}) });

  // Text contrast (WCAG 1.4.3; symbols 1.4.11). Flat backgrounds are decided here; text over a
  // gradient or image goes to `usikre` with its boxes, and a11y.mjs measures the screenshot.
  function sjekkKontrast(rot, usikre, info) {
    const elementer = new Map();
    const tw = document.createTreeWalker(rot, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      if (!/\S/.test(n.nodeValue)) continue;
      const el = n.parentElement;
      if (!el || el.closest("script, style, noscript, template, select, svg, canvas")) continue;
      if (!elementer.has(el)) elementer.set(el, []);
      elementer.get(el).push(n);
    }
    const vurder = (el, tekst, tekstfarge, noder, ekstra) => {
      const bokstaver = /[\p{L}\p{N}]/u.test(tekst);
      // Emoji bring their own colours: nothing to measure.
      if (!bokstaver && !/[^\s\p{Extended_Pictographic}\u200d\ufe0e\ufe0f\u{1f3fb}-\u{1f3ff}]/u.test(tekst)) return;
      const s = stil(el);
      const px = parseFloat(s.fontSize);
      const vekt = Number(s.fontWeight) || 400;
      const stor = px >= 24 || (px >= 18.66 && vekt >= 700);
      const grense = !bokstaver || stor ? 3 : 4.5;
      const regel = bokstaver ? "kontrast" : "kontrast-symbol";
      const f = fargerFor(el, tekstfarge);
      const verst = f.varianter[0];
      const best = f.varianter[f.varianter.length - 1];
      const felles = { px: rund(px), vekt, grense, fg: hex(verst.fg), bg: hex(verst.bg), forhold: rund(verst.forhold, 2), ...(ekstra || {}) };
      if (s.backgroundClip === "text" || s.webkitBackgroundClip === "text") return usikre.push({ regel, ...beskriv(el), ...felles, grunn: "tekst fylt med bakgrunn (background-clip: text)" });
      if (f.flat) {
        if (verst.forhold < grense - 0.005) meld(regel, el, { ...felles, nokkel: felles.fg + felles.bg + grense });
        return;
      }
      if (!f.bilde && !f.filter && verst.forhold >= grense) return; // passes against every stop
      // Gradient, image or filter behind: the screenshot decides (a11y.mjs asks for the boxes with rekterFor).
      usikre.push({
        regel,
        ...beskriv(el),
        ...felles,
        til: rund(best.forhold, 2),
        tekstfarge: tekstfarge.map((v) => rund(v, 3)),
        opasitet: rund(opasitet(el), 3),
        id: usikreEl.push({ el, noder }) - 1,
        grunn: f.bilde ? "bilde bak" : f.filter ? "filter" : "gradient bak",
      });
    };
    // Elements whose opacity is being animated right now (a toast fading out, a screen fading in).
    const toner = new Set(
      (document.getAnimations ? document.getAnimations() : [])
        .filter((a) => a.playState === "running" && a.effect && a.effect.target && (a.transitionProperty === "opacity" || (a.effect.getKeyframes && a.effect.getKeyframes().some((k) => "opacity" in k))))
        .map((a) => a.effect.target),
    );
    const tonerNa = (el) => {
      for (let e = el; e; e = e.parentElement) if (toner.has(e)) return true;
      return false;
    };
    for (const [el, noder] of elementer) {
      if (!synlig(el) || gjemt(el) || klippetBort(el) || bortvendt(el) || opasitet(el) < 0.05) continue;
      if (el.closest(K.pynt)) continue;
      if (toner.size && tonerNa(el)) {
        info.iOvergang = (info.iOvergang || 0) + 1;
        continue;
      }
      if (inaktiv(el)) {
        info.inaktivTekst++;
        continue;
      }
      const s = stil(el);
      vurder(el, noder.map((n) => n.nodeValue).join(" "), farge(s.webkitTextFillColor || s.color), noder);
    }
    // Typed text and placeholders in fields.
    for (const el of $$("input:not([type='hidden']), textarea", rot)) {
      if (!synlig(el) || gjemt(el) || inaktiv(el) || /^(checkbox|radio|range|color|file|button|submit|reset|image)$/.test(el.type)) continue;
      if (el.value) vurder(el, el.value, farge(stil(el).color), null, { del: "skrevet tekst" });
      else if (el.placeholder) {
        const p = getComputedStyle(el, "::placeholder");
        const c = farge(p.color);
        vurder(el, el.placeholder, [c[0], c[1], c[2], c[3] * Number(p.opacity || 1)], null, { del: "plassholder" });
      }
    }
    // Text drawn by ::before / ::after (step numbers, check marks).
    for (const el of $$("*", rot)) {
      if (el.closest("svg, script, style") || !synlig(el) || gjemt(el) || inaktiv(el)) continue;
      for (const pseudo of ["::before", "::after"]) {
        const p = getComputedStyle(el, pseudo);
        if (!p.content || p.content === "none" || p.content === "normal" || p.display === "none") continue;
        const tekst = /^counters?\(/.test(p.content) ? "1" : (p.content.match(/"((?:[^"\\]|\\.)*)"/) || [])[1] || "";
        if (!/\S/.test(tekst) || Number(p.opacity) < 0.05) continue;
        const bg = farge(p.backgroundColor);
        const c = farge(p.color);
        if (bg[3] >= 0.999) {
          // The pseudo-element has its own opaque background: measure against that.
          const bokstaver = /[\p{L}\p{N}]/u.test(tekst);
          if (!bokstaver && !/[^\s\p{Extended_Pictographic}\ufe0e\ufe0f]/u.test(tekst)) continue;
          const px = parseFloat(p.fontSize);
          const grense = !bokstaver || px >= 24 || (px >= 18.66 && Number(p.fontWeight) >= 700) ? 3 : 4.5;
          const fg = upre(over(pre(c), pre(bg)));
          const forhold = kontrast(fg, bg);
          if (forhold < grense - 0.005) meld(bokstaver ? "kontrast" : "kontrast-symbol", el, { del: pseudo, px: rund(px), vekt: Number(p.fontWeight), grense, fg: hex(fg), bg: hex(bg), forhold: rund(forhold, 2), tekst: kort(tekst), nokkel: pseudo + hex(fg) + hex(bg) });
        } else if (Number(p.opacity) >= 0.999) vurder(el, tekst, c, null, { del: pseudo, tekst: kort(tekst) });
      }
    }
    // Text inside drawings (boards, dice, wheels): only the screenshot can tell what is behind it.
    for (const el of $$("svg text", rot)) {
      if (!synlig(el) || el.closest(K.pynt) || !/[\p{L}\p{N}]/u.test(el.textContent) || opasitet(el) < 0.05) continue;
      const tegning = el.ownerSVGElement;
      if (gjemt(tegning) || klippetBort(tegning) || bortvendt(tegning)) continue;
      const r = el.getBoundingClientRect();
      const fyll = farge(stil(el).fill);
      if (fyll[3] < 0.05) continue;
      const px = r.height / 1.2; // the box of a line of text is about 1.2 × the font size
      const vekt = Number(stil(el).fontWeight) || 400;
      usikre.push({ regel: "kontrast", ...beskriv(el), tekst: kort(el.textContent), px: rund(px), vekt, grense: px >= 24 || (px >= 18.66 && vekt >= 700) ? 3 : 4.5, tekstfarge: fyll.map((v) => rund(v, 3)), opasitet: rund(opasitet(el), 3), id: usikreEl.push({ el, noder: null }) - 1, grunn: "tekst i svg" });
    }
  }

  // The elements behind the uncertain contrast entries of the last sjekk(), by their id.
  let usikreEl = [];
  // Where the text of those entries is right now: { id: [[x, y, b, h], …] } for the boxes that are
  // on screen and not covered by something else (the sticky dock, a sheet).
  function rekterFor(ider) {
    const ut = {};
    for (const id of ider) {
      const u = usikreEl[id];
      if (!u || !u.el.isConnected) continue;
      let bokser = [u.el.getBoundingClientRect()];
      if (u.noder) {
        const omrade = document.createRange();
        bokser = u.noder.flatMap((n) => (omrade.selectNodeContents(n), Array.from(omrade.getClientRects())));
      }
      const synlige = [];
      for (const r of bokser) {
        if (r.width <= 2 || r.height <= 2 || r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight || synlige.length >= 4) continue;
        const topp = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        const svg = u.el.ownerSVGElement;
        if (topp && (u.el.contains(topp) || topp.contains(u.el) || (svg && svg.contains(topp)))) synlige.push([rund(r.left), rund(r.top), rund(r.width), rund(r.height)]);
      }
      if (synlige.length) ut[id] = synlige;
    }
    return ut;
  }
  // Scroll positions (at most 8) that together bring those entries into view.
  function rullestopp(ider) {
    const maks = Math.max(0, document.documentElement.scrollHeight - innerHeight);
    const stopp = new Set();
    for (const id of ider) {
      const u = usikreEl[id];
      if (!u || !u.el.isConnected) continue;
      const y = u.el.getBoundingClientRect().top + scrollY;
      stopp.add(Math.round(Math.max(0, Math.min(maks, y - innerHeight * 0.35)) / (innerHeight * 0.4)) * Math.round(innerHeight * 0.4));
    }
    return Array.from(stopp).map((y) => Math.min(maks, y)).sort((a, b) => a - b).slice(0, 8);
  }

  // Tap targets (WCAG 2.5.8 with its spacing exception; 44 px as the comfortable size).
  function sjekkMal(kontroller) {
    const mal = [];
    for (const el of kontroller) {
      if (inaktiv(el) || gjemt(el) || klippetBort(el) || bortvendt(el)) continue;
      // A link inside a sentence is exempt.
      if (el.localName === "a" && stil(el).display === "inline" && Array.from(el.parentElement.childNodes).some((n) => n.nodeType === 3 && /\S/.test(n.nodeValue))) continue;
      let r = el.getBoundingClientRect();
      let x0 = r.left;
      let y0 = r.top;
      let x1 = r.right;
      let y1 = r.bottom;
      // A field with a label: tapping the label counts too.
      for (const l of el.labels || []) {
        const lr = l.getBoundingClientRect();
        if (!lr.width) continue;
        x0 = Math.min(x0, lr.left);
        y0 = Math.min(y0, lr.top);
        x1 = Math.max(x1, lr.right);
        y1 = Math.max(y1, lr.bottom);
      }
      mal.push({ el, x0, y0, x1, y1, b: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 });
    }
    const liten = (m) => Math.min(m.b, m.h) < K.malWcag - 0.5;
    for (const m of mal) {
      if (m.b >= K.mal - 0.5 && m.h >= K.mal - 0.5) continue;
      const detaljer = { b: rund(m.b), h: rund(m.h), nokkel: Math.round(m.b) + "x" + Math.round(m.h) };
      if (!liten(m)) {
        meld("mal-44", m.el, detaljer);
        continue;
      }
      // Spacing exception: a 24 px circle on the target must not touch another target (or its circle).
      const nabo = mal.find((n) => {
        if (n === m || n.el.contains(m.el) || m.el.contains(n.el)) return false;
        if (liten(n)) return Math.hypot(n.cx - m.cx, n.cy - m.cy) < K.malWcag;
        const dx = Math.max(n.x0 - m.cx, 0, m.cx - n.x1);
        const dy = Math.max(n.y0 - m.cy, 0, m.cy - n.y1);
        return Math.hypot(dx, dy) < K.malWcag / 2;
      });
      meld(nabo ? "mal-24" : "mal-44", m.el, { ...detaljer, ...(nabo ? { nabo: sig(nabo.el) } : { merk: "under 24 px, men med nok luft rundt (2.5.8 unntak)" }) });
    }
  }

  // The visible text of a control must be part of its accessible name (WCAG 2.5.3).
  function sjekkNavnOgTekst(kontroller) {
    const norm = (t) => String(t).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    for (const el of kontroller) {
      const navn = idrefTekst(el, "aria-labelledby") || el.getAttribute("aria-label");
      if (!navn) continue;
      // (What is on the back of a secret card is the one text that must not be in the name.)
      const hemmelig = el.querySelector(K.hemmelig);
      const vist = String(el.innerText || "").replace(hemmelig && hemmelig.innerText ? hemmelig.innerText : "\u0000", "");
      const linjer = vist.split("\n").map(norm).filter((l) => (l.match(/\p{L}/gu) || []).length > 1);
      const mangler = linjer.filter((l) => !norm(navn).includes(l));
      if (mangler.length) meld("navn-uten-synlig-tekst", el, { navn: kort(navn, 90), synlig: kort(mangler.join(" | "), 90) });
    }
  }

  function sjekkOverskrifter(info) {
    // An empty heading has no size, but screen readers still stop at it: only display and visibility count here.
    const vist = (h) => (h.checkVisibility ? h.checkVisibility({ checkVisibilityCSS: true, visibilityProperty: true }) : synlig(h));
    const alle = $$("h1, h2, h3, h4, h5, h6, [role='heading']").filter((h) => vist(h) && iAtTre(h));
    const niva = (h) => Number(h.getAttribute("aria-level")) || Number(h.localName[1]) || 2;
    const h1 = alle.filter((h) => niva(h) === 1);
    info.h1 = h1.map((h) => kort(h.textContent));
    info.overskrifter = alle.map((h) => niva(h) + " " + kort(h.textContent, 40));
    if (h1.length !== 1) funn.push({ regel: "h1-antall", sig: "h1", sti: "", tekst: info.h1.join(" | "), antallH1: h1.length, nokkel: String(h1.length) });
    let forrige = 0;
    for (const h of alle) {
      const n = niva(h);
      if (!kort(h.textContent) && !h.getAttribute("aria-label")) meld("overskrift-tom", h);
      if (forrige && n > forrige + 1) meld("overskrift-hopp", h, { fra: forrige, til: n, nokkel: forrige + ">" + n });
      forrige = n;
    }
    if (alle.length && niva(alle[0]) !== 1) meld("h1-ikke-forst", alle[0], { niva: niva(alle[0]) });
  }

  function sjekkFelt(rot) {
    for (const el of $$('input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="image"]), select, textarea, [contenteditable]:not([contenteditable="false"])', rot)) {
      if (!synlig(el) || !iAtTre(el)) continue;
      const etiketter = Array.from(el.labels || []).filter((l) => l.textContent.trim());
      const usynlig = (el.getAttribute("aria-label") || "").trim() || idrefTekst(el, "aria-labelledby") || (el.getAttribute("title") || "").trim();
      if (!etiketter.length && !usynlig) meld(el.getAttribute("placeholder") ? "felt-bare-plassholder" : "felt-uten-etikett", el);
      else if (!etiketter.length && !el.getAttribute("aria-labelledby")) meld("felt-uten-synlig-etikett", el, { navn: kort(usynlig) });
    }
  }

  function sjekkAria(rot) {
    for (const el of $$("[tabindex]", rot)) if (Number(el.getAttribute("tabindex")) > 0) meld("tabindex-positiv", el, { tabindex: el.getAttribute("tabindex") });
    for (const [attr, st] of Object.entries(STOTTER))
      for (const el of $$(`[${attr}]`, rot)) {
        const rolle = el.getAttribute("role");
        if (rolle ? !st.roller.includes(rolle) : !el.matches(st.innfodt)) meld("aria-feil-rolle", el, { attributt: attr, nokkel: attr });
      }
    for (const el of $$("[role]", rot)) {
      const rolle = el.getAttribute("role").trim().split(/\s+/)[0];
      if (!ROLLER.has(rolle)) meld("rolle-ugyldig", el, { rolle });
      const krever = KONTEKST[rolle];
      if (krever && synlig(el)) {
        let forelder = el.parentElement;
        while (forelder && (!forelder.getAttribute("role") || /^(presentation|none|generic)$/.test(forelder.getAttribute("role")))) {
          if (rolle === "listitem" && /^(ul|ol)$/.test(forelder.localName)) break;
          if (/^(row|gridcell|columnheader|rowheader)$/.test(rolle) && /^(table|tbody|thead|tr)$/.test(forelder.localName)) break;
          forelder = forelder.parentElement;
        }
        if (!forelder || (forelder.getAttribute("role") && !krever.includes(forelder.getAttribute("role")))) meld("rolle-kontekst", el, { rolle, krever: krever.join("/") });
      }
      if (/^(button|link|checkbox|radio|switch|tab|menuitem|option|slider|spinbutton|textbox|combobox)$/.test(rolle) && synlig(el) && !innfodt(el) && !el.hasAttribute("tabindex") && !el.closest("[aria-activedescendant]") && !inaktiv(el))
        meld("rolle-uten-fokus", el, { rolle });
    }
    for (const el of $$("[aria-label], [aria-labelledby]", rot)) if (!el.getAttribute("role") && UTEN_NAVN.has(el.localName) && synlig(el) && iAtTre(el)) meld("aria-label-uten-rolle", el, { navn: kort(el.getAttribute("aria-label") || idrefTekst(el, "aria-labelledby")) });
    for (const el of $$('[aria-hidden="true"]', rot)) {
      if (!synlig(el)) continue;
      const fokus = [el, ...$$(FOKUSERBAR, el)].filter((f) => f.matches(FOKUSERBAR) && erTabbar(f));
      if (fokus.length) meld("aria-hidden-fokus", el, { fokuserbare: fokus.length, forste: sig(fokus[0]) });
    }
    for (const attr of ["aria-labelledby", "aria-describedby", "aria-controls", "aria-owns", "aria-activedescendant", "for"])
      for (const el of $$(`[${attr}]`, rot)) {
        if (!synlig(el) && attr !== "for") continue;
        const mangler = el.getAttribute(attr).split(/\s+/).filter((id) => id && !document.getElementById(id));
        // aria-controls may point at a panel that is only in the page while it is open.
        if (mangler.length && attr !== "aria-controls") meld("aria-ref-mangler", el, { attributt: attr, id: mangler.join(" "), nokkel: attr + mangler.join(" ") });
      }
    // Controls inside controls: screen readers only get the outer one.
    for (const el of $$(KONTROLL, rot)) {
      const ytre = el.parentElement && el.parentElement.closest('a[href], button, [role="button"], [role="link"]');
      if (ytre && synlig(el)) meld("nestet-kontroll", el, { ytre: sig(ytre) });
    }
  }

  function sjekkId() {
    const sett = new Map();
    for (const el of $$("[id]")) sett.set(el.id, (sett.get(el.id) || 0) + 1);
    const brukt = new Set();
    for (const el of $$("[aria-labelledby], [aria-describedby], [aria-controls], [for], [href^='#']"))
      for (const attr of ["aria-labelledby", "aria-describedby", "aria-controls", "for", "href"]) for (const id of (el.getAttribute(attr) || "").replace(/^#/, "").split(/\s+/)) brukt.add(id);
    for (const [id, antall] of sett) {
      if (antall < 2) continue;
      const el = document.getElementById(id);
      meld("duplikat-id", el, { id, antallId: antall, referert: brukt.has(id), iSvg: !!el.closest("svg"), nokkel: id.replace(/\d+/g, "N") });
    }
  }

  function sjekkBilder(rot) {
    for (const el of $$("svg", rot)) {
      if (el.parentElement.closest("svg") || !synlig(el) || !iAtTre(el)) continue;
      const rolle = el.getAttribute("role");
      if (rolle === "presentation" || rolle === "none") continue;
      const tittel = Array.from(el.children).find((b) => b.localName === "title");
      const navn = (el.getAttribute("aria-label") || "").trim() || idrefTekst(el, "aria-labelledby") || (tittel ? tittel.textContent.trim() : "");
      if (rolle === "img" && navn) continue;
      // Inside a control that has its own name the drawing is noise; alone it is the whole message.
      const kontroll = el.closest(KONTROLL);
      meld(rolle === "img" ? "bilde-uten-navn" : navn ? "svg-uten-rolle" : "svg-ikke-skjult", el, { iKontroll: kontroll ? sig(kontroll) : "", tekstISvg: kort(el.textContent, 40) });
    }
    for (const el of $$("img", rot)) {
      if (!synlig(el) || !iAtTre(el)) continue;
      if (!el.hasAttribute("alt") && !el.getAttribute("aria-label") && !/^(presentation|none)$/.test(el.getAttribute("role") || "")) meld("bilde-uten-alt", el, { src: kort(el.getAttribute("src"), 40) });
    }
    for (const el of $$("canvas", rot)) {
      if (!synlig(el) || !iAtTre(el)) continue;
      const navn = (el.getAttribute("aria-label") || "").trim() || idrefTekst(el, "aria-labelledby") || el.textContent.trim();
      if (!navn) meld("lerret-uten-alternativ", el, { b: el.clientWidth, h: el.clientHeight });
      else if (!el.getAttribute("role")) meld("lerret-uten-rolle", el, { navn: kort(navn) });
    }
  }

  const hoflighet = (el) => {
    const a = (el.getAttribute("aria-live") || "").toLowerCase();
    if (a) return a;
    const r = el.getAttribute("role");
    if (r === "alert") return "assertive";
    return r === "status" || r === "log" || el.localName === "output" ? "polite" : "off";
  };
  function sjekkLevende(info) {
    info.levende = [];
    for (const el of $$(LEVENDE)) {
      const hof = hoflighet(el);
      const sett = synlig(el);
      const flyktig = !!el.closest(K.flyktig);
      info.levende.push(`${sig(el)} ${hof}${sett ? "" : " (skjult)"}${flyktig ? " (flyktig)" : ""}`);
      if (hof === "off" || !sett) continue;
      const tegn = el.textContent.trim().length;
      if (hof === "assertive" && tegn) meld("live-assertiv", el, { tegn });
      if (flyktig) meld("live-flyktig", el, { hof, nokkel: hof });
      if (tegn > 200) meld("live-lang", el, { tegn });
      if (el.parentElement.closest(LEVENDE) && hoflighet(el.parentElement.closest(LEVENDE)) !== "off") meld("live-nestet", el, { ytre: sig(el.parentElement.closest(LEVENDE)) });
      const kontroll = el.parentElement.closest('button, a[href], [role="button"]');
      if (kontroll) meld("live-i-kontroll", el, { kontroll: sig(kontroll) });
      if (!iAtTre(el)) meld("live-skjult-for-at", el);
    }
  }

  // Things that react to a click or a gesture without being a control a keyboard can reach.
  function sjekkPeker(rot, info) {
    info.gestflater = [];
    for (const el of $$(K.klikk, rot)) {
      if (!synlig(el) || inaktiv(el)) continue;
      if (!innfodt(el) && !erTabbar(el)) meld("klikk-uten-tastatur", el, { handling: el.getAttribute("data-h") || "" });
    }
    const flater = new Set($$(K.gest, rot).filter(synlig));
    for (const el of $$("*", rot)) {
      if (el.closest("svg") && el.localName !== "svg") continue;
      if (!synlig(el)) continue;
      const s = stil(el);
      const forelder = el.parentElement ? stil(el.parentElement) : null;
      if (s.touchAction !== "auto" && s.touchAction !== "manipulation" && (!forelder || forelder.touchAction !== s.touchAction)) flater.add(el);
      if (/^(pointer|grab|move|crosshair)$/.test(s.cursor) && (!forelder || forelder.cursor !== s.cursor) && !el.closest(KONTROLL + ", label") && !el.matches(K.klikk) && !inaktiv(el))
        meld("peker-uten-kontroll", el, { cursor: s.cursor, harKontroll: !!el.querySelector(KONTROLL) });
    }
    for (const el of flater) {
      const r = el.getBoundingClientRect();
      info.gestflater.push(`${sig(el)} touch-action:${stil(el).touchAction} ${Math.round(r.width)}×${Math.round(r.height)}${innfodt(el) ? " (" + innfodt(el) + ")" : ""}${el.getAttribute("data-sveip") ? " sveip" : ""}`);
    }
  }

  function sjekkSide(info) {
    const rot = document.documentElement;
    info.lang = rot.getAttribute("lang") || "";
    if (!/^(nb|no|nn)\b/i.test(info.lang)) funn.push({ regel: "lang-mangler", sig: "html", sti: "", tekst: info.lang });
    info.andreSprak = $$("[lang]").filter((e) => e !== rot && e.getAttribute("lang") !== info.lang).map((e) => sig(e) + ":" + e.getAttribute("lang"));
    info.tittel = document.title;
    if (!document.title.trim()) funn.push({ regel: "tittel-mangler", sig: "title", sti: "", tekst: "" });
    const vp = document.querySelector('meta[name="viewport"]');
    info.viewport = vp ? vp.content : "";
    const maks = /maximum-scale\s*=\s*([\d.]+)/.exec(info.viewport);
    if (/user-scalable\s*=\s*(no|0)/.test(info.viewport) || (maks && Number(maks[1]) < 2)) funn.push({ regel: "zoom-sperret", sig: "meta[name=viewport]", sti: "", tekst: info.viewport });
  }

  function sjekkEngelsk(rot) {
    const sett = new Set();
    const tw = document.createTreeWalker(rot, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      const el = n.parentElement;
      if (!el || el.closest("script, style, noscript, svg, [lang]:not(html)") || !synlig(el)) continue;
      const m = ENGELSK.exec(n.nodeValue);
      if (m && !sett.has(m[0].toLowerCase())) {
        sett.add(m[0].toLowerCase());
        meld("engelsk-mistenkt", el, { ord: m[0], nokkel: m[0].toLowerCase() });
      }
    }
    for (const el of $$("[aria-label], [title], [placeholder], [alt]", rot)) {
      for (const attr of ["aria-label", "title", "placeholder", "alt"]) {
        const m = ENGELSK.exec(el.getAttribute(attr) || "");
        if (m) meld("engelsk-mistenkt", el, { ord: m[0], attributt: attr, nokkel: attr + m[0].toLowerCase() });
      }
    }
  }

  // Text that an ancestor with overflow hidden cuts through (a fixed height that the text has
  // outgrown): part of a line is on screen, the rest is gone.
  function sjekkKlippet(rot) {
    const omrade = document.createRange();
    const tw = document.createTreeWalker(rot, NodeFilter.SHOW_TEXT);
    const sett = new Set();
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      const el = n.parentElement;
      if (!/[\p{L}\p{N}]/u.test(n.nodeValue) || !el || sett.has(el) || el.closest("script, style, noscript, svg, select, " + K.pynt)) continue;
      if (!synlig(el) || gjemt(el) || klippetBort(el) || bortvendt(el) || opasitet(el) < 0.05) continue;
      omrade.selectNodeContents(n);
      const linjer = Array.from(omrade.getClientRects()).filter((r) => r.width > 1 && r.height > 1);
      for (let e = el; e && e !== document.documentElement && !sett.has(el); e = e.parentElement) {
        const s = stil(e);
        // Text that is meant to be shortened (…, line clamp) is reported by tekst-kuttet instead.
        if (s.textOverflow === "ellipsis" || (s.webkitLineClamp && s.webkitLineClamp !== "none")) break;
        const [x, y] = [/hidden|clip/.test(s.overflowX), /hidden|clip/.test(s.overflowY)];
        if (!x && !y) continue;
        const f = e.getBoundingClientRect();
        const kuttet = linjer.find((r) => (y && (r.top < f.top - 3 || r.bottom > f.bottom + 3) && r.bottom > f.top && r.top < f.bottom) || (x && (r.left < f.left - 3 || r.right > f.right + 3) && r.right > f.left && r.left < f.right));
        if (kuttet) {
          sett.add(el);
          meld("tekst-klippet", el, { av: sig(e), nokkel: sig(e) });
        }
      }
    }
  }

  // Text that is cut off with … or a line clamp: the rest cannot be read (and at 200 % zoom more is cut).
  function sjekkKuttet(rot) {
    for (const el of $$("*", rot)) {
      if (el.closest("svg, script, style") || !synlig(el) || gjemt(el)) continue;
      const s = stil(el);
      const klemt = s.webkitLineClamp && s.webkitLineClamp !== "none";
      if (!klemt && !(s.textOverflow === "ellipsis" && /hidden|clip/.test(s.overflowX))) continue;
      if (!el.textContent.trim()) continue;
      if (el.scrollWidth > el.clientWidth + 1 || (klemt && el.scrollHeight > el.clientHeight + 1)) meld("tekst-kuttet", el, { hele: kort(el.textContent, 90), nokkel: klemt ? "linjer" : "bredde" });
    }
  }

  // Same kind of finding on the same kind of element, many times on one screen → one finding with a count.
  function slaSammen(liste) {
    const sett = new Map();
    for (const f of liste) {
      const n = [f.regel, f.sig, f.sti, f.nokkel || ""].join("|");
      const forrige = sett.get(n);
      if (forrige) forrige.antall = (forrige.antall || 1) + 1;
      else sett.set(n, f);
    }
    return Array.from(sett.values()).map(({ nokkel, ...f }) => f);
  }

  function sjekk() {
    stiler = new Map();
    lagCache = new Map();
    funn = [];
    usikreEl = [];
    const usikre = [];
    const lagEl = omfang();
    const rot = lagEl || document.body;
    const info = { skjerm: skjermnavn(), overlegg: lagEl ? sig(lagEl) : "", inaktivTekst: 0, bredde: innerWidth, hoyde: innerHeight, rulleY: Math.round(scrollY), sidehoyde: document.documentElement.scrollHeight };
    const kontroller = Array.from(new Set($$(KONTROLL + ", " + K.klikk, rot))).filter((el) => synlig(el) && !el.closest("[inert]"));
    info.kontroller = kontroller.length;
    info.tabbare = $$(FOKUSERBAR, rot).filter(erTabbar).length;
    sjekkSide(info);
    sjekkKontrast(rot, usikre, info);
    sjekkMal(kontroller);
    sjekkNavnOgTekst(kontroller);
    sjekkOverskrifter(info);
    sjekkFelt(rot);
    sjekkAria(rot);
    sjekkId();
    sjekkBilder(rot);
    sjekkLevende(info);
    sjekkPeker(rot, info);
    sjekkEngelsk(rot);
    sjekkKuttet(rot);
    sjekkKlippet(rot);
    // An open overlay must keep the rest of the page out of reach (aria-modal alone is not enough for TalkBack).
    // (A <dialog> opened with showModal() does that by itself.)
    if (lagEl && !lagEl.matches("dialog:modal")) {
      const bak = $$(FOKUSERBAR).filter((el) => !lagEl.contains(el) && !el.contains(lagEl) && erTabbar(el));
      if (bak.length) meld("overlegg-bak-ikke-inert", lagEl, { fokuserbareBak: bak.length, forste: sig(bak[0]), dialog: lagEl.localName === "dialog" ? "dialog" : lagEl.getAttribute("role") || "" });
    }
    info.timere = $$('[role="timer"], .timer').filter(synlig).map((el) => ({ sig: sig(el), tekst: kort(el.textContent, 20), pause: !!document.querySelector('[data-timer-pause], [data-h="timer-veksle"]'), pluss: !!document.querySelector('[data-h="timer-pluss"]') }));
    info.evigeAnimasjoner = Array.from(
      new Set(
        (document.getAnimations ? document.getAnimations() : [])
          .filter((a) => a.effect && a.effect.target && a.effect.getComputedTiming().iterations === Infinity && a.playState === "running" && synlig(a.effect.target))
          .map((a) => (a.animationName || "overgang") + " på " + sig(a.effect.target)),
      ),
    );
    info.bilderPerSek = rammer.filter((t) => t > performance.now() - 1000).length;
    info.roligBevegelse = matchMedia("(prefers-reduced-motion: reduce)").matches;
    info.aktiv = document.activeElement && document.activeElement !== document.body ? sig(document.activeElement) : "";
    return { funn: slaSammen(funn), usikre: slaSammen(usikre), info };
  }

  // ---------- Focus pass ----------
  // Focus every tab stop as the Tab key would: is there a visible indicator with enough contrast
  // (WCAG 2.4.7, 1.4.11), and does the sticky dock hide the focused element (2.4.11)?
  function fokuspass() {
    stiler = new Map();
    lagCache = new Map();
    funn = [];
    const lagEl = omfang();
    const rot = lagEl || document.body;
    const tabbare = $$(FOKUSERBAR, rot).filter(erTabbar);
    const forAktiv = document.activeElement;
    const [sx, sy] = [scrollX, scrollY];
    const rullet = $$("*", rot).filter((e) => e.scrollTop || e.scrollLeft).map((e) => [e, e.scrollTop, e.scrollLeft]);
    stille = true;
    if (forAktiv && forAktiv !== document.body && forAktiv.blur) forAktiv.blur(); // measure every stop from its unfocused look
    // No transitions while measuring, so the focused style is the final one.
    const uten = document.createElement("style");
    uten.textContent = "*, *::before, *::after { transition: none !important; }";
    document.head.appendChild(uten);
    const utseende = (el) => {
      const ut = [];
      for (let e = el, n = 0; e && n < 3; e = e.parentElement, n++) {
        const s = getComputedStyle(e);
        ut.push([s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0 ? s.outlineWidth + s.outlineColor + s.outlineOffset : "", s.boxShadow, s.borderTopColor + s.borderBottomColor + s.borderTopWidth, s.backgroundColor, s.textDecorationLine, s.color].join("§"));
      }
      return ut;
    };
    const sett = new Map(); // signature → how many were measured for style
    try {
      for (const el of tabbare) {
        if (!el.isConnected) continue;
        const n = sett.get(sig(el)) || 0;
        sett.set(sig(el), n + 1);
        const for_ = n < 2 ? utseende(el) : null;
        el.focus();
        if (document.activeElement !== el) continue;
        if (for_) {
          const etter = utseende(el);
          const s = getComputedStyle(el);
          const kontur = s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0;
          if (!kontur && etter.join() === for_.join()) meld("fokus-usynlig", el, { fokusSynlig: el.matches(":focus-visible") });
          else if (kontur) {
            // The ring sits outside the element (offset ≥ 0) or inside it: compare with what is next to it.
            const utenfor = parseFloat(s.outlineOffset) >= 0;
            const nabo = utenfor ? el.parentElement : el;
            stiler = new Map();
            lagCache = new Map();
            const f = fargerFor(nabo, [0, 0, 0, 0]);
            const ring = farge(s.outlineColor);
            // A two-tone ring: a band drawn with the focus (a box-shadow that is all spread, no
            // offset, no blur, and was not there before) counts with the outline — the indicator
            // shows where either of the two tones stands out.
            const for0 = for_[0].split("§")[1];
            const band = delLag(s.boxShadow === "none" ? "" : s.boxShadow)
              .filter((d) => !delLag(for0 === "none" ? "" : for0).includes(d) && !/inset/.test(d))
              .map((d) => ({ c: (d.match(/rgba?\([^)]*\)|color\([^)]*\)/) || [""])[0], px: (d.replace(/rgba?\([^)]*\)|color\([^)]*\)/, "").match(/-?[\d.]+px/g) || []).map(parseFloat) }))
              .filter((d) => d.c && d.px.length === 4 && d.px[0] === 0 && d.px[1] === 0 && d.px[2] === 0 && d.px[3] >= 2)
              .map((d) => farge(d.c))
              .filter((c) => c[3] > 0.5);
            const mot = (bg) => Math.max(...[ring, ...band].map((c) => kontrast(upre(over(pre(c), pre(bg))), bg)));
            const verdier = f.varianter.map((v) => mot(v.bg));
            const verst = Math.min(...verdier);
            if (verst < 3 - 0.005) meld("fokus-kontrast", el, { ring: hex(ring), ...(band.length ? { band: hex(band[0]) } : {}), bak: hex(f.varianter[0].bg), forhold: rund(verst, 2), til: rund(Math.max(...verdier), 2), sikker: f.flat, nokkel: hex(ring) + hex(f.varianter[0].bg) });
          }
        }
        // Hidden behind something sticky or fixed after the browser scrolled it into view?
        const r = el.getBoundingClientRect();
        const punkter = [[0.5, 0.5], [0.2, 0.25], [0.8, 0.25], [0.2, 0.75], [0.8, 0.75]].map(([fx, fy]) => [r.left + r.width * fx, r.top + r.height * fy]);
        let dekket = 0;
        let av = null;
        let utenforSkjerm = 0;
        for (const [x, y] of punkter) {
          if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) {
            utenforSkjerm++;
            continue;
          }
          const topp = document.elementFromPoint(x, y);
          if (!topp || topp === el || el.contains(topp) || topp.contains(el)) continue;
          let fast = null;
          for (let e = topp; e && e !== document.body; e = e.parentElement) if (/sticky|fixed/.test(getComputedStyle(e).position)) fast = e;
          if (!fast || fast.contains(el)) continue;
          // An animation layer (confetti, a card cascade) is drawn on, not filled: it hides nothing for long.
          if (topp.localName === "canvas" && farge(getComputedStyle(topp).backgroundColor)[3] < 0.5) continue;
          // The top of the dock is a transparent fade: what is under it can still be seen.
          if (fast.matches(K.dokk) && topp === fast) {
            const d = fast.getBoundingClientRect();
            if (y < d.top + d.height * K.dokkToning) continue;
          }
          dekket++;
          av = fast;
        }
        if (dekket === punkter.length - utenforSkjerm && dekket > 0) meld("fokus-skjult", el, { av: sig(av), nokkel: sig(av) });
        else if (dekket > 0) meld("fokus-delvis-skjult", el, { av: sig(av), punkter: dekket, nokkel: sig(av) });
        else if (utenforSkjerm === punkter.length) meld("fokus-utenfor-skjermen", el);
      }
    } finally {
      uten.remove();
      if (forAktiv && forAktiv !== document.body && forAktiv.isConnected) forAktiv.focus({ preventScroll: true });
      else {
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        // Nothing had focus before the pass. Tab would now go on from the last stop the pass
        // visited (the browser remembers it), so put that starting point back at the top of the
        // page: a test that presses Tab next gets the same first stop with and without the checker.
        const anker = document.createElement("span");
        anker.tabIndex = -1;
        document.body.prepend(anker);
        anker.focus({ preventScroll: true });
        anker.blur();
        anker.remove();
      }
      for (const [e, t, l] of rullet) {
        e.scrollTop = t;
        e.scrollLeft = l;
      }
      scrollTo(sx, sy);
      stille = false;
    }
    return { funn: slaSammen(funn), tabbare: tabbare.length };
  }

  // ---------- Scripted clicks: can a keyboard reach the target, and where is focus afterwards? ----------

  let sisteKlikk = null;
  function forKlikk(sel) {
    const el = document.querySelector(sel);
    if (!el) return null;
    // Nothing has focus right now: whatever dropped it earlier never gave it back.
    const utenFokus = !document.activeElement || document.activeElement === document.body;
    const info = { ...beskriv(el), skjerm: skjermnavn(), innfodt: innfodt(el), tabbar: erTabbar(el), synlig: synlig(el), iArk: !!el.closest(K.overlegg), utenFokus };
    stille = true;
    try {
      if (info.tabbar) el.focus({ preventScroll: true });
    } finally {
      stille = false;
    }
    info.fikkFokus = document.activeElement === el;
    info.deaktivert = !!el.disabled;
    sisteKlikk = { el, info, fikkFokus: info.fikkFokus };
    return info;
  }
  function etterKlikk() {
    if (!sisteKlikk) return null;
    const { el, info, fikkFokus } = sisteKlikk;
    sisteKlikk = null;
    const a = document.activeElement;
    return { ...info, fikkFokus, skjermEtter: skjermnavn(), fokusEtter: a && a !== document.body ? sig(a) : "", finnes: el.isConnected, overlegg: omfang() ? sig(omfang()) : "" };
  }
  // A gesture step in a test (tap, hold, swipe): what kind of element takes it?
  function gestMal(sel) {
    const el = document.querySelector(sel);
    return el ? { ...beskriv(el), skjerm: skjermnavn(), innfodt: innfodt(el), tabbar: erTabbar(el), touchAction: getComputedStyle(el).touchAction } : null;
  }

  // ---------- Recorder ----------
  // What a screen-reader user would notice between two screenshots.

  const logg = [];
  let stille = false; // true while the checker itself moves focus
  const start = performance.now();
  const noter = (h) => {
    if (stille) return;
    logg.push({ t: Math.round(performance.now() - start), ...h });
    if (logg.length > 400) logg.splice(0, logg.length - 400);
  };
  const kjente = new WeakSet();
  let sisteSkjerm = "";
  let skjermbytteT = -1e9;
  const sidenSkjermbytte = () => Math.round(performance.now() - skjermbytteT);
  new MutationObserver((mutasjoner) => {
    const nye = new Set();
    const endret = new Set();
    for (const m of mutasjoner) {
      if (m.type === "attributes") {
        const el = m.target;
        if (m.attributeName === "class" && el.matches(K.skjerm)) {
          const navn = skjermnavn();
          if (navn !== sisteSkjerm) {
            noter({ type: "skjerm", navn: (sisteSkjerm = navn) });
            skjermbytteT = performance.now();
          }
        } else if (m.attributeName === "hidden" && el.matches(".ark-bakgrunn, .nedtelling, main > section.skjerm")) noter({ type: el.hidden ? "lukket" : "apnet", sig: sig(el) });
        else if (m.attributeName === "open" && el.localName === "dialog") noter({ type: el.open ? "apnet" : "lukket", sig: sig(el) });
        continue;
      }
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        for (const r of [n, ...n.querySelectorAll(LEVENDE)])
          if (r.matches(LEVENDE) && !kjente.has(r)) {
            kjente.add(r);
            nye.add(r);
          }
      }
      const mal = m.target.nodeType === 1 ? m.target : m.target.parentElement;
      const region = mal && mal.closest ? mal.closest(LEVENDE) : null;
      if (!region || nye.has(region)) continue;
      if (kjente.has(region)) endret.add(region);
      else {
        kjente.add(region);
        nye.add(region);
      }
    }
    // "live": the text of an existing region changed (announced). "live-ny": a region arrived with
    // its text already in it (most screen readers say nothing).
    for (const [sett, type] of [[endret, "live"], [nye, "live-ny"]])
      for (const r of sett) {
        const hof = hoflighet(r);
        const tekst = kort(r.textContent, 160);
        if (hof === "off" || !tekst || !r.isConnected) continue;
        noter({ type, hof, sig: sig(r), tekst, ...(synlig(r) ? {} : { skjult: true }), ...(iAtTre(r) ? {} : { utenforAt: true }) });
      }
  }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["class", "hidden", "open"] });
  document.addEventListener("focusin", (e) => noter({ type: "fokus", sig: sig(e.target), tekst: tekstAv(e.target) }), true);
  document.addEventListener("click", (e) => noter({ type: "klikk", sig: sig(e.target.closest ? e.target.closest(KONTROLL + ", " + K.klikk) || e.target : e.target) }), true);
  const hendelser = () => logg.splice(0, logg.length);

  // Scripts that animate ask for animation frames: remember when (the last 240 requests).
  const rammer = [];
  const ekteRamme = window.requestAnimationFrame;
  window.requestAnimationFrame = function (fn) {
    rammer.push(performance.now());
    if (rammer.length > 240) rammer.shift();
    return ekteRamme.call(window, fn);
  };

  // Is the element in the layer the user is in (the open overlay, or the page when none is open)?
  const iOmfang = (el) => {
    const lagEl = omfang();
    return !lagEl || lagEl.contains(el);
  };

  window.__rusjA11y = { sjekk, fokuspass, rekterFor, rullestopp, beskriv, iOmfang, forKlikk, etterKlikk, gestMal, sidenSkjermbytte, hendelser, sig };
})();
