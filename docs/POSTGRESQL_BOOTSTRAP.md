# Azure PostgreSQL: simple manual installation

Prepared **2026-11-19**, for review only. **No Azure connection, credential
decryption, bootstrap, parameter/firewall change, deployment or inference was
performed during this preparation.** Current database state remains unverified.
This guide supersedes the previous Stage 5B owner-role/logging-window procedure.

The reported current server settings are `temp_file_limit=8192 kB` and
`log_min_error_statement=error`, Azure source `user-override`. Retain both.
`user-override` is acceptable: do not reset the parameter to change its source.
The scripts check effective SQL values; SQL configuration sources need not use
the same names as Azure's control-plane `source` property.

## Windows PowerShell operator guide

**These are instructions for a later, authorized operator session. Stop after
preparation now. Check results must be reviewed before Install is authorized.**

1. **Review the working copy and prerequisites.** Use Windows PowerShell 5.1+
   under the same Windows user/machine that saved the DPAPI credentials, Node 24
   and the existing project dependencies. Preserve the intentionally uncommitted
   files; do not reset/clean the checkout. Do not enable transcript, command
   tracing or SQL/protocol debugging while handling credentials.

   ```powershell
   Set-Location C:\Users\Perss\source\repos\FloorFlow
   git status --short
   node --version
   ```

   Existing files under `$env:LOCALAPPDATA\FloorFlow\Azure` are:
   `pg-floorflow-demo-6e9587-admin.credential.xml`,
   `pg-floorflow-demo-6e9587-app.credential.xml` and
   `pg-floorflow-demo-6e9587-ai.credential.xml`. The wrapper checks private ACLs
   and identities, imports only the required files, and passes credentials to
   Node through stdin. It never creates, replaces or exports credentials. A
   missing/unusable file is a stop condition, not a reason to generate passwords.

2. **Confirm authorized narrow network access.** Target only
   `pg-floorflow-demo-6e9587.postgres.database.azure.com:5432` in
   `rg-floorflow-demo`. The scripts contain no Azure management commands. If the
   operator needs a temporary firewall exception, obtain separate authorization
   first, record the existing exact rules, and permit only the operator's current
   single IPv4 address. Never enable a broad range or “allow Azure services”.
   Preserve the original 13 application-IP rules listed in
   [DEPLOYMENT.md](DEPLOYMENT.md#database-and-network-verification). If access is
   unavailable, stop. Plan removal of only the temporary rule after success or
   failure; record its actual name and exact address before adding it.

3. **Run only the new read-only state check and return its report for review.**

   ```powershell
   & .\scripts\bootstrap-azure-db.ps1 -Mode Check
   ```

   Check imports **only admin**, connects only to `postgres`, and executes
   [db/azure/check.sql](../db/azure/check.sql) inside `BEGIN READ ONLY`, followed
   by `ROLLBACK`. It returns no business rows or password hashes. Required:
   `success=true`, `changesAttempted=false`, `current_user=floorflow_admin`,
   PostgreSQL 18, suitable non-superuser CREATEDB/CREATEROLE admin, read-only on,
   verified client TLS plus server `pg_stat_ssl`, and the two settings above.
   **All five existence flags must be false**: database, old owner, app, AI and
   unexpected `public` objects in the maintenance database. Existing application
   database/roles stop the check, even if empty or left by a failed attempt.
   Do not delete them. Remove any temporary access and submit the sanitized JSON.
   A previous rollback acknowledgement is not a substitute for this check.

4. **Only after review and explicit installation authorization, run Install once.**
   Recheck if there was any intervening activity; use one operator at a time.
   If temporary access was removed after Check, re-establish only separately
   authorized exact-IP access and plan its removal again.

   ```powershell
   & .\scripts\bootstrap-azure-db.ps1 -Mode Install
   ```

   Install repeats the read-only check immediately before DDL. It creates
   `floorflow` owned by `floorflow_admin` using `template0`. In **one subsequent
   transaction**, it refuses unexpected target objects, makes admin the `public`
   schema owner, runs the unchanged schema/seed, and applies
   [db/azure/access.sql](../db/azure/access.sql). The two runtime roles are first
   created NOLOGIN. It validates tables/seed before attaching SCRAM verifiers of
   the **existing saved passwords** and enabling LOGIN. Commit is followed by
   verification through new, separate app and AI connections. No role-membership
   GRANT, owner role, schema/seed rewrite or automatic recovery is involved.

   PostgreSQL cannot put `CREATE DATABASE` in a transaction. If initialization
   fails, the database may remain while role/schema/seed work rolls back. A
   disconnected or failed COMMIT can have an unknown outcome. Stop and retain
   state for review; **never rerun Install, DROP objects or replace credentials
   automatically**. The fresh database uses PostgreSQL's default database ACL
   until the initialization transaction commits its PUBLIC revocation; run in
   this trusted, narrowly accessible demo server with no concurrent operators.

5. **After successful Install, obtain an independent read-only verification.**

   ```powershell
   & .\scripts\bootstrap-azure-db.ps1 -Mode Verify
   ```

   Verify uses `BEGIN READ ONLY`/`ROLLBACK` and SELECTs, including actual reads
   through each runtime login. It makes no write/DDL denial probes and no model
   calls. `success=true` requires:

   | Evidence | Required result |
   | --- | --- |
   | Tables, column names/types/nullability/identity, ownership | Exactly `customers`, `orders`, `articles`, `order_items`; admin owns database/schema/tables; no `floorflow_owner` |
   | Keys and indexes | 4 primary keys, 2 unique keys, 3 correct foreign keys, 11 check constraints, 9 valid/ready indexes |
   | Rows | 5 customers, 12 orders, 12 articles, 48 order items |
   | Completed orders and historical line-price sales | 8; `285415.00` SEK excluding VAT, ROUND each line before SUM |
   | App and AI | Separate successful logins and SELECTs on all four tables |
   | Effective runtime permissions | CONNECT, public USAGE, four-table SELECT; no table/column writes, grant options, sequences, schema/database CREATE, TEMP, ownership, memberships, elevated role attributes or temp-limit SET/ALTER SYSTEM rights |
   | TLS | Trusted certificate chain, hostname verification, TLS >= 1.2 and `pg_stat_ssl.ssl=true` in every connection |
   | Temp-file limit | Effective `8192`, unit `kB`, in both fresh runtime sessions |
   | Login defaults | App/AI connection limits 10/3; read-only on; app search path `public, pg_catalog`, AI `pg_catalog`; statement timeouts 3s/2s; lock 500ms, idle transaction 5s, transaction 5s, work memory 4 MiB |

   Read-only/time/memory defaults are user-changeable PostgreSQL settings, not
   hard security boundaries. Effective ACLs deny writes independently of the
   read-only default; the runtime users cannot raise the server temp-file limit.
   Normal PostgreSQL catalog access and built-in functions still exist. No
   custom executable routines are installed by these scripts.

6. **Remove temporary access and return sanitized evidence.** The wrapper prints
   one JSON report and saves a uniquely named `bootstrap-<mode>-<id>.json` in the
   existing private Azure directory. On error, retain stage, safe error code,
   state/settings, `changesAttempted`, `databaseCreationAcknowledged`,
   `initializationCommitAcknowledged` and `rollbackCommandAcknowledged` when
   present. These flags describe acknowledgements, not an all-or-nothing install.
   Missing/unclean output means outcome unknown. Never share raw errors,
   passwords, verifiers or protocol traces. After either success or failure,
   remove only the separately approved temporary firewall rule and confirm the
   exact original 13 rules remain. Leave logging at `error`/`user-override` and
   the temp limit unchanged. Return reports and cleanup confirmation, then stop;
   this does not authorize App Service deployment or paid AI calls.

## Earlier failures and what changed

The first reported attempt stopped at session-level logging SET: an Azure
non-superuser could not change that restricted parameter. The next attempt
failed in `create_roles` with SQLSTATE `0LP01` and acknowledged ROLLBACK, before
database creation or password DDL in the old sequence. Neither report proves
current persistent state; Check has not yet been run against Azure.

PostgreSQL 18 automatically grants a newly created role back to its non-superuser
creator with ADMIN true, SET false and INHERIT false, granted by the bootstrap
superuser. The creator can manage the role without being able to assume it. The
old `GRANT floorflow_owner TO floorflow_admin WITH ADMIN TRUE, INHERIT FALSE,
SET TRUE` unnecessarily requested another ADMIN grant to the creator itself.
PostgreSQL rejects circular ADMIN-grant dependencies with `0LP01`
(`invalid_grant_operation`); its role-management source explicitly implements
that check. This is the **likely explanation**, consistent with the reported
stage/code, not a confirmed reconstruction of the unavailable Azure error text.
It is not evidence that the comma-separated GRANT syntax is invalid.
[PG18 role attributes](https://www.postgresql.org/docs/18/role-attributes.html),
[GRANT and grantor dependencies](https://www.postgresql.org/docs/18/sql-grant.html),
[error codes](https://www.postgresql.org/docs/18/errcodes-appendix.html),
[PG18 role-management source](https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/commands/user.c).

There is no demonstrated need for another owner in this temporary demo: admin
creates/owns the database and objects. PG's automatic membership grants remain
**to admin**, never from app/AI to admin. Runtime independence is checked using
outgoing memberships (`pg_auth_members.member`), so the creator's administrative
grant is not mistaken for runtime privilege escalation. Azure's documented
`public` ownership is handled with a direct `ALTER SCHEMA ... OWNER TO
floorflow_admin`; provider permission to do so still needs live confirmation.
[Azure access control](https://learn.microsoft.com/en-us/azure/postgresql/security/security-access-control).

Removed: separate owner and SET ROLE machinery, multiple committed role/access
phases, initially disabled database connections, password generation mode,
temporary `panic` logging requirement, server logging capture/restore procedures,
repeated logging-window guards and mutation probes during Verify. Retained:
fixed target, private DPAPI files/stdin transport, verified TLS, unchanged
schema/seed with hashes, minimum runtime ACLs, limits, fail-stop reporting and
explicit review before handling partial state.

## Password-verifier logging risk

`log_min_error_statement=error` can include a failed password DDL statement,
including its SCRAM verifier, in server logs. Rollback does not erase log entries;
local error sanitization and TLS do not protect server-side logs. Statement,
duration, audit or provider diagnostics may also record SQL. Bind-parameter
logging limits do not redact an SQL literal. PostgreSQL accepts a precomputed
SCRAM verifier unchanged, so these scripts never send plaintext passwords in
DDL. This reduces exposure but does **not** make the verifier public information.
[PostgreSQL logging](https://www.postgresql.org/docs/18/runtime-config-logging.html),
[CREATE ROLE password handling](https://www.postgresql.org/docs/18/sql-createrole.html).

Proportionate mitigation for this short-lived demo: reuse the already generated
32-byte random runtime passwords, send only their fresh salted SCRAM verifiers,
validate non-secret work before the two password statements, avoid repeated
attempts, and keep database logs/support bundles accessible only to trusted
administrators. Never paste raw DDL/logs into chat or issue trackers. Review any
enabled log export/audit access before running; if unexpectedly broad, stop for
review without changing server logging. High-entropy passwords resist offline
guessing, but verifier exposure remains a residual credential risk. If a verifier
is disclosed outside trusted administration, stop and arrange separately approved
credential rotation and log-access handling; this installer does not rotate or
overwrite the saved credentials. No temporary server-wide logging changes are
recommended. The reported failures occurred before the old password phase;
actual Azure logs have not been inspected here.

## Preparation evidence and remaining uncertainties

Local validation on **2026-11-19**: **298/298 tests passed** (264 original,
6 unchanged inspection tests, 28 simplified-installation regressions), zero
failures/skips. New installation flow tests use a fake Client and synthetic
credentials. Separately, **12 focused read-only SELECTs** from the new scripts
executed against existing local PostgreSQL **18.7** in a rollback-only transaction:
metadata/function SQL compiled, column/foreign-key expectations matched and seed
counts/completed sales matched. SQL permission checks compiled against local
accounts; Azure identities/ownership/defaults were not simulated by this readback.
This caught and corrected an ambiguous catalog
`"char"` concatenation using an explicit text cast. The full suite used only the
loopback database; real-model settings were blanked. No bootstrap DDL was run.
JavaScript syntax checks passed for 43 files, PowerShell AST parsing passed and
tracked/new-file whitespace checks passed. Schema, seed, original verification
SQL, application code, dependencies and the original 264 tests are unchanged.

Azure-specific unknowns: current database/role absence after rollback; Azure
CREATE DATABASE/ROLE and schema-owner permissions; template contents; inherited
ACL/default behavior; actual app/AI authentication and SQL limits; certificate
chain/firewall reachability from the operator; logging/export access; and current
control-plane settings/rule cleanup. SQL syntax/local seed results, fake-client
tests and documentation review do not establish these live facts. Do not run
the full development suite against Azure; it includes privileged local fixtures.
