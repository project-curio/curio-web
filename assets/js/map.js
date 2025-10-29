(function () {
  const mapElements = document.querySelectorAll('.js-city-map, .js-home-map');
  if (!mapElements.length) {
    return;
  }

  if (typeof window.L === 'undefined') {
    mapElements.forEach((node) => {
      node.classList.remove('map-canvas');
      node.classList.add('map-fallback');
      node.removeAttribute('data-lat');
      node.removeAttribute('data-lng');
      node.removeAttribute('data-zoom');
      node.textContent =
        'Interactive map preview is unavailable right now. Explore the highlights listed below.';
    });
    console.warn('Leaflet library not found. Skipping Curio city map enhancement.');
    return;
  }

  const escapeHtml = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (character) => {
      const entities = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      };
      return entities[character] ?? character;
    });

  mapElements.forEach((node) => {
    const isHomeMap = node.classList.contains('js-home-map');
    const lat = Number.parseFloat(node.dataset.lat ?? '');
    const lng = Number.parseFloat(node.dataset.lng ?? '');
    const zoom = Number.parseInt(node.dataset.zoom ?? '', 10) || 12;

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      console.warn('Curio map skipped: invalid coordinates provided.');
      return;
    }

    const places = (() => {
      try {
        return JSON.parse(node.dataset.places ?? '[]');
      } catch (error) {
        console.error('Unable to parse map places data:', error);
        return [];
      }
    })();

    const mapInstance = L.map(node, {
      scrollWheelZoom: isHomeMap,
      tap: false,
      keyboard: true
    }).setView([lat, lng], zoom);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(mapInstance);

    const bounds = [];

    places.forEach((place) => {
      if (!place || !Number.isFinite(place.lat) || !Number.isFinite(place.lng)) {
        return;
      }

      const point = [place.lat, place.lng];
      bounds.push(point);

      const labelParts = [place.name];
      if (place.description) {
        labelParts.push(place.description);
      }

      const accessibleLabel = labelParts.filter(Boolean).join(' — ') || 'Cultural site';

      const marker = L.marker(point, {
        title: place.name,
        alt: accessibleLabel,
        keyboard: false
      }).addTo(mapInstance);

      if (marker.options.icon && marker.options.icon.options) {
        marker.options.icon.options.alt = accessibleLabel;
      }

      const popupPieces = [`<strong>${escapeHtml(place.name ?? 'Cultural site')}</strong>`];
      if (place.description) {
        popupPieces.push(`<span>${escapeHtml(place.description)}</span>`);
      }

      marker.bindPopup(popupPieces.join('<br>'));

      marker.on('add', () => {
        window.requestAnimationFrame(() => {
          const element = marker.getElement();
          if (!element) {
            return;
          }

          element.setAttribute('aria-label', accessibleLabel);
          element.setAttribute('role', 'img');
          element.setAttribute('title', place.name ?? 'Cultural site');
          element.setAttribute('alt', accessibleLabel);
          element.removeAttribute('tabindex');
        });
      });
    });

    if (bounds.length > 1) {
      mapInstance.fitBounds(bounds, {
        padding: [32, 32],
        maxZoom: isHomeMap ? Math.max(zoom, 8) : Math.max(zoom, 14)
      });
    } else if (!bounds.length) {
      mapInstance.setView([lat, lng], zoom);
    }

    mapInstance.whenReady(() => {
      window.setTimeout(() => mapInstance.invalidateSize(), 200);
    });
  });
})();
