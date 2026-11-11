/* Trad Center — détection de la main dans la caméra (MediaPipe Hand Landmarker, Apache 2.0, hébergé dans le jeu).
 * Tout tourne sur le téléphone : aucune image ne part sur internet. Chargé seulement quand on paie avec la caméra.
 * TC.Hand.start(video, cb) : cb({ pts: 21 points [x, y] en pixels vidéo, vw, vh }) à chaque image où une main est vue.
 */
(function () {
  const TC = window.TC = window.TC || {};
  const H = TC.Hand = {};
  const BASE = new URL('js/vendor/mediapipe/', location.href).href;
  let lm = null, loading = null, raf = 0, cb = null, vid = null, lastT = -1;
  H.load = function () {
    if (lm) return Promise.resolve(lm);
    if (loading) return loading;
    loading = (async () => {
      const { FilesetResolver, HandLandmarker } = await import(BASE + 'vision_bundle.mjs');
      const files = await FilesetResolver.forVisionTasks(BASE + 'wasm');
      const opts = d => ({ baseOptions: { modelAssetPath: BASE + 'hand_landmarker.task', delegate: d }, runningMode: 'VIDEO', numHands: 1, minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.4 });
      try { lm = await HandLandmarker.createFromOptions(files, opts('GPU')); } catch (e) { lm = await HandLandmarker.createFromOptions(files, opts('CPU')); }
      return lm;
    })();
    loading.catch(() => { loading = null; });
    return loading;
  };
  function loop() {
    raf = requestAnimationFrame(loop);
    if (!lm || !vid || vid.readyState < 2 || !vid.videoWidth) return;
    const t = performance.now(); if (t - lastT < 45) return; // ~20 images par seconde suffisent
    lastT = t;
    let r; try { r = lm.detectForVideo(vid, t); } catch (e) { return; }
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
