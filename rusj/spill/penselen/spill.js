/* Penselen — colouring pages for small children. 44 pictures of rusj's own line art in six themes
   (animals, vehicles, space, seasons, the North, the sea). Tap inside a field to fill it with the
   colour you hold, or paint freely with a thin or a thick brush; the brush paints under the lines,
   so the picture stays sharp. «Angre» takes back the last thing, + and − zoom on small screens,
   and «Ferdig» makes a PNG to save on the phone – nothing is uploaded. Every picture is kept as a
   short list of actions (fills and strokes), so it survives a reload and can be continued later.
   The line art and the fill engine at the top are pure; test/penselen.test.mjs loads this file
   without the kit. */
(function () {
  "use strict";

  // ---------- Line art (a 200 × 200 sheet; every outline is a stroke of width STREK) ----------

  const STREK = 3.2;
  const t1 = (n) => Math.round(n * 10) / 10;
  const sirkel = (cx, cy, r) => `M${t1(cx - r)} ${t1(cy)}a${t1(r)} ${t1(r)} 0 1 0 ${t1(2 * r)} 0a${t1(r)} ${t1(r)} 0 1 0 ${t1(-2 * r)} 0Z`;
  const ellipse = (cx, cy, rx, ry) => `M${t1(cx - rx)} ${t1(cy)}a${t1(rx)} ${t1(ry)} 0 1 0 ${t1(2 * rx)} 0a${t1(rx)} ${t1(ry)} 0 1 0 ${t1(-2 * rx)} 0Z`;
  const rekt = (x, y, b, h, r = 0) =>
    r
      ? `M${x + r} ${y}H${x + b - r}Q${x + b} ${y} ${x + b} ${y + r}V${y + h - r}Q${x + b} ${y + h} ${x + b - r} ${y + h}H${x + r}Q${x} ${y + h} ${x} ${y + h - r}V${y + r}Q${x} ${y} ${x + r} ${y}Z`
      : `M${x} ${y}H${x + b}V${y + h}H${x}Z`;
  // A closed polygon from "x y" pairs, and an open line.
  const poly = (...p) => `M${p.join("L")}Z`;
  const linje = (...p) => `M${p.join("L")}`;
  const stjerne = (cx, cy, R, r, n = 5, rot = -90) => {
    const p = [];
    for (let i = 0; i < 2 * n; i++) {
      const v = ((rot + (i * 180) / n) * Math.PI) / 180;
      const rr = i % 2 ? r : R;
      p.push(`${t1(cx + rr * Math.cos(v))} ${t1(cy + rr * Math.sin(v))}`);
    }
    return poly(...p);
  };
  // A cloud: bumps on top, flat underneath (s ≈ half the height).
  const sky = (cx, cy, s) =>
    `M${t1(cx - 1.6 * s)} ${t1(cy + 0.6 * s)}A${t1(0.6 * s)} ${t1(0.6 * s)} 0 0 1 ${t1(cx - 0.9 * s)} ${t1(cy - 0.2 * s)}A${t1(0.8 * s)} ${t1(0.8 * s)} 0 0 1 ${t1(cx + 0.5 * s)} ${t1(cy - 0.5 * s)}A${t1(0.6 * s)} ${t1(0.6 * s)} 0 0 1 ${t1(cx + 1.4 * s)} ${t1(cy)}A${t1(0.4 * s)} ${t1(0.4 * s)} 0 0 1 ${t1(cx + 1.6 * s)} ${t1(cy + 0.6 * s)}Z`;
  // The ground or the sea along the bottom of the sheet (a closed field from y down to the edge).
  const bakke = (y, bue = 8) => `M-2 202V${y}Q100 ${y - bue} 202 ${y}V202Z`;
  const bolger = (y, n = 4, a = 8) => {
    let d = `M-2 202V${y}`;
    const b = 204 / n;
    for (let i = 0; i < n; i++) d += `Q${t1(-2 + b * i + b / 4)} ${y - a} ${t1(-2 + b * i + b / 2)} ${y}T${t1(-2 + b * (i + 1))} ${y}`;
    return d + "V202Z";
  };
  // A tower with three merlons on top.
  const torn = (x, topp, b, bunn) =>
    `M${x} ${bunn}V${topp}H${t1(x + b / 5)}V${topp + 7}H${t1(x + (2 * b) / 5)}V${topp}H${t1(x + (3 * b) / 5)}V${topp + 7}H${t1(x + (4 * b) / 5)}V${topp}H${x + b}V${bunn}Z`;
  // A scalloped ring (a lion's mane, a flower): n bumps around a circle.
  const krans = (cx, cy, R, n, dybde) => {
    let d = "";
    for (let i = 0; i <= n; i++) {
      const v = (i / n) * Math.PI * 2;
      const x = t1(cx + R * Math.cos(v));
      const y = t1(cy + R * Math.sin(v));
      if (i === 0) d += `M${x} ${y}`;
      else {
        const m = v - Math.PI / n;
        d += `Q${t1(cx + (R + dybde) * Math.cos(m))} ${t1(cy + (R + dybde) * Math.sin(m))} ${x} ${y}`;
      }
    }
    return d + "Z";
  };
  // A wavy tentacle with a curled tip: 16 wide at x on the top, leaning dx at the bottom.
  const arm = (x, dx) =>
    `M${x} 98Q${t1(x - 6 + dx * 0.3)} 125 ${t1(x + dx * 0.5)} 145Q${t1(x + 6 + dx * 0.7)} 165 ${x + dx} 178Q${x + dx + 2} 192 ${x + dx + 12} 186Q${x + dx + 18} 180 ${x + dx + 14} 172Q${t1(x + 22 + dx * 0.7)} 160 ${t1(x + 16 + dx * 0.5)} 145Q${t1(x + 10 + dx * 0.3)} 125 ${x + 16} 98Z`;

  const BILDER = [
    // ---------- Animals ----------
    {
      id: "katt",
      tema: "dyr",
      s: [
        ellipse(100, 146, 42, 40),
        ellipse(100, 152, 20, 24),
        "M138 168Q186 168 176 120Q174 110 166 114Q174 152 136 154Z",
        ellipse(84, 184, 13, 7),
        ellipse(116, 184, 13, 7),
        poly("72 66", "68 32", "94 50"),
        poly("128 66", "132 32", "106 50"),
        sirkel(100, 82, 34),
        linje("100 96", "100 101") + "M100 101Q96 107 90 104M100 101Q104 107 110 104",
        "M74 92L56 88M74 98L56 100M126 92L144 88M126 98L144 100",
      ],
      f: [ellipse(87, 78, 4.5, 6.5), ellipse(113, 78, 4.5, 6.5), poly("95 91", "105 91", "100 97")],
    },
    {
      id: "hund",
      tema: "dyr",
      s: [
        "M74 112Q64 150 72 184H128Q136 150 126 112Z",
        "M88 150V184M112 150V184",
        "M126 160Q162 162 160 128Q158 120 152 124Q154 150 128 150Z",
        rekt(76, 106, 48, 9, 4.5),
        sirkel(100, 124, 7),
        ellipse(100, 76, 36, 33),
        "M70 58Q48 58 52 102Q60 112 72 96Z",
        "M130 58Q152 58 148 102Q140 112 128 96Z",
        ellipse(100, 94, 17, 12),
        "M100 92V99M92 101Q100 106 108 101",
      ],
      f: [sirkel(87, 70, 4.5), sirkel(113, 70, 4.5), ellipse(100, 88, 6.5, 4.5)],
    },
    {
      id: "kanin",
      tema: "dyr",
      s: [
        ellipse(84, 42, 11, 30),
        ellipse(116, 42, 11, 30),
        ellipse(84, 44, 5, 19),
        ellipse(116, 44, 5, 19),
        ellipse(100, 148, 36, 38),
        ellipse(100, 154, 18, 22),
        sirkel(138, 162, 10),
        ellipse(80, 184, 17, 8),
        ellipse(120, 184, 17, 8),
        sirkel(100, 90, 30),
        "M100 99V104M93 106Q100 111 107 106",
        "M76 98L60 95M76 103L60 106M124 98L140 95M124 103L140 106",
      ],
      f: [sirkel(90, 86, 4), sirkel(110, 86, 4), ellipse(100, 97, 4.5, 3.2)],
    },
    {
      id: "ugle",
      tema: "dyr",
      s: [
        rekt(28, 176, 144, 10, 5),
        poly("64 62", "58 30", "84 50"),
        poly("136 62", "142 30", "116 50"),
        ellipse(100, 112, 52, 66),
        "M52 98Q28 140 66 162Q58 130 60 104Z",
        "M148 98Q172 140 134 162Q142 130 140 104Z",
        ellipse(100, 140, 30, 32),
        "M84 130Q90 136 96 130M104 130Q110 136 116 130M92 146Q98 152 104 146M108 146Q114 152 120 146M80 146Q84 151 88 147",
        sirkel(80, 88, 20),
        sirkel(120, 88, 20),
        poly("93 102", "107 102", "100 116"),
        "M88 178V186M96 178V186M104 178V186M112 178V186",
      ],
      f: [sirkel(82, 88, 8), sirkel(118, 88, 8)],
    },
    {
      id: "sommerfugl",
      tema: "dyr",
      s: [
        "M96 84Q60 26 28 48Q16 92 94 104Z",
        "M104 84Q140 26 172 48Q184 92 106 104Z",
        "M95 108Q48 108 44 150Q60 176 97 128Z",
        "M105 108Q152 108 156 150Q140 176 103 128Z",
        sirkel(58, 64, 11),
        sirkel(142, 64, 11),
        sirkel(76, 88, 6),
        sirkel(124, 88, 6),
        sirkel(66, 140, 9),
        sirkel(134, 140, 9),
        ellipse(100, 106, 7, 42),
        sirkel(100, 58, 9),
        "M97 50Q90 32 82 31M103 50Q110 32 118 31",
        sirkel(80, 30, 4),
        sirkel(120, 30, 4),
      ],
      f: [],
    },
    {
      id: "skilpadde",
      tema: "dyr",
      s: [
        ellipse(64, 150, 13, 11),
        ellipse(140, 150, 13, 11),
        poly("40 132", "24 140", "40 142"),
        "M158 116Q170 108 176 104",
        ellipse(178, 106, 16, 13),
        "M42 130Q48 70 104 66Q160 70 166 130Z",
        rekt(38, 128, 132, 13, 6.5),
        poly("90 84", "118 84", "128 104", "118 124", "90 124", "80 104"),
        "M90 84L76 72M118 84L132 72M128 104L164 116M80 104L44 116M90 124L84 128M118 124L124 128",
        "M180 114Q185 117 189 113",
      ],
      f: [sirkel(183, 102, 2.8)],
    },
    {
      id: "snegle",
      tema: "dyr",
      s: [
        "M28 162Q28 142 50 142H150Q158 142 160 130V102Q160 86 172 86Q184 86 184 102V142Q184 162 164 162Z",
        sirkel(94, 104, 42),
        "M94 104a6 6 0 0 1 12 0a12 12 0 0 1 -24 0a18 18 0 0 1 36 0a24 24 0 0 1 -48 0a30 30 0 0 1 60 0",
        "M166 88L160 66M178 88L182 66",
        sirkel(160, 62, 6),
        sirkel(182, 62, 6),
        "M166 112Q172 118 178 112",
      ],
      f: [sirkel(160, 62, 2.5), sirkel(182, 62, 2.5)],
    },
    {
      id: "love",
      tema: "dyr",
      s: [
        krans(100, 102, 62, 14, 14),
        sirkel(68, 70, 11),
        sirkel(132, 70, 11),
        sirkel(100, 106, 42),
        ellipse(100, 124, 20, 14),
        "M100 118V126M90 130Q100 136 110 130",
        "M74 120L58 116M74 126L58 130M126 120L142 116M126 126L142 130",
      ],
      f: [sirkel(86, 98, 5), sirkel(114, 98, 5), poly("92 112", "108 112", "100 120")],
    },

    // ---------- Vehicles ----------
    {
      id: "bil",
      tema: "kjoretoy",
      s: [
        bakke(170, 0),
        "M18 142V118Q18 108 30 106L56 102L76 72Q80 66 90 66H130Q140 66 146 74L166 102L178 106Q188 110 188 120V142Z",
        "M80 76H100V100H64Z",
        "M108 76H128Q134 76 138 82L152 100H108Z",
        "M104 100V142",
        rekt(112, 110, 12, 5, 2.5),
        rekt(172, 114, 14, 9, 3),
        sirkel(58, 144, 21),
        sirkel(150, 144, 21),
        sirkel(58, 144, 8),
        sirkel(150, 144, 8),
        sky(48, 32, 12),
      ],
      f: [],
    },
    {
      id: "buss",
      tema: "kjoretoy",
      s: [
        bakke(172, 0),
        rekt(14, 56, 174, 96, 12),
        rekt(28, 70, 28, 28, 4),
        rekt(64, 70, 28, 28, 4),
        rekt(100, 70, 28, 28, 4),
        rekt(140, 70, 36, 34, 4),
        rekt(140, 110, 22, 38, 2),
        "M14 118H140",
        sirkel(178, 134, 5),
        sirkel(52, 152, 19),
        sirkel(150, 152, 19),
        sirkel(52, 152, 7),
        sirkel(150, 152, 7),
      ],
      f: [],
    },
    {
      id: "tog",
      tema: "kjoretoy",
      s: [
        "M4 170H196M4 178H196",
        sirkel(50, 32, 10),
        sirkel(70, 22, 12),
        sirkel(94, 16, 9),
        poly("46 84", "46 58", "40 46", "66 46", "60 58", "60 84"),
        "M76 84Q76 64 88 64Q100 64 100 84Z",
        rekt(28, 84, 96, 48, 8),
        rekt(112, 44, 70, 12, 4),
        rekt(118, 56, 58, 76, 4),
        rekt(130, 66, 34, 28, 4),
        rekt(18, 96, 12, 30, 3),
        rekt(20, 130, 160, 10, 4),
        sirkel(52, 148, 17),
        sirkel(92, 148, 17),
        sirkel(148, 144, 23),
        sirkel(52, 148, 5),
        sirkel(92, 148, 5),
        sirkel(148, 144, 8),
      ],
      f: [],
    },
    {
      id: "traktor",
      tema: "kjoretoy",
      s: [
        bakke(176, 4),
        rekt(98, 30, 76, 10, 4),
        rekt(106, 40, 60, 56, 6),
        rekt(120, 50, 32, 30, 4),
        rekt(26, 96, 92, 38, 6),
        rekt(44, 60, 9, 36, 3),
        sirkel(26, 108, 7),
        "M60 104V126M72 104V126M84 104V126",
        sirkel(140, 134, 40),
        sirkel(140, 134, 17),
        sirkel(50, 150, 25),
        sirkel(50, 150, 9),
      ],
      f: [],
    },
    {
      id: "fly",
      tema: "kjoretoy",
      s: [
        sky(40, 160, 14),
        sky(160, 40, 12),
        poly("84 98", "112 98", "96 50", "80 50"),
        "M18 110Q18 96 40 94H160Q186 96 192 110Q186 124 160 126H40Q18 124 18 110Z",
        poly("26 98", "16 60", "34 60", "52 94"),
        poly("80 112", "122 112", "98 170", "76 170"),
        poly("28 116", "56 116", "42 136", "24 136"),
        sirkel(118, 106, 5),
        sirkel(134, 106, 5),
        sirkel(150, 106, 5),
        "M170 100Q184 100 188 108H170Z",
      ],
      f: [],
    },
    {
      id: "helikopter",
      tema: "kjoretoy",
      s: [
        rekt(26, 40, 148, 9, 4.5),
        rekt(96, 49, 8, 15),
        poly("146 90", "184 82", "184 96", "146 112"),
        sirkel(184, 80, 11),
        "M48 102Q48 64 92 64H118Q150 64 150 102Q150 138 112 138H72Q48 138 48 102Z",
        "M56 102Q56 74 88 74V102Z",
        "M96 74V136",
        "M78 138V156M122 138V156",
        rekt(50, 154, 100, 7, 3.5),
        sky(36, 176, 10),
      ],
      f: [],
    },
    {
      id: "brannbil",
      tema: "kjoretoy",
      s: [
        bakke(170, 0),
        rekt(24, 60, 106, 14, 2),
        "M38 60V74M52 60V74M66 60V74M80 60V74M94 60V74M108 60V74",
        rekt(56, 74, 12, 8),
        rekt(14, 82, 124, 62, 6),
        "M136 144V82H164L186 112V144Z",
        poly("142 90", "162 90", "176 110", "142 110"),
        rekt(148, 72, 16, 10, 4),
        sirkel(78, 112, 17),
        sirkel(78, 112, 6),
        rekt(104, 94, 26, 42, 3),
        sirkel(50, 146, 19),
        sirkel(156, 146, 19),
        sirkel(50, 146, 7),
        sirkel(156, 146, 7),
      ],
      f: [],
    },

    // ---------- Space ----------
    {
      id: "rakett",
      tema: "rom",
      s: [
        stjerne(36, 48, 12, 5),
        stjerne(166, 72, 9, 4),
        stjerne(160, 170, 7, 3),
        "M76 142Q78 178 100 194Q122 178 124 142Z",
        "M88 142Q90 164 100 178Q110 164 112 142",
        "M64 102L34 150L66 140Z",
        "M136 102L166 150L134 140Z",
        "M100 18Q142 56 136 132H64Q58 56 100 18Z",
        "M78 46H122",
        sirkel(100, 80, 17),
        sirkel(100, 80, 9),
        rekt(68, 128, 64, 14, 4),
      ],
      f: [],
    },
    {
      id: "astronaut",
      tema: "rom",
      s: [
        stjerne(28, 40, 10, 4),
        stjerne(172, 120, 9, 4),
        "M66 112Q40 122 44 148L56 148Q56 128 70 124Z",
        "M134 112Q160 122 156 148L144 148Q144 128 130 124Z",
        sirkel(50, 152, 9),
        sirkel(150, 152, 9),
        rekt(70, 154, 24, 30, 8),
        rekt(106, 154, 24, 30, 8),
        rekt(64, 176, 34, 13, 6),
        rekt(102, 176, 34, 13, 6),
        rekt(64, 100, 72, 62, 18),
        rekt(84, 116, 32, 22, 4),
        sirkel(94, 127, 3.5),
        sirkel(106, 127, 3.5),
        "M128 34L140 18",
        sirkel(141, 15, 4),
        sirkel(100, 64, 40),
        "M68 62Q68 40 100 40Q132 40 132 62Q132 86 100 86Q68 86 68 62Z",
        "M80 58Q82 50 90 47",
      ],
      f: [],
    },
    {
      id: "planet",
      tema: "rom",
      s: [
        sirkel(170, 34, 12),
        stjerne(30, 34, 9, 4),
        stjerne(160, 172, 8, 3.5),
        stjerne(40, 170, 6, 2.5),
        "M56 113.4A46 46 0 1 1 144 113.4",
        "M61.8 125.5A46 46 0 0 0 138.2 125.5",
        "M58.6 80Q100 70 141.4 80M69 66Q100 58 131 66",
        "M14 104A86 24 0 0 0 186 104",
        "M36 104A64 13 0 0 0 164 104",
        "M14 104A86 24 0 0 1 57.2 83.2M142.8 83.2A86 24 0 0 1 186 104",
        "M36 104A64 13 0 0 1 54.3 94.8M145.7 94.8A64 13 0 0 1 164 104",
      ],
      f: [],
    },
    {
      id: "romvesen",
      tema: "rom",
      s: [
        "M80 46L68 20M120 46L132 20",
        sirkel(66, 16, 6),
        sirkel(134, 16, 6),
        "M70 124Q46 128 40 108Q48 102 54 110Q60 118 74 116Z",
        "M130 124Q154 128 160 108Q152 102 146 110Q140 118 126 116Z",
        "M70 114Q60 170 76 184H124Q140 170 130 114Z",
        ellipse(100, 152, 16, 18),
        ellipse(100, 80, 46, 40),
        ellipse(82, 78, 12, 15),
        ellipse(118, 78, 12, 15),
        "M86 100Q100 110 114 100",
        sirkel(68, 56, 5),
        sirkel(132, 58, 4),
      ],
      f: [sirkel(84, 82, 5.5), sirkel(120, 82, 5.5)],
    },
    {
      id: "ufo",
      tema: "rom",
      s: [
        stjerne(28, 40, 10, 4),
        stjerne(172, 28, 8, 3.5),
        stjerne(170, 168, 7, 3),
        poly("76 120", "124 120", "152 188", "48 188"),
        ellipse(100, 116, 42, 11),
        "M64 94Q64 48 100 48Q136 48 136 94Z",
        sirkel(100, 74, 12),
        ellipse(100, 100, 82, 20),
        sirkel(44, 100, 5),
        sirkel(72, 107, 5),
        sirkel(100, 109, 5),
        sirkel(128, 107, 5),
        sirkel(156, 100, 5),
      ],
      f: [sirkel(96, 72, 2.2), sirkel(104, 72, 2.2)],
    },
    {
      id: "maane",
      tema: "rom",
      s: [
        "M102.4 36.3A64 64 0 1 0 146.6 139.3A56 56 0 1 1 102.4 36.3Z",
        "M44 96Q50 90 56 96",
        "M46 120Q54 128 62 120",
        stjerne(152, 50, 15, 6),
        stjerne(176, 104, 9, 4),
        stjerne(132, 172, 11, 4.5),
        stjerne(30, 176, 7, 3),
        sky(162, 152, 12),
      ],
      f: [],
    },
    {
      id: "satellitt",
      tema: "rom",
      s: [
        "M-2 202V186Q100 148 202 186V202Z",
        "M44 182Q60 170 80 176Q92 186 76 192Z",
        stjerne(28, 30, 8, 3.5),
        stjerne(176, 160, 7, 3),
        stjerne(170, 26, 6, 2.5),
        rekt(20, 86, 56, 26, 2),
        "M34 86V112M48 86V112M62 86V112M20 99H76",
        rekt(124, 86, 56, 26, 2),
        "M138 86V112M152 86V112M166 86V112M124 99H180",
        "M76 99H84M116 99H124",
        rekt(84, 78, 32, 44, 4),
        "M104 64V78",
        "M84 50Q94 80 126 68Q102 66 84 50Z",
        sirkel(100, 108, 5),
      ],
      f: [],
    },

    // ---------- Seasons ----------
    {
      id: "snomann",
      tema: "arstider",
      s: [
        bakke(184, 10),
        stjerne(30, 40, 8, 3, 6),
        stjerne(170, 56, 7, 3, 6),
        stjerne(160, 140, 6, 2.5, 6),
        "M72 98L44 80M52 85L46 74M128 98L156 80M148 85L154 74",
        sirkel(100, 152, 38),
        sirkel(100, 98, 28),
        sirkel(100, 98 - 28 - 18, 20),
        rekt(86, 14, 28, 22, 2),
        rekt(78, 32, 44, 7, 3.5),
        poly("100 56", "120 60", "100 63"),
        "M76 76Q100 86 124 76L124 85Q100 95 76 85Z",
        rekt(108, 84, 11, 26, 3),
        sirkel(100, 102, 4),
        sirkel(100, 118, 4),
        sirkel(100, 146, 4),
      ],
      f: [sirkel(93, 49, 3), sirkel(107, 49, 3)],
    },
    {
      id: "juletre",
      tema: "arstider",
      s: [
        rekt(88, 140, 24, 24, 2),
        "M100 26L134 60H118L150 98H130L166 140H34L70 98H50L82 60H66Z",
        "M82 60Q100 70 118 60M70 98Q100 112 130 98",
        stjerne(100, 22, 15, 6.5),
        sirkel(86, 82, 6),
        sirkel(118, 84, 6),
        sirkel(76, 124, 6),
        sirkel(124, 124, 6),
        sirkel(100, 120, 6),
        rekt(122, 150, 30, 26, 2),
        "M137 150V176M122 162H152",
        "M137 150Q128 140 132 146M137 150Q146 140 142 146",
        rekt(46, 156, 26, 20, 2),
        "M59 156V176",
        bakke(186, 0),
      ],
      f: [],
    },
    {
      id: "tulipaner",
      tema: "arstider",
      s: [
        "M70 84Q72 118 84 144M100 70V144M130 84Q128 118 116 144",
        "M88 140Q62 122 66 100Q86 112 92 136Z",
        "M112 140Q138 122 134 100Q114 112 108 136Z",
        "M56 84Q54 58 62 54L70 64L78 54Q86 58 84 84Q70 94 56 84Z",
        "M86 70Q84 44 92 40L100 50L108 40Q116 44 114 70Q100 80 86 70Z",
        "M116 84Q114 58 122 54L130 64L138 54Q146 58 144 84Q130 94 116 84Z",
        rekt(54, 142, 92, 13, 4),
        poly("62 155", "138 155", "128 190", "72 190"),
        sirkel(100, 172, 9),
        sirkel(160, 30, 13),
      ],
      f: [],
    },
    {
      id: "kylling",
      tema: "arstider",
      s: [
        bakke(186, 6),
        sirkel(100, 102, 36),
        ellipse(66, 112, 10, 15),
        ellipse(134, 112, 10, 15),
        poly("94 102", "106 102", "100 112"),
        "M72 72L80 62L88 72L96 60L104 72L112 60L120 72L128 64Q124 38 100 36Q76 38 72 72Z",
        "M44 130L58 116L72 132L88 114L102 130L118 114L132 130L148 116L156 130Q156 184 100 184Q44 184 44 130Z",
        krans(30, 170, 7, 6, 6),
        krans(172, 168, 7, 6, 6),
        sirkel(30, 170, 3),
        sirkel(172, 168, 3),
      ],
      f: [sirkel(88, 92, 4), sirkel(112, 92, 4)],
    },
    {
      id: "iskrem",
      tema: "arstider",
      s: [
        poly("68 100", "132 100", "100 190"),
        "M76 122.5H124M84 145H116M92 167.5H108",
        "M84 100L104 157M116 100L96 157",
        sirkel(80, 88, 22),
        sirkel(120, 88, 22),
        sirkel(100, 58, 22),
        "M92 50L96 46M106 60L110 62M98 70L101 74M84 82L88 80M116 84L120 82",
        sirkel(100, 30, 8),
        "M100 22Q104 12 112 10",
        sirkel(168, 36, 14),
        "M168 14V8M168 64V58M146 36H140M196 36H190",
      ],
      f: [],
    },
    {
      id: "sandslott",
      tema: "arstider",
      s: [
        bakke(184, 6),
        sirkel(30, 30, 14),
        "M30 8V2M30 58V52M8 30H2M58 30H52M14 14L10 10M46 14L50 10M14 46L10 50M46 46L50 50",
        rekt(56, 110, 88, 74),
        torn(36, 76, 30, 184),
        torn(134, 76, 30, 184),
        torn(78, 50, 44, 110),
        "M100 50V28",
        poly("100 28", "118 34", "100 40"),
        "M88 184V160Q100 146 112 160V184Z",
        sirkel(51, 104, 5),
        sirkel(149, 104, 5),
        rekt(92, 70, 16, 18, 8),
        poly("164 160", "190 160", "186 188", "168 188"),
        "M164 160Q177 144 190 160",
      ],
      f: [],
    },
    {
      id: "drage",
      tema: "arstider",
      s: [
        sky(40, 40, 13),
        sky(164, 160, 12),
        poly("100 16", "142 70", "100 140", "58 70"),
        "M100 16V140M58 70H142",
        "M100 140Q88 160 104 174Q120 188 108 200",
        poly("94 152", "84 146", "84 160"),
        poly("94 152", "104 146", "104 160"),
        poly("110 176", "100 170", "100 184"),
        poly("110 176", "120 170", "120 184"),
      ],
      f: [],
    },
    {
      id: "gresskar",
      tema: "arstider",
      s: [
        bakke(184, 4),
        "M108 52Q128 34 148 48Q128 62 108 52Z",
        "M94 72Q92 52 98 44H108Q104 54 106 72Z",
        ellipse(100, 122, 66, 52),
        "M100 70Q84 122 100 174M100 70Q116 122 100 174",
        "M72.1 74.9Q52 122 72.1 169.1M127.9 74.9Q148 122 127.9 169.1",
        "M110 72Q132 74 130 88Q128 96 120 92",
        "M30 40Q40 30 50 40M150 26Q160 16 170 26",
      ],
      f: [],
    },

    // ---------- The North ----------
    {
      id: "troll",
      tema: "norden",
      s: [
        bakke(190, 4),
        "M140 176Q176 182 170 148",
        "M170 148Q160 140 166 132Q172 140 178 132Q182 142 170 148Z",
        ellipse(56, 160, 11, 20),
        ellipse(144, 160, 11, 20),
        "M64 118.4Q46 190 70 192H130Q154 190 136 118.4",
        "M84 192V170M116 192V170",
        "M52 82Q30 76 34 98Q40 112 58 104Z",
        "M148 82Q170 76 166 98Q160 112 142 104Z",
        ellipse(100, 92, 44, 46),
        "M78 52.2Q66 28 84 32Q86 14 100 26Q112 14 116 32Q134 28 122 52.2",
        sirkel(84, 80, 8),
        sirkel(116, 80, 8),
        ellipse(100, 106, 17, 20),
        "M74 128Q100 146 126 128",
        poly("106 135", "114 133", "110 143"),
      ],
      f: [sirkel(85, 82, 3.4), sirkel(117, 82, 3.4)],
    },
    {
      id: "stavkirke",
      tema: "norden",
      s: [
        bakke(188, 6),
        rekt(56, 140, 88, 48),
        "M88 188V164Q100 150 112 164V188Z",
        sirkel(70, 160, 6),
        sirkel(130, 160, 6),
        poly("44 142", "100 110", "156 142"),
        rekt(72, 96, 56, 22),
        poly("60 100", "100 74", "140 100"),
        rekt(84, 62, 32, 20),
        poly("78 64", "100 40", "122 64"),
        poly("95 42", "100 14", "105 42"),
        "M44 142Q34 134 38 124Q42 120 46 124M156 142Q166 134 162 124Q158 120 154 124",
        "M60 100Q52 92 56 86M140 100Q148 92 144 86",
      ],
      f: [],
    },
    {
      id: "vikingskip",
      tema: "norden",
      s: [
        bolger(172, 5, 8),
        rekt(97, 26, 6, 96),
        rekt(56, 40, 30, 62),
        rekt(86, 40, 28, 62),
        rekt(114, 40, 30, 62),
        "M30 120H170Q160 162 100 162Q40 162 30 120Z",
        "M162 122Q178 100 172 80Q170 70 180 70Q190 76 184 96Q178 112 170 124Z",
        "M38 122Q22 100 28 80Q30 70 20 70Q10 76 16 96Q22 112 30 124Z",
        sirkel(56, 126, 8),
        sirkel(78, 126, 8),
        sirkel(100, 126, 8),
        sirkel(122, 126, 8),
        sirkel(144, 126, 8),
      ],
      f: [sirkel(181, 78, 2)],
    },
    {
      id: "elg",
      tema: "norden",
      s: [
        bakke(186, 4),
        poly("28 118", "44 146", "36 146", "52 176", "4 176", "20 146", "12 146"),
        rekt(25, 176, 6, 10),
        poly("172 112", "188 140", "180 140", "196 170", "148 170", "164 140", "156 140"),
        rekt(169, 170, 6, 14),
        "M76 62Q52 66 36 50Q26 40 30 26L40 38L42 22L52 36L58 20L64 36L72 26Q80 44 82 58Z",
        "M124 62Q148 66 164 50Q174 40 170 26L160 38L158 22L148 36L142 20L136 36L128 26Q120 44 118 58Z",
        "M72 72Q56 62 48 72Q56 84 74 82Z",
        "M128 72Q144 62 152 72Q144 84 126 82Z",
        "M96 164Q94 180 100 188Q106 180 104 164",
        "M74 66Q100 52 126 66Q134 96 124 120Q132 150 112 164Q100 170 88 164Q68 150 76 120Q66 96 74 66Z",
        ellipse(100, 146, 22, 15),
      ],
      f: [sirkel(86, 98, 4.5), sirkel(114, 98, 4.5), ellipse(92, 146, 3, 4.5), ellipse(108, 146, 3, 4.5)],
    },
    {
      id: "nisse",
      tema: "norden",
      s: [
        poly("100 22", "142 90", "58 90"),
        sirkel(100, 20, 9),
        "M56 100Q50 150 100 186Q150 150 144 100Q122 120 100 118Q78 120 56 100Z",
        rekt(50, 86, 100, 15, 7.5),
        sirkel(76, 112, 6),
        sirkel(124, 112, 6),
        ellipse(100, 108, 12, 10),
        "M100 118Q86 130 70 120Q80 132 100 124Q120 132 130 120Q114 130 100 118Z",
        ellipse(80, 190, 14, 7),
        ellipse(120, 190, 14, 7),
        rekt(146, 150, 34, 30, 2),
        "M163 150V180M146 165H180",
        "M163 150Q152 138 156 146M163 150Q174 138 170 146",
        stjerne(30, 40, 9, 4),
        stjerne(170, 50, 7, 3),
      ],
      f: [],
    },
    {
      id: "stabbur",
      tema: "norden",
      s: [
        bakke(190, 4),
        poly("36 72", "100 28", "164 72"),
        "M100 28V72",
        rekt(56, 70, 88, 48),
        rekt(88, 80, 24, 38, 2),
        rekt(64, 84, 14, 14, 2),
        rekt(122, 84, 14, 14, 2),
        rekt(46, 116, 108, 10, 2),
        rekt(64, 126, 72, 38),
        "M64 145H136",
        rekt(70, 164, 12, 22),
        rekt(118, 164, 12, 22),
        ellipse(76, 188, 11, 5),
        ellipse(124, 188, 11, 5),
        "M150 126L176 184M162 126L188 184M155 138H167M160 150H172M166 162H178M171 174H183",
      ],
      f: [],
    },
    {
      id: "fyrtarn",
      tema: "norden",
      s: [
        "M-2 202V180Q30 170 60 176H140Q170 170 202 180V202Z",
        poly("120 48", "196 30", "196 66"),
        poly("80 48", "4 30", "4 66"),
        poly("76 70", "124 70", "136 176", "64 176"),
        "M72.6 100H127.4M69.2 130H130.8",
        rekt(68, 62, 64, 10, 2),
        rekt(80, 38, 40, 24, 3),
        rekt(88, 42, 24, 16, 2),
        poly("76 40", "100 18", "124 40"),
        "M92 176V158Q100 148 108 158V176Z",
        "M150 112Q156 106 162 112Q168 106 174 112",
      ],
      f: [],
    },
    {
      id: "hytte",
      tema: "norden",
      s: [
        sky(168, 28, 10),
        "M-2 150L40 70L82 150",
        "M70.2 127.6L118 52L174.6 141.4",
        "M28.5 92L40 70L51.5 92L46 88L40 96L34 88Z",
        "M100.3 80L118 52L135.7 80L127 74L118 84L109 74Z",
        "M-2 152Q50 146 100 152M170 152Q186 150 202 152",
        "M-2 150V152",
        rekt(148, 104, 10, 22),
        sirkel(156, 92, 5),
        sirkel(164, 79, 7),
        rekt(100, 144, 70, 40),
        poly("92 144", "135 112", "178 144"),
        rekt(127, 156, 16, 28, 2),
        rekt(106, 154, 15, 15, 2),
        "M113.5 154V169M106 161.5H121",
        rekt(150, 154, 14, 14, 2),
        poly("38 154", "50 170", "44 170", "54 186", "22 186", "32 170", "26 170"),
        rekt(35, 186, 6, 8),
      ],
      f: [],
    },

    // ---------- The sea ----------
    {
      id: "fisk",
      tema: "hav",
      s: [
        "M150 200Q140 170 152 150Q160 140 156 120Q170 140 162 160Q154 176 164 200Z",
        "M70 68Q90 40 120 72Z",
        "M136 100L178 68Q170 100 178 132Z",
        ellipse(86, 100, 56, 36),
        "M74 64.8Q60 100 74 135.2",
        sirkel(54, 90, 9),
        "M90 88Q96 94 102 88M106 100Q112 106 118 100M90 110Q96 116 102 110M120 86Q126 92 132 86",
        "M34 106Q40 108 44 104",
        sirkel(30, 58, 6),
        sirkel(22, 40, 4),
        sirkel(34, 26, 3),
      ],
      f: [sirkel(52, 90, 4)],
    },
    {
      id: "hval",
      tema: "hav",
      s: [
        bolger(170, 4, 7),
        "M76 66Q72 54 76 46",
        "M76 46Q60 30 52 42Q66 40 76 50Q86 40 100 42Q92 30 76 46Z",
        "M148 112Q166 104 168 86Q150 82 150 70Q166 72 176 82Q184 70 198 72Q190 84 178 92Q172 116 152 124Z",
        "M24 112Q24 70 76 68Q136 66 156 104Q160 116 150 126Q100 146 50 138Q24 132 24 112Z",
        "M30 124Q90 136 148 120",
        "M30 108Q40 112 50 106",
      ],
      f: [sirkel(54, 94, 4)],
    },
    {
      id: "blekksprut",
      tema: "hav",
      s: [
        arm(46, -22),
        arm(64, -12),
        arm(83, -4),
        arm(101, 4),
        arm(120, 12),
        arm(138, 22),
        "M56 102Q48 30 100 28Q152 30 144 102Q100 116 56 102Z",
        sirkel(84, 72, 11),
        sirkel(116, 72, 11),
        "M88 92Q100 100 112 92",
        sirkel(70, 50, 5),
        sirkel(128, 52, 4),
        sirkel(100, 42, 6),
        sirkel(170, 40, 6),
        sirkel(180, 22, 4),
      ],
      f: [sirkel(86, 74, 4.5), sirkel(118, 74, 4.5)],
    },
    {
      id: "krabbe",
      tema: "hav",
      s: [
        bakke(184, 6),
        "M56 128Q40 136 34 152M58 138Q46 148 44 162M144 128Q160 136 166 152M142 138Q154 148 156 162",
        "M58 110Q40 106 38 88M142 110Q160 106 162 88",
        "M38 88Q18 84 20 62Q24 48 40 50L42 66L52 58Q58 76 38 88Z",
        "M162 88Q182 84 180 62Q176 48 160 50L158 66L148 58Q142 76 162 88Z",
        "M88 92V72M112 92V72",
        sirkel(88, 66, 8),
        sirkel(112, 66, 8),
        ellipse(100, 120, 48, 30),
        "M90 126Q100 132 110 126",
        sirkel(78, 112, 4),
        sirkel(122, 112, 4),
      ],
      f: [sirkel(89, 67, 3.2), sirkel(113, 67, 3.2)],
    },
    {
      id: "sjostjerne",
      tema: "hav",
      s: [
        bakke(178, 6),
        stjerne(100, 96, 72, 30),
        "M90 104Q100 112 110 104",
        sirkel(100, 52, 5),
        sirkel(56, 82, 4),
        sirkel(144, 82, 4),
        sirkel(70, 140, 4),
        sirkel(130, 140, 4),
        "M140 192Q160 156 180 192Z",
        "M160 160V192M150 172L152 192M170 172L168 192",
        sirkel(40, 188, 10),
        "M40 188a4 4 0 0 1 4 4",
      ],
      f: [sirkel(90, 90, 4), sirkel(110, 90, 4)],
    },
    {
      id: "seilbat",
      tema: "hav",
      s: [
        bolger(166, 4, 8),
        sirkel(168, 38, 16),
        "M40 60Q46 54 52 60Q58 54 64 60",
        rekt(97, 30, 6, 100),
        poly("94 36", "94 124", "40 124"),
        poly("106 40", "106 124", "156 124"),
        poly("103 30", "120 36", "103 42"),
        "M30 130H170L150 162H50Z",
        sirkel(72, 145, 5),
        sirkel(100, 145, 5),
        sirkel(128, 145, 5),
      ],
      f: [],
    },
  ];

  const TEMAER = ["dyr", "kjoretoy", "rom", "arstider", "norden", "hav"];

  // ---------- The fill engine (no kit needed) ----------
  // The sheet is N × N pixels. A wall is a pixel under an outline; a field is a set of pixels
  // joined side by side (never across a corner, so a thin diagonal line still closes a field).

  const N = 1000;
  const SKALA = N / 200;

  // Every field gets a number; walls get -1. The pixels of each field are listed together, so
  // filling a field touches only its own pixels.
  function merk(vegg, b, h) {
    const n = b * h;
    const etikett = new Int32Array(n).fill(-1);
    const ko = new Int32Array(n);
    let antall = 0;
    for (let s = 0; s < n; s++) {
      if (vegg[s] || etikett[s] >= 0) continue;
      let hode = 0;
      let hale = 0;
      ko[hale++] = s;
      etikett[s] = antall;
      while (hode < hale) {
        const i = ko[hode++];
        const x = i % b;
        if (x > 0 && !vegg[i - 1] && etikett[i - 1] < 0) {
          etikett[i - 1] = antall;
          ko[hale++] = i - 1;
        }
        if (x < b - 1 && !vegg[i + 1] && etikett[i + 1] < 0) {
          etikett[i + 1] = antall;
          ko[hale++] = i + 1;
        }
        if (i >= b && !vegg[i - b] && etikett[i - b] < 0) {
          etikett[i - b] = antall;
          ko[hale++] = i - b;
        }
        if (i < n - b && !vegg[i + b] && etikett[i + b] < 0) {
          etikett[i + b] = antall;
          ko[hale++] = i + b;
        }
      }
      antall++;
    }
    // Group the pixels by field: start[f] … start[f + 1] in piksler.
    const start = new Int32Array(antall + 1);
    for (let i = 0; i < n; i++) if (etikett[i] >= 0) start[etikett[i] + 1]++;
    for (let f = 0; f < antall; f++) start[f + 1] += start[f];
    const piksler = new Int32Array(start[antall]);
    const pos = start.slice(0, antall);
    for (let i = 0; i < n; i++) if (etikett[i] >= 0) piksler[pos[etikett[i]]++] = i;
    return { b, h, etikett, antall, start, piksler };
  }

  // The field at (x, y); a tap on a line counts for the nearest field within r pixels.
  function feltVed(kart, x, y, r = 14) {
    const { b, h, etikett } = kart;
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= b || y >= h) return -1;
    if (etikett[y * b + x] >= 0) return etikett[y * b + x];
    let best = -1;
    let bestAvstand = Infinity;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= b || ny >= h) continue;
        const f = etikett[ny * b + nx];
        const a = dx * dx + dy * dy;
        if (f >= 0 && a < bestAvstand && a <= r * r) {
          best = f;
          bestAvstand = a;
        }
      }
    return best;
  }

  // Paint field f in an RGBA buffer.
  function fyll(data, kart, f, rgb) {
    if (f < 0 || f >= kart.antall) return 0;
    const { start, piksler } = kart;
    for (let k = start[f]; k < start[f + 1]; k++) {
      const i = piksler[k] * 4;
      data[i] = rgb[0];
      data[i + 1] = rgb[1];
      data[i + 2] = rgb[2];
      data[i + 3] = 255;
    }
    return start[f + 1] - start[f];
  }

  // ---------- Actions as short strings ----------
  // "f" + colour + x + y: fill the field at (x, y). "p" + colour + size + points: a brush stroke.
  // "c": the sheet was cleared (undoable). Coordinates 0–1023, two base-32 characters each.
  const KOORD = (n) => Math.max(0, Math.min(1023, Math.round(n))).toString(32).padStart(2, "0");
  const LES = (s, i) => parseInt(s.substr(i, 2), 32);
  const FARGEBOKSTAV = "abcdefghijklmnop";
  const Handling = {
    fyll: (farge, x, y) => "f" + FARGEBOKSTAV[farge] + KOORD(x) + KOORD(y),
    strek: (farge, storrelse, punkter) => "p" + FARGEBOKSTAV[farge] + storrelse + punkter.map(KOORD).join(""),
    tom: () => "c",
    les(op) {
      if (typeof op !== "string" || !op) return null;
      const farge = FARGEBOKSTAV.indexOf(op[1]);
      if (op === "c") return { t: "c" };
      if (op[0] === "f" && op.length === 6 && farge >= 0 && /^[0-9a-v]+$/.test(op.slice(2))) return { t: "f", farge, x: LES(op, 2), y: LES(op, 4) };
      if (op[0] === "p" && op.length >= 7 && (op.length - 3) % 4 === 0 && farge >= 0 && /[01]/.test(op[2]) && /^[0-9a-v]+$/.test(op.slice(3))) {
        const p = [];
        for (let i = 3; i < op.length; i += 2) p.push(LES(op, i));
        if (p.some((v) => !Number.isFinite(v))) return null;
        return { t: "p", farge, s: Number(op[2]), p };
      }
      return null;
    },
  };

  // Fewer points for a stroke: skip points closer than d to the last kept one.
  function tynn(punkter, d) {
    const ut = punkter.slice(0, 2);
    for (let i = 2; i < punkter.length; i += 2) {
      const lx = ut[ut.length - 2];
      const ly = ut[ut.length - 1];
      if (Math.hypot(punkter[i] - lx, punkter[i + 1] - ly) >= d || i === punkter.length - 2) ut.push(punkter[i], punkter[i + 1]);
    }
    return ut;
  }

  // The walls of a picture on a canvas (browser only): the outlines a little thinner than on
  // screen, so a fill reaches in under the visible line and leaves no white seam.
  function rasterVegg(bilde, lerret) {
    lerret.width = lerret.height = N;
    const ctx = lerret.getContext("2d", { willReadFrequently: true });
    ctx.clearRect(0, 0, N, N);
    ctx.save();
    ctx.scale(SKALA, SKALA);
    ctx.lineWidth = STREK * 0.8;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const d of bilde.s) ctx.stroke(new Path2D(d));
    for (const d of bilde.f || []) {
      const p = new Path2D(d);
      ctx.fill(p);
      ctx.stroke(p);
    }
    ctx.restore();
    const px = ctx.getImageData(0, 0, N, N).data;
    const vegg = new Uint8Array(N * N);
    for (let i = 0; i < vegg.length; i++) vegg[i] = px[i * 4 + 3] > 90 ? 1 : 0;
    lerret.width = lerret.height = 0;
    return vegg;
  }

  const Penselen = { BILDER, TEMAER, STREK, N, SKALA, merk, feltVed, fyll, Handling, tynn, rasterVegg };
  window.Penselen = Penselen;

  const R = window.Rusj;
  if (!R) return;

  // ---------- The game ----------

  const esc = R.esc;
  const DEL_URL = "https://rusj.no" + R.forside + ((R.sprak !== "nb" && window.RUSJ_SPILL && window.RUSJ_SPILL.slug) || "penselen") + "/";
  const FILNAVN = (R.sprak !== "nb" && window.RUSJ_SPILL && window.RUSJ_SPILL.slug) || "penselen";
  const BLEKK = "#1b1530";
  const FARGER = [
    [R.t("Rød"), "#e63946"],
    [R.t("Oransje"), "#ff8c1a"],
    [R.t("Gul"), "#ffd60a"],
    [R.t("Lysegrønn"), "#8bd346"],
    [R.t("Grønn"), "#2a9d55"],
    [R.t("Lyseblå"), "#6ecbff"],
    [R.t("Blå"), "#2f6fde"],
    [R.t("Lilla"), "#8e5bd8"],
    [R.t("Rosa"), "#ff7eb6"],
    [R.t("Brun"), "#8b5a2b"],
    [R.t("Fersken"), "#ffcfa3"],
    [R.t("Grå"), "#9aa0a6"],
    [R.t("Svart"), "#2b2b2b"],
    [R.t("Hvit – viskelær"), "#ffffff"],
  ];
  const RGB = FARGER.map(([, h]) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
  const PENSEL = [14, 40]; // thin and thick brush, in sheet pixels
  const MIN_AVSTAND = 4; // brush points closer than this are skipped
  const MAKS_PUNKTER = 300; // per stroke (a longer one goes on as a new stroke)
  const MAKS_BILDER = 8; // pictures remembered
  const MAKS_TEGN = 400000; // characters of actions kept in all (localStorage is small and shared)
  const MAKS_ETT = 200000; // …and in one picture
  const ZOOM = [1, 1.6, 2.4, 3.5];
  const TEMANAVN = { dyr: R.t("Dyr"), kjoretoy: R.t("Kjøretøy"), rom: R.t("Verdensrommet"), arstider: R.t("Årstider"), norden: R.t("Norden"), hav: R.t("Havet") };
  const TEMAIKON = { dyr: "🐱", kjoretoy: "🚗", rom: "🚀", arstider: "🍂", norden: "🏔️", hav: "🐟" };
  const NAVN = {
    katt: R.t("Katt"),
    hund: R.t("Hund"),
    kanin: R.t("Kanin"),
    ugle: R.t("Ugle"),
    sommerfugl: R.t("Sommerfugl"),
    skilpadde: R.t("Skilpadde"),
    snegle: R.t("Snegle"),
    love: R.t("Løve"),
    bil: R.t("Bil"),
    buss: R.t("Buss"),
    tog: R.t("Damptog"),
    traktor: R.t("Traktor"),
    fly: R.t("Fly"),
    helikopter: R.t("Helikopter"),
    brannbil: R.t("Brannbil"),
    rakett: R.t("Rakett"),
    astronaut: R.t("Astronaut"),
    planet: R.t("Planet med ring"),
    romvesen: R.t("Romvesen"),
    ufo: R.t("Flygende tallerken"),
    maane: R.t("Månen"),
    satellitt: R.t("Satellitt"),
    snomann: R.t("Snømann"),
    juletre: R.t("Juletre"),
    tulipaner: R.t("Tulipaner"),
    kylling: R.t("Påskekylling"),
    iskrem: R.t("Iskrem"),
    sandslott: R.t("Sandslott"),
    drage: R.t("Drage"),
    gresskar: R.t("Gresskar"),
    troll: R.t("Troll"),
    stavkirke: R.t("Stavkirke"),
    vikingskip: R.t("Vikingskip"),
    elg: R.t("Elg"),
    nisse: R.t("Nisse"),
    stabbur: R.t("Stabbur"),
    fyrtarn: R.t("Fyrtårn"),
    hytte: R.t("Fjellhytte"),
    fisk: R.t("Fisk"),
    hval: R.t("Hval"),
    blekksprut: R.t("Blekksprut"),
    krabbe: R.t("Krabbe"),
    sjostjerne: R.t("Sjøstjerne"),
    seilbat: R.t("Seilbåt"),
  };
  const BILDE = new Map(BILDER.map((b) => [b.id, b]));
  const navn = (id) => NAVN[id] || id;
  const VERKTOY = ["fyll", "tynn", "tykk"];
  const IKON = {
    fyll: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 11.5l7-7 7 7-7 7z"/><path d="M8 8h8"/><path d="M20 14c1.4 1.9 2 3.1 2 3.9a2 2 0 0 1-4 0c0-.8.6-2 2-3.9z" class="fylt"/></svg>',
    tynn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19c3-7 8-11 16-13" stroke-width="1.8"/></svg>',
    tykk: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 18c3-6 7-9 14-11" stroke-width="5.5"/></svg>',
    angre: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 4 3.5 9l5 5"/><path d="M3.5 9H15a5.5 5.5 0 0 1 0 11h-3.5"/></svg>',
    tom: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 7V4h4v3M6.5 7l1 13h9l1-13"/></svg>',
    ferdig: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12.5l5 5 10-11"/></svg>',
  };
  let H; // the actions, so one can call another

  // The picture's outlines as SVG: on screen over the colours (sharp at any zoom), and small in the gallery.
  const linjeSvg = (b, klasse) =>
    `<svg class="${klasse}" viewBox="0 0 200 200" aria-hidden="true" focusable="false"><path d="${b.s.join("")}" fill="none" stroke="${BLEKK}" stroke-width="${STREK}" stroke-linecap="round" stroke-linejoin="round"/>${
      b.f && b.f.length ? `<path d="${b.f.join("")}" fill="${BLEKK}" stroke="${BLEKK}" stroke-width="${STREK}" stroke-linejoin="round"/>` : ""
    }</svg>`;

  // ---------- The fields of the open picture (made once per picture) ----------
  let kart = null;
  let kartFor = "";
  function kartTil(id) {
    if (kartFor !== id) {
      kart = null;
      kart = merk(rasterVegg(BILDE.get(id), document.createElement("canvas")), N, N);
      kartFor = id;
    }
    return kart;
  }

  // ---------- Drawing the actions ----------
  function strek(ctx, h) {
    const p = h.p;
    ctx.strokeStyle = FARGER[h.farge][1];
    ctx.fillStyle = FARGER[h.farge][1];
    ctx.lineWidth = PENSEL[h.s] || PENSEL[0];
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (p.length === 2) {
      ctx.beginPath();
      ctx.arc(p[0], p[1], ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
    ctx.stroke();
  }

  // Everything from the start: fills go into one pixel buffer, strokes are drawn between them.
  function tegnAlle(ctx, ops, k) {
    ctx.clearRect(0, 0, N, N);
    let bilde = null;
    const flush = () => {
      if (bilde) ctx.putImageData(bilde, 0, 0);
      bilde = null;
    };
    for (const op of ops) {
      const h = Handling.les(op);
      if (!h) continue;
      if (h.t === "c") {
        bilde = null;
        ctx.clearRect(0, 0, N, N);
      } else if (h.t === "f") {
        if (!bilde) bilde = ctx.getImageData(0, 0, N, N);
        fyll(bilde.data, k, feltVed(k, h.x, h.y), RGB[h.farge]);
      } else {
        flush();
        strek(ctx, h);
      }
    }
    flush();
  }

  // ---------- Saved pictures ----------
  const bildet = (S) => (S.aktiv ? S.bilder[S.aktiv] : null);
  const tegn = (S) => Object.values(S.bilder).reduce((n, b) => n + b.o.reduce((m, o) => m + o.length, 0), 0);
  function rydd(S) {
    const ider = Object.keys(S.bilder).sort((a, b) => S.bilder[a].t - S.bilder[b].t);
    for (const id of ider) {
      if (Object.keys(S.bilder).length <= MAKS_BILDER && tegn(S) <= MAKS_TEGN) break;
      if (id !== S.aktiv) delete S.bilder[id];
    }
  }
  let fullMeldt = false;
  function leggTil(S, op) {
    const b = bildet(S);
    if (!b) return false;
    if (op[0] === "p" && b.o.reduce((m, o) => m + o.length, 0) + op.length > MAKS_ETT) {
      if (!fullMeldt) R.toast(R.t("Bildet er så fullt av farger at mer ikke kan lagres. Trykk «Ferdig» og lagre det!"));
      fullMeldt = true;
      return false;
    }
    b.o.push(op);
    b.t = Date.now();
    rydd(S);
    R.lagre();
    oppdaterKnapper(S);
    return true;
  }

  // ---------- The open sheet: canvas, zoom and touch ----------
  let lerret = null;
  let ctx = null;
  const zoom = { z: 1, x: 0, y: 0 };
  let flytt = false; // the hand: one finger moves the picture instead of painting
  let side = 0; // the sheet's size on screen (CSS px)

  function tilpass() {
    const flate = R.$(".pn-flate");
    const ark = R.$(".pn-ark");
    if (!flate || !ark) return;
    const w = flate.clientWidth;
    const h = flate.clientHeight;
    if (!w || !h) return;
    side = Math.max(160, Math.floor(Math.min(w, h, 720)));
    ark.style.width = side + "px";
    ark.style.height = side + "px";
    settZoom(zoom.z, zoom.x, zoom.y);
  }

  function settZoom(z, x, y) {
    zoom.z = R.klamp(z, ZOOM[0], ZOOM[ZOOM.length - 1]);
    zoom.x = R.klamp(x, side - side * zoom.z, 0);
    zoom.y = R.klamp(y, side - side * zoom.z, 0);
    if (zoom.z <= 1.01) {
      zoom.z = 1;
      zoom.x = 0;
      zoom.y = 0;
      flytt = false;
    }
    const lag = R.$(".pn-zoom");
    if (lag) lag.style.transform = `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.z})`;
    const knapper = R.$(".pn-zoomknapper");
    if (knapper) {
      knapper.querySelector('[data-v="-1"]').disabled = zoom.z <= 1;
      knapper.querySelector('[data-v="1"]').disabled = zoom.z >= ZOOM[ZOOM.length - 1];
      const hand = knapper.querySelector('[data-h="flytt"]');
      hand.hidden = zoom.z <= 1;
      hand.setAttribute("aria-pressed", String(flytt));
    }
    const ark = R.$(".pn-ark");
    if (ark) ark.classList.toggle("flytter", flytt);
  }

  // Zoom one step in or out around a point of the sheet (default: the middle).
  function zoomSteg(retning, px, py) {
    const i = ZOOM.findIndex((z) => z >= zoom.z - 0.01);
    const naa = i < 0 ? ZOOM.length - 1 : i;
    const ny = ZOOM[R.klamp(retning > 0 ? (ZOOM[naa] > zoom.z + 0.01 ? naa : naa + 1) : naa - 1, 0, ZOOM.length - 1)];
    zoomTil(ny, px == null ? side / 2 : px, py == null ? side / 2 : py);
  }
  function zoomTil(z, px, py) {
    const cx = (px - zoom.x) / zoom.z;
    const cy = (py - zoom.y) / zoom.z;
    settZoom(z, px - cx * z, py - cy * z);
  }

  // Where a finger is on the sheet, in sheet pixels (0–N), whatever the zoom.
  function punkt(e) {
    const b = lerret.getBoundingClientRect();
    return [((e.clientX - b.left) / b.width) * N, ((e.clientY - b.top) / b.height) * N];
  }

  function fyllVed(S, x, y) {
    const k = kartTil(S.aktiv);
    const f = feltVed(k, x, y);
    if (f < 0) return;
    // Already this colour: nothing to do (and nothing to undo).
    const i = k.piksler[k.start[f]];
    const px = ctx.getImageData(i % N, (i / N) | 0, 1, 1).data;
    const rgb = RGB[S.farge];
    if (px[3] === 255 && px[0] === rgb[0] && px[1] === rgb[1] && px[2] === rgb[2]) return;
    if (!leggTil(S, Handling.fyll(S.farge, x, y))) return;
    const bilde = ctx.getImageData(0, 0, N, N);
    fyll(bilde.data, k, f, rgb);
    ctx.putImageData(bilde, 0, 0);
    R.lyd.pop();
    R.vibrer(8);
  }

  function bindArk(S, rot) {
    const flate = rot.querySelector(".pn-flate");
    lerret = rot.querySelector(".pn-farge");
    if (!flate || !lerret) return;
    ctx = lerret.getContext("2d", { willReadFrequently: true });
    tegnAlle(ctx, (bildet(S) || { o: [] }).o, kartTil(S.aktiv));
    const pekere = new Map();
    let gest = null; // two fingers: { d, z, mx, my, x, y }
    let pensel = null; // the stroke being painted: { p, farge, s }
    let start = null; // the first finger: { x, y, flyttet }
    const relativ = (e) => {
      const b = flate.querySelector(".pn-ark").getBoundingClientRect();
      return [e.clientX - b.left, e.clientY - b.top];
    };
    const avbrytPensel = () => {
      if (!pensel) return;
      pensel = null;
      tegnAlle(ctx, bildet(S).o, kartTil(S.aktiv));
    };
    const ferdigPensel = () => {
      if (!pensel) return;
      const p = pensel.p;
      const op = Handling.strek(pensel.farge, pensel.s, p);
      pensel = null;
      if (!leggTil(S, op)) tegnAlle(ctx, bildet(S).o, kartTil(S.aktiv));
    };
    const ned = (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (!bildet(S)) return;
      try {
        flate.setPointerCapture(e.pointerId);
      } catch (feil) {
        /* not every pointer can be captured */
      }
      pekere.set(e.pointerId, relativ(e));
      if (pekere.size === 2) {
        avbrytPensel();
        const [a, b] = [...pekere.values()];
        gest = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, z: zoom.z, mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2, x: zoom.x, y: zoom.y };
        start = null;
        return;
      }
      if (pekere.size > 2) return;
      const [rx, ry] = relativ(e);
      start = { x: rx, y: ry, zx: zoom.x, zy: zoom.y, flyttet: false };
      if (!flytt && S.verktoy !== "fyll") {
        const [x, y] = punkt(e);
        pensel = { farge: S.farge, s: S.verktoy === "tykk" ? 1 : 0, p: [Math.round(x), Math.round(y)] };
        strek(ctx, { farge: pensel.farge, s: pensel.s, p: pensel.p });
      }
    };
    const flyttPeker = (e) => {
      if (!pekere.has(e.pointerId)) return;
      pekere.set(e.pointerId, relativ(e));
      if (gest && pekere.size >= 2) {
        const [a, b] = [...pekere.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
        const mx = (a[0] + b[0]) / 2;
        const my = (a[1] + b[1]) / 2;
        const z = R.klamp((gest.z * d) / gest.d, ZOOM[0], ZOOM[ZOOM.length - 1]);
        const cx = (gest.mx - gest.x) / gest.z;
        const cy = (gest.my - gest.y) / gest.z;
        settZoom(z, mx - cx * z, my - cy * z);
        return;
      }
      if (!start) return;
      const [rx, ry] = relativ(e);
      if (Math.hypot(rx - start.x, ry - start.y) > 9) start.flyttet = true;
      if (pensel) {
        const [x, y] = punkt(e).map(Math.round);
        const p = pensel.p;
        if (Math.hypot(x - p[p.length - 2], y - p[p.length - 1]) < MIN_AVSTAND) return;
        p.push(x, y);
        ctx.strokeStyle = FARGER[pensel.farge][1];
        ctx.lineWidth = PENSEL[pensel.s];
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(p[p.length - 4], p[p.length - 3]);
        ctx.lineTo(x, y);
        ctx.stroke();
        if (p.length / 2 >= MAKS_PUNKTER) {
          const fortsett = { farge: pensel.farge, s: pensel.s, p: [x, y] };
          ferdigPensel();
          pensel = fortsett;
        }
        return;
      }
      // Fill tool or the hand: a drag moves a zoomed picture.
      if (zoom.z > 1 && start.flyttet) settZoom(zoom.z, start.zx + rx - start.x, start.zy + ry - start.y);
    };
    const opp = (e) => {
      if (!pekere.has(e.pointerId)) return;
      pekere.delete(e.pointerId);
      if (gest) {
        if (pekere.size < 2) gest = null;
        return;
      }
      if (e.type === "pointercancel") {
        avbrytPensel();
        start = null;
        return;
      }
      if (pensel) ferdigPensel();
      else if (start && !start.flyttet && !flytt && S.verktoy === "fyll") {
        const [x, y] = punkt(e);
        fyllVed(S, x, y);
      }
      start = null;
    };
    const nei = (e) => {
      if (e.cancelable) e.preventDefault();
    };
    flate.addEventListener("pointerdown", ned);
    flate.addEventListener("pointermove", flyttPeker);
    flate.addEventListener("pointerup", opp);
    flate.addEventListener("pointercancel", opp);
    flate.addEventListener("touchmove", nei, { passive: false });
    flate.addEventListener("contextmenu", nei);
    const obs = typeof ResizeObserver === "function" ? new ResizeObserver(tilpass) : null;
    if (obs) obs.observe(flate);
    R.vedForlat(() => {
      flate.removeEventListener("pointerdown", ned);
      flate.removeEventListener("pointermove", flyttPeker);
      flate.removeEventListener("pointerup", opp);
      flate.removeEventListener("pointercancel", opp);
      flate.removeEventListener("touchmove", nei, { passive: false });
      flate.removeEventListener("contextmenu", nei);
      if (obs) obs.disconnect();
      lerret = null;
      ctx = null;
    });
  }

  // Tool and colour buttons change in place (a redraw would replay the whole picture).
  function oppdaterKnapper(S) {
    for (const k of document.querySelectorAll('[data-h="verktoy"]')) k.setAttribute("aria-pressed", String(k.dataset.v === S.verktoy && !flytt));
    for (const k of document.querySelectorAll('[data-h="farge"]')) k.setAttribute("aria-pressed", String(Number(k.dataset.v) === S.farge));
    const b = bildet(S);
    const angre = R.$('[data-h="angre"]');
    if (angre) angre.disabled = !b || !b.o.length;
    const tom = R.$('[data-h="tom"]');
    if (tom) tom.disabled = !b || !b.o.length || b.o[b.o.length - 1] === "c";
    const spill = R.$(".pn-spill");
    if (spill) spill.style.setProperty("--pn-valgt", FARGER[S.farge][1]);
  }

  // The page must not scroll or bounce under a finger while painting.
  const fastSide = (pa) => document.documentElement.classList.toggle("pn-fast", !!pa);

  // ---------- The finished picture as a PNG ----------
  let ferdigBilde = null; // { id, n (actions), url, fil }
  async function lagPng(S) {
    const id = S.aktiv;
    const b = bildet(S);
    if (!id || !b) return null;
    if (ferdigBilde && ferdigBilde.id === id && ferdigBilde.n === b.o.length) return ferdigBilde;
    const farger = document.createElement("canvas");
    farger.width = farger.height = N;
    tegnAlle(farger.getContext("2d", { willReadFrequently: true }), b.o, kartTil(id));
    const ut = document.createElement("canvas");
    ut.width = ut.height = N;
    const c = ut.getContext("2d");
    c.fillStyle = "#ffffff";
    c.fillRect(0, 0, N, N);
    c.drawImage(farger, 0, 0);
    c.save();
    c.scale(SKALA, SKALA);
    c.strokeStyle = BLEKK;
    c.fillStyle = BLEKK;
    c.lineWidth = STREK;
    c.lineCap = "round";
    c.lineJoin = "round";
    const bilde = BILDE.get(id);
    for (const d of bilde.s) c.stroke(new Path2D(d));
    for (const d of bilde.f || []) {
      const p = new Path2D(d);
      c.fill(p);
      c.stroke(p);
    }
    c.restore();
    const blob = await new Promise((ok) => ut.toBlob(ok, "image/png"));
    farger.width = farger.height = 0;
    ut.width = ut.height = 0;
    if (!blob) return null;
    if (ferdigBilde && ferdigBilde.url) URL.revokeObjectURL(ferdigBilde.url);
    const filnavn = `${FILNAVN}-${id}.png`;
    let fil = null;
    try {
      fil = new File([blob], filnavn, { type: "image/png" });
    } catch (feil) {
      fil = null;
    }
    ferdigBilde = { id, n: b.o.length, url: URL.createObjectURL(blob), fil, filnavn };
    return ferdigBilde;
  }
  const kanDeleFil = () => !!(ferdigBilde && ferdigBilde.fil && navigator.canShare && navigator.share && navigator.canShare({ files: [ferdigBilde.fil] }));

  function sistLinje(S) {
    if (!S.sist || !BILDE.has(S.sist)) return "";
    return `<p class="pn-sist">${esc(R.t("Sist: {navn}", { navn: navn(S.sist) }))}${S.ferdige > 1 ? ` · ${esc(R.t("{n} bilder ferdige|{n} bilder ferdige", { n: S.ferdige }))}` : ""}</p>`;
  }

  function apne(S, id) {
    if (!BILDE.has(id)) return;
    const ny = !S.bilder[id];
    if (ny) S.bilder[id] = { o: [], t: Date.now(), f: false };
    S.aktiv = id;
    S.bilder[id].t = Date.now();
    rydd(S);
    zoom.z = 1;
    zoom.x = 0;
    zoom.y = 0;
    flytt = false;
    fullMeldt = false;
    if (ny) R.statistikk("start", { bilde: id });
    R.gaTil("mal");
  }

  // ---------- Start ----------

  R.start({
    id: "penselen",
    versjon: 1,
    pagar: (S) => S.skjerm !== "slutt" && !!(bildet(S) && bildet(S).o.length),
    liggende: false,

    tilstand: () => ({ tema: "alle", aktiv: null, bilder: {}, farge: 0, verktoy: "fyll", ferdige: 0, sist: null }),

    lastet(S) {
      const heltall = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
      S.tema = S.tema === "alle" || TEMAER.includes(S.tema) ? S.tema : "alle";
      S.farge = heltall(S.farge, 0, FARGER.length - 1) ? S.farge : 0;
      S.verktoy = VERKTOY.includes(S.verktoy) ? S.verktoy : "fyll";
      S.ferdige = heltall(S.ferdige, 0, 1e7) ? S.ferdige : 0;
      S.sist = BILDE.has(S.sist) ? S.sist : null;
      const bilder = S.bilder && typeof S.bilder === "object" ? S.bilder : {};
      S.bilder = {};
      for (const [id, b] of Object.entries(bilder)) {
        if (!BILDE.has(id) || !b || !Array.isArray(b.o)) continue;
        S.bilder[id] = { o: b.o.filter((o) => Handling.les(o)), t: Number.isFinite(b.t) ? b.t : 0, f: !!b.f };
      }
      S.aktiv = S.aktiv && S.bilder[S.aktiv] ? S.aktiv : null;
      rydd(S);
      if ((S.skjerm === "mal" || S.skjerm === "slutt") && !S.aktiv) S.skjerm = "velg";
    },

    regler: {
      intro: R.t("Velg et bilde og fargelegg det med fingeren. Ingenting lastes opp – bildet blir på mobilen."),
      steg: [
        [R.t("Velg et bilde"), R.t("Dyr, kjøretøy, verdensrommet, årstider, Norden og havet – over 40 bilder å fargelegge.")],
        [R.t("Trykk for å fylle"), R.t("Velg en farge og trykk inni et felt, så blir hele feltet fylt. Med penselen maler du fritt – under strekene.")],
        [R.t("Lagre bildet"), R.t("Trykk «Ferdig», så kan du lagre bildet på mobilen eller dele det.")],
      ],
      tips: [
        R.t("«Angre» tar bort det siste du gjorde – også «Tøm». Den hvite fargen er et viskelær."),
        R.t("Små felt? Trykk på + for å zoome inn. Flytt bildet med to fingre eller med hånden ✋."),
        R.t("Hvert bilde huskes, så du kan fortsette senere."),
        R.t("Med tastatur: + og − zoomer, piltastene flytter bildet og Ctrl+Z angrer."),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const b = bildet(S);
          const aktiv = !!(b && b.o.length);
          return R.ui.spillhjem({
            slagordHtml: `${esc(R.t("Velg et bilde og fyll det med farger."))}<br><em>${esc(R.t("Trykk, mal – og lagre bildet."))}</em>`,
            knapperHtml: R.ui.startKnapper({
              pagar: aktiv,
              fortsettTekst: aktiv ? R.t("Fortsett · {navn}", { navn: navn(S.aktiv) }) : "",
              nyTekst: R.t("Velg et nytt bilde"),
              startTekst: R.t("Velg et bilde"),
              ekstraHtml: R.ui.lenke(R.t("Slik spiller du"), "regler") + sistLinje(S),
            }),
            merker: [
              [String(BILDER.length), R.t("bilder")],
              [String(FARGER.length), R.t("farger")],
              ["0", R.t("reklame")],
            ],
          });
        },
        inn: () => fastSide(false),
      },

      velg: {
        tittel: R.t("Fargelegging"),
        tilbake: "hjem",
        vis(S) {
          const valgte = S.tema === "alle" ? BILDER : BILDER.filter((b) => b.tema === S.tema);
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Velg et bilde"))}</h1>
            <div class="pn-temaer" role="group" aria-label="${esc(R.t("Tema"))}">
              <button class="pn-tema" data-h="tema" data-v="alle" aria-pressed="${S.tema === "alle"}">${esc(R.t("Alle"))}</button>
              ${TEMAER.map((t) => `<button class="pn-tema" data-h="tema" data-v="${t}" aria-pressed="${S.tema === t}"><span aria-hidden="true">${TEMAIKON[t]}</span> ${esc(TEMANAVN[t])}</button>`).join("")}
            </div>
            <div class="pn-galleri">${valgte
              .map((b) => {
                const lagret = S.bilder[b.id];
                const merke = lagret && lagret.f ? "✓" : lagret && lagret.o.length ? "🎨" : "";
                return `<button class="pn-bilde${S.aktiv === b.id ? " aktiv" : ""}" data-h="bilde" data-v="${b.id}">${linjeSvg(b, "pn-mini")}<span class="pn-bilde-navn">${esc(navn(b.id))}</span>${merke ? `<i class="pn-bilde-merke" aria-hidden="true">${merke}</i>` : ""}${lagret && lagret.o.length ? `<span class="vh"> – ${esc(lagret.f ? R.t("ferdig") : R.t("påbegynt"))}</span>` : ""}</button>`;
              })
              .join("")}</div>
            ${R.ui.dokk(R.ui.knapp(R.t("Overrask meg"), "overrask", { ikon: "🎲" }))}`;
        },
        inn: () => fastSide(false),
      },

      mal: {
        tittel: (S) => (S.aktiv ? navn(S.aktiv) : ""),
        tilbake: "velg",
        liggende: false,
        vis(S) {
          const b = BILDE.get(S.aktiv);
          if (!b) return `<h1 id="skjerm-tittel" class="vh">${esc(R.t("Fargelegging"))}</h1>`;
          const lagret = bildet(S) || { o: [] };
          const verktoy = (v, tekst) => `<button class="pn-knapp" data-h="verktoy" data-v="${v}" aria-pressed="${S.verktoy === v && !flytt}" data-stille>${IKON[v]}<span>${esc(tekst)}</span></button>`;
          return `
            <h1 id="skjerm-tittel" class="vh">${esc(navn(b.id))}</h1>
            <div class="pn-spill" style="--pn-valgt: ${FARGER[S.farge][1]}">
              <div class="pn-flate">
                <div class="pn-ark${flytt ? " flytter" : ""}">
                  <div class="pn-zoom">
                    <canvas class="pn-farge" width="${N}" height="${N}" role="img" aria-label="${esc(R.t("Tegningen: {navn}", { navn: navn(b.id) }))}"></canvas>
                    ${linjeSvg(b, "pn-linjer")}
                  </div>
                </div>
                <div class="pn-zoomknapper" role="group" aria-label="${esc(R.t("Zoom"))}">
                  <button data-h="zoom" data-v="1" aria-label="${esc(R.t("Zoom inn"))}" data-stille>+</button>
                  <button data-h="zoom" data-v="-1" aria-label="${esc(R.t("Zoom ut"))}" data-stille disabled>−</button>
                  <button data-h="flytt" aria-label="${esc(R.t("Flytt bildet"))}" aria-pressed="false" data-stille hidden><span aria-hidden="true">✋</span></button>
                </div>
              </div>
              ${R.ui.dokk(`<div class="pn-styring">
                <div class="pn-verktoy" role="group" aria-label="${esc(R.t("Verktøy"))}">
                  ${verktoy("fyll", R.t("Fyll"))}${verktoy("tynn", R.t("Tynn"))}${verktoy("tykk", R.t("Tykk"))}
                  <button class="pn-knapp" data-h="angre" data-stille${lagret.o.length ? "" : " disabled"}>${IKON.angre}<span>${esc(R.t("Angre"))}</span></button>
                  <button class="pn-knapp" data-h="tom" data-stille${lagret.o.length && lagret.o[lagret.o.length - 1] !== "c" ? "" : " disabled"}>${IKON.tom}<span>${esc(R.t("Tøm"))}</span></button>
                  <button class="pn-knapp pn-ferdig" data-h="ferdig">${IKON.ferdig}<span>${esc(R.t("Ferdig"))}</span></button>
                </div>
                <div class="pn-palett" role="group" aria-label="${esc(R.t("Farger"))}">
                  ${FARGER.map(([fn, hex], i) => `<button class="pn-fargeknapp" data-h="farge" data-v="${i}" style="--f: ${hex}" aria-label="${esc(fn)}" aria-pressed="${S.farge === i}" data-stille></button>`).join("")}
                </div>
              </div>`)}
            </div>`;
        },
        etter(S, rot) {
          tilpass();
          bindArk(S, rot);
          oppdaterKnapper(S);
        },
        inn(S) {
          if (!bildet(S)) return R.gaTil("velg");
          fastSide(true);
          R.holdVaken();
        },
        ut() {
          fastSide(false);
          R.slippVaken();
        },
      },

      slutt: {
        tittel: (S) => (S.aktiv ? navn(S.aktiv) : ""),
        tilbake: "mal",
        vis(S) {
          const id = S.aktiv;
          const klar = ferdigBilde && ferdigBilde.id === id && bildet(S) && ferdigBilde.n === bildet(S).o.length;
          return `
            ${R.ui.banner({ etikett: navn(id), tittel: R.t("Så fint!"), tekst: R.t("Bildet er ferdig. Lagre det på mobilen, eller vis det fram!"), klasse: "aksent" })}
            <div class="pn-resultat">${klar ? `<img src="${ferdigBilde.url}" alt="${esc(R.t("Bildet ditt: {navn}", { navn: navn(id) }))}">` : `<p class="pn-lager">${esc(R.t("Lager bildet …"))}</p>`}</div>
            <div class="knapprad">
              ${R.ui.knapp2(R.t("Lagre bildet"), "last-ned", { ikon: "⬇️", av: !klar })}
              ${R.ui.knapp2(R.t("Del"), "del", { ikon: "📤", av: !klar })}
            </div>
            <p class="hjelp">${esc(R.t("Bildet lages her på mobilen og sendes ingen steder før du deler det selv."))}</p>
            ${R.ui.flereSpill({ antall: 1 })}
            ${R.ui.dokk(R.ui.knapp(R.t("Nytt bilde"), "nytt"), R.ui.lenkerad(R.ui.lenke(R.t("Fargelegg mer"), "mer"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
        },
        async inn(S) {
          if (!bildet(S)) return R.gaTil("velg");
          const fortsatt = R.vakt();
          const b = bildet(S);
          if (!b.vist) {
            R.lyd.fanfare();
            R.vibrer([40, 60, 120]);
            R.konfetti();
          }
          b.vist = true;
          try {
            await lagPng(S);
          } catch (feil) {
            if (fortsatt()) R.toast(R.t("Klarte ikke å lage bildet"));
            return;
          }
          if (fortsatt()) R.vis();
        },
      },
    },

    handlinger: (H = {
      nytt() {
        R.gaTil("velg");
      },
      fortsett(el, e, S) {
        R.gaTil(bildet(S) ? "mal" : "velg");
      },
      tema(el, e, S) {
        const v = el.dataset.v;
        S.tema = v === "alle" || TEMAER.includes(v) ? v : "alle";
        R.vis();
      },
      bilde(el, e, S) {
        apne(S, el.dataset.v);
      },
      overrask(el, e, S) {
        const valgte = (S.tema === "alle" ? BILDER : BILDER.filter((b) => b.tema === S.tema)).filter((b) => b.id !== S.aktiv);
        apne(S, R.velg(valgte).id);
      },
      verktoy(el, e, S) {
        if (VERKTOY.includes(el.dataset.v)) S.verktoy = el.dataset.v;
        flytt = false;
        settZoom(zoom.z, zoom.x, zoom.y);
        R.lyd.klikk();
        R.lagre();
        oppdaterKnapper(S);
      },
      farge(el, e, S) {
        const i = Number(el.dataset.v);
        if (!Number.isInteger(i) || i < 0 || i >= FARGER.length) return;
        S.farge = i;
        if (flytt) {
          flytt = false;
          settZoom(zoom.z, zoom.x, zoom.y);
        }
        R.lyd.tone(520 + i * 30, 0, 0.06, "sine", 0.04);
        R.lagre();
        oppdaterKnapper(S);
        R.si(FARGER[i][0]);
      },
      zoom(el, e, S) {
        zoomSteg(Number(el.dataset.v));
        R.lyd.klikk();
        oppdaterKnapper(S);
      },
      flytt(el, e, S) {
        flytt = !flytt && zoom.z > 1;
        settZoom(zoom.z, zoom.x, zoom.y);
        oppdaterKnapper(S);
      },
      angre(el, e, S) {
        const b = bildet(S);
        if (!b || !b.o.length || !ctx) return;
        b.o.pop();
        b.t = Date.now();
        fullMeldt = false;
        tegnAlle(ctx, b.o, kartTil(S.aktiv));
        R.lyd.sveip();
        R.lagre();
        oppdaterKnapper(S);
      },
      tom(el, e, S) {
        const b = bildet(S);
        if (!b || !b.o.length || b.o[b.o.length - 1] === "c" || !ctx) return;
        if (!leggTil(S, Handling.tom())) return;
        ctx.clearRect(0, 0, N, N);
        R.lyd.sveip();
        R.toast(R.t("Tømt! «Angre» henter fargene tilbake."));
      },
      ferdig(el, e, S) {
        const b = bildet(S);
        if (!b) return;
        if (!b.o.length) return R.toast(R.t("Fargelegg litt først!"));
        const forste = !b.f;
        b.f = true;
        b.vist = false;
        S.sist = S.aktiv;
        if (forste) S.ferdige = (S.ferdige || 0) + 1;
        R.merke("penselen-ferdig");
        R.statistikk("ferdig", { bilde: S.aktiv, handlinger: b.o.length });
        R.gaTil("slutt");
      },
      mer() {
        R.gaTil("mal");
      },
      "last-ned"(el, e, S) {
        if (!ferdigBilde || ferdigBilde.id !== S.aktiv) return;
        const a = document.createElement("a");
        a.href = ferdigBilde.url;
        a.download = ferdigBilde.filnavn;
        document.body.appendChild(a);
        a.click();
        a.remove();
        R.toast(R.t("Bildet er lastet ned"));
      },
      async del(el, e, S) {
        if (!ferdigBilde || ferdigBilde.id !== S.aktiv) return;
        const tekst = R.t("Se hva jeg har fargelagt! 🎨");
        if (kanDeleFil()) {
          const fortsatt = R.vakt();
          try {
            await navigator.share({ files: [ferdigBilde.fil], title: R.app.navn, text: tekst });
          } catch (feil) {
            if (fortsatt() && (!feil || feil.name !== "AbortError")) H["last-ned"](el, e, S);
          }
          return;
        }
        R.del(R.app.navn, tekst, DEL_URL, { kort: { tittel: R.app.navn, linjer: [navn(S.aktiv), R.t("Fargelagt på rusj.no")] } });
      },
    }),
  });

  // Keyboard on the sheet: + and − zoom, the arrows move a zoomed picture, Ctrl+Z undoes.
  document.addEventListener("keydown", (e) => {
    const S = R.S;
    if (!S || S.skjerm !== "mal" || R.arkApent() || e.altKey) return;
    const m = e.target;
    if (m && m.closest && m.closest("input, textarea")) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      return H.angre(null, e, S);
    }
    if (e.ctrlKey || e.metaKey) return;
    if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      zoomSteg(1);
    } else if (e.key === "-") {
      e.preventDefault();
      zoomSteg(-1);
    } else if (zoom.z > 1 && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
      e.preventDefault();
      const d = side / 5;
      settZoom(zoom.z, zoom.x + (e.key === "ArrowLeft" ? d : e.key === "ArrowRight" ? -d : 0), zoom.y + (e.key === "ArrowUp" ? d : e.key === "ArrowDown" ? -d : 0));
    }
  });
  window.addEventListener("resize", () => {
    if (R.S && R.S.skjerm === "mal") tilpass();
  });
})();
