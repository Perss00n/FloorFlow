import { once } from 'node:events';
import { createApp } from './app.js';
import { pool } from './db.js';
import { configureAssistant } from './assistant/config.js';
import { readRuntimeConfig, startupFailureReason } from './runtime.js';
import { createShutdown } from './shutdown.js';

let configured;
let server;
let startupStage = 'configuration';
try {
  const runtime = readRuntimeConfig();
  startupStage = 'database';
  await pool.query('SELECT 1');
  startupStage = 'assistant';
  configured = configureAssistant();
  startupStage = 'application';
  const app = createApp(pool, configured.assistant, runtime);
  startupStage = 'listening';
  server = app.listen(runtime.port, runtime.host);
  await once(server, 'listening');
  console.log(`FloorFlow is listening on ${runtime.host}:${runtime.port}`);

  const shutdown = createShutdown(server, async () => {
    await Promise.all([pool.end(), configured.close()]);
  });
  const stop = () => shutdown().catch(() => {
    console.error('FloorFlow could not close its resources cleanly.');
    process.exit(1);
  });
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
} catch (error) {
  // Never print provider/database errors or configuration values (which may be secrets).
  console.error(`Cannot start FloorFlow. stage=${startupStage} reason=${startupFailureReason(error)}.`);
  server?.close();
  await Promise.allSettled([pool.end(), configured?.close()]);
  process.exitCode = 1;
}
