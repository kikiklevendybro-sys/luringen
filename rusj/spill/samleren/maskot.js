// alias: ["#4fb8f0", "S"]
    // Samleren: a sky-blue collector with a brass monocle on a chain, proudly holding up a run –
    // hjerter sju, åtte and ni in a neat fan.
    samleren: {
      farge: "#4fb8f0",
      tegn: (f) => `
        ${hode(f)}
        ${kinn(82)}
        ${oyne({ y: 58, dx: 2, dy: -1 })}
        <circle cx="80" cy="58" r="16.5" fill="none" stroke="${MESSING}" stroke-width="4"/>
        ${strek("M95 64 Q104 80 97 98", 2.5, MESSING)}
        ${strek("M28 40 Q40 33 52 39M68 37 Q80 30 92 35", 5)}
        ${smil(88, 12)}
        ${vifte(30, 126, [
          [-26, tekst(30, 99, "7", 11, ROD) + hjerte(30, 110, 4.5)],
          [-6, tekst(30, 99, "8", 11, ROD) + hjerte(30, 110, 4.5)],
          [14, tekst(30, 99, "9", 11, ROD) + hjerte(30, 110, 4.5)],
        ])}
        ${glimt(106, 18, 7)}
        ${glimt(14, 30, 4.5)}`,
    },
