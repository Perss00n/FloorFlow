import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchJson, getPageId, readAssistantReply } from '../public/js/api.js';

test('page IDs are read through URLSearchParams and preserve valid integer strings', () => {
  assert.equal(getPageId('?id=1'), '1');
  assert.equal(getPageId('?id=0001'), '0001');
  assert.equal(getPageId('?id=2147483647'), '2147483647');
  assert.equal(getPageId('?id=%31&other=value'), '1');
});

test('missing, ambiguous, and invalid page IDs are rejected', () => {
  for (const search of ['', '?name=1', '?id=', '?id=0', '?id=-1', '?id=1.5', '?id=1e2', '?id=abc', '?id=2147483648', '?id=9007199254740993', '?id=1&id=2', '?id=%201', '?id=%2B1', '?id=1%20OR%201=1']) {
    assert.equal(getPageId(search), null, search);
  }
});

test('fetchJson returns JSON without converting decimal strings', async (context) => {
  context.mock.method(globalThis, 'fetch', async (path, options) => {
    assert.equal(path, '/api/orders/1');
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json({ total: '9999999999980013842.00' });
  });
  assert.deepEqual(await fetchJson('/api/orders/1'), { total: '9999999999980013842.00' });
});

for (const status of [400, 404, 500]) {
  test(`fetchJson exposes HTTP ${status} for handling but discards the response body`, async (context) => {
    context.mock.method(globalThis, 'fetch', async () => Response.json({
      error: 'Simulated private connection details and SQL',
    }, { status }));

    await assert.rejects(fetchJson('/api/orders/1'), {
      status,
      message: 'Unable to load data from FloorFlow.',
    });
  });
}

test('network failures reject so pages can display their error state', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(fetchJson('/api/customers'), TypeError);
});

test('invalid JSON rejects so pages do not silently render a malformed response', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => new Response('not JSON'));
  await assert.rejects(fetchJson('/api/customers'), SyntaxError);
});

test('AI gateway HTML errors produce a safe useful message instead of a misleading connection error', async () => {
  const result = await readAssistantReply(new Response('<html>private gateway details and visitor address</html>', { status: 502 }));
  assert.match(result.error, /rephrase your question/);
  assert.doesNotMatch(result.error, /private|visitor|html/);
});

test('AI throttling displays only a bounded numeric Retry-After delay', async () => {
  const result = await readAssistantReply(Response.json({ error: 'The assistant is busy.' }, { status: 429, headers: { 'Retry-After': '5' } }));
  assert.match(result.error, /wait 5 seconds/);
  const invalid = await readAssistantReply(Response.json({ error: 'The assistant is busy.' }, { status: 429, headers: { 'Retry-After': 'private-value' } }));
  assert.doesNotMatch(invalid.error, /private-value/);
});

test('AI successful JSON keeps exact decimals and malformed successful replies still fail closed', async () => {
  const data = { results: [{ total_sek: '285415.00' }] };
  assert.deepEqual(await readAssistantReply(Response.json(data)), data);
  await assert.rejects(readAssistantReply(new Response('invalid JSON', { status: 200 })), SyntaxError);
});
