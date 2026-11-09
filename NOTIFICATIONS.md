# 🔔 Notifications

## Pour les joueurs
Bouton **🔔** en haut de l'écran → **Activer les notifications**.

- 💸 **Envois reçus** (argent, Bitcoin…) et **demandes d'ami**
- 🚀📉 **Grosses hausses / chutes** : Bitcoin et Ethereum ±3 % en 1 h ou ±5 % en 24 h, autres cryptos ±6 % / ±10 %, actions ±4 % / ±6 %, indices ±1,5 % / ±2,5 %, matières premières ±3 % / ±4 %, devises ±1 % / ±1,5 % (mode « Sensible » : moitié moins)
- 🎯 **Alertes de prix** : « préviens-moi quand le Bitcoin atteint 100 000 € »

Appli ouverte : alertes instantanées. Appli fermée : il faut être connecté à un compte (onglet 👥 Amis) ; les envois et demandes d'ami arrivent en moins d'une minute, les mouvements de marché en quelques minutes.

**iPhone** : iOS 16.4 ou plus récent, et l'appli doit être **installée sur l'écran d'accueil** (Safari → Partager → « Sur l'écran d'accueil ») puis ouverte depuis son icône avant d'activer les notifications.

## Pour le propriétaire du jeu (une seule fois)
Le serveur de notifications est le workflow GitHub Actions [`notify.yml`](.github/workflows/notify.yml), qui lance [`scripts/notify.mjs`](scripts/notify.mjs) en continu : chaque exécution surveille ~50 min (messages toutes les 30 s, marchés toutes les 3 min) puis relance la suivante ; une planification toutes les 15 min sert de filet de sécurité.

**Seul réglage : inventer un mot de passe et l'enregistrer comme secret GitHub.**
1. Ouvrez <https://github.com/nono-rsb/trad-center/settings/secrets/actions/new>
2. *Name* : `PUSH_SECRET` — *Secret* : un long mot de passe inventé (au moins 20 caractères, ne le donnez à personne) → **Add secret**.

C'est tout : au premier lancement, le serveur fabrique ses clés à partir de ce mot de passe, crée son propre compte Firebase et publie sa clé publique. Aucune règle Firestore à modifier. Ne changez pas ce mot de passe ensuite (sinon il faudrait supprimer le compte `push-server@trad-center.firebaseapp.com` dans Firebase Authentication).

Pour lancer le serveur tout de suite : onglet **Actions** → *Notifications push* → **Run workflow**.

Sans ce secret, le workflow s'arrête proprement sans rien envoyer. GitHub met en pause les tâches planifiées d'un dépôt sans activité pendant 60 jours : il suffit alors de les réactiver dans l'onglet Actions.
