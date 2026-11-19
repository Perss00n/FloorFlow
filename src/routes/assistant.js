import express from 'express';
import { AssistantError } from '../assistant/errors.js';
import { createUsageBudget } from '../assistant/usage-budget.js';
import { createRequestQueue } from '../assistant/request-queue.js';

export function createAssistantRouter(assistant, now = Date.now, { budget = createUsageBudget({ now }), queue = createRequestQueue() } = {}) {
  const router = express.Router();
  const clients = new Map();
  let providerBlockedUntil = 0;

  router.post('/chat', express.json({ limit: '4kb', strict: true }), async (request, response) => {
    response.set('Cache-Control', 'no-store');
    if (!request.is('application/json')) return response.status(415).json({ error: 'Send a JSON object containing a message.' });
    const body = request.body;
    if (!body || Array.isArray(body) || Object.keys(body).length !== 1 || typeof body.message !== 'string' || body.message.trim().length === 0 || body.message.length > 1000) {
      return response.status(400).json({ error: 'Message must contain between 1 and 1000 characters.' });
    }
    if (!assistant) return response.status(503).json({ error: 'The AI assistant is not configured. Azure Foundry and read-only database credentials are required.' });

    const time = now();
    for (const [ip, state] of clients) {
      if (time >= state.until) clients.delete(ip);
    }
    const ip = request.ip;
    const state = clients.get(ip) ?? { count: 0, until: time + 60000 };
    if (state.count >= 12 || (!clients.has(ip) && clients.size >= 100)) {
      response.set('Retry-After', String(Math.max(1, Math.ceil((state.until - time) / 1000))));
      return response.status(429).json({ error: 'The assistant request limit was reached. Please wait before trying again.' });
    }
    clients.set(ip, { count: state.count + 1, until: state.until });
    const controller = new AbortController();
    const disconnected = () => controller.abort();
    response.once('close', disconnected);
    let release;
    try {
      const wait = Math.max(budget.retryAfter(), Math.ceil((providerBlockedUntil - now()) / 1000));
      if (wait > 0) throw new AssistantError(429, 'The assistant request limit was reached. Please wait before trying again.', wait);
      release = await queue.acquire(controller.signal);
      if (response.destroyed) return;
      if (providerBlockedUntil > now()) throw new AssistantError(429, 'The AI service is temporarily rate limited. Please wait before trying again.', Math.ceil((providerBlockedUntil - now()) / 1000));
      budget.reserve();
      response.json(await assistant.chat(body.message.trim()));
    } catch (error) {
      if (response.destroyed) return;
      // Do not log questions, generated SQL, customer results, or provider error bodies.
      if (error instanceof AssistantError) {
        if (error.status === 429) {
          const wait = Number.isSafeInteger(error.retryAfter) && error.retryAfter > 0 && error.retryAfter <= 86400 ? error.retryAfter : 60;
          response.set('Retry-After', String(wait));
          if (error.message.startsWith('The AI service is temporarily rate limited.')) providerBlockedUntil = Math.max(providerBlockedUntil, now() + wait * 1000);
        }
        return response.status(error.status).json({ error: error.message });
      }
      response.status(500).json({ error: 'The assistant could not complete this request. Please try again later.' });
    } finally {
      release?.();
      response.off('close', disconnected);
    }
  });

  router.use((error, request, response, next) => {
    if (error.type === 'entity.too.large') return response.status(413).json({ error: 'The request body is too large.' });
    if (error.type === 'entity.parse.failed') return response.status(400).json({ error: 'The request body must be valid JSON.' });
    next(error);
  });
  return router;
}
