---
id: payments
title: Encaisser des paiements
---
Le plus simple est un **lien de paiement Stripe** : pas de boutique à construire, Stripe gère la carte et vous verse l’argent.

1. Créez un compte gratuit sur [stripe.com](https://stripe.com) et ajoutez vos coordonnées bancaires.
2. Dans Stripe, ouvrez **Payment Links → New**, ajoutez ce que vous vendez (un acompte, une carte cadeau, une prestation) et son prix, puis copiez le lien.
3. Demandez à Claude « ajoute un bouton Payer avec ce lien » et collez le lien : il ajoute le bouton où vous voulez.

Stripe prend une commission par paiement (en France, 1,5 % + 0,25 € pour les cartes européennes) ; il n’y a pas d’abonnement.
