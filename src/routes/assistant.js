import express from 'express';
import { AssistantError } from '../assistant/errors.js';

export function createAssistantRouter(assistant, now = Date.now) {
  const router = express.Router();
  const clients = new Map();
  let hourStart = now();
  let hourlyRequests = 0;
  let busy = false;

  router.post('/chat', express.json({ limit: '4kb', strict: true }), async (request, response) => {
    response.set('Cache-Control', 'no-store');
    if (!request.is('application/json')) return response.status(415).json({ error: 'Send a JSON object containing a message.' });
    const body = request.body;
    if (!body || Array.isArray(body) || Object.keys(body).length !== 1 || typeof body.message !== 'string' || body.message.trim().length === 0 || body.message.length > 1000) {
      return response.status(400).json({ error: 'Message must contain between 1 and 1000 characters.' });
    }
    if (!assistant) return response.status(503).json({ error: 'The AI assistant is not configured. Azure Foundry and read-only database credentials are required.' });

    const time = now();
    if (time - hourStart >= 3600000) { hourStart = time; hourlyRequests = 0; }
    for (const [ip, state] of clients) {
      if (time >= state.until) clients.delete(ip);
    }
    const ip = request.ip;
    const state = clients.get(ip) ?? { count: 0, until: time + 60000 };
    if (busy || hourlyRequests >= 30 || state.count >= 5 || (!clients.has(ip) && clients.size >= 100)) {
      response.set('Retry-After', String(hourlyRequests >= 30 ? Math.max(1, Math.ceil((hourStart + 3600000 - time) / 1000)) : 60));
      return response.status(429).json({ error: 'The assistant request limit was reached. Please wait before trying again.' });
    }
    clients.set(ip, { count: state.count + 1, until: state.until });
    hourlyRequests += 1;
    busy = true;
    try {
      response.json(await assistant.chat(body.message.trim()));
    } catch (error) {
      // Do not log questions, generated SQL, customer results, or provider error bodies.
      if (error instanceof AssistantError) return response.status(error.status).json({ error: error.message });
      response.status(500).json({ error: 'The assistant could not complete this request. Please try again later.' });
    } finally {
      busy = false;
    }
  });

  router.use((error, request, response, next) => {
    if (error.type === 'entity.too.large') return response.status(413).json({ error: 'The request body is too large.' });
    if (error.type === 'entity.parse.failed') return response.status(400).json({ error: 'The request body must be valid JSON.' });
    next(error);
  });
  return router;
}
