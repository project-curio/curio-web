class HeroSlider {
  constructor(root, config = {}) {
    this.root = root;
    this.slides = Array.from(root.querySelectorAll(".hero-slider__slide"));
    this.dots = Array.from(root.querySelectorAll(".hero-slider__dot"));
    this.autoAdvanceDelay = config.autoAdvanceDelay || 7000;
    this.manualPauseDelay = config.manualPauseDelay || 10000;
    this.advanceTimer = null;
    this.currentIndex = Math.max(
      0,
      this.slides.findIndex((slide) => slide.classList.contains("is-active"))
    );
    this.isDocumentVisible = document.visibilityState === "visible";
    this.dataUrl = config.dataUrl || root.dataset.heroSource || "assets/data/hero-slides.json";
    this.prefetchedSlides = config && config.slides ? this.normalizeSlides(config.slides) : null;

    this.handlePointerEnter = this.handlePointerEnter.bind(this);
    this.handlePointerLeave = this.handlePointerLeave.bind(this);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
  }

  async init() {
    if (!this.root) {
      return;
    }

    if (!this.slides.length) {
      let slidesData = null;
      this.root.setAttribute("aria-busy", "true");
      try {
        slidesData = await this.loadSlidesData();
      } finally {
        this.root.removeAttribute("aria-busy");
      }
      if (slidesData && slidesData.length) {
        const normalizedSlides = this.normalizeSlides(slidesData);
        if (!normalizedSlides.length) {
          return;
        }
        this.renderSlides(normalizedSlides);
        this.slides = Array.from(this.root.querySelectorAll(".hero-slider__slide"));
        this.dots = Array.from(this.root.querySelectorAll(".hero-slider__dot"));
      }
    }

    if (!this.slides.length) {
      return;
    }

    if (!this.dots.length) {
      this.buildDots();
    }

    this.applyInitialState();
    this.bindEvents();
    this.scheduleAdvance(this.autoAdvanceDelay);
  }

  async loadSlidesData() {
    if (this.prefetchedSlides && this.prefetchedSlides.length) {
      return this.prefetchedSlides;
    }

    if (!this.dataUrl) {
      return null;
    }

    try {
      const response = await fetch(this.dataUrl, { cache: "no-cache" });
      if (!response.ok) {
        throw new Error(`HeroSlider: Failed to fetch slide data (${response.status})`);
      }
      const payload = await response.json();
      return this.normalizeSlides(payload);
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  renderSlides(slidesData) {
    const slidesToRender = this.normalizeSlides(slidesData);
    if (!slidesToRender.length) {
      return;
    }

    let slidesContainer = this.root.querySelector(".hero-slider__slides");
    if (!slidesContainer) {
      slidesContainer = document.createElement("div");
      slidesContainer.className = "hero-slider__slides";
      this.root.appendChild(slidesContainer);
    } else {
      slidesContainer.innerHTML = "";
    }

    const existingDots = this.root.querySelector(".hero-slider__dots");
    if (existingDots) {
      existingDots.remove();
    }
    this.dots = [];

    let activeIndex = slidesToRender.findIndex((slide) => Boolean(slide.isActive));
    if (activeIndex < 0) {
      activeIndex = 0;
    }
    this.currentIndex = activeIndex;

    slidesToRender.forEach((slide, index) => {
      const article = document.createElement("article");
      article.className = "hero-slider__slide";
      const slideId = slide.id || `hero-slide-${index + 1}`;
      article.id = slideId;
      article.setAttribute("aria-label", slide.ariaLabel || slide.title || `Slide ${index + 1}`);
      article.setAttribute("aria-hidden", "true");
      if (slide.image) {
        article.style.setProperty("--hero-image", `url("${this.resolveAssetUrl(slide.image)}")`);
      }

      const textTheme = this.resolveTextTheme(slide);
      article.dataset.textTheme = textTheme;
      const tone = typeof slide.imageTone === "string" ? slide.imageTone.trim().toLowerCase() : "";
      if (tone) {
        article.dataset.imageTone = tone;
      }

      const buttonStyle = this.resolveButtonColor(slide.buttonColor);
      if (buttonStyle.name) {
        article.dataset.buttonColor = buttonStyle.name;
      }
      if (buttonStyle.backgroundColor) {
        article.style.setProperty("--hero-cta-bg", buttonStyle.backgroundColor);
      }
      if (buttonStyle.textColor) {
        article.style.setProperty("--hero-cta-color", buttonStyle.textColor);
      }

      const content = document.createElement("div");
      content.className = "hero-slider__content";

      if (slide.eyebrow) {
        const eyebrow = document.createElement("span");
        eyebrow.className = "hero-slider__eyebrow";
        eyebrow.textContent = slide.eyebrow;
        content.appendChild(eyebrow);
      }

      const headingTag = index === 0 ? "h1" : "h2";
      const titleEl = document.createElement(headingTag);
      titleEl.className = "hero-slider__title";
      titleEl.textContent = slide.title || "";
      content.appendChild(titleEl);

      if (slide.tagline) {
        const tagline = document.createElement("p");
        tagline.className = "hero-slider__tagline";
        tagline.textContent = slide.tagline;
        content.appendChild(tagline);
      }

      if (slide.ctaText) {
        const cta = document.createElement("a");
        cta.className = "hero-slider__cta";
        cta.href = slide.buttonHref || slide.ctaHref || "#";

        const label = document.createElement("span");
        label.className = "hero-slider__cta-label";
        label.textContent = slide.ctaText;
        cta.appendChild(label);

        const icon = this.createIcon(slide.ctaIcon);
        if (icon) {
          cta.appendChild(icon);
        }

        content.appendChild(cta);
      }

      if (Array.isArray(slide.tags) && slide.tags.length) {
        const tagsList = document.createElement("div");
        tagsList.className = "hero-tags tags";
        tagsList.setAttribute("aria-label", slide.tagsLabel || "Top cultural themes");

        slide.tags.forEach((tagText) => {
          const tag = document.createElement("span");
          tag.className = "tag";
          tag.textContent = tagText;
          tagsList.appendChild(tag);
        });

        content.appendChild(tagsList);
      }

      if (slide.includeSearch) {
        const search = this.createSearchForm(slide, index);
        content.appendChild(search);
      }

      article.appendChild(content);

      if (slide.credit) {
        const credit = document.createElement("p");
        credit.className = "hero-slider__credit";

        if (typeof slide.credit === "string") {
          credit.textContent = slide.credit;
        } else {
          const prefix = slide.credit.prefix || "Photo";
          if (prefix) {
            credit.append(document.createTextNode(`${prefix}: `));
          }

          if (slide.credit.name) {
            if (slide.credit.profileUrl) {
              const profileLink = document.createElement("a");
              profileLink.href = slide.credit.profileUrl;
              profileLink.target = "_blank";
              profileLink.rel = "noopener noreferrer";
              profileLink.textContent = slide.credit.name;
              credit.append(profileLink);
            } else {
              credit.append(document.createTextNode(slide.credit.name));
            }
          } else if (slide.credit.text) {
            credit.append(document.createTextNode(slide.credit.text));
          }

          if (slide.credit.imageUrl) {
            if (slide.credit.name || slide.credit.text) {
              credit.append(document.createTextNode(" · "));
            }
            const imageLink = document.createElement("a");
            imageLink.href = slide.credit.imageUrl;
            imageLink.target = "_blank";
            imageLink.rel = "noopener noreferrer";
            imageLink.textContent = slide.credit.imageLabel || "View image";
            credit.append(imageLink);
          } else if (slide.credit.source) {
            const sourceText = slide.credit.name || slide.credit.text ? ` · ${slide.credit.source}` : slide.credit.source;
            credit.append(document.createTextNode(sourceText));
          }
        }

        article.appendChild(credit);
      }

      slidesContainer.appendChild(article);
    });
  }

  normalizeSlides(slidesData) {
    const list = Array.isArray(slidesData)
      ? slidesData
      : slidesData && Array.isArray(slidesData.slides)
        ? slidesData.slides
        : null;

    if (!Array.isArray(list)) {
      return [];
    }

    return list.filter((slide) => {
      if (!slide || typeof slide !== "object") {
        return false;
      }
      if (Object.prototype.hasOwnProperty.call(slide, "_comment")) {
        return false;
      }
      return true;
    });
  }

  resolveTextTheme(slide) {
    if (!slide || typeof slide !== "object") {
      return "light";
    }

    const declaredTheme = typeof slide.textTheme === "string" ? slide.textTheme.trim().toLowerCase() : "";
    if (declaredTheme === "light" || declaredTheme === "dark") {
      return declaredTheme;
    }

    const tone = typeof slide.imageTone === "string" ? slide.imageTone.trim().toLowerCase() : "";
    if (tone === "light") {
      return "dark";
    }

    return "light";
  }

  resolveButtonColor(buttonColor) {
    const name = typeof buttonColor === "string" ? buttonColor.trim().toLowerCase() : "";
    if (name === "dark") {
      return {
        name,
        backgroundColor: "#0D474E",
        textColor: "#ffffff"
      };
    }

    if (name === "light") {
      return {
        name,
        backgroundColor: "#17856D",
        textColor: "#ffffff"
      };
    }

    return {
      name: "",
      backgroundColor: "",
      textColor: ""
    };
  }

  resolveAssetUrl(path) {
    if (!path || typeof path !== "string") {
      return "";
    }

    const trimmed = path.trim();
    if (/^(?:https?:)?\/\//i.test(trimmed) || trimmed.startsWith("data:") || trimmed.startsWith("blob:")) {
      return trimmed;
    }

    try {
      const url = new URL(trimmed, document.baseURI);
      return url.href;
    } catch (error) {
      console.warn("HeroSlider: unable to resolve asset URL", path, error);
      return trimmed;
    }
  }

  updateRootTheme() {
    if (!Array.isArray(this.slides) || !this.slides.length) {
      this.root.removeAttribute("data-theme");
      return;
    }

    const activeSlide = this.slides[this.currentIndex];
    if (!activeSlide) {
      this.root.removeAttribute("data-theme");
      return;
    }

    const theme = activeSlide.dataset.textTheme === "dark" ? "dark" : "light";
    this.root.setAttribute("data-theme", theme);
  }

  buildDots() {
    const dotsContainer = document.createElement("div");
    dotsContainer.className = "hero-slider__dots";
    dotsContainer.setAttribute("role", "tablist");
    dotsContainer.setAttribute("aria-label", "Hero slider navigation");

    this.slides.forEach((slide, index) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "hero-slider__dot";
      dot.setAttribute("aria-label", `Slide ${index + 1} of ${this.slides.length}`);
      if (!slide.id) {
        slide.id = `hero-slide-${index + 1}`;
      }
      dot.setAttribute("aria-controls", slide.id);
      dot.setAttribute("aria-pressed", "false");
      dotsContainer.appendChild(dot);
    });

    this.root.appendChild(dotsContainer);
    this.dots = Array.from(dotsContainer.querySelectorAll(".hero-slider__dot"));
  }

  applyInitialState() {
    this.slides.forEach((slide, index) => {
      if (!slide.id) {
        slide.id = `hero-slide-${index + 1}`;
      }
      const isActive = index === this.currentIndex;
      slide.classList.toggle("is-active", isActive);
      slide.setAttribute("aria-hidden", String(!isActive));
    });

    this.dots.forEach((dot, index) => {
      const isActive = index === this.currentIndex;
      dot.classList.toggle("is-active", isActive);
      dot.setAttribute("aria-pressed", isActive ? "true" : "false");
    });

    this.updateRootTheme();
  }

  bindEvents() {
    this.dots.forEach((dot, index) => {
      dot.addEventListener("click", () => this.handleDotInteraction(index));
      dot.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          this.handleDotInteraction(index);
        }
      });
    });

    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    this.root.addEventListener("mouseenter", this.handlePointerEnter);
    this.root.addEventListener("mouseleave", this.handlePointerLeave);
    this.root.addEventListener("focusin", this.handlePointerEnter);
    this.root.addEventListener("focusout", this.handlePointerLeave);
  }

  handleDotInteraction(index) {
    this.setActiveSlide(index);
    this.scheduleAdvance(this.manualPauseDelay);
  }

  handlePointerEnter() {
    this.clearTimer();
  }

  handlePointerLeave() {
    if (!this.advanceTimer) {
      this.scheduleAdvance(this.autoAdvanceDelay);
    }
  }

  handleVisibilityChange() {
    this.isDocumentVisible = document.visibilityState === "visible";
    if (this.isDocumentVisible) {
      this.scheduleAdvance(this.autoAdvanceDelay);
    } else {
      this.clearTimer();
    }
  }

  setActiveSlide(index) {
    if (index === this.currentIndex || index < 0 || index >= this.slides.length) {
      return;
    }

    const previousSlide = this.slides[this.currentIndex];
    const previousDot = this.dots[this.currentIndex];

    previousSlide.classList.remove("is-active");
    previousSlide.setAttribute("aria-hidden", "true");
    if (previousDot) {
      previousDot.classList.remove("is-active");
      previousDot.setAttribute("aria-pressed", "false");
    }

    this.currentIndex = index;
    const nextSlide = this.slides[this.currentIndex];
    const nextDot = this.dots[this.currentIndex];

    nextSlide.classList.add("is-active");
    nextSlide.setAttribute("aria-hidden", "false");
    if (nextDot) {
      nextDot.classList.add("is-active");
      nextDot.setAttribute("aria-pressed", "true");
    }

    this.updateRootTheme();
  }

  scheduleAdvance(delay) {
    this.clearTimer();
    if (!this.isDocumentVisible) {
      return;
    }

    this.advanceTimer = window.setTimeout(() => {
      const nextIndex = (this.currentIndex + 1) % this.slides.length;
      this.setActiveSlide(nextIndex);
      this.scheduleAdvance(this.autoAdvanceDelay);
    }, delay);
  }

  clearTimer() {
    if (this.advanceTimer) {
      window.clearTimeout(this.advanceTimer);
      this.advanceTimer = null;
    }
  }

  destroy() {
    this.clearTimer();
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    this.root.removeEventListener("mouseenter", this.handlePointerEnter);
    this.root.removeEventListener("mouseleave", this.handlePointerLeave);
    this.root.removeEventListener("focusin", this.handlePointerEnter);
    this.root.removeEventListener("focusout", this.handlePointerLeave);
    this.root.removeAttribute("data-theme");
  }

  createIcon(name) {
    const icons = {
      "arrow-right": ["M5 12h14", "M12 5l7 7-7 7"]
    };

    const paths = icons[name] || icons["arrow-right"];
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "hero-slider__cta-icon");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");

    paths.forEach((d) => {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "currentColor");
      path.setAttribute("stroke-width", "1.5");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      svg.appendChild(path);
    });

    return svg;
  }

  createSearchForm(slide, index) {
    const wrapper = document.createElement("div");
    wrapper.className = "hero-search";

    const form = document.createElement("form");
    form.className = "hero-search-form";
    form.setAttribute("data-js", "search-form");
    form.method = slide.searchMethod || "get";
    form.action = slide.searchAction || "#";

    const field = document.createElement("div");
    field.className = "hero-search-field";

    const searchId = `${slide.id || `hero-slide-${index + 1}`}-search`;
    const label = document.createElement("label");
    label.className = "sr-only";
    label.setAttribute("for", searchId);
    label.textContent = slide.searchLabel || "Search cultural places";

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("viewBox", "0 0 24 24");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M21 21l-4.35-4.35m1.35-3.65a6 6 0 1 0-12 0 6 6 0 0 0 12 0Z");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.5");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.appendChild(path);

    const input = document.createElement("input");
    input.id = searchId;
    input.name = slide.searchName || "q";
    input.type = "search";
    input.autocomplete = "off";
    input.inputMode = "search";
    input.enterKeyHint = "search";
    input.placeholder = slide.searchPlaceholder || "Try “quiet morning in Minneapolis” or “design in Detroit”";

    field.append(label, svg, input);

    const submit = document.createElement("button");
    submit.className = "hero-search-button";
    submit.type = "submit";
    submit.textContent = slide.searchButtonLabel || "Find places to explore";

    const feedback = document.createElement("p");
    feedback.className = "form-feedback";
    feedback.setAttribute("data-js", "search-feedback");
    feedback.setAttribute("role", "status");
    feedback.setAttribute("aria-live", "polite");

    form.append(field, submit, feedback);
    wrapper.appendChild(form);
    return wrapper;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const sliders = document.querySelectorAll(".hero-slider");
  sliders.forEach((slider) => {
    const instance = new HeroSlider(slider);
    instance.init();
    slider.__heroSlider = instance;
  });
});
