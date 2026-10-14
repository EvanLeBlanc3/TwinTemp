/* ===================== TwinTemp — tiny synth sound kit =====================
   Everything is generated with the Web Audio API, so there are no audio files
   and it all works offline. iOS needs one tap before audio can play. */
window.Sound = (() => {
  'use strict';
  let ac = null, master = null, noiseBuf = null, amb = null, wantAmb = null;
  const api = { enabled: true };

  function A() {
    if (!ac) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ac = new C();
      master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    return ac;
  }
  // Unlock audio on the first touch (iOS rule)
  ['pointerdown', 'touchend', 'keydown'].forEach(ev =>
    window.addEventListener(ev, () => {
      const a = A();
      if (a && wantAmb && !amb) api.ambient(wantAmb);
    }, { passive: true }));

  function noise() {
    const a = A(); if (!a) return null;
    if (!noiseBuf) {
      const len = a.sampleRate * 2;
      noiseBuf = a.createBuffer(1, len, a.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }

  function tone(f, dur, o = {}) {
    if (!api.enabled) return;
    const a = A(); if (!a) return;
    const t = a.currentTime + (o.delay || 0);
    const osc = a.createOscillator(), g = a.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.06, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(master);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  function burst(o) {
    if (!api.enabled) return;
    const a = A(); if (!a) return;
    const t = a.currentTime + (o.delay || 0);
    const src = a.createBufferSource(); src.buffer = noise();
    const f = a.createBiquadFilter(); f.type = o.type || 'lowpass'; f.Q.value = o.q || 0.8;
    f.frequency.setValueAtTime(o.f || 800, t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.1, t + (o.attack || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t, Math.random()); src.stop(t + o.dur + 0.05);
  }

  api.tap = () => tone(620, 0.09, { vol: 0.045, to: 840 });
  api.toggle = on => { tone(on ? 700 : 460, 0.08, { type: 'triangle', vol: 0.05 }); tone(on ? 1050 : 380, 0.07, { type: 'sine', vol: 0.03, delay: 0.05 }); };
  api.chime = () => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.9, { type: 'triangle', vol: 0.04, delay: i * 0.09 }));
  api.whoosh = () => burst({ dur: 0.38, vol: 0.05, type: 'bandpass', f: 350, f2: 1900, q: 0.9, attack: 0.08 });
  api.whooshDown = () => burst({ dur: 0.45, vol: 0.05, type: 'bandpass', f: 1800, f2: 300, q: 0.9, attack: 0.06 });
  api.error = () => tone(330, 0.3, { type: 'triangle', vol: 0.05, to: 190 });
  api.thunder = () => {
    burst({ dur: 3.0, vol: 0.35, type: 'lowpass', f: 240, f2: 50, attack: 0.05 });
    burst({ dur: 1.9, vol: 0.22, type: 'lowpass', f: 600, f2: 80, delay: 0.22, attack: 0.03 });
  };
  // A synthesized cow. For tornado scenes. Obviously.
  api.moo = () => {
    if (!api.enabled) return;
    const a = A(); if (!a) return;
    const t = a.currentTime;
    const o = a.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(150, t);
    o.frequency.linearRampToValueAtTime(128, t + 0.35);
    o.frequency.linearRampToValueAtTime(112, t + 1.2);
    const lfo = a.createOscillator(), lg = a.createGain(); lfo.frequency.value = 5.5; lg.gain.value = 3;
    lfo.connect(lg); lg.connect(o.frequency);
    const f = a.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(350, t); f.frequency.linearRampToValueAtTime(900, t + 0.3); f.frequency.linearRampToValueAtTime(450, t + 1.2);
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.12);
    g.gain.setValueAtTime(0.09, t + 0.9); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    o.connect(f); f.connect(g); g.connect(master);
    o.start(t); lfo.start(t); o.stop(t + 1.35); lfo.stop(t + 1.35);
  };

  /* ---------- Ambient loops: rain, wind, fireplace ---------- */
  function stopAmb() {
    if (!amb) return;
    const a = ac, old = amb; amb = null;
    clearTimeout(old.timer);
    try {
      old.g.gain.cancelScheduledValues(a.currentTime);
      old.g.gain.setValueAtTime(old.g.gain.value, a.currentTime);
      old.g.gain.linearRampToValueAtTime(0, a.currentTime + 0.6);
      setTimeout(() => { try { old.src.stop(); old.lfo && old.lfo.stop(); } catch (e) {} }, 700);
    } catch (e) {}
  }
  api.ambient = kind => {
    wantAmb = kind || null;
    stopAmb();
    if (!kind || !api.enabled) return;
    const a = A(); if (!a) return;
    const src = a.createBufferSource(); src.buffer = noise(); src.loop = true;
    const f = a.createBiquadFilter(), g = a.createGain(); g.gain.value = 0;
    let target = 0.05, lfo = null, timer = null;
    if (kind === 'rain') { f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 0.35; target = 0.08; }
    else if (kind === 'wind') {
      f.type = 'lowpass'; f.frequency.value = 520; target = 0.14;
      lfo = a.createOscillator(); lfo.frequency.value = 0.13;
      const lg = a.createGain(); lg.gain.value = 260; lfo.connect(lg); lg.connect(f.frequency); lfo.start();
    } else { // fireplace
      f.type = 'lowpass'; f.frequency.value = 600; target = 0.035;
      const crackle = () => {
        if (!amb) return;
        burst({ dur: 0.03 + Math.random() * 0.05, vol: 0.02 + Math.random() * 0.07, type: 'highpass', f: 1500 + Math.random() * 2500 });
        amb.timer = setTimeout(crackle, 60 + Math.random() * 420);
      };
      timer = setTimeout(crackle, 300);
    }
    src.connect(f); f.connect(g); g.connect(master); src.start();
    g.gain.linearRampToValueAtTime(target, a.currentTime + 1.8);
    amb = { src, g, lfo, timer };
  };
  api.setEnabled = on => { api.enabled = on; if (!on) stopAmb(); };
  return api;
})();
