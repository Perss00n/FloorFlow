# Manual Azure PostgreSQL inspection (M6B Stage 5A)

**Prepared only; not executed against Azure.** You run this procedure yourself in
an authorized local Windows PowerShell session, as the Windows user who saved
the administrator credential. No administrator elevation or new software is needed.
If execution policy blocks a script, stop; do not use `-ExecutionPolicy Bypass`,
change policy, or retry through another execution mechanism.

| Step | Effect |
| --- | --- |
| Check local tools and discover your public IPv4 | Local reads; one HTTPS request to ipify, not Azure |
| Add/remove the named rule in Azure Portal | **Manual network configuration changes**, not read-only |
| Run the inspection wrapper | Decrypts the existing credential in memory; authenticated **read-only SQL** |
| Review the JSON report | Local output; optional sanitized file outside Git |

The database inspection creates no objects, changes no server/role settings and
reads no customer/order/article rows. Temporary session settings and a read-only
transaction are used. Firewall cleanup is manual, including after every error.
The scripts contain **no Azure API or firewall commands** and make no AI requests.

## 1. Check the local files and tools (read-only)

Open a normal, trusted PowerShell window on the original Windows machine/user.
Use a session without debugging, tracing, transcription or recording that could
capture credentials. Keep the encrypted credential file private; do not copy it
into the repository, open its contents for sharing, or print a decrypted value.

```powershell
Set-Location -LiteralPath 'C:\Users\Perss\source\repos\FloorFlow'
node --version
node --check .\scripts\inspect-azure-db.js
node --test .\test\azure-inspection.test.js
```

Expect Node **24.x**, a successful syntax check and six passing **offline** tests.
These commands do not connect to a database. If Node or `pg` is missing, stop;
do not install tools or dependencies as part of this procedure.

The reviewed files are:

- `scripts/inspect-azure-db.ps1`: reads only the existing DPAPI credential file
  under `%LOCALAPPDATA%\FloorFlow\Azure\pg-floorflow-demo-6e9587-admin.credential.xml`.
  It passes username/password through the child process's anonymous stdin pipe,
  never as arguments, environment variables or a plaintext file. Only sanitized
  stdout is displayed; raw client errors and input are not printed.
- `scripts/inspect-azure-db.js`: imports the project's `pg` package normally.
  It pins the approved host, port 5432 and administrator identity. Input accepts
  only `user` and `password`; it cannot override the target, TLS or SQL.

The old temporary `inspect.mjs` is superseded; do not use that draft. The wrapper
does not load `.env` and removes inherited `PG*` and Node preload/TLS overrides
from the child only. Your normal development settings are not modified.
Passwords necessarily exist briefly in process memory; nulling references does
not promise immediate memory erasure. The existing DPAPI file remains encrypted
on disk and requires its original Windows user/machine.

## 2. Determine your current public IPv4 (read-only)

Run this yourself; the address is for the temporary firewall rule, not for the report:

```powershell
$taskPublicIPv4 = (Invoke-RestMethod -Uri 'https://api.ipify.org?format=json' -TimeoutSec 15).ip
$taskAddress = $null
if (-not [Net.IPAddress]::TryParse($taskPublicIPv4, [ref]$taskAddress) -or
    $taskAddress.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork -or
    $taskPublicIPv4 -match '^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)') {
    throw 'A public IPv4 address could not be confirmed. Stop before adding a rule.'
}
$taskPublicIPv4
```

A proxy/VPN can route HTTPS and PostgreSQL differently. Confirm this is the
Windows machine's **TCP 5432 egress** before allowing it. If uncertain, stop and
check your trusted network configuration; do not add more addresses or ranges.
Keep the network/VPN stable during inspection.

## 3. Add one temporary rule manually (network change)

In your existing authenticated Azure Portal session:

1. Confirm the intended active subscription, then open resource group
   **`rg-floorflow-demo`** and server **`pg-floorflow-demo-6e9587`**.
2. Confirm the server is Ready, PostgreSQL **18**, Sweden Central.
3. Open **Networking / Firewall rules**. Confirm the original **13 exact
   App Service IP rules** match [DEPLOYMENT.md](DEPLOYMENT.md). Preserve them.
4. Add exactly one new rule named **`stage5-inspection-temporary`**. If that name
   already exists, stop rather than assuming it belongs to this inspection.
5. Set **both start and end IP** to the IPv4 from step 2. Save. Do not select
   “Allow public access from any Azure service,” use `0.0.0.0`, or add a range.
6. Refresh and verify **14 total rules**, with the new rule containing that one
   exact IP and the original 13 unchanged. Allow up to five minutes for propagation.

Do not change TLS, compute, storage, server parameters or any other resource.
Record the temporary rule name locally so you can remove precisely that rule.

## 4. Run the read-only inspection

Run only after the temporary rule is verified:

```powershell
.\scripts\inspect-azure-db.ps1
```

The wrapper uses the previously saved `floorflow_admin` credential; it never asks
you to type or paste the password. Do not run a standalone command that prints
`GetNetworkCredential().Password`. Do not run the JavaScript with a credential
JSON literal in the command line.

For an optional copy of **sanitized stdout only**, use this instead:

```powershell
.\scripts\inspect-azure-db.ps1 | Tee-Object -FilePath (Join-Path $env:TEMP 'floorflow-stage5a-inspection.json')
```

The optional report is outside Git. Do not redirect all streams or share a
PowerShell transcript, credential file, raw client stderr or unsanitized errors.

The client opens `postgres` and, **only if it already exists and is connectable**,
`floorflow`. It does not create the database or connect to provider-owned or other
unexpected databases. PostgreSQL catalog queries inspect:

- Databases, ownership, connection eligibility and the administrator's role flags.
- Role memberships with ADMIN / INHERIT / SET options and selected stored settings.
- Non-system schema ownership, administrator USAGE/CREATE and relation names/kinds.
- Active TLS and selected PostgreSQL parameters, including their source/context.

No password catalog, role password hash, application row or object definition is
selected. Unknown database/role/schema/object names receive stable `other_*_N`
aliases; their private originals are not included. Expected FloorFlow and common
system names remain readable. Each metadata list is capped at 200 rows; a nonempty
`truncated` list means inspection is incomplete, not that further objects are absent.
The relation inventory does not enumerate functions or other non-relation objects.

## 5. Recognize successful TLS and interpret the report

For **each** inspected database, require:

- `clientTls.encrypted`, `certificateChainAuthorized`, `hostnameVerified`: **true**.
- `clientTls.protocol`: TLSv1.2 or TLSv1.3; `serverTls.ssl`: **true**.
- `identity.current_user`: `floorflow_admin`; PostgreSQL version **18.x**.
- `identity.transaction_read_only`: **on**, `stage`: **complete**, `truncated`: **[]**.

This is verified TLS equivalent to `sslmode=verify-full`: the client requires a
trusted chain using **Node's bundled public root CAs**, `rejectUnauthorized=true`,
minimum TLS 1.2 and Node's standard hostname check for the pinned FQDN. It also
rechecks the peer hostname after connection. The `pg_stat_ssl` row confirms server
encryption separately; that row alone would **not** prove client verification.
No downloaded certificate or disabled verification is used.

Inspection overrides apply **only to its sessions**: read-only default,
`search_path=pg_catalog`, statement timeout **5s**, lock timeout **1s**, idle
transaction timeout **10s**. They do not establish server defaults or AI-role
limits. Parameter `source` and `roleSettings` help distinguish stored settings
from these overrides. A missing/restricted parameter is not evidence of zero.

`success: true` means metadata collection completed, **not** that bootstrap is
safe or runtime permissions have passed. `reviewRequired` always remains true.
Existing/unexpected objects and skipped databases require review. No schema/seed
comparison, data totals, DDL permission probe or runtime-login acceptance is run.

## 6. Handle errors safely

On **any** error, perform step 7 before troubleshooting or sharing results.
The script makes no automatic connection retries or permission changes.

| Sanitized code / symptom | Safe response |
| --- | --- |
| PowerShell wrapper cannot start or import credentials | Check the same Windows user/machine, local paths, Node 24 and existing dependencies. Do not display credentials, reset a password or relax execution policy. |
| `ENOTFOUND`, `EAI_AGAIN`, connection timeout / `INSPECTION_FAILED` while connecting | Check DNS, Ready status, the exact IP/port and propagation. A successful TCP test alone does not prove TLS or authentication. Do not broaden the firewall. |
| Certificate / `ERR_TLS_CERT_ALTNAME_INVALID` / `TLS_NOT_VERIFIED` | Stop. Check the pinned FQDN, clock, trusted CA chain and possible TLS interception. Never use `rejectUnauthorized=false`, `sslmode=require`, `NODE_TLS_REJECT_UNAUTHORIZED=0` or a certificate-bypass callback. |
| `28P01`, `28000` | Authentication failed. Verify the saved credential's provenance privately; do not paste it, automatically reset it or change server authentication. |
| `42501`, `3D000`, `53300`, `57014` | Permission, database, connection-slot or timeout issue. Share only the sanitized report; do not grant privileges, change limits or create a database to make inspection pass. |

If raw errors appear unexpectedly, do not share them. Record only that the wrapper
failed and its sanitized JSON if available. Missing results are **unverified**.

## 7. Remove the temporary rule manually (network change)

Always do this after success **or failure**; the scripts do not clean up Azure:

1. Reopen this server's **Networking / Firewall rules**.
2. Remove **only `stage5-inspection-temporary`**, confirming its exact IP/name.
   Do not delete the server, resource group or any original rule. Save.
3. Refresh until the rule is absent and the **original 13 rules and their exact
   addresses** match the pre-inspection configuration. Count alone is insufficient.
4. If cleanup cannot be confirmed, report it immediately; do not call inspection
   complete or leave the temporary access unreported.

Then send the sanitized JSON and confirm the temporary rule was removed and the
original 13 preserved. Stop here. Wait for review before designing or executing
the managed-provider bootstrap.

## Reviewed source files; intentionally not executed

`scripts/setup-assistant-db.js` modifies roles/grants/passwords and sets per-role
`temp_file_limit`, requiring superuser or delegated parameter-SET privilege. It is **not** this inspection
procedure and must not run unchanged on Azure. `db/init/01-schema.sql` creates the
four tables, constraints and indexes; `02-seed.sql` inserts deterministic data
once. `db/verify.sql` assumes those tables exist and reads business values. None
is run here. Designing Azure bootstrap awaits the actual inspection results.

References: [Azure public networking and propagation](https://learn.microsoft.com/en-us/azure/postgresql/network/concepts-networking-public),
[Node TLS verification](https://nodejs.org/api/tls.html),
[Windows DPAPI credential import](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/import-clixml).

Preparation verification on **2026-11-18**: **6/6 offline tests passed**;
`npm run check:syntax` checked **41 JavaScript files**; the PowerShell AST parser
reported no syntax errors. All **nine catalog SELECTs** parsed offline using the
existing SQL parser; this is not PostgreSQL execution or live compatibility proof.
The PowerShell wrapper and inspection procedure were **not executed**. No Azure
session was contacted, credential imported, TLS handshake performed or SQL run
while preparing these files. `git diff --check` passed; nothing was committed/pushed.
