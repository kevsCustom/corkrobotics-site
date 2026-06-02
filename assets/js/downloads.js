(async () => {
  const firmwareRoot = document.getElementById('firmwareDownloads');
  const desktopRoot = document.getElementById('desktopDownloads');

  const fetchJson = async (url) => {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Unable to load ${url}`);
    return res.json();
  };

  const text = (value, fallback = 'Not published') => value || fallback;

  const meta = (items) => `
    <ul class="release-meta">
      ${items.map(([label, value]) => `<li><span>${label}</span><strong>${text(value)}</strong></li>`).join('')}
    </ul>`;

  const releaseUrl = (release) => release?.firmware?.url || release?.downloadUrl || '';

  const renderFirmware = (manifest) => {
    const boards = manifest.boards || [];

    if (!boards.length) {
      firmwareRoot.innerHTML = '<p class="lead">No firmware channels are configured yet.</p>';
      return;
    }

    firmwareRoot.innerHTML = boards.map((board) => {
      const latest = board.latest;
      const hasRelease = Boolean(latest && releaseUrl(latest));

      return `
        <article class="release-card">
          <span class="status-pill">${hasRelease ? 'Update available' : 'No release yet'}</span>
          <h3>${board.displayName}</h3>
          <p>${board.description || `${board.chip || 'ESP32'} firmware channel.`}</p>
          ${meta([
            ['Board ID', board.id],
            ['Latest', latest?.version],
            ['Released', latest?.releasedAt],
            ['SHA-256', latest?.firmware?.sha256]
          ])}
          <div class="release-actions">
            <a class="btn" href="${hasRelease ? releaseUrl(latest) : '#'}" ${hasRelease ? '' : 'aria-disabled="true"'}>${hasRelease ? 'Download' : 'Awaiting Release'}</a>
          </div>
        </article>`;
    }).join('');
  };

  const renderDesktop = (manifest) => {
    const platforms = manifest.platforms || [];

    if (!platforms.length) {
      desktopRoot.innerHTML = '<p class="lead">No desktop release channels are configured yet.</p>';
      return;
    }

    desktopRoot.innerHTML = platforms.map((platform) => {
      const latest = platform.latest;
      const hasRelease = Boolean(latest && releaseUrl(latest));

      return `
        <article class="release-card">
          <span class="status-pill">${hasRelease ? 'Update available' : 'No release yet'}</span>
          <h3>${platform.displayName}</h3>
          <p>${platform.description || 'Desktop app release channel.'}</p>
          ${meta([
            ['Platform', platform.id],
            ['Latest', latest?.version],
            ['Released', latest?.releasedAt],
            ['SHA-256', latest?.sha256]
          ])}
          <div class="release-actions">
            <a class="btn" href="${hasRelease ? releaseUrl(latest) : '#'}" ${hasRelease ? '' : 'aria-disabled="true"'}>${hasRelease ? 'Download' : 'Awaiting Release'}</a>
          </div>
        </article>`;
    }).join('');
  };

  try {
    const [firmware, desktop] = await Promise.all([
      fetchJson('/updates/firmware/latest.json'),
      fetchJson('/updates/desktop/latest.json')
    ]);

    if (firmwareRoot) renderFirmware(firmware);
    if (desktopRoot) renderDesktop(desktop);
  } catch (error) {
    if (firmwareRoot) firmwareRoot.innerHTML = '<p class="lead">Release information is temporarily unavailable.</p>';
    if (desktopRoot) desktopRoot.innerHTML = '<p class="lead">Release information is temporarily unavailable.</p>';
    console.error(error);
  }
})();
