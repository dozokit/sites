import { AiError, apply, SHAPE, tidy, type Op } from "./doc";
import type { Env } from "./index";
import { setDomain } from "./api";
import { readSite } from "./import";
import { RECIPES } from "./recipes";
import { checks } from "./seo";
import { brandPalettes, LAYOUTS, problem, styleOf, type SiteDoc } from "./site";
import { REVIEW, warnings, type Low } from "./lint";
import { library, remember, used } from "./photos";
import { CONTRAST_PROBE, OVERLAP_PROBE, previewPass, sheet, shoot } from "./shot";
import { draft, newSite, save, site, sites, updateSite } from "./store";

// The builder as an MCP server, for chat apps the owner connected (Claude, ChatGPT). The chat's
// own model does the writing on the owner's plan; these tools read sites, save them under the
// same rules as the editor, and publish. Nothing here calls an AI, so nothing here costs.

// A tool can answer with images (what the chat should see) as well as text.
class Seen {
  constructor(readonly images: string[], readonly note: unknown) {}
}

type Tool = { name: string; description: string; inputSchema: object; run: (a: Record<string, unknown>, ctx: Ctx) => Promise<unknown> };
type Ctx = { env: Env; origin: string; app: string };

const editor = (origin: string, id: number) => `${origin}/admin#site/${id}`;
const address = async (env: Env, origin: string, id: number) => {
  const all = await sites(env, true);
  const s = all.find((x) => x.id === id)!;
  return s.domain ? `https://${s.domain}/` : `${origin}${s.id === all[0]?.id ? "" : `/${s.slug}`}/`;
};
const need = (v: unknown, what: string) => {
  if (v === undefined || v === null || v === "") throw new AiError(`${what} is missing.`);
  return v;
};
async function own(env: Env, id: unknown) {
  const n = Number(id);
  const d = n ? await draft(env, n) : null;
  if (!d) throw new AiError(`There's no site ${String(id)}. Call list_sites to see them.`);
  return { id: n, doc: d.doc };
}

const TOOLS: Tool[] = [
  {
    name: "get_writing_guide",
    description: "Read this first, before creating or changing a site: the site's JSON shape, the few rules the builder enforces, and how to work with the owner. Design and wording are yours and the owner's to decide.",
    inputSchema: { type: "object", properties: {} },
    run: async () => ({ how_to_work: PROCESS, anatomy: ANATOMY, avoid: OVERUSED, words: COPY, rules: HARD_RULES, design: DESIGN, shape: SHAPE, quick_start_presets: Object.entries(LAYOUTS).map(([id, l]) => ({ id, look: l.hint })) }),
  },
  {
    name: "list_sites",
    description: "The sites in the owner's builder, with their id, name, address and whether changes are waiting to be published.",
    inputSchema: { type: "object", properties: {} },
    run: async (_a, { env, origin }) => {
      const all = await sites(env, true);
      return Promise.all(
        all.map(async (s) => {
          const d = await draft(env, s.id);
          return { site_id: s.id, name: d?.doc.business.name, address: await address(env, origin, s.id), published: Boolean(s.published), unpublished_changes: s.published !== d?.id, editor: editor(origin, s.id) };
        }),
      );
    },
  },
  {
    name: "read_website",
    description: "Read the owner's existing website (and up to four of its pages): its text, phone and email, its colours, its logo and its photos, which are copied into the builder. The answer includes a picture of every photo, numbered, so you can see them. Use the facts and the photo ids in create_site. Free.",
    inputSchema: { type: "object", properties: { url: { type: "string", description: "The site's address" } }, required: ["url"] },
    run: async (a, { env, origin }) => {
      const f = await readSite(env, String(need(a.url, "The address")));
      if (!f.text) throw new AiError(`Couldn't read it: ${f.pages[0]?.why ?? "no answer"}. Ask the owner to paste the facts instead.`);
      const found = { pages: f.pages.map((p) => p.url), text: f.text.slice(0, 20_000), phones: f.phones, emails: f.emails, language: f.lang, brand_colours: f.colors, brand_palettes: brandPalettes(f.colors), logo: f.logo, photos: f.photos.map((id, i) => ({ number: i + 1, id, url: `${origin}/img/${id}` })) };
      // The photos come back as a picture too, numbered as in the list: chat apps rarely open them on their own.
      const ids = [...f.photos, ...(f.logo ? [f.logo] : [])].slice(0, 13);
      if (!ids.length) return found;
      const shot = await shoot(env, "", { width: 1200, height: Math.ceil(ids.length / 4) * 250 + 24, html: sheet(origin, ids) }).catch((e) => (console.log(`[mcp] photo sheet failed: ${String(e).slice(0, 200)}`), null));
      return shot ? new Seen([shot.image], { ...found, photo_sheet: "The picture shows every photo, numbered as in photos (the last one is the logo when there is one). Look at it before choosing photos." }) : found;
    },
  },
  {
    name: "create_site",
    description: "Create a new site from a full site JSON (see get_writing_guide). The owner's chosen layout and colours go in style. Returns its id and the editor link to show the owner. Not published yet.",
    inputSchema: {
      type: "object",
      properties: {
        site: { type: "object", description: "The whole site, in the shape from get_writing_guide" },
        style: { type: "object", description: '{ "layout": a layout or "custom", "palette": { paper, ink, accent, soft } (e.g. one of the brand_palettes from read_website), "fonts", "css" }: see design in get_writing_guide' },
        logo: { type: "string", description: "The logo id from read_website, if any" },
        photos: { type: "array", items: { type: "string" }, description: "All photo ids from read_website, so the unused ones stay in the site's photo library" },
      },
      required: ["site"],
    },
    run: async (a, { env, origin, app }) => {
      const raw = need(a.site, "The site") as SiteDoc;
      if ( typeof raw !== "object" || !raw.business || !raw.content) throw new AiError("The site needs langs, business, theme and content: see get_writing_guide.");
      const doc = tidy(structuredClone(raw), Array.isArray(raw.langs) ? raw.langs : []);
      // A chat designs its own page unless it picked a preset.
      // style and site.theme are merged, style winning: CSS sent in one isn't lost to the other.
      const style = styleOf({ layout: "custom", ...(doc.theme ?? {}), ...((a.style as object) ?? {}) });
      if (style) doc.theme = style;
      if (typeof a.logo === "string") doc.business.logo = a.logo;
      const why = problem(doc);
      if (why) throw new AiError(`That site can't be saved: ${why} Fix it and call create_site again.`);
      const row = await newSite(env, doc.business.name);
      await save(env, row.id, doc, `Made with ${app}`, "chat");
      await remember(env, row.id, [...used(doc), ...(Array.isArray(a.photos) ? a.photos.map(String) : [])], "page");
      const asked = ((a.style ?? raw.theme) as { palette?: unknown } | undefined)?.palette;
      return shown(env, origin, row.id, { site_id: row.id, ...changed(asked, doc.theme.palette), editor: editor(origin, row.id), will_be_at: await address(env, origin, row.id) });
    },
  },
  {
    name: "list_photos",
    description: "A site's photo library: every photo the owner uploaded, the ones read from their old site and the ones the page uses, with their description (alt text) and whether the page uses them. Look at them with view_photos.",
    inputSchema: { type: "object", properties: { site_id: { type: "number" } }, required: ["site_id"] },
    run: async (a, { env, origin }) => {
      const { id } = await own(env, a.site_id);
      return (await library(env, id)).map((p) => ({ id: p.id, url: `${origin}/img/${p.id}`, alt: p.alt, used_on_page: p.used, from: p.source }));
    },
  },
  {
    name: "view_photos",
    description: "See photos (from read_website or uploads) as one contact sheet, each with its number and id, before choosing which to use and where. Pass up to 12 ids.",
    inputSchema: { type: "object", properties: { ids: { type: "array", items: { type: "string" } } }, required: ["ids"] },
    run: async (a, { env, origin }) => {
      const ids = (Array.isArray(a.ids) ? a.ids : []).map(String).filter((id) => /^[\w-]{6,40}\.\w+$/.test(id)).slice(0, 12);
      if (!ids.length) throw new AiError("Pass the photo ids, as read_website returned them.");
      const rows = Math.ceil(ids.length / 4);
      return new Seen([(await shoot(env, "", { width: 1200, height: rows * 250 + 24, html: sheet(origin, ids) })).image], { photos: ids.map((id, i) => `${i + 1}. ${id}`) });
    },
  },
  {
    name: "preview_site",
    description: "See the site as visitors will, as a screenshot of the current draft: desktop or phone, the first screen or the whole page. Look after every create_site, edit_site or set_style, and keep improving until it looks designed, not templated.",
    inputSchema: {
      type: "object",
      properties: { site_id: { type: "number" }, device: { type: "string", enum: ["desktop", "phone"] }, whole_page: { type: "boolean" }, lang: { type: "string" } },
      required: ["site_id"],
    },
    run: async (a, { env, origin }) => {
      const { id, doc } = await own(env, a.site_id);
      const lang = doc.langs.includes(String(a.lang)) ? String(a.lang) : doc.langs[0];
      const phone = a.device === "phone";
      const shot = await look(env, origin, id, doc, { phone, whole: a.whole_page === true, lang });
      return new Seen([shot.image], { site_id: id, device: phone ? "phone" : "desktop", whole_page: a.whole_page === true, warnings: shot.warnings, review_yourself: REVIEW, editor: editor(origin, id) });
    },
  },
  {
    name: "get_site",
    description: "The current version of one site, as JSON, to read before changing it.",
    inputSchema: { type: "object", properties: { site_id: { type: "number" } }, required: ["site_id"] },
    run: async (a, { env }) => (await own(env, a.site_id)).doc,
  },
  {
    name: "edit_site",
    description: 'Change a site with a short list of operations, never a whole new site: { "op": "set", "path": "content.fr.sections.2.title", "value": ... }, { "op": "add_section", "lang", "at", "section" }, { "op": "remove_section", "lang", "id" }, { "op": "move_section", "lang", "id", "to" }. Change every language unless the owner named one. Every change is kept and can be undone in the editor.',
    inputSchema: {
      type: "object",
      properties: { site_id: { type: "number" }, ops: { type: "array", items: { type: "object" } }, note: { type: "string", description: "What changed, in a few words, for the history" } },
      required: ["site_id", "ops"],
    },
    run: async (a, { env, origin, app }) => {
      const { id, doc } = await own(env, a.site_id);
      const next = apply(doc, (Array.isArray(a.ops) ? a.ops : []) as Op[]);
      const why = problem(next);
      if (why) throw new AiError(`That change would break the site: ${why}`);
      await save(env, id, next, String(a.note ?? `Changed with ${app}`).slice(0, 200), "chat");
      return shown(env, origin, id, { ok: true, editor: editor(origin, id) });
    },
  },
  {
    name: "set_style",
    description: "Change how a site looks: a layout to start from (or \"custom\"), colours, any fonts from fonts.bunny.net, and your own CSS. Leave out what you keep. See design in get_writing_guide.",
    inputSchema: {
      type: "object",
      properties: {
        site_id: { type: "number" },
        layout: { type: "string", enum: [...Object.keys(LAYOUTS), "custom"] },
        palette: { type: "object", description: "{ paper, ink, accent, soft } as #rrggbb" },
        fonts: { description: 'A named pair, or { "heading": family, "body": family }' },
        css: { type: "string", description: "Your CSS for this site (replaces the previous one; empty string removes it)" },
      },
    },
    run: async (a, { env, origin }) => {
      const { id, doc } = await own(env, a.site_id);
      const t = doc.theme;
      const style = styleOf({ layout: a.layout ?? t.layout ?? "storefront", palette: a.palette ?? t.palette, fonts: a.fonts ?? t.fonts, corners: t.corners, css: a.css === undefined ? t.css : a.css } as never);
      if (!style) throw new AiError(`The layout has to be one of: ${[...Object.keys(LAYOUTS), "custom"].join(", ")}.`);
      await save(env, id, { ...doc, theme: style }, `Style: ${style.layout}`, "chat");
      return shown(env, origin, id, { ok: true, ...changed(a.palette, style.palette), editor: editor(origin, id) });
    },
  },
  {
    name: "publish",
    description: "Put the current version online, when the owner asks. Returns the live address and suggestions that would help Google (optional, never blocking).",
    inputSchema: { type: "object", properties: { site_id: { type: "number" } }, required: ["site_id"] },
    run: async (a, { env, origin }) => {
      const id = Number(a.site_id);
      const d = id ? await draft(env, id) : null;
      if (!d || !(await site(env, id))) throw new AiError(`There's no site ${String(a.site_id)}.`);
      await updateSite(env, id, { published: d.id });
      return { live_at: await address(env, origin, id), suggestions: checks(d.doc).filter((c) => !c.ok).map((c) => `${c.label}: ${c.fix}`) };
    },
  },
  {
    name: "set_domain",
    description: "Put a site on the owner's own domain (like martin-plomberie.fr), once they have added it in Cloudflare as a Custom domain of this builder's Worker (get_recipe own-domain has those steps). Checks the domain really reaches this builder before saving, and says what's missing if not. Pass an empty domain to go back to the builder's address.",
    inputSchema: { type: "object", properties: { site_id: { type: "number" }, domain: { type: "string", description: "Only the domain, like martin-plomberie.fr" } }, required: ["site_id", "domain"] },
    run: async (a, { env, origin }) => {
      const { id } = await own(env, a.site_id);
      await setDomain(env, id, String(a.domain ?? ""));
      const s = await site(env, id);
      return { site_id: id, address: await address(env, origin, id), published: Boolean(s?.published), next: s?.published ? "Tell the owner the address: the old one now sends visitors there." : "The address is ready; the site shows there once it's published (publish, when the owner says so)." };
    },
  },
  {
    name: "get_recipe",
    description: `The builder's ready-made answer for a common need. Always use it, word for word, instead of your own advice when the owner asks about one of these: ${RECIPES.map((r) => `${r.id} (${r.when})`).join("; ")}.`,
    inputSchema: { type: "object", properties: { id: { type: "string", enum: RECIPES.map((r) => r.id) } }, required: ["id"] },
    run: async (a) => {
      const r = RECIPES.find((x) => x.id === a.id);
      if (!r) throw new AiError(`Unknown recipe. Use one of: ${RECIPES.map((x) => x.id).join(", ")}.`);
      return { title: r.title, steps: r.body };
    },
  },
];

// How the chat works with the owner. No house style: the chat researches, proposes and asks.
// How the chat works with the owner: it proposes, the owner confirms. Adapted in part from the
// Hallmark design skill (MIT, Hallmark contributors).
// The colours the builder had to change so text reads, told back so the chat doesn't design around the old ones.
const changed = (asked: unknown, got: Record<string, string>) => {
  const a = (asked ?? {}) as Record<string, string>;
  const notes = Object.keys(got).filter((k) => a[k] && a[k].toLowerCase() !== got[k]).map((k) => `${k} ${a[k]} became ${got[k]} so it reads on the page`);
  return notes.length ? { colours_changed: notes } : {};
};

// A screenshot of the draft, with the warnings measured in the browser: the contrast of every
// text, overlapping headline lines and, on a desktop, whether the hero's action shows without scrolling.
async function look(env: Env, origin: string, id: number, doc: SiteDoc, o: { phone: boolean; whole: boolean; lang?: string }) {
  const url = `${origin}/admin/preview?site=${id}&lang=${o.lang ?? doc.langs[0]}&pass=${await previewPass(env)}`;
  const visible = o.phone ? "null" : `(() => { const b = document.querySelector("header.hero a.btn, header.hero .btn, .s--bare a"); return b ? b.getBoundingClientRect().bottom <= innerHeight : null })()`;
  const shot = await shoot(env, url, { width: o.phone ? 390 : 1280, height: o.phone ? 844 : 800, full: o.whole, probe: `({ actionVisible: ${visible}, lowContrast: ${CONTRAST_PROBE}, tightHeadline: ${OVERLAP_PROBE} })` });
  const p = (shot.answer ?? {}) as { actionVisible?: boolean | null; lowContrast?: Low[]; tightHeadline?: number | null };
  return { image: shot.image, warnings: warnings(doc, { actionVisible: p.actionVisible ?? undefined, lowContrast: p.lowContrast, tightHeadline: p.tightHeadline ?? undefined }) };
}

// After every change the chat app gets the page back as pictures (the whole page on a desktop,
// the first screen on a phone) with its warnings: many chat apps never call preview_site themselves.
async function shown(env: Env, origin: string, id: number, answer: object) {
  const doc = (await draft(env, id))!.doc;
  try {
    const [desk, phone] = await Promise.all([look(env, origin, id, doc, { phone: false, whole: true }), look(env, origin, id, doc, { phone: true, whole: false })]);
    return new Seen([desk.image, phone.image], { ...answer, screenshots: "The first picture is the whole page on a desktop, the second the first screen on a phone.", warnings: [...new Set([...desk.warnings, ...phone.warnings])], review_yourself: REVIEW, next: LOOKED });
  } catch {
    return { ...answer, next: LOOK };
  }
}

// Sent after every change: chat apps often don't know they can see the page.
const LOOKED = "Look at both pictures and the warnings, fix what's off (at most three rounds; preview_site shows other views), then show the owner the editor link. Publish only when they say so.";
const LOOK = "Now look at it: call preview_site (desktop, then phone, whole_page true). This builder takes the screenshot for you, so you can see the page; fix what it shows and what its warnings say before you show the owner the editor link. Publish only when they say so.";

const PROCESS = `Propose, don't interrogate. The owner should answer once, ideally with "go".
1. Gather before asking: read_website if they gave a site (or ask once whether they have one), list_photos and view_photos for an existing site (the owner may have uploaded photos to its library; use them before anything else), and look at at least five well-designed, recent sites of the same kind of business with your web search (or say you're working from what you know).
2. Send ONE message with your proposal, everything already decided, each item one line:
   - the job of the site (see anatomy) and the one action it drives,
   - the direction: a tone pushed to an extreme (editorial, luxury, rustic, playful, austere, bold…, never "clean and modern"), the vibe in a few words, the idea the page grows from,
   - fonts, which photos lead, and colours: when they have a logo or a site, the colours come from them. read_website returns brand_colours (the first one is from their logo or buttons) and brand_palettes, a light and a dark palette built on it and checked to read. Look at the logo with view_photos, start from one of those palettes and offer the other as an alternative; their main brand colour stays the accent. Never bring in a hue the brand doesn't have. Say which brand colour each one comes from. Choose your own colours only when they have none, and say so,
   - the sections in order, and the five sites you looked at with what you took from each,
   - if they have a site: what you carry over, and every page or section you would leave out, named, each with why in a few words (they can answer "keep it"),
   - then, as two alternatives in one line each, two other directions they could pick instead.
   Ask only for facts you could not find and the page needs to work (a phone number for a call button, opening hours): at most three questions, and none about taste. End with "Say go, or tell me what to change."
3. On "go" (or their changes), write it with create_site, your own CSS and your own HTML sections where the standard ones don't fit. Look at it with preview_site on desktop and phone, whole page; read the warnings it returns and answer its two review questions yourself; fix and look again (at most three rounds). Then show the owner the editor link, one screenshot's worth of what you made in words, and the list of what you left out of their old site and why.
4. Publish only when they say so.
If you have a design skill such as Hallmark, use it for the design: these rules are the minimum.`;

// Where the action lives and what the page is built around, by what visitors come to do.
// From real independent sites in each category (after Hallmark's anatomy).
const ANATOMY = {
  book: "Restaurants, salons, clinics, classes. The booking (or Call to book) in the nav and the hero, repeated beside the menu or the services; the room or the food in large photographs with little text; the menu or price list as rows with prices; hours and address as their own section; ends with hours, address and the booking again.",
  visit: "Shops, bakeries, galleries, venues. Today's hours and the address in the hero or the nav; what's in now as the lead picture; the range as a grid of real products; getting there; ends with the address and hours.",
  call: "Plumbers, gardeners, repairs, cleaners. The phone number is the action, big, in the hero and the nav; the area covered; the jobs they do as a short list (not icon tiles); proof in the trade's own form (insured, years, real reviews only if given); ends with the number again.",
  buy: "Makers selling products. The product with its price as the hero; the range with prices; the product in use; how it's made; delivery as plain facts; ends with the offer again.",
  hire: "Studios, freelancers, architects, consultants. The work is the page: projects with pictures, one opened up; what they do as a short list; a plain contact (email or phone) in the nav and after the work.",
  join: "Clubs, gyms, associations. What a session is like, shown; when and where as a timetable; membership options with prices; first-visit guidance; join in the hero.",
};

// What every model ships by default, so it reads as unchosen. Avoid unless the owner asks for it.
const OVERUSED = `Looks: cream or beige paper with a high-contrast serif and a clay or terracotta accent; near-black with one neon accent; a pale ground with one timid accent; a purple-to-blue gradient; a colour picked for the category (blue for plumbers, green for gardeners); a split hero with the heading left and a photo right as the reflex; a centred heading over three cards; three numbered steps; a dark footer under a huge wordmark.
Details: a small label in tracked capitals above headings (eyebrows); one italic or coloured word inside a heading; strings joined with middle dots; arrows glued to link text; emoji as icons; a card inside a card; rounded photos everywhere by habit.
Fonts as the default (only with a reason the owner would accept): Inter, Roboto, Open Sans, Lato, Poppins, Montserrat, Raleway, Nunito, Nunito Sans, Work Sans, DM Sans, Plus Jakarta Sans; and the first serif everyone picks: Playfair Display, Cormorant Garamond, DM Serif Display, Fraunces, Lora, Merriweather. Plenty of others on fonts.bunny.net: e.g. Gloock, Libre Bodoni, Alegreya, EB Garamond, Arvo, Hepta Slab, Albert Sans, Rethink Sans, Lexend, League Spartan, Antonio, Teko for headings; Hanken Grotesk, Figtree, Onest, Karla, Archivo, Manrope, Newsreader, Literata for text.
Before writing, picture the page you'd make without trying, and its obvious twist: make neither.`;

// The words are half the design.
const COPY = `Write as the owner talks across the counter: their nouns, their street, their numbers. Swap test: a heading that would work for a competitor gets rewritten with something only this business has ("Pide out of the wood oven since 2014", not "Authentic Turkish cuisine"). Headline seven words or fewer; one sentence under it; section headings say what the visitor sees or gets, never a category label ("Our story", "Services", "Why us"); about 80 words on any one screen. Never: Reimagine, Discover, Unleash, "Whether you're X or Y", "It's not just X, it's Y", "Say goodbye to", game-changer, journey, a colon in a title. Buttons say the action ("Book a table", "Call 05 59 …").`;

// What the builder checks and refuses, whatever the chat writes.
const HARD_RULES = `- Only facts the owner gave or that read_website found: no invented phone number, address, price, opening hours, review, award, number of years or client. Ask instead.
- Each page title (content.<lang>.title) under 60 characters and naming the town; description under 155 characters. One h1: the hero title. The builder writes the SEO tags, structured data, sitemap and accessibility from the content.
- Every language the owner wants is a full version of the content, written natively.
- Phone numbers written the way people of that country write them.
- No contact form unless the owner asks for one (contact section "form": true).
- No script anywhere. CSS can't load outside files; url() only for this site's /img/ photos. Colours are checked for readability and may be darkened.
- Images are ids from read_website or uploads, or https URLs the owner gave: never invented.`;

// What the chat's CSS can aim at. The page markup is fixed; its look is entirely the chat's.
const DESIGN = `With layout "custom" (the default for you) the page has no styling but a bare structure: you write all of it in theme.css. The presets exist only if the owner wants a quick start.
Fonts: any two families on fonts.bunny.net, as theme.fonts { "heading", "body" }. Colours: theme.palette { paper, ink, accent, soft } become --paper, --ink, --accent, --soft; --h and --b are the fonts.
Markup: body.l-custom > .topbar (.bar, a.brand with .brand-name or img.logo, nav.nav a, .langs, a.btn) · main > header.hero (.hero-grid, .hero-words, h1, p.lead, p.actions a.btn, a.btn--line, .hero-media img.hero-img) · section.s.s--<kind> > .wrap > h2 (kinds: services, prices, about, reviews, faq, hours, gallery, contact, custom; lists are ul.items > li.item with img.item-img, h3, p.price, p; ul.reviews li blockquote; details.qa; ul.gallery li img; table.hours; .contact; form.form) · footer.foot (.foot-grid, .foot-name, .foot-end) · a.callbar on phones.
Sections are yours too: a "custom" section is your own HTML (no script). With "bare": true it has no wrapper and no heading from the builder, so it can be any block you design (a menu laid out like a printed menu, a photo mosaic, a split banner…). The hero stays the first section and holds the page's one h1, but your CSS can make it look like anything.`;

const INSTRUCTIONS = "This is the owner's own website builder (Dozokit Sites). Call get_writing_guide first and follow how_to_work: gather what you can (read_website, view_photos, five good sites of the same kind), then send one proposal with everything decided and ask only for missing facts; the owner answers once, ideally with go. After writing, check your page with preview_site and improve it before showing it. Use only real facts. Publish only when asked. If you have a design skill such as Hallmark, use it. For domains, payments, booking, contact emails, analytics or Google Maps, call get_recipe and pass its steps on as they are. The owner may paste what they picked in the editor: a layer trail, then in brackets the path in the site JSON (for get_site and edit_site) and, for blocks you wrote, a CSS path inside it; change exactly that.";

type Rpc = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };

async function one(m: Rpc, ctx: Ctx) {
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id: m.id ?? null, result });
  switch (m.method) {
    case "initialize":
      return ok({ protocolVersion: String(m.params?.protocolVersion ?? "2025-06-18"), capabilities: { tools: {} }, serverInfo: { name: "dozokit-sites", title: "Dozokit Sites", version: "0.1.0" }, instructions: INSTRUCTIONS });
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === m.params?.name);
      if (!tool) return { jsonrpc: "2.0", id: m.id ?? null, error: { code: -32602, message: `Unknown tool ${String(m.params?.name)}` } };
      try {
        // Chat apps sometimes send an object or a list as JSON text: read it as what the tool expects.
        const args = { ...((m.params?.arguments ?? {}) as Record<string, unknown>) };
        const props = (tool.inputSchema as { properties?: Record<string, { type?: string }> }).properties ?? {};
        for (const [k, v] of Object.entries(args)) {
          if (typeof v !== "string" || !["object", "array"].includes(props[k]?.type ?? "")) continue;
          try {
            args[k] = JSON.parse(v);
          } catch {
            throw new AiError(`${k} isn't valid JSON: send it as ${props[k].type === "array" ? "a list" : "an object"}.`);
          }
        }
        const t0 = Date.now();
        const out = await tool.run(args, ctx);
        console.log(`[mcp] ${tool.name} ok ${Date.now() - t0}ms`);
        if (out instanceof Seen) return ok({ content: [...out.images.map((data) => ({ type: "image", data, mimeType: "image/jpeg" })), { type: "text", text: JSON.stringify(out.note, null, 1) }] });
        return ok({ content: [{ type: "text", text: JSON.stringify(out, null, 1) }], structuredContent: Array.isArray(out) ? { items: out } : out });
      } catch (err) {
        console.log(`[mcp] ${tool.name} refused: ${err instanceof AiError ? err.message : String(err)}`.slice(0, 300));
        if (!(err instanceof AiError)) console.error(err);
        return ok({ content: [{ type: "text", text: err instanceof AiError ? err.message : `That failed (${String((err as Error)?.message ?? err).slice(0, 200)}). Check what you sent against get_writing_guide and try again.` }], isError: true });
      }
    }
    default:
      return m.id === undefined ? null : { jsonrpc: "2.0", id: m.id, error: { code: -32601, message: `Unknown method ${m.method}` } };
  }
}

// Streamable HTTP, answered as plain JSON (no streaming needed: every tool answers at once).
export async function mcp(req: Request, ctx: Ctx) {
  if (req.method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST" } });
  const body = (await req.json().catch(() => null)) as Rpc | Rpc[] | null;
  if (!body) return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });
  const out = Array.isArray(body) ? (await Promise.all(body.map((m) => one(m, ctx)))).filter(Boolean) : await one(body, ctx);
  if (!out || (Array.isArray(out) && !out.length)) return new Response(null, { status: 202 });
  return Response.json(out, { headers: { "access-control-allow-origin": "*" } });
}
