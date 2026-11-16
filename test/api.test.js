import assert from 'node:assert/strict';
import { once } from 'node:events';
import { after, before, test } from 'node:test';
import { createApp } from '../src/app.js';
import { pool } from '../src/db.js';

let baseUrl;

async function startServer(database) {
  const server = createApp(database).listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

let server;
before(async () => {
  const running = await startServer(pool);
  server = running.server;
  baseUrl = running.url;
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await pool.end();
});

async function getJson(path, url = baseUrl) {
  const response = await fetch(`${url}${path}`, { signal: AbortSignal.timeout(5000) });
  assert.match(response.headers.get('content-type'), /^application\/json/);
  return { status: response.status, body: await response.json() };
}

async function startTransaction(context) {
  const client = await pool.connect();
  let transactionServer;

  context.after(async () => {
    try {
      if (transactionServer) {
        await new Promise((resolve) => transactionServer.close(resolve));
      }
    } finally {
      try {
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    }
  });

  await client.query('BEGIN');
  // Routes use this same client so HTTP requests can see uncommitted fixture changes.
  const running = await startServer(client);
  transactionServer = running.server;
  return { client, url: running.url };
}

test('GET /api/customers lists customers in name order with only list fields', async () => {
  const result = await getJson('/api/customers');
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, [
    { id: 5, name: 'Daniel Brooks', email: 'daniel.brooks@example.com', phone: '+46 70 000 00 05' },
    { id: 2, name: 'Emma Carter', email: 'emma.carter@example.com', phone: '+46 70 000 00 02' },
    { id: 4, name: 'Harbor Office Studio', email: 'facilities@harbor-office.example', phone: '+46 70 000 00 04' },
    { id: 1, name: 'Maple Property Group', email: 'projects@maple-property.example', phone: '+46 70 000 00 01' },
    { id: 3, name: 'Northside Cafe', email: 'owner@northside-cafe.example', phone: '+46 70 000 00 03' },
  ]);
});

test('GET /api/customers/:id returns customer details and an ISO timestamp', async () => {
  const result = await getJson('/api/customers/1');
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    id: 1,
    name: 'Maple Property Group',
    email: 'projects@maple-property.example',
    phone: '+46 70 000 00 01',
    created_at: '2026-01-02T09:00:00.000Z',
  });
});

test('GET /api/customers/:id/orders returns only that customer\'s orders, newest first', async () => {
  const result = await getJson('/api/customers/1/orders');
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, [
    { id: 8, order_number: 'FF-2026-008', status: 'completed', created_at: '2026-03-18T08:00:00.000Z', total: '52329.50' },
    { id: 2, order_number: 'FF-2026-002', status: 'completed', created_at: '2026-01-28T08:00:00.000Z', total: '13090.00' },
    { id: 1, order_number: 'FF-2026-001', status: 'completed', created_at: '2026-01-15T08:00:00.000Z', total: '36117.00' },
  ]);
});

test('GET /api/orders/:id includes customer information and the exact order total', async () => {
  const result = await getJson('/api/orders/1');
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    id: 1,
    order_number: 'FF-2026-001',
    status: 'completed',
    created_at: '2026-01-15T08:00:00.000Z',
    customer: {
      id: 1,
      name: 'Maple Property Group',
      email: 'projects@maple-property.example',
      phone: '+46 70 000 00 01',
    },
    total: '36117.00',
  });
});

test('GET /api/orders/:id/items returns articles, exact quantities, and historical prices', async () => {
  const result = await getJson('/api/orders/1/items');
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, [
    { id: 1, sku: 'OAK-ENG-14', article_name: 'Engineered oak flooring, 14 mm', unit: 'm²', quantity: '40.500', unit_price: '550.00', line_total: '22275.00' },
    { id: 2, sku: 'ADH-WOOD-15', article_name: 'Wood flooring adhesive, 15 kg bucket', unit: 'pcs', quantity: '3.000', unit_price: '700.00', line_total: '2100.00' },
    { id: 3, sku: 'SKIRT-WHITE-24', article_name: 'White skirting board, 2.4 m length', unit: 'pcs', quantity: '18.000', unit_price: '119.00', line_total: '2142.00' },
    { id: 4, sku: 'LAB-INSTALL', article_name: 'Flooring installation labor', unit: 'hours', quantity: '16.000', unit_price: '600.00', line_total: '9600.00' },
  ]);
});

test('displayed order totals include pending, cancelled, and draft orders', async (context) => {
  const examples = [
    { id: 9, customerId: 2, status: 'pending', total: '31908.00' },
    { id: 10, customerId: 3, status: 'cancelled', total: '23500.00' },
    { id: 11, customerId: 4, status: 'draft', total: '33831.00' },
  ];

  for (const example of examples) {
    await context.test(example.status, async () => {
      const detail = await getJson(`/api/orders/${example.id}`);
      assert.equal(detail.status, 200);
      assert.equal(detail.body.status, example.status);
      assert.equal(detail.body.total, example.total);

      const orders = await getJson(`/api/customers/${example.customerId}/orders`);
      assert.equal(orders.status, 200);
      assert.equal(orders.body.find((order) => order.id === example.id).total, example.total);
    });
  }
});

test('catalog price changes do not change API historical prices or order totals', async (context) => {
  const { client, url } = await startTransaction(context);
  await client.query('UPDATE articles SET unit_price = $1 WHERE sku = $2', ['999.00', 'OAK-ENG-14']);

  const items = await getJson('/api/orders/1/items', url);
  assert.equal(items.status, 200);
  assert.equal(items.body[0].unit_price, '550.00');
  assert.equal(items.body[0].line_total, '22275.00');

  const order = await getJson('/api/orders/1', url);
  assert.equal(order.status, 200);
  assert.equal(order.body.total, '36117.00');

  const orders = await getJson('/api/customers/1/orders', url);
  assert.equal(orders.status, 200);
  assert.equal(orders.body.find((item) => item.id === 1).total, '36117.00');
});

test('order totals sum rounded lines instead of rounding the final sum', async (context) => {
  const { client, url } = await startTransaction(context);
  await client.query(`
    UPDATE order_items SET quantity = $1, unit_price = $2 WHERE order_id = $3
  `, ['0.500', '0.01', 1]);

  // Four lines of 0.005 round to 0.01 each: the order total must be 0.04, not 0.02.
  const items = await getJson('/api/orders/1/items', url);
  assert.equal(items.status, 200);
  assert.equal(items.body.length, 4);
  assert.ok(items.body.every((item) => item.line_total === '0.01'));

  const order = await getJson('/api/orders/1', url);
  assert.equal(order.status, 200);
  assert.equal(order.body.total, '0.04');

  const orders = await getJson('/api/customers/1/orders', url);
  assert.equal(orders.status, 200);
  assert.equal(orders.body.find((item) => item.id === 1).total, '0.04');
});

test('large numeric amounts retain every digit in JSON strings', async (context) => {
  const { client, url } = await startTransaction(context);
  await client.query(`
    UPDATE order_items SET quantity = $1, unit_price = $2 WHERE id = $3
  `, ['999999999.999', '9999999999.99', 1]);

  const items = await getJson('/api/orders/1/items', url);
  assert.equal(items.status, 200);
  assert.equal(items.body[0].quantity, '999999999.999');
  assert.equal(items.body[0].unit_price, '9999999999.99');
  assert.equal(items.body[0].line_total, '9999999999980000000.00');

  const order = await getJson('/api/orders/1', url);
  assert.equal(order.status, 200);
  assert.equal(order.body.total, '9999999999980013842.00');

  const orders = await getJson('/api/customers/1/orders', url);
  assert.equal(orders.status, 200);
  assert.equal(orders.body.find((item) => item.id === 1).total, '9999999999980013842.00');
});

test('an existing customer without orders returns an empty list in an isolated transaction', async (context) => {
  const { client, url } = await startTransaction(context);
  await client.query(`
    DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE customer_id = $1)
  `, [5]);
  await client.query('DELETE FROM orders WHERE customer_id = $1', [5]);

  const result = await getJson('/api/customers/5/orders', url);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, []);

  const committed = await pool.query('SELECT COUNT(*)::integer AS count FROM orders WHERE customer_id = $1', [5]);
  assert.equal(committed.rows[0].count, 2);
});

test('an existing order without items returns 0.00 and an empty item list', async (context) => {
  const { client, url } = await startTransaction(context);
  await client.query('DELETE FROM order_items WHERE order_id = $1', [1]);

  const order = await getJson('/api/orders/1', url);
  assert.equal(order.status, 200);
  assert.equal(order.body.total, '0.00');

  const items = await getJson('/api/orders/1/items', url);
  assert.equal(items.status, 200);
  assert.deepEqual(items.body, []);

  const orders = await getJson('/api/customers/1/orders', url);
  assert.equal(orders.status, 200);
  assert.equal(orders.body.find((item) => item.id === 1).total, '0.00');
});

const idRoutes = [
  { path: '/api/customers/:id', notFound: 'Customer not found.' },
  { path: '/api/customers/:id/orders', notFound: 'Customer not found.' },
  { path: '/api/orders/:id', notFound: 'Order not found.' },
  { path: '/api/orders/:id/items', notFound: 'Order not found.' },
];

test('invalid route IDs return 400 before any database query', async (context) => {
  let queryCount = 0;
  const unusedDatabase = {
    async query() {
      queryCount += 1;
      throw new Error('Invalid IDs must not reach the database');
    },
  };
  const running = await startServer(unusedDatabase);
  context.after(() => new Promise((resolve) => running.server.close(resolve)));

  for (const id of ['0', '-1', '1.5', '1e2', 'abc', '2147483648', '9007199254740993', 'NaN', 'Infinity', ' ', '+1', '1 OR 1=1', '1/2']) {
    await context.test(JSON.stringify(id), async () => {
      for (const route of idRoutes) {
        const result = await getJson(route.path.replace(':id', encodeURIComponent(id)), running.url);
        assert.equal(result.status, 400);
        assert.deepEqual(result.body, {
          error: 'ID must be a positive integer between 1 and 2147483647.',
        });
      }
    });
  }
  assert.equal(queryCount, 0);
});

test('malformed URL encoding returns a safe JSON 400 response', async () => {
  for (const route of idRoutes) {
    const result = await getJson(route.path.replace(':id', '%E0%A4%A'));
    assert.equal(result.status, 400);
    assert.deepEqual(result.body, { error: 'Invalid URL encoding.' });
  }
});

test('valid IDs at the PostgreSQL INTEGER limit return 404 for missing records', async () => {
  for (const route of idRoutes) {
    const result = await getJson(route.path.replace(':id', '2147483647'));
    assert.equal(result.status, 404);
    assert.deepEqual(result.body, { error: route.notFound });
  }
});

test('decimal integer IDs with leading zeros still identify the same customer', async () => {
  const result = await getJson('/api/customers/0001');
  assert.equal(result.status, 200);
  assert.equal(result.body.id, 1);
});

const errorCases = [
  { path: '/api/customers', failAt: 1 },
  { path: '/api/customers/1', failAt: 1 },
  { path: '/api/customers/1/orders', failAt: 1 },
  { path: '/api/customers/1/orders', failAt: 2 },
  { path: '/api/orders/1', failAt: 1 },
  { path: '/api/orders/1/items', failAt: 1 },
  { path: '/api/orders/1/items', failAt: 2 },
];

for (const example of errorCases) {
  test(`database errors on ${example.path}, query ${example.failAt}, return a safe 500`, async (context) => {
    context.mock.method(console, 'error', () => {});
    let queryCount = 0;
    const failingDatabase = {
      async query() {
        queryCount += 1;
        if (queryCount === example.failAt) {
          throw new Error('password=private-test-value; SELECT * FROM customers; db.internal:5432');
        }
        return { rowCount: 1, rows: [{ id: 1 }] };
      },
    };
    const running = await startServer(failingDatabase);
    context.after(() => new Promise((resolve) => running.server.close(resolve)));

    const result = await getJson(example.path, running.url);
    assert.equal(result.status, 500);
    assert.deepEqual(result.body, { error: 'Internal server error.' });
    assert.equal(queryCount, example.failAt);
  });
}

test('unknown routes and write methods have no handlers', async () => {
  const unknown = await getJson('/api/unknown');
  assert.equal(unknown.status, 404);
  assert.deepEqual(unknown.body, { error: 'Route not found.' });

  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const response = await fetch(`${baseUrl}/api/orders/1`, {
      method,
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'Route not found.' });
  }
});
