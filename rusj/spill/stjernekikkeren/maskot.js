    // Stjernekikkeren: a round periwinkle head squinting through a brass telescope, one big eye open
    // to the sky and two little stars twinkling above.
    stjernekikkeren: {
      farge: "#7d8cff",
      tegn: (f) => `
        ${hode(f)}
        ${kinn(82)}
        ${blunk(56, `<circle cx="40" cy="56" r="12" fill="${P}" stroke="${B}" stroke-width="4.5"/><circle cx="43" cy="52.5" r="5.5" fill="${B}"/><circle cx="41" cy="50.3" r="1.7" fill="${P}"/>`)}
        ${strek("M67 58 Q79 51 91 58", 5)}
        ${smil(88, 13)}
        ${form("M74.9 53.2 L106.9 19.2 L117.1 28.8 L85.1 62.8Z", MESSING, 4.5)}
        ${form("M99 24.6 L105.5 17.8 L118.6 30.2 L112.2 37Z", METALL, 4)}
        ${glans("M84 50 L102 31", 3)}
        ${glimt(22, 14, 9)}
        ${glimt(46, -3, 6, P)}`,
    },
// alias: ["#7d8cff", "S"]
