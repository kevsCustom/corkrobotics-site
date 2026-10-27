/* The photographed finish changes only after its full image decodes. */
(() => {
  const root = document.querySelector('[data-colorway-viewer]');
  if (!root) return;
  const stage = root.querySelector('.finish-stage');
  const choices = [...root.querySelectorAll('input[name="finish"]')];
  const options = root.querySelector('.finish-options');
  const compare = root.querySelector('.finish-compare');
  const original = root.querySelector('.finish-original');
  const divider = root.querySelector('.finish-divider');
  const comparison = root.querySelector('.finish-comparison');
  const slider = comparison.querySelector('input');
  const name = root.querySelector('[data-finish-name]');
  const number = root.querySelector('[data-finish-number]');
  const comparisonName = root.querySelector('[data-comparison-name]');
  const status = root.querySelector('.finish-status');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let current = choices.find(choice => choice.checked);
  let image = stage.querySelector('.finish-photo');
  let request = 0;
  let settle = () => {};
  const renderComparison = enabled => {
    original.hidden = divider.hidden = comparison.hidden = !enabled;
    compare.setAttribute('aria-pressed', String(enabled));
    compare.textContent = enabled ? 'Close comparison' : 'Compare with Black';
  };
  slider.addEventListener('input', () => {
    stage.style.setProperty('--split', `${slider.value}%`);
    slider.setAttribute('aria-valuetext', `${slider.value}% original Black`);
  });
  compare.addEventListener('click', () => {
    if (!compare.disabled) renderComparison(compare.getAttribute('aria-pressed') !== 'true');
  });
  motion.addEventListener('change', () => { if (motion.matches) settle(); });
  options.hidden = compare.hidden = false;
  options.addEventListener('change', async event => {
    const choice = event.target;
    if (!choices.includes(choice)) return;
    const token = ++request;
    settle();
    if (choice === current) {
      stage.removeAttribute('aria-busy');
      compare.disabled = current.value === 'black';
      status.textContent = '';
      return;
    }
    compare.disabled = true;
    stage.setAttribute('aria-busy', 'true');
    status.textContent = `Loading ${choice.dataset.label}…`;
    const candidate = new Image();
    candidate.className = 'finish-photo';
    candidate.width = 1534;
    candidate.height = 1025;
    candidate.alt = choice.dataset.alt;
    candidate.sizes = '(max-width: 900px) 100vw, 67vw';
    candidate.srcset = `/assets/img/colorways/r6/cork-v1-${choice.value}-768.webp 768w, /assets/img/colorways/r6/cork-v1-${choice.value}.webp 1534w`;
    candidate.src = `/assets/img/colorways/r6/cork-v1-${choice.value}.webp`;
    try {
      await candidate.decode();
      if (token !== request) return;
      const previous = image;
      previous.setAttribute('aria-hidden', 'true');
      stage.append(candidate);
      image = candidate;
      let animation;
      settle = () => { animation?.cancel(); previous.remove(); settle = () => {}; };
      if (!motion.matches && typeof candidate.animate === 'function') {
        animation = candidate.animate([{opacity:0},{opacity:1}], {duration:240,easing:'ease-out'});
        animation.onfinish = settle;
      } else settle();
      current = choice;
      name.textContent = choice.dataset.label;
      number.textContent = `${String(choices.indexOf(choice) + 1).padStart(2, '0')} / ${String(choices.length).padStart(2, '0')}`;
      comparisonName.textContent = choice.dataset.label;
      status.textContent = `${choice.dataset.label} selected.`;
      if (choice.value === 'black') renderComparison(false);
    } catch {
      if (token !== request) return;
      choices.forEach(item => { item.checked = item === current; });
      status.textContent = 'This finish could not load. Please try again.';
    } finally {
      if (token === request) {
        stage.removeAttribute('aria-busy');
        compare.disabled = current.value === 'black';
      }
    }
  });
})();
