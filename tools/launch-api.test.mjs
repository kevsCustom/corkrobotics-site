import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { configResponse, publicConfig, subscribeResponse } from '../functions/api/launch/_shared.js';
import { onRequest as configHandler } from '../functions/api/launch/config.js';
import { onRequest as subscribeHandler } from '../functions/api/launch/subscribe.js';

const origin = 'https://corkrobotics.com';
const email = 'Interested+video@example.com';
const input = { email, consent: true, website: '', source: { utm_source: 'instagram', utm_campaign: 'launch-2026' }, turnstile_token: 'offline-test-token' };
const turnstile = { TURNSTILE_SITE_KEY: '1x00000000000000000000AA', TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA' };
const brevo = { ...turnstile, SIGNUP_PROVIDER: 'brevo', BREVO_API_KEY: 'brevo-private-test-key', BREVO_LIST_ID: '12', BREVO_DOI_TEMPLATE_ID: '34', BREVO_DOI_REDIRECT_URL: `${origin}/thank-you` };
const mailerlite = { ...turnstile, SIGNUP_PROVIDER: 'mailerlite', MAILERLITE_API_KEY: 'mailerlite-private-test-key', MAILERLITE_GROUP_ID: '123456789012345678', MAILERLITE_API_DOI_VERIFIED: 'true' };

function request(body = input, headers = {}, method = 'POST') {
  return new Request(`${origin}/api/launch/subscribe`, {
    method,
    headers: { Origin: origin, 'Content-Type': 'application/json', ...headers },
    ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  });
}

function providerFetch(steps, verificationSteps = [{ status: 200, body: { success: true, hostname: 'corkrobotics.com', action: 'launch_signup' } }]) {
  const calls = [];
  const verificationCalls = [];
  const fetch = async (url, options = {}) => {
    const isVerification = url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
    (isVerification ? verificationCalls : calls).push({ url, options });
    const step = (isVerification ? verificationSteps : steps).shift();
    assert.ok(step, 'Unexpected provider request');
    if (step instanceof Error) throw step;
    if (step instanceof Response) return step;
    return new Response(step.body === undefined ? null : JSON.stringify(step.body), { status: step.status, headers: { 'Content-Type': 'application/json' } });
  };
  return { calls, verificationCalls, fetch };
}

async function responseBody(response, expectedStatus) {
  assert.equal(response.status, expectedStatus);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  const result = await response.json();
  const serialized = JSON.stringify(result);
  for (const privateValue of [email, brevo.BREVO_API_KEY, mailerlite.MAILERLITE_API_KEY, turnstile.TURNSTILE_SECRET_KEY, input.turnstile_token, mailerlite.MAILERLITE_GROUP_ID]) {
    assert.ok(!serialized.includes(privateValue), 'Response must omit contacts, private keys, tokens, and group IDs');
  }
  return result;
}

test('unconfigured public config disables capture and VIP without leaking values', () => {
  assert.deepEqual(publicConfig(request(), {}), {
    signup_available: false, signup_mode: 'unavailable', vip_available: false, vip_amount: 5, vip_checkout_url: null, vip_benefit: null,
  });
  const config = publicConfig(request(), brevo);
  assert.equal(config.signup_available, true);
  assert.equal(config.signup_mode, 'api');
  assert.ok(!JSON.stringify(config).includes(brevo.BREVO_API_KEY));
  assert.ok(!JSON.stringify(config).includes('BREVO_LIST_ID'));
});

test('Brevo configuration requires DOI template, list, secret, and same-origin HTTPS redirect', () => {
  for (const change of [
    { BREVO_DOI_TEMPLATE_ID: '' }, { BREVO_LIST_ID: '12junk' }, { BREVO_API_KEY: '' },
    { BREVO_DOI_REDIRECT_URL: 'https://other.example/confirmed' }, { BREVO_DOI_REDIRECT_URL: 'http://corkrobotics.com/thank-you' },
    { BREVO_DOI_REDIRECT_URL: 'https://user:password@corkrobotics.com/thank-you' },
  ]) assert.equal(publicConfig(request(), { ...brevo, ...change }).signup_available, false);
});

test('MailerLite API requires verified API DOI and a group, while published hosted form is an alternative', () => {
  assert.equal(publicConfig(request(), { ...mailerlite, MAILERLITE_API_DOI_VERIFIED: 'false' }).signup_available, false);
  assert.equal(publicConfig(request(), { ...mailerlite, MAILERLITE_GROUP_ID: 'bad' }).signup_available, false);
  const formConfig = { SIGNUP_PROVIDER: 'mailerlite_form', MAILERLITE_FORM_URL: 'https://preview.mailerlite.io/forms/123/456/share', MAILERLITE_FORM_DOI_VERIFIED: 'true' };
  assert.equal(publicConfig(request(), formConfig).signup_mode, 'hosted');
  assert.equal(publicConfig(request(), formConfig).signup_url, formConfig.MAILERLITE_FORM_URL);
  for (const url of ['javascript:alert(1)', 'https://preview.mailerlite.io.evil.example/form', 'http://preview.mailerlite.io/form']) {
    assert.equal(publicConfig(request(), { ...formConfig, MAILERLITE_FORM_URL: url }).signup_available, false);
  }
});

test('partial or invalid Turnstile configuration disables signup instead of bypassing verification', () => {
  for (const change of [
    { TURNSTILE_SITE_KEY: '', TURNSTILE_SECRET_KEY: '' },
    { TURNSTILE_SITE_KEY: '' }, { TURNSTILE_SECRET_KEY: '' },
    { TURNSTILE_SITE_KEY: '\nbad', TURNSTILE_SECRET_KEY: '\nbad' },
  ]) assert.equal(publicConfig(request(), { ...mailerlite, ...change }).signup_available, false);
  const config = publicConfig(request(), { ...mailerlite, ...turnstile });
  assert.equal(config.turnstile_site_key, turnstile.TURNSTILE_SITE_KEY);
  assert.ok(!JSON.stringify(config).includes(turnstile.TURNSTILE_SECRET_KEY));
});

test('VIP requires live enable, valid live Stripe link, concrete benefit, same-origin terms and future deadline', () => {
  const vip = {
    VIP_ENABLED: 'true', VIP_CHECKOUT_URL: 'https://buy.stripe.com/validLiveLink',
    VIP_BENEFIT: 'Access to the defined launch VIP reward through the published launch window.',
    VIP_TERMS_URL: `${origin}/reservation-terms`, VIP_REFUND_DEADLINE: '2026-12-01T00:00:00Z',
  };
  const now = Date.parse('2026-10-09T00:00:00Z');
  assert.equal(publicConfig(request(), vip, now).vip_available, true);
  assert.equal(publicConfig(request(), vip, now).vip_amount, 5);
  for (const change of [
    { VIP_ENABLED: 'false' }, { VIP_CHECKOUT_URL: 'https://example.com/pay' },
    { VIP_CHECKOUT_URL: 'https://buy.stripe.com.evil.example/link' }, { VIP_CHECKOUT_URL: 'https://buy.stripe.com/test_link' },
    { VIP_BENEFIT: 'TBD placeholder benefit for buyers' }, { VIP_TERMS_URL: 'https://other.example/terms' },
    { VIP_REFUND_DEADLINE: '2026-11-31T00:00:00Z' }, { VIP_REFUND_DEADLINE: '2026-10-01T00:00:00Z' },
  ]) {
    const config = publicConfig(request(), { ...vip, ...change }, now);
    assert.equal(config.vip_available, false);
    assert.equal(config.vip_checkout_url, null);
    assert.equal(config.vip_benefit, null);
  }
});

test('only actual HTTPS Kickstarter project URLs are published', () => {
  assert.equal(publicConfig(request(), { KICKSTARTER_URL: 'https://www.kickstarter.com/projects/cork/corkbot' }).kickstarter_url, 'https://www.kickstarter.com/projects/cork/corkbot');
  assert.equal(publicConfig(request(), { KICKSTARTER_URL: 'https://kickstarter.com.evil.example/projects/cork/test' }).kickstarter_url, undefined);
});

test('entrypoint handlers enforce methods and not-configured signup never reports success', async () => {
  assert.equal(configHandler({ request: new Request(`${origin}/api/launch/config`), env: {} }).status, 200);
  assert.equal(configResponse(request(), {}).status, 405);
  const get = await subscribeResponse(request(null, {}, 'GET'), {});
  assert.equal(get.status, 405);
  assert.equal(get.headers.get('Allow'), 'POST');
  const response = await subscribeHandler({ request: request(), env: {} });
  assert.equal((await responseBody(response, 503)).error, 'signup_unavailable');
});

test('rejects cross-origin, missing-origin, invalid fetch-site and non-JSON requests before provider calls', async () => {
  const empty = providerFetch([]);
  for (const [headers, status] of [
    [{ Origin: 'https://bad.example' }, 403], [{ Origin: '' }, 403], [{ 'Sec-Fetch-Site': 'cross-site' }, 403],
    [{ 'Content-Type': 'text/plain' }, 415], [{ 'Content-Type': 'application/json; boundary=something' }, 415],
  ]) await responseBody(await subscribeResponse(request(input, headers), brevo, empty.fetch), status);
  assert.equal(empty.calls.length, 0);
});

test('requires explicit boolean consent and rejects honeypot or malformed fields', async () => {
  const empty = providerFetch([]);
  for (const change of [{ consent: false }, { consent: 'true' }, { consent: null }]) {
    assert.equal((await responseBody(await subscribeResponse(request({ ...input, ...change }), brevo, empty.fetch), 400)).error, 'consent_required');
  }
  for (const body of [
    'not-json', [], { ...input, website: 'https://spam.example' }, { ...input, extra: 'field' },
    { ...input, source: { utm_source: 'person@example.com' } }, { ...input, source: { unknown: 'field' } },
    { ...input, source: { utm_campaign: 'a'.repeat(121) } }, { ...input, turnstile_token: 1 },
  ]) await responseBody(await subscribeResponse(request(body), brevo, empty.fetch), 400);
  assert.equal(empty.calls.length, 0);
});

test('validates email without stripping plus-tags and bounds declared and streamed body length', async () => {
  const empty = providerFetch([]);
  for (const address of ['', 'two@@example.com', 'a@localhost', 'a@example.-com', 'a@-example.com', '.a@example.com', 'a..b@example.com', 'a@example.com\nInjected', 'a'.repeat(65) + '@example.com']) {
    assert.equal((await responseBody(await subscribeResponse(request({ ...input, email: address }), brevo, empty.fetch), 400)).error, 'invalid_email');
  }
  await responseBody(await subscribeResponse(request(input, { 'Content-Length': '5000' }), brevo, empty.fetch), 413);
  await responseBody(await subscribeResponse(request(' '.repeat(4097)), brevo, empty.fetch), 413);
  assert.equal(empty.calls.length, 0);
});

test('Brevo sends a dedicated DOI request and optional consent/source fields without tracking consent', async () => {
  const mock = providerFetch([{ status: 404 }, { status: 201, body: {} }]);
  assert.deepEqual(await responseBody(await subscribeResponse(request(), { ...brevo, SIGNUP_STORE_FIELDS: 'true' }, mock.fetch), 200), { ok: true, next: 'confirm_email' });
  assert.ok(mock.calls[0].url.endsWith('Interested%2Bvideo%40example.com'));
  assert.equal(mock.calls[1].url, 'https://api.brevo.com/v3/contacts/doubleOptinConfirmation');
  const body = JSON.parse(mock.calls[1].options.body);
  assert.equal(body.email, email);
  assert.deepEqual(body.includeListIds, [12]);
  assert.equal(body.templateId, 34);
  assert.equal(body.redirectionUrl, `${origin}/thank-you`);
  assert.equal(body.contactPixelTrackingConsent, false);
  assert.equal(body.attributes.LAUNCH_UTM_SOURCE, 'instagram');
  assert.equal(body.attributes.LAUNCH_CONSENT_VERSION, 'corkbot-launch-2026-10-09');
  assert.ok(!('emailBlacklisted' in body));
  assert.ok(!('excludeListIds' in body));
});

test('Brevo existing active list member is subscribed without mutation; blacklisted remains suppressed', async () => {
  const active = providerFetch([{ status: 200, body: { emailBlacklisted: false, listIds: [12, 98] } }]);
  assert.equal((await responseBody(await subscribeResponse(request(), brevo, active.fetch), 200)).next, 'subscribed');
  assert.equal(active.calls.length, 1);
  const suppressed = providerFetch([{ status: 200, body: { emailBlacklisted: true, listIds: [12] } }]);
  assert.equal((await responseBody(await subscribeResponse(request(), brevo, suppressed.fetch), 409)).error, 'signup_requires_provider_form');
  assert.equal(suppressed.calls.length, 1);
});

test('Brevo list-specific unsubscribe remains suppressed and malformed suppression shape fails safe', async () => {
  const suppressed = providerFetch([{ status: 200, body: { emailBlacklisted: false, listIds: [12, 98], listUnsubscribed: [12] } }]);
  await responseBody(await subscribeResponse(request(), brevo, suppressed.fetch), 409);
  assert.equal(suppressed.calls.length, 1);
  for (const listUnsubscribed of [null, '12', ['12'], [-1], {}]) {
    const mock = providerFetch([{ status: 200, body: { emailBlacklisted: false, listIds: [12], listUnsubscribed } }]);
    await responseBody(await subscribeResponse(request(), brevo, mock.fetch), 503);
    assert.equal(mock.calls.length, 1);
  }
  const otherList = providerFetch([{ status: 200, body: { emailBlacklisted: false, listIds: [12], listUnsubscribed: [98] } }]);
  assert.equal((await responseBody(await subscribeResponse(request(), brevo, otherList.fetch), 200)).next, 'subscribed');
});

test('provider failures and invalid responses return sanitized errors, never phantom success', async () => {
  for (const steps of [
    [{ status: 401 }], [{ status: 429 }], [{ status: 500 }],
    [{ status: 200, body: { attributes: {} } }], [{ status: 404 }, { status: 400, body: { email, message: brevo.BREVO_API_KEY } }],
    [new Error(`Provider failed for ${email} using ${brevo.BREVO_API_KEY}`)],
  ]) {
    const mock = providerFetch(steps);
    assert.equal((await responseBody(await subscribeResponse(request(), brevo, mock.fetch), 503)).ok, false);
  }
});

test('external requests share a total budget and ambiguous timeout asks the visitor to check inbox', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.parse('2026-10-09T00:00:00Z') });
  let calls = 0;
  const slowFetch = async (url, options) => {
    calls++;
    t.mock.timers.tick(calls < 3 ? 7500 : 6000);
    options.signal.throwIfAborted();
    if (url.includes('siteverify')) return new Response(JSON.stringify({ success: true, hostname: 'corkrobotics.com', action: 'launch_signup' }));
    if (options.method !== 'POST') return new Response(null, { status: 404 });
    return new Response('{}', { status: 201 });
  };
  const result = await responseBody(await subscribeResponse(request(), brevo, slowFetch), 503);
  assert.equal(calls, 3);
  assert.match(result.message, /Check your inbox before trying again/);
});

test('MailerLite fresh unconfirmed subscriber requests confirmation and does not force status or resubscribe', async () => {
  const mock = providerFetch([{ status: 404 }, { status: 201, body: { data: { status: 'unconfirmed' } } }]);
  assert.equal((await responseBody(await subscribeResponse(request(), mailerlite, mock.fetch), 200)).next, 'confirm_email');
  assert.deepEqual(JSON.parse(mock.calls[1].options.body), { email, groups: [mailerlite.MAILERLITE_GROUP_ID] });
  assert.equal(mock.calls[0].options.headers['Content-Type'], 'application/json');
  assert.equal(mock.calls[0].options.headers.Accept, 'application/json');
});

test('MailerLite existing active subscriber stays active with additive groups; existing unconfirmed receives DOI', async () => {
  for (const [status, next] of [['active', 'subscribed'], ['unconfirmed', 'confirm_email']]) {
    const mock = providerFetch([
      { status: 200, body: { data: { status, groups: [{ id: 'other-group' }] } } },
      { status: 200, body: { data: { status } } },
    ]);
    assert.equal((await responseBody(await subscribeResponse(request(), mailerlite, mock.fetch), 200)).next, next);
    assert.equal(mock.calls[1].options.method, 'POST');
    assert.deepEqual(JSON.parse(mock.calls[1].options.body).groups, [mailerlite.MAILERLITE_GROUP_ID]);
    assert.ok(!('status' in JSON.parse(mock.calls[1].options.body)));
  }
});

test('MailerLite preserves every suppression class and fails safe on fresh active response or unexpected status', async () => {
  for (const status of ['unsubscribed', 'bounced', 'junk']) {
    const mock = providerFetch([{ status: 200, body: { data: { status } } }]);
    await responseBody(await subscribeResponse(request(), mailerlite, mock.fetch), 409);
    assert.equal(mock.calls.length, 1);
  }
  for (const [previous, current] of [[null, 'active'], ['unconfirmed', 'active'], [null, undefined], ['unknown', undefined]]) {
    const steps = [{ status: previous ? 200 : 404, ...(previous ? { body: { data: { status: previous } } } : {}) }];
    if (previous !== 'unknown') steps.push({ status: 201, body: { data: { status: current } } });
    await responseBody(await subscribeResponse(request(), mailerlite, providerFetch(steps).fetch), 503);
  }
});

test('MailerLite race to suppression is preserved and optional fields omit uncollected IP', async () => {
  const mock = providerFetch([{ status: 200, body: { data: { status: 'active' } } }, { status: 200, body: { data: { status: 'unsubscribed' } } }]);
  await responseBody(await subscribeResponse(request(input, { 'CF-Connecting-IP': '192.0.2.1' }), { ...mailerlite, SIGNUP_STORE_FIELDS: 'true' }, mock.fetch), 409);
  const body = JSON.parse(mock.calls[1].options.body);
  assert.equal(body.fields.launch_utm_campaign, 'launch-2026');
  assert.ok(!JSON.stringify(body).includes('192.0.2.1'));
});

test('Turnstile requires token and validates action and hostname before contacting email provider', async () => {
  const env = { ...brevo, ...turnstile };
  const none = providerFetch([]);
  assert.equal((await responseBody(await subscribeResponse(request({ ...input, turnstile_token: '' }), env, none.fetch), 400)).error, 'verification_required');
  assert.equal(none.calls.length, 0);
  for (const response of [
    { success: false, hostname: 'corkrobotics.com', action: 'launch_signup' },
    { success: true, hostname: 'evil.example', action: 'launch_signup' },
    { success: true, hostname: 'corkrobotics.com', action: 'other_action' },
  ]) {
    const mock = providerFetch([], [{ status: 200, body: response }]);
    await responseBody(await subscribeResponse(request({ ...input, turnstile_token: 'token' }), env, mock.fetch), 400);
    assert.equal(mock.verificationCalls.length, 1);
    assert.equal(mock.calls.length, 0);
  }
  const valid = providerFetch([{ status: 404 }, { status: 201, body: {} }]);
  await responseBody(await subscribeResponse(request({ ...input, turnstile_token: 'token' }), env, valid.fetch), 200);
  assert.equal(valid.verificationCalls[0].url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
  assert.equal(valid.verificationCalls[0].options.body.get('response'), 'token');
});

test('diagnostics distinguish Siteverify HTTP errors from MailerLite lookup and upsert HTTP errors without provider-body leakage', async () => {
  const privatePayload = { email, id: mailerlite.MAILERLITE_GROUP_ID, message: mailerlite.MAILERLITE_API_KEY, token: input.turnstile_token, secret: turnstile.TURNSTILE_SECRET_KEY };
  const cases = [
    { mock: providerFetch([], [{ status: 503, body: privatePayload }]), status: 400, error: 'verification_failed', stage: 'turnstile_siteverify', http_status: 503 },
    { mock: providerFetch([{ status: 401, body: privatePayload }]), status: 503, error: 'provider_unavailable', stage: 'mailerlite_lookup', http_status: 401 },
    { mock: providerFetch([{ status: 404 }, { status: 422, body: privatePayload }]), status: 503, error: 'provider_unavailable', stage: 'mailerlite_upsert', http_status: 422 },
  ];
  for (const { mock, status, error, stage, http_status } of cases) {
    const result = await responseBody(await subscribeResponse(request(), mailerlite, mock.fetch), status);
    assert.equal(result.error, error);
    assert.deepEqual(result.diagnostic, { stage, outcome: 'http_error', http_status });
    assert.deepEqual(Object.keys(result).sort(), ['diagnostic', 'error', 'message', 'ok']);
  }
});

test('diagnostics classify transport failures at each service step and ignore exception text and attached diagnostics', async () => {
  const privateException = new Error(`${email} ${mailerlite.MAILERLITE_API_KEY} ${turnstile.TURNSTILE_SECRET_KEY} ${input.turnstile_token}`);
  privateException.diagnostic = { stage: 'mailerlite_upsert', outcome: email, http_status: mailerlite.MAILERLITE_GROUP_ID, token: input.turnstile_token };
  const cases = [
    { mock: providerFetch([], [privateException]), stage: 'turnstile_siteverify' },
    { mock: providerFetch([privateException]), stage: 'mailerlite_lookup' },
    { mock: providerFetch([{ status: 404 }, privateException]), stage: 'mailerlite_upsert' },
  ];
  for (const { mock, stage } of cases) {
    const result = await responseBody(await subscribeResponse(request(), mailerlite, mock.fetch), 503);
    assert.deepEqual(result.diagnostic, { stage, outcome: 'transport_error' });
    assert.match(result.message, /^We could not confirm signup right now\./);
  }
});

test('diagnostics classify invalid JSON at each service step without returning malformed provider text', async () => {
  const invalid = () => new Response(`invalid JSON for ${email} ${mailerlite.MAILERLITE_API_KEY}`, { status: 200 });
  const cases = [
    { mock: providerFetch([], [invalid()]), stage: 'turnstile_siteverify' },
    { mock: providerFetch([invalid()]), stage: 'mailerlite_lookup' },
    { mock: providerFetch([{ status: 404 }, invalid()]), stage: 'mailerlite_upsert' },
  ];
  for (const { mock, stage } of cases) {
    const result = await responseBody(await subscribeResponse(request(), mailerlite, mock.fetch), 503);
    assert.deepEqual(result.diagnostic, { stage, outcome: 'invalid_json', http_status: 200 });
  }
});

test('diagnostics distinguish invalid provider schema from the unexpected active guard without echoing returned status', async () => {
  const cases = [
    { mock: providerFetch([], [{ status: 200, body: { success: email, secret: turnstile.TURNSTILE_SECRET_KEY } }]), status: 400, stage: 'turnstile_siteverify', outcome: 'schema_error', http_status: 200 },
    { mock: providerFetch([{ status: 200, body: { data: { status: mailerlite.MAILERLITE_API_KEY, email } } }]), status: 503, stage: 'mailerlite_lookup', outcome: 'schema_error', http_status: 200 },
    { mock: providerFetch([{ status: 404 }, { status: 201, body: { data: { status: email } } }]), status: 503, stage: 'mailerlite_upsert', outcome: 'schema_error', http_status: 201 },
    { mock: providerFetch([{ status: 404 }, { status: 201, body: { data: { status: 'active', email } } }]), status: 503, stage: 'mailerlite_upsert', outcome: 'unexpected_active', http_status: 201 },
    { mock: providerFetch([{ status: 200, body: { data: { status: 'unconfirmed' } } }, { status: 200, body: { data: { status: 'active' } } }]), status: 503, stage: 'mailerlite_upsert', outcome: 'unexpected_active', http_status: 200 },
  ];
  for (const { mock, status, stage, outcome, http_status } of cases) {
    const result = await responseBody(await subscribeResponse(request(), mailerlite, mock.fetch), status);
    assert.deepEqual(result.diagnostic, { stage, outcome, http_status });
  }
});

test('diagnostics identify Siteverify rejection while preserving hostname and action verification', async () => {
  for (const body of [
    { success: false, 'error-codes': [email, turnstile.TURNSTILE_SECRET_KEY] },
    { success: true, hostname: email, action: 'launch_signup' },
    { success: true, hostname: 'corkrobotics.com', action: mailerlite.MAILERLITE_API_KEY },
  ]) {
    const mock = providerFetch([], [{ status: 200, body }]);
    const result = await responseBody(await subscribeResponse(request(), mailerlite, mock.fetch), 400);
    assert.equal(result.error, 'verification_failed');
    assert.deepEqual(result.diagnostic, { stage: 'turnstile_siteverify', outcome: 'verification_failed', http_status: 200 });
    assert.equal(mock.calls.length, 0);
  }
});

test('diagnostics distinguish timeouts at each service step using only the controlled abort signal', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.parse('2026-10-09T00:00:00Z') });
  for (const stage of ['turnstile_siteverify', 'mailerlite_lookup', 'mailerlite_upsert']) {
    const fetch = async (url, options) => {
      const step = url.includes('/siteverify') ? 'turnstile_siteverify' : options.method === 'POST' ? 'mailerlite_upsert' : 'mailerlite_lookup';
      if (step === stage) {
        t.mock.timers.tick(8000);
        options.signal.throwIfAborted();
      }
      if (step === 'turnstile_siteverify') return new Response(JSON.stringify({ success: true, hostname: 'corkrobotics.com', action: 'launch_signup' }));
      if (step === 'mailerlite_lookup') return new Response(null, { status: 404 });
      return new Response(JSON.stringify({ data: { status: 'unconfirmed' } }), { status: 201 });
    };
    const result = await responseBody(await subscribeResponse(request(), mailerlite, fetch), 503);
    assert.deepEqual(result.diagnostic, { stage, outcome: 'timeout' });
  }
});

test('diagnostics preserve the bounded provider response limit without returning oversized body content', async () => {
  const oversized = new Response(JSON.stringify({ email, secret: mailerlite.MAILERLITE_API_KEY, padding: 'x'.repeat(65536) }), { status: 200 });
  const mock = providerFetch([oversized]);
  const result = await responseBody(await subscribeResponse(request(), mailerlite, mock.fetch), 503);
  assert.deepEqual(result.diagnostic, { stage: 'mailerlite_lookup', outcome: 'response_too_large', http_status: 200 });
  assert.equal(mock.calls.length, 1);
});

test('diagnostics are absent from validation, suppression, and successful signup responses', async () => {
  const invalid = providerFetch([]);
  const invalidResult = await responseBody(await subscribeResponse(request({ ...input, consent: false }), mailerlite, invalid.fetch), 400);
  assert.equal(invalidResult.diagnostic, undefined);
  const suppressed = providerFetch([{ status: 200, body: { data: { status: 'unsubscribed' } } }]);
  const suppressedResult = await responseBody(await subscribeResponse(request(), mailerlite, suppressed.fetch), 409);
  assert.equal(suppressedResult.diagnostic, undefined);
  assert.equal(suppressed.calls.length, 1);
  const success = providerFetch([{ status: 404 }, { status: 201, body: { data: { status: 'unconfirmed' } } }]);
  assert.deepEqual(await responseBody(await subscribeResponse(request(), mailerlite, success.fetch), 200), { ok: true, next: 'confirm_email' });
});

test('hosted form capture only works on provider; API does not invent a successful signup', async () => {
  const env = { SIGNUP_PROVIDER: 'mailerlite_form', MAILERLITE_FORM_URL: 'https://preview.mailerlite.io/forms/123/456/share', MAILERLITE_FORM_DOI_VERIFIED: 'true' };
  const mock = providerFetch([]);
  assert.equal((await responseBody(await subscribeResponse(request(), env, mock.fetch), 503)).error, 'use_hosted_form');
  assert.equal(mock.calls.length, 0);
});

test('only the two signup API paths invoke Functions; existing static/download routes stay outside', async () => {
  const routes = JSON.parse(await readFile(new URL('../_routes.json', import.meta.url), 'utf8'));
  assert.deepEqual(routes, { version: 1, include: ['/api/launch/config', '/api/launch/subscribe'], exclude: [] });
  for (const path of ['/', '/assets/js/main.js', '/downloads', '/updates/firmware/latest.json', '/releases/firmware/main-board/0.1.1/main-board-0.1.1.bin']) {
    assert.ok(!routes.include.includes(path));
  }
});
