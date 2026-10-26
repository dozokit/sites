import { cleanCss, fontsOf, LAYOUTS, onAccent, styleOf, type Business, type Content, type Item, type Layout, type Section, type SiteDoc } from "./site";

// Turns the site document into finished pages. SEO is decided here once, for every site:
// title and description, canonical and hreflang, LocalBusiness data, one h1, alt text,
// no layout shift, no script needed to read the page.

export interface Extras {
  origin: string; // the address visitors use, like https://go.example.com
  edit?: boolean; // the admin preview: every editable text carries data-edit="<path>"
  analytics?: { url: string; site: string };
  nonce: string;
  base?: string; // "" for a site at the root of its address, "/<slug>" for one under the builder's address
  alts?: Record<string, string>; // the descriptions the owner gave photos in the library
}

const LABELS = {
  en: { write: "Write to us", call: "Call", directions: "Directions", review: "Leave a review", send: "Send", name: "Your name", email: "Your email", phone: "Your phone (optional)", message: "Your message", sent: "Thank you, your message is on its way.", failed: "That didn't go through. Please call us instead.", hours: "Opening hours", closed: "Closed", menu: "Menu", languages: "Language", services: "Services", prices: "Prices", about: "About", gallery: "Photos", reviews: "Reviews", contact: "Contact", hoursNav: "Hours" },
  fr: { write: "Nous écrire", call: "Appeler", directions: "Itinéraire", review: "Laisser un avis", send: "Envoyer", name: "Votre nom", email: "Votre e-mail", phone: "Votre téléphone (facultatif)", message: "Votre message", sent: "Merci, votre message est bien parti.", failed: "L’envoi n’a pas marché. Appelez-nous plutôt.", hours: "Horaires", closed: "Fermé", menu: "Menu", languages: "Langue", services: "Services", prices: "Tarifs", about: "À propos", gallery: "Photos", reviews: "Avis", contact: "Contact", hoursNav: "Horaires" },
};
export type Labels = typeof LABELS.en;
const labels = (lang: string, c: Content & { labels?: Partial<Labels> }) => ({ ...LABELS.en, ...(LABELS[lang.slice(0, 2) as "en" | "fr"] ?? {}), ...(c.labels ?? {}) });

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
const tel = (p: string) => p.replace(/[^\d+]/g, "");
export const langPath = (doc: SiteDoc, lang: string) => (lang === doc.langs[0] ? "/" : `/${lang}/`);

function text(tag: string, value: string | undefined, path: string, x: Extras, attrs = "") {
  if (!value && !x.edit) return "";
  return `<${tag}${attrs}${x.edit ? ` data-edit="${esc(path)}"` : ""}>${esc(value ?? "")}</${tag}>`;
}

function img(id: string | undefined, alt: string, path: string, x: Extras, cls = "") {
  if (!id) return x.edit ? `<div class="img-empty${cls ? " " + cls : ""}" data-edit="${esc(path)}" data-kind="image"></div>` : "";
  const src = /^https:\/\//.test(id) ? id : `/img/${encodeURIComponent(id)}`;
  alt = x.alts?.[id] || alt;
  // The hero photo is what visitors see first: it loads first. The others wait until they're near.
  const load = cls === "hero-img" ? 'fetchpriority="high"' : 'loading="lazy"';
  return `<img class="${cls}" src="${esc(src)}" alt="${esc(alt)}" ${load} decoding="async" width="1200" height="800"${x.edit ? ` data-edit="${esc(path)}" data-kind="image"` : ""}>`;
}

function items(list: Item[], base: string, x: Extras, withImage = false) {
  return list
    .map((it, i) => {
      const p = `${base}.items.${i}`;
      return `<li class="item">${withImage ? img(it.image, "", `${p}.image`, x, "item-img") : ""}${text("h3", it.title, `${p}.title`, x)}${it.price || x.edit ? text("p", it.price, `${p}.price`, x, ' class="price"') : ""}${text("p", it.text, `${p}.text`, x)}</li>`;
    })
    .join("");
}

// Opening hours as visitors read them, in the page's language: the hours section's own list when
// the AI wrote one (days and times written for that language), else the business's hours.
function hoursTable(b: Business, l: Labels, c: Content) {
  const own = c.sections.find((s): s is Extract<Section, { items: Item[] }> => s.kind === "hours" && "items" in s && Array.isArray(s.items) && s.items.length > 0);
  const rows = own ? own.items.map((it) => [it.title, it.text || l.closed]) : (b.hours ?? []).map((h) => [h.days, h.open && h.close ? `${h.open} – ${h.close}` : l.closed]);
  if (!rows.length) return "";
  return `<table class="hours"><tbody>${rows.map(([d, t]) => `<tr><th scope="row">${esc(d)}</th><td>${esc(t)}</td></tr>`).join("")}</tbody></table>`;
}

function actions(b: Business, l: Labels, contactId?: string) {
  const out: string[] = [];
  if (b.phone) out.push(`<a class="btn" href="tel:${esc(tel(b.phone))}" data-dozokit-goal="call">${esc(l.call)} ${esc(b.phone)}</a>`);
  if (contactId) out.push(`<a class="btn${b.phone ? " btn--line" : ""}" href="#${esc(contactId)}" data-dozokit-goal="write">${esc(l.write)}</a>`);
  const maps = b.google_url || (b.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${b.name} ${b.address}`)}` : "");
  if (maps) out.push(`<a class="btn btn--line" href="${esc(maps)}" rel="noopener" data-dozokit-goal="directions">${esc(l.directions)}</a>`);
  return out.length ? `<p class="actions">${out.join("")}</p>` : "";
}

function section(s: Section, lang: string, doc: SiteDoc, c: Content, x: Extras, first: boolean) {
  const base = `content.${lang}.sections.${c.sections.indexOf(s)}`;
  const l = labels(lang, c);
  const b = doc.business;
  const head = (tag: string) => text(tag, s.title, `${base}.title`, x);
  const open = `<section id="${esc(s.id)}" class="s s--${s.kind}"${x.edit ? ` data-section="${esc(base)}"` : ""}><div class="wrap">`;
  const close = `</div></section>`;
  switch (s.kind) {
    case "hero":
      return hero(s, base, doc, c, l, x, first);
    case "about":
      return `${open}${head("h2")}<div class="about">${text("p", s.text, `${base}.text`, x)}${img(s.image, s.title, `${base}.image`, x)}</div>${close}`;
    case "services":
    case "prices":
      return `${open}${head("h2")}<ul class="items">${items(s.items, base, x, s.kind === "services")}</ul>${close}`;
    case "reviews":
      return `${open}${head("h2")}<ul class="reviews">${s.items.map((it, i) => `<li><blockquote>${text("p", it.text, `${base}.items.${i}.text`, x)}</blockquote>${text("p", it.title, `${base}.items.${i}.title`, x, ' class="who"')}</li>`).join("")}</ul>${b.google_url ? `<p><a href="${esc(b.google_url)}" rel="noopener">${esc(l.review)}</a></p>` : ""}${close}`;
    case "faq":
      return `${open}${head("h2")}${s.items.map((it, i) => `<details class="qa"${x.edit ? " open" : ""}>${text("summary", it.title, `${base}.items.${i}.title`, x)}${text("p", it.text, `${base}.items.${i}.text`, x)}</details>`).join("")}${close}`;
    case "gallery":
      return `${open}${head("h2")}<ul class="gallery">${s.items.map((it, i) => `<li>${img(it.image, it.title || b.name, `${base}.items.${i}.image`, x)}</li>`).join("")}</ul>${close}`;
    case "hours":
      return `${open}${head("h2")}${hoursTable(b, l, c)}${close}`;
    case "contact": {
      const info = `<div>${b.address ? `<p>${esc(b.address)}</p>` : ""}${b.email ? `<p><a href="mailto:${esc(b.email)}">${esc(b.email)}</a></p>` : ""}${actions(b, l)}${hoursTable(b, l, c)}</div>`;
      const form = s.form
        ? `<form class="form" method="post" action="${esc(x.base ?? "")}/contact" data-sent="${esc(l.sent)}" data-failed="${esc(l.failed)}">
<label>${esc(l.name)}<input name="name" required maxlength="100" autocomplete="name"></label>
<label>${esc(l.email)}<input name="email" type="email" required maxlength="200" autocomplete="email"></label>
<label>${esc(l.phone)}<input name="phone" type="tel" maxlength="40" autocomplete="tel"></label>
<label>${esc(l.message)}<textarea name="message" required maxlength="4000" rows="5"></textarea></label>
<input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
<input type="hidden" name="lang" value="${esc(lang)}">
<button class="btn" type="submit">${esc(l.send)}</button><p class="form-status" role="status"></p></form>`
        : "";
      return `${open}${head("h2")}${text("p", s.text, `${base}.text`, x)}<div class="contact">${form}${info}</div>${close}`;
    }
    case "custom":
      // bare: the chat's own block, with no wrapper or heading from the builder.
      if ((s as { bare?: boolean }).bare) return `<section id="${esc(s.id)}" class="s s--custom s--bare"${x.edit ? ` data-section="${esc(base)}" data-edit="${esc(base)}.html" data-kind="html"` : ""}>${s.html}</section>`;
      return `${open}${head("h2")}<div class="custom"${x.edit ? ` data-edit="${esc(base)}.html" data-kind="html"` : ""}>${s.html}</div>${close}`;
  }
}

export const layoutOf = (doc: SiteDoc): Layout | "custom" => doc.theme.layout ?? "storefront";

// The first thing a visitor sees, drawn differently by each layout.
function hero(s: Extract<Section, { kind: "hero" }>, base: string, doc: SiteDoc, c: Content, l: Labels, x: Extras, first: boolean) {
  const b = doc.business;
  const words = `${text(first ? "h1" : "h2", s.title, `${base}.title`, x)}${text("p", s.text, `${base}.text`, x, ' class="lead"')}${actions(b, l, (c.sections.find((o) => o.kind === "contact" && o.form) as { id: string } | undefined)?.id)}`;
  const photo = img(s.image, `${b.name}, ${b.trade} ${b.town}`, `${base}.image`, x, "hero-img");
  const attrs = `id="${esc(s.id)}" class="hero hero--${layoutOf(doc)}${s.image ? "" : " hero--plain"}"${x.edit ? ` data-section="${esc(base)}"` : ""}`;
  switch (layoutOf(doc)) {
    case "storefront":
      return `<header ${attrs}>${photo}<div class="wrap"><div class="sign">${words}</div></div></header>`;
    case "editorial":
      return `<header ${attrs}><div class="wrap hero-words">${words}</div>${photo ? `<div class="hero-band">${photo}</div>` : ""}</header>`;
    default:
      return `<header ${attrs}><div class="wrap hero-grid"><div class="hero-words">${words}</div>${photo ? `<div class="hero-media">${photo}</div>` : ""}</div></header>`;
  }
}

const NAV: Section["kind"][] = ["services", "prices", "about", "gallery", "reviews", "hours", "contact"];

// The bar on top of every page: the logo or name, the main sections, the languages, and a Call button.
function topbar(doc: SiteDoc, lang: string, c: Content, l: Labels, x: Extras) {
  const b = doc.business;
  const brand = b.logo ? `<img class="logo" src="/img/${esc(encodeURIComponent(b.logo))}" alt="${esc(b.name)}" width="160" height="48">` : `<span class="brand-name">${esc(b.name)}</span>`;
  // One link per kind of section: three menus in a row are one "Prices" link to the first.
  const links = c.sections
    .filter((s, i, all) => NAV.includes(s.kind) && all.findIndex((o) => o.kind === s.kind) === i)
    .slice(0, 4)
    .map((s) => `<a href="#${esc(s.id)}">${esc(l[(s.kind === "hours" ? "hoursNav" : s.kind) as keyof Labels])}</a>`)
    .join("");
  const others = doc.langs.filter((o) => o !== lang);
  const langs = others.length ? `<span class="langs" aria-label="${esc(l.languages)}">${others.map((o) => `<a href="${esc((x.base ?? "") + langPath(doc, o))}" hreflang="${esc(o)}" lang="${esc(o)}">${esc(o.toUpperCase())}</a>`).join("")}</span>` : "";
  const call = b.phone ? `<a class="btn btn--small" href="tel:${esc(tel(b.phone))}" data-dozokit-goal="call">${esc(l.call)}</a>` : "";
  return `<div class="topbar"><div class="wrap bar"><a class="brand" href="${esc((x.base ?? "") + langPath(doc, lang))}">${brand}</a><nav class="nav" aria-label="${esc(l.menu)}">${links}</nav>${langs}${call}</div></div>`;
}

function footer(doc: SiteDoc, c: Content, l: Labels) {
  const b = doc.business;
  const maps = b.google_url || (b.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${b.name} ${b.address}`)}` : "");
  return `<footer class="foot"><div class="wrap foot-grid">
<div><p class="foot-name">${esc(b.name)}</p><p>${esc(b.trade)}, ${esc(b.town)}</p></div>
<div>${b.address ? `<p>${esc(b.address)}</p>` : ""}${b.phone ? `<p><a href="tel:${esc(tel(b.phone))}">${esc(b.phone)}</a></p>` : ""}${b.email ? `<p><a href="mailto:${esc(b.email)}">${esc(b.email)}</a></p>` : ""}${maps ? `<p><a href="${esc(maps)}" rel="noopener">${esc(l.directions)}</a></p>` : ""}</div>
<div>${hoursTable(b, l, c)}</div>
</div><p class="wrap foot-end">© ${new Date().getFullYear()} ${esc(b.name)}</p></footer>${b.phone ? `<a class="callbar" href="tel:${esc(tel(b.phone))}" data-dozokit-goal="call">${esc(l.call)} ${esc(b.phone)}</a>` : ""}`;
}

// schema.org LocalBusiness from real fields only: nothing invented.
function jsonLd(doc: SiteDoc, lang: string, x: Extras) {
  const b = doc.business;
  const c = doc.content[lang];
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: b.name,
    description: c.description,
    url: x.origin + langPath(doc, lang),
    ...(b.phone && { telephone: b.phone }),
    ...(b.email && { email: b.email }),
    ...(b.address && { address: { "@type": "PostalAddress", streetAddress: b.address, addressLocality: b.town } }),
    ...(b.hours?.length && { openingHours: b.hours.filter((h) => h.open && h.close).map((h) => `${h.spec ?? h.days} ${h.open}-${h.close}`) }),
    ...((b.socials?.length || b.google_url) && { sameAs: [...(b.socials ?? []), ...(b.google_url ? [b.google_url] : [])] }),
  };
  const faq = c.sections.find((s): s is Extract<Section, { items: Item[] }> => s.kind === "faq");
  const blocks = [data];
  if (faq?.items.length) blocks.push({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.items.map((q) => ({ "@type": "Question", name: q.title, acceptedAnswer: { "@type": "Answer", text: q.text ?? "" } })) } as never);
  return blocks.map((b) => `<script type="application/ld+json">${JSON.stringify(b).replace(/</g, "\\u003c")}</script>`).join("");
}

export function renderPage(doc: SiteDoc, lang: string, x: Extras) {
  const c = doc.content[lang];
  const t = doc.theme;
  const f = fontsOf(t.fonts);
  const fonts = [...new Set([f.heading, f.body])].map((n) => `${n.toLowerCase().replace(/ /g, "-")}:400,600,700`).join("|");
  const canonical = x.origin + langPath(doc, lang);
  const body = c.sections.map((s, i) => section(s, lang, doc, c, x, i === 0)).join("\n");
  return `<!doctype html>
<html lang="${esc(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(c.title)}</title>
<meta name="description" content="${esc(c.description)}">
<link rel="canonical" href="${esc(canonical)}">
${doc.langs.length > 1 ? doc.langs.map((l) => `<link rel="alternate" hreflang="${esc(l)}" href="${esc(x.origin + langPath(doc, l))}">`).join("\n") + `\n<link rel="alternate" hreflang="x-default" href="${esc(x.origin)}/">` : ""}
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(c.title)}">
<meta property="og:description" content="${esc(c.description)}">
<meta property="og:url" content="${esc(canonical)}">
${x.edit ? '<meta name="robots" content="noindex">' : ""}
<link rel="icon" href="${esc(x.base ?? "")}/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.bunny.net">
<link rel="stylesheet" href="https://fonts.bunny.net/css?family=${esc(fonts)}&display=swap">
<style>${css(doc)}</style>
${jsonLd(doc, lang, x)}
${x.analytics ? `<script defer data-site="${esc(x.analytics.site)}" src="${esc(x.analytics.url)}/t.js"></script>` : ""}
</head>
<body class="l-${layoutOf(doc)}">
${topbar(doc, lang, c, labels(lang, c), x)}
<main>
${body}
</main>
${footer(doc, c, labels(lang, c))}
<script nonce="${esc(x.nonce)}">${FORM_JS}</script>
</body>
</html>`;
}

// The contact form works without this (a plain POST to /contact); with it, it stays on the page.
const FORM_JS = `document.querySelectorAll("form.form").forEach(function(f){f.addEventListener("submit",function(e){e.preventDefault();var s=f.querySelector(".form-status"),b=f.querySelector("button");b.disabled=true;fetch(f.action,{method:"POST",body:new FormData(f),headers:{accept:"application/json"}}).then(function(r){if(!r.ok)throw 0;s.textContent=f.dataset.sent;f.reset();if(window.dozokit)window.dozokit("contact_sent")}).catch(function(){s.textContent=f.dataset.failed}).finally(function(){b.disabled=false})})})`;

function css(doc: SiteDoc) {
  const { corners } = doc.theme;
  // Checked again here, so sites made before a fix to the check read well too.
  const p = styleOf(doc.theme)?.palette ?? doc.theme.palette;
  const f = fontsOf(doc.theme.fonts);
  const r = corners === "round" ? "14px" : "2px";
  return `:root{--paper:${p.paper};--ink:${p.ink};--accent:${p.accent};--on-accent:${onAccent(p)};--soft:${p.soft};--r:${r};--h:"${f.heading}",Georgia,serif;--b:"${f.body}",system-ui,sans-serif;--line:color-mix(in oklab,var(--ink) 14%,transparent)}
${STRUCTURE}
${layoutOf(doc) === "custom" ? "" : `${BASE}\n${LAYOUT_CSS[layoutOf(doc) as Layout]}`}
${cleanCss(doc.theme.css) ?? ""}`;
}

// What every page needs whatever its design: no overflow, readable forms, the hidden robot trap,
// keyboard focus, the Call bar on phones. A chat's own design ("custom") starts from this only.
const STRUCTURE = `*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--b)}h1,h2,h3{font-family:var(--h)}a{color:inherit;text-decoration-color:var(--accent)}img{max-width:100%;height:auto;display:block}
.form{display:grid;gap:12px}.form label{display:grid;gap:4px}.form input,.form textarea{font:inherit}.form .hp{position:absolute;left:-9999px}
@media (min-width:761px){.callbar{display:none!important}}.callbar{display:none}@media (max-width:760px){.callbar{display:flex;position:fixed;left:12px;right:12px;bottom:12px;z-index:20;justify-content:center;align-items:center;min-height:52px;border-radius:999px;background:var(--accent);color:var(--on-accent);font-weight:700;text-decoration:none}body{padding-bottom:76px}}
:focus-visible{outline:3px solid var(--accent);outline-offset:3px}@media (prefers-reduced-motion:no-preference){html{scroll-behavior:smooth}}`;

// What every layout shares: type, buttons, sections, cards, forms, header, footer.
const BASE = `*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}body{margin:0;background:var(--paper);color:var(--ink);font:17px/1.65 var(--b)}
h1,h2,h3{font-family:var(--h);line-height:1.12;margin:0 0 .5em;text-wrap:balance;font-weight:700}h1{font-size:clamp(2.2rem,6.5vw,4rem)}h2{font-size:clamp(1.7rem,4vw,2.5rem)}h3{font-size:1.15rem}
p{margin:0 0 1em;max-width:62ch}a{color:inherit;text-decoration-color:var(--accent);text-underline-offset:.18em}img{max-width:100%;height:auto;display:block;border-radius:var(--r)}
.wrap{max-width:1120px;margin:0 auto;padding:0 20px}.s{padding:80px 0}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:50px;padding:0 24px;border-radius:var(--r);background:var(--accent);color:var(--on-accent);font:600 1rem var(--b);text-decoration:none;border:0;cursor:pointer}.btn:hover{filter:brightness(1.08)}
.btn--line{background:transparent;color:inherit;box-shadow:inset 0 0 0 2px currentColor}.btn--small{min-height:40px;padding:0 16px;font-size:.92rem}
.actions{display:flex;flex-wrap:wrap;gap:12px;margin:28px 0 0}.lead{font-size:1.2rem}
.topbar{position:sticky;top:0;z-index:10;background:color-mix(in oklab,var(--paper) 94%,transparent);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
.bar{display:flex;align-items:center;gap:20px;min-height:64px}.brand{text-decoration:none;margin-right:auto}.brand-name{font:700 1.15rem var(--h)}.logo{height:44px;width:auto;border-radius:0}
.nav{display:flex;gap:22px;font-size:.95rem}.nav a{text-decoration:none}.nav a:hover{text-decoration:underline}.langs{display:flex;gap:10px;font-weight:600;font-size:.9rem}.langs a{text-decoration:none}
.items{list-style:none;padding:0;margin:32px 0 0;display:grid;gap:24px;grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}.item h3{margin-top:14px}.item-img{aspect-ratio:4/3;object-fit:cover;width:100%}.price{font-weight:700;color:var(--accent);margin:0 0 .4em}
.about{display:grid;gap:40px;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));align-items:center}.about img{aspect-ratio:4/5;object-fit:cover;width:100%}
.reviews{list-style:none;padding:0;margin:32px 0 0;display:grid;gap:24px;grid-template-columns:repeat(auto-fill,minmax(260px,1fr))}.reviews blockquote{margin:0;font:400 1.2rem/1.5 var(--h)}.who{font-weight:600;margin-top:12px}
.qa{border-top:1px solid var(--line);padding:16px 0}.qa summary{font-weight:600;cursor:pointer}
.gallery{list-style:none;padding:0;margin:32px 0 0;display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(200px,1fr))}.gallery img{aspect-ratio:1;object-fit:cover;width:100%}
.hours{border-collapse:collapse;margin:8px 0 16px}.hours th{text-align:left;padding:5px 28px 5px 0;font-weight:600}.hours td{padding:5px 0}
.contact{display:grid;gap:48px;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));margin-top:24px}.form{display:grid;gap:14px}.form label{display:grid;gap:6px;font-weight:600;font-size:.95rem}
.form input,.form textarea{font:inherit;padding:12px;border-radius:var(--r);border:1px solid color-mix(in oklab,var(--ink) 30%,transparent);background:var(--paper);color:var(--ink)}.form .hp{position:absolute;left:-9999px}
.foot{background:var(--ink);color:var(--paper);padding:56px 0 24px;margin-top:0}.foot a{color:var(--paper)}.foot-grid{display:grid;gap:32px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}.foot p{margin:0 0 .4em}.foot-name{font:700 1.3rem var(--h)}.foot-end{opacity:.7;font-size:.85rem;margin-top:32px}.foot .hours{margin:0}
.callbar{display:none}.img-empty{aspect-ratio:3/2;border:2px dashed color-mix(in oklab,var(--ink) 25%,transparent);border-radius:var(--r)}
.hero-img{width:100%;object-fit:cover}
@media (max-width:760px){.nav{display:none}.s{padding:56px 0}.callbar{display:flex;position:fixed;left:12px;right:12px;bottom:12px;z-index:20;justify-content:center;align-items:center;min-height:52px;border-radius:999px;background:var(--accent);color:var(--on-accent);font-weight:700;text-decoration:none;box-shadow:0 8px 24px color-mix(in oklab,var(--ink) 30%,transparent)}body{padding-bottom:76px}.topbar .btn{display:none}}
:focus-visible{outline:3px solid var(--accent);outline-offset:3px}@media (prefers-reduced-motion:no-preference){html{scroll-behavior:smooth}}`;

// Each layout's own structure on top of the shared base.
const LAYOUT_CSS: Record<Layout, string> = {
  // A shop sign over a full-width photo.
  storefront: `.hero--storefront{position:relative;min-height:min(78vh,720px);display:flex;align-items:flex-end;padding:120px 0 48px;color:#fff;overflow:hidden}
.hero--storefront .hero-img{position:absolute;inset:0;height:100%;border-radius:0}
.hero--storefront::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 30%,color-mix(in oklab,var(--ink) 75%,transparent))}
.hero--storefront .wrap{position:relative;z-index:1;width:100%}.sign{max-width:640px;background:var(--accent);padding:32px 36px;border-radius:var(--r)}.sign h1{color:var(--on-accent)}.sign .btn{background:var(--on-accent);color:var(--accent)}.sign .btn--line{background:transparent;color:var(--on-accent)}
.hero--plain{min-height:auto;background:var(--soft);color:var(--ink)}.hero--plain::after{display:none}
.s:nth-of-type(even){background:var(--soft)}
.s--services .item{position:relative}.s--services .item:has(img) h3{position:absolute;left:12px;bottom:12px;margin:0;background:var(--paper);padding:6px 12px;border-radius:var(--r)}.s--services .item:has(img) p{display:none}`,
  // Words beside an arched photo.
  split: `.hero--split{padding:72px 0 56px}.hero-grid{display:grid;gap:48px;grid-template-columns:1.1fr .9fr;align-items:center}
.hero--split .hero-img{aspect-ratio:4/5;border-radius:999px 999px var(--r) var(--r)}.hero--split h1{font-size:clamp(2.4rem,6vw,4.4rem)}
.s:nth-of-type(odd){background:var(--soft)}.item-img{border-radius:999px 999px var(--r) var(--r);aspect-ratio:4/5}
.about img{border-radius:var(--r) var(--r) 999px 999px}
@media (max-width:760px){.hero-grid{grid-template-columns:1fr}.hero-media{order:-1;max-width:320px}}`,
  // The phone number first, on a strong colour.
  trade: `.hero--trade{background:var(--accent);color:var(--on-accent);padding:72px 0}.hero-grid{display:grid;gap:40px;grid-template-columns:1fr 1fr;align-items:center}
.hero--trade .btn{background:var(--on-accent);color:var(--accent);min-height:58px;font-size:1.1rem}.hero--trade .btn--line{background:transparent;color:var(--on-accent)}
.hero--trade .hero-img{aspect-ratio:4/3;border:6px solid #fff;box-shadow:0 20px 40px color-mix(in oklab,var(--ink) 35%,transparent)}
.s--services .items{gap:0;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));border-top:3px solid var(--accent)}.s--services .item{padding:24px 24px 24px 0;border-bottom:1px solid var(--line)}.s--services .item-img{display:none}
.s:nth-of-type(odd):not(.hero){background:var(--soft)}
@media (max-width:760px){.hero-grid{grid-template-columns:1fr}}`,
  // Large centred type, then a wide photo band.
  editorial: `.hero--editorial{padding:96px 0 0;text-align:center}.hero--editorial .hero-words{max-width:880px}.hero--editorial p{margin-left:auto;margin-right:auto}.hero--editorial .actions{justify-content:center}
.hero--editorial h1{font-size:clamp(2.6rem,8vw,5.4rem);font-weight:400;letter-spacing:-.02em}.hero-band{margin-top:64px}.hero-band .hero-img{aspect-ratio:21/9;border-radius:0;max-height:620px}
h2{font-weight:400}.s{border-top:1px solid var(--line)}.s > .wrap > h2{max-width:720px}.items{gap:48px}.item-img{aspect-ratio:3/4}`,
  // Rounded colour panels.
  soft: `.hero--soft{padding:40px 0}.hero--soft .hero-grid{display:grid;gap:40px;grid-template-columns:1fr 1fr;align-items:center;background:var(--soft);border-radius:40px;padding:56px}
.hero--soft .hero-img{aspect-ratio:1;border-radius:48% 52% 45% 55%/55% 45% 55% 45%}.btn{border-radius:999px}
.s > .wrap{background:var(--soft);border-radius:40px;padding:56px}.s{padding:20px 0}.s--hero > .wrap{background:none}
.items .item,.reviews li{background:var(--paper);border-radius:28px;padding:20px}.item-img{border-radius:20px}
@media (max-width:760px){.hero--soft .hero-grid,.s > .wrap{grid-template-columns:1fr;padding:32px 24px;border-radius:28px}}`,
};

export function sitemap(doc: SiteDoc, origin: string, lastmod: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${doc.langs
    .map((l) => `<url><loc>${esc(origin + langPath(doc, l))}</loc><lastmod>${lastmod}</lastmod>${doc.langs.length > 1 ? doc.langs.map((o) => `<xhtml:link rel="alternate" hreflang="${esc(o)}" href="${esc(origin + langPath(doc, o))}"/>`).join("") : ""}</url>`)
    .join("\n")}\n</urlset>\n`;
}

export function llms(doc: SiteDoc, origin: string) {
  const b = doc.business;
  return [`# ${b.name}`, "", `> ${doc.content[doc.langs[0]].description}`, "", `${b.trade} in ${b.town}.`, b.address && `Address: ${b.address}`, b.phone && `Phone: ${b.phone}`, b.hours?.length ? `Opening hours: ${b.hours.map((h) => `${h.days} ${h.open && h.close ? `${h.open}-${h.close}` : "closed"}`).join("; ")}` : "", "", ...doc.langs.map((l) => `- [${doc.content[l].title}](${origin + langPath(doc, l)})`)]
    .filter((v, i, all) => v || (v === "" && all[i - 1]))
    .join("\n") + "\n";
}

// The site's icon until the owner adds a logo: its initial on its accent colour.
export function favicon(doc: SiteDoc) {
  const p = doc.theme.palette;
  const letter = esc([...doc.business.name.trim()][0]?.toUpperCase() ?? "•");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="${doc.theme.corners === "round" ? 14 : 2}" fill="${p.accent}"/><text x="32" y="44" font-family="system-ui,sans-serif" font-size="36" font-weight="700" text-anchor="middle" fill="${p.paper}">${letter}</text></svg>`;
}
