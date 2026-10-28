/* The poster and direct video link remain useful without JavaScript. */
(() => {
  const video = document.querySelector('.feeder-video');
  const button = document.querySelector('.feeder-toggle');
  if (!video || !button) return;
  const label = button.querySelector('[data-motion-label]');
  const icon = button.querySelector('[data-motion-icon]');
  const error = document.querySelector('.feeder-error');
  const dialog = document.querySelector('.image-dialog');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const connection = navigator.connection;
  let visible = false, active = true, manualPlay = false, manualPause = false;
  let blocked = false, failed = false, pending = false, generation = 0;
  const constrained = () => connection?.saveData || ['slow-2g', '2g'].includes(connection?.effectiveType);
  const allowed = () => visible && active && !document.hidden && !dialog?.open && !failed &&
    (manualPlay || (!manualPause && !blocked && !reduced.matches && !constrained()));
  const update = () => {
    const playing = !video.paused;
    label.textContent = playing ? 'Pause animation' : 'Play animation';
    icon.setAttribute('d', playing ? 'M8 5v14M16 5v14' : 'm8 5 11 7-11 7Z');
  };
  const stop = () => {
    generation++;
    pending = false;
    video.pause();
    update();
  };
  const start = () => {
    if (!video.paused || pending) return;
    const token = ++generation;
    pending = true;
    if (!video.getAttribute('src')) video.src = video.dataset.motionSrc;
    video.play().then(() => {
      if (token === generation) pending = false;
      if (!allowed()) video.pause();
      update();
    }).catch(() => {
      if (token !== generation) return;
      pending = false;
      blocked = true;
      manualPlay = false;
      update();
    });
  };
  const sync = () => allowed() ? start() : stop();
  button.hidden = false;
  video.muted = true;
  video.addEventListener('play', update);
  video.addEventListener('pause', update);
  video.addEventListener('error', () => {
    failed = true;
    stop();
    button.hidden = true;
    error.hidden = false;
    video.removeAttribute('src');
    video.load();
  });
  button.addEventListener('click', () => {
    if (!video.paused || pending) {
      manualPause = true;
      manualPlay = false;
    } else {
      manualPlay = true;
      manualPause = blocked = false;
    }
    sync();
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      sync();
    }, {threshold: .25}).observe(video);
  } else {
    visible = true;
    blocked = true; // Browsers without visibility observation use explicit play.
  }
  const preferencesChanged = () => { manualPlay = false; sync(); };
  reduced.addEventListener('change', preferencesChanged);
  connection?.addEventListener?.('change', preferencesChanged);
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pagehide', () => { active = false; stop(); });
  window.addEventListener('pageshow', () => { active = true; sync(); });
  document.querySelectorAll('[data-gallery-image]').forEach(link => link.addEventListener('click', sync));
  dialog?.addEventListener('close', sync);
})();
