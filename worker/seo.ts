import type { Section, SiteDoc } from "./site";

// The checks run before every publish, the same for every site: what Google and AI assistants
// need to find a local business. "fix" blocks nothing; it tells the owner what's missing.

export type Check = { ok: boolean; label: string; fix?: string };

export function checks(doc: SiteDoc): Check[] {
  const b = doc.business;
  const out: Check[] = [];
  const add = (ok: boolean, label: string, fix: string) => out.push(ok ? { ok, label } : { ok, label, fix });
  for (const lang of doc.langs) {
    const c = doc.content[lang];
    const tag = doc.langs.length > 1 ? ` (${lang})` : "";
    const lower = (s: string) => s.toLowerCase();
    add(c.title.length > 10 && c.title.length <= 60, `Page title fits in Google's results${tag}`, `Make it 60 characters or less: it's ${c.title.length} now.`);
    add(lower(c.title).includes(lower(b.town)), `Page title names your town${tag}`, `Add "${b.town}" to the page title: people search a trade and a town.`);
    add(c.description.length >= 70 && c.description.length <= 160, `Description fits under the title in Google${tag}`, `Write 70 to 160 characters: it's ${c.description.length} now.`);
    add(c.sections[0]?.kind === "hero", `One main heading${tag}`, "Put a hero section first: its title is the page's main heading.");
    const imgs = c.sections.flatMap((s: Section) => [("image" in s && s.image) || null, ...("items" in s ? s.items.map((i) => i.image ?? null) : [])]).filter(Boolean);
    add(imgs.length > 0, `At least one photo${tag}`, "Add a photo of your work, your shop or your team: pages with photos get more clicks.");
    add(c.sections.some((s) => s.kind === "contact"), `A way to reach you${tag}`, "Add a contact section with your phone and address: ask Claude.");
  }
  add(Boolean(b.phone), "Phone number", "Add your phone number: most local customers call.");
  add(Boolean(b.address), "Address", "Add your address so Google can show you on the map. Working at customers' homes? Add the area you cover instead.");
  add(Boolean(b.hours?.length), "Opening hours", "Add your opening hours: Google shows them next to your name.");
  add(Boolean(b.google_url), "Google Business Profile", "Link your Google Business Profile: it's what shows on Google Maps. Don't have one? Ask Claude \"how do I get on Google Maps\".");
  return out;
}
