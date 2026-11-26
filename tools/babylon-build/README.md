# Babylon.js allégé

`js/vendor/babylon-tc.js` est une version de Babylon.js qui ne contient que ce que le jeu utilise (≈ 3 Mo au lieu de 9 Mo,
et beaucoup moins de mémoire). Pour la refaire (après avoir ajouté une classe Babylon dans `entry.js`) :

    cd tools/babylon-build && npm install && npm run build

Licence de Babylon.js : Apache 2.0 (voir js/vendor/BABYLON-LICENSE.md).
