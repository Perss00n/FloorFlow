import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rmdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const serverFile = fileURLToPath(new URL('../src/server.js', import.meta.url));
const privateDatabaseNames = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];

async function launch(context, overrides = {}, entryFile = serverFile) {
  const directory = await mkdtemp(join(tmpdir(), 'floorflow-startup-'));
  // No .env exists in this empty directory. Azure is explicitly disabled even
  // when a developer has configured credentials in their own environment.
  const env = {
    ...process.env, NODE_ENV: 'development', HOST: '127.0.0.1', PREVIEW_USERNAME: '', PREVIEW_PASSWORD: '',
    TRUST_PROXY: '', AZURE_FOUNDRY_ENDPOINT: '', AZURE_FOUNDRY_MODEL: '', AZURE_FOUNDRY_API_KEY: '', ...overrides,
  };
  const child = spawn(process.execPath, ['--env-file-if-exists=.env', entryFile], { cwd: directory, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (data) => { output += data; });
  child.stderr.on('data', (data) => { output += data; });
  const exited = once(child, 'exit');
  context.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await exited;
    await rmdir(directory);
  });
  return { child, exited, output: () => output };
}

test('the actual server starts using environment variables without a physical .env file', { timeout: 10000 }, async (context) => {
  const reserve = createServer().listen(0, '127.0.0.1');
  await once(reserve, 'listening');
  const port = reserve.address().port;
  await new Promise((resolve) => reserve.close(resolve));
  const instance = await launch(context, { PORT: String(port) });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (instance.child.exitCode !== null) break;
    if (instance.output().includes('FloorFlow is listening')) { ready = true; break; }
    await delay(30);
  }
  assert.ok(ready, 'Server did not become ready with environment-only configuration.');
  const health = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(2000) });
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok', database: 'connected' });
  const assistant = await fetch(`http://127.0.0.1:${port}/api/assistant/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"message":"Sales?"}',
  });
  assert.equal(assistant.status, 503);
});

test('a database startup failure exits safely without connection details', { timeout: 10000 }, async (context) => {
  const instance = await launch(context, { PGPORT: '1', PGPASSWORD: 'test-only-secret-must-not-appear' });
  const [code] = await instance.exited;
  assert.equal(code, 1);
  assert.match(instance.output(), /Cannot start FloorFlow/);
  assert.match(instance.output(), /stage=database reason=connection-refused/);
  assert.ok(!instance.output().includes('test-only-secret-must-not-appear'));
  assert.ok(!instance.output().includes('ECONNREFUSED'));
  for (const name of privateDatabaseNames) assert.ok(!instance.output().includes(`${name}=`));
});

test('an occupied HTTP port fails startup and releases database resources', { timeout: 10000 }, async (context) => {
  const reserve = createServer().listen(0, '127.0.0.1');
  await once(reserve, 'listening');
  context.after(() => new Promise((resolve) => reserve.close(resolve)));
  const instance = await launch(context, { PORT: String(reserve.address().port) });
  const [code] = await instance.exited;
  assert.equal(code, 1);
  assert.match(instance.output(), /Cannot start FloorFlow/);
  assert.match(instance.output(), /stage=listening reason=address-in-use/);
  assert.ok(!instance.output().includes('EADDRINUSE'));
});

test('invalid runtime configuration is identified before database access', { timeout: 10000 }, async (context) => {
  const instance = await launch(context, { PORT: 'secret-invalid-port', PGPORT: '1',
    PGPASSWORD: 'secret-password-must-not-appear' });
  const [code] = await instance.exited;
  assert.equal(code, 1);
  const failureLine = instance.output().split(/\r?\n/).find((line) => line.startsWith('Cannot start FloorFlow.'));
  assert.equal(failureLine, 'Cannot start FloorFlow. stage=configuration reason=unclassified.');
  assert.doesNotMatch(instance.output(), /secret-invalid-port|secret-password-must-not-appear|\n\s+at /);
});

test('the CI role fixture handles connection failure without a raw error or password', { timeout: 10000 }, async (context) => {
  const script = fileURLToPath(new URL('../.github/scripts/setup-test-db.js', import.meta.url));
  const instance = await launch(context, { NODE_ENV: 'test', PGHOST: '127.0.0.1', PGDATABASE: 'floorflow_ci',
    PGUSER: 'floorflow_ci', PGPORT: '1', PGPASSWORD: 'test-only-owner-secret', AI_PGUSER: 'floorflow_ai',
    AI_PGPASSWORD: 'test-only-admin-secret' }, script);
  const [code] = await instance.exited;
  assert.equal(code, 1);
  assert.match(instance.output(), /Test database setup failed/);
  assert.ok(!instance.output().includes('test-only-admin-secret'));
  assert.ok(!instance.output().includes('ECONNREFUSED'));
  assert.ok(!instance.output().includes('at '));
});

test('the CI role fixture rejects non-test, remote or non-CI targets before connecting', { timeout: 10000 }, async (context) => {
  const script = fileURLToPath(new URL('../.github/scripts/setup-test-db.js', import.meta.url));
  for (const change of [{ NODE_ENV: 'production' }, { PGHOST: 'unapproved.example' },
    { PGDATABASE: 'floorflow' }, { PGUSER: 'floorflow_app' }]) {
    const instance = await launch(context, { NODE_ENV: 'test', PGHOST: '127.0.0.1', PGDATABASE: 'floorflow_ci',
      PGUSER: 'floorflow_ci', PGPORT: '1', PGPASSWORD: 'test-only-secret', ...change }, script);
    assert.equal((await instance.exited)[0], 1);
    assert.match(instance.output(), /Test database setup requires NODE_ENV=test and the local floorflow_ci database\/user/);
    assert.doesNotMatch(instance.output(), /Test database setup failed|test-only-secret|ECONNREFUSED|unapproved\.example|\n\s+at /);
  }
});
