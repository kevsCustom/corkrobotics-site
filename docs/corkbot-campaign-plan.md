# CorkBot prelaunch campaign working plan

Prepared October 9, 2026. Kevin approved building the signup page, chose MailerLite for the launch list, and selected a proposed $5 refundable VIP reservation. MailerLite account setup, product price, campaign date, final offer, and payment account remain pending.

## Funnel and ownership

Use one destination: `https://corkrobotics.com/launch`, once the reviewed page is deployed. A useful product demonstration ends with “Get the CorkBot launch email — link in my profile” or a direct link where supported. The page asks for an email and permission to send product and launch updates. Confirmed subscribers receive a welcome email and useful demonstrations leading up to Kickstarter. Keep the free path available alongside any reservation.

Cloudflare hosts the page. The selected mailing-list service manages subscriber records, confirmation, campaigns, unsubscribes, and export. Google Workspace continues to run the company inboxes; no mailbox migration is required. Stripe would separately manage reservation payments and refunds. No separate Cloudflare subscriber database is needed for this version. Implementation and account configuration are documented in [launch-setup.md](launch-setup.md).

MailerLite is the chosen provider. Keep the page's custom email form by connecting the MailerLite API after its confirmation setting and Turnstile are verified. A verified native hosted form is available as a simpler fallback. Both need real-inbox acceptance before public activation. Keep Google Workspace for the company inboxes and replies.

Start with MailerLite Free for setup: 250 active subscribers and 2,500 monthly emails. Upgrade before the custom signup reaches the subscriber limit, because API additions and campaigns pause above it. Comfort starts at $12/month USD; the actual cost depends on the subscriber tier. No paid subscription has been purchased. The [MailerLite launch workbook](mailerlite-launch-workbook.md) contains account settings and the initial email drafts.

## The proposed $5 offer

The useful benefit is access to the defined Kickstarter early-bird price during a dedicated launch window, with a proposed 48-hour window. Finalize the product package, price, destinations, reward capacity, and window before collecting money. A private Kickstarter reward can provide the access mechanism, but its link can be forwarded and should not be described as identity enforcement. Capacity must cover the reservations accepted.

The payment is separate from a Kickstarter pledge. Proposed mechanics are full refund on request, plus company-initiated refunds at launch, cancellation, or a fixed deadline, while retaining eligibility after the scheduled refund. There is no automatic Kickstarter credit. The current website publishes a closed, proposed offer at `/reservation-terms`; it must be replaced with final terms before activation. Stripe dashboard operations are planned for the first version, not an automated refund system.

At standard U.S. domestic card pricing of 2.9% + $0.30, a $5 payment costs about $0.45; original processing fees are retained after a refund. Budget that expense when deciding how broadly to promote reservations. A paid reservation is a stronger expression of interest, but it does not establish that someone will later pledge. Compare the eventual pledge rate and refund/cancellation rate with free subscribers rather than relying on vendor case-study conversion claims.

## Content and channel links

| Channel | Proposed path to signup |
| --- | --- |
| Instagram | Profile link, Reel call to action, and Story link sticker where the account supports it. |
| Facebook | Link in eligible posts, prominent launch post, and Page action button. |
| YouTube videos | Description and pinned comment; verify the account has the advanced features required for clickable external links. |
| YouTube Shorts | Channel profile link or related longer video. URLs in Shorts descriptions and comments are not clickable. |
| Reddit | Useful demonstrations and transparent founder participation, with links only where community rules permit promotion. |
| X | Direct post link, profile website, and pinned demonstration/launch post. |

Test each actual account's route on a phone before using it in the video script. Use one channel-specific link, for example `/launch?utm_source=instagram&utm_medium=organic-social&utm_campaign=corkbot-prelaunch&utm_content=pen-demo-01`. The implementation accepts four bounded source fields. Provider storage requires the documented optional fields to be enabled; otherwise the URL alone does not create a stored acquisition report.

Lead with a real result, then show CorkBot making it. Shoot the finished drawing, the complete robot at work, setup/tool changes, scale on a desk, and an honest close-up of the prototype. Prepare vertical clips and a longer demonstration from the same session. The current placeholder is explicitly labeled a development concept render. Replace the hero, its description, and social-sharing image after the photography shoot; only describe demonstrated capabilities as current.

## Preparation and four-week push

Before the push: finish MailerLite account setup, verify inbox confirmation/unsubscribe, replace the placeholder, define the launch package/price, and test every signup route. Set the final date after campaign readiness and Kickstarter review. Late November remains the target; Thanksgiving on November 26 and Black Friday on November 27 create potential audience and advertising competition, so avoid committing to those dates without considering the audience.

1. **Week one:** introduce the product with its strongest real demonstration. Send a welcome after confirmation explaining what updates subscribers will receive.
2. **Week two:** show practical use cases, setup, and development progress. Send one useful product update and invite questions.
3. **Week three:** explain the final launch package, price, and any approved VIP offer. Answer objections collected from comments and email replies.
4. **Week four:** publish the exact launch time and pledge instructions. Send a reminder before launch and the direct Kickstarter link when the campaign is actually live.

The Kickstarter prelaunch page can supplement the owned list once ready. Its followers receive launch and prelaunch-update emails. Treat that audience as a separate channel rather than an exportable company mailing list.

## What to measure

Track tagged page visits, submitted and confirmed signups, email clicks/replies, successful reservations, refunds/cancellations, and actual collected Kickstarter pledges. Calculate confirmed signup rate per page visit and pledge rate per confirmed subscriber or reservation holder. Keep raw views separate from those outcomes. No assumed conversion rate or email-list target is a CorkBot forecast; set targets after the product price, funding goal, audience size, and a small first traffic test are known.

## Primary research references

- [Kickstarter email-list strategy](https://updates.kickstarter.com/top-strategies-to-build-an-email-list-for-your-crowdfunding-campaign/) and [prelaunch pages](https://help.kickstarter.com/en-us/articles/16236379-setting-up-your-project-s-pre-launch-page).
- [Kickstarter secret rewards](https://help.kickstarter.com/en-us/articles/16236377-what-are-secret-rewards) and [current rules](https://www.kickstarter.com/rules).
- [MailerLite forms](https://www.mailerlite.com/help/how-to-create-an-embedded-form), [confirmation settings](https://www.mailerlite.com/help/how-to-use-double-opt-in-when-collecting-subscribers), and [current pricing](https://www.mailerlite.com/pricing). Check the intended audience tier before buying; old free-plan limits are outdated.
- [Google Workspace mail merge](https://support.google.com/mail/answer/12921167?hl=en).
- [Brevo confirmation API](https://developers.brevo.com/reference/create-doi-contact).
- [Stripe pricing](https://stripe.com/en-us/pricing) and [refund operations](https://docs.stripe.com/refunds).
- [YouTube link locations](https://support.google.com/youtube/answer/13748639?hl=en), [Reddit spam/community guidance](https://support.reddithelp.com/hc/en-us/articles/360043504051-Spam), and [X links](https://help.x.com/en/using-x/how-to-post-a-link).
- [Cloudflare Email Service FAQ](https://developers.cloudflare.com/email-service/reference/faq/) and [D1 local versus remote state](https://developers.cloudflare.com/d1/best-practices/local-development/).
- [2026 federal holiday calendar](https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/).

No accounts, subscription purchases, production emails, live reservations, or deployment were performed during preparation. Local/provider mocks prove application behavior; they do not prove inbox delivery, payment operations, or campaign conversion.
