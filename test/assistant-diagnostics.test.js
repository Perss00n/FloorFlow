import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { generateSql } from '../src/assistant/model.js';
import { createApp } from '../src/app.js';

test('length diagnostics retain token counts without logging model content or questions', async context => {
  const events = [];
  context.mock.method(console, 'info', value => events.push(JSON.parse(value)));
  const client = { chat: { completions: { async create() { return {
    choices: [{ finish_reason: 'length', message: { content: 'private-model-sql' } }],
    usage: { prompt_tokens: 1000, completion_tokens: 1200, completion_tokens_details: { reasoning_tokens: 1200 } },
  }; } } } };
  await assert.rejects(generateSql(client, 'test', 'private-user-question'), error => error.status === 502);
  assert.deepEqual(events, [{ event: 'floorflow-model-result', finishReason: 'length', promptTokens: 1000,
    completionTokens: 1200, reasoningTokens: 1200, contentChars: 17 }]);
  assert.ok(!JSON.stringify(events).includes('private'));
});

test('the Node model error is marked JSON HTTP 502 before any external proxy', async context => {
  context.mock.method(console, 'info', () => {});
  const client = { chat: { completions: { async create() { return {
    choices: [{ finish_reason: 'length', message: { content: '' } }],
  }; } } } };
  const app = createApp({}, { chat: () => generateSql(client, 'test', 'question') });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/assistant/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"message":"test"}',
  });
  assert.equal(response.status, 502);
  assert.match(response.headers.get('content-type'), /^application\/json/);
  assert.equal(response.headers.get('x-floorflow-response'), 'assistant');
  assert.deepEqual(await response.json(), { error: 'The AI service returned an unusable response. Please rephrase your question.' });
});
