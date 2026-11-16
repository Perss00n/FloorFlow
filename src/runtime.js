import { isIP } from 'node:net';

// Process configuration stays separate from createApp so HTTP tests need no secrets.
export function readRuntimeConfig(env = process.env) {
  const environment = env.NODE_ENV || 'development';
  if (!['development', 'test', 'production'].includes(environment)) {
    throw new Error('NODE_ENV must be development, test, or production.');
  }
  const production = environment === 'production';
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  const host = env.HOST || (production ? '0.0.0.0' : '127.0.0.1');
  if (host !== 'localhost' && !isIP(host)) {
    throw new Error('HOST must be an IP address or localhost.');
  }

  const username = env.PREVIEW_USERNAME || '';
  const password = env.PREVIEW_PASSWORD || '';
  if ((username || password || production) &&
      (!/^[A-Za-z0-9._-]{1,64}$/.test(username) || !password.trim() ||
       password.length > 256 || /[\x00-\x1f\x7f]/.test(password) ||
       (production && password.length < 16))) {
    throw new Error('Set both preview credentials; production requires a password of at least 16 characters.');
  }
  if (production && env.PGSSLMODE !== 'verify-full') {
    throw new Error('Production requires PGSSLMODE=verify-full for verified PostgreSQL TLS.');
  }

  // Trust named proxy networks, never an arbitrary forwarded header or hop count.
  let trustedProxies = false;
  if (env.TRUST_PROXY && env.TRUST_PROXY !== 'false') {
    trustedProxies = env.TRUST_PROXY.split(',').map((value) => value.trim());
    for (const value of trustedProxies) {
      if (value === 'loopback') continue;
      const [address, prefix, extra] = value.split('/');
      const version = isIP(address);
      if (!version || extra !== undefined || (prefix !== undefined &&
          (!/^\d+$/.test(prefix) || Number(prefix) < 1 || Number(prefix) > (version === 4 ? 32 : 128)))) {
        throw new Error('TRUST_PROXY must contain loopback or explicit proxy IP addresses/CIDRs.');
      }
    }
  }
  return { port, host, trustedProxies, preview: { username, password, requireHttps: production } };
}
