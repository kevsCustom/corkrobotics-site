(async () => {
  const grid = document.getElementById('productsGrid');
  if (!grid) return;

  try {
    const res = await fetch('/assets/data/products.json', { cache: 'no-store' });
    const items = await res.json();

    const fmt = (p, cur='USD') =>
      new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(p);

    const card = (p) => {
      const available = p.status === 'available';
      const href = available ? `/products/${p.slug}.html` : '#';
      const btnState = available ? '' : 'aria-disabled="true"';

      return `
      <article class="card">
        ${p.image
          ? `<div class="media"><img src="${p.image}" alt="${p.name}"></div>`
          : `<div class="media placeholder">Image coming soon</div>`
        }
        <div class="content">
          ${p.badge ? `<div class="badge">${p.badge}</div>` : ''}
          <h3>${p.name}</h3>
          ${p.price ? `<div class="price">${fmt(p.price, p.currency || 'USD')}</div>` : ''}
          <a class="btn" href="${href}" ${btnState}>${available ? 'View' : 'Coming Soon'}</a>
        </div>
      </article>`;
    };

    grid.innerHTML = items.map(card).join('');
  } catch (e) {
    grid.innerHTML = `<p class="lead">Catalog temporarily unavailable. Please refresh.</p>`;
    // Optionally console.error(e);
  }
})();
