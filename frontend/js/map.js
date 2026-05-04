// frontend/js/map.js
// Google Maps + Geolocation integration

window._userLocation = null;
window._map          = null;
window._markers      = [];

// ── Initialise Google Map ─────────────────────────────────────────────────────
window.initGoogleMap = function (containerId, lat = 24.8607, lng = 67.0011) {
  if (typeof google === 'undefined') {
    console.warn('Google Maps not loaded. Add your API key to dashboard.html (search for YOUR_GOOGLE_MAPS_API_KEY).');
    return false;
  }
  const el = document.getElementById(containerId);
  if (!el) return false;

  window._map = new google.maps.Map(el, {
    zoom: 13,
    center: { lat, lng },
    mapTypeControl: true,
    fullscreenControl: true,
    streetViewControl: false,
    styles: [
      { featureType: 'water',     elementType: 'geometry', stylers: [{ color: '#c9e8fd' }] },
      { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#f3f4f6' }] },
      { featureType: 'road',      elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
    ]
  });

  // User location marker (blue)
  const userMarker = new google.maps.Marker({
    position: { lat, lng },
    map: window._map,
    title: 'Your Location',
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 10,
      fillColor: '#1565C0',
      fillOpacity: 1,
      strokeColor: '#fff',
      strokeWeight: 3
    },
    animation: google.maps.Animation.DROP,
    zIndex: 1000
  });
  window._markers.push(userMarker);
  return true;
};

// ── Add donor markers ──────────────────────────────────────────────────────────
window.addDonorMarkersToMap = function (donors) {
  if (!window._map) return;
  // Clear old non-user markers
  window._markers.slice(1).forEach(m => m.setMap(null));
  window._markers = window._markers.slice(0, 1);

  donors.forEach(donor => {
    if (!donor.location?.lat || donor.location.lat === 0) return;

    const marker = new google.maps.Marker({
      position: { lat: donor.location.lat, lng: donor.location.lng },
      map: window._map,
      title: `${donor.name} — ${donor.blood_group}`,
      label: { text: donor.blood_group, color: 'white', fontSize: '11px', fontWeight: 'bold' },
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 18,
        fillColor: '#D32F2F',
        fillOpacity: 0.9,
        strokeColor: '#fff',
        strokeWeight: 2
      }
    });

    const info = new google.maps.InfoWindow({
      content: `<div style="padding:10px;min-width:180px;font-family:sans-serif;">
        <strong style="font-size:1rem;">${donor.name}</strong><br/>
        🩸 <strong style="color:#D32F2F;">${donor.blood_group}</strong><br/>
        📍 ${donor.city || ''}
        ${donor.distance ? `<br/><small style="color:#666;">📏 ${donor.distance} km away</small>` : ''}
        <br/><small style="color:#2E7D32;">✅ Available</small>
      </div>`
    });

    marker.addListener('click', () => {
      window._markers.forEach(m => m._info?.close());
      info.open(window._map, marker);
      marker._info = info;
    });
    marker._info = info;
    window._markers.push(marker);
  });

  // Fit bounds
  if (window._markers.length > 1) {
    const bounds = new google.maps.LatLngBounds();
    window._markers.forEach(m => bounds.extend(m.getPosition()));
    window._map.fitBounds(bounds);
    if (window._map.getZoom() > 15) window._map.setZoom(15);
  }
};

// ── Add request markers ────────────────────────────────────────────────────────
window.addRequestMarkersToMap = function (requests) {
  if (!window._map) return;

  requests.forEach(req => {
    if (!req.location?.lat || req.location.lat === 0) return;

    const marker = new google.maps.Marker({
      position: { lat: req.location.lat, lng: req.location.lng },
      map: window._map,
      title: `Blood Request: ${req.blood_group}`,
      label: { text: req.blood_group, color: 'white', fontSize: '11px', fontWeight: 'bold' },
      icon: {
        path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
        scale: 6,
        fillColor: req.isEmergency ? '#E65100' : '#D32F2F',
        fillOpacity: 0.95,
        strokeColor: '#fff',
        strokeWeight: 2,
        rotation: 180
      }
    });

    const info = new google.maps.InfoWindow({
      content: `<div style="padding:10px;min-width:180px;font-family:sans-serif;">
        ${req.isEmergency ? '<strong style="color:#E65100;">🚨 EMERGENCY</strong><br/>' : ''}
        🩸 <strong style="color:#D32F2F;">${req.blood_group}</strong> needed<br/>
        📍 ${req.city || ''}
        ${req.hospital ? `<br/>🏥 ${req.hospital}` : ''}
        ${req.units_needed ? `<br/>📦 ${req.units_needed} unit(s)` : ''}
      </div>`
    });

    marker.addListener('click', () => info.open(window._map, marker));
    window._markers.push(marker);
  });
};

// ── Share location ─────────────────────────────────────────────────────────────
window.shareLocation = async function () {
  // Determine which map container to use
  const containerId = document.getElementById('map-container-r')?.offsetParent !== null ? 'map-container-r' : 'map-container';
  const statusElId  = containerId === 'map-container-r' ? 'location-status-r' : 'location-status';
  const btnId       = containerId === 'map-container-r' ? 'share-location-btn-r' : 'share-location-btn';

  const statusEl = document.getElementById(statusElId);
  const btn      = document.getElementById(btnId);

  if (!navigator.geolocation) {
    if (statusEl) statusEl.textContent = '❌ Geolocation not supported by this browser.';
    showToast('Geolocation not supported', 'error');
    return;
  }

  if (statusEl) statusEl.textContent = '🔄 Getting your location...';
  if (btn) btn.disabled = true;

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      window._userLocation = { lat, lng };

      if (statusEl) statusEl.textContent = `✅ Location found (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
      if (btn) { btn.disabled = false; btn.textContent = '📍 Update Location'; }
      showToast('📍 Location shared!', 'success');

      // Update backend
      const s = getSession();
      if (s) { try { await Auth.updateLocation(lat, lng); } catch (e) { /* non-critical */ } }

      // FIX: Use whenMapsReady() to wait for Maps library before initialising.
      // Previously, `typeof google === 'undefined'` was always true when `defer`
      // was on the script tag — the library hadn't loaded yet when this code ran.
      const mapWrap = document.getElementById(containerId);
      if (mapWrap) {
          mapWrap.style.cssText = 'width:100%;min-height:440px;display:block;';
          mapWrap.innerHTML = `<div id="google-map-canvas" style="width:100%;height:440px;min-height:440px;display:block;position:relative;"></div>`;
        whenMapsReady(async function() {
          console.log('whenMapsReady fired!');  // 👈 add this
          const loaded = initGoogleMap('google-map-canvas', lat, lng);
          console.log('initGoogleMap result:', loaded);  // 👈 and this
          if (loaded) {
            try {
              const session = getSession();
              if (!session) return;
              const roles = getUserRoles(session.user);

              if (roles.includes('donor')) {
                const rData = await Requests.getDonorRequests();
                addRequestMarkersToMap(rData.requests || []);
              }
              if (roles.includes('receiver')) {
                const bloodFilter = document.getElementById('map-blood-filter')?.value || '';
                const dData = await Donations.getNearbyDonors({ lat, lng, radius: 50, blood_group: bloodFilter });
                addDonorMarkersToMap(dData.donors || []);
              }
            } catch (e) { console.warn('Map data load failed:', e); }
          }
        });
      }
    },
    (err) => {
      const msgs = { 1: 'Location permission denied.', 2: 'Location unavailable.', 3: 'Location request timed out.' };
      const msg = msgs[err.code] || 'Failed to get location.';
      if (statusEl) statusEl.textContent = `❌ ${msg}`;
      if (btn) btn.disabled = false;
      showToast(msg, 'error');
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
  );
};

// ── Haversine distance (client-side) ─────────────────────────────────────────
window.calcDistance = function (lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))).toFixed(1);
};
