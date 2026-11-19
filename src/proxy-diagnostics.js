import { isIP } from 'node:net';
import { createHmac, randomBytes } from 'node:crypto';

// Opt-in, bounded metadata only. No endpoint or authentication bypass.
// Read through the existing container console after a separately approved deployment.
export function proxyDiagnostics(log = console.log) {
  let remaining = 12;
  const salt = randomBytes(32);
  const normalized = (ip) => typeof ip === 'string' && ip.startsWith('::ffff:') && isIP(ip.slice(7)) === 4 ? ip.slice(7) : ip;
  return (request, response, next) => {
    const probe = request.get('X-FloorFlow-Proxy-Probe');
    if (remaining > 0 && request.method === 'GET' && request.path === '/health'
      && ['baseline', 'spoof-http', 'spoof-list', 'spoof-forwarded'].includes(probe)) {
      remaining -= 1;
      const protocol = request.get('X-Forwarded-Proto');
      const client = normalized(request.ip);
      const cloudflare = normalized(request.get('CF-Connecting-IP'));
      const ray = request.get('CF-Ray');
      log(JSON.stringify({ event: 'floorflow-proxy-probe', probe,
        peer: isIP(request.socket.remoteAddress) ? request.socket.remoteAddress : 'unknown',
        clientId: isIP(client ?? '') ? createHmac('sha256', salt).update(client).digest('hex').slice(0, 16) : 'unknown',
        cloudflareClientMatches: isIP(client ?? '') !== 0 && client === cloudflare,
        ray: typeof ray === 'string' && /^[a-f0-9]{16}-[A-Z]{3}$/.test(ray) ? ray.slice(0, 16) : 'unknown',
        socketTls: request.socket.encrypted === true,
        forwardedProto: ['https', 'http'].includes(protocol) ? protocol
          : protocol === undefined ? 'missing' : protocol.includes(',') ? 'multiple' : 'other' }));
    }
    next();
  };
}
