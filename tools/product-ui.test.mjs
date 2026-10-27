import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const productSource = await readFile(
  new URL("../assets/js/product.js", import.meta.url),
  "utf8",
);
const downloadsSource = await readFile(
  new URL("../assets/js/downloads.js", import.meta.url),
  "utf8",
);
const flush = () => new Promise((resolve) => setImmediate(resolve));

function events(target = {}) {
  const listeners = new Map();
  target.addEventListener = (event, listener) => {
    if (!listeners.has(event)) listeners.set(event, []);
    listeners.get(event).push(listener);
  };
  target.emit = (event, payload = {}) =>
    listeners.get(event)?.forEach((listener) => listener(payload));
  return target;
}
function motionPage({
  reduced = false,
  saveData = false,
  rejectPlayback = false,
} = {}) {
  const preview = events({
    paused: true,
    src: "",
    dataset: { previewSrc: "/preview.mp4" },
    playCalls: 0,
  });
  preview.play = () => {
    preview.playCalls++;
    if (rejectPlayback) return Promise.reject(new Error("Autoplay blocked"));
    preview.paused = false;
    preview.emit("play");
    return Promise.resolve();
  };
  preview.pause = () => {
    preview.paused = true;
    preview.emit("pause");
  };
  const label = {},
    symbol = {};
  const button = events({
    hidden: true,
    querySelector: (selector) =>
      selector === "[data-motion-label]" ? label : symbol,
  });
  const document = events({
    hidden: false,
    querySelectorAll: () => [],
    querySelector: (selector) =>
      ({ "#hero-preview": preview, ".motion-toggle": button })[selector] ||
      null,
  });
  const preference = events({ matches: reduced });
  const window = events({ matchMedia: () => preference });
  let observe;
  class Observer {
    constructor(callback) {
      observe = callback;
    }
    observe() {}
  }
  window.IntersectionObserver = Observer;
  vm.runInNewContext(productSource, {
    document,
    window,
    navigator: { connection: events({ saveData }) },
    IntersectionObserver: Observer,
  });
  return {
    preview,
    button,
    label,
    document,
    preference,
    visibility: (visible) => observe([{ isIntersecting: visible }]),
  };
}

test("reduced motion and data saver load no video until explicitly played", async () => {
  for (const setting of [{ reduced: true }, { saveData: true }]) {
    const page = motionPage(setting);
    page.visibility(true);
    await flush();
    assert.equal(page.preview.src, "");
    assert.equal(page.preview.playCalls, 0);
    page.button.emit("click");
    await flush();
    assert.equal(page.preview.src, "/preview.mp4");
    assert.equal(page.preview.paused, false);
  }
});
test("offscreen video pauses and an explicit pause survives scrolling", async () => {
  const page = motionPage();
  page.visibility(true);
  await flush();
  assert.equal(page.preview.paused, false);
  page.visibility(false);
  assert.equal(page.preview.paused, true);
  page.visibility(true);
  await flush();
  page.button.emit("click");
  page.visibility(false);
  page.visibility(true);
  await flush();
  assert.equal(page.preview.paused, true);
  assert.equal(page.label.textContent, "Play preview");
});
test("hidden page and a newly enabled reduced-motion preference stop playback", async () => {
  const page = motionPage();
  page.visibility(true);
  await flush();
  page.document.hidden = true;
  page.document.emit("visibilitychange");
  assert.equal(page.preview.paused, true);
  page.document.hidden = false;
  page.document.emit("visibilitychange");
  await flush();
  page.preference.matches = true;
  page.preference.emit("change");
  assert.equal(page.preview.paused, true);
});
test("blocked autoplay retains an honest play control and does not retry while scrolling", async () => {
  const page = motionPage({ rejectPlayback: true });
  page.visibility(true);
  await flush();
  page.visibility(false);
  page.visibility(true);
  await flush();
  assert.equal(page.preview.playCalls, 1);
  assert.equal(page.label.textContent, "Play preview");
  assert.equal(page.button.hidden, false);
});


test("concept films switch sources and disclosures, and pause when the page is hidden or left", async () => {
  const link = events({
    dataset: { film: "mobile" },
    href: "/assets/media/corkbot/mobile-film-hd.mp4",
  });
  const teamLink = events({ dataset: { film: "insertCell" }, href: "/assets/media/corkbot/insert-cell-film-hd.mp4" });
  const gripperLink = events({ dataset: { film: "gripper" }, href: "/assets/media/corkbot/gripper-film-hd.mp4" });
  const film = events({ paused: true });
  film.play = () => {
    film.paused = false;
    return Promise.resolve();
  };
  film.pause = () => { film.paused = true; };
  film.setAttribute = () => {};
  const close = events();
  const nodes = {
    ".full-film": film,
    "#film-title": {},
    ".film-original": {},
    ".film-disclosure": {},
    ".film-error a": {},
    ".film-error": {},
    ".dialog-close": close,
  };
  const dialog = events({
    querySelector: (selector) => nodes[selector],
    showModal: () => { dialog.open = true; },
  });
  const document = events({
    hidden: false,
    body: { classList: { add: () => {} } },
    querySelector: (selector) => selector === ".film-dialog" ? dialog : null,
    querySelectorAll: (selector) => selector === "[data-film]" ? [link, teamLink, gripperLink] : [],
  });
  const window = events({ matchMedia: () => events({ matches: false }) });
  vm.runInNewContext(productSource, { document, window, navigator: {} });
  assert.equal(film.src, undefined, "no film is loaded before a click");
  const play = async () => {
    link.emit("click", { preventDefault: () => {} });
    await flush();
    assert.equal(film.paused, false);
  };
  for (const [trigger, title, stem, disclosure] of [
    [teamLink, "Three robots. One workflow.", "insert-cell", "Concept visualization · Planned capabilities"],
    [gripperLink, "Rotating base + three-axis gripper concept", "gripper", "Simulated demonstration · Modules in development"],
    [link, "Mobile base concept", "mobile", "Simulated demonstration · Modules in development"],
  ]) {
    trigger.emit("click", { preventDefault: () => {} });
    await flush();
    assert.equal(film.src, trigger.href);
    assert.equal(film.poster, `/assets/media/corkbot/${stem}-poster.webp`);
    assert.equal(nodes["#film-title"].textContent, title);
    assert.equal(nodes[".film-disclosure"].textContent, disclosure);
    assert.equal(nodes[".film-original"].href, `/assets/media/corkbot/${stem}-film-4k.mp4`);
    assert.equal(nodes[".film-error a"].href, nodes[".film-original"].href);
    assert.equal(film.paused, false);
  }
  document.hidden = true;
  document.emit("visibilitychange");
  assert.equal(film.paused, true);
  document.hidden = false;
  document.emit("visibilitychange");
  assert.equal(film.paused, true, "returning to the tab must not restart the film");
  await play();
  window.emit("pagehide");
  assert.equal(film.paused, true);
  window.emit("pageshow");
  assert.equal(film.paused, true, "restoring the page must not restart the film");
});

async function downloads({ firmware, desktop, firmwareError = false }) {
  const roots = {
    firmwareDownloads: { innerHTML: "" },
    desktopDownloads: { innerHTML: "" },
  };
  await vm.runInNewContext(downloadsSource, {
    document: { getElementById: (id) => roots[id] },
    fetch: async (url) => ({
      ok: !(firmwareError && url.includes("/firmware/")),
      json: async () => (url.includes("/firmware/") ? firmware : desktop),
    }),
    Intl,
    Date,
  });
  return roots;
}
test("empty desktop availability is one notice, without repeated disabled download cards", async () => {
  const desktop = JSON.parse(
    await readFile(
      new URL("../updates/desktop/latest.json", import.meta.url),
      "utf8",
    ),
  );
  const firmware = JSON.parse(
    await readFile(
      new URL("../updates/firmware/latest.json", import.meta.url),
      "utf8",
    ),
  );
  const roots = await downloads({ firmware, desktop });
  assert.match(
    roots.desktopDownloads.innerHTML,
    /Public desktop downloads are not available yet/,
  );
  assert.doesNotMatch(
    roots.desktopDownloads.innerHTML,
    /Awaiting Release|Not published|aria-disabled/,
  );
  for (const board of firmware.boards)
    assert.ok(
      roots.firmwareDownloads.innerHTML.includes(board.latest.firmware.url),
    );
  assert.match(
    roots.firmwareDownloads.innerHTML,
    /<details class="release-details">/,
  );
});
test("a failed firmware request does not hide available desktop releases; metadata is escaped", async () => {
  const roots = await downloads({
    firmwareError: true,
    desktop: {
      platforms: [
        {
          id: "mac",
          displayName: "<unsafe>",
          description: "A & B",
          latest: {
            version: "1.0.0",
            releasedAt: "2026-09-17",
            downloadUrl: "/releases/test.zip",
            notes: ["<script>"],
            sha256: "abc",
          },
        },
      ],
    },
  });
  assert.match(roots.firmwareDownloads.innerHTML, /temporarily unavailable/);
  assert.match(roots.desktopDownloads.innerHTML, /href="\/releases\/test.zip"/);
  assert.match(roots.desktopDownloads.innerHTML, /&lt;unsafe&gt;/);
  assert.doesNotMatch(roots.desktopDownloads.innerHTML, /<script>/);
});
