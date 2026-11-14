// alias: ["#ffb547", "S"]
    // Skattejegeren: an amber treasure hunter in a red explorer's bandana with white dots and a
    // knot at the side, a big grin – and a rolled-out treasure map with a dotted path to a red X.
    skattejegeren: {
      farge: "#ffb547",
      tegn: (f) => `
        ${hode(f)}
        ${form("M13 54 Q12 16 60 13 Q108 16 107 54 Q86 40 60 40 Q34 40 13 54Z", ROD, 5)}
        <circle cx="34" cy="31" r="3.4" fill="${P}"/><circle cx="58" cy="24" r="3.4" fill="${P}"/><circle cx="82" cy="27" r="3.4" fill="${P}"/><circle cx="46" cy="40" r="2.6" fill="${P}" opacity=".9"/><circle cx="72" cy="38" r="2.6" fill="${P}" opacity=".9"/>
        ${form("M104 36 L121 24 L119 44Z", ROD, 4)}${form("M104 40 L119 56 L101 54Z", ROD, 4)}
        <circle cx="105" cy="40" r="5.5" fill="${ROD}" stroke="${B}" stroke-width="4"/>
        ${kinn(80)}
        ${oyne({ y: 62, r: 11.5, pr: 5.4, dx: 1.5, dy: 1 })}
        ${strek("M38 84 Q52 100 68 90", 5)}
        ${form("M70 92 L116 86 L120 112 L74 117Z", "#f6e3b4", 4)}
        ${form("M68 90 Q63 98 70 100 L76 117 Q67 119 67 111Z", "#e8cf98", 3.4)}
        ${strek("M82 110 Q88 98 96 105 Q101 110 105 100", 2.6, "#b07a2a")}
        ${strek("M104 93 L112 101M112 93 L104 101", 4, ROD)}`,
    },
