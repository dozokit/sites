# Dozokit Sites

A website builder that runs in your own Cloudflare account, designed with Claude. You connect Claude (or ChatGPT) to your builder once; it reads your current site, proposes a design, builds the page, looks at screenshots of it and fixes what's off. The AI work runs on your own chat plan, so the builder itself never calls an AI and costs nothing to run on Cloudflare's free plan. You change texts and photos yourself in the editor, for free, and publish when you like.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/dozokit/sites)

## Set it up in ten minutes

You need a free Cloudflare account, a GitHub (or GitLab) account and a Claude account.

1. **Click Deploy to Cloudflare** above and sign in to Cloudflare.
2. **Connect GitHub** when asked. Cloudflare copies this repository into your account; that copy is what it builds and deploys.
3. **Fill in the form.** Keep the names it suggests (`dozokit-sites`) unless they clash with something you already have, and type a **password of 12 characters or more**: it is the one you will sign in to your builder with.
4. **Click Create and deploy** and wait a minute or two. Cloudflare creates the Worker, its database, its photo store and the database's tables.
5. **Open your builder** at the address Cloudflare shows, something like `https://dozokit-sites.your-name.workers.dev/admin`, and sign in.
6. **Connect Claude**: in Claude, Settings → Connectors → Add custom connector, name it Dozokit Sites and paste the address the builder shows (it ends in `/mcp`). Claude opens a page on your builder to ask your permission: click Allow.
7. **Paste the prompt** the builder gives you into a new Claude chat. Your new site opens in the editor by itself once Claude has made it.

A few things you may want later:

- **Your own domain**, such as `martin-plomberie.fr`: the site's **Address** tab walks you through it, whether you need to buy one, have one elsewhere or have one on Cloudflare (in Cloudflare it's the Worker's **Domains** tab), then checks it and connects it. Claude can connect it too. Several sites can live in one builder, each on its own domain.
- **Messages from a contact form by email**, through your own free Resend account: Settings → Messages by email.
- **Visitor counts** with [Dozokit Analytics](https://github.com/dozokit/analytics): the site's Settings → Visitors.
- **Change the password**: Settings → Password. Forgot it? In Cloudflare, open the Worker, then Settings → Variables and Secrets, and edit `PASSWORD`.
- **Get updates**: the builder tells you when a newer version is out. [CHANGELOG.md](CHANGELOG.md) says what changed. Add the update button once, in Settings → Account → Updates: paste your copy's address, then Commit changes on GitHub. From then on, on GitHub, Actions → Update Dozokit Sites → Run workflow. It installs the latest release, once it checks the release is signed with Dozokit's release key (a wrong or missing signature stops it and changes nothing), and keeps your `wrangler.jsonc` and the `.github` folder. Or from a terminal, in a clone of your copy:
  ```bash
  tag=$(curl -s https://api.github.com/repos/dozokit/sites/releases/latest | grep -o '"tag_name": *"[^"]*"' | cut -d'"' -f4)
  git fetch https://github.com/dozokit/sites tag "$tag"
  git checkout "$tag" -- . ':!wrangler.jsonc' ':!.github'
  git commit -m "Update Dozokit Sites to $tag" && git push
  ```
  Cloudflare rebuilds and deploys within a couple of minutes, database changes included.

## How it works

- One Worker holds the builder (`/admin`), the connector for chat apps (`/mcp`, with its own OAuth sign-in) and every site. A site with its own domain answers there; on the Worker's address the first site answers at `/` and the others at `/<name>/`.
- Pages are rendered on the server from a small JSON document per site: no JavaScript for visitors except the contact form, SEO built in (titles, descriptions, `hreflang`, LocalBusiness and FAQ data, sitemap, `llms.txt`).
- Every change is a version: undo, history and restore in the editor.
- Claude can see what it makes: after each change it gets screenshots of the page on a desktop and a phone (Cloudflare's Browser Rendering, 10 minutes a day on the free plan) with warnings for unreadable text and other common faults.
- Photos live in Workers KV; texts, versions, messages and settings in D1.

## Run it locally

```bash
npm install
npm run db:migrate   # create the local D1 tables
cp .dev.vars.example .dev.vars   # then set a PASSWORD
npm run dev          # http://localhost:5192/admin
```

To connect Claude to a local builder, expose it with a tunnel (`cloudflared tunnel --url http://localhost:5192`) and use the tunnel's address followed by `/mcp`.

## Put it on Cloudflare by hand

```bash
npx wrangler d1 create dozokit-sites --binding DB --update-config   # adds the database id to wrangler.jsonc
npx wrangler kv namespace create IMAGES --update-config
npx wrangler secret put PASSWORD                                     # 12 characters or more
npm run deploy                                                       # build, migrate the database, deploy
```

## Licence

AGPL-3.0. Parts of the design guidance given to chat apps are adapted from the Hallmark design skill (MIT): see [NOTICE](NOTICE).
