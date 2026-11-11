/* Trad Center — détection de proximité pour le Trad Drop (iPhone et Android, sans Bluetooth)
 * 0. TC.QR : le téléphone qui reçoit affiche un QR code, celui qui envoie le scanne avec sa caméra (méthode la plus fiable).
 * 1. TC.Sonic : le téléphone qui reçoit émet son code à 4 chiffres en petits bips (2,6 à 5,3 kHz, bien rendus par les haut-parleurs de téléphone) ;
 *    celui qui envoie écoute au micro et décode le code quand les téléphones sont proches.
 * 2. TC.Bump : détecte un petit choc (téléphones cognés) avec l'accéléromètre.
 */
(function () {
  /* ---------- QR code ---------- */
  const QR = TC.QR = {};
  function load(src) { return new Promise((res, rej) => { if (document.querySelector(`script[src="${src}"]`)) return res(); const x = document.createElement('script'); x.src = src; x.onload = res; x.onerror = rej; document.head.appendChild(x); }); }
  QR.svg = function (text) { // QR code en SVG (bibliothèque qrcode-generator, MIT)
    const q = window.qrcode(0, 'H'); q.addData(text); q.make(); // niveau H : lisible même avec l'avatar au centre ou un reflet
    return q.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
  };
  let cam = null, scanT = null;
  QR.scan = async function (video, onText) { // caméra arrière + décodage jsQR (Apache 2.0) ~7 fois par seconde
    QR.stop();
    await load('js/vendor/qr/jsQR.js');
    cam = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    video.setAttribute('playsinline', ''); video.muted = true; video.srcObject = cam; await video.play().catch(() => { });
    const cv = document.createElement('canvas'), g = cv.getContext('2d', { willReadFrequently: true });
    let n = 0;
    scanT = setInterval(() => {
      const vw = video.videoWidth, vh = video.videoHeight; if (!vw) return;
      let r;
      if (n++ % 2 === 0) { // centre de l'image (là où on vise), en bonne résolution
        const side = Math.min(vw, vh) * 0.8, sx = (vw - side) / 2, sy = (vh - side) / 2, w = 520;
        cv.width = w; cv.height = w; g.drawImage(video, sx, sy, side, side, 0, 0, w, w);
        r = window.jsQR(g.getImageData(0, 0, w, w).data, w, w, { inversionAttempts: 'dontInvert' });
      } else { // image entière
        const w = 640, h = Math.round(vh / vw * w); cv.width = w; cv.height = h; g.drawImage(video, 0, 0, w, h);
        r = window.jsQR(g.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
      }
      if (r && r.data) onText(r.data);
    }, 120);
  };
  QR.stop = () => { clearInterval(scanT); scanT = null; if (cam) cam.getTracks().forEach(t => t.stop()); cam = null; };

  /* ---------- Son ---------- */
  const SO = TC.Sonic = {};
  // Les sons très aigus (> 17 kHz) passent mal par les haut-parleurs et micros de téléphone : on reste dans les aigus audibles.
  const F0 = 2600, STEP = 240, REP = 5000, MARK = 5300; // chiffres 0-9 : 2 600 → 4 760 Hz ; « même chiffre » : 5 000 Hz ; début : 5 300 Hz
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
  SO.schedule = function (c, dest, code, t0, vol = 0.35) {
    let t = t0; tone(c, dest, MARK, t, MARK_LEN, vol); t += MARK_LEN + GAP;
    let prev = null, lastF = null;
    for (const ch of code) { // chiffre répété : symbole « même chiffre », en alternance, pour que deux sons voisins ne soient jamais identiques
      const f = ch === prev && lastF !== REP ? REP : SO.freq(+ch);
      tone(c, dest, f, t, SYM, vol); prev = ch; lastF = f; t += SYM + GAP;
    }
    return t - t0 + 1.2; // petite pause entre deux émissions
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
    const lo = Math.floor((F0 - 300) / hz), hi = Math.ceil((MARK + 300) / hz);
    let cur = null, run = 0, tokens = [], gapRun = 0, last = null;
    function classify() {
      analyser.getFloatFrequencyData(bins);
      let best = -Infinity, bi = 0; const band = [];
      for (let i = lo; i <= hi; i++) { band.push(bins[i]); if (bins[i] > best) { best = bins[i]; bi = i; } }
      band.sort((a, b) => a - b); const floor = band[Math.floor(band.length / 2)];
      if (best - floor < 16 || best < -100) return null;
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
        onCode(code); last = code; // chaque code entendu est vérifié côté serveur (un code faux ne trouve personne)
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
  SO.stop = () => { SO.stopPlay(); SO.stopListen(); QR.stop(); session('auto'); };

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
