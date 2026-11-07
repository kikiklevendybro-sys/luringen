// Dev check: renders QR codes to PNG files so an independent decoder (macOS CoreImage) can read them back.
// Usage: node test/qr-sjekk.mjs <output-dir>   → prints "file<TAB>expected text" lines.
import { createRequire } from "node:module";
import { deflateSync, crc32 } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { lagQr } = require("../src/qr.js");

const ut = process.argv[2];
if (!ut) {
  console.error("Usage: node test/qr-sjekk.mjs <output-dir>");
  process.exit(2);
}
mkdirSync(ut, { recursive: true });

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
}

function pngFraQr(qr, skala = 8, kant = 4) {
  const n = (qr.storrelse + kant * 2) * skala;
  const raw = Buffer.alloc((n + 1) * n, 255);
  for (let y = 0; y < n; y++) {
    raw[y * (n + 1)] = 0;
    const my = Math.floor(y / skala) - kant;
    for (let x = 0; x < n; x++) {
      const mx = Math.floor(x / skala) - kant;
      const mork = my >= 0 && mx >= 0 && my < qr.storrelse && mx < qr.storrelse && qr.moduler[my][mx];
      raw[y * (n + 1) + 1 + x] = mork ? 0 : 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(n, 0);
  ihdr.writeUInt32BE(n, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // grayscale
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const tilfeller = [
  ["HEI", "M"],
  ["https://example.no/luringen/#K7PQ2MXA", "M"],
  ["https://kikiklevendybro-sys.github.io/luringen/#K7PQ2MXAB3CDEFG", "M"],
  ["Æøå – luringen er blant oss! 🕵️", "Q"],
  ["https://example.no/" + "x".repeat(90), "M"], // version 5–6, two blocks
  ["https://example.no/" + "y".repeat(140), "L"], // version 7+, version info
  ["https://example.no/" + "z".repeat(180), "M"], // version 10, 16-bit length, uneven blocks
  ["A".repeat(30), "H"],
];

tilfeller.forEach(([tekst, ecc], i) => {
  const qr = lagQr(tekst, ecc);
  const fil = join(ut, `qr-${i}-v${qr.versjon}-${ecc}-m${qr.maske}.png`);
  writeFileSync(fil, pngFraQr(qr));
  console.log(`${fil}\t${tekst}`);
});
