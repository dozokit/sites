import { fontsOf, type SiteDoc } from "./site";

// Design warnings for a chat app's draft, returned with each preview: the defaults that make a page
// read as generated. Never blocking; the chat decides. After the Hallmark design skill's floor.

const OVERUSED_FONTS = ["Inter", "Roboto", "Open Sans", "Lato", "Poppins", "Montserrat", "Raleway", "Nunito", "Nunito Sans", "Work Sans", "DM Sans", "Plus Jakarta Sans", "Playfair Display", "Cormorant Garamond", "DM Serif Display", "Fraunces", "Lora", "Merriweather"];
const GENERIC_HEADS = /^(services|our services|nos services|about|about us|à propos|a propos|our story|notre histoire|why us|pourquoi nous|features|welcome|bienvenue)$/i;
const GENERATED = /\b(reimagine|unleash|discover the|whether you'?re|it'?s not just|say goodbye to|game[- ]changer|journey|elevate your|découvrez|laissez-vous)\b/i;
const words = (s = "") => s.split(/\s+/).filter(Boolean).length;

export type Low = { text: string; where: string; color: string; background: string; ratio: number };

export function warnings(doc: SiteDoc, probe?: { actionVisible?: boolean; lowContrast?: Low[]; tightHeadline?: number }) {
  const out: string[] = [];
  const f = fontsOf(doc.theme.fonts);
  for (const face of new Set([f.heading, f.body])) if (OVERUSED_FONTS.includes(face)) out.push(`Font "${face}" is one every model picks first: choose another unless the owner wants it.`);
  const css = doc.theme.css ?? "";
  if (doc.theme.layout === "custom" && css.trim().length < 200) out.push("The layout is custom but the site has almost no CSS of yours, so the page is nearly unstyled: send your CSS with set_style (css).");
  if (/transition\s*:\s*all/i.test(css)) out.push("transition: all animates everything: name the properties (transform, opacity).");
  if (/text-transform\s*:\s*uppercase/i.test(css)) out.push("Uppercase labels (tracked capitals) are a generated-page tell: use sentence case a step smaller.");
  if (/linear-gradient\([^)]*(#6[0-9a-f]{5}|#7[0-9a-f]{5}|purple|violet)[^)]*(blue|#3[0-9a-f]{5}|#2[0-9a-f]{5})/i.test(css)) out.push("A purple-to-blue gradient reads as generated.");
  const p = doc.theme.palette;
  if (/^#f[0-9a-f][e-f][0-9a-f][e-f][0-9a-f]$/i.test(p.paper) && /^#(c|d)[0-9a-f]{5}$/i.test(p.accent) && parseInt(p.accent.slice(3, 5), 16) < 0x90) out.push("Cream paper with a clay accent is the most common generated palette.");
  for (const lang of doc.langs) {
    const c = doc.content[lang];
    const hero = c.sections.find((s) => s.kind === "hero") as { title: string; text?: string } | undefined;
    if (hero && words(hero.title) > 9) out.push(`(${lang}) The headline has ${words(hero.title)} words: seven or fewer reads at a glance.`);
    if (hero && words(hero.text) > 25) out.push(`(${lang}) The sentence under the headline has ${words(hero.text)} words: aim for twelve to twenty.`);
    for (const s of c.sections) if (GENERIC_HEADS.test(s.title.trim())) out.push(`(${lang}) "${s.title}" is a category label: say what the visitor sees or gets.`);
    const all = JSON.stringify(c);
    const hit = all.match(GENERATED);
    if (hit) out.push(`(${lang}) "${hit[0]}" is generated-copy language: say it the owner's way.`);
  }
  // Unreadable text comes first: it's the one warning that isn't a matter of taste.
  for (const l of probe?.lowContrast ?? []) out.unshift(`Unreadable: "${l.text}" in ${l.where} is ${l.color} on ${l.background} (contrast ${l.ratio}, needs 4.5, or 3 for large text). Fix the colour in your CSS, then preview again.`);
  if (probe?.tightHeadline) out.push(`The headline's lines are set at ${probe.tightHeadline} of the font size, so commas and accents run into the next line: use 0.92 or more, or one line.`);
  if (probe?.actionVisible === false) out.push("The hero's action isn't visible on a 1280×800 screen without scrolling.");
  return out;
}

export const REVIEW = [
  "Seen before: does this page, or any section, read like a template or a site a model would make for this prompt? Name where.",
  "Carried: does the idea run through the whole page, or stop after the hero? Is there one thing worth looking at on every screen?",
];
