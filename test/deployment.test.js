import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { once } from 'node:events';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/app.js';
import { readRuntimeConfig } from '../src/runtime.js';
import { proxyDiagnostics } from '../src/proxy-diagnostics.js';

const files = JSON.parse(readFileSync(new URL('../scripts/deployment-files.json', import.meta.url)));
const root = fileURLToPath(new URL('../', import.meta.url));

test('deployment allowlist includes every runtime source and asset, with only the required schema SQL', () => {
  const runtimeFiles = ['src', 'public'].flatMap((dir) => readdirSync(new URL(`../${dir}/`, import.meta.url),
    { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile())
    .map((entry) => relative(root, join(entry.parentPath, entry.name)).replaceAll('\\', '/')));
  assert.deepEqual([...files].sort(), [...runtimeFiles, 'package.json', 'package-lock.json', 'db/init/01-schema.sql'].sort());
  assert.equal(new Set(files).size, files.length);
  for (const file of files) {
    assert.doesNotMatch(file, /(^|\/)(\.|test|scripts|docs)|seed|credential|\.log$|\.xml$/);
    assert.ok(readFileSync(new URL(`../${file}`, import.meta.url)).length > 0);
  }
  const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url)));
  assert.ok(Object.values(lock.packages).every((pkg) => !pkg.hasInstallScript), 'Review Linux package build if install scripts become necessary');
});

test('optional proxy diagnostics emit only bounded metadata and never reflect arbitrary headers or credentials', () => {
  const logs = [];
  const middleware = proxyDiagnostics((line) => logs.push(JSON.parse(line)));
  let nextCalls = 0;
  const request = { method: 'GET', path: '/health', socket: { remoteAddress: '127.0.0.1' },
    get(name) { return { 'X-FloorFlow-Proxy-Probe': 'baseline', 'X-Forwarded-Proto': 'secret-value',
      Authorization: 'secret-password', Cookie: 'secret-cookie' }[name]; } };
  for (let i = 0; i < 20; i++) middleware(request, {}, () => { nextCalls++; });
  assert.equal(logs.length, 12);
  assert.equal(nextCalls, 20);
  assert.deepEqual(logs[0], { event: 'floorflow-proxy-probe', probe: 'baseline', peer: '127.0.0.1', clientId: 'unknown', cloudflareClientMatches: false, ray: 'unknown', socketTls: false, forwardedProto: 'other' });
  assert.doesNotMatch(JSON.stringify(logs), /secret|Authorization|Cookie/);
  const ignored = proxyDiagnostics(() => assert.fail('Unrecognized requests must not be logged'));
  ignored({ ...request, path: '/api/customers' }, {}, () => {});
  ignored({ ...request, method: 'POST' }, {}, () => {});
  ignored({ ...request, get: () => 'attacker-controlled' }, {}, () => {});
});

test('proxy diagnostics are off by default and reject accidental values', () => {
  assert.equal(readRuntimeConfig({}).diagnoseProxy, false);
  assert.equal(readRuntimeConfig({ PROXY_DIAGNOSTICS: 'off' }).diagnoseProxy, false);
  assert.equal(readRuntimeConfig({ PROXY_DIAGNOSTICS: 'on' }).diagnoseProxy, true);
  assert.throws(() => readRuntimeConfig({ PROXY_DIAGNOSTICS: 'true' }), /PROXY_DIAGNOSTICS/);
});

test('diagnostic mode leaves production HTTPS/authentication enforced and performs no unauthorized DB work', async (context) => {
  let databaseCalls = 0;
  const config = readRuntimeConfig({ NODE_ENV: 'production', PGSSLMODE: 'verify-full',
    PORT: '8123', HOST: '0.0.0.0', PREVIEW_USERNAME: 'reviewer', PREVIEW_PASSWORD: 'test-only-long-password', PROXY_DIAGNOSTICS: 'on' });
  assert.equal(config.port, 8123);
  const app = createApp({ async query() { databaseCalls++; return { rows: [] }; } }, null, config);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/health`,
    { headers: { 'X-FloorFlow-Proxy-Probe': 'baseline', 'X-Forwarded-Proto': 'https' } });
  assert.equal(response.status, 426);
  assert.equal(response.headers.get('www-authenticate'), null);
  assert.equal(databaseCalls, 0);
});
