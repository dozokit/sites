import type { Env } from "./index";
import { brandSeen } from "./shot";

// Reads the site the owner points at (their old site, an article, a listing): its text, the
// phone and email in its links, its colours and logo, and its photos, which are copied into
// this builder so they keep working when the old site's links expire. Up to four more pages of
// the same site are read, contact and "about" pages first, since that's where addresses and
// opening hours usually are. Some sites refuse robots: the owner then types or pastes instead.

export type Read = { url: string; ok: boolean; text: string; why?: string };
export type Found = { pages: Read[]; text: string; phones: string[]; emails: string[]; colors: string[]; logo: string | null; favicon: string | null; photos: string[]; lang: string | null };

const UA = "Mozilla/5.0 (compatible; DozokitSites/1.0; +https://dozokit.com/sites)";
const get = (url: string, accept = "text/html") =>
  fetch(url, { headers: { "user-agent": UA, accept }, redirect: "follow", signal: AbortSignal.timeout(15_000) }).catch(() => null);

type Page = { lang: string | null; text: string; phones: Set<string>; emails: Set<string>; links: Set<string>; images: Map<string, number>; logo: string | null; icons: Map<string, number>; css: Set<string>; colors: Map<string, number> };

async function readOne(url: URL, base: URL): Promise<Page | null> {
  const res = await get(url.href);
  if (!res?.ok || !(res.headers.get("content-type") ?? "").includes("html")) return null;
  const p: Page = { lang: null, text: "", phones: new Set(), emails: new Set(), links: new Set(), images: new Map(), logo: null, icons: new Map(), css: new Set(), colors: new Map() };
  const parts: string[] = [];
  let skip = 0;
  const abs = (v: string | null) => {
    try {
      return v ? new URL(v, res.url).href : null;
    } catch {
      return null;
    }
  };
  const color = (v: string | null) => v && /^#[0-9a-f]{6}$/i.test(v.trim()) && p.colors.set(v.trim().toLowerCase(), (p.colors.get(v.trim().toLowerCase()) ?? 0) + 10);
  await new HTMLRewriter()
    .on("script, style, noscript, svg, iframe", {
      element(el) {
        skip++;
        el.onEndTag(() => void skip--);
      },
    })
    .on("html[lang]", { element: (el) => void (p.lang = (el.getAttribute("lang") ?? "").slice(0, 2).toLowerCase() || null) })
    .on("title", { text: (t) => void (t.text.trim() && parts.push(`Title: ${t.text.trim()}`)) })
    .on('meta[name="description"], meta[property="og:description"]', { element: (el) => void (el.getAttribute("content") && parts.push(`Description: ${el.getAttribute("content")}`)) })
    .on('meta[name="theme-color"]', { element: (el) => void color(el.getAttribute("content")) })
    .on('meta[property="og:image"]', { element: (el) => void (abs(el.getAttribute("content")) && p.images.set(abs(el.getAttribute("content"))!, 5)) })
    // The site's own icon: the largest one it declares (an Apple touch icon is usually 180 px).
    .on('link[rel~="icon"], link[rel="apple-touch-icon"]', {
      element(el) {
        const src = abs(el.getAttribute("href"));
        if (!src || /\.svg(\?|$)/i.test(src)) return;
        const size = Number((el.getAttribute("sizes") ?? "").match(/^(\d+)/)?.[1] ?? 0);
        p.icons.set(src, size || ((el.getAttribute("rel") ?? "").includes("apple") ? 180 : 32));
      },
    })
    .on('link[rel="stylesheet"]', { element: (el) => void (abs(el.getAttribute("href")) && !SHARED.test(el.getAttribute("href") ?? "") && p.css.size < 4 && p.css.add(abs(el.getAttribute("href"))!)) })
    .on('script[type="application/ld+json"]', { text: (t) => void (t.text.trim() && parts.push(`Data: ${t.text.trim()}`)) })
    .on("a[href]", {
      element(el) {
        const h = el.getAttribute("href") ?? "";
        if (h.startsWith("tel:")) p.phones.add(decodeURIComponent(h.slice(4)).trim());
        else if (h.startsWith("mailto:")) p.emails.add(decodeURIComponent(h.slice(7).split("?")[0]).trim());
        else {
          const u = abs(h);
          if (u && new URL(u).host === base.host) p.links.add(u.split("#")[0]);
        }
      },
    })
    .on("img", {
      element(el) {
        const src = abs(el.getAttribute("src") ?? el.getAttribute("data-src"));
        if (!src || !/^https:/.test(src) || /\.svg(\?|$)|pixel|spacer|icon|visa|mastercard|paypal/i.test(src)) return;
        const tag = `${el.getAttribute("alt") ?? ""} ${el.getAttribute("class") ?? ""} ${src}`.toLowerCase();
        if (!p.logo && /logo/.test(tag)) p.logo = src;
        else if (p.images.size < 40) p.images.set(src, (p.images.get(src) ?? 0) + 1);
      },
    })
    .on("[style]", { element: (el) => void tally(el.getAttribute("style") ?? "", p.colors, 3) })
    .on("style", { text: (t) => void tally(t.text, p.colors, 2) })
    .on('a[href="/"] img, a[href="./"] img, header img', {
      element(el) {
        const src = abs(el.getAttribute("src") ?? el.getAttribute("data-src"));
        if (!p.logo && src && /^https:/.test(src)) p.logo = src;
      },
    })
    .on("h1, h2, h3, h4, p, li, td, th, address, a, time, span, div", {
      text(t) {
        if (skip === 0 && t.text.trim()) parts.push(t.text.trim());
        if (t.lastInTextNode) parts.push("\n");
      },
    })
    .transform(res)
    .text();
  p.text = parts.join(" ").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").replace(/(.+\n)\1+/g, "$1").trim();
  return p;
}

// Every colour written in some CSS, as #rrggbb, counted with a weight.
function tally(css: string, into: Map<string, number>, weight: number) {
  for (const m of css.matchAll(/#[0-9a-f]{6}\b|rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/gi)) {
    const hex = m[1] ? "#" + [m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, "0")).join("") : m[0].toLowerCase();
    if (!SOCIAL.has(hex)) into.set(hex, (into.get(hex) ?? 0) + weight);
  }
}

// Colours that come with share buttons and icons, not with the business.
const SOCIAL = new Set(["#1877f2", "#3b5998", "#4267b2", "#1da1f2", "#0077b5", "#2867b2", "#e1306c", "#c13584", "#833ab4", "#fd1d1d", "#fcb045", "#fdf497", "#fd5949", "#d6249f", "#285aeb", "#25d366", "#ff0000", "#bd081c", "#e60023", "#1ab7ea", "#00aced", "#ff4500", "#6441a5", "#1db954", "#000000", "#ffffff"]);

// Shared files (frameworks, widgets, fonts) say nothing about the brand.
const SHARED = /font|widget|runtime|bootstrap|jquery|awesome|icons?\b|social|cookie|swiper|slick|animate|wp-includes|plugins\//i;

// The colours a site is painted with: the most used real colours (not grey), near-identical shades merged.
function brand(colors: Map<string, number>) {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  return [...colors.entries()]
    .filter(([h]) => {
      const [r, g, b] = rgb(h);
      return Math.max(r, g, b) - Math.min(r, g, b) > 40; // a real colour, not grey, white or black
    })
    .sort((a, b) => b[1] - a[1])
    .map(([h]) => h)
    .filter((h, i, all) => all.slice(0, i).every((o) => rgb(o).reduce((d, v, k) => d + Math.abs(v - rgb(h)[k]), 0) > 60))
    .slice(0, 5);
}

// Pictures go into this builder's own store: no hotlinking, nothing that breaks later.
// A favicon: small, and often in the .ico format, which the library keeps for this use only.
async function keepIcon(env: Env, src: string) {
  const res = await get(src, "image/*");
  const type = (res?.headers.get("content-type") ?? "").split(";")[0].trim().replace("image/vnd.microsoft.icon", "image/x-icon");
  if (!res?.ok || !/^image\/(png|jpeg|webp|gif|x-icon)$/.test(type)) return null;
  const data = await res.arrayBuffer();
  if (data.byteLength < 100 || data.byteLength > 500_000) return null;
  const id = `${crypto.randomUUID().slice(0, 12)}.${type === "image/x-icon" ? "ico" : type.split("/")[1]}`;
  await env.IMAGES.put(id, data, { metadata: { type } });
  return id;
}

async function keep(env: Env, src: string, isLogo = false) {
  const res = await get(src, "image/*");
  // Some servers say image/jpg, which isn't a real type: it's a JPEG.
  const type = (res?.headers.get("content-type") ?? "").split(";")[0].trim().replace("image/jpg", "image/jpeg");
  if (!res?.ok || !/^image\/(jpeg|png|webp|avif|gif)$/.test(type)) return null;
  const data = await res.arrayBuffer();
  if (data.byteLength < (isLogo ? 300 : 8_000) || data.byteLength > 3_000_000) return null; // icons (logos are small), or too heavy for a page
  const id = `${crypto.randomUUID().slice(0, 12)}.${type.split("/")[1]}`;
  await env.IMAGES.put(id, data, { metadata: { type } });
  return id;
}

export async function readSite(env: Env, raw: string): Promise<Found> {
  let start: URL;
  try {
    start = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return { pages: [{ url: raw, ok: false, text: "", why: "That isn't a web address." }], text: "", phones: [], emails: [], colors: [], logo: null, favicon: null, photos: [], lang: null };
  }
  const [first, seen] = await Promise.all([readOne(start, start), brandSeen(env, start.href)]);
  if (!first || first.text.length < 150) {
    return { pages: [{ url: start.href, ok: false, text: "", why: first ? "It shows almost no text to robots." : "It didn't answer." }], text: "", phones: [], emails: [], colors: [], logo: null, favicon: null, photos: [], lang: null };
  }
  // The pages most likely to hold the address, the hours and the prices, read in parallel.
  const rank = (u: string) => (/contact|acces|access|horaire|hours|about|propos|qui|tarif|price|prix|service/i.test(u) ? 0 : 1);
  const more = [...first.links].filter((u) => u !== start.href && u !== `${start.origin}/` && !/mentions|legal|cgv|privacy|cookie|\.(pdf|jpg|png)$/i.test(u)).sort((a, b) => rank(a) - rank(b)).slice(0, 4);
  const others = (await Promise.all(more.map(async (u) => ({ url: u, page: await readOne(new URL(u), start) })))).filter((o): o is { url: string; page: Page } => Boolean(o.page));
  const all = [first, ...others.map((o) => o.page)];

  const css = new Set(all.flatMap((p) => [...p.css]));
  const colors = new Map<string, number>(all.flatMap((p) => [...p.colors]));
  // What the browser saw (logo pixels, buttons) outweighs anything counted in the CSS.
  for (const [h, w] of seen?.colors ?? []) colors.set(h, (colors.get(h) ?? 0) + w * 1000);
  for (const sheet of [...css].slice(0, 3)) {
    const res = await get(sheet, "text/css");
    const text = res?.ok ? (await res.text()).slice(0, 400_000) : "";
    tally(text, colors, 1);
  }

  // The pictures used most across the pages first; at most twelve are copied.
  const score = new Map<string, number>();
  for (const p of all) for (const [src, n] of p.images) score.set(src, (score.get(src) ?? 0) + n);
  const logoSrc = seen?.logo ?? first.logo ?? all.find((p) => p.logo)?.logo ?? null;
  const srcs = [...score.entries()].filter(([s]) => s !== logoSrc).sort((a, b) => b[1] - a[1]).map(([s]) => s).slice(0, 16);
  const iconSrc = [...first.icons.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? `${new URL(start.href).origin}/favicon.ico`;
  const [logo, favicon, ...kept] = await Promise.all([logoSrc ? keep(env, logoSrc, true) : Promise.resolve(null), keepIcon(env, iconSrc), ...srcs.map((s) => keep(env, s))]);

  return {
    pages: [{ url: start.href, ok: true, text: first.text }, ...others.map((o) => ({ url: o.url, ok: true, text: o.page.text }))],
    text: [{ url: start.href, page: first }, ...others].map((o) => `From ${o.url}:\n${o.page.text.slice(0, 12_000)}`).join("\n\n").slice(0, 40_000),
    phones: [...new Set(all.flatMap((p) => [...p.phones]))].slice(0, 3),
    emails: [...new Set(all.flatMap((p) => [...p.emails]))].filter((e) => !/example|sentry|wix|domain/i.test(e)).slice(0, 3),
    colors: brand(colors),
    logo,
    favicon,
    photos: kept.filter((k): k is string => Boolean(k)).slice(0, 12),
    lang: first.lang,
  };
}
