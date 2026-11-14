// alias: ["#7fa8ff", "M"]
    // Makkeren: a round, cornflower-blue card player giving a high five with one hand and holding up a
    // fan of three cards with the other – a winking eye: «you and me this round».
    makkeren: {
      farge: "#7fa8ff",
      tegn: (f) => `
        <g transform="rotate(-14 16 96)">
          <rect x="4" y="74" width="20" height="28" rx="3" fill="${P}" stroke="${B}" stroke-width="3"/>
          <rect x="12" y="72" width="20" height="28" rx="3" fill="${P}" stroke="${B}" stroke-width="3"/>
          <rect x="20" y="70" width="20" height="28" rx="3" fill="${P}" stroke="${B}" stroke-width="3"/>
          <path d="M30 78 L34 84 L30 90 L26 84Z" fill="#dc2440"/>
        </g>
        ${hode(f)}
        ${form("M100 46 Q116 34 118 16 Q112 10 104 14 Q102 28 92 36Z", f, 4)}
        ${strek("M108 14 L106 6M114 18 L118 10", 3)}
        ${kinn(80)}
        ${oyne({ y: 58, r: 11.5, pr: 5.5, dx: -2 })}
        ${strek("M72 58 Q80 52 88 58", 5)}
        ${smil(86, 15)}`,
    },
