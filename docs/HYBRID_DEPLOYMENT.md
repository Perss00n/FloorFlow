# FloorFlow: Ubuntu + Azure, 2026-11-19

Aktuell demo: **https://floorflow.marcuslehm.se/**. Applikationen körs på Ubuntu;
PostgreSQL och den verkliga GPT-5-mini-modellen finns kvar i Azure. App Service
används inte av denna installation. Äldre M6-/App Service-dokument beskriver
tidigare förberedelser och är inte driftinstruktionen för den här demon.

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
  (3 × 5 MB). Högst en instans ska köras med den nuvarande minnesbaserade limiteringen.
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
- Ny PostgreSQL-regel: `floorflow-ubuntu-home`, endast
  **81.235.27.27–81.235.27.27**. De tidigare App Service-reglerna bevarades.
- OpenAI: `oai-floorflow-demo-6e9587`; befintlig deployment `floorflow-sql`,
  `gpt-5-mini` / `2025-08-07`, GlobalStandard, befintlig kapacitet 10.
- Endpoint: `https://oai-floorflow-demo-6e9587.openai.azure.com/openai/v1/`.
  Befintlig kod använder Chat Completions med strikt JSON-schema, inga retries,
  20 sekunders timeout och högst 1 200 completion-tokens.
- OpenAI ändrades från `publicNetworkAccess=Disabled`, default `Deny`, inga IP-regler,
  till **Enabled + defaultAction=Deny + exakt IP-regeln 81.235.27.27**.
  Inga tillåtande nätverksintervall eller Azure-services-bypass lades till.

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
- **429:** vänta enligt `Retry-After`. Nuvarande gränser: ett samtidigt anrop,
  fem per klient/minut och 30 totalt/timme. Räknarna är processlokala och nollställs
  vid omstart; kör inte flera repliker utan separat gemensam limitering.
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
**20261119-02**. Referensen före den uppdateringen finns i
`backups/update-20261119-02/previous-release.txt` och `release.env`.

Manuell återgång till den bevarade första releasen:

```bash
cd /home/marcus/apps/floorflow
sudo ln -s releases/20261119-01 .current-restore
sudo mv -Tf .current-restore current
sudo cp backups/update-20261119-02/release.env .env
sudo docker compose up -d --no-build --wait app
```

Full avveckling: stoppa bara FloorFlow, ta bort bara dess hostname/CNAME i
Cloudflare och regeln `floorflow-ubuntu-home` i PostgreSQL. Återställ vid behov
OpenAI till dess sparade utgångsläge (Disabled, Deny, tom IP-lista), efter kontroll
att ingen annan ny konsument behöver regeln. Radera inga Azure-resurser eller den
gemensamma tunneln. Windows-reservdemon är bevarad och stoppades inte.

## Verifiering och återstående gränser

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
