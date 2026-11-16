import assert from 'node:assert/strict';
import { once } from 'node:events';
import { after, before, test } from 'node:test';
import { createApp } from '../src/app.js';

let server;
let baseUrl;
let databaseQueries = 0;

before(async () => {
  server = createApp({
    async query() {
      databaseQueries += 1;
      throw new Error('Static files must not need a database query');
    },
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

for (const path of ['/', '/customer.html?id=1', '/order.html?id=1']) {
  test(`GET ${path} serves an English HTML page without querying the database`, async () => {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^text\/html/);
    const html = await response.text();
    assert.match(html, /<html lang="en">/);
    assert.match(html, /FloorFlow/);
    assert.match(html, /type="module"/);
    assert.match(html, /id="main-content"/);
    assert.equal(databaseQueries, 0);
  });
}

const assets = [
  { path: '/css/styles.css', type: /^text\/css/ },
  { path: '/favicon.svg', type: /^image\/svg\+xml/ },
  ...['api', 'customers', 'customer', 'order', 'format', 'ui'].map((name) => ({
    path: `/js/${name}.js`, type: /^(text|application)\/javascript/,
  })),
];

for (const asset of assets) {
  test(`GET ${asset.path} serves the expected asset type`, async () => {
    const response = await fetch(`${baseUrl}${asset.path}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), asset.type);
    assert.ok((await response.text()).length > 0);
  });
}

for (const path of ['/missing.html', '/css/missing.css', '/js/missing.js', '/.env', '/.env.local', '/.git/config', '/package.json', '/src/app.js', '/db/init/01-schema.sql', '/docs/API.md', '/js/%2e%2e/%2e%2e/.env']) {
  test(`GET ${path} returns a safe 404 instead of internal files or the homepage`, async () => {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'Route not found.' });
  });
}
