    // Dommeren: a periwinkle judge with a curly white wig, round spectacles and a kind smile,
    // holding up a wooden gavel – ready to crown the funniest answer.
    dommeren: {
      farge: "#7c8cff",
      tegn: (f) => `
        <circle cx="18" cy="40" r="11" fill="${P}" stroke="${B}" stroke-width="4"/><circle cx="16" cy="60" r="11" fill="${P}" stroke="${B}" stroke-width="4"/>
        <circle cx="102" cy="40" r="11" fill="${P}" stroke="${B}" stroke-width="4"/><circle cx="104" cy="60" r="11" fill="${P}" stroke="${B}" stroke-width="4"/>
        ${hode(f)}
        ${form("M22 40 Q24 12 60 10 Q96 12 98 40 Q86 28 74 32 Q60 22 46 32 Q34 28 22 40Z", P, 4.2)}
        ${kinn(82)}
        <circle cx="40" cy="58" r="13" fill="${P}" stroke="${B}" stroke-width="4"/><circle cx="80" cy="58" r="13" fill="${P}" stroke="${B}" stroke-width="4"/>
        ${strek("M53 58 H67", 4)}
        <circle cx="41" cy="59" r="5.4" fill="${B}"/><circle cx="81" cy="59" r="5.4" fill="${B}"/>
        <circle cx="39" cy="56.6" r="1.7" fill="${P}"/><circle cx="79" cy="56.6" r="1.7" fill="${P}"/>
        ${smil(86, 13)}
        <g transform="rotate(-40 104 86)"><rect x="101" y="84" width="7" height="30" rx="3" fill="#a4622e" stroke="${B}" stroke-width="3.4"/><rect x="90" y="70" width="29" height="16" rx="4" fill="#c98a4a" stroke="${B}" stroke-width="3.6"/></g>`,
    },
// alias: ["#7c8cff", "D"]
