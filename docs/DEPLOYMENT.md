# Azure deployment plan (M6B Stage 4; infrastructure provisioned)

Review date: **2026-11-18**. Stage 4 provisioned the approved infrastructure in
Sweden Central. **FloorFlow has not been deployed, the database has not been
initialized, and no model inference was performed.** No billing upgrade,
deployment identity or deployment workflow was created. The repository remains
private; application code and tests are unchanged. These documentation changes
have not been committed or pushed by this stage.

## Stage 5 preflight: bootstrap blocked before execution

On **2026-11-18**, read-only Azure checks confirmed the expected active
subscription, Ready PostgreSQL **18** server, original **13 exact application-IP
rules**, required TLS and minimum TLS 1.2. `temp_file_limit` remains **-1**;
Azure reports it as dynamic with no restart pending. The saved administrator
credential exists, but was not decrypted or sent to PostgreSQL in this stage.
Node.js **24.19.0** and the existing `pg` client are available; no software was
installed. Stage 4 documentation was already preserved in commit `7bc78b1`.

The execution environment's automatic approval review rejected both the combined
temporary-firewall/inspection/cleanup command and a smaller targeted attempt,
before either command started. Its only diagnostic was **“blocked by policy.”**
No temporary rule was created, no database connection was made, and no SQL or
server-parameter changes were executed. Final readbacks confirmed the original
13 rules unchanged, no temporary rule, the server Ready and four existing
top-level Azure resources with no additions.

**Stage 5 is incomplete.** Actual databases, roles, administrator SQL capabilities,
schema/data, client-side TLS verification, runtime permissions and inherited
resource limits have not been inspected or verified against Azure PostgreSQL.
No seed totals or runtime-role tests were run. A temporary read-only Node
inspection script outside the repository passed `node --check`; it did not run
against Azure. No application or test source changed, and no commit/push occurred.

Resume only after the authorized temporary network access and credentialed
inspection can execute in a permitted operator session. Inspect actual database
contents and administrator capabilities first; then follow the managed bootstrap
and cleanup gates below. No subscription/billing upgrade, extra resource,
application deployment or model call is needed to resolve this execution block.

## Stage 5A: manual read-only inspection prepared

The operator procedure is [POSTGRESQL_INSPECTION.md](POSTGRESQL_INSPECTION.md).
It uses `scripts/inspect-azure-db.ps1` and the reviewed project-local
`scripts/inspect-azure-db.js`, superseding the temporary `inspect.mjs` draft.
Firewall setup/removal are manual Portal steps; the scripts contain no Azure
management operations. The database work is limited to verified-TLS, read-only
metadata inspection with sanitized output. No procedure, credential import,
Azure connection or SQL was executed while preparing Stage 5A. Offline helper
tests and syntax checks are recorded in the runbook. Await the operator's
sanitized results and cleanup confirmation before designing the Azure bootstrap.
The bootstrap outline below remains an earlier plan, not a reviewed executable
procedure or proof of managed-provider permissions.

## Verified Stage 4 resources

The selected subscription was rechecked as Enabled/Active with Owner access,
`FreeTrial_2014-09-01` and spending limit On. The portal showed **1,984.76 SEK**
credit expiring **December 16, 2026** before provisioning. The billing profile
is Active and its currency is **SEK**. The three required providers remained
Registered. Initial resource/resource-group inventories were empty.

All resources are in **`rg-floorflow-demo`**, location **Sweden Central**, tagged
`project=FloorFlow`, `purpose=temporary-demo`, `cleanupBy=2026-12-15`.
The tag is a cleanup reminder, not scheduled deletion.

| Resource | Actual configuration | Verified status |
| --- | --- | --- |
| `rg-floorflow-demo` | One dedicated resource group | Succeeded |
| `oai-floorflow-demo-6e9587` | `Microsoft.CognitiveServices/accounts`, kind **OpenAI**, account SKU **S0** | Succeeded; no project or dependent resources required |
| `floorflow-sql` (child deployment) | **gpt-5-mini / 2025-08-07 / GlobalStandard**, capacity **10** | Succeeded; 10,000 TPM, 10 requests/minute; `NoAutoUpgrade`, dynamic throttling off |
| `pg-floorflow-demo-6e9587` | PostgreSQL **18**, Burstable **Standard_B1ms**, 1 vCore / 2 GiB, **32 GiB Premium_LRS / P4 / 120 IOPS** | Ready; HA off, 7-day backups, geo-backup off, autogrowth off |
| `asp-floorflow-demo` | Linux **F1 / Free**, capacity **1** | Succeeded / Ready; one worker, one site |
| `app-floorflow-demo-6e9587` | Linux **`NODE\|24-lts`**, HTTPS Only, minimum web/SCM TLS 1.2 | Running / Normal; Always On off, FTP disabled, FTP/SCM Basic publishing both denied |
| `floorflow-demo-monthly` (resource-group budget) | **50 SEK/month**, actual-cost email alerts at **50%, 80%, 100%**, to the signed-in owner | Created and read back; November 1–December 16, 2026; no action group |

The final inventory contains exactly **four top-level resources**: the OpenAI
account, PostgreSQL server, App Service plan and Web App. Child model deployment,
firewall rules, configuration policies and budget were inspected separately.
No Search, project, storage account, Key Vault, Insights, Log Analytics, private
endpoint, deployment slot or deployment identity was created. No GitHub source
connection or FloorFlow application settings/secrets are configured.

### Model verification

The account's model metadata lists the requested version as Generally Available.
GlobalStandard's default capacity is 10; the requested capacity 10 was accepted.
Fresh usage GETs show **10 / 500** thousand-TPM units allocated, leaving
**490,000 TPM**. The final Sweden Central / GlobalStandard capacity GET also
reports **490** available capacity units. This allocation is not token spend or
a spending cap. Final resource readbacks were taken at **14:44 UTC**.

The exact client configuration for a later approved stage is:

```text
AZURE_FOUNDRY_ENDPOINT=https://oai-floorflow-demo-6e9587.openai.azure.com/openai/v1/
AZURE_FOUNDRY_MODEL=floorflow-sql
```

The endpoint matches the existing client's HTTPS/hostname/path checks. API keys
were **not retrieved or configured**. Public model access is **Disabled** with
network default Deny. Enable only reviewed access for the app and any temporary
approved tester in a later stage. Creating the account/deployment required no
project, Marketplace purchase, provisioned throughput or subscription upgrade.
Real inference, latency, structured output and SQL semantics remain untested.

### Database and network verification

PostgreSQL hostname: `pg-floorflow-demo-6e9587.postgres.database.azure.com`.
Public connectivity is enabled with **13 single-IP firewall rules**, matching
the app's current `outboundIpAddresses`. No developer IP, range rule, `0.0.0.0`
allow-Azure rule or unrestricted internet rule is present:

```text
4.166.104.191, 4.166.104.208, 4.166.104.210, 4.166.104.211, 4.166.104.213,
4.166.126.137, 4.166.180.191, 4.166.180.196, 4.166.227.197, 4.166.232.28,
4.166.232.41, 4.166.232.45, 51.12.31.26
```

Azure accepted rule creation asynchronously; an immediate list was incomplete.
Read-only polling subsequently verified all 13 exact rules, with no missing or
unexpected addresses. The app reports **31 possible outbound IPs**; the other
18 are recorded here but are **not allowed**:

```text
172.160.101.96, 172.160.52.174, 172.160.52.175, 172.160.52.188, 172.160.52.195,
4.166.102.213, 4.166.104.212, 4.166.104.214, 4.166.143.212, 4.166.143.213,
4.166.180.190, 4.166.180.197, 4.166.227.200, 4.166.246.19, 4.166.246.32,
4.166.246.45, 4.166.246.46, 4.166.95.199
```

Recheck egress before deployment and after any plan/infrastructure move. Shared
App Service IPs are a network restriction, not an application identity; database
credentials, least privileges and verified TLS remain essential.

Server parameter GETs confirm `require_secure_transport=on`,
`ssl_min_protocol_version=TLSv1.2`, `max_connections=50`, and the unchanged
`temp_file_limit=-1`. The planned **8192 kB** limit must be applied and verified
with the managed-provider bootstrap in the next stage. No SQL connection,
schema/seed/role initialization or Azure database test-suite run was performed.

A unique cryptographically generated administrator password is retained only
in a Windows DPAPI-encrypted credential file under
`%LOCALAPPDATA%\FloorFlow\Azure\pg-floorflow-demo-6e9587-admin.credential.xml`.
The directory ACL permits only the current Windows user; encrypted export/import
was verified. It requires that Windows user and machine to decrypt. It is outside
Git and deployment artifacts. Do not print the decrypted credential or use this
administrator in the application.

### Hosting and cost verification

The default hostname is `https://app-floorflow-demo-6e9587.azurewebsites.net/`.
HTTP returned **301** to HTTPS; a separate handshake verified the hostname's
certificate and **TLS 1.3**. Two initial PowerShell page requests timed out;
the browser subsequently displayed Azure's genuine “web app is running and
waiting for your content” placeholder. Their exact timeout cause is unconfirmed.
This verifies the placeholder, not FloorFlow readiness or the running Node binary.
The startup command and health-check path remain unconfigured until deployment.
Keep FloorFlow's `/health` protected and verify narrow proxy trust before sharing.

Before server creation, the portal showed unused PostgreSQL **B1ms 750 hours**,
**32 GB-month data** and **32 GB-month LRS backup** allowances. The refreshed
Retail Prices API still reports **0.1975 SEK/hour** B1ms, **1.3586 SEK/GB-month**
storage and **0 SEK** Linux F1: approximately **188 SEK/month** database fallback
before allowances. Expected base is **0 SEK within matching free allowances**;
actual allowance application is not yet proved by a bill. No inference means no
model token charges from this work; no provisioned hosting was purchased.

The budget GET currently reports **0 SEK** evaluated spend. Billing/usage data
can lag; this is not proof of a zero final charge. Alerts are **not hard spending
limits**, and the 50 SEK alert budget does not authorize inference. No paid
monitoring/action group was added. The separately proposed 20 SEK AI evaluation
still needs approval. Cleanup by **December 15, 2026** remains a plan only.

## Stage 3 / 3.5 subscription snapshot (historical)

The signed-in portal confirmed the existing subscription is **Active**, the
account has **Owner** access, and the offer is displayed as **Microsoft Azure
Plan** with trial benefits. Remaining credit is **1,984.76 SEK**, expiring
**December 16, 2026**. Resource and resource-group inventories were empty after
the checks. Subscription/account identifiers are deliberately omitted here.

| Authorized provider | Before | Verified after registration |
| --- | --- | --- |
| Microsoft.Web | NotRegistered | Registered |
| Microsoft.DBforPostgreSQL | NotRegistered | Registered |
| Microsoft.CognitiveServices | NotRegistered | Registered |

No unrelated provider was registered. The final filtered provider view showed
exactly these three providers as Registered with RegistrationRequired policy.

**Evidence levels:** this historical snapshot used portal selections and GETs;
Stage 4's actual allocation results above supersede its unverified-provisioning
statements. Linked Microsoft documentation describes product capabilities;
prices remain estimates, and actual billing and real-model behavior are unverified.

## Recommended demonstration configuration

| Component | Recommendation | Limitations / verification before purchase |
| --- | --- | --- |
| App Service | One Linux **Free F1** app, Node.js **24 LTS**, default `azurewebsites.net` HTTPS hostname | Allocated and configuration verified in Stage 4. F1 has shared CPU, 60 CPU minutes/day, 1 GB memory/storage, no SLA or Always On. Expect cold starts. |
| Database | Azure Database for PostgreSQL Flexible Server **18**, Burstable **Standard_B1ms**, 1 vCore/2 GiB RAM, **32 GiB Premium SSD**, P4/120 IOPS, no HA, 7-day local backups | Provisioned and read back in Stage 4. Premium SSD **v2** disables Burstable in the portal; use Premium SSD. Geo-backup and storage autogrowth are off. |
| Model | **gpt-5-mini (2025-08-07), GlobalStandard**, pay per token, **10,000 TPM** | Actual deployment succeeded in Stage 4. Live-model behavior remains untested. No provisioned throughput. |
| Region | Prefer **Sweden Central** for all resource locations | No alternative region, paid tier or database version was selected. Global Standard inference can process outside Sweden; data-zone options change residency and pricing. |
| Networking | Public PostgreSQL endpoint, verified TLS, explicit App Service outbound-IP firewall rules | F1 has no VNet integration. Avoid internet-wide or “allow all Azure services” rules. Add a developer IP only temporarily for bootstrap. |

This is a temporary recruiter demo, not a highly available production service.
Use Linux App Service **B1** only if F1 quotas/cold starts prevent a usable demo,
after price approval. It adds Always On and dedicated capacity, but a single
instance still has no rolling-slot deployment strategy. Do not add a NAT gateway,
private endpoints, HA, provisioned model capacity, or a custom domain by default.

Microsoft documents [Node 24 support](https://learn.microsoft.com/en-us/azure/app-service/configure-language-nodejs),
[F1 limits](https://azure.microsoft.com/en-us/pricing/details/app-service/linux/),
[PostgreSQL 18](https://learn.microsoft.com/en-us/azure/postgresql/configure-maintain/concepts-supported-versions),
[Burstable compute](https://learn.microsoft.com/en-us/azure/postgresql/compute-storage/concepts-compute),
and [structured-output models](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/structured-outputs).
Documentation support is not subscription-level capacity verification. The App
Service quota view showed no F1 entry for Sweden Central, only a total-regional
VM entry with 0/0 and an upgrade link; this does not establish F1 availability or
prove that F1 is blocked. Stage 4 subsequently allocated the exact Linux F1 plan
and Node 24 configuration successfully.

PostgreSQL's Sweden Central quota view showed **0/8 standardBSFamily cores** and
**0/24 total cores** used. It grouped B-series under **End of Life**, although
Standard_B1ms remained selectable in the server form. Do not treat that label as
proof of withdrawal or ignore it: recheck new-server SKU availability before
provisioning. No alternative SKU is authorized by this plan.

## Stage 3 / 3.5 Foundry findings and client review (historical)

The Stage 3 portal flow required an existing project. Stage 3.5 resolved the
quota/capacity question **without creating one**: Microsoft Azure CLI **2.93.0**
was installed with explicit approval, authenticated to the existing tenant, and
matched against the portal-verified subscription privately. Tokens and request
headers were not printed. The Learn console's profile-creation flow was cancelled.

### Actual subscription GET results

Snapshot: **2026-11-18, 14:08 UTC**. All four requests returned **HTTP 200**,
one complete page each, with no continuation link or API error:

| GET operation | API version | Returned entries |
| --- | --- | --- |
| `locations/swedencentral/usages` | 2024-10-01 | 308 |
| `modelCapacities`, OpenAI / gpt-5-mini / 2025-08-07 | 2024-10-01 | 92 |
| `modelCapacities`, OpenAI / gpt-5-nano / 2025-08-07 | 2024-10-01 | 40 |
| `quotaTiers` | 2025-10-01-preview | 1 |

These paths follow `/subscriptions/{subscriptionId}/providers/Microsoft.CognitiveServices/`.
Capacity requests supplied `modelFormat`, `modelName` and `modelVersion` exactly
as listed. No PUT, PATCH, deployment or inference operation was performed.

| Sweden Central quota name (`OpenAI.` prefix omitted) | currentValue | limit | unit | Assigned TPM limit |
| --- | --- | --- | --- | --- |
| GlobalStandard.gpt-5-mini | 0 | **500** | Count | **500,000** |
| GlobalStandard.gpt-5-nano | 0 | **0** | Count | **0** |
| DataZoneStandard.gpt-5-mini | 0 | **0** | Count | **0** |
| DataZoneStandard.gpt-5-nano | 0 | **0** | Count | **0** |

Each meter's description explicitly says **One Thousand Tokens Per Minute**.
`currentValue` measures quota consumed by deployments, not inference-token spend.
The zero limits above are explicit returned values, not inferred from missing rows.

For **Sweden Central**, Model Capacities returned `availableCapacity: 500` for
mini / GlobalStandard and **0** for nano / GlobalStandard. Mini's other returned
SKUs there were DataZoneStandard, ProvisionedManaged, DataZoneProvisionedManaged
and GlobalProvisionedManaged, all **0**. Nano returned DataZoneStandard **0**;
its unreturned provisioned SKUs must not be called zero. Across all returned
locations, mini had GlobalStandard capacity **500** at **26** locations including
Sweden Central; nano had **0** at all **26** GlobalStandard locations. Other
returned deployment types had no positive capacity. No alternate region was chosen.

`availableCapacity` is the API's raw **capacity-unit** value; the capacity response
does not contain a separate unit field. It is subscription-scoped availability,
not a measurement of Azure's entire GPU pool or a capacity reservation. Do not
sum repeated regional values into a larger global quota.

The quota-tier API returned **Free Tier**, assigned at `2026-11-18T13:26:48Z`,
with policy **OnceUpgradeIsAvailable** (unchanged). The subscription GET also
showed policy `quotaId: FreeTrial_2014-09-01` and `spendingLimit: On`; these are
billing/offer properties, not the Foundry quota-tier field. Microsoft's current
Tier 0 reference lists mini / GlobalStandard at **500,000 TPM / 500 RPM** and
disallows quota-increase requests at that tier. The RPM figure is documentation,
not a separately returned usage meter. Free Tier does **not** mean free inference.

**Recommendation:** one mini / GlobalStandard deployment in Sweden Central,
initially **10,000 TPM** rather than allocating the full 500,000. This leaves
headroom for a schema-bearing question and the proposed completion budget;
1,000 TPM may not accommodate even one request. Confirm accepted allocation
granularity during the approved deployment. No quota-driven billing upgrade is
justified by these results alone. Owner access, registration, quota and reported
capacity support evaluation, but actual resource/deployment permission, provider
policy validation and live inference still require the separately approved stage.

| Candidate | Public capabilities and availability | Decision |
| --- | --- | --- |
| gpt-5-mini, 2025-08-07 | GA; Sweden Central Global Standard; Chat Completions and strict structured output | Preferred evaluation model; positive quota/capacity verified, actual deployment untested. |
| gpt-5-nano, 2025-08-07 | GA; same required API features; lower public token prices | **Unavailable under the current returned zero quota/capacity.** No automatic fallback, upgrade or quota request. |
| gpt-4.1-mini, 2025-04-14 | Deprecated; Microsoft restricts new-customer access | **Superseded M6A recommendation; do not prefer it for this subscription.** |

Review of `src/assistant/model.js`: the v1 endpoint, single system message,
`max_completion_tokens` and strict JSON Schema contract match the documented
GPT-5 mini/nano interface. The **1,200-token** ceiling includes hidden reasoning
and visible JSON; it can run out before producing SQL. No reasoning effort is
specified. A future, approved evaluation should compare **low effort / 4,096
tokens** with the existing settings; this is a test proposal, not a proven
minimum. Keep rejection of truncated responses and disabled retries.

The SDK timeout and per-request abort are both **20 seconds**. There is no
measured Azure latency; reasoning and shared model capacity can exceed that
deadline. F1 cold starts also affect the browser's overall wait. Measure latency
and completion success before changing limits. If a longer model deadline is
justified, change both deadlines together and keep the browser's current
**35-second** deadline above the entire server request.
No code or timeout was changed. Mocked tests do not prove real-model compatibility.

Sources: [model capabilities](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure),
[deployment regions/types](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure-region-availability),
[lifecycle schedule](https://learn.microsoft.com/en-us/azure/foundry/openai/concepts/model-retirement-schedule),
[new-customer restrictions](https://learn.microsoft.com/en-us/azure/foundry/openai/concepts/model-retirements),
[reasoning/token budgets](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/reasoning),
[quota/tier reference](https://learn.microsoft.com/en-us/azure/foundry/openai/quotas-limits),
[GET interpretation](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/quota),
[Usages REST API](https://learn.microsoft.com/en-us/rest/api/aiservices/accountmanagement/usages/list?view=rest-aiservices-accountmanagement-2024-10-01),
[Model Capacities REST API](https://learn.microsoft.com/en-us/rest/api/aiservices/accountmanagement/model-capacities/list?view=rest-aiservices-accountmanagement-2024-10-01).

## Cost estimate and credit expiry

Public Azure Retail Prices API queries on 2026-11-18 used `currencyCode=SEK`,
`armRegionName=swedencentral`, `priceType=Consumption`, and the PostgreSQL/App
Service service names. The [PostgreSQL SEK query](https://prices.azure.com/api/retail/prices?currencyCode=SEK&$filter=serviceName%20eq%20%27Azure%20Database%20for%20PostgreSQL%27%20and%20armRegionName%20eq%20%27swedencentral%27%20and%20priceType%20eq%20%27Consumption%27)
and [App Service SEK query](https://prices.azure.com/api/retail/prices?currencyCode=SEK&$filter=serviceName%20eq%20%27Azure%20App%20Service%27%20and%20armRegionName%20eq%20%27swedencentral%27%20and%20priceType%20eq%20%27Consumption%27)
can be rerun; prices may change. These are public pay-as-you-go estimates, not a quote for
the user's subscription. The portal's **unused** free meters match B1ms compute
**750 hours/month**, data storage **32 GB-month**, and LRS backup storage
**32 GB-month**. The selected B1ms/32 GiB server form explicitly displayed free
compute/storage allowances. This supports an estimated **0 SEK base charge
within those limits**, but no resource usage or billing statement exists to
verify the final charge. Backup beyond its allowance and other extras can cost
more. Do not transfer these allowances to another SKU/storage product.

| Item | Observed retail rate | Approximate 730-hour month |
| --- | --- | --- |
| PostgreSQL Flexible Server Burstable BS Series, B1MS | 0.1975 SEK/hour | 144 SEK |
| PostgreSQL Flex Server Storage, Storage Data Stored | 1.3586 SEK/GB-month × 32 | 44 SEK |
| Linux App Service F1 | 0 SEK/hour | 0 SEK |
| Base without free allowances | Database + F1 | **188 SEK/month** |
| Expected base within matching free allowances | Database + F1 | **0 SEK/month**, conditional on allowance application |
| Optional Linux App Service B1 | 0.1786 SEK/hour | **+130 SEK/month** (about 318 total) |

Without allowances, seven days is approximately **43 SEK** for database + F1,
or **73 SEK** with App Service B1. Four weeks is approximately **173 / 293 SEK**.

The current [Azure OpenAI pricing page](https://azure.microsoft.com/en-us/pricing/details/cognitive-services/openai-service/)
publishes Global Standard USD rates per million tokens: mini **0.25 input / 2.00
output**, nano **0.05 / 0.40** (price comparison only; nano currently has no usable
quota). Using an explicitly approximate **10 SEK/USD**
planning conversion gives mini **2.50 / 20 SEK**, nano **0.50 / 4 SEK**. These
are estimates, not subscription SEK quotes; ignore caching discounts when budgeting.
For 100 mini questions assuming 3,000 input tokens each, cost is about **3.15 SEK**
if all requests consume the current 1,200-token output ceiling, or **8.94 SEK**
with the proposed 4,096 ceiling. Reasoning is included in billed output tokens.
Neither question length nor actual token usage has been measured with Azure.

Planning reserves **20 SEK** for separately approved initial model tests plus
**30 SEK** contingency: **50 SEK** for a short demo if base allowances apply,
or approximately **100 SEK for one week** budgeting the database at full retail.
Stage 4 configured a 50 SEK/month alert budget; neither that alert nor this
estimate is inference approval, a bill guarantee or a hard spending cap.
No model calls are authorized.

These estimates exclude tax, excess backup/transfer, extra IOPS, logs/monitoring,
other subscription resources, and offer/exchange-rate differences. Storage above
32 GiB, HA or a paid fallback changes the estimate. No extra paid infrastructure
is required by the application design; review any wizard-added monitoring or
storage before approval. Recheck prices and remaining credit before provisioning.
Budget alerts do not enforce a hard spending cap.

The portal still prompts an upgrade to continue after trial expiry. Under
[Azure free-account rules](https://learn.microsoft.com/en-us/azure/cost-management-billing/manage/avoid-charges-free-account),
services are disabled when trial credit expires/runs out unless the account is
upgraded. Continued operation requires an explicitly approved pay-as-you-go
conversion; it was **not** performed. Unused credit expires **December 16, 2026**
even after an earlier upgrade. The separate free-services panel displays benefits
through December 16, 2027; that does not keep an unupgraded trial operational.
First-party service credit eligibility also does not establish model access;
see [credit exclusions](https://learn.microsoft.com/en-us/azure/cost-management-billing/manage/create-free-services).

Recommend cleanup **December 15, 2026**, subject to explicit export/deletion
approval. Stopping PostgreSQL stops compute charges but storage continues and
the service restarts after seven
days; stopping is not permanent cost removal. Deleting the demo resources and
any paid App Service plan ends their ongoing charges, and destroys their data.

Sources: [Retail Prices API](https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices),
[PostgreSQL pricing](https://azure.microsoft.com/en-us/pricing/details/postgresql/flexible-server/),
[Linux App Service pricing](https://azure.microsoft.com/en-us/pricing/details/app-service/linux/),
[PostgreSQL stop behavior](https://learn.microsoft.com/en-us/azure/postgresql/configure-maintain/how-to-stop-server).

## Managed PostgreSQL bootstrap: required M6B work

**Do not assume `npm run db:assistant:setup` can run unchanged on Azure.** The
local Docker administrator is a superuser. Azure's administrator is a member of
`azure_pg_admin`, not the provider's superuser role. Review and implement a
provider-specific bootstrap separately from application startup/deployment:

1. Create one dedicated `floorflow` database. Use a trusted bootstrap administrator
   and non-login owner role; grant the administrator only the role-management /
   SET ROLE rights required for this one-time bootstrap. Keep administration
   credentials out of App Service and GitHub Actions.
2. As the object owner, run `db/init/01-schema.sql`, then `02-seed.sql`, with
   `psql -v ON_ERROR_STOP=1`. They use ordinary PostgreSQL 18 features (NUMERIC,
   identity columns, constraints and indexes), without extensions or superuser
   DDL. Confirm the four seed totals in `db/verify.sql`. Never seed on every deploy.
3. Create distinct non-admin logins `floorflow_app` and `floorflow_ai` with different
   passwords. Neither owns the database/schema/tables or belongs to admin roles.
   Revoke PUBLIC database CREATE/TEMP and public-schema CREATE in this dedicated
   database. Grant each login only CONNECT, public schema USAGE and SELECT on the
   four application tables. The application needs no sequence or write grants.
   Retain the AI connection limit of 3 and outgoing role-membership checks.
4. Review ownership/ADMIN-option requirements for CREATE/ALTER ROLE and GRANT/
   REVOKE on the real provider. The current restrictive CREATE ROLE definition
   succeeded in a local non-superuser CREATEROLE probe, but Azure was not tested.
   Never give `azure_pg_admin`, table ownership, parameter SET rights or another
   administrative capability to the application/AI login to make bootstrap pass.
5. **Adapt `temp_file_limit`:** PostgreSQL requires superuser or delegated SET
   privilege for its per-role setting. A local rollback-only non-superuser probe
   failed with SQLSTATE `42501`. Azure exposes it as a dynamic server parameter:
   set **8192 kB (8 MiB)** through Azure's supported server-parameter control plane
   for this dedicated demo server, omit the unsupported per-role ALTER from the
   Azure bootstrap, and reconnect/verify `SHOW temp_file_limit` as `floorflow_ai`.
   Confirm the actual provider behavior before applying this plan. Do not drop
   the limit or delegate its control to AI.
6. Keep AI defaults: read-only on; `search_path=pg_catalog`; statement timeout 2s,
   lock timeout 500ms, transaction and idle-in-transaction timeouts 5s, work memory
   4 MiB. Verify the runtime role/privilege checks and independent denial of writes
   even after `BEGIN READ WRITE`, temporary objects, and role escalation.
7. B1ms documents 50 total / **35 user connections**. One Node process uses up to
   10 normal + 2 AI pool connections; leave room for administration and brief
   restart overlap. Do not introduce PM2 clustering/multiple app instances.

Actual Azure SQL role behavior, ownership, inherited resource limits and
client-side database certificate validation remain unverified. Stage 4 inspected
server defaults only; its TLS settings are recorded above. The complete development
suite includes privileged fixtures: use it in CI, not against the hosted demo.
Run targeted read-only and rollback-controlled managed-provider acceptance checks.

Sources: [Azure users and administrator privileges](https://learn.microsoft.com/en-us/azure/postgresql/security/security-manage-database-users),
[PostgreSQL temp-file privilege](https://www.postgresql.org/docs/18/runtime-config-resource.html#GUC-TEMP-FILE-LIMIT),
[Azure temp-file parameter](https://learn.microsoft.com/en-us/azure/postgresql/parameters/parameters-resource-usage-disk),
[B1ms connection limits](https://learn.microsoft.com/en-us/azure/postgresql/configure-maintain/concepts-limits).

## App Service acceptance before sharing the URL

| Area | Configuration and verification in M6B |
| --- | --- |
| Runtime | Stage 4 confirmed the runtime catalog and actual `linuxFxVersion=NODE\|24-lts` on the Linux F1 Web App. After deployment, verify `node --version` in the running app; a configured stack and the default placeholder do not prove the application's runtime behavior. |
| Startup | Explicit foreground command `node src/server.js`; host supplies environment variables. Verify logs show successful DB startup and the expected listening interface. Avoid npm/PM2 wrapper ambiguity for signals; no build is needed for plain JS. Default platform warm-up accepts any HTTP status, so a protected response can start routing traffic but does not prove readiness. Do not require warm-up status 200 on an endpoint the probe cannot authenticate to. |
| Host/port | `NODE_ENV=production`, default host `0.0.0.0`, platform-provided numeric `PORT`; do not override it with the local port. Verify cold-start routing and a real request. |
| HTTPS | Enable App Service HTTPS Only and use its default HTTPS hostname. Check external HTTP handling, TLS certificate, 401 without credentials, and successful access with the preview credentials. Secrets must never be put in URLs or logs. |
| Proxy trust | Inspect only socket address, forwarded protocol and trusted edge behavior in a controlled diagnostic, without Authorization headers or customer data. Configure only verified proxy IPs/narrow CIDRs; use `loopback` only if actually observed. Require edge overwriting of spoofed forwarded headers and no direct public backend route. If stable narrow trust cannot be established, stop and resolve it; never use `true`, hop counts, or broad private ranges. |
| Database TLS | `PGHOST=<server>.postgres.database.azure.com`, `PGPORT=5432`, `PGSSLMODE=verify-full` for both pools. Use current trusted Azure root CAs through Node's trust store or a reviewed public CA bundle via `NODE_EXTRA_CA_CERTS`; never disable certificate verification. Confirm TLS via `pg_stat_ssl` and a controlled wrong-CA/hostname negative test. |
| Firewall | Read `outboundIpAddresses` and `possibleOutboundIpAddresses`; allow the required exact app egress IPs, document changes after plan moves, and remove temporary bootstrap access. Do not mistake the AppService service tag for an outbound-IP allowlist. |
| Health | Keep `/health` protected. The platform's built-in probe cannot satisfy custom Basic auth as implemented. Initially leave it unconfigured and perform authenticated HTTPS readiness checks on demand. A bare 401 is an access-gate check, not database readiness. Any later platform-token solution must validate the documented internal token and network trust, be narrowly scoped to health, and receive separate review/tests; do not add anonymous access. |
| Restarts | Test SIGTERM/process restart, ten-second shutdown deadline, both pools closing, cold-start DB failure/recovery, and preview authentication after restart. Expect in-flight AI interruption and reset process-local budgets. |

The code's production guards remain unchanged. Configure server-only
`PREVIEW_USERNAME`, a long random `PREVIEW_PASSWORD`, verified `TRUST_PROXY`,
the five normal `PG*` connection variables, `PGSSLMODE`, and separate `AI_PG*`.
Leave Azure model settings blank until paid-test approval; later provide the full
`AZURE_FOUNDRY_ENDPOINT` ending `/openai/v1/`, actual deployment name in
`AZURE_FOUNDRY_MODEL`, and `AZURE_FOUNDRY_API_KEY` through Azure configuration.
Use secret references/settings as appropriate; never copy `.env` into an artifact.
See [READINESS.md](READINESS.md) for the complete application-variable contract.

Sources: [Node hosting](https://learn.microsoft.com/en-us/azure/app-service/configure-language-nodejs),
[App Service IPs](https://learn.microsoft.com/en-us/azure/app-service/overview-inbound-outbound-ips),
[proxy trust](https://expressjs.com/en/guide/behind-proxies/),
[Azure PostgreSQL TLS](https://learn.microsoft.com/en-us/azure/postgresql/security/security-tls),
[protected health probes](https://learn.microsoft.com/en-us/azure/app-service/monitor-instances-health-check).
See also [platform warm-up settings](https://learn.microsoft.com/en-us/azure/app-service/reference-app-settings).

## Eventual deployment pipeline (M6B only)

Extend CI with a separate deployment job that has `needs: test` and runs only
when `github.event_name == 'push' && github.ref == 'refs/heads/main'`. Pull requests
run tests only. Grant `id-token: write` only to the deployment job, plus
`contents: read`; serialize deployments to the one demo app.

Use GitHub OIDC with Azure Login and a user-assigned deployment identity. Its
federation issuer is `https://token.actions.githubusercontent.com`, audience
`api://AzureADTokenExchange`, subject
`repo:Perss00n/FloorFlow:ref:refs/heads/main`. Assign **Website Contributor scoped
only to the target App Service resource**, not subscription Contributor. The
initial operator needs permission to create the resources/identity/federation
and assign that role; the deployment identity needs no PostgreSQL administration
or Foundry management permission. Store client/tenant/subscription IDs as GitHub
configuration values; no client secret or publishing profile. Disable SCM/FTP
Basic publishing credentials independently of the application's preview Basic auth.

After CI succeeds, produce a whitelist artifact containing `src/`, `public/`,
**`db/init/01-schema.sql`** (read by the assistant at runtime), `package.json`,
`package-lock.json` and Linux-installed production `node_modules/` from
`npm ci --omit=dev`. Exclude `.env*`, `.git`, test code, admin setup scripts, seed
data, logs, documentation and archives. Use official pinned Azure Login and
Web Apps Deploy actions, with `SCM_DO_BUILD_DURING_DEPLOYMENT=false` for this
prepared artifact. Do not depend on a second unpinned install during deployment.

Keep application/database/model credentials solely in Azure configuration.
Start with a CI-proven artifact and retain its commit/artifact for code rollback;
rollback must never reseed or destroy data. Verify protected readiness with an
authorized client; any automated credentialed monitor needs a separately reviewed
secret-handling design. [Microsoft's OIDC deployment guide](https://learn.microsoft.com/en-us/azure/app-service/deploy-github-actions)
documents the identity and app-scoped role. No deployment job exists.

## Exact remaining M6B gates

1. **Completed in Stage 2:** PR #1 merged normally as `90108d8`;
   [main CI](https://github.com/Perss00n/FloorFlow/actions/runs/44294173763) passed
   all 264 tests. Stages 3 and 3.5 changed documentation only; no new CI run was triggered.
2. **Completed in Stage 4:** the approved resources were provisioned with the exact
   model/version/SKU, database configuration, Linux F1 plan, Node 24 stack, HTTPS
   and narrow database firewall. Verify delayed free-meter application/costs as
   usage arrives; do not upgrade or change spending limits automatically.
3. **Next stage, approval required:** temporarily permit one trusted bootstrap IP,
   connect using verified PostgreSQL TLS, create the dedicated database/owner and
   separate least-privilege application/AI roles, and initialize schema/seed once.
   Adapt the managed-provider script and set/verify the 8192 kB temp-file limit.
   Check exact seed totals and independent AI permission/resource limits using
   focused checks. Remove temporary network access afterward. Do not run the full
   development test suite against Azure.
4. Configure server-only application/preview secrets, production host/port and
   foreground startup. Verify actual ingress/narrow proxy trust, HTTPS Basic auth,
   database certificate validation, protected health and safe startup/shutdown
   before sharing. No app credentials are configured yet.
5. After separate approval, add the narrowly scoped OIDC identity and deployment
   job; deploy the CI-proven artifact and test main-only deployment, failed-CI
   blocking, PR non-deployment and code rollback.
6. Keep model access disabled until its approved configuration/evaluation stage.
   Then review exact network access and server-only model credentials, obtain
   explicit paid-call approval, and run [AZURE_ACCEPTANCE.md](AZURE_ACCEPTANCE.md).
   Measure the existing timeout/token budget before changing code. Mocked tests
   and successful control-plane deployment do not establish model compatibility
   or query semantics.
7. Share the authenticated HTTPS URL and credentials through appropriate separate
   channels only after acceptance. Monitor credits/free-meter use and budget alerts;
   obtain deletion/export approval for cleanup by December 15, 2026.
