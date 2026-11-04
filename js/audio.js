// Valdombra — procedural audio (WebAudio). No samples, everything synthesized.
(function () {
  const A = { ctx: null, master: null, musicGain: null, sfxGain: null, enabled: true, dawn: false };
  let noiseBuf = null, musicTimer = null, step = 0;

  A.init = function () {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    try { A.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { A.enabled = false; return; }
    const c = A.ctx;
    A.master = c.createGain(); A.master.gain.value = 0.8; A.master.connect(c.destination);
    A.sfxGain = c.createGain(); A.sfxGain.gain.value = 0.7; A.sfxGain.connect(A.master);
    A.musicGain = c.createGain(); A.musicGain.gain.value = 0.32; A.musicGain.connect(A.master);
    noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // echo for music
    A.delay = c.createDelay(1.0); A.delay.delayTime.value = 0.42;
    A.fb = c.createGain(); A.fb.gain.value = 0.38;
    A.delay.connect(A.fb); A.fb.connect(A.delay); A.delay.connect(A.musicGain);
    startAmbience(); startMusic();
  };

  A.setVolume = function (v) { if (A.master) A.master.gain.value = v; };

  function env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function tone(freq, type, dur, vol, dest, glideTo) {
    if (!A.ctx) return;
    const c = A.ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    env(g, t, 0.005, vol, dur);
    o.connect(g); g.connect(dest || A.sfxGain);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, vol, filterType, freq, q, dest, freqTo) {
    if (!A.ctx) return;
    const c = A.ctx, t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = noiseBuf;
    const f = c.createBiquadFilter(); f.type = filterType; f.frequency.setValueAtTime(freq, t); f.Q.value = q || 1;
    if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t + dur);
    const g = c.createGain(); env(g, t, 0.004, vol, dur);
    s.connect(f); f.connect(g); g.connect(dest || A.sfxGain);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }

  A.sfx = {
    swing() { noise(0.18, 0.35, 'bandpass', 1800, 2, null, 500); },
    hit() { noise(0.12, 0.5, 'lowpass', 2500, 1); tone(140, 'square', 0.1, 0.15, null, 60); },
    hurt() { tone(220, 'sawtooth', 0.25, 0.2, null, 90); noise(0.15, 0.3, 'lowpass', 900); },
    step() { noise(0.06, 0.08, 'lowpass', 420 + Math.random() * 200); },
    jump() { noise(0.1, 0.12, 'lowpass', 700); },
    roll() { noise(0.3, 0.2, 'bandpass', 600, 1, null, 200); },
    fireball() { noise(0.6, 0.35, 'bandpass', 400, 1, null, 2400); tone(90, 'sawtooth', 0.4, 0.12, null, 260); },
    boom() { noise(0.7, 0.6, 'lowpass', 1200, 1, null, 80); tone(70, 'sine', 0.6, 0.4, null, 30); },
    pickup() { [0, 0.07, 0.14].forEach((d, i) => setTimeout(() => tone(660 * Math.pow(1.26, i), 'triangle', 0.25, 0.18), d * 1000)); },
    coin() { tone(1320, 'square', 0.08, 0.08); setTimeout(() => tone(1760, 'square', 0.12, 0.08), 60); },
    quest() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 'triangle', 0.5, 0.18), i * 120)); },
    level() { [392, 523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => tone(f, 'triangle', 0.6, 0.16), i * 90)); },
    die() { tone(300, 'sawtooth', 0.6, 0.16, null, 40); noise(0.4, 0.3, 'lowpass', 600, 1, null, 100); },
    blip() { tone(500 + Math.random() * 300, 'triangle', 0.04, 0.04); },
    open() { tone(330, 'triangle', 0.15, 0.1); setTimeout(() => tone(440, 'triangle', 0.2, 0.1), 80); },
    roar() { noise(1.2, 0.5, 'lowpass', 500, 2, null, 120); tone(60, 'sawtooth', 1.1, 0.3, null, 40); },
    potion() { for (let i = 0; i < 5; i++) setTimeout(() => tone(400 + i * 120, 'sine', 0.15, 0.1), i * 50); },
    deny() { tone(180, 'square', 0.15, 0.1); },
  };

  function startAmbience() {
    const c = A.ctx;
    // wind: filtered noise with slow LFO
    const s = c.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 400; f.Q.value = 0.6;
    const g = c.createGain(); g.gain.value = 0.05;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.07;
    const lg = c.createGain(); lg.gain.value = 250;
    lfo.connect(lg); lg.connect(f.frequency);
    s.connect(f); f.connect(g); g.connect(A.master);
    s.start(); lfo.start();
    A.windGain = g;
    // drone pad
    const pad = c.createGain(); pad.gain.value = 0.05; pad.connect(A.musicGain);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; lp.connect(pad);
    A.padOsc = [];
    [73.4, 110, 146.8].forEach((fr, i) => {
      const o = c.createOscillator(); o.type = i === 1 ? 'triangle' : 'sawtooth';
      o.frequency.value = fr; o.detune.value = (i - 1) * 7;
      o.connect(lp); o.start(); A.padOsc.push(o);
    });
    A.padFilter = lp;
  }

  // generative lute-ish melody in D dorian (night) / D major (dawn)
  const DORIAN = [0, 2, 3, 5, 7, 9, 10];
  const MAJOR = [0, 2, 4, 5, 7, 9, 11];
  function pluck(freq, vol) {
    const c = A.ctx, t = c.currentTime;
    const o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain();
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(freq * 6, t); f.frequency.exponentialRampToValueAtTime(freq * 1.2, t + 0.8);
    o.type = 'triangle'; o2.type = 'square'; o.frequency.value = freq; o2.frequency.value = freq * 2.001;
    const g2 = c.createGain(); g2.gain.value = 0.15;
    env(g, t, 0.003, vol, 1.4);
    o.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); g.connect(A.musicGain); g.connect(A.delay);
    o.start(t); o2.start(t); o.stop(t + 1.6); o2.stop(t + 1.6);
  }
  function startMusic() {
    let phrase = [];
    const gen = () => {
      phrase = []; let deg = Math.floor(Math.random() * 4);
      for (let i = 0; i < 8; i++) { deg += [-2, -1, 1, 1, 2, 0][Math.floor(Math.random() * 6)]; deg = U.clamp(deg, 0, 9); phrase.push(Math.random() < 0.25 ? null : deg); }
    };
    gen();
    musicTimer = setInterval(() => {
      if (!A.ctx || A.ctx.state !== 'running') return;
      const scale = A.dawn ? MAJOR : DORIAN;
      const deg = phrase[step % 8];
      if (step % 32 === 0) gen();
      if (deg != null) {
        const oct = Math.floor(deg / 7), n = scale[deg % 7] + oct * 12;
        pluck(293.66 * Math.pow(2, n / 12), A.combat ? 0.05 : 0.09);
      }
      if (step % 8 === 0) pluck(146.83 * Math.pow(2, scale[[0, 3, 4, 0][(step / 8) % 4 | 0]] / 12), 0.07);
      step++;
    }, 360);
  }
  A.setDawn = function (v) {
    A.dawn = v;
    if (A.padOsc) { const r = v ? [146.8, 185, 220] : [73.4, 110, 146.8]; A.padOsc.forEach((o, i) => o.frequency.setTargetAtTime(r[i], A.ctx.currentTime, 2)); }
    if (A.padFilter) A.padFilter.frequency.setTargetAtTime(v ? 1400 : 600, A.ctx.currentTime, 2);
  };
  window.AudioFX = A;
})();
