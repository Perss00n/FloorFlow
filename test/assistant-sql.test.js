import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateSql } from '../src/assistant/sql.js';
import { schemaSql, tableColumns } from '../src/assistant/schema.js';

test('the assistant reads the actual schema and derives approved column names', () => {
  assert.match(schemaSql, /CREATE TABLE order_items/);
  assert.equal(tableColumns.size, 4);
  assert.ok(tableColumns.get('order_items').has('unit_price'));
});

test('safe SELECT queries are regenerated, qualified, parameterized and bounded', () => {
  const query = validateSql("SELECT c.name FROM customers c WHERE c.name ILIKE '%Maple%' ORDER BY c.name");
  assert.match(query.text, /public.customers/);
  assert.match(query.text, /\$1/);
  assert.match(query.text, /LIMIT \(51\)/);
  assert.ok(!query.text.includes('Maple'));
  assert.deepEqual(query.values, ['%Maple%']);
  assert.match(validateSql('SELECT id FROM customers LIMIT 5').text, /LIMIT \(5\)/);
  assert.match(validateSql('SELECT id FROM customers LIMIT 1000000').text, /LIMIT \(51\)/);
});

test('live model schema.table.column output stays rejected and the instructed alias form stays bounded', () => {
  const rejectedSql = "SELECT ROUND(COALESCE(SUM(ROUND(public.order_items.quantity * public.order_items.unit_price, 2)), 0), 2) AS total_revenue_sek FROM public.order_items INNER JOIN public.orders ON public.order_items.order_id = public.orders.id WHERE public.orders.status = 'completed';";
  assert.throws(() => validateSql(rejectedSql), (error) => error.status === 422);
  const query = validateSql("SELECT ROUND(COALESCE(SUM(ROUND(oi.quantity * oi.unit_price, 2)), 0), 2) AS total_revenue_sek FROM public.order_items AS oi INNER JOIN public.orders AS o ON oi.order_id = o.id WHERE o.status = 'completed'");
  assert.deepEqual(query.values, ['completed']);
  assert.match(query.text, /public.order_items/);
  assert.match(query.text, /public.orders/);
  assert.match(query.text, /LIMIT \(51\)/);
});

test('semicolons, comments and quotes in string values remain bound data', () => {
  const query = validateSql("SELECT name FROM customers WHERE name = 'O''Brien; DROP TABLE customers; --'");
  assert.deepEqual(query.values, ["O'Brien; DROP TABLE customers; --"]);
  assert.ok(!query.text.includes('DROP'));
  const commented = validateSql('SELECT name FROM customers /* harmless */; -- trailing comment');
  assert.ok(!commented.text.includes('comment'));
});

const rejected = [
  '', 'SELECT', 'SELECT name FROM customers; SELECT name FROM articles',
  'INSERT INTO customers(name) VALUES (\'x\')', 'UPDATE customers SET name=\'x\'',
  'DELETE FROM customers', 'MERGE INTO customers USING orders ON true WHEN MATCHED THEN DELETE',
  'DROP TABLE customers', 'ALTER TABLE customers ADD x int', 'CREATE TABLE x(id int)',
  'TRUNCATE customers', 'COPY customers TO STDOUT', 'VACUUM customers', 'EXPLAIN SELECT * FROM customers',
  'SET ROLE postgres', 'SHOW ALL', 'BEGIN', 'DO $$BEGIN END$$',
  'SELECT * FROM customers', 'SELECT 999 AS total_sales_sek FROM orders',
  'SELECT SUM(1) AS total FROM orders', 'SELECT 1',
  'SELECT rolpassword FROM pg_catalog.pg_authid', 'SELECT table_name FROM information_schema.tables',
  'SELECT name FROM other.customers', 'SELECT id FROM private_records',
  'SELECT ctid FROM customers', 'SELECT tableoid FROM customers',
  'SELECT public.pg_sleep(1) AS value FROM customers', 'SELECT pg_sleep(1) AS value FROM customers',
  'SELECT pg_read_file(\'/etc/passwd\') AS value FROM customers',
  'SELECT set_config(\'statement_timeout\',\'0\',false) AS value FROM customers',
  'SELECT pg_advisory_lock(1) AS value FROM customers',
  'SELECT nextval(\'customers_id_seq\') AS value FROM customers',
  'SELECT dblink(\'host=evil\',\'SELECT 1\') AS value FROM customers',
  'SELECT repeat(name,1000000) AS value FROM customers',
  'SELECT name::regclass AS value FROM customers', 'SELECT name::text AS value FROM customers',
  'SELECT name COLLATE "C" FROM customers', 'SELECT name FROM customers FOR UPDATE',
  'SELECT name INTO TEMP stolen FROM customers',
  'SELECT (SELECT rolname FROM pg_roles LIMIT 1) AS value FROM customers',
  'SELECT name FROM (SELECT name FROM customers) c',
  'WITH x AS (DELETE FROM customers RETURNING *) SELECT name FROM x',
  'WITH RECURSIVE x AS (SELECT 1) SELECT * FROM x',
  'SELECT name FROM customers UNION SELECT name FROM articles',
  'SELECT name FROM customers c CROSS JOIN orders o',
  'SELECT c.name FROM customers c JOIN orders o ON true',
  'SELECT c.name FROM customers c JOIN orders o ON c.id=o.id',
  'SELECT c.name FROM customers c, orders o',
  'SELECT a.name FROM customers a JOIN customers b ON a.id=b.id',
  'SELECT COUNT(*) OVER () AS value FROM customers',
  'SELECT COUNT(*) FILTER(WHERE true) AS value FROM customers',
  'SELECT CASE WHEN true THEN name END AS value FROM customers',
  'SELECT id FROM customers ORDER BY id USING OPERATOR(public.<)',
  'SELECT id FROM customers LIMIT 5 OFFSET 1',
  'SELECT id FROM customers WHERE id = $1',
  'SELECT id FROM customers WHERE id = 1.1234567890123456789',
  'SELECT id FROM customers WHERE id = 9007199254740993',
  'SELECT id AS same, name AS same FROM customers',
  'SELECT id AS "bad;alias" FROM customers',
  'SELECT U&"name" FROM customers',
  'SELECT name FROM customers WHERE name = E\'back\\\\slash\'',
  'SELECT SUM(quantity) AS total FROM order_items ORDER BY pg_sleep(1)',
  'SELECT name FROM customers WHERE name ~ \'(a+)+$\'',
  'SELECT name FROM customers WHERE name = \'x\'; /* hidden */ DELETE FROM customers',
  `SELECT ${'('.repeat(41)}id${')'.repeat(41)} FROM customers`,
  `SELECT name FROM customers WHERE name = '${'a'.repeat(201)}'`,
  'x'.repeat(6001),
];

for (const sql of rejected) {
  test(`SQL policy rejects ${sql.slice(0, 90) || 'empty input'}`, () => {
    assert.throws(() => validateSql(sql), (error) => error.status === 422);
  });
}

test('ordinary aggregation, DISTINCT counts, HAVING and NULL checks are supported', () => {
  const query = validateSql(`
    SELECT c.name AS customer, COUNT(DISTINCT o.id) AS order_count
    FROM customers c LEFT JOIN orders o ON o.customer_id=c.id
    WHERE c.email IS NOT NULL GROUP BY c.id,c.name HAVING COUNT(*) > 0
    ORDER BY order_count DESC LIMIT 5
  `);
  assert.match(query.text, /LEFT JOIN public.orders/);
});

test('nonzero numeric literals that underflow inside the parser fail closed', () => {
  const tiny = `0.${'0'.repeat(330)}1`;
  for (const literal of [tiny, `-${tiny}`, `+${tiny}`]) {
    assert.throws(() => validateSql(`SELECT COUNT(*) AS n FROM customers WHERE ${literal} > 0`), (error) => error.status === 422);
  }
  for (const literal of ['0.00', '.00', '0.', '-0.00']) {
    assert.match(validateSql(`SELECT COUNT(*) AS n FROM customers WHERE ${literal} = 0`).text, /LIMIT/);
  }
});

for (const sql of [
  'SELECT name FROM customers TABLESAMPLE SYSTEM(1)',
  'SELECT name FROM ONLY customers',
  'SELECT name FROM customers UNION ALL SELECT name FROM articles',
  'SELECT public.round(unit_price,2) AS price FROM articles',
  'SELECT id FROM customers WHERE id OPERATOR(pg_catalog.=) 1',
  'SELECT id FROM customers FETCH FIRST 1 ROWS WITH TIES',
  'SELECT name FROM customers FOR SHARE SKIP LOCKED',
  'SELECT name FROM customers WHERE false OR pg_sleep(1) IS NULL',
  'SELECT name FROM customers WHERE true AND set_config(\'role\',\'floorflow\',false) IS NULL',
  'SELECT name FROM customers LIMIT ALL',
]) {
  test(`additional SQL boundary rejects ${sql}`, () => {
    assert.throws(() => validateSql(sql), (error) => error.status === 422);
  });
}
