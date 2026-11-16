import { createApp } from './app.js';
import { pool } from './db.js';

const port = Number(process.env.PORT ?? 3000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

try {
  await pool.query('SELECT 1');
} catch (error) {
  console.error('Cannot start FloorFlow: database connection failed.', error.message);
  await pool.end();
  process.exit(1);
}

const app = createApp(pool);
const server = app.listen(port, '127.0.0.1', () => {
  console.log(`FloorFlow is running at http://127.0.0.1:${port}`);
});

server.on('error', async (error) => {
  console.error('Cannot start the HTTP server:', error.message);
  await pool.end();
  process.exitCode = 1;
});

// Stop accepting requests before closing the shared database pool.
function shutdown() {
  server.close(async () => {
    await pool.end();
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
