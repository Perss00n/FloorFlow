import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { validateSql } from '../src/assistant/sql.js';
import { createReadPool, executeReadQuery } from '../src/assistant/database.js';
import { createAssistant } from '../src/assistant/assistant.js';

// Deliberately handwritten SQL hypotheses, not historical model output.
const fixture = JSON.parse(readFileSync(new URL('./fixtures/missing-customer-sql.json', import.meta.url), 'utf8'));

test('captured Azure LEFT JOIN ON with a status conjunction remains rejected before database access', async () => {
  const captured = JSON.parse(readFileSync(new URL('./fixtures/captured-missing-customer.json', import.meta.url), 'utf8'));
  let connections = 0;
  const unavailablePool = { connect() { connections++; throw new Error('Must not execute the captured SQL'); } };
  assert.throws(() => validateSql(captured.sql), error => error.status === 422);
  await assert.rejects(executeReadQuery(unavailablePool, captured.sql), error => error.status === 422);
  assert.equal(connections, 0);
  const movedFilter = captured.sql.replace(" AND o.status = 'completed'", '')
    .replace(' GROUP BY', " AND o.status = 'completed' GROUP BY");
  assert.ok(validateSql(movedFilter).text.includes('GROUP BY'));
});

for (const example of fixture.cases) {
  test(`missing-customer SQL boundary: ${example.name}`, async () => {
    if (example.allowed) {
      const query = validateSql(example.sql);
      assert.ok(query.values.includes('Imaginary Moonbase Holdings'));
      assert.ok(!query.text.includes('Imaginary Moonbase Holdings'));
    } else {
      let connections = 0;
      const unavailablePool = { connect() { connections++; throw new Error('Must not connect'); } };
      assert.throws(() => validateSql(example.sql), error => error.status === 422);
      await assert.rejects(executeReadQuery(unavailablePool, example.sql), error => error.status === 422);
      assert.equal(connections, 0);
    }
  });
}

test('a plausible ON-filter model response reproduces the 422 before any database access', async context => {
  context.mock.method(console, 'info', () => {});
  const sql = fixture.cases.find(example => example.id === 'on_filter').sql;
  let mockCalls = 0, connections = 0;
  const assistant = createAssistant({
    model: 'mock-only',
    modelClient: { chat: { completions: { async create() {
      mockCalls++;
      return { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ sql }) } }] };
    } } } },
    readPool: { connect() { connections++; throw new Error('Must not connect'); } },
  });
  await assert.rejects(assistant.chat('How much has Imaginary Moonbase Holdings spent?'), error =>
    error.status === 422 && error.message === 'The generated query could not be verified as safe. Please rephrase your question.');
  assert.equal(mockCalls, 1);
  assert.equal(connections, 0);
});

test('handwritten variants are valid local PostgreSQL and the supported recipe preserves customer totals', async () => {
  // No remote database is allowed for this investigation, even if .env is replaced.
  assert.equal(process.env.PGHOST, '127.0.0.1', 'Local PostgreSQL required');
  assert.equal(process.env.PGDATABASE, 'floorflow');
  const pool = createReadPool();
  assert.ok(pool, 'Existing local floorflow_ai credentials required');
  try {
    assert.equal((await pool.query('SHOW default_transaction_read_only')).rows[0].default_transaction_read_only, 'on');
    for (const example of fixture.cases) {
      // Trusted, fixed SELECTs only: check PostgreSQL validity independently of the app allowlist.
      assert.deepEqual((await pool.query(example.sql)).rows, example.expected, example.id);
      if (example.id !== 'constant_zero') {
        const existing = example.sql.replaceAll('Imaginary Moonbase Holdings', 'Maple Property Group');
        assert.deepEqual((await pool.query(existing)).rows, [{ total_spent_sek: '101536.50' }], example.id + ' with an existing customer');
      }
    }
    const canonical = fixture.cases.find(example => example.id === 'aggregate').sql;
    for (const [name, value] of [
      ['Maple Property Group', '101536.50'], ['Harbor Office Studio', '109000.00'],
      ['Imaginary Moonbase Holdings', '0.00'], ["Imaginary O'Brien Holdings", '0.00'],
    ]) {
      const sql = canonical.replaceAll('Imaginary Moonbase Holdings', name.replaceAll("'", "''"));
      assert.deepEqual((await executeReadQuery(pool, sql)).results, [{ total_spent_sek: value }], name);
    }
    const folded = canonical.replace("c.name = 'Imaginary Moonbase Holdings'", "LOWER(c.name) = LOWER('maple property group')");
    assert.deepEqual((await executeReadQuery(pool, folded)).results, [{ total_spent_sek: '101536.50' }]);
    const captured = JSON.parse(readFileSync(new URL('./fixtures/captured-missing-customer.json', import.meta.url), 'utf8'));
    const joined = captured.sql.replace(" AND o.status = 'completed'", '')
      .replace(' GROUP BY', " AND o.status = 'completed' GROUP BY");
    assert.deepEqual((await executeReadQuery(pool, joined)).results, []);
    const ungrouped = joined.replace('c.name AS name, ', '').replace(' GROUP BY c.name', '');
    assert.deepEqual((await executeReadQuery(pool, ungrouped)).results, [{ total_spending_sek: '0.00' }]);
    // A constant-zero fallback would falsely report zero for Maple; the validator must reject it.
    const invented = fixture.cases.find(example => example.id === 'constant_zero').sql;
    assert.deepEqual((await pool.query(invented)).rows, [{ total_spent_sek: '0.00' }]);
    assert.throws(() => validateSql(invented), error => error.status === 422);
  } finally { await pool.end(); }
});
