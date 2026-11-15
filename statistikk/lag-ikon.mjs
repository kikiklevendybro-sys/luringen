// Writes src/ikon.js: the icon of the admin page («rusj admin» on the home screen), as an SVG and
// as PNG files (iOS wants a PNG for the home screen). Three bars on rusj's night colour, drawn here
// pixel by pixel, so no image tools and no files from anywhere else are needed.
// Run it from anywhere:   node statistikk/lag-ikon.mjs
// (test/admin.test.mjs fails when src/ikon.js is not what this script writes.)
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const NATT = [0x15, 0x0c, 0x28];
const MYNTE = [0x3d, 0xe3, 0xb0];
const LAMPE = [0xff, 0xd2, 0x3f];
// The bars in a 1 × 1 square: left edge, top, colour. All inside the middle 80 % (safe to mask).
const BREDDE = 0.14;
const BUNN = 0.72;
const STOLPER = [
  [0.23, 0.46, MYNTE],
  [0.43, 0.28, LAMPE],
  [0.63, 0.38, MYNTE],
];

// Which colour is at (x, y) in the square: a bar with a round top, or the night.
function farge(x, y) {
  const r = BREDDE / 2;
  for (const [venstre, topp, f] of STOLPER) {
    if (x < venstre || x > venstre + BREDDE || y > BUNN) continue;
    if (y >= topp + r) return f;
    const dx = x - (venstre + r);
    const dy = y - (topp + r);
    if (y >= topp && dx * dx + dy * dy <= r * r) return f;
  }
  return NATT;
}

// The PNG of one size: 4 × 4 samples per pixel for smooth edges.
export function png(storrelse) {
  const S = 4;
  const rader = Buffer.alloc((storrelse * 3 + 1) * storrelse);
  for (let py = 0; py < storrelse; py++) {
    rader[py * (storrelse * 3 + 1)] = 0; // filter: none
    for (let px = 0; px < storrelse; px++) {
      const sum = [0, 0, 0];
      for (let sy = 0; sy < S; sy++)
        for (let sx = 0; sx < S; sx++) {
          const f = farge((px + (sx + 0.5) / S) / storrelse, (py + (sy + 0.5) / S) / storrelse);
          sum[0] += f[0];
          sum[1] += f[1];
          sum[2] += f[2];
        }
      const i = py * (storrelse * 3 + 1) + 1 + px * 3;
      for (let k = 0; k < 3; k++) rader[i + k] = Math.round(sum[k] / (S * S));
    }
  }
  const bit = (type, data) => {
    const lengde = Buffer.alloc(4);
    lengde.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([lengde, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(storrelse, 0);
  ihdr.writeUInt32BE(storrelse, 4);
  ihdr[8] = 8; // bits per colour
  ihdr[9] = 2; // RGB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), bit("IHDR", ihdr), bit("IDAT", deflateSync(rader, { level: 9 })), bit("IEND", Buffer.alloc(0))]);
}

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

const hex = (f) => "#" + f.map((x) => x.toString(16).padStart(2, "0")).join("");
export function svg() {
  const s = (v) => Math.round(v * 512);
  const stolper = STOLPER.map(([x, topp, f]) => `<path fill="${hex(f)}" d="M${s(x)} ${s(BUNN)}V${s(topp + BREDDE / 2)}a${s(BREDDE / 2)} ${s(BREDDE / 2)} 0 0 1 ${s(BREDDE)} 0V${s(BUNN)}z"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${hex(NATT)}"/>${stolper}</svg>`;
}

export function somFil() {
  return `// Written by statistikk/lag-ikon.mjs — do not edit by hand. The admin page's icon (no data in it).
export const IKON_SVG = ${JSON.stringify(svg())};
export const IKON_PNG = {
${[180, 192, 512].map((n) => `  ${n}: "${png(n).toString("base64")}",`).join("\n")}
};
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(new URL("./src/ikon.js", import.meta.url), somFil());
  console.log("Skrev statistikk/src/ikon.js");
}
