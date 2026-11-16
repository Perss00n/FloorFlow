import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { readRuntimeConfig } from '../src/runtime.js';

const username = 'reviewer';
const password = 'test-only-long-password:with-colon-å';
const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

async function start(context, options = {}) {
  let databaseCalls = 0;
  let assistantCalls = 0;
  const app = createApp({ async query() { databaseCalls += 1; return { rows: [] }; } }, {
    async chat() { assistantCalls += 1; return { answer: 'Test-only response' }; },
  }, { preview: { username, password }, ...options });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise((resolve) => server.close(resolve)));
  return { url: `http://127.0.0.1:${server.address().port}`, calls: () => ({ databaseCalls, assistantCalls }) };
}

test('preview authentication protects pages, assets, health, API, and unknown paths before any work', async (context) => {
  const app = await start(context);
  for (const path of ['/', '/customer.html?id=1', '/order.html?id=1', '/css/styles.css', '/js/assistant.js',
    '/health', '/api/customers', '/api/customers/1', '/api/customers/1/orders', '/api/orders/1',
    '/api/orders/1/items', '/.env', '/missing']) {
    const response = await fetch(app.url + path);
    assert.equal(response.status, 401, path);
    assert.match(response.headers.get('www-authenticate'), /^Basic realm="FloorFlow preview"/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(response.headers.get('vary'), /Authorization/);
    assert.deepEqual(await response.json(), { error: 'Preview authentication is required.' });
  }
  // Authentication runs even before the assistant JSON parser.
  const chat = await fetch(`${app.url}/api/assistant/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad JSON',
  });
  assert.equal(chat.status, 401);
  assert.deepEqual(app.calls(), { databaseCalls: 0, assistantCalls: 0 });
});

test('correct credentials authorize frontend, health, REST API, and assistant requests', async (context) => {
  const app = await start(context);
  for (const path of ['/', '/customer.html?id=1', '/order.html?id=1', '/js/assistant.js', '/health', '/api/customers']) {
    const response = await fetch(app.url + path, { headers: { authorization } });
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    await response.text();
    assert.equal(response.headers.get('www-authenticate'), null);
  }
  const response = await fetch(`${app.url}/api/assistant/chat`, {
    method: 'POST', headers: { authorization, 'Content-Type': 'application/json' }, body: '{"message":"A test question"}',
  });
  assert.equal(response.status, 200);
  assert.deepEqual(app.calls(), { databaseCalls: 2, assistantCalls: 1 });
});

test('wrong, malformed, oversized, and alternate authentication values fail safely', async (context) => {
  const app = await start(context);
  for (const value of [
    'Bearer secret', 'Basic !!!', 'Basic YQ', 'Basic YQ====', 'Basic ' + 'a'.repeat(2100),
    `Basic ${Buffer.from('reviewer:wrong').toString('base64')}`,
    `Basic ${Buffer.from(`wrong:${password}`).toString('base64')}`,
    `Basic ${Buffer.from(`${username}:${password}\0`).toString('base64')}`,
    `Basic ${Buffer.from(`${username}:${password}`, 'latin1').toString('base64')}`,
  ]) {
    const response = await fetch(app.url, { headers: { authorization: value } });
    assert.equal(response.status, 401);
    const text = await response.text();
    assert.ok(!text.includes(password) && !text.includes(username));
  }
  assert.deepEqual(app.calls(), { databaseCalls: 0, assistantCalls: 0 });
});

test('production rejects plain HTTP and spoofed protocol headers without an authentication challenge', async (context) => {
  const app = await start(context, { preview: { username, password, requireHttps: true } });
  for (const headers of [{}, { authorization }, { authorization, 'X-Forwarded-Proto': 'https' }]) {
    const response = await fetch(app.url, { headers });
    assert.equal(response.status, 426);
    assert.equal(response.headers.get('www-authenticate'), null);
    assert.deepEqual(await response.json(), { error: 'HTTPS is required for preview access.' });
  }
  assert.deepEqual(app.calls(), { databaseCalls: 0, assistantCalls: 0 });
});

test('only an explicitly trusted proxy can report HTTPS, and ambiguous protocols fail closed', async (context) => {
  const app = await start(context, { preview: { username, password, requireHttps: true }, trustedProxies: ['loopback'] });
  for (const protocol of ['http', 'https,http', 'https, https']) {
    assert.equal((await fetch(app.url, { headers: { authorization, 'X-Forwarded-Proto': protocol } })).status, 426);
  }
  const challenge = await fetch(app.url, { headers: { 'X-Forwarded-Proto': 'https' } });
  assert.equal(challenge.status, 401);
  const response = await fetch(`${app.url}/health`, { headers: { authorization, 'X-Forwarded-Proto': 'https' } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('strict-transport-security'), 'max-age=31536000');
});

test('development can leave authentication disabled and default proxy trust remains off', async (context) => {
  const app = await start(context, readRuntimeConfig({}));
  const response = await fetch(`${app.url}/health`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('www-authenticate'), null);
});

test('HTML and API responses carry compatible browser security headers', async (context) => {
  const app = await start(context);
  for (const path of ['/', '/customer.html', '/order.html', '/css/styles.css', '/js/assistant.js', '/api/customers', '/missing']) {
    const response = await fetch(app.url + path, { headers: { authorization } });
    await response.text();
    assert.match(response.headers.get('content-security-policy'), /default-src 'self'/);
    assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(response.headers.get('x-powered-by'), null);
  }
});

test('authenticated requests still receive an explicit unconfigured-assistant response', async (context) => {
  const server = createApp({ query() {} }, null, { preview: { username, password } }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/assistant/chat`, {
    method: 'POST', headers: { authorization, 'Content-Type': 'application/json' }, body: '{"message":"Sales?"}',
  });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /not configured/);
});

test('unexpected REST errors do not copy database details into responses or application logs', async (context) => {
  const logger = context.mock.method(console, 'error', () => {});
  const server = createApp({ async query() { throw new Error('password=test-secret SELECT private_table'); } }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/customers`);
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'Internal server error.' });
  assert.deepEqual(logger.mock.calls.map((call) => call.arguments), [['An API request failed.']]);
});
