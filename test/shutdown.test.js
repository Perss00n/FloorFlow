import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { createShutdown } from '../src/shutdown.js';

async function listen(context, handler) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => { server.closeAllConnections(); server.close(); });
  return server;
}

test('shutdown drains an in-flight HTTP request before closing resources, exactly once', async (context) => {
  let release;
  let markStarted;
  const gate = new Promise((resolve) => { release = resolve; });
  const started = new Promise((resolve) => { markStarted = resolve; });
  let closed = 0;
  const server = await listen(context, async (request, response) => {
    markStarted();
    await gate;
    assert.equal(closed, 0);
    response.end('finished');
  });
  const request = fetch(`http://127.0.0.1:${server.address().port}`, { headers: { Connection: 'close' } });
  await started;
  const shutdown = createShutdown(server, async () => { closed += 1; }, {
    timeoutMs: 2000, onTimeout: () => assert.fail('Normal drain must not time out'),
  });
  const first = shutdown();
  assert.equal(shutdown(), first);
  assert.equal(server.listening, false);
  assert.equal(closed, 0);
  release();
  assert.equal(await (await request).text(), 'finished');
  await first;
  assert.equal(closed, 1);
});

test('shutdown deadline closes stuck HTTP connections and invokes the forced-exit decision', async (context) => {
  let markStarted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const server = await listen(context, () => markStarted());
  const request = fetch(`http://127.0.0.1:${server.address().port}`).catch(() => null);
  await started;
  let timedOut = 0;
  let closed = 0;
  const shutdown = createShutdown(server, async () => { closed += 1; }, {
    timeoutMs: 50, onTimeout: () => { timedOut += 1; },
  });
  await shutdown();
  assert.equal(await request, null);
  assert.equal(timedOut, 1);
  assert.equal(closed, 1);
});

test('shutdown deadline includes database pool cleanup, not only HTTP draining', async (context) => {
  const server = await listen(context, (request, response) => response.end());
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let timedOut;
  const deadline = new Promise((resolve) => { timedOut = resolve; });
  const shutdown = createShutdown(server, () => gate, { timeoutMs: 50, onTimeout: timedOut });
  const finished = shutdown();
  await deadline;
  release();
  await finished;
});

test('shutdown reports cleanup failures and clears its deadline', async (context) => {
  const server = await listen(context, (request, response) => response.end());
  const shutdown = createShutdown(server, async () => { throw new Error('Test-only cleanup failure'); }, {
    timeoutMs: 20, onTimeout: () => assert.fail('Failed cleanup must clear its timer'),
  });
  await assert.rejects(shutdown(), /Test-only cleanup failure/);
  await delay(40);
});
