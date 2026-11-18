# Azure deployment plan (M6B Stage 3; not provisioned)

Review date: **2026-11-18**. Only the three authorized resource providers were
registered. No resource group, billable resource, deployment identity, deployment
workflow or model call was created. Provisioning and paid tests require approval.
The repository remains private. No application code was changed in Stage 3.

## Verified subscription facts

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

**Evidence levels:** portal selections and quota readings below are subscription
observations; linked Microsoft documentation describes product capabilities;
prices are estimates; allocation, actual billing and real-model behavior remain
unverified. Unsaved configuration forms were inspected, never submitted for
resource creation. An offered SKU and available quota do not reserve capacity.

## Recommended demonstration configuration

| Component | Recommendation | Limitations / verification before purchase |
| --- | --- | --- |
| App Service | One Linux **Free F1** app, Node.js **24 LTS**, default `azurewebsites.net` HTTPS hostname | All four choices, including Sweden Central, were selectable together in the subscription's form. Actual allocation is unverified; F1 has shared CPU, 60 CPU minutes/day, 1 GB memory/storage, no SLA or Always On. Expect cold starts. |
| Database | Azure Database for PostgreSQL Flexible Server **18**, Burstable **Standard_B1ms**, 1 vCore/2 GiB RAM, **32 GiB Premium SSD**, P4/120 IOPS, no HA, 7-day local backups | This exact combination was selectable. Premium SSD **v2** disables Burstable in the portal; explicitly use Premium SSD. Leave geo-backup and storage autogrowth off for the bounded demo. |
| Model | Conditional preference: **gpt-5-mini (2025-08-07), Global Standard**, pay per token | Publicly listed for Sweden Central; usable subscription quota, offer eligibility and allocation are not established. No provisioned throughput. See model review below. |
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
prove that F1 is blocked. The creation form did offer F1 for Linux/Node 24 there.
Final deployment validation/allocation remains a gate.

PostgreSQL's Sweden Central quota view showed **0/8 standardBSFamily cores** and
**0/24 total cores** used. It grouped B-series under **End of Life**, although
Standard_B1ms remained selectable in the server form. Do not treat that label as
proof of withdrawal or ignore it: recheck new-server SKU availability before
provisioning. No alternative SKU is authorized by this plan.

## Foundry model and client review

The authenticated Foundry catalog exposed **gpt-5-mini**. Both the new resource
list and project selector were empty; the model flow required an existing
project and offered only creation of a new one. No project was created. Actual
TPM/RPM quota, quota tier, offer restrictions and model deployment entitlement
could not be established through that portal flow. **Unknown is not zero quota.**
Azure CLI is not installed locally; no authenticated control-plane quota query
was executed. Such a read-only query is an alternative to creating a resource.
Provider registration alone neither grants model quota nor verifies trial access.

| Candidate | Public capabilities and availability | Decision |
| --- | --- | --- |
| gpt-5-mini, 2025-08-07 | GA; Sweden Central Global Standard; Chat Completions and strict structured output | Preferred evaluation candidate, conditional on actual quota/eligibility. |
| gpt-5-nano, 2025-08-07 | GA; Sweden Central Global Standard; same required API features; lower token prices | Cheaper candidate for a later comparison; SQL/business accuracy is untested. No automatic fallback. |
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
[quota and offer eligibility](https://learn.microsoft.com/en-us/azure/foundry/openai/quotas-limits).

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
output**, nano **0.05 / 0.40**. Using an explicitly approximate **10 SEK/USD**
planning conversion gives mini **2.50 / 20 SEK**, nano **0.50 / 4 SEK**. These
are estimates, not subscription SEK quotes; ignore caching discounts when budgeting.
For 100 mini questions assuming 3,000 input tokens each, cost is about **3.15 SEK**
if all requests consume the current 1,200-token output ceiling, or **8.94 SEK**
with the proposed 4,096 ceiling. Reasoning is included in billed output tokens.
Neither question length nor actual token usage has been measured with Azure.

Propose **20 SEK** for initial model tests plus **30 SEK** contingency: **50 SEK**
for a short demo if base allowances apply, or approximately **100 SEK for one
week** budgeting the database at full retail. This is a proposed budget, not
approval, a bill guarantee or a hard spending cap. No model calls are authorized.

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

Actual Azure SQL role behavior, ownership, parameter settings and TLS remain
unverified. The complete development suite includes privileged fixtures: use it
in CI, not against the hosted demo. Run targeted read-only and rollback-controlled
managed-provider acceptance checks instead.

Sources: [Azure users and administrator privileges](https://learn.microsoft.com/en-us/azure/postgresql/security/security-manage-database-users),
[PostgreSQL temp-file privilege](https://www.postgresql.org/docs/18/runtime-config-resource.html#GUC-TEMP-FILE-LIMIT),
[Azure temp-file parameter](https://learn.microsoft.com/en-us/azure/postgresql/parameters/parameters-resource-usage-disk),
[B1ms connection limits](https://learn.microsoft.com/en-us/azure/postgresql/configure-maintain/concepts-limits).

## App Service acceptance before sharing the URL

| Area | Configuration and verification in M6B |
| --- | --- |
| Runtime | Node 24 LTS was selectable for Linux in Sweden Central. Before deployment, check `az webapp list-runtimes --os linux`; afterward inspect `linuxFxVersion` and `node --version` in the running app. No live App Service runtime was tested. |
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
   all 264 tests. Stage 3 changed documentation only; no new CI run was triggered.
2. **Still blocking provisioning approval:** establish actual model quota/access
   and whether an account upgrade is required; obtain any separate billing-change
   approval first. Recheck regional allocation, B1ms availability and matching
   allowance eligibility. Approve exact resources, costs and cleanup date without
   silently changing region, tier, database version or model.
3. Provision the approved resources, restricted firewall, HTTPS and secrets;
   implement and verify managed PostgreSQL bootstrap and inherited resource limits.
4. Verify the actual ingress/proxy trust, Basic authentication, certificate
   verification, protected health strategy and foreground startup/shutdown.
5. Add the narrowly scoped OIDC identity and deployment job; test a successful
   main deployment, failed-CI deployment block, PR non-deployment and code rollback.
6. Obtain explicit paid-call approval and run [AZURE_ACCEPTANCE.md](AZURE_ACCEPTANCE.md)
   against the chosen real deployment. Mocked tests do not establish query semantics.
7. Share the HTTPS URL and credentials through appropriate separate channels;
   monitor credit consumption and remove resources with approval before expiry.
