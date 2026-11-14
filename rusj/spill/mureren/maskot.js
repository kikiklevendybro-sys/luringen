// alias: ["#e2704f", "M"]
    // Mureren: a brick-red bricklayer with a faint brick pattern on its lower face, a yellow hard
    // hat, and a domino held like a brick in one hand – laying it on the wall.
    mureren: {
      farge: "#e2704f",
      tegn: (f) => `
        ${hode(f)}
        ${strek("M17 80 H103M28 98 H92M40 80 V98M80 80 V98M60 98 V110", 2.5, "rgba(255,241,221,.45)")}
        <g transform="rotate(-18 100 92)">
          <rect x="84" y="70" width="34" height="18" rx="4" fill="${P}" stroke="${B}" stroke-width="3.5"/>
          ${strek("M101 72 V86", 2.2)}
          <circle cx="92.5" cy="79" r="2.4" fill="${B}"/>
          <circle cx="106" cy="75.5" r="2.2" fill="${B}"/>
          <circle cx="113" cy="82.5" r="2.2" fill="${B}"/>
        </g>
        ${form("M16 44 Q18 8 60 8 Q102 8 104 44Z", LAMPE, 5)}
        ${form("M8 44 H112 Q114 52 106 52 H14 Q6 52 8 44Z", LAMPE, 4.5)}
        ${strek("M60 10 V44", 4, "rgba(23,14,43,.35)")}
        ${glans("M32 20 Q40 14 50 13", 4.5)}
        ${kinn(76)}
        ${oyne({ y: 64, r: 10.5, dx: 3, dy: 0 })}
        ${smil(80, 12)}`,
    },
