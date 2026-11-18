    // Steinfjeset: a grey moai-like stone head – long ears, a flat top, a heavy brow over
    // half-closed eyes, a long nose and pressed lips – that is barely holding it together: one
    // corner of the mouth curls up, one cheek blushes and a tiny tear of laughter sits in the eye.
    steinfjeset: {
      farge: "#a7b6c6",
      tegn: (f) => `
        ${form("M27 50 Q15 52 16 68 Q17 86 28 88Z", f, 4.5)}${form("M93 50 Q105 52 104 68 Q103 86 92 88Z", f, 4.5)}
        ${strek("M23 60 Q20 68 23 78M97 60 Q100 68 97 78", 3, "rgba(23,14,43,.35)")}
        ${form("M28 114 L25 30 Q26 11 60 10 Q94 11 95 30 L92 114Z", f, 5)}
        <path d="M82 15 Q93 19 93 32 L89.5 111 L82 111 L85 34 Q85 22 82 15Z" fill="rgba(23,14,43,.12)"/>
        ${strek("M38 17 L44 24 L40 31M84 96 L79 102 L82 108", 2.6, "rgba(23,14,43,.45)")}
        ${strek("M31 50 Q43 42 55 48M65 48 Q77 42 89 50", 7)}
        ${oyne({ y: 62, x1: 44, x2: 76, r: 9, pr: 4.3, dx: 1, dy: 1.5 })}
        ${form("M34.5 62 Q44 50 53.5 62Z", f, 3.5)}${form("M66.5 62 Q76 50 85.5 62Z", f, 3.5)}
        <path d="M88 66 Q91.5 71.5 88 74 Q84.5 71.5 88 66Z" fill="${HIMMEL}" stroke="${B}" stroke-width="2"/>
        ${strek("M60 60 L55 84 Q60 89 67 84", 4.5)}
        <ellipse cx="84" cy="86" rx="6.5" ry="4" fill="${KINN}"/>
        ${strek("M43 97 H69", 5.5)}${strek("M69 97 Q75 97 77 91", 4.5)}
        ${strek("M46 107 Q60 111 74 107", 3, "rgba(23,14,43,.35)")}`,
    },
// alias: ["#a7b6c6", "S"]
