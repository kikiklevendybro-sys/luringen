// alias: ["#ffb27a", "F"]
    // Fortelleren: a warm peach face in a cosy striped scarf, kind eyes looking up at the listener
    // and a gentle smile – with a big speech bubble holding a heart and a small yellow one with
    // three dots: one tells, one listens.
    fortelleren: {
      farge: "#ffb27a",
      tegn: (f) => `
        ${hode(f)}
        ${kinn(80)}
        ${oyne({ y: 60, r: 11.5, pr: 5.4, dx: -1.5, dy: -1.5 })}
        ${strek("M29 42 Q39 37 50 41M70 41 Q81 37 91 42", 4.2)}
        ${strek("M47 82 Q60 93 73 82", 5)}
        ${form("M15 89 Q60 108 105 89 L107 102 Q60 122 13 102Z", MYNT, 4.2)}
        ${strek("M31 97 L30 108M50 102 L50 113M70 102 L70 113M89 97 L90 108", 3.4, "#1a9a74")}
        ${form("M22 100 L35 105 L32 117 L18 114Z", MYNT, 3.8)}
        ${strek("M20 117 L19 121M25 118 L24 122M30 119 L29 122", 2.6)}
        ${form("M82 4 H110 Q117 4 117 11 V28 Q117 35 110 35 H98 L88 44 L90 35 H82 Q75 35 75 28 V11 Q75 4 82 4Z", P, 3.6)}
        ${hjerte(96, 20.5, 7.5, ROSA)}
        ${form("M10 14 H26 Q33 14 33 21 Q33 28 26 28 H17 L10 35 L11 28 H10 Q3 28 3 21 Q3 14 10 14Z", LAMPE, 3.2)}
        <circle cx="11" cy="21" r="2.2" fill="${B}"/><circle cx="18" cy="21" r="2.2" fill="${B}"/><circle cx="25" cy="21" r="2.2" fill="${B}"/>`,
    },
