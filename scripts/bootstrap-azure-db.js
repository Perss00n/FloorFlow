// Manual operator only. Importing this module performs no I/O or connections.
import pg from 'pg';
import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { inspectionConfig, inspectionHost, verifyTls, safeErrorCode } from './inspect-azure-db.js';

const tables = ['articles', 'customers', 'order_items', 'orders'];
const sourceFiles = {
  schema: ['../db/init/01-schema.sql', '5c73d2452b8efc75b067266eace07ac521d037452659c9987c6c241bc69b5a4d'],
  seed: ['../db/init/02-seed.sql', '76353f07cf15dde4f0496423c8813c90bbba262554ee00c9b449bac3f15caa5c'],
};
const errors = new Set(['INPUT_INVALID', 'SOURCE_CHANGED', 'TARGET_NOT_EMPTY', 'ADMIN_UNSUITABLE',
  'SERVER_SETTINGS_UNEXPECTED', 'SCHEMA_MISMATCH', 'SEED_MISMATCH', 'PERMISSIONS_UNSAFE', 'LIMIT_MISMATCH']);
function fail(code) { throw Object.assign(new Error(code), { code }); }
export function bootstrapErrorCode(error) {
  return errors.has(error?.code) ? error.code : safeErrorCode(error) === 'INSPECTION_FAILED'
    ? 'BOOTSTRAP_FAILED' : safeErrorCode(error);
}

export function parseBootstrapCredentials(input, mode) {
  if (!['check', 'install', 'verify'].includes(mode) || Buffer.byteLength(input, 'utf8') > 16384) fail('INPUT_INVALID');
  let value;
  try { value = JSON.parse(input); } catch { fail('INPUT_INVALID'); }
  const keys = mode === 'check' ? ['admin'] : ['admin', 'ai', 'app'];
  if (!value || Array.isArray(value) || Object.keys(value).sort().join() !== keys.join()) fail('INPUT_INVALID');
  for (const key of keys) {
    const item = value[key];
    if (!item || Object.keys(item).sort().join() !== 'password,user' || item.user !== `floorflow_${key}`
      || typeof item.password !== 'string' || !item.password || item.password.length > 4096
      // The existing runtime credentials were generated as 32-byte base64 passwords.
      // Restricting to ASCII also avoids SCRAM SASLprep ambiguity.
      || (key !== 'admin' && !/^[A-Za-z0-9+/]{43}=$/.test(item.password))) fail('INPUT_INVALID');
  }
  if (new Set(keys.map((key) => value[key].password)).size !== keys.length) fail('INPUT_INVALID');
  return value;
}

export function loadBootstrapSources() {
  const sources = {};
  for (const [key, [path, hash]] of Object.entries(sourceFiles)) {
    const sql = readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    if (createHash('sha256').update(sql).digest('hex') !== hash) fail('SOURCE_CHANGED');
    // Keep both files unchanged on disk; remove only their outer transaction lines
    // so schema, seed, runtime roles and grants share one transaction.
    sources[key] = sql.replace(/^BEGIN;\s*|^COMMIT;\s*$/gm, '');
  }
  sources.check = readFileSync(new URL('../db/azure/check.sql', import.meta.url), 'utf8');
  sources.access = readFileSync(new URL('../db/azure/access.sql', import.meta.url), 'utf8');
  return sources;
}

export function bootstrapConfig(credential, database, mode) {
  if (!['floorflow_admin', 'floorflow_app', 'floorflow_ai'].includes(credential.user)
    || !['postgres', 'floorflow'].includes(database) || !['check', 'install', 'verify'].includes(mode)
    || (database === 'postgres' && credential.user !== 'floorflow_admin')) fail('INPUT_INVALID');
  const config = inspectionConfig(credential, database);
  config.application_name = 'floorflow-manual-bootstrap';
  config.query_timeout = 20000;
  // Fresh runtime connections must observe their actual saved defaults.
  config.options = credential.user === 'floorflow_admin'
    ? `-c search_path=pg_catalog -c statement_timeout=10000 -c lock_timeout=2000
       -c idle_in_transaction_session_timeout=15000${mode === 'install' ? '' : ' -c default_transaction_read_only=on'}`
    : '';
  return config;
}

// Send only SCRAM verifiers in password DDL. Neither verifiers nor passwords may be logged locally.
export function scramVerifier(password, salt = randomBytes(16)) {
  const salted = pbkdf2Sync(password, salt, 4096, 32, 'sha256');
  const clientKey = createHmac('sha256', salted).update('Client Key').digest();
  const storedKey = createHash('sha256').update(clientKey).digest('base64');
  const serverKey = createHmac('sha256', salted).update('Server Key').digest('base64');
  return `SCRAM-SHA-256$4096:${salt.toString('base64')}$${storedKey}:${serverKey}`;
}

async function serverSettings(client) {
  const { rows } = await client.query(`SELECT name, setting, unit, pending_restart FROM pg_catalog.pg_settings
    WHERE name IN ('temp_file_limit', 'log_min_error_statement') ORDER BY name`);
  if (rows.length !== 2 || rows.some((r) => r.pending_restart)
    || !rows.some((r) => r.name === 'temp_file_limit' && r.setting === '8192' && r.unit === 'kB')
    || !rows.some((r) => r.name === 'log_min_error_statement' && r.setting === 'error')) fail('SERVER_SETTINGS_UNEXPECTED');
  return rows;
}

async function checkFreshTarget(client, sources, report) {
  await client.query('BEGIN READ ONLY');
  try {
    const { rows: [state] } = await client.query(sources.check);
    report.state = state;
    if (state?.current_user !== 'floorflow_admin' || state.suitable_admin !== true || state.read_only !== 'on'
      || state.version < 180000 || state.version >= 190000) fail('ADMIN_UNSUITABLE');
    if (['database_exists', 'owner_exists', 'app_exists', 'ai_exists', 'public_objects_exist']
      .some((key) => state[key] !== false)) fail('TARGET_NOT_EMPTY');
    report.serverSettings = await serverSettings(client);
  } finally { await client.query('ROLLBACK'); }
}

async function verifyData(client, report) {
  const relations = await client.query(`SELECT c.relname AS name, c.relkind AS kind,
    pg_get_userbyid(c.relowner) AS owner,
    ARRAY(SELECT a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull || ':' || a.attidentity::text
      FROM pg_catalog.pg_attribute a WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
      ORDER BY a.attnum) AS columns
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind <> 'i' AND c.relkind <> 'S' ORDER BY c.relname`);
  const id = 'id:integer:true:a';
  const created = 'created_at:timestamp with time zone:true:';
  const expected = {
    articles: [id, 'sku:text:true:', 'name:text:true:', 'unit:text:true:', 'unit_price:numeric(12,2):true:', created],
    customers: [id, 'name:text:true:', 'email:text:true:', 'phone:text:true:', created],
    order_items: [id, 'order_id:integer:true:', 'article_id:integer:true:', 'quantity:numeric(12,3):true:', 'unit_price:numeric(12,2):true:'],
    orders: [id, 'customer_id:integer:true:', 'order_number:text:true:', 'status:text:true:', created],
  };
  if (relations.rows.length !== 4 || relations.rows.some((r) => r.kind !== 'r' || r.owner !== 'floorflow_admin'
    || JSON.stringify(r.columns) !== JSON.stringify(expected[r.name]))) fail('SCHEMA_MISMATCH');
  const { rows: [ownership] } = await client.query(`SELECT
    (SELECT pg_get_userbyid(datdba) = 'floorflow_admin' FROM pg_catalog.pg_database WHERE datname = 'floorflow')
    AND (SELECT pg_get_userbyid(nspowner) = 'floorflow_admin' FROM pg_catalog.pg_namespace WHERE nspname = 'public')
    AND NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'floorflow_owner') AS safe`);
  if (ownership?.safe !== true) fail('SCHEMA_MISMATCH');
  const foreignKeys = await client.query(`SELECT conrelid::regclass::text AS source,
    confrelid::regclass::text AS target, pg_get_constraintdef(oid) AS definition
    FROM pg_catalog.pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace ORDER BY source, target`);
  const expectedForeignKeys = [
    ['order_items', 'articles', 'FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE RESTRICT'],
    ['order_items', 'orders', 'FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT'],
    ['orders', 'customers', 'FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT'],
  ];
  if (JSON.stringify(foreignKeys.rows.map((r) => [r.source, r.target, r.definition])) !== JSON.stringify(expectedForeignKeys)) fail('SCHEMA_MISMATCH');
  const { rows: [keys] } = await client.query(`SELECT
    (SELECT count(*) = 4 FROM pg_catalog.pg_constraint WHERE connamespace = 'public'::regnamespace AND contype = 'p')
    AND (SELECT count(*) = 2 FROM pg_catalog.pg_constraint WHERE connamespace = 'public'::regnamespace AND contype = 'u')
    AND (SELECT count(*) = 11 FROM pg_catalog.pg_constraint WHERE connamespace = 'public'::regnamespace AND contype = 'c')
    AND (SELECT count(*) = 9 AND bool_and(i.indisvalid AND i.indisready)
      FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid = i.indexrelid
      WHERE c.relnamespace = 'public'::regnamespace)
    AND (SELECT count(*) = 4 AND bool_and(pg_get_userbyid(relowner) = 'floorflow_admin')
      FROM pg_catalog.pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'S')
    AND NOT EXISTS (SELECT FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_')
    AND NOT EXISTS (SELECT FROM pg_catalog.pg_namespace WHERE nspname <> 'public'
      AND nspname <> 'information_schema' AND nspname !~ '^pg_')
    AND NOT EXISTS (SELECT FROM pg_catalog.pg_extension WHERE extname <> 'plpgsql') AS safe`);
  if (keys?.safe !== true) fail('SCHEMA_MISMATCH');
  const { rows: [seed] } = await client.query(`SELECT
    (SELECT count(*)::text FROM public.customers) AS customers,
    (SELECT count(*)::text FROM public.orders) AS orders,
    (SELECT count(*)::text FROM public.articles) AS articles,
    (SELECT count(*)::text FROM public.order_items) AS order_items,
    (SELECT count(*)::text FROM public.orders WHERE status = 'completed') AS completed_orders,
    (SELECT sum(round(oi.quantity * oi.unit_price, 2))::text FROM public.orders o
      JOIN public.order_items oi ON oi.order_id = o.id WHERE o.status = 'completed') AS completed_sales_sek`);
  const expectedSeed = { customers: '5', orders: '12', articles: '12', order_items: '48',
    completed_orders: '8', completed_sales_sek: '285415.00' };
  if (Object.entries(expectedSeed).some(([key, value]) => seed?.[key] !== value)) fail('SEED_MISMATCH');
  report.tables = tables;
  report.adminOwnershipVerified = true;
  report.schema = { tables: 4, primaryKeys: 4, uniqueKeys: 2, foreignKeys: 3, checkConstraints: 11, indexes: 9 };
  report.seed = seed;
}

async function verifyRuntime(client, name, report) {
  await client.query('BEGIN READ ONLY');
  try {
    const { rows: [identity] } = await client.query(`SELECT current_user, current_database() AS database,
      r.rolcanlogin AND NOT (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls OR r.rolinherit)
      AND r.rolconnlimit = $1 AND NOT EXISTS (SELECT FROM pg_catalog.pg_auth_members WHERE member = r.oid)
      AND has_database_privilege(current_user, current_database(), 'CONNECT')
      AND NOT has_database_privilege(current_user, current_database(), 'CREATE,TEMPORARY,CONNECT WITH GRANT OPTION')
      AND has_schema_privilege(current_user, 'public', 'USAGE')
      AND NOT has_schema_privilege(current_user, 'public', 'USAGE WITH GRANT OPTION')
      AND NOT EXISTS (SELECT FROM pg_catalog.pg_namespace WHERE has_schema_privilege(current_user, oid, 'CREATE'))
      AND NOT has_parameter_privilege(current_user, 'temp_file_limit', 'SET,ALTER SYSTEM')
      AND NOT EXISTS (SELECT FROM pg_catalog.pg_database WHERE datdba = r.oid)
      AND NOT EXISTS (SELECT FROM pg_catalog.pg_namespace WHERE nspowner = r.oid)
      AND NOT EXISTS (SELECT FROM pg_catalog.pg_class WHERE relowner = r.oid) AS safe
      FROM pg_catalog.pg_roles r WHERE rolname = current_user`, [name === 'floorflow_ai' ? 3 : 10]);
    if (identity?.current_user !== name || identity.database !== 'floorflow' || identity.safe !== true) fail('PERMISSIONS_UNSAFE');
    const acl = await client.query(`SELECT count(*) = 4 AND bool_and(
      has_table_privilege(current_user, c.oid, 'SELECT')
      AND NOT has_table_privilege(current_user, c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN,SELECT WITH GRANT OPTION')
      AND NOT has_any_column_privilege(current_user, c.oid, 'INSERT,UPDATE,REFERENCES')) AS safe
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY($1::text[])`, [tables]);
    const sequences = await client.query(`SELECT NOT EXISTS (SELECT FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'S'
      AND has_sequence_privilege(current_user, c.oid, 'USAGE,SELECT,UPDATE')) AS safe`);
    if (acl.rows[0]?.safe !== true || sequences.rows[0]?.safe !== true) fail('PERMISSIONS_UNSAFE');
    const parameters = await client.query(`SELECT name, setting, unit, pending_restart FROM pg_catalog.pg_settings
      WHERE name = ANY($1::text[]) ORDER BY name`, [[
      'default_transaction_read_only', 'search_path', 'statement_timeout', 'lock_timeout',
      'idle_in_transaction_session_timeout', 'transaction_timeout', 'work_mem', 'temp_file_limit',
    ]]);
    const expected = { default_transaction_read_only: 'on', search_path: name === 'floorflow_ai' ? 'pg_catalog' : 'public, pg_catalog',
      statement_timeout: name === 'floorflow_ai' ? '2000' : '3000', lock_timeout: '500',
      idle_in_transaction_session_timeout: '5000', transaction_timeout: '5000', work_mem: '4096', temp_file_limit: '8192' };
    const values = Object.fromEntries(parameters.rows.map((r) => [r.name, r.setting]));
    if (Object.entries(expected).some(([key, value]) => values[key] !== value)
      || parameters.rows.some((r) => r.pending_restart
        || (['temp_file_limit', 'work_mem'].includes(r.name) && r.unit !== 'kB')
        || (r.name.endsWith('_timeout') && r.unit !== 'ms'))) fail('LIMIT_MISMATCH');
    // Actual SELECTs through each independent login, in addition to effective ACL checks.
    for (const table of tables) await client.query(`SELECT id FROM public.${table} LIMIT 1`);
    report.runtime.push({ role: name, selectOnFourTables: true, effectiveReadOnlyPrivileges: true,
      noMembershipsOrAdministrativePrivileges: true, connectionLimit: name === 'floorflow_ai' ? 3 : 10, parameters: parameters.rows });
  } finally { await client.query('ROLLBACK'); }
}

export async function runBootstrap(credentials, { mode, Client = pg.Client, sources = loadBootstrapSources() } = {}) {
  const report = { success: false, mode, host: inspectionHost, database: 'floorflow',
    stage: 'check', changesAttempted: false, sessions: [], runtime: [] };
  async function session(credential, database, callback) {
    const client = new Client(bootstrapConfig(credential, database, mode));
    let connectionError;
    client.on('error', (error) => { connectionError = error; });
    try {
      await client.connect();
      const tls = verifyTls(client.connection.stream);
      const { rows: [serverTls] } = await client.query('SELECT ssl, version FROM pg_catalog.pg_stat_ssl WHERE pid = pg_backend_pid()');
      if (serverTls?.ssl !== true) fail('TLS_NOT_VERIFIED');
      report.sessions.push({ role: credential.user, database, clientTls: tls, serverTls });
      await callback(client);
      if (connectionError) throw connectionError;
    } finally { await client.end(); }
  }
  try {
    if (!['check', 'install', 'verify'].includes(mode)) fail('INPUT_INVALID');
    if (mode !== 'verify') await session(credentials.admin, 'postgres', async (client) => {
      await checkFreshTarget(client, sources, report);
      if (mode === 'install') {
        report.stage = 'create_database';
        report.changesAttempted = true; // Also true when an interrupted command's outcome is unknown.
        await client.query("CREATE DATABASE floorflow OWNER floorflow_admin TEMPLATE template0 ENCODING 'UTF8'");
        report.databaseCreationAcknowledged = true;
      }
    });
    if (mode !== 'check') {
      await session(credentials.admin, 'floorflow', async (client) => {
        report.stage = mode === 'install' ? 'initialize' : 'verify_data';
        await client.query(mode === 'install' ? 'BEGIN' : 'BEGIN READ ONLY');
        try {
          report.serverSettings = await serverSettings(client);
          await client.query('SET LOCAL search_path = public, pg_catalog');
          if (mode === 'install') {
            const { rows: [target] } = await client.query(`SELECT
              (SELECT pg_get_userbyid(nspowner) IN ('azure_pg_admin', 'pg_database_owner', 'floorflow_admin')
                FROM pg_catalog.pg_namespace WHERE nspname = 'public')
              AND NOT EXISTS (SELECT FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_')
              AND NOT EXISTS (SELECT FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_')
              AND NOT EXISTS (SELECT FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
                WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_')
              AND NOT EXISTS (SELECT FROM pg_catalog.pg_namespace WHERE nspname <> 'public'
                AND nspname <> 'information_schema' AND nspname !~ '^pg_')
              AND NOT EXISTS (SELECT FROM pg_catalog.pg_extension WHERE extname <> 'plpgsql') AS empty`);
            if (target?.empty !== true) fail('TARGET_NOT_EMPTY');
            await client.query('ALTER SCHEMA public OWNER TO floorflow_admin');
            await client.query(sources.schema);
            await client.query(sources.seed);
            await client.query(sources.access);
          }
          await verifyData(client, report);
          if (mode === 'install') {
            // Password DDL is last, after schema/seed/grants validation. No retries.
            report.stage = 'attach_saved_passwords';
            for (const key of ['app', 'ai']) {
              const verifier = scramVerifier(credentials[key].password);
              await client.query(`ALTER ROLE floorflow_${key} LOGIN PASSWORD '${verifier}'`);
            }
            report.stage = 'commit';
            await client.query('COMMIT');
            report.initializationCommitAcknowledged = true;
          } else await client.query('ROLLBACK');
        } catch (error) {
          report.rollbackCommandAcknowledged = false;
          try { await client.query('ROLLBACK'); report.rollbackCommandAcknowledged = true; } catch { /* outcome unknown */ }
          throw error;
        }
      });
      for (const key of ['app', 'ai']) {
        report.stage = `verify_floorflow_${key}`;
        await session(credentials[key], 'floorflow', (client) => verifyRuntime(client, `floorflow_${key}`, report));
      }
    }
    report.stage = 'complete';
    report.success = true;
  } catch (error) { report.error = { code: bootstrapErrorCode(error) }; }
  return report;
}

async function main() {
  let report;
  try {
    const mode = process.argv[2];
    if (process.argv.length !== 3 || !['check', 'install', 'verify'].includes(mode)) fail('INPUT_INVALID');
    const sources = loadBootstrapSources();
    let input = '';
    process.stdin.setEncoding('utf8');
    for await (const chunk of process.stdin) {
      input += chunk;
      if (Buffer.byteLength(input, 'utf8') > 16384) fail('INPUT_INVALID');
    }
    const credentials = parseBootstrapCredentials(input, mode);
    input = '';
    report = await runBootstrap(credentials, { mode, sources });
  } catch (error) {
    report = { success: false, stage: 'local_input', changesAttempted: false, error: { code: bootstrapErrorCode(error) } };
  }
  console.log(JSON.stringify(report));
  if (!report.success) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
