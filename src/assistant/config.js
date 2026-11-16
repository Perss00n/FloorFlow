import { createModelClient } from './model.js';
import { createReadPool } from './database.js';
import { createAssistant } from './assistant.js';

export function configureAssistant(env = process.env) {
  const modelClient = createModelClient(env);
  if (!modelClient) return { assistant: null, close: async () => {} };
  const readPool = createReadPool(env);
  if (!readPool) return { assistant: null, close: async () => {} };
  return {
    assistant: createAssistant({ modelClient, model: env.AZURE_FOUNDRY_MODEL, readPool }),
    close: () => readPool.end(),
  };
}
