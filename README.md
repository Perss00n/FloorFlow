# FloorFlow

FloorFlow is a small application inspired by flooring contracting. It shows
customers, orders, materials, and labor, with an AI assistant for sales questions.
This repository implements **M1 through M5 and M6A preparation**: local PostgreSQL, schema, seed data,
an Express health endpoint, a read-only REST API, and a responsive frontend for
browsing customers and orders. The home page includes an Azure Foundry database
assistant with structural SQL validation and a separate read-only login.
M5 adds optional preview authentication, production configuration guards,
bounded shutdown, and targeted security and reliability regression tests.
M6A adds CI-only GitHub Actions verification and a documented Azure deployment plan.
**Real Azure integration has not been verified:** local tests use model mocks
and actual PostgreSQL, without paid API calls. Missing configuration returns 503.

## Technologies and prerequisites

- Node.js **24.x** and npm.
- Express 5 and the `pg` PostgreSQL driver, using plain JavaScript and ES modules.
- The official `openai` JavaScript SDK for Azure Foundry's OpenAI-compatible v1 API.
- `pgsql-ast-parser` to validate and regenerate a restricted SELECT syntax tree.
- Docker Desktop running Linux containers, with Docker Compose v2 or newer.
- The official `postgres:18` image. The major version is explicit; the tag can
  receive minor updates. Major upgrades require a separate data migration.

These four packages are the only direct dependencies. Node provides environment-file
loading, watch mode, HTTP test requests, and the test runner; no extra packages
are needed for them.

## Project structure

```text
FloorFlow/
├── .github/
│   └── workflows/
│       └── ci.yml
├── .env.example
├── .gitattributes
├── .gitignore
├── compose.yaml
├── package.json
├── package-lock.json
├── README.md
├── db/
│   ├── init/
│   │   ├── 01-schema.sql
│   │   └── 02-seed.sql
│   └── verify.sql
├── docs/
│   ├── API.md
│   ├── ASSISTANT.md
│   ├── AZURE_ACCEPTANCE.md
│   ├── CI.md
│   ├── DEPLOYMENT.md
│   └── READINESS.md
├── scripts/
│   ├── check-syntax.js
│   └── setup-assistant-db.js
├── public/
│   ├── index.html
│   ├── customer.html
│   ├── order.html
│   ├── favicon.svg
│   ├── css/
│   │   └── styles.css
│   └── js/
│       ├── api.js
│       ├── assistant.js
│       ├── customers.js
│       ├── customer.js
│       ├── order.js
│       ├── format.js
│       └── ui.js
├── src/
│   ├── app.js
│   ├── db.js
│   ├── preview-auth.js
│   ├── runtime.js
│   ├── shutdown.js
│   ├── assistant/
│   │   ├── assistant.js
│   │   ├── config.js
│   │   ├── database.js
│   │   ├── errors.js
│   │   ├── model.js
│   │   ├── schema.js
│   │   └── sql.js
│   ├── routes/
│   │   ├── assistant.js
│   │   ├── customers.js
│   │   ├── orders.js
│   │   └── validate-id.js
│   └── server.js
└── test/
    ├── api.test.js
    ├── assistant-integration.test.js
    ├── assistant-model.test.js
    ├── assistant-sql.test.js
    ├── database.test.js
    ├── format.test.js
    ├── frontend-api.test.js
    ├── health.test.js
    ├── preview-auth.test.js
    ├── runtime.test.js
    ├── shutdown.test.js
    ├── startup.test.js
    └── static.test.js
```

Local `.env` and `node_modules/` are excluded from Git.

## Local setup

Run commands from the project directory. In PowerShell:

```powershell
Copy-Item .env.example .env
```

On macOS/Linux, use `cp .env.example .env`. Do not overwrite an existing `.env`.
Edit `.env` and replace `PGPASSWORD` and `AI_PGPASSWORD` with different local
development passwords. Keep `AI_PGUSER=floorflow_ai`. Azure values can stay blank.
The other example values are usable defaults:

| Variable | Purpose |
| --- | --- |
| `PORT` | Node HTTP port, normally `3000` |
| `NODE_ENV` / `HOST` | Development defaults to loopback; production defaults to all interfaces |
| `PREVIEW_USERNAME` / `PREVIEW_PASSWORD` | Both blank locally, both required in production |
| `TRUST_PROXY` | Blank locally; explicitly trusted ingress addresses in production |
| `PGSSLMODE` | Blank locally; `verify-full` required in production |
| `PGHOST` | Host used by Node, normally `127.0.0.1` |
| `PGPORT` | Published PostgreSQL port, normally `5432` |
| `PGDATABASE` | Local database name |
| `PGUSER` | Local database username |
| `PGPASSWORD` | Local database password; never commit it |
| `AI_PGUSER` / `AI_PGPASSWORD` | Separate read-only assistant login; configure with the setup command below |
| `AZURE_FOUNDRY_ENDPOINT` | Full Azure resource endpoint ending in `/openai/v1/`; blank disables AI |
| `AZURE_FOUNDRY_MODEL` | Actual Azure model deployment name |
| `AZURE_FOUNDRY_API_KEY` | Azure resource API key, server only; blank disables AI |

Compose and Node both support `.env`; Node also starts without that file when
the host supplies environment variables. Compose maps the `PG*` values to the official
image's `POSTGRES_*` initialization variables. Existing shell variables override
file values, so avoid conflicting `PG*` settings in your terminal. If a port is
occupied, change `PGPORT` or `PORT` in `.env`. Keep `PGHOST=127.0.0.1` for this setup.

```powershell
docker compose config --quiet
docker compose pull db
docker compose up -d --wait
npm ci
npm run db:assistant:setup
npm start
```

Open <http://127.0.0.1:3000/> to use FloorFlow. The existing
<http://127.0.0.1:3000/health> endpoint returns:

```json
{"status":"ok","database":"connected"}
```

The server checks the database before listening. `/health` runs `SELECT 1` on
every request and returns HTTP 503 if that query fails. HTTP and database ports
are bound to loopback for local development.
Use `npm run dev` for automatic Node restarts when source files change.
Press Ctrl+C to stop Node.

## Frontend (M3)

The same Express application serves the three static pages and the API. No
frontend framework, bundler, external font service, or additional dependency is
needed. Start with the commands above; no separate frontend server is required.

| Page | Local URL | Use |
| --- | --- | --- |
| Customer overview | <http://127.0.0.1:3000/> | Customer names, contact details, and the database assistant |
| Customer details | <http://127.0.0.1:3000/customer.html?id=1> | Customer contact information and orders, newest first |
| Order details | <http://127.0.0.1:3000/order.html?id=1> | Customer, status, creation date, articles, agreed prices, and order total |

Select a customer's name on the home page, then an order number on the customer
page. On an order, the customer name, breadcrumb, and back link return to the
customer. The header's Customers link always returns to the overview.

Pages display loading, empty, invalid-link, not-found, and failure states. Error
states offer a reload link when retrying could help. Tables become labelled
cards on narrow screens. Keyboard users have a skip link and visible focus
outlines. Contact details and all other API content are inserted with
`textContent` and DOM methods, without `innerHTML`.

The files have small, specific responsibilities:

- The HTML files define each page's semantic structure and initial loading state.
- `styles.css` contains the shared colors, layouts, panels, status badges, focus
  states, and responsive rules. The system font stack needs no downloads.
- `api.js` uses native `fetch`, applies a ten-second request timeout, and validates
  one `id` from `URLSearchParams` before detail pages request data. IDs use the
  same positive PostgreSQL INTEGER range as M2; ambiguous duplicate IDs are rejected.
- `customers.js`, `customer.js`, and `order.js` fetch and render their own page.
  Detail pages request the resource and its collection together with `Promise.all`.
- `format.js` formats money by grouping the original string's digits. For example,
  `"36117.00"` becomes `"36,117.00 SEK"`, without conversion to `Number`. Quantities
  lose only trailing fractional zeros and retain their units. Dates use English
  formatting and UTC so a user's timezone does not change the displayed day.
- `ui.js` shares the small message and status-badge functions used across pages.

All money calculations remain in PostgreSQL. Browsing displays totals for all
order statuses, and every monetary amount is SEK excluding VAT. The browser
never sums lines or changes the API's historical prices.

`app.js` serves only `public/` through Express static middleware, using a path
relative to the application module. Database files, source code, `.env`, and
Git metadata are outside that directory; dotfiles are ignored. API routes remain
registered before static middleware, and unknown resources retain the JSON 404.

## AI assistant (M4)

The home page accepts a question and shows the answer, exact result values, and
a collapsible executed-SQL section. Each question is independent; previous chat
messages are not sent to the model. API-provided content is always rendered as text.

One Azure model request receives the existing schema file and business rules and
returns structured SQL. A strict AST allowlist authorizes a small SELECT subset.
Accepted SQL is regenerated with qualified table names, parameterized string
values, and a row limit, then executed through the separate restricted pool in
a read-only transaction. Short database timeouts and memory/temp-file limits
also constrain the work. The English answer is constructed directly from the
returned rows, without a second model call or invented figures.

See [ASSISTANT.md](docs/ASSISTANT.md) for the complete flow, exact security
policy, role setup, limits, limitations, and future approved live testing. See
[API.md](docs/API.md) for `POST /api/assistant/chat` and its response contract.

Local setup does not require Azure credentials. `npm run db:assistant:setup`
creates/configures `floorflow_ai` and grants SELECT only on the four application
tables. It also revokes inherited PUBLIC CREATE/TEMPORARY privileges in this
dedicated database; the existing owner retains its rights. The command changes
permissions, not seed data. Run it again after recreating the database volume.

Azure requires an existing resource and a deployed model supporting strict JSON
schema Chat Completions. Use its full resource v1 URL, actual deployment name,
and API key. No resource is provisioned by this application. **Do not make a real
model call until a paid test is explicitly approved.** No such call has been made.

The assistant accepts at most 5 requests/IP/minute and 30/process/hour, with one
active request and no automatic model retries. These counters reset on restart.
Structural SQL safety does not prove the model chose the correct interpretation
or business filters. Inspect the SQL and evaluate the chosen deployment before
trusting its answers. Unsupported SQL fails closed rather than being repaired
or retried automatically.

## Read-only REST API (M2)

| Method and path | Response |
| --- | --- |
| `GET /api/customers` | All customers, sorted by name and then ID |
| `GET /api/customers/:id` | Customer details, or 404 |
| `GET /api/customers/:id/orders` | Customer's orders with totals, newest first; 404 if the customer is missing |
| `GET /api/orders/:id` | Order details with customer information and total, or 404 |
| `GET /api/orders/:id/items` | Items with article information and historical prices, sorted by item ID; 404 if the order is missing |

See [API.md](docs/API.md) for complete seed-data examples, error responses, and
the SQL calculation rules. Monetary values and quantities are JSON strings;
amounts are SEK excluding VAT. Browsing includes orders of every status.

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/customers
Invoke-RestMethod http://127.0.0.1:3000/api/customers/1
Invoke-RestMethod http://127.0.0.1:3000/api/customers/1/orders
Invoke-RestMethod http://127.0.0.1:3000/api/orders/1
Invoke-RestMethod http://127.0.0.1:3000/api/orders/1/items
```

All five endpoints run `SELECT` queries. No write endpoints are registered.
Each resource router contains its route handlers and explicit SQL queries;
`validate-id.js` shares the small ID check. `app.js` registers the routers and
handles unexpected errors consistently. This keeps each HTTP operation and its
query together without a repository framework or service layer.

## Database initialization and persistence

On the first start with an empty named volume, PostgreSQL executes
`01-schema.sql`, then `02-seed.sql`. Each script runs in a transaction. The seed
assumes a fresh schema and fresh identity sequences; it is deliberately a
one-time fixture, not a repeatable upsert or a migration framework.

The named volume `floorflow_postgres_data` persists database changes. For
PostgreSQL 18, it is mounted at `/var/lib/postgresql`. Restarting containers does
**not** rerun initialization scripts or change existing database credentials.
If initialization fails, inspect `docker compose logs db`; restarting alone
does not finish failed initialization. See the reset procedure below.

Stop PostgreSQL while keeping the data:

```powershell
docker compose down
```

**Destructive reset:** stop Node first. The following removes this Compose
project's PostgreSQL volume and **permanently deletes all FloorFlow local
database data**, then recreates the schema and seed. Use only for disposable
development data, including after changing initialization scripts or credentials.
It is not needed for a normal restart. Never use this as a production migration.

```powershell
docker compose down --volumes
docker compose up -d --wait
npm run db:assistant:setup
```

## Schema and business rules

- `customers` has many `orders`; each order belongs to one customer.
- `orders` has many `order_items`; each item references one `articles` row.
  The item is the link between an order and an article and stores its quantity
  and historical price. Materials and labor use the same article table.
- Integer identity primary keys are generated by PostgreSQL. Order numbers and
  SKUs have unique constraints. Required columns are `NOT NULL`, descriptive
  text cannot be empty, and timestamps use `TIMESTAMPTZ` with a current-time default.
- All prices are **SEK excluding VAT**. Prices use `NUMERIC(12,2)` and quantities
  use `NUMERIC(12,3)`. Prices may be zero; quantities must be positive. Checks
  also reject PostgreSQL's special `NaN` numeric value. Units are `m²`, `pcs`,
  and `hours`; buckets and individual skirting lengths are counted as pieces.
- Status is constrained to `draft`, `pending`, `completed`, or `cancelled`.
  **Only completed orders count as sales.** No invoices, inventory, user accounts,
  or dedicated time reporting are implemented. Preview access uses a shared gate.
- `order_items.unit_price` is an independent snapshot. Future order creation must
  copy the agreed price into it. Totals use this price, never the current catalog
  price. Round each line's `quantity * unit_price` to two decimal places, then sum
  the lines. Totals are calculated rather than stored in redundant columns.
- Foreign keys prevent orphan rows. `ON DELETE RESTRICT` prevents accidentally
  deleting referenced history. Three foreign-key indexes support relationship
  lookups; primary and unique keys already have indexes. No extra status index
  is justified for this small dataset.
- Every seeded order has four items. A foreign key cannot require a parent to
  have children. Direct SQL can create an empty order; no triggers are added.
  The approved API is read-only, so order creation and enforcement of the
  **at least one item per order** rule are outside the current scope. An empty
  existing order is handled defensively with a total of `"0.00"` and no items.

## Verification

With the database running, use a second terminal:

```powershell
npm test
docker compose ps
docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -f /verification/verify.sql'
```

`npm test` uses Node's built-in test runner and the actual database configured
through environment variables or the optional `.env`.
The unchanged M1 tests check relationships, fixture counts, completed sales,
customer spending, oak quantities, invalid data, historical prices, and health.
M2 adds HTTP integration checks for every API endpoint, ID validation, missing
records, empty results, every order status, historical prices, rounding each
line before summing, and amounts larger than JavaScript can represent exactly.
M3 adds static page and asset checks, protection against serving internal files,
exact money and quantity formatting, UTC dates, page-ID validation, and browser
fetch-helper success/failure checks. These tests run with the same `npm test`
command and do not require a browser or a new testing framework.
M4 adds deterministic model/SDK transport tests and real restricted-PostgreSQL
integration checks. Set the AI database credentials and run the role setup before
the full suite. Azure credentials remain blank; the tests never make paid calls.

Success and fixture tests use PostgreSQL. Controlled failing databases verify
safe error responses. HTTP tests choose temporary ports automatically. Fixture
changes use one checked-out connection and an uncommitted transaction; the test
app receives that same connection. Changes are rolled back, no fixture rows are
inserted, and identity sequences are not advanced. Run against the unchanged
development seed, not production or a database being edited concurrently.

For a running server, PowerShell can also check:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/health
```

The SQL verification script is read-only. Expected fixture results:

| Check | Expected result |
| --- | --- |
| Row counts | 5 customers, 12 orders, 12 articles, 48 order items |
| Order statuses | 8 completed, 2 pending, 1 cancelled, 1 draft |
| Completed sales | 285,415.00 SEK |
| Highest-spending customer | Harbor Office Studio: 109,000.00 SEK |
| Maple Property Group spending | 101,536.50 SEK |
| Emma Carter spending | 22,007.50 SEK |
| Northside Cafe spending | 42,930.00 SEK |
| Daniel Brooks spending | 9,941.00 SEK |
| Engineered oak sold (`OAK-ENG-14`) | 118.500 m² |
| Orders without items | 0 |

M1 was verified locally on **2026-11-16** with Node.js 24.19.0 and PostgreSQL
18.7: Compose validation and fresh database initialization succeeded, all **24
tests passed** (none skipped), and the SQL results matched the table above. A
running server returned HTTP 200, then 503 while PostgreSQL was stopped, then
200 after recovery. Startup without PostgreSQL exited with code 1. Seed data
survived container recreation. `npm ci` reported zero known vulnerabilities;
JavaScript syntax checks and Git ignore checks also passed. Expected constraint
violations appear in PostgreSQL logs during the negative tests.

M2 verification on **2026-11-16**: all **63 tests passed**, including the unchanged
24 M1 tests, with none skipped. Existing schema, seed, Compose configuration,
dependencies, database pool, and server startup are preserved.
All five documented API examples matched responses from `npm start`. During an
actual database outage, the API returned a generic JSON 500 and `/health`
returned its existing 503 response; the API recovered to 200 after restart.

M3 automated verification on **2026-11-16**: all **99 tests passed**, none skipped,
including all 63 preserved M1/M2 tests. Manual browser verification used connected
Chrome at 1440 × 900, 768 × 1024, and 390 × 844 viewports. The customer-to-order
journey, return links, exact amounts, mobile cards, keyboard focus, invalid and
missing links, and database-outage/reload recovery were checked. Empty customer
lists, customers without orders, empty orders, and literal HTML-like customer
names were checked through a separate local app using an uncommitted PostgreSQL
transaction; all fixture changes were rolled back. These interactive browser
checks are not part of `npm test` and are not a cross-browser accessibility audit.

M4 verification on **2026-11-16**: **230 tests passed**, none failed or skipped,
including all unchanged 99 M1–M3 tests. New tests cover intercepted SDK requests,
model mocks, SQL policy attacks, real restricted-role queries and denied writes,
real statement/lock timeouts, output limits, and request budgets. The five example
business questions produced the expected seed results using mocked generation.
Interactive Chrome checks at desktop and mobile sizes verified the unconfigured
assistant form, explicit service-unavailable response, and restored controls.
**Real Azure calls and live successful chat rendering remain unverified.** No
resources were provisioned, no paid calls were made, and seed data is unchanged.

## Decisions to explain

- `pg.Pool` reuses connections. It is a driver, not an EF Core equivalent:
  queries are written in SQL, without an ORM or change tracker.
- `async`/`await` is similar to C#, but JavaScript uses promises. ES module
  `import`/`export` connects files; no service container is needed here.
- `createApp(database)` receives the pool directly. This small function separates
  HTTP setup from process startup and lets a test supply a failing database or a
  single transaction connection. Resource routers receive that same object.
- PostgreSQL `NUMERIC` is exact. `pg` returns these values as strings by default;
  JavaScript's `Number` is binary floating point, unlike C# `decimal`. Keep money
  calculations in PostgreSQL instead of silently converting to `Number`.
- Application inputs use SQL parameters (`$1`, `$2`) rather than interpolation.
  IDs are validated before queries, and SQL selects only the response fields.
  Express 5 forwards rejected async handlers to the final error middleware;
  clients receive a generic JSON 500, without raw database details.
- This Compose account is the image's initialization superuser for local
  development. The assistant uses its separate restricted M4 login. M6 must
  provision non-admin runtime credentials rather than deploying this superuser.

See the [official PostgreSQL image documentation](https://hub.docker.com/_/postgres)
for initialization and volume behavior, and the
[node-postgres connection documentation](https://node-postgres.com/features/connecting)
for `PG*` variables.

## M5 quality and preview configuration

Local startup commands above are unchanged. Leave preview credentials blank for
local development, or set both `PREVIEW_USERNAME` and `PREVIEW_PASSWORD` in the
ignored `.env` and restart to enable HTTP Basic authentication. The browser asks
for the credentials; every page, asset, API route, and `/health` is protected.
Credentials are never sent in frontend assets. Production requires both values,
a password of at least 16 characters, verified database TLS, and HTTPS access.

The process reads validated hosting settings in `runtime.js`; `preview-auth.js`
is a small built-in-crypto middleware before all routes. `shutdown.js` drains
HTTP and closes pools once, with a ten-second total deadline. The existing
application/database/server separation remains, with no new dependencies.

Run `npm test`, `npm audit`, and `docker compose config --quiet` locally. M5
verification on **2026-11-16**: **264 passed**, none failed or skipped, including
the original 230. The audit reports zero known vulnerabilities. M5 adds
tests for preview access, proxy spoofing, the parser's decimal-underflow edge,
redacted errors, environment-only startup and bounded shutdown. Browser smoke
checks cover all three pages at desktop and mobile sizes and the unavailable AI
state. Schema and seed data remain unchanged; no real Azure call was made.

See [READINESS.md](docs/READINESS.md) for review severity, configuration requirements,
HTTPS/proxy and shared-password limitations, database permissions, and actual
verification scope. See the [real Azure acceptance checklist](docs/AZURE_ACCEPTANCE.md)
for business interpretation tests that mocks cannot establish.

The source is prepared for M6 environment validation. Before deployment, configure
HTTPS-only ingress and its explicit proxy networks, non-admin database logins and
verified PostgreSQL TLS, protected health probes, secrets and provider budgets.
`NODE_ENV=production` defaults to `0.0.0.0`; `HOST` can override it. Startup accepts
host environment variables without `.env`. Actual Azure hosting and a real
deployed model remain unverified. No cloud resources or deployment pipeline exist here.

## M6A: GitHub Actions and deployment preparation

The existing `Perss00n/FloorFlow` repository remains private. The CI-only workflow
in `.github/workflows/ci.yml` runs on pushes to `main` and pull requests targeting
`main`. It installs Node 24 and locked dependencies, creates a fresh PostgreSQL
18 database using existing Compose/schema/seed files, configures the restricted
AI role, checks all JavaScript syntax, runs every test and `npm audit`, and removes
its isolated database/volume. Passwords are randomly generated and masked per
run; no GitHub secrets or `.env` file are needed. Azure variables are blank.

Equivalent checks with the existing local development configuration:

```powershell
docker compose up -d --wait db
npm ci
npm run db:assistant:setup
npm run check:syntax
npm test
npm audit
docker compose config --quiet
```

See [CI.md](docs/CI.md) for CI environment variables, isolated-run cleanup and
secret-review findings. On **2026-11-18**, workflow validation passed with
`actionlint`, all **39 JS files** passed syntax checks, and all **264 tests** passed
on Windows and in a fresh native-Linux replay without `.env`. The audit found
zero known vulnerabilities. The [GitHub-hosted PR run](https://github.com/Perss00n/FloorFlow/actions/runs/44292447465)
also passed all 264 tests, syntax checks, role setup, audit and cleanup on Ubuntu
24.04.5 with Node 24.22.2. Azure settings were blank and no paid model calls were
made. Application code, tests, schema and seed data are unchanged.

The recommended short-lived demo is Linux App Service **F1**, PostgreSQL Flexible
Server **18 / B1ms / 32 GiB**, and a small Azure Foundry pay-per-token model,
preferably with all resource locations in Sweden Central. Public retail estimates
are about **188 SEK/month** for database + F1; optional Linux App Service B1 adds
about **130 SEK/month**. Model calls, extras, tax and subscription/FX differences
are separate. The available approximately **2,000 SEK credits expire December 16,
2026**; capacity, price, credit eligibility and a removal date must be confirmed
before provisioning. See [DEPLOYMENT.md](docs/DEPLOYMENT.md) for cited rates,
F1 limitations, managed-role/TLS adjustments, protected health checks, and the
planned CI-gated OIDC deployment. M6B still requires approval and actual Azure
compatibility/model testing; nothing is deployed or provisioned in M6A.

## Milestones

1. **M1:** Project setup, PostgreSQL, schema, and seed data (complete).
2. **M2:** Read-only REST API and data access (complete).
3. **M3:** Static HTML/CSS/vanilla JavaScript frontend served by Node (complete).
4. **M4:** Azure Foundry assistant with controlled read-only SQL execution (complete locally; live Azure unverified).
5. **M5:** Broader automated tests, security review, and code quality (complete locally).
6. **M6A:** GitHub repository review, CI workflow, and deployment preparation (complete; hosted PR CI verified).
7. **M6B:** Approved Azure provisioning, OIDC deployment pipeline and real service verification (not started).

No Azure resources, paid services, deployment workflows, or publishing are part
of M6A. Implementation stops here until M6B is explicitly approved.
