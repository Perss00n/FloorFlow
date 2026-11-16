import { pool } from '../src/db.js';

const password = process.env.AI_PGPASSWORD;
if (process.env.AI_PGUSER !== 'floorflow_ai' || !password || password === process.env.PGPASSWORD) {
  console.error('Set AI_PGUSER=floorflow_ai and a separate AI_PGPASSWORD in .env first.');
  await pool.end();
  process.exit(1);
}

const client = await pool.connect();
try {
  await client.query('BEGIN');
  const existing = await client.query("SELECT oid, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls FROM pg_roles WHERE rolname = 'floorflow_ai'");
  if (existing.rowCount === 0) {
    await client.query('CREATE ROLE floorflow_ai LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 3');
  } else {
    const role = existing.rows[0];
    const unsafe = await client.query(`
      SELECT EXISTS (SELECT 1 FROM pg_auth_members WHERE member = $1) OR
             EXISTS (SELECT 1 FROM pg_class WHERE relowner = $1) OR
             EXISTS (SELECT 1 FROM pg_database WHERE datdba = $1) OR
             EXISTS (SELECT 1 FROM pg_namespace WHERE nspowner = $1) AS unsafe
    `, [role.oid]);
    if (unsafe.rows[0].unsafe || Object.entries(role).some(([key, value]) => key !== 'oid' && value)) {
      throw new Error('The existing assistant role has unexpected ownership, membership or administrative rights.');
    }
  }

  // PostgreSQL parameters cannot occupy SQL identifier/password grammar positions.
  // Its own format() safely quotes these values; neither SQL nor passwords are logged.
  const commands = await client.query(`
    SELECT format('ALTER ROLE floorflow_ai LOGIN NOINHERIT CONNECTION LIMIT 3 PASSWORD %L', $1::text) AS password_sql,
           format('REVOKE ALL ON DATABASE %I FROM floorflow_ai', current_database()) AS revoke_sql,
           format('REVOKE CREATE, TEMPORARY ON DATABASE %I FROM PUBLIC', current_database()) AS public_sql,
           format('GRANT CONNECT ON DATABASE %I TO floorflow_ai', current_database()) AS connect_sql
  `, [password]);
  for (const command of Object.values(commands.rows[0])) await client.query(command);
  await client.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
  await client.query('REVOKE ALL ON SCHEMA public FROM floorflow_ai');
  await client.query('GRANT USAGE ON SCHEMA public TO floorflow_ai');
  await client.query('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM floorflow_ai');
  await client.query('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM floorflow_ai');
  await client.query('GRANT SELECT ON public.customers, public.orders, public.order_items, public.articles TO floorflow_ai');
  await client.query("ALTER ROLE floorflow_ai SET default_transaction_read_only = on");
  await client.query("ALTER ROLE floorflow_ai SET search_path = pg_catalog");
  await client.query("ALTER ROLE floorflow_ai SET statement_timeout = '2s'");
  await client.query("ALTER ROLE floorflow_ai SET lock_timeout = '500ms'");
  await client.query("ALTER ROLE floorflow_ai SET idle_in_transaction_session_timeout = '5s'");
  await client.query("ALTER ROLE floorflow_ai SET transaction_timeout = '5s'");
  await client.query("ALTER ROLE floorflow_ai SET work_mem = '4MB'");
  await client.query("ALTER ROLE floorflow_ai SET temp_file_limit = '8MB'");
  await client.query('COMMIT');
  console.log('Configured floorflow_ai with SELECT on the four FloorFlow tables. No seed rows were changed.');
} catch (error) {
  await client.query('ROLLBACK');
  console.error('Assistant database setup failed. Check the admin connection, separate password, and existing role permissions.');
  if (/^[0-9A-Z]{5}$/.test(error.code ?? '')) console.error(`PostgreSQL error code: ${error.code}`);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
