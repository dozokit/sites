import type { Env } from "./index";
import type { SiteDoc } from "./site";
import { draft } from "./store";

// Each site's photo library, like WordPress's media library: the owner's uploads, the photos read
// from their old site, and every photo the site uses, each with a description (its alt text).

export type Photo = { id: string; alt: string; type: string; bytes: number; source: string; created_at: number; used: boolean };

const ID = /^[\w-]{6,40}\.(jpeg|jpg|png|webp|avif|gif)$/;
const typeOf = (id: string) => `image/${id.split(".").pop()!.replace("jpg", "jpeg")}`;

// Every photo id a site's content points at: section and item images and the logo.
export function used(doc: SiteDoc) {
  const ids = new Set((JSON.stringify(doc).match(/"(?:image|logo)":"([^"/]+)"/g) ?? []).map((m) => m.split('":"')[1].slice(0, -1)));
  return [...ids].filter((id) => ID.test(id));
}

export async function remember(env: Env, siteId: number, ids: string[], source: "upload" | "website" | "page") {
  const ok = ids.filter((id) => ID.test(id));
  if (!ok.length) return;
  await env.DB.batch(ok.map((id) => env.DB.prepare("insert or ignore into photos (id, site_id, type, source, created_at) values (?, ?, ?, ?, ?)").bind(id, siteId, typeOf(id), source, Date.now())));
}

export async function library(env: Env, siteId: number): Promise<Photo[]> {
  const d = await draft(env, siteId);
  const inUse = new Set(d ? used(d.doc) : []);
  await remember(env, siteId, [...inUse], "page");
  const { results } = await env.DB.prepare("select * from photos where site_id = ? order by created_at desc").bind(siteId).all<Omit<Photo, "used">>();
  return results.map((p) => ({ ...p, used: inUse.has(p.id) }));
}

export async function upload(env: Env, siteId: number, req: Request) {
  const type = (req.headers.get("content-type") ?? "").split(";")[0];
  if (!/^image\/(webp|jpeg|png|avif)$/.test(type)) throw new Error("Send a JPG, PNG or WebP picture.");
  const data = await req.arrayBuffer();
  if (data.byteLength > 3_000_000) throw new Error("That picture is over 3 MB. A smaller one loads faster for visitors.");
  const id = `${crypto.randomUUID().slice(0, 12)}.${type.split("/")[1]}`;
  await env.IMAGES.put(id, data, { metadata: { type } });
  await env.DB.prepare("insert into photos (id, site_id, type, bytes, source, created_at) values (?, ?, ?, ?, 'upload', ?)").bind(id, siteId, type, data.byteLength, Date.now()).run();
  return id;
}

export async function describe(env: Env, siteId: number, id: string, alt: string) {
  await env.DB.prepare("update photos set alt = ? where site_id = ? and id = ?").bind(alt.trim().slice(0, 250), siteId, id).run();
}

// A photo the page uses can't go: replace it first. The file itself is kept while an older version
// of any site still points at it, so going back to that version keeps its photos.
export async function remove(env: Env, siteId: number, id: string) {
  const d = await draft(env, siteId);
  if (d && used(d.doc).includes(id)) throw new Error("Your page uses this photo: replace it on the page first.");
  await env.DB.prepare("delete from photos where site_id = ? and id = ?").bind(siteId, id).run();
  const still = await env.DB.prepare("select 1 from versions where doc like ? limit 1").bind(`%${id}%`).first();
  const other = await env.DB.prepare("select 1 from photos where id = ? limit 1").bind(id).first();
  if (!still && !other) await env.IMAGES.delete(id);
}
