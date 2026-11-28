/* Trad Center — détection de la main dans la caméra (MediaPipe Hand Landmarker, Apache 2.0, hébergé dans le jeu).
 * Tout tourne sur le téléphone : aucune image ne part sur internet. Chargé seulement quand on paie avec la caméra.
 * TC.Hand.start(video, cb) : cb({ pts: 21 points [x, y] en pixels vidéo, vw, vh }) à chaque image où une main est vue.
 */
(function () {
  const TC = window.TC = window.TC || {};
  const H = TC.Hand = {};
  const BASE = new URL('js/vendor/mediapipe/', location.href).href;
  let lm = null, loading = null, raf = 0, cb = null, vid = null, lastT = -1, files = null, mode = null, fails = 0;
  const iOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  H.state = 'off'; // off | loading | ready | error
  H.load = function () {
    if (lm) return Promise.resolve(lm);
    if (loading) return loading;
    loading = (async () => {
      H.state = 'loading';
      const { FilesetResolver, HandLandmarker } = await import(BASE + 'vision_bundle.mjs');
      files = await FilesetResolver.forVisionTasks(BASE + 'wasm');
      H._make = d => HandLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: BASE + 'hand_landmarker.task', delegate: d }, runningMode: 'VIDEO', numHands: 1, minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.4 });
      mode = iOS ? 'CPU' : 'GPU'; // le GPU de Safari sur iPhone est capricieux avec MediaPipe : processeur, plus sûr
      try { lm = await H._make(mode); } catch (e) { mode = 'CPU'; lm = await H._make('CPU'); }
      H.state = 'ready'; return lm;
    })();
    loading.catch(e => { loading = null; H.state = 'error'; H.error = String(e && e.message || e); console.warn('main', e); });
    return loading;
  };
  function loop() {
    raf = requestAnimationFrame(loop);
    if (!lm || !vid || vid.readyState < 2 || !vid.videoWidth) return;
    const t = performance.now(); if (t - lastT < 45) return; // ~20 images par seconde suffisent
    lastT = t;
    let r; try { r = lm.detectForVideo(vid, t); fails = 0; } catch (e) {
      if (++fails > 5 && mode === 'GPU' && H._make) { mode = 'CPU'; const old = lm; lm = null; H._make('CPU').then(x => { lm = x; try { old.close(); } catch (er) { } }).catch(() => { H.state = 'error'; }); }
      return;
    }
    const L = r && r.landmarks && r.landmarks[0]; if (!L || !cb) return;
    const vw = vid.videoWidth, vh = vid.videoHeight;
    cb({ pts: L.map(p => [p.x * vw, p.y * vh]), vw, vh });
  }
  H.start = async function (video, onHand) {
    H.stop(); vid = video; cb = onHand;
    await H.load(); if (!cb) return false;
    raf = requestAnimationFrame(loop); return true;
  };
  H.stop = function () { cancelAnimationFrame(raf); raf = 0; cb = null; vid = null; };
})();
