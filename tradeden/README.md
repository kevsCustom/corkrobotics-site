# Trade Den static site

This directory is a complete standalone site. For Cloudflare Pages with Git integration,
use the existing `kevsCustom/corkrobotics-site` repository, production branch `main`,
root directory `tradeden`, no build command, and output directory `.` relative to that
root. Attach `tradeden.app` and `www.tradeden.app` to this Pages project. Do not point
the domain at the repository root, which serves the unrelated Cork Robotics robot site.

Routes: `/`, `/privacy/`, `/terms/`. Assets are local under `/assets/`. The launch
updates call-to-action opens an email to `support@corkrobotics.com`; replace it with a
verified app download when that destination exists. CORK ROBOTICS LLC is the operator.
