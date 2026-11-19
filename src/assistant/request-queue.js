import { AssistantError } from './errors.js';

export function createRequestQueue({ concurrency = 2, capacity = 4, waitMillis = 5000 } = {}) {
  let active = 0;
  const waiting = [];
  const busy = () => new AssistantError(429, 'The assistant is busy. Please wait before trying again.', 5);

  function release() {
    active -= 1;
    const entry = waiting.shift();
    if (entry) {
      entry.cleanup();
      active += 1;
      entry.resolve(onceRelease());
    }
  }
  function onceRelease() {
    let released = false;
    return () => { if (!released) { released = true; release(); } };
  }

  return {
    acquire(signal) {
      if (signal?.aborted) return Promise.reject(busy());
      if (active < concurrency) { active += 1; return Promise.resolve(onceRelease()); }
      if (waiting.length >= capacity) return Promise.reject(busy());
      return new Promise((resolve, reject) => {
        const cancel = () => {
          const index = waiting.indexOf(entry);
          if (index === -1) return;
          waiting.splice(index, 1);
          entry.cleanup();
          reject(busy());
        };
        const timer = setTimeout(cancel, waitMillis);
        const entry = { resolve, cleanup() { clearTimeout(timer); signal?.removeEventListener('abort', cancel); } };
        waiting.push(entry);
        signal?.addEventListener('abort', cancel, { once: true });
      });
    },
  };
}
