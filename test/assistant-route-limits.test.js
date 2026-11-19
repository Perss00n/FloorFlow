import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import express from 'express';
import { createAssistantRouter } from '../src/routes/assistant.js';
import { AssistantError } from '../src/assistant/errors.js';
import { createApp } from '../src/app.js';
import { proxyDiagnostics } from '../src/proxy-diagnostics.js';

async function start(context, assistant, now = Date.now, options = {}) {
  const app = express();
  app.use('/api/assistant', createAssistantRouter(assistant, now, options));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise(resolve => server.close(resolve)));
  return async (message = 'test question', headers = {}) => fetch(`http://127.0.0.1:${server.address().port}/api/assistant/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ message }),
  });
}

test('HTTP burst allows two active plus four queued, rejects overflow and recovers', async (context) => {
  let active = 0, maximum = 0, calls = 0, release, markStarted;
  const started = new Promise(resolve => { markStarted = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const send = await start(context, { async chat() {
    calls++; active++; maximum = Math.max(maximum, active);
    if (calls === 2) markStarted();
    try { await gate; return { answer: 'bounded test result' }; } finally { active--; }
  } });
  const first = [send(), send()];
  await started;
  const queued = Array.from({ length: 4 }, () => send());
  await new Promise(resolve => setTimeout(resolve, 30));
  try {
    const overflow = await send();
    assert.equal(overflow.status, 429);
    assert.equal(overflow.headers.get('retry-after'), '5');
    assert.equal(calls, 2);
  } finally { release(); }
  const completed = await Promise.all([...first, ...queued]);
  assert.ok(completed.every(response => response.status === 200));
  assert.equal(maximum, 2);
  assert.equal(calls, 6);
});

test('provider cooldown blocks new dispatch without retrying or consuming budget', async (context) => {
  let time = 0, calls = 0, reservations = 0;
  const budget = { retryAfter: () => 0, reserve() { reservations++; } };
  const send = await start(context, { async chat() {
    calls++;
    if (calls === 1) throw new AssistantError(429, 'The AI service is temporarily rate limited. Please wait before trying again.', 15);
    return { answer: 'recovered' };
  } }, () => time, { budget });
  assert.equal((await send()).status, 429);
  time = 1000;
  const blocked = await send();
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get('retry-after'), '14');
  assert.equal(calls, 1); assert.equal(reservations, 1);
  time = 15000;
  assert.equal((await send()).status, 200);
  assert.equal(calls, 2);
});

test('application wiring keeps normal pages available when the AI budget is unavailable', async (context) => {
  let calls = 0;
  const app = createApp({ async query() { return { rows: [] }; } }, { async chat() { calls++; } }, {
    assistantBudget: { retryAfter() { throw new AssistantError(503, 'The assistant usage budget is unavailable.'); } },
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(url + '/health')).status, 200);
  const response = await fetch(url + '/api/assistant/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'test' }) });
  assert.equal(response.status, 503); assert.equal(calls, 0);
});

test('proxy diagnostics use temporary fingerprints and verify the rightmost untrusted client', async (context) => {
  const logs = [];
  const app = express();
  app.set('trust proxy', ['127.0.0.1']);
  app.use(proxyDiagnostics(line => logs.push(JSON.parse(line))));
  app.get('/health', (request, response) => response.sendStatus(401));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise(resolve => server.close(resolve)));
  for (const forwarded of ['198.51.100.10', '192.0.2.99, 127.0.0.1, 198.51.100.10']) {
    await fetch(`http://127.0.0.1:${server.address().port}/health`, { headers: { 'X-FloorFlow-Proxy-Probe': 'baseline',
      'X-Forwarded-For': forwarded, 'CF-Connecting-IP': '198.51.100.10', 'CF-Ray': '0123456789abcdef-ARN' } });
  }
  assert.equal(logs.length, 2);
  assert.match(logs[0].clientId, /^[a-f0-9]{16}$/);
  assert.equal(logs[0].clientId, logs[1].clientId);
  assert.ok(logs.every(entry => entry.cloudflareClientMatches));
  assert.doesNotMatch(JSON.stringify(logs), /198\.51\.100|192\.0\.2/);
});
