import analytics from "../recipes/analytics.md?raw";
import booking from "../recipes/booking.md?raw";
import contactEmail from "../recipes/contact-email.md?raw";
import googleMaps from "../recipes/google-maps.md?raw";
import ownDomain from "../recipes/own-domain.md?raw";
import payments from "../recipes/payments.md?raw";

// The answers that are always the same, whoever asks: written by hand in recipes/*.md, shown
// to the owner as written. The AI only decides that a request matches one ("when").

export type Recipe = { id: string; title: string; when: string; body: string };

function parse(md: string): Recipe {
  const m = md.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error("A recipe needs a --- header.");
  const head = Object.fromEntries(m[1].split("\n").map((l) => [l.slice(0, l.indexOf(":")).trim(), l.slice(l.indexOf(":") + 1).trim()]));
  return { id: head.id, title: head.title, when: head.when, body: m[2].trim() };
}

export const RECIPES = [ownDomain, contactEmail, analytics, payments, booking, googleMaps].map(parse);
