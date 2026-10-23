/* Optional motion and an honest photo viewer. All content is visible without JS. */
(() => {
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let observer;
  const stopMotion = () => {
    if (!preference.matches) return;
    observer?.disconnect();
    document.querySelectorAll('.reveal-in, .view-change').forEach(el => el.classList.remove('reveal-in', 'view-change'));
  };
  if (!preference.matches && 'IntersectionObserver' in window) {
    observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        if (!preference.matches) entry.target.classList.add('reveal-in');
        observer.unobserve(entry.target);
      }
    }, {threshold: .12});
    document.querySelectorAll('.product-home .introduction-body > *, .product-home .core-layout > *, .product-home .software-layout > *, .product-home .workflow-steps li, .product-home .section-heading > *, .product-home .use-card, .product-home .detail-film, .product-home .module-notes > *, .product-home .portability-layout > *, .product-home .contact-row > *').forEach(el => observer.observe(el));
  }
  preference.addEventListener('change', stopMotion);
  const figure = document.querySelector('#product-views');
  if (!figure) return;
  const image = figure.querySelector('img');
  const source = figure.querySelector('source');
  const caption = figure.querySelector('figcaption');
  const controls = figure.querySelector('.product-view-controls');
  if (!image || !source || !caption || !controls) return;
  const views = {
    carry: {name:'carry', alt:'A hand lifting folded CorkBot by its carry handle', caption:'Compact enough to carry', height:684},
    folded: {name:'folded', alt:'CorkBot folded into a compact shape, with the pen and camera visible', caption:'Folded between projects', height:683},
    upright: {name:'upright', alt:'CorkBot upright with its pen tool fitted', caption:'Pen configuration', height:684},
    hero: {name:'hero', alt:'CorkBot with its drawing arm extended over a black work mat', caption:'Ready to draw', height:684},
  };
  let request = 0;
  controls.hidden = false;
  controls.addEventListener('click', async event => {
    const button = event.target.closest('[data-product-view]');
    if (!button || !controls.contains(button)) return;
    const view = views[button.dataset.productView];
    if (!view || button.getAttribute('aria-pressed') === 'true') return;
    const token = ++request;
    const base = `/assets/img/corkbot/corkbot-${view.name}`;
    const candidate = new Image();
    candidate.src = `${base}-1024.webp`;
    figure.setAttribute('aria-busy', 'true');
    try {
      await candidate.decode();
      if (token !== request) return;
      source.srcset = `${base}-640.webp 640w, ${base}-1024.webp 1024w`;
      image.srcset = `${base}-640.jpg 640w, ${base}-1024.jpg 1024w`;
      image.src = `${base}-1024.jpg`;
      image.alt = view.alt;
      image.width = 1024;
      image.height = view.height;
      caption.textContent = view.caption;
      controls.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      image.classList.remove('view-change');
      if (!preference.matches) requestAnimationFrame(() => {
        if (token === request && !preference.matches) image.classList.add('view-change');
      });
    } catch {
      if (token === request) caption.textContent = 'This photograph could not load. Please try again.';
    } finally {
      if (token === request) figure.removeAttribute('aria-busy');
    }
  });
})();
