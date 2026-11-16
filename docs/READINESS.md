# M5 review and deployment preparation

M5 prepares the source for a restricted reviewer demo. Nothing is deployed.
Azure calls, actual cloud ingress, PostgreSQL TLS, and Linux signal delivery have
not been verified. Complete the environment checks below in M6 before sharing it.

## Review findings

| Severity | Finding | Resolution |
| --- | --- | --- |
| High before public exposure | Frontend and AI API had no access gate | Optional local Basic authentication; mandatory in production, before all routes |
| Medium | A very small nonzero decimal underflows to JS zero inside the SQL parser and changes regenerated SQL | Check the parser's original numeric token; reject nonzero fractional literals, including underflow |
| Medium | Loopback-only listening and mandatory `.env` prevent environment-only hosting | Production default `0.0.0.0`; optional environment file, explicit host override |
| Medium | Shutdown could wait indefinitely or close pools twice on different signals | One shared cleanup promise and a ten-second deadline, then forced exit with code 1 |
| Low | Raw backend error messages were copied into application logs; role setup connection failures bypassed cleanup | Fixed safe messages and guarded connection/rollback cleanup |
| Low | SQL disclosure control lacked the application's explicit keyboard focus style | Include `summary:focus-visible` |

No structural SQL write/access bypass was demonstrated. The validator was
retained, with one focused numeric-literal fix. Unsafe syntax, joins outside the
three foreign-key relationships, unauthorized schemas/tables/functions, and
multiple statements fail closed. Prepared string parameters, regenerated SQL,
extended protocol, independent database ACLs, read-only transactions, and
execution limits remain separate boundaries. Safe syntax does **not** establish
that the model chose the right status filter, price column, joins, or aggregation.

## Preview access

For local use, leave both `PREVIEW_USERNAME` and `PREVIEW_PASSWORD` blank. To
enable the gate, set both in the ignored `.env` and restart Node. The browser
shows its normal Basic authentication prompt. API clients must send the same
Basic credentials in the Authorization header. Never put credentials in URLs,
frontend files, example commands, or Git. Generate a long random password with
a password manager and share it with reviewers through an appropriate channel.

`NODE_ENV=production` requires a username and password of at least 16 characters.
Usernames allow 1–64 ASCII letters, digits, dots, underscores, and hyphens.
Passwords allow up to 256 characters, including colons and UTF-8, without control
characters. Partial configuration fails startup. Credentials are SHA-256 hashed
and compared as equal-size buffers using Node's `timingSafeEqual`; no password
database or session is needed for this single shared preview credential.

The gate covers **all** routes: HTML, CSS/JS, health, REST, assistant, and unknown
paths. Unauthorized requests return a generic JSON 401 and a Basic challenge;
they never reach the database, model, or request-body parser. Protected responses
are `no-store`. Production HTTP returns 426 without an authentication challenge.
The app sends a restrictive same-origin CSP, `nosniff`, and `no-referrer` headers.
HTTPS production responses also send HSTS.

Basic credentials are only encoded in transit; HTTPS provides encryption. This
is a temporary shared demo gate, with no individual identities, MFA, account
lockouts, or per-reviewer audit trail. Browsers cache credentials and provide no
reliable application logout. Use a private browser window, close it after review,
and rotate the shared credential/restart the app when access should end.

## Environment supplied by the host in M6

| Variable | Requirement |
| --- | --- |
| `NODE_ENV` | `production` (the app rejects unrecognized environment names) |
| `PORT` | Host-supplied integer port, or default 3000 |
| `HOST` | Optional IP address/localhost override; defaults to `0.0.0.0` in production and `127.0.0.1` locally |
| `PREVIEW_USERNAME`, `PREVIEW_PASSWORD` | Required production shared preview credentials |
| `TRUST_PROXY` | Comma-separated actual ingress IPs/CIDRs; `loopback` only if ingress actually connects over loopback |
| `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` | Normal runtime database connection, separate from AI and administrative accounts |
| `PGSSLMODE` | Production requires `verify-full`; leave blank for local Docker |
| `AI_PGUSER`, `AI_PGPASSWORD` | Dedicated `floorflow_ai` login; see [role setup](ASSISTANT.md#local-read-only-login-setup) |
| `AZURE_FOUNDRY_ENDPOINT`, `AZURE_FOUNDRY_MODEL`, `AZURE_FOUNDRY_API_KEY` | Required only to enable real model calls, after explicit approval |

`npm start` uses Node 24's `--env-file-if-exists=.env`; a file is optional and
already supplied environment variables take precedence. Do not copy the local
`.env` to the deployment package. Local `npm run dev` behavior is preserved.

Production refuses insecure HTTP. Configure HTTPS-only ingress and isolate the
Node port from direct public access. The proxy must overwrite forwarded protocol
and client-IP headers. Only then set `TRUST_PROXY` to its actual addresses. Blind
`true`, hop counts, and `/0` networks are rejected. The app ignores forwarded
headers by default and refuses ambiguous protocol lists. M6 must confirm the
real App Service proxy chain and external HTTP/HTTPS behavior; no trusted cloud
network range is guessed here. Incorrect trust can undermine HTTPS checks and
IP budgets. Application checks cannot prevent a client sending credentials over
HTTP before receiving a response: use the HTTPS URL from the first request.

`pg` reads `PGSSLMODE` for both pools and verifies the PostgreSQL certificate.
Use a trusted CA chain and hostname; do not disable Node's TLS verification.
The local Compose initialization account is a superuser: **do not deploy it**.
Provision a separate non-owner, non-admin runtime login with only CONNECT,
schema USAGE and SELECT on the four application tables, and a separate AI login.
An administrator must apply/review the AI role setup; it is not a startup task.
Actual managed PostgreSQL TLS and least-privilege runtime provisioning remain M6 work.

Health probes also require authentication and HTTPS; agree a supported protected
probe configuration in M6. No anonymous health exception is implemented.
SIGINT/SIGTERM stop accepting HTTP requests, wait for active connections, then
close both pools. The ten-second deadline includes pool cleanup and may interrupt
a model call during shutdown. In-memory budgets reset on restart and are shared
only within one process. Use a single demo instance, provider-side spending
limits, and a reviewer-only password; this is not a durable cost-control system.

## Verification on 2026-11-16

- **264 tests passed, zero failed or skipped**, including the original 230.
  Existing M1–M4 tests preserved; M5 adds authentication, proxy spoofing,
  numeric-underflow, environment-only startup, safe setup failures, redacted logs,
  and bounded/idempotent shutdown coverage. Tests use local PostgreSQL and mocks
  or intercepted SDK transport; no paid Azure call is made.
- Completed sales `285415.00`, Maple spending `101536.50`, top customer Harbor
  Office Studio `109000.00`, and completed oak `118.500 m²` match the seed.
  Existing tests verify historical prices, excluded statuses and four half-cent
  lines totaling `0.04` rather than `0.02`. Test changes roll back.
- `docker compose config --quiet`, real role ACLs and statement/lock timeouts,
  static-file isolation, API responses, and exact decimal formatting checked.
  Rerunning `npm run db:assistant:setup` succeeded. `db/verify.sql` confirmed five
  customers, twelve orders, twelve articles, forty-eight items and three foreign keys.
- `npm audit` reports zero known vulnerabilities; four direct dependencies and
  their pinned versions are unchanged. An audit is not proof of absence of bugs.
- Chrome smoke check: all three pages, customer/order/back links, 36,117.00 SEK
  order total, mobile cards, keyboard focus, and explicit unavailable assistant
  with restored controls at 1440×900 and 390×844. No captured console warnings or
  errors. Authentication/proxy behavior is automated HTTP verification, not a
  test of real cloud TLS. This is not a cross-browser accessibility audit.

Before enabling AI, run the [real-model acceptance checklist](AZURE_ACCEPTANCE.md).
Passing mocked SQL tests does not validate a real model's business interpretation.

References: [Express proxy trust](https://expressjs.com/en/guide/behind-proxies/),
[Node environment loading](https://nodejs.org/docs/latest-v24.x/api/cli.html#--env-file-if-existsfile),
[node-postgres TLS](https://node-postgres.com/features/ssl).
