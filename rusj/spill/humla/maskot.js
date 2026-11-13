    // Humla: a round bumblebee — two antennae with knobs, see-through wings on the sides, a dark
    // fuzzy stripe over the forehead and a pink flower held up at the chin (the game's letter flower).
    humla: {
      farge: "#ffb53d",
      tegn: (f) => `
        ${strek("M47 22 Q42 8 32 4", 4.5)}${strek("M73 22 Q78 8 88 4", 4.5)}
        <circle cx="31" cy="4" r="6" fill="${B}"/><circle cx="89" cy="4" r="6" fill="${B}"/>
        <ellipse cx="16" cy="44" rx="18" ry="11" fill="#dff3ff" stroke="${B}" stroke-width="4" transform="rotate(-28 16 44)"/>
        <ellipse cx="104" cy="44" rx="18" ry="11" fill="#dff3ff" stroke="${B}" stroke-width="4" transform="rotate(28 104 44)"/>
        ${glans("M9 40 Q14 36 21 37", 3)}${glans("M99 37 Q106 36 111 40", 3)}
        ${hode(f)}
        <path d="M23 36 Q60 12 97 36 L102 45 Q60 22 18 45Z" fill="${B}"/>
        ${oyne({ y: 62, r: 12, pr: 5.6, dx: 1, dy: 1 })}
        ${kinn(82)}
        ${smil(88, 12)}
        <g transform="translate(60 106)">
          ${[0, 72, 144, 216, 288].map((v) => `<ellipse cx="0" cy="-8" rx="6" ry="8.5" fill="${P}" stroke="${B}" stroke-width="3" transform="rotate(${v})"/>`).join("")}
          <circle r="6" fill="${ROSA}" stroke="${B}" stroke-width="3"/>
        </g>`,
    },
// alias: ["#ffb53d", "H"]
