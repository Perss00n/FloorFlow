import assert from 'node:assert/strict';
import { test } from 'node:test';
import OpenAI from 'openai';
import { createModelClient, generateSql, systemPrompt } from '../src/assistant/model.js';
import { configureAssistant } from '../src/assistant/config.js';
import { buildAnswer } from '../src/assistant/assistant.js';
import { createReadPool } from '../src/assistant/database.js';

function modelReturning(content, finish = 'stop') {
  return { chat: { completions: { async create() { return { choices: [{ finish_reason: finish, message: { content } }] }; } } } };
}

test('the prompt includes schema, historical prices, completed sales and untrusted-input instructions', () => {
  for (const text of ['CREATE TABLE customers', 'CREATE TABLE order_items', "status='completed'", 'order_items.unit_price', 'BEFORE summing', 'untrusted question']) {
    assert.ok(systemPrompt.includes(text), text);
  }
});

test('the official SDK targets only the configured Azure v1 deployment with bounded structured output', async () => {
  const env = {
    AZURE_FOUNDRY_ENDPOINT: 'https://floorflow-example.services.ai.azure.com/openai/v1/',
    AZURE_FOUNDRY_MODEL: 'actual-deployment-name', AZURE_FOUNDRY_API_KEY: 'local-test-key',
  };
  const client = createModelClient(env);
  let requests = 0;
  // Replacing the SDK transport guarantees this test cannot reach Azure.
  client.fetch = async (url, options) => {
    requests += 1;
    assert.equal(String(url), `${env.AZURE_FOUNDRY_ENDPOINT}chat/completions`);
    const body = JSON.parse(options.body);
    assert.equal(body.model, env.AZURE_FOUNDRY_MODEL);
    assert.equal(body.max_completion_tokens, 1200);
    assert.equal(body.response_format.json_schema.strict, true);
    assert.equal(body.messages[1].content, 'How many customers?');
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: '{"sql":"SELECT COUNT(*) AS customer_count FROM customers"}' } }] });
  };
  assert.equal(client.maxRetries, 0);
  assert.equal(client.timeout, 20000);
  assert.match(await generateSql(client, env.AZURE_FOUNDRY_MODEL, 'How many customers?'), /COUNT/);
  assert.equal(requests, 1);
});

test('missing, partial, foreign-provider and invalid Azure configurations disable the assistant', async () => {
  assert.equal(createModelClient({}), null);
  for (const endpoint of ['https://api.openai.com/openai/v1/', 'http://x.openai.azure.com/openai/v1/', 'https://x.openai.azure.com/', 'https://x.openai.azure.com/openai/v1/?key=secret', 'https://x.openai.azure.com.evil.example/openai/v1/']) {
    assert.equal(createModelClient({ AZURE_FOUNDRY_ENDPOINT: endpoint, AZURE_FOUNDRY_MODEL: 'deployment', AZURE_FOUNDRY_API_KEY: 'test' }), null);
  }
  assert.equal(createReadPool({ PGUSER: 'floorflow_ai', AI_PGUSER: 'floorflow_ai', AI_PGPASSWORD: 'separate' }), null);
  assert.equal(createReadPool({ PGUSER: 'normal', PGPASSWORD: 'same', AI_PGUSER: 'floorflow_ai', AI_PGPASSWORD: 'same' }), null);
  const configured = configureAssistant({});
  assert.equal(configured.assistant, null);
  await configured.close();
});

test('the official SDK does not retry a simulated provider 500 or expose its body', async () => {
  const client = createModelClient({ AZURE_FOUNDRY_ENDPOINT: 'https://test.openai.azure.com/openai/v1/', AZURE_FOUNDRY_MODEL: 'test', AZURE_FOUNDRY_API_KEY: 'test-only-key' });
  let requests = 0;
  client.fetch = async () => {
    requests += 1;
    return Response.json({ error: { message: 'private provider details' } }, { status: 500 });
  };
  await assert.rejects(generateSql(client, 'test', 'question'), (error) => error.status === 503 && !error.message.includes('private'));
  assert.equal(requests, 1);
});

test('a structured null SQL response represents a question outside the schema', async () => {
  assert.equal(await generateSql(modelReturning('{"sql":null}'), 'test-deployment', 'What is the weather?'), null);
});

for (const content of ['not JSON', '{}', '[]', '{"sql":42}', '{"sql":""}', '{"sql":null,"answer":"invented"}', JSON.stringify({ sql: 'x'.repeat(6001) }), 'x'.repeat(8001)]) {
  test(`malformed model content is rejected (${content.slice(0, 25)})`, async () => {
    await assert.rejects(generateSql(modelReturning(content), 'test', 'question'), (error) => error.status === 502);
  });
}

test('truncated output and refusal do not become SQL', async () => {
  await assert.rejects(generateSql(modelReturning('{"sql":null}', 'length'), 'test', 'question'), (error) => error.status === 502);
  await assert.rejects(generateSql({ chat: { completions: { async create() { return { choices: [{ finish_reason: 'stop', message: { refusal: 'No', content: null } }] }; } } } }, 'test', 'question'), (error) => error.status === 502);
});

test('missing choices, null choices and unexpected tool calls are malformed responses', async () => {
  for (const response of [null, {}, { choices: [] }, { choices: [null] }, { choices: [{ finish_reason: 'stop', message: { content: '{"sql":null}', tool_calls: [{ id: 'unexpected' }] } }] }]) {
    const client = { chat: { completions: { async create() { return response; } } } };
    await assert.rejects(generateSql(client, 'test', 'question'), (error) => error.status === 502);
  }
  const noTools = { chat: { completions: { async create() { return { choices: [{ finish_reason: 'stop', message: { content: '{"sql":null}', tool_calls: [] } }] }; } } } };
  assert.equal(await generateSql(noTools, 'test', 'question'), null);
});

for (const failure of [{ name: 'APIConnectionTimeoutError', expected: 504 }, { name: 'TimeoutError', expected: 504 }, { status: 401, expected: 503 }, { status: 403, expected: 503 }, { status: 429, expected: 503 }, { status: 500, expected: 503 }]) {
  test(`model failure ${failure.name ?? failure.status} is safe and is not retried`, async () => {
    let calls = 0;
    const client = { chat: { completions: { async create() { calls += 1; throw Object.assign(new Error('secret-key and private provider details'), failure); } } } };
    await assert.rejects(generateSql(client, 'test', 'question'), (error) => error.status === failure.expected && !error.message.includes('secret'));
    assert.equal(calls, 1);
  });
}

test('answer wording uses only actual returned values and preserves exact digits', () => {
  assert.equal(buildAnswer({ columns: [], results: [] }), 'No matching records were found.');
  const answer = buildAnswer({ columns: ['total_sales_sek'], results: [{ total_sales_sek: '9999999999980013842.00' }] });
  assert.ok(answer.includes('9,999,999,999,980,013,842.00 SEK'));
  assert.ok(buildAnswer({ columns: ['name'], results: [{ name: null }] }).includes('No value'));
  assert.ok(buildAnswer({ columns: ['name', 'count'], results: [{ name: 'Actual', count: '1' }], truncated: true }).includes('display limit'));
});

test('actual SDK timeout and abort exception classes map to 504 despite their generic Error name', async () => {
  for (const failure of [new OpenAI.APIConnectionTimeoutError(), new OpenAI.APIUserAbortError()]) {
    const client = { chat: { completions: { async create() { throw failure; } } } };
    await assert.rejects(generateSql(client, 'test', 'question'), (error) => error.status === 504);
  }
});

test('the real SDK deadline cancels an intercepted transport without a network call or retry', async () => {
  const client = createModelClient({ AZURE_FOUNDRY_ENDPOINT: 'https://test.openai.azure.com/openai/v1/', AZURE_FOUNDRY_MODEL: 'test', AZURE_FOUNDRY_API_KEY: 'test-only-key' });
  client.timeout = 20;
  let requests = 0;
  client.fetch = async (url, options) => {
    requests += 1;
    return new Promise((resolve, reject) => {
      if (options.signal.aborted) reject(options.signal.reason);
      else options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
    });
  };
  await assert.rejects(generateSql(client, 'test', 'question'), (error) => error.status === 504);
  assert.equal(requests, 1);
});
