# Ubuntu CI/CD: verifiering 2026-11-19

Publik demo: **https://floorflow.marcuslehm.se/**. Varje push till main får
publicera först efter godkänd CI för exakt samma commit. Ubuntu hämtar själv
paketet över HTTPS; ingen inkommande SSH, GitHub-runner eller Azure App Service
används. Aktuell release/commit finns i `/var/lib/floorflow-deploy/installed.json`.
Operatörskommandon finns i [HYBRID_DEPLOYMENT.md](HYBRID_DEPLOYMENT.md).

## Källkod och utgångsläge

- Windows och GitHub main var rena och synkroniserade vid `dc33006117b6407790896b05fc1d33d273492315`.
- Samtliga **38 paketfiler** i aktiv Ubuntu-release `20261119-09` jämfördes
  byte-för-byte med både Windows och Git-committen. Inga skillnader, inklusive
  AI-prompten. Runtime, credentials och budgetfil är inte versionshanterade.
- Den faktiskt installerade `update.sh` lästes med sudo och matchade den gamla
  repositoryversionen. Baslinjer och originalupdaterare finns på servern i
  `backups/cicd-20261119/`. Release 09, tidigare releaser och images behålls.
- Före förändringen passerade 30 publika HTTP-kontroller från Windows.

## Ny mekanism och skydd

CI-jobbet `ubuntu-release` kräver `test`. Paketet är källkod utan miljöfiler,
hemligheter, budget, testfiler eller privilegierade deployskript. Artifact-namnet
binder SHA, run-ID och attempt. Servern kräver aktuell main, senaste push-CI med
success, rätt artifact och manifest, ZIP-digest från GitHub samt tar-SHA-256.
Main/CI kontrolleras åter efter Docker-builden, före aktivering. Arkivens storlek,
sökvägar, filtyper, dubletter och basfiler kontrolleras före extrahering.

Updateraren har separat lås och explicit Compose-projekt `floorflow`. Compose måste
matcha installerade bytes. Den bygger före bytet, sparar tidigare release/env,
väntar på befintlig autentiserad DB-healthcheck och återställer vid aktiveringsfel.
Pending-/attempt-markörer hanterar avbrott; misslyckade commits blockeras och
rollbackfel pausar automatiken. Ett avbrott efter lyckad aktivering men före
metadatasparning kontrollerar containerimage/health och återställer metadata utan
att bygga om. Privilegierade scripts och systemd-enheter uppdateras separat av operatör.

En egen `floorflow-deploy.timer` är boot-aktiverad med 90 sekunders intervall.
Tjänsten kör oberoende av SSH, med skrivskyddat system/home och egna skrivområden.
Docker/Buildx-klientcachen finns i `/var/lib/floorflow-deploy/docker`.
En separat fine-grained PAT har endast FloorFlow och Actions/Contents/Metadata
Read-only. Den ligger root:root 0600 under `/etc/floorflow-deploy/` (0700), inte i
Git, miljö eller kommandorad. Initial giltighet slutar **2026-12-19**.

## Bekräftade tester

| Kontroll | Resultat och bevisnivå |
| --- | --- |
| Befintliga Node-tester | **338/338**, lokal isolerad PostgreSQL 18 med samma databasnamn/roller som CI; Azure-modellinställningar tomma |
| Syntax och beroenden | 51 JS-filer; npm audit: 0 sårbarheter; Bash-syntax och actionlint godkända |
| Deploymentregressioner | **22/22 på Ubuntu/Linux**, utan GitHub/Azure-anrop. Arkivgränser, SHA/attempt, saknad/röd/äldre CI, blockering, lås, buildfel, healthfel/rollback, avbrott, metadataåterhämtning och pauskrav för manuell rollback |
| Verklig GitHub CI och paketering | [99dbafd](https://github.com/Perss00n/FloorFlow/actions/runs/44629141540), [66ab3c4](https://github.com/Perss00n/FloorFlow/actions/runs/44629374468) och [245ebf2](https://github.com/Perss00n/FloorFlow/actions/runs/44629748115): success |
| Verklig dubbel integritetskontroll | Paketet för 66ab3c4 hämtades och båda digest-lagren verifierades före installation; 38 filer, 38 604 komprimerade källbytes |
| Kontrollerat första driftfel | 66ab3c4 stoppades före byte när Buildx ville skriva i skyddade `/root`; 09 förblev healthy, alla skyddade hashvärden var oförändrade. Committen blockerades och nästa kontroll byggde inte om den |
| Rättning av driftfelet | Separat `DOCKER_CONFIG` i tjänstens redan tillåtna state-katalog; home/system förblev skrivskyddade. Ingen ändring i Laravels eller root-användarens befintliga Docker-konfiguration |
| Verklig hämtning/build/start | 245ebf2 installerades av systemd efter grön CI. Den startande SSH-sessionen avslutades; färsk session observerade ny image/container, healthy och sparad commit/run/SHA-256 |
| Verklig idempotens | Ny servicekörning gav `Already installed`; container-ID och starttid oförändrade |
| Publik efterkontroll | **30/30 HTTP-kontroller** efter första lyckade byte: TLS/HTTPS, 401 med utebliven/fel auth, statiska filer, kund/order-API och DB-health, säkra fel samt ogiltiga AI-indata utan modellstart |
| Verklig röd main-CI | [2732fa7](https://github.com/Perss00n/FloorFlow/actions/runs/44630144902): avsiktligt testfel, `ubuntu-release` skipped. Timerkörningen loggade väntan på just den SHA:n; inget releasekatalog-/containerbyte och samma container-ID/starttid som 245ebf2 |
| Oförändrad övrig drift | runtime.env, AI-budgetfil, Laravel-env/Compose/deployskript/enheter och Cloudflare-token/tjänst kontrollerades mot baslinje. Laravel-container-ID/image/starttider och cloudflared-processens start/PID var oförändrade. Laravel gav HTTP 200 |

Den tillfälliga röda testfilen är borttagen. En ofarlig HTML-kommentar
används för sista pushens publika leveranskontroll; inga UI- eller affärsregler ändras.
De namngivna körningarna ovan gäller den första driftverifieringen.
Aktuell SHA och CI-run läses från serverns `installed.json` och GitHubs CI-historik.

## Avveckling och kvarvarande gränser

- Gamla `.github/workflows/deploy.yml` är borttaget efter ovan verifierade Ubuntu-byte.
  Endast det gamla workflowet använde `AZURE_CLIENT_ID`, `AZURE_TENANT_ID` och
  `AZURE_SUBSCRIPTION_ID`; dessa tre repository-variabler har raderats och deras
  frånvaro återlästs. Inga repository-Actions-secrets eller environments fanns.
  CI:s standardbehörighet är read och ingen OIDC/id-token begärs.
- PostgreSQL/OpenAI-resurser, roller, firewall, TLS, TRUST_PROXY och Cloudflare-
  konfiguration ändrades inte. Inga migrationer, seeders, Azure-CLI-ändringar eller
  riktiga AI-anrop kördes. Modellkostnad för detta uppdrag: **0 USD**.
- Rollback- och avbrottsfallen är **isolerade Bash/Python-tester med stubbad Docker**,
  inte ett avsiktligt produktionsavbrott eller en VM-omstart. Produktionsfelet ovan
  verifierade verklig bevaring före aktivering. Ingen Azure-modellacceptans görs om.
- Timern och Docker är boot-aktiverade; ingen hel VM-omstart gjordes. Token måste
  förnyas före utgång, och gamla releaser/images behöver följas upp för diskutrymme.
  Windows-reservdemon och Laravels automatiska deployment bevarades.

GitHub artifact-/tokenmodell följer [GitHubs artifact-API](https://docs.github.com/en/rest/actions/artifacts)
och [behörigheter för fine-grained tokens](https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens).
