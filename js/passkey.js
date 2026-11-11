/* Trad Center — confirmer ses paiements avec Face ID, Touch ID ou l'empreinte (verrouillage du téléphone).
 * Utilise une « clé d'accès » (WebAuthn) créée sur l'appareil : le visage ou le doigt ne quittent jamais le téléphone,
 * le jeu reçoit seulement « c'est bien le propriétaire ». Réglage propre à chaque appareil et à chaque compte.
 */
(function () {
  const TC = window.TC = window.TC || {};
  const P = TC.Pass = {};
  const uid = () => (TC.Net && TC.Net.user && TC.Net.user.uid) || 'invite';
  const KEY = () => 'tradcenter.passkey.' + uid();
  const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64 = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  const rand = n => crypto.getRandomValues(new Uint8Array(n));
  let okUntil = 0;

  P.label = () => /iPhone|iPad/.test(navigator.userAgent) ? 'Face ID' : /Mac/.test(navigator.userAgent) ? 'Touch ID' : /Android/.test(navigator.userAgent) ? 'l\'empreinte' : 'le verrouillage de l\'appareil';
  P.supported = async () => {
    try { return !!(window.PublicKeyCredential && window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable && await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); } catch (e) { return false; }
  };
  P.enabled = () => { try { return !!localStorage.getItem(KEY()); } catch (e) { return false; } };

  P.enable = async function () {
    const pseudo = (TC.Net && TC.Net.profile && TC.Net.profile.pseudo) || 'Joueur';
    const cred = await navigator.credentials.create({ publicKey: {
      challenge: rand(32), rp: { name: 'Trad Center' },
      user: { id: new TextEncoder().encode(uid()).slice(0, 64), name: pseudo, displayName: pseudo },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60000, attestation: 'none',
    } });
    localStorage.setItem(KEY(), b64(cred.rawId)); okUntil = Date.now() + 60000;
    return true;
  };
  // Demande Face ID / empreinte. Sans réglage activé : passe directement. Une réussite vaut 1 minute (pas deux demandes pour un même paiement).
  P.check = async function (force) {
    if (!P.enabled() && !force) return true;
    if (!force && Date.now() < okUntil) return true;
    const id = localStorage.getItem(KEY());
    try {
      await navigator.credentials.get({ publicKey: { challenge: rand(32), allowCredentials: id ? [{ type: 'public-key', id: unb64(id) }] : [], userVerification: 'required', timeout: 60000 } });
    } catch (e) {
      const err = new Error(`Paiement annulé : ${P.label()} n'a pas confirmé que c'est toi.`); err.userMsg = err.message; throw err;
    }
    okUntil = Date.now() + 60000; return true;
  };
  P.disable = async function () { await P.check(true); localStorage.removeItem(KEY()); okUntil = 0; };

  // Bloc de réglage réutilisable (Trad Banque, paramètres du jeu)
  P.block = async function (box) {
    if (!box) return;
    if (!(await P.supported())) { box.innerHTML = `<p class="hint">🔒 Confirmation par Face ID ou empreinte indisponible sur cet appareil (il faut un verrouillage par visage, empreinte ou code).</p>`; return; }
    const on = P.enabled();
    box.innerHTML = `<div class="pk-row"><span class="pk-ic">${on ? '🔐' : '🔓'}</span><div><b>Payer avec ${P.label()}</b><small>${on ? 'Activé : chaque paiement et virement te demande ' + P.label() + '.' : 'Personne ne peut payer avec ton compte sans ton visage ou ton doigt.'}</small></div>
      <button class="btn btn-sm ${on ? 'btn-ghost' : 'btn-gold'}" data-pk>${on ? 'Désactiver' : 'Activer'}</button></div>`;
    box.querySelector('[data-pk]').onclick = async () => {
      try {
        if (P.enabled()) { await P.disable(); TC.toast(`🔓 ${P.label()} désactivé pour les paiements`, 'info'); }
        else { await P.enable(); TC.toast(`🔐 ${P.label()} activé : il sera demandé à chaque paiement`, 'ok', 5000); TC.sound && TC.sound('ach'); }
      } catch (e) { TC.toast(e.userMsg || 'Annulé', 'bad'); }
      P.block(box);
    };
  };
})();
