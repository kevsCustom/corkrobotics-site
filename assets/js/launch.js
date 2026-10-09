(() => {
  document.querySelectorAll('[data-year]').forEach((element) => {
    element.textContent = new Date().getFullYear();
  });
  if (!document.querySelector('[data-launch-page]')) return;

  const form = document.querySelector('#launch-signup');
  const email = document.querySelector('#signup-email');
  const consent = document.querySelector('#signup-consent');
  const website = document.querySelector('#signup-website');
  const submit = document.querySelector('#signup-submit');
  const submitLabel = document.querySelector('[data-submit-label]');
  const status = document.querySelector('#signup-status');
  const availability = document.querySelector('#signup-availability');
  const challenge = document.querySelector('#signup-turnstile');
  const securityHelp = document.querySelector('#signup-security-help');
  const securityNotice = document.querySelector('#signup-security-notice');
  const securityRetry = document.querySelector('#signup-security-retry');
  let apiReady = false;
  let pending = false;
  let requiresChallenge = false;
  let challengeToken = '';
  let challengeId;
  let challengeAttempt = 0;
  let challengeTimer;
  let scriptTimer;
  let challengeScript;
  let challengeOnloadName;
  let challengeSiteKey = '';
  let submissionMessage = false;

  const secureURL = (value) => {
    if (typeof value !== 'string') return null;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password ? url : null;
    } catch {
      return null;
    }
  };
  const updateSubmit = () => {
    submit.disabled = pending || !apiReady || (requiresChallenge && !challengeToken);
    securityRetry.disabled = pending || !apiReady;
  };
  const message = (text, error = false, fromSubmission = false) => {
    submissionMessage = fromSubmission;
    status.textContent = text;
    status.dataset.error = String(error);
  };
  const requestJSON = async (url, options = {}) => {
    const { timeoutMs = 30000, ...requestOptions } = options;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...requestOptions, signal: controller.signal });
      const body = await response.json();
      return { response, body };
    } finally {
      clearTimeout(timeout);
    }
  };
  const showUnavailable = () => {
    apiReady = false;
    availability.hidden = true;
    form.hidden = true;
    document.querySelector('#signup-unavailable').hidden = false;
    updateSubmit();
  };

  const clearSecurityTimers = () => {
    clearTimeout(scriptTimer);
    clearTimeout(challengeTimer);
  };
  const showSecurityIssue = (text, code) => {
    securityNotice.textContent = text;
    securityHelp.hidden = false;
    // Only the provider's fixed numeric error code is diagnostic data.
    // Never expose the token, exception text, or provider response here.
    const numericCode = typeof code === 'string' || (typeof code === 'number' && Number.isInteger(code)) ? String(code) : '';
    if (/^\d{6}$/.test(numericCode)) securityHelp.dataset.turnstileCode = numericCode;
    else delete securityHelp.dataset.turnstileCode;
  };
  const removeChallenge = () => {
    if (challengeOnloadName) delete window[challengeOnloadName];
    challengeOnloadName = undefined;
    if (challengeId !== undefined && window.turnstile) {
      try { window.turnstile.remove(challengeId); } catch { /* Clear the local container below. */ }
    }
    challengeId = undefined;
    challenge.replaceChildren();
  };
  const configureChallenge = (siteKey) => {
    challengeSiteKey = siteKey;
    const attempt = ++challengeAttempt;
    clearSecurityTimers();
    challengeToken = '';
    removeChallenge();
    requiresChallenge = true;
    challenge.hidden = false;
    securityHelp.hidden = true;
    delete securityHelp.dataset.turnstileCode;
    if (!submissionMessage) message('Preparing the security check…');
    updateSubmit();
    const current = () => attempt === challengeAttempt && apiReady && !form.hidden;
    const failed = (text, code) => {
      if (!current()) return;
      clearSecurityTimers();
      challengeToken = '';
      if (!pending && !submissionMessage) message('');
      showSecurityIssue(text, code);
      updateSubmit();
    };
    const render = () => {
      if (!current() || challengeId !== undefined) return;
      try {
        if (typeof window.turnstile?.render !== 'function') throw new Error('Not ready');
        clearTimeout(scriptTimer);
        challengeTimer = setTimeout(() => {
          if (current() && !challengeToken) {
            if (!pending && !submissionMessage) message('');
            showSecurityIssue('The security check is taking longer than expected. You can try it again below.');
          }
        }, 45000);
        challengeId = window.turnstile.render(challenge, {
          sitekey: siteKey,
          action: 'launch_signup',
          theme: 'light',
          size: 'flexible',
          retry: 'never',
          'refresh-timeout': 'manual',
          'refresh-expired': 'manual',
          callback: (token) => {
            if (!current() || pending || typeof token !== 'string' || !token) return;
            clearSecurityTimers();
            challengeToken = token;
            securityHelp.hidden = true;
            delete securityHelp.dataset.turnstileCode;
            if (!pending && !submissionMessage) message('');
            updateSubmit();
          },
          'expired-callback': () => {
            failed('The security check expired. Please try it again before sending your signup.');
          },
          'error-callback': (code) => {
            failed('The security check couldn’t finish. Try it again below. If it keeps happening, try another browser.', code);
            return false;
          },
          'timeout-callback': () => failed('The security check timed out. Please try it again below.'),
          'unsupported-callback': () => failed('This browser couldn’t complete the security check. Please try another browser.'),
        });
      } catch {
        failed('The security check couldn’t load. Please try it again below.');
      }
    };
    // The SDK onload callback supports async/defer; turnstile.ready() does not.
    scriptTimer = setTimeout(() => failed('The security check couldn’t load. Please try it again below.'), 15000);
    if (typeof window.turnstile?.render === 'function') return render();
    challengeScript?.remove();
    const script = document.createElement('script');
    challengeScript = script;
    challengeOnloadName = `corkbotTurnstileLoaded${attempt}`;
    window[challengeOnloadName] = render;
    script.src = `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=${challengeOnloadName}`;
    script.async = true;
    script.defer = true;
    script.addEventListener('error', () => failed('The security check couldn’t load. Please try it again below.'));
    document.head.append(script);
  };
  securityRetry.addEventListener('click', () => {
    if (pending || !apiReady) return;
    configureChallenge(challengeSiteKey);
  });

  const configureLinks = (config) => {
    const checkout = secureURL(config.vip_checkout_url);
    const terms = secureURL(config.reservation_terms_url);
    const refundDeadline = typeof config.vip_refund_deadline === 'string' ? config.vip_refund_deadline.trim() : '';
    const benefit = typeof config.vip_benefit === 'string' ? config.vip_benefit.trim() : '';
    const amount = Number(config.vip_amount);
    if (config.vip_available === true && checkout && terms && refundDeadline && benefit && Number.isFinite(amount) && amount > 0) {
      document.querySelector('#vip-status').textContent = 'Optional VIP reservation';
      document.querySelector('#vip-description').textContent = `A refundable $${amount} VIP reservation. ${benefit}`;
      document.querySelector('#vip-details').textContent = 'Read the offer and refund terms before reserving. Your Kickstarter pledge is made separately.';
      const link = document.querySelector('#vip-checkout-link');
      link.href = checkout.href;
      link.hidden = false;
      document.querySelector('#vip-join-link').hidden = true;
      document.querySelector('#vip-draft-terms').hidden = true;
      document.querySelector('#vip-terms-link').href = terms.href;
      document.querySelector('#vip-refund-deadline').textContent = `Refund deadline: ${refundDeadline}`;
      document.querySelector('#vip-terms').hidden = false;
    }
    const kickstarter = secureURL(config.kickstarter_url);
    if (kickstarter && ['kickstarter.com', 'www.kickstarter.com'].includes(kickstarter.hostname) && kickstarter.pathname.startsWith('/projects/')) {
      document.querySelector('#kickstarter-link').href = kickstarter.href;
      document.querySelector('#kickstarter-follow').hidden = false;
    }
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (pending || !apiReady) return;
    if (!form.reportValidity()) return;
    if (requiresChallenge && !challengeToken) {
      message('Please complete the security check before joining.', true);
      return;
    }
    pending = true;
    form.setAttribute('aria-busy', 'true');
    submitLabel.textContent = 'Submitting…';
    message('Sending your signup…');
    updateSubmit();
    const params = new URLSearchParams(window.location.search);
    const source = {};
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'].forEach((key) => {
      const value = (params.get(key) || '').replace(/[^A-Za-z0-9 _./:-]/g, '').trim().slice(0, 120);
      if (value) source[key] = value;
    });
    const payload = { email: email.value.trim(), consent: consent.checked === true, website: website.value, source };
    if (requiresChallenge) payload.turnstile_token = challengeToken;
    try {
      const { response, body } = await requestJSON('/api/launch/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'same-origin',
      });
      if (!response.ok || body?.ok !== true || !['confirm_email', 'subscribed'].includes(body.next)) {
        const serverMessage = body?.message ?? body?.error;
        const safeError = typeof serverMessage === 'string' && serverMessage.trim() && serverMessage.length <= 300 && /\s/.test(serverMessage) ? serverMessage : 'Your signup couldn’t be completed. Please try again.';
        throw new Error(safeError);
      }
      if (body.next === 'subscribed') {
        document.querySelector('#success-mark').textContent = '✓';
        document.querySelector('#success-title').textContent = 'You’re on the list.';
        document.querySelector('#success-description').textContent = 'This email is already confirmed. Watch your inbox for CorkBot product updates and launch news.';
      }
      apiReady = false;
      form.hidden = true;
      message('');
      const success = document.querySelector('#signup-success');
      success.hidden = false;
      success.focus();
    } catch (error) {
      const text = error.name === 'AbortError' || error instanceof TypeError || error instanceof SyntaxError ? 'We could not confirm signup right now. Check your inbox before trying again.' : error.message;
      message(text, true, true);
    } finally {
      pending = false;
      submitLabel.textContent = 'Send confirmation';
      form.removeAttribute('aria-busy');
      if (requiresChallenge) {
        challengeToken = '';
        if (apiReady && !form.hidden) {
          configureChallenge(challengeSiteKey);
        } else {
          ++challengeAttempt;
          clearSecurityTimers();
          removeChallenge();
          securityHelp.hidden = true;
        }
      }
      updateSubmit();
    }
  });

  (async () => {
    try {
      const { response, body: config } = await requestJSON('/api/launch/config', { timeoutMs: 10000, cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!response.ok || !config || typeof config !== 'object') throw new Error('Configuration unavailable');
      configureLinks(config);
      if (config.signup_available !== true) return showUnavailable();
      const hostedURL = secureURL(config.signup_url);
      if (config.signup_mode === 'hosted' && hostedURL) {
        availability.hidden = true;
        document.querySelector('#signup-hosted-link').href = hostedURL.href;
        document.querySelector('#signup-hosted').hidden = false;
      } else if (config.signup_mode === 'api' && typeof config.turnstile_site_key === 'string' && config.turnstile_site_key.trim()) {
        apiReady = true;
        availability.hidden = true;
        form.hidden = false;
        configureChallenge(config.turnstile_site_key.trim());
        updateSubmit();
      } else {
        showUnavailable();
      }
    } catch {
      showUnavailable();
    }
  })();
})();
