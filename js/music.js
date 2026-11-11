/* Trad Center — musique de fond « lounge business » (composition originale, synthétisée en direct).
 * Piano électrique jazzy, basse douce, petite batterie feutrée et quelques notes de vibraphone.
 * Volume volontairement bas. Réglages : Paramètres → Musique (G.state.music / G.state.musicVol). */
(function () {
  const TC = window.TC = window.TC || {};
  const M = TC.Music = {};
  const BPM = 82, BEAT = 60 / BPM, BAR = BEAT * 4, AHEAD = 1.2;
  const hz = n => 440 * Math.pow(2, (n - 69) / 12);
  // Grille d'accords (8 mesures) : [basse, voicing du piano]
  const PROG = [
    [38, [53, 57, 60, 64]],   // Dm9
    [43, [53, 59, 64, 69]],   // G13
    [36, [52, 55, 59, 62]],   // Cmaj9
    [45, [55, 60, 64, 71]],   // Am9
    [41, [57, 60, 64, 67]],   // Fmaj9
    [40, [55, 59, 62, 67]],   // Em7
    [38, [53, 57, 60, 64]],   // Dm9
    [43, [53, 60, 62, 67]],   // G7sus
  ];
  const PENTA = [72, 74, 76, 79, 81, 84]; // do majeur pentatonique (mélodie)
  let C, master, bus, verb, timer, bar = 0, nextBar = 0, noiseBuf, started = false;

  const S = () => (TC.Game && TC.Game.state) || {};
  M.on = () => S().music !== false;
  M.vol = () => { const v = S().musicVol; return v == null ? 35 : v; };
  const gainFor = v => 1.2 * Math.pow(v / 100, 1.6);

  function setup() {
    if (C) return true;
    try { C = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return false; }
    master = C.createGain(); master.gain.value = 0;
    const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4200;
    const comp = C.createDynamicsCompressor(); comp.threshold.value = -24; comp.ratio.value = 3;
    bus = C.createGain(); bus.connect(lp); lp.connect(comp); comp.connect(master); master.connect(C.destination);
    // petite réverbération (réponse impulsionnelle générée)
    verb = C.createConvolver();
    const len = C.sampleRate * 2.2, ir = C.createBuffer(2, len, C.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    verb.buffer = ir; const vg = C.createGain(); vg.gain.value = 0.28; verb.connect(vg); vg.connect(lp);
    const n = C.sampleRate; noiseBuf = C.createBuffer(1, n, n); const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }
  function out(g, wet) { g.connect(bus); if (wet) g.connect(verb); }

  // Piano électrique : fondamentale + harmonique « cloche » qui s'éteint vite
  function keys(t, note, dur, vol) {
    const f = hz(note), g = C.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(vol * 0.35, t + 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const o1 = C.createOscillator(); o1.type = 'sine'; o1.frequency.value = f; o1.detune.value = (Math.random() - 0.5) * 6;
    const o2 = C.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2;
    const g2 = C.createGain(); g2.gain.setValueAtTime(vol * 0.5, t); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o1.connect(g); o2.connect(g2); g2.connect(bus); out(g, true);
    [o1, o2].forEach(o => { o.start(t); o.stop(t + dur + 0.05); });
  }
  function bass(t, note, dur, vol) {
    const o = C.createOscillator(), g = C.createGain(), f = C.createBiquadFilter();
    o.type = 'triangle'; o.frequency.value = hz(note); f.type = 'lowpass'; f.frequency.value = 500;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); out(g, false); o.start(t); o.stop(t + dur + 0.05);
  }
  function kick(t, vol) {
    const o = C.createOscillator(), g = C.createGain();
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g); out(g, false); o.start(t); o.stop(t + 0.35);
  }
  function hat(t, vol, dur) {
    const s = C.createBufferSource(), f = C.createBiquadFilter(), g = C.createGain();
    s.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = 7000;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); out(g, true); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  function snap(t, vol) { // claquement de doigts / rimshot feutré
    const s = C.createBufferSource(), f = C.createBiquadFilter(), g = C.createGain();
    s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = 2200; f.Q.value = 1.5;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    s.connect(f); f.connect(g); out(g, true); s.start(t, Math.random() * 0.5); s.stop(t + 0.15);
  }
  function vibe(t, note, vol) { // vibraphone : sinus avec trémolo
    const o = C.createOscillator(), g = C.createGain(), lfo = C.createOscillator(), lg = C.createGain();
    o.type = 'sine'; o.frequency.value = hz(note); lfo.frequency.value = 5.5; lg.gain.value = vol * 0.3;
    lfo.connect(lg); lg.connect(g.gain);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    o.connect(g); out(g, true); [o, lfo].forEach(x => { x.start(t); x.stop(t + 1.7); });
  }

  function playBar(t, i) {
    const [root, chord] = PROG[i % PROG.length], sw = BEAT * 0.62; // swing
    const section = Math.floor(i / 8) % 4, drums = section !== 3; // une section sur quatre : sans batterie
    // piano : temps 1 et « et » du 2 (syncope), voicing légèrement égrené
    chord.forEach((n, k) => keys(t + k * 0.012, n, BEAT * 2.2, 0.045));
    chord.forEach((n, k) => keys(t + BEAT + sw + k * 0.01, n, BEAT * 2, 0.03));
    // basse : fondamentale, quinte, note d'approche vers l'accord suivant
    const nextRoot = PROG[(i + 1) % PROG.length][0];
    bass(t, root, BEAT * 1.8, 0.16); bass(t + BEAT * 2, root + 7, BEAT * 1.3, 0.12);
    bass(t + BEAT * 3 + sw, nextRoot + (nextRoot > root ? -1 : 1), BEAT * 0.6, 0.09);
    if (drums) {
      kick(t, 0.22); kick(t + BEAT * 2, 0.16);
      snap(t + BEAT, 0.05); snap(t + BEAT * 3, 0.05);
      for (let b = 0; b < 4; b++) { hat(t + b * BEAT, 0.022, 0.05); hat(t + b * BEAT + sw, 0.014, 0.04); }
    }
    // mélodie clairsemée
    if (section >= 1 && Math.random() < 0.55) {
      const cnt = 1 + Math.floor(Math.random() * 3);
      let idx = Math.floor(Math.random() * PENTA.length);
      for (let k = 0; k < cnt; k++) {
        idx = Math.max(0, Math.min(PENTA.length - 1, idx + (Math.random() < 0.5 ? -1 : 1)));
        vibe(t + (k * 1.5 + (Math.random() < 0.5 ? 0 : 0.5)) * BEAT, PENTA[idx], 0.035);
      }
    }
  }
  function tick() {
    if (!C) return;
    while (nextBar < C.currentTime + AHEAD) { playBar(nextBar, bar); bar++; nextBar += BAR; }
  }
  function fadeTo(v, sec) {
    if (!C) return; const t = C.currentTime;
    master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(v, t + sec);
  }

  M.start = function () {
    if (!M.on() || document.hidden || !setup()) return;
    if (C.state === 'suspended') C.resume();
    if (!timer) { nextBar = Math.max(nextBar, C.currentTime + 0.1); tick(); timer = setInterval(tick, 300); }
    fadeTo(gainFor(M.vol()), started ? 1 : 4); started = true;
  };
  M.stop = function (pause) {
    if (!C) return; fadeTo(0, 0.6);
    clearInterval(timer); timer = null;
    setTimeout(() => { if (!timer && C.state === 'running') C.suspend(); }, 800);
    if (!pause) bar = 0;
  };
  M.setOn = function (v) { S().music = !!v; if (TC.Game) TC.Game.save(); v ? M.start() : M.stop(); };
  M.setVol = function (v) { S().musicVol = Math.max(0, Math.min(100, Math.round(v))); if (C && timer) fadeTo(gainFor(M.vol()), 0.15); };

  // Les navigateurs exigent un premier geste avant de jouer un son
  const kick0 = () => { if (M.on() && !timer) M.start(); };
  ['pointerdown', 'keydown', 'touchend'].forEach(ev => document.addEventListener(ev, kick0, { passive: true }));
  document.addEventListener('visibilitychange', () => { if (document.hidden) { if (timer) M.stop(true); } else if (started && M.on()) M.start(); });
})();
