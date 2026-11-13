    // Sporhunden: a round tracking dog with long floppy ears, a big shiny nose down on the trail and
    // its tongue out; a line of paw prints runs past (the trail it follows through the letters).
    sporhunden: {
      farge: "#e0a15e",
      tegn: (f) => {
        const pote = (x, y, v) =>
          `<g transform="translate(${x} ${y}) rotate(${v})"><ellipse cx="0" cy="2" rx="4.6" ry="3.8" fill="${B}"/><circle cx="-4.2" cy="-3.6" r="1.7" fill="${B}"/><circle cx="0" cy="-5.2" r="1.7" fill="${B}"/><circle cx="4.2" cy="-3.6" r="1.7" fill="${B}"/></g>`;
        return `
          ${form("M22 30 Q4 34 6 66 Q8 92 24 96 Q34 92 32 66 Q31 44 38 34Z", "#8a5130")}
          ${form("M98 30 Q116 34 114 66 Q112 92 96 96 Q86 92 88 66 Q89 44 82 34Z", "#8a5130")}
          ${hode(f)}
          <ellipse cx="60" cy="84" rx="22" ry="16" fill="#f6d7ae" stroke="${B}" stroke-width="4"/>
          ${oyne({ y: 56, r: 11, pr: 5.4, dx: 0, dy: 3 })}
          ${strek("M33 40 Q40 35 48 39M72 39 Q80 35 87 40", 4.5)}
          <ellipse cx="60" cy="76" rx="9" ry="6.5" fill="${B}"/>
          ${glans("M56 74 Q59 72 62 73", 2.5)}
          ${strek("M60 82 V88M50 88 Q60 96 70 88", 4)}
          ${form("M55 91 Q60 104 65 91Z", ROSA, 3)}
          ${kinn(84)}
          ${pote(104, 108, 20)}${pote(116, 96, 30)}`;
      },
    },
// alias: ["#e0a15e", "S"]
