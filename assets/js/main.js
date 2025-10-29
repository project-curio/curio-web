(function () {
  const yearEl = document.getElementById('copyright-year');
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  const navToggle = document.querySelector('[data-js="nav-toggle"]');
  const primaryNav = document.getElementById('primary-nav');
  const pageBody = document.body;

  const closeNav = () => {
    if (!primaryNav) {
      return;
    }
    primaryNav.classList.remove('is-open');
    pageBody.classList.remove('nav-open');
    if (navToggle) {
      navToggle.setAttribute('aria-expanded', 'false');
    }
  };

  if (navToggle && primaryNav) {
    navToggle.addEventListener('click', () => {
      const isOpen = primaryNav.classList.toggle('is-open');
      pageBody.classList.toggle('nav-open', isOpen);
      navToggle.setAttribute('aria-expanded', String(isOpen));
      if (isOpen) {
        const firstInteractive = primaryNav.querySelector('a, input, button');
        if (firstInteractive && typeof firstInteractive.focus === 'function') {
          try {
            firstInteractive.focus({ preventScroll: true });
          } catch (error) {
            firstInteractive.focus();
          }
        }
      }
    });

    primaryNav.addEventListener('click', (event) => {
      if (event.target instanceof HTMLElement && event.target.tagName === 'A') {
        closeNav();
      }
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth >= 960) {
        closeNav();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeNav();
      }
    });
  }

  const searchForms = document.querySelectorAll('[data-js="search-form"]');
  searchForms.forEach((form) => {
    const searchInput = form.querySelector('input[type="search"]');
    const feedback = form.querySelector('[data-js="search-feedback"]');

    form.addEventListener('submit', (event) => {
      event.preventDefault();

      const query = searchInput instanceof HTMLInputElement ? searchInput.value.trim() : '';
      const message = query
        ? `Search for “${query}” is coming soon.`
        : 'Curio search is launching soon.';

      if (feedback instanceof HTMLElement) {
        feedback.textContent = message;
      }

      if (searchInput instanceof HTMLInputElement) {
        searchInput.blur();
      }
    });
  });
})();
