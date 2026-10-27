import { FONTS, KINDS, newId, type Page, type Post, type SiteDoc } from "./site";

// The site document and the operations chat apps change it with.

export class AiError extends Error {}

export const SHAPE = `type SiteDoc = {
  langs: string[];                 // e.g. ["fr","en"]; the first is the main one
  business: { name: string; trade: string; town: string; address?: string; phone?: string; email?: string;
    hours?: { days: string; spec?: string; open: string; close: string }[];  // days as visitors read them, spec for Google ("Mo-Fr"), open/close "09:00"; a closed day has open "" and close ""
    google_url?: string; socials?: string[]; logo?: string; favicon?: string;  // logo and favicon: image ids, as read_website returns them
    legal?: { form?: string; number?: string; director?: string } };  // for the generated legal notice: legal form and capital, SIRET or company number, publication director; ask the owner, never invent
  theme: { layout?: "storefront" | "split" | "trade" | "editorial" | "soft" | "custom";
    palette: { paper: string; ink: string; accent: string; soft: string };  // #rrggbb; ink on paper and white on accent must stay readable (contrast 4.5:1)
    fonts: ${Object.keys(FONTS).map((f) => `"${f}"`).join(" | ")} | { heading: string; body: string };  // or any two families from fonts.bunny.net
    corners: "round" | "square";
    css?: string };  // optional: your own CSS on top of the layout (or on its own with "custom")
  content: { [lang: string]: { title: string; description: string; labels?: object; sections: Section[];  // the home page
    pages?: Page[];    // more pages, only when the owner wants them: each at /<slug> (or /<lang>/<slug>), in the menu
    posts?: Post[] } };  // the blog, newest first: the list at /blog, each post at /blog/<slug>
};
type Page = { slug: string;  // lowercase words joined by dashes, like "services"; not blog, legal, privacy, cookies or contact
  menu: string;              // its short name in the menu, like "Services"
  title: string; description: string;  // for Google, like the home page's
  sections: Section[] };     // the first section's title is the page's main heading
type Post = { slug: string; title: string; date: string;  // date like "2026-10-27"
  description: string; image?: string;
  body: string };            // Markdown: paragraphs, ## headings, - lists, **bold**, *italic*, [links](https://…)
// Every site also gets a legal notice, a privacy page and a cookie page (/legal, /privacy, /cookies),
// written by the builder from business and from what the site does: never write them yourself.
type Item = { title: string; text?: string; price?: string; image?: string };
type Section = { id: string; kind: ${KINDS.map((k) => `"${k}"`).join(" | ")}; title: string;
  text?: string;      // hero, about, contact
  form?: boolean;     // contact only: true adds a "Write to us" form and button
  button?: string;    // hero
  image?: string;     // hero, about: an image id or https URL given to you, never invented
  items?: Item[];     // services, prices, faq (title = question, text = answer), reviews (title = who, text = quote), gallery, hours (title = days, text = times in that language, empty when closed)
  html?: string;      // custom only: plain HTML, no script
  bare?: boolean;     // custom only: no wrapper or heading from the builder };`;

// Small slips that don't need a second call.
export function tidy(doc: SiteDoc, langs: string[]) {
  if (!doc || typeof doc !== "object") return doc;
  doc.langs = langs;
  for (const lang of langs) {
    const c = doc.content?.[lang];
    for (const list of [c?.sections, ...(Array.isArray(c?.pages) ? c.pages.map((p) => p?.sections) : [])]) {
      if (!Array.isArray(list)) continue;
      const seen = new Set<string>();
      for (const s of list) {
        if (!s.id || seen.has(s.id)) s.id = newId();
        seen.add(s.id);
        if ("items" in s && !Array.isArray(s.items)) (s as { items: unknown[] }).items = [];
      }
    }
  }
  return doc;
}

// An edit is a short list of operations on the document, not a new document: what the owner
// didn't point at can't change by accident.
// page: a page's slug, for a section on that page instead of the home page.
export type Op =
  | { op: "set"; path: string; value: unknown }
  | { op: "add_section"; lang: string; at: number; section: unknown; page?: string }
  | { op: "remove_section"; lang: string; id: string; page?: string }
  | { op: "move_section"; lang: string; id: string; to: number; page?: string }
  | { op: "add_page"; lang: string; at?: number; page: Page }
  | { op: "remove_page"; lang: string; slug: string }
  | { op: "add_post"; lang: string; post: Post }
  | { op: "remove_post"; lang: string; slug: string };

export function get(doc: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), doc);
}

// Paths may only go through objects and arrays that exist, and may not create new keys at the top
// of the document: an op can't add a "content.xx" language or a "__proto__".
export function set(doc: unknown, path: string, value: unknown) {
  const keys = path.split(".");
  if (keys.some((k) => k === "__proto__" || k === "constructor" || k === "prototype")) throw new AiError("That change points at something that isn't part of the site.");
  let o = doc as Record<string, unknown>;
  for (const k of keys.slice(0, -1)) {
    const next = o?.[k];
    if (!next || typeof next !== "object") throw new AiError(`"${path}" isn't part of the site.`);
    o = next as Record<string, unknown>;
  }
  const last = keys[keys.length - 1];
  if (Array.isArray(o)) {
    const i = Number(last);
    if (!Number.isInteger(i) || i < 0 || i > o.length) throw new AiError(`"${path}" isn't part of the site.`);
    if (value === null) o.splice(i, 1);
    else o[i] = value;
  } else o[last] = value;
}

export function apply(doc: SiteDoc, ops: Op[]): SiteDoc {
  const d = structuredClone(doc);
  for (const op of ops) {
    if (op.op === "set") {
      set(d, op.path, op.value);
      continue;
    }
    const c = d.content[op.lang];
    if (!c) throw new AiError("That change is for a language the site doesn't have.");
    if (op.op === "add_page") {
      const pages = (c.pages ??= []);
      pages.splice(Math.max(0, Math.min(op.at ?? pages.length, pages.length)), 0, { ...op.page, sections: (op.page?.sections ?? []).map((s) => ({ ...s, id: s.id || newId() })) });
      continue;
    }
    if (op.op === "remove_page") {
      c.pages = c.pages?.filter((p) => p.slug !== op.slug);
      continue;
    }
    // A new post goes first: the blog lists the newest first.
    if (op.op === "add_post") {
      c.posts = [op.post, ...(c.posts ?? []).filter((p) => p.slug !== op.post?.slug)];
      continue;
    }
    if (op.op === "remove_post") {
      c.posts = c.posts?.filter((p) => p.slug !== op.slug);
      continue;
    }
    const list = op.page ? c.pages?.find((p) => p.slug === op.page)?.sections : c.sections;
    if (!list) throw new AiError(`There's no ${op.lang} page "${op.page}".`);
    if (op.op === "add_section") list.splice(Math.max(0, Math.min(op.at, list.length)), 0, { id: newId(), ...(op.section as object) } as never);
    else if (op.op === "remove_section") {
      const i = list.findIndex((s) => s.id === op.id);
      if (i >= 0) list.splice(i, 1);
    }
    else if (op.op === "move_section") {
      const i = list.findIndex((s) => s.id === op.id);
      if (i >= 0) list.splice(Math.max(0, Math.min(op.to, list.length - 1)), 0, ...list.splice(i, 1));
    }
  }
  return d;
}
