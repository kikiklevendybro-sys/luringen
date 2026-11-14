// alias: ["#d67cff", "S"]
    // Spåkona: a violet fortune teller in a starry headscarf with a gold coin on her forehead,
    // knowing half-closed eyes and a glowing crystal ball in front – with a playing card inside.
    spakona: {
      farge: "#d67cff",
      tegn: (f) => `
        ${form("M10 60 Q8 10 60 8 Q112 10 110 60 Q100 30 60 30 Q20 30 10 60Z", "#3d2b7a", 4.5)}
        ${form("M106 52 Q120 70 112 96 Q104 80 100 62Z", "#3d2b7a", 4)}
        ${hode(f)}
        ${form("M12 52 Q14 22 60 20 Q106 22 108 52 Q90 36 60 36 Q30 36 12 52Z", "#3d2b7a", 4.5)}
        ${glimt(34, 30, 4, LAMPE)}${glimt(86, 28, 3.5, LAMPE)}
        <circle cx="60" cy="40" r="6" fill="${MESSING}" stroke="${B}" stroke-width="3"/>
        ${blunk(60, strek("M30 60 Q40 54 50 60M70 60 Q80 54 90 60", 5) + strek("M31 61 Q40 66 49 61M71 61 Q80 66 89 61", 3.5))}
        ${kinn(76)}
        ${strek("M50 82 Q60 88 70 82", 4.5)}
        <circle cx="60" cy="104" r="20" fill="#bfe8ff" stroke="${B}" stroke-width="4.5"/>
        <rect x="53" y="94" width="14" height="19" rx="2.5" fill="${P}" stroke="${B}" stroke-width="2.5" transform="rotate(-8 60 104)"/>
        ${hjerte(59.5, 104, 3.6)}
        ${glans("M48 96 Q51 90 57 88", 3.5)}
        ${form("M42 120 H78 L74 126 H46Z", MESSING, 3.5)}`,
    },
