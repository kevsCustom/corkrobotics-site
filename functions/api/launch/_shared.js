// Only provider credentials in env may authorize a signup. There is no mock
// success, local subscriber database, payment processing, or request logging.
const MAX_BODY_BYTES = 4096;
const MAX_PROVIDER_BYTES = 65536;
const PROVIDER_TIMEOUT_MS = 8000;
const TOTAL_PROVIDER_BUDGET_MS = 20000;
const TURNSTILE_ACTION = 'launch_signup';
const UTM_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'];
const CONSENT_VERSION = 'corkbot-launch-2026-10-09';
const ERRORS = {
  method_not_allowed: [405, 'This request method is not supported.'],
  origin_not_allowed: [403, 'Please sign up from the CorkBot launch page.'],
  invalid_content_type: [415, 'Please send the signup as JSON.'],
  body_too_large: [413, 'The signup request is too large.'],
  invalid_request: [400, 'Please check your email and signup details.'],
  consent_required: [400, 'Please agree to receive CorkBot launch emails before signing up.'],
  invalid_email: [400, 'Please enter a valid email address.'],
  signup_unavailable: [503, 'Email signup is not available yet. Please try again later.'],
  use_hosted_form: [503, 'Please use the email signup link on the launch page.'],
  verification_required: [400, 'Please complete the signup verification and try again.'],
  verification_failed: [400, 'Signup verification expired or could not be completed. Please try again.'],
  provider_unavailable: [503, 'We could not confirm signup right now. Check your inbox before trying again. Keep your email entered so you can retry if needed.'],
  signup_requires_provider_form: [409, 'We could not complete signup for this address. Please use the provider signup form or contact Cork Robotics.'],
};

class SignupError extends Error {
  constructor(code) { super(code); this.code = code; }
}

export function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      ...extraHeaders,
    },
  });
}

function errorResponse(code, headers) {
  const [status, message] = ERRORS[code] || ERRORS.provider_unavailable;
  return jsonResponse({ ok: false, error: code, message }, status, headers);
}

function setting(env, name, max = 8192) {
  const value = env?.[name];
  return typeof value === 'string' && value.length <= max && !/[\r\n\0]/.test(value) ? value.trim() : '';
}

function positiveId(value) {
  return /^[1-9]\d{0,14}$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
}

function httpsUrl(value, origin) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return null;
    if (origin && url.origin !== origin) return null;
    return url;
  } catch { return null; }
}

function providerConfiguration(request, env) {
  const origin = new URL(request.url).origin;
  const provider = setting(env, 'SIGNUP_PROVIDER', 30);
  const siteKey = setting(env, 'TURNSTILE_SITE_KEY', 100);
  const secretKey = setting(env, 'TURNSTILE_SECRET_KEY', 200);
  const turnstileConfigured = Boolean(env?.TURNSTILE_SITE_KEY || env?.TURNSTILE_SECRET_KEY);
  const turnstileValid = !turnstileConfigured || (
    /^[A-Za-z0-9_-]{20,100}$/.test(siteKey) && /^[A-Za-z0-9_-]{20,200}$/.test(secretKey)
  );
  const common = { provider, origin, siteKey, secretKey, storeFields: setting(env, 'SIGNUP_STORE_FIELDS', 5) === 'true' };
  // Public API capture always verifies a challenge; hosted provider forms use
  // the provider's own controls. There is no unprotected API configuration.
  if (['brevo', 'mailerlite'].includes(provider) && (!turnstileConfigured || !turnstileValid)) return null;
  if (provider === 'brevo') {
    const key = setting(env, 'BREVO_API_KEY');
    const listId = positiveId(setting(env, 'BREVO_LIST_ID', 20));
    const templateId = positiveId(setting(env, 'BREVO_DOI_TEMPLATE_ID', 20));
    const redirect = httpsUrl(setting(env, 'BREVO_DOI_REDIRECT_URL', 2048), origin);
    return key && listId && templateId && redirect ? { ...common, key, listId, templateId, redirect: redirect.href, mode: 'api' } : null;
  }
  if (provider === 'mailerlite') {
    const key = setting(env, 'MAILERLITE_API_KEY');
    const groupId = setting(env, 'MAILERLITE_GROUP_ID', 30);
    const doiVerified = setting(env, 'MAILERLITE_API_DOI_VERIFIED', 5) === 'true';
    return key && /^[1-9]\d{0,29}$/.test(groupId) && doiVerified ? { ...common, key, groupId, mode: 'api' } : null;
  }
  if (provider === 'mailerlite_form') {
    const form = httpsUrl(setting(env, 'MAILERLITE_FORM_URL', 2048));
    const formVerified = setting(env, 'MAILERLITE_FORM_DOI_VERIFIED', 5) === 'true';
    // Use the provider's published hosted form URL, never an invented POST action.
    const allowedHost = form && /(^|\.)(mailerlite\.io|mailerlite\.com|mailerpage\.io)$/.test(form.hostname);
    return allowedHost && formVerified ? { ...common, formUrl: form.href, mode: 'hosted' } : null;
  }
  return null;
}

function vipConfiguration(request, env, now) {
  const enabled = setting(env, 'VIP_ENABLED', 5) === 'true';
  const checkout = httpsUrl(setting(env, 'VIP_CHECKOUT_URL', 2048));
  const benefit = setting(env, 'VIP_BENEFIT', 400);
  const terms = httpsUrl(setting(env, 'VIP_TERMS_URL', 2048), new URL(request.url).origin);
  const deadline = setting(env, 'VIP_REFUND_DEADLINE', 40);
  const validDeadline = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(deadline)
    && Number.isFinite(Date.parse(deadline)) && Date.parse(deadline) > now
    && new Date(deadline).toISOString().replace('.000Z', 'Z') === deadline.replace('.000Z', 'Z');
  const validBenefit = benefit.length >= 20 && !/placeholder|\btbd\b|to be decided/i.test(benefit);
  const validCheckout = checkout?.hostname === 'buy.stripe.com' && /^\/[A-Za-z0-9_]+$/.test(checkout.pathname)
    && !checkout.pathname.startsWith('/test_') && !checkout.search;
  return enabled && validCheckout && validBenefit && terms && validDeadline ? {
    checkout: checkout.href, benefit, terms: terms.href, deadline,
  } : null;
}

export function publicConfig(request, env = {}, now = Date.now()) {
  const signup = providerConfiguration(request, env);
  const vip = vipConfiguration(request, env, now);
  const result = {
    signup_available: Boolean(signup),
    signup_mode: signup?.mode || 'unavailable',
    vip_available: Boolean(vip),
    vip_amount: 5,
    vip_checkout_url: vip?.checkout || null,
    vip_benefit: vip?.benefit || null,
  };
  if (signup?.mode === 'hosted') result.signup_url = signup.formUrl;
  if (signup?.mode === 'api' && signup.siteKey) result.turnstile_site_key = signup.siteKey;
  if (vip) {
    result.reservation_terms_url = vip.terms;
    result.vip_refund_deadline = vip.deadline;
    result.vip_currency = 'USD';
  }
  const kickstarter = httpsUrl(setting(env, 'KICKSTARTER_URL', 2048));
  if (kickstarter && ['kickstarter.com', 'www.kickstarter.com'].includes(kickstarter.hostname)
      && kickstarter.pathname.startsWith('/projects/')) result.kickstarter_url = kickstarter.href;
  return result;
}

export function configResponse(request, env) {
  if (request.method !== 'GET') return errorResponse('method_not_allowed', { Allow: 'GET' });
  return jsonResponse(publicConfig(request, env));
}

async function boundedText(body, max, errorCode) {
  if (!body) return '';
  const reader = body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > max) {
        await reader.cancel();
        throw new SignupError(errorCode);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const combined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(combined);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function signupInput(request) {
  const url = new URL(request.url);
  if (request.headers.get('Origin') !== url.origin
      || (request.headers.has('Sec-Fetch-Site') && request.headers.get('Sec-Fetch-Site') !== 'same-origin')) {
    throw new SignupError('origin_not_allowed');
  }
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('Content-Type') || '')) {
    throw new SignupError('invalid_content_type');
  }
  const contentLength = request.headers.get('Content-Length');
  if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_BODY_BYTES)) {
    throw new SignupError('body_too_large');
  }
  let input;
  try { input = JSON.parse(await boundedText(request.body, MAX_BODY_BYTES, 'body_too_large')); }
  catch (error) { throw error instanceof SignupError ? error : new SignupError('invalid_request'); }
  const allowedKeys = ['email', 'consent', 'website', 'source', 'turnstile_token'];
  if (!isObject(input) || Object.keys(input).some(key => !allowedKeys.includes(key))) throw new SignupError('invalid_request');
  if (input.consent !== true) throw new SignupError('consent_required');
  if (input.website !== undefined && input.website !== '') throw new SignupError('invalid_request');
  if (typeof input.email !== 'string') throw new SignupError('invalid_email');
  const email = input.email.trim();
  const at = email.lastIndexOf('@');
  if (email.length > 254 || at < 1 || at > 64 || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}$/.test(email)
      || email.startsWith('.') || email.slice(0, at).endsWith('.') || email.includes('..')) throw new SignupError('invalid_email');
  const normalizedEmail = email.slice(0, at) + '@' + email.slice(at + 1).toLowerCase();
  if (normalizedEmail.slice(at + 1).split('.').some(label => !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label))) {
    throw new SignupError('invalid_email');
  }
  const source = input.source ?? {};
  if (!isObject(source) || Object.keys(source).some(key => !UTM_FIELDS.includes(key))) throw new SignupError('invalid_request');
  for (const value of Object.values(source)) {
    if (typeof value !== 'string' || value.length > 120 || !/^[A-Za-z0-9 _./:-]*$/.test(value)) throw new SignupError('invalid_request');
  }
  if (input.turnstile_token !== undefined && (typeof input.turnstile_token !== 'string' || input.turnstile_token.length > 2048)) {
    throw new SignupError('invalid_request');
  }
  return { email: normalizedEmail, source, token: input.turnstile_token || '' };
}

async function remoteRequest(url, options, fetchImpl, deadline) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new SignupError('provider_unavailable');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(PROVIDER_TIMEOUT_MS, remaining));
  try {
    const response = await fetchImpl(url, { ...options, signal: controller.signal, redirect: 'error' });
    if (!response.ok) {
      if (response.body) await response.body.cancel();
      return { status: response.status, data: null };
    }
    const text = await boundedText(response.body, MAX_PROVIDER_BYTES, 'provider_unavailable');
    return { status: response.status, data: text ? JSON.parse(text) : null };
  } catch { throw new SignupError('provider_unavailable'); }
  finally { clearTimeout(timer); }
}

async function verifyTurnstile(request, config, token, fetchImpl) {
  if (!config.secretKey) return;
  if (!token) throw new SignupError('verification_required');
  const body = new URLSearchParams({ secret: config.secretKey, response: token });
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip && /^[0-9a-fA-F:.]{3,45}$/.test(ip)) body.set('remoteip', ip);
  const response = await remoteRequest('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body }, fetchImpl, config.deadline);
  if (response.status !== 200 || response.data?.success !== true || response.data.hostname !== new URL(request.url).hostname
      || response.data.action !== TURNSTILE_ACTION) throw new SignupError('verification_failed');
}

function consentFields(input, uppercase) {
  const fields = { launch_consent_version: CONSENT_VERSION, launch_signup_at: new Date().toISOString() };
  for (const key of UTM_FIELDS) if (input.source[key]) fields[`launch_${key}`] = input.source[key];
  return uppercase ? Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.toUpperCase(), value])) : fields;
}

async function subscribeBrevo(input, config, fetchImpl) {
  const headers = { 'api-key': config.key, Accept: 'application/json' };
  const existing = await remoteRequest(`https://api.brevo.com/v3/contacts/${encodeURIComponent(input.email)}`, { headers }, fetchImpl, config.deadline);
  if (existing.status === 200) {
    const validIds = ids => Array.isArray(ids) && ids.every(id => Number.isSafeInteger(id) && id > 0);
    if (typeof existing.data?.emailBlacklisted !== 'boolean' || !validIds(existing.data?.listIds)
        || ('listUnsubscribed' in existing.data && !validIds(existing.data.listUnsubscribed))) throw new SignupError('provider_unavailable');
    if (existing.data.emailBlacklisted || existing.data.listUnsubscribed?.includes(config.listId)) throw new SignupError('signup_requires_provider_form');
    if (existing.data.listIds.includes(config.listId)) return 'subscribed';
  } else if (existing.status !== 404) throw new SignupError('provider_unavailable');
  const body = {
    email: input.email,
    includeListIds: [config.listId],
    templateId: config.templateId,
    redirectionUrl: config.redirect,
    contactPixelTrackingConsent: false,
  };
  if (config.storeFields) body.attributes = consentFields(input, true);
  const created = await remoteRequest('https://api.brevo.com/v3/contacts/doubleOptinConfirmation', {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }, fetchImpl, config.deadline);
  if (created.status !== 201) throw new SignupError('provider_unavailable');
  return 'confirm_email';
}

async function subscribeMailerLite(input, config, fetchImpl) {
  const headers = { Authorization: `Bearer ${config.key}`, Accept: 'application/json' };
  const existing = await remoteRequest(`https://connect.mailerlite.com/api/subscribers/${encodeURIComponent(input.email)}`, { headers }, fetchImpl, config.deadline);
  let previousStatus = null;
  if (existing.status === 200) {
    previousStatus = existing.data?.data?.status;
    if (!['active', 'unconfirmed', 'unsubscribed', 'bounced', 'junk'].includes(previousStatus)) throw new SignupError('provider_unavailable');
    if (['unsubscribed', 'bounced', 'junk'].includes(previousStatus)) throw new SignupError('signup_requires_provider_form');
  } else if (existing.status !== 404) throw new SignupError('provider_unavailable');
  // Omitting status/resubscribe preserves suppression and previous membership.
  // The API documents this groups upsert as additive, unlike PUT replacement.
  const body = { email: input.email, groups: [config.groupId] };
  if (config.storeFields) body.fields = consentFields(input, false);
  const created = await remoteRequest('https://connect.mailerlite.com/api/subscribers', {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }, fetchImpl, config.deadline);
  if (![200, 201].includes(created.status)) throw new SignupError('provider_unavailable');
  const currentStatus = created.data?.data?.status;
  if (currentStatus === 'unconfirmed') return 'confirm_email';
  if (currentStatus === 'active' && previousStatus === 'active') return 'subscribed';
  if (['unsubscribed', 'bounced', 'junk'].includes(currentStatus)) throw new SignupError('signup_requires_provider_form');
  // A fresh active response contradicts the required API DOI setting. Do not
  // invent a confirmation email or claim a verified new subscription.
  throw new SignupError('provider_unavailable');
}

export async function subscribeResponse(request, env = {}, fetchImpl = fetch) {
  if (request.method !== 'POST') return errorResponse('method_not_allowed', { Allow: 'POST' });
  try {
    const input = await signupInput(request);
    const config = providerConfiguration(request, env);
    if (!config) throw new SignupError('signup_unavailable');
    if (config.mode === 'hosted') throw new SignupError('use_hosted_form');
    config.deadline = Date.now() + TOTAL_PROVIDER_BUDGET_MS;
    await verifyTurnstile(request, config, input.token, fetchImpl);
    const next = config.provider === 'brevo' ? await subscribeBrevo(input, config, fetchImpl) : await subscribeMailerLite(input, config, fetchImpl);
    return jsonResponse({ ok: true, next });
  } catch (error) {
    return errorResponse(error instanceof SignupError ? error.code : 'provider_unavailable');
  }
}
