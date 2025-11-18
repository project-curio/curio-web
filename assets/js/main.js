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

  const instMenu = document.querySelector('[data-js="inst-menu"]');
  if (instMenu) {
    const trigger = instMenu.querySelector('button');
    const panel = instMenu.querySelector('.header-menu-panel');

    const closeMenu = () => {
      if (!trigger || !panel) return;
      trigger.setAttribute('aria-expanded', 'false');
      panel.classList.remove('is-open');
    };

    const openMenu = () => {
      if (!trigger || !panel) return;
      trigger.setAttribute('aria-expanded', 'true');
      panel.classList.add('is-open');
    };

    trigger?.addEventListener('click', () => {
      const expanded = trigger.getAttribute('aria-expanded') === 'true';
      if (expanded) {
        closeMenu();
      } else {
        openMenu();
      }
    });

    document.addEventListener('click', (event) => {
      if (!instMenu.contains(event.target)) {
        closeMenu();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeMenu();
        trigger?.focus();
      }
    });
  }

  const initAtlasCarousels = () => {
    const carousels = document.querySelectorAll('.js-atlas-carousel');
    if (!carousels.length) {
      return;
    }

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const getBehavior = () => (motionQuery.matches ? 'auto' : 'smooth');

    carousels.forEach((carousel) => {
      const track = carousel.querySelector('.atlas-carousel__track');
      const prevBtn = carousel.querySelector('.carousel-button--prev');
      const nextBtn = carousel.querySelector('.carousel-button--next');

      if (!track || !prevBtn || !nextBtn) {
        return;
      }

      const getScrollAmount = () => track.clientWidth * 0.9 || 300;

      const updateButtons = () => {
        const maxScroll = track.scrollWidth - track.clientWidth - 4;
        const current = track.scrollLeft;
        prevBtn.disabled = current <= 0;
        nextBtn.disabled = current >= maxScroll;
      };

      prevBtn.addEventListener('click', () => {
        track.scrollBy({ left: -getScrollAmount(), behavior: getBehavior() });
      });

      nextBtn.addEventListener('click', () => {
        track.scrollBy({ left: getScrollAmount(), behavior: getBehavior() });
      });

      track.addEventListener('scroll', () => {
        window.requestAnimationFrame(updateButtons);
      });

      window.addEventListener('resize', updateButtons);
      updateButtons();
    });
  };

  window.addEventListener('DOMContentLoaded', () => {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
    initAtlasCarousels();
  });
})();
