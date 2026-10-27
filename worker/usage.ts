import { AiError } from "./doc";
import type { Env } from "./index";
import { settings } from "./store";

// Today's use of the owner's Cloudflare account against the free plan (every limit resets at
// 00:00 UTC and counts the whole account, not only this builder). Requests and database rows come
// from Cloudflare's analytics, through a read-only token the owner pastes once; browser time is
// counted by the builder itself.

export const LIMITS = { requests: 100_000, rows_read: 5_000_000, rows_written: 100_000, browser_minutes: 10 };
export const TOKEN_LINK = `https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=${encodeURIComponent(JSON.stringify([{ key: "account_analytics", type: "read" }]))}&accountId=*&zoneId=all&name=Dozokit%20Sites%20usage`;

async function cf<T>(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" } });
  const out = (await res.json().catch(() => ({}))) as { success?: boolean; result?: T; data?: T; errors?: { message: string }[] };
  if (!res.ok || out.errors?.length) throw new AiError(`Cloudflare refused the usage token (${out.errors?.[0]?.message ?? res.status}). Create a new one with the link, then paste it again.`);
  return (out.result ?? out.data) as T;
}

export async function cloudflareUse(token: string, day: string) {
  const [account] = await cf<{ id: string }[]>(token, "/accounts?per_page=1");
  if (!account) throw new AiError("That token doesn't reach any Cloudflare account. Create it with the link, for your account.");
  const q = await cf<{ viewer: { accounts: { w: { sum: { requests: number } }[]; d: { sum: { rowsRead: number; rowsWritten: number } }[] }[] } }>(token, "/graphql", {
    method: "POST",
    body: JSON.stringify({
      query: `query($a: string!, $from: Time!, $day: Date!) { viewer { accounts(filter: { accountTag: $a }) {
        w: workersInvocationsAdaptive(limit: 1, filter: { datetime_geq: $from }) { sum { requests } }
        d: d1AnalyticsAdaptiveGroups(limit: 1, filter: { date_geq: $day }) { sum { rowsRead rowsWritten } } } } }`,
      variables: { a: account.id, from: `${day}T00:00:00Z`, day },
    }),
  });
  const acc = q.viewer.accounts[0];
  return { requests: acc?.w[0]?.sum.requests ?? 0, rows_read: acc?.d[0]?.sum.rowsRead ?? 0, rows_written: acc?.d[0]?.sum.rowsWritten ?? 0 };
}

export async function usage(env: Env) {
  const day = new Date().toISOString().slice(0, 10);
  const b = await env.DB.prepare("select ms from browser_use where day = ?").bind(day).first<{ ms: number }>();
  const token = (await settings(env, true)).cloudflare_token;
  const out = { day, browser_minutes: Math.round((b?.ms ?? 0) / 6000) / 10, limits: LIMITS, token_link: TOKEN_LINK, connected: Boolean(token) };
  if (!token) return out;
  try {
    return { ...out, ...(await cloudflareUse(token, day)) };
  } catch (err) {
    return { ...out, error: (err as Error).message };
  }
}
