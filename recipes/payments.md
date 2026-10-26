---
id: payments
title: Take payments
when: they want to sell, take payments, deposits, sell gift cards, accept card payments online, a shop, a pay button
---
The simplest way is a **Stripe Payment Link**: no shop to build, Stripe handles the card and sends you the money.

1. Create a free account on [stripe.com](https://stripe.com) and add your bank details.
2. In Stripe open **Payment Links → New**, add what you sell (a deposit, a gift card, a service) and its price, then copy the link.
3. Ask Claude "add a Pay button with this link" and paste the link: it adds the button where you want it.

Stripe takes a fee per payment (in France, 1.5% + €0.25 for European cards); there's no monthly fee.
