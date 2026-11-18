    // Kameleonen (emotion switch): a chameleon with a ridge on its head, rainbow scales, turret
    // eyes looking two ways at once, a curly tail in the corner and its tongue rolled out.
    kameleonen: {
      farge: "#7bd88f",
      tegn: (f) => `
        ${strek("M84 112 Q104 120 114 110 Q120 100 110 95 Q101 93 100 102 Q100 109 107 108", 14)}
        ${strek("M84 112 Q104 120 114 110 Q120 100 110 95 Q101 93 100 102 Q100 109 107 108", 6.5, f)}
        <circle cx="113" cy="104" r="2.2" fill="${ROSA}"/><circle cx="96" cy="115" r="2.2" fill="${LAMPE}"/><circle cx="108" cy="96" r="2" fill="${HIMMEL}"/>
        ${form("M34 26 Q46 2 62 10 Q78 0 88 24 Q60 12 34 26Z", f, 4.5)}
        ${hode(f)}
        <circle cx="42" cy="29" r="4.5" fill="${ROSA}"/><circle cx="60" cy="24" r="4.5" fill="${LAMPE}"/><circle cx="78" cy="29" r="4.5" fill="${HIMMEL}"/>
        <circle cx="26" cy="64" r="3.5" fill="${LAMPE}"/><circle cx="94" cy="64" r="3.5" fill="${ROSA}"/>
        ${blunk(54, `
          <circle cx="38" cy="54" r="15" fill="${f}" stroke="${B}" stroke-width="4.5"/>
          <circle cx="82" cy="54" r="15" fill="${f}" stroke="${B}" stroke-width="4.5"/>
          ${strek("M26 48 Q38 40 50 48M70 48 Q82 40 94 48", 2.5, "#4fae68")}
          <circle cx="38" cy="54" r="8.5" fill="${P}" stroke="${B}" stroke-width="3.5"/>
          <circle cx="82" cy="54" r="8.5" fill="${P}" stroke="${B}" stroke-width="3.5"/>
          <circle cx="35" cy="51" r="4.2" fill="${B}"/><circle cx="85" cy="57" r="4.2" fill="${B}"/>
          <circle cx="34" cy="49.6" r="1.4" fill="${P}"/><circle cx="84" cy="55.6" r="1.4" fill="${P}"/>`)}
        ${rodme(78, 28, 92)}
        ${strek("M38 84 Q60 102 82 84", 5)}
        ${strek("M76 90 Q94 100 103 88 Q108 79 99 78 Q93 79 95 85", 5, ROSA)}`,
    },
// alias: ["#7bd88f", "K"]
