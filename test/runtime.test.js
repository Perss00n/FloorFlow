import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readRuntimeConfig, startupFailureReason } from '../src/runtime.js';

const production = {
  NODE_ENV: 'production', PREVIEW_USERNAME: 'reviewer',
  PREVIEW_PASSWORD: 'test-only-long-password', PGSSLMODE: 'verify-full',
};

test('startup diagnostics classify known failures without reflecting error details', () => {
  const cases = {
    '28P01': 'database-authentication-failed', '28000': 'database-authorization-failed',
    '3D000': 'database-missing', ENOTFOUND: 'dns-failed', EAI_AGAIN: 'dns-failed',
    ECONNREFUSED: 'connection-refused', ECONNRESET: 'connection-reset', ETIMEDOUT: 'connection-timeout',
    EADDRINUSE: 'address-in-use', EACCES: 'permission-denied',
    CERT_HAS_EXPIRED: 'tls-verification-failed', DEPTH_ZERO_SELF_SIGNED_CERT: 'tls-verification-failed',
    SELF_SIGNED_CERT_IN_CHAIN: 'tls-verification-failed', UNABLE_TO_GET_ISSUER_CERT: 'tls-verification-failed',
    UNABLE_TO_GET_ISSUER_CERT_LOCALLY: 'tls-verification-failed',
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'tls-verification-failed', ERR_TLS_CERT_ALTNAME_INVALID: 'tls-verification-failed',
  };
  for (const [code, reason] of Object.entries(cases)) {
    assert.equal(startupFailureReason({ code, message: 'secret-password SELECT private_data',
      cause: new Error('secret-provider-details') }), reason);
  }
  assert.equal(startupFailureReason(new Error('Connection terminated due to connection timeout')), 'connection-timeout');
  for (const error of [undefined, null, new Error('secret-password'),
    { code: 'secret-token', message: 'SELECT private_data', cause: { code: '28P01' } }]) {
    assert.equal(startupFailureReason(error), 'unclassified');
  }
});

test('runtime defaults preserve local behavior and allow host/port overrides', () => {
  const local = readRuntimeConfig({});
  assert.equal(local.host, '127.0.0.1');
  assert.equal(local.port, 3000);
  assert.equal(local.trustedProxies, false);
  assert.equal(local.preview.requireHttps, false);
  assert.equal(readRuntimeConfig({ HOST: '::1', PORT: '4567' }).host, '::1');
  assert.equal(readRuntimeConfig({ HOST: 'localhost', PORT: '4567' }).port, 4567);
});

test('production listens on all interfaces and requires preview credentials and verified database TLS', () => {
  const config = readRuntimeConfig(production);
  assert.equal(config.host, '0.0.0.0');
  assert.equal(config.preview.requireHttps, true);
  assert.throws(() => readRuntimeConfig({ NODE_ENV: 'production' }), /preview credentials/);
  for (const PGSSLMODE of ['', 'require', 'no-verify', 'disable']) {
    assert.throws(() => readRuntimeConfig({ ...production, PGSSLMODE }), /verified PostgreSQL TLS/);
  }
  assert.equal(readRuntimeConfig({ ...production, HOST: '127.0.0.1' }).host, '127.0.0.1');
});

test('partial, invalid, and weak production credentials fail without exposing their values', () => {
  for (const env of [
    { PREVIEW_USERNAME: 'reviewer' }, { PREVIEW_PASSWORD: 'sensitive-value' },
    { PREVIEW_USERNAME: 'a:b', PREVIEW_PASSWORD: 'sensitive-value' },
    { PREVIEW_USERNAME: 'reviewer', PREVIEW_PASSWORD: '\nsecret' },
    { PREVIEW_USERNAME: 'reviewer', PREVIEW_PASSWORD: ' ' },
    { PREVIEW_USERNAME: 'reviewer', PREVIEW_PASSWORD: 'x'.repeat(257) },
    { ...production, PREVIEW_PASSWORD: 'short' },
  ]) assert.throws(() => readRuntimeConfig(env), (error) => error.message.includes('preview credentials') && !error.message.includes('sensitive-value'));
});

test('invalid environment, host, and port configuration is rejected', () => {
  for (const env of [
    { NODE_ENV: 'prodution' }, { HOST: 'http://localhost' }, { HOST: 'invalid.example' },
    { PORT: '' }, { PORT: '0' }, { PORT: '-1' }, { PORT: '65536' }, { PORT: '1.5' }, { PORT: 'invalid' },
  ]) assert.throws(() => readRuntimeConfig(env));
});

test('proxy trust accepts explicit networks and refuses arbitrary header trust', () => {
  const config = readRuntimeConfig({ TRUST_PROXY: 'loopback, 10.1.0.0/16, 192.0.2.1, ::1/128' });
  assert.deepEqual(config.trustedProxies, ['loopback', '10.1.0.0/16', '192.0.2.1', '::1/128']);
  assert.equal(readRuntimeConfig({ TRUST_PROXY: 'false' }).trustedProxies, false);
  for (const TRUST_PROXY of ['true', '1', '0.0.0.0/0', '::/0', '10.0.0.0/33', '::1/129', '10.0.0.1/-1', 'loopback,', 'unknown', '::1/128/1']) {
    assert.throws(() => readRuntimeConfig({ TRUST_PROXY }), /TRUST_PROXY/);
  }
});
