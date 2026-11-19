# Historik: M6D och Azure App Service

**Avvecklat 2026-11-19.** `deploy.yml` har ersatts av CI-styrd Ubuntu-paketering
och en separat pull-timer på servern. Följ [HYBRID_DEPLOYMENT.md](HYBRID_DEPLOYMENT.md)
för aktuell drift. Texten nedan är historik; kör inte Azure-publiceringen.

**Förberett 2026-11-19. Ingen publicering, Azure-ändring, identitet eller
federerad credential har skapats. Inget har committats/pushats.** M6C-filerna och
`ci.yml` bevaras. PostgreSQL, App Service-inställningar och startup
`node src/server.js` är redan klara enligt operatören; de ändras inte här.

Den här guiden ersätter M6C:s CLI-steg för själva publiceringen. Kör inte
inställningshjälparen, databasens Install/setup, seed eller rollverktyg igen.
`TRUST_PROXY=false`, `PROXY_DIAGNOSTICS=on` och avstängd AI ska ligga kvar.

## Flödet

`deploy.yml` har endast `workflow_dispatch`, inga inputs eller automatiska
triggers. Båda jobben begränsas till `Perss00n/FloorFlow` och `refs/heads/main`.
Checkout låses till den manuella körningens commit, inte en senare ändrad main.

1. Byggjobbet kräver att senaste push-CI-körningen för **exakt samma commit** har
   lyckats. Pågående, saknad eller misslyckad CI stoppar publiceringen. `ci.yml`
   kör tester som tidigare; deployment kör inga databasverktyg.
2. Ubuntu 24.04 / Node 24 bygger från `scripts/deployment-files.json` och låsfilen.
   `npm ci --omit=dev --ignore-scripts --bin-links=false` körs i en separat katalog,
   utan app-/databas-/preview-hemligheter. Nuvarande beroenden kräver inga
   installationsskript eller npm-CLI-länkar.
3. Python-standardbiblioteket kontrollerar och bygger ZIP: endast tillåtna
   projektfiler plus produktionsberoenden, inga `.env*`, Git-data, privata
   credential-exporter, rapporter eller projektverktyg. Även beroendenas testfiler
   utesluts; licenser behålls. Slutlig ZIP inspekteras för förbjudna namn, dubletter,
   symlänkar, CRC och exakta projektfilbytes. Ett extraherat paket importtestas
   med AI avstängd. Inga nya paket/ramverk tillkommer i applikationen.
4. Endast ZIP och SHA256 skickas som körningsspecifik artifact, lagrad i tre
   dagar. Deployment-jobbet verifierar checksumman och loggar in med OIDC via
   `azure/login`, sedan publicerar `azure/webapps-deploy` till den befintliga appen.
   Inga appinställningar, startup-command eller publish-profile skickas som inputs.

Workflowens standardbehörigheter är tomma. Byggjobbet får `contents: read` för
checkout och `actions: read` för CI-kontrollen, **ingen OIDC**. Deployment-jobbet
får endast `id-token: write`; det hämtar artifact från samma körning och checkar
inte ut/kör projektets byggkod. Samtidiga publiceringar delar en fast concurrency-
grupp, med `cancel-in-progress: false`. GitHub kan ersätta en äldre väntande
körning; en pågående publicering avbryts inte av en ny dispatch.

Alla actions är låsta till granskade fullständiga commit-SHA:er: checkout 7.0.1,
setup-node 7.1.0, upload-artifact 7.0.2, download-artifact 8.0.2, Azure Login 3.1.0
och Web Apps Deploy 3.0.8. Microsoft Learn visar fortfarande Login v2 i vissa
exempel; den aktuella officiella Login-v3-dokumentationen beskriver samma OIDC-
inputs och kör på Node 24. SHA:erna verifierades mot utgivarnas taggar/källor.

## 1. Granska och lägg senare godkänd kod på main

Stoppa för granskning nu. Efter **separat godkännande** behöver både M6C och M6D
committas/pushas till `main`. Workflow-filen måste finnas där för att visas under
Actions. Vänta tills befintlig CI för just den commiten är grön. En push kör
fortfarande bara CI; den startar aldrig deployment.

## 2. Bekräfta GitHubs faktiska OIDC-subject

Följande metadata lästes skrivskyddat under förberedelsen:

- Repository `Perss00n/FloorFlow`, privat, default branch `main`.
- Ägar-ID `175893305`, repo-ID `1460330626`.
- OIDC: `use_default=true`, **`use_immutable_subject=true`**.

GitHub använder därför detta exakta, ID-baserade subject för denna workflow utan
GitHub environment:

```text
repo:Perss00n@175893305/FloorFlow@1460330626:ref:refs/heads/main
```

Det tidigare korta exemplet i `DEPLOYMENT.md` är historisk planering. Använd
värdet ovan för denna förberedelse och kontrollera det igen före Azure-konfiguration:

```powershell
gh api repos/Perss00n/FloorFlow --jq '{owner: .owner.login, owner_id: .owner.id, repo_id: .id, default_branch: .default_branch}'
gh api repos/Perss00n/FloorFlow/actions/oidc/customization/sub --jq '{use_default: .use_default, use_immutable_subject: .use_immutable_subject, include_claim_keys: .include_claim_keys}'
```

Vid namnbyte, överföring eller annan subject-konfiguration: stoppa och uppdatera
federeringsförslaget. Ändra inte GitHubs OIDC-mall som en genväg. Lägg inte till
`environment:` i workflowen utan ny granskning; det skulle ändra subject.

## 3. Efter uttryckligt godkännande: skapa dedikerad Azure-identitet

Förslag: user-assigned managed identity **`id-floorflow-github-deploy`**, Sweden
Central, i befintlig resource group. Den behöver ingen client secret och ska
inte kopplas till webbappens runtime-identitet. Operatören behöver rätt att skapa
identitet/federering och tilldela roll. Följande kommandon är **inte körda** och
skapar identitetsresurs, federering och rolltilldelning; de kräver nytt godkännande.
Om namnet redan används: stoppa och granska den befintliga identiteten först.

```powershell
az login --output none
$taskSubscriptionId = Read-Host 'Bekräftad subscription-id'
$taskRg = 'rg-floorflow-demo'
$taskIdentityName = 'id-floorflow-github-deploy'
$taskAppScope = "/subscriptions/$taskSubscriptionId/resourceGroups/$taskRg/providers/Microsoft.Web/sites/app-floorflow-demo-6e9587"
$taskSubject = 'repo:Perss00n@175893305/FloorFlow@1460330626:ref:refs/heads/main'

$taskIdentityJson = az identity create --subscription $taskSubscriptionId -g $taskRg -n $taskIdentityName -l swedencentral --query '{clientId:clientId,principalId:principalId,tenantId:tenantId}' -o json
if ($LASTEXITCODE -ne 0) { throw 'Identiteten kunde inte bekräftas; inspektera innan återförsök.' }
$taskIdentity = $taskIdentityJson | ConvertFrom-Json

az identity federated-credential create --subscription $taskSubscriptionId -g $taskRg --identity-name $taskIdentityName --name github-main --issuer 'https://token.actions.githubusercontent.com' --subject $taskSubject --audiences 'api://AzureADTokenExchange' --output none
if ($LASTEXITCODE -ne 0) { throw 'Federering ej bekräftad; inspektera innan återförsök.' }

az role assignment create --subscription $taskSubscriptionId --assignee-object-id $taskIdentity.principalId --assignee-principal-type ServicePrincipal --role 'Website Contributor' --scope $taskAppScope --output none
if ($LASTEXITCODE -ne 0) { throw 'Rolltilldelning ej bekräftad; inspektera innan återförsök.' }

az identity federated-credential show --subscription $taskSubscriptionId -g $taskRg --identity-name $taskIdentityName --name github-main --query '{issuer:issuer,subject:subject,audiences:audiences}' -o json
az role assignment list --subscription $taskSubscriptionId --assignee $taskIdentity.principalId --all --query '[].{role:roleDefinitionName,scope:scope}' -o json
```

Readback ska visa endast **Website Contributor på `$taskAppScope`**, inte på
resource group/subscription och inga extra roller. Rollen ger rätt att hantera
kod och konfiguration på just webbappen; workflowen använder den för deployment.
Identiteten får inga PostgreSQL-, Foundry- eller rolladministrationsrättigheter.
Använd inte Contributor/Owner på subscription som lösning på ett behörighetsfel.
Ingen App Service-plan, databas eller nätverksregel ska ändras.

## 4. Efter godkännande: tre GitHub Variables, inga apphemligheter

Under `Perss00n/FloorFlow → Settings → Secrets and variables → Actions → Variables`
skapas följande repository variables från identiteten ovan:

| Variable | Värde |
| --- | --- |
| `AZURE_CLIENT_ID` | `$taskIdentity.clientId` |
| `AZURE_TENANT_ID` | `$taskIdentity.tenantId` |
| `AZURE_SUBSCRIPTION_ID` | `$taskSubscriptionId` |

Samma sak via operatörens GitHub CLI, **inte utfört här**:

```powershell
gh variable set AZURE_CLIENT_ID --repo Perss00n/FloorFlow --body $taskIdentity.clientId
if ($LASTEXITCODE -ne 0) { throw 'Client-ID kunde inte sparas.' }
gh variable set AZURE_TENANT_ID --repo Perss00n/FloorFlow --body $taskIdentity.tenantId
if ($LASTEXITCODE -ne 0) { throw 'Tenant-ID kunde inte sparas.' }
gh variable set AZURE_SUBSCRIPTION_ID --repo Perss00n/FloorFlow --body $taskSubscriptionId
if ($LASTEXITCODE -ne 0) { throw 'Subscription-ID kunde inte sparas.' }
```

Dessa är identifierare, inga långlivade autentiseringshemligheter. Kopiera aldrig
DPAPI-filer, `PGPASSWORD`, preview-lösenord eller AI-nycklar till GitHub. Använd
ingen `AZURE_CREDENTIALS` eller publish profile. Appens befintliga inställningar
och avstängda SCM/FTP Basic Publishing behålls. Om repots Actions-policy begränsar
actions måste de sex SHA-låsta actions i YAML tillåtas; vidga inte tokenrättigheter.
Skydda granskningen av workflow-ändringar på main: OIDC-tilliten avser repot/main,
inte bara denna fil, och en annan main-workflow med OIDC-rättighet skulle kunna
använda samma federering.

## 5. Första publiceringen — först efter separat körgodkännande

Kontrollera manuellt att `TRUST_PROXY=false`, `PROXY_DIAGNOSTICS=on`, alla AI-
inställningar tomma, startup `node src/server.js` och server-build avstängd redan
är satta. Workflowen läser/kopierar inte apphemligheterna och sätter inte om dem.
Använd inte M6C:s CLI-publicering parallellt med denna workflow.

I GitHub: `Actions → Deploy FloorFlow (manual) → Run workflow → Branch: main`.
Kontrollera commit och klicka Run workflow. Alternativt följande kommando, som
**startar publicering och inte har körts under förberedelsen**:

```powershell
gh workflow run deploy.yml --repo Perss00n/FloorFlow --ref main
gh run list --repo Perss00n/FloorFlow --workflow deploy.yml --limit 5
```

Andra branches/taggar får inga deployment-jobb. Ett CI-stopp ska lösas genom att
granska/vänta på CI, inte ta bort grinden. Vid oklar/felaktig deployment kan kod
redan ha överförts: inspektera körningen/Kudu innan nytt försök. Ingen automatisk
rollback, ny deploy, planuppgradering eller rensning av databasen är tillåten.
`clean: true` avser endast kodfilerna i webbappens deployment-mål.

## 6. Efter publicering: verifiera proxyn, öppna inte preview ännu

En lyckad deployment visar paketöverföring, inte fungerande preview. Med avsiktligt
`TRUST_PROXY=false` är **426** väntat från appen även över publik HTTPS. Workflowen
kräver därför inte health-200 och behöver inget preview-lösenord. AI förblir avstängd.

Fortsätt med [M6C:s proxykontroll](APPSERVICE_DEPLOYMENT.md#5-observera-ingressen-innan-proxybetroendet-aktiveras)
efter publiceringen. Granska den faktiska socket-peern och normalisering av
spoofade headers. Först därefter kan en separat granskad ändring av proxybetroendet
och full preview/REST/TLS-acceptans bli aktuell. Deployment-workflowen ändrar
varken `TRUST_PROXY` eller `PROXY_DIAGNOSTICS`.

## Lokalt bevis och kvarstående verifiering

Verifierat lokalt 2026-11-19:

- **302/302 Node-tester**, lokal loopback-databas och tomma modellinställningar;
  **9/9 Python-pakettester**, utan nätverk eller databas. Canary-filer, manipulerad
  ZIP, symlänkar, testfiler och överskrivningsskydd ingår i pakettesterna.
- **actionlint 1.7.12** passerar för båda workflows; verktygets officiella SHA256
  kontrollerades. ShellCheck/Pyflakes kördes inte. Alla sex Bash-steg passerar
  separat `bash -n`; CI-grinden provades med success/failure/pending-fixtures.
- **45 JavaScript-filer** syntaxkontrollerade. **12 befintliga M6C/CI-filer**
  matchar hashbaslinjen byte för byte; M6D lägger endast till fyra nya filer.
- Faktiskt Linux/amd64-paket byggt med Node **24.22.3**, Python **3.12.16** och
  88 låsta produktionsberoenden: **33 projektfiler**, **4 956 ZIP-poster**,
  **7 405 932 bytes**. CRC, projektfilbytes och uteslutningskontroller passerar.
  Extraherat ZIP-paket klarar runtime-import med AI avstängd, utan nätverk.
  SHA256: `f086add79f8d18f3af0046e3d314c54e2ccc58d8ec0a6b3a3fd4e8c24a5047ae`.

Lokala paket/verktyg/bevis ligger i ignorerad `.tmp`, inte i deployment-paketets
projektfiler. GitHubs CI-fråga kontrollerades skrivskyddat för nuvarande main;
nästa godkända commit måste få sin egen lyckade CI innan publicering.

GitHub-hosted execution, OIDC-tokenutbyte, federerad credential/RBAC, artifact-
överföring mellan jobb och `webapps-deploy` mot denna app är **inte körda**. Ingen
Azure-konfiguration har lästs eller ändrats under M6D. Det första godkända
workflowförsöket måste verifiera dessa delar; bredda inte roller vid fel.

Primärkällor granskade 2026-11-19:
[Microsofts App Service/OIDC-guide](https://learn.microsoft.com/en-us/azure/app-service/deploy-github-actions),
[officiell Azure Login v3](https://github.com/Azure/login/tree/v3.1.0),
[Web Apps Deploy v3](https://github.com/Azure/webapps-deploy/tree/v3.0.8),
[GitHub immutable OIDC-subject](https://docs.github.com/en/actions/reference/security/oidc#immutable-subject-claims),
[GitHub tokenbehörigheter](https://docs.github.com/en/actions/reference/security/oidc#workflow-permissions-for-the-requesting-the-oidc-token).
