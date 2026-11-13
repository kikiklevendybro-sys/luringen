/* R.terninger — real 3D dice in a tray seen from above (rusj/KIT.md, «Terninger»).
   Loaded only by games with "terninger": true in spill.json.

   How a throw works:
   1. The whole throw is simulated first, deterministically, at a fixed 120 Hz step: position and
      velocity in the tray plane, height with gravity, bounces on the felt and the walls, die–die
      collisions, friction, and tumbling with angular velocity and a quaternion orientation. Every
      die ends flat with one face up, at rest within 2.5 s.
   2. The game has already decided the values. After the simulation we see which face ended on top
      and relabel that die's faces with one of the 24 rotations of a cube, so exactly the wanted value
      is up. The motion stays fully physical; only the numbers painted on the faces move. The new
      labels are painted on while the die tumbles, at the moment when the faces that change are the
      least visible (facing the felt), so a die never changes its face in plain sight.
   3. The recorded track is played back with requestAnimationFrame.

   The physics is pure (no DOM) and lives in window.RusjTerninger.fysikk, so test/terninger.test.mjs
   can throw thousands of dice in Node. */
(function () {
  "use strict";

  // ---------- Physics (pure: no DOM, no kit) ----------
  // Units: one die edge = 1. The tray is x ∈ [0, bredde], y ∈ [0, hoyde] (y downwards, as on the
  // screen), z is the height above the felt (towards the viewer). The die's centre rests at z = ½.

  const HZ = 120;
  const DT = 1 / HZ;
  const MAKS_TID = 2.5; // every throw is at rest by then
  const G = 72; // gravity in die edges per s² (big, heavy dice: a toss lasts about half a second)
  const RUND = 0.1; // the rounded corners: the die collides as a cube of 0.8 with a 0.1 skin
  const H = 0.5 - RUND;
  const INV_I = 6; // a cube of mass 1 and edge 1 has the inertia 1/6 about every axis
  const ITER = 6; // velocity iterations per step

  // Face labels, as the value on each body axis in the order +x, −x, +y, −y, +z, −z.
  // Opposite faces sum to 7, and 1-2-3 meet counter-clockwise round their corner (a Western die).
  const GRUNN = [2, 5, 3, 4, 1, 6];

  // The 24 rotations of a cube (signed permutation matrices with determinant +1), and the labels each
  // gives: the face that sat on body axis k moves to axis R·k.
  const ROTASJONER = [];
  (function () {
    const perm = [
      [0, 1, 2],
      [0, 2, 1],
      [1, 0, 2],
      [1, 2, 0],
      [2, 0, 1],
      [2, 1, 0],
    ];
    const paritet = [1, -1, -1, 1, 1, -1];
    perm.forEach((p, pi) => {
      for (let s = 0; s < 8; s++) {
        const fortegn = [s & 1 ? -1 : 1, s & 2 ? -1 : 1, s & 4 ? -1 : 1];
        if (paritet[pi] * fortegn[0] * fortegn[1] * fortegn[2] !== 1) continue;
        // column k of the matrix: body axis k goes to axis p[k] with sign fortegn[k]
        ROTASJONER.push(p.map((akse, k) => [akse, fortegn[k]]));
      }
    });
  })();
  const MERKINGER = ROTASJONER.map((rot) => {
    const ut = [0, 0, 0, 0, 0, 0];
    for (let k = 0; k < 3; k++) {
      const [akse, s] = rot[k];
      ut[2 * akse + (s > 0 ? 0 : 1)] = GRUNN[2 * k];
      ut[2 * akse + (s > 0 ? 1 : 0)] = GRUNN[2 * k + 1];
    }
    return ut;
  });

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Quaternions are [w, x, y, z]. The matrix is row-major: world = M · body, column j = body axis j.
  function matrise(q, m) {
    const w = q[0],
      x = q[1],
      y = q[2],
      z = q[3];
    m[0] = 1 - 2 * (y * y + z * z);
    m[1] = 2 * (x * y - w * z);
    m[2] = 2 * (x * z + w * y);
    m[3] = 2 * (x * y + w * z);
    m[4] = 1 - 2 * (x * x + z * z);
    m[5] = 2 * (y * z - w * x);
    m[6] = 2 * (x * z - w * y);
    m[7] = 2 * (y * z + w * x);
    m[8] = 1 - 2 * (x * x + y * y);
    return m;
  }
  const qMul = (a, b) => [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ];
  function qNorm(q) {
    const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
    q[0] /= l;
    q[1] /= l;
    q[2] /= l;
    q[3] /= l;
    return q;
  }
  const qAkse = (ax, ay, az, vinkel) => {
    const s = Math.sin(vinkel / 2);
    return [Math.cos(vinkel / 2), ax * s, ay * s, az * s];
  };
  // A turn about the vertical axis (the twist a die lies with).
  const qGir = (vinkel) => qAkse(0, 0, 1, vinkel);
  function qSlerp(a, b, t) {
    let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    const bb = d < 0 ? b.map((x) => -x) : b;
    d = Math.abs(d);
    if (d > 0.9995) return qNorm(a.map((x, i) => x + (bb[i] - x) * t));
    const th = Math.acos(d);
    const s = Math.sin(th);
    const wa = Math.sin((1 - t) * th) / s;
    const wb = Math.sin(t * th) / s;
    return a.map((x, i) => x * wa + bb[i] * wb);
  }

  // Which label is up: the index (0–5, as in GRUNN) of the body axis that points most upwards.
  function oppAkse(q) {
    const m = matrise(q, new Array(9));
    let best = 0;
    for (let j = 1; j < 3; j++) if (Math.abs(m[6 + j]) > Math.abs(m[6 + best])) best = j;
    return 2 * best + (m[6 + best] > 0 ? 0 : 1);
  }
  // How flat a die lies: the largest |z| of its three axes (1 = flat).
  function flathet(m) {
    return Math.max(Math.abs(m[6]), Math.abs(m[7]), Math.abs(m[8]));
  }
  // The smallest turn that makes the up axis exactly vertical (the die put down flat).
  function qFlat(q) {
    const m = matrise(q, new Array(9));
    const a = oppAkse(q);
    const j = a >> 1;
    const s = a & 1 ? -1 : 1;
    const ux = s * m[j],
      uy = s * m[3 + j],
      uz = s * m[6 + j];
    // rotate u onto +z: axis u × z = (uy, −ux, 0), angle acos(uz)
    const l = Math.hypot(uy, ux);
    if (l < 1e-9) return q.slice();
    return qNorm(qMul(qAkse(uy / l, -ux / l, 0, Math.acos(Math.max(-1, Math.min(1, uz)))), q));
  }
  // A resting die with the value v on top, twisted `gir` radians, with labels that put v up.
  function hvile(v, gir, merking) {
    const flater = merking && merking[4] === v ? merking : MERKINGER.find((f) => f[4] === v);
    return { q: qGir(gir || 0), flater: flater.slice() };
  }

  const HJORNER = [];
  for (let i = 0; i < 8; i++) HJORNER.push([i & 1 ? H : -H, i & 2 ? H : -H, i & 4 ? H : -H]);

  // Separating axis test of two dice (as plain unit cubes). Returns null when apart, else
  // { n (unit, from a to b), dybde, punkt (the contact point) }.
  const AKSE_TOL = 1e-6;
  function sat(pa, ma, pb, mb, mellom = 0) {
    const dx = pb[0] - pa[0],
      dy = pb[1] - pa[1],
      dz = pb[2] - pa[2];
    const grense = 1.79 + mellom; // farther apart than two half diagonals: apart
    if (dx * dx + dy * dy + dz * dz > grense * grense) return null;
    let best = Infinity;
    let nx = 0,
      ny = 0,
      nz = 0,
      dybde = 0,
      type = 0; // 0: face of a, 1: face of b, 2: edge–edge
    // Column j of a matrix is the die's axis j.
    const prov = (lx, ly, lz, t, skjevhet) => {
      const ra = 0.5 * (Math.abs(lx * ma[0] + ly * ma[3] + lz * ma[6]) + Math.abs(lx * ma[1] + ly * ma[4] + lz * ma[7]) + Math.abs(lx * ma[2] + ly * ma[5] + lz * ma[8]));
      const rb = 0.5 * (Math.abs(lx * mb[0] + ly * mb[3] + lz * mb[6]) + Math.abs(lx * mb[1] + ly * mb[4] + lz * mb[7]) + Math.abs(lx * mb[2] + ly * mb[5] + lz * mb[8]));
      const dist = lx * dx + ly * dy + lz * dz;
      const over = ra + rb + mellom - Math.abs(dist);
      if (over < 0) return false;
      if (over * skjevhet < best) {
        best = over * skjevhet;
        const sg = dist < 0 ? -1 : 1;
        nx = sg * lx;
        ny = sg * ly;
        nz = sg * lz;
        dybde = over;
        type = t;
      }
      return true;
    };
    // quick no: the line between the centres separates most pairs that are near but apart
    const dl = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dl > 1e-9) {
      const lx = dx / dl,
        ly = dy / dl,
        lz = dz / dl;
      const ra = 0.5 * (Math.abs(lx * ma[0] + ly * ma[3] + lz * ma[6]) + Math.abs(lx * ma[1] + ly * ma[4] + lz * ma[7]) + Math.abs(lx * ma[2] + ly * ma[5] + lz * ma[8]));
      const rb = 0.5 * (Math.abs(lx * mb[0] + ly * mb[3] + lz * mb[6]) + Math.abs(lx * mb[1] + ly * mb[4] + lz * mb[7]) + Math.abs(lx * mb[2] + ly * mb[5] + lz * mb[8]));
      if (ra + rb + mellom < dl) return null;
    }
    for (let j = 0; j < 3; j++) if (!prov(ma[j], ma[3 + j], ma[6 + j], 0, 1)) return null;
    for (let j = 0; j < 3; j++) if (!prov(mb[j], mb[3 + j], mb[6 + j], 1, 1)) return null;
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) {
        const ax = ma[i],
          ay = ma[3 + i],
          az = ma[6 + i],
          bx = mb[j],
          by = mb[3 + j],
          bz = mb[6 + j];
        const cx = ay * bz - az * by,
          cy = az * bx - ax * bz,
          cz = ax * by - ay * bx;
        const l = Math.sqrt(cx * cx + cy * cy + cz * cz);
        if (l < AKSE_TOL) continue;
        if (!prov(cx / l, cy / l, cz / l, 2, 1.08)) return null; // faces are preferred (steadier)
      }
    // The supporting point of a die towards direction r (the middle of a face or edge when flat to it).
    const stotte = (p, m, rx, ry, rz) => {
      let ux = p[0],
        uy = p[1],
        uz = p[2];
      for (let j = 0; j < 3; j++) {
        const s = m[j] * rx + m[3 + j] * ry + m[6 + j] * rz;
        const f = Math.abs(s) < 0.08 ? 0 : s > 0 ? 0.5 : -0.5;
        ux += f * m[j];
        uy += f * m[3 + j];
        uz += f * m[6 + j];
      }
      return [ux, uy, uz];
    };
    let punkt;
    if (type === 0) punkt = stotte(pb, mb, -nx, -ny, -nz);
    else if (type === 1) punkt = stotte(pa, ma, nx, ny, nz);
    else {
      const a = stotte(pa, ma, nx, ny, nz);
      const b = stotte(pb, mb, -nx, -ny, -nz);
      punkt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    }
    return { n: [nx, ny, nz], dybde, punkt };
  }

  // Overlap of two dice lying flat (their footprints are squares): the depth along the best
  // separating axis in the plane, or 0. Used by the tests and the final check.
  // mellom: the room that must be left between them (counted as overlap).
  function overlappFlat(a, b, mellom = 0) {
    const ma = matrise(a.q, new Array(9));
    const mb = matrise(b.q, new Array(9));
    const r = sat([a.x, a.y, 0.5], ma, [b.x, b.y, 0.5], mb, mellom);
    return r ? r.dybde : 0;
  }

  // Simulate a throw.
  // o: { bredde, hoyde, terninger: [{ x, y, q, kast }] (kast: thrown, else lying still),
  //      retning: [dx, dy] (screen direction, length ignored), styrke: 0–1, fro: seed }
  // Returns { hz, rammer, spor: Float32Array (rammer × n × 7: x y z qw qx qy qz),
  //           fart: Float32Array (rammer × n: angular speed), slutt: [{ x, y, q }], stot: [{ t, i, fart, mot }] }
  function simuler(o) {
    const W = o.bredde;
    const HH = o.hoyde;
    const rnd = mulberry32((o.fro >>> 0) || 1);
    const n = o.terninger.length;
    const styrke = Math.max(0, Math.min(1, o.styrke == null ? 0.7 : o.styrke));
    let rx = o.retning ? o.retning[0] : 0;
    let ry = o.retning ? o.retning[1] : -1;
    const rl = Math.hypot(rx, ry);
    if (rl < 1e-6) {
      rx = 0;
      ry = -1;
    } else {
      rx /= rl;
      ry /= rl;
    }
    const kropp = o.terninger.map((t) => ({
      p: [t.x, t.y, 0.5],
      v: [0, 0, 0],
      w: [0, 0, 0],
      q: qNorm((t.q || [1, 0, 0, 0]).slice()),
      m: new Array(9),
      sover: !t.kast,
      kast: !!t.kast,
      ro: 0, // steps in a row it has been nearly still
      skjev: 0, // steps in a row it has been nearly still but not flat (leaning on something)
      oppe: 0, // steps in a row it has lain on top of another die
      paaTerning: 0, // > 0 while another die holds it up
      styrt: null, // the last moments: guided straight to a flat rest
      sistLyd: -1,
    }));
    // Launch: the whole handful in the direction of the swipe, each with its own spread and spin.
    for (const k of kropp) {
      if (!k.kast) continue;
      const vinkel = (rnd() - 0.5) * 0.5;
      const c = Math.cos(vinkel),
        s = Math.sin(vinkel);
      const fart = (5 + 10 * styrke) * (0.8 + 0.4 * rnd());
      k.v = [(rx * c - ry * s) * fart, (rx * s + ry * c) * fart, (7 + 10 * styrke) * (0.75 + 0.5 * rnd())];
      // spin: a random axis, mostly rolling the way it flies
      const ax = -k.v[1] / fart + (rnd() - 0.5) * 1.4;
      const ay = k.v[0] / fart + (rnd() - 0.5) * 1.4;
      const az = (rnd() - 0.5) * 1.2;
      const al = Math.hypot(ax, ay, az) || 1;
      const spinn = (12 + 16 * styrke) * (0.7 + 0.6 * rnd());
      k.w = [(ax / al) * spinn, (ay / al) * spinn, (az / al) * spinn];
      k.p[2] = 0.62;
    }

    const maksRammer = Math.round(MAKS_TID * HZ);
    const spor = new Float32Array((maksRammer + 1) * n * 7);
    const fartSpor = new Float32Array((maksRammer + 1) * n);
    const stot = [];
    let rammer = 0;
    const skriv = (f) => {
      for (let i = 0; i < n; i++) {
        const k = kropp[i];
        const b = (f * n + i) * 7;
        spor[b] = k.p[0];
        spor[b + 1] = k.p[1];
        spor[b + 2] = k.p[2];
        spor[b + 3] = k.q[0];
        spor[b + 4] = k.q[1];
        spor[b + 5] = k.q[2];
        spor[b + 6] = k.q[3];
        fartSpor[f * n + i] = Math.hypot(k.w[0], k.w[1], k.w[2]);
      }
    };
    skriv(0);

    const PLAN = [
      // normal, offset (n · p ≥ offset inside), restitution, friction, kind
      [[0, 0, 1], 0, 0.32, 0.5, 0],
      [[1, 0, 0], 0, 0.5, 0.25, 1],
      [[-1, 0, 0], -W, 0.5, 0.25, 1],
      [[0, 1, 0], 0, 0.5, 0.25, 1],
      [[0, -1, 0], -HH, 0.5, 0.25, 1],
    ];
    const kontakter = [];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    // A unit vector perpendicular to n, and the third axis.
    const tangenter = (nn) => {
      const t1 = Math.abs(nn[2]) < 0.9 ? cross(nn, [0, 0, 1]) : cross(nn, [1, 0, 0]);
      const l = Math.hypot(t1[0], t1[1], t1[2]);
      t1[0] /= l;
      t1[1] /= l;
      t1[2] /= l;
      return [t1, cross(nn, t1)];
    };
    const lyd = (t, i, fart, mot) => {
      const k = kropp[i];
      if (fart < 2.2 || t - k.sistLyd < 0.07) return;
      k.sistLyd = t;
      stot.push({ t, i, fart, mot });
    };
    // Relative velocity of a (+ ra) against b (+ rb) at the contact.
    const relFart = (a, ra, b, rb) => {
      const va = [a.v[0] + a.w[1] * ra[2] - a.w[2] * ra[1], a.v[1] + a.w[2] * ra[0] - a.w[0] * ra[2], a.v[2] + a.w[0] * ra[1] - a.w[1] * ra[0]];
      if (!b) return va;
      return [va[0] - (b.v[0] + b.w[1] * rb[2] - b.w[2] * rb[1]), va[1] - (b.v[1] + b.w[2] * rb[0] - b.w[0] * rb[2]), va[2] - (b.v[2] + b.w[0] * rb[1] - b.w[1] * rb[0])];
    };
    const effektiv = (a, ra, b, rb, d) => {
      const ca = cross(ra, d);
      let k = (a.sover ? 0 : 1 + INV_I * (ca[0] * ca[0] + ca[1] * ca[1] + ca[2] * ca[2]));
      if (b && !b.sover) {
        const cb = cross(rb, d);
        k += 1 + INV_I * (cb[0] * cb[0] + cb[1] * cb[1] + cb[2] * cb[2]);
      }
      return k > 0 ? 1 / k : 0;
    };
    const dytt = (a, ra, b, rb, d, j) => {
      if (!a.sover) {
        a.v[0] += d[0] * j;
        a.v[1] += d[1] * j;
        a.v[2] += d[2] * j;
        const c = cross(ra, d);
        a.w[0] += INV_I * c[0] * j;
        a.w[1] += INV_I * c[1] * j;
        a.w[2] += INV_I * c[2] * j;
      }
      if (b && !b.sover) {
        b.v[0] -= d[0] * j;
        b.v[1] -= d[1] * j;
        b.v[2] -= d[2] * j;
        const c = cross(rb, d);
        b.w[0] -= INV_I * c[0] * j;
        b.w[1] -= INV_I * c[1] * j;
        b.w[2] -= INV_I * c[2] * j;
      }
    };

    for (let f = 1; f <= maksRammer; f++) {
      const t = f * DT;
      // Forces: gravity, a little air, and towards the end the felt takes the last energy out.
      const slutt = t > 1.45 ? Math.min(1, (t - 1.45) / 0.65) : 0;
      for (const k of kropp) {
        matrise(k.q, k.m);
        if (k.sover || k.styrt) continue;
        k.v[2] -= G * DT;
        const luft = 1 - DT * (0.15 + 7 * slutt * slutt);
        const spinnLuft = 1 - DT * (0.25 + 9 * slutt * slutt);
        k.v[0] *= luft;
        k.v[1] *= luft;
        k.w[0] *= spinnLuft;
        k.w[1] *= spinnLuft;
        k.w[2] *= spinnLuft;
      }

      // Contacts at the start of the step.
      kontakter.length = 0;
      for (let i = 0; i < n; i++) {
        const a = kropp[i];
        if (a.sover || a.styrt) continue;
        const m = a.m;
        for (const [nn, off, e, mu, mot] of PLAN) {
          if (nn[0] * a.p[0] + nn[1] * a.p[1] + nn[2] * a.p[2] - off > 0.92) continue; // too far for any corner
          for (const h of HJORNER) {
            const cx = a.p[0] + m[0] * h[0] + m[1] * h[1] + m[2] * h[2];
            const cy = a.p[1] + m[3] * h[0] + m[4] * h[1] + m[5] * h[2];
            const cz = a.p[2] + m[6] * h[0] + m[7] * h[1] + m[8] * h[2];
            const pen = RUND - (nn[0] * cx + nn[1] * cy + nn[2] * cz - off);
            if (pen <= -0.04) continue; // a corner just above counts too (it may land this step)
            const ra = [cx - RUND * nn[0] - a.p[0], cy - RUND * nn[1] - a.p[1], cz - RUND * nn[2] - a.p[2]];
            kontakter.push({ a, b: null, ra, rb: null, n: nn, e, mu, mot, i, pen });
          }
        }
      }
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++) {
          const a = kropp[i],
            b = kropp[j];
          if ((a.sover || a.styrt) && (b.sover || b.styrt)) continue;
          if (a.styrt || b.styrt) continue;
          const r = sat(a.p, a.m, b.p, b.m);
          if (!r) continue;
          // n from a to b: push b along +n, a along −n. Store as a contact on b against a.
          const ra = [r.punkt[0] - b.p[0], r.punkt[1] - b.p[1], r.punkt[2] - b.p[2]];
          const rb = [r.punkt[0] - a.p[0], r.punkt[1] - a.p[1], r.punkt[2] - a.p[2]];
          const kontakt = { a: b, b: a, ra, rb, n: r.n, e: 0.42, mu: 0.12, mot: 2, i: j, pen: r.dybde, par: i };
          // One die lying on another: its rounded edges let it slip off sideways (never a tower).
          if (Math.abs(r.n[2]) > 0.55) {
            const oppe = r.n[2] > 0 ? b : a;
            const nede = oppe === b ? a : b;
            kontakt.mu = 0.02;
            oppe.paaTerning = 3;
            if (!oppe.sover && !oppe.styrt) {
              let ux = oppe.p[0] - nede.p[0],
                uy = oppe.p[1] - nede.p[1];
              const ul = Math.hypot(ux, uy);
              if (ul < 0.05) {
                const v = rnd() * Math.PI * 2;
                ux = Math.cos(v);
                uy = Math.sin(v);
              } else {
                ux /= ul;
                uy /= ul;
              }
              oppe.v[0] += ux * 9 * DT;
              oppe.v[1] += uy * 9 * DT;
            }
          }
          // A sleeping die is woken by a real knock.
          const vn = relFart(b, ra, a, rb);
          const inn = vn[0] * r.n[0] + vn[1] * r.n[1] + vn[2] * r.n[2];
          if (inn < -2.5) {
            if (a.sover) {
              a.sover = false;
              a.ro = 0;
            }
            if (b.sover) {
              b.sover = false;
              b.ro = 0;
            }
          }
          kontakter.push(kontakt);
        }

      // Prepare: effective masses, the bounce each contact wants, tangents.
      for (const c of kontakter) {
        const vr = relFart(c.a, c.ra, c.b, c.rb);
        const vn = vr[0] * c.n[0] + vr[1] * c.n[1] + vr[2] * c.n[2];
        c.mn = effektiv(c.a, c.ra, c.b, c.rb, c.n);
        // the speed it should leave with: a bounce for a real hit; a corner that is not touching yet may
        // still close its gap this step
        const treffer = c.pen > vn * DT - 0.002; // it touches during this step
        c.mal = !treffer ? c.pen / DT : vn < -1.2 ? -c.e * vn : Math.min(0, c.pen / DT);
        c.jn = 0;
        const [t1, t2] = tangenter(c.n);
        c.t1 = t1;
        c.t2 = t2;
        c.m1 = effektiv(c.a, c.ra, c.b, c.rb, t1);
        c.m2 = effektiv(c.a, c.ra, c.b, c.rb, t2);
        c.j1 = 0;
        c.j2 = 0;
        if (vn < 0 && treffer) lyd(t, c.i, -vn, c.mot);
      }
      // Lying on the felt (three or four corners down): the felt eats the small rocking.
      for (const k of kropp) k.bunnKontakt = 0;
      for (const c of kontakter) if (c.mot === 0 && c.pen > -0.01) c.a.bunnKontakt++;
      for (const k of kropp) {
        if (k.bunnKontakt < 3 || flathet(k.m) < 0.99) continue;
        k.w[0] *= 0.82;
        k.w[1] *= 0.82;
        k.w[2] *= 0.9;
        k.v[0] *= 0.94;
        k.v[1] *= 0.94;
      }
      // Sequential impulses: push apart along the normal (never pull), then friction within μ·jn.
      for (let it = 0; it < ITER; it++) {
        for (const c of kontakter) {
          const vr = relFart(c.a, c.ra, c.b, c.rb);
          const vn = vr[0] * c.n[0] + vr[1] * c.n[1] + vr[2] * c.n[2];
          let dj = (c.mal - vn) * c.mn;
          const ny = Math.max(0, c.jn + dj);
          dj = ny - c.jn;
          c.jn = ny;
          if (dj) dytt(c.a, c.ra, c.b, c.rb, c.n, dj);
          const grense = c.mu * c.jn;
          const v1 = relFart(c.a, c.ra, c.b, c.rb);
          // friction along the two tangents (no allocations here: this runs thousands of times)
          const t1 = c.t1;
          let d1 = -(v1[0] * t1[0] + v1[1] * t1[1] + v1[2] * t1[2]) * c.m1;
          const ny1 = Math.max(-grense, Math.min(grense, c.j1 + d1));
          d1 = ny1 - c.j1;
          c.j1 = ny1;
          if (d1) dytt(c.a, c.ra, c.b, c.rb, t1, d1);
          const t2 = c.t2;
          const v2 = d1 ? relFart(c.a, c.ra, c.b, c.rb) : v1;
          let d2 = -(v2[0] * t2[0] + v2[1] * t2[1] + v2[2] * t2[2]) * c.m2;
          const ny2 = Math.max(-grense, Math.min(grense, c.j2 + d2));
          d2 = ny2 - c.j2;
          c.j2 = ny2;
          if (d2) dytt(c.a, c.ra, c.b, c.rb, t2, d2);
        }
      }

      // Move.
      for (const k of kropp) {
        if (k.sover) continue;
        if (k.styrt) {
          const s = k.styrt;
          const u = Math.min(1, (f - s.f0) / s.lengde);
          const e = u * u * (3 - 2 * u);
          k.p = [s.p0[0] + (s.p1[0] - s.p0[0]) * e, s.p0[1] + (s.p1[1] - s.p0[1]) * e, s.p0[2] + (s.p1[2] - s.p0[2]) * e];
          k.q = qSlerp(s.q0, s.q1, e);
          if (u >= 1) {
            k.styrt = null;
            legg(k);
          }
          continue;
        }
        k.p[0] += k.v[0] * DT;
        k.p[1] += k.v[1] * DT;
        k.p[2] += k.v[2] * DT;
        const w = k.w,
          q = k.q;
        const dq = [-(w[0] * q[1] + w[1] * q[2] + w[2] * q[3]), w[0] * q[0] + w[1] * q[3] - w[2] * q[2], w[1] * q[0] + w[2] * q[1] - w[0] * q[3], w[2] * q[0] + w[0] * q[2] - w[1] * q[1]];
        for (let i = 0; i < 4; i++) q[i] += 0.5 * DT * dq[i];
        qNorm(q);
        matrise(q, k.m);
      }

      // Position correction: out of the felt and the walls, apart from each other, and once more out
      // of the walls (two dice pushed apart may push one into a wall).
      const utAvVeggene = () => {
        for (const k of kropp) {
          if (k.sover || k.styrt) continue;
          for (const [nn, off] of PLAN) {
          if (nn[0] * k.p[0] + nn[1] * k.p[1] + nn[2] * k.p[2] - off > 0.9) continue;
          let maks = 0;
          for (const h of HJORNER) {
            const m = k.m;
            const cx = k.p[0] + m[0] * h[0] + m[1] * h[1] + m[2] * h[2];
            const cy = k.p[1] + m[3] * h[0] + m[4] * h[1] + m[5] * h[2];
            const cz = k.p[2] + m[6] * h[0] + m[7] * h[1] + m[8] * h[2];
            maks = Math.max(maks, RUND - (nn[0] * cx + nn[1] * cy + nn[2] * cz - off));
          }
          if (maks > 0.001) {
            k.p[0] += nn[0] * (maks - 0.001);
            k.p[1] += nn[1] * (maks - 0.001);
            k.p[2] += nn[2] * (maks - 0.001);
          }
        }
        }
      };
      utAvVeggene();
      for (let rund = 0, flyttet = true; rund < 2 && flyttet; rund++) {
        flyttet = false;
        for (let i = 0; i < n; i++)
          for (let j = i + 1; j < n; j++) {
            const a = kropp[i],
              b = kropp[j];
            const fa = a.sover || a.styrt ? 0 : 1;
            const fb = b.sover || b.styrt ? 0 : 1;
            if (!fa && !fb) continue;
            const r = sat(a.p, a.m, b.p, b.m);
            if (!r || r.dybde < 0.002) continue;
            flyttet = true;
            const flytt = (r.dybde - 0.001) / (fa + fb);
            for (let x = 0; x < 3; x++) {
              a.p[x] -= r.n[x] * flytt * fa;
              b.p[x] += r.n[x] * flytt * fb;
            }
            // never pushed into the felt
            if (a.p[2] < 0.5 && fa) a.p[2] = Math.max(a.p[2], laveste(a));
            if (b.p[2] < 0.5 && fb) b.p[2] = Math.max(b.p[2], laveste(b));
          }
      }

      utAvVeggene();

      // Rest: a die that is still, flat and on the felt goes to sleep; one that leans on something
      // gets the little nudge a real table gives; and in the last moments the rest is laid down.
      for (let i = 0; i < n; i++) {
        const k = kropp[i];
        if (k.sover || k.styrt) continue;
        const fart = Math.hypot(k.v[0], k.v[1], k.v[2]);
        const spinn = Math.hypot(k.w[0], k.w[1], k.w[2]);
        const flat = flathet(k.m);
        const bunn = bunnHoyde(k);
        // still = has hardly moved for a few frames while lying flat on the felt (the solver's
        // last jitter is not motion)
        const flyttet = k.anker ? Math.hypot(k.p[0] - k.anker[0], k.p[1] - k.anker[1], k.p[2] - k.anker[2]) : 1;
        if (fart < 0.4 && spinn < 3 && flat > 0.997 && bunn < 0.02 && flyttet < 0.025) {
          if (++k.ro >= 6) legg(k);
        } else {
          k.ro = 0;
          k.anker = k.p.slice();
        }
        if (k.paaTerning > 0) {
          // lying on another die (or wedged between two) for a while: off it hops
          k.paaTerning--;
          if (++k.oppe >= 14) {
            k.oppe = 0;
            hopp(k, i);
          }
        } else k.oppe = 0;
        if (fart < 1 && spinn < 3 && (flat < 0.996 || bunn > 0.03)) {
          if (++k.skjev >= 10) {
            k.skjev = 0;
            dult(k, i);
          }
        } else k.skjev = 0;
        if (t >= 2.12 && !k.styrt && !k.sover) styr(k, i, f);
      }

      skriv(f);
      rammer = f;
      if (kropp.every((k) => k.sover)) break;
    }

    // Lowest point of a die above the felt (with its rounded skin).
    function laveste(k) {
      let lav = Infinity;
      for (const h of HJORNER) lav = Math.min(lav, k.m[6] * h[0] + k.m[7] * h[1] + k.m[8] * h[2]);
      return RUND - lav;
    }
    function bunnHoyde(k) {
      return k.p[2] - laveste(k);
    }
    // Put a die to sleep: exactly flat, centre at ½, still.
    function legg(k) {
      k.q = qFlat(k.q);
      matrise(k.q, k.m);
      k.p[2] = 0.5;
      k.v = [0, 0, 0];
      k.w = [0, 0, 0];
      k.sover = true;
      k.ro = 0;
      // Laid flat, its footprint turned a hair: clear of the dice already at rest.
      for (let rund = 0; rund < 4; rund++)
        for (const o2 of kropp) {
          if (o2 === k || !o2.sover) continue;
          const r = sat(o2.p, o2.m, k.p, k.m);
          if (!r || r.dybde <= 0) continue;
          k.p[0] += r.n[0] * (r.dybde + 0.001);
          k.p[1] += r.n[1] * (r.dybde + 0.001);
        }
    }
    // A die resting on an edge, a wall or another die: tip it towards its nearest face and away from
    // what holds it (like a knock on the table).
    // A die stuck on other dice hops off towards the nearest free spot on the felt, tumbling the way
    // it goes (a real die slides and drops off; this gets it there in a third of a second).
    function hopp(k, i) {
      const mal = frittSted(k, i, qFlat(k.q), 0.08);
      const dx = mal[0] - k.p[0],
        dy = mal[1] - k.p[1];
      const tid = Math.max(0.28, Math.min(0.45, 0.24 + 0.05 * Math.hypot(dx, dy)));
      k.v = [dx / tid, dy / tid, 0.5 * G * tid - (k.p[2] - 0.5) / tid];
      // turning flat on the way down, so it lands on a face
      const m = k.m;
      const a = oppAkse(k.q);
      const j = a >> 1;
      const sg = a & 1 ? -1 : 1;
      const u = [sg * m[j], sg * m[3 + j], sg * m[6 + j]];
      const l = Math.hypot(u[0], u[1]);
      const vinkel = Math.acos(Math.max(-1, Math.min(1, u[2])));
      k.w = l > 1e-6 ? [(u[1] / l) * (vinkel / tid), (-u[0] / l) * (vinkel / tid), (rnd() - 0.5) * 2] : [0, 0, (rnd() - 0.5) * 2];
    }
    function dult(k, i) {
      const m = k.m;
      k.dulter = (k.dulter || 0) + 1;
      if (k.dulter > 1 && bunnHoyde(k) > 0.05) return hopp(k, i); // still wedged
      const a = oppAkse(k.q);
      const j = a >> 1;
      const s = a & 1 ? -1 : 1;
      const u = [s * m[j], s * m[3 + j], s * m[6 + j]];
      const l = Math.hypot(u[1], u[0]);
      if (l > 1e-6) {
        const vinkel = Math.acos(Math.max(-1, Math.min(1, u[2])));
        const kraft = 2.5 + 6 * vinkel;
        k.w[0] += (u[1] / l) * kraft;
        k.w[1] += (-u[0] / l) * kraft;
      }
      // away from the nearest die it leans on, or towards the middle of the tray
      let bort = [W / 2 - k.p[0], HH / 2 - k.p[1]];
      let naer = Infinity;
      for (let x = 0; x < n; x++) {
        if (x === i) continue;
        const o2 = kropp[x];
        const dx = k.p[0] - o2.p[0],
          dy = k.p[1] - o2.p[1];
        const d = Math.hypot(dx, dy);
        if (d < 1.6 && d < naer) {
          naer = d;
          bort = d > 1e-6 ? [dx, dy] : [rnd() - 0.5, rnd() - 0.5];
        }
      }
      const bl = Math.hypot(bort[0], bort[1]) || 1;
      const oppe = bunnHoyde(k) > 0.25; // it lies on top of another die: off it slides
      k.v[0] += (bort[0] / bl) * (oppe ? 3 : 1.6);
      k.v[1] += (bort[1] / bl) * (oppe ? 3 : 1.6);
      k.v[2] += oppe ? 1.6 : 1.2;
    }
    // The last moments: the die glides straight to a flat rest on a free spot.
    function styr(k, i, f) {
      const q1 = qFlat(k.q);
      const p1 = frittSted(k, i, q1);
      const lengde = Math.max(4, Math.round((MAKS_TID - 0.08) * HZ) - f);
      k.styrt = { f0: f, lengde, p0: k.p.slice(), q0: k.q.slice(), p1: [p1[0], p1[1], 0.5], q1 };
      k.v = [0, 0, 0];
      k.w = [0, 0, 0];
    }
    // The nearest spot to a die where it lies inside the tray and clear of every other die's rest.
    function frittSted(k, i, q1, mellom = 0) {
      const fri = (x, y) => {
        if (x < 0.72 || x > W - 0.72 || y < 0.72 || y > HH - 0.72) {
          // close to a wall: check the real corners
          const m = matrise(q1, new Array(9));
          for (const h of HJORNER) {
            const cx = x + (m[0] * h[0] + m[1] * h[1] + m[2] * h[2]) * (0.5 / H);
            const cy = y + (m[3] * h[0] + m[4] * h[1] + m[5] * h[2]) * (0.5 / H);
            if (cx < 0.001 || cx > W - 0.001 || cy < 0.001 || cy > HH - 0.001) return false;
          }
        }
        for (let x2 = 0; x2 < n; x2++) {
          if (x2 === i) continue;
          const o2 = kropp[x2];
          const mal = o2.styrt ? o2.styrt.p1 : o2.p;
          const q2 = o2.styrt ? o2.styrt.q1 : o2.q;
          if (Math.hypot(mal[0] - x, mal[1] - y) > 1.5 + mellom) continue;
          if (overlappFlat({ x, y, q: q1 }, { x: mal[0], y: mal[1], q: q2 }, mellom) > 0) return false;
        }
        return true;
      };
      const x0 = Math.max(0.5, Math.min(W - 0.5, k.p[0]));
      const y0 = Math.max(0.5, Math.min(HH - 0.5, k.p[1]));
      if (fri(x0, y0)) return [x0, y0];
      for (let r = 0.1; r < W + HH; r += 0.1)
        for (let a = 0; a < 24; a++) {
          const x = x0 + r * Math.cos((a * Math.PI) / 12);
          const y = y0 + r * Math.sin((a * Math.PI) / 12);
          if (fri(x, y)) return [x, y];
        }
      return [x0, y0];
    }

    // Final tidy-up of tiny overlaps left by the solver (a fraction of a pixel), on the last frame.
    for (let rund = 0; rund < 60; rund++) {
      let rolig = true;
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++) {
          const a = kropp[i],
            b = kropp[j];
          const r = sat(a.p, matrise(a.q, a.m), b.p, matrise(b.q, b.m));
          if (!r || r.dybde <= 0) continue;
          rolig = false;
          const d = r.dybde / 2 + 0.0005;
          // along the shallowest axis first; if they are jammed (in a row against a wall), straight
          // away from each other, which lets a zigzag open up sideways
          let nx = r.n[0],
            ny = r.n[1];
          if (rund >= 15) {
            const dx = b.p[0] - a.p[0],
              dy = b.p[1] - a.p[1];
            const l = Math.hypot(dx, dy) || 1;
            nx = dx / l;
            ny = dy / l;
          }
          a.p[0] -= nx * d;
          a.p[1] -= ny * d;
          b.p[0] += nx * d;
          b.p[1] += ny * d;
        }
      for (const k of kropp) {
        const m = matrise(k.q, k.m);
        let minX = Infinity,
          maxX = -Infinity,
          minY = Infinity,
          maxY = -Infinity;
        // the rounded die (as it collides) stays inside the walls
        for (const h of HJORNER) {
          const cx = m[0] * h[0] + m[1] * h[1] + m[2] * h[2];
          const cy = m[3] * h[0] + m[4] * h[1] + m[5] * h[2];
          minX = Math.min(minX, cx - RUND);
          maxX = Math.max(maxX, cx + RUND);
          minY = Math.min(minY, cy - RUND);
          maxY = Math.max(maxY, cy + RUND);
        }
        const x = Math.max(-minX, Math.min(W - maxX, k.p[0]));
        const y = Math.max(-minY, Math.min(HH - maxY, k.p[1]));
        if (Math.abs(x - k.p[0]) + Math.abs(y - k.p[1]) > 1e-9) rolig = false;
        k.p[0] = x;
        k.p[1] = y;
      }
      if (rolig) break;
    }
    for (let i = 0; i < n; i++) {
      const k = kropp[i];
      k.p[2] = 0.5;
      const b = (rammer * n + i) * 7;
      spor[b] = k.p[0];
      spor[b + 1] = k.p[1];
      spor[b + 2] = 0.5;
    }

    return {
      hz: HZ,
      n,
      rammer: rammer + 1,
      spor: spor.subarray(0, (rammer + 1) * n * 7),
      fart: fartSpor.subarray(0, (rammer + 1) * n),
      slutt: kropp.map((k) => ({ x: k.p[0], y: k.p[1], q: k.q.slice() })),
      sov: kropp.every((k) => k.sover),
      stot,
    };
  }

  // The orientation of die i at frame f of a track.
  const qVed = (sim, f, i) => {
    const b = (f * sim.n + i) * 7;
    return [sim.spor[b + 3], sim.spor[b + 4], sim.spor[b + 5], sim.spor[b + 6]];
  };

  // Relabel a thrown die so that `verdi` ends on top. fra: its labels now (what shows before the
  // throw). Returns { flater (the new labels), bytt (the frame where they are painted on, −1 = no change) }.
  // The four labelings with `verdi` on the final up face are the candidates; the switch happens on the
  // frame where the faces that change are turned away from the viewer the most, while it spins.
  function ommerk(sim, i, verdi, fra) {
    const slutt = qVed(sim, sim.rammer - 1, i);
    const opp = oppAkse(slutt);
    const kandidater = MERKINGER.filter((f) => f[opp] === verdi);
    let best = null;
    const m = new Array(9);
    for (const f of kandidater) {
      const endres = [];
      for (let a = 0; a < 6; a++) if (f[a] !== fra[a]) endres.push(a);
      if (!endres.length) return { flater: f.slice(), bytt: -1 };
      // never on the first frames (the die still lies where everyone saw it) or once it is down
      for (let r = 2; r < sim.rammer - 1; r++) {
        const spinn = sim.fart[r * sim.n + i];
        if (spinn < 3) continue;
        matrise(qVed(sim, r, i), m);
        let synlig = 0;
        for (const a of endres) {
          const j = a >> 1;
          const nz = (a & 1 ? -1 : 1) * m[6 + j];
          synlig += Math.max(0, nz + 0.3);
        }
        const kost = synlig / (1 + spinn * 0.12);
        if (!best || kost < best.kost) best = { kost, flater: f.slice(), bytt: r };
      }
    }
    if (best) return { flater: best.flater, bytt: best.bytt };
    // A die that never spun (cannot happen for a thrown one): change at the last airborne frame.
    return { flater: kandidater[0].slice(), bytt: Math.max(1, sim.rammer - 2) };
  }

  // The twist of a flat die about the vertical, folded into (−45°, 45°] (a die looks the same every 90°).
  function gir(q) {
    const m = matrise(q, new Array(9));
    let j = 0;
    for (let k = 1; k < 3; k++) if (Math.abs(m[6 + k]) < Math.abs(m[6 + j])) j = k; // the most level axis
    let v = Math.atan2(m[3 + j], m[j]);
    v -= Math.round(v / (Math.PI / 2)) * (Math.PI / 2);
    return v;
  }

  const fysikk = { HZ, MAKS_TID, GRUNN, MERKINGER, simuler, ommerk, oppAkse, matrise, qGir, qMul, qFlat, hvile, overlappFlat, gir, mulberry32 };
  window.RusjTerninger = { fysikk };

  const R = window.Rusj;
  if (!R || typeof R.start !== "function") return; // loaded by the unit tests

  // ---------- The tray on screen ----------
  // A die is a button the size of its footprint, lying on the felt; inside it a cube of six faces
  // (built 100 px wide and scaled) is turned and lifted with one matrix3d per frame. The scene has a
  // mild perspective, so a die that flies up grows a little and shows its sides.

  const esc = R.esc;
  const D = 100;
  const LYS = (() => {
    const l = [-0.35, -0.55, 1];
    const n = Math.hypot(l[0], l[1], l[2]);
    return l.map((x) => x / n);
  })();
  const OYNE = { 1: [5], 2: [3, 7], 3: [3, 5, 7], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
  // Each face as (face x, face y, normal) = (u, v, n) with u × v = n, pushed out half a die.
  const FLATE = [
    [[0, 1, 0], [0, 0, 1], [1, 0, 0]],
    [[0, 0, 1], [0, 1, 0], [-1, 0, 0]],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
    [[1, 0, 0], [0, 0, 1], [0, -1, 0]],
    [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    [[-1, 0, 0], [0, 1, 0], [0, 0, -1]],
  ].map(([u, v, n]) => `matrix3d(${u.join(",")},0,${v.join(",")},0,${n.join(",")},0,${n.map((x) => (x * D) / 2).join(",")},1)`); // CSS // sprak-ok
  const oyneHtml = (v) => OYNE[v].map((p) => `<i class="trn-o${p}"></i>`).join("");
  const kubeHtml = (flater) =>
    `<span class="trn-kube" aria-hidden="true">${flater.map((v, a) => `<span class="trn-flate" data-a="${a}" data-v="${v}" style="transform: ${FLATE[a]}">${oyneHtml(v)}</span>`).join("")}<span class="trn-kjerne k1"></span><span class="trn-kjerne k2"></span><span class="trn-kjerne k3"></span></span>`;

  const BRETT = new Map(); // id → the tray's dice (they survive every redraw of the screen)
  const KANT = 10; // the wooden rim, px (as in terninger.css)
  const GLIPE = 6; // between the felt and the hold rail, px

  function nyttBrett(id, n) {
    return { id, n, t: Array.from({ length: n }, () => ({ x: null, y: null, q: null, flater: null, holdt: false, hjem: null })), s: 0, W: 0, H: 0, k: 1 };
  }

  // The markup of a tray. o: { id, verdier, holdt, etikett(i, v, holdt), navn (the group's label),
  // handling (data-h of a die, default "hold"), hold (false: no hold rail), vri (twist per die in
  // degrees, for the first layout), hint, hintId, klar (waiting for the first throw: dimmed, with a
  // swipe hint), av (dice disabled), klasse }
  function html(o) {
    const id = o.id;
    const n = o.verdier.length;
    let B = BRETT.get(id);
    if (!B || B.n !== n) {
      B = nyttBrett(id, n);
      BRETT.set(id, B);
    }
    B.o = o;
    const holdes = o.hold !== false;
    o.verdier.forEach((v, i) => {
      const t = B.t[i];
      if (t.flater && t.q && t.flater[oppAkse(t.q)] === v) return;
      // A die that shows something else than the game says (a reload, «Angre»): laid down anew, flat.
      const h = hvile(v, t.q ? gir(t.q) : ((o.vri && o.vri[i]) || 0) * (Math.PI / 180));
      t.q = h.q;
      t.flater = h.flater;
    });
    const holdt = (i) => holdes && !!(o.holdt && o.holdt[i]);
    // Before the first throw the dice are gathered in a loose row, ready to be thrown.
    if (o.klar)
      B.t.forEach((t, i) => {
        if (holdt(i)) return;
        Object.assign(t, { x: null, y: null, holdt: false, hjem: null });
      });
    const harHoldt = o.verdier.some((_, i) => holdt(i));
    const knapper = o.verdier
      .map(
        (v, i) =>
          `<button class="trn-t${holdt(i) ? " holdt" : ""}" type="button" data-h="${esc(o.handling || "hold")}" data-v="${i}" data-stille${holdes ? ` aria-pressed="${holdt(i)}"` : ""} aria-label="${esc(o.etikett ? o.etikett(i, v, holdt(i)) : String(v))}"${o.av ? " disabled" : ""}><span class="trn-skygge" aria-hidden="true"></span><span class="trn-ring" aria-hidden="true"></span>${kubeHtml(B.t[i].flater)}</button>`,
      )
      .join("");
    return `<div class="trn-brett${holdes ? " med-hylle" : ""}${o.klar ? " trn-klar" : ""}${harHoldt ? " har-holdt" : ""} ${o.klasse || ""}" id="${esc(id)}" style="--n: ${n}">
      <div class="trn-filt" aria-hidden="true"><span class="trn-sveip"><i></i><span>${esc(R.t("Sveip for å kaste"))}</span></span></div>
      ${holdes ? `<div class="trn-hylle" aria-hidden="true">${o.verdier.map(() => "<i></i>").join("")}</div>` : ""}
      ${o.hint != null ? `<p class="trn-hint"${o.hintId ? ` id="${esc(o.hintId)}"` : ""} aria-live="polite">${esc(o.hint)}</p>` : ""}
      <div class="trn-scene" role="group"${o.navn ? ` aria-label="${esc(o.navn)}"` : ""}>${knapper}</div>
    </div>`;
  }

  // ---------- Measuring and laying out ----------

  // Die size and tray size in dice. The dice move on at least max(5.8, n + 2) × 2 dice of felt; the
  // hold rail under it fits one row of dice (a little smaller when the room is tight).
  function maal(B) {
    const el = B.el;
    const bredde = el.clientWidth - 2 * KANT;
    const hoyde = el.clientHeight - 2 * KANT;
    if (bredde <= 0 || hoyde <= 0) return false;
    const holdes = B.o.hold !== false;
    const s1 = bredde / Math.max(6, B.n + 2.2);
    let k = 1;
    let s;
    if (!holdes) s = Math.min(s1, hoyde / 2.4);
    else if ((hoyde - GLIPE) / (2.6 + 1.22) >= s1) s = s1;
    else {
      // tight: a smaller rail, and the felt 2 dice high (plus its margins)
      k = 0.82;
      s = Math.min(s1, (hoyde - GLIPE) / (2.2 + 1.22 * k));
    }
    s = Math.max(20, Math.min(64, s));
    const hylle = holdes ? Math.round(s * 1.22 * k) : 0;
    const filt = hoyde - (holdes ? hylle + GLIPE : 0);
    // a small margin inside the felt: a die against the wall still shows all of its top face
    // inside the felt (the perspective lifts it a little outwards)
    const marg = s * 0.1;
    const W = (bredde - 2 * marg) / s;
    const H = (filt - 2 * marg) / s;
    const gammel = B.W && B.H ? [B.W, B.H] : null;
    Object.assign(B, { s, k, W, H, bredde, filt, hylle, marg });
    el.style.setProperty("--trn-s", s.toFixed(2) + "px");
    el.style.setProperty("--trn-filt-h", filt.toFixed(1) + "px");
    el.style.setProperty("--trn-hylle-h", hylle + "px");
    el.style.setProperty("--trn-k", String(k));
    el.style.setProperty("--trn-perspektiv", Math.round(s * 28) + "px");
    el.querySelectorAll(".trn-hylle i").forEach((x, i) => {
      x.style.left = `${(hylleX(B, i) - (s * k) / 2).toFixed(1)}px`;
    });
    // A new size (rotation, another phone): the dice keep their places relative to the felt.
    if (gammel && (Math.abs(gammel[0] - W) > 0.01 || Math.abs(gammel[1] - H) > 0.01)) {
      for (const t of B.t) {
        if (t.x != null) {
          t.x *= W / gammel[0];
          t.y *= H / gammel[1];
        }
        if (t.hjem) t.hjem = [(t.hjem[0] * W) / gammel[0], (t.hjem[1] * H) / gammel[1]];
      }
      ryddOpp(B);
    }
    return true;
  }

  // Centre of rail slot i, px from the scene's left edge.
  function hylleX(B, i) {
    const steg = Math.min(B.bredde / B.n, B.s * B.k * 1.45);
    return B.bredde / 2 + (i - (B.n - 1) / 2) * steg;
  }

  // Is the spot (x, y) free for die i (inside the felt, clear of every other die on it)?
  function fri(B, i, x, y, q) {
    const m = matrise(q, new Array(9));
    for (const sx of [-0.4, 0.4])
      for (const sy of [-0.4, 0.4])
        for (const sz of [-0.4, 0.4]) {
          const cx = x + m[0] * sx + m[1] * sy + m[2] * sz;
          const cy = y + m[3] * sx + m[4] * sy + m[5] * sz;
          if (cx < 0.1 || cx > B.W - 0.1 || cy < 0.1 || cy > B.H - 0.1) return false;
        }
    for (let j = 0; j < B.n; j++) {
      const o = B.t[j];
      if (j === i || o.holdt || o.x == null) continue;
      if (Math.hypot(o.x - x, o.y - y) > 1.5) continue;
      if (overlappFlat({ x, y, q }, o) > 0) return false;
    }
    return true;
  }
  function frittSted(B, i, x0, y0) {
    const t = B.t[i];
    const x = Math.max(0.75, Math.min(B.W - 0.75, x0));
    const y = Math.max(0.75, Math.min(B.H - 0.75, y0));
    if (fri(B, i, x, y, t.q)) return [x, y];
    for (let r = 0.15; r < B.W + B.H; r += 0.15)
      for (let a = 0; a < 16; a++) {
        const xx = x + r * Math.cos((a * Math.PI) / 8);
        const yy = y + r * Math.sin((a * Math.PI) / 8);
        if (fri(B, i, xx, yy, t.q)) return [xx, yy];
      }
    return [x, y];
  }
  // Dice without a place get one: a loose row across the middle of the felt, a little crooked.
  function ryddOpp(B) {
    const steg = Math.min(1.55, (B.W - 2.1) / Math.max(1, B.n - 1));
    for (let i = 0; i < B.n; i++) {
      const t = B.t[i];
      if (t.holdt || t.x != null) continue;
      t.x = B.W / 2 + (i - (B.n - 1) / 2) * steg;
      t.y = B.H * (B.o && B.o.klar ? 0.62 : 0.55) + (i % 2 ? -0.16 : 0.12) * Math.max(0, B.H - 1.6);
    }
    // everybody inside and apart (also after a new size)
    for (let i = 0; i < B.n; i++) {
      const t = B.t[i];
      if (t.holdt || t.x == null) continue;
      if (!fri(B, i, t.x, t.y, t.q)) [t.x, t.y] = frittSted(B, i, t.x, t.y);
    }
  }

  // Where a die rests: on the felt, or (held) in its slot on the rail, square to the rail.
  function hvilePose(B, i) {
    const t = B.t[i];
    if (t.holdt) return { px: hylleX(B, i), py: B.filt + GLIPE + B.hylle / 2, z: 0.5, q: qMul(qGir(-gir(t.q)), t.q), k: B.k };
    return { px: B.marg + t.x * B.s, py: B.marg + t.y * B.s, z: 0.5, q: t.q, k: 1 };
  }

  // ---------- Drawing ----------

  const mBuf = new Array(9);
  // The axis of the die that lies most level (its shadow turns with it).
  const flatAkse = (m) => {
    let j = 0;
    for (let x = 1; x < 3; x++) if (Math.abs(m[6 + x]) < Math.abs(m[6 + j])) j = x;
    return j;
  };
  function tegn(B, i, pose, flater) {
    const d = B.dom && B.dom[i];
    if (!d) return;
    const s = B.s;
    const k = pose.k || 1;
    d.knapp.style.transform = `translate(${(pose.px - s / 2).toFixed(2)}px, ${(pose.py - s / 2).toFixed(2)}px)${k !== 1 ? ` scale3d(${k.toFixed(3)}, ${k.toFixed(3)}, ${k.toFixed(3)})` : ""}`;
    const m = matrise(pose.q, mBuf);
    const f = s / D;
    const z = pose.z * s;
    const c = (x) => (x * f).toFixed(5);
    d.kube.style.transform = `matrix3d(${c(m[0])},${c(m[3])},${c(m[6])},0,${c(m[1])},${c(m[4])},${c(m[7])},0,${c(m[2])},${c(m[5])},${c(m[8])},0,0,0,${z.toFixed(2)},1)`;
    // Light from the top left: each face as bright as it faces the lamp.
    for (let a = 0; a < 6; a++) {
      const j = a >> 1;
      const sg = a & 1 ? -1 : 1;
      const lys = sg * (m[j] * LYS[0] + m[3 + j] * LYS[1] + m[6 + j] * LYS[2]);
      const mork = Math.max(0, Math.min(0.72, 0.78 * (0.88 - lys)));
      if (d.mork[a] == null || Math.abs(mork - d.mork[a]) > 0.015) {
        d.mork[a] = mork;
        d.flater[a].style.setProperty("--trn-mork", mork.toFixed(3));
      }
    }
    if (flater) maleFlater(d, flater);
    // The shadow on the felt: further out, bigger and softer the higher the die is.
    const h = Math.max(0, pose.z - 0.5);
    const j = flatAkse(m);
    const vinkel = Math.atan2(m[3 + j], m[j]);
    const skala = 1 + 0.32 * h + 0.18 * (1 - Math.max(Math.abs(m[6]), Math.abs(m[7]), Math.abs(m[8])));
    d.skygge.style.transform = `translate(${(s * (0.08 + 0.42 * h)).toFixed(1)}px, ${(s * (0.12 + 0.66 * h)).toFixed(1)}px) rotate(${vinkel.toFixed(3)}rad) scale(${skala.toFixed(3)})`;
    d.skygge.style.opacity = (0.8 / (1 + 0.6 * h)).toFixed(3);
    d.skygge.style.filter = `blur(${(s * (0.05 + 0.13 * h)).toFixed(1)}px)`;
  }
  // Paint the labels on the faces that differ (a die's numbers only change while nobody can see them).
  function maleFlater(d, flater) {
    flater.forEach((v, a) => {
      const el = d.flater[a];
      if (Number(el.dataset.v) === v) return;
      el.dataset.v = v;
      el.innerHTML = oyneHtml(v);
    });
  }
  function tegnHvile(B) {
    for (let i = 0; i < B.n; i++) tegn(B, i, (B.glir && B.glir[i] && B.glir[i].na) || hvilePose(B, i), B.t[i].flater);
  }

  // ---------- Joining the markup to the tray ----------

  // After every render of the screen. o: { vedSveip({ retning, styrke }) } — a fling on the tray.
  function koble(id, o = {}) {
    const B = BRETT.get(id);
    const el = document.getElementById(id);
    if (!B || !el) return;
    B.el = el;
    B.koble = o;
    B.dom = Array.from(el.querySelectorAll(".trn-t")).map((knapp) => ({
      knapp,
      kube: knapp.querySelector(".trn-kube"),
      skygge: knapp.querySelector(".trn-skygge"),
      flater: Array.from(knapp.querySelectorAll(".trn-flate")),
      mork: [],
    }));
    if (!maal(B)) return;
    // the markup says which dice are held (the game decides); a change without an animation lands at once
    B.dom.forEach((d, i) => {
      const t = B.t[i];
      const holdt = d.knapp.classList.contains("holdt");
      if (holdt === t.holdt) return;
      if (holdt) t.hjem = t.x != null ? [t.x, t.y] : null;
      else if (t.hjem) [t.x, t.y] = frittSted(B, i, t.hjem[0], t.hjem[1]);
      t.holdt = holdt;
    });
    ryddOpp(B);
    if (B.spiller) B.spiller.dom = true; // a throw is playing: it draws on the new markup from its next frame
    else tegnHvile(B);
    bindSveip(B, el);
    if (B.vakt) B.vakt.disconnect();
    if (window.ResizeObserver) {
      let forrige = [el.clientWidth, el.clientHeight];
      B.vakt = new ResizeObserver(() => {
        if (!el.isConnected) return B.vakt && B.vakt.disconnect();
        const na = [el.clientWidth, el.clientHeight];
        if (na[0] === forrige[0] && na[1] === forrige[1]) return;
        forrige = na;
        if (maal(B) && !B.spiller) tegnHvile(B);
      });
      B.vakt.observe(el);
    }
  }

  // A fling on the tray throws in that direction with that speed (the game decides if it may).
  const bundet = new WeakSet();
  function bindSveip(B, el) {
    if (bundet.has(el)) return; // the same markup joined twice: one set of listeners
    bundet.add(el);
    let p = null;
    let stoppKlikk = 0;
    el.addEventListener("pointerdown", (e) => {
      if (e.button > 0 || !e.isPrimary) return;
      p = { id: e.pointerId, x: e.clientX, y: e.clientY, spor: [[e.clientX, e.clientY, e.timeStamp]], aktiv: false };
    });
    el.addEventListener("pointermove", (e) => {
      if (!p || e.pointerId !== p.id) return;
      p.spor.push([e.clientX, e.clientY, e.timeStamp]);
      if (p.spor.length > 24) p.spor.shift();
      if (!p.aktiv && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 12) {
        p.aktiv = true;
        el.classList.add("sveiper");
        try {
          el.setPointerCapture(e.pointerId);
        } catch (feil) {
          /* not supported */
        }
      }
    });
    const slutt = (e) => {
      if (!p || e.pointerId !== p.id) return;
      const s = p;
      p = null;
      el.classList.remove("sveiper");
      if (!s.aktiv || e.type === "pointercancel") return;
      stoppKlikk = performance.now() + 450; // a fling is never also a tap on a die
      s.spor.push([e.clientX, e.clientY, e.timeStamp]);
      const sist = s.spor[s.spor.length - 1];
      let forst = s.spor[0];
      for (const x of s.spor)
        if (sist[2] - x[2] <= 110) {
          forst = x;
          break;
        }
      const dt = Math.max(16, sist[2] - forst[2]);
      let dx = sist[0] - forst[0];
      let dy = sist[1] - forst[1];
      const fart = Math.hypot(dx, dy) / dt; // px per ms
      const helt = Math.hypot(sist[0] - s.x, sist[1] - s.y);
      if (fart < 0.15 && helt < 50) return; // a slow drag that stopped: not a throw
      if (Math.hypot(dx, dy) < 4) {
        dx = sist[0] - s.x;
        dy = sist[1] - s.y;
      }
      const styrke = Math.max(0.15, Math.min(1, (fart - 0.15) / 1.6));
      if (B.koble && B.koble.vedSveip) B.koble.vedSveip({ retning: [dx, dy], styrke });
    };
    el.addEventListener("pointerup", slutt);
    el.addEventListener("pointercancel", slutt);
    el.addEventListener(
      "click",
      (e) => {
        if (performance.now() < stoppKlikk) {
          e.stopPropagation();
          e.preventDefault();
        }
      },
      true,
    );
  }

  // ---------- Sound and touch ----------

  // An impact, as loud as it hit: a thump in the felt, a knock on the wooden wall, a click between dice.
  function smell(stot) {
    const st = Math.max(0.08, Math.min(1, (stot.fart - 2) / 12));
    if (stot.mot === 2) {
      R.lyd.stoy(0, 0.018, 0.34 * st, 3600 + Math.random() * 1400);
      R.lyd.stoy(0.004, 0.03, 0.12 * st, 1900 + Math.random() * 500);
    } else if (stot.mot === 1) {
      R.lyd.stoy(0, 0.03, 0.3 * st, 1500 + Math.random() * 500);
      R.lyd.tone(150 + Math.random() * 40, 0, 0.07, "triangle", 0.16 * st, 100);
    } else {
      R.lyd.stoy(0, 0.04, 0.26 * st, 900 + Math.random() * 500);
      R.lyd.tone(110 + Math.random() * 40, 0, 0.08, "triangle", 0.2 * st, 70);
    }
  }
  // The dice leaving the hand.
  function rasle() {
    for (let k = 0; k < 4; k++) R.lyd.stoy(k * 0.03 + Math.random() * 0.01, 0.022, 0.06 + Math.random() * 0.05, 2600 + Math.random() * 2400);
  }

  // ---------- Playing a throw ----------

  // Throw the dice `indekser` so they show `verdier` (all dice, as the game decided them).
  // o: { verdier, indekser, retning: [dx, dy] (screen), styrke: 0–1, rolig: true (no flight), lyd: false }
  // Resolves when every die is down.
  function kast(id, o) {
    const B = BRETT.get(id);
    return new Promise((ferdig) => {
      if (!B) return ferdig();
      stopp(B);
      const el = B.el && B.el.isConnected ? B.el : null;
      if (el) {
        maal(B);
        el.classList.remove("trn-klar");
      }
      if (!B.W) Object.assign(B, { W: 7, H: 3, s: 40, k: 1, marg: 0 });
      const kastes = new Set(o.indekser);
      ryddOpp(B);
      const ider = [];
      for (let i = 0; i < B.n; i++) {
        const t = B.t[i];
        if (kastes.has(i)) {
          if (t.holdt) {
            // a held die that the game throws after all: back on the felt first
            t.holdt = false;
            [t.x, t.y] = frittSted(B, i, B.W / 2, B.H / 2);
          }
          ider.push(i);
        } else if (!t.holdt) ider.push(i);
      }
      const vinkel = -Math.PI / 2 + (Math.random() - 0.5) * 1.1;
      const sim = simuler({
        bredde: B.W,
        hoyde: B.H,
        terninger: ider.map((i) => ({ x: B.t[i].x, y: B.t[i].y, q: B.t[i].q, kast: kastes.has(i) })),
        retning: o.retning || [Math.cos(vinkel), Math.sin(vinkel)],
        styrke: o.styrke == null ? 0.45 + Math.random() * 0.4 : o.styrke,
        fro: Math.floor(Math.random() * 4294967296),
      });
      const fra = [];
      const til = [];
      const bytt = [];
      ider.forEach((i, k) => {
        const t = B.t[i];
        fra[k] = t.flater.slice();
        if (kastes.has(i)) {
          const r = ommerk(sim, k, o.verdier[i], t.flater);
          til[k] = r.flater;
          bytt[k] = r.bytt;
        } else {
          til[k] = t.flater;
          bytt[k] = -1;
        }
        // where it ends is kept at once: a redraw before it lands shows the result
        t.x = sim.slutt[k].x;
        t.y = sim.slutt[k].y;
        t.q = sim.slutt[k].q;
        t.flater = til[k];
      });
      if (!el || !B.dom || o.rolig || R.rolig()) {
        // Reduced motion (or no tray on screen): the dice fade in where they end, no flight.
        if (el && B.dom) {
          tegnHvile(B);
          for (const i of kastes) {
            const d = B.dom[i];
            if (d && d.knapp.animate) d.knapp.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: "ease-out" });
          }
          if (o.lyd !== false) R.lyd.stoy(0, 0.05, 0.14, 1200);
        }
        return setTimeout(ferdig, el ? 200 : 0);
      }
      if (o.lyd !== false) rasle();
      R.vibrer(8);
      const spill = { sim, ider, fra, til, bytt, malt: ider.map(() => false), start: performance.now(), stot: 0, vibrert: 0, ferdig, dom: true };
      B.spiller = spill;
      const varighet = (sim.rammer / sim.hz) * 1000;
      const S = sim.spor;
      const ramme = () => {
        if (B.spiller !== spill) return;
        const t = (performance.now() - spill.start) / 1000;
        let f = t * sim.hz;
        const slutt = f >= sim.rammer - 1;
        if (slutt) f = sim.rammer - 1;
        const a = Math.floor(f);
        const b = Math.min(sim.rammer - 1, a + 1);
        const u = f - a;
        ider.forEach((i, k) => {
          const pa = (a * sim.n + k) * 7;
          const pb = (b * sim.n + k) * 7;
          const qa = [S[pa + 3], S[pa + 4], S[pa + 5], S[pa + 6]];
          let qb = [S[pb + 3], S[pb + 4], S[pb + 5], S[pb + 6]];
          if (qa[0] * qb[0] + qa[1] * qb[1] + qa[2] * qb[2] + qa[3] * qb[3] < 0) qb = qb.map((x) => -x);
          const q = qa.map((x, j) => x + (qb[j] - x) * u);
          const l = Math.hypot(q[0], q[1], q[2], q[3]);
          let flater = null;
          if (!spill.malt[k] && bytt[k] >= 0 && f >= bytt[k]) {
            spill.malt[k] = true;
            flater = til[k];
          } else if (spill.dom) flater = spill.malt[k] || bytt[k] < 0 ? til[k] : fra[k];
          tegn(B, i, { px: B.marg + (S[pa] + (S[pb] - S[pa]) * u) * B.s, py: B.marg + (S[pa + 1] + (S[pb + 1] - S[pa + 1]) * u) * B.s, z: S[pa + 2] + (S[pb + 2] - S[pa + 2]) * u, q: q.map((v) => v / l), k: 1 }, flater);
        });
        spill.dom = false;
        // the knocks, as loud as they hit
        let lyder = 0;
        while (spill.stot < sim.stot.length && sim.stot[spill.stot].t <= t) {
          const st = sim.stot[spill.stot++];
          if (lyder++ < 3 && o.lyd !== false) smell(st);
          if (st.mot === 0 && st.fart > 4 && spill.vibrert < 3) {
            spill.vibrert++;
            R.vibrer(spill.vibrert === 1 ? 14 : 8);
          }
        }
        if (slutt) return avslutt(B, spill);
        requestAnimationFrame(ramme);
      };
      requestAnimationFrame(ramme);
      // a hidden tab gets no frames: the throw still ends
      spill.vakt = setTimeout(() => avslutt(B, spill), varighet + 600);
    });
  }
  function avslutt(B, spill) {
    if (B.spiller !== spill) return;
    clearTimeout(spill.vakt);
    B.spiller = null;
    if (B.el && B.el.isConnected) tegnHvile(B);
    spill.ferdig();
  }
  // Stop a throw that is playing: the dice lie where they end.
  function stopp(B) {
    if (B && B.spiller) avslutt(B, B.spiller);
  }

  // ---------- Holding ----------

  // Move die i to the hold rail (holdt = true) or back to the felt. The game has decided it may.
  // o: { etikett(i, v, holdt), verdi, rolig }
  function hold(id, i, holdt, o = {}) {
    const B = BRETT.get(id);
    if (!B) return Promise.resolve();
    const t = B.t[i];
    const d = B.dom && B.dom[i];
    if (d) {
      d.knapp.classList.toggle("holdt", holdt);
      d.knapp.setAttribute("aria-pressed", String(holdt));
      if (o.etikett) d.knapp.setAttribute("aria-label", o.etikett(i, o.verdi, holdt));
    }
    if (B.el) B.el.classList.toggle("har-holdt", B.t.some((x, j) => (j === i ? holdt : x.holdt)));
    if (t.holdt === holdt) return Promise.resolve();
    const fra = naPose(B, i);
    if (holdt) t.hjem = t.x != null ? [t.x, t.y] : null;
    t.holdt = holdt;
    if (!holdt) [t.x, t.y] = frittSted(B, i, t.hjem ? t.hjem[0] : B.W / 2, t.hjem ? t.hjem[1] : B.H / 2);
    const til = hvilePose(B, i);
    if (!d || !B.el || !B.el.isConnected) return Promise.resolve();
    if (o.rolig || R.rolig() || !d.knapp.animate) {
      if (B.glir) delete B.glir[i];
      tegn(B, i, til);
      if (d.knapp.animate) d.knapp.animate([{ opacity: 0.2 }, { opacity: 1 }], { duration: 160 });
      return Promise.resolve();
    }
    return glid(B, i, fra, til, 300);
  }
  // The pose a die is drawn in right now (its rest, or where its glide has got to).
  function naPose(B, i) {
    const g = B.glir && B.glir[i];
    return g ? g.na : hvilePose(B, i);
  }
  // A short hop from one pose to another (into the rail and out of it).
  function glid(B, i, fra, til, ms) {
    B.glir = B.glir || {};
    const gml = B.glir[i];
    if (gml) gml.ferdig();
    return new Promise((ferdig) => {
      const g = { na: fra, ferdig };
      B.glir[i] = g;
      const start = performance.now();
      const slutt = () => {
        if (B.glir[i] !== g) return;
        delete B.glir[i];
        if (!B.spiller) tegn(B, i, hvilePose(B, i));
        ferdig();
      };
      const steg = () => {
        if (B.glir[i] !== g) return;
        const u = Math.min(1, (performance.now() - start) / ms);
        const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
        g.na = {
          px: fra.px + (til.px - fra.px) * e,
          py: fra.py + (til.py - fra.py) * e,
          z: fra.z + (til.z - fra.z) * e + Math.sin(Math.PI * u) * 0.55,
          q: qSlerp(fra.q, til.q, e),
          k: fra.k + (til.k - fra.k) * e,
        };
        if (!B.spiller) tegn(B, i, g.na);
        if (u < 1) requestAnimationFrame(steg);
        else slutt();
      };
      requestAnimationFrame(steg);
      setTimeout(slutt, ms + 400);
    });
  }

  R.terninger = { html, koble, kast, hold, stopp: (id) => stopp(BRETT.get(id)), fysikk };
})();
