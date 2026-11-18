# Azure deployment plan (M6A; not executed)

Research date: **2026-11-18**. No Azure resources, identity, database, deployment,
paid model call or deployment workflow has been created. M6B requires approval.
Repository visibility remains private; this plan does not authorize publication.

## Recommended demonstration configuration

| Component | Recommendation | Limitations / verification before purchase |
| --- | --- | --- |
| App Service | One Linux **Free F1** app, Node.js 24, default `azurewebsites.net` HTTPS hostname | Confirm subscription/region capacity; shared CPU, 60 CPU minutes/day, 1 GB memory/storage, no SLA or Always On; expect cold starts. Do not choose Windows F1 for Node 24's x64 requirement. |
| Database | Azure Database for PostgreSQL Flexible Server **18**, Burstable **B1ms**, 1 vCore/2 GiB RAM, 32 GiB storage, no HA, 7-day local backups | Small demonstration only; CPU credits can throttle sustained work. Confirm version/SKU availability in the subscription. |
| Model | Azure Foundry resource with a small pay-per-token Chat Completions deployment, initially **gpt-4.1-mini** if available | Must support strict JSON schema and the current token-limit parameter. Confirm regional availability, quota, current price and credit eligibility before deploying. No provisioned throughput. |
| Region | Prefer **Sweden Central** for all three resource locations | Check App Service F1, PostgreSQL 18/B1ms and model capacity together. A Global Standard model deployment may process outside Sweden; use an appropriate data-zone/regional option if location requirements change. |
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
Documentation support is not subscription-level capacity verification.

## Cost estimate and credit expiry

Public Azure Retail Prices API queries on 2026-11-18 used `currencyCode=SEK`,
`armRegionName=swedencentral`, `priceType=Consumption`, and the PostgreSQL/App
Service service names. The [PostgreSQL SEK query](https://prices.azure.com/api/retail/prices?currencyCode=SEK&$filter=serviceName%20eq%20%27Azure%20Database%20for%20PostgreSQL%27%20and%20armRegionName%20eq%20%27swedencentral%27%20and%20priceType%20eq%20%27Consumption%27)
and [App Service SEK query](https://prices.azure.com/api/retail/prices?currencyCode=SEK&$filter=serviceName%20eq%20%27Azure%20App%20Service%27%20and%20armRegionName%20eq%20%27swedencentral%27%20and%20priceType%20eq%20%27Consumption%27)
can be rerun; prices may change. These are public pay-as-you-go estimates, not a quote for
the user's subscription. No free database promotion is assumed.

| Item | Observed retail rate | Approximate 730-hour month |
| --- | --- | --- |
| PostgreSQL Flexible Server Burstable BS Series, B1MS | 0.1975 SEK/hour | 144 SEK |
| PostgreSQL Flex Server Storage, Storage Data Stored | 1.3586 SEK/GB-month × 32 | 44 SEK |
| Linux App Service F1 | 0 SEK/hour | 0 SEK |
| Recommended base total | Database + F1 | **188 SEK/month** |
| Optional Linux App Service B1 | 0.1786 SEK/hour | **+130 SEK/month** (about 318 total) |

Seven days continuously running is approximately **43 SEK** for database + F1,
or **73 SEK** with App Service B1. Four weeks is approximately **173 / 293 SEK**.
Allow a separate initial **20 SEK model-test budget** and a contingency; this is
a proposed approval limit, not a verified model price or enforced spending cap.
Actual model charges depend on tokens, deployment type and the chosen model.

These estimates exclude tax, excess backup/transfer, extra IOPS, logs/monitoring,
other subscription resources, and offer/exchange-rate differences. Storage above
32 GiB, HA or a paid fallback changes the estimate. Confirm the portal calculator
and available **approximately 2,000 SEK credit** immediately before provisioning.
Set budget alerts, recognizing alerts do not enforce a hard spending cap.

The stated credits expire **December 16, 2026**. Plan removal by December 15,
after any required export and explicit deletion approval. Stopping PostgreSQL
stops compute charges but storage continues and the service restarts after seven
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
| Runtime | Check `az webapp list-runtimes --os linux`, select the advertised Node 24 stack, inspect `linuxFxVersion` and run `node --version` in the running app. Subscription/region availability is not verified in M6A. |
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
documents the identity and app-scoped role. No deployment job exists in M6A.

## Exact remaining M6B gates

1. Approve pushing `codex/m6a-ci-preparation` to the existing private repository
   and opening a pull request targeting `main`. A branch push alone does not
   trigger this workflow. Observe the PR CI run, review/approve the merge, and
   verify the resulting `main` CI run before deployment.
2. Approve the resource/SKU/region choices, current subscription pricing, credit
   eligibility and spend/removal dates. Confirm Node 24, PostgreSQL 18/B1ms and
   model capacity using the subscription, without silently downgrading the DB.
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
