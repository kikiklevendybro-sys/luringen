    // Ekornet: a round squirrel-orange head with tufted ears, a big bushy tail curling up behind it
    // on the right, a cream muzzle with a dark nose and two front teeth, and an acorn held up at
    // the lower left – stocking up for winter.
    ekornet: {
      farge: "#f0954a",
      tegn: (f) => `
        ${form("M80 110C120 104 128 58 117 28C109 6 86 2 81 20C77 34 99 38 103 56C107 76 94 94 80 110Z", "#c96a2c", 4.5)}
        ${strek("M110 30C117 44 118 62 112 78", 4, "rgba(255,241,221,.55)")}
        ${form("M20 38L22 6L46 24Z", f, 4.5)}
        ${form("M100 38L98 6L74 24Z", f, 4.5)}
        ${strek("M22 6L17 -3M22 6L25 -4M98 6L95 -4M98 6L103 -3", 3)}
        ${hode(f)}
        ${form("M30 33L30 18L41 26Z", "#ffb98a", 0)}
        ${form("M90 33L90 18L79 26Z", "#ffb98a", 0)}
        <ellipse cx="60" cy="84" rx="23" ry="17" fill="#ffe3c2"/>
        ${kinn(78)}
        ${oyne({ y: 56, dx: 2, dy: -2 })}
        <ellipse cx="60" cy="75" rx="6.5" ry="4.5" fill="${B}"/>
        ${strek("M50 83Q60 90 70 83", 4)}
        ${form("M55 86H65V96H55Z", P, 3)}
        ${strek("M60 86V96", 2)}
        <g transform="rotate(-18 16 98)">
          ${form("M5 99C6 110 12 116 17 117C22 116 28 110 29 99Z", "#f29b45", 3.5)}
          ${form("M3 99C3 91 9 87 17 87C25 87 31 91 31 99C24 101 10 101 3 99Z", "#9a6532", 3.5)}
          ${strek("M17 87C17 84 18 82 21 81", 3)}
        </g>`,
    },
// alias: ["#f0954a", "E"]
