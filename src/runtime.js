import { isIP } from 'node:net';

// Return only fixed labels. Never reflect a provider's message, code, or cause.
export function startupFailureReason(error) {
  switch (error?.code) {
    case '28P01': return 'database-authentication-failed';
    case '28000': return 'database-authorization-failed';
    case '3D000': return 'database-missing';
    case 'ENOTFOUND':
    case 'EAI_AGAIN': return 'dns-failed';
    case 'ECONNREFUSED': return 'connection-refused';
    case 'ECONNRESET': return 'connection-reset';
    case 'ETIMEDOUT': return 'connection-timeout';
    case 'EADDRINUSE': return 'address-in-use';
    case 'EACCES': return 'permission-denied';
    case 'CERT_HAS_EXPIRED':
    case 'DEPTH_ZERO_SELF_SIGNED_CERT':
    case 'SELF_SIGNED_CERT_IN_CHAIN':
    case 'UNABLE_TO_GET_ISSUER_CERT':
    case 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY':
    case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
    case 'ERR_TLS_CERT_ALTNAME_INVALID': return 'tls-verification-failed';
    default:
      // pg's connection deadline can arrive without a code.
      return error?.message === 'Connection terminated due to connection timeout'
        ? 'connection-timeout' : 'unclassified';
  }
}

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
  if (env.PROXY_DIAGNOSTICS && !['off', 'on'].includes(env.PROXY_DIAGNOSTICS)) {
    throw new Error('PROXY_DIAGNOSTICS must be off or on.');
  }
  return { port, host, trustedProxies, diagnoseProxy: env.PROXY_DIAGNOSTICS === 'on',
    preview: { username, password, requireHttps: production } };
}
