// alias: ["#9a86e8", "P"]
    // Pusen: a friendly black cat with green eyes, pink ears and a red bow tie, holding two animal
    // cards – the cat is the odd card in Svarteper, and a good friend in the other games.
    pusen: {
      farge: "#9a86e8",
      tegn: () => `
        ${form("M18 46 L12 4 L46 26Z", "#3d3166", 5)}${form("M102 46 L108 4 L74 26Z", "#3d3166", 5)}
        <path d="M21 34 L18 14 L35 25Z M99 34 L102 14 L85 25Z" fill="#ff9ec4"/>
        ${hode("#3d3166")}
        <ellipse cx="42" cy="58" rx="12" ry="13" fill="#9be15d" stroke="${B}" stroke-width="3"/>
        <ellipse cx="78" cy="58" rx="12" ry="13" fill="#9be15d" stroke="${B}" stroke-width="3"/>
        ${blunk(58, `<ellipse cx="43" cy="59" rx="4.4" ry="9" fill="${B}"/><ellipse cx="79" cy="59" rx="4.4" ry="9" fill="${B}"/><circle cx="39" cy="53" r="3" fill="${P}"/><circle cx="75" cy="53" r="3" fill="${P}"/>`)}
        <path d="M54 74 H66 L60 81Z" fill="#ff9ec4"/>
        ${strek("M60 81 Q55 88 48 85M60 81 Q65 88 72 85", 3, P)}
        ${strek("M36 80 L12 76M36 86 L14 92M84 80 L108 76M84 86 L106 92", 2.4, "rgba(255,241,221,.8)")}
        <ellipse cx="30" cy="80" rx="7" ry="4.5" fill="rgba(255,79,139,.55)"/><ellipse cx="90" cy="80" rx="7" ry="4.5" fill="rgba(255,79,139,.55)"/>
        ${form("M44 106 L60 98 L76 106 L76 118 L60 110 L44 118Z", ROD, 3.6)}
        <circle cx="60" cy="108" r="4.6" fill="${ROD}" stroke="${B}" stroke-width="3"/>
        ${vifte(104, 124, [[-14, tekst(104, 103, "5", 15, "#e0729f")], [12, `${tekst(104, 101, "10", 12, "#3a8fd8")}`]])}`,
    },
