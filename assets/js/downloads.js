(async () => {
  const firmwareRoot = document.getElementById("firmwareDownloads");
  const desktopRoot = document.getElementById("desktopDownloads");
  const escape = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[character],
    );
  const fetchJson = async (url) => {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error("Release information unavailable");
    return response.json();
  };
  const releaseUrl = (release) => {
    const url = release?.firmware?.url || release?.downloadUrl || "";
    return /^(\/releases\/|https:\/\/)/.test(url) ? url : "";
  };
  const releaseDate = (date) => {
    const parsed = new Date(date);
    return Number.isNaN(parsed.getTime())
      ? ""
      : new Intl.DateTimeFormat("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        }).format(parsed);
  };
  const card = (item, kind) => {
    const release = item.latest;
    const url = releaseUrl(release);
    const checksum = release?.firmware?.sha256 || release?.sha256;
    const notes = Array.isArray(release?.notes) ? release.notes : [];
    return `<article class="release-card">
      <span class="status-pill">${kind === "firmware" ? "Firmware" : "Desktop software"}</span>
      <h3>${escape(item.displayName)}</h3>
      <p>${escape(item.description || "")}</p>
      <ul class="release-meta">
        <li><span>Version</span><strong>${escape(release.version)}</strong></li>
        <li><span>Released</span><strong>${escape(releaseDate(release.releasedAt))}</strong></li>
      </ul>
      <div class="release-actions"><a class="btn" href="${escape(url)}">Download<span class="sr-only"> ${escape(item.displayName)} ${escape(release.version)}</span></a></div>
      <details class="release-details"><summary>Release details</summary>
        ${notes.length ? `<ul>${notes.map((note) => `<li>${escape(note)}</li>`).join("")}</ul>` : ""}
        <p>${kind === "firmware" ? "Board" : "Platform"}: <code>${escape(item.id)}</code></p>
        ${checksum ? `<p>SHA-256</p><code class="checksum">${escape(checksum)}</code>` : ""}
      </details>
    </article>`;
  };
  const render = (root, manifest, kind) => {
    const items = kind === "firmware" ? manifest.boards : manifest.platforms;
    if (!Array.isArray(items)) throw new Error("Invalid release information");
    const available = items.filter((item) => releaseUrl(item.latest));
    const unavailable = items.filter((item) => !releaseUrl(item.latest));
    if (!available.length) {
      root.innerHTML = `<div class="release-empty"><h3>${kind === "firmware" ? "Firmware releases are not published yet." : "CorkBot Studio is in development."}</h3><p>${kind === "firmware" ? "Downloads will appear here when a release is available." : "Public desktop downloads are not available yet. Get in touch for information about the software."}</p><a class="text-link" href="mailto:support@corkrobotics.com">Contact support <span aria-hidden="true">↗</span></a></div>`;
      return;
    }
    root.innerHTML =
      available.map((item) => card(item, kind)).join("") +
      (unavailable.length
        ? `<p class="release-unavailable">Not yet available: ${unavailable.map((item) => escape(item.displayName)).join(", ")}.</p>`
        : "");
  };
  const load = async (root, url, kind) => {
    if (!root) return;
    try {
      render(root, await fetchJson(url), kind);
    } catch {
      root.innerHTML =
        '<p class="release-unavailable">Release information is temporarily unavailable. Please refresh the page or <a href="mailto:support@corkrobotics.com">contact support</a>.</p>';
    }
  };
  await Promise.all([
    load(firmwareRoot, "/updates/firmware/latest.json", "firmware"),
    load(desktopRoot, "/updates/desktop/latest.json", "desktop"),
  ]);
})();
