import { createHash, timingSafeEqual } from 'node:crypto';

function digest(value) {
  return createHash('sha256').update(value).digest();
}

export function previewAuth({ username = '', password = '', requireHttps = false } = {}) {
  if (!username && !password && !requireHttps) return (request, response, next) => next();
  if (!username || !password) throw new Error('Both preview credentials are required.');
  const expected = digest(`${username}:${password}`);

  return (request, response, next) => {
    response.set('Cache-Control', 'no-store');
    response.vary('Authorization');
    // req.secure consults forwarded headers only for explicitly trusted proxies.
    // Reject ambiguous multi-hop protocol headers rather than picking one value.
    const secure = request.secure && (request.socket.encrypted || request.get('X-Forwarded-Proto') === 'https');
    if (requireHttps && !secure) {
      return response.status(426).json({ error: 'HTTPS is required for preview access.' });
    }
    if (requireHttps) response.set('Strict-Transport-Security', 'max-age=31536000');

    const authorization = request.get('Authorization') || '';
    const match = authorization.length <= 2048 && /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(authorization);
    if (match) {
      const credentials = Buffer.from(match[1], 'base64');
      // Buffer decoding is permissive; require canonical Base64 before comparison.
      if (credentials.toString('base64') === match[1] && timingSafeEqual(digest(credentials), expected)) return next();
    }
    response.set('WWW-Authenticate', 'Basic realm="FloorFlow preview", charset="UTF-8"');
    return response.status(401).json({ error: 'Preview authentication is required.' });
  };
}
