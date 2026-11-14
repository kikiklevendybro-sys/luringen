// alias: ["#e8894a", "N"]
    // Nøtteknekkeren: an orange squirrel with tufted ears, a cream face and a big bushy tail curling up
    // behind it, holding a hazelnut – one nut for every right answer.
    notteknekkeren: {
      farge: "#e8894a",
      tegn: (f) => `
        ${form("M78 108 Q128 112 127 64 Q126 18 94 8 Q74 2 66 16 Q88 14 100 32 Q116 58 98 86 Q92 96 78 108Z", "#c9652c", 4.5)}
        ${strek("M112 36 Q122 58 114 84", 3.2, "rgba(255,241,221,.5)")}
        ${form("M24 36 L18 4 Q30 10 40 26Z", f, 4.2)}${form("M96 36 L102 4 Q90 10 80 26Z", f, 4.2)}
        ${hode(f)}
        <path d="M28 70 Q30 44 60 44 Q90 44 92 70 Q92 104 60 106 Q28 104 28 70Z" fill="#ffe4c4"/>
        ${kinn(84)}
        ${oyne({ y: 60, r: 11, pr: 5.4, dy: 1 })}
        <ellipse cx="60" cy="78" rx="6" ry="4.5" fill="${B}"/>
        ${strek("M60 82 V87M52 87 Q60 93 68 87", 3.6)}
        ${form("M56.5 89.5 H63.5 V96 Q60 97.5 56.5 96Z", P, 2.6)}
        ${form("M8 114 Q2 96 16 90 Q30 88 32 102 Q32 118 18 120 Q10 120 8 114Z", "#a8662e", 4)}
        ${form("M8 98 Q16 84 30 96 Q22 92 8 98Z", "#6e3f1c", 3.2)}
        ${glans("M14 104 Q16 98 20 97", 2.4)}`,
    },
