import { isIP } from 'node:net';

// Opt-in, bounded metadata only. No endpoint or authentication bypass.
// Read through the existing container console after a separately approved deployment.
export function proxyDiagnostics(log = console.log) {
  let remaining = 12;
  return (request, response, next) => {
    const probe = request.get('X-FloorFlow-Proxy-Probe');
    if (remaining > 0 && request.method === 'GET' && request.path === '/health'
      && ['baseline', 'spoof-http', 'spoof-list', 'spoof-forwarded'].includes(probe)) {
      remaining -= 1;
      const protocol = request.get('X-Forwarded-Proto');
      log(JSON.stringify({ event: 'floorflow-proxy-probe', probe,
        peer: isIP(request.socket.remoteAddress) ? request.socket.remoteAddress : 'unknown',
        socketTls: request.socket.encrypted === true,
        forwardedProto: ['https', 'http'].includes(protocol) ? protocol
          : protocol === undefined ? 'missing' : protocol.includes(',') ? 'multiple' : 'other' }));
    }
    next();
  };
}
