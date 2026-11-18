    // Hviskeleken: two heads close together. The mint one in front whispers behind a cupped hand
    // with a sly look; the yellow one behind listens wide-eyed with a pencil behind the ear –
    // what was whispered is about to be drawn (and go wrong).
    hviskeleken: {
      farge: "#5ccfb0",
      tegn: (f) => `
        ${pinne("M84 40 L114 6.5", LAMPE, 9)}
        ${form("M117.4 9.5 L110.6 3.5 L120.7 -1Z", "#f2c38f", 3)}
        ${form("M119.5 2.8 L117.1 0.6 L120.7 -1Z", B, 1.5)}
        <circle cx="88" cy="64" r="34" fill="${LAMPE}" stroke="${B}" stroke-width="5"/>
        <ellipse cx="73" cy="73" rx="6" ry="4" fill="${KINN}"/><ellipse cx="107" cy="73" rx="6" ry="4" fill="${KINN}"/>
        ${blunk(58, `<circle cx="78" cy="58" r="9.5" fill="${P}" stroke="${B}" stroke-width="4.5"/><circle cx="100" cy="58" r="9.5" fill="${P}" stroke="${B}" stroke-width="4.5"/><circle cx="74.5" cy="58" r="4.4" fill="${B}"/><circle cx="96.5" cy="58" r="4.4" fill="${B}"/><circle cx="73" cy="56.4" r="1.4" fill="${P}"/><circle cx="95" cy="56.4" r="1.4" fill="${P}"/>`, 89)}
        ${strek("M70 43 Q78 38 86 42M92 42 Q100 38 108 43", 4.5)}
        <ellipse cx="92" cy="81" rx="5" ry="6.5" fill="${B}"/>
        <circle cx="36" cy="72" r="36" fill="${f}" stroke="${B}" stroke-width="5"/>
        ${rodme(82, 16, 56, 6, 4)}
        ${blunk(64, `<circle cx="24" cy="64" r="8.5" fill="${P}" stroke="${B}" stroke-width="4.5"/><circle cx="48" cy="64" r="8.5" fill="${P}" stroke="${B}" stroke-width="4.5"/><circle cx="27.5" cy="66" r="4" fill="${B}"/><circle cx="51.5" cy="66" r="4" fill="${B}"/>${form("M15 63 Q24 52 33 63Z", f, 4)}${form("M39 63 Q48 52 57 63Z", f, 4)}`, 36)}
        ${strek("M28 90 Q40 97 50 87", 5)}
        ${form("M52 104 Q54 84 65 76 Q73 72 72 83 Q70 95 60 106Z", f, 4.5)}
        ${strek("M60 31 q5 -4 0 -9M66 35 q10 -8 0 -17", 3.6, P)}`,
    },
// alias: ["#5ccfb0", "H"]
