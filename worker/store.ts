import type { Env } from "./index";
import type { SiteDoc } from "./site";

// Settings shared by every site in this builder.
export type Settings = Partial<Record<"analytics_url" | "notify_to" | "email_last" | "resend_client" | "resend_token" | "resend_pkce", string>>;

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
const RESERVED = new Set(["admin", "api", "img", "contact", "assets", "editor", "robots", "sitemap", "favicon", "well-known", "site"]);

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
