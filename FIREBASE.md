# 👥 Activer le mode en ligne (comptes, amis, envois d'argent)

Le mode en ligne utilise **Firebase** (Google), gratuit pour ce jeu. Comptez 5 minutes.

## 1. Créer le projet
1. Allez sur <https://console.firebase.google.com> et connectez-vous avec un compte Google.
2. **Créer un projet** → nom : `trad-center` → Google Analytics : **désactivé** → Créer.

## 2. Activer les comptes par e-mail
1. Menu de gauche : **Authentication** → **Commencer**.
2. Onglet **Sign-in method** → **Adresse e-mail/Mot de passe** → **Activer** → Enregistrer.
3. Onglet **Settings** → **Domaines autorisés** → **Ajouter un domaine** → `nono-rsb.github.io`.
4. (Facultatif) Onglet **Templates** → choisissez le **français** pour les e-mails.

## 3. Créer la base de données
1. Menu de gauche : **Firestore Database** → **Créer une base de données**.
2. Emplacement : `eur3 (europe-west)` → **Démarrer en mode production** → Créer.
3. Onglet **Règles** : effacez tout, collez le contenu de [`firebase/firestore.rules`](firebase/firestore.rules), puis **Publier**.

## 4. Récupérer la configuration
1. ⚙️ (en haut à gauche) → **Paramètres du projet** → en bas, **Vos applications** → icône **`</>`** (Web).
2. Surnom : `trad-center` → **Enregistrer l'application** (pas besoin de Firebase Hosting).
3. Copiez le bloc `firebaseConfig = { apiKey: …, authDomain: …, projectId: …, … }`.

## 5. Brancher le jeu
Collez ces valeurs dans [`js/config.js`](js/config.js) à la place de `TC.FIREBASE = null;` :

```js
TC.FIREBASE = {
  apiKey: "AIza…",
  authDomain: "trad-center-xxxx.firebaseapp.com",
  projectId: "trad-center-xxxx",
  appId: "1:…:web:…"
};
```

Poussez sur `main` : le site se met à jour tout seul. (Ou envoyez simplement ce bloc à Claude, il s'en occupe.)

Ces valeurs ne sont pas secrètes : elles identifient le projet. La sécurité est assurée par les règles Firestore (chacun ne peut lire que sa propre sauvegarde, n'envoyer qu'à ses amis, ne réclamer que ce qui lui est destiné).

## Ce que ça donne
- **Compte** avec e-mail + mot de passe + pseudo unique, e-mail de confirmation, mot de passe oublié.
- **Partie sauvegardée en ligne** : on la retrouve sur téléphone et ordinateur.
- **Amis** : ajout par pseudo, demandes à accepter, bouton 📤 Inviter (partage du lien).
- **Envois** : euros ou n'importe quel actif détenu (Bitcoin, Ethereum, actions…), avec un message ; le destinataire le reçoit en direct avec confettis.
- **Classement** entre amis et mondial (top 50).

## Tester en local (développeurs)
`npx firebase-tools emulators:start --only auth,firestore --project demo-tradcenter`, puis dans `js/config.js` mettez une config factice avec `projectId: 'demo-tradcenter'` et `TC.FIREBASE_EMULATOR = '127.0.0.1';`.
