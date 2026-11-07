# Luringen

Norsk festspill i nettleseren for 3–10 spillere. Alle får samme hemmelige ord – bortsett fra luringen, som må bløffe seg gjennom.

- Over 3000 norske ord i 32 kategorier, med hint og «nesten-like» ord til hvert ord
- Fire nivåer: Lett, Middels, Vanskelig og Kaos (luringen får et nesten-likt ord og vet ikke selv at hen er luringen)
- To måter å spille på: én mobil som sendes rundt, eller hver sin mobil med en kode/QR-kode
- Ingen server, ingen innlogging, ingen reklame. Fungerer uten nett når siden er lastet

## Legge spillet ut på en nettside

Alt som trengs ligger i `dist/web/`. Last opp innholdet i den mappen til en hvilken som helst nettside (GitHub Pages, Netlify, Cloudflare Pages eller et vanlig webhotell). Det er bare statiske filer.

Du kan også åpne `dist/web/index.html` rett i nettleseren for å prøve. QR-kode og «Del lenke» vises først når siden ligger på en ekte nettadresse (https).

## Kommandoer (kjøres i Terminal, i denne mappen)

| Kommando | Hva den gjør |
|---|---|
| `npm run bygg` | Slår sammen ordlistene og lager `dist/web/` og `dist/luringen.html` |
| `npm test` | Tester spillogikken (ordvalg, roller, koder, poeng) |
| `npm run e2e` | Spiller hele runder i en usynlig Chrome og tar skjermbilder |
| `npm run sjekk-ord` | Kontrollerer alle ordlister |
| `npm run ikoner` | Tegner app-ikonene på nytt |

Ingen avhengigheter må installeres. Det holder med Node.js (og Google Chrome for `e2e`).

## Ordene

Hver kategori er en fil i `data/kategorier/`:

```json
{ "id": "mat", "navn": "Mat og retter", "ikon": "🍝",
  "ord": [ { "o": "Pizza", "n": 1, "h": "Fredag", "l": "Taco" } ] }
```

- `o` – det hemmelige ordet
- `n` – vanskelighetsgrad 1–3
- `h` – hintet luringen får på nivå Lett
- `l` – det nesten-like ordet luringen får på nivå Kaos

Etter endringer: kjør `npm run sjekk-ord` og `npm run bygg`. Nye kategorier må legges sist i listen `REKKEFOLGE` i `scripts/bygg.mjs`, ellers endres kodene for «hver sin mobil».

## Personvern

Navn og innstillinger lagres bare i nettleseren på enheten (localStorage). Ingenting sendes noe sted. Koden for «hver sin mobil» inneholder bare innstillingene og et tilfeldig tall, og alle mobilene regner ut samme runde hver for seg.

## Filer

- `src/kjerne.js` – spillogikken (tilfeldighet, ordvalg, roller, poeng, koder)
- `src/qr.js` – QR-kode-generator uten avhengigheter
- `src/ui.js`, `src/style.css`, `src/page.html` – skjermene
- `src/sw.js` – gjør at nettsiden virker uten nett
- `scripts/` – bygg, ordkontroll og ikoner
- `test/` – enhetstester, ende-til-ende-test og QR-kontroll (`qr-les.swift` bruker macOS sin egen QR-leser)
