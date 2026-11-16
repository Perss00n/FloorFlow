import pg from 'pg';

for (const name of ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD']) {
  if (!process.env[name]) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

// pg reads PGHOST, PGPORT, PGDATABASE, PGUSER, and PGPASSWORD from the environment.
export const pool = new pg.Pool({
  connectionTimeoutMillis: 3000,
  statement_timeout: 3000,
});

// Idle connections can fail outside an awaited query, for example on a DB restart.
pool.on('error', (error) => {
  console.error('Unexpected database connection error:', error.message);
});
