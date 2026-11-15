# Tallene for rusj.no – anonym telling

Denne mappa er en liten tjeneste hos Cloudflare som teller hvor mange som bruker rusj.no, hvilke spill som blir spilt, og om folk kommer tilbake. Du ser tallene på en egen side (`/admin`) på mobilen. Den enkleste veien dit er **rusj.no/admin/**.

Kort sagt: **vi teller, vi sporer ikke.** Nettleseren sender noen ord fra en fast liste («en side ble åpnet: Ordugla», «var her også i går»), og tjenesten legger 1 til en sum for dagen. Det finnes ingen ID, ingen informasjonskapsler og ingen IP-adresser i databasen. Det er umulig å følge én person fra dag til dag, også for oss.

## Hva som telles – og hva som ikke telles

| Telles (bare som en sum per dag) | Telles ikke |
|---|---|
| Hvilke sider og spill som åpnes | Navn, det dere skriver, svar og poeng |
| At et spill ble startet og spilt ferdig | Innstillinger (antall spillere, nivå, modus …) |
| At et nytt besøk begynte | Klokkeslett (bare datoen) |
| Om enheten var innom i går, siste uke, lenger siden eller aldri før – det regner nettleseren ut selv | Noen ID for person, enhet eller økt |
| Første gang denne uka / denne måneden (for «ulike enheter per uke og måned») | Informasjonskapsler (cookies) |
| Om rusj er åpnet fra hjemskjermen (som app), og første gang det skjer på en enhet («ny installasjon») | IP-adresse, nettlesertype, nettleserens språk |
| Hvor lenge et besøk varer, i grove grupper: under 1, 1–3, 3–10, 10–30, over 30 minutter | Adressen folk kom fra (bare gruppen, se under) |
| Dagens oppgaver: hvilke som er løst, hvor mange av dem, og dager på rad i grupper | Hvor i verden folk er |
| Per besøk: utgaven (norsk, engelsk, dansk), typen enhet (mobil, nettbrett eller PC) og hvor besøket kom fra (søkemotor, sosiale medier, direkte eller annen) – nettleseren velger gruppen selv | Skjermstørrelse, modell eller annet om enheten |
| At et spill fikk en feil (høyst én per sidevisning, bare hvilket spill) | Feilmeldingen, fila eller linja |
| Spill på nett: rom laget, kamper startet og spilt ferdig (telles på mobilen som lager rommet) | Romkoder, kallenavn eller trekk |
| Julekalenderen: skriv ut, påminnelse og juletreet (knappene) | |

Dette er sant fordi tjenesten er bygd slik:

- Databasen har to tabeller med tre kolonner hver: **dag**, **navn på telleren** og **antall** – og en med det samme per **måned** (summene for hele måneder, laget om natten fra dagstallene). Det finnes ingen plass å legge noe annet.
- Tjenesten godtar bare tellernavn fra en fast liste (`src/nokler.js`). Alt annet kastes. «Hvor besøket kom fra» kan bare være ett av fire ord (`sok`, `sosial`, `direkte`, `annen`), så en adresse kan aldri lagres.
- Tjenesten leser ikke IP-adresse, nettlesernavn eller hvor folk kom fra, og skriver ingen logger. Den eneste forespørselen den selv gjør, er å spørre rusj-nett om den svarer (når du åpner `/admin`). Testene i `test/personvern.test.mjs` sjekker selve koden for dette.
- «Ny eller tilbake» regnes ut **i nettleseren** fra en liten lapp den har selv (`rusj.stat`). Lappen sendes aldri; bare svaret («i går») sendes. Det samme gjelder utgave, type enhet og kilde: nettleseren slår opp selv (skjermen, og adressen den kom fra mot en fast liste over søkemotorer og sosiale medier) og sender bare ordet.
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

## Admin-siden

- **Kort vei:** `rusj.no/admin/` (og `/en/admin/`, `/da/admin/`) sender deg videre til `/admin` her. Siden lages av byggingen av rusj.no bare når `STAT_ADRESSE` er satt, og står ikke i sitemap, spillister eller frakoblet-lista.
- **Som app på mobilen:** åpne `/admin`, logg inn, og velg «Legg til på Hjem-skjerm». Den heter **rusj admin** og har eget ikon. (Ikonet og `manifest.webmanifest` ligger under `/admin/`, altså bak Access.)
- **Periode:** knappene 7, 30, 90, 365 dager og Alt (`/admin?p=30`). Alle tall er hele dager til og med i går, og prosenten ved et tall er endringen fra like mange dager rett før.
- **Innhold:** nøkkeltall, diagrammer per dag (opptil 90 dager), per uke og per måned (opptil 25 måneder), spilltabell (trykk på en overskrift for å sortere; `?sort=startet|ferdig|prosent|endring|navn`) med 8 ukers minidiagram, «stiger mest» og «faller mest», nye spill (de fire første ukene), fra besøk til ferdig spill, utgave/type/kilde, dagens rusj, julekalenderen, spill på nett, og drift (feil per spill, om databasen og rusj-nett svarer, månedstallene og siste dag med tall).
- **Last ned:** `/admin/eksport.csv?fra=ÅÅÅÅ-MM-DD&til=ÅÅÅÅ-MM-DD` gir dagstallene som CSV (`dag,nokkel,n`), høyst 800 dager om gangen. Samme innlogging som siden; lenkene står nederst under «Drift».
- **Klokkeslett** for siste telling vises ikke: tjenesten lagrer bare datoen (det står i personvernteksten). Siden viser i stedet siste dag med tall og hvor mange tellinger som er kommet i dag.

## Oppdatering november 2026: månedstall og ny admin-side

Gjør dette i rekkefølge (Terminal, i mappa `~/dev/luringen/statistikk`, med `set -a; . ../.env; set +a` først):

1. Månedstabellen (trygg å kjøre flere ganger):
   ```bash
   npx --yes wrangler@4.160.0 d1 execute rusj-statistikk --remote --file=schema-2.sql
   ```
2. Testene, så tjenesten: `npm test` og `npx --yes wrangler@4.160.0 deploy`.
3. Publiser rusj.no (de nye tellerne sendes først når nettsiden er oppdatert, og `/admin/` på rusj.no kommer da).
4. Sjekk `https://rusj-statistikk.<navn>.workers.dev/admin`: under «Drift» skal «Spill på nett (rusj-nett)» stå som OK.

Natten etter (04:17 eller 05:17 norsk tid) legges alle hele måneder sammen. Før det henter siden alt fra dagstallene, så tallene er riktige uansett.

**Hva det koster:** D1 er gratis opp til 5 millioner leste rader per døgn. Én visning av siden leser omtrent 63 dager × antall ulike tellere per dag (i dag noen hundre), pluss 50 rader for månedsdiagrammet: rundt 15 000–20 000 rader for 7 og 30 dager, opptil om lag 45 000 for 90 og 365 dager. Selv 50 visninger om dagen blir under 1 million. Nattjobben leser én rad per måned for å se hva som mangler, og én måned med dagstall når en ny måned skal legges sammen.

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
| `src/index.js` | Tjenesten: `POST /t` (telling), `GET /admin` (`?p=`, `?sort=`), `GET /admin/data.json`, `GET /admin/eksport.csv`, manifest og ikoner, `GET /`, og nattjobben (sletting og månedstall) |
| `src/nokler.js` | Den faste lista over tellernavn |
| `src/tall.js` | Fra tellere til tallene øverst på siden og for én periode |
| `src/tavle.js` | Admin-siden for en valgt periode: sammenligning, diagrammer, spilltabell, nye spill, grupper – og hvilke dager og måneder som må leses |
| `src/helse.js` | Spør rusj-nett om den svarer (den eneste forespørselen tjenesten gjør) |
| `src/side.js` | Admin-siden (HTML og SVG uten noe utenfra) |
| `src/ikon.js` | Ikonet til «rusj admin» – lages av `node statistikk/lag-ikon.mjs` |
| `src/spilliste.js` | Spillnavn og dagens oppgaver – lages av `node statistikk/oppdater-spilliste.mjs` |
| `schema.sql` | Tabellen med dagstall |
| `schema-2.sql` | Tabellen med månedstall (kjøres én gang, november 2026) |
| `KLIENT.md` | Avtalen med nettsiden (på engelsk) |
| `../rusj/kit/stat.js` | Avsenderen på nettsiden |

- Nytt eller omdøpt spill: kjør `node statistikk/oppdater-spilliste.mjs`, så `npm test` her, og publiser tjenesten på nytt. Testen `oppsett.test.mjs` feiler til lista er oppdatert.
- Testene: `npm test` i denne mappa (Node 24, ingen pakker). Databasen i testene er Nodes innebygde SQLite med `schema.sql` og `schema-2.sql`.
- Endringer i tabellene: lag `schema-3.sql` som tåler å kjøres to ganger, kjør den med samme `d1 execute`-kommando, og skriv den opp her. (`schema-2.sql`: månedstall, november 2026.)
- `wrangler.toml` har `compatibility_flags = ["global_fetch_strictly_public"]`: uten den nekter Cloudflare at én Worker spør en annen på samme `workers.dev`-navn (feil 1042), og helsesjekken av rusj-nett ville alltid feile.
- Bremsen på `/t` (600 forespørsler i minuttet per Cloudflare-senter, ikke per person) står i `wrangler.toml` under `[[ratelimits]]`. Vil du heller bruke Cloudflares egne regler, slett de linjene; tjenesten virker uten.
- Lokalt: lag `.dev.vars` med `LOKAL="1"` og `ADMIN_NOKKEL="…"` (minst 32 tegn), kjør `npx wrangler@4.160.0 d1 execute rusj-statistikk --local --file=schema.sql` (og `--file=schema-2.sql`) og `npx wrangler@4.160.0 dev`. `LOKAL="1"` slipper inn `http://localhost`; den skal aldri settes i drift.
