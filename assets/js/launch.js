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
  let apiReady = false;
  let pending = false;
  let requiresChallenge = false;
  let challengeToken = '';
  let challengeId;
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

  const configureChallenge = (siteKey) => {
    requiresChallenge = true;
    challenge.hidden = false;
    message('Preparing the security check…');
    updateSubmit();
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.addEventListener('load', () => {
      try {
        challengeId = window.turnstile.render(challenge, {
          sitekey: siteKey,
          action: 'launch_signup',
          theme: 'light',
          size: 'flexible',
          callback: (token) => {
            challengeToken = token;
            if (!pending && !submissionMessage) message('');
            updateSubmit();
          },
          'expired-callback': () => {
            challengeToken = '';
            if (!pending && !submissionMessage) message('Please complete the security check again.');
            updateSubmit();
          },
          'error-callback': () => {
            challengeToken = '';
            if (!pending && !submissionMessage) message('The security check couldn’t load. Refresh the page to try again.', true);
            updateSubmit();
          },
        });
      } catch {
        message('The security check couldn’t load. Refresh the page to try again.', true);
      }
    });
    script.addEventListener('error', () => {
      message('The security check couldn’t load. Refresh the page to try again.', true);
    });
    document.head.append(script);
  };

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
    submitLabel.textContent = 'Joining…';
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
      submitLabel.textContent = 'Notify me';
      form.removeAttribute('aria-busy');
      if (requiresChallenge) {
        challengeToken = '';
        if (challengeId !== undefined && window.turnstile) {
          try {
            window.turnstile.reset(challengeId);
          } catch {
            if (!submissionMessage) message('The security check needs a refresh before another attempt.', true);
          }
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
