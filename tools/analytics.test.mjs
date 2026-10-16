// Offline lifecycle checks: no browser, Google request, subscriber, or real contact.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { runInNewContext } from 'node:vm';
import { buildLaunchPages, PUBLIC_FILES, PUBLIC_DIRECTORIES } from './build-launch-pages.mjs';

const source = await readFile(new URL('../assets/js/analytics.js', import.meta.url), 'utf8');
const CONFIG = 'G-TEST123456';

function fixture({ url = 'https://corkrobotics.com/launch', cookies = {}, storage = {}, blockedStorage = false,
  blockedCookies = false, measurementId = CONFIG, referrer = '', loading = false,
  title = 'CorkBot launch updates — Cork Robotics' } = {}) {
  const jar = new Map(Object.entries(cookies));
  const mirror = new Map(Object.entries(storage));
  const cookieWrites = [];
  const scripts = [];
  const replacements = [];
  const domListeners = new Map();
  const timers = new Map();
  let timerId = 0;
  let document;
  class Element {
    constructor(tag = 'div') { this.tagName = tag; this.children = []; this.attributes = new Map(); this.listeners = new Map(); this.hidden = false; this.isConnected = true; this.elements = new Map(); }
    appendChild(child) { this.children.push(child); return child; }
    setAttribute(key, value) { this.attributes.set(key, value); }
    getAttribute(key) { return this.attributes.get(key); }
    addEventListener(name, callback) { this.listeners.set(name, callback); }
    focus() { document.activeElement = this; }
    querySelector(selector) {
      if (!this.elements.has(selector)) {
        const element = new Element('button');
        const choice = selector.match(/data-analytics-choice="(.*?)"/);
        if (choice) element.setAttribute('data-analytics-choice', choice[1]);
        this.elements.set(selector, element);
      }
      return this.elements.get(selector);
    }
    querySelectorAll(selector) {
      assert.equal(selector, '[data-analytics-choice]');
      return [this.querySelector('[data-analytics-choice="accepted"]'), this.querySelector('[data-analytics-choice="declined"]')];
    }
    click() { if (!this.disabled) this.listeners.get('click')?.(); }
  }
  const footer = new Element('nav');
  const body = new Element('body');
  document = {
    title, referrer,
    readyState: loading ? 'loading' : 'complete', activeElement: new Element('a'), body,
    createElement: (tag) => new Element(tag),
    querySelector: (selector) => selector === 'footer nav' ? footer : null,
    addEventListener: (name, callback) => domListeners.set(name, callback),
    head: { appendChild: (script) => scripts.push(script) },
  };
  Object.defineProperty(document, 'cookie', {
    get() { if (blockedCookies) throw new Error('Cookie access blocked'); return [...jar].map(([name, value]) => `${name}=${value}`).join('; '); },
    set(value) {
      if (blockedCookies) throw new Error('Cookie access blocked');
      cookieWrites.push(value);
      const [entry, ...attributes] = value.split(';');
      const split = entry.indexOf('=');
      const name = entry.slice(0, split);
      if (attributes.some((attribute) => attribute.trim() === 'Max-Age=0')) jar.delete(name);
      else jar.set(name, entry.slice(split + 1));
    },
  });
  const window = {
    location: new URL(url), CORK_ANALYTICS_CONFIG: { measurementId },
    listeners: new Map(),
    addEventListener(name, callback) { this.listeners.set(name, callback); },
    history: {
      state: { preserved: true },
      replaceState(state, title, target) { replacements.push({ state, title, target }); window.location = new URL(target, window.location); },
    },
    localStorage: {
      getItem(key) { if (blockedStorage) throw new Error('Storage denied'); return mirror.get(key) || null; },
      setItem(key, value) { if (blockedStorage) throw new Error('Storage denied'); mirror.set(key, value); },
      removeItem(key) { if (blockedStorage) throw new Error('Storage denied'); mirror.delete(key); },
    },
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  const context = { window, document, URL, Date };
  runInNewContext(source, context);
  const panel = () => body.children.find((element) => element.id === 'cork-analytics-panel');
  const commands = () => [...(window.dataLayer || [])].map((args) => [...args]);
  return {
    window, document, jar, mirror, cookieWrites, scripts, replacements, footer, body, panel, commands,
    accept: () => panel().querySelector('[data-analytics-choice="accepted"]').click(),
    decline: () => panel().querySelector('[data-analytics-choice="declined"]').click(),
    preferences: () => footer.children[0].click(),
    loaded: () => scripts[0].onload(),
    ready: () => { document.readyState = 'complete'; domListeners.get('DOMContentLoaded')?.(); },
    rerun: () => runInNewContext(source, context),
  };
}

test('fresh visitors get an opt-in choice with no Google script, event queue, or analytics cookies', () => {
  const ui = fixture();
  assert.equal(ui.scripts.length, 0);
  assert.equal(ui.window.gtag, undefined);
  assert.equal(ui.window.dataLayer, undefined);
  assert.equal(ui.panel().hidden, false);
  assert.equal(ui.cookieWrites.length, 0);
  ui.decline();
  assert.equal(ui.jar.get('cork_analytics_consent'), 'declined');
  assert.equal(ui.panel().hidden, true);
  assert.equal(ui.scripts.length, 0);
  assert.equal(ui.window.gtag, undefined);
  const saved = fixture({ cookies: Object.fromEntries(ui.jar) });
  assert.equal(saved.panel().hidden, true);
  assert.equal(saved.scripts.length, 0);
});

test('accept loads once and emits one sanitized pageview after the library is ready', () => {
  const ui = fixture({ url: 'https://www.corkrobotics.com/launch?utm_source=instagram&utm_campaign=launch-2026&email=private%40example.invalid&token=secret&analytics=other#private', referrer: 'https://search.example/find?email=private%40example.invalid#secret' });
  ui.accept();
  assert.equal(ui.scripts.length, 1);
  assert.equal(ui.scripts[0].src, `https://www.googletagmanager.com/gtag/js?id=${CONFIG}`);
  assert.equal(ui.commands().filter(([command]) => command === 'event').length, 0);
  ui.loaded();
  const events = ui.commands().filter(([command]) => command === 'event');
  assert.equal(events.length, 1);
  assert.equal(events[0][1], 'page_view');
  assert.equal(events[0][2].page_location, 'https://www.corkrobotics.com/launch?utm_source=instagram&utm_campaign=launch-2026');
  assert.equal(events[0][2].page_referrer, 'https://search.example/');
  const config = ui.commands().find(([command]) => command === 'config')[2];
  assert.equal(config.send_page_view, false);
  assert.equal(config.allow_google_signals, false);
  assert.equal(config.allow_ad_personalization_signals, false);
  assert.equal(config.cookie_expires, 15552000);
  assert.equal(config.cookie_update, false);
  assert.equal(config.cookie_domain, 'corkrobotics.com');
  const consent = ui.commands().find(([command]) => command === 'consent')[2];
  assert.equal(consent.analytics_storage, 'granted');
  for (const field of ['ad_storage', 'ad_user_data', 'ad_personalization']) assert.equal(consent[field], 'denied');
  assert.doesNotMatch(JSON.stringify(ui.commands()), /private|secret|user_id|user_properties/);
  ui.preferences(); ui.accept(); ui.loaded(); ui.rerun();
  assert.equal(ui.scripts.length, 1);
  assert.equal(ui.commands().filter(([command]) => command === 'event').length, 1);
  assert.match(ui.cookieWrites[0], /Path=\/; SameSite=Lax; Secure; Domain=\.corkrobotics\.com/);
});

test('remembered acceptance loads on both production hosts but never on preview, local, subdomain, or HTTP hosts', () => {
  for (const url of ['https://corkrobotics.com/', 'https://www.corkrobotics.com/gallery']) {
    const ui = fixture({ url, cookies: { cork_analytics_consent: 'accepted' } });
    assert.equal(ui.scripts.length, 1);
    ui.loaded();
    assert.equal(ui.commands().filter(([command]) => command === 'event').length, 1);
    assert.equal(ui.panel().hidden, true);
  }
  for (const url of ['https://preview.corkrobotics.com/', 'https://branch.pages.dev/', 'http://localhost:8788/', 'http://corkrobotics.com/', 'https://corkrobotics.com.example.invalid/']) {
    const ui = fixture({ url, cookies: { cork_analytics_consent: 'accepted' } });
    assert.equal(ui.scripts.length, 0, url);
    assert.equal(ui.window.dataLayer, undefined, url);
    assert.equal(ui.panel(), undefined, url);
  }
  for (const measurementId of ['', 'AW-12345', 'G-invalid', '<script>']) {
    const ui = fixture({ measurementId, cookies: { cork_analytics_consent: 'accepted' } });
    assert.equal(ui.scripts.length, 0);
    assert.equal(ui.window.dataLayer, undefined);
  }
});

test('owner exclusion overrides saved consent and survives across apex/www pages with a domain cookie', () => {
  const ui = fixture({ url: 'https://corkrobotics.com/?analytics=off&utm_source=test#keep', cookies: { cork_analytics_consent: 'accepted' } });
  assert.equal(ui.scripts.length, 0);
  assert.equal(ui.window.gtag, undefined);
  assert.equal(ui.jar.get('cork_analytics_optout'), '1');
  assert.equal(ui.mirror.has('cork_analytics_optout'), false, 'do not create an origin-local mirror that cannot be undone across subdomains');
  assert.equal(ui.replacements.length, 1);
  assert.equal(ui.replacements[0].target, '/?utm_source=test#keep');
  assert.match(ui.cookieWrites[0], /Max-Age=31536000; Path=\/; SameSite=Lax; Secure; Domain=\.corkrobotics\.com/);
  ui.preferences(); ui.accept();
  assert.equal(ui.scripts.length, 0, 'Accept is disabled during explicit browser exclusion');
  for (const url of ['https://corkrobotics.com/downloads', 'https://www.corkrobotics.com/launch']) {
    const next = fixture({ url, cookies: Object.fromEntries(ui.jar) });
    assert.equal(next.scripts.length, 0);
  }
});

test('undo clears host and domain exclusions without granting analytics consent', () => {
  const ui = fixture({ url: 'https://www.corkrobotics.com/launch?analytics=on&token=keep', cookies: { cork_analytics_optout: '1', cork_analytics_consent: 'declined' } });
  assert.equal(ui.jar.has('cork_analytics_optout'), false);
  assert.equal(ui.mirror.has('cork_analytics_optout'), false);
  assert.equal(ui.jar.get('cork_analytics_consent'), 'declined');
  assert.equal(ui.scripts.length, 0);
  assert.equal(ui.replacements[0].target, '/launch?token=keep');
  assert.equal(ui.cookieWrites.filter((value) => value.startsWith('cork_analytics_optout=')).length, 2);
  const accepted = fixture({ url: 'https://corkrobotics.com/?analytics=on', cookies: { cork_analytics_consent: 'accepted', cork_analytics_optout: '1' } });
  assert.equal(accepted.scripts.length, 1);
  const otherHost = fixture({ url: 'https://www.corkrobotics.com/', cookies: Object.fromEntries(accepted.jar) });
  assert.equal(otherHost.scripts.length, 1, 'undo remains effective on the other production host');
});

test('duplicate controls favor exclusion and every control value is removed before Google can load', () => {
  const ui = fixture({ url: 'https://corkrobotics.com/?analytics=on&analytics=off&utm_source=test', cookies: { cork_analytics_consent: 'accepted' } });
  assert.equal(ui.scripts.length, 0);
  assert.equal(ui.jar.get('cork_analytics_optout'), '1');
  assert.equal(ui.replacements[0].target, '/?utm_source=test');
});

test('decline before asynchronous load prevents configuration and pageview; later affirmative acceptance recovers once', () => {
  const ui = fixture();
  ui.accept();
  ui.preferences(); ui.decline();
  assert.equal(ui.window[`ga-disable-${CONFIG}`], true);
  ui.loaded();
  assert.equal(ui.commands().filter(([command]) => command === 'config' || command === 'event').length, 0);
  ui.preferences(); ui.accept();
  assert.equal(ui.window[`ga-disable-${CONFIG}`], false);
  assert.equal(ui.commands().filter(([command]) => command === 'event').length, 1);
  ui.preferences(); ui.decline();
  const count = ui.commands().length;
  ui.loaded();
  assert.equal(ui.commands().length, count);
  assert.equal(ui.window[`ga-disable-${CONFIG}`], true);
});

test('pending loads re-read domain cookies when another page excludes visits or withdraws consent', () => {
  for (const [name, value] of [['cork_analytics_optout', '1'], ['cork_analytics_consent', 'declined']]) {
    const ui = fixture({ cookies: { cork_analytics_consent: 'accepted' } });
    assert.equal(ui.scripts.length, 1);
    ui.jar.set(name, value);
    ui.loaded();
    assert.equal(ui.commands().filter(([command]) => command === 'config' || command === 'event').length, 0);
    assert.equal(ui.window[`ga-disable-${CONFIG}`], true);
  }
});

test('an existing page reconciles exclusion on focus and before preferences reopen', () => {
  const ui = fixture({ cookies: { cork_analytics_consent: 'accepted' } });
  ui.loaded();
  ui.jar.set('cork_analytics_optout', '1');
  ui.window.listeners.get('focus')();
  assert.equal(ui.window[`ga-disable-${CONFIG}`], true);
  ui.preferences();
  assert.equal(ui.panel().querySelector('[data-analytics-choice="accepted"]').disabled, true);
  assert.equal(ui.panel().querySelector('.cork-analytics-exclusion').hidden, false);
  ui.accept();
  assert.equal(ui.window[`ga-disable-${CONFIG}`], true);
});

test('withdrawal deletes accessible GA cookies without deleting signup or unrelated functional cookies', () => {
  const ui = fixture({ cookies: { cork_analytics_consent: 'accepted', _ga: 'client', _ga_TEST123456: 'session', unrelated_cookie: 'retained' } });
  ui.loaded(); ui.preferences(); ui.decline();
  assert.equal(ui.jar.has('_ga'), false);
  assert.equal(ui.jar.has('_ga_TEST123456'), false);
  assert.equal(ui.jar.get('unrelated_cookie'), 'retained');
  assert.equal(ui.jar.get('cork_analytics_consent'), 'declined');
  assert.equal(ui.commands().filter(([command]) => command === 'consent').length, 1, 'no denied update that might create a cookieless ping');
});

test('unavailable storage or cookies leaves the site and choices usable and never assumes consent', () => {
  const ui = fixture({ blockedStorage: true, blockedCookies: true });
  assert.equal(ui.scripts.length, 0);
  ui.decline();
  assert.equal(ui.scripts.length, 0);
  ui.preferences(); ui.accept();
  assert.equal(ui.scripts.length, 1, 'current affirmative choice may apply to this page even if persistence is blocked');
  ui.loaded();
  const excluded = fixture({ url: 'https://corkrobotics.com/?analytics=off', blockedStorage: true, blockedCookies: true });
  assert.equal(excluded.scripts.length, 0);
  assert.match(excluded.body.children[0].textContent, /blocked saving/);
});

test('URL payloads omit hashes, arbitrary queries, credentials, email-like or invalid campaign values and referrer queries', () => {
  const ui = fixture({ url: 'https://corkrobotics.com/launch?utm_source=valid-source&utm_medium=email&utm_campaign=person%40example.invalid&utm_content=%3Cscript%3E&utm_id=42&auth=SECRET#PRIVATE', referrer: 'https://person:password@example.invalid/private/path?secret=SECRET', cookies: { cork_analytics_consent: 'accepted' } });
  ui.loaded();
  const page = ui.commands().find(([command]) => command === 'event')[2];
  assert.equal(page.page_location, 'https://corkrobotics.com/launch?utm_source=valid-source&utm_medium=email&utm_id=42');
  assert.equal(page.page_referrer, 'https://example.invalid/');
  assert.doesNotMatch(JSON.stringify(ui.commands()), /SECRET|PRIVATE|password|person@|person%40|person:|<script>/);
});

test('unknown paths and dynamic titles cannot disclose emails or secret path components', () => {
  const ui = fixture({ url: 'https://corkrobotics.com/reset/person%40example.invalid/SECRET?utm_source=private-label',
    title: 'Secret reset for person@example.invalid PRIVATE_TOKEN', cookies: { cork_analytics_consent: 'accepted' } });
  ui.loaded();
  const page = ui.commands().find(([command]) => command === 'event')[2];
  assert.equal(page.page_location, 'https://corkrobotics.com/404');
  assert.equal(page.page_title, 'Page not found — Cork Robotics');
  assert.doesNotMatch(JSON.stringify(ui.commands()), /person%40|person@|SECRET|PRIVATE_TOKEN|private-label/);
});

test('legitimate HTML, index and trailing-slash aliases map to fixed public routes and titles', () => {
  for (const [path, canonical, title] of [
    ['/index.html', '/', 'CorkBot — A modular robot by Cork Robotics'],
    ['/downloads.html', '/downloads', 'Software & downloads — Cork Robotics'],
    ['/gallery/', '/gallery', 'Concept gallery — Cork Robotics'],
    ['/reservation-terms.html', '/reservation-terms', 'CorkBot launch list — Cork Robotics'],
    ['/support.html', '/support', 'Cork Robotics apparel — Cork Robotics'],
    ['/marketapp/downloads/index.html', '/marketapp/downloads', 'Download MarketApp Bull Pen — Cork Robotics'],
    ['/marketapp/privacy/index', '/marketapp/privacy', 'MarketApp Privacy Policy — Cork Robotics'],
  ]) {
    const ui = fixture({ url: `https://corkrobotics.com${path}`, title: 'DYNAMIC_SECRET', cookies: { cork_analytics_consent: 'accepted' } });
    ui.loaded();
    const page = ui.commands().find(([command]) => command === 'event')[2];
    assert.equal(page.page_location, `https://corkrobotics.com${canonical}`);
    assert.equal(page.page_title, title);
    assert.doesNotMatch(JSON.stringify(ui.commands()), /DYNAMIC_SECRET/);
  }
});

test('preferences reopen with keyboard focus and Escape returns focus without changing consent', () => {
  const ui = fixture({ cookies: { cork_analytics_consent: 'declined' }, loading: true });
  assert.equal(ui.panel(), undefined);
  ui.ready();
  const button = ui.footer.children[0];
  button.focus(); ui.preferences();
  assert.equal(ui.panel().hidden, false);
  assert.equal(ui.document.activeElement, ui.panel());
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  assert.equal(button.getAttribute('aria-controls'), 'cork-analytics-panel');
  assert.match(ui.panel().innerHTML, /data-analytics-choice="accepted">Accept/);
  assert.match(ui.panel().innerHTML, /data-analytics-choice="declined">Decline/);
  ui.panel().listeners.get('keydown')({ key: 'Escape' });
  assert.equal(ui.panel().hidden, true);
  assert.equal(ui.document.activeElement, button);
  assert.equal(ui.jar.get('cork_analytics_consent'), 'declined');
});

test('all shipped HTML includes shared assets in order, and the public build includes them without tools or private files', async () => {
  const site = resolve(new URL('..', import.meta.url).pathname);
  const pages = PUBLIC_FILES.filter((path) => path.endsWith('.html'));
  async function walk(directory) {
    for (const entry of await readdir(resolve(site, directory), { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && path.endsWith('.html')) pages.push(path);
    }
  }
  for (const directory of PUBLIC_DIRECTORIES) {
    try { await walk(directory); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  assert.equal(pages.length, 12);
  for (const path of pages) {
    const html = await readFile(resolve(site, path), 'utf8');
    assert.equal((html.match(/\/assets\/js\/analytics\.js\?/g) || []).length, 1, path);
    assert.match(html, /analytics-config\.js\?v=20261011" defer/);
    assert.ok(html.indexOf('analytics-config.js') < html.indexOf('analytics.js'), path);
    assert.match(html, /\/assets\/css\/analytics\.css\?v=20261011/);
    assert.doesNotMatch(html, /googletagmanager\.com|google-analytics\.com/, `${path} must not directly load Google`);
  }
  const root = await mkdtemp(resolve(tmpdir(), 'cork-analytics-build-'));
  try {
    for (const path of [...pages, 'assets/js/analytics.js', 'assets/js/analytics-config.js', 'assets/css/analytics.css', '_routes.json', 'tools/private.mjs']) {
      await mkdir(dirname(resolve(root, path)), { recursive: true });
      await writeFile(resolve(root, path), path === 'tools/private.mjs' ? 'private tooling' : await readFile(resolve(site, path)));
    }
    const output = await buildLaunchPages(root, { branch: 'main' });
    for (const path of [...pages, 'assets/js/analytics.js', 'assets/js/analytics-config.js', 'assets/css/analytics.css']) assert.ok((await readFile(resolve(output.directory, path))).length);
    await assert.rejects(readFile(resolve(output.directory, 'tools/private.mjs')), { code: 'ENOENT' });
    const privacy = await readFile(resolve(output.directory, 'launch-privacy.html'), 'utf8');
    assert.match(privacy, /id="website-analytics"/);
    assert.match(privacy, /180 days/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
