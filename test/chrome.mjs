// Headless Google Chrome over the DevTools Protocol, without dependencies (Node 22+ WebSocket).
// Used by the end-to-end tests (test/rusj-e2e.mjs) and to draw images (scripts/lag-bilder.mjs).
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:http";

export const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sov = (ms) => new Promise((r) => setTimeout(r, ms));

// Static file server for a built site (dist/web), like GitHub Pages: /x/ → /x/index.html, 404.html.
export async function startTjener(rot) {
  const TYPER = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".json": "application/json",
    ".webmanifest": "application/manifest+json",
    ".txt": "text/plain",
    ".xml": "application/xml",
  };
  const tjener = createServer((req, res) => {
    let sti = decodeURIComponent(new URL(req.url, "http://lokal").pathname);
    if (sti.endsWith("/")) sti += "index.html";
    let fil = join(rot, sti.replace(/^\/+/, ""));
    if (existsSync(fil) && statSync(fil).isDirectory()) fil = join(fil, "index.html");
    if (!fil.startsWith(rot) || !existsSync(fil)) {
      res.writeHead(404, { "content-type": TYPER[".html"] });
      res.end(existsSync(join(rot, "404.html")) ? readFileSync(join(rot, "404.html")) : "404");
      return;
    }
    res.writeHead(200, { "content-type": TYPER[extname(fil)] || "application/octet-stream" });
    res.end(readFileSync(fil));
  });
  await new Promise((r) => tjener.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${tjener.address().port}`, lukk: () => tjener.close() };
}

export async function startChrome(valg = {}) {
  const { bredde = 390, hoyde = 844, skala = 2, mobil = true, gjennomsiktig = false } = valg;
  // Port 0: Chrome picks a free port and writes it to DevToolsActivePort in its profile, so
  // parallel test runs can never end up talking to each other's browser.
  const profil = mkdtempSync(join(tmpdir(), "rusj-chrome-"));
  const prosess = spawn(
    CHROME,
    ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profil}`, "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--mute-audio", "--allow-file-access-from-files", "about:blank"],
    { stdio: "ignore" },
  );
  let port = null;
  for (let i = 0; i < 200 && !port; i++) {
    try {
      const linje = readFileSync(join(profil, "DevToolsActivePort"), "utf8").split("\n")[0].trim();
      if (/^\d+$/.test(linje)) port = Number(linje);
    } catch (e) {
      /* not written yet */
    }
    if (!port) await sov(50);
  }
  if (!port) throw new Error("Chrome startet ikke (fant ikke DevToolsActivePort)");

  const feil = [];
  let ws;
  let neste = 0;
  const ventende = new Map();
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++neste;
      ventende.set(id, (d) => (d.error ? reject(new Error(`${method}: ${d.error.message}`)) : resolve(d.result)));
      ws.send(JSON.stringify({ id, method, params }));
    });

  let liste;
  for (let i = 0; i < 150; i++) {
    try {
      liste = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      if (liste.some((t) => t.type === "page")) break;
    } catch (e) {
      /* Chrome is starting */
    }
    await sov(100);
  }
  if (!liste) throw new Error("Fikk ikke kontakt med Chrome");
  ws = new WebSocket(liste.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && ventende.has(d.id)) {
      ventende.get(d.id)(d);
      ventende.delete(d.id);
    } else if (d.method === "Runtime.exceptionThrown") {
      feil.push(`Unntak: ${d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text}`);
    } else if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") {
      feil.push(`console.error: ${d.params.args.map((a) => a.value ?? a.description).join(" ")}`);
    } else if (d.method === "Log.entryAdded" && d.params.entry.level === "error" && !/favicon/.test(d.params.entry.url || "")) {
      feil.push(`Logg: ${d.params.entry.text} ${d.params.entry.url || ""}`);
    }
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: bredde, height: hoyde, deviceScaleFactor: skala, mobile: mobil });
  if (mobil) await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  if (gjennomsiktig) await send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });

  async function js(uttrykk) {
    const r = await send("Runtime.evaluate", { expression: uttrykk, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`JS-feil: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}\n  i: ${uttrykk.slice(0, 300)}`);
    return r.result.value;
  }
  async function vent(uttrykk, ms = 6000) {
    const slutt = Date.now() + ms;
    while (Date.now() < slutt) {
      try {
        if (await js(`!!(${uttrykk})`)) return;
      } catch (e) {
        /* page is navigating */
      }
      await sov(50);
    }
    throw new Error(`Tidsavbrudd: ${uttrykk}`);
  }
  async function lastSide(url, ventPa = "document.readyState === 'complete'") {
    await send("Page.navigate", { url });
    await sov(150);
    await vent(`document.readyState === 'complete' && (${ventPa})`, 10000);
    await sov(250);
  }
  const q = (sel) => JSON.stringify(sel);
  async function klikk(sel, ms = 160) {
    await vent(`document.querySelector(${q(sel)})`);
    const av = await js(`document.querySelector(${q(sel)}).disabled`);
    if (av) throw new Error(`Knappen er deaktivert: ${sel}`);
    await js(`(() => { const el = document.querySelector(${q(sel)}); el.scrollIntoView({block:"center"}); el.click(); })()`);
    await sov(ms);
  }
  // A real tap at the element's centre (touch input), for things that react to pointer events.
  async function trykk(sel, holdMs = 60) {
    await vent(`document.querySelector(${q(sel)})`);
    await js(`document.querySelector(${q(sel)}).scrollIntoView({block: "center"})`);
    await sov(120);
    const p = await js(`(() => { const b = document.querySelector(${q(sel)}).getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
    await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: p.x, y: p.y }] });
    await sov(holdMs);
    await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await sov(150);
  }
  // Press and hold with the mouse (hold-to-reveal cards). Returns a function that releases.
  async function hold(sel, ms = 700) {
    await js(`document.querySelector(${q(sel)}).scrollIntoView({block: "center"})`);
    await sov(150);
    const p = await js(`(() => { const b = document.querySelector(${q(sel)}).getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", clickCount: 1 });
    await sov(ms);
    return async () => {
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", clickCount: 1 });
      await sov(500);
    };
  }
  // Swipe horizontally across an element with the mouse (dx in px).
  async function sveip(sel, dx = -220) {
    await js(`document.querySelector(${q(sel)}).scrollIntoView({block: "center"})`);
    await sov(120);
    const p = await js(`(() => { const b = document.querySelector(${q(sel)}).getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", clickCount: 1 });
    for (let i = 1; i <= 8; i++) {
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x + (dx * i) / 8, y: p.y, button: "left", buttons: 1 });
      await sov(16);
    }
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x + dx, y: p.y, button: "left", clickCount: 1 });
    await sov(450);
  }
  async function skjermbilde(fil, valg = {}) {
    const v = { format: "png" };
    if (valg.helside) {
      const h = await js("document.documentElement.scrollHeight");
      v.captureBeyondViewport = true;
      v.clip = { x: 0, y: 0, width: await js("window.innerWidth"), height: h, scale: 1 };
    } else if (valg.klipp) {
      v.clip = { ...valg.klipp, scale: 1 };
    }
    const { data } = await send("Page.captureScreenshot", v);
    writeFileSync(fil, Buffer.from(data, "base64"));
    return fil;
  }
  // Set an input's value as if typed (fires "input").
  async function skrivInn(sel, verdi) {
    await vent(`document.querySelector(${q(sel)})`);
    await js(`(() => { const f = document.querySelector(${q(sel)}); f.focus(); f.value = ${JSON.stringify(verdi)}; f.dispatchEvent(new Event("input", { bubbles: true })); })()`);
    await sov(60);
  }
  const tekst = (sel) => js(`document.querySelector(${q(sel)})?.innerText ?? ""`);
  const finnes = (sel) => js(`!!document.querySelector(${q(sel)})`);
  const antall = (sel) => js(`document.querySelectorAll(${q(sel)}).length`);

  async function lukk() {
    try {
      ws.close();
    } catch (e) {
      /* ignore */
    }
    prosess.kill("SIGKILL");
    await sov(200);
    rmSync(profil, { recursive: true, force: true });
  }

  return { send, js, vent, lastSide, klikk, trykk, hold, sveip, skjermbilde, skrivInn, tekst, finnes, antall, sov, feil, lukk };
}
