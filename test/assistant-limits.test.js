import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createUsageBudget } from '../src/assistant/usage-budget.js';
import { createRequestQueue } from '../src/assistant/request-queue.js';
import { generateSql } from '../src/assistant/model.js';

test('hourly and UTC daily budgets are independent and survive recreation', (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'floorflow-budget-'));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'usage.json');
  let time = Date.parse('2026-11-19T12:00:00Z');
  const options = { path, now: () => time };
  let budget = createUsageBudget(options);
  for (let i = 0; i < 100; i++) budget.reserve();
  assert.equal(budget.retryAfter(), 3600);
  assert.throws(() => budget.reserve(), (error) => error.status === 429 && error.retryAfter === 3600);
  budget = createUsageBudget(options);
  assert.equal(budget.retryAfter(), 3600);
  time += 3600000;
  for (let i = 0; i < 100; i++) budget.reserve();
  time += 3600000;
  budget = createUsageBudget(options);
  assert.equal(budget.retryAfter(), 10 * 3600);
  assert.throws(() => budget.reserve(), (error) => error.status === 429);
  time = Date.parse('2026-11-20T00:00:00Z');
  assert.equal(budget.retryAfter(), 0);
  budget.reserve();
  assert.equal(JSON.parse(readFileSync(path, 'utf8')).dayCount, 1);
});

test('invalid, future or unwritable budget state blocks AI safely', (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'floorflow-budget-'));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'usage.json');
  for (const content of ['{bad json', '{}', JSON.stringify({ version: 1, day: '2026-11-20', hour: '2026-11-20T00', dayCount: 1, hourCount: 1 })]) {
    writeFileSync(path, content);
    const budget = createUsageBudget({ path, now: () => Date.parse('2026-11-19T12:00:00Z') });
    assert.throws(() => budget.reserve(), (error) => error.status === 503 && !error.message.includes(directory));
    assert.equal(readFileSync(path, 'utf8'), content);
  }
  const unwritable = createUsageBudget({ path: join(directory, 'missing', 'usage.json') });
  assert.throws(() => unwritable.reserve(), (error) => error.status === 503);
});

test('two active slots and four FIFO waiting slots bound concurrency and reject overflow', async () => {
  const queue = createRequestQueue();
  const first = await queue.acquire();
  const second = await queue.acquire();
  const order = [];
  const pending = Array.from({ length: 4 }, (_, index) => queue.acquire().then((release) => { order.push(index); release(); }));
  await assert.rejects(queue.acquire(), (error) => error.status === 429);
  first(); first();
  await Promise.all(pending);
  assert.deepEqual(order, [0, 1, 2, 3]);
  second();
  (await queue.acquire())();
});

test('expired and disconnected queued requests are removed without starting work', async () => {
  const queue = createRequestQueue({ concurrency: 1, capacity: 1, waitMillis: 20 });
  const release = await queue.acquire();
  const controller = new AbortController();
  const disconnected = queue.acquire(controller.signal);
  controller.abort();
  await assert.rejects(disconnected, (error) => error.status === 429);
  await assert.rejects(queue.acquire(), (error) => error.status === 429);
  release();
  (await queue.acquire())();
});

test('provider throttling preserves bounded Retry-After without retrying or reflecting details', async () => {
  for (const [header, expected] of [['12', 12], ['99999', 3600], ['private-api-key', 60], ['-2', 60]]) {
    let calls = 0;
    const client = { chat: { completions: { async create() { calls++; throw { status: 429, headers: new Headers({ 'retry-after': header }), message: 'private provider error' }; } } } };
    await assert.rejects(generateSql(client, 'unchanged-model', 'question'), (error) => error.status === 429 && error.retryAfter === expected && !error.message.includes('private'));
    assert.equal(calls, 1);
  }
});
