# FloorFlow: Ubuntu + Azure, 2026-11-19

Aktuell demo: **https://floorflow.marcuslehm.se/**. Applikationen körs på Ubuntu;
PostgreSQL och den verkliga GPT-5-mini-modellen finns kvar i Azure. App Service
används inte av denna installation. Äldre M6-/App Service-dokument beskriver
tidigare förberedelser och är inte driftinstruktionen för den här demon.

Senast publicerat: **20261119-09**. Den slutliga promptens tolv modelltester
och tre publika eftertester passerade, inklusive obefintlig kund med `0.00 SEK`
i Chrome. Se [AI_RELIABILITY_ACCEPTANCE](AI_RELIABILITY_ACCEPTANCE_2026-11-19.md)
för samtliga 42 journalförda modellförsök i omgången, de upptäckta affärsfelen och exakt
verifieringsomfattning. Riktad acceptans är godkänd för de redovisade fallen.
Tidigare rapporter är historik och bevisar ingen allmän felfrihet hos modellen.

## Arkitektur och avgränsning

```text
Webbläsare -- HTTPS --> Cloudflare -- krypterad befintlig tunnel --> Ubuntu
  cloudflared --> http://127.0.0.1:3302 --> FloorFlows Docker-container :3000
  FloorFlow -- verifierad PostgreSQL TLS --> Azure / floorflow
  FloorFlow -- HTTPS + API-nyckel --> Azure OpenAI / floorflow-sql
```

- SSH: `marcus@192.168.1.118`; projekt: `/home/marcus/apps/floorflow`.
- Compose-projekt: `floorflow`; enda tjänsten: `app`.
- Node **24.22.3**, officiell Bookworm slim-image låst med SHA-256 i Dockerfile.
- Separat Docker-nät: `floorflow_floorflow`, `172.29.44.0/28`, gateway `172.29.44.1`.
- Enda publicerade containerporten är **127.0.0.1:3302**. Ingen databascontainer,
  värdvolym, Docker-socket eller SSH-route hör till FloorFlow.
- Processen körs som `node`, med skrivskyddat filsystem, en liten `/tmp`, inga
  Linux-capabilities, `no-new-privileges`, 256 MiB minnesgräns och loggrotation
  (3 × 5 MB). Kör exakt en instans: klienträknare och kö är processlokala;
  den globala tim-/dygnsbudgeten har separat beständig lagring.
- Egen bind mount `./state:/app/state`: ägare 1000:1000, katalog 0700 och
  räknarfil 0600. Den innehåller bara antal och UTC-tidsfönster, inga kunduppgifter
  eller IP-adresser. `AI_BUDGET_FILE=/app/state/ai-usage.json` sätts i Compose.
  Nollställ/radera inte filen vid uppdatering eller rollback. Den återanvänder
  inga Laravel-volymer. Root-filsystemet är fortsatt skrivskyddat.
- `restart: unless-stopped`; Docker och befintlig cloudflared är boot-aktiverade.
- Laravel, dess Compose-nät/volymer, `.env.server`, deployment-skript och timer
  återanvänds inte. Inga Laravel-containrar stoppades eller byggdes om.

## Inloggning och hemligheter

Preview-användare: `floorflow-demo`. Befintligt preview-lösenord återanvänds.
Det kan kopieras på Windows utan terminalutskrift:

```powershell
& 'C:\Users\Perss\source\repos\FloorFlow\.tmp\floorflow-demo\Copy-DemoPassword.ps1'
```

Windows-originalet är skyddat med DPAPI under användarens
`%LOCALAPPDATA%\FloorFlow\Demo`. Databasuppgifter hämtades selektivt från de två
befintliga DPAPI-filerna för **app** och **ai**. Administratörslösenord användes inte.
Endast nödvändiga inställningar överfördes via SSH; ingen hel `.env` kopierades.

Ubuntu: `config/runtime.env`, **root:root, 0600**, i en katalog med 0700.
Filen ingår inte i images, källkodspaket eller Git. Compose läser den med
`format: raw` så att lösenord inte tolkas som variabelsubstitution.
`.env` i serverns projektrot innehåller endast `FLOORFLOW_RELEASE`.

Visa inte `docker inspect` utan en begränsad `--format`, `docker compose config`
utan `--quiet`, `printenv` eller innehållet i runtime-filen: de kan visa hemligheter.
Ändra konfiguration vid behov med `sudoedit config/runtime.env`, och återskapa
därefter endast FloorFlow med `sudo docker compose up -d --no-build --wait app`.

Runtime använder `NODE_ENV=production`, `HOST=0.0.0.0`, `PORT=3000`,
`PGSSLMODE=verify-full`, `PGUSER=floorflow_app`, `AI_PGUSER=floorflow_ai` och
`TRUST_PROXY=172.29.44.1,127.0.0.1`. Loopback är den egna skyddade hälsoprobens
faktiska avsändare; gateway är den verifierade avsändaren för cloudflared-trafiken.
`PROXY_DIAGNOSTICS` används tillfälligt vid installation och stängs av efter kontroll.

## Azure och nätverksregler

Befintligt abonnemang och resursgrupp `rg-floorflow-demo` är oförändrade.

- PostgreSQL: `pg-floorflow-demo-6e9587.postgres.database.azure.com:5432`,
  databas `floorflow`, version 18. TLS verifierar CA-kedja och värdnamn.
- Enda PostgreSQL-regeln: `floorflow-ubuntu-home`, endast
  **81.235.27.27–81.235.27.27**. Vid kvalitetsgenomgången identifierades de 13
  äldre singletonreglerna mot gamla App Services outbound-lista, sparades för
  återställning och togs bort. Ingen Azure-resurs raderades.
- OpenAI: `oai-floorflow-demo-6e9587`; befintlig deployment `floorflow-sql`,
  `gpt-5-mini` / `2025-08-07`, GlobalStandard, befintlig kapacitet 10.
- Endpoint: `https://oai-floorflow-demo-6e9587.openai.azure.com/openai/v1/`.
  Befintlig kod använder Chat Completions med strikt JSON-schema, inga retries,
  20 sekunders timeout och högst 1 200 completion-tokens, inklusive reasoning.
  Sedan release 08 anges `reasoning_effort=low` uttryckligen. Ingen annan
  modellparameter eller kvot har ändrats i den riktade undersökningen.
- OpenAI ändrades från `publicNetworkAccess=Disabled`, default `Deny`, inga IP-regler,
  till **Enabled + defaultAction=Deny + exakt IP-regeln 81.235.27.27**.
  Inga tillåtande nätverksintervall eller Azure-services-bypass lades till.
- Deploymentens återlästa kvoter är **10 requests/min och 10 000 tokens/min**.
  Appens 12/minut per klient kan därför inte garantera 12 lyckade modellsvar.
  Kapacitet, modell, prompt, SQL-allowlist och roller ändrades inte i denna genomgång.

Den publika IP-adressen verifierades från Ubuntu före ändringen. Om internet-
leverantören ändrar den slutar databas/AI att fungera. Läs då den nya adressen
från Ubuntu, uppdatera bara dessa specifika regler och ta bort den gamla adressen.
Öppna aldrig `0.0.0.0/0` eller ”All networks”.

Azure-portalen visade **200,00 USD kvar och 27 dagar** före AI-testet. Det är
portalens visade saldo, inte en garanti om omedelbart uppdaterad förbrukning.
En indikativ GPT-5-mini-prisreferens är 0,25 USD/miljon input-tokens och
2 USD/miljon output-tokens; fem korta frågor uppskattades till under 0,03 USD.
Referensen är modellens publicerade listpris, inte en verifierad Azure-fakturarad.
Azure-portalen/avtalet avgör faktisk debitering; Retail Prices API gav inga matchande
rader i den riktade kontrollen. Ingen exakt fakturerad testsumma påstås här.
Ingen ny deployment, betald resurs, prenumerationsändring eller F1-ändring gjordes.

## Cloudflare och HTTPS

Befintlig tunnel `ubuntu-server`, ID `5ff478be-7f70-4e19-8efd-2eaedb4178dd`,
fortsätter i den oförändrade systemtjänsten. Den nya routen och CNAME skapades
separat i Cloudflare Dashboard → Networking → Tunnels → ubuntu-server → Routes:

| Hostname | Origin |
| --- | --- |
| `marcuslehm.se` | `http://127.0.0.1:8080` (befintlig, bevarad) |
| `floorflow.marcuslehm.se` | `http://127.0.0.1:3302` (ny) |

`www.marcuslehm.se` fortsätter omdirigera till `https://marcuslehm.se/`.
Ingen tunnel-token roterades och tjänsten behövde inte startas om.

Verkliga proxyprober visade peer **172.29.44.1** och ett enda
`X-Forwarded-Proto: https`. Cloudflare ersatte även inskickade `http` och
`https,http` med sitt verifierade protokoll. Vanlig HTTP avvisades med 426 och
ingen Basic-utmaning; HTTPS utan inloggning gav 401. Autentisering, HSTS, CSP,
`no-store` och parameteriserad SQL är kvar.

Windows/Pi-hole hade cachat ett negativt DNS-svar innan CNAME skapades.
Pi-holes dokumenterade `pihole reloaddns` tömde cachen utan server-/containeromstart,
och Windows DNS-cache tömdes. Inga DNS-inställningar ändrades.

## Starta, stoppa och felsöka

Anslut och arbeta alltid i **FloorFlows egen katalog**:

```bash
ssh marcus@192.168.1.118
cd /home/marcus/apps/floorflow

# Starta eller återuppta efter ett avsiktligt stopp:
sudo docker compose up -d --no-build --wait app

# Stoppa endast FloorFlow:
sudo docker compose stop app

# Starta om endast FloorFlow:
sudo docker compose restart app

# Status och begränsade loggar:
sudo docker compose ps
sudo docker compose logs --tail 50 app
sudo docker compose logs -f --tail 20 app

# Kontrollera stackens syntax utan att skriva ut hemligheter:
sudo docker compose config --quiet

# Befintlig tunnel; läs status, ändra inte Laravel eller dess timer:
systemctl is-active cloudflared docker marcuslehm-deploy.timer
systemctl is-enabled cloudflared docker
```

Efter `stop` krävs ett nytt `up`/`start`; `unless-stopped` respekterar ett avsiktligt
stopp. Om FloorFlow dör oväntat startar Docker om tjänsten. Ingen SSH-session
behöver hållas öppen. Befintlig cloudflared publicerar åter routen efter sin start.

- **401:** kontrollera preview-inloggningen.
- **426 via HTTPS:** kontrollera proxyadressen och protokollprober; sätt aldrig
  `TRUST_PROXY=true` som genväg.
- **503/ohälsosam tjänst:** läs den sanerade startup-kategorin i loggen, kontrollera
  DNS, aktuell publik IP, PG-brandväggen, roller och certifikat. Behåll verify-full.
- **422 från AI:** modellens SQL stöds inte av allowlisten. Formulera om frågan.
  Modellinstruktionen förtydligades i release `20261119-03`: använd tabellalias
  och `alias.kolumn`, aldrig `schema.tabell.kolumn`. Ändra inte valideringen för
  att släppa igenom en avvisad fråga.
  Release 07 förtydligar också SUM utan ROUND för mängder: ROUND med precision 3
  stöds inte. Release 09 instruerar enstaka namngiven kunds totalsumma med
  INNER JOIN, enbart FK-jämförelse i ON, filter i WHERE och COALESCE utan GROUP BY.
  Kundnamn matchas med LOWER på båda sidor; artikelbeskrivningar med ILIKE-
  substring och explicit SKU exakt. Ett nytt 422 ska diagnostiseras före
  exekvering; ersätt aldrig felet med en hårdkodad nolla.
- **429:** vänta enligt `Retry-After`. Gränserna är **12 giltiga frågeförsök per
  klient-IP/60 s, 100 modellstarter per UTC-kalendertimme, 200 per UTC-dygn,
  två aktiva arbeten och högst fyra väntande i FIFO-kö i högst fem sekunder**.
  Personer bakom samma NAT delar klientgränsen. Full/utgången kö ger 429 utan
  modellstart; giltiga försök räknas ändå mot minutgränsen. Tim-/dygnsräknare
  överlever omstart i `state/ai-usage.json`. UTC-dygn byts 01:00 svensk vintertid,
  02:00 sommartid. Provider-429 ger en gemensam paus enligt begränsad Retry-After,
  utan automatiska retries. Klienten visar väntetiden. Kör inte flera repliker.
- **AI 503 med usage budget unavailable:** kontrollera `state`-katalogens ägare,
  filrättigheter och innehållets format utan att nollställa räknarna. Återställ
  senaste bevarade korrekta räknarfil vid korruption. Vanliga webb-API fungerar
  även när AI-budgetfilen inte kan läsas/skrivas.
- **AI 502/icke-JSON:** vid ett reproducerat fall tog alla 1200 completion-tokens
  slut i reasoning (`finishReason=length`, `contentChars=0`). Node gav ett hanterat
  JSON-fel och Cloudflare-kedjan visade i stället HTML. Metadata finns som
  `floorflow-model-result` i app-loggen; frågor/SQL/resultat loggas inte.
  Alla fem historiska 502 har inte kunnat få en säker individuell förklaring.
  Klienten visar ett sanerat tjänstefel och kan återanvändas.
  Ett misslyckat startat modellanrop förbrukar fortfarande global budget.
- **AI 503/504:** kontrollera den specifika OpenAI-IP-regeln, endpoint,
  deployment-namn och tillgänglig kredit. Ingen automatisk reservmodell används.

## Uppdatera separat och återställ

Ingen ny timer eller GitHub-automatik behövs för demon. Uppdatering sker manuellt
med ett granskat paket från Windows; Laravels automatiska deployment berörs inte.

1. Granska arbetskopian och kör syntax/tester **mot lokal utvecklingsdatabas**, med
   modellinställningarna tomma. Källkodspaketet inkluderar arbetskopians ändringar;
   det innebär inte en commit eller push.
2. Skapa en unik release, exempelvis `20261120-01`:

```powershell
python scripts/build-ubuntu-package.py 20261120-01
scp .tmp/ubuntu/floorflow-20261120-01.tar.gz marcus@192.168.1.118:/home/marcus/apps/floorflow/incoming-20261120-01.tar.gz
```

På den här Windows-datorn finns också verifierad Python på
`C:\Users\Perss\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe`
om kommandot `python` pekar på Microsoft Store-genvägen. Använd då hela sökvägen
med PowerShell-anropsoperatorn `&` före sökvägen.

3. Läs SHA-256 från paketrapporten och kör på Ubuntu:

```bash
cd /home/marcus/apps/floorflow
sudo ./update.sh incoming-20261120-01.tar.gz 20261120-01 <SHA256-från-rapporten>
```

Paketeraren använder en explicit fillista och inkluderar inte `.env`, hemligheter,
Git, tester, seeders eller databasverktyg. Servern verifierar SHA-256 och alla
arkivposter, bygger först och byter sedan bara FloorFlow. Ändrad Compose-fil
avvisas för separat granskning. `config/runtime.env` ligger utanför releaserna.

Tidigare image/källkod och `.env` bevaras. Vid fel efter bytet försöker skriptet
återställa föregående release. Den automatiska felåterställningsgrenen har inte
provocerats i drift. Den normala uppdateringsvägen har körts till frisk release
**20261119-09**. Den första uppdateringens referens finns i
`backups/update-20261119-02/previous-release.txt` och `release.env`.

Manuell återgång från 09 till bevarad release 08, med samma budget-/köskydd:

```bash
cd /home/marcus/apps/floorflow
sudo ln -s releases/20261119-08 .current-restore
sudo mv -Tf .current-restore current
sudo sed -i 's/^FLOORFLOW_RELEASE=.*/FLOORFLOW_RELEASE=20261119-08/' .env
sudo docker compose up -d --no-build --wait app
```

Kontrollera därefter healthy, autentiserad publik frontend och API. Låt Compose,
runtime-konfiguration och `state/ai-usage.json` vara kvar. Releaser före 04 saknar
de nya gränserna. Release 08 har low-reasoning men saknar de senaste reglerna för
kundsummor och namn-/beskrivningsmatchning. Compose ändrades separat och säkerhetskopierades vid 04, eftersom
den manuella uppdateraren avsiktligt avvisar en ändrad Compose-fil. Ingen ny
deployment-automatik installerades. Uppdateraren inkluderar inte dokumentation;
driftguiderna förvaras separat i serverns `docs/`.

Full avveckling: stoppa bara FloorFlow, ta bort bara dess hostname/CNAME i
Cloudflare och regeln `floorflow-ubuntu-home` i PostgreSQL. Återställ vid behov
OpenAI till dess sparade utgångsläge (Disabled, Deny, tom IP-lista), efter kontroll
att ingen annan ny konsument behöver regeln. Radera inga Azure-resurser eller den
gemensamma tunneln. Windows-reservdemon är bevarad och stoppades inte.

## Verifiering och återstående gränser

Senaste riktade acceptansen gäller release **20261119-09**:
338 lokala tester och 30 publika HTTP-kontroller passerade. Alla tolv riktiga
modelltester med slutprompten samt två publika API-test och ett Chrome-test
passerade; belopp, enheter och relevant SQL bedömdes enligt facit. SQL-validator,
databaslager, roller, TLS, proxy trust, rate limits och brandvägg behölls.
Totalt 42 modellförsök användes efter användarens uttryckliga utökning från 30
till 42; uppskattad tokenkostnad 0,04533 USD. Ingen automatisk retry gjordes.
Se [acceptansrapporten](AI_RELIABILITY_ACCEPTANCE_2026-11-19.md) för alla utfall,
inklusive två HTTP-200/operatörs-200-svar med felaktig nolla före sista ändringen.

Föregående release-08-felsökning finns i
[felundersökningen](AI_FAILURE_INVESTIGATION_2026-11-19.md); dess fel och
budgetöverträdelse är historik och har inte skrivits om.

Föregående breda genomgång, slutlig release **20261119-05**:

- **317/317 lokala tester**, noll överhoppade, och syntaxkontroll av 49 JS-filer.
- Före publicering: autentiserade Ubuntu-kontroller; efter: 30 publika
  HTTP-kontroller från Windows. Externa HTTPS-prober från två olika AS-nät i
  Sverige och USA nådde inloggningsskyddet. Authentiserad riktig Chrome visade
  Harbor Office Studio och korrekt 109000.00 SEK från verklig modell.
- Förfalskad X-Forwarded-For ändrade inte Express klient-IP för de två externa
  näten. Bara HMAC-fingeravtryck loggades; diagnostiken är nu avstängd. Samma
  uttryckliga TRUST_PROXY gäller. Vissa kombinerade spoofheaders stoppades av
  Cloudflare före appen och räknas som edge-skydd, inte test av appens parsing.
- PostgreSQL och OpenAI har återlästs med endast serverns exakta utgående IP.
  Ingen giltig backend-inloggning skickades från tredjepartsnät; externa OpenAI-
  prober utan nyckel gav 401 och bevisar inte nätspärr efter autentisering.
- App-pool max 10, AI-pool max 2, PostgreSQL max_connections 50. Ett isolerat
  loopbackprov med stubbad modell och riktiga read-only SQL-läsningar tog emot
  100 samtidiga försök: sex slutförda, 94 förväntade 429, aldrig fler än två aktiva.
  AI-poolen hade noll väntande anslutningar. Detta är inte 100 riktiga AI-anrop.
- Två riktiga samtidiga modellfrågor lyckades. Tim-/dygnsfilen behölls exakt vid
  containeråterskapning och separat uppdatering 04→05. Laravel-identiteter,
  starttider och skyddade filhashar var oförändrade. Tunneln fortsatte köras.
- **20 riktiga frågor: 13 godkända, fem 502, två 422.** Alla returnerade belopp
  matchade oberoende Azure-facit och relevant SQL granskades affärsmässigt.
  Legitima mängdfrågor för oak fungerar ännu inte tillförlitligt. Ingen SQL-regel
  försvagades. Uppskattad tokenkostnad cirka **0,04068 USD**, inte fakturerat belopp.
- Inget långt belastningsprov, ingen hel VM-omstart eller avsiktlig live-
  uttömning av Azure-kvoten. Windows-reservdemon bevarades. Se kvalitetsrapporten
  för exakta frågor, fel, SQL, tokenunderlag och skillnader mellan bevisnivåerna.

### Historik från den ursprungliga hybridinstallationen

Följande avser tidigare releaser och de tidigare lägre gränserna. Aktuella
värden och resultat står ovan.

- **304/304 lokala Node-tester** passerade mot befintlig lokal utvecklingsdatabas,
  med externa AI-inställningar tomma. Dessa tester är inte körda mot Azure.
- Riktig Ubuntu-build/start och separat uppdatering till `20261119-02`: healthy.
- Azure från Ubuntu: DNS, anslutning, TLS 1.3/256 bit, verifierad certifikatkedja
  och värdnamn, login som båda runtime-rollerna och SELECT på alla fyra tabeller.
- Båda rollerna saknar adminflaggor, medlemskap, databas-/schema-CREATE/TEMP och
  samtliga skrivprivilegier på app-tabellerna. UPDATE med `WHERE false` nekades
  med 42501 även efter explicit READ WRITE; inga rader ändrades.
- Data: 5 kunder, 12 order, 12 artiklar och 48 orderrader. Den faktiska AI-rollens
  permission-kontroll och normaliserade SELECT passerade.
- **30 publika HTTP-kontroller från Ubuntu och 30 från Windows** passerade:
  autentisering, proxyspoofing, HTTPS/HTTP, statiska filer, kund/order-API,
  totalsumma/rader, skyddade interna sökvägar och avvisade AI-indata.
- Publikt samtidighetsskydd gav 429 och Retry-After=60, även med förfalskad
  X-Forwarded-For. Gränserna fem/minut och 30/timme har automatiska mocktester;
  vi förbrukade inte modellbudget för att tömma hela timkvoten.
- **305/305 lokala tester** och syntaxkontroll av 45 JavaScript-filer passerade efter
  promptändringen. Inga testfall hoppades över; lokal databas och mockmodell användes.
- Första omgången: fem spårade frågor. Kundantal fungerade i API och riktig Chrome;
  två försäljningsfrågor avvisades med 422. En separat modellfråga gav giltig
  försäljnings-SQL som sedan verifierades mot Azure med resultat `285415.00`.
- Användaren godkände högst tre extra anrop. **Två användes**: ett diagnostikanrop
  fångade `public.order_items.quantity`, vilket den befintliga valideringen avvisar;
  därefter fungerade samma typ av försäljningsfråga genom hela gränssnittet efter
  ett förtydligande om tabellalias i systemprompten. **SQL-reglerna ändrades inte.**
- Azure Monitor visade en extra tjänsteförfrågan utöver fem spårade initiala frågor.
  Den räknades konservativt mot testutrymmet, därför användes bara två tilläggsanrop.
  Tjänstemetrik och lokal frågejournal har inte en garanterad ett-till-ett-mappning;
  Azure-metrikerna kan dessutom släpa efter det sista browseranropet.
- **Publik Chrome-verifiering slutförd efter manuell inloggning**: fem kunder,
  Maple Property Group, tre order, FF-2026-001 med fyra orderrader och
  `36,117.00 SEK`. Verklig AI visade **Customer count: 5** samt slutligen
  **Total sales: 285,415.00 SEK**, resultattabell och normaliserad parameteriserad
  SQL med LIMIT 51. Inget mockläge används i Ubuntu-demon.
- Verifieringsbilder på Windows: `.tmp/hybrid-20261119/public-ai.jpg`,
  `public-order.jpg` och `cloudflare-routes.jpg`. Den fungerande demo-fliken
  lämnades öppen i Chrome.
- Laravel-containrarnas identiteter, images och starttider samt hashvärden för
  dess `.env.server`, Compose, deployment-skript/tjänst/timer och cloudflared-filer
  jämfördes med baslinjen och var oförändrade. cloudflared behöll PID 5122.
  `marcuslehm.se` gav 200; `www` gav förväntad 301.
- Automatisk återstart efter en kontrollerad SIGKILL av endast FloorFlows Node-server
  lyckades: samma container blev healthy med restart count 1 efter att den första
  SSH-sessionen avslutats. Uppmätt minne var cirka 39 MiB av 256 MiB.
  Hela Ubuntu har inte startats om, för att bevara övrig drift.
- Den separata uppdateringsrutinen publicerade release `20261119-02` och därefter
  slutversion **`20261119-03`** med promptförtydligandet; den behöll
  tidigare release/image. Automatisk rollback vid ett framtida uppdateringsfel
  finns i skriptet, men har inte provats med avsiktligt felaktig release.
- Ingen extern portskanning eller full last-/långtidstest har genomförts.

Baslinjer ligger privat på servern under `backups/baseline`. Sanerade lokala
arbetsrapporter ligger i `.tmp/hybrid-20261119`; de innehåller inte hemligheter.
Tillfällig sudo-DPAPI och det extra inmatningsskriptet tas bort vid avslutat arbete.
Windows Quick Tunnel-reservens två processer och adress bevarades och gav
fortfarande den förväntade skyddade 401-responsen. Inga commits eller pushar gjordes.

## Primärkällor

- [Microsoft: Foundry nätverksregler och Selected Networks](https://learn.microsoft.com/en-us/azure/ai-services/cognitive-services-virtual-networks)
- [Microsoft: Azure OpenAI-priser](https://azure.microsoft.com/en-us/pricing/details/azure-openai/)
- [Modellens indikativa listpris: GPT-5-mini](https://developers.openai.com/api/docs/models/gpt-5-mini)
- [Cloudflare: publika hostnames och routing](https://developers.cloudflare.com/tunnel/routing/)
- [Pi-hole: DNS-cache utan serveromstart](https://docs.pi-hole.net/main/pihole-command/)
