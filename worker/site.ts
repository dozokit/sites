// The whole site as data: the AI writes this, the owner edits it, render.ts turns it into pages.
// Every text a visitor sees lives in `content[lang]`, so a language is one more copy of it.

// days is what visitors read ("Mon – Fri"); spec is the same days for Google ("Mo-Fr").
export type Hours = { days: string; spec?: string; open: string; close: string }[];

export interface Business {
  name: string;
  trade: string;
  town: string;
  address?: string;
  phone?: string;
  email?: string;
  hours?: Hours;
  google_url?: string; // the owner's Google Business Profile, for "Directions" and "Leave a review"
  logo?: string; // an image id
  socials?: string[];
}

export interface Theme {
  layout?: Layout | "custom"; // "custom": only the shared base, the rest is in css
  palette: { paper: string; ink: string; accent: string; soft: string };
  fonts: FontPair | { heading: string; body: string }; // a named pair, or any two families on fonts.bunny.net
  corners: "round" | "square";
  css?: string; // the chat's own design, on top of the layout (cleaned before it's served)
}

// Any family name fonts.bunny.net could serve: letters, digits and spaces.
const FAMILY = /^[A-Za-z0-9][A-Za-z0-9 ]{1,39}$/;
export const fontsOf = (f: Theme["fonts"]) => (typeof f === "string" ? FONTS[f] ?? FONTS.plain : f);
const fontsOk = (f: unknown) => (typeof f === "string" ? f in FONTS : Boolean(f && typeof f === "object" && FAMILY.test(String((f as { heading?: unknown }).heading)) && FAMILY.test(String((f as { body?: unknown }).body))));

// A chat app's CSS, made harmless: no other files (no @import, no url() but this site's own
// photos), no way out of the style element, no old script hooks. It can restyle anything else.
export function cleanCss(css: unknown) {
  if (typeof css !== "string" || !css.trim()) return undefined;
  return css
    .slice(0, 30_000)
    .replace(/</g, "") // CSS never needs one; without it nothing can close the style element
    .replace(/@import[^;]*;?/gi, "")
    .replace(/expression\s*\(|behavior\s*:|-moz-binding|javascript:/gi, "")
    .replace(/url\(\s*(['"]?)(?!\/img\/)[^)]*\)/gi, "none");
}

// Five page designs, each with its own colours and fonts to start from. The owner can keep the
// layout and use their own colours.
export const LAYOUTS = {
  storefront: { label: "Storefront", hint: "A big photo of your shop with your name on it", palette: { paper: "#ffffff", ink: "#1d2622", accent: "#0f6b5a", soft: "#eaf3f0" }, fonts: "bold" },
  split: { label: "Atelier", hint: "Headline beside an arched photo, for salons and makers", palette: { paper: "#fbf7f5", ink: "#2c2230", accent: "#8b3a5e", soft: "#f2e6ec" }, fonts: "elegant" },
  trade: { label: "Trade", hint: "Your phone number up front, for plumbers, gardeners, repairs", palette: { paper: "#ffffff", ink: "#13203b", accent: "#1f4fd6", soft: "#edf1fb" }, fonts: "modern" },
  editorial: { label: "Editorial", hint: "Large type and wide photos, calm and refined", palette: { paper: "#f6f5ef", ink: "#1b1b19", accent: "#6d4d26", soft: "#ebe9df" }, fonts: "classic" },
  soft: { label: "Friendly", hint: "Rounded colour panels, warm and welcoming", palette: { paper: "#fffdf7", ink: "#2c2a25", accent: "#2f7a4c", soft: "#fbefd5" }, fonts: "warm" },
} as const;
export type Layout = keyof typeof LAYOUTS;

const lum = (h: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => m - n);
  return (y + 0.05) / (x + 0.05);
};
const shade = (h: string, f: number) => "#" + [1, 3, 5].map((i) => Math.round(parseInt(h.slice(i, i + 2), 16) * f).toString(16).padStart(2, "0")).join("");
const mix = (a: string, b: string, t: number) => "#" + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, "0")).join("");
// Text on the accent colour (buttons, the call bar): white, or the page colour when white doesn't read.
export const onAccent = (p: { accent: string; paper: string; ink: string }) => (contrast("#ffffff", p.accent) >= 4.5 ? "#ffffff" : contrast(p.ink, p.accent) > contrast(p.paper, p.accent) ? p.ink : p.paper);

// A style from the start form or the style picker, checked: known layout and fonts, real colours,
// and an accent that reads on the page, with button text picked to read on it.
export function styleOf(raw: unknown): Theme | null {
  const r = raw as Partial<Theme> | null;
  if (!r || !r.layout || !(r.layout in LAYOUTS || r.layout === "custom")) return null;
  const base = LAYOUTS[r.layout === "custom" ? "editorial" : r.layout];
  const p = { ...base.palette, ...(r.palette ?? {}) };
  if (!Object.values(p).every((c) => COLOR.test(String(c)))) return null;
  if (contrast(p.ink, p.paper) < 7) p.ink = lum(p.paper) > 0.18 ? "#1d1a17" : "#fbf8f3";
  // The accent moves toward the ink until it reads on the page: darker on a light page, lighter on a dark one.
  for (let i = 0; i < 20 && contrast(p.accent, p.paper) < 4.5; i++) p.accent = mix(p.accent, p.ink, 0.15);
  // Body text sits on the soft colour too.
  for (let i = 0; i < 20 && contrast(p.ink, p.soft) < 4.5; i++) p.soft = mix(p.soft, p.paper, 0.2);
  return { layout: r.layout, palette: p, fonts: fontsOk(r.fonts) ? r.fonts! : base.fonts, corners: r.corners === "square" ? "square" : "round", ...(cleanCss(r.css) && { css: cleanCss(r.css) }) };
}

export type Item = { title: string; text?: string; price?: string; image?: string };

export type Section =
  | { id: string; kind: "hero"; title: string; text?: string; button?: string; image?: string }
  | { id: string; kind: "services" | "prices" | "faq" | "reviews"; title: string; items: Item[] }
  | { id: string; kind: "about"; title: string; text: string; image?: string }
  | { id: string; kind: "hours"; title: string }
  | { id: string; kind: "gallery"; title: string; items: Item[] }
  // form: a "Write to us" form and button, only when the owner asked for one.
  | { id: string; kind: "contact"; title: string; text?: string; form?: boolean }
  | { id: string; kind: "custom"; title: string; html: string; bare?: boolean };

export interface Content {
  title: string; // the <title>: trade and town first ("Plombier à Lille | Martin Plomberie")
  description: string; // meta description, under 160 characters
  sections: Section[];
}

export interface SiteDoc {
  langs: string[]; // the first one is served at /, the others at /<lang>/
  business: Business;
  theme: Theme;
  content: Record<string, Content>;
}

export const KINDS = ["hero", "services", "prices", "faq", "reviews", "about", "hours", "gallery", "contact", "custom"] as const;

// Font pairs served by fonts.bunny.net, which doesn't log visitors (unlike Google Fonts in the EU).
export const FONTS = {
  classic: { heading: "Fraunces", body: "Inter" },
  modern: { heading: "Space Grotesk", body: "Inter" },
  warm: { heading: "DM Serif Display", body: "Nunito Sans" },
  elegant: { heading: "Playfair Display", body: "Lato" },
  plain: { heading: "Inter", body: "Inter" },
  bold: { heading: "Archivo Black", body: "Archivo" },
} as const;
export type FontPair = keyof typeof FONTS;

export const COLOR = /^#[0-9a-f]{6}$/i;
const LANG = /^[a-z]{2}(-[a-z]{2})?$/;

// Checks a document from the AI or the editor before it is saved. Returns the first problem in
// plain words, or null. Unknown fields are dropped by `clean`, not reported.
export function problem(doc: unknown): string | null {
  const d = doc as SiteDoc;
  if (!d || typeof d !== "object") return "The site is empty.";
  if (!Array.isArray(d.langs) || !d.langs.length || !d.langs.every((l) => LANG.test(l))) return "The site needs at least one language, such as en or fr.";
  if (!d.business?.name?.trim()) return "The business needs a name.";
  if (!d.theme || !Object.values(d.theme.palette ?? {}).every((c) => COLOR.test(String(c)))) return "The colours have to be written like #1a2b3c.";
  if (!fontsOk(d.theme.fonts)) return `The fonts have to be one of ${Object.keys(FONTS).join(", ")}, or { "heading": family, "body": family } from fonts.bunny.net.`;
  for (const lang of d.langs) {
    const c = d.content?.[lang];
    if (!c) return `The ${lang} version is missing.`;
    if (!c.title?.trim()) return `The ${lang} version needs a page title.`;
    if (!Array.isArray(c.sections) || !c.sections.length) return `The ${lang} version has no section.`;
    const ids = new Set<string>();
    for (const s of c.sections) {
      if (!KINDS.includes(s.kind)) return `"${s.kind}" isn't a kind of section this builder knows.`;
      if (!s.id || ids.has(s.id)) return "Each section needs its own id.";
      if (!String(s.title ?? "").trim()) return `Each section needs a title (the ${s.kind} section in ${lang} has none).`;
      ids.add(s.id);
      if ("items" in s && !Array.isArray(s.items)) return `The ${s.kind} section needs a list.`;
    }
  }
  return null;
}

export const newId = () => crypto.randomUUID().slice(0, 8);

// The test path a new domain is checked with: the Worker answers it with the nonce it was sent.
export const CHECK = "/.well-known/dozokit-sites";

// A palette from a site's own colours: the main one for buttons, the second, darkened, for text,
// and a pale wash of the main one for alternate sections. styleOf then checks it reads well.
export function brandPalette(colors: string[]): Theme["palette"] | null {
  if (!colors.length) return null;
  const accent = colors[0];
  let ink = colors[1] ?? accent;
  for (let i = 0; i < 20 && contrast(ink, "#ffffff") < 10; i++) ink = shade(ink, 0.82);
  return { paper: "#ffffff", ink, accent, soft: mix(accent, "#ffffff", 0.9) };
}

// The brand's main colour worn two ways, each checked to read: on white, and on a near-black tinted with it.
export function brandPalettes(colors: string[]) {
  const light = brandPalette(colors);
  if (!light) return [];
  const a = colors[0];
  const dark = { paper: mix(a, "#141210", 0.88), ink: "#f6f1ea", accent: a, soft: mix(a, "#141210", 0.8) };
  return [
    { name: "light", palette: styleOf({ layout: "custom", palette: light })!.palette },
    { name: "dark", palette: styleOf({ layout: "custom", palette: dark })!.palette },
  ];
}
