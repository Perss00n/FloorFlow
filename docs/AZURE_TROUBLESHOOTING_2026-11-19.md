# FloorFlow: undersökning av Azure App Service, 2026-11-19

Undersökt via operatörens redan inloggade Chrome-session, Azure Portal,
skrivskyddade Azure CLI/ARM-frågor, GitHub Actions och lokala tester.
Slutlig sparad status: **2026-11-19 03:30:57 UTC / 04:30:57 svensk tid**.
Ingen Azure-konfiguration, brandvägg, databas, roll eller kostnadsnivå ändrades.
Ingen publicering, omstart, commit, push eller workflow-dispatch utfördes.
Ingen Azure SQL-anslutning eller AI-inferens kördes under undersökningen.

## Resultat och grundorsak

| Fråga | Bedömning | Evidens och begränsning |
| --- | --- | --- |
| Varför 403? | Bekräftad spärr i Azure före Express. | HTTP och HTTPS ger 403 med `Web App - Unavailable`, utan appens CSP-header. Diagnostics visar **403.67, Site Disabled (quota enforcement or stopped)**. Även Kudu returnerar Site Disabled. |
| Vilken kvot överskreds? | Fortfarande okänt. Ingen visad aktuell överförbrukning styrker spärren. | `state=QuotaExceeded`, `usageState=Exceeded`, samtidigt noll CPU/minne/data. Flera API-gränser är `-1`, vilket inte ger en användbar gränsjämförelse. |
| Varför avslutas Node? | Bekräftat uppstartsfel som fångas av FloorFlows catch-block. Databassteget är huvudmisstanken. | Containerloggen innehåller appens generiska uppstartsfel. Saknad modul/schemafil skulle ha fallerat före detta catch-block. Sparade inställningar validerar; den exakta felorsaken kastas bort i nuvarande kod. |
| Är felen relaterade? | Möjligt, inte bevisat. | Misslyckade starter och Azure-spärren förekommer i samma tidsperiod. Det finns ingen exponerad händelse som visar att uppstartsfelet utlöste just kvotspärren. |
| Kan F1 fungera? | Ingen identifierad kod- eller portbegränsning kräver B1. Azure-drift på F1 är ännu inte bevisad. | Faktiskt paket laddas i Linux/Node 24.22.3; uppdaterad kod kan binda till `0.0.0.0:8080`. Plattformsspärren och anslutningen från appcontainern återstår. |
| Minsta nästa kodändring? | Rapportera uppstartssteg och en fast felkategori vid fel. | Förberedd och testad lokalt; inget behöver ändras i nätverk, autentisering eller TLS för att få denna diagnostik. |

Nollvärdena bevisar inte att en tidigare kvot aldrig överskreds. CPU- och
minnesdetektorerna rapporterar **No workers have been assigned to your app**;
en blockerad app förbrukar heller ingen aktuell worker-CPU. En kvarhängande eller
felaktig kvotstatus är en möjlig plattformsförklaring, inte en fastställd rotorsak.

`WPStopRequests=45` har nästa återställning 04:00 UTC och rapporterad gräns `-1`.
Detta är en observation, **inte bevis för en dold stoppkvot**. Varken hämtad
diagnostik eller granskad primärdokumentation fastställer en sådan gräns.

## Vad som faktiskt kontrollerades

### Azure och plattform

- Subscription: `Enabled`. Webbapp: `enabled=true`, `availabilityState=Normal`,
  `state=QuotaExceeded`, `usageState=Exceeded`, HTTPS Only på.
  `availabilityState=Normal` är inte ett fungerande HTTP-/beredskapsbevis.
- Planen är fortfarande **F1 / Free**, Linux, en worker och **en enda app**.
  ARM visar `status=Ready`, `powerState=Running`, `provisioningState=Succeeded`.
- Runtime `NODE|24-lts`, startup `node src/server.js`, Always On av,
  ingen särskild health-check-path, inga warm-up-statusinställningar i appsettings.
- Kvotsidan i Portal visar CPU dag 0/60 minuter, CPU kort 0/3 minuter,
  minne 0/1024 MiB och utgående data 0/165 MiB.
  Filsystemets sista API-värde var 4 353 024/1 073 741 824 bytes, cirka 4,15 MiB.
- Kvot-API:t lästes mer än en gång över en kort återställningsgräns;
  webbappen förblev `QuotaExceeded`. Det bevisar ingen återställning av dygnskvoterna.
- Senast angivna reset: kort CPU 03:36 UTC/04:36 svensk tid;
  minne och WPStopRequests 04:00 UTC/05:00 svensk tid den 19 november;
  dygnsräknare 00:00 UTC/01:00 svensk tid den 20 november.
  API-tider utan explicit tidszon har tolkats enligt App Services UTC-kvoter.
- Activity Log: tre misslyckade `Microsoft.Web/serverfarms/write` vid
  **03:13:46, 03:14:37 och 03:14:57 UTC**. HTTP 409 Conflict,
  utökad felkod **03029**, `No available instances to satisfy this request`.
  Detta styrker kapacitetsfel för skalningsförsöken; det bevisar inte orsaken till
  F1-appens kvotspärr. Inga nya skalningsförsök gjordes.
- Sista skalningsfelets correlation ID: `c56a947b-1cca-4db6-abc8-095816959674`.
  Tidigare omstart lyckades enligt Activity Log **02:53:29 UTC**.
  Ingen omstart gjordes i denna undersökning.
- Resource Health-frågan gav `AuthError`. `Microsoft.ResourceHealth` är
  **NotRegistered**. Providern registrerades inte. Ingen slutsats om aktuell
  regional hälsa kan dras från detta svar.
- SCM och FTP Basic Publishing är fortfarande **false**.
- Appens access restrictions innehåller standardregeln Allow all;
  detta är inte en bekräftad förklaring till den observerade Site Disabled-spärren.

### Diagnostics och loggar

Portalens **Web App Down** och **Web App Troubleshooter** granskades.
Motsvarande ARM-detektorer och HTTP4xx/CPU/minnesdetektorer hämtades.

- HTTP 503 förekommer historiskt; uppstartsanalysen visar
  **App Container Failed to Start / Application timed out**.
- Två starter runt 02:21–02:23 och 03:03–03:04 UTC syns i detektorernas
  olika rapporter. Tidsangivelserna skiljer sig mellan detektorerna och är
  inte en exakt gemensam processlogg.
- Loggutdraget visar Node **v24.22.3**, genererat startskript som sätter
  `PORT=8080` om värdet saknas, extrahering av moduler och körning av serverfilen.
  Därefter kommer FloorFlows eget generiska uppstartsfel; ingen listening-rad syns.
- Total tid cirka **15,81 sekunder** i det hämtade utdraget omfattar även
  plattformens uppstart. Den får inte tolkas som uppmätt tid för databasanslutningen.
- Certifikatuppdateringen i containern rapporterar framgång. Det bevisar
  inte att Node godkänner PostgreSQL-serverns faktiska certifikatkedja.
- Direkt läsning av Kudu-loggindex med Entra gav **403 Site Disabled**.
  ARM-anropet för containerloggar gav 404. Ingen Basic-autentisering aktiverades.
- LogViewer-detektorn hänvisar till Advanced Tools och ger inga ytterligare loggar.
  Appens vanliga fil-/HTTP-loggning är avstängd; den aktiverades inte.
- Diagnostik-API:t kräver en sluttid minst cirka **14,5 minuter bakåt**.
  De slutligt sparade detektorfrågorna slutar 03:10 UTC. De är därför historisk
  evidens; aktuell status och de publika HTTP-proven kontrollerades separat.

### Inställningar, databas och TLS

- Inställningarna lästes utan att skriva ut lösenord eller nycklar.
  Hela den sparade konfigurationen skickades privat via stdin till
  `readRuntimeConfig`: **godkänd**. HOST är `0.0.0.0`, NODE_ENV `production`,
  PGSSLMODE `verify-full`, TRUST_PROXY `false`, PROXY_DIAGNOSTICS `on`.
  PORT saknas bland användarinställningarna; App Services startskript har 8080-fallback.
- AI-inställningarna är tomma. `configureAssistant({})` returnerar null;
  ingen modellklient eller AI-databaspool behövs för denna start.
- `src/db.js` kontrollerar fem PG-variabler vid modulimport, före try-blocket.
  Den observerade catch-raden visar att den körningen hade dessa variabler
  ifyllda och kunde importera modulerna. Den bevisar inte att värdena var korrekta.
- PostgreSQL är **Ready**, version **18**, med rätt FQDN och publik åtkomst.
  Alla **13 aktuella outbound-IP-adresser** finns som exakta brandväggsregler.
  Ingen regel för hela Azure/range behövde införas.
- Regeln `stage5b-bootstrap-temporary` finns också kvar. Den ändrades inte.
- Installerad `pg` **8.23.1** tolkar miljövärdet `verify-full` som TLS på,
  använder Nodes certifikatkontroll och sätter SNI till DNS-värdnamnet.
  Ingen CA-fil saknas i deployment-allowlisten eftersom appen inte anger en egen CA-fil.
- Det är **inte verifierat från appcontainern** att DNS, TCP, TLS och
  autentisering som `floorflow_app` fungerar. En lyckad kontroll från datorn
  är enligt uppdragets bakgrund redan gjord, men ersätter inte detta bevis.
- Befintliga databasmetrikvärden 02:10–03:10 UTC: 0 misslyckade och 198 lyckade
  anslutningar. De identifierar inte användare/källa och kan omfatta systemanslutningar;
  de bevisar alltså inte att FloorFlow autentiserades. TLS-/nätverksfel kan inträffa
  innan en autentisering når databasen.
- `log_connections=on`, men nedladdning av serverloggar är avstängd och inga
  diagnostic settings exporterar databasloggar. Logglistan var tom.
  Inga logginställningar ändrades.

### Kod och faktiskt deployment-paket

Samtliga efterfrågade filer lästes, inklusive proxy-/preview-koden och båda
deployment-guiderna, workflowen samt relevanta pg-/AI-/schemaberoenden.

Uppstartsordning: modulimport → runtime-konfiguration → databasens `SELECT 1`
→ assistant-konfiguration → Express-app → bind/listening. HTTP-servern börjar
alltså inte lyssna om databasprovet misslyckas. Databasens anslutningsfrist är
3 sekunder; det kan vara en felkälla men är inte uppmätt som orsaken här.

- [Deployment 44442967466](https://github.com/Perss00n/FloorFlow/actions/runs/44442967466)
  och CI för samma commit `56db0671fff34595b89fdacc48aa04a88d0a02a7` är gröna.
  Deployment-loggen bekräftar lyckad OneDeploy cirka **02:16:50 UTC**.
  Workflowen gör inget efterföljande autentiserat health-200-test.
- Den verkliga körningsartefakten hämtades: `floorflow-44442967466-1`.
  ZIP-checksumman matchar dess medföljande checksumma:
  `3f96feb35f643b4d250c047f8abe5c1e5237aedb0eaf83b2d36bbe4879c58b34`.
- **4 956 ZIP-poster**, **33 projektfiler** jämförda byte för byte mot det
  rena lokala checkoutet före diagnostikändringen. Inga skillnader.
  Krävd schemafil och runtime-beroenden finns; CRC-kontrollen passerar.
  Ingen `.env`, projektverktyg, tester eller privata rapporter hittades i paketet.
- Paketet extraherades och importtestades i befintlig lokal
  `node:24-bookworm-slim`: Linux/x64, **Node 24.22.3**, AI av, externt nätverk av.
  Detta är lokal Linux-verifiering, inte bevis för filsystemet inne i Azure.

## Proxybedömning

Den nuvarande 403.67-spärren ligger före Express. `TRUST_PROXY=false` kan
inte orsaka det fångade uppstartsfelet och ska inte ändras för att lösa detta.

När processen väl fungerar förväntas produktionsskyddet ge **426** över Azures
HTTP-hopp tills proxybetroendet har observerats och granskats. Detta är ett
separat, redan planerat nästa verifieringssteg. Det har inte verifierats live nu.
Ingen autentisering eller HTTPS-/TLS-kontroll har försvagats.

## Förberedda lokala ändringar och verifiering

- `src/server.js`: markerar configuration, database, assistant, application
  och listening. Vid fel loggas en fast rad med steg och säker felkategori.
- `src/runtime.js`: översätter endast kända felkoder till fasta kategorier,
  exempelvis `tls-verification-failed` eller `database-authentication-failed`.
  Okända fel blir `unclassified`; råa exceptions, meddelanden, SQL, hemligheter
  och godtyckliga felkoder kopieras inte till loggen.
- `test/runtime.test.js` och `test/startup.test.js`: verifierar kategorisering,
  sanering, konfigurationsfel före databasåtkomst, anslutningsfel och upptagen port.
- De statiska modulimporterna flyttades inte. Diagnostiken täcker fel inne i
  befintligt try-block; ett separat framtida modulimportfel ligger utanför den.

Faktiskt körd verifiering:

- Före ändring: **22/22** berörda Node-tester godkända.
- Efter ändring: **24/24** godkända, mot befintlig loopback-databas,
  med externa AI-inställningar tomma. Ett nytt test fick först justeras för
  Nodes befintliga `.env not found`-notis; sista körningen har inga fel.
- **9/9** Python-pakettester godkända; **45** JavaScript-filer syntaxkontrollerade;
  `git diff --check` godkänd.
- Lokalt Linux/Node 24.22.3: den faktiska serverfilen ger vid ett kontrollerat
  loopback-anslutningsfel exakt `stage=database reason=connection-refused`,
  exit 1 och ingen hemlighet/stacktrace. Express med stubbad databas binder
  till **0.0.0.0:8080** och stängs. Externt nätverk var avstängt.
- Hela testsviten kördes inte; befintliga 302 tester påstås inte vara omkörda här.

Ett lokalt diagnostikpaket har byggts från den hämtade körningsartefaktens
beroenden och endast de två ändrade runtime-filerna. Paketbyggarens slutkontroller
passerar; 33 projektfiler, 4 956 poster. Paketet är **inte publicerat**:

`.tmp/azure-investigation-20261119/floorflow-diagnostic.zip`

SHA256: `825f70e3af2cd654da0ed6073a2ebcc2fc327840647ba0276719ecd6fd638014`.

Sanerade ARM-detektorer, slutstatus och originalartefakt finns i samma ignorerade
undersökningskatalog. Appsettings och access token sparades inte där.

## Prioriterad fortsättning och godkännandegräns

1. Behåll F1 och läs status/kvoter igen efter **05:00 svensk tid den 19 november**.
   Det är nästa timåterställning, inte en garanti att tjänsten återhämtar sig.
   Dygnsåterställning är **01:00 den 20 november**. Ingen omstart krävs för själva
   statuskontrollen. Upprepade publika anrop behövs inte medan Site Disabled kvarstår.
2. Om Exceeded kvarstår trots återställning och låga värden: begär att Azure
   granskar backendens quota-enforcement-händelse för just webbappen och dess
   webspace `rg-floorflow-demo-SwedenCentralwebspace-Linux`.
   Bifoga tidsstämplar, 403.67, slutstatus och kvotvärden. Begär identifierad
   begränsning/återställning, inte planuppgradering. Supportkontakt skickades inte.
3. När SCM är åtkomligt: publicera **en gång, först efter uttryckligt godkännande**,
   det granskade diagnostikpaketet till befintlig webbapp. Detta är den första
   föreslagna miljöändringen och deploymenten innebär omstart.
   Bevara samtliga App Service-inställningar, F1, avstängd AI och Basic Publishing.
   Om det ska ske via GitHub krävs också separat uttryckligt godkännande för
   commit/push och manuell workflow-körning. Ingen sådan åtgärd är utförd.
4. Läs uppstartens fasta steg/kategori. Välj därefter exakt en riktad åtgärd:
   konfigurering, autentisering, DNS/nätverk, certifikat eller listening.
   Godkännande krävs innan någon sådan Azure-/databasändring.
5. Först efter bekräftad listening och databasanslutning återupptas den befintliga
   proxydiagnostiken och därefter autentiserad `/health`/REST-verifiering.

Att börja med en längre startup-timeout, svagare TLS, en bredare brandvägg,
TRUST_PROXY=true eller en betald plan saknar stöd i de hittills verifierade fynden.

## Primärkällor

- [Microsoft: App Service quotas and metrics](https://learn.microsoft.com/en-us/azure/app-service/web-sites-monitor):
  återställningsintervall och 403 vid CPU-/bandbreddsspärr.
- [Microsoft: Configure Node.js apps](https://learn.microsoft.com/en-us/azure/app-service/configure-language-nodejs):
  App Service tillhandahåller PORT; appen ska lyssna på detta värde.
- [node-postgres: SSL](https://node-postgres.com/features/ssl):
  TLS använder Nodes TLS-alternativ. Den installerade drivrutinens implementation
  granskades också direkt för den faktiskt låsta versionen.
