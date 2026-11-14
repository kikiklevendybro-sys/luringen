// alias: ["#ffa552", "21"]
    // Telleren: an orange counter with round glasses and a pencil behind the ear, holding up a
    // little blackboard with «21» on it – and a tally of chalk strokes for the rules.
    telleren: {
      farge: "#ffa552",
      tegn: (f) => `
        ${hode(f)}
        <g transform="rotate(28 100 30)">${form("M92 10 H108 V48 L100 58 L92 48Z", LAMPE, 3.5)}${form("M92 10 H108 V16 H92Z", ROSA, 3)}</g>
        ${kinn(80)}
        ${oyne({ y: 54, r: 11, dx: 1, dy: -1, pr: 5 })}
        <circle cx="40" cy="54" r="15" fill="none" stroke="${B}" stroke-width="4"/><circle cx="80" cy="54" r="15" fill="none" stroke="${B}" stroke-width="4"/>
        ${strek("M55 52 Q60 48 65 52", 4)}
        ${smil(70, 10)}
        ${form("M26 86 H94 V118 H26Z", "#2f5d4e", 4.5)}
        ${tekst(60, 112, "21", 24, P)}
        ${strek("M32 92 V100M36 92 V100M40 92 V100M44 92 V100M30 98 L46 94", 2, "rgba(255,241,221,.75)")}`,
    },
