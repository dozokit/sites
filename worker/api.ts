import { AiError, get, set } from "./doc";
import type { Env } from "./index";
import { disconnectResend, finishResend, sendToOwner, startResend } from "./email";
import { describe, library, remove, upload } from "./photos";
import { RECIPES } from "./recipes";
import { langPath, llms, renderPage, sitemap } from "./render";
import { checks } from "./seo";
import { CHECK, LAYOUTS, problem, styleOf, type SiteDoc } from "./site";
import { deleteSite, draft, save, setSetting, settings, site, sites, updateSite, version, type Site } from "./store";
import { zip } from "./zip";

const json = (data: unknown, status = 200) => Response.json(data, { status });
const body = async (req: Request) => (await req.json().catch(() => ({}))) as Record<string, unknown>;

// This copy's release. Raise it with each tag on github.com/dozokit/sites and its CHANGELOG.md entry.
const VERSION = "0.1.1";

// Where a site can be visited: its domain, else the builder's address (the first site at the
// root, the others under /<slug>/).
const address = (s: Site, all: Site[], origin: string) => (s.domain ? `https://${s.domain}` : `${origin}${s.id === all[0]?.id ? "" : `/${s.slug}`}`);

async function state(env: Env, origin: string) {
  const [s, all, apps] = await Promise.all([
    settings(env, true),
    sites(env, true),
    // Chat apps with a live sign-in (a refresh token that hasn't expired), with when they last called.
    env.DB.prepare("select c.id, c.name, c.created_at, c.last_used from oauth_clients c where exists (select 1 from oauth_tokens t where t.client_id = c.id and t.kind = 'refresh' and t.expires_at > ?) order by c.created_at").bind(Date.now()).all<{ id: string; name: string; created_at: number; last_used: number | null }>(),
  ]);
  const rows = all.length
    ? (
        await env.DB.prepare(
          `select s.id,
            (select max(id) from versions where site_id = s.id) as draft,
            (select created_at from versions where site_id = s.id order by id desc limit 1) as updated_at,
            (select json_extract(doc, '$.business.name') from versions where site_id = s.id order by id desc limit 1) as name,
            (select count(*) from messages where site_id = s.id and read = 0) as unread
          from sites s order by s.id`,
        ).all<{ id: number; draft: number | null; updated_at: number | null; name: string | null; unread: number }>()
      ).results
    : [];
  return {
    chat_apps: apps.results,
    analytics_url: s.analytics_url ?? "",
    email: { connected: Boolean(s.resend_token), to: s.notify_to ?? "", last: s.email_last ?? null },
    sites: all
      .map((x) => ({ x, r: rows.find((r) => r.id === x.id) }))
      .filter(({ r }) => r?.draft)
      .map(({ x, r }) => ({ id: x.id, slug: x.slug, domain: x.domain, name: r!.name ?? x.slug, address: address(x, all, origin), published: x.published, draft: r!.draft, updated_at: r!.updated_at, unread: r!.unread })),
  };
}

async function detail(env: Env, origin: string, id: number) {
  const [x, all, d] = await Promise.all([site(env, id), sites(env, true), draft(env, id)]);
  if (!x || !d) return null;
  const unread = await env.DB.prepare("select count(*) as n from messages where site_id = ? and read = 0").bind(id).first<{ n: number }>();
  return { id, slug: x.slug, domain: x.domain, address: address(x, all, origin), doc: d.doc, draft: d.id, published: x.published, analytics_site: x.analytics_site ?? "", unread: unread?.n ?? 0 };
}

// What the owner types themself: no AI, so no cost.
async function text(req: Request, env: Env, id: number) {
  const b = await body(req);
  const d = await draft(env, id);
  if (!d || typeof b.path !== "string") return json({ error: "Nothing to change." }, 400);
  // A text that exists, or a photo slot (which may be empty), or the Google profile link.
  const ok = typeof get(d.doc, b.path) === "string" || /\.image$/.test(b.path) || b.path === "business.google_url";
  if (!ok) return json({ error: "Only a text or a photo can be changed this way." }, 400);
  const value = String(b.value ?? "").slice(0, 5000);
  if (/\.title$/.test(b.path) && !value.trim()) return json({ error: "A title can't be empty. To remove the whole section, ask Claude." }, 400);
  const doc = structuredClone(d.doc) as SiteDoc;
  set(doc, b.path, value);
  const why = problem(doc);
  if (why) return json({ error: why }, 400);
  const v = await save(env, id, doc, String(b.note ?? "Text changed by you").slice(0, 200), "owner");
  return { change: { id: v } };
}

// Undo removes the newest draft, unless visitors are seeing it: then the one before comes back as a new draft.
async function undo(env: Env, id: number) {
  const x = await site(env, id);
  const rows = (await env.DB.prepare("select id from versions where site_id = ? order by id desc limit 2").bind(id).all<{ id: number }>()).results;
  if (rows.length < 2) return json({ error: "There's nothing to undo." }, 400);
  if (rows[0].id === x?.published) await save(env, id, (await version(env, id, rows[1].id))!.doc, "Undo", "owner");
  else await env.DB.prepare("delete from versions where id = ?").bind(rows[0].id).run();
  return {};
}

async function history(env: Env, id: number) {
  const { results } = await env.DB.prepare(
    "select id, note, via, created_at from versions where site_id = ? order by id desc limit 100",
  ).bind(id).all();
  return json({ versions: results });
}

async function restore(env: Env, id: number, v: number) {
  const old = await version(env, id, v);
  if (!old) return json({ error: "That version is gone." }, 404);
  await save(env, id, old.doc, `Back to: ${old.note}`, "owner");
  return {};
}

async function publish(req: Request, env: Env, id: number, origin: string) {
  const d = await draft(env, id);
  if (!d) return json({ error: "Create your site first." }, 400);
  const list = checks(d.doc);
  if ((await body(req)).confirm !== true) return json({ checks: list });
  await updateSite(env, id, { published: d.id });
  return { checks: list, url: (await detail(env, origin, id))!.address + "/" };
}

// A domain is saved only once a test request through it reaches this Worker: the owner added it
// as a Custom domain on this Worker in Cloudflare.
async function setDomain(env: Env, id: number, raw: string) {
  const domain = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!domain) return updateSite(env, id, { domain: null });
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) throw new AiError("Type only the domain, like martin-plomberie.fr.");
  if ((await sites(env, true)).some((s) => s.domain === domain && s.id !== id)) throw new AiError("Another of your sites already uses that domain.");
  const nonce = crypto.randomUUID().slice(0, 8);
  const res = await fetch(`https://${domain}${CHECK}?n=${nonce}`, { redirect: "manual", signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!res) throw new AiError(`No answer from ${domain}. In Cloudflare, add it to this Worker under Settings → Domains & Routes → Custom domain; it can take a few minutes.`);
  if (res.headers.get("x-dozokit-sites") !== nonce) throw new AiError(`${domain} doesn't lead to this site builder yet. Add it to this Worker in Cloudflare (Settings → Domains & Routes → Custom domain).`);
  await updateSite(env, id, { domain });
}

async function download(env: Env, id: number, origin: string) {
  const [d, x] = await Promise.all([draft(env, id), detail(env, origin, id)]);
  if (!d || !x) return json({ error: "Create your site first." }, 400);
  const enc = new TextEncoder();
  const doc = d.doc;
  const root = x.address;
  const files = doc.langs.map((l) => ({ name: `${langPath(doc, l).slice(1)}index.html`, data: enc.encode(renderPage(doc, l, { origin: root, nonce: "zip" })) }));
  files.push({ name: "sitemap.xml", data: enc.encode(sitemap(doc, root, new Date(d.created_at).toISOString().slice(0, 10))) });
  files.push({ name: "llms.txt", data: enc.encode(llms(doc, root)) });
  files.push({ name: "robots.txt", data: enc.encode(`User-agent: *\nAllow: /\nSitemap: ${root}/sitemap.xml\n`) });
  const ids = new Set((JSON.stringify(doc).match(/"image":"([^"/]+)"/g) ?? []).map((m) => m.slice(9, -1)));
  for (const img of ids) {
    const v = await env.IMAGES.get(img, "arrayBuffer");
    if (v) files.push({ name: `img/${img}`, data: new Uint8Array(v) });
  }
  return new Response(zip(files), { headers: { "content-disposition": `attachment; filename="${x.slug}.zip"` } });
}

async function putSettings(req: Request, env: Env, origin: string) {
  const b = await body(req);
  if (typeof b.analytics_url === "string") {
    const u = b.analytics_url.trim();
    let o: string | null = null;
    try {
      o = u ? new URL(/^https?:/.test(u) ? u : `https://${u}`).origin : null;
    } catch {
      return json({ error: "Type your Dozokit Analytics address, like https://stats.example.com." }, 400);
    }
    await setSetting(env, "analytics_url", o);
  }
  if (typeof b.notify_to === "string") {
    const to = b.notify_to.trim();
    if (to && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return json({ error: "Type the email of your Resend account." }, 400);
    await setSetting(env, "notify_to", to || null);
    await setSetting(env, "email_last", null);
  }
  return json(await state(env, origin));
}

// A test email, so the owner sees it arrive before a customer writes.
async function testEmail(env: Env, origin: string) {
  const site = "your website";
  const status = await sendToOwner(env, { subject: `Test from ${site}`, text: "It works: each message sent through your website's contact form will arrive like this one." });
  if (status === "off") return json({ error: "Connect Resend and save your email first." }, 400);
  if (status !== "200") return json({ error: EMAIL_ERRORS[status] ?? `Resend answered ${status}.` }, 502);
  return json(await state(env, origin));
}

export const EMAIL_ERRORS: Record<string, string> = {
  "401": "Your Resend connection stopped working. Click Connect Resend again.",
  "403": "Resend only sends to the email of your Resend account until you add a domain there: type that email.",
  "422": "Resend didn't accept the email address. Check it's the one of your Resend account.",
  "429": "Too many emails at once for Resend's free plan. It sends again in a moment.",
  unreachable: "Resend didn't answer. Try again in a minute.",
};

async function version_() {
  let latest: string | null = null;
  try {
    const res = await fetch("https://api.github.com/repos/dozokit/sites/releases/latest", { headers: { "user-agent": "dozokit-sites", accept: "application/vnd.github+json" }, cf: { cacheTtl: 3600 } });
    const tag = res.ok ? String(((await res.json()) as { tag_name?: string }).tag_name ?? "").replace(/^v/, "") : "";
    const [a, b] = [tag, VERSION].map((v) => v.split(".").map(Number));
    const i = a.findIndex((n, k) => n !== b[k]);
    if (/^\d+\.\d+\.\d+$/.test(tag) && i !== -1 && a[i] > b[i]) latest = tag;
  } catch {}
  return json({ version: VERSION, latest });
}

export async function api(req: Request, env: Env, url: URL): Promise<Response> {
  const route = `${req.method} ${url.pathname.slice(4)}`;
  const o = url.origin;
  try {
    switch (route) {
      case "GET /state": return json(await state(env, o));
      case "GET /version": return version_();
      case "GET /styles": return json(Object.entries(LAYOUTS).map(([id, l]) => ({ id, ...l })));
      case "GET /recipes": return json(RECIPES.map(({ id, title, body }) => ({ id, title, body })));
      case "PUT /settings": return putSettings(req, env, o);
      case "POST /email/test": return testEmail(env, o);
      case "POST /resend/start": return json({ url: await startResend(env, o) });
      case "POST /resend/connect": {
        const b = await body(req);
        try {
          await finishResend(env, String(b.code ?? ""), String(b.state ?? ""));
        } catch (err) {
          return json({ error: (err as Error).message }, 502);
        }
        return json(await state(env, o));
      }
      case "DELETE /resend": await disconnectResend(env); return json(await state(env, o));
      default: {
        const app = route.match(/^DELETE \/chat-apps\/([\w-]+)$/)?.[1];
        if (!app) break;
        await env.DB.batch([
          env.DB.prepare("delete from oauth_tokens where client_id = ?").bind(app),
          env.DB.prepare("delete from oauth_codes where client_id = ?").bind(app),
          env.DB.prepare("delete from oauth_clients where id = ?").bind(app),
        ]);
        return json(await state(env, o));
      }
    }
    // Everything else is about one site: /sites/<id>/<what>.
    const m = route.match(/^(GET|POST|PUT|DELETE) \/sites\/(\d+)(?:\/([a-z]+))?(?:\/(\d+))?$/);
    if (!m) return json({ error: "Not found." }, 404);
    const [, method, sid, what = "", arg] = m;
    const id = Number(sid);
    if (!(await site(env, id))) return json({ error: "That site doesn't exist any more." }, 404);
    // Most changes answer with the site as it is now, plus what the change says.
    const after = async (extra: object | Response) => (extra instanceof Response ? extra : json({ ...(await detail(env, o, id)), ...extra, builder: await state(env, o) }));
    switch (`${method} ${what}`) {
      case "GET ": return json(await detail(env, o, id));
      case "PUT text": return after(await text(req, env, id));
      case "POST undo": return after(await undo(env, id));
      case "GET history": return history(env, id);
      case "POST restore": return after(await restore(env, id, Number(arg)));
      case "POST publish": return after(await publish(req, env, id, o));
      case "GET download": return download(env, id, o);
      case "GET photos": return json(await library(env, id));
      case "POST photos": {
        try {
          const pid = await upload(env, id, req);
          return json({ id: pid, photos: await library(env, id) });
        } catch (err) {
          return json({ error: (err as Error).message }, 400);
        }
      }
      case "PUT photo": {
        const b = await body(req);
        await describe(env, id, String(b.id ?? ""), String(b.alt ?? ""));
        return json(await library(env, id));
      }
      case "DELETE photo": {
        try {
          await remove(env, id, String((await body(req)).id ?? ""));
        } catch (err) {
          return json({ error: (err as Error).message }, 400);
        }
        return json(await library(env, id));
      }
      case "GET messages": return json((await env.DB.prepare("select * from messages where site_id = ? order by id desc limit 200").bind(id).all()).results);
      case "POST read": await env.DB.prepare("update messages set read = 1 where site_id = ? and read = 0").bind(id).run(); return after({});
      case "PUT style": {
        // A new look without the AI: free, saved as a version like any change.
        const d = await draft(env, id);
        const style = styleOf((await body(req)).style);
        if (!d || !style) return json({ error: "Pick one of the styles." }, 400);
        await save(env, id, { ...d.doc, theme: style }, `Style: ${style.layout}`, "owner");
        return after({});
      }
      case "PUT settings": {
        const b = await body(req);
        if (typeof b.analytics_site === "string") await updateSite(env, id, { analytics_site: b.analytics_site.trim() || null });
        if (typeof b.domain === "string") await setDomain(env, id, b.domain);
        return after({});
      }
      case "DELETE ": {
        const b = await body(req);
        const d = await draft(env, id);
        if (String(b.confirm ?? "").trim() !== d?.doc.business.name) return json({ error: "Type the site's name exactly to delete it." }, 400);
        await deleteSite(env, id);
        return json(await state(env, o));
      }
    }
    return json({ error: "Not found." }, 404);
  } catch (err) {
    if (err instanceof AiError) return json({ error: err.message }, 422);
    throw err;
  }
}
