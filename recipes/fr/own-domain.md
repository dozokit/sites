---
id: own-domain
title: Utiliser votre propre adresse (comme martin-plomberie.fr)
---
Votre site marche déjà à son adresse Dozokit Sites. Pour le mettre à votre nom :

**Si vous n’avez pas encore de nom de domaine** : achetez-le chez Cloudflare, à prix coûtant, sans marge (environ 10 $ par an pour un .com). Dans Cloudflare, ouvrez **Workers & Pages → dozokit-sites → Domains → Buy a domain** : il est relié tout seul à Dozokit Sites.

**Si vous l’avez acheté ailleurs** (OVH, GoDaddy, IONOS…) : passez sa gestion (DNS) chez Cloudflare, c’est gratuit. Dans Cloudflare, ouvrez **Domains → Onboard a domain**, tapez-le, choisissez l’offre **Free**. Cloudflare affiche deux « nameservers » : collez-les chez votre registraire, là où c’est écrit *serveurs de noms* ou *serveurs DNS*. Cela prend de quelques minutes à une journée.

**Ensuite, reliez-le**, en deux étapes :

1. Dans Cloudflare, ouvrez **Workers & Pages → dozokit-sites → Domains** et ajoutez votre nom de domaine comme domaine existant (inutile si vous l’avez acheté là). Il marche en quelques minutes, en HTTPS.
2. Demandez à Claude de le relier à votre site : il vérifie que le nom de domaine marche, puis l’enregistre. Ou faites-le vous-même dans Dozokit Sites : l’onglet **Adresse** du site.

L’ancienne adresse du site renvoie ensuite les visiteurs vers la nouvelle.
