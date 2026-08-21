'use strict';

const STORAGE_KEY = 'bagback-pwa-state-v1';
const GPS_MAX_AGE_MS = 15000;
const GPS_MAX_ACCURACY_M = 35;

const defaultState = {
  activeWalk: null,
  bags: []
};

let state = loadState();
let currentLocation = null;
let watchId = null;
let map = null;
let userMarker = null;
let bagMarkers = [];
let compassHeading = null;
let toastTimer = null;

const el = id => document.getElementById(id);
const walkStatus = el('walkStatus');
const walkDot = el('walkDot');
const gpsStatus = el('gpsStatus');
const gpsDetail = el('gpsDetail');
const gpsDot = el('gpsDot');
const startWalkBtn = el('startWalkBtn');
const endWalkBtn = el('endWalkBtn');
const dropBagBtn = el('dropBagBtn');
const compassBtn = el('compassBtn');
const bagList = el('bagList');
const emptyState = el('emptyState');
const bagCount = el('bagCount');
const centerMapBtn = el('centerMapBtn');
const clearDataBtn = el('clearDataBtn');
const toast = el('toast');

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (parsed && Array.isArray(parsed.bags)) return parsed;
  } catch (_) {}
  return structuredClone(defaultState);
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('show');
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function startLocationWatch() {
  if (!('geolocation' in navigator)) {
    gpsStatus.textContent = 'Not supported';
    gpsDetail.textContent = 'This browser does not provide geolocation.';
    return;
  }
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = navigator.geolocation.watchPosition(
    position => {
      currentLocation = {
        lat: position.coords.latitude,
        lon: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp || Date.now()
      };
      render();
    },
    error => {
      gpsStatus.textContent = error.code === 1 ? 'Permission denied' : 'Location unavailable';
      gpsDetail.textContent = error.message || 'Check location permissions.';
      gpsDot.className = 'status-dot warn';
      dropBagBtn.disabled = true;
    },
    {
      enableHighAccuracy: true,
      maximumAge: 2000,
      timeout: 15000
    }
  );
}

function locationFresh() {
  if (!currentLocation) return false;
  const age = Date.now() - currentLocation.timestamp;
  return age <= GPS_MAX_AGE_MS && currentLocation.accuracy <= GPS_MAX_ACCURACY_M;
}

function startWalk() {
  state.activeWalk = { id: uuid(), startedAt: Date.now() };
  saveState();
  startLocationWatch();
  render();
  showToast('Walk started');
}

function endWalk() {
  if (!state.activeWalk) return;
  const outstanding = state.bags.filter(b => !b.pickedAt && b.walkId === state.activeWalk.id).length;
  if (outstanding > 0 && !confirm(`End walk with ${outstanding} bag${outstanding === 1 ? '' : 's'} still saved? They will remain as forgotten bags.`)) return;
  state.activeWalk = null;
  saveState();
  render();
  showToast(outstanding ? 'Walk ended. Bags kept as forgotten.' : 'Walk ended');
}

function dropBag() {
  if (!state.activeWalk || !locationFresh()) return;
  state.bags.push({
    id: uuid(),
    walkId: state.activeWalk.id,
    lat: currentLocation.lat,
    lon: currentLocation.lon,
    droppedAt: Date.now(),
    pickedAt: null
  });
  saveState();
  render();
  showToast('Bag location saved');
}

function pickUpBag(id) {
  const bag = state.bags.find(b => b.id === id);
  if (!bag) return;
  bag.pickedAt = Date.now();
  saveState();
  render();
  showToast('Bag picked up');
}

function clearData() {
  if (!confirm('Delete all BagBack data stored in this browser?')) return;
  state = structuredClone(defaultState);
  localStorage.removeItem(STORAGE_KEY);
  render();
  showToast('Local data cleared');
}

function haversineMeters(aLat, aLon, bLat, bLon) {
  const R = 6371000;
  const p1 = aLat * Math.PI / 180;
  const p2 = bLat * Math.PI / 180;
  const dp = (bLat - aLat) * Math.PI / 180;
  const dl = (bLon - aLon) * Math.PI / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function bearingDegrees(aLat, aLon, bLat, bLon) {
  const p1 = aLat * Math.PI / 180;
  const p2 = bLat * Math.PI / 180;
  const dl = (bLon - aLon) * Math.PI / 180;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function formatDistance(m) {
  if (!Number.isFinite(m)) return 'Distance unavailable';
  if (m < 1000) return `${Math.round(m)} m away`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km away`;
}

function formatTime(ms) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  }).format(new Date(ms));
}

function bagIsForgotten(bag) {
  return !state.activeWalk || bag.walkId !== state.activeWalk.id;
}

function directionUrl(bag) {
  return `https://maps.apple.com/?daddr=${encodeURIComponent(bag.lat + ',' + bag.lon)}&dirflg=w`;
}

function relativeArrowRotation(bag) {
  if (!currentLocation) return 0;
  const bearing = bearingDegrees(currentLocation.lat, currentLocation.lon, bag.lat, bag.lon);
  return compassHeading == null ? bearing : (bearing - compassHeading + 360) % 360;
}

function renderBags() {
  const unpicked = state.bags.filter(b => !b.pickedAt).map(b => ({
    ...b,
    distance: currentLocation ? haversineMeters(currentLocation.lat, currentLocation.lon, b.lat, b.lon) : Infinity
  })).sort((a, b) => a.distance - b.distance);

  bagCount.textContent = String(unpicked.length);
  emptyState.hidden = unpicked.length > 0;
  bagList.innerHTML = '';

  for (const bag of unpicked) {
    const card = document.createElement('article');
    card.className = 'card bag-card';
    const forgotten = bagIsForgotten(bag);
    const rot = relativeArrowRotation(bag);
    card.innerHTML = `
      <div class="bag-main">
        <div class="bag-top">
          <span class="bag-label">Bag</span>
          ${forgotten ? '<span class="forgotten">Forgotten</span>' : ''}
        </div>
        <div class="bag-distance"><span class="arrow" style="transform:rotate(${rot}deg)">&#8593;</span>${formatDistance(bag.distance)}</div>
        <div class="bag-meta">Dropped ${formatTime(bag.droppedAt)}</div>
      </div>
      <div class="bag-actions">
        <button class="pickup-btn" data-pickup="${bag.id}">Pick up</button>
        <button class="directions-btn" data-directions="${bag.id}">Directions</button>
      </div>`;
    bagList.appendChild(card);
  }

  bagList.querySelectorAll('[data-pickup]').forEach(button => {
    button.addEventListener('click', () => pickUpBag(button.dataset.pickup));
  });
  bagList.querySelectorAll('[data-directions]').forEach(button => {
    button.addEventListener('click', () => {
      const bag = state.bags.find(b => b.id === button.dataset.directions);
      if (bag) window.open(directionUrl(bag), '_blank', 'noopener');
    });
  });
}

function renderGps() {
  if (!currentLocation) {
    gpsStatus.textContent = 'Waiting for location';
    gpsDetail.textContent = 'Allow precise location when asked.';
    gpsDot.className = 'status-dot warn';
    return;
  }
  const ageSec = Math.max(0, Math.round((Date.now() - currentLocation.timestamp) / 1000));
  if (locationFresh()) {
    gpsStatus.textContent = 'Ready';
    gpsDetail.textContent = `Accuracy about ${Math.round(currentLocation.accuracy)} m`;
    gpsDot.className = 'status-dot good';
  } else {
    gpsStatus.textContent = 'Waiting for fresh GPS';
    gpsDetail.textContent = `Accuracy ${Math.round(currentLocation.accuracy)} m, age ${ageSec} s`;
    gpsDot.className = 'status-dot warn';
  }
}

function renderWalk() {
  const active = !!state.activeWalk;
  walkStatus.textContent = active ? 'Active' : 'Not started';
  walkDot.className = active ? 'status-dot good' : 'status-dot';
  startWalkBtn.disabled = active;
  endWalkBtn.disabled = !active;
  dropBagBtn.disabled = !active || !locationFresh();
}

function initMap() {
  if (!window.maplibregl) {
    el('mapFallback').style.display = 'grid';
    return;
  }
  try {
    map = new maplibregl.Map({
      container: 'map',
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [14.42, 50.08],
      zoom: 11,
      attributionControl: true
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', updateMap);
  } catch (_) {
    el('mapFallback').style.display = 'grid';
  }
}

function makeMarkerClass(className) {
  const node = document.createElement('div');
  node.className = `marker ${className}`;
  return node;
}

function updateMap() {
  if (!map) return;
  if (userMarker) { userMarker.remove(); userMarker = null; }
  bagMarkers.forEach(m => m.remove());
  bagMarkers = [];

  if (currentLocation) {
    userMarker = new maplibregl.Marker({ element: makeMarkerClass('user') })
      .setLngLat([currentLocation.lon, currentLocation.lat])
      .addTo(map);
  }

  const unpicked = state.bags.filter(b => !b.pickedAt);
  for (const bag of unpicked) {
    const marker = new maplibregl.Marker({ element: makeMarkerClass(bagIsForgotten(bag) ? 'forgotten' : 'bag') })
      .setLngLat([bag.lon, bag.lat])
      .addTo(map);
    bagMarkers.push(marker);
  }
}

function centerMap() {
  if (!map || !currentLocation) return;
  map.easeTo({ center: [currentLocation.lon, currentLocation.lat], zoom: 16, duration: 450 });
}

async function enableCompass() {
  if (!('DeviceOrientationEvent' in window)) {
    showToast('Compass is not available on this device');
    return;
  }
  try {
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      const result = await DeviceOrientationEvent.requestPermission();
      if (result !== 'granted') throw new Error('not granted');
    }
    window.addEventListener('deviceorientation', event => {
      let heading = null;
      if (typeof event.webkitCompassHeading === 'number') heading = event.webkitCompassHeading;
      else if (typeof event.alpha === 'number') heading = (360 - event.alpha) % 360;
      if (heading != null) {
        compassHeading = heading;
        renderBags();
      }
    }, true);
    compassBtn.textContent = 'Compass enabled';
    compassBtn.disabled = true;
    showToast('Compass enabled');
  } catch (_) {
    showToast('Compass permission was not granted');
  }
}

function render() {
  renderWalk();
  renderGps();
  renderBags();
  updateMap();
}

startWalkBtn.addEventListener('click', startWalk);
endWalkBtn.addEventListener('click', endWalk);
dropBagBtn.addEventListener('click', dropBag);
compassBtn.addEventListener('click', enableCompass);
centerMapBtn.addEventListener('click', centerMap);
clearDataBtn.addEventListener('click', clearData);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') startLocationWatch();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('service-worker.js').catch(() => {}));
}

window.addEventListener('load', () => {
  initMap();
  startLocationWatch();
  render();
  setInterval(render, 1000);
});
