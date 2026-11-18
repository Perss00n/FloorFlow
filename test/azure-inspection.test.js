import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkServerIdentity, rootCertificates } from 'node:tls';
import {
  inspectionHost, parseCredentials, inspectionConfig, verifyTls, safeErrorCode, sanitizeReport,
} from '../scripts/inspect-azure-db.js';

// Pure offline checks only: no Client.connect(), SQL execution or real credentials.
const credentials = { user: 'floorflow_admin', password: 'test-only-not-a-real-password' };

test('inspection accepts only the expected credential fields and identity', () => {
  assert.deepEqual(parseCredentials(JSON.stringify(credentials)), credentials);
  for (const value of [null, [], {}, 'text', { ...credentials, user: 'other' },
    { ...credentials, password: '' }, { ...credentials, host: 'unapproved.example' },
    { ...credentials, connectionString: 'postgres://unapproved' },
    { ...credentials, ssl: false }, { ...credentials, options: '-c default_transaction_read_only=off' }]) {
    assert.throws(() => parseCredentials(JSON.stringify(value)), { code: 'INPUT_INVALID' });
  }
});

test('inspection rejects malformed or oversized input without echoing it', () => {
  for (const input of ['secret-not-json', 'x'.repeat(8193), JSON.stringify({ ...credentials, password: 'x'.repeat(4097) })]) {
    assert.throws(() => parseCredentials(input), (error) => error.code === 'INPUT_INVALID'
      && !error.message.includes('secret-not-json') && error.message.length < 40);
  }
});

test('inspection pins the target and TLS policy rather than spreading credential configuration', () => {
  const config = inspectionConfig({ ...credentials, host: 'elsewhere', ssl: false, connectionString: 'ignored' }, 'postgres');
  assert.equal(config.host, inspectionHost);
  assert.equal(config.port, 5432);
  assert.equal(config.database, 'postgres');
  assert.equal(config.connectionString, undefined);
  assert.equal(config.ssl.rejectUnauthorized, true);
  assert.equal(config.ssl.servername, inspectionHost);
  assert.equal(config.ssl.checkServerIdentity, checkServerIdentity);
  assert.equal(config.ssl.ca, rootCertificates);
  assert.equal(config.ssl.minVersion, 'TLSv1.2');
  assert.match(config.options, /default_transaction_read_only=on/);
  assert.equal(inspectionConfig(credentials, 'floorflow').database, 'floorflow');
  assert.throws(() => inspectionConfig(credentials, 'azure_sys'), { code: 'INPUT_INVALID' });
});

const socket = {
  encrypted: true, authorized: true, servername: inspectionHost,
  getPeerCertificate: () => ({ subjectaltname: `DNS:${inspectionHost}` }),
  getProtocol: () => 'TLSv1.3',
};

test('TLS evidence requires encryption, chain authorization and matching hostname', () => {
  assert.deepEqual(verifyTls(socket), {
    encrypted: true, certificateChainAuthorized: true, hostnameVerified: true, protocol: 'TLSv1.3',
  });
  for (const change of [{ encrypted: false }, { authorized: false }, { servername: 'other.example' },
    { getPeerCertificate: () => ({ subjectaltname: 'DNS:other.example' }) }]) {
    assert.throws(() => verifyTls({ ...socket, ...change }), { code: 'TLS_NOT_VERIFIED' });
  }
});

test('sanitized output aliases unknown names consistently and redacts custom search paths', () => {
  const report = {
    databases: [{ database: 'private-project', owner: 'person@example.com' }],
    roles: [{ role: 'person@example.com' }, { role: 'floorflow_ai' }, { role: 'pg_monitor' }],
    sessions: [{ database: 'floorflow', schemas: [{ schema: 'internal-name', owner: 'person@example.com' }],
      objects: [{ schema: 'public', object: 'customers', owner: 'floorflow_owner' },
        { schema: 'internal-name', object: 'private-table', owner: 'person@example.com' }],
      parameters: [{ name: 'search_path', setting: 'private-project' },
        { name: 'search_path', setting: 'pg_catalog, public' }] }],
  };
  const safe = sanitizeReport(report);
  assert.equal(safe.databases[0].database, 'other_database_1');
  assert.equal(safe.databases[0].owner, safe.roles[0].role);
  assert.equal(safe.roles[1].role, 'floorflow_ai');
  assert.equal(safe.roles[2].role, 'pg_monitor');
  assert.equal(safe.sessions[0].objects[0].object, 'customers');
  assert.equal(safe.sessions[0].parameters[1].setting, 'pg_catalog, public');
  for (const value of ['person@example.com', 'private-project', 'private-table', 'internal-name']) {
    assert.equal(JSON.stringify(safe).includes(value), false);
  }
  assert.equal(report.databases[0].owner, 'person@example.com');
});

test('error reporting allows codes but never returns provider messages or arbitrary values', () => {
  assert.equal(safeErrorCode({ code: '42501', message: credentials.password }), '42501');
  assert.equal(safeErrorCode({ code: 'ERR_TLS_CERT_ALTNAME_INVALID' }), 'ERR_TLS_CERT_ALTNAME_INVALID');
  assert.equal(safeErrorCode({ code: credentials.password, message: credentials.password }), 'INSPECTION_FAILED');
  assert.equal(safeErrorCode(new Error(credentials.password)), 'INSPECTION_FAILED');
});
