# 🎉 Événements programmés

Système commun à tous les mini-événements (animation du soir, événement du dimanche 18 h…).

- **`events.json`** : la liste des événements.
- **`js/events.js`** : lit la liste (au lancement, toutes les 10 min et au retour dans l'appli), affiche le bandeau en haut du jeu et expose les effets au moteur.

## Format

```json
{
  "events": [
    {
      "id": "happyhour-2026-11-12",
      "emoji": "🍹",
      "title": "Happy hour : frais offerts",
      "text": "0 € de frais sur tous les ordres",
      "start": "2026-11-12T17:00:00+01:00",
      "end": "2026-11-12T23:00:00+01:00",
      "tab": "markets",
      "effects": { "fees": 0 }
    }
  ]
}
```

- `start` / `end` : **heure de Paris avec le décalage** (`+01:00` l'hiver, `+02:00` l'été, changement fin mars / fin octobre). Le jeu affiche toujours l'heure de Paris, quel que soit le fuseau du téléphone.
- `tab` : onglet ouvert quand on touche le bandeau (`markets`, `portfolio`, `shop`, `collection`, `social`, `city`).
- Bandeau : « à 17 h 00 » dans les 6 h qui précèdent, puis « encore 2 h 14 » pendant l'événement (petit toast au démarrage). Rien en dehors.
- On peut laisser les anciens événements dans la liste (ignorés une fois finis) mais mieux vaut la garder courte.

## Effets disponibles

| Effet | Sens | Bornes | Lu par |
|---|---|---|---|
| `fees` | multiplicateur des frais de trading (comptant et levier) : `0` = offerts, `0.5` = moitié prix | 0 à 1 | `G.feeSpot()` / `G.feeLev()` dans `js/game.js` |

### Chasse au trésor (`hunt`)

```json
"hunt": { "prize": 25 }
```

Hors de `effects` : un trésor est caché dans un des 8 monuments de la carte (cachette différente pour chaque joueur, tirée de l'`id` + uid). Pendant l'événement, toucher un monument (2D ou 3D) le fouille au lieu de l'ouvrir ; un mauvais monument donne une devinette sur le bon. Prime (plafonnée à 50 € dans `js/hunt.js`) une seule fois par événement, réservée aux vrais comptes (pas invité, pas double compte), exclue du championnat et des duels (`TC.Weekly.flow`), +50 XP. Mettre `"tab": "city"`.

Le bandeau a aussi un bouton 📤 qui partage l'événement avec le lien de parrainage du joueur.

Les effets se cumulent par multiplication avec ceux du Maire (ex. Maire « Zéro frais » + happy hour = toujours 0).

**Ajouter un effet** : déclarer ses bornes dans `EFFECTS` (js/events.js) puis le lire dans le moteur avec `TC.Events.mult('<nom>')` (vaut 1 hors événement). Pour un effet sur une durée (loyers, recettes), ne multiplier que la part de temps passée pendant l'événement, sinon on peut attendre 48 h et tout encaisser pendant l'événement.

⚠️ Le jeu est calculé dans le navigateur : un effet ne doit jamais donner d'argent « gratuit » en grande quantité ni fausser le championnat de la semaine.
