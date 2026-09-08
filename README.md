# Paylora — micro-SaaS (relances de paiement pour TPE françaises)

Version **web SaaS autonome** (sans Shopify) : comptes, données par utilisateur,
abonnement Stripe réel, envoi d'emails. Réutilise le moteur et les contenus FR
du prototype (paliers, tons, anti-doublon).

> MVP **testé de bout en bout** en mode simulation (voir « Démarrage rapide »).
> Le code tourne réellement ; il reste à brancher Stripe + Resend + un hébergement.

---

## Fonctionnement (ce que l'app fait)
1. Le dirigeant crée un compte (essai gratuit 14 j).
2. Il importe ses factures (CSV ou à la main). Paylora détecte automatiquement
   les factures en retard et leur niveau (palier 1/2/3 selon le retard).
3. « Générer les relances dues » crée les brouillons rédigés en français, au ton
   choisi (courtois / commercial / ferme), sans jamais relancer deux fois le même niveau.
4. « Envoyer » envoie l'email au client (avec lien de paiement).
5. Quand la facture est payée, marquée « 💶 Payée » → plus aucune relance.
6. Abonnement Essentiel 9,99 € / Pro 19,99 € → débloque les envois et les limites.

---

## Démarrage rapide (mode simulation, sans Stripe ni Resend)

```bash
cd relanceo-saas
npm install
copy .env.example .env    # vous pouvez laisser Stripe/Resend vides
npm start                 # → http://localhost:3000
```

Ouvrez **http://localhost:3000** :
- Créez un compte → un **échantillon de factures** est disponible dans l'app
  (bouton « ✨ Charger un échantillon »).
- Générer / envoyer les relances : sans clé Resend, les emails sont écrits dans
  `./outbox` (simulation locale, comme le prototype).
- « Choisir Essentiel/Pro » : sans Stripe, l'abonnement est **simulé** (activé direct).

## Passage en mode réel (à faire avant de vendre)

### 1. Stripe (paiements)
1. Compte sur **dashboard.stripe.com**.
2. Créez 2 **Produits/Prix** d'abonnement :
   - Essentiel 9,99 €/mois → copiez l'ID `prix_…` dans `STRIPE_PRICE_ESSENTIEL`
   - Pro 19,99 €/mois → `STRIPE_PRICE_PRO`
3. Collez `STRIPE_SECRET_KEY`.
4. Webhook : `stripe listen --forward-to localhost:3000/webhooks/stripe` puis
   mettez `STRIPE_WEBHOOK_SECRET` (= `whsec_…`) dans `.env`.
   (En production : endpoint webhook → votre domaine + `/webhooks/stripe`.)

### 2. Emails réels
- Compte **resend.com** → clé API → `RESEND_API_KEY`.
- Vérifiez votre domaine et mettez `EMAIL_FROM`.

### 3. Hébergement + domaine
- Hébergez sur Railway / Render / Fly.io / Vercel (Node). `BASE_URL` = votre domaine https.
- **Important :** remplacez `SESSION_SECRET` et **ne commitez jamais `.env`**.
- Changez `PORT` / `BASE_URL` selon l'hébergeur.

---

## 📁 Structure
| Fichier | Rôle |
|---|---|
| `server.js` | API : comptes, sessions (cookie signé), factures, relances, Stripe, webhook |
| `store.js` | Stockage JSON par utilisateur + formules (Découverte/Essentiel/Pro) + essai |
| `engine.js` | Moteur : import CSV, calcul de retard/niveau, génération des brouillons |
| `content.js` | Modèles de relance FR (tons × niveaux) |
| `email.js` | Envoi Resend (réel) ou outbox (simulation) |
| `public/` | Page publique (index.html) + espace de travail (app.html, app.js, style.css) |

## ⚠️ Limites de ce MVP (à durcir avant lancement)
- **Stockage JSON local** (`data/users.json`) : un seul fichier, pas adapté au
  multi-utilisateur à grande échelle → passer à une base (SQLite/Postgres).
- **Sécurité** : valider/limiter les entrées, ajouter la protection CSRF, limiter
  les tentatives de connexion, politique de mot de passe, RGPD (suppression des
  données personnelles d'un client à la demande).
- **Mode IA avancée** (rédaction par Claude) du prototype non repris ici — en V2.
- **Relances en réel** seulement avec clé Resend ; lien de paiement réel à brancher
  (Stripe Payment Link ou le lien de votre outil de facturation).

*MVP généré pour validation — les prix (9,99 / 19,99 €) et le positionnement
« relance IA diplomate » proviennent de `../fiche-validation-2026.md`.*
