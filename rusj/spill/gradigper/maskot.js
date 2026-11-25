    // Grådigper: a hamster with both cheeks stuffed full and two number cards in its paw –
    // looking up at the pile for just one more.
    gradigper: {
      farge: "#ffa94d",
      tegn: (f) => `
        ${form("M25 32 Q11 5 35 9 Q47 14 46 30Z", f)}
        ${form("M95 32 Q109 5 85 9 Q73 14 74 30Z", f)}
        <path d="M28 27 Q21 13 34 15 Q41 18 40 27Z" fill="#ff8fa5"/>
        <path d="M92 27 Q99 13 86 15 Q79 18 80 27Z" fill="#ff8fa5"/>
        ${hode(f)}
        <ellipse cx="23" cy="83" rx="21" ry="18" fill="${P}" stroke="${B}" stroke-width="4.5"/>
        <ellipse cx="97" cy="83" rx="21" ry="18" fill="${P}" stroke="${B}" stroke-width="4.5"/>
        <path d="M24 69 Q60 58 96 69 L99 96 Q60 114 21 96Z" fill="${P}"/>
        ${strek("M33 100 Q60 113 87 100", 4.5)}
        ${oyne({ y: 52, x1: 43, x2: 77, r: 10.5, pr: 5, dx: 2.5, dy: -2.5 })}
        ${form("M53 70 Q60 65 67 70 Q60 79 53 70Z", "#ff7fae", 3)}
        ${strek("M60 77 V83", 3.5)}
        ${strek("M49 84 Q55 91 60 83 Q65 91 71 84", 3.5)}
        <rect x="55.5" y="86" width="9" height="9" rx="2" fill="#ffffff" stroke="${B}" stroke-width="2.5"/>
        ${strek("M60 86 V95", 1.8)}
        <circle cx="13" cy="80" r="2" fill="${B}"/><circle cx="20" cy="89" r="2" fill="${B}"/>
        <circle cx="107" cy="80" r="2" fill="${B}"/><circle cx="100" cy="89" r="2" fill="${B}"/>
        <g transform="rotate(-9 96 20)"><rect x="80" y="-8" width="25" height="34" rx="4.5" fill="${LAMPE}" stroke="${B}" stroke-width="3.5"/>${tekst(92.5, 15.5, "3", 18)}</g>
        <g transform="rotate(13 104 22)"><rect x="93" y="-4" width="25" height="34" rx="4.5" fill="#c9a2ff" stroke="${B}" stroke-width="3.5"/>${tekst(105.5, 19.5, "7", 18)}</g>
        <ellipse cx="101" cy="33" rx="9" ry="7" fill="${f}" stroke="${B}" stroke-width="4"/>
        ${glimt(15, 22, 6)}
        ${glimt(8, 46, 4)}`,
    },
// alias: ["#ffa94d", "G"]
