import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { checkServerIdentity, rootCertificates } from 'node:tls';
import { parseBootstrapCredentials, bootstrapConfig, loadBootstrapSources, scramVerifier,
  runBootstrap, bootstrapErrorCode } from '../scripts/bootstrap-azure-db.js';

// Synthetic credentials and a fake Client only. No Azure connections or DPAPI access.
const credentials = Object.fromEntries(['admin', 'app', 'ai'].map((key, i) =>
  [key, { user: `floorflow_${key}`, password: Buffer.alloc(32, i + 1).toString('base64') }]));
const sources = loadBootstrapSources();
const result = (rows) => ({ rows });

function fakeDatabase(options = {}) {
  const calls = [];
  class Client {
    constructor(config) {
      this.config = config;
      this.connection = { stream: { encrypted: true, authorized: options.tls !== false,
        servername: config.host, getPeerCertificate: () => ({ subjectaltname: `DNS:${config.host}` }),
        getProtocol: () => 'TLSv1.3' } };
    }
    on() {}
    async connect() { calls.push({ connect: this.config }); }
    async end() { calls.push({ end: this.config.user }); }
    async query(sql, values) {
      calls.push({ sql, values, user: this.config.user, database: this.config.database });
      if (options.failOn && sql.includes(options.failOn)) {
        throw Object.assign(new Error(`secret ${credentials.app.password} SCRAM-SHA-256$hidden`), { code: '42501' });
      }
      if (sql.includes('pg_stat_ssl')) return result([{ ssl: true, version: 'TLSv1.3' }]);
      if (sql === sources.check) return result([{ current_user: 'floorflow_admin', suitable_admin: true,
        version: 180006, read_only: 'on', database_exists: false, owner_exists: false,
        app_exists: false, ai_exists: false, public_objects_exist: false, ...options.state }]);
      if (sql.includes('AS empty')) return result([{ empty: options.empty !== false }]);
      if (sql.includes('pg_catalog.pg_settings')) {
        const settings = values ? {
          default_transaction_read_only: 'on', search_path: this.config.user === 'floorflow_ai' ? 'pg_catalog' : 'public, pg_catalog',
          statement_timeout: this.config.user === 'floorflow_ai' ? '2000' : '3000', lock_timeout: '500',
          idle_in_transaction_session_timeout: '5000', transaction_timeout: '5000', work_mem: '4096', temp_file_limit: '8192',
          ...options.runtimeSettings,
        } : { temp_file_limit: '8192', log_min_error_statement: 'error', ...options.serverSettings };
        return result(Object.entries(settings).map(([name, setting]) => ({ name, setting, pending_restart: false,
          unit: ['temp_file_limit', 'work_mem'].includes(name) ? 'kB' : name.endsWith('_timeout') ? 'ms' : null })));
      }
      if (sql.includes('AS columns')) {
        const id = 'id:integer:true:a';
        const created = 'created_at:timestamp with time zone:true:';
        return result(Object.entries({
          articles: [id, 'sku:text:true:', 'name:text:true:', 'unit:text:true:', 'unit_price:numeric(12,2):true:', created],
          customers: [id, 'name:text:true:', 'email:text:true:', 'phone:text:true:', created],
          order_items: [id, 'order_id:integer:true:', 'article_id:integer:true:', 'quantity:numeric(12,3):true:', 'unit_price:numeric(12,2):true:'],
          orders: [id, 'customer_id:integer:true:', 'order_number:text:true:', 'status:text:true:', created],
        }).map(([name, columns]) => ({ name, kind: 'r', owner: options.badOwner ? 'someone_else' : 'floorflow_admin', columns })));
      }
      if (sql.includes('AS source')) return result([
        { source: 'order_items', target: 'articles', definition: 'FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE RESTRICT' },
        { source: 'order_items', target: 'orders', definition: 'FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT' },
        { source: 'orders', target: 'customers', definition: 'FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT' },
      ]);
      if (sql.includes('AS completed_sales_sek')) return result([{ customers: '5', orders: '12', articles: '12', order_items: '48',
        completed_orders: '8', completed_sales_sek: '285415.00', ...options.seed }]);
      if (sql.includes('AS safe')) return result([{ current_user: this.config.user, database: this.config.database,
        safe: !(options.unsafeRuntime && this.config.user !== 'floorflow_admin') }]);
      return result([]);
    }
  }
  return { Client, calls };
}
const sqlCalls = (db) => db.calls.filter((call) => call.sql);

test('Check accepts only the admin credential; other modes require three separate saved identities', () => {
  assert.deepEqual(parseBootstrapCredentials(JSON.stringify({ admin: credentials.admin }), 'check'), { admin: credentials.admin });
  assert.deepEqual(parseBootstrapCredentials(JSON.stringify(credentials), 'install'), credentials);
  for (const [input, mode] of [
    [credentials, 'check'], [{ admin: credentials.admin }, 'install'], [credentials, 'bootstrap'],
    [{ ...credentials, host: 'elsewhere' }, 'verify'],
    [{ ...credentials, app: { ...credentials.app, ssl: false } }, 'install'],
    [{ ...credentials, ai: { ...credentials.ai, password: credentials.app.password } }, 'install'],
    [{ ...credentials, app: { user: 'floorflow_admin', password: credentials.app.password } }, 'install'],
    [{ ...credentials, app: { ...credentials.app, password: "quote'and-unicode" } }, 'install'],
  ]) assert.throws(() => parseBootstrapCredentials(JSON.stringify(input), mode), { code: 'INPUT_INVALID' });
  for (const input of ['not-json-secret', 'x'.repeat(16385), 'null', '[]']) {
    assert.throws(() => parseBootstrapCredentials(input, 'check'), { code: 'INPUT_INVALID' });
  }
});

test('connections pin Azure identity and verified TLS; verification preserves runtime login defaults', () => {
  const config = bootstrapConfig({ ...credentials.admin, host: 'other', ssl: false, connectionString: 'ignored' }, 'postgres', 'check');
  assert.equal(config.host, 'pg-floorflow-demo-6e9587.postgres.database.azure.com');
  assert.equal(config.connectionString, undefined);
  assert.equal(config.ssl.rejectUnauthorized, true);
  assert.equal(config.ssl.ca, rootCertificates);
  assert.equal(config.ssl.checkServerIdentity, checkServerIdentity);
  assert.equal(config.ssl.minVersion, 'TLSv1.2');
  assert.match(config.options, /default_transaction_read_only=on/);
  assert.equal(bootstrapConfig(credentials.ai, 'floorflow', 'verify').options, '');
  assert.throws(() => bootstrapConfig(credentials.admin, 'other', 'install'), { code: 'INPUT_INVALID' });
  assert.throws(() => bootstrapConfig(credentials.ai, 'postgres', 'verify'), { code: 'INPUT_INVALID' });
});

test('unchanged schema and seed are reused with only their transaction envelopes removed', () => {
  for (const [key, file] of [['schema', '01-schema.sql'], ['seed', '02-seed.sql']]) {
    const original = readFileSync(new URL(`../db/init/${file}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    assert.equal(sources[key], original.replace(/^BEGIN;\s*|^COMMIT;\s*$/gm, ''));
    assert.doesNotMatch(sources[key], /^BEGIN;|^COMMIT;/m);
  }
  assert.doesNotMatch(sources.access, /floorflow_owner|GRANT .* TO floorflow_admin|ALTER SYSTEM|SET temp_file_limit/);
});

test('SCRAM verifiers use fresh salts and never include the saved plaintext', () => {
  const verifier = scramVerifier(credentials.app.password);
  assert.match(verifier, /^SCRAM-SHA-256\$4096:[A-Za-z0-9+/]{22}==\$[A-Za-z0-9+/]{43}=:[A-Za-z0-9+/]{43}=$/);
  assert.ok(!verifier.includes(credentials.app.password));
  assert.notEqual(verifier, scramVerifier(credentials.app.password));
});

test('Check performs only metadata reads in a read-only transaction and imports no runtime credentials', async () => {
  const db = fakeDatabase();
  const report = await runBootstrap({ admin: credentials.admin }, { ...db, mode: 'check' });
  assert.equal(report.success, true);
  assert.equal(report.changesAttempted, false);
  assert.equal(db.calls.filter((c) => c.connect).length, 1);
  assert.equal(db.calls.filter((c) => c.end).length, 1);
  const queries = sqlCalls(db).map((c) => c.sql);
  assert.ok(queries.includes('BEGIN READ ONLY'));
  assert.equal(queries.at(-1), 'ROLLBACK');
  assert.doesNotMatch(queries.join('\n'), /\b(CREATE|ALTER|GRANT|REVOKE|INSERT|UPDATE|DELETE|TRUNCATE|DROP)\b/);
});

for (const key of ['database_exists', 'owner_exists', 'app_exists', 'ai_exists', 'public_objects_exist']) {
  test(`existing ${key} stops Install before any mutation`, async () => {
    const db = fakeDatabase({ state: { [key]: true } });
    const report = await runBootstrap(credentials, { ...db, mode: 'install' });
    assert.equal(report.success, false);
    assert.equal(report.error.code, 'TARGET_NOT_EMPTY');
    assert.equal(report.changesAttempted, false);
    assert.ok(!sqlCalls(db).some((c) => c.sql.startsWith('CREATE')));
  });
}

for (const settings of [{ temp_file_limit: '-1' }, { log_min_error_statement: 'panic' }]) {
  test(`unexpected server settings ${JSON.stringify(settings)} stop before DDL without attempting repair`, async () => {
    const db = fakeDatabase({ serverSettings: settings });
    const report = await runBootstrap(credentials, { ...db, mode: 'install' });
    assert.equal(report.error.code, 'SERVER_SETTINGS_UNEXPECTED');
    assert.equal(report.changesAttempted, false);
    assert.ok(!sqlCalls(db).some((c) => /^(CREATE|ALTER|SET)/.test(c.sql)));
  });
}

test('unverified TLS stops before even the state query', async () => {
  const db = fakeDatabase({ tls: false });
  const report = await runBootstrap(credentials, { ...db, mode: 'install' });
  assert.equal(report.error.code, 'TLS_NOT_VERIFIED');
  assert.equal(sqlCalls(db).length, 0);
});

test('Install uses admin ownership, one initialization transaction, late saved-password DDL and separate runtime logins', async () => {
  const db = fakeDatabase();
  const report = await runBootstrap(credentials, { ...db, mode: 'install' });
  assert.equal(report.success, true, JSON.stringify(report));
  assert.equal(report.initializationCommitAcknowledged, true);
  assert.equal(report.runtime.length, 2);
  const queries = sqlCalls(db).map((c) => c.sql);
  const create = queries.indexOf("CREATE DATABASE floorflow OWNER floorflow_admin TEMPLATE template0 ENCODING 'UTF8'");
  assert.ok(create > queries.indexOf('ROLLBACK') && create < queries.indexOf('BEGIN'));
  assert.ok(queries.indexOf(sources.schema) < queries.indexOf(sources.seed));
  assert.ok(queries.indexOf(sources.seed) < queries.indexOf(sources.access));
  assert.ok(queries.findIndex((q) => q.includes('AS completed_sales_sek')) < queries.findIndex((q) => q.startsWith('ALTER ROLE')));
  assert.equal(queries.filter((q) => q.startsWith('ALTER ROLE')).length, 2);
  assert.equal(queries.filter((q) => q === 'COMMIT').length, 1);
  assert.deepEqual(db.calls.filter((c) => c.connect).map((c) => c.connect.user),
    ['floorflow_admin', 'floorflow_admin', 'floorflow_app', 'floorflow_ai']);
  assert.doesNotMatch(queries.join('\n'), /CREATE ROLE floorflow_owner|GRANT floorflow_owner|SET ROLE|^ALTER SYSTEM|DROP DATABASE|DROP ROLE/m);
  for (const { password } of Object.values(credentials)) assert.ok(!queries.join('\n').includes(password));
  assert.ok(!JSON.stringify(report).includes('SCRAM-SHA-256'));
});

for (const [options, code] of [
  [{ empty: false }, 'TARGET_NOT_EMPTY'], [{ badOwner: true }, 'SCHEMA_MISMATCH'],
  [{ seed: { completed_orders: '7' } }, 'SEED_MISMATCH'], [{ seed: { completed_sales_sek: '0.00' } }, 'SEED_MISMATCH'],
  [{ failOn: 'CREATE TABLE' }, '42501'],
]) {
  test(`initialization failure ${JSON.stringify(options)} rolls back and sends no password DDL`, async () => {
    const db = fakeDatabase(options);
    const report = await runBootstrap(credentials, { ...db, mode: 'install' });
    assert.equal(report.success, false);
    assert.equal(report.error.code, code);
    assert.equal(report.rollbackCommandAcknowledged, true);
    assert.equal(report.databaseCreationAcknowledged, true);
    assert.ok(!sqlCalls(db).some((c) => c.sql.startsWith('ALTER ROLE')));
    assert.ok(!sqlCalls(db).some((c) => c.sql === 'COMMIT'));
  });
}

test('password DDL failure reports only its code, preserves partial state and never retries or drops', async () => {
  const db = fakeDatabase({ failOn: 'ALTER ROLE floorflow_app LOGIN' });
  const report = await runBootstrap(credentials, { ...db, mode: 'install' });
  assert.equal(report.error.code, '42501');
  assert.equal(report.stage, 'attach_saved_passwords');
  assert.equal(report.changesAttempted, true);
  assert.equal(report.rollbackCommandAcknowledged, true);
  assert.equal(sqlCalls(db).filter((c) => c.sql.startsWith('ALTER ROLE')).length, 1);
  assert.doesNotMatch(JSON.stringify(report), /secret|SCRAM-SHA-256/);
  assert.doesNotMatch(sqlCalls(db).map((c) => c.sql).join('\n'), /DROP (ROLE|DATABASE)/);
});

test('unacknowledged CREATE DATABASE leaves the outcome uncertain and does not retry', async () => {
  const db = fakeDatabase({ failOn: 'CREATE DATABASE' });
  const report = await runBootstrap(credentials, { ...db, mode: 'install' });
  assert.equal(report.success, false);
  assert.equal(report.stage, 'create_database');
  assert.equal(report.changesAttempted, true);
  assert.equal(report.databaseCreationAcknowledged, undefined);
  assert.equal(sqlCalls(db).filter((c) => c.sql.startsWith('CREATE DATABASE')).length, 1);
  assert.equal(db.calls.filter((c) => c.connect).length, 1);
});

test('unacknowledged COMMIT is never reported as a successful install despite acknowledged rollback', async () => {
  const db = fakeDatabase({ failOn: 'COMMIT' });
  const report = await runBootstrap(credentials, { ...db, mode: 'install' });
  assert.equal(report.success, false);
  assert.equal(report.stage, 'commit');
  assert.equal(report.changesAttempted, true);
  assert.equal(report.initializationCommitAcknowledged, undefined);
  assert.equal(report.rollbackCommandAcknowledged, true);
  assert.equal(sqlCalls(db).filter((c) => c.sql === 'COMMIT').length, 1);
  assert.equal(db.calls.filter((c) => c.connect).length, 2);
});

test('failed runtime verification after COMMIT retains initialized state for review without cleanup', async () => {
  const db = fakeDatabase({ unsafeRuntime: true });
  const report = await runBootstrap(credentials, { ...db, mode: 'install' });
  assert.equal(report.success, false);
  assert.equal(report.initializationCommitAcknowledged, true);
  assert.equal(report.stage, 'verify_floorflow_app');
  assert.equal(report.error.code, 'PERMISSIONS_UNSAFE');
  assert.doesNotMatch(sqlCalls(db).map((c) => c.sql).join('\n'), /DROP (ROLE|DATABASE)/);
});

test('Verify uses only read-only transactions and effective ACLs, with fresh connections for both runtime users', async () => {
  const db = fakeDatabase();
  const report = await runBootstrap(credentials, { ...db, mode: 'verify' });
  assert.equal(report.success, true);
  assert.equal(report.changesAttempted, false);
  assert.equal(report.runtime.length, 2);
  assert.equal(sqlCalls(db).filter((c) => c.sql === 'BEGIN READ ONLY').length, 3);
  assert.ok(!sqlCalls(db).some((c) => /^(CREATE|ALTER|GRANT|REVOKE|INSERT|UPDATE|DELETE|TRUNCATE|DROP)\b/.test(c.sql)));
});

for (const [options, code] of [
  [{ unsafeRuntime: true }, 'PERMISSIONS_UNSAFE'], [{ runtimeSettings: { temp_file_limit: '-1' } }, 'LIMIT_MISMATCH'],
  [{ runtimeSettings: { statement_timeout: '0' } }, 'LIMIT_MISMATCH'],
]) {
  test(`Verify rejects unsafe runtime state ${JSON.stringify(options)}`, async () => {
    const db = fakeDatabase(options);
    const report = await runBootstrap(credentials, { ...db, mode: 'verify' });
    assert.equal(report.success, false);
    assert.equal(report.error.code, code);
  });
}

test('wrapper offers no credential generation, logging restoration or implicit default action', () => {
  const wrapper = readFileSync(new URL('../scripts/bootstrap-azure-db.ps1', import.meta.url), 'utf8');
  assert.match(wrapper, /Mandatory = \$true.*ValidateSet\('Check', 'Install', 'Verify'\)/);
  assert.doesNotMatch(wrapper, /Export-Clixml|NewCredentials|RandomNumberGenerator|az postgres|Restore-FloorFlow/);
  assert.match(wrapper, /if \(\$Mode -ne 'Check'\)/);
  assert.match(wrapper, /RedirectStandardInput = \$true/);
  assert.match(wrapper, /NODE_TLS_REJECT_UNAUTHORIZED/);
  assert.equal(bootstrapErrorCode({ code: '0LP01', message: 'secret' }), '0LP01');
  assert.equal(bootstrapErrorCode(new Error('secret')), 'BOOTSTRAP_FAILED');
});
