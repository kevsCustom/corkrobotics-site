# CorkBot MailerLite launch workbook

Prepared October 9, 2026. MailerLite is selected; account connection and real-inbox acceptance remain pending. The site already has the signup adapter. The launch list is free. The proposed paid reservation was removed on October 16, 2026; optional apparel support is a separate concept with no checkout configured here.

## 1. Set the sender and company account

- [ ] Create or sign into the company-owned [MailerLite account](https://accounts.mailerlite.com/), complete its business profile and inbox verification with the real company/website details, check any account-specific review or sending restrictions, and enter the company's actual footer mailing address.
- [ ] Set **From name:** `Kevin at Cork Robotics`; **From address:** `kevin@corkrobotics.com`.
- [ ] Use `kevin@corkrobotics.com` as Reply-to initially. Switch to the support mailbox only after Kevin confirms its complete address and verifies that incoming replies reach a monitored inbox. Do not infer a complete address from `support@`.
- [ ] In Account settings → Domains, add/verify the sender and authenticate `corkrobotics.com` using the exact records MailerLite supplies. Add its DKIM/domain-verification records and reconcile its SPF requirement with the existing record. Preserve Google Workspace MX records and existing Google authentication records: Workspace continues hosting the company's inboxes. Check authentication in MailerLite before sending. [Domain authentication](https://www.mailerlite.com/help/how-to-verify-and-authenticate-your-domain)
- [ ] Create a dedicated subscriber group named **CorkBot launch 2026**. Record the real numeric group ID privately with the site configuration; the name is not the API ID.

Keep account access and API tokens in the company's account/secret stores. No token belongs in this workbook, chat, public JavaScript, or a committed file.

## 2. Connect the existing page

The preferred finished flow is **corkrobotics.com/launch → email + consent → confirmation email → active subscriber → welcome email**. MailerLite stores/manages subscribers; Cloudflare validates and forwards requests. No subscriber database is created in Cloudflare.

### Custom page form

1. Open MailerLite Account settings → Subscribe settings and turn **Double opt-in for API and integrations** on. Its confirmation setting is separate from the setting on an individual form.
2. Review the API confirmation template and destination. The same API template serves all API integrations in this account. Use the draft below only if this account's audience makes it appropriate. Where available, set the post-confirmation destination to `https://corkrobotics.com/thank-you`.
3. Obtain an API token through MailerLite's integration/API settings and store it as the Cloudflare secret below. Create a Turnstile widget for the real site hostname; the existing page and server use action `launch_signup`.
4. Configure the intended Pages environment with these values, using its existing deployment workflow. Run the real-inbox checks in section 5 before activating the public funnel.

| Setting | Value |
| --- | --- |
| `SIGNUP_PROVIDER` | `mailerlite` |
| `MAILERLITE_API_KEY` | Secret: company account API token |
| `MAILERLITE_GROUP_ID` | Actual CorkBot launch group ID |
| `MAILERLITE_API_DOI_VERIFIED` | `true` on the controlled test environment after verifying the API DOI setting; retain in the public environment only after live-inbox acceptance |
| `TURNSTILE_SITE_KEY` | Public key for the real site widget |
| `TURNSTILE_SECRET_KEY` | Secret: matching widget secret |
| `SIGNUP_STORE_FIELDS` | `true` only after the fields below exist; otherwise leave unset |

The adapter requires the Turnstile key pair. It accepts a new subscriber only as `unconfirmed`; an unexpected fresh `active` response returns a safe error. It preserves existing active/group membership and never forces an unsubscribed, bounced, or junk address to become active. [API setup](https://developers.mailerlite.com/getting-started), [subscriber API](https://developers.mailerlite.com/api/subscribers), [DOI settings and existing subscriber behavior](https://www.mailerlite.com/help/how-to-use-double-opt-in-when-collecting-subscribers)

### Fastest alternate: MailerLite's hosted form

Create an embedded form assigned to **CorkBot launch 2026**, using only email and a required consent checkbox. Use the page's current consent text: **“Email me CorkBot product updates and launch news. I can unsubscribe anytime.”** Link its privacy statement to `https://corkrobotics.com/launch-privacy`. Keep double opt-in enabled, configure its confirmation destination, and copy the real **Share URL** from the form overview. The site's existing hosted mode opens that provider form. [Form setup](https://www.mailerlite.com/help/how-to-create-an-embedded-form)

Set `SIGNUP_PROVIDER=mailerlite_form`, `MAILERLITE_FORM_URL` to that actual HTTPS share URL, and `MAILERLITE_FORM_DOI_VERIFIED=true` after checking its live flow. This mode needs no site API token or site Turnstile pair. The supported share domains are MailerLite's own domains; a custom branded form domain needs a reviewed allowlist change. The site does not pass a typed email or campaign fields into the share URL. Set any fixed source labels in the provider form deliberately; do not assume site UTM fields are stored in this mode.

## 3. Add fields and the welcome automation

Create the following **text** custom fields in MailerLite before enabling `SIGNUP_STORE_FIELDS=true` for the API. These are the exact keys used by the existing adapter:

| Field key | Stored value |
| --- | --- |
| `launch_consent_version` | `corkbot-launch-2026-10-09`, matching the current page consent |
| `launch_signup_at` | UTC signup-request time; not proof of email confirmation |
| `launch_utm_source` | Source, e.g. `instagram` |
| `launch_utm_medium` | Medium, e.g. `organic-social` |
| `launch_utm_campaign` | Campaign, e.g. `corkbot-prelaunch` |
| `launch_utm_content` | Video/creative ID, e.g. `drawing-demo-01` |

Email and group membership use MailerLite's built-in subscriber records. The adapter does not send IP or a claimed opt-in time. Its optional fields describe the latest applicable request, not a complete acquisition history. Without that setting, campaign fields are not retained by this adapter.

Create one welcome automation using the launch-group trigger. Use the welcome draft below, retain MailerLite's unsubscribe/company footer, and verify the message sends **after confirmation**, only to active subscribers. Avoid enabling re-entry unless repeated welcome messages are intentional. Start subsequent campaign emails with useful product updates; announce campaign dates and package details only after they are finalized and approved for release.

## 4. Draft messages

These are ready to place in MailerLite's editors; they have not been sent. DOI email editing currently requires a paid MailerLite plan. If the selected plan does not allow it, keep the provider's built-in confirmation template and use the welcome draft in the available automation editor. Preserve the editor's real confirmation button/link rather than inventing a merge tag or pointing that button directly at `/thank-you`. [Template editing and DOI](https://www.mailerlite.com/help/how-to-use-double-opt-in-when-collecting-subscribers)

### Confirmation email

**Subject:** Confirm your CorkBot launch updates

**Preview text:** One click to confirm you want product updates and launch news.

Hi,

Please confirm that you want to receive CorkBot product updates and news of our planned Kickstarter launch from Cork Robotics.

**Button label: Confirm my email**

If you didn't request these emails, you can ignore this message. You can unsubscribe from future marketing emails anytime.

Kevin at Cork Robotics

**Editor instruction:** Use MailerLite's existing confirmation-link button. Keep the required provider footer. The button must perform confirmation before redirecting to the website.

### Welcome email — after confirmed subscription

**Subject:** You're on the CorkBot launch list

**Preview text:** Thanks for following along. Here's what happens next.

Hi,

I'm Kevin from Cork Robotics. Thanks for joining the CorkBot launch list.

CorkBot is a compact, modular robot in development for drawing, making, and hands-on exploration. I'll share demonstrations, product updates, and the news when our Kickstarter campaign opens.

The launch date, final configuration, and price are still being finalized. I'll share those details before the campaign opens so you can decide whether CorkBot fits what you want to make.

Joining this email list is free. It doesn't reserve a unit or commit you to buy.

I'd love to hear what you'd use CorkBot for. You can reply directly to this email.

Kevin
Cork Robotics

**Editor instruction:** Send as `Kevin at Cork Robotics <kevin@corkrobotics.com>` with the verified Reply-to. Keep MailerLite's unsubscribe and real company-address footer. Keep the free launch-list welcome focused on product updates; no reservation or payment button is offered.

## 5. Controlled live-inbox acceptance

Use operator-controlled test inboxes; preserve existing customer records. Record outcomes, not inbox addresses or secrets, in public/source artifacts.

- [ ] Submit a genuinely new inbox through the connected page. Check the real response/subscriber status is `unconfirmed`; verify the confirmation email reaches the inbox and the sender/Reply-to are correct.
- [ ] Before clicking, verify no welcome or campaign email is sent. Click the provider confirmation button; verify active status, the correct group, the thank-you destination, and exactly one welcome email.
- [ ] Reply to the welcome email and confirm it reaches the monitored company inbox. Check the privacy and unsubscribe links on mobile.
- [ ] Unsubscribe, then repeat the API signup with that test address. Verify it remains suppressed and the page shows an honest error. The provider's own form may offer a separate re-consent flow; do not force API reactivation.
- [ ] With controlled fixtures, verify an existing active member retains its other groups, and an existing unconfirmed subscriber gets the expected confirmation flow.
- [ ] For the custom API, verify a real Turnstile token works once; replay, missing token, and wrong action/hostname fail. A retry must get a fresh token. On a timeout, check the inbox before resubmitting.
- [ ] Verify normal and hosted-form modes offer free signup without payment. Confirm the public config has no checkout or payment fields and reveals no secret or subscriber data.

## 6. Keep apparel support separate

The proposed paid reservation has been withdrawn. The free launch list remains the primary action. A signup does not guarantee a unit, launch price, or delivery priority.

Kevin is considering two Cork Robotics hoodie options as optional support. No apparel purchase link is configured in this site. Before adding one, confirm the real product pages, prices, sizes, fulfillment regions, shipping costs, dispatch expectations, and return policy. A hoodie purchase is a merchandise order and does not create a CorkBot reservation or automatically subscribe the buyer to this launch list. Offer the same explicit email consent and confirmation process separately.

Keep product and mailing records separate. Do not reuse MarketApp billing products, subscriptions, webhooks, or payment records for a merchandise flow. This site has no apparel checkout or payment-verification endpoint; add only the reviewed store destination once ready.

Use [launch-setup.md](launch-setup.md) for the environment, public build, and deployment reference. This workbook creates no accounts, secrets, DNS changes, emails, purchases, or refunds.
