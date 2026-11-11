# Tallene for rusj.no – anonym telling

Denne mappa er en liten tjeneste hos Cloudflare som teller hvor mange som bruker rusj.no, hvilke spill som blir spilt, og om folk kommer tilbake. Du ser tallene på en egen side (`/admin`) på mobilen.

Kort sagt: **vi teller, vi sporer ikke.** Nettleseren sender noen ord fra en fast liste («en side ble åpnet: Ordugla», «var her også i går»), og tjenesten legger 1 til en sum for dagen. Det finnes ingen ID, ingen informasjonskapsler og ingen IP-adresser i databasen. Det er umulig å følge én person fra dag til dag, også for oss.

## Hva som telles – og hva som ikke telles

| Telles (bare som en sum per dag) | Telles ikke |
|---|---|
| Hvilke sider og spill som åpnes | Navn, det dere skriver, svar og poeng |
| At et spill ble startet og spilt ferdig | Innstillinger (antall spillere, nivå, modus …) |
| At et nytt besøk begynte | Klokkeslett (bare datoen) |
| Om enheten var innom i går, siste uke, lenger siden eller aldri før – det regner nettleseren ut selv | Noen ID for person, enhet eller økt |
| Første gang denne uka / denne måneden (for «ulike enheter per uke og måned») | Informasjonskapsler (cookies) |
| Om rusj er åpnet fra hjemskjermen (som app) | IP-adresse, nettlesertype, språk, skjermstørrelse |
| Hvor lenge et besøk varer, i grove grupper: under 1, 1–3, 3–10, 10–30, over 30 minutter | Hvilken side folk kom fra |
| Dagens oppgaver: hvilke som er løst, hvor mange av dem, og dager på rad i grupper | Hvor i verden folk er |

Dette er sant fordi tjenesten er bygd slik:

- Databasen har én tabell med tre kolonner: **dag**, **navn på telleren** og **antall**. Det finnes ingen plass å legge noe annet.
- Tjenesten godtar bare tellernavn fra en fast liste (`src/nokler.js`). Alt annet kastes.
- Tjenesten leser ikke IP-adresse, nettlesernavn eller hvor folk kom fra, og skriver ingen logger. Testene i `test/personvern.test.mjs` sjekker selve koden for dette.
- «Ny eller tilbake» regnes ut **i nettleseren** fra en liten lapp den har selv (`rusj.stat`). Lappen sendes aldri; bare svaret («i går») sendes.
- Ingenting sendes hvis nettleseren har «Ikke spor» (Do Not Track / Global Privacy Control) eller datasparing på.
- Databasen er laget i **EU** hos Cloudflare. Tall eldre enn **25 måneder** slettes automatisk hver natt.

Én ærlig ting: når en nettleser sender, ser Cloudflare IP-adressen i det øyeblikket (slik alle nettsteder gjør for å kunne svare). Vi lagrer den ikke, og loggene for tjenesten er slått av.

Tallene er **anslag**: én person på to mobiler telles to ganger, og de som har «Ikke spor» på, telles ikke.

## Slik settes det i drift

**Det du gjør (eieren):**

1. Lag en gratis konto på cloudflare.com (gjort).
2. Gå til **Workers & Pages** én gang og velg et navn for `workers.dev` hvis du blir spurt. Det blir en del av adressen.
3. Lag API-nøkkelen hovedøkta ba om, og legg den i `.env` (gjort). Den trenger: *Workers Scripts: Edit*, *D1: Edit* og *Account Settings: Read*.
4. Når tjenesten er oppe: sett opp innlogging til `/admin` (se «Innlogging» under).

**Det hovedøkta gjør (kommandoer i Terminal, i mappa `~/dev/luringen/statistikk`):**

```bash
set -a; . ../.env; set +a                 # henter CLOUDFLARE_API_TOKEN og CLOUDFLARE_ACCOUNT_ID
W="npx --yes wrangler@4.160.0"

# 1. Databasen, i EU (kan ikke endres senere). Skriver ut en database_id.
$W d1 create rusj-statistikk --jurisdiction=eu
sed -i '' "s/SETT-INN-DATABASE-ID-HER/<database_id fra linja over>/" wrangler.toml

# 2. Tabellen
$W d1 execute rusj-statistikk --remote --file=schema.sql

# 3. Testene, så tjenesten
npm test
$W deploy                                  # skriver ut adressen: https://rusj-statistikk.<navn>.workers.dev

# 4. Reservenøkkel for /admin (lages og lagres i .env, vises aldri i Terminal)
node -e 'console.log("RUSJ_ADMIN_NOKKEL=" + require("crypto").randomBytes(32).toString("base64url"))' >> ../.env
set -a; . ../.env; set +a
printf %s "$RUSJ_ADMIN_NOKKEL" | $W secret put ADMIN_NOKKEL

# 5. Sjekk
curl https://rusj-statistikk.<navn>.workers.dev/          # «rusj-statistikk: ok»
```

`--jurisdiction=eu` er flagget i Cloudflares dokumentasjon nå (d1/configuration/data-location). Skulle kommandoen avvise det: lag databasen i dashbordet i stedet – **Storage & Databases → D1 → Create Database → Data location → Specify jurisdiction → European Union** – og bruk `database_id` derfra.

**Slå på tellingen på rusj.no:** skriv adressen inn i `STAT_ADRESSE` øverst i `scripts/rusj.mjs` (for eksempel `"https://rusj-statistikk.<navn>.workers.dev"`), kjør testene og publiser siden. Da kommer `/felles/stat.js` på alle sider, adressen legges i CSP-en, og bunnteksten og `/personvern/` forteller om tellingen. Så lenge `STAT_ADRESSE` er tom, sendes ingenting og tekstene er som før.

## Innlogging til /admin

**Anbefalt: Cloudflare Access** (gratis, engangskode på e-post):

1. Cloudflare-dashbordet → **Zero Trust**. Første gang: velg et lagnavn og gratisplanen (Cloudflare kan be om et betalingskort selv om planen er gratis).
2. **Access → Applications → Add an application → Self-hosted.**
3. Navn: `rusj tallene`. Legg til to adresser (*public hostname*), begge med domenet `rusj-statistikk.<navn>.workers.dev`: én med sti `admin` og én med sti `admin/*`. **Ikke** beskytt hele tjenesten – da kommer ikke tellingen fra mobilene fram.
4. Policy: *Allow*, *Include → Emails →* din e-postadresse.
5. Innloggingsmetode: **One-time PIN**. Lagre.
6. Åpne programmet igjen, kopier **Application Audience (AUD) Tag**, og gi den til hovedøkta. Den skrives i `ACCESS_AUD` i `wrangler.toml`, og tjenesten publiseres på nytt.

Da åpner du `https://rusj-statistikk.<navn>.workers.dev/admin`, skriver e-postadressen din og koden du får.

**Reserve: nøkkelen.** Uten Access (eller hvis Access skulle slippe deg inn uten at tjenesten kjenner deg igjen) viser `/admin` et felt for nøkkel. Lim inn `RUSJ_ADMIN_NOKKEL` fra `.env`. Nøkkelen huskes bare til fanen lukkes, og den står aldri i adressen.

## Slå alt av igjen

1. Tøm `STAT_ADRESSE` i `scripts/rusj.mjs` og publiser rusj.no. Da sendes ingenting mer, og tekstene blir som før.
2. Slett tallene og tjenesten (hovedøkta, med samme `set -a; . ../.env` først):
   ```bash
   npx --yes wrangler@4.160.0 delete rusj-statistikk
   npx --yes wrangler@4.160.0 d1 delete rusj-statistikk
   ```
3. Slett Access-programmet under Zero Trust → Access → Applications.

## For den som vedlikeholder

| Fil | Hva |
|---|---|
| `src/index.js` | Tjenesten: `POST /t` (telling), `GET /admin`, `GET /admin/data.json`, `GET /` og nattlig sletting |
| `src/nokler.js` | Den faste lista over tellernavn |
| `src/tall.js` | Fra tellere til tallene på siden |
| `src/side.js` | Admin-siden (HTML uten noe utenfra) |
| `src/spilliste.js` | Spillnavn og dagens oppgaver – lages av `node statistikk/oppdater-spilliste.mjs` |
| `schema.sql` | Tabellen |
| `KLIENT.md` | Avtalen med nettsiden (på engelsk) |
| `../rusj/kit/stat.js` | Avsenderen på nettsiden |

- Nytt eller omdøpt spill: kjør `node statistikk/oppdater-spilliste.mjs`, så `npm test` her, og publiser tjenesten på nytt. Testen `oppsett.test.mjs` feiler til lista er oppdatert.
- Testene: `npm test` i denne mappa (Node 24, ingen pakker). Databasen i testene er Nodes innebygde SQLite med `schema.sql`.
- Endringer i tabellen: lag `schema-2.sql` som tåler å kjøres to ganger, kjør den med samme `d1 execute`-kommando, og skriv den opp her.
- Bremsen på `/t` (600 forespørsler i minuttet per Cloudflare-senter, ikke per person) står i `wrangler.toml` under `[[ratelimits]]`. Vil du heller bruke Cloudflares egne regler, slett de linjene; tjenesten virker uten.
- Lokalt: lag `.dev.vars` med `LOKAL="1"` og `ADMIN_NOKKEL="…"` (minst 32 tegn), kjør `npx wrangler@4.160.0 d1 execute rusj-statistikk --local --file=schema.sql` og `npx wrangler@4.160.0 dev`. `LOKAL="1"` slipper inn `http://localhost`; den skal aldri settes i drift.
