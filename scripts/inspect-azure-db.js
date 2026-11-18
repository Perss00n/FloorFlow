import pg from 'pg';
import { checkServerIdentity, rootCertificates } from 'node:tls';
import { pathToFileURL } from 'node:url';

export const inspectionHost = 'pg-floorflow-demo-6e9587.postgres.database.azure.com';
const rowLimit = 200;
const parameterNames = [
  'temp_file_limit', 'ssl', 'ssl_min_protocol_version', 'max_connections',
  'default_transaction_read_only', 'transaction_read_only', 'search_path',
  'statement_timeout', 'lock_timeout', 'transaction_timeout',
  'idle_in_transaction_session_timeout', 'work_mem', 'password_encryption',
  'createrole_self_grant', 'log_statement', 'log_min_error_statement',
  'log_parameter_max_length', 'log_parameter_max_length_on_error',
  'pgaudit.log', 'pgaudit.log_parameter',
];

function fail(code) {
  throw Object.assign(new Error(code), { code });
}

export function parseCredentials(input) {
  if (Buffer.byteLength(input, 'utf8') > 8192) fail('INPUT_INVALID');
  let value;
  try { value = JSON.parse(input); } catch { fail('INPUT_INVALID'); }
  if (!value || Array.isArray(value) || Object.keys(value).length !== 2
    || value.user !== 'floorflow_admin' || typeof value.password !== 'string'
    || value.password.length === 0 || value.password.length > 4096) fail('INPUT_INVALID');
  return { user: value.user, password: value.password };
}

export function inspectionConfig(credentials, database) {
  if (!['postgres', 'floorflow'].includes(database)) fail('INPUT_INVALID');
  return {
    host: inspectionHost, port: 5432, database,
    user: credentials.user, password: credentials.password,
    ssl: {
      ca: rootCertificates, rejectUnauthorized: true, minVersion: 'TLSv1.2',
      servername: inspectionHost, checkServerIdentity,
    },
    sslnegotiation: 'postgres', client_encoding: 'UTF8',
    application_name: 'floorflow-manual-inspection',
    connectionTimeoutMillis: 15000, query_timeout: 7000,
    // Inspection-session overrides, not persistent role or server changes.
    options: '-c default_transaction_read_only=on -c search_path=pg_catalog'
      + ' -c statement_timeout=5000 -c lock_timeout=1000'
      + ' -c idle_in_transaction_session_timeout=10000',
  };
}

export function verifyTls(socket) {
  if (socket.encrypted !== true || socket.authorized !== true
    || socket.servername !== inspectionHost
    || checkServerIdentity(inspectionHost, socket.getPeerCertificate())) fail('TLS_NOT_VERIFIED');
  return { encrypted: true, certificateChainAuthorized: true, hostnameVerified: true, protocol: socket.getProtocol() };
}

export function safeErrorCode(error) {
  const code = error?.code;
  const allowed = new Set([
    'INPUT_INVALID', 'TLS_NOT_VERIFIED', 'UNSUPPORTED_SERVER', 'INSPECTION_FAILED',
    'ERR_TLS_CERT_ALTNAME_INVALID', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'CERT_HAS_EXPIRED',
    'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN',
    'ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH',
  ]);
  return typeof code === 'string' && (/^[0-9A-Z]{5}$/.test(code) || allowed.has(code))
    ? code : 'INSPECTION_FAILED';
}

export function sanitizeReport(report) {
  const known = {
    role: new Set(['(all)', 'postgres', 'floorflow_admin', 'floorflow_owner', 'floorflow_app',
      'floorflow_ai', 'azure_pg_admin', 'azuresu', 'azure_superuser', 'azure_replication_admin']),
    database: new Set(['(all)', 'postgres', 'floorflow', 'template0', 'template1', 'azure_sys', 'azure_maintenance']),
    schema: new Set(['public']),
    object: new Set(['customers', 'orders', 'order_items', 'articles']),
  };
  const aliases = Object.fromEntries(Object.keys(known).map((type) => [type, new Map()]));
  function name(type, value) {
    if (value === null || known[type].has(value) || (type === 'role' && /^pg_[a-z_]+$/.test(value))) return value;
    if (!aliases[type].has(value)) aliases[type].set(value, `other_${type}_${aliases[type].size + 1}`);
    return aliases[type].get(value);
  }
  // Only metadata is collected. Unknown object/account names get stable aliases.
  return JSON.parse(JSON.stringify(report, function (key, value) {
    if (['role', 'owner', 'current_user', 'granted_role', 'member', 'grantor'].includes(key)) return name('role', value);
    if (['database', 'schema', 'object'].includes(key)) return name(key, value);
    if (key === 'setting' && this.name === 'search_path'
      && !value.split(',').every((part) => ['pg_catalog', 'public', '"$user"'].includes(part.trim()))) return '[custom search path redacted]';
    return value;
  }));
}

async function inspectDatabase(credentials, database, report, cluster) {
  const client = new pg.Client(inspectionConfig(credentials, database));
  let connectionError;
  client.on('error', (error) => { connectionError = error; });
  const details = { database, stage: 'connecting', truncated: [] };
  report.sessions.push(details);
  async function read(name, sql, values = []) {
    details.stage = name;
    const result = await client.query(sql, values);
    if (result.rows.length > rowLimit) details.truncated.push(name);
    return result.rows.slice(0, rowLimit);
  }
  try {
    await client.connect();
    // pg's underlying TLSSocket supplies client-side verification evidence.
    details.clientTls = verifyTls(client.connection.stream);
    await client.query('BEGIN READ ONLY');
    [details.identity] = await read('identity', `
      SELECT current_user, current_setting('server_version') AS version,
             current_setting('server_version_num')::integer AS version_number,
             current_setting('transaction_read_only') AS transaction_read_only
    `);
    if (details.identity.current_user !== 'floorflow_admin'
      || details.identity.version_number < 180000 || details.identity.version_number >= 190000
      || details.identity.transaction_read_only !== 'on') fail('UNSUPPORTED_SERVER');
    [details.serverTls] = await read('server_tls', `
      SELECT ssl, version, cipher, bits FROM pg_catalog.pg_stat_ssl WHERE pid = pg_backend_pid()
    `);
    if (details.serverTls?.ssl !== true) fail('TLS_NOT_VERIFIED');
    if (cluster) {
      report.databases = await read('databases', `
        SELECT datname AS database, pg_get_userbyid(datdba) AS owner,
               datistemplate AS is_template, datallowconn AS allows_connections,
               has_database_privilege(current_user, oid, 'CONNECT') AS admin_can_connect
        FROM pg_catalog.pg_database ORDER BY datname LIMIT 201
      `);
      report.roles = await read('roles', `
        SELECT rolname AS role, rolsuper AS superuser, rolcreatedb AS create_database,
               rolcreaterole AS create_role, rolcanlogin AS login, rolinherit AS inherit,
               rolreplication AS replication, rolbypassrls AS bypass_rls, rolconnlimit AS connection_limit
        FROM pg_catalog.pg_roles ORDER BY rolname LIMIT 201
      `);
      report.memberships = await read('memberships', `
        SELECT p.rolname AS granted_role, c.rolname AS member, g.rolname AS grantor,
               m.admin_option, m.inherit_option, m.set_option
        FROM pg_catalog.pg_auth_members m
        JOIN pg_catalog.pg_roles p ON p.oid = m.roleid
        JOIN pg_catalog.pg_roles c ON c.oid = m.member
        JOIN pg_catalog.pg_roles g ON g.oid = m.grantor
        ORDER BY p.rolname, c.rolname, g.rolname LIMIT 201
      `);
      report.roleSettings = await read('role_settings', `
        SELECT COALESCE(r.rolname, '(all)') AS role, COALESCE(d.datname, '(all)') AS database,
               split_part(s.item, '=', 1) AS name,
               substr(s.item, strpos(s.item, '=') + 1) AS setting
        FROM pg_catalog.pg_db_role_setting dr
        LEFT JOIN pg_catalog.pg_roles r ON r.oid = dr.setrole
        LEFT JOIN pg_catalog.pg_database d ON d.oid = dr.setdatabase
        CROSS JOIN LATERAL unnest(dr.setconfig) AS s(item)
        WHERE split_part(s.item, '=', 1) = ANY($1::text[])
        ORDER BY role, database, name LIMIT 201
      `, [parameterNames]);
    }
    details.schemas = await read('schemas', `
      SELECT nspname AS schema, pg_get_userbyid(nspowner) AS owner,
             has_schema_privilege(current_user, oid, 'USAGE') AS admin_usage,
             has_schema_privilege(current_user, oid, 'CREATE') AS admin_create
      FROM pg_catalog.pg_namespace
      WHERE nspname <> 'information_schema' AND nspname !~ '^pg_'
      ORDER BY nspname LIMIT 201
    `);
    details.objects = await read('objects', `
      SELECT n.nspname AS schema, c.relname AS object, c.relkind AS kind,
             pg_get_userbyid(c.relowner) AS owner
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_'
      ORDER BY n.nspname, c.relname LIMIT 201
    `);
    details.parameters = await read('parameters', `
      SELECT name, setting, unit, context, source, pending_restart
      FROM pg_catalog.pg_settings WHERE name = ANY($1::text[]) ORDER BY name
    `, [parameterNames]);
    await client.query('ROLLBACK');
    if (connectionError) throw connectionError;
    details.stage = 'complete';
  } finally {
    await client.end();
  }
}

async function main() {
  const report = { success: false, reviewRequired: true, sessions: [] };
  try {
    if (process.argv.length !== 2) fail('INPUT_INVALID');
    let input = '';
    process.stdin.setEncoding('utf8');
    for await (const chunk of process.stdin) {
      input += chunk;
      if (Buffer.byteLength(input, 'utf8') > 8192) fail('INPUT_INVALID');
    }
    const credentials = parseCredentials(input);
    await inspectDatabase(credentials, 'postgres', report, true);
    const application = report.databases.find((database) => database.database === 'floorflow');
    if (application?.allows_connections && application.admin_can_connect) {
      await inspectDatabase(credentials, 'floorflow', report, false);
    }
    report.applicationDatabase = application ? 'exists; review metadata before bootstrap' : 'not listed';
    report.uninspectedDatabases = report.databases.filter((database) => !database.is_template
      && !report.sessions.some((session) => session.database === database.database)).map((database) => ({ database: database.database }));
    report.success = true;
  } catch (error) {
    report.error = { code: safeErrorCode(error) };
    process.exitCode = 1;
  }
  console.log(JSON.stringify(sanitizeReport(report)));
}

// Importing the pure helpers for offline tests never opens a connection.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
