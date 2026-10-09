// Synthetic browser lifecycle checks only. No real CAPTCHA, contact, or email.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../assets/js/launch.js', import.meta.url), 'utf8');
const flush = async () => { for (let n = 0; n < 4; n++) await new Promise(setImmediate); };
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
function fixture({ sdkCallbackImmediately = true, renderError = false, post } = {}) {
  const elements = new Map();
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, {
      hidden: ['#launch-signup', '#signup-security-help', '#signup-success'].includes(selector),
      disabled: false, dataset: {}, value: '', checked: true, textContent: '', listeners: {},
      addEventListener(name, callback) { this.listeners[name] = callback; },
      reportValidity() { return true; }, setAttribute() {}, removeAttribute() {},
      replaceChildren() {}, focus() {}, remove() { this.removed = true; },
    });
    return elements.get(selector);
  };
  element('#signup-email').value = 'synthetic-ui-test@example.invalid';
  const scripts = [], widgets = [], removed = [], loaded = [], timers = new Map(), requests = [];
  let readyCalls = 0;
  let timerId = 0;
  const window = { location: { search: '' } };
  const context = {
    window, URL, URLSearchParams, AbortController, Date, clearTimeout: id => timers.delete(id),
    setTimeout: (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId; },
    document: {
      querySelector: element, querySelectorAll: () => [],
      createElement: () => ({ listeners: {}, addEventListener(name, callback) { this.listeners[name] = callback; }, remove() { this.removed = true; } }),
      head: { append: script => {
        script.sdkOnload = window[new URL(script.src).searchParams.get('onload')];
        scripts.push(script);
      } },
    },
    fetch: async (url, options) => {
      if (url.endsWith('/config')) return { ok: true, json: async () => ({ signup_available: true, signup_mode: 'api', turnstile_site_key: 'synthetic-site-key' }) };
      requests.push(JSON.parse(options.body));
      return post ? post() : { ok: true, json: async () => ({ ok: true, next: 'confirm_email' }) };
    },
  };
  vm.runInNewContext(source, context);
  const load = (script = scripts.at(-1)) => {
    window.turnstile = {
      ready() {
        ++readyCalls;
        if (script.async || script.defer) throw new Error('Remove async/defer before using turnstile.ready().');
      },
      render(container, options) {
        if (renderError) throw new Error('Synthetic render failure');
        const id = `synthetic-widget-${widgets.length}`; widgets.push({ id, options }); return id;
      },
      remove: id => removed.push(id),
    };
    if (typeof script.sdkOnload === 'function') {
      if (sdkCallbackImmediately) script.sdkOnload(); else loaded.push(script.sdkOnload);
    } else {
      // Models the earlier element-load integration against the same SDK.
      script.listeners.load();
    }
  };
  return {
    element, scripts, widgets, removed, loaded, timers, requests, load,
    get readyCalls() { return readyCalls; },
    fire(delay) {
      const matches = [...timers].filter(([, timer]) => timer.delay === delay);
      assert.equal(matches.length, 1, `one active ${delay}ms timer`);
      const [id, timer] = matches[0]; timers.delete(id); timer.callback();
    },
    retry: () => element('#signup-security-retry').listeners.click(),
    submit: () => element('#launch-signup').listeners.submit({ preventDefault() {} }),
  };
}

test('a stalled script offers recovery and retired script callbacks cannot render a widget', async () => {
  const ui = fixture(); await flush();
  const firstScript = ui.scripts[0];
  ui.fire(15000);
  assert.equal(ui.element('#signup-security-help').hidden, false);
  assert.equal(ui.element('#signup-submit').disabled, true);
  assert.match(ui.element('#signup-security-notice').textContent, /couldn’t load/);
  ui.retry();
  assert.equal(firstScript.removed, true);
  ui.load(firstScript);
  assert.equal(ui.widgets.length, 0);
  ui.load();
  assert.equal(ui.widgets.length, 1);
  assert.equal(ui.scripts[1].async, true);
  assert.equal(ui.scripts[1].defer, true);
  assert.match(ui.scripts[1].src, /onload=corkbotTurnstileLoaded/);
  assert.equal(ui.readyCalls, 0, 'async/defer SDK ready() must never be called');
  assert.equal(ui.requests.length, 0);
});

test('late SDK onload cannot duplicate a widget created by retry after script timeout', async () => {
  const ui = fixture({ sdkCallbackImmediately: false }); await flush(); ui.load();
  const retiredOnload = ui.loaded.shift();
  ui.fire(15000);
  assert.equal(ui.element('#signup-submit').disabled, true);
  ui.retry();
  assert.equal(ui.widgets.length, 1);
  retiredOnload();
  assert.equal(ui.widgets.length, 1);
  ui.widgets[0].options.callback('fresh-token');
  assert.equal(ui.element('#signup-submit').disabled, false);
  assert.equal(ui.readyCalls, 0);
});

test('SDK load and challenge stalls stay disabled and old callbacks cannot revive a token', async () => {
  const ui = fixture({ sdkCallbackImmediately: false }); await flush(); ui.load();
  assert.equal(ui.widgets.length, 0);
  ui.fire(15000);
  assert.equal(ui.element('#signup-security-help').hidden, false);
  ui.loaded.shift()();
  const first = ui.widgets[0];
  ui.fire(45000);
  assert.match(ui.element('#signup-security-notice').textContent, /longer than expected/);
  assert.equal(ui.element('#signup-submit').disabled, true);
  ui.retry();
  assert.deepEqual(ui.removed, [first.id]);
  first.options.callback('retired-token');
  assert.equal(ui.element('#signup-submit').disabled, true);
  ui.widgets[1].options.callback('fresh-token');
  await ui.submit();
  assert.equal(ui.requests[0].turnstile_token, 'fresh-token');
  assert.equal(ui.element('#signup-success').hidden, false);
  assert.equal(ui.timers.size, 0);
});

test('provider errors expose only a numeric diagnostic and never enable signup', async () => {
  const ui = fixture(); await flush(); ui.load();
  const options = ui.widgets[0].options;
  assert.equal(options.retry, 'never');
  options.callback('synthetic-token');
  assert.equal(ui.element('#signup-submit').disabled, false);
  options['error-callback']('110200');
  assert.equal(ui.element('#signup-submit').disabled, true);
  assert.equal(ui.element('#signup-security-help').dataset.turnstileCode, '110200');
  assert.doesNotMatch(ui.element('#signup-security-notice').textContent, /110200/);
  options['error-callback']('private-token-or-provider-exception');
  assert.equal(ui.element('#signup-security-help').dataset.turnstileCode, undefined);
  assert.doesNotMatch(ui.element('#signup-security-notice').textContent, /private-token/);
  assert.equal(ui.requests.length, 0);
});

test('the asynchronous SDK onload callback catches render failures and clears its timers', async () => {
  const ui = fixture({ sdkCallbackImmediately: false, renderError: true }); await flush(); ui.load();
  assert.doesNotThrow(() => ui.loaded.shift()());
  assert.equal(ui.element('#signup-security-help').hidden, false);
  assert.equal(ui.element('#signup-submit').disabled, true);
  assert.match(ui.element('#signup-security-notice').textContent, /couldn’t load/);
  assert.equal(ui.timers.size, 0);
});

test('expiry, interactive timeout and unsupported browser show help while failing closed', async () => {
  for (const callback of ['expired-callback', 'timeout-callback', 'unsupported-callback']) {
    const ui = fixture(); await flush(); ui.load();
    ui.widgets[0].options.callback('synthetic-token');
    ui.widgets[0].options[callback]();
    assert.equal(ui.element('#signup-security-help').hidden, false);
    assert.equal(ui.element('#signup-submit').disabled, true);
    assert.equal(ui.timers.size, 0);
    assert.equal(ui.requests.length, 0);
  }
});

test('retry is inert during a pending signup and late callbacks cannot change its result', async () => {
  const response = deferred();
  const ui = fixture({ post: () => response.promise }); await flush(); ui.load();
  const first = ui.widgets[0].options;
  first.callback('synthetic-token');
  const submitted = ui.submit(); await flush();
  assert.equal(ui.element('#signup-security-retry').disabled, true);
  ui.retry(); first.callback('late-token');
  first['error-callback']('200500');
  assert.equal(ui.element('#signup-status').textContent, 'Sending your signup…');
  assert.equal(ui.widgets.length, 1);
  response.resolve({ ok: true, json: async () => ({ ok: true, next: 'confirm_email' }) });
  await submitted;
  first.callback('after-success-token');
  assert.equal(ui.requests.length, 1);
  assert.equal(ui.requests[0].turnstile_token, 'synthetic-token');
  assert.equal(ui.element('#signup-success').hidden, false);
  assert.equal(ui.element('#signup-submit').disabled, true);
  assert.equal(ui.element('#signup-security-help').hidden, true);
  assert.equal(ui.timers.size, 0);
});

test('an already-confirmed response preserves its success copy and cannot restart capture', async () => {
  const ui = fixture({ post: () => ({ ok: true, json: async () => ({ ok: true, next: 'subscribed' }) }) });
  await flush(); ui.load(); ui.widgets[0].options.callback('synthetic-token');
  await ui.submit();
  assert.equal(ui.element('#success-title').textContent, 'You’re on the list.');
  assert.match(ui.element('#success-description').textContent, /already confirmed/);
  assert.equal(ui.element('#signup-success').hidden, false);
  ui.retry();
  assert.equal(ui.widgets.length, 1);
  assert.equal(ui.requests.length, 1);
});

test('failed signup retains the email and server message through fresh verification', async () => {
  const ui = fixture({ post: () => ({ ok: false, json: async () => ({ ok: false, message: 'Check your inbox before trying again.' }) }) });
  await flush(); ui.load();
  const first = ui.widgets[0]; first.options.callback('synthetic-token');
  await ui.submit();
  assert.equal(ui.element('#signup-email').value, 'synthetic-ui-test@example.invalid');
  assert.equal(ui.element('#signup-status').textContent, 'Check your inbox before trying again.');
  assert.equal(ui.element('#signup-submit').disabled, true);
  assert.equal(ui.widgets.length, 2);
  first.options.callback('retired-token');
  assert.equal(ui.element('#signup-submit').disabled, true);
  ui.widgets[1].options.callback('fresh-token');
  assert.equal(ui.element('#signup-status').textContent, 'Check your inbox before trying again.');
  assert.equal(ui.element('#signup-submit').disabled, false);
});
