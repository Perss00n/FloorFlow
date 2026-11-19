# FloorFlow B1-migrering: genomfört och blockerat, 2026-11-19

## Aktuellt resultat

Ingen ny Azure-webbadress kan verifieras ännu. Båda godkända B1-regionerna
nekade provisioneringen. Arbetet har stannat vid den uttryckliga gränsen för
abonnemangsbyte i uppdragets Fas A. **Betalningsmodell och utgiftsgräns är oförändrade.**

En fungerande lokal reservdemo har däremot startats och verifierats:
**http://127.0.0.1:3300/**. Den är endast åtkomlig på denna dator och använder
den befintliga lokala utvecklingsdatabasen, inte Azure-databasen.

## Verifierade förutsättningar

- `main` lokalt och på GitHub: `8bfbbbb8b80f66d15faf692631bea94bd82820e2`.
  Diagnostik med `startupStage` och `startupFailureReason` finns i den versionen.
- [CI 44512839601](https://github.com/Perss00n/FloorFlow/actions/runs/44512839601)
  är grön för denna commit.
- [Senaste gamla deployment 44513082308](https://github.com/Perss00n/FloorFlow/actions/runs/44513082308)
  har lyckat byggjobb och misslyckat deployjobb. Den hämtade jobbloggen visar
  `Failed to deploy web package using OneDeploy` och `Site Disabled (CODE: 403)`.
- Prenumerationen är `Enabled`, erbjudandet `FreeTrial_2014-09-01`,
  utgiftsgränsen `On`. Portalens hemsida visar **1 984,76 kr** i provkredit,
  giltig till **16 december 2026**. Detta är portalens visade belopp, inte
  en garanti om omedelbart uppdaterad kostnadsbokföring.
- Microsofts Retail Prices API visar Linux B1, en instans, **0,1786 SEK/timme**
  i både Sweden Central och North Europe. Cirka **4,29 kr/dygn** eller
  **130,38 kr vid 730 timmar**, exklusive eventuell skatt, annan resursförbrukning
  och regionöverskridande trafik. Portalens prisvy visar även 0,018 USD/timme.
- Båda regionerna finns i App Services lista över B1/Linux-regioner. Det är
  tjänstetillgänglighet och garanterar inte ledig kapacitet eller prenumerationskvot.

## Faktiskt genomförda Azure-åtgärder

1. Skapade **`rg-floorflow-web-b1`**, metadataregion **Sweden Central**,
   `provisioningState=Succeeded`. Taggar: FloorFlow, interview-demo,
   cleanupBy=2026-11-20. Taggen schemalägger ingen automatisk borttagning.
2. Ett försök att skapa `asp-floorflow-web-b1`, Linux B1, en instans, i
   **Sweden Central** misslyckades. Activity Log **11:38:05 UTC / 12:38:05 svensk tid**,
   Conflict: `No available instances to satisfy this request`.
   Correlation ID: `ee7f9ef3-9138-4fdb-9683-4cc1072bdf82`.
3. Läste tillbaka resurslistan och verifierade att ingen plan skapats.
4. Undersökte **North Europe**. Samma B1-pris; databasen skulle ligga kvar i
   Sverige, vilket medför extra latens och möjlig trafikdebitering mellan regioner.
   Regionalt API visade B1 current=0, limit=0.
5. Ett enda provisioneringsförsök i North Europe bekräftade kvotspärren:
   **Current Limit (B1 App Service instances): 0; Current Usage: 0;
   Amount required: 1; Minimum New Limit: 1**.
   Activity Log **11:39:01 UTC / 12:39:01 svensk tid**.
   Correlation ID: `546b0ed9-7d4d-41b8-8e3e-dac6e07c608e`.
   Activity Logs substatus är Unauthorized, men själva feltexten identifierar
   B1-kvotbrist; detta är inte bevis för att operatörens RBAC-roll måste utökas.
6. Läste tillbaka igen: **nya resursgruppen är tom**. Prenumerationen har bara
   den gamla F1-planen. Ingen aktiv ny betald plan eller ny webbapp finns.

Kvotsidan öppnades i Chrome och App Service-providern valdes. Portalen saknar
kvotdata och visar registreringsmeddelande. Readback: `Microsoft.Web=Registered`,
`Microsoft.Quota=NotRegistered`. Ingen provider registrerades och ingen
kvot-/supportbegäran skickades.

## Varför arbetet behöver ett nytt beslut

Microsofts primärdokumentation säger att **Free Trial inte är berättigad till
kvothöjningar**. Ett byte till Pay-as-you-go är därför den dokumenterade vägen
innan en B1-kvot på minst en instans kan begäras i North Europe. Bytet garanterar
varken omedelbar kvot eller kapacitet. Det kan behövas en separat kvotbegäran.

Uppdraget säger uttryckligen att stoppa för godkännande om prenumerationen måste
ändras till Pay-as-you-go. Ingen sådan ändring har utförts. Återstående kredit
behålls enligt Microsoft under den ursprungliga 30-dagarsperioden efter ett byte,
men fortsatta resurser kan därefter debiteras. Även befintliga resurser omfattas
av prenumerationens betalningsvillkor; kostnaden är inte begränsad till nya B1-planen.

Den konkreta fortsättningen efter godkännande är att granska/utföra abonnemangsbytet,
kontrollera kvoten igen och vid behov begära **en** B1-instans i North Europe.
Ingen dyrare SKU eller ytterligare region är föreslagen som automatiskt nästa steg.

## Befintlig miljö och kvarstående arbete

- Gamla webbappen lästes tillbaka: fortfarande `QuotaExceeded`, senaste
  konfigurationsändring fortfarande **2026-11-19T01:01:41.136666**.
- Gamla App Service-planen, databasen, brandväggsreglerna, data/rollerna,
  OpenAI-resursen och GitHub-identiteten ändrades inte.
- Inga Azure-appsettings eller hemligheter kopierades eftersom målappen saknas.
- Inga kod-/workflowändringar, commits, pushar eller nya workflow-dispatcher
  gjordes under detta migreringsförsök. Den gamla deploymentkonfigurationen bevarades.
- Ursprungliga Node-startfelets exakta orsak är fortsatt **okänd**.
  Den nya diagnostiken har ännu inte kunnat publiceras till en fungerande Azure-app.
- Azure DNS/TCP/TLS/authentisering från målappen, proxybetroende,
  preview-autentisering och publik HTTPS är därför fortfarande overifierade.

## Lokal reservdemo: faktiskt verifierad

En tillfällig launcher i den ignorerade katalogen
`.tmp/b1-migration-20261119/start-local-demo.mjs` läser befintlig lokal `.env`,
kräver loopback-databas, binder endast till **127.0.0.1:3300** och tömmer
modellinställningarna i den egna processen. Ingen `.env` eller produktionskod
ändras. Befintliga lokala utvecklingsinställningar för autentisering används;
ingen Azure-autentisering eller TLS-kontroll har ändrats.

Node-processens PID vid start: **35912**. Konsolloggar och PID-fil ligger i
samma ignorerade katalog. Inga nya paket installerades eller databasverktyg kördes.

Sex GET-kontroller passerar med HTTP 200 och kontrollerat innehåll:

- `/health`: status ok, database connected.
- `/api/customers`: fem kunder.
- `/api/customers/1`: Maple Property Group.
- `/api/customers/1/orders`: tre order.
- `/api/orders/1`: FF-2026-001, total `36117.00`.
- `/api/orders/1/items`: fyra rader.

I riktig Chrome verifierades dessutom renderad kundlista, kundsida, navigering
till ordern samt fyra orderrader och **36,117.00 SEK**. Fliken lämnas öppen.
Ingen AI-fråga skickades. Detta är ett användbart alternativ vid skärmdelning;
det är **inte** en publik molndemo eller verifiering av Azure-databasen.

Reservdemon kan startas igen från projektroten:

```powershell
node .tmp/b1-migration-20261119/start-local-demo.mjs
```

För att stänga den bakgrundsprocess som startades här, verifiera först att PID
fortfarande tillhör rätt launcher innan processen stoppas:

```powershell
$demoProcess = Get-CimInstance Win32_Process -Filter 'ProcessId=35912'
if ($demoProcess.Name -eq 'node.exe' -and
    $demoProcess.CommandLine -like '*b1-migration-20261119/start-local-demo.mjs*') {
    Stop-Process -Id $demoProcess.ProcessId
}
```

Ingen ny B1-kostnad behöver stoppas eftersom ingen plan skapades. Den tomma
resursgruppen har ingen egen löpande compute-kostnad. Befintliga resursers
eventuella kostnader är oförändrade; inga gamla resurser stoppades eller togs bort.

## Källor

- [Microsoft: kvotgränser och Free Trial](https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/azure-subscription-service-limits#how-to-manage-limits).
- [Microsoft: uppgradering och återstående provkredit](https://learn.microsoft.com/en-us/azure/cost-management-billing/manage/upgrade-azure-subscription).
- [Microsoft: App Service Linux-priser](https://azure.microsoft.com/en-us/pricing/details/app-service/linux/).
- [Microsoft: trafik mellan regioner](https://azure.microsoft.com/en-us/pricing/details/bandwidth/).
- [Microsoft: App Service med databas i annan region](https://learn.microsoft.com/en-us/azure/app-service/app-service-best-practices).
