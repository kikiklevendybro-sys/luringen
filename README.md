# rusj.no

Gratis spill og selskapsleker på norsk, rett i nettleseren. Ingen app, ingen konto, ingen reklame, ingen sporing.

21 spill, alle med sin egen figur i «rusj-gjengen»: Luringen, Spionen, Sladrehanken (Jeg har aldri), Pekefingeren (Hvem er mest sannsynlig?), Våghalsen (Sannhet eller konsekvens), Vinglepetter (Hva vil du helst?), Skravla (Forklar ordet), Panna, Kodeknekkeren, Besserwisseren (Festquiz), Detektiven (Hvem er jeg?), Mimen, Tankeleseren (Bølgelengde), Hviskeren (Bare ett hint), Løgnhalsen (To sannheter og en løgn), Kunstneren (Tegn og gjett), Sauen (Tenk som flokken), Varulven, Bokstavtrollet (Alfabetleken), Skjæra (Kims lek) og Elefanten (Memory).

Nettstedet er bare statiske filer. Hver gang `main` får nye endringer, bygger GitHub Actions siden og legger den ut på https://rusj.no (GitHub Pages).

## Kommandoer (kjøres i Terminal, i denne mappen)

| Kommando | Hva den gjør |
|---|---|
| `node scripts/bygg.mjs` | Bygger hele nettstedet til `dist/web/` (og Luringen som én side i `dist/luringen.html`) |
| `node scripts/bygg.mjs --ut build/web --spill sauen,elefanten` | Bygger bare noen spill, til en egen mappe |
| `node test/rusj-e2e.mjs` | Spiller gjennom forsiden og alle spillene i en usynlig Chrome og tar skjermbilder |
| `node test/rusj-e2e.mjs --bredde 320 --hoyde 568` | Det samme på den minste mobilen |
| `node test/rusj-e2e.mjs --probe` | Sjekker at spillernavn med HTML-kode aldri blir tolket som kode |
| `node test/e2e.mjs` | Luringens egen, grundige gjennomspilling (inkludert QR-koden) |
| `node --test test/*.test.mjs` | Enhetstester (Luringen, felles kit, quizdata) |
| `node scripts/lag-bilder.mjs` | Tegner app-ikoner og delingsbilder på nytt (trenger Google Chrome) |
| `node scripts/sjekk-ord.mjs data/kategorier/*.json` | Kontrollerer ordbanken |

Ingen avhengigheter må installeres. Det holder med Node.js (og Google Chrome for testene og bildene).

## Slik er det bygget

- `rusj/kit/` – det felles grunnlaget alle spillene bruker: `rusj.js` (skjermer, lagring, lyd, klokke, kortstokk, koder, knapper), `rusj.css` (designet), `gjengen.js` (figurene og logoen) og `sw.js` (virker uten nett).
- `rusj/spill/<id>/` – ett spill per mappe: `spill.json` (fakta), `spill.js`, `spill.css` og `data/*.json` (innholdet).
- `rusj/portal/` – forsiden.
- `rusj/KIT.md` – håndboka for å lage et nytt spill (regler, felles ordbruk og skjermmønstre). `rusj/SPILL.md` – beskrivelsen av hvert spill.
- `rusj/bilder/` – app-ikoner og delingsbilder (lages med `scripts/lag-bilder.mjs`).
- `src/` – Luringen, som var det første spillet. `data/kategorier/` – ordbanken (3 189 ord) som Luringen og flere andre spill bruker.
- `scripts/bygg.mjs` og `scripts/rusj.mjs` – bygget. `test/` – testene.

Nye kategorier i ordbanken må legges sist i listen `REKKEFOLGE` i `scripts/bygg.mjs`, ellers endres kodene for «hver sin mobil» i Luringen.

## Sikkerhet og personvern

- Streng Content Security Policy: sidene laster bare filer fra rusj.no selv, og kjører ingen innebygd kode.
- Ingen informasjonskapsler og ingen sporing av personer. Sida teller anonymt hvor mange som besøker den og hvilke spill som åpnes (bare tall per dag, lagret i EU hos Cloudflare, se statistikk/). Navn og spill lagres bare i nettleseren på enheten (localStorage, nøkler som begynner med `rusj.`).
- Kodene for «hver sin mobil» inneholder bare innstillinger og et tilfeldig tall; hver mobil regner ut det samme for seg.
