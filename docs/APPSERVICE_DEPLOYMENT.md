# M6C: första manuella publiceringen till App Service

**Förberett 2026-11-19. Inte publicerat. Inga Azure-inställningar har ändrats.**
Operatören uppger att PostgreSQL redan är installerad och separat verifierad,
inklusive begränsade runtime-konton och TLS 1.3. Det är utgångspunkten här, inte
en ny Azure-verifiering. Kör aldrig databasens Install/setup/seed som deployment.

Målet är frontend och befintligt read-only REST API på
`https://app-floorflow-demo-6e9587.azurewebsites.net/`. AI förblir avstängd.
Preview-inloggningens Basic auth är separat från **SCM Basic Publishing**, som
ska förbli avstängt. GitHub Actions fortsätter enbart med befintlig CI.

## 1. Kontrollera lokalt och bygg ett avgränsat paket

```powershell
Set-Location C:\Users\Perss\source\repos\FloorFlow
git status --short
npm run check:syntax
# Kör npm test endast med den lokala utvecklingsdatabasen och tomma modellinställningar.
& .\scripts\build-azure-package.ps1
```

Byggskriptet läser inte `.env` eller credentials. Det kopierar endast
[deployment-files.json](../scripts/deployment-files.json) till en ny ignorerad
`.tmp/deployment-<id>/app` och installerar låsta produktionsberoenden med en
lokal Linux/amd64 `node:24-bookworm-slim`-image. Befintliga Windows-beroenden
används inte. Ingen image dras automatiskt; granska/installera den lokalt om den
saknas. Installationsskript och npm-binärlänkar används inte; nuvarande beroenden
kräver dem inte och appen startas direkt med Node. Inga nya npm-paket tillkommer.

ZIP-filen har `package.json`, `src/`, `public/`, Linux-beroenden och **endast**
`db/init/01-schema.sql` på rätt nivå. Schemat behövs vid modulimport även med AI
avstängd; filen **exekveras inte**. Seed, databasverktyg, `.env*`, `.git`,
credentials, privata rapporter, tester och lokal dokumentation följer inte med.
Paketkontrollen avvisar känsliga filnamn även bland beroendena. Ett nytt
`package-report.json` ligger bredvid ZIP, aldrig i paketet. Spara godkänd ZIP,
SHA256 och rapport; byggfel eller ofullständiga paket får inte publiceras.

## 2. Senare operatörskontroll i Azure, före ändringar

**Kommandona i steg 2–7 har inte körts under förberedelsen. Steg 3–6 innehåller
framtida ändringar/publicering och kräver uttryckligt godkännande först.**

Azure CLI **2.93.0** finns lokalt. Microsoft dokumenterar Entra-fallback för
`az webapp deploy` med CLI >= 2.48.1 när SCM Basic är avstängt. Använd den
inloggade operatörens befintliga rättigheter; skapa ingen identitet, resurs,
publish profile eller GitHub-koppling.

```powershell
az login --output none
$taskSubscriptionId = Read-Host 'Bekräftad subscription-id'
$taskRg = 'rg-floorflow-demo'
$taskApp = 'app-floorflow-demo-6e9587'
az webapp show --subscription $taskSubscriptionId -g $taskRg -n $taskApp --query '{state:state,httpsOnly:httpsOnly,host:defaultHostName,egress:outboundIpAddresses}' -o json
az webapp config show --subscription $taskSubscriptionId -g $taskRg -n $taskApp --query '{runtime:linuxFxVersion,startup:appCommandLine,alwaysOn:alwaysOn,health:healthCheckPath}' -o json
az appservice plan show --subscription $taskSubscriptionId -g $taskRg -n asp-floorflow-demo --query '{tier:sku.tier,name:sku.name}' -o json
foreach ($taskPolicy in @('scm','ftp')) {
    az resource show --subscription $taskSubscriptionId -g $taskRg --name $taskPolicy --namespace Microsoft.Web --resource-type basicPublishingCredentialsPolicies --parent "sites/$taskApp" --query properties.allow -o json
    if ($LASTEXITCODE -ne 0) { throw 'Publishing policy kunde inte läsas.' }
}
# Visa namn, inte hemliga värden:
az webapp config appsettings list --subscription $taskSubscriptionId -g $taskRg -n $taskApp --query '[].name' -o json
```

Bekräfta Linux/Node 24, F1/Free, HTTPS Only på, Always On av och båda Basic
publishing-policyerna **false**. Inget autentiseringsundantag för `/health` ska
finnas. Appens aktuella exakta utgående IP-adresser måste redan tillåtas av
PostgreSQL-brandväggen. Vid avvikelse: stoppa för granskning; uppgradera inte
planen, aktivera inte Basic och bredda inte brandväggen. Om annat än den väntade
tomma App Service-sidan finns: granska befintlig deployment innan den ersätts.

## 3. Granska och godkänn följande inställningar

| Inställning | Förslag |
| --- | --- |
| Startup command | `node src/server.js`, en foreground-process |
| `NODE_ENV`, `HOST` | `production`, `0.0.0.0` |
| `PORT` | Tillhandahålls av App Service; lägg inte till ett eget värde eller `WEBSITES_PORT` |
| `PGHOST`, `PGPORT`, `PGDATABASE` | `pg-floorflow-demo-6e9587.postgres.database.azure.com`, `5432`, `floorflow` |
| `PGUSER`, `PGPASSWORD` | `floorflow_app`, oförändrat lösenord från dess befintliga DPAPI-fil |
| `PGSSLMODE` | `verify-full`; betrodd certifikatkedja och rätt värdnamn |
| `PREVIEW_USERNAME`, `PREVIEW_PASSWORD` | Separat preview-identitet och ett unikt slumpmässigt lösenord från lösenordshanteraren, minst 24 tecken |
| `TRUST_PROXY` | Först `false`; senare endast observerad/granskad proxyadress, eller `loopback` om det faktiskt bevisats |
| `PROXY_DIAGNOSTICS` | Tillfälligt `on` för den begränsade ingresskontrollen; slutligen `off` |
| `AI_PGUSER`, `AI_PGPASSWORD` | Tomma; AI-kontot behövs inte i denna deployment |
| `AZURE_FOUNDRY_ENDPOINT`, `AZURE_FOUNDRY_MODEL`, `AZURE_FOUNDRY_API_KEY` | Tomma; ingen modellklient/AI-pool skapas |
| `SCM_DO_BUILD_DURING_DEPLOYMENT`, `ENABLE_ORYX_BUILD` | `false`, `false`; paketet innehåller redan beroendena |

Starten kontrollerar DB med `SELECT 1` före HTTP-listening och avslutas säkert vid
fel. Node-porten lyssnar på alla interna interface, inte bara loopback. `pg`
8.23.1 läser `PGSSLMODE=verify-full`, använder Node-TLS med certifikatkontroll
och skickar PostgreSQL-värdnamnet som SNI. Inför inte `NODE_TLS_REJECT_UNAUTHORIZED=0`
eller `sslmode=require`. Behåll Node/Azures betrodda CA-kedja; lös certifikatfel
genom granskad CA-hantering, inte genom avstängd verifiering.

Låt App Services vanliga warm-up acceptera skyddets 401/426. Det bevisar bara att
processen svarar; beredskap verifieras med autentiserad `/health`. Sätt inte
`WEBSITE_WARMUP_STATUSES=200` och konfigurera inte en anonym hälsoendpoint.
F1 kan kallstarta och saknar Always On; ingen planuppgradering föreslås.

## 4. Efter godkännande: inställningar och första, stängda publicering

Använd en privat PowerShell-session utan transcript/debug/protokollspårning.
Preview-lösenordet ska skilja sig från databaslösenordet; skriv det i dialogen,
inte i kommandot. Bevara variabeln privat för samma operatörssession.

```powershell
$taskPreview = Get-Credential -UserName 'floorflow-preview' -Message 'Separat preview-lösenord från lösenordshanteraren (minst 24 tecken)'
& .\scripts\set-azure-app-settings.ps1 -SubscriptionId $taskSubscriptionId -PreviewCredential $taskPreview -TrustedProxy false -DiagnoseProxy -Apply
az webapp config set --subscription $taskSubscriptionId -g $taskRg -n $taskApp --startup-file 'node src/server.js' --output none --only-show-errors
if ($LASTEXITCODE -ne 0) { throw 'Startup-inställningen kunde inte bekräftas.' }
$taskZip = Read-Host 'Absolut sökväg till granskad floorflow.zip'
Get-FileHash -Algorithm SHA256 -LiteralPath $taskZip
# Kontrollera SHA256 mot den godkända rapporten innan nästa kommando.
az webapp deploy --subscription $taskSubscriptionId -g $taskRg -n $taskApp --src-path $taskZip --type zip --clean true --restart true --track-status true --timeout 600000 --enriched-errors false --output none --only-show-errors
if ($LASTEXITCODE -ne 0) { throw 'Deployment ej bekräftad. Inspektera innan något försök upprepas.' }
```

Inställningshjälparen importerar **bara**
`%LOCALAPPDATA%\FloorFlow\Azure\pg-floorflow-demo-6e9587-app.credential.xml`,
kontrollerar privata ACL:er/identitet och återanvänder lösenordet. Den hämtar en
kortlivad management-token via Azure CLI och skickar inställningarna med HTTPS
direkt till den fixerade App Service-resursen. Därmed hamnar lösenord varken i
CLI-processargument eller temporära JSON-filer. Befintliga andra appinställningar
bevaras i minnet; skyddade startup/TLS-overrides stoppar körningen. Skrivning
följs av readback utan att visa hemligheter. Kör inga parallella konfigurationsändringar.
Misslyckad skrivning/readback kan ha delvis genomförts: inspektera innan återförsök.

Inställningsändringar startar om appen. `--clean true` ersätter kodfiler i denna
App Services `wwwroot`, inte databasen. Inga databasverktyg finns i paketet.
SCM Basic förblir avstängt och CLI använder Entra. Aktivera aldrig Basic som
reservmetod. Kudu-publiceringsstatus är inte bevis för fungerande REST eller UI.

## 5. Observera ingressen innan proxybetroendet aktiveras

```powershell
& .\scripts\verify-azure-app.ps1 -Mode Proxy
# Läs den befintliga konsolströmmen; avsluta med Ctrl+C:
az webapp log tail --subscription $taskSubscriptionId -g $taskRg -n $taskApp
```

Med `TRUST_PROXY=false` är 426 på HTTPS väntat: åtkomsten är stängd tills proxyn
har granskats. Diagnostiken skriver högst **12** poster per process, endast för
fyra fasta probnamn på `GET /health`: faktisk socket-peer, socket-TLS och en
kategoriserad `X-Forwarded-Proto`. Inga Authorization-/Cookie-värden, godtyckliga
headers, URL-parametrar eller kunddata loggas. Ingen route eller auth-bypass läggs
till. Normal diagnostik är avstängd som standard.

Microsoft dokumenterar TLS-terminering före Node och `X-Forwarded-Proto` för
ursprungligt protokoll. Dokumentationen fastställer däremot inte den aktuella
socket-adressen för denna app eller hur alla spoofade headerkombinationer ser ut
vid Node. Granska de faktiska posterna: HTTPS baseline och spoofade
`X-Forwarded-Proto: http`/protokolllistor ska nå Node som ett entydigt `https`
från samma betrodda ingress. HTTP med förfalskat `https` ska fortfarande ge
HTTPS-redirect utan credentials. Kontrollera att Node-backenden endast är
tillgänglig via plattformens ingress, inte en separat offentlig backendväg.

Använd inte `trust proxy=true`, hopantal `1`, gissade privata nät eller ett brett
`169.254/16`-intervall. Om adresserna ändras vid omstart, headers inte normaliseras
eller snävt/stabilt proxybetroende inte kan styrkas: stoppa och granska lösningen.
Ändra inte HTTPS-skyddet för att få 200. Efter införande ska acceptanstestet
upprepas vid omstart, och senare vid plattforms-/ingressändringar.

Om befintliga konsolloggar inte är åtkomliga, läs dem med Entra-autentiserad SSH
om tillgängligt. **Aktivera/ändra inte serverloggning** inom detta förfarande.
Utebliven observationsmöjlighet lämnar proxyverifieringen öppen och kräver ett
separat granskat nästa steg. Skicka aldrig råa loggbuntar eller dumpade appinställningar.

## 6. Efter granskning av ingress: snävt betroende och acceptanstest

```powershell
$taskProxy = Read-Host 'Observerad och godkänd exakt proxy-IP (loopback endast om styrkt)'
& .\scripts\set-azure-app-settings.ps1 -SubscriptionId $taskSubscriptionId -PreviewCredential $taskPreview -TrustedProxy $taskProxy -Apply
& .\scripts\verify-azure-app.ps1 -Mode Acceptance -PreviewCredential $taskPreview
```

Detta stänger diagnostiken, startar om appen och provar den nya processen. Skriptet
följer inte redirects med credentials och skickar aldrig preview-credentials
över HTTP. Endast GET används: inga SQL-mutationer och inga AI-frågor. Det kräver
401 utan credentials, även för spoofade HTTPS-headers; HTTPS-redirect för HTTP;
200 för skyddad `/health`, kundöversikt, kunddetaljer och orderdetaljer; samt fem
REST-svar med 5 kunder, Maple Property Group, 3 kundorder, order `FF-2026-001`
med `36117.00` SEK och 4 orderrader. Utdata innehåller bara status/bevisflaggor.

Öppna sedan HTTPS-adressen i ett privat webbläsarfönster, logga in och kontrollera
att kundlistan renderas, att kund-/orderlänkar fungerar och att ordertotalen visar
36,117.00 SEK. Prova även smal mobilvy. HTML-200 bevisar inte renderad JavaScript.
AI-panelen kan visa befintligt “not configured”-läge; fyll inte i modellnycklar
och skicka inga frågor. Notera kallstart och gör en ny kontroll efter en senare,
godkänd omstart. Dela inte demon förrän dessa kontroller passerat.

Bekräfta också anslutningen **från App Service-processmiljön**, via Entra-SSH
(`az webapp ssh --subscription $taskSubscriptionId -g $taskRg -n $taskApp`).
Kör följande läsning i den fjärranslutna Linux-terminalen, inte lokalt. Den
använder appens redan satta miljö och skriver inga lösenord:

```bash
cd /home/site/wwwroot
node --version
node --input-type=module <<'NODE'
import { pool } from './src/db.js';
import { checkServerIdentity } from 'node:tls';
let client;
try {
  client = await pool.connect();
  const socket = client.connection.stream;
  if (!socket.encrypted || !socket.authorized || checkServerIdentity(process.env.PGHOST, socket.getPeerCertificate())) throw new Error();
  const { rows: [proof] } = await client.query(`SELECT current_user AS role, current_database() AS database,
    ssl, version, current_setting('temp_file_limit') AS temp_file_limit
    FROM pg_catalog.pg_stat_ssl WHERE pid = pg_backend_pid()`);
  if (proof.role !== 'floorflow_app' || proof.database !== 'floorflow' || !proof.ssl || proof.temp_file_limit !== '8MB') throw new Error();
  console.log(JSON.stringify({ ...proof, certificateAndHostnameVerified: true, clientTls: socket.getProtocol() }));
} catch { console.error('Runtime DB/TLS verification failed; details withheld.'); process.exitCode = 1; }
finally { client?.release(); await pool.end(); }
NODE
```

Detta är en fokuserad SELECT, ingen installation eller SQL-assistentfråga. Om
Entra-SSH inte stöds/är tillgängligt: lämna kontrollen öppen och granska nästa
steg; aktivera inte SCM Basic eller publicera en diagnostisk DB-endpoint.

## 7. Resultat, begränsningar och eventuell återställning

Spara paketets SHA256, granskat källtillstånd, CLI-/Node-version, icke-hemliga
konfigurationsreadbacks, proxyobservationer, HTTP-rapport och webbläsarresultat.
Ingen rapport eller secret får läggas i nästa deployment-paket. Vid 426: granska
proxyadressen/normaliseringen. Vid 503/startfel: granska startup, app-konto,
brandvägg och CA/TLS utan att ändra databasroller, loggning eller plan.

Ingen automatisk rollback/deploy-retry utförs. En kodåterställning kräver en
tidigare granskad ZIP och nytt godkännande; databasen ska aldrig återställas eller
seedas som del av kodrollback. Första publiceringen har ännu ingen verifierad
FloorFlow-version att falla tillbaka på. Preview-hemligheter hanteras separat.

**Förberedelsebevis:** se den aktuella sammanfattningen i
[DEPLOYMENT.md](DEPLOYMENT.md). Lokala tester, Linux-importkontroll och granskad
dokumentation är inte bevis för Azure-start, verklig ingress, App Service →
PostgreSQL-TLS eller renderad webbapp. Dessa fakta återstår efter godkänd
publicering. Ingen Azure-anslutning, credential-dekryptering eller publicering
har utförts under M6C-förberedelsen.

Primärkällor granskade 2026-11-19:
[Node/PORT/startup/TLS-terminering](https://learn.microsoft.com/en-us/azure/app-service/configure-language-nodejs),
[Express proxybetroende](https://expressjs.com/en/guide/behind-proxies/),
[Entra med avstängd Basic](https://learn.microsoft.com/en-us/azure/app-service/configure-basic-auth-disable),
[ZIP-publicering](https://learn.microsoft.com/en-us/azure/app-service/deploy-zip),
[App Service-inställningar/warm-up](https://learn.microsoft.com/en-us/azure/app-service/reference-app-settings),
[REST för appinställningar](https://learn.microsoft.com/en-us/rest/api/appservice/web-apps/update-application-settings?view=rest-appservice-2025-03-01),
[node-postgres TLS](https://node-postgres.com/features/ssl).
