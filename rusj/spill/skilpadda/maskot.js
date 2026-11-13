// alias: ["#34b892", "S"]
    // Skilpadda: a jade-green turtle in its patterned shell, balancing the top of a tile pyramid on
    // its back – two tiles below, one on top, the way the classic turtle layout ends.
    skilpadda: {
      farge: "#34b892",
      tegn: (f) => `
        ${hode(f)}
        ${form("M13 58 Q8 12 60 8 Q112 12 107 58 Q86 46 60 46 Q34 46 13 58Z", "#1f7a5c")}
        ${strek("M45 20 L60 15 L75 20 L77 34 L60 40 L43 34Z", 3, "rgba(255,241,221,.5)")}
        ${strek("M43 34 L22 46M77 34 L98 46M45 20 L31 15M75 20 L89 15M60 40 V46", 3, "rgba(255,241,221,.5)")}
        <rect x="47" y="7" width="14" height="17" rx="3" fill="#b89462" stroke="${B}" stroke-width="3.2"/>
        <rect x="63" y="7" width="14" height="17" rx="3" fill="#b89462" stroke="${B}" stroke-width="3.2"/>
        <rect x="44" y="4" width="14" height="17" rx="3" fill="${P}" stroke="${B}" stroke-width="3.2"/>
        <rect x="60" y="4" width="14" height="17" rx="3" fill="${P}" stroke="${B}" stroke-width="3.2"/>
        <circle cx="51" cy="12.5" r="3.4" fill="none" stroke="#1f66a8" stroke-width="2.3"/>
        <rect x="65.4" y="7.5" width="3.2" height="10" rx="1.5" fill="#0f6e54"/>
        <rect x="55" y="-5" width="14" height="17" rx="3" fill="#b89462" stroke="${B}" stroke-width="3.2"/>
        <rect x="52" y="-8" width="14" height="17" rx="3" fill="${P}" stroke="${B}" stroke-width="3.2"/>
        <path d="M54.6 4.6 54 -2.6l3 2.7L59 -4.2l2 4.3 3-2.7-.6 7.2Z" fill="#b3202a"/>
        ${kinn(84)}
        ${oyne({ y: 66, dx: 2, dy: -2 })}
        ${smil(92, 13)}
        ${glimt(104, 4, 7)}`,
    },
