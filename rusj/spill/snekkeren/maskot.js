    // Snekkeren: a round sky-blue head with a flat red carpenter's pencil tucked behind the ear, a
    // yellow folding ruler zig-zagging up beside the chin, a cheerful look and rosy cheeks.
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
        <g transform="rotate(-20 14 104)">
          ${form("M2 98 H30 V108 H2Z", LAMPE, 3)}
          ${strek("M9 98 V102M16 98 V103M23 98 V102", 1.6, B)}
        </g>
        <g transform="rotate(38 26 96)">
          ${form("M22 70 H50 V80 H22Z", LAMPE, 3)}
          ${strek("M29 70 V74M36 70 V75M43 70 V74", 1.6, B)}
        </g>`,
    },
// alias: ["#8fd3ff", "S"]
