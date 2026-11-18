# GitHub Actions CI (M6A)

The existing repository is private: `Perss00n/FloorFlow`, default branch `main`.
M6A adds [.github/workflows/ci.yml](../.github/workflows/ci.yml) locally. It has
not been pushed, so **no GitHub-hosted run of this workflow has been verified**.

## Workflow

Pushes to `main` and pull requests targeting `main` run one Ubuntu 24.04 job:

1. Check out source and install Node.js 24 using official GitHub actions pinned
   to full commit SHAs. The job has only `contents: read` permission and checkout
   does not retain Git credentials.
2. Generate two different random, run-only database passwords. GitHub masks them
   and supplies them to later steps through `GITHUB_ENV`. No repository secrets
   or physical `.env` file are required.
3. Run `npm ci` using the existing lockfile.
4. Validate the existing Compose file with `--env-file /dev/null config --quiet`
   (never print resolved configuration/passwords), then start PostgreSQL 18.
   Each run/attempt has a unique Compose project and fresh volume, so the existing
   `db/init` scripts initialize the schema and deterministic seed automatically.
5. Run the existing local restricted-role setup, all JavaScript syntax checks,
   the complete test suite, and `npm audit`. Every required failure fails the job.
6. An `always()` cleanup removes this CI project's container, network and volume.
   A forcibly cancelled runner is also ephemeral. The job has a 15-minute limit.

Azure configuration is explicitly blank. Model tests use mocks or intercepted
SDK transport. No Azure login, deployment, production credentials, paid model
request, or administrative operation on a hosted database is part of CI.

## CI environment

| Variables | CI values/purpose |
| --- | --- |
| `COMPOSE_PROJECT_NAME` | `floorflow-ci-<run_id>-<attempt>`; isolate resources |
| `PGHOST`, `PGPORT` | `127.0.0.1`, `55435`; Node runs on the runner, DB in Docker |
| `PGDATABASE`, `PGUSER` | `floorflow_ci` for this disposable database |
| `PGPASSWORD` | Fresh random initialization-admin password |
| `AI_PGUSER`, `AI_PGPASSWORD` | `floorflow_ai`, a different fresh random password |
| `NODE_ENV`, `PGSSLMODE`, `HOST` | `test`, `disable`, `127.0.0.1`; local CI Docker does not use TLS |
| `PREVIEW_USERNAME`, `PREVIEW_PASSWORD`, `TRUST_PROXY` | Blank; auth tests pass their own controlled configuration |
| `AZURE_FOUNDRY_ENDPOINT`, `AZURE_FOUNDRY_MODEL`, `AZURE_FOUNDRY_API_KEY` | Blank; never put real model credentials in CI |

`PGSSLMODE=disable` is specific to isolated CI. Production still requires
`verify-full`, preview credentials and HTTPS.

## Equivalent local checks

With the existing ignored `.env` and development database, use PowerShell:

```powershell
docker compose up -d --wait db
npm ci
npm run db:assistant:setup
npm run check:syntax
npm test
npm audit
docker compose config --quiet
```

These commands keep the development database volume. For a fresh CI-style run,
use a disposable checkout without `.env`, copy the workflow's environment settings,
generate both passwords, and use a unique `COMPOSE_PROJECT_NAME` and free port.
On Ubuntu the database steps are exactly:

```bash
docker compose --env-file /dev/null config --quiet
docker compose --env-file /dev/null up -d --wait --wait-timeout 90 db
npm run db:assistant:setup
npm run check:syntax
npm test
npm audit
docker compose --env-file /dev/null down --volumes --remove-orphans
```

Run `npm ci` first. The final command **deletes the selected project's database
volume**; use it only for the isolated CI project, never for the development
`floorflow` project unless you intend to erase that data. Arrange cleanup even
when a check fails, as the workflow does. Ensure no actual Azure configuration is
present. Do not run the integration suite against a deployed database: some tests
require the local initialization administrator and make rollback-only changes.

## Verification on 2026-11-18

- `actionlint` 1.7.12 passed workflow validation. The downloaded tool's checksum
  matched its official release manifest; no tooling dependency was added to npm.
- Windows/Node 24.19.0: all **264 tests passed**, none failed or skipped.
- Fresh local Linux replay using official Node 24.22.3 and PostgreSQL 18:
  `npm ci`, fresh schema/seed initialization, restricted-role setup, syntax checks,
  **264 tests**, and `npm audit` passed without any `.env`. All 39 JavaScript files
  passed syntax checks. The audit reported zero known vulnerabilities.
- The replay used a separate Compose project, random test-only passwords and a
  fresh volume. Its container/network/volume were removed; development data stayed.
  Node ran in a Debian container on its native Linux filesystem, connecting to
  the DB service over Docker networking; this is not a GitHub Ubuntu runner.
- A preceding Windows bind-mounted Linux replay hit the startup test's existing
  three-second readiness window. The native Linux replay passed without changing
  application code, tests or timeouts. Avoid Windows-mounted dependency trees for
  this comparison. The first host attempt also required starting the local DB.
- Official action execution, workflow triggers, runner image behavior and GitHub
  token policy still require the first approved push and actual hosted run.

## Secret review

Gitleaks 8.30.1 found no leaks in the three pre-M6A commits or tracked files.
An additional exact-value check found none of the configured local secret values
in the 79 pre-M6A reachable Git blobs. A working-directory scan identified only the two
credentials in the ignored, untracked `.env`; values were not printed.
`.env.example` remains tracked and contains placeholders/empty Azure settings.

Common key/config files, modules, logs, backups, temporary files and archives are
ignored. Git attributes retain LF line endings. Pattern scanning is not a proof
that every possible secret format is detected: review staged changes before any
publication. Never solve a committed-secret incident by merely adding `.gitignore`;
stop publication, rotate the secret, and arrange a reviewed history repair.
