import { api } from "./api";
import { mcp } from "./mcp";
import { passOk } from "./shot";
import { authorize, bearer, metadata, register, token, unauthorized } from "./oauth";
import { changePassword, login, logout, passwordRequired, setupNeeded, signedIn } from "./auth";
import { favicon, llms, renderPage, sitemap } from "./render";
import { messageMail, sendToOwner } from "./email";
import { draft, live, settings, sites, type Site } from "./store";
import { CHECK, type SiteDoc } from "./site";

export interface Env {
  DB: D1Database;
  IMAGES: KVNamespace;
  BROWSER?: Fetcher;
  ASSETS: Fetcher;
  PASSWORD?: string;
  LOGIN_LIMIT?: RateLimit;
  CONTACT_LIMIT?: RateLimit;
  RESEND_BASE?: string;
}

const html = (body: string, headers: Record<string, string> = {}, status = 200) =>
  new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", ...headers } });

const page = (status: number, title: string, text: string) =>
  html(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title>` +
      `<body style="font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;color:#2a2421;background:#f6f1ec"><h1 style="font-size:1.4rem">${title}</h1><p>${text}</p></body></html>`,
    { "cache-control": "no-store" },
    status,
  );

// The published site runs no script but its own contact form (by nonce) and, when connected,
// Dozokit Analytics. A custom block can embed a map, a video or a booking page, nothing else.
function csp(nonce: string, analytics?: string) {
  const a = analytics ? ` ${analytics}` : "";
  return [
    "default-src 'self'",
    `script-src 'nonce-${nonce}'${a}`,
    `connect-src 'self'${a}`,
    "style-src 'unsafe-inline' https://fonts.bunny.net",
    "font-src https://fonts.bunny.net",
    "img-src 'self' https: data:",
    "frame-src https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com https://cal.com https://www.google.com https://maps.google.com https://www.instagram.com",
    "form-action 'self'",
    "base-uri 'none'",
    "object-src 'none'",
  ].join("; ");
}

async function contact(req: Request, env: Env, ctx: ExecutionContext, site: Site, home: string) {
  const ip = req.headers.get("cf-connecting-ip") ?? "local";
  const json = (req.headers.get("accept") ?? "").includes("json");
  const answer = (ok: boolean, status = ok ? 200 : 400) =>
    json ? Response.json({ ok }, { status }) : Response.redirect(new URL(`${home}?sent=${ok ? 1 : 0}`, req.url).href, 303);
  if (env.CONTACT_LIMIT && !(await env.CONTACT_LIMIT.limit({ key: ip })).success) return answer(false, 429);
  const f = await req.formData().catch(() => null);
  const get = (k: string, max: number) => String(f?.get(k) ?? "").trim().slice(0, max);
  // The hidden "website" field is filled by robots only.
  if (!f || get("website", 1)) return answer(true);
  const [name, email, phone, body, lang] = [get("name", 100), get("email", 200), get("phone", 40), get("message", 4000), get("lang", 8)];
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !body) return answer(false);
  await env.DB.prepare("insert into messages (site_id, name, email, phone, body, lang, created_at) values (?, ?, ?, ?, ?, ?, ?)")
    .bind(site.id, name, email, phone || null, body, lang || null, Date.now())
    .run();
  const doc = (await live(env, site))?.doc;
  ctx.waitUntil(sendToOwner(env, messageMail(doc?.business.name ?? new URL(req.url).host, { name, email, phone, body })));
  return answer(true);
}

// Which site a visitor asked for. A site with its own domain answers there; on the builder's own
// address the first site answers at the root and the others at /<slug>/. A site that has a domain
// sends its old address there for good, so search engines move with it.
async function resolve(env: Env, url: URL): Promise<{ site: Site; base: string; rest: string } | Response | null> {
  const all = await sites(env);
  const own = all.find((s) => s.domain === url.host);
  if (own) return { site: own, base: "", rest: url.pathname };
  const m = url.pathname.match(/^\/([a-z0-9-]{3,40})(\/.*)?$/);
  const bySlug = m ? all.find((s, i) => i > 0 && s.slug === m[1]) : undefined;
  const hit = bySlug ?? all[0];
  if (!hit) return null;
  const rest = bySlug ? (m![2] ?? "/") : url.pathname;
  if (bySlug && !m![2]) return Response.redirect(`${url.origin}/${bySlug.slug}/`, 301);
  if (hit.domain) return Response.redirect(`https://${hit.domain}${rest}${url.search}`, 301);
  return { site: hit, base: bySlug ? `/${bySlug.slug}` : "", rest };
}

const photoAlts = async (env: Env, siteId: number) =>
  Object.fromEntries((await env.DB.prepare("select id, alt from photos where site_id = ? and alt != ''").bind(siteId).all<{ id: string; alt: string }>()).results.map((r) => [r.id, r.alt]));

const SITE_FILES = /\/(robots\.txt|sitemap\.xml|llms\.txt|favicon\.svg|favicon\.ico)$/;


function langOf(doc: SiteDoc, path: string) {
  if (path === "/") return doc.langs[0];
  const m = path.match(/^\/([a-z]{2}(?:-[a-z]{2})?)\/?$/);
  return m && doc.langs.includes(m[1]) && m[1] !== doc.langs[0] ? m[1] : null;
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    // Chat apps (Claude, ChatGPT): OAuth discovery, registration, approval, tokens, then MCP.
    if (path.startsWith("/.well-known/oauth-")) return metadata(url);
    if (req.method === "OPTIONS" && (path === "/mcp" || path.startsWith("/oauth/"))) {
      return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type, mcp-protocol-version, mcp-session-id", "access-control-allow-methods": "GET, POST, OPTIONS" } });
    }
    if (path === "/oauth/register" && req.method === "POST") return register(req, env);
    if (path === "/oauth/token" && req.method === "POST") return token(req, env);
    if (path === "/oauth/authorize") return authorize(req, env, url);
    if (path === "/mcp") {
      const app = await bearer(req, env);
      if (!app) return unauthorized(url);
      return mcp(req, { env, origin: url.origin, app: app.name });
    }

    if (path.startsWith("/api/")) {
      // Writes only from the admin page itself, on top of the SameSite cookie.
      const origin = req.headers.get("origin");
      if (req.method !== "GET" && origin && origin !== url.origin) {
        return Response.json({ error: "Not allowed from another site." }, { status: 403 });
      }
      if (path === "/api/login" && req.method === "POST") return login(req, env);
      if (path === "/api/logout" && req.method === "POST") return logout(req);
      if (path === "/api/me") {
        return Response.json({ signedIn: await signedIn(req, env), passwordRequired: passwordRequired(env), setupNeeded: setupNeeded(req, env) });
      }
      const setup = setupNeeded(req, env);
      if (setup) return Response.json({ error: setup }, { status: 503 });
      if (!(await signedIn(req, env))) return Response.json({ error: "Sign in to see this." }, { status: 401 });
      if (path === "/api/password" && req.method === "POST") return changePassword(req, env);
      try {
        return await api(req, env, url);
      } catch (err) {
        console.error(err);
        return Response.json({ error: "That failed. The details are in the Worker logs." }, { status: 500 });
      }
    }

    // The editor's preview: a site's draft, drawn with an address on every editable text.
    if (path === "/admin/preview") {
      // The owner, or the screenshot browser with a one-off pass from a chat app's preview.
      const pass = await passOk(env, url.searchParams.get("pass"));
      if (!pass && !(await signedIn(req, env))) return page(401, "Sign in first", "Open /admin and sign in.");
      const id = Number(url.searchParams.get("site"));
      const d = id ? await draft(env, id) : null;
      if (!d) return page(404, "No site yet", "Create it from the admin page.");
      const lang = d.doc.langs.includes(url.searchParams.get("lang") ?? "") ? url.searchParams.get("lang")! : d.doc.langs[0];
      const nonce = crypto.randomUUID();
      const alts = await photoAlts(env, id);
      const body = pass ? renderPage(d.doc, lang, { origin: url.origin, nonce, alts }) : renderPage(d.doc, lang, { origin: url.origin, edit: true, nonce, alts }).replace("</body>", `<script nonce="${nonce}" src="/editor.js"></script></body>`);
      return html(body, { "cache-control": "no-store", "content-security-policy": csp(nonce).replace("script-src", "script-src 'self'"), "x-frame-options": "SAMEORIGIN" });
    }

    // The admin page is a single page app: every address under /admin gets its index.html.
    if (path === "/admin" || path.startsWith("/admin/")) {
      const index = await env.ASSETS.fetch(new URL("/", url));
      return new Response(index.body, {
        headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": "frame-ancestors 'none'", "x-frame-options": "DENY" },
      });
    }

    // The test request Settings sends through a new domain: echoes its nonce.
    if (path === CHECK) return new Response("Dozokit Sites", { headers: { "x-dozokit-sites": url.searchParams.get("n") ?? "", "cache-control": "no-store" } });

    if (path.startsWith("/img/")) {
      const id = decodeURIComponent(path.slice(5));
      const { value, metadata } = id ? await env.IMAGES.getWithMetadata<{ type: string }>(id, "arrayBuffer") : { value: null, metadata: null };
      if (!value) return new Response("Not found", { status: 404 });
      return new Response(value, { headers: { "content-type": metadata?.type ?? "image/webp", "cache-control": "public, max-age=31536000, immutable" } });
    }

    // The builder's own files (and, in development, Vite's).
    if (/[.@]/.test(path.slice(1)) && !SITE_FILES.test(path)) return env.ASSETS.fetch(req);

    // robots.txt at the root of an address lists the sitemap of every site served there.
    if (path === "/robots.txt") {
      const every = await sites(env);
      const all = every.filter((s) => s.published);
      const own = all.find((s) => s.domain === url.host);
      const maps = own ? [`${url.origin}/sitemap.xml`] : all.filter((s) => !s.domain).map((s) => `${url.origin}${s.id === every[0].id ? "" : `/${s.slug}`}/sitemap.xml`);
      return new Response(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n${maps.map((m) => `Sitemap: ${m}`).join("\n")}\n`, { headers: { "content-type": "text/plain" } });
    }

    const hit = await resolve(env, url);
    if (hit instanceof Response) return hit;
    if (!hit) return page(200, "Coming soon", "This website is being built.");
    const { site, base, rest } = hit;
    if (rest === "/contact" && req.method === "POST") return contact(req, env, ctx, site, `${base}/`);
    const pub = await live(env, site);
    if (!pub) return page(200, "Coming soon", "This website is being built.");
    const origin = url.origin + base;
    if (rest === "/sitemap.xml") return new Response(sitemap(pub.doc, origin, new Date(pub.at).toISOString().slice(0, 10)), { headers: { "content-type": "application/xml" } });
    // /favicon.ico is what browsers ask for by themselves: the owner's icon when there is one.
    if (rest === "/favicon.ico" && pub.doc.business.favicon) return Response.redirect(`${url.origin}/img/${encodeURIComponent(pub.doc.business.favicon)}`, 302);
    if (rest === "/favicon.svg" || rest === "/favicon.ico") return new Response(favicon(pub.doc), { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=3600" } });
    if (rest === "/llms.txt") return new Response(llms(pub.doc, origin), { headers: { "content-type": "text/plain; charset=utf-8" } });

    const lang = langOf(pub.doc, rest);
    if (!lang) return page(404, "This page doesn't exist", `<a href="${base}/">Go to the home page</a>.`);
    const s = await settings(env);
    const analytics = s.analytics_url && site.analytics_site ? { url: s.analytics_url, site: site.analytics_site } : undefined;
    const nonce = crypto.randomUUID();
    const alts = await photoAlts(env, site.id);
    return html(renderPage(pub.doc, lang, { origin, base, analytics, nonce, alts }), {
      "content-security-policy": csp(nonce, analytics?.url),
      "cache-control": "public, max-age=60",
    });
  },
} satisfies ExportedHandler<Env>;
