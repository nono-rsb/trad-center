# 📈 Trad Center — De 10 € à la Bugatti

Jeu de trading **avec les vrais cours du marché**. Vous partez avec **10 €**, vous tradez le Bitcoin, l'Ethereum, le CAC 40, Tesla, l'or, le dollar… et avec vos gains vous vous offrez des **Porsche, Lamborghini Huracán, Ferrari, Bugatti**, des appartements, des villas, des yachts et des jets.

## 🎮 Jouer

Aucune installation : c'est un site statique (HTML/CSS/JS, sans build).

- **En ligne** : <https://nono-rsb.github.io/trad-center/> — le workflow `.github/workflows/pages.yml` republie le jeu sur la branche `gh-pages` à chaque push sur `main`.
- **En local** : `python3 -m http.server 8000` dans le dossier puis ouvrez <http://localhost:8000>. (Un double-clic sur `index.html` fonctionne aussi.)

La partie est sauvegardée automatiquement dans le navigateur (export/import possible dans ⚙️ Paramètres).

## 📊 Des cours réels

| Marché | Actifs | Source | Fraîcheur |
|---|---|---|---|
| Crypto | BTC, ETH, SOL, BNB, XRP, DOGE, ADA, TRX, AVAX, LINK, DOT, LTC, TON, SUI, NEAR, UNI, ATOM, SHIB, PEPE, PAXG (or) | Binance (WebSocket) → secours CoinGecko | temps réel, 24 h/24 |
| Indices | CAC 40, S&P 500, Nasdaq, Dow Jones, DAX, Euro Stoxx 50, FTSE 100, Nikkei 225 | Yahoo Finance | 0 à 15 min selon la place |
| Actions | Apple, NVIDIA, Microsoft, Tesla, Amazon, Google, Meta, Netflix, AMD, Palantir, Coinbase, Strategy, Ferrari, LVMH, Hermès, L'Oréal, Airbus, TotalEnergies, BNP, Sanofi, Renault, Stellantis, Porsche, Ubisoft | Yahoo Finance | 0 à 15 min, heures d'ouverture |
| Matières premières | Or, argent, pétrole WTI & Brent, gaz naturel, cuivre | Yahoo Finance | 0 à 15 min |
| Devises | USD, GBP, CHF, JPY, CAD, AUD, CNY | Yahoo Finance + BCE (Frankfurter) | quelques minutes |

Tout est converti en euros au taux de change réel du moment. Les bourses ferment le soir et le week-end (badge **FERMÉ**), les cryptos tournent en continu.

Yahoo Finance n'autorisant pas les appels directs depuis un navigateur, le jeu passe par des proxys CORS publics (allorigins, corsproxy.io, codetabs…) et bascule automatiquement de l'un à l'autre.

**Honnêteté des données** : chaque actif affiche un badge — `LIVE` (temps réel), `RÉEL` (cours réel, léger délai possible), `CACHE` (dernier cours réel connu) ou `SIM`. `SIM` n'apparaît que si une source est injoignable depuis votre réseau : le prix est alors simulé à partir du dernier cours connu, avec un bandeau d'avertissement, jusqu'au retour de la connexion.

## 🕹️ Mécaniques

- **💵 Comptant** : achat / vente classique, frais 0,1 %.
- **⚡ Levier x1 à x100** : Long (hausse) ou Short (baisse), stop-loss / take-profit, prix de liquidation affiché et tracé sur le graphique. Liquidation quand la perte atteint 90 % de la marge.
- **🎲 Paris** : plus haut ou plus bas dans 1 min, 5 min, 15 min ou 1 h ? Gain x1,9, résolu avec le vrai prix à l'échéance.
- **🏎️ Concession** : 29 véhicules, de la trottinette à la Bugatti Tourbillon (Porsche 911, GT3 RS, Huracán Tecnica, STO, Urus, Revuelto, Ferrari Roma, 296 GTB, SF90, Purosangue, F40, McLaren 750S, Pagani, Koenigsegg…).
- **🏠 Immobilier** : de la place de parking au gratte-ciel de La Défense ; chaque bien verse un **loyer horaire**, même jeu fermé (48 h max).
- **💎 Luxe** : Rolex, Patek Philippe, Richard Mille, Birkin, hélicoptère, yachts, jets, club de foot, fusée…
- **🎯 Objectif**, **🏆 Collection** (revente possible), **🎖️ 28 succès**, **11 rangs** (de « Fauché » à « Maître du monde »), **🎁 bonus quotidien** de 10 €, graphique de patrimoine, historique complet.

## 🗂️ Structure

```
index.html
css/style.css
js/catalog.js   marchés, boutique, succès, rangs
js/data.js      flux de prix réels (Binance, Yahoo, BCE, CoinGecko) + repli
js/game.js      moteur : portefeuille, levier, liquidations, paris, achats, loyers
js/chart.js     graphiques (TradingView Lightweight Charts, repli canvas)
js/ui.js        rendu de l'interface
js/app.js       événements, boucles, notifications
js/vendor/      Lightweight Charts 4.1.3 (Apache 2.0)
```

> Jeu de simulation : aucun argent réel n'est engagé. Ceci n'est pas un conseil en investissement. Les prix des véhicules et biens sont des prix publics approximatifs.
