---
id: own-domain
title: Use your own address (like martin-plomberie.fr)
when: they want their own domain name, a .com or .fr address, to change the workers.dev address, or ask how to buy a domain
---
Your site already works at its Dozokit Sites address. To put it on your own name:

**If you don't have a domain yet**: buy it on Cloudflare, at cost price with no markup (about $10 a year for a .com). In Cloudflare open **Workers & Pages → dozokit-sites → Domains → Buy a domain**: it's connected to Dozokit Sites by itself.

**If you bought it elsewhere** (OVH, GoDaddy, IONOS…): move its DNS to Cloudflare, it's free. In Cloudflare open **Domains → Onboard a domain**, type it, pick the **Free** plan. Cloudflare shows two "nameservers": paste them at your registrar where it says *nameservers* or *DNS servers*. It takes from a few minutes to a day.

**Then connect it**, in two steps:

1. In Cloudflare open **Workers & Pages → dozokit-sites → Domains** and add your domain as an existing domain (skip this if you bought it there). It works within a few minutes, with HTTPS.
2. Ask Claude to connect it to your site: it checks the domain works, then saves it. Or do it yourself in Dozokit Sites: the site's **Address** tab.

The site's old address then sends visitors to the new one.
