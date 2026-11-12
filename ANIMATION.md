# 🎪 Journal de l'animation quotidienne

Tenu par l'animation automatique (Claude). Dépôt public : **aucun pseudo, uid, e-mail ni donnée personnelle**, uniquement des chiffres agrégés.

## À FAIRE PAR NOHAM

- Rien pour l'instant (aucune règle Firestore à republier).

## Idées

- **Validation serveur des fortunes** : le jeu est calculé dans le navigateur et les règles Firestore laissent chacun écrire tout son profil (`nw`, `wk_…`, `refOk`, `guest`, `dupOf`). Sentinelle pourrait comparer chaque heure la hausse de `nw` / `wk_…` à ce qui est plausible (cours réels + loyers) et signaler les sauts anormaux au créateur.
- **Règles Firestore plus strictes sur le profil** : `referredBy` non modifiable une fois posé, `refOk` seulement false → true, `guest` seulement true → false.
- **Défi trading du soir** : classement séparé « meilleur gain entre 17 h et 23 h » (champ `ev_<id>` dans le profil, comme `wk_…`), petite prime symbolique (10–20 €) versée par Sentinelle.
- **Chasse au trésor sur la map** de Trad City : un objet caché sur un lot différent chaque soir.
- **Effet `rent` / `bonus` dans events.json** (loyers x2, bonus x2) en ne multipliant que la part de temps passée pendant l'événement.

## Journal

### 2026-11-12 (jeudi)

- **Événement** : 🍹 Happy hour, frais de trading offerts (comptant et levier), 17 h – 23 h. Premier événement : création du système commun `events.json` + `js/events.js` + `EVENTS.md` (bandeau en jeu, effet `fees` lu par le moteur via `G.feeSpot()` / `G.feeLev()`). Impact économique faible (les frais normaux sont de 0,1 % / 0,05 %), même avantage pour tous dans le championnat.
- **Annonce** : pas de nouvelle push aujourd'hui, deux annonces sont déjà parties ce matin (logos d'écran d'accueil, puis invités dans les classements) et le rappel partage de 18 h tombe pendant l'événement. Le bandeau en jeu suffit ; `announce.json` inchangé.
- **Anti-triche** : logs notify des dernières 24 h : 16 passages, tous réussis, aucune erreur, aucune ligne « modération » ni « sanction ». Faille corrigée : depuis que les invités sont des comptes anonymes en ligne (créables à volonté) et exemptés de la détection des doubles comptes, un joueur pouvait ouvrir son propre lien de parrainage en navigation privée, jouer en invité, activer les notifications et toucher 20 € par faux filleul, sans limite. La prime n'est plus versée que pour un vrai compte (pas invité, pas bot, pas marqué double compte) qui n'a jamais servi sur un appareil du parrain ; un invité qui crée ensuite son compte débloque normalement la prime. La liste des filleuls indique « joue en invité : il doit créer son compte ». Règles Firestore relues : pas de changement nécessaire aujourd'hui (voir Idées).
- **Amélioration** : rappel aux invités qui progressent (≥ 25 € de patrimoine ou 5 ordres) de créer leur compte pour ne pas perdre leur partie, au plus une fois par jour, avec un bouton qui ouvre directement « Créer mon compte » (rétention + plus de filleuls validés).
- **Chiffres du log** : 15 à 17 joueurs, 9 à 12 appareils abonnés aux notifications.
