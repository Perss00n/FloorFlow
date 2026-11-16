import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { pool } from '../src/db.js';

after(async () => {
  await pool.end();
});

test('the four tables have the three expected foreign key relationships', async () => {
  const tables = await pool.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  assert.deepEqual(tables.rows.map((row) => row.table_name), [
    'articles', 'customers', 'order_items', 'orders',
  ]);

  const foreignKeys = await pool.query(`
    SELECT conrelid::regclass::text AS source, confrelid::regclass::text AS target
    FROM pg_constraint
    WHERE contype = 'f' AND connamespace = 'public'::regnamespace
    ORDER BY source, target
  `);
  assert.deepEqual(foreignKeys.rows, [
    { source: 'order_items', target: 'articles' },
    { source: 'order_items', target: 'orders' },
    { source: 'orders', target: 'customers' },
  ]);
});

test('the deterministic seed has the expected counts, statuses, and items per order', async () => {
  const counts = await pool.query(`
    SELECT (SELECT COUNT(*)::integer FROM customers) AS customers,
           (SELECT COUNT(*)::integer FROM orders) AS orders,
           (SELECT COUNT(*)::integer FROM articles) AS articles,
           (SELECT COUNT(*)::integer FROM order_items) AS order_items
  `);
  assert.deepEqual(counts.rows[0], { customers: 5, orders: 12, articles: 12, order_items: 48 });

  const statuses = await pool.query(`
    SELECT status, COUNT(*)::integer AS count FROM orders GROUP BY status ORDER BY status
  `);
  assert.deepEqual(statuses.rows, [
    { status: 'cancelled', count: 1 },
    { status: 'completed', count: 8 },
    { status: 'draft', count: 1 },
    { status: 'pending', count: 2 },
  ]);

  const emptyOrders = await pool.query(`
    SELECT o.id FROM orders AS o
    LEFT JOIN order_items AS oi ON oi.order_id = o.id
    GROUP BY o.id HAVING COUNT(oi.id) = 0
  `);
  assert.equal(emptyOrders.rowCount, 0);
});

test('completed sales total 285415.00 SEK using historical line prices', async () => {
  const result = await pool.query(`
    SELECT SUM(ROUND(oi.quantity * oi.unit_price, 2)) AS total
    FROM orders AS o JOIN order_items AS oi ON oi.order_id = o.id
    WHERE o.status = $1
  `, ['completed']);
  assert.equal(result.rows[0].total, '285415.00');
});

test('completed spending identifies the top customer and excludes other statuses', async () => {
  const result = await pool.query(`
    SELECT c.name, SUM(ROUND(oi.quantity * oi.unit_price, 2)) AS total
    FROM customers AS c
    JOIN orders AS o ON o.customer_id = c.id
    JOIN order_items AS oi ON oi.order_id = o.id
    WHERE o.status = $1
    GROUP BY c.id, c.name ORDER BY total DESC, c.id
  `, ['completed']);
  assert.deepEqual(result.rows, [
    { name: 'Harbor Office Studio', total: '109000.00' },
    { name: 'Maple Property Group', total: '101536.50' },
    { name: 'Northside Cafe', total: '42930.00' },
    { name: 'Emma Carter', total: '22007.50' },
    { name: 'Daniel Brooks', total: '9941.00' },
  ]);
});

test('completed orders contain 118.500 square meters of engineered oak', async () => {
  const result = await pool.query(`
    SELECT SUM(oi.quantity) AS quantity
    FROM order_items AS oi
    JOIN orders AS o ON o.id = oi.order_id
    JOIN articles AS a ON a.id = oi.article_id
    WHERE o.status = $1 AND a.sku = $2
  `, ['completed', 'OAK-ENG-14']);
  assert.equal(result.rows[0].quantity, '118.500');
});

// Each invalid update uses a transaction so the seed remains unchanged.
const invalidUpdates = [
  { name: 'missing customer name', sql: 'UPDATE customers SET name = $1 WHERE id = 1', value: null, code: '23502' },
  { name: 'blank customer name', sql: 'UPDATE customers SET name = $1 WHERE id = 1', value: ' ', code: '23514' },
  { name: 'unknown order status', sql: 'UPDATE orders SET status = $1 WHERE id = 1', value: 'paid', code: '23514' },
  { name: 'duplicate order number', sql: 'UPDATE orders SET order_number = $1 WHERE id = 2', value: 'FF-2026-001', code: '23505' },
  { name: 'duplicate article SKU', sql: 'UPDATE articles SET sku = $1 WHERE id = 2', value: 'OAK-ENG-14', code: '23505' },
  { name: 'missing parent customer', sql: 'UPDATE orders SET customer_id = $1 WHERE id = 1', value: -1, code: '23503' },
  { name: 'missing parent order', sql: 'UPDATE order_items SET order_id = $1 WHERE id = 1', value: -1, code: '23503' },
  { name: 'missing parent article', sql: 'UPDATE order_items SET article_id = $1 WHERE id = 1', value: -1, code: '23503' },
  { name: 'zero quantity', sql: 'UPDATE order_items SET quantity = $1 WHERE id = 1', value: '0', code: '23514' },
  { name: 'negative quantity', sql: 'UPDATE order_items SET quantity = $1 WHERE id = 1', value: '-0.001', code: '23514' },
  { name: 'NaN quantity', sql: 'UPDATE order_items SET quantity = $1 WHERE id = 1', value: 'NaN', code: '23514' },
  { name: 'negative line price', sql: 'UPDATE order_items SET unit_price = $1 WHERE id = 1', value: '-0.01', code: '23514' },
  { name: 'NaN line price', sql: 'UPDATE order_items SET unit_price = $1 WHERE id = 1', value: 'NaN', code: '23514' },
  { name: 'negative catalog price', sql: 'UPDATE articles SET unit_price = $1 WHERE id = 1', value: '-0.01', code: '23514' },
  { name: 'NaN catalog price', sql: 'UPDATE articles SET unit_price = $1 WHERE id = 1', value: 'NaN', code: '23514' },
  { name: 'unknown article unit', sql: 'UPDATE articles SET unit = $1 WHERE id = 1', value: 'unknown', code: '23514' },
];

for (const invalidUpdate of invalidUpdates) {
  test(`the database rejects ${invalidUpdate.name}`, async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await assert.rejects(client.query(invalidUpdate.sql, [invalidUpdate.value]), {
        code: invalidUpdate.code,
      });
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
}

test('changing a catalog price leaves historical order prices unchanged', async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE articles SET unit_price = $1 WHERE sku = $2', ['999.00', 'OAK-ENG-14']);
    const result = await client.query(`
      SELECT oi.unit_price AS historical_price, a.unit_price AS current_price
      FROM order_items AS oi JOIN articles AS a ON a.id = oi.article_id
      WHERE oi.order_id = $1 AND a.sku = $2
    `, [1, 'OAK-ENG-14']);
    assert.deepEqual(result.rows[0], { historical_price: '550.00', current_price: '999.00' });
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
});
