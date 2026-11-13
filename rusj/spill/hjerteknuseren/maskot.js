// alias: ["#ff6f91", "H"]
    // Hjerteknuseren: a rosy heartbreaker with a sly grin and one raised brow, holding a heart that
    // has cracked in two – with spar dame tucked behind its ear.
    hjerteknuseren: {
      farge: "#ff6f91",
      tegn: (f) => `
        <g transform="rotate(16 102 26)">
          <rect x="89" y="4" width="26" height="36" rx="4" fill="${P}" stroke="${B}" stroke-width="3.5"/>
          ${tekst(102, 20, "Q", 13)}
          ${spar(102, 30, 5)}
        </g>
        ${hode(f)}
        ${kinn(80)}
        ${oyne({ y: 58, dx: -3, dy: 1 })}
        ${strek("M28 42 Q40 38 52 43M68 38 Q80 28 92 33", 5)}
        ${strek("M44 85 Q60 97 77 82", 5)}
        <g transform="rotate(-14 20 100)">
          <path d="M20 116 C-5 99 -1 82 10 81 C15 81 18 84 20 88 C22 84 25 81 30 81 C41 82 45 99 20 116Z" fill="${ROD}" stroke="${B}" stroke-width="4" stroke-linejoin="round"/>
          ${strek("M20 88 L15 96 L23 101 L17 110", 3.2)}
          ${glans("M10 88 Q8 92 10 96", 3)}
        </g>
        ${glimt(108, 52, 5)}`,
    },
