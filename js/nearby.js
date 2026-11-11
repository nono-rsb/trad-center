/* Trad Center — détection de proximité pour le Trad Drop (iPhone et Android, sans Bluetooth)
 * 1. TC.Sonic : le téléphone qui reçoit émet son code à 4 chiffres en sons très aigus (17,6 à 19 kHz, presque inaudibles) ;
 *    celui qui envoie écoute au micro et décode le code quand les téléphones sont proches.
 * 2. TC.Bump : détecte un petit choc (téléphones cognés) avec l'accéléromètre.
 */
(function () {
  /* ---------- Son ---------- */
  const SO = TC.Sonic = {};
  const F0 = 17600, STEP = 120, REP = 18820, MARK = 19050; // chiffres 0-9 : 17 600 → 18 680 Hz ; « même chiffre » : 18 820 Hz ; début : 19 050 Hz
  const SYM = 0.11, GAP = 0.045, MARK_LEN = 0.18; // durées en secondes
  SO.freq = d => F0 + d * STEP;
  let ctx = null, loop = null, mic = null, timer = null;
  SO.ctx = () => { if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); return ctx; };
  function session(type) { try { if (navigator.audioSession) navigator.audioSession.type = type; } catch (e) { } } // iPhone : jouer même en mode silencieux
  function tone(c, dest, f, t, len, vol) {
    const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.setValueAtTime(vol, t + len - 0.008); g.gain.linearRampToValueAtTime(0, t + len);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + len + 0.01);
  }
  // programme une émission complète du code ; renvoie sa durée
  SO.schedule = function (c, dest, code, t0, vol = 0.6) {
    let t = t0; tone(c, dest, MARK, t, MARK_LEN, vol); t += MARK_LEN + GAP;
    let prev = null, lastF = null;
    for (const ch of code) { // chiffre répété : symbole « même chiffre », en alternance, pour que deux sons voisins ne soient jamais identiques
      const f = ch === prev && lastF !== REP ? REP : SO.freq(+ch);
      tone(c, dest, f, t, SYM, vol); prev = ch; lastF = f; t += SYM + GAP;
    }
    return t - t0 + 0.25;
  };
  SO.play = function (code) {
    SO.stopPlay(); session('playback');
    const c = SO.ctx(); const once = () => SO.schedule(c, c.destination, code, c.currentTime + 0.05);
    const len = once(); loop = setInterval(once, len * 1000);
  };
  SO.stopPlay = () => { clearInterval(loop); loop = null; };

  // décodeur : lit un AnalyserNode toutes les 20 ms, renvoie le code quand il l'a reconnu deux fois de suite
  SO.decoder = function (analyser, onCode) {
    const c = analyser.context, bins = new Float32Array(analyser.frequencyBinCount), hz = c.sampleRate / analyser.fftSize;
    const lo = Math.floor(17300 / hz), hi = Math.ceil(19300 / hz);
    let cur = null, run = 0, tokens = [], gapRun = 0, last = null;
    function classify() {
      analyser.getFloatFrequencyData(bins);
      let best = -Infinity, bi = 0; const band = [];
      for (let i = lo; i <= hi; i++) { band.push(bins[i]); if (bins[i] > best) { best = bins[i]; bi = i; } }
      band.sort((a, b) => a - b); const floor = band[Math.floor(band.length / 2)];
      if (best - floor < 22 || best < -95) return null;
      const f = bi * hz;
      if (Math.abs(f - MARK) < STEP / 2) return 'M';
      if (Math.abs(f - REP) < STEP / 2) return 'R';
      const d = Math.round((f - F0) / STEP); return d >= 0 && d <= 9 && Math.abs(f - SO.freq(d)) < STEP / 2 ? String(d) : null;
    }
    function push(tok) {
      if (tok === 'M') { tokens = ['M']; return; }
      if (tokens[0] !== 'M') return;
      if (tok === 'R') { if (tokens.length < 2) return; tok = tokens[tokens.length - 1]; }
      tokens.push(tok);
      if (tokens.length === 5) {
        const code = tokens.slice(1).join(''); tokens = [];
        if (code === last) onCode(code); last = code; // deux fois le même code : fiable
      }
    }
    return setInterval(() => {
      const s = classify();
      if (s === cur && s !== null) { run++; if (run === 2) push(s); gapRun = 0; }
      else if (s === null) { gapRun++; if (gapRun >= 1) { cur = null; run = 0; } }
      else { cur = s; run = 1; gapRun = 0; }
    }, 20);
  };
  SO.listen = async function (onCode) {
    SO.stopListen(); session('play-and-record');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const c = SO.ctx(); const src = c.createMediaStreamSource(stream); const an = c.createAnalyser();
    an.fftSize = 4096; an.smoothingTimeConstant = 0; src.connect(an);
    mic = stream; timer = SO.decoder(an, onCode);
  };
  SO.stopListen = () => { clearInterval(timer); timer = null; if (mic) mic.getTracks().forEach(t => t.stop()); mic = null; };
  SO.stop = () => { SO.stopPlay(); SO.stopListen(); session('auto'); };

  /* ---------- Choc ---------- */
  const BU = TC.Bump = {};
  let onBump = null, lastBump = 0;
  function motion(e) {
    const a = e.acceleration && e.acceleration.x != null ? e.acceleration : null;
    let m;
    if (a) m = Math.hypot(a.x || 0, a.y || 0, a.z || 0);
    else { const g = e.accelerationIncludingGravity || {}; m = Math.abs(Math.hypot(g.x || 0, g.y || 0, g.z || 0) - 9.81); }
    if (m > 13 && Date.now() - lastBump > 1500) { lastBump = Date.now(); if (onBump) onBump(lastBump); }
  }
  // à appeler pendant un toucher (iPhone : autorisation des capteurs)
  BU.start = async function (cb) {
    onBump = cb;
    let ok = true;
    try { if (window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function') ok = (await DeviceMotionEvent.requestPermission()) === 'granted'; } catch (e) { ok = false; }
    window.removeEventListener('devicemotion', motion); window.addEventListener('devicemotion', motion); // on écoute quand même (Android envoie souvent les mouvements sans demander)
    return ok;
  };
  BU.stop = () => { onBump = null; window.removeEventListener('devicemotion', motion); };
})();
