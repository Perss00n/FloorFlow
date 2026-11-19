import { createModelClient } from './model.js';
import { createReadPool } from './database.js';
import { createAssistant } from './assistant.js';
import { createUsageBudget } from './usage-budget.js';

export function configureAssistant(env = process.env) {
  const modelClient = createModelClient(env);
  if (!modelClient) return { assistant: null, close: async () => {} };
  const readPool = createReadPool(env);
  if (!readPool) return { assistant: null, close: async () => {} };
  return {
    assistant: createAssistant({ modelClient, model: env.AZURE_FOUNDRY_MODEL, readPool }),
    budget: createUsageBudget({ path: env.AI_BUDGET_FILE }),
    close: () => readPool.end(),
  };
}
