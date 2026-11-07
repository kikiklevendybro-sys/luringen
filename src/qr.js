/* Minimal QR Code encoder: byte mode, versions 1–10, error correction L/M/Q/H.
   Follows ISO/IEC 18004; the structure mirrors Project Nayuki's reference
   implementation (MIT licence). Used to show a scannable join link. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.LuringenQr = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const ECC = {
    L: { ord: 0, bits: 1 },
    M: { ord: 1, bits: 0 },
    Q: { ord: 2, bits: 3 },
    H: { ord: 3, bits: 2 },
  };
  // Index = version (0 unused), per error correction level L, M, Q, H.
  const ECC_PER_BLOKK = [
    [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18],
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26],
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24],
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28],
  ];
  const ANTALL_BLOKKER = [
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4],
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5],
    [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8],
    [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8],
  ];
  const MAKS_VERSJON = 10;

  function raModuler(ver) {
    let r = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      const na = Math.floor(ver / 7) + 2;
      r -= (25 * na - 10) * na - 55;
      if (ver >= 7) r -= 36;
    }
    return r;
  }

  function dataKodeord(ver, ecc) {
    return Math.floor(raModuler(ver) / 8) - ECC_PER_BLOKK[ecc.ord][ver] * ANTALL_BLOKKER[ecc.ord][ver];
  }

  // ---------- Reed–Solomon over GF(256), polynomial 0x11D ----------

  function rsMul(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11d);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }

  function rsDivisor(grad) {
    const r = [];
    for (let i = 0; i < grad - 1; i++) r.push(0);
    r.push(1);
    let rot = 1;
    for (let i = 0; i < grad; i++) {
      for (let j = 0; j < r.length; j++) {
        r[j] = rsMul(r[j], rot);
        if (j + 1 < r.length) r[j] ^= r[j + 1];
      }
      rot = rsMul(rot, 0x02);
    }
    return r;
  }

  function rsRest(data, divisor) {
    const r = divisor.map(function () {
      return 0;
    });
    data.forEach(function (b) {
      const faktor = b ^ r.shift();
      r.push(0);
      divisor.forEach(function (koef, i) {
        r[i] ^= rsMul(koef, faktor);
      });
    });
    return r;
  }

  function leggTilEcc(data, ver, ecc) {
    const antBlokker = ANTALL_BLOKKER[ecc.ord][ver];
    const eccLen = ECC_PER_BLOKK[ecc.ord][ver];
    const raKodeord = Math.floor(raModuler(ver) / 8);
    const antKorte = antBlokker - (raKodeord % antBlokker);
    const kortLen = Math.floor(raKodeord / antBlokker);
    const divisor = rsDivisor(eccLen);
    const blokker = [];
    for (let i = 0, k = 0; i < antBlokker; i++) {
      const dat = data.slice(k, k + kortLen - eccLen + (i < antKorte ? 0 : 1));
      k += dat.length;
      const e = rsRest(dat, divisor);
      if (i < antKorte) dat.push(0);
      blokker.push(dat.concat(e));
    }
    const res = [];
    for (let i = 0; i < blokker[0].length; i++) {
      blokker.forEach(function (b, j) {
        if (i !== kortLen - eccLen || j >= antKorte) res.push(b[i]);
      });
    }
    return res;
  }

  function justeringsPosisjoner(ver, str) {
    if (ver === 1) return [];
    const na = Math.floor(ver / 7) + 2;
    const steg = Math.ceil((ver * 4 + 4) / (na * 2 - 2)) * 2;
    const res = [6];
    for (let pos = str - 7; res.length < na; pos -= steg) res.splice(1, 0, pos);
    return res;
  }

  function maskeInverterer(m, x, y) {
    switch (m) {
      case 0: return (x + y) % 2 === 0;
      case 1: return y % 2 === 0;
      case 2: return x % 3 === 0;
      case 3: return (x + y) % 3 === 0;
      case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
      case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
      case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
      default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    }
  }

  // Encodes text (UTF-8, byte mode) and returns { storrelse, moduler[y][x], versjon, maske, ecc }.
  function lagQr(tekst, eccNavn) {
    const ecc = ECC[eccNavn || "M"];
    const bytes = Array.from(new TextEncoder().encode(tekst));

    let ver = 1;
    for (; ver <= MAKS_VERSJON; ver++) {
      const lengdeBits = ver <= 9 ? 8 : 16;
      if (4 + lengdeBits + bytes.length * 8 <= dataKodeord(ver, ecc) * 8) break;
    }
    if (ver > MAKS_VERSJON) throw new Error("Teksten er for lang for QR-koden");

    // Data bits
    const bits = [];
    function skriv(v, n) {
      for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1);
    }
    skriv(0x4, 4);
    skriv(bytes.length, ver <= 9 ? 8 : 16);
    bytes.forEach(function (b) {
      skriv(b, 8);
    });
    const kapasitet = dataKodeord(ver, ecc) * 8;
    skriv(0, Math.min(4, kapasitet - bits.length));
    skriv(0, (8 - (bits.length % 8)) % 8);
    for (let pad = 0xec; bits.length < kapasitet; pad ^= 0xec ^ 0x11) skriv(pad, 8);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = b * 2 + bits[i + j];
      data.push(b);
    }
    const kodeord = leggTilEcc(data, ver, ecc);

    // Matrix
    const str = ver * 4 + 17;
    const moduler = [];
    const funksjon = [];
    for (let y = 0; y < str; y++) {
      moduler.push(new Array(str).fill(false));
      funksjon.push(new Array(str).fill(false));
    }
    function sett(x, y, mork) {
      moduler[y][x] = mork;
      funksjon[y][x] = true;
    }

    for (let i = 0; i < str; i++) {
      sett(6, i, i % 2 === 0);
      sett(i, 6, i % 2 === 0);
    }
    function finner(cx, cy) {
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const d = Math.max(Math.abs(dx), Math.abs(dy));
          const x = cx + dx;
          const y = cy + dy;
          if (x >= 0 && x < str && y >= 0 && y < str) sett(x, y, d !== 2 && d !== 4);
        }
      }
    }
    finner(3, 3);
    finner(str - 4, 3);
    finner(3, str - 4);

    const pos = justeringsPosisjoner(ver, str);
    const na = pos.length;
    for (let i = 0; i < na; i++) {
      for (let j = 0; j < na; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)) continue;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            sett(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
          }
        }
      }
    }

    function tegnFormat(m) {
      const d = (ecc.bits << 3) | m;
      let rem = d;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const b = ((d << 10) | rem) ^ 0x5412;
      function bit(i) {
        return ((b >>> i) & 1) !== 0;
      }
      for (let i = 0; i <= 5; i++) sett(8, i, bit(i));
      sett(8, 7, bit(6));
      sett(8, 8, bit(7));
      sett(7, 8, bit(8));
      for (let i = 9; i < 15; i++) sett(14 - i, 8, bit(i));
      for (let i = 0; i < 8; i++) sett(str - 1 - i, 8, bit(i));
      for (let i = 8; i < 15; i++) sett(8, str - 15 + i, bit(i));
      sett(8, str - 8, true);
    }
    tegnFormat(0);

    if (ver >= 7) {
      let rem = ver;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      const b = (ver << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const c = ((b >>> i) & 1) !== 0;
        const a = str - 11 + (i % 3);
        const bb = Math.floor(i / 3);
        sett(a, bb, c);
        sett(bb, a, c);
      }
    }

    // Data in the zigzag order
    let i = 0;
    for (let hoyre = str - 1; hoyre >= 1; hoyre -= 2) {
      if (hoyre === 6) hoyre = 5;
      for (let vert = 0; vert < str; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = hoyre - j;
          const opp = ((hoyre + 1) & 2) === 0;
          const y = opp ? str - 1 - vert : vert;
          if (!funksjon[y][x] && i < kodeord.length * 8) {
            moduler[y][x] = ((kodeord[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
            i++;
          }
        }
      }
    }

    function maske(m) {
      for (let y = 0; y < str; y++) {
        for (let x = 0; x < str; x++) {
          if (!funksjon[y][x] && maskeInverterer(m, x, y)) moduler[y][x] = !moduler[y][x];
        }
      }
    }

    function straff() {
      let s = 0;
      function linje(hent) {
        let lop = 1;
        for (let k = 1; k < str; k++) {
          if (hent(k) === hent(k - 1)) {
            lop++;
            if (lop === 5) s += 3;
            else if (lop > 5) s += 1;
          } else lop = 1;
        }
        // Finder-like 1:1:3:1:1 with four light modules on one side
        const monstre = [
          [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0],
          [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1],
        ];
        for (let k = 0; k <= str - 11; k++) {
          for (let m = 0; m < 2; m++) {
            let treff = true;
            for (let t = 0; t < 11; t++) {
              if ((hent(k + t) ? 1 : 0) !== monstre[m][t]) {
                treff = false;
                break;
              }
            }
            if (treff) s += 40;
          }
        }
      }
      for (let y = 0; y < str; y++) linje(function (x) { return moduler[y][x]; });
      for (let x = 0; x < str; x++) linje(function (y) { return moduler[y][x]; });
      for (let y = 0; y < str - 1; y++) {
        for (let x = 0; x < str - 1; x++) {
          const c = moduler[y][x];
          if (c === moduler[y][x + 1] && c === moduler[y + 1][x] && c === moduler[y + 1][x + 1]) s += 3;
        }
      }
      let mork = 0;
      moduler.forEach(function (rad) {
        rad.forEach(function (c) {
          if (c) mork++;
        });
      });
      const total = str * str;
      const k = Math.ceil(Math.abs(mork * 20 - total * 10) / total) - 1;
      s += Math.max(0, k) * 10;
      return s;
    }

    let beste = 0;
    let besteStraff = Infinity;
    for (let m = 0; m < 8; m++) {
      maske(m);
      tegnFormat(m);
      const s = straff();
      if (s < besteStraff) {
        beste = m;
        besteStraff = s;
      }
      maske(m); // XOR again to undo
    }
    maske(beste);
    tegnFormat(beste);

    return { storrelse: str, moduler: moduler, versjon: ver, maske: beste, ecc: eccNavn || "M" };
  }

  function qrSvg(qr, valg) {
    valg = valg || {};
    const kant = valg.kant == null ? 4 : valg.kant;
    const mork = valg.mork || "#000";
    const lys = valg.lys || "#fff";
    const n = qr.storrelse + kant * 2;
    let d = "";
    for (let y = 0; y < qr.storrelse; y++) {
      for (let x = 0; x < qr.storrelse; x++) {
        if (qr.moduler[y][x]) d += "M" + (x + kant) + "," + (y + kant) + "h1v1h-1z";
      }
    }
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + n + " " + n +
      '" shape-rendering="crispEdges" role="img" aria-label="' + (valg.etikett || "QR-kode") + '">' +
      '<rect width="' + n + '" height="' + n + '" fill="' + lys + '"/>' +
      '<path d="' + d + '" fill="' + mork + '"/></svg>'
    );
  }

  return { lagQr: lagQr, qrSvg: qrSvg, dataKodeord: dataKodeord };
});
