import type { Env } from "./index";
import type { SiteDoc } from "./site";
import { draft } from "./store";

// Each site's photo library, like WordPress's media library: the owner's uploads, the photos read
// from their old site, and every photo the site uses, each with a description (its alt text).

export type Photo = { id: string; alt: string; type: string; bytes: number; source: string; created_at: number; used: boolean };

const ID = /^[\w-]{6,40}\.(jpeg|jpg|png|webp|avif|gif|ico)$/;
const typeOf = (id: string) => `image/${id.split(".").pop()!.replace("jpg", "jpeg").replace("ico", "x-icon")}`;

// Every photo id a site's content points at: section and item images, the logo and the favicon.
export function used(doc: SiteDoc) {
  const ids = new Set((JSON.stringify(doc).match(/"(?:image|logo|favicon)":"([^"/]+)"/g) ?? []).map((m) => m.split('":"')[1].slice(0, -1)));
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

// A link the owner opens on their phone to add photos to one site without signing in there.
// Anyone with it can upload to that site for 30 minutes, nothing else.
export async function phonePass(env: Env, siteId: number) {
  const t = crypto.randomUUID();
  await env.IMAGES.put(`phone:${t}`, String(siteId), { expirationTtl: 1800 });
  return t;
}

export const phoneSite = async (env: Env, t: string) => Number(await env.IMAGES.get(`phone:${t}`)) || null;

// The phone's page: pick photos, each one made smaller on the phone before it goes up.
export function phonePage(name: string, fr: boolean) {
  const w = fr
    ? { title: `Ajouter des photos à ${name}`, pick: "Choisir des photos", sending: "Envoi", done: "photo(s) ajoutée(s). Elles sont dans l’onglet Photos sur l’ordinateur.", failed: "Une photo n’est pas passée :" }
    : { title: `Add photos to ${name}`, pick: "Choose photos", sending: "Sending", done: "photo(s) added. They're in the Photos tab on your computer.", failed: "A photo didn't go up:" };
  const esc = (x: string) => x.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<!doctype html><html lang="${fr ? "fr" : "en"}"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(w.title)}</title>
<body style="font:17px/1.5 system-ui,sans-serif;max-width:32rem;margin:10vh auto;padding:0 1rem;color:#2a2421;background:#f6f1ec"><h1 style="font-size:1.4rem">${esc(w.title)}</h1>
<label style="display:inline-block;padding:.8rem 1.2rem;border-radius:8px;background:#2a2421;color:#f6f1ec">${esc(w.pick)}<input id="f" type="file" accept="image/*" multiple hidden></label>
<p id="s" role="status"></p>
<script>
let n = 0;
f.onchange = async () => {
  for (const [i, file] of [...f.files].entries()) {
    s.textContent = ${JSON.stringify(w.sending)} + " " + (i + 1) + " / " + f.files.length + "…";
    try {
      const b = await createImageBitmap(file), k = Math.min(1, 1600 / b.width), c = document.createElement("canvas");
      c.width = Math.round(b.width * k); c.height = Math.round(b.height * k);
      c.getContext("2d").drawImage(b, 0, 0, c.width, c.height);
      const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.82));
      const r = await fetch(location.pathname, { method: "POST", headers: { "content-type": "image/jpeg" }, body: blob });
      if (!r.ok) throw new Error((await r.json()).error);
      n++;
    } catch (e) {
      s.textContent = ${JSON.stringify(w.failed)} + " " + e.message; return;
    }
  }
  s.textContent = n + " " + ${JSON.stringify(w.done)};
};
</script></body></html>`;
}

