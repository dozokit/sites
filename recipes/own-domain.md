---
id: own-domain
title: Use your own address (like martin-plomberie.fr)
when: they want their own domain name, a .com or .fr address, to change the workers.dev address, or ask how to buy a domain
---
Your site already works at your builder's address. To put it on your own name:

**If you don't have a domain yet**: buy it on Cloudflare, at cost price with no markup. In Cloudflare, open **Domain Registration → Register Domains**, search your name and buy it (about $10 a year for a .com).

**If you bought it elsewhere** (OVH, GoDaddy, IONOS…): move its DNS to Cloudflare, it's free. In Cloudflare click **Add a domain**, type it, pick the **Free** plan. Cloudflare shows two "nameservers": paste them at your registrar where it says *nameservers* or *DNS servers*. It takes from a few minutes to a day.

**Then connect it**, in two steps:

1. In Cloudflare open **Workers & Pages → your builder (dozokit-sites) → Settings → Domains & Routes → Add → Custom domain**, type your domain and save. It works within a few minutes, with HTTPS.
2. Ask Claude to connect it to your site: it checks the domain works, then saves it. Or do it yourself in your builder: the site's **Settings → Your domain**.

The site's old address then sends visitors to the new one.
