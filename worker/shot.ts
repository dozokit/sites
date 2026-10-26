import puppeteer from "@cloudflare/puppeteer";
import type { Env } from "./index";

// Screenshots for chat apps, which can't open pages themselves: the page they're designing, and a
// contact sheet of the photos they can use. Uses Cloudflare's browser (free plan: 10 minutes a day).

const b64 = (buf: Uint8Array) => {
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
};

export async function shoot(env: Env, url: string, opts: { width: number; height: number; full?: boolean; html?: string; probe?: string }) {
  if (!env.BROWSER) throw new Error("This builder has no browser binding, so it can't take screenshots.");
  const browser = await puppeteer.launch(env.BROWSER);
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: opts.width, height: opts.height, deviceScaleFactor: 1 });
    if (opts.html) await page.setContent(opts.html, { waitUntil: "networkidle0", timeout: 20_000 });
    else await page.goto(url, { waitUntil: "networkidle0", timeout: 20_000 });
    // Photos further down load only when a visitor scrolls near them: load them all now, or a
    // whole-page shot shows empty boxes where they go.
    if (opts.full) await page.evaluate(`Promise.all([...document.images].map((i) => (i.loading = "eager", i.complete ? 0 : new Promise((r) => (i.onload = i.onerror = r, setTimeout(r, 5000))))))`);
    // Photos further down load only when a visitor scrolls near them: load them all now, or a
    // whole-page shot shows empty boxes where they go.
    if (opts.full) await page.evaluate(`Promise.all([...document.images].map((i) => (i.loading = "eager", i.complete ? 0 : new Promise((r) => (i.onload = i.onerror = r, setTimeout(r, 5000))))))`);
    // A full page is cut at 7,000 px tall: enough for a one-page site, small enough to send.
    const clip = opts.full ? { x: 0, y: 0, width: opts.width, height: Math.min(7000, await page.evaluate("document.documentElement.scrollHeight") as number) } : undefined;
    // An optional question about the page, asked before the screenshot (e.g. is the hero's action on screen).
    const answer = opts.probe ? await page.evaluate(opts.probe) : undefined;
    const shot = (await page.screenshot({ type: "jpeg", quality: 62, ...(clip ? { clip } : {}) })) as Uint8Array;
    return { image: b64(shot), answer };
  } finally {
    await browser.close();
  }
}

// A one-off pass that lets the browser open a draft preview without the owner's cookie.
export async function previewPass(env: Env) {
  const t = crypto.randomUUID();
  await env.IMAGES.put(`shot:${t}`, "1", { expirationTtl: 120 });
  return t;
}

export async function passOk(env: Env, t: string | null) {
  return Boolean(t && (await env.IMAGES.get(`shot:${t}`)));
}

// Every photo with its id under it, on one image.
export function sheet(origin: string, ids: string[]) {
  const cells = ids.map((id, i) => `<figure><img src="${origin}/img/${encodeURIComponent(id)}"><figcaption>${i + 1}. ${id}</figcaption></figure>`).join("");
  return `<!doctype html><html><body style="margin:0;padding:12px;font:14px system-ui;background:#fff;display:grid;grid-template-columns:repeat(4,1fr);gap:12px">${cells}<style>figure{margin:0}img{width:100%;height:220px;object-fit:cover;display:block;border-radius:6px}figcaption{margin-top:4px;color:#333}</style></body></html>`;
}

// Every text on the page whose colour doesn't read on what's behind it (WCAG: 4.5, or 3 for large
// text), measured in the browser so the chat's own CSS counts too. Text over a photo is skipped.
export const CONTRAST_PROBE = `(() => {
  const rgb = (c) => (c.match(/[\\d.]+/g) || []).map(Number);
  const lum = ([r, g, b]) => [r, g, b].map((v) => (v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
  const behind = (el) => { for (let e = el; e; e = e.parentElement) { const s = getComputedStyle(e); const c = rgb(s.backgroundColor); if (s.backgroundImage !== "none" || e.tagName === "IMG" || e.querySelector(":scope > img.hero-img, :scope > picture")) return null; if (c.length && (c.length < 4 || c[3] > 0.5)) return c; } return [255, 255, 255]; };
  const out = [], seen = new Map();
  for (const el of document.querySelectorAll("body *")) {
    const text = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(" ");
    if (!text || el.closest("svg, script, style, [hidden]")) continue;
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden" || +s.opacity === 0) continue;
    const bg = behind(el); if (!bg) continue;
    const a = lum(rgb(s.color)), b = lum(bg), ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const large = parseFloat(s.fontSize) >= 24 || (parseFloat(s.fontSize) >= 18.6 && +s.fontWeight >= 700);
    if (ratio >= (large ? 3 : 4.5)) continue;
    const w = el.closest("section[id], header, footer"), where = w ? (w.id ? "#" + w.id : w.tagName.toLowerCase()) : "page";
    const key = s.color + bg, hit = seen.get(key);
    if (hit) { if (!hit.where.includes(where)) hit.where += ", " + where; continue; }
    if (seen.size >= 8) continue;
    const row = { text: text.slice(0, 40), where, color: s.color, background: "rgb(" + bg.slice(0, 3).join(", ") + ")", ratio: Math.round(ratio * 100) / 100 };
    seen.set(key, row); out.push(row);
  }
  return out;
})()`;

// Headline lines that run into each other: line height under the glyphs' own height.
export const OVERLAP_PROBE = `(() => { const h = document.querySelector("h1"); if (!h) return null; const s = getComputedStyle(h); return h.getClientRects().length && h.offsetHeight > parseFloat(s.lineHeight) * 1.5 && parseFloat(s.lineHeight) / parseFloat(s.fontSize) < 0.92 ? Math.round(parseFloat(s.lineHeight) / parseFloat(s.fontSize) * 100) / 100 : null })()`;

// A brand's colours as a visitor sees them: the logo's own pixels first, then the buttons, the
// active links and the headings, measured in the browser. Counting colours in stylesheets alone
// mostly finds the website platform's colours. Null without a browser or when the page fails.
const BRAND_PROBE = `(async () => {
  const hex = (r, g, b) => "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  const real = (r, g, b) => Math.max(r, g, b) - Math.min(r, g, b) > 40;
  const out = {}, add = (h, w) => (out[h] = (out[h] || 0) + w);
  const rgb = (c) => (c.match(/[\\d.]+/g) || []).map(Number);
  const imgs = [...document.querySelectorAll("img")];
  const logo = imgs.find((i) => /logo/i.test(i.id + i.className + i.alt + i.src)) || document.querySelector("header img, a[href='/'] img");
  if (logo) {
    try {
      await logo.decode().catch(() => {});
      const c = document.createElement("canvas"), w = (c.width = 80), h = (c.height = Math.max(1, Math.round(80 * logo.naturalHeight / logo.naturalWidth)));
      const x = c.getContext("2d"); x.drawImage(logo, 0, 0, w, h);
      const d = x.getImageData(0, 0, w, h).data, seen = {};
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128 && real(d[i], d[i + 1], d[i + 2])) { const k = hex(d[i] & 0xf0, d[i + 1] & 0xf0, d[i + 2] & 0xf0); (seen[k] = seen[k] || [0, 0, 0, 0]); seen[k][0] += d[i]; seen[k][1] += d[i + 1]; seen[k][2] += d[i + 2]; seen[k][3]++; }
      const px = Object.values(seen).sort((a, b) => b[3] - a[3]);
      const total = px.reduce((n, p) => n + p[3], 0);
      for (const p of px.slice(0, 3)) if (p[3] > total * 0.1) add(hex(p[0] / p[3], p[1] / p[3], p[2] / p[3]), 40 * p[3] / total + 10);
    } catch {}
  }
  for (const el of document.querySelectorAll("a, button, [class*=btn], [class*=button]")) {
    const s = getComputedStyle(el), b = rgb(s.backgroundColor);
    if (b.length && (b.length < 4 || b[3] > 0.5) && real(...b) && el.offsetWidth > 40) add(hex(...b), 6);
  }
  for (const el of document.querySelectorAll("nav a, header a, h1, h2, h3")) { const c = rgb(getComputedStyle(el).color); if (real(...c)) add(hex(...c), 2); }
  return { colors: Object.entries(out).sort((a, b) => b[1] - a[1]).slice(0, 8), logo: logo ? logo.currentSrc || logo.src : null };
})()`;

export async function brandSeen(env: Env, url: string): Promise<{ colors: [string, number][]; logo: string | null } | null> {
  if (!env.BROWSER) return null;
  const browser = await puppeteer.launch(env.BROWSER).catch(() => null);
  if (!browser) return null;
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(url, { waitUntil: "networkidle2", timeout: 20_000 });
    return (await page.evaluate(BRAND_PROBE)) as { colors: [string, number][]; logo: string | null };
  } catch {
    return null;
  } finally {
    await browser.close();
  }
}
