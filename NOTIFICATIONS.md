# 🔔 Notifications

## Pour les joueurs
Bouton **🔔** en haut de l'écran → **Activer les notifications**.

- 💸 **Envois reçus** (argent, Bitcoin…) et **demandes d'ami**
- 🚀📉 **Grosses hausses / chutes** : Bitcoin et Ethereum ±3 % en 1 h ou ±5 % en 24 h, autres cryptos ±6 % / ±10 %, actions ±4 % / ±6 %, indices ±1,5 % / ±2,5 %, matières premières ±3 % / ±4 %, devises ±1 % / ±1,5 % (mode « Sensible » : moitié moins)
- 🎯 **Alertes de prix** : « préviens-moi quand le Bitcoin atteint 100 000 € »

Appli ouverte : alertes instantanées. Appli fermée : il faut être connecté à un compte (onglet 👥 Amis), et les notifications arrivent avec quelques minutes de décalage (serveur toutes les ~5 à 15 min).

**iPhone** : iOS 16.4 ou plus récent, et l'appli doit être **installée sur l'écran d'accueil** (Safari → Partager → « Sur l'écran d'accueil ») puis ouverte depuis son icône avant d'activer les notifications.

## Pour le propriétaire du jeu
Le serveur de notifications est le workflow GitHub Actions [`notify.yml`](.github/workflows/notify.yml) qui lance [`scripts/notify.mjs`](scripts/notify.mjs) toutes les 5 minutes (GitHub peut retarder de quelques minutes). Il a besoin :

1. des **règles Firestore à jour** ([`firebase/firestore.rules`](firebase/firestore.rules)) ;
2. du **secret GitHub `PUSH_SECRET`** (Settings → Secrets and variables → Actions → New repository secret), un JSON :
   `{"botEmail": "...", "botPassword": "...", "vapidPublic": "...", "vapidPrivate": "..."}`.
   `vapidPublic` doit être identique à `TC.VAPID_PUBLIC` dans [`js/config.js`](js/config.js), et le compte robot doit avoir l'uid indiqué dans `isBot()` des règles.

Sans ce secret, le workflow s'arrête proprement sans rien envoyer. GitHub met en pause les tâches planifiées d'un dépôt sans activité pendant 60 jours : il suffit alors de les réactiver dans l'onglet Actions.
