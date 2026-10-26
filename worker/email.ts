import type { Env } from "./index";
import { setSetting, settings } from "./store";

// Each contact message is also emailed to the owner through their own Resend account, connected
// with Resend's OAuth (PKCE): this copy registers itself with Resend the first time, the owner
// approves on resend.com, and the tokens stay in this copy's database. Without a domain of their
// own, Resend sends from onboarding@resend.dev to the account's own address only: the owner
// writes to themself, which is exactly this case. Reply goes to the visitor.

const base = (env: Env) => env.RESEND_BASE ?? "https://api.resend.com";
const loopback = (origin: string) => /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(origin);

type Client = { id: string; secret?: string; redirect: string };
type Tokens = { access: string; refresh: string; exp: number };

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function client(env: Env, origin: string): Promise<Client> {
  const s = await settings(env, true);
  const redirect = `${origin}/admin`;
  const known = s.resend_client ? (JSON.parse(s.resend_client) as Client) : null;
  if (known?.redirect === redirect) return known;
  // A deployed copy is an https site: a confidential client with a secret. On this computer, a public one.
  const res = await fetch(`${base(env)}/oauth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "Dozokit Sites",
      redirect_uris: [redirect],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: loopback(origin) ? "none" : "client_secret_post",
      scope: "emails:send",
    }),
  });
  const out = (await res.json().catch(() => null)) as { client_id?: string; client_secret?: string } | null;
  if (!res.ok || !out?.client_id) throw new Error(`Resend didn't register this site builder (${res.status}).`);
  const c: Client = { id: out.client_id, secret: out.client_secret, redirect };
  await setSetting(env, "resend_client", JSON.stringify(c));
  return c;
}

// Step 1: where to send the owner. The verifier stays here, tied to the state.
export async function startResend(env: Env, origin: string) {
  const c = await client(env, origin);
  const verifier = b64(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  const state = `rs_${b64(crypto.getRandomValues(new Uint8Array(12)))}`;
  await setSetting(env, "resend_pkce", JSON.stringify({ state, verifier }));
  const q = new URLSearchParams({ client_id: c.id, response_type: "code", redirect_uri: c.redirect, scope: "emails:send", state, code_challenge: challenge, code_challenge_method: "S256" });
  return `${base(env)}/oauth/authorize?${q}`;
}

async function token(env: Env, c: Client, body: Record<string, string>) {
  const form = new URLSearchParams({ ...body, client_id: c.id, ...(c.secret ? { client_secret: c.secret } : {}) });
  const res = await fetch(`${base(env)}/oauth/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form });
  const out = (await res.json().catch(() => null)) as { access_token?: string; refresh_token?: string; expires_in?: number } | null;
  if (!res.ok || !out?.access_token || !out.refresh_token) return null;
  const t: Tokens = { access: out.access_token, refresh: out.refresh_token, exp: Date.now() + (out.expires_in ?? 900) * 1000 };
  await setSetting(env, "resend_token", JSON.stringify(t));
  return t;
}

// Step 2: back from resend.com with a code.
export async function finishResend(env: Env, code: string, state: string) {
  const s = await settings(env, true);
  const pkce = s.resend_pkce ? (JSON.parse(s.resend_pkce) as { state: string; verifier: string }) : null;
  if (!pkce || pkce.state !== state || !s.resend_client) throw new Error("That Resend connection didn't come back complete. Click Connect Resend again.");
  const c = JSON.parse(s.resend_client) as Client;
  const t = await token(env, c, { grant_type: "authorization_code", code, redirect_uri: c.redirect, code_verifier: pkce.verifier });
  await setSetting(env, "resend_pkce", null);
  if (!t) throw new Error("Resend didn't confirm the connection. Click Connect Resend again.");
  await setSetting(env, "email_last", null);
}

export async function disconnectResend(env: Env) {
  const s = await settings(env, true);
  if (s.resend_token && s.resend_client) {
    const c = JSON.parse(s.resend_client) as Client;
    const t = JSON.parse(s.resend_token) as Tokens;
    await fetch(`${base(env)}/oauth/revoke`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: t.refresh, token_type_hint: "refresh_token", client_id: c.id, ...(c.secret ? { client_secret: c.secret } : {}) }),
    }).catch(() => null);
  }
  await setSetting(env, "resend_token", null);
  await setSetting(env, "email_last", null);
}

// A valid access token, refreshed when it's about to expire. Resend rotates the refresh token on
// each use and treats a reused one as stolen, so only one request refreshes at a time: the others
// wait for its new token.
async function access(env: Env): Promise<string | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = await env.DB.prepare("select value from settings where key = 'resend_token'").first<{ value: string }>();
    if (!row) return null;
    const t = JSON.parse(row.value) as Tokens;
    if (t.exp - Date.now() > 60_000) return t.access;
    const now = Date.now();
    const got = await env.DB.prepare("insert into settings (key, value) values ('resend_lock', ?) on conflict (key) do update set value = excluded.value where cast(settings.value as integer) < ? returning key")
      .bind(String(now), now - 30_000)
      .first();
    if (got) {
      try {
        const c = JSON.parse((await settings(env, true)).resend_client!) as Client;
        return (await token(env, c, { grant_type: "refresh_token", refresh_token: t.refresh }))?.access ?? null;
      } finally {
        await env.DB.prepare("delete from settings where key = 'resend_lock'").run();
      }
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  return null;
}

export type Mail = { subject: string; text: string; replyTo?: string };

export async function sendToOwner(env: Env, mail: Mail) {
  const s = await settings(env, true);
  if (!s.resend_token || !s.notify_to) return "off";
  const bearer = await access(env);
  const res = bearer
    ? await fetch(`${base(env)}/emails`, {
        method: "POST",
        headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
        body: JSON.stringify({ from: "Your website <onboarding@resend.dev>", to: [s.notify_to], subject: mail.subject.slice(0, 200), text: mail.text, ...(mail.replyTo && { reply_to: mail.replyTo }) }),
        signal: AbortSignal.timeout(10_000),
      }).catch(() => null)
    : null;
  const status = !bearer ? "401" : res ? String(res.status) : "unreachable";
  // Kept for Settings, so a connection that stopped working shows there; written only when it changes.
  if (s.email_last !== status) await setSetting(env, "email_last", status);
  return status;
}

export function messageMail(site: string, m: { name: string; email: string; phone: string; body: string }): Mail {
  return {
    subject: `New message from ${m.name} on ${site}`,
    text: `${m.name} wrote through your website's contact form:\n\n${m.body}\n\nEmail: ${m.email}${m.phone ? `\nPhone: ${m.phone}` : ""}\n\nPress Reply to answer ${m.name}. All your messages are also in your site builder, under Messages.`,
    replyTo: m.email,
  };
}
