import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { AssistantError } from './errors.js';

// One Node process owns this file. Only aggregate counts are persisted, never IPs/questions.
export function createUsageBudget({ path, now = Date.now, hourlyLimit = 100, dailyLimit = 200 } = {}) {
  let state;
  let unavailable = false;
  if (path) {
    try {
      state = JSON.parse(readFileSync(path, 'utf8'));
      if (!state || Object.keys(state).sort().join(',') !== 'day,dayCount,hour,hourCount,version'
        || state.version !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(state.day)
        || !/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(state.hour) || !state.hour.startsWith(state.day)
        || !Number.isSafeInteger(state.dayCount) || state.dayCount < 0 || state.dayCount > dailyLimit
        || !Number.isSafeInteger(state.hourCount) || state.hourCount < 0 || state.hourCount > hourlyLimit
        || state.hourCount > state.dayCount) unavailable = true;
    } catch (error) {
      if (error.code !== 'ENOENT') unavailable = true;
    }
  }

  function current() {
    if (unavailable) throw new AssistantError(503, 'The assistant usage budget is unavailable. Please try again later.');
    const time = new Date(now());
    const day = time.toISOString().slice(0, 10);
    const hour = time.toISOString().slice(0, 13);
    // A clock rollback must not silently reset a cost limit.
    if (state && (state.day > day || state.hour > hour)) {
      throw new AssistantError(503, 'The assistant usage budget is unavailable. Please try again later.');
    }
    return { version: 1, day, hour, dayCount: state?.day === day ? state.dayCount : 0,
      hourCount: state?.hour === hour ? state.hourCount : 0 };
  }

  function retryAfter(value) {
    if (value.dayCount >= dailyLimit) return Math.max(1, Math.ceil((Date.parse(value.day) + 86400000 - now()) / 1000));
    if (value.hourCount >= hourlyLimit) return Math.max(1, Math.ceil((Date.parse(value.hour + ':00:00Z') + 3600000 - now()) / 1000));
    return 0;
  }

  return {
    retryAfter: () => retryAfter(current()),
    reserve() {
      const next = current();
      const wait = retryAfter(next);
      if (wait) throw new AssistantError(429, 'The assistant request limit was reached. Please wait before trying again.', wait);
      next.dayCount += 1;
      next.hourCount += 1;
      if (path) {
        try {
          // Write before dispatch: a crash may overcount one request but cannot grant a free one.
          writeFileSync(path + '.tmp', JSON.stringify(next) + '\n', { mode: 0o600, flush: true });
          renameSync(path + '.tmp', path);
        } catch {
          unavailable = true;
          throw new AssistantError(503, 'The assistant usage budget is unavailable. Please try again later.');
        }
      }
      state = next;
    },
  };
}
