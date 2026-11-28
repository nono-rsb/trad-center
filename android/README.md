# Appli Android de Trad Center

Appli de confiance (TWA) : elle ouvre `https://nono-rsb.github.io/trad-center/` dans Chrome, sans barre d'adresse une fois le
lien de confiance en place. **Le jeu se met à jour tout seul**, puisque c'est le site qui s'affiche : il n'y a pas d'APK à
refaire à chaque nouveauté. L'APK ne change que si on modifie ce dossier.

- Fabrication : GitHub Actions, `.github/workflows/android.yml`. Résultat dans la release `android`.
- Téléchargement : https://github.com/nono-rsb/trad-center/releases/download/android/trad-center.apk
- Mise à jour de l'appli elle-même : le jeu compare le numéro de version de l'appli (`?apk=`) à celui de la release
  et propose de télécharger la nouvelle (js/apk.js).
- Signature : clé créée au premier passage, chiffrée avec `PUSH_SECRET`, rangée sur la branche `apk-key`.

## Plein écran (sans barre d'adresse)
Sans le lien de confiance, Chrome affiche une petite barre au-dessus du jeu. Pour la retirer :
1. Créer un dépôt public nommé `nono-rsb.github.io`.
2. Y ajouter `.well-known/assetlinks.json` :
```json
[{"relation": ["delegate_permission/common.handle_all_urls"],
  "target": {"namespace": "android_app", "package_name": "fr.tradcenter.app",
             "sha256_cert_fingerprints": ["EMPREINTE_SHA256_AFFICHEE_PAR_LA_COMPILATION"]}}]
```
3. Réinstaller l'appli (ou vider les données de Chrome pour le site) : la barre disparaît.
