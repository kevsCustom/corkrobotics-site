// Run only against a local, unconfigured Pages runtime. No real provider
// credentials, subscriber email, card, or remote resource is used by this test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const base = new URL(process.env.LAUNCH_RUNTIME_URL || 'http://127.0.0.1:8789');
assert.ok(['127.0.0.1', 'localhost'].includes(base.hostname), 'Runtime test requires localhost');
const config = await fetch(new URL('/api/launch/config', base));
assert.equal(config.status, 200);
const settings = await config.json();
assert.equal(settings.signup_available, false, 'Refusing to test submission against a configured provider');
assert.equal(settings.vip_available, false, 'Refusing to test against a live reservation offer');

function post(body, headers = {}) {
  return fetch(new URL('/api/launch/subscribe', base), {
    method: 'POST', headers: { Origin: base.origin, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
}
const input = { email: 'offline-runtime-test@example.invalid', consent: true, website: '', source: { utm_source: 'runtime-test' } };

test('Cloudflare runtime config accurately advertises disabled capture/payment', () => {
  assert.equal(settings.signup_mode, 'unavailable');
  assert.equal(settings.vip_checkout_url, null);
  assert.equal(settings.vip_amount, 5);
  assert.equal(config.headers.get('Cache-Control'), 'no-store');
});

test('Cloudflare runtime never stores or confirms an unconfigured signup', async () => {
  const response = await post(input);
  assert.equal(response.status, 503);
  const result = await response.json();
  assert.equal(result.ok, false);
  assert.equal(result.error, 'signup_unavailable');
  assert.ok(!JSON.stringify(result).includes(input.email));
});

test('Cloudflare runtime rejects wrong origin, missing consent, wrong content type and wrong method', async () => {
  assert.equal((await post(input, { Origin: 'https://other.example' })).status, 403);
  assert.equal((await post({ ...input, consent: false })).status, 400);
  assert.equal((await post(input, { 'Content-Type': 'text/plain' })).status, 415);
  const response = await fetch(new URL('/api/launch/subscribe', base));
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('Allow'), 'POST');
});

test('existing HTML, assets and update manifest are served unchanged as static files', async () => {
  for (const path of ['/downloads.html', '/assets/css/product.css', '/updates/firmware/latest.json']) {
    const expected = await readFile(new URL(`..${path}`, import.meta.url), 'utf8');
    const response = await fetch(new URL(path, base));
    assert.equal(response.status, 200);
    assert.equal(await response.text(), expected);
  }
  const css = await fetch(new URL('/assets/css/product.css', base));
  assert.equal(css.headers.get('Cache-Control'), 'public, max-age=86400');
});

test('function source is not exposed through a static file request', async () => {
  for (const path of ['/functions/api/launch/_shared.js', '/tools/launch-api.test.mjs', '/docs/launch-setup.md']) {
    const response = await fetch(new URL(path, base));
    assert.equal(response.status, 404);
  }
});
