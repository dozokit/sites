import type { Env } from "./index";
import { paths, renderPage } from "./render";
import type { SiteDoc } from "./site";

// Settings shared by every site in this builder.
export type Settings = Partial<Record<"analytics_url" | "notify_to" | "email_last" | "resend_client" | "resend_token" | "resend_pkce" | "cloudflare_token" | "cloudflare_account", string>>;

export type Site = { id: number; slug: string; domain: string | null; published: number | null; analytics_site: string | null; created_at: number };

// The public pages read these on every visit, so each location keeps them for half a minute.
// The builder always reads fresh (fresh = true): its next request may run in another copy of the
// Worker, whose memory doesn't know what this one just wrote.
const TTL = 30_000;
let settingsCache: { value: Settings; at: number } | null = null;
let sitesCache: { value: Site[]; at: number } | null = null;
const liveCache = new Map<number, { value: { doc: SiteDoc; at: number } | null; at: number }>();

export async function settings(env: Env, fresh = false): Promise<Settings> {
  if (!fresh && settingsCache && Date.now() - settingsCache.at < TTL) return settingsCache.value;
  const { results } = await env.DB.prepare("select key, value from settings").all<{ key: keyof Settings; value: string }>();
  settingsCache = { value: Object.fromEntries(results.map((r) => [r.key, r.value])), at: Date.now() };
  return settingsCache.value;
}

export async function setSetting(env: Env, key: keyof Settings, value: string | null) {
  if (value === null) await env.DB.prepare("delete from settings where key = ?").bind(key).run();
  else await env.DB.prepare("insert or replace into settings (key, value) values (?, ?)").bind(key, value).run();
  forget();
}

export function forget() {
  settingsCache = null;
  sitesCache = null;
  liveCache.clear();
}

export async function sites(env: Env, fresh = false): Promise<Site[]> {
  if (!fresh && sitesCache && Date.now() - sitesCache.at < TTL) return sitesCache.value;
  sitesCache = { value: (await env.DB.prepare("select * from sites order by id").all<Site>()).results, at: Date.now() };
  return sitesCache.value;
}

export async function site(env: Env, id: number) {
  return env.DB.prepare("select * from sites where id = ?").bind(id).first<Site>();
}

export async function updateSite(env: Env, id: number, fields: Partial<Pick<Site, "domain" | "published" | "analytics_site" | "slug">>) {
  const keys = Object.keys(fields) as (keyof typeof fields)[];
  if (!keys.length) return;
  await env.DB.prepare(`update sites set ${keys.map((k) => `${k} = ?`).join(", ")} where id = ?`)
    .bind(...keys.map((k) => fields[k] ?? null), id)
    .run();
  forget();
}

// Addresses that belong to the builder or to a site's language pages, so no site can take them.
const RESERVED = new Set(["admin", "api", "img", "contact", "assets", "editor", "robots", "sitemap", "favicon", "well-known", "site", "blog", "legal", "privacy", "cookies", "up"]);

export async function newSite(env: Env, name: string) {
  const base = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "site";
  const taken = new Set((await sites(env, true)).map((s) => s.slug));
  let slug = base.length < 3 || RESERVED.has(base) ? `${base}-site` : base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  const r = await env.DB.prepare("insert into sites (slug, created_at) values (?, ?) returning *").bind(slug, Date.now()).first<Site>();
  forget();
  return r!;
}

export async function deleteSite(env: Env, id: number) {
  await env.DB.batch([
    env.DB.prepare("delete from versions where site_id = ?").bind(id),
    env.DB.prepare("delete from messages where site_id = ?").bind(id),
    env.DB.prepare("delete from pages where site_id = ?").bind(id),
    env.DB.prepare("update usage set site_id = null where site_id = ?").bind(id),
    env.DB.prepare("delete from sites where id = ?").bind(id),
  ]);
  forget();
}

export type Version = { id: number; site_id: number; doc: SiteDoc; note: string; via: string; usage_id: number | null; created_at: number };

const parse = (r: (Omit<Version, "doc"> & { doc: string }) | null): Version | null => (r ? { ...r, doc: JSON.parse(r.doc) } : null);

export async function draft(env: Env, siteId: number) {
  return parse(await env.DB.prepare("select * from versions where site_id = ? order by id desc limit 1").bind(siteId).first());
}

export async function version(env: Env, siteId: number, id: number) {
  return parse(await env.DB.prepare("select * from versions where site_id = ? and id = ?").bind(siteId, id).first());
}

// What visitors see: the published version, with when it was published for the sitemap.
export async function live(env: Env, s: Site) {
  const hit = liveCache.get(s.id);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  const v = s.published ? await version(env, s.id, s.published) : null;
  const value = v ? { doc: v.doc, at: v.created_at } : null;
  liveCache.set(s.id, { value, at: Date.now() });
  return value;
}

export async function save(env: Env, siteId: number, doc: SiteDoc, note: string, via: "owner" | "chat") {
  const r = await env.DB.prepare("insert into versions (site_id, doc, note, via, usage_id, created_at) values (?, ?, ?, ?, ?, ?) returning id")
    .bind(siteId, JSON.stringify(doc), note.slice(0, 300), via, null, Date.now())
    .first<{ id: number }>();
  return r!.id;
}

export const analyticsOf = (s: Settings, x: Site) => (s.analytics_url && x.analytics_site ? { url: s.analytics_url, site: x.analytics_site } : undefined);

export const photoAlts = async (env: Env, siteId: number) =>
  Object.fromEntries((await env.DB.prepare("select id, alt from photos where site_id = ? and alt != '' order by id").bind(siteId).all<{ id: string; alt: string }>()).results.map((r) => [r.id, r.alt]));

// Visitors' pages are drawn once, when the site is published, and kept in pages: drawing one on a
// fresh copy of the Worker takes most of the free plan's 10 ms of CPU. The address, the folder and
// the contact form's nonce change per visit, so the kept page holds these stand-ins for them.
const ORIGIN = "https://origin.dozokit.invalid";
const BASE = "/__dozokit_base__";
const NONCE = "__dozokit_nonce__";
const keyOf = (published: number, analytics: { url: string; site: string } | undefined, alts: Record<string, string>) => JSON.stringify([published, analytics ?? null, alts]);

// Runs in the Durable Object (shot.ts), which has the CPU time for it.
export async function drawPages(env: Env, siteId: number) {
  const x = await site(env, siteId);
  if (!x?.published) return;
  const [v, s, alts] = await Promise.all([version(env, siteId, x.published), settings(env, true), photoAlts(env, siteId)]);
  if (!v) return;
  const analytics = analyticsOf(s, x);
  const key = keyOf(x.published, analytics, alts);
  if ((await env.DB.prepare("select key from pages where site_id = ? limit 1").bind(siteId).first<{ key: string }>())?.key === key) return;
  const rows = v.doc.langs.flatMap((lang) =>
    [...paths(v.doc, lang), "legal", "privacy", "cookies"].map((at) => ({ path: `${lang}/${at}`, html: renderPage(v.doc, lang, { origin: ORIGIN + BASE, base: BASE, analytics, nonce: NONCE, alts }, at) })),
  );
  await env.DB.batch([
    env.DB.prepare("delete from pages where site_id = ?").bind(siteId),
    ...rows.filter((r) => r.html).map((r) => env.DB.prepare("insert into pages (site_id, path, key, html) values (?, ?, ?, ?)").bind(siteId, r.path, key, r.html)),
  ]);
}

// The kept page for this visit, filled in, or null when it was drawn from something else.
export async function keptPage(env: Env, x: Site, lang: string, at: string, v: { origin: string; base: string; nonce: string; analytics?: { url: string; site: string }; alts: Record<string, string> }) {
  const r = await env.DB.prepare("select key, html from pages where site_id = ? and path = ?").bind(x.id, `${lang}/${at}`).first<{ key: string; html: string }>();
  if (!r || r.key !== keyOf(x.published!, v.analytics, v.alts)) return null;
  return r.html.split(ORIGIN).join(v.origin).split(BASE).join(v.base).split(NONCE).join(v.nonce);
}
