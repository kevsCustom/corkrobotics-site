# CorkBot launch signup and $5 VIP setup

Prepared October 9, 2026. This is implementation and account-setup guidance. No provider account, live subscriber, payment, refund, or cloud deployment was created by this work.

## Where records live

The website stays on the existing Cloudflare Pages project. Two scoped Pages Functions validate launch signup requests and call the chosen email provider. Brevo or MailerLite owns the subscriber records, confirmation flow, campaign sending, export, and unsubscribe status. This implementation creates no local database, D1 table, KV subscriber store, or browser email storage.

Cloudflare processes email submissions in transit. No application request logging, email logging, or provider-response logging is implemented. Normal platform/network metadata remains subject to Cloudflare and provider settings. Turnstile verification can receive the visitor IP; the email provider does not receive IP from these Functions. Keep platform logs free of request bodies, authorization headers, emails, and payment details.

If `SIGNUP_STORE_FIELDS=true`, the provider also receives the consent version, signup time, and supplied campaign attribution fields. Create those fields in the provider before enabling this setting. If it is false or unset, only email/list or group membership and the provider's confirmation records are stored by this code; campaign source attribution is not retained by the email provider. No storage-retention deadline is enforced in the application; choose and disclose retention in the company policy and provider settings.

Stripe separately owns hosted checkout, reservation receipts, and payment/refund records. The website neither handles card details nor verifies payment success. Visiting the thank-you page or returning from Stripe does not establish a paid reservation. Confirm that status in Stripe.

**Google Workspace remains the company inbox service.** Eligible Gmail/Workspace accounts can use mail merge for a manually managed launch list, but that is a separate operating workflow and is not an implemented signup adapter here. The recommended arrangement keeps Workspace for personal/company correspondence and uses Brevo or MailerLite for confirmation, subscriber status, unsubscribe handling, and launch sequences. Connecting the email provider does not require changing Google Workspace MX records or moving the company's inboxes. Add only the chosen provider's verified sender-authentication DNS records; preserve existing Google records and merge SPF requirements correctly rather than creating conflicting SPF records. Account setup must verify the actual provider instructions before any DNS edit.

## Choose one capture mode

1. **MailerLite hosted form:** least custom setup. Create a dedicated CorkBot launch form with double opt-in and copy its actual published share URL. The page opens the provider form; this site does not invent a form action or report API capture success. Provider form controls handle abuse. Use this when the account is ready before the custom API configuration.
2. **Brevo custom API:** the page's email input calls a dedicated double-opt-in endpoint after Turnstile. Set the launch list, DOI template, and same-origin redirect. Existing global and launch-list unsubscribes are preserved. This adapter does not implement Brevo Consent Groups; accounts using that feature need an explicit consent-group mapping and reviewed adapter before activation.
3. **MailerLite custom API:** enable double opt-in for API/integrations in the account, select a dedicated launch group, and verify the actual response using a fresh inbox. Existing active/unconfirmed subscribers are handled separately. Suppressed addresses require the provider's own signup form or operator support; this adapter never forces reactivation or replaces existing groups.

Only one mode is selected. Missing/invalid configuration yields `signup_available:false`; submitting to an unconfigured API returns 503. There is no mock success or temporary local collection.

## Account and environment setup

Configure the intended Cloudflare Pages project/environment through its existing dashboard/settings workflow. Preview and production environments need separate, intentional settings. Provider API keys and the Turnstile secret belong in encrypted secret variables; never put their values in source, chat, public JS, or command arguments. Local `.dev.vars` files are ignored and are not automatically deployed.

Public API modes always require both Turnstile keys. Create a managed Turnstile widget for the actual launch hostname. The browser uses action `launch_signup`; the server requires that action and the exact hostname of the request URL. Use separate intentional preview/local configuration; production never accepts a localhost hostname instead of its own. Siteverify runs before the email provider is called. Tokens are single-use; the browser must reset its own widget after every submission attempt.

### Brevo API variables

| Name | Type | Value/meaning |
| --- | --- | --- |
| `SIGNUP_PROVIDER` | Variable | `brevo` |
| `BREVO_API_KEY` | Secret | API key for the company Brevo account |
| `BREVO_LIST_ID` | Variable | Positive numeric ID of the CorkBot launch list |
| `BREVO_DOI_TEMPLATE_ID` | Variable | Positive numeric ID of the dedicated DOI email template |
| `BREVO_DOI_REDIRECT_URL` | Variable | `https://corkrobotics.com/thank-you` on this same site origin |
| `TURNSTILE_SITE_KEY` | Variable | Widget site key, public |
| `TURNSTILE_SECRET_KEY` | Secret | Matching widget secret |
| `SIGNUP_STORE_FIELDS` | Variable | Optional `true`, only after the fields below exist |

Create a company sender and authenticate the sending domain through Brevo. Prepare a DOI template using Brevo's required confirmation-link parameter for the API DOI flow (`{{ params.DOIurl }}` in the current API reference), and test the received email link. Keep the confirmation email limited to confirming the page's consent statement. A button directly linking to the thank-you page is not a confirmation link. The redirect is the destination *after* provider confirmation.

The adapter calls `GET /v3/contacts/{email}` to check global/list suppression and known launch-list membership. For new eligible signups it calls `POST /v3/contacts/doubleOptinConfirmation` with `email`, `includeListIds`, `templateId`, and `redirectionUrl`. It never sends `emailBlacklisted:false`, removes other lists, or opts someone into pixel tracking. An existing eligible launch-list member returns `subscribed`; a successful DOI request returns `confirm_email`.

### MailerLite API variables

| Name | Type | Value/meaning |
| --- | --- | --- |
| `SIGNUP_PROVIDER` | Variable | `mailerlite` |
| `MAILERLITE_API_KEY` | Secret | Company account API token |
| `MAILERLITE_GROUP_ID` | Variable | Existing dedicated CorkBot launch group ID |
| `MAILERLITE_API_DOI_VERIFIED` | Variable | `true` only after account setting and real-inbox acceptance are checked |
| `TURNSTILE_SITE_KEY` | Variable | Widget site key, public |
| `TURNSTILE_SECRET_KEY` | Secret | Matching widget secret |
| `SIGNUP_STORE_FIELDS` | Variable | Optional `true`, only after the fields below exist |

In MailerLite, open Account settings → Subscribe settings → enable **Double opt-in for API and integrations**. Customize the API DOI email/confirmation destination as the plan permits. This setting is separate from any individual form's DOI setting. Authenticate the company sender/domain. Build a welcome sequence triggered by joining the launch group after confirmation, and retain an unsubscribe link in marketing messages.

The adapter first fetches the subscriber by email, then uses the additive POST subscriber upsert with the launch group. It omits `status`, `resubscribe`, IP, and claimed confirmation timestamps. It returns `confirm_email` only for an actual `unconfirmed` result; `subscribed` requires both a known previous active subscriber and a returned active status. A fresh `active` result fails safely instead of claiming a confirmation email was sent. If this happens, recheck the account's API DOI setting and exclude the accidental unconfirmed-consent contact from sends until addressed. There is no automatic delete/rollback because that could damage an existing subscriber.

### MailerLite hosted form variables

| Name | Type | Value/meaning |
| --- | --- | --- |
| `SIGNUP_PROVIDER` | Variable | `mailerlite_form` |
| `MAILERLITE_FORM_URL` | Variable | Actual HTTPS published form URL on a MailerLite domain |
| `MAILERLITE_FORM_DOI_VERIFIED` | Variable | `true` after checking the form's DOI, consent, confirmation, and unsubscribe flow |

Allowed published form domains are `mailerlite.io`, `mailerlite.com`, or `mailerpage.io`, including subdomains. Custom branded provider form domains require a reviewed allowlist change. No provider API secret or site Turnstile pair is required for this mode. The site does not capture or transmit a visitor's typed email to the hosted form URL.

### Optional consent and attribution fields

Create these as text/string fields before setting `SIGNUP_STORE_FIELDS=true`. Use uppercase attribute names in Brevo and lowercase custom field keys in MailerLite:

| MailerLite field key | Brevo attribute name | Meaning |
| --- | --- | --- |
| `launch_consent_version` | `LAUNCH_CONSENT_VERSION` | Consent text version `corkbot-launch-2026-10-09` |
| `launch_signup_at` | `LAUNCH_SIGNUP_AT` | UTC time of accepted signup request, not proof of confirmation |
| `launch_utm_source` | `LAUNCH_UTM_SOURCE` | e.g. `instagram` |
| `launch_utm_medium` | `LAUNCH_UTM_MEDIUM` | e.g. `organic-social` |
| `launch_utm_campaign` | `LAUNCH_UTM_CAMPAIGN` | e.g. `corkbot-prelaunch` |
| `launch_utm_content` | `LAUNCH_UTM_CONTENT` | e.g. a demonstration/video variant ID |

Only four bounded campaign-source strings are accepted. Unknown fields, control characters, overlong bodies, missing consent, wrong content types, cross-origin requests, and filled honeypots fail before provider calls. Existing Brevo launch-list members are not mutated for attribution, so these fields represent the last applicable signup request rather than a complete acquisition-history database.

## $5 refundable VIP reservation

The public config fixes the proposed reservation at **$5 USD**. Checkout is hidden until every required setting is valid. No live checkout was configured. The company must finish the reward price, access window/capacity, refund deadline, cancellation process, delayed/canceled-launch handling, and customer contact method before activating it. The proposed approach is to refund at launch while retaining the defined VIP eligibility; that behavior is performed by the company in Stripe, not automated by this website.

Create a **one-time $5 USD** Stripe Payment Link with fixed quantity, the final benefit, clear refund terms, and a customer email. Publish matching reservation terms on this site. Enable receipts and refund notifications as appropriate. A paid reservation is separate from a Kickstarter pledge; Stripe does not deduct it from a future Kickstarter payment. Do not promise an early-bird discount or slot until the Kickstarter reward and capacity are defined.

| Name | Type | Value/meaning |
| --- | --- | --- |
| `VIP_ENABLED` | Variable | `true` only after the company approves and verifies the final live offer |
| `VIP_CHECKOUT_URL` | Variable | Actual live HTTPS `buy.stripe.com` Payment Link; test links are rejected |
| `VIP_BENEFIT` | Variable | Concrete benefit shown to the visitor, matching the published terms |
| `VIP_TERMS_URL` | Variable | Same-origin HTTPS URL, e.g. `https://corkrobotics.com/reservation-terms` |
| `VIP_REFUND_DEADLINE` | Variable | Exact future UTC time, e.g. a final agreed `YYYY-MM-DDTHH:mm:ssZ` |
| `KICKSTARTER_URL` | Variable | Optional real HTTPS Kickstarter project/prelaunch URL |

The backend can validate URL/config shape; it cannot verify a Payment Link's real amount, account ownership, reward promise, or successful payment. Verify these in the Stripe dashboard and by inspecting the actual checkout before setting `VIP_ENABLED=true`. Once the configured refund deadline has passed, config stops advertising VIP checkout. The Stripe Payment Link remains active until the company deactivates it separately.

**Manual payment/refund operations:** maintain an access-restricted reservation ledger using Stripe's payment IDs/customer emails. Do not copy that ledger into source or public artifacts. On an individual cancellation, locate the exact successful payment in Stripe and issue a full refund to its original payment method. At launch or the contractual refund deadline, identify outstanding CorkBot reservation payments and process the promised full refunds; dashboard bulk full refunds are available. Check final refund status rather than treating a request as completed. Retain eligibility separately according to the final terms. Processing fees may remain a company cost, and Stripe needs sufficient available balance for refunds. Handle failed/pending refunds and customer support through the dashboard. Marketing consent remains independent of paying; do not auto-add reservation buyers to the launch mailing list without consent.

## Safe Pages build and deployment

`functions/` belongs at project root **outside** the public build output. Serving the entire repository as static assets exposed function source in local verification, so this implementation adds an allowlisted asset build:

```sh
node tools/build-launch-pages.mjs
```

For the **existing Pages project**, set build command to `node tools/build-launch-pages.mjs` and output directory to `dist`. Set compatibility date intentionally to the tested `2026-10-09`. The account/project settings have **not** been changed by this work. Do not deploy the repository root as the static directory. No hosting migration is required.

The build preserves existing public pages/assets, MarketApp, firmware update manifests, and release/download files when present in the actual source checkout. It excludes functions, docs, tests, tools, hidden files, dependencies, and compiler output. Sparse development worktrees intentionally omit some production media/binaries; build success there does not verify their completeness. Before deployment, run the build against the full intended production sources, compare the current public release/update/MarketApp trees, and verify linked downloads. Add future public root pages/directories to the explicit build allowlist as needed.

`_routes.json` in `dist` includes only `/api/launch/config` and `/api/launch/subscribe`. Existing product pages, media, MarketApp, downloads, manifests, and firmware files are served statically without invoking the launch Functions. Functions return their own no-cache/sanitized response headers; static `_headers` rules are retained.

Deploy through the existing Pages Git/CLI path after account/environment settings and reviewed sources are ready. Cloudflare dashboard drag-and-drop Direct Upload does not support Functions. Do not use a root-directory static upload as a workaround.

## Verification and acceptance

Offline tests use fake provider responses and no credentials:

```sh
node --test tools/launch-api.test.mjs tools/launch-build.test.mjs
```

For a dependency-free visual preview, run `node tools/dev-launch.mjs` and open `http://127.0.0.1:8788/launch`. It uses the real API handlers and defaults to unavailable capture. It is a local preview helper, not proof of Cloudflare behavior.

Cloudflare runtime validation used **Wrangler 4.149.0**, pinned in a temporary tooling cache; no npm runtime dependency was added to the site. After the build, run the same pinned/local Wrangler version with `pages dev dist --ip 127.0.0.1 --port 8789 --compatibility-date 2026-10-09`, then run:

```sh
node --test tools/launch-runtime.test.mjs
```

The runtime test refuses a configured provider or active VIP checkout and only targets localhost. It checks disabled config, safe non-success submission, validation errors, unchanged static content, and absence of exposed function source. It does not send mail or charge a card.

After provider setup/deployment, perform a real-inbox acceptance with the operator's test inbox: signup → DOI receipt → click confirmation → correct list/group membership → welcome email → unsubscribe → repeat API attempt preserves suppression. For MailerLite, verify a truly fresh inbox returns `unconfirmed` before confirmation. Test prior active/unconfirmed and suppressed states without modifying existing customer records. For Brevo, include launch-list-specific unsubscribe and confirm Consent Groups are not in use. For Turnstile, verify a fresh real token is accepted once, replay is rejected, hostname/action mismatch is rejected, and retry receives a new token. Those live checks remain pending until the accounts are configured.

Before live VIP activation, inspect the final checkout amount/currency and displayed terms; complete Stripe test-mode payment/refund checks through its dashboard. A successful test does not activate this site's live checkout. Real charges/refunds require the company's final live offer and operator-controlled Stripe workflow. No automatic refund scheduler, webhook, payment-verification endpoint, or Kickstarter credit integration exists in this implementation.

## Verified primary sources

- [Brevo dedicated DOI API](https://developers.brevo.com/reference/create-doi-contact): required list/template/redirect payload and confirmation-link parameter.
- [Brevo contact details](https://developers.brevo.com/reference/get-contact-info): global blocklist and list-specific unsubscribe evidence.
- [Brevo Consent Groups](https://help.brevo.com/hc/en-us/articles/33595674951314-Create-and-manage-consent-groups): group consent is separate from global/list suppression; unsupported here until explicitly mapped.
- [MailerLite subscriber API](https://developers.mailerlite.com/api/subscribers): status lookup, additive POST groups, and suppression behavior.
- [MailerLite DOI settings](https://www.mailerlite.com/help/how-to-use-double-opt-in-when-collecting-subscribers): separate API/integration switch and different behavior for existing subscriber states.
- [Gmail mail merge](https://support.google.com/mail/answer/12921167?hl=en) and [MailerLite sender-domain authentication](https://www.mailerlite.com/help/how-to-verify-and-authenticate-your-domain): manually operated mail merge is available for eligible accounts; company inbox hosting and marketing sender authentication are separate.
- [Cloudflare Pages Functions placement](https://developers.cloudflare.com/pages/functions/get-started/), [routing](https://developers.cloudflare.com/pages/functions/routing/), [bindings](https://developers.cloudflare.com/pages/functions/bindings/), and [local development](https://developers.cloudflare.com/pages/functions/local-development/): root functions, scoped invocation, secrets, and runtime verification.
- [Turnstile server-side validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/): server verification, five-minute token validity, and single-use tokens.
- [Stripe Payment Links](https://docs.stripe.com/payment-links) and [refunds](https://docs.stripe.com/refunds): hosted checkout, dashboard operations, full-refund processing, balance and fees.
