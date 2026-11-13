    // Snekkeren: a round sky-blue head with a flat red carpenter's pencil tucked behind the ear, a
    // cheerful look and rosy cheeks, and a yellow folding ruler leaning at the side.
    snekkeren: {
      farge: "#8fd3ff",
      tegn: (f) => `
        ${hode(f)}
        <g transform="rotate(-32 94 24)">
          ${form("M68 18 H104 L116 24 L104 30 H68Z", ROD, 3.5)}
          <path d="M108.5 21.4 L116 24 L108.5 26.6Z" fill="${B}"/>
          ${strek("M74 24 H100", 2, "rgba(23,14,43,.35)")}
        </g>
        ${rodme(80)}
        ${oyne({ y: 60, dx: -2, dy: 1 })}
        ${smil(88, 14)}
        <g transform="rotate(-58 12 112)">
          ${form("M-6 106 H30 V116 H-6Z", LAMPE, 3)}
          ${strek("M2 106 V110M10 106 V111M18 106 V110M26 106 V111", 1.6, B)}
        </g>`,
    },
// alias: ["#8fd3ff", "S"]
