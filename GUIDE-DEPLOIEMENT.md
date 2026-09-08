# 🚀 Mise en ligne — Paylora (guide pas à pas)

Deux choses à faire **dans votre navigateur** (je ne peux pas créer vos comptes) :
1. **GitHub** : héberger le code (gratuit) — le dépôt local est déjà prêt.
2. **Render** : héberger l'app + brancher Stripe et Resend.

> Le code est déjà prêt et commité localement dans `relanceo-saas/`
> (dépôt git, commit `53ca9c7`). Vous n'avez qu'à le pousser sur GitHub.

---

## Étape A — GitHub (1 fois)

1. Ouvrez **https://github.com** → créez un compte (ou connectez-vous).
2. Cliquez **« + »** (en haut à droite) → **New repository**.
   - Name : `relanceo` → **Private** ou **Public** → **Create repository**.
   - ⚠️ Ne cochez PAS « add README » (le dépôt local est déjà prêt).
3. Poussez le code local sur GitHub. Ouvrez un **PowerShell** dans `relanceo-saas/` et collez :
   ```
   git remote add origin https://github.com/VOTRE-COMPTE/relanceo.git
   git branch -M main
   git push -u origin main
   ```
   (GitHub vous demandera de vous connecter à la première poussée.)

---

## Étape B — Render (hébergement de l'app)

1. Ouvrez **https://render.com** → **Sign up** (gratuit) avec GitHub.
2. **New +** → **Blueprint** → sélectionnez votre repo `relanceo`.
   Render lit `render.yaml` : il crée le service **relanceo** et vous donne une URL
   `https://relanceo.onrender.com` (remplacez par votre domaine plus tard).
3. Dans Render, ouvrez votre **service** → onglet **Environment** et renseignez :
   - `BASE_URL` = votre URL (ex. `https://relanceo.onrender.com`)
   - `SESSION_SECRET` = une longue chaîne aléatoire (Render l'a déjà généré)
   - les clés Stripe/Resend (ci-dessous)
4. Enregistrez → Render relance automatiquement. Ouvrez l'URL : le site doit s'afficher.

---

## Étape C — Stripe (paiements réels)

1. Ouvrez **https://dashboard.stripe.com/register** → créez un compte
   (il reste **en mode test** tant que vous n'activez pas le mode réel).
2. Dans le dashboard, onglet **Product catalog** (ou **Produits**) → **Add product** :
   - Produit **Essentiel** → prix récurrent **9,99 € / mois** → copiez l'ID `prix_…`
   - Produit **Pro** → prix récurrent **19,99 € / mois** → copiez l'ID `prix_…`
3. Onglet **Developers → API keys** → copiez la clé **`sk_test_…`**.
4. Collez ces 3 valeurs dans Render (onglet Environment) :
   - `STRIPE_SECRET_KEY` = `sk_test_…`
   - `STRIPE_PRICE_ESSENTIEL` = `prix_…`
   - `STRIPE_PRICE_PRO` = `prix_…`
5. **Webhook** (pour que Stripe confirme l'abonnement et débloque l'app) :
   - Onglet **Developers → Webhooks → Add endpoint**
   - Endpoint URL : `https://VOTRE-URL/webhooks/stripe`
   - Événements à écouter : `checkout.session.completed` et `customer.subscription.deleted`
   - Après création, copiez le **secret `whsec_…`** → mettez `STRIPE_WEBHOOK_SECRET` dans Render.
6. Testez : ouvrez le site, créez un compte, « Choisir Essentiel » → vous êtes redirigé
   vers Stripe (mode test) → payez avec la carte de test **4242 4242 4242 4242**
   (date future, CVC quelconque) → revenez : l'app doit passer « Abonnement actif ».

---

## Étape D — Emails réels (Resend)

1. **https://resend.com** → créez un compte → **API Keys** → **Create** → copiez `re_…`.
2. **Domains** → ajoutez votre domaine et validez le DNS (ou utilisez `onboarding@resend.dev`
   pour tester, mais les emails portent le domaine Resend).
3. Dans Render :
   - `RESEND_API_KEY` = `re_…`
   - `EMAIL_FROM` = `Relanceo <relances@votre-domaine.fr>`
4. Testez un envoi dans l'app → il doit partir réellement.

---

## Étape E — Passer en production réelle (quand tout est bon)
- Achetez un domaine (ex. `relanceo.fr`) et liez-le à Render (onglet Custom domains).
- Mettez à jour `BASE_URL` en https://.
- Activez le mode **réel** de Stripe (le dashboard vous le propose) et recréez 2 prix **`price_live`**.
- ⚠️ Avant la vraie mise en ligne : renforcez la sécurité (voir `README.md` → Limites).

---

## Dépannage rapide
| Symptôme | Cause → correctif |
|---|---|
| L'app n'active pas l'abonnement après paiement | Webhook pas branché → vérifiez `STRIPE_WEBHOOK_SECRET` + événements |
| Le site ne charge pas | `BASE_URL` faux ou service pas relancé après changement d'env |
| Les emails n'arrivent pas | Vérifiez `RESEND_API_KEY` + domaine validé dans Resend |
| Cookies non gardés en prod | `BASE_URL` doit commencer par `https://` (cookie `Secure`) |
