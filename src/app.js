import express from 'express';
import { fileURLToPath } from 'node:url';
import { createCustomerRouter } from './routes/customers.js';
import { createOrderRouter } from './routes/orders.js';
import { createAssistantRouter } from './routes/assistant.js';

export function createApp(database, assistant = null) {
  const app = express();

  app.get('/health', async (request, response) => {
    try {
      await database.query('SELECT 1');
      response.json({ status: 'ok', database: 'connected' });
    } catch {
      response.status(503).json({ status: 'unavailable', database: 'disconnected' });
    }
  });

  app.use('/api/customers', createCustomerRouter(database));
  app.use('/api/orders', createOrderRouter(database));
  app.use('/api/assistant', createAssistantRouter(assistant));

  const publicDirectory = fileURLToPath(new URL('../public/', import.meta.url));
  app.use(express.static(publicDirectory, { dotfiles: 'ignore' }));

  app.use((request, response) => {
    response.status(404).json({ error: 'Route not found.' });
  });

  // Express 5 forwards rejected async handlers here; all four arguments are required.
  app.use((error, request, response, next) => {
    if (response.headersSent) {
      return next(error);
    }

    if (error instanceof URIError) {
      return response.status(400).json({ error: 'Invalid URL encoding.' });
    }

    console.error('API request failed:', error.message);
    response.status(500).json({ error: 'Internal server error.' });
  });

  return app;
}
