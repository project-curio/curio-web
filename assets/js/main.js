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

  const heroSlides = [
    {
      id: 'detroit',
      title: 'Rivera Court reflections',
      description: 'Evening prompts and Motown listening salon.',
      badge: 'Winter spotlight · Detroit',
      image: 'https://images.unsplash.com/photo-1529397934418-35b760a1529a?auto=format&fit=crop&w=1440&q=80',
      thumb: 'https://images.unsplash.com/photo-1529397934418-35b760a1529a?auto=format&fit=crop&w=540&q=80',
      alt: 'Visitors exploring Rivera Court at the Detroit Institute of Arts',
      href: 'cities/detroit.html',
      linkLabel: 'See Detroit reflections'
    },
    {
      id: 'chicago',
      title: 'Lakefront architecture walk',
      description: 'Neighbourhood storytelling along the Riverwalk.',
      badge: 'Early spring · Chicago',
      image: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1440&q=80',
      thumb: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=540&q=80',
      alt: 'Chicago skyline reflecting in the river at sunset',
      href: 'cities/chicago.html',
      linkLabel: 'See Chicago reflections'
    },
    {
      id: 'toronto',
      title: 'Harbourfront night market',
      description: 'Reflections on waterfront performance and design.',
      badge: 'Summer evenings · Toronto',
      image: 'https://images.unsplash.com/photo-1505847512223-4bdf76f86f78?auto=format&fit=crop&w=1440&q=80',
      thumb: 'https://images.unsplash.com/photo-1505847512223-4bdf76f86f78?auto=format&fit=crop&w=540&q=80',
      alt: 'Toronto skyline illuminated at night from the harbourfront',
      href: 'cities/toronto.html',
      linkLabel: 'See Toronto reflections'
    },
    {
      id: 'minneapolis',
      title: 'Stone Arch sunrise walk',
      description: 'Mindful mornings along the Mississippi riverfront.',
      badge: 'Early fall · Minneapolis',
      image: 'https://images.unsplash.com/photo-1501618669935-18b6ecb13d29?auto=format&fit=crop&w=1440&q=80',
      thumb: 'https://images.unsplash.com/photo-1501618669935-18b6ecb13d29?auto=format&fit=crop&w=540&q=80',
      alt: 'Sunrise over the Stone Arch Bridge in Minneapolis',
      href: 'cities/minneapolis.html',
      linkLabel: 'See Minneapolis reflections'
    }
  ];

  const heroMediaImage = document.querySelector('[data-js="hero-media-image"]');
  const heroMediaBadge = document.querySelector('[data-js="hero-media-badge"]');
  const heroDiscovery = document.querySelector('[data-js="hero-discovery"]');
  const heroDiscoveryTitle = document.querySelector('[data-js="hero-discovery-title"]');
  const heroDiscoveryLink = document.querySelector('[data-js="hero-discovery-link"]');

  if (heroDiscovery && heroDiscoveryTitle && heroDiscoveryLink && heroSlides.length) {
    heroDiscovery.innerHTML = '';
    heroSlides.forEach((slide, index) => {
      const card = document.createElement('article');
      card.className = 'hero-card';
      card.setAttribute('tabindex', '0');
      card.dataset.index = String(index);
      card.setAttribute('role', 'button');
      card.setAttribute('aria-current', 'false');
      card.setAttribute('aria-label', `${slide.title} · ${slide.description}`);

      const cardImage = document.createElement('img');
      cardImage.src = slide.thumb;
      cardImage.alt = slide.alt;
      cardImage.loading = 'lazy';

      const cardBody = document.createElement('div');
      cardBody.className = 'hero-card-body';

      const cardTitle = document.createElement('p');
      cardTitle.className = 'hero-card-title';
      cardTitle.textContent = slide.title;

      const cardDesc = document.createElement('p');
      cardDesc.className = 'hero-card-desc';
      cardDesc.textContent = slide.description;

      cardBody.append(cardTitle, cardDesc);
      card.append(cardImage, cardBody);
      heroDiscovery.append(card);
    });

    const heroCards = heroDiscovery.querySelectorAll('.hero-card');
    let heroIndex = 0;
    let heroTimer = null;
    const INTERVAL = 8000;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const setHeroSlide = (index) => {
      const slide = heroSlides[index];
      heroIndex = index;
      if (heroMediaImage) {
        heroMediaImage.src = slide.image;
        heroMediaImage.alt = slide.alt;
      }
      if (heroMediaBadge) {
        heroMediaBadge.textContent = slide.badge;
      }
      heroDiscoveryTitle.textContent = slide.title;
      heroDiscoveryLink.textContent = slide.linkLabel || 'Explore reflections';
      heroDiscoveryLink.href = slide.href;

      heroCards.forEach((card) => {
        const active = card.dataset.index === String(index);
        card.classList.toggle('is-active', active);
        card.setAttribute('aria-current', active ? 'true' : 'false');
      });
    };

    const advanceHero = () => setHeroSlide((heroIndex + 1) % heroSlides.length);

    const startHeroTimer = () => {
      if (prefersReducedMotion) return null;
      return window.setInterval(advanceHero, INTERVAL);
    };

    const stopHeroTimer = () => {
      if (heroTimer) {
        window.clearInterval(heroTimer);
        heroTimer = null;
      }
    };

    // Start after first interaction to avoid immediate motion
    let started = false;
    const kickOff = () => {
      if (!started && !prefersReducedMotion) {
        started = true;
        heroTimer = startHeroTimer();
      }
    };

    heroDiscovery.addEventListener('mouseenter', stopHeroTimer);
    heroDiscovery.addEventListener('mouseleave', () => { if (started) heroTimer = startHeroTimer(); });
    heroDiscovery.addEventListener('focusin', stopHeroTimer);
    heroDiscovery.addEventListener('focusout', () => { if (started) heroTimer = startHeroTimer(); });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopHeroTimer();
      else if (started) heroTimer = startHeroTimer();
    });

    heroCards.forEach((card) => {
      card.addEventListener('click', () => {
        const index = Number.parseInt(card.dataset.index || '0', 10);
        setHeroSlide(index);
        stopHeroTimer();
        heroTimer = startHeroTimer();
      });

      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          card.click();
        }
      });

      // Treat first hover/click as consent to motion
      card.addEventListener('pointerenter', kickOff, { once: true });
      card.addEventListener('click', kickOff, { once: true });
    });

    setHeroSlide(0);

    const discoveryPrev = document.querySelector('[data-js="discovery-prev"]');
    const discoveryNext = document.querySelector('[data-js="discovery-next"]');
    const scrollCarousel = (direction) => {
      heroDiscovery.scrollBy({
        left: direction * 340,
        behavior: 'smooth'
      });
    };

    if (discoveryPrev) {
      discoveryPrev.addEventListener('click', () => scrollCarousel(-1));
    }

    if (discoveryNext) {
      discoveryNext.addEventListener('click', () => scrollCarousel(1));
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  });
})();
