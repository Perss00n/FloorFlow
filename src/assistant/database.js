import pg from 'pg';
import { AssistantError } from './errors.js';
import { maxRows, validateSql } from './sql.js';

export function createReadPool(env = process.env) {
  if (env.AI_PGUSER !== 'floorflow_ai' || !env.AI_PGPASSWORD || env.AI_PGUSER === env.PGUSER || env.AI_PGPASSWORD === env.PGPASSWORD) {
    return null;
  }
  const pool = new pg.Pool({
    host: env.PGHOST, port: env.PGPORT, database: env.PGDATABASE,
    user: env.AI_PGUSER, password: env.AI_PGPASSWORD,
    max: 2, connectionTimeoutMillis: 2000, statement_timeout: 2000, query_timeout: 4000,
    options: '-c default_transaction_read_only=on -c search_path=pg_catalog',
  });
  pool.on('error', () => console.error('An assistant database connection was closed.'));
  return pool;
}

async function verifyRole(client) {
  const identity = await client.query(`
    SELECT current_user AS name, r.rolsuper, r.rolcreatedb, r.rolcreaterole,
           r.rolreplication, r.rolbypassrls,
           EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members WHERE member = r.oid) AS memberships,
           has_database_privilege(current_user, current_database(), 'CREATE,TEMPORARY') AS database_write,
           has_schema_privilege(current_user, 'public', 'CREATE') AS schema_write
    FROM pg_catalog.pg_roles AS r WHERE r.rolname = current_user
  `);
  const role = identity.rows[0];
  if (!role || role.name !== 'floorflow_ai' || Object.entries(role).some(([key, value]) => key !== 'name' && value)) {
    throw new AssistantError(503, 'The assistant database permissions are not configured safely.');
  }
  const privileges = await client.query(`
    SELECT bool_and(has_table_privilege(current_user, name, 'SELECT')
      AND NOT has_table_privilege(current_user, name, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')) AS safe
    FROM unnest(ARRAY['public.customers','public.orders','public.order_items','public.articles']) AS name
  `);
  if (privileges.rows[0].safe !== true) {
    throw new AssistantError(503, 'The assistant database permissions are not configured safely.');
  }
}

export async function executeReadQuery(pool, sql) {
  const query = validateSql(sql);
  let client;
  let discard = false;
  try {
    client = await pool.connect();
    await verifyRole(client);
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL search_path = pg_catalog");
    await client.query("SET LOCAL standard_conforming_strings = on");
    await client.query("SET LOCAL statement_timeout = '2s'");
    await client.query("SET LOCAL lock_timeout = '500ms'");
    await client.query("SET LOCAL work_mem = '4MB'");
    // Extended protocol also rejects multiple statements at the PostgreSQL boundary.
    const result = await client.query({ ...query, queryMode: 'extended', rowMode: 'array' });
    const columns = result.fields.map((field) => field.name);
    const results = result.rows.slice(0, maxRows).map((row) => Object.fromEntries(columns.map((name, index) => {
      const value = row[index];
      if (value instanceof Date) return [name, value.toISOString()];
      if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) {
        throw new AssistantError(422, 'The query returned an unsupported value. Please ask a simpler question.');
      }
      return [name, value];
    })));
    const output = { columns, results, truncated: result.rows.length > maxRows };
    if (Buffer.byteLength(JSON.stringify(output), 'utf8') > 32000) {
      throw new AssistantError(422, 'The result is too large to display. Please ask a more specific question.');
    }
    return { sql: query.text, ...output };
  } catch (error) {
    if (error instanceof AssistantError) throw error;
    if (['57014', '55P03'].includes(error.code)) {
      throw new AssistantError(504, 'The database query took too long. Please ask a more specific question.');
    }
    throw new AssistantError(503, 'The assistant could not read the database. Please try again later.');
  } finally {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch {
        discard = true;
      }
      client.release(discard);
    }
  }
}
