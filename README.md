# Curio — Front-End MVP

![Version](https://img.shields.io/badge/version-0.1.0-0D474E?labelColor=0B1F24&style=flat-square)
![CI](https://github.com/project-curio/curio-web/actions/workflows/ci-and-deploy.yml/badge.svg)

Curio is a cultural discovery prototype that centers reflections over ratings. This static MVP locks in UI/UX for the future React + Supabase + Mapbox build. Pages showcase discovery flows for cities, place detail storytelling, and partner onboarding.

## Project Structure

```
curio-web/
├── assets/
│   ├── css/        # Normalize + design system styles
│   ├── js/         # Navigation, form interactions, Leaflet bootstrap
│   └── images/     # Brand assets (favicons, hero art placeholders)
├── cities/         # Static landing pages for pilot cities
├── places/         # Institution detail prototypes
├── .github/        # CI + GitHub Pages deployment workflow
├── pa11yci.json    # Accessibility scan configuration
├── .lighthouserc.json
├── .stylelintrc.json
├── .eslintrc.json
└── README.md
```

## Getting Started

Prerequisites:

- Node.js 20+ (matches CI environment)
- npm 10+

Install dependencies:

```bash
npm install
```

Run the development smoke tests:

```bash
# HTML linting
npm run lint:html

# CSS linting
npm run lint:css

# JavaScript linting
npm run lint:js

# Accessibility regression (pa11y + http-server)
npm run a11y
```

A consolidated command used by CI for Stage 6:

```bash
npm run stage6:validate
```

## Continuous Integration & Deployment

GitHub Actions workflow: `.github/workflows/ci-and-deploy.yml`

1. Install dependencies via `npm ci`.
2. Run HTML, CSS, and JS linting.
3. Launch a local http-server for pa11y.
4. Execute pa11y-ci, Lighthouse CI (via `treosh/lighthouse-ci-action`), and Lychee link checks.
5. On main branch pushes, minify assets with esbuild, package the static site, and deploy to GitHub Pages.

## Accessibility, SEO, and Performance Targets

- pa11y-ci: zero critical accessibility violations across primary URLs.
- Lighthouse CI assertions:
  - Performance ≥ 0.85 (warning threshold)
  - Accessibility ≥ 0.90 (enforced)
  - SEO ≥ 0.90 (enforced)
- Lychee: no broken hyperlinks, email links excluded.

## Contact & Collaboration

- General: [hello@curio.city](mailto:hello@curio.city)
- Partnerships: [partners@curio.city](mailto:partners@curio.city)
- Accessibility support: [access@curio.city](mailto:access@curio.city)

Curio is built in partnership with cultural workers. Let us know how these prototypes support your storytelling and accessibility goals.

---

_This repository is the static front-end MVP. Next phase migrates to React + Supabase + Mapbox, adds authenticated dashboards, and expands partner analytics._
