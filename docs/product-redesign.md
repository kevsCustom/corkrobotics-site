# CorkBot product presentation

Implementation notes for the CorkBot product website. This is a static site;
serve the repository root with a web server that supports MP4 byte ranges.
There is no build step.

## Design

A product-first homepage replaces release-management slogans, pseudo-metrics,
repeated preview galleries, and decorative card treatments. Neutral paper and
graphite surfaces, regular-weight type, thin rules, and generous image areas
support the machine imagery. The hero text stays outside the film. The gripper
film has its own later section. Selected core/folded/paper-feed renders remain.

Development status and simulated demonstrations are labeled. No sales,
shipping date, price, payload, accuracy, autonomous-navigation, or lateral-drive
claim was added. Existing core design dimensions are identified as current
design dimensions, with the configuration caveat nearby.

Research agent references (official sites reviewed):
- https://www.figure.ai/ — quiet controls around product motion
- https://www.1x.tech/neo — product/category before hardware detail
- https://www.polestar.com/us/ — restrained type, alignment, image space
- https://rivian.com/r2 — product/configuration progression
- https://teenage.engineering/products/op-1 — mechanism and material detail

`assets/css/product.css` is separate from the legacy stylesheet. MarketApp,
privacy, release artifacts, manifests, hosting headers, and redirects retain
existing behavior. The homepage no longer fetches the old product-channel
catalog. Downloads uses the existing manifests, consolidates unavailable
platforms, and exposes checksums/notes under release details. Independent
loading lets one manifest succeed if the other fails.

## Motion and accessibility

The hero uses a muted 17.8-second, 1600×900 preview. Only its source is assigned
automatically. No full film or 4K asset is requested on initial page load.
Reduced-motion and data-saving/2G preferences show a still until explicit play.
A visible play/pause control preserves manual pause across scrolling. The
preview stops offscreen, on page hiding, and during a full film.

Full films use a native dialog and native video controls. Escape/close return
focus to the initiating link. Each film offers its untouched 4K original in a
separate tab. Without JS, posters and ordinary film links remain usable, and
mobile navigation remains visible. No scroll scrubbing, parallax, animation
library, remote fonts, tracking, or new runtime package is required.

## Validation

- `node --test tools/product-ui.test.mjs`: six focused tests pass for preference
  loading, explicit play, offscreen/manual pause, page hiding, blocked autoplay,
  unavailable releases, independent failure, and escaped manifest metadata.
- `node tools/validate-updates.mjs`: existing release manifests and artifacts pass.
- Both JS files pass `node --check`; `git diff --check` passes.
- 22 unique local HTML targets, local anchors, image alternatives, and video
  byte-range delivery checked against the local preview.
- All five MP4 files fully decode with FFmpeg. Both 4K copies are SHA-256
  identical to the supplied source files.
- In-app browser: desktop visual review; mobile 390×844 visual review;
  320-pixel phone and 768-pixel tablet overflow checks. Menu, anchor navigation,
  preview pause, offscreen pause, both films, Escape, focus restoration, and
  downloads were exercised. No browser console errors/warnings observed.
- Reduced-motion/data-saving policy verified in the focused JS tests; physical
  Safari/iPhone playback has not been separately tested.

Publishing uses the repository's existing GitHub hosting workflow. Local review
can use any static web server with MP4 byte-range support.

## Idea invitation refinement

The feedback invitation asks: **What would you want your CorkBot to do?** Supporting
copy welcomes a project/task and says a few words are enough. **Share an idea**
opens email to the existing hello address, subject `An idea for CorkBot`, with
one starter: `I’d like my CorkBot to…`. No message is sent by the site.

Research informed the choice to ask about outcomes, avoid suggesting answers,
and reduce response effort. Specific module examples were left out of the
invitation so they do not become a perceived menu or roadmap. This is a copy
recommendation, not an experimentally proven engagement improvement.

- https://www.gov.uk/service-manual/user-research/start-by-learning-user-needs
- https://www.nngroup.com/articles/leading-questions/
- https://www.nngroup.com/articles/open-ended-questions/

Verified the decoded email link and desktop/320px layout with no overflow.

## Complete concept gallery

The owner requested keeping all 12 original renders available as an overview of
planned submodules whose further development depends on funding. Added
`gallery.html`, `assets/css/gallery.css`, and `assets/js/gallery.js`; navigation
on Home/Downloads/Gallery and a homepage configurations link make it discoverable.
The main product page retains its two curated configuration examples.

All 12 `dev-preview-*` originals appear exactly once, covering the core, gripper,
mobile base, rotating base, and paper feeder with their configurations. They are
12 views, not 12 separate finished products. Funding-dependent development and
concept status are explicit on both pages. No new planned attachment was invented.

The gallery has uncropped thumbnails, lazy loading, short captions, and an image
viewer with previous/next, wrapping, arrow keys, Escape, focus return, and original
image links. Native links work without JavaScript. Images were not regenerated
or modified. Source width/height metadata avoids layout shifts.

Verified all 12 assets, exact original dimensions, local targets and anchors,
syntax/diff checks, desktop and phone visuals, 320/768px overflow, enlarged-image
navigation/wrapping, keyboard arrows, Escape, focus return, and scroll restoration.
