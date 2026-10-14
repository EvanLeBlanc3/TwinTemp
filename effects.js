/* ===================== TwinTemp — weather effects engine =====================
   Two canvases: #fx (behind the cards: sky stuff) and #fxTop (above: frost, icicles, whiteout).
   Scenes: clear, partly, cloudy, fog, drizzle, rain, heavyrain, thunder, hail, ice,
           snow, blizzard, tornado, flood, hot, cold, windy  (+ day/night) */
(() => {
  'use strict';
  const cv = document.getElementById('fx'), ctx = cv.getContext('2d');
  const tv = document.getElementById('fxTop'), tctx = tv.getContext('2d');
  let W = 0, H = 0, DPR = 1, ST = 0;
  let cfg = null, key = '', night = false, mult = 1, reduce = false;
  let P = {}, last = performance.now(), T = 0;
  const R = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[(Math.random() * a.length) | 0];

  const SCENES = {
    clear:     { clouds: [2, 'light', 0.6], birds: 1 },
    partly:    { clouds: [6, 'light', 0.8], birds: 1 },
    cloudy:    { clouds: [11, 'gray', 0.6], noSun: 1 },
    fog:       { clouds: [3, 'gray', 0.3], fog: 1, noSun: 1 },
    drizzle:   { clouds: [8, 'gray', 0.7], rain: 0.45, drizzle: 1, glass: 0.6, noSun: 1 },
    rain:      { clouds: [10, 'dark', 0.9], rain: 1, glass: 1, noSun: 1 },
    heavyrain: { clouds: [12, 'dark', 1.2], rain: 2, glass: 1.5, wind: 2.5, noSun: 1 },
    thunder:   { clouds: [12, 'storm', 1.2], rain: 1.4, lightning: 1, glass: 1, wind: 1.5, noSun: 1 },
    hail:      { clouds: [12, 'storm', 1.2], rain: 0.7, hail: 1, lightning: 0.7, noSun: 1 },
    ice:       { clouds: [9, 'gray', 0.6], rain: 0.8, sleet: 1, frost: 0.55, icicles: 1, glass: 0.6, noSun: 1 },
    snow:      { clouds: [9, 'light', 0.5], snow: 1, pile: 1, noSun: 1 },
    blizzard:  { clouds: [7, 'light', 2.2], snow: 2.6, wind: 9, whiteout: 1, frost: 0.7, pile: 1.8, shake: 0.3, noSun: 1 },
    tornado:   { clouds: [12, 'storm', 2], tornado: 1, rain: 0.5, wind: 4, lightning: 0.5, shake: 0.6, noSun: 1 },
    flood:     { clouds: [12, 'dark', 1], rain: 1.5, flood: 1, glass: 1.2, noSun: 1 },
    hot:       { clouds: [1, 'light', 0.3], hot: 1 },
    cold:      { clouds: [2, 'light', 0.4], frost: 1, icicles: 1, sparkle: 1 },
    windy:     { clouds: [7, 'light', 3], leaves: 1, wind: 5, birds: 0 },
  };
  const TONES = { light: [255, 250, 244], gray: [206, 207, 215], dark: [118, 124, 138], storm: [72, 76, 86], night: [92, 96, 118], fog: [238, 234, 228] };

  /* ---------- sizing ---------- */
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    const probe = document.getElementById('safeProbe');
    ST = probe ? probe.offsetHeight : 0;
    [cv, tv].forEach(c => { c.width = W * DPR; c.height = H * DPR; });
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    tctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (cfg) build();
  }
  window.addEventListener('resize', resize);

  /* ---------- sprites ---------- */
  const spriteCache = {};
  function cloudSprite(tone, v) {
    const k = tone + v;
    if (spriteCache[k]) return spriteCache[k];
    const w = 420, h = 180, c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    const [r, gg, b] = TONES[tone];
    const n = 8 + v * 2;
    for (let i = 0; i < n; i++) {
      const x = 80 + (i / (n - 1)) * (w - 160) + R(-20, 20), y = R(75, h - 55), rad = R(42, 78) * (1 - Math.abs(i / (n - 1) - 0.5) * 0.6);
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, `rgba(${r},${gg},${b},.9)`);
      gr.addColorStop(0.55, `rgba(${r},${gg},${b},.55)`);
      gr.addColorStop(1, `rgba(${r},${gg},${b},0)`);
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
    }
    return (spriteCache[k] = c);
  }
  function makeCloud(tone, speed, anywhere) {
    const img = cloudSprite(tone, (Math.random() * 3) | 0);
    const s = R(0.55, 1.15);
    return { img, s, x: anywhere ? R(-img.width * s, W) : -img.width * s - R(0, 200), y: R(ST - 50, H * 0.3), v: R(0.12, 0.35) * speed, a: R(0.65, 0.95) };
  }

  function makeFrost() {
    const c = document.createElement('canvas');
    c.width = W * DPR; c.height = H * DPR;
    const g = c.getContext('2d'); g.scale(DPR, DPR);
    const gr = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.38, W / 2, H / 2, Math.max(W, H) * 0.72);
    gr.addColorStop(0, 'rgba(220,240,255,0)'); gr.addColorStop(1, 'rgba(228,244,255,.6)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(245,252,255,.55)'; g.lineCap = 'round';
    const branch = (x, y, a, l, d) => {
      const x2 = x + Math.cos(a) * l, y2 = y + Math.sin(a) * l;
      g.lineWidth = d * 0.45 + 0.4;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
      if (d > 0) for (let j = 0; j < 3; j++) {
        const t = R(0.25, 0.95);
        branch(x + (x2 - x) * t, y + (y2 - y) * t, a + (Math.random() < 0.5 ? -1 : 1) * R(0.5, 1.1), l * R(0.35, 0.6), d - 1);
      }
    };
    for (let i = 0; i < 46; i++) {
      const side = i % 4; let x, y, a;
      if (side === 0) { x = R(0, W); y = 0; a = Math.PI / 2; }
      else if (side === 1) { x = W; y = R(0, H); a = Math.PI; }
      else if (side === 2) { x = R(0, W); y = H; a = -Math.PI / 2; }
      else { x = 0; y = R(0, H); a = 0; }
      branch(x, y, a + R(-0.7, 0.7), R(25, 70), 3);
    }
    return c;
  }

  /* ---------- particle factories ---------- */
  const newDrop = init => {
    const dz = cfg.drizzle;
    return { x: R(-60, W + 60), y: init ? R(-H, H) : R(-80, -10), l: dz ? R(5, 9) : R(13, 24), v: dz ? R(4, 6.5) : R(11, 18), sl: cfg.sleet && Math.random() < 0.3 };
  };
  const newFlake = init => {
    const r = R(1, 3.6);
    return { x: R(-W * 0.3, W), y: init ? R(-H, H) : R(-40, -5), r, v: r * R(0.35, 0.6) * (cfg.whiteout ? 2.4 : 1), ph: R(0, 6.28), sw: R(0.6, 1.6) };
  };
  const newHail = init => ({ x: R(0, W), y: init ? R(-H, 0) : R(-60, -10), vy: R(6, 10), r: R(2.5, 5), b: 0 });
  const newGlass = () => ({ x: R(0, W), y: R(0, H), r: R(2, 6), vy: 0, slide: false, born: T });
  const LEAVES = ['🍂', '🍁', '🍃', '🍂'];
  const newLeaf = init => ({ x: init ? R(0, W) : R(-120, -30), y: R(ST + 40, H * 0.95), e: pick(LEAVES), rot: R(0, 6), vr: R(-0.08, 0.08), v: R(0.6, 1.5), ph: R(0, 6), s: R(16, 26) });
  const DEBRIS = ['🐄', '🐔', '🪑', '🛒', '🐐', '📦', '🚲', '🐄', '🌵', '🧺'];

  /* ---------- build a scene ---------- */
  function build() {
    const s = cfg, m = mult * (reduce ? 0.45 : 1);
    P = { splash: [], trail: [], birds: [], nextBirds: T + R(2, 6), pile: P.pile && s.pile ? P.pile : 0, frostA: 0 };
    if (s.clouds) {
      let tone = s.clouds[1];
      if (night && (tone === 'light' || tone === 'gray')) tone = 'night';
      P.clouds = Array.from({ length: s.clouds[0] }, () => makeCloud(tone, s.clouds[2], true));
    }
    if (night && !s.noSun) {
      P.stars = Array.from({ length: Math.round(110 * Math.max(m, 0.6)) }, () => ({ x: R(0, W), y: R(0, H * 0.65), r: R(0.4, 1.7), ph: R(0, 6.28), sp: R(0.6, 2.2) }));
      P.nextShoot = T + R(2, 6);
    }
    if (s.rain) P.rain = Array.from({ length: Math.round(150 * s.rain * m) }, () => newDrop(true));
    if (s.snow) P.snow = Array.from({ length: Math.round(120 * s.snow * m) }, () => newFlake(true));
    if (s.hail) P.hail = Array.from({ length: Math.round(28 * m) }, () => newHail(true));
    if (s.glass) P.glass = Array.from({ length: Math.round(20 * s.glass * m) }, newGlass);
    if (s.leaves) P.leaves = Array.from({ length: Math.round(14 * m) }, () => newLeaf(true));
    if (s.sparkle) P.sparkle = Array.from({ length: Math.round(50 * m) }, () => ({ x: R(0, W), y: R(0, H), ph: R(0, 6.28), v: R(0.1, 0.35) }));
    if (s.fog) P.fog = Array.from({ length: 7 }, (_, i) => ({ img: cloudSprite('fog', i % 3), x: R(-400, W), y: H * 0.15 + i * H * 0.12 + R(-20, 20), s: R(1.8, 2.8), v: R(0.08, 0.25) }));
    if (s.hot) P.heat = Array.from({ length: Math.round(16 * m) + 4 }, () => ({ x: R(0, W), y: R(0, H), h: R(40, 100), v: R(0.4, 1.1), ph: R(0, 6) }));
    if (s.lightning) P.nextBolt = T + R(1.2, 3);
    if (s.tornado) {
      P.torn = Array.from({ length: Math.round(300 * Math.max(m, 0.5)) }, () => ({ h: Math.random(), a: R(0, 6.28), sp: R(0.8, 1.4), s: R(3, 9) }));
      P.debris = Array.from({ length: 7 }, () => ({ e: pick(DEBRIS), h: R(0.1, 0.9), a: R(0, 6.28), sp: R(0.6, 1), rot: R(0, 6), vr: R(-0.12, 0.12), s: R(18, 30) }));
      P.nextMoo = T + R(3, 6); P.nextRumble = T + R(2, 4);
    }
    if (s.flood) P.flood = { level: 0, duckX: W * 0.7, fish: null, nextFish: T + R(3, 6), bubbles: [] };
    if (s.frost) P.frostImg = makeFrost();
    if (s.icicles) {
      P.icicles = []; P.drips = [];
      for (let x = R(0, 10); x < W; x += R(12, 30)) P.icicles.push({ x, l: R(6, 24) + (Math.random() < 0.15 ? 14 : 0), w: R(5, 10) });
    }
  }

  /* ---------- screen effects ---------- */
  function flash() {
    if (reduce) return;
    const f = document.getElementById('flash');
    if (f && f.animate) f.animate([{ opacity: 0 }, { opacity: 0.6, offset: 0.08 }, { opacity: 0.08, offset: 0.22 }, { opacity: 0.4, offset: 0.32 }, { opacity: 0 }], { duration: 650, easing: 'ease-out' });
  }
  function shake(px) {
    if (reduce) return;
    const el = document.getElementById('app');
    if (!el || !el.animate || document.body.classList.contains('peek')) return;
    const k = [];
    for (let i = 0; i < 8; i++) k.push({ transform: `translate(${R(-px, px).toFixed(1)}px,${R(-px, px).toFixed(1)}px)` });
    k.push({ transform: 'translate(0,0)' });
    el.animate(k, { duration: 480, easing: 'ease-out' });
  }

  /* ---------- drawing helpers ---------- */
  function groundY() { return P.flood ? H - P.flood.level : H - (P.pile || 0); }
  function wave(x) { return H - P.flood.level + Math.sin(x * 0.02 + T * 1.6) * 6 + Math.sin(x * 0.047 - T * 1.1) * 3; }

  function drawStars(k) {
    for (const s of P.stars) {
      const a = 0.25 + 0.75 * Math.abs(Math.sin(T * s.sp + s.ph));
      ctx.fillStyle = `rgba(255,246,225,${a.toFixed(2)})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.283); ctx.fill();
    }
    if (!cfg.clouds || cfg.clouds[0] < 4) {
      if (!P.shoot && T > P.nextShoot) P.shoot = { x: R(W * 0.1, W * 0.8), y: R(ST + 20, H * 0.3), life: 1, vx: R(6, 10), vy: R(2, 4) };
      if (P.shoot) {
        const s = P.shoot; s.x += s.vx * k; s.y += s.vy * k; s.life -= 0.025 * k;
        const gr = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * 9, s.y - s.vy * 9);
        gr.addColorStop(0, `rgba(255,255,240,${Math.max(0, s.life)})`); gr.addColorStop(1, 'rgba(255,255,240,0)');
        ctx.strokeStyle = gr; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 9, s.y - s.vy * 9); ctx.stroke();
        if (s.life <= 0) { P.shoot = null; P.nextShoot = T + R(5, 12); }
      }
    }
  }

  function drawSun() {
    const hot = !!cfg.hot, r = hot ? 44 : 34;
    const x = W * 0.62, y = ST + 46;
    const glow = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 4);
    glow.addColorStop(0, hot ? 'rgba(255,170,70,.6)' : 'rgba(255,225,150,.5)'); glow.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, r * 4, 0, 6.283); ctx.fill();
    ctx.save(); ctx.translate(x, y); ctx.rotate(T * 0.18);
    ctx.fillStyle = hot ? 'rgba(255,150,60,.45)' : 'rgba(255,220,130,.4)';
    for (let i = 0; i < 12; i++) {
      ctx.rotate(Math.PI / 6);
      const L = r * (1.55 + 0.12 * Math.sin(T * 2 + i));
      ctx.beginPath(); ctx.moveTo(-5, r * 1.12); ctx.lineTo(0, L); ctx.lineTo(5, r * 1.12); ctx.fill();
    }
    ctx.restore();
    const body = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 2, x, y, r);
    body.addColorStop(0, hot ? '#ffe7a0' : '#fff6cf'); body.addColorStop(1, hot ? '#ff8a3d' : '#ffc65a');
    ctx.fillStyle = body; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
    if (hot) { // cool sun is cool
      ctx.fillStyle = '#2a1a14';
      const gy = y - r * 0.18;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - r * 0.72, gy, r * 0.6, r * 0.34, 6) : ctx.rect(x - r * 0.72, gy, r * 0.6, r * 0.34); ctx.fill();
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x + r * 0.12, gy, r * 0.6, r * 0.34, 6) : ctx.rect(x + r * 0.12, gy, r * 0.6, r * 0.34); ctx.fill();
      ctx.fillRect(x - r * 0.14, gy + 3, r * 0.28, 3);
      ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(x - r * 0.6, gy + 3, r * 0.18, 3); ctx.fillRect(x + r * 0.24, gy + 3, r * 0.18, 3);
      ctx.strokeStyle = '#7a3a12'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(x, y + r * 0.25, r * 0.3, 0.2, Math.PI - 0.2); ctx.stroke();
      const sy = y - r * 0.1 + ((T * 30) % 40); // sweat drop
      ctx.fillStyle = `rgba(140,210,255,${1 - ((T * 30) % 40) / 40})`;
      ctx.beginPath(); ctx.arc(x + r * 0.9, sy, 4, 0, 6.283); ctx.moveTo(x + r * 0.9 - 4, sy); ctx.lineTo(x + r * 0.9, sy - 8); ctx.lineTo(x + r * 0.9 + 4, sy); ctx.fill();
    }
  }

  function drawMoon() {
    const x = W * 0.62, y = ST + 48, r = 26;
    const glow = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 4);
    glow.addColorStop(0, 'rgba(255,240,200,.35)'); glow.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, r * 4, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#f7efd6'; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
    ctx.fillStyle = 'rgba(200,185,150,.45)';
    [[-8, -6, 5], [7, 5, 7], [-3, 10, 3.5], [9, -9, 3]].forEach(([dx, dy, rr]) => { ctx.beginPath(); ctx.arc(x + dx, y + dy, rr, 0, 6.283); ctx.fill(); });
  }

  function drawClouds(k) {
    const wind = cfg.wind || 0;
    for (const c of P.clouds) {
      c.x += c.v * k * (1 + wind * 0.12);
      const w = c.img.width * c.s;
      if (c.x > W + 40) { c.x = -w - R(0, 150); c.y = R(ST - 50, H * 0.3); }
      ctx.globalAlpha = c.a;
      ctx.drawImage(c.img, c.x, c.y, w, c.img.height * c.s);
    }
    ctx.globalAlpha = 1;
  }

  function drawBirds(k) {
    if (T > P.nextBirds) {
      const n = (R(3, 6)) | 0, y = R(ST + 90, H * 0.35), v = R(0.9, 1.5);
      for (let i = 0; i < n; i++) P.birds.push({ x: -20 - i * R(16, 26), y: y + R(-14, 14), v, off: R(0, 6) });
      P.nextBirds = T + R(9, 18);
    }
    ctx.strokeStyle = 'rgba(70,45,40,.7)'; ctx.lineWidth = 1.7; ctx.lineCap = 'round';
    ctx.beginPath();
    for (const b of P.birds) {
      b.x += b.v * k; b.y += Math.sin(T * 2 + b.off) * 0.15 * k;
      const f = 4 * Math.sin(T * 10 + b.off);
      ctx.moveTo(b.x - 7, b.y - f); ctx.quadraticCurveTo(b.x - 3, b.y - 2, b.x, b.y); ctx.quadraticCurveTo(b.x + 3, b.y - 2, b.x + 7, b.y - f);
    }
    ctx.stroke();
    P.birds = P.birds.filter(b => b.x < W + 30);
  }

  function drawFog(k) {
    for (const f of P.fog) {
      f.x += f.v * k; const w = f.img.width * f.s;
      if (f.x > W + 50) f.x = -w;
      ctx.globalAlpha = 0.33 + 0.08 * Math.sin(T * 0.4 + f.y);
      ctx.drawImage(f.img, f.x, f.y - f.img.height * f.s / 2, w, f.img.height * f.s);
    }
    ctx.globalAlpha = 1;
  }

  function drawHeat(k) {
    ctx.strokeStyle = 'rgba(255,240,215,.13)'; ctx.lineWidth = 2;
    for (const h of P.heat) {
      h.y -= h.v * k;
      if (h.y < -h.h) { h.y = H + R(0, 60); h.x = R(0, W); }
      ctx.beginPath();
      for (let j = 0; j <= h.h; j += 6) {
        const xx = h.x + Math.sin(j * 0.16 + T * 3 + h.ph) * 4, yy = h.y + j;
        j ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy);
      }
      ctx.stroke();
    }
  }

  function makeBolt() {
    const segs = [], branches = [];
    let x = R(W * 0.15, W * 0.85), y = ST - 10;
    const end = H * R(0.45, 0.75);
    segs.push([x, y]);
    while (y < end) {
      x += R(-28, 28); y += R(14, 38); segs.push([x, y]);
      if (Math.random() < 0.22) {
        const b = [[x, y]]; let bx = x, by = y;
        for (let i = 0; i < 4; i++) { bx += R(-30, 30); by += R(10, 26); b.push([bx, by]); }
        branches.push(b);
      }
    }
    return { segs, branches, life: 1 };
  }
  function drawBolt(k) {
    if (T > P.nextBolt) {
      P.bolt = makeBolt(); flash();
      if (window.FX.onThunder) setTimeout(window.FX.onThunder, R(200, 1100));
      if (cfg.shake || Math.random() < 0.4) shake(5);
      P.nextBolt = T + R(3, 9) / cfg.lightning;
    }
    const b = P.bolt; if (!b) return;
    b.life -= 0.05 * k;
    if (b.life <= 0) { P.bolt = null; return; }
    const a = b.life * (Math.random() < 0.3 ? 0.35 : 1);
    ctx.save();
    ctx.shadowColor = '#bcd8ff'; ctx.shadowBlur = 20;
    ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.lineJoin = 'round';
    const line = (pts, w) => { ctx.lineWidth = w; ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); };
    line(b.segs, 3); b.branches.forEach(br => line(br, 1.4));
    ctx.restore();
  }

  function drawRain(k) {
    const wind = cfg.wind || 0, gy = groundY();
    ctx.strokeStyle = cfg.drizzle ? 'rgba(210,225,255,.4)' : 'rgba(205,222,255,.55)';
    ctx.lineWidth = cfg.drizzle ? 1 : 1.3; ctx.lineCap = 'round';
    ctx.beginPath();
    const sleet = [];
    for (const d of P.rain) {
      d.y += d.v * k; d.x += wind * k;
      if (d.y > gy) {
        if (Math.random() < 0.35 && P.splash.length < 140) for (let i = 0; i < 2; i++) P.splash.push({ x: d.x, y: gy - 1, vx: R(-1.6, 1.6), vy: R(-3.2, -1.2), life: 1 });
        Object.assign(d, newDrop(false));
      }
      if (d.x > W + 60) d.x -= W + 120; else if (d.x < -60) d.x += W + 120;
      if (d.sl) { sleet.push(d); continue; }
      ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - (wind * d.l) / d.v, d.y - d.l);
    }
    ctx.stroke();
    if (sleet.length) {
      ctx.fillStyle = 'rgba(240,248,255,.85)'; ctx.beginPath();
      for (const d of sleet) { ctx.moveTo(d.x + 2, d.y); ctx.arc(d.x, d.y, 2, 0, 6.283); }
      ctx.fill();
    }
  }
  function drawSplash(k) {
    if (!P.splash.length) return;
    ctx.fillStyle = 'rgba(215,230,255,.7)';
    ctx.beginPath();
    for (const s of P.splash) {
      s.x += s.vx * k; s.y += s.vy * k; s.vy += 0.28 * k; s.life -= 0.06 * k;
      ctx.moveTo(s.x + 1.3, s.y); ctx.arc(s.x, s.y, 1.3, 0, 6.283);
    }
    ctx.fill();
    P.splash = P.splash.filter(s => s.life > 0);
  }

  function drawSnow(k) {
    const wind = cfg.wind || 0, gy = groundY();
    ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.beginPath();
    for (const f of P.snow) {
      f.y += f.v * k;
      f.x += (Math.sin(T * f.sw + f.ph) * 0.7 + wind * f.r * 0.35) * k;
      if (f.y > gy + 4 || f.x > W + 30) Object.assign(f, newFlake(false));
      ctx.moveTo(f.x + f.r, f.y); ctx.arc(f.x, f.y, f.r, 0, 6.283);
    }
    ctx.fill();
  }
  function drawPile(k) {
    const max = 34 * cfg.pile;
    P.pile = Math.min(max, (P.pile || 0) + 0.006 * cfg.pile * k);
    if (P.pile < 0.5) return;
    const gr = ctx.createLinearGradient(0, H - P.pile, 0, H);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#dbe6f2');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W + 20; x += 18) ctx.lineTo(x, H - P.pile * (0.72 + 0.22 * Math.sin(x / 53) + 0.08 * Math.sin(x / 17)));
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  }

  function drawHail(k) {
    const gy = groundY(), wind = cfg.wind || 0;
    ctx.fillStyle = '#eef6ff'; ctx.strokeStyle = 'rgba(140,175,210,.7)'; ctx.lineWidth = 1;
    for (const h of P.hail) {
      h.vy += 0.4 * k; h.y += h.vy * k; h.x += wind * 0.3 * k;
      if (h.y > gy - h.r) { h.y = gy - h.r; h.vy *= -0.38; h.x += R(-3, 3); h.b++; if (h.b > 2) Object.assign(h, newHail(false)); }
      ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, 6.283); ctx.fill(); ctx.stroke();
    }
  }

  function drawGlass(k) {
    if (P.glass.length < 20 * cfg.glass * mult * 1.4 && Math.random() < 0.05 * k) P.glass.push(newGlass());
    for (const g of P.glass) {
      if (!g.slide && g.r > 3.5 && Math.random() < 0.0018 * k) { g.slide = true; g.vy = 0.3; }
      if (g.slide) {
        g.vy = Math.min(g.vy + 0.04 * k, 3.2); g.y += g.vy * k; g.x += Math.sin(g.y * 0.05) * 0.3;
        if (Math.random() < 0.25 * k) P.trail.push({ x: g.x + R(-1, 1), y: g.y - g.r, r: R(0.7, 1.5), life: 1 });
        if (g.y > H + 10) Object.assign(g, newGlass(), { y: R(-20, H * 0.5) });
      }
      ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(g.x, g.y, g.r * 0.9, g.r, 0, 0, 6.283); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.beginPath(); ctx.arc(g.x - g.r * 0.35, g.y - g.r * 0.4, g.r * 0.28, 0, 6.283); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.beginPath();
    for (const t of P.trail) { t.life -= 0.004 * k; ctx.moveTo(t.x + t.r, t.y); ctx.arc(t.x, t.y, t.r, 0, 6.283); }
    ctx.fill();
    P.trail = P.trail.filter(t => t.life > 0);
    if (P.glass.length > 60) P.glass.splice(0, P.glass.length - 60);
  }

  function drawLeaves(k) {
    const wind = cfg.wind || 0;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const l of P.leaves) {
      l.x += (wind * 0.75 + l.v) * k; l.y += (Math.sin(T * 1.8 + l.ph) * 1.4 + 0.25) * k; l.rot += l.vr * k * (1 + wind * 0.1);
      if (l.x > W + 40 || l.y > H + 30) Object.assign(l, newLeaf(false));
      ctx.save(); ctx.translate(l.x, l.y); ctx.rotate(l.rot); ctx.font = `${l.s}px serif`; ctx.fillText(l.e, 0, 0); ctx.restore();
    }
  }

  function drawSparkle(k) {
    for (const s of P.sparkle) {
      s.y += s.v * k; s.x += Math.sin(T + s.ph) * 0.2;
      if (s.y > H) { s.y = -5; s.x = R(0, W); }
      const a = Math.max(0, Math.sin(T * 2.5 + s.ph));
      if (a < 0.05) continue;
      ctx.strokeStyle = `rgba(235,248,255,${a})`; ctx.lineWidth = 1;
      const r = 2.5 * a + 1;
      ctx.beginPath(); ctx.moveTo(s.x - r, s.y); ctx.lineTo(s.x + r, s.y); ctx.moveTo(s.x, s.y - r); ctx.lineTo(s.x, s.y + r); ctx.stroke();
    }
  }

  function drawTornado(k) {
    const sc = Math.min(W, 520) / 400;
    const gY = H * 0.93, topY = ST + 40, hh = gY - topY;
    const cx = W * 0.5 + Math.sin(T * 0.22) * W * 0.26;
    const wob = h => Math.sin(T * 1.3 + h * 4) * 26 * h * sc;
    const rad = h => (8 + 150 * Math.pow(h, 1.8)) * sc;
    // dust cloud at the base
    const dust = ctx.createRadialGradient(cx, gY, 4, cx, gY, 90 * sc);
    dust.addColorStop(0, 'rgba(120,100,80,.55)'); dust.addColorStop(1, 'rgba(120,100,80,0)');
    ctx.fillStyle = dust; ctx.beginPath(); ctx.ellipse(cx, gY, 110 * sc, 40 * sc, 0, 0, 6.283); ctx.fill();
    // solid funnel body
    const L = [], Rr = [];
    for (let h = 0; h <= 1.0001; h += 0.05) {
      const x = cx + wob(h), y = gY - h * hh, r = rad(h) * 0.8;
      L.push([x - r, y]); Rr.push([x + r, y]);
    }
    const fg = ctx.createLinearGradient(cx - 150 * sc, 0, cx + 150 * sc, 0);
    fg.addColorStop(0, 'rgba(70,72,66,.15)'); fg.addColorStop(0.45, 'rgba(58,60,55,.75)'); fg.addColorStop(1, 'rgba(70,72,66,.2)');
    ctx.fillStyle = fg; ctx.beginPath();
    L.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    for (let i = Rr.length - 1; i >= 0; i--) ctx.lineTo(Rr[i][0], Rr[i][1]);
    ctx.closePath(); ctx.fill();
    // swirling bands
    ctx.strokeStyle = 'rgba(150,150,140,.25)'; ctx.lineWidth = 2;
    for (let j = 0; j < 9; j++) {
      const h = ((j / 9) + T * 0.08) % 1, x = cx + wob(h), y = gY - h * hh, r = rad(h) * 0.8;
      ctx.beginPath(); ctx.ellipse(x, y, r, Math.max(2, r * 0.12), 0, 0, Math.PI); ctx.stroke();
    }
    // funnel particles
    for (const p of P.torn) {
      p.a += p.sp * k * 0.13 * (1.3 - p.h * 0.6);
      p.h += 0.0022 * k; if (p.h > 1) p.h = 0;
      const r = rad(p.h);
      const x = cx + wob(p.h) + Math.cos(p.a) * r;
      const y = gY - p.h * hh + Math.sin(p.a) * r * 0.16;
      const front = Math.sin(p.a) > 0;
      ctx.fillStyle = front ? 'rgba(62,64,60,.45)' : 'rgba(120,122,116,.25)';
      ctx.beginPath(); ctx.arc(x, y, p.s * (0.6 + p.h * 1.1) * sc, 0, 6.283); ctx.fill();
    }
    // flying debris (cows included, as is tradition)
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const d of P.debris) {
      d.a += d.sp * k * 0.06; d.rot += d.vr * k;
      d.h += Math.sin(T * 0.5 + d.sp * 10) * 0.0015 * k; d.h = Math.min(0.92, Math.max(0.08, d.h));
      const r = rad(d.h) * 1.25 + 20;
      const x = cx + wob(d.h) + Math.cos(d.a) * r, y = gY - d.h * hh + Math.sin(d.a) * r * 0.22;
      ctx.save(); ctx.translate(x, y); ctx.rotate(d.rot);
      ctx.globalAlpha = Math.sin(d.a) > 0 ? 1 : 0.55;
      ctx.font = `${d.s * sc}px serif`; ctx.fillText(d.e, 0, 0); ctx.restore();
    }
    ctx.globalAlpha = 1;
    if (T > P.nextMoo) { if (window.FX.onMoo) window.FX.onMoo(); P.nextMoo = T + R(10, 20); }
    if (T > P.nextRumble) { shake(3); P.nextRumble = T + R(4, 8); }
  }

  function drawFlood(k) {
    const F = P.flood, target = H * 0.2;
    F.level += (target - F.level) * 0.004 * k;
    // back water
    ctx.fillStyle = 'rgba(52,92,120,.55)'; ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W + 10; x += 10) ctx.lineTo(x, wave(x + 60) - 10);
    ctx.lineTo(W, H); ctx.fill();
    // fish jump
    if (!F.fish && T > F.nextFish) F.fish = { x0: R(W * 0.15, W * 0.75), t: 0, dir: Math.random() < 0.5 ? 1 : -1 };
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (F.fish) {
      const f = F.fish; f.t += 0.018 * k;
      const x = f.x0 + f.dir * f.t * 90, y = wave(x) - Math.sin(f.t * Math.PI) * 70;
      ctx.save(); ctx.translate(x, y); ctx.scale(-f.dir, 1); ctx.rotate(-Math.cos(f.t * Math.PI) * 0.9); ctx.font = '26px serif'; ctx.fillText('🐟', 0, 0); ctx.restore();
      if (f.t >= 1) { F.fish = null; F.nextFish = T + R(4, 9); for (let i = 0; i < 6; i++) P.splash.push({ x, y: wave(x), vx: R(-2, 2), vy: R(-4, -1.5), life: 1 }); }
    }
    // front water
    const gr = ctx.createLinearGradient(0, H - F.level, 0, H);
    gr.addColorStop(0, 'rgba(110,170,205,.6)'); gr.addColorStop(1, 'rgba(30,70,100,.85)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W + 10; x += 8) ctx.lineTo(x, wave(x));
    ctx.lineTo(W, H); ctx.fill();
    ctx.strokeStyle = 'rgba(230,245,255,.5)'; ctx.lineWidth = 2; ctx.beginPath();
    for (let x = 0; x <= W + 10; x += 8) x ? ctx.lineTo(x, wave(x)) : ctx.moveTo(x, wave(x));
    ctx.stroke();
    // rubber duck, unbothered
    F.duckX -= 0.35 * k; if (F.duckX < -40) F.duckX = W + 40;
    const dy = wave(F.duckX) - 11, slope = (wave(F.duckX + 6) - wave(F.duckX - 6)) / 12;
    ctx.save(); ctx.translate(F.duckX, dy); ctx.rotate(Math.atan(slope)); ctx.font = '34px serif'; ctx.fillText('🦆', 0, 0); ctx.restore();
    // bubbles
    if (Math.random() < 0.08 * k) F.bubbles.push({ x: R(0, W), y: H, r: R(1.5, 4), v: R(0.5, 1.2) });
    ctx.strokeStyle = 'rgba(220,240,255,.55)'; ctx.lineWidth = 1; ctx.beginPath();
    for (const b of F.bubbles) { b.y -= b.v * k; b.x += Math.sin(T * 3 + b.r) * 0.3; ctx.moveTo(b.x + b.r, b.y); ctx.arc(b.x, b.y, b.r, 0, 6.283); }
    ctx.stroke();
    F.bubbles = F.bubbles.filter(b => b.y > wave(b.x) + 4);
  }

  /* ---------- top layer: frost, icicles, whiteout ---------- */
  function drawTop(k) {
    tctx.clearRect(0, 0, W, H);
    if (cfg.frost && P.frostImg) {
      P.frostA = Math.min(cfg.frost, P.frostA + 0.006 * k);
      tctx.globalAlpha = P.frostA; tctx.drawImage(P.frostImg, 0, 0, W, H); tctx.globalAlpha = 1;
    }
    if (cfg.whiteout) {
      const a = Math.max(0, 0.12 + 0.14 * Math.sin(T * 0.7) * Math.sin(T * 1.3));
      tctx.fillStyle = `rgba(250,252,255,${a.toFixed(3)})`; tctx.fillRect(0, 0, W, H);
    }
    if (P.icicles) {
      const base = 0;
      for (const ic of P.icicles) {
        const gr = tctx.createLinearGradient(0, base, 0, base + ST + ic.l);
        gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(1, 'rgba(190,225,255,.55)');
        tctx.fillStyle = gr; tctx.beginPath();
        tctx.moveTo(ic.x - ic.w / 2, base); tctx.lineTo(ic.x + ic.w / 2, base); tctx.lineTo(ic.x, base + ST * 0.6 + ic.l); tctx.closePath(); tctx.fill();
        if (Math.random() < 0.0009 * k) P.drips.push({ x: ic.x, y: base + ST * 0.6 + ic.l, v: 0, life: 1 });
      }
      tctx.fillStyle = 'rgba(200,232,255,.85)';
      for (const d of P.drips) { d.v += 0.25 * k; d.y += d.v * k; d.life -= 0.02 * k; tctx.beginPath(); tctx.arc(d.x, d.y, 2, 0, 6.283); tctx.fill(); }
      P.drips = P.drips.filter(d => d.life > 0);
    }
  }

  /* ---------- main loop ---------- */
  function frame(now) {
    requestAnimationFrame(frame);
    if (!cfg || document.hidden) { last = now; return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now; T = now / 1000;
    const k = dt * 60;
    ctx.clearRect(0, 0, W, H);
    const day = !night;
    if (P.stars) drawStars(k);
    if (!cfg.noSun) day ? drawSun() : drawMoon();
    if (cfg.lightning) drawBolt(k);
    if (P.torn) drawTornado(k);
    if (P.clouds) drawClouds(k);
    if (cfg.birds && day) drawBirds(k);
    if (P.fog) drawFog(k);
    if (P.heat) drawHeat(k);
    if (P.sparkle) drawSparkle(k);
    if (P.hail) drawHail(k);
    if (P.rain) drawRain(k);
    if (P.snow) drawSnow(k);
    if (cfg.pile) drawPile(k);
    if (P.flood) drawFlood(k);
    drawSplash(k);
    if (P.leaves) drawLeaves(k);
    if (P.glass) drawGlass(k);
    drawTop(k);
  }

  window.FX = {
    scenes: Object.keys(SCENES),
    set(k, n) {
      if (!SCENES[k]) k = 'clear';
      if (k === key && n === night && cfg) return;
      const keepPile = k === key;
      key = k; night = !!n; cfg = SCENES[k];
      if (!keepPile) P.pile = 0;
      build();
    },
    setIntensity(v) { mult = { low: 0.5, medium: 1, high: 1.6 }[v] || 1; if (cfg) build(); },
    setReduce(b) { reduce = !!b; if (cfg) build(); },
    flash, shake,
    onThunder: null, onMoo: null,
  };
  resize();
  requestAnimationFrame(frame);
})();
