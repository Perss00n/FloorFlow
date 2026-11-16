import assert from 'node:assert/strict';
import { once } from 'node:events';
import { after, test } from 'node:test';
import { createApp } from '../src/app.js';
import { pool } from '../src/db.js';

after(async () => {
  await pool.end();
});

async function startServer(context, database) {
  const server = createApp(database).listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('GET /health returns 200 after a real PostgreSQL query', async (context) => {
  const baseUrl = await startServer(context, pool);
  const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(5000) });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok', database: 'connected' });
});

test('GET /health returns 503 without leaking database errors', async (context) => {
  const unavailableDatabase = {
    async query() {
      throw new Error('Simulated private database connection details');
    },
  };
  const baseUrl = await startServer(context, unavailableDatabase);
  const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(5000) });

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    status: 'unavailable',
    database: 'disconnected',
  });
});
