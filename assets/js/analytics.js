(() => {
  'use strict';
  if (window.__corkAnalyticsInitialized) return;
  window.__corkAnalyticsInitialized = true;

  const CONSENT_COOKIE = 'cork_analytics_consent';
  const OPTOUT_COOKIE = 'cork_analytics_optout';
  const CONSENT_SECONDS = 180 * 24 * 60 * 60;
  const OPTOUT_SECONDS = 365 * 24 * 60 * 60;
  const production = ['corkrobotics.com', 'www.corkrobotics.com'].includes(window.location.hostname)
    && window.location.protocol === 'https:';
  const measurementId = window.CORK_ANALYTICS_CONFIG?.measurementId || '';
  const configured = /^G-[A-Z0-9]+$/.test(measurementId);
  const campaignKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_id', 'utm_term', 'utm_content'];
  const pageTitles = {
    '/': 'CorkBot — A modular robot by Cork Robotics',
    '/404': 'Page not found — Cork Robotics',
    '/downloads': 'Software & downloads — Cork Robotics',
    '/gallery': 'Concept gallery — Cork Robotics',
    '/launch': 'CorkBot launch updates — Cork Robotics',
    '/launch-privacy': 'Website and launch email privacy — Cork Robotics',
    '/thank-you': 'Follow the CorkBot build — Cork Robotics',
    '/reservation-terms': 'CorkBot launch list — Cork Robotics',
    '/support': 'Cork Robotics apparel — Cork Robotics',
    '/how-it-works': 'How CorkBot Works | Cork Robotics',
    '/uses/business-customization': 'CorkBot for Small Business Customization | Cork Robotics',
    '/uses/art-and-making': 'CorkBot for Artists and Makers | Cork Robotics',
    '/uses/robotics-learning': 'Explore Robotics with CorkBot | Cork Robotics',
    '/marketapp/downloads': 'Download MarketApp Bull Pen — Cork Robotics',
    '/marketapp/privacy': 'MarketApp Privacy Policy — Cork Robotics',
    '/marketapp/terms': 'MarketApp Terms of Use — Cork Robotics',
  };
  let started = false;
  let scriptReady = false;
  let pageSent = false;
  let panel;
  let preferenceButton;
  let status;
  let previousFocus;
  let statusTimer;

  function readCookie(name) {
    try {
      const prefix = `${name}=`;
      const entry = document.cookie.split(';').map((value) => value.trim()).find((value) => value.startsWith(prefix));
      return entry ? decodeURIComponent(entry.slice(prefix.length)) : '';
    } catch (_) { return null; }
  }

  function writeCookie(name, value, seconds, domain = production) {
    try {
      document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${seconds}; Path=/; SameSite=Lax`
        + (window.location.protocol === 'https:' ? '; Secure' : '')
        + (domain ? '; Domain=.corkrobotics.com' : '');
    } catch (_) { /* Cookie restrictions must never break the site. */ }
  }

  function setOptout(enabled) {
    writeCookie(OPTOUT_COOKIE, enabled ? '1' : '', enabled ? OPTOUT_SECONDS : 0);
    // Clear an older host-only cookie too when undoing the exclusion.
    if (!enabled) writeCookie(OPTOUT_COOKIE, '', 0, false);
  }

  // A domain cookie is shared by apex/www; origin-local storage would make undo inconsistent.
  let optedOut = readCookie(OPTOUT_COOKIE) === '1';
  let consent = readCookie(CONSENT_COOKIE);
  let optoutPersistenceFailed = false;
  let consentPersistenceFailed = false;
  let exclusionMessage = '';
  try {
    const url = new URL(window.location.href);
    const controls = url.searchParams.getAll('analytics');
    const control = controls.includes('off') ? 'off' : controls.includes('on') ? 'on' : '';
    if (control === 'off' || control === 'on') {
      optedOut = control === 'off';
      setOptout(optedOut);
      const savedOptout = readCookie(OPTOUT_COOKIE);
      optoutPersistenceFailed = savedOptout === null || (optedOut ? savedOptout !== '1' : savedOptout === '1');
      exclusionMessage = optedOut
        ? 'Visits from this browser are excluded from Google Analytics.'
        : 'Browser exclusion removed. Google Analytics still follows your analytics preference.';
      if (optedOut && optoutPersistenceFailed) {
        exclusionMessage = 'Analytics is off for this page. Your browser blocked saving the exclusion for future pages.';
      }
      url.searchParams.delete('analytics');
      // Remove only the exclusion control; leave campaign links and page anchors intact.
      try { window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash); }
      catch (_) { /* Exclusion applies even when history changes are unavailable. */ }
    }
  } catch (_) { /* Invalid or restricted URL state means no query control. */ }

  function publicPagePath(pathname) {
    let path = pathname.replace(/\/+$/, '') || '/';
    if (path.endsWith('.html')) path = path.slice(0, -5);
    if (path === '/index') path = '/';
    else if (path.endsWith('/index')) path = path.slice(0, -6);
    return Object.prototype.hasOwnProperty.call(pageTitles, path) ? path : '/404';
  }

  function sanitizedPage() {
    try {
      const original = new URL(window.location.href);
      const path = publicPagePath(original.pathname);
      const clean = new URL(original.origin + path);
      for (const key of path === '/404' ? [] : campaignKeys) {
        const value = original.searchParams.get(key);
        // Campaign labels only: do not forward arbitrary query parameters or email-like values.
        if (value && /^[A-Za-z0-9][A-Za-z0-9._ -]{0,99}$/.test(value)) clean.searchParams.set(key, value);
      }
      return { page_location: clean.href, page_title: pageTitles[path] };
    } catch (_) { return { page_location: 'https://corkrobotics.com/404', page_title: pageTitles['/404'] }; }
  }

  function sanitizedReferrer() {
    try {
      const referrer = new URL(document.referrer);
      return ['http:', 'https:'].includes(referrer.protocol) ? referrer.origin + '/' : '';
    } catch (_) { return ''; }
  }

  function clearAnalyticsCookies() {
    let names = [];
    try { names = document.cookie.split(';').map((value) => value.trim().split('=')[0]); }
    catch (_) { return; }
    for (const name of names) {
      if (!/^_ga(?:_|$)/.test(name)) continue;
      writeCookie(name, '', 0);
      writeCookie(name, '', 0, false);
    }
  }

  function stopAnalytics() {
    if (configured) window[`ga-disable-${measurementId}`] = true;
    clearAnalyticsCookies();
    // Do not send a denied-consent update: even cookieless Google pings are unwanted.
  }

  function refreshPreferences() {
    // Another tab/page can revoke these shared domain preferences while gtag.js is pending.
    const savedOptout = readCookie(OPTOUT_COOKIE);
    const savedConsent = readCookie(CONSENT_COOKIE);
    if (savedOptout !== null && !optoutPersistenceFailed) optedOut = savedOptout === '1';
    if (savedConsent !== null && !consentPersistenceFailed) consent = savedConsent;
    if (optedOut || consent !== 'accepted') stopAnalytics();
    if (panel) {
      panel.querySelector('[data-analytics-choice="accepted"]').disabled = optedOut;
      panel.querySelector('.cork-analytics-exclusion').hidden = !optedOut;
    }
  }

  function startAnalytics() {
    refreshPreferences();
    if (!production || !configured || optedOut || consent !== 'accepted') return;
    window[`ga-disable-${measurementId}`] = false;
    if (started) { if (scriptReady) sendPage(); return; }
    started = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    // Basic consent mode: all of this, including loading gtag.js, occurs after acceptance.
    window.gtag('consent', 'default', {
      analytics_storage: 'granted', ad_storage: 'denied',
      ad_user_data: 'denied', ad_personalization: 'denied',
    });
    window.gtag('js', new Date());
    const script = document.createElement('script');
    script.id = 'cork-google-analytics';
    script.async = true;
    script.referrerPolicy = 'origin';
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    script.onload = () => { scriptReady = true; sendPage(); };
    document.head.appendChild(script);
  }

  function sendPage() {
    // Consent may have been withdrawn while the Google script was loading.
    refreshPreferences();
    if (pageSent || !production || !configured || optedOut || consent !== 'accepted') return;
    pageSent = true;
    const page = { ...sanitizedPage(), page_referrer: sanitizedReferrer() };
    window.gtag('set', page);
    window.gtag('config', measurementId, {
      ...page, send_page_view: false,
      allow_google_signals: false, allow_ad_personalization_signals: false,
      cookie_domain: 'corkrobotics.com', cookie_path: '/',
      cookie_expires: CONSENT_SECONDS, cookie_update: false,
      cookie_flags: 'SameSite=Lax;Secure',
    });
    window.gtag('event', 'page_view', { ...page, send_to: measurementId });
  }

  function announce(message) {
    if (!status) return;
    status.textContent = message;
    window.clearTimeout(statusTimer);
    statusTimer = window.setTimeout(() => { status.textContent = ''; }, 10000);
  }

  function closePanel() {
    panel.hidden = true;
    preferenceButton.setAttribute('aria-expanded', 'false');
    if (previousFocus?.isConnected) previousFocus.focus();
  }

  function choose(value) {
    consent = value;
    writeCookie(CONSENT_COOKIE, value, CONSENT_SECONDS);
    consentPersistenceFailed = readCookie(CONSENT_COOKIE) !== value;
    if (value === 'accepted') startAnalytics();
    else stopAnalytics();
    closePanel();
    announce(value === 'accepted' && !optedOut
      ? 'Optional website analytics allowed.'
      : 'Optional Google Analytics is off. You can use the whole site.');
  }

  function showPanel(focus = false) {
    refreshPreferences();
    status.textContent = '';
    panel.hidden = false;
    preferenceButton.setAttribute('aria-expanded', 'true');
    if (focus) { previousFocus = document.activeElement; panel.focus(); }
  }

  function addInterface() {
    status = document.createElement('p');
    status.className = 'cork-analytics-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    document.body.appendChild(status);
    if (exclusionMessage) announce(exclusionMessage);
    if (!production || !configured) return;

    const footer = document.querySelector('footer nav') || document.querySelector('footer') || document.body;
    preferenceButton = document.createElement('button');
    preferenceButton.type = 'button';
    preferenceButton.className = 'cork-analytics-preferences';
    preferenceButton.textContent = 'Analytics preferences';
    preferenceButton.setAttribute('aria-controls', 'cork-analytics-panel');
    preferenceButton.setAttribute('aria-expanded', 'false');
    preferenceButton.addEventListener('click', () => showPanel(true));
    footer.appendChild(preferenceButton);

    panel = document.createElement('section');
    panel.id = 'cork-analytics-panel';
    panel.className = 'cork-analytics-panel';
    panel.hidden = true;
    panel.tabIndex = -1;
    panel.setAttribute('aria-labelledby', 'cork-analytics-title');
    panel.innerHTML = '<div><h2 id="cork-analytics-title">Optional website analytics</h2>'
      + '<p>May we use Google Analytics cookies to understand visits and returning browsers? '
      + 'You can decline and still use the whole site. <a href="/launch-privacy#website-analytics">Privacy notice</a>.</p>'
      + '<p class="cork-analytics-exclusion" hidden>Visits from this browser are excluded from Google Analytics.</p></div>'
      + '<div class="cork-analytics-actions"><button type="button" data-analytics-choice="accepted">Accept</button>'
      + '<button type="button" data-analytics-choice="declined">Decline</button>'
      + '<button type="button" class="cork-analytics-close" aria-label="Close analytics preferences">Close</button></div>';
    panel.querySelector('[data-analytics-choice="accepted"]').disabled = optedOut;
    panel.querySelector('.cork-analytics-exclusion').hidden = !optedOut;
    panel.querySelectorAll('[data-analytics-choice]').forEach((button) => {
      button.addEventListener('click', () => choose(button.getAttribute('data-analytics-choice')));
    });
    panel.querySelector('.cork-analytics-close').addEventListener('click', closePanel);
    panel.addEventListener('keydown', (event) => { if (event.key === 'Escape') closePanel(); });
    document.body.appendChild(panel);
    if (!optedOut && consent !== 'accepted' && consent !== 'declined') showPanel();
  }

  // Exclusion and remembered preferences are evaluated before any Google globals or requests.
  if (optedOut || consent !== 'accepted') stopAnalytics();
  startAnalytics();
  window.addEventListener('focus', refreshPreferences);
  document.addEventListener('visibilitychange', refreshPreferences);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addInterface, { once: true });
  else addInterface();
})();
