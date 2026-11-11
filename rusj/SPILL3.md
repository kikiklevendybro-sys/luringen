# rusj del 3 — new games (briefs)

Ten new games chosen 2026-11-12 from the design audits (build/del3/design-1…5.md): popular, well-known
genres the collection lacked, no overlap with existing games, generic names (no trademarks).
Quality bar: the same as the best existing games — read rusj/KIT.md, rusj/SPILL2.md and two
comparable games before building.

## Rules for every builder

- Work alone (no sub-agents), economical with tokens. Don't commit.
- Only your own new folder rusj/spill/<id>/, test/spill/<id>.e2e.mjs and test/<id>.test.mjs.
- Do NOT edit shared files (rusj/kit/*, rusj/kit/gjengen.js, rusj/seo.json, rusj/portal/*, scripts/*).
  Instead put next to your game:
  - `rusj/spill/<id>/maskot.js` — the mascot entry exactly as it should be pasted into the
    `GJENG` object in rusj/kit/gjengen.js (`<id>: { farge, tegn: (f) => \`…\` },`), drawn in the
    style of the existing entries with the same helpers (hode, oyne, smil, form, strek, kinn …),
    plus a one-line `// alias: ["#hex", "X"]` comment for the small fallback list near the end of
    gjengen.js. The main session merges it.
  - `rusj/spill/<id>/seo.json` — `{ "tittel", "frase", "beskrivelse", "sok": [] }` in the style of
    the entries in rusj/seo.json.
  Until merged, the game shows the kit's fallback mascot; tests must not depend on the drawing.
- spill.json: id, navn, undertittel, kort, beskrivelse, spillere, minutter, mobiler, tagger,
  rekkefolge (given below), farge, sok; `"motMobilen": true` where you can play against the phone;
  tag `daglig` only for daily games.
- Follow «Shared wording» and «Shared screen patterns» in KIT.md: «Gjør klart», «Start», «Avslutt»,
  «Spill videre», «Kåringen», «mobilen», plain-text dock buttons, landscape works, R.kveld.registrer
  where players are ranked, a record or «sist» line on home where it matters, R.del for results.
- Content in natural Norwegian bokmål, facts true, no brand names, child-safe in children's games.
- Build: `node scripts/bygg.mjs --ut build/web-<id> --spill <id>`; e2e at 390×844, 320×568,
  844×390 and --probe (max two e2e processes); unit tests for rules/engines. Look at screenshots.

## The ten games

| id | navn | undertittel | spillere | rekkefolge | tagger | kort |
|---|---|---|---|---|---|---|
| hatten | Hatten | Tre runder, samme ord | 4–20 | 49 | fest, lag, ord | Forklar, ett ord, mim — de samme ordene tre ganger. |
| femmeren | Femmeren | Tre ting på fem sekunder | 2–20 | 50 | fest, familie, barn | «Nevn tre …» — og klokka tikker. |
| meyer | Meyer | Terningbløff | 2–10 | 51 | fest, blof, klassiker | Slå, si et tall — og håp at ingen sjekker. |
| firklover | Firkløveren | Fire grupper | 1 | 52 | daglig, ord, alene, tenke | Seksten ord, fire grupper. Finn sammenhengen. |
| dam | Dam | Dam | 1–2 | 53 | klassiker, tenke, alene | Hopp over brikkene og bli dame. |
| reversi | Reversi | Snu brikkene | 1–2 | 54 | klassiker, tenke, alene | Klem brikkene inne og snu dem til din farge. |
| vriatter | Vri åtter | Vri åtter | 1–4 | 55 | klassiker, kort, familie | Følg farge eller tall — åtteren vrir alt. |
| stigespillet | Stigespillet | Stiger og sklier | 1–4 | 56 | barn, familie, klassiker | Klatre opp stigene, skli ned sklia. |
| blokka | Blokka | Blokkpuslespill | 1 | 57 | alene, tenke, daglig | Fyll rader og kolonner — og rydd brettet. |
| skronemakeren | Skrønemakeren | Finn den ekte forklaringen | 3–10 | 58 | fest, ord, blof | Alle dikter en forklaring. Finner dere den ekte? |
