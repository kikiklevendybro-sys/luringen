// Penselen (colouring). Runs in every edition: texts are checked in Norwegian only (t.norsk).
// 1 Home, rules, the gallery: 44 pictures, a theme shows only its own.
// 2 The cat: a tap fills a field with the colour held (and only that field); the same colour again
//   adds nothing; a thick brush stroke paints; «Angre» takes it back; «Tøm» clears and «Angre»
//   brings the colours back.
// 3 Zoom: + zooms, a tap on the zoomed sheet fills the field under the finger, two fingers pinch;
//   the hand moves the picture.
// 4 A reload keeps the colours; back + «Fortsett».
// 5 «Ferdig»: the PNG, «Lagre bildet» downloads it, the sticker, the «sist» line.
// 6 Every picture: rasterised, its fields closed (the background is never most of the drawing).
export default async function (t) {
  const bildet = async () => (await t.tilstand()).bilder[(await t.tilstand()).aktiv];
  // A point of the 200 × 200 drawing in screen coordinates (whatever the zoom).
  const skjerm = (x, y) =>
    t.js(`(() => { const b = document.querySelector(".pn-farge").getBoundingClientRect(); return { x: b.left + ${x} / 200 * b.width, y: b.top + ${y} / 200 * b.height }; })()`);
  const piksel = (x, y) => t.js(`Array.from(document.querySelector(".pn-farge").getContext("2d").getImageData(${x * 5}, ${y * 5}, 1, 1).data)`);
  async function tapp(x, y) {
    const p = await skjerm(x, y);
    await t.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: p.x, y: p.y }] });
    await t.sov(50);
    await t.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await t.sov(250);
  }
  async function dra(fra, til, steg = 10) {
    const a = await skjerm(...fra);
    const b = await skjerm(...til);
    await t.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: a.x, y: a.y }] });
    for (let i = 1; i <= steg; i++) {
      await t.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: a.x + ((b.x - a.x) * i) / steg, y: a.y + ((b.y - a.y) * i) / steg }] });
      await t.sov(16);
    }
    await t.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await t.sov(250);
  }
  const lik = (px, rgb) => px[3] === 255 && Math.abs(px[0] - rgb[0]) < 3 && Math.abs(px[1] - rgb[1]) < 3 && Math.abs(px[2] - rgb[2]) < 3;
  const ROD = [230, 57, 70];
  const BLA = [47, 111, 222];
  const skala = () => t.js(`Number((/scale\\(([\\d.]+)\\)/.exec(document.querySelector(".pn-zoom").style.transform) || [0, 1])[1])`);

  // ---------- 1 Home, rules, the gallery ----------
  await t.start();
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  await t.bilde("hjem");
  await t.klikk("#reglerknapp");
  t.sjekk((await t.antall("#ark .steg li")) === 3, "Reglene skal ha tre steg");
  await t.bilde("regler");
  await t.klikk('#ark [data-h="lukk-ark"]');
  await t.klikk('[data-h="nytt"]');
  await t.vent("document.querySelector('.pn-galleri')");
  t.sjekk((await t.antall(".pn-bilde")) === 44, `Galleriet skal ha 44 bilder (${await t.antall(".pn-bilde")})`);
  await t.bilde("galleri", true);
  await t.klikk('[data-h="tema"][data-v="norden"]');
  t.sjekk((await t.antall(".pn-bilde")) === 8, "Temaet Norden skal vise sine åtte bilder");
  await t.bilde("galleri-norden");
  await t.klikk('[data-h="tema"][data-v="dyr"]');
  await t.klikk('.pn-bilde[data-v="katt"]');
  await t.vent("document.querySelector('.pn-farge')");
  await t.sov(400);

  // ---------- 2 Fill, brush, undo, clear ----------
  const ark = await t.js(`(() => { const b = document.querySelector(".pn-ark").getBoundingClientRect(); return { w: b.width, h: b.height, top: b.top, left: b.left, right: b.right, bottom: b.bottom }; })()`);
  t.sjekk(ark.w >= 200 && Math.abs(ark.w - ark.h) < 2, `Arket er for lite eller ikke kvadratisk (${JSON.stringify(ark)})`);
  t.sjekk(ark.left >= 0 && ark.right <= (await t.js("window.innerWidth")) && ark.top >= 0, `Arket stikker utenfor skjermen (${JSON.stringify(ark)})`);
  t.sjekk(await t.friForDokk(".pn-ark"), "Arket ligger under verktøyene");
  t.sjekk(await t.js("document.documentElement.scrollHeight <= window.innerHeight + 1"), "Siden scroller mens man maler");
  const knapp = await t.js(`Math.min(...Array.from(document.querySelectorAll(".pn-fargeknapp, .pn-knapp")).map((b) => Math.min(b.getBoundingClientRect().width, b.getBoundingClientRect().height)))`);
  t.sjekk(knapp >= 34, `Fargene og verktøyene er for små for små fingrer (${Math.round(knapp)} px)`);
  await t.bilde("mal");
  await tapp(100, 64);
  let b = await bildet();
  t.sjekk(b && b.o.length === 1 && b.o[0][0] === "f", `Et trykk fylte ikke (${JSON.stringify(b && b.o)})`);
  t.sjekk(lik(await piksel(100, 64), ROD), `Hodet ble ikke rødt (${await piksel(100, 64)})`);
  t.sjekk((await piksel(100, 128))[3] === 0, "Fyllet rant ut av feltet");
  await t.klikk('[data-h="farge"][data-v="6"]');
  t.sjekk((await t.tilstand()).farge === 6 && (await t.js(`document.querySelector('[data-h="farge"][data-v="6"]').getAttribute("aria-pressed")`)) === "true", "Fargen ble ikke valgt");
  await tapp(70, 140);
  t.sjekk(lik(await piksel(70, 140), BLA) && lik(await piksel(100, 64), ROD), "Kroppen ble ikke blå (eller hodet mistet fargen)");
  await tapp(72, 142);
  t.sjekk((await bildet()).o.length === 2, "Samme farge i samme felt skal ikke bli en ny handling");
  await t.klikk('[data-h="verktoy"][data-v="tykk"]');
  await dra([20, 30], [60, 40]);
  b = await bildet();
  t.sjekk(b.o.length === 3 && b.o[2][0] === "p", `Penselen malte ikke (${b.o.length})`);
  t.sjekk(lik(await piksel(40, 35), BLA), "Penselstreken synes ikke");
  await t.bilde("malt");
  await t.klikk('[data-h="angre"]');
  t.sjekk((await bildet()).o.length === 2 && (await piksel(40, 35))[3] === 0, "«Angre» tok ikke bort streken");
  await t.klikk('[data-h="tom"]');
  t.sjekk((await piksel(100, 64))[3] === 0 && (await bildet()).o.length === 3, "«Tøm» tømte ikke bildet");
  await t.klikk('[data-h="angre"]');
  t.sjekk(lik(await piksel(100, 64), ROD), "«Angre» etter «Tøm» hentet ikke fargene tilbake");

  // ---------- 3 Zoom ----------
  await t.klikk('[data-h="verktoy"][data-v="fyll"]');
  await t.klikk('[data-h="zoom"][data-v="1"]');
  await t.klikk('[data-h="zoom"][data-v="1"]');
  t.sjekk((await skala()) > 2, `+ zoomet ikke inn (${await skala()})`);
  await t.klikk('[data-h="farge"][data-v="2"]');
  await tapp(78, 70);
  t.sjekk(lik(await piksel(78, 70), [255, 214, 10]) && (await bildet()).o.length === 3, `Et trykk på det zoomede arket fylte ikke feltet under fingeren (${(await bildet()).o.length})`);
  await t.bilde("zoomet");
  const forHand = await t.js(`document.querySelector(".pn-zoom").style.transform`);
  await t.klikk('[data-h="flytt"]');
  await dra([100, 100], [80, 90], 6);
  t.sjekk((await t.js(`document.querySelector(".pn-zoom").style.transform`)) !== forHand, "Hånden flyttet ikke bildet");
  t.sjekk((await bildet()).o.length === 3, `Hånden skal flytte, ikke male (${JSON.stringify((await bildet()).o.slice(3))})`);
  // Two fingers pinch out of the zoom.
  const s1 = await skala();
  const midt = await t.js(`(() => { const b = document.querySelector(".pn-ark").getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
  await t.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: midt.x - 80, y: midt.y, id: 1 }, { x: midt.x + 80, y: midt.y, id: 2 }] });
  for (let i = 1; i <= 8; i++) {
    await t.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: midt.x - 80 + i * 8, y: midt.y, id: 1 }, { x: midt.x + 80 - i * 8, y: midt.y, id: 2 }] });
    await t.sov(16);
  }
  await t.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await t.sov(300);
  t.sjekk((await skala()) < s1, `To fingre zoomet ikke ut (${s1} → ${await skala()})`);
  t.sjekk((await bildet()).o.length === 3, `To fingre skal ikke male (${JSON.stringify((await bildet()).o.slice(3))})`);
  for (let i = 0; i < 4 && !(await t.js(`document.querySelector('[data-h="zoom"][data-v="-1"]').disabled`)); i++) await t.klikk('[data-h="zoom"][data-v="-1"]');
  t.sjekk((await skala()) === 1, "− zoomet ikke helt ut");

  // ---------- 4 Reload, back and «Fortsett» ----------
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.vent("document.querySelector('.pn-farge')");
  await t.sov(300);
  t.sjekk(lik(await piksel(78, 70), [255, 214, 10]) && lik(await piksel(70, 140), BLA), "Fargene forsvant etter omlasting");
  await t.klikk("#tilbake");
  await t.vent("document.querySelector('.pn-galleri')");
  t.sjekk(await t.finnes('.pn-bilde[data-v="katt"] .pn-bilde-merke'), "Galleriet viser ikke at katten er påbegynt");
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('[data-h="fortsett"]'), "Mangler «Fortsett» på hjem");
  await t.bilde("hjem-fortsett");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('.pn-farge')");

  // ---------- 5 Done: the PNG, saving it, the sticker ----------
  await t.klikk('[data-h="ferdig"]');
  await t.vent("document.querySelector('.pn-resultat img')", 8000);
  await t.sov(400);
  const img = await t.js(`(() => { const i = document.querySelector(".pn-resultat img"); return { src: i.src.slice(0, 5), w: i.naturalWidth, h: i.naturalHeight }; })()`);
  t.sjekk(img.src === "blob:" && img.w === 1000 && img.h === 1000, `Bildet ble ikke laget (${JSON.stringify(img)})`);
  await t.js(`(() => { const k = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__lastet = { navn: this.download, href: this.href.slice(0, 5) }; return; } return k.call(this); }; })()`);
  await t.klikk('[data-h="last-ned"]');
  const lastet = await t.js("window.__lastet");
  t.sjekk(lastet && /^[a-z]+-katt\.png$/.test(lastet.navn) && lastet.href === "blob:", `«Lagre bildet» lastet ikke ned en PNG (${JSON.stringify(lastet)})`);
  const merker = await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("merker")}") || "{}")`);
  t.sjekk(!!merker["penselen-ferdig"], "Klistremerket ble ikke gitt");
  let s = await t.tilstand();
  t.sjekk(s.ferdige === 1 && s.sist === "katt", "Det ferdige bildet ble ikke telt");
  await t.bilde("ferdig", true);
  await t.klikk('.dokk [data-h="nytt"]');
  await t.vent("document.querySelector('.pn-galleri')");
  await t.klikk('[data-h="overrask"]');
  await t.vent("document.querySelector('.pn-farge')");
  s = await t.tilstand();
  t.sjekk(s.aktiv && s.aktiv !== "katt", "«Overrask meg» åpnet ikke et annet bilde");
  await t.klikk("#tilbake");
  await t.klikk("#tilbake");
  await t.vent("document.querySelector('.pn-sist')");
  await t.bilde("hjem-sist");

  // ---------- 6 Every picture has closed fields ----------
  const sjekk = await t.js(`(() => {
    const P = window.Penselen; const ut = [];
    for (const b of P.BILDER) {
      const k = P.merk(P.rasterVegg(b, document.createElement("canvas")), P.N, P.N);
      const bak = k.etikett[0];
      const andel = bak >= 0 ? (k.start[bak + 1] - k.start[bak]) / (P.N * P.N) : 0;
      if (k.antall < 5 || k.antall > 90 || andel > 0.85) ut.push(b.id + ": " + k.antall + " felt, bakgrunn " + Math.round(andel * 100) + "%");
    }
    return ut;
  })()`);
  t.sjekk(!sjekk.length, `Bilder med felt som ikke lukker seg: ${sjekk.join("; ")}`);
}
