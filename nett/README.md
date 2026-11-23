# Spill på nett – rommene for rusj.no

Denne mappa er en liten tjeneste hos Cloudflare som lar to eller flere venner spille samme spill på hver sin mobil, fra hvert sitt sted. Den ene trykker «Spill med en venn på nett» og sender en lenke; den andre åpner lenken og er med.

Kort sagt: **tjenesten sender trekk videre, og glemmer alt etter et døgn.** Den kjenner ikke spillereglene. Mobilene regner ut spillet selv, og alle får de samme trekkene i samme rekkefølge.

Med: Sjakkhesten, Fireren, Terninga (Yatzy), Brikka (Ludo), Admiralen (slagskip), Reversi, Bonden (bondesjakk), Mølla, Såmannen (kalaha), Snekkeren (prikker og bokser), Dam, Stigespillet og Lykkegrisen (10 000).

## Hva et rom inneholder – og hva det ikke inneholder

| Lagres (bare mens rommet finnes) | Lagres ikke |
|---|---|
| Hvilket spill, og innstillingene verten valgte | IP-adresse, nettlesertype, språk, hvor folk er |
| Et tilfeldig tall som gjør terningkast og lignende likt på alle mobilene | Noen konto, e-post eller telefonnummer |
| Plassene: et tilfeldig «plassmerke» per mobil (så en mobil som mister nettet, får plassen tilbake) og et kallenavn på høyst 16 tegn hvis man skrev et | Fritekst eller chat (det finnes ingen) |
| Trekkene i rekkefølge | Reaksjonene (de seks faste emojiene sendes bare videre) |
| | Skipene i Admiralen: de blir på eierens mobil |

Dette er sant fordi tjenesten er bygd slik:

- Rommet lagrer bare de feltene over (`src/rom.js`). Testene i `test/personvern.test.mjs` sjekker selve koden: den leser bare to felt i forespørselen (`Origin` og `Upgrade`), aldri IP-adresse eller nettlesernavn, og skriver ingen logger.
- Rommene lages alltid i **EU** hos Cloudflare (`jurisdiction("eu")`). Cloudflare skriver rommets tilfeldige ID i sine faktureringslogger, også utenfor EU; ID-en sier ingenting om hvem som spiller.
- Alt slettes **24 timer etter siste trekk**, og med én gang når alle har gått fra en ferdig kamp. En kode ingen åpnet, slettes etter 10 minutter.
- Bare nettsiden https://rusj.no får lage og åpne rom.

Én ærlig ting: når mobilen kobler til, ser Cloudflare IP-adressen i det øyeblikket (slik alle nettsteder gjør for å kunne svare). Vi lagrer den ikke, og loggene for tjenesten er slått av.

## Grenser

| Grense | Verdi |
|---|---|
| Én melding fra en mobil | høyst 2 KB (et trekk høyst 1 KB) |
| Meldinger per mobil | høyst 20 per 10 sekunder; over 40 stenges forbindelsen |
| Plasser | Sjakk, Fireren, Admiralen, Reversi, Bonden, Mølla, Såmannen, Snekkeren og Dam 2 · Ludo og Stigespillet 2–4 · Yatzy 2–6 · Lykkegrisen 2–8 |
| Mobiler koblet til samme rom | høyst 22 |
| Trekk i én kamp | høyst 2000 |
| Kallenavn | høyst 16 tegn, bare tekst |
| Nye rom (hele tjenesten) | høyst 120 i minuttet per Cloudflare-senter |

Et fullt rom sier nei til nye mobiler. Når kampen er i gang, kommer bare de som allerede har en plass, inn igjen.

## Slik settes det i drift

Det trengs ingen ny konto, ingen database og ingen hemmelig nøkkel. Samme Cloudflare-konto og API-nøkkel som for tellingen (`statistikk/`) holder; nøkkelen trenger *Workers Scripts: Edit* (Durable Objects er en del av Workers).

**Kommandoer i Terminal, i mappa `~/dev/luringen/nett`:**

```bash
set -a; . ../.env; set +a                 # henter CLOUDFLARE_API_TOKEN og CLOUDFLARE_ACCOUNT_ID
W="npx --yes wrangler@4.160.0"

npm test                                   # testene, uten nett
$W deploy                                  # lager tjenesten og rom-klassen (migrasjon v1)

curl https://rusj-nett.kikiklevendybro.workers.dev/      # «rusj-nett: ok»
```

`deploy` lager alt i `wrangler.toml` første gang: tjenesten, Durable Object-klassen `Rom` (lagret i SQLite, som er med i gratisplanen) og bremsen på nye rom. Det er ingen egen kommando for databasen.

**Slå på knappen på rusj.no:** adressen står allerede i `NETT_ADRESSE` øverst i `scripts/rusj.mjs`. Publiser tjenesten **før** nettsiden. Så lenge tjenesten ikke svarer, sier knappen bare vennlig at den ikke fikk kontakt.

## Slå alt av igjen

1. Tøm `NETT_ADRESSE` i `scripts/rusj.mjs` og publiser rusj.no. Da forsvinner knappen, og ingenting sendes.
2. Slett tjenesten og alle rom (med samme `set -a; . ../.env` først):
   ```bash
   npx --yes wrangler@4.160.0 delete rusj-nett
   ```

## For den som vedlikeholder

| Fil | Hva |
|---|---|
| `src/index.js` | Tjenesten: `POST /rom` (ny kode), `GET /rom/<kode>` (inn i rommet) og `GET /` |
| `src/rom.js` | Rommet (én Durable Object per kode): plasser, trekk, ny kamp, sletting |
| `src/protokoll.js` | Lesing av meldinger, kallenavn, grensene for oppsett og trekk |
| `src/oppsett.js` | Alle grensene og spillene |
| `KLIENT.md` | Avtalen med nettsiden (på engelsk) |
| `../rusj/kit/nett.js` | Mobilsiden av det hele (`R.nett`) |

- Nytt spill på nett: legg det i `SPILL` i `src/oppsett.js` (minst og flest plasser), kjør testene, publiser tjenesten, og gi spillet `"nett": true` i `spill.json` (se `KLIENT.md`).
- Testene: `npm test` i denne mappa (Node 24, ingen pakker). Cloudflare-delene (lagring, alarm, WebSocket) er etterlignet i `test/falsk.mjs`; selve rom-koden er den ekte.
- Lokalt: lag `.dev.vars` med `LOKAL="1"` og kjør `npx wrangler@4.160.0 dev --port 8799`. Det virker uten innlogging. `LOKAL="1"` slipper inn `http://localhost` og lar rommene ligge uten EU-merke (den lokale simulatoren kjenner ikke jurisdiksjoner); den skal aldri settes i drift. `node test/nett-e2e.mjs` i rotmappa bruker dette til å spille de fem spillene på to «mobiler».
- Endrer du lagringsformen i et rom: øk `v` i `rom.js`. Rommene lever uansett bare ett døgn.
