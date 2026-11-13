# 🎪 Journal de l'animation quotidienne

Tenu par l'animation automatique (Claude). Dépôt public : **aucun pseudo, uid, e-mail ni donnée personnelle**, uniquement des chiffres agrégés.

## À FAIRE PAR NOHAM

- Rien pour l'instant (aucune règle Firestore à republier).

## Idées

- **Validation serveur des fortunes** : le jeu est calculé dans le navigateur et les règles Firestore laissent chacun écrire tout son profil (`nw`, `wk_…`, `refOk`, `guest`, `dupOf`). Sentinelle pourrait comparer chaque heure la hausse de `nw` / `wk_…` à ce qui est plausible (cours réels + loyers) et signaler les sauts anormaux au créateur.
- **Règles Firestore plus strictes sur le profil** : `referredBy` non modifiable une fois posé, `refOk` seulement false → true, `guest` seulement true → false.
- **Défi trading du soir** : classement séparé « meilleur gain entre 17 h et 23 h » (champ `ev_<id>` dans le profil, comme `wk_…`), petite prime symbolique (10–20 €) versée par Sentinelle.
- **Chasse au trésor sur la map** de Trad City : un objet caché sur un lot différent chaque soir.
- **Duels : prime versée par le serveur** : aujourd'hui chaque joueur calcule lui-même le résultat et se paie ; Sentinelle pourrait comparer les deux scores publiés (`dl.g`) et signaler les écarts ou les duels gagnés tous les jours contre le même ami inactif.
- **Chasse au trésor en 3D** : faire briller les monuments à fouiller dans la vue 3D (aujourd'hui seule la carte 2D les entoure en doré).
- **Effet `rent` / `bonus` dans events.json** (loyers x2, bonus x2) en ne multipliant que la part de temps passée pendant l'événement.

## Bilans

### Semaine du 9 au 13/11/2026 (bilan du vendredi 13/11)

- **Joueurs** (log notify) : 10 le mar. 10/11 (17 h 52) → 15 le mer. 11/11 → 19 le jeu. 12/11 → **20** le ven. 13/11 (16 h). Pas de bilan précédent (premier bilan).
- **Appareils abonnés aux notifications** : 5 → 9 → 11 → **12** (mêmes passages).
- **Notifications** : total de la semaine inconnu (pas compté sur tous les passages) ; exemples : 9 le mer. 17 h 15, 0 le jeu. 21 h 40, 17 le ven. 16 h.
- **Workflow notify** : 69 passages depuis le 8/11, 68 réussis, 1 annulé (lun. 9/11, avant la mise en service : PUSH_SECRET absent jusqu'au lundi soir). Seulement 2 à 4 passages planifiés par jour au lieu d'un toutes les 10 min (GitHub espace les crons) ; les autres sont lancés à la main.
- **Workflow pages** : 89 publications, dernières toutes réussies.
- **Sentinelle** : aucun signalement ni sanction vus dans les passages consultés.
- **Commits** : 50 (hors fusions) depuis lundi.

## Journal

### 2026-11-13 (vendredi)

- **Événement** : 💎 Chasse au trésor à Trad City, 17 h – 23 h. Nouveau type d'événement `hunt` dans le système commun (`js/hunt.js`, documenté dans EVENTS.md) : un trésor est caché dans un des 8 monuments de la carte, cachette différente pour chaque joueur ; toucher un monument le fouille, un mauvais monument donne une devinette sur le bon. Prime de 25 € (plafond 50 € dans le code) + 50 XP, une fois par joueur, réservée aux vrais comptes (pas invité, pas double compte), exclue du championnat et des duels.
- **Annonce** : `tresor-2026-11-13`, push « 💎 Un trésor est caché dans Trad City », ouvre l'onglet Ville. Seule annonce du jour.
- **Anti-triche** : logs notify des dernières 24 h : 11 passages, tous réussis, aucune erreur, aucune ligne « modération » ni « sanction ». Faille corrigée dans les duels (ajoutés hier) : un joueur pouvait se faire un compte invité en navigation privée, l'ajouter en ami, lancer un duel et le laisser à 0 € pour gagner 100 € par jour (200 € le mardi), ou supprimer ce compte pour gagner d'office. Plus de duel ni de prime contre un invité, un bot, un double compte, un compte qui a servi sur un de ses appareils ou un compte introuvable (revérifié sur le profil frais au moment de payer). Règles Firestore relues : rien à republier.
- **Amélioration** : bouton 📤 sur le bandeau d'événement pour inviter ses amis à l'événement avec son lien de parrainage (partage natif du téléphone, sinon copie). Corrigé au passage : toucher le bandeau ouvrait l'onglet de l'événement affiché au chargement même si un autre avait pris sa place.
- **Chiffres du log** : 19 à 20 joueurs, 11 à 12 appareils abonnés aux notifications.

### 2026-11-12 (jeudi)

- **Événement** : 🍹 Happy hour, frais de trading offerts (comptant et levier), 17 h – 23 h. Premier événement : création du système commun `events.json` + `js/events.js` + `EVENTS.md` (bandeau en jeu, effet `fees` lu par le moteur via `G.feeSpot()` / `G.feeLev()`). Impact économique faible (les frais normaux sont de 0,1 % / 0,05 %), même avantage pour tous dans le championnat.
- **Annonce** : pas de nouvelle push aujourd'hui, deux annonces sont déjà parties ce matin (logos d'écran d'accueil, puis invités dans les classements) et le rappel partage de 18 h tombe pendant l'événement. Le bandeau en jeu suffit ; `announce.json` inchangé.
- **Anti-triche** : logs notify des dernières 24 h : 16 passages, tous réussis, aucune erreur, aucune ligne « modération » ni « sanction ». Faille corrigée : depuis que les invités sont des comptes anonymes en ligne (créables à volonté) et exemptés de la détection des doubles comptes, un joueur pouvait ouvrir son propre lien de parrainage en navigation privée, jouer en invité, activer les notifications et toucher 20 € par faux filleul, sans limite. La prime n'est plus versée que pour un vrai compte (pas invité, pas bot, pas marqué double compte) qui n'a jamais servi sur un appareil du parrain ; un invité qui crée ensuite son compte débloque normalement la prime. La liste des filleuls indique « joue en invité : il doit créer son compte ». Règles Firestore relues : pas de changement nécessaire aujourd'hui (voir Idées).
- **Amélioration** : rappel aux invités qui progressent (≥ 25 € de patrimoine ou 5 ordres) de créer leur compte pour ne pas perdre leur partie, au plus une fois par jour, avec un bouton qui ouvre directement « Créer mon compte » (rétention + plus de filleuls validés).
- **Chiffres du log** : 15 à 17 joueurs, 9 à 12 appareils abonnés aux notifications.
