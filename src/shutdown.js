// A second signal reuses the same cleanup. A deadline also bounds stuck requests
// or pool cleanup; the process owns the final forced-exit decision.
export function createShutdown(server, closeResources, { timeoutMs = 10000, onTimeout = () => process.exit(1) } = {}) {
  let pending;
  return function shutdown() {
    if (pending) return pending;
    pending = (async () => {
      const deadline = setTimeout(() => {
        server.closeAllConnections();
        onTimeout();
      }, timeoutMs);
      try {
        await new Promise((resolve, reject) => server.close((error) => {
          if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') reject(error);
          else resolve();
        }));
        await closeResources();
      } finally {
        clearTimeout(deadline);
      }
    })();
    return pending;
  };
}
