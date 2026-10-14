/* ===================== TwinTemp — app logic =====================
   Weather:  Open-Meteo (open-source, no API key)  https://open-meteo.com
   Alerts:   NOAA / National Weather Service (US only)  https://api.weather.gov
   Places:   BigDataCloud reverse geocode (free client API), OpenStreetMap Nominatim fallback,
             Open-Meteo geocoding for city search */
(() => {
  'use strict';
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const LS = {
    get(k, d) { try { const v = localStorage.getItem('twintemp.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('twintemp.' + k, JSON.stringify(v)); } catch (e) {} },
  };
  const DEF = { unit: 'both', auto: true, sound: true, ambient: false, fx: 'medium', reduce: false };
  const prefs = Object.assign({}, DEF, LS.get('prefs', {}));
  const savePrefs = () => LS.set('prefs', prefs);

  const S = {
    data: LS.get('data', null), alerts: LS.get('alerts', []), place: LS.get('place', ''),
    coords: LS.get('coords', null), placeCoords: LS.get('placeCoords', null), fetchedAt: LS.get('fetchedAt', 0),
    mode: LS.get('mode', 'gps'), manual: LS.get('manual', null),
    preview: null, previewNight: false, nextAt: Date.now() + 60000, busy: false, scene: '', night: null, tick: 0,
  };

  /* ---------- weather code book (WMO) ---------- */
  const WMO = {
    0: ['Clear sky', '☀️', '🌙'], 1: ['Mainly clear', '🌤️', '🌙'], 2: ['Partly cloudy', '⛅', '☁️'], 3: ['Overcast', '☁️', '☁️'],
    45: ['Fog', '🌫️', '🌫️'], 48: ['Freezing fog', '🌫️', '🌫️'],
    51: ['Light drizzle', '🌦️', '🌧️'], 53: ['Drizzle', '🌦️', '🌧️'], 55: ['Heavy drizzle', '🌧️', '🌧️'],
    56: ['Freezing drizzle', '🌧️', '🌧️'], 57: ['Heavy freezing drizzle', '🌧️', '🌧️'],
    61: ['Light rain', '🌦️', '🌧️'], 63: ['Rain', '🌧️', '🌧️'], 65: ['Heavy rain', '🌧️', '🌧️'],
    66: ['Freezing rain', '🌨️', '🌨️'], 67: ['Heavy freezing rain', '🌨️', '🌨️'],
    71: ['Light snow', '🌨️', '🌨️'], 73: ['Snow', '🌨️', '🌨️'], 75: ['Heavy snow', '❄️', '❄️'], 77: ['Snow grains', '🌨️', '🌨️'],
    80: ['Rain showers', '🌦️', '🌧️'], 81: ['Heavy showers', '🌧️', '🌧️'], 82: ['Violent showers', '⛈️', '⛈️'],
    85: ['Snow showers', '🌨️', '🌨️'], 86: ['Heavy snow showers', '❄️', '❄️'],
    95: ['Thunderstorm', '⛈️', '⛈️'], 96: ['Thunderstorm with hail', '⛈️', '⛈️'], 99: ['Severe thunderstorm with hail', '⛈️', '⛈️'],
  };
  const wmo = (code, day = true) => { const w = WMO[code] || ['Mystery weather', '🌈', '🌈']; return { text: w[0], icon: day ? w[1] : w[2] }; };

  const SCENE_INFO = {
    clear:     { name: 'Clear', icon: '☀️', day: 'Sunny and smug. Sunglasses are legally encouraged.', night: 'Clear skies. The stars are showing off again.' },
    partly:    { name: 'Partly Cloudy', icon: '⛅', day: 'Clouds are working a part-time shift today.', night: 'A few clouds tucking the moon in.' },
    cloudy:    { name: 'Cloudy', icon: '☁️', day: 'The sky put on its comfiest gray hoodie.', night: 'Blanket of clouds. Very on-brand for a cozy night.' },
    fog:       { name: 'Fog', icon: '🌫️', day: 'Visibility: mysterious. Walk like you’re in a detective novel.', night: 'Spooky fog. Totally normal. Nothing to see here (literally).' },
    drizzle:   { name: 'Drizzle', icon: '🌦️', day: 'The sky is misting like a fancy produce aisle.', night: 'Gentle drizzle. Peak tea-and-blanket conditions.' },
    rain:      { name: 'Rain', icon: '🌧️', day: 'Puddle season. Boots > dignity.', night: 'Rain on the window. Nature’s white-noise machine.' },
    heavyrain: { name: 'Heavy Rain', icon: '🌧️', day: 'Raining like the clouds forgot to close a tab.', night: 'Downpour. The gutters are working overtime.' },
    thunder:   { name: 'Thunderstorm', icon: '⛈️', day: 'Thunder’s doing drum solos. Stay inside, rock star.', night: 'Lightning show tonight. Indoor seating only.' },
    hail:      { name: 'Hail', icon: '🧊', day: 'Ice marbles incoming. Park the car somewhere emotionally safe.', night: 'Hail! The sky is throwing ice cubes. Stay in.' },
    ice:       { name: 'Freezing Rain', icon: '🧊', day: 'Freezing rain. Sidewalks are now ice rinks — waddle like a penguin.', night: 'Icy out there. Penguin walk mandatory.' },
    snow:      { name: 'Snow', icon: '🌨️', day: 'Snow’s falling. Hot cocoa is now a food group.', night: 'Snowy night. Extremely cozy, slightly crunchy.' },
    blizzard:  { name: 'Blizzard', icon: '❄️', day: 'Blizzard! Blanket fort rules are in effect.', night: 'Blizzard night. Do not leave the blanket fort.' },
    tornado:   { name: 'Tornado', icon: '🌪️', day: 'Tornado conditions. Hold onto your cows — and take shelter per official alerts.', night: 'Tornado conditions. Seek shelter now and follow official alerts.' },
    flood:     { name: 'Flood', icon: '🌊', day: 'Flood conditions. Turn around, don’t drown — swimming is for ducks.', night: 'Flooding possible. Avoid driving through water. Ducks only.' },
    hot:       { name: 'Hot', icon: '🥵', day: 'Hot hot hot. Even the sun put on sunglasses. Hydrate!', night: 'Warm night. Fan on full, blanket optional.' },
    cold:      { name: 'Cold', icon: '🥶', day: 'Brr. Your breath is visible and so is your regret about shorts.', night: 'Frosty night. Mittens, socks, and a mug of something.' },
    windy:     { name: 'Windy', icon: '🍃', day: 'Windy! Hats are now flight risks.', night: 'Windy night. The trees are gossiping loudly.' },
  };

  const SKY = {
    clear:     ['linear-gradient(180deg,#4f93cf 0%,#8fbfe0 45%,#f5cf9f 100%)', 'linear-gradient(180deg,#0d1230 0%,#251f4a 55%,#4a2c40 100%)'],
    partly:    ['linear-gradient(180deg,#5e93bf 0%,#a9c3d6 50%,#ecd0ad 100%)', 'linear-gradient(180deg,#121633 0%,#2a2848 55%,#45303e 100%)'],
    cloudy:    ['linear-gradient(180deg,#6e7581 0%,#9aa0a8 50%,#c9b8a6 100%)', 'linear-gradient(180deg,#1e2128 0%,#33343d 55%,#463a36 100%)'],
    fog:       ['linear-gradient(180deg,#8e8b86 0%,#bdb6ac 50%,#d9cdbd 100%)', 'linear-gradient(180deg,#2a2a2e 0%,#46454a 55%,#5a5049 100%)'],
    drizzle:   ['linear-gradient(180deg,#56677a 0%,#7f8d99 50%,#a99a8a 100%)', 'linear-gradient(180deg,#151b25 0%,#26303d 55%,#33302f 100%)'],
    rain:      ['linear-gradient(180deg,#3f4d5e 0%,#5d6b78 50%,#857a70 100%)', 'linear-gradient(180deg,#11161f 0%,#212a37 55%,#2c2729 100%)'],
    heavyrain: ['linear-gradient(180deg,#2c3644 0%,#46505e 50%,#635a55 100%)', 'linear-gradient(180deg,#0b0f16 0%,#1a212c 55%,#251f20 100%)'],
    thunder:   ['linear-gradient(180deg,#232a36 0%,#3a4250 50%,#4f4a4f 100%)', 'linear-gradient(180deg,#08090f 0%,#171b26 55%,#221c22 100%)'],
    hail:      ['linear-gradient(180deg,#2a3240 0%,#465062 50%,#5e6068 100%)', 'linear-gradient(180deg,#0a0c12 0%,#1a1f2b 55%,#262328 100%)'],
    ice:       ['linear-gradient(180deg,#4e6578 0%,#8ba3b5 50%,#c6d3dc 100%)', 'linear-gradient(180deg,#121b26 0%,#24364a 55%,#3a4a5a 100%)'],
    snow:      ['linear-gradient(180deg,#8297ac 0%,#b7c6d4 50%,#e6ebf0 100%)', 'linear-gradient(180deg,#1f2738 0%,#3a475d 55%,#5a6478 100%)'],
    blizzard:  ['linear-gradient(180deg,#a6b3bf 0%,#d3dbe2 50%,#eef2f5 100%)', 'linear-gradient(180deg,#3a4454 0%,#5c6778 55%,#7c8594 100%)'],
    tornado:   ['linear-gradient(180deg,#2c3529 0%,#4e5843 50%,#6c6650 100%)', 'linear-gradient(180deg,#0e120d 0%,#222a1f 55%,#34322a 100%)'],
    flood:     ['linear-gradient(180deg,#2b3a4a 0%,#445a6c 50%,#5b6c74 100%)', 'linear-gradient(180deg,#0c131c 0%,#1b2a38 55%,#26333a 100%)'],
    hot:       ['linear-gradient(180deg,#ff8f3c 0%,#ffbf66 50%,#ffe1a6 100%)', 'linear-gradient(180deg,#2f1726 0%,#5c2a34 55%,#8a4a3a 100%)'],
    cold:      ['linear-gradient(180deg,#7fabd4 0%,#bcd5ea 50%,#e9f1f8 100%)', 'linear-gradient(180deg,#0b1430 0%,#1b2c52 55%,#33456e 100%)'],
    windy:     ['linear-gradient(180deg,#6593bd 0%,#a6c2d6 50%,#e6cfae 100%)', 'linear-gradient(180deg,#121833 0%,#28304d 55%,#3f3442 100%)'],
  };

  /* ---------- units & formatting ---------- */
  const toF = c => c * 9 / 5 + 32;
  const r0 = n => { const v = Math.round(n); return v === 0 ? 0 : v; };
  function T(c, stack) {
    if (c == null || isNaN(c)) return '--';
    const F = `<span class="tf">${r0(toF(c))}°<i>F</i></span>`, C = `<span class="tc">${r0(c)}°<i>C</i></span>`;
    if (prefs.unit === 'f') return `<span class="tt">${F}</span>`;
    if (prefs.unit === 'c') return `<span class="tt">${C}</span>`;
    return stack ? `<span class="tt stack">${F}${C}</span>` : `<span class="tt">${F}<b class="sl">/</b>${C}</span>`;
  }
  const both = (imp, met) => prefs.unit === 'f' ? imp : prefs.unit === 'c' ? met : `${imp} · ${met}`;
  const speed = mph => mph == null ? '--' : both(`${Math.round(mph)} mph`, `${Math.round(mph * 1.609344)} km/h`);
  const dist = m => { if (m == null) return '--'; const mi = m / 1609.344, km = m / 1000; return both(`${mi >= 10 ? Math.round(mi) : mi.toFixed(1)} mi`, `${km >= 10 ? Math.round(km) : km.toFixed(1)} km`); };
  const precip = mm => mm == null ? '--' : both(`${(mm / 25.4).toFixed(2)} in`, `${mm.toFixed(1)} mm`);
  const press = h => h == null ? '--' : both(`${(h * 0.02953).toFixed(2)} inHg`, `${Math.round(h)} hPa`);
  const compass = d => ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round(d / 22.5) % 16];
  const uvLabel = u => u < 3 ? 'Low' : u < 6 ? 'Moderate' : u < 8 ? 'High' : u < 11 ? 'Very high' : 'Extreme';

  /* ---------- time helpers (location-local, timezone-proof) ---------- */
  // Open-Meteo returns local times without an offset. We treat them as UTC "wall clock"
  // and compare against now + utc_offset, so it works no matter the phone's timezone.
  const pt = s => Date.parse(s.length === 10 ? s + 'T00:00:00Z' : s.length === 16 ? s + ':00Z' : s + 'Z');
  const off = () => (S.data ? S.data.utc_offset_seconds * 1000 : 0);
  const nowL = () => Date.now() + off();
  const hm = ms => { const d = new Date(ms); let h = d.getUTCHours(); const m = d.getUTCMinutes(), ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}:${String(m).padStart(2, '0')} ${ap}`; };
  const hLabel = ms => { const d = new Date(ms); let h = d.getUTCHours(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}${ap}`; };
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dur = ms => { const t = Math.max(0, Math.round(ms / 60000)), h = Math.floor(t / 60), m = t % 60; return h ? `${h}h ${m}m` : `${m}m`; };
  const ago = s => s < 5 ? 'just now' : s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`;
  const localTimeStr = ms => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  /* ---------- UI helpers ---------- */
  let toastT;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2800);
  }
  let skyFlip = false;
  function setSky(g) {
    const a = $('#skyA'), b = $('#skyB');
    const on = skyFlip ? a : b, offL = skyFlip ? b : a;
    on.style.background = g; on.style.opacity = 1; offL.style.opacity = 0; skyFlip = !skyFlip;
  }
  function countTo(el, to) {
    const from = parseFloat(el.dataset.v);
    el.dataset.v = to;
    if (isNaN(from) || prefs.reduce || from === to) { el.textContent = to; return; }
    const t0 = performance.now(), D = 900;
    const step = n => { const p = Math.min(1, (n - t0) / D), e = 1 - Math.pow(1 - p, 3); el.textContent = Math.round(from + (to - from) * e); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }

  /* ---------- network ---------- */
  async function getJSON(url, ms = 12000, headers) {
    const ctl = new AbortController(); const id = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(url, { signal: ctl.signal, headers, cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(id); }
  }
  function getPosition() {
    return new Promise((res, rej) => {
      if (!('geolocation' in navigator)) return rej({ code: 2, message: 'Geolocation not supported' });
      navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: false, timeout: 15000, maximumAge: 30000 });
    });
  }
  const weatherURL = (lat, lon) => 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}`
    + '&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m'
    + '&hourly=temperature_2m,weather_code,precipitation_probability,is_day,uv_index,visibility,dew_point_2m'
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,daylight_duration,precipitation_probability_max,precipitation_sum,uv_index_max,wind_speed_10m_max,wind_gusts_10m_max'
    + '&timezone=auto&past_days=1&forecast_days=8&wind_speed_unit=mph';

  async function fetchAlerts(lat, lon) {
    // NWS covers the US + territories only
    if (!(lat > 15 && lat < 72 && lon > -180 && lon < -64)) return [];
    try {
      const j = await getJSON(`https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`, 9000, { Accept: 'application/geo+json' });
      return (j.features || []).map(f => f.properties).filter(Boolean).map(p => ({
        event: p.event || 'Alert', headline: p.headline || '', severity: (p.severity || '').toLowerCase(),
        desc: p.description || '', instr: p.instruction || '', ends: p.ends || p.expires || '',
      }));
    } catch (e) { return S.alerts || []; }
  }
  async function fetchPlace(lat, lon) {
    try {
      const j = await getJSON(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`, 8000);
      const city = j.city || j.locality || '';
      const region = j.principalSubdivisionCode ? j.principalSubdivisionCode.split('-').pop() : (j.principalSubdivision || j.countryName || '');
      if (city || region) return [city, region].filter(Boolean).join(', ');
    } catch (e) {}
    try {
      const j = await getJSON(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=10`, 8000);
      const a = j.address || {};
      return [a.city || a.town || a.village || a.hamlet || a.county, a.state || a.country].filter(Boolean).join(', ');
    } catch (e) {}
    return `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`;
  }
  const km = (a, b) => { const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLon = (b.lon - a.lon) * Math.PI / 180; const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };

  /* ---------- refresh cycle ---------- */
  async function refresh(manual) {
    if (S.busy) return;
    S.busy = true; $('#refreshBtn').classList.add('spin'); updateStatus();
    try {
      let lat, lon;
      if (S.mode === 'manual' && S.manual) { lat = S.manual.lat; lon = S.manual.lon; }
      else {
        try {
          const p = await getPosition();
          lat = p.coords.latitude; lon = p.coords.longitude;
          S.coords = { lat, lon }; LS.set('coords', S.coords);
        } catch (geoErr) {
          if (S.coords && S.data) { lat = S.coords.lat; lon = S.coords.lon; if (manual) toast('Couldn’t get a fresh location — using your last one 📍'); }
          else throw { geo: geoErr };
        }
      }
      const [wx, alerts] = await Promise.all([getJSON(weatherURL(lat, lon)), fetchAlerts(lat, lon)]);
      if (!wx || !wx.current) throw new Error('Bad weather data');
      if (S.mode === 'manual' && S.manual) S.place = S.manual.name;
      else if (!S.place || !S.placeCoords || km(S.placeCoords, { lat, lon }) > 1.5) {
        S.place = await fetchPlace(lat, lon); S.placeCoords = { lat, lon };
        LS.set('place', S.place); LS.set('placeCoords', S.placeCoords);
      }
      S.data = wx; S.alerts = alerts; S.fetchedAt = Date.now();
      LS.set('data', wx); LS.set('alerts', alerts); LS.set('fetchedAt', S.fetchedAt);
      render();
      hide('#loader'); hide('#gate');
      if (manual) { Sound.chime(); toast('Fresh forecast, piping hot ☕'); }
    } catch (err) {
      if (err && err.geo && !S.data) showGate(err.geo);
      else if (!S.data) showGate({ code: 99 });
      else if (manual) { Sound.error(); toast(navigator.onLine ? 'The sky didn’t answer. Try again in a sec ☁️' : 'You’re offline — showing your last forecast 🧶'); }
    } finally {
      S.busy = false; $('#refreshBtn').classList.remove('spin');
      S.nextAt = Date.now() + 60000;
      updateStatus();
    }
  }

  function hide(sel) { $(sel).classList.add('hide'); }
  function showGate(e) {
    hide('#loader');
    const msgs = {
      1: ['Location is turned off for TwinTemp', 'No worries — allow location access, or search for a city below.'],
      2: ['Couldn’t find you', 'Your phone couldn’t pin down a location. Try again, or search a city.'],
      3: ['The location request timed out', 'The GPS took a coffee break. Try again, or search a city.'],
      99: ['The sky isn’t answering', navigator.onLine ? 'Couldn’t reach the weather service. Try again in a moment.' : 'You appear to be offline. Connect to the internet for your first forecast.'],
    };
    const [t, m] = msgs[e && e.code] || msgs[2];
    $('#gateTitle').textContent = t; $('#gateMsg').textContent = m;
    $('#gate').classList.remove('hide');
  }

  /* ---------- scene logic ---------- */
  const RAINY = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99];
  const SNOWY = [71, 73, 75, 77, 85, 86];
  function realScene() {
    const d = S.data, c = d.current, code = c.weather_code, tC = c.temperature_2m, gust = c.wind_gusts_10m || 0;
    const ev = (S.alerts || []).map(a => a.event.toLowerCase());
    const has = s => ev.some(e => e.includes(s));
    const ti = todayIndex();
    const daySum = d.daily.precipitation_sum ? d.daily.precipitation_sum[ti] || 0 : 0;
    if (has('tornado warning') || ([95, 96, 99].includes(code) && gust >= 58)) return 'tornado';
    if (has('flood warning') || has('flash flood') || (RAINY.includes(code) && ((c.precipitation || 0) >= 10 || daySum >= 50))) return 'flood';
    if (has('blizzard') || (SNOWY.includes(code) && gust >= 35)) return 'blizzard';
    if ([96, 99].includes(code)) return 'hail';
    if (code === 95) return 'thunder';
    if ([56, 57, 66, 67].includes(code) || has('ice storm')) return 'ice';
    if (SNOWY.includes(code)) return 'snow';
    if ([65, 82].includes(code)) return 'heavyrain';
    if ([61, 63, 80, 81].includes(code)) return 'rain';
    if ([51, 53, 55].includes(code)) return 'drizzle';
    if ([45, 48].includes(code)) return 'fog';
    if (tC >= 30 || has('heat')) return 'hot';
    if (tC <= 0 || has('extreme cold') || has('wind chill') || has('cold weather')) return 'cold';
    if (gust >= 30 || has('wind advisory') || has('high wind')) return 'windy';
    if (code <= 1) return 'clear';
    if (code === 2) return 'partly';
    return 'cloudy';
  }
  function ambientKind(sc) {
    if (['drizzle', 'rain', 'heavyrain', 'thunder', 'hail', 'ice', 'flood'].includes(sc)) return 'rain';
    if (['windy', 'blizzard', 'tornado'].includes(sc)) return 'wind';
    return 'fire';
  }
  function applyScene() {
    let sc, night;
    if (S.preview) { sc = S.preview; night = S.previewNight; }
    else if (S.data) { sc = realScene(); night = !S.data.current.is_day; }
    else { sc = 'clear'; night = false; }
    const changed = sc !== S.scene || night !== S.night;
    S.scene = sc; S.night = night;
    document.body.dataset.scene = sc; document.body.dataset.night = night ? '1' : '0';
    const info = SCENE_INFO[sc];
    $('#tagline').textContent = night ? info.night : info.day;
    $('#previewPill').classList.toggle('hidden', !S.preview);
    $('#previewName').textContent = `Previewing ${info.name}${night ? ' (night)' : ''}`;
    if (changed) {
      setSky(SKY[sc][night ? 1 : 0]);
      FX.set(sc, night);
      if (prefs.ambient && prefs.sound) Sound.ambient(ambientKind(sc));
    }
  }

  /* ---------- render ---------- */
  function todayIndex() {
    const d = S.data, key = d.current.time.slice(0, 10);
    const i = d.daily.time.indexOf(key);
    return i >= 0 ? i : Math.min(1, d.daily.time.length - 1);
  }
  function hourIndex() {
    const H = S.data.hourly, key = S.data.current.time.slice(0, 13) + ':00';
    let i = H.time.indexOf(key);
    if (i < 0) { const n = nowL(); i = H.time.findIndex(t => pt(t) + 3600e3 > n); }
    return Math.max(0, i);
  }

  function render() {
    const d = S.data; if (!d) return;
    document.body.className = document.body.className.replace(/\bu-\w+/g, '').trim() + ' u-' + prefs.unit;
    document.body.classList.toggle('reduce', prefs.reduce);
    applyScene();
    renderHero(); renderAlerts(); renderHourly(); renderDaylight(); renderWeek(); renderDetails(); updateStatus();
  }

  function renderHero() {
    const d = S.data, c = d.current, ti = todayIndex();
    const w = wmo(c.weather_code, !!c.is_day);
    $('#place').textContent = S.place || 'Your spot';
    $('#condIcon').textContent = w.icon; $('#condText').textContent = w.text;
    countTo($('#heroF'), r0(toF(c.temperature_2m)));
    countTo($('#heroC'), r0(c.temperature_2m));
    $('#feels').innerHTML = `Feels like ${T(c.apparent_temperature)}`;
    $('#hilo').innerHTML = `High ${T(d.daily.temperature_2m_max[ti])} · Low ${T(d.daily.temperature_2m_min[ti])}`;
    $('#peekChip').innerHTML = `${w.icon} ${T(c.temperature_2m)}`;
  }

  function renderAlerts() {
    const list = S.alerts || [];
    $('#alertsCard').classList.toggle('hidden', !list.length);
    $('#alerts').innerHTML = list.map((a, i) => `
      <div class="alert ${a.severity}" data-i="${i}">
        <b>${esc(a.event)}</b>
        <small>${a.ends ? 'Until ' + esc(localTimeStr(Date.parse(a.ends))) + ' · ' : ''}tap for details</small>
        <p>${esc(a.headline)}\n\n${esc(a.desc)}${a.instr ? '\n\n' + esc(a.instr) : ''}</p>
      </div>`).join('');
  }
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

  function renderHourly() {
    const H = S.data.hourly, i0 = hourIndex(), idx = [];
    for (let i = i0; i <= i0 + 12 && i < H.time.length; i++) idx.push(i);
    const TW = 66, cur = S.data.current, temps = idx.map((i, n) => n === 0 ? cur.temperature_2m : H.temperature_2m[i]);
    const mx = Math.max(...temps), mn = Math.min(...temps), span = (mx - mn) || 1;
    // Higher temperature = higher on screen (smaller y). Promise.
    const pts = idx.map((_, n) => [n * TW + TW / 2, 8 + ((mx - temps[n]) / span) * 32]);
    const w = idx.length * TW;
    const line = pts.map((p, n) => (n ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const svg = $('#spark');
    svg.setAttribute('width', w); svg.setAttribute('viewBox', `0 0 ${w} 50`);
    svg.innerHTML = `<defs><linearGradient id="sparkFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ffb36b" stop-opacity=".35"/><stop offset="1" stop-color="#ffb36b" stop-opacity="0"/></linearGradient>
      <linearGradient id="sparkLine" x1="0" x2="1"><stop offset="0" stop-color="#ffb36b"/><stop offset="1" stop-color="#8fd0ff"/></linearGradient></defs>
      <path d="${line} L${pts[pts.length - 1][0]} 50 L${pts[0][0]} 50 Z" fill="url(#sparkFill)"/>
      <path d="${line}" fill="none" stroke="url(#sparkLine)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="spark-line"/>
      ${pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="#fff4e6"/>`).join('')}`;
    const sl = svg.querySelector('.spark-line');
    if (sl && sl.animate && !prefs.reduce) { const L = sl.getTotalLength ? sl.getTotalLength() : 800; sl.style.strokeDasharray = L; sl.animate([{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: 1200, easing: 'ease-out' }); }
    $('#hours').innerHTML = idx.map((i, n) => {
      const w = n === 0 ? wmo(cur.weather_code, !!cur.is_day) : wmo(H.weather_code[i], !!H.is_day[i]), pp = H.precipitation_probability[i];
      return `<div class="hour ${n === 0 ? 'now' : ''}" style="--i:${n}">
        <span class="hl">${n === 0 ? 'Now' : hLabel(pt(H.time[i]))}</span>
        <span class="hi">${w.icon}</span>
        ${T(temps[n], true)}
        <span class="pp">${pp != null && pp >= 10 ? '💧' + pp + '%' : ''}</span>
      </div>`;
    }).join('');
  }

  function renderDaylight() {
    const d = S.data; if (!d) return;
    const D = d.daily, n = nowL();
    const todayKey = new Date(n).toISOString().slice(0, 10);
    let i = D.time.indexOf(todayKey); if (i < 0) i = todayIndex();
    const sr = pt(D.sunrise[i]), ss = pt(D.sunset[i]);
    const len = (D.daylight_duration[i] || (ss - sr) / 1000) * 1000;
    const prev = i > 0 ? D.daylight_duration[i - 1] * 1000 : null;
    $('#srLbl').textContent = '☀ ' + hm(sr); $('#ssLbl').textContent = hm(ss) + ' ☾';
    $('#dlLen').textContent = dur(len);
    if (prev != null) {
      const diff = Math.round((len - prev) / 1000), a = Math.abs(diff), m = Math.floor(a / 60), s = a % 60;
      $('#dlDiff').textContent = `${diff >= 0 ? '+' : '−'}${m}m ${s}s`;
    } else $('#dlDiff').textContent = '--';
    $('#dlGold').textContent = hm(ss - 3600e3);
    let pct, big, small, pctTxt, nextTxt;
    if (n < sr) {
      pct = 0; big = dur(sr - n); small = 'until sunrise 🌄';
      pctTxt = 'The sun is still hitting snooze'; nextTxt = `Rises ${hm(sr)}`;
    } else if (n > ss) {
      pct = 1;
      const nsr = D.sunrise[i + 1] ? pt(D.sunrise[i + 1]) : sr + 86400e3;
      big = dur(nsr - n); small = 'until sunrise · sun’s off duty 🌙';
      pctTxt = 'Daylight: all used up'; nextTxt = `Rises ${hm(nsr)}`;
    } else {
      pct = (n - sr) / (ss - sr); big = dur(ss - n); small = 'of daylight left';
      pctTxt = `${Math.round(pct * 100)}% of today’s daylight used`; nextTxt = `Sets ${hm(ss)}`;
    }
    $('#dlBig').textContent = big; $('#dlSmall').textContent = small;
    $('#dlPct').textContent = pctTxt; $('#dlNext').textContent = nextTxt;
    $('#dlFill').style.width = ((n > ss ? 1 : pct) * 100).toFixed(1) + '%';
    $('#arcFg').style.strokeDashoffset = (100 - pct * 100).toFixed(2);
    const x = 150 - 130 * Math.cos(Math.PI * pct), y = 140 - 130 * Math.sin(Math.PI * pct);
    const sun = $('#dlSun');
    sun.style.transform = `translate(${x}px, ${y}px)`;
    sun.style.opacity = (n < sr || n > ss) ? 0.35 : 1;
  }

  function renderWeek() {
    const D = S.data.daily, ti = todayIndex(), idx = [];
    for (let i = ti; i < ti + 7 && i < D.time.length; i++) idx.push(i);
    const lo = Math.min(...idx.map(i => D.temperature_2m_min[i])), hi = Math.max(...idx.map(i => D.temperature_2m_max[i])), span = (hi - lo) || 1;
    const cur = S.data.current.temperature_2m;
    $('#week').innerHTML = idx.map((i, n) => {
      const w = wmo(D.weather_code[i], true), mn = D.temperature_2m_min[i], mx = D.temperature_2m_max[i];
      const left = ((mn - lo) / span) * 100, width = Math.max(4, ((mx - mn) / span) * 100);
      const pp = D.precipitation_probability_max[i];
      const dot = n === 0 ? `<i class="nowdot" style="left:${Math.min(100, Math.max(0, ((cur - lo) / span) * 100)).toFixed(1)}%"></i>` : '';
      return `<div class="day" data-i="${n}" style="--i:${n}">
          <span class="dname">${n === 0 ? 'Today' : DAYS[new Date(pt(D.time[i])).getUTCDay()]}</span>
          <span class="dicon">${w.icon}</span>
          <span class="dpop">${pp != null && pp >= 10 ? '💧' + pp + '%' : ''}</span>
          <span class="dlo">${T(mn, true)}</span>
          <span class="dbar"><span style="left:${left.toFixed(1)}%;width:${width.toFixed(1)}%"></span>${dot}</span>
          <span class="dhi">${T(mx, true)}</span>
        </div>
        <div class="dmore" id="dm${n}"><div class="in">
          <span>${w.text}</span><span>Rain: <b>${precip(D.precipitation_sum[i] || 0)}</b></span>
          <span>🌅 <b>${hm(pt(D.sunrise[i]))}</b></span><span>🌇 <b>${hm(pt(D.sunset[i]))}</b></span>
          <span>UV max: <b>${D.uv_index_max[i] != null ? D.uv_index_max[i].toFixed(0) + ' ' + uvLabel(D.uv_index_max[i]) : '--'}</b></span>
          <span>Wind: <b>${speed(D.wind_speed_10m_max[i])}</b></span>
        </div></div>`;
    }).join('');
  }

  function renderDetails() {
    const d = S.data, c = d.current, H = d.hourly, hi = hourIndex(), ti = todayIndex();
    const uv = H.uv_index ? H.uv_index[hi] : null, vis = H.visibility ? H.visibility[hi] : null, dew = H.dew_point_2m ? H.dew_point_2m[hi] : null;
    const tiles = [
      ['🌡️ Feels like', T(c.apparent_temperature), c.apparent_temperature < c.temperature_2m - 1 ? 'Wind’s making it nippy' : c.apparent_temperature > c.temperature_2m + 1 ? 'Humidity’s adding a hug' : 'Pretty honest temperature'],
      ['💧 Humidity', `${c.relative_humidity_2m}%`, c.relative_humidity_2m > 70 ? 'Sticky-ish' : c.relative_humidity_2m < 30 ? 'Lotion weather' : 'Comfy'],
      ['🌬️ Wind', `<span class="arrow" style="transform:rotate(${(c.wind_direction_10m + 180) % 360}deg)">↑</span> ${speed(c.wind_speed_10m)}`, `From the ${compass(c.wind_direction_10m)}`],
      ['💨 Gusts', speed(c.wind_gusts_10m), c.wind_gusts_10m >= 40 ? 'Hold onto your hat' : c.wind_gusts_10m >= 25 ? 'Breezy bursts' : 'Gentle'],
      ['😎 UV index', uv != null ? `${uv.toFixed(0)}` : '--', uv != null ? uvLabel(uv) + (uv >= 6 ? ' · sunscreen!' : '') : ''],
      ['☁️ Cloud cover', `${c.cloud_cover}%`, c.cloud_cover > 80 ? 'Sky blanket' : c.cloud_cover < 20 ? 'Wide open' : 'Some fluff'],
      ['👀 Visibility', dist(vis), vis != null && vis < 1600 ? 'Pretty murky' : 'Clear-ish'],
      ['🧭 Pressure', press(c.pressure_msl), 'Sea level'],
      ['🫧 Dew point', T(dew), dew != null && dew > 18 ? 'Muggy' : 'Comfortable'],
      ['☔ Precip today', precip(d.daily.precipitation_sum[ti] || 0), `Chance: ${d.daily.precipitation_probability_max[ti] ?? '--'}%`],
    ];
    $('#details').innerHTML = tiles.map((t, i) => `<div class="tile" style="--i:${i}"><div class="lbl">${t[0]}</div><div class="val">${t[1]}</div><div class="sub">${t[2]}</div></div>`).join('');
  }

  function updateStatus() {
    let txt;
    const offline = !navigator.onLine;
    if (S.busy) txt = 'Refreshing…';
    else if (!S.fetchedAt) txt = 'Not updated yet';
    else txt = `Updated ${ago(Math.round((Date.now() - S.fetchedAt) / 1000))}`;
    if (offline && S.fetchedAt) txt = `Offline · forecast from ${localTimeStr(S.fetchedAt)}`;
    const ring = $('#ringFg');
    if (prefs.auto && !S.busy) {
      const left = Math.max(0, Math.ceil((S.nextAt - Date.now()) / 1000));
      if (!offline) txt += ` · next in ${left}s`;
      ring.style.strokeDashoffset = (100 - (left / 60) * 100).toFixed(1);
      ring.style.stroke = '';
    } else if (!prefs.auto) {
      txt += ' · auto-refresh off';
      ring.style.strokeDashoffset = 0; ring.style.stroke = 'rgba(255,255,255,.35)';
    }
    $('#statusText').textContent = txt;
  }

  /* ---------- preferences UI ---------- */
  function syncPrefsUI() {
    $$('#unitSeg button').forEach(b => b.classList.toggle('on', b.dataset.v === prefs.unit));
    $$('#fxSeg button').forEach(b => b.classList.toggle('on', b.dataset.v === prefs.fx));
    $$('#pvSeg button').forEach(b => b.classList.toggle('on', (b.dataset.v === '1') === S.previewNight));
    $('#swAuto').classList.toggle('on', prefs.auto);
    $('#swSound').classList.toggle('on', prefs.sound);
    $('#swAmb').classList.toggle('on', prefs.ambient);
    $('#swReduce').classList.toggle('on', prefs.reduce);
    $('#locMode').textContent = S.mode === 'manual' && S.manual ? `Showing weather for ${S.manual.name}` : 'Using your current location (GPS)';
  }
  function openSheet() { syncPrefsUI(); document.body.classList.add('sheet-open'); Sound.whoosh(); }
  function closeSheet() { document.body.classList.remove('sheet-open'); }

  function buildFxGrid() {
    $('#fxGrid').innerHTML = FX.scenes.map(k => `<button data-scene="${k}"><span>${SCENE_INFO[k].icon}</span>${SCENE_INFO[k].name}</button>`).join('');
  }

  let searchT;
  function bindSearch(input, out) {
    input.addEventListener('input', () => {
      clearTimeout(searchT);
      const q = input.value.trim();
      if (q.length < 2) { out.innerHTML = ''; return; }
      searchT = setTimeout(async () => {
        try {
          const j = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`, 8000);
          const res = j.results || [];
          out.innerHTML = res.length ? res.map((r, i) => `<button data-i="${i}">${esc(r.name)}<small>${esc([r.admin1, r.country].filter(Boolean).join(', '))}</small></button>`).join('') : '<div class="hint">No towns by that name. Even the map shrugged.</div>';
          out.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
            const r = res[+b.dataset.i];
            const st = r.admin1 && r.country_code === 'US' ? r.admin1 : (r.country || '');
            S.mode = 'manual'; S.manual = { lat: r.latitude, lon: r.longitude, name: [r.name, st].filter(Boolean).join(', ') };
            LS.set('mode', S.mode); LS.set('manual', S.manual);
            S.place = S.manual.name; input.value = ''; out.innerHTML = '';
            Sound.tap(); closeSheet(); hide('#gate');
            refresh(true); syncPrefsUI();
          }));
        } catch (e) { out.innerHTML = '<div class="hint">Search needs internet. The sky is unreachable right now.</div>'; }
      }, 350);
    });
  }

  function bindUI() {
    // gentle tap sound on anything marked data-snd
    document.addEventListener('click', e => { if (e.target.closest('[data-snd]')) Sound.tap(); });

    $('#refreshBtn').addEventListener('click', () => { Sound.tap(); refresh(true); });
    $('#prefsBtn').addEventListener('click', openSheet);
    $('#sheetBg').addEventListener('click', closeSheet);
    $('#closeSheet').addEventListener('click', closeSheet);

    $('#unitSeg').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      prefs.unit = b.dataset.v; savePrefs(); Sound.toggle(true); syncPrefsUI(); render();
    });
    $('#fxSeg').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      prefs.fx = b.dataset.v; savePrefs(); Sound.toggle(true); syncPrefsUI(); FX.setIntensity(prefs.fx);
    });
    $('#pvSeg').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      S.previewNight = b.dataset.v === '1'; Sound.toggle(S.previewNight); syncPrefsUI();
      if (S.preview) applyScene();
    });
    const sw = (id, key, after) => $(id).addEventListener('click', () => {
      prefs[key] = !prefs[key]; savePrefs(); syncPrefsUI();
      if (after) after(); Sound.toggle(prefs[key]);
    });
    sw('#swAuto', 'auto', () => { S.nextAt = Date.now() + 60000; updateStatus(); toast(prefs.auto ? 'Auto-refresh on — every 60 seconds ⏱️' : 'Auto-refresh off — tap ⟳ whenever you like'); });
    sw('#swSound', 'sound', () => { Sound.setEnabled(prefs.sound); if (prefs.sound && prefs.ambient) Sound.ambient(ambientKind(S.scene)); });
    sw('#swAmb', 'ambient', () => Sound.ambient(prefs.ambient && prefs.sound ? ambientKind(S.scene) : null));
    sw('#swReduce', 'reduce', () => { FX.setReduce(prefs.reduce); document.body.classList.toggle('reduce', prefs.reduce); });

    $('#fxGrid').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      S.preview = b.dataset.scene; Sound.tap(); closeSheet(); applyScene();
      $('#app').scrollTo({ top: 0, behavior: 'smooth' });
    });
    $('#previewPill').addEventListener('click', () => { S.preview = null; applyScene(); toast('Back to reality 🌍'); });

    $('#useGps').addEventListener('click', () => {
      S.mode = 'gps'; S.manual = null; S.placeCoords = null; LS.set('mode', 'gps'); LS.set('manual', null);
      syncPrefsUI(); closeSheet(); refresh(true);
    });
    $('#gateRetry').addEventListener('click', () => { Sound.tap(); S.mode = 'gps'; LS.set('mode', 'gps'); hide('#gate'); $('#loader').classList.remove('hide'); refresh(true); });
    bindSearch($('#citySearch'), $('#cityResults'));
    bindSearch($('#gateSearch'), $('#gateResults'));

    $('#alerts').addEventListener('click', e => { const a = e.target.closest('.alert'); if (a) { a.classList.toggle('open'); Sound.tap(); } });
    $('#week').addEventListener('click', e => {
      const r = e.target.closest('.day'); if (!r) return;
      $('#dm' + r.dataset.i).classList.toggle('open'); Sound.tap();
    });

    // Peek mode: slide the UI away to watch the weather
    let dimT;
    $('#peekBtn').addEventListener('click', () => {
      document.body.classList.add('peek'); Sound.whooshDown();
      clearTimeout(dimT); dimT = setTimeout(() => document.body.classList.add('peek-dim'), 4000);
    });
    $('#peekBack').addEventListener('click', () => {
      document.body.classList.remove('peek', 'peek-dim'); Sound.whoosh(); clearTimeout(dimT);
    });

    window.addEventListener('online', () => { updateStatus(); refresh(false); });
    window.addEventListener('offline', updateStatus);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && prefs.auto && Date.now() >= S.nextAt) refresh(false);
    });
  }

  /* ---------- the heartbeat ---------- */
  function tick() {
    S.tick++;
    updateStatus();
    if (S.tick % 15 === 0) renderDaylight();
    if (prefs.auto && !S.busy && !document.hidden && Date.now() >= S.nextAt) refresh(false);
  }

  /* ---------- boot ---------- */
  function boot() {
    Sound.setEnabled(prefs.sound);
    FX.setIntensity(prefs.fx); FX.setReduce(prefs.reduce);
    FX.onThunder = () => prefs.sound && Sound.thunder();
    FX.onMoo = () => prefs.sound && Sound.moo();
    document.body.classList.add('u-' + prefs.unit);
    buildFxGrid(); bindUI(); syncPrefsUI();
    try { screen.orientation && screen.orientation.lock && screen.orientation.lock('portrait').catch(() => {}); } catch (e) {}
    if (S.data) { render(); hide('#loader'); } else applyScene();
    if (prefs.ambient && prefs.sound) Sound.ambient(ambientKind(S.scene));
    refresh(false);              // asks for location right away
    setInterval(tick, 1000);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  boot();
})();
