// alias: ["#5fd0ff", "M"]
    // Murbrekkeren: a sky-blue wall-breaker in a yellow hard hat, eyes on the ball it just sent off,
    // with two bricks tumbling out of the wall beside it.
    murbrekkeren: {
      farge: "#5fd0ff",
      tegn: (f) => `
        ${hode(f)}
        ${form("M19 48 Q20 8 60 6 Q100 8 101 48Z", LAMPE, 4.5)}
        ${glans("M36 22 Q46 14 58 13", 4)}
        ${strek("M60 9 V46", 4)}
        ${form("M8 46 H112 Q115 55 106 56 H14 Q5 55 8 46Z", LAMPE, 4.5)}
        ${oyne({ y: 70, r: 11, dx: 3, dy: -3 })}
        ${strek("M30 59 Q39 55 49 58M71 58 Q81 55 90 59", 4.5)}
        ${smil(92, 12)}
        ${rodme(86)}
        <g transform="rotate(-18 104 14)"><rect x="92" y="6" width="24" height="13" rx="3" fill="${ROSA}" stroke="${B}" stroke-width="3.5"/></g>
        <g transform="rotate(24 10 98)"><rect x="-2" y="92" width="22" height="12" rx="3" fill="#ff8a3d" stroke="${B}" stroke-width="3.5"/></g>
        <circle cx="112" cy="88" r="8" fill="${P}" stroke="${B}" stroke-width="3.5"/>
        ${strek("M100 98 L94 104M104 101 L101 108", 2.5, P)}
        ${glimt(2, 18, 6)}`,
    },
